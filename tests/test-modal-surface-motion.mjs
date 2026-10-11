import assert from 'node:assert/strict';
import test from 'node:test';
import { createModalSurfaceMotion } from '../js/modal-surface-motion.js';

function fakeStyle() {
  const styles = new Map();
  return {
    getPropertyValue: name => styles.get(name)?.value || '',
    getPropertyPriority: name => styles.get(name)?.priority || '',
    setProperty: (name, value, priority = '') => styles.set(name, { value, priority }),
    removeProperty: name => styles.delete(name),
  };
}

function fixture({ dialog = false, reducedMotion = false, singleSurface = false } = {}) {
  let time = 0;
  let nextHandle = 1;
  const frames = new Map();
  const attributes = new Map();
  let surface = {
    style: fakeStyle(),
    getBoundingClientRect: () => ({ left: 100, top: 100, width: 400, height: 300 }),
  };
  let showCount = 0;
  let closeCount = 0;
  const overlay = {
    tagName: dialog ? 'DIALOG' : 'DIV', hidden: !dialog, open: false,
    inert: false, dataset: {}, style: fakeStyle(),
    getBoundingClientRect: surface.getBoundingClientRect,
    querySelector: () => surface,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
    show() { this.open = true; showCount += 1; },
    close() { this.open = false; closeCount += 1; },
  };
  if (singleSurface) surface = overlay;
  const motion = createModalSurfaceMotion({
    overlay, surface, reducedMotion,
    now: () => time,
    requestFrame: callback => { const handle = nextHandle++; frames.set(handle, callback); return handle; },
    cancelFrame: handle => frames.delete(handle),
  });
  function tick(milliseconds = 16) {
    time += milliseconds;
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(time);
  }
  return {
    overlay, surface, attributes, frames, motion, tick,
    opacity: () => Number(overlay.style.getPropertyValue('opacity') || 1),
    settle: () => { for (let count = 0; frames.size && count < 100; count += 1) tick(); assert.equal(frames.size, 0); },
    nativeCounts: () => ({ showCount, closeCount }),
  };
}

test('show exposes immediately and settles without overshoot in approximately 300ms', () => {
  const f = fixture();
  f.motion.show();
  assert.equal(f.overlay.hidden, false);
  assert.equal(f.overlay.inert, false);
  assert.equal(f.overlay.dataset.modalMotionState, 'start');
  assert.equal(f.opacity(), 0);
  assert.equal(f.frames.size, 1);
  let previous = 0;
  for (let count = 0; count < 18; count += 1) {
    f.tick();
    assert.ok(f.opacity() >= previous);
    assert.ok(f.opacity() <= 1);
    previous = f.opacity();
  }
  f.tick();
  assert.equal(f.frames.size, 0);
  assert.equal(f.overlay.dataset.modalMotionState, 'open');
  assert.equal(f.surface.style.getPropertyValue('translate'), '');
});

test('retargeting retains the presented position and opening velocity', () => {
  const f = fixture();
  f.motion.show();
  f.tick(32);
  const beforeHide = f.opacity();
  let staleCallbackCount = 0;
  f.motion.hide({ onHidden: () => { staleCallbackCount += 1; } });
  assert.equal(f.opacity(), beforeHide, 'retarget must not jump to another presentation value');
  assert.equal(f.overlay.inert, true);
  assert.equal(f.attributes.get('aria-hidden'), 'true');
  assert.equal(f.frames.size, 1);
  f.tick(8);
  assert.ok(f.opacity() > beforeHide, 'existing positive velocity continues briefly after direction changes');
  f.tick(32);
  const beforeReopen = f.opacity();
  f.motion.show();
  assert.equal(f.opacity(), beforeReopen);
  assert.equal(f.overlay.inert, false);
  assert.equal(f.attributes.has('aria-hidden'), false);
  assert.equal(f.frames.size, 1, 'reversal keeps one frame scheduler');
  f.tick(8);
  assert.ok(f.opacity() < beforeReopen, 'existing negative velocity survives reopening');
  f.settle();
  assert.equal(staleCallbackCount, 0);
  assert.equal(f.motion.isOpen(), true);
  assert.equal(f.overlay.hidden, false);
});

test('close completion fires once; finish cancels frames and restores original styles', () => {
  const f = fixture();
  f.surface.style.setProperty('transform', 'translate(-80px, 15px) scale(0.9)');
  f.surface.style.setProperty('translate', '3px 4px', 'important');
  f.surface.style.setProperty('scale', '0.95');
  f.surface.style.setProperty('opacity', '0.8');
  f.motion.show({ origin: { x: 50, y: 80 } });
  assert.equal(f.surface.style.getPropertyValue('transform'), 'translate(-80px, 15px) scale(0.9)');
  f.tick();
  f.motion.finish();
  assert.equal(f.frames.size, 0);
  assert.equal(f.surface.style.getPropertyValue('translate'), '3px 4px');
  assert.equal(f.surface.style.getPropertyPriority('translate'), 'important');
  assert.equal(f.surface.style.getPropertyValue('scale'), '0.95');
  assert.equal(f.surface.style.getPropertyValue('opacity'), '0.8');
  let completions = 0;
  f.motion.hide({ onHidden: () => { completions += 1; } });
  assert.equal(f.overlay.hidden, false);
  f.settle();
  assert.equal(f.overlay.hidden, true);
  assert.equal(f.overlay.dataset.modalMotionState, 'closed');
  assert.equal(completions, 1);
  f.motion.finish();
  assert.equal(completions, 1);
});

test('native dialog remains open through closing and reuses show on reversal', () => {
  const f = fixture({ dialog: true });
  f.motion.show();
  assert.equal(f.overlay.open, true);
  f.motion.finish();
  f.motion.hide();
  assert.equal(f.overlay.open, true);
  f.tick();
  f.motion.show();
  assert.deepEqual(f.nativeCounts(), { showCount: 1, closeCount: 0 });
  f.settle();
  f.motion.hide();
  f.settle();
  assert.deepEqual(f.nativeCounts(), { showCount: 1, closeCount: 1 });
  assert.equal(f.overlay.open, false);
});

test('reduced motion commits immediately and invalidates interrupted callbacks', () => {
  let reduce = false;
  const f = fixture({ reducedMotion: () => reduce });
  f.motion.show();
  f.tick();
  let stale = 0;
  f.motion.hide({ onHidden: () => { stale += 1; } });
  reduce = true;
  f.motion.show();
  assert.equal(f.frames.size, 0);
  assert.equal(f.overlay.dataset.modalMotionState, 'open');
  assert.equal(stale, 0);
  let closed = 0;
  f.motion.hide({ onHidden: () => { closed += 1; } });
  assert.equal(f.frames.size, 0);
  assert.equal(f.overlay.hidden, true);
  assert.equal(closed, 1);
});

test('disposing commits logical state without running pending callbacks', () => {
  const f = fixture();
  f.motion.show();
  f.tick();
  let closed = 0;
  f.motion.hide({ onHidden: () => { closed += 1; } });
  f.motion.dispose();
  assert.equal(f.frames.size, 0);
  assert.equal(f.overlay.hidden, true);
  assert.equal(closed, 0);
  assert.equal(f.motion.show(), false);
  assert.equal(f.motion.isOpen(), false);
});

test('computed percentage centering and paired CSS changes remain composed during motion', t => {
  const f = fixture({ dialog: true, singleSurface: true });
  f.surface.cssTranslate = '-50% -50%';
  const previousComputedStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = element => ({
    translate: element.style.getPropertyValue('translate') || element.cssTranslate || 'none',
    scale: element.style.getPropertyValue('scale') || 'none',
    opacity: element.style.getPropertyValue('opacity') || '1',
  });
  t.after(() => {
    if (previousComputedStyle) globalThis.getComputedStyle = previousComputedStyle;
    else delete globalThis.getComputedStyle;
  });
  f.motion.show();
  assert.equal(f.surface.style.getPropertyValue('translate'), 'calc(-50% + 0px) calc(-50% + 12px)');
  f.tick();
  assert.match(f.surface.style.getPropertyValue('translate'), /^calc\(-50% \+ 0px\) calc\(-50% \+/);
  // The pairing class moves the dialog's left edge to a supplied pixel position.
  f.surface.cssTranslate = '0px -50%';
  f.tick();
  assert.match(f.surface.style.getPropertyValue('translate'), /^calc\(0px \+ 0px\) calc\(-50% \+/);
  f.motion.hide();
  f.surface.cssTranslate = 'calc(-50% + 4px) -50%';
  f.tick();
  assert.match(f.surface.style.getPropertyValue('translate'), /^calc\(calc\(-50% \+ 4px\) \+ 0px\)/);
  f.motion.finish();
  assert.equal(f.surface.style.getPropertyValue('translate'), '');
  assert.equal(f.surface.cssTranslate, 'calc(-50% + 4px) -50%');
});

test('overlay and scrim fade together without multiplying child opacity', () => {
  const f = fixture();
  f.overlay.style.setProperty('opacity', '0.9', 'important');
  f.surface.style.setProperty('opacity', '0.8');
  f.motion.show();
  assert.equal(f.opacity(), 0);
  assert.equal(f.surface.style.getPropertyValue('opacity'), '0.8');
  f.tick(64);
  assert.ok(f.opacity() > 0 && f.opacity() < 0.9);
  f.motion.finish();
  assert.equal(f.opacity(), 0.9);
  f.motion.hide();
  f.tick(64);
  assert.ok(f.opacity() > 0 && f.opacity() < 0.9);
  assert.equal(f.overlay.hidden, false, 'fading scrim stays mounted until opacity settles');
  assert.equal(f.surface.style.getPropertyValue('opacity'), '0.8');
  f.settle();
  assert.equal(f.overlay.hidden, true);
  assert.equal(f.overlay.style.getPropertyValue('opacity'), '0.9');
  assert.equal(f.overlay.style.getPropertyPriority('opacity'), 'important');
});


// These stubs expose sampled CSS values, not a real CSS engine or keyframe clock.
// Every attempted style write is retained, including values a browser may reject.
function trackedStyle(writes, owner) {
  const values = new Map();
  return {
    getPropertyValue: name => values.get(name)?.value || '',
    getPropertyPriority: name => values.get(name)?.priority || '',
    setProperty(name, value, priority = '') {
      writes.push({ owner, name, value: String(value), priority });
      values.set(name, { value: String(value), priority });
    },
    removeProperty(name) { values.delete(name); },
  };
}

function namedFixture(t, { reducedMotion = false, noAnimations = false, noScheduler = false } = {}) {
  let time = 0;
  let handle = 0;
  let active = true;
  const frames = new Map();
  const writes = [];
  const attributes = new Map();
  const css = { scale: '0.94', opacity: '0', translate: 'none' };
  const named = {
    animationName: 'modal-pop', playState: 'running', cancels: 0,
    cancel() { this.cancels += 1; this.playState = 'idle'; active = false; },
  };
  const unrelated = [
    { animationName: 'other-effect', cancels: 0, cancel() { this.cancels += 1; } },
    { cancels: 0, cancel() { this.cancels += 1; } },
  ];
  const surface = {
    style: trackedStyle(writes, 'surface'),
    getBoundingClientRect: () => ({ left: 100, top: 100, width: 400, height: 300 }),
    getAnimations: noAnimations ? undefined : () => [named, ...unrelated],
  };
  const overlay = {
    tagName: 'DIV', hidden: true, inert: false, dataset: {},
    style: trackedStyle(writes, 'overlay'), querySelector: () => surface,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: name => attributes.delete(name),
  };
  const priorComputed = globalThis.getComputedStyle;
  // Each getter remains live so copying before animation.cancel() matters.
  const computedValue = (element, name) => {
    const inline = element.style.getPropertyValue(name);
    if (element === surface && active && name !== 'translate'
      && element.style.getPropertyPriority(name) !== 'important') return css[name] || '';
    return inline || (name === 'opacity' ? '1' : 'none');
  };
  globalThis.getComputedStyle = element => ({
    get scale() { return computedValue(element, 'scale'); },
    get opacity() { return computedValue(element, 'opacity'); },
    get translate() { return computedValue(element, 'translate'); },
    getPropertyValue: name => computedValue(element, name),
  });
  const motion = createModalSurfaceMotion({
    overlay, surface, cssEntrance: 'modal-pop', reducedMotion,
    now: () => time,
    requestFrame: noScheduler ? () => null : callback => { frames.set(++handle, callback); return handle; },
    cancelFrame: id => frames.delete(id),
  });
  t.after(() => {
    try { motion.dispose(); }
    finally {
      if (priorComputed === undefined) delete globalThis.getComputedStyle;
      else globalThis.getComputedStyle = priorComputed;
    }
  });
  function runFrame(timestamp, nextNow = timestamp) {
    time = nextNow;
    const callbacks = [...frames.values()];
    frames.clear();
    for (const callback of callbacks) callback(timestamp);
  }
  const f = {
    surface, overlay, css, frames, writes, attributes, named, unrelated, motion,
    setNow: value => { time = value; },
    runFrame,
    tick: (delta = 16) => runFrame(time + delta),
    endCss() { active = false; named.playState = 'finished'; },
    get active() { return active; },
    presentation() {
      const components = computedValue(surface, 'scale').split(/\s+/).map(Number);
      const scale = computedValue(surface, 'scale') === 'none' ? [1, 1, 1]
        : [components[0], components[1] ?? components[0], components[2] ?? 1];
      return { scale, childOpacity: Number(computedValue(surface, 'opacity')),
        overlayOpacity: Number(computedValue(overlay, 'opacity')) };
    },
    settle() {
      for (let count = 0; frames.size && count < 160; count += 1) f.tick();
      assert.equal(frames.size, 0, 'a finite input must settle without orphaning a frame');
    },
  };
  return f;
}

function assertFiniteWrites(f) {
  assert.deepEqual(f.writes.filter(write => /NaN|Infinity/.test(write.value)), [],
    'no attempted inline style write may contain NaN or Infinity');
  const p = f.presentation();
  assert.ok([...p.scale, p.childOpacity, p.overlayOpacity].every(Number.isFinite),
    'the entire presented scale and both opacity channels must stay finite');
}

function safeOrRejected(f, operation) {
  let rejected = false;
  try { operation(); }
  catch (error) {
    assert.ok(error instanceof TypeError || error instanceof RangeError,
      'invalid numeric input must receive an explicit numeric rejection');
    rejected = true;
  }
  assertFiniteWrites(f);
  if (!rejected) {
    f.setNow(1000);
    f.settle();
    assertFiniteWrites(f);
    assert.equal(f.overlay.hidden, true);
  }
}

function sampledClose(f, { sampleTime = 16, closeTime = 20,
  beforeScale = '0.98', afterScale = '0.99', beforeOpacity = '0.4', afterOpacity = '0.5' } = {}) {
  f.motion.show();
  f.css.scale = beforeScale; f.css.opacity = beforeOpacity;
  f.runFrame(sampleTime);
  f.css.scale = afterScale; f.css.opacity = afterOpacity;
  f.setNow(closeTime);
  f.motion.hide();
}

test('N01 initial named entrance leaves CSS scale/opacity and overlay opacity solely owned by CSS', t => {
  const f = namedFixture(t);
  f.overlay.style.setProperty('opacity', '0.9', 'important');
  f.writes.length = 0;
  f.motion.show();
  assert.equal(f.overlay.hidden, false);
  assert.equal(f.overlay.inert, false);
  assert.equal(f.attributes.has('aria-hidden'), false);
  assert.equal(f.frames.size, 1);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.presentation(), { scale: [0.94, 0.94, 1], childOpacity: 0, overlayOpacity: 0.9 });
  f.css.scale = '1.012'; f.css.opacity = '1'; f.tick(160);
  assert.deepEqual(f.writes, []);
  assert.equal(f.presentation().scale[0], 1.012);
  assert.equal(f.named.cancels, 0);
});

test('N02 repeated show keeps one scheduler without canceling the named entrance', t => {
  const f = namedFixture(t); f.motion.show();
  for (let n = 0; n < 10; n += 1) f.motion.show();
  assert.equal(f.frames.size, 1); assert.equal(f.named.cancels, 0);
  assert.equal(f.writes.length, 0);
});

test('N03 CSS completion restores original inline values and priorities exactly', t => {
  const f = namedFixture(t);
  f.surface.style.setProperty('transform', 'translate(-80px, 15px) scale(0.9)');
  f.surface.style.setProperty('translate', '3px 4px', 'important');
  f.surface.style.setProperty('scale', '0.95');
  f.surface.style.setProperty('opacity', '0.8');
  f.overlay.style.setProperty('opacity', '0.9', 'important');
  f.motion.show(); f.tick(128); f.endCss(); f.tick(132);
  assert.equal(f.frames.size, 0); assert.equal(f.overlay.dataset.modalMotionState, 'open');
  for (const [element, name, value, priority] of [
    [f.surface, 'transform', 'translate(-80px, 15px) scale(0.9)', ''],
    [f.surface, 'translate', '3px 4px', 'important'], [f.surface, 'scale', '0.95', ''],
    [f.surface, 'opacity', '0.8', ''], [f.overlay, 'opacity', '0.9', 'important'],
  ]) {
    assert.equal(element.style.getPropertyValue(name), value);
    assert.equal(element.style.getPropertyPriority(name), priority);
  }
});

test('N04 hide copies live computed values before cancel and becomes inert immediately without a visual jump', t => {
  const f = namedFixture(t); f.motion.show();
  f.css.scale = '0.977 0.982 1.03'; f.css.opacity = '0.37'; f.setNow(70);
  const before = f.presentation();
  f.motion.hide();
  assert.deepEqual(f.presentation(), before);
  assert.equal(f.named.cancels, 1); assert.equal(f.active, false);
  assert.equal(f.overlay.hidden, false); assert.equal(f.overlay.inert, true);
  assert.equal(f.attributes.get('aria-hidden'), 'true'); assert.equal(f.frames.size, 1);
  f.settle(); assertFiniteWrites(f);
});

test('N05 sampled positive scale/opacity velocity survives the first close frame', t => {
  const f = namedFixture(t); sampledClose(f);
  const before = f.presentation(); f.tick(8); const after = f.presentation();
  assert.ok(after.scale[0] > before.scale[0]);
  assert.ok(after.childOpacity > before.childOpacity);
  assert.ok(after.overlayOpacity < before.overlayOpacity);
  assert.equal(f.frames.size, 1); assertFiniteWrites(f); f.settle();
});

test('N06 sampled negative CSS velocity remains finite and initially keeps the same direction', t => {
  const f = namedFixture(t);
  sampledClose(f, { beforeScale: '1.012', afterScale: '1.005', beforeOpacity: '1', afterOpacity: '0.99' });
  const before = f.presentation(); f.tick(8); const after = f.presentation();
  assert.ok(after.scale[0] < before.scale[0]); assert.ok(after.childOpacity < before.childOpacity);
  assertFiniteWrites(f); f.settle();
});

test('N07 close/reopen retains exact presentation, closing velocity, and one scheduler; stale callback is invalidated', t => {
  const f = namedFixture(t); f.motion.show(); f.endCss(); f.tick();
  let hidden = 0; f.motion.hide({ onHidden: () => { hidden += 1; } }); f.tick(32);
  const before = f.presentation(); const cancels = f.named.cancels;
  f.motion.show(); assert.deepEqual(f.presentation(), before);
  assert.equal(f.named.cancels, cancels); assert.equal(f.overlay.inert, false);
  assert.equal(f.attributes.has('aria-hidden'), false); assert.equal(f.frames.size, 1);
  f.tick(8); const after = f.presentation();
  assert.ok(after.scale[0] < before.scale[0]); assert.ok(after.overlayOpacity < before.overlayOpacity);
  f.settle(); assert.equal(hidden, 0); assert.equal(f.motion.isOpen(), true);
});

test('N08 rapid reversals fire only the final close callback once and remove the single frame', t => {
  const f = namedFixture(t); sampledClose(f); let stale = 0; let final = 0;
  f.motion.hide({ onHidden: () => { stale += 1; } }); f.tick(16);
  f.motion.show(); f.tick(8); f.motion.hide({ onHidden: () => { final += 1; } });
  assert.equal(f.frames.size, 1); f.settle(); f.motion.finish();
  assert.equal(stale, 0); assert.equal(final, 1); assert.equal(f.overlay.hidden, true);
});

test('N09 canceling the named entrance leaves unrelated CSS and WAAPI effects untouched', t => {
  const f = namedFixture(t); sampledClose(f);
  assert.equal(f.named.cancels, 1);
  assert.deepEqual(f.unrelated.map(animation => animation.cancels), [0, 0]);
  f.motion.finish();
  assert.deepEqual(f.unrelated.map(animation => animation.cancels), [0, 0]);
});

test('N10 initial reduced motion cancels only named CSS and commits synchronously without a frame', t => {
  const f = namedFixture(t, { reducedMotion: true }); f.motion.show();
  assert.equal(f.frames.size, 0); assert.equal(f.overlay.hidden, false);
  assert.equal(f.overlay.dataset.modalMotionState, 'open'); assert.equal(f.named.cancels, 1);
  assert.equal(f.writes.some(write => write.name === 'scale'), false);
  assert.deepEqual(f.unrelated.map(animation => animation.cancels), [0, 0]);
});

test('N11 switching to reduced motion during reversal cancels frames and stale callbacks', t => {
  let reduced = false; const f = namedFixture(t, { reducedMotion: () => reduced }); sampledClose(f);
  let stale = 0; f.motion.hide({ onHidden: () => { stale += 1; } }); f.tick();
  reduced = true; f.motion.show(); assert.equal(f.frames.size, 0); assert.equal(stale, 0);
  assert.equal(f.overlay.hidden, false); let final = 0;
  f.motion.hide({ onHidden: () => { final += 1; } });
  assert.equal(f.frames.size, 0); assert.equal(f.overlay.hidden, true); assert.equal(final, 1);
});

test('N12 finish during a CSS handoff restores all original inline priorities and notifies once', t => {
  const f = namedFixture(t);
  f.surface.style.setProperty('translate', '-50% -50%', 'important');
  f.surface.style.setProperty('scale', '0.95'); f.surface.style.setProperty('opacity', '0.8');
  f.overlay.style.setProperty('opacity', '0.9', 'important');
  f.motion.show(); f.css.scale = '0.97'; f.css.opacity = '0.4';
  let hidden = 0; f.motion.hide({ onHidden: () => { hidden += 1; } }); f.tick();
  f.motion.finish(); f.motion.finish();
  assert.equal(hidden, 1); assert.equal(f.frames.size, 0); assert.equal(f.overlay.hidden, true);
  assert.equal(f.surface.style.getPropertyValue('translate'), '-50% -50%');
  assert.equal(f.surface.style.getPropertyPriority('translate'), 'important');
  assert.equal(f.surface.style.getPropertyValue('scale'), '0.95');
  assert.equal(f.surface.style.getPropertyValue('opacity'), '0.8');
  assert.equal(f.overlay.style.getPropertyValue('opacity'), '0.9');
  assert.equal(f.overlay.style.getPropertyPriority('opacity'), 'important');
});

test('N13 dispose commits logical state without a callback and rejects future shows', t => {
  const f = namedFixture(t); sampledClose(f); let hidden = 0;
  f.motion.hide({ onHidden: () => { hidden += 1; } }); f.motion.dispose();
  assert.equal(hidden, 0); assert.equal(f.frames.size, 0); assert.equal(f.overlay.hidden, true);
  assert.equal(f.motion.show(), false); assert.equal(f.motion.isOpen(), false);
});

test('N14 named CSS opt-in rejects an overlay used as its own surface', () => {
  const overlay = { hidden: true };
  assert.throws(() => createModalSurfaceMotion({ overlay, surface: overlay, cssEntrance: 'modal-pop' }),
    /separate modal surface/);
});

test('N15 independent x/y/z scales remain continuous and original 3D scale is restored', t => {
  const f = namedFixture(t); f.surface.style.setProperty('scale', '0.9 1.1 1.2');
  f.motion.show(); f.css.scale = '0.93 1.04 1.17'; f.css.opacity = '0.43';
  const before = f.presentation(); f.motion.hide(); assert.deepEqual(f.presentation(), before);
  f.tick(); assertFiniteWrites(f); f.motion.show(); f.settle();
  assert.equal(f.surface.style.getPropertyValue('scale'), '0.9 1.1 1.2');
});

test('N16 absent getAnimations commits on the first observation rather than leaving an orphaned entrance', t => {
  const f = namedFixture(t, { noAnimations: true }); f.motion.show(); f.tick();
  assert.equal(f.frames.size, 0); assert.equal(f.overlay.dataset.modalMotionState, 'open');
  assert.equal(f.surface.style.getPropertyValue('scale'), '');
});

test('N17 absent scheduler immediately commits and cancels the named entrance', t => {
  const f = namedFixture(t, { noScheduler: true }); f.motion.show();
  assert.equal(f.frames.size, 0); assert.equal(f.overlay.dataset.modalMotionState, 'open');
  assert.equal(f.named.cancels, 1);
});

test('N18 first-frame interruption with no prior sample preserves position and uses finite zero velocity', t => {
  const f = namedFixture(t); f.motion.show(); f.css.scale = '0.97'; f.css.opacity = '0.3';
  f.motion.hide(); assert.deepEqual(f.presentation(), { scale: [0.97, 0.97, 1], childOpacity: 0.3, overlayOpacity: 1 });
  f.tick(8); assertFiniteWrites(f); assert.ok(f.presentation().scale[0] > 0.97); f.settle();
});

test('N19 zero CSS sample delta does not divide by zero and preserves handoff position', t => {
  const f = namedFixture(t); sampledClose(f, { sampleTime: 16, closeTime: 16 });
  assert.deepEqual(f.presentation(), { scale: [0.99, 0.99, 1], childOpacity: 0.5, overlayOpacity: 1 });
  f.tick(); assertFiniteWrites(f); f.settle();
});

test('N20 negative CSS sample delta falls back to finite velocity without a presentation jump', t => {
  const f = namedFixture(t); sampledClose(f, { sampleTime: 32, closeTime: 16 });
  assert.deepEqual(f.presentation(), { scale: [0.99, 0.99, 1], childOpacity: 0.5, overlayOpacity: 1 });
  f.tick(8); assertFiniteWrites(f); f.settle();
});

test('N21 negative frame elapsed is a zero step and later finite frames still settle', t => {
  const f = namedFixture(t); sampledClose(f, { sampleTime: 16, closeTime: 32 });
  const before = f.presentation(); f.runFrame(16); assert.deepEqual(f.presentation(), before);
  assertFiniteWrites(f); f.runFrame(48); f.settle();
});

test('N22 a very large finite elapsed interval remains finite and settles all channels', t => {
  const f = namedFixture(t); sampledClose(f); f.runFrame(Number.MAX_VALUE);
  assertFiniteWrites(f); assert.equal(f.frames.size, 0); assert.equal(f.overlay.hidden, true);
});

for (const [id, property, badValue] of [
  ['N23', 'scale', 'NaN'], ['N24', 'scale', 'Infinity'],
  ['N25', 'opacity', 'NaN'], ['N26', 'opacity', 'Infinity'],
]) {
  test(`${id} malformed computed ${property}=${badValue} is rejected before cancel or inline mutation`, t => {
    const f = namedFixture(t); f.motion.show(); f.css[property] = badValue;
    const writes = [...f.writes];
    assert.throws(() => f.motion.hide(), /finite scale and opacity/);
    assert.deepEqual(f.writes, writes); assert.equal(f.named.cancels, 0);
    assert.equal(f.overlay.inert, false); assert.equal(f.motion.isOpen(), true);
  });
}

test('N27 finite CSS samples with a subnormal positive time delta cannot create infinite velocity/style writes', t => {
  const f = namedFixture(t); f.motion.show(); f.css.scale = '0.96'; f.css.opacity = '0.4'; f.runFrame(0);
  f.css.scale = '0.97'; f.css.opacity = '0.5'; f.setNow(1e-310);
  safeOrRejected(f, () => { f.motion.hide(); f.runFrame(16); });
});

test('N28 NaN sampled clock is explicitly rejected or safely settled without invalid style writes', t => {
  const f = namedFixture(t); f.motion.show(); f.css.scale = '0.98'; f.css.opacity = '0.4'; f.runFrame(16);
  f.css.scale = '0.99'; f.css.opacity = '0.5'; f.setNow(Number.NaN);
  safeOrRejected(f, () => { f.motion.hide(); f.runFrame(32); });
});

test('N29 infinite sampled clock is explicitly rejected or safely settled without invalid style writes', t => {
  const f = namedFixture(t); f.motion.show(); f.css.scale = '0.98'; f.css.opacity = '0.4'; f.runFrame(16);
  f.css.scale = '0.99'; f.css.opacity = '0.5'; f.setNow(Number.POSITIVE_INFINITY);
  safeOrRejected(f, () => { f.motion.hide(); f.runFrame(32); });
});

test('N30 NaN frame timestamp is explicitly rejected or safely settled without invalid style writes', t => {
  const f = namedFixture(t); sampledClose(f);
  safeOrRejected(f, () => f.runFrame(Number.NaN, 32));
});

test('N31 infinite frame timestamp is explicitly rejected or safely settled without invalid style writes', t => {
  const f = namedFixture(t); sampledClose(f);
  safeOrRejected(f, () => f.runFrame(Number.POSITIVE_INFINITY, 32));
});

// Native clock and presentation ownership regressions use the real factory.
// These spies exercise clock selection and ownership/lifecycle only. They do not
// implement native interpolation, CSS cascade, geometry, or native C0/C1 truth.
{
  function r3Fixture(t, {
    timelineTime = 100, performanceTime = 900, documentMode = 'present',
    nativeEffects = true, injectedNow, noPerformance = false,
    noScheduler = false, reducedMotion = false, namedTime = 73.25,
  } = {}) {
    const savedGlobals = new Map();
    const holds = [];
    const effects = [];
    const frames = new Map();
    let motion;
    let timelineReads = 0;
    let performanceReads = 0;
    let nextFrame = 0;
    let cssActive = true;
    const clock = { timeline: timelineTime, performance: performanceTime };
    const css = { scale: '0.97', opacity: '0.4', translate: 'none' };
    const timeline = {};
    Object.defineProperty(timeline, 'currentTime', {
      get() { timelineReads += 1; return clock.timeline; }, configurable: true,
    });
    function globalValue(name, value) {
      if (!savedGlobals.has(name)) savedGlobals.set(name,
        Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, {
        value, configurable: true, writable: true,
        enumerable: savedGlobals.get(name)?.enumerable ?? false,
      });
    }
    // One cleanup guarantees restoration even if factory construction/assertions fail.
    t.after(() => {
      try { motion?.dispose(); }
      finally {
        for (const [name, descriptor] of [...savedGlobals].reverse()) {
          if (descriptor) Object.defineProperty(globalThis, name, descriptor);
          else delete globalThis[name];
        }
      }
    });
    const namedFrames = Object.freeze([
      Object.freeze({ offset: 0, computedOffset: 0, opacity: '0', scale: '0.94', easing: 'ease-out', composite: 'auto' }),
      Object.freeze({ offset: 0.62, computedOffset: 0.62, opacity: '1', scale: '1.012', easing: 'ease-out', composite: 'auto' }),
      Object.freeze({ offset: 1, computedOffset: 1, opacity: '1', scale: '1', easing: 'ease-out', composite: 'auto' }),
    ]);
    const namedTiming = Object.freeze({ delay: 12, endDelay: 7, fill: 'both',
      iterationStart: 0.2, iterations: 1, duration: 260, direction: 'alternate',
      easing: 'cubic-bezier(0.2, 0.9, 0.25, 1.06)' });
    const named = {
      animationName: 'modal-pop', playState: 'running', currentTime: namedTime,
      cancels: 0, frameReads: 0, timingReads: 0,
      cancel() { this.cancels += 1; this.playState = 'idle'; cssActive = false; },
    };
    const foreign = [
      { animationName: 'other-css', playState: 'running', currentTime: 51, cancels: 0,
        cancel() { this.cancels += 1; this.playState = 'idle'; } },
      { playState: 'running', currentTime: 63, cancels: 0,
        cancel() { this.cancels += 1; this.playState = 'idle'; } },
    ];
    const foreignSnapshot = () => foreign.map(({ animationName, playState, currentTime, cancels }) =>
      ({ animationName, playState, currentTime, cancels }));
    const foreignBefore = foreignSnapshot();
    const surface = { style: fakeStyle(),
      getBoundingClientRect: () => ({ left: 100, top: 100, width: 400, height: 300 }),
      getAnimations: () => [named, ...foreign, ...holds.filter(hold => hold.playState !== 'idle')],
    };
    const attributes = new Map();
    const overlay = { tagName: 'DIV', hidden: true, inert: false, dataset: {},
      style: fakeStyle(), querySelector: () => surface,
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: name => attributes.delete(name),
      animate() { assert.fail('Named entrances must retain their manual overlay scheduler'); },
    };
    named.effect = {
      target: surface,
      getKeyframes() { named.frameReads += 1; return namedFrames; },
      getTiming() { named.timingReads += 1; return namedTiming; },
    };
    class NativeEffectSpy {
      constructor(target, keyframes, timing) {
        this.target = target; this.keyframes = keyframes; this.timing = timing;
        effects.push(this);
      }
    }
    class NativeAnimationSpy {
      constructor(effect, receivedTimeline) {
        this.effect = effect; this.timeline = receivedTimeline;
        this.playState = 'idle'; this.currentTime = null;
        this.pauses = 0; this.cancels = 0;
        holds.push(this);
      }
      pause() { this.pauses += 1; this.playState = 'paused'; }
      cancel() { this.cancels += 1; this.playState = 'idle'; }
      play() { assert.fail('Presentation hold must never play independently'); }
    }
    globalValue('document', documentMode === 'absent' ? undefined
      : documentMode === 'no-timeline' ? {} : { timeline });
    globalValue('performance', noPerformance ? undefined
      : { now() { performanceReads += 1; return clock.performance; } });
    globalValue('Animation', nativeEffects ? NativeAnimationSpy : undefined);
    globalValue('KeyframeEffect', nativeEffects ? NativeEffectSpy : undefined);
    globalValue('getComputedStyle', element => {
      const read = name => {
        if (element === surface && cssActive && (name === 'scale' || name === 'opacity')
          && element.style.getPropertyPriority(name) !== 'important') return css[name];
        return element.style.getPropertyValue(name) || (name === 'opacity' ? '1' : 'none');
      };
      return { get scale() { return read('scale'); }, get opacity() { return read('opacity'); },
        get translate() { return read('translate'); }, getPropertyValue: read };
    });
    motion = createModalSurfaceMotion({ overlay, surface, cssEntrance: 'modal-pop', reducedMotion,
      ...(injectedNow ? { now: injectedNow } : {}),
      requestFrame: noScheduler ? () => null : callback => { frames.set(++nextFrame, callback); return nextFrame; },
      cancelFrame: handle => frames.delete(handle),
    });
    const f = { motion, overlay, surface, attributes, named, foreign, clock, css,
      frames, holds, effects, namedFrames, namedTiming, timeline,
      counters: () => ({ timelineReads, performanceReads }),
      assertForeign: () => assert.deepEqual(foreignSnapshot(), foreignBefore),
      opacity: () => Number(overlay.style.getPropertyValue('opacity') || '1'),
      frame(timestamp) {
        clock.timeline = timestamp;
        const callbacks = [...frames.values()]; frames.clear();
        for (const callback of callbacks) callback(timestamp);
      },
      close() { motion.show(); motion.hide(); },
    };
    return f;
  }

  for (const time of [0, 100]) {
    test(`R3-C01 timeline ${time} outranks later performance clock and first positive RAF closes`, { concurrency: false }, t => {
      const f = r3Fixture(t, { timelineTime: time, performanceTime: time + 80, nativeEffects: false });
      f.close(); assert.equal(f.opacity(), 1);
      f.frame(time + 16);
      assert.ok(f.opacity() > 0 && f.opacity() < 1);
      assert.equal(f.counters().performanceReads, 0);
      assert.ok(f.counters().timelineReads >= 2);
      assert.equal(f.frames.size, 1); f.assertForeign();
    });
  }
  for (const [label, time] of [['null', null], ['undefined', undefined], ['NaN', NaN],
    ['Infinity', Infinity], ['-Infinity', -Infinity], ['numeric-string', '100']]) {
    test(`R3-C02 ${label} timeline falls back to finite performance time`, { concurrency: false }, t => {
      const f = r3Fixture(t, { timelineTime: null, performanceTime: 500, nativeEffects: false });
      f.clock.timeline = time;
      f.close(); f.frame(500); assert.equal(f.opacity(), 1);
      f.frame(516); assert.ok(f.opacity() > 0 && f.opacity() < 1);
      assert.ok(f.counters().performanceReads >= 2); f.assertForeign();
    });
  }
  test('R3-C03 no timeline/performance uses Date fallback', { concurrency: false }, t => {
    const dateDescriptor = Object.getOwnPropertyDescriptor(Date, 'now');
    let dateReads = 0;
    Object.defineProperty(Date, 'now', { ...dateDescriptor, value: () => { dateReads += 1; return 700; } });
    t.after(() => Object.defineProperty(Date, 'now', dateDescriptor));
    const f = r3Fixture(t, { documentMode: 'absent', noPerformance: true, nativeEffects: false });
    f.close(); f.frame(700); assert.equal(f.opacity(), 1);
    f.frame(716); assert.ok(f.opacity() > 0 && f.opacity() < 1);
    assert.ok(dateReads >= 2);
  });
  test('R3-C04 explicitly injected clock outranks both default clocks', { concurrency: false }, t => {
    let nowCalls = 0;
    const f = r3Fixture(t, { timelineTime: 0, performanceTime: 900, nativeEffects: false,
      injectedNow: () => { nowCalls += 1; return 300; } });
    f.close(); f.frame(300); assert.equal(f.opacity(), 1);
    f.frame(316); assert.ok(f.opacity() > 0 && f.opacity() < 1);
    assert.deepEqual(f.counters(), { timelineReads: 0, performanceReads: 0 });
    assert.ok(nowCalls >= 2);
  });

  test('R3-H01 native hold copies effect arguments and precise local time, paused on original timeline', { concurrency: false }, t => {
    const f = r3Fixture(t); f.close();
    assert.equal(f.named.cancels, 1); assert.equal(f.holds.length, 1);
    assert.equal(f.effects.length, 1); assert.equal(f.named.frameReads, 1); assert.equal(f.named.timingReads, 1);
    const [hold] = f.holds;
    assert.equal(hold.timeline, f.timeline); assert.equal(hold.effect.target, f.surface);
    assert.deepEqual(hold.effect.keyframes, f.namedFrames);
    assert.deepEqual(hold.effect.timing, f.namedTiming);
    assert.equal(hold.currentTime, 73.25); assert.equal(hold.pauses, 1);
    assert.equal(hold.playState, 'paused'); assert.equal(hold.cancels, 0);
    assert.equal(f.frames.size, 1); f.assertForeign();
  });
  test('R3-H02 zero and negative elapsed retain own hold; first positive frame cancels it once', { concurrency: false }, t => {
    const f = r3Fixture(t); f.close(); const [hold] = f.holds;
    f.frame(100); assert.equal(hold.cancels, 0); assert.equal(hold.playState, 'paused');
    f.frame(99); assert.equal(hold.cancels, 0); assert.equal(f.opacity(), 1);
    f.frame(115); assert.equal(hold.cancels, 1); assert.equal(hold.playState, 'idle');
    assert.ok(f.opacity() < 1); f.frame(131);
    assert.equal(hold.cancels, 1); f.motion.finish(); f.motion.dispose();
    assert.equal(hold.cancels, 1); f.assertForeign();
  });
  test('R3-H03 finish releases pending hold once, clears scheduler, restores priorities, notifies once', { concurrency: false }, t => {
    const f = r3Fixture(t);
    f.surface.style.setProperty('translate', '-50% -50%', 'important');
    f.surface.style.setProperty('scale', '0.95', 'important');
    f.surface.style.setProperty('opacity', '0.8', 'important');
    f.overlay.style.setProperty('opacity', '0.9', 'important');
    let hidden = 0; f.motion.show(); f.motion.hide({ onHidden: () => { hidden += 1; } });
    const [hold] = f.holds; f.motion.finish(); f.motion.finish();
    assert.equal(hold.cancels, 1); assert.equal(hidden, 1); assert.equal(f.frames.size, 0);
    assert.equal(f.overlay.hidden, true);
    for (const [element, name, value] of [[f.surface, 'translate', '-50% -50%'],
      [f.surface, 'scale', '0.95'], [f.surface, 'opacity', '0.8'], [f.overlay, 'opacity', '0.9']]) {
      assert.equal(element.style.getPropertyValue(name), value);
      assert.equal(element.style.getPropertyPriority(name), 'important');
    }
    f.assertForeign();
  });
  test('R3-H04 dispose releases hold, suppresses callback and makes captured RAF inert', { concurrency: false }, t => {
    const f = r3Fixture(t); let hidden = 0; f.motion.show();
    f.motion.hide({ onHidden: () => { hidden += 1; } });
    const [hold] = f.holds; const callbacks = [...f.frames.values()];
    f.motion.dispose(); f.motion.dispose();
    const before = [f.overlay.hidden, f.overlay.dataset.modalMotionState, f.surface.style.getPropertyValue('scale')];
    for (const callback of callbacks) callback(116);
    assert.deepEqual([f.overlay.hidden, f.overlay.dataset.modalMotionState, f.surface.style.getPropertyValue('scale')], before);
    assert.equal(hold.cancels, 1); assert.equal(hidden, 0); assert.equal(f.frames.size, 0);
    assert.equal(f.motion.show(), false); assert.equal(f.motion.hide(), false); f.assertForeign();
  });
  test('R3-H05 zero-elapsed reopen keeps one paused hold and invalidates stale close callback', { concurrency: false }, t => {
    const f = r3Fixture(t); let hidden = 0; f.motion.show();
    f.motion.hide({ onHidden: () => { hidden += 1; } }); const [hold] = f.holds;
    f.frame(100); f.motion.show();
    assert.equal(f.holds.length, 1); assert.equal(hold.cancels, 0);
    assert.equal(f.overlay.inert, false); assert.equal(f.motion.isOpen(), true);
    assert.equal(f.frames.size, 1); f.frame(116);
    assert.equal(hold.cancels, 1); f.motion.finish();
    assert.equal(hidden, 0); assert.equal(f.overlay.hidden, false); f.assertForeign();
  });
  test('R3-H06 reduced-motion retarget commits and releases the pending hold', { concurrency: false }, t => {
    let reduced = false;
    const f = r3Fixture(t, { reducedMotion: () => reduced }); f.close(); const [hold] = f.holds;
    reduced = true; f.motion.show();
    assert.equal(hold.cancels, 1); assert.equal(f.frames.size, 0);
    assert.equal(f.overlay.hidden, false); assert.equal(f.overlay.dataset.modalMotionState, 'open'); f.assertForeign();
  });
  test('R3-H07 nonfinite RAF commits safely and releases the pending hold', { concurrency: false }, t => {
    const f = r3Fixture(t); f.close(); const [hold] = f.holds;
    f.frame(NaN); assert.equal(hold.cancels, 1); assert.equal(f.frames.size, 0);
    assert.equal(f.overlay.hidden, true); f.assertForeign();
  });
  test('R3-H08 zero local animation time still creates an owned hold', { concurrency: false }, t => {
    const f = r3Fixture(t, { namedTime: 0 }); f.close();
    assert.equal(f.holds.length, 1); assert.equal(f.holds[0].currentTime, 0); f.assertForeign();
  });
  test('R3-H09 sampled manual CSS velocity remains positive after releasing hold', { concurrency: false }, t => {
    const f = r3Fixture(t); f.motion.show();
    f.css.scale = '1.005'; f.css.opacity = '0.6'; f.frame(100);
    f.css.scale = '1.007'; f.css.opacity = '0.7'; f.clock.timeline = 104;
    f.motion.hide(); const [hold] = f.holds; f.frame(108);
    assert.equal(hold.cancels, 1);
    assert.ok(Number(f.surface.style.getPropertyValue('scale').split(' ')[0]) > 1.007);
    assert.ok(Number(f.surface.style.getPropertyValue('opacity')) > 0.7);
    assert.ok(f.opacity() < 1); f.assertForeign();
  });
  for (const documentMode of ['absent', 'no-timeline']) {
    test(`R3-F01 native classes with ${documentMode} document fall back without constructing hold`, { concurrency: false }, t => {
      const f = r3Fixture(t, { documentMode, performanceTime: 100 });
      assert.doesNotThrow(() => f.close());
      assert.equal(f.effects.length, 0); assert.equal(f.holds.length, 0);
      assert.equal(f.named.cancels, 1); f.frame(116);
      assert.ok(f.opacity() > 0 && f.opacity() < 1); assert.equal(f.frames.size, 1); f.assertForeign();
    });
  }
  for (const [label, namedTime] of [['null', null], ['NaN', NaN]]) {
    test(`R3-F02 unresolved ${label} animation time falls back to manual scheduler`, { concurrency: false }, t => {
      const f = r3Fixture(t, { namedTime }); f.close();
      assert.equal(f.holds.length, 0); assert.equal(f.effects.length, 0);
      f.frame(116); assert.ok(f.opacity() > 0 && f.opacity() < 1); f.assertForeign();
    });
  }
  test('R3-F03 missing native classes retains manual close path', { concurrency: false }, t => {
    const f = r3Fixture(t, { nativeEffects: false }); f.close();
    assert.equal(f.holds.length, 0); assert.equal(f.named.cancels, 1);
    f.frame(116); assert.ok(f.opacity() > 0 && f.opacity() < 1); f.assertForeign();
  });
}

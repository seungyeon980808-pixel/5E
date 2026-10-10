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

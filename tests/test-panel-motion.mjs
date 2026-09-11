import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createPanelMotion,
  criticallyDampedProgress,
  cycleFocusIndex,
  panelMotionKeyframes,
} from '../js/panel-motion.js';

test('critically damped panel motion has no overshoot and settles at its target', () => {
  const values = Array.from({ length: 41 }, (_, index) => criticallyDampedProgress(index / 40));
  assert.equal(values[0], 0);
  assert.equal(values.at(-1), 1);
  assert.ok(values.every((value, index) => value >= 0 && value <= 1
    && (index === 0 || value >= values[index - 1])));
});

test('panel keyframes travel toward the matching edge without stretching content', () => {
  const left = panelMotionKeyframes(-40, -140, 1);
  const right = panelMotionKeyframes(25, 140, 1);
  assert.match(left[0].transform, /translate3d\(-40px, 0, 0\)/);
  assert.match(left.at(-1).transform, /translate3d\(-140px, 0, 0\)/);
  assert.match(right.at(-1).transform, /translate3d\(140px, 0, 0\)/);
  assert.ok(left.every((frame) => !/scale|width|grid/i.test(frame.transform)));
});

function fixture({ reduced = false } = {}) {
  let presentationX = 0;
  const animations = [];
  const calls = [];
  globalThis.getComputedStyle = () => ({ opacity: '1' });
  const classes = new Set();
  const panel = {
    hidden: false,
    inert: false,
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: 120,
    offsetHeight: 600,
    getBoundingClientRect: () => ({ left: presentationX, width: 120 }),
    classList: {
      add: (name) => { classes.add(name); calls.push(`${name}:on`); },
      remove: (name) => { classes.delete(name); calls.push(`${name}:off`); },
      contains: (name) => classes.has(name),
    },
    style: { setProperty() {}, removeProperty() {} },
    animate(keyframes) {
      let resolve;
      const finished = new Promise((done) => { resolve = done; });
      const animation = {
        keyframes,
        finished,
        cancel: () => { presentationX = 0; calls.push('cancel'); },
        finish: () => { presentationX = Number.parseFloat(keyframes.at(-1).transform.match(/\(([-\d.]+)px/)[1]); resolve(); },
      };
      animations.push(animation);
      return animation;
    },
  };
  const surface = {
    offsetWidth: 600,
    getBoundingClientRect: () => ({ left: 120, width: 600 }),
    classList: { add() {}, remove() {} },
    animate: panel.animate.bind(panel),
  };
  const motion = createPanelMotion({
    panel,
    surface,
    side: 'left',
    reducedMotion: () => reduced,
    mutateLayout: (expanded) => calls.push(`layout:${expanded}`),
    setAccessibleExpanded: (expanded) => calls.push(`a11y:${expanded}`),
    beforeLayout: () => calls.push('before'),
    afterLayout: () => calls.push('after'),
  });
  return { animations, calls, motion, panel, setPresentation: (value) => { presentationX = value; } };
}

test('an interrupted close reverses from the live presentation position', async () => {
  const f = fixture();
  f.motion.setExpanded(false);
  assert.equal(f.animations.length, 2);
  f.setPresentation(-48);
  f.motion.setExpanded(true);
  assert.equal(f.animations.length, 4);
  assert.match(f.animations[2].keyframes[0].transform, /translate3d\(-48px, 0, 0\)/);
  assert.ok(f.calls.includes('cancel'));
  f.animations[2].finish();
  await f.animations[2].finished;
  await Promise.resolve();
  assert.deepEqual(f.calls.filter((call) => ['before', 'layout:true', 'after'].includes(call)).slice(-3),
    ['before', 'layout:true', 'after']);
  assert.equal(f.panel.hidden, false);
  assert.equal(f.panel.inert, false);
});

test('reduced motion commits static visibility and accessibility state', () => {
  const f = fixture({ reduced: true });
  f.motion.setExpanded(false);
  assert.equal(f.animations.length, 0);
  assert.equal(f.panel.hidden, true);
  assert.equal(f.panel.inert, true);
  assert.deepEqual(f.calls.filter((call) => call.startsWith('layout:')), ['layout:false']);
  f.motion.setExpanded(true);
  assert.equal(f.panel.hidden, false);
  assert.equal(f.panel.inert, false);
  assert.deepEqual(f.calls.filter((call) => call.startsWith('layout:')), ['layout:false', 'layout:true']);
});

test('mobile overlay motion does not resize the central layout', () => {
  const f = fixture();
  f.panel.hidden = true;
  f.motion.setExpanded(true, { overlayOnly: true });
  assert.equal(f.animations.length, 1);
  assert.equal(f.panel.hidden, false);
  assert.equal(f.panel.inert, false);
  assert.equal(f.calls.some((call) => call === 'before' || call === 'after'
    || call.startsWith('layout:')), false);
});

test('panel motion positioning never changes the fullscreen AI backdrop', () => {
  const css = readFileSync(new URL('../css/panel-visibility.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /(?:^|\n)\[data-panel-layout\]\s*,\s*\n[^{}]+\{ position: relative; \}/);
  assert.match(css, /#ai-image-panel\[data-panel-layout\] \.ai-workspace \{ position: relative; \}/);
});

test('mobile drawer focus cycles forward, backward, and in from background content', () => {
  assert.equal(cycleFocusIndex(0, 4), 1);
  assert.equal(cycleFocusIndex(3, 4), 0);
  assert.equal(cycleFocusIndex(0, 4, true), 3);
  assert.equal(cycleFocusIndex(-1, 4), 0);
  assert.equal(cycleFocusIndex(-1, 4, true), 3);
  assert.equal(cycleFocusIndex(-1, 0), -1);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../js/viewport.js', import.meta.url), 'utf8');
const { initViewport } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('panel layout changes preserve rendered scale and world center in both directions', () => {
  const previousWindow = globalThis.window;
  const events = new Map();
  globalThis.window = { addEventListener: (name, listener) => events.set(name, listener) };
  try {
    let rect = { width: 1200, height: 600 };
    const data = { viewBox: { x: -45, y: -35, w: 120, h: 60 } };
    const state = { get: () => data, update: action => action(data) };
    const svg = { addEventListener() {}, getBoundingClientRect: () => rect,
      getScreenCTM: () => ({ a: Math.min(rect.width / data.viewBox.w, rect.height / data.viewBox.h) }) };
    initViewport(svg, state, () => {});
    for (const width of [650, 980, 1200, 650]) {
      events.get('5e:panel-layout-will-change')();
      rect = { width, height: 600 };
      events.get('5e:panel-layout-did-change')();
      assert.equal(svg.getScreenCTM().a, 10);
      assert.equal(data.viewBox.x + data.viewBox.w / 2, 15);
      assert.equal(data.viewBox.y + data.viewBox.h / 2, -5);
    }
    const saved = { ...data.viewBox };
    events.get('5e:panel-layout-did-change')();
    assert.deepEqual(data.viewBox, saved, 'unpaired event must not change the viewport');
  } finally { globalThis.window = previousWindow; }
});

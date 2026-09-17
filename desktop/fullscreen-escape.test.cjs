const test = require('node:test');
const assert = require('node:assert/strict');
const { routeFullscreenEscape } = require('./fullscreen-escape.cjs');

test('fullscreen Escape is routed to popups before native window handling', () => {
  const sent = [];
  let prevented = 0;
  const target = { isFullScreen: () => true, webContents: { send: name => sent.push(name) } };
  const event = { preventDefault: () => prevented++ };
  for (const input of [{ type: 'keyDown' }, { type: 'keyUp' }, { type: 'keyDown', isAutoRepeat: true }]) {
    assert.equal(routeFullscreenEscape(event, { key: 'Escape', ...input }, target), true);
  }
  assert.equal(prevented, 3);
  assert.deepEqual(sent, ['window:escape']);
});

test('windowed keys, IME and modified Escape keep their normal handling', () => {
  const event = { preventDefault() { assert.fail('must not intercept'); } };
  for (const input of [{ key: 'Enter' }, { key: 'Escape', isComposing: true }, { key: 'Escape', meta: true }]) {
    assert.equal(routeFullscreenEscape(event, input, { isFullScreen: () => true }), false);
  }
  assert.equal(routeFullscreenEscape(event, { key: 'Escape' }, { isFullScreen: () => false }), false);
});

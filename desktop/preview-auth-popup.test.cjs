const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('preview/js/web-ai-connection.js', 'utf8');
function harness(fullscreen = false) {
  const calls = { exits: 0, opens: [], focused: 0 };
  const popup = { closed: false, resizeTo() {}, moveTo() {}, focus() { calls.focused++; }, location: { replace() {} } };
  const window = { innerWidth: 1600, screenX: 0, screenY: 0, addEventListener() {}, dispatchEvent() {}, open(url, name, features) { calls.opens.push({ url, name, features }); return popup; } };
  const document = { fullscreenElement: fullscreen ? {} : null, async exitFullscreen() { calls.exits++; document.fullscreenElement = null; } };
  vm.runInNewContext(source, { window, document, location: { hostname: '127.0.0.1', origin: 'http://127.0.0.1:8794' }, screen: { availWidth: 1920, availHeight: 1080 }, sessionStorage: { getItem() { return ''; } }, CustomEvent: class {}, Event: class {}, URL, AbortSignal, setTimeout() {}, clearTimeout() {}, fetch: async url => ({ ok: true, json: async () => url.endsWith('start') ? { ticket: 'a'.repeat(64), authUrl: 'https://auth.openai.com/codex/device', userCode: 'TEST' } : { state: 'waiting' } }) });
  return { calls, window, document };
}
test('authentication preserves editor fullscreen and opens a popup on the first click', async () => {
  const h = harness(true);
  await h.window.fiveEWebLogin();
  assert.equal(await h.window.fiveEWebContinueLogin(), true);
  assert.equal(h.calls.exits, 0);
  assert.ok(h.document.fullscreenElement);
  assert.equal(h.calls.opens.length, 1);
  await h.window.fiveEWebContinueLogin();
  assert.equal(h.calls.opens.length, 1);
  assert.equal(h.calls.focused, 1);
});
test('authentication popup is bounded instead of nearly screen-height', async () => {
  const h = harness();
  await h.window.fiveEWebLogin();
  await h.window.fiveEWebContinueLogin();
  const features = h.calls.opens[0].features;
  assert.match(features, /popup=yes/);
  assert.ok(Number(features.match(/height=(\d+)/)[1]) <= 640, features);
  assert.ok(Number(features.match(/width=(\d+)/)[1]) <= 480, features);
});

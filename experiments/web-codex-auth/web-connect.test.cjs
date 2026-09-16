const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

test('web transport ignores foreign origins and windows, preserves workspace and never supplies desktop capabilities', async () => {
  let receive;
  const messages = [];
  const popup = { closed: false, focus() {}, postMessage: (...args) => messages.push(args) };
  const window = { addEventListener: (_, fn) => { receive = fn; }, open: () => popup, dispatchEvent() {} };
  const context = { window, location: { origin: 'https://www.5e.ai.kr' }, setTimeout, clearTimeout, Event };
  vm.runInNewContext(readFileSync(require.resolve('../../js/web-ai-connection.js'), 'utf8'), context);
  vm.runInNewContext(readFileSync(require.resolve('./editor-bridge.js'), 'utf8'), context);
  assert.equal(window.fiveEDesktop, undefined);
  assert.equal(window.fiveEWebAI.web, true);
  await window.fiveEWebAI.login();
  receive({ origin: 'https://evil.example', source: popup, data: { type: '5e:runtime-ready' } });
  assert.equal((await window.fiveEWebAI.status()).login.loggedIn, false);
  const origin = 'https://five-e-ai-runtime-probe.onrender.com';
  receive({ origin, source: {}, data: { type: '5e:runtime-ready' } });
  assert.equal((await window.fiveEWebAI.status()).login.loggedIn, false);
  receive({ origin, source: popup, data: { type: '5e:runtime-ready' } });
  const result = window.fiveEWebAI.status({ clientScope: 'workspace-2' });
  assert.equal(messages[0][0].payload.clientScope, 'workspace-2');
  receive({ origin, source: popup, data: { type: '5e:runtime-response', id: messages[0][0].id, result: { login: { loggedIn: true }, server: true } } });
  assert.equal((await result).login.loggedIn, true);
});

test('public web connection is opt-in and leaves the private editor gate intact', async () => {
  const http = require('node:http');
  const { createTrialProxy } = require('./remote-trial.cjs');
  const upstream = http.createServer((_req, res) => res.end('connected'));
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  for (const webEditorOrigin of ['', 'https://www.5e.ai.kr']) {
    const proxy = createTrialProxy({ gatewayPort: upstream.address().port, publicOrigin: 'https://runtime.example', accessKey: 'a'.repeat(64), webEditorOrigin });
    await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
    const get = pathname => new Promise(resolve => {
      http.get({ hostname: '127.0.0.1', port: proxy.address().port, path: pathname, headers: { Host: 'runtime.example' } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
    });
    try {
      assert.equal(await get('/web-connect'), webEditorOrigin ? 200 : 401);
      assert.equal(await get('/editor/'), 401);
    } finally { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
  }
  await new Promise(resolve => upstream.close(resolve));
});

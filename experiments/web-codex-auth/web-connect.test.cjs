const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

test('direct web session survives popup close and refresh and rejects foreign messages', async () => {
  const origin = 'https://five-e-ai-runtime-probe.onrender.com';
  const store = new Map();
  const sessionStorage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  const popup = { closed: false, focus() {}, postMessage() {} };
  const calls = [];
  let receive, opened = 0;
  const boot = () => {
    const window = { addEventListener: (_, fn) => { receive = fn; }, open: () => { opened++; return popup; }, dispatchEvent() {} };
    const context = { window, location: { origin: 'https://www.5e.ai.kr' }, sessionStorage, Event, AbortSignal, screen: { width: 1280, height: 900 }, clearTimeout, setTimeout,
      fetch: async (...args) => { calls.push(args); return { ok: true, status: 200, json: async () => ({ login: { loggedIn: true }, server: true }) }; } };
    vm.runInNewContext(readFileSync(require.resolve('../../js/web-ai-connection.js'), 'utf8'), context);
    return window;
  };
  let window = boot();
  window.fiveEWebLogin();
  receive({ origin: 'https://evil.example', source: popup, data: { type: '5e:runtime-session', token: 'a'.repeat(64) } });
  assert.equal((await window.fiveEWebRequest('bridge-status')).login.loggedIn, false);
  receive({ origin, source: {}, data: { type: '5e:runtime-session', token: 'a'.repeat(64) } });
  assert.equal(store.size, 0);
  receive({ origin, source: popup, data: { type: '5e:runtime-session', token: 'a'.repeat(64) } });
  popup.closed = true;
  assert.equal((await window.fiveEWebRequest('bridge-status', { clientScope: 'workspace-2' })).login.loggedIn, true);
  assert.equal(calls[0][1].credentials, 'omit');
  assert.equal(calls[0][1].headers.Authorization, 'Bearer ' + 'a'.repeat(64));
  window = boot();
  assert.equal((await window.fiveEWebRequest('bridge-status')).login.loggedIn, true);
  window.fiveEWebLogin();
  assert.equal(opened, 1);
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

test('code popup stays available while a scoped ticket waits for authentication', async () => {
  const origin = 'https://five-e-ai-runtime-probe.onrender.com';
  const store = new Map(), events = [], timers = [];
  let receive, opened, signedIn = false;
  const popup = { closed: false, focused: false, messages: [], focus() { this.focused = true; }, postMessage(...args) { this.messages.push(args); }, close() { this.closed = true; } };
  const window = {
    addEventListener: (_, fn) => { receive = fn; },
    open: (...args) => { opened = args; return popup; },
    dispatchEvent: event => events.push(event),
  };
  const requests = [];
  vm.runInNewContext(readFileSync(require.resolve('../../js/web-ai-connection.js'), 'utf8'), {
    window, location: { origin: 'https://www.5e.ai.kr' }, screen: { width: 1280, height: 900 },
    sessionStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) },
    Event, CustomEvent, AbortSignal, URL,
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
    fetch: async (url, options) => {
      requests.push({url, options});
      return { ok: true, json: async () => signedIn ? { signedIn: true, token: 'a'.repeat(64) } : { state: 'waiting', signedIn: false } };
    },
  });
  window.fiveEWebLogin();
  assert.equal(opened[1], 'fivee-chatgpt-login');
  assert.match(opened[2], /popup=yes/);
  receive({ origin, source: popup, data: { type: '5e:login-ready', ticket: 'b'.repeat(64), userCode: 'TEST-CODE', authUrl: 'https://auth.openai.com/codex/device' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.size, 0);
  assert.equal(popup.closed, false);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer ' + 'b'.repeat(64));
  assert.ok(events.some(event => event.detail?.state === 'ready'));
  window.fiveEWebContinueLogin();
  assert.equal(popup.focused, true);
  assert.equal(popup.location, undefined, 'code popup must not navigate away');
  signedIn = true;
  timers.at(-1)();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.get('5e:web-ai-session'), 'a'.repeat(64));
  assert.equal(popup.messages.at(-1)[0].type, '5e:session-received');
  assert.equal(popup.messages.at(-1)[1], origin);
  timers.at(-1)();
  assert.equal(popup.closed, true);
});

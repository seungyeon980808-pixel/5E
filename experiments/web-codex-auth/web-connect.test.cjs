const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

test('direct web session survives popup close and refresh and rejects foreign messages', async () => {
  const origin = 'https://five-e-ai-runtime-probe.onrender.com';
  const store = new Map();
  const sessionStorage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  const popup = { location: { replace() {} }, closed: false, focus() {}, postMessage() {} };
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
  const popup = { location: { replace(url) { this.href = url; } }, closed: false, focused: false, messages: [], focus() { this.focused = true; }, postMessage(...args) { this.messages.push(args); }, close() { this.closed = true; } };
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
  assert.equal(opened[0], 'about:blank');
  assert.match(opened[1], /^fivee-chatgpt-login-/);
  assert.match(opened[2], /popup=yes/);
  receive({ origin, source: popup, data: { type: '5e:login-ready', ticket: 'b'.repeat(64), userCode: 'TEST-CODE', authUrl: 'https://auth.openai.com/codex/device' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.size, 0);
  assert.equal(popup.closed, false);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer ' + 'b'.repeat(64));
  assert.ok(events.some(event => event.detail?.state === 'ready'));
  window.fiveEWebContinueLogin();
  assert.equal(popup.focused, true);
  assert.match(popup.location.href, /web-connect.*flow=popup/, 'code popup must stay on the code page');
  signedIn = true;
  timers.at(-1)();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(store.get('5e:web-ai-session'), 'a'.repeat(64));
  assert.equal(popup.messages.at(-1)[0].type, '5e:session-received');
  assert.equal(popup.messages.at(-1)[1], origin);
  timers.at(-1)();
  assert.equal(popup.closed, true);
});

test('each closed code popup gets a new name and geometry before runtime navigation', () => {
  const openings = [], placements = [], children = [];
  const window = {
    addEventListener() {}, dispatchEvent() {},
    open(...args) {
      openings.push(args);
      const child = { closed: false, location: { replace: url => placements.push(['navigate', url]) },
        resizeTo: (...size) => placements.push(['resize', ...size]),
        moveTo: (...position) => placements.push(['move', ...position]), focus() {} };
      children.push(child); return child;
    },
  };
  vm.runInNewContext(readFileSync(require.resolve('../../js/web-ai-connection.js'), 'utf8'), {
    window, location: { origin: 'https://www.5e.ai.kr' },
    screen: { availWidth: 380, availHeight: 600, availLeft: -380, availTop: -600 },
    sessionStorage: { getItem() {} }, setTimeout() {}, clearTimeout() {},
  });
  window.fiveEWebLogin();
  children[0].closed = true;
  window.fiveEWebLogin();
  assert.notEqual(openings[0][1], openings[1][1]);
  assert.equal(openings[0][0], 'about:blank');
  assert.deepEqual(placements.slice(0, 2), [['resize', 380, 600], ['move', -380, -600]]);
  assert.equal(placements[2][0], 'navigate');
  assert.match(placements[2][1], /web-connect.*flow=popup/);
});

test('retry after manually closing code popup cancels the old ticket and timer', async () => {
  const origin = 'https://five-e-ai-runtime-probe.onrender.com';
  const requests = [], cleared = [], timers = [], children = [];
  let receive;
  const window = {
    addEventListener: (_, listener) => { receive = listener; }, dispatchEvent() {},
    open() {
      const child = { closed: false, location: { replace() {} }, focus() {}, postMessage() {} };
      children.push(child); return child;
    },
  };
  vm.runInNewContext(readFileSync(require.resolve('../../js/web-ai-connection.js'), 'utf8'), {
    window, location: { origin: 'https://www.5e.ai.kr' }, screen: { width: 1280, height: 900 },
    sessionStorage: { getItem() {} }, CustomEvent, AbortSignal,
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: id => cleared.push(id),
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ signedIn: false, state: 'waiting' }) };
    },
  });
  window.fiveEWebLogin();
  receive({ origin, source: children[0], data: { type: '5e:login-ready', ticket: 'b'.repeat(64) } });
  await new Promise(resolve => setImmediate(resolve));
  const priorTimer = timers.length;
  children[0].closed = true;
  window.fiveEWebLogin();
  assert.ok(cleared.includes(priorTimer), 'the previous attempt must not retain a timeout');
  const cancellation = requests.find(request => request.url.endsWith('/web-login-cancel'));
  assert.ok(cancellation, 'the previous scoped ticket is cancelled on retry');
  assert.equal(cancellation.options.headers.Authorization, 'Bearer ' + 'b'.repeat(64));
  receive({ origin, source: children[0], data: { type: '5e:login-ready', ticket: 'c'.repeat(64) } });
  assert.equal(requests.filter(request => request.url.endsWith('/web-login-status')).length, 1, 'the old popup cannot restart polling');
});

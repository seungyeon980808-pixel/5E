const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

const ticket = 'b'.repeat(64), token = 'a'.repeat(64);
const authUrl = 'https://auth.openai.com/codex/device';
const flush = () => new Promise(resolve => setImmediate(resolve));
function boot({ start, status, store = new Map(), blocked = false, document = { fullscreenElement: null } } = {}) {
  const requests = [], openings = [], children = [], events = [], geometry = [], timers = new Map(), listeners = {};
  let timerId = 0;
  const window = {
    innerWidth: 1440, innerHeight: 800, outerWidth: 1440, outerHeight: 900, screenX: 0, screenY: 0,
    addEventListener(type, listener) { listeners[type] = listener; },
    dispatchEvent(event) { events.push(event); },
    open(...args) {
      openings.push(args);
      if (blocked) return null;
      const child = { closed: false, focused: 0, close() { this.closed = true; }, focus() { this.focused++; },
        resizeTo: (...args) => geometry.push(['resize', ...args]), moveTo: (...args) => geometry.push(['move', ...args]),
        location: { replace: url => geometry.push(['navigate', url]) } };
      children.push(child); return child;
    },
  };
  vm.runInNewContext(readFileSync(require.resolve('../../js/web-ai-connection.js'), 'utf8'), {
    window, document, location: { origin: 'https://www.5e.ai.kr' }, screen: { availWidth: 1440, availHeight: 900 },
    sessionStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) },
    URL, Event, CustomEvent, AbortSignal,
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
    fetch: async (url, options) => {
      requests.push({ url, options });
      const result = url.endsWith('/web-login-start') ? await (start?.() ?? { ticket, userCode: 'TEST-CODE', authUrl })
        : url.endsWith('/web-login-status') ? await (status?.() ?? { signedIn: false, state: 'waiting' })
        : url.endsWith('/bridge-status') ? { login: { loggedIn: true }, server: true } : {};
      return { ok: true, status: 200, json: async () => result };
    },
  });
  return { window, requests, openings, children, events, geometry, timers, listeners, store };
}

test('login prepares a scoped code without opening any window; authentication opens one official popup synchronously', async () => {
  const f = boot();
  const preparation = f.window.fiveEWebLogin();
  assert.equal(f.openings.length, 0);
  await preparation;
  await flush();
  assert.equal(f.openings.length, 0);
  const request = f.requests[0];
  assert.ok(request.url.endsWith('/web-login-start'));
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.headers['X-5E-Request'], '1');
  assert.equal(request.options.headers.Authorization, undefined);
  assert.ok(f.events.some(event => event.detail?.state === 'ready' && event.detail.userCode === 'TEST-CODE'));
  assert.equal(await f.window.fiveEWebContinueLogin(), true);
  assert.equal(f.openings.length, 1);
  assert.equal(f.openings[0][0], 'about:blank');
  assert.match(f.openings[0][2], /width=560,height=700/);
  assert.deepEqual(f.geometry.map(call => call[0]), ['resize', 'move']);
  [...f.timers.values()].at(-1)();
  assert.equal(f.geometry.at(-1)[1], authUrl);
  assert.equal(await f.window.fiveEWebContinueLogin(), true);
  assert.equal(f.openings.length, 1);
  assert.equal(f.children[0].focused, 1);
});

test('ticket polling closes authentication and stores only a session capability that survives reload', async () => {
  let signedIn = false;
  const f = boot({ status: () => signedIn ? { signedIn, token } : { signedIn, state: 'waiting' } });
  await f.window.fiveEWebLogin(); await flush();
  await f.window.fiveEWebContinueLogin();
  assert.equal(f.store.size, 0);
  assert.equal(f.requests.find(request => request.url.endsWith('/web-login-status')).options.headers.Authorization, `Bearer ${ticket}`);
  signedIn = true;
  f.timers.values().next().value(); await flush();
  assert.equal(f.children[0].closed, true);
  assert.deepEqual([...f.store], [['5e:web-ai-session', token]]);
  const reloaded = boot({ store: f.store });
  assert.equal((await reloaded.window.fiveEWebRequest('bridge-status')).login.loggedIn, true);
  assert.equal(reloaded.requests[0].options.headers.Authorization, `Bearer ${token}`);
  await reloaded.window.fiveEWebLogin();
  assert.equal(reloaded.openings.length, 0);
  assert.equal(reloaded.requests.length, 1);
});

test('postMessage cannot supply a session capability', async () => {
  const f = boot();
  for (const origin of ['https://five-e-ai-runtime-probe.onrender.com', 'https://evil.example']) {
    f.listeners.message?.({ origin, source: f.children[0], data: { type: '5e:runtime-session', token } });
  }
  assert.equal(f.store.size, 0);
  assert.equal((await f.window.fiveEWebRequest('bridge-status')).login.loggedIn, false);
});

test('untrusted authentication URLs cancel the ticket and never open a popup', async () => {
  for (const url of ['https://evil.example/login', 'http://auth.openai.com/login', 'https://user@auth.openai.com/login', 'https://auth.openai.com:8443/login']) {
    const f = boot({ start: () => ({ ticket, userCode: 'TEST-CODE', authUrl: url }) });
    await f.window.fiveEWebLogin(); await flush();
    assert.equal(await f.window.fiveEWebContinueLogin(), false);
    assert.equal(f.openings.length, 0);
    assert.ok(f.events.some(event => event.detail?.state === 'error'));
    assert.equal(f.requests.find(request => request.url.endsWith('/web-login-cancel')).options.headers.Authorization, `Bearer ${ticket}`);
  }
});

test('cancel during preparation isolates a retry and cancels the late old ticket', async () => {
  let finishOld, calls = 0;
  const old = new Promise(resolve => { finishOld = resolve; });
  const newerTicket = 'c'.repeat(64);
  const f = boot({ start: () => ++calls === 1 ? old : { ticket: newerTicket, userCode: 'NEW-CODE', authUrl } });
  const first = f.window.fiveEWebLogin();
  f.window.fiveEWebCancelLogin();
  await f.window.fiveEWebLogin(); await flush();
  finishOld({ ticket, userCode: 'OLD-CODE', authUrl });
  await first; await flush();
  assert.deepEqual(f.events.filter(event => event.detail?.state === 'ready').map(event => event.detail.userCode), ['NEW-CODE']);
  assert.equal(f.requests.find(request => request.url.endsWith('/web-login-cancel')).options.headers.Authorization, `Bearer ${ticket}`);
  assert.equal(f.requests.find(request => request.url.endsWith('/web-login-status')).options.headers.Authorization, `Bearer ${newerTicket}`);
  assert.equal(f.openings.length, 0);
  assert.equal(await f.window.fiveEWebContinueLogin(), true);
});

test('cancelling a pending status response closes the popup and rejects late completion', async () => {
  let finishStatus;
  const f = boot({ status: () => new Promise(resolve => { finishStatus = resolve; }) });
  await f.window.fiveEWebLogin();
  await f.window.fiveEWebContinueLogin();
  f.window.fiveEWebCancelLogin();
  assert.equal(f.children[0].closed, true);
  finishStatus({ signedIn: true, token }); await flush();
  assert.equal(f.store.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(await f.window.fiveEWebContinueLogin(), false);
});

test('blocked authentication popup reports a recoverable blocked state', async () => {
  const f = boot({ blocked: true });
  await f.window.fiveEWebLogin();
  assert.equal(await f.window.fiveEWebContinueLogin(), false);
  assert.ok(f.events.some(event => event.detail?.state === 'blocked'));
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

 test('authentication popup sits to the right of the code dialog and follows the fullscreen exit geometry', async () => {
  const f = boot();
  await f.window.fiveEWebLogin(); await flush();
  await f.window.fiveEWebContinueLogin();
  const layout = f.events.find(event => event.detail?.state === 'layout')?.detail;
  assert.ok(layout?.paired, 'the code dialog and popup must share one paired layout');
  const move = f.geometry.find(call => call[0] === 'move');
  assert.ok(move[1] >= f.window.screenX + layout.codeLeft + layout.codeWidth + 16);
  assert.equal(f.geometry.some(call => call[0] === 'navigate'), false, 'wait for Safari fullscreen resize before external navigation');
  f.window.innerWidth = 1100; f.window.screenX = 120;
  f.listeners.resize();
  const settle = [...f.timers.values()].at(-1); settle();
  const after = f.events.filter(event => event.detail?.state === 'layout').at(-1).detail;
  assert.ok(f.geometry.filter(call => call[0] === 'move').at(-1)[1] >= 120 + after.codeLeft + after.codeWidth + 16);
  assert.equal(f.geometry.at(-1)[1], authUrl);
 });

test('fullscreen settles during code preparation so authentication still opens from a direct user click', async () => {
  let finishExit;
  const document = { fullscreenElement: {}, exitFullscreen: () => new Promise(resolve => { finishExit = () => { document.fullscreenElement = null; resolve(); }; }) };
  const f = boot({ document });
  const preparing = f.window.fiveEWebLogin();
  assert.equal(f.openings.length, 0);
  assert.equal(f.requests.length, 0);
  finishExit(); await preparing; await flush();
  const authenticating = f.window.fiveEWebContinueLogin();
  assert.equal(f.openings.length, 1, 'popup must open synchronously in the second click');
  assert.equal(await authenticating, true);
});

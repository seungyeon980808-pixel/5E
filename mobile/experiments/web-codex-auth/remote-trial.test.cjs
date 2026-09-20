const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createTrialProxy, createTrialAuth } = require('./remote-trial.cjs');
const { EventEmitter } = require('node:events');
const { createServer } = require('./server.cjs');
const { createGateway } = require('./editor-gateway.cjs');
const { spawnSync } = require('node:child_process');
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const close = server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
test('trial admits five isolated sessions, rejects overflow, and releases a logged-out slot', async () => {
  const directories = new Set();
  let created = 0;
  class FakeRuntime extends EventEmitter {
    constructor() { super(); this.signedIn = created++ === 0; }
    async init() {}
    async rpc(method) {
      if (method === 'account/read') return { account: this.signedIn ? { type: 'chatgpt' } : null };
      if (method === 'account/logout') this.signedIn = false;
      return {};
    }
    close() {}
  }
  const server = createTrialAuth({ runtimeFactory: directory => { directories.add(directory); return new FakeRuntime(); } });
  await listen(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (action, cookie = '') => fetch(base + '/api/' + action, { method: 'POST', headers: { Origin: base, 'X-5E-Request': '1', Cookie: cookie } });
  try {
    const responses = await Promise.all(Array.from({ length: 7 }, () => post('session')));
    const accepted = responses.filter(response => response.status === 200);
    assert.equal(accepted.length, 5);
    assert.equal(responses.filter(response => response.status === 429).length, 2);
    assert.equal(created, 5);
    assert.equal(directories.size, 5);
    const cookies = accepted.map(response => response.headers.get('set-cookie').split(';')[0]);
    assert.equal(new Set(cookies).size, 5);
    const states = await Promise.all(cookies.map(async cookie => {
      const response = await post('session', cookie);
      assert.equal(response.status, 200);
      return response.json();
    }));
    assert.equal(states.filter(state => state.signedIn).length, 1);
    assert.equal(created, 5);
    const logout = await post('logout', cookies[0]);
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
    assert.equal((await post('status', cookies[0])).status, 401, 'status polling cannot recreate a logged-out session');
    const replacement = await post('session');
    assert.equal(replacement.status, 200);
    assert.equal(created, 6, 'a new browser can use the released slot');
  } finally { await close(server); }
});
test('trial limit can be raised and invalid configuration fails before runtime creation', async () => {
  const server = createTrialAuth({ maxSessions: '6', runtimeFactory: () => {
    const runtime = new EventEmitter();
    runtime.init = async () => {};
    runtime.rpc = async () => ({ account: null });
    runtime.close = () => {};
    return runtime;
  } });
  await listen(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (let index = 0; index < 7; index++) {
      const response = await fetch(base + '/api/session', { method: 'POST', headers: { Origin: base, 'X-5E-Request': '1' } });
      assert.equal(response.status, index < 6 ? 200 : 429);
    }
  } finally { await close(server); }
  for (const maxSessions of ['', '0', '-1', '1.5', 'abc', 'Infinity', '9007199254740992']) {
    assert.throws(() => createTrialAuth({ maxSessions }), /positive integer/);
    assert.throws(() => createTrialAuth({ maxRunningGenerations: maxSessions }), /TRIAL_MAX_RUNNING_GENERATIONS.*positive integer/);
  }
});
test('trial defaults global generation capacity to five while accepting an explicit override', async t => {
  const started = [];
  const runtimeFactory = () => {
    const runtime = new EventEmitter();
    runtime.init = async () => {};
    runtime.directory = '/tmp/5e-trial-default-test';
    runtime.rpc = async method => {
      if (method === 'account/read') return { account: { type: 'chatgpt' } };
      if (method === 'thread/start') return { thread: { id: `thread-${started.length + 1}` } };
      if (method === 'turn/start') {
        const turnId = `turn-${started.length + 1}`;
        started.push(turnId);
        return { turn: { id: turnId } };
      }
      return {};
    };
    runtime.close = () => {};
    return runtime;
  };
  const defaults = createTrialAuth({ runtimeFactory });
  await listen(defaults);
  t.after(() => defaults.listening ? close(defaults) : undefined);
  const base = `http://127.0.0.1:${defaults.address().port}`;
  const headers = { Origin: base, 'X-5E-Request': '1', 'Content-Type': 'application/json' };
  const session = await fetch(base + '/api/session', { method: 'POST', headers });
  headers.Cookie = session.headers.get('set-cookie').split(';')[0];
  const payload = index => ({ clientScope: `scope-${index}`, purpose: 'image', text: `crop ${index}`,
    attachments: [], model: 'gpt-5.6-sol', effort: 'medium', serviceTier: 'priority' });
  await Promise.all(Array.from({ length: 6 }, (_, index) => fetch(base + '/api/bridge-send', {
    method: 'POST', headers, body: JSON.stringify(payload(index)),
  })));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(started.length, 5);
  await close(defaults);

  started.length = 0;
  const overridden = createTrialAuth({ runtimeFactory, maxRunningGenerations: '7' });
  await listen(overridden);
  t.after(() => overridden.listening ? close(overridden) : undefined);
  const overrideBase = `http://127.0.0.1:${overridden.address().port}`;
  headers.Origin = overrideBase;
  const overrideSession = await fetch(overrideBase + '/api/session', { method: 'POST', headers });
  headers.Cookie = overrideSession.headers.get('set-cookie').split(';')[0];
  await Promise.all(Array.from({ length: 6 }, (_, index) => fetch(overrideBase + '/api/bridge-send', {
    method: 'POST', headers, body: JSON.stringify(payload(index)),
  })));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(started.length, 6);
  await close(overridden);
});
test('trial CLI help reports both safe defaults without starting a server', () => {
  const result = spawnSync(process.execPath, [require.resolve('./remote-trial.cjs'), '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /TRIAL_MAX_SESSIONS=5/);
  assert.match(result.stdout, /TRIAL_MAX_RUNNING_GENERATIONS=5/);
});
test('private proxy requires invitation, rejects cross-origin posts, and secures upstream cookies', async () => {
  let hits = 0;
  const internal = http.createServer((req, res) => {
    hits++; res.setHeader('Set-Cookie', 'fivee_auth_123=x; HttpOnly; SameSite=Strict; Path=/');
    res.end(JSON.stringify({ host: req.headers.host, origin: req.headers.origin, cookie: req.headers.cookie }));
  });
  await listen(internal);
  const key = 'a'.repeat(64);
  const proxy = createTrialProxy({ gatewayPort: internal.address().port, publicOrigin: 'https://trial.example', accessKey: key });
  await listen(proxy);
  const base = `http://127.0.0.1:${proxy.address().port}`;
  const request = (path, options = {}) => new Promise((resolve, reject) => {
    const req = http.request(base + path, { ...options, headers: { Host: 'trial.example', ...options.headers } }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: new Headers(response.headers), json: async () => JSON.parse(Buffer.concat(chunks).toString()) }));
    }); req.on('error', reject); req.end();
  });
  try {
    assert.equal((await request('/healthz')).status, 200);
    assert.equal((await request('/api/session', { method: 'POST', headers: { Origin: 'https://trial.example' } })).status, 401);
    assert.equal(hits, 0);
    assert.equal((await request('/trial/' + 'b'.repeat(64))).status, 401);
    const invitation = await request('/trial/' + key);
    assert.equal(invitation.status, 303);
    assert.match(invitation.headers.get('set-cookie'), /Secure; HttpOnly; SameSite=Strict/);
    const cookie = invitation.headers.get('set-cookie').split(';')[0];
    assert.equal((await request('/api/status', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://evil.example' } })).status, 403);
    const accepted = await request('/api/status', { method: 'POST', headers: { Cookie: cookie + '; fivee_auth_123=x', Origin: 'https://trial.example' } });
    assert.equal(accepted.status, 200);
    assert.match(accepted.headers.get('set-cookie'), /Secure/);
    const result = await accepted.json();
    assert.equal(result.origin, `http://127.0.0.1:${internal.address().port}`);
    assert.equal(result.cookie.trim(), 'fivee_auth_123=x');
    assert.equal(hits, 1);
  } finally { await close(proxy); await close(internal); }
});
test('trial editor can open without starting Codex or logging in', async () => {
  let starts = 0;
  const auth = createServer({ runtimeFactory: () => { starts++; throw new Error('Must not start'); } });
  await listen(auth);
  const gateway = createGateway({ authPort: auth.address().port, allowAnonymousEditor: true });
  await listen(gateway);
  try {
    const response = await fetch(`http://127.0.0.1:${gateway.address().port}/editor/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /js\/main.js/);
    const origin = 'http://127.0.0.1:' + gateway.address().port;
    const status = await fetch(origin + '/api/bridge-status', { method: 'POST', headers: { Origin: origin, 'X-5E-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ clientScope: '' }) });
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), { login: { loggedIn: false }, server: false });
    assert.equal(starts, 0);
  } finally { await close(gateway); await close(auth); }
});

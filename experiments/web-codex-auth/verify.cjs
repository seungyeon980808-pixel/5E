const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createServer } = require('./server.cjs');
const { Session } = require('./session.cjs');
const { allowed } = require('./runtime.cjs');
const { writeFileSync } = require('node:fs');
class FakeRuntime extends EventEmitter {
  constructor() { super(); this.calls = []; this.auth = false; this.serial = 0; }
  async init() {}
  close() {}
  async rpc(method, params) {
    this.calls.push(method);
    if (method === 'account/read') return { account: this.auth ? { type: 'chatgpt', email: 'PRIVATE', accessToken: 'SECRET' } : null };
    if (method === 'account/login/start') return { type: 'chatgpt', loginId: String(++this.serial), authUrl: 'https://auth.openai.com/oauth/authorize?state=synthetic-test' };
    if (method === 'account/logout') this.auth = false;
    return {};
  }
}
async function main() {
  const real = process.argv.includes('--real');
  const instances = [];
  const server = createServer(real ? {} : { runtimeFactory: () => { const runtime = new FakeRuntime(); instances.push(runtime); return runtime; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  function client() {
    let cookie = '';
    return async (action, extra = {}) => {
      const res = await fetch(base + '/api/' + action, { method: 'POST', headers: { Origin: base, 'X-5E-Request': '1', Cookie: cookie, ...extra } });
      if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
      return { status: res.status, body: await res.json() };
    };
  }
  const checks = [];
  let passed = false;
  try {
    const a = client(), b = client();
    assert.equal((await a('session')).body.signedIn, false);
    assert.equal((await b('session')).body.signedIn, false);
    checks.push('two clean unauthenticated sessions');
    const start = await a('login');
    if (start.status !== 200) { checks.push('browser-login request failed (sanitized): HTTP ' + start.status); throw new Error('Browser login start failed'); }
    assert.equal(start.body.state, 'waiting');
    assert.ok(start.body.authUrl);
    assert.equal(new URL(start.body.authUrl).protocol, 'https:');
    assert.equal((await a('status')).body.authUrl, start.body.authUrl);
    assert.equal((await b('status')).body.authUrl, undefined);
    assert.equal((await b('status')).body.signedIn, false);
    checks.push('browser-login start; reconnect to pending login; separate session stays unsigned');
    assert.equal((await a('cancel')).body.state, 'cancelled');
    assert.equal((await a('status')).body.authUrl, undefined);
    checks.push('cancel clears browser ceremony');
    if (!real) {
      instances[0].emit('login', { loginId: '1', success: true });
      assert.equal((await a('status')).body.state, 'cancelled');
      await a('login');
      instances[0].auth = true;
      instances[0].emit('login', { loginId: '2', success: true });
      const signed = await a('status');
      assert.equal(signed.body.signedIn, true);
      assert.equal(JSON.stringify(signed).includes('SECRET'), false);
      assert.equal(JSON.stringify(signed).includes('PRIVATE'), false);
      assert.equal((await b('status')).body.signedIn, false);
      checks.push('SYNTHETIC completion, stale event ignored, PII filtering, signed-in isolation');
      const runtime = new FakeRuntime();
      const session = new Session(runtime, { loginTimeout: 20 });
      await session.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal((await session.status()).state, 'local-timeout');
      await session.start();
      runtime.emit('login', { loginId: '2', success: false, error: 'expired SECRET' });
      await session.tail;
      assert.equal((await session.status()).state, 'login-failed');
      session.close();
      checks.push('SYNTHETIC local deadline and provider failure event (not real provider expiry)');
    }
    assert.equal((await a('logout')).body.signedIn, false);
    assert.equal((await b('status')).body.signedIn, false);
    checks.push(real ? 'logout RPC while unsigned (authenticated logout unverified)' : 'SYNTHETIC authenticated logout');
    assert.equal((await a('status', { Origin: 'https://evil.example' })).status, 403);
    const badHostStatus = await new Promise(resolve => {
      const req = require('node:http').request(base + '/api/status', { method: 'POST', headers: { Host: 'evil.example', Origin: base, 'X-5E-Request': '1' } }, res => { res.resume(); resolve(res.statusCode); });
      req.end();
    });
    assert.equal(badHostStatus, 403);
    assert.equal((await a('status', { 'X-5E-Request': '' })).status, 403);
    assert.equal((await client()('status')).status, 401);
    assert.equal((await a('turn/start')).status, 404);
    assert.equal(allowed.has('command/exec'), false);
    assert.equal(allowed.has('exec/command'), false);
    checks.push('cross-origin/host/CSRF/unknown session rejected; arbitrary RPC routes and command execution forbidden');
    if (!real) {
      instances[0].dead = true;
      assert.equal((await a('session')).body.signedIn, false);
      assert.equal(instances.length, 3);
      checks.push('SYNTHETIC dead-runtime reconnect creates a clean session');
    }
    passed = true;
    console.log(JSON.stringify({ passed, mode: real ? 'real local Codex, no user sign-in' : 'synthetic runtime over real HTTP', checks, generationCalls: 0 }, null, 2));
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    writeFileSync(require('node:path').join(__dirname, real ? 'real-result.json' : 'synthetic-result.json'), JSON.stringify({ passed, checkedAt: new Date().toISOString(), mode: real ? 'real-local-unauthenticated' : 'synthetic', checks, generationCalls: 0 }, null, 2) + '\n');
  }
}
main().catch(() => { console.error('Verification failed; inspect sanitized check list.'); process.exitCode = 1; });

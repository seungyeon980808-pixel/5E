const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { createServer } = require('./server.cjs');
const { createGateway } = require('./editor-gateway.cjs');
const { createTrialProxy } = require('./remote-trial.cjs');

test('direct CORS capability is authenticated, isolated, scoped and revoked on logout', async t => {
  let count = 0;
  class Runtime extends EventEmitter {
    constructor() { super(); this.id = ++count; this.signedIn = false; }
    async init() {}
    close() {}
    async rpc(method) {
      if (method === 'account/login/start') return { type: 'chatgptDeviceCode', loginId: 'login-' + this.id, verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'TEST-CODE' };
      if (method === 'account/read') return { account: this.signedIn ? { type: 'chatgpt' } : null };
      if (method === 'model/list') return { data: [{ id: `user-${this.id}` }] };
      if (method === 'account/logout') this.signedIn = false;
      return {};
    }
  }
  const runtimes = [];
  const auth = createServer({ sessionOptions: { loginMode: 'chatgptDeviceCode' }, runtimeFactory: () => { const runtime = new Runtime(); runtimes.push(runtime); return runtime; } });
  await new Promise(resolve => auth.listen(0, '127.0.0.1', resolve));
  const gateway = createGateway({ authPort: auth.address().port });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  const proxy = createTrialProxy({ gatewayPort: gateway.address().port, publicOrigin: 'https://runtime.example', accessKey: 'a'.repeat(64), webEditorOrigin: 'https://www.5e.ai.kr' });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const server of [proxy, gateway, auth]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } });
  const request = (action, headers = {}, method = 'POST') => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: proxy.address().port, path: '/api/' + action, method,
      headers: { Host: 'runtime.example', Origin: 'https://runtime.example', 'X-5E-Request': '1', 'Content-Type': 'application/json', ...headers } }, response => {
      const chunks = []; response.on('data', c => chunks.push(c)); response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, text: Buffer.concat(chunks).toString() }));
    }); req.on('error', reject); req.end(method === 'POST' ? JSON.stringify({ clientScope: 'same-workspace' }) : undefined);
  });
  const a = await request('session'); const cookieA = a.headers['set-cookie'][0].split(';')[0];
  assert.equal((await request('web-session', { Cookie: cookieA })).status, 401);
  const pending = JSON.parse((await request('web-login-start', { Cookie: cookieA })).text);
  assert.match(pending.ticket, /^[a-f0-9]{64}$/);
  const pendingHeaders = { Origin: 'https://www.5e.ai.kr', Authorization: 'Bearer ' + pending.ticket, 'Sec-Fetch-Site': 'cross-site' };
  assert.equal((await request('bridge-models', pendingHeaders)).status, 401);
  assert.equal(JSON.parse((await request('web-login-status', pendingHeaders)).text).signedIn, false);
  runtimes[0].signedIn = true;
  assert.match(JSON.parse((await request('web-login-status', pendingHeaders)).text).token, /^[a-f0-9]{64}$/);
  const tokenA = JSON.parse((await request('web-session', { Cookie: cookieA })).text).token;
  const b = await request('session'); const cookieB = b.headers['set-cookie'][0].split(';')[0]; runtimes[1].signedIn = true;
  const tokenB = JSON.parse((await request('web-session', { Cookie: cookieB })).text).token;
  assert.notEqual(tokenA, tokenB);
  const direct = token => ({ Origin: 'https://www.5e.ai.kr', Authorization: 'Bearer ' + token, 'Sec-Fetch-Site': 'cross-site' });
  for (const [token, user] of [[tokenA, 'user-1'], [tokenB, 'user-2']]) {
    const result = await request('bridge-models', direct(token));
    assert.equal(result.status, 200); assert.equal(result.headers['access-control-allow-origin'], 'https://www.5e.ai.kr');
    assert.equal(result.headers['set-cookie'], undefined); assert.equal(JSON.parse(result.text).data[0].id, user);
  }
  const preflight = await request('bridge-send', { Origin: 'https://www.5e.ai.kr', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type,x-5e-request' }, 'OPTIONS');
  assert.equal(preflight.status, 204);
  assert.equal((await request('bridge-send', { Origin: 'https://www.5e.ai.kr', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-secret' }, 'OPTIONS')).status, 403);
  assert.equal((await request('bridge-status', { ...direct(tokenA), Host: 'evil.example' })).status, 403);
  assert.equal(JSON.parse((await request('bridge-models', { ...direct(tokenA), Cookie: cookieB })).text).data[0].id, 'user-1');
  assert.equal((await request('bridge-status', { ...direct(tokenA), Origin: 'https://evil.example' })).status, 403);
  assert.equal((await request('session', direct(tokenA))).status, 403);
  assert.equal((await request('bridge-status', direct('f'.repeat(64)))).status, 401);
  await request('logout', { Cookie: cookieA });
  assert.equal((await request('bridge-status', direct(tokenA))).status, 401);
  assert.equal((await request('bridge-status', direct(tokenB))).status, 200);
});

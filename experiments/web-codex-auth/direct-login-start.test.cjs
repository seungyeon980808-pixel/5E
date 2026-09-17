const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { createServer } = require('./server.cjs');
const { createGateway } = require('./editor-gateway.cjs');
const { createTrialProxy } = require('./remote-trial.cjs');
test('cookie-free login start isolates users, limits sessions and scopes ticket status/cancel', async t => {
  const runtimes = [];
  class Runtime extends EventEmitter {
    async init() {} close() { this.closed = true; }
    async rpc(method) {
      if (method === 'account/read') return { account: this.signedIn ? { type: 'chatgpt' } : null };
      if (method === 'account/login/start') return { type: 'chatgptDeviceCode', loginId: 'test', verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'TEST-CODE' };
      return {};
    }
  }
  const auth = createServer({ maxSessions: 2, sessionOptions: { loginMode: 'chatgptDeviceCode' }, runtimeFactory: () => { const runtime = new Runtime(); runtimes.push(runtime); return runtime; } });
  await new Promise(r => auth.listen(0, '127.0.0.1', r));
  const gateway = createGateway({ authPort: auth.address().port });
  await new Promise(r => gateway.listen(0, '127.0.0.1', r));
  const proxy = createTrialProxy({ gatewayPort: gateway.address().port, publicOrigin: 'https://runtime.example', accessKey: 'a'.repeat(64), webEditorOrigin: 'https://www.5e.ai.kr' });
  await new Promise(r => proxy.listen(0, '127.0.0.1', r));
  t.after(async () => { for (const server of [proxy, gateway, auth]) { server.closeAllConnections(); await new Promise(r => server.close(r)); } });
  const request = (action, ticket, headers = {}, method = 'POST') => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: proxy.address().port, path: '/api/' + action, method,
      headers: { Host: 'runtime.example', Origin: 'https://www.5e.ai.kr', 'X-5E-Request': '1', 'Sec-Fetch-Site': 'cross-site', ...(ticket ? { Authorization: 'Bearer ' + ticket } : {}), ...headers } }, response => {
      const chunks = []; response.on('data', c => chunks.push(c)); response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, text: Buffer.concat(chunks).toString() }));
    }); req.on('error', reject); req.end();
  });
  assert.equal((await request('web-login-start', null, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await request('web-login-start', null, { 'X-5E-Request': '' })).status, 401);
  const preflight = await request('web-login-start', null, { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-5e-request' }, 'OPTIONS');
  assert.equal(preflight.status, 204);
  const a = await request('web-login-start'); const b = await request('web-login-start');
  assert.equal(a.status, 200); assert.equal(a.headers['set-cookie'], undefined);
  const ticketA = JSON.parse(a.text).ticket, ticketB = JSON.parse(b.text).ticket;
  assert.equal(JSON.parse(a.text).userCode, 'TEST-CODE'); assert.notEqual(ticketA, ticketB);
  assert.equal((await request('web-login-start')).status, 429);
  assert.equal((await request('bridge-status', ticketA)).status, 401);
  assert.equal((await request('web-login-status', 'f'.repeat(64))).status, 401);
  assert.equal(JSON.parse((await request('web-login-status', ticketB)).text).signedIn, false);
  runtimes[0].signedIn = true;
  const signed = JSON.parse((await request('web-login-status', ticketA)).text);
  assert.equal(signed.signedIn, true); assert.match(signed.token, /^[a-f0-9]{64}$/);
  assert.equal((await request('web-login-status', signed.token)).status, 401);
  assert.equal(JSON.parse((await request('web-login-status', ticketB)).text).signedIn, false);
  assert.equal((await request('web-login-cancel', ticketB)).status, 200);
  assert.equal(runtimes[1].closed, true);
  assert.equal((await request('web-login-status', ticketB)).status, 401);
  assert.equal((await request('web-login-start')).status, 200);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createTrialProxy } = require('./remote-trial.cjs');
const { createServer } = require('./server.cjs');
const { createGateway } = require('./editor-gateway.cjs');
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const close = server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
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
    assert.equal(starts, 0);
  } finally { await close(gateway); await close(auth); }
});

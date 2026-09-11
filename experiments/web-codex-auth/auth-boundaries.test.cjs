const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { EventEmitter } = require('node:events');
const { createServer } = require('./server.cjs');
const { createGateway } = require('./editor-gateway.cjs');
class FakeRuntime extends EventEmitter {
  async init() {}
  close() {}
  async rpc(method) {
    if (method === 'account/read') return { account: null };
    return {};
  }
}
async function fixture(t, options = {}) {
  let created = 0;
  const server = createServer({ runtimeFactory: () => { created++; return new FakeRuntime(); }, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (action, cookie = '') => fetch(base + '/api/' + action, { method: 'POST', headers: { Origin: base, 'X-5E-Request': '1', Cookie: cookie } });
  return { server, base, post, created: () => created };
}
test('auth cookie is recognized after other browser cookies', async t => {
  const { post, created } = await fixture(t);
  const initial = await post('session');
  const cookie = initial.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('status', cookie)).status, 200);
  assert.equal((await post('status', 'preference=dark; ' + cookie)).status, 200);
  assert.equal((await post('session', 'preference=dark; ' + cookie + '; other=1')).status, 200);
  assert.equal(created(), 1);
});
test('session cap applies before allocating another runtime; unknown cookie is not adopted', async t => {
  const { post, created } = await fixture(t, { maxSessions: 1 });
  assert.equal((await post('session')).status, 200);
  assert.equal((await post('session')).status, 429);
  assert.equal((await post('status', 'fivee_auth=forged')).status, 401);
  assert.equal(created(), 1);
});
test('concurrent creation cannot overrun the session cap', async t => {
  const { post, created } = await fixture(t, { maxSessions: 2 });
  const statuses = await Promise.all(Array.from({ length: 6 }, async () => (await post('session')).status));
  assert.equal(statuses.filter(code => code === 200).length, 2);
  assert.equal(statuses.filter(code => code === 429).length, 4);
  assert.equal(created(), 2);
});
test('gateway fails closed while authentication service is unavailable and recovers', async t => {
  const auth = await fixture(t);
  const authPort = auth.server.address().port;
  await new Promise(resolve => auth.server.close(resolve));
  const gateway = createGateway({ authPort });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  t.after(async () => { gateway.closeAllConnections(); await new Promise(resolve => gateway.close(resolve)); });
  const base = `http://127.0.0.1:${gateway.address().port}`;
  const failed = await fetch(base + '/editor/');
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /js\/main.js/);
  assert.equal((await fetch(base + '/api/status', { method: 'POST', headers: { Origin: base, 'X-5E-Request': '1' } })).status, 503);
  await new Promise(resolve => auth.server.listen(authPort, '127.0.0.1', resolve));
  assert.equal((await fetch(base + '/editor/', { redirect: 'manual' })).status, 302);
});
test('gateway rejects malformed request targets and wrong Host without crashing', async t => {
  const auth = await fixture(t);
  const gateway = createGateway({ authPort: auth.server.address().port });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  t.after(async () => { gateway.closeAllConnections(); await new Promise(resolve => gateway.close(resolve)); });
  const base = `http://127.0.0.1:${gateway.address().port}`;
  const badHost = await new Promise(resolve => {
    http.get(base, { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); });
  });
  assert.equal(badHost, 403);
  const badPath = await fetch(base + '/editor/assets/%E0%A4%A');
  assert.equal(badPath.status, 400);
  assert.equal((await fetch(base + '/editor/assets/logo.svg')).status, 200);
});

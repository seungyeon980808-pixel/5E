const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createServer } = require('./server.cjs');
const { createGateway } = require('./editor-gateway.cjs');
class FakeAuth extends EventEmitter {
  async init() { this.signedIn = false; }
  close() {}
  async rpc(method) {
    if (method === 'account/read') return { account: this.signedIn ? { type: 'chatgpt' } : null };
    if (method === 'account/logout') this.signedIn = false;
    return {};
  }
}
test('gateway routes the same session into editor and fails closed without it', async () => {
  const runtimes = [];
  const auth = createServer({ runtimeFactory: () => { const runtime = new FakeAuth(); runtimes.push(runtime); return runtime; } });
  await new Promise(resolve => auth.listen(0, '127.0.0.1', resolve));
  const gateway = createGateway({ authPort: auth.address().port });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${gateway.address().port}`;
  let cookie = '';
  const post = action => fetch(base + '/api/' + action, { method: 'POST', headers: { Origin: base, 'X-5E-Request': '1', Cookie: cookie } });
  try {
    let response = await fetch(base + '/editor/', { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/login');
    response = await post('session');
    cookie = response.headers.get('set-cookie').split(';')[0];
    assert.equal((await response.json()).signedIn, false);
    runtimes[0].signedIn = true;
    response = await post('status');
    assert.equal(response.headers.get('set-cookie')?.split(';')[0], cookie, 'activity renews the same browser session');
    assert.match(response.headers.get('set-cookie'), /Max-Age=1800/);
    await response.json();
    response = await fetch(base + '/editor/', { headers: { Cookie: 'unrelated=abc; ' + cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /web-session-status/);
    assert.match(html, /<script src="\/editor-bridge.js"><\/script>/);
    assert.doesNotMatch(html, /editor-generation/);
    const sessionScript = await (await fetch(base + '/editor-session.js')).text();
    assert.doesNotMatch(sessionScript, /setupGeneration|stopImmediatePropagation/);
    const panelScript = await (await fetch(base + '/editor/js/ai-panel.js')).text();
    assert.match(panelScript, /preserveBytes:true,at:\{x:0,y:0\},aiTaskId/);
    assert.match(html, /js\/main.js/);
    assert.doesNotMatch(html, /<script[^>]+mcp-bridge/);
    const loginHtml = await (await fetch(base + '/login')).text();
    assert.match(loginHtml, /data-editor-url="\/editor\/"/);
    assert.doesNotMatch(await (await fetch(base + '/account')).text(), /data-editor-url/);
    assert.equal((await fetch(base + '/editor/js/main.js?v=test')).status, 200);
    assert.equal((await fetch(base + '/editor/assets/logo.svg')).status, 200);
    for (const route of ['/editor/.git/config', '/editor/experiments/web-codex-auth/server.cjs', '/editor/index.html']) assert.equal((await fetch(base + route)).status, 404);
    assert.equal((await post('turn/start')).status, 404);
    assert.equal((await fetch(base + '/api/status', { method: 'POST', headers: { Origin: 'https://evil.example', 'X-5E-Request': '1' } })).status, 403);
    assert.equal((await fetch(base + '/editor/', { redirect: 'manual' })).status, 302);
    await post('logout');
    assert.equal((await fetch(base + '/editor/', { headers: { Cookie: cookie }, redirect: 'manual' })).status, 302);
  } finally {
    gateway.closeAllConnections(); auth.closeAllConnections();
    await Promise.all([new Promise(resolve => gateway.close(resolve)), new Promise(resolve => auth.close(resolve))]);
  }
});

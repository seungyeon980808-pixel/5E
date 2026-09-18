const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createTrialProxy } = require('./remote-trial.cjs');
const { MAX_PROJECT_BYTES } = require('../../desktop/project-package.cjs');
const origin = 'https://trial.example';
const web = 'https://www.5e.ai.kr';
const json = JSON.stringify({ pages: [] });
async function fixture(t, projectOptions = {}) {
  const server = createTrialProxy({ gatewayPort: 1, publicOrigin: origin, accessKey: 'a'.repeat(64), webEditorOrigin: web, projectOptions });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return (path, method = 'GET', headers = {}, body) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path, method, agent: false,
      headers: { Host: 'trial.example', ...headers } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject); req.end(body);
  });
}
const postHeaders = { Origin: web, 'X-5E-Request': '1', 'Content-Type': 'application/json', 'X-5E-Target': 'darwin' };
test('public package is available without AI auth and pins package server to public origin', async t => {
  let received;
  const request = await fixture(t, { packageZip: async options => { received = options; return Buffer.from('zip-test'); } });
  const response = await request('/api/project-package', 'POST', postHeaders, json);
  assert.equal(response.status, 200);
  assert.equal(response.body, 'zip-test');
  assert.equal(response.headers['access-control-allow-origin'], web);
  assert.deepEqual(received, { json, server: origin });
  assert.equal((await request('/api/project-package', 'POST', { ...postHeaders, Origin: 'https://evil.example' }, json)).status, 403);
  assert.equal((await request('/api/project-package', 'POST', { ...postHeaders, Origin: 'https://www.5e.ai.kr.evil.example' }, json)).status, 403);
  assert.equal((await request('/api/project-package', 'POST', { ...postHeaders, Origin: '' }, json)).status, 403);
  assert.equal((await request('/api/bridge-send', 'POST', postHeaders, json)).status, 401);
  assert.equal((await request('/api/project-package?x=1', 'POST', postHeaders, json)).status, 404);
});
test('CORS permits only exact project routes, methods, and expected headers', async t => {
  const request = await fixture(t);
  const headers = { Origin: web, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,x-5e-request,x-5e-target' };
  const accepted = await request('/api/project-package', 'OPTIONS', headers);
  assert.equal(accepted.status, 204);
  assert.equal(accepted.headers['access-control-allow-methods'], 'POST');
  assert.equal((await request('/api/project-package', 'OPTIONS', { ...headers, Origin: 'https://evil.example' })).status, 403);
  assert.equal((await request('/api/project-package', 'OPTIONS', { ...headers, 'Access-Control-Request-Method': 'DELETE' })).status, 403);
  assert.equal((await request('/api/project-package', 'OPTIONS', { ...headers, 'Access-Control-Request-Headers': 'authorization' })).status, 403);
  assert.equal((await request('/api/project-launch', 'OPTIONS', headers)).status, 403);
});
test('native launch uses Render origin; safe token is readable by web and expires', async t => {
  let now = 1;
  const request = await fixture(t, { now: () => now });
  assert.equal((await request('/api/project-launch', 'POST', postHeaders, json)).status, 403);
  const launched = await request('/api/project-launch', 'POST', { ...postHeaders, Origin: origin }, json);
  assert.equal(launched.status, 201);
  const url = new URL(JSON.parse(launched.body).url);
  assert.equal(url.origin + url.pathname, web + '/preview/');
  assert.match(url.hash, /^#project=[a-f0-9]{48}$/);
  const route = '/api/project-launch/' + url.hash.slice(9);
  const loaded = await request(route, 'GET', { Origin: web });
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body, json);
  assert.equal(loaded.headers['access-control-allow-origin'], web);
  assert.equal((await request(route, 'GET', { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await request(route + '?x=1', 'GET', { Origin: web })).status, 404);
  assert.equal((await request('/api/project-launch/not-a-token', 'GET', { Origin: web })).status, 404);
  now += 3_600_000;
  assert.equal((await request(route, 'GET', { Origin: web })).status, 410);
});
test('body admission is 32MB and concurrent builds are bounded before body processing', async t => {
  let release;
  let started;
  const start = new Promise(resolve => { started = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  const request = await fixture(t, { packageZip: async () => { started(); await wait; return Buffer.from('zip'); } });
  assert.equal((await request('/api/project-package', 'POST', { ...postHeaders, 'Content-Length': MAX_PROJECT_BYTES + 1 })).status, 413);
  const pending = request('/api/project-package', 'POST', postHeaders, json);
  await start;
  assert.equal((await request('/api/project-package', 'POST', postHeaders, json)).status, 503);
  release();
  assert.equal((await pending).status, 200);
  assert.equal((await request('/api/project-package', 'POST', { ...postHeaders, 'X-5E-Target': 'unknown' }, json)).status, 400);
});
test('Windows target serves executable bytes and releases temporary package resources', async t => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '5e-route-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bundle = path.join(root, 'test.exe');
  await fs.writeFile(bundle, 'MZ-test');
  let cleaned = false;
  const request = await fixture(t, { windowsPackage: async options => {
    assert.deepEqual(options, { json, server: origin });
    return { bundle, close: async () => { cleaned = true; } };
  } });
  const response = await request('/api/project-package', 'POST', { ...postHeaders, 'X-5E-Target': 'win32' }, json);
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'application/octet-stream');
  assert.equal(response.body, 'MZ-test');
  assert.equal(cleaned, true);
});

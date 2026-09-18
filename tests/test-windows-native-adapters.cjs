const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createDriver } = require('./helpers/windows-native-driver.cjs');
const { createWindowsProjectPackage } = require('../desktop/windows-project-package.cjs');
const run = promisify(execFile);
const windows = { skip: process.platform !== 'win32' };
let driver;
before(async () => { if (process.platform === 'win32') driver = await createDriver(); });
after(async () => { await driver?.close(); });
const json = '{"pages":[{"id":"네이티브 통신 확인","objects":[]}]}';

async function serve(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
async function exported(t, server, development) {
  const pkg = await createWindowsProjectPackage({ json, server, development });
  t.after(() => pkg.close());
  return pkg;
}

test('actual WinHTTP sends original bytes without cookies or authorization', windows, async t => {
  // Given a real Windows client and an isolated HTTP endpoint.
  let received, headers, origin;
  origin = await serve(t, (request, response) => {
    const chunks = []; request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => { received = Buffer.concat(chunks).toString(); headers = request.headers; response.writeHead(201, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ url: origin + '/editor/#project=' + 'a'.repeat(48) })); });
  });
  const pkg = await exported(t, origin);
  // When the actual native transport sends the source.
  const result = await driver.run(['transfer', pkg.bundle]);
  // Then data and explicit headers match while authentication state is absent.
  assert.equal(result.stdout, origin + '/editor/#project=' + 'a'.repeat(48));
  assert.equal(received, json); assert.equal(headers.origin, origin); assert.equal(headers['x-5e-request'], '1');
  assert.equal(headers.cookie, undefined); assert.equal(headers.authorization, undefined);
});

test('actual WinHTTP rejects redirects and responses with an unconfigured editor', windows, async t => {
  // Given endpoints that try to redirect or return a different editor.
  let redirectedRequests = 0;
  const redirected = await serve(t, (_, response) => { redirectedRequests++; response.end(); });
  const redirect = await serve(t, (_, response) => { response.writeHead(307, { Location: redirected }); response.end(); });
  const otherEditor = await serve(t, (_, response) => { response.writeHead(201); response.end(JSON.stringify({ url: 'https://other.invalid/#project=' + 'a'.repeat(48) })); });
  // When the native transfer encounters either unsafe response.
  for (const server of [redirect, otherEditor]) {
    const pkg = await exported(t, server);
    // Then it fails without following a redirect or supplying another editor URL.
    await assert.rejects(driver.run(['transfer', pkg.bundle]), error => error.code === 1 && error.stdout === '');
  }
  assert.equal(redirectedRequests, 0);
});

test('actual Windows registry lookup respects support version in an isolated 64-bit key', windows, async t => {
  // Given a unique test registration, never the user's production app registration.
  const location = 'Software\\5E\\LauncherQA\\' + crypto.randomUUID(), key = 'HKCU\\' + location;
  await run('reg.exe', ['add', key, '/v', 'Executable', '/t', 'REG_SZ', '/d', process.execPath, '/f', '/reg:64']);
  t.after(() => run('reg.exe', ['delete', key, '/f', '/reg:64']));
  await run('reg.exe', ['add', key, '/v', 'Version', '/t', 'REG_DWORD', '/d', '1', '/f', '/reg:64']);
  // When the same native lookup as the production launcher checks it.
  const supported = await driver.run(['registry', location]);
  // Then it selects the exact executable, and unsupported registrations are absent.
  assert.equal(supported.stdout, process.execPath);
  await run('reg.exe', ['add', key, '/v', 'Version', '/t', 'REG_DWORD', '/d', '0', '/f', '/reg:64']);
  assert.equal((await driver.run(['registry', location])).stdout, '');
});

test('actual Windows project executable starts real receiver and keeps original file', { ...windows, timeout: 45000 }, async t => {
  // Given a native product file pointing to the real shipped Node receiver.
  const module = path.resolve(__dirname, '../desktop/project-open.cjs');
  let resolveBody;
  const received = new Promise(resolve => { resolveBody = resolve; });
  const origin = await serve(t, (request, response) => { const chunks = []; request.on('data', chunk => chunks.push(chunk)); request.on('end', () => { resolveBody(Buffer.concat(chunks).toString()); response.end(); }); });
  const script = `const fs=require('node:fs'),path=require('node:path'),{EventEmitter}=require('node:events');const p=process.argv.find(a=>a.startsWith('--project-file=')).slice(15),body=fs.readFileSync(p);process.argv=process.argv.filter(a=>!a.startsWith('--project-file='));const receiver=require(${JSON.stringify(module)}).createProjectOpen({app:new EventEmitter(),ipcMain:new EventEmitter(),getWindow:()=>null});receiver.receive(p).then(()=>{if(fs.existsSync(p)||fs.existsSync(path.dirname(p)))throw Error('handoff copy was not cleaned');return fetch(${JSON.stringify(origin)},{method:'POST',body});}).catch(()=>process.exit(1));`;
  const pkg = await exported(t, 'http://127.0.0.1:1', { executable: process.execPath, args: ['-e', script, '--'] });
  // When the actual GUI launcher runs, a dead web endpoint cannot satisfy this test.
  await run(pkg.bundle, [], { timeout: 15000 });
  // Then the source reaches the real receiver after cleanup, with the original executable preserved.
  assert.equal(await received, json); assert.ok((await fs.stat(pkg.bundle)).isFile());
});

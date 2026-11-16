'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { ENDPOINT, PRODUCTION_ORIGINS, createVisitorStatsStore, startVisitorStatsServer } = require('../scripts/visitor-stats-server.cjs');

const ORIGIN = PRODUCTION_ORIGINS[0];
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
const FIRST = '91c9b7e4-42f2-4c20-bd89-e34c016dcc1a';
const SECOND = '71a284ad-a4c8-4bbc-a3be-ae692fe3d880';

async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), '5e-visitor-stats-'));
  const instances = [];
  t.after(async () => {
    for (const instance of instances) if (instance.server.listening) await instance.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  async function start(overrides = {}) {
    const instance = await startVisitorStatsServer({ env: {}, dataDir: directory, port: 0, ...options, ...overrides });
    instances.push(instance);
    return instance;
  }
  return { directory, start, instance: await start() };
}

function visit(instance, visitorId = FIRST, overrides = {}) {
  return fetch(instance.origin + ENDPOINT, {
    method: 'POST', body: JSON.stringify({ visitorId }),
    ...overrides,
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'User-Agent': BROWSER, ...overrides.headers },
  });
}

async function stats(instance) {
  const response = await fetch(instance.origin + ENDPOINT);
  assert.equal(response.status, 200);
  return response.json();
}

test('concurrent duplicate visits count once, distinct IDs count twice, and GET never increments', async t => {
  const { instance } = await fixture(t, { clock: () => Date.parse('2026-10-12T01:00:00Z') });
  assert.deepEqual(await stats(instance), { total: 0, today: 0, date: '2026-10-12', timezone: 'Asia/Seoul' });
  const replies = await Promise.all(Array.from({ length: 24 }, () => visit(instance)));
  for (const reply of replies) {
    assert.equal(reply.status, 200);
    assert.deepEqual(await reply.json(), { total: 1, today: 1, date: '2026-10-12', timezone: 'Asia/Seoul' });
  }
  assert.equal((await visit(instance, FIRST.toUpperCase())).status, 200, 'UUID case must not create a new visitor');
  assert.deepEqual(await (await visit(instance, SECOND)).json(), { total: 2, today: 2, date: '2026-10-12', timezone: 'Asia/Seoul' });
  for (let i = 0; i < 5; i++) assert.equal((await stats(instance)).total, 2);
});

test('KST midnight rolls daily unique counts without summing days into lifetime', async t => {
  let now = Date.parse('2026-10-11T14:59:59.999Z');
  const { instance } = await fixture(t, { clock: () => now });
  assert.deepEqual(await (await visit(instance)).json(), { total: 1, today: 1, date: '2026-10-11', timezone: 'Asia/Seoul' });
  now += 1;
  assert.deepEqual(await stats(instance), { total: 1, today: 0, date: '2026-10-12', timezone: 'Asia/Seoul' });
  assert.deepEqual(await (await visit(instance)).json(), { total: 1, today: 1, date: '2026-10-12', timezone: 'Asia/Seoul' });
  assert.equal((await (await visit(instance, SECOND)).json()).total, 2);
  now = Date.parse('2026-10-12T15:00:00Z');
  assert.deepEqual(await stats(instance), { total: 2, today: 0, date: '2026-10-13', timezone: 'Asia/Seoul' });
  assert.deepEqual(await (await visit(instance, SECOND)).json(), { total: 2, today: 1, date: '2026-10-13', timezone: 'Asia/Seoul' });
});

test('dedup and hash secret persist across restart and shared database instances, with no raw IDs or IPs', async t => {
  const { instance, start, directory } = await fixture(t);
  await visit(instance);
  await instance.close();
  const next = await start();
  assert.equal((await (await visit(next)).json()).total, 1);
  const shared = await start();
  await Promise.all([visit(shared, SECOND), visit(next, SECOND)]);
  assert.equal((await stats(next)).total, 2);
  await next.close();
  await shared.close();
  const db = new DatabaseSync(path.join(directory, 'visitors.sqlite'), { readOnly: true });
  try {
    const visitors = db.prepare('SELECT * FROM visitors').all();
    assert.equal(visitors.length, 2);
    assert.deepEqual(Object.keys(visitors[0]), ['visitor_hash']);
    assert.ok(visitors.every(row => /^[0-9a-f]{64}$/.test(row.visitor_hash)));
    const contents = JSON.stringify([...visitors, ...db.prepare('SELECT * FROM daily_visitors').all(), ...db.prepare('SELECT * FROM metadata').all()]);
    assert.ok(!contents.includes(FIRST) && !contents.includes(SECOND) && !contents.includes('127.0.0.1'));
    assert.deepEqual(db.prepare('PRAGMA table_info(daily_visitors)').all().map(column => column.name), ['day', 'visitor_hash']);
  } finally { db.close(); }
  if (process.platform !== 'win32') assert.equal((await fs.stat(path.join(directory, 'visitors.sqlite'))).mode & 0o777, 0o600);
});

test('default origin policy rejects local, unrelated and missing POST origins; safe public GET and exact CORS', async t => {
  const { instance } = await fixture(t);
  for (const origin of ['http://localhost:8795', 'http://127.0.0.1:8795', 'http://[::1]:8795', 'https://evil.example', 'https://www.5e.ai.kr.evil.example', 'null']) {
    const reply = await visit(instance, FIRST, { headers: { Origin: origin } });
    assert.equal(reply.status, 403, origin);
    assert.equal(reply.headers.get('access-control-allow-origin'), null);
  }
  const missing = await fetch(instance.origin + ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': BROWSER }, body: JSON.stringify({ visitorId: FIRST }) });
  assert.equal(missing.status, 403);
  assert.equal((await stats(instance)).total, 0);
  for (const origin of PRODUCTION_ORIGINS) {
    const reply = await visit(instance, FIRST, { headers: { Origin: origin } });
    assert.equal(reply.status, 200);
    assert.equal(reply.headers.get('access-control-allow-origin'), origin);
    assert.equal(reply.headers.get('access-control-allow-credentials'), null);
    assert.equal(reply.headers.get('vary'), 'Origin');
    assert.equal(reply.headers.get('cache-control'), 'no-store');
  }
  const preflight = await fetch(instance.origin + ENDPOINT, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-headers'), 'Content-Type');
  assert.equal((await fetch(instance.origin + ENDPOINT, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'DELETE' } })).status, 403);
  assert.equal((await fetch(instance.origin + ENDPOINT, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization' } })).status, 403);
});

test('local counting requires both an explicit allowlist entry and test override', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), '5e-visitor-local-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await assert.rejects(startVisitorStatsServer({ env: {}, dataDir: directory, allowedOrigins: ['http://localhost:8795'], port: 0 }), /explicit/);
  const { instance } = await fixture(t, { allowLocal: true, allowedOrigins: ['http://localhost:8795'] });
  assert.equal((await visit(instance, FIRST, { headers: { Origin: 'http://localhost:8795' } })).status, 200);
  assert.equal((await stats(instance)).total, 1);
  assert.equal((await visit(instance, SECOND, { headers: { Origin: 'http://127.0.0.1:8795' } })).status, 403, 'test override is not a wildcard');
});

test('known bots, headless, missing UA and prefetch requests do not count', async t => {
  const { instance } = await fixture(t);
  for (const agent of ['Googlebot/2.1', 'Mozilla/5.0 HeadlessChrome/130.0.0.0', 'Playwright', 'curl/8.0', 'Python-urllib/3.12', 'node', '']) {
    assert.equal((await visit(instance, randomUUID(), { headers: { 'User-Agent': agent } })).status, 200);
  }
  assert.equal((await visit(instance, randomUUID(), { headers: { 'Sec-CH-UA': '"HeadlessChrome";v="130"' } })).status, 200);
  assert.equal((await visit(instance, randomUUID(), { headers: { 'Sec-Purpose': 'prefetch' } })).status, 200);
  assert.equal((await stats(instance)).total, 0);
  assert.equal((await (await visit(instance)).json()).total, 1);
});

function chunkedRequest(instance, chunks) {
  return new Promise((resolve, reject) => {
    const req = http.request(instance.origin + ENDPOINT, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'User-Agent': BROWSER } }, res => {
      let body = '';
      res.setEncoding('utf8'); res.on('data', value => { body += value; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    });
    req.on('error', reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

test('invalid JSON, UUID, extra data, oversized fixed/chunked bodies and unsupported methods fail without counting', async t => {
  const { instance } = await fixture(t);
  for (const body of ['{', '{}', 'null', '[]', JSON.stringify({ visitorId: 'person@example.com' }), JSON.stringify({ visitorId: 12 }), JSON.stringify({ visitorId: FIRST, email: 'person@example.com' }), JSON.stringify({ visitorId: FIRST.replace('-4c20-', '-1c20-') })]) {
    assert.equal((await visit(instance, FIRST, { body })).status, 400, body);
  }
  assert.equal((await visit(instance, FIRST, { body: 'x'.repeat(1025) })).status, 413);
  assert.equal((await chunkedRequest(instance, ['x'.repeat(600), 'x'.repeat(600)])).status, 413);
  assert.equal((await visit(instance, FIRST, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await visit(instance, FIRST, { headers: { 'Content-Encoding': 'gzip' } })).status, 415);
  assert.equal((await fetch(instance.origin + ENDPOINT, { method: 'DELETE' })).status, 405);
  assert.equal((await fetch(instance.origin + '/private/visitors.sqlite')).status, 404);
  assert.equal((await stats(instance)).total, 0);
  assert.equal((await (await visit(instance)).json()).total, 1, 'server remains usable after rejected requests');
});

test('rate limiting bounds repeated requests and resets after its window; forwarded IP cannot bypass it', async t => {
  let now = Date.parse('2026-10-12T00:00:00Z');
  const { instance } = await fixture(t, { clock: () => now, rateLimit: 2, rateWindowMs: 1000 });
  assert.equal((await visit(instance)).status, 200);
  assert.equal((await visit(instance)).status, 200);
  const limited = await visit(instance, SECOND, { headers: { 'X-Forwarded-For': '203.0.113.15' } });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '1');
  assert.equal(instance.store.stats().total, 1);
  now += 1000;
  assert.equal((await visit(instance, SECOND)).status, 200);
  assert.equal(instance.store.stats().total, 2);
});

test('database errors return 503 without details or success counts, and invalid storage/config fails closed', async t => {
  const { instance, directory } = await fixture(t);
  instance.store.close();
  const failed = await visit(instance);
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: 'stats_unavailable' });
  await assert.rejects(startVisitorStatsServer({ env: {}, dataDir: directory, port: -1 }), /PORT/);
  await assert.rejects(startVisitorStatsServer({ env: {}, dataDir: directory, allowedOrigins: ['https://www.5e.ai.kr/path'], port: 0 }), /exact/);
  assert.throws(() => createVisitorStatsStore({ dataDir: path.join(directory, 'public', 'data'), webRoot: path.join(directory, 'public') }), /outside the web root/);
  if (process.platform !== 'win32') {
    const publicDir = path.join(directory, 'public');
    await fs.mkdir(publicDir);
    const link = path.join(directory, 'shortcut');
    await fs.symlink(publicDir, link);
    assert.throws(() => createVisitorStatsStore({ dataDir: path.join(link, 'data'), webRoot: publicDir }), /outside the web root/);
  }
});

test('failed daily write rolls back the new lifetime visitor in the same transaction', async t => {
  const { instance, directory } = await fixture(t);
  const db = new DatabaseSync(path.join(directory, 'visitors.sqlite'));
  try {
    db.exec("CREATE TRIGGER reject_daily BEFORE INSERT ON daily_visitors BEGIN SELECT RAISE(ABORT, 'private storage failure'); END;");
    const failed = await visit(instance);
    assert.equal(failed.status, 503);
    assert.deepEqual(await failed.json(), { error: 'stats_unavailable' });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM visitors').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM daily_visitors').get().n, 0);
    db.exec('DROP TRIGGER reject_daily');
    assert.equal((await (await visit(instance)).json()).total, 1);
  } finally { db.close(); }
});

test('an interrupted POST body leaves the server healthy without recording a visitor', async t => {
  const { instance } = await fixture(t);
  await new Promise(resolve => {
    const req = http.request(instance.origin + ENDPOINT, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'User-Agent': BROWSER, 'Content-Length': '100' } });
    req.on('error', () => {});
    req.on('close', resolve);
    req.write('{');
    setTimeout(() => req.destroy(), 15);
  });
  assert.equal((await stats(instance)).total, 0);
  assert.equal((await (await visit(instance)).json()).total, 1);
});

test('CLI on Node 24 starts, shuts down cleanly and retains counts on a new process', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), '5e-visitor-cli-'));
  const children = [];
  t.after(async () => {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await new Promise(resolve => child.once('exit', resolve)); }
    await fs.rm(directory, { recursive: true, force: true });
  });
  async function launch() {
    const child = spawn(process.execPath, [path.join(__dirname, '../scripts/visitor-stats-server.cjs')], { env: { ...process.env, PORT: '0', VISITOR_STATS_HOST: '127.0.0.1', VISITOR_STATS_DATA_DIR: directory, VISITOR_STATS_ALLOWED_ORIGINS: ORIGIN, VISITOR_STATS_ALLOW_LOCAL: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    const origin = await new Promise((resolve, reject) => {
      let output = '', errors = '';
      const timer = setTimeout(() => reject(new Error('CLI startup timeout')), 10000);
      child.stderr.on('data', data => { errors += data; });
      child.stdout.on('data', data => {
        output += data;
        const match = output.match(/5E visitor stats: (http:\/\/[^/]+)\/api\/visitor-stats/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`CLI exited ${code}: ${errors}`)); });
    });
    return { origin, child };
  }
  async function stop(child) {
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    child.kill('SIGTERM');
    assert.deepEqual(await exited, { code: 0, signal: null });
  }
  const first = await launch();
  assert.equal((await (await visit(first)).json()).total, 1);
  await stop(first.child);
  const next = await launch();
  assert.equal((await stats(next)).total, 1);
  assert.equal((await (await visit(next)).json()).total, 1);
  await stop(next.child);
});

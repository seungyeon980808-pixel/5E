// 방문자 집계 Worker API(visitor/api.mjs)를 D1과 같은 모양의 SQLite 어댑터로 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createVisitorApi, createVisitorStore, kstDate } from '../visitor/api.mjs';

const ORIGIN = 'https://www.5e.ai.kr';
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
const A = '91c9b7e4-42f2-4c20-bd89-e34c016dcc1a', B = '0f8fad5b-d9cb-469f-a165-70867728950e';

// D1의 prepare/bind/first/all/run/batch만 흉내 낸다. batch는 D1처럼 한 트랜잭션.
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../visitor/worker/migrations/0001_visitor_stats.sql', import.meta.url), 'utf8'));
  const prepare = sql => {
    const bound = values => ({ sql, values,
      async first() { return db.prepare(sql).get(...values) ?? null; },
      async all() { return { results: db.prepare(sql).all(...values) }; },
      async run() { const info = db.prepare(sql).run(...values); return { meta: { changes: info.changes } }; } });
    return { ...bound([]), bind: (...values) => bound(values) };
  };
  return { raw: db, prepare, async batch(statements) {
    db.exec('BEGIN');
    try {
      const out = statements.map(({ sql, values }) => /^\s*select/i.test(sql) ? { results: db.prepare(sql).all(...values) } : (db.prepare(sql).run(...values), { results: [] }));
      db.exec('COMMIT');
      return out;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  } };
}

function api({ clock = () => Date.parse('2026-10-18T03:00:00Z'), rateLimit } = {}) {
  const db = d1();
  const handle = createVisitorApi({ store: createVisitorStore(db), allowedOrigins: [ORIGIN, 'https://5e.ai.kr'], clock, ...(rateLimit && { rateLimit }) });
  const call = async ({ method = 'GET', origin = ORIGIN, body, agent = BROWSER, ip = '1.1.1.1', path = '/api/visitor-stats', headers = {} } = {}) => {
    const init = { method, headers: { ...(origin && { Origin: origin }), ...(agent && { 'User-Agent': agent }), ...headers } };
    if (body !== undefined) { init.body = typeof body === 'string' ? body : JSON.stringify(body); init.headers['Content-Type'] ||= 'application/json'; }
    const response = await handle(new Request('https://5e-visitor-stats.example.workers.dev' + path, init), { clientIp: ip });
    const text = await response.text();
    return { status: response.status, headers: response.headers, data: text ? JSON.parse(text) : null };
  };
  return { db, call, handle };
}

test('POST counts a browser once per day and once in total; GET never counts', async () => {
  const { call, db } = api();
  assert.deepEqual((await call()).data, { total: 0, today: 0, date: '2026-10-18', timezone: 'Asia/Seoul' });
  assert.deepEqual((await call({ method: 'POST', body: { visitorId: A } })).data, { total: 1, today: 1, date: '2026-10-18', timezone: 'Asia/Seoul' });
  assert.equal((await call({ method: 'POST', body: { visitorId: A.toUpperCase() } })).data.total, 1);
  assert.deepEqual((await call({ method: 'POST', body: { visitorId: B } })).data, { total: 2, today: 2, date: '2026-10-18', timezone: 'Asia/Seoul' });
  assert.equal((await call()).data.total, 2);
  const stored = db.raw.prepare('SELECT visitor_hash FROM visitors').all().map(row => row.visitor_hash);
  assert.ok(stored.every(hash => /^[0-9a-f]{64}$/.test(hash) && hash !== A && hash !== B), 'raw UUIDs are never stored');
});

test('a new Korean day resets today but keeps the total', async () => {
  let now = Date.parse('2026-10-18T14:59:00Z');
  const { call } = api({ clock: () => now });
  await call({ method: 'POST', body: { visitorId: A } });
  now = Date.parse('2026-10-18T15:01:00Z');
  assert.equal(kstDate(now), '2026-10-19');
  assert.deepEqual((await call()).data, { total: 1, today: 0, date: '2026-10-19', timezone: 'Asia/Seoul' });
  assert.deepEqual((await call({ method: 'POST', body: { visitorId: A } })).data, { total: 1, today: 1, date: '2026-10-19', timezone: 'Asia/Seoul' });
});

test('origins, methods, bodies and bots are handled like the local server', async () => {
  const { call } = api();
  assert.equal((await call({ origin: 'https://evil.example' })).status, 403);
  assert.equal((await call({ method: 'POST', origin: null, body: { visitorId: A } })).status, 403);
  assert.equal((await call({ method: 'DELETE' })).status, 405);
  assert.equal((await call({ path: '/other' })).status, 404);
  assert.equal((await call({ method: 'POST', body: { visitorId: 'not-a-uuid' } })).status, 400);
  assert.equal((await call({ method: 'POST', body: { visitorId: A, extra: 1 } })).status, 400);
  assert.equal((await call({ method: 'POST', body: '{', headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal((await call({ method: 'POST', body: { visitorId: A }, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await call({ method: 'POST', body: JSON.stringify({ visitorId: A, pad: 'x'.repeat(2000) }) })).status, 413);
  for (const agent of ['', 'curl/8.0', 'Mozilla/5.0 HeadlessChrome/151']) {
    assert.equal((await call({ method: 'POST', body: { visitorId: A }, agent })).data.total, 0, `bot not counted: ${agent || 'empty'}`);
  }
  const ok = await call({ method: 'GET' });
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(ok.headers.get('Cache-Control'), 'no-store');
});

test('preflight allows only JSON GET/POST from allowed origins', async () => {
  const { call } = api();
  const good = await call({ method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
  assert.equal(good.status, 204);
  assert.equal(good.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
  assert.equal((await call({ method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'PUT' } })).status, 403);
  assert.equal((await call({ method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-other' } })).status, 403);
});

test('rate limit answers 429 after the per-address budget', async () => {
  const { call } = api({ rateLimit: 2 });
  assert.equal((await call()).status, 200);
  assert.equal((await call()).status, 200);
  const limited = await call();
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '60');
  assert.equal((await call({ ip: '2.2.2.2' })).status, 200);
});

// 보안 점검 L4: 큰 본문은 끝까지 받기 전에 거른다.
test('oversized bodies are rejected before the whole body is read', async () => {
  const { handle } = api();
  const post = (body, headers = {}) => handle(new Request('https://5e-visitor-stats.example.workers.dev/api/visitor-stats', {
    method: 'POST', body, duplex: 'half',
    headers: { Origin: ORIGIN, 'User-Agent': BROWSER, 'Content-Type': 'application/json', ...headers },
  }), { clientIp: '3.3.3.3' });
  // 끝없이 이어지는 본문: 몇 조각을 꺼냈는지 센다.
  const endless = () => {
    const seen = { pulls: 0, cancelled: false };
    const stream = new ReadableStream({
      pull(controller) { seen.pulls++; controller.enqueue(new Uint8Array(400).fill(0x20)); },
      cancel() { seen.cancelled = true; },
    });
    return { stream, seen };
  };

  const declared = endless();
  const big = await post(declared.stream, { 'Content-Length': '1048576' });
  assert.equal(big.status, 413);
  assert.equal(declared.seen.pulls <= 1, true, 'Content-Length over the limit is refused without reading the body');

  const hidden = endless();
  const streamed = await post(hidden.stream);
  assert.equal(streamed.status, 413);
  assert.equal(hidden.seen.pulls <= 5, true, `reading stops just past 1KB (pulled ${hidden.seen.pulls})`);
  assert.equal(hidden.seen.cancelled, true, 'the rest of the stream is cancelled');

  assert.equal((await post(JSON.stringify({ visitorId: A }), { 'Content-Length': 'abc' })).status, 413);
  const exact = JSON.stringify({ visitorId: A });
  const ok = await post(exact, { 'Content-Length': String(Buffer.byteLength(exact)) });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).total, 1);
});

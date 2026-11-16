// 보안 점검 M2·L1·L2·L5: 문제 게시판 남용 상한을 Worker와 같은 API·저장소 코드로 확인한다.
// 접속 주소(clientIp)를 바꿔 가며 보내므로 로컬 HTTP 서버 대신 API를 바로 부른다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createBoardApi } from '../bug/api.mjs';
import { createBoardStore } from '../bug/store.mjs';
import worker from '../bug/worker/index.mjs';

const ADMIN = 'a'.repeat(48), ORIGIN = 'https://www.5e.ai.kr';
const png = size => 'data:image/png;base64,' + Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(size - 8)]).toString('base64');

function sqlite() {
  const database = new DatabaseSync(':memory:');
  database.exec(fs.readFileSync(new URL('../bug/schema.sql', import.meta.url), 'utf8'));
  return { raw: database, prepare(sql) { return { bind(...values) {
    const query = database.prepare(sql);
    return { first: async () => query.get(...values) || null, all: async () => ({ results: query.all(...values) }),
      run: async () => ({ meta: { changes: Number(query.run(...values).changes) } }) };
  } }; } };
}

function board({ limits, start = Date.parse('2026-10-19T00:00:00Z') } = {}) {
  const db = sqlite(), kept = new Map(); let now = start;
  const images = { async put(key, bytes) { kept.set(key, bytes); }, async get(key) { return kept.get(key) || null; }, async remove(key) { kept.delete(key); } };
  const store = createBoardStore(db, images);
  const handle = createBoardApi({ store, adminToken: ADMIN, allowedOrigins: [ORIGIN], clock: () => now, limits });
  const call = async (suffix, { method = 'GET', body, ip = '10.0.0.1' } = {}) => {
    const headers = { Origin: ORIGIN, ...(method !== 'GET' && { 'X-5E-Report': '1' }), ...(body !== undefined && { 'Content-Type': 'application/json' }) };
    const response = await handle(new Request('https://5e-bug-api.example.workers.dev/api/bug-board' + suffix,
      { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), { clientIp: ip });
    return { status: response.status, data: await response.json().catch(() => null) };
  };
  return { db, kept, store, call, advance: ms => { now += ms; }, now: () => now };
}
const report = (overrides = {}) => ({ id: crypto.randomUUID(), title: '첨부 확인', description: '설명',
  images: [], password: 'pass-word-1', context: {}, ...overrides });

test('M2: 첨부 이미지는 주소별·전체 하루 합계를 넘으면 저장하지 않는다', async () => {
  const MB = 1024 * 1024;
  const b = board({ limits: { clientDailyAttachmentBytes: 5 * MB, dailyAttachmentBytes: 9 * MB } });
  const image = { name: '캡처', data: png(2 * MB) };
  // 한 주소: 2MB×2 = 4MB까지, 세 번째(6MB)는 거절
  assert.equal((await b.call('', { method: 'POST', body: report({ images: [image] }), ip: '1.1.1.1' })).status, 201);
  assert.equal((await b.call('', { method: 'POST', body: report({ images: [image] }), ip: '1.1.1.1' })).status, 201);
  const own = await b.call('', { method: 'POST', body: report({ images: [image] }), ip: '1.1.1.1' });
  assert.equal(own.status, 429); assert.match(own.data.error, /첨부 이미지가 많습니다/);
  // 글만 보내는 신고는 계속 받는다
  assert.equal((await b.call('', { method: 'POST', body: report(), ip: '1.1.1.1' })).status, 201);
  // 주소를 바꿔도 전체 9MB를 넘을 수 없다: 4MB(이미 씀) + 2MB + 2MB = 8MB, 다음 2MB는 거절
  assert.equal((await b.call('', { method: 'POST', body: report({ images: [image] }), ip: '2.2.2.2' })).status, 201);
  assert.equal((await b.call('', { method: 'POST', body: report({ images: [image] }), ip: '3.3.3.3' })).status, 201);
  assert.equal((await b.call('', { method: 'POST', body: report({ images: [image] }), ip: '4.4.4.4' })).status, 429);
  assert.equal(b.kept.size, 4, '거절된 신고의 첨부는 저장되지 않는다');
  // 하루가 지나면 다시 받는다
  b.advance(24 * 3600000 + 1);
  assert.equal((await b.call('', { method: 'POST', body: report({ images: [image] }), ip: '4.4.4.4' })).status, 201);
});

test('M2: 기본 상한은 하루 전체 200MB, 주소별 40MB', async () => {
  const { ABUSE_LIMITS } = await import('../bug/api.mjs');
  assert.equal(ABUSE_LIMITS.dailyAttachmentBytes, 200 * 1024 * 1024);
  assert.equal(ABUSE_LIMITS.clientDailyAttachmentBytes, 40 * 1024 * 1024);
});

test('L1: 글 비밀번호는 주소를 바꿔도 글별로 1시간에 20번까지만 틀릴 수 있다', async () => {
  const b = board(), input = report();
  assert.equal((await b.call('', { method: 'POST', body: input })).status, 201);
  for (let i = 0; i < 20; i++) {
    const ip = `9.9.${i}.1`;   // 주소마다 분당 5회 제한에는 걸리지 않게
    assert.equal((await b.call(`/${input.id}/access`, { method: 'POST', body: { password: `wrong-pass-${i}` }, ip })).status, 401);
  }
  const locked = await b.call(`/${input.id}/access`, { method: 'POST', body: { password: 'pass-word-1' }, ip: '8.8.8.8' });
  assert.equal(locked.status, 429, '잠긴 동안은 맞는 비밀번호도 결과를 알려 주지 않는다');
  assert.match(locked.data.error, /1시간 동안 잠겼습니다/);
  // 다른 글은 영향 없음
  const other = report(); await b.call('', { method: 'POST', body: other });
  assert.equal((await b.call(`/${other.id}/access`, { method: 'POST', body: { password: 'pass-word-1' }, ip: '8.8.8.8' })).status, 200);
  // 1시간 뒤 풀림
  b.advance(3600000 + 1);
  assert.equal((await b.call(`/${input.id}/access`, { method: 'POST', body: { password: 'pass-word-1' }, ip: '8.8.8.8' })).status, 200);
});

test('L1: 맞는 비밀번호는 실패 횟수를 늘리지 않는다', async () => {
  const b = board({ limits: { passwordFailuresPerHour: 2 } }), input = report();
  await b.call('', { method: 'POST', body: input });
  for (let i = 0; i < 4; i++) assert.equal((await b.call(`/${input.id}/access`, { method: 'POST', body: { password: 'pass-word-1' }, ip: `7.7.7.${i}` })).status, 200);
  assert.equal((await b.call(`/${input.id}/access`, { method: 'POST', body: { password: 'wrong-pass-1' }, ip: '7.7.8.1' })).status, 401);
  assert.equal((await b.call(`/${input.id}/access`, { method: 'POST', body: { password: 'pass-word-1' }, ip: '7.7.8.2' })).status, 200);
});

test('L2: 공감은 주소마다 글별 하루 3번, 전체 하루 30번까지', async () => {
  const b = board(), input = report();
  await b.call('', { method: 'POST', body: input });
  const vote = (ip, id = input.id) => b.call(`/${id}/vote`, { method: 'POST', body: { visitor: crypto.randomUUID() }, ip });
  for (let i = 0; i < 3; i++) assert.equal((await vote('5.5.5.5')).status, 200);
  assert.equal((await vote('5.5.5.5')).status, 429);
  assert.equal((await b.call(`/${input.id}`)).data.votes, 3);
  // 같은 주소에서 다른 글 여러 개: 하루 30번 넘으면 거절(분당 쓰기 30회 제한은 시간을 옮겨 피한다)
  const many = [];
  for (let i = 0; i < 10; i++) { const r = report(); many.push(r.id); await b.call('', { method: 'POST', body: r, ip: `6.0.0.${i}` }); }
  let ok = 3;
  for (const id of many) for (let i = 0; i < 3; i++) { b.advance(3000); if ((await vote('5.5.5.5', id)).status === 200) ok++; }
  assert.equal(ok, 30);
});

test('L5: 정리 Cron은 이틀 지난 제한 기록만 지운다', async () => {
  const b = board();
  await b.call('', { method: 'POST', body: report() });
  const before = b.db.raw.prepare('SELECT COUNT(*) AS n FROM rate_limits').get().n;
  assert.ok(before >= 2);
  b.db.raw.prepare("INSERT INTO rate_limits (key,starts,hits) VALUES ('old',?,1)").run(b.now() - 3 * 86400000);
  let pending;
  await worker.scheduled({ scheduledTime: b.now() }, { DB: b.db }, { waitUntil: promise => { pending = promise; } });
  assert.equal(await pending, 1);
  assert.equal(b.db.raw.prepare('SELECT COUNT(*) AS n FROM rate_limits').get().n, before);
});

// 문제 게시판 API(bug/api.mjs)를 로컬 SQLite 서버로 확인한다. Worker와 같은 계약이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createBugBoardServer } = require('../scripts/bug-board-server.cjs');
const ADMIN = 'a'.repeat(48);
const ORIGIN = 'https://www.5e.ai.kr';
const PNG = 'data:image/png;base64,' + Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0]).toString('base64');

async function board(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), '5e-bug-board-'));
  const server = await createBugBoardServer({ directory, adminToken:ADMIN, allowedOrigins:[ORIGIN] });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(() => { fs.rmSync(directory, { recursive:true, force:true }); resolve(); })));
  const base = `http://127.0.0.1:${server.address().port}/api/bug-board`;
  return async (suffix = '', { method = 'GET', body, admin = false, origin = ORIGIN, report = true } = {}) => {
    const headers = { ...(origin && { Origin:origin }) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (report && method !== 'GET') headers['X-5E-Report'] = '1';
    if (admin) headers.Authorization = `Bearer ${ADMIN}`;
    const response = await fetch(base + suffix, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const type = response.headers.get('content-type') || '';
    return { status:response.status, data: type.includes('json') ? await response.json() : await response.arrayBuffer() };
  };
}
const report = (overrides = {}) => ({ id:crypto.randomUUID(), title:'작업대 오류', description:'크롭이 안 들어갑니다.',
  images:[], password:'pass-word-1', context:{ version:'1.7.0' }, ...overrides });

test('신고 작성·목록·상세: 비밀번호 평문과 환경 정보는 공개되지 않는다', async t => {
  const call = await board(t), input = report();
  assert.equal((await call('', { method:'POST', body:input })).status, 201);
  const list = await call(); assert.equal(list.data.total, 1); assert.equal(list.data.reports[0].title, '작업대 오류');
  const detail = await call('/' + input.id);
  assert.equal(detail.data.version, '1.7.0'); assert.equal('context' in detail.data, false);
  assert.equal(JSON.stringify(detail.data).includes('pass-word-1'), false);
  // 같은 번호 재전송(네트워크 재시도)은 같은 결과, 내용이 다르면 거부
  assert.equal((await call('', { method:'POST', body:input })).status, 200);
  assert.equal((await call('', { method:'POST', body:{ ...input, description:'다른 내용' } })).status, 409);
});

test('쓰기 요청은 허용된 출처와 X-5E-Report 머리말이 있어야 한다', async t => {
  const call = await board(t);
  assert.equal((await call('', { method:'POST', body:report(), origin:'https://evil.example' })).status, 403);
  assert.equal((await call('', { method:'POST', body:report(), report:false })).status, 403);
  assert.equal((await call('', { method:'POST', body:report({ password:'short' }) })).status, 400);
  assert.equal((await call('', { method:'POST', body:report({ description:'', images:[] }) })).status, 400);
});

test('비공개 이미지는 작성자 확인·관리자만, 공개 이미지는 누구나 본다', async t => {
  const call = await board(t), input = report({ images:[{ name:'비공개', data:PNG }, { name:'공개', data:PNG, public:true }] });
  assert.equal((await call('', { method:'POST', body:input })).status, 201);
  const anon = await call('/' + input.id); assert.deepEqual(anon.data.images.map(i => i.name), ['공개']);
  assert.equal((await call(`/${input.id}/access`, { method:'POST', body:{ password:'wrong-pass-1' } })).status, 401);
  const owner = await call(`/${input.id}/access`, { method:'POST', body:{ password:'pass-word-1' } });
  assert.equal(owner.data.images.length, 2); assert.match(owner.data.images.find(i => i.name === '비공개').data, /^data:image\/png;base64,/);
  const privateId = owner.data.images.find(i => i.name === '비공개').id;
  assert.equal((await call(`/${input.id}/images/${privateId}`)).status, 404);
  assert.equal((await call(`/${input.id}/images/${privateId}`, { admin:true })).status, 200);
  // 이미지가 아닌 내용은 PNG라고 해도 거부
  const fake = 'data:image/png;base64,' + Buffer.from('not an image at all').toString('base64');
  assert.equal((await call('', { method:'POST', body:report({ images:[{ name:'x', data:fake }] }) })).status, 400);
});

test('작성자 수정·추가 내용·삭제, 동시 수정 충돌, 처리 상태는 관리자만', async t => {
  const call = await board(t), input = report();
  await call('', { method:'POST', body:input });
  assert.equal((await call('/' + input.id, { method:'PATCH', body:{ password:'pass-word-1', revision:1, status:'fixed' } })).status, 403);
  assert.equal((await call('/' + input.id, { method:'PATCH', body:{ password:'pass-word-1', revision:1, title:'제목 수정' } })).status, 200);
  assert.equal((await call('/' + input.id, { method:'PATCH', body:{ password:'pass-word-1', revision:1, title:'옛 화면에서 수정' } })).status, 409);
  assert.equal((await call(`/${input.id}/replies`, { method:'POST', body:{ password:'pass-word-1', body:'Safari에서도 같아요' } })).status, 201);
  assert.equal((await call('/' + input.id, { method:'PATCH', admin:true, body:{ revision:2, status:'fixed', fixed_version:'1.7.0', admin_note:'메모' } })).status, 200);
  const detail = await call('/' + input.id);
  assert.equal(detail.data.status, 'fixed'); assert.equal(detail.data.fixed_version, '1.7.0'); assert.equal('admin_note' in detail.data, false);
  assert.deepEqual(detail.data.replies.map(r => r.role), ['author']);
  assert.equal((await call('/' + input.id, { method:'DELETE', body:{ password:'pass-word-1', revision:3 } })).status, 200);
  assert.equal((await call('/' + input.id)).status, 404);
});

test('공감은 방문자마다 한 번, FAQ는 관리자만 쓰고 누구나 읽는다', async t => {
  const call = await board(t), input = report(), visitor = crypto.randomUUID();
  await call('', { method:'POST', body:input });
  assert.equal((await call(`/${input.id}/vote`, { method:'POST', body:{ visitor } })).data.votes, 1);
  assert.equal((await call(`/${input.id}/vote`, { method:'POST', body:{ visitor } })).data.votes, 1);
  assert.equal((await call('/faqs', { method:'POST', body:{ question:'q', answer:'a' } })).status, 401);
  assert.equal((await call('/faqs', { method:'POST', admin:true, body:{ question:'질문', answer:'답변' } })).status, 201);
  assert.ok((await call('/faqs')).data.faqs.some(f => f.question === '질문'));
  assert.equal((await call('/admin/session', { method:'POST', body:{} })).status, 401);
  assert.equal((await call('/admin/session', { method:'POST', admin:true, body:{} })).status, 200);
});

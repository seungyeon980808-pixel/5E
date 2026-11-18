const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createExamFiles, safeName, renameWithRetry } = require('./exam-files.cjs');

test('exam files: autosave, backups, named exports stay inside 5E/출제', async t => {
  const docs = fs.mkdtempSync(path.join(os.tmpdir(), '5e-exam-files-'));
  t.after(() => fs.rmSync(docs, { recursive: true, force: true }));
  let clock = new Date(2026, 10, 11, 21, 30);
  const files = createExamFiles({ documentsPath: docs, now: () => clock });
  const root = path.join(docs, '5E', '출제');
  assert.equal((await files.readLatest()).text, null);
  await files.autosave('{"a":1}');
  assert.equal(fs.readFileSync(path.join(root, '자동 저장', '최근.json'), 'utf8'), '{"a":1}');
  assert.ok(fs.existsSync(path.join(root, '자동 저장', '백업', '2026-11-11', '2130.json')));
  clock = new Date(2026, 10, 11, 21, 35); await files.autosave('{"a":2}');
  assert.ok(!fs.existsSync(path.join(root, '자동 저장', '백업', '2026-11-11', '2135.json')), 'backup at most every 10 minutes');
  clock = new Date(2026, 10, 11, 21, 41); await files.autosave('{"a":3}');
  assert.ok(fs.existsSync(path.join(root, '자동 저장', '백업', '2026-11-11', '2141.json')));
  assert.equal((await files.readLatest()).text, '{"a":3}');
  const one = await files.save({ name: '20번 문항.hwpx', ext: 'hwpx', bytes: new Uint8Array([1, 2]) });
  assert.equal(one.name, '2026-11-11_2141_20번 문항.hwpx');
  assert.equal(path.dirname(one.path), path.join(root, '한글'));
  const two = await files.save({ name: '20번 문항', ext: 'hwpx', bytes: new Uint8Array([3]) });
  assert.equal(two.name, '2026-11-11_2141_20번 문항 (2).hwpx');
  const evil = await files.save({ name: '../../x', ext: 'xlsx', bytes: new Uint8Array([1]) });
  assert.equal(path.dirname(evil.path), path.join(root, '엑셀'));
  await assert.rejects(files.save({ name: 'a', ext: 'exe', bytes: new Uint8Array([1]) }));
  assert.throws(() => files.inside(path.join(docs, 'other.txt')));
  assert.equal(files.inside(one.path), one.path);
  assert.equal(safeName('a/b:c'), 'a_b_c');
});

test('exam files: 백업 보관 규칙 — 최근 24개 + 30일 동안 하루 마지막 하나', () => {
  const { backupsToTrash } = require('./exam-files.cjs');
  // 10-01 ~ 11-09, 하루 세 개
  const days = []; for (let i = 0; i < 40; i++) { const t = new Date(2026, 9, 1 + i); days.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`); }
  const backups = days.flatMap(day => ['0900', '1200', '1500'].map(time => ({ day, time })));
  const out = backupsToTrash(backups, '2026-11-09');
  const kept = backups.filter(b => !out.includes(b));
  // 최근 24개 = 마지막 8일 × 3, 그 앞 22일(10-11 ~ 11-01)은 하루 하나, 10-10 이전은 모두 휴지통
  assert.equal(kept.length, 24 + 22);
  assert.ok(kept.some(b => b.day === '2026-10-11' && b.time === '1500'));
  assert.ok(!kept.some(b => b.day === '2026-10-10'));
  assert.ok(!kept.some(b => b.day === '2026-10-11' && b.time === '0900'));
  assert.equal(backupsToTrash(backups.slice(-10), '2026-11-09').length, 0, '24개 이하면 아무것도 옮기지 않음');
});

test('exam files: 넘친 백업은 휴지통으로(폴더째 또는 파일만), 규칙 밖 파일은 그대로', async t => {
  const docs = fs.mkdtempSync(path.join(os.tmpdir(), '5e-exam-prune-'));
  t.after(() => fs.rmSync(docs, { recursive: true, force: true }));
  const trashed = [];
  const trashDir = path.join(docs, '휴지통');
  const trash = async file => { trashed.push(path.relative(docs, file)); fs.mkdirSync(trashDir, { recursive: true }); fs.renameSync(file, path.join(trashDir, `${trashed.length}-${path.basename(file)}`)); };
  let clock = new Date(2026, 10, 16, 9, 0);
  const files = createExamFiles({ documentsPath: docs, now: () => clock, trash });
  const backup = path.join(docs, '5E', '출제', '자동 저장', '백업');
  const put = (day, time) => { fs.mkdirSync(path.join(backup, day), { recursive: true }); fs.writeFileSync(path.join(backup, day, `${time}.json`), '{}'); };
  for (let h = 0; h < 30; h++) put('2026-11-15', `${String(Math.floor(h / 6) + 8).padStart(2, '0')}${String((h % 6) * 10).padStart(2, '0')}`);
  put('2026-09-01', '1000'); put('2026-09-01', '1100');          // 30일 밖 → 폴더째
  fs.writeFileSync(path.join(backup, '2026-11-15', '메모.txt'), 'x'); // 규칙 밖 → 그대로
  fs.mkdirSync(path.join(backup, '내 폴더'));                        // 규칙 밖 → 그대로
  await files.autosave('{"now":1}');                                  // 새 백업 2026-11-16/0900 + 정리
  const left = fs.readdirSync(path.join(backup, '2026-11-15')).filter(n => n.endsWith('.json'));
  assert.equal(left.length, 23, '오늘 1개 + 어제 23개 = 최근 24개');
  assert.ok(left.includes('1250.json'), '어제 마지막 것은 남음');
  assert.ok(!fs.existsSync(path.join(backup, '2026-09-01')), '30일 밖 하루 폴더는 폴더째 휴지통');
  assert.ok(trashed.includes(path.join('5E', '출제', '자동 저장', '백업', '2026-09-01')));
  assert.ok(fs.existsSync(path.join(backup, '2026-11-15', '메모.txt')) && fs.existsSync(path.join(backup, '내 폴더')));
  assert.ok(fs.existsSync(path.join(backup, '2026-11-16', '0900.json')));
  assert.equal(trashed.length, 1 + 7, '폴더 1개 + 어제 앞쪽 파일 7개');
  // 휴지통이 실패해도 자동 저장은 성공
  const failing = createExamFiles({ documentsPath: docs, now: () => new Date(2026, 10, 16, 10, 0), trash: async () => { throw new Error('no trash'); } });
  for (let h = 0; h < 30; h++) put('2026-11-14', `${String(Math.floor(h / 6) + 8).padStart(2, '0')}${String((h % 6) * 10).padStart(2, '0')}`);
  assert.equal((await failing.autosave('{"now":2}')).path.endsWith('최근.json'), true);
  // 휴지통 함수가 없으면 아무것도 옮기지 않음
  clock = new Date(2026, 10, 16, 11, 0);
  assert.deepEqual(await createExamFiles({ documentsPath: docs, now: () => clock }).pruneBackups(), { trashed: [] });
});

// 1.8.0 X1 윈도우 점검: 파일 이름·경로 길이·잠긴 파일 덮어쓰기.
test('윈도우 파일 이름: 금지 글자·제어 문자는 _로, 앞 점 제거, 120자, 날짜 접두로 CON·NUL 같은 예약 이름이 되지 않음', () => {
  assert.equal(safeName('물리 <1>: "기말" a/b\\c|d?e*'), '물리 _1__ _기말_ a_b_c_d_e_');
  assert.equal(safeName('...숨김'), '숨김');
  assert.equal(safeName('CON'), 'CON', '이름 자체는 두되 저장 이름은 YYYY-MM-DD_HHMM_CON.hwpx라 예약 이름이 아님');
  const long = safeName('가'.repeat(400));
  assert.equal(long.length, 120);
  // 흔한 윈도우 문서 폴더(OneDrive 포함)에서 전체 경로가 260자(MAX_PATH) 안에 드는지
  const docs = 'C:\\Users\\사용자이름이긴선생님\\OneDrive - 교육청\\문서';
  const full = path.win32.join(docs, '5E', '출제', '한글', `2026-11-19_0930_${long}.hwpx`);
  assert.ok(full.length < 260, `경로 길이 ${full.length}`);
});

test('잠긴 파일 덮어쓰기(윈도우 EPERM·EBUSY·EACCES)는 잠깐 기다렸다 다시, 다른 오류·끝내 실패는 그대로', async () => {
  const waits = [];
  let calls = 0;
  await renameWithRetry('a.tmp', 'a', { rename: async () => { calls++; if (calls < 3) throw Object.assign(new Error('busy'), { code: calls === 1 ? 'EPERM' : 'EBUSY' }); }, wait: async ms => waits.push(ms) });
  assert.equal(calls, 3); assert.deepEqual(waits, [40, 80]);
  await assert.rejects(renameWithRetry('a.tmp', 'a', { rename: async () => { throw Object.assign(new Error('no'), { code: 'ENOENT' }); }, wait: async () => {} }), /no/);
  let n = 0;
  await assert.rejects(renameWithRetry('a.tmp', 'a', { rename: async () => { n++; throw Object.assign(new Error('locked'), { code: 'EACCES' }); }, wait: async () => {}, delays: [1, 1] }), /locked/);
  assert.equal(n, 3);
});

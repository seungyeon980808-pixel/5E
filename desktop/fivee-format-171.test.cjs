// 1.7.1 확장자 통일(.5e) 검사: 문항·시험지 .5e(kind 'sheet') 왕복, 1.6.3·1.7.0 파일 그대로 열기, 설치판 출제 폴더 저장 종류.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createExamFiles, KINDS } = require('./exam-files.cjs');
const root = path.resolve(__dirname, '..');
const load = p => import(pathToFileURL(path.join(root, p)).href);
const fixture = p => new Uint8Array(fs.readFileSync(path.join(root, 'tests', 'fixtures', p)));
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const bytesOf = async blob => new Uint8Array(await blob.arrayBuffer());

async function sampleSheet() {
  const model = await load('assets/exampool/sheet/model.js');
  const q1 = model.newQuestion('1', '객관식'); model.applyPreset(q1, '그림'); q1.ask = '첫 문항';
  q1.blocks.find(b => b.kind === 'figure').figure = { name: '그림', data: png, width: 1, height: 1 };
  const q2 = model.newQuestion('2', '합답형'); q2.ask = '둘째 문항';
  const exam = { id: 'exam-a', title: '별과 우주', status: 'drafting', items: [q2.id, q1.id], formId: 'form-a', createdAt: '2026-11-16T00:00:00.000Z', updatedAt: '2026-11-16T00:00:00.000Z' };
  const data = { questions: [q1, q2, model.newQuestion('3', '서술형')], documents: [], exams: [exam] };
  const form = { id: 'form-a', name: '학교 양식', fileName: '양식.hwpx', structure: { cols: 2 }, standardId: 'std-a', bytes: new Uint8Array([80, 75, 3, 4, 9, 9, 9]) };
  return { model, data, exam, form, std: { id: 'std-a', name: '학교 기준' } };
}

test('설치판 출제 폴더: .5e를 저장하고, 5E_exam이 저장하는 확장자는 모두 받는다(1.7.0 .exampool 실패 재발 막기)', async t => {
  const docs = fs.mkdtempSync(path.join(os.tmpdir(), '5e-format-171-'));
  t.after(() => fs.rmSync(docs, { recursive: true, force: true }));
  const files = createExamFiles({ documentsPath: docs, now: () => new Date(2026, 10, 16, 22, 0) });
  const saved = await files.save({ name: '별과 우주.5e', ext: '5e', bytes: new Uint8Array([80, 75, 3, 4]) });
  assert.equal(saved.name, '2026-11-16_2200_별과 우주.5e');
  assert.equal(path.dirname(saved.path), path.join(docs, '5E', '출제', '프로젝트'));
  await assert.rejects(files.save({ name: 'x.exampool', ext: 'exampool', bytes: new Uint8Array([1]) }), /저장할 수 없는/);
  const dir = path.join(root, 'assets', 'exampool', 'sheet'), used = new Set();
  for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.js'))) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    for (const call of text.matchAll(/(?<!function )\b(?:download|saveOut)\(([^;]{0,240})/g))
      for (const m of call[1].matchAll(/\.([a-z0-9]{1,8})[`'"]/g)) used.add(m[1]);
    if (/projectFileName\(/.test(text)) used.add('5e');
  }
  assert.ok(used.has('xlsx') && used.has('hwpx') && used.has('5e'), [...used].join(','));
  for (const ext of used) assert.ok(KINDS[ext], `설치판 출제 폴더가 .${ext}를 받지 않음`);
});

test('문항·시험지 .5e(sheet) 왕복: 문항 순서·그림·학교 양식·조판 기준이 그대로, 그림은 assets/로 빠짐', async () => {
  const { data, exam, form, std } = await sampleSheet();
  const { examBundle, buildSheetProject, readSheetFile, projectFileName } = await load('assets/exampool/sheet/sheet-file.js');
  const { unzipStore } = await load('js/backup-zip.js');
  const bundle = examBundle(data, exam, { forms: [form], standards: [std] });
  assert.deepEqual(bundle.questions.map(q => q.ask), ['둘째 문항', '첫 문항']);
  const packed = await bytesOf(buildSheetProject(bundle, { name: exam.title }));
  const entries = unzipStore(packed);
  assert.ok(entries.has('assets/0') && entries.has('forms/0'), [...entries.keys()].join(','));
  assert.ok(!new TextDecoder().decode(entries.get('project.json')).includes('base64,'), '그림이 JSON 안에 남지 않음');
  const manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json')));
  assert.equal(manifest.kind, 'sheet'); assert.equal(manifest.name, '별과 우주');
  const read = await readSheetFile(projectFileName(exam.title), packed);
  assert.equal(read.kind, 'sheet');
  assert.deepEqual(read.pending.exams[0].items, exam.items);
  assert.equal(read.pending.questions.find(q => q.ask === '첫 문항').blocks.find(b => b.kind === 'figure').figure.data, png);
  assert.deepEqual([...read.pending.forms[0].bytes], [...form.bytes]);
  assert.deepEqual(read.pending.forms[0].structure, form.structure);
  assert.equal(read.pending.standards[0].id, 'std-a');
  assert.equal(read.pending.fileName, '별과 우주.5e');
  assert.equal(projectFileName('a/b:c'), 'a_b_c.5e');
});

test('1.7.0 파일이 1.7.1에서 그대로 열림: 시험지 파일·옛 ExamPool .exampool, 그림·한글 시험지 .5e', async () => {
  const { readSheetFile } = await load('assets/exampool/sheet/sheet-file.js');
  const { parseFiveEProject } = await load('js/fivee-project.js');
  const { parseExamProject } = await load('js/rhwp-exam-project.js');
  const sheet = await readSheetFile('시험지.exampool', fixture('data-compat-1.7.0/sheet-1.7.0.exampool'));
  assert.equal(sheet.kind, 'sheet');
  assert.deepEqual(sheet.pending.exams[0].items, ['q-170-1', 'q-170-2']);
  assert.equal(sheet.pending.forms[0].id, 'form-170');
  assert.ok(sheet.pending.forms[0].bytes instanceof Uint8Array && sheet.pending.forms[0].bytes[0] === 80);
  const pool = await readSheetFile('문항.exampool', fixture('data-compat-1.7.0/pool-1.7.0.exampool'));
  assert.equal(pool.kind, 'sheet'); assert.equal(pool.pending.questions.length, 1);
  const drawing = parseFiveEProject(fixture('data-compat-1.7.0/drawing-1.7.0.5e'));
  assert.equal(drawing.kind, 'drawing'); assert.equal(drawing.drawing.pages[0].objects[0].src.startsWith('data:image/png;base64,'), true);
  const exam = parseExamProject(fixture('data-compat-1.7.0/exam-1.7.0.5e'));
  assert.equal(exam.name, '1.7.0 한글 시험지'); assert.equal(exam.figures[0].id, 'fig1');
  // 5E_exam에서 그림·한글 시험지 .5e를 고르면 넘겨 열기
  assert.deepEqual(await readSheetFile('a.5e', fixture('data-compat-1.7.0/drawing-1.7.0.5e')), { kind: 'project', projectKind: 'drawing' });
  assert.deepEqual(await readSheetFile('b.5e', fixture('data-compat-1.7.0/exam-1.7.0.5e')), { kind: 'project', projectKind: 'exam' });
});

test('1.6.3 파일이 1.7.1에서 그대로 열림: JSON .5e 그림, 5E_exam에서 고르면 그림 화면으로 넘김', async () => {
  const { parseFiveEProject } = await load('js/fivee-project.js');
  const { readSheetFile } = await load('assets/exampool/sheet/sheet-file.js');
  const old = fixture('data-compat-1.6.3/project-1.6.3.5e');
  const parsed = parseFiveEProject(old);
  assert.equal(parsed.kind, 'drawing'); assert.ok(Array.isArray(parsed.drawing.pages) && parsed.drawing.pages.length > 0);
  assert.deepEqual(await readSheetFile('project-1.6.3.5e', old), { kind: 'project', projectKind: 'drawing' });
});

test('엑셀은 확장자로, 이름이 바뀐 엑셀은 바이트로 엑셀 읽기에 넘김', async () => {
  const { readSheetFile } = await load('assets/exampool/sheet/sheet-file.js');
  const { zipStore } = await load('js/backup-zip.js');
  const calls = [], importExcel = async buffer => { calls.push(buffer.byteLength); return { questions: [], documents: [], exams: [], warnings: [] }; };
  const xlsxLike = await bytesOf(zipStore([{ name: '[Content_Types].xml', data: new TextEncoder().encode('<x/>') }]));
  assert.equal((await readSheetFile('문항.xlsx', xlsxLike, { importExcel })).kind, 'sheet');
  assert.equal((await readSheetFile('문항.exampool', xlsxLike, { importExcel })).kind, 'sheet');
  assert.deepEqual(calls, [xlsxLike.length, xlsxLike.length]);
});

test('알 수 없는 종류·깨진 파일은 거절하고, 1.7.0이 모르는 sheet는 1.7.0 해석 규칙에서도 거절됨', async () => {
  const { buildFiveEProject, parseFiveEProject, FIVE_E_PROJECT_KINDS } = await load('js/fivee-project.js');
  const { zipStore, unzipStore } = await load('js/backup-zip.js');
  const { readSheetFile } = await load('assets/exampool/sheet/sheet-file.js');
  assert.deepEqual([...FIVE_E_PROJECT_KINDS], ['drawing', 'exam', 'sheet']);
  assert.throws(() => buildFiveEProject({ kind: 'sheet', projectId: 'x', questions: 'no' }), /문항 프로젝트/);
  assert.throws(() => buildFiveEProject({ kind: 'sheet', projectId: 'x', format: 'f', questions: [], forms: [{ id: 'a', bytes: 'nope' }] }), /학교 양식/);
  const good = await bytesOf(buildFiveEProject({ kind: 'sheet', projectId: 'x', name: 'n', format: '5e-question-sheet-v2', questions: [], documents: [], exams: [], forms: [{ id: 'f', bytes: new Uint8Array([1, 2]) }] }));
  const files = unzipStore(good);
  const rezip = async map => bytesOf(zipStore([...map].map(([name, data]) => ({ name, data }))));
  const noForm = new Map(files); noForm.delete('forms/0');
  const noFormBytes = await rezip(noForm); assert.throws(() => parseFiveEProject(noFormBytes), /학교 양식/);
  const future = new Map(files); future.set('manifest.json', new TextEncoder().encode(JSON.stringify({ ...JSON.parse(new TextDecoder().decode(files.get('manifest.json'))), kind: 'board' })));
  const futureBytes = await rezip(future); assert.throws(() => parseFiveEProject(futureBytes), /지원하는 5E 프로젝트 파일이 아닙니다/);
  await assert.rejects(readSheetFile('x.json', new TextEncoder().encode('{깨짐')), /지원하는 문항 파일이 아닙니다/);
  // 1.7.0 parseFiveEProject의 종류 검사(['drawing','exam'])와 같은 규칙: sheet는 「지원하는 5E 프로젝트 파일이 아닙니다」로 거절 → 데이터를 건드리지 않음
  const kind = JSON.parse(new TextDecoder().decode(files.get('manifest.json'))).kind;
  assert.equal(['drawing', 'exam'].includes(kind), false);
});

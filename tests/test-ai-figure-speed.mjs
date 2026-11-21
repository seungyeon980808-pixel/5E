// GENSPEED(11-20) 그림 생성·고치기 빠르게 — 가짜 AI만 쓴다(실제 AI·네트워크 없음).
// 1) 기출 검색을 구체화와 나란히(첫 장면은 처음 요청으로, 둘째 장면은 첫 장면 그리는 동안 미리)
// 2) 글자만 지우는 「이 그림 고치기」는 다시 그리지 않고 그 자리 글자만(확인이 안 되면 그리기 길로). 바꾸기는 기본 그리기 길, localReplace면 로컬
// 3) 끄는 플래그 5e.aiEngine.figureSpeed='0'
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, makeIndex, normalizeTextOps } from '../js/ai-figure/index.js';
import { figureSpeedFlag, figureLocalReplaceFlag, AI_ENGINE_FLAG_KEYS } from '../js/ai-engine-flags.js';

const png = (name) => 'data:image/png;base64,' + Buffer.from(name).toString('base64');
const nameOf = (url) => Buffer.from(String(url).split(',')[1] || '', 'base64').toString();
const gray = async (d) => ({ data: d, applied: true, reason: null });
const TAX = { types: ['역학 모식도(물체·빗면·도르래·용수철)'], styles: [] };
const TAGS = ['a', 'b', 'c', 'd'].map((x, i) => ({ id: `p1_2025_0${i + 1}_01-1`, subject: '물리학Ⅰ', year: 2025, type: TAX.types[0], style: '', tags: ['빗면'], desc: x, src: 'kice' }));
const fetchRefs = async (url) => {
  const m = /\/q\/(.+)\.json$/u.exec(String(url));
  return { ok: true, status: 200, json: async () => ({ question: { blocks: [{ kind: 'figure', figure: { data: png('ref:' + decodeURIComponent(m[1])) } }] } }) };
};
const deferred = () => { let resolve; const p = new Promise((r) => { resolve = r; }); return { p, resolve }; };

function genAi({ scenes = ['장면 하나'], expandGate = null, imageGate = null } = {}) {
  const log = [];
  const ai = {
    async readText({ text }) {
      if (text.includes('그림 담당')) { log.push('expand:start'); if (expandGate) await expandGate.p; log.push('expand:end'); return JSON.stringify({ type: TAX.types[0], scenes, keyValues: '' }); }
      if (text.includes('검색 조건')) { log.push('classify:' + (text.match(/요청: (.*)$/u)?.[1] || '')); return '{"subject":"물리학Ⅰ","types":["역학 모식도(물체·빗면·도르래·용수철)"],"keywords":["빗면"]}'; }
      if (text.includes('「참고 그림」으로 쓸')) { log.push('pick'); return '["p1_2025_02_01-1","p1_2025_01_01-1","p1_2025_03_01-1"]'; }
      if (text.includes('시험 문항 그림이다')) return '{"has":false,"texts":[]}';
      throw new Error('알 수 없는 지시문');
    },
    async generateImage({ attachments }) {
      log.push('image:start:' + attachments.length);
      if (imageGate) await imageGate.p;
      log.push('image:end');
      return png('gen');
    },
  };
  return { ai, log };
}
const genEngine = (ai) => createEngine({ ai, fetch: fetchRefs, index: makeIndex({ taxonomy: TAX, tags: TAGS }), grayscale: gray, retries: { text: 1, image: 1, scene: 1 } });

test('생성: 기출 검색(분류·고르기)이 구체화를 기다리지 않고 나란히 시작한다', async () => {
  const gate = deferred();
  const { ai, log } = genAi({ expandGate: gate });
  const run = genEngine(ai).makeFigureSet({ request: '빗면 위 물체' });
  await new Promise((r) => setTimeout(r, 20));
  // 구체화가 아직 끝나지 않았는데 분류·고르기는 이미 끝났다
  assert.ok(!log.includes('expand:end'));
  assert.ok(log.includes('classify:빗면 위 물체'));
  assert.ok(log.includes('pick'));
  gate.resolve();
  const out = await run;
  assert.equal(out.ok, true);
  assert.deepEqual(out.scenes[0].refs, ['p1_2025_02_01-1', 'p1_2025_01_01-1', 'p1_2025_03_01-1']);
  // 검색은 한 번만(첫 장면이 미리 고른 것을 그대로 씀)
  assert.equal(log.filter((x) => x.startsWith('classify')).length, 1);
});

test('생성: earlyRetrieve=false면 예전처럼 구체화 뒤 장면 요청으로 검색한다', async () => {
  const { ai, log } = genAi({ scenes: ['구체화된 장면'] });
  await genEngine(ai).makeFigureSet({ request: '빗면 위 물체', earlyRetrieve: false });
  assert.ok(log.indexOf('expand:end') < log.findIndex((x) => x.startsWith('classify')));
  assert.deepEqual(log.filter((x) => x.startsWith('classify')), ['classify:구체화된 장면']);
});

test('생성: 장면이 둘이면 둘째 장면 검색을 첫 장면 그리는 동안 미리 한다', async () => {
  const gate = deferred();
  const { ai, log } = genAi({ scenes: ['(가) 장면', '(나) 장면'], imageGate: gate });
  const run = genEngine(ai).makeFigureSet({ request: '두 장면' });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(log.includes('image:start:3'));
  assert.ok(!log.includes('image:end'));
  assert.ok(log.includes('classify:(나) 장면'), '첫 그림이 끝나기 전에 둘째 장면 검색을 시작');
  gate.resolve();
  const out = await run;
  assert.equal(out.scenes.length, 2);
  assert.equal(out.ok, true);
});

test('생성: refCount로 참고 그림 수를 줄일 수 있다(기본 3)', async () => {
  const { ai, log } = genAi();
  await genEngine(ai).makeFigureSet({ request: '빗면', refCount: 1 });
  assert.ok(log.includes('image:start:1'));
});

// ── 고치기: 글자만 고치는 빠른 길 ──
const PREV = png('prev');
function editAi({ find, verify = ['{"done":true,"unwanted":[],"sentences":[]}'] } = {}) {
  const calls = { text: [], image: [] };
  let v = 0;
  const ai = {
    async readText({ text, attachments }) {
      calls.text.push({ text, attachments });
      if (text.includes('일부만 고쳐')) return find;
      if (text.includes('첫 그림은 고치기 전') || text.includes('같은 부분을 잘라 낸')) return verify[Math.min(v++, verify.length - 1)];
      throw new Error('알 수 없는 지시문');
    },
    async generateImage({ text, attachments }) { calls.image.push({ text, attachments }); return png('drawn'); },
  };
  return { ai, calls };
}
const TEXT_FIND = JSON.stringify({ targets: ['T'], keep: ['A'], summary: 'T만 지움', mode: 'text', ops: [{ op: 'remove', text: 'T', kind: 'qty', x: 0.5, y: 0.2, w: 0.03, h: 0.04 }] });
const editEngine = (ai, localEdit) => createEngine({ ai, index: makeIndex({}), grayscale: gray, retries: { text: 1, image: 1 }, localEdit });

test('고치기: 글자만 지우는 지시는 그림을 다시 그리지 않고 그 자리 글자만 지운다(확인 한 번)', async () => {
  const { ai, calls } = editAi({ find: TEXT_FIND });
  const seen = [];
  const localEdit = async (png0, ops) => { seen.push({ png0, ops }); return { image: png('local'), applied: true, erased: [120] }; };
  const phases = [];
  const r = await editEngine(ai, localEdit).editFigure({ previousPng: PREV, instruction: 'T는 빼 줘', onPhase: (e) => phases.push(e.phase + (e.local ? ':local' : '')) });
  assert.equal(r.ok, true);
  assert.equal(nameOf(r.scenes[0].image), 'local');
  assert.equal(calls.image.length, 0, '그림 AI를 부르지 않음');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].png0, PREV);
  assert.deepEqual(seen[0].ops.map((o) => [o.op, o.text]), [['remove', 'T']]);
  assert.deepEqual(r.edit.local.ops, [{ op: 'remove', text: 'T', to: '' }]);
  assert.equal(r.edit.verify.passed, true);
  assert.equal(r.scenes[0].editedFrom.local, true);
  assert.deepEqual(phases, ['edit-find', 'edit-apply:local', 'edit-verify:local', 'edit-finish:local']);
  // 확인은 앞 그림과 지운 그림을 견준다
  assert.deepEqual(calls.text[1].attachments.map(nameOf), ['prev', 'local']);
});

test('고치기: 지운 결과를 확인이 받아들이지 않으면 예전처럼 그림을 고쳐 그린다(실패로 끝나지 않음)', async () => {
  const { ai, calls } = editAi({ find: TEXT_FIND, verify: ['{"done":false,"unwanted":[],"sentences":[]}', '{"done":true,"unwanted":[],"sentences":[]}'] });
  const r = await editEngine(ai, async () => ({ image: png('local'), applied: true })).editFigure({ previousPng: PREV, instruction: 'T는 빼 줘' });
  assert.equal(r.ok, true);
  assert.equal(nameOf(r.scenes[0].image), 'drawn');
  assert.equal(calls.image.length, 1);
  assert.ok(r.edit.localRejected);
  assert.equal(r.edit.local, undefined);
});

test('고치기: 글자를 못 찾았거나(applied=false) 캔버스가 실패하면 그리기 길로', async () => {
  for (const localEdit of [async () => ({ image: png('local'), applied: false }), async () => { throw new Error('캔버스 없음'); }]) {
    const { ai, calls } = editAi({ find: TEXT_FIND });
    const r = await editEngine(ai, localEdit).editFigure({ previousPng: PREV, instruction: 'T는 빼 줘' });
    assert.equal(r.ok, true);
    assert.equal(nameOf(r.scenes[0].image), 'drawn');
    assert.equal(calls.image.length, 1);
  }
});

test('고치기: 모양을 바꾸는 지시(mode draw)·localText=false·localEdit 없음은 늘 그리기 길', async () => {
  const drawFind = JSON.stringify({ targets: ['화살표'], keep: [], summary: '화살표 반대', mode: 'draw', ops: [] });
  const cases = [{ find: drawFind, local: true, le: true }, { find: TEXT_FIND, local: false, le: true }, { find: TEXT_FIND, local: true, le: false }];
  for (const c of cases) {
    const { ai, calls } = editAi({ find: c.find });
    let used = 0;
    const r = await editEngine(ai, c.le ? async () => { used++; return { image: png('local'), applied: true }; } : null).editFigure({ previousPng: PREV, instruction: '바꿔', localText: c.local });
    assert.equal(nameOf(r.scenes[0].image), 'drawn');
    assert.equal(used, 0);
    assert.equal(calls.image.length, 1);
  }
});

test('normalizeTextOps: 상자가 0~1 밖이거나 너무 크거나 바꿀 글자가 없으면 통째로 버린다', () => {
  const ok = { op: 'replace', text: '28.0 ℃', to: '30.0 ℃', kind: 'math', x: 0.8, y: 0.2, w: 0.1, h: 0.05 };
  assert.equal(normalizeTextOps([ok]).length, 1);
  assert.deepEqual(normalizeTextOps([]), []);
  assert.deepEqual(normalizeTextOps([{ ...ok, x: 1.2 }]), []);
  assert.deepEqual(normalizeTextOps([{ ...ok, w: 0.9 }]), []);
  assert.deepEqual(normalizeTextOps([{ ...ok, to: '' }]), []);
  assert.deepEqual(normalizeTextOps([ok, { ...ok, op: 'move' }]), []);
  assert.equal(normalizeTextOps([{ ...ok, kind: '이상' }])[0].kind, 'math');
  assert.equal(normalizeTextOps([{ op: 'remove', text: 'T', x: 0.95, y: 0.1, w: 0.1, h: 0.05 }])[0].w.toFixed(2), '0.05');
});

test('플래그: 5e.aiEngine.figureSpeed 기본 켜짐, \'0\'이면 끔', () => {
  const store = (m = {}) => ({ getItem: (k) => m[k] ?? null });
  assert.equal(figureSpeedFlag(store()), true);
  assert.equal(figureSpeedFlag(store({ [AI_ENGINE_FLAG_KEYS.figureSpeed]: '0' })), false);
  assert.equal(figureSpeedFlag({ getItem() { throw new Error('막힘'); } }), true);
});

test('고치기: 글자 바꾸기(replace)는 기본으로 그리기 길, localReplace=true면 로컬', async () => {
  const replaceFind = JSON.stringify({ targets: ['Zn'], keep: [], summary: 'Zn을 Mg로', mode: 'text', ops: [{ op: 'replace', text: 'Zn', to: 'Mg', kind: 'en', x: 0.1, y: 0.2, w: 0.05, h: 0.05 }] });
  for (const [localReplace, expectLocal] of [[false, false], [true, true]]) {
    const { ai, calls } = editAi({ find: replaceFind });
    let used = 0;
    const r = await editEngine(ai, async (p0, ops) => { used++; assert.equal(ops[0].to, 'Mg'); return { image: png('local'), applied: true }; })
      .editFigure({ previousPng: PREV, instruction: 'Zn을 Mg로 바꿔 줘', localReplace });
    assert.equal(nameOf(r.scenes[0].image), expectLocal ? 'local' : 'drawn');
    assert.equal(used, expectLocal ? 1 : 0);
    assert.equal(calls.image.length, expectLocal ? 0 : 1);
  }
});

test('플래그: 5e.aiEngine.figureLocalReplace 기본 꺼짐, \'1\'이면 켬', () => {
  const store = (m = {}) => ({ getItem: (k) => m[k] ?? null });
  assert.equal(figureLocalReplaceFlag(store()), false);
  assert.equal(figureLocalReplaceFlag(store({ [AI_ENGINE_FLAG_KEYS.figureLocalReplace]: '1' })), true);
});

test('안 C: 「글자 바꾸기 빠르게」 켬/끔 줄이 그림 설정(바꾸기 ▾)에 있고, 누르면 같은 저장 열쇠를 쓴다', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const row = html.match(/<div class="ai-setting-row ai-fast-replace-row"[\s\S]*?<\/div>\s*<button[^>]*>\?<\/button>/)?.[0] || '';
  assert.match(row, /글자 바꾸기 빠르게/);
  assert.match(row, /글자만 바꾸는 고침을 그림을 다시 그리지 않고 몇 초 만에 합니다\. 새 글자는 5E 글꼴로 들어갑니다\./);
  assert.match(row, /data-ai-fast-replace="0" aria-pressed="true"/, '기본 끔');
  const panel = readFileSync(new URL('../js/ai-panel.js', import.meta.url), 'utf8');
  assert.match(panel, /setItem\(AI_ENGINE_FLAG_KEYS\.figureLocalReplace, button\.dataset\.aiFastReplace === '1' \? '1' : '0'\)/);
  const store = (m = {}) => ({ getItem: (k) => m[k] ?? null });
  assert.equal(figureLocalReplaceFlag(store({ [AI_ENGINE_FLAG_KEYS.figureLocalReplace]: '0' })), false);
});

test('고치기: 로컬 지우기 확인은 고친 자리 둘레 조각(앞·뒤)으로 묻는다(그림 전체로 물으면 먼 라벨을 잘못 말함)', async () => {
  const { ai, calls } = editAi({ find: TEXT_FIND });
  const crops = { before: png('crop-before'), after: png('crop-after'), box: { x: 0.4, y: 0.1, w: 0.2, h: 0.2 } };
  const r = await editEngine(ai, async () => ({ image: png('local'), applied: true, crops })).editFigure({ previousPng: PREV, instruction: 'T는 빼 줘' });
  assert.equal(nameOf(r.scenes[0].image), 'local');
  const v = calls.text.find((c) => c.text.includes('같은 부분을 잘라 낸'));
  assert.ok(v, '조각 확인 지시문');
  assert.deepEqual(v.attachments.map(nameOf), ['crop-before', 'crop-after']);
  assert.match(v.text, /T는 빼 줘/);
});

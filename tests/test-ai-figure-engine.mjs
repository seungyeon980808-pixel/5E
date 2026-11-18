// 그림 엔진(1.8.0, js/ai-figure/) 단위 검사 — 가짜 ai·fetch만 쓴다(실제 AI·네트워크 없음).
// 밤샘2/C2-1.8.0경계.md 5절: parseJson, 검색 점수, fetchFigure, makeFigureSet 흐름(둘째 장면에 첫 장면 첨부), 설명 지우기, 실패·취소 때 앞 결과 유지.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  createEngine, makeFigureSet, parseJson, tryParseJson, scoreTag, scoreCandidates, fillPicks, makeIndex, loadFigureIndex,
  fetchFigure, parseFigureId, figureFromQuestion, buildFigurePrompt, normalizeExpanded, aiFigureEngineEnabled,
} from '../js/ai-figure/index.js';
import { parseTagLines, HAK_PENALTY } from '../js/ai-figure/retrieve.js';
import { clearFigureCache, collectReferenceImages, isUsableReferenceImage, MAX_REFERENCE_DATA_URL_CHARS } from '../js/ai-figure/reference-images.js';
import { PREV_SCENE_NOTE, SINGLE_SCENE_NOTE } from '../js/ai-figure/prompt.js';
import { EXAM_QUESTION_HOSTS } from '../js/library/image-hosts.js';

const png = (name) => 'data:image/png;base64,' + Buffer.from(name).toString('base64');
const nameOf = (url) => Buffer.from(String(url).split(',')[1] || '', 'base64').toString();

// ── 고정 자료 ──
const TAX = { types: ['역학 모식도(물체·빗면·도르래·용수철)', '열역학 장치(실린더·피스톤·열기관)', '생물 선화(동물·식물)', '기타'], styles: ['단순 도식(선·도형)'] };
const TAGS = [
  { id: 'p1_2025_06_03-1', subject: '물리학Ⅰ', year: 2025, type: '역학 모식도(물체·빗면·도르래·용수철)', style: '단순 도식(선·도형)', tags: ['빗면', '도르래', '실'], desc: '빗면 위 물체와 도르래', src: 'kice' },
  { id: 'p1_2024_09_05-2', subject: '물리학Ⅰ', year: 2024, type: '역학 모식도(물체·빗면·도르래·용수철)', style: '단순 도식(선·도형)', tags: ['용수철'], desc: '용수철에 매달린 물체', src: 'kice' },
  { id: 'p1_2025_03_07-1', subject: '물리학Ⅰ', year: 2025, type: '역학 모식도(물체·빗면·도르래·용수철)', style: '단순 도식(선·도형)', tags: ['빗면', '도르래', '실'], desc: '빗면 위 물체와 도르래', src: 'hak' },
  { id: 'p2_2023_11_10-1', subject: '물리학Ⅱ', year: 2023, type: '열역학 장치(실린더·피스톤·열기관)', style: '단순 도식(선·도형)', tags: ['피스톤'], desc: '실린더', src: 'kice' },
  { id: 'b1_2026_11_01-1', subject: '생명과학Ⅰ', year: 2026, type: '생물 선화(동물·식물)', style: '펜 선화·해칭', tags: ['쏙독새'], desc: '쏙독새', src: 'kice' },
];
const question = (...figs) => ({ question: { blocks: [{ kind: 'text', text: '문항' }, ...figs.map((f) => ({ kind: 'figure', figure: { data: f } })), { kind: 'figure', figure: { data: 'https://not-data' } }] } });

function fakeFetch({ missing = new Set(), hakOnly = new Set() } = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(String(url));
    const m = /\/q\/(.+)\.json$/u.exec(String(url));
    const item = m && decodeURIComponent(m[1]);
    const isHak = String(url).startsWith(EXAM_QUESTION_HOSTS.hak);
    if (!item || missing.has(item) || (hakOnly.has(item) && !isHak)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => question(png(`ref:${item}#1`), png(`ref:${item}#2`)) };
  };
  fn.calls = calls;
  return fn;
}

// 가짜 AI: 지시문 첫머리로 단계를 알아보고 정해 둔 답을 준다. 모든 호출을 기록한다.
function fakeAi({ scenes = ['장면 하나'], stripOn = new Set(), failImage = 0, imageFails = Infinity, onImage = null, textOverride = {} } = {}) {
  const calls = { text: [], image: [] };
  let n = 0, failed = 0;
  const ai = {
    async readText({ text, attachments, model }) {
      calls.text.push({ text, attachments, model });
      if (text.includes('그림 담당')) return textOverride.expand ?? '```json\n' + JSON.stringify({ type: TAX.types[0], graph: false, scenes, keyValues: '', notes: '마찰 무시' }) + '\n```';
      if (text.includes('검색 조건')) return textOverride.classify ?? '조건: {"subject":"물리학Ⅰ","types":["역학 모식도(물체·빗면·도르래·용수철)"],"keywords":["빗면","도르래"]}';
      if (text.includes('「참고 그림」으로 쓸')) return textOverride.pick ?? '["p1_2024_09_05-2","p1_2025_06_03-1","없는-1"]';
      if (text.includes('두 그림은 같은 요청')) return '{"better":2,"why":"선이 더 가늘다"}';
      if (text.includes('시험 문항 그림이다')) {
        if (textOverride.strip instanceof Error) throw textOverride.strip;
        return stripOn.has(nameOf(attachments[0])) ? '{"has":true,"texts":["마찰은 무시한다."]}' : '{"has":false,"texts":[]}';
      }
      throw new Error('알 수 없는 지시문');
    },
    async generateImage({ text, attachments, model }) {
      calls.image.push({ text, attachments, model });
      if (onImage) await onImage(calls.image.length);
      if (failImage && failed < imageFails) { failed++; throw new Error('그림 서버 오류'); }
      if (text.startsWith('첨부 그림에서 아래 설명 문장만')) return { imageDataUrl: png(`stripped:${nameOf(attachments[0])}`) };
      n++;
      return { imageDataUrl: png(`gen${n}`) };
    },
  };
  return { ai, calls };
}

const grayCalls = [];
const fakeGray = async (data) => { grayCalls.push(data); return { data: png(`gray:${nameOf(data)}`), applied: true, reason: null }; };
const engineOf = (ai, extra = {}) => createEngine({ ai, fetch: fakeFetch(), index: makeIndex({ taxonomy: TAX, tags: TAGS }), grayscale: fakeGray, ...extra });

test.beforeEach(() => { clearFigureCache(); grayCalls.length = 0; });

// ── parseJson ──
test('parseJson: 코드 펜스·앞뒤 설명 글·배열을 꺼낸다', () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('좋습니다. 결과: {"has":true,"texts":["x"]} 이상입니다.'), { has: true, texts: ['x'] });
  assert.deepEqual(parseJson('답: ["a","b","c"]'), ['a', 'b', 'c']);
  assert.deepEqual(parseJson('{"scenes":["[가]"],"n":[1,2]}'), { scenes: ['[가]'], n: [1, 2] });
  assert.throws(() => parseJson('JSON이 없음'), SyntaxError);
  assert.throws(() => parseJson('{깨짐'));
  assert.equal(tryParseJson('없음'), null);
  assert.equal(tryParseJson(undefined), null);
});

// ── 검색 점수(AI 없음) ──
test('scoreTag: 종류 순위·과목·검색어·연도·학평 감점', () => {
  const c = { subject: '물리학Ⅰ', types: ['역학 모식도(물체·빗면·도르래·용수철)', '열역학 장치(실린더·피스톤·열기관)'], keywords: ['빗면', '도르래', '없는말'] };
  // 종류 1순위 6 + 과목 2 + 검색어 2개 3 + (2025-2015)*0.02
  assert.equal(+scoreTag(TAGS[0], c).toFixed(4), +(6 + 2 + 3 + 0.2).toFixed(4));
  assert.equal(+scoreTag(TAGS[2], c).toFixed(4), +(6 + 2 + 3 + 0.2 - HAK_PENALTY).toFixed(4));
  // 종류 2순위 4 + 같은 과목군(물리학Ⅱ) 1 + 연도 0.16
  assert.equal(+scoreTag(TAGS[3], c).toFixed(4), +(4 + 1 + 0.16).toFixed(4));
  assert.equal(+scoreTag(TAGS[4], c).toFixed(4), +(0.22).toFixed(4));
  assert.equal(scoreTag({ id: 'x-1' }, null), 0);
});

test('scoreCandidates: 점수 순, 평가원이 학평보다 앞, 같은 문항 빼기, 개수 제한', () => {
  const c = { subject: '물리학Ⅰ', types: ['역학 모식도(물체·빗면·도르래·용수철)'], keywords: ['빗면'] };
  const ids = scoreCandidates(TAGS, c).map((x) => x.t.id);
  assert.deepEqual(ids.slice(0, 3), ['p1_2025_06_03-1', 'p1_2025_03_07-1', 'p1_2024_09_05-2']);
  assert.ok(!scoreCandidates(TAGS, c, { exclude: ['p1_2025_06_03'] }).some((x) => x.t.id === 'p1_2025_06_03-1'));
  assert.equal(scoreCandidates(TAGS, c, { limit: 2 }).length, 2);
  const scored = scoreCandidates(TAGS, c);
  assert.deepEqual(fillPicks(['p2_2023_11_10-1', '없는-1', 'p2_2023_11_10-1'], scored), ['p2_2023_11_10-1', 'p1_2025_06_03-1', 'p1_2025_03_07-1']);
  assert.deepEqual(fillPicks({ not: 'array' }, scored), ids.slice(0, 3));
});

test('색인: jsonl 줄마다 src, 깨진 줄 건너뜀, fetch로 불러오기·실패는 캐시 안 함', async () => {
  const lines = parseTagLines('{"id":"a-1","type":"기타"}\n깨진 줄\n\n{"no":"id"}\n{"id":"b-2"}\n', 'hak');
  assert.deepEqual(lines.map((l) => [l.id, l.src]), [['a-1', 'hak'], ['b-2', 'hak']]);
  let fail = true;
  const fetchImpl = async (url) => {
    if (fail) return { ok: false, status: 503 };
    if (url.endsWith('taxonomy.json')) return { ok: true, json: async () => TAX };
    if (url.endsWith('tags.jsonl')) return { ok: true, text: async () => '{"id":"k-1"}\n' };
    return { ok: true, text: async () => '{"id":"h-1"}\n' };
  };
  const base = 'https://example.test/idx-' + Math.random() + '/';
  await assert.rejects(loadFigureIndex({ fetch: fetchImpl, base }), /503/);
  fail = false;
  const ix = await loadFigureIndex({ fetch: fetchImpl, base });
  assert.deepEqual(ix.tags.map((t) => `${t.id}:${t.src}`), ['k-1:kice', 'h-1:hak']);
  assert.equal(ix.byId.get('h-1').src, 'hak');
});

test('앱에 실은 색인(assets/ai-figure): 평가원 9,924 + 학평 10,879, id 겹침 없음, 종류는 목록 안', () => {
  const read = (f) => readFileSync(new URL(`../assets/ai-figure/${f}`, import.meta.url), 'utf8');
  const tax = JSON.parse(read('taxonomy.json'));
  const kice = parseTagLines(read('tags.jsonl'), 'kice'), hak = parseTagLines(read('tags-hak.jsonl'), 'hak');
  assert.equal(kice.length, 9924); assert.equal(hak.length, 10879);
  const all = kice.concat(hak);
  assert.equal(new Set(all.map((t) => t.id)).size, all.length);
  const types = new Set(tax.types);
  assert.ok(all.every((t) => types.has(t.type)), '색인 종류가 taxonomy 밖');
  assert.ok(all.every((t) => { try { parseFigureId(t.id); return true; } catch { return false; } }));
});

// ── 지시문 ──
test('buildFigurePrompt: v2t 사슬을 펼친 결과가 고정값과 같다', () => {
  const p = buildFigurePrompt({ request: '빗면 위 상자', refs: ['a', 'b', 'c'], retrieval: { classify: { types: ['역학 모식도(물체·빗면·도르래·용수철)', '그래프(선·곡선)'], subject: '물리학Ⅰ' } } });
  // image_generator pipeline/prompts/v2t.cjs build()와 글자 하나까지 같은 값(옮길 때 4가지 경우로 대조함).
  assert.equal(createHash('sha256').update(p).digest('hex').slice(0, 16), '0869623efdc7dae0');
  assert.ok(p.endsWith('[내용]\n빗면 위 상자'));
  assert.match(p, /물리 그림 화풍/u);
  assert.match(p, /참고 그림 3장은/u);
  const noRefs = buildFigurePrompt({ request: 'x', subject: '화학Ⅰ' });
  assert.doesNotMatch(noRefs, /참고 그림 \d장은/u);
  assert.match(noRefs, /화학 그림 화풍/u);
});

test('normalizeExpanded: 장면이 없거나 JSON이 아니면 원래 요청 한 장면', () => {
  assert.deepEqual(normalizeExpanded(null, '요청').scenes, ['요청']);
  assert.deepEqual(normalizeExpanded({ scenes: [' ', ''] }, '요청').scenes, ['요청']);
  assert.deepEqual(normalizeExpanded({ scenes: ['가', '나'], graph: 'yes' }, '요청'), { type: '', graph: false, scenes: ['가', '나'], keyValues: '', notes: '' });
});

// ── fetchFigure ──
test('fetchFigure: id → 문항 JSON n번째 그림, 학평은 학평 Worker, 모르면 평가원→학평', async () => {
  assert.deepEqual(parseFigureId('b1_2026_11_01-12'), { item: 'b1_2026_11_01', n: 12 });
  assert.deepEqual(parseFigureId('c1_2027_05_12-선지2'), { item: 'c1_2027_05_12', n: null });
  assert.throws(() => parseFigureId('형식아님'), /그림 id 형식이 아닙니다/u);
  assert.equal(figureFromQuestion(question(png('a')), 2), null);
  // 이름(<id>.png)으로 먼저 찾는다 — 선지 그림, 블록 순서와 다른 번호
  const named = { question: { blocks: [{ kind: 'figure', figure: { name: 'q_1-2.png', data: png('two') } }, { kind: 'figure', figure: { name: 'q_1-1.png', data: png('one') } }], choices: [{ figure: { name: 'q_1-선지3.png', data: png('c3') } }] } };
  assert.equal(nameOf(figureFromQuestion(named, 1, 'q_1-1')), 'one');
  assert.equal(nameOf(figureFromQuestion(named, null, 'q_1-선지3')), 'c3');
  assert.equal(figureFromQuestion(named, null, 'q_1-선지9'), null);

  const f1 = fakeFetch();
  assert.equal(nameOf(await fetchFigure('p1_2025_06_03-2', { fetch: f1, src: 'kice' })), 'ref:p1_2025_06_03#2');
  assert.equal(f1.calls[0], EXAM_QUESTION_HOSTS.kice + 'p1_2025_06_03.json');

  const f2 = fakeFetch();
  await fetchFigure('p1_2025_03_07-1', { fetch: f2, src: 'hak' });
  assert.ok(f2.calls[0].startsWith(EXAM_QUESTION_HOSTS.hak));

  const f3 = fakeFetch({ hakOnly: new Set(['h_2020_03_01']) });
  assert.equal(nameOf(await fetchFigure('h_2020_03_01-1', { fetch: f3 })), 'ref:h_2020_03_01#1');
  assert.deepEqual(f3.calls.map((u) => u.startsWith(EXAM_QUESTION_HOSTS.hak)), [false, true]);

  // 두 번째 data 그림이 없는 3번 → 오류 문구, 받지 못하면 상태 번호
  await assert.rejects(fetchFigure('p1_2025_06_03-3', { fetch: fakeFetch(), src: 'kice', cache: false }), /그림이 없습니다: p1_2025_06_03-3/u);
  await assert.rejects(fetchFigure('gone_1-1', { fetch: fakeFetch({ missing: new Set(['gone_1']) }), src: 'kice' }), /그림 문항을 받지 못했습니다\(404\): gone_1/u);
  await assert.rejects(fetchFigure('잘못', { fetch: fakeFetch() }), /형식/u);

  // 같은 id는 캐시
  const f4 = fakeFetch();
  await fetchFigure('p2_2023_11_10-1', { fetch: f4, src: 'kice' }); await fetchFigure('p2_2023_11_10-1', { fetch: f4, src: 'kice' });
  assert.equal(f4.calls.length, 1);
});

test('collectReferenceImages: 받지 못한 그림은 건너뛰고 다음 후보로 3장 채움', async () => {
  const r = await collectReferenceImages(['gone_1-1', 'a_1-1', 'a_1-1', 'b_1-1', 'c_1-1', 'd_1-1'], { fetch: fakeFetch({ missing: new Set(['gone_1']) }), srcOf: () => 'kice' });
  assert.deepEqual(r.ids, ['a_1-1', 'b_1-1', 'c_1-1']);
  assert.equal(r.images.length, 3);
  assert.deepEqual(r.failed.map((f) => f.id), ['gone_1-1']);
});

// ── makeFigureSet 흐름 ──
test('makeFigureSet: 구체화 → 장면마다 그리기, 둘째 장면에 첫 장면 그림 첨부, 설명 지우기·흑백', async () => {
  const { ai, calls } = fakeAi({ scenes: ['(가) 피스톤 낮음', '(나) 피스톤 높음'], stripOn: new Set(['gen1']) });
  const phases = [];
  const out = await engineOf(ai, { models: { text: 'T', image: 'I' } }).makeFigureSet({ request: '실린더 두 장면', subject: '물리학Ⅰ', onPhase: (e) => phases.push(e.phase) });

  assert.equal(out.ok, true); assert.equal(out.aborted, false); assert.deepEqual(out.errors, []);
  assert.equal(out.expanded.notes, '마찰 무시');
  assert.equal(out.scenes.length, 2);
  // 1장면: gen1 → 설명 지움 → 흑백
  assert.equal(nameOf(out.scenes[0].image), 'gray:stripped:gen1');
  assert.deepEqual(out.scenes[0].strippedTexts, ['마찰은 무시한다.']);
  assert.equal(nameOf(out.scenes[0].beforeStrip), 'gen1');
  assert.deepEqual(out.scenes[0].refs, ['p1_2024_09_05-2', 'p1_2025_06_03-1', 'p1_2025_03_07-1']);
  assert.equal(out.scenes[1].beforeStrip, null);

  const draws = calls.image.filter((c) => !c.text.startsWith('첨부 그림에서'));
  assert.equal(draws.length, 2);
  // 첫 장면: 참고 그림 3장만 첨부, 「한 장면만」 문장
  assert.deepEqual(draws[0].attachments.map(nameOf), ['ref:p1_2024_09_05#2', 'ref:p1_2025_06_03#1', 'ref:p1_2025_03_07#1']);
  assert.ok(draws[0].text.includes(SINGLE_SCENE_NOTE)); assert.ok(!draws[0].text.includes(PREV_SCENE_NOTE));
  // 둘째 장면: 첫 장면 최종 그림을 맨 앞에 첨부 + 앞 장면 맞추기 문장
  assert.equal(draws[1].attachments[0], out.scenes[0].image);
  assert.equal(draws[1].attachments.length, 4);
  assert.ok(draws[1].text.endsWith(PREV_SCENE_NOTE));
  assert.match(draws[1].text, /\[내용\]\n\(나\) 피스톤 높음/u);
  // 설명 지우기는 찾은 문장으로 다시 그리기, 모델은 주입한 것
  const redraw = calls.image.find((c) => c.text.startsWith('첨부 그림에서'));
  assert.match(redraw.text, /- 마찰은 무시한다\./u);
  assert.deepEqual(redraw.attachments.map(nameOf), ['gen1']);
  assert.ok(calls.image.every((c) => c.model === 'I')); assert.ok(calls.text.every((c) => c.model === 'T'));
  assert.equal(grayCalls.length, 2);
  assert.deepEqual([...new Set(phases)], ['index', 'expand', 'scene', 'log', 'grayscale', 'done']);
});

test('makeFigureSet: raw면 구체화 없이, bestOf 2면 AI가 나은 쪽을 고름, refIds 먼저', async () => {
  const { ai, calls } = fakeAi();
  const out = await engineOf(ai).makeFigureSet({ request: '빗면', raw: true, bestOf: 2, refIds: ['b1_2026_11_01-1'], keyValues: 'θ=30°', fixNote: '화살표 더 길게' });
  assert.equal(out.expanded, null);
  assert.ok(!calls.text.some((c) => c.text.includes('그림 담당')));
  assert.equal(nameOf(out.scenes[0].image), 'gray:gen2');
  assert.equal(out.scenes[0].refs[0], 'b1_2026_11_01-1');
  assert.match(out.scenes[0].prompt, /정확해야 할 값: θ=30°\n\[앞서 그린 그림에서 고칠 점 — 반드시 반영\]\n화살표 더 길게$/u);
  assert.ok(!out.scenes[0].prompt.includes(SINGLE_SCENE_NOTE));
  const pick = calls.text.find((c) => c.text.includes('두 그림은 같은 요청'));
  assert.deepEqual(pick.attachments.map(nameOf).slice(0, 2), ['gen1', 'gen2']);
});

test('설명 지우기 실패는 지우기 전 그림으로, 구체화·검색 JSON이 깨져도 이어 감', async () => {
  const { ai } = fakeAi({ textOverride: { strip: new Error('읽기 실패'), expand: '모르겠어요', classify: '???', pick: '없음' } });
  const out = await engineOf(ai, { retries: { text: 1 } }).makeFigureSet({ request: '도르래' });
  assert.equal(out.ok, true);
  assert.deepEqual(out.expanded.scenes, ['도르래']);
  assert.equal(nameOf(out.scenes[0].image), 'gray:gen1');
  assert.deepEqual(out.scenes[0].strippedTexts, []);
  assert.equal(out.scenes[0].refs.length, 3); // 점수 순으로 채움
});

test('색인을 못 받아도 참고 그림 없이 그림, 오류는 결과에만', async () => {
  const { ai, calls } = fakeAi();
  const engine = createEngine({ ai, fetch: async () => ({ ok: false, status: 500 }), indexBase: 'https://example.test/none-' + Math.random() + '/', grayscale: fakeGray });
  const out = await engine.makeFigureSet({ request: '빗면', raw: true });
  assert.equal(out.ok, true);
  assert.deepEqual(out.scenes[0].refs, []);
  assert.equal(out.errors[0].step, 'index');
  assert.equal(calls.image[0].attachments.length, 0);
});

test('흑백 후처리가 실패해도(기본 grayscaleGeneratedPng, 캔버스 없음) 원래 그림을 쓴다', async () => {
  const { ai } = fakeAi();
  const out = await createEngine({ ai, fetch: fakeFetch(), index: makeIndex({ taxonomy: TAX, tags: TAGS }) }).makeFigureSet({ request: '빗면', raw: true });
  assert.equal(out.ok, true);
  assert.equal(nameOf(out.scenes[0].image), 'gen1');
  assert.equal(out.scenes[0].grayscale.applied, false);
});

// ── 실패·취소 ──
test('그리기가 끝내 실패하면 자동 재시도 뒤 앞 결과를 지키고 던지지 않는다', async () => {
  const { ai, calls } = fakeAi({ failImage: 1 });
  const previous = { expanded: { scenes: ['옛'] }, scenes: [{ request: '옛', image: png('old1'), refs: ['x-1'] }] };
  const out = await engineOf(ai).makeFigureSet({ request: '빗면', raw: true, previous });
  assert.equal(out.ok, false); assert.equal(out.aborted, false);
  assert.equal(nameOf(out.scenes[0].image), 'old1');
  assert.equal(out.scenes[0].kept, true);
  assert.match(out.scenes[0].error, /그림 서버 오류/u);
  assert.equal(out.errors[0].step, 'draw');
  assert.equal(calls.image.length, 4); // 그림 호출 2번 × 장면 2번
  // 앞 결과가 없으면 그림 없이 오류만(던지지 않음)
  const none = await engineOf(fakeAi({ failImage: 1 }).ai).makeFigureSet({ request: '빗면', raw: true });
  assert.equal(none.scenes[0].image, null); assert.equal(none.scenes[0].request, '빗면');
});

test('한 번 실패해도 재시도로 성공하면 새 그림', async () => {
  const { ai, calls } = fakeAi({ failImage: 1, imageFails: 1 });
  const out = await engineOf(ai).makeFigureSet({ request: '빗면', raw: true, previous: { scenes: [{ image: png('old1') }] } });
  assert.equal(out.ok, true); assert.equal(nameOf(out.scenes[0].image), 'gray:gen1');
  assert.equal(calls.image.length, 2);
});

test('취소(signal)되면 멈추고 앞 결과를 그대로 돌려준다', async () => {
  const controller = new AbortController();
  const { ai, calls } = fakeAi({
    scenes: ['가', '나'],
    onImage: async (k) => { if (k === 2) { controller.abort(); throw Object.assign(new Error('취소'), { name: 'AbortError' }); } },
  });
  const previous = { expanded: { scenes: ['옛 가', '옛 나', '옛 다'] }, scenes: [{ image: png('old1') }, { image: png('old2') }, { image: png('old3') }] };
  const out = await engineOf(ai).makeFigureSet({ request: '두 장면', previous, signal: controller.signal });
  assert.equal(out.aborted, true); assert.equal(out.ok, false);
  assert.deepEqual(out.scenes.map((s) => nameOf(s.image)), ['gray:gen1', 'old2', 'old3']);
  assert.equal(out.scenes[1].kept, true);
  assert.equal(calls.image.length, 2); // 취소 뒤 더 부르지 않음

  const early = new AbortController(); early.abort();
  const out2 = await engineOf(fakeAi().ai).makeFigureSet({ request: 'x', previous, signal: early.signal });
  assert.equal(out2.aborted, true);
  assert.deepEqual(out2.scenes.map((s) => nameOf(s.image)), ['old1', 'old2', 'old3']);
  assert.deepEqual(out2.expanded, previous.expanded);
});

test('입력 검사: ai 없음·빈 요청은 TypeError, 한 번 쓰기 makeFigureSet', async () => {
  assert.throws(() => createEngine({}), TypeError);
  await assert.rejects(engineOf(fakeAi().ai).makeFigureSet({ request: '  ' }), TypeError);
  const out = await makeFigureSet({ request: '빗면', raw: true }, { ai: fakeAi().ai, fetch: fakeFetch(), index: makeIndex({ taxonomy: TAX, tags: TAGS }), grayscale: fakeGray });
  assert.equal(out.ok, true);
});

test('aiFigureEngineEnabled: 1.8.0부터 기본 켜짐(이미지 생성 대체), 플래그로만 끔', () => {
  const store = (map) => ({ localStorage: { getItem: (k) => map[k] ?? null } });
  assert.equal(aiFigureEngineEnabled({}), true);
  assert.equal(aiFigureEngineEnabled(store({ '5e.aiEngine.figure': '0' })), false);
  assert.equal(aiFigureEngineEnabled(store({ '5e.aiFigureEngine': '0' })), false, '옛 이름도 읽음');
  assert.equal(aiFigureEngineEnabled(store({ '5e.aiFigureEngine': '0', '5e.aiEngine.figure': '1' })), true, '새 이름이 이김');
  assert.equal(aiFigureEngineEnabled({ FIVE_E_AI_FIGURE_ENGINE: false }), false);
  assert.equal(aiFigureEngineEnabled({ FIVE_E_AI_FIGURE_ENGINE: true }), true);
  assert.equal(aiFigureEngineEnabled({ localStorage: { getItem: () => { throw new Error('막힘'); } } }), true, '저장소를 못 읽으면 기본값');
});

test('참고 그림 보안(X1): 비트맵 base64만, 8MB 넘는 값·SVG·HTML data URL은 AI에 붙이지 않음', () => {
  assert.equal(isUsableReferenceImage(png('a')), true);
  assert.equal(isUsableReferenceImage('data:image/jpeg;base64,/9j/AA=='), true);
  assert.equal(isUsableReferenceImage('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(isUsableReferenceImage('data:image/svg+xml,<svg onload=alert(1)>'), false);
  assert.equal(isUsableReferenceImage('data:text/html;base64,PGI+'), false);
  assert.equal(isUsableReferenceImage('data:image/png;base64,' + 'A'.repeat(MAX_REFERENCE_DATA_URL_CHARS)), false);
  assert.equal(isUsableReferenceImage(null), false);
  const json = question('data:image/svg+xml;base64,PHN2Zz4=', png('ok'));
  assert.equal(nameOf(figureFromQuestion(json, 1)), 'ok', 'SVG 그림은 건너뛰어 첫째 비트맵이 1번');
  assert.equal(figureFromQuestion(json, 2), null);
  const named = { question: { blocks: [{ kind: 'figure', figure: { name: 'x-1.png', data: 'data:image/svg+xml;base64,PHN2Zz4=' } }] } };
  assert.equal(figureFromQuestion(named, null, 'x-1'), null, '이름이 맞아도 SVG면 쓰지 않음');
});

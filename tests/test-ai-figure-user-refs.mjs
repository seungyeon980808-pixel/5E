// 고침 U1·E2(exp/1122-figure-fixes) — 가짜 ai·fetch만 쓴다(실제 AI·네트워크 없음).
// U1: 레퍼런스·손그림·「표현 참고」가 있는 그림 생성도 새 엔진으로 — 교사 그림은 첫 첨부 + 역할 문장, 기출은 화풍 참고 2장, 대화 요약 유지.
// E2: 빈 장면이 나오면 그 장면만 같은 장면 글·같은 참고 기출로 다시(구체화·검색·성한 장면 다시 그리기 없음).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEngine, makeIndex, buildFigurePrompt } from '../js/ai-figure/index.js';
import { clearFigureCache } from '../js/ai-figure/reference-images.js';
import { userImagesNote, USER_ROLE_LINES } from '../js/ai-figure/make-figure.js';
import { PREV_SCENE_NOTE } from '../js/ai-figure/prompt.js';
import { figureRoute, userReferenceRole, runFigureEngine, runFigureRedraw, USER_REF_KICE_COUNT } from '../js/ai-engines.js';
import { AI_ENGINE_FLAG_KEYS, figureUserRefsFlag, figureBlankSceneOnlyFlag, aiEngineFlags } from '../js/ai-engine-flags.js';
import { EXAM_QUESTION_HOSTS } from '../js/library/image-hosts.js';

const png = (name) => 'data:image/png;base64,' + Buffer.from(name).toString('base64');
const nameOf = (url) => Buffer.from(String(url).split(',')[1] || '', 'base64').toString();
const store = (values = {}) => ({ getItem: (k) => (k in values ? values[k] : null) });
const desktopApp = { readImageText: async () => '', send: async () => ({}) };

const TAX = { types: ['역학 모식도(물체·빗면·도르래·용수철)', '생물 선화(동물·식물)', '기타'], styles: ['단순 도식(선·도형)'] };
const TAGS = [
  { id: 'p1_2025_06_03-1', subject: '물리학Ⅰ', year: 2025, type: TAX.types[0], style: '단순 도식(선·도형)', tags: ['빗면', '도르래'], desc: '빗면', src: 'kice' },
  { id: 'p1_2024_09_05-2', subject: '물리학Ⅰ', year: 2024, type: TAX.types[0], style: '단순 도식(선·도형)', tags: ['용수철'], desc: '용수철', src: 'kice' },
  { id: 'p1_2023_06_04-1', subject: '물리학Ⅰ', year: 2023, type: TAX.types[0], style: '단순 도식(선·도형)', tags: ['빗면'], desc: '빗면2', src: 'kice' },
];
function fakeFetch() {
  const fn = async (url) => {
    const m = /\/q\/(.+)\.json$/u.exec(String(url));
    const item = m && decodeURIComponent(m[1]);
    if (!item || !String(url).startsWith(EXAM_QUESTION_HOSTS.kice)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ question: { blocks: [{ kind: 'figure', figure: { data: png(`ref:${item}#1`) } }, { kind: 'figure', figure: { data: png(`ref:${item}#2`) } }] } }) };
  };
  return fn;
}
function fakeAi({ scenes = ['장면 하나'], blankAt = new Set() } = {}) {
  const calls = { text: [], image: [] };
  let n = 0;
  const ai = {
    async readText({ text, attachments }) {
      calls.text.push({ text, attachments });
      if (text.includes('그림 담당')) return JSON.stringify({ type: TAX.types[0], graph: false, scenes, keyValues: '', notes: '' });
      if (text.includes('검색 조건')) return '{"subject":"물리학Ⅰ","types":["역학 모식도(물체·빗면·도르래·용수철)"],"keywords":["빗면"]}';
      if (text.includes('「참고 그림」으로 쓸')) return '["p1_2025_06_03-1","p1_2024_09_05-2","p1_2023_06_04-1"]';
      if (text.includes('시험 문항 그림이다')) return '{"has":false,"texts":[]}';
      throw new Error('알 수 없는 지시문');
    },
    async generateImage({ text, attachments }) {
      calls.image.push({ text, attachments });
      n++;
      return { imageDataUrl: png(blankAt.has(n) ? `blank${n}` : `gen${n}`) };
    },
  };
  return { ai, calls };
}
const fakeGray = async (data) => ({ data: png(`gray:${nameOf(data)}`), applied: true, reason: null });
const engineOf = (ai) => createEngine({ ai, fetch: fakeFetch(), index: makeIndex({ taxonomy: TAX, tags: TAGS }), grayscale: fakeGray });
test.beforeEach(() => clearFigureCache());

// ── 길 고르기 ──
test('U1 figureRoute: 기본은 손그림만 새 엔진(레퍼런스·표현 참고·섞임·역할 모름은 옛 길), \'1\'이면 모두 새 엔진, \'0\'이면 옛 길', () => {
  // 11-23 앱 반영 후보(생성 2차 눈가림: 레퍼런스는 옛 길 12장 모두 5점 vs 새 길 3.79)
  assert.deepEqual(figureRoute({ desktop: desktopApp, storage: store(), hasUserReferences: true, userRoles: ['sketch', 'sketch'] }), { use: true, reason: null, userRefs: true, sketchOnly: true });
  for (const roles of [['reference'], ['style'], ['sketch', 'reference'], null, []]) assert.equal(figureRoute({ desktop: desktopApp, storage: store(), hasUserReferences: true, userRoles: roles }).reason, 'user-references', String(roles));
  assert.deepEqual(figureRoute({ desktop: desktopApp, storage: store({ [AI_ENGINE_FLAG_KEYS.figureUserRefs]: '1' }), hasUserReferences: true, userRoles: ['reference'] }), { use: true, reason: null, userRefs: true });
  assert.equal(figureRoute({ desktop: desktopApp, storage: store({ [AI_ENGINE_FLAG_KEYS.figureUserRefs]: '0' }), hasUserReferences: true }).reason, 'user-references');
  assert.equal(figureRoute({ desktop: desktopApp, storage: store(), hasUserReferences: false }).userRefs, undefined);
  assert.equal(figureRoute({ desktop: { ...desktopApp, web: true }, storage: store(), hasUserReferences: true }).reason, 'web');
  assert.equal(figureUserRefsFlag(store()), true);
  assert.equal(figureBlankSceneOnlyFlag(store()), true);
  assert.equal(figureBlankSceneOnlyFlag(store({ [AI_ENGINE_FLAG_KEYS.figureBlankSceneOnly]: '0' })), false);
  assert.equal(aiEngineFlags(store()).figureUserRefs, true);
});

test('U1 역할: 표현 참고=style, 손그림 말·이름=sketch, 나머지=reference', () => {
  assert.equal(userReferenceRole({ referenceRole: 'STYLE_REFERENCE', name: '손그림.png' }, ''), 'style');
  assert.equal(userReferenceRole({ name: '첨부 1' }, '손그림처럼 세포를 그려 줘'), 'sketch');
  assert.equal(userReferenceRole({ name: 'my-sketch.png' }, '그려 줘'), 'sketch');
  assert.equal(userReferenceRole({ name: '첨부 1' }, '대충 그린 밑그림대로'), 'sketch');
  assert.equal(userReferenceRole({ name: 'ref.png' }, '첨부한 그림 구성 그대로 판 A, 판 B를'), 'reference');
});

// ── 지시문 ──
test('U1 지시문: 교사 그림이 없으면 기본 지시문 글자 그대로', () => {
  const ret = { classify: { types: [TAX.types[0]], subject: '물리학Ⅰ' } };
  const base = buildFigurePrompt({ request: 'x', refs: ['a', 'b'], retrieval: ret });
  assert.equal(buildFigurePrompt({ request: 'x', refs: ['a', 'b'], retrieval: ret, users: 0, fix: { userRoles: true } }), base);
  assert.equal(buildFigurePrompt({ request: 'x', refs: ['a', 'b'], retrieval: ret, users: 1 }), base); // fix.userRoles 없으면 그대로
});

test('U1 지시문: 교사 그림이 첫 첨부 — 「참고 그림은 모두 평가원 그림·첫 장은 구도」 모순 문장 없음, 첨부 순서 줄', () => {
  const ret = { classify: { types: [TAX.types[0]], subject: '물리학Ⅰ' } };
  const t = buildFigurePrompt({ request: 'x', refs: ['a', 'b'], retrieval: ret, users: 1, fix: { userRoles: true } });
  assert.doesNotMatch(t, /참고 그림 2장은 모두 실제 평가원 그림이다\. 첫 장은 구도/u);
  assert.doesNotMatch(t, /- 첨부한 참고 그림은 실제 평가원/u);
  assert.match(t, /- 교사 그림 뒤에 붙인 참고 그림은 실제 평가원 시험지 그림이다\./u);
  assert.match(t, /\[첨부 순서\] 1번째 첨부 = 교사가 붙인 그림.* \/ 그 뒤 2장 = 실제 평가원 기출 그림\(선 굵기·회색·글자 화풍만 참고하고, 내용·구도는 따르지 않는다\)\./u);
  assert.match(t, /글자 규칙\(평가원 시험지와 같게\)/u); // 글자 규칙(정자·기울임)은 그대로
  const none = buildFigurePrompt({ request: 'x', refs: [], retrieval: ret, users: 2, fix: { userRoles: true } });
  assert.doesNotMatch(none, /첨부한 참고 그림/u);
  assert.match(none, /1~2번째 첨부 = 교사가 붙인 그림/u);
  const prev = buildFigurePrompt({ request: 'x', refs: ['a'], retrieval: ret, users: 1, fix: { userRoles: true }, prevScene: true });
  assert.match(prev, /2번째 첨부 = 같은 문항의 앞 장면/u);
});

test('U1 역할 문장: 레퍼런스·손그림·표현 참고, 섞이면 그림마다', () => {
  assert.match(userImagesNote(['reference']), /^\n\n\[교사 그림\] 첫 첨부는 교사가 붙인 레퍼런스\(내용·화풍 참고 그림\)다\. 교사 요청에 따라 이 그림의 물체·배치를 따르고/u);
  assert.match(userImagesNote(['sketch']), /구도·물체의 위치·개수·연결 관계·라벨 위치를 정확히 그대로 지킨다/u);
  assert.match(userImagesNote(['sketch', 'sketch']), /첨부의 처음 2장은 모두 교사가 손으로/u);
  const mixed = userImagesNote(['sketch', 'style']);
  assert.match(mixed, /- 1번째 첨부: 교사가 손으로 그린 밑그림/u);
  assert.match(mixed, /- 2번째 첨부: 교사가 고른 화풍 참고 그림/u);
  assert.equal(Object.keys(USER_ROLE_LINES).sort().join(), 'panelLayout,reference,sketch,sketchLayout,style'); // 생성 2·3차가 배치 안내 역할 둘을 더함
});

// ── 엔진 흐름 ──
test('U1 runFigureEngine: 교사 그림이 첫 첨부, 기출은 1장, 역할 문장·대화 요약, 구체화 없음', async () => {
  // 11-23 앱 반영 후보: 손그림만이면 짧은 명세 길(test-ai-figure-candidate-1123.mjs), 여기서는 레퍼런스가 고침 U1 길('1'일 때)을 타는지 본다.
  const { ai, calls } = fakeAi();
  const sketch = png('teacher-sketch');
  const out = await runFigureEngine({ ai, engine: engineOf(ai), request: '손그림처럼 빗면 위 물체 A를 그려 줘', conversation: '교사: 빗면 30°\nAI: 정리했어요', userImages: [sketch], userImageRoles: ['reference'] });
  assert.equal(out.ok, true);
  assert.equal(calls.image.length, 1);
  const att = calls.image[0].attachments.map(nameOf);
  assert.equal(att[0], 'teacher-sketch');
  assert.equal(att.length, 1 + USER_REF_KICE_COUNT);
  assert.ok(att.slice(1).every((a) => a.startsWith('ref:')));
  assert.match(calls.image[0].text, /\[교사 그림\] 첫 첨부는 교사가 붙인 레퍼런스/u);
  assert.match(calls.image[0].text, /\[첨부 순서\] 1번째 첨부 = 교사가 붙인 그림/u);
  // 11-22 실제 비교 뒤: 교사 그림이 있으면 구체화를 건너뛰고(그림을 못 보는 구체화가 구도를 바꿨다) 대화 정리는 그리기 요청 글에 붙인다.
  assert.equal(calls.text.filter((c) => c.text.includes('그림 담당')).length, 0, '구체화 없음');
  assert.match(calls.image[0].text, /\[내용\]\n손그림처럼 빗면 위 물체 A를 그려 줘\n\n\[교사와 AI가 그림을 정리한 대화[^\]]*\]\n교사: 빗면 30°/u); // 대화 요약이 빠지지 않는다
  assert.deepEqual(out.fresh[0].meta.userRefs, { count: 1, roles: ['reference'] });
});

test('U1 runFigureEngine: 교사 그림이 없으면 지금과 같다(기출 3장·역할 문장 없음)', async () => {
  const { ai, calls } = fakeAi();
  await runFigureEngine({ ai, engine: engineOf(ai), request: '빗면 위 물체' });
  assert.equal(calls.image[0].attachments.length, 3);
  assert.doesNotMatch(calls.image[0].text, /교사 그림/u);
  assert.doesNotMatch(calls.text.find((c) => c.text.includes('그림 담당')).text, /교사가 그림/u);
});

test('U1 여러 장면(엔진 옵션 raw 없이): 교사 그림 → 앞 장면 → 기출 순서, 앞 장면 문장은 2번째 첨부, 구체화에 교사 그림 안내', async () => {
  const { ai, calls } = fakeAi({ scenes: ['장면 1', '장면 2'] });
  await engineOf(ai).makeFigureSet({ request: '레퍼런스대로 두 장면', userImages: [png('teacher-ref')], userImageRole: ['reference'], fix: { userRoles: true }, refCount: 2 });
  assert.match(calls.text.find((c) => c.text.includes('그림 담당')).text, /교사가 그림 1장\(레퍼런스\)을 붙였고/u);
  assert.equal(calls.image.length, 2);
  const second = calls.image[1];
  assert.equal(nameOf(second.attachments[0]), 'teacher-ref');
  assert.equal(nameOf(second.attachments[1]), 'gray:gen1');
  assert.match(second.text, /\[앞 장면과 맞추기\] 2번째 첨부 그림\(교사 그림 바로 뒤\)은 같은 문항의 앞 장면이다/u);
  assert.ok(!second.text.includes(PREV_SCENE_NOTE));
});

// ── E2 빈 장면만 ──
test('E2 redrawScenes: 빈 장면만 같은 장면 글·같은 기출로 — 구체화·검색 없음, 앞 장면 그림 첨부, 다른 장면 그대로', async () => {
  const { ai, calls } = fakeAi({ scenes: ['장면 1', '장면 2', '장면 3'], blankAt: new Set([2]) });
  const eng = engineOf(ai);
  const first = await eng.makeFigureSet({ request: '세 장면', strip: false });
  assert.equal(first.scenes.length, 3);
  assert.equal(nameOf(first.scenes[1].image), 'gray:blank2');
  assert.ok(first.scenes[1].classify?.types?.length, '장면에 분류 결과가 남는다');
  const textBefore = calls.text.length, imageBefore = calls.image.length;
  const redo = await eng.redrawScenes({ previous: first, scenes: [1], strip: false });
  assert.equal(calls.text.length, textBefore, '글 AI(구체화·분류·고르기) 호출 없음');
  assert.equal(calls.image.length, imageBefore + 1, '그림은 빈 장면 하나만');
  const call = calls.image.at(-1);
  assert.match(call.text, /\[내용\]\n장면 2/u);
  assert.equal(nameOf(call.attachments[0]), 'gray:gen1', '앞 장면(0번) 그림을 붙인다');
  assert.deepEqual(call.attachments.map(nameOf), calls.image[1].attachments.map(nameOf), '처음 실행의 2번 장면과 같은 첨부(앞 장면 + 같은 기출)');
  assert.deepEqual(redo.redrawn, [1]);
  assert.equal(redo.scenes[0].image, first.scenes[0].image);
  assert.equal(redo.scenes[2].image, first.scenes[2].image);
  assert.equal(nameOf(redo.scenes[1].image), 'gray:gen4');
  assert.equal(redo.ok, true);
  assert.equal(call.text, first.scenes[1].prompt.replace(/$/, '') + PREV_SCENE_NOTE, '처음 실행과 같은 지시문');
});

test('E2 redrawScenes: 0번 장면이 비면 앞 장면 없이, 취소면 앞 결과 그대로', async () => {
  const { ai, calls } = fakeAi({ scenes: ['장면 1', '장면 2'], blankAt: new Set([1]) });
  const eng = engineOf(ai);
  const first = await eng.makeFigureSet({ request: '두 장면', strip: false });
  await eng.redrawScenes({ previous: first, scenes: [0], strip: false });
  assert.ok(calls.image.at(-1).attachments.every((a) => nameOf(a).startsWith('ref:')));
  const ac = new AbortController(); ac.abort();
  const stopped = await eng.redrawScenes({ previous: first, scenes: [0], signal: ac.signal });
  assert.equal(stopped.aborted, true);
  assert.equal(stopped.scenes[0].image, first.scenes[0].image);
});

test('E2 runFigureRedraw: 다시 그린 장면만 fresh(제자리 sceneIndex·blankRedrawn), 옛 엔진이면 available:false', async () => {
  const { ai } = fakeAi({ scenes: ['장면 1', '장면 2'], blankAt: new Set([2]) });
  const eng = engineOf(ai);
  const first = await eng.makeFigureSet({ request: '두 장면', strip: false });
  const out = await runFigureRedraw({ ai, engine: eng, previous: first, scenes: [1], request: '두 장면' });
  assert.equal(out.available, true);
  assert.equal(out.fresh.length, 1);
  assert.equal(out.fresh[0].meta.sceneIndex, 1);
  assert.equal(out.fresh[0].meta.sceneCount, 2);
  assert.equal(out.fresh[0].meta.blankRedrawn, true);
  const old = await runFigureRedraw({ ai, engine: { makeFigureSet() {} }, previous: first, scenes: [1] });
  assert.equal(old.available, false);
});

// ── 화면 연결(소스 확인) ──
test('화면: 교사 그림은 새 엔진으로(표현 참고 경고 건너뜀), 빈 장면은 그 장면만(플래그), 대화 요약 그대로', () => {
  const panel = readFileSync(new URL('../js/ai-panel.js', import.meta.url), 'utf8');
  assert.match(panel, /if \(roleGroups\.styleReferences\.length && !userRefRoute\?\.use && /u);
  assert.match(panel, /runFigureEngineTurn\(\{ runInput, entered, discussionContext, requestEpoch, options, userRefItems: route\.userRefs \? runInput\.attachments\.slice\(\) : \[\] \}\)/u);
  assert.match(panel, /runFigureEngine\(\{ ai, request, conversation, models, refIds, signal: abort\.signal, onPhase: enginePhase, userImages, userImageRoles \}\)/u);
  assert.match(panel, /figureBlankSceneOnlyFlag\(channelStorage\)[\s\S]{0,400}runFigureRedraw\(\{ ai: ai2, previous: outcome\.result, scenes: blankIdx/u);
  assert.match(panel, /const conversation = String\(options\.figureConversation \|\| ''\);/u);
});

// 1.8.0 「새 엔진을 5E에 연결」(js/ai-engines.js·js/ai-engine-flags.js) 단위 검사. 가짜 연결만 쓴다(실제 AI·네트워크 없음).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  engineAvailability, figureRoute, graphRoute, imageModelOrder, engineModels, createDesktopEngineAi, figurePhaseCopy,
  figureSceneMeta, runFigureEngine, runGraphPicture, redrawGraphPicture, graphPhaseCopy, DESKTOP_ONLY_NOTE,
} from '../js/ai-engines.js';
import { aiEngineFlags, figureEngineFlag, graphPictureFlag, figureImageModelFlag, AI_ENGINE_FLAG_KEYS } from '../js/ai-engine-flags.js';
import { snapshotImageItem } from '../js/ai-candidate-snapshot.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const store = (map = {}) => ({ getItem: (k) => map[k] ?? null });
const desktopApp = { readImageText: async () => ({ text: '' }), send: async () => ({}) };
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('플래그: 그림 엔진 기본 켜짐·그래프 그림 기본 꺼짐, 새 이름이 옛 이름보다 앞섬', () => {
  assert.deepEqual(aiEngineFlags(store()), { figure: true, graphPicture: false, figureImageModel: 'luna', figureSpeed: true, figureLocalReplace: false, figureSkipStripCheck: true, figureUserRefs: true, figureBlankSceneOnly: true });
  assert.equal(figureEngineFlag(store({ [AI_ENGINE_FLAG_KEYS.figure]: '0' })), false);
  assert.equal(figureEngineFlag(store({ '5e.aiFigureEngine': '0' })), false);
  assert.equal(graphPictureFlag(store({ [AI_ENGINE_FLAG_KEYS.graphPicture]: '1' })), true);
  assert.equal(graphPictureFlag(store({ '5e.aiGraph.pictureEngine': '1' })), true);
  assert.equal(graphPictureFlag(store({ '5e.aiGraph.pictureEngine': '1', [AI_ENGINE_FLAG_KEYS.graphPicture]: '0' })), false);
  assert.equal(figureEngineFlag({ getItem() { throw new Error('막힘'); } }), true);
});

test('연결 가능 여부: 설치판만, 웹은 연결만 있고 설치판 안내', () => {
  assert.equal(engineAvailability(desktopApp).available, true);
  const web = engineAvailability({ ...desktopApp, web: true });
  assert.equal(web.available, false); assert.equal(web.reason, DESKTOP_ONLY_NOTE);
  assert.equal(engineAvailability(null).available, false);
  assert.equal(engineAvailability({ send() {} }).available, false, '읽기 길이 없는 오래된 연결');
});

test('그림 길 고르기: 기본 새 엔진, 끄면·웹·직접 넣은 레퍼런스·옛 길 요청이면 옛 길', () => {
  assert.equal(figureRoute({ desktop: desktopApp, storage: store() }).use, true);
  assert.equal(figureRoute({ desktop: desktopApp, storage: store({ [AI_ENGINE_FLAG_KEYS.figure]: '0' }) }).reason, 'flag-off');
  assert.equal(figureRoute({ desktop: { ...desktopApp, web: true }, storage: store() }).reason, 'web');
  // 고침 U1(exp/1122-figure-fixes): 교사 그림도 새 엔진으로(플래그 기본 켬), '0'이면 옛 길.
  assert.equal(figureRoute({ desktop: desktopApp, storage: store(), hasUserReferences: true }).userRefs, true);
  assert.equal(figureRoute({ desktop: desktopApp, storage: store({ [AI_ENGINE_FLAG_KEYS.figureUserRefs]: '0' }), hasUserReferences: true }).reason, 'user-references');
  assert.equal(figureRoute({ desktop: desktopApp, storage: store(), legacy: true }).reason, 'legacy');
});

test('그래프 길 고르기: 기본 객체, 플래그 켜면 그림, 웹은 객체로 이어 가며 안내', () => {
  assert.equal(graphRoute({ desktop: desktopApp, storage: store() }).use, false);
  const on = store({ [AI_ENGINE_FLAG_KEYS.graphPicture]: '1' });
  assert.equal(graphRoute({ desktop: desktopApp, storage: on }).use, true);
  assert.equal(graphRoute({ desktop: desktopApp, storage: on, picture: false }).use, false, '옵션에서 기본을 고르면 객체');
  assert.equal(graphRoute({ desktop: desktopApp, storage: store(), picture: true }).use, false, '플래그가 꺼져 있으면 옵션이 있어도 객체');
  const web = graphRoute({ desktop: { ...desktopApp, web: true }, storage: on });
  assert.equal(web.use, false); assert.match(web.note, /설치판/);
});

test('모델: 작업대에서 고른 그림 모델 먼저, 실패하면 반대 모델; 글 모델은 Sol(목록에 없으면 고른 것)', () => {
  assert.deepEqual(imageModelOrder('gpt-6.1-sol'), ['gpt-6.1-sol', 'gpt-6-luna']);
  assert.deepEqual(imageModelOrder('gpt-6-luna'), ['gpt-6-luna', 'gpt-6.1-sol']);
  assert.deepEqual(imageModelOrder('other'), ['gpt-6-luna', 'gpt-6.1-sol']);
  assert.deepEqual(engineModels({ selected: 'gpt-6-luna' }), { text: 'gpt-6.1-sol', image: 'gpt-6-luna' });
  assert.deepEqual(engineModels({ selected: 'gpt-6-luna', catalog: { data: [{ model: 'gpt-6-luna' }] } }), { text: 'gpt-6-luna', image: 'gpt-6-luna' });
  assert.deepEqual(engineModels({ selected: 'gpt-6-luna', catalog: [{ model: 'gpt-6.1-sol' }, { model: 'gpt-6-luna' }] }), { text: 'gpt-6.1-sol', image: 'gpt-6-luna' }, '정리된 목록(객체 배열)');
});

test('그림 모델: 고른 대화 모델과 상관없이 기본 Luna, 옵션 sol일 때만 Sol(11-19 사용자 결정)', () => {
  // 작업대 기본 선택(gpt-6.1-sol)이어도 그림은 Luna — 앞서는 Sol로 그렸다(FIGGAP)
  assert.deepEqual(engineModels({ selected: 'gpt-6.1-sol', imageChoice: 'luna' }), { text: 'gpt-6.1-sol', image: 'gpt-6-luna' });
  assert.deepEqual(engineModels({ selected: 'gpt-6.1-sol', imageChoice: 'sol' }), { text: 'gpt-6.1-sol', image: 'gpt-6.1-sol' });
  assert.deepEqual(engineModels({ selected: 'gpt-6-luna', imageChoice: 'sol' }).image, 'gpt-6.1-sol');
  assert.equal(engineModels({ selected: 'gpt-6.1-sol', imageChoice: '이상한 값' }).image, 'gpt-6-luna');
  // 실패 대체는 반대 모델
  assert.deepEqual(imageModelOrder(engineModels({ selected: 'gpt-6.1-sol', imageChoice: 'luna' }).image), ['gpt-6-luna', 'gpt-6.1-sol']);
  assert.deepEqual(imageModelOrder(engineModels({ selected: 'gpt-6.1-sol', imageChoice: 'sol' }).image), ['gpt-6.1-sol', 'gpt-6-luna']);
  // 플래그 읽기
  const store = (v) => ({ getItem: (k) => (k === AI_ENGINE_FLAG_KEYS.figureImageModel ? v : null) });
  assert.equal(figureImageModelFlag(store(null)), 'luna');
  assert.equal(figureImageModelFlag(store('sol')), 'sol');
  assert.equal(figureImageModelFlag(store('gpt-6.1-sol')), 'sol');
  assert.equal(figureImageModelFlag(store('luna')), 'luna');
  assert.equal(figureImageModelFlag({ getItem() { throw new Error('막힘'); } }), 'luna');
  assert.equal(figureImageModelFlag(store('sol')), aiEngineFlags(store('sol')).figureImageModel);
});

test('연결 감싸기: 글은 readImageText, 그림은 래스터 차례(한 번에 하나), 실패하면 반대 모델로 한 번 더', async () => {
  const calls = [];
  const desktop = { readImageText: async (p) => { calls.push(['text', p.model, p.attachments.length]); return { text: '{"ok":1}' }; } };
  let active = 0, maxActive = 0;
  const raster = { async generate(payload, { signal }) {
    active++; maxActive = Math.max(maxActive, active);
    calls.push(['image', payload.model, payload.attachments.map((a) => a.name)]);
    await new Promise((r) => setTimeout(r, 5)); active--;
    if (payload.model === 'gpt-6.1-sol') throw new Error('그림 없음');
    return { src: PNG };
  } };
  const ai = createDesktopEngineAi(desktop, raster, { imageModels: ['gpt-6.1-sol', 'gpt-6-luna'] });
  assert.equal(await ai.readText({ model: 'm', text: 't', attachments: [PNG] }), '{"ok":1}');
  const [a, b] = await Promise.all([
    ai.generateImage({ model: 'gpt-6.1-sol', text: 'x', attachments: [PNG, PNG] }),
    ai.generateImage({ model: 'gpt-6.1-sol', text: 'y', attachments: [] }),
  ]);
  assert.equal(a.imageDataUrl, PNG); assert.equal(b.imageDataUrl, PNG);
  assert.equal(maxActive, 1, '그림 차례는 겹치지 않음');
  assert.deepEqual(calls.filter((c) => c[0] === 'image').map((c) => c[1]), ['gpt-6.1-sol', 'gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-luna']);
  assert.deepEqual(calls[1][2], ['figure-ref-1.png', 'figure-ref-2.png']);
});

test('연결 감싸기: 취소는 다시 시도하지 않고 AbortError', async () => {
  const c = new AbortController();
  let n = 0;
  const raster = { async generate() { n++; c.abort(); const e = new Error('x'); e.name = 'AbortError'; throw e; } };
  const ai = createDesktopEngineAi({ readImageText: () => new Promise(() => {}) }, raster);
  await assert.rejects(ai.generateImage({ model: 'gpt-6-luna', text: 'x', attachments: [], signal: c.signal }), { name: 'AbortError' });
  assert.equal(n, 1);
  const c2 = new AbortController();
  const p = ai.readText({ model: 'm', text: 't', signal: c2.signal });
  c2.abort();
  await assert.rejects(p, { name: 'AbortError' }, '응답 없는 글 읽기도 취소로 끝남');
});

test('진행 글: 엔진 단계마다 지금 진행 표시에 넣을 제목', () => {
  for (const phase of ['index', 'expand', 'scene', 'draw', 'grayscale', 'done']) assert.ok(figurePhaseCopy({ phase }).title, phase);
  assert.match(figurePhaseCopy({ phase: 'scene', scene: 1, total: 2 }).title, /장면 2\/2/);
  assert.equal(figurePhaseCopy({ phase: 'log', message: '참고 기출: a' }).detail, '참고 기출: a');
  for (const phase of ['graph-plan', 'graph-verify', 'graph-draw', 'done']) assert.ok(graphPhaseCopy(phase).title, phase);
});

test('runFigureEngine: 새 장면만 결과로, 참고한 기출 3장을 meta에 남김, 던지지 않음', async () => {
  const result = { ok: false, aborted: false, errors: [{ scene: 1, step: 'draw', message: '실패' }], expanded: { type: 'A', scenes: ['가', '나'], keyValues: '' },
    scenes: [{ request: '가', image: PNG, refs: ['p1_2025_11_01-1', 'p1_2024_06_03-1', 'b1_2027_07_02-1', 'extra'], strippedTexts: ['설명'], grayscale: { applied: true } },
      { request: '나', image: 'data:image/png;base64,OLD', kept: true, error: '실패' }] };
  const out = await runFigureEngine({ request: '빗면', engine: { makeFigureSet: async (o) => { assert.equal(o.request, '빗면'); return result; } }, models: { text: 't', image: 'i' } });
  assert.equal(out.fresh.length, 1, '앞 결과를 그대로 둔 장면은 새 결과가 아님');
  const m = out.fresh[0].meta;
  assert.deepEqual(m.refs, ['p1_2025_11_01-1', 'p1_2024_06_03-1', 'b1_2027_07_02-1']);
  assert.equal(m.figureEngine, 'ai-figure'); assert.equal(m.sceneCount, 2); assert.deepEqual(m.strippedTexts, ['설명']);
  assert.deepEqual(m.models, { text: 't', image: 'i' });
  const thrown = await runFigureEngine({ request: 'x', engine: { makeFigureSet: async () => { throw new Error('엔진 고장'); } } });
  assert.equal(thrown.fresh.length, 0); assert.equal(thrown.aborted, false); assert.match(thrown.errors[0].message, /엔진 고장/);
  const aborted = await runFigureEngine({ request: 'x', engine: { makeFigureSet: async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; } } });
  assert.equal(aborted.aborted, true);
  assert.equal(figureSceneMeta(null, 0).refs.length, 0);
});

test('실제 그림 엔진 + 가짜 연결: 한 장면이 그려지고 기출 3장 정보가 남음', async () => {
  const tags = [1, 2, 3, 4].map((i) => JSON.stringify({ id: `p1_2025_11_0${i}-1`, subject: '물리학Ⅰ', year: 2025, type: '역학', tags: ['빗면'], desc: '빗면 위 물체' })).join('\n');
  const q = (id) => ({ question: { blocks: [{ kind: 'figure', figure: { data: PNG } }] } });
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.endsWith('taxonomy.json')) return new Response(JSON.stringify({ types: ['역학'] }));
    if (u.endsWith('tags.jsonl')) return new Response(tags);
    if (u.endsWith('tags-hak.jsonl')) return new Response('');
    if (u.includes('/q/')) return new Response(JSON.stringify(q(u)));
    return new Response('', { status: 404 });
  };
  const texts = [];
  const desktop = { readImageText: async ({ text }) => { texts.push(text.slice(0, 20)); return { text: /JSON/.test(text) && /장면|scenes/.test(text) ? '{"type":"역학","scenes":["빗면 위 물체"],"keyValues":""}' : '{"has":false,"texts":[]}' }; } };
  const raster = { generate: async () => ({ src: PNG }) };
  const { createEngine } = await import('../js/ai-figure/index.js');
  const engine = createEngine({ ai: createDesktopEngineAi(desktop, raster), fetch: fetchImpl, grayscale: async (d) => ({ data: d, applied: false, reason: 'node' }) });
  const out = await runFigureEngine({ request: '빗면 위 물체', engine });
  assert.equal(out.fresh.length, 1);
  assert.equal(out.fresh[0].image, PNG);
  assert.ok(out.fresh[0].meta.refs.length >= 1 && out.fresh[0].meta.refs.length <= 3, JSON.stringify(out.fresh[0].meta.refs));
});

test('그래프 그림: meta.graphPlan으로 저장되고, 그 설계로 AI 없이 다시 그림', async () => {
  const plan = { xMin: 0, xMax: 4, yMin: 0, yMax: 6, labelX: '시간(s)', labelY: '속도(m/s)', xTicks: [{ value: 2, label: '2' }], yTicks: [{ value: 6, label: '6' }], series: [{ expr: '6-2*x', domain: [0, 3], label: 'A' }], marks: [], guides: [] };
  const answers = [JSON.stringify(plan), '{"ok":true}'];
  let textCalls = 0;
  const ai = { readText: async () => { textCalls++; return answers.shift() ?? '{}'; } };
  const drawGraph = async (prepared) => ({ png: 'data:image/png;base64,' + Buffer.from(JSON.stringify([prepared.xMax, prepared.labelY])).toString('base64'), svg: '<svg/>', collisions: { n: 0, list: [] } });
  const r = await runGraphPicture({ ai, request: '속도-시간 그래프', drawGraph, models: { text: 'gpt-6.1-sol' } });
  assert.ok(r.png.startsWith('data:image/png'));
  assert.equal(r.meta.graphEngine, 'ai-graph-picture');
  assert.equal(r.meta.graphPlan.labelY, '속도(m/s)');
  assert.equal(r.meta.request, '속도-시간 그래프');
  const before = textCalls;
  const again = await redrawGraphPicture(JSON.parse(JSON.stringify(r.meta)), { drawGraph });
  assert.equal(textCalls, before, '다시 그리기는 AI를 부르지 않음');
  assert.equal(again.png, r.png, '같은 설계 → 같은 그림');
  await assert.rejects(redrawGraphPicture({}), /graphPlan/);
});

test('결과 저장(스냅숏)이 meta를 지킨다 — 작업을 다시 열어도 참고 기출·설계가 남음', () => {
  const item = { id: 'g1', name: 'x', data: PNG, kind: 'generated', meta: { graphEngine: 'ai-graph-picture', graphPlan: { xMin: 0 } } };
  const snap = snapshotImageItem(item);
  assert.deepEqual(snap.meta, item.meta);
  assert.notEqual(snap.meta, item.meta);
  assert.equal('meta' in snapshotImageItem({ id: 'g2', data: PNG }), false, '없으면 넣지 않음');
  assert.throws(() => snapshotImageItem({ id: 'g3', meta: [] }), /meta/);
});

test('패널 연결: 이미지 생성은 새 엔진 길, 그래프는 옵션일 때만, 캔버스 객체에 meta가 따라감', () => {
  const panel = fs.readFileSync(path.join(ROOT, 'js/ai-panel.js'), 'utf8');
  assert.match(panel, /isExamBrief\(runInput\) && !batchRun\) \{\s*const route = figureRoute\(/);
  assert.match(panel, /legacyFigure: true, silentUserLog: true/, '엔진이 못 그리면 옛 길로 이어서');
  assert.match(panel, /const route = graphRoute\(/);
  assert.match(fs.readFileSync(path.join(ROOT, 'js/ai-candidate-materializer.js'), 'utf8'), /meta:snapshot\.meta/);
  assert.match(fs.readFileSync(path.join(ROOT, 'js/image-paste.js'), 'utf8'), /meta: structuredClone\(place\.meta\)/);
});

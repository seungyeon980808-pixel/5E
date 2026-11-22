// 11-23 앱 반영 후보(exp/1122-figure-candidate) — 밤샘 실험 우승안을 앱 기본으로, 항목마다 플래그로 끌 수 있는지. 가짜 ai만 쓴다(실제 AI 없음).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { AI_ENGINE_FLAG_KEYS, aiWinnerFlags, figureUserRefsMode } from '../js/ai-engine-flags.js';
import { figureCreateOptions, figureSketchOptions, runFigureEngine, runFigureEdit } from '../js/ai-engines.js';
import { splitPanelBoxes, cropRgba, upscaleCleanRgba, figurePanelTools } from '../js/ai-figure-panels.js';
import { createEngine, makeIndex } from '../js/ai-figure/index.js';

const store = (values = {}) => ({ getItem: (k) => (k in values ? values[k] : null) });
const withStorage = async (values, fn) => {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: store(values), configurable: true, writable: true });
  try { return await fn(); } finally { if (before) Object.defineProperty(globalThis, 'localStorage', before); else delete globalThis.localStorage; }
};
const WINNER_KEYS = ['figureG4', 'figureStyleDirective', 'figureMultiCombined', 'figureSketchSpec', 'figureEditRetryOnError', 'figureFlattenWhite', 'convertExamSolCircled', 'convertTextbookEdgeGuide'];

test('우승안 플래그: 기본 모두 켬, 항목마다 \'0\'이면 그것만 꺼짐, 교사 그림 길은 기본 손그림만', () => {
  const on = aiWinnerFlags(store());
  for (const k of WINNER_KEYS) assert.equal(on[k], true, k);
  assert.equal(on.figureUserRefsMode, 'sketch');
  for (const k of WINNER_KEYS) {
    const f = aiWinnerFlags(store({ [AI_ENGINE_FLAG_KEYS[k]]: '0' }));
    for (const j of WINNER_KEYS) assert.equal(f[j], j !== k, `${k} 끔 → ${j}`);
  }
  assert.equal(figureUserRefsMode(store({ [AI_ENGINE_FLAG_KEYS.figureUserRefs]: '0' })), 'off');
  assert.equal(figureUserRefsMode(store({ [AI_ENGINE_FLAG_KEYS.figureUserRefs]: '1' })), 'all');
});

test('글로 그리기 옵션: 기본 = G4(구체화 검색·고르기 AI 끔·이름 규칙 2) + 화풍 + 여러 장 한 장·2배 + 흰 종이, 끄면 하나씩 빠짐', () => {
  assert.deepEqual(figureCreateOptions(store()), { baselineFix: true, classifyMode: 'expand', aiPick: false, fix: { noInventNames: 2, styleDirective: true, multiCombined: true, multiUpscale: 2, flattenWhite: true } });
  assert.deepEqual(figureCreateOptions(store({ [AI_ENGINE_FLAG_KEYS.figureG4]: '0' })), { fix: { styleDirective: true, multiCombined: true, multiUpscale: 2, flattenWhite: true } });
  const allOff = Object.fromEntries(['figureG4', 'figureStyleDirective', 'figureMultiCombined', 'figureFlattenWhite'].map((k) => [AI_ENGINE_FLAG_KEYS[k], '0']));
  assert.deepEqual(figureCreateOptions(store(allOff)), {}, '모두 끄면 1.7.2와 같은 호출');
});

test('손그림 옵션: 기출 0장·빠른 길·짧은 명세 4(실험 CH-묶음 손그림 길), 명세를 끄면 null(고침 U1 길)', () => {
  assert.deepEqual(figureSketchOptions(store()), { baselineFix: true, classifyMode: 'expand', aiPick: false, refCount: 0, raw: true, fix: { userRoles: true, noRefFast: true, sketchSpec: 4, flattenWhite: true } });
  assert.equal(figureSketchOptions(store({ [AI_ENGINE_FLAG_KEYS.figureSketchSpec]: '0' })), null);
});

const fakeEngine = () => {
  const calls = [];
  const img = 'data:image/png;base64,AAAA';
  return { calls, engine: {
    makeFigureSet: async (o) => { calls.push({ kind: 'make', o }); return { ok: true, scenes: [{ image: img, request: o.request, refs: [] }], errors: [] }; },
    editFigure: async (o) => { calls.push({ kind: 'edit', o }); return { ok: true, scenes: [{ image: img, refs: [] }], errors: [] }; },
  } };
};

test('runFigureEngine: 교사 그림 없으면 우승안 옵션, 손그림만이면 짧은 명세, 레퍼런스면 고침 U1 옵션', async () => {
  await withStorage({}, async () => {
    let f = fakeEngine();
    await runFigureEngine({ ai: {}, engine: f.engine, request: '실린더 세 장면' });
    const o = f.calls[0].o;
    assert.equal(o.classifyMode, 'expand'); assert.equal(o.aiPick, false); assert.equal(o.baselineFix, true);
    assert.deepEqual(o.fix, { noInventNames: 2, styleDirective: true, multiCombined: true, multiUpscale: 2, flattenWhite: true });

    f = fakeEngine();
    const out = await runFigureEngine({ ai: {}, engine: f.engine, request: '손그림대로', userImages: ['data:image/png;base64,SK'], userImageRoles: ['sketch'] });
    assert.equal(f.calls[0].o.fix.sketchSpec, 4); assert.equal(f.calls[0].o.refCount, 0); assert.equal(f.calls[0].o.raw, true);
    assert.deepEqual(out.fresh[0].meta.userRefs, { count: 1, roles: ['sketch'], sketchSpec: 4 });

    f = fakeEngine();
    await runFigureEngine({ ai: {}, engine: f.engine, request: '이 사진처럼', userImages: ['data:image/png;base64,RF'], userImageRoles: ['reference'] });
    assert.deepEqual(f.calls[0].o.fix, { userRoles: true, flattenWhite: true }); assert.equal(f.calls[0].o.refCount, 1);
  });
  await withStorage({ [AI_ENGINE_FLAG_KEYS.figureG4]: '0', [AI_ENGINE_FLAG_KEYS.figureStyleDirective]: '0', [AI_ENGINE_FLAG_KEYS.figureMultiCombined]: '0', [AI_ENGINE_FLAG_KEYS.figureFlattenWhite]: '0' }, async () => {
    const f = fakeEngine();
    await runFigureEngine({ ai: {}, engine: f.engine, request: '빗면' });
    const o = f.calls[0].o;
    for (const k of ['fix', 'classifyMode', 'aiPick', 'baselineFix']) assert.equal(o[k], undefined, `모두 끄면 ${k} 없음(1.7.2 호출)`);
  });
});

test('runFigureEdit: 서버 오류 다시 시도·흰 종이 기본 켬, 끄면 안 보냄', async () => {
  await withStorage({}, async () => {
    const f = fakeEngine();
    await runFigureEdit({ ai: {}, engine: f.engine, previousPng: 'data:image/png;base64,AAAA', instruction: '추 하나 더' });
    assert.equal(f.calls[0].o.retryOnError, true); assert.equal(f.calls[0].o.flattenWhite, true);
  });
  await withStorage({ [AI_ENGINE_FLAG_KEYS.figureEditRetryOnError]: '0', [AI_ENGINE_FLAG_KEYS.figureFlattenWhite]: '0' }, async () => {
    const f = fakeEngine();
    await runFigureEdit({ ai: {}, engine: f.engine, previousPng: 'data:image/png;base64,AAAA', instruction: '추 하나 더' });
    assert.equal(f.calls[0].o.retryOnError, undefined); assert.equal(f.calls[0].o.flattenWhite, undefined);
  });
});

// ── 칸 자르기·키우기(AI 없음) ──
function panelsPng(n, { W = 1200, H = 400, gap = 120 } = {}) {
  const p = new PNG({ width: W, height: H });
  p.data.fill(255);
  const cell = Math.floor((W - gap * (n + 1)) / n);
  for (let i = 0; i < n; i++) {
    const x0 = gap + i * (cell + gap);
    for (let y = 100; y < 300; y++) for (let x = x0; x < x0 + cell; x++) {
      if (y < 104 || y > 295 || x < x0 + 4 || x > x0 + cell - 5 || (x - x0) === y - 100) { const k = (y * W + x) * 4; p.data[k] = p.data[k + 1] = p.data[k + 2] = 0; }
    }
  }
  return p;
}

test('splitPanelBoxes: 흰 틈 n-1개에서 n칸, 칸마다 같은 세로 범위, 칸 수가 안 맞으면 []', () => {
  for (const n of [2, 3, 4, 5]) {
    const p = panelsPng(n, { W: 300 * n + 120 });
    const boxes = splitPanelBoxes(p.data, p.width, p.height, n);
    assert.equal(boxes.length, n, `${n}칸`);
    assert.ok(boxes.every((b) => b.y === boxes[0].y && b.height === boxes[0].height), '같은 세로 범위(배율 유지)');
    for (let i = 1; i < n; i++) assert.ok(boxes[i].x >= boxes[i - 1].x + boxes[i - 1].width - 1, '칸이 겹치지 않음');
    const c = cropRgba(p.data, p.width, boxes[0]);
    assert.equal(c.length, boxes[0].width * boxes[0].height * 4);
  }
  const two = panelsPng(2);
  assert.deepEqual(splitPanelBoxes(two.data, two.width, two.height, 3), [], '칸 수가 모자라면 장면마다 따로');
  const blank = new PNG({ width: 50, height: 50 }); blank.data.fill(255);
  assert.deepEqual(splitPanelBoxes(blank.data, 50, 50, 2), []);
});

test('upscaleCleanRgba: 2배 크기·불투명·거의 흰 곳은 흰색·선은 검게 남음', () => {
  const p = panelsPng(2, { W: 400, H: 200, gap: 40 });
  const u = upscaleCleanRgba(p.data, p.width, p.height, 2);
  assert.equal(u.width, 800); assert.equal(u.height, 400);
  let dark = 0, alpha = 0, nearWhite = 0;
  for (let i = 0; i < u.data.length; i += 4) { if (u.data[i] < 100) dark++; if (u.data[i + 3] !== 255) alpha++; if (u.data[i] > 238 && u.data[i] < 255) nearWhite++; }
  assert.ok(dark > 1000); assert.equal(alpha, 0); assert.equal(nearWhite, 0);
});

test('엔진 multiCombined + multiUpscale: 한 번 그려 칸별로 자르고 2배, 칸 수가 맞지 않으면 장면마다 따로', async () => {
  const toUrl = (p) => 'data:image/png;base64,' + PNG.sync.write(p).toString('base64');
  const fromUrl = (u) => PNG.sync.read(Buffer.from(u.split(',')[1], 'base64'));
  const split = async (u, n) => { const p = fromUrl(u); return splitPanelBoxes(p.data, p.width, p.height, n).map((b) => { const q = new PNG({ width: b.width, height: b.height }); q.data.set(cropRgba(p.data, p.width, b)); return toUrl(q); }); };
  const up = async (u, f) => { const p = fromUrl(u); const r = upscaleCleanRgba(p.data, p.width, p.height, f); const q = new PNG({ width: r.width, height: r.height }); q.data.set(r.data); return toUrl(q); };
  const run = async (drawN) => {
    const images = [];
    const ai = {
      async readText({ text }) {
        if (text.includes('그림 담당')) return JSON.stringify({ type: '기타', graph: false, scenes: ['V', '2V', '3V'], keyValues: '', notes: '', search: { subject: '', types: [], keywords: [] } });
        return '{"has":false,"texts":[]}';
      },
      async generateImage({ text }) { images.push(text); return { imageDataUrl: toUrl(panelsPng(drawN, { W: 300 * drawN + 120 })) }; },
    };
    const eng = createEngine({ ai, fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }), index: makeIndex({ taxonomy: { types: ['기타'], styles: [] }, tags: [] }), grayscale: async (d) => ({ data: d, applied: true, reason: null }), splitPanels: split, upscale: up, flatten: async (d) => d });
    const r = await eng.makeFigureSet({ request: '실린더 세 장면', strip: false, refCount: 0, ...figureCreateOptions(store()) });
    return { r, images };
  };
  const ok = await run(3);
  assert.equal(ok.images.length, 1, '그림 한 번');
  assert.equal(ok.r.scenes.length, 3);
  assert.ok(ok.r.scenes.every((s) => s.combined), '한 장에서 자른 장면');
  const w = fromUrl(ok.r.scenes[0].image).width;
  assert.ok(w >= 2 * 180, `2배로 키움(칸 180px+여백 → ${w}px)`);
  const bad = await run(2);
  assert.equal(bad.r.scenes.length, 3);
  assert.ok(bad.images.length >= 4, '칸 수가 안 맞으면 한 장 그림 뒤 장면마다 따로 그림');
  assert.ok(bad.r.errors.some((e) => e.step === 'combined-split'));
});

test('figurePanelTools: canvas가 없는 곳(node)에서는 null → 엔진이 장면마다 따로', () => {
  assert.equal(figurePanelTools(), null);
});

test('앱 연결: 손그림 판정이 길 고르기에 들어가고, 변환 두 옵션이 두 변환 호출 모두에 플래그로 들어간다', () => {
  const panel = readFileSync(new URL('../js/ai-panel.js', import.meta.url), 'utf8');
  assert.match(panel, /const userRoles = \(runInput\.attachments \|\| \[\]\)\.map\(item => userReferenceRole\(item, userRoleText\)\);/u);
  assert.equal((panel.match(/legacy: options\.legacyFigure === true, userRoles \}\)/gu) || []).length, 2);
  assert.equal((panel.match(/examSolCircled: convertExamSolCircledFlag\(\), textbookEdgeGuide: convertTextbookEdgeGuideFlag\(\)/gu) || []).length, 2);
});

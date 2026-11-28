// 그림 엔진(1.8.0): 구체화 → 장면마다 (기출 3장 검색 → 그리기 → 설명 문장 지우기 → 흑백) → 결과 객체.
// 원본 image_generator tools/figure.cjs의 장면 반복을 파일 쓰기 없이 결과 객체로 돌려준다(계약: 밤샘2/C2-1.8.0경계.md 2-1).
// 화면(설치판·웹) 렌더러에서 도는 ES 모듈. AI는 주입받는다: { readText, generateImage, signal? }.
//   readText({ model, text, attachments, signal })      → string 또는 { text }
//   generateImage({ model, text, attachments, signal }) → data URL 또는 { imageDataUrl | dataUrl | image }
// 원칙(사용자 규칙): 실패로 끝내지 않는다. 호출마다 자동 재시도, 단계별 대체(참고 그림 없이·첫 후보·지우기 전 그림),
// 장면이 끝내 실패하거나 취소되면 앞 결과(previous)를 그대로 지키고 오류는 결과에 적는다 — makeFigureSet은 던지지 않는다.
import { expand } from './expand.js';
import { collectReferenceImages as prefetchReferenceImages } from './reference-images.js';
import { loadFigureIndex, makeIndex, retrieve, DEFAULT_INDEX_BASE } from './retrieve.js';
import { makeFigure } from './make-figure.js';
import { fetchFigure } from './reference-images.js';
import { grayscaleGeneratedPng, flattenPngOnWhite } from '../ai-grayscale-png.js?v=1.7.0-four-session-integration';
import { AI_ENGINE_FLAG_KEYS, figureEngineFlag, figureImageModelFlag, FIGURE_IMAGE_MODEL_CHOICES } from '../ai-engine-flags.js?v=1.7.0-four-session-integration';
import { runEdit } from './edit.js';
import { labelHintsFromRequest } from './labels.js';
import { BARE_FIGURE_LABEL_NOTE } from './generated-labels.js?v=1.7.0-four-session-integration';
import { SKETCH_SPEC_PROMPT, sketchSpecText, styleWanted, STYLE_DIRECTIVES, combinedPanelsRequest, SKETCH_MERGED_NOTE, SKETCH_SPEC_SHORT_PROMPT, sketchSpecShortText, EDIT_BOX_NOTE, EDIT_DRIFT_RETRY_NOTE } from './prompt.js';
import { tryParseJson } from './retrieve.js';
import { panelSheetRequest, wantsBlackFill } from '../ai-figure-panels.js?v=1.7.0-four-session-integration'; // 1.7.3(E): 여러 장 칸 그림 지시·검은 칠 바람 판정
import { readSketchPlan, sketchPlanText, sketchClassification } from './sketch.js';

export { parseJson, tryParseJson, scoreTag, scoreCandidates, fillPicks, loadFigureIndex, makeIndex, retrieve, classify, roughClassify } from './retrieve.js';
export { fetchFigure, collectReferenceImages, parseFigureId, figureFromQuestion } from './reference-images.js';
export { buildFigurePrompt, FIGURE_PROMPT_VERSION } from './prompt.js';
export { expand, normalizeExpanded } from './expand.js';
export { makeFigure, pickBetter, stripText } from './make-figure.js';
export { labelHintsFromRequest, labelHintsAfterEdit } from './labels.js';
export { EDIT_PHASES, editSummaryFallback, normalizeTextOps } from './edit.js';
export { editFindPrompt, editDrawPrompt, editVerifyPrompt, editLocalVerifyPrompt } from './prompt.js';

// 회차 실험에서 쓰던 모델. 5E 모델 선택이 생기면 createEngine({ models })로 바꿔 넣는다.
export const DEFAULT_MODELS = Object.freeze({ text: 'gpt-6.1-sol', image: 'gpt-6-luna' });
export const AI_FIGURE_ENGINE_FLAG = AI_ENGINE_FLAG_KEYS.figure;
/** 기출 검색을 구체화와 나란히 돌릴지(GENSPEED 11-20). 검사·실험은 makeFigureSet({ earlyRetrieve })로 바꾼다. */
export const EARLY_RETRIEVE = true;

/** 새 그림 엔진을 쓸지. 1.8.0(11-19 사용자 결정)부터 기본 켜짐 — 이미지 생성은 이 엔진으로 대체한다.
 *  끄기: localStorage['5e.aiEngine.figure']='0'(옛 이름 '5e.aiFigureEngine'='0') 또는 globalThis.FIVE_E_AI_FIGURE_ENGINE=false. 이름 정리는 js/ai-engine-flags.js. */
export function aiFigureEngineEnabled(scope = globalThis) { return figureEngineFlag(scope); }

const abortError = () => (typeof DOMException === 'function' ? new DOMException('작업이 취소되었습니다.', 'AbortError') : Object.assign(new Error('작업이 취소되었습니다.'), { name: 'AbortError' }));
const isAbort = (error) => error?.name === 'AbortError';
const message = (error) => String(error?.message || error || '알 수 없는 오류').slice(0, 300);

function textOf(r) { return typeof r === 'string' ? r : String(r?.text ?? ''); }
function imageOf(r) {
  const v = typeof r === 'string' ? r : (r?.imageDataUrl || r?.dataUrl || r?.image || '');
  if (typeof v !== 'string' || !v.startsWith('data:image')) throw new Error('AI가 그림을 돌려주지 않았습니다.');
  return v;
}

async function withRetry(times, signal, fn) {
  let last;
  for (let a = 1; a <= Math.max(1, times); a++) {
    if (signal?.aborted) throw abortError();
    try { return await fn(a); } catch (error) {
      if (isAbort(error) || signal?.aborted) throw isAbort(error) ? error : abortError();
      last = error;
    }
  }
  throw last;
}

/**
 * @param {{ ai: { readText: Function, generateImage: Function, signal?: AbortSignal }, fetch?: typeof fetch, indexBase?: string, index?: object,
 *   models?: { text?: string, image?: string }, retries?: { text?: number, image?: number, scene?: number },
 *   grayscale?: (dataUrl: string, { signal }) => Promise<{ data: string, applied: boolean, reason: string|null }>, includeHak?: boolean }} deps
 */
export function createEngine({ ai, fetch: fetchImpl = globalThis.fetch, indexBase = DEFAULT_INDEX_BASE, index = null, models = {}, retries = {}, grayscale = grayscaleGeneratedPng, includeHak = true, referenceTimeoutMs = 0, localEdit = null, composite = null, splitPanels = null,
  // 실험(생성 3차): upscale(dataUrl, 배율) → dataUrl(fix.multiUpscale), measureDrift(before, after, region) → { inkDrift }(editFigure boxCheck), flatten(dataUrl) → dataUrl(fix.flattenWhite)
  upscale = null, measureDrift = null, flatten = flattenPngOnWhite } = {}) {
  if (!ai || typeof ai.readText !== 'function' || typeof ai.generateImage !== 'function') throw new TypeError('그림 엔진에는 ai.readText·ai.generateImage가 필요합니다.');
  const model = { ...DEFAULT_MODELS, ...models };
  const tries = { text: 3, image: 2, scene: 2, ...retries };
  let indexPromise = index ? Promise.resolve(index) : null;
  const getIndex = () => (indexPromise ||= loadFigureIndex({ fetch: fetchImpl, base: indexBase, includeHak }).catch((error) => { indexPromise = null; throw error; }));

  function context(signal, log) {
    return {
      fetch: fetchImpl, signal, log, referenceTimeoutMs,
      readText: (text, attachments = []) => withRetry(tries.text, signal, () => ai.readText({ model: model.text, text, attachments, signal }).then(textOf)),
      generateImage: (text, attachments = []) => withRetry(tries.image, signal, () => ai.generateImage({ model: model.image, text, attachments, signal }).then(imageOf)),
    };
  }

  // 실험(생성 3차, fix.flattenWhite): 흑백 뒤에 흰 종이에 한 번 더 얹는다(흑백이 실패해 원본이 돌아와도 투명이 남지 않게). 실패하면 그대로.
  const grayFor = (on) => (on && typeof flatten === 'function'
    ? async (u, o) => { const g = await grayscale(u, o); try { const d = await flatten(g?.data || u); return { ...g, data: d || g?.data || u, flattened: true }; } catch { return g; } }
    : grayscale);

  /**
   * 그림 한 벌(장면 하나 이상) 만들기. 던지지 않는다(입력이 잘못된 경우만 TypeError).
   * @param {{ request: string, subject?: string, context?: string, keyValues?: string, raw?: boolean, bestOf?: 1|2, refIds?: string[], fixNote?: string,
   *   signal?: AbortSignal, previous?: { expanded?: object, scenes?: { image?: string }[] } | null, onPhase?: (e: object) => void }} opts
   * @returns {Promise<{ expanded: object|null, scenes: object[], ok: boolean, aborted: boolean, errors: { scene: number|null, step: string, message: string }[] }>}
   */
  async function makeFigureSet({ request, subject = '', context: itemContext = '', conversation = '', keyValues = '', raw = false, bestOf = 1, refIds = [], fixNote = '', signal = ai.signal, previous = null, onPhase = () => {}, earlyRetrieve = EARLY_RETRIEVE, refCount = 3, strip = true, classifyMode = 'ai', aiPick = true, userImages = [], userImageRole = 'reference',
    // 실험(exp/1122-figure-tuning) 선택 옵션 — 기본값이면 지금과 같다:
    //  baselineFix/fix: { sceneRoles, keyValues, noRefLook, pickGothic } (점검 B-3·B-5·B-8·B-9), styleScore (B-7),
    //  prefetchRefs (B-10: 검색이 끝나는 즉시 참고 그림 받기 시작), firstScene (E2: 빈 장면만 다시 그릴 때 맞출 앞 장면 그림)
    baselineFix = false, fix: fixIn = {}, styleScore = false, prefetchRefs = false, firstScene = null, excludeRefs = [], refReject = null } = {}) {
    const fix = baselineFix ? { sceneRoles: true, keyValues: true, noRefLook: true, pickGothic: true, ...fixIn } : { ...fixIn };
    if (classifyMode === 'expand') earlyRetrieve = false; // 구체화 결과로 검색하므로 미리 검색하지 않는다
    if (typeof request !== 'string' || !request.trim()) throw new TypeError('그림 요청 글이 비어 있습니다.');
    const grayscale = grayFor(!!fix.flattenWhite);
    const phase = (e) => { try { onPhase(e); } catch { /* 화면 쪽 오류는 엔진을 멈추지 않음 */ } };
    const errors = [];
    // 고침 U1: 교사 그림이 있으면 구체화(글만 보는 AI)가 그림에 없을 물체·배치를 지어내지 않게 알려 준다(fix.userRoles일 때만).
    const userCount = Array.isArray(userImages) ? userImages.filter((u) => typeof u === 'string' && u.startsWith('data:image')).length : 0;
    const userExpandNote = fix.userRoles && userCount ? userExpandText(userCount, userImageRole) : '';
    const prevScenes = Array.isArray(previous?.scenes) ? previous.scenes : [];
    const keptScene = (i, reason) => {
      const p = prevScenes[i];
      return p?.image ? { ...p, kept: true, error: reason } : { request: null, image: null, refs: [], strippedTexts: [], beforeStrip: null, prompt: '', kept: false, error: reason };
    };
    const result = (expanded, scenes, aborted) => {
      // 앞 결과에 장면이 더 있었으면 그대로 남겨 둔다(취소·실패로 잃지 않게).
      const all = scenes.slice();
      if (aborted) for (let i = all.length; i < prevScenes.length; i++) all.push(keptScene(i, '취소됨'));
      // labelHints: 요청 글에 적힌 라벨 — 화면이 라벨 복원(글자 읽기)에 넘긴다(시안 태그 29).
      return { expanded, scenes: all, ok: !aborted && all.length > 0 && all.every((s) => s.image && !s.kept), aborted, errors, labelHints: labelHintsFromRequest(request) };
    };
    const abortedNow = () => signal?.aborted;

    if (abortedNow()) return result(previous?.expanded ?? null, [], true);

    let index;
    phase({ phase: 'index' });
    try { index = await getIndex(); }
    catch (error) { errors.push({ scene: null, step: 'index', message: message(error) }); index = makeIndex({}); }

    // 실험(생성 2차) 선택 옵션 — fix.styleDirective / fix.sketchSpec / fix.multiCombined. 기본값이면 아래는 아무것도 바꾸지 않는다.
    const styleWant = fix.styleDirective ? styleWanted([request, conversation].join('\n')) : null;
    const styleExpand = styleWant === 'illust' ? STYLE_DIRECTIVES.expandIllust : styleWant === 'schematic' ? STYLE_DIRECTIVES.expandSchematic : '';
    let drawUsers = userImages, drawRole = userImageRole, specText = '';
    const roleList0 = Array.isArray(userImageRole) ? userImageRole : [userImageRole];
    // 1.7.3 B(fix.sketchPlan): 손그림은 배치만, 내용·세부는 평가원 수준으로 — 손그림을 보는 글 AI 한 번으로 배치·세부·기출 검색어를 뽑는다(sketch.js).
    let sketchSearch = null;
    if (fix.sketchPlan && userCount && roleList0.includes('sketch')) {
      phase({ phase: 'sketch-plan' });
      try {
        const sketches = userImages.filter((u) => typeof u === 'string' && u.startsWith('data:image'));
        const plan = await readSketchPlan({ readText: context(signal).readText, request, subject, types: index.taxonomy?.types || [], sketches });
        specText = sketchPlanText(plan, { attached: fix.sketchPlan !== 2, refs: Number(refCount) > 0 || refIds.length > 0 });
        if (specText) { raw = true; if (!subject && plan.subject) subject = plan.subject; sketchSearch = sketchClassification(plan, subject); if (fix.sketchPlan === 2) drawUsers = []; else drawRole = roleList0.map((r) => (r === 'sketch' ? 'sketchLayout' : r)); }
      } catch (error) {
        if (isAbort(error) || abortedNow()) return result(previous?.expanded ?? null, [], true);
        errors.push({ scene: null, step: 'sketch-plan', message: message(error) });
      }
    } else if (fix.sketchSpec === 3 && userCount && roleList0.includes('sketch')) {
      // 생성 3차: 합침 — 글 AI 없이 그리기 지시문에 읽기 절차를 넣는다.
      specText = SKETCH_MERGED_NOTE;
    } else if (fix.sketchSpec && userCount && roleList0.includes('sketch')) {
      phase({ phase: 'sketch-spec' });
      try {
        const sketches = userImages.filter((u) => typeof u === 'string' && u.startsWith('data:image'));
        if (fix.sketchSpec === 4) specText = sketchSpecShortText(await context(signal).readText(SKETCH_SPEC_SHORT_PROMPT({ request }), sketches));
        else {
          const spec = tryParseJson(await context(signal).readText(SKETCH_SPEC_PROMPT({ request }), sketches));
          specText = sketchSpecText(spec, { attached: fix.sketchSpec !== 2 });
        }
      } catch (error) {
        if (isAbort(error) || abortedNow()) return result(previous?.expanded ?? null, [], true);
        errors.push({ scene: null, step: 'sketch-spec', message: message(error) });
      }
      if (specText) { if (fix.sketchSpec === 2) drawUsers = []; else drawRole = roleList0.map((r) => (r === 'sketch' ? 'sketchLayout' : r)); }
    }
    if (fix.editableLabels) raw = false;
    let expanded = null, sceneRequests = [request];
    // GENSPEED(11-20): 기출 검색(분류·고르기 글 AI 두 번)을 구체화와 나란히 시작한다 — 앞에서 차례로 기다리던 7~9초를 줄인다.
    // 첫 장면은 처음 요청으로 고른 기출을 쓰고, 둘째 장면부터는 첫 장면을 그리는 동안 장면 요청으로 미리 검색해 둔다.
    const retrieveFor = (req) => {
      const p = retrieve({ request: req, index, readText: (t) => context(signal).readText(t), subject, classifyMode, aiPick, styleScore });
      p.catch(() => {}); // 처리하지 않은 거절 경고 막기(쓰는 쪽이 다시 받는다)
      if (prefetchRefs) p.then((ret) => prefetchReferenceImages([...refIds, ...ret.picks, ...ret.candidates.map((c) => c.id)], { count: Math.max(0, Math.min(3, Number(refCount) || 0)), srcOf: (id) => index?.byId?.get(id)?.src, fetch: fetchImpl, signal, ...(referenceTimeoutMs ? { timeoutMs: referenceTimeoutMs } : {}) })).catch(() => {});
      return p;
    };
    const noRefFast = !!fix?.noRefFast && !(Number(refCount) > 0) && !refIds.length; // 실험: 참고 기출 0장이면 미리 검색도 안 함
    const early = !raw && earlyRetrieve && !noRefFast ? retrieveFor(request) : null;
    if (!raw) {
      phase({ phase: 'expand' });
      try {
        expanded = await expand({ request, subject, context: [itemContext, userExpandNote, styleExpand].filter(Boolean).join('\n'), conversation, taxonomy: index.taxonomy, readText: context(signal).readText, withSearch: classifyMode === 'expand', fix });
        sceneRequests = expanded.scenes;
      } catch (error) {
        if (isAbort(error) || abortedNow()) return result(previous?.expanded ?? null, [], true);
        errors.push({ scene: null, step: 'expand', message: message(error) });
      }
    }

    const scenes = [];
    let first = typeof firstScene === 'string' && firstScene.startsWith('data:image') ? firstScene : null;
    const searchFromExpand = (classifyMode === 'expand' && expanded?.search ? expanded.search : null) || sketchSearch;
    const retrievals = sceneRequests.map((_, i) => (i === 0 ? early : null));
    const drawRequest = (scene, i) => scene + specText
      + (fix.noLabels || expanded?.sceneLabels?.[i]?.length ? BARE_FIGURE_LABEL_NOTE : '');
    sceneRequests = sceneRequests.map(drawRequest);
    // 실험(fix.multiCombined): 여러 장면을 한 장에 나란히 그린 뒤 칸별로 잘라 쓴다(그림 한 번·같은 배율). 칸 수가 안 맞으면 보통 길로.
    if (fix.multiCombined && sceneRequests.length >= 2 && sceneRequests.length <= 5 && typeof splitPanels === 'function') {
      const n = sceneRequests.length;
      phase({ phase: 'scene', scene: 0, total: n, request: 'combined' });
      try {
        const r = await withRetry(tries.scene, signal, () => makeFigure({ ...context(signal), index }, {
          request: (fix.multiCombined === 'layout' ? combinedPanelsRequest : panelSheetRequest)(sceneRequests), subject, keyValues: keyValues || (fix.keyValues ? expanded?.keyValues || '' : ''), bestOf, prevScene: null, single: false, refIds, fixNote, retrieval: retrievals[0], refCount, strip, classifyMode, aiPick, userImages: drawUsers, userImageRole: drawRole, fix, styleScore, classification: searchFromExpand, excludeRefs, refReject, styleWant,
        }));
        // 1.7.3(E): 넓은 검은 칠은 연회색으로(요청이 검은 칠을 바라면 그대로).
        let parts = await splitPanels(r.image, n, { softenFills: !wantsBlackFill([request, ...sceneRequests].join('\n')) });
        if (Array.isArray(parts) && parts.length === n && fix.multiCombined === 'layout') {
          // 생성 3차(b): 자른 칸을 배치 안내로 붙여 장면마다 크게 다시 그린다(나란히). 실패한 장면은 자른 칸을 그대로 쓴다.
          const redrawn = await Promise.all(parts.map(async (part, i) => {
            phase({ phase: 'scene', scene: i, total: n, request: sceneRequests[i] });
            try {
              const q = await withRetry(tries.scene, signal, () => makeFigure({ ...context(signal), index }, {
                request: sceneRequests[i], subject, keyValues: keyValues || (fix.keyValues ? expanded?.keyValues || '' : ''), bestOf: 1, prevScene: null, single: true, refIds: [], fixNote, retrieval: null, refCount: 0, strip, classifyMode, aiPick, userImages: [part], userImageRole: ['panelLayout'], fix: { ...fix, userRoles: true }, styleScore, classification: searchFromExpand, excludeRefs, refReject, styleWant,
              }));
              return { image: q.image, refs: q.refs, prompt: q.prompt, strippedTexts: q.strippedTexts, layout: true };
            } catch (error) {
              if (isAbort(error) || abortedNow()) throw error;
              errors.push({ scene: i, step: 'combined-layout', message: message(error) });
              return { image: part, refs: r.refs, prompt: r.prompt, strippedTexts: r.strippedTexts, layout: false };
            }
          }));
          const out = [];
          for (let i = 0; i < n; i++) {
            phase({ phase: 'grayscale', scene: i, total: n });
            const g = await grayscale(redrawn[i].image, { signal });
            out.push({ request: sceneRequests[i], image: g.data, refs: redrawn[i].refs, strippedTexts: redrawn[i].strippedTexts, beforeStrip: null, prompt: redrawn[i].prompt, grayscale: { applied: g.applied, reason: g.reason }, classify: r.retrieval?.classify || null, combined: true, layoutRedrawn: redrawn[i].layout });
          }
          phase({ phase: 'done', total: n });
          return { ...result(expanded, out, false), combined: { image: r.image, crops: parts } };
        }
        if (Array.isArray(parts) && parts.length === n && fix.multiUpscale && typeof upscale === 'function') {
          // 생성 3차(c): 자른 칸을 AI 없이 키운다(실패하면 자른 그대로).
          parts = await Promise.all(parts.map(async (p) => { try { return (await upscale(p, Number(fix.multiUpscale) || 2)) || p; } catch (error) { errors.push({ scene: null, step: 'combined-upscale', message: message(error) }); return p; } }));
        }
        if (Array.isArray(parts) && parts.length === n) {
          const out = [];
          for (let i = 0; i < n; i++) {
            phase({ phase: 'grayscale', scene: i, total: n });
            const g = await grayscale(parts[i], { signal });
            out.push({ request: sceneRequests[i], image: g.data, refs: r.refs, strippedTexts: r.strippedTexts, beforeStrip: null, prompt: r.prompt, grayscale: { applied: g.applied, reason: g.reason }, classify: r.retrieval?.classify || null, combined: true });
          }
          phase({ phase: 'done', total: n });
          return { ...result(expanded, out, false), combined: { image: r.image } };
        }
        errors.push({ scene: null, step: 'combined-split', message: `칸 ${Array.isArray(parts) ? parts.length : 0}개(바라는 수 ${n}) — 장면마다 따로 그림` });
      } catch (error) {
        if (isAbort(error) || abortedNow()) return result(expanded ?? previous?.expanded ?? null, [], true);
        errors.push({ scene: null, step: 'combined', message: message(error) });
      }
    }
    for (let i = 0; i < sceneRequests.length; i++) {
      // 다음 장면 검색을 이번 장면 그리는 동안 미리 시작(나란히 켰을 때만).
      if (early && i + 1 < sceneRequests.length && !retrievals[i + 1]) retrievals[i + 1] = retrieveFor(sceneRequests[i + 1]);
      const log = (m) => phase({ phase: 'log', scene: i, total: sceneRequests.length, message: m });
      phase({ phase: 'scene', scene: i, total: sceneRequests.length, request: sceneRequests[i] });
      try {
        const r = await withRetry(tries.scene, signal, () => makeFigure({ ...context(signal, log), index }, {
          request: sceneRequests[i], subject, keyValues: keyValues || (fix.keyValues ? expanded?.keyValues || '' : ''), bestOf, prevScene: first, single: sceneRequests.length > 1, refIds, fixNote, retrieval: retrievals[i], refCount, strip, classifyMode, aiPick, userImages: drawUsers, userImageRole: drawRole, fix, styleScore, classification: searchFromExpand, excludeRefs, refReject, styleWant,
        }));
        phase({ phase: 'grayscale', scene: i, total: sceneRequests.length });
        const g = await grayscale(r.image, { signal });
        const scene = { request: sceneRequests[i], image: g.data, refs: r.refs, strippedTexts: r.strippedTexts, beforeStrip: r.beforeStrip, prompt: r.prompt, grayscale: { applied: g.applied, reason: g.reason }, classify: r.retrieval?.classify || null };
        if (!first) first = scene.image;
        scenes.push(scene);
      } catch (error) {
        if (isAbort(error) || abortedNow()) {
          for (let k = i; k < sceneRequests.length; k++) {
            const kept = keptScene(k, '취소됨');
            if (kept.request === null) kept.request = sceneRequests[k];
            scenes.push(kept);
          }
          return result(expanded ?? previous?.expanded ?? null, scenes, true);
        }
        errors.push({ scene: i, step: 'draw', message: message(error) });
        const kept = keptScene(i, message(error));
        if (kept.request === null) kept.request = sceneRequests[i];
        if (!first && kept.image) first = kept.image;
        scenes.push(kept);
      }
    }
    phase({ phase: 'done', total: scenes.length });
    return result(expanded, scenes, false);
  }

  /**
   * 고침 E2: 빈 장면만 다시 그리기. 앞 결과(previous = makeFigureSet 결과)의 장면 글·참고 기출 그대로, 구체화·검색 없이 그 장면만 그린다.
   * 다른 장면은 그대로 두고(kept 아님), 다시 그린 장면만 바꾼 결과를 돌려준다. 다시 그려도 실패한 장면은 앞 결과 그대로 + errors.
   * 앞 장면 맞추기(prevScene)는 처음 실행과 같게: 0번이 아닌 장면은 0번 장면(없으면 처음 성한 장면) 그림을 붙인다.
   * @param {{ previous: object, scenes: number[], signal?: AbortSignal, onPhase?: Function, bestOf?: number, strip?: boolean, userImages?: string[], userImageRole?: string|string[], fix?: object, baselineFix?: boolean }} opts
   * @returns {Promise<{ expanded: object|null, scenes: object[], ok: boolean, aborted: boolean, errors: object[], labelHints: string[], redrawn: number[] }>}
   */
  async function redrawScenes({ previous, scenes: which = [], signal = ai.signal, onPhase = () => {}, bestOf = 1, strip = true, userImages = [], userImageRole = 'reference', baselineFix = false, fix: fixIn = {}, keyValues = '', subject = '', request = '' } = {}) {
    const fix = baselineFix ? { sceneRoles: true, keyValues: true, noRefLook: true, pickGothic: true, ...fixIn } : { ...fixIn };
    const grayscale = grayFor(!!fix.flattenWhite);
    const prevScenes = Array.isArray(previous?.scenes) ? previous.scenes : [];
    if (!prevScenes.length) throw new TypeError('다시 그릴 앞 결과(previous.scenes)가 없습니다.');
    const phase = (e) => { try { onPhase(e); } catch { /* 화면 쪽 오류는 엔진을 멈추지 않음 */ } };
    const errors = [], redrawn = [];
    const out = prevScenes.map((s) => ({ ...s }));
    const targets = [...new Set(which.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < out.length))].sort((a, b) => a - b);
    const hints = labelHintsFromRequest(request || previous?.expanded?.scenes?.join('\n') || prevScenes.map((s) => s.request || '').join('\n'));
    const done = (aborted) => ({ expanded: previous?.expanded ?? null, scenes: out, ok: !aborted && out.every((s) => s.image && !s.kept), aborted, errors, labelHints: Array.isArray(previous?.labelHints) ? previous.labelHints : hints, redrawn });
    if (signal?.aborted) return done(true);
    let index;
    try { index = await getIndex(); } catch { index = makeIndex({}); }
    const total = out.length;
    for (const i of targets) {
      const s = prevScenes[i] || {};
      const sceneReq = String(s.request || '').trim() || String(request || '').trim();
      if (!sceneReq) { errors.push({ scene: i, step: 'redraw', message: '장면 글이 없어 다시 그리지 못했습니다.' }); continue; }
      const refs = Array.isArray(s.refs) ? s.refs.filter((id) => typeof id === 'string' && id) : [];
      // 검색을 다시 하지 않는다: 앞서 고른 기출을 그대로(refIds) 받고, 화풍 줄은 앞서 분류한 종류(classify)로 같게 만든다.
      const retrieval = Promise.resolve({ classify: s.classify || null, picks: [], candidates: [] });
      const usable = (k) => k !== i && out[k]?.image && !out[k].kept && (!targets.includes(k) || redrawn.includes(k));
      const anchorAt = out.findIndex((_, k) => usable(k));
      const prevImage = i === 0 || anchorAt < 0 ? null : out[anchorAt].image;
      const log = (m) => phase({ phase: 'log', scene: i, total, message: m });
      phase({ phase: 'scene', scene: i, total, request: sceneReq, redraw: true });
      try {
        const r = await withRetry(tries.scene, signal, () => makeFigure({ ...context(signal, log), index }, {
          request: sceneReq, subject: subject || s.classify?.subject || '', keyValues: keyValues || (fix.keyValues ? previous?.expanded?.keyValues || '' : ''), bestOf, prevScene: prevImage, single: total > 1, refIds: refs, retrieval, refCount: refs.length, strip, userImages, userImageRole, fix,
        }));
        phase({ phase: 'grayscale', scene: i, total });
        const g = await grayscale(r.image, { signal });
        out[i] = { request: sceneReq, image: g.data, refs: r.refs, strippedTexts: r.strippedTexts, beforeStrip: r.beforeStrip, prompt: r.prompt, grayscale: { applied: g.applied, reason: g.reason }, classify: r.retrieval?.classify || s.classify || null, redrawn: true };
        redrawn.push(i);
      } catch (error) {
        if (isAbort(error) || signal?.aborted) return done(true);
        errors.push({ scene: i, step: 'redraw', message: message(error) });
      }
    }
    phase({ phase: 'done', total });
    return done(false);
  }

  /**
   * 「이 그림 고치기」: 앞 그림(previousPng)을 바탕으로 instruction에 적힌 곳만 고친다. 던지지 않는다(입력이 잘못된 경우만 TypeError).
   * 결과는 makeFigureSet과 같은 모양(scenes 한 장) + { kind: 'edit', edit: { instruction, summary, targets, keep, verify, attempts }, labelHints }.
   * 실패·취소면 scenes[0]은 앞 그림 그대로(kept: true), ok: false.
   */
  async function editFigure({ previousPng, instruction, originalRequest = '', subject = '', signal = ai.signal, onPhase = () => {}, previous = null, sceneIndex = 0, verify = true, maxAttempts = 2, skipFind = false, localText = true, localReplace = false, originalPng = null, region = null, regionPng = null, composite: useComposite = false,
    // 실험(생성 3차) — 기본값이면 지금과 같다:
    //  boxCheck { thr }: 영역이 있으면 「상자 안만」을 지시에 붙이고, 고친 뒤 영역 밖 바뀐 정도(measureDrift)가 thr(영역 없으면 ×3)를 넘으면 한 번 더 고쳐 덜 바뀐 쪽을 쓴다.
    //  retryOnError: 그리기 오류로 앞 그림 그대로(kept) 끝났으면 한 번 더 시도한다(되묻기·「지시 안 됨」은 다시 하지 않음).
    //  flattenWhite: 결과를 흰 종이에 얹는다.
    boxCheck = null, retryOnError = false, flattenWhite = false } = {}) {
    if (typeof previousPng !== 'string' || !previousPng.startsWith('data:image')) throw new TypeError('고칠 앞 그림(previousPng, data URL)이 없습니다.');
    if (typeof instruction !== 'string' || !instruction.trim()) throw new TypeError('고치기 지시 글이 비어 있습니다.');
    const ctx = { ...context(signal), signal, grayscale: grayFor(!!flattenWhite), localEdit, composite };
    try {
      const reg = Array.isArray(region) ? region : null;
      const instr = instruction.trim() + (boxCheck && reg ? EDIT_BOX_NOTE : '');
      const once = (ins) => runEdit(ctx, { previousPng, instruction: ins, originalRequest, subject, previous, sceneIndex, verify, maxAttempts, onPhase, skipFind, localText, localReplace, originalPng, region, regionPng, composite: useComposite });
      let out = await once(instr);
      const failedByError = (o) => !o.ok && !o.aborted && !o.needsClarification && !o.editRejected && !!o.scenes?.[0]?.kept && (o.errors || []).length > 0;
      if (retryOnError && failedByError(out) && !signal?.aborted) {
        const again = await once(instr);
        again.errors = [...(out.errors || []), ...(again.errors || [])];
        again.retriedAfterError = true;
        out = again;
      }
      if (boxCheck && out.ok && !out.aborted && typeof measureDrift === 'function' && out.scenes?.[0]?.image && !out.scenes[0].kept) {
        const thr = (Number(boxCheck.thr) || 0.04) * (reg ? 1 : 3);
        let d1 = null;
        try { d1 = await measureDrift(previousPng, out.scenes[0].image, reg); } catch { d1 = null; }
        const info = { thr, first: d1?.inkDrift ?? null, retried: false, picked: 1 };
        if (d1 && d1.inkDrift > thr && !signal?.aborted) {
          const out2 = await once(instr + EDIT_DRIFT_RETRY_NOTE);
          info.retried = true;
          if (out2.ok && out2.scenes?.[0]?.image && !out2.scenes[0].kept) {
            let d2 = null; try { d2 = await measureDrift(previousPng, out2.scenes[0].image, reg); } catch { d2 = null; }
            info.second = d2?.inkDrift ?? null;
            if (d2 && d2.inkDrift < d1.inkDrift) { out = { ...out2, errors: [...(out.errors || []), ...(out2.errors || [])] }; info.picked = 2; }
          }
        }
        if (out.edit) out.edit.boxCheck = info;
      }
      return out;
    } catch (error) {
      // runEdit은 던지지 않게 짰지만, 혹시 모를 오류도 앞 그림을 지킨 결과로 바꾼다.
      const aborted = isAbort(error) || !!signal?.aborted;
      const prevScene = previous?.scenes?.[sceneIndex] || {};
      return { expanded: previous?.expanded ?? null, kind: 'edit', edit: { instruction, summary: '', targets: [], keep: [], verify: null, attempts: 0, sceneIndex },
        labelHints: labelHintsFromRequest(originalRequest), scenes: [{ ...prevScene, image: previousPng, kept: true, error: aborted ? '취소됨' : message(error) }],
        ok: false, aborted, errors: aborted ? [] : [{ scene: sceneIndex, step: 'edit', message: message(error) }] };
    }
  }

  return {
    makeFigureSet,
    redrawScenes,
    editFigure,
    loadIndex: getIndex,
    fetchFigure: (id, options = {}) => getIndex().catch(() => null).then((ix) => fetchFigure(id, { src: ix?.byId?.get(id)?.src, fetch: fetchImpl, ...options })),
    models: model,
  };
}

// 고침 U1: 구체화에 알리는 교사 그림 안내(글만 보는 AI라 그림 내용은 모른다).
function userExpandText(n, role) {
  const roles = Array.isArray(role) ? role : [role];
  const sketch = roles.includes('sketch'), styleOnly = roles.every((r) => r === 'style');
  if (styleOnly) return `교사가 화풍 참고 그림 ${n}장을 붙였다(그리는 AI가 화풍만 참고한다). 내용은 교사 말대로 정리한다.`;
  return `교사가 그림 ${n}장(${sketch ? '손그림' : '레퍼런스'})을 붙였고, 그리는 AI가 그 그림을 직접 보고 따른다. 구체화는 교사 말에 적힌 내용과 바꿀 점만 정리하고, 그림에 있을지 모르는 물체·개수·배치를 새로 지어내거나 옮기지 않는다${sketch ? '(장면 요청에 「손그림의 구도·위치·개수를 그대로 따른다」를 적는다)' : ''}. 교사가 여러 장을 부탁하지 않았으면 장면은 하나만 쓴다.`;
}

/** 한 번만 쓸 때: makeFigureSet(opts, deps) = createEngine(deps).makeFigureSet(opts). */
export function makeFigureSet(opts, deps) { return createEngine(deps).makeFigureSet(opts); }

/** 그림 모델 기본값: 작업대의 그림 모델 옵션(`5e.aiEngine.figureImageModel`, 기본 Luna)을 따른다. 글 모델은 엔진 기본. */
export function defaultFigureModels(scope = globalThis) {
  return { text: DEFAULT_MODELS.text, image: FIGURE_IMAGE_MODEL_CHOICES[figureImageModelFlag(scope)] || DEFAULT_MODELS.image };
}

/**
 * 한 번만 쓸 때의 「이 그림 고치기」. AI 연결은 ai 또는 adapter({ readText, generateImage })로 받는다.
 * @param {{ previousPng: string, instruction: string, originalRequest?: string, subject?: string, signal?: AbortSignal, onPhase?: (e: object) => void,
 *   ai?: object, adapter?: object, models?: { text?: string, image?: string }, retries?: object, grayscale?: Function, previous?: object|null,
 *   sceneIndex?: number, verify?: boolean, maxAttempts?: number }} opts
 */
export function editFigure({ ai, adapter, models, retries, grayscale, fetch: fetchImpl, localEdit, ...opts } = {}) {
  const engine = createEngine({ ai: ai || adapter, models: models || defaultFigureModels(), ...(retries ? { retries } : {}), ...(grayscale ? { grayscale } : {}), ...(fetchImpl ? { fetch: fetchImpl } : {}), ...(localEdit ? { localEdit } : {}) });
  return engine.editFigure(opts);
}

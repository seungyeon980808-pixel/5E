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
import { grayscaleGeneratedPng } from '../ai-grayscale-png.js?v=1.7.0-four-session-integration';
import { AI_ENGINE_FLAG_KEYS, figureEngineFlag, figureImageModelFlag, FIGURE_IMAGE_MODEL_CHOICES } from '../ai-engine-flags.js?v=1.7.0-four-session-integration';
import { runEdit } from './edit.js';
import { labelHintsFromRequest } from './labels.js';

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
export function createEngine({ ai, fetch: fetchImpl = globalThis.fetch, indexBase = DEFAULT_INDEX_BASE, index = null, models = {}, retries = {}, grayscale = grayscaleGeneratedPng, includeHak = true, referenceTimeoutMs = 0, localEdit = null, composite = null } = {}) {
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
    const phase = (e) => { try { onPhase(e); } catch { /* 화면 쪽 오류는 엔진을 멈추지 않음 */ } };
    const errors = [];
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

    let expanded = null, sceneRequests = [request];
    // GENSPEED(11-20): 기출 검색(분류·고르기 글 AI 두 번)을 구체화와 나란히 시작한다 — 앞에서 차례로 기다리던 7~9초를 줄인다.
    // 첫 장면은 처음 요청으로 고른 기출을 쓰고, 둘째 장면부터는 첫 장면을 그리는 동안 장면 요청으로 미리 검색해 둔다.
    const retrieveFor = (req) => {
      const p = retrieve({ request: req, index, readText: (t) => context(signal).readText(t), subject, classifyMode, aiPick, styleScore });
      p.catch(() => {}); // 처리하지 않은 거절 경고 막기(쓰는 쪽이 다시 받는다)
      if (prefetchRefs) p.then((ret) => prefetchReferenceImages([...refIds, ...ret.picks, ...ret.candidates.map((c) => c.id)], { count: Math.max(0, Math.min(3, Number(refCount) || 0)), srcOf: (id) => index?.byId?.get(id)?.src, fetch: fetchImpl, signal, ...(referenceTimeoutMs ? { timeoutMs: referenceTimeoutMs } : {}) })).catch(() => {});
      return p;
    };
    const early = !raw && earlyRetrieve ? retrieveFor(request) : null;
    if (!raw) {
      phase({ phase: 'expand' });
      try {
        expanded = await expand({ request, subject, context: itemContext, conversation, taxonomy: index.taxonomy, readText: context(signal).readText, withSearch: classifyMode === 'expand' });
        sceneRequests = expanded.scenes;
      } catch (error) {
        if (isAbort(error) || abortedNow()) return result(previous?.expanded ?? null, [], true);
        errors.push({ scene: null, step: 'expand', message: message(error) });
      }
    }

    const scenes = [];
    let first = typeof firstScene === 'string' && firstScene.startsWith('data:image') ? firstScene : null;
    const searchFromExpand = classifyMode === 'expand' && expanded?.search ? expanded.search : null;
    const retrievals = sceneRequests.map((_, i) => (i === 0 ? early : null));
    for (let i = 0; i < sceneRequests.length; i++) {
      // 다음 장면 검색을 이번 장면 그리는 동안 미리 시작(나란히 켰을 때만).
      if (early && i + 1 < sceneRequests.length && !retrievals[i + 1]) retrievals[i + 1] = retrieveFor(sceneRequests[i + 1]);
      const log = (m) => phase({ phase: 'log', scene: i, total: sceneRequests.length, message: m });
      phase({ phase: 'scene', scene: i, total: sceneRequests.length, request: sceneRequests[i] });
      try {
        const r = await withRetry(tries.scene, signal, () => makeFigure({ ...context(signal, log), index }, {
          request: sceneRequests[i], subject, keyValues: keyValues || (fix.keyValues ? expanded?.keyValues || '' : ''), bestOf, prevScene: first, single: sceneRequests.length > 1, refIds, fixNote, retrieval: retrievals[i], refCount, strip, classifyMode, aiPick, userImages, userImageRole, fix, styleScore, classification: searchFromExpand, excludeRefs, refReject,
        }));
        phase({ phase: 'grayscale', scene: i, total: sceneRequests.length });
        const g = await grayscale(r.image, { signal });
        const scene = { request: sceneRequests[i], image: g.data, refs: r.refs, strippedTexts: r.strippedTexts, beforeStrip: r.beforeStrip, prompt: r.prompt, grayscale: { applied: g.applied, reason: g.reason } };
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
   * 「이 그림 고치기」: 앞 그림(previousPng)을 바탕으로 instruction에 적힌 곳만 고친다. 던지지 않는다(입력이 잘못된 경우만 TypeError).
   * 결과는 makeFigureSet과 같은 모양(scenes 한 장) + { kind: 'edit', edit: { instruction, summary, targets, keep, verify, attempts }, labelHints }.
   * 실패·취소면 scenes[0]은 앞 그림 그대로(kept: true), ok: false.
   */
  async function editFigure({ previousPng, instruction, originalRequest = '', subject = '', signal = ai.signal, onPhase = () => {}, previous = null, sceneIndex = 0, verify = true, maxAttempts = 2, skipFind = false, localText = true, localReplace = false, originalPng = null, region = null, regionPng = null, composite: useComposite = false } = {}) {
    if (typeof previousPng !== 'string' || !previousPng.startsWith('data:image')) throw new TypeError('고칠 앞 그림(previousPng, data URL)이 없습니다.');
    if (typeof instruction !== 'string' || !instruction.trim()) throw new TypeError('고치기 지시 글이 비어 있습니다.');
    const ctx = { ...context(signal), signal, grayscale, localEdit, composite };
    try {
      return await runEdit(ctx, { previousPng, instruction: instruction.trim(), originalRequest, subject, previous, sceneIndex, verify, maxAttempts, onPhase, skipFind, localText, localReplace, originalPng, region, regionPng, composite: useComposite });
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
    editFigure,
    loadIndex: getIndex,
    fetchFigure: (id, options = {}) => getIndex().catch(() => null).then((ix) => fetchFigure(id, { src: ix?.byId?.get(id)?.src, fetch: fetchImpl, ...options })),
    models: model,
  };
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

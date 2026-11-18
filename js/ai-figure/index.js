// 그림 엔진(1.8.0): 구체화 → 장면마다 (기출 3장 검색 → 그리기 → 설명 문장 지우기 → 흑백) → 결과 객체.
// 원본 image_generator tools/figure.cjs의 장면 반복을 파일 쓰기 없이 결과 객체로 돌려준다(계약: 밤샘2/C2-1.8.0경계.md 2-1).
// 화면(설치판·웹) 렌더러에서 도는 ES 모듈. AI는 주입받는다: { readText, generateImage, signal? }.
//   readText({ model, text, attachments, signal })      → string 또는 { text }
//   generateImage({ model, text, attachments, signal }) → data URL 또는 { imageDataUrl | dataUrl | image }
// 원칙(사용자 규칙): 실패로 끝내지 않는다. 호출마다 자동 재시도, 단계별 대체(참고 그림 없이·첫 후보·지우기 전 그림),
// 장면이 끝내 실패하거나 취소되면 앞 결과(previous)를 그대로 지키고 오류는 결과에 적는다 — makeFigureSet은 던지지 않는다.
import { expand } from './expand.js';
import { loadFigureIndex, makeIndex, DEFAULT_INDEX_BASE } from './retrieve.js';
import { makeFigure } from './make-figure.js';
import { fetchFigure } from './reference-images.js';
import { grayscaleGeneratedPng } from '../ai-grayscale-png.js?v=1.7.0-four-session-integration';
import { AI_ENGINE_FLAG_KEYS, figureEngineFlag } from '../ai-engine-flags.js?v=1.7.0-four-session-integration';

export { parseJson, tryParseJson, scoreTag, scoreCandidates, fillPicks, loadFigureIndex, makeIndex, retrieve, classify } from './retrieve.js';
export { fetchFigure, collectReferenceImages, parseFigureId, figureFromQuestion } from './reference-images.js';
export { buildFigurePrompt, FIGURE_PROMPT_VERSION } from './prompt.js';
export { expand, normalizeExpanded } from './expand.js';
export { makeFigure, pickBetter, stripText } from './make-figure.js';

// 회차 실험에서 쓰던 모델. 5E 모델 선택이 생기면 createEngine({ models })로 바꿔 넣는다.
export const DEFAULT_MODELS = Object.freeze({ text: 'gpt-6.1-sol', image: 'gpt-6-luna' });
export const AI_FIGURE_ENGINE_FLAG = AI_ENGINE_FLAG_KEYS.figure;

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
export function createEngine({ ai, fetch: fetchImpl = globalThis.fetch, indexBase = DEFAULT_INDEX_BASE, index = null, models = {}, retries = {}, grayscale = grayscaleGeneratedPng, includeHak = true, referenceTimeoutMs = 0 } = {}) {
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
  async function makeFigureSet({ request, subject = '', context: itemContext = '', keyValues = '', raw = false, bestOf = 1, refIds = [], fixNote = '', signal = ai.signal, previous = null, onPhase = () => {} } = {}) {
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
      return { expanded, scenes: all, ok: !aborted && all.length > 0 && all.every((s) => s.image && !s.kept), aborted, errors };
    };
    const abortedNow = () => signal?.aborted;

    if (abortedNow()) return result(previous?.expanded ?? null, [], true);

    let index;
    phase({ phase: 'index' });
    try { index = await getIndex(); }
    catch (error) { errors.push({ scene: null, step: 'index', message: message(error) }); index = makeIndex({}); }

    let expanded = null, sceneRequests = [request];
    if (!raw) {
      phase({ phase: 'expand' });
      try {
        expanded = await expand({ request, subject, context: itemContext, taxonomy: index.taxonomy, readText: context(signal).readText });
        sceneRequests = expanded.scenes;
      } catch (error) {
        if (isAbort(error) || abortedNow()) return result(previous?.expanded ?? null, [], true);
        errors.push({ scene: null, step: 'expand', message: message(error) });
      }
    }

    const scenes = [];
    let first = null;
    for (let i = 0; i < sceneRequests.length; i++) {
      const log = (m) => phase({ phase: 'log', scene: i, total: sceneRequests.length, message: m });
      phase({ phase: 'scene', scene: i, total: sceneRequests.length, request: sceneRequests[i] });
      try {
        const r = await withRetry(tries.scene, signal, () => makeFigure({ ...context(signal, log), index }, {
          request: sceneRequests[i], subject, keyValues, bestOf, prevScene: first, single: sceneRequests.length > 1, refIds, fixNote,
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

  return {
    makeFigureSet,
    loadIndex: getIndex,
    fetchFigure: (id, options = {}) => getIndex().catch(() => null).then((ix) => fetchFigure(id, { src: ix?.byId?.get(id)?.src, fetch: fetchImpl, ...options })),
    models: model,
  };
}

/** 한 번만 쓸 때: makeFigureSet(opts, deps) = createEngine(deps).makeFigureSet(opts). */
export function makeFigureSet(opts, deps) { return createEngine(deps).makeFigureSet(opts); }

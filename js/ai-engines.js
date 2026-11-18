// 1.8.0 「새 엔진을 5E에 연결」: 그림 엔진(js/ai-figure)·그래프 그림 엔진(js/ai-graph)을 5E의 AI 연결에 붙이는 한곳.
// 화면 코드(ai-panel.js)는 이 파일만 부른다. 엔진 모듈은 처음 쓸 때 import()로 불러 시작 시간에 영향이 없다.
//
// AI 연결(경계 계약 2절의 ai = { readText, generateImage })
//   설치판: 글 읽기 = desktop.readImageText(codex:read-image-text, 직접 호출) / 그림 = desktop.send(purpose:'image', ephemeralRender)
//          → main의 startDirectImageTurn(desktop/ai-direct-image.cjs) — 지금 이미지 생성이 쓰는 그 길. 결과 이벤트는
//          ai-image-label-run.js의 래스터 컨트롤러가 받아 프라미스로 바꾼다.
//   웹: 연결은 만들어 두되 쓰지 않는다(availability().reason). 웹은 지금 생성 길을 그대로 쓴다 — 막다른 길 없음.
// 원칙: 실패로 끝나지 않는다. 엔진 안 재시도 → 그림은 고른 모델 다음 반대 모델(Luna↔Sol) → 엔진이 한 장도 못 그리면
//       호출 쪽(ai-panel)이 옛 생성 길로 넘긴다. 앞 결과는 지우지 않는다.
import { figureEngineFlag, graphPictureFlag } from './ai-engine-flags.js?v=1.7.0-four-session-integration';

const V = '?v=1.7.0-four-session-integration';
export const FIGURE_ENGINE_ID = 'ai-figure';
export const FIGURE_ENGINE_VERSION = '1.0.0';
export const ENGINE_TEXT_MODEL = 'gpt-6.1-sol';
export const ENGINE_IMAGE_MODEL = 'gpt-6-luna';
export const DESKTOP_ONLY_NOTE = '새 그림 엔진은 설치판에서 됩니다.';
const IMAGE_MODELS = ['gpt-6-luna', 'gpt-6.1-sol'];
const IMAGE_URL = /^data:image\/(png|jpeg|webp);base64,/;

const abortError = () => (typeof DOMException === 'function' ? new DOMException('작업이 취소되었습니다.', 'AbortError') : Object.assign(new Error('작업이 취소되었습니다.'), { name: 'AbortError' }));
const isAbort = (error) => error?.name === 'AbortError' || ['ABORTED', 'DIRECT_ABORTED'].includes(error?.code);

/** 지금 이 화면에서 새 엔진을 쓸 수 있는지. 웹은 연결만 있고 꺼져 있다. */
export function engineAvailability(desktop) {
  if (!desktop) return { available: false, reason: 'AI 연결이 없습니다.' };
  if (desktop.web) return { available: false, reason: DESKTOP_ONLY_NOTE, web: true };
  if (typeof desktop.readImageText !== 'function' || typeof desktop.send !== 'function') return { available: false, reason: 'AI 연결이 오래된 판입니다.' };
  return { available: true, reason: null };
}

/** 이미지 생성에 새 엔진을 쓸지. 사용자가 직접 넣은 레퍼런스가 있는 생성은 옛 길(첨부를 그대로 쓰는 길)을 쓴다. */
export function figureRoute({ desktop, storage, hasUserReferences = false, legacy = false } = {}) {
  if (legacy) return { use: false, reason: 'legacy' };
  if (!figureEngineFlag(storage ?? globalThis)) return { use: false, reason: 'flag-off' };
  const a = engineAvailability(desktop);
  if (!a.available) return { use: false, reason: a.web ? 'web' : 'unavailable', note: a.reason };
  if (hasUserReferences) return { use: false, reason: 'user-references' };
  return { use: true, reason: null };
}

/** 그래프 생성에 「그림으로 생성」을 쓸지. picture: 옵션을 골랐는지(화면이 생기기 전에는 플래그가 곧 옵션). */
export function graphRoute({ desktop, storage, picture = null } = {}) {
  const flag = graphPictureFlag(storage ?? globalThis);
  const chosen = picture === null ? flag : picture && flag;
  if (!chosen) return { use: false, reason: 'objects' };
  const a = engineAvailability(desktop);
  if (!a.available) return { use: false, reason: a.web ? 'web' : 'unavailable', note: a.web ? '그래프 「그림으로 생성」은 설치판에서 됩니다 · 이번에는 기본 그래프로 만들었습니다.' : a.reason };
  return { use: true, reason: null };
}

/** 고른 모델과 반대 모델. 그림 모델이 아니면 엔진 기본(Luna)부터. */
export function imageModelOrder(selected) {
  const first = IMAGE_MODELS.includes(selected) ? selected : ENGINE_IMAGE_MODEL;
  return [first, IMAGE_MODELS.find((m) => m !== first)];
}
export function engineModels({ selected, catalog = null } = {}) {
  const list = Array.isArray(catalog) ? catalog : Array.isArray(catalog?.data) ? catalog.data : null;
  const ids = list ? list.map((e) => (typeof e === 'string' ? e : e?.model || e?.id)).filter((m) => typeof m === 'string' && m) : null;
  const text = !ids || ids.includes(ENGINE_TEXT_MODEL) ? ENGINE_TEXT_MODEL : (ids.includes(selected) ? selected : ids[0] || ENGINE_TEXT_MODEL);
  return { text, image: imageModelOrder(selected)[0] };
}

function raceAbort(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then((v) => { signal.removeEventListener('abort', onAbort); resolve(v); }, (e) => { signal.removeEventListener('abort', onAbort); reject(e); });
  });
}

// 직접 호출이 받는 첨부는 PNG·JPEG·WebP만. 기출 그림이 다른 형식(SVG·GIF 등)이면 화면 캔버스로 PNG로 바꾼다.
export async function toTransportImage(dataUrl) {
  if (typeof dataUrl !== 'string' || IMAGE_URL.test(dataUrl)) return dataUrl;
  if (typeof document === 'undefined' || typeof Image !== 'function') return dataUrl;
  const img = new Image(); img.src = dataUrl; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth || 800; c.height = img.naturalHeight || 600;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0);
  return c.toDataURL('image/png');
}

/**
 * 5E 연결을 엔진의 ai 모양으로 감싼다.
 * @param {{ readImageText: Function }} desktop
 * @param {{ generate: Function }} raster  createImageLabelRasterController(...) — 그림 차례 하나를 프라미스로
 * @param {{ onCall?: (e: { kind: 'text'|'image', model: string, attempt: number }) => void, imageModels?: string[] }} options
 */
export function createDesktopEngineAi(desktop, raster, { onCall = () => {}, imageModels = imageModelOrder(null) } = {}) {
  let chain = Promise.resolve(); // 그림 차례는 한 번에 하나(래스터 컨트롤러 규칙) — bestOf 2도 차례로
  const note = (e) => { try { onCall(e); } catch { /* 진행 알림 오류는 무시 */ } };
  async function readText({ model, text, attachments = [], signal }) {
    note({ kind: 'text', model, attempt: 1 });
    const atts = await Promise.all(attachments.map(toTransportImage));
    const r = await raceAbort(Promise.resolve().then(() => desktop.readImageText({ model, text, attachments: atts })), signal);
    return typeof r === 'string' ? r : String(r?.text ?? '');
  }
  function generateImage({ model, text, attachments = [], signal }) {
    const run = async () => {
      if (signal?.aborted) throw abortError();
      const atts = (await Promise.all(attachments.map(toTransportImage))).map((data, i) => ({ name: `figure-ref-${i + 1}.png`, data }));
      const order = [model, ...imageModels.filter((m) => m !== model)].filter(Boolean).slice(0, 2);
      let last;
      for (let i = 0; i < order.length; i++) {
        if (signal?.aborted) throw abortError();
        note({ kind: 'image', model: order[i], attempt: i + 1 });
        try {
          const out = await raster.generate({ text, attachments: atts, model: order[i] }, { signal });
          if (typeof out?.src === 'string' && out.src.startsWith('data:image')) return { imageDataUrl: out.src };
          last = new Error('AI가 그림을 돌려주지 않았습니다.');
        } catch (error) {
          if (isAbort(error) || signal?.aborted) throw abortError();
          last = error;
        }
      }
      throw last || new Error('그림을 받지 못했습니다.');
    };
    const next = chain.then(run, run);
    chain = next.catch(() => {});
    return next;
  }
  return { readText, generateImage };
}

/** 엔진 진행 신호 → 지금 진행 표시(제목·설명)에 넣을 글. 새 화면 없이 setGenerating 글만 바꾼다. */
export function figurePhaseCopy(e = {}) {
  const scene = Number.isInteger(e.scene) && (e.total || 0) > 1 ? ` · 장면 ${e.scene + 1}/${e.total}` : '';
  switch (e.phase) {
    case 'index': return { title: '비슷한 기출 그림을 찾을 준비를 하고 있습니다', detail: '기출 그림 색인을 불러옵니다.' };
    case 'expand': return { title: '요청을 그림 설계로 바꾸고 있습니다', detail: '그릴 장면과 꼭 맞아야 할 값을 정리합니다.' };
    case 'scene': return { title: `비슷한 기출 그림 3장을 찾고 있습니다${scene}`, detail: String(e.request || '').slice(0, 120) || '기출 그림을 참고로 고릅니다.' };
    case 'draw': return { title: `그림을 그리고 있습니다${scene}`, detail: '고른 기출 3장을 참고해 흑백 시험지 선화로 그립니다.' };
    case 'strip': return { title: `그림 안 설명 문장을 지우고 있습니다${scene}`, detail: '그림 속 설명 문장·패널 이름을 찾아 지웁니다.' };
    case 'grayscale': return { title: `흑백으로 정리하고 있습니다${scene}`, detail: '시험지 인쇄용 흑백으로 맞춥니다.' };
    case 'log': return { title: null, detail: String(e.message || '').slice(0, 160) };
    case 'done': return { title: '결과를 확인하고 있습니다', detail: '생성 결과에 등록합니다.' };
    default: return { title: null, detail: null };
  }
}

/** 장면 하나의 결과 metadata(결과 카드·캔버스 객체 meta에 남김). 참고한 기출 3장 id가 들어간다. */
export function figureSceneMeta(result, index, { request = '', models = null } = {}) {
  const s = result?.scenes?.[index] || {};
  return {
    figureEngine: FIGURE_ENGINE_ID,
    figureEngineVersion: FIGURE_ENGINE_VERSION,
    request: String(request || ''),
    sceneRequest: s.request || '',
    sceneIndex: index,
    sceneCount: result?.scenes?.length || 1,
    refs: Array.isArray(s.refs) ? s.refs.slice(0, 3) : [],
    strippedTexts: Array.isArray(s.strippedTexts) ? s.strippedTexts.slice() : [],
    expanded: result?.expanded ? { type: result.expanded.type ?? null, scenes: Array.isArray(result.expanded.scenes) ? result.expanded.scenes.slice() : [], keyValues: result.expanded.keyValues ?? '' } : null,
    grayscale: s.grayscale ? { applied: !!s.grayscale.applied } : null,
    ...(models ? { models: { ...models } } : {}),
    createdAt: new Date().toISOString(),
  };
}

let figureModule = null, graphModule = null;
export const loadFigureEngine = () => (figureModule ||= import('./ai-figure/index.js' + V).catch((e) => { figureModule = null; throw e; }));
export const loadGraphEngine = () => (graphModule ||= import('./ai-graph/index.js' + V).catch((e) => { graphModule = null; throw e; }));

/**
 * 새 그림 엔진으로 한 벌 만들기. 던지지 않는다(취소만 aborted로 알림).
 * @returns {Promise<{ ok: boolean, aborted: boolean, fresh: { image: string, meta: object }[], result: object|null, errors: object[] }>}
 */
export async function runFigureEngine({ ai, request, models, previous = null, signal, onPhase = () => {}, engine = null, loadEngine = loadFigureEngine } = {}) {
  let result = null;
  try {
    const mod = engine ? null : await loadEngine();
    const eng = engine || mod.createEngine({ ai, models, retries: { text: 3, image: 1, scene: 2 } });
    result = await eng.makeFigureSet({ request, previous, signal, onPhase });
  } catch (error) {
    if (isAbort(error) || signal?.aborted) return { ok: false, aborted: true, fresh: [], result, errors: [] };
    return { ok: false, aborted: false, fresh: [], result, errors: [{ scene: null, step: 'engine', message: String(error?.message || error).slice(0, 300) }] };
  }
  const fresh = (result?.scenes || []).map((s, i) => (s?.image && !s.kept ? { image: s.image, meta: figureSceneMeta(result, i, { request, models }) } : null)).filter(Boolean);
  return { ok: !!result?.ok, aborted: !!result?.aborted, fresh, result, errors: result?.errors || [] };
}

/** 그래프 「그림으로 생성」. 결과 { png, meta(graphPlan 포함), warnings, fallback, collisions } 또는 취소·실패 오류. */
export async function runGraphPicture({ ai, request, keyValues = '', previous = null, signal, onPhase = () => {}, models, loadEngine = loadGraphEngine, drawGraph } = {}) {
  const mod = await loadEngine();
  const eng = mod.createGraphEngine({ ai, models, onPhase, ...(drawGraph ? { drawGraph } : {}) });
  const r = await eng.makeGraph({ request, keyValues, signal, previous: previous?.png && previous?.plan ? previous : null });
  if (!r?.png) throw Object.assign(new Error('그래프 그림을 만들지 못했습니다.'), { code: 'GRAPH_PICTURE_EMPTY' });
  return { ...r, meta: graphPictureMeta(mod, r, request) };
}

export function graphPictureMeta(mod, result, request = '') {
  return {
    ...mod.graphPlanMeta(result),
    request: String(request || result?.plan?.request || ''),
    collisions: result?.collisions?.n ?? null,
    fallback: result?.fallback || null,
    createdAt: new Date().toISOString(),
  };
}

/** 저장된 meta.graphPlan으로 다시 그리기(AI 호출 없음). 다시 열어 고칠 때 쓴다. */
export async function redrawGraphPicture(meta, { signal, loadEngine = loadGraphEngine, drawGraph } = {}) {
  if (!meta?.graphPlan) throw new TypeError('다시 그릴 그래프 설계(meta.graphPlan)가 없습니다.');
  const mod = await loadEngine();
  const noAi = { readText: async () => { throw new Error('다시 그리기는 AI를 부르지 않습니다.'); } };
  const r = await mod.makeGraph({ plan: meta.graphPlan, keyValues: meta.graphPlan.keyText || '', signal }, { ai: noAi, ...(drawGraph ? { drawGraph } : {}) });
  return { ...r, meta: graphPictureMeta(mod, r, meta.request) };
}

/** 그래프 엔진 진행 신호 → 진행 표시 글. */
export function graphPhaseCopy(phase) {
  return ({
    'graph-plan': { title: '그래프를 설계하고 있습니다', detail: '축·눈금·곡선을 정합니다.' },
    'graph-verify': { title: '설계 값을 검사하고 있습니다', detail: '곡선 식으로 직접 계산한 값과 맞춰 봅니다.' },
    'graph-draw': { title: '그래프를 그림으로 그리고 있습니다', detail: '글자가 겹치지 않게 놓고 PNG로 만듭니다.' },
    done: { title: '결과를 확인하고 있습니다', detail: '생성 결과에 등록합니다.' },
  })[phase] || { title: null, detail: null };
}

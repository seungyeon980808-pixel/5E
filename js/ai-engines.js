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
import { aiErrorCode, stripIpcPrefix } from './ai-error-copy.js?v=1.7.0-four-session-integration';
import { figureEngineFlag, graphPictureFlag, figureImageModelFlag, figureSpeedFlag, figureLocalReplaceFlag, figureSkipStripCheckFlag, figureUserRefsFlag, FIGURE_IMAGE_MODEL_CHOICES,
  figureUserRefsMode, figureG4Flag, figureStyleDirectiveFlag, figureMultiCombinedFlag, figureSketchSpecFlag, figureEditRetryOnErrorFlag, figureFlattenWhiteFlag } from './ai-engine-flags.js?v=1.7.0-four-session-integration';
import { figurePanelTools } from './ai-figure-panels.js?v=1.7.0-four-session-integration';

export const FIGURE_ENGINE_ID = 'ai-figure';
export const FIGURE_ENGINE_VERSION = '1.0.0';
export const ENGINE_TEXT_MODEL = 'gpt-6.1-sol';
export const ENGINE_IMAGE_MODEL = 'gpt-6-luna';
export const DESKTOP_ONLY_NOTE = '새 그림 엔진은 설치판에서 됩니다.';
const IMAGE_MODELS = ['gpt-6-luna', 'gpt-6.1-sol'];
const IMAGE_URL = /^data:image\/(png|jpeg|webp);base64,/;

// GENSPEED(11-20) 시간 재기: 검사가 window.__fiveEFigureTrace = []를 넣어 둔 때만 단계·호출 시각을 쌓는다(화면 변화 없음).
export function figureTrace(entry) {
  const list = globalThis.__fiveEFigureTrace;
  if (!Array.isArray(list) || list.length > 2000) return;
  try { list.push({ at: Math.round(globalThis.performance?.now?.() ?? Date.now()), ...entry }); } catch { /* 기록 실패는 무시 */ }
}
const traced = (kind, model, text, promise) => {
  const step = String(text || '').slice(0, 60);
  figureTrace({ ev: 'call-start', kind, model, step, len: String(text || '').length });
  return promise.then((v) => { figureTrace({ ev: 'call-end', kind, model, step, ok: true }); return v; }, (e) => { figureTrace({ ev: 'call-end', kind, model, step, ok: false, error: String(e?.message || e).slice(0, 120) }); throw e; });
};
const tracePhase = (onPhase) => (e) => { figureTrace({ ev: 'phase', phase: e?.phase, scene: e?.scene, local: e?.local || undefined }); return onPhase(e); };

const abortError = () => (typeof DOMException === 'function' ? new DOMException('작업이 취소되었습니다.', 'AbortError') : Object.assign(new Error('작업이 취소되었습니다.'), { name: 'AbortError' }));
const isAbort = (error) => error?.name === 'AbortError' || ['ABORTED', 'DIRECT_ABORTED'].includes(error?.code);

/** 지금 이 화면에서 새 엔진을 쓸 수 있는지. 웹은 연결만 있고 꺼져 있다. */
export function engineAvailability(desktop) {
  if (!desktop) return { available: false, reason: 'AI 연결이 없습니다.' };
  if (desktop.web) return { available: false, reason: DESKTOP_ONLY_NOTE, web: true };
  if (typeof desktop.readImageText !== 'function' || typeof desktop.send !== 'function') return { available: false, reason: 'AI 연결이 오래된 판입니다.' };
  return { available: true, reason: null };
}

/** 이미지 생성에 새 엔진을 쓸지. 사용자가 직접 넣은 레퍼런스가 있는 생성은 옛 길(첨부를 그대로 쓰는 길)을 쓴다.
 *  고침 U1(exp/1122-figure-fixes): `5e.aiEngine.figureUserRefs`가 켜져 있으면(이 갈래 기본) 레퍼런스·손그림도 새 엔진으로 — userRefs: true. */
export function figureRoute({ desktop, storage, hasUserReferences = false, legacy = false, userRoles = null } = {}) {
  if (legacy) return { use: false, reason: 'legacy' };
  if (!figureEngineFlag(storage ?? globalThis)) return { use: false, reason: 'flag-off' };
  const a = engineAvailability(desktop);
  if (!a.available) return { use: false, reason: a.web ? 'web' : 'unavailable', note: a.reason };
  if (hasUserReferences) {
    // 11-23 앱 반영 후보: 기본 'sketch' — 첨부가 모두 손그림일 때만 새 엔진(짧은 명세), 레퍼런스·표현 참고가 하나라도 있으면 옛 길.
    //   역할을 모르면(userRoles 없음) 옛 길. 'all'(고침 U1)이면 모두 새 엔진, 'off'면 모두 옛 길.
    const mode = figureUserRefsMode(storage ?? globalThis);
    if (mode === 'all') return { use: true, reason: null, userRefs: true };
    if (mode === 'sketch' && Array.isArray(userRoles) && userRoles.length && userRoles.every((r) => r === 'sketch')) return { use: true, reason: null, userRefs: true, sketchOnly: true };
    return { use: false, reason: 'user-references' };
  }
  return { use: true, reason: null };
}

/** 11-23 앱 반영 후보: 글로 그리기 makeFigureSet 선택 옵션(우승안, 플래그마다 끌 수 있음). 교사 그림이 없을 때 쓴다. */
export function figureCreateOptions(scope = globalThis) {
  const opts = {}, fix = {};
  if (figureG4Flag(scope)) { Object.assign(opts, { baselineFix: true, classifyMode: 'expand', aiPick: false }); fix.noInventNames = 2; }
  if (figureStyleDirectiveFlag(scope)) fix.styleDirective = true;
  if (figureMultiCombinedFlag(scope)) { fix.multiCombined = true; fix.multiUpscale = 2; }
  if (figureFlattenWhiteFlag(scope)) fix.flattenWhite = true;
  return Object.keys(fix).length ? { ...opts, fix } : opts;
}
/** 11-23 앱 반영 후보: 손그림만 붙은 생성(실험 CH-묶음의 손그림 길 = G4 검색 방식 + 기출 0장·빠른 길 + 짧은 명세 4). 짧은 명세를 끄면 null(고침 U1 길). */
export function figureSketchOptions(scope = globalThis) {
  if (!figureSketchSpecFlag(scope)) return null;
  const opts = figureG4Flag(scope) ? { baselineFix: true, classifyMode: 'expand', aiPick: false } : {};
  return { ...opts, refCount: 0, raw: true, fix: { userRoles: true, noRefFast: true, sketchSpec: 4, ...(figureFlattenWhiteFlag(scope) ? { flattenWhite: true } : {}) } };
}
/** 엔진에 넣을 AI 없는 도구(칸 자르기·키우기). canvas가 없거나 여러 장 한 장 그리기를 껐으면 빈 객체. */
function panelDeps(scope = globalThis) {
  if (!figureMultiCombinedFlag(scope)) return {};
  return figurePanelTools() || {};
}

// 고침 U1: 교사 첨부의 역할. 「표현 참고」(STYLE_REFERENCE) = 화풍만, 손그림(요청 글·이름에 손그림·스케치·밑그림…) = 구도 그대로, 나머지 = 레퍼런스.
const SKETCH_WORDS = /손\s*그림|손으로\s*(그린|그렸|그려)|스케치|밑그림|대충\s*(그린|그렸)|낙서|sketch|drawing/iu;
export function userReferenceRole(item, request = '') {
  if (item?.referenceRole === 'STYLE_REFERENCE') return 'style';
  if (item?.userImageRole && ['reference', 'sketch', 'style'].includes(item.userImageRole)) return item.userImageRole;
  if (SKETCH_WORDS.test(String(item?.name || '')) || SKETCH_WORDS.test(String(request || ''))) return 'sketch';
  return 'reference';
}
/** 교사 그림이 있을 때 붙일 기출 수: 교사 그림이 구도를 주므로 기출은 화풍 참고 1장(기본 3장).
 *  11-22 밤 실제 4문제(레퍼런스 2·손그림 2) 비교: 구체화 켬·기출 2장은 그림에 없던 물체를 지어내고(세포 소기관 추가·미토콘드리아 2개)
 *  레퍼런스 구도를 버렸다(해령 단면 → 입체 블록). 구체화 끔·기출 1장은 4문제 모두 교사 그림 구도·개수를 지켰다. */
export const USER_REF_KICE_COUNT = 1;
/** 교사 그림이 있으면 구체화(글만 보는 AI)를 건너뛴다 — 그림을 못 보는 구체화가 구도를 바꿨다(위 비교). 대화 정리 글은 요청 글 뒤에 붙인다. */
export function userRefRequest(request, conversation = '') {
  const c = String(conversation || '').trim();
  return c && !String(request || '').includes(c) ? `${request}\n\n[교사와 AI가 그림을 정리한 대화 — 마지막에 확정된 구성·라벨을 따른다. 질문·인사는 그림 내용이 아니다]\n${c}` : String(request || '');
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
// 그림 모델은 작업대에서 고른 대화 모델을 따르지 않는다(11-19 사용자 결정): 기본 Luna(원본 image_generator와 같음),
// 옵션 `5e.aiEngine.figureImageModel`='sol'일 때만 Sol. 앞서는 고른 모델(기본 gpt-6.1-sol)을 따라가 설치판이 늘 Sol로 그렸다(FIGGAP).
// 실패하면 반대 모델로 한 번 더 그리는 대체(imageModelOrder)는 그대로다.
export function engineModels({ selected, catalog = null, imageChoice = figureImageModelFlag() } = {}) {
  const list = Array.isArray(catalog) ? catalog : Array.isArray(catalog?.data) ? catalog.data : null;
  const ids = list ? list.map((e) => (typeof e === 'string' ? e : e?.model || e?.id)).filter((m) => typeof m === 'string' && m) : null;
  const text = !ids || ids.includes(ENGINE_TEXT_MODEL) ? ENGINE_TEXT_MODEL : (ids.includes(selected) ? selected : ids[0] || ENGINE_TEXT_MODEL);
  return { text, image: FIGURE_IMAGE_MODEL_CHOICES[imageChoice] || ENGINE_IMAGE_MODEL };
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

// E9(11-19) 고장 나눔. 설치판 main(ai-direct-image.cjs)은 시간 초과·429·5xx·연결 끊김을 이미 두 번 더 시도한 뒤 오류를 넘기고,
// IPC를 건너오면 code가 사라져 글만 남는다(「Error invoking remote method …: Error: <글>」). 그래서 글로 나눈다.
//   auth      로그인 없음·만료(401/403) — 더 불러도 소용없다. 호출 쪽이 연결 화면으로 데려간다.
//   transport 시간 초과·429·5xx·연결 끊김 — main이 이미 다시 시도했다. 같은 차례에서 글 단계마다 또 부르면 몇 분씩 쌓인다.
//   model     요청 거절(400 등) — 대개 그 모델을 쓸 수 없는 것. 다른 글 모델로 한 번 더.
export function classifyAiError(error) {
  // PATHFIX: Codex 프로그램이 없거나 로그인이 없으면 다시 불러도 소용없다 — 'auth'로 멈추면 호출 쪽이 연결 화면(설치·로그인 안내)으로 데려간다.
  if (['CODEX_NOT_FOUND', 'CODEX_NOT_LOGGED_IN'].includes(aiErrorCode(error))) return 'auth';
  const m = stripIpcPrefix(error);
  if (/로그인|login|\b40[13]\b|권한이 없/i.test(m)) return 'auth';
  if (/연결하지 못|ENOTFOUND|ECONN|network|offline|internet/i.test(m)) return 'network';
  if (/시간이 초과|time.?out|응답 오류\(\d+\)|\b429\b|\b5\d\d\b|rate.?limit|사용량/i.test(m)) return 'transport';
  if (/거절되었습니다\(4\d\d\)|model|모델/i.test(m)) return 'model';
  return 'other';
}
const engineError = (message, code) => Object.assign(new Error(message), { code });

// E9b(11-19) 차례마다 기다리는 한도. main(ai-direct-image.cjs)은 한 번 100초·다시 1번으로 끝내지만, 직접 호출이 안 되어
// 에이전트 길로 넘어가거나 끝 알림(IPC)이 사라지면 화면은 그림 600초(래스터 컨트롤러)·글은 끝없이 기다렸다. main은 그림 실패를
// 한 가지 글로만 넘겨 시간 초과인지 가릴 수 없으므로, 화면 쪽에서 차례마다 시계를 둔다: 넘으면 그 차례를 끊고(그림은 interrupt)
// 「시간이 초과」 오류(transport)로 보고 다음 모델로. 검사는 globalThis.__FIVE_E_ENGINE_IMAGE_DEADLINE_MS·__FIVE_E_ENGINE_TEXT_DEADLINE_MS로 줄인다.
export const ENGINE_IMAGE_DEADLINE_MS = 240_000;
export const ENGINE_TEXT_DEADLINE_MS = 240_000;
const deadlineFrom = (value, key, fallback) => {
  const n = Number(value ?? globalThis[key]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const deadlineError = (kind, ms) => engineError(`AI ${kind === 'image' ? '그림' : '글 읽기'} 응답 시간이 초과되었습니다(${Math.round(ms / 1000)}초 동안 답이 없어 끊었습니다).`, 'ENGINE_DEADLINE');

/**
 * 5E 연결을 엔진의 ai 모양으로 감싼다.
 * @param {{ readImageText: Function }} desktop
 * @param {{ generate: Function }} raster  createImageLabelRasterController(...) — 그림 차례 하나를 프라미스로
 * @param {{ onCall?: (e: { kind: 'text'|'image', model: string, attempt: number }) => void, imageModels?: string[], textModels?: string[], imageDeadlineMs?: number, textDeadlineMs?: number }} options
 * 돌려준 ai.health: { authRequired, offline, textDown, imageDown, deadlines, failures: { auth, network, transport, model, other } } — 호출 쪽이 실패 뒤 길을 고른다.
 */
export function createDesktopEngineAi(desktop, raster, { onCall = () => {}, imageModels = imageModelOrder(null), textModels = [], imageDeadlineMs, textDeadlineMs } = {}) {
  let chain = Promise.resolve(); // 그림 차례는 한 번에 하나(래스터 컨트롤러 규칙) — bestOf 2도 차례로
  const note = (e) => { try { onCall(e); } catch { /* 진행 알림 오류는 무시 */ } };
  const health = { authRequired: false, offline: false, textDown: false, imageDown: false, textStreak: 0, imageStreak: 0, deadlines: 0, failures: { auth: 0, network: 0, transport: 0, model: 0, other: 0 } };
  const imageLimit = () => deadlineFrom(imageDeadlineMs, '__FIVE_E_ENGINE_IMAGE_DEADLINE_MS', ENGINE_IMAGE_DEADLINE_MS);
  const textLimit = () => deadlineFrom(textDeadlineMs, '__FIVE_E_ENGINE_TEXT_DEADLINE_MS', ENGINE_TEXT_DEADLINE_MS);
  const record = (error) => {
    const kind = classifyAiError(error);
    health.failures[kind]++;
    if (kind === 'auth') health.authRequired = true;
    if (kind === 'network' && (health.failures.network >= 2 || (typeof navigator !== 'undefined' && navigator.onLine === false))) health.offline = true;
    return kind;
  };
  // 글 읽기 한 번. main 쪽 호출은 IPC로 끊을 수 없으므로 시간이 넘으면 기다림만 끊는다(main은 자기 시간 제한으로 곧 끝남).
  async function readOnce(model, text, atts, signal) {
    const ms = textLimit();
    let timer = null;
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => { health.deadlines++; reject(deadlineError('text', ms)); }, ms); });
    try {
      const r = await raceAbort(Promise.race([traced('text', model, text, Promise.resolve().then(() => desktop.readImageText({ model, text, attachments: atts }))), deadline]), signal);
      return typeof r === 'string' ? r : String(r?.text ?? '');
    } finally { clearTimeout(timer); }
  }
  async function readText({ model, text, attachments = [], signal }) {
    if (health.authRequired) throw engineError('Codex 로그인이 필요합니다.', 'ENGINE_AUTH');
    // 글 단계(구체화·검색·설명 찾기·그래프 설계·값 검사)는 모두 대체가 있다 — 끊긴 연결에 계속 묻지 않고 바로 대체로 넘긴다.
    if (health.textDown) throw engineError('AI 글 읽기가 응답하지 않아 이번 차례에서는 건너뜁니다.', 'ENGINE_TEXT_DOWN');
    note({ kind: 'text', model, attempt: 1 });
    const atts = await Promise.all(attachments.map(toTransportImage));
    const order = [model, ...textModels.filter((m) => m && m !== model)];
    let last;
    for (let i = 0; i < order.length; i++) {
      try {
        const out = await readOnce(order[i], text, atts, signal);
        health.textStreak = 0;
        return out;
      } catch (error) {
        if (isAbort(error) || signal?.aborted) throw abortError();
        last = error;
        const kind = record(error);
        if (kind === 'auth') throw engineError('Codex 로그인이 필요합니다.', 'ENGINE_AUTH');
        if (kind === 'network' || kind === 'transport') {
          if (++health.textStreak >= 2) health.textDown = true;
          throw error;
        }
        if (kind !== 'model') throw error; // 그 밖(빈 결과 등)은 엔진이 다시 시도한다
      }
    }
    throw last;
  }
  // 그림 차례 하나. 차례 시계를 넘으면 그 차례를 끊고(래스터 → desktop.interrupt) 시간 초과로 본다.
  async function drawOnce(payload, signal) {
    const ms = imageLimit();
    const inner = new AbortController();
    const onOuter = () => inner.abort();
    if (signal?.aborted) inner.abort(); else signal?.addEventListener('abort', onOuter, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; health.deadlines++; inner.abort(); }, ms);
    try { return await traced('image', payload.model, payload.text, raster.generate(payload, { signal: inner.signal })); }
    catch (error) { if (timedOut && !signal?.aborted) throw deadlineError('image', ms); throw error; }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', onOuter); }
  }
  function generateImage({ model, text, attachments = [], signal }) {
    const run = async () => {
      if (signal?.aborted) throw abortError();
      if (health.authRequired) throw engineError('Codex 로그인이 필요합니다.', 'ENGINE_AUTH');
      // 그림 차례가 연달아 응답하지 않았다(차례 시계·연결 끊김) — 같은 차례에서 장면 재시도마다 또 몇 분씩 기다리지 않는다.
      if (health.imageDown) throw engineError('AI 그림 차례가 응답하지 않아 이번 차례에서는 더 그리지 않습니다.', 'ENGINE_IMAGE_DOWN');
      const atts = (await Promise.all(attachments.map(toTransportImage))).map((data, i) => ({ name: `figure-ref-${i + 1}.png`, data }));
      const order = [model, ...imageModels.filter((m) => m !== model)].filter(Boolean).slice(0, 2);
      let last;
      for (let i = 0; i < order.length; i++) {
        if (signal?.aborted) throw abortError();
        if (health.imageDown) break;
        note({ kind: 'image', model: order[i], attempt: i + 1 });
        try {
          const out = await drawOnce({ text, attachments: atts, model: order[i] }, signal);
          if (typeof out?.src === 'string' && out.src.startsWith('data:image')) { health.imageStreak = 0; return { imageDataUrl: out.src }; }
          last = new Error('AI가 그림을 돌려주지 않았습니다.');
        } catch (error) {
          if (isAbort(error) || signal?.aborted) throw abortError();
          last = error;
          const kind = record(error);
          if (kind === 'auth') throw engineError('Codex 로그인이 필요합니다.', 'ENGINE_AUTH');
          if ((kind === 'transport' || kind === 'network') && ++health.imageStreak >= 2) health.imageDown = true;
        }
      }
      throw last || new Error('그림을 받지 못했습니다.');
    };
    const next = chain.then(run, run);
    chain = next.catch(() => {});
    return next;
  }
  return { readText, generateImage, health };
}

/** 엔진 진행 신호 → 지금 진행 표시(제목·설명)에 넣을 글. 새 화면 없이 setGenerating 글만 바꾼다. */
// 끊김 안내의 「바로 다시 하려면 …을 누르세요」— 실제 실행 단추 글자(이미지 생성·그래프 생성·수정하기 등)를 그대로 쓴다(E2E 11-19:
// 「실행을 누르세요」인데 그런 단추가 없었음). 받침에 따라 을/를. 글자가 비면 「실행 단추를」.
export function runAgainHint(label) {
  const text = String(label ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '바로 다시 하려면 실행 단추를 누르세요.';
  const code = text.charCodeAt(text.length - 1);
  const batchim = code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 !== 0 : false;
  return `바로 다시 하려면 「${text}」${batchim ? '을' : '를'} 누르세요.`;
}

export function figurePhaseCopy(e = {}) {
  const scene = Number.isInteger(e.scene) && (e.total || 0) > 1 ? ` · 장면 ${e.scene + 1}/${e.total}` : '';
  switch (e.phase) {
    case 'index': return { title: '그릴 준비를 하고 있습니다', detail: '요청을 읽고 있습니다.' };
    case 'expand': return { title: '요청을 그림 설계로 바꾸고 있습니다', detail: '그릴 장면과 꼭 맞아야 할 값을 정리합니다.' };
    case 'scene': return { title: `그릴 준비를 하고 있습니다${scene}`, detail: String(e.request || '').slice(0, 120) || '그릴 장면을 정리합니다.' };
    case 'draw': return { title: `그림을 그리고 있습니다${scene}`, detail: '흑백 시험지 선화로 그립니다.' };
    case 'strip': return { title: `그림 안 설명 문장을 지우고 있습니다${scene}`, detail: '그림 속 설명 문장·패널 이름을 찾아 지웁니다.' };
    case 'grayscale': return { title: `흑백으로 정리하고 있습니다${scene}`, detail: '시험지 인쇄용 흑백으로 맞춥니다.' };
    // 「이 그림 고치기」(엔진 editFigure, EDIT_PHASES) — 시안 태그 10의 네 단계.
    case 'edit-find': return { title: '고칠 곳을 찾고 있습니다', detail: '앞 그림에서 말한 곳을 찾습니다. 나머지는 그대로 둡니다.' };
    case 'edit-apply': return { title: '그 부분을 고치고 있습니다', detail: '앞 그림을 바탕으로 말한 곳만 고칩니다.' };
    case 'edit-verify': return { title: '나머지가 그대로인지 확인하고 있습니다', detail: '고친 그림을 앞 그림과 견줍니다.' };
    case 'edit-finish': return { title: '마무리하고 있습니다', detail: '설명 글을 지우고 흑백으로 맞춥니다.' };
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
    // 요청 글에 적힌 라벨(엔진 labelHints) — 「확정하고 라벨 살리기」가 글자 읽기 기준으로 쓴다(시안 태그 29).
    labelHints: Array.isArray(result?.labelHints) ? result.labelHints.slice(0, 60) : [],
    expanded: result?.expanded ? { type: result.expanded.type ?? null, scenes: Array.isArray(result.expanded.scenes) ? result.expanded.scenes.slice() : [], keyValues: result.expanded.keyValues ?? '' } : null,
    grayscale: s.grayscale ? { applied: !!s.grayscale.applied } : null,
    ...(models ? { models: { ...models } } : {}),
    createdAt: new Date().toISOString(),
  };
}

// E9b: 브라우저는 실패한 import()를 주소별로 기억해 같은 주소로는 다시 받지 않는다(크롬) — 한 번 잠깐 못 받으면 그 창에서는
// 새 엔진이 끝까지 안 됐다. 실패한 뒤에는 꼬리표(&retry=N)를 붙인 새 주소로 다시 받는다.
// 주소의 판 번호(?v=)는 다른 import처럼 글자 그대로 쓴다 — 자원 닫힘 검사(test-four-session-resource-closure)가 글자 import에 판 번호가 붙었는지 본다.
let figureModule = null, graphModule = null, figureRetry = 0, graphRetry = 0;
const retryTag = (n) => (n ? `&retry=${n}` : '');
export const loadFigureEngine = () => (figureModule ||= import('./ai-figure/index.js?v=1.7.0-four-session-integration' + retryTag(figureRetry)).catch((e) => { figureModule = null; figureRetry++; throw e; }));
export const loadGraphEngine = () => (graphModule ||= import('./ai-graph/index.js?v=1.7.0-four-session-integration' + retryTag(graphRetry)).catch((e) => { graphModule = null; graphRetry++; throw e; }));

/**
 * 새 그림 엔진으로 한 벌 만들기. 던지지 않는다(취소만 aborted로 알림).
 * @returns {Promise<{ ok: boolean, aborted: boolean, fresh: { image: string, meta: object }[], result: object|null, errors: object[] }>}
 */
export async function runFigureEngine({ ai, request, conversation = '', models, previous = null, refIds = [], signal, onPhase = () => {}, engine = null, loadEngine = loadFigureEngine, userImages = [], userImageRoles = [] } = {}) {
  // 고침 U1: 교사 그림을 첫 첨부로(역할 문장 fix.userRoles), 기출은 화풍 참고 2장.
  const users = Array.isArray(userImages) ? userImages.filter((u) => typeof u === 'string' && u.startsWith('data:image')) : [];
  const roles = users.map((_, i) => userImageRoles[i] || 'reference');
  // 11-23 앱 반영 후보: 손그림만이면 짧은 명세 길(figureSketchOptions), 그 밖의 교사 그림은 고침 U1 길, 교사 그림이 없으면 우승안 옵션(figureCreateOptions).
  const sketchOpts = users.length && roles.every((r) => r === 'sketch') ? figureSketchOptions() : null;
  const flat = figureFlattenWhiteFlag() ? { flattenWhite: true } : {};
  const userOpts = users.length ? { userImages: users, userImageRole: roles, ...(sketchOpts || { fix: { userRoles: true, ...flat }, refCount: USER_REF_KICE_COUNT, raw: true }) } : figureCreateOptions();
  if (users.length) request = userRefRequest(request, conversation);
  let result = null;
  try {
    const mod = engine ? null : await loadEngine();
    const referenceTimeoutMs = Number(globalThis.__FIVE_E_FIGURE_REF_TIMEOUT_MS) > 0 ? Number(globalThis.__FIVE_E_FIGURE_REF_TIMEOUT_MS) : 15000; // 검사가 줄여 쓴다
    const eng = engine || mod.createEngine({ ai, models, retries: { text: 3, image: 1, scene: 2 }, referenceTimeoutMs, ...panelDeps() });
    figureTrace({ ev: 'engine-start', kind: 'generate' });
    result = await eng.makeFigureSet({ request, ...(conversation ? { conversation } : {}), previous, signal, onPhase: tracePhase(onPhase), earlyRetrieve: figureSpeedFlag(), ...(figureSkipStripCheckFlag() ? { strip: false } : {}), ...(refIds.length ? { refIds } : {}), ...userOpts });
    figureTrace({ ev: 'engine-end', kind: 'generate', ok: !!result?.ok });
  } catch (error) {
    if (isAbort(error) || signal?.aborted) return { ok: false, aborted: true, fresh: [], result, errors: [] };
    return { ok: false, aborted: false, fresh: [], result, errors: [{ scene: null, step: 'engine', message: String(error?.message || error).slice(0, 300) }] };
  }
  const fresh = (result?.scenes || []).map((s, i) => (s?.image && !s.kept ? { image: s.image, meta: { ...figureSceneMeta(result, i, { request, models }), ...(users.length ? { userRefs: { count: users.length, roles: userOpts.userImageRole.slice(), ...(sketchOpts ? { sketchSpec: 4 } : {}) } } : {}), ...(s.combined ? { combined: true } : {}) } } : null)).filter(Boolean);
  return { ok: !!result?.ok, aborted: !!result?.aborted, fresh, result, errors: result?.errors || [] };
}

/**
 * 고침 E2: 빈 장면만 다시 그리기(구체화·검색 없이 같은 장면 글·같은 참고 기출). 엔진에 redrawScenes가 없으면(옛 판) available:false.
 * fresh에는 다시 그린 장면만 들어간다(meta.sceneIndex로 원래 자리를 찾는다). 던지지 않는다.
 */
export async function runFigureRedraw({ ai, previous, scenes = [], request = '', models, signal, onPhase = () => {}, engine = null, loadEngine = loadFigureEngine, userImages = [], userImageRoles = [] } = {}) {
  let result = null;
  const users = Array.isArray(userImages) ? userImages.filter((u) => typeof u === 'string' && u.startsWith('data:image')) : [];
  const flat = figureFlattenWhiteFlag() ? { flattenWhite: true } : {};
  const userOpts = users.length ? { userImages: users, userImageRole: users.map((_, i) => userImageRoles[i] || 'reference'), fix: { userRoles: true, ...flat } } : (flat.flattenWhite ? { fix: flat } : {});
  try {
    const mod = engine ? null : await loadEngine();
    const referenceTimeoutMs = Number(globalThis.__FIVE_E_FIGURE_REF_TIMEOUT_MS) > 0 ? Number(globalThis.__FIVE_E_FIGURE_REF_TIMEOUT_MS) : 15000;
    const eng = engine || mod.createEngine({ ai, models, retries: { text: 3, image: 1, scene: 2 }, referenceTimeoutMs });
    if (typeof eng.redrawScenes !== 'function') return { available: false, ok: false, aborted: false, fresh: [], result: null, errors: [] };
    figureTrace({ ev: 'engine-start', kind: 'redraw', scenes: scenes.slice() });
    result = await eng.redrawScenes({ previous, scenes, request, signal, onPhase: tracePhase(onPhase), ...(figureSkipStripCheckFlag() ? { strip: false } : {}), ...userOpts });
    figureTrace({ ev: 'engine-end', kind: 'redraw', ok: !!result?.ok });
  } catch (error) {
    if (isAbort(error) || signal?.aborted) return { available: true, ok: false, aborted: true, fresh: [], result, errors: [] };
    return { available: true, ok: false, aborted: false, fresh: [], result, errors: [{ scene: null, step: 'redraw', message: String(error?.message || error).slice(0, 300) }] };
  }
  const fresh = (result?.redrawn || []).map((i) => (result.scenes[i]?.image ? { image: result.scenes[i].image, meta: { ...figureSceneMeta(result, i, { request, models }), blankRedrawn: true } } : null)).filter(Boolean);
  return { available: true, ok: !!result?.ok, aborted: !!result?.aborted, fresh, result, errors: result?.errors || [] };
}

/**
 * 「이 그림 고치기」(시안 그림생성화면 태그 10~14): 앞 결과 그림을 바탕으로 instruction에 적힌 곳만 고친다. 던지지 않는다.
 * 엔진 갈래(feat/172-gen-engine)가 넣은 createEngine(...).editFigure를 쓴다. 엔진에 고치기가 없으면(옛 판) available:false.
 * @returns {Promise<{ available: boolean, ok: boolean, aborted: boolean, fresh: { image: string, meta: object }[], result: object|null, errors: object[] }>}
 */
export async function runFigureEdit({ ai, previousPng, instruction, originalRequest = '', previous = null, sceneIndex = 0, models, signal, onPhase = () => {}, engine = null, loadEngine = loadFigureEngine } = {}) {
  let result = null;
  try {
    const mod = engine ? null : await loadEngine();
    const eng = engine || mod.createEngine({ ai, models, retries: { text: 3, image: 1, scene: 2 }, localEdit: figureLocalEdit() });
    if (typeof eng.editFigure !== 'function') return { available: false, ok: false, aborted: false, fresh: [], result: null, errors: [] };
    figureTrace({ ev: 'engine-start', kind: 'edit' });
    result = await eng.editFigure({ previousPng, instruction, originalRequest, previous, sceneIndex, signal, onPhase: tracePhase(onPhase), localText: figureSpeedFlag(), localReplace: figureSpeedFlag() && figureLocalReplaceFlag(),
      // 11-23 앱 반영 후보: 그리기 서버 오류로 앞 그림 그대로면 한 번 더(figureEditRetryOnError), 흰 종이에 얹기(figureFlattenWhite).
      ...(figureEditRetryOnErrorFlag() ? { retryOnError: true } : {}), ...(figureFlattenWhiteFlag() ? { flattenWhite: true } : {}) });
    figureTrace({ ev: 'engine-end', kind: 'edit', ok: !!result?.ok, local: !!result?.edit?.local });
  } catch (error) {
    if (isAbort(error) || signal?.aborted) return { available: true, ok: false, aborted: true, fresh: [], result, errors: [] };
    return { available: true, ok: false, aborted: false, fresh: [], result, errors: [{ scene: null, step: 'edit', message: String(error?.message || error).slice(0, 300) }] };
  }
  const scene = result?.scenes?.[0];
  const fresh = scene?.image && !scene.kept ? [{ image: scene.image, meta: { ...figureSceneMeta(result, 0, { request: originalRequest, models }), edit: result.edit ? structuredClone(result.edit) : null } }] : [];
  return { available: true, ok: !!result?.ok, aborted: !!result?.aborted, fresh, result, errors: result?.errors || [] };
}

/** GENSPEED(11-20): 글자만 고치는 「이 그림 고치기」를 화면 캔버스로(그림을 다시 그리지 않음). 캔버스가 없으면 null(엔진이 그리기 길로). */
export function figureLocalEdit() {
  if (typeof document === 'undefined' || typeof Image !== 'function') return null;
  return (png, ops) => import('./ai-figure-local-edit.js?v=1.7.0-four-session-integration').then((m) => m.applyLocalTextEdits(png, ops));
}

/** 요청 글에 적힌 라벨(태그 29). 엔진의 labelHintsFromRequest를 쓰고, 없으면 null(화면이 대체 규칙을 씀). */
export async function figureLabelHints(text, { loadEngine = loadFigureEngine } = {}) {
  try { const mod = await loadEngine(); return typeof mod.labelHintsFromRequest === 'function' ? mod.labelHintsFromRequest(String(text || '')) : null; }
  catch { return null; }
}

/** 참고한 기출 그림(태그 3 띠). 생성 때 받은 그림은 엔진 캐시에 있다. 못 받은 것은 null. */
export async function loadFigureRefImages(ids = [], { loadEngine = loadFigureEngine, signal } = {}) {
  let mod;
  try { mod = await loadEngine(); } catch { return ids.map(() => null); }
  let index = null;
  try { index = await mod.loadFigureIndex(); } catch { index = null; }
  return Promise.all(ids.map(id => Promise.resolve().then(() => mod.fetchFigure(id, { src: index?.byId?.get(id)?.src, signal })).catch(() => null)));
}

// --- 11-22: 대화 AI가 「이 그림이 참고한 기출」을 알게(화면 표시는 바꾸지 않음) ---
// 사용자가 「기출 참고한 거 맞아?」 물었더니 대화 AI가 「참고 안 했다」고 답했다 — 대화 쪽은 엔진이 고른 참고 기출(meta.refs)을 몰랐다.
const FIGURE_REF_SUBJECTS = { p1: '물리학Ⅰ', p2: '물리학Ⅱ', c1: '화학Ⅰ', c2: '화학Ⅱ', b1: '생명과학Ⅰ', b2: '생명과학Ⅱ', e1: '지구과학Ⅰ', e2: '지구과학Ⅱ' };
const KICE_ADMIN = { '06': '6월 모의평가', '09': '9월 모의평가', '11': '대학수학능력시험' };

/** 참고 기출 그림 id(예: b1_2021_09_03-1) + 색인 줄 → 「생명과학Ⅰ 2021학년도 9월 모의평가 3번 — 설명」. 형식이 다르면 id 그대로. */
export function figureRefLabel(id, tag = null) {
  const text = String(id || '');
  const m = /^([a-z]\d)_(\d{4})_(\d{2})_(\d{1,2})(?:-(.+))?$/u.exec(text);
  if (!m) return tag?.desc ? `${text} — ${tag.desc}` : text;
  const [, code, year, month, number, part] = m;
  const subject = tag?.subject || FIGURE_REF_SUBJECTS[code] || code;
  const hak = tag?.src === 'hak' || !KICE_ADMIN[month];
  const exam = hak ? `${Number(month)}월 학력평가` : KICE_ADMIN[month];
  const piece = part && part !== '1' ? ` (${/^\d+$/u.test(part) ? `그림 ${part}` : part})` : '';
  const head = `${subject} ${year}학년도 ${exam} ${Number(number)}번${piece}`;
  return tag?.desc ? `${head} — ${tag.desc}` : head;
}

/** 결과 하나가 참고한 기출 id(최대 3개). 라벨 결과는 meta가 원래 결과에서 복사돼 같은 refs를 가진다. */
export function figureRefIds(item) {
  const refs = item?.meta?.refs;
  return Array.isArray(refs) ? refs.filter((id) => typeof id === 'string' && id).slice(0, 3) : [];
}

/** 색인(tags.jsonl·tags-hak.jsonl)에서 id별 줄. 못 읽으면 빈 Map(이름은 id로 만든다). */
export async function figureRefTags(ids = [], { loadEngine = loadFigureEngine } = {}) {
  const out = new Map();
  if (!ids.length) return out;
  try {
    const mod = await loadEngine();
    const index = await mod.loadFigureIndex();
    for (const id of ids) { const tag = index?.byId?.get(id); if (tag) out.set(id, tag); }
  } catch { /* 색인을 못 읽어도 id로 만든 이름은 넘긴다 */ }
  return out;
}

/**
 * 대화 맥락에 넣을 「참고한 기출」 글. results = [{ name, refs, selected }].
 * 참고 기출이 있는 결과가 없으면 ''(맥락에 아무것도 넣지 않음).
 */
export function figureRefContextText(results = [], tags = new Map(), { attachedCount = 0 } = {}) {
  const withRefs = results.filter((r) => r?.refs?.length);
  if (!withRefs.length) return '';
  const lines = ['[그림 결과가 참고한 기출 — 화면에는 보이지 않지만 사실이다]',
    '아래 생성 결과는 그림 엔진이 실제 평가원·학력평가 기출 그림을 참고 그림으로 함께 보고 그렸다.'];
  for (const r of withRefs) {
    lines.push(`${r.name || '생성 결과'}${r.selected ? '(지금 보는 결과)' : ''}:`);
    for (const id of r.refs) lines.push(`- 참고한 기출: ${figureRefLabel(id, tags.get(id) || null)}`);
  }
  lines.push('교사가 기출을 참고했는지 물으면 「참고하지 않았다」고 하지 말고 위 목록대로 어떤 기출을 참고했는지 답한다. 참고는 구도·화풍을 본 것이지 그대로 베낀 것이 아니다.');
  lines.push(attachedCount
    ? `이번 메시지에 참고한 기출 그림 ${attachedCount}장을 「참고한 기출 · …」 이름으로 첨부했다. 비교할 때는 그 그림을 직접 보고 말한다.`
    : '참고한 기출 그림 자체는 이번에 첨부되지 않았다. 모습을 비교해야 하면 위 설명만으로 말하고, 그림을 직접 보지 않았다는 것을 밝힌다.');
  return lines.join('\n');
}

/** 그림을 직접 봐야 답할 수 있는 질문인가(비교·차이·닮음·보여 줘 …). 「참고한 거 맞아?」처럼 사실만 묻는 말은 아니다. */
export function wantsFigureRefImages(text) {
  return /비교|견주|견줘|대조|닮|비슷|똑같|같은지|차이|다른\s*점|달라|어디가|보여|봐\s*줘|살펴|기출\s*그림|원래\s*그림|원본/u.test(String(text || ''));
}

/** 「다른 기출로 다시 그리기」: 앞서 참고한 기출을 빼고 다시 고른 3장(엔진 retrieve). 못 고르면 []. */
export async function pickOtherFigureRefs({ ai, request, exclude = [], models, signal, loadEngine = loadFigureEngine } = {}) {
  try {
    const mod = await loadEngine();
    const index = await mod.loadFigureIndex();
    const readText = (text, attachments = []) => ai.readText({ model: models?.text || ENGINE_TEXT_MODEL, text, attachments, signal }).then(r => (typeof r === 'string' ? r : String(r?.text ?? '')));
    const got = await mod.retrieve({ request, index, readText, exclude });
    return (got?.picks || []).filter(id => !exclude.includes(id)).slice(0, 3);
  } catch (error) { if (isAbort(error)) throw error; return []; }
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

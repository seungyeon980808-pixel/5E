// 그림 엔진(1.8.0) 참고 기출 그림 받기. 원본 image_generator pipeline/figure-api.cjs fetchFigure.
// 그림 id(예: b1_2026_11_01-1, 학평 선지 그림 c1_2027_05_12-선지2) = 문항 id + '-' + 그림 이름. 문항 JSON 안 그림의 name이 `<id>.png`다. 문항 JSON은 5e-exam-pdf(평가원)·5e-exam-hak(학평) Worker에 있다.
// 학평인지는 색인 줄의 src로 안다(figures-hak.json 불필요). src를 모르면 평가원 → 학평 순으로 찾아본다.
import { examQuestionJsonUrl } from '../library/image-hosts.js?v=1.7.0-four-session-integration';

const CACHE_LIMIT = 24;
const cache = new Map();   // id → Promise<dataURL> (최근 것만)

// 원격(Worker) 문항 JSON에서 꺼낸 그림만 AI에 붙인다 — 비트맵 base64만, 한 장 8MB(글자 수) 이하(X1 보안 점검 11-19).
// SVG·HTML 같은 다른 data URL이나 지나치게 큰 값은 「그림 없음」으로 보고 다음 후보로 넘어간다(실패로 끝내지 않음).
export const MAX_REFERENCE_DATA_URL_CHARS = 8 * 1024 * 1024;
const REFERENCE_DATA_URL = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/u;
export function isUsableReferenceImage(data) {
  return typeof data === 'string' && data.length <= MAX_REFERENCE_DATA_URL_CHARS && REFERENCE_DATA_URL.test(data);
}

/** 그림 id → { item, n }. 꼬리 「-3」은 n=3, 학평 선지 그림 「-선지2」는 n=null(이름으로만 찾음). 형식이 아니면 오류. */
export function parseFigureId(id) {
  const m = /^(.+)-([^-]+)$/u.exec(String(id || ''));
  if (!m) throw new Error('그림 id 형식이 아닙니다: ' + id);
  return { item: m[1], n: /^\d+$/u.test(m[2]) ? Number(m[2]) : null };
}

// 문항 JSON 어디든(본문 블록·선지) 이름이 `<id>.png`인 그림 — 색인을 만들 때(catalog/build-figs*.cjs) 쓴 기준과 같다.
function findByName(o, name, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 12) return null;
  if (o.name === name && isUsableReferenceImage(o.data)) return o.data;
  for (const v of Object.values(o)) { const r = findByName(v, name, depth + 1); if (r) return r; }
  return null;
}

/** 문항 JSON → 그림 data URL(없으면 null). 이름(`<id>.png`)으로 먼저 찾고, 없으면 n번째 figure 블록(image_generator fetchFigure 방식). */
export function figureFromQuestion(json, n, id = '') {
  if (id) { const named = findByName(json, id + '.png'); if (named) return named; }
  if (!n) return null;
  const q = json?.question || {};
  const figs = (q.blocks || []).filter((b) => b?.kind === 'figure' && isUsableReferenceImage(b.figure?.data));
  return figs[n - 1]?.figure.data || null;
}

// E9(11-19): Worker가 응답하지 않으면 그리기 전체가 하염없이 멈췄다(취소 말고는 끝낼 길이 없음). 한 문항 받기에 시간 제한을 둔다 —
// 넘으면 그 그림만 건너뛰고(다음 후보 또는 참고 그림 없이) 그리기는 이어 간다. 사용자가 취소하면 그 취소는 그대로 AbortError.
export const REFERENCE_FETCH_TIMEOUT_MS = 15000;
function timeoutError(item) { const e = new Error(`그림 문항 응답이 늦어 건너뜁니다: ${item}`); e.code = 'REFERENCE_TIMEOUT'; return e; }

async function fetchFrom(src, item, n, id, { fetch: fetchImpl, signal, timeoutMs = REFERENCE_FETCH_TIMEOUT_MS }) {
  if (signal?.aborted) throw signal.reason?.name === 'AbortError' ? signal.reason : Object.assign(new Error('작업이 취소되었습니다.'), { name: 'AbortError' });
  const local = new AbortController();
  let timedOut = false;
  const onAbort = () => local.abort(signal.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = timeoutMs > 0 ? setTimeout(() => { timedOut = true; local.abort(); }, timeoutMs) : null;
  try {
    const res = await fetchImpl(examQuestionJsonUrl(item, src), { credentials: 'omit', signal: local.signal });
    if (!res.ok) { const e = new Error(`그림 문항을 받지 못했습니다(${res.status}): ${item}`); e.status = res.status; throw e; }
    const data = figureFromQuestion(await res.json(), n, id);
    if (!data) throw new Error('그림이 없습니다: ' + id);
    return data;
  } catch (error) {
    if (timedOut && !signal?.aborted) throw timeoutError(item);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * 그림 id → data URL.
 * @param {string} id
 * @param {{ src?: 'kice'|'hak', fetch?: typeof fetch, signal?: AbortSignal, cache?: boolean }} [options]
 */
export function fetchFigure(id, { src, fetch: fetchImpl = globalThis.fetch, signal, cache: useCache = true, timeoutMs = REFERENCE_FETCH_TIMEOUT_MS } = {}) {
  let parsed;
  try { parsed = parseFigureId(id); } catch (error) { return Promise.reject(error); }
  const { item, n } = parsed;
  if (useCache && cache.has(id)) { const hit = cache.get(id); cache.delete(id); cache.set(id, hit); return hit; }
  const order = src === 'hak' ? ['hak'] : src === 'kice' ? ['kice'] : ['kice', 'hak'];
  const work = (async () => {
    let last;
    for (const s of order) {
      try { return await fetchFrom(s, item, n, id, { fetch: fetchImpl, signal, timeoutMs }); }
      catch (error) { if (error?.name === 'AbortError') throw error; last = error; if (error?.code === 'REFERENCE_TIMEOUT') break; }
    }
    throw last;
  })();
  if (useCache) {
    cache.set(id, work);
    work.catch(() => { if (cache.get(id) === work) cache.delete(id); });
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  }
  return work;
}

/** 검사용: 캐시 비우기. */
export function clearFigureCache() { cache.clear(); }

/**
 * 후보 id들에서 받을 수 있는 그림을 count장까지 모은다(받지 못한 것은 건너뜀 — 참고 그림이 모자라도 그리기는 이어 감).
 * @returns {Promise<{ ids: string[], images: string[], failed: { id: string, reason: string }[] }>}
 */
export async function collectReferenceImages(ids, { count = 3, maxTries = 6, srcOf = () => undefined, fetch: fetchImpl, signal, timeoutMs = REFERENCE_FETCH_TIMEOUT_MS, reject = null } = {}) {
  const out = { ids: [], images: [], failed: [] };
  const queue = [...new Set(ids.filter(Boolean))].slice(0, Math.max(count, maxTries));
  let i = 0;
  while (out.ids.length < count && i < queue.length) {
    const batch = queue.slice(i, i + (count - out.ids.length)); i += batch.length;
    const got = await Promise.allSettled(batch.map((id) => fetchFigure(id, { src: srcOf(id), fetch: fetchImpl, signal, timeoutMs })));
    got.forEach((r, k) => {
      if (r.status === 'fulfilled' && reject && (() => { try { return reject(r.value, batch[k]); } catch { return false; } })()) out.failed.push({ id: batch[k], reason: 'rejected' });
      else if (r.status === 'fulfilled') { out.ids.push(batch[k]); out.images.push(r.value); }
      else out.failed.push({ id: batch[k], reason: String(r.reason?.message || r.reason).slice(0, 200), timeout: r.reason?.code === 'REFERENCE_TIMEOUT' });
    });
    if (signal?.aborted) break;
    // 응답이 늦은 Worker에 다음 후보를 또 물으면 그만큼 더 기다린다 — 시간 초과가 하나라도 나면 남은 후보는 묻지 않는다.
    if (out.failed.some((f) => f.timeout)) break;
  }
  return out;
}

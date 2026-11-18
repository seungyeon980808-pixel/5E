// 그림 엔진(1.8.0) 참고 기출 그림 받기. 원본 image_generator pipeline/figure-api.cjs fetchFigure.
// 그림 id(예: b1_2026_11_01-1, 학평 선지 그림 c1_2027_05_12-선지2) = 문항 id + '-' + 그림 이름. 문항 JSON 안 그림의 name이 `<id>.png`다. 문항 JSON은 5e-exam-pdf(평가원)·5e-exam-hak(학평) Worker에 있다.
// 학평인지는 색인 줄의 src로 안다(figures-hak.json 불필요). src를 모르면 평가원 → 학평 순으로 찾아본다.
import { examQuestionJsonUrl } from '../library/image-hosts.js?v=1.7.0-four-session-integration';

const CACHE_LIMIT = 24;
const cache = new Map();   // id → Promise<dataURL> (최근 것만)

/** 그림 id → { item, n }. 꼬리 「-3」은 n=3, 학평 선지 그림 「-선지2」는 n=null(이름으로만 찾음). 형식이 아니면 오류. */
export function parseFigureId(id) {
  const m = /^(.+)-([^-]+)$/u.exec(String(id || ''));
  if (!m) throw new Error('그림 id 형식이 아닙니다: ' + id);
  return { item: m[1], n: /^\d+$/u.test(m[2]) ? Number(m[2]) : null };
}

// 문항 JSON 어디든(본문 블록·선지) 이름이 `<id>.png`인 그림 — 색인을 만들 때(catalog/build-figs*.cjs) 쓴 기준과 같다.
function findByName(o, name, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 12) return null;
  if (o.name === name && typeof o.data === 'string' && o.data.startsWith('data:image')) return o.data;
  for (const v of Object.values(o)) { const r = findByName(v, name, depth + 1); if (r) return r; }
  return null;
}

/** 문항 JSON → 그림 data URL(없으면 null). 이름(`<id>.png`)으로 먼저 찾고, 없으면 n번째 figure 블록(image_generator fetchFigure 방식). */
export function figureFromQuestion(json, n, id = '') {
  if (id) { const named = findByName(json, id + '.png'); if (named) return named; }
  if (!n) return null;
  const q = json?.question || {};
  const figs = (q.blocks || []).filter((b) => b?.kind === 'figure' && typeof b.figure?.data === 'string' && b.figure.data.startsWith('data:image'));
  return figs[n - 1]?.figure.data || null;
}

async function fetchFrom(src, item, n, id, { fetch: fetchImpl, signal }) {
  const res = await fetchImpl(examQuestionJsonUrl(item, src), { credentials: 'omit', signal });
  if (!res.ok) { const e = new Error(`그림 문항을 받지 못했습니다(${res.status}): ${item}`); e.status = res.status; throw e; }
  const data = figureFromQuestion(await res.json(), n, id);
  if (!data) throw new Error('그림이 없습니다: ' + id);
  return data;
}

/**
 * 그림 id → data URL.
 * @param {string} id
 * @param {{ src?: 'kice'|'hak', fetch?: typeof fetch, signal?: AbortSignal, cache?: boolean }} [options]
 */
export function fetchFigure(id, { src, fetch: fetchImpl = globalThis.fetch, signal, cache: useCache = true } = {}) {
  let parsed;
  try { parsed = parseFigureId(id); } catch (error) { return Promise.reject(error); }
  const { item, n } = parsed;
  if (useCache && cache.has(id)) { const hit = cache.get(id); cache.delete(id); cache.set(id, hit); return hit; }
  const order = src === 'hak' ? ['hak'] : src === 'kice' ? ['kice'] : ['kice', 'hak'];
  const work = (async () => {
    let last;
    for (const s of order) {
      try { return await fetchFrom(s, item, n, id, { fetch: fetchImpl, signal }); }
      catch (error) { if (error?.name === 'AbortError') throw error; last = error; }
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
export async function collectReferenceImages(ids, { count = 3, maxTries = 6, srcOf = () => undefined, fetch: fetchImpl, signal } = {}) {
  const out = { ids: [], images: [], failed: [] };
  const queue = [...new Set(ids.filter(Boolean))].slice(0, Math.max(count, maxTries));
  let i = 0;
  while (out.ids.length < count && i < queue.length) {
    const batch = queue.slice(i, i + (count - out.ids.length)); i += batch.length;
    const got = await Promise.allSettled(batch.map((id) => fetchFigure(id, { src: srcOf(id), fetch: fetchImpl, signal })));
    got.forEach((r, k) => {
      if (r.status === 'fulfilled') { out.ids.push(batch[k]); out.images.push(r.value); }
      else out.failed.push({ id: batch[k], reason: String(r.reason?.message || r.reason).slice(0, 200) });
    });
    if (signal?.aborted) break;
  }
  return out;
}

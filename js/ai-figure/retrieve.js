// 그림 엔진(1.8.0) 검색: 요청 → 비슷한 기출 그림 3장.
// 원본 image_generator pipeline/lib.cjs(classify·retrieve·parseJson·tags)를 「점수 매기기(AI 없음)」와 「AI 고르기」로 나눴다.
// 색인은 앱에 실린 assets/ai-figure/(tags.jsonl·tags-hak.jsonl·taxonomy.json)을 fetch로 읽는다(data/ai-figure/build-index.mjs).
import { classifyPrompt, pickReferencesPrompt } from './prompt.js';

export const HAK_PENALTY = 0.5;        // 같은 점수면 평가원 그림 우선
export const CANDIDATE_LIMIT = 24;     // AI에게 보여 줄 후보 수
export const PICK_COUNT = 3;           // 참고 그림 수
export const DEFAULT_INDEX_BASE = new URL('../../assets/ai-figure/', import.meta.url).href;

/** AI 응답에서 JSON 하나를 꺼낸다(코드 펜스·앞뒤 설명 글 허용). 꺼내지 못하면 오류. */
export function parseJson(text) {
  const t = String(text ?? '').replace(/```(json)?/gu, '');
  const s = Math.min(...['{', '['].map((c) => { const i = t.indexOf(c); return i < 0 ? 1e9 : i; }));
  const e = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (s === 1e9 || e < s) throw new SyntaxError('AI 응답에서 JSON을 찾지 못했습니다.');
  return JSON.parse(t.slice(s, e + 1));
}

/** parseJson과 같지만 실패하면 null. */
export function tryParseJson(text) {
  try { return parseJson(text); } catch { return null; }
}

/** 색인 한 파일(jsonl) → 꼬리표 배열. 깨진 줄은 건너뛰고, 줄마다 src('kice'|'hak')를 붙인다. */
export function parseTagLines(text, src) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    try { const j = JSON.parse(line); if (j && typeof j.id === 'string') out.push({ ...j, src }); } catch { /* 깨진 줄 무시 */ }
  }
  return out;
}

const indexCache = new Map();
/**
 * 검색 색인 불러오기(처음 한 번, 이후 캐시).
 * @returns {Promise<{ taxonomy: { types: string[], styles: string[] }, tags: object[], byId: Map<string, object> }>}
 */
export function loadFigureIndex({ fetch: fetchImpl = globalThis.fetch, base = DEFAULT_INDEX_BASE, includeHak = true } = {}) {
  const key = `${base}|${includeHak}`;
  if (indexCache.has(key)) return indexCache.get(key);
  const get = async (name, kind) => {
    const res = await fetchImpl(new URL(name, base).href);
    if (!res.ok) throw new Error(`그림 검색 색인을 불러오지 못했습니다(${res.status}): ${name}`);
    return kind === 'json' ? res.json() : res.text();
  };
  const loading = (async () => {
    const [taxonomy, kice, hak] = await Promise.all([
      get('taxonomy.json', 'json'),
      get('tags.jsonl', 'text'),
      includeHak ? get('tags-hak.jsonl', 'text').catch(() => '') : '',
    ]);
    return makeIndex({ taxonomy, tags: parseTagLines(kice, 'kice').concat(parseTagLines(hak, 'hak')) });
  })();
  indexCache.set(key, loading);
  loading.catch(() => indexCache.delete(key));   // 실패는 캐시하지 않음(다음에 다시 시도)
  return loading;
}

/** 이미 가진 자료로 색인 객체 만들기(검사·미리 읽은 자료용). */
export function makeIndex({ taxonomy = { types: [], styles: [] }, tags = [] } = {}) {
  return { taxonomy, tags, byId: new Map(tags.map((t) => [t.id, t])) };
}

const subjectGroup = (s) => String(s || '').replace(/[ⅠⅡ]/gu, '');
const itemOf = (id) => String(id).replace(/-\d+$/u, '');

/** 꼬리표 한 줄의 점수(AI 없음): 종류 순위·과목·검색어 겹침·연도·학평 감점. */
export function scoreTag(tag, classification) {
  const c = classification || {};
  const keywords = (c.keywords || []).map(String);
  let s = 0;
  const ti = (c.types || []).indexOf(tag.type); if (ti >= 0) s += 6 - ti * 2;
  if (c.subject) { if (tag.subject === c.subject) s += 2; else if (subjectGroup(tag.subject) === subjectGroup(c.subject)) s += 1; }
  const hay = (tag.tags || []).join(' ') + ' ' + (tag.desc || '');
  for (const k of keywords) if (k && hay.includes(k)) s += 1.5;
  s += ((Number(tag.year) || 2015) - 2015) * 0.02; // 최근 화풍을 조금 우대
  if (tag.src === 'hak') s -= HAK_PENALTY;
  return s;
}

/** 점수 상위 후보(같은 문항은 exclude로 뺌). 안정 정렬이라 같은 점수는 색인 순서(평가원 먼저). */
export function scoreCandidates(tags, classification, { exclude = [], limit = CANDIDATE_LIMIT } = {}) {
  const ex = new Set(exclude);
  return tags.filter((t) => !ex.has(itemOf(t.id)))
    .map((t) => ({ t, s: scoreTag(t, classification) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit);
}

/** AI가 고른 id를 후보 안의 것만 남기고, 모자라면 점수 순으로 채운다. */
export function fillPicks(aiPicks, scored, count = PICK_COUNT) {
  const ids = new Set(scored.map((x) => x.t.id));
  const picks = [];
  for (const id of Array.isArray(aiPicks) ? aiPicks : []) if (ids.has(id) && !picks.includes(id) && picks.length < count) picks.push(id);
  for (const x of scored) { if (picks.length >= count) break; if (!picks.includes(x.t.id)) picks.push(x.t.id); }
  return picks;
}

/** 요청 → 검색 조건. AI가 답을 못 주면 빈 조건(과목만 아는 대로)으로 이어 간다. */
export async function classify({ request, index, readText, subject = '' }) {
  const parsed = tryParseJson(await readText(classifyPrompt({ request, types: index.taxonomy.types || [] })));
  const c = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  return { subject: c.subject || subject || '', types: Array.isArray(c.types) ? c.types : [], keywords: Array.isArray(c.keywords) ? c.keywords : [] };
}

/**
 * 요청 → 참고 그림 3장. readText(prompt) => Promise<string>는 엔진이 넣어 준다(재시도·취소 포함).
 * 고르기 AI가 실패해도 점수 순으로 채워 돌려준다.
 */
export async function retrieve({ request, index, readText, exclude = [], subject = '' }) {
  const c = await classify({ request, index, readText, subject });
  const scored = scoreCandidates(index.tags, c, { exclude });
  if (!scored.length) return { classify: c, picks: [], candidates: [] };
  let aiPicks = [];
  try { aiPicks = tryParseJson(await readText(pickReferencesPrompt({ request, candidates: scored.map((x) => x.t) }))) || []; }
  catch (error) { if (error?.name === 'AbortError') throw error; }
  return { classify: c, picks: fillPicks(aiPicks, scored), candidates: scored.map((x) => ({ id: x.t.id, s: +x.s.toFixed(2), src: x.t.src })) };
}

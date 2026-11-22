// 그림 엔진(1.8.0) 한 장면 그리기: 비슷한 기출 3장 검색 → v2t로 그리기(기본 1장, 2장이면 AI가 고름) → 그림 안 설명 문장 지우기.
// 원본 image_generator pipeline/steps.cjs(makeFigure·pickBetter·stripText). 로컬 catalog/figs 대신 Worker에서 참고 그림을 받는다.
// 원칙: 실패로 끝내지 않는다 — 검색 실패면 참고 그림 없이, 고르기 실패면 첫 후보, 지우기 실패면 지우기 전 그림을 쓴다.
// 그리기 자체가 끝내 실패했을 때만 오류를 던지고, 앞 결과를 지키는 일은 index.js(makeFigureSet)가 맡는다.
import { buildFigurePrompt, sceneRequestText, SINGLE_SCENE_NOTE, PREV_SCENE_NOTE, pickBetterPrompt, STRIP_CHECK_PROMPT, stripRedrawPrompt } from './prompt.js';
import { retrieve, tryParseJson } from './retrieve.js';
import { collectReferenceImages } from './reference-images.js';

const isAbort = (error) => error?.name === 'AbortError';

/** 두 후보 중 나은 쪽(1 또는 2). AI가 답을 못 주면 1. */
export async function pickBetter(ctx, request, a, b, refImages = []) {
  try {
    const j = tryParseJson(await ctx.readText(pickBetterPrompt({ request }), [a, b, ...refImages.slice(0, 2)]));
    return { better: j?.better === 2 ? 2 : 1, why: typeof j?.why === 'string' ? j.why : '' };
  } catch (error) {
    if (isAbort(error)) throw error;
    return { better: 1, why: '', error: String(error?.message || error).slice(0, 200) };
  }
}

/** 그림 안 설명 문장·패널 이름표 지우기. 찾기·다시 그리기가 실패하면 원래 그림을 그대로 돌려준다. */
export async function stripText(ctx, img) {
  let found = [];
  try {
    const j = tryParseJson(await ctx.readText(STRIP_CHECK_PROMPT, [img]));
    found = j?.has && Array.isArray(j.texts) ? j.texts.map(String).filter(Boolean) : [];
  } catch (error) {
    if (isAbort(error)) throw error;
    return { img, found: [], error: String(error?.message || error).slice(0, 200) };
  }
  if (!found.length) return { img, found: [] };
  try {
    const out = await ctx.generateImage(stripRedrawPrompt(found), [img]);
    return { img: out, found };
  } catch (error) {
    if (isAbort(error)) throw error;
    return { img, found: [], error: String(error?.message || error).slice(0, 200) };
  }
}

/**
 * 한 장면 그리기.
 * @param {object} ctx  엔진이 만든 것: { readText(prompt, attachments) → 글, generateImage(prompt, attachments) → data URL, index, fetch, signal, log }
 * @param {{ request: string, subject?: string, keyValues?: string, bestOf?: number, prevScene?: string|null, single?: boolean, refIds?: string[], fixNote?: string, strip?: boolean }} opts
 */
// 실험(exp/1122-figure-tuning): userImages = 교사가 붙인 레퍼런스·손그림(data URL). 있으면 참고 기출보다 앞에 붙이고 역할을 지시문에 적는다.
// 지금 앱은 교사 첨부가 있으면 이 엔진 대신 옛 길로 보낸다(figureRoute user-references) — 엔진이 받을 때의 품질을 재 보려는 선택 옵션. 기본값(빈 배열)은 지금과 같다.
export const USER_IMAGE_NOTES = {
  reference: (n) => `\n\n[교사가 붙인 그림] 첨부의 처음 ${n}장은 교사가 직접 붙인 그림이다. 이 그림의 구성·물체·배치·라벨을 그대로 따르고, 뒤의 참고 기출은 선·회색·글자 화풍만 참고한다.`,
  sketch: (n) => `\n\n[교사의 손그림] 첨부의 처음 ${n}장은 교사가 손으로 대강 그린 밑그림이다. 비뚤어진 선·대강 쓴 글자는 깨끗한 평가원 선화로 바꾸되, 물체의 수·연결·위치 관계·라벨은 밑그림 그대로 따른다. 뒤의 참고 기출은 화풍만 참고한다.`,
};
export async function makeFigure(ctx, { request, subject = '', keyValues = '', bestOf = 1, prevScene = null, single = false, refIds = [], fixNote = '', strip = true, retrieval = null, refCount = 3, classifyMode = 'ai', aiPick = true, userImages = [], userImageRole = 'reference' }) {
  const log = ctx.log || (() => {});
  let ret = { classify: null, picks: [], candidates: [] };
  // retrieval: 엔진이 미리(구체화와 나란히) 시작해 둔 검색 프라미스. 없거나 실패하면 여기서 검색한다.
  try { ret = (retrieval ? await retrieval.catch((error) => { if (isAbort(error)) throw error; return null; }) : null) || await retrieve({ request, index: ctx.index, readText: (p) => ctx.readText(p), subject, classifyMode, aiPick }); }
  catch (error) { if (isAbort(error)) throw error; log('검색 실패 — 참고 그림 없이 그림: ' + (error?.message || error)); }

  const srcOf = (id) => ctx.index?.byId?.get(id)?.src;
  const order = [...refIds, ...ret.picks, ...ret.candidates.map((c) => c.id)];
  const got = await collectReferenceImages(order, { count: Math.max(0, Math.min(3, Number(refCount) || 0)), srcOf, fetch: ctx.fetch, signal: ctx.signal, ...(ctx.referenceTimeoutMs ? { timeoutMs: ctx.referenceTimeoutMs } : {}) });
  if (ctx.signal?.aborted) throw Object.assign(new Error('작업이 취소되었습니다.'), { name: 'AbortError' });
  const refs = got.ids, refImages = got.images;
  log('참고 기출: ' + (refs.join(', ') || '없음'));

  const req = sceneRequestText({ request, keyValues, fixNote });
  const users = Array.isArray(userImages) ? userImages.filter((u) => typeof u === 'string' && u.startsWith('data:image')) : [];
  const userNote = users.length ? (USER_IMAGE_NOTES[userImageRole] || USER_IMAGE_NOTES.reference)(users.length) : '';
  const text = buildFigurePrompt({ request: req, refs, retrieval: ret, subject: subject || ret.classify?.subject || '' }) + (single ? SINGLE_SCENE_NOTE : '') + userNote;
  const gen = () => prevScene
    ? ctx.generateImage(text + PREV_SCENE_NOTE, [prevScene, ...users, ...refImages])
    : ctx.generateImage(text, [...users, ...refImages]);

  const settled = await Promise.allSettled(Array.from({ length: Math.max(1, Math.min(2, Number(bestOf) || 1)) }, gen));
  const aborted = settled.find((r) => r.status === 'rejected' && isAbort(r.reason));
  if (aborted) throw aborted.reason;
  const cands = settled.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
  if (!cands.length) throw settled.find((r) => r.status === 'rejected')?.reason || new Error('그림을 받지 못했습니다.');
  log(`그림 ${cands.length}장 생성`);

  let best = cands[0];
  if (cands.length > 1) {
    const p = await pickBetter(ctx, request, cands[0], cands[1], refImages);
    log('고름: ' + p.better + (p.why ? ' — ' + p.why : ''));
    best = p.better === 2 ? cands[1] : cands[0];
  }
  const s = strip ? await stripText(ctx, best) : { img: best, found: [] };
  if (s.found.length) log('지운 설명: ' + s.found.join(' / '));
  return {
    image: s.img,
    refs,
    refFailures: got.failed,
    retrieval: ret,
    candidates: cands,
    strippedTexts: s.found,
    beforeStrip: s.found.length ? best : null,
    prompt: text,
  };
}

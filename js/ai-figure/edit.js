// 그림 엔진(1.8.0) 「이 그림 고치기」: 앞 결과 그림을 바탕으로 깔고 교사가 말한 곳만 바꾼다(시안 그림생성화면 태그 10~14).
// 단계: 고칠 곳 찾기(edit-find) → 그 부분 고치기(edit-apply) → 나머지 그대로 확인(edit-verify) → 마무리(edit-finish).
// 원칙(사용자 규칙): 실패로 끝내지 않는다 — 찾기·확인이 안 되면 지시 글만으로 고치고, 고친 그림이 지시를 놓치거나 다른 곳을 바꾸면
// 한 번 더 고치며, 그리기가 끝내 실패하거나 취소되면 앞 그림을 그대로 지킨 결과(kept)를 돌려준다. 던지지 않는다(입력이 잘못된 경우만 TypeError).
import { editFindPrompt, editDrawPrompt, editVerifyPrompt, editLocalVerifyPrompt, stripRedrawPrompt, editExtraNote } from './prompt.js';
import { tryParseJson } from './retrieve.js';
import { labelHintsAfterEdit } from './labels.js';

/** 로딩 창 4단계(화면이 칸 이름으로 그대로 쓴다). */
export const EDIT_PHASES = Object.freeze([
  Object.freeze({ phase: 'edit-find', step: 1, title: '고칠 곳 찾기' }),
  Object.freeze({ phase: 'edit-apply', step: 2, title: '그 부분 고치기' }),
  Object.freeze({ phase: 'edit-verify', step: 3, title: '나머지 그대로 확인' }),
  Object.freeze({ phase: 'edit-finish', step: 4, title: '마무리' }),
]);
const PHASE_BY_NAME = Object.fromEntries(EDIT_PHASES.map((p) => [p.phase, p]));
/** 결과에 남길 붙이기 기록(덩어리 상자는 붙인 것만 6개까지). */
const compactMerge = (m) => ({ used: !!m.used, ...(m.fallback ? { fallback: m.fallback } : {}), ...(m.failed ? { failed: true } : {}), ...(m.cover != null ? { cover: m.cover, keptBlobs: m.keptBlobs, align: m.align } : {}),
  ...(Array.isArray(m.blobs) ? { blobs: m.blobs.filter((b) => b.kept).slice(0, 6).map(({ x, y, w, h }) => [x, y, w, h]) } : {}) });

const isAbort = (error) => error?.name === 'AbortError';
const message = (error) => String(error?.message || error || '알 수 없는 오류').slice(0, 300);
const strings = (v, n = 8) => (Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, n) : []);

/** 지시 글로 짧은 요약(AI가 요약을 못 줄 때). 「T 라벨만 지워」 → 「T 라벨만 지워」(24자까지). */
export function editSummaryFallback(instruction) {
  const s = String(instruction ?? '').replace(/\s+/g, ' ').trim();
  return s.length > 24 ? s.slice(0, 23) + '…' : s;
}

/** 확인 결과가 쓸 만한지: 지시대로 바뀌었고 다른 곳은 안 바뀜. 확인을 못 했으면(null) 통과로 본다. */
const passes = (v) => !v || (v.done !== false && !(v.unwanted || []).length);
/** 두 시도 중 나은 쪽: 통과 > 지시 이행 > 원치 않은 변경이 적음. */
function better(a, b) {
  if (!b) return a;
  const score = (x) => (passes(x.verify) ? 1000 : 0) + (x.verify?.done !== false ? 100 : 0) - (x.verify?.unwanted?.length || 0);
  return score(b) > score(a) ? b : a;
}

/** 고칠 곳 찾기 답의 글자 고침 목록(ops)을 고른다: 상자가 0~1 안이고 글자가 있는 것만. 하나라도 이상하면 []. */
export function normalizeTextOps(ops) {
  if (!Array.isArray(ops) || !ops.length || ops.length > 12) return [];
  const out = [];
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
  for (const o of ops) {
    if (!o || typeof o !== 'object' || !['remove', 'replace'].includes(o.op)) return [];
    const text = String(o.text ?? '').trim();
    const to = String(o.to ?? '').trim();
    let [x, y, w, h] = ['x', 'y', 'w', 'h'].map((k) => num(o[k]));
    if (!text || text.length > 40 || (o.op === 'replace' && (!to || to.length > 40))) return [];
    if (![x, y, w, h].every((v) => v >= 0 && v <= 1) || !(w > 0 && h > 0) || w > 0.5 || h > 0.3) return [];
    w = Math.min(w, 1 - x); h = Math.min(h, 1 - y);
    out.push({ op: o.op, text, to: o.op === 'replace' ? to : '', kind: ['ko', 'en', 'qty', 'math'].includes(o.kind) ? o.kind : 'math', x, y, w, h });
  }
  return out;
}

/**
 * 앞 그림 고치기 한 번.
 * @param {object} ctx 엔진이 만든 것: { readText(prompt, attachments) → 글, generateImage(prompt, attachments) → data URL, signal, grayscale }
 * @param {{ previousPng: string, instruction: string, originalRequest?: string, subject?: string, previous?: object|null,
 *   sceneIndex?: number, verify?: boolean, maxAttempts?: number, onPhase?: (e: object) => void }} opts
 * @returns {Promise<object>} makeFigureSet과 같은 모양 { expanded, scenes, ok, aborted, errors } + { kind: 'edit', edit, labelHints }
 */
export async function runEdit(ctx, { previousPng, instruction, originalRequest = '', subject = '', previous = null, sceneIndex = 0, verify = true, maxAttempts = 2, onPhase = () => {}, skipFind = false, localText = true, localReplace = false,
  // 실험(E1, exp/1122-figure-tuning) — 기본값이면 지금과 같다: originalPng(처음 결과), region [x,y,w,h](0~1), regionPng(영역 표시 그림),
  // composite(영역 밖을 앞 그림 픽셀로 되돌리기 — ctx.composite(before, after, region)가 있어야 함)
  originalPng = null, region = null, regionPng = null, composite = false }) {
  const extras = [originalPng, regionPng].filter((u) => typeof u === 'string' && u.startsWith('data:image'));
  const note = editExtraNote({ hasOriginal: !!originalPng, region: Array.isArray(region) ? region : null, hasRegionImage: !!regionPng });
  const withBase = (img) => [img, ...extras];
  const signal = ctx.signal;
  const errors = [];
  const phase = (name, extra = {}) => { try { onPhase({ ...PHASE_BY_NAME[name], total: EDIT_PHASES.length, ...extra }); } catch { /* 화면 쪽 오류는 엔진을 멈추지 않음 */ } };
  const prevScene = previous?.scenes?.[sceneIndex] || {};
  const edit = { instruction, summary: editSummaryFallback(instruction), targets: [], keep: [], verify: null, attempts: 0, sceneIndex };
  const labelHints = labelHintsAfterEdit(originalRequest || prevScene.request || '', instruction);
  const base = { expanded: previous?.expanded ?? null, kind: 'edit', edit, labelHints, errors };
  const keptResult = (reason, aborted) => ({
    ...base,
    scenes: [{ ...prevScene, request: prevScene.request ?? originalRequest ?? null, image: previousPng, kept: true, error: reason, editedFrom: null }],
    ok: false,
    aborted,
  });
  const abortedNow = () => signal?.aborted;
  if (abortedNow()) return keptResult('취소됨', true);

  // 1. 고칠 곳 찾기 — 실패해도 지시 글만으로 고친다.
  let textOps = [];
  if (!skipFind) {
    phase('edit-find');
    try {
      const j = tryParseJson(await ctx.readText(editFindPrompt({ instruction, originalRequest }) + note, withBase(previousPng)));
      if (j && typeof j === 'object') {
        edit.targets = strings(j.targets);
        edit.keep = strings(j.keep, 12);
        if (typeof j.summary === 'string' && j.summary.trim()) edit.summary = j.summary.trim().slice(0, 24);
        if (j.mode === 'text') textOps = normalizeTextOps(j.ops);
        // CHATFIX(11-20): 고칠 곳을 찾지 못했으면(대상 0개·「확인 불가」) 고치지 않고 되묻는다. 그대로 고치면 빈 그림이
        // 「생성 결과 2」로 또 생겼다(CHATGEN 1절). 찾기 호출 자체가 실패한 경우(JSON 없음·오류)는 지금처럼 지시 글만으로 고친다.
        if (!edit.targets.length && !textOps.length) {
          edit.clarify = { ask: typeof j.ask === 'string' ? j.ask.trim().slice(0, 160) : '', summary: edit.summary };
          return { ...keptResult('고칠 곳을 찾지 못했습니다.', false), needsClarification: true };
        }
      }
    } catch (error) {
      if (isAbort(error) || abortedNow()) return keptResult('취소됨', true);
      errors.push({ scene: sceneIndex, step: 'edit-find', message: message(error) });
    }
  }

  // 1-1. GENSPEED(11-20): 글자만 지우는 고침은 그림을 다시 그리지 않고 그 자리 글자만 지운다(몇 초).
  //      확인에서 지시가 안 됐거나 다른 곳이 바뀌었으면 아래 그리기 길로 넘어간다(실패로 끝나지 않음).
  // 바꾸기(replace)는 기본으로 그리기 길: 새 글자 글꼴이 AI 그림 글꼴과 달라 보인다는 심사(11-20, 6건 중 4건 「5분 손질」).
  //  localReplace=true면 바꾸기도 로컬로(사용자가 정할 것 — 보고서 GENSPEED.md).
  if (!localReplace && textOps.some((o) => o.op === 'replace')) textOps = [];
  if (localText && textOps.length && typeof ctx.localEdit === 'function') {
    phase('edit-apply', { attempt: 1, local: true });
    let local = null;
    try { local = await ctx.localEdit(previousPng, textOps, { signal }); }
    catch (error) {
      if (isAbort(error) || abortedNow()) return keptResult('취소됨', true);
      errors.push({ scene: sceneIndex, step: 'edit-local', message: message(error) });
    }
    if (local?.applied && typeof local.image === 'string' && local.image.startsWith('data:image')) {
      let v = null;
      if (verify) {
        phase('edit-verify', { attempt: 1, local: true });
        try {
          // 고친 자리 둘레 조각이 있으면 그것으로(그림 전체로 물으면 먼 라벨이 사라졌다고 잘못 답하는 일이 있었음).
          const pair = local.crops?.before && local.crops?.after ? [local.crops.before, local.crops.after] : [previousPng, local.image];
          const prompt = local.crops?.before && local.crops?.after ? editLocalVerifyPrompt({ instruction }) : editVerifyPrompt({ instruction });
          const j = tryParseJson(await ctx.readText(prompt, pair));
          if (j && typeof j === 'object') v = { done: j.done !== false, unwanted: strings(j.unwanted), sentences: [] };
        } catch (error) {
          if (isAbort(error) || abortedNow()) return keptResult('취소됨', true);
          errors.push({ scene: sceneIndex, step: 'edit-verify', message: message(error) });
        }
      }
      if (passes(v)) {
        phase('edit-finish', { local: true });
        edit.attempts = 1;
        edit.local = { ops: textOps.map((o) => ({ op: o.op, text: o.text, to: o.to })) };
        edit.verify = v ? { ...v, passed: true } : { done: null, unwanted: [], sentences: [], passed: null, checked: false };
        const scene = {
          request: prevScene.request ?? originalRequest ?? '', image: local.image, refs: Array.isArray(prevScene.refs) ? prevScene.refs.slice() : [],
          strippedTexts: [], beforeStrip: null, prompt: '', grayscale: prevScene.grayscale ?? null,
          editedFrom: { sceneIndex, instruction, summary: edit.summary, local: true },
        };
        return { ...base, scenes: [scene], ok: true, aborted: false };
      }
      edit.localRejected = { verify: v };
    }
  }

  // 2·3. 그 부분 고치기 → 나머지 그대로 확인(안 맞으면 앞 그림을 바탕으로 한 번 더).
  // 11-23(⑫ 연속 고치기 누적 변화): composite가 켜져 있고 ctx.composite가 있으면 고친 그림에서 바뀐 덩어리만 앞 그림에 붙인다.
  // ctx.composite(before, after, region)는 dataUrl 또는 { image, stats }(makeEditMerge)를 돌려준다. 실패하면 고친 그림 그대로.
  const useMerge = !!composite && typeof ctx.composite === 'function';
  const mergeOnto = async (img) => {
    try {
      const out = await ctx.composite(previousPng, img, Array.isArray(region) ? region : null);
      if (typeof out === 'string' && out.startsWith('data:image')) return { image: out, stats: { used: out !== img } };
      if (out && typeof out.image === 'string' && out.image.startsWith('data:image')) return { image: out.image, stats: { used: out.image !== img, ...(out.stats || {}) } };
    } catch (error) {
      if (isAbort(error) || abortedNow()) throw error;
      errors.push({ scene: sceneIndex, step: 'edit-composite', message: message(error) });
    }
    return { image: img, stats: { used: false, failed: true } };
  };
  let best = null, fixNote = '', raw = null, mergeInfo = null;
  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
    phase('edit-apply', { attempt });
    const prompt = editDrawPrompt({ instruction, targets: edit.targets, keep: edit.keep, fixNote }) + note;
    let image;
    try {
      image = await ctx.generateImage(prompt, withBase(previousPng));
      raw = image; mergeInfo = null;
      if (useMerge) { const mr = await mergeOnto(image); image = mr.image; mergeInfo = mr.stats; }
    }
    catch (error) {
      if (isAbort(error) || abortedNow()) return keptResult('취소됨', true);
      errors.push({ scene: sceneIndex, step: 'edit-apply', message: message(error) });
      break; // 그리기 자체가(재시도까지) 안 되면 더 부르지 않는다 — 앞 시도나 앞 그림으로.
    }
    edit.attempts = attempt;
    let v = null;
    if (verify) {
      phase('edit-verify', { attempt });
      try {
        const j = tryParseJson(await ctx.readText(editVerifyPrompt({ instruction }), [previousPng, image]));
        if (j && typeof j === 'object') v = { done: j.done !== false, unwanted: strings(j.unwanted), sentences: strings(j.sentences) };
      } catch (error) {
        if (isAbort(error) || abortedNow()) return keptResult('취소됨', true);
        errors.push({ scene: sceneIndex, step: 'edit-verify', message: message(error) });
      }
    }
    // 11-23(⑫): 붙인 그림에서 지시가 안 보인다고 하면(덩어리를 잘못 버렸을 수 있음) 고친 그림 그대로를 한 번 더 확인해 그쪽이 되면 그것을 쓴다.
    if (verify && v && v.done === false && mergeInfo?.used && raw !== image) {
      try {
        const j = tryParseJson(await ctx.readText(editVerifyPrompt({ instruction }), [previousPng, raw]));
        if (j && typeof j === 'object' && j.done !== false) { v = { done: true, unwanted: strings(j.unwanted), sentences: strings(j.sentences) }; image = raw; mergeInfo = { ...mergeInfo, used: false, fallback: 'merge-lost-edit' }; }
      } catch (error) {
        if (isAbort(error) || abortedNow()) return keptResult('취소됨', true);
        errors.push({ scene: sceneIndex, step: 'edit-verify', message: message(error) });
      }
    }
    const tried = { image, prompt, verify: v, merge: mergeInfo };
    best = best ? better(best, tried) : tried;
    if (passes(v)) break;
    fixNote = [v.done === false ? `지시(「${instruction}」)가 반영되지 않았다.` : '', v.unwanted.length ? `지시하지 않은 곳이 바뀌었다: ${v.unwanted.join(', ')} — 첨부 그림과 똑같이 되돌린다.` : ''].filter(Boolean).join('\n');
  }
  if (!best) return keptResult(errors.at(-1)?.message || '그림을 고치지 못했습니다.', false);
  // CHATFIX(11-20): 모든 시도에서 확인이 「지시가 반영되지 않았다」(done: false)고 했으면 「둘 중 나은 쪽」을 결과로 붙이지 않는다 —
  // 앞 그림을 그대로 두고 화면이 「한 번 더 고치기·말 바꿔 다시 적기」를 묻는다. 원치 않은 곳만 바뀐 경우(done 참)는 지금처럼 나은 쪽을 쓴다.
  if (best.verify && best.verify.done === false) {
    edit.verify = { ...best.verify, passed: false };
    return { ...keptResult('말한 곳을 고치지 못했습니다.', false), editRejected: true };
  }
  edit.verify = best.verify ? { ...best.verify, passed: passes(best.verify) } : { done: null, unwanted: [], sentences: [], passed: null, checked: false };
  if (useMerge) edit.merge = best.merge ? compactMerge(best.merge) : { used: false };

  // 4. 마무리 — 새로 생긴 설명 문장 지우기(실패하면 그대로) → 흑백.
  phase('edit-finish');
  let image = best.image, strippedTexts = [], beforeStrip = null;
  const sentences = best.verify?.sentences || [];
  if (sentences.length) {
    try {
      let out = await ctx.generateImage(stripRedrawPrompt(sentences), [image]);
      // 문장 지우기도 그림 전체를 다시 그린다 — 붙이기를 쓰면 앞 그림 기준으로 한 번 더 붙인다(바뀐 덩어리만 남게).
      if (useMerge) { const mr = await mergeOnto(out); out = mr.image; edit.mergeStrip = mr.stats; }
      beforeStrip = image; image = out; strippedTexts = sentences;
    }
    catch (error) {
      if (isAbort(error) || abortedNow()) return keptResult('취소됨', true);
      errors.push({ scene: sceneIndex, step: 'edit-strip', message: message(error) });
    }
  }
  let gray = { applied: false, reason: 'skipped' };
  if (typeof ctx.grayscale === 'function') {
    try { const g = await ctx.grayscale(image, { signal }); image = g.data || image; gray = { applied: !!g.applied, reason: g.reason ?? null }; }
    catch (error) {
      if (isAbort(error) || abortedNow()) return keptResult('취소됨', true);
      gray = { applied: false, reason: message(error) };
    }
  }
  const scene = {
    request: prevScene.request ?? originalRequest ?? '',
    image,
    refs: Array.isArray(prevScene.refs) ? prevScene.refs.slice() : [],
    strippedTexts,
    beforeStrip,
    prompt: best.prompt,
    grayscale: gray,
    editedFrom: { sceneIndex, instruction, summary: edit.summary },
  };
  return { ...base, scenes: [scene], ok: true, aborted: false };
}

// ── 11-23(1.7.3 ⑫): 연속 고치기 누적 변화 막기 — 「바뀐 곳만 붙이기」 ──
// 그림 AI는 고칠 때마다 그림 전체를 다시 그려 선 위치·회색·글자 모양이 조금씩 달라지고, 고친 그림을 또 고치면 그 차이가 쌓였다
// (D1 원본 대비 3%→6%→13%→17%). 고친 그림을 앞 그림에 맞춰 정렬한 뒤, 「뜻 있게」 바뀐 덩어리(선이 생기거나 사라짐·진한 회색 변화)만
// 고친 그림에서 가져오고 나머지는 앞 그림 픽셀 그대로 둔다. 따라서 지시와 상관없는 곳은 몇 번을 고쳐도 원본 픽셀이 남는다.
// 픽셀만 다루는 순수 JS(브라우저 canvas·node pngjs 어느 쪽이든 RGBA만 주면 된다). 그림 해독·부호화는 makeEditMerge에 주입.

const grayOfRgba = ({ width: W, height: H, data: d }) => {
  const g = new Float32Array(W * H);
  for (let i = 0, k = 0; k < g.length; k++, i += 4) { const a = d[i + 3] / 255; g[k] = ((d[i] + d[i + 1] + d[i + 2]) / 3) * a + 255 * (1 - a); }
  return g;
};
const bilinear = (g, W, H, x, y) => {
  if (x < 0 || y < 0 || x > W - 1 || y > H - 1) return 255;
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), fx = x - x0, fy = y - y0;
  return g[y0 * W + x0] * (1 - fx) * (1 - fy) + g[y0 * W + x1] * fx * (1 - fy) + g[y1 * W + x0] * (1 - fx) * fy + g[y1 * W + x1] * fx * fy;
};
function resizeGray(g, W, H, w, h) {
  const o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o[y * w + x] = bilinear(g, W, H, (x + 0.5) * W / w - 0.5, (y + 0.5) * H / h - 0.5);
  return o;
}
function downGray(g, W, H, tw) {
  const f = W / tw, th = Math.max(1, Math.round(H / f)), o = new Float32Array(tw * th);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const x0 = Math.floor(x * f), x1 = Math.max(x0 + 1, Math.floor((x + 1) * f)), y0 = Math.floor(y * f), y1 = Math.max(y0 + 1, Math.floor((y + 1) * f));
    let s = 0, n = 0;
    for (let yy = y0; yy < Math.min(H, y1); yy++) for (let xx = x0; xx < Math.min(W, x1); xx++) { s += g[yy * W + xx]; n++; }
    o[y * tw + x] = n ? s / n : 255;
  }
  return { g: o, w: tw, h: th, f };
}
const inRegion = (fx, fy, r, pad = 0) => fx >= r[0] - pad && fx < r[0] + r[2] + pad && fy >= r[1] - pad && fy < r[1] + r[3] + pad;

/** after(before 크기로 늘린 회색)를 before에 맞추는 q = s·p + t. 두 단계(가로 128 → 384)로 찾는다. region 안(+3%)은 비교에서 뺀다. */
export function findEditAlign(gb, ga, W, H, region = null) {
  const level = (tw) => { const b = downGray(gb, W, H, tw), a = downGray(ga, W, H, tw); return { b, a, f: b.f }; };
  const score = (L, s, tx, ty, step = 1) => {
    const { b, a } = L; let sum = 0, n = 0;
    for (let y = 0; y < b.h; y += step) for (let x = 0; x < b.w; x += step) {
      if (region && inRegion(x / b.w, y / b.h, region, 0.03)) continue;
      const vb = b.g[y * b.w + x], va = bilinear(a.g, a.w, a.h, s * x + tx, s * y + ty);
      if (vb > 245 && va > 245) continue;
      sum += Math.abs(vb - va); n++;
    }
    return n ? sum / n : 1e9;
  };
  const L1 = level(128);
  let best = { s: 1, tx: 0, ty: 0, v: score(L1, 1, 0, 0, 2) };
  for (let s = 0.9; s <= 1.101; s += 0.02) for (let tx = -10; tx <= 10; tx++) for (let ty = -10; ty <= 10; ty++) {
    const cx = (1 - s) * L1.b.w / 2, cy = (1 - s) * L1.b.h / 2, v = score(L1, s, tx + cx, ty + cy, 2);
    if (v < best.v - 1e-9) best = { s, tx: tx + cx, ty: ty + cy, v };
  }
  const L2 = level(384), k = L1.f / L2.f;
  let b2 = { s: best.s, tx: best.tx * k, ty: best.ty * k, v: score(L2, best.s, best.tx * k, best.ty * k, 2) };
  for (const ds of [-0.01, 0, 0.01]) for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
    const s = best.s + ds, tx = best.tx * k + dx, ty = best.ty * k + dy, v = score(L2, s, tx, ty, 2);
    if (v < b2.v - 1e-9) b2 = { s, tx, ty, v };
  }
  // 그대로 두기(s=1, 이동 0)보다 뚜렷이(10% 넘게) 낫지 않으면 그대로 — 그릴 것이 적은 그림에서 엉뚱한 배율로 맞추는 일을 막는다.
  const id = score(L2, 1, 0, 0, 2);
  if (!(b2.v < id * 0.9)) return { s: 1, tx: 0, ty: 0, err: +id.toFixed(2) };
  return { s: b2.s, tx: b2.tx * L2.f, ty: b2.ty * L2.f, err: +b2.v.toFixed(2) };
}

/** 사각 창(반지름 r) 안 최솟값(가로·세로 따로, 단조 덱). */
function minFilter(g, W, H, r) {
  const tmp = new Float32Array(g.length), out = new Float32Array(g.length), q = new Int32Array(Math.max(W, H));
  const pass = (src, dst, len, count, at) => {
    for (let line = 0; line < count; line++) {
      let h = 0, t = 0;
      for (let i = 0; i < len + r; i++) {
        if (i < len) { const v = src[at(line, i)]; while (t > h && src[at(line, q[t - 1])] >= v) t--; q[t++] = i; }
        const c = i - r; if (c < 0) continue;
        while (q[h] < c - r) h++;
        dst[at(line, c)] = src[at(line, q[h])];
      }
    }
  };
  pass(g, tmp, W, H, (y, x) => y * W + x);
  pass(tmp, out, H, W, (x, y) => y * W + x);
  return out;
}

/** 사각 팽창(가로·세로 따로, 반지름 r). */
function dilateMask(src, W, H, r) {
  if (r <= 0) return src.slice();
  const tmp = new Uint8Array(src.length), out = new Uint8Array(src.length);
  for (let y = 0; y < H; y++) { let run = 0; const o = y * W; for (let x = 0; x < W + r; x++) { if (x < W && src[o + x]) run = 2 * r + 1; else if (run) run--; if (x - r >= 0 && run) tmp[o + x - r] = 1; } }
  for (let x = 0; x < W; x++) { let run = 0; for (let y = 0; y < H + r; y++) { if (y < H && tmp[y * W + x]) run = 2 * r + 1; else if (run) run--; if (y - r >= 0 && run) out[(y - r) * W + x] = 1; } }
  return out;
}
const erodeMask = (src, W, H, r) => { const inv = new Uint8Array(src.length); for (let k = 0; k < src.length; k++) inv[k] = src[k] ? 0 : 1; const d = dilateMask(inv, W, H, r); for (let k = 0; k < d.length; k++) d[k] = d[k] ? 0 : 1; return d; };
function boxBlur(m, W, H, r) {
  const tmp = new Float32Array(m.length), out = new Float32Array(m.length), n = 2 * r + 1;
  for (let y = 0; y < H; y++) { let s = 0; const o = y * W; for (let x = -r; x <= r; x++) s += m[o + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { tmp[o + x] = s / n; s += m[o + Math.min(W - 1, x + r + 1)] - m[o + Math.max(0, x - r)]; } }
  for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { out[y * W + x] = s / n; s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; } }
  return out;
}

/** 덩어리 나누기(4이웃). 덩어리마다 { n, seeds, x0, y0, x1, y1 } — seeds는 덩어리 안의 「바뀐 씨앗」 화소 수. */
function components(mask, seeds, W, H) {
  const lab = new Int32Array(W * H), list = [], stack = new Int32Array(W * H);
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p] || lab[p]) continue;
    const id = list.length + 1, c = { id, n: 0, seeds: 0, gone: 0, x0: W, y0: H, x1: 0, y1: 0 };
    let sp = 0; stack[sp++] = p; lab[p] = id;
    while (sp) {
      const q = stack[--sp], x = q % W, y = (q - x) / W;
      c.n++; if (seeds[q]) { c.seeds++; if (seeds[q] === 1) c.gone++; }
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      if (x > 0 && mask[q - 1] && !lab[q - 1]) { lab[q - 1] = id; stack[sp++] = q - 1; }
      if (x < W - 1 && mask[q + 1] && !lab[q + 1]) { lab[q + 1] = id; stack[sp++] = q + 1; }
      if (y > 0 && mask[q - W] && !lab[q - W]) { lab[q - W] = id; stack[sp++] = q - W; }
      if (y < H - 1 && mask[q + W] && !lab[q + W]) { lab[q + W] = id; stack[sp++] = q + W; }
    }
    list.push(c);
  }
  return { lab, list };
}

export const EDIT_MERGE_DEFAULTS = Object.freeze({ jitter: 0.007, strong: 140, strongJitter: 0.0025, edge: 0.006, lineAspect: 4, lineThin: 0.06, moveShare: 0.2, eraseShare: 0.8, tone: 24, group: 0.012, minSeeds: 0.00003, margin: 0.012, hardPad: 0.006, hardClose: 0.04, feather: 3, softLo: 10, softHi: 26, regionPad: 0.03, maxCover: 0.6 });

/**
 * 바뀐 곳만 붙이기(픽셀). before·after = { width, height, data(RGBA) }. after는 before 크기로 늘리고 정렬한 뒤 비교한다.
 * - 씨앗: 한쪽 그림의 회색이 상대 그림 둘레(jitter) 안에 tone 차이 안으로 없는 점(새로 생긴 선·사라진 선·진하게 바뀐 면). 선이 몇 px 떨린 것·옅은 면 색 변화는 씨앗이 아님.
 * - 씨앗을 group만큼 넓혀 덩어리로 묶고, 씨앗이 minSeeds(그림 넓이 비율)보다 적은 덩어리는 버린다(잡티).
 * - 남은 덩어리 안에서도 회색 차이가 softLo 아래면 앞 그림 그대로(같은 면의 미세한 색 바뀜으로 이음매가 생기지 않게), softHi 위면 고친 그림.
 *   단 「사라진 것」이 eraseShare 넘는 덩어리(지우기)는 고친 그림 그대로(옅은 회색 잔상 방지).
 * - 가늘고 긴 덩어리에서 사라진 선·생긴 선이 섞여 있으면(선을 몇 px 옮겨 다시 그림) 버린다. 그림 가장자리 띠(edge)는 보지 않는다.
 * - region([x,y,w,h] 0~1)이 있으면 그 밖(+regionPad)은 모두 앞 그림으로.
 * @returns {{ width, height, data: Uint8ClampedArray, stats: object }} 바뀐 덩어리가 없으면 stats.changed=false(앞 그림 그대로).
 */
export function mergeEditPixels(before, after, { region = null, ...o } = {}) {
  const P = { ...EDIT_MERGE_DEFAULTS, ...o };
  const W = before.width, H = before.height, N = W * H, S = Math.min(W, H);
  const gb = grayOfRgba(before);
  let ga = grayOfRgba(after);
  if (after.width !== W || after.height !== H) ga = resizeGray(ga, after.width, after.height, W, H);
  const T = findEditAlign(gb, ga, W, H, region);
  const wa = new Float32Array(N);
  for (let y = 0, k = 0; y < H; y++) for (let x = 0; x < W; x++, k++) wa[k] = bilinear(ga, W, H, T.s * x + T.tx, T.s * y + T.ty);
  // 씨앗: 한쪽에만 있는 잉크. 앞 그림의 진한 점 둘레 r 안에 고친 그림이 「그 점의 절반만큼이라도 진한」 점을 하나도 갖지 않으면 사라진 것(1),
  // 거꾸로면 생긴 것(2). 선이 r 안에서 떨리거나 조금 옅어지고·진해진 것, 회색 면이 조금 밝아진 것은 씨앗이 아니다.
  const r = Math.max(2, Math.round(S * P.jitter));
  const minB = minFilter(gb, W, H, r), minA = minFilter(wa, W, H, r); // 둘레 r 안 가장 진한 값
  // 진한 잉크가 하얗게 바뀌었거나 그 반대(차이 strong 넘음)는 좁은 둘레 r2로 본다 — 새 선 바로 곁에 남은 옛 화살촉, 무늬 위를 지나는 새 지시선을 놓치지 않게.
  const r2 = Math.max(1, Math.round(S * P.strongJitter));
  const minB2 = minFilter(gb, W, H, r2), minA2 = minFilter(wa, W, H, r2);
  const seed = new Uint8Array(N), edge = Math.max(2, Math.round(S * P.edge));
  for (let y = 0, k = 0; y < H; y++) for (let x = 0; x < W; x++, k++) {
    if (Math.abs(gb[k] - wa[k]) <= P.tone) continue;
    if (x < edge || y < edge || x >= W - edge || y >= H - edge) continue; // 그림 가장자리 띠(AI가 테두리에 남기는 얼룩)
    const strong = Math.abs(gb[k] - wa[k]) > P.strong;
    if (gb[k] < wa[k]) { if ((strong ? minA2[k] : minA[k]) > (gb[k] + 255) / 2) seed[k] = 1; } // 앞 그림에만 있음(사라짐)
    else if ((strong ? minB2[k] : minB[k]) > (wa[k] + 255) / 2) seed[k] = 2; // 고친 그림에만 있음(생김)
  }
  if (region) for (let y = 0, k = 0; y < H; y++) for (let x = 0; x < W; x++, k++) if (seed[k] && !inRegion(x / W, y / H, region, P.regionPad)) seed[k] = 0;
  const grouped = dilateMask(seed, W, H, Math.max(3, Math.round(S * P.group)));
  const { lab, list } = components(grouped, seed, W, H);
  const minSeeds = Math.max(30, Math.round(N * P.minSeeds));
  const keep = new Uint8Array(list.length + 1); // 0 버림 · 1 붙임(옅은 차이는 앞 그림) · 2 붙임(지우기 덩어리 — 고친 그림 그대로, 옅은 회색 잔상이 남지 않게)
  const blobs = [];
  for (const c of list) {
    // 선이 옮겨 그려진 것: 가늘고 긴 덩어리에서 사라진 선과 생긴 선이 비슷하게 섞임 → 지시와 상관없는 흔들림으로 보고 버린다.
    const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1, thin = Math.min(bw, bh), aspect = Math.max(bw, bh) / thin;
    const share = c.seeds ? c.gone / c.seeds : 0;
    const moved = aspect >= P.lineAspect && thin <= S * P.lineThin && share >= P.moveShare && share <= 1 - P.moveShare;
    const ok = c.seeds >= minSeeds && !moved;
    keep[c.id] = ok ? (share >= P.eraseShare ? 2 : 1) : 0;
    blobs.push({ gone: +share.toFixed(2), moved, x: +(c.x0 / W).toFixed(3), y: +(c.y0 / H).toFixed(3), w: +((c.x1 - c.x0 + 1) / W).toFixed(3), h: +((c.y1 - c.y0 + 1) / H).toFixed(3), seeds: c.seeds, kept: ok });
  }
  let m = new Uint8Array(N), hard = new Uint8Array(N), cover = 0;
  for (let k = 0; k < N; k++) if (lab[k] && keep[lab[k]]) { m[k] = 1; if (keep[lab[k]] === 2 && seed[k] === 1) hard[k] = 1; }
  // 붙일 곳은 덩어리보다 margin만큼 넓게(지운 화살촉 끝처럼 새 선 곁에 붙어 씨앗이 안 된 것까지) — 그 안에서도 옅은 차이는 앞 그림이 남는다.
  m = dilateMask(m, W, H, Math.max(1, Math.round(S * P.margin)));
  // 지우기 덩어리는 「사라진 잉크」 곁만 고친 그림 그대로(덩어리 전체를 바꾸면 곁의 받침대 같은 것이 고친 그림 모양으로 섞여 이음매가 생김).
  //  사라진 물체 속(옅은 회색 몸통)도 잔상 없이: 사라진 잉크를 닫기(팽창 → 침식)로 메운 뒤 hardPad만큼 넓힌다.
  const close = Math.max(2, Math.round(S * P.hardClose));
  hard = dilateMask(erodeMask(dilateMask(hard, W, H, close), W, H, close), W, H, Math.max(2, Math.round(S * P.hardPad)));
  if (region) for (let y = 0, k = 0; y < H; y++) for (let x = 0; x < W; x++, k++) if (m[k] && !inRegion(x / W, y / H, region, P.regionPad)) m[k] = 0;
  for (let k = 0; k < N; k++) cover += m[k];
  const stats = { align: { s: +T.s.toFixed(3), tx: +T.tx.toFixed(1), ty: +T.ty.toFixed(1), err: T.err }, blobs: blobs.sort((a, b) => b.seeds - a.seeds).slice(0, 12), keptBlobs: blobs.filter((b) => b.kept).length, cover: +(cover / N).toFixed(4), changed: cover > 0 };
  const out = new Uint8ClampedArray(N * 4);
  const mf = boxBlur(Float32Array.from(m), W, H, P.feather), hf = boxBlur(Float32Array.from(hard), W, H, P.feather);
  for (let k = 0, i = 0; k < N; k++, i += 4) {
    const d = Math.abs(gb[k] - wa[k]);
    const soft = d <= P.softLo ? 0 : d >= P.softHi ? 1 : (d - P.softLo) / (P.softHi - P.softLo);
    const w = mf[k] * Math.max(soft, hf[k]);
    const v = Math.round(gb[k] * (1 - w) + wa[k] * w);
    out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255;
  }
  return { width: W, height: H, data: out, stats };
}

/**
 * 엔진 createEngine({ composite })에 넣을 「바뀐 곳만 붙이기」. decode(dataUrl) → { width, height, data(RGBA) }, encode(rgba) → dataUrl(PNG).
 * 돌려주는 함수: (beforeUrl, afterUrl, region) → { image, stats }. 바뀐 덩어리가 없거나 거의 전체가 바뀌었으면 image는 고친 그림 그대로(stats.used=false).
 */
export function makeEditMerge({ decode, encode, ...opts } = {}) {
  if (typeof decode !== 'function' || typeof encode !== 'function') throw new TypeError('makeEditMerge에는 decode·encode가 필요합니다.');
  return async (beforeUrl, afterUrl, region = null) => {
    const [b, a] = await Promise.all([decode(beforeUrl), decode(afterUrl)]);
    const r = mergeEditPixels(b, a, { region: Array.isArray(region) ? region : null, ...opts });
    const maxCover = opts.maxCover ?? EDIT_MERGE_DEFAULTS.maxCover;
    if (!r.stats.changed || r.stats.cover > maxCover) return { image: afterUrl, stats: { ...r.stats, used: false } };
    return { image: await encode(r), stats: { ...r.stats, used: true } };
  };
}

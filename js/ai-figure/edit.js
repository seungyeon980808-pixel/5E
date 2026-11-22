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
  let best = null, fixNote = '';
  for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
    phase('edit-apply', { attempt });
    const prompt = editDrawPrompt({ instruction, targets: edit.targets, keep: edit.keep, fixNote }) + note;
    let image;
    try {
      image = await ctx.generateImage(prompt, withBase(previousPng));
      if (composite && typeof ctx.composite === 'function') { try { image = await ctx.composite(previousPng, image, Array.isArray(region) ? region : null) || image; } catch (error) { errors.push({ scene: sceneIndex, step: 'edit-composite', message: message(error) }); } }
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
    const tried = { image, prompt, verify: v };
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

  // 4. 마무리 — 새로 생긴 설명 문장 지우기(실패하면 그대로) → 흑백.
  phase('edit-finish');
  let image = best.image, strippedTexts = [], beforeStrip = null;
  const sentences = best.verify?.sentences || [];
  if (sentences.length) {
    try { const out = await ctx.generateImage(stripRedrawPrompt(sentences), [image]); beforeStrip = image; image = out; strippedTexts = sentences; }
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

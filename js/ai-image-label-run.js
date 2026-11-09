import { buildSourceTracingPrompt, SOURCE_TRACING_CONTRACT_VERSION } from './ai-source-tracing-contract.js?v=1.7.0-four-session-integration';
import { normalizeImageLabelWorkflow, IMAGE_EMPHASIS_REMOVAL_CONTRACT } from './ai-image-label-workflow.js?v=1.7.0-four-session-integration';
import { removeExamLabelsFromDataUrl } from './ai-exam-label-removal.js?v=1.7.0-four-session-integration';
import { resolveGeneratedRaster } from './ai-raster-output.js?v=1.7.0-four-session-integration';
import { createEditableLabelComposite } from './ai-label-composite.js?v=1.7.0-four-session-integration';
import { APPROVED_FIRST_PROMPT, approvedFirstRequestText } from './ai-approved-first-png.js?v=1.7.0-four-session-integration';
import { encodeScopedPng } from './ai-scoped-edit-png.js?v=1.7.0-four-session-integration';
import { validateLabelTargetPlacement, bindLabelTargetPlacement } from './ai-label-target-placement.js?v=1.7.0-four-session-integration';
import { buildExactOutputCacheDescriptor, createExactOutputCacheKey } from './ai-remote-input-plan.js?v=1.7.0-four-session-integration';
import { enforceImageLabelAcceptance } from './ai-image-review.js?v=1.7.0-four-session-integration';
import { STYLE_CONTRACT_VERSION } from './ai-image-style-contract.js?v=1.7.0-four-session-integration';
import { SOURCE_OBSERVATION_VERSION, SOURCE_LEADER_OBSERVATION_VERSION, SOURCE_OBSERVATION_CONTRACT_REVISION } from './ai-source-observation-wire.js?v=1.7.0-four-session-integration';
import { prepareJointLabelVerification, retainFinalVerification } from './ai-label-verification.js?v=1.7.0-four-session-integration';
import { SOURCE_LABEL_POLICY_VERSION } from './ai-editable-image-labels.js?v=1.7.0-four-session-integration';
import { externalLabelDraftIds } from './ai-label-review-draft.js?v=1.7.0-four-session-integration';
import { imageLabelBackgroundContract, resolveImageLabelBackground } from './ai-label-background.js?v=1.7.0-four-session-integration';
import { fitCandidateToSource, measureSourceLabelHeights } from './ai-label-reframe.js?v=1.7.0-four-session-integration';
import { nativePresentationForLabelTypography, presentationRoleFor, prepareEditableLabelFonts } from './ai-label-typography.js?v=1.7.0-four-session-integration';

export const IMAGE_LABEL_RUN_VERSION = '1.6.1';
export const IMAGE_LABEL_GENERATION_HARNESS = 'rhwp-approved-first-v1';
// 검사(test-rhwp-labeler-harness)가 첫 요청 본문을 그대로 재구성할 수 있게 내보낸다.
export function selectedMarkInstructions(workflow) {
  return [
    workflow.scientificArrows === 'remove'
      ? '사용자가 화살표 제거를 켰습니다. 이번 작업의 기본 표시선 선택을 대체하여 과학적 힘·운동·혈류·전류 화살표도 제거하세요. 실제 관·혈관·도선·물체 윤곽·눈금은 보존하세요.' : '',
    workflow.auxiliaryMarks === 'keep'
      ? '사용자가 보조선 제거를 껐습니다. 이번 작업의 기타 보조선은 유지하세요. 라벨 글자와 그 글자에 소속된 설명 지시선·끝점은 계속 함께 제거하세요.' : '',
    IMAGE_EMPHASIS_REMOVAL_CONTRACT,
    workflow.imageKind === 'general' ? TEXTBOOK_OBJECT_ONLY_CONTRACT : '',
  ].filter(Boolean).join('\n');
}
// 11-09 사용자 결정: 교과서(일반) 그림은 평가원 스타일로 새로 그리되 주인공 물체만 남긴다.
export const TEXTBOOK_OBJECT_ONLY_CONTRACT = '교과서 그림 정리: 그림의 주인공 물체(예: 암석, 기관, 실험 기구, 지구본, 밧줄 파동)와 그 물체에 딸린 과학 표시(진행·진동·힘·운동·전류 방향 화살표, 파장·진폭 같은 치수선, 중심선·눈금)는 평가원 선화로 남긴다(화살표·보조선 설정이 지우라고 한 것만 지운다). 색 상자 안의 제목 딱지(예: 「화산암」), 쪽·그림 번호와 캡션, 배경 띠·색 줄·배경 면·배경 삽화, 그림과 그림 사이의 순서·변화를 가리키는 안내 화살표(예: 원래 암석 → 변성암), 말풍선과 그 안의 글, 캐릭터(그림 밖에서 설명하거나 말을 거는 안내 마스코트: 로봇·사람·동물 캐릭터), 그림 테두리·둥근 판·장식은 모두 지우고 그 자리는 흰 바탕으로 둔다. 장면 안에서 과학 현상에 참여하는 생물·물체(예: 물결 위에 뜬 개구리·나뭇잎, 실험하는 손, 관찰 대상 동물)는 캐릭터가 아니라 주인공 물체로 남긴다. 지운 자리에 흰 네모나 빈 상자를 남기지 않는다. 남은 물체의 크기·위치·간격은 원본 그대로 둔다. 물체 이름 글자도 그림에서 지운다(편집 라벨로 따로 복원된다).';
const clone = value => structuredClone(value);
// 11-08: 캔버스에 넣을 때도 라벨 크기를 원본에 맞춘다 — 원본 그림 픽셀에서 잰 글자 높이로 글자 크기(그림 높이에 대한 비율)를 정한다.
// 한글 글자는 글자 크기의 약 0.88, 영어 대문자·숫자는 약 0.72, 그 밖은 0.8 높이(한글에 넣기와 같은 셈).
export async function measuredLabelSizeRatio(sourceDataUrl, labels = [], signal) {
  let measured = [];
  try { measured = await measureSourceLabelHeights({ sourceDataUrl, labels, signal }); } catch (error) { if (error?.name === 'AbortError') throw error; }
  const glyph = new Map(measured.map(m => [m.id, m.h]));
  // 여러 줄 라벨은 잰 한 줄 높이만 쓴다(상자 높이는 여러 줄 합이라 쓰지 않음).
  const sizes = labels.filter(l => glyph.get(l.id) > 0 || !String(l.text).includes('\n') && l.typography?.bounds?.h > 0).map(l => {
    const h = glyph.get(l.id) || l.typography.bounds.h;
    return h / (/[가-힣]/.test(l.text) ? .88 : /^[A-Z0-9]+$/.test(String(l.text).trim()) ? .72 : .8);
  }).sort((a, b) => a - b);
  // 11-09: 짝수 개일 때 가운데 두 값 중 큰 쪽을 써서, AI가 두 줄 글자를 한 줄로 준 라벨 하나(「매질의 진동 방향」: 두 줄과
  // 옆 물결 바탕까지 이어져 0.105로 재짐)가 그림의 모든 라벨을 두 배 넘게 키웠다(교과서 tb04 0.119).
  // 잘못 재지는 쪽은 거의 늘 「크게」라서 작은 쪽을 쓴다. 홀수 개면 지금처럼 가운데 값.
  return sizes.length ? sizes[Math.floor((sizes.length - 1) / 2)] : null;
}
// 11-09 라벨 안정화(규칙 5 「라벨 글자 크기는 원본 글자 높이의 ±15%, 원본에서 같은 크기면 같은 크기」):
// 그림 전체에 한 크기를 쓰면 원본에서 크기가 다른 글자(손 X선 「뼈 촬영」 29px·「A: X선」 36px)가 같은 크기가 되고,
// 넣을 때의 하한(1.8mm) 때문에 작게 넣은 그림의 라벨이 원본보다 1.2~1.6배 커졌다(교과서 tb02·tb05 실측).
// 라벨마다 원본에서 잰 첫 줄 높이를, 그 라벨을 그릴 글꼴의 실제 글자 높이 비(캔버스 측정)로 나눠 글자 크기(그림 높이 대비)를 정한다.
// 크게 잘못 재진 것(두 줄을 한 줄로 받음 등, 가운데 값의 1.8배 넘음·0.55배 아래)은 가운데 값으로, 10% 안인 것끼리는 같은 크기로 맞춘다.
let inkMeasureContext = null;
function labelInkPerEm(text, font) {
  if (typeof document === 'undefined' || !text) return null;
  try {
    inkMeasureContext ||= document.createElement('canvas').getContext('2d');
    inkMeasureContext.font = `${font.italic ? 'italic ' : ''}${font.fontWeight || 'normal'} 200px ${font.fontFamily}`;
    const m = inkMeasureContext.measureText(text);
    const h = (m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0);
    return h > 20 ? h / 200 : null;
  } catch { return null; }
}
export async function measuredLabelSizes(sourceDataUrl, labels = [], signal) {
  let measured = [];
  try { measured = await measureSourceLabelHeights({ sourceDataUrl, labels, signal }); } catch (error) { if (error?.name === 'AbortError') throw error; }
  try { await prepareEditableLabelFonts(labels); } catch {}
  const glyph = new Map(measured.map(m => [m.id, m.h])), raw = [];
  for (const label of labels) {
    const h = glyph.get(label.id) || (!String(label.text).includes('\n') && label.typography?.bounds?.h > 0 ? label.typography.bounds.h : 0);
    if (!(h > 0)) continue;
    const first = String(label.text).split('\n')[0].trim();
    const hangul = /[가-힣]/.test(first);
    const font = nativePresentationForLabelTypography({ role: hangul ? 'text' : presentationRoleFor(label.typography?.role, label.text) });
    const k = labelInkPerEm(first, font) ?? (hangul ? .88 : /^[A-Z0-9]+$/.test(first) ? .72 : .8);
    raw.push({ id: label.id, size: h / k });
  }
  if (!raw.length) return { ratio: null, sizes: new Map() };
  const sorted = raw.map(r => r.size).sort((a, b) => a - b), median = sorted[Math.floor((sorted.length - 1) / 2)];
  const usable = raw.map(r => ({ ...r, size: r.size > median * 1.8 || r.size < median * .55 ? median : r.size })).sort((a, b) => a.size - b.size);
  const groups = [];
  for (const r of usable) { const g = groups.at(-1); if (g && r.size <= g[0].size * 1.1) g.push(r); else groups.push([r]); }
  const sizes = new Map();
  for (const g of groups) { const s = g.map(r => r.size); const m = s[Math.floor((s.length - 1) / 2)]; for (const r of g) sizes.set(r.id, m); }
  return { ratio: median, sizes };
}
// 11-09 라벨 안정화: 기출 제거에서 실제 글자 잉크로 다시 찾아 지운 글자 라벨은 그 글자 자리(가운데·상자)를 원본 자리로 쓴다
// (AI가 준 자리는 반 글자쯤 비켜 있곤 했다 — 지운 자리와 라벨 자리가 어긋나지 않게, 글자 크기도 이 상자로 잰다). 지시선 라벨은 그대로.
export function labelsAtMeasuredGlyphs(labels = [], searches = []) {
  const glyphOf = new Map((searches || []).filter(s => s?.glyphBounds).map(s => [s.labelId, s.glyphBounds]));
  return labels.map(label => {
    const g = glyphOf.get(label.id);
    if (!g || label.mode !== 'text') return label;
    const center = { x: g.x + g.w / 2, y: g.y + g.h / 2 };
    return { ...label, position: center, anchor: { ...center }, typography: { ...(label.typography || {}), bounds: { ...g } } };
  });
}
const withLabelSizes = (labels, sizes) => (labels || []).map(label => sizes?.has(label.id) ? { ...label, measuredSize: sizes.get(label.id) } : label);
const cancelled = signal => { if (signal?.aborted) throw new DOMException('작업이 취소되었습니다.', 'AbortError'); };
// 11-09 사용자 원칙: AI 변환(이미지·그래프)은 어떤 경우에도 「실패」로 끝나면 안 된다.
// 응답이 없거나 오류가 나면 같은 요청을 자동으로 다시 보내고(시도마다 응답 없음 시간 제한), 두 번째 시도부터는 Luna로 바꿔 보낸다.
// (11-09 실제 기록: Sol 6.1 그림 생성이 「첨부 이미지 경로에 접근할 수 없어…」로 두 번 연달아 실패하고 Luna는 한 번에 그렸다.)
// 사용자가 취소한 경우(signal)만 바로 멈춘다. 실패한 시도는 단계·모델·오류·걸린 시간을 onFailure로 남긴다.
export const AI_RETRY_FALLBACK_MODEL = 'gpt-6-luna';
export const AI_RETRY_POLICY = Object.freeze({ attempts: 3, backoffMs: [2000, 5000],
  analysisTimeoutMs: [180000, 180000, 0], generationTimeoutMs: [240000, 240000, 0] });
const waitMs = (ms, signal) => new Promise((resolve, reject) => {
  if (!(ms > 0)) { resolve(); return; }
  const onAbort = () => { clearTimeout(timer); reject(new DOMException('작업이 취소되었습니다.', 'AbortError')); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
  signal?.addEventListener('abort', onAbort, { once: true });
});
export async function runAiWithRetry({ stage, selection = {}, attempts = AI_RETRY_POLICY.attempts, timeoutsMs = [], backoffMs = AI_RETRY_POLICY.backoffMs,
  run, cancel, signal, onFailure = () => {}, onRetry = () => {} } = {}) {
  const total = Math.max(1, Math.floor(Number(attempts)) || 1);
  let lastError = null;
  for (let attempt = 1; attempt <= total; attempt++) {
    cancelled(signal);
    const fallback = total > 1 && attempt >= 2;
    const choice = fallback ? { ...selection, model: AI_RETRY_FALLBACK_MODEL, effort: 'medium' } : selection;
    const startedAt = Date.now(), limit = Number(timeoutsMs[attempt - 1]) || 0;
    let timer = null;
    try {
      const work = Promise.resolve().then(() => run(choice, attempt));
      if (!(limit > 0)) return await work;
      return await Promise.race([work, new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`AI 응답 없음 ${Math.round(limit / 1000)}초`); error.code = 'AI_NO_RESPONSE';
          try { cancel?.(); } catch {}
          reject(error);
        }, limit);
      })]);
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      const record = { stage, attempt, attempts: total, model: choice.model || null, effort: choice.effort || null, code: error?.code || null,
        message: String(error?.message || error).slice(0, 400), elapsedMs: Date.now() - startedAt, at: new Date().toISOString() };
      try { onFailure(record); } catch {}
      if (attempt < total) {
        await waitMs(backoffMs[attempt - 1] ?? backoffMs.at(-1) ?? 0, signal);
        try { onRetry({ ...record, nextAttempt: attempt + 1, nextModel: AI_RETRY_FALLBACK_MODEL, switchedModel: selection.model !== AI_RETRY_FALLBACK_MODEL }); } catch {}
      }
    } finally { clearTimeout(timer); }
  }
  if (lastError && typeof lastError === 'object') lastError.aiAttempts = total;
  throw lastError;
}
// 11-09: 작업 칸 여러 개가 동시에 변환해도 AI에는 한 번에 하나씩 보낸다(줄 세우기). 기다리는 칸은 onWait(앞에 남은 수)로 「차례 기다리는 중」을 띄운다.
export const AI_CONVERSION_CONCURRENCY = 1;
const conversionQueue = [];
let conversionsRunning = 0;
const pumpConversionQueue = () => {
  while (conversionsRunning < AI_CONVERSION_CONCURRENCY && conversionQueue.length) { conversionsRunning++; conversionQueue.shift().grant(); }
  conversionQueue.forEach((entry, index) => { try { entry.onWait?.(index + 1); } catch {} });
};
export function acquireAiConversionSlot({ signal, onWait } = {}) {
  cancelled(signal);
  return new Promise((resolve, reject) => {
    let released = false;
    const release = () => { if (released) return; released = true; conversionsRunning = Math.max(0, conversionsRunning - 1); pumpConversionQueue(); };
    const onAbort = () => {
      const index = conversionQueue.indexOf(entry);
      if (index >= 0) conversionQueue.splice(index, 1);
      reject(new DOMException('작업이 취소되었습니다.', 'AbortError'));
      pumpConversionQueue();
    };
    const entry = { onWait, grant: () => { signal?.removeEventListener('abort', onAbort); resolve(release); } };
    signal?.addEventListener('abort', onAbort, { once: true });
    conversionQueue.push(entry);
    pumpConversionQueue();
  });
}
// 11-09: 라벨별 제거 결과가 계획·마스크와 맞지 않으면 실패로 끝내지 않고 원본을 쓰기 위해, 맞지 않는 이유만 돌려준다(맞으면 '').
function examRemovalBindingProblem({ plan, report, sourceFrame }) {
  const ids = report.removedLabelIds || [];
  if (new Set(ids).size !== ids.length || ids.some(id => !plan.labels.some(label =>
    label.id === id && label.scope === 'general' && label.sourceRef === 1 && !label.ownershipReviewRequired))
    || report.deferredLabels?.some(label => ids.includes(label.labelId))) return '라벨별 제거 결과와 원본 계획의 소속이 다릅니다.';
  const mask = report.removalMasks;
  if (mask?.version !== 1 || mask.coordinateSpace !== 'source-pixels' || !Array.isArray(mask.regions)
    || sourceFrame?.width && (mask.width !== sourceFrame.width || mask.height !== sourceFrame.height)
    || ids.some(id => !mask.regions.some(region => region.labelId === id && region.component === 'text'))) return '완료된 라벨의 실제 제거 마스크를 확인할 수 없습니다.';
  return '';
}
export const imageLabelDigest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
const imageFrame = async (dataUrl, signal) => {
  // The browser owns decoding; headless controller unit tests have no Image.
  if (typeof Image === 'undefined') return null;
  const image = await new Promise((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('이미지 원본 크기를 확인하지 못했습니다.')); img.src = dataUrl;
  });
  cancelled(signal);
  if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) throw new Error('이미지 원본 크기가 올바르지 않습니다.');
  return { width: image.naturalWidth, height: image.naturalHeight, coordinateSystem: 'normalized-0-1' };
};

/** Isolated image turn: one tool execution, no unsolicited replacement or retry. */
export function createImageLabelRasterController({ transport, timeoutMs = 600000 } = {}) {
  let active = null;
  const retired = new Set();
  const interrupt = r => {
    if (!r.turnId && !r.threadId) { r.interruptPending = true; return; }
    if (r.interrupted) return;
    r.interrupted = true;
    void Promise.resolve().then(() => transport.interrupt?.({ turnId: r.turnId, threadId: r.threadId })).catch(() => {});
  };
  const finish = (r, error) => {
    if (r.done) return;
    r.done = true; clearTimeout(r.timer);
    if (r.turnId) retired.add(r.turnId);
    if (r.threadId) retired.add(r.threadId);
    if (error) r.reject(error);
    else r.resolve({ src: r.src, rendererPrompt: r.rendererPrompt, imageToolCalls: Math.max(r.started, r.images) });
  };
  const route = (r, e) => {
    if (r.done) return;
    const seen = e.kind === 'progress' ? r.startedIds : e.kind === 'image' ? r.imageIds : null;
    if (seen && e.itemId) { if (seen.has(e.itemId)) return; seen.add(e.itemId); }
    if (e.kind === 'progress' && ++r.started > 1 || e.kind === 'image' && ++r.images > 1) {
      interrupt(r);
      return finish(r, new Error('한 번의 이미지 처리에서 추가 생성이 감지되어 중단했습니다.'));
    }
    if (e.kind === 'image') { r.src = e.src; r.rendererPrompt = e.rendererPrompt || ''; }
    // 11-09: 그림 없이 글로만 끝난 차례는 AI가 남긴 말을 실패 원인으로 기록한다(예: 「첨부 이미지 경로에 생성 도구가 접근할 수 없어…」).
    if (e.kind === 'assistant' && e.text) r.text = String(e.text);
    if (e.kind === 'assistant' && /usage.?limit|rate.?limit|quota|사용량\s*제한|한도\s*(초과|제한)|429/i.test(e.text || '')) {
      r.failureMessage = '이미지 생성이 계정 사용량 제한으로 거절되었습니다. 크레딧 잔여 여부와 별도로 이미지 생성 이용 상태를 확인해 주세요.';
    }
    if (e.kind === 'error') finish(r, new Error(e.text || '이미지 처리 오류'));
    // 데스크톱 앱은 그림이 나오면 차례를 스스로 끊고 「interrupted」를 보내거나 끝 확인(finalization)만 보낸다 — 그림을 받았으면 성공(H13).
    // 사용자가 취소한 경우는 cancel()이 먼저 끝내므로 여기까지 오지 않는다(ai-panel.resolveAiTerminalOutcome과 같은 규칙).
    if (e.kind === 'finalization' && ['confirmed', 'recovered'].includes(e.state) && r.src) finish(r, null);
    if (e.kind === 'done') finish(r, !['completed', 'interrupted'].includes(e.status) || e.error || !r.src ? new Error(e.error || r.failureMessage || `이미지 처리 완료를 확인하지 못했습니다.${r.text ? ` AI 답: ${r.text.slice(0, 200)}` : ''}`) : null);
  };
  const matches = (r, e) => Boolean((e.turnId || e.threadId) && (!e.turnId || e.turnId === r.turnId) && (!e.threadId || e.threadId === r.threadId));
  return {
    isActive: () => Boolean(active && !active.done),
    cancel() { if (active && !active.done) { interrupt(active); finish(active, new DOMException('작업이 취소되었습니다.', 'AbortError')); } },
    fail(message) { if (active && !active.done) finish(active, new Error(message || '이미지 연결 종료')); },
    handleEvent(e) {
      if (retired.has(e.turnId) || retired.has(e.threadId)) return true;
      const r = active;
      if (!r || r.done || (!e.turnId && !e.threadId)) return false;
      if (r.awaiting) { if (r.queue.length >= 512) finish(r, new Error('이미지 이벤트 한도 초과')); else r.queue.push(e); return true; }
      if (!matches(r, e)) return false;
      route(r, e); return true;
    },
    generate(payload, { imageKind = 'general', local = false, signal } = {}) {
      cancelled(signal);
      if (imageKind === 'exam' && !local) return Promise.reject(new Error('기출 전체 이미지 생성은 허용되지 않습니다.'));
      if (active && !active.done) return Promise.reject(new Error('이미지 처리가 이미 진행 중입니다.'));
      return new Promise((resolve, reject) => {
        const r = { resolve, reject, awaiting: true, queue: [], done: false, started: 0, images: 0, startedIds: new Set(), imageIds: new Set() }; active = r;
        const abort = () => { interrupt(r); finish(r, new DOMException('작업이 취소되었습니다.', 'AbortError')); };
        signal?.addEventListener('abort', abort, { once: true });
        r.resolve = value => { signal?.removeEventListener('abort', abort); resolve(value); };
        r.reject = error => { signal?.removeEventListener('abort', abort); reject(error); };
        r.timer = setTimeout(() => { interrupt(r); finish(r, new Error('이미지 처리 시간 초과')); }, timeoutMs);
        const { models, ...providerPayload } = payload;
        Promise.resolve().then(() => r.done ? null : transport.send({ ...providerPayload, conversationId: null, resetConversation: false, purpose: 'image', ephemeralRender: true })).then(result => {
          r.turnId = result?.turnId; r.threadId = result?.renderThreadId || result?.threadId; r.awaiting = false;
          if (r.interruptPending && (r.turnId || r.threadId)) interrupt(r);
          if (r.done) { if (r.turnId) retired.add(r.turnId); if (r.threadId) retired.add(r.threadId); return; }
          if (!r.turnId && !r.threadId) return finish(r, new Error('이미지 턴 식별자가 없습니다.'));
          for (const e of r.queue) if (matches(r, e)) route(r, e);
          r.queue = [];
        }, error => finish(r, error));
      });
    },
  };
}

/** Same policy and frozen observation for every UI, batch, retry and recovery entry. */
export async function executeImageLabelRun(options = {}) {
  const abort = () => { options.observer?.cancel?.(); options.raster?.cancel?.(); };
  cancelled(options.signal);
  options.signal?.addEventListener('abort', abort, { once: true });
  let release = null;
  const progress = { data: null, plan: null, rendererPrompt: '', phase: null };
  try {
    if (options.queue !== false) release = await acquireAiConversionSlot({ signal: options.signal, onWait: options.onQueueWait });
    return await executeBoundImageLabelRun({ ...options, progress });
  } catch (error) {
    cancelled(options.signal);
    if (error?.name === 'AbortError' || error?.code === 'AI_GRAPH_FIGURE' || options.fallback === false) throw error;
    // 11-09: 어떤 단계가 끝내 실패해도 결과를 내놓는다 — 새로 그린 그림이 있으면 그 그림(라벨 없이), 없으면 원본 그림.
    return await fallbackImageLabelResult(options, progress, error);
  } finally { release?.(); options.signal?.removeEventListener('abort', abort); }
}

async function fallbackImageLabelResult(options, progress, error) {
  const source = options.source;
  if (options.verifyOnly || !source?.data?.startsWith('data:image/')) throw error;
  let workflow;
  try { workflow = normalizeImageLabelWorkflow(options.workflow, { requireExplicit: true }); } catch { throw error; }
  const sourceSha256 = await imageLabelDigest(source.data);
  let sourceFrame = null;
  try { sourceFrame = { id: source.id || sourceSha256, name: source.name || '원본', ...(await imageFrame(source.data)) }; } catch {}
  let useGenerated = workflow.imageKind === 'general' && typeof progress.data === 'string' && progress.data.startsWith('data:image/') && progress.data !== source.data;
  let candidateFrame = sourceFrame;
  if (useGenerated) { try { candidateFrame = await imageFrame(progress.data); } catch { useGenerated = false; candidateFrame = sourceFrame; } }
  const data = useGenerated ? progress.data : source.data;
  const candidateSha256 = useGenerated ? await imageLabelDigest(data) : sourceSha256;
  const reason = String(error?.message || error).slice(0, 300);
  const phaseName = error?.aiPhase || progress.phase || null;
  const message = useGenerated
    ? `라벨을 붙이지 못해 새로 그린 그림만 넣었습니다(원인: ${reason}). 다시 변환하면 라벨을 다시 붙입니다.`
    : phaseName === 'generation' ? `AI가 그림을 끝내 만들지 못해 원본 그림을 그대로 두었습니다(원인: ${reason}). 다시 변환할 수 있습니다.`
      : phaseName === 'sourceAnalysis' ? `AI가 라벨을 끝내 읽지 못해 원본 그림을 그대로 두었습니다(원인: ${reason}). 다시 변환할 수 있습니다.`
        : `변환을 끝내지 못해 원본 그림을 그대로 두었습니다(원인: ${reason}). 다시 변환할 수 있습니다.`;
  const metrics = clone(error?.workflowMetrics || { version: IMAGE_LABEL_RUN_VERSION, timings: {}, calls: {} });
  metrics.timings ||= {};
  metrics.fallback = { phase: phaseName, reason, image: useGenerated ? 'generated' : 'source', attempts: error?.aiAttempts || null };
  metrics.cacheStored = false; metrics.cacheSkipReason = 'fallback';
  const plan = progress.plan ? clone(progress.plan) : null;
  return { version: IMAGE_LABEL_RUN_VERSION, accepted: false, status: 'fallback', data, workflow, sourceSha256, sourceFrame,
    planSha256: plan ? await imageLabelDigest(JSON.stringify(plan)) : null, candidateSha256, candidateFrame,
    sourceLabelPlan: plan, targetPlacement: null, labelPlan: null, editableDraft: null,
    removalReport: { status: 'fallback', changedPixels: 0, removedLabelIds: [], deferredLabels: [], unchanged: !useGenerated, issues: [] },
    report: { verdict: 'uncertain', checks: [], issues: [{ code: 'ai-fallback-result', message, severity: 'major' }] },
    rendererPrompt: useGenerated ? progress.rendererPrompt || '' : '', finalLabelComposite: null, labelVerificationPreview: null, labelProposals: null,
    metrics, fallbackMessage: message };
}

async function executeBoundImageLabelRun({ source, workflow: rawWorkflow, request = '', observer, raster, selection,
  artboard, signal, observation, onObservation = () => {}, onPhase = () => {}, onSourceCandidates, onRaster = () => {}, cache,
  bypassCache = false, preciseRestore = false, verifyOnly = false, previousCandidate, localRestore,
  generationInstructions = request, generationSource, backgroundCache, previousCandidates = [], graphLabels = 'route',
  progress = null, onAiFailure = () => {}, onAiRetry = () => {}, retryPolicy = AI_RETRY_POLICY } = {}) {
  const started = performance.now();
  const labelSelection = { ...selection, model: 'gpt-6-luna', effort: 'medium' };
  const workflow = normalizeImageLabelWorkflow(rawWorkflow, { requireExplicit: true });
  const draftFirst = workflow.labelResult === 'restore-editable'
    && workflow.verificationMode === 'draft-first' && !verifyOnly;
  if (!source?.data?.startsWith('data:image/')) throw new Error('원본 이미지를 확인해야 합니다.');
  if (workflow.imageKind === 'exam' && preciseRestore) throw new Error('기출에는 전체 그림 정밀 복원을 적용할 수 없습니다.');
  const sourceSha256 = await imageLabelDigest(source.data);
  const sourceFrame = { id: source.id || sourceSha256, name: source.name || '원본', ...(await imageFrame(source.data, signal)) };
  const metrics = { version: IMAGE_LABEL_RUN_VERSION, timings: {}, calls: { sourceAnalysis: 0, fullGeneration: 0, localRestore: 0, localReview: 0, targetMapping: 0, review: 0 },
    attempts: { fullGeneration: 0, localRestore: 0 }, cacheHit: false, observationReused: false };
  const phase = async (name, action) => {
    cancelled(signal); onPhase(name); if (progress) progress.phase = name; const t = performance.now();
    try { return await action(); }
    catch(error) {
      metrics.timings[name]=Math.round(performance.now()-t);
      metrics.timings.total=Math.round(performance.now()-started);
      error.aiPhase=name; error.workflowMetrics=clone(metrics);
      throw error;
    } finally { metrics.timings[name] = Math.round(performance.now() - t); }
  };
  const attachments = [{ name: source.name || '원본', data: source.data }];
  // Analysis owns the original. Image generation uses RHWP's prepared copy and
  // approved prompt, never the observer's geometry, typography or style guesses.
  const imageSource = generationSource || { name: 'INPUT_SOURCE.png', data: source.data };
  if (!imageSource.data?.startsWith('data:image/')) throw new Error('이미지 생성 입력을 확인해야 합니다.');
  const generationFrame = imageSource.data === source.data ? sourceFrame : await imageFrame(imageSource.data,signal);
  const generationPrompt = buildSourceTracingPrompt({ sourceFrame:generationFrame?.width ? {width:generationFrame.width,height:generationFrame.height} : undefined, preserveStyle:true });
  const generationPromptSha256 = await imageLabelDigest(generationPrompt);
  metrics.generationHarness = workflow.imageKind !== 'general' ? null
    : verifyOnly ? clone(previousCandidate?.workflowMetrics?.generationHarness || previousCandidate?.metrics?.generationHarness || null)
      : { id: IMAGE_LABEL_GENERATION_HARNESS, sourceTracingVersion:SOURCE_TRACING_CONTRACT_VERSION, promptSha256: generationPromptSha256,
        sourceSha256: await imageLabelDigest(imageSource.data) };
  let generationPayload, backgroundContract;
  if (workflow.imageKind === 'general' && !verifyOnly) {
    const instructions = [generationInstructions, selectedMarkInstructions(workflow),
      preciseRestore ? '사용자가 그림 정밀 복원을 선택했습니다. 수정 전 선택 버전에서 요청한 구조 오류만 원본과 대조해 수정합니다.' : '',
    ].filter(Boolean).join('\n\n');
    generationPayload = { ...selection, text: approvedFirstRequestText({ prompt:generationPrompt, instructions }),
      attachments: [{ ...imageSource }, ...(preciseRestore && previousCandidate ? [{ name: '수정 전 선택 버전', data: previousCandidate.data }] : [])] };
    backgroundContract = await imageLabelBackgroundContract({ payload: generationPayload, sourceSha256, harness: metrics.generationHarness });
    metrics.generationHarness = backgroundContract.harness;
  }
  if (verifyOnly) {
    const previousWorkflow = normalizeImageLabelWorkflow(previousCandidate?.imageLabelWorkflow || previousCandidate?.workflow, {requireExplicit:true});
    const savedPlan = previousCandidate?.sourceLabelPlan || observation?.plan;
    if (workflow.imageKind !== 'general' || workflow.labelResult !== 'restore-editable'
      || ['imageKind','labelResult','auxiliaryMarks','scientificArrows'].some(key => previousWorkflow[key] !== workflow[key])
      || previousCandidate?.sourceSha256 !== sourceSha256 || !savedPlan?.frozen
      || savedPlan.sourceBindings?.length !== 1 || savedPlan.sourceBindings[0].transportSha256 !== sourceSha256
      || previousCandidate?.planSha256 !== await imageLabelDigest(JSON.stringify(savedPlan))
      || previousCandidate?.candidateSha256 !== await imageLabelDigest(previousCandidate?.data || '')) {
      throw new Error('보존된 원본 관찰과 RAW 후보의 처리 정책·바인딩을 확인할 수 없습니다.');
    }
    // Optional review changes verification policy, never the original observation.
    // A saved candidate remains usable even when its tab checkpoint is absent.
    observation = {sourceSha256,workflowVersion:workflow.version,imageKind:previousWorkflow.imageKind,
      contractRevision:savedPlan.observationContractRevision,planSha256:previousCandidate.planSha256,plan:savedPlan,
      localRestoreAttempted:observation?.sourceSha256 === sourceSha256 && observation.localRestoreAttempted === true};
  }
  let plan;
  if (!(workflow.imageKind==='exam' && observation?.removalIncomplete) && observation?.sourceSha256 === sourceSha256 && observation.workflowVersion === workflow.version && observation.imageKind === workflow.imageKind && observation.contractRevision === SOURCE_OBSERVATION_CONTRACT_REVISION && observation.plan?.frozen
    && observation.plan.policyVersion === SOURCE_LABEL_POLICY_VERSION
    && observation.plan.observationVersion === SOURCE_OBSERVATION_VERSION
    && observation.plan.leaderObservationVersion === SOURCE_LEADER_OBSERVATION_VERSION
    && observation.plan.observationContractRevision === SOURCE_OBSERVATION_CONTRACT_REVISION
    && observation.plan.sourceBindings?.[0]?.transportSha256 === sourceSha256
    && observation.planSha256 === await imageLabelDigest(JSON.stringify(observation.plan))) {
    plan = clone(observation.plan); metrics.observationReused = true;
  } else {
    if (verifyOnly) throw new Error('최종 검수에는 같은 원본의 보존된 관찰이 필요합니다.');
    plan = await phase('sourceAnalysis', () => runAiWithRetry({ stage: 'sourceAnalysis', selection: labelSelection, signal,
      attempts: retryPolicy.attempts, timeoutsMs: retryPolicy.analysisTimeoutMs, backoffMs: retryPolicy.backoffMs,
      cancel: () => observer.cancel?.('라벨 읽기 응답이 없어 다시 보냅니다.'), onFailure: onAiFailure, onRetry: onAiRetry,
      run: choice => {
        metrics.calls.sourceAnalysis++;
        return observer.analyze({ ...choice, attachments:[{...attachments[0],sourceTextCandidates:source.sourceTextCandidates}], request, workflow,signal,
          onSourceCandidates:async receipt=>{metrics.timings.sourceCandidates=Math.round(receipt.totalMs);metrics.sourceCandidates={sets:receipt.candidateSets.map(set=>({sourceRef:set.sourceRef,count:set.candidates.length})),errors:receipt.errors};await onSourceCandidates?.(receipt);} });
      } }));
  }
  // 11-09 사용자 결정: 그래프는 라벨 복원을 하지 않는다(「무조건 이미지만 라벨 복원」).
  // 새로 그리는 변환(일반)에서 그래프가 든 그림은 그림을 그리기 전에 멈추고 그래프 복원으로 넘긴다(AI_GRAPH_FIGURE).
  // 사용자가 그래도 같은 작업에서 다시 변환하면(graphLabels:'keep') 라벨 복원도 새로 그리기도 하지 않고 원본 그림을 그대로 둔다
  // — 새로 그리면 그래프 글자가 지워지고 라벨로도 돌아오지 않아 통째로 사라지기 때문이다(전에는 이때 그래프 글자를 라벨로 살렸다).
  const graphFigureLabels = (plan.excludedLabels || []).filter(label => label.scope === 'graph');
  if (workflow.imageKind === 'general' && workflow.labelResult === 'restore-editable' && !verifyOnly && graphFigureLabels.length) {
    const graphPlanSha256 = await imageLabelDigest(JSON.stringify(plan));
    if (graphLabels !== 'keep') {
      await onObservation(clone({ version: IMAGE_LABEL_RUN_VERSION, contractRevision: SOURCE_OBSERVATION_CONTRACT_REVISION, workflowVersion: workflow.version, imageKind: workflow.imageKind, sourceSha256, sourceFrame,
        planSha256: graphPlanSha256, plan: clone(plan), localRestoreAttempted: false }));
      const error = new Error('그래프가 있는 그림이라 그래프 복원으로 옮겼습니다.');
      error.code = 'AI_GRAPH_FIGURE'; error.graphLabelCount = graphFigureLabels.length;
      throw error;
    }
    metrics.cacheStored = false; metrics.cacheSkipReason = 'graph-kept';
    metrics.timings.total = Math.round(performance.now() - started);
    return { version: IMAGE_LABEL_RUN_VERSION, accepted: false, status: 'graph-kept', data: source.data,
      workflow, sourceSha256, sourceFrame, planSha256: graphPlanSha256, candidateSha256: sourceSha256, candidateFrame: sourceFrame,
      sourceLabelPlan: clone(plan), targetPlacement: null, labelPlan: null, editableDraft: null,
      removalReport: { status: 'graph-kept', changedPixels: 0, removedLabelIds: [], deferredLabels: [], graphControl: true, unchanged: true, issues: [] },
      report: { verdict: 'uncertain', checks: [], issues: [], scopeOutcome: 'graph-figure-source-preserved' },
      rendererPrompt: '', finalLabelComposite: null, labelVerificationPreview: null, labelProposals: null, metrics,
      keptMessage: '그래프가 든 그림이라 라벨 복원을 하지 않고 원본 그림을 그대로 두었습니다(그래프 글자도 원본 그대로). 그래프는 「그래프 복원」에서 고칠 수 있습니다.' };
  }
  if (progress) progress.plan = clone(plan);
  const planSha256 = await imageLabelDigest(JSON.stringify(plan));
  const observationState = { version: IMAGE_LABEL_RUN_VERSION, contractRevision: SOURCE_OBSERVATION_CONTRACT_REVISION, workflowVersion: workflow.version, imageKind: workflow.imageKind, sourceSha256, sourceFrame, planSha256, plan: clone(plan),
    localRestoreAttempted: observation?.sourceSha256 === sourceSha256 && observation.localRestoreAttempted === true };
  await onObservation(clone(observationState));
  cancelled(signal);
  if (workflow.imageKind === 'exam' && !plan.labels.length && !plan.removalOnlyItems?.length
    && (plan.excludedLabels?.length && plan.excludedLabels.every(label => label.scope === 'graph')
      && !plan.quarantinedItems?.some(item => item.scope === 'general')
      || !plan.rejectedCount && !plan.quarantinedItems?.length)) {
    metrics.cacheStored = false; metrics.cacheSkipReason = 'graph-out-of-scope';
    metrics.timings.total = Math.round(performance.now() - started);
    return { version: IMAGE_LABEL_RUN_VERSION, accepted: false, status: 'out-of-scope', data: source.data,
      workflow, sourceSha256, sourceFrame, planSha256, candidateSha256: sourceSha256, candidateFrame: sourceFrame,
      sourceLabelPlan: clone(plan), targetPlacement: null, labelPlan: null, editableDraft: null,
      removalReport: { status: 'out-of-scope', changedPixels: 0, removedLabelIds: [], deferredLabels: [],
        graphControl: true, unchanged: true, issues: [] },
      report: { verdict: 'uncertain', checks: [], issues: [], scopeOutcome: 'no-general-labels-source-preserved' },
      rendererPrompt: '', finalLabelComposite: null, labelVerificationPreview: null, labelProposals: null, metrics };
  }
  const descriptor = buildExactOutputCacheDescriptor({ engineVersion: IMAGE_LABEL_RUN_VERSION, styleVersion: workflow.imageKind === 'general' ? STYLE_CONTRACT_VERSION : workflow.version,
    mode: 'image-label-workflow', prompt: request, model: selection.model, effort: selection.effort, serviceTier: selection.serviceTier || null,
    outputOptions: { workflow, sourceSha256, planSha256, preciseRestore, sourceLabelPolicyVersion: SOURCE_LABEL_POLICY_VERSION, sourceObservationVersion: SOURCE_OBSERVATION_VERSION, sourceObservationContractRevision: SOURCE_OBSERVATION_CONTRACT_REVISION, labelModel: labelSelection.model, labelEffort: labelSelection.effort,
      generationHarness: metrics.generationHarness, generationInstructions, styleContractVersion: workflow.imageKind === 'general' ? STYLE_CONTRACT_VERSION : null,
      previousCandidateSha256: preciseRestore && previousCandidate?.data ? await imageLabelDigest(previousCandidate.data) : null } });
  const key = createExactOutputCacheKey(descriptor);
  if (cache && !bypassCache && !verifyOnly && !draftFirst) {
    const hit = await cache.get(key);
    const saved = hit?.hit && hit.entry?.output?.imageLabelRun;
    let valid = saved && saved.version === IMAGE_LABEL_RUN_VERSION && saved.accepted === true
      && saved.workflow?.version === workflow.version && JSON.stringify(saved.workflow) === JSON.stringify(workflow)
      && saved.sourceSha256 === sourceSha256 && saved.planSha256 === planSha256 && saved.candidateSha256 === await imageLabelDigest(saved.data)
      && enforceImageLabelAcceptance(saved.report, { workflow, candidateSha256: saved.candidateSha256 }).strictAccepted
      && (workflow.imageKind === 'exam' || saved.report?.styleReview?.version === STYLE_CONTRACT_VERSION && saved.report.styleReview.candidateSha256 === saved.candidateSha256)
      && (workflow.labelResult !== 'restore-editable' || saved.targetPlacement && saved.labelPlan)
      && (!saved.targetPlacement || saved.targetPlacement.candidateSha256 === saved.candidateSha256 && saved.targetPlacement.planSha256 === planSha256);
    if (valid && saved.targetPlacement) {
      try { await validateLabelTargetPlacement({ plan, placement: saved.targetPlacement, candidateDataUrl: saved.data }); }
      catch (error) { cancelled(signal); valid = false; }
    }
    if (valid) {
      cancelled(signal); metrics.cacheHit = true; metrics.timings.total = Math.round(performance.now() - started);
      return { ...clone(saved), metrics, cachedMetrics: saved.metrics };
    }
    if (hit?.hit) await cache.delete(key);
  }
  let data, removalReport = null, rendererPrompt = '';
  if (verifyOnly) {
    if (workflow.imageKind !== 'general' || !metrics.observationReused
      || previousCandidate?.sourceSha256 !== sourceSha256 || previousCandidate?.planSha256 !== planSha256
      || previousCandidate?.candidateSha256 !== await imageLabelDigest(previousCandidate?.data || '')) {
      throw new Error('보존된 원본 관찰과 RAW 후보의 바인딩을 확인할 수 없습니다.');
    }
    data = previousCandidate.data; rendererPrompt = previousCandidate.rendererPrompt || '';
  } else if (workflow.imageKind === 'exam') {
    let local;
    try {
    local = await phase('pixelProcessing', () => removeExamLabelsFromDataUrl({ dataUrl: source.data, plan, workflow, signal,
      localRestore: localRestore && !observationState.localRestoreAttempted ? async args => {
        observationState.localRestoreAttempted = true;
        await onObservation(clone(observationState)); // Reserve the one attempt durably before dispatch.
        cancelled(signal); metrics.attempts.localRestore++;
        const t = performance.now();
        try { return await localRestore(args, { metrics, selection, signal }); }
        finally { metrics.timings.localRestore = Math.round(performance.now() - t); }
      } : undefined }));
    } catch (error) {
      // 11-09: 기출 주석 제거가 끝내 실패해도 변환을 실패로 끝내지 않는다 — 원본 그림을 그대로 쓰고 글자는 편집 목록으로 남긴다.
      if (error?.name === 'AbortError' || signal?.aborted) throw error;
      const message = `기출 주석 제거를 끝내지 못해 원본을 유지했습니다: ${String(error?.message || error).slice(0, 200)}`;
      try { onAiFailure({ stage: 'pixelProcessing', attempt: 1, attempts: 1, model: null, effort: null, code: error?.code || null, message, elapsedMs: metrics.timings.pixelProcessing ?? null, at: new Date().toISOString() }); } catch {}
      local = { dataUrl: source.data, report: { status: 'failed', changedPixels: 0, removedLabelIds: [], deferredLabels: [], issues: [{ code: 'pixel-processing-failed', message }] } };
    }
    const bindingProblem = local.report.status !== 'complete' && local.report.removedLabelIds?.length ? examRemovalBindingProblem({ plan, report: local.report, sourceFrame }) : '';
    if (bindingProblem) local = { dataUrl: source.data, report: { ...local.report, status: 'failed', removedLabelIds: [], removalMasks: undefined,
      issues: [...(local.report.issues || []), { code: 'removal-binding-mismatch', message: `${bindingProblem} 원본을 유지했습니다.` }] } };
    removalReport = local.report;
    observationState.removalIncomplete=local.report.status!=='complete';
    await onObservation(clone(observationState));
    // Retain only label-atomic deletions. Legacy/unbound partial candidates
    // cannot authorize overlays and still return the source unchanged.
    if(local.report.status!=='complete' && !local.report.removedLabelIds?.length) {
      data=source.data;
      removalReport={...local.report,verifiedInkPixels:local.report.changedPixels||0,partialCandidateDiscarded:local.report.changedPixels>0,changedPixels:0,unchanged:true};
    } else data=local.dataUrl;
  } else {
    const background = await phase('generation', () => resolveImageLabelBackground({ contract: backgroundContract,
      candidates: [previousCandidate, ...previousCandidates], cache: backgroundCache, signal,
      generate: async () => {
        const result = await runAiWithRetry({ stage: 'generation', selection: { model: generationPayload.model, effort: generationPayload.effort }, signal,
          attempts: retryPolicy.attempts, timeoutsMs: retryPolicy.generationTimeoutMs, backoffMs: retryPolicy.backoffMs,
          cancel: () => raster.cancel?.(), onFailure: onAiFailure, onRetry: onAiRetry,
          run: choice => {
            metrics.attempts.fullGeneration++;
            return raster.generate({ ...generationPayload, model: choice.model, effort: choice.effort }, { imageKind: workflow.imageKind, signal });
          } });
        metrics.calls.fullGeneration += result.imageToolCalls;
        return { data: await resolveGeneratedRaster(result.src, { whitePng: true }), rendererPrompt: result.rendererPrompt };
      } }));
    data = background.data; rendererPrompt = background.rendererPrompt;
    metrics.backgroundReused = background.reused;
    // 11-08 사용자 결정: 라벨 켬·끔은 같은 그림이어야 한다. 원본 판(비율)을 재고 그 안에 같은 배율로만 맞춘다 —
    // 켬·끔 모두 같은 방법(글자 상자는 원본 관찰의 모든 글자: 라벨·그래프 글자·제외 글자)이므로 같은 AI 그림이면 결과도 픽셀까지 같다.
    // 이미 맞춘 결과(같은 작업의 이전 후보)를 다시 쓰는 경우는 그대로 둔다 — 두 번 맞추면 픽셀이 미세하게 달라진다.
    if (!verifyOnly && background.reused !== 'candidate') {
      try {
        const textBoxes = [...(plan.labels || []), ...(plan.excludedLabels || []), ...(plan.removalOnlyItems || [])]
          .map(label => label?.typography?.bounds || label?.bounds).filter(Boolean);
        const frame = await fitCandidateToSource({ candidateDataUrl: data, sourceDataUrl: source.data, textBoxes, signal });
        if (frame.fitted) data = frame.data;
        metrics.reframe = { fitted: frame.fitted, reason: frame.reason || null, transform: frame.transform || null };
      } catch (error) { if (error?.name === 'AbortError') throw error; metrics.reframe = { fitted: false, reason: String(error?.message || error).slice(0, 200) }; }
    }
  }
  if (progress && workflow.imageKind === 'general' && !verifyOnly) { progress.data = data; progress.rendererPrompt = rendererPrompt; }
  cancelled(signal);
  const candidateSha256 = await imageLabelDigest(data);
  const candidateFrame = await imageFrame(data, signal);
  if (verifyOnly && (previousCandidate.sourceFrame && JSON.stringify(previousCandidate.sourceFrame) !== JSON.stringify(sourceFrame)
    || previousCandidate.candidateFrame && JSON.stringify(previousCandidate.candidateFrame) !== JSON.stringify(candidateFrame))) {
    throw new Error('보존된 RAW 후보의 이미지 프레임이 변경되었습니다.');
  }
  if(workflow.imageKind==='general') {
    // Persist and display the one real RAW before a slower label verification.
    // This is a pending diagnostic candidate, never an accepted/cache result.
    cancelled(signal);
    // 11-09: 미리 보여 주기가 실패해도 변환은 계속한다(결과는 마지막에 다시 만든다).
    try { await onRaster({data,rendererPrompt,workflow,sourceSha256,sourceFrame,planSha256,candidateSha256,candidateFrame,sourceLabelPlan:clone(plan),metrics:clone(metrics)}); }
    catch (error) { if (error?.name === 'AbortError' || signal?.aborted) throw error; metrics.rasterPreviewError = String(error?.message || error).slice(0, 200); }
    cancelled(signal);
  }
  if (workflow.imageKind === 'exam' && removalReport?.status !== 'complete') {
    if (removalReport.removedLabelIds?.length) {
      const ids = removalReport.removedLabelIds;
      if (new Set(ids).size !== ids.length || ids.some(id => !plan.labels.some(label =>
        label.id === id && label.scope === 'general' && label.sourceRef === 1 && !label.ownershipReviewRequired))
        || removalReport.deferredLabels?.some(label => ids.includes(label.labelId))) {
        throw new Error('라벨별 제거 결과와 원본 계획의 소속이 다릅니다.');
      }
      const mask = removalReport.removalMasks;
      if (mask?.version !== 1 || mask.coordinateSpace !== 'source-pixels' || !Array.isArray(mask.regions)
        || sourceFrame.width && (mask.width !== sourceFrame.width || mask.height !== sourceFrame.height)
        || ids.some(id => !mask.regions.some(region => region.labelId === id && region.component === 'text'))) {
        throw new Error('완료된 라벨의 실제 제거 마스크를 확인할 수 없습니다.');
      }
      const removalBinding = { version: 1, sourceSha256, planSha256, candidateSha256,
        removedLabelIds: [...ids], restoredLabelIds: workflow.labelResult === 'restore-editable' ? [...ids] : [],
        maskSha256: await imageLabelDigest(JSON.stringify(mask)) };
      removalReport = { ...removalReport, removalBinding };
      const restorationPlan = { ...clone(plan), labels: labelsAtMeasuredGlyphs(plan.labels.filter(label => ids.includes(label.id)).map(clone), removalReport.localTextSearches),
        relationGroups: (plan.relationGroups || []).filter(group => group.labelIds.every(id => ids.includes(id))).map(clone),
        ...(plan.sourceAssociations ? { sourceAssociations: plan.sourceAssociations.filter(row => ids.includes(row.labelId)).map(clone) } : {}),
        ...(plan.sourceLeaderObservations ? { sourceLeaderObservations: plan.sourceLeaderObservations.filter(row => ids.includes(row.labelId)).map(clone) } : {}),
        removalBinding };
      let placement = null, composite = null;
      const issues = (removalReport.issues || []).map(issue => ({ ...issue, message: issue.message || issue.code, severity: 'major' }));
      if (workflow.labelResult === 'restore-editable') {
        placement = await bindLabelTargetPlacement({ plan: restorationPlan, candidateDataUrl: data, imageKind: 'exam',
          labels: restorationPlan.labels.map(label => ({ id: label.id, status: 'uncertain', reason: '안전하게 제거된 원본 위치이며 연결과 간격은 직접 확인해야 합니다.' })) });
        try { composite = await phase('labelPlacement', () => createEditableLabelComposite({
          plan: restorationPlan, placement, candidateDataUrl: data, artboard, signal })); }
        catch (error) { cancelled(signal); issues.push({ code: 'label-composite-unavailable', message: error.message, severity: 'major' }); }
      }
      const report = enforceImageLabelAcceptance({ verdict: 'uncertain', checks: [], issues,
        targetVerified: false, placementVerified: false }, { workflow, candidateSha256 }).report;
      report.mechanicalDiagnostics = [...clone(removalReport.issues || []), ...clone(composite?.report.issues || [])];
      if (composite) { report.compositeBindings = composite.bindings; report.compositeMeasurements = composite.report; }
      const sized = workflow.labelResult === 'restore-editable' ? await measuredLabelSizes(source.data, restorationPlan.labels || [], signal) : null;
      const labelPlan = workflow.labelResult === 'restore-editable' ? { ...clone(restorationPlan), labels: withLabelSizes(clone(restorationPlan.labels), sized?.sizes), sourcePlan: clone(restorationPlan),
        qualityReview: report, reviewRequired: true, targetPlacement: clone(placement), candidateSha256, ...(sized?.ratio ? { measuredLabelSize: sized.ratio } : {}) } : null;
      if (placement) removalReport.restorationPlanSha256 = placement.planSha256;
      metrics.cacheStored = false; metrics.cacheSkipReason = 'exam-removal-partial';
      metrics.timings.total = Math.round(performance.now() - started);
      cancelled(signal);
      return { version: IMAGE_LABEL_RUN_VERSION, accepted: false, status: 'needs-attention', data, workflow,
        sourceSha256, sourceFrame, planSha256, candidateSha256, candidateFrame, sourceLabelPlan: clone(plan),
        targetPlacement: placement, labelPlan, removalReport, report, rendererPrompt,
        finalLabelComposite: composite?.attachment.data || null, labelVerificationPreview: null, labelProposals: null, metrics };
    }
    // No editable text is laid over undeleted source text. The original RAW
    // and precise removal diagnostics remain available for manual review.
    const issues = (removalReport?.issues || []).map(i=>({...i,message:i.message||i.code,severity:'major'}));
    const report = enforceImageLabelAcceptance({verdict:'uncertain',checks:[],issues}, {workflow,candidateSha256}).report;
    report.mechanicalDiagnostics = clone(removalReport?.issues || []);
    metrics.cacheStored=false; metrics.cacheSkipReason='exam-removal-incomplete';
    metrics.timings.total=Math.round(performance.now()-started);
    cancelled(signal);
    const labelIds = workflow.labelResult === 'restore-editable' ? externalLabelDraftIds(plan) : [];
    const editableDraft = labelIds.length ? {version:1,presentation:'external-list',sourceSha256,candidateSha256,planSha256,labelIds} : null;
    return {version:IMAGE_LABEL_RUN_VERSION,accepted:false,status:'needs-attention',data,workflow,sourceSha256,sourceFrame,planSha256,candidateSha256,candidateFrame,editableDraft,
      sourceLabelPlan:clone(plan),targetPlacement:null,labelPlan:null,removalReport,report,rendererPrompt,finalLabelComposite:null,labelVerificationPreview:null,labelProposals:null,metrics};
  }
  let targetPlacement = null, labelPlan = null, composite = null;
  const placementIssues = [];
  let jointReport = null, jointPreview = null;
  const useJoint = workflow.labelResult === 'restore-editable' && plan.observationVersion === SOURCE_OBSERVATION_VERSION;
  if (useJoint) {
    try {
      jointPreview = await phase('labelProposals', () => prepareJointLabelVerification({plan,candidateDataUrl:data,imageKind:workflow.imageKind,artboard,signal}));
      const checked = draftFirst ? { placement: jointPreview.placement, report: {
        verdict: 'uncertain', checks: [], targetVerified: false, placementVerified: false,
        issues: [{code:'optional-review-not-run',message:'초기 로컬 배치이며 최종 그림·대상·라벨 검수를 실행하지 않았습니다.',severity:'major'}],
      } } : await phase('finalVerification', () => {
        metrics.calls.review++;
        return observer.verifyPlacement({...labelSelection,attachments,plan,candidate:{name:'최종 RAW',data},workflow,request,preview:jointPreview});
      });
      targetPlacement = draftFirst ? {...clone(checked.placement), status:'needs-attention', verified:false,
        labels:checked.placement.labels.map(label=>({...clone(label),verified:false}))} : checked.placement;
      jointReport = checked.report;
      await validateLabelTargetPlacement({plan,placement:targetPlacement,candidateDataUrl:data});
    } catch (error) {
      cancelled(signal);
      const reason = '통합 최종 배치 검수 불확실: '+String(error.message).slice(0,300);
      targetPlacement = await bindLabelTargetPlacement({plan,candidateDataUrl:data,imageKind:workflow.imageKind,labels:plan.labels.map(l=>({id:l.id,status:'uncertain',reason}))});
      jointReport = {verdict:'uncertain',checks:[],issues:[{code:'joint-verification-unavailable',message:reason,severity:'major'}]};
    }
    try { composite = await phase('labelPlacement', () => createEditableLabelComposite({plan,placement:targetPlacement,candidateDataUrl:data,artboard,signal})); }
    catch (error) { cancelled(signal); placementIssues.push({code:'label-composite-unavailable',message:error.message,severity:'major'}); }
  } else if (draftFirst) {
    targetPlacement = await bindLabelTargetPlacement({plan,candidateDataUrl:data,imageKind:workflow.imageKind,
      labels:plan.labels.map(l=>({id:l.id,status:'uncertain',reason:'Optional review not run'}))});
    jointReport = {verdict:'uncertain',checks:[],targetVerified:false,placementVerified:false,
      issues:[{code:'optional-review-not-run',message:'최종 그림·대상·라벨 검수를 실행하지 않았습니다.',severity:'major'}]};
    try { composite = await phase('labelPlacement', () => createEditableLabelComposite({plan,placement:targetPlacement,candidateDataUrl:data,artboard,signal})); }
    catch (error) { cancelled(signal); placementIssues.push({code:'label-composite-unavailable',message:error.message,severity:'major'}); }
  } else if (workflow.labelResult === 'restore-editable') {
    try {
      targetPlacement = await phase('targetMapping', () => {
        if (workflow.imageKind === 'general' && plan.labels.length) metrics.calls.targetMapping++;
        return observer.mapTargets({ ...labelSelection, attachments, plan, candidate: { name: '최종 후보', data }, workflow });
      });
      await validateLabelTargetPlacement({ plan, placement: targetPlacement, candidateDataUrl: data });
    } catch (error) {
      cancelled(signal);
      const reason = `최종 대상 대응을 확인하지 못했습니다: ${String(error.message).slice(0, 300)}`;
      targetPlacement = await bindLabelTargetPlacement({ plan, candidateDataUrl: data, imageKind: workflow.imageKind,
        labels: plan.labels.map(label => ({ id: label.id, status: 'uncertain', reason })) });
      placementIssues.push({ code: 'target-mapping-unavailable', message: reason, severity: 'major' });
    }
    try { composite = await phase('labelPlacement', () => createEditableLabelComposite({ plan, placement: targetPlacement, candidateDataUrl: data, artboard, signal })); }
    catch (error) {
      cancelled(signal);
      placementIssues.push({ code: 'label-composite-unavailable', message: `합성 미리보기를 만들지 못했습니다: ${String(error.message).slice(0, 300)}`, severity: 'major' });
    }
  }
  let report;
  if (useJoint || draftFirst) {
    report = jointPreview ? retainFinalVerification({report:jointReport,preview:jointPreview,composite,placement:targetPlacement}) : jointReport;
  } else try {
    report = await phase('review', () => {
      metrics.calls.review++;
      return workflow.labelResult === 'restore-editable'
        ? observer.reviewFinal({ ...labelSelection, attachments, plan, candidate: { name: '최종 후보', data }, composite, placement: targetPlacement, request, workflow })
        : observer.review({ ...labelSelection, attachments, plan, candidate: { name: '최종 후보', data }, request, workflow });
    });
  } catch (error) {
    cancelled(signal);
    report = { verdict: 'uncertain', checks: [], issues: [{ code: 'review-unavailable', message: error.message, severity: 'major' }] };
  }
  report.issues ||= [];
  if (draftFirst) {
    report.targetVerified = false; report.placementVerified = false;
    if (!report.issues.some(issue=>issue.code==='optional-review-not-run')) {
      report.issues.push({code:'optional-review-not-run',message:'최종 그림·대상·라벨 검수를 실행하지 않았습니다.',severity:'major'});
    }
  }
  report.issues.push(...placementIssues);
  if (placementIssues.length || removalReport && removalReport.status !== 'complete' || targetPlacement?.status === 'needs-attention') {
    if (report.verdict === 'pass') report.verdict = 'uncertain';
    for (const issue of removalReport?.issues || []) report.issues.push({ ...issue, message: issue.message || issue.code, severity: 'major' });
    if (targetPlacement?.status === 'needs-attention') report.issues.push({ code: 'target-correspondence-uncertain', message: '연결 대상 대응을 확인해야 합니다.', severity: 'major' });
  }
  const acceptance = enforceImageLabelAcceptance(report, { workflow, candidateSha256 });
  const mechanicalDiagnostics = [...placementIssues, ...(removalReport?.issues || []), ...(composite?.report.issues || []),
    ...report.issues.filter(issue=>issue.code==='final-composite-changed-after-review'||issue.code==='joint-verification-unavailable')];
  report = acceptance.report;
  report.mechanicalDiagnostics = mechanicalDiagnostics;
  if (workflow.labelResult === 'restore-editable') {
    const sized = await measuredLabelSizes(source.data, plan.labels || [], signal);
    labelPlan = { ...clone(plan), labels: withLabelSizes(clone(plan.labels), sized.sizes), sourcePlan: clone(plan), qualityReview: report, reviewRequired: !acceptance.accepted, targetPlacement: clone(targetPlacement), candidateSha256, ...(sized.ratio ? { measuredLabelSize: sized.ratio } : {}) };
  }
  metrics.timings.total = Math.round(performance.now() - started);
  const result = { version: IMAGE_LABEL_RUN_VERSION, accepted: acceptance.accepted, status: acceptance.accepted ? 'complete' : 'needs-attention', data, workflow, sourceSha256, sourceFrame, planSha256, candidateSha256, candidateFrame, sourceLabelPlan: clone(plan), targetPlacement,
    labelPlan, removalReport, report, rendererPrompt, labelVerificationPreview: jointPreview?.composite.attachment.data || null, labelProposals: jointPreview?.proposals || null, finalLabelComposite: composite?.attachment.data || null, metrics };
  cancelled(signal);
  // 결과 저장(캐시)은 모든 검수 항목을 통과한 결과만. 화면 안내 완화와 무관하게 그대로 둔다.
  if (cache && acceptance.strictAccepted) {
    const persistenceStarted = performance.now();
    const output = { imageLabelRun: clone(result) };
    // Count the complete persisted payload, including plans and composite PNGs.
    output.bytes = new TextEncoder().encode(JSON.stringify(output)).byteLength;
    const stored = await cache.put({ key, descriptor, output, status: 'complete' });
    metrics.timings.persistence = Math.round(performance.now() - persistenceStarted);
    metrics.cacheStored = stored?.stored === true;
    if (!metrics.cacheStored) metrics.cacheSkipReason = stored?.reason || 'storage-unavailable';
    if (signal?.aborted && stored?.stored) await cache.delete(key);
  } else if (cache) {
    metrics.cacheStored = false;
    metrics.cacheSkipReason = 'review-not-accepted';
  }
  metrics.timings.total = Math.round(performance.now() - started);
  cancelled(signal); return result;
}

const pngUrl = async (data, width, height) => {
  const bytes = await encodeScopedPng({ data: new Uint8Array(data), width, height });
  let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:image/png;base64,${btoa(binary)}`;
};
/** Send only the selected crop. Merge permission remains the caller's immutable mask. */
export function createExamLocalRestore({ observer, raster, onPhase = () => {} }) {
  return async ({ data, width, height, mask }, { metrics, selection, signal }) => {
    cancelled(signal); onPhase('localRestore');
    const source = await pngUrl(data, width, height);
    const rgbaMask = new Uint8Array(width * height * 4);
    for (let i = 0; i < mask.length; i++) { rgbaMask[i * 4] = rgbaMask[i * 4 + 1] = rgbaMask[i * 4 + 2] = mask[i] ? 255 : 0; rgbaMask[i * 4 + 3] = 255; }
    const maskUrl = await pngUrl(rgbaMask, width, height);
    const restored = await raster.generate({ ...selection, attachments: [{ name: '원본 국소 영역', data: source }, { name: '흰색 부분만 제거하는 마스크', data: maskUrl }],
      text: '기출 원본의 국소 주석 복원이다. 첨부 crop 크기·비율·과학 구조를 유지한다. 두 번째 마스크의 흰 영역에 소속된 글자·지시선·끝점만 제거하고 그 아래 확인 가능한 과학 구조를 복원한다. 마스크 밖 관·혈관·윤곽·눈금은 유지한다. 없는 구조를 추측하지 않는다. 이미지 생성 도구를 이 국소 영역에 한 번만 호출한다. 전체 그림 생성·스타일 변환·추가 재시도는 금지한다. PNG 하나를 반환한다.' }, { imageKind: 'exam', local: true, signal });
    metrics.calls.localRestore += restored.imageToolCalls;
    const src = await resolveGeneratedRaster(restored.src, { whitePng: true });
    const image = new Image(); image.src = src; await image.decode(); cancelled(signal);
    if (image.naturalWidth !== width || image.naturalHeight !== height) throw new Error('국소 복원 결과 크기가 원본 영역과 달라 적용하지 않았습니다.');
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data, candidate = canvas.toDataURL('image/png'); canvas.width = canvas.height = 0;
    metrics.calls.localReview++; onPhase('localReview'); const reviewStarted = performance.now();
    let checked;
    try { checked = await observer.reviewLocalRestore({ ...selection, model:'gpt-6-luna',effort:'medium', source: { name: '원본 국소 영역', data: source }, candidate: { name: '국소 복원 결과', data: candidate }, mask: { name: '삭제 소속 마스크', data: maskUrl } }); }
    finally { metrics.timings.localReview = Math.round(performance.now() - reviewStarted); }
    cancelled(signal);
    return { data: pixels, width, height, verified: checked.verified === true };
  };
}

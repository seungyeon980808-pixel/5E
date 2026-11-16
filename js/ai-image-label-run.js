import { buildSourceTracingPrompt, SOURCE_TRACING_CONTRACT_VERSION } from './ai-source-tracing-contract.js?v=1.7.0-four-session-integration';
import { normalizeImageLabelWorkflow, IMAGE_EMPHASIS_REMOVAL_CONTRACT } from './ai-image-label-workflow.js?v=1.7.0-four-session-integration';
import { removeExamLabelsFromDataUrl, localTextSearchFromGlyphInk } from './ai-exam-label-removal.js?v=1.7.0-four-session-integration';
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
import { SOURCE_LABEL_POLICY_VERSION, EDITABLE_IMAGE_LABEL_PLAN_VERSION, freezeLabelPlan } from './ai-editable-image-labels.js?v=1.7.0-four-session-integration';
import { LABEL_READ_PROMPT, parseLabelRead, labelReadToEditablePlan } from './ai-direct-label-plan.js?v=1.7.0-four-session-integration';
import { externalLabelDraftIds } from './ai-label-review-draft.js?v=1.7.0-four-session-integration';
import { imageLabelBackgroundContract, resolveImageLabelBackground } from './ai-label-background.js?v=1.7.0-four-session-integration';
import { fitCandidateToSource, measureSourceLabelHeights } from './ai-label-reframe.js?v=1.7.0-four-session-integration';
import { nativePresentationForLabelTypography, presentationRoleFor, prepareEditableLabelFonts } from './ai-label-typography.js?v=1.7.0-four-session-integration';
import { grayscaleGeneratedPng } from './ai-grayscale-png.js?v=1.7.0-four-session-integration';

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
export const EXAM_REDRAW_INSTRUCTION = '기출 그림 새로 그리기: 원본의 모든 물체(사람·기구·장치 포함)·선·점선·화살표·직각 표시·기호와 그 위치·크기·개수를 그대로 두고, 글자 라벨(한글·영문·숫자·단위)과 글자를 가리키는 지시선만 지운다. 물체를 지우거나 새로 만들거나 꾸미지 않는다. 원본과 같은 구도·비율로 깔끔하고 선명한 선으로 다시 그린다.';
export const TEXTBOOK_OBJECT_ONLY_CONTRACT = '교과서 그림 정리: 그림의 주인공 물체(예: 암석, 기관, 실험 기구, 지구본, 밧줄 파동)와 그 물체에 딸린 과학 표시(진행·진동·힘·운동·전류 방향 화살표, 파장·진폭 같은 치수선, 중심선·눈금)는 평가원 선화로 남긴다(화살표·보조선 설정이 지우라고 한 것만 지운다). 색 상자 안의 제목 딱지(예: 「화산암」), 쪽·그림 번호와 캡션, 배경 띠·색 줄·배경 면·배경 삽화, 그림과 그림 사이의 순서·변화를 가리키는 안내 화살표(예: 원래 암석 → 변성암), 말풍선과 그 안의 글, 캐릭터(그림 밖에서 설명하거나 말을 거는 안내 마스코트: 로봇·사람·동물 캐릭터), 그림 테두리·둥근 판·장식은 모두 지우고 그 자리는 흰 바탕으로 둔다. 장면 안에서 과학 현상에 참여하는 생물·물체(예: 물결 위에 뜬 개구리·나뭇잎, 실험하는 손, 관찰 대상 동물)는 캐릭터가 아니라 주인공 물체로 남긴다. 지운 자리에 흰 네모나 빈 상자를 남기지 않는다. 남은 물체의 크기·위치·간격은 원본 그대로 둔다. 물체 이름 글자도 그림에서 지운다(편집 라벨로 따로 복원된다).';
// 11-10: 그림 변환 기본 프롬프트(사용자 4차 실측 결정: 짧을수록 빠르고 회색 음영·실패 화면이 줄었다).
// 긴 계약 프롬프트(SOURCE-GRID·스타일·표시 계약)는 라벨 복원(베타) 경로에서만 쓰고, 기본 경로는 아래 한 문단만 보낸다.
export const REDRAW_EXAM_PROMPT = '글자·숫자·문자와, 글자를 가리키는 지시선만 지워 줘. 글자가 들어 있던 네모 틀·계기 화면은 틀만 남기고 비워 둬. 길이·각도를 나타내는 치수선, 각도 호, 점선, 직각 표시, 화살표, 음영, 회색으로 칠한 면은 같은 자리에 같은 진하기로 그대로 둬. 지운 자리에는 아무것도 새로 그리지 말고 비워 둬. 원본 그대로 선명한 흑백 그림으로 다시 그려 줘.';
export const REDRAW_TEXTBOOK_PROMPT = "첨부한 교과서 그림을 한국 수능(평가원) 시험지용 흑백 과학 그림으로 다시 그려 줘.\n- 원본 위에 겹쳤을 때 물체의 윤곽·위치·크기·비율·개수·연결이 같은 자리에 맞도록 원본을 따라 그린다. 다른 그림으로 다시 구성하지 않고, 없는 부품을 만들거나 있는 구조를 빼지 않는다.\n- 글자·숫자·단위·라벨, 글자를 가리키는 지시선, 말풍선, 캡션, 캐릭터, 배경 판·테두리·색 막대, 그림과 그림 사이의 변화·순서를 나타내는 화살표는 모두 지운다.\n- 파장·진폭·길이를 나타내는 치수선, 각도 호, 법선·중심선, 직각 표시, 물체에 붙은 운동·힘·빛의 화살표는 같은 자리에 그대로 남긴다.\n- 흰 바탕, 무채색(검정·흰색·회색)만 쓴다. 선명한 검정 윤곽선. 색으로 구분되던 물질·입자·층·부위는 서로 다른 회색 단계로 꼭 구분한다.\n- 암석·뼈처럼 사진 같은 물체는 표면 질감과 특징을 살린 선화로 그린다. 광택·반사·그라데이션·장식은 정리한다.\n- 원본과 같은 구도·여백·비율.";
// 11-10: 그림 생성 모델. 첫 생성은 Luna, 같은 원본을 다시 그리는 요청(다시 그리기·정밀 복원)은 Sol. 실패하면 반대 모델로 한 번 더 보낸다.
export const AI_GENERATION_PRIMARY_MODEL = 'gpt-6-luna';
export const AI_GENERATION_REGENERATE_MODEL = 'gpt-6.1-sol';
// 11-10: 두 모델 모두 실패하면 원본 그림을 결과로 돌리고 이 안내를 띄운다(실패 화면 없음).
export const AI_GENERATION_FAILED_NOTICE = '변환이 잠시 안 되어 원본을 그대로 넣었습니다. 다시 그리기를 눌러 주세요.';
export const redrawPromptFor = imageKind => imageKind === 'exam' ? REDRAW_EXAM_PROMPT : REDRAW_TEXTBOOK_PROMPT;
// 11-10: 기본 그림 경로에서도 사용자가 고른 「화살표 제거」를 지킨다. 짧은 지시문에는 이 선택이 빠져 있었다(무시되던 결함).
export const REDRAW_SCIENTIFIC_ARROW_NOTE = '사용자가 화살표 제거를 켰습니다. 이번 작업에서는 과학적 힘·운동·혈류·전류 화살표도 제거하세요. 실제 관·혈관·도선·물체 윤곽·눈금은 보존하세요.';
// 사용자가 직접 쓴 수정·댓글 요청만 「사용자 요청:」으로 뒤에 붙인다.
export function redrawRequestText({ imageKind, userRequest = '' } = {}) {
  const request = String(userRequest || '').trim();
  return request ? `${redrawPromptFor(imageKind)}\n\n사용자 요청: ${request}` : redrawPromptFor(imageKind);
}
// 11-10: 라벨 복원(기본)은 그림을 「라벨 삭제」와 같은 요청으로 새로 그리고, 원본 글자는 글 읽기 호출로 따로 읽는다(그림 생성과 병렬).
export const AI_LABEL_READ_MODEL = 'gpt-6.1-sol';
export const AI_LABEL_READ_NOTICE = '라벨 글자를 읽지 못해 그림만 넣었습니다. 라벨은 직접 추가할 수 있습니다.';
// 11-10: 읽은 글자 → 검수 없이 쓰는 확정 라벨 명세(frozen). 편집 라벨 삽입·미리보기 경로가 그대로 쓴다.
export function labelPlanFromRead(items) {
  const { labels } = labelReadToEditablePlan(items);
  return freezeLabelPlan({ version: EDITABLE_IMAGE_LABEL_PLAN_VERSION, policyVersion: SOURCE_LABEL_POLICY_VERSION, frozen: true,
    status: labels.length ? 'ready' : 'empty', labels: labels.map(label => ({ ...label, scope: 'general' })), excludedLabels: [], preservedMarks: [],
    uncertainties: [], reviewRequired: false, rejectedCount: 0, relationGroups: [], sourceBindings: [] });
}
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
// 11-09 라벨 안정화: 원본 글자 높이는 글자 잉크 덩어리로 먼저 잰다. 줄 잉크 방식(measureSourceLabelHeights)은 글자 둘레의
// 화살표·점·이웃 글자까지 한 줄로 재어 크게(최대 2.7배) 또는 작게 재곤 했다(개발 세트 정답 대비 ±10% 안 64% → 글자 덩어리 88%).
// 글자 덩어리를 못 찾으면(여러 줄·틀 안 글자 등) 줄 잉크 방식 값을 그대로 쓴다.
async function glyphLabelHeights(sourceDataUrl, labels, signal) {
  const out = new Map();
  if (typeof document === 'undefined' || typeof Image === 'undefined' || !labels.length) return out;
  try {
    const image = new Image(); image.src = sourceDataUrl; await image.decode();
    if (signal?.aborted) throw new DOMException('작업이 취소되었습니다.', 'AbortError');
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data; canvas.width = canvas.height = 0;
    for (const label of labels) {
      if (String(label.text || '').includes('\n')) continue;
      const found = localTextSearchFromGlyphInk({ data, width: image.naturalWidth, height: image.naturalHeight, label, plan: { labels } });
      if (found?.glyphBounds?.h > 0) out.set(label.id, found.glyphBounds.h);
    }
  } catch (error) { if (error?.name === 'AbortError') throw error; }
  return out;
}
export async function measuredLabelSizes(sourceDataUrl, labels = [], signal) {
  let measured = [];
  try { measured = await measureSourceLabelHeights({ sourceDataUrl, labels, signal }); } catch (error) { if (error?.name === 'AbortError') throw error; }
  const glyphHeights = await glyphLabelHeights(sourceDataUrl, labels, signal);
  try { await prepareEditableLabelFonts(labels); } catch {}
  const glyph = new Map(measured.map(m => [m.id, m.h])), raw = [];
  for (const label of labels) {
    const h = glyphHeights.get(label.id) || glyph.get(label.id) || (!String(label.text).includes('\n') && label.typography?.bounds?.h > 0 ? label.typography.bounds.h : 0);
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
  const searchOf = new Map((searches || []).filter(s => s?.glyphBounds).map(s => [s.labelId, s]));
  return labels.map(label => {
    const search = searchOf.get(label.id), g = search?.glyphBounds;
    if (!g || label.mode !== 'text') return label;
    const center = { x: g.x + g.w / 2, y: g.y + g.h / 2 };
    // 11-09 라벨 안정화: 고리까지 함께 지운 동그라미 글자는 동그라미 글자(㉠·ⓐ)로 복원한다(AI가 읽은 ㄱ·a가 아니라).
    const circled = search.text && search.text !== label.text ? { text: search.text } : null;
    return { ...label, ...(circled || {}), position: center, anchor: { ...center },
      typography: { ...(label.typography || {}), ...(circled ? { role: 'text' } : {}), bounds: { ...g } } };
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
  const luna = selection.model === AI_RETRY_FALLBACK_MODEL ? selection : { ...selection, model: AI_RETRY_FALLBACK_MODEL, effort: 'medium' };
  // 11-10(사용자 선택 「그림은 처음부터 Luna로」): 그림 생성은 첫 시도부터 Luna로 보낸다. Sol 6.1은 설치판에서 첨부 그림을 열지 못하고
  // 그림 없이 끝나는 일이 잦아(11-09 밤 교과서 첫 실행 8장 중 6장) 첫 시도가 늘 버려졌다. Luna가 실패하면 두 번째는 고른 모델, 세 번째는 다시 Luna.
  // 그 밖의 단계(글자 읽기 등)는 예전대로 고른 모델로 먼저 보내고, 실패하면 Luna로 보낸다.
  // 11-10: 그림 생성은 고른 모델(기본 Luna)로 한 번, 실패하면 반대 모델(Luna↔Sol)로 한 번만 보낸다. 둘 다 실패하면 호출 쪽이 원본 그림을 돌려준다.
  const otherGenerationModel = selection.model === AI_GENERATION_PRIMARY_MODEL ? AI_GENERATION_REGENERATE_MODEL : AI_GENERATION_PRIMARY_MODEL;
  const choiceFor = attempt => stage === 'generation'
    ? (attempt === 1 ? selection : { ...selection, model: otherGenerationModel, effort: 'medium' })
    : (total > 1 && attempt >= 2 ? luna : selection);
  for (let attempt = 1; attempt <= total; attempt++) {
    cancelled(signal);
    const choice = choiceFor(attempt);
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
        try { const next = choiceFor(attempt + 1); onRetry({ ...record, nextAttempt: attempt + 1, nextModel: next.model || null, switchedModel: (next.model || null) !== (choice.model || null) }); } catch {}
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
    generate(payload, { imageKind = 'general', local = false, examRedraw = false, signal } = {}) {
      cancelled(signal);
      if (imageKind === 'exam' && !local && !examRedraw) return Promise.reject(new Error('기출 전체 이미지 생성은 허용되지 않습니다.'));
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
    : phaseName === 'generation' ? AI_GENERATION_FAILED_NOTICE // 11-10: 실패 화면 대신 원본 그림 + 안내
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
  progress = null, onAiFailure = () => {}, onAiRetry = () => {}, retryPolicy = AI_RETRY_POLICY, regenerate = false,
  readText = null, legacyLabelPipeline = false, grayscale = grayscaleGeneratedPng } = {}) { // 11-10: legacyLabelPipeline=true면 예전 계약 프롬프트·관찰·검수 경로(내부용)
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
  // 11-10 사용자 결정(「기출 그림에서 라벨을 깔끔하게 지우고 선명하게 새로 그리는 것은 필수」): 「라벨 삭제」는 기출도 원본 위에서
  // 글자만 지우지 않고, 교과서처럼 글자를 뺀 선명한 그림을 한 번에 새로 그린다. 라벨 복원(편집 라벨)만 예전처럼 원본 픽셀을 지킨다.
  // 11-10: 라벨 복원(기본)도 기출은 「라벨 삭제」처럼 새로 그린다 — 켬·끔이 같은 그림을 쓰게 하려고.
  const readLabels = workflow.labelResult === 'restore-editable' && !verifyOnly && !legacyLabelPipeline;
  const examRedraw = workflow.imageKind === 'exam' && (workflow.labelResult === 'remove' || readLabels);
  const drawsNew = workflow.imageKind === 'general' || examRedraw;
  // 11-10: 기본 그림 경로는 짧은 프롬프트만 보낸다. 예전 계약 프롬프트는 내부 플래그(legacyLabelPipeline)에서만 쓴다.
  const legacyLabelPath = workflow.labelResult === 'restore-editable' && legacyLabelPipeline;
  // 11-10: 라벨 삭제 기본 흐름은 생성 뒤 AI 검수를 하지 않고 결과를 그대로 받는다.
  // 11-10: 예전 파이프라인(legacyLabelPipeline)은 라벨 삭제도 검수를 한다(내부 시험용).
  const reviewSkipped = workflow.labelResult === 'remove' && !verifyOnly && !legacyLabelPipeline;
  // 11-10: 사용자가 다시 그리기(새 변형·재생성·정밀 복원)를 요청한 생성은 Sol, 나머지(첫 생성·라벨 켬끔 전환)는 Luna. 라벨 켬끔은 같은 그림을 재사용해야 하므로 이전 결과로 바꾸지 않는다.
  const generationModel = !verifyOnly && (preciseRestore || regenerate === true) ? AI_GENERATION_REGENERATE_MODEL : AI_GENERATION_PRIMARY_MODEL;
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
  // 11-10: 기본 경로는 짧은 기출·교과서 프롬프트. 예전 buildSourceTracingPrompt는 라벨 복원(베타)에서만 쓴다.
  const generationPrompt = legacyLabelPath ? buildSourceTracingPrompt({ sourceFrame:generationFrame?.width ? {width:generationFrame.width,height:generationFrame.height} : undefined, preserveStyle:true }) : redrawPromptFor(workflow.imageKind);
  const generationPromptSha256 = await imageLabelDigest(generationPrompt);
  metrics.generationHarness = !drawsNew ? null
    : verifyOnly ? clone(previousCandidate?.workflowMetrics?.generationHarness || previousCandidate?.metrics?.generationHarness || null)
      : { id: IMAGE_LABEL_GENERATION_HARNESS, sourceTracingVersion:SOURCE_TRACING_CONTRACT_VERSION, promptSha256: generationPromptSha256,
        sourceSha256: await imageLabelDigest(imageSource.data) };
  // 11-10: 기본 경로는 사용자가 고른 화살표 제거를 요청 본문에 넣는다(예전 계약 경로는 selectedMarkInstructions가 담당).
  const arrowNote = !legacyLabelPath && workflow.scientificArrows === 'remove' ? REDRAW_SCIENTIFIC_ARROW_NOTE : '';
  let generationPayload, backgroundContract;
  if (drawsNew && !verifyOnly) {
    const preciseNote = preciseRestore ? '사용자가 그림 정밀 복원을 선택했습니다. 수정 전 선택 버전에서 요청한 구조 오류만 원본과 대조해 수정합니다.' : '';
    const text = legacyLabelPath
      ? approvedFirstRequestText({ prompt:generationPrompt, instructions: [generationInstructions, selectedMarkInstructions(workflow), examRedraw ? EXAM_REDRAW_INSTRUCTION : '', preciseNote].filter(Boolean).join('\n\n') })
      : redrawRequestText({ imageKind: workflow.imageKind, userRequest: [generationInstructions, arrowNote, preciseNote].filter(Boolean).join('\n\n') });
    generationPayload = { ...selection, model: generationModel, effort: 'medium', text,
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
  // 11-10: 그림 생성 한 번. 라벨 삭제와 라벨 복원(기본)이 같은 요청을 쓰므로 배경 캐시에서 같은 그림을 다시 쓴다.
  const generateBackground = () => phase('generation', () => resolveImageLabelBackground({ contract: backgroundContract,
      candidates: [previousCandidate, ...previousCandidates], cache: backgroundCache, signal,
      generate: async () => {
        const result = await runAiWithRetry({ stage: 'generation', selection: { model: generationPayload.model, effort: generationPayload.effort }, signal,
          attempts: 2, timeoutsMs: retryPolicy.generationTimeoutMs, backoffMs: retryPolicy.backoffMs, // 11-10: 고른 모델 → 반대 모델
          cancel: () => raster.cancel?.(), onFailure: onAiFailure, onRetry: onAiRetry,
          run: choice => {
            metrics.attempts.fullGeneration++;
            return raster.generate({ ...generationPayload, model: choice.model, effort: choice.effort }, { imageKind: workflow.imageKind, examRedraw, signal });
          } });
        metrics.calls.fullGeneration += result.imageToolCalls;
        const raw = await resolveGeneratedRaster(result.src, { whitePng: true });
        // 11-10: 새 기본 경로는 생성 PNG를 로컬에서 무채색으로 바꾼 뒤 캐시·맞춤·검사에 넘긴다(AI 호출 없음).
        // 라벨 켬·끔이 같은 픽셀을 쓰도록 생성 직후 한 번만 적용한다. 예전 계약 경로(legacyLabelPipeline)는 그대로 둔다.
        if (legacyLabelPipeline) return { data: raw, rendererPrompt: result.rendererPrompt };
        const gray = await grayscale(raw, { signal });
        metrics.grayscale = { applied: gray.applied, reason: gray.reason, ms: gray.ms };
        return { data: gray.data, rendererPrompt: result.rendererPrompt };
      } }));

  if (readLabels) {
    // 11-10: 라벨 복원(기본) — 그림 생성(라벨 삭제와 같은 그림)과 원본 글자 읽기를 Promise.all로 병렬 실행한다.
    // 글자 읽기가 실패하거나 빈 답이면 그림은 그대로 두고 라벨 0개 + 안내만 남긴다(변환을 실패로 끝내지 않는다). 검수는 하지 않는다.
    const readStarted = performance.now();
    const readOriginal = async () => {
      try {
        if (typeof readText !== 'function') throw new Error('글자 읽기 연결이 없습니다.');
        const read = await readText({ model: AI_LABEL_READ_MODEL, text: LABEL_READ_PROMPT, attachments: [source.data] });
        cancelled(signal);
        const text = typeof read?.text === 'string' ? read.text : '';
        return { items: parseLabelRead(text), notice: text.trim() ? null : AI_LABEL_READ_NOTICE, error: null };
      } catch (error) {
        if (error?.name === 'AbortError' || signal?.aborted) throw error;
        return { items: [], notice: AI_LABEL_READ_NOTICE, error: String(error?.message || error).slice(0, 200) };
      } finally { metrics.timings.labelRead = Math.round(performance.now() - readStarted); }
    };
    const [background, read] = await Promise.all([generateBackground(), readOriginal()]);
    let resultData = background.data;
    metrics.backgroundReused = background.reused;
    metrics.labelRead = { count: read.items.length, error: read.error };
    // 글자 상자를 원본 판에 맞춘다(라벨 삭제 경로의 켬·끔 맞춤과 같은 방법).
    if (background.reused !== 'candidate') {
      try {
        const frame = await fitCandidateToSource({ candidateDataUrl: resultData, sourceDataUrl: source.data,
          textBoxes: read.items.map(item => ({ x: item.x, y: item.y, w: item.w, h: item.h })), signal });
        if (frame.fitted) resultData = frame.data;
        metrics.reframe = { fitted: frame.fitted, reason: frame.reason || null, transform: frame.transform || null };
      } catch (error) { if (error?.name === 'AbortError') throw error; metrics.reframe = { fitted: false, reason: String(error?.message || error).slice(0, 200) }; }
    }
    cancelled(signal);
    const readPlan = labelPlanFromRead(read.items);
    const planSha256 = await imageLabelDigest(JSON.stringify(readPlan));
    const candidateSha256 = await imageLabelDigest(resultData);
    const candidateFrame = await imageFrame(resultData, signal);
    let sized = null;
    if (readPlan.labels.length) {
      try { sized = await measuredLabelSizes(source.data, readPlan.labels, signal); }
      catch (error) { if (error?.name === 'AbortError' || signal?.aborted) throw error; }
    }
    const report = { verdict: 'pass', checks: [], issues: [], reviewSkipped: true };
    metrics.reviewSkipped = true; metrics.cacheStored = false; metrics.cacheSkipReason = 'label-read-path';
    metrics.timings.total = Math.round(performance.now() - started);
    // 11-10: 라벨 크기는 readPlan의 라벨마다 정한 글자 상자 크기(measuredSize, sizeFromBox)를 그대로 쓴다. 잰 중앙값은 비율 기록용으로만 남긴다.
    const labelPlan = { ...clone(readPlan), labels: clone(readPlan.labels), sourcePlan: clone(readPlan),
      qualityReview: report, reviewRequired: false, targetPlacement: null, candidateSha256, ...(sized?.ratio ? { measuredLabelSize: sized.ratio } : {}) };
    cancelled(signal);
    return { version: IMAGE_LABEL_RUN_VERSION, accepted: true, status: 'complete', data: resultData, workflow, sourceSha256, sourceFrame,
      planSha256, candidateSha256, candidateFrame, sourceLabelPlan: clone(readPlan), targetPlacement: null, labelPlan, removalReport: null,
      report, rendererPrompt: background.rendererPrompt || '', labelVerificationPreview: null, labelProposals: null, finalLabelComposite: null, metrics,
      ...(read.notice ? { labelReadNotice: read.notice } : {}) };
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
  } else if (drawsNew && workflow.labelResult === 'remove' && !verifyOnly && !legacyLabelPipeline && typeof observer.blankPlan === 'function') {
    // 11-10(사용자 선택 「라벨 삭제 때 라벨 읽기 건너뛰기」): 교과서를 라벨 없이 새로 그릴 때는 그림 생성이 읽은 글자 목록을 쓰지 않으므로
    // AI 글자 읽기(약 25~40초)를 건너뛴다(교과서·기출 모두 라벨 삭제일 때). 대신 검수가 「이 글자들을 다 지웠는지」를 하나씩 대조하지 못하고 그림 전체를 직접 본다(사용자가 알고 고름).
    plan = await observer.blankPlan({ attachments, workflow, signal });
    metrics.sourceAnalysisSkipped = true;
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
  // 새로 그리는 기출(라벨 삭제)은 글자를 읽지 않으므로 라벨이 0개여도 원본으로 돌려보내지 않고 그린다.
  if (!drawsNew && workflow.imageKind === 'exam' && !plan.labels.length && !plan.removalOnlyItems?.length
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
  const descriptor = buildExactOutputCacheDescriptor({ engineVersion: IMAGE_LABEL_RUN_VERSION, styleVersion: drawsNew ? STYLE_CONTRACT_VERSION : workflow.version,
    mode: 'image-label-workflow', prompt: request, model: generationModel, effort: selection.effort, serviceTier: selection.serviceTier || null,
    outputOptions: { workflow, sourceSha256, planSha256, preciseRestore, sourceLabelPolicyVersion: SOURCE_LABEL_POLICY_VERSION, sourceObservationVersion: SOURCE_OBSERVATION_VERSION, sourceObservationContractRevision: SOURCE_OBSERVATION_CONTRACT_REVISION, labelModel: labelSelection.model, labelEffort: labelSelection.effort,
      generationHarness: metrics.generationHarness, generationInstructions, styleContractVersion: drawsNew ? STYLE_CONTRACT_VERSION : null,
      previousCandidateSha256: preciseRestore && previousCandidate?.data ? await imageLabelDigest(previousCandidate.data) : null } });
  const key = createExactOutputCacheKey(descriptor);
  if (cache && !bypassCache && !verifyOnly && !draftFirst) {
    const hit = await cache.get(key);
    const saved = hit?.hit && hit.entry?.output?.imageLabelRun;
    // 11-10: 검수를 건너뛴 라벨 삭제 결과(reviewSkipped)는 같은 설정이면 다시 쓸 수 있다.
    const skippedRemoveResult = saved?.report?.reviewSkipped === true && workflow.labelResult === 'remove';
    let valid = saved && saved.version === IMAGE_LABEL_RUN_VERSION && saved.accepted === true
      && saved.workflow?.version === workflow.version && JSON.stringify(saved.workflow) === JSON.stringify(workflow)
      && saved.sourceSha256 === sourceSha256 && saved.planSha256 === planSha256 && saved.candidateSha256 === await imageLabelDigest(saved.data)
      && (skippedRemoveResult || enforceImageLabelAcceptance(saved.report, { workflow, candidateSha256: saved.candidateSha256 }).strictAccepted)
      && (skippedRemoveResult || workflow.imageKind === 'exam' || saved.report?.styleReview?.version === STYLE_CONTRACT_VERSION && saved.report.styleReview.candidateSha256 === saved.candidateSha256)
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
  } else if (workflow.imageKind === 'exam' && !examRedraw) {
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
    const background = await generateBackground();
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
  if (progress && drawsNew && !verifyOnly) { progress.data = data; progress.rendererPrompt = rendererPrompt; }
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
  if (workflow.imageKind === 'exam' && !examRedraw && removalReport?.status !== 'complete') {
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
  if (reviewSkipped) {
    // 11-10: 라벨 삭제 기본 흐름은 검수 호출 없이 생성 그림을 그대로 받는다.
    metrics.reviewSkipped = true;
    report = { verdict: 'pass', checks: [], issues: [], reviewSkipped: true };
  } else if (useJoint || draftFirst) {
    report = jointPreview ? retainFinalVerification({report:jointReport,preview:jointPreview,composite,placement:targetPlacement}) : jointReport;
  } else try {
    report = await phase('review', () => {
      metrics.calls.review++;
      return workflow.labelResult === 'restore-editable'
        ? observer.reviewFinal({ ...labelSelection, attachments, plan, candidate: { name: '최종 후보', data }, composite, placement: targetPlacement, request, workflow })
        // 새로 그린 기출은 원본 픽셀 보존이 아니라 새로 그린 그림 기준(교과서와 같은 검수)으로 본다.
        : observer.review({ ...labelSelection, attachments, plan, candidate: { name: '최종 후보', data }, request, workflow: examRedraw ? { ...workflow, imageKind: 'general' } : workflow });
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
  // 11-10: 검수를 건너뛴 라벨 삭제 결과는 검수 기준으로 막지 않고 그대로 받는다(같은 설정이면 캐시에도 저장한다).
  const acceptance = reviewSkipped ? { accepted: true, strictAccepted: true, state: 'passed', report } : enforceImageLabelAcceptance(report, { workflow, candidateSha256 });
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
// 11-09 라벨 안정화: 그림 생성 AI는 정해진 크기(1024×1024·1536×1024·1024×1536)로만 그린다. 잘라 낸 국소 영역(예: 81×29)을 그대로
// 보내면 결과 크기가 늘 달라 국소 복원이 한 번도 적용되지 못하고 라벨이 보류됐다(실제 AI 3회: 그림 생성 1회 뒤 크기 검사에서 버림).
// 잘라 낸 영역에 흰 여백을 붙여 가장 가까운 생성 비율로 키워 보내고, 결과를 같은 비율로 되돌려 원래 영역만 잘라 쓴다.
const LOCAL_RESTORE_FRAMES = [[1024, 1024], [1536, 1024], [1024, 1536]];
export function localRestoreFrame(width, height) {
  const aspect = width / height, off = f => Math.abs(Math.log(f[0] / f[1] / aspect));
  const [fw, fh] = LOCAL_RESTORE_FRAMES.reduce((best, f) => off(f) < off(best) ? f : best);
  const scale = Math.min(fw / width, fh / height), dw = Math.round(width * scale), dh = Math.round(height * scale);
  return { fw, fh, dx: Math.floor((fw - dw) / 2), dy: Math.floor((fh - dh) / 2), dw, dh };
}
/** 국소 영역을 생성 틀 가운데에 키워 담는다(원본은 이웃 픽셀 보간, 마스크는 그대로 늘림). 여백은 fill 색. */
export function framedRgba(rgba, width, height, frame, fill, smooth) {
  const out = new Uint8Array(frame.fw * frame.fh * 4);
  for (let i = 0; i < frame.fw * frame.fh; i++) out.set(fill, i * 4);
  const sx = width / frame.dw, sy = height / frame.dh;
  for (let y = 0; y < frame.dh; y++) for (let x = 0; x < frame.dw; x++) {
    const o = ((frame.dy + y) * frame.fw + frame.dx + x) * 4;
    if (!smooth) {
      const i = (Math.min(height - 1, Math.floor((y + .5) * sy)) * width + Math.min(width - 1, Math.floor((x + .5) * sx))) * 4;
      out[o] = rgba[i]; out[o + 1] = rgba[i + 1]; out[o + 2] = rgba[i + 2]; out[o + 3] = 255; continue;
    }
    const fx = Math.min(width - 1, Math.max(0, (x + .5) * sx - .5)), fy = Math.min(height - 1, Math.max(0, (y + .5) * sy - .5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1), ax = fx - x0, ay = fy - y0;
    for (let k = 0; k < 3; k++) {
      const a = rgba[(y0 * width + x0) * 4 + k], b = rgba[(y0 * width + x1) * 4 + k], c = rgba[(y1 * width + x0) * 4 + k], d = rgba[(y1 * width + x1) * 4 + k];
      out[o + k] = Math.round((a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay);
    }
    out[o + 3] = 255;
  }
  return out;
}
/** Send only the selected crop. Merge permission remains the caller's immutable mask. */
export function createExamLocalRestore({ observer, raster, onPhase = () => {} }) {
  return async ({ data, width, height, mask, texts = [] }, { metrics, selection, signal }) => {
    cancelled(signal); onPhase('localRestore');
    const source = await pngUrl(data, width, height);
    const rgbaMask = new Uint8Array(width * height * 4);
    for (let i = 0; i < mask.length; i++) { rgbaMask[i * 4] = rgbaMask[i * 4 + 1] = rgbaMask[i * 4 + 2] = mask[i] ? 255 : 0; rgbaMask[i * 4 + 3] = 255; }
    const maskUrl = await pngUrl(rgbaMask, width, height);
    const frame = localRestoreFrame(width, height);
    const framedSource = await pngUrl(framedRgba(data, width, height, frame, [255, 255, 255, 255], true), frame.fw, frame.fh);
    const framedMask = await pngUrl(framedRgba(rgbaMask, width, height, frame, [0, 0, 0, 255], false), frame.fw, frame.fh);
    const restored = await raster.generate({ ...selection, attachments: [{ name: '원본 국소 영역', data: framedSource }, { name: '흰색 부분만 제거하는 마스크', data: framedMask }],
      text: '기출 원본의 국소 주석 복원이다. 첨부 crop 크기·비율·과학 구조를 유지한다. 두 번째 마스크의 흰 영역에 소속된 글자·지시선·끝점만 제거하고 그 아래 확인 가능한 과학 구조를 복원한다. 마스크 밖 관·혈관·윤곽·눈금은 유지한다. 없는 구조를 추측하지 않는다. 이미지 생성 도구를 이 국소 영역에 한 번만 호출한다. 전체 그림 생성·스타일 변환·추가 재시도는 금지한다. PNG 하나를 반환한다.' + ` 첨부 그림은 원본 국소 영역에 흰 여백을 붙여 ${frame.fw}×${frame.fh}로 키운 것이다. 같은 크기·같은 자리로 그린다.` + (texts.length ? ` 마스크 안에서 지울 것은 글자 ${texts.map(t => `「${t}」`).join('')}이다. 그 글자 획은 과학 구조가 아니다.` : '') }, { imageKind: 'exam', local: true, signal });
    metrics.calls.localRestore += restored.imageToolCalls;
    const src = await resolveGeneratedRaster(restored.src, { whitePng: true });
    const image = new Image(); image.src = src; await image.decode(); cancelled(signal);
    const sameCrop = image.naturalWidth === width && image.naturalHeight === height;
    if (!sameCrop && Math.abs(image.naturalWidth / image.naturalHeight / (frame.fw / frame.fh) - 1) > .02) throw new Error('국소 복원 결과 비율이 보낸 영역과 달라 적용하지 않았습니다.');
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (sameCrop) context.drawImage(image, 0, 0, width, height);
    else { const kx = image.naturalWidth / frame.fw, ky = image.naturalHeight / frame.fh; context.drawImage(image, frame.dx * kx, frame.dy * ky, frame.dw * kx, frame.dh * ky, 0, 0, width, height); }
    const pixels = context.getImageData(0, 0, width, height).data; canvas.width = canvas.height = 0;
    // 마스크 밖 변화는 적용할 때 어차피 버려진다. 검수는 실제로 적용될 모습(마스크 밖은 원본, 안만 AI 결과)을 보낸 틀 크기로 키워 본다
    // — 날것의 작은 결과를 보면 마스크 밖에서 바뀐 표식 때문에 거절하거나 작은 글자를 잘못 읽었다(11-09 실제 AI: 「A」를 지웠는데 「남아 있다」며 거절).
    const merged = new Uint8ClampedArray(data);
    for (let i = 0; i < mask.length; i++) if (mask[i]) merged.set(pixels.subarray(i * 4, i * 4 + 4), i * 4);
    const candidate = await pngUrl(framedRgba(merged, width, height, frame, [255, 255, 255, 255], true), frame.fw, frame.fh);
    metrics.calls.localReview++; onPhase('localReview'); const reviewStarted = performance.now();
    let checked;
    try { checked = await observer.reviewLocalRestore({ ...selection, model:'gpt-6-luna',effort:'medium', source: { name: '원본 국소 영역', data: framedSource }, candidate: { name: '국소 복원 결과', data: candidate }, mask: { name: '삭제 소속 마스크', data: framedMask }, removedTexts: texts }); }
    finally { metrics.timings.localReview = Math.round(performance.now() - reviewStarted); }
    cancelled(signal);
    return { data: merged, width, height, verified: checked.verified === true };
  };
}
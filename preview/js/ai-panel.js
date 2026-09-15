import { previewStorage as localStorage } from './preview-storage.js';
import { openAiCompositionEditor } from './ai-composition-editor.js';
import { registerEscapeLayer } from './escape-layers.js?v=1';
import { clearTaskWorkspaces, createTaskPersistence, createTaskWorkspaces, recoverTaskWorkspaceSnapshot } from './ai-task-workspaces.js';
import {
  advanceGenerationTiming,
  restoreGenerationTiming,
  sampleGenerationTiming,
  serializeGenerationTiming,
  startGenerationTiming,
} from './ai-generation-timing.js';
import { taskExportSelection } from './ai-task-export.js';
import { keyLabel, modKey } from './platform.js?v=1.4.0';
import {
  distributeSourcesToTaskTabs,
  groupSourcesInTaskTab,
  moveReferenceInComposition,
  normalizeReferenceComposition,
} from './ai-source-tasking.js?v=1';
import { setupAiWorkbench } from './ai-workbench.js';
import { mountDurableBatchUi } from './ai-batch-ui.js';
import { createScopedEditSession, confirmScopedEditSession, prepareScopedEditProposal, acceptScopedEditProposal, invalidateScopedEditSession } from './ai-scoped-edit-session.js';
import { decodeScopedPng } from './ai-scoped-edit-png.js';
import { createScopedEditComparison } from './ai-scoped-edit-comparison.js';
import { createImageCommentController, buildCommentRequest, PRESERVE_UNREQUESTED } from "./ai-image-comments.js?v=1";
import { IndexedDBOutputCacheBackend } from "./ai-output-cache-store.js?v=1.5.3";
import { insertImageFromSrc } from "./image-paste.js?v=1.4.0";
import { openEditableAssetsDialog } from "./ai-editable-assets-dialog.js";
import { insertEditableAssets } from "./ai-editable-assets.js";
import { prepareSeparatedAssets, SEPARATED_ASSETS_PROMPT } from "./ai-separated-assets.js";
import { buildDiscussionPrompt, buildImagePrompt } from "./ai-prompt.js?v=1.5.5";
import { IMAGE_BACKGROUND_VERSION, transparentizeGeneratedImage } from "./image-background.js?v=1.5.4";
import { parseAiEvent } from "./ai-events.js?v=1.5.3";
import {
  AI_IMAGE_TRANSPORT_VERSION,
  createCheapImageSignature,
  prepareAIImageForTransport,
} from "./ai-image-transport.js?v=1.5.3";
import {
  compactConversation,
  markImagesSent,
  selectOutgoingImageItems,
} from "./ai-request-plan.js?v=1.5.3";
import { buildFastScenePrompt, FAST_SCENE_PROMPT_VERSION } from "./ai-scene-prompt.js?v=1.5.3";
import { chooseImageEngine, IMAGE_ENGINE_IDS } from "./ai-engine-router.js?v=1.5.3";
import { compileFastScene } from "./ai-scene-fastpath.js?v=1.5.3";
import {
  compileFastSceneWithMotifs,
  expandAiMotifScene,
  MOTIF_CATALOG_VERSION,
} from "./ai-motif-catalog.js?v=1.5.3";
import {
  LOCAL_ASSET_ROUTER_VERSION,
  matchLocalAssetRequest,
} from "./ai-local-asset-router.js?v=1.5.3";
import { fastSceneToSvgDataUrl, insertFastSceneIntoState } from "./ai-scene-preview.js?v=1.5.3";
import {
  buildExactOutputCacheDescriptor,
  createExactOutputCacheKey,
  createRemoteImageInputPlan,
  REMOTE_INPUT_PLAN_VERSION,
} from "./ai-remote-input-plan.js?v=1.5.3";
import { composeReferenceImages } from './ai-reference-composite.js';
import {
  composeRemoteImageInputPlan,
  REMOTE_COMPOSITOR_VERSION,
} from "./ai-remote-compositor.js?v=1.5.3";
import { createExactOutputCacheStore } from "./ai-output-cache-store.js?v=1.5.3";
import { openPdfReferencePicker } from "./pdf-library/reference-picker.js";
import { getReferenceRole, partitionReferenceItems, planImageReferences } from "./ai-reference-roles.js";
import { normalizeMarkPolicy, buildMarkPolicyContract } from "./ai-mark-policy.js?v=1";
import { createStructureAnalysisController, formatStructureContract, STRUCTURE_SPEC_VERSION } from "./ai-structure-spec.js?v=1";
import { APPROVED_FIRST_PROMPT, APPROVED_FIRST_REQUEST, approvedFirstRun, prepareApprovedFirstAttachment } from './ai-approved-first-png.js';
import { WHITE_PNG_VERSION, isWhitePngWorkflow, buildWhitePngPrompt } from "./ai-white-png.js?v=1";
import {
  AI_IMAGE_GENERATION_EFFORT,
  AI_IMAGE_REVIEW_EFFORT,
  AI_IMAGE_REVIEW_MODEL,
  parseImageReviewReport,
  buildImageCorrectionRequest,
  buildStructuralInventory,
  createAiImageReviewController,
} from "./ai-image-review.js?v=1";
import { resolveGeneratedRaster } from "./ai-raster-output.js?v=1";
import {
  imageOutputOptionsKey,
  normalizeImageOutputOptions,
  resolveImageOutput,
} from "./ai-output-processing.js?v=1";
import { inspectPngDataUrl, enforcePngAcceptance } from "./ai-png-inspection.js?v=1";
import {
  enforceKiceImageRunInput,
  KICE_IMAGE_MODE,
  KICE_IMAGE_OUTPUT_ENGINE,
  kiceImageRequest,
} from "./kice-image-workflow.js?v=1.0.0";
import {
  AI_OUTPUT_ENGINES,
  AI_QUALITY_MODES,
  normalizeOutputEngine,
  normalizeQualityMode,
  qualityModeCacheVersion,
} from "./ai-quality-mode.js?v=1.5.5";

// This path never redraws a PNG through Canvas or registers a pending proposal.
export function scopedPngBytes(data) {
  if (!/^data:image\/png;base64,/i.test(data)) throw new Error('원본 PNG만 지원합니다. PNG 형식을 확인하세요.');
  return Uint8Array.from(atob(data.slice(data.indexOf(',') + 1)), c => c.charCodeAt(0));
}
export function scopedPngData(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return 'data:image/png;base64,' + btoa(binary);
}
export function scopedPixelRectangles(comments, width, height, candidateId) {
  const areas = (comments || []).filter(c => c.type === 'area');
  if (!areas.length) throw new Error('현재 선택한 생성 PNG에 명시적인 영역을 지정하세요. 점·참고 이미지·범위 없는 요청은 지원하지 않습니다.');
  return areas.map(c => {
    if ((c.imageId && c.imageId !== candidateId) || ![c.x,c.y,c.w,c.h].every(Number.isFinite)
      || c.x < 0 || c.y < 0 || c.w <= 0 || c.h <= 0 || c.x + c.w > 100 || c.y + c.h > 100) throw new Error('선택 이미지의 유효한 영역만 사용할 수 있습니다.');
    // Inward rounding: never silently expand the user's percentage rectangle.
    const rect = { x0: Math.ceil(c.x * width / 100), y0: Math.ceil(c.y * height / 100),
      x1: Math.floor((c.x + c.w) * width / 100), y1: Math.floor((c.y + c.h) * height / 100), coordinateSpace: 'selected-result-pixels' };
    if (rect.x0 >= rect.x1 || rect.y0 >= rect.y1) throw new Error('영역 안에 완전한 정수 픽셀이 없습니다. 더 큰 영역을 지정하세요.');
    return rect;
  });
}
export function scopedImageCompletionStatus(event, { hasImage, autoFinalizationSeen, userCancelled }) {
  const terminal = event.kind === 'done' || (event.kind === 'finalization' && ['confirmed', 'recovered'].includes(event.state));
  if (!terminal) return 'wait';
  if (userCancelled || !hasImage || event.error || event.status === 'failed') return 'reject';
  if (event.kind === 'finalization') return 'complete';
  if (event.status === 'completed' || (event.status === 'interrupted' && autoFinalizationSeen)) return 'complete';
  return 'reject';
}

export function isCloseActiveTaskShortcut(event, matchesPlatformModifier = modKey) {
  if (String(event?.key || '').toLowerCase() !== 'w' || event?.shiftKey || event?.isComposing || event?.repeat) return false;
  const altOnly = Boolean(event?.altKey) && !event?.metaKey && !event?.ctrlKey;
  const nativeModifierOnly = !event?.altKey
    && Boolean(event?.metaKey) !== Boolean(event?.ctrlKey)
    && matchesPlatformModifier(event);
  return altOnly || nativeModifierOnly;
}

export function taskDeleteShortcutHint() {
  return `앱 삭제: ${keyLabel('Ctrl+W')} · 웹 삭제: ${keyLabel('Alt+W')}`;
}

export function captureAiPasteTarget({ taskId, task, sources = [], revision = 0 } = {}) {
  return {
    taskId,
    task,
    revision,
    sources: sources.map(source => ({
      id: source?.id,
      data: source?.data,
      name: source?.name,
      referenceRole: source?.referenceRole,
    })),
  };
}

export function isAiPasteTargetCurrent(target, { taskId, task, sources = [], revision = 0 } = {}) {
  if (!target || target.taskId !== taskId || target.task !== task || target.revision !== revision) return false;
  if (target.sources.length !== sources.length) return false;
  return target.sources.every((source, index) => {
    const current = sources[index];
    return source.id === current?.id && source.data === current?.data && source.name === current?.name
      && source.referenceRole === current?.referenceRole;
  });
}

export async function pastedImageBlob(event, clipboard = globalThis.navigator?.clipboard) {
  const eventItem = Array.from(event?.clipboardData?.items || [])
    .find(item => String(item.type || '').startsWith('image/'));
  const eventFile = eventItem?.getAsFile?.();
  if (eventFile) return eventFile;
  if (typeof clipboard?.read !== 'function') return null;
  const clipboardItems = await clipboard.read();
  for (const item of clipboardItems || []) {
    const imageType = Array.from(item.types || []).find(type => String(type).startsWith('image/'));
    if (imageType) return item.getType(imageType);
  }
  return null;
}

export async function readAiClipboardImage(event, {
  clipboard = globalThis.navigator?.clipboard,
  readNative,
} = {}) {
  let browserError = null;
  try {
    const blob = await pastedImageBlob(event, clipboard);
    if (blob) return { blob, dataUrl: null };
  } catch (error) {
    browserError = error;
  }
  try {
    const dataUrl = await readNative?.();
    if (dataUrl) return { blob: null, dataUrl };
  } catch (nativeError) {
    throw new Error(`웹 클립보드: ${browserError?.message || '이미지 없음'} · 앱 클립보드: ${nativeError.message}`);
  }
  if (browserError) throw browserError;
  return { blob: null, dataUrl: null };
}

export function shouldHandleAiImagePaste(event, canReadSystemClipboard = false) {
  const types = Array.from(event?.clipboardData?.types || []);
  const eventHasImage = Array.from(event?.clipboardData?.items || [])
    .some(item => String(item.type || '').startsWith('image/'));
  if (eventHasImage) return true;
  const hasText = types.some(type => type === 'text/plain' || type === 'text/html')
    || Boolean(event?.clipboardData?.getData?.('text/plain'));
  if (hasText) return false;
  return canReadSystemClipboard;
}

export function dialogFocusTarget(activeElement, controls, backwards = false) {
  if (!controls?.length) return null;
  const current = controls.indexOf(activeElement);
  if (current < 0) return backwards ? controls.at(-1) : controls[0];
  return controls[(current + (backwards ? -1 : 1) + controls.length) % controls.length];
}
export async function runScopedPanelEdit({ getCurrent, comments, confirmBounds, generate, review, register, timingObserver, clock } = {}) {
  // This observer is deliberately best-effort: no timing or UI logging failure may affect an edit.
  const timingNow = typeof clock === 'function' ? clock : () => performance.now();
  const elapsed = startedAt => {
    try {
      const duration = Number(timingNow()) - startedAt;
      return Number.isFinite(duration) ? Math.max(0, duration) : 0;
    } catch { return 0; }
  };
  const reportTiming = (phase, startedAt, outcome) => {
    if (typeof timingObserver !== 'function') return;
    try { timingObserver({ phase, durationMs: elapsed(startedAt), outcome }); } catch { /* optional observer */ }
  };
  const cancellationOutcome = error => error?.name === 'AbortError' || error?.cancelled === true
    || error?.code === 'ABORT_ERR' || /취소|cancel/i.test(String(error?.message || ''));
  const measure = async (phase, action, outcomeForResult = () => 'completed') => {
    let startedAt = 0;
    try { startedAt = Number(timingNow()); } catch { startedAt = 0; }
    if (!Number.isFinite(startedAt)) startedAt = 0;
    try {
      const result = await action();
      reportTiming(phase, startedAt, outcomeForResult(result));
      return result;
    } catch (error) {
      reportTiming(phase, startedAt, cancellationOutcome(error) ? 'cancelled' : 'failed');
      throw error;
    }
  };
  let session;
  try {
    const { current, decoded } = await measure('prepare', async () => {
      const current = getCurrent();
      const decoded = await decodeScopedPng(current.sourcePng);
      return { current, decoded };
    });
    session = await measure('session', () => createScopedEditSession({ ...current,
      rectangles: scopedPixelRectangles(comments, decoded.width, decoded.height, current.candidateId) }));
    const boundsConfirmed = await measure('bounds-confirmation', () => confirmBounds(session), result => result ? 'completed' : 'cancelled');
    if (!boundsConfirmed) return false;
    await measure('scope-confirmation', () => confirmScopedEditSession(session, getCurrent));
    const raw = await measure('ai-generation', () => generate(session));
    const proposal = await measure('png-composite-validation', () => prepareScopedEditProposal(session, raw, getCurrent));
    const reviewed = await measure('candidate-review', () => review(proposal), result => result ? 'completed' : 'cancelled');
    if (!reviewed) return false;
    await measure('registration-display', async () => {
      const accepted = acceptScopedEditProposal(session, proposal, getCurrent);
      // register must check identity again after any asynchronous UI preparation.
      await register(accepted, () => {
        const live = getCurrent();
        return ['taskId','candidateId','epoch','selectionRevision'].every(k => live[k] === current[k])
          && live.sourcePng.length === current.sourcePng.length && live.sourcePng.every((v,i) => v === current.sourcePng[i]);
      });
    });
    return true;
  } finally { if (session) invalidateScopedEditSession(session); }
}

const RASTER_STYLE_VERSION = "kice-raster-v2";
const RASTER_ENGINE_VERSION = `imagegen-one-shot-v2+${REMOTE_INPUT_PLAN_VERSION}+${REMOTE_COMPOSITOR_VERSION}+${AI_IMAGE_TRANSPORT_VERSION}+${IMAGE_BACKGROUND_VERSION}`;
const FAST_SCENE_PANEL_COMPILE_VERSION = "motif-direct-v1";

export const AI_ASSET_GENERATION_MODES = Object.freeze({ SINGLE: 'single', SEPARATED: 'separated' });
export const AUTOMATIC_SEPARATION_OPTIONS = Object.freeze({ layout: 'auto', maxAssets: 128, maxDurationMs: 8_000 });
export const candidateUsesSeparatedAssets = item => item?.generationMode === AI_ASSET_GENERATION_MODES.SEPARATED;
export const candidateUsesAutomaticSeparation = item => item?.kind === 'generated'
  && !item?.sceneResult && !candidateUsesSeparatedAssets(item);
export async function automaticSeparationCacheKey(dataUrl, outputOptions = {}) {
  const prefix = 'data:image/png;base64,';
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix)) throw new TypeError('자동 분리 원본은 PNG 데이터여야 합니다.');
  const encoded = dataUrl.slice(prefix.length);
  const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  return `automatic-separation-v1:${hash}:${imageOutputOptionsKey(outputOptions)}:auto:128:8000`;
}
export const separatedCandidateNextAction = item => {
  if (!candidateUsesSeparatedAssets(item)) return 'ordinary-insert';
  return String(item?.separatedAssetsError || '').trim()
    ? 'manual-regions'
    : 'confirm-separated-result';
};
export const imagePromptForRun = runInput => runInput?.approvedFirstPng
  && runInput.generationMode === AI_ASSET_GENERATION_MODES.SEPARATED
  && Array.isArray(runInput.generated) && runInput.generated.length === 0
  ? `${APPROVED_FIRST_PROMPT}\n\n${SEPARATED_ASSETS_PROMPT}` : null;

export function cacheEntryCompletesRequest(entry, {
  engine = IMAGE_ENGINE_IDS.RASTER,
  qualityMode = AI_QUALITY_MODES.STANDARD,
} = {}) {
  const output = entry?.output;
  if (!output || output.complete !== true || output.cancelled === true || output.partial === true) return false;
  if (["failed", "error", "cancelled", "canceled", "running"].includes(String(output.status || "complete").toLowerCase())) return false;
  const needsCorrection = engine === IMAGE_ENGINE_IDS.RASTER
    && normalizeQualityMode(qualityMode) === AI_QUALITY_MODES.COMPLEX;
  return !needsCorrection || Number(output.complexPass) === 2;
}

export function resolveAiTerminalOutcome({
  status,
  imageReceived = false,
  cancelRequested = false,
} = {}) {
  const normalized = String(status || "completed").toLowerCase();
  if (["failed", "error"].includes(normalized)) return "failed";
  if (cancelRequested) return "cancelled";
  if (["cancelled", "canceled"].includes(normalized)) return "cancelled";
  if (normalized === "interrupted") return imageReceived ? "completed" : "cancelled";
  return normalized === "completed" ? "completed" : "failed";
}

export function aiTerminalStatusView(outcome, { imageReceived = false } = {}) {
  if (outcome === "failed") return { text: "변환에 실패했습니다. 입력과 코멘트는 보존되었습니다.", kind: "error" };
  if (outcome === "cancelled") return { text: "작업 취소됨", kind: "warn" };
  if (outcome === "completed" && imageReceived) return { text: "생성 완료", kind: "ok" };
  return null;
}

export function candidateReviewOnTerminal(candidate, outcome) {
  if (outcome !== "cancelled" || candidate?.reviewState !== "generating") return null;
  return {
    ...candidate.reviewMeta,
    state: "cancelled",
    candidateId: candidate.id,
    report: candidate.reviewReport,
  };
}

export function compilePanelScene(input, options) {
  try {
    const expanded = expandAiMotifScene(input);
    return {
      // Compile the original request so audited motif shortcuts retain their
      // direct compiler metadata and semantic object grouping. The expanded
      // scene remains the canonical editable/revision source.
      result: compileFastSceneWithMotifs(input, options),
      source: JSON.stringify(expanded),
      compileSource: typeof input === "string" ? input : JSON.stringify(input),
      expansionError: null,
    };
  } catch (error) {
    return {
      result: compileFastScene(input, options),
      source: String(input || ""),
      compileSource: String(input || ""),
      expansionError: error,
    };
  }
}

const isInputReference = item => { try { return getReferenceRole(item) === 'INPUT_SOURCE'; } catch { return false; } };

export function snapshotImageItem(item) {
  return {
    id: item?.id || null,
    name: item?.name || "이미지",
    data: item?.data || null,
    kind: item?.kind || "reference",
    sourceKind: item?.sourceKind || "auto",
    source: item?.source === undefined ? null : structuredClone(item.source),
    referenceRole: item?.referenceRole,
    primary: item?.primary === true,
    active: item?.active !== false,
    stale: item?.stale === true,
    superseded: item?.superseded === true,
    createdAt: item?.createdAt || null,
    updatedAt: item?.updatedAt || null,
    sentConversationId: item?.sentConversationId || null,
    sentSource: item?.sentSource || null,
    sceneSource: item?.sceneSource || "",
    sceneCompileSource: item?.sceneCompileSource || "",
    sceneResult: item?.sceneResult || null,
    engine: item?.engine || null,
    postprocessOk: item?.postprocessOk === true,
    pixelInspection: item?.pixelInspection || null,
    pixelInspectionError: item?.pixelInspectionError || null,
    separatedAssetsError: typeof item?.separatedAssetsError === 'string' ? item.separatedAssetsError : '',
    reviewState: item?.reviewState || "idle",
    reviewReport: item?.reviewReport ? JSON.parse(JSON.stringify(item.reviewReport)) : null,
    reviewMeta: item?.reviewMeta ? { ...item.reviewMeta } : null,
    structureRecord: item?.structureRecord ? JSON.parse(JSON.stringify(item.structureRecord)) : null,
    rendererPrompt: typeof item?.rendererPrompt === "string" ? item.rendererPrompt : "",
    generationMode: candidateUsesSeparatedAssets(item) ? AI_ASSET_GENERATION_MODES.SEPARATED : AI_ASSET_GENERATION_MODES.SINGLE,
    markPolicy: normalizeMarkPolicy(item?.markPolicy),
    nextCommentNumber: item?.nextCommentNumber || ((item?.comments || []).length + 1),
    comments: (item?.comments || []).map((comment) => ({ ...comment })),
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("이미지를 읽지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}

async function sourceToDataUrl(src) {
  if (typeof src !== "string" || !src) throw new Error("참고 이미지 주소가 없습니다.");
  if (/^data:image\//.test(src)) return src;
  const response = await fetch(src);
  if (!response.ok) throw new Error(`참고 이미지 불러오기 실패 (HTTP ${response.status})`);
  return blobToDataUrl(await response.blob());
}

function formatK(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "정보 없음";
  return `${(number / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}K`;
}

function findNumber(value, keys) {
  if (!value || typeof value !== "object") return null;
  for (const key of keys) if (Number.isFinite(Number(value[key]))) return Number(value[key]);
  for (const nested of Object.values(value)) {
    const found = findNumber(nested, keys);
    if (found != null) return found;
  }
  return null;
}

export function initAiPanel(state) {
  return createTaskWorkspaces(state, initAiTaskPanel, setupAiWorkbench);
}

export function createUnifiedAiSourceConsumer({ addReferencesAsTasks, setStatus }) {
  return Object.freeze({
    onAdd(reference) { addReferencesAsTasks([reference]); },
    onAddMany(references, options) { addReferencesAsTasks(references, options); },
    onStatus(message, kind) { setStatus(message, kind); },
  });
}

function groupedReferences(references, groups) {
  if (!Array.isArray(groups) || !groups.length) throw new Error("AI 작업대 그룹이 필요합니다.");
  return groups.map((indices, groupIndex) => {
    if (!Array.isArray(indices) || !indices.length) throw new Error(`${groupIndex + 1}번째 AI 작업대 그룹이 비어 있습니다.`);
    if (indices.length > 10) throw new Error(`${groupIndex + 1}번째 AI 작업대는 참고 이미지를 최대 10개까지 받을 수 있습니다.`);
    if (new Set(indices).size !== indices.length) throw new Error(`${groupIndex + 1}번째 AI 작업대에 같은 참고 이미지가 중복되었습니다.`);
    return indices.map((index) => {
      if (!Number.isInteger(index) || index < 0 || index >= references.length) throw new Error(`${groupIndex + 1}번째 AI 작업대의 자료 번호가 올바르지 않습니다.`);
      return references[index];
    });
  });
}

export async function acknowledgeActiveTaskClearCancellation({ tab, activeTaskTabId, interrupt }) {
  if (tab?.id !== activeTaskTabId || !['busy', 'running'].includes(tab?.workState)) {
    return { acknowledged: false };
  }
  const outcome = await interrupt();
  return { acknowledged: outcome?.ok === true };
}

function initAiTaskPanel(state, { panel, desktop, clientScope, newWorkspace, navigationChanged, workspaceEmpty, exportCollection, clearCollection }) {
  if (!panel) return;

  const modal = panel.querySelector(".modal-ai");
  const status = panel.querySelector("[data-ai-status]");
  const log = panel.querySelector("[data-ai-log]");
  const input = panel.querySelector("[data-ai-input]");
  const chatInput = panel.querySelector("[data-ai-chat-input]");
  const file = panel.querySelector("[data-ai-source-file]");
  const sourceMenuTrigger = panel.querySelector("[data-ai-source-menu-trigger]");
  const sourceMenu = panel.querySelector("[data-ai-source-menu]");
  if (sourceMenu && sourceMenuTrigger) sourceMenuTrigger.setAttribute("aria-controls", sourceMenu.id);
  const sourceMenuActions = Array.from(sourceMenu?.querySelectorAll("[data-ai-source-action]") || []);
  const replaceSourceButton = panel.querySelector("[data-ai-replace-source]");
  const replaceSourceFile = panel.querySelector("[data-ai-replace-source-input]");
  const chatApplyButton = panel.querySelector("[data-ai-chat-apply]");
  const pasteShortcut = panel.querySelector("[data-ai-paste-shortcut]");
  const syncSourceShortcutHints = () => {
    if (pasteShortcut) pasteShortcut.textContent = keyLabel('Ctrl+V');
  };
  const markArrows = panel.querySelector("[data-ai-mark-arrows]");
  const markTrends = panel.querySelector("[data-ai-mark-trends]");
  const markLeaders = panel.querySelector("[data-ai-mark-leaders]");
  const markControls = [markArrows, markTrends, markLeaders];
  const readMarkPolicy = () => normalizeMarkPolicy({arrows:markArrows?.value,trendLines:markTrends?.value,leaders:markLeaders?.value});
  const restoreMarkPolicy = value => {const p=normalizeMarkPolicy(value);if(markArrows)markArrows.value=p.arrows;if(markTrends)markTrends.value=p.trendLines;if(markLeaders)markLeaders.value=p.leaders;};
  const previews = panel.querySelector("[data-ai-previews]");
  const attachmentList = panel.querySelector("[data-ai-attachment-list]");
  const referenceCount = panel.querySelector("[data-ai-reference-count]");
  const referenceSection = panel.querySelector(".ai-reference-section");
  const generating = panel.querySelector("[data-ai-generating]");
  const progressTitle = panel.querySelector("[data-ai-progress-title]");
  const progressDetail = panel.querySelector("[data-ai-progress-detail]");
  const progressStage = panel.querySelector("[data-ai-progress-stage]");
  const elapsedTime = panel.querySelector("[data-ai-elapsed]");
  const eCount = panel.querySelector("[data-ai-e-count]");
  const sendButton = panel.querySelector("[data-ai-send]");
  const chatButton = panel.querySelector("[data-ai-chat-send]");
  const newButton = panel.querySelector("[data-ai-new]");
  const retryInterruptedButton = document.createElement('button');
  retryInterruptedButton.type = 'button';
  retryInterruptedButton.dataset.aiRetryInterrupted = '';
  retryInterruptedButton.className = 'modal-btn';
  retryInterruptedButton.textContent = '중단 작업 다시 시도';
  retryInterruptedButton.hidden = true;
  const collectiveExportMode = document.createElement('select');
  collectiveExportMode.dataset.aiTaskExportMode = '';
  collectiveExportMode.setAttribute('aria-label', '여러 작업 저장 범위');
  for (const [value, label] of [['selected', '작업별 선택 결과'], ['all', '모든 결과 버전']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    collectiveExportMode.append(option);
  }
  collectiveExportMode.value = 'selected';
  const collectiveExportButton = document.createElement('button');
  collectiveExportButton.type = 'button';
  collectiveExportButton.dataset.aiTaskExport = '';
  collectiveExportButton.textContent = '한 폴더에 저장';
  collectiveExportButton.title = '여러 작업의 결과를 충돌 없는 이름으로 한 폴더에 저장';
  const collectiveExportControls = document.createElement('div');
  collectiveExportControls.className = 'ai-task-export-controls';
  collectiveExportControls.style.cssText = 'display:grid;gap:5px;padding:7px 6px;border-top:1px solid var(--border);';
  collectiveExportMode.style.cssText = 'width:100%;min-width:0;';
  collectiveExportButton.style.cssText = 'width:100%;min-width:0;';
  retryInterruptedButton.style.cssText = 'width:100%;min-width:0;';
  collectiveExportControls.append(retryInterruptedButton, collectiveExportMode, collectiveExportButton);
  (panel.querySelector('[data-ai-tabs]') || panel.querySelector('[data-ai-tab-list]'))?.after(collectiveExportControls);
  const compareButton = panel.querySelector("[data-ai-compare]");
  const captureButton = panel.querySelector("[data-ai-capture]");
  const referenceSearchButton = panel.querySelector("[data-ai-reference-search]");
  const loginButton = panel.querySelector("[data-ai-login]");
  const modelSelect = panel.querySelector("[data-ai-model]");
  const modelWarning = panel.querySelector("[data-ai-model-warning]");
  const effortSelect = panel.querySelector("[data-ai-effort]");
  const speedSelect = panel.querySelector("[data-ai-speed]");
  const accountText = panel.querySelector("[data-ai-account]");
  const limitText = panel.querySelector("[data-ai-limit]");
  const accountTokensText = panel.querySelector("[data-ai-account-tokens]");
  const modeButtons = Array.from(panel.querySelectorAll("[data-ai-mode]"));
  const qualityButtons = Array.from(panel.querySelectorAll("[data-ai-quality]"));
  const outputEngineButtons = Array.from(panel.querySelectorAll("[data-ai-output-engine]"));
  const conversionSummary = panel.querySelector("[data-ai-conversion-summary]");
  const generationModeRow = document.createElement('label');
  generationModeRow.className = 'ai-separated-mode';
  generationModeRow.innerHTML = '<span>이미지 구성</span><select data-ai-generation-mode aria-label="이미지 구성 방식"><option value="single">한 장</option><option value="separated">물체별 분리 (실험)</option></select><small>실험 · 최대 16개 · 겹친 부품은 함께 생성됩니다.<br>내부 선은 벡터화하지 않습니다.</small>';
  const generationModeSelect = generationModeRow.querySelector('select');
  const outputProcessing = panel.querySelector('[data-ai-output-processing]');
  if (!outputProcessing) throw new Error('이미지 구성 선택을 표시할 위치가 없습니다.');
  outputProcessing.prepend(generationModeRow);
  const outputProcessingStatus = panel.querySelector('[data-ai-output-processing-status]');
  const backgroundPolicySelect = panel.querySelector('select[data-ai-background-policy]');
  const examPaletteSelect = panel.querySelector('select[data-ai-exam-palette]');
  const lineThicknessSelect = panel.querySelector('select[data-ai-line-thickness]');
  const batchButton = panel.querySelector("[data-ai-batch]");
  const batchPanel = panel.querySelector("[data-ai-batch-panel]");
  const batchGrid = panel.querySelector("[data-ai-batch-grid]");
  const batchSummary = panel.querySelector("[data-ai-batch-summary]");
  const tabList = panel.querySelector("[data-ai-tab-list]");
  const tabNewButton = panel.querySelector("[data-ai-tab-new]");
  const tabClearButton = panel.querySelector("[data-ai-tab-clear]");
  const reviewModeCheckbox = panel.querySelector("[data-ai-review-mode]");
  const reviewModelSelect = panel.querySelector("[data-ai-review-model]");
  const reviewEffortSelect = panel.querySelector("[data-ai-review-effort]");
  if (reviewModeCheckbox && !reviewModeCheckbox.hasAttribute("checked")) reviewModeCheckbox.checked = true;

  let attachments = [];
  let generatedImages = [];
  let referenceComposition = normalizeReferenceComposition(null, attachments);
  let imageSerial = 0;
  let conversationId = localStorage.getItem(`5e.aiConversationId${clientScope ? ":" + clientScope : ""}`) || null;
  let forceNewConversation = false;
  let busy = false;
  let imageReceived = false;
  let currentTurnType = "chat";
  let currentTurnUsage = null;
  let currentTurnPerformance = null;
  let currentTurnDone = false;
  let currentTurnId = null;
  let currentRenderThreadId = null;
  let awaitingTurnId = false;
  let queuedTurnEvents = [];
  let currentImageEventKeys = new Set();
  let currentRequestEpoch = 0;
  let serverTurnFinished = false;
  let previewPending = false;
  let tokenFooterNode = null;
  let currentTurnStartedAt = 0;
  let latestGeneratedSrc = null;
  let currentEngine = IMAGE_ENGINE_IDS.RASTER;
  let currentSceneResponse = "";
  let currentCacheRequest = null;
  let pendingCacheOutput = null;
  let currentCancelRequested = false;
  let currentTerminalOutcome = null;
  let currentImageOutputError = null;
  let currentRequestSnapshot = null;
  let providerRequestPersistable = false;
  let scopedSelectionRevision = 0;
  let scopedTransport = null;
  let currentRunInput = null;
  let currentReviewCandidate = null;
  let currentReviewScheduled = false;
  let imageReview = null;
  const structureAnalysis = createStructureAnalysisController({ transport: { send: p => desktop.send(p), interrupt: () => desktop.interrupt() } });
  let selectedCandidateId = null;
  let generationTiming = null;
  let generationTimingTimer = null;
  let generationLongWaitShown = false;
  let availableModels = [];
  let modelsLoaded = false;
  let selectedMode = KICE_IMAGE_MODE;
  let selectedQualityMode = normalizeQualityMode(localStorage.getItem("5e.aiQualityMode") || AI_QUALITY_MODES.STANDARD);
  let selectedOutputEngine = KICE_IMAGE_OUTPUT_ENGINE;
  let selectedAssetGenerationMode = AI_ASSET_GENERATION_MODES.SINGLE;
  let selectedImageOutputOptions = normalizeImageOutputOptions({
    backgroundPolicy: localStorage.getItem('5e.aiOutputBackgroundPolicy') || undefined,
    examPalette: localStorage.getItem('5e.aiOutputExamPalette') === 'true',
    lineThickness: Number(localStorage.getItem('5e.aiOutputLineThickness')),
  });
  const outputVariantCache = new WeakMap();
  const automaticSeparationCache = new Map();
  let automaticSeparationRun = null;
  let outputProcessingRevision = 0;
  let exportInProgress = false;
  let taskTabSerial = 0;
  let activeTaskTabId = null;
  const taskTabs = new Map();
  const batchRuns = new Map();
  const unclaimedBatchEvents = [];
  let batchActive = false;
  let durableBatchUi = null;
  let conversationMessages = [];
  let outputCache = null;
  try { outputCache = createExactOutputCacheStore(); } catch {}
  try {
    const storedMessages = JSON.parse(localStorage.getItem(`5e.aiConversationMessages${clientScope ? ":" + clientScope : ""}`) || "[]");
    if (Array.isArray(storedMessages)) conversationMessages = storedMessages.slice(-20);
  } catch {}

  const saveConversationMessages = () => {
    const bounded = conversationMessages.slice(-20);
    localStorage.setItem(`5e.aiConversationMessages${clientScope ? ":" + clientScope : ""}`, JSON.stringify(bounded));
  };
  const recordConversationMessage = (role, text) => {
    const value = String(text || "").trim();
    if (!value) return;
    conversationMessages.push({ role, text: value.slice(0, 4000) });
    conversationMessages = conversationMessages.slice(-20);
    saveConversationMessages();
  };

  const persistPerformance = (metrics) => {
    if (!metrics || typeof metrics !== "object") return;
    try {
      const key = "5e.aiPerformance.v1";
      const history = JSON.parse(localStorage.getItem(key) || "[]");
      const records = Array.isArray(history) ? history : [];
      records.push({
        at: new Date().toISOString(),
        model: modelSelect?.value || null,
        effort: effortSelect?.value || null,
        serviceTier: speedSelect?.value || null,
        ...metrics,
      });
      localStorage.setItem(key, JSON.stringify(records.slice(-50)));
    } catch {}
  };

  const prepareTransportItem = async (item) => {
    const ensureBase64Transport = (dataUrl) => {
      const comma = typeof dataUrl === "string" ? dataUrl.indexOf(",") : -1;
      const header = comma >= 0 ? dataUrl.slice(0, comma) : "";
      if (!/^data:image\//i.test(header) || !/;base64$/i.test(header) || /^data:image\/svg\+xml/i.test(header)) {
        throw new Error(`${item.name}: AI 전송용 래스터 이미지로 변환하지 못했습니다.`);
      }
    };
    const sourceSignature = createCheapImageSignature(item.data);
    if (item.aiTransport?.sourceSignature === sourceSignature) {
      ensureBase64Transport(item.aiTransport.transportDataUrl);
      if (item.aiTransport.transportDataUrl.length > 11_000_000) {
        throw new Error(`${item.name}: 참고 이미지 최적화에 실패해 8MB 제한을 넘었습니다.`);
      }
      return { name: item.name, data: item.aiTransport.transportDataUrl };
    }
    const prepared = await prepareAIImageForTransport(item.data, {
      contentKind: item.kind === "generated" ? "line-art" : (item.sourceKind || "auto"),
      preservePng: item.sourceKind !== "capture",
    });
    item.aiTransport = prepared;
    ensureBase64Transport(prepared.transportDataUrl);
    if (prepared.transportDataUrl.length > 11_000_000) {
      throw new Error(`${item.name}: 참고 이미지 최적화에 실패해 8MB 제한을 넘었습니다.`);
    }
    return { name: item.name, data: prepared.transportDataUrl };
  };

  const effortLabels = {
    minimal: "최소 · 가장 빠름", low: "낮음 · 빠름", medium: "보통",
    high: "높음 · 정밀", xhigh: "매우 높음", max: "최대", ultra: "울트라",
  };

  const addLog = (text, kind = "assistant") => {
    if (!text) return null;
    if (text === APPROVED_FIRST_REQUEST || text === APPROVED_FIRST_PROMPT || text === SEPARATED_ASSETS_PROMPT) {
      text = "이미지 변환을 요청했습니다.";
      kind = "assistant";
    }
    log.querySelector("[data-ai-log-empty]")?.remove();
    const message = document.createElement("div");
    message.className = `ai-msg ${kind}`;
    message.textContent = text;
    log.appendChild(message);
    log.scrollTop = log.scrollHeight;
    return message;
  };
  const addTokenFooter = (usage) => {
    const total = findNumber(usage, ["totalTokens", "total_tokens"]);
    const inputTokens = findNumber(usage, ["inputTokens", "input_tokens"]);
    const outputTokens = findNumber(usage, ["outputTokens", "output_tokens"]);
    const measuredMs = Number(currentTurnPerformance?.totalMs);
    const elapsedSeconds = Number.isFinite(measuredMs)
      ? Math.max(1, Math.round(measuredMs / 1000))
      : (currentTurnStartedAt ? Math.max(1, Math.round((Date.now() - currentTurnStartedAt) / 1000)) : null);
    if (total == null && inputTokens == null && outputTokens == null && elapsedSeconds == null) return;
    if (!tokenFooterNode) {
      tokenFooterNode = document.createElement("div");
      tokenFooterNode.className = "ai-turn-usage";
      log.appendChild(tokenFooterNode);
    }
    tokenFooterNode.textContent = [
      currentTurnPerformance?.cacheHit ? "완료된 동일 요청 결과를 불러왔습니다." : "작업이 완료되었습니다.",
      elapsedSeconds != null ? `소요 ${elapsedSeconds}초` : null,
    ].filter(Boolean).join(" · ");
    log.scrollTop = log.scrollHeight;
  };
  const setStatus = (text, kind = "") => {
    status.textContent = text;
    status.dataset.kind = kind;
    if (busy && kind === "error") setTaskState("failed");
  };
  const closeSourceMenu = ({ restoreFocus = false } = {}) => {
    if (!sourceMenu || !sourceMenuTrigger) return;
    sourceMenu.hidden = true;
    sourceMenuTrigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) sourceMenuTrigger.focus();
  };
  const openSourceMenu = ({ focus = "first" } = {}) => {
    if (!sourceMenu || !sourceMenuTrigger || sourceMenuTrigger.disabled) return;
    sourceMenu.hidden = false;
    sourceMenuTrigger.setAttribute("aria-expanded", "true");
    const enabled = sourceMenuActions.filter((button) => !button.disabled);
    (focus === "last" ? enabled.at(-1) : enabled[0])?.focus();
  };
  const imageOutputSummary = () => {
    const background = {
      preserve: '흰 배경과 투명도를 원본대로 유지',
      connected: '물체 바깥의 흰색만 투명하게 처리',
      'all-near-white': '물체 안쪽을 포함한 모든 흰색을 투명하게 처리',
      checkerboard: '파일 픽셀에 그려진 반복 체크무늬를 찾아 투명하게 처리 (미리보기 격자 제외)',
    }[selectedImageOutputOptions.backgroundPolicy];
    const thickness = selectedImageOutputOptions.lineThickness
      ? `선 굵기 +${selectedImageOutputOptions.lineThickness}px` : '원본 굵기';
    return `${background} · ${selectedImageOutputOptions.examPalette ? '평가원용 무채색으로 단순화' : '원본 색상 유지'} · ${thickness}`;
  };
  const syncOutputProcessingUi = () => {
    if (outputProcessing) outputProcessing.hidden = selectedOutputEngine === AI_OUTPUT_ENGINES.ASSET;
    if (backgroundPolicySelect) {
      const legacyOption = backgroundPolicySelect.querySelector('[data-ai-legacy-output-option]');
      if (selectedImageOutputOptions.backgroundPolicy === 'checkerboard' && !legacyOption) {
        const option = document.createElement('option');
        option.value = 'checkerboard';
        option.textContent = '이전 작업 설정 유지';
        option.disabled = true;
        option.dataset.aiLegacyOutputOption = '';
        backgroundPolicySelect.append(option);
      } else if (selectedImageOutputOptions.backgroundPolicy !== 'checkerboard') {
        legacyOption?.remove();
      }
      backgroundPolicySelect.value = selectedImageOutputOptions.backgroundPolicy;
      backgroundPolicySelect.disabled = busy;
    }
    if (examPaletteSelect) {
      examPaletteSelect.value = String(selectedImageOutputOptions.examPalette);
      examPaletteSelect.disabled = busy;
    }
    if (lineThicknessSelect) {
      lineThicknessSelect.value = String(selectedImageOutputOptions.lineThickness);
      lineThicknessSelect.disabled = busy;
    }
    if (outputProcessingStatus) outputProcessingStatus.textContent = imageOutputSummary();
  };
  const resolveOutputVariant = (item) => {
    if (!item) return Promise.reject(new Error('선택한 결과가 없습니다.'));
    const key = imageOutputOptionsKey(selectedImageOutputOptions);
    let variants = outputVariantCache.get(item);
    if (!variants) { variants = new Map(); outputVariantCache.set(item, variants); }
    if (!variants.has(key)) {
      const pending = resolveImageOutput(item, selectedImageOutputOptions, transparentizeGeneratedImage)
        .catch((error) => { variants.delete(key); throw error; });
      variants.set(key, pending);
    }
    return variants.get(key);
  };
  const renderOutputVariant = async (item, image, revision = outputProcessingRevision) => {
    if (!item || !image || item.kind !== 'generated' || item.sceneResult) return;
    const key = imageOutputOptionsKey(selectedImageOutputOptions);
    try {
      const source = await resolveOutputVariant(item);
      if (revision !== outputProcessingRevision || key !== imageOutputOptionsKey(selectedImageOutputOptions) || item.outputImage !== image) return;
      image.src = source;
      image.classList.toggle('ai-output-transparent', selectedImageOutputOptions.backgroundPolicy !== 'preserve');
      if (outputProcessingStatus) outputProcessingStatus.textContent = imageOutputSummary();
    } catch (error) {
      if (revision !== outputProcessingRevision) return;
      image.src = item.data;
      image.classList.remove('ai-output-transparent');
      if (outputProcessingStatus) outputProcessingStatus.textContent = `결과 처리 실패: ${error.message}`;
    }
  };
  const refreshOutputPreviews = () => {
    const revision = ++outputProcessingRevision;
    if (!generatedImages.some((item) => !item.sceneResult)) { syncOutputProcessingUi(); return; }
    if (outputProcessingStatus) outputProcessingStatus.textContent = '선택한 방식으로 결과를 처리하는 중…';
    for (const item of generatedImages) void renderOutputVariant(item, item.outputImage, revision);
  };
  const emptyReviewReport = () => ({ verdict: "uncertain", checks: [], issues: [] });
  const scopedAppliedReviewReport = () => ({
    verdict: "",
    checks: [
      { id: "outside-preserved", label: "영역 밖 픽셀", status: "pass", detail: "보존 확인됨" },
      { id: "visual-qa", label: "시각 품질", status: "skipped", detail: "자동 검수하지 않았습니다." },
    ],
    issues: [],
  });
  const isAcceptedReviewState = (state) => state === "passed" || state === "scoped-applied";
  const selectedReviewStatusText = (state) => state === "scoped-applied"
    ? "선택 결과 · 부분 수정 적용 완료"
    : "선택 결과 · 자동 시각 검수 통과";
  const dispatchReviewEvent = (detail, candidate = null) => {
    const normalized = {
      pixelInspection: detail?.pixelInspection || candidate?.pixelInspection || null,
      state: detail?.state || "idle",
      candidateId: detail?.candidateId || candidate?.id || null,
      report: detail?.report ? JSON.parse(JSON.stringify(detail.report)) : emptyReviewReport(),
      generationCount: Number(detail?.generationCount || 0),
      reviewCount: Number(detail?.reviewCount || 0),
      model: detail?.model || AI_IMAGE_REVIEW_MODEL,
      effort: detail?.effort || AI_IMAGE_REVIEW_EFFORT,
      elapsedMs: Math.max(0, Number(detail?.elapsedMs || 0)),
    };
    const item = candidate || generatedImages.find((entry) => entry.id === normalized.candidateId);
    if (item) {
      item.reviewState = normalized.state;
      item.reviewReport = normalized.report;
      item.reviewMeta = {
        generationCount: normalized.generationCount,
        reviewCount: normalized.reviewCount,
        model: normalized.model,
        effort: normalized.effort,
        elapsedMs: normalized.elapsedMs,
      };
      if (item.card) {
        item.card.dataset.aiCandidateId = item.id;
        item.card.dataset.aiReviewState = normalized.state;
      }
    }
    panel.dispatchEvent(new CustomEvent("5e:ai-review", { detail: normalized }));
    return normalized;
  };
  const generationPhaseCopy = Object.freeze({
    accepted: "요청 수락",
    "image-generating": "이미지 생성 시작",
    "image-received": "이미지 수신",
    postprocessing: "로컬 후처리 중",
    "awaiting-terminal": "서버 종료 확인 중",
  });
  const generationOutcomeCopy = Object.freeze({
    completed: "이미지 준비 완료",
    "no-image": "이미지 없는 응답",
    failed: "작업 실패",
    cancelled: "작업 취소",
    interrupted: "작업 중단",
  });
  const taskTimingLabel = (tab, view) => {
    if (view.available) return view.formatted;
    return (tab?.workState === "idle" && !(tab.generated?.length || tab.conversationMessages?.length)) ? "실행 전" : "시간 알 수 없음";
  };
  const updateTaskTimingLabels = (tab, label) => {
    for (const row of document.querySelectorAll?.("[data-tab-id]") || []) {
      if (row.dataset.tabId === tab?.id) {
        const node = row.querySelector(".ai-task-tab-time");
        if (node) node.textContent = label;
      }
    }
  };
  const stopGenerationTimingTimer = () => {
    if (generationTimingTimer) clearInterval(generationTimingTimer);
    generationTimingTimer = null;
  };
  const renderGenerationTiming = ({ pendingAcceptance = false } = {}) => {
    const tab = taskTabs.get(activeTaskTabId);
    if (pendingAcceptance) {
      if (progressStage) progressStage.textContent = "요청 수락 대기";
      if (elapsedTime) { elapsedTime.textContent = "수락 대기"; elapsedTime.dateTime = ""; }
      if (eCount) eCount.textContent = "1";
      return null;
    }
    const sampled = sampleGenerationTiming(generationTiming, Date.now());
    generationTiming = sampled.timing;
    if (tab && generationTiming) tab.generationTiming = generationTiming;
    const { view } = sampled;
    const label = taskTimingLabel(tab, view);
    if (progressStage) progressStage.textContent = view.phase === "terminal"
      ? (generationOutcomeCopy[view.outcome] || "작업 종료")
      : (generationPhaseCopy[view.phase] || (view.available ? "상태 확인 중" : "시간 정보 없음"));
    if (elapsedTime) {
      elapsedTime.textContent = label;
      elapsedTime.dateTime = view.elapsedMs == null ? "" : `PT${Math.floor(view.elapsedMs / 1000)}S`;
    }
    if (generating) generating.dataset.aiPhase = view.phase || "unknown";
    if (eCount) eCount.textContent = String(({ accepted:1, "image-generating":2, "image-received":3, postprocessing:4, "awaiting-terminal":5, terminal:5 })[view.phase] || 1);
    if (tab) updateTaskTimingLabels(tab, label);
    if (view.running && view.elapsedMs >= 90_000 && !generationLongWaitShown) {
      generationLongWaitShown = true;
      progressDetail.textContent = "90초 넘게 응답을 기다리고 있습니다. 작업 취소로 중단할 수 있으며 자동 재시도하지 않습니다.";
    }
    if (!view.running) stopGenerationTimingTimer();
    return view;
  };
  const startGenerationClock = turnId => {
    generationTiming = startGenerationTiming({ turnId, acceptedAtMs: Date.now() });
    generationLongWaitShown = false;
    renderGenerationTiming();
    stopGenerationTimingTimer();
    generationTimingTimer = setInterval(() => renderGenerationTiming(), 1_000);
    persistTasks();
  };
  const advanceGenerationClock = (type, outcome = undefined, turnId = currentTurnId) => {
    if (currentTurnType !== "image" || !generationTiming || !turnId) return null;
    const previous = generationTiming;
    generationTiming = advanceGenerationTiming(generationTiming, { turnId, type, outcome }, Date.now());
    const view = renderGenerationTiming();
    if (generationTiming !== previous) {
      persistTasks();
      if (view && !view.running) void taskPersistence.checkpoint().catch(() => {});
    }
    return view;
  };
  const setGenerating = (on, title = "이미지를 생성하고 있습니다", detail = "런타임 이벤트를 기다리고 있습니다.") => {
    generating.hidden = !on;
    progressTitle.textContent = title;
    progressDetail.textContent = detail;
    if (on && currentTurnType === "image" && awaitingTurnId) renderGenerationTiming({ pendingAcceptance: true });
    else renderGenerationTiming();
  };
  const setBusy = (on) => {
    busy = on;
    if (on) closeSourceMenu();
    if (on) setTaskState("busy");
    else if (taskTabs.get(activeTaskTabId)?.workState === "busy") setTaskState("idle");
    panel.dataset.aiBusy = String(on);
    navigationChanged();
    sendButton.disabled = on;
    input.disabled = on || (isWhitePngWorkflow({ mode: selectedMode, outputEngine: selectedOutputEngine }) && generatedImages.length === 0);
    chatButton.disabled = on;
    if (chatInput) chatInput.disabled = on;
    if (newButton) newButton.disabled = false;
    for (const control of [modelSelect, effortSelect, speedSelect, generationModeSelect, sourceMenuTrigger, ...sourceMenuActions, referenceSearchButton, captureButton, file, replaceSourceButton, replaceSourceFile, chatApplyButton, reviewModeCheckbox, reviewModelSelect, reviewEffortSelect, ...markControls]) {
      if (control) control.disabled = on;
    }
    modeButtons.forEach((button) => { button.disabled = on; });
    qualityButtons.forEach((button) => { button.disabled = on; });
    outputEngineButtons.forEach((button) => { button.disabled = on; });
    syncOutputProcessingUi();
    syncReferenceSummary();
    if (batchButton) batchButton.disabled = on || attachments.length < 2 || (isWhitePngWorkflow({ mode: selectedMode, outputEngine: selectedOutputEngine }) && reviewModeCheckbox?.checked !== false);
    if (tabNewButton) tabNewButton.disabled = false;
    panel.querySelectorAll("[data-ai-input-mutator]").forEach((control) => { control.disabled = on; });
    retryInterruptedButton.disabled = on || !taskTabs.get(activeTaskTabId)?.retryRequest?.snapshot;
    collectiveExportMode.disabled = on || exportInProgress;
    collectiveExportButton.disabled = on || exportInProgress
      || !(generatedImages.length || [...taskTabs.values()].some(tab => Array.isArray(tab.generated) && tab.generated.length));
    panel.querySelectorAll('select[data-ai-reference-role]').forEach(control => { control.disabled = on || generatedImages.length > 0 || conversationMessages.length > 0; });
    const cancelButton = panel.querySelector("[data-ai-interrupt]");
    cancelButton.disabled = !on;
    cancelButton.hidden = !on;
    syncSelectedOutputActions();
    commentController?.render();
  };
  const syncWhitePngUi = () => {
    const white = isWhitePngWorkflow({ mode: selectedMode, outputEngine: selectedOutputEngine });
    const fixedFirst = white && generatedImages.length === 0;
    const requestTitle = panel.querySelector("[data-ai-request-title]");
    const requestHint = panel.querySelector("[data-ai-request-hint]");
    const requestNote = panel.querySelector("[data-ai-request-note]");
    panel.dataset.aiFixedFirst = String(fixedFirst);
    input.hidden = fixedFirst;
    input.disabled = busy || fixedFirst;
    if (requestNote) requestNote.hidden = !fixedFirst;
    if (requestTitle) requestTitle.textContent = fixedFirst ? "첫 변환" : "요청";
    if (requestHint) requestHint.textContent = fixedFirst ? "고정된 평가원식 규칙으로 변환합니다." : "바꿀 내용만 간단히 적어 주세요.";
    const policyGroup = panel.querySelector("[data-ai-mark-policy]");
    if (policyGroup) policyGroup.hidden = true;
    if (reviewModeCheckbox) { reviewModeCheckbox.checked = false; reviewModeCheckbox.disabled = white; reviewModeCheckbox.closest("label").hidden = white; }
    const row = panel.querySelector(".ai-quality-row");
    if (row) row.hidden = white;
    const note = panel.querySelector("[data-ai-white-png-note]");
    if (note) {
      note.hidden = !white;
      note.textContent = "원본 보관 · 미리보기·저장·삽입에 처리 결과 적용";
      if (attachments.some(item=>item.referenceRole==='STYLE_REFERENCE')) note.textContent += ' · 표현 참고: 새 작업의 첫 변환·자동 교정만 지원';
    }
    syncOutputProcessingUi();
    chatButton.hidden = white && !panel.querySelector('[data-ai-chat-panel]');
    if (batchButton) {
      batchButton.disabled = busy || attachments.length < 2 || (white && reviewModeCheckbox?.checked !== false);
      batchButton.title = white && reviewModeCheckbox?.checked !== false ? "검수 포함 일괄 변환은 아직 지원하지 않습니다. 새 작업으로 그림별 변환을 실행하세요." : "여러 이미지를 각각 생성합니다. 일괄 결과는 독립 검수되지 않습니다.";
    }
    sendButton.textContent = "변환하기";
  };
  const syncConversionSummary = () => {
    if (!conversionSummary) return;
    const output = outputEngineButtons.find((button) => button.dataset.aiOutputEngine === selectedOutputEngine)?.textContent?.trim();
    const labels = modeButtons.find((button) => button.dataset.aiMode === selectedMode)?.textContent?.trim();
    const composition = generationModeSelect.selectedOptions[0]?.textContent?.trim();
    conversionSummary.textContent = [output, labels, composition].filter(Boolean).join(" · ");
  };
  const syncMode = () => {
    syncWhitePngUi();
    modeButtons.forEach((button) => {
      const active = button.dataset.aiMode === selectedMode;
      button.classList.toggle("is-on", active);
      button.setAttribute("aria-pressed", String(active));
    });
    syncConversionSummary();
  };
  const syncQualityMode = () => {
    qualityButtons.forEach((button) => {
      const active = button.dataset.aiQuality === selectedQualityMode;
      button.classList.toggle("is-on", active);
      button.setAttribute("aria-pressed", String(active));
    });
    syncConversionSummary();
  };
  const syncOutputEngine = () => {
    syncWhitePngUi();
    outputEngineButtons.forEach((button) => {
      const active = button.dataset.aiOutputEngine === selectedOutputEngine;
      button.classList.toggle("is-on", active);
      button.setAttribute("aria-pressed", String(active));
    });
    syncConversionSummary();
  };
  const syncReferenceSummary = () => {
    referenceCount.textContent = String(attachments.length);
    const empty = attachmentList.querySelector("[data-ai-reference-empty]");
    if (empty) empty.hidden = attachments.length > 0;
    if (attachments.length && referenceSection) referenceSection.open = true;
    if (replaceSourceButton) {
      replaceSourceButton.hidden = attachments.length === 0;
      replaceSourceButton.disabled = busy || attachments.length === 0;
    }
    if (replaceSourceFile) replaceSourceFile.disabled = busy || attachments.length === 0;
    if (batchButton) batchButton.disabled = busy || attachments.length < 2 || (isWhitePngWorkflow({ mode: selectedMode, outputEngine: selectedOutputEngine }) && reviewModeCheckbox?.checked !== false);
    referenceComposition = normalizeReferenceComposition(referenceComposition, attachments);
    panel.dataset.aiCompositionOrientation = referenceComposition.orientation;
    panel.dataset.aiCompositionOrder = referenceComposition.sourceOrder.join(',');
    const compositionControls = panel.querySelector('[data-ai-composition-controls]');
    const compositionSelect = panel.querySelector('[data-ai-composition-select]');
    const compositionEdit = panel.querySelector('[data-ai-free-composition]');
    if (compositionControls) compositionControls.hidden = referenceComposition.sourceOrder.length < 2;
    if (compositionSelect) { compositionSelect.value = referenceComposition.orientation; compositionSelect.disabled = busy; }
    if (compositionEdit) { compositionEdit.hidden = referenceComposition.orientation !== 'free'; compositionEdit.disabled = busy; }

    panel.dispatchEvent(new CustomEvent('5e:ai-composition-change', { detail: structuredClone(referenceComposition) }));
  };
  const orderedInputReferences = (items, composition = referenceComposition) => {
    const byId = new Map(items.map(item => [item.id, item]));
    return normalizeReferenceComposition(composition, items).sourceOrder.map(id => byId.get(id)).filter(Boolean);
  };
  const applyReferenceOrderToCards = () => {
    const ordered = orderedInputReferences(attachments);
    const iterator = ordered[Symbol.iterator]();
    attachments = attachments.map(item => item.referenceRole === 'STYLE_REFERENCE' ? item : iterator.next().value).filter(Boolean);
    for (const item of attachments) if (item.card?.parentElement === attachmentList) attachmentList.append(item.card);
  };

  const selectedModel = () => availableModels.find((item) => (item.model || item.id) === modelSelect.value);
  const modelById = (id) => availableModels.find((item) => (item.model || item.id) === id) || null;
  const modelSupportsEffort = (model, effort) => {
    const supported = model?.supportedReasoningEfforts;
    if (!Array.isArray(supported) || !supported.length) return true;
    return supported.some((option) => (option.reasoningEffort || option.effort || option) === effort);
  };
  const reviewEnabled = () => reviewModeCheckbox?.checked !== false;
  const isReviewSolAvailable = () => {
    const model = modelById(AI_IMAGE_REVIEW_MODEL);
    return Boolean(model && modelSupportsEffort(model, AI_IMAGE_REVIEW_EFFORT));
  };
  const isLunaModel = (item = selectedModel()) => /luna/i.test(`${item?.model || item?.id || modelSelect.value || ""} ${item?.displayName || ""}`);
  const syncModelWarning = () => {
    if (!modelWarning) return;
    modelWarning.hidden = !modelSelect.value || modelSelect.value === AI_IMAGE_REVIEW_MODEL;
  };
  const populateEfforts = () => {
    const model = selectedModel();
    const supported = model?.supportedReasoningEfforts || [];
    const savedEffort = localStorage.getItem("5e.aiEffort");
    const supportsLow = supported.some((option) => (option.reasoningEffort || option.effort || option) === "low");
    const previous = savedEffort || (model?.defaultReasoningEffort || "medium");
    effortSelect.replaceChildren();
    for (const option of supported) {
      const value = option.reasoningEffort || option.effort || option;
      const node = new Option(effortLabels[value] || value, value);
      if (option.description) node.title = option.description;
      effortSelect.add(node);
    }
    if (!effortSelect.options.length) {
      for (const value of ["low", "medium", "high"]) effortSelect.add(new Option(effortLabels[value], value));
    }
    effortSelect.value = Array.from(effortSelect.options).some((option) => option.value === previous)
      ? previous : (model?.defaultReasoningEffort || effortSelect.options[0].value);
    localStorage.setItem("5e.aiEffort", effortSelect.value);
  };
  const populateSpeeds = () => {
    const model = selectedModel();
    const tiers = Array.isArray(model?.serviceTiers) ? model.serviceTiers : [];
    const saved = localStorage.getItem("5e.aiSpeed");
    speedSelect.replaceChildren();
    if (!tiers.length) {
      speedSelect.add(new Option("표준", ""));
    } else {
      for (const tier of tiers) {
        const value = typeof tier === "string" ? tier : (tier.serviceTier || tier.id || tier.value || "");
        const label = typeof tier === "object" && (tier.displayName || tier.name)
          ? (tier.displayName || tier.name)
          : (value === "priority" ? "빠름" : value === "flex" ? "유동" : "표준");
        if (!Array.from(speedSelect.options).some((option) => option.value === value)) speedSelect.add(new Option(label, value));
      }
    }
    const hasPriority = Array.from(speedSelect.options).some((option) => option.value === "priority");
    const fallback = hasPriority ? "priority" : (model?.defaultServiceTier || speedSelect.options[0]?.value || "");
    speedSelect.value = Array.from(speedSelect.options).some((option) => option.value === saved) ? saved : fallback;
    localStorage.setItem("5e.aiSpeed", speedSelect.value);
  };
  const loadModels = async () => {
    if (modelsLoaded || !desktop?.models) return;
    try {
      const result = await desktop.models();
      availableModels = Array.isArray(result?.data) ? result.data.filter((item) => !item.hidden) : [];
      modelSelect.replaceChildren();
      for (const item of availableModels) modelSelect.add(new Option(item.displayName || item.model || item.id, item.model || item.id));
      if (!modelSelect.options.length) modelSelect.add(new Option("기본 모델", ""));
      if (isWhitePngWorkflow({ mode: selectedMode, outputEngine: selectedOutputEngine })
        && localStorage.getItem("5e.aiReviewDefaultsVersion") !== "1") {
        sessionStorage.setItem("5e.preview:" + "5e.aiModelExplicit", AI_IMAGE_REVIEW_MODEL);
        localStorage.setItem("5e.aiEffort", AI_IMAGE_GENERATION_EFFORT);
        localStorage.setItem("5e.aiReviewDefaultsVersion", "1");
      }
      const sessionChoice = sessionStorage.getItem("5e.preview:" + "5e.aiModelExplicit");
      const preferred = availableModels.find((item) => (item.model || item.id) === sessionChoice)
        || availableModels.find((item) => (item.model || item.id) === AI_IMAGE_REVIEW_MODEL)
        || availableModels.find((item) => item.isDefault) || availableModels[0];
      modelSelect.value = preferred ? (preferred.model || preferred.id) : "";
      localStorage.setItem("5e.aiModel", modelSelect.value);
      modelsLoaded = true;
      syncModelWarning();
      populateEfforts();
      populateSpeeds();
    } catch {
      modelSelect.replaceChildren(new Option("기본 모델", ""));
      syncModelWarning();
      populateEfforts();
      populateSpeeds();
    }
  };
  const renderLimits = (limits) => {
    const root = limits?.rateLimits || limits;
    const values = [root?.primary, root?.secondary]
      .map((item) => Number(item?.usedPercent)).filter(Number.isFinite)
      .map((used) => Math.max(0, Math.round(100 - used)));
    limitText.textContent = values.length ? `잔여 한도 ${values.map((value) => `${value}%`).join(" / ")}` : "잔여 한도 정보 없음";
  };
  const loadAccountOverview = async () => {
    if (!desktop?.account) return;
    try {
      const overview = await desktop.account();
      const account = overview?.account?.account || overview?.account || {};
      const identity = account.email || account.name || (account.type === "apiKey" ? "API 키 계정" : "로그인 계정");
      accountText.textContent = `${identity}${account.planType ? ` · ${account.planType}` : ""}`;
      renderLimits(overview?.limits);
      const lifetime = findNumber(overview?.usage, ["totalTokens", "lifetimeTokens", "total_tokens"]);
      accountTokensText.textContent = lifetime == null ? "누적 토큰 정보 없음" : `누적 ${formatK(lifetime)} 토큰`;
    } catch {
      accountText.textContent = "계정 정보 없음";
      limitText.textContent = "잔여 한도 정보 없음";
      accountTokensText.textContent = "누적 토큰 정보 없음";
    }
  };

  const openViewer = (src) => {
    const viewer = document.createElement("div");
    viewer.className = "ai-image-viewer";
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-label", "이미지 크게 보기");
    const large = document.createElement("img");
    large.src = src;
    large.alt = "확대 이미지";
    viewer.appendChild(large);
    registerEscapeLayer(viewer, () => viewer.remove());
    viewer.addEventListener("click", () => viewer.remove());
    document.body.appendChild(viewer);
  };

  const renderComments = (item, stage, list) => {
    stage.querySelectorAll(".ai-selection-box").forEach((box) => box.remove());
    list.replaceChildren();
    const details = list.closest(".ai-comment-details");
    const summary = details?.querySelector("summary");
    if (summary) summary.textContent = item.comments.length ? `영역 요청 ${item.comments.length}개` : "영역 요청 없음";
    if (details && item.comments.some((comment) => comment.focusOnRender)) details.open = true;
    for (const comment of item.comments) {
      const box = document.createElement("div");
      box.className = "ai-selection-box";
      box.style.left = `${comment.x}%`;
      box.style.top = `${comment.y}%`;
      box.style.width = `${comment.w}%`;
      box.style.height = `${comment.h}%`;
      const badge = document.createElement("span");
      badge.textContent = String(comment.number);
      box.appendChild(badge);
      stage.appendChild(box);

      const row = document.createElement("div");
      row.className = "ai-comment-row";
      const number = document.createElement("span");
      number.textContent = String(comment.number);
      const editor = document.createElement("input");
      editor.type = "text";
      editor.dataset.aiInputMutator = "";
      editor.disabled = busy;
      editor.value = comment.text;
      editor.placeholder = "이 영역에 대한 요청을 입력하세요";
      editor.addEventListener("input", () => { if (!busy) comment.text = editor.value; });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.aiInputMutator = "";
      remove.disabled = busy;
      remove.textContent = "삭제";
      remove.onclick = () => {
        if (busy) return;
        item.comments = item.comments.filter((candidate) => candidate !== comment);
        renderComments(item, stage, list);
      };
      row.append(number, editor, remove);
      list.appendChild(row);
      if (comment.focusOnRender) {
        delete comment.focusOnRender;
        requestAnimationFrame(() => editor.focus());
      }
    }
  };

  const enableAreaComments = (item, stage, img, toggleButton, list) => {
    let start = null;
    let draft = null;
    const point = (event) => {
      const rect = img.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
        y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
      };
    };
    const updateDraft = (from, to) => {
      if (!draft) return;
      draft.style.left = `${Math.min(from.x, to.x)}%`;
      draft.style.top = `${Math.min(from.y, to.y)}%`;
      draft.style.width = `${Math.abs(to.x - from.x)}%`;
      draft.style.height = `${Math.abs(to.y - from.y)}%`;
    };
    toggleButton.onclick = () => {
      if (busy) return;
      const active = !stage.classList.contains("is-annotating");
      stage.classList.toggle("is-annotating", active);
      toggleButton.classList.toggle("is-on", active);
      const label = active ? "수정할 영역을 드래그하세요" : "수정 요청 영역 지정";
      toggleButton.title = label;
      toggleButton.setAttribute("aria-label", label);
    };
    stage.addEventListener("pointerdown", (event) => {
      if (!stage.classList.contains("is-annotating") || event.target !== img) return;
      event.preventDefault();
      start = point(event);
      draft = document.createElement("div");
      draft.className = "ai-selection-box is-draft";
      stage.appendChild(draft);
      updateDraft(start, start);
      try { stage.setPointerCapture?.(event.pointerId); } catch {}
    });
    stage.addEventListener("pointermove", (event) => {
      if (!start || !draft) return;
      updateDraft(start, point(event));
    });
    const finish = (event) => {
      if (!start || !draft) return;
      const end = point(event);
      draft.remove();
      draft = null;
      const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x), h = Math.abs(end.y - start.y);
      start = null;
      if (w < 1.5 || h < 1.5) return;
      const number = item.nextCommentNumber++;
      item.comments.push({ number, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), text: "", focusOnRender: true });
      stage.classList.remove("is-annotating");
      toggleButton.classList.remove("is-on");
      toggleButton.title = "수정 요청 영역 지정";
      toggleButton.setAttribute("aria-label", "수정 요청 영역 지정");
      renderComments(item, stage, list);
    };
    stage.addEventListener("pointerup", finish);
    stage.addEventListener("pointercancel", () => {
      start = null;
      draft?.remove();
      draft = null;
    });
  };

  const makeImageCard = (item) => {
    const card = document.createElement("article");
    card.className = `ai-preview-card ai-image-card ${item.kind === "reference" ? "ai-reference-card" : "ai-generated-card"}`;
    if (item.kind === "reference") {
      card.dataset.aiReferenceId = item.id;
      card.dataset.aiReferenceRole = item.referenceRole ?? 'INPUT_SOURCE';
    }
    if (item.kind === "generated") {
      card.dataset.aiCandidateId = item.id;
      card.dataset.aiReviewState = item.reviewState || "idle";
      card.dataset.aiGenerationMode = candidateUsesSeparatedAssets(item)
        ? AI_ASSET_GENERATION_MODES.SEPARATED : AI_ASSET_GENERATION_MODES.SINGLE;
    }
    item.card = card;
    const head = document.createElement("div");
    head.className = "ai-image-card-head";
    const name = document.createElement("strong");
    name.textContent = item.name;
    head.append(name);
    if (item.kind === 'reference' && (attachments.length > 1 || item.referenceRole === 'STYLE_REFERENCE')) {
      const roleSelect = document.createElement('select');
      roleSelect.dataset.aiReferenceRole = '';
      roleSelect.dataset.aiInputMutator = '';
      roleSelect.setAttribute('aria-label', `이미지 역할 · ${item.name}`);
      roleSelect.title = '최초 요청 전에 선택하세요. 요청 후 역할 변경은 새 작업에서 가능합니다. 표현 참고는 구조·영역 코멘트의 근거가 아닙니다.';
      for (const [value,label] of [['INPUT_SOURCE','변환 원본'],['STYLE_REFERENCE','표현 참고']]) {
        const option = document.createElement('option'); option.value=value; option.textContent=label; roleSelect.append(option);
      }
      try { roleSelect.value=getReferenceRole(item); } catch {
        const option=document.createElement('option'); option.value=''; option.textContent='역할 확인 필요'; option.disabled=true; roleSelect.prepend(option); roleSelect.value='';
      }
      roleSelect.disabled=busy || generatedImages.length > 0 || conversationMessages.length > 0;
      roleSelect.onchange=()=>{
        if (busy || generatedImages.length || conversationMessages.length) return;
        item.referenceRole=roleSelect.value;
        referenceComposition = normalizeReferenceComposition(referenceComposition, attachments);
        const replacement=makeImageCard(item); card.replaceWith(replacement);
        syncReferenceSummary(); syncWhitePngUi(); commentController?.reset(); captureActiveTaskTab(); persistTasks();
        setStatus(item.referenceRole==='STYLE_REFERENCE'?'표현 참고로 설정됨 · 새 작업의 첫 변환과 자동 교정에서 사용합니다.':'변환 원본으로 설정됨','ok');
      };
      head.append(roleSelect);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.aiInputMutator = "";
    remove.disabled = busy;
    remove.textContent = "×";
    remove.title = "이미지 제거";
    remove.onclick = () => {
      if (busy) return;
      if (!window.confirm(`‘${item.name}’ 이미지를 작업에서 제거할까요? 원본 파일은 삭제하지 않습니다.`)) return;
      if (item.kind === "reference") {
        attachments = attachments.filter((candidate) => candidate !== item);
        referenceComposition = normalizeReferenceComposition(referenceComposition, attachments);
      }
      else {
        if (automaticSeparationRun?.item === item) abortAutomaticSeparation('result-removed');
        generatedImages = generatedImages.filter((candidate) => candidate !== item);
        latestGeneratedSrc = generatedImages.at(-1)?.data || null;
      }
      card.remove();
      persistTasks();commentController?.reset();
      if (item.kind === "reference") syncReferenceSummary();
      if (!generatedImages.length && !previews.querySelector("[data-ai-empty]")) {
        const empty = document.createElement("p");
        empty.className = "ai-empty";
        empty.dataset.aiEmpty = "";
        empty.textContent = "생성된 이미지가 여기에 표시됩니다.";
        previews.appendChild(empty);
      }
    };
    head.appendChild(remove);

    const stage = document.createElement("div");
    stage.className = "ai-preview-stage";
    const img = document.createElement("img");
    img.src = item.data;
    img.alt = item.name;
    if (item.kind === 'generated') {
      item.outputImage = img;
      void renderOutputVariant(item, img);
    }
    stage.appendChild(img);
    if (item.kind === "generated") {
      const output = document.createElement("button");
      output.type = "button";
      output.className = "ai-canvas-output";
      output.textContent = "페이지에 넣기";
      output.onclick = () => {
        if (busy || output.disabled) return;
        if (candidateUsesSeparatedAssets(item)) { void openGroupsForItem(item, true); return; }
        if (item.sceneResult?.objects?.length) {
          try {
            const inserted = insertFastSceneIntoState(state, item.sceneResult);
            addLog(`편집 가능한 벡터 오브젝트 ${inserted.added}개를 캔버스에 출력했습니다.`);
            close();
          } catch (error) {
            addLog(`캔버스 출력 실패: ${error.message}`, "error");
          }
          return;
        }
        const target=state.get().selectedIds?.length === 1 ? state.get().objects.find(o=>state.get().selectedIds?.includes(o.id)&&o.type==="image"&&!o.editableAssetRegionId&&o.aiTaskId===activeTaskTabId) : null;
        if (target && !window.confirm("선택한 페이지 이미지를 이 버전으로 교체할까요? 위치와 크기는 유지합니다. 취소하면 아무것도 변경하지 않습니다.")) return;
        const replace = Boolean(target);
        setBusy(true);
        setStatus(replace ? '페이지 이미지를 교체하는 중…' : '페이지에 이미지를 넣는 중…', 'busy');
        output.disabled=true;
        const footerInsert = panel.querySelector('[data-ai-insert-selected]');
        if (footerInsert) footerInsert.disabled = true;
        void resolveOutputVariant(item)
          .then(data => insertImageFromSrc(state, data, {preserveBytes:true,centerArtboard:true,aiTaskId:activeTaskTabId,aiCandidateId:item.id,replaceId:replace?target.id:null}))
          .then(()=>{captureActiveTaskTab();persistTasks();close();})
          .catch((error)=>{setStatus(`페이지 삽입 실패: ${error.message}`, 'error');addLog(`페이지 삽입 실패: ${error.message}`,"error");})
          .finally(()=>{output.disabled=false;setBusy(false);});
      };
      stage.appendChild(output);
    }

    const actions = document.createElement("div");
    actions.className = "ai-preview-actions";
    let zoomLevel = 1;
    const zoomOut = document.createElement("button");
    zoomOut.type = "button";
    zoomOut.textContent = "−";
    zoomOut.title = "미리보기 축소";
    zoomOut.setAttribute("aria-label", "미리보기 축소");
    const zoomValue = document.createElement("span");
    zoomValue.className = "ai-zoom-value";
    const zoomIn = document.createElement("button");
    zoomIn.type = "button";
    zoomIn.textContent = "+";
    zoomIn.title = "미리보기 확대";
    zoomIn.setAttribute("aria-label", "미리보기 확대");
    const applyZoom = () => {
      img.style.height = `${Math.round((item.kind === "reference" ? 145 : 430) * zoomLevel)}px`;
      zoomValue.textContent = `${Math.round(zoomLevel * 100)}%`;
      zoomOut.disabled = zoomLevel <= 0.6;
      zoomIn.disabled = zoomLevel >= 2;
    };
    zoomOut.onclick = () => { zoomLevel = Math.max(0.6, Math.round((zoomLevel - 0.2) * 10) / 10); applyZoom(); };
    zoomIn.onclick = () => { zoomLevel = Math.min(2, Math.round((zoomLevel + 0.2) * 10) / 10); applyZoom(); };
    const annotate = document.createElement("button");
    annotate.type = "button";
    annotate.dataset.aiInputMutator = "";
    annotate.disabled = busy;
    annotate.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 14.5V17h2.5L15 8.5 11.5 5z"/><path d="m10.8 5.7 3.5 3.5"/></svg>';
    annotate.title = "수정 요청 영역 지정";
    annotate.setAttribute("aria-label", "수정 요청 영역 지정");
    actions.append(zoomOut, zoomValue, zoomIn, annotate);
    if (item.kind === "generated" && !item.sceneResult) {
      const savePng = document.createElement("button");
      savePng.type = "button";
      savePng.dataset.aiSaveCandidate = '';
      savePng.textContent = "PNG 저장";
      savePng.title = "현재 생성 결과를 PNG 파일로 저장";
      savePng.onclick = async () => {
        if (busy || savePng.disabled) return;
        const footerSave = panel.querySelector('[data-ai-save-selected]');
        savePng.disabled = true;
        if (footerSave) footerSave.disabled = true;
        try {
          const link = document.createElement("a");
          const safeName = String(item.name || "평가원식-선화").replace(/[\\/:*?"<>|]+/g, "-");
          link.href = await resolveOutputVariant(item);
          link.download = `${safeName}.png`;
          link.click();
          setStatus('선택한 배경·색상 설정으로 PNG를 저장했습니다.', 'ok');
        } catch (error) {
          setStatus(`PNG 저장 실패: ${error.message}`, 'error');
        } finally {
          savePng.disabled = false;
          syncSelectedOutputActions();
        }
      };
      actions.appendChild(savePng);
    }
    actions.classList.add("ai-preview-actions-head");
    head.insertBefore(actions, remove);
    applyZoom();
    const commentList = document.createElement("div");
    commentList.className = "ai-comment-list";
    annotate.hidden=Boolean(commentController);
    if(commentController) commentController.bind(item,stage,img);
    else if (item.kind !== 'reference' || isInputReference(item)) enableAreaComments(item, stage, img, annotate, commentList);
    const commentDetails = document.createElement("details");
    commentDetails.className = "ai-comment-details";
    commentDetails.hidden=Boolean(commentController);
    const commentSummary = document.createElement("summary");
    commentSummary.textContent = "영역 요청 없음";
    commentDetails.append(commentSummary, commentList);
    if(!commentController) renderComments(item, stage, commentList);
    card.append(head, stage, commentDetails);
    return card;
  };

  function selectedOutputItem() {
    return generatedImages.find((item) => item.id === selectedCandidateId) || generatedImages.at(-1) || null;
  }

  function abortAutomaticSeparation(reason = 'selection-changed') {
    const run = automaticSeparationRun;
    if (!run) return;
    automaticSeparationRun = null;
    run.controller.abort(reason);
    if (run.item.automaticSeparationState === 'preparing') run.item.automaticSeparationState = 'idle';
    syncSelectedOutputActions();
  }

  function automaticSeparationIsCurrent(run) {
    return automaticSeparationRun === run && !run.controller.signal.aborted
      && run.taskId === activeTaskTabId && selectedOutputItem() === run.item;
  }

  function rememberAutomaticSeparation(key, prepared) {
    automaticSeparationCache.delete(key);
    automaticSeparationCache.set(key, prepared);
    while (automaticSeparationCache.size > 2) automaticSeparationCache.delete(automaticSeparationCache.keys().next().value);
  }

  function startAutomaticSeparation(item) {
    if (!candidateUsesAutomaticSeparation(item)) return Promise.resolve(null);
    if (item.automaticSeparationState === 'ready' && item.automaticSeparationPrepared) {
      return Promise.resolve(item.automaticSeparationPrepared);
    }
    if (item.automaticSeparationState === 'fallback') return Promise.resolve(null);
    if (automaticSeparationRun?.item === item) return automaticSeparationRun.promise;
    abortAutomaticSeparation('result-replaced');
    const controller = new AbortController();
    const run = { controller, item, taskId: activeTaskTabId, promise: null };
    automaticSeparationRun = run;
    item.automaticSeparationState = 'preparing';
    item.automaticSeparationPrepared = null;
    item.automaticSeparationError = '';
    syncSelectedOutputActions();
    run.promise = (async () => {
      try {
        const outputOptions = normalizeImageOutputOptions(selectedImageOutputOptions);
        const effectiveSource = await resolveImageOutput(item, outputOptions, transparentizeGeneratedImage);
        if (!automaticSeparationIsCurrent(run)) return null;
        const key = await automaticSeparationCacheKey(effectiveSource, outputOptions);
        if (!automaticSeparationIsCurrent(run)) return null;
        item.automaticSeparationKey = key;
        item.automaticSeparationSource = effectiveSource;
        let prepared = automaticSeparationCache.get(key);
        item.automaticSeparationCacheHit = Boolean(prepared);
        if (!prepared) {
          prepared = await prepareSeparatedAssets(effectiveSource, { ...AUTOMATIC_SEPARATION_OPTIONS, signal: controller.signal });
          if (!automaticSeparationIsCurrent(run)) return null;
          if (prepared.assets?.length && !prepared.fallbackToOriginal) rememberAutomaticSeparation(key, prepared);
        }
        if (!automaticSeparationIsCurrent(run)) return null;
        if (!prepared.assets?.length || prepared.fallbackToOriginal) {
          item.automaticSeparationState = 'fallback';
          item.automaticSeparationPrepared = null;
          item.automaticSeparationError = prepared.reviewReasons?.join(', ') || '자동 분리 결과 없음';
          return null;
        }
        const automaticPrepared = {
          ...prepared,
          labelsDisabled: true,
          assets: prepared.assets.map(asset => ({ ...asset, labelMode: 'none' })),
        };
        item.automaticSeparationState = 'ready';
        item.automaticSeparationPrepared = automaticPrepared;
        item.automaticSeparationError = '';
        return automaticPrepared;
      } catch (error) {
        if (error?.name === 'AbortError' || !automaticSeparationIsCurrent(run)) return null;
        item.automaticSeparationState = 'fallback';
        item.automaticSeparationPrepared = null;
        item.automaticSeparationError = error?.message || String(error);
        return null;
      } finally {
        if (automaticSeparationRun === run) automaticSeparationRun = null;
        syncSelectedOutputActions();
      }
    })();
    return run.promise;
  }

  function restartSelectedAutomaticSeparation(reason = 'options-changed') {
    abortAutomaticSeparation(reason);
    const item = selectedOutputItem();
    if (!candidateUsesAutomaticSeparation(item)) return;
    item.automaticSeparationState = 'idle';
    item.automaticSeparationPrepared = null;
    void startAutomaticSeparation(item);
  }

  function candidateAlreadyInserted(item) {
    return Boolean(item && state.get().objects?.some(object => object.aiTaskId === activeTaskTabId
      && object.aiCandidateId === item.id && object.editableAssetRegionId));
  }

  async function openGroupsForItem(item, separated = false) {
    const epoch = currentRequestEpoch;
    const taskId = activeTaskTabId;
    const candidateId = item.id;
    const source = item.data;
    const pageId = state.get().activePageId;
    const pageSnapshot = () => JSON.stringify({ objects: state.get().objects, artboard: state.get().artboard, layer: state.get().activeLayerId });
    const originalPage = pageSnapshot();
    const isCurrent = () => !panel.hidden && !busy && epoch === currentRequestEpoch && taskId === activeTaskTabId
      && selectedOutputItem()?.id === candidateId && selectedOutputItem()?.data === source
      && state.get().activePageId === pageId && pageSnapshot() === originalPage;
    try {
      if (separated) {
        item.separatedAssetsError = '';
        captureActiveTaskTab();
        persistTasks();
      }
      setStatus(separated ? '분리 결과를 확인하는 중…' : '편집용 그룹을 준비하는 중…', 'busy');
      const initialPrepared = separated ? await prepareSeparatedAssets(source) : await startAutomaticSeparation(item);
      if (!isCurrent()) throw new Error('분리 결과를 준비하는 동안 페이지·작업 또는 후보가 변경되었습니다.');
      const dialogSource = separated ? source : (item.automaticSeparationSource || await resolveOutputVariant(item));
      const inserted = await openEditableAssetsDialog({
        dataUrl: dialogSource, isCurrent, artboard: { ...state.get().artboard }, initialPrepared,
        onInsert: prepared => candidateAlreadyInserted(item) || insertEditableAssets(state, prepared, {
          isCurrent, aiTaskId: taskId, aiCandidateId: candidateId, ...(separated ? {} : { groupMode: 'single' }),
        }),
      });
      if (inserted) { captureActiveTaskTab(); persistTasks(); close(); }
      else if (isCurrent()) setStatus('원본 PNG를 유지했습니다.', 'ok');
    } catch (error) {
      const message = error.message || String(error);
      if (separated) {
        item.separatedAssetsError = message;
        captureActiveTaskTab();
        persistTasks();
        syncSelectedOutputActions();
        setStatus('분리 결과를 자동으로 읽지 못했습니다. 원본 PNG의 배경은 아직 제거되지 않았습니다. 아래에서 영역을 직접 지정해 분리할 수 있습니다.', 'error');
      } else {
        setStatus(`편집용 그룹 준비 실패: ${message} 원본 PNG는 그대로 유지됩니다.`, 'error');
      }
    }
  }
  function syncSelectedOutputActions() {
    const item = selectedOutputItem();
    const comparisonCount = allImages().length;
    compareButton.disabled = comparisonCount < 2;
    compareButton.title = comparisonCount < 2
      ? '첫 결과가 준비되면 원본과 비교할 수 있습니다.'
      : '별도 창에서 원본과 생성 결과를 비교합니다.';
    const save = panel.querySelector('[data-ai-save-selected]');
    const insert = panel.querySelector('[data-ai-insert-selected]');
    const scoped = panel.querySelector('[data-ai-scoped-edit-selected]');
    const groups = panel.querySelector('[data-ai-editable-groups]');
    const recovery = panel.querySelector('[data-ai-separated-recovery]');
    const outputNote = panel.querySelector('[data-ai-selected-output-note]');
    const nextAction = separatedCandidateNextAction(item);
    if (groups) {
      const automatic = candidateUsesAutomaticSeparation(item);
      const automaticState = automatic ? (item.automaticSeparationState || 'idle') : '';
      const inserted = automatic && candidateAlreadyInserted(item);
      groups.hidden = candidateUsesSeparatedAssets(item);
      groups.disabled = busy || !item || Boolean(item.sceneResult) || automaticState === 'preparing' || inserted;
      groups.dataset.aiSeparationState = automaticState;
      groups.dataset.aiSeparationKey = automatic ? (item.automaticSeparationKey || '') : '';
      groups.dataset.aiSeparationCacheHit = automatic ? String(item.automaticSeparationCacheHit === true) : '';
      groups.dataset.aiSeparatedCount = automatic && item.automaticSeparationPrepared?.assets?.length
        ? String(item.automaticSeparationPrepared.assets.length) : '';
      groups.textContent = inserted ? '이미 페이지에 추가됨'
        : automaticState === 'preparing' ? '물체를 분리하는 중…'
        : automaticState === 'ready' ? '분리 결과 확인'
        : automaticState === 'fallback' ? '영역을 직접 지정해서 분리'
        : candidateUsesSeparatedAssets(item) ? '분리 결과 확인' : '편집용 그룹 준비';
    }
    if (recovery) {
      recovery.hidden = nextAction !== 'manual-regions';
      recovery.disabled = busy || nextAction !== 'manual-regions';
    }
    if (outputNote) {
      outputNote.hidden = nextAction === 'ordinary-insert';
      outputNote.textContent = nextAction === 'manual-regions'
        ? `자동 분리 실패: ${item.separatedAssetsError} 원본 PNG의 배경은 아직 제거되지 않았습니다. 아래 버튼에서 영역을 직접 지정해 분리할 수 있습니다.`
        : '분리용 원본 PNG입니다. 배경 제거와 개별 객체 분리는 “분리 결과 확인”에서 확인한 뒤 진행됩니다.';
    }
    if (scoped) scoped.disabled = busy || !item || Boolean(item.sceneResult);
    if (save) save.disabled = busy || !item || Boolean(item.sceneResult);
    if (insert) {
      insert.disabled = busy || !item || Boolean(item.card?.querySelector('.ai-canvas-output')?.disabled);
      const replacement = !candidateUsesSeparatedAssets(item) && state.get().selectedIds?.length === 1 && state.get().objects.some((object) => object.type === 'image' && !object.editableAssetRegionId && object.aiTaskId === activeTaskTabId && state.get().selectedIds?.includes(object.id));
      insert.textContent = candidateUsesSeparatedAssets(item)
        ? '분리 결과 확인'
        : replacement ? '선택 이미지 교체 후 닫기' : '페이지에 넣고 닫기';
    }
  }

  function scopedDialog(title, detail, { image, content, accept = '확인', defaultAccept = false } = {}) {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog');
      dialog.className = image || content ? 'ai-confirm-dialog ai-confirm-dialog-wide' : 'ai-confirm-dialog';
      dialog.setAttribute('aria-label', title);
      const heading = document.createElement('h3'); heading.textContent = title;
      const text = document.createElement('pre'); text.textContent = detail; text.style.whiteSpace = 'pre-wrap';
      dialog.style.maxWidth = 'min(900px, 90vw)'; dialog.style.maxHeight = '90vh'; dialog.style.overflow = 'auto';
      dialog.append(heading, text);
      if (content) dialog.append(content);
      if (image) { const img = document.createElement('img'); img.src = image; img.alt = '미적용 선택 영역 수정 후보'; img.style.maxWidth = '100%'; img.style.maxHeight = '60vh'; dialog.append(img); }
      const cancel = document.createElement('button'); cancel.textContent = '취소'; cancel.type = 'button';
      const ok = document.createElement('button'); ok.textContent = accept; ok.type = 'button';
      let settled = false;
      const finish = value => { if (settled) return; settled = true; content?.dispose?.(); dialog.close(); dialog.remove(); resolve(value); };
      cancel.onclick = () => finish(false); ok.onclick = () => finish(true);
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
      const actions = document.createElement('div'); actions.className = 'ai-confirm-actions';
      ok.className = 'ai-confirm-accept'; actions.append(cancel, ok);
      dialog.append(actions);
      dialog.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const target = dialogFocusTarget(document.activeElement, [cancel, ok], event.shiftKey);
        if (!target) return;
        event.preventDefault();
        target.focus();
      });
      panel.append(dialog); dialog.showModal();
      (defaultAccept ? ok : cancel).focus();
    });
  }
  async function startScopedEdit(item) {
    if (busy || !desktop) return;
    if (selectedOutputItem() !== item || item.kind !== 'generated' || item.sceneResult) {
      setStatus('먼저 수정할 생성 PNG를 선택하세요.', 'error'); return;
    }
    // This independent byte snapshot is used only for review comparison; stale live output is never read for it.
    const originalPng = scopedPngBytes(item.data);
    const comments = JSON.parse(JSON.stringify(item.comments || []));
    const instruction = input.value.trim() || comments.filter(c => c.type === 'area').map(c => c.text || '').join('\n').trim();
    if (!instruction) { setStatus('선택 영역의 수정 내용을 입력하세요.', 'error'); return; }
    const epoch = ++currentRequestEpoch;
    currentRunInput = { scopedEdit: true }; currentRequestSnapshot = null;
    currentCacheRequest = null; pendingCacheOutput = null; currentReviewScheduled = false;
    currentTurnId = null; currentRenderThreadId = null; awaitingTurnId = false; queuedTurnEvents = [];
    currentCancelRequested = false;
    const fingerprint = JSON.stringify(item.comments || []);
    const getCurrent = () => {
      const live = selectedOutputItem();
      const visibleId = panel.querySelector('[data-ai-candidate-select]')?.value;
      if (!live || visibleId !== live.id || panel.dataset.aiSelectedCandidateId !== live.id) {
        throw new Error('화면의 선택 버전과 내부 수정 대상이 달라 적용할 수 없습니다.');
      }
      if (currentCancelRequested) throw new Error('선택 영역 수정이 취소되었습니다.');
      return { taskId: activeTaskTabId, candidateId: live?.id, epoch: currentRequestEpoch,
        selectionRevision: scopedSelectionRevision + (JSON.stringify(live?.comments || []) === fingerprint ? 0 : 1),
        sourcePng: scopedPngBytes(live?.data || '') };
    };
    setBusy(true);
    try {
      const done = await runScopedPanelEdit({ getCurrent, comments,
        timingObserver: ({ phase, durationMs, outcome }) => {
          const label = { prepare: 'PNG 준비', session: '세션 생성', 'scope-confirmation': '범위 확인',
            'bounds-confirmation': '범위 승인 대기', 'ai-generation': 'AI 응답',
            'png-composite-validation': 'PNG 합성·검증', 'candidate-review': '후보 비교 대기',
            'registration-display': '등록·표시' }[phase] || '처리';
          const outcomeLabel = { completed: '완료', cancelled: '취소', failed: '실패' }[outcome] || outcome;
          addLog(`선택 영역 수정 계측 · ${label} ${Math.round(durationMs)}ms · ${outcomeLabel}`);
        },
        confirmBounds: session => scopedDialog('수정 허용 범위 확인',
          '선택 PNG: ' + session.width + ' × ' + session.height + ' px\n좌상단 포함, 우하단 제외. 영역 밖 픽셀은 원본 그대로 보존합니다.\n' +
          session.rectangles.map((r,i) => (i+1) + ': x [' + r.x0 + ', ' + r.x1 + '), y [' + r.y0 + ', ' + r.y1 + ')').join('\n') +
          '\n허용 픽셀: ' + session.allowedPixelCount + '\n백분율 영역은 바깥으로 확장하지 않고 안쪽 정수 경계로 변환했습니다.', { accept: '이 범위로 생성' }),
        generate: session => new Promise((resolve, reject) => {
          let turnId = null, threadId = null, ready = false, rawSrc = null, complete = false, settled = false, autoFinalizationSeen = false;
          const queued = [];
          const timer = setTimeout(() => finish(new Error('선택 영역 생성 응답 시간이 초과되었습니다. 자동 재생성하지 않습니다.')), 180000);
          const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); scopedTransport = null; error ? reject(error) : resolve(value); };
          const check = async () => {
            if (!complete || !rawSrc || settled) return;
            try { const data = await resolveGeneratedRaster(rawSrc, { whitePng: true }); finish(null, scopedPngBytes(data)); }
            catch (error) { finish(error); }
          };
          const handle = event => {
            if (settled) return;
            if (!ready) { queued.push(event); return; }
            if (!((event.turnId && event.turnId === turnId) || (event.threadId && threadId && event.threadId === threadId))) return;
            if ((event.turnId && event.turnId !== turnId) || (event.threadId && threadId && event.threadId !== threadId)) return;
            if (event.kind === 'image' && event.src) {
              if (rawSrc) { finish(new Error('복수 이미지 응답은 지원하지 않습니다.')); return; }
              rawSrc = event.src; void check();
            }
            if (event.kind === 'error') finish(new Error(event.text || '선택 영역 생성 실패'));
            if (event.kind === 'finalization' && event.state === 'interrupting') autoFinalizationSeen = true;
            const terminal = scopedImageCompletionStatus(event, { hasImage: Boolean(rawSrc), autoFinalizationSeen, userCancelled: currentCancelRequested });
            if (terminal === 'reject') finish(new Error('유효한 PNG 완료를 확인하지 못했거나 사용자가 취소하여 적용하지 않았습니다.'));
            else if (terminal === 'complete') { complete = true; void check(); }
          };
          scopedTransport = { handle, fail: error => finish(error) };
          setStatus('선택 영역 수정 생성 중 · 자동 검수·교정 없음', 'busy');
          desktop.send({ purpose: 'image', ephemeralRender: true, conversationId: null,
            model: modelSelect.value || null, effort: effortSelect.value || null, serviceTier: speedSelect.value || null,
            attachments: [{ name: item.name, data: item.data }],
            text: '첨부된 PNG의 크기를 유지하여 한 장의 PNG를 생성하세요. 다음 정수 픽셀 영역 안만 수정합니다. 좌상단 포함, 우하단 제외: ' + JSON.stringify(session.rectangles) + '\n수정 내용: ' + instruction + '\n영역 밖은 변경하지 말고 번호·주석·경계선을 출력하지 마세요.'
          }).then(result => {
            turnId = result.turnId; threadId = result.renderThreadId || result.threadId;
            if (!turnId) { finish(new Error('생성 작업 ID가 없어 결과를 안전하게 연결할 수 없습니다.')); return; }
            ready = true; for (const event of queued) handle(event);
          }).catch(error => finish(error));
        }),
        review: async proposal => {
          const comparison = await createScopedEditComparison(originalPng, proposal.previewPng);
          return scopedDialog('선택 영역 수정 후보 · 아직 미적용',
            '변경 픽셀: ' + proposal.changedPixelCount + '\n영역 밖 픽셀 동일: ' + (proposal.outsideUnchanged ? '확인됨' : '아니오') +
            '\n적용 전에는 저장·삽입·원본 교체가 이루어지지 않습니다. 자동 시각 검수는 하지 않았습니다.' +
            '\n제거된 메타데이터: ' + (proposal.removedMetadata.join(', ') || '없음'),
            { content: comparison, accept: '적용' });
        },
        register: async (accepted, isCurrent) => {
          if (!isCurrent()) throw new Error('작업 또는 선택 영역이 변경되어 적용할 수 없습니다.');
          const added = await addPreview(scopedPngData(accepted), { alreadyEditable: true, isCurrent, reviewState: "scoped-applied", reviewReport: scopedAppliedReviewReport() });
          if (!added) throw new Error('선택 상태가 변경되어 적용하지 않았습니다.');
          captureActiveTaskTab(); persistTasks(); syncSelectedOutputActions();
        }
      });
      if (epoch === currentRequestEpoch && done) setTaskState("completed");
      if (epoch === currentRequestEpoch) setStatus(done ? '선택 영역 수정 적용 완료 · 저장 또는 페이지 삽입 가능' : '선택 영역 수정 취소 · 원본 유지', done ? 'ok' : 'warn');
    } catch (error) {
      if (epoch === currentRequestEpoch) setStatus('선택 영역 수정 차단: ' + (error.message || error) + ' 지원하지 않는 PNG 치수·형식·메타데이터는 적용하지 않습니다.', 'error');
    } finally {
      if (epoch === currentRequestEpoch) { setGenerating(false); setBusy(false); }
    }
  }

  const addReferenceData = ({ data, name = "참고 이미지", sourceKind = "auto", source = null, referenceRole }) => {
    const item = { id: `reference-${++imageSerial}`, name, data, kind: "reference", sourceKind, source, referenceRole, comments: [], nextCommentNumber: 1 };
    attachments.push(item);
    attachmentList.appendChild(makeImageCard(item));
    syncReferenceSummary();
    const tab = taskTabs.get(activeTaskTabId);
    if (tab && generatedImages.length === 0) tab.workState = "idle";
    if (tab && /^작업 \d+$/.test(tab.title) && attachments.length === 1) {
      tab.title = String(name || tab.title).replace(/\.[^.]+$/, "").slice(0, 22) || tab.title;
      renderTaskTabs();
    }
    persistTasks();commentController?.render();
    return item;
  };
  const attachReference = async ({ src, name = "참고 이미지", prompt = "" } = {}) => {
    if (!src) return;
    setStatus("참고 이미지 불러오는 중…", "busy");
    try {
      addReferencesAsTasks([{ data: await sourceToDataUrl(src), name, prompt }]);
      setStatus(`참고 이미지 추가됨: ${name}`, "ok");
    } catch (error) {
      setStatus(error.message || String(error), "error");
      addLog(error.message || String(error), "error");
    }
  };
  const imgReady = async (image) => {
    await image.decode();
  };
  const addPreview = async (src, { isCurrent = () => true, alreadyEditable = false, rendererPrompt = "", reviewState = "generating", reviewReport = emptyReviewReport(), reviewMeta = null } = {}) => {
    if (!src) return false;
    let editableSrc = src;
    let postprocessOk = alreadyEditable;
    const whitePng = isWhitePngWorkflow(currentRunInput || { mode: selectedMode, outputEngine: selectedOutputEngine });
    if (!alreadyEditable) {
      try {
        editableSrc = await resolveGeneratedRaster(src, { whitePng, transform: transparentizeGeneratedImage });
        postprocessOk = true;
      } catch (error) {
        if (whitePng) throw error;
        if (isCurrent()) addLog(`배경 자동 투명화 실패: ${error.message}`, "error");
      }
    }
    if (!isCurrent()) return false;
    const item = {
      id: `generated-${++imageSerial}`,
      name: `생성 결과 ${generatedImages.length + 1}`,
      data: editableSrc,
      kind: "generated",
      postprocessOk,
      reviewState,
      reviewReport: reviewReport ? JSON.parse(JSON.stringify(reviewReport)) : emptyReviewReport(),
      reviewMeta: reviewMeta ? { ...reviewMeta } : null,
      structureRecord: currentRunInput?.structureRecord ? JSON.parse(JSON.stringify(currentRunInput.structureRecord)) : null,
      rendererPrompt: typeof rendererPrompt === "string" ? rendererPrompt : "",
      generationMode: currentRunInput?.generationMode === 'separated' ? 'separated' : 'single',
      sourceReferenceId: currentRunInput?.attachments?.length === 1 ? currentRunInput.attachments[0].id : null,
      sourceReferenceName: currentRunInput?.attachments?.length === 1 ? currentRunInput.attachments[0].name : "",
      markPolicy: normalizeMarkPolicy(currentRunInput?.markPolicy),
      comments: [],
      nextCommentNumber: 1,
    };
    const inspectionStartedAt = performance.now();
    if (whitePng) {
      try { item.pixelInspection = await inspectPngDataUrl(editableSrc); }
      catch (error) { item.pixelInspectionError = error?.message || String(error); }
      if (!isCurrent()) return false;
    }
    const displayStartedAt = performance.now();
    if (currentRunInput?.approvedFirstPng) currentTurnPerformance = { ...currentTurnPerformance, pngInspectionMs: displayStartedAt - inspectionStartedAt };
    if (currentRunInput?.approvedFirstPng) {
      const displayImage = new Image();
      displayImage.src = editableSrc;
      await imgReady(displayImage);
      if (!isCurrent()) return false;
    }
    latestGeneratedSrc = editableSrc;
    previews.querySelector("[data-ai-empty]")?.remove();
    generatedImages.push(item);
    selectedCandidateId = item.id;
    panel.dataset.aiSelectedCandidateId = item.id;
    previews.prepend(makeImageCard(item));
    syncWhitePngUi();
    if (candidateUsesAutomaticSeparation(item)) void startAutomaticSeparation(item);
    if (currentRunInput?.approvedFirstPng) {
      currentTurnPerformance = { ...currentTurnPerformance, displayRegistrationMs: performance.now() - displayStartedAt };
    }
    return item;
  };

  const addScenePreview = (sceneResult, sceneSource, sceneCompileSource = sceneSource) => {
    if (!sceneResult?.valid || !sceneResult?.supported || !sceneResult.objects?.length) return false;
    const data = fastSceneToSvgDataUrl(sceneResult);
    latestGeneratedSrc = data;
    previews.querySelector("[data-ai-empty]")?.remove();
    const item = {
      id: `generated-${++imageSerial}`,
      name: `생성 결과 ${generatedImages.length + 1}`,
      data,
      kind: "generated",
      engine: IMAGE_ENGINE_IDS.FAST_SCENE,
      generationMode: AI_ASSET_GENERATION_MODES.SINGLE,
      sceneResult,
      sceneSource: String(sceneSource || ""),
      sceneCompileSource: String(sceneCompileSource || sceneSource || ""),
      sourceReferenceId: currentRunInput?.attachments?.length === 1 ? currentRunInput.attachments[0].id : null,
      sourceReferenceName: currentRunInput?.attachments?.length === 1 ? currentRunInput.attachments[0].name : "",
      comments: [],
      nextCommentNumber: 1,
    };
    generatedImages.push(item);
    previews.prepend(makeImageCard(item));
    return item;
  };

  const handleReviewLifecycle = (detail, candidate) => {
    if (["passed", "needs-attention", "failed", "cancelled"].includes(detail.state)) {
      // A retired first candidate must not remain visually 'correcting' forever.
      for (const old of generatedImages) {
        if (old.id !== candidate?.id && ["reviewing", "correcting"].includes(old.reviewState)) {
          dispatchReviewEvent({ ...old.reviewMeta, state: "needs-attention", candidateId: old.id, report: old.reviewReport }, old);
        }
      }
    }
    detail = enforcePngAcceptance(detail, candidate);
    const normalized = dispatchReviewEvent(detail, candidate);
    if (normalized.state === "reviewing") {
      setStatus(`${AI_IMAGE_REVIEW_MODEL} · high 독립 검수 중…`, "busy");
      setGenerating(true, "원본과 후보를 독립 검수하고 있습니다", "객체 수·안팎·액체·연결·검은 채움 의미를 확인합니다.", "analyze");
      return;
    }
    if (normalized.state === "correcting") {
      setStatus("명시된 구조 실패를 한 번 교정 중…", "busy");
      setGenerating(true, "검수 실패 영역을 교정하고 있습니다", "원본과 현재 후보를 보존하며 실패 항목만 교정합니다.", "render");
      return;
    }
    if (!["passed", "needs-attention", "failed", "cancelled"].includes(normalized.state)) return;
    setGenerating(false);
    currentTurnDone = true;
    if (normalized.state === "passed" && candidate?.data) {
      currentReviewCandidate = candidate;
      stageCurrentOutput({ data: candidate.data, reviewVerified: true, reviewReport: normalized.report });
      setTaskState("completed");
      setStatus("Sol 독립 검수 통과 · 생성 완료", "ok");
      addLog("원본 참고와 현재 후보의 구조 하드 게이트가 모두 통과되었습니다.");
      void commitCurrentOutput();
    } else {
      pendingCacheOutput = null;
      if (normalized.state === "needs-attention") {
        setStatus("독립 검수 확인 필요", "warn");
        addLog("자동 검수에서 실패 또는 불확실 항목이 남았습니다. 이 결과는 검증 완료로 재사용되지 않습니다.", "error");
      } else if (normalized.state === "cancelled") {
        setStatus("독립 검수 취소됨", "warn");
      } else {
        setStatus("독립 검수 실패", "error");
        addLog(normalized.report?.issues?.[0]?.message || "독립 검수 보고서를 확인하지 못했습니다.", "error");
      }
    }
    setBusy(false);
    captureActiveTaskTab();
    void loadAccountOverview();
  };

  imageReview = createAiImageReviewController({
    transport: { send: (payload) => desktop.send(payload) },
    onState: handleReviewLifecycle,
  });

  let commentController = null;
  let workspaceReady = Promise.resolve();
  const taskStore = typeof indexedDB !== "undefined" ? new IndexedDBOutputCacheBackend({databaseName:clientScope ? `5e-ai-image-tasks-${clientScope}` : "5e-ai-image-tasks",storeName:"tasks"}) : null;
  const taskItemCopy = (item) => ({ ...snapshotImageItem(item), card: null });
  const captureActiveTaskTab = () => {
    const tab = taskTabs.get(activeTaskTabId);
    if (!tab) return;
    tab.attachments = attachments.map(taskItemCopy);
    tab.generated = generatedImages.map(taskItemCopy);
    tab.conversationMessages = conversationMessages.map((message) => ({ ...message }));
    tab.uiMessages = Array.from(log.querySelectorAll(".ai-msg")).map((node) => ({
      text: node.textContent || "",
      kind: node.classList.contains("user") ? "user" : node.classList.contains("error") ? "error" : "assistant",
    }));
    tab.selectedCandidateId = selectedCandidateId;
    tab.referenceComposition = structuredClone(referenceComposition);
    const workbenchState = panel.aiWorkbench?.getViewState?.();
    if (workbenchState) tab.workbenchViewState = structuredClone(workbenchState);
    tab.input = input.value;
    tab.conversationId = conversationId;
    tab.mode = selectedMode;
    tab.qualityMode = selectedQualityMode;
    tab.outputEngine = selectedOutputEngine;
    tab.generationMode = selectedAssetGenerationMode;
    tab.markPolicy = readMarkPolicy();
    tab.outputOptions = normalizeImageOutputOptions(selectedImageOutputOptions);
    tab.generationTiming = serializeGenerationTiming(generationTiming, Date.now());
    if (busy && providerRequestPersistable && currentRequestSnapshot) {
      tab.inFlightRequest = {
        type: currentTurnType,
        snapshot: structuredClone(currentRequestSnapshot),
      };
    }
  };
  const taskPersistence = createTaskPersistence({
    store: taskStore,
    capture: captureActiveTaskTab,
    snapshot: () => ({key:"workspace",tabs:[...taskTabs.values()],activeTaskTabId,taskTabSerial,imageSerial}),
    warn: error => addLog(`작업 임시저장 실패: ${error.message}. 창을 새로고침하지 마세요.`, "error"),
  });
  const persistTasks = () => taskPersistence.schedule();

  function setTaskState(workState) {
    const tab = taskTabs.get(activeTaskTabId);
    if (!tab || tab.workState === workState) return;
    tab.workState = workState;
    if (workState === 'failed' && currentRequestSnapshot) {
      tab.retryRequest = { type: currentTurnType, snapshot: structuredClone(currentRequestSnapshot) };
    }
    if (workState !== 'busy') {
      tab.inFlightRequest = null;
      providerRequestPersistable = false;
    }
    if (!['busy', 'interrupted', 'failed'].includes(workState)) tab.retryRequest = null;
    retryInterruptedButton.hidden = !['interrupted', 'failed'].includes(workState);
    retryInterruptedButton.textContent = workState === 'failed' ? '변환 다시 시도' : '중단 작업 다시 시도';
    retryInterruptedButton.disabled = busy || !tab.retryRequest?.snapshot;
    renderTaskTabs();
    persistTasks();
  }

  const syncTaskDeleteShortcutHints = () => {
    for (const button of tabList?.querySelectorAll('.ai-task-tab') || []) {
      const current = button.title || button.dataset.tip || '';
      const base = current.replace(/\s*·\s*앱 삭제:.*$/, '').trim();
      const next = `${base}${base ? ' · ' : ''}${taskDeleteShortcutHint()}`;
      button.title = next;
      if (button.dataset.tip) button.dataset.tip = next;
    }
  };

  const renderTaskTabs = () => {
    if (!tabList) return;
    tabList.replaceChildren();
    for (const tab of taskTabs.values()) {
      const button = document.createElement("div");
      button.className = "ai-task-tab";
      button.dataset.tabId = tab.id;
      button.dataset.workState = tab.workState || "idle";
      const stateLabel = { busy: "작업 중", interrupted: "작업 중단", completed: "작업 완료", failed: "작업 실패", idle: "대기" }[button.dataset.workState] || "대기";
      button.setAttribute("aria-label", `${tab.title} · ${stateLabel}`);
      button.title = `${tab.title} · ${stateLabel} · ${taskDeleteShortcutHint()}`;
      if (["completed", "busy", "interrupted", "failed"].includes(tab.workState)) {
        const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        check.setAttribute("viewBox", "0 0 24 24");
        check.setAttribute("width", "14");
        check.setAttribute("height", "14");
        check.setAttribute("aria-hidden", "true");
        check.classList.add("ai-task-tab-status");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const iconPath = {
          completed: "m20 6-11 11-5-5",
          busy: "M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
          interrupted: "M12 7v6 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
          failed: "M12 8v4 M12 16h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
        };
        path.setAttribute("d", iconPath[tab.workState]);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "2");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        check.append(path);
        button.append(check);
      }
      button.classList.toggle("is-on", tab.id === activeTaskTabId);
      button.setAttribute("role", "tab");
      button.setAttribute('tabindex', tab.id === activeTaskTabId ? '0' : '-1');
      button.setAttribute("aria-selected", String(tab.id === activeTaskTabId));
      const selectTab = document.createElement('button');
      selectTab.type = 'button';
      selectTab.className = 'ai-task-tab-select';
      selectTab.setAttribute('aria-hidden', 'true');
      selectTab.setAttribute('tabindex', '-1');
      const source = (tab.attachments || [])[0];
      if (source?.data) {
        const thumbnail = document.createElement("img");
        thumbnail.className = "ai-task-tab-thumb";
        thumbnail.src = source.data;
        thumbnail.alt = "";
        selectTab.append(thumbnail);
      }
      const copy = document.createElement("span");
      copy.className = "ai-task-tab-copy";
      const label = document.createElement("span");
      label.className = "ai-task-tab-title";
      label.textContent = tab.title;
      label.title = tab.title;
      copy.append(label);
      const timingSample = sampleGenerationTiming(restoreGenerationTiming(tab.generationTiming, { interruptRunning: false }), Date.now());
      if (timingSample.timing) tab.generationTiming = timingSample.timing;
      const timingLabel = document.createElement("small");
      timingLabel.className = "ai-task-tab-time";
      timingLabel.textContent = taskTimingLabel(tab, timingSample.view);
      copy.append(timingLabel);
      if ((tab.attachments || []).length > 1 && !tab.referenceComposition) {
        const warning = document.createElement("small");
        warning.textContent = "연결 확인 필요";
        copy.append(warning);
      }
      const closeTab = document.createElement("button");
      closeTab.type = 'button';
      closeTab.className = 'ai-task-delete';
      closeTab.textContent = "×";
      closeTab.title = "작업 삭제";
      closeTab.setAttribute('aria-label', `${tab.title} 작업 삭제`);
      closeTab.onclick = async (event) => {
        event.stopPropagation();
        if (busy) { setStatus('변환이 끝나거나 취소된 뒤 삭제해 주세요.', 'warn'); return; }
        if (!await scopedDialog('작업 삭제', `‘${tab.title}’ 작업을 삭제할까요? 원본 파일은 삭제하지 않습니다.`, {accept: '작업 삭제', defaultAccept: true})) return;
        if (busy || !taskTabs.has(tab.id)) return;
        captureActiveTaskTab();
        taskTabs.delete(tab.id);
        if (!taskTabs.size) {
          restoreTaskTab(null);
          persistTasks();
          workspaceEmpty();
          return;
        }
        if (activeTaskTabId === tab.id) restoreTaskTab(taskTabs.keys().next().value);
        else renderTaskTabs();
        persistTasks();
      };
      selectTab.append(copy);
      button.append(selectTab, closeTab);
      button.onclick = () => {
        if (busy || tab.id === activeTaskTabId) return;
        captureActiveTaskTab();
        restoreTaskTab(tab.id);
      };
      button.onkeydown = event => {
        if (event.target !== button || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        button.click();
      };
      tabList.appendChild(button);
    }
    navigationChanged([...tabList.children]);
    collectiveExportButton.disabled = busy || exportInProgress
      || !(generatedImages.length || [...taskTabs.values()].some(tab => Array.isArray(tab.generated) && tab.generated.length));
  };

  const resetVisualLists = () => {
    attachmentList.replaceChildren();
    const emptyReference = document.createElement("p");
    emptyReference.className = "ai-reference-empty";
    emptyReference.dataset.aiReferenceEmpty = "";
    emptyReference.textContent = "이미지를 추가하면 이 작업의 원본으로 표시됩니다.";
    attachmentList.appendChild(emptyReference);
    previews.querySelectorAll(".ai-image-card, [data-ai-empty]").forEach((node) => node.remove());
  };

  function restoreTaskTab(tabId) {
    const tab = tabId === null ? { id: null } : taskTabs.get(tabId);
    if (!tab) return;
    abortAutomaticSeparation('task-changed');
    scopedSelectionRevision += 1;
    scopedTransport?.fail(new Error("작업 탭이 변경되었습니다."));
    activeTaskTabId = tab.id;
    generationTiming = restoreGenerationTiming(tab.generationTiming, { interruptRunning: false });
    generationLongWaitShown = false;
    stopGenerationTimingTimer();
    const timingView = renderGenerationTiming();
    if (timingView?.running) generationTimingTimer = setInterval(() => renderGenerationTiming(), 1_000);
    currentRequestEpoch += 1;
    currentTurnId = null;
    currentRenderThreadId = null;
    awaitingTurnId = false;
    queuedTurnEvents = [];
    conversationId = tab.conversationId || null;
    conversationMessages = (tab.conversationMessages || []).map((message) => ({ ...message }));
    selectedMode = tab.mode || KICE_IMAGE_MODE;
    selectedQualityMode = normalizeQualityMode(tab.qualityMode);
    selectedOutputEngine = normalizeOutputEngine(tab.outputEngine);
    selectedImageOutputOptions = normalizeImageOutputOptions(tab.outputOptions || selectedImageOutputOptions);
    selectedAssetGenerationMode = tab.generationMode === AI_ASSET_GENERATION_MODES.SEPARATED
      ? AI_ASSET_GENERATION_MODES.SEPARATED : AI_ASSET_GENERATION_MODES.SINGLE;
    generationModeSelect.value = selectedAssetGenerationMode;
    attachments = (tab.attachments || []).map(taskItemCopy);
    generatedImages = (tab.generated || []).map(taskItemCopy);
    referenceComposition = normalizeReferenceComposition(tab.referenceComposition, attachments);
    for (const item of generatedImages) {
      if (item.reviewState === 'passed' && !parseImageReviewReport(JSON.stringify(item.reviewReport)).ok) {
        item.reviewState = 'needs-attention';
        item.reviewReport = { verdict: 'uncertain', checks: [], issues: [{ message: '검수 기준이 변경되어 요청 반영·요청 외 보존의 재검수가 필요합니다.', severity: 'major' }] };
      }
    }
    latestGeneratedSrc = generatedImages.at(-1)?.data || null;
    for (const item of generatedImages) {
      const gated = enforcePngAcceptance({state:item.reviewState,report:item.reviewReport},item);
      item.reviewState = gated.state;
      item.reviewReport = gated.report;
    }
    restoreMarkPolicy(tab.markPolicy);
    input.value = tab.input || "";
    log.replaceChildren();
    for (const message of tab.uiMessages || []) addLog(message.text, message.kind);
    if (!log.children.length) {
      const emptyLog = document.createElement("p");
      emptyLog.className = "ai-log-empty";
      emptyLog.dataset.aiLogEmpty = "";
      emptyLog.textContent = "대화로 요구사항을 정리한 뒤 이미지를 생성하세요.";
      log.appendChild(emptyLog);
    }
    resetVisualLists();
    for (const item of attachments) attachmentList.appendChild(makeImageCard(item));
    for (const item of generatedImages) previews.prepend(makeImageCard(item));
    if (!generatedImages.length) {
      const empty = document.createElement("p");
      empty.className = "ai-empty ai-stage-empty";
      empty.dataset.aiEmpty = "";
      empty.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m5 17 4.5-4.5 3.2 3.2 2-2L19 18"/></svg><strong>작업할 이미지를 추가하세요</strong><span>이미지를 끌어놓거나 파일을 선택하세요.</span><button class="ai-stage-add" type="button" data-ai-add-file>이미지 선택</button>';
      previews.appendChild(empty);
    }
    syncMode();
    syncQualityMode();
    syncOutputEngine();
    syncReferenceSummary();
    panel.aiWorkbench?.restoreViewState?.(tab.workbenchViewState || null);
    renderTaskTabs();
    retryInterruptedButton.hidden = !['interrupted', 'failed'].includes(tab.workState);
    retryInterruptedButton.textContent = tab.workState === 'failed' ? '변환 다시 시도' : '중단 작업 다시 시도';
    retryInterruptedButton.disabled = busy || !tab.retryRequest?.snapshot;
    selectedCandidateId = tab.selectedCandidateId || generatedImages.at(-1)?.id || null;
    panel.dataset.aiSelectedCandidateId = selectedCandidateId || "";
    const selectedCandidate = generatedImages.find((item) => item.id === selectedCandidateId) || generatedImages.at(-1) || null;
    if (selectedCandidate) {
      dispatchReviewEvent({
        state: selectedCandidate.reviewState || "idle",
        candidateId: selectedCandidate.id,
        report: selectedCandidate.reviewReport || emptyReviewReport(),
        generationCount: selectedCandidate.reviewMeta?.generationCount || 0,
        reviewCount: selectedCandidate.reviewMeta?.reviewCount || 0,
        model: selectedCandidate.reviewMeta?.model || AI_IMAGE_REVIEW_MODEL,
        effort: selectedCandidate.reviewMeta?.effort || AI_IMAGE_REVIEW_EFFORT,
        elapsedMs: selectedCandidate.reviewMeta?.elapsedMs || 0,
      }, selectedCandidate);
    } else {
      dispatchReviewEvent({ state: "idle", candidateId: null, report: emptyReviewReport(), generationCount: 0, reviewCount: 0, elapsedMs: 0 });
    }
    commentController?.reset();
    if (!busy) {
      const legacyMixed = attachments.length > 1 && !tab.referenceComposition;
      setStatus(tab.workState === 'interrupted'
        ? (tab.retryRequest?.snapshot
          ? '이전 실행이 중단되었습니다. 자동 재전송하지 않았습니다. 다시 시도할 수 있습니다.'
          : '이전 실행이 중단되었습니다. 공급자 상태를 알 수 없어 자동 재전송하지 않았습니다.')
        : legacyMixed
        ? "이전 다중 원본 작업 · 결과 연결을 확인해 주세요."
        : selectedCandidate
          ? (isAcceptedReviewState(selectedCandidate.reviewState) ? selectedReviewStatusText(selectedCandidate.reviewState) : "선택 결과 · 확인 필요")
          : (attachments.length ? "준비됨" : "이미지를 추가해 주세요."),
      tab.workState === 'interrupted' || legacyMixed || (selectedCandidate && !isAcceptedReviewState(selectedCandidate.reviewState)) ? "warn" : "ok");
    }
    if (tab.workState === "interrupted") {
      generating.hidden = false;
      progressTitle.textContent = "이전 이미지 작업이 중단되었습니다";
      progressDetail.textContent = generationTiming
        ? "마지막 저장 시점의 경과 시간에서 멈췄습니다. 자동 재전송하지 않았습니다."
        : "이전 작업의 시간 정보가 없어 자동 재전송하지 않았습니다.";
      renderGenerationTiming();
    } else if (!timingView?.running) {
      generating.hidden = true;
    }
    if (candidateUsesAutomaticSeparation(selectedCandidate)) void startAutomaticSeparation(selectedCandidate);
  }

  const createTaskTab = ({ activate = true } = {}) => {
    if (busy) return null;
    captureActiveTaskTab();
    const id = `${clientScope ? clientScope + ":" : ""}task-${++taskTabSerial}`;
    taskTabs.set(id, {
      id,
      title: `작업 ${taskTabSerial}`,
      attachments: [], generated: [], conversationMessages: [], uiMessages: [], input: "",
      generationTiming: null,
      conversationId: null, mode: selectedMode, qualityMode: selectedQualityMode, outputEngine: selectedOutputEngine,
      generationMode: selectedAssetGenerationMode, outputOptions: normalizeImageOutputOptions(selectedImageOutputOptions),
      referenceComposition: normalizeReferenceComposition(null, []), workbenchViewState: null,
    });
    if (activate) restoreTaskTab(id);
    else renderTaskTabs();
    return id;
  };

  const addReferencesAsTasks = (references, { prompt = "", placement = "separate", groups = null } = {}) => {
    if (busy) {
      setStatus("현재 변환이 끝난 뒤 이미지를 추가해 주세요.", "warn");
      return [];
    }
    const taskActions = {
      canUseActiveTask: () => Boolean(activeTaskTabId) && attachments.length === 0 && generatedImages.length === 0,
      createTask: () => createTaskTab(),
      addSource: reference => addReferenceData(reference),
      applyPrompt: nextPrompt => { if (nextPrompt) input.value = nextPrompt; },
      captureTask: captureActiveTaskTab,
      activeTaskId: () => activeTaskTabId,
      activateTask: taskId => restoreTaskTab(taskId),
    };
    if (placement === "advanced") {
      const taskIds = groupedReferences(references, groups)
        .flatMap((items) => groupSourcesInTaskTab(items, taskActions, { prompt }));
      persistTasks();
      return taskIds;
    }
    if (placement === "together" && references.length) {
      groupSourcesInTaskTab(references, taskActions, { prompt });
      persistTasks();
      return [activeTaskTabId];
    }
    return distributeSourcesToTaskTabs(references, {
      ...taskActions,
      applyPrompt: sourcePrompt => { if (sourcePrompt || prompt) input.value = sourcePrompt || prompt; },
    });
  };

  let batchQueue = [];
  let batchRunningCount = 0;
  const BATCH_CONCURRENCY = 1;

  const updateBatchSummary = () => {
    if (!batchSummary) return;
    const jobs = Array.from(new Map(
      Array.from(batchRuns.values()).filter((job) => job.root === true).map((job) => [job.id, job]),
    ).values());
    const complete = jobs.filter((job) => job.state === "complete").length;
    const failed = jobs.filter((job) => job.state === "failed").length;
    batchSummary.textContent = `${complete}/${jobs.length} 완료${failed ? ` · ${failed} 실패` : ""} · 1개씩 순차 처리`;
    if (jobs.length && complete + failed === jobs.length) {
      batchActive = false;
      if (batchButton) batchButton.disabled = attachments.length < 2 || busy || (isWhitePngWorkflow({ mode: selectedMode, outputEngine: selectedOutputEngine }) && reviewModeCheckbox?.checked !== false);
      try {
        const history = JSON.parse(localStorage.getItem("5e.aiBatchHistory.v1") || "[]");
        history.push({
          at: new Date().toISOString(),
          qualityMode: jobs[0]?.qualityMode || selectedQualityMode,
          jobs: jobs.map((job) => ({ name: job.name, state: job.state, elapsedMs: job.elapsedMs || null, passes: job.pass || 1, whitePng: job.whitePng === true, qualityMode: job.qualityMode })),
        });
        localStorage.setItem("5e.aiBatchHistory.v1", JSON.stringify(history.slice(-20)));
      } catch {}
    }
  };

  const updateBatchCard = (job, text) => {
    if (!job.card) return;
    job.card.dataset.state = job.state;
    job.statusNode.textContent = text || job.state;
    if (job.resultData) {
      job.imageNode.src = job.resultData;
      job.imageNode.hidden = false;
    }
    updateBatchSummary();
  };

  const addBatchResultToTab = (job) => {
    if (!job.resultData || job.addedToTab) return;
    job.addedToTab = true;
    const item = {
      id: `generated-${++imageSerial}`,
      name: `${job.name} · ${job.qualityMode === AI_QUALITY_MODES.COMPLEX ? "복잡" : job.qualityMode === AI_QUALITY_MODES.SIMPLE ? "단순" : "보통"}`,
      data: job.resultData,
      markPolicy: normalizeMarkPolicy(job.markPolicy),
      kind: "generated",
      engine: IMAGE_ENGINE_IDS.RASTER,
      postprocessOk: true,
      comments: [],
      nextCommentNumber: 1,
    };
    if (activeTaskTabId === job.taskTabId) {
      generatedImages.push(item);
      latestGeneratedSrc = item.data;
      previews.querySelector("[data-ai-empty]")?.remove();
      previews.prepend(makeImageCard(item));
      captureActiveTaskTab();
    } else {
      const tab = taskTabs.get(job.taskTabId);
      if (tab) tab.generated.push(taskItemCopy(item));
    }
  };

  const releaseBatchSlot = (job) => {
    if (!job.slotHeld) return;
    job.slotHeld = false;
    batchRunningCount = Math.max(0, batchRunningCount - 1);
    pumpBatchQueue();
  };

  const startBatchPass = async (job, pass = 1) => {
    job.pass = pass;
    job.state = pass === 1 ? "running" : "correcting";
    updateBatchCard(job, pass === 1 ? "생성 중…" : "구조 교정 중…");
    const revision = pass > 1;
    const sourceItem = { ...job.source, kind: "reference", comments: job.source.comments || [] };
    const previousResult = job.resultData;
    const outgoing = [sourceItem];
    if (revision && previousResult) {
      outgoing.push({
        id: `${job.id}-draft`, name: "직전 생성 결과", data: previousResult,
        kind: "generated", sourceKind: "line-art", comments: [],
      });
    }
    job.resultData = null;
    job.pendingImagePromise = null;
    try {
      const transport = await Promise.all(outgoing.map(prepareTransportItem));
      const comments = commentPrompt([sourceItem]);
      const request = revision
        ? `${job.request}${comments}\n원본과 직전 결과를 객체별로 비교하고 형태·개수·분기·연결이 달라진 부분만 교정해 줘. 맞는 영역은 그대로 보존해 줘.`
        : `${job.request}${comments}`;
      const result = await desktop.send({
        text: (job.whitePng ? buildWhitePngPrompt : buildImagePrompt)({
          request,
          mode: job.mode,
          revision,
          qualityMode: job.qualityMode,
          markPolicyContract: buildMarkPolicyContract(job.markPolicy),
        }),
        attachments: transport,
        conversationId: null,
        purpose: "image",
        ephemeralRender: true,
        model: job.model,
        effort: job.effort,
        serviceTier: job.serviceTier,
      });
      job.turnId = result.turnId || null;
      job.threadId = result.renderThreadId || result.threadId || null;
      if (job.turnId) batchRuns.set(job.turnId, job);
      for (let index = unclaimedBatchEvents.length - 1; index >= 0; index -= 1) {
        const pending = unclaimedBatchEvents[index];
        if ((pending.turnId && pending.turnId === job.turnId) || (pending.threadId && pending.threadId === job.threadId)) {
          unclaimedBatchEvents.splice(index, 1);
          void dispatchBatchEvent(job, pending);
        }
      }
    } catch (error) {
      job.state = "failed";
      job.error = error.message || String(error);
      job.elapsedMs = Math.round(performance.now() - job.startedAt);
      updateBatchCard(job, `실패 · ${job.error}`);
      if (job.queueRecord && durableBatchUi) void durableBatchUi.failed(job.queueRecord, job.error);
      releaseBatchSlot(job);
    }
  };

  async function dispatchBatchEvent(job, event) {
    if (!job || job.state === "complete" || job.state === "failed") return;
    if (event.kind === "progress") {
      updateBatchCard(job, event.title || (job.pass > 1 ? "구조 교정 중…" : "생성 중…"));
      return;
    }
    if (event.kind === "performance") {
      job.performance = { ...job.performance, ...event.metrics };
      return;
    }
    if (event.kind === "image" && event.src) {
      job.pendingImagePromise = (async () => {
        try {
          job.resultData = await resolveGeneratedRaster(event.src, { whitePng: job.whitePng, transform: transparentizeGeneratedImage });
          updateBatchCard(job, job.pass > 1 ? "교정 결과 정리 중…" : "결과 정리 중…");
        } catch (error) {
          job.error = error.message || String(error);
        }
      })();
      await job.pendingImagePromise;
      return;
    }
    if (event.kind === "assistant") {
      job.responseText = event.text || "";
      return;
    }
    if (event.kind === "error") {
      job.error = event.text || "이미지 생성 오류";
      return;
    }
    if (event.kind !== "done") return;
    if (job.pendingImagePromise) await job.pendingImagePromise;
    if (event.status === "failed" || !job.resultData) {
      job.state = "failed";
      job.elapsedMs = Math.round(performance.now() - job.startedAt);
      updateBatchCard(job, `실패 · ${job.error || event.error || job.responseText || "결과 없음"}`);
      if (job.queueRecord && durableBatchUi) void durableBatchUi.failed(job.queueRecord, job.error || event.error || "결과 없음");
      releaseBatchSlot(job);
      return;
    }
    if (!job.whitePng && job.qualityMode === AI_QUALITY_MODES.COMPLEX && job.pass === 1) {
      if (job.turnId) batchRuns.delete(job.turnId);
      await startBatchPass(job, 2);
      return;
    }
    job.state = "complete";
    job.elapsedMs = Math.round(performance.now() - job.startedAt);
    updateBatchCard(job, job.pass > 1
      ? `완료 · ${(job.elapsedMs / 1000).toFixed(1)}초 · 2회 · 구조 확인 필요`
      : `완료 · ${(job.elapsedMs / 1000).toFixed(1)}초`);
    addBatchResultToTab(job);
    if (job.queueRecord && durableBatchUi) void durableBatchUi.completed(job.queueRecord, { dataUrl: job.resultData, name: job.name });
    releaseBatchSlot(job);
  }

  async function startQueuedBatchJob(job) {
    job.slotHeld = true;
    batchRunningCount += 1;
    job.startedAt = performance.now();
    await startBatchPass(job, 1);
  }

  function pumpBatchQueue() {
    while (batchRunningCount < BATCH_CONCURRENCY && batchQueue.length) {
      const job = batchQueue.shift();
      void startQueuedBatchJob(job);
    }
  }

  const runBatch = async () => {
    if (isWhitePngWorkflow({ mode: selectedMode, outputEngine: selectedOutputEngine }) && reviewModeCheckbox?.checked !== false) {
      setStatus("검수 포함 일괄 변환은 아직 지원하지 않습니다. 새 작업으로 그림별 변환을 실행하세요.", "warn");
      return;
    }
    if (attachments.some(item => !isInputReference(item))) { setStatus('표현 참고가 있는 일괄 변환은 아직 지원하지 않습니다. 새 작업에서 한 번씩 변환하세요.','warn'); return; }
    if (batchActive || busy || attachments.length < 2) return;
    if (selectedOutputEngine !== AI_OUTPUT_ENGINES.RASTER) {
      setStatus("여러 장 변환은 교과서 선화 출력에서 사용해 주세요.", "warn");
      return;
    }
    if (durableBatchUi) {
      const request = input.value.trim() || "각 참고 이미지에서 주 과학 그림만 남기고 글자·라벨·강조 원·페이지 배경을 제거하고 선택한 표시선 정책을 적용하여 평가원식 무라벨 흑백 선화로 변환해 줘.";
      await durableBatchUi.enqueue(attachments.map((source) => ({ name: source.name, dataUrl: source.data, originalPath: source.path || null })), {
        request, mode: selectedMode, whitePng: isWhitePngWorkflow({ mode: selectedMode, outputEngine: selectedOutputEngine }),
        markPolicy: readMarkPolicy(), qualityMode: selectedQualityMode, model: modelSelect.value || null,
        effort: effortSelect.value || null, serviceTier: speedSelect.value || null,
      });
      setStatus("대기열을 저장했습니다. 최대 10개 작업을 동시에 시작합니다.", "busy");
      return;
    }
    captureActiveTaskTab();
    const request = input.value.trim() || "각 참고 이미지에서 주 과학 그림만 남기고 글자·라벨·강조 원·페이지 배경을 제거하고 선택한 표시선 정책을 적용하여 평가원식 무라벨 흑백 선화로 변환해 줘.";
    batchActive = true;
    batchQueue = [];
    batchRunningCount = 0;
    batchRuns.clear();
    if (batchPanel) batchPanel.hidden = false;
    if (batchGrid) batchGrid.replaceChildren();
    const roots = attachments.map((source, index) => {
      const job = {
        id: `batch-${Date.now()}-${index + 1}`,
        root: true,
        taskTabId: activeTaskTabId,
        name: source.name,
        source: taskItemCopy(source),
        request,
        mode: selectedMode,
        whitePng: isWhitePngWorkflow({ mode: selectedMode, outputEngine: selectedOutputEngine }),
        markPolicy: readMarkPolicy(),
        qualityMode: isWhitePngWorkflow({ mode: selectedMode, outputEngine: selectedOutputEngine }) ? AI_QUALITY_MODES.SIMPLE : selectedQualityMode,
        model: modelSelect.value || null,
        effort: effortSelect.value || null,
        serviceTier: speedSelect.value || null,
        state: "queued",
        resultData: null,
      };
      const card = document.createElement("article");
      card.className = "ai-batch-card";
      card.dataset.state = "queued";
      const title = document.createElement("strong");
      title.textContent = source.name;
      const statusNode = document.createElement("span");
      statusNode.textContent = "대기 중";
      const imageNode = document.createElement("img");
      imageNode.alt = `${source.name} 변환 결과`;
      imageNode.hidden = true;
      card.append(title, statusNode, imageNode);
      batchGrid?.appendChild(card);
      job.card = card;
      job.statusNode = statusNode;
      job.imageNode = imageNode;
      batchRuns.set(job.id, job);
      return job;
    });
    batchQueue.push(...roots);
    if (batchButton) batchButton.disabled = true;
    setStatus(`참고 이미지 ${roots.length}개를 1개씩 순차 변환합니다.`, "busy");
    updateBatchSummary();
    pumpBatchQueue();
  };

  const allImages = () => [...attachments, ...generatedImages];
  const openComparison = () => {
    const images = allImages();
    if (images.length < 2) {
      setStatus("비교할 이미지를 두 개 이상 추가해 주세요.", "warn");
      return;
    }
    const overlay = document.createElement("div");
    overlay.className = "ai-compare-overlay";
    const dialog = document.createElement("section");
    dialog.className = "ai-compare-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const head = document.createElement("div");
    head.className = "ai-compare-head";
    const title = document.createElement("strong");
    title.textContent = "이미지 1:1 비교";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.title = "비교 닫기";
    head.append(title, closeButton);
    const panes = document.createElement("div");
    panes.className = "ai-compare-panes";

    const makePane = (initial) => {
      const pane = document.createElement("div");
      pane.className = "ai-compare-pane";
      const label = document.createElement("strong");
      const main = document.createElement("img");
      main.className = "ai-compare-main";
      const picker = document.createElement("div");
      picker.className = "ai-compare-picker";
      const choose = (item) => {
        main.src = item.data;
        main.alt = item.name;
        label.textContent = item.name;
        picker.querySelectorAll("button").forEach((button) => button.classList.toggle("is-on", button.dataset.imageId === item.id));
      };
      for (const item of images) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.imageId = item.id;
        button.title = item.name;
        const thumb = document.createElement("img");
        thumb.src = item.data;
        thumb.alt = "";
        button.appendChild(thumb);
        button.onclick = () => choose(item);
        picker.appendChild(button);
      }
      pane.append(label, main, picker);
      choose(initial);
      return pane;
    };
    const leftInitial = attachments[0] || images[0];
    const rightInitial = generatedImages.at(-1) || images.find((item) => item !== leftInitial) || images[1];
    panes.append(makePane(leftInitial), makePane(rightInitial));
    dialog.append(head, panes);
    overlay.appendChild(dialog);
    registerEscapeLayer(dialog, () => overlay.remove());
    closeButton.onclick = () => overlay.remove();
    overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) overlay.remove(); });
    document.documentElement.appendChild(overlay);
  };

  const openCaptureCrop = (source) => {
    const overlay = document.createElement("div");
    overlay.className = "ai-compare-overlay";
    const dialog = document.createElement("section");
    dialog.className = "ai-compare-dialog ai-crop-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const head = document.createElement("div");
    head.className = "ai-compare-head";
    const title = document.createElement("strong");
    title.textContent = `${source.name} · 캡처 영역 지정`;
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.title = "캡처 취소";
    head.append(title, closeButton);

    const stage = document.createElement("div");
    stage.className = "ai-crop-stage";
    const wrap = document.createElement("div");
    wrap.className = "ai-crop-image-wrap";
    const image = document.createElement("img");
    image.src = source.data;
    image.alt = source.name;
    image.draggable = false;
    const masks = Array.from({ length: 4 }, () => {
      const mask = document.createElement("div");
      mask.className = "ai-crop-mask";
      return mask;
    });
    const selection = document.createElement("div");
    selection.className = "ai-crop-selection";
    wrap.append(image, ...masks, selection);
    stage.appendChild(wrap);

    const foot = document.createElement("div");
    foot.className = "ai-crop-foot";
    const hint = document.createElement("span");
    hint.textContent = "회색 화면 위에서 필요한 영역을 드래그하세요.";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "취소";
    const applyButton = document.createElement("button");
    applyButton.type = "button";
    applyButton.dataset.aiCropApply = "";
    applyButton.textContent = "선택 영역 추가";
    applyButton.disabled = true;
    foot.append(hint, cancelButton, applyButton);
    dialog.append(head, stage, foot);
    overlay.appendChild(dialog);
    // body에는 앱 UI 배율(zoom)이 적용된다. 뷰포트 좌표를 쓰는 캡처막은 루트에 둬야 포인터와 일치한다.
    document.documentElement.appendChild(overlay);

    let start = null;
    let box = null;
    const closeCrop = () => overlay.remove();
    registerEscapeLayer(dialog, closeCrop);
    const point = (event) => {
      const rect = wrap.getBoundingClientRect();
      return { x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)), y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)) };
    };
    const renderCrop = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (!box) {
        Object.assign(masks[0].style, { left: "0px", top: "0px", width: `${w}px`, height: `${h}px` });
        for (let i = 1; i < masks.length; i += 1) Object.assign(masks[i].style, { width: "0px", height: "0px" });
        selection.style.display = "none";
        applyButton.disabled = true;
        return;
      }
      const x = Math.min(box.x1, box.x2), y = Math.min(box.y1, box.y2);
      const sw = Math.abs(box.x2 - box.x1), sh = Math.abs(box.y2 - box.y1);
      Object.assign(masks[0].style, { left: "0px", top: "0px", width: `${w}px`, height: `${y}px` });
      Object.assign(masks[1].style, { left: "0px", top: `${y}px`, width: `${x}px`, height: `${sh}px` });
      Object.assign(masks[2].style, { left: `${x + sw}px`, top: `${y}px`, width: `${Math.max(0, w - x - sw)}px`, height: `${sh}px` });
      Object.assign(masks[3].style, { left: "0px", top: `${y + sh}px`, width: `${w}px`, height: `${Math.max(0, h - y - sh)}px` });
      Object.assign(selection.style, { display: "block", left: `${x}px`, top: `${y}px`, width: `${sw}px`, height: `${sh}px` });
      applyButton.disabled = sw < 4 || sh < 4;
      hint.textContent = applyButton.disabled ? "조금 더 넓게 드래그하세요." : `${Math.round(sw)} × ${Math.round(sh)}px 영역을 선택했습니다.`;
    };
    if (image.complete) requestAnimationFrame(renderCrop);
    else image.addEventListener("load", renderCrop, { once: true });
    wrap.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      start = point(event);
      box = { x1: start.x, y1: start.y, x2: start.x, y2: start.y };
      wrap.setPointerCapture?.(event.pointerId);
      renderCrop();
    });
    wrap.addEventListener("pointermove", (event) => {
      if (!start || !box) return;
      const next = point(event);
      box.x2 = next.x;
      box.y2 = next.y;
      renderCrop();
    });
    wrap.addEventListener("pointerup", () => { start = null; });
    wrap.addEventListener("pointercancel", () => { start = null; });
    applyButton.onclick = () => {
      if (!box || applyButton.disabled) return;
      const x = Math.min(box.x1, box.x2), y = Math.min(box.y1, box.y2);
      const w = Math.abs(box.x2 - box.x1), h = Math.abs(box.y2 - box.y1);
      const scaleX = image.naturalWidth / Math.max(1, wrap.clientWidth);
      const scaleY = image.naturalHeight / Math.max(1, wrap.clientHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * scaleX));
      canvas.height = Math.max(1, Math.round(h * scaleY));
      canvas.getContext("2d")?.drawImage(image, x * scaleX, y * scaleY, w * scaleX, h * scaleY, 0, 0, canvas.width, canvas.height);
      addReferencesAsTasks([{ data: canvas.toDataURL("image/png"), name: `캡처 · ${source.name}`, sourceKind: "capture" }]);
      closeCrop();
      setStatus("선택한 캡처 영역이 참고 이미지로 추가되었습니다.", "ok");
    };
    closeButton.onclick = closeCrop;
    cancelButton.onclick = closeCrop;
    overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) closeCrop(); });
  };

  const openCaptureChooser = async () => {
    if (!desktop?.captureSources) {
      setStatus("캡처는 데스크톱 앱에서만 사용할 수 있습니다.", "warn");
      return;
    }
    setStatus("캡처할 화면을 불러오는 중…", "busy");
    panel.hidden = true;
    await new Promise((resolve) => setTimeout(resolve, 180));
    let sources;
    try {
      sources = await desktop.captureSources();
    } catch (error) {
      panel.hidden = false;
      setStatus(`화면 캡처 실패: ${error.message}`, "error");
      return;
    }
    panel.hidden = false;
    const overlay = document.createElement("div");
    overlay.className = "ai-compare-overlay";
    const dialog = document.createElement("section");
    dialog.className = "ai-compare-dialog ai-capture-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const head = document.createElement("div");
    head.className = "ai-compare-head";
    const title = document.createElement("strong");
    title.textContent = "캡처할 화면 또는 창 선택";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.title = "캡처 닫기";
    head.append(title, closeButton);
    const grid = document.createElement("div");
    grid.className = "ai-capture-grid";
    for (const source of sources || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ai-capture-source";
      const image = document.createElement("img");
      image.src = source.data;
      image.alt = "";
      const name = document.createElement("span");
      name.textContent = source.name;
      button.append(image, name);
      button.onclick = () => { overlay.remove(); openCaptureCrop(source); };
      grid.appendChild(button);
    }
    dialog.append(head, grid);
    overlay.appendChild(dialog);
    registerEscapeLayer(dialog, () => overlay.remove());
    closeButton.onclick = () => overlay.remove();
    overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) overlay.remove(); });
    document.documentElement.appendChild(overlay);
    setStatus("캡처할 화면 또는 창을 선택하세요.", "ok");
  };

  const commentPrompt = (images = allImages()) => buildCommentRequest(images);
  const legacyCommentPrompt = (images = allImages()) => {
    const lines = [];
    for (const item of images) {
      const comments = item.comments.filter((comment) => comment.text.trim());
      if (!comments.length) continue;
      lines.push(`[${item.kind === "reference" ? "참고 이미지" : "생성 결과"}: ${item.name}]`);
      for (const comment of comments) {
        lines.push(`- 영역 ${comment.number} (가로 ${comment.x}%, 세로 ${comment.y}%, 너비 ${comment.w}%, 높이 ${comment.h}%): ${comment.text.trim()}`);
      }
    }
    return lines.length ? `\n\n이미지 영역 코멘트:\n${lines.join("\n")}` : "";
  };

  const describeRemoteInputPlan = (plan) => {
    const lines = [];
    for (const [index, visual] of (plan?.visuals || []).entries()) {
      if (visual.kind === "overview") {
        const role = visual.role === "latest-result" ? "직전 생성 결과" : "주 참고 이미지";
        lines.push(`${index + 1}. ${role}: ${visual.source?.name || "이미지"}`);
      } else if (visual.kind === "crop") {
        lines.push(`${index + 1}. 영역 확대: ${visual.source?.name || "이미지"}의 영역 ${visual.commentNumber || ""} · ${visual.commentText || "요청 영역"}`);
      } else if (visual.kind === "contact-sheet") {
        const tiles = (visual.tiles || []).map((tile, tileIndex) => {
          const sourceName = tile.source?.name || "이미지";
          return `${tileIndex + 1}) ${sourceName}${tile.kind === "crop" ? ` 영역 ${tile.commentNumber || ""}` : ""}`;
        });
        lines.push(`${index + 1}. 보조 참고 묶음(왼쪽 위부터 행 순서): ${tiles.join(", ")}`);
      }
    }
    return lines.length
      ? `\n\n전달된 참고 이미지 순서와 역할:\n${lines.join("\n")}\n이 설명은 참고 입력의 대응 관계만 나타내며, 출력 그림에는 이 문구나 번호를 그리지 마세요.`
      : "";
  };

  const makeCacheDescriptor = ({ engine, prompt, revisionImage, runInput, references, referenceComposite = null, localAssetMatch = null }) => {
    const localAsset = localAssetMatch?.matched === true
      ? {
        version: LOCAL_ASSET_ROUTER_VERSION,
        motif: localAssetMatch.motifRequest?.motif || null,
        reason: localAssetMatch.reason || null,
      }
      : null;
    return buildExactOutputCacheDescriptor({
      styleVersion: localAsset
        ? `${LOCAL_ASSET_ROUTER_VERSION}+${MOTIF_CATALOG_VERSION}`
        : engine === IMAGE_ENGINE_IDS.FAST_SCENE
          ? FAST_SCENE_PROMPT_VERSION
          : isWhitePngWorkflow(runInput) ? WHITE_PNG_VERSION : `${RASTER_STYLE_VERSION}+${qualityModeCacheVersion(runInput.qualityMode)}`,
      mode: runInput.mode,
      prompt,
      references,
      referenceComposite,
      latestResult: revisionImage,
      model: runInput.model,
      effort: runInput.effort,
      serviceTier: runInput.serviceTier,
      outputOptions: {
        engine,
        outputEngine: normalizeOutputEngine(runInput.outputEngine),
        qualityMode: normalizeQualityMode(runInput.qualityMode),
        complexPass: Number(runInput.complexPass || 1),
        transparentBackground: !isWhitePngWorkflow(runInput),
        examPalette: engine === IMAGE_ENGINE_IDS.RASTER && !isWhitePngWorkflow(runInput),
        outputWorkflow: isWhitePngWorkflow(runInput) ? WHITE_PNG_VERSION : "legacy",
        markPolicy: isWhitePngWorkflow(runInput) ? normalizeMarkPolicy(runInput.markPolicy) : null,
        localAsset,
      },
      engineVersion: localAsset
        ? `${LOCAL_ASSET_ROUTER_VERSION}+${MOTIF_CATALOG_VERSION}+${FAST_SCENE_PANEL_COMPILE_VERSION}`
        : engine === IMAGE_ENGINE_IDS.FAST_SCENE
          ? `${FAST_SCENE_PROMPT_VERSION}+${FAST_SCENE_PANEL_COMPILE_VERSION}`
          : RASTER_ENGINE_VERSION,
    });
  };

  const stageCurrentOutput = (output) => {
    pendingCacheOutput = output ? { ...output } : null;
  };

  const commitCurrentOutput = async () => {
    const cache = outputCache;
    const cacheRequest = currentCacheRequest;
    const output = pendingCacheOutput
      ? {
        ...pendingCacheOutput,
        engine: cacheRequest?.engine,
        complete: true,
        complexPass: Number(currentRunInput?.complexPass || 1),
      }
      : null;
    pendingCacheOutput = null;
    if (isWhitePngWorkflow(currentRunInput || {}) && output?.reviewVerified !== true) return false;
    if (!cache || !cacheRequest?.key || !output || currentCancelRequested) return false;
    if (!cacheEntryCompletesRequest({ output }, {
      engine: cacheRequest.engine,
      qualityMode: currentRunInput?.qualityMode,
    })) return false;
    try {
      const result = await cache.put({
        key: cacheRequest.key,
        descriptor: cacheRequest.descriptor,
        output,
        status: "complete",
      });
      return result?.stored === true;
    } catch { return false; }
  };

  const beginWhiteImageReview = async (candidate, eventEpoch) => {
    const runInput = currentRunInput;
    const snapshot = currentRequestSnapshot;
    if (!candidate || !runInput || !snapshot || eventEpoch !== currentRequestEpoch) return;
    const reviewGroups=partitionReferenceItems(runInput.attachments || []);
    const originalItems = reviewGroups.inputs.map(taskItemCopy);
    const previousVersion=(runInput.generated||[]).find(item=>item.id===runInput.selectedCandidateId)||(runInput.generated||[]).at(-1);
    if(previousVersion)originalItems.push(taskItemCopy({...previousVersion,name:`수정 전 선택 버전 · ${previousVersion.name}`,kind:"reference"}));
    const structureContract = formatStructureContract(runInput.structureSpec);
    const structuralInventory = buildStructuralInventory({ request: snapshot.request, references: originalItems, structureContract });
    try {
      const originalAttachments = await Promise.all(originalItems.map(prepareTransportItem));
      const styleAttachments = await Promise.all(reviewGroups.styleReferences.map(prepareTransportItem));
      if (eventEpoch !== currentRequestEpoch || currentCancelRequested) return;
      await imageReview.start({
        candidate,
        request: snapshot.request,
        structuralInventory,
        markPolicyContract: buildMarkPolicyContract(runInput.markPolicy),
        referenceNames: originalItems.map((item) => item.name),
        originalAttachments,
        styleAttachments,
        generationCount: 1,
        startedAt: currentTurnStartedAt,
        modelAvailable: isReviewSolAvailable(),
        serviceTier: runInput.serviceTier,
        prepareCandidateAttachment: (item) => prepareTransportItem(item),
        makeCorrectionPayload: async ({ report, candidate: failedCandidate }) => ({
          text: buildWhitePngPrompt({
            request: buildImageCorrectionRequest({ request: snapshot.request, report }),
            revision: true,
            revisionName: failedCandidate.name,
            discussionContext: snapshot.discussionContext,
            structureContract,
            markPolicyContract: buildMarkPolicyContract(runInput.markPolicy),
          }),
          attachments: [...originalAttachments, await prepareTransportItem(failedCandidate)],
          conversationId: null,
          resetConversation: true,
          purpose: "image",
          ephemeralRender: true,
          model: runInput.model,
          effort: runInput.effort,
          serviceTier: runInput.serviceTier,
        }),
        acceptCorrectionImage: async (src, _generationCount, metadata = {}) => {
          const added = await addPreview(src, { isCurrent: () => eventEpoch === currentRequestEpoch, rendererPrompt: metadata.rendererPrompt });
          if (!added) throw new Error("교정 후보가 현재 작업에 추가되지 않았습니다.");
          return added;
        },
      });
    } catch (error) {
      if (eventEpoch !== currentRequestEpoch || currentCancelRequested) return;
      handleReviewLifecycle({
        state: "failed",
        candidateId: candidate.id,
        report: { verdict: "uncertain", checks: [], issues: [{ message: error.message || String(error), severity: "major" }] },
        generationCount: 1,
        reviewCount: 0,
        model: AI_IMAGE_REVIEW_MODEL,
        effort: AI_IMAGE_REVIEW_EFFORT,
        elapsedMs: 0,
      }, candidate);
    }
  };

  const refresh = async ({ autoConnect = true } = {}) => {
    if (!desktop) {
      setStatus("데스크톱 앱에서만 사용 가능", "warn");
      return;
    }
    try {
      const current = await desktop.status();
      loginButton.hidden = current.login.loggedIn;
      if (!current.login.loggedIn) {
        setStatus("Codex 로그인 필요", "warn");
      } else if (current.server) {
        setStatus("준비됨", "ok");
        await Promise.all([loadModels(), loadAccountOverview()]);
      } else if (autoConnect) {
        setStatus("AI 자동 연결 중…", "busy");
        const result = await desktop.start();
        setStatus(result.ok ? "준비됨" : `연결 실패: ${result.message}`, result.ok ? "ok" : "error");
        if (result.ok) await Promise.all([loadModels(), loadAccountOverview()]);
      }
    } catch (error) {
      setStatus(`상태 확인 실패: ${error.message}`, "error");
    }
  };
  const open = async ({ reference, references = [], prompt, startGeneration = false, placement = "separate", reveal = true } = {}) => {
    await workspaceReady;
    const selectedObject=state.get().selectedIds?.length === 1 ? state.get().objects.find(o=>state.get().selectedIds?.includes(o.id)&&o.type==="image"&&o.aiTaskId) : null;
    if (!busy && selectedObject && !reference && !references.length && taskTabs.has(selectedObject.aiTaskId)) {
      restoreTaskTab(selectedObject.aiTaskId);
      if (generatedImages.some((item) => item.id === selectedObject.aiCandidateId)) {
        panel.dispatchEvent(new CustomEvent('5e:ai-candidate-select', { detail: { candidateId: selectedObject.aiCandidateId } }));
      }
    }
    syncSelectedOutputActions();
    if (reveal) panel.hidden = false;
    const selectedForAutomaticSeparation = selectedOutputItem();
    if (candidateUsesAutomaticSeparation(selectedForAutomaticSeparation)
      && selectedForAutomaticSeparation.automaticSeparationState !== 'ready') {
      void startAutomaticSeparation(selectedForAutomaticSeparation);
    }
    desktop?.setAiTaskShortcutActive?.(true);
    // 참고 이미지는 AI 연결 상태 조회와 무관하므로 즉시 불러온다.
    // 연결 확인을 먼저 기다리면 로컬 라이브러리 이미지도 몇 초 뒤에 나타나
    // 사용자가 버튼이 동작하지 않은 것으로 오해할 수 있다.
    const refreshPromise = refresh();
    const incoming = [...references, ...(reference ? [reference] : [])];
    if (incoming.length) {
      setStatus("참고 이미지 불러오는 중…", "busy");
      const loaded = await Promise.allSettled(incoming.map(async (item) => ({
        item,
        data: await sourceToDataUrl(item.dataUrl || item.src),
      })));
      for (const result of loaded) {
        if (result.status === "fulfilled") {
          result.value.source = {
            data: result.value.data,
            name: result.value.item.name || "참고 이미지",
            prompt: result.value.item.prompt || "",
            sourceKind: result.value.item.sourceKind || (result.value.item.dataUrl ? "pdf-crop" : "auto"),
            source: result.value.item.source === undefined ? null : structuredClone(result.value.item.source),
            referenceRole: result.value.item.referenceRole,
          };
        } else {
          addLog(result.reason?.message || String(result.reason), "error");
        }
      }
      const readyReferences = loaded
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value.source);
      addReferencesAsTasks(readyReferences, { prompt, placement });
      const loadedCount = readyReferences.length;
      setStatus(loadedCount ? `이미지 ${loadedCount}개 · 작업 ${placement === "together" ? 1 : loadedCount}개 준비됨` : "이미지를 불러오지 못했습니다.", loadedCount ? "ok" : "error");
    }
    await refreshPromise;
    const restoredTab = taskTabs.get(activeTaskTabId);
    if (restoredTab?.workState === 'interrupted') {
      setStatus(restoredTab.retryRequest?.snapshot
        ? '이전 실행이 중단되었습니다. 자동 재전송하지 않았습니다. 다시 시도할 수 있습니다.'
        : '이전 실행이 중단되었습니다. 공급자 상태를 알 수 없어 자동 재전송하지 않았습니다.', 'warn');
    }
    if (!incoming.length && prompt) input.value = prompt;
    if (startGeneration === true && incoming.length >= 1) await submit("image");
    if (!panel.querySelector('[data-ai-chat-panel]')?.hidden) input.focus();
    else panel.querySelector('[data-ai-side-tab="comments"]')?.focus();
  };
  const close = () => {
    abortAutomaticSeparation('panel-closed');
    captureActiveTaskTab(); persistTasks(); void taskPersistence.flush(); panel.hidden = true;
    desktop?.setAiTaskShortcutActive?.(false);
    if (!document.querySelector('.modal-overlay:not([hidden])')) document.getElementById('canvas')?.focus();
  };

  registerEscapeLayer(modal || panel, close);

  const submit = async (type, options = {}) => {
    if (busy || !desktop) return refresh();
    if (type === "image" && isWhitePngWorkflow({ mode: selectedMode, outputEngine: selectedOutputEngine }) && !modelsLoaded) {
      await loadModels();
    }
    const activeInput = type === "chat" ? chatInput : input;
    const entered = typeof options.requestOverride === "string" ? options.requestOverride.trim() : activeInput?.value.trim() || "";
    let request = type === "image"
      ? kiceImageRequest(entered, { hasImage: attachments.length > 0 || generatedImages.length > 0 })
      : entered;
    if (!request) {
      if (type === "image") setStatus("먼저 레퍼런스 이미지나 손그림을 추가해 주세요.", "warn");
      return;
    }
    const discussionContext = type === "image"
      ? (typeof options.discussionContextOverride === "string"
        ? options.discussionContextOverride
        : (entered === compactConversation(conversationMessages) ? "" : compactConversation(conversationMessages)))
      : "";
    let runInput = enforceKiceImageRunInput(options.runInputSnapshot || {
      attachments: attachments.map(snapshotImageItem),
      generated: generatedImages.map(snapshotImageItem),
      mode: selectedMode,
      outputEngine: selectedOutputEngine,
      qualityMode: selectedQualityMode,
      complexPass: 1,
      selectedCandidateId,
      referenceComposition: structuredClone(referenceComposition),
      markPolicy: readMarkPolicy(),
      generationMode: selectedAssetGenerationMode,
      model: modelSelect.value || null,
      effort: effortSelect.value || null,
      serviceTier: speedSelect.value || null,
    });
    runInput.referenceComposition = normalizeReferenceComposition(runInput.referenceComposition, runInput.attachments);
    runInput.markPolicy = normalizeMarkPolicy(runInput.markPolicy);
    const whiteRun = type === "image" && isWhitePngWorkflow(runInput);
    if (whiteRun && !runInput.generated.length) {
      try { runInput = approvedFirstRun(runInput, availableModels); }
      catch (error) { setStatus(error.message, "error"); return; }
      request = entered ? `${APPROVED_FIRST_REQUEST}\n\n사용자 요청:\n${entered}` : APPROVED_FIRST_REQUEST;
    }
    let roleGroups;
    try { roleGroups=partitionReferenceItems(runInput.attachments); } catch(error) { setStatus('이미지 역할을 확인해 주세요. 원본 또는 표현 참고를 선택하세요.','error'); return; }
    if (roleGroups.styleReferences.length && (!whiteRun || !roleGroups.inputs.length || runInput.generated.length)) {
      setStatus('표현 참고는 원본이 있는 새 작업의 첫 PNG 변환과 자동 교정에서만 지원합니다. 추가 수정·대화는 새 작업을 사용하세요.','warn'); return;
    }
    let whiteGenerationNotice = "";
    runInput.structureSpec = null;
    runInput.structureRecord = null;
    if (whiteRun && !runInput.approvedFirstPng && (runInput.attachments.length || runInput.generated.length) && !isReviewSolAvailable()) {
      setStatus("원본 구조 분석용 Sol 높음 모델을 사용할 수 없습니다. 생성하지 않았습니다.", "error");
      return;
    }
    if (whiteRun && (!modelById(runInput.model) || !modelSupportsEffort(modelById(runInput.model), runInput.effort))) {
      setStatus("선택 모델과 추론 설정을 사용할 수 없습니다. 고급 설정에서 확인해 주세요.", "error");
      return;
    }
    const revisionImage = runInput.generated.find((item) => item.id === runInput.selectedCandidateId) || runInput.generated.at(-1) || null;
    roleGroups.inputs = orderedInputReferences(roleGroups.inputs, runInput.referenceComposition);
    const needsReferenceComposite = type === 'image' && roleGroups.inputs.length >= 2;
    const requestComments = commentPrompt([
      ...(!needsReferenceComposite ? roleGroups.inputs : []),
      ...(revisionImage ? [revisionImage] : []),
    ]);
    const annotatedHistory = []; // old-version comments never become new-version anchors
    const planningReferences = [...roleGroups.inputs, ...annotatedHistory];
    const requestEpoch = ++currentRequestEpoch;
    setBusy(true);
    imageReceived = false;
    currentTurnType = type;
    const requestedEngine = options.forceEngine
      || (normalizeOutputEngine(runInput.outputEngine) === AI_OUTPUT_ENGINES.ASSET
        ? IMAGE_ENGINE_IDS.FAST_SCENE
        : IMAGE_ENGINE_IDS.RASTER);
    currentEngine = type === "image"
      ? chooseImageEngine({
        request: `${request}${requestComments}`,
        mode: runInput.mode,
        references: planningReferences,
        force: requestedEngine,
      }).engine
      : IMAGE_ENGINE_IDS.RASTER;
    currentRunInput = runInput;
    currentSceneResponse = "";
    currentCacheRequest = null;
    pendingCacheOutput = null;
    currentCancelRequested = false;
    currentTerminalOutcome = null;
    currentImageOutputError = null;
    currentReviewCandidate = null;
    currentReviewScheduled = false;
    currentTurnUsage = null;
    currentTurnPerformance = null;
    currentTurnDone = false;
    currentTurnId = null;
    currentRenderThreadId = null;
    awaitingTurnId = true;
    queuedTurnEvents = [];
    currentImageEventKeys = new Set();
    serverTurnFinished = false;
    previewPending = false;
    tokenFooterNode = null;
    currentTurnStartedAt = Date.now();
    if (type === "chat" && chatInput) chatInput.value = "";
    if (whiteRun) {
      dispatchReviewEvent({
        state: "generating",
        candidateId: null,
        report: emptyReviewReport(),
        generationCount: Number(runInput.complexPass || 1),
        reviewCount: 0,
        model: runInput.model || "default",
        effort: runInput.effort || "default",
        elapsedMs: 0,
      });
    }
    if (!options.silentUserLog) {
      if (runInput.approvedFirstPng) {
        addLog("이미지 변환을 요청했습니다.");
      } else {
        addLog(request, "user");
        recordConversationMessage("user", request);
      }
    }
    if (type === "image") {
      const fast = currentEngine === IMAGE_ENGINE_IDS.FAST_SCENE;
      setStatus(fast ? "빠른 벡터 도식 준비 중…" : "이미지 생성 요청 중…", "busy");
      setGenerating(
        true,
        fast ? "편집 가능한 도식을 구성하고 있습니다" : "이미지 생성 준비 중",
        fast ? "도식을 구성하고 있습니다." : runInput.approvedFirstPng ? "첫 결과를 준비합니다." : (whiteGenerationNotice || "원본과 결과를 비교할 수 있도록 준비합니다."),
        "analyze",
      );
    } else {
      setStatus("답변 작성 중…", "busy");
      setGenerating(false);
    }
    const annotatedRequest = `${request}${requestComments}${revisionImage ? PRESERVE_UNREQUESTED : ""}`;
    const renderRequest = discussionContext
      ? `지금까지 확정된 대화 내용:\n${discussionContext}\n\n이번 생성 요청:\n${annotatedRequest}`
      : annotatedRequest;
    currentRequestSnapshot = { entered, request: annotatedRequest, discussionContext, annotatedRequest, renderRequest, runInput };
    providerRequestPersistable = true;
    persistTasks();
    try {
      const clientPrepareStartedAt = performance.now();
      let outgoingItems = [];
      let outgoingAttachments = [];
      let requestWithVisualPlan = renderRequest;
      let referenceRoleContract = '';
      let observationAttachments = null;
      let referenceComposite = null;
      if (needsReferenceComposite) {
        setStatus('원본 이미지를 연결하는 중…', 'busy');
        referenceComposite = await composeReferenceImages({
          sources: roleGroups.inputs,
          orientation: runInput.referenceComposition.orientation,
          layout: runInput.referenceComposition.layout,
          maxLongEdge: 1536,
        });
        panel.dispatchEvent(new CustomEvent('5e:ai-composite-ready', { detail: {
          dataUrl: referenceComposite.dataUrl,
          width: referenceComposite.width,
          height: referenceComposite.height,
          sourceRects: referenceComposite.sourceRects.map(rect => ({ ...rect })),
          orientation: referenceComposite.orientation,
          sourceOrder: [...referenceComposite.sourceOrder],
        } }));
        requestWithVisualPlan += commentPrompt([referenceComposite]);
      }
      const localAssetMatch = type === "image" && currentEngine === IMAGE_ENGINE_IDS.FAST_SCENE && !revisionImage
        ? matchLocalAssetRequest({
          request: renderRequest,
          mode: runInput.mode,
          references: planningReferences,
        })
        : { matched: false, reason: revisionImage ? "revision-present" : "not-image-request" };

      if (localAssetMatch.matched) {
        currentEngine = IMAGE_ENGINE_IDS.FAST_SCENE;
        setStatus("내부 검증 도식을 불러오는 중…", "busy");
        setGenerating(
          true,
          "검증된 내부 도식을 구성하고 있습니다",
          "원격 이미지 생성 없이 5E 벡터 오브젝트를 준비합니다.",
          "compose",
        );
      }

      if (type === "image") {
        const descriptor = makeCacheDescriptor({
          engine: currentEngine,
          prompt: renderRequest,
          revisionImage,
          runInput,
          references: [...planningReferences, ...roleGroups.styleReferences],
          referenceComposite,
          localAssetMatch,
        });
        const key = createExactOutputCacheKey(descriptor);
        const requestCache = { key, descriptor, engine: currentEngine };
        currentCacheRequest = options.cacheRequestOverride || requestCache;
        const bypassCache = isWhitePngWorkflow(runInput) || options.bypassCache === true || /새\s*변형|다시\s*생성|다르게\s*생성|재생성/.test(request);
        if (outputCache && !bypassCache) {
          let cached = null;
          try { cached = await outputCache.get(key); } catch {}
          if (cached?.hit && !cacheEntryCompletesRequest(cached.entry, {
            engine: currentEngine,
            qualityMode: runInput.qualityMode,
          })) {
            try { await outputCache.delete(key); } catch {}
            cached = null;
          }
          if (cached?.hit && cached.entry?.output) {
            let cachedItem = null;
            if (currentEngine === IMAGE_ENGINE_IDS.FAST_SCENE && cached.entry.output.sceneSource) {
              const cachedCompileSource = cached.entry.output.sceneCompileSource || cached.entry.output.sceneSource;
              const cachedScene = compilePanelScene(cachedCompileSource, {
                mode: runInput.mode,
                layerId: state.get().activeLayerId,
                idPrefix: `ai_cached_${requestEpoch}`,
              });
              const compiled = cachedScene.result;
              if (compiled.valid && compiled.supported && compiled.objects.length) {
                cachedItem = addScenePreview(
                  compiled,
                  cached.entry.output.sceneSource,
                  cachedCompileSource,
                );
                currentTurnPerformance = { sceneCompileMs: compiled.stats.compileMs };
              } else {
                try { await outputCache.delete(key); } catch {}
              }
            } else if (currentEngine === IMAGE_ENGINE_IDS.RASTER && cached.entry.output.data) {
              cachedItem = await addPreview(cached.entry.output.data, {
                isCurrent: () => requestEpoch === currentRequestEpoch,
                alreadyEditable: true,
              });
            }
            if (cachedItem && requestEpoch === currentRequestEpoch) {
              imageReceived = true;
              serverTurnFinished = true;
              currentTurnDone = true;
              awaitingTurnId = false;
              currentTurnPerformance = {
                ...currentTurnPerformance,
                engine: currentEngine,
                cacheHit: true,
                totalMs: Math.max(0, Math.round(performance.now() - clientPrepareStartedAt)),
                imageCallCount: 0,
                ...(localAssetMatch.matched ? {
                  route: "local-asset",
                  localAsset: true,
                  localAssetVersion: LOCAL_ASSET_ROUTER_VERSION,
                  localAssetReason: localAssetMatch.reason,
                } : {}),
              };
              persistPerformance(currentTurnPerformance);
              setGenerating(false);
              setTaskState("completed");
              setStatus("동일 요청 결과를 즉시 불러왔습니다.", "ok");
              addLog("이전에 완료된 동일 결과를 즉시 불러왔습니다. 캔버스로 출력할 수 있습니다.");
              setBusy(false);
              addTokenFooter(null);
              return;
            }
          }
        }

        if (localAssetMatch.matched) {
          const compiledScene = compilePanelScene(localAssetMatch.motifRequest, {
            mode: runInput.mode,
            layerId: state.get().activeLayerId,
            idPrefix: `ai_local_${requestEpoch}`,
          });
          const compiled = compiledScene.result;
          if (!compiled.valid || !compiled.supported || !compiled.objects.length) {
            throw new Error("검증된 내부 도식을 5E 오브젝트로 변환하지 못했습니다.");
          }
          const item = addScenePreview(compiled, compiledScene.source, compiledScene.compileSource);
          if (!item) throw new Error("검증된 내부 도식을 미리보기에 추가하지 못했습니다.");
          stageCurrentOutput({
            data: item.data,
            sceneSource: compiledScene.source,
            sceneCompileSource: compiledScene.compileSource,
          });
          await commitCurrentOutput();
          imageReceived = true;
          serverTurnFinished = true;
          currentTurnDone = true;
          awaitingTurnId = false;
          previewPending = false;
          currentTurnPerformance = {
            engine: IMAGE_ENGINE_IDS.FAST_SCENE,
            route: "local-asset",
            localAsset: true,
            localAssetVersion: LOCAL_ASSET_ROUTER_VERSION,
            localAssetReason: localAssetMatch.reason,
            sceneCompileMs: compiled.stats.compileMs,
            sceneObjectCount: compiled.stats.outputObjects,
            clientPrepareMs: Math.round(performance.now() - clientPrepareStartedAt),
            totalMs: Math.max(0, Math.round(performance.now() - clientPrepareStartedAt)),
            imageCallCount: 0,
            cacheHit: false,
          };
          persistPerformance(currentTurnPerformance);
          setGenerating(false);
          setStatus("내부 검증 도식 생성 완료", "ok");
          addLog(`이미지가 완성되었습니다. 원격 생성 없이 내부 검증 자산을 편집 가능한 벡터 오브젝트 ${compiled.objects.length}개로 구성했습니다.`);
          setTaskState("completed");
          setBusy(false);
          addTokenFooter(null);
          return;
        }

        if (whiteRun) {
          const structuralItems = referenceComposite ? [referenceComposite] : planningReferences;
          outgoingItems = [...structuralItems, ...(revisionImage ? [{...revisionImage, name:`수정 전 선택 버전 · ${revisionImage.name}`}] : [])];
          outgoingAttachments = await Promise.all(outgoingItems.map(runInput.approvedFirstPng ? prepareApprovedFirstAttachment : prepareTransportItem));
          if (roleGroups.styleReferences.length) {
            const styleAttachments=await Promise.all(roleGroups.styleReferences.map(prepareTransportItem));
            const referencePlan=planImageReferences({inputs:outgoingAttachments,styleReferences:styleAttachments});
            observationAttachments=referencePlan.analysisAttachments;
            outgoingAttachments=referencePlan.attachments;
            outgoingItems=[...outgoingItems,...roleGroups.styleReferences];
            referenceRoleContract=referencePlan.roleContract;
          }
          requestWithVisualPlan += `\n\n첨부 순서:\n${outgoingItems.map((item,i)=>`${i+1}. ${item.name}`).join("\n")}`;
        } else {
        const latestPixelResult = currentEngine === IMAGE_ENGINE_IDS.FAST_SCENE && revisionImage?.sceneSource
          ? null
          : revisionImage;
        const inputPlan = createRemoteImageInputPlan({
          references: [...planningReferences, ...roleGroups.styleReferences],
          referenceComposite,
          latestResult: latestPixelResult,
          prompt: annotatedRequest,
        });
        const composed = await composeRemoteImageInputPlan(inputPlan);
        outgoingItems = composed.outputs.map((output, index) => ({
          id: `planned-${requestEpoch}-${index + 1}`,
          name: output.name,
          data: output.dataUrl,
          kind: "reference",
          sourceKind: output.reusedSource ? (output.descriptor?.source?.sourceKind || "auto") : "capture",
          comments: [],
        }));
        outgoingAttachments = await Promise.all(outgoingItems.map(prepareTransportItem));
        requestWithVisualPlan += describeRemoteInputPlan(inputPlan);
        currentTurnPerformance = {
          engine: currentEngine,
          inputPlanningMs: Math.round(inputPlan.metrics.totalMs || 0),
          inputCompositionMs: Math.round(composed.metrics.totalMs || 0),
          plannedImageCount: inputPlan.metrics.plannedImageCount,
          representedSourceCount: inputPlan.metrics.representedSourceCount,
          droppedSourceCount: inputPlan.metrics.droppedSourceCount,
        };
        }
      } else {
        outgoingItems = selectOutgoingImageItems({
          type,
          references: runInput.attachments,
          generated: runInput.generated,
          latestGenerated: revisionImage,
          conversationId,
        });
        outgoingAttachments = await Promise.all(outgoingItems.map(prepareTransportItem));
      }

      currentTurnPerformance = {
        ...currentTurnPerformance,
        clientPrepareMs: Math.round(performance.now() - clientPrepareStartedAt),
        transportSourceBytes: outgoingItems.reduce((sum, item) => sum + Number(item.aiTransport?.sourceBytes || 0), 0),
        transportBytes: outgoingItems.reduce((sum, item) => sum + Number(item.aiTransport?.transportBytes || 0), 0),
        transportFallbackCount: outgoingItems.filter((item) => item.aiTransport?.usedFallback).length,
      };
      if (requestEpoch !== currentRequestEpoch || currentCancelRequested) throw new Error("작업 준비가 취소되었습니다.");
      if (whiteRun && !runInput.approvedFirstPng && !revisionImage && outgoingAttachments.length) {
        setStatus("원본 구조 분석 중…", "busy");
        setGenerating(true, "원본 구조 분석 중", "객체·단계·연결·작은 요소와 불확실성을 먼저 기록합니다.", "analyze");
        const analysisStartedAt = performance.now();
        const analysisAttachments = observationAttachments || outgoingAttachments;
        const bindings = await Promise.all(analysisAttachments.map(async item => {
          const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(item.data));
          return {name:item.name, transportSha256:Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("")};
        }));
        if (requestEpoch !== currentRequestEpoch || currentCancelRequested) throw new Error("작업 준비가 취소되었습니다.");
        const spec = await structureAnalysis.analyze({request:renderRequest, attachments:analysisAttachments, serviceTier:runInput.serviceTier});
        if (requestEpoch !== currentRequestEpoch || currentCancelRequested) throw new Error("작업 준비가 취소되었습니다.");
        runInput.structureSpec = JSON.parse(JSON.stringify(spec));
        runInput.structureRecord = {version:STRUCTURE_SPEC_VERSION, spec:runInput.structureSpec, sourceBindings:bindings, model:AI_IMAGE_REVIEW_MODEL, effort:"high", elapsedMs:Math.round(performance.now()-analysisStartedAt)};
        currentTurnPerformance = {...currentTurnPerformance, structureAnalysisMs:runInput.structureRecord.elapsedMs};
        addLog(`원본 구조 분석(JSON, 자동 관찰 가설):\n${JSON.stringify(runInput.structureRecord.spec)}`);
        panel.dispatchEvent(new CustomEvent("5e:ai-structure",{detail:JSON.parse(JSON.stringify(runInput.structureRecord))}));
        setStatus("구조 명세를 반영해 이미지 생성 중…", "busy");
        setGenerating(true, "구조 명세 기반 생성 중", "동일 명세를 독립 검수에도 전달합니다.", "generate");
      }
      if (requestEpoch !== currentRequestEpoch || currentCancelRequested) throw new Error("작업 준비가 취소되었습니다.");
      const purpose = type === "image"
        ? (currentEngine === IMAGE_ENGINE_IDS.FAST_SCENE ? "scene" : "image")
        : "chat";
      try {
        await taskPersistence.checkpoint();
      } catch (error) {
        const checkpointError = new Error(`작업 복구 정보를 저장하지 못해 AI 요청을 보내지 않았습니다: ${error.message}`);
        checkpointError.code = "AI_TASK_CHECKPOINT_FAILED";
        throw checkpointError;
      }
      if (requestEpoch !== currentRequestEpoch || currentCancelRequested) throw new Error("작업 준비가 취소되었습니다.");
      currentTurnPerformance = { ...currentTurnPerformance, aiRequestStartedAt: performance.now(), model: runInput.model, effort: runInput.effort, serviceTier: runInput.serviceTier };
      const firstPrompt = imagePromptForRun(runInput) || APPROVED_FIRST_PROMPT;
      const firstInstructions = [discussionContext, entered, requestComments].filter(Boolean).join('\n\n');
      const result = await desktop.send({
        text: runInput.approvedFirstPng ? `${firstPrompt}${firstInstructions ? `\n\n사용자 수정 요청:\n${firstInstructions}` : ''}` : (type === "image"
          ? (currentEngine === IMAGE_ENGINE_IDS.FAST_SCENE
            ? buildFastScenePrompt({
              request: requestWithVisualPlan,
              mode: runInput.mode,
              revisionScene: revisionImage?.sceneSource || "",
            })
            : (isWhitePngWorkflow(runInput) ? buildWhitePngPrompt : buildImagePrompt)({
              request: requestWithVisualPlan,
              mode: runInput.mode,
              revision: Boolean(revisionImage),
              revisionName: revisionImage?.name || "",
              discussionContext: "",
              qualityMode: runInput.qualityMode,
              structureContract: formatStructureContract(runInput.structureSpec),
              referenceRoleContract,
              markPolicyContract: buildMarkPolicyContract(runInput.markPolicy),
            }))
          : buildDiscussionPrompt({ request: annotatedRequest, mode: runInput.mode })),
        attachments: outgoingAttachments,
        conversationId: type === "chat" ? conversationId : null,
        resetConversation: type === "chat" && forceNewConversation,
        purpose,
        ephemeralRender: type === "image",
        model: runInput.model,
        effort: runInput.effort,
        serviceTier: runInput.serviceTier,
      });
      if (requestEpoch !== currentRequestEpoch) return;
      currentTurnId = result.turnId || null;
      currentRenderThreadId = result.renderThreadId || result.threadId || null;
      awaitingTurnId = false;
      if (type === "image" && currentTurnId) {
        startGenerationClock(currentTurnId);
        setGenerating(true, "이미지를 생성하고 있습니다", "런타임이 요청을 수락했습니다. 이미지 생성 이벤트를 기다리고 있습니다.");
      }
      currentTurnPerformance = { ...currentTurnPerformance, ...(result.performance || {}) };
      const pendingEvents = queuedTurnEvents;
      queuedTurnEvents = [];
      for (const queued of pendingEvents) {
        const sameTurn = !queued.event.turnId || queued.event.turnId === currentTurnId;
        const sameThread = !queued.event.threadId || !currentRenderThreadId || queued.event.threadId === currentRenderThreadId;
        if (sameTurn && sameThread) {
          dispatchAiEvent(queued.event, requestEpoch);
        }
      }
      if (type === "chat") {
        forceNewConversation = false;
        conversationId = result.threadId || result.conversationId || conversationId;
        if (conversationId) {
          localStorage.setItem(`5e.aiConversationId${clientScope ? ":" + clientScope : ""}`, conversationId);
          markImagesSent(outgoingItems, conversationId);
          const sentIds = new Set(outgoingItems.map((item) => item.id).filter(Boolean));
          markImagesSent([...attachments, ...generatedImages].filter((item) => sentIds.has(item.id)), conversationId);
        }
      }
    } catch (error) {
      if (requestEpoch !== currentRequestEpoch) return;
      awaitingTurnId = false;
      queuedTurnEvents = [];
      const cancelled = currentCancelRequested || error?.code === "AI_TURN_CANCELLED" || /작업 준비가 취소/.test(error?.message || "");
      pendingCacheOutput = null;
      addLog(error.message, cancelled ? "" : "error");
      setStatus(cancelled ? "작업 취소됨" : error?.code === "AI_TASK_CHECKPOINT_FAILED"
        ? "임시저장 실패 · AI 요청을 보내지 않았습니다"
        : type === 'image' ? "변환에 실패했습니다. 입력과 코멘트는 보존되었습니다." : "요청 실패", cancelled ? "warn" : "error");
      setGenerating(false);
      setBusy(false);
    }
  };

  loginButton.onclick = async () => {
    if (!desktop) return refresh();
    await desktop.login();
    setStatus("브라우저에서 로그인을 완료해 주세요…", "busy");
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const current = await desktop.status();
      if (!current.login.loggedIn) continue;
      loginButton.hidden = true;
      await refresh({ autoConnect: true });
      return;
    }
    setStatus("로그인 확인 시간이 초과되었습니다. 다시 시도해 주세요.", "warn");
  };
  modelSelect.addEventListener("change", () => {
    localStorage.setItem("5e.aiModel", modelSelect.value);
    sessionStorage.setItem("5e.preview:" + "5e.aiModelExplicit", modelSelect.value);
    syncModelWarning();
    populateEfforts();
    populateSpeeds();
  });
  effortSelect.addEventListener("change", () => localStorage.setItem("5e.aiEffort", effortSelect.value));
  speedSelect.addEventListener("change", () => localStorage.setItem("5e.aiSpeed", speedSelect.value));
  modeButtons.forEach((button) => button.addEventListener("click", () => {
    selectedMode = button.dataset.aiMode;
    localStorage.setItem("5e.aiMode", selectedMode);
    syncMode();
  }));
  qualityButtons.forEach((button) => button.addEventListener("click", () => {
    selectedQualityMode = normalizeQualityMode(button.dataset.aiQuality);
    localStorage.setItem("5e.aiQualityMode", selectedQualityMode);
    syncQualityMode();
  }));
  outputEngineButtons.forEach((button) => button.addEventListener("click", () => {
    selectedOutputEngine = normalizeOutputEngine(button.dataset.aiOutputEngine);
    localStorage.setItem("5e.aiOutputEngine", selectedOutputEngine);
    syncOutputEngine();
    setStatus(selectedOutputEngine === AI_OUTPUT_ENGINES.ASSET
      ? "5E 에셋 출력은 지원되는 장치만 벡터로 생성합니다."
      : "그림형은 PNG를 한 번 생성합니다. 이후 배경·선 굵기는 기기에서 처리합니다.", "ok");
  }));
  for (const select of [backgroundPolicySelect, examPaletteSelect, lineThicknessSelect].filter(Boolean)) {
    select.addEventListener('keydown', (event) => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const options = Array.from(select.options).filter((option) => !option.disabled);
      const current = Math.max(0, options.findIndex((option) => option.value === select.value));
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : Math.max(0, Math.min(options.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
      if (!options[next] || options[next].value === select.value) return;
      event.preventDefault();
      select.value = options[next].value;
      select.dispatchEvent(new Event('change', {bubbles:true}));
    });
  }
  backgroundPolicySelect?.addEventListener('change', () => {
    if (busy) { syncOutputProcessingUi(); return; }
    selectedImageOutputOptions = normalizeImageOutputOptions({
      ...selectedImageOutputOptions,
      backgroundPolicy: backgroundPolicySelect.value,
    });
    localStorage.setItem('5e.aiOutputBackgroundPolicy', selectedImageOutputOptions.backgroundPolicy);
    syncOutputProcessingUi();
    refreshOutputPreviews();
    restartSelectedAutomaticSeparation();
    captureActiveTaskTab(); persistTasks();
    setStatus('추가 AI 요청 없이 기기에서 배경을 처리합니다. 생성 원본은 유지됩니다.', 'ok');
  });
  examPaletteSelect?.addEventListener('change', () => {
    if (busy) { syncOutputProcessingUi(); return; }
    selectedImageOutputOptions = normalizeImageOutputOptions({
      ...selectedImageOutputOptions,
      examPalette: examPaletteSelect.value === 'true',
    });
    localStorage.setItem('5e.aiOutputExamPalette', String(selectedImageOutputOptions.examPalette));
    syncOutputProcessingUi();
    refreshOutputPreviews();
    restartSelectedAutomaticSeparation();
    captureActiveTaskTab(); persistTasks();
    setStatus('결과의 색상 처리 설정을 바꿨습니다. 생성 원본은 유지됩니다.', 'ok');
  });
  lineThicknessSelect?.addEventListener('change', () => {
    if (busy) { syncOutputProcessingUi(); return; }
    selectedImageOutputOptions = normalizeImageOutputOptions({
      ...selectedImageOutputOptions,
      lineThickness: Number(lineThicknessSelect.value),
    });
    localStorage.setItem('5e.aiOutputLineThickness', String(selectedImageOutputOptions.lineThickness));
    syncOutputProcessingUi();
    refreshOutputPreviews();
    restartSelectedAutomaticSeparation();
    captureActiveTaskTab(); persistTasks();
    setStatus('추가 AI 요청 없이 기기에서 선 굵기를 처리합니다. 생성 원본은 유지됩니다.', 'ok');
  });
  generationModeSelect.addEventListener('change', () => {
    if (busy) { generationModeSelect.value = selectedAssetGenerationMode; return; }
    selectedAssetGenerationMode = generationModeSelect.value === AI_ASSET_GENERATION_MODES.SEPARATED
      ? AI_ASSET_GENERATION_MODES.SEPARATED : AI_ASSET_GENERATION_MODES.SINGLE;
    syncConversionSummary();
    captureActiveTaskTab(); persistTasks();
    setStatus(selectedAssetGenerationMode === AI_ASSET_GENERATION_MODES.SEPARATED
      ? '다음 첫 변환을 최대 16개 물체 분리용 이미지로 생성합니다.' : '다음 변환을 한 장의 이미지로 생성합니다.', 'ok');
  });
  retryInterruptedButton.addEventListener('click', () => {
    const tab = taskTabs.get(activeTaskTabId);
    const retry = tab?.retryRequest;
    if (busy || !['interrupted', 'failed'].includes(tab?.workState) || !retry?.snapshot) return;
    retryInterruptedButton.disabled = true;
    const saved = retry.snapshot;
    void Promise.resolve(submit(retry.type || 'image', {
      requestOverride: saved.entered || saved.request || '',
      discussionContextOverride: saved.discussionContext || '',
      runInputSnapshot: saved.runInput,
      bypassCache: true,
    })).finally(() => {
      retryInterruptedButton.disabled = busy || !taskTabs.get(activeTaskTabId)?.retryRequest?.snapshot;
    });
  });
  sourceMenuTrigger?.addEventListener('click', () => {
    if (sourceMenu?.hidden) openSourceMenu();
    else closeSourceMenu({ restoreFocus: true });
  });
  sourceMenuTrigger?.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    openSourceMenu({ focus: event.key === 'ArrowUp' ? 'last' : 'first' });
  });
  sourceMenu?.addEventListener('keydown', (event) => {
    const enabled = sourceMenuActions.filter((button) => !button.disabled);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeSourceMenu({ restoreFocus: true });
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = Math.max(0, enabled.indexOf(event.target.closest('[role="menuitem"]')));
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
    enabled[next]?.focus();
  });
  sourceMenu?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-ai-source-action]')?.dataset.aiSourceAction;
    if (!action) return;
    closeSourceMenu();
    if (action === 'file' && !file.disabled) file.click();
    if (action === 'clipboard') void pasteClipboardImage();
  });
  document.addEventListener('mousedown', (event) => {
    if (!sourceMenu?.hidden && !event.target.closest('.ai-source-menu-shell')) closeSourceMenu();
  });
  compareButton.onclick = openComparison;
  referenceSearchButton.onclick = () => {
    void openPdfReferencePicker({ ...createUnifiedAiSourceConsumer({ addReferencesAsTasks, setStatus }), trigger: sourceMenuTrigger || referenceSearchButton })
      .catch(error => setStatus(error instanceof Error ? error.message : String(error), "error"));
  };
  captureButton.onclick = () => { void openCaptureChooser(); };
  newButton.onclick = async () => {
    if (busy) { setStatus('작업 취소가 완료된 뒤 초기화해 주세요.', 'warn'); return; }
    const taskId = activeTaskTabId;
    if (!await scopedDialog('현재 작업 초기화', '이 작업의 이미지와 대화를 비웁니다. 다른 작업과 원본 파일은 유지됩니다.', {accept: '초기화'})) return;
    if (busy || activeTaskTabId !== taskId) return;
    const tab = taskTabs.get(taskId);
    Object.assign(tab, {workState:"idle", attachments:[], generated:[], conversationMessages:[], uiMessages:[], input:'', conversationId:null, selectedCandidateId:null, generationTiming:null});
    restoreTaskTab(activeTaskTabId);
    persistTasks();
  };
  if (tabNewButton) tabNewButton.onclick = () => newWorkspace();
  if (batchButton && panel.querySelector("[data-ai-batch-files]")) durableBatchUi = mountDurableBatchUi({
    panel,
    scope: { sessionId: "5e", workspaceId: clientScope || "main" },
    generation: {
      start(queueRecord) {
        const options = queueRecord.options || {};
        const job = {
          id: queueRecord.id, root: true, taskTabId: activeTaskTabId,
          name: queueRecord.sourceSnapshot.name, source: { name: queueRecord.sourceSnapshot.name, data: queueRecord.sourceSnapshot.dataUrl, kind: "reference", comments: [] },
          request: options.request, mode: options.mode, whitePng: options.whitePng, markPolicy: options.markPolicy,
          qualityMode: options.qualityMode, model: options.model, effort: options.effort, serviceTier: options.serviceTier,
          state: "running", resultData: null, queueRecord,
        };
        batchActive = true;
        batchRuns.set(job.id, job);
        void startQueuedBatchJob(job);
      },
      interrupt(queueRecord) {
        const job = batchRuns.get(queueRecord.id);
        return job?.turnId ? desktop.interrupt({ turnId: job.turnId, clientScope }) : undefined;
      },
    },
  });
  if (durableBatchUi) void durableBatchUi.resume();
  if (batchButton) batchButton.onclick = runBatch;
  reviewModeCheckbox?.addEventListener("change", syncWhitePngUi);
  for (const control of markControls) control?.addEventListener("change", () => {captureActiveTaskTab();persistTasks();});
  panel.addEventListener("5e:ai-candidate-select", (event) => {
    // The workbench has already changed the visible card before this event.
    // Scoped edits must track that change and invalidate the in-flight proposal.
    if (busy && !currentRunInput?.scopedEdit) return;
    const item = generatedImages.find((entry) => entry.id === event.detail?.candidateId);
    if (item) {
      abortAutomaticSeparation('candidate-changed');
      scopedSelectionRevision += 1;
      selectedCandidateId = item.id;
      panel.dataset.aiSelectedCandidateId = item.id;
      dispatchReviewEvent({ ...item.reviewMeta, state: item.reviewState, candidateId: item.id, report: item.reviewReport }, item);
      if (busy && currentRunInput?.scopedEdit) scopedTransport?.fail(new Error('수정 중 선택 버전이 변경되어 이전 결과를 차단했습니다.'));
      else setStatus(isAcceptedReviewState(item.reviewState) ? selectedReviewStatusText(item.reviewState) : "선택 결과 · 확인 필요", isAcceptedReviewState(item.reviewState) ? "ok" : "warn");
      captureActiveTaskTab();
      if (candidateUsesAutomaticSeparation(item)) void startAutomaticSeparation(item);
    }
  });
  chatButton.onclick = () => submit("chat");
  chatApplyButton?.addEventListener('click', () => {
    if (busy) return;
    if (input.hidden) {
      setStatus('먼저 첫 변환을 완료해 주세요. 대화 내용은 다음 수정 요청으로 가져올 수 있습니다.', 'warn');
      return;
    }
    const request = compactConversation(conversationMessages);
    if (!request) {
      setStatus('가져올 대화 내용이 없습니다. 먼저 Codex와 요청을 정리해 주세요.', 'warn');
      return;
    }
    input.value = request;
    captureActiveTaskTab();
    persistTasks();
    panel.querySelector('[data-ai-side-tab="comments"]')?.click();
    setStatus('대화 내용을 수정 요청으로 가져왔습니다. 확인한 뒤 변환하기를 눌러 실행하세요.', 'ok');
    requestAnimationFrame(() => sendButton.focus());
  });
  sendButton.title = "대화와 코멘트를 반영해 새 이미지로 변환합니다.";
  sendButton.onclick = (event) => submit("image", { bypassCache: true });
  chatInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      chatButton.click();
    }
  });
  panel.addEventListener("click", (event) => {
    if (event.target.closest("[data-ai-add-file]") && !file.disabled) file.click();
  });
  const interruptCurrentTask = async () => {
    if (!busy) return;
    currentCancelRequested = true;
    abortAutomaticSeparation('generation-cancelled');
    scopedTransport?.fail(new Error("선택 영역 수정이 취소되었습니다."));
    pendingCacheOutput = null;
    const reviewWasActive = imageReview?.isActive() === true;
    structureAnalysis.cancel();
    if (reviewWasActive) imageReview.cancel();
    else setStatus("작업 취소 중…", "busy");
    return await desktop?.interrupt();
  };
  panel.querySelector("[data-ai-interrupt]").onclick = interruptCurrentTask;
  async function clearTasks(confirm) {
    await workspaceReady;
    captureActiveTaskTab();
    const result = await clearTaskWorkspaces({
      tasks: [...taskTabs.values()],
      confirm,
      cancel: async tab => {
        const result = await acknowledgeActiveTaskClearCancellation({ tab, activeTaskTabId, interrupt: interruptCurrentTask });
        if (result.acknowledged) {
          currentRequestEpoch += 1;
          setBusy(false);
        }
        return result;
      },
      remove: async tab => { taskTabs.delete(tab.id); },
    });
    if (!result.confirmed) return result;
    if (!taskTabs.size) {
      restoreTaskTab(null);
      persistTasks();
      workspaceEmpty();
    } else if (!taskTabs.has(activeTaskTabId)) {
      restoreTaskTab(taskTabs.keys().next().value);
      persistTasks();
    } else {
      renderTaskTabs();
      persistTasks();
    }
    await taskPersistence.flush();
    return result;
  }
  tabClearButton?.addEventListener('click', async () => {
    const confirm = count => scopedDialog('작업 모두 지우기', `${count}개 작업을 모두 지울까요? 원본 파일은 삭제하지 않습니다.`, { accept: `${count}개 지우기`, defaultAccept: true });
    const result = await (clearCollection ? clearCollection(confirm) : clearTasks(confirm));
    if (!result?.confirmed) return;
    setStatus(result.retainedIds.length
      ? `${result.removedIds.length}개 정리 · ${result.retainedIds.length}개 취소 확인 필요`
      : `${result.removedIds.length}개 작업을 정리했습니다.`, result.retainedIds.length ? 'warn' : 'ok');
  });
  file.onchange = async () => {
    const selectedFiles = Array.from(file.files || []).filter((selected) => selected.type.startsWith("image/"));
    const dataUrls = await Promise.all(selectedFiles.map(blobToDataUrl));
    addReferencesAsTasks(selectedFiles.map((selected, index) => ({ name: selected.name, data: dataUrls[index] })));
    file.value = "";
    if (selectedFiles.length) setStatus(`이미지 ${selectedFiles.length}개 · 작업 ${selectedFiles.length}개 준비됨`, "ok");
  };
  replaceSourceButton?.addEventListener('click', () => {
    if (!busy && attachments.length) replaceSourceFile?.click();
  });
  if (replaceSourceFile) replaceSourceFile.onchange = async () => {
    const selected = Array.from(replaceSourceFile.files || []).find((entry) => entry.type.startsWith('image/'));
    replaceSourceFile.value = '';
    if (!selected || busy) return;
    const sourceSelect = panel.querySelector('[data-ai-source-select]');
    const target = attachments.find((item) => item.id === sourceSelect?.value) || attachments[0];
    if (!target) return;
    const targetTaskId = activeTaskTabId;
    const targetData = target.data;
    const data = await blobToDataUrl(selected);
    if (busy || activeTaskTabId !== targetTaskId || !attachments.includes(target) || target.data !== targetData) {
      setStatus('파일을 읽는 동안 작업이나 원본이 변경되어 교체하지 않았습니다.', 'warn');
      return;
    }
    currentRequestEpoch += 1;
    target.name = selected.name || '교체한 원본';
    target.data = data;
    target.sourceKind = 'file';
    target.source = null;
    target.comments = [];
    target.nextCommentNumber = 1;
    delete target.aiTransport;
    const previousCard = target.card;
    const replacement = makeImageCard(target);
    previousCard?.replaceWith(replacement);
    commentController?.reset();
    syncReferenceSummary();
    captureActiveTaskTab();
    persistTasks();
    setStatus('선택한 원본을 교체했습니다. 기존 결과는 유지되며 새 변환을 실행할 수 있습니다.', 'ok');
  };

  const finishCurrentTurnUi = (eventEpoch = currentRequestEpoch) => {
    if (eventEpoch !== currentRequestEpoch || !serverTurnFinished) return;
    advanceGenerationClock("turn-terminal", currentTerminalOutcome);
    if (previewPending) return;
    if (currentImageOutputError) {
      setTaskState("failed");
      currentTerminalOutcome = "failed";
      pendingCacheOutput = null;
      setGenerating(false);
      setBusy(false);
      currentTurnDone = true;
      setStatus(`생성 PNG 처리 실패: ${currentImageOutputError}`, "error");
      addTokenFooter(currentTurnUsage);
      return;
    }
    if (currentTerminalOutcome !== "completed") {
      setTaskState(currentTerminalOutcome === "failed" ? "failed" : "idle");
      pendingCacheOutput = null;
      const cancelledReview = candidateReviewOnTerminal(currentReviewCandidate, currentTerminalOutcome);
      if (cancelledReview) dispatchReviewEvent(cancelledReview, currentReviewCandidate);
      setGenerating(false);
      setBusy(false);
      currentTurnDone = true;
      const terminalView = aiTerminalStatusView(currentTerminalOutcome, { imageReceived });
      if (terminalView) setStatus(terminalView.text, terminalView.kind);
      addTokenFooter(currentTurnUsage);
      void loadAccountOverview();
      return;
    }
    if (currentRunInput?.approvedFirstPng && currentReviewCandidate) {
      dispatchReviewEvent({ state: "first-generated", candidateId: currentReviewCandidate.id, report: { verdict: "", checks: [], issues: [] }, generationCount: 1, reviewCount: 0, model: currentRunInput.model, effort: currentRunInput.effort, elapsedMs: Date.now() - currentTurnStartedAt }, currentReviewCandidate);
      setGenerating(false); setBusy(false); currentTurnDone = true;
      setTaskState("completed");
      setStatus("PNG 생성 완료 · 원본과 비교해 품질을 확인해 주세요.", "ok");
      persistPerformance(currentTurnPerformance);
      panel.dispatchEvent(new CustomEvent("5e:ai-first-png-timing", { detail: { ...currentTurnPerformance } }));
      addTokenFooter(currentTurnUsage);
      return;
    }
    const needsWhiteReview = isWhitePngWorkflow(currentRunInput || {})
      && currentTurnType === "image"
      && currentEngine === IMAGE_ENGINE_IDS.RASTER
      && imageReceived
      && currentReviewCandidate;
    if (needsWhiteReview) {
      if (currentReviewScheduled) return;
      currentReviewScheduled = true;
      pendingCacheOutput = null;
      if (!reviewEnabled()) {
        handleReviewLifecycle({
          state: "needs-attention",
          candidateId: currentReviewCandidate.id,
          report: { verdict: "uncertain", checks: [], issues: [{ message: "독립 시각 검수가 꺼져 있어 검증 완료로 표시하지 않았습니다.", severity: "major" }] },
          generationCount: 1,
          reviewCount: 0,
          model: AI_IMAGE_REVIEW_MODEL,
          effort: AI_IMAGE_REVIEW_EFFORT,
          elapsedMs: Math.max(0, Date.now() - currentTurnStartedAt),
        }, currentReviewCandidate);
        return;
      }
      currentTurnDone = false;
      void beginWhiteImageReview(currentReviewCandidate, eventEpoch);
      return;
    }
    const needsComplexCorrection = !isWhitePngWorkflow(currentRunInput || {}) && currentTurnType === "image"
      && currentEngine === IMAGE_ENGINE_IDS.RASTER
      && imageReceived
      && normalizeQualityMode(currentRunInput?.qualityMode) === AI_QUALITY_MODES.COMPLEX
      && Number(currentRunInput?.complexPass || 1) === 1
      && !currentRunInput?.complexCorrectionScheduled;
    if (needsComplexCorrection) {
      currentRunInput.complexCorrectionScheduled = true;
      const correctionCacheRequest = currentCacheRequest;
      pendingCacheOutput = null;
      const correctionInput = {
        ...currentRunInput,
        generated: generatedImages.map(snapshotImageItem),
        complexPass: 2,
        complexCorrectionScheduled: true,
      };
      const correctionRequest = currentRequestSnapshot?.request || "원본과 직전 결과를 대조하여 구조가 달라진 부분만 교정해 줘.";
      setBusy(false);
      setStatus("복잡 그림 구조 검수 중…", "busy");
      setGenerating(true, "원본과 결과를 대조하고 있습니다", "형태·부품 수·연결이 달라진 부분만 한 번 더 교정합니다.", "analyze");
      addLog("복잡 모드 1차 결과를 원본과 대조한 뒤 구조 교정 1회를 진행합니다.");
      setTimeout(() => {
        if (eventEpoch !== currentRequestEpoch) return;
        void submit("image", {
          requestOverride: `${correctionRequest}\n원본과 직전 생성 결과를 객체별로 비교하고, 원본과 달라진 형태·개수·분기·연결만 교정해 줘. 맞는 영역은 그대로 보존해 줘.`,
          discussionContextOverride: currentRequestSnapshot?.discussionContext || "",
          runInputSnapshot: correctionInput,
          forceEngine: IMAGE_ENGINE_IDS.RASTER,
          bypassCache: true,
          cacheRequestOverride: correctionCacheRequest,
          silentUserLog: true,
        });
      }, 0);
      return;
    }
    setTaskState(imageReceived || currentTurnType === "chat" ? "completed" : "failed");
    const completedComplexCorrection = currentTurnType === "image"
      && currentEngine === IMAGE_ENGINE_IDS.RASTER
      && normalizeQualityMode(currentRunInput?.qualityMode) === AI_QUALITY_MODES.COMPLEX
      && Number(currentRunInput?.complexPass || 1) === 2;
    if (completedComplexCorrection) {
      setStatus("복잡 변환 완료 · 원본 구조 확인 필요", "warn");
      addLog("복잡 모드는 구조 교정을 마쳤지만 자동 확정하지 않습니다. 원본과 객체 수·분기·연결을 비교한 뒤 사용하세요.");
    }
    setBusy(false);
    currentTurnDone = true;
    void commitCurrentOutput();
    addTokenFooter(currentTurnUsage);
    void loadAccountOverview();
  };

  const dispatchAiEvent = (event, eventEpoch = currentRequestEpoch) => {
    if (eventEpoch !== currentRequestEpoch) return;
    if (currentCancelRequested && (event.kind === "progress" || event.kind === "image")) return;
    if (event.kind === "progress") {
      if (currentTurnType !== "image" || currentTurnDone) return;
      advanceGenerationClock("image-started", undefined, event.turnId || currentTurnId);
      setGenerating(true, event.title, event.detail);
      setStatus("이미지 생성 중…", "busy");
    } else if (event.kind === "image" && event.src) {
      if (currentTurnType !== "image" || currentTurnDone) return;
      const imageEventKey = `${event.turnId || currentTurnId || "pending"}:${event.src}`;
      if (currentImageEventKeys.has(imageEventKey)) return;
      currentImageEventKeys.add(imageEventKey);
      if (currentRunInput?.approvedFirstPng && imageReceived) return;
      const previewStartedAt = performance.now();
      if (currentRunInput?.approvedFirstPng) currentTurnPerformance = { ...currentTurnPerformance, aiResponseMs: previewStartedAt - currentTurnPerformance.aiRequestStartedAt, outputCompositionMs: 0 };
      const imageTurnId = event.turnId || currentTurnId;
      imageReceived = true;
      previewPending = true;
      advanceGenerationClock("image-received", undefined, imageTurnId);
      advanceGenerationClock("postprocess-started", undefined, imageTurnId);
      const isCurrent = () => !currentCancelRequested && eventEpoch === currentRequestEpoch
        && (!imageTurnId || imageTurnId === currentTurnId);
      setGenerating(true, "생성 결과를 준비하고 있습니다", isWhitePngWorkflow(currentRunInput || {}) ? "생성 원본 PNG를 확인하고 화면에 등록합니다." : "배경을 정리하고 편집용 이미지를 준비합니다.");
      void addPreview(event.src, { isCurrent, rendererPrompt: event.rendererPrompt }).then(async (added) => {
        if (!added || !isCurrent()) return;
        advanceGenerationClock("postprocess-completed", undefined, imageTurnId);
        if (currentRunInput?.approvedFirstPng) currentTurnPerformance = { ...currentTurnPerformance, pngInspectionAndDisplayMs: performance.now() - previewStartedAt };
        const terminalAllowsSuccess = currentTerminalOutcome === null || currentTerminalOutcome === "completed";
        if (isWhitePngWorkflow(currentRunInput || {})) {
          currentReviewCandidate = added;
          dispatchReviewEvent({
            state: "generating",
            candidateId: added.id,
            report: emptyReviewReport(),
            generationCount: 1,
            reviewCount: 0,
            model: currentRunInput?.model || "default",
            effort: currentRunInput?.effort || "default",
            elapsedMs: Math.max(0, Date.now() - currentTurnStartedAt),
          }, added);
        } else if (currentEngine === IMAGE_ENGINE_IDS.RASTER && added.postprocessOk && terminalAllowsSuccess && !currentCancelRequested) {
          stageCurrentOutput({ data: added.data });
        }
        if (!terminalAllowsSuccess || currentCancelRequested) return;
        window.dispatchEvent(new CustomEvent("5e:ai-output-success", { detail: { candidateId: added.id } }));
        if (isWhitePngWorkflow(currentRunInput || {})) {
          setStatus(currentRunInput?.approvedFirstPng ? "PNG 준비 완료 · 서버 종료 확인 중" : "1차 후보 준비 완료 · 독립 검수 대기", "busy");
          addLog(currentRunInput?.approvedFirstPng ? "첫 PNG 원본을 보존했습니다. 자동 검수·교정 없이 직접 확인할 수 있습니다." : "흰 배경 PNG 후보가 준비되었습니다. 원본 참고와의 독립 구조 검수를 이어서 진행합니다.");
        } else {
          setStatus(serverTurnFinished ? "생성 완료" : "서버 작업 종료 확인 중", serverTurnFinished ? "ok" : "busy");
          addLog("이미지가 완성되었습니다. 생성 결과에서 확인하거나 캔버스로 출력할 수 있습니다.");
        }
      }).catch((error) => {
        if (!isCurrent()) return;
        advanceGenerationClock("postprocess-failed", undefined, imageTurnId);
        addLog(error.message || String(error), "error");
        imageReceived = false;
        currentImageOutputError = error.message || String(error);
        pendingCacheOutput = null;
        setStatus("생성 결과 처리 실패", "error");
      }).finally(() => {
        if (!isCurrent()) return;
        previewPending = false;
        if (serverTurnFinished) setGenerating(false);
        else setGenerating(true, "이미지 준비 완료", "서버 작업 종료를 확인하고 있습니다.");
        finishCurrentTurnUi(eventEpoch);
      });
    } else if (event.kind === "assistant") {
      if (currentTurnType === "image" && currentEngine === IMAGE_ENGINE_IDS.FAST_SCENE) {
        currentSceneResponse = String(event.text || "").trim();
      } else {
        addLog(event.text);
        if (currentTurnType === "chat") recordConversationMessage("assistant", event.text);
      }
    } else if (event.kind === "tokens") {
      currentTurnUsage = event.usage;
      if (currentTurnDone) addTokenFooter(currentTurnUsage);
    } else if (event.kind === "performance") {
      currentTurnPerformance = { ...currentTurnPerformance, ...event.metrics };
      persistPerformance(currentTurnPerformance);
      if (currentTurnDone) addTokenFooter(currentTurnUsage);
    } else if (event.kind === "limits") {
      renderLimits(event.limits);
    } else if (event.kind === "finalization") {
      if (event.state === "interrupting" || event.state === "interruptAccepted") {
        setStatus("서버 작업 종료 확인 중", "busy");
      } else if (event.state === "interruptFailed") {
        setStatus("종료 상태를 다시 확인하고 있습니다", "busy");
      } else if (event.state === "recovering") {
        setStatus("AI 작업 종료를 복구하고 있습니다", "busy");
      } else if (event.state === "recoveryFailed") {
        setGenerating(false);
        setStatus("AI 작업 종료 확인 실패", "error");
        if (event.message) addLog(`작업 종료 복구 실패: ${event.message}`, "error");
        if (event.status === "failed") {
          currentTerminalOutcome = "failed";
          serverTurnFinished = true;
          previewPending = false;
          currentTurnDone = true;
          finishCurrentTurnUi(eventEpoch);
        }
      } else if (event.state === "confirmed" || event.state === "recovered") {
        currentTerminalOutcome = resolveAiTerminalOutcome({
          status: event.status,
          imageReceived,
          cancelRequested: currentCancelRequested,
        });
        serverTurnFinished = true;
        currentTurnDone = true;
        const terminalView = aiTerminalStatusView(currentTerminalOutcome, { imageReceived });
        if (terminalView) setStatus(terminalView.text, terminalView.kind);
        if (!previewPending) setGenerating(false);
        finishCurrentTurnUi(eventEpoch);
      }
    } else if (event.kind === "error") {
      currentTerminalOutcome = "failed";
      advanceGenerationClock("turn-terminal", "failed", event.turnId || currentTurnId);
      pendingCacheOutput = null;
      addLog(event.text, "error");
      setGenerating(false);
      setStatus("작업 실패", "error");
    } else if (event.kind === "done") {
      serverTurnFinished = true;
      currentTurnDone = true;
      currentTerminalOutcome = resolveAiTerminalOutcome({
        status: event.status,
        imageReceived,
        cancelRequested: currentCancelRequested,
      });
      if (currentTurnType === "image" && currentEngine === IMAGE_ENGINE_IDS.FAST_SCENE && event.status === "completed") {
        const compiledScene = compilePanelScene(currentSceneResponse, {
          mode: currentRunInput?.mode || selectedMode,
          layerId: state.get().activeLayerId,
          idPrefix: `ai_scene_${eventEpoch}`,
        });
        const compiled = compiledScene.result;
        currentTurnPerformance = {
          ...currentTurnPerformance,
          engine: IMAGE_ENGINE_IDS.FAST_SCENE,
          sceneCompileMs: compiled.stats.compileMs,
          sceneObjectCount: compiled.stats.outputObjects,
          sceneFallback: !compiled.valid || !compiled.supported || !compiled.objects.length,
        };
        persistPerformance(currentTurnPerformance);
        if (compiled.valid && compiled.supported && compiled.objects.length) {
          imageReceived = true;
          previewPending = true;
          advanceGenerationClock("image-received", undefined, currentTurnId);
          advanceGenerationClock("postprocess-started", undefined, currentTurnId);
          setGenerating(true, "편집 가능한 도식을 준비하고 있습니다", "5E 오브젝트와 미리보기를 구성합니다.");
          Promise.resolve().then(async () => {
            const item = addScenePreview(compiled, compiledScene.source, compiledScene.compileSource);
            if (!item) throw new Error("빠른 벡터 결과를 미리보기에 추가하지 못했습니다.");
            stageCurrentOutput({
              data: item.data,
              sceneSource: compiledScene.source,
              sceneCompileSource: compiledScene.compileSource,
            });
            addLog(`이미지가 완성되었습니다. 편집 가능한 벡터 오브젝트 ${compiled.objects.length}개로 캔버스에 출력할 수 있습니다.`);
            setStatus("빠른 벡터 도식 생성 완료", "ok");
            advanceGenerationClock("postprocess-completed", undefined, currentTurnId);
          }).catch((error) => {
            advanceGenerationClock("postprocess-failed", undefined, currentTurnId);
            addLog(error.message || String(error), "error");
            setStatus("벡터 결과 처리 실패", "error");
          }).finally(() => {
            if (eventEpoch !== currentRequestEpoch) return;
            previewPending = false;
            setGenerating(false);
            finishCurrentTurnUi(eventEpoch);
          });
          return;
        }

        if (normalizeOutputEngine(currentRunInput?.outputEngine) === AI_OUTPUT_ENGINES.ASSET) {
          advanceGenerationClock("turn-terminal", currentTerminalOutcome);
          setGenerating(false);
          setBusy(false);
          setStatus("5E 에셋으로 표현할 수 없는 요청입니다.", "warn");
          addLog("선택한 요청은 현재 지원되는 5E 에셋 범위를 벗어났습니다. 출력 방식을 ‘교과서 선화’로 바꾸면 래스터 이미지로 생성할 수 있습니다.", "error");
          return;
        }

        const snapshot = currentRequestSnapshot;
        advanceGenerationClock("turn-terminal", currentTerminalOutcome);
        addLog("이 요청은 빠른 벡터 도식 범위를 벗어나 고정밀 이미지 경로로 자동 전환합니다.");
        setStatus("고정밀 이미지 경로로 전환 중…", "busy");
        setGenerating(true, "고정밀 이미지 경로로 전환합니다", "장면에서 표현하지 못한 삽화를 생성합니다.", "analyze");
        setBusy(false);
        setTimeout(() => {
          if (eventEpoch !== currentRequestEpoch || !snapshot) return;
          void submit("image", {
            requestOverride: snapshot.request,
            discussionContextOverride: snapshot.discussionContext,
            runInputSnapshot: snapshot.runInput,
            forceEngine: IMAGE_ENGINE_IDS.RASTER,
            silentUserLog: true,
          });
        }, 0);
        return;
      }
      if (!imageReceived) setGenerating(false);
      if (event.status === "failed") {
        pendingCacheOutput = null;
        if (event.error) addLog(String(event.error), "error");
        setStatus("작업 실패", "error");
      } else if (event.status === "interrupted") {
        if (currentCancelRequested) pendingCacheOutput = null;
        if (!previewPending) setGenerating(false);
        setStatus(currentCancelRequested
          ? "작업 취소됨"
          : imageReceived && currentTurnType === "image"
            ? (previewPending ? "생성 결과 정리 중" : "생성 완료")
            : "작업 취소됨", currentCancelRequested || !imageReceived ? "warn" : "ok");
      } else if (imageReceived && currentTurnType === "image") {
        if (!previewPending) setGenerating(false);
        setStatus(previewPending ? "생성 결과 정리 중" : "생성 완료", previewPending ? "busy" : "ok");
      } else if (!imageReceived) {
        setStatus(currentTurnType === "chat" ? "답변 완료" : "이미지 생성 실패 · 결과 없음", currentTurnType === "chat" ? "ok" : "error");
      }
      finishCurrentTurnUi(eventEpoch);
    }
  };

  desktop?.onEvent((message) => {
    if (message?.method === '5e/generation-queued') {
      setStatus(`AI 실행 대기 중 · 서버 전체 ${message.params?.position || 1}번째`, 'busy');
      return;
    }
    const event = parseAiEvent(message);
    const turnScoped = ["progress", "image", "assistant", "tokens", "performance", "error", "done", "finalization"].includes(event.kind);
    if (turnScoped && !event.turnId && !event.threadId) return;
    // Isolated scoped turns never enter review, correction, cache, or legacy preview paths.
    if (currentRunInput?.scopedEdit) { scopedTransport?.handle(event); return; }
    if (structureAnalysis.handleEvent(event)) return;
    if (imageReview?.handleEvent(event)) return;
    const latePrimaryDuringReview = currentReviewScheduled
      && isWhitePngWorkflow(currentRunInput || {})
      && turnScoped
      && ((event.turnId && event.turnId === currentTurnId)
        || (event.threadId && currentRenderThreadId && event.threadId === currentRenderThreadId));
    if (latePrimaryDuringReview) return;
    if (batchActive && turnScoped && (event.turnId || event.threadId)) {
      const batchJob = (event.turnId && batchRuns.get(event.turnId))
        || Array.from(batchRuns.values()).find((job) => event.threadId && job.threadId === event.threadId);
      if (batchJob) {
        void dispatchBatchEvent(batchJob, event);
        return;
      }
      const belongsToCurrent = (event.turnId && event.turnId === currentTurnId)
        || (event.threadId && currentRenderThreadId && event.threadId === currentRenderThreadId);
      if (!belongsToCurrent) {
        unclaimedBatchEvents.push(event);
        if (unclaimedBatchEvents.length > 100) unclaimedBatchEvents.shift();
        return;
      }
    }
    if (turnScoped) {
      if (awaitingTurnId && !currentTurnId) {
        queuedTurnEvents.push({ event });
        return;
      }
      if (event.turnId && (!currentTurnId || event.turnId !== currentTurnId)) return;
      if (event.threadId && currentRenderThreadId && event.threadId !== currentRenderThreadId) return;
    }
    dispatchAiEvent(event, currentRequestEpoch);
  });
  desktop?.onState((current) => {
    // A scoped completed-image recovery emits stopped before recovered. Keep
    // the review owner alive until that terminal signal, never for a user stop.
    if (current.state !== "running" && scopedTransport) scopedTransport.fail(new Error("AI 연결이 종료되었습니다."));
    if (current.state === "stopped" && imageReview?.isRecoveringImageTurn()) return;
    if (current.state === "running" && !busy) setStatus("준비됨", "ok");
    else if (current.state !== "running" && busy) {
      structureAnalysis.fail("AI 연결 종료로 구조 분석이 중단되었습니다.");
      if (imageReview?.isActive()) imageReview.cancel();
      pendingCacheOutput = null;
      currentTerminalOutcome = "failed";
      advanceGenerationClock("turn-terminal", "failed");
      serverTurnFinished = true;
      previewPending = false;
      currentTurnDone = true;
      awaitingTurnId = false;
      queuedTurnEvents = [];
      currentRenderThreadId = null;
      setGenerating(false);
      setBusy(false);
      setStatus("AI 연결이 종료되었습니다. 다음 요청에서 자동으로 다시 연결합니다.", "error");
      addLog(current.message || "AI 연결이 종료되어 현재 작업을 끝냈습니다.", "error");
      addTokenFooter(currentTurnUsage);
    } else if (current.state !== "running" && !busy) setStatus("AI 자동 연결 대기", "warn");
  });
  panel.querySelector("[data-ai-close]").addEventListener("click", close);
  panel.addEventListener("mousedown", (event) => { if (event.target === panel) close(); });
  const pasteClipboardImage = async (event = null) => {
    const pasteTarget = captureAiPasteTarget({
      taskId: activeTaskTabId,
      task: taskTabs.get(activeTaskTabId),
      sources: attachments,
      revision: currentRequestEpoch,
    });
    try {
      const result = await readAiClipboardImage(event, {readNative: desktop?.readClipboardImage});
      if (!result.blob && !result.dataUrl) {
        setStatus('클립보드에서 이미지 형식을 찾지 못했습니다.', 'warn');
        return;
      }
      const data = result.dataUrl || await blobToDataUrl(result.blob);
      if (busy || !isAiPasteTargetCurrent(pasteTarget, {
        taskId: activeTaskTabId,
        task: taskTabs.get(activeTaskTabId),
        sources: attachments,
        revision: currentRequestEpoch,
      })) {
        setStatus('클립보드를 읽는 동안 작업이나 원본이 변경되어 이미지를 추가하지 않았습니다.', 'warn');
        return;
      }
      addReferencesAsTasks([{ data, name: result.blob?.name || "클립보드 이미지", sourceKind: "clipboard" }]);
      setStatus("붙여넣은 이미지의 작업이 준비되었습니다.", "ok");
    } catch (error) {
      setStatus(`클립보드 이미지를 읽지 못했습니다: ${error.message}`, 'error');
    }
  };
  document.addEventListener("paste", (event) => {
    if (panel.hidden || document.querySelector(".modal-overlay:not([hidden]) .modal-objectify")) return;
    const canReadSystemClipboard = typeof navigator.clipboard?.read === 'function'
      || typeof desktop?.readClipboardImage === 'function';
    if (!shouldHandleAiImagePaste(event, canReadSystemClipboard)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void pasteClipboardImage(event);
  }, true);
  panel.addEventListener("dragover", (event) => {
    if (Array.from(event.dataTransfer?.items || []).some((item) => item.kind === "file")) event.preventDefault();
  });
  panel.addEventListener("drop", (event) => {
    const dropped = Array.from(event.dataTransfer?.files || []).filter((item) => item.type.startsWith("image/"));
    if (!dropped.length) return;
    event.preventDefault();
    void Promise.all(dropped.map(blobToDataUrl)).then((dataUrls) => {
      addReferencesAsTasks(dropped.map((item, index) => ({ data: dataUrls[index], name: item.name, sourceKind: "drop" })));
      setStatus(`이미지 ${dropped.length}개 · 작업 ${dropped.length}개 준비됨`, "ok");
    });
  });
  document.addEventListener("keydown", (event) => {
    if (panel.hidden || panel.querySelector("dialog[open]")) return;
    if (isCloseActiveTaskShortcut(event) && activeTaskTabId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      tabList?.querySelector(`[data-tab-id="${CSS.escape(activeTaskTabId)}"] > .ai-task-delete`)?.click();
      return;
    }
    if (event.key === 'Delete' && event.target?.closest?.('.ai-task-tab.is-on')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.target.closest('.ai-task-tab')?.querySelector('.ai-task-delete')?.click();
      return;
    }
    if (event.key === "Escape") close();
  });
  desktop?.onAiCloseTaskShortcut?.(() => {
    if (!panel.hidden && !panel.querySelector('dialog[open]') && activeTaskTabId) {
      tabList?.querySelector(`[data-tab-id="${CSS.escape(activeTaskTabId)}"] > .ai-task-delete`)?.click();
    }
  });
  modal?.addEventListener("mousedown", (event) => event.stopPropagation());
  commentController=createImageCommentController({panel,getImages:()=>[...attachments.filter(isInputReference),...generatedImages],getSelectedId:()=>selectedCandidateId||generatedImages.at(-1)?.id,isBusy:()=>busy,changed:()=>{scopedSelectionRevision += 1;captureActiveTaskTab();persistTasks();}});
  panel.querySelector('[data-ai-comments-apply]')?.addEventListener('click',()=>submit('image', { bypassCache: true }));
  // Per-card action rows are intentionally hidden by the workbench CSS.
  // Keep the real scoped-edit action in the visible, fixed selected-result footer.
  const editableGroups = document.createElement('button');
  editableGroups.type = 'button';
  editableGroups.dataset.aiEditableGroups = '';
  editableGroups.textContent = '편집용 그룹 준비';
  editableGroups.addEventListener('click', async () => {
    const item = selectedOutputItem();
    if (busy || !item || item.sceneResult) return;
    await openGroupsForItem(item, candidateUsesSeparatedAssets(item));
  });
  panel.querySelector('[data-ai-insert-selected]')?.after(editableGroups);
  const separatedRecovery = document.createElement('button');
  separatedRecovery.type = 'button'; separatedRecovery.dataset.aiSeparatedRecovery = '';
  separatedRecovery.textContent = '영역을 직접 지정해서 분리';
  separatedRecovery.hidden = true;
  separatedRecovery.addEventListener('click', () => {
    const item = selectedOutputItem();
    if (busy || !item || separatedCandidateNextAction(item) !== 'manual-regions') return;
    void openGroupsForItem(item, false);
  });
  editableGroups.after(separatedRecovery);
  const selectedOutputNote = document.createElement('p');
  selectedOutputNote.className = 'ai-selected-output-note';
  selectedOutputNote.dataset.aiSelectedOutputNote = '';
  selectedOutputNote.setAttribute('role', 'status');
  selectedOutputNote.setAttribute('aria-live', 'polite');
  selectedOutputNote.hidden = true;
  separatedRecovery.after(selectedOutputNote);
  const scoped = document.createElement('button');
  scoped.type = 'button'; scoped.dataset.aiInputMutator = ''; scoped.dataset.aiScopedEditSelected = '';
  scoped.textContent = '선택 영역 수정';
  scoped.addEventListener('click', () => { const item = selectedOutputItem(); if (item) void startScopedEdit(item); });
  panel.querySelector('[data-ai-save-selected]')?.before(scoped);
  syncSelectedOutputActions();
  panel.querySelector('[data-ai-save-selected]')?.addEventListener('click', () => {
    if (!busy) selectedOutputItem()?.card?.querySelector('[data-ai-save-candidate]')?.click();
  });
  const exportCount = mode => {
    captureActiveTaskTab();
    return taskExportSelection([...taskTabs.values()], mode).length;
  };
  const exportResults = async mode => {
    captureActiveTaskTab();
    const selected = taskExportSelection([...taskTabs.values()], mode);
    return Promise.all(selected.map(async record => ({
      ...record,
      dataUrl: await resolveImageOutput(
        record.item,
        normalizeImageOutputOptions(record.outputOptions),
        transparentizeGeneratedImage,
      ),
    })));
  };
  collectiveExportButton.addEventListener('click', async () => {
    if (busy || exportInProgress || typeof exportCollection !== 'function') return;
    exportInProgress = true;
    collectiveExportButton.disabled = true;
    collectiveExportMode.disabled = true;
    setStatus('여러 작업의 결과를 준비하고 있습니다…', 'busy');
    try {
      const result = await exportCollection(collectiveExportMode.value);
      if (result.status === 'stored') setStatus(`결과 ${result.count}개를 선택한 폴더에 저장했습니다.`, 'ok');
      else if (result.status === 'download-requested') setStatus(`결과 ${result.count}개의 ZIP 다운로드를 요청했습니다. 브라우저의 다운로드 완료를 확인해 주세요.`, 'warn');
      else setStatus('결과 저장을 취소했습니다. 편집 내용은 유지됩니다.', 'warn');
    } catch (error) {
      setStatus(`여러 작업 저장 실패: ${error.message}`, 'error');
    } finally {
      exportInProgress = false;
      collectiveExportMode.disabled = busy;
      collectiveExportButton.disabled = busy
        || !(generatedImages.length || [...taskTabs.values()].some(tab => Array.isArray(tab.generated) && tab.generated.length));
    }
  });
  panel.querySelector('[data-ai-insert-selected]')?.addEventListener('click', () => {
    if (!busy) selectedOutputItem()?.card?.querySelector('.ai-canvas-output')?.click();
  });
  panel.addEventListener('input',()=>persistTasks());
  panel.addEventListener('5e:ai-review',()=>{commentController.render();syncSelectedOutputActions();persistTasks();});
  panel.addEventListener('5e:ai-workbench-geometry-change',()=>commentController.render());
  panel.querySelector('[data-ai-composition-select]')?.addEventListener('change', event => {
    const orientation = event.target.value;
    if (busy) { event.target.value = referenceComposition.orientation; return; }
    if (orientation === 'free') {
      event.target.value = referenceComposition.orientation;
      panel.querySelector('[data-ai-free-composition]')?.click();
    } else {
      panel.dispatchEvent(new CustomEvent('5e:ai-composition-orientation-change', { detail: { orientation } }));
    }
  });
  panel.querySelector('[data-ai-free-composition]')?.addEventListener('click', async () => {
    if (busy) return;
    const inputs = orderedInputReferences(attachments);
    if (!inputs.length) { setStatus('먼저 원본 이미지를 추가해 주세요.', 'ok'); return; }
    const taskId = activeTaskTabId;
    let next;
    try { next = await openAiCompositionEditor({ sources: inputs, composition: referenceComposition }); }
    catch (error) { setStatus(error.message || '배치할 이미지를 불러오지 못했습니다.', 'error'); return; }
    if (!next || busy || activeTaskTabId !== taskId) return;
    referenceComposition = normalizeReferenceComposition(next, attachments);
    syncReferenceSummary(); captureActiveTaskTab(); persistTasks();
  });
  panel.addEventListener('5e:ai-composition-orientation-change', event => {
    if (busy) return;
    referenceComposition = normalizeReferenceComposition({
      ...referenceComposition,
      orientation: event.detail?.orientation,
    }, attachments);
    syncReferenceSummary();
    captureActiveTaskTab();
    persistTasks();
  });
  panel.addEventListener('5e:ai-reference-order-change', event => {
    if (busy) return;
    referenceComposition = moveReferenceInComposition(
      referenceComposition,
      event.detail?.referenceId,
      event.detail?.direction,
      attachments,
    );
    applyReferenceOrderToCards();
    syncReferenceSummary();
    captureActiveTaskTab();
    persistTasks();
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void taskPersistence.flush();});
  window.addEventListener('pagehide',()=>{void taskPersistence.flush();});
  window.addEventListener('5e:shortcut-platform-change', syncTaskDeleteShortcutHints);
  window.addEventListener('5e:shortcut-platform-change', syncSourceShortcutHints);
  if (!taskTabs.size) createTaskTab();
  workspaceReady=(async()=>{try{const recovered=recoverTaskWorkspaceSnapshot(await taskStore?.get('workspace'));if(Array.isArray(recovered?.tabs)){taskTabs.clear();for(const tab of recovered.tabs)taskTabs.set(tab.id,tab);taskTabSerial=Math.max(taskTabSerial,Number(recovered.taskTabSerial)||0);imageSerial=Math.max(imageSerial,Number(recovered.imageSerial)||0);if(taskTabs.size)restoreTaskTab(recovered.activeTaskTabId);else{activeTaskTabId=null;renderTaskTabs();}persistTasks();}}catch(error){addLog(`이전 이미지 작업 복원 실패: ${error.message}`,"error");}})();
  if (reviewModelSelect) {
    reviewModelSelect.replaceChildren(new Option(AI_IMAGE_REVIEW_MODEL, AI_IMAGE_REVIEW_MODEL));
    reviewModelSelect.value = AI_IMAGE_REVIEW_MODEL;
    reviewModelSelect.disabled = true;
  }
  if (reviewEffortSelect) {
    reviewEffortSelect.replaceChildren(new Option(AI_IMAGE_REVIEW_EFFORT, AI_IMAGE_REVIEW_EFFORT));
    reviewEffortSelect.value = AI_IMAGE_REVIEW_EFFORT;
    reviewEffortSelect.disabled = true;
  }
  dispatchReviewEvent({ state: "idle", candidateId: null, report: emptyReviewReport(), generationCount: 0, reviewCount: 0, elapsedMs: 0 });
  syncMode();
  syncQualityMode();
  syncOutputEngine();
  syncReferenceSummary();
  syncSourceShortcutHints();
  setBusy(false);
  refresh();

  return {
    open, close, attachReference, clearTasks, ready: workspaceReady,
    ownsTask: id => taskTabs.has(id), activeTask: () => activeTaskTabId,
    exportCount, exportResults,
    checkpointForClose: async () => {
      await workspaceReady;
      captureActiveTaskTab();
      await taskPersistence.checkpoint();
      return {
        recovered: true,
        hasWork: [...taskTabs.values()].some((tab) => tab.attachments?.length || tab.generated?.length || tab.conversationMessages?.length || tab.uiMessages?.length || tab.input || tab.workState === "busy"),
      };
    },
    selectTask: id => { if (busy || !taskTabs.has(id) || id === activeTaskTabId) return; captureActiveTaskTab(); restoreTaskTab(id); persistTasks(); },
  };
}

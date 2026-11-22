import { grayscaleGeneratedPng } from './ai-grayscale-png.js?v=1.7.0-four-session-integration';
import { AI_WORKFLOW_KINDS, normalizeAIWorkflowKind, isGraphWorkflow, isCreationWorkflow } from './ai-workflow-kinds.js?v=1.7.0-four-session-integration';
import { graphDescriptionSource, prepareGraphDescriptionPlan } from './graph/description-contract.js?v=1.7.0-four-session-integration';
import { createWorkbenchLoading, estimateLoadingMs, showDoneNotice } from './loading/workbench-loading.js?v=1.7.0-four-session-integration';
import { channelStorage, channelSessionStorage, optionalStorage } from './preview-storage.js?v=1.7.0-four-session-integration';
import { snapshotImageItem, taskItemCopy } from './ai-candidate-snapshot.js?v=1.7.0-four-session-integration';
import { EXAM_BRIEF_PROFILE, isExamBrief, prepareExamBriefRunInput, buildExamBriefPrompt } from './ai-exam-brief.js?v=1.7.0-four-session-integration';
import { registerBugReportContext } from './bug-report.js?v=1.7.0-four-session-integration';
import { localEditableLabelPlan } from './ai-local-label-plan.js?v=1.7.0-four-session-integration';
import { manualLabelPlan } from './ai-label-edit-model.js?v=1.7.0-four-session-integration';
import { createInlineLabelEditor } from './ai-inline-label-editor.js?v=1.7.0-four-session-integration';
import { visibleImagePng } from './ai-visible-image-output.js?v=1.7.0-four-session-integration';
import { markResultReady, pendingResult, acknowledgeResult, syncResultEntry, isQuietLabelReadResult, isQuietSkippedReviewResult } from './ai-result-attention.js?v=1.7.0-four-session-integration';
import { createGraphReconstructionWorkflow, graphSourceHash } from './graph/reconstruction-workflow.js?v=1.7.0-four-session-integration';
import { GRAPH_WORKBENCH_SELECTION, validateWorkbenchGraph, buildWorkbenchGraph, workbenchGraphDataUrl, workbenchGraphContextAttachment, editWorkbenchGraph, workbenchGraphSourceFrame } from './graph/workbench-result.js?v=1.7.0-four-session-integration';
import { describeGraphFailure } from './graph/reconstruction-error.js?v=1.7.0-four-session-integration';
import { summarizeAnalyticGraph } from './graph/analytic-summary.js?v=1.7.0-four-session-integration';
import { collectScopedAreaComments, buildScopedEditPrompt } from './ai-scoped-edit-prompt.js?v=1.7.0-four-session-integration';
import { buildCompactScopedEditPrompt, buildVerifiedScopedEditPrompt } from './ai-scoped-edit-compact.js?v=1.7.0-four-session-integration';
import { prepareScopedEditContext, restoreScopedEditContext } from './ai-scoped-edit-context.js?v=1.7.0-four-session-integration';
import { validateScopedEditChecks, evaluateScopedEditPrecision, scopedEditCorrectionFeedback } from './ai-scoped-edit-verification.js?v=1.7.0-four-session-integration';
import { isHistoricalPngLocalResult, requiresRawImageOutput, canChooseLocalOutput, keepsRawImageOutput } from './ai-output-processing.js?v=1.7.0-four-session-integration';
import { initAISettingsPanel, sourceImageKind } from "./ai-settings-panel.js?v=1.7.0-four-session-integration";
import { detectImageSourceKind, SOURCE_DETECT_MAX_SIDE } from "./ai-source-detect.js?v=1.7.0-four-session-integration";
import { createModalSurfaceMotion } from './modal-surface-motion.js?v=1.7.0-four-session-integration';
import { showAlert, showConfirm } from './ui-dialogs.js?v=1.7.0-four-session-integration';
import { mountAiErrorLog, safeAiErrorText } from './ai-error-log.js?v=1.7.0-four-session-integration';
import { mountRevisionComparison } from './ai-comparison.js?v=1.7.0-four-session-integration';
import { attachCropMagnifier } from './tools/pointer-magnifier.js?v=1.7.0-four-session-integration';
import { readAIModelCatalog, resolveAIModelSelection, defaultAIModelSelection } from './ai-model-capabilities.js?v=1.7.0-four-session-integration';
import { transitionSeparationMode, SEPARATION_BACKGROUND_HINT, SEPARATION_LIMITS_HINT } from './ai-separation-mode.js?v=1.7.0-four-session-integration';
import { createWorkbenchRequestState, isTerminalRequestPhase, requestPhaseLabel, requestPhaseOutcome } from './ai-workbench-request-state.js?v=1.7.0-four-session-integration';
import { GENERATION_STOPPED, generationFailedText, failureReason } from './ai-generation-copy.js?v=1.7.0-four-session-integration';
import { aiErrorText, aiErrorCode, codexMissing, reportAiError } from './ai-error-copy.js?v=1.7.0-four-session-integration';
import { openAiCompositionEditor } from './ai-composition-editor.js?v=1.7.0-four-session-integration';
import { restrictSharedWorkspace } from './ai-sharing-access.js?v=1.7.0-four-session-integration';
import { registerEscapeLayer } from './escape-layers.js?v=1.7.0-four-session-integration';
import { AI_ENGINE_FLAG_KEYS, figureLocalReplaceFlag } from './ai-engine-flags.js?v=1.7.0-four-session-integration';
import { clearTaskWorkspaces, taskHasReviewNotice, createTaskPersistence, createTaskWorkspaces, recoverTaskWorkspaceSnapshot } from './ai-task-workspaces.js?v=1.7.0-four-session-integration';
import {
  advanceGenerationTiming,
  restoreGenerationTiming,
  sampleGenerationTiming,
  serializeGenerationTiming,
  startGenerationTiming,
} from './ai-generation-timing.js?v=1.7.0-four-session-integration';
import { taskExportSelection } from './ai-task-export.js?v=1.7.0-four-session-integration';
import { keyLabel, modKey } from './platform.js?v=1.7.0-four-session-integration';
import {
  distributeSourcesToTaskTabs,
  groupSourcesInTaskTab,
  moveReferenceInComposition,
  normalizeReferenceComposition,
} from './ai-source-tasking.js?v=1.7.0-four-session-integration';
import { setupAiWorkbench } from './ai-workbench.js?v=1.7.0-four-session-integration';
import { mountDurableBatchUi } from './ai-batch-ui.js?v=1.7.0-four-session-integration';
import { createScopedEditSession, confirmScopedEditSession, prepareScopedEditProposal, acceptScopedEditProposal, discardScopedEditProposal, invalidateScopedEditSession } from './ai-scoped-edit-session.js?v=1.7.0-four-session-integration';
import { decodeScopedPng } from './ai-scoped-edit-png.js?v=1.7.0-four-session-integration';
import { createScopedEditComparison } from './ai-scoped-edit-comparison.js?v=1.7.0-four-session-integration';
import { createImageCommentController, commentDisplayNumber, buildCommentRequest, PRESERVE_UNREQUESTED } from "./ai-image-comments.js?v=1.7.0-four-session-integration";
import { IndexedDBOutputCacheBackend } from "./ai-output-cache-store.js?v=1.7.0-four-session-integration";
import { parseEditableImageLabelPlan, withEditableImageLabelPlan, SOURCE_LABEL_POLICY_VERSION, EDITABLE_IMAGE_LABEL_PLAN_VERSION } from "./ai-editable-image-labels.js?v=1.7.0-four-session-integration";
import { createSourceLabelController, withFrozenSourceLabelPlan, buildSourceLabelCorrectionDraft } from './ai-source-label-plan.js?v=1.7.0-four-session-integration';
import { createEditableLabelComposite } from './ai-label-composite.js?v=1.7.0-four-session-integration';
import { createLocalImageEraseController, DEFAULT_ERASE_DIAMETER } from './ai-image-local-erase.js?v=1.7.0-four-session-integration';
import { normalizeImageLabelWorkflow, defaultLabelResultFor, labelResultAfterKindChange } from './ai-image-label-workflow.js?v=1.7.0-four-session-integration';
import { createImageLabelRasterController, executeImageLabelRun, createExamLocalRestore, imageLabelDigest, AI_RETRY_FALLBACK_MODEL, AI_LABEL_READ_MODEL, labelPlanFromRead, measuredLabelSizes } from './ai-image-label-run.js?v=1.7.0-four-session-integration';
import { figureRoute, graphRoute, createDesktopEngineAi, engineModels, imageModelOrder, runFigureEngine, runFigureEdit, figureLabelHints, pickOtherFigureRefs, loadFigureRefImages, figureRefIds, figureRefTags, figureRefLabel, figureRefContextText, wantsFigureRefImages, runGraphPicture, figurePhaseCopy, graphPhaseCopy, runAgainHint } from './ai-engines.js?v=1.7.0-four-session-integration';
import { advanceStatusRows, settleStatusRows, statusRowText, clockText, resultNumber, resultSubline, resultChips, labelHintsFallback, labelHintPrompt, eraseGlyphsInBoxes } from './ai-create-chat.js?v=1.7.0-four-session-integration';
import { enterAction, isImeEnter, isBlankInspection, gatherDrawRequest, drawPlanNote, drawPreviewLine, composerHint, looksLikeDrawSummary, drawScope, resetIsLast, resultActionText, RESULT_MARK, RESET_MARK } from './ai-create-flow.js?v=1.7.0-four-session-integration';
import { installChatWidth } from './ai-chat-width.js?v=1.7.0-four-session-integration';
import { LABEL_READ_PROMPT, parseLabelRead } from './ai-direct-label-plan.js?v=1.7.0-four-session-integration';
import { eraseLabelsAndLeaders } from './ai-label-leader-erase.js?v=1.7.0-four-session-integration';
import { canEditLabelReviewDraft, insertLabelReviewDraft } from './ai-label-review-draft.js?v=1.7.0-four-session-integration';
import { validateLabelTargetPlacement } from './ai-label-target-placement.js?v=1.7.0-four-session-integration';
import { prepareEditableLabelFonts } from "./ai-label-typography.js?v=1.7.0-four-session-integration";
import { openEditableAssetsDialog } from "./ai-editable-assets-dialog.js?v=1.7.0-four-session-integration";
import { insertEditableAssets } from "./ai-editable-assets.js?v=1.7.0-four-session-integration";
import { prepareSeparatedAssets, SEPARATED_ASSETS_PROMPT } from "./ai-separated-assets.js?v=1.7.0-four-session-integration";
import { buildDiscussionPrompt, buildImagePrompt } from "./ai-prompt.js?v=1.7.0-four-session-integration";
import { IMAGE_BACKGROUND_VERSION, transparentizeGeneratedImage } from "./image-background.js?v=1.7.0-four-session-integration";
import { parseAiEvent } from "./ai-events.js?v=1.7.0-four-session-integration";
import {
  AI_IMAGE_TRANSPORT_VERSION,
  createCheapImageSignature,
  prepareAIImageForTransport,
} from "./ai-image-transport.js?v=1.7.0-four-session-integration";
import {
  compactConversation,
  markImagesSent,
  selectOutgoingImageItems,
} from "./ai-request-plan.js?v=1.7.0-four-session-integration";
import { buildFastScenePrompt, FAST_SCENE_PROMPT_VERSION } from "./ai-scene-prompt.js?v=1.7.0-four-session-integration";
import { chooseImageEngine, IMAGE_ENGINE_IDS } from "./ai-engine-router.js?v=1.7.0-four-session-integration";
import { compileFastScene } from "./ai-scene-fastpath.js?v=1.7.0-four-session-integration";
import {
  compileFastSceneWithMotifs,
  expandAiMotifScene,
  MOTIF_CATALOG_VERSION,
} from "./ai-motif-catalog.js?v=1.7.0-four-session-integration";
import {
  LOCAL_ASSET_ROUTER_VERSION,
  matchLocalAssetRequest,
} from "./ai-local-asset-router.js?v=1.7.0-four-session-integration";
import { fastSceneToSvgDataUrl, insertFastSceneIntoState } from "./ai-scene-preview.js?v=1.7.0-four-session-integration";
import {
  buildExactOutputCacheDescriptor,
  createExactOutputCacheKey,
  createRemoteImageInputPlan,
  REMOTE_INPUT_PLAN_VERSION,
} from "./ai-remote-input-plan.js?v=1.7.0-four-session-integration";
import { composeReferenceImages } from './ai-reference-composite.js?v=1.7.0-four-session-integration';
import {
  composeRemoteImageInputPlan,
  REMOTE_COMPOSITOR_VERSION,
} from "./ai-remote-compositor.js?v=1.7.0-four-session-integration";
import { createExactOutputCacheStore } from "./ai-output-cache-store.js?v=1.7.0-four-session-integration";
import { openPdfReferencePicker } from "./pdf-library/reference-picker.js?v=1.7.0-four-session-integration";
import { getReferenceRole, partitionReferenceItems, planImageReferences } from "./ai-reference-roles.js?v=1.7.0-four-session-integration";
import { normalizeMarkPolicy, buildMarkPolicyContract } from "./ai-mark-policy.js?v=1.7.0-four-session-integration";
import { createStructureAnalysisController, formatStructureContract, STRUCTURE_SPEC_VERSION } from "./ai-structure-spec.js?v=1.7.0-four-session-integration";
import { APPROVED_FIRST_PROMPT, APPROVED_FIRST_REQUEST, approvedFirstRequestText, approvedFirstRun, prepareApprovedFirstAttachment } from './ai-approved-first-png.js?v=1.7.0-four-session-integration';
import { WHITE_PNG_VERSION, isWhitePngWorkflow, buildWhitePngPrompt } from "./ai-white-png.js?v=1.7.0-four-session-integration";
import {
  parseImageReviewReport,
  buildImageCorrectionRequest,
  buildStructuralInventory,
  createAiImageReviewController,
  enforceImageLabelAcceptance,
  isImageLabelCandidateAccepted,
} from "./ai-image-review.js?v=1.7.0-four-session-integration";
import { resolveGeneratedRaster } from "./ai-raster-output.js?v=1.7.0-four-session-integration";
import {
  imageOutputOptionsKey,
  normalizeImageOutputOptions,
  resolveImageOutput,
} from "./ai-output-processing.js?v=1.7.0-four-session-integration";
import { inspectPngDataUrl, enforcePngAcceptance } from "./ai-png-inspection.js?v=1.7.0-four-session-integration";
import { installCodex, codexInstallState, onCodexInstall, canAutoInstallCodex, INSTALL_STEPS, elapsedText } from "./codex-auto-install.js?v=1.7.0-four-session-integration";
import {
  enforceKiceImageRunInput,
  KICE_IMAGE_MODE,
  KICE_IMAGE_OUTPUT_ENGINE,
  kiceImageRequest,
} from "./kice-image-workflow.js?v=1.7.0-four-session-integration";
import {
  AI_OUTPUT_ENGINES,
  AI_QUALITY_MODES,
  normalizeOutputEngine,
  normalizeQualityMode,
  qualityModeCacheVersion,
} from "./ai-quality-mode.js?v=1.7.0-four-session-integration";

// This path never redraws a PNG through Canvas or registers a pending proposal.
const GRAPH_TO_EDITOR_LABEL = '편집기로 가져오기';
const GRAPH_TO_EDITOR_TITLE = '결과를 그래프 편집기로 가져옵니다. 편집기에서 캔버스로 내보내거나 한글에 넣습니다.';

// 11-11: AI 창 제목 아이콘(아래 도구 줄의 AI 이미지·AI 그래프와 같은 모양)
const AI_TITLE_ICON_IMAGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="6.5" width="13" height="13" rx="1.5"/><path d="m4.5 18 4-4 3 3 2-2 3 3"/><circle cx="8" cy="10.5" r="1"/><path d="M19.5 2.5v4M17.5 4.5h4"/></svg>';
const AI_TITLE_ICON_GRAPH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 4v16h16"/><path d="M6 16c2.3-6.2 4.5-8 6.4-5.3s3.1 .9 4.4-3.2"/><path d="M19.5 2.5v4M17.5 4.5h4"/></svg>';
const AI_IMPORT_ICONS = {
  library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16"/><rect x="5" y="5" width="3.2" height="15" rx=".6"/><rect x="9.6" y="5" width="3.2" height="15" rx=".6"/><path d="m14.4 6.3 3-.8 3 13.4-3 .8z"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>',
  clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="4.5" width="12" height="16" rx="2"/><path d="M9.5 4.5V3h5v1.5"/></svg>',
};
const AI_IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const aiKey = mac => AI_IS_MAC ? mac : mac.replace('⇧⌘', 'Ctrl+Shift+').replace('⌘', 'Ctrl+');
// 11-11: 빈 칸 불러오기 — 큰 단추는 바로 라이브러리, 옆 ＋는 파일·클립보드
const aiEmptyImportHtml = () => `<div class="ai-stage-import"><button type="button" class="ai-stage-import-main" data-ai-empty-library title="라이브러리에서 불러오기 (${aiKey('⇧⌘L')})">${AI_IMPORT_ICONS.library}<span>라이브러리에서 불러오기</span></button><button type="button" class="ai-stage-import-more" data-ai-empty-more aria-haspopup="menu" aria-expanded="false" title="다른 곳에서 불러오기" aria-label="다른 곳에서 불러오기">＋</button><div class="ai-stage-import-menu" role="menu" hidden><button type="button" role="menuitem" data-ai-empty-file>${AI_IMPORT_ICONS.file}<span>파일에서 불러오기</span><kbd>${aiKey('⌘O')}</kbd></button><button type="button" role="menuitem" data-ai-empty-paste>${AI_IMPORT_ICONS.clip}<span>클립보드에서</span><kbd>${aiKey('⌘V')}</kbd></button></div></div>`;
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
      x1: Math.floor((c.x + c.w) * width / 100), y1: Math.floor((c.y + c.h) * height / 100), coordinateSpace: 'selected-result-pixels', ...(c.polygon ? {polygon:c.polygon.map(p=>({x:p.x*width/100,y:p.y*height/100}))} : {}) };
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
  const eventFile = Array.from(event?.clipboardData?.items || [])
    .filter(item => String(item.type || '').startsWith('image/'))
    .map(item => item.getAsFile?.()).find(Boolean);
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
export async function runScopedPanelEdit({ getCurrent, comments, confirmBounds, generate, verify, confirmCorrection, onAttempt, review, register, timingObserver, clock } = {}) {
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
      const live = getCurrent();
      const current = { ...live, sourcePng: new Uint8Array(live.sourcePng) };
      const decoded = await decodeScopedPng(current.sourcePng);
      return { current, decoded };
    });
    session = await measure('session', () => createScopedEditSession({ ...current,
      rectangles: scopedPixelRectangles(comments, decoded.width, decoded.height, current.candidateId) }));
    const boundsConfirmed = await measure('bounds-confirmation', () => confirmBounds(session), result => result ? 'completed' : 'cancelled');
    if (!boundsConfirmed) return false;
    await measure('scope-confirmation', () => confirmScopedEditSession(session, getCurrent));
    let proposal, verification = null, feedback = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      // Reconfirm the same source/identity before every request, including a correction.
      const live = getCurrent();
      if (['taskId','candidateId','epoch','selectionRevision'].some(k => live[k] !== current[k])
          || live.sourcePng.length !== current.sourcePng.length
          || live.sourcePng.some((value,index) => value !== current.sourcePng[index])) {
        throw new Error('Stale scoped edit before generation.');
      }
      const raw = await measure('ai-generation', () => generate(session, {attempt, feedback}));
      proposal = await measure('png-composite-validation', () => prepareScopedEditProposal(session, raw, getCurrent));
      verification = typeof verify === 'function'
        ? await measure('machine-verification', () => verify(proposal, {session, raw, attempt})) : null;
      if (typeof verify === 'function' && (!verification || verification.version !== 1
          || !['pass','fail','uncertain'].includes(verification.status)
          || !Number.isSafeInteger(verification.outsideRgbaChanged)
          || !Array.isArray(verification.checks) || !verification.checks.length)) {
        throw new TypeError('Invalid scoped precision verification report.');
      }
      if (typeof onAttempt === 'function') await onAttempt({attempt, raw, proposal, verification});
      if (!verification || (verification.status === 'pass' && verification.outsideRgbaChanged === 0
          && verification.checks.every(check => check.status === 'pass'))) break;
      feedback = verification.checks.filter(check => check.status === 'fail')
        .map(check => check.feedback).filter(Boolean).join('\n');
      if (attempt === 0 && verification.status === 'fail' && verification.outsideRgbaChanged === 0
          && verification.checks.every(check => ['pass','fail'].includes(check.status))
          && feedback && typeof confirmCorrection === 'function'
          && await measure('correction-confirmation', () => confirmCorrection(verification, proposal))) {
        discardScopedEditProposal(session, proposal);
        continue;
      }
      const error = new Error('수치 검증을 통과하지 못해 후보를 적용하지 않았습니다. 원본과 실패 기록은 유지합니다.');
      error.code = 'SCOPED_EDIT_PRECISION';
      error.verification = verification;
      throw error;
    }
    const reviewed = await measure('candidate-review', () => review(proposal), result => result ? 'completed' : 'cancelled');
    if (!reviewed) return false;
    await measure('registration-display', async () => {
      const accepted = acceptScopedEditProposal(session, proposal, getCurrent);
      // register must check identity again after any asynchronous UI preparation.
      await register(accepted, () => {
        const live = getCurrent();
        return ['taskId','candidateId','epoch','selectionRevision'].every(k => live[k] === current[k])
          && live.sourcePng.length === current.sourcePng.length && live.sourcePng.every((v,i) => v === current.sourcePng[i]);
      }, verification);
    });
    return true;
  } finally { if (session) invalidateScopedEditSession(session); }
}

const RASTER_STYLE_VERSION = "kice-raster-v2";
const RASTER_ENGINE_VERSION = `imagegen-one-shot-v2+${REMOTE_INPUT_PLAN_VERSION}+${REMOTE_COMPOSITOR_VERSION}+${AI_IMAGE_TRANSPORT_VERSION}+${IMAGE_BACKGROUND_VERSION}`;
const FAST_SCENE_PANEL_COMPILE_VERSION = "motif-direct-v1";

export const AI_ASSET_GENERATION_MODES = Object.freeze({ SINGLE: 'single', SEPARATED: 'separated' });
export const AI_SEPARATION_MODES = Object.freeze({ OFF: 'off', AUTO: 'auto', GRID: 'grid', MANUAL: 'manual' });
export const AUTOMATIC_SEPARATION_OPTIONS = Object.freeze({ layout: 'auto', maxAssets: 128, maxDurationMs: 8_000 });
const normalizeSeparationMode = value => Object.values(AI_SEPARATION_MODES).includes(value)
  ? value : AI_SEPARATION_MODES.AUTO;
const separationOptionsForMode = mode => ({
  ...AUTOMATIC_SEPARATION_OPTIONS,
  layout: mode === AI_SEPARATION_MODES.GRID ? 'grid' : 'auto',
});
export const candidateUsesSeparatedAssets = item => isHistoricalPngLocalResult(item)
  && item.generationMode === AI_ASSET_GENERATION_MODES.SEPARATED;
export const candidateUsesAutomaticSeparation = item => isHistoricalPngLocalResult(item);
export async function automaticSeparationCacheKey(dataUrl, outputOptions = {}, separationOptions = AUTOMATIC_SEPARATION_OPTIONS) {
  const prefix = 'data:image/png;base64,';
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix)) throw new TypeError('자동 분리 원본은 PNG 데이터여야 합니다.');
  const encoded = dataUrl.slice(prefix.length);
  const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  return `automatic-separation-v1:${hash}:${imageOutputOptionsKey(outputOptions)}:${separationOptions.layout}:${separationOptions.maxAssets}:${separationOptions.maxDurationMs}`;
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

export function aiTerminalStatusView(outcome, { imageReceived = false, creating = false, reason = 'ai' } = {}) {
  // creating: 그림 생성 — 원본이 없으므로 「앞 결과는 그대로」(변환 문구는 그대로 둔다).
  if (outcome === "failed") return { text: creating ? generationFailedText(reason) : "변환에 실패했습니다. 입력과 코멘트는 보존되었습니다.", kind: "error" };
  if (outcome === "cancelled") return { text: creating ? GENERATION_STOPPED : "작업 취소됨", kind: "warn" };
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

const CREATION_REFERENCE_LIMIT = 4;
const isInputReference = item => { try { return getReferenceRole(item) === 'INPUT_SOURCE'; } catch { return false; } };

export { snapshotImageItem, taskItemCopy } from './ai-candidate-snapshot.js?v=1.7.0-four-session-integration';

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

const localStorage = optionalStorage(channelStorage);
const sessionStorage = optionalStorage(channelSessionStorage);

export function initAiPanel(state, options) {
  return createTaskWorkspaces(state, initAiTaskPanel, setupAiWorkbench, options);
}

export function createUnifiedAiSourceConsumer({ addReferencesAsTasks, setStatus }) {
  const accept = (references, options) => {
    const taskIds = addReferencesAsTasks(references, options);
    if (!Array.isArray(taskIds) || !taskIds.length) throw new Error("현재 AI 작업이 참고 이미지를 받지 못했습니다. 변환이 끝난 뒤 다시 시도해 주세요.");
    return taskIds;
  };
  return Object.freeze({
    onAdd(reference) { return accept([reference]); },
    onAddMany(references, options) { return accept(references, options); },
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
  // 먹통 고침(11-21): 이미 끝난 턴·대화 턴은 interrupt가 ok:true를 못 돌려줘 작업을 지울 수 없었다.
  // 멈추기를 보냈으면(결과·오류와 상관없이) 지우기를 허락한다 — 늦게 오는 이벤트는 epoch로 버려진다.
  try { await interrupt(); } catch { /* 멈추기가 실패해도 지우기는 진행 */ }
  return { acknowledged: true };
}

function initAiTaskPanel(state, { panel, desktop, clientScope, newWorkspace, switchWorkflow, navigationChanged, workspaceEmpty, clearCollection, selectCollection, launchSelected, selectedTaskCount, selectedTaskBlocked = () => 0, cancelWorkspaceJob, resumeAfterLogin, materializeCandidate }) {
  if (!panel) return;
  const lifecycle = new AbortController();
  const disposalCallbacks = [];
  let disposed = false;
  // A staged local revision is visible before its durable checkpoint finishes.
  // Keep the lock outside serialized candidates and retain it across task views.
  const pendingLocalSaves = new Map();
  const isLocalSavePending = item => pendingLocalSaves.get(activeTaskTabId)?.has(item?.id) === true;
  let localVisibilityEpoch = 0;

  const modal = panel.querySelector(".modal-ai");
  const motion = createModalSurfaceMotion({ overlay: panel, surface: modal, cssEntrance: 'modal-pop' });
  panel.addEventListener('5e:library-ai-handoff-ready', () => {
    if (motion.isOpen()) motion.finish();
  }, { signal: lifecycle.signal });
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
  let compactSettings = null;
  let localEraseController = null;
  let inlineLabelEditor = null;
  const preserveSourceLabels = panel.querySelector("[data-ai-preserve-source-labels]");
  const imageKindSelect = panel.querySelector('[data-ai-image-kind]');
  const labelResultSelect = panel.querySelector('[data-ai-label-result]');
  const labelVerificationSelect = panel.querySelector('[data-ai-label-verification]');
  const preciseRestoreCheckbox = panel.querySelector('[data-ai-precise-restore]');
  const readImageLabelWorkflow = () => normalizeImageLabelWorkflow({ imageKind: imageKindSelect?.value, labelResult: labelResultSelect?.value,
    auxiliaryMarks: markLeaders?.value, scientificArrows: markArrows?.value === 'remove' ? 'remove' : 'keep',
    verificationMode: labelVerificationSelect?.value || 'full' });
  const sourceLabelNote = panel.querySelector("[data-ai-source-label-note]");
  const readPreserveSourceLabels = () => preserveSourceLabels?.checked === true;
  const labelEvidenceForRun = (runInput, text, referenceCount = runInput?.sourceReferenceCount || 0) => ({
    text, preserveSourceLabels: runInput?.preserveSourceLabels === true, referenceCount,
  });
  const readMarkPolicy = () => normalizeMarkPolicy({arrows:markArrows?.value,trendLines:markTrends?.value,leaders:markLeaders?.value});
  const restoreMarkPolicy = value => {const p=normalizeMarkPolicy({...value,arrows:value?.arrows === 'remove' ? 'remove' : 'keep'});if(markArrows)markArrows.value=p.arrows;if(markTrends)markTrends.value=p.trendLines;if(markLeaders)markLeaders.value=p.leaders;compactSettings?.sync();};
  markLeaders?.addEventListener('change',()=>{const tab=taskTabs.get(activeTaskTabId);if(tab)tab.markPolicyChosen=true;});
  const previews = panel.querySelector("[data-ai-previews]");
  const renderEmptyResult = (empty) => {
    if (!empty) return;
    empty.className = "ai-empty ai-stage-empty";
    empty.dataset.aiEmpty = "";
    empty.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m5 17 4.5-4.5 3.2 3.2 2-2L19 18"/></svg><strong>생성 결과 없음</strong><span>변환하면 결과가 여기에 표시됩니다.</span>';
  };
  const renderEmptySource = (empty) => {
    empty.classList.add('ai-stage-empty');
    empty.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m5 17 4.5-4.5 3.2 3.2 2-2L19 18"/></svg><strong>작업할 이미지를 추가하세요</strong><span>라이브러리에서 고르거나, 이미지를 끌어놓으세요.</span>' + aiEmptyImportHtml();
  };
  renderEmptyResult(previews?.querySelector("[data-ai-empty]"));
  const initialEmptySource = panel.querySelector('[data-ai-reference-empty]');
  if (initialEmptySource) renderEmptySource(initialEmptySource);
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
  const scopedPromptMode = panel.querySelector("[data-ai-scoped-prompt-mode]");
  // Upgrade the incumbent template without requiring an index.html mutation.
  // Keep the legacy selectors as programmatic adapters, outside the tab order.
  const labelView = panel.querySelector('[data-ai-label-view]');
  let labelToggle = labelView?.querySelector('[data-ai-label-toggle]');
  if (labelView) {
    labelView.hidden = false;
    for (const legacy of labelView.querySelectorAll('[data-ai-label-view-mode]')) { legacy.hidden = true; legacy.tabIndex = -1; }
    if (!labelToggle) {
      labelToggle = document.createElement('button'); labelToggle.type = 'button';
      labelToggle.dataset.aiLabelToggle = ''; labelToggle.setAttribute('role', 'switch');
      labelToggle.setAttribute('aria-label', '수정본 라벨 표시');
      labelToggle.innerHTML = '<span>라벨</span><span class="ai-label-toggle-state" data-ai-label-toggle-state>OFF</span><span class="ai-label-toggle-track" aria-hidden="true"></span>';
      labelView.prepend(labelToggle);
    }
  }
  let resultTools = panel.querySelector('[data-ai-result-tools]');
  if (!resultTools) {
    resultTools = document.createElement('div'); resultTools.className = 'ai-result-tools';
    resultTools.dataset.aiResultTools = '';
    labelView?.before(resultTools); if (labelView) resultTools.append(labelView);
  }
  if (!resultTools.querySelector('[data-ai-local-erase]')) {
    const localEraseButton = document.createElement('button'); localEraseButton.type = 'button';
    localEraseButton.dataset.aiLocalErase = ''; localEraseButton.className = 'ai-local-erase-toggle';
    localEraseButton.setAttribute('aria-label', '지우개'); localEraseButton.setAttribute('aria-pressed', 'false');
    localEraseButton.setAttribute('aria-controls', 'ai-local-erase-options');localEraseButton.setAttribute('aria-expanded', 'false');
    localEraseButton.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="m3 10 6-7 5 4-6 7H6zM5.5 7l5 4M7 14h7"/></svg><span>지우개</span>';
    resultTools.append(localEraseButton);
  }
  if (!resultTools.querySelector('[data-ai-local-erase-options]')) {
    const options=document.createElement('div');options.id='ai-local-erase-options';options.dataset.aiLocalEraseOptions='';options.className='ai-local-erase-options';options.hidden=true;
    options.setAttribute('aria-label','지우개 설정');
    options.innerHTML=`<div class="ai-erase-modes" role="group" aria-label="지우개 방식"><button type="button" data-ai-erase-mode="brush" aria-pressed="true">문질러 지우기</button><button type="button" data-ai-erase-mode="rect" aria-pressed="false">사각 영역</button></div><label>굵기 <input type="range" min="1" max="80" value="${DEFAULT_ERASE_DIAMETER}" data-ai-erase-size aria-label="지우개 굵기"><output data-ai-erase-size-value>${DEFAULT_ERASE_DIAMETER} px</output></label><label>지운 자리 <select data-ai-erase-background aria-label="지운 자리 배경"><option value="transparent">투명</option><option value="white">흰색</option></select></label><small>그림만 편집합니다. 모두 끝나면 수정 저장을 누르세요. Esc: 도구 닫기</small>`;
    resultTools.append(options);
  }
  if (!resultTools.querySelector('[data-ai-edit-save]')) {
    for (const [key, text] of [['aiEditSave', '수정 저장'], ['aiEditDiscard', '편집 취소']]) {
      const control = document.createElement('button'); control.type = 'button'; control.dataset[key] = '';
      control.className = 'ai-local-edit-action'; control.textContent = text; control.hidden = true;
      resultTools.insertBefore(control, resultTools.querySelector('[data-ai-local-erase]'));
    }
  }
  if (!panel.querySelector('[data-ai-edit-history]')) {
    const history = document.createElement('div'); history.className = 'ai-local-edit-history';
    history.dataset.aiEditHistory = ''; history.hidden = true;
    history.setAttribute('role', 'group'); history.setAttribute('aria-label', '직접 편집 이력');
    history.innerHTML = '<button type="button" data-ai-edit-undo aria-label="직접 편집 실행 취소" title="실행 취소 (⌘Z / Ctrl+Z)" disabled><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4 3 8l4 4M3 8h7a6 6 0 0 1 6 6v2"/></svg></button><button type="button" data-ai-edit-redo aria-label="직접 편집 다시 실행" title="다시 실행 (⌘⇧Z / Ctrl+Shift+Z)" disabled><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m13 4 4 4-4 4M17 8h-7a6 6 0 0 0-6 6v2"/></svg></button>';
    panel.querySelector('.ai-compare-heading > .ai-pane-zoom')?.before(history);
  }
  const scopedPromptRow = panel.querySelector('[data-ai-scoped-prompt-row]');
  let scopedAdvanced = scopedPromptRow?.closest('[data-ai-scoped-advanced]');
  if (scopedPromptRow && !scopedAdvanced) {
    scopedAdvanced = document.createElement('details'); scopedAdvanced.dataset.aiScopedAdvanced = '';
    scopedAdvanced.className = 'ai-scoped-advanced'; scopedAdvanced.hidden = true;
    const summary = document.createElement('summary'); summary.textContent = '고급 · 실험';
    scopedPromptRow.before(scopedAdvanced); scopedAdvanced.append(summary, scopedPromptRow);
  }
  if (!panel.querySelector('[data-ai-scoped-apply-hint]')) {
    const scopedApplyHint = document.createElement('small'); scopedApplyHint.dataset.aiScopedApplyHint = '';
    scopedApplyHint.setAttribute('role', 'status'); scopedApplyHint.className = 'ai-scoped-apply-hint';
    panel.querySelector('[data-ai-comments-apply]')?.after(scopedApplyHint);
  }
  const chatButton = panel.querySelector("[data-ai-chat-send]");
  const newButton = panel.querySelector("[data-ai-new]");
  const retryInterruptedButton = document.createElement('button');
  retryInterruptedButton.type = 'button';
  retryInterruptedButton.dataset.aiRetryInterrupted = '';
  retryInterruptedButton.className = 'modal-btn';
  retryInterruptedButton.textContent = '중단 작업 다시 시도';
  retryInterruptedButton.hidden = true;
  retryInterruptedButton.style.cssText = 'width:100%;min-width:0;';
  (panel.querySelector('[data-ai-tabs]') || panel.querySelector('[data-ai-tab-list]'))?.after(retryInterruptedButton);
  const compareButton = panel.querySelector("[data-ai-compare]");
  const captureButton = panel.querySelector("[data-ai-capture]");
  if (captureButton) {
    captureButton.removeAttribute('role');
    captureButton.textContent = '화면 캡처';
    captureButton.title = '화면 또는 창에서 영역을 캡처합니다';
    panel.querySelector('.ai-original-pane .ai-pane-head-controls')?.append(captureButton);
  }
  const referenceSearchButton = panel.querySelector("[data-ai-reference-search]");
  const loginButton = panel.querySelector("[data-ai-login]");
  // PATHFIX(11-20): Codex 프로그램을 못 찾았을 때의 설치 안내(연결 정보 안) — 「다시 찾기」·「오류 기록 열기」
  const codexInstallBox = panel.querySelector("[data-ai-codex-install]");
  const codexInstallNote = panel.querySelector("[data-ai-codex-install-note]");
  const codexLocateButton = panel.querySelector("[data-ai-codex-locate]");
  const openErrorLogButton = panel.querySelector("[data-ai-open-error-log]");
  const CODEX_MISSING_STATUS = 'Codex 프로그램을 찾지 못했습니다 · 연결 정보의 설치 안내대로 설치한 뒤 「다시 찾기」를 누르면 이어서 합니다.';
  const showCodexInstall = (visible, note = '') => {
    if (!codexInstallBox) return;
    codexInstallBox.hidden = !visible || !desktop || Boolean(desktop.web);
    if (codexInstallNote) codexInstallNote.textContent = note;
    if (visible && loginButton) loginButton.hidden = true;
  };
  queueMicrotask(() => { try { wireCodexInstallControls(); } catch (error) { console.warn('[5E] 설치 안내 단추 연결 실패', error); } });
  const modelSelect = panel.querySelector("[data-ai-model]");
  const modelWarning = panel.querySelector("[data-ai-model-warning]");
  const modelRefreshButton = document.createElement('button');
  modelRefreshButton.type = 'button';
  modelRefreshButton.dataset.aiModelRefresh = '';
  modelRefreshButton.textContent = '모델 목록 새로고침';
  modelWarning?.after(modelRefreshButton);
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
  generationModeRow.innerHTML = '<span>이미지 구성</span><select data-ai-generation-mode aria-label="이미지 구성 방식"><option value="single">한 장</option><option value="separated">물체별 분리</option></select><small>최대 16개 · 겹친 부품은 함께 생성됩니다.<br>내부 선은 벡터화하지 않습니다.</small>';
  const generationModeSelect = generationModeRow.querySelector('select');
  const outputProcessing = panel.querySelector('[data-ai-output-processing]');
  if (!outputProcessing) throw new Error('이미지 구성 선택을 표시할 위치가 없습니다.');
  outputProcessing.prepend(generationModeRow);
  const outputProcessingStatus = panel.querySelector('[data-ai-output-processing-status]');
  const outputStatusHome = outputProcessingStatus?.parentNode;
  const outputStatusNext = outputProcessingStatus?.nextSibling;
  const legacyResultSettings = panel.querySelector('[data-ai-legacy-result-settings]');
  const sourceCompactSettings = outputProcessingStatus?.closest('[data-ai-compact-settings]');
  const sourceProcessingFeedback = document.createElement('div');
  sourceProcessingFeedback.className = 'ai-source-processing-feedback';
  sourceProcessingFeedback.dataset.aiSourceProcessingFeedback = '';
  sourceProcessingFeedback.hidden = true;
  if (sourceCompactSettings && outputStatusHome) outputStatusHome.insertBefore(sourceProcessingFeedback, outputProcessingStatus);
  const backgroundPolicySelect = panel.querySelector('select[data-ai-background-policy]');
  const backgroundLockHint = document.createElement('small');
  backgroundLockHint.className = 'ai-background-lock-hint';
  backgroundLockHint.dataset.aiBackgroundLockHint = '';
  backgroundLockHint.id = `ai-background-lock-${clientScope || 'main'}`;
  backgroundLockHint.textContent = SEPARATION_BACKGROUND_HINT;
  backgroundLockHint.hidden = true;
  backgroundPolicySelect?.closest('label')?.after(backgroundLockHint);
  backgroundPolicySelect?.setAttribute('aria-describedby', backgroundLockHint.id);
  const backgroundLockHome = backgroundLockHint.parentNode;
  const backgroundLockNext = backgroundLockHint.nextSibling;
  const examPaletteSelect = panel.querySelector('select[data-ai-exam-palette]');
  const lineThicknessSelect = panel.querySelector('select[data-ai-line-thickness]');
  const separationModeSelect = panel.querySelector('select[data-ai-separation-mode]');
  const batchButton = panel.querySelector("[data-ai-batch]");
  const batchPanel = panel.querySelector("[data-ai-batch-panel]");
  const batchGrid = panel.querySelector("[data-ai-batch-grid]");
  const batchSummary = panel.querySelector("[data-ai-batch-summary]");
  const tabList = panel.querySelector("[data-ai-tab-list]");
  const tabClearButton = panel.querySelector("[data-ai-tab-clear]");
  const reviewModeCheckbox = panel.querySelector("[data-ai-review-mode]");
  const reviewModelSelect = panel.querySelector("[data-ai-review-model]");
  const reviewEffortSelect = panel.querySelector("[data-ai-review-effort]");
  if (reviewModeCheckbox && !reviewModeCheckbox.hasAttribute("checked")) reviewModeCheckbox.checked = true;

  let attachments = [];
  let generatedImages = [];
  let conversionKind = 'image';
  // 11-11: 한글 그림 ↔ AI 작업 연결은 작업 탭 안(tab.hwpTarget)에 둔다 — 작업 저장과 함께 남아 앱을 다시 열어도 이어진다
  // (예전엔 메모리 표라 다시 열면 모든 연결이 사라지고 「한글 파일에 넣기」·끝 알림이 없어졌다).
  const hwpInPlaceTargets = {
    get: id => taskTabs.get(id)?.hwpTarget || undefined,
    has: id => Boolean(taskTabs.get(id)?.hwpTarget),
    set: (id, target) => { const tab = taskTabs.get(id); if (tab && target) tab.hwpTarget = structuredClone(target); },
    delete: id => { const tab = taskTabs.get(id); if (tab) delete tab.hwpTarget; },
  };
  // 11-12: 한글 쪽이 결과를 넣으면 그림 id가 바뀐다 — 그 그림에 이어진 작업들의 연결을 새 id로 옮긴다.
  window.addEventListener('5e:hwp-figure-replaced', event => {
    const { from, to, generation } = event.detail || {};
    if (!from || !to) return;
    let moved = false;
    for (const tab of taskTabs.values()) if (tab.hwpTarget?.figureId === from) { tab.hwpTarget = { ...tab.hwpTarget, figureId: to, ...(generation !== undefined ? { generation } : {}) }; moved = true; }
    if (moved) persistTasks();
  });
  let graphSubmitting = false;
  let graphOwnerEpoch = 0;
  const graphWorkflow = createGraphReconstructionWorkflow({transport:desktop || {send:async()=>{throw new Error('AI 연결을 확인해 주세요.');}}});
  disposalCallbacks.push(desktop?.onEvent?.(event=>graphWorkflow.handleEvent(event)));
  disposalCallbacks.push(desktop?.onState?.(event=>{if(event.state==='stopped')graphWorkflow.fail(event.message);}));
  let referenceComposition = normalizeReferenceComposition(null, attachments);
  let imageSerial = 0;
  let conversationId = localStorage.getItem(`5e.aiConversationId${clientScope ? ":" + clientScope : ""}`) || null;
  let forceNewConversation = false;
  let busy = false;
  let insertingOutput = false;
  let preflightRun = null;
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
  let newEngineRunActive = false; // 1.8.0 새 엔진(그림·그래프 그림)이 도는 중 — 엔진이 단계마다 다시 시도한다
  let previewPending = false;
  let tokenFooterNode = null;
  let currentTurnStartedAt = 0;
  let latestGeneratedSrc = null;
  let currentEngine = IMAGE_ENGINE_IDS.RASTER;
  let currentSceneResponse = "";
  let currentCacheRequest = null;
  let pendingCacheOutput = null;
  let currentTurnCandidate = null;
  let pendingEditableLabelPlan = null;
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
  const structureAnalysis = createStructureAnalysisController({ transport: { send: p => desktop.send(p), interrupt: binding => desktop.interrupt(binding) } });
  const sourceLabelControllers = new Set();
  let imageLabelRunAbort = null;
  const makeSourceLabelController = () => {
    const controller = createSourceLabelController({ transport: { send: p => desktop.send(p), interrupt: binding => desktop.interrupt(binding) } });
    sourceLabelControllers.add(controller);
    return controller;
  };
  const sourceCompositeControllers = new Set();
  const abortSourceComposites = () => {
    for (const controller of sourceCompositeControllers) controller.abort();
    sourceCompositeControllers.clear();
  };
  const sourceReportVerified = report => {
    const parsed = parseImageReviewReport(JSON.stringify(report), { requireLabelChecks: true, requireCompositeChecks: true });
    const bindings = report?.compositeBindings;
    return parsed.ok && parsed.report.verdict === 'pass' && bindings
      && ['candidateSha256', 'planSha256', 'compositeSha256'].every(key => /^[a-f0-9]{64}$/.test(bindings[key]));
  };
  // 11-09 사용자 원칙: 만든 결과는 검수를 돌리지 않았거나 통과하지 않아도 캔버스에 넣고 분리할 수 있어야 한다.
  // 검수 대신 「지금 보이는 그림이 이 작업이 만든 그 그림인지」(그림 지문)만 확인한다.
  const isAdoptableImageLabelCandidate = candidate => Boolean(candidate?.data)
    && (!candidate?.imageLabelWorkflow?.explicit || candidate.verifiedCandidateData === candidate.data);
  const verifyImageLabelCandidateBytes = async candidate => {
    if (!candidate?.imageLabelWorkflow?.explicit) return true;
    const data = candidate.data, hash = candidate.candidateSha256;
    if (!data) return false;
    const digest = await imageLabelDigest(data);
    if (candidate.data !== data || candidate.candidateSha256 !== hash) return false;
    // 지문이 없는 옛 결과는 지금 그림으로 지문을 만든다(막지 않음).
    if (!hash) { candidate.candidateSha256 = digest; candidate.verifiedCandidateData = data; return true; }
    const verified = digest === hash;
    candidate.verifiedCandidateData = verified ? data : null; // Runtime only; never persisted as a trusted flag.
    return verified;
  };
  // 11-09: 실패한 AI 시도(다시 보내기 전)를 남긴다 — 화면 오류 기록(문제 신고에 들어감)·콘솔·이 기기 저장소(최근 200개).
  const recordAiAttemptFailure = record => {
    const stageNames = { sourceAnalysis: '라벨 읽기', generation: '그림 생성', pixelProcessing: '기출 주석 제거', conversion: '변환' };
    const text = `AI ${stageNames[record.stage] || record.stage} ${record.attempt}/${record.attempts}번째 시도 실패 · ${record.model || '기본 모델'} · ${Math.round((record.elapsedMs || 0) / 1000)}초 · ${record.message}`;
    try { console.warn('[5E AI 실패 기록]', JSON.stringify({ ...record, taskId: activeTaskTabId, scope: clientScope || 'main' })); } catch {}
    try { errorLog.record(text, Object.assign(new Error(record.message), { code: record.code || undefined, aiPhase: record.stage })); } catch {}
    try {
      const list = JSON.parse(localStorage.getItem('5e.aiFailureLog') || '[]');
      list.push({ ...record, taskId: activeTaskTabId, scope: clientScope || 'main' });
      localStorage.setItem('5e.aiFailureLog', JSON.stringify(list.slice(-200)));
    } catch {}
  };
  const reviewSourceLabelCandidate = async ({ controller, run, candidate, request, isCurrent }) => {
    const capturedData = candidate.data;
    const compositeController = new AbortController();
    sourceCompositeControllers.add(compositeController);
    try {
      const composite = await createEditableLabelComposite({ plan: run.frozenLabelPlan,
        candidateDataUrl: capturedData, artboard: { ...state.get().artboard }, signal: compositeController.signal });
      if (disposed || compositeController.signal.aborted || !isCurrent() || candidate.data !== capturedData) {
        throw new DOMException('라벨 합성 검수가 취소되었거나 후보가 변경되었습니다.', 'AbortError');
      }
      candidate.finalLabelComposite = composite.attachment.data;
      ensureCompositePreviewControl(candidate);
      return await controller.reviewFinal({ request, plan: run.frozenLabelPlan,
        attachments: run.sourceLabelAttachments, candidate: { name: candidate.name, data: capturedData }, composite,
        model: run.model, effort: run.effort, serviceTier: run.serviceTier, models: run.modelCatalog || availableModels });
    } finally { sourceCompositeControllers.delete(compositeController); }
  };
  const sourceLabelAnalysis = makeSourceLabelController();
  const sourceLabelReview = makeSourceLabelController();
  const imageLabelRaster = createImageLabelRasterController({ transport: { send: payload => desktop.send(payload), interrupt: binding => desktop.interrupt(binding) } });
  sourceLabelControllers.add(imageLabelRaster);
  // 1.8.0: 새 그림 엔진의 그림 차례 전용(지금 생성과 같은 직접 호출 길). 이벤트·취소는 다른 래스터 컨트롤러와 같이 받는다.
  const engineRaster = createImageLabelRasterController({ transport: { send: payload => desktop.send(payload), interrupt: binding => desktop.interrupt(binding) } });
  sourceLabelControllers.add(engineRaster);
  const sourceLabelRequest = (prompt, run, evidence) => run?.frozenLabelPlan
    ? withFrozenSourceLabelPlan(prompt, run.frozenLabelPlan) : withEditableImageLabelPlan(prompt, evidence);
  let selectedCandidateId = null;
  let generationTiming = null;
  let generationTimingTimer = null;
  let generationLongWaitShown = false;
  let availableModels = [];
  let modelsLoaded = false;
  let batchRun = null;
  let selectedMode = KICE_IMAGE_MODE;
  let selectedQualityMode = normalizeQualityMode(localStorage.getItem("5e.aiQualityMode") || AI_QUALITY_MODES.STANDARD);
  let selectedOutputEngine = KICE_IMAGE_OUTPUT_ENGINE;
  let selectedAssetGenerationMode = AI_ASSET_GENERATION_MODES.SINGLE;
  let selectedImageOutputOptions = normalizeImageOutputOptions({
    backgroundPolicy: localStorage.getItem('5e.aiOutputBackgroundPolicy') === 'connected' ? 'connected' : 'preserve',
    examPalette: localStorage.getItem('5e.aiOutputExamPalette') === 'true',
    lineThickness: Number(localStorage.getItem('5e.aiOutputLineThickness')),
  });
  let liteBackgroundPolicy = localStorage.getItem('5e.aiLiteOutputBackgroundPolicy') === 'connected'
    ? 'connected' : 'preserve';
  let selectedSeparationMode = AI_SEPARATION_MODES.OFF;
  let singleBackgroundPolicy = selectedImageOutputOptions.backgroundPolicy;
  let comparison = null;
  const comparisonHost = document.createElement('div');
  comparisonHost.className = 'ai-inline-comparison';
  comparisonHost.hidden = true;
  panel.querySelector('.ai-comparison-grid')?.after(comparisonHost);
  comparisonHost.addEventListener('change', () => scheduleCreateSync());
  const closeComparison = () => {
    comparison?.dispose();
    comparison = null;
    comparisonHost.hidden = true;
    panel.querySelector('.ai-results')?.classList.remove('is-wipe-comparing');
    const button = panel.querySelector('[data-ai-compare]');
    button?.setAttribute('aria-pressed', 'false');
    button?.classList.remove('is-on');
    scheduleCreateSync();
  };
  let closeCapture = null;
  window.addEventListener('5e:ai-workspace-activate', event => {
    if (event.detail?.panel !== panel) { closeComparison(); closeCapture?.(); }
  }, { signal: lifecycle.signal });
  let liteSeparationMode = normalizeSeparationMode(localStorage.getItem('5e.aiLiteSeparationMode'));
  if (![AI_SEPARATION_MODES.OFF, AI_SEPARATION_MODES.AUTO].includes(liteSeparationMode)) {
    liteSeparationMode = AI_SEPARATION_MODES.OFF;
  }
  let liteHiddenOptionSnapshot = null;
  const outputVariantCache = new WeakMap();
  const automaticSeparationCache = new Map();
  let automaticSeparationRun = null;
  let outputProcessingRevision = 0;
  let taskTabSerial = 0;
  let activeTaskTabId = null;
  const taskTabs = new Map();
  const requestStates = createWorkbenchRequestState();
  let requestToken = null;
  let requestTimeout = null;
  const taskViews = new Map();
  const taskRows = new Map();
  const batchRuns = new Map();
  const unclaimedBatchEvents = [];
  let batchActive = false;
  let durableBatchUi = null;
  let conversationMessages = [];
  let outputCache = null;
  try { outputCache = createExactOutputCacheStore(); } catch {}
  let labelBackgroundCache = null;
  try { labelBackgroundCache = createExactOutputCacheStore({ backend: new IndexedDBOutputCacheBackend({ databaseName: '5e-ai-label-background' }) }); } catch {}
  try {
    const storedMessages = JSON.parse(localStorage.getItem(`5e.aiConversationMessages${clientScope ? ":" + clientScope : ""}`) || "[]");
    if (Array.isArray(storedMessages)) conversationMessages = storedMessages.slice(-20);
  } catch {}

  const saveConversationMessages = () => {
    const bounded = conversationMessages.slice(-20);
    // Conversation persistence is required; do not hide write errors as UI preferences.
    channelStorage.setItem(`5e.aiConversationMessages${clientScope ? ":" + clientScope : ""}`, JSON.stringify(bounded));
  };
  const recordConversationMessage = (role, text) => {
    const value = String(text || "").trim();
    if (!value) return;
    const previous = conversationMessages;
    conversationMessages = [...previous, { role, text: value.slice(0, 4000) }].slice(-20);
    try { saveConversationMessages(); }
    catch (error) { conversationMessages = previous; throw error; }
  };
  // V5(시안 대화창v5 ④·⑤): 대화 기록 안 표시 — 결과가 나온 자리({role:'result'})·「새 대화」({role:'reset'}).
  // 그림 요청·대화 요약은 user/assistant만 읽으므로 표시는 말로 새지 않는다. 저장을 못 해도 화면 일은 막지 않는다.
  const recordConversationMark = (mark) => {
    const previous = conversationMessages;
    conversationMessages = [...previous, { ...mark, text: '' }].slice(-20);
    try { saveConversationMessages(); } catch { /* 표시는 이번 화면에서만이라도 쓴다 */ }
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

  const errorLog = mountAiErrorLog(panel, () => {
    const preparing = requestStates.snapshot(activeTaskTabId)?.phase === 'preparing';
    const selection = !preparing && busy && currentRunInput ? currentRunInput : modelSelection();
    return { taskId: requestToken?.taskId || activeTaskTabId,
      taskTitle: taskTabs.get(requestToken?.taskId || activeTaskTabId)?.title,
      candidateId: panel.dataset.aiSelectedCandidateId,
      sourceId: panel.aiWorkbench?.getViewState?.()?.selectedSourceId,
      requestId: requestToken?.requestId, turnId: preparing ? null : currentTurnId,
      model: selection.model, effort: selection.effort, serviceTier: selection.serviceTier };
  });
  disposalCallbacks.push(registerBugReportContext(clientScope || 'image-workbench', trigger => {
    if (disposed || panel.hidden || !panel.isConnected || (trigger?.closest('.modal-ai') && !panel.contains(trigger))) return null;
    const tab = taskTabs.get(activeTaskTabId);
    const view = panel.aiWorkbench?.getViewState();
    const sourceId = view?.selectedSourceId;
    const combined = sourceId === '__combined__' && panel.querySelector('.ai-combined-card img');
    const original = sourceId === '__combined__' ? (combined?.naturalWidth ? { id:sourceId, name:'연결된 전체 원본', data:combined.src } : null)
      : attachments.find(item => item.id === sourceId) || attachments[0];
    const result = generatedImages.find(item => item.id === panel.dataset.aiSelectedCandidateId) || generatedImages.at(-1);
    return { screen: 'AI 이미지 작업대',
      task: { id: activeTaskTabId, title: tab?.title, state: tab?.workState, conversionKind,
        model: modelSelection().model, imageKind: imageKindSelect?.value, labelWorkflow: readImageLabelWorkflow(),
        outputOptions: { ...selectedImageOutputOptions }, candidateId: result?.id, sourceId:original?.id || sourceId, layout:view?.layout },
      images: [original && { ...original, role: 'original' }, result && { ...result, data: localEraseController?.getDraft(result)?.data || result.data, role: 'result' }].filter(Boolean),
      errors: errorLog.snapshot() };
  }));
  // 11-21 사용자: 대화를 보내면 답이 올 때까지 대화창에 아무 변화가 없어 답하는 중인지 알 수 없었다.
  // 그림 생성 탭에서 대화 답을 기다리는 동안 답 자리에 빛이 흐르는 글자 + 시간에 따라 바뀌는 단계 글을 둔다.
  let chatThinkingNode = null, chatThinkingTimer = 0;
  const CHAT_THINKING_STEPS = [[0, '생각하는 중'], [4000, '말씀을 정리하는 중'], [10000, '그림 구성을 짜는 중'], [20000, '조금만 더 기다려 주세요']];
  function hideChatThinking() {
    if (chatThinkingTimer) { clearInterval(chatThinkingTimer); chatThinkingTimer = 0; }
    chatThinkingNode?.remove(); chatThinkingNode = null;
  }
  // 11-22: 「생성 결과 1를」 같은 조사 오류 — 끝 글자(한글 받침·숫자 읽기)로 을/를을 고른다.
  function objectParticle(word) {
    const last = String(word || '').trim().slice(-1);
    if (/[0-9]/.test(last)) return '2459'.includes(last) ? '를' : '을';
    if (/[가-힣]/.test(last)) return (last.charCodeAt(0) - 0xAC00) % 28 === 0 ? '를' : '을';
    return '을(를)';
  }
  function showChatThinking() {
    if (chatThinkingNode?.isConnected) return;
    hideChatThinking();
    const node = document.createElement('div');
    node.className = 'ai-msg assistant ai-chat-thinking'; node.dataset.aiChatThinking = ''; node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite');
    // 11-21 사용자 요청: 움직이는 점 아이콘 + 지금 하는 일 + 흐른 시간(「생각하는 중 · 12초」).
    const dots = document.createElement('span'); dots.className = 'ai-chat-thinking-dots'; dots.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 4; i++) dots.append(document.createElement('i'));
    const label = document.createElement('span'); label.className = 'ai-chat-thinking-text'; label.textContent = CHAT_THINKING_STEPS[0][1];
    const clock = document.createElement('span'); clock.className = 'ai-chat-thinking-time';
    node.append(dots, label, clock); log.appendChild(node); log.scrollTop = log.scrollHeight;
    const started = Date.now();
    const tick = () => {
      const elapsed = Date.now() - started;
      const text = [...CHAT_THINKING_STEPS].reverse().find(([at]) => elapsed >= at)[1];
      if (label.textContent !== text) label.textContent = text;
      const sec = Math.floor(elapsed / 1000);
      const t = sec >= 60 ? `${Math.floor(sec / 60)}분 ${sec % 60}초` : `${sec}초`;
      if (clock.textContent !== t) clock.textContent = t;
    };
    tick(); chatThinkingTimer = setInterval(tick, 500);
    chatThinkingNode = node;
  }
  const addLog = (text, kind = "assistant") => {
    if (!text) return null;
    const keepThinking = kind === 'user' && Boolean(chatThinkingNode);
    hideChatThinking();
    if (keepThinking) queueMicrotask(() => { if (busy && currentTurnType === 'chat' && panel.dataset.aiCreateUi === 'true') showChatThinking(); });
    if (kind === "error") { errorLog.record(text); text = safeAiErrorText(text); }
    if (text === APPROVED_FIRST_REQUEST || text === APPROVED_FIRST_PROMPT || text === SEPARATED_ASSETS_PROMPT) {
      text = "이미지 변환을 요청했습니다.";
      kind = "assistant";
    }
    log.querySelector("[data-ai-log-empty]")?.remove();
    const message = document.createElement("div");
    message.className = `ai-msg ${kind}`;
    // 11-22: AI 답의 **굵게** 표시가 별표째 보이던 것 — 별표 쌍만 굵은 글자로 바꾼다(나머지는 글 그대로, HTML로 읽지 않음).
    if (kind === 'assistant' && /\*\*[^*\n]+\*\*/.test(text)) {
      for (const [i, part] of String(text).split(/\*\*([^*\n]+)\*\*/).entries()) {
        if (!part) continue;
        if (i % 2) { const strong = document.createElement('strong'); strong.textContent = part; message.append(strong); }
        else message.append(document.createTextNode(part));
      }
    } else message.textContent = text;
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
  const setStatus = (text, kind = "", cause) => {
    if (kind === "error" && batchRun) batchRun.reject(cause || new Error(text));
    if (kind === "error") { errorLog.record(text, cause); text = safeAiErrorText(text); }
    status.textContent = text;
    status.title = text;
    status.dataset.kind = kind;
    status.setAttribute('role', kind === 'error' ? 'button' : 'status');
    status.tabIndex = kind === 'error' ? 0 : -1;
    if (kind === 'error') status.title = `${text} · 클릭하여 문제 신고`;
    if (busy && !insertingOutput && kind === "error") setTaskState("failed");
  };
  const reportStatusError = () => {
    if (status.dataset.kind === 'error') panel.dispatchEvent(new CustomEvent('5e:bug-report-open', { bubbles: true, detail: { trigger: status } }));
  };
  status.addEventListener('click', reportStatusError, { signal: lifecycle.signal });
  status.addEventListener('keydown', event => {
    if (status.dataset.kind === 'error' && ['Enter', ' '].includes(event.key)) { event.preventDefault(); reportStatusError(); }
  }, { signal: lifecycle.signal });
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
  if (sourceMenu) registerEscapeLayer(sourceMenu, () => closeSourceMenu({ restoreFocus: true }));
  const imageOutputSummary = () => {
    if (document.documentElement.dataset.mode === 'lite') {
      const background = selectedImageOutputOptions.backgroundPolicy === 'connected'
        ? '외부 배경 제거' : '배경 유지';
      const separation = selectedSeparationMode === AI_SEPARATION_MODES.AUTO
        ? '떨어진 물체 자동 분리' : '분리 사용 안 함';
      return `${background} · 평가원식 무채색 선화 · ${separation}`;
    }
    const background = {
      preserve: '흰 배경과 투명도를 원본대로 유지',
      connected: '물체 바깥의 흰색만 투명하게 처리',
      'all-near-white': '물체 안쪽을 포함한 모든 흰색을 투명하게 처리',
      checkerboard: '파일 픽셀에 그려진 반복 체크무늬를 찾아 투명하게 처리 (미리보기 격자 제외)',
    }[selectedImageOutputOptions.backgroundPolicy];
    const thickness = selectedImageOutputOptions.lineThickness
      ? `선 굵기 +${selectedImageOutputOptions.lineThickness}px` : '원본 굵기';
    const separation = {
      off: '객체 분리 안 함',
      auto: '객체 자동 감지',
      grid: '격자 기준 분리',
      manual: '영역 직접 지정',
    }[selectedSeparationMode];
    return `${background} · ${selectedImageOutputOptions.examPalette ? '평가원용 무채색으로 단순화' : '원본 색상 유지'} · ${thickness} · ${separation}`;
  };
  const applySeparationMode = mode => {
    const next = transitionSeparationMode({ separationMode: selectedSeparationMode, outputOptions: selectedImageOutputOptions, singleBackgroundPolicy }, mode);
    selectedSeparationMode = next.separationMode;
    if (document.documentElement.dataset.mode !== 'lite') {
      selectedAssetGenerationMode = selectedSeparationMode === AI_SEPARATION_MODES.OFF
        ? AI_ASSET_GENERATION_MODES.SINGLE : AI_ASSET_GENERATION_MODES.SEPARATED;
    }
    selectedImageOutputOptions = next.outputOptions;
    singleBackgroundPolicy = next.singleBackgroundPolicy;
  };
  const outputChoiceAllowed = (key, value) => canChooseLocalOutput(selectedOutputItem(), key, value, {
    mode: document.documentElement.dataset.mode, busy,
    readOnly: panel.dataset.aiSharingMode === 'view' || isGraphWorkflow(conversionKind),
    separationMode: selectedSeparationMode,
  });
  const localAppearanceAllowed = () => !busy && panel.dataset.aiSharingMode !== 'view'
    && !isGraphWorkflow(conversionKind) && (!selectedOutputItem() || isHistoricalPngLocalResult(selectedOutputItem()));
  const syncLegacyResultUi = () => {
    const item = selectedOutputItem();
    const eligible = isHistoricalPngLocalResult(item) && !isGraphWorkflow(conversionKind)
      && panel.dataset.aiSharingMode !== 'view';
    if (legacyResultSettings && legacyResultSettings.hidden !== !eligible) legacyResultSettings.hidden = !eligible;
    panel.dataset.aiLegacyResult = String(eligible);
    for (const button of legacyResultSettings?.querySelectorAll('[data-ai-legacy-pro-choice]') || []) {
      const nextHidden = document.documentElement.dataset.mode === 'lite';
      if (button.hidden !== nextHidden) button.hidden = nextHidden;
    }
    const hint = legacyResultSettings?.querySelector('[data-ai-legacy-background-lock]');
    const hintHidden = selectedSeparationMode === AI_SEPARATION_MODES.OFF;
    if (hint && hint.hidden !== hintHidden) hint.hidden = hintHidden;
    // Empty source preferences retain their real summary and separation lock.
    // A pending/completed or unknown candidate never owns this source-only slot.
    const sourceEligible = Boolean(sourceCompactSettings) && !busy && !item && generatedImages.length === 0
      && !isGraphWorkflow(conversionKind) && panel.dataset.aiSharingMode !== 'view';
    if (sourceProcessingFeedback.hidden !== !sourceEligible) sourceProcessingFeedback.hidden = !sourceEligible;
    const statusParent = eligible ? legacyResultSettings : sourceEligible ? sourceProcessingFeedback : outputStatusHome;
    if (outputProcessingStatus && statusParent && outputProcessingStatus.parentNode !== statusParent) {
      if (statusParent === outputStatusHome) outputStatusHome.insertBefore(outputProcessingStatus,
        outputStatusNext?.parentNode === outputStatusHome ? outputStatusNext : null);
      else statusParent.append(outputProcessingStatus);
    }
    const lockParent = sourceEligible ? sourceProcessingFeedback : backgroundLockHome;
    if (lockParent && backgroundLockHint.parentNode !== lockParent) {
      if (lockParent === backgroundLockHome) backgroundLockHome.insertBefore(backgroundLockHint,
        backgroundLockNext?.parentNode === backgroundLockHome ? backgroundLockNext : null);
      else lockParent.append(backgroundLockHint);
    }
  };
  const setOutputProcessingStatus = (text, item = null, revision = outputProcessingRevision) => {
    if (item && (revision !== outputProcessingRevision || item !== selectedOutputItem())) return;
    if (outputProcessingStatus) outputProcessingStatus.textContent = text;
  };
  const syncOutputProcessingUi = () => {
    syncLegacyResultUi();
    applySeparationMode(selectedSeparationMode);
    const backgroundLocked = selectedSeparationMode !== AI_SEPARATION_MODES.OFF;
    backgroundLockHint.hidden = !backgroundLocked;
    if (outputProcessing) outputProcessing.hidden = selectedOutputEngine === AI_OUTPUT_ENGINES.ASSET;
    if (backgroundPolicySelect) {
      const allWhite = backgroundPolicySelect.querySelector('[data-ai-legacy-all-white]');
      const advanced = isHistoricalPngLocalResult(selectedOutputItem()) && document.documentElement.dataset.mode !== 'lite';
      if (!allWhite && advanced) {
        const option = document.createElement('option'); option.value = 'all-near-white';
        option.textContent = '내부 흰색도 제거'; option.dataset.aiLegacyAllWhite = '';
        backgroundPolicySelect.append(option);
      } else if (allWhite) {
        allWhite.hidden = !advanced; allWhite.disabled = !advanced;
        if (!advanced && selectedImageOutputOptions.backgroundPolicy !== 'all-near-white') allWhite.remove();
      }
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
      backgroundPolicySelect.title = backgroundLocked ? SEPARATION_BACKGROUND_HINT : '';
      backgroundPolicySelect.setAttribute('aria-description', backgroundPolicySelect.title);
      const proxy = backgroundPolicySelect.nextElementSibling;
      if (proxy?.classList.contains('lite-ai-segment-group')) {
        proxy.title = backgroundPolicySelect.title;
        for (const button of proxy.querySelectorAll('button')) { button.disabled = backgroundPolicySelect.disabled; button.title = backgroundPolicySelect.title; }
      }
    }
    if (examPaletteSelect) {
      examPaletteSelect.value = String(selectedImageOutputOptions.examPalette);
      examPaletteSelect.disabled = busy;
    }
    if (lineThicknessSelect) {
      lineThicknessSelect.value = String(selectedImageOutputOptions.lineThickness);
      lineThicknessSelect.disabled = busy;
    }
    if (separationModeSelect) {
      separationModeSelect.value = selectedSeparationMode;
      separationModeSelect.disabled = busy;
    }
    setOutputProcessingStatus(`${imageOutputSummary()}${backgroundLocked ? ` · ${SEPARATION_BACKGROUND_HINT} ${SEPARATION_LIMITS_HINT}` : ''}`);
    compactSettings?.sync();
  };
  const resolveOutputVariant = (item) => {
    if (!item) return Promise.reject(new Error('선택한 결과가 없습니다.'));
    if (keepsRawImageOutput(item, selectedImageOutputOptions) || (panel.dataset.aiBoxEdit === 'true' && item === selectedOutputItem()
      && !isHistoricalPngLocalResult(item))) return Promise.resolve(item.data);

    const key = imageOutputOptionsKey(selectedImageOutputOptions);
    let variants = outputVariantCache.get(item);
    if (!variants) { variants = new Map(); outputVariantCache.set(item, variants); }
    if (!variants.has(key)) {
      const pending = resolveImageOutput(item, selectedImageOutputOptions, transparentizeGeneratedImage)
        .catch((error) => { variants.delete(key); throw error; });
      variants.set(key, pending);
    }
    return variants.get(key).then(source => requiresRawImageOutput(item) ? item.data : source, error => {
      if (requiresRawImageOutput(item)) return item.data;
      throw error;
    });
  };
  const renderOutputVariant = async (item, image, revision = outputProcessingRevision) => {
    if (disposed || !item || !image || item.kind !== 'generated' || item.sceneResult) return;
    const key = imageOutputOptionsKey(selectedImageOutputOptions);
    const taskId = activeTaskTabId;
    const original = item.data;
    const visibilityEpoch = localVisibilityEpoch;
    const isCurrent = () => !disposed && motion.isOpen() && visibilityEpoch === localVisibilityEpoch
      && revision === outputProcessingRevision && taskId === activeTaskTabId
      && key === imageOutputOptionsKey(selectedImageOutputOptions) && item.data === original
      && item.outputImage === image && generatedImages.includes(item);
    try {
      const source = await resolveOutputVariant(item);
      if (!isCurrent()) return;
      if (item.labelPlan?.frozen) await renderLabelPreview(item, source);
      else { const preview = localEraseController?.getDraft(item)?.data || source; if (image.src !== preview) image.src = preview; }
      if (!isCurrent()) return;
      image.classList.toggle('ai-output-transparent', !requiresRawImageOutput(item) && selectedImageOutputOptions.backgroundPolicy !== 'preserve');
      comparison?.update({ revisions: comparisonRevisions() });
      const backgroundLocked = selectedSeparationMode !== AI_SEPARATION_MODES.OFF;
      setOutputProcessingStatus(`${imageOutputSummary()}${backgroundLocked ? ` · ${SEPARATION_BACKGROUND_HINT} ${SEPARATION_LIMITS_HINT}` : ''}`, item, revision);
    } catch (error) {
      if (!isCurrent()) return;
      setOutputProcessingStatus(`결과 처리 실패: ${error.message}`, item, revision);
    }
  };
  const refreshOutputPreviews = () => {
    const revision = ++outputProcessingRevision;
    if (!generatedImages.some((item) => !item.sceneResult)) { syncOutputProcessingUi(); return; }
    syncLegacyResultUi();
    if (isHistoricalPngLocalResult(selectedOutputItem())) setOutputProcessingStatus('선택한 방식으로 결과를 처리하는 중…');
    else setOutputProcessingStatus(imageOutputSummary());
    for (const item of generatedImages) void renderOutputVariant(item, item.outputImage, revision);
  };
  const showWorkbench = () => {
    if (disposed) return;
    const opening = !motion.isOpen();
    motion.show();
    if (opening) refreshOutputPreviews();
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
  const dispatchReviewEvent = (detail, candidate = null, { restore = false } = {}) => {
    const normalized = {
      pixelInspection: detail?.pixelInspection || candidate?.pixelInspection || null,
      state: detail?.state || "idle",
      candidateId: detail?.candidateId || candidate?.id || null,
      report: detail?.report ? JSON.parse(JSON.stringify(detail.report)) : emptyReviewReport(),
      generationCount: Number(detail?.generationCount || 0),
      reviewCount: Number(detail?.reviewCount || 0),
      model: detail?.model || modelSelect.value,
      effort: detail?.effort || effortSelect.value,
      elapsedMs: Math.max(0, Number(detail?.elapsedMs || 0)),
    };
    const item = candidate || generatedImages.find((entry) => entry.id === normalized.candidateId);
    if (item) {
      // Restoring a view broadcasts its status; it is not a new review result.
      if (!restore) {
      item.reviewState = normalized.state;
      item.reviewReport = normalized.report;
      item.reviewMeta = {
        ...item.reviewMeta,
        generationCount: normalized.generationCount,
        reviewCount: normalized.reviewCount,
        model: normalized.model,
        effort: normalized.effort,
        elapsedMs: normalized.elapsedMs,
      };
      }
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
  const taskNeedsLabelReview = taskHasReviewNotice;
  const taskTimingLabel = (tab, view) => {
    const request = requestStates.snapshot(tab?.id);
    if (request) {
      const seconds = Math.floor(request.elapsedMs / 1000);
      const phase = taskNeedsLabelReview(tab) && request.phase === 'failed' ? '검수 확인 필요'
        : requestPhaseLabel(request.phase, { creating: isCreationWorkflow(tab?.conversionKind) });
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} · ${phase}`;
    }
    if (view?.available) return `${view.formatted}${taskNeedsLabelReview(tab) ? ' · 확인 사항' : ''}`;
    if (taskNeedsLabelReview(tab)) return '생성 완료 · 확인 사항';
    return (tab?.workState === "idle" && !(tab.generated?.length || tab.conversationMessages?.length)) ? "실행 전" : "시간 알 수 없음";
  };
  const updateTaskTimingLabels = (tab, label) => {
    const cachedLabel = taskRows.get(tab?.id)?.row.querySelector(".ai-task-tab-time");
    if (cachedLabel) cachedLabel.textContent = label;
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
    const request = requestStates.snapshot(activeTaskTabId);
    if (request) {
      const running = requestStates.live(request.token);
      if (progressStage) progressStage.textContent = requestPhaseLabel(request.phase, { detail: true });
      if (generating) generating.dataset.aiPhase = request.phase;
      const seconds = Math.floor(request.elapsedMs / 1000);
      const label = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      if (elapsedTime) { elapsedTime.textContent = label; elapsedTime.dateTime = `PT${seconds}S`; }
      if (tab) updateTaskTimingLabels(tab, taskTimingLabel(tab));
      if (request.elapsedMs >= 90_000 && request.phase === 'generating' && !newEngineRunActive) progressDetail.textContent = '90초 넘게 응답을 기다리고 있습니다. 취소할 수 있으며 자동 재시도하지 않습니다.';
      if (!running) stopGenerationTimingTimer();
      return { running, available: true, phase: request.phase, elapsedMs: request.elapsedMs, formatted: label };
    }
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
    if (view.running && view.elapsedMs >= 90_000 && !generationLongWaitShown && !newEngineRunActive) {
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
    if (!on) delete panel.dataset.loadingPending;
    generating.hidden = !on;
    progressTitle.textContent = title;
    progressDetail.textContent = detail;
    if (on && currentTurnType === "image" && awaitingTurnId) renderGenerationTiming({ pendingAcceptance: true });
    else renderGenerationTiming();
  };
  const loading = createWorkbenchLoading({ host: previews, legacy: generating, panel });
  disposalCallbacks.push(() => loading.destroy());
  let pendingLoading = null;
  const beginRequest = (type = 'image', loadingSource = null) => {
    delete taskTabs.get(activeTaskTabId)?.generationNotice;
    pendingLoading = null;
    loading.reset();
    requestToken = requestStates.begin(activeTaskTabId, selectedCandidateId);
    // 11-19(시안 태그 7): 그림 생성도 새 로딩 창. 첫 생성 바탕은 흐린 빈 종이(원본이 없어도 시작한다).
    if (type !== 'chat' && (!isCreationWorkflow(conversionKind) || conversionKind === 'graph-create' || conversionKind === 'image-create')) {
      const source = loadingSource || (conversionKind === 'image-create' ? blankPaper() : attachments.find(isInputReference)?.data || attachments[0]?.data);
      const selectedModel = isGraphWorkflow(conversionKind) ? GRAPH_WORKBENCH_SELECTION.model : modelSelect.value;
      const history = [...taskTabs.values()].filter(tab => (tab.conversionKind || 'image') === conversionKind && tab.model === selectedModel)
        .flatMap(tab => (tab.generated || []).map(item => item.workflowMetrics?.timings?.total || item.generationTiming?.elapsedMs));
      pendingLoading = { token: requestToken, source, kind: conversionKind === 'image-create' ? 'figure' : conversionKind, model: selectedModel, startedAt: Date.now(), expectedMs: estimateLoadingMs(conversionKind, selectedModel, history), ...(isGraphWorkflow(conversionKind) ? { plan: conversionKind, phased: true } : {}) };
      // 11-21: 새 로딩 창은 준비(연결·모델 확인)가 끝난 뒤 시작한다 — 그 사이 옛 진행 상자가 잠깐 비치던 것을 처음부터 숨긴다.
      panel.dataset.loadingPending = 'true';
    }
    // 11-22: 바로 그리기 때 앞 차례 종류(대화)가 남아 처음 2초 「대화 멈추기」·대화 기다림 표시가 잘못 떴다 — 바쁨 표시 전에 종류를 맞춘다.
    currentTurnType = type === 'chat' ? 'chat' : 'image';
    setBusy(true);
    stopGenerationTimingTimer();
    generationTimingTimer = setInterval(() => renderGenerationTiming(), 1_000);
    setGenerating(true, '요청을 준비하고 있습니다', '선택한 작업의 입력과 연결 상태를 확인합니다.');
    panel.dataset.aiRequestPhase = 'preparing';
    const token = requestToken;
    clearTimeout(requestTimeout);
    requestTimeout = setTimeout(() => {
      if (!requestStates.live(token) || requestToken !== token) return;
      if (requestStates.snapshot(token.taskId)?.phase === 'confirmation-wait') return;
      currentCancelRequested = true;
      scopedTransport?.fail(new Error('응답 시간이 초과되었습니다. 자동 재시도하지 않습니다.'));
      requestPhase('failed');
      currentRequestEpoch += 1;
      preflightRun = null;
      setTaskState('failed'); setGenerating(false); setBusy(false);
      setStatus('응답 시간이 초과되었습니다. 원본은 유지되며 자동 재시도하지 않습니다.', 'error');
      void desktop?.interrupt().catch(() => {});
    }, 180_000);
    return requestToken;
  };
  // 그림 생성이 새 결과를 못 냈어도 앞 결과 카드가 있으면 그것을 그대로 두고 끝난 것이다(작업 목록 「완료 · 앞 결과를 그대로 두었습니다」).
  const failedRequestPhase = () => currentTurnType === 'image' && conversionKind === 'image-create' && generatedImages.length ? 'kept-previous' : 'failed';
  // reason: 못 끝난 까닭('offline'·'login'·'ai') — 로딩 창이 까닭대로 말한다(생성만). 기다리는 단계는 까닭이 정해져 있다.
  const requestPhase = (phase, { reason = null } = {}) => {
    if (batchRun) void batchRun.emit({type:'progress',progress:{phase}}).catch(batchRun.reject);
    if (requestStates.advance(requestToken, phase)) {
      panel.dataset.aiRequestPhase = phase;
      if (phase !== 'preparing') delete panel.dataset.loadingPending; // 새 로딩이 넘겨받거나(generating) 다른 안내(로그인 기다림 등)로 바뀐다
      // 라벨 변환 작업은 단계 신호를 보낸다. 라벨 복원과 이미지만은 단계 구성이 다르다.
      if (phase === 'generating' && pendingLoading?.token === requestToken) loading.begin(currentRunInput?.loadingPlan ? { ...pendingLoading, plan: currentRunInput.loadingPlan, phased: true } : pendingLoading);
      if (phase === 'validating') { loading.setPhase('결과 확인 중'); loading.stage('validating'); }
      if (phase === 'completed' && pendingLoading?.token === requestToken && (panel.hidden || panel.inert) && conversionKind !== 'graph' && !hwpInPlaceTargets.has(activeTaskTabId)) {
        const tookMs = Date.now() - pendingLoading.startedAt;
        const graphJob = isGraphWorkflow(conversionKind);
        showDoneNotice({ title: graphJob ? '그래프가 다 만들어졌어요' : '그림 변환이 끝났어요', detail: `${Math.floor(tookMs / 60000)}:${String(Math.floor(tookMs / 1000) % 60).padStart(2, '0')} 걸림`, onOpen: () => showWorkbench(), ...(graphJob ? { anchor: document.getElementById('graph-tool-open') } : {}) });
      }
      if (isTerminalRequestPhase(phase)) {
        const candidate = currentTurnCandidate || generatedImages.at(-1);
        const ended = requestPhaseOutcome(phase);
        void loading.finish({ token: requestToken, outcome: ended.outcome, result: phase === 'completed' ? candidate?.data : null, reason: ended.reason || reason, resumes: ended.resumes });
        clearTimeout(requestTimeout); requestTimeout = null;
      }
      renderGenerationTiming();
    }
  };
  const setBusy = (on) => {
    if (!on && busy && !insertingOutput && requestStates.live(requestToken)) {
      const workState = taskTabs.get(activeTaskTabId)?.workState;
      if (currentCancelRequested) requestPhase('cancelled');
      else if (workState === 'completed' || (currentTerminalOutcome === 'completed' && !previewPending && (imageReceived || currentTurnType === 'chat'))) requestPhase('completed');
      else if (workState === 'failed' || currentTerminalOutcome === 'failed') requestPhase(failedRequestPhase());
    }
    busy = on;
    // 11-21: 그림 생성 탭에서 대화 답을 기다리는 동안 답 자리 표시(showChatThinking) — 끝나면 거둔다.
    if (on && panel.dataset.aiCreateUi === 'true' && currentTurnType === 'chat') showChatThinking(); else if (!on) hideChatThinking();
    if (on) closeSourceMenu();
    if (!insertingOutput) {
      if (on) setTaskState("busy");
      else if (taskTabs.get(activeTaskTabId)?.workState === "busy") setTaskState("idle");
    }
    panel.dataset.aiBusy = String(on);
    navigationChanged();
    const addTaskButton = panel.querySelector('[data-ai-task-add]');
    if (addTaskButton) addTaskButton.disabled = false;
    sendButton.disabled = on;
    input.disabled = on || (!isExamBrief(taskTabs.get(activeTaskTabId)) && isWhitePngWorkflow({ mode: selectedMode, outputEngine: selectedOutputEngine }) && generatedImages.length === 0);
    chatButton.disabled = on;
    if (chatInput) chatInput.disabled = on;
    if (newButton) newButton.disabled = false;
    for (const control of [modelSelect, effortSelect, speedSelect, modelRefreshButton, generationModeSelect, sourceMenuTrigger, ...sourceMenuActions, referenceSearchButton, captureButton, file, replaceSourceButton, replaceSourceFile, chatApplyButton, reviewModeCheckbox, preserveSourceLabels, ...markControls]) {
      if (control) control.disabled = on;
    }
    modeButtons.forEach((button) => { button.disabled = on; });
    qualityButtons.forEach((button) => { button.disabled = on; });
    outputEngineButtons.forEach((button) => { button.disabled = on; });
    syncOutputProcessingUi();
    syncReferenceSummary();
    if (batchButton) batchButton.disabled = on || attachments.length < 2 || (isWhitePngWorkflow({ mode: selectedMode, outputEngine: selectedOutputEngine }) && reviewModeCheckbox?.checked !== false);
    panel.querySelectorAll("[data-ai-input-mutator]").forEach((control) => { control.disabled = on; });
    retryInterruptedButton.disabled = on || !taskTabs.get(activeTaskTabId)?.retryRequest?.snapshot;
    panel.querySelectorAll('select[data-ai-reference-role]').forEach(control => { control.disabled = on || generatedImages.length > 0 || conversationMessages.length > 0; });
    const cancelButton = panel.querySelector("[data-ai-interrupt]");
    cancelButton.disabled = !on || insertingOutput;
    cancelButton.hidden = !on || insertingOutput;
    for (const item of generatedImages) syncEditableLabelPlanButton(item);
    syncSelectedOutputActions();
    commentController?.render();
  };
  const syncWhitePngUi = () => {
    const brief = isExamBrief(taskTabs.get(activeTaskTabId));
    panel.dataset.aiExamBrief = String(brief);
    const white = !brief && isWhitePngWorkflow({ mode: selectedMode, outputEngine: selectedOutputEngine });
    const fixedFirst = white && generatedImages.length === 0;
    const requestTitle = panel.querySelector("[data-ai-request-title]");
    const requestHint = panel.querySelector("[data-ai-request-hint]");
    const requestNote = panel.querySelector("[data-ai-request-note]");
    panel.dataset.aiFixedFirst = String(fixedFirst);
    const boxEdit = !brief && Boolean(selectedOutputItem() && !selectedOutputItem().sceneResult);
    if (scopedAdvanced) scopedAdvanced.hidden = !boxEdit || isGraphWorkflow(conversionKind);
    if (scopedPromptRow) scopedPromptRow.hidden = false;
    panel.dataset.aiBoxEdit = String(boxEdit);
    const requestTab = panel.querySelector('[data-ai-side-tab="comments"]');
    if (requestTab) requestTab.textContent = boxEdit ? '수정 요청' : '변환 설정';
    input.hidden = boxEdit;
    input.disabled = busy || boxEdit;
    if (requestNote) {
      requestNote.hidden = !fixedFirst && !boxEdit;
      if (boxEdit) requestNote.textContent = '박스를 그리고 각 박스에 요청을 적으세요. 박스 안에서도 요청한 부분만 수정하고, 박스 밖은 원본 그대로 유지합니다.';
    }
    if (requestTitle) requestTitle.textContent = brief && !boxEdit ? '물체와 배치' : fixedFirst ? "첫 변환" : "요청";
    if (requestHint) requestHint.textContent = brief && !boxEdit ? '짧게 적으면 평가원식 표현과 평면·입체 일관성을 자동으로 보강합니다.' : fixedFirst ? "고정된 평가원식 규칙으로 변환합니다." : "바꿀 내용만 간단히 적어 주세요.";
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
    // 11-09: 출처를 모르는 그림이면 변환 단추 자리에서 「출처를 골라 주세요」라고 알린다(누르면 출처 줄로 데려가고, 고르면 바로 변환).
    const needsSource = !boxEdit && !brief && !isGraphWorkflow(conversionKind) && !isCreationWorkflow(conversionKind)
      && attachments.some(item => item.referenceRole !== 'STYLE_REFERENCE') && Boolean(imageKindSelect) && !['exam', 'general'].includes(imageKindSelect.value);
    sendButton.textContent = boxEdit ? "다시 그리기 · 정밀" : brief ? '이미지 생성' : needsSource ? "출처를 골라 주세요" : "변환하기"; // 11-11: 결과가 있으면 다시 그리기(정밀)
    panel.dataset.aiNeedsSource = String(needsSource);
    commentController?.render();
    syncGraphWorkbenchUi();
    // V5: 그림 생성 탭에서는 위 옛 글(「이미지 생성」)이 그리기 단추를 덮지 않게 생성 화면 맞추기를 다시 건다(결과 목록을 열 때 「이 그림 고치기」가 바뀌던 문제).
    if (panel.dataset.aiCreateUi === 'true') { try { scheduleCreateSync(); } catch { /* 시작 중(생성 화면 준비 전) */ } }
  };
  const syncConversionSummary = () => {
    if (sourceLabelNote) sourceLabelNote.hidden = !readPreserveSourceLabels();
    if (!conversionSummary) return;
    const output = outputEngineButtons.find((button) => button.dataset.aiOutputEngine === selectedOutputEngine)?.textContent?.trim();
    const labels = modeButtons.find((button) => button.dataset.aiMode === selectedMode)?.textContent?.trim();
    const composition = generationModeSelect.selectedOptions[0]?.textContent?.trim();
    conversionSummary.textContent = [output, labels, readPreserveSourceLabels() ? "원본 라벨" : null, composition].filter(Boolean).join(" · ");
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
  const syncLiteModeUi = () => {
    const lite = document.documentElement.dataset.mode === 'lite';
    renderEmptyResult(previews?.querySelector('[data-ai-empty]'));
    const option = (select, value) => select?.querySelector(`option[value="${value}"]`);
    const offOption = option(separationModeSelect, AI_SEPARATION_MODES.OFF);
    const gridOption = option(separationModeSelect, AI_SEPARATION_MODES.GRID);
    const manualOption = option(separationModeSelect, AI_SEPARATION_MODES.MANUAL);
    const allWhiteOption = option(backgroundPolicySelect, 'all-near-white');
    for (const item of [gridOption, manualOption, allWhiteOption]) {
      if (!item) continue;
      item.hidden = lite;
      item.disabled = lite;
    }
    if (offOption) {
      offOption.hidden = false;
      offOption.disabled = false;
    }
    if (lite) {
      if (!liteHiddenOptionSnapshot) {
        liteHiddenOptionSnapshot = {
          mode: selectedMode,
          outputEngine: selectedOutputEngine,
          generationMode: selectedAssetGenerationMode,
          backgroundPolicy: selectedImageOutputOptions.backgroundPolicy,
          examPalette: selectedImageOutputOptions.examPalette,
          lineThickness: selectedImageOutputOptions.lineThickness,
          separationMode: selectedSeparationMode,
          singleBackgroundPolicy,
        };
      }
      selectedMode = KICE_IMAGE_MODE;
      selectedOutputEngine = KICE_IMAGE_OUTPUT_ENGINE;
      selectedAssetGenerationMode = AI_ASSET_GENERATION_MODES.SINGLE;
      selectedImageOutputOptions = normalizeImageOutputOptions({
        ...selectedImageOutputOptions,
        examPalette: true,
        lineThickness: 0,
        backgroundPolicy: liteBackgroundPolicy,
      });
      selectedSeparationMode = AI_SEPARATION_MODES.OFF;
      applySeparationMode(liteSeparationMode);
    } else {
      if (liteHiddenOptionSnapshot) {
        liteBackgroundPolicy = singleBackgroundPolicy;
        liteSeparationMode = selectedSeparationMode;
        selectedMode = liteHiddenOptionSnapshot.mode;
        selectedOutputEngine = liteHiddenOptionSnapshot.outputEngine;
        selectedAssetGenerationMode = liteHiddenOptionSnapshot.generationMode;
        selectedSeparationMode = liteHiddenOptionSnapshot.separationMode;
        singleBackgroundPolicy = liteHiddenOptionSnapshot.singleBackgroundPolicy;
        selectedImageOutputOptions = normalizeImageOutputOptions({
          ...selectedImageOutputOptions,
          backgroundPolicy: liteHiddenOptionSnapshot.backgroundPolicy,
          examPalette: liteHiddenOptionSnapshot.examPalette,
          lineThickness: liteHiddenOptionSnapshot.lineThickness,
        });
        liteHiddenOptionSnapshot = null;
      }
    }
    generationModeSelect.value = selectedAssetGenerationMode;
    syncMode();
    syncOutputEngine();
    syncOutputProcessingUi();
    syncSelectedOutputActions();
  };
  const syncReferenceSummary = () => {
    scheduleCreateSync(); // 레퍼런스가 생기거나 없어지면 결과만 보기·좌우 두 칸이 바뀐다(시안 태그 1·2)
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
    syncLegacyResultUi();
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

  const modelSelection = () => ({ model: modelSelect.value, effort: effortSelect.value, serviceTier: 'priority' });
  const catalogEntry = () => readAIModelCatalog(availableModels).find(item => item.model === modelSelect.value);
  const fillChoice = (control, choices, selected) => {
    control.replaceChildren(...choices.map(([value, label]) => new Option(label, value)));
    const value = selected == null ? '' : String(selected);
    if (![...control.options].some(option => option.value === value)) {
      const unavailable = new Option(`${value || '(없음)'} · 사용할 수 없음`, value);
      unavailable.disabled = true;
      control.add(unavailable);
    }
    control.value = value;
  };
  const syncModelWarning = () => {
    let message = '';
    try { resolveAIModelSelection(modelSelection(), availableModels); } catch (error) { message = error.message; }
    if (modelWarning) { modelWarning.textContent = message; modelWarning.hidden = !message; }
    for (const [control, value] of [[reviewModelSelect, modelSelect.value], [reviewEffortSelect, effortSelect.value]]) {
      if (control) { control.replaceChildren(new Option(value, value)); control.disabled = true; }
    }
    return message;
  };
  const populateEfforts = (value = effortSelect.value) => {
    let entry; try { entry = catalogEntry(); } catch {}
    fillChoice(effortSelect, (entry?.efforts || []).map(effort => [effort, effortLabels[effort] || effort]), value);
  };
  const populateSpeeds = () => {
    fillChoice(speedSelect, [['priority', '빠르게 · 고정']], 'priority');
  };
  const savedModelPreference = () => {
    const tab = taskTabs.get(activeTaskTabId) || {};
    const preference = {};
    for (const [field, key] of [['model', '5e.aiModel'], ['effort', '5e.aiEffort'], ['serviceTier', '5e.aiSpeed']]) {
      const saved = field === 'model' ? sessionStorage.getItem('5e.aiModelExplicit') : localStorage.getItem(key);
      if (Object.hasOwn(tab, field)) preference[field] = tab[field];
      else if (saved !== null) preference[field] = saved;
    }
    preference.serviceTier = 'priority';
    return preference;
  };
  const restoreModelChoices = () => {
    const preference = { ...savedModelPreference(), serviceTier: 'priority' };
    if (!['gpt-6.1-sol', 'gpt-6-luna'].includes(preference.model) && availableModels.some(item => (item.model || item.id) === 'gpt-6.1-sol')) preference.model = 'gpt-6.1-sol';
    let catalog = [], selection = preference;
    try { catalog = readAIModelCatalog(availableModels); selection = defaultAIModelSelection(availableModels, preference); }
    catch (error) { setStatus(aiErrorText(error), 'error', error); }
    fillChoice(modelSelect, catalog.map(item => [item.model, item.displayName]), selection.model);
    populateEfforts(selection.effort);
    populateSpeeds(selection.serviceTier);
    syncModelWarning();
    compactSettings?.sync();
  };
  const loadModels = async ({ refresh = false } = {}) => {
    if (!desktop?.models || (modelsLoaded && !refresh) || (refresh && busy)) return;
    try {
      const result = await desktop.models();
      availableModels = structuredClone(Array.isArray(result) ? result : result?.data || []);
      readAIModelCatalog(availableModels);
      modelsLoaded = true;
      restoreModelChoices();
    } catch (error) {
      restoreModelChoices();
      // PATHFIX: 「Error invoking remote method 'codex:models': Error: spawn codex ENOENT」 대신 한국어 안내(원문은 오류 기록에).
      if (aiErrorCode(error) === 'CODEX_NOT_FOUND') { showCodexInstall(true); setStatus(CODEX_MISSING_STATUS, 'warn'); reportAiError('codex:models', error); }
      else setStatus(aiErrorText(error), 'error', error);
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
      badge.textContent = String(commentDisplayNumber(item, comment));
      box.appendChild(badge);
      stage.appendChild(box);

      const row = document.createElement("div");
      row.className = "ai-comment-row";
      const number = document.createElement("span");
      number.textContent = String(commentDisplayNumber(item, comment));
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

  // 11-07 G9: 그래프 결과는 「편집기로 가져오기」(한글 그림 자리에서 연 작업은 예전처럼 「한글 파일에 넣기」).
  const graphToEditor = item => Boolean(item?.graphResult) && !hwpInPlaceTargets.has(activeTaskTabId);
  let forceGraphCanvas = false;
  const syncEditableLabelPlanButton = (item) => {
    const output = item?.card?.querySelector("[data-ai-canvas-output]");
    if (!output) return;
    const includeLabels = labelPreviewStates.get(item)?.included !== false;
    const count = includeLabels ? item.labelPlan?.labels?.length || 0 : 0;
    const review = includeLabels && item.labelPlan?.reviewRequired === true;
    const accepted = Boolean(item.data || item.graphResult || item.sceneResult) && item.removalReport?.status !== 'out-of-scope';
    output.disabled = busy || !accepted;
    if (graphToEditor(item)) { output.textContent = GRAPH_TO_EDITOR_LABEL; output.title = GRAPH_TO_EDITOR_TITLE; if (!accepted) output.title = '가져올 결과를 선택하세요.'; return; }
    output.textContent = `${count ? `캔버스에 삽입 · 라벨 ${count}개` : "캔버스에 삽입"}${review ? " · 확인" : ""}`;
    output.title = !includeLabels && item.labelPlan?.labels?.length
      ? '라벨을 숨긴 현재 이미지만 넣습니다. 라벨 계획은 보존됩니다.'
      : count
      ? `이미지와 이동·수정·삭제 가능한 자동 라벨 ${count}개를 함께 넣습니다.${review ? " 라벨 위치와 제외 항목을 확인해 주세요." : ""}`
      : review ? "확인되지 않은 라벨은 제외되어 이미지만 넣습니다. 필요한 라벨을 확인해 주세요."
      : item.labelPlan?.status === "unavailable" ? "자동 라벨 계획을 확인하지 못해 이미지만 넣습니다." : "캔버스에 삽입";
    if (!accepted) output.title = '삽입할 결과를 선택하세요.';
  };

  const attachEditableLabelPlan = (item, plan) => {
    if (!item || !plan) return;
    item.labelPlan = JSON.parse(JSON.stringify(plan));
    syncEditableLabelPlanButton(item);
    ensureCompositePreviewControl(item);
    if (pendingCacheOutput) pendingCacheOutput = { ...pendingCacheOutput, labelPlan: JSON.parse(JSON.stringify(plan)) };
    captureActiveTaskTab();
    syncSelectedOutputActions();
    persistTasks();
  };

  const beginSourceLabelReview = async (candidate, eventEpoch) => {
    const run = currentRunInput;
    const unchanged = () => eventEpoch === currentRequestEpoch && !currentCancelRequested && candidate === currentReviewCandidate;
    const capturedData = candidate.data;
    handleReviewLifecycle({ state: 'reviewing', candidateId: candidate.id, generationCount: 1, reviewCount: 1 }, candidate);
    try {
      const report = await reviewSourceLabelCandidate({ controller: sourceLabelReview, run, candidate,
        request: currentRequestSnapshot?.request || '', isCurrent: unchanged });
      if (!unchanged()) return;
      if (candidate.data !== capturedData) throw new Error('검수 도중 후보 이미지가 변경되어 결과 확인이 필요합니다.');
      const gated = enforcePngAcceptance({ state: report.verdict === 'pass' ? 'passed' : 'needs-attention', report }, candidate);
      attachEditableLabelPlan(candidate, { ...run.frozenLabelPlan, qualityReview: gated.report, status: gated.state === 'passed' ? 'ready' : 'review', reviewRequired: gated.state !== 'passed' });
      handleReviewLifecycle({ ...gated, candidateId: candidate.id, generationCount: 1, reviewCount: 1,
        model: run.model, effort: run.effort, elapsedMs: Date.now() - currentTurnStartedAt }, candidate);
    } catch (error) {
      if (!unchanged()) return;
      handleReviewLifecycle({ state: 'needs-attention', candidateId: candidate.id,
        report: { verdict: 'uncertain', checks: [], issues: [{ message: error.message || String(error), severity: 'major' }] },
        generationCount: 1, reviewCount: 1 }, candidate);
    }
  };

  // Presentation state is independent of the frozen plan and QA composite/hash.
  const labelPreviewStates = new WeakMap();
  const candidateViewportPositions = new WeakMap();
  function rememberCandidatePosition(item) {
    const card = item?.card;
    if (card?.isConnected && card.getClientRects().length) {
      candidateViewportPositions.set(item, { left: card.scrollLeft, top: card.scrollTop });
    }
  }
  // Version controls hide the old card before emitting candidate-select. Capture
  // its position while it is still displayed, including click/keyboard selection.
  panel.addEventListener('click', event => {
    if (event.target.closest?.('[data-ai-candidate-option]')) rememberCandidatePosition(selectedOutputItem());
  }, { capture: true, signal: lifecycle.signal });
  panel.addEventListener('5e:ai-workbench-geometry-change', () => rememberCandidatePosition(selectedOutputItem()), { signal: lifecycle.signal });
  const effectiveLabelPlan = item => localEraseController?.getDraft(item)?.labelPlan
    || (localEraseController?.getDraft(item) ? localEditableLabelPlan(item) : item?.labelPlan);
  const hasPreviewLabels = item => effectiveLabelPlan(item)?.frozen && effectiveLabelPlan(item).labels?.some(label => label.scope !== 'graph');
  function labelPreviewState(item) {
    if (!labelPreviewStates.has(item)) labelPreviewStates.set(item, { included: true, revision: 0 });
    return labelPreviewStates.get(item);
  }
  function ensureCompositePreviewControl(item) {
    if (!item?.card || !item.labelPlan?.frozen) return;
    labelPreviewState(item);
    syncLabelViewControls();
  }
  function syncLabelViewControls() {
    const item = selectedOutputItem();
    const view = panel.querySelector('[data-ai-label-view]');
    if (!view) return;
    // The same compact slot is present for no-label images. Showing/hiding the
    // result toolbar used to change the fitted image's available height.
    view.hidden = isGraphWorkflow(conversionKind);
    const available = Boolean(hasPreviewLabels(item));
    const included = available && labelPreviewState(item).included !== false;
    if (labelToggle) {
      labelToggle.disabled = !available || busy;
      labelToggle.setAttribute('aria-checked', String(included));
      labelToggle.querySelector('[data-ai-label-toggle-state]').textContent = included ? 'ON' : 'OFF';
      labelToggle.title = available ? '현재 수정본의 편집 라벨을 표시하거나 숨깁니다.' : '이 수정본에는 편집 라벨이 없습니다.';
    }
    for (const button of view.querySelectorAll('[data-ai-label-view-mode]')) {
      button.setAttribute('aria-pressed', String((button.dataset.aiLabelViewMode === 'included') === included));
    }
    localEraseController?.refresh();
    inlineLabelEditor?.refresh();
  }
  async function renderLabelPreview(item, resolvedSource) {
    const image = item?.card?.querySelector('.ai-preview-stage > img');
    const display = labelPreviewState(item);
    if (!image || !display) return;
    const revision = ++display.revision, data = item.data, plan = effectiveLabelPlan(item);
    const current = () => !disposed && item.card?.contains(image) && item.data === data
      && JSON.stringify(effectiveLabelPlan(item)) === JSON.stringify(plan) && display.revision === revision;
    const present = async source => {
      if (image.src !== source) {
        const readyImage = new Image(); readyImage.src = source;
        await readyImage.decode();
      }
      if (!current()) return;
      if (image.src !== source) image.src = source;
      inlineLabelEditor?.presented(item);
    };
    try {
      const source = localEraseController?.getDraft(item)?.data || resolvedSource || await resolveOutputVariant(item);
      if (!current()) return;
      if (inlineLabelEditor?.activeFor(item) || !display.included || !hasPreviewLabels(item)) {
        if (inlineLabelEditor?.activeFor(item)) {
          // Keep the composed preview until its live replacement has both fonts
          // and bitmap ready. The first painted editor frame uses final metrics.
          await inlineLabelEditor.prepare(item);
          if (!current()) return;
        }
        await present(source); return;
      }
      const artboard = { ...state.get().artboard }, artboardKey = `${artboard.w}:${artboard.h}`;
      if (display.source !== source || display.plan !== plan || display.artboardKey !== artboardKey || !display.pending) {
        display.source = source; display.plan = plan; display.artboardKey = artboardKey;
        const pending = createEditableLabelComposite({ plan, candidateDataUrl: source, artboard, signal: lifecycle.signal });
        display.pending = pending;
        pending.catch(() => { if (display.pending === pending) display.pending = null; });
      }
      const composite = await display.pending;
      if (!current()) return;
      await present(composite.attachment.data);
    } catch (error) {
      if (current()) { setStatus(error.message || '라벨 미리보기를 만들지 못했습니다.', 'warn'); }
    }
  }
  panel.querySelector('[data-ai-label-view]')?.addEventListener('click', event => {
    const button = event.target.closest('[data-ai-label-view-mode]');
    const toggle = event.target.closest('[data-ai-label-toggle]');
    const item = selectedOutputItem();
    if ((!button && !toggle) || !hasPreviewLabels(item) || busy) return;
    localEraseController?.cancel();
    const display = labelPreviewState(item);
    const next = toggle ? !display.included : button.dataset.aiLabelViewMode === 'included';
    if (display.included === next) return;
    display.included = next;
    if (!next) inlineLabelEditor?.close();
    syncEditableLabelPlanButton(item);
    syncLabelViewControls(); syncSelectedOutputActions(); void renderLabelPreview(item);
    captureActiveTaskTab(); persistTasks();
  });

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
      if (item.labelPlan?.frozen) card.dataset.aiSourceLabels = 'true';
      card.dataset.aiGenerationMode = candidateUsesSeparatedAssets(item)
        ? AI_ASSET_GENERATION_MODES.SEPARATED : AI_ASSET_GENERATION_MODES.SINGLE;
    }
    item.card = card;
    if (item.kind === 'generated') card.addEventListener('scroll', () => rememberCandidatePosition(item), { passive: true, signal: lifecycle.signal });
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
    remove.onclick = async () => {
      if (busy) return;
      // 11-11 사용자: 맥 기본 확인창 대신 5E 확인창.
      if (!await showConfirm(`‘${item.name}’ 이미지를 작업에서 뺄까요? 원본 파일은 지우지 않습니다.`, { title: '이미지 빼기', okText: '빼기', cancelText: '취소' })) return;
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
        renderEmptyResult(empty);
        previews.appendChild(empty);
      }
    };
    head.appendChild(remove);

    const stage = document.createElement("div");
    stage.className = "ai-preview-stage";
    const img = document.createElement("img");
    img.draggable = false;
    img.src = item.data;
    img.alt = item.name;
    if (item.kind === 'generated') {
      item.outputImage = img;
      void renderOutputVariant(item, img);
    }
    stage.appendChild(img);
    if (item.graphResult) {
      // 11-07 G9: 결과 위 「그래프 세부 편집」은 아래 「편집기로 가져오기」와 하는 일이 같아 뺐다.
      // 한글 그림 자리에서 연 작업(그 창에는 「편집기로 가져오기」가 없다)만 예전처럼 남긴다.
      const graphEdit = document.createElement('button');
      graphEdit.type='button';graphEdit.dataset.aiGraphEdit='';graphEdit.className='ai-graph-edit-hint';graphEdit.textContent='그래프 세부 편집';
      graphEdit.disabled=busy || panel.dataset.aiSharingMode==='view';
      graphEdit.hidden = !hwpInPlaceTargets.has(activeTaskTabId);
      graphEdit.onclick=()=>{if(!busy && panel.dataset.aiSharingMode!=='view')void editGraphCandidate(item);};
      stage.addEventListener('dblclick', event => {
        if (event.target.closest('button,input,select,textarea')) return;
        const bounds = img.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
        event.preventDefault(); event.stopPropagation();
        if (busy || panel.dataset.aiSharingMode === 'view') return;
        // 두 번 누르기 = 「편집기로 가져오기」(한글 그림 자리 작업은 예전 세부 편집).
        if (graphToEditor(item)) void editGraphCandidate(item, { toCanvas:true }); else graphEdit.click();
      });
      stage.append(graphEdit);
    }
    if (item.kind === "generated") {
      const output = document.createElement("button");
      output.type = "button";
      output.className = "ai-canvas-output";
      output.dataset.aiCanvasOutput = "";
      output.textContent = "캔버스에 삽입";
      output.title = "캔버스에 삽입";
      output.onclick = () => {
        if (busy || output.disabled) return;
        // 11-07 G9: 그래프 결과는 캔버스에 바로 넣지 않고 그래프 편집기로 가져온다(편집기에서 캔버스로 내보내기·한글에 넣기).
        // 11-11: 「캔버스에 넣기」(data-ai-graph-canvas)로 누른 경우는 편집기를 거치지 않고 바로 캔버스에 넣는다.
        if (graphToEditor(item) && !forceGraphCanvas) { if (panel.dataset.aiSharingMode !== 'view') void editGraphCandidate(item, { toCanvas:true }); return; }
        const includeLabels = labelPreviewState(item).included !== false;
        const labelCount = includeLabels ? item.labelPlan?.labels?.length || 0 : 0;
        if (candidateUsesSeparatedAssets(item) && selectedSeparationMode !== AI_SEPARATION_MODES.OFF) { void openGroupsForItem(item, true, false, true); return; }
        if (candidateUsesAutomaticSeparation(item) && selectedSeparationMode !== AI_SEPARATION_MODES.OFF) {
          void openGroupsForItem(item, false, selectedSeparationMode === AI_SEPARATION_MODES.MANUAL || item.automaticSeparationState === 'fallback', true);
          return;
        }
        if (!item.graphResult && item.sceneResult?.objects?.length) {
          try {
            const inserted = insertFastSceneIntoState(state, item.sceneResult);
            state.update((draft) => {
              for (const object of draft.objects) {
                if (!inserted.ids.includes(object.id)) continue;
                object.aiTaskId = activeTaskTabId;
                object.aiCandidateId = item.id;
              }
            });
            addLog(`편집 가능한 벡터 오브젝트 ${inserted.added}개를 캔버스에 출력했습니다.`);
            close({ integratedEdit: true });
          } catch (error) {
            addLog(`캔버스 출력 실패: ${error.message}`, "error");
          }
          return;
        }
        const target=state.get().selectedIds?.length === 1 ? state.get().objects.find(o=>state.get().selectedIds?.includes(o.id)&&o.type==="image"&&!o.editableAssetRegionId&&o.aiTaskId===activeTaskTabId) : null;
        // 11-11: 5E 확인창(비동기) — 예를 누르면 같은 단추 동작을 「확인됨」으로 다시 부른다(검사가 이 본문을 떼어 쓰므로 async로 바꾸지 않음).
        const replaceConfirmed = output.dataset?.replaceConfirmed === 'true'; if (output.dataset) delete output.dataset.replaceConfirmed;
        if (target && !replaceConfirmed) { void showConfirm(`선택한 페이지 이미지를 이 버전으로 교체할까요? 위치와 크기는 유지하고 기존 자동 라벨은 ${labelCount ? `새 라벨 ${labelCount}개로 교체` : "제거"}합니다. 취소하면 아무것도 변경하지 않습니다.`, { title: '이미지 교체', okText: '교체', cancelText: '취소' }).then(ok => { if (ok) { output.dataset.replaceConfirmed = 'true'; output.onclick(); } }); return; }
        const replace = Boolean(target);
        const taskId = activeTaskTabId;
        const candidateId = item.id;
        const candidateSource = item.data;
        const outputKey = imageOutputOptionsKey(selectedImageOutputOptions);
        const pageContext = state.capturePageContext?.();
        const visibilityEpoch = localVisibilityEpoch;
        const isCurrent = () => !disposed && motion.isOpen() && visibilityEpoch === localVisibilityEpoch && taskId === activeTaskTabId
          && outputKey === imageOutputOptionsKey(selectedImageOutputOptions)
          && includeLabels === (labelPreviewState(item).included !== false)
          && selectedOutputItem() === item && item.id === candidateId && item.data === candidateSource
          && (!pageContext || state.isPageContextCurrent?.(pageContext) === true);
        insertingOutput = true;
        setBusy(true);
        setStatus(replace ? '페이지 이미지를 교체하는 중…' : '페이지에 이미지를 넣는 중…', 'busy');
        output.disabled=true;
        const footerInsert = panel.querySelector('[data-ai-insert-selected]');
        if (footerInsert) footerInsert.disabled = true;
        void Promise.resolve(item.graphResult ? null : resolveOutputVariant(item))
          .then(async data => {
            if (!isCurrent()) throw new Error('결과를 준비하는 동안 페이지·작업 또는 후보가 변경되었습니다.');
            if (item.imageLabelWorkflow?.explicit && await imageLabelDigest(item.data) !== item.candidateSha256) throw new Error('검수한 RAW 후보와 삽입 후보가 다릅니다. 원본은 유지했습니다.');
            if (!isCurrent()) throw new Error('삽입 후보의 검수 상태가 변경되었습니다.');
            // Preserve the candidate's full plan; only the emitted native
            // objects follow the label choice currently shown in the preview.
            return materializeCandidate(item.graphResult ? item : {...item,labelPlan:includeLabels ? item.labelPlan : null,...(!includeLabels ? {editableDraft:null} : {})}, {taskId,replaceId:replace?target.id:null,isCurrent,userOutput:true,...(!item.graphResult ? {dataOverride:data} : {})});
          })
          .then(id => {
            addLog(labelCount ? `이미지와 편집 가능한 자동 라벨 ${labelCount}개를 페이지에 넣었습니다.` : "이미지를 페이지에 넣었습니다.");
            const inserted = state.get().objects.find(object => object.id === (id.imageId || id.planeId));
            const placementIssues = inserted?.aiReviewReport?.issues?.filter(issue => issue.code?.startsWith('label-placement-')) || [];
            captureActiveTaskTab(); persistTasks(); close({ integratedEdit: true });
            if (placementIssues.length) void showAlert(placementIssues.map(issue => issue.message).join('\n')
              + '\n라벨은 더블클릭해 수정하고 이동할 수 있습니다.', { title: '라벨 배치 확인' });
          })
          .catch((error)=>{setStatus(`페이지 삽입 실패: ${error.message}`, 'error');addLog(`페이지 삽입 실패: ${error.message}`,"error");})
          .finally(()=>{setBusy(false);insertingOutput=false;syncEditableLabelPlanButton(item);});
      };
      output.hidden = true; output.tabIndex = -1;
      stage.appendChild(output);
      syncEditableLabelPlanButton(item);
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
    if (item.kind === "generated" && (!item.sceneResult || item.graphResult)) {
      const savePng = document.createElement("button");
      savePng.type = "button";
      savePng.dataset.aiSaveCandidate = '';
      savePng.textContent = "PNG 저장";
      savePng.title = "현재 생성 결과를 PNG 파일로 저장";
      savePng.onclick = async () => {
        if (busy || savePng.disabled) return;
        const taskId = activeTaskTabId, visibilityEpoch = localVisibilityEpoch;
        const originalData = item.data, selectedAtStart = selectedOutputItem() === item;
        const outputKey = imageOutputOptionsKey(selectedImageOutputOptions);
        const labelOutput = item.labelPlan?.frozen ? { planKey:JSON.stringify(item.labelPlan),
          included:labelPreviewState(item).included !== false,artboard:{...state.get().artboard} } : null;
        const isSaveCurrent = () => !disposed && taskId === activeTaskTabId && visibilityEpoch === localVisibilityEpoch
          && item.data === originalData && generatedImages.includes(item)
          && outputKey === imageOutputOptionsKey(selectedImageOutputOptions)
          && (!selectedAtStart || selectedOutputItem() === item)
          && (!labelOutput || JSON.stringify(item.labelPlan) === labelOutput.planKey
            && (labelPreviewState(item).included !== false) === labelOutput.included
            && !localEraseController.getDraft(item)
            && state.get().artboard.w === labelOutput.artboard.w && state.get().artboard.h === labelOutput.artboard.h);
        const footerSave = panel.querySelector('[data-ai-save-selected]');
        savePng.disabled = true;
        if (footerSave) footerSave.disabled = true;
        try {
          const link = document.createElement("a");
          const safeName = String(item.name || "평가원식-선화").replace(/[\\/:*?"<>|]+/g, "-");
          const source = item.graphResult ? await workbenchGraphDataUrl(item.graphResult) : await resolveOutputVariant(item);
          if (busy || !isSaveCurrent()) return;
          const bitmap = item.graphResult ? source : requiresRawImageOutput(item) ? item.data : source;
          const plan = labelOutput?.included && hasPreviewLabels(item) ? manualLabelPlan(item) : null;
          const result = item.graphResult || plan
            ? await visibleImagePng({data:bitmap,plan,artboard:labelOutput?.artboard,isCurrent:() => !busy && isSaveCurrent()}) : bitmap;
          if (busy || !isSaveCurrent()) return;
          link.href = result;
          link.download = `${safeName}.png`;
          link.click();
          setStatus('현재 보이는 이미지와 라벨을 PNG로 저장했습니다.', 'ok');
        } catch (error) {
          if (busy || !isSaveCurrent()) return;
          setStatus(`PNG 저장 실패: ${error.message}`, 'error');
        } finally {
          savePng.disabled = disposed;
          if (isSaveCurrent()) syncSelectedOutputActions();
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
    // The stage becomes queryable from item.card only after this append.
    if (item.kind === 'generated') syncEditableLabelPlanButton(item);
    ensureCompositePreviewControl(item);
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
      && isHistoricalPngLocalResult(run.item)
      && run.taskId === activeTaskTabId && run.separationMode === selectedSeparationMode
      && selectedOutputItem() === run.item;
  }

  function rememberAutomaticSeparation(key, prepared) {
    automaticSeparationCache.delete(key);
    automaticSeparationCache.set(key, prepared);
    while (automaticSeparationCache.size > 2) automaticSeparationCache.delete(automaticSeparationCache.keys().next().value);
  }

  function startAutomaticSeparation(item) {
    if (panel.dataset.aiSharingMode === 'view') return Promise.resolve(null);
    if (!candidateUsesAutomaticSeparation(item)) return Promise.resolve(null);
    if ([AI_SEPARATION_MODES.OFF, AI_SEPARATION_MODES.MANUAL].includes(selectedSeparationMode)) return Promise.resolve(null);
    if (automaticSeparationRun?.item === item) return automaticSeparationRun.promise;
    abortAutomaticSeparation('result-replaced');
    const controller = new AbortController();
    const previous = {
      key: item.automaticSeparationKey,
      state: item.automaticSeparationState,
      prepared: item.automaticSeparationPrepared,
      source: item.automaticSeparationSource,
    };
    const separationOptions = separationOptionsForMode(selectedSeparationMode);
    const run = { controller, item, taskId: activeTaskTabId, separationMode: selectedSeparationMode, promise: null };
    automaticSeparationRun = run;
    run.promise = (async () => {
      try {
        const outputOptions = normalizeImageOutputOptions(selectedImageOutputOptions);
        const effectiveSource = await resolveOutputVariant(item);
        if (!automaticSeparationIsCurrent(run)) return null;
        const key = await automaticSeparationCacheKey(effectiveSource, outputOptions, separationOptions);
        if (!automaticSeparationIsCurrent(run)) return null;
        if (previous.key === key && previous.source === effectiveSource) {
          if (previous.state === 'ready' && previous.prepared) return previous.prepared;
          if (previous.state === 'fallback') return null;
        }
        item.automaticSeparationState = 'preparing';
        item.automaticSeparationPrepared = null;
        item.automaticSeparationError = '';
        syncSelectedOutputActions();
        item.automaticSeparationKey = key;
        item.automaticSeparationSource = effectiveSource;
        let prepared = automaticSeparationCache.get(key);
        item.automaticSeparationCacheHit = Boolean(prepared);
        if (!prepared) {
          prepared = await prepareSeparatedAssets(effectiveSource, { ...separationOptions, signal: controller.signal });
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
    if (!candidateUsesAutomaticSeparation(item)) { syncSelectedOutputActions(); return; }
    item.automaticSeparationState = 'idle';
    item.automaticSeparationPrepared = null;
    item.automaticSeparationKey = '';
    item.automaticSeparationCacheHit = false;
    if ([AI_SEPARATION_MODES.OFF, AI_SEPARATION_MODES.MANUAL].includes(selectedSeparationMode)) syncSelectedOutputActions();
    else void startAutomaticSeparation(item);
  }

  function candidateAlreadyInserted(item) {
    return Boolean(item && state.get().objects?.some(object => object.aiTaskId === activeTaskTabId
      && object.aiCandidateId === item.id && object.editableAssetRegionId));
  }

  async function openGroupsForItem(item, separated = false, manual = false, useResult = false) {
    if (!isHistoricalPngLocalResult(item)) { setStatus('이 결과는 원본을 그대로 사용합니다. 저장된 그림 처리로 분리할 수 없습니다.', 'warn'); return; }
    // 11-09: 검수 통과는 묻지 않는다. 지금 그림이 이 작업이 만든 그림인지(지문)만 먼저 확인한다(다시 연 작업도 여기서 확인됨).
    if (!await verifyImageLabelCandidateBytes(item)) { setStatus('결과 그림이 이 작업에서 만든 그림과 달라 분리하지 않았습니다. 다시 변환하면 새 결과로 분리할 수 있습니다.', 'warn'); return; }
    const epoch = currentRequestEpoch;
    const taskId = activeTaskTabId;
    const candidateId = item.id;
    const source = item.data;
    const outputKey = imageOutputOptionsKey(selectedImageOutputOptions);
    const separationMode = selectedSeparationMode;
    const pageId = state.get().activePageId;
    const pageSnapshot = () => JSON.stringify({ objects: state.get().objects, artboard: state.get().artboard, layer: state.get().activeLayerId });
    const originalPage = pageSnapshot();
    const visibilityEpoch = localVisibilityEpoch;
    const isCurrent = () => !disposed && motion.isOpen() && visibilityEpoch === localVisibilityEpoch && !busy && epoch === currentRequestEpoch && taskId === activeTaskTabId
      && outputKey === imageOutputOptionsKey(selectedImageOutputOptions) && separationMode === selectedSeparationMode
      && selectedOutputItem()?.id === candidateId && selectedOutputItem()?.data === source
      && isHistoricalPngLocalResult(item) && isAdoptableImageLabelCandidate(item)
      && state.get().activePageId === pageId && pageSnapshot() === originalPage;
    try {
      if (!await verifyImageLabelCandidateBytes(item) || !isCurrent()) throw new Error('분리하는 동안 결과 그림이나 작업이 바뀌어 적용하지 않았습니다. 원본은 유지했습니다.');
      if (separated) {
        item.separatedAssetsError = '';
        captureActiveTaskTab();
        persistTasks();
      }
      setStatus(separated ? '분리 결과를 확인하는 중…' : manual ? '직접 지정할 영역을 준비하는 중…' : '편집용 그룹을 준비하는 중…', 'busy');
      const initialPrepared = manual ? null : await startAutomaticSeparation(item);
      if (item.labelPlan?.labels?.length) await prepareEditableLabelFonts(item.labelPlan.labels);
      if (!isCurrent()) throw new Error('분리 결과를 준비하는 동안 페이지·작업 또는 후보가 변경되었습니다.');
      if (useResult && initialPrepared) {
        if (!await verifyImageLabelCandidateBytes(item) || !isCurrent()) throw new Error('검수한 RAW 후보가 변경되어 분리 결과를 적용하지 않았습니다.');
        const prepared = { ...initialPrepared, labelsDisabled: true };
        const inserted = candidateAlreadyInserted(item) || insertEditableAssets(state, prepared, {
          isCurrent, aiTaskId: taskId, aiCandidateId: candidateId, editableLabelPlan: item.labelPlan,
        });
        if (inserted) { captureActiveTaskTab(); persistTasks(); close({ integratedEdit: true }); }
        return;
      }
      const dialogSource = await resolveOutputVariant(item);
      const inserted = await openEditableAssetsDialog({
        dataUrl: dialogSource, isCurrent, artboard: { ...state.get().artboard }, initialPrepared,
        onInsert: async prepared => {
          if (!await verifyImageLabelCandidateBytes(item) || !isCurrent()) throw new Error('검수한 RAW 후보가 변경되어 분리 결과를 적용하지 않았습니다.');
          return candidateAlreadyInserted(item) || insertEditableAssets(state, prepared, {
            isCurrent, aiTaskId: taskId, aiCandidateId: candidateId, editableLabelPlan: item.labelPlan,
          });
        },
      });
      if (inserted) { captureActiveTaskTab(); persistTasks(); close({ integratedEdit: true }); }
      else if (isCurrent()) setStatus('원본 PNG를 유지했습니다.', 'ok');
    } catch (error) {
      const message = error.message || String(error);
      if (separated && isHistoricalPngLocalResult(item)) {
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
    scheduleCreateSync();
    const item = selectedOutputItem();
    const outputBusy = busy || isLocalSavePending(item);
    syncLabelViewControls();
    generationModeSelect.value = selectedSeparationMode === AI_SEPARATION_MODES.OFF
      ? AI_ASSET_GENERATION_MODES.SINGLE : AI_ASSET_GENERATION_MODES.SEPARATED;
    generationModeRow.querySelector('small').textContent = item
      ? `추가 AI 요청 없이 현재 선택 결과를 기기에서 분리합니다. ${SEPARATION_LIMITS_HINT}`
      : `최대 16개 · ${SEPARATION_LIMITS_HINT}`;
    const comparisonCount = allImages().length;
    compareButton.hidden = false;
    compareButton.disabled = comparisonCount < 2;
    compareButton.title = comparisonCount < 2
      ? '첫 결과가 준비되면 원본과 비교할 수 있습니다.'
      : '이 화면에서 원본과 생성 결과를 겹쳐 비교합니다.';
    if (comparison && comparisonCount < 2) closeComparison();
    const save = panel.querySelector('[data-ai-save-selected]');
    const copy = panel.querySelector('[data-ai-copy-selected]');
    if (copy) copy.disabled = outputBusy || !item || Boolean(item.sceneResult && !item.graphResult) || copy.dataset.copyPending === 'true';
    const insert = panel.querySelector('[data-ai-insert-selected]');
    const examSend = panel.querySelector('[data-ai-exam-send]');
    if (examSend) {
      examSend.disabled = outputBusy || !item;
      const inPlace = hwpInPlaceTargets.has(activeTaskTabId);
      // 11-06: 한글 그림 편집에서 연 작업은 고친 뒤 바로 한글로 — 보내기 단추는 「클립보드로 복사」「한글 파일에 넣기」 두 개만.
      panel.dataset.aiHwpInPlace = String(inPlace);
      // D1: 한글에서 연 AI 창은 전환 줄 없이 제목만 — 「AI 이미지 / AI 그래프 · 한글 n번 그림에서 엶」.
      syncSurfaceTitle();
      if (copy) copy.textContent = inPlace ? '클립보드로 복사' : '이미지 복사';
      const examCardTarget = Boolean(hwpInPlaceTargets.get(activeTaskTabId)?.examCard);
      examSend.textContent = inPlace ? (examCardTarget ? '문항 카드에 넣기' : '한글 파일에 넣기') : '한글로 보내기';
      // 11-11 사용자: 결과는 저절로 넣지 않고 확인 뒤 직접 누른다 — 그래서 눌러야 할 단추를 눈에 띄게.
      examSend.classList.toggle('is-suggested', inPlace && !!item && !outputBusy);
      examSend.title = inPlace ? '고른 결과를 한글 시험지의 원래 그림 자리에 같은 폭으로 넣습니다(원래 그림은 「그림으로 되돌리기」로 돌아갈 수 있음).' : '현재 선택한 결과의 영역을 확인해 한글 문서에 넣습니다. 작업별 연결을 보존합니다.';
    }
    const scoped = panel.querySelector('[data-ai-scoped-edit-selected]');
    const groups = panel.querySelector('[data-ai-editable-groups]');
    const recovery = panel.querySelector('[data-ai-separated-recovery]');
    const outputNote = panel.querySelector('[data-ai-selected-output-note]');
    const nextAction = separatedCandidateNextAction(item);
    if (groups) {
      const automatic = candidateUsesAutomaticSeparation(item) && selectedSeparationMode !== AI_SEPARATION_MODES.OFF;
      const manual = automatic && selectedSeparationMode === AI_SEPARATION_MODES.MANUAL;
      const automaticState = manual ? 'manual' : automatic ? (item.automaticSeparationState || 'idle') : '';
      groups.hidden = selectedSeparationMode === AI_SEPARATION_MODES.OFF || isGraphWorkflow(conversionKind);
      groups.disabled = outputBusy || !isHistoricalPngLocalResult(item) || !isAdoptableImageLabelCandidate(item) || selectedSeparationMode === AI_SEPARATION_MODES.OFF || automaticState === 'preparing';
      groups.dataset.aiSeparationState = automaticState;
      groups.dataset.aiSeparationKey = automatic ? (item.automaticSeparationKey || '') : '';
      groups.dataset.aiSeparationCacheHit = automatic ? String(item.automaticSeparationCacheHit === true) : '';
      groups.dataset.aiSeparatedCount = automatic && item.automaticSeparationPrepared?.assets?.length
        ? String(item.automaticSeparationPrepared.assets.length) : '';
      groups.textContent = '결과 확인';
      groups.title = selectedSeparationMode === AI_SEPARATION_MODES.OFF
        ? '객체 분리를 켜면 분리된 영역과 개별 PNG를 확인·조정할 수 있습니다.'
        : '분리된 영역과 개별 PNG를 확인·조정합니다.';
    }
    if (recovery) {
      recovery.hidden = true;
      recovery.disabled = outputBusy || nextAction !== 'manual-regions';
    }
    if (outputNote) {
      outputNote.hidden = !isHistoricalPngLocalResult(item) || selectedSeparationMode === AI_SEPARATION_MODES.OFF;
      outputNote.textContent = item?.automaticSeparationState === 'preparing'
        ? '기기에서 물체를 분리하는 중…'
        : item?.automaticSeparationState === 'ready'
        ? `${item.automaticSeparationPrepared.assets.length}개 물체를 분리했습니다. 결과 확인에서 번호별 영역과 개별 PNG를 확인하세요.`
        : item?.automaticSeparationState === 'fallback'
        ? `자동 분리를 완료하지 못했습니다: ${item.automaticSeparationError} 영역을 직접 지정해 분리할 수 있습니다.`
        : nextAction === 'manual-regions'
        ? `자동 분리 실패: ${item.separatedAssetsError} 원본 PNG의 배경은 아직 제거되지 않았습니다. 아래 버튼에서 영역을 직접 지정해 분리할 수 있습니다.`
        : '분리된 물체를 확인한 뒤 결과를 사용할 수 있습니다.';
    }
    if (scoped) scoped.disabled = outputBusy || !item || Boolean(item.sceneResult);
    if (save) save.disabled = outputBusy || !item || Boolean(item.sceneResult && !item.graphResult);
    for (const graphEdit of panel.querySelectorAll('.ai-graph-edit-hint')) {
      const active = graphEdit.closest('[data-ai-candidate-id]')?.dataset.aiCandidateId === item?.id && hwpInPlaceTargets.has(activeTaskTabId);
      graphEdit.hidden = !active;
      if (active) graphEdit.dataset.aiGraphEdit = '';
      else delete graphEdit.dataset.aiGraphEdit;
      graphEdit.disabled = busy || panel.dataset.aiSharingMode === 'view';
    }
    if (isGraphWorkflow(conversionKind)) {
      if (groups) groups.hidden = true;
      if (scoped) scoped.hidden = true;
      if (save) { save.hidden = false; save.textContent = 'PNG 저장'; }
      if (outputNote) {
        outputNote.hidden = true;
        outputNote.textContent = item?.graphResult ? [...summarizeAnalyticGraph(item.graphResult.plan).lines,'더블클릭 또는 「편집기로 가져오기」로 축·곡선·표기를 조정할 수 있습니다.'].join('\n') : '';
        outputNote.style.whiteSpace = 'pre-line';
      }
    } else {
      if (scoped) scoped.hidden = false;
      if (save) {save.hidden = false;save.textContent = 'PNG 저장';}
    }
    const details=panel.querySelector('[data-ai-output-details]');
    if(details) details.hidden=!isGraphWorkflow(conversionKind) || !item?.graphResult;
    if (insert) {
      // 「범위 밖 · 원본 보존」 결과(라벨 복원 대상 0개)는 승인된 복원이 아니다 — 캔버스에 넣지 못하게 끈다(검사 workflow unlabeled exam, 10-26).
      const sourcePreserved = item?.removalReport?.status === 'out-of-scope';
      insert.disabled = outputBusy || !item || sourcePreserved || Boolean(item.card?.querySelector('.ai-canvas-output')?.disabled);
      // 라벨 표시를 끈 결과는 라벨 없이 넣는다 — 설명도 카드 단추(syncEditableLabelPlanButton)와 같게 그 선택을 따른다(10-28).
      const includeLabels = !item || labelPreviewStates.get(item)?.included !== false;
      const labelCount = includeLabels ? item?.labelPlan?.labels?.length || 0 : 0;
      const labelReview = includeLabels && item?.labelPlan?.reviewRequired === true;
      insert.textContent = '캔버스에 삽입';
      insert.hidden = false;
      if (graphToEditor(item) || (!item && isGraphWorkflow(conversionKind))) {
        insert.textContent = GRAPH_TO_EDITOR_LABEL; insert.title = GRAPH_TO_EDITOR_TITLE;
        insert.setAttribute('aria-label', insert.textContent);
      } else {
      insert.title = !includeLabels && item?.labelPlan?.labels?.length
        ? '라벨을 숨긴 현재 이미지만 넣습니다. 라벨 계획은 보존됩니다.'
        : labelCount
        ? `이미지와 이동·수정·삭제 가능한 자동 라벨 ${labelCount}개를 함께 넣습니다.${labelReview ? ' 라벨 위치와 제외 항목을 확인해 주세요.' : ''}`
        : labelReview ? '확인되지 않은 라벨은 제외되어 이미지만 넣습니다. 필요한 라벨을 확인해 주세요.'
        : item?.labelPlan?.status === 'unavailable' ? '자동 라벨 계획을 확인하지 못해 이미지만 넣습니다.' : '캔버스에 삽입';
      insert.setAttribute('aria-label', insert.textContent);
      }
    }
    const draft = panel.querySelector('[data-ai-edit-review-draft]');
    if (draft) {
      draft.hidden = true;
      draft.disabled = outputBusy || !canEditLabelReviewDraft(item);
      draft.textContent = item?.editableDraft?.presentation === 'external-list' ? '라벨 목록 편집' : '캔버스에서 편집';
      draft.title = item?.editableDraft?.presentation === 'external-list'
        ? '원본을 그대로 두고 그림 밖에 편집 가능한 라벨 목록을 넣습니다. 원본의 글자는 아직 남아 있습니다.'
        : '미검수 라벨 초안을 넣습니다. 위치·문구·연결을 확인해 주세요.';
    }
    const verifyDraft = panel.querySelector('[data-ai-verify-label-draft]');
    if (verifyDraft) {
      verifyDraft.hidden = !(item?.imageLabelWorkflow?.imageKind === 'general' && item?.labelPlan?.frozen
        && item?.sourceLabelPlan?.frozen && item?.reviewReport?.issues?.some(issue => issue.code === 'optional-review-not-run'));
      verifyDraft.disabled = busy || verifyDraft.hidden;
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
      const finish = value => { if (settled) return; settled = true; window.removeEventListener('5e:ai-workspace-activate', show); lifecycle.signal.removeEventListener('abort', aborted); batchSignal?.removeEventListener('abort', aborted); content?.dispose?.(); dialog.close(); dialog.remove(); resolve(value); };
      const batchSignal=batchRun?.context.signal;
      const aborted = () => finish(false);
      const show = () => {
        if (settled || panel.hidden || dialog.open) return;
        dialog.showModal();
        (defaultAccept ? ok : cancel).focus();
      };
      cancel.onclick = () => finish(false); ok.onclick = () => finish(true);
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
      const actions = document.createElement('div'); actions.className = 'ai-confirm-actions';
      ok.className = 'ai-confirm-accept'; actions.append(cancel, ok);
      dialog.append(actions);
      dialog.addEventListener('keydown', event => {
        if (event.key !== 'Tab') return;
        const controls=Array.from(dialog.querySelectorAll('button,input,select,textarea,[tabindex]'))
          .filter(control=>!control.disabled&&control.tabIndex>=0&&control.getClientRects().length);
        const target = dialogFocusTarget(document.activeElement, controls, event.shiftKey);
        if (!target) return;
        event.preventDefault();
        target.focus();
      });
      panel.append(dialog);
      window.addEventListener('5e:ai-workspace-activate', show);
      lifecycle.signal.addEventListener('abort', aborted, { once: true });
      batchSignal?.addEventListener('abort', aborted, { once: true });
      if(batchSignal?.aborted) aborted(); else show();
    });
  }
  function syncGraphWorkbenchUi() {
    const graph = isGraphWorkflow(conversionKind);
    const graphCreate = conversionKind === 'graph-create';
    syncSurfaceTitle();
    const graphTarget = selectedOutputItem()?.graphResult ? selectedOutputItem() : null;
    const brief = !graph && isExamBrief(taskTabs.get(activeTaskTabId));
    const fixedModel=panel.querySelector('[data-ai-fixed-model]'); if(fixedModel)fixedModel.hidden=!graph;
    panel.dataset.aiWorkflow = conversionKind;
    panel.dataset.aiCreation = String(isCreationWorkflow(conversionKind));
    const rail = panel.querySelector('.ai-task-rail');
    rail?.setAttribute('aria-label', graph ? '그래프 작업대' : '이미지 작업대');
    const railTitle = rail?.querySelector('.ai-rail-heading > strong');
    if (railTitle) railTitle.textContent = graph ? '그래프 작업대' : '이미지 작업대';
    panel.querySelector('[data-ai-tabs]')?.setAttribute('aria-label', graph ? '그래프 작업대' : '이미지 작업대');
    // 11-11: 실행 단추(data-ai-send)도 data-ai-comments-apply를 갖게 됐으므로, 그래프에서 숨기는 것은 예전 「코멘트 반영」 단추만.
    const repeat=panel.querySelector('[data-ai-comments-apply]:not([data-ai-send])');
    if(repeat) repeat.hidden=graph;
    sendButton.hidden=false;
    panel.querySelectorAll('[data-ai-workflow]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.aiWorkflow === conversionKind)); button.disabled = panel.dataset.aiSharingMode === 'view' || (busy && !switchWorkflow); });
    if (graph) {
      sendButton.textContent = graphCreate ? '그래프 생성' : '그래프 복원'; // 11-11: 공통 실행 글자
      sendButton.title = graphTarget ? `${graphTarget.name}에 추가 설명을 반영해 새 수정본을 만듭니다. 이전 결과도 유지됩니다.` : graphCreate ? '설명을 편집 가능한 그래프로 만듭니다.' : '원본과 수정 요청으로 편집 가능한 그래프를 복원합니다.';
      input.hidden = false; input.disabled = busy;
      input.placeholder = graphTarget ? '예: B만 점선으로 바꿔줘. 수식과 다른 표기는 유지해줘.' : graphCreate ? '예: 가로축 시간, 세로축 속도. 처음에는 직선으로 증가하다가 일정해짐. 숫자 없이.' : '예: 축 제목을 바꾸고, B 곡선의 점선을 더 굵게 해 주세요.';
      input.setAttribute('aria-label', graphCreate ? '그래프 설명' : '그래프 복원·수정 요청');
      const note = panel.querySelector('[data-ai-request-note]'); if (note) note.hidden = true;
    } else {
      // 11-12: 그래프 화면에서 돌아와도 그래프용 설명이 남고, 이미지 생성에서도 「변환합니다」로 보이던 것 — 화면마다 맞춤.
      sendButton.title = brief || conversionKind === 'image-create' ? '대화 내용으로 새 그림을 만듭니다.' : '대화와 코멘트를 반영해 새 이미지로 변환합니다.';
      input.placeholder = brief ? '예: 빗면 위에 네모 A, 왼쪽 아래에 각도 θ' : '예: 숫자와 단위를 지우고 평가원식 흑백 선화로 정리해 주세요.';
      input.setAttribute('aria-label', brief ? '물체와 배치 설명' : '이미지 수정 요청');
    }
    const compact = panel.querySelector('[data-ai-compact-settings]'); if (compact) compact.hidden = graph;
    // 11-11: 공통 구조 — 캡션(그림 설정·대화), 라벨 복원 행은 「이미지 생성」에서 숨김, 대화 자리표시 글.
    const caption = panel.querySelector('[data-ai-conversation-caption]'); if (caption) caption.textContent = graph ? '대화' : '그림 설정';
    const labelRow = panel.querySelector('[data-ai-label-row]'); if (labelRow) labelRow.hidden = brief || graph;
    const hasResult = Boolean(selectedOutputItem());
    if (chatInput) chatInput.placeholder = graph ? (graphCreate ? '어떤 그래프가 필요한지 말해 주세요' : '바꿀 조건이 있으면 말해 주세요 (선택)')
      : conversionKind === 'image-create' ? '어떤 그림이 필요한지 말해 주세요' : hasResult ? '고칠 내용을 말해 주세요 · 박스로 표시하면 그 안만 고칩니다' : '변환 전에 상의할 말 (선택)';
    const labelControl = panel.querySelector('.ai-source-label-control'); if (labelControl) labelControl.hidden = graph;
    const title = panel.querySelector('[data-ai-request-title]'); if (graph && title) title.textContent = graphTarget ? '추가 수정' : '그래프 요청';
    const hint = panel.querySelector('[data-ai-request-hint]'); if (graph && hint) hint.textContent = graphTarget ? `수정 대상: ${graphTarget.name}. 바꿀 내용만 적으세요. 이전 결과는 수정본 목록에 남습니다.` : graphCreate ? '축과 모양을 짧게 설명하세요. 수식·좌표도 입력할 수 있고, 생성 후 세부 편집으로 조정합니다.' : '원본을 편집 가능한 그래프로 복원합니다. 바꿀 조건도 함께 적을 수 있습니다.';
    const options = panel.querySelector('.ai-conversion-options'); if (options) options.hidden = true;
    // 10-22 A-3: 이미지 생성·그래프 생성도 좌우 두 칸 — 왼쪽 「레퍼런스」(그래프 생성은 「참고 그래프」), 오른쪽 「결과」.
    const creation = isCreationWorkflow(conversionKind), refName = graphCreate ? '참고 그래프' : '레퍼런스';
    const setText = (selector, text) => { const node = panel.querySelector(selector); if (node && node.textContent !== text) node.textContent = text; };
    setText('.ai-original-pane .ai-pane-metadata > strong', creation ? refName : '원본');
    setText('.ai-result-pane .ai-pane-metadata > strong', creation ? '결과' : '수정본');
    setText('.ai-compare-controls [data-ai-layout-mode="source"]', creation ? refName : '원본');
    setText('.ai-compare-controls [data-ai-layout-mode="result"]', creation ? '결과' : '수정본');
    // 빈 칸 안내는 제목·설명 글만 바꾼다(안의 「이미지 불러오기」 선택 메뉴는 그대로 — 통째로 글을 바꾸면 메뉴가 지워졌다).
    setText('[data-ai-reference-empty] > strong', creation ? `${refName}(선택 사항 · 최대 ${CREATION_REFERENCE_LIMIT}개)` : '작업할 이미지를 추가하세요');
    setText('[data-ai-reference-empty] > span', creation ? '모양·배치·화풍을 참고합니다. 그대로 베끼지 않고, 오른쪽 설명이 우선합니다.' : '라이브러리에서 고르거나, 이미지를 끌어놓으세요.');
    const refSummary = panel.querySelector('.ai-reference-section > summary')?.firstChild; if (refSummary?.nodeType === 3) refSummary.nodeValue = creation ? `${refName} ` : '원본 이미지 ';
    const addLabel = panel.querySelector('[data-ai-source-menu-trigger] .ds-glyph-plus')?.nextSibling; if (addLabel?.nodeType === 3) addLabel.nodeValue = creation ? ` ${refName} 추가 ` : ' 소스 추가 ';
    const processing = panel.querySelector('[data-ai-output-processing]'); if (processing) processing.hidden = graph;
    for (const control of [modelSelect, effortSelect, speedSelect]) if (control?.closest('label')) control.closest('label').hidden = true;
    modelRefreshButton.hidden = false; if (graph && modelWarning) { let message=''; try { resolveAIModelSelection(GRAPH_WORKBENCH_SELECTION,availableModels); } catch(error) { message=modelsLoaded ? `그래프는 Sol 6.1 / medium으로 실행합니다. ${error.message}` : ''; } modelWarning.textContent=message; modelWarning.hidden=!message; }
    const connectionSummary=panel.querySelector('[data-ai-account-tokens]'); if(graph && connectionSummary) connectionSummary.title='편집 그래프: Sol 6.1 / medium 고정';
    if (conversionSummary && graph) conversionSummary.textContent = '편집 가능한 그래프';
    scheduleCreateSync();
  }

  function switchConversionKind(kind) {
    if (switchWorkflow && AI_WORKFLOW_KINDS.includes(kind) && kind !== conversionKind && panel.dataset.aiSharingMode !== 'view') {
      void switchWorkflow(kind).catch(error => setStatus(error.message, 'error'));
      return;
    }
    if (!AI_WORKFLOW_KINDS.includes(kind) || kind === conversionKind || busy || graphSubmitting || panel.dataset.aiSharingMode === 'view') return;
    if (attachments.length || generatedImages.length || conversationMessages.length) {
      const sources = attachments.map(snapshotImageItem), hwpTarget = hwpInPlaceTargets.get(activeTaskTabId);
      createTaskTab({ kind });
      for (const source of sources) addReferenceData(source);
      // 11-11: 한글 그림에서 연 작업을 이미지↔그래프로 바꿔도 한글 연결을 그대로 잇는다.
      if (hwpTarget) { hwpInPlaceTargets.set(activeTaskTabId, { ...structuredClone(hwpTarget), kind: isGraphWorkflow(kind) ? 'graph' : 'image' }); notifyHwpTask(activeTaskTabId, 'idle'); }
    } else { conversionKind = kind; }
    syncLiteModeUi(); syncWhitePngUi(); syncGraphWorkbenchUi(); syncSelectedOutputActions();
    captureActiveTaskTab(); persistTasks();
  }
  panel.querySelectorAll('[data-ai-workflow]').forEach(button => button.addEventListener('click', () => switchConversionKind(button.dataset.aiWorkflow)));

  async function editGraphCandidate(item, { toCanvas = false } = {}) {
    if (busy || panel.dataset.aiSharingMode === 'view' || !item?.graphResult) return;
    const taskId = activeTaskTabId, original = item.graphResult;
    // 11-07 G9: 「편집기로 가져오기」 — AI 창을 닫고 결과가 채워진 그래프 편집기를 연다. 편집기에서 「캔버스로 내보내기」 하면
    // (바뀐 것이 있으면 수정본으로 남기고) 그 결과를 캔버스에 넣는다. 「한글에 넣기」는 넣은 그래프를 이어서 한글로 보낸다.
    if (toCanvas) close({ integratedEdit: true });
    const owner = taskTabs.get(taskId), ownerEpoch = graphOwnerEpoch;
    const ownsTask = () => !disposed && graphOwnerEpoch === ownerEpoch && taskTabs.get(taskId) === owner;
    let reference = original.objects?.find(o => o.type === 'coordplane')?.graphTrace?.reference || original.graphTrace?.reference || original.traceReference || null;
    try {
      if (!reference) {
        const source = attachments.find(source => source.id === original.source?.id && isInputReference(source));
        if (source?.data && await graphSourceHash(source.data) === original.source.hash) reference = { data:source.data, name:source.name, width:original.source.width, height:original.source.height, plotBox:structuredClone(original.plan.source.plotBox) };
      }
      if (!ownsTask() || taskId !== activeTaskTabId || !generatedImages.includes(item) || item.graphResult !== original) return;
      editWorkbenchGraph(original, { reference, ...(toCanvas ? { destination: {} } : {}), onApply: edited => {
      if (!ownsTask() || taskId !== activeTaskTabId || !generatedImages.includes(item) || item.graphResult !== original) return;
      if (toCanvas && JSON.stringify(edited.objects) === JSON.stringify(original.objects) && JSON.stringify(edited.groups || []) === JSON.stringify(original.groups || [])) return placeGraphCandidate(item, taskId);
      const candidate = { ...snapshotImageItem(item), id:`generated-${++imageSerial}`, name:`그래프 수정본 ${generatedImages.length + 1}`,
        graphResult:edited, sceneResult:{valid:true,supported:true,objects:edited.objects},
        graphEdit:{parentCandidateId:item.id,createdAt:new Date().toISOString()},
        createdAt:new Date().toISOString(), comments:[],nextCommentNumber:1,
        reviewState:'needs-attention',reviewReport:{verdict:'uncertain',checks:[],issues:[]} };
      // Append and persist native objects before asynchronous rendering. Previous
      // candidate pixels, graph objects and review logs stay unchanged.
      generatedImages.push(candidate);selectedCandidateId=candidate.id;latestGeneratedSrc=candidate.data;
      panel.dataset.aiSelectedCandidateId=candidate.id;
      previews.prepend(makeImageCard(candidate));
      panel.dispatchEvent(new CustomEvent('5e:ai-candidate-select',{detail:{candidateId:candidate.id}}));
      closeComparison();syncSelectedOutputActions();captureActiveTaskTab();persistTasks();
      setStatus('새 그래프 수정본을 만들고 있습니다.', 'info');
      const nativeFingerprint = JSON.stringify(edited);
      const liveRevision = () => {
        if (!ownsTask()) return null;
        const liveItems = activeTaskTabId === taskId ? generatedImages : taskViews.get(taskId)?.generatedImages;
        const live = liveItems?.find(value => value.id === candidate.id) || owner.generated?.find(value => value.id === candidate.id);
        return live && JSON.stringify(live.graphResult) === nativeFingerprint ? live : null;
      };
      void (async () => {
        const data = await workbenchGraphDataUrl(edited), live = liveRevision();
        if (!live) return;
        live.data = data; if (live.outputImage) live.outputImage.src = data;
        owner.generated = (owner.generated || []).map(value => value.id === candidate.id ? taskItemCopy(live) : value);
        if (activeTaskTabId === taskId) {
          if (selectedCandidateId === candidate.id) { latestGeneratedSrc = data; closeComparison(); }
          dispatchReviewEvent({state:'needs-attention',candidateId:live.id,report:live.reviewReport},live);
          captureActiveTaskTab(); syncSelectedOutputActions();
        }
        if (!liveRevision()) return;
        await taskPersistence.checkpoint();
        if (liveRevision() && activeTaskTabId === taskId) setStatus('그래프 편집을 적용했습니다. 수정본 목록에서 이전 결과와 비교하세요.', 'ok');
      })().catch(error => {
        if (liveRevision() && activeTaskTabId === taskId) setStatus('새 수정본의 편집 내용은 유지했습니다. 미리보기 갱신 실패: ' + error.message,'error');
      });
      if (toCanvas) return placeGraphCandidate(candidate, taskId);
    } }); } catch (error) { if (ownsTask() && activeTaskTabId === taskId) setStatus(error.message, 'error'); }
  }
  // 편집기에서 「캔버스로 내보내기」: 고른(또는 방금 만든) 수정본을 캔버스에 넣는다. 넣은 그래프 자리를 돌려줘 「한글에 넣기」가 이어 쓴다.
  function placeGraphCandidate(candidate, taskId) {
    const pageId = state.get().activePageId;
    return Promise.resolve(materializeCandidate(candidate, { taskId, userOutput:true, isCurrent:() => !disposed }))
      .then(result => { addLog('그래프를 캔버스에 넣었습니다.'); captureActiveTaskTab(); persistTasks(); return { pageId, planeId:result?.planeId, ids:result?.ids }; })
      .catch(error => { addLog(`캔버스 삽입 실패: ${error.message}`, 'error'); void showAlert(`그래프를 캔버스에 넣지 못했습니다.\n${error.message}`); return null; });
  }
  function syncSurfaceTitle() {
    // 11-07 G2·G4: 창의 모양은 지금 작업 종류가 정한다 — 이미지 작업이면 「AI 이미지」(이미지 탭 둘), 그래프 작업이면 「그래프 · AI」(그래프 탭 둘).
    const graph = isGraphWorkflow(conversionKind);
    const mode = graph ? 'graph' : 'image';
    if (panel.dataset.aiMode !== mode) panel.dataset.aiMode = mode;
    // 11-12: 두 번째부터의 작업대는 복제하며 id에 꼬리표가 붙는다(ai-image-title-<scope>) — 원래 id로만 찾아 제목·한글 연결 줄이 늘 「AI 이미지」로 남았다.
    const title = panel.querySelector('#ai-image-title, [id^="ai-image-title-"]');
    const target = hwpInPlaceTargets.get(activeTaskTabId);
    // 11-11: 제목은 「AI 이미지」「AI 그래프」만 쓴다(5E_ 표기 없음). 한글에서 열었을 때만 뒤에 출처를 붙인다.
    // 11-11 사용자 「말줄임표는 뭐냐」: 제목은 「AI 이미지」「AI 그래프」만, 어디에 이어졌는지는 아래 작은 줄로 따로(왼쪽 칸 폭에 잘리지 않게).
    const text = graph ? 'AI 그래프' : 'AI 이미지';
    const linkText = target ? `↳ ${target.examCard ? '문항 카드' : '한글'} · ${target.label || '그림'}` : '';
    // 11-11: 제목은 오브젝트 창처럼 아이콘 + 글자. 끌기 손잡이(modal-drag)는 그대로 둔다.
    if (title) {
      let label = title.querySelector('[data-ai-title-text]');
      if (!label) {
        for (const node of [...title.childNodes]) if (node.nodeType === 3) node.remove();
        const icon = document.createElement('span'); icon.className = 'ai-title-icon'; icon.setAttribute('aria-hidden', 'true');
        label = document.createElement('span'); label.dataset.aiTitleText = '';
        title.append(icon, label);
      }
      if (title.dataset.aiTitleIcon !== mode) {
        title.querySelector('.ai-title-icon').innerHTML = graph ? AI_TITLE_ICON_GRAPH : AI_TITLE_ICON_IMAGE;
        title.dataset.aiTitleIcon = mode;
      }
      if (label.textContent !== text) label.textContent = text;
      let link = title.querySelector('[data-ai-title-link]');
      if (!link) { link = document.createElement('span'); link.dataset.aiTitleLink = ''; label.after(link); }
      if (link.textContent !== linkText) link.textContent = linkText;
      link.hidden = !linkText;
      // 11-17(시안 b17): 연결 줄이 두 줄로 넘어가면 머리 줄을 한 줄만큼 늘린다(제목이 위아래 줄에 걸치지 않게).
      const head = title.closest('.ai-head');
      if (head) {
        const lines = linkText && link.getBoundingClientRect().height > parseFloat(getComputedStyle(link).lineHeight) * 1.5 ? '2' : '';
        if ((head.dataset.aiLinkLines || '') !== lines) { if (lines) head.dataset.aiLinkLines = lines; else delete head.dataset.aiLinkLines; }
      }
      const full = linkText ? `${text} — ${target.examCard ? '문항 카드' : '한글'} ${target.label || '그림'}에서 열었습니다. 결과를 확인한 뒤 「${target.examCard ? '문항 카드에 넣기' : '한글 파일에 넣기'}」를 누르세요.` : text;
      if (title.title !== full) title.title = full;
    }
    const closeButton = panel.querySelector('[data-ai-close]');
    const closeLabel = `${graph ? '그래프 AI' : 'AI 이미지'} 닫기`;
    if (closeButton && closeButton.getAttribute('aria-label') !== closeLabel) closeButton.setAttribute('aria-label', closeLabel);
  }

  function blankGraphSheet() {
    const c = document.createElement('canvas'); c.width = 800; c.height = 600;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 800, 600);
    return c.toDataURL('image/png');
  }

  // 1.8.0 그래프 「그림으로 생성」 한 차례(js/ai-engines.js → js/ai-graph). 결과는 그림(PNG) 카드이고 설계는 item.meta.graphPlan에 둔다
  // (캔버스에 넣으면 이미지 객체 meta로 따라감 → 다시 열면 그 설계로 AI 없이 다시 그림). 선택한 결과가 그림 그래프면 그것을 앞 결과로 넘겨
  // 설계·그리기가 실패해도 앞 결과를 지킨다.
  // E9b(11-19): 끝나는 길을 넷으로 나눈다 — 그림(item) | 앞 결과 그대로(prior) | 오류(graphOutcome):
  //   'login'   Codex 로그인이 없음(시작 전 확인 또는 실행 중 만료) → 연결 화면, 로그인하면 이어서
  //   'offline' 인터넷 끊김 → 안내, online이 되면 이어서
  //   'objects' 설계를 못 받아 축만 그림·엔진 실패 → 기본 그래프 객체 생성으로(축만 그린 그림은 error.minimalItem으로 넘겨 최후의 결과로 남김)
  const graphPictureStop = (outcome, message, extra = {}) => Object.assign(new Error(message), { graphOutcome: outcome, ...extra });
  // 로그인·연결이 없어 멈춘 그래프 생성은 실패가 아니라 「로그인 대기」·「연결 대기」다. 로그인하거나 online이 되면 같은 요청으로 이어서 만든다.
  const parkGraphCreate = (outcome, again, { missing = null } = {}) => {
    advanceGenerationClock('turn-terminal', 'failed'); requestPhase(outcome === 'login' || outcome === 'install' ? 'login-wait' : 'offline-wait');
    if (outcome === 'login' || outcome === 'install') { guideDesktopLogin(again, { missing: outcome === 'install' ? true : missing }); return; }
    setTaskState('idle');
    setStatus('인터넷 연결을 확인해 주세요 · AI 서버에 닿지 못해 이번에는 그래프를 만들지 못했습니다. 앞 결과와 입력은 그대로 두었고, 연결되면 이어서 만듭니다.', 'warn');
    addLog(`AI 서버에 연결하지 못했습니다. 인터넷이 다시 연결되면 자동으로 이어서 만듭니다. ${runAgainHint(sendButton?.textContent)}`, 'error');
    const epochAtStop = currentRequestEpoch;
    window.addEventListener('online', () => { if (!disposed && !busy && !graphSubmitting && currentRequestEpoch === epochAtStop) void again(); }, { once: true, signal: lifecycle.signal });
  };
  async function runGraphPictureTurn({ instructions, isCurrent, epoch, batch = false }) {
    const prior = selectedOutputItem();
    const previous = prior?.meta?.graphPlan ? { png: prior.data, plan: prior.meta.graphPlan } : null;
    if (!desktop.web && typeof desktop.status === 'function') {
      let login = null;
      try { login = (await desktop.status())?.login || null; } catch { login = null; }
      if (!isCurrent()) return null;
      if (login && login.installed === false) throw graphPictureStop('login', 'Codex 프로그램을 찾지 못했습니다.');
      if (login && login.loggedIn === false) throw graphPictureStop('login', 'Codex 로그인이 필요합니다.');
    }
    const abort = new AbortController(); imageLabelRunAbort = abort;
    const startedAt = Date.now();
    newEngineRunActive = true;
    try {
      const clockId = `graph-picture-${epoch}`; currentTurnId = clockId; startGenerationClock(clockId);
      if (pendingLoading && !pendingLoading.source) pendingLoading.source = blankGraphSheet();
      requestPhase('generating');
      const show = phase => { const c = graphPhaseCopy(phase); if (c.title && isCurrent()) setGenerating(true, c.title, c.detail); };
      show('graph-plan');
      const textModel = GRAPH_WORKBENCH_SELECTION.model;
      // E9b: 글 모델이 거절(400)되면 다른 글 모델로 한 번 더(그림 엔진과 같음). 차례 시계는 createDesktopEngineAi가 둔다.
      const ai = createDesktopEngineAi(desktop, engineRaster, { textModels: [textModel, ...imageModelOrder(textModel)] });
      let r;
      try {
        r = await runGraphPicture({ ai, request: instructions, previous, signal: abort.signal, onPhase: e => show(e.phase), models: { text: textModel } });
      } catch (error) {
        if (error?.name === 'AbortError' || abort.signal.aborted) throw error;
        if (ai.health.authRequired) throw graphPictureStop('login', 'Codex 로그인이 필요합니다.');
        if (ai.health.offline) throw graphPictureStop('offline', 'AI 서버에 연결하지 못했습니다.');
        throw Object.assign(error, { graphOutcome: 'objects' });
      }
      if (!isCurrent() || abort.signal.aborted) return null;
      if (r.cancelled) throw new DOMException('작업이 취소되었습니다.', 'AbortError');
      // 로그인·연결이 없어 설계를 못 받은 것은 축만 그린 그림이나 앞 결과로 덮지 않고 이어 갈 길로 데려간다.
      if (r.fallback && ai.health.authRequired) throw graphPictureStop('login', 'Codex 로그인이 필요합니다.');
      if (r.fallback && ai.health.offline) throw graphPictureStop('offline', 'AI 서버에 연결하지 못했습니다.');
      // 앞 결과(고른 그림 그래프)는 카드에 그대로 있다. 새로 만들 길은 아직 남았으니 기본 그래프 객체 생성으로 넘기고, 그것도 안 되면 앞 결과로 끝낸다(E9b).
      if (r.fallback === 'previous' && previous) throw graphPictureStop('objects', (r.warnings || []).find(w => /실패/.test(w)) || '설계를 받지 못했습니다.', { keepPrior: prior });
      requestPhase('validating');
      const issues = (r.warnings || []).map(message => ({ message: String(message), severity: 'minor' }));
      // E9b: 글자 겹침이 남은 채 그려졌으면 결과 확인에 올리고 상태 글로도 알린다(그래프 글자 겹침 금지 — 조용히 넘기지 않음).
      const collisionCount = Number(r.collisions?.n) || 0;
      if (collisionCount > 0) issues.unshift({ code: 'GRAPH_PICTURE_LABEL_OVERLAP', message: `글자 겹침 ${collisionCount}곳: ${(r.collisions.list || []).slice(0, 3).join(', ')}`, severity: 'major' });
      const item = { id: `generated-${++imageSerial}`, name: `그림 그래프 ${generatedImages.length + 1}`, data: r.png, kind: 'generated', engine: 'ai-graph-picture', meta: r.meta, postprocessOk: true,
        comments: [], nextCommentNumber: 1, reviewState: 'needs-attention', reviewReport: { verdict: 'uncertain', checks: [], issues },
        reviewMeta: { ...GRAPH_WORKBENCH_SELECTION, elapsedMs: Date.now() - startedAt, generationCount: 0, reviewCount: 0 } };
      // 설계를 못 받아 축만 그렸다: 기본 그래프 객체 생성이 더 나은 결과를 낼 수 있으므로 그쪽으로 넘기고, 이 그림은 최후의 결과로 들고 간다.
      if (r.fallback === 'minimal') throw graphPictureStop('objects', (r.warnings || []).find(w => /실패/.test(w)) || '설계를 받지 못했습니다.', { minimalItem: item });
      advanceGenerationClock('image-received'); advanceGenerationClock('postprocess-completed'); advanceGenerationClock('turn-terminal', 'completed');
      if (batch) return item;
      addGraphPictureItem(item);
      setTaskState('completed');
      const notes = [collisionCount ? `글자 겹침 ${collisionCount}곳이 남았습니다` : '', r.katex === false || (r.warnings || []).some(w => /KaTeX|글꼴/.test(w)) ? '수식 글자를 대체 글꼴로 그렸습니다' : ''].filter(Boolean);
      setStatus(notes.length ? `그래프 그림 생성 완료 · ${notes.join(' · ')} — 결과 확인에서 확인해 주세요.` : '그래프 그림 생성 완료 · 설계를 함께 저장해 다시 열어 고칠 수 있습니다.', notes.length ? 'warn' : 'ok');
      captureActiveTaskTab(); await taskPersistence.checkpoint();
      return item;
    } finally {
      newEngineRunActive = false;
      if (imageLabelRunAbort === abort) imageLabelRunAbort = null;
    }
  }
  function addGraphPictureItem(item) {
    generatedImages.push(item); latestGeneratedSrc = item.data; selectedCandidateId = item.id;
    panel.dataset.aiSelectedCandidateId = item.id; previews.querySelector('[data-ai-empty]')?.remove(); previews.prepend(makeImageCard(item));
    panel.dispatchEvent(new CustomEvent('5e:ai-candidate-select', { detail: { candidateId: item.id } }));
    dispatchReviewEvent({ state: item.reviewState, candidateId: item.id, report: item.reviewReport, ...item.reviewMeta }, item);
    currentTurnCandidate = item;
  }

  async function runGraphRestore(options = {}) {
    if (busy || graphSubmitting || panel.dataset.aiSharingMode === 'view') return;
    const creating = (options.runInputSnapshot?.conversionKind || conversionKind) === 'graph-create';
    const taskId = activeTaskTabId, references = options.runInputSnapshot?.attachments || attachments, sourceItems = references.filter(isInputReference);
    if (!creating && !sourceItems.length) { setStatus('복원할 원본 그래프를 추가하세요.', 'warn'); return; }
    const owner = taskTabs.get(taskId), ownerEpoch = graphOwnerEpoch;
    const captured = sourceItems.map(snapshotImageItem), styles = references.filter(item => !isInputReference(item)).map(snapshotImageItem);
    const priorGraph = options.runInputSnapshot?.priorGraph || (selectedOutputItem()?.graphResult ? snapshotImageItem(selectedOutputItem()) : null);
    const enteredRequest = options.requestOverride ?? input.value, enteredDiscussion = options.discussionContextOverride ?? compactConversation(conversationMessages);
    const instructions = [enteredRequest, enteredDiscussion, options.batchContext ? buildCommentRequest([...captured, ...(priorGraph ? [priorGraph] : [])]) : commentPrompt()].filter(Boolean).join('\n');
    const again = () => runGraphRestore({ ...options, requestOverride: enteredRequest, discussionContextOverride: enteredDiscussion });
    let minimalPicture = null, keptPrior = null; // E9b: 그림으로 생성이 남긴 것(축만 그린 그림·지킨 앞 결과) — 기본 생성까지 실패하면 이것으로 끝낸다
    if (creating && !instructions.trim()) { setStatus('축 이름과 그릴 모양 또는 수식을 적어 주세요.', 'warn'); input.focus(); return; }
    graphSubmitting = true; currentCancelRequested = false; currentTurnType = 'image';
    const epoch = ++currentRequestEpoch;
    beginRequest(); clearTimeout(requestTimeout); requestTimeout = null;
    currentTurnId = null; generationTiming = null;
    currentTurnType = 'image'; currentRequestSnapshot = { entered: instructions, runInput: { conversionKind: creating ? 'graph-create' : 'graph', attachments: references.map(snapshotImageItem), priorGraph, referenceComposition: structuredClone(referenceComposition), ...GRAPH_WORKBENCH_SELECTION } };
    providerRequestPersistable = true;
    setBusy(true); setGenerating(true, creating ? '설명으로 그래프를 만들고 있습니다' : '그래프를 복원하고 있습니다', creating ? '축과 관계를 정리하고 편집 가능한 그래프로 구성합니다.' : '원본의 축·눈금·곡선을 읽고 편집 객체로 구성합니다.');
    const isCurrent = () => !disposed && graphOwnerEpoch === ownerEpoch && taskTabs.get(taskId) === owner && activeTaskTabId === taskId && currentRequestEpoch === epoch && !currentCancelRequested;
    try {
      await taskPersistence.checkpoint();
      if (!isCurrent()) return;
      if (!desktop?.send) throw new Error('AI 연결을 확인해 주세요.');
      // PATHFIX(11-20): 복원·생성 모두 시작 전에 Codex 설치·로그인부터 본다 — 없으면 모델 목록에서 영어 원문으로 끝나지 않고
      // 연결 화면(설치 안내 또는 로그인)으로 데려간 뒤 「다시 찾기」·로그인하면 같은 요청으로 이어 간다.
      if (!desktop.web && typeof desktop.status === 'function' && !options.batchContext) {
        let connection = null;
        try { connection = await desktop.status(); } catch (error) { reportAiError('graph:status', error); connection = null; }
        if (!isCurrent()) return;
        const login = connection?.login || null;
        if (connection && (codexMissing(connection) || login?.loggedIn === false)) {
          addLog(codexMissing(connection) ? 'Codex 프로그램을 찾지 못해 그래프 작업을 시작하지 않았습니다. 설치한 뒤 「다시 찾기」를 누르면 이어서 합니다.' : 'Codex 로그인이 없어 그래프 작업을 시작하지 않았습니다. 로그인하면 이어서 합니다.');
          parkGraphCreate('login', again, { missing: codexMissing(connection) });
          return;
        }
      }
      // 1.8.0 옵션 「그림으로 생성」: 기본은 지금의 그래프 객체 생성. 옵션(플래그 5e.aiEngine.graphPicture)이 켜졌을 때만 새 그래프 엔진으로
      // 그림(PNG)+설계(meta.graphPlan)를 만든다. 고르는 화면은 아직 없다(시안: 시안/그래프-생성방식-옵션.html). 실패하면 기본 생성으로 이어 간다.
      if (creating) {
        const choice = options.graphEngine || owner?.graphCreateEngine || null;
        const route = graphRoute({ desktop, storage: channelStorage, picture: choice ? choice === 'picture' : null });
        if (route.note && route.reason === 'web') addLog(route.note);
        if (route.use) {
          try {
            const item = await runGraphPictureTurn({ instructions, isCurrent, epoch, batch: Boolean(options.batchContext) });
            if (!isCurrent()) return;
            if (item) return item;
          } catch (error) {
            if (error?.name === 'AbortError' || !isCurrent()) return;
            // E9b: 로그인·연결이 없으면 기본 생성도 같은 연결이라 실패한다 — 넘기지 않고 이어 갈 길로(그림 엔진 E9와 같음).
            if (error?.graphOutcome === 'login' || error?.graphOutcome === 'offline') { parkGraphCreate(error.graphOutcome, again); return; }
            minimalPicture = error?.minimalItem || null; keptPrior = error?.keepPrior || null;
            addLog(`그림으로 생성하지 못해 기본 그래프 생성으로 이어서 만듭니다: ${aiErrorText(error)}`, 'error');
            setGenerating(true, '설명으로 그래프를 만들고 있습니다', '축과 관계를 정리하고 편집 가능한 그래프로 구성합니다.');
          }
        }
      }
      const catalog = await desktop.models();
      resolveAIModelSelection(GRAPH_WORKBENCH_SELECTION, catalog);
      if (!isCurrent()) return;
      let data = captured[0]?.data, name = creating ? '설명으로 만든 그래프' : captured[0].name, id = captured[0]?.id;
      if (!creating && captured.length > 1) {
        const composite = await composeReferenceImages({ sources: captured, orientation: (options.runInputSnapshot?.referenceComposition || referenceComposition).orientation, layout: (options.runInputSnapshot?.referenceComposition || referenceComposition).layout });
        data = composite.dataUrl; name = '합친 원본'; id = 'composite-' + taskId;
      }
      let source;
      if (creating) source = await graphDescriptionSource(instructions, priorGraph?.graphResult?.plan || null, priorGraph?.graphResult?.objects || null);
      else {
        const image = new Image(); image.src = data; await image.decode();
        source = { id, hash: await graphSourceHash(data), width: image.naturalWidth, height: image.naturalHeight };
      }
      if (!isCurrent()) return;
      const contextAttachment = !creating && priorGraph?.graphResult?.source?.hash === source.hash ? await workbenchGraphContextAttachment(priorGraph.graphResult, priorGraph.id) : null;
      if (!isCurrent()) return;
      // 그래프 생성은 원본 그림이 없다 — 빈 4:3 종이를 흐림 틀로 써서 단계 막대·문구를 똑같이 보인다.
      if (pendingLoading) pendingLoading.source = data || blankGraphSheet();
      requestPhase('generating');
      const clockId = `graph-${epoch}`; currentTurnId = clockId; startGenerationClock(clockId);
      const restored = await graphWorkflow.analyze({ source, ...(creating ? { description: instructions, priorPlan: priorGraph?.graphResult?.plan || null, priorObjects: priorGraph?.graphResult?.objects || null } : { attachment: { id, name, data }, instructions, contextAttachment, ...(contextAttachment ? {priorPlan:priorGraph.graphResult.plan,priorObjects:priorGraph.graphResult.objects} : {}), styleAttachments: styles.map(item => ({ id: item.id, name: item.name, data: item.data })) }), selection: GRAPH_WORKBENCH_SELECTION, catalog, force: true, repairInvalid: 2 }); // 11-12: 복원·생성 모두 검증에 걸리면 오류를 붙여 최대 두 번 더
      if (!isCurrent()) return;
      if (restored.blocked) throw Object.assign(new Error(restored.quality?.issues?.filter(i => i.severity === 'critical').map(i => i.message).join('\n') || '확인하지 못한 축 또는 계열이 있습니다.'), { code: 'GRAPH_INVALID_RESULT' });
      requestPhase('validating');
      // 11-12: 복원은 원본 눈금 숫자 높이를 직접 재어 AI가 어림한 글자 크기를 바로잡는다(source-label-size.js).
      if (!creating) { try { const { calibratePlanLabelSizeFromImage } = await import('./graph/source-label-size.js?v=1.7.0-four-session-integration'); const calibrated = await calibratePlanLabelSizeFromImage(restored.plan, data); restored.plan = calibrated.plan; globalThis.__fiveEGraphLabelCalibration?.push?.({ ...calibrated.report, plan: restored.plan }); } catch {} if (!isCurrent()) return; }
      const graphResult = buildWorkbenchGraph(creating ? prepareGraphDescriptionPlan(restored.plan) : restored.plan, source, { descriptionLayout: creating, priorResult:priorGraph?.graphResult || null, ...(creating&&priorGraph?{request:options.requestOverride ?? input.value}:{}) });
      // Freeze the actual analyzed pixels, including composed inputs. Replacing
      // an attachment later must not silently change the tracing reference.
      if (!creating) graphResult.traceReference = { data, name, width:source.width, height:source.height, plotBox:structuredClone(restored.plan.source.plotBox) };
      else graphResult.description = { request: instructions, qualitative: restored.plan.coordinateMode === 'observed' };
      const resultData = await workbenchGraphDataUrl(graphResult);
      if (!isCurrent()) return;
      const item = { id: `generated-${++imageSerial}`, name: `${creating ? '생성' : '복원'} 그래프 ${generatedImages.length + 1}`, data: resultData, kind: 'generated', engine: 'native-graph', graphResult,
        ...(priorGraph ? {graphEdit:{parentCandidateId:priorGraph.id,createdAt:new Date().toISOString(),request:instructions}} : {}),
        sceneResult: { valid: true, supported: true, objects: graphResult.objects }, sourceReferenceId: captured.length === 1 ? id : null, sourceReferenceName: name,
        comments: [], nextCommentNumber: 1, reviewState: 'needs-attention', reviewReport: { verdict: 'uncertain', checks: [], issues: graphResult.quality?.issues || [] }, reviewMeta: { ...GRAPH_WORKBENCH_SELECTION, elapsedMs: restored.metrics.analysisMs, generationCount: 0, reviewCount: 0 } };
      advanceGenerationClock('image-received'); advanceGenerationClock('postprocess-completed'); advanceGenerationClock('turn-terminal', 'completed');
      if (options.batchContext) return item;
      generatedImages.push(item); latestGeneratedSrc = resultData; selectedCandidateId = item.id;
      panel.dataset.aiSelectedCandidateId = item.id; previews.querySelector('[data-ai-empty]')?.remove(); previews.prepend(makeImageCard(item));
      panel.dispatchEvent(new CustomEvent('5e:ai-candidate-select', { detail: { candidateId: item.id } }));
      dispatchReviewEvent({ state: item.reviewState, candidateId: item.id, report: item.reviewReport, ...item.reviewMeta }, item);
      currentTurnCandidate = item;
      const visibilityIssues = creating ? (graphResult.quality?.issues || []).filter(issue => issue.code.startsWith('DESCRIPTION_EXPRESSION_')) : [];
      setTaskState('completed'); setStatus((priorGraph ? '그래프 수정본 완료 · 이전 결과는 수정본 목록에 남았습니다.' : creating ? '그래프 생성 완료 · 추가 설명으로 수정하거나 세부 편집으로 조정하세요.' : '그래프 복원 완료 · 추가 설명으로 수정하거나 원본과 비교하세요.') + (creating && graphResult.description.qualitative ? ' 숫자 없는 정성적 모식도입니다.' : '') + (visibilityIssues.length ? ' 확인 필요: ' + visibilityIssues.map(issue => issue.message).join(' ') : ''), visibilityIssues.length ? 'warn' : 'ok');
      captureActiveTaskTab(); await taskPersistence.checkpoint();
      return item;
    } catch (error) {
      // E9b: 기본 생성까지 실패했지만 그림으로 생성이 축만 그린 그림을 남겼다 — 실패로 끝내지 않고 그것을 결과로(앞 결과는 그대로).
      if (minimalPicture && isCurrent() && error?.name !== 'AbortError') {
        const failure = describeGraphFailure(error);
        addLog(`기본 그래프 생성도 실패했습니다: ${failure.detail || failure.message}`, 'error');
        advanceGenerationClock('image-received'); advanceGenerationClock('postprocess-completed'); advanceGenerationClock('turn-terminal', 'completed');
        if (options.batchContext) return minimalPicture;
        addGraphPictureItem(minimalPicture);
        setTaskState('completed');
        setStatus('설계를 받지 못해 축만 그린 그래프를 두었습니다 · 설명을 더해 다시 만들거나 결과를 고칠 수 있습니다.', 'warn');
        captureActiveTaskTab(); await taskPersistence.checkpoint();
        return minimalPicture;
      }
      if (keptPrior && isCurrent() && error?.name !== 'AbortError') {
        const failure = describeGraphFailure(error);
        addLog(`기본 그래프 생성도 실패했습니다: ${failure.detail || failure.message}`, 'error');
        advanceGenerationClock('turn-terminal', 'completed');
        if (!options.batchContext) requestPhase('kept-previous', { reason: failureReason(error) });
        setTaskState('completed');
        setStatus('그래프를 다시 만들지 못해 앞 결과를 그대로 두었습니다 · 설명을 고쳐 다시 실행할 수 있습니다.', 'warn');
        if (options.batchContext) return keptPrior;
        captureActiveTaskTab(); await taskPersistence.checkpoint();
        return keptPrior;
      }
      if (isCurrent()) {
        const failure = describeGraphFailure(error), reason = failureReason(error);
        // 생성이 인터넷·로그인 때문에 멈췄으면 막다른 실패 대신 이어 갈 길로(그림으로 생성과 같음).
        // PATHFIX: Codex가 없음(install)·로그인 없음은 복원도 막다른 실패 대신 연결 화면 → 이어 하기.
        if (!options.batchContext && ((creating && reason === 'offline') || ((reason === 'login' || reason === 'install') && !desktop?.web))) { addLog(failure.detail, 'error'); parkGraphCreate(reason, again); return; }
        // 앞 결과 카드가 있으면 그것을 그대로 두고 끝난 것이다(작업 목록 「완료 · 앞 결과를 그대로 두었습니다」).
        const kept = generatedImages.length > 0;
        advanceGenerationClock('turn-terminal', 'failed');
        if (!options.batchContext) requestPhase(kept ? 'kept-previous' : 'failed', { reason });
        setTaskState('failed');
        if (creating) setStatus(generationFailedText(reason) + (reason === 'ai' ? ' · 설명을 고쳐 다시 실행할 수 있습니다.' : ''), kept ? 'warn' : 'error');
        else setStatus(failure.message, 'error');
        addLog(failure.detail, 'error');
      }
      if (options.batchContext) throw error;
    } finally {
      if (graphOwnerEpoch === ownerEpoch && activeTaskTabId === taskId && currentRequestEpoch === epoch) { setGenerating(false); setBusy(false); syncGraphWorkbenchUi(); syncSelectedOutputActions(); captureActiveTaskTab(); persistTasks(); }
      if (currentRequestEpoch === epoch) graphSubmitting = false;
    }
  }

  // 11-11 사용자: 부분 수정은 AI가 원본·지금 그림·그 안의 지정 영역을 모두 읽고 의도를 파악해야 한다.
  // 지금 그림 위에 허용 박스를 빨간 테두리·번호로 그린 안내 그림(돌려받는 그림에는 그리지 말라고 지시).
  async function markScopedRegions(dataUrl, rectangles) {
    const image = new Image(); image.src = dataUrl; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth || image.width; canvas.height = image.naturalHeight || image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const line = Math.max(2, Math.round(Math.min(canvas.width, canvas.height) / 250));
    rectangles.forEach((rect, index) => {
      ctx.save(); ctx.strokeStyle = '#e5222b'; ctx.lineWidth = line; ctx.setLineDash([line * 4, line * 2]);
      if (rect.polygon?.length > 2) { ctx.beginPath(); rect.polygon.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke(); }
      else ctx.strokeRect(rect.x0 + line / 2, rect.y0 + line / 2, Math.max(1, rect.x1 - rect.x0 - line), Math.max(1, rect.y1 - rect.y0 - line));
      const size = Math.max(14, line * 9), label = String(index + 1);
      ctx.setLineDash([]); ctx.fillStyle = '#e5222b'; ctx.fillRect(rect.x0, Math.max(0, rect.y0 - size - 2), size * 0.9, size + 2);
      ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(size * 0.8)}px sans-serif`; ctx.textBaseline = 'top'; ctx.fillText(label, rect.x0 + size * 0.2, Math.max(0, rect.y0 - size - 2) + size * 0.12);
      ctx.restore();
    });
    return canvas.toDataURL('image/png');
  }
  async function fitScopedCandidate(bytes, width, height) {
    let bitmap;
    try { bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' })); } catch { return bytes; }
    try {
      if (bitmap.width === width && bitmap.height === height) return bytes;
      const target = width / height, actual = bitmap.width / bitmap.height;
      let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
      if (Math.abs(actual - target) / target > 0.04) {
        if (actual > target) { sw = Math.round(bitmap.height * target); sx = Math.round((bitmap.width - sw) / 2); }
        else { sh = Math.round(bitmap.width / target); sy = Math.round((bitmap.height - sh) / 2); }
      }
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      return blob ? new Uint8Array(await blob.arrayBuffer()) : bytes;
    } finally { bitmap.close?.(); }
  }
  async function keepMeaningfulChanges(currentPng, candidatePng) {
    try {
      const decode = async bytes => { const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' })); const c = document.createElement('canvas'); c.width = bitmap.width; c.height = bitmap.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bitmap, 0, 0); bitmap.close?.(); return { c, x, data: x.getImageData(0, 0, c.width, c.height) }; };
      const a = await decode(currentPng), b = await decode(candidatePng);
      if (a.c.width !== b.c.width || a.c.height !== b.c.height) return candidatePng;
      const w = a.c.width, h = a.c.height, A = a.data.data, B = b.data.data;
      let mask = new Uint8Array(w * h);
      for (let i = 0, p = 0; p < mask.length; p++, i += 4) mask[p] = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2])) > 12 ? 1 : 0;
      // 열기(지우기→넓히기)로 흩어진 점 같은 잡음은 지우고, 넓히기 한 번 더로 바뀐 덩어리 가장자리를 살린다.
      const morph = (src, r, grow) => { const tmp = new Uint8Array(src.length), out = new Uint8Array(src.length);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = grow ? 0 : 1; for (let k = -r; k <= r && (grow ? !v : v); k++) { const xx = Math.min(w - 1, Math.max(0, x + k)); v = src[y * w + xx]; } tmp[y * w + x] = v; }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = grow ? 0 : 1; for (let k = -r; k <= r && (grow ? !v : v); k++) { const yy = Math.min(h - 1, Math.max(0, y + k)); v = tmp[yy * w + x]; } out[y * w + x] = v; }
        return out; };
      mask = morph(morph(morph(mask, 2, false), 2, true), 3, true);
      let kept = 0;
      for (let i = 0, p = 0; p < mask.length; p++, i += 4) if (mask[p]) { kept++; } else { B[i] = A[i]; B[i + 1] = A[i + 1]; B[i + 2] = A[i + 2]; B[i + 3] = A[i + 3]; }
      if (!kept) return candidatePng; // 걸러 낼 게 없으면(아주 옅은 변화뿐) AI 결과 그대로
      b.x.putImageData(b.data, 0, 0);
      const blob = await new Promise(resolve => b.c.toBlob(resolve, 'image/png'));
      return blob ? new Uint8Array(await blob.arrayBuffer()) : candidatePng;
    } catch { return candidatePng; }
  }
  const scopedSourceReference = item => attachments.find(source => source.id === item?.sourceReferenceId && source.data)
    || attachments.find(source => isInputReference(source) && source.data) || null;
  const scopedInputRolesText = ({ hasSource, chatText }) => `

ATTACHED IMAGES, IN THIS ORDER:
${hasSource ? `1) ORIGINAL SOURCE - the printed exam/textbook figure this drawing was redrawn from. Reference only: read it to understand what the user means (for example "like the original" = copy its fill, gray shading, line style, shape or text exactly as it appears there). Never return this image.
2) CURRENT VERSION - the image you must edit and return, at exactly the same pixel size.
3) CURRENT VERSION WITH THE PERMITTED BOXES outlined in red and numbered - shows where each numbered instruction applies. Never draw these red outlines or numbers in your result.`
  : `1) CURRENT VERSION - the image you must edit and return, at exactly the same pixel size.
2) CURRENT VERSION WITH THE PERMITTED BOXES outlined in red and numbered - shows where each numbered instruction applies. Never draw these red outlines or numbers in your result.`}
Read all images first, work out the user's intent, then make that change in the CURRENT VERSION only. Prefer the most likely interpretation over replying EDIT_INSTRUCTION_UNCLEAR; the user can ask again.${chatText ? `

THE USER'S CHAT MESSAGE (applies to the boxes above; follow it together with each box instruction):
${chatText}` : ''}`;
  async function startScopedEdit(item, captured = null) {
    if (busy || preflightRun || !desktop) return;
    if ((!captured && selectedOutputItem() !== item) || !item || item.kind !== 'generated' || item.sceneResult) {
      setStatus('먼저 수정할 생성 PNG를 선택하세요.', 'error'); return;
    }
    // This independent byte snapshot is used only for review comparison; stale live output is never read for it.
    let selection;
    try { selection = resolveAIModelSelection(captured?.options || modelSelection(), availableModels); }
    catch (error) { setStatus(error.message, 'error'); return; }
    const originalPng = scopedPngBytes(item.data);
    const promptMode = captured?.scopeEdit?.promptMode ?? scopedPromptMode?.value ?? 'legacy';
    if (!['legacy', 'compact', 'compact-tight', 'verified', 'verified-tight'].includes(promptMode)) {
      setStatus('지원하지 않는 박스 수정 방식입니다. 다시 선택하세요.', 'error'); return;
    }
    let comments;
    try { comments = collectScopedAreaComments(JSON.parse(JSON.stringify(captured?.comments || item.comments || [])), item.id); }
    catch (error) { setStatus(error.message, 'warn'); if (batchRun) throw error; return; }
    const hasChecks = comments.some(comment => comment.precisionCheck);
    if (promptMode.startsWith('verified') && !hasChecks) {
      setStatus('각 수정 박스의 수치 검증 기준을 먼저 설정하세요.', 'warn'); return;
    }
    let checks = hasChecks ? comments.map((comment,box) => ({...comment.precisionCheck,box})) : null;
    const epoch = ++currentRequestEpoch;
    const ownerTaskId = activeTaskTabId;
    const ownerRevisionId = item.id;
    const token = beginRequest('image', item.data);
    currentTurnType = 'image';
    currentRunInput = { scopedEdit: true, promptMode }; currentRequestSnapshot = null;
    currentCacheRequest = null; pendingCacheOutput = null; currentReviewScheduled = false;
    currentTurnId = null; currentRenderThreadId = null; awaitingTurnId = false; queuedTurnEvents = [];
    currentCancelRequested = false;
    const fingerprint = JSON.stringify(item.comments || []);
    const history = {version:1,id:crypto.randomUUID(),sourceCandidateId:item.id,startedAt:Date.now(),
      promptMode,comments:structuredClone(comments),maximumAttempts:hasChecks?2:1,attempts:[],status:'preparing'};
    item.scopedEditHistory ||= [];
    item.scopedEditHistory.push(history);
    if (automaticSeparationRun?.item === item) {
      const run = automaticSeparationRun;
      automaticSeparationRun = null;
      run.controller.abort('raw-contract-bound');
    }
    outputVariantCache.delete(item);
    refreshOutputPreviews();
    let nativeRaw = null, nativeContext = null, lastVerification = null, failureShown = false;
    const persistScopedHistory = async () => {
      if (activeTaskTabId === ownerTaskId) captureActiveTaskTab();
      else {
        const saved = taskTabs.get(ownerTaskId)?.generated?.find(candidate=>candidate.id===ownerRevisionId);
        if (saved) saved.scopedEditHistory = structuredClone(item.scopedEditHistory);
      }
      await taskPersistence.checkpoint();
    };
    const getCurrent = () => {
      const live = captured ? generatedImages.find(candidate=>candidate.id===ownerRevisionId) : selectedOutputItem();
      const visibleId = panel.querySelector('[data-ai-candidate-option][aria-selected="true"]')?.dataset.aiCandidateOption;
      if (!live || (!captured && (visibleId !== live.id || panel.dataset.aiSelectedCandidateId !== live.id))) {
        throw new Error('화면의 선택 버전과 내부 수정 대상이 달라 적용할 수 없습니다.');
      }
      if (currentCancelRequested || !requestStates.live(token) || activeTaskTabId !== ownerTaskId || live.id !== ownerRevisionId) throw new Error('선택 영역 수정이 취소되었거나 대상이 변경되었습니다.');
      return { taskId: activeTaskTabId, candidateId: live?.id, epoch: currentRequestEpoch,
        selectionRevision: captured ? 0 : scopedSelectionRevision + (JSON.stringify(live?.comments || []) === fingerprint ? 0 : 1),
        sourcePng: scopedPngBytes(live?.data || '') };
    };
    setBusy(true);
    try {
      const done = await runScopedPanelEdit({ getCurrent, comments,
        timingObserver: ({ phase, durationMs, outcome }) => {
          const label = { prepare: 'PNG 준비', session: '세션 생성', 'scope-confirmation': '범위 확인',
            'bounds-confirmation': '범위 승인 대기', 'ai-generation': 'AI 응답',
            'png-composite-validation': 'PNG 합성·검증', 'machine-verification':'수치 검증',
            'correction-confirmation':'교정 승인 대기', 'candidate-review': '후보 비교 대기',
            'registration-display': '등록·표시' }[phase] || '처리';
          const outcomeLabel = { completed: '완료', cancelled: '취소', failed: '실패' }[outcome] || outcome;
          // 11-11: 개발용 시간 기록은 대화창에 띄우지 않는다(버그 보고 기록·콘솔에만).
          try { console.debug(`[5E 부분 수정] ${label} ${Math.round(durationMs)}ms · ${outcomeLabel}`); } catch {}
        },
        // The box-edit click authorizes the drawn scope; application still needs review.
        confirmBounds: async () => true,
        generate: async (session,{attempt,feedback}) => {
          if (attempt >= history.maximumAttempts || history.attempts.length !== attempt) {
            throw new Error('이 요청의 교정 횟수 상한에 도달했습니다.');
          }
          failureShown = false;
          if (checks) {
            try { checks = validateScopedEditChecks(checks,session); }
            catch (cause) {
              const error=new Error('수치 기준이 유효하지 않아 생성하지 않았습니다. 각 박스의 이동량·개수·지름·좌표와 탐색 범위를 확인하세요.',{cause});
              error.code='SCOPED_EDIT_CHECKS_INVALID';throw error;
            }
          }
          if (checks && attempt===0) {
            history.sourceVerification=await evaluateScopedEditPrecision({sourcePng:originalPng,rawPng:originalPng,
              finalPng:originalPng,rectangles:session.rectangles,checks});
            if (history.sourceVerification.checks.some(check=>check.status==='uncertain'
                || check.reasons.includes('target-does-not-fit-permission'))) {
              const error=new Error('수치 기준으로 원본 대상을 확인하지 못했거나 목적지가 박스를 벗어나 생성하지 않았습니다. 탐색 범위와 이동량을 확인하세요.');
              error.code='SCOPED_EDIT_SOURCE_UNCERTAIN';throw error;
            }
          }
          const ownerBeforeContext = getCurrent();
          const context = promptMode !== 'legacy' ? await prepareScopedEditContext(originalPng, session.rectangles,
            promptMode.endsWith('-tight')?{contextMargin:224}:undefined) : null;
          nativeContext = context; nativeRaw = null;
          const ownerAfterContext = getCurrent();
          if (!requestStates.live(token) || currentCancelRequested
              || ['taskId', 'candidateId', 'epoch', 'selectionRevision'].some(key => ownerBeforeContext[key] !== ownerAfterContext[key])
              || ownerAfterContext.sourcePng.length !== originalPng.length
              || ownerAfterContext.sourcePng.some((value, index) => value !== originalPng[index])) {
            throw new Error('입력 준비 중 작업·원본·박스가 변경되었거나 취소되어 생성하지 않았습니다.');
          }
          const requestComments = comments.map((comment,index) => {
            const ownFeedback = attempt && feedback ? lastVerification?.checks.find(check=>check.box===index&&check.status==='fail')?.feedback : '';
            return {...comment,text:ownFeedback?`${comment.text}\n\nPrevious measured error in original-image pixels:\n${ownFeedback}`:comment.text};
          });
          const text = (promptMode.startsWith('verified') ? buildVerifiedScopedEditPrompt :
            promptMode === 'legacy' ? buildScopedEditPrompt : buildCompactScopedEditPrompt)(
              {session,comments:requestComments,candidateId:item.id,context,checks,
                sourceMeasurements:history.sourceVerification?.checks.map(check=>check.metrics)||[]});
          const inputData = context ? scopedPngData(context.inputPng) : item.data;
          // 11-11: 원본(출처 그림) + 지금 그림 + 박스 표시 그림을 함께 보낸다. 박스 밖은 어차피 합성 단계에서 원래대로 되돌린다.
          const sourceRef = scopedSourceReference(item);
          let markedData = null;
          try { markedData = await markScopedRegions(item.data, session.rectangles); } catch { markedData = null; }
          const scopedAttachments = [
            ...(sourceRef ? [{ name: `원본-${sourceRef.name || 'source'}`, data: sourceRef.data }] : []),
            { name: item.name, data: inputData },
            ...(markedData ? [{ name: `${item.name}-영역표시`, data: markedData }] : []),
          ];
          const chatText = String(captured?.chatText ?? chatInput?.value ?? '').trim();
          const requestText = `${text}${markedData ? scopedInputRolesText({ hasSource: Boolean(sourceRef), chatText }) : chatText ? `\n\nTHE USER'S CHAT MESSAGE:\n${chatText}` : ''}`;
          const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
            .map(value=>value.toString(16).padStart(2,'0')).join('');
          history.sourceSha256 ||= await digest(originalPng);
          const record = {attempt,startedAt:Date.now(),status:'reserved',comments:structuredClone(requestComments),
            request:{...selection,text,inputData,origin:context?.origin||{x:0,y:0},
              inputSha256:await digest(context?.inputPng||originalPng)},events:[]};
          history.attempts.push(record); history.status='generating';
          await persistScopedHistory();
          const dispatchOwner=getCurrent();
          if (['taskId','candidateId','epoch','selectionRevision'].some(key=>dispatchOwner[key]!==session[key])
              || dispatchOwner.sourcePng.length!==originalPng.length
              || dispatchOwner.sourcePng.some((value,index)=>value!==originalPng[index])) {
            throw new Error('입력 저장 중 작업·원본·박스가 변경되어 요청하지 않았습니다.');
          }
          try {
          const candidate = await new Promise((resolve, reject) => {
          requestPhase('generating');
          setGenerating(true, '선택 영역을 수정하고 있습니다', '원래 작업의 후보를 생성합니다. 다른 작업으로 이동해도 계속됩니다.');
          let turnId = null, threadId = null, ready = false, rawSrc = null, complete = false, settled = false, autoFinalizationSeen = false;
          const queued = [];
          const timer = setTimeout(() => finish(new Error('선택 영역 생성 응답 시간이 초과되었습니다. 자동 재생성하지 않습니다.')), 180000);
          const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); scopedTransport = null; error ? reject(error) : resolve(value); };
          const check = async () => {
            if (!complete || !rawSrc || settled) return;
            try { const data = await resolveGeneratedRaster(rawSrc, { whitePng: true }); record.rawPng=data; nativeRaw=scopedPngBytes(data); finish(null, nativeRaw); }
            catch (error) { finish(error); }
          };
          const handle = event => {
            if (settled || !requestStates.live(token)) return;
            if (!ready) { queued.push(event); return; }
            if (!((event.turnId && event.turnId === turnId) || (event.threadId && threadId && event.threadId === threadId))) return;
            if ((event.turnId && event.turnId !== turnId) || (event.threadId && threadId && event.threadId !== threadId)) return;
            if (!requestStates.accepts(token, event)) return;
            record.events.push({at:Date.now(),kind:event.kind,status:event.status||null,
              turnId:event.turnId||null,threadId:event.threadId||null});
            if (event.kind === 'image' && event.src) {
              requestPhase('validating');
              if (rawSrc) { finish(new Error('복수 이미지 응답은 지원하지 않습니다.')); return; }
              rawSrc = event.src; void check();
            }
            if (event.kind === 'assistant' && /EDIT_SCOPE_TOO_SMALL|EDIT_INSTRUCTION_UNCLEAR/.test(event.text || '')) {
              finish(new Error((event.text || '').replace('EDIT_SCOPE_TOO_SMALL', '수정 범위가 부족합니다. 박스를 넓혀 주세요.').replace('EDIT_INSTRUCTION_UNCLEAR', '코멘트를 더 명확하게 작성해 주세요.'))); return;
            }
            if (event.kind === 'error') finish(new Error(event.text || '선택 영역 생성 실패'));
            if (event.kind === 'finalization' && event.state === 'interrupting') autoFinalizationSeen = true;
            const terminal = scopedImageCompletionStatus(event, { hasImage: Boolean(rawSrc), autoFinalizationSeen, userCancelled: currentCancelRequested });
            if (terminal === 'reject') finish(new Error('유효한 PNG 완료를 확인하지 못했거나 사용자가 취소하여 적용하지 않았습니다.'));
            else if (terminal === 'complete') { complete = true; void check(); }
          };
          scopedTransport = { handle, fail: error => finish(error) };
          setStatus('박스 안의 요청한 부분만 수정 중 · 박스 밖은 원본 유지', 'busy');
          desktop.send({ purpose: 'image', ephemeralRender: true, conversationId: null,
            ...selection,
            attachments: scopedAttachments, text: requestText
          }).then(result => {
            if (!requestStates.bind(token, result)) { finish(new Error('생성 요청이 취소되었거나 작업 ID가 없습니다.')); return; }
            turnId = result.turnId; threadId = result.renderThreadId || result.threadId;
            record.turnId=turnId; record.threadId=threadId; record.sentAt=Date.now();
            if (!turnId) { finish(new Error('생성 작업 ID가 없어 결과를 안전하게 연결할 수 없습니다.')); return; }
            ready = true; for (const event of queued) handle(event);
          }).catch(error => finish(error));
          });
          record.endedAt=Date.now(); record.status='raw-returned';
          await persistScopedHistory();
          // 11-11: AI 그림 도구는 정해진 크기(1024 등)로 돌려준다 — 예전엔 1픽셀만 달라도 「크기 차이」로 막혀 부분 수정이 거의 늘 실패했다.
          // 돌려받은 그림을 지금 그림 크기에 맞춘다(가로세로 비율이 다르면 가운데를 같은 비율로 잘라 맞춤). 박스 밖은 합성 단계에서 원본으로 되돌린다.
          if (context) return restoreScopedEditContext(context, candidate);
          const fitted = await fitScopedCandidate(candidate, session.width, session.height);
          // 대화만으로 고친 경우(그림 전체가 허용 범위): AI가 다시 그리며 생긴 미세한 차이는 버리고 실제로 바뀐 덩어리만 남긴다.
          return captured?.wholeImage ? keepMeaningfulChanges(originalPng, fitted) : fitted;
          } catch (error) {
            record.endedAt=Date.now(); record.status='failed'; record.error=String(error.message||error);
            await persistScopedHistory(); throw error;
          }
        },
        verify: hasChecks ? async (proposal,{session}) => {
          lastVerification = await evaluateScopedEditPrecision({sourcePng:originalPng,rawPng:nativeRaw,
            finalPng:proposal.previewPng,origin:nativeContext?.origin||{x:0,y:0},
            rectangles:session.rectangles,checks});
          return lastVerification;
        } : undefined,
        onAttempt: async ({attempt,proposal,verification}) => {
          const record=history.attempts[attempt];
          record.finalPng=scopedPngData(proposal.previewPng);
          record.verification=verification?structuredClone(verification):null;
          record.status=verification?.status||'human-review-required';
          await persistScopedHistory();
        },
        confirmCorrection: hasChecks ? async (report,proposal) => {
          if (!scopedEditCorrectionFeedback(report)) return false;
          failureShown=true;
          requestPhase('confirmation-wait');
          setGenerating(true,'수치 검증 미달 · 적용 차단','같은 원본에서 오차로 한 번 교정하거나 취소하세요.');
          const comparison=await createScopedEditComparison(originalPng,proposal.previewPng);
          const measurements=report.checks.map(check=>{
            const m=check.metrics;
            return check.kind==='move'?`박스 ${check.box+1}: 기준 (${check.expectation.dx}, ${check.expectation.dy}) px · 측정 (${m.dx}, ${m.dy}) px`:
              check.kind==='circles'?`박스 ${check.box+1}: 추가 원 ${m.found}개`:
                `박스 ${check.box+1}: 끊긴 간격 ${m.gapWidth} px`;
          }).join('\n');
          return scopedDialog('수치 검증 미달',
            measurements+'\n이 후보는 적용할 수 없습니다. 측정 오차를 해당 박스 코멘트에 추가해 같은 깨끗한 원본에서 한 번만 교정합니다.',
            {content:comparison,accept:'오차로 한 번 교정'});
        } : undefined,
        review: async proposal => {
          requestPhase('confirmation-wait');
          setGenerating(true, '수정 후보 적용 확인 대기', '이 작업을 열어 원본과 후보를 비교한 뒤 적용하세요.');
          const comparison = await createScopedEditComparison(originalPng, proposal.previewPng);
          const borderNote = proposal.geometry?.kind === 'verified-border-only'
            ? '\n생성본의 1픽셀 테두리 차이를 확인하고 원본 크기를 유지했습니다. 그림은 확대·축소하지 않았습니다.' : '';
          return scopedDialog('수정 전후 비교',
            '박스 밖은 원본 그대로 보존했습니다. 박스 안에서도 요청한 부분만 바뀌었는지 확인하세요.' + borderNote +
              (hasChecks?'\n수치 기준을 통과했지만 외관과 비대상 보존은 직접 확인해야 합니다.':'') +
              '\n적용하면 기존 이미지를 유지하고 새 버전으로 추가합니다.',
            { content: comparison, accept: '적용' });
        },
        register: async (accepted, isCurrent, verification) => {
          requestPhase('validating');
          if (!isCurrent()) throw new Error('작업 또는 선택 영역이 변경되어 적용할 수 없습니다.');
          // Preserve editable labels, never the previous image's QA pass or byte bindings.
          const labelPlan = item.labelPlan?.frozen ? localEditableLabelPlan(item) : null;
          const added = await addPreview(scopedPngData(accepted), { alreadyEditable: true, isCurrent, labelPlan, reviewState: "scoped-applied", reviewReport: scopedAppliedReviewReport() });
          if (!added) throw new Error('선택 상태가 변경되어 적용하지 않았습니다.');
          added.sourceReferenceId = item.sourceReferenceId;
          added.sourceReferenceName = item.sourceReferenceName;
          added.markPolicy = structuredClone(item.markPolicy || {});
          labelPreviewState(added).included = labelPreviewState(item).included;
          void renderLabelPreview(added); syncLabelViewControls();
          if (verification) added.scopedPrecisionVerification=structuredClone(verification);
          if (!batchRun) { captureActiveTaskTab(); persistTasks(); syncSelectedOutputActions(); }
        }
      });
      history.status=done?'applied':'cancelled'; history.endedAt=Date.now();
      await persistScopedHistory();
      if (batchRun) {
        if (!done) throw new DOMException('선택 영역 수정 취소 · 원본 유지', 'AbortError');
        batchRun.resolve({...batchRun.context.owner,operation:'scoped-edit',candidateId:batchRun.candidate.id,candidate:snapshotImageItem(batchRun.candidate),scopeConfirmed:true,approved:true});
        return;
      }
      if (epoch === currentRequestEpoch) {
        if (done) {
          const owner = taskTabs.get(ownerTaskId);
          owner.workState = 'completed'; owner.inFlightRequest = null; owner.retryRequest = null;
          try { notifyHwpTask(ownerTaskId, 'completed'); } catch {}
          markTaskResult(owner, generatedImages.at(-1));
          await taskPersistence.checkpoint();
          requestPhase('completed'); renderTaskTabs();
        } else requestPhase('cancelled');
      }
      if (epoch === currentRequestEpoch) setStatus(done ? '선택 영역 수정 적용 완료 · 저장 또는 페이지 삽입 가능' : '선택 영역 수정 취소 · 원본 유지', done ? 'ok' : 'warn');
    } catch (error) {
      const cancelled = currentCancelRequested || error?.name === 'AbortError';
      history.status=cancelled?'cancelled':'failed';history.endedAt=Date.now();
      history.error={code:error.code||null,message:String(error.message||error)};
      await persistScopedHistory();
      batchRun?.reject(error);
      if (error.verification && !failureShown && !cancelled && epoch===currentRequestEpoch) {
        const last=history.attempts.at(-1);
        const comparison=last?.finalPng?await createScopedEditComparison(originalPng,scopedPngBytes(last.finalPng)):null;
        await scopedDialog('수치 검증 미통과 · 적용 차단',
          '대상 전체를 확실하게 측정하지 못했거나 수치 기준을 충족하지 않았습니다. 원본과 실패 기록을 유지하며 추가 자동 요청은 하지 않습니다.',
          {content:comparison,accept:'닫기'});
      }
      if (epoch === currentRequestEpoch) {
        requestPhase(cancelled ? 'cancelled' : 'failed');
        if (cancelled) {
          setStatus('선택 영역 수정 취소 · 원본 유지', 'warn');
        } else {
          setTaskState('failed');
          const reason = {
            SCOPED_EDIT_DIMENSIONS: '생성본 크기 차이가 1픽셀을 넘어 적용하지 않았습니다.',
            SCOPED_EDIT_MISSING_ALLOWED_PIXELS: '생성본에 수정 박스 안의 일부 픽셀이 없어 적용하지 않았습니다.',
            SCOPED_EDIT_ALIGNMENT_UNCONFIRMED: '생성본 크기가 달라졌으며 보존 영역에서 정렬을 확인하지 못해 적용하지 않았습니다.',
            SCOPED_EDIT_CHECKS_INVALID: error.message,
            SCOPED_EDIT_SOURCE_UNCERTAIN: error.message,
            SCOPED_EDIT_PRECISION: error.message,
          }[error.code];
          setStatus('선택 영역 수정 차단: ' + (reason ? reason + ' 원본은 유지했습니다.' : (error.message || error) + ' 지원하지 않는 PNG 치수·형식·메타데이터는 적용하지 않습니다.'), 'error', error);
        }
      }
    } finally {
      if (epoch === currentRequestEpoch && !batchRun) { setGenerating(false); setBusy(false); }
    }
  }

  // 11-11: 파일·붙여넣기·캡처 그림의 출처를 색으로 자동 판단한다(js/ai-source-detect.js). 애매하면 출처 줄을 보여 준다.
  let autoSourceDecision = null;
  async function detectReferenceSourceKind(item) {
    let kind = 'ambiguous';
    try {
      const image = new Image();
      image.src = item.data;
      await image.decode();
      const scale = Math.min(1, SOURCE_DETECT_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      kind = detectImageSourceKind(pixels.data, canvas.width, canvas.height).kind;
    } catch { kind = 'ambiguous'; }
    applyDetectedSourceKind(item, kind);
  }
  function applyDetectedSourceKind(item, kind) {
    // 11-22: 파일 여러 장을 넣으면 지금 보는 작업만 판단이 들어가고 나머지 작업은 출처가 비어 변환할 길이 없었다 —
    // 판단은 그림마다 기억해 두고(detectedSourceKind), 그 작업을 열 때·한꺼번에 변환할 때 쓴다.
    if (item && typeof item === 'object') item.detectedSourceKind = kind;
    if (!attachments.includes(item) || conversionKind !== 'image') return;
    const row = panel.querySelector('[data-ai-source-kind-row]');
    if (kind === 'ambiguous') { autoSourceDecision = null; if (row) row.hidden = false; syncSourceDecision(); return; }
    if (imageKindSelect && !imageKindSelect.value) {
      imageKindSelect.value = kind;
      imageKindSelect.dispatchEvent(new Event('change', { bubbles: true }));
      autoSourceDecision = kind;
    }
    if (row) row.hidden = true;
    syncSourceDecision();
  }
  // 11-11: 머리글 상태 줄「이미지 N개 · 기출로 판단 바꾸기」. 자동으로 정한 출처일 때만 보인다.
  function syncSourceDecision() {
    const box = panel.querySelector('[data-ai-source-decision]');
    if (!box) return;
    const kind = imageKindSelect?.value;
    const show = Boolean(autoSourceDecision) && conversionKind === 'image' && attachments.length > 0 && ['exam', 'general'].includes(kind);
    box.hidden = !show;
    if (show) box.querySelector('[data-ai-source-decision-text]').textContent = `${kind === 'exam' ? '기출' : '교과서'}로 판단 `;
  }
  panel.querySelector('[data-ai-source-flip]')?.addEventListener('click', () => {
    if (!imageKindSelect) return;
    imageKindSelect.value = imageKindSelect.value === 'exam' ? 'general' : 'exam';
    autoSourceDecision = imageKindSelect.value;
    imageKindSelect.dispatchEvent(new Event('change', { bubbles: true }));
    syncSourceDecision();
  });
  panel.querySelector('[data-ai-separation-manual]')?.addEventListener('click', () => panel.querySelector('[data-ai-editable-groups]')?.click());

  const addReferenceData = ({ data, name = "참고 이미지", sourceKind = "auto", source = null, sourceTextCandidates, referenceRole }) => {
    // 그래프 생성의 왼쪽 칸 그림은 복원할 원본이 아니라 모양 참고(10-22 A-3).
    if (conversionKind === 'graph-create' && referenceRole === undefined) referenceRole = 'STYLE_REFERENCE';
    const item = { id: `reference-${++imageSerial}`, name, data, kind: "reference", sourceKind, source, ...(sourceTextCandidates?{sourceTextCandidates}:{}), referenceRole, comments: [], nextCommentNumber: 1 };
    attachments.push(item);
    // 11-11: 출처를 모르는 외부 그림(파일·붙여넣기·캡처)은 색으로 자동 판단한다. 라이브러리 그림은 기존 출처를 쓴다.
    if (conversionKind === 'image' && !sourceImageKind(item) && typeof data === 'string' && data.startsWith('data:image')) void detectReferenceSourceKind(item);
    attachmentList.appendChild(item.card || makeImageCard(item));
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
    if (panel.dataset.aiSharingMode === 'view') return;
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
  const addPreview = async (src, { isCurrent = () => true, alreadyEditable = false, name, rendererPrompt = "", reviewState = "generating", reviewReport = emptyReviewReport(), reviewMeta = null, labelPlan = null, selectCandidate = true } = {}) => {
    if (!src) return false;
    let editableSrc = src;
    let postprocessOk = alreadyEditable;
    const whitePng = isWhitePngWorkflow(currentRunInput || { mode: selectedMode, outputEngine: selectedOutputEngine });
    const preserveRaster = whitePng || isExamBrief(currentRunInput);
    if (!alreadyEditable) {
      try {
        editableSrc = await resolveGeneratedRaster(src, { whitePng: preserveRaster, transform: transparentizeGeneratedImage });
        postprocessOk = true;
      } catch (error) {
        if (preserveRaster) throw error;
        if (isCurrent()) addLog(`배경 자동 투명화 실패: ${error.message}`, "error");
      }
    }
    if (!isCurrent()) return false;
    const item = {
      id: `generated-${++imageSerial}`,
      name: name || `생성 결과 ${generatedImages.length + 1}`,
      data: editableSrc,
      kind: "generated",
      ...(isExamBrief(currentRunInput) ? { examBriefProfile: EXAM_BRIEF_PROFILE } : {}),
      postprocessOk,
      reviewState,
      reviewReport: reviewReport ? JSON.parse(JSON.stringify(reviewReport)) : emptyReviewReport(),
      reviewMeta: reviewMeta ? { ...reviewMeta } : null,
      structureRecord: currentRunInput?.structureRecord ? JSON.parse(JSON.stringify(currentRunInput.structureRecord)) : null,
      rendererPrompt: typeof rendererPrompt === "string" ? rendererPrompt : "",
      labelPlan: labelPlan ? JSON.parse(JSON.stringify(labelPlan)) : null,
      ...(currentRunInput?.imageLabelWorkflow ? { imageLabelWorkflow: structuredClone(currentRunInput.imageLabelWorkflow) } : {}),
      generationMode: currentRunInput?.generationMode === 'separated' ? 'separated' : 'single',
      sourceReferenceId: currentRunInput?.attachments?.length === 1 ? currentRunInput.attachments[0].id : null,
      sourceReferenceName: currentRunInput?.attachments?.length === 1 ? currentRunInput.attachments[0].name : "",
      markPolicy: normalizeMarkPolicy(currentRunInput?.markPolicy),
      comments: [],
      nextCommentNumber: 1,
    };
    const inspectionStartedAt = performance.now();
    if (preserveRaster) {
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
    if (batchRun) { item.id=`workspace-${batchRun.context.jobId}-${batchRun.context.attempt}`; batchRun.candidate=item;return item; }
    latestGeneratedSrc = editableSrc;
    previews.querySelector("[data-ai-empty]")?.remove();
    generatedImages.push(item);
    if (selectCandidate) { selectedCandidateId = item.id; panel.dataset.aiSelectedCandidateId = item.id; }
    previews.prepend(item.card || makeImageCard(item));
    syncWhitePngUi();
    if (candidateUsesAutomaticSeparation(item)) void startAutomaticSeparation(item);
    if (currentRunInput?.approvedFirstPng) {
      currentTurnPerformance = { ...currentTurnPerformance, displayRegistrationMs: performance.now() - displayStartedAt };
    }
    return item;
  };

  function assertImmediateNativeBatchOwner(run, eventEpoch) {
    if (batchRun !== run || disposed || run.context.signal.aborted || currentCancelRequested
      || eventEpoch !== currentRequestEpoch || activeTaskTabId !== run.context.owner.taskId
      || !sameBatchOwner(batchOwner(run.context.owner.taskId), run.context.owner)) {
      throw new DOMException('이전 작업 결과입니다.', 'AbortError');
    }
  }
  function finishImmediateNativeBatch(run, candidate, eventEpoch) {
    if (!run) return false;
    assertImmediateNativeBatchOwner(run, eventEpoch);
    if (run.context.snapshot.operation !== 'generate' || currentEngine !== IMAGE_ENGINE_IDS.FAST_SCENE
      || normalizeOutputEngine(currentRunInput?.outputEngine) !== AI_OUTPUT_ENGINES.ASSET
      || currentRunInput?.imageLabelWorkflow?.explicit !== true || currentRunInput?.frozenLabelPlan
      || run.candidate !== candidate || candidate?.id !== `workspace-${run.context.jobId}-${run.context.attempt}`
      || candidate.graphResult || !candidate.sceneResult?.valid || !candidate.sceneResult?.supported
      || !Array.isArray(candidate.sceneResult.objects) || !candidate.sceneResult.objects.length) {
      throw new Error('검증된 네이티브 도식 작업의 완료 후보가 아닙니다.');
    }
    imageReceived = true; serverTurnFinished = true; currentTurnDone = true;
    currentTerminalOutcome = 'completed'; awaitingTurnId = false; previewPending = false;
    finishCurrentTurnUi(eventEpoch);
    return true;
  }

  const addScenePreview = (sceneResult, sceneSource, sceneCompileSource = sceneSource) => {
    if (!sceneResult?.valid || !sceneResult?.supported || !sceneResult.objects?.length) return false;
    const data = fastSceneToSvgDataUrl(sceneResult);
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
    if (batchRun) {
      item.id = `workspace-${batchRun.context.jobId}-${batchRun.context.attempt}`;
      batchRun.candidate = item;
      return item;
    }
    latestGeneratedSrc = data;
    previews.querySelector("[data-ai-empty]")?.remove();
    generatedImages.push(item);
    selectedCandidateId = item.id;
    panel.dataset.aiSelectedCandidateId = item.id;
    previews.prepend(item.card || makeImageCard(item));
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
      setStatus("결과를 확인하는 중…", "busy");
      setGenerating(true, "결과를 확인하고 있습니다", "요청 내용과 선택한 이미지를 비교합니다.", "analyze");
      return;
    }
    if (normalized.state === "correcting") {
      setStatus("수정 결과를 준비하는 중…", "busy");
      setGenerating(true, "수정 결과를 준비하고 있습니다", "요청한 부분을 반영하고 나머지 영역은 유지합니다.", "render");
      return;
    }
    if (!["passed", "needs-attention", "failed", "cancelled"].includes(normalized.state)) return;
    setGenerating(false);
    currentTurnDone = true;
    if (normalized.state === "passed" && candidate?.data) {
      currentReviewCandidate = candidate;
      stageCurrentOutput({ data: candidate.data, reviewVerified: true, reviewReport: normalized.report, labelPlan: candidate.labelPlan || null });
      setTaskState("completed");
      setStatus("결과 확인 완료 · 생성 완료", "ok");
      addLog("요청 내용과 선택한 이미지의 비교를 마쳤습니다.");
      void commitCurrentOutput();
    } else {
      pendingCacheOutput = null;
      if (normalized.state === "needs-attention") {
        setStatus("결과 확인 필요", "warn");
        addLog("결과를 직접 확인해 주세요. 이 결과는 확인 완료 상태로 재사용되지 않습니다.", "error");
      } else if (normalized.state === "cancelled") {
        setStatus("결과 확인 취소됨", "warn");
      } else {
        setStatus("결과 확인 실패", "error");
        addLog("결과 확인을 마치지 못했습니다. 입력과 생성 결과는 보존되었습니다.", "error");
      }
    }
    setBusy(false);
    captureActiveTaskTab();
    if (['passed', 'needs-attention'].includes(normalized.state)) markTaskResult(taskTabs.get(activeTaskTabId), candidate);
    void loadAccountOverview();
  };

  imageReview = createAiImageReviewController({
    transport: { send: (payload) => desktop.send(payload) },
    onState: handleReviewLifecycle,
  });

  let commentController = null;
  let workspaceReady = Promise.resolve();
  const taskStore = typeof indexedDB !== "undefined" ? new IndexedDBOutputCacheBackend({databaseName:clientScope ? `5e-ai-image-tasks-${clientScope}` : "5e-ai-image-tasks",storeName:"tasks"}) : null;
  restrictSharedWorkspace(panel);
  const captureActiveTaskTab = () => {
    const tab = taskTabs.get(activeTaskTabId);
    if (!tab) return;
    tab.attachments = attachments.map(taskItemCopy);
    tab.generated = generatedImages.map(taskItemCopy);
    taskViews.set(tab.id, { attachments, generatedImages, sourceSnapshot: tab.attachments, outputSnapshot: tab.generated });
    tab.conversationMessages = conversationMessages.map((message) => ({ ...message }));
    tab.uiMessages = Array.from(log.querySelectorAll(".ai-msg:not([data-ai-transient])")).map((node) => {
      // 11-19: 생성 탭의 진행 줄·결과 카드는 모양 정보(data-ai-chat)를 함께 남긴다.
      let chat = null; try { chat = node.dataset.aiChat ? JSON.parse(node.dataset.aiChat) : null; } catch { chat = null; }
      return {
        text: chat ? "" : node.textContent || "",
        kind: node.classList.contains("user") ? "user" : node.classList.contains("error") ? "error" : "assistant",
        ...(chat ? { chat } : {}),
      };
    });
    tab.selectedCandidateId = selectedCandidateId;
    tab.labelPreviewIncluded = Object.fromEntries(generatedImages.filter(hasPreviewLabels)
      .map(item => [item.id, labelPreviewState(item).included !== false]));
    tab.referenceComposition = structuredClone(referenceComposition);
    const workbenchState = panel.aiWorkbench?.getViewState?.();
    if (workbenchState) tab.workbenchViewState = { ...structuredClone(workbenchState), selectedCandidateId: tab.selectedCandidateId };
    const commentViewState=commentController?.getViewState?.();
    if(commentViewState)tab.commentViewState=structuredClone(commentViewState);
    tab.input = input.value;
    tab.conversationId = conversationId;
    tab.mode = selectedMode;
    tab.qualityMode = selectedQualityMode;
    tab.outputEngine = selectedOutputEngine;
    tab.generationMode = selectedAssetGenerationMode;
    tab.markPolicy = readMarkPolicy();
    tab.conversionKind = conversionKind;
    tab.preserveSourceLabels = readPreserveSourceLabels();
    tab.imageLabelWorkflow = readImageLabelWorkflow();
    tab.preciseRestore = preciseRestoreCheckbox?.checked === true;
    tab.outputOptions = normalizeImageOutputOptions(selectedImageOutputOptions);
    tab.separationMode = selectedSeparationMode;
    tab.singleBackgroundPolicy = singleBackgroundPolicy;
    if (modelsLoaded) {
      tab.model = isGraphWorkflow(conversionKind) ? GRAPH_WORKBENCH_SELECTION.model : modelSelect.value;
      tab.effort = isGraphWorkflow(conversionKind) ? GRAPH_WORKBENCH_SELECTION.effort : effortSelect.value;
      tab.serviceTier = isGraphWorkflow(conversionKind) ? null : speedSelect.value || null;
    }
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
    snapshot: () => ({key:"workspace",tabs:[...taskTabs.values()],activeTaskTabId,taskTabSerial,imageSerial,sharingMode:panel.dataset.aiSharingMode || null}),
    warn: error => addLog(`작업 임시저장 실패: ${error.message}. 창을 새로고침하지 마세요.`, "error"),
  });
  const persistTasks = () => taskPersistence.schedule();

  function markTaskResult(tab, candidate) {
    if (!tab || !candidate || disposed) return;
    // Capture the active live candidate before deriving the notification count.
    if (tab.id === activeTaskTabId) captureActiveTaskTab();
    if (markResultReady(tab, candidate)) { renderTaskTabs(); persistTasks(); }
  }
  function acknowledgeVisibleResult(expectedCandidateId = null) {
    if (panel.hidden || panel.inert || document.hidden || busy || panel.dataset.aiLayout === 'source') return;
    const selected = selectedOutputItem();
    if (!selected?.card || selected.card.hidden || selected.card.closest('[hidden]') || !selected.card.getClientRects().length) return;
    if (expectedCandidateId && selected.id !== expectedCandidateId) return;
    if (acknowledgeResult(taskTabs.get(activeTaskTabId), selected.id)) { renderTaskTabs(); persistTasks(); }
  }
  panel.addEventListener('click', event => {
    if (!event.isTrusted) return;
    if (event.target.closest('.ai-results, [data-ai-version-list], [data-ai-layout-mode]')) queueMicrotask(acknowledgeVisibleResult);
  }, { signal:lifecycle.signal });
  panel.addEventListener('keyup', event => {
    if (event.isTrusted && ['Enter',' '].includes(event.key) && event.target.closest('[data-ai-candidate-option], [data-ai-layout-mode]')) queueMicrotask(acknowledgeVisibleResult);
  }, { signal:lifecycle.signal });

  function setTaskState(workState) {
    const tab = taskTabs.get(activeTaskTabId);
    if (!tab) return;
    if (workState === 'busy') delete tab.generationNotice;
    if (workState === 'failed' && tab.generationNotice === 'review') workState = 'completed';
    if (tab.workState === workState) { renderTaskTabs(); return; }
    tab.workState = workState;
    try { notifyHwpTask(activeTaskTabId, workState); } catch {}
    if (workState === 'completed' && currentTurnType === 'image') {
      captureActiveTaskTab();
      markResultReady(tab, currentTurnCandidate || generatedImages.at(-1));
    }
    const removalRetry = workState === 'completed' && tab.sourceLabelObservation?.removalIncomplete === true;
    if (workState === 'completed') requestPhase('completed');
    else if (workState === 'failed') requestPhase(failedRequestPhase());
    if (workState === 'failed' || removalRetry) {
      tab.retryRequest = currentRequestSnapshot ? { type: currentTurnType, snapshot: structuredClone(currentRequestSnapshot) } : null;
    }
    if (workState !== 'busy') {
      tab.inFlightRequest = null;
      providerRequestPersistable = false;
    }
    if (!['busy', 'interrupted', 'failed'].includes(workState) && !removalRetry) tab.retryRequest = null;
    retryInterruptedButton.hidden = !['interrupted', 'failed'].includes(workState) && !removalRetry;
    retryInterruptedButton.textContent = removalRetry ? '제거 다시 시도' : workState === 'failed' ? (isCreationWorkflow(conversionKind) ? '다시 생성' : '변환 다시 시도') : '중단 작업 다시 시도';
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
    // 11-08: 다른 길(그래프 넘기기 등)로 작업 종류가 바뀌어도 창 제목·모양을 맞춘다.
    queueMicrotask(() => { try { syncSurfaceTitle(); } catch {} });
    if (!tabList) return;
    panel.dataset.aiResultCount = String([...taskTabs.values()].filter(tab => pendingResult(tab)).length);
    // 11-07: 그래프 작업의 결과 알림은 아래 「그래프」 단추에, 이미지 작업은 「AI 이미지」 단추에 띄운다.
    panel.dataset.aiGraphResultCount = String([...taskTabs.values()].filter(tab => pendingResult(tab) && isGraphWorkflow(tab.conversionKind)).length);
    syncResultEntry();
    // Task identity also exists during canceled preparation. Only a committed
    // drawing revision establishes the document connection shown to the user.
    const confirmedExamLinks = new Set((state.get().pages || [])
      .filter(page => page.meta?.examLink && page.meta.examRevisionId)
      .map(page => JSON.stringify([page.meta.examLink.tabId,page.meta.examLink.assetId])));
    const rows = [];
    for (const id of taskRows.keys()) if (!taskTabs.has(id)) taskRows.delete(id);
    for (const tab of taskTabs.values()) {
      const timingSample = sampleGenerationTiming(restoreGenerationTiming(tab.generationTiming, { interruptRunning: false }), Date.now());
      if (timingSample.timing) tab.generationTiming = timingSample.timing;
      const timingText = taskTimingLabel(tab, timingSample.view);
      const linked = !!tab.examLink && confirmedExamLinks.has(JSON.stringify([tab.examLink.tabId,tab.examLink.assetId]));
      const pending = pendingResult(tab);
      const values = [tab, tab.title, tab.workState, tab.id === activeTaskTabId, tab.attachments?.[0]?.data, tab.attachments?.length, Boolean(tab.referenceComposition), linked, timingText, taskDeleteShortcutHint(), pending, taskNeedsLabelReview(tab)];
      const cached = taskRows.get(tab.id);
      if (cached && values.every((value, index) => value === cached.values[index])) { rows.push(cached.row); continue; }
      const button = document.createElement("div");
      button.className = "ai-task-tab";
      button.classList.toggle("is-exam-linked", linked);
      button.dataset.tabId = tab.id;
      // 앞 결과를 그대로 두고 끝난 작업은 실패 표시(빨간 ×) 대신 완료로 보인다(시간 줄 글과 같게). 다시 시도 단추는 workState로 그대로.
      const endedPhase = requestStates.snapshot(tab.id)?.phase;
      button.dataset.workState = taskNeedsLabelReview(tab) ? "review" : endedPhase === 'kept-previous' && tab.workState === 'failed' ? 'completed' : tab.workState || "idle";
      const stateLabel = pending ? (tab.conversionKind === 'image-create' ? '생성 완료 · 새 결과' : '변환 완료 · 새 결과') : taskNeedsLabelReview(tab) ? '생성 완료 · 확인 사항'
        : ['kept-previous', 'offline-wait', 'login-wait'].includes(endedPhase) ? requestPhaseLabel(endedPhase)
        : { busy: "작업 중", interrupted: "작업 중단", completed: "작업 완료", failed: "작업 실패", idle: "대기" }[button.dataset.workState] || "대기";
      button.title = `${tab.title} · ${stateLabel} · ${taskDeleteShortcutHint()}`;
      if (["completed", "busy", "interrupted", "failed", "review"].includes(button.dataset.workState)) {
        const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        check.setAttribute("viewBox", "0 0 24 24");
        check.setAttribute("width", "14");
        check.setAttribute("height", "14");
        check.setAttribute("aria-hidden", "true");
        check.classList.add("ai-task-tab-status");
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const iconPath = {
          review: "M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
          completed: "m20 6-11 11-5-5",
          busy: "M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
          interrupted: "M12 7v6 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
          failed: "M12 8v4 M12 16h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
        };
        path.setAttribute("d", iconPath[button.dataset.workState]);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "2");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        check.append(path);
        button.append(check);
      }
      button.classList.toggle("is-on", tab.id === activeTaskTabId);
      const selectTab = document.createElement('button');
      selectTab.type = 'button';
      selectTab.className = 'ai-task-tab-select';
      selectTab.dataset.resultAttention = String(Boolean(pending));
      selectTab.setAttribute('aria-pressed', String(tab.id === activeTaskTabId));
      selectTab.setAttribute('aria-label', `${tab.title} · ${stateLabel}`);
      const source = (tab.attachments || [])[0];
      const thumbnailFrame = document.createElement('span');
      thumbnailFrame.className = 'ai-task-tab-thumb-frame';
      thumbnailFrame.setAttribute('aria-hidden', 'true');
      if (source?.data) {
        const thumbnail = document.createElement("img");
        thumbnail.className = "ai-task-tab-thumb";
        thumbnail.src = source.data;
        thumbnail.alt = "";
        thumbnailFrame.append(thumbnail);
      }
      selectTab.append(thumbnailFrame);
      const copy = document.createElement("span");
      copy.className = "ai-task-tab-copy";
      const label = document.createElement("span");
      label.className = "ai-task-tab-title";
      label.textContent = tab.title;
      label.title = tab.title;
      copy.append(label);
      const timingLabel = document.createElement("small");
      timingLabel.className = "ai-task-tab-time";
      timingLabel.textContent = timingText;
      copy.append(timingLabel);
      if (pending) {
        const notice = document.createElement('small'); notice.className = 'ai-result-notice'; notice.textContent = '새 결과'; copy.append(notice);
      }
      if ((tab.attachments || []).length > 1 && !tab.referenceComposition) {
        const warning = document.createElement("small");
        warning.textContent = "연결 확인 필요";
        copy.append(warning);
      }
      selectTab.append(copy);
      button.append(selectTab);
      selectTab.onclick = () => {
        if (busy || tab.id === activeTaskTabId) return;
        captureActiveTaskTab();
        restoreTaskTab(tab.id);
      };
      taskRows.set(tab.id, { values, row: button });
      rows.push(button);
    }
    navigationChanged(rows);
    tabList.querySelector(':scope > .ai-task-add')?.remove();
    if (panel.dataset.aiSharingMode !== 'view') {
      const addTask = document.createElement('button');
      addTask.type = 'button';
      addTask.className = 'ai-task-tab ai-task-add';
      addTask.dataset.aiTaskAdd = '';
      addTask.textContent = isGraphWorkflow(conversionKind) ? '＋ 그래프 추가' : '＋ 이미지 추가';
      addTask.title = isGraphWorkflow(conversionKind) ? '그래프 작업대에 새 그래프를 추가합니다' : '이미지를 추가할 새 이미지 작업대를 엽니다';
      addTask.disabled = false;
      addTask.onclick = () => { newWorkspace(); };
      tabList.append(addTask);
    }
  };

  const resetVisualLists = () => {
    attachmentList.replaceChildren();
    const emptyReference = document.createElement("p");
    emptyReference.className = "ai-reference-empty";
    emptyReference.dataset.aiReferenceEmpty = "";
    renderEmptySource(emptyReference);
    attachmentList.appendChild(emptyReference);
    previews.querySelectorAll(".ai-image-card, [data-ai-empty]").forEach((node) => node.remove());
  };

  function restoreTaskTab(tabId) {
    loading.reset();
    localEraseController?.cancel();
    closeComparison();
    outputProcessingRevision += 1;
    const tab = tabId === null ? { id: null, conversionKind } : taskTabs.get(tabId);
    if (!tab) return;
    conversionKind = normalizeAIWorkflowKind(tab.conversionKind, isExamBrief(tab));
    if (conversionKind === 'image-create') tab.examBriefProfile = EXAM_BRIEF_PROFILE;
    tab.conversionKind = conversionKind;
    abortAutomaticSeparation('task-changed');
    scopedSelectionRevision += 1;
    scopedTransport?.fail(new Error("작업 탭이 변경되었습니다."));
    activeTaskTabId = tab.id;
    window.dispatchEvent(new CustomEvent('5e:ai-task-change', { detail: { taskId: tab.id } }));
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
    selectedSeparationMode = normalizeSeparationMode(tab.separationMode || selectedSeparationMode);
    singleBackgroundPolicy = normalizeImageOutputOptions({ backgroundPolicy: tab.singleBackgroundPolicy ?? (selectedSeparationMode === AI_SEPARATION_MODES.OFF ? selectedImageOutputOptions.backgroundPolicy : undefined) }).backgroundPolicy;
    selectedAssetGenerationMode = tab.generationMode === AI_ASSET_GENERATION_MODES.SEPARATED
      ? AI_ASSET_GENERATION_MODES.SEPARATED : AI_ASSET_GENERATION_MODES.SINGLE;
    const restoringBeforeOutput = !(tab.generated?.length) && document.documentElement.dataset.mode !== 'lite';
    applySeparationMode(restoringBeforeOutput
      ? (selectedAssetGenerationMode === AI_ASSET_GENERATION_MODES.SINGLE ? AI_SEPARATION_MODES.OFF
        : selectedSeparationMode === AI_SEPARATION_MODES.OFF ? AI_SEPARATION_MODES.AUTO : selectedSeparationMode)
      : selectedSeparationMode);
    if (document.documentElement.dataset.mode === 'lite') {
      liteBackgroundPolicy = singleBackgroundPolicy;
      liteSeparationMode = [AI_SEPARATION_MODES.OFF, AI_SEPARATION_MODES.AUTO].includes(selectedSeparationMode) ? selectedSeparationMode : AI_SEPARATION_MODES.AUTO;
      liteHiddenOptionSnapshot = null;
    }
    if (modelsLoaded) restoreModelChoices();
    generationModeSelect.value = selectedAssetGenerationMode;
    const savedView = taskViews.get(tab.id);
    const cachedView = savedView && savedView.sourceSnapshot === tab.attachments && savedView.outputSnapshot === tab.generated
      && savedView.attachments.length === (tab.attachments || []).length && savedView.generatedImages.length === (tab.generated || []).length ? savedView : null;
    attachments = cachedView?.attachments || (tab.attachments || []).map(taskItemCopy);
    generatedImages = cachedView?.generatedImages || (tab.generated || []).map(taskItemCopy);
    referenceComposition = normalizeReferenceComposition(tab.referenceComposition, attachments);
    for (const item of generatedImages) {
      // Repair earlier saved manual versions that retained a placement digest
      // for the old bitmap. Raw/provider candidates keep their original checks.
      if (item.engine === 'local-erase' && item.labelPlan?.targetPlacement) {
        try { item.labelPlan = localEditableLabelPlan(item); }
        catch (error) { setStatus(`직접 수정본의 라벨을 확인해 주세요: ${error.message}`, 'error'); }
      }
      if (item.imageLabelWorkflow?.explicit) {
        const gate = enforceImageLabelAcceptance(item.reviewReport, { workflow: item.imageLabelWorkflow, candidateSha256: item.candidateSha256 });
        if (!isImageLabelCandidateAccepted(item)) item.reviewState = 'needs-attention';
        item.reviewReport = gate.report;
        if (item.labelPlan) { item.labelPlan.qualityReview = gate.report; item.labelPlan.reviewRequired = item.reviewState !== 'passed'; }
        item.verifiedCandidateData = null;
        if (item.reviewState === 'passed') void verifyImageLabelCandidateBytes(item).then(verified => {
          if (!verified) {
            item.reviewState = 'needs-attention';
            item.reviewReport = { ...item.reviewReport, verdict: 'uncertain', issues: [...item.reviewReport.issues, { message: '저장된 RAW 후보가 검수한 후보 바이트와 다릅니다.', severity: 'major' }] };
            if (item.labelPlan) item.labelPlan.reviewRequired = true;
            if (tab.selectedCandidateId === item.id && tab.workState === 'completed') tab.generationNotice = 'review';
          }
          if (generatedImages.includes(item)) {
            if (item.card) item.card.dataset.aiReviewState = item.reviewState;
            syncEditableLabelPlanButton(item); syncSelectedOutputActions();
            if (!verified) { captureActiveTaskTab(); persistTasks(); renderTaskTabs(); }
          }
        }).catch(() => {
          item.verifiedCandidateData = null; item.reviewState = 'needs-attention';
          item.reviewReport = { ...item.reviewReport, verdict: 'uncertain', issues: [...item.reviewReport.issues, { message: '저장된 RAW 후보의 바이트 검증을 완료하지 못했습니다.', severity: 'major' }] };
          if (item.labelPlan) item.labelPlan.reviewRequired = true;
          if (tab.selectedCandidateId === item.id && tab.workState === 'completed') tab.generationNotice = 'review';
          if (generatedImages.includes(item)) { if (item.card) item.card.dataset.aiReviewState = item.reviewState; syncEditableLabelPlanButton(item); syncSelectedOutputActions(); captureActiveTaskTab(); persistTasks(); renderTaskTabs(); }
        });
        continue;
      }
      // 11-10: 검수를 건너뛴 라벨 읽기·삭제 결과는 다시 불러와도 검수 기준 변경으로 바꾸지 않는다(ai-image-review.js isImageLabelCandidateAccepted와 같은 판정).
      if (item.reviewState === 'passed' && item.reviewReport?.reviewSkipped !== true && (item.imageLabelWorkflow?.labelResult === 'remove' ? !parseImageReviewReport(JSON.stringify(item.reviewReport), { requireLabelChecks: true, labelOutcome: 'remove' }).ok : item.labelPlan?.frozen ? !sourceReportVerified(item.reviewReport) : !parseImageReviewReport(JSON.stringify(item.reviewReport)).ok)) {
        item.reviewState = 'needs-attention';
        item.reviewReport = { verdict: 'uncertain', checks: [], issues: [{ message: '검수 기준이 변경되어 그림과 편집 라벨의 최종 화면을 다시 확인해야 합니다.', severity: 'major' }] };
      }
    }
    latestGeneratedSrc = generatedImages.at(-1)?.data || null;
    for (const item of generatedImages) {
      if (item.imageLabelWorkflow?.imageKind === 'exam') continue;
      const gated = enforcePngAcceptance({state:item.reviewState,report:item.reviewReport},item);
      item.reviewState = gated.state;
      item.reviewReport = gated.report;
    }
    restoreMarkPolicy(tab.markPolicyChosen ? tab.markPolicy : {...tab.markPolicy, leaders:'keep'});
    if (preserveSourceLabels) preserveSourceLabels.checked = tab.preserveSourceLabels === true;
    sourceChoicePending = false;
    if (imageKindSelect) imageKindSelect.value = tab.imageLabelWorkflow?.imageKind || '';
    // 11-22: 출처가 비어 있는 작업을 열면, 그 원본 그림을 넣을 때 해 둔 자동 판단을 넣는다(애매하면 출처 줄을 보여 준다).
    if (imageKindSelect && !imageKindSelect.value && (tab.conversionKind || 'image') === 'image') {
      const detected = (tab.attachments || []).find(item => item?.detectedSourceKind)?.detectedSourceKind;
      const row = panel.querySelector('[data-ai-source-kind-row]');
      if (['exam', 'general'].includes(detected)) { imageKindSelect.value = detected; autoSourceDecision = detected; if (row) row.hidden = true; }
      else if (detected === 'ambiguous' && row) row.hidden = false;
    }
    if (labelResultSelect) labelResultSelect.value = tab.imageLabelWorkflow?.labelResult || '';
    if (labelVerificationSelect) labelVerificationSelect.value = normalizeImageLabelWorkflow(tab.imageLabelWorkflow).verificationMode;
    compactSettings?.sync();
    if (preciseRestoreCheckbox) { preciseRestoreCheckbox.checked = tab.preciseRestore === true && imageKindSelect?.value === 'general'; preciseRestoreCheckbox.disabled = imageKindSelect?.value !== 'general'; }
    input.value = tab.input || "";
    log.replaceChildren();
    for (const message of tab.uiMessages || []) message.chat ? addChatEntry(message.chat) : addLog(message.text, message.kind);
    if (!log.children.length) {
      const emptyLog = document.createElement("p");
      emptyLog.className = "ai-log-empty";
      emptyLog.dataset.aiLogEmpty = "";
      emptyLog.textContent = "필요한 것을 말하거나 아래 단추를 바로 누르세요."; // 11-11: 네 작업 공통 안내
      log.appendChild(emptyLog);
    }
    resetVisualLists();
    for (const item of generatedImages) if (hasPreviewLabels(item)) {
      labelPreviewState(item).included = tab.labelPreviewIncluded?.[item.id] !== false;
    }
    for (const item of attachments) attachmentList.appendChild(item.card || makeImageCard(item));
    for (const item of generatedImages) previews.prepend(item.card || makeImageCard(item));
    if (!generatedImages.length) {
      const empty = document.createElement("p");
      renderEmptyResult(empty);
      previews.appendChild(empty);
    }
    syncMode();
    syncQualityMode();
    syncOutputEngine();
    syncLiteModeUi();
    syncReferenceSummary();
    selectedCandidateId = tab.selectedCandidateId || generatedImages.at(-1)?.id || null;
    panel.dataset.aiSelectedCandidateId = selectedCandidateId || "";
    panel.aiWorkbench?.restoreViewState?.({ ...tab.workbenchViewState, selectedCandidateId });
    renderTaskTabs();
    const removalRetry = tab.workState === 'completed' && tab.sourceLabelObservation?.removalIncomplete === true;
    retryInterruptedButton.hidden = !['interrupted', 'failed'].includes(tab.workState) && !removalRetry;
    retryInterruptedButton.textContent = removalRetry ? '제거 다시 시도' : tab.workState === 'failed' ? (isCreationWorkflow(tab.conversionKind || conversionKind) ? '다시 생성' : '변환 다시 시도') : '중단 작업 다시 시도';
    retryInterruptedButton.disabled = busy || !tab.retryRequest?.snapshot;
    const selectedCandidate = generatedImages.find((item) => item.id === selectedCandidateId) || generatedImages.at(-1) || null;
    if (selectedCandidate) {
      dispatchReviewEvent({
        state: selectedCandidate.reviewState || "idle",
        candidateId: selectedCandidate.id,
        report: selectedCandidate.reviewReport || emptyReviewReport(),
        generationCount: selectedCandidate.reviewMeta?.generationCount || 0,
        reviewCount: selectedCandidate.reviewMeta?.reviewCount || 0,
        model: selectedCandidate.reviewMeta?.model || modelSelect.value,
        effort: selectedCandidate.reviewMeta?.effort || effortSelect.value,
        elapsedMs: selectedCandidate.reviewMeta?.elapsedMs || 0,
      }, selectedCandidate, { restore: true });
    } else {
      dispatchReviewEvent({ state: "idle", candidateId: null, report: emptyReviewReport(), generationCount: 0, reviewCount: 0, elapsedMs: 0 });
    }
    commentController?.reset();
    commentController?.restoreViewState?.(tab.commentViewState);
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
      // Keep a recovered candidate visible even if the request checkpoint was
      // still running. Its own review state continues to govern insertion.
      generating.hidden = Boolean(selectedCandidate);
      progressTitle.textContent = "이전 이미지 작업이 중단되었습니다";
      progressDetail.textContent = generationTiming
        ? "마지막 저장 시점의 경과 시간에서 멈췄습니다. 자동 재전송하지 않았습니다."
        : "이전 작업의 시간 정보가 없어 자동 재전송하지 않았습니다.";
      renderGenerationTiming();
    } else if (!timingView?.running) {
      generating.hidden = true;
    }
    refreshOutputPreviews();
    if (candidateUsesAutomaticSeparation(selectedCandidate)) void startAutomaticSeparation(selectedCandidate);
  }

  const createTaskTab = ({ activate = true, kind = conversionKind } = {}) => {
    if (busy) return null;
    captureActiveTaskTab();
    // 다시 연 프로젝트의 작업 번호가 되돌아가 있으면 새 탭이 같은 id로 기존 탭을 덮어썼다(M41). 비어 있는 번호까지 넘긴다.
    let id;
    do id = `${clientScope ? clientScope + ":" : ""}task-${++taskTabSerial}`; while (taskTabs.has(id));
    taskTabs.set(id, {
      id,
      title: `작업 ${taskTabSerial}`,
      conversionKind:kind,
      ...(kind === 'image-create' ? {examBriefProfile:EXAM_BRIEF_PROFILE} : {}),
      attachments: [], generated: [], conversationMessages: [], uiMessages: [], input: "",
      generationTiming: null, model: 'gpt-6.1-sol', effort: 'medium',
      conversationId: null, mode: selectedMode, qualityMode: selectedQualityMode, outputEngine: selectedOutputEngine,
      preserveSourceLabels: false,
      imageLabelWorkflow: normalizeImageLabelWorkflow({ imageKind: 'general', labelResult: 'remove', auxiliaryMarks: 'keep', scientificArrows: 'keep', verificationMode: 'draft-first' }), preciseRestore: false,
      markPolicy: normalizeMarkPolicy({ arrows: 'keep', leaders: 'keep' }), markPolicyChosen: false,
      generationMode: AI_ASSET_GENERATION_MODES.SINGLE, outputOptions: normalizeImageOutputOptions(),
      separationMode: AI_SEPARATION_MODES.OFF, singleBackgroundPolicy: 'preserve',
      referenceComposition: normalizeReferenceComposition(null, []), workbenchViewState: null,
    });
    if (activate) restoreTaskTab(id);
    else renderTaskTabs();
    return id;
  };

  // 생성 탭 레퍼런스 4개를 넘겨 넣지 않은 수(안내 문구가 실제로 들어간 수를 말하게)
  let refusedReferences = 0;
  const referenceLimitStatus = () => {
    if (!refusedReferences) return false;
    setStatus(`레퍼런스는 최대 ${CREATION_REFERENCE_LIMIT}개까지 넣을 수 있습니다. ${refusedReferences}개는 넣지 않았습니다.`, 'warn');
    refusedReferences = 0; return true;
  };
  const addReferencesAsTasks = (references, { prompt = "", placement = "separate", groups = null, kind = conversionKind } = {}) => {
    refusedReferences = 0;
    if (panel.dataset.aiSharingMode === 'view') return [];
    if (busy) {
      setStatus("현재 변환이 끝난 뒤 이미지를 추가해 주세요.", "warn");
      return [];
    }
    if (!attachments.length && !generatedImages.length && !conversationMessages.length && !input.value.trim()) {
      const blank=taskTabs.get(activeTaskTabId);
      if(!blank?.markPolicyChosen)restoreMarkPolicy({...readMarkPolicy(),leaders:'keep'});
      conversionKind=kind;const empty=taskTabs.get(activeTaskTabId);if(empty)empty.conversionKind=kind;syncGraphWorkbenchUi();
    }
    const taskActions = {
      // 생성 탭(이미지 생성·그래프 생성)은 레퍼런스를 지금 작업에 더한다 — 결과가 있어도 새 작업을 만들지 않는다(10-22 A-3).
      canUseActiveTask: () => Boolean(activeTaskTabId) && conversionKind === kind && (isCreationWorkflow(kind) || (attachments.length === 0 && generatedImages.length === 0)),
      createTask: () => createTaskTab({kind}),
      addSource: reference => {
        if (isCreationWorkflow(conversionKind) && attachments.length >= CREATION_REFERENCE_LIMIT) { refusedReferences++; return; }
        const freshLibraryTask = attachments.length === 0 && generatedImages.length === 0
          && ["unified-library", "pdf-library", "pdf-crop"].includes(reference.sourceKind);
        if (freshLibraryTask) referenceComposition = normalizeReferenceComposition({ orientation: "free" }, []);
        addReferenceData(reference);
        if (attachments.length === 1 && generatedImages.length === 0 && imageKindSelect) {
          sourceChoicePending = false;
          imageKindSelect.value = sourceImageKind(reference);
          // 11-10: 기출은 라벨 복원(켬), 교과서는 라벨 삭제가 기본이다. 새 원본을 불러올 때만 정한다.
          if (labelResultSelect && taskTabs.get(activeTaskTabId)?.labelResultTouched !== true) labelResultSelect.value = defaultLabelResultFor(imageKindSelect.value);
          imageKindSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (attachments.length === 1 && generatedImages.length === 0) {
          panel.aiWorkbench?.restoreViewState?.({ layout: "side-by-side", ...(freshLibraryTask ? {tracking:true} : {}) });
        }
      },
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
    if ((placement === "together" || (isCreationWorkflow(kind) && kind === conversionKind && activeTaskTabId)) && references.length) {
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
      labelPlan: job.labelPlan ? JSON.parse(JSON.stringify(job.labelPlan)) : null,
      ...(job.workflowResult ? { imageLabelWorkflow: job.workflowResult.workflow, sourceLabelPlan: job.workflowResult.sourceLabelPlan,
        editableDraft: job.workflowResult.editableDraft || null,
        targetPlacement: job.workflowResult.targetPlacement, workflowMetrics: job.workflowResult.metrics, removalReport: job.workflowResult.removalReport,
        sourceSha256: job.workflowResult.sourceSha256, sourceFrame: job.workflowResult.sourceFrame, candidateFrame: job.workflowResult.candidateFrame,
        planSha256: job.workflowResult.planSha256, candidateSha256: job.workflowResult.candidateSha256,
        finalLabelComposite: job.workflowResult.finalLabelComposite, reviewState: job.workflowResult.report.verdict === 'pass' ? 'passed' : 'needs-attention', reviewReport: job.workflowResult.report } : {}),
      ...(job.frozenLabelPlan && !job.workflowResult ? { reviewState: job.labelPlan?.reviewRequired ? 'needs-attention' : 'passed', reviewReport: job.labelPlan?.qualityReview } : {}),
      comments: [],
      nextCommentNumber: 1,
    };
    if (job.workflowResult) item.verifiedCandidateData = job.workflowResult.data;
    if (activeTaskTabId === job.taskTabId) {
      generatedImages.push(item);
      latestGeneratedSrc = item.data;
      previews.querySelector("[data-ai-empty]")?.remove();
      previews.prepend(item.card || makeImageCard(item));
      captureActiveTaskTab();
    } else {
      const tab = taskTabs.get(job.taskTabId);
      if (tab) tab.generated.push(taskItemCopy(item));
    }
    markTaskResult(taskTabs.get(job.taskTabId), item);
  };

  const releaseBatchSlot = (job) => {
    if (!job.slotHeld) return;
    job.slotHeld = false;
    batchRunningCount = Math.max(0, batchRunningCount - 1);
    pumpBatchQueue();
  };

  const startBatchPass = async (job, pass = 1) => {
    if (job.imageLabelWorkflow || !job.whitePng) {
      try {
        const workflow = normalizeImageLabelWorkflow(job.imageLabelWorkflow, { requireExplicit: true });
        const abort = new AbortController(); job.workflowAbort = abort;
        const send = async payload => { const result = await desktop.send(payload); job.turnId = result?.turnId; return result; };
        job.labelController = createSourceLabelController({ transport: { send, interrupt: binding => desktop.interrupt(binding) } });
        job.rasterController = createImageLabelRasterController({ transport: { send, interrupt: binding => desktop.interrupt(binding) } });
        sourceLabelControllers.add(job.labelController); sourceLabelControllers.add(job.rasterController);
        const onPhase = phase => updateBatchCard(job, `${job.name} · ${phase}`);
        const tab = taskTabs.get(job.taskTabId), sourceHash = await imageLabelDigest(job.source.data);
        const result = await executeImageLabelRun({ legacyLabelPipeline: globalThis.__5eLegacyLabelPipeline === true, /* 11-10: 내부 시험용 예전 파이프라인 */ source: job.source, workflow, request: job.request, observer: job.labelController, raster: job.rasterController, readText: payload => desktop.readImageText(payload),
          selection: { model: job.model, effort: job.effort, serviceTier: job.serviceTier, models: availableModels }, artboard: { ...state.get().artboard }, signal: abort.signal,
          observation: tab?.sourceLabelObservations?.[sourceHash], onObservation: async observation => {
            if (abort.signal.aborted) throw new DOMException('작업이 취소되었습니다.', 'AbortError');
            if (tab) { tab.sourceLabelObservations ||= {}; tab.sourceLabelObservations[sourceHash] = structuredClone(observation); await taskPersistence.checkpoint(); }
          }, onPhase, cache: outputCache, backgroundCache: labelBackgroundCache, localRestore: createExamLocalRestore({ observer: job.labelController, raster: job.rasterController, onPhase }) });
        if (abort.signal.aborted) throw new DOMException('작업이 취소되었습니다.', 'AbortError');
        job.workflowResult = result; job.resultData = result.data; job.labelPlan = result.labelPlan; job.frozenLabelPlan = result.sourceLabelPlan;
        job.state = result.accepted ? 'complete' : 'failed'; job.pass = 1; job.elapsedMs = result.metrics.timings.total;
        updateBatchCard(job, `${result.accepted ? '완료' : '검수 미통과 · RAW 보존'} · ${(job.elapsedMs / 1000).toFixed(1)}초`);
        addBatchResultToTab(job);
        if (job.queueRecord && durableBatchUi) {
          if (result.accepted) await durableBatchUi.completed(job.queueRecord, { dataUrl: result.data, name: job.name });
          else await durableBatchUi.failed(job.queueRecord, '그림·스타일 검수 미통과. RAW 결과는 작업에서 확인할 수 있습니다.');
        }
        releaseBatchSlot(job);
      } catch (error) {
        job.state = 'failed'; job.error = error.message; updateBatchCard(job, `처리 중단 · ${error.message}`);
        if (job.queueRecord && durableBatchUi && error.name !== 'AbortError') await durableBatchUi.failed(job.queueRecord, error.message);
        releaseBatchSlot(job);
      }
      return;
    }
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
    job.labelPlan = job.frozenLabelPlan || null;
    try {
      const transport = await Promise.all(outgoing.map(prepareTransportItem));
      const comments = commentPrompt([sourceItem]);
      const request = revision
        ? `${job.request}${comments}\n원본과 직전 결과를 객체별로 비교하고 형태·개수·분기·연결이 달라진 부분만 교정해 줘. 맞는 영역은 그대로 보존해 줘.`
        : `${job.request}${comments}`;
      job.labelEvidence = request;
      const imageRequest = (job.whitePng ? buildWhitePngPrompt : buildImagePrompt)({
        request,
        mode: job.mode,
        revision,
        qualityMode: job.qualityMode,
        markPolicyContract: buildMarkPolicyContract(job.markPolicy),
      });
      if (job.preserveSourceLabels && !job.frozenLabelPlan) {
        job.labelController ||= makeSourceLabelController();
        job.sourceLabelAttachments = [transport[0]];
        updateBatchCard(job, '원본 라벨 확인 중…');
        job.frozenLabelPlan = await job.labelController.analyze({ request, attachments: job.sourceLabelAttachments,
          model: job.model, effort: job.effort, serviceTier: job.serviceTier, models: availableModels });
        if (!batchActive || job.state === 'cancelled') return;
        job.labelPlan = job.frozenLabelPlan;
      }
      const result = await desktop.send({
        text: sourceLabelRequest(imageRequest, job, labelEvidenceForRun(job, request, 1)),
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
    if (!job || ['complete', 'failed', 'reviewing'].includes(job.state)) return;
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
      if (job.frozenLabelPlan) return;
      if (job.labelPlan && !String(event.text || "").includes("<5e-editable-labels>")) return;
      job.responseText = event.text || "";
      job.labelPlan = parseEditableImageLabelPlan(job.responseText, labelEvidenceForRun(job, job.labelEvidence || job.request || "", 1));
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
    if (!job.labelPlan) job.labelPlan = parseEditableImageLabelPlan("", labelEvidenceForRun(job, job.labelEvidence || job.request || "", 1));
    if (!job.whitePng && job.qualityMode === AI_QUALITY_MODES.COMPLEX && job.pass === 1) {
      if (job.turnId) batchRuns.delete(job.turnId);
      await startBatchPass(job, 2);
      return;
    }
    if (job.frozenLabelPlan) {
      job.state = 'reviewing';
      updateBatchCard(job, '그림과 편집 라벨의 최종 화면 확인 중…');
      try {
        const report = await reviewSourceLabelCandidate({ controller: job.labelController, run: job,
          candidate: { name: job.name, data: job.resultData }, request: job.request,
          isCurrent: () => batchActive && job.state === 'reviewing' });
        job.labelPlan = { ...job.frozenLabelPlan, qualityReview: report, reviewRequired: report.verdict !== 'pass', status: report.verdict === 'pass' ? 'ready' : 'review' };
      } catch (error) {
        job.labelPlan = { ...job.frozenLabelPlan, reviewRequired: true, qualityReview: { verdict: 'uncertain', checks: [], issues: [{ message: error.message }] } };
      }
      if (!batchActive) return;
    }
    job.state = 'complete';
    job.elapsedMs = Math.round(performance.now() - job.startedAt);
    updateBatchCard(job, job.pass > 1
      ? `완료 · ${(job.elapsedMs / 1000).toFixed(1)}초 · 2회 · 구조 확인 필요`
      : `완료 · ${(job.elapsedMs / 1000).toFixed(1)}초${job.labelPlan?.reviewRequired ? ' · 라벨 확인 필요' : ''}`);
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
    let imageLabelWorkflow;
    try { imageLabelWorkflow = normalizeImageLabelWorkflow(readImageLabelWorkflow(), { requireExplicit: true }); }
    catch(error) { setStatus(error.message, 'warn'); return; }
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
        markPolicy: readMarkPolicy(), preserveSourceLabels: readPreserveSourceLabels(), qualityMode: selectedQualityMode, model: modelSelect.value || null,
        imageLabelWorkflow,
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
        preserveSourceLabels: readPreserveSourceLabels(),
        imageLabelWorkflow,
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
  function comparisonRevisions() {
    return allImages().map((item, index) => {
      const src = item.kind === 'generated' ? (item.outputImage?.src || item.data) : item.data;
      // 11-20 GRAPHFIX: 그래프 결과는 원본보다 넓은 출력 틀로 그려진다 — 원본 틀 자리를 함께 넘겨 1:1로 겹친다.
      const sourceFrame = item.graphResult ? workbenchGraphSourceFrame(src) : null;
      return { id: item.id, label: item.name || `이미지 ${index + 1}`, src, ...(sourceFrame ? { sourceFrame } : {}),
        comments: item.comments, kind: attachments.includes(item) ? 'original' : undefined };
    });
  }
  const openComparison = (pair = null) => {
    if (comparison) { closeComparison(); return; }
    if (pair instanceof Event) pair = null;
    const images = allImages();
    if (images.length < 2) { setStatus('비교할 이미지를 두 개 이상 추가해 주세요.', 'warn'); return; }
    comparisonHost.hidden = false;
    panel.querySelector('.ai-results')?.classList.add('is-wipe-comparing');
    compareButton.setAttribute('aria-pressed', 'true');
    compareButton.classList.add('is-on');
    comparison = mountRevisionComparison(comparisonHost, {
      revisions: comparisonRevisions(),
      selectedRevisionId: selectedOutputItem()?.id || selectedCandidateId,
      wipeOnly: true,
      // 11-19(시안 태그 23): 대화 결과 카드의 「비교」 — 그 결과가 왼쪽, 보는 결과가 오른쪽.
      ...(pair?.leftId && pair?.rightId ? { leftRevisionId: pair.leftId, rightRevisionId: pair.rightId } : {}),
    });
    scheduleCreateSync();
  };
  panel.addEventListener('click', event => {
    if (event.target.closest?.('[data-ai-layout-mode]')) closeComparison();
  }, { signal: lifecycle.signal });

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
    const body = document.createElement('div');
    body.className = 'ai-crop-body';
    const rightInspector = document.createElement('aside');
    rightInspector.className = 'ai-crop-inspector';
    rightInspector.setAttribute('aria-label', '캡처 옵션');
    body.append(stage, rightInspector);
    dialog.append(head, body, foot);
    overlay.appendChild(dialog);
    // body에는 앱 UI 배율(zoom)이 적용된다. 뷰포트 좌표를 쓰는 캡처막은 루트에 둬야 포인터와 일치한다.
    document.documentElement.appendChild(overlay);

    let start = null;
    let box = null;
    const magnifier = attachCropMagnifier({ surface: wrap, image, inspector: rightInspector, id: 'ai-capture-magnifier', available: () => overlay.isConnected && image.complete && image.naturalWidth > 0 });
    const closeCrop = () => { magnifier.destroy(); overlay.remove(); if (closeCapture === closeCrop) closeCapture = null; };
    closeCapture?.();
    closeCapture = closeCrop;
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
        lines.push(`- 영역 ${commentDisplayNumber(item, comment)} (가로 ${comment.x}%, 세로 ${comment.y}%, 너비 ${comment.w}%, 높이 ${comment.h}%): ${comment.text.trim()}`);
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
          : isExamBrief(runInput) ? EXAM_BRIEF_PROFILE : isWhitePngWorkflow(runInput) ? WHITE_PNG_VERSION : `${RASTER_STYLE_VERSION}+${qualityModeCacheVersion(runInput.qualityMode)}`,
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
        transparentBackground: !isExamBrief(runInput) && !isWhitePngWorkflow(runInput),
        examPalette: engine === IMAGE_ENGINE_IDS.RASTER && !isExamBrief(runInput) && !isWhitePngWorkflow(runInput),
        outputWorkflow: isExamBrief(runInput) ? EXAM_BRIEF_PROFILE : isWhitePngWorkflow(runInput) ? WHITE_PNG_VERSION : "legacy",
        markPolicy: isWhitePngWorkflow(runInput) ? normalizeMarkPolicy(runInput.markPolicy) : null,
        preserveSourceLabels: runInput.preserveSourceLabels === true,
        sourceLabelPolicyVersion: runInput.preserveSourceLabels ? SOURCE_LABEL_POLICY_VERSION : null,
        sourceLabelPlanVersion: runInput.preserveSourceLabels ? EDITABLE_IMAGE_LABEL_PLAN_VERSION : null,
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
    if (currentRunInput?.frozenLabelPlan && (!output?.reviewVerified || !sourceReportVerified(output.reviewReport))) return false;
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
        model: runInput.model, effort: runInput.effort, models: runInput.modelCatalog || availableModels,
        serviceTier: runInput.serviceTier,
        prepareCandidateAttachment: (item) => prepareTransportItem(item),
        makeCorrectionPayload: async ({ report, candidate: failedCandidate }) => ({
          text: withEditableImageLabelPlan(buildWhitePngPrompt({
            request: buildImageCorrectionRequest({ request: snapshot.request, report }),
            revision: true,
            revisionName: failedCandidate.name,
            discussionContext: snapshot.discussionContext,
            structureContract,
            markPolicyContract: buildMarkPolicyContract(runInput.markPolicy),
          }), labelEvidenceForRun(runInput, snapshot.renderRequest || snapshot.request)),
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
        acceptCorrectionAssistant: async (correctedCandidate, responseText) => {
          const plan = parseEditableImageLabelPlan(responseText, labelEvidenceForRun(runInput, snapshot.renderRequest || snapshot.request));
          attachEditableLabelPlan(correctedCandidate, plan);
          if (plan.labels.length) {
            addLog(`교정 결과에 편집 가능한 자동 라벨 ${plan.labels.length}개를 준비했습니다.${runInput.preserveSourceLabels ? " 원본에서 옮긴 내용과 위치를 확인해 주세요." : plan.reviewRequired ? " 위치와 제외 항목을 확인해 주세요." : ""}`);
          } else if (plan.status === "empty") {
            addLog("교정 결과의 확인된 입력에 문자 그대로 있는 라벨이 없어 이미지만 준비했습니다.");
          } else if (runInput.preserveSourceLabels) {
            addLog("교정 결과에서 옮길 원본 라벨을 확인하지 못했습니다. 이미지를 살펴보고 필요한 라벨을 직접 추가해 주세요.", "warn");
          } else {
            addLog("교정 결과의 자동 라벨 계획을 확인하지 못했습니다. 의미를 추측하지 않고 이미지만 준비했으니 필요한 라벨은 직접 추가해 주세요.", "error");
          }
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
        model: modelSelect.value,
        effort: effortSelect.value,
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
      // PATHFIX(11-20): 설치 안 됨과 로그인 안 됨을 나눈다 — 예전에는 codex를 못 찾아도 「ChatGPT 로그인 필요」였다.
      if (codexMissing(current)) {
        showCodexInstall(true);
        if (!busy) setStatus(CODEX_MISSING_STATUS, "warn");
        accountText.textContent = "Codex 프로그램이 필요합니다";
        return;
      }
      showCodexInstall(false);
      loginButton.hidden = current.login.loggedIn;
      if (!current.login.loggedIn) {
        if (!busy) setStatus("ChatGPT 로그인 필요", "warn");
        if (desktop.web) {
          loginButton.textContent = "ChatGPT 로그인";
          accountText.textContent = "ChatGPT 계정을 연결해 주세요";
          limitText.textContent = "로그인 후 한도를 확인할 수 있습니다";
          if (!modelSelect.value) modelSelect.replaceChildren(new Option("로그인 후 불러옵니다", ""));
          accountTokensText.textContent = "로그인 후 확인할 수 있습니다";
        }
      } else if (current.server) {
        // E9: 생성 중에 AI 창을 다시 열면(연결 확인) 「준비됨」이 진행 글을 덮어 아직 도는 작업이 끝난 것처럼 보였다.
        if (!busy) setStatus("준비됨", "ok");
        await Promise.all([loadModels({ refresh: true }), loadAccountOverview()]);
      } else if (autoConnect) {
        setStatus("AI 자동 연결 중…", "busy");
        const result = await desktop.start();
        if (!result.ok && aiErrorCode(result) === 'CODEX_NOT_FOUND') { showCodexInstall(true); setStatus(CODEX_MISSING_STATUS, "warn"); return; }
        setStatus(result.ok ? "준비됨" : `연결 실패: ${aiErrorText(result)}`, result.ok ? "ok" : "error", result.ok ? undefined : result);
        if (result.ok) await Promise.all([loadModels({ refresh: true }), loadAccountOverview()]);
      }
    } catch (error) {
      if (aiErrorCode(error) === 'CODEX_NOT_FOUND') { showCodexInstall(true); setStatus(CODEX_MISSING_STATUS, "warn"); reportAiError('codex:status', error); return; }
      setStatus(`상태 확인 실패: ${aiErrorText(error)}`, "error", error);
    }
  };
  if (desktop?.web) window.addEventListener('5e:web-ai-status', () => { void refresh(); }, { signal: lifecycle.signal });
  // 11-06: 한글 그림 편집 창에서 연 작업(AI 변환·복원)은 결과를 그 그림 자리로 돌려보낸다 — 작업 탭 id → 한글 그림.
  // (11-07: 맨 위로 옮김 — 처음 그릴 때부터 그래프 결과 단추·창 제목이 이 표를 본다.)
  // 11-06 D3~D5: 한글 그림에서 연 AI 작업은 창을 닫아도 계속 돈다. 상태가 바뀔 때마다 한글 칸에 알린다(그림 테두리·시간·끝 알림).
  function notifyHwpTask(taskId, workState) {
    const target = hwpInPlaceTargets.get(taskId);
    if (!target) return;
    window.dispatchEvent(new CustomEvent('5e:hwp-ai-task', { detail: { taskId, workState, target: structuredClone(target) } }));
  }
  const open = async ({ reference, references = [], prompt, examBriefProfile, startGeneration = false, placement = "separate", groups = null, reveal = true, taskId = null, candidateId = null, conversionKind:kind, acknowledge = false, hwpTarget = null } = {}) => {
    await workspaceReady;
    if (!activeTaskTabId && isCreationWorkflow(conversionKind)) createTaskTab();
    syncLiteModeUi();
    if (taskId && (busy || preflightRun)) throw new Error('현재 AI 작업을 마친 뒤 원래 작업 탭을 여세요.');
    if (taskId && taskTabs.has(taskId)) restoreTaskTab(taskId);
    if (taskId && candidateId && generatedImages.some(item => item.id === candidateId)) panel.dispatchEvent(new CustomEvent('5e:ai-candidate-select', {detail:{candidateId}}));
    const selectedObject=state.get().selectedIds?.length === 1 ? state.get().objects.find(o=>state.get().selectedIds?.includes(o.id)&&o.type==="image"&&o.aiTaskId) : null;
    if (!taskId && !busy && selectedObject && !reference && !references.length && taskTabs.has(selectedObject.aiTaskId)) {
      restoreTaskTab(selectedObject.aiTaskId);
      if (generatedImages.some((item) => item.id === selectedObject.aiCandidateId)) {
        panel.dispatchEvent(new CustomEvent('5e:ai-candidate-select', { detail: { candidateId: selectedObject.aiCandidateId } }));
      }
    }
    // Internal refresh/open calls are not evidence that the user viewed the result.
    const openingCandidateId = acknowledge ? selectedOutputItem()?.id : null;
    syncSelectedOutputActions();
    if (reveal) showWorkbench();
    const selectedForAutomaticSeparation = selectedOutputItem();
    if (panel.dataset.aiSharingMode !== 'view' && candidateUsesAutomaticSeparation(selectedForAutomaticSeparation)
      && selectedForAutomaticSeparation.automaticSeparationState !== 'ready') {
      void startAutomaticSeparation(selectedForAutomaticSeparation);
    }
    if (reveal) desktop?.setAiTaskShortcutActive?.(true);
    // 참고 이미지는 AI 연결 상태 조회와 무관하므로 즉시 불러온다.
    // 연결 확인을 먼저 기다리면 로컬 라이브러리 이미지도 몇 초 뒤에 나타나
    // 사용자가 버튼이 동작하지 않은 것으로 오해할 수 있다.
    const refreshPromise = reveal ? refresh() : Promise.resolve();
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
            ...(result.value.item.sourceTextCandidates ? {sourceTextCandidates:result.value.item.sourceTextCandidates} : {}),
            referenceRole: result.value.item.referenceRole,
          };
        } else {
          addLog(result.reason?.message || String(result.reason), "error");
        }
      }
      const readyReferences = loaded
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value.source);
      addReferencesAsTasks(readyReferences, { prompt, placement, groups, kind:kind || conversionKind });
      if (hwpTarget && activeTaskTabId && readyReferences.length) { hwpInPlaceTargets.set(activeTaskTabId, { ...structuredClone(hwpTarget), kind: isGraphWorkflow(kind || conversionKind) ? 'graph' : 'image' }); syncSelectedOutputActions(); persistTasks();
        // 11-07: 한글 그림(라벨 있는 기출)에서 연 이미지 작업은 라벨 복원을 켠 채로 시작한다(끄면 AI가 글자를 제 글씨로 그려 넣음).
        if (kind !== 'graph' && labelResultSelect && [...labelResultSelect.options].some(o => o.value === 'restore-editable' && !o.disabled)
          && labelResultSelect.value !== 'restore-editable') { labelResultSelect.value = 'restore-editable'; labelResultSelect.dispatchEvent(new Event('change', { bubbles: true })); } notifyHwpTask(activeTaskTabId, taskTabs.get(activeTaskTabId)?.workState || 'idle'); }
      const loadedCount = readyReferences.length;
      if (!referenceLimitStatus()) setStatus(loadedCount ? `이미지 ${loadedCount}개 · 작업 ${placement === "together" ? 1 : loadedCount}개 준비됨` : "이미지를 불러오지 못했습니다.", loadedCount ? "ok" : "error");
    }
    // Account/model reads must not delay local source handoff or window display.
    void refreshPromise;
    const restoredTab = taskTabs.get(activeTaskTabId);
    if (restoredTab?.workState === 'interrupted') {
      setStatus(restoredTab.retryRequest?.snapshot
        ? '이전 실행이 중단되었습니다. 자동 재전송하지 않았습니다. 다시 시도할 수 있습니다.'
        : '이전 실행이 중단되었습니다. 공급자 상태를 알 수 없어 자동 재전송하지 않았습니다.', 'warn');
    }
    if (!incoming.length && prompt) input.value = prompt;
    if (examBriefProfile === EXAM_BRIEF_PROFILE && taskTabs.has(activeTaskTabId)) {
      taskTabs.get(activeTaskTabId).examBriefProfile = EXAM_BRIEF_PROFILE;
      taskTabs.get(activeTaskTabId).conversionKind = conversionKind = 'image-create';
      selectedMode = 'complete'; selectedOutputEngine = 'raster';
      syncWhitePngUi(); captureActiveTaskTab(); persistTasks();
    }
    if (startGeneration === true && incoming.length >= 1) await submit("image");
    if (reveal) {
      if (openingCandidateId) acknowledgeVisibleResult(openingCandidateId);
      // 11-12: v6에서 오른쪽 탭(data-ai-side-tab)이 숨겨져, 숨은 탭에 초점을 주느라 초점이 창 밖(여는 단추)에 남았다 → 보이는 단추 중에서 고름.
      if (!panel.querySelector('[data-ai-chat-panel]')?.hidden && (input.getClientRects?.().length ?? 1)) input.focus();
      else { const focusables = typeof panelFocusables === 'function' ? panelFocusables() : []; (focusables.find(el => el.matches('[data-ai-side-tab="comments"]')) || focusables[0] || panel.querySelector('[data-ai-side-tab="comments"]'))?.focus(); }
    }
  };
  const close = ({ integratedEdit = false } = {}) => {
    localEraseController?.cancel();
    localVisibilityEpoch += 1;
    closeComparison(); closeCapture?.();
    abortAutomaticSeparation('panel-closed');
    captureActiveTaskTab(); persistTasks(); void taskPersistence.flush();
    motion.hide();
    // Closing makes the panel inert immediately. Return focus now, before the
    // user starts another canvas editor; a delayed return would blur its draft.
    if (!document.querySelector('.modal-overlay:not([hidden]):not([inert])')) document.getElementById('canvas')?.focus();
    desktop?.setAiTaskShortcutActive?.(false);
  };

  const panelFocusables = () => [...panel.querySelectorAll('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => {
      const closedDetails = element.closest('details:not([open])');
      return !element.disabled && !element.hidden && !element.closest('[hidden], [inert]')
        && (!closedDetails || element === closedDetails.querySelector(':scope > summary'))
        && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
    });
  let tabDirection = null;
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab' || panel.hidden || document.querySelector('dialog[open]')) return;
    tabDirection = event.shiftKey ? 'reverse' : 'forward';
    const focusables = panelFocusables();
    const first = focusables[0];
    const last = focusables.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      tabDirection = null;
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
      tabDirection = null;
    }
  }, { capture: true, signal: lifecycle.signal });
  panel.addEventListener('focusout', (event) => {
    const direction = tabDirection;
    if (!direction || panel.hidden || document.querySelector('dialog[open]') || panel.contains(event.relatedTarget)) return;
    queueMicrotask(() => {
      if (!panel.hidden && !document.querySelector('dialog[open]') && !panel.contains(document.activeElement)) {
        const focusables = panelFocusables();
        (direction === 'reverse' ? focusables.at(-1) : focusables[0])?.focus();
      }
      tabDirection = null;
    });
  }, { signal: lifecycle.signal });
  panel.addEventListener('focusin', () => { tabDirection = null; }, { signal: lifecycle.signal });

  disposalCallbacks.push(registerEscapeLayer(modal || panel, close));

  // ===== 11-19 그림 생성 화면(승인 시안 그림생성화면 v4, 태그 1~32) =====
  // 「생성」 탭(image-create)만 바꾼다. 변환·그래프는 그대로. 대화는 차례대로 쌓이는 말풍선·진행 줄·결과 카드,
  // 결과가 있으면 실행 단추는 「이 그림 고치기」, 레퍼런스가 없으면 결과만 크게.
  const isFigureCreate = () => conversionKind === 'image-create';
  const isMacKeys = () => keyLabel('Ctrl+K').startsWith('⌘');
  const shiftEnterLabel = () => (isMacKeys() ? '⇧Enter' : 'Shift+Enter');
  let blankPaperSource = null;
  const blankPaper = () => {
    if (blankPaperSource) return blankPaperSource;
    try { const canvas = document.createElement('canvas'); canvas.width = 1536; canvas.height = 1024; const g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 1536, 1024); blankPaperSource = canvas.toDataURL('image/png'); }
    catch { blankPaperSource = null; }
    return blankPaperSource;
  };
  let createComposeMode = 'auto'; // 'auto' = 결과가 있으면 고치기, 'new' = 「새로 그리기」 칩을 눌러 새 그림
  let createDrawScope = 'after-result'; // V5: 'after-result' = 결과 뒤 대화만(기본), 'all' = 「처음부터 다시 그리기」(새 대화 뒤 전체)
  const NEW_CHAT_DIVIDER = '여기부터 새 대화 · 위 대화는 그림에 쓰지 않아요';
  let resetPicked = false; // V5: 「새 대화」 뒤 결과를 다시 골랐다 → 그리기 단추가 다시 「이 그림 고치기」
  let createStatusBlock = null; // { node, rows, startedAt, timer, kind }
  let createCompareNote = null;
  let createSyncQueued = false;

  // --- 대화 기록(태그 4·9·11·13·19) ---
  const chatEntryNode = (entry) => {
    const node = document.createElement('div');
    node.className = `ai-msg ${entry.type === 'result' ? 'result' : entry.type === 'status' ? 'status' : entry.type === 'chips' ? 'assistant chips' : entry.type === 'divider' ? 'divider' : 'assistant'}`;
    node.dataset.aiChat = JSON.stringify(entry);
    return node;
  };
  function addChatEntry(entry) {
    if (!entry || !['result', 'status', 'chips', 'divider'].includes(entry.type)) return null;
    hideChatThinking();
    log.querySelector('[data-ai-log-empty]')?.remove();
    const node = chatEntryNode(entry);
    log.appendChild(node);
    if (entry.type === 'result') renderChatResult(node);
    else if (entry.type === 'chips') renderChatChips(node, entry);
    else if (entry.type === 'divider') { const label = document.createElement('span'); label.textContent = NEW_CHAT_DIVIDER; node.replaceChildren(label); node.setAttribute('role', 'separator'); }
    else renderStatusBlock(node, entry.rows || [], entry.elapsedMs, false);
    log.scrollTop = log.scrollHeight;
    return node;
  }
  // V5: 결과 카드 + 기록 안 「여기서 결과가 나왔다」 표시(다음 그리기는 이 뒤 대화만 읽는다).
  function addResultEntry(item) {
    const node = addChatEntry({ type: 'result', id: item.id });
    recordConversationMark({ role: RESULT_MARK, id: item.id, name: item.name || '' });
    return node;
  }
  // CHATFIX(11-20): 대화 안 다음 할 일 칩(「이대로 그리기」·「다시 그리기」·「한 번 더 고치기」·「말 바꿔 다시 적기」).
  // 칩마다 다시 실행할 내용(payload)을 함께 저장해, 작업을 바꿨다 돌아와도 같은 일을 한다.
  function renderChatChips(node, entry) {
    const row = document.createElement('div'); row.className = 'ai-chat-chips';
    for (const chip of entry.chips || []) {
      const button = document.createElement('button'); button.type = 'button'; button.className = `ai-chat-chip${chip.strong ? ' is-strong' : ''}`;
      button.dataset.aiChip = chip.id; button.dataset.aiFlowChip = '';
      if (chip.payload) button.dataset.aiChipPayload = JSON.stringify(chip.payload);
      button.textContent = chip.label; button.title = chip.title || chip.label; button.disabled = busy;
      row.append(button);
    }
    node.replaceChildren(row);
  }
  function addFlowChips(chips) {
    // 같은 종류의 앞 칩 줄은 지운다 — 다음 할 일은 마지막 한 줄만.
    log.querySelectorAll('.ai-msg.chips').forEach(node => node.remove());
    return addChatEntry({ type: 'chips', chips });
  }
  function renderStatusBlock(node, rows, elapsedMs, live) {
    const list = document.createElement('ul'); list.className = 'ai-status-rows';
    rows.forEach((row, index) => {
      const li = document.createElement('li'); li.className = `ai-status-row is-${row.state === 'current' && live ? 'current' : 'done'}`;
      const mark = document.createElement('i'); mark.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span'); text.textContent = statusRowText(live ? row : { ...row, state: 'done' });
      li.append(mark, text);
      if (index === rows.length - 1 && Number.isFinite(elapsedMs)) { const time = document.createElement('time'); time.textContent = clockText(elapsedMs); li.append(time); }
      list.append(li);
    });
    node.replaceChildren(list);
  }
  function startStatusBlock(kind, firstPhase = null) {
    finishStatusBlock();
    // 앞 차례의 끝난 진행 줄은 지운다 — 대화에는 말과 결과 카드만 차례로 남는다(시안 ④).
    log.querySelectorAll('.ai-msg.status').forEach(node => node.remove());
    const rows = firstPhase ? advanceStatusRows([], firstPhase) : [];
    const node = chatEntryNode({ type: 'status', rows });
    log.querySelector('[data-ai-log-empty]')?.remove();
    log.appendChild(node);
    const block = createStatusBlock = { node, rows, startedAt: Date.now(), kind, timer: null };
    const paint = () => { if (createStatusBlock === block) { renderStatusBlock(node, block.rows, Date.now() - block.startedAt, true); node.dataset.aiChat = JSON.stringify({ type: 'status', rows: block.rows, elapsedMs: Date.now() - block.startedAt }); } };
    block.paint = paint; paint();
    block.timer = setInterval(paint, 1000);
    log.scrollTop = log.scrollHeight;
    return block;
  }
  function statusPhase(phase, text) {
    const block = createStatusBlock; if (!block) return;
    const next = advanceStatusRows(block.rows, phase, { text });
    if (next === block.rows) return;
    block.rows = next; block.paint();
    log.scrollTop = log.scrollHeight;
  }
  function finishStatusBlock({ remove = false } = {}) {
    const block = createStatusBlock; if (!block) return;
    clearInterval(block.timer); createStatusBlock = null;
    if (remove || !block.rows.length) { block.node.remove(); return; }
    block.rows = settleStatusRows(block.rows);
    const elapsedMs = Date.now() - block.startedAt;
    renderStatusBlock(block.node, block.rows, elapsedMs, false);
    block.node.dataset.aiChat = JSON.stringify({ type: 'status', rows: block.rows, elapsedMs });
  }
  disposalCallbacks.push(() => { if (createStatusBlock) clearInterval(createStatusBlock.timer); });

  const createCompareState = () => {
    if (comparison) {
      const [left, right] = [...comparisonHost.querySelectorAll('.ai-comparison-choice select')].map(select => select.value);
      return { mode: 'slider', leftId: left || null, rightId: right || null };
    }
    if (['side-by-side', 'stacked'].includes(panel.dataset.aiLayout) && panel.dataset.aiResultOnly === 'true') {
      const leftId = panel.aiWorkbench?.compareSourceId?.() || null;
      if (leftId && leftId !== selectedCandidateId) return { mode: 'side', leftId, rightId: selectedCandidateId };
    }
    return null;
  };
  function renderChatResult(node) {
    let entry; try { entry = JSON.parse(node.dataset.aiChat || '{}'); } catch { entry = {}; }
    const item = generatedImages.find(candidate => candidate.id === entry.id);
    const card = document.createElement('div'); card.className = 'ai-chat-result';
    if (!item) { card.classList.add('is-gone'); card.textContent = '지운 결과'; node.replaceChildren(card); return; }
    const viewing = item.id === (selectedOutputItem()?.id);
    const compare = createCompareState();
    const side = compare ? (compare.leftId === item.id ? 'left' : compare.rightId === item.id ? 'right' : null) : null;
    card.classList.toggle('is-viewing', viewing);
    card.classList.toggle('is-compared', Boolean(side));
    const open = document.createElement('button'); open.type = 'button'; open.className = 'ai-chat-result-open'; open.dataset.aiChatOpen = item.id;
    open.title = viewing ? '지금 보는 결과' : `${item.name || '결과'}로 보기`;
    const thumb = document.createElement('img'); thumb.alt = ''; thumb.src = item.outputImage?.src || item.data; thumb.draggable = false;
    const meta = document.createElement('span'); meta.className = 'ai-chat-result-meta';
    const name = document.createElement('b'); name.textContent = item.name || '생성 결과';
    const sub = document.createElement('small'); sub.textContent = resultSubline(item, generatedImages);
    meta.append(name, sub); open.append(thumb, meta);
    card.append(open);
    if (side) { const badge = document.createElement('span'); badge.className = 'ai-chat-badge is-side'; badge.textContent = side === 'left' ? '왼쪽' : '오른쪽'; card.append(badge); }
    else if (viewing) { const badge = document.createElement('span'); badge.className = 'ai-chat-badge'; badge.textContent = '보는 중'; card.append(badge); }
    else if (generatedImages.length > 1) {
      const compareButton = document.createElement('button'); compareButton.type = 'button'; compareButton.className = 'ai-chat-badge ai-chat-compare';
      compareButton.dataset.aiChatCompare = item.id; compareButton.textContent = '비교';
      compareButton.title = `${item.name || '이 결과'}를 왼쪽에, 보는 결과를 오른쪽에 두고 비교합니다`;
      card.append(compareButton);
    }
    const chips = resultChips(item, { viewing, items: generatedImages, comparing: Boolean(compare), side, labelsOn: labelPreviewState(item).included !== false, canLabel: !item.labelPlan?.labels?.length });
    if (chips.length) {
      const row = document.createElement('div'); row.className = 'ai-chat-chips';
      for (const chip of chips) {
        const button = document.createElement('button'); button.type = 'button'; button.className = `ai-chat-chip${chip.strong ? ' is-strong' : ''}`;
        button.dataset.aiChip = chip.id; button.dataset.aiChipFor = item.id;
        if (chip.target) button.dataset.aiChipTarget = chip.target;
        if (chip.text) button.dataset.aiChipText = chip.text;
        button.textContent = chip.label;
        button.disabled = busy && chip.kind !== 'fill';
        button.title = chip.kind === 'fill' ? '입력칸에 말을 넣습니다 · 고친 뒤 실행하세요' : chip.label;
        row.append(button);
      }
      card.append(row);
    }
    node.replaceChildren(card);
  }
  const refreshChatResults = () => log.querySelectorAll('.ai-msg.result').forEach(renderChatResult);
  function addChatNote(text, { transient = false } = {}) {
    const node = addLog(text);
    if (node && transient) node.dataset.aiTransient = '';
    return node;
  }
  function setCompareNote(text) {
    createCompareNote?.remove(); createCompareNote = null;
    if (text) { createCompareNote = addChatNote(text, { transient: true }); }
  }

  // --- 화면 바꾸기(태그 1·2·3·17·18·20·21·22) ---
  let createDom = null;
  function ensureCreateDom() {
    if (createDom) return createDom;
    const dock = panel.querySelector('.ai-dock');
    const composer = panel.querySelector('.ai-chat-composer');
    const frame = document.createElement('div'); frame.className = 'ai-composer-frame'; frame.setAttribute('aria-hidden', 'true');
    const clip = document.createElement('button'); clip.type = 'button'; clip.className = 'ai-create-clip'; clip.dataset.aiCreateClip = '';
    clip.setAttribute('aria-haspopup', 'menu'); clip.setAttribute('aria-label', '레퍼런스 추가');
    clip.title = `레퍼런스 추가 (라이브러리 ${keyLabel('Ctrl+Shift+L').replace('Ctrl+Shift+', '⇧⌘').replace(/^⇧⌘/, isMacKeys() ? '⇧⌘' : 'Ctrl+Shift+')} · 파일 ${keyLabel('Ctrl+O')})`;
    clip.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m20.5 11.5-8.2 8.2a5.2 5.2 0 0 1-7.4-7.4l8.6-8.6a3.5 3.5 0 0 1 5 5l-8.6 8.5a1.8 1.8 0 0 1-2.5-2.5l7.9-7.9"/></svg>';
    const hint = document.createElement('span'); hint.className = 'ai-create-hint'; hint.dataset.aiCreateHint = '';
    const more = document.createElement('button'); more.type = 'button'; more.className = 'ai-create-more'; more.dataset.aiCreateMore = '';
    more.setAttribute('aria-haspopup', 'menu'); more.setAttribute('aria-expanded', 'false'); more.setAttribute('aria-label', '다른 그리기'); more.title = '다른 그리기 · 이 그림 고치기 / 새로 그리기 / 처음부터 다시 그리기 / 새 대화';
    more.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const moreMenu = document.createElement('div'); moreMenu.className = 'ai-create-menu ai-create-more-menu'; moreMenu.setAttribute('role', 'menu'); moreMenu.hidden = true;
    // CHATFIX(시안 대화생성분리 안 1 · 태그 10): 「묻기만」은 Enter(대화 보내기)로 옮겨 메뉴에서 뺐다.
    // V5(시안 대화창v5 태그 9): 이 그림 고치기 / 새로 그리기(결과 N 뒤 대화로) / 처음부터 다시 그리기(대화 전체로) / ─ / 새 대화.
    moreMenu.innerHTML = `<button type="button" role="menuitem" data-ai-create-edit>이 그림 고치기 <kbd>${isMacKeys() ? '⌘Enter' : 'Ctrl+Enter'}</kbd></button>`
      + '<button type="button" role="menuitem" data-ai-create-new>새로 그리기 <small data-ai-create-new-note>결과 뒤 대화로</small></button>'
      + '<button type="button" role="menuitem" data-ai-create-all>처음부터 다시 그리기 <small>대화 전체로</small></button>'
      + '<hr aria-hidden="true">'
      + '<button type="button" role="menuitem" data-ai-create-reset>새 대화 <small>대화를 비우고 결과는 남김</small></button>';
    // V5(태그 1·3): 입력칸 밖 「미리 말하는 줄」은 없앴다 — 같은 말은 그리기 단추 설명(title)과 「그릴 내용」 글로.
    dock?.prepend(frame);
    composer?.append(clip, hint, more, moreMenu);
    // 「＋ 레퍼런스」(결과 칸 머리줄) — 레퍼런스 0개인 생성 작업에서만(태그 2).
    const addRef = document.createElement('button'); addRef.type = 'button'; addRef.className = 'ai-create-add-ref'; addRef.dataset.aiCreateAddRef = '';
    addRef.setAttribute('aria-haspopup', 'menu'); addRef.textContent = '＋ 레퍼런스'; addRef.title = '레퍼런스 추가 · 파일·클립보드·자료 라이브러리';
    panel.querySelector('.ai-result-pane .ai-result-tools')?.before(addRef);
    const refMenu = document.createElement('div'); refMenu.className = 'ai-create-menu ai-create-ref-menu'; refMenu.setAttribute('role', 'menu'); refMenu.hidden = true;
    refMenu.innerHTML = `<button type="button" role="menuitem" data-ai-create-ref="library">자료 라이브러리에서 <kbd>${isMacKeys() ? '⇧⌘L' : 'Ctrl+Shift+L'}</kbd></button><button type="button" role="menuitem" data-ai-create-ref="file">파일에서 <kbd>${keyLabel('Ctrl+O')}</kbd></button><button type="button" role="menuitem" data-ai-create-ref="clipboard">클립보드에서 <kbd>${keyLabel('Ctrl+V')}</kbd></button>`;
    panel.querySelector('.ai-workbench')?.append(refMenu);
    // 11-20 사용자 결정: 「참고한 기출 3장」 띠(태그 3)는 뺐다. 엔진은 안에서 계속 참고 그림을 쓴다.
    // 그림 설정 한 줄 요약(태그 18)
    const caption = panel.querySelector('.ai-conversation-caption');
    const summary = document.createElement('span'); summary.className = 'ai-settings-oneline'; summary.dataset.aiSettingsOneline = '';
    const change = document.createElement('button'); change.type = 'button'; change.className = 'ai-settings-change'; change.dataset.aiSettingsChange = '';
    change.setAttribute('aria-expanded', 'false'); change.textContent = '바꾸기 ▾'; change.title = '배경 제거·객체 분리 설정 열기';
    caption?.querySelector('strong')?.after(summary, change);
    // V5(시안 대화창v5 태그 7 · 안 1): 머리줄 「바꾸기 ▾」 옆 「새 대화」 — 대화만 끊고 결과는 남긴다.
    const newChat = document.createElement('button'); newChat.type = 'button'; newChat.className = 'ai-create-newchat'; newChat.dataset.aiCreateNewchat = '';
    newChat.title = '새 대화 · 대화를 끊고 새로 시작합니다(위 대화는 그림에 쓰지 않음, 결과는 그대로)';
    newChat.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 8.5v3.5a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12V4A1.5 1.5 0 0 1 4 2.5h3.5"/><path d="m11.2 2.3 2.5 2.5-5.4 5.4-2.9.4.4-2.9z"/></svg>새 대화';
    change.after(newChat);
    newChat.addEventListener('click', () => startNewChat());
    const menus = [[clip, refMenu], [addRef, refMenu], [more, moreMenu]];
    let menuAnchor = null;
    const closeMenus = () => { for (const [button, menu] of menus) { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); } menuAnchor = null; };
    const openMenu = (button, menu) => {
      const was = !menu.hidden && menuAnchor === button;
      closeMenus(); if (was) return;
      menu.hidden = false; button.setAttribute('aria-expanded', 'true'); menuAnchor = button;
      const box = button.getBoundingClientRect(), host = panel.querySelector('.ai-workbench').getBoundingClientRect();
      if (menu === refMenu) {
        menu.style.left = `${Math.max(8, Math.min(box.left - host.left, host.width - 240))}px`;
        const below = button === addRef;
        menu.style.top = below ? `${box.bottom - host.top + 4}px` : '';
        menu.style.bottom = below ? '' : `${host.bottom - box.top + 6}px`;
      }
      menu.querySelector('button')?.focus();
    };
    clip.addEventListener('click', () => openMenu(clip, refMenu));
    addRef.addEventListener('click', () => openMenu(addRef, refMenu));
    more.addEventListener('click', () => openMenu(more, moreMenu));
    refMenu.addEventListener('click', event => {
      const action = event.target.closest('[data-ai-create-ref]')?.dataset.aiCreateRef; if (!action) return;
      closeMenus();
      if (busy) return;
      if (action === 'file') { if (!file.disabled) file.click(); }
      else if (action === 'clipboard') void pickFromClipboard();
      else referenceSearchButton?.click();
    });
    moreMenu.addEventListener('click', event => {
      const editNow = event.target.closest('[data-ai-create-edit]'), fresh = event.target.closest('[data-ai-create-new]');
      const all = event.target.closest('[data-ai-create-all]'), reset = event.target.closest('[data-ai-create-reset]');
      closeMenus();
      if (editNow) { createComposeMode = 'auto'; createDrawScope = 'after-result'; createGenerate(); }
      if (fresh) startNewDrawingCompose();
      if (all) startNewDrawingCompose({ scope: 'all' });
      if (reset) startNewChat();
    });
    document.addEventListener('pointerdown', event => { if (menuAnchor && !event.target.closest('.ai-create-menu, [data-ai-create-clip], [data-ai-create-add-ref], [data-ai-create-more]')) closeMenus(); }, { capture: true, signal: lifecycle.signal });
    for (const [, menu] of menus) menu.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); const anchor = menuAnchor; closeMenus(); anchor?.focus(); }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); const items = [...menu.querySelectorAll('button')]; const at = items.indexOf(document.activeElement); items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
    });
    change.addEventListener('click', () => {
      const open = panel.dataset.aiSettingsOpen !== 'true';
      panel.dataset.aiSettingsOpen = String(open); change.setAttribute('aria-expanded', String(open));
      change.textContent = open ? '접기 ▴' : '바꾸기 ▾';
    });
    // GENSPEED 안 C(태그 6, 11-20 사용자 결정): 「글자 바꾸기 빠르게」 켬/끔 — 바꾸기 ▾ 메뉴 한 줄, 기본 끔, 저장값 5e.aiEngine.figureLocalReplace.
    const fastReplace = panel.querySelector('[data-ai-fast-replace-group]');
    const syncFastReplace = () => {
      const on = figureLocalReplaceFlag();
      for (const button of fastReplace?.querySelectorAll('[data-ai-fast-replace]') || []) {
        const selected = (button.dataset.aiFastReplace === '1') === on;
        button.classList.toggle('is-on', selected); button.setAttribute('aria-pressed', String(selected));
      }
    };
    // 11-21: 「글자 빠르게」 줄은 숨겼다(css). 예전에 켜 둔 값이 보이지 않는 채로 남지 않게 처음 열 때 끔으로 돌린다.
    try { if (globalThis.localStorage?.getItem(AI_ENGINE_FLAG_KEYS.figureLocalReplace) === '1') globalThis.localStorage.setItem(AI_ENGINE_FLAG_KEYS.figureLocalReplace, '0'); } catch { /* 저장소를 못 쓰면 기본(끔) */ }
    fastReplace?.addEventListener('click', event => {
      const button = event.target.closest('[data-ai-fast-replace]'); if (!button || button.disabled) return;
      try { globalThis.localStorage?.setItem(AI_ENGINE_FLAG_KEYS.figureLocalReplace, button.dataset.aiFastReplace === '1' ? '1' : '0'); } catch { /* 저장소를 못 쓰면 기본(끔) */ }
      syncFastReplace();
    });
    syncFastReplace();
    log.addEventListener('click', onChatClick);
    // V5(태그 4·5): 대화 칸 폭 손잡이(420~820, 저장, 두 번 누르면 처음 폭)
    installChatWidth(panel, { signal: lifecycle.signal });
    createDom = { frame, clip, hint, more, moreMenu, addRef, refMenu, summary, change, newChat, closeMenus };
    return createDom;
  }

  // CHATFIX: 「새로 그리기」 = 대화(+ 입력칸 글)로 새 그림. 예전처럼 첫 결과의 요청(「지금 이미지를 생성중이야?」였음)을 입력칸에 넣지 않는다.
  // V5(태그 9·16): 「새로 그리기」는 마지막 결과 뒤 대화만, 「처음부터 다시 그리기」(scope 'all')는 「새 대화」 뒤 대화 전체.
  function startNewDrawingCompose({ scope = 'after-result' } = {}) {
    createComposeMode = 'new'; createDrawScope = scope;
    chatInput.focus(); chatInput.setSelectionRange?.(chatInput.value.length, chatInput.value.length);
    scheduleCreateSync();
  }

  // V5(시안 대화창v5 ⑤ · 태그 12·13·14): 「새 대화」 — 대화 맨 아래 구분 줄, 위 대화·결과 카드는 흐리게 남김(지우지 않음),
  // 결과는 결과 목록·작업 목록에 그대로, 그리기 단추는 「이미지 생성」으로. 대화 AI도 새 대화로 시작한다. 누른 직후 5초 「되돌리기」.
  let newChatUndo = null; // { node, conversationId, timer }
  function startNewChat() {
    if (busy) { setStatus('그리는 중이에요 · 끝난 뒤에 새 대화를 시작하세요.', 'warn'); return; }
    if (!conversationMessages.some(message => message.role === 'user' || message.role === 'assistant') || resetIsLast(conversationMessages)) return;
    clearNewChatUndo();
    recordConversationMark({ role: RESET_MARK });
    const node = addChatEntry({ type: 'divider' });
    const previousConversationId = conversationId;
    conversationId = null;
    try { localStorage.removeItem(`5e.aiConversationId${clientScope ? ":" + clientScope : ""}`); } catch { /* 다음 대화에서 새 스레드 */ }
    resetPicked = false; createComposeMode = 'auto'; createDrawScope = 'after-result';
    log.querySelectorAll('.ai-msg.chips').forEach(chips => chips.remove()); // 앞 대화의 「이대로 그리기」 칩은 새 대화에 맞지 않는다
    if (node) newChatUndo = { conversationId: previousConversationId, timer: setTimeout(clearNewChatUndo, 5000) };
    chatInput.focus();
    captureActiveTaskTab(); persistTasks();
    scheduleCreateSync();
  }
  function clearNewChatUndo() {
    if (!newChatUndo) return;
    clearTimeout(newChatUndo.timer); newChatUndo = null;
    log.querySelectorAll('[data-ai-newchat-undo]').forEach(button => button.remove());
  }
  function undoNewChat() {
    if (!newChatUndo) return;
    const { conversationId: kept } = newChatUndo; clearTimeout(newChatUndo.timer); newChatUndo = null;
    const at = conversationMessages.map(message => message.role).lastIndexOf(RESET_MARK);
    if (at >= 0) { conversationMessages = conversationMessages.filter((_, index) => index !== at); try { saveConversationMessages(); } catch { /* 화면에서만 */ } }
    [...log.querySelectorAll(':scope > .ai-msg.divider')].at(-1)?.remove();
    if (kept && !conversationId) { conversationId = kept; try { localStorage.setItem(`5e.aiConversationId${clientScope ? ":" + clientScope : ""}`, kept); } catch { /* 화면에서만 */ } }
    captureActiveTaskTab(); persistTasks();
    scheduleCreateSync();
  }
  // 마지막 구분 줄 위의 대화·결과 카드를 흐리게(시안 태그 12). 「되돌리기」는 누른 직후 5초 동안 마지막 구분 줄에만.
  function dimBeforeReset() {
    const nodes = [...log.querySelectorAll(':scope > .ai-msg')];
    let last = -1;
    nodes.forEach((node, index) => { if (node.classList.contains('divider')) last = index; });
    nodes.forEach((node, index) => node.classList.toggle('is-before-reset', index < last));
    const divider = last >= 0 ? nodes[last] : null;
    log.querySelectorAll('[data-ai-newchat-undo]').forEach(button => { if (!newChatUndo || button.parentElement !== divider) button.remove(); });
    if (newChatUndo && divider && !divider.querySelector('[data-ai-newchat-undo]')) {
      const undo = document.createElement('button'); undo.type = 'button'; undo.dataset.aiNewchatUndo = ''; undo.textContent = '되돌리기';
      undo.title = '새 대화를 취소하고 앞 대화를 이어 갑니다';
      undo.addEventListener('click', () => undoNewChat());
      divider.append(undo);
    }
  }

  function onChatClick(event) {
    const open = event.target.closest('[data-ai-chat-open]');
    if (open) { selectCreateResult(open.dataset.aiChatOpen); return; }
    const compareTarget = event.target.closest('[data-ai-chat-compare]');
    if (compareTarget) { openResultCompare(compareTarget.dataset.aiChatCompare); return; }
    const chip = event.target.closest('[data-ai-chip]');
    if (!chip) return;
    if (chip.matches('[data-ai-flow-chip]')) { onFlowChip(chip); return; }
    const item = generatedImages.find(candidate => candidate.id === chip.dataset.aiChipFor);
    switch (chip.dataset.aiChip) {
      case 'revert': selectCreateResult(chip.dataset.aiChipTarget); return;
      case 'compare-close': closeResultCompare(); return;
      case 'redraw': startNewDrawingCompose(); return;
      case 'label-restore': if (item) void runLabelRestoreTurn(item); return;
      case 'label-toggle': if (item?.id === selectedOutputItem()?.id) labelToggle?.click(); scheduleCreateSync(); return;
      case 'label-edit': panel.querySelector('[data-ai-label-edit]')?.click(); return;
      default: {
        // 칩은 입력칸에 말만 넣는다(시안 「정할 것」 권함). 바로 실행하지 않는다.
        const text = chip.dataset.aiChipText || chip.textContent;
        createComposeMode = 'auto';
        chatInput.value = text; chatInput.focus(); chatInput.setSelectionRange?.(text.length, text.length);
        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
        scheduleCreateSync();
      }
    }
  }
  function selectCreateResult(id) {
    if (!id || !generatedImages.some(item => item.id === id)) return;
    if (comparison) closeComparison();
    panel.aiWorkbench?.select?.(id);
    scheduleCreateSync();
  }
  function openResultCompare(leftId) {
    const right = selectedOutputItem();
    if (!right || leftId === right.id) return;
    if (comparison) closeComparison();
    if (['side-by-side', 'stacked'].includes(panel.dataset.aiLayout)) {
      // 좌우·상하 비교 중이면 그 보기를 그대로 두고 왼쪽(비교 대상)만 바꾼다.
      panel.aiWorkbench?.setCompareSource?.(leftId);
    } else openComparison({ leftId, rightId: right.id });
    if (!busy) log.querySelectorAll('.ai-msg.status').forEach(node => node.remove());
    scheduleCreateSync();
  }
  function closeResultCompare() {
    if (comparison) closeComparison();
    if (['side-by-side', 'stacked'].includes(panel.dataset.aiLayout)) panel.aiWorkbench?.setLayout?.('result');
    setCompareNote(null);
    scheduleCreateSync();
  }

  // V5(안 A · 태그 10): 결과 제목 ▾ 목록에 작은 그림 · 한 일 · 시각. 작업대가 늦게 생겨도 처음 맞출 때 단다.
  let versionDescriberSet = false;
  function ensureVersionDescriber() {
    if (versionDescriberSet || !panel.aiWorkbench?.setVersionDescriber) return;
    versionDescriberSet = true;
    panel.aiWorkbench.setVersionDescriber((id) => {
      if (!isFigureCreate()) return null;
      const item = generatedImages.find(candidate => candidate.id === id);
      if (!item) return null;
      const ms = item.meta?.ui?.elapsedMs;
      return { thumb: item.outputImage?.src || item.data, sub: [resultActionText(item, generatedImages), Number.isFinite(ms) ? clockText(ms) : null].filter(Boolean).join(' · ') };
    });
  }
  // V5: 지금 그리기 단추가 할 일 — 'stop' | 'edit' | 'new'(이미지 생성) | 'fresh'(▾ 새로 그리기) | 'all'(▾ 처음부터 다시 그리기)
  function createDrawMode(item = selectedOutputItem()) {
    if (busy && !insertingOutput) return 'stop';
    if (createComposeMode === 'new' && item) return createDrawScope === 'all' ? 'all' : 'fresh';
    if (item && !(resetIsLast(conversationMessages) && !resetPicked)) return 'edit';
    return 'new';
  }
  // V5(태그 16): 다음 그리기가 읽을 대화. 결과가 있으면 그 결과 뒤만, 「처음부터 다시 그리기」면 새 대화 뒤 전체.
  function gatherForDraw(text, mode) {
    const resultIds = generatedImages.map(item => item.id);
    return gatherDrawRequest(conversationMessages, text, { scope: mode === 'all' ? 'all' : 'after-result', resultIds });
  }

  function scheduleCreateSync() {
    if (createSyncQueued) return;
    createSyncQueued = true;
    queueMicrotask(() => { createSyncQueued = false; try { syncCreationUi(); } catch (error) { console.warn('[5E 생성 화면]', error); } });
  }
  function syncCreationUi() {
    if (disposed) return;
    const on = isFigureCreate();
    panel.dataset.aiCreateUi = String(on);
    const dom = ensureCreateDom();
    const resultOnly = on && attachments.length === 0;
    panel.dataset.aiResultOnly = String(resultOnly);
    panel.aiWorkbench?.setResultOnly?.(resultOnly);
    if (!on) { dom.closeMenus(); setCompareNote(null); return; }
    ensureVersionDescriber();
    const item = selectedOutputItem();
    // 실행 단추(태그 6·22): 그리는 중 = 멈추기, 결과가 있으면 「이 그림 고치기」, 없으면(또는 「새 대화」 뒤) 「이미지 생성」.
    const mode = createDrawMode(item);
    const running = mode === 'stop', editing = mode === 'edit';
    // 입력칸 안 A(11-21): 대화 답을 기다릴 때와 그릴 때 멈추기를 나눠 보인다(대화 중 멈추기를 그리기 멈추기로 알고 누르던 일).
    const stopLabel = currentTurnType === 'chat' ? '대화 멈추기' : '그리기 멈추기';
    const label = { stop: stopLabel, edit: '이 그림 고치기', fresh: '새로 그리기', all: '처음부터 다시 그리기', new: '이미지 생성' }[mode];
    if (sendButton.textContent !== label) sendButton.textContent = label;
    sendButton.dataset.aiCreateState = running ? 'stop' : editing ? 'edit' : 'new';
    sendButton.disabled = running ? false : busy;
    const modKey = isMacKeys() ? '⌘' : 'Ctrl+';
    const fresh = mode === 'fresh' || mode === 'all';
    // V5(태그 1·3): 미리 말하는 줄은 없앴다 — 같은 말을 그리기 단추 설명으로. 안내 줄은 「Enter 대화 · ⌘Enter …」만(⇧Enter는 ✈ 설명).
    const typed = chatInput.value.trim();
    const gathered = running || editing ? null : gatherForDraw(typed, mode);
    const lastResult = drawScope(conversationMessages, { resultIds: generatedImages.map(other => other.id) }).after;
    const previewText = running ? '' : drawPreviewLine({ editing, baseNo: editing ? resultNumber(item, generatedImages) : null, fresh, all: mode === 'all',
      count: gathered?.count || 0, after: gathered?.after?.name || null, reset: Boolean(gathered?.reset && !gathered?.after) });
    sendButton.title = running ? '작업을 멈춥니다 · 앞 결과는 그대로' : `${previewText} · ${modKey}Enter`;
    sendButton.removeAttribute('data-tip');
    const resetNote = !running && !editing && gathered?.reset && !gathered?.after && gathered.count > 0 ? `새 대화 ${gathered.count}개로` : '';
    const hintText = composerHint({ mod: modKey, action: running ? (item ? '이 그림 고치기' : '이미지 생성') : label, note: resetNote });
    if (dom.hint.textContent !== hintText) dom.hint.textContent = hintText;
    chatButton.title = `대화 보내기 · Enter (그림은 그리지 않음) · ${shiftEnterLabel()} 줄바꿈`; chatButton.setAttribute('aria-label', '대화 보내기');
    dom.more.hidden = !item;
    dom.more.disabled = busy;
    // ▾ 메뉴 「새로 그리기」 옆 작은 글: 「결과 3 뒤 대화로」 / 「새 대화로」
    const newNote = dom.moreMenu.querySelector('[data-ai-create-new-note]');
    const newNoteText = lastResult?.name ? `${lastResult.name.replace(/^생성 /, '')} 뒤 대화로` : resetIsLast(conversationMessages) ? '새 대화로' : '대화로';
    if (newNote && newNote.textContent !== newNoteText) newNote.textContent = newNoteText;
    // 「새 대화」: 끊을 대화가 있고, 이미 막 끊은 게 아닐 때만
    const canReset = !busy && conversationMessages.some(message => message.role === 'user' || message.role === 'assistant') && !resetIsLast(conversationMessages);
    dom.newChat.disabled = !canReset;
    const resetItem = dom.moreMenu.querySelector('[data-ai-create-reset]'); if (resetItem) resetItem.disabled = !canReset;
    dimBeforeReset();
    log.querySelectorAll('.ai-msg.chips button').forEach(button => { button.disabled = busy; });
    dom.clip.disabled = busy;
    const placeholder = running ? '그리는 동안 덧붙일 말을 적어 두세요'
      : item?.meta?.ui?.kind === 'label' && editing ? '라벨을 고치거나 더 말하세요'
      : editing ? '이 그림에 대해 이야기하거나, 고칠 곳을 적고 「이 그림 고치기」'
      : mode === 'fresh' ? `덧붙일 말을 적고 「새로 그리기」 · 비워 두면 ${lastResult?.name ? `${lastResult.name} 뒤 대화로` : '대화로'} 그립니다`
      : mode === 'all' ? '덧붙일 말을 적고 「처음부터 다시 그리기」 · 비워 두면 대화 전체로 그립니다' : '그림에 대해 AI와 이야기하세요 · 그리기는 「이미지 생성」';
    if (chatInput.placeholder !== placeholder) chatInput.placeholder = placeholder;
    chatInput.disabled = false;
    // 그림 설정 한 줄(태그 18)
    const value = key => panel.querySelector(`.ai-compact-settings [data-ai-setting-key="${key}"] .is-on`)?.dataset.aiSettingValue;
    const background = value('background') === 'connected' ? '배경 제거 켬' : '배경 제거 끔';
    const objects = value('objects') && value('objects') !== 'off' ? '객체 분리 켬' : '객체 분리 끔';
    const summary = `${background} · ${objects}`;
    if (dom.summary.textContent !== summary) dom.summary.textContent = summary;
    // 「＋ 레퍼런스」(태그 2)·결과 칸 왼쪽 이름(태그 24)
    dom.addRef.hidden = !resultOnly || panel.dataset.aiLayout !== 'result' || Boolean(comparison);
    // 비교 안내(태그 23·25): 지금 비교 상태를 한 줄로. 비교가 끝나면 지운다.
    const compareNow = createCompareState();
    if (compareNow) {
      const left = generatedImages.find(candidate => candidate.id === compareNow.leftId), right = generatedImages.find(candidate => candidate.id === compareNow.rightId);
      const pair = `${left?.name || '왼쪽 결과'}(왼쪽)와 ${right?.name || '오른쪽 결과'}(오른쪽)`;
      const note = compareNow.mode === 'slider' ? `${pair}를 겹쳐 보고 있어요. 경계를 끌어 보세요. 다른 결과의 「비교」를 누르면 왼쪽이 그 결과로 바뀝니다.`
        : `${pair}를 나란히 보고 있어요. 다른 결과의 「비교」를 누르면 왼쪽이 그 결과로 바뀝니다.`;
      if (createCompareNote?.textContent !== note) setCompareNote(note);
    } else if (createCompareNote) setCompareNote(null);
    dom.addRef.disabled = busy;
    const leftTitle = panel.querySelector('.ai-original-pane .ai-pane-metadata > strong');
    const leftName = resultOnly ? '비교 대상' : '레퍼런스';
    if (leftTitle && leftTitle.textContent !== leftName) leftTitle.textContent = leftName;
    refreshChatResults();
  }

  // --- 대화 보내기 · 이미지 생성(CHATFIX, 시안 대화생성분리 안 B · 안 1) ---
  // Enter·입력칸 안 ✈ = 대화 보내기(AI가 묻고 정리, 그리지 않음). 「이미지 생성」(입력칸 밖)·⌘Enter = 지금까지 대화 전체 + 입력칸 글로 그리기.
  // 결과가 있으면 같은 단추가 「이 그림 고치기」(입력칸 글 = 고칠 말), ▾ 「새로 그리기」 = 대화 전체로 처음부터.
  // 한글 조합 중 Enter는 아무것도 보내지 않는다(CHATGEN 2절: 옛 Enter 처리가 조합 중 Enter를 대화로 보내 「?」로 끝난 말만 그림이 됐다).
  let lastDrawRun = null;
  function createChat() {
    const text = chatInput.value.trim();
    if (!text) return true;
    if (busy) { setStatus(currentTurnType === 'chat' ? 'AI가 답하는 중이에요 · 답이 오면 이어서 보낼 수 있어요.' : '그리는 중이에요 · 끝나면 대화를 보낼 수 있어요. 멈추려면 「그리기 멈추기」를 누르세요.', 'warn'); return true; }
    chatButton.click();
    return true;
  }
  function startDraw(gathered, { note = true } = {}) {
    lastDrawRun = { kind: 'new', request: gathered.request, conversation: gathered.conversation, count: gathered.count, summary: gathered.summary || [], after: gathered.after || null, reset: Boolean(gathered.reset), scope: gathered.scope || 'after-result' };
    // 그리기 시작 때 모은 「그릴 내용」을 대화에 한 번 남긴다(태그 7).
    if (note) addLog(drawPlanNote(gathered));
    void submit('image', { requestOverride: gathered.request, discussionContextOverride: '', figureConversation: gathered.conversation, figureGathered: lastDrawRun,
      bypassCache: true, silentUserLog: true, createBubbleShown: true });
    captureActiveTaskTab(); persistTasks();
  }
  function startEdit(item, instruction, { bubble = true } = {}) {
    lastDrawRun = { kind: 'edit', baseId: item.id, instruction };
    if (bubble) addLog(instruction, 'user');
    void submit('image', { figureEdit: { baseId: item.id, instruction }, requestOverride: instruction, bypassCache: true, createBubbleShown: true, silentUserLog: !bubble });
    captureActiveTaskTab(); persistTasks();
  }
  function createGenerate({ fresh = false } = {}) {
    if (busy) { void interruptCurrentTask(); return true; }
    const text = chatInput.value.trim();
    const item = selectedOutputItem();
    const drawMode = fresh && item && createDrawMode(item) === 'edit' ? 'fresh' : createDrawMode(item);
    const editing = drawMode === 'edit';
    if (localEraseController?.getDraft(item)) { setStatus('먼저 수정 저장을 눌러 편집을 완료하세요.', 'warn'); return true; }
    if (editing) {
      if (!text) { setStatus('고칠 곳을 입력칸에 적어 주세요. 예: T는 빼 줘', 'warn'); chatInput.focus(); return true; }
      chatInput.value = ''; input.value = ''; createComposeMode = 'auto'; createDrawScope = 'after-result';
      startEdit(item, text);
      return true;
    }
    // V5(태그 16): 결과가 있으면 그 결과 뒤 대화만, 「처음부터 다시 그리기」면 새 대화 뒤 전체.
    let gathered = gatherForDraw(text, drawMode);
    if (!gathered.request && gathered.after) {
      // 결과 뒤 대화가 없으면 막지 않고 그 결과를 만든 내용으로 다시 그린다(없으면 새 대화 뒤 대화 전체).
      const marked = generatedImages.find(candidate => candidate.id === gathered.after.id);
      const source = marked?.meta?.ui?.kind === 'label' ? (generatedImages.find(candidate => candidate.id === marked.meta.ui.from) || marked) : marked;
      const made = source?.meta?.gathered;
      gathered = made?.request ? { ...made, users: [], after: gathered.after, again: true, count: 0, reset: gathered.reset, scope: 'after-result' } : gatherForDraw(text, 'all');
    }
    if (!gathered.request) { setStatus('어떤 그림이 필요한지 입력칸에 적거나, AI와 먼저 이야기해 주세요.', 'warn'); chatInput.focus(); return true; }
    if (text) {
      addLog(text, 'user');
      try { recordConversationMessage('user', text); } catch { /* 저장을 못 해도 이번 그리기에는 넣었다 */ }
    }
    chatInput.value = ''; input.value = ''; createComposeMode = 'auto'; createDrawScope = 'after-result';
    clearNewChatUndo();
    startDraw(gathered);
    return true;
  }
  function onFlowChip(chip) {
    let payload = null; try { payload = chip.dataset.aiChipPayload ? JSON.parse(chip.dataset.aiChipPayload) : null; } catch { payload = null; }
    if (busy) { setStatus('그리는 중이에요 · 끝난 뒤에 눌러 주세요.', 'warn'); return; }
    switch (chip.dataset.aiChip) {
      case 'draw-now': createComposeMode = 'new'; createGenerate({ fresh: true }); return;
      case 'retry-draw': {
        if (payload?.request) startDraw({ ...payload, users: [] }, { note: false });
        else createGenerate({ fresh: true });
        return;
      }
      case 'retry-edit': {
        const base = generatedImages.find(candidate => candidate.id === payload?.baseId) || selectedOutputItem();
        if (base && payload?.instruction) { addLog(payload.instruction, 'user'); startEdit(base, payload.instruction, { bubble: false }); }
        return;
      }
      case 'reword': {
        const text = String(payload?.text || '');
        createComposeMode = payload?.kind === 'new' ? 'new' : 'auto';
        chatInput.value = text; chatInput.focus(); chatInput.select?.();
        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
        setStatus(payload?.kind === 'edit' ? '고칠 말을 바꿔 적고 「이 그림 고치기」를 누르세요.' : '그릴 말을 바꿔 적고 「이미지 생성」을 누르세요.', 'ok');
        scheduleCreateSync();
        return;
      }
      default:
    }
  }
  sendButton.addEventListener('click', event => {
    if (!isFigureCreate() || panel.dataset.aiSharingMode === 'view') return;
    event.preventDefault(); event.stopImmediatePropagation();
    createGenerate();
  }, true);
  // 입력칸 안 ✈(대화 보내기): 생성 탭에서도 다시 보인다. 조합 중이던 글자는 click 전에 확정된다.
  chatButton.addEventListener('click', event => {
    if (!isFigureCreate() || panel.dataset.aiSharingMode === 'view') return;
    if (busy) { event.preventDefault(); event.stopImmediatePropagation(); setStatus('그리는 중이에요 · 끝나면 대화를 보낼 수 있어요.', 'warn'); }
  }, true);
  let imeComposing = false;
  chatInput?.addEventListener('compositionstart', () => { imeComposing = true; });
  chatInput?.addEventListener('compositionend', () => { imeComposing = false; });
  chatInput?.addEventListener('keydown', event => {
    if (!isFigureCreate()) return;
    const action = enterAction(event, { composing: imeComposing });
    if (!action) return;
    // 조합 확정 Enter: 입력기에 맡기고, 옛 Enter 처리(대화 보내기)도 돌지 않게 막는다.
    if (action === 'ime') { event.stopImmediatePropagation(); return; }
    if (action === 'newline') { event.stopImmediatePropagation(); return; }
    event.preventDefault(); event.stopImmediatePropagation();
    if (action === 'generate') { if (busy) { setStatus('그리는 중입니다 · 멈추려면 「멈추기」를 누르세요.', 'warn'); return; } createGenerate(); return; }
    createChat();
  }, true);
  chatInput?.addEventListener('input', () => {
    if (!isFigureCreate()) return;
    if (!chatInput.value.trim() && createComposeMode === 'new' && !selectedOutputItem()) createComposeMode = 'auto';
    scheduleCreateSync();
  });

  // --- 확정하고 라벨 살리기(태그 27~32): 그림은 다시 그리지 않고 글자만 5E 라벨로 ---
  async function runLabelRestoreTurn(base) {
    if (busy || preflightRun || !base?.data) return;
    if (!desktop || desktop.web || typeof desktop.readImageText !== 'function') {
      // 막다른 경고 대신 라벨 편집으로 데려간다(웹은 글자 읽기 연결이 없다).
      setStatus('라벨 자동 살리기는 설치판에서 됩니다 · 라벨 편집으로 직접 넣을 수 있게 열었습니다.', 'warn');
      panel.querySelector('[data-ai-label-edit]')?.click();
      return;
    }
    const source = base.meta?.ui?.kind === 'label' ? generatedImages.find(item => item.id === base.meta.ui.from) || base : base;
    const taskId = activeTaskTabId;
    addLog('확정하고 라벨 살리기', 'user');
    addChatNote(`${source.name}${objectParticle(source.name)} 확정했어요. 글자를 5E 라벨로 바꿉니다(지시선이 그림과 겹쳐 깨끗이 안 지워지면 그림을 다시 그려 정리해요).`);
    const token = beginRequest('image', source.data);
    if (pendingLoading?.token === token) pendingLoading = { ...pendingLoading, source: source.data, kind: 'label-restore', plan: 'label-restore', phased: true, title: `${source.name}의 글자를 라벨로 바꾸고 있어요` };
    const requestEpoch = ++currentRequestEpoch;
    const abort = new AbortController(); imageLabelRunAbort = abort;
    const isCurrent = () => !disposed && requestEpoch === currentRequestEpoch && activeTaskTabId === taskId && !currentCancelRequested && !abort.signal.aborted;
    clearTimeout(requestTimeout); requestTimeout = null;
    imageReceived = false; currentTurnType = 'image'; currentEngine = IMAGE_ENGINE_IDS.RASTER; currentCancelRequested = false;
    currentRunInput = { attachments: [], generated: [], mode: selectedMode, outputEngine: selectedOutputEngine, examBriefProfile: EXAM_BRIEF_PROFILE, markPolicy: readMarkPolicy() };
    currentTerminalOutcome = null; currentTurnCandidate = null; currentTurnDone = false; serverTurnFinished = false;
    const clockId = `label-${requestEpoch}`; currentTurnId = clockId; startGenerationClock(clockId);
    newEngineRunActive = true;
    requestPhase('generating');
    startStatusBlock('label');
    setStatus('라벨 살리는 중…', 'busy');
    setGenerating(true, '그림 속 글자를 라벨로 바꾸고 있습니다', '그림은 다시 그리지 않습니다.');
    const phase = (name, text) => { if (!isCurrent()) return; loading.stage(name); statusPhase(name, text); };
    const startedAt = Date.now();
    try {
      const hints = Array.isArray(source.meta?.labelHints) && source.meta.labelHints.length ? source.meta.labelHints
        : (await figureLabelHints(source.meta?.request || '')) || labelHintsFallback(source.meta?.request || '');
      phase('label-read', hints.length ? `요청에 적은 라벨 ${hints.length}개를 기준으로 글자 읽는 중 · ${hints.slice(0, 10).join(' ')}${hints.length > 10 ? ' …' : ''}` : undefined);
      let items = [], readError = null;
      for (let attempt = 1; attempt <= 2 && !items.length; attempt++) {
        try {
          const read = await desktop.readImageText({ model: AI_LABEL_READ_MODEL, text: `${LABEL_READ_PROMPT}${labelHintPrompt(hints)}`, attachments: [source.data] });
          if (!isCurrent()) throw new DOMException('작업이 취소되었습니다.', 'AbortError');
          items = parseLabelRead(typeof read === 'string' ? read : String(read?.text ?? ''));
        } catch (error) { if (error?.name === 'AbortError' || !isCurrent()) throw error; readError = error; }
      }
      if (hints.length) statusPhase('label-read', `요청에 적은 라벨 ${hints.length}개를 기준으로 글자 읽음 · ${items.length}개 찾음`);
      phase('label-erase');
      const picture = new Image(); picture.src = source.data; await picture.decode();
      const canvas = document.createElement('canvas'); canvas.width = picture.naturalWidth; canvas.height = picture.naturalHeight;
      const g = canvas.getContext('2d', { willReadFrequently: true }); g.drawImage(picture, 0, 0);
      const pixels = g.getImageData(0, 0, canvas.width, canvas.height);
      // LEADERFIX(11-20): 글자만이 아니라 읽은 지시선도 그림에서 찾아 지운다(라벨 켬·끔 같은 그림, 두 줄 지시선 없음).
      // 확실하지 않은 지시선은 그림에 그대로 두고 그 라벨은 지시선 없이 만든다(eraseLabelsAndLeaders가 leader: null로 돌려줌).
      const untouched = pixels.data.slice();
      const readItems = items.map(item => ({ ...item }));
      try { items = eraseLabelsAndLeaders(pixels.data, canvas.width, canvas.height, items).items; }
      catch { pixels.data.set(untouched); items = items.map(item => ({ ...item, leader: null })); eraseGlyphsInBoxes(pixels.data, canvas.width, canvas.height, items); }
      g.putImageData(pixels, 0, 0);
      let erased = items.length ? canvas.toDataURL('image/png') : source.data;
      // 11-21 사용자: 지시선이 그림 선(근육 결·줄무늬)과 닿으면 맥 안 지우기가 「확실하지 않음」으로 남겨 라벨을 끄면 지시선만 남았다.
      // 프로그램이 알아서 고른다 — 지시선을 모두 지웠으면 지금처럼 끝(빠름·그림 그대로), 하나라도 남겼으면 그때만
      // 변환 탭처럼 그림 AI가 글자·지시선 없는 그림을 다시 그리고 읽은 지시선 그대로 5E 라벨을 올린다. 다시 그리기가 안 되면 맥 안 결과로(실패로 끝내지 않음).
      const keptLeaders = readItems.filter(item => item.leader).length - items.filter(item => item.leader).length;
      if (keptLeaders > 0 && typeof desktop.send === 'function') {
        const note = `지시선이 그림과 겹쳐 ${keptLeaders}개는 깨끗이 지우지 못했어요. 글자·지시선 없는 그림을 다시 그리는 중이라 30~40초쯤 더 걸려요 · 다른 일을 하셔도 끝나면 작업 목록에 「새 결과」로 알려 드려요.`;
        phase('label-erase', note);
        setGenerating(true, '지시선이 많아 깨끗한 그림을 다시 그리고 있어요', '30~40초쯤 더 걸려요 · 다른 일을 하셔도 끝나면 알려 드려요.');
        try {
          const models = engineModels({ catalog: availableModels });
          const ai = createDesktopEngineAi(desktop, engineRaster, { imageModels: imageModelOrder(models.image) });
          const texts = readItems.map(item => String(item.text || '').trim()).filter(Boolean).slice(0, 30);
          const prompt = `첨부 그림에서 글자 라벨과, 라벨에서 물체로 이어진 지시선만 깨끗이 지운 그림을 다시 만든다. 그 밖의 선·도형·명암·해칭·배치·크기는 픽셀 단위로 그대로 둔다. 그림 크기·여백·위치는 바꾸지 않는다(잘라 내지 않는다). 지운 자리는 주변 바탕과 자연스럽게 잇는다. 흑백.\n지울 라벨: ${texts.join(', ') || '(그림 안 모든 글자)'}`;
          const out = await ai.generateImage({ model: models.image, text: prompt, attachments: [source.data], signal: abort.signal });
          if (!isCurrent()) throw new DOMException('작업이 취소되었습니다.', 'AbortError');
          const drawn = typeof out === 'string' ? out : out?.imageDataUrl || out?.dataUrl || '';
          if (drawn.startsWith('data:image')) {
            const gray = await grayscaleGeneratedPng(drawn, { signal: abort.signal });
            // 크기가 같을 때만 쓴다(라벨 자리는 원래 그림 좌표) — 다르면 맥 안 결과로.
            const check = new Image(); check.src = gray.data; await check.decode();
            if (check.naturalWidth === canvas.width && check.naturalHeight === canvas.height) {
              const g2 = canvas.getContext('2d', { willReadFrequently: true }); g2.drawImage(check, 0, 0);
              const px2 = g2.getImageData(0, 0, canvas.width, canvas.height);
              eraseGlyphsInBoxes(px2.data, canvas.width, canvas.height, readItems.map(item => ({ ...item, leader: null }))); // 남은 글자 흔적만 정리
              g2.putImageData(px2, 0, 0);
              erased = canvas.toDataURL('image/png');
              // 다시 그린 그림에는 지시선이 없으니 모든 지시선을 5E 지시선으로 올린다 — 맥 안에서 찾은 실제 끝점이 있으면 그것, 없으면 읽은 끝점.
              items = readItems.map((read, i) => (items.length === readItems.length && items[i]?.leader ? items[i] : read));
              statusPhase('label-erase', `글자·지시선 없는 그림을 다시 그렸어요 · 지시선 ${readItems.filter(item => item.leader).length}개를 5E 라벨로 올려요`);
            }
          }
        } catch (error) { if (error?.name === 'AbortError' || !isCurrent()) throw error; /* 다시 그리기 실패 → 맥 안 결과 그대로 */ }
      }
      if (!isCurrent()) throw new DOMException('작업이 취소되었습니다.', 'AbortError');
      phase('label-place');
      const readPlan = labelPlanFromRead(items);
      let sized = null;
      if (readPlan.labels.length) { try { sized = await measuredLabelSizes(source.data, readPlan.labels, abort.signal); } catch (error) { if (error?.name === 'AbortError') throw error; } }
      const candidateSha256 = await imageLabelDigest(erased);
      const report = { verdict: 'pass', checks: [], issues: [], reviewSkipped: true };
      const labelPlan = { ...structuredClone(readPlan), labels: structuredClone(readPlan.labels), sourcePlan: structuredClone(readPlan), qualityReview: report, reviewRequired: false, targetPlacement: null, candidateSha256, ...(sized?.ratio ? { measuredLabelSize: sized.ratio } : {}) };
      if (!isCurrent()) throw new DOMException('작업이 취소되었습니다.', 'AbortError');
      phase('label-check');
      requestPhase('validating');
      const number = generatedImages.length + 1;
      const item = await addPreview(erased, { alreadyEditable: true, isCurrent, name: `생성 결과 ${number} · 라벨`, labelPlan: readPlan.labels.length ? labelPlan : null, reviewState: 'passed', reviewReport: report });
      if (!item || !isCurrent()) throw new DOMException('작업이 취소되었습니다.', 'AbortError');
      item.engine = 'ai-figure-labels';
      item.candidateSha256 = candidateSha256; item.verifiedCandidateData = erased;
      item.meta = { ...(structuredClone(source.meta || {})), ui: { kind: 'label', from: source.id, labelCount: readPlan.labels.length, elapsedMs: Date.now() - startedAt, hints: hints.length } };
      if (item.labelPlan) { labelPreviewState(item).included = true; ensureCompositePreviewControl(item); syncEditableLabelPlanButton(item); void renderLabelPreview(item); }
      newEngineRunActive = false;
      imageReceived = true; currentTurnCandidate = item; serverTurnFinished = true; currentTurnDone = true; currentTerminalOutcome = 'completed';
      advanceGenerationClock('image-received'); advanceGenerationClock('postprocess-completed'); advanceGenerationClock('turn-terminal', 'completed');
      finishStatusBlock();
      addResultEntry(item);
      addChatNote(readPlan.labels.length
        ? `라벨 ${readPlan.labels.length}개를 5E 라벨로 바꿨어요. 두 번 눌러 글자를 고칠 수 있고, 캔버스에 넣으면 라벨이 따로 움직입니다.`
        : `그림 속 글자를 읽지 못했어요${readError ? '(AI 연결)' : ''}. 그림은 그대로 두었고, 「라벨 편집」에서 라벨을 직접 넣을 수 있어요.`);
      setTaskState('completed'); requestPhase('completed'); setGenerating(false); setBusy(false);
      setStatus(readPlan.labels.length ? `라벨 ${readPlan.labels.length}개를 살렸습니다` : '글자를 읽지 못해 그림만 두었습니다 · 라벨 편집에서 직접 넣을 수 있습니다', readPlan.labels.length ? 'ok' : 'warn');
      window.dispatchEvent(new CustomEvent('5e:ai-output-success', { detail: { candidateId: item.id } }));
      captureActiveTaskTab(); persistTasks();
      try { await taskPersistence.checkpoint(); } catch {}
      return item;
    } catch (error) {
      newEngineRunActive = false;
      const cancelled = error?.name === 'AbortError' || currentCancelRequested;
      finishStatusBlock({ remove: cancelled });
      if (requestEpoch === currentRequestEpoch && !disposed && activeTaskTabId === taskId) {
        advanceGenerationClock('turn-terminal', cancelled ? 'cancelled' : 'failed');
        requestPhase(cancelled ? 'cancelled' : 'kept-previous', { reason: failureReason(error) }); setTaskState('idle'); setGenerating(false); setBusy(false);
        setStatus(cancelled ? '라벨 살리기를 멈췄습니다 · 앞 결과는 그대로' : `라벨을 살리지 못했습니다 · 앞 결과는 그대로입니다. 다시 누르면 다시 합니다. (${String(error?.message || error).slice(0, 120)})`, 'warn');
        if (!cancelled) addChatNote('라벨을 살리지 못했어요. 앞 결과는 그대로이고, 「확정하고 라벨 살리기」를 다시 누르면 다시 합니다.');
        captureActiveTaskTab(); persistTasks();
      }
    } finally { if (imageLabelRunAbort === abort) imageLabelRunAbort = null; }
  }
  window.addEventListener('5e:ai-task-change', () => { finishStatusBlock(); setCompareNote(null); clearNewChatUndo(); createComposeMode = 'auto'; createDrawScope = 'after-result'; resetPicked = false; scheduleCreateSync(); }, { signal: lifecycle.signal });
  // V5(태그 13): 「새 대화」 뒤 결과 목록·결과 카드에서 결과를 고르면 다시 「이 그림 고치기」
  panel.addEventListener('5e:ai-candidate-select', () => { if (resetIsLast(conversationMessages)) resetPicked = true; scheduleCreateSync(); }, { signal: lifecycle.signal });
  panel.addEventListener('click', event => { if (event.target.closest?.('[data-ai-layout-mode], [data-ai-compare], [data-ai-setting-value]')) setTimeout(scheduleCreateSync, 0); }, { signal: lifecycle.signal });
  new MutationObserver(scheduleCreateSync).observe(panel.querySelector('.ai-results'), { attributes: true, attributeFilter: ['class'] });

  // 11-19(시안 태그 6·10·12·14): 「이 그림 고치기」 — 보는 결과를 바탕으로 말한 곳만 고친다(엔진 editFigure).
  // 고친 그림은 「생성 결과 N+1」로 바로 골라지고, 앞 결과는 지우지 않는다. 엔진에 고치기가 없거나 고치지 못하면
  // 앞 그림과 지시를 함께 넘겨 새로 그린다(실패로 끝내지 않음). 라벨 결과를 고치면 라벨 없는 앞 그림을 고친 뒤 라벨을 다시 살린다.
  // CHATFIX: 빈(흰) 그림인가 — 앱이 재는 픽셀 검사(darkPixelShare·inkPixelShare)로. 못 재면 빈 그림으로 보지 않는다.
  async function isBlankFigure(dataUrl) {
    try { return isBlankInspection(await inspectPngDataUrl(dataUrl)); } catch { return false; }
  }
  async function runFigureEditTurn({ runInput, entered, requestEpoch, options = {} }) {
    const taskId = activeTaskTabId;
    const picked = generatedImages.find(item => item.id === options.figureEdit?.baseId) || selectedOutputItem();
    const relabel = picked?.meta?.ui?.kind === 'label';
    const base = relabel ? (generatedImages.find(item => item.id === picked.meta.ui.from) || picked) : picked;
    const instruction = String(options.figureEdit?.instruction || entered || '').trim();
    if (!base?.data || !instruction) return runFigureEngineTurn({ runInput, entered, discussionContext: '', requestEpoch, options });
    // 원래 요청: 대화를 모아 그린 결과면 모은 요청 + 정리된 구성(CHATFIX), 아니면 앞 그림의 요청.
    const gathered = base.meta?.gathered || null;
    const originalRequest = [base.meta?.request || conversationMessages.find(message => message.role === 'user')?.text || '',
      gathered?.summary?.length ? `정리된 구성: ${gathered.summary.join(' / ')}` : ''].filter(Boolean).join('\n');
    if (!busy) setBusy(true);
    imageReceived = false; currentTurnType = 'image'; currentEngine = IMAGE_ENGINE_IDS.RASTER; currentCancelRequested = false;
    currentRunInput = runInput; currentTerminalOutcome = null; currentImageOutputError = null;
    currentTurnCandidate = null; pendingCacheOutput = null; currentTurnDone = false; serverTurnFinished = false;
    currentRequestSnapshot = { entered, request: instruction, discussionContext: '', annotatedRequest: instruction, renderRequest: instruction, runInput };
    providerRequestPersistable = true; persistTasks();
    clearTimeout(requestTimeout); requestTimeout = null;
    const abort = new AbortController(); imageLabelRunAbort = abort;
    const isCurrent = () => !disposed && requestEpoch === currentRequestEpoch && activeTaskTabId === taskId && !currentCancelRequested && !abort.signal.aborted;
    const clockId = `figure-edit-${requestEpoch}`; currentTurnId = clockId; startGenerationClock(clockId);
    newEngineRunActive = true;
    const baseNo = resultNumber(base, generatedImages);
    if (pendingLoading?.token === requestToken) pendingLoading = { ...pendingLoading, kind: 'figure-edit', plan: 'figure-edit', phased: true, source: base.data, title: `생성 결과 ${baseNo}에서 말한 곳만 고치고 있어요` };
    const turnStartedAt = Date.now();
    addLog(`생성 결과 ${baseNo}에서 말한 곳만 고치고 있어요. 나머지는 그대로 둡니다.`);
    startStatusBlock('edit');
    requestPhase('generating');
    setStatus('그림 고치는 중…', 'busy');
    setGenerating(true, '그림을 고치고 있습니다', '앞 그림을 바탕으로 말한 곳만 고칩니다.');
    const models = engineModels({ selected: runInput.model, catalog: runInput.modelCatalog || availableModels });
    const ai = createDesktopEngineAi(desktop, engineRaster, { imageModels: imageModelOrder(models.image), textModels: [runInput.model, ...imageModelOrder(runInput.model)] });
    const previous = base.meta ? { expanded: base.meta.expanded || null, scenes: [{ request: base.meta.sceneRequest || originalRequest, refs: base.meta.refs || [], image: base.data }] } : null;
    const editPhase = e => {
      if (!isCurrent() || !e?.phase) return;
      const copy = figurePhaseCopy(e);
      if (copy.title) setGenerating(true, copy.title, copy.detail || '');
      loading.stage(e.phase); statusPhase(e.phase);
    };
    let outcome;
    try {
      await taskPersistence.checkpoint();
      if (!isCurrent()) throw new DOMException('작업이 취소되었습니다.', 'AbortError');
      outcome = await runFigureEdit({ ai, previousPng: base.data, instruction, originalRequest, previous, models, signal: abort.signal, onPhase: editPhase });
      // CHATFIX(시안 태그 12): 고친 그림이 비었으면 다른 그림 모델로 한 번 더 고친다.
      if (outcome.fresh?.length && isCurrent() && await isBlankFigure(outcome.fresh[0].image)) {
        const other = imageModelOrder(models.image)[1];
        if (isCurrent()) addLog(`고친 그림이 비어 나와 다른 그림 모델(${other})로 한 번 더 고칩니다.`);
        const ai2 = createDesktopEngineAi(desktop, engineRaster, { imageModels: imageModelOrder(other), textModels: [runInput.model, ...imageModelOrder(runInput.model)] });
        const second = await runFigureEdit({ ai: ai2, previousPng: base.data, instruction, originalRequest, previous, models: { ...models, image: other }, signal: abort.signal, onPhase: editPhase });
        if (second.aborted) outcome = second;
        else if (second.fresh?.length && !(await isBlankFigure(second.fresh[0].image))) outcome = { ...second, blankRedrawn: true };
        else outcome = { ...second, fresh: [], blankKept: true };
      }
    } catch (error) {
      outcome = error?.name === 'AbortError' ? { available: true, aborted: true, fresh: [], errors: [] } : { available: true, aborted: false, fresh: [], errors: [{ message: error?.message || String(error) }] };
    } finally { if (imageLabelRunAbort === abort) imageLabelRunAbort = null; }
    const endTurn = () => { newEngineRunActive = false; };
    if (outcome.aborted || !isCurrent()) {
      endTurn(); finishStatusBlock({ remove: true });
      if (requestEpoch === currentRequestEpoch && !disposed && activeTaskTabId === taskId) {
        advanceGenerationClock('turn-terminal', 'cancelled'); requestPhase('cancelled');
        setTaskState('idle'); setGenerating(false); setBusy(false); setStatus('고치기를 멈췄습니다 · 앞 결과는 그대로', 'warn');
      }
      return;
    }
    // CHATFIX: 고칠 곳을 못 찾았거나(되묻기)·말한 곳이 안 바뀌었거나·두 번 다 비었으면 앞 결과를 그대로 두고 대화로 묻는다.
    if (!outcome.fresh.length && (outcome.result?.needsClarification || outcome.result?.editRejected || outcome.blankKept)) {
      endTurn(); finishStatusBlock({ remove: true });
      advanceGenerationClock('turn-terminal', 'failed'); requestPhase('kept-previous'); setTaskState('completed'); setGenerating(false); setBusy(false);
      const baseName = `생성 결과 ${baseNo}`;
      if (outcome.result?.needsClarification) {
        const ask = String(outcome.result.edit?.clarify?.ask || '').trim();
        addLog(`${baseName}에서 무엇을 고칠지 그림에서 찾지 못해 고치지 않았어요. ${ask || '어디를 어떻게 바꿀지 말해 주세요. 예: 「왼쪽 비커의 ATP 글자를 지워 줘」'}${/(빈|하얀|흰|안 ?보)/.test(instruction) ? ' 그림이 비어 보이면 ▾ 「새로 그리기」로 대화 전체를 모아 다시 그릴 수 있어요.' : ''}`);
        addFlowChips([{ id: 'reword', label: '말 바꿔 다시 적기', strong: true, payload: { kind: 'edit', text: instruction } }]);
        setStatus('고칠 곳을 물어봤어요 · 앞 결과는 그대로', 'warn');
      } else {
        addLog(outcome.blankKept ? `두 번 고쳐도 빈 그림이 나와 결과로 넣지 않았어요. ${baseName}는 그대로예요.` : `말한 곳이 바뀌지 않아 결과로 넣지 않았어요. ${baseName}는 그대로예요.`);
        addFlowChips([
          { id: 'retry-edit', label: '한 번 더 고치기', strong: true, payload: { baseId: picked?.id || base.id, instruction } },
          { id: 'reword', label: '말 바꿔 다시 적기', payload: { kind: 'edit', text: instruction } },
        ]);
        setStatus(`고치지 못했습니다 · ${baseName}는 그대로`, 'warn');
      }
      captureActiveTaskTab(); persistTasks();
      return;
    }
    if (!outcome.fresh.length) {
      endTurn(); finishStatusBlock({ remove: true });
      advanceGenerationClock('turn-terminal', 'failed'); requestPhase(ai.health?.authRequired ? 'login-wait' : 'failed'); setGenerating(false); setBusy(false);
      if (ai.health?.authRequired) return guideDesktopLogin(() => submit('image', options));
      // 엔진에 고치기가 없거나(옛 판) 끝내 고치지 못했다 — 앞 그림의 요청과 고칠 말을 함께 넘겨 새로 그린다.
      addLog(outcome.available === false ? '이 판의 그림 엔진에는 「고치기」가 없어 요청과 고칠 말을 합쳐 새로 그립니다.' : `앞 그림을 고치지 못해 요청과 고칠 말을 합쳐 새로 그립니다.${outcome.errors?.[0]?.message ? ` (${String(outcome.errors[0].message).slice(0, 120)})` : ''}`);
      return submit('image', { requestOverride: `${originalRequest}\n\n고칠 점: ${instruction}`.trim(), discussionContextOverride: '', figureConversation: gathered?.conversation || '', bypassCache: true, silentUserLog: true, createBubbleShown: true });
    }
    requestPhase('validating');
    advanceGenerationClock('image-received'); advanceGenerationClock('postprocess-started');
    let item = null;
    try {
      const fresh = outcome.fresh[0];
      item = await addPreview(fresh.image, { isCurrent, name: `생성 결과 ${generatedImages.length + 1}` });
      if (item) {
        const edit = outcome.result?.edit || fresh.meta.edit || {};
        item.meta = { ...fresh.meta, request: base.meta?.request || originalRequest, ...(gathered ? { gathered } : {}), ...(outcome.blankRedrawn ? { blankRedrawn: true } : {}), refs: base.meta?.refs || fresh.meta.refs || [],
          labelHints: Array.isArray(outcome.result?.labelHints) ? outcome.result.labelHints.slice(0, 60) : (base.meta?.labelHints || []),
          ui: { kind: 'edit', from: base.id, instruction, summary: edit.summary || '', elapsedMs: Date.now() - turnStartedAt } };
        item.engine = 'ai-figure';
      }
    } catch (error) { addLog(`고친 결과 처리 중 오류: ${error?.message || error}`, 'error'); }
    endTurn();
    if (!isCurrent()) return;
    if (!item) {
      finishStatusBlock({ remove: true });
      advanceGenerationClock('turn-terminal', 'failed'); requestPhase('kept-previous'); setGenerating(false); setBusy(false);
      setStatus('고친 결과를 등록하지 못했습니다 · 앞 결과는 그대로입니다. 다시 누르면 다시 고칩니다.', 'warn');
      return;
    }
    imageReceived = true; currentTurnCandidate = item;
    serverTurnFinished = true; currentTurnDone = true; currentTerminalOutcome = 'completed';
    advanceGenerationClock('postprocess-completed'); advanceGenerationClock('turn-terminal', 'completed');
    window.dispatchEvent(new CustomEvent('5e:ai-output-success', { detail: { candidateId: item.id } }));
    finishStatusBlock();
    addResultEntry(item);
    setTaskState('completed'); requestPhase('completed'); setGenerating(false); setBusy(false);
    setStatus(outcome.result?.edit?.verify && outcome.result.edit.verify.done === false ? '고친 결과 · 말한 곳이 다 바뀌지 않았을 수 있습니다. 비교로 확인하세요.' : '고치기 완료', outcome.result?.edit?.verify?.done === false ? 'warn' : 'ok');
    captureActiveTaskTab(); persistTasks();
    try { await taskPersistence.checkpoint(); } catch {}
    // 라벨 결과를 고쳤으면 라벨을 다시 살린다(시안 「정할 것」 권함).
    if (relabel) setTimeout(() => { if (!busy && activeTaskTabId === taskId) void runLabelRestoreTurn(item); }, 0);
    return item;
  }

  const runImageLabelConversion = async ({ runInput, request, generationInstructions = '', options, originatingTaskId }) => {
    const workflow = runInput.imageLabelWorkflow;
    const sources = runInput.attachments.filter(item => item.referenceRole !== 'STYLE_REFERENCE');
    if (sources.length !== 1) throw new Error('각 작업은 원본 한 장을 기준으로 처리합니다. 여러 원본은 작업별로 나눠 실행해 주세요.');
    if (runInput.attachments.some(item => item.referenceRole === 'STYLE_REFERENCE')) throw new Error('이 변환은 선택한 원본의 과학 구조를 기준으로 처리합니다. 표현 참고는 별도 작업으로 준비해 주세요.');
    const previousCandidate = runInput.generated.find(item => item.id === runInput.selectedCandidateId) || runInput.generated.at(-1);
    if (runInput.preciseRestore && !previousCandidate) throw new Error('그림 정밀 복원에는 먼저 생성한 결과가 필요합니다.');
    // Capture the first separated source contract before asynchronous input
    // preparation; the approved prefix and single RAW generation stay intact.
    const separationInstructions = workflow.explicit === true && workflow.imageKind === 'general'
      && runInput.generationMode === AI_ASSET_GENERATION_MODES.SEPARATED && runInput.generated.length === 0
      && options.verifyOnly !== true ? SEPARATED_ASSETS_PROMPT : '';
    const epoch = ++currentRequestEpoch;
    const abort = new AbortController(); imageLabelRunAbort = abort;
    const batchOwnerRun = batchRun;
    const externalAbort = () => abort.abort();
    batchOwnerRun?.context.signal.addEventListener('abort', externalAbort, { once: true });
    const isCurrent = () => !disposed && !abort.signal.aborted && epoch === currentRequestEpoch && originatingTaskId === activeTaskTabId;
    clearTimeout(requestTimeout); requestTimeout = null; // Every isolated stage owns its timeout.
    currentCancelRequested = false; currentTurnType = 'image'; currentEngine = IMAGE_ENGINE_IDS.RASTER;
    currentTurnStartedAt = Date.now(); currentTerminalOutcome = null; currentTurnDone = false;
    currentRunInput = { ...runInput, approvedFirstPng: workflow.imageKind === 'general', preserveSourceLabels: workflow.labelResult === 'restore-editable', generationMode: 'single', loadingPlan: workflow.labelResult === 'restore-editable' ? 'label' : 'image' };
    currentTurnPerformance = null; currentCacheRequest = null; pendingCacheOutput = null;
    currentRequestSnapshot = { entered: request, request, renderRequest: request, discussionContext: options.discussionContextOverride || '', runInput: currentRunInput };
    providerRequestPersistable = true;
    setBusy(true); requestPhase('generating');
    const phaseNames = { sourceAnalysis: '원본 라벨·소속 확인 중', pixelProcessing: '기출 주석 국소 제거 중', generation: runInput.preciseRestore ? '선택한 그림 정밀 복원 중' : '일반 이미지 변환 중', targetMapping: '최종 연결 대상 확인 중', labelProposals: '편집 라벨 배치 준비 중', finalVerification: '그림·라벨 결과 확인 중', labelPlacement: '편집 라벨 배치 중', review: '그림·라벨 결과 확인 중', localRestore: '겹친 주석 영역 복원 중', localReview: '국소 복원 결과 확인 중', convertCheck: '원본과 빠진 것 대조 중', convertFix: '빠진 곳만 다시 그리는 중', convertRecheck: '다시 그린 그림 확인 중' };
    // 11-21: 대조 뒤 다시 그리기는 1분쯤 더 걸린다(측정 중앙 +58초) — 라벨 복원 때처럼 기다림 안내를 띄운다.
    const phaseDetail = (phase, info) => {
      if (phase === 'convertFix') {
        const items = (Array.isArray(info?.items) ? info.items : []).map(item => String(item?.text || '').trim()).filter(Boolean);
        const what = items.length ? `(${items.slice(0, 3).join(', ')}${items.length > 3 ? ` 외 ${items.length - 3}개` : ''})` : '';
        return `원본과 대조해 빠지거나 남은 곳 ${info?.count || items.length || ''}개${what}를 원래대로 다시 그리고 있어요 · 1분쯤 더 걸려요 · 다른 일을 하셔도 끝나면 작업 목록에 「새 결과」로 알려 드려요.`.replace('곳 개', '곳');
      }
      return phase === 'convertCheck' ? '그린 그림에 원본의 과학 내용이 빠짐없이 들어갔는지 확인합니다.'
        : phase === 'convertRecheck' ? '다시 그린 그림이 원본과 맞는지 한 번 더 확인합니다.' : '원본의 과학 구조와 라벨 소속을 확인합니다.';
    };
    const onPhase = (phase, info) => { if (isCurrent()) { setStatus(phaseNames[phase] || '결과 준비 중', 'busy'); setGenerating(true, phaseNames[phase] || '결과 준비 중', phaseDetail(phase, info), phase === 'generation' || phase === 'convertFix' ? 'generate' : 'analyze'); loading.setPhase(phaseNames[phase] || '결과 준비 중'); loading.stage(phase); panel.dataset.aiWorkflowPhase = phase; } };
    // 11-09: 다른 작업 칸의 변환이 돌고 있으면 줄을 서고(「차례 기다리는 중」), AI 응답이 없거나 고르지 않으면 자동으로 다시 보낸다.
    const onQueueWait = position => {
      if (!isCurrent()) return;
      const text = `차례 기다리는 중 · 앞에 ${position}개`;
      setStatus(text, 'busy'); setGenerating(true, text, '다른 작업 칸의 AI 변환이 끝나면 바로 이어서 시작합니다.', 'analyze'); loading.setPhase(text);
    };
    const onAiRetry = record => {
      if (!isCurrent()) return;
      const why = record.code === 'AI_NO_RESPONSE' ? 'AI 응답이 없어' : 'AI 응답에 문제가 있어';
      const text = record.switchedModel && record.nextModel === AI_RETRY_FALLBACK_MODEL
        ? `${why} Luna로 바꿔 다시 보내는 중 (${record.nextAttempt}/${record.attempts})` : `${why} 다시 보내는 중 (${record.nextAttempt}/${record.attempts})`;
      setStatus(text, 'busy'); loading.setPhase(text);
    };
    const observer = sourceLabelAnalysis;
    const selection = { model: runInput.model, effort: runInput.effort, serviceTier: runInput.serviceTier, models: runInput.modelCatalog || availableModels };
    let pendingRawCandidate = null;
    try {
      const tab = taskTabs.get(originatingTaskId);
      const generationSource = workflow.imageKind === 'general' && !options.verifyOnly
        ? await prepareApprovedFirstAttachment({ ...sources[0] }) : undefined;
      if (!isCurrent()) throw new DOMException('이전 작업 결과입니다.', 'AbortError');
      const result = await executeImageLabelRun({ legacyLabelPipeline: globalThis.__5eLegacyLabelPipeline === true, /* 11-10: 내부 시험용 예전 파이프라인 */ source: sources[0], workflow, request: `${request}${commentPrompt(sources)}`, observer, raster: imageLabelRaster, selection, readText: payload => desktop.readImageText(payload), // 11-10: 원본 글자 읽기(라벨 복원)
        generationSource, generationInstructions: [generationInstructions, separationInstructions, commentPrompt(sources)].filter(Boolean).join('\n\n'),
        artboard: { ...state.get().artboard }, signal: abort.signal, observation: tab?.sourceLabelObservation, graphLabels: tab?.graphKeepOriginal ? 'keep' : 'route',
        onObservation: async observation => {
          if (!isCurrent()) throw new DOMException('이전 작업 결과입니다.', 'AbortError');
          tab.sourceLabelObservation = structuredClone(observation); currentRunInput.sourceLabelObservation = structuredClone(observation);
          currentRequestSnapshot.runInput.sourceLabelObservation = structuredClone(observation);
          panel.dispatchEvent(new CustomEvent('5e:ai-source-label-plan', { detail: structuredClone(observation.plan) }));
          await taskPersistence.checkpoint();
        }, onRaster: async raw => {
          if(batchOwnerRun) return;
          if(!isCurrent()) throw new DOMException('이전 작업 결과입니다.','AbortError');
          pendingRawCandidate = await addPreview(raw.data,{alreadyEditable:true,isCurrent,rendererPrompt:raw.rendererPrompt,reviewState:'needs-attention',
            reviewReport:{verdict:'uncertain',checks:[],issues:[{code:'verification-pending',message:'그림 생성 완료 · 라벨 검수를 기다리고 있습니다.',severity:'minor'}]}});
          if(!pendingRawCandidate || !isCurrent()) throw new DOMException('이전 작업 결과입니다.','AbortError');
          Object.assign(pendingRawCandidate,{imageLabelWorkflow:raw.workflow,sourceLabelPlan:raw.sourceLabelPlan,sourceSha256:raw.sourceSha256,sourceFrame:raw.sourceFrame,
            planSha256:raw.planSha256,candidateSha256:raw.candidateSha256,candidateFrame:raw.candidateFrame,workflowMetrics:raw.metrics,verifiedCandidateData:raw.data});
          tab.generationNotice = 'review';
          captureActiveTaskTab();await taskPersistence.checkpoint();
        }, onPhase, onQueueWait, onAiRetry, onAiFailure: recordAiAttemptFailure, cache: outputCache, backgroundCache: labelBackgroundCache, previousCandidates: runInput.generated, bypassCache: options.bypassCache === true,
        preciseRestore: runInput.preciseRestore === true, verifyOnly: options.verifyOnly === true, previousCandidate,
        // 11-10: 사용자가 다시 그리기(새 변형·재생성·다시 변환)를 요청한 생성만 Sol로 보낸다. 라벨 켬끔 전환은 해당 아님.
        regenerate: options.regenerate === true || /새\s*변형|다시\s*생성|다르게\s*생성|재생성|다시\s*그리기|다시\s*변환/.test(request),
        localRestore: createExamLocalRestore({ observer, raster: imageLabelRaster, onPhase }) });
      if (!isCurrent()) throw new DOMException('이전 작업 결과입니다.', 'AbortError');
      currentTurnPerformance = { ...result.metrics, elapsedMs: result.metrics.timings.total, cacheHit: result.metrics.cacheHit };
      const outOfScope = result.status === 'out-of-scope';
      const fallbackResult = result.status === 'fallback';
      const graphKept = result.status === 'graph-kept';
      const outOfScopeName = '범위 밖 · 원본 보존';
      const outOfScopeMessage = '원본 유지 · 일반 라벨 복원 대상이 0개이므로 원본을 그대로 보존했습니다.';
      const candidate = pendingRawCandidate || await addPreview(result.data, { alreadyEditable: true, isCurrent, rendererPrompt: result.rendererPrompt, labelPlan: result.labelPlan,
        name: outOfScope ? outOfScopeName : graphKept ? '그래프 · 원본 그대로' : fallbackResult ? (result.metrics?.fallback?.image === 'generated' ? '라벨 없이 · 다시 변환 가능' : '원본 유지 · 다시 변환 가능')
          : result.removalReport?.unchanged && !result.accepted ? '원본 유지 · 라벨 제거 보류' : undefined,
        reviewState: result.accepted ? 'passed' : 'needs-attention', reviewReport: result.report, selectCandidate: true });
      if (!candidate || !isCurrent()) throw new DOMException('이전 작업 결과입니다.', 'AbortError');
      Object.assign(candidate,{labelPlan:result.labelPlan,reviewState:result.accepted?'passed':'needs-attention',reviewReport:result.report});
      Object.assign(candidate, { imageLabelWorkflow: result.workflow, sourceLabelPlan: result.sourceLabelPlan, targetPlacement: result.targetPlacement,
        editableDraft: result.editableDraft || null,
        workflowMetrics: result.metrics, removalReport: result.removalReport, sourceSha256: result.sourceSha256, sourceFrame: result.sourceFrame, candidateFrame: result.candidateFrame,
        planSha256: result.planSha256, candidateSha256: result.candidateSha256, finalLabelComposite: result.finalLabelComposite, verifiedCandidateData: result.data });
      if (workflow.imageKind === 'general') {
        const gate = enforcePngAcceptance({ state: candidate.reviewState, report: candidate.reviewReport }, candidate);
        candidate.reviewState = gate.state; candidate.reviewReport = gate.report;
        if (candidate.labelPlan) { candidate.labelPlan.qualityReview = gate.report; candidate.labelPlan.reviewRequired = gate.state !== 'passed'; }
      }
      if(pendingRawCandidate){const previousCard=candidate.card;previousCard?.replaceWith(makeImageCard(candidate));}
      ensureCompositePreviewControl(candidate); syncEditableLabelPlanButton(candidate);
      imageReceived = true; currentTurnCandidate = candidate; currentReviewCandidate = candidate;
      candidate.quietCompletion = isQuietLabelReadResult(result, candidate) || isQuietSkippedReviewResult(result, candidate); // 11-10: 라벨 읽기·라벨 삭제 성공은 「확인 필요」 없이 완료
      if (candidate.reviewState === 'needs-attention') taskTabs.get(originatingTaskId).generationNotice = 'review';
      const draftReady = canEditLabelReviewDraft(candidate);
      currentTurnDone = true; currentTerminalOutcome = 'completed'; serverTurnFinished = true; previewPending = false;
      dispatchReviewEvent({ state: candidate.reviewState, candidateId: candidate.id, report: candidate.reviewReport, generationCount: result.metrics.calls.fullGeneration,
        reviewCount: result.metrics.calls.review, elapsedMs: result.metrics.timings.total }, candidate);
      panel.dispatchEvent(new CustomEvent('5e:ai-image-label-timing', { detail: structuredClone(result.metrics) }));
      if (batchOwnerRun) {
        batchOwnerRun.candidate = candidate;
        // 11-09: 검수 미통과여도 결과를 버리지 않는다(경고는 결과 확인에 남음). 만든 결과는 늘 작업 칸으로 돌려준다.
        batchOwnerRun.resolve({ ...batchOwnerRun.context.owner, operation: 'generate', candidateId: candidate.id, candidate: snapshotImageItem(candidate) });
      } else {
        setTaskState('completed'); taskTabs.get(originatingTaskId).generationNotice = candidate.reviewState === 'needs-attention' ? 'review' : null; renderTaskTabs(); setGenerating(false); setBusy(false);
        setStatus(outOfScope ? outOfScopeMessage : graphKept ? result.keptMessage : fallbackResult ? result.fallbackMessage
          : result.labelReadNotice ? result.labelReadNotice // 11-10: 글자 읽기 실패 → 그림만 넣고 안내
          : candidate.reviewState === 'passed' ? (candidate.reviewReport?.advisory?.length ? `처리 완료 · 참고 사항 ${candidate.reviewReport.advisory.length}개는 결과 확인에서 볼 수 있습니다.` : '처리 완료 · 편집 가능한 결과를 준비했습니다.')
          : draftReady ? candidate.editableDraft?.presentation === 'external-list'
            ? `원본 유지 · 편집 라벨 목록 ${candidate.editableDraft.labelIds.length}개를 준비했습니다. 원본 글자는 남아 있습니다.`
            : result.removalReport?.status === 'partial'
              ? `안전 제거·복원 ${result.labelPlan.labels.length}개 · 보류 ${result.removalReport.deferredLabels.length}개. 원본 구조를 보존했고 복원 라벨은 직접 편집할 수 있습니다.`
              : '편집 초안 준비 · 위치·문구·연결을 확인해 주세요. 추가 라벨 검수는 선택할 수 있습니다.'
          : result.removalReport?.unchanged ? '라벨 제거 보류 · 원본을 유지했습니다. 결과 확인에서 라벨별 사유를 확인하세요.' : '검수 미통과 · 원본과 RAW 결과를 보존했습니다. 표시된 문제를 확인해 주세요.', outOfScope || candidate.reviewState === 'passed' ? 'ok' : 'warn');
        // 11-21: 원본과 대조해 끝내 못 맞춘 곳은 실패로 만들지 않고 「원본과 다를 수 있는 곳」으로만 알린다.
        const convertDiffs = (result.convertCheck?.differences || []).map(item => String(item?.text || '').trim()).filter(Boolean);
        if (convertDiffs.length) {
          addLog(`원본과 다를 수 있는 곳 ${convertDiffs.length}개 — ${convertDiffs.join(' · ')}. 필요하면 「다시 그리기」를 누르거나 직접 고쳐 주세요.`);
          setStatus(`처리 완료 · 원본과 다를 수 있는 곳 ${convertDiffs.length}개는 대화 기록에 적어 두었습니다.`, 'warn');
        } else if (result.convertCheck?.status === 'fixed') addLog('원본과 대조해 빠진 곳을 다시 그려 맞췄습니다.');
        captureActiveTaskTab(); await taskPersistence.checkpoint();
        if (candidate.reviewState === 'passed') window.dispatchEvent(new CustomEvent('5e:ai-output-success', { detail: { candidateId: candidate.id } }));
      }
    } catch (error) {
      // 11-08: 그래프가 든 그림 → 그림을 그리기 전에 멈췄다. 보통 실패 처리(작업 상태·로딩 정리)를 그대로 거친 뒤
      // 같은 그림으로 그래프 복원 창을 연다. 11-09 사용자 결정(그래프는 라벨 복원 금지): 이 작업에서 그래도 다시 변환하면
      // 라벨 복원 없이 원본 그림을 그대로 둔다(graphKeepOriginal — 그래프 글자를 지우지도 라벨로 바꾸지도 않음).
      if (error?.code === 'AI_GRAPH_FIGURE' && isCurrent()) {
        const tab = taskTabs.get(originatingTaskId); if (tab) tab.graphKeepOriginal = true;
        error.message = '그래프가 있는 그림이라 그래프 복원으로 옮겼습니다 · 그래도 이미지로 두려면 이 작업에서 다시 「변환하기」(라벨 복원 없이 원본 그대로)';
        const hwpTarget = hwpInPlaceTargets.get(originatingTaskId), reference = { dataUrl: sources[0].data, name: sources[0].name || '원본' };
        setTimeout(() => window.dispatchEvent(new CustomEvent('5e:ai-open-reference', { detail: { reference, conversionKind: 'graph', ...(hwpTarget ? { hwpTarget: structuredClone(hwpTarget) } : {}) } })), 400);
        for (const ms of [900, 1800, 3500]) setTimeout(() => { try { syncSurfaceTitle(); } catch {} }, ms);
      }
      // 11-09: 변환 안쪽의 대체 결과도 만들지 못한 드문 경우(그림 디코딩 실패 등)에도 실패로 끝내지 않고 원본을 결과로 둔다.
      if (error?.name !== 'AbortError' && error?.code !== 'AI_GRAPH_FIGURE' && !batchOwnerRun && isCurrent() && !pendingRawCandidate?.data && sources[0]?.data) {
        try {
          const reason = String(error?.message || error).slice(0, 200);
          const fallbackCandidate = await addPreview(sources[0].data, { alreadyEditable: true, isCurrent, name: '원본 유지 · 다시 변환 가능', reviewState: 'needs-attention',
            reviewReport: { verdict: 'uncertain', checks: [], issues: [{ code: 'ai-fallback-result', message: `변환을 끝내지 못해 원본을 그대로 두었습니다(원인: ${reason}). 다시 변환할 수 있습니다.`, severity: 'major' }] }, selectCandidate: true });
          if (fallbackCandidate && isCurrent()) {
            Object.assign(fallbackCandidate, { candidateSha256: await imageLabelDigest(fallbackCandidate.data), verifiedCandidateData: fallbackCandidate.data });
            recordAiAttemptFailure({ stage: error?.aiPhase || 'conversion', attempt: 1, attempts: 1, model: null, effort: null, code: error?.code || null,
              message: reason, elapsedMs: Date.now() - currentTurnStartedAt, at: new Date().toISOString() });
            imageReceived = true; currentTurnCandidate = fallbackCandidate; currentTurnDone = true; currentTerminalOutcome = 'completed'; serverTurnFinished = true;
            taskTabs.get(originatingTaskId).generationNotice = 'review';
            setTaskState('completed'); renderTaskTabs(); setGenerating(false); setBusy(false);
            setStatus(fallbackCandidate.reviewReport.issues[0].message, 'warn');
            captureActiveTaskTab(); await taskPersistence.checkpoint();
            return;
          }
        } catch (fallbackError) { if (fallbackError?.name === 'AbortError') throw fallbackError; }
      }
      if (batchOwnerRun) batchOwnerRun.reject(error);
      if (isCurrent()) {
        const generatedThisRun = Boolean(pendingRawCandidate?.data);
        const cancelled = error.name === 'AbortError';
        currentTerminalOutcome = cancelled ? 'cancelled' : generatedThisRun ? 'completed' : 'failed';
        currentTurnPerformance = error.workflowMetrics || currentTurnPerformance;
        if (generatedThisRun && !cancelled) {
          imageReceived = true; currentTurnCandidate = pendingRawCandidate;
          taskTabs.get(originatingTaskId).generationNotice = 'review';
        }
        setTaskState(cancelled ? 'idle' : generatedThisRun ? 'completed' : 'failed'); setGenerating(false); setBusy(false);
        setStatus(generatedThisRun && !cancelled ? '생성 완료 · 확인 사항이 있습니다. 결과 확인에서 내용을 확인하세요.' : error.message, generatedThisRun || cancelled ? 'warn' : 'error', error);
        captureActiveTaskTab(); await taskPersistence.checkpoint();
      }
      throw error;
    } finally {
      batchOwnerRun?.context.signal.removeEventListener('abort', externalAbort);
      if (imageLabelRunAbort === abort) imageLabelRunAbort = null;
    }
  };

  // E9: 설치판 로그인 안내 — 연결 정보(「Codex 로그인」 단추가 있는 칸)를 열고 단추로 데려간다. 로그인하면 resume으로 멈춘 생성을 이어 간다.
  // PATHFIX(11-20): Codex 프로그램이 없으면(missing) 로그인 대신 설치 안내를 보이고, 「다시 찾기」로 찾으면 → 로그인 확인 → 이어 간다.
  // missing을 모르면(null) 상태를 한 번 물어 맞는 안내를 고른다.
  let pendingLoginResume = null;
  function openConnectionDialog() {
    const details = panel.querySelector('details.ai-advanced-settings');
    if (details) details.open = true;
    // 작업대(ai-workbench.js)는 연결 정보 칸을 숨긴 「연결 정보」 창 안으로 옮겨 둔다 — 그 창을 띄워 로그인 단추를 바로 보이게 한다.
    const dialog = details?.closest('[data-ai-connection-dialog]');
    if (dialog) {
      dialog.removeAttribute('hidden');
      if (!dialog.dataset.e9CloseWired) {
        dialog.dataset.e9CloseWired = '1';
        dialog.querySelector('[data-ai-info-close]')?.addEventListener('click', () => dialog.close());
        dialog.addEventListener('close', () => dialog.setAttribute('hidden', ''));
      }
      try { if (!dialog.open) dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
    }
  }
  function guideDesktopLogin(resume, { missing = null, manual = false } = {}) {
    pendingLoginResume = typeof resume === 'function' ? resume : null;
    openConnectionDialog();
    setTaskState('idle');
    const guide = isMissing => {
      // 11-22 시안(설치-업데이트) 5번: Codex가 없으면 그 자리에서 묻지 않고 설치 → 로그인 → 멈춘 요청 이어서.
      if (isMissing && canAutoInstallCodex(desktop)) { void autoInstallCodexHere({ manual }); return; }
      if (isMissing) {
        showCodexInstall(true);
        setStatus(CODEX_MISSING_STATUS, 'warn');
        if (!manual) addLog('이 컴퓨터에서 Codex 프로그램을 찾지 못해 멈췄습니다. 연결 정보의 안내대로 설치한 뒤 「다시 찾기」를 누르면 같은 요청으로 이어서 합니다. 앞 결과와 입력은 그대로입니다.');
        try { codexLocateButton?.scrollIntoView({ block: 'nearest' }); codexLocateButton?.focus({ preventScroll: true }); } catch { /* 보이지 않는 창 */ }
        return;
      }
      showCodexInstall(false);
      loginButton.hidden = false;
      if (manual) { setStatus('「GPT 로그인」을 누르면 브라우저에서 ChatGPT 계정으로 로그인합니다. 로그인하면 이 창이 자동으로 닫힙니다.', 'busy'); }
      else {
      setStatus('GPT 로그인이 필요합니다 · 연결 정보의 「GPT 로그인」을 누르면 로그인한 뒤 이어서 만듭니다. 앞 결과와 입력은 그대로입니다.', 'warn');
        addLog('AI 연결(GPT 로그인)이 없어 생성을 멈췄습니다. 「GPT 로그인」을 누르면 로그인 뒤 같은 요청으로 이어서 만듭니다.');
      }
      try { loginButton.scrollIntoView({ block: 'nearest' }); loginButton.focus({ preventScroll: true }); } catch { /* 보이지 않는 창 */ }
    };
    if (missing != null || typeof desktop?.status !== 'function' || desktop.web) { guide(Boolean(missing)); return; }
    void desktop.status().then(current => guide(codexMissing(current)), () => guide(false));
  }
  // 11-21 사용자: 설치판에서 먼저 로그인할 길이 없었다 — 오른쪽 위 「● AI」·exam 카드의 로그인 요청이 이 창(연결 정보)을 연다.
  // detail.resumeAi가 있으면 로그인 뒤 그 일을 이어 한다(웹판 requireAi와 같은 약속).
  if (globalThis.fiveEDesktop && !globalThis.fiveEDesktop.web && typeof window !== 'undefined') {
    // 11-21: 오른쪽 위 연결 카드에서 로그인·로그아웃하면 작업대의 계정·모델 정보도 새로 읽는다.
    window.addEventListener('5e:desktop-auth-changed', () => { if (!disposed) void refresh({ autoConnect: false }); });
    window.addEventListener('5e:desktop-login-request', event => {
      const resume = typeof event.detail?.resumeAi === 'function' ? event.detail.resumeAi : null;
      guideDesktopLogin(resume, { manual: !resume });
    });
  }
  // 11-22: 작업대 안 자동 설치. 설치 안내 칸을 「AI 연결 준비 중」으로 바꿔 단계·경과 시간을 보이고, 끝나면 바로 로그인.
  let autoInstallTicker = null;
  function renderAutoInstall(info) {
    if (!codexInstallBox) return;
    let auto = codexInstallBox.querySelector('.ai-codex-auto');
    if (!info?.running) { codexInstallBox.removeAttribute('data-mode'); auto?.remove(); clearInterval(autoInstallTicker); autoInstallTicker = null; return; }
    codexInstallBox.dataset.mode = 'auto';
    codexInstallBox.hidden = false;
    if (loginButton) loginButton.hidden = true;
    if (!auto) {
      auto = document.createElement('div'); auto.className = 'ai-codex-auto';
      auto.innerHTML = '<strong>AI 연결 준비 중 · Codex 설치 (1~3분)</strong><p>처음 한 번만 설치합니다. 끝나면 로그인 창이 열리고, 로그인하면 멈춘 요청을 이어서 합니다. 입력은 그대로입니다.</p><div class="ai-codex-steps"></div><div class="ai-codex-install-actions"><button type="button" data-ai-codex-install-cancel>취소</button></div>';
      auto.querySelector('[data-ai-codex-install-cancel]').onclick = () => { void desktop?.cancelInstallCodex?.(); };
      codexInstallBox.prepend(auto);
    }
    const steps = auto.querySelector('.ai-codex-steps');
    const order = INSTALL_STEPS.map(([key]) => key);
    const at = Math.max(0, order.indexOf(info.step === 'done' ? 'install' : info.step));
    steps.replaceChildren();
    let live = null;
    INSTALL_STEPS.forEach(([key, label], index) => {
      const row = document.createElement('div');
      row.className = index < at || info.step === 'done' ? 'done' : index === at ? 'on' : '';
      const mark = document.createElement('i'); mark.textContent = row.className === 'done' ? '✓' : row.className === 'on' ? '◌' : '·';
      const text = document.createElement('span'); text.textContent = label;
      if (row.className === 'on') live = text;
      row.append(mark, text); steps.append(row);
    });
    const last = document.createElement('div'); last.innerHTML = '<i>·</i><span>로그인 → 이어서 만들기</span>'; steps.append(last);
    clearInterval(autoInstallTicker); autoInstallTicker = null;
    if (live && info.startedAt) {
      const base = live.textContent;
      const tick = () => { live.textContent = `${base} · ${elapsedText(Date.now() - info.startedAt)}`; };
      tick(); autoInstallTicker = setInterval(tick, 1000);
    }
  }
  let autoInstallWatch = null;
  async function autoInstallCodexHere({ manual = false } = {}) {
    autoInstallWatch ||= onCodexInstall(info => { if (!disposed) renderAutoInstall(info); });
    showCodexInstall(false);
    renderAutoInstall({ running: true, step: 'download', startedAt: Date.now() });
    setStatus('AI 연결 준비 중 · Codex를 설치하고 있습니다(1~3분). 끝나면 로그인 창이 열립니다.', 'busy');
    if (!manual) addLog('이 컴퓨터에 Codex 프로그램이 없어 설치부터 합니다. 끝나면 로그인 창이 열리고, 로그인하면 같은 요청으로 이어서 합니다. 앞 결과와 입력은 그대로입니다.');
    const result = await installCodex(desktop);
    renderAutoInstall({ running: false });
    if (disposed) return;
    if (!result?.ok) {
      const cancelled = result?.code === 'CODEX_INSTALL_CANCELLED';
      showCodexInstall(true, cancelled ? '설치를 취소했습니다. 아래 명령으로 직접 설치한 뒤 「다시 찾기」를 눌러도 됩니다.' : `${result?.message || 'Codex를 설치하지 못했습니다.'} 아래 명령으로 직접 설치한 뒤 「다시 찾기」를 누르면 이어서 합니다.`);
      setStatus(cancelled ? 'Codex 설치를 취소했습니다.' : (result?.message || 'Codex를 설치하지 못했습니다.'), 'warn');
      addLog(cancelled ? 'Codex 설치를 취소했습니다. 멈춘 요청은 그대로 기다립니다.' : `Codex 설치 실패: ${result?.message || ''}${result?.detail ? ` (${result.detail})` : ''}`, cancelled ? undefined : 'error');
      reportAiError('codex:install', result || {});
      return;
    }
    addLog(result.already ? 'Codex 프로그램을 찾았습니다.' : 'Codex 설치를 마쳤습니다. 로그인 창을 엽니다.');
    window.dispatchEvent(new CustomEvent('5e:desktop-auth-changed', { detail: { kind: 'installed' } }));
    const current = await desktop.status().catch(() => null);
    if (current?.login?.loggedIn) { await resumeAfterConnection('Codex를 찾았습니다. 멈췄던 요청을 이어서 합니다.'); return; }
    showCodexInstall(false);
    loginButton.hidden = false;
    if (!loginWaiting) { loginWaiting = true; try { await waitForDesktopLogin(); } finally { loginWaiting = false; } }
  }
  // 연결이 갖춰지면(로그인 끝·Codex 찾음) 멈춘 요청을 이어 간다.
  async function resumeAfterConnection(message) {
    loginButton.hidden = true;
    showCodexInstall(false);
    await refresh({ autoConnect: true });
    const connectionDialog = panel.querySelector('[data-ai-connection-dialog]');
    if (connectionDialog?.open) connectionDialog.close();
    const resume = pendingLoginResume; pendingLoginResume = null;
    if (resume && !busy) { addLog(message); void resume(); }
  }
  // PATHFIX: 설치 안내 단추(「다시 찾기」·「오류 기록 열기」) 연결. 함수로 두고 위에서 한 번 부른다.
  function wireCodexInstallControls() {
  if (codexLocateButton) codexLocateButton.onclick = async () => {
    if (!desktop?.locateCodex) return;
    codexLocateButton.disabled = true;
    if (codexInstallNote) codexInstallNote.textContent = '찾는 중…';
    try {
      const found = await desktop.locateCodex();
      if (!found?.found) {
        if (codexInstallNote) codexInstallNote.textContent = '아직 찾지 못했습니다. 설치가 끝났는지 확인한 뒤 다시 눌러 주세요. 멈춘 요청은 그대로 기다립니다.';
        return;
      }
      if (codexInstallNote) codexInstallNote.textContent = '';
      addLog(`Codex 프로그램을 찾았습니다 (${found.path}).`);
      const current = await desktop.status().catch(() => null);
      if (current?.login?.loggedIn) await resumeAfterConnection('Codex를 찾았습니다. 멈췄던 요청을 이어서 합니다.');
      else guideDesktopLogin(pendingLoginResume, { missing: false });
    } catch (error) {
      if (codexInstallNote) codexInstallNote.textContent = aiErrorText(error);
      reportAiError('codex:locate', error);
    } finally { codexLocateButton.disabled = false; }
  };
  if (openErrorLogButton) {
    openErrorLogButton.hidden = !desktop?.diagnostics?.openLog;
    openErrorLogButton.onclick = () => { void desktop?.diagnostics?.openLog?.().catch(() => {}); };
  }
  }

  // 1.8.0 새 그림 엔진 한 차례(js/ai-engines.js → js/ai-figure). 지금 생성과 같은 자리(결과 카드)에 넣고, 진행은 지금 진행 표시 글만 바꾼다.
  // 실패로 끝나지 않게: 엔진 안 재시도·반대 모델 → 한 장도 못 그리면 옛 생성 길로 이어서. 앞 결과 카드는 지우지 않는다.
  async function runFigureEngineTurn({ runInput, entered, discussionContext, requestEpoch, options = {} }) {
    const taskId = activeTaskTabId;
    const request = [discussionContext, entered].filter(Boolean).join('\n\n');
    // CHATFIX: 「이미지 생성」은 지금까지 대화 전체를 구체화에 넘긴다(앞서는 마지막 한 마디만 썼다 — CHATGEN 3절).
    const conversation = String(options.figureConversation || '');
    const gatheredMeta = options.figureGathered ? { request: options.figureGathered.request || request, conversation, count: options.figureGathered.count || 0, summary: options.figureGathered.summary || [] } : null;
    const again = () => submit('image', { ...options, silentUserLog: true, requestOverride: entered, discussionContextOverride: discussionContext, bypassCache: true });
    const stopWith = (outcome) => {
      newEngineRunActive = false;
      finishStatusBlock({ remove: true });
      if (requestEpoch !== currentRequestEpoch || disposed) return;
      advanceGenerationClock('turn-terminal', 'failed');
      requestPhase(outcome === 'login' ? 'login-wait' : 'offline-wait'); setGenerating(false); setBusy(false);
      if (outcome === 'login') return guideDesktopLogin(again);
      // 연결이 끊김: 옛 길도 같은 연결을 쓰므로 넘기지 않는다. 연결이 돌아오면(online) 한 번 이어서 만든다.
      setTaskState('idle');
      setStatus('인터넷 연결을 확인해 주세요 · AI 서버에 닿지 못해 이번에는 그리지 못했습니다. 앞 결과와 입력은 그대로 두었고, 연결되면 이어서 만듭니다.', 'warn');
      addLog(`AI 서버에 연결하지 못했습니다. 인터넷이 다시 연결되면 자동으로 이어서 그립니다. ${runAgainHint(sendButton?.textContent)}`, 'error');
      const epochAtStop = currentRequestEpoch;
      window.addEventListener('online', () => { if (!disposed && !busy && currentRequestEpoch === epochAtStop) void again(); }, { once: true, signal: lifecycle.signal });
    };
    // E9: 설치판에서 Codex 로그인이 없으면 엔진·옛 길 모두 몇 번씩 실패한 뒤 「변환에 실패했습니다」로 끝났다 — 먼저 확인하고 연결 화면으로.
    if (!desktop.web && typeof desktop.status === 'function') {
      let login = null;
      try { login = (await desktop.status())?.login || null; } catch { login = null; }
      if (requestEpoch !== currentRequestEpoch || disposed) return;
      if (login && (login.loggedIn === false || login.installed === false)) return stopWith('login');
    }
    if (!busy) setBusy(true);
    // E9: 앞 차례를 취소한 표시(currentCancelRequested)가 남아 있으면 새 차례가 시작하자마자 「취소됨」으로 끝났다 — 옛 길처럼 새 차례에서 지운다.
    imageReceived = false; currentTurnType = 'image'; currentEngine = IMAGE_ENGINE_IDS.RASTER; currentCancelRequested = false;
    currentRunInput = runInput; currentTerminalOutcome = null; currentImageOutputError = null;
    currentTurnCandidate = null; pendingCacheOutput = null; currentTurnDone = false; serverTurnFinished = false;
    currentRequestSnapshot = { entered, request, discussionContext, annotatedRequest: request, renderRequest: request, runInput };
    providerRequestPersistable = true; persistTasks();
    // 엔진은 호출마다 시간 제한·재시도가 있어 전체 3분 제한 대신 엔진 결과를 기다린다(그래프 생성과 같음).
    clearTimeout(requestTimeout); requestTimeout = null;
    const abort = new AbortController(); imageLabelRunAbort = abort;
    const isCurrent = () => !disposed && requestEpoch === currentRequestEpoch && activeTaskTabId === taskId && !currentCancelRequested && !abort.signal.aborted;
    const clockId = `figure-${requestEpoch}`; currentTurnId = clockId; startGenerationClock(clockId);
    newEngineRunActive = true;
    // 11-19(시안 태그 7·9): 새 로딩 창(흐린 빈 종이 + 4단계)과 대화 안 진행 줄.
    if (pendingLoading?.token === requestToken) pendingLoading = { ...pendingLoading, kind: 'figure', plan: 'figure', phased: true, source: pendingLoading.source || blankPaper() };
    const turnStartedAt = Date.now();
    if (isFigureCreate()) startStatusBlock('figure');
    requestPhase('generating');
    let scene = 0, total = 1;
    const show = copy => { if (!isCurrent()) return; if (copy.title) setGenerating(true, copy.title, copy.detail || ''); else if (copy.detail) progressDetail.textContent = copy.detail; };
    setStatus('이미지 생성 중…', 'busy');
    show(figurePhaseCopy({ phase: 'index' }));
    const models = engineModels({ selected: runInput.model, catalog: runInput.modelCatalog || availableModels });
    const switchLogged = new Set();
    const ai = createDesktopEngineAi(desktop, engineRaster, { imageModels: imageModelOrder(models.image), textModels: [runInput.model, ...imageModelOrder(runInput.model)], onCall: e => {
      if (e.kind !== 'image') return;
      show(figurePhaseCopy({ phase: 'draw', scene, total }));
      if (isCurrent()) { loading.stage('draw'); statusPhase('draw'); }
      // E2E(11-19): 장면을 다시 그릴 때마다 같은 줄이 또 찍혔다 — 차례마다 모델별로 한 번만.
      if (e.attempt > 1 && isCurrent() && !switchLogged.has(e.model)) { switchLogged.add(e.model); addLog(`그림 모델을 바꿔(${e.model}) 다시 그립니다.`); }
    } });
    // 두 번 그려도 비었을 때: 결과로 넣지 않고(앞 결과 그대로), 모은 「그릴 내용」은 대화에 남겨 둔 채 다음 할 일 칩을 붙인다.
    const keepAfterBlank = () => {
      newEngineRunActive = false;
      finishStatusBlock({ remove: true });
      if (!isCurrent()) return;
      const hadPrevious = generatedImages.length > 0;
      advanceGenerationClock('turn-terminal', 'failed');
      requestPhase(hadPrevious ? 'kept-previous' : 'completed'); setTaskState(hadPrevious ? 'completed' : 'idle');
      setGenerating(false); setBusy(false);
      addLog(hadPrevious ? '두 번 그려도 빈 그림이 나와 결과로 넣지 않았어요. 앞 결과는 그대로예요.' : '두 번 그려도 빈 그림이 나와 결과로 넣지 않았어요. 위에 모은 그릴 내용은 그대로 두었어요.');
      const lastUser = [...conversationMessages].reverse().find(message => message.role === 'user')?.text || '';
      addFlowChips([
        { id: 'retry-draw', label: '다시 그리기', strong: true, payload: { request, conversation, count: gatheredMeta?.count || 0, summary: gatheredMeta?.summary || [] } },
        { id: 'reword', label: '말 바꿔 다시 적기', payload: { kind: 'new', text: lastUser } },
      ]);
      setStatus(hadPrevious ? '빈 그림이라 넣지 않았습니다 · 앞 결과는 그대로' : '빈 그림이라 넣지 않았습니다 · 다시 그리거나 말을 바꿔 보세요', 'warn');
      captureActiveTaskTab(); persistTasks();
    };
    const fallBack = async (why) => {
      newEngineRunActive = false;
      finishStatusBlock({ remove: true });
      if (requestEpoch !== currentRequestEpoch || disposed) return;
      addLog(`새 그림 엔진이 그림을 만들지 못해 이전 생성 방식으로 이어서 그립니다.${why ? ` (${String(why).slice(0, 200)})` : ''}`, 'error');
      advanceGenerationClock('turn-terminal', 'failed');
      requestPhase('failed'); setGenerating(false); setBusy(false);
      return submit('image', { ...options, legacyFigure: true, silentUserLog: true, requestOverride: entered, discussionContextOverride: discussionContext || conversation, bypassCache: true });
    };
    const enginePhase = e => {
      if (Number.isInteger(e.total)) total = e.total;
      if (Number.isInteger(e.scene)) scene = e.scene;
      // 11-20 사용자 결정: 참고한 기출 그림은 화면에 말하지 않는다(엔진 기록 「참고 기출: …」「참고 그림 없이」는 진행 글에 안 띄움).
      if (!(e.phase === 'log' && /기출|참고 그림/.test(String(e.message || '')))) show(figurePhaseCopy(e));
      if (isCurrent() && e.phase) { loading.stage(e.phase); statusPhase(e.phase); }
    };
    let outcome, refIds = [];
    try {
      await taskPersistence.checkpoint();
      if (!isCurrent()) throw new DOMException('작업이 취소되었습니다.', 'AbortError');
      // 「다른 기출로 다시 그리기」: 앞서 참고한 기출을 빼고 다시 고른 3장을 넘긴다.
      const otherOf = options.otherRefsOf ? generatedImages.find(item => item.id === options.otherRefsOf) : null;
      if (otherOf?.meta?.refs?.length) {
        statusPhase('scene');
        refIds = await pickOtherFigureRefs({ ai, request, exclude: otherOf.meta.refs, models, signal: abort.signal });
        if (!isCurrent()) throw new DOMException('작업이 취소되었습니다.', 'AbortError');
      }
      outcome = await runFigureEngine({ ai, request, conversation, models, refIds, signal: abort.signal, onPhase: enginePhase });
    } catch (error) {
      outcome = error?.name === 'AbortError' ? { aborted: true, fresh: [], errors: [] } : { aborted: false, fresh: [], errors: [{ message: error?.message || String(error) }] };
    } finally { if (imageLabelRunAbort === abort) imageLabelRunAbort = null; }
    if (outcome.aborted || !isCurrent()) {
      newEngineRunActive = false;
      finishStatusBlock({ remove: true });
      if (requestEpoch === currentRequestEpoch && !disposed && activeTaskTabId === taskId) {
        advanceGenerationClock('turn-terminal', 'cancelled'); requestPhase('cancelled');
        setTaskState('idle'); setGenerating(false); setBusy(false); setStatus(GENERATION_STOPPED, 'warn');
      }
      return;
    }
    if (!outcome.fresh.length) {
      if (ai.health?.authRequired) return stopWith('login');
      if (ai.health?.offline) return stopWith('offline');
      return fallBack(outcome.errors.map(e => e.message).filter(Boolean).join(' / '));
    }
    // CHATFIX(시안 태그 12·13): 빈(흰) 그림은 결과로 넣지 않는다 → 다른 그림 모델로 한 번 더 → 그래도 비면 앞 결과 그대로 + 다음 할 일 칩.
    let freshScenes = outcome.fresh, blankRedrawn = false;
    const blankFlags = await Promise.all(freshScenes.map(sceneResult => isBlankFigure(sceneResult.image)));
    if (blankFlags.some(Boolean) && isCurrent()) {
      const other = imageModelOrder(models.image)[1];
      addLog(`그림이 비어 나와 다른 그림 모델(${other})로 한 번 더 그립니다.`);
      const ai2 = createDesktopEngineAi(desktop, engineRaster, { imageModels: imageModelOrder(other), textModels: [runInput.model, ...imageModelOrder(runInput.model)], onCall: e => {
        if (e.kind !== 'image') return;
        show(figurePhaseCopy({ phase: 'draw', scene, total }));
        if (isCurrent()) { loading.stage('draw'); statusPhase('draw'); }
      } });
      let second = null;
      imageLabelRunAbort = abort;
      try { second = await runFigureEngine({ ai: ai2, request, conversation, models: { ...models, image: other }, refIds, signal: abort.signal, onPhase: enginePhase }); }
      catch (error) { second = { aborted: error?.name === 'AbortError', fresh: [], errors: [] }; }
      finally { if (imageLabelRunAbort === abort) imageLabelRunAbort = null; }
      if (second?.aborted || !isCurrent()) {
        newEngineRunActive = false; finishStatusBlock({ remove: true });
        if (requestEpoch === currentRequestEpoch && !disposed && activeTaskTabId === taskId) {
          advanceGenerationClock('turn-terminal', 'cancelled'); requestPhase('cancelled');
          setTaskState('idle'); setGenerating(false); setBusy(false); setStatus(GENERATION_STOPPED, 'warn');
        }
        return;
      }
      const secondFlags = await Promise.all((second?.fresh || []).map(sceneResult => isBlankFigure(sceneResult.image)));
      const merged = [];
      const length = Math.max(freshScenes.length, second?.fresh?.length || 0);
      for (let i = 0; i < length; i++) {
        if (freshScenes[i] && !blankFlags[i]) merged.push(freshScenes[i]);
        else if (second?.fresh?.[i] && !secondFlags[i]) { merged.push(second.fresh[i]); blankRedrawn = true; }
      }
      freshScenes = merged;
    }
    if (!freshScenes.length) return keepAfterBlank();
    requestPhase('validating');
    advanceGenerationClock('image-received'); advanceGenerationClock('postprocess-started');
    const added = [];
    try {
      for (const sceneResult of freshScenes) {
        const m = sceneResult.meta;
        const item = await addPreview(sceneResult.image, { isCurrent, name: m.sceneCount > 1 ? `생성 결과 ${generatedImages.length + 1} · 장면 ${m.sceneIndex + 1}/${m.sceneCount}` : undefined });
        if (!item) break;
        item.meta = { ...m, ...(gatheredMeta ? { gathered: gatheredMeta } : {}), ...(blankRedrawn ? { blankRedrawn: true } : {}),
          ui: { kind: 'figure', elapsedMs: Date.now() - turnStartedAt, ...(options.otherRefsOf ? { otherRefsOf: options.otherRefsOf } : {}) } }; item.engine = 'ai-figure';
        added.push(item);
      }
    } catch (error) {
      if (!added.length) return fallBack(error?.message || String(error));
      addLog(`생성 결과 처리 중 오류: ${error?.message || error}`, 'error');
    }
    newEngineRunActive = false;
    if (!isCurrent()) return;
    if (!added.length) return fallBack('결과를 등록하지 못했습니다.');
    imageReceived = true; currentTurnCandidate = added.at(-1);
    serverTurnFinished = true; currentTurnDone = true; currentTerminalOutcome = 'completed';
    advanceGenerationClock('postprocess-completed'); advanceGenerationClock('turn-terminal', 'completed');
    window.dispatchEvent(new CustomEvent('5e:ai-output-success', { detail: { candidateId: currentTurnCandidate.id } }));
    const sceneErrors = outcome.errors.filter(e => e.scene !== null && e.scene !== undefined);
    // 11-19(시안 태그 13·19): 옛 「이미지가 완성되었습니다. 참고한 기출 그림: …」 글 대신 대화 안 결과 카드.
    finishStatusBlock();
    for (const item of added) addResultEntry(item);
    setTaskState('completed'); requestPhase('completed'); setGenerating(false); setBusy(false);
    setStatus(sceneErrors.length ? `생성 완료 · 장면 ${sceneErrors.length}개는 그리지 못했습니다. 다시 실행하면 그 장면을 다시 그립니다.` : '생성 완료', sceneErrors.length ? 'warn' : 'ok');
    captureActiveTaskTab(); persistTasks();
    try { await taskPersistence.checkpoint(); } catch {}
    return added;
  }


  const submit = async (type, options = {}) => {
    if (panel.dataset.aiSharingMode === 'view') return;
    if (type === 'image' && (isGraphWorkflow(conversionKind) || isGraphWorkflow(options.runInputSnapshot?.conversionKind))) return runGraphRestore(options);
    if (busy || preflightRun) return;
    if (!desktop) return refresh();
    // 실행마다 번호를 매긴다. 취소한 이전 라벨 변환이 늦게 끝나면 새 실행의 진행 표시·작업 중 표시를 꺼 버렸다(M42).
    const runSerial = submit.serial = (submit.serial || 0) + 1;
    const preflight = {};
    const originatingTaskId = activeTaskTabId;
    const activeInput = type === "chat" ? chatInput : input;
    const entered = typeof options.requestOverride === "string" ? options.requestOverride.trim() : activeInput?.value.trim() || "";
    const originatingConversation = compactConversation(conversationMessages.slice(conversationMessages.map((message) => message?.role).lastIndexOf('reset') + 1)); // V5: 「새 대화」 위 대화는 넘기지 않는다
    const originatingRunInput = options.runInputSnapshot ? {...structuredClone(options.runInputSnapshot), serviceTier:'priority'} : {
      attachments: attachments.map(snapshotImageItem),
      generated: generatedImages.map(snapshotImageItem),
      mode: selectedMode,
      outputEngine: selectedOutputEngine,
      qualityMode: selectedQualityMode,
      complexPass: 1,
      selectedCandidateId,
      referenceComposition: structuredClone(referenceComposition),
      markPolicy: readMarkPolicy(),
      preserveSourceLabels: readPreserveSourceLabels(),
      imageLabelWorkflow: readImageLabelWorkflow(), preciseRestore: preciseRestoreCheckbox?.checked === true,
      examBriefProfile: taskTabs.get(activeTaskTabId)?.examBriefProfile,
      generationMode: selectedAssetGenerationMode,
      reviewEnabled: reviewModeCheckbox?.checked !== false,
      ...(modelsLoaded ? modelSelection() : savedModelPreference()),
    };
    // 11-09 사용자 결정: 출처(교과서/기출)를 모르는 그림은 막다른 경고 대신 그 자리에서 고르게 하고, 고르면 바로 이어서 변환한다.
    if (type === 'image' && !options.runInputSnapshot && !isCreationWorkflow(conversionKind) && !isExamBrief(originatingRunInput)
      && normalizeOutputEngine(originatingRunInput.outputEngine) !== AI_OUTPUT_ENGINES.ASSET
      && originatingRunInput.attachments.some(item => item.referenceRole !== 'STYLE_REFERENCE')
      && !['exam', 'general'].includes(originatingRunInput.imageLabelWorkflow?.imageKind)) {
      requestSourceChoice(); return;
    }
    currentRequestSnapshot = null;
    providerRequestPersistable = false;
    preflightRun = preflight;
    const preparingToken = beginRequest(type);
    let preparationAccepted = false;
    try {
      if (desktop.web) {
        const connection = await desktop.status();
        if (!connection.login?.loggedIn) {
          window.dispatchEvent(new CustomEvent('5e:web-login-request', { detail: { resumeAi: resumeAfterLogin } }));
          return;
        }
      }
      // E2E(11-19 실제 설치판): Codex 로그인이 없어도 Codex는 기본 모델 목록(gpt-6.1-sol 없음)을 돌려준다. 그래서 그림 엔진의
      // 로그인 확인(runFigureEngineTurn)까지 가기 전에 「선택 모델 …을 사용할 수 없습니다」에서 멈췄다(막다른 경고).
      // 모델을 고르기 전에 로그인부터 보고, 없으면 연결 정보 창으로 데려간 뒤 로그인하면 같은 요청으로 이어 간다.
      if (!desktop.web && typeof desktop.status === 'function') {
        let login = null;
        try { login = (await desktop.status())?.login || null; } catch { login = null; }
        if (login && (login.loggedIn === false || login.installed === false)) {
          if (requestToken !== preparingToken || !requestStates.live(preparingToken)) return;
          requestPhase('login-wait'); // 실패가 아니라 로그인(또는 설치) 대기 — 로그인·「다시 찾기」하면 같은 요청으로 이어 간다
          guideDesktopLogin(() => submit(type, options), { missing: login.installed === false });
          return;
        }
      }
      if (!modelsLoaded) await loadModels();
      Object.assign(originatingRunInput, defaultAIModelSelection(availableModels, originatingRunInput));
      originatingRunInput.modelCatalog = structuredClone(availableModels);
    } catch (error) {
      if (requestToken !== preparingToken || !requestStates.live(preparingToken)) return;
      // PATHFIX: Codex가 없으면 막다른 오류 대신 설치 안내 → 「다시 찾기」로 같은 요청을 이어 간다.
      if (!desktop.web && aiErrorCode(error) === 'CODEX_NOT_FOUND') { reportAiError('submit:prepare', error); requestPhase('login-wait'); guideDesktopLogin(() => submit(type, options), { missing: true }); return; }
      setStatus(`연결 상태를 확인하지 못했습니다: ${aiErrorText(error)}`, 'error', error);
      return;
    } finally {
      if (preflightRun === preflight) preflightRun = null;
      queueMicrotask(() => {
        if (requestToken === preparingToken && !preparationAccepted) {
          if (requestStates.live(preparingToken)) requestPhase('failed');
          setGenerating(false); setBusy(false);
        }
      });
    }
    if (requestToken !== preparingToken || !requestStates.live(preparingToken)) return;
    if (disposed || activeTaskTabId !== originatingTaskId) {
      requestStates.advance(preparingToken, 'cancelled');
      return;
    }
    let request = type === "image"
      ? kiceImageRequest(entered, { hasImage: originatingRunInput.attachments.length > 0 || originatingRunInput.generated.length > 0 })
      : entered;
    if (!request) {
      if (type === "image") setStatus("먼저 레퍼런스 이미지나 손그림을 추가해 주세요.", "warn");
      return;
    }
    const discussionContext = type === "image"
      ? (typeof options.discussionContextOverride === "string"
        ? options.discussionContextOverride
        : (entered === originatingConversation ? "" : originatingConversation))
      : "";
    let runInput = prepareExamBriefRunInput(enforceKiceImageRunInput(originatingRunInput));
    runInput.referenceComposition = normalizeReferenceComposition(runInput.referenceComposition, runInput.attachments);
    runInput.markPolicy = normalizeMarkPolicy(runInput.markPolicy);
    runInput.preserveSourceLabels = runInput.preserveSourceLabels === true;
    if (type === 'image' && !isExamBrief(runInput) && normalizeOutputEngine(runInput.outputEngine) !== AI_OUTPUT_ENGINES.ASSET && runInput.attachments.some(item => item.referenceRole !== 'STYLE_REFERENCE')) {
      try {
        runInput.imageLabelWorkflow = normalizeImageLabelWorkflow(runInput.imageLabelWorkflow, { requireExplicit: true });
        preparationAccepted = true;
        const labelWorkflowRequest = [discussionContext, entered].filter(Boolean).join('\n\n');
        await runImageLabelConversion({ runInput, request: labelWorkflowRequest, generationInstructions: labelWorkflowRequest, options, originatingTaskId });
      } catch (error) {
        if (!disposed && activeTaskTabId === originatingTaskId && runSerial === submit.serial) {
          const notice = taskTabs.get(originatingTaskId)?.generationNotice === 'review';
          const cancelled = error.name === 'AbortError';
          requestPhase(cancelled ? 'cancelled' : notice ? 'completed' : 'failed'); setGenerating(false); setBusy(false);
          setStatus(notice ? '생성 완료 · 확인 사항이 있습니다. 결과 확인에서 내용을 확인하세요.' : error.message, notice || cancelled ? 'warn' : 'error');
        }
        if (batchRun) batchRun.reject(error);
      }
      return;
    }
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
    const revisionImage = runInput.generated.find((item) => item.id === runInput.selectedCandidateId) || runInput.generated.at(-1) || null;
    roleGroups.inputs = orderedInputReferences(roleGroups.inputs, runInput.referenceComposition);
    runInput.sourceReferenceCount = roleGroups.inputs.length;
    const needsReferenceComposite = type === 'image' && roleGroups.inputs.length >= 2;
    const requestComments = commentPrompt([
      ...(!needsReferenceComposite ? roleGroups.inputs : []),
      ...(revisionImage ? [revisionImage] : []),
    ]);
    const annotatedHistory = []; // old-version comments never become new-version anchors
    const planningReferences = [...roleGroups.inputs, ...annotatedHistory];
    if (!options.silentUserLog && !runInput.approvedFirstPng) {
      try { recordConversationMessage("user", request); }
      catch (error) {
        requestPhase('failed');
        setGenerating(false);
        setBusy(false);
        setStatus(error?.name === 'QuotaExceededError'
          ? "브라우저 저장 공간이 부족해 대화를 저장하지 못했습니다. 입력한 내용은 그대로 두었습니다."
          : "브라우저에 대화를 저장하지 못했습니다. 입력한 내용은 그대로 두었습니다.", 'error');
        return;
      }
    }
    const requestEpoch = ++currentRequestEpoch;
    const immediateBatchRun = batchRun;
    preparationAccepted = true;
    // 1.8.0(11-19 사용자 결정): 이미지 생성(설명으로 새 그림)은 새 그림 엔진으로 대체 — 구체화→기출 3장 검색→그리기→설명 지우기→흑백.
    // 설치판에서만 돈다(웹은 지금 길). 사용자가 직접 넣은 레퍼런스가 있는 생성과, 엔진이 한 장도 못 그려 넘어온 경우는 옛 길.
    if (type === 'image' && isExamBrief(runInput) && !batchRun) {
      const route = figureRoute({ desktop, storage: channelStorage, hasUserReferences: (runInput.attachments || []).length > 0, legacy: options.legacyFigure === true });
      if (route.use && options.figureEdit) return runFigureEditTurn({ runInput, entered, requestEpoch, options });
      if (route.use) return runFigureEngineTurn({ runInput, entered, discussionContext, requestEpoch, options });
    }
    if (!busy) setBusy(true);
    imageReceived = false;
    currentTurnType = type;
    // 11-21: setBusy(true)가 차례 종류를 정하기 전에 불려 대화 답 기다림 표시가 안 떴다 — 종류가 정해진 뒤 띄운다.
    if (type === 'chat' && panel.dataset.aiCreateUi === 'true') showChatThinking();
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
    currentTurnCandidate = null;
    pendingEditableLabelPlan = null;
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
    if (!options.silentUserLog && !options.createBubbleShown) {
      if (runInput.approvedFirstPng) {
        addLog("이미지 변환을 요청했습니다.");
      } else {
        addLog(request, "user");
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
      let figureRefContext = '';
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
          prompt: isExamBrief(runInput) ? buildExamBriefPrompt({ request: renderRequest }) : renderRequest,
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
                if (immediateBatchRun) assertImmediateNativeBatchOwner(immediateBatchRun, requestEpoch);
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
                labelPlan: cached.entry.output.labelPlan || null,
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
              if (currentEngine === IMAGE_ENGINE_IDS.FAST_SCENE && finishImmediateNativeBatch(immediateBatchRun, cachedItem, requestEpoch)) return;
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
          if (immediateBatchRun) assertImmediateNativeBatchOwner(immediateBatchRun, requestEpoch);
          const item = addScenePreview(compiled, compiledScene.source, compiledScene.compileSource);
          if (!item) throw new Error("검증된 내부 도식을 미리보기에 추가하지 못했습니다.");
          stageCurrentOutput({
            data: item.data,
            sceneSource: compiledScene.source,
            sceneCompileSource: compiledScene.compileSource,
          });
          await commitCurrentOutput();
          if (immediateBatchRun) assertImmediateNativeBatchOwner(immediateBatchRun, requestEpoch);
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
          if (finishImmediateNativeBatch(immediateBatchRun, item, requestEpoch)) return;
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
        // 11-22: 그림 생성 대화 — 결과가 참고한 기출(meta.refs)을 대화 맥락에 넣는다(화면 표시는 그대로).
        // 그림을 직접 봐야 하는 질문(비교·차이 …)일 때만 지금 보는 결과의 참고 기출 그림을 첨부한다(엔진 캐시 재사용).
        if (type === 'chat' && isFigureCreate()) {
          try {
            const shown = selectedOutputItem() || generatedImages.at(-1) || null;
            const results = generatedImages.map(item => ({ name: item.name, refs: figureRefIds(item), selected: item === shown })).filter(r => r.refs.length).slice(-6);
            if (results.length) {
              const ids = [...new Set(results.flatMap(r => r.refs))];
              const tags = await figureRefTags(ids);
              let attachedCount = 0;
              const shownRefs = figureRefIds(shown);
              if (shownRefs.length && wantsFigureRefImages(entered)) {
                const images = await loadFigureRefImages(shownRefs);
                const refItems = shownRefs.map((id, i) => (images[i] ? { id: `figure-ref-${id}`, name: `참고한 기출 · ${figureRefLabel(id, tags.get(id) || null).split(' — ')[0]}`, data: images[i], kind: 'reference', sourceKind: 'auto', comments: [] } : null)).filter(Boolean);
                const refAttachments = (await Promise.all(refItems.map(item => prepareTransportItem(item).catch(() => null)))).filter(Boolean);
                outgoingAttachments = [...outgoingAttachments, ...refAttachments];
                attachedCount = refAttachments.length;
              }
              figureRefContext = figureRefContextText(results, tags, { attachedCount });
            }
          } catch { figureRefContext = ''; /* 맥락을 못 만들어도 대화는 보낸다 */ }
        }
      }

      currentTurnPerformance = {
        ...currentTurnPerformance,
        clientPrepareMs: Math.round(performance.now() - clientPrepareStartedAt),
        transportSourceBytes: outgoingItems.reduce((sum, item) => sum + Number(item.aiTransport?.sourceBytes || 0), 0),
        transportBytes: outgoingItems.reduce((sum, item) => sum + Number(item.aiTransport?.transportBytes || 0), 0),
        transportFallbackCount: outgoingItems.filter((item) => item.aiTransport?.usedFallback).length,
      };
      if (requestEpoch !== currentRequestEpoch || currentCancelRequested) throw new Error("작업 준비가 취소되었습니다.");
      if (type === 'image' && currentEngine === IMAGE_ENGINE_IDS.RASTER && runInput.preserveSourceLabels) {
        const sourceAttachments = observationAttachments || outgoingAttachments;
        const sourceCount = sourceAttachments.length - (revisionImage ? 1 : 0);
        if (sourceCount !== 1) throw new Error('편집 라벨은 하나의 원본 캔버스를 기준으로 복구합니다. 원본을 한 장의 조합 이미지로 준비해 주세요.');
        runInput.sourceLabelAttachments = sourceAttachments.slice(0, sourceCount).map(a => ({ name: a.name, data: a.data }));
        setStatus('원본 라벨 확인 중…', 'busy');
        setGenerating(true, '원본 라벨을 확인하고 있습니다', '글자·기호와 설명 지시선의 제거·복구 명세를 준비합니다.', 'analyze');
        const labelStartedAt = performance.now();
        runInput.frozenLabelPlan = await sourceLabelAnalysis.analyze({ request: renderRequest,
          attachments: runInput.sourceLabelAttachments, model: runInput.model, effort: runInput.effort,
          serviceTier: runInput.serviceTier, models: runInput.modelCatalog || availableModels });
        if (requestEpoch !== currentRequestEpoch || currentCancelRequested) throw new Error('작업 준비가 취소되었습니다.');
        pendingEditableLabelPlan = runInput.frozenLabelPlan;
        currentTurnPerformance = { ...currentTurnPerformance, sourceLabelAnalysisMs: Math.round(performance.now() - labelStartedAt) };
        panel.dispatchEvent(new CustomEvent('5e:ai-source-label-plan', { detail: JSON.parse(JSON.stringify(runInput.frozenLabelPlan)) }));
        addLog(`원본 라벨 ${pendingEditableLabelPlan.labels.length}개의 제거·복구 명세를 확정했습니다.`);
        setGenerating(true, '이미지를 생성하고 있습니다', '확정한 명세에 따라 일반 라벨을 제거합니다.', 'generate');
      }
      if (whiteRun && !runInput.approvedFirstPng && !revisionImage && outgoingAttachments.length) {
        setStatus("원본을 확인하는 중…", "busy");
        setGenerating(true, "원본을 확인하고 있습니다", "선택한 이미지와 요청 내용을 준비합니다.", "analyze");
        const analysisStartedAt = performance.now();
        const analysisAttachments = observationAttachments || outgoingAttachments;
        const bindings = await Promise.all(analysisAttachments.map(async item => {
          const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(item.data));
          return {name:item.name, transportSha256:Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("")};
        }));
        if (requestEpoch !== currentRequestEpoch || currentCancelRequested) throw new Error("작업 준비가 취소되었습니다.");
        const spec = await structureAnalysis.analyze({request:renderRequest, attachments:analysisAttachments, model:runInput.model, effort:runInput.effort, serviceTier:runInput.serviceTier, models:runInput.modelCatalog || availableModels});
        if (requestEpoch !== currentRequestEpoch || currentCancelRequested) throw new Error("작업 준비가 취소되었습니다.");
        runInput.structureSpec = JSON.parse(JSON.stringify(spec));
        runInput.structureRecord = {version:STRUCTURE_SPEC_VERSION, spec:runInput.structureSpec, sourceBindings:bindings, model:runInput.model, effort:runInput.effort, elapsedMs:Math.round(performance.now()-analysisStartedAt)};
        currentTurnPerformance = {...currentTurnPerformance, structureAnalysisMs:runInput.structureRecord.elapsedMs};
        panel.dispatchEvent(new CustomEvent("5e:ai-structure",{detail:JSON.parse(JSON.stringify(runInput.structureRecord))}));
        setStatus("이미지 생성 중…", "busy");
        setGenerating(true, "이미지를 생성하고 있습니다", "선택한 이미지와 요청 내용을 반영합니다.", "generate");
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
      const baseRequestText = type === 'image' && isExamBrief(runInput)
        ? buildExamBriefPrompt({ request: requestWithVisualPlan, referenceRoleContract, revision: Boolean(revisionImage) })
        : runInput.approvedFirstPng ? approvedFirstRequestText({ prompt: firstPrompt, referenceRoleContract, instructions: firstInstructions }) : (type === "image"
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
        : buildDiscussionPrompt({ request: annotatedRequest, mode: runInput.mode, creating: isFigureCreate(), context: figureRefContext }));
      const requestText = type === "image" && currentEngine === IMAGE_ENGINE_IDS.RASTER && !isExamBrief(runInput)
        ? sourceLabelRequest(baseRequestText, runInput, labelEvidenceForRun(runInput, renderRequest))
        : baseRequestText;
      const result = await desktop.send({
        text: requestText,
        attachments: outgoingAttachments,
        conversationId: type === "chat" ? conversationId : null,
        resetConversation: type === "chat" && forceNewConversation,
        purpose,
        ephemeralRender: type === "image",
        model: runInput.model,
        effort: runInput.effort,
        serviceTier: runInput.serviceTier,
      });
      if (requestEpoch !== currentRequestEpoch || !requestStates.live(preparingToken)) return;
      if (!requestStates.bind(preparingToken, result)) throw new Error('생성 작업 ID가 없어 결과를 연결할 수 없습니다.');
      currentTurnId = result.turnId || null;
      currentRenderThreadId = result.renderThreadId || result.threadId || null;
      awaitingTurnId = false;
      if (type === "image" && currentTurnId) {
        startGenerationClock(currentTurnId);
        requestPhase("generating");
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
      // 생성(그림 만들기)은 원본이 없다: 「변환에 실패」「작업 취소됨」 대신 생성 문구로, 까닭(인터넷·로그인·AI)을 나눠 말한다.
      const creatingFigure = type === 'image' && isCreationWorkflow(conversionKind), reason = failureReason(error);
      requestPhase(currentCancelRequested ? 'cancelled' : creatingFigure && generatedImages.length ? 'kept-previous' : 'failed', { reason });
      const cancelled = currentCancelRequested || error?.code === "AI_TURN_CANCELLED" || /작업 준비가 취소/.test(error?.message || "");
      pendingCacheOutput = null;
      addLog(aiErrorText(error), cancelled ? "" : "error");
      // PATHFIX: Codex가 없어서 실패했으면 설치 안내를 열고 「다시 찾기」로 같은 요청을 이어 간다(막다른 실패 대신).
      if (!cancelled && !desktop?.web && reason === 'install') {
        setGenerating(false); setBusy(false);
        guideDesktopLogin(() => submit(type, { ...options, silentUserLog: true }), { missing: true });
        return;
      }
      setStatus(cancelled ? (creatingFigure ? GENERATION_STOPPED : "작업 취소됨") : error?.code === "AI_TASK_CHECKPOINT_FAILED"
        ? "임시저장 실패 · AI 요청을 보내지 않았습니다"
        : creatingFigure ? generationFailedText(reason) : type === 'image' ? "변환에 실패했습니다. 입력과 코멘트는 보존되었습니다." : "요청 실패", cancelled ? "warn" : "error");
      setGenerating(false);
      setBusy(false);
    }
  };

  loginButton.onclick = async () => {
    if (!desktop) return refresh();
    if (loginWaiting) return;
    loginWaiting = true;
    try { await waitForDesktopLogin(); } finally { loginWaiting = false; }
  };
  let loginWaiting = false;
  // PATHFIX(11-20): main이 `codex login`이 끝날 때까지 기다려 실제 결과를 돌려준다(예전: 늘 {ok:true} → 120초 헛기다림 → 「시간 초과」).
  async function waitForDesktopLogin() {
    setStatus("브라우저에서 로그인을 완료해 주세요… 로그인 창이 열립니다.", "busy");
    let result;
    try { result = await desktop.login(); } catch (error) { result = { ok: false, code: aiErrorCode(error), message: error?.message || String(error) }; }
    if (result && result.ok === false) {
      reportAiError('codex:login', result);
      if (aiErrorCode(result) === 'CODEX_NOT_FOUND') { guideDesktopLogin(pendingLoginResume, { missing: true }); return; }
      setStatus(aiErrorText(result), "warn");
      addLog(`${aiErrorText(result)}${result.detail ? ` (${result.detail})` : ''}`, "error");
      loginButton.hidden = false;
      return;
    }
    // 로그인이 끝났다고 했으면 상태로 한 번 더 확인한다(잠깐 늦게 반영되는 경우를 위해 몇 초만 다시 본다).
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const current = await desktop.status().catch(() => null);
      if (current?.login?.loggedIn) {
        // E9: 로그인이 없어 멈췄던 생성은 로그인하면 그대로 이어서 만든다(막다른 경고 대신 연결 화면 → 이어 하기).
        await resumeAfterConnection('로그인되었습니다. 멈췄던 생성을 이어서 합니다.');
        return;
      }
      if (codexMissing(current)) { guideDesktopLogin(pendingLoginResume, { missing: true }); return; }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    reportAiError('codex:login', { code: 'CODEX_NOT_LOGGED_IN', message: '로그인은 끝났다고 했지만 로그인 상태가 확인되지 않음' });
    setStatus("로그인이 확인되지 않았습니다 · 「GPT 로그인」을 다시 눌러 주세요. 멈춘 요청은 그대로 기다립니다.", "warn");
    loginButton.hidden = false;
  }
  const persistModelChoice = () => {
    const choice = modelSelection();
    localStorage.setItem('5e.aiModel', choice.model);
    sessionStorage.setItem('5e.aiModelExplicit', choice.model);
    localStorage.setItem('5e.aiEffort', choice.effort);
    localStorage.setItem('5e.aiSpeed', choice.serviceTier || '');
    syncModelWarning(); captureActiveTaskTab(); persistTasks();
  };
  modelSelect.addEventListener('change', () => {
    const entry = catalogEntry();
    populateEfforts(entry?.efforts.includes(effortSelect.value) ? effortSelect.value : entry?.defaultEffort);
    populateSpeeds(!speedSelect.value || entry?.tiers.includes(speedSelect.value) ? speedSelect.value : entry?.defaultServiceTier ?? null);
    persistModelChoice();
  });
  modelRefreshButton.addEventListener('click', async () => { if (busy) return; modelsLoaded = false; await loadModels(); });
  effortSelect.addEventListener('change', persistModelChoice);
  speedSelect.addEventListener('change', persistModelChoice);
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
  for (const select of [backgroundPolicySelect, examPaletteSelect, lineThicknessSelect, separationModeSelect].filter(Boolean)) {
    select.addEventListener('keydown', (event) => {
      if (select.disabled || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
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
    if (!outputChoiceAllowed('background', backgroundPolicySelect.value)) { syncOutputProcessingUi(); return; }
    // 11-09 사용자 원칙: 배경 제거·객체 분리는 설정처럼 언제든 바꿀 수 있어야 한다(묶여서 안 바뀌는 단추 금지).
    // 물체 분리 중에 「원본 유지」를 고르면 분리도 「한 장」으로 같이 바꾼다.
    const separationTurnedOff = backgroundPolicySelect.value === 'preserve' && selectedSeparationMode !== AI_SEPARATION_MODES.OFF;
    selectedImageOutputOptions = normalizeImageOutputOptions({
      ...selectedImageOutputOptions,
      backgroundPolicy: backgroundPolicySelect.value,
    });
    const lite = document.documentElement.dataset.mode === 'lite';
    if (separationTurnedOff) {
      singleBackgroundPolicy = 'preserve';
      applySeparationMode(AI_SEPARATION_MODES.OFF);
      if (lite) liteSeparationMode = selectedSeparationMode;
      localStorage.setItem(lite ? '5e.aiLiteSeparationMode' : '5e.aiSeparationMode', selectedSeparationMode);
    }
    if (lite) liteBackgroundPolicy = selectedImageOutputOptions.backgroundPolicy;
    localStorage.setItem(lite ? '5e.aiLiteOutputBackgroundPolicy' : '5e.aiOutputBackgroundPolicy', selectedImageOutputOptions.backgroundPolicy);
    syncOutputProcessingUi();
    refreshOutputPreviews();
    restartSelectedAutomaticSeparation(separationTurnedOff ? 'separation-mode-changed' : undefined);
    captureActiveTaskTab(); persistTasks();
    setStatus(separationTurnedOff ? '배경을 원본 그대로 두고, 물체 분리는 「한 장」으로 같이 바꿨습니다.' : '추가 AI 요청 없이 기기에서 배경을 처리합니다. 생성 원본은 유지됩니다.', 'ok');
  });
  examPaletteSelect?.addEventListener('change', () => {
    if (!localAppearanceAllowed()) { syncOutputProcessingUi(); return; }
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
    if (!localAppearanceAllowed()) { syncOutputProcessingUi(); return; }
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
  separationModeSelect?.addEventListener('change', () => {
    if (!outputChoiceAllowed('objects', separationModeSelect.value)) { syncOutputProcessingUi(); return; }
    applySeparationMode(normalizeSeparationMode(separationModeSelect.value));
    const lite = document.documentElement.dataset.mode === 'lite';
    if (lite) liteSeparationMode = selectedSeparationMode;
    localStorage.setItem(lite ? '5e.aiLiteSeparationMode' : '5e.aiSeparationMode', selectedSeparationMode);
    syncOutputProcessingUi();
    refreshOutputPreviews();
    restartSelectedAutomaticSeparation('separation-mode-changed');
    captureActiveTaskTab(); persistTasks();
    setStatus(selectedSeparationMode === AI_SEPARATION_MODES.OFF
      ? '생성 결과를 한 장의 이미지로 유지합니다.'
      : selectedSeparationMode === AI_SEPARATION_MODES.MANUAL
      ? '생성 결과에서 분리할 영역을 직접 지정할 수 있습니다.'
      : selectedSeparationMode === AI_SEPARATION_MODES.GRID
        ? '생성 결과를 격자 기준으로 다시 분석합니다.'
        : '생성 결과의 객체를 자동으로 다시 분석합니다.', 'ok');
  });
  generationModeSelect.addEventListener('change', () => {
    if (!outputChoiceAllowed('objects', generationModeSelect.value === AI_ASSET_GENERATION_MODES.SEPARATED ? 'auto' : 'off')) { syncSelectedOutputActions(); return; }
    const hasOutput = Boolean(selectedOutputItem());
    applySeparationMode(generationModeSelect.value === AI_ASSET_GENERATION_MODES.SEPARATED
      ? AI_SEPARATION_MODES.AUTO : AI_SEPARATION_MODES.OFF);
    const lite = document.documentElement.dataset.mode === 'lite';
    if (lite) liteSeparationMode = selectedSeparationMode;
    localStorage.setItem(lite ? '5e.aiLiteSeparationMode' : '5e.aiSeparationMode', selectedSeparationMode);
    syncOutputProcessingUi(); refreshOutputPreviews();
    restartSelectedAutomaticSeparation('image-composition-changed');
    syncConversionSummary();
    captureActiveTaskTab(); persistTasks();
    if (hasOutput) {
      setStatus('추가 AI 요청 없이 현재 선택 결과의 이미지 구성을 바꿨습니다. 생성 원본은 유지됩니다.', 'ok');
      return;
    }
    setStatus(selectedAssetGenerationMode === AI_ASSET_GENERATION_MODES.SEPARATED
      ? '다음 첫 변환을 최대 16개 물체 분리용 이미지로 생성합니다.' : '다음 변환을 한 장의 이미지로 생성합니다.', 'ok');
  });
  retryInterruptedButton.addEventListener('click', () => {
    const tab = taskTabs.get(activeTaskTabId);
    const retry = tab?.retryRequest;
    const removalRetry = tab?.workState === 'completed' && tab.sourceLabelObservation?.removalIncomplete === true;
    if (busy || (!['interrupted', 'failed'].includes(tab?.workState) && !removalRetry) || !retry?.snapshot) return;
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
    if (action === 'clipboard') void pickFromClipboard();
  });
  document.addEventListener('mousedown', (event) => {
    if (!sourceMenu?.hidden && !event.target.closest('.ai-source-menu-shell')) closeSourceMenu();
  }, { signal: lifecycle.signal });
  compareButton.onclick = openComparison;
  referenceSearchButton.onclick = () => {
    void openPdfReferencePicker({ ...createUnifiedAiSourceConsumer({ addReferencesAsTasks, setStatus }), trigger: sourceMenuTrigger || referenceSearchButton })
      .catch(error => setStatus(error instanceof Error ? error.message : String(error), "error"));
  };
  if (captureButton) captureButton.onclick = () => { void openCaptureChooser(); };
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
          preserveSourceLabels: options.preserveSourceLabels === true,
          imageLabelWorkflow: options.imageLabelWorkflow || { explicit: false },
          qualityMode: options.qualityMode, model: options.model, effort: options.effort, serviceTier: options.serviceTier,
          state: "running", resultData: null, queueRecord,
        };
        batchActive = true;
        batchRuns.set(job.id, job);
        void startQueuedBatchJob(job);
      },
      interrupt(queueRecord) {
        const job = batchRuns.get(queueRecord.id);
        job?.workflowAbort?.abort(); job?.labelController?.cancel(); job?.rasterController?.cancel();
        return job?.turnId ? desktop.interrupt({ turnId: job.turnId, clientScope }) : { ok: true };
      },
    },
  });
  if (durableBatchUi) void durableBatchUi.resume();
  if (batchButton) batchButton.onclick = runBatch;
  reviewModeCheckbox?.addEventListener("change", syncWhitePngUi);
  preserveSourceLabels?.addEventListener("change", () => { syncConversionSummary(); captureActiveTaskTab(); persistTasks(); });
  // 11-09: 출처를 고르라고 알린 뒤 사람이 고르면 바로 변환을 이어 간다.
  let sourceChoicePending = false;
  function requestSourceChoice() {
    sourceChoicePending = true;
    const row = panel.querySelector('[data-ai-source-kind-row]');
    if (row) row.hidden = false; // 11-22: 숨겨진 출처 줄을 고르라고만 하던 막다른 안내 — 줄을 보여 준다
    row?.classList.add('ai-needs-choice');
    row?.scrollIntoView?.({ block: 'nearest' });
    row?.querySelector('[data-ai-setting-value]:not([disabled])')?.focus?.({ preventScroll: true });
    setStatus('출처를 골라 주세요 · 교과서는 평가원 스타일로 새로 그리고, 기출은 원본 그대로 둡니다. 고르면 바로 변환합니다.', 'warn');
  }
  imageKindSelect?.addEventListener('change', () => {

    if (preciseRestoreCheckbox) { preciseRestoreCheckbox.checked = false; preciseRestoreCheckbox.disabled = imageKindSelect.value !== 'general'; }
    captureActiveTaskTab(); persistTasks();
    panel.querySelector('[data-ai-source-kind-row]')?.classList.remove('ai-needs-choice');
    if (['exam', 'general'].includes(imageKindSelect.value)) { const row = panel.querySelector('[data-ai-source-kind-row]'); if (row) row.hidden = true; }
    syncSourceDecision();
    syncWhitePngUi();
    // 11-10: 원본 종류를 나중에 골라도 기본 라벨 처리(기출 복원·교과서 삭제)를 맞춘다. 사용자가 라벨 설정을 직접 바꾼 작업은 그대로 둔다.
    if (labelResultSelect) {
      const nextLabelResult = labelResultAfterKindChange({ imageKind: imageKindSelect.value, current: labelResultSelect.value, touched: taskTabs.get(activeTaskTabId)?.labelResultTouched === true });
      if (nextLabelResult !== labelResultSelect.value) { labelResultSelect.value = nextLabelResult; labelResultSelect.dispatchEvent(new Event('change', { bubbles: true })); } // 합성 이벤트라 touched로 기록되지 않는다
    }
    if (sourceChoicePending && ['exam', 'general'].includes(imageKindSelect.value)) { sourceChoicePending = false; void submit('image'); }
  });
  labelResultSelect?.addEventListener('change', event => {
    if (event.isTrusted && taskTabs.get(activeTaskTabId)) taskTabs.get(activeTaskTabId).labelResultTouched = true; // 사용자가 직접 고른 경우만 기록
    if (preserveSourceLabels) preserveSourceLabels.checked = labelResultSelect.value === 'restore-editable';
    captureActiveTaskTab(); persistTasks(); syncConversionSummary();
  });
  labelVerificationSelect?.addEventListener('change', () => { captureActiveTaskTab(); persistTasks(); compactSettings?.sync(); });
  preciseRestoreCheckbox?.addEventListener('change', () => { captureActiveTaskTab(); persistTasks(); });
  for (const control of markControls) control?.addEventListener("change", () => {captureActiveTaskTab();persistTasks();});
  panel.addEventListener('5e:ai-label-correction-draft', () => {
    if (busy || panel.dataset.aiSharingMode === 'view') return;
    const item = generatedImages.find(candidate => candidate.id === selectedCandidateId) || generatedImages.at(-1);
    if (!item?.labelPlan?.frozen) return;
    const draft = buildSourceLabelCorrectionDraft({ request: item.requestSnapshot?.request || currentRequestSnapshot?.request || input.value,
      report: item.reviewReport });
    if (!draft) return;
    input.value = draft.request;
    input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
    captureActiveTaskTab(); persistTasks();
    setStatus(`${draft.label} 교정 요청을 준비했습니다. 내용을 확인한 뒤 변환을 실행하세요.`, 'warn');
  });
  panel.addEventListener("5e:ai-candidate-select", (event) => {
    // The workbench has already changed the visible card before this event.
    // Scoped edits must track that change and invalidate the in-flight proposal.
    if (busy && !currentRunInput?.scopedEdit) return;
    const item = generatedImages.find((entry) => entry.id === event.detail?.candidateId);
    if (item) {
      const previous = selectedOutputItem();
      const previousImage = previous?.card?.querySelector('.ai-preview-stage > img');
      const nextImage = item.card?.querySelector('.ai-preview-stage > img');
      const sameFrame = previous !== item && previousImage?.naturalWidth > 0
        && previousImage.naturalWidth === nextImage?.naturalWidth && previousImage.naturalHeight === nextImage?.naturalHeight;
      const scroll = sameFrame ? candidateViewportPositions.get(previous) : null;
      const preservePosition = () => {
        if (!scroll || selectedCandidateId !== item.id || !item.card?.isConnected) return;
        item.card.scrollLeft = scroll.left; item.card.scrollTop = scroll.top;
      };
      abortAutomaticSeparation('candidate-changed');
      scopedSelectionRevision += 1;
      selectedCandidateId = item.id;
      panel.dataset.aiSelectedCandidateId = item.id;
      preservePosition(); requestAnimationFrame(preservePosition);
      dispatchReviewEvent({ ...item.reviewMeta, state: item.reviewState, candidateId: item.id, report: item.reviewReport }, item, { restore:true });
      if (busy && currentRunInput?.scopedEdit) scopedTransport?.fail(new Error('수정 중 선택 버전이 변경되어 이전 결과를 차단했습니다.'));
      else setStatus(isAcceptedReviewState(item.reviewState) ? selectedReviewStatusText(item.reviewState) : "선택 결과 · 확인 필요", isAcceptedReviewState(item.reviewState) ? "ok" : "warn");
      captureActiveTaskTab();
      syncGraphWorkbenchUi();
      if (candidateUsesAutomaticSeparation(item)) void startAutomaticSeparation(item);
    }
  });
  chatButton.onclick = () => {
    // 11-11: 결과에 표시한 코멘트(박스·점)가 있으면 대화 내용을 영역 수정 요청으로 보낸다. 없으면 Codex 대화로 간다.
    const item = selectedOutputItem();
    if (item && !item.sceneResult && !isGraphWorkflow(conversionKind) && Array.isArray(item.comments) && item.comments.length) {
      const fromChat = composeRequestFromChat();
      if (!fromChat) return;
      // 11-14: 대화 글을 박스 수정에 직접 넘긴다 — 예전엔 대화 칸을 비운 뒤 박스 수정이 빈 대화 칸을 읽어 글이 통째로 빠졌다.
      if (localEraseController?.getDraft(item)) { setStatus('먼저 수정 저장을 눌러 편집을 완료하세요.', 'warn'); return; }
      input.value = fromChat;
      chatInput.value = '';
      void startScopedEdit(item, { chatText: fromChat });
      return;
    }
    submit("chat");
  };
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
  // 11-11: 이 작업의 사용자 대화(아직 안 보낸 입력 포함)를 요청 글로 쓴다. 옛 「첫 변환」 요청 칸을 대신한다.
  const composeRequestFromChat = () => [
    ...conversationMessages.filter(message => message.role === 'user').map(message => message.text),
    chatInput?.value.trim(),
  ].filter(Boolean).join('\n');
  // 11-11: 실행 단추를 누르기 직전(캡처 단계)에 대화 내용을 요청 글로 옮긴다. 실행 본문은 그대로 둔다.
  // 11-11: 요청 칸은 숨겨진 칸이라 대화가 바뀔 때마다 대화 내용을 그대로 옮겨 둔다(이미지 생성의 실행 단추 상태 검사도 이 칸을 본다).
  // 11-11: 값을 옮긴 뒤 input 이벤트를 보내 실행 단추 상태(글자·누를 수 있는지)가 바로 다시 계산되게 한다.
  const syncRequestFromChat = () => { const next = composeRequestFromChat(); if (input.value !== next) { input.value = next; input.dispatchEvent(new Event('input', { bubbles: true })); } };
  sendButton.addEventListener('click', syncRequestFromChat, true);
  chatInput?.addEventListener('input', syncRequestFromChat);
  sendButton.onclick = () => {
    if (localEraseController?.getDraft(selectedOutputItem())) {
      setStatus('먼저 수정 저장을 눌러 편집을 완료하세요.', 'warn'); return;
    }
    if (launchSelected?.()) return;
    if (isGraphWorkflow(conversionKind)) { void submit('image'); return; }
    const item = selectedOutputItem();
    if (item && !item.sceneResult && !isExamBrief(taskTabs.get(activeTaskTabId))) {
      // 11-11: 결과에 표시(박스·점)가 있으면 그 부분만 고치고, 표시가 없으면 「다시 그리기 · 정밀」(Sol로 원본을 처음부터 다시 그림).
      if ((item.comments || []).length) { void startScopedEdit(item); return; }
      // 11-11 사용자: 박스 없이 대화로만 「동그라미 안을 원본처럼 회색으로」라고 해도 고쳐야 한다 —
      // 대화 글이 있으면 그림 전체를 허용 범위로 한 부분 수정(원본·지금 그림을 함께 읽음), 없으면 처음부터 다시 그리기.
      const chatText = typeof chatInput === 'undefined' ? '' : chatInput?.value.trim(); // 검사가 이 본문만 떼어 돌린다
      if (chatText) { chatInput.value = ''; void startScopedEdit(item, { comments: [{ type: 'area', id: `chat-${Date.now()}`, imageId: item.id, x: 0, y: 0, w: 100, h: 100, text: chatText }], chatText: '', wholeImage: true }); return; }
      void submit("image", { bypassCache: true, regenerate: true });
      return;
    }
    void submit("image", { bypassCache: !readImageLabelWorkflow().explicit });
  };
  chatInput?.addEventListener("keydown", (event) => {
    // CHATFIX(11-20): 생성 탭은 위의 생성 탭 처리만 쓴다. 한글 조합 중 Enter(isComposing·keyCode 229)는 어디서도 보내지 않는다.
    if (isFigureCreate() || isImeEnter(event)) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      chatButton.click();
    }
  });
  // 11-11: 빈 칸 불러오기 단추 — 큰 단추는 바로 라이브러리, ＋는 파일·클립보드 메뉴. 단축키 ⇧⌘L(라이브러리)·⌘O(파일).
  const openLibraryImport = trigger => void openPdfReferencePicker({...createUnifiedAiSourceConsumer({addReferencesAsTasks,setStatus}),trigger}).catch(error=>setStatus(error instanceof Error ? error.message : String(error),'error'));
  const closeEmptyImportMenus = () => panel.querySelectorAll('.ai-stage-import-menu').forEach(menu => { if (!menu.hidden) { menu.hidden = true; menu.parentElement?.querySelector('[data-ai-empty-more]')?.setAttribute('aria-expanded', 'false'); } });
  panel.addEventListener('click', event => {
    const target = event.target.closest?.('[data-ai-empty-library],[data-ai-empty-more],[data-ai-empty-file],[data-ai-empty-paste]');
    if (!target) { if (!event.target.closest?.('.ai-stage-import')) closeEmptyImportMenus(); return; }
    if (target.matches('[data-ai-empty-more]')) {
      const menu = target.parentElement.querySelector('.ai-stage-import-menu'); const open = menu.hidden;
      closeEmptyImportMenus(); menu.hidden = !open; target.setAttribute('aria-expanded', String(open)); return;
    }
    closeEmptyImportMenus();
    if (busy) return;
    if (target.matches('[data-ai-empty-library]')) openLibraryImport(target);
    else if (target.matches('[data-ai-empty-file]')) { if (!file.disabled) file.click(); }
    else if (target.matches('[data-ai-empty-paste]')) void pickFromClipboard();
  });
  document.addEventListener('keydown', event => {
    if (panel.hidden || busy || !(event.metaKey || event.ctrlKey) || event.altKey) return;
    if (event.target?.closest?.('input, textarea, [contenteditable="true"]') && !event.shiftKey) return;
    if (event.shiftKey && (event.code === 'KeyL' || event.key?.toLowerCase() === 'l')) { event.preventDefault(); event.stopPropagation(); openLibraryImport(referenceSearchButton || panel); }
    else if (!event.shiftKey && (event.code === 'KeyO' || event.key?.toLowerCase() === 'o')) { event.preventDefault(); event.stopPropagation(); if (!file.disabled) file.click(); }
  }, { capture: true, signal: lifecycle.signal });
  panel.addEventListener('change', event => {
    const control=event.target.closest?.('[data-ai-empty-import]');if(!control || busy)return;
    const selected=control.value;control.value='';
    if(selected==='file' && !file.disabled)file.click();
    if(selected==='library')void openPdfReferencePicker({...createUnifiedAiSourceConsumer({addReferencesAsTasks,setStatus}),trigger:control}).catch(error=>setStatus(error.message,'error'));
  });
  panel.addEventListener("click", (event) => {
    if (event.target.closest("[data-ai-add-file]") && !file.disabled) file.click();

  });
  const interruptCurrentTask = async () => {
    if (!busy && !preflightRun) return;
    if (graphSubmitting || graphWorkflow.isActive()) {
      currentCancelRequested=true;currentRequestEpoch+=1;imageLabelRunAbort?.abort();
      requestPhase('cancelled');advanceGenerationClock('turn-terminal','cancelled');
      await graphWorkflow.cancel();
      graphSubmitting=false;setTaskState('idle');setGenerating(false);setBusy(false);
      setStatus(conversionKind === 'graph-create' ? GENERATION_STOPPED : '그래프 복원 취소됨 · 원본과 이전 결과 유지','warn');
      captureActiveTaskTab();await taskPersistence.checkpoint();
      return {ok:true};
    }
    const cancelledToken = requestToken;
    currentCancelRequested = true;
    imageLabelRunAbort?.abort();
    requestPhase("cancelled");
    abortAutomaticSeparation('generation-cancelled');
    scopedTransport?.fail(new Error("선택 영역 수정이 취소되었습니다."));
    pendingCacheOutput = null;
    const reviewWasActive = imageReview?.isActive() === true;
    structureAnalysis.cancel();
    abortSourceComposites();
    for (const controller of sourceLabelControllers) controller.cancel();
    if (reviewWasActive) imageReview.cancel();
    else setStatus("작업 취소 중…", "busy");
    // 먹통 고침(11-21): 대화(Codex app-server) 턴의 멈추기는 {ok:true}가 아니라 {}·{pending:true}·null로 돌아오고,
    // 뒤따르는 interrupted 이벤트는 이미 cancelled라 dispatchAiEvent가 버린다 → 「작업 취소 중…」에서 영원히 멈췄다.
    // 응답 모양과 상관없이(오류·5초 무응답 포함) 화면을 반드시 멈춤 상태로 정리한다. 늦게 오는 이벤트는 epoch로 버려진다.
    let outcome = null;
    try {
      outcome = await Promise.race([
        Promise.resolve(desktop?.interrupt?.()),
        new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), 5000)),
      ]);
    } catch (error) { outcome = { error: error?.message || String(error) }; }
    if (requestToken === cancelledToken) {
      currentRequestEpoch += 1; preflightRun = null;
      setTaskState('idle'); setGenerating(false); setBusy(false);
      setStatus(isCreationWorkflow(conversionKind) ? GENERATION_STOPPED : '작업 취소됨 · 원본 유지', 'warn');
    }
    return { ...(outcome && typeof outcome === 'object' ? outcome : {}), ok: true };
  };
  panel.querySelector("[data-ai-interrupt]").onclick = () => batchRun ? cancelWorkspaceJob(batchRun.context) : interruptCurrentTask();
  async function clearTasks(confirm, ids = null) {
    if (panel.dataset.aiSharingMode === 'view') return {confirmed:false,removedIds:[],retainedIds:[...taskTabs.keys()]};
    await workspaceReady;
    captureActiveTaskTab();
    const result = await clearTaskWorkspaces({
      tasks: [...taskTabs.values()].filter(tab=>!ids || ids.includes(tab.id)),
      confirm,
      cancel: async tab => {
        const result = await acknowledgeActiveTaskClearCancellation({ tab, activeTaskTabId, interrupt: interruptCurrentTask });
        if (result.acknowledged) {
          currentRequestEpoch += 1;
          setBusy(false);
        }
        return result;
      },
      remove: async tab => { taskTabs.delete(tab.id); taskViews.delete(tab.id); taskRows.delete(tab.id); requestStates.forget(tab.id); },
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
  panel.querySelector('[data-ai-tab-select-all]')?.addEventListener('click', () => {
    if (panel.dataset.aiSharingMode !== 'view') void selectCollection?.();
  }, { signal: lifecycle.signal });
  tabClearButton?.addEventListener('click', async () => {
    const confirm = count => scopedDialog('선택 작업 삭제', `선택한 ${count}개 작업을 삭제할까요? 원본 파일은 삭제하지 않습니다.`, { accept: `${count}개 삭제`, defaultAccept: true });
    const result = await (clearCollection ? clearCollection(confirm) : clearTasks(confirm, []));
    if (!result?.confirmed) return;
    setStatus(result.retainedIds.length
      ? `${result.removedIds.length}개 정리 · ${result.retainedIds.length}개 취소 확인 필요`
      : `${result.removedIds.length}개 작업을 정리했습니다.`, result.retainedIds.length ? 'warn' : 'ok');
  });
  let sourceReadEpoch = 0;
  const sourceReadContext = () => ({
    taskId: activeTaskTabId, task: taskTabs.get(activeTaskTabId),
    sources: attachments, revision: currentRequestEpoch,
  });
  const captureSourceRead = () => ({
    epoch: ++sourceReadEpoch, visibility: localVisibilityEpoch,
    target: captureAiPasteTarget(sourceReadContext()),
  });
  const sourceReadCurrent = owner => !disposed && !busy && !preflightRun
    && panel.dataset.aiSharingMode !== 'view' && owner.epoch === sourceReadEpoch
    && owner.visibility === localVisibilityEpoch
    && isAiPasteTargetCurrent(owner.target, sourceReadContext());
  const importSourceFiles = async (files, sourceKind = 'auto') => {
    if (!files.length || disposed || busy || preflightRun || panel.dataset.aiSharingMode === 'view') return;
    const owner = captureSourceRead();
    try {
      // 생성 탭 레퍼런스: PNG·JPEG·WebP, 개당 20MB 이하, 손상된 그림은 넣지 않는다(옛 「도식 만들기」 참고 이미지 규칙, 10-22 A-4).
      if (isCreationWorkflow(conversionKind)) {
        const bad = files.find(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024);
        if (bad) { setStatus(`${bad.name}: 레퍼런스는 PNG·JPEG·WebP 이미지(개당 20MB 이하)만 넣을 수 있습니다.`, 'warn'); return; }
      }
      const dataUrls = await Promise.all(files.map(blobToDataUrl));
      if (isCreationWorkflow(conversionKind)) for (const [index, url] of dataUrls.entries()) {
        const probe = new Image(); probe.src = url;
        try { await probe.decode(); } catch { setStatus(`${files[index].name}: 손상되었거나 읽을 수 없는 이미지입니다.`, 'warn'); return; }
      }
      if (!sourceReadCurrent(owner)) return;
      const ids = addReferencesAsTasks(files.map((selected, index) => ({ name: selected.name, data: dataUrls[index], sourceKind })));
      if (!referenceLimitStatus() && ids.length) setStatus(`이미지 ${files.length}개 · 작업 ${ids.length}개 준비됨`, 'ok');
    } catch (error) {
      if (sourceReadCurrent(owner)) setStatus(`이미지를 읽지 못했습니다: ${error.message}`, 'error', error);
    }
  };
  file.onchange = () => {
    const selectedFiles = Array.from(file.files || []).filter(selected => selected.type.startsWith('image/'));
    // Reset before reading so the same file can be selected after failure, and
    // an older completion cannot clear a newer selection.
    file.value = '';
    return importSourceFiles(selectedFiles);
  };
  replaceSourceButton?.addEventListener('click', () => {
    if (!busy && attachments.length) replaceSourceFile?.click();
  });
  if (replaceSourceFile) replaceSourceFile.onchange = async () => {
    const selected = Array.from(replaceSourceFile.files || []).find((entry) => entry.type.startsWith('image/'));
    replaceSourceFile.value = '';
    if (!selected || disposed || busy || preflightRun || panel.dataset.aiSharingMode === 'view') return;
    const sourceSelect = panel.querySelector('[data-ai-source-select]');
    const target = attachments.find((item) => item.id === sourceSelect?.value) || attachments[0];
    if (!target) return;
    const owner = captureSourceRead();
    let data;
    try {
      data = await blobToDataUrl(selected);
    } catch (error) {
      if (sourceReadCurrent(owner)) setStatus(`이미지를 읽지 못했습니다: ${error.message}`, 'error', error);
      return;
    }
    if (!sourceReadCurrent(owner) || !attachments.includes(target)) return;
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

  const reviewEnabled = () => currentRunInput?.reviewEnabled ?? (reviewModeCheckbox?.checked !== false);

  const finishCurrentTurnUi = (eventEpoch = currentRequestEpoch) => {
    if (eventEpoch !== currentRequestEpoch || !serverTurnFinished) return;
    advanceGenerationClock("turn-terminal", currentTerminalOutcome);
    if (previewPending) return;
    if (batchRun && batchRun.context.snapshot.operation === 'generate') {
      if (currentRunInput?.frozenLabelPlan && batchRun.candidate && currentTerminalOutcome === 'completed' && !currentImageOutputError) {
        if (currentReviewScheduled) return;
        currentReviewScheduled = true;
        const owner = batchRun, candidate = owner.candidate, run = currentRunInput;
        void reviewSourceLabelCandidate({ controller: sourceLabelReview, run, candidate,
          request: currentRequestSnapshot?.request || '',
          isCurrent: () => batchRun === owner && eventEpoch === currentRequestEpoch && !currentCancelRequested,
        }).catch(error => ({ verdict: 'uncertain', checks: [], issues: [{ message: error.message }] })).then(report => {
          if (batchRun !== owner || eventEpoch !== currentRequestEpoch || currentCancelRequested) return;
          const gated = enforcePngAcceptance({ state: report.verdict === 'pass' ? 'passed' : 'needs-attention', report }, candidate);
          candidate.reviewReport = gated.report; candidate.reviewState = gated.state;
          candidate.labelPlan = { ...run.frozenLabelPlan, qualityReview: gated.report, reviewRequired: gated.state !== 'passed' };
          currentTurnDone = true;
          owner.resolve({ ...owner.context.owner, operation: 'generate', candidateId: candidate.id, candidate: snapshotImageItem(candidate) });
        });
        return;
      }
      currentTurnDone=true;
      if (currentTerminalOutcome!=='completed' || currentImageOutputError || !batchRun.candidate) {
        batchRun.reject(new Error(currentImageOutputError || '이미지 생성 완료를 확인하지 못했습니다.'));
      } else batchRun.resolve({...batchRun.context.owner,operation:'generate',candidateId:batchRun.candidate.id,candidate:snapshotImageItem(batchRun.candidate)});
      return;
    }
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
      const creatingFigure = currentTurnType === "image" && isCreationWorkflow(conversionKind);
      requestPhase(currentTerminalOutcome !== "failed" ? "cancelled" : creatingFigure && generatedImages.length ? "kept-previous" : "failed", { reason: failureReason(currentImageOutputError) });
      setTaskState(currentTerminalOutcome === "failed" ? "failed" : "idle");
      pendingCacheOutput = null;
      const cancelledReview = candidateReviewOnTerminal(currentReviewCandidate, currentTerminalOutcome);
      if (cancelledReview) dispatchReviewEvent(cancelledReview, currentReviewCandidate);
      setGenerating(false);
      setBusy(false);
      currentTurnDone = true;
      const terminalView = aiTerminalStatusView(currentTerminalOutcome, { imageReceived, creating: creatingFigure, reason: failureReason(currentImageOutputError) });
      if (terminalView) setStatus(terminalView.text, terminalView.kind);
      addTokenFooter(currentTurnUsage);
      void loadAccountOverview();
      return;
    }
    if (currentRunInput?.frozenLabelPlan && imageReceived && currentTurnCandidate) {
      if (currentReviewScheduled) return;
      currentReviewScheduled = true; pendingCacheOutput = null; currentReviewCandidate = currentTurnCandidate;
      currentTurnDone = false;
      void beginSourceLabelReview(currentReviewCandidate, eventEpoch);
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
          model: currentRunInput.model,
          effort: currentRunInput.effort,
          serviceTier: currentRunInput.serviceTier,
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
      setStatus("결과를 확인하는 중…", "busy");
      setGenerating(true, "결과를 확인하고 있습니다", "선택한 이미지와 요청 내용을 비교합니다.", "analyze");
      addLog("첫 결과를 확인한 뒤 필요한 부분을 한 번 더 수정합니다.");
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
      setStatus("복잡 변환 완료 · 직접 확인 필요", "warn");
      addLog("복잡 변환을 마쳤습니다. 원본과 비교한 뒤 사용해 주세요.");
    }
    setBusy(false);
    currentTurnDone = true;
    void commitCurrentOutput();
    addTokenFooter(currentTurnUsage);
    void loadAccountOverview();
  };

  const dispatchAiEvent = (event, eventEpoch = currentRequestEpoch) => {
    if (eventEpoch !== currentRequestEpoch) return;
    if (requestToken && !requestStates.live(requestToken) && ['progress', 'image', 'assistant', 'error', 'done', 'finalization'].includes(event.kind)) return;
    if (currentCancelRequested && (event.kind === "progress" || event.kind === "image")) return;
    if (event.kind === "progress") {
      requestPhase("generating");
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
      requestPhase("validating");
      const previewStartedAt = performance.now();
      if (currentRunInput?.approvedFirstPng) currentTurnPerformance = { ...currentTurnPerformance, aiResponseMs: previewStartedAt - currentTurnPerformance.aiRequestStartedAt, outputCompositionMs: 0 };
      const imageTurnId = event.turnId || currentTurnId;
      imageReceived = true;
      previewPending = true;
      advanceGenerationClock("image-received", undefined, imageTurnId);
      advanceGenerationClock("postprocess-started", undefined, imageTurnId);
      const isCurrent = () => !currentCancelRequested && eventEpoch === currentRequestEpoch
        && (!imageTurnId || imageTurnId === currentTurnId);
      setGenerating(true, "생성 결과를 준비하고 있습니다", isExamBrief(currentRunInput) || isWhitePngWorkflow(currentRunInput || {}) ? "생성 원본 PNG를 확인하고 화면에 등록합니다." : "배경을 정리하고 편집용 이미지를 준비합니다.");
      void addPreview(event.src, { isCurrent, rendererPrompt: event.rendererPrompt, labelPlan: pendingEditableLabelPlan }).then(async (added) => {
        if (!added || !isCurrent()) return;
        if (batchRun) return;
        currentTurnCandidate = added;
        if (pendingEditableLabelPlan) attachEditableLabelPlan(added, pendingEditableLabelPlan);
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
          stageCurrentOutput({ data: added.data, labelPlan: added.labelPlan || null });
        }
        if (!terminalAllowsSuccess || currentCancelRequested) return;
        window.dispatchEvent(new CustomEvent("5e:ai-output-success", { detail: { candidateId: added.id } }));
        if (isWhitePngWorkflow(currentRunInput || {})) {
          setStatus(currentRunInput?.approvedFirstPng ? "PNG 준비 완료 · 서버 종료 확인 중" : "첫 결과 준비 완료 · 결과 확인 대기", "busy");
          addLog(currentRunInput?.approvedFirstPng ? "첫 PNG 원본을 보존했습니다. 직접 확인할 수 있습니다." : "흰 배경 PNG 결과가 준비되었습니다. 원본과 비교해 확인합니다.");
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
      if (currentTurnType === 'image' && isExamBrief(currentRunInput)) return;
      if (currentRunInput?.frozenLabelPlan && currentTurnType === 'image') return;
      if (currentTurnType === "image" && currentEngine === IMAGE_ENGINE_IDS.FAST_SCENE) {
        currentSceneResponse = String(event.text || "").trim();
      } else if (currentTurnType === "image" && currentEngine === IMAGE_ENGINE_IDS.RASTER) {
        if (pendingEditableLabelPlan && !String(event.text || "").includes("<5e-editable-labels>")) return;
        const plan = parseEditableImageLabelPlan(event.text, labelEvidenceForRun(currentRunInput, currentRequestSnapshot?.renderRequest || ""));
        pendingEditableLabelPlan = plan;
        if (currentTurnCandidate) attachEditableLabelPlan(currentTurnCandidate, plan);
        if (plan.labels.length) {
          addLog(`편집 가능한 자동 라벨 ${plan.labels.length}개를 준비했습니다.${currentRunInput?.preserveSourceLabels ? " 원본에서 옮긴 내용과 위치를 확인해 주세요." : plan.reviewRequired ? " 제외되거나 불확실한 항목이 있어 위치와 내용을 확인해 주세요." : ""}`);
        } else if (plan.status === "empty") {
          addLog("확인된 입력에 문자 그대로 있는 라벨이 없어 이미지만 준비했습니다.");
        } else if (currentRunInput?.preserveSourceLabels) {
          addLog("옮길 원본 라벨을 확인하지 못했습니다. 이미지를 살펴보고 필요한 라벨을 직접 추가해 주세요.", "warn");
        } else {
          addLog("자동 라벨 계획을 확인하지 못했습니다. 의미를 추측하지 않고 이미지만 준비했으니 필요한 라벨은 직접 추가해 주세요.", "error");
        }
      } else {
        addLog(event.text);
        if (currentTurnType === "chat") recordConversationMessage("assistant", event.text);
        // CHATFIX(시안 태그 4): 생성 탭에서 AI가 그릴 구성을 정리하면 그 답 아래 「이대로 그리기」(누르면 바로 그림).
        if (currentTurnType === "chat" && isFigureCreate() && looksLikeDrawSummary(event.text)) {
          addFlowChips([{ id: 'draw-now', label: '이대로 그리기', strong: true, title: '지금까지 대화를 모아 바로 그립니다 · 「이미지 생성」과 같음' }]);
        }
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
        if (currentTurnType === "image" && !isExamBrief(currentRunInput) && currentEngine === IMAGE_ENGINE_IDS.RASTER && imageReceived && !pendingEditableLabelPlan) {
          pendingEditableLabelPlan = parseEditableImageLabelPlan("", labelEvidenceForRun(currentRunInput, currentRequestSnapshot?.renderRequest || ""));
          if (currentTurnCandidate) attachEditableLabelPlan(currentTurnCandidate, pendingEditableLabelPlan);
          addLog("자동 라벨 계획 응답이 없어 의미를 추측하지 않고 이미지만 준비했습니다.", "error");
        }
        serverTurnFinished = true;
        currentTurnDone = true;
        const terminalView = aiTerminalStatusView(currentTerminalOutcome, { imageReceived, creating: currentTurnType === "image" && isCreationWorkflow(conversionKind) });
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
      if (currentTurnType === "image" && !isExamBrief(currentRunInput) && currentEngine === IMAGE_ENGINE_IDS.RASTER && imageReceived && !pendingEditableLabelPlan) {
        pendingEditableLabelPlan = parseEditableImageLabelPlan("", labelEvidenceForRun(currentRunInput, currentRequestSnapshot?.renderRequest || ""));
        if (currentTurnCandidate) attachEditableLabelPlan(currentTurnCandidate, pendingEditableLabelPlan);
        addLog("자동 라벨 계획 응답이 없어 의미를 추측하지 않고 이미지만 준비했습니다.", "error");
      }
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
      const creatingFigure = currentTurnType === "image" && isCreationWorkflow(conversionKind);
      if (event.status === "failed") {
        pendingCacheOutput = null;
        if (event.error) addLog(String(event.error), "error");
        setStatus(creatingFigure ? generationFailedText(failureReason(event.error)) : "작업 실패", "error");
      } else if (event.status === "interrupted") {
        if (currentCancelRequested) pendingCacheOutput = null;
        if (!previewPending) setGenerating(false);
        const stopped = creatingFigure ? GENERATION_STOPPED : "작업 취소됨";
        setStatus(currentCancelRequested
          ? stopped
          : imageReceived && currentTurnType === "image"
            ? (previewPending ? "생성 결과 정리 중" : "생성 완료")
            : stopped, currentCancelRequested || !imageReceived ? "warn" : "ok");
      } else if (imageReceived && currentTurnType === "image") {
        if (!previewPending) setGenerating(false);
        setStatus(previewPending ? "생성 결과 정리 중" : "생성 완료", previewPending ? "busy" : "ok");
      } else if (!imageReceived) {
        setStatus(currentTurnType === "chat" ? "답변 완료" : "이미지 생성 실패 · 결과 없음", currentTurnType === "chat" ? "ok" : "error");
      }
      finishCurrentTurnUi(eventEpoch);
    }
  };

  disposalCallbacks.push(desktop?.onEvent((message) => {
    if (graphSubmitting || graphWorkflow.isActive()) return;
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
    for (const controller of sourceLabelControllers) if (controller.handleEvent(event)) return;
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
  }));
  disposalCallbacks.push(desktop?.onState((current) => {
    if (graphSubmitting || graphWorkflow.isActive()) return;
    // A scoped completed-image recovery emits stopped before recovered. Keep
    // the review owner alive until that terminal signal, never for a user stop.
    if (current.state !== "running" && scopedTransport) scopedTransport.fail(new Error("AI 연결이 종료되었습니다."));
    if (current.state === "stopped" && imageReview?.isRecoveringImageTurn()) return;
    if (current.state === "running" && !busy) setStatus("준비됨", "ok");
    else if (current.state !== "running" && busy) {
      structureAnalysis.fail("AI 연결 종료로 구조 분석이 중단되었습니다.");
      abortSourceComposites();
      for (const controller of sourceLabelControllers) controller.fail('AI 연결 종료로 라벨 관찰·검수가 중단되었습니다.');
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
  }));
  panel.querySelector("[data-ai-close]").addEventListener("click", close);
  panel.addEventListener("mousedown", (event) => { if (event.target === panel) close(); });
  // 11-14 5E 클립보드: 「클립보드에서」는 5E 클립보드를 고르기 모드로 연다(밖에서 캡처한 그림도 거기 맨 위에 있음). 고른 그림들이 원본이 된다.
  const pickFromClipboard = async () => {
    if (disposed || busy || preflightRun || panel.dataset.aiSharingMode === 'view') return;
    const clip = window.fiveEClipboard;
    if (!clip?.pick) { void pasteClipboardImage(); return; }
    const picked = await clip.pick({ kinds: ['img', 'graph', 'obj'], multiple: true, label: '원본으로 쓰기' });
    if (!picked?.length || disposed) return;
    addReferencesAsTasks(picked.map(item => ({ data: item.src, name: item.name || '클립보드 그림', sourceKind: 'clipboard' })));
    setStatus(`클립보드에서 ${picked.length}개를 원본으로 가져왔습니다.`, 'ok');
  };
  const pasteClipboardImage = async (event = null) => {
    if (disposed || busy || preflightRun || panel.dataset.aiSharingMode === 'view') return;
    const owner = captureSourceRead();
    try {
      const result = await readAiClipboardImage(event, {readNative: desktop?.readClipboardImage});
      if (!sourceReadCurrent(owner)) return;
      if (!result.blob && !result.dataUrl) {
        setStatus('클립보드에서 이미지 형식을 찾지 못했습니다.', 'warn');
        return;
      }
      const data = result.dataUrl || await blobToDataUrl(result.blob);
      if (!sourceReadCurrent(owner)) return;
      addReferencesAsTasks([{ data, name: result.blob?.name || "클립보드 이미지", sourceKind: "clipboard" }]);
      setStatus("붙여넣은 이미지의 작업이 준비되었습니다.", "ok");
    } catch (error) {
      if (sourceReadCurrent(owner)) setStatus(`클립보드 이미지를 읽지 못했습니다: ${error.message}`, 'error', error);
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
  }, { capture: true, signal: lifecycle.signal });
  // 11-14 5E 클립보드: 클립보드 항목(application/x-5e-drawer)을 끌어 놓아도 원본이 된다. 「넣기」도 AI 창이 열려 있으면 원본으로(window.fiveEAiAddSource).
  const isClipDrag = event => [...(event.dataTransfer?.types || [])].includes('application/x-5e-drawer');
  window.fiveEAiAddSource = item => {
    if (disposed || busy || preflightRun || panel.dataset.aiSharingMode === 'view') throw new Error('AI 작업이 끝난 뒤 다시 넣으세요.');
    if (!item?.src) throw new Error('넣을 그림이 없습니다.');
    addReferencesAsTasks([{ data: item.src, name: item.name || '클립보드 그림', sourceKind: 'clipboard' }]);
    setStatus('클립보드 그림을 원본으로 가져왔습니다.', 'ok');
  };
  panel.addEventListener("dragover", (event) => {
    if (isClipDrag(event) || Array.from(event.dataTransfer?.items || []).some((item) => item.kind === "file")) event.preventDefault();
  });
  panel.addEventListener('dragstart', event => {
    if (event.target.closest?.('.ai-preview-stage')) event.preventDefault();
  });
  panel.addEventListener("drop", (event) => {
    if (isClipDrag(event) && !event.dataTransfer.files?.length) {
      event.preventDefault();
      const id = event.dataTransfer.getData('application/x-5e-drawer');
      void import('./drawer.js?v=1.7.0-four-session-integration').then(async m => { const item = await m.clipGet(id); window.fiveEAiAddSource(item); if (item?.moving) await m.clipConsume(item.id); })
        .catch(error => setStatus(error?.message || '클립보드 그림을 가져오지 못했습니다.', 'warn'));
      return;
    }
    const dropped = Array.from(event.dataTransfer?.files || []).filter((item) => item.type.startsWith("image/"));
    if (!dropped.length) return;
    event.preventDefault();
    void importSourceFiles(dropped, 'drop');
  });
  document.addEventListener("keydown", (event) => {
    if (panel.hidden || panel.querySelector("dialog[open]") || event.isComposing) return;
    if (isCloseActiveTaskShortcut(event) && activeTaskTabId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void deleteTask(activeTaskTabId);
      return;
    }
    if (event.key === 'Delete' && event.target?.closest?.('.ai-task-tab.is-on')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void deleteTask(event.target.closest('.ai-task-tab')?.dataset.tabId);
      return;
    }
    if (event.key === "Escape") close();
  }, { signal: lifecycle.signal });
  disposalCallbacks.push(desktop?.onAiCloseTaskShortcut?.(() => {
    if (!panel.hidden && !panel.querySelector('dialog[open]') && activeTaskTabId) {
      void deleteTask(activeTaskTabId);
    }
  }));
  modal?.addEventListener("mousedown", (event) => event.stopPropagation());
  commentController=createImageCommentController({panel,getImages:()=>[...attachments.filter(isInputReference),...generatedImages],getSelectedId:()=>selectedCandidateId||generatedImages.at(-1)?.id,isBusy:()=>busy,selectedTaskCount,selectedTaskBlocked,isTextCreation:()=>isExamBrief(taskTabs.get(activeTaskTabId)),areaOnlyForSelected:true,changed:()=>{scopedSelectionRevision += 1;captureActiveTaskTab();persistTasks();},viewChanged:()=>{captureActiveTaskTab();persistTasks();}});
  input.addEventListener('input', () => commentController.refreshControls(), { signal: lifecycle.signal });
  localEraseController = createLocalImageEraseController({ panel, getTarget: () => isGraphWorkflow(conversionKind) ? null : selectedOutputItem(),
    isBusy: () => busy || isLocalSavePending(selectedOutputItem()),
    isSaving: () => isLocalSavePending(selectedOutputItem()), resolveSource: item => resolveOutputVariant(item), status: setStatus,
    previewChanged: async item => {
      await renderLabelPreview(item);
      try { await item.outputImage?.decode(); } catch {}
      syncSelectedOutputActions();
    },
    commit: async (parent, erased, isCurrent) => {
      if (!isCurrent()) return;
      const ownerTaskId = activeTaskTabId, ownerTask = taskTabs.get(ownerTaskId), ownerImages = generatedImages;
      const view = panel.aiWorkbench?.getViewState?.();
      const now = new Date().toISOString();
      // A user-authored local version has its own contract. Never transfer a
      // provider pass, candidate digest, placement binding or RAW QA composite
      // to bytes that were not reviewed. The earlier version stays untouched.
      // Edit the unflattened bitmap; label geometry/text belongs to a separate
      // layer and remains reusable. The old QA pass does not verify new bytes.
      const plan = erased.labelPlan || localEditableLabelPlan(parent);
      const candidate = { id: `generated-${++imageSerial}`, kind: 'generated', name: `직접 수정본 ${generatedImages.length + 1}`,
        data: erased.data, postprocessOk: true, createdAt: now, updatedAt: now, engine: 'local-erase',
        sourceReferenceId: parent.sourceReferenceId, sourceReferenceName: parent.sourceReferenceName,
        markPolicy: structuredClone(parent.markPolicy || {}), generationMode: 'single', labelPlan: plan,
        reviewState: 'scoped-applied', reviewReport: scopedAppliedReviewReport(), comments: [], nextCommentNumber: 1,
        scopedEditHistory: erased.operations.map(operation => ({ ...operation,
          operation: `local-${operation.mode}-erase`, parentCandidateId: parent.id, createdAt: now,
          sourceFrame: { width: erased.width, height: erased.height },
          visualReview: 'not-performed', status: 'applied' })) };
      if (!isCurrent()) return;
      abortAutomaticSeparation('local-erase');
      let pendingVersions = pendingLocalSaves.get(ownerTaskId);
      if (!pendingVersions) pendingLocalSaves.set(ownerTaskId, pendingVersions = new Set());
      pendingVersions.add(parent.id); pendingVersions.add(candidate.id);
      generatedImages.push(candidate); latestGeneratedSrc = candidate.data;
      selectedCandidateId = candidate.id; panel.dataset.aiSelectedCandidateId = candidate.id;
      labelPreviewState(candidate).included = labelPreviewStates.get(parent)?.included !== false;
      previews.prepend(makeImageCard(candidate));
      syncWhitePngUi(); syncSelectedOutputActions();
      if (view) panel.aiWorkbench?.restoreViewState?.({ ...view, selectedCandidateId: candidate.id });
      panel.dispatchEvent(new CustomEvent('5e:ai-candidate-select', { detail: { candidateId: candidate.id, localErase: true } }));
      captureActiveTaskTab();
      setStatus('수정본 저장 중 · 저장이 끝나면 편집과 내보내기를 계속할 수 있습니다.', 'info');
      try { await taskPersistence.checkpoint(); }
      catch (error) {
        const index = ownerImages.indexOf(candidate);
        if (index >= 0) ownerImages.splice(index, 1);
        candidate.card?.remove(); labelPreviewStates.delete(candidate);
        if (taskTabs.get(ownerTaskId) === ownerTask) {
          ownerTask.generated = (ownerTask.generated || []).filter(item => item.id !== candidate.id);
          if (ownerTask.selectedCandidateId === candidate.id) ownerTask.selectedCandidateId = parent.id;
          if (ownerTask.workbenchViewState?.selectedCandidateId === candidate.id) ownerTask.workbenchViewState.selectedCandidateId = parent.id;
          if (ownerTask.labelPreviewIncluded) delete ownerTask.labelPreviewIncluded[candidate.id];
          const cached = taskViews.get(ownerTaskId);
          if (cached?.generatedImages === ownerImages) cached.outputSnapshot = ownerTask.generated;
        }
        if (activeTaskTabId === ownerTaskId && generatedImages === ownerImages) {
          latestGeneratedSrc = generatedImages.at(-1)?.data || null;
          if (selectedCandidateId === candidate.id) {
            selectedCandidateId = parent.id; panel.dataset.aiSelectedCandidateId = parent.id;
            panel.aiWorkbench?.restoreViewState?.({ ...panel.aiWorkbench?.getViewState?.(), selectedCandidateId: parent.id });
            panel.dispatchEvent(new CustomEvent('5e:ai-candidate-select', { detail: { candidateId: parent.id } }));
          }
          captureActiveTaskTab(); syncSelectedOutputActions();
        }
        // A task switch may have queued an autosave of the pending version.
        // Queue the corrected snapshot last so it cannot reappear on reload.
        try { await taskPersistence.checkpoint(); } catch {}
        throw new Error(`수정본을 저장하지 못했습니다. 임시 편집을 유지했습니다. ${error.message}`);
      }
      finally {
        pendingVersions.delete(parent.id); pendingVersions.delete(candidate.id);
        if (!pendingVersions.size) pendingLocalSaves.delete(ownerTaskId);
        if (!disposed) syncSelectedOutputActions();
      }
      if (activeTaskTabId === ownerTaskId && selectedCandidateId === candidate.id) setStatus('수정 저장 완료 · 새 수정본 하나로 보관했습니다. 라벨과 이전 버전은 유지됩니다.', 'ok');
      return candidate;
    } });
  inlineLabelEditor = createInlineLabelEditor({ panel, getTarget:selectedOutputItem,
    getPlan:item => localEraseController.getDraft(item)?.labelPlan || manualLabelPlan(item),
    isBusy:() => busy || isLocalSavePending(selectedOutputItem()), artboard:() => ({...state.get().artboard}),
    labelsVisible:item => labelPreviewState(item).included && hasPreviewLabels(item),
    apply:(item,plan) => localEraseController.editLabels(item,plan),
    displayChanged:item => item ? renderLabelPreview(item) : Promise.resolve(), status:setStatus,
    enableLabels:() => { const item = selectedOutputItem(); if (item) { labelPreviewState(item).included = true; syncLabelViewControls(); } },
    cancelTools:() => { localEraseController.cancel(); commentController.cancelTool(); } });
  panel.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false) return;
    const target = event.target;
    if (target.closest?.('button,a,input,textarea,select,label,summary,[role="button"],[role="switch"],[role="slider"],[role="menu"],dialog,[contenteditable]:not([contenteditable="false"]),[data-ai-local-erase-options],[data-ai-comment-popover],canvas,svg')) return;
    // Empty margins close the drawing tools. A gesture inside a rendered image
    // or a control still belongs to that editor, even with overlays above it.
    for (const image of panel.querySelectorAll('.ai-preview-stage > img, [data-ai-composite-preview] img')) {
      const rect = image.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && event.clientX >= rect.left && event.clientX <= rect.right
        && event.clientY >= rect.top && event.clientY <= rect.bottom) return;
    }
    localEraseController.cancel(); commentController.cancelTool();
  }, { capture: true, signal: lifecycle.signal });
  panel.addEventListener('click', event => {
    const saving = isLocalSavePending(selectedOutputItem());
    if (!saving && !localEraseController.getDraft(selectedOutputItem())) return;
    if (!event.target.closest?.('[data-ai-insert-selected], [data-ai-canvas-output], [data-ai-exam-send], [data-ai-save-selected], [data-ai-copy-selected], [data-ai-scoped-edit-selected], [data-ai-editable-groups], [data-ai-send], [data-ai-comments-apply]')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    setStatus(saving ? '수정본을 저장하고 있습니다. 저장 완료 후 다시 시도하세요.' : '편집한 그림을 사용하려면 먼저 수정 저장을 누르세요.', 'warn');
    panel.querySelector('[data-ai-edit-save]')?.focus();
  }, { capture: true, signal: lifecycle.signal });
  // 11-11: 독의 실행 단추가 곧 [data-ai-comments-apply]라면 실행을 두 번 걸지 않도록 따로 잇지 않는다.
  { const applyButton = panel.querySelector('[data-ai-comments-apply]'); if (applyButton && applyButton !== sendButton) applyButton.addEventListener('click', () => sendButton.onclick()); }
  // Selected-result actions stay in the fixed footer; per-card controls are hidden.
  const editableGroups = document.createElement('button');
  editableGroups.type = 'button';
  editableGroups.dataset.aiEditableGroups = '';
  editableGroups.textContent = '편집용 그룹 준비';
  editableGroups.addEventListener('click', async () => {
    const item = selectedOutputItem();
    if (busy || !item || item.sceneResult || selectedSeparationMode === AI_SEPARATION_MODES.OFF) return;
    const manual = separatedCandidateNextAction(item) === 'manual-regions' || !candidateUsesSeparatedAssets(item)
      && (selectedSeparationMode === AI_SEPARATION_MODES.MANUAL || item.automaticSeparationState === 'fallback');
    await openGroupsForItem(item, candidateUsesSeparatedAssets(item) && !manual, manual);
  });
  panel.querySelector('[data-ai-insert-selected]')?.before(editableGroups);
  const separatedRecovery = document.createElement('button');
  separatedRecovery.type = 'button'; separatedRecovery.dataset.aiSeparatedRecovery = '';
  separatedRecovery.textContent = '영역을 직접 지정해서 분리';
  separatedRecovery.hidden = true;
  separatedRecovery.addEventListener('click', () => {
    const item = selectedOutputItem();
    if (busy || !item || separatedCandidateNextAction(item) !== 'manual-regions') return;
    void openGroupsForItem(item, false, true);
  });
  editableGroups.after(separatedRecovery);
  const selectedOutputNote = document.createElement('p');
  selectedOutputNote.className = 'ai-selected-output-note';
  selectedOutputNote.dataset.aiSelectedOutputNote = '';
  selectedOutputNote.setAttribute('role', 'status');
  selectedOutputNote.setAttribute('aria-live', 'polite');
  selectedOutputNote.hidden = true;
  panel.querySelector('.ai-output-actions')?.append(selectedOutputNote);
  const outputDetails = document.createElement('button');
  outputDetails.type='button';outputDetails.dataset.aiOutputDetails='';
  outputDetails.textContent='복원 상세';outputDetails.hidden=true;
  outputDetails.addEventListener('click',()=>void scopedDialog('그래프 복원 상세',selectedOutputNote.textContent,{accept:'닫기'}));
  panel.querySelector('.ai-output-actions')?.append(outputDetails);
  syncSelectedOutputActions();
  const outputActions = panel.querySelector('.ai-output-actions');
  const copySelected = document.createElement('button'); copySelected.type = 'button';
  copySelected.dataset.aiCopySelected = ''; copySelected.textContent = '이미지 복사'; copySelected.disabled = true;
  const hwpSelected = panel.querySelector('[data-ai-exam-send]') || document.createElement('button');
  hwpSelected.type = 'button'; hwpSelected.dataset.aiExamSend = '';
  hwpSelected.textContent = '한글로 보내기'; hwpSelected.className = '';
  hwpSelected.title = '현재 이미지와 라벨을 한글 문서의 조판 작업으로 보냅니다.';
  outputActions?.replaceChildren(panel.querySelector('[data-ai-save-selected]'),copySelected,
    panel.querySelector('[data-ai-insert-selected]'),hwpSelected);
  const moreOutputs = document.createElement('details'); moreOutputs.className = 'ai-output-more';
  moreOutputs.innerHTML = '<summary>결과 다듬기</summary>';// 11-14(시안 review-1114 2-5): 출력이 아니라 결과를 다듬는 도구들
  moreOutputs.append(editableGroups,separatedRecovery,outputDetails,selectedOutputNote);
  outputActions?.after(moreOutputs);
  syncSelectedOutputActions();

  function prepareVisibleOutput(item) {
    const taskId = activeTaskTabId, data = item.data, planKey = JSON.stringify(item.labelPlan);
    const included = labelPreviewState(item).included !== false;
    const outputKey = imageOutputOptionsKey(selectedImageOutputOptions), epoch = localVisibilityEpoch;
    const artboard = {...state.get().artboard};
    const current = () => !disposed && !busy && selectedOutputItem() === item && item.data === data
      && JSON.stringify(item.labelPlan) === planKey && activeTaskTabId === taskId && localVisibilityEpoch === epoch
      && included === (labelPreviewState(item).included !== false) && !localEraseController.getDraft(item)
      && outputKey === imageOutputOptionsKey(selectedImageOutputOptions)
      && state.get().artboard.w === artboard.w && state.get().artboard.h === artboard.h;
    return { isCurrent:current, png:(async () => {
      const bitmap = item.graphResult ? await workbenchGraphDataUrl(item.graphResult) : await resolveOutputVariant(item);
      if (!current()) throw new Error('출력 중 작업이나 수정본이 바뀌었습니다. 다시 출력하세요.');
      return visibleImagePng({data:bitmap,plan:included && hasPreviewLabels(item) ? manualLabelPlan(item) : null,artboard,isCurrent:current});
    })() };
  }
  panel.querySelector('[data-ai-save-selected]')?.addEventListener('click', () => {
    const item = selectedOutputItem(); if (busy || !item) return;
    // Reuse the candidate's operation lock and ownership checks. A late decode
    // must never write into another task's status or download an obsolete PNG.
    item.card?.querySelector('[data-ai-save-candidate]')?.click();
  });
  copySelected.addEventListener('click', () => {
    const item = selectedOutputItem(); if (busy || !item || copySelected.dataset.copyPending === 'true') return;
    if (!navigator.clipboard?.write || typeof ClipboardItem !== 'function') {
      setStatus('이 브라우저에서는 이미지 복사를 지원하지 않습니다. PNG 저장을 사용하세요.','warn'); return;
    }
    copySelected.disabled = true;
    copySelected.dataset.copyPending = 'true';
    // Safari requires clipboard.write during the original click. The promised
    // Blob keeps that user gesture while fonts and the PNG are prepared.
    const output = prepareVisibleOutput(item);
    const blob = output.png.then(data => fetch(data)).then(response => response.blob()).then(value => {
      if (!output.isCurrent()) throw new Error('복사 중 작업이나 수정본이 바뀌었습니다. 다시 복사하세요.');
      return value;
    });
    blob.catch(() => {});
    void (async () => {
      try {
        await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
        if (output.isCurrent()) setStatus('현재 보이는 이미지와 라벨을 복사했습니다 · 5E 클립보드에도 넣었습니다.','ok');
        // 11-14 5E 클립보드: AI 결과 복사 = 클립보드에 넣기. 맥 클립보드에 쓴 같은 그림을 「밖에서」로 다시 넣지 않게 서명을 기억한다.
        void (async () => { const data = await output.png; const [{ clipAdd }, view] = await Promise.all([import('./drawer.js?v=1.7.0-four-session-integration'), import('./clipboard-view.js?v=1.7.0-four-session-integration')]);
          // 11-14 지적 22: 그래프 결과는 그래프 객체도 같이 넣는다 — 캔버스에 꺼내면 그림이 아니라 고칠 수 있는 그래프로 나온다(그림은 미리보기용).
          const objects = item.graphResult?.objects?.length ? structuredClone(item.graphResult.objects) : null;
          await clipAdd({ src: data, name: item.name || 'AI 결과', source: '5E_image', kind: objects || String(conversionKind).startsWith('graph') ? 'graph' : 'img', ...(objects ? { objects } : {}) });
          const info = await window.fiveEDesktop?.readClipboardImageInfo?.().catch(() => null); view.markOSClipboardOwn(info?.sig); })().catch(() => {});
      } catch (error) {
        if (output.isCurrent()) setStatus(`이미지 복사 실패: ${error.message} PNG 저장을 사용할 수 있습니다.`,'error');
      } finally {
        delete copySelected.dataset.copyPending;
        if (!disposed) syncSelectedOutputActions();
      }
    })();
  });
  const exportCount = (mode,kind = null) => {
    captureActiveTaskTab();
    return taskExportSelection([...taskTabs.values()].filter(tab=>!kind || tab.conversionKind===kind), mode).length;
  };
  const exportResults = async (mode,kind = null) => {
    captureActiveTaskTab();
    const selected = taskExportSelection([...taskTabs.values()].filter(tab=>!kind || tab.conversionKind===kind), mode);
    return Promise.all(selected.map(async record => {
      const owner = batchOwner(record.taskId);
      const originalData = record.item.data, capturedItem = structuredClone(record.item);
      const currentItem = () => {
        const tab = taskTabs.get(record.taskId);
        if (disposed || !tab || !sameBatchOwner(owner, batchOwner(record.taskId))) {
          throw new Error('저장할 작업의 소유자가 변경되었습니다. 다시 저장해 주세요.');
        }
        if (tab.workState === 'busy' || (record.taskId === activeTaskTabId && (busy || preflightRun))) {
          throw new Error('저장할 작업이 실행 중입니다. 완료 후 다시 저장해 주세요.');
        }
        // Match restoreTaskTab's retained-view authority, including inactive tasks.
        const view = taskViews.get(record.taskId);
        const retained = view && view.sourceSnapshot === tab.attachments && view.outputSnapshot === tab.generated
          && view.attachments.length === (tab.attachments || []).length
          && view.generatedImages.length === (tab.generated || []).length;
        const items = record.taskId === activeTaskTabId ? generatedImages
          : retained ? view.generatedImages : tab.generated;
        const current = items?.find(item => item.id === record.candidateId);
        if (!current || current.data !== originalData) {
          throw new Error('저장할 결과가 변경되었습니다. 다시 저장해 주세요.');
        }
        return current;
      };
      let processed;
      try {
        processed = await resolveImageOutput(
          currentItem(), normalizeImageOutputOptions(record.outputOptions), transparentizeGeneratedImage,
        );
      } catch (error) {
        const current = currentItem();
        if (!requiresRawImageOutput(current)) throw error;
        processed = current.data;
      }
      // Ephemeral writer callback: never serialize it or change the captured item.
      const currentDataUrl = () => {
        const current = currentItem();
        return requiresRawImageOutput(current) ? current.data : processed;
      };
      return { ...record, item: capturedItem, dataUrl: currentDataUrl(), currentDataUrl };
    }));
  };
  panel.querySelector('[data-ai-insert-selected]')?.addEventListener('click', () => {
    if (!busy) selectedOutputItem()?.card?.querySelector('.ai-canvas-output')?.click();
  });
  // 11-11: 그래프 결과도 편집기를 거치지 않고 바로 캔버스에 넣는 단추(사용자 「그래프에 캔버스로 내보내기가 없다」).
  const graphCanvasButton = (panel.ownerDocument || globalThis.document)?.createElement?.('button') || { dataset: {}, addEventListener() {}, set hidden(v) {}, set disabled(v) {} };
  graphCanvasButton.type = 'button'; graphCanvasButton.dataset.aiGraphCanvas = ''; graphCanvasButton.textContent = '캔버스에 넣기';
  graphCanvasButton.title = '그래프를 편집 가능한 그래프 객체로 캔버스에 바로 넣습니다.';
  try { panel.querySelector('[data-ai-insert-selected]')?.after?.(graphCanvasButton); } catch {}
  const syncGraphCanvasButton = () => { const item = selectedOutputItem(); graphCanvasButton.hidden = !isGraphWorkflow(conversionKind); graphCanvasButton.disabled = busy || !item?.graphResult; };
  if (typeof MutationObserver === 'function' && panel.nodeType === 1) {
    new MutationObserver(syncGraphCanvasButton).observe(panel, { attributes: true, attributeFilter: ['data-ai-workflow', 'data-ai-stage'], subtree: false });
    const insertButton = panel.querySelector('[data-ai-insert-selected]'); if (insertButton?.nodeType === 1) new MutationObserver(syncGraphCanvasButton).observe(insertButton, { attributes: true, attributeFilter: ['disabled'] });
  }
  graphCanvasButton.addEventListener('click', () => {
    const output = selectedOutputItem()?.card?.querySelector('.ai-canvas-output');
    if (busy || !output) return;
    forceGraphCanvas = true; try { output.click(); } finally { forceGraphCanvas = false; }
  });
  try { syncGraphCanvasButton(); } catch {}
  // 11-11: 라이브러리에서 그래프로 바로 보낼 때처럼 다른 길로 작업 종류가 바뀌어도 제목(AI 이미지/AI 그래프)을 늘 다시 맞춘다.
  if (typeof MutationObserver === 'function' && panel?.nodeType === 1) new MutationObserver(() => { try { syncSurfaceTitle(); } catch {} }).observe(panel, { attributes: true, attributeFilter: ['data-ai-workflow', 'hidden'] });
  panel.querySelector('[data-ai-exam-send]')?.addEventListener('click', () => {
    const item = selectedOutputItem();
    if (busy || !item) return;
    const target = hwpInPlaceTargets.get(activeTaskTabId);
    if (target) {
      // 한글 그림 편집 창에서 연 작업: 5E_image를 거치지 않고 그 그림 자리로 바로 바꿔 넣는다.
      // 11-07 사용자 「한글 라벨 복원부터 글씨체·크기가 엉망」: 예전엔 그림 한 장만 보내 5E 라벨(한글·영어·수식 글꼴, 3.7mm)이 빠졌다.
      // 「캔버스에 삽입」과 같이 라벨 계획을 함께 보내 한글 쪽에서 그림 + 편집 가능한 5E 라벨로 넣는다.
      const detail = { target, name: item.name || 'AI 결과', ...(item.graphResult ? { graph: structuredClone(item.graphResult) } : { image: { data: item.data, width: item.width, height: item.height },
        ...(item.labelPlan?.labels?.length ? { labelPlan: structuredClone(item.labelPlan), aiTaskId: activeTaskTabId, aiCandidateId: item.id } : {}) }) };
      if (!detail.graph && !String(detail.image.data || '').startsWith('data:image/')) { setStatus('넣을 결과 그림을 찾지 못했습니다.', 'error'); return; }
      // 11-11: 넣은 뒤에도 연결을 남긴다 — 다른 버전을 다시 넣거나 이어 고칠 수 있게.
      close();
      window.dispatchEvent(new CustomEvent('5e:hwp-inplace-ai', { detail }));
      return;
    }
    window.dispatchEvent(new CustomEvent('5e:exam-send-ai', {detail:{scope:clientScope || '',taskId:activeTaskTabId}}));
  });
  const reviewDraftButton = document.createElement('button');
  reviewDraftButton.type = 'button';
  reviewDraftButton.dataset.aiEditReviewDraft = '';
  reviewDraftButton.textContent = '캔버스에서 편집';
  reviewDraftButton.title = '검수 미통과 표시를 유지하고 그림과 라벨을 새 객체로 넣습니다. 라벨을 클릭해 글자를 수정하거나 드래그해 이동할 수 있습니다.';
  reviewDraftButton.hidden = true;
  reviewDraftButton.tabIndex = -1;
  moreOutputs.append(reviewDraftButton);
  const verifyLabelDraftButton = document.createElement('button');
  verifyLabelDraftButton.type = 'button';
  verifyLabelDraftButton.className = reviewDraftButton.className;
  verifyLabelDraftButton.dataset.aiVerifyLabelDraft = '';
  verifyLabelDraftButton.textContent = '추가 라벨 검수';
  verifyLabelDraftButton.title = '저장된 생성 후보와 원본을 Luna medium으로 검수합니다. 그림을 다시 생성하지 않으며 캔버스에서 수정한 사본은 변경하지 않습니다.';
  verifyLabelDraftButton.hidden = true;
  panel.querySelector('[data-ai-review-content]')?.append(verifyLabelDraftButton);
  verifyLabelDraftButton.addEventListener('click', async () => {
    const candidate = generatedImages.find(item => item.id === selectedCandidateId) || generatedImages.at(-1);
    if (busy || candidate?.imageLabelWorkflow?.imageKind !== 'general' || !candidate?.labelPlan?.frozen
      || !candidate?.sourceLabelPlan?.frozen || !candidate.reviewReport?.issues?.some(issue => issue.code === 'optional-review-not-run')) return;
    await submit('image', {
      verifyOnly: true,
      runInputSnapshot: {
        attachments: attachments.map(snapshotImageItem), generated: [snapshotImageItem(candidate)],
        mode: selectedMode, outputEngine: IMAGE_ENGINE_IDS.RASTER, qualityMode: selectedQualityMode,
        selectedCandidateId: candidate.id, markPolicy: normalizeMarkPolicy(candidate.markPolicy),
        preserveSourceLabels: true, preciseRestore: false, generationMode: 'single',
        imageLabelWorkflow: normalizeImageLabelWorkflow({ ...candidate.imageLabelWorkflow, verificationMode: 'full' }, { requireExplicit: true }),
        ...(modelsLoaded ? modelSelection() : savedModelPreference()),
      },
    });
  });
  reviewDraftButton.addEventListener('click', async () => {
    const item = selectedOutputItem();
    if (busy || !canEditLabelReviewDraft(item)) return;
    const taskId = activeTaskTabId, candidateId = item.id, data = item.data;
    const pageContext = state.capturePageContext?.();
    const visibilityEpoch = localVisibilityEpoch;
    const isCurrent = () => !disposed && motion.isOpen() && visibilityEpoch === localVisibilityEpoch && activeTaskTabId === taskId
      && selectedOutputItem() === item && item.id === candidateId && item.data === data
      && (!pageContext || state.isPageContextCurrent?.(pageContext) === true);
    insertingOutput = true;
    setBusy(true);
    setStatus('검토용 그림과 편집 라벨을 캔버스에 넣는 중…', 'busy');
    try {
      const id = await insertLabelReviewDraft({ candidate: item, taskId, isCurrent,
        insert: async (src, options) => (await materializeCandidate({...item,data:src,labelPlan:options.editableLabelPlan},
          {taskId,isCurrent:options.isCurrent})).imageId });
      const count = state.get().objects.filter(object => object.aiParentImageId === id).length;
      addLog(`검토용 그림과 편집 라벨 ${count}개를 캔버스에 넣었습니다. 검수 미통과 표시를 유지합니다.`);
      captureActiveTaskTab(); persistTasks();
      close({ integratedEdit: true });
    } catch (error) {
      setStatus(`검토용 삽입 실패: ${error.message}`, 'error');
      addLog(`검토용 삽입 실패: ${error.message}`, 'error');
    } finally {
      setBusy(false); insertingOutput = false; syncSelectedOutputActions();
    }
  });
  syncSelectedOutputActions();
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
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')void taskPersistence.flush();},{signal:lifecycle.signal});
  window.addEventListener('pagehide',()=>{void taskPersistence.flush();},{signal:lifecycle.signal});
  window.addEventListener('5e:shortcut-platform-change', syncTaskDeleteShortcutHints,{signal:lifecycle.signal});
  window.addEventListener('5e:shortcut-platform-change', syncSourceShortcutHints,{signal:lifecycle.signal});
  window.addEventListener('5e:view-mode-change', () => {
    syncLiteModeUi(); refreshOutputPreviews(); restartSelectedAutomaticSeparation('view-mode-changed');
  },{signal:lifecycle.signal});
  if (!taskTabs.size) createTaskTab();
  workspaceReady=(async()=>{try{const recovered=recoverTaskWorkspaceSnapshot(await taskStore?.get('workspace'),{dropInvalid:true});if(disposed)return;
  // 검사에 걸린 후보는 빼고 원본째 따로 보관한다(M43) — 예전에는 하나 때문에 전체 복원이 실패하고 빈 작업대가 덮어썼다.
  if(recovered?.droppedCandidates?.length){try{await taskStore.put({key:`workspace-dropped-${Date.now()}`,at:new Date().toISOString(),dropped:recovered.droppedCandidates});}catch{}
    addLog(`이전 이미지 작업 중 후보 ${recovered.droppedCandidates.length}개를 읽지 못해 빼고 열었습니다. 원본은 따로 보관했습니다.`);}if(Array.isArray(recovered?.tabs)){if(recovered.sharingMode)panel.dataset.aiSharingMode=recovered.sharingMode;taskTabs.clear();for(const tab of recovered.tabs)taskTabs.set(tab.id,tab);taskTabSerial=Math.max(taskTabSerial,Number(recovered.taskTabSerial)||0);imageSerial=Math.max(imageSerial,Number(recovered.imageSerial)||0);if(taskTabs.size)restoreTaskTab(recovered.activeTaskTabId);else{activeTaskTabId=null;renderTaskTabs();}persistTasks();}}catch(error){if(!disposed)addLog(`이전 이미지 작업 복원 실패: ${error.message}`,"error");}})();
  if (reviewModelSelect) {
    reviewModelSelect.replaceChildren(new Option(modelSelect.value, modelSelect.value));
    reviewModelSelect.value = modelSelect.value;
    reviewModelSelect.disabled = true;
  }
  if (reviewEffortSelect) {
    reviewEffortSelect.replaceChildren(new Option(effortSelect.value, effortSelect.value));
    reviewEffortSelect.value = effortSelect.value;
    reviewEffortSelect.disabled = true;
  }
  dispatchReviewEvent({ state: "idle", candidateId: null, report: emptyReviewReport(), generationCount: 0, reviewCount: 0, elapsedMs: 0 });
  syncMode();
  syncQualityMode();
  syncOutputEngine();
  syncLiteModeUi();
  syncReferenceSummary();
  syncSourceShortcutHints();
  compactSettings = initAISettingsPanel(panel, { signal: lifecycle.signal,
    canChoose: (key, value) => ['background','objects'].includes(key) ? outputChoiceAllowed(key, value) : true });
  disposalCallbacks.push(() => compactSettings.dispose());
  setBusy(false);
  refresh();

  const batchOwner = id => structuredClone(taskTabs.get(id)?.batchOwner || {scope:{sessionId:'5e',workspaceId:clientScope||'main'},taskId:id});
  const sameBatchOwner = (left,right) => left?.taskId===right?.taskId && left?.scope?.workspaceId===right?.scope?.workspaceId && left?.scope?.sessionId===right?.scope?.sessionId;
  function captureBatchTask(id) {
    if(id===activeTaskTabId)captureActiveTaskTab();
    const tab=taskTabs.get(id);if(!tab)throw new Error('작업을 찾을 수 없습니다.');
    // 11-22: 한꺼번에 변환 — 한 번도 열지 않은 작업은 원본을 넣을 때 해 둔 출처 자동 판단으로 채운다(지금 보는 작업과 같은 규칙).
    if ((tab.conversionKind || 'image') === 'image' && !['exam', 'general'].includes(tab.imageLabelWorkflow?.imageKind)) {
      const detected = (tab.attachments || []).find(item => item?.detectedSourceKind)?.detectedSourceKind;
      if (['exam', 'general'].includes(detected)) tab.imageLabelWorkflow = normalizeImageLabelWorkflow({ ...(tab.imageLabelWorkflow || {}), imageKind: detected,
        labelResult: tab.imageLabelWorkflow?.labelResult || labelResultSelect?.value || 'remove' });
    }
    if (isCreationWorkflow(tab.conversionKind)) throw new Error('설명으로 만드는 작업은 각 작업의 만들기 버튼으로 실행해 주세요.');
    const candidate=(tab.generated||[]).find(item=>item.id===tab.selectedCandidateId);
    const graph=isGraphWorkflow(tab.conversionKind);
    const source=graph ? tab.attachments?.find(isInputReference) : candidate || tab.attachments?.[0];
    const selection=graph ? GRAPH_WORKBENCH_SELECTION : defaultAIModelSelection(availableModels,{...tab,serviceTier:'priority'});
    const comments=structuredClone(candidate?.comments || []);
    const operation=!graph && !isExamBrief(tab) && candidate && !candidate.sceneResult?'scoped-edit':'generate';
    const options={
      ...selection, conversionKind:tab.conversionKind, examBriefProfile:tab.examBriefProfile, mode:tab.mode, outputEngine:tab.outputEngine, qualityMode:tab.qualityMode,
      generationMode:tab.generationMode, selectedCandidateId:tab.selectedCandidateId,
      preserveSourceLabels:tab.preserveSourceLabels === true,
      imageLabelWorkflow:structuredClone(tab.imageLabelWorkflow), preciseRestore:tab.preciseRestore === true,
      referenceComposition:structuredClone(tab.referenceComposition), markPolicy:structuredClone(tab.markPolicy),
      attachments:operation==='scoped-edit'?[]:(tab.attachments||[]).map(snapshotImageItem),
      generated:!graph && candidate?[snapshotImageItem(candidate)]:[],
      priorGraph:graph && candidate?.graphResult ? snapshotImageItem(candidate) : null,
    };
    return {...batchOwner(id),snapshot:{title:tab.title,dataUrl:source?.data,revisionId:source?.id,operation,model:selection.model,options,comments,candidate:candidate?snapshotImageItem(candidate):null,scopeEdit:operation==='scoped-edit'?{comments,promptMode:scopedPromptMode?.value || 'legacy'}:undefined,request:batchRequest(id,tab),discussion:compactConversation(tab.conversationMessages||[])}};
  }
  // 1.7.1: 11-11부터 실행 단추는 숨은 요청 칸을 「이 작업의 사용자 대화 + 대화 입력 칸」으로 덮어쓴 뒤 보낸다(syncRequestFromChat).
  // 일괄 실행도 같은 글을 써야 같은 작업이 같은 캐시 열쇠를 갖는다 — 숨은 칸에 남은 옛 요청(11-11 전 저장분)을 그대로 보내면
  // 앞에서 한 번 만든 결과를 다시 쓰지 못하고 요청이 한 번 더 나갔다. 대화 입력 칸은 하나라 지금 작업에만 붙인다.
  function batchRequest(id,tab){
    if(id===activeTaskTabId)return composeRequestFromChat();
    return (tab.conversationMessages||[]).filter(message=>message.role==='user').map(message=>message.text).filter(Boolean).join('\n');
  }
  function preflightBatch(entry) {
    const tab=taskTabs.get(entry.taskId),snapshot=entry.snapshot;
    if(snapshot.options?.model!==snapshot.model)return '저장된 모델 설정이 일치하지 않습니다.';
    const capturedSource=isGraphWorkflow(snapshot.options?.conversionKind)
      ? snapshot.options?.attachments?.find(isInputReference)
      : snapshot.options?.generated?.find(item=>item.id===snapshot.options.selectedCandidateId) || snapshot.options?.attachments?.[0];
    if(capturedSource?.id!==snapshot.revisionId || capturedSource?.data!==snapshot.dataUrl)return '저장된 원본 버전이 일치하지 않습니다.';
    if(snapshot.operation==='scoped-edit' && (snapshot.candidate?.id!==snapshot.revisionId || snapshot.candidate?.data!==snapshot.dataUrl || JSON.stringify(snapshot.scopeEdit?.comments)!==JSON.stringify(snapshot.comments)))return '저장된 선택 영역이 일치하지 않습니다.';
    if(!tab)return '작업을 찾을 수 없습니다.';
    if(panel.dataset.aiSharingMode==='view')return '읽기 전용 작업입니다.';
    if(tab.workState==='busy' || (entry.taskId===activeTaskTabId && (busy || preflightRun)))return '이미 실행 중인 작업입니다.';
    try { resolveAIModelSelection({...snapshot.options,model:snapshot.model},availableModels); }catch(error){return error.message;}
    const source=[...(tab.generated||[]),...(tab.attachments||[])].find(item=>item.id===snapshot.revisionId);
    if(!source || source.data!==snapshot.dataUrl)return '원본 버전이 변경되었거나 없습니다.';
    if(snapshot.operation==='scoped-edit') {
      if(!snapshot.candidate || snapshot.candidate.sceneResult)return '수정할 PNG를 선택하세요.';
      try { collectScopedAreaComments(snapshot.comments,snapshot.revisionId); } catch(error) { return error.message; }
    }
    if(!desktop?.send)return 'AI 연결을 사용할 수 없습니다.';
    if(snapshot.operation==='generate' && !isGraphWorkflow(snapshot.options?.conversionKind) && !isExamBrief(snapshot.options) && snapshot.options?.outputEngine !== AI_OUTPUT_ENGINES.ASSET) {
      if (!['exam', 'general'].includes(snapshot.options?.imageLabelWorkflow?.imageKind)) return `${tab.title || '작업'}: 출처(교과서/기출)를 골라 주세요 — 그 작업을 열면 출처 줄이 보입니다.`;
      try { normalizeImageLabelWorkflow(snapshot.options?.imageLabelWorkflow, { requireExplicit: true }); } catch(error) { return error.message; }
    }
    return null;
  }
  async function runWorkspaceBatch(context,emit) {
    if (!modelsLoaded) await loadModels();
    if(context.signal.aborted) return Promise.reject(new DOMException('작업이 취소되었습니다.', 'AbortError'));
    if(activeTaskTabId!==context.owner.taskId || batchRun || busy)return Promise.reject(new Error('작업 실행 컨트롤러가 준비되지 않았습니다.'));
    const committed=generatedImages.find(item=>item.workspaceBatch?.jobId===context.jobId);
    if(committed)return {...context.owner,operation:context.snapshot.operation,candidateId:committed.id,candidate:snapshotImageItem(committed),...committed.workspaceBatch};
    if (isGraphWorkflow(context.snapshot.options?.conversionKind)) {
      const run = { context, emit, reject: () => {} }; batchRun = run;
      try {
        const item = await runGraphRestore({ batchContext: context, runInputSnapshot: context.snapshot.options, requestOverride: context.snapshot.request, discussionContextOverride: context.snapshot.discussion });
        if (!item || context.signal.aborted || batchRun !== run) throw new DOMException('작업이 취소되었습니다.', 'AbortError');
        item.id = `workspace-${context.jobId}-${context.attempt}`;
        return { ...context.owner, operation: context.snapshot.operation, candidateId: item.id, candidate: snapshotImageItem(item) };
      } catch (error) {
        if (batchRun === run) { batchRun = null; setTaskState(context.signal.aborted ? 'idle' : 'failed'); }
        throw error;
      }
    }
    return new Promise((resolve,reject)=>{
      let settled=false;
      const run={context,emit,candidate:null,resolve:value=>{if(!settled){settled=true;resolve(value);}},reject:error=>{if(!settled){settled=true;reject(error);}}};
      batchRun=run;
      const snapshot=context.snapshot;
      const execute=snapshot.operation==='scoped-edit'
        ? startScopedEdit(generatedImages.find(item=>item.id===snapshot.revisionId),snapshot)
        : submit('image',{bypassCache:!snapshot.options?.imageLabelWorkflow?.explicit,runInputSnapshot:{...structuredClone(snapshot.options),workspaceBatchJobId:context.jobId},requestOverride:snapshot.request,discussionContextOverride:snapshot.discussion});
      void Promise.resolve(execute).then(()=>{if(!busy&&!settled)run.reject(new Error('요청을 시작하지 못했습니다.'));}).catch(run.reject);
    }).catch(async error=>{ const run=batchRun;
      if(context.signal.aborted && run?.interruption) await run.interruption.catch(()=>{});
      const cancelled = context.signal.aborted || error?.name === 'AbortError';
      if(batchRun?.context===context){batchRun=null;requestPhase(cancelled?'cancelled':'failed');setGenerating(false);setBusy(false);setTaskState(cancelled?'idle':'failed');const tab=taskTabs.get(context.owner.taskId);if(tab)tab.retryRequest=null;retryInterruptedButton.disabled=true;setStatus(cancelled?'선택 작업 취소 · 원본 유지':error.message,cancelled?'warn':'error');}throw error;
    });
  }
  async function commitBatch(context,result) {
    const existing=generatedImages.find(item=>item.workspaceBatch?.jobId===context.jobId);
    if(existing && !context.signal.aborted && sameBatchOwner(batchOwner(context.owner.taskId),context.owner)) {
      if (existing.graphResult) validateWorkbenchGraph(existing.graphResult);
      if (!await verifyImageLabelCandidateBytes(existing)) throw new Error('검수 미통과 RAW 결과는 완료된 결과로 적용할 수 없습니다.');
      if (context.signal.aborted || !sameBatchOwner(batchOwner(context.owner.taskId),context.owner) || !generatedImages.includes(existing)) throw new Error('후보 확인 중 작업이 변경되거나 취소되었습니다.');
      setTaskState('completed');await taskPersistence.checkpoint();
      dispatchReviewEvent({state:existing.reviewState,candidateId:existing.id,report:existing.reviewReport},existing);
      setStatus(existing.labelPlan?.reviewRequired ? '변환 완료 · 라벨 확인 필요' : '변환 완료 · 저장된 결과를 복원했습니다.',existing.labelPlan?.reviewRequired ? 'warn' : 'ok');
      return {...context.owner,committed:true,revisionId:existing.id};
    }
    if(!sameBatchOwner(batchOwner(context.owner.taskId),context.owner)||context.signal.aborted||batchRun?.context!==context)throw new Error('이전 작업 결과를 적용할 수 없습니다.');
    const source=[...attachments,...generatedImages].find(item=>item.id===context.snapshot.revisionId);
    if(!source||source.data!==context.snapshot.dataUrl)throw new Error('원본 버전이 변경되었습니다.');
    const item=structuredClone(result.candidate);
    if (!await verifyImageLabelCandidateBytes(item)) throw new Error('그림·스타일 검수 미통과 결과는 적용할 수 없습니다.');
    if (!sameBatchOwner(batchOwner(context.owner.taskId),context.owner) || context.signal.aborted || batchRun?.context !== context
      || ![...attachments,...generatedImages].some(candidate => candidate.id === context.snapshot.revisionId && candidate.data === context.snapshot.dataUrl)) throw new Error('후보 확인 중 원본 또는 작업이 변경되거나 취소되었습니다.');
    item.workspaceBatch={jobId:context.jobId,operation:context.snapshot.operation,scopeConfirmed:result.scopeConfirmed===true,approved:result.approved===true};
    item.reviewState=context.snapshot.operation==='scoped-edit'?'scoped-applied':item.imageLabelWorkflow?.explicit || item.labelPlan?.frozen ? item.reviewState : 'first-generated';
    if(!item||item.id!==result.candidateId||!item.data)throw new Error('결과 후보가 올바르지 않습니다.');
    if (item.graphResult) { validateWorkbenchGraph(item.graphResult); item.reviewState='needs-attention'; }
    const prior=selectedCandidateId;
    generatedImages.push(item);selectedCandidateId=item.id;
    captureActiveTaskTab();
    try { await taskPersistence.checkpoint(); }
    catch(error){generatedImages.splice(generatedImages.indexOf(item),1);selectedCandidateId=prior;captureActiveTaskTab();batchRun=null;setBusy(false);setTaskState('failed');throw error;}
    if(context.signal.aborted)throw new Error('결과 저장 중 작업이 취소되었습니다.');
    panel.dataset.aiSelectedCandidateId=item.id;latestGeneratedSrc=item.data;
    previews.querySelector('[data-ai-empty]')?.remove();previews.prepend(makeImageCard(item));
    dispatchReviewEvent({state:item.reviewState,candidateId:item.id,report:item.reviewReport},item);
    batchRun=null;setGenerating(false);setBusy(false);setTaskState('completed');requestPhase('completed');setStatus(item.labelPlan?.reviewRequired ? '변환 완료 · 라벨 확인 필요' : '변환 완료 · 원래 작업에 결과를 저장했습니다.',item.labelPlan?.reviewRequired ? 'warn' : 'ok');syncSelectedOutputActions();persistTasks();
    return {...context.owner,committed:true,revisionId:item.id};
  }
  async function interruptBatch(context) {
    if(batchRun?.context!==context)return;
    const run=batchRun;
    run.interruption=interruptCurrentTask();
    try { const receipt=await run.interruption;if(receipt?.ok!==true)throw new Error('AI 중단 확인을 받지 못했습니다.'); }
    finally {run.reject(new DOMException('작업이 취소되었습니다.', 'AbortError'));if(batchRun===run)batchRun=null;}
  }

  async function deleteTask(id) {
    const tab = taskTabs.get(id);
    if (!tab || panel.dataset.aiSharingMode === 'view') return;
    const running = () => tab.workState === 'busy' || (id === activeTaskTabId && (busy || preflightRun));
    // 먹통 고침(11-21): 지금 보고 있는 작업은 돌고 있어도 멈추고 지울 수 있게 한다(막다른 「취소된 뒤 삭제」 안내 대신).
    const stopFirst = running() && id === activeTaskTabId;
    if (running() && !stopFirst) { setStatus('변환이 끝나거나 취소된 뒤 삭제해 주세요.', 'warn'); return; }
    const message = stopFirst ? `‘${tab.title}’ 작업이 아직 진행 중입니다. 멈추고 삭제할까요? 원본 파일은 삭제하지 않습니다.` : `‘${tab.title}’ 작업을 삭제할까요? 원본 파일은 삭제하지 않습니다.`;
    if (!await scopedDialog('작업 삭제', message, {accept: stopFirst ? '멈추고 삭제' : '작업 삭제', defaultAccept: true})) return;
    if (taskTabs.get(id) !== tab) return;
    if (stopFirst && running()) await interruptCurrentTask();
    if (running()) { setStatus('작업을 멈추지 못해 삭제하지 않았습니다. 잠시 뒤 다시 눌러 주세요.', 'warn'); return; }
    captureActiveTaskTab();
    taskTabs.delete(id); taskViews.delete(id); taskRows.delete(id); requestStates.forget(id);
    if (!taskTabs.size) {
      restoreTaskTab(null); await taskPersistence.checkpoint(); workspaceEmpty(); return;
    }
    if (activeTaskTabId === id) restoreTaskTab(taskTabs.keys().next().value);
    else renderTaskTabs();
    await taskPersistence.checkpoint();
  }

  return {
    deleteTask,
    // 11-06 D5: 한글 그림 위 「끝 · 눌러서 보기」·알림 [결과 보기] — 그 작업 탭을 다시 연다.
    openHwpTask: taskId => taskTabs.has(taskId) ? open({ taskId }) : null,
    // 11-14 시안 review-1114b 2번: 문항 카드 칸 아래 「이 칸에 넣기」 — 그 작업을 열고 고른 결과를 그 칸으로 보낸다(보내면 창은 닫힌다).
    sendHwpTask: async taskId => { if (!taskTabs.has(taskId)) return false; await open({ taskId }); const send = panel.querySelector('[data-ai-exam-send]'); if (!send || send.disabled || send.hidden) return false; send.click(); return true; },
    hasHwpTask: taskId => hwpInPlaceTargets.has(taskId) && taskTabs.has(taskId),
    // 11-11: 다른 작업대로 보내거나 복제할 때 한글 그림 연결을 함께 넘긴다.
    hwpTargetOf: taskId => { const target = hwpInPlaceTargets.get(taskId); return target ? structuredClone(target) : null; },
    // 한글 그림 id로 그 그림의 작업을 찾는다(작업 id가 바뀌었거나 연결이 옮겨 갔을 때).
    hwpTaskForFigure: (figureId, kind = null) => [...taskTabs.values()].filter(tab => tab.hwpTarget?.figureId === figureId && (!kind || tab.hwpTarget.kind === kind)).at(-1)?.id || null,
    // 11-11: 이 작업대가 지금 AI를 돌리는 중인지(한글에서 다른 그림을 열면 바쁜 작업대 대신 새 작업대로).
    isBusy: () => Boolean(busy || preflightRun || graphSubmitting),
    taskVisibleImage: async id => {
      if (id === activeTaskTabId) captureActiveTaskTab();
      const owner = taskTabs.get(id);
      const selected = tab => tab?.generated?.find(item => item.id === tab.selectedCandidateId)
        || tab?.generated?.at(-1) || tab?.attachments?.[0];
      const item = selected(owner);
      if (!item) return null;
      const image = snapshotImageItem(item), planKey = JSON.stringify(image.labelPlan);
      const options = normalizeImageOutputOptions(owner.outputOptions);
      const optionsKey = imageOutputOptionsKey(options);
      const included = owner.labelPreviewIncluded?.[image.id] !== false;
      const artboard = { ...state.get().artboard };
      const raw = requiresRawImageOutput(image) || (id === activeTaskTabId
        && panel.dataset.aiBoxEdit === 'true' && !isHistoricalPngLocalResult(image));
      const current = () => {
        if (disposed || taskTabs.get(id) !== owner) return false;
        if (id === activeTaskTabId) captureActiveTaskTab();
        const latest = selected(owner);
        return latest?.id === image.id && latest.data === image.data
          && JSON.stringify(latest.labelPlan) === planKey
          && (owner.labelPreviewIncluded?.[image.id] !== false) === included
          && imageOutputOptionsKey(normalizeImageOutputOptions(owner.outputOptions)) === optionsKey
          && state.get().artboard.w === artboard.w && state.get().artboard.h === artboard.h;
      };
      let data = image.kind === 'generated' && !raw
        ? await resolveImageOutput(image, options, transparentizeGeneratedImage) : image.data;
      if (included && hasPreviewLabels(image)) {
        const composite = await createEditableLabelComposite({ plan: image.labelPlan,
          candidateDataUrl: data, artboard, signal: lifecycle.signal });
        data = composite.attachment.data;
      }
      if (!current()) throw new Error('보내는 동안 작업의 그림이나 표시 설정이 바뀌었습니다. 다시 보내 주세요.');
      return { ...image, data };
    },
    taskImage: id => {
      if (id === activeTaskTabId) captureActiveTaskTab();
      const tab = taskTabs.get(id);
      const image = tab?.generated?.find(item => item.id === tab.selectedCandidateId) || tab?.generated?.at(-1) || tab?.attachments?.[0];
      return image ? snapshotImageItem(image) : null;
    },
    workflowTask: kind => [...taskTabs.values()].reverse().find(tab => tab.conversionKind === kind)?.id || null,
    taskWorkflow: id => taskTabs.get(id)?.conversionKind || 'image',
    setEmptyWorkflow: (kind, { discardEmptyTask = false } = {}) => {
      if (busy || preflightRun || input.value.trim() || !AI_WORKFLOW_KINDS.includes(kind)
        || [...taskTabs.values()].some(tab=>tab.attachments?.length || tab.generated?.length || tab.conversationMessages?.length || tab.input?.trim())) return false;
      if (discardEmptyTask) {
        taskTabs.clear();taskViews.clear();taskRows.clear();restoreTaskTab(null);
      } else for (const tab of taskTabs.values()) {
        tab.conversionKind=kind;
        if(kind === 'image-create') tab.examBriefProfile=EXAM_BRIEF_PROFILE;
        else delete tab.examBriefProfile;
      }
      conversionKind = kind; if (isCreationWorkflow(kind) && !activeTaskTabId) createTaskTab({kind});
      syncLiteModeUi(); syncGraphWorkbenchUi(); renderTaskTabs(); persistTasks(); return true;
    },
    batchOwner, ownsBatchOwner: owner => taskTabs.has(owner.taskId)&&sameBatchOwner(batchOwner(owner.taskId),owner), captureBatchTask,
    // 여러 작업 실행 전 가벼운 확인: 원본(입력 그림)이 있는지. 글로 만드는 작업(시험지 그림 요청)은 원본이 필요 없다(I6, 10-25).
    taskHasSource: id => { const tab=taskTabs.get(id); return !!tab && (isExamBrief(tab) || (tab.attachments||[]).some(isInputReference) || (tab.generated||[]).length>0); },preflightBatch,runBatch:runWorkspaceBatch,commitBatch,interruptBatch,
    open, close, attachReference, clearTasks, ready: workspaceReady,
    acknowledgeViewedResult: () => acknowledgeVisibleResult(),
    // V5: 그림 생성 탭은 위 공용 단추 글(「이미지 생성」·꺼짐)이 그리기 단추를 덮지 않게 생성 화면 맞추기를 다시 건다.
    refreshTaskSelection: () => { commentController?.refreshControls(); if (panel.dataset.aiCreateUi === 'true') scheduleCreateSync(); },
    setWorkbenchVisible: (visible, { animate = true } = {}) => {
      // A cached, closed workspace is already settled. Hiding it again forces
      // computed-style/layout reads across every retained task on each switch.
      if (!visible && panel.hidden && panel.inert && !motion.isOpen()) return;
      if (visible) {
        showWorkbench();
        // Switching tasks keeps the open workbench's hit targets stationary.
        if (!animate) motion.finish();
      }
      else { localVisibilityEpoch += 1; motion.hide(); motion.finish(); }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      localVisibilityEpoch += 1;
      graphOwnerEpoch+=1;
      void graphWorkflow.cancel();
      motion.hide(); motion.finish(); motion.dispose();
      lifecycle.abort();
      localEraseController?.destroy();
      inlineLabelEditor?.destroy();
      imageLabelRunAbort?.abort();
      closeComparison(); closeCapture?.();
      abortAutomaticSeparation('workspace-disposed');
      structureAnalysis.cancel();
      abortSourceComposites();
    for (const controller of sourceLabelControllers) controller.cancel();
      if (imageReview?.isActive()) imageReview.cancel();
      if (generationTimingTimer) clearInterval(generationTimingTimer);
      generationTimingTimer = null;
      taskPersistence.dispose();
      clearTimeout(requestTimeout);
      taskViews.clear(); taskRows.clear();
      if (requestStates.live(requestToken)) requestStates.advance(requestToken, 'cancelled');
      for (const dispose of disposalCallbacks) if (typeof dispose === 'function') dispose();
      disposalCallbacks.length = 0;
      panel.hidden = true;
      delete panel.dataset.aiResultCount; delete panel.dataset.aiGraphResultCount;
      syncResultEntry();
    },
    snapshotTask: async id => {
      await workspaceReady;
      if (id === activeTaskTabId) throw new Error('실행 중인 작업 컨트롤러는 이동할 수 없습니다.');
      const tab = taskTabs.get(id);
      if (!tab) throw new Error('작업을 찾을 수 없습니다.');
      tab.batchOwner ||= {scope:{sessionId:'5e',workspaceId:clientScope||'main'},taskId:id};
      return structuredClone({ key: 'workspace', tabs: [tab], activeTaskTabId: id, taskTabSerial, imageSerial });
    },
    importTaskSnapshot: async (snapshot, mode) => {
      graphOwnerEpoch+=1;
      await workspaceReady;
      if (!taskStore) throw new Error('작업 저장소를 열지 못했습니다.');
      const recovered = recoverTaskWorkspaceSnapshot(snapshot);
      if (!recovered) throw new Error('수신 작업 정보가 올바르지 않습니다.');
      await taskPersistence.replace({ ...recovered, key: 'workspace', sharingMode: mode || null }, () => {
        taskTabs.clear(); taskViews.clear();
        for (const tab of recovered.tabs) taskTabs.set(tab.id, tab);
        taskTabSerial = recovered.taskTabSerial; imageSerial = recovered.imageSerial;
        if (mode) panel.dataset.aiSharingMode = mode; else delete panel.dataset.aiSharingMode;
        restoreTaskTab(recovered.activeTaskTabId);
      });
    },
    removeTransferredTask: async id => {
      if (id === activeTaskTabId) throw new Error('현재 작업은 이동할 수 없습니다.');
      const tab = taskTabs.get(id);
      taskTabs.delete(id);
      try { await taskPersistence.checkpoint(); }
      catch (error) { taskTabs.set(id, tab); throw error; }
      taskViews.delete(id); renderTaskTabs();
    },
    ownsTask: id => taskTabs.has(id), activeTask: () => activeTaskTabId,
    unlinkExamTask: link => {
      for (const tab of taskTabs.values()) if(tab.examLink?.tabId===link?.tabId && tab.examLink?.assetId===link?.assetId) delete tab.examLink;
      renderTaskTabs();persistTasks();
    },
    refreshExamLinks: () => renderTaskTabs(),
    examTaskLink: id => structuredClone(taskTabs.get(id)?.examLink || null),
    examTaskNames: () => [...taskTabs.values()].filter(tab => tab.examLink).map(tab => ({link:structuredClone(tab.examLink),name:tab.title})),
    renameExamTask: (link,name) => {
      const tab = [...taskTabs.values()].find(tab => tab.examLink?.tabId === link.tabId && tab.examLink.assetId === link.assetId);
      if (!tab || tab.title === name) return;
      tab.title = name; renderTaskTabs(); persistTasks();
    },
    examTaskSnapshot: async id => {
      await workspaceReady;
      if (id === activeTaskTabId) { if (busy || preflightRun) throw new Error('이미지 작업을 마친 뒤 시험지에 보내주세요.'); captureActiveTaskTab(); }
      const tab = taskTabs.get(id);
      if (!tab) throw new Error('연결된 AI 작업 탭을 찾지 못했습니다.');
      tab.examLink ||= {tabId:crypto.randomUUID(),assetId:crypto.randomUUID()};
      persistTasks();
      return structuredClone({key:'workspace',tabs:[tab],activeTaskTabId:id,taskTabSerial,imageSerial});
    },
    exportCount, exportResults,
    sharingSnapshot: async () => {
      await workspaceReady;
      captureActiveTaskTab();
      return structuredClone({key:'workspace',tabs:[...taskTabs.values()],activeTaskTabId,taskTabSerial,imageSerial});
    },
    importSharingSnapshot: async (snapshot, mode) => {
      graphOwnerEpoch+=1;
      await workspaceReady;
      const recovered = recoverTaskWorkspaceSnapshot(snapshot);
      if (!recovered || !taskStore) throw new Error('수신 문서 저장소를 열지 못했습니다.');
      await taskPersistence.replace({...recovered, key:'workspace', sharingMode:mode}, () => {
        if (mode) panel.dataset.aiSharingMode = mode; else delete panel.dataset.aiSharingMode;
        taskViews.clear();
        taskTabs.clear();
        for (const tab of recovered.tabs) taskTabs.set(tab.id,tab);
        taskTabSerial = recovered.taskTabSerial || 0;
        imageSerial = recovered.imageSerial || 0;
        if (taskTabs.size) restoreTaskTab(recovered.activeTaskTabId);
        else {activeTaskTabId=null;renderTaskTabs();}
      });
    },
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

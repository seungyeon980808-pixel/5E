import { BACKGROUND_POLICIES } from "./image-background-options.js?v=1.7.0-four-session-integration";

// Local processing never changes a bound label/scoped/graph result.
// Null fields are ordinary historical serialization; partial or false metadata
// still marks an unknown modern contract and must remain RAW.
const BOUND_FIELDS = ['examBriefProfile','imageLabelWorkflow','sourceLabelPlan','labelPlan','editableDraft',
  'targetPlacement','sourceSha256','candidateSha256','planSha256','sourceFrame',
  'candidateFrame','finalLabelComposite','labelVerificationPreview','workflowMetrics',
  'verifiedCandidateData','graphResult','nativeGraph','sceneResult'];
export function hasBoundImageOutput(item) {
  return BOUND_FIELDS.some(key => item?.[key] != null)
    || item?.reviewState === 'scoped-applied'
    || (item?.scopedEditHistory != null
      && (!Array.isArray(item.scopedEditHistory) || item.scopedEditHistory.length > 0));
}
export function isHistoricalPngLocalResult(item) {
  return item?.kind === 'generated' && typeof item.data === 'string'
    && item.data.startsWith('data:image/png;base64,') && !hasBoundImageOutput(item);
}
export function requiresRawImageOutput(item) {
  return hasBoundImageOutput(item)
    || (item?.kind === 'generated' && !isHistoricalPngLocalResult(item));
}
export function canChooseLocalOutput(item, key, value, {
  mode = 'pro', busy = false, readOnly = false, separationMode = 'off',
} = {}) {
  if (busy || readOnly || (item && !isHistoricalPngLocalResult(item))) return false;
  // A source without a result retains only the fixed labeler's safe choices.
  const advanced = Boolean(item) && mode === 'pro';
  if (key === 'background') return separationMode === 'off'
    && (advanced ? ['preserve','connected','all-near-white'] : ['preserve','connected']).includes(value);
  if (key === 'objects') return (advanced ? ['off','auto','grid','manual'] : ['off','auto']).includes(value);
  return false;
}

export const DEFAULT_IMAGE_OUTPUT_OPTIONS = Object.freeze({
  backgroundPolicy: "preserve",
  examPalette: false,
  lineThickness: 0,
});

export function normalizeImageOutputOptions(value = {}) {
  return {
    backgroundPolicy: BACKGROUND_POLICIES.has(value?.backgroundPolicy)
      ? value.backgroundPolicy
      : DEFAULT_IMAGE_OUTPUT_OPTIONS.backgroundPolicy,
    examPalette: value?.examPalette === true,
    lineThickness: [0, 1, 2].includes(Number(value?.lineThickness))
      ? Number(value.lineThickness)
      : DEFAULT_IMAGE_OUTPUT_OPTIONS.lineThickness,
  };
}

export function imageOutputOptionsKey(value) {
  const options = normalizeImageOutputOptions(value);
  return `${options.backgroundPolicy}:${options.examPalette ? "gray" : "color"}:line-${options.lineThickness}`;
}

export async function resolveImageOutput(item, value, transform) {
  if (!item?.data) throw new Error("처리할 이미지가 없습니다.");
  if (requiresRawImageOutput(item)) return item.data;
  const options = normalizeImageOutputOptions(value);
  if (options.backgroundPolicy === "preserve" && !options.examPalette && options.lineThickness === 0) return item.data;
  if (typeof transform !== "function") throw new Error("이미지 처리기를 사용할 수 없습니다.");
  try {
    const output = await transform(item.data, options);
    return requiresRawImageOutput(item) ? item.data : output;
  } catch (error) {
    // A scoped edit can bind this candidate while local decoding is pending.
    // Its RAW contract makes that obsolete local operation irrelevant.
    if (requiresRawImageOutput(item)) return item.data;
    throw error;
  }
}

import { normalizeMarkPolicy } from './ai-mark-policy.js?v=1.7.0-four-session-integration';
import { validateWorkbenchGraph } from './graph/workbench-validate.js?v=1.7.0-four-session-integration';
import { isExamBrief } from './ai-exam-brief.js?v=1.7.0-four-session-integration';

// Snapshotting retains data, never grants label/source verification authority.
export function validateCandidateSnapshot(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new TypeError('Invalid candidate snapshot');
  for (const key of ['sourceFrame', 'candidateFrame']) {
    const frame = item[key];
    if (frame != null && (!Number.isInteger(frame.width) || !Number.isInteger(frame.height)
      || frame.width <= 0 || frame.height <= 0 || frame.width * frame.height > 40000000)) throw new TypeError('Invalid candidate source/frame');
  }
  for (const key of ['sourceSha256', 'candidateSha256', 'planSha256']) {
    if (item[key] != null && !/^[a-f0-9]{64}$/.test(item[key])) throw new TypeError('Invalid candidate source hash');
  }
  if (item.source != null && (typeof item.source !== 'object' || Array.isArray(item.source))) throw new TypeError('Invalid candidate source');
  if (item.comments !== undefined && !Array.isArray(item.comments)) throw new TypeError('Invalid candidate comments');
  for (const key of ['labelPlan','imageLabelWorkflow','sourceLabelPlan','editableDraft','targetPlacement','workflowMetrics','graphResult','graphEdit']) {
    if (item[key] != null && (typeof item[key] !== 'object' || Array.isArray(item[key]))) throw new TypeError('Invalid candidate ' + key);
  }
  // Reuse native structure/source checks without recomputing quality or repairing data.
  if (item.graphResult != null) validateWorkbenchGraph(item.graphResult);
  if (item.targetPlacement?.candidateSha256 && item.candidateSha256 && item.targetPlacement.candidateSha256 !== item.candidateSha256) throw new TypeError('Candidate source binding mismatch');
  if (item.targetPlacement?.planSha256 && item.planSha256 && item.targetPlacement.planSha256 !== item.planSha256) {
    const report=item.removalReport,binding=report?.removalBinding,subset=item.labelPlan?.sourcePlan;
    const ids=report?.removedLabelIds;
    const sameIds=value=>Array.isArray(value)&&Array.isArray(ids)&&value.length===ids.length&&value.every((id,index)=>id===ids[index]);
    if(item.imageLabelWorkflow?.imageKind!=='exam'||report?.status!=='partial'||binding?.version!==1
      ||binding.sourceSha256!==item.sourceSha256||binding.planSha256!==item.planSha256||binding.candidateSha256!==item.candidateSha256
      ||!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length
      ||!sameIds(binding.removedLabelIds)||!sameIds(binding.restoredLabelIds)
      ||!sameIds(subset?.labels?.map(label=>label.id))||!sameIds(item.labelPlan?.labels?.map(label=>label.id))
      ||ids.some(id=>!item.sourceLabelPlan?.labels?.some(label=>label.id===id)||report.deferredLabels?.some(label=>label.labelId===id))
      ||JSON.stringify(subset?.removalBinding)!==JSON.stringify(binding)
      ||!/^[a-f0-9]{64}$/.test(report.restorationPlanSha256)
      ||item.targetPlacement.planSha256!==report.restorationPlanSha256) throw new TypeError('Candidate plan binding mismatch');
  }
}

export function snapshotImageItem(item) {
  validateCandidateSnapshot(item);
  return {
    id: item?.id || null,
    name: item?.name || "이미지",
    data: item?.data || null,
    kind: item?.kind || "reference",
    sourceKind: item?.sourceKind || "auto",
    source: item?.source === undefined ? null : structuredClone(item.source),
    // Keep the live PDF render receipt identity; persisted copies safely use OCR.
    ...(item?.sourceTextCandidates ? {sourceTextCandidates:item.sourceTextCandidates} : {}),
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
    sceneResult: item?.sceneResult ? structuredClone(item.sceneResult) : null,
    graphResult: item?.graphResult ? structuredClone(item.graphResult) : null,
    ...(item?.graphEdit ? { graphEdit: structuredClone(item.graphEdit) } : {}),
    sourceReferenceId: item?.sourceReferenceId || null,
    sourceReferenceName: item?.sourceReferenceName || "",
    engine: item?.engine || null,
    postprocessOk: item?.postprocessOk === true,
    workspaceBatch: item?.workspaceBatch ? structuredClone(item.workspaceBatch) : null,
    pixelInspection: item?.pixelInspection || null,
    pixelInspectionError: item?.pixelInspectionError || null,
    separatedAssetsError: typeof item?.separatedAssetsError === 'string' ? item.separatedAssetsError : '',
    reviewState: item?.reviewState || "idle",
    reviewReport: item?.reviewReport ? JSON.parse(JSON.stringify(item.reviewReport)) : null,
    reviewMeta: item?.reviewMeta ? structuredClone(item.reviewMeta) : null,
    structureRecord: item?.structureRecord ? JSON.parse(JSON.stringify(item.structureRecord)) : null,
    rendererPrompt: typeof item?.rendererPrompt === "string" ? item.rendererPrompt : "",
    ...(item?.examBriefProfile ? { examBriefProfile: item.examBriefProfile } : {}),
    labelPlan: item?.labelPlan ? JSON.parse(JSON.stringify(item.labelPlan)) : null,
    // Early brief results inherited source-conversion settings without running
    // that protocol. Recovery must not claim label verification for a new drawing.
    imageLabelWorkflow: !isExamBrief(item) && item?.imageLabelWorkflow ? structuredClone(item.imageLabelWorkflow) : null,
    sourceLabelPlan: item?.sourceLabelPlan ? structuredClone(item.sourceLabelPlan) : null,
    editableDraft: item?.editableDraft ? structuredClone(item.editableDraft) : null,
    targetPlacement: item?.targetPlacement ? structuredClone(item.targetPlacement) : null,
    workflowMetrics: item?.workflowMetrics ? structuredClone(item.workflowMetrics) : null,
    scopedEditHistory: item?.scopedEditHistory ? structuredClone(item.scopedEditHistory) : [],
    scopedPrecisionVerification: item?.scopedPrecisionVerification ? structuredClone(item.scopedPrecisionVerification) : null,
    removalReport: item?.removalReport ? structuredClone(item.removalReport) : null,
    sourceSha256: item?.sourceSha256 || null,
    sourceFrame: item?.sourceFrame ? structuredClone(item.sourceFrame) : null,
    candidateFrame: item?.candidateFrame ? structuredClone(item.candidateFrame) : null,
    planSha256: item?.planSha256 || null,
    candidateSha256: item?.candidateSha256 || null,
    finalLabelComposite: item?.finalLabelComposite || null,
    generationMode: item?.generationMode === "separated" ? "separated" : "single",
    markPolicy: normalizeMarkPolicy(item?.markPolicy),
    nextCommentNumber: item?.nextCommentNumber || ((item?.comments || []).length + 1),
    comments: (item?.comments || []).map((comment) => structuredClone(comment)),
  };
}

export const taskItemCopy = item => ({ ...snapshotImageItem(item), card: null });

// Validate the known workspace locations before any persistent recovery mutates state.
export function validateWorkspaceCandidates(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.tabs)) throw new TypeError('Invalid task workspace');
  for (const tab of snapshot.tabs) {
    if (!tab || typeof tab.id !== 'string') throw new TypeError('Invalid task identity');
    for (const key of ['attachments','generated']) {
      if (tab[key] !== undefined && !Array.isArray(tab[key])) throw new TypeError('Invalid task candidate list');
      for (const item of tab[key] || []) validateCandidateSnapshot(item);
    }
  }
}

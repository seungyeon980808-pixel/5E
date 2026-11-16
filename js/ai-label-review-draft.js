import { parseEditableImageLabelPlan } from './ai-editable-image-labels.js?v=1.7.0-four-session-integration';
import { normalizeLeaderRoutes } from './ai-label-leaders.js?v=1.7.0-four-session-integration';

const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
  .map(byte => byte.toString(16).padStart(2, '0')).join('');
const hash = value => /^[a-f0-9]{64}$/.test(value || '');
const point = value => value && [value.x,value.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1);
const frameValid = frame => !frame || frame.coordinateSystem === 'normalized-0-1'
  && [frame.width,frame.height].every(n => Number.isInteger(n) && n > 0) && frame.width*frame.height <= 16_000_000;

// Validate, never repair, the retained normalized observation.
export function externalLabelDraftIds(plan) {
  if (!plan?.frozen || !Array.isArray(plan.labels) || plan.labels.length > 128
    || !Array.isArray(plan.sourceBindings) || plan.sourceBindings.length !== 1) return [];
  const ids = new Set(), supported = [];
  for (const label of plan.labels) {
    if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(label?.id || '') || ids.has(label.id)) return [];
    ids.add(label.id);
    if (label.scope !== 'general') continue;
    const b = label.typography?.bounds;
    if (!point(label.position) || !point(label.anchor) || !b || !point(b)
      || ![b.w,b.h].every(n => Number.isFinite(n) && n > 0) || b.x+b.w > 1+1e-9 || b.y+b.h > 1+1e-9
      || label.sourceKind !== 'reference' || label.sourceRef !== 1 || !['text','leader'].includes(label.mode)
      || !['plain','formula'].includes(label.contentMode)
      || label.elbow && !point(label.elbow)
      || label.extraAnchors !== undefined && (!Array.isArray(label.extraAnchors) || label.extraAnchors.some(p => !point(p)))
      || label.leaderRoutes !== undefined && !normalizeLeaderRoutes(label.leaderRoutes)) return [];
    if (label.mode === 'text' && (JSON.stringify(label.anchor) !== JSON.stringify(label.position)
      || label.leaderRoutes !== undefined || label.elbow !== undefined || label.extraAnchors?.length)) return [];
    const parsed = parseEditableImageLabelPlan(`<5e-editable-labels>${JSON.stringify({
      version:4,reviewRequired:true,labels:[label],
    })}</5e-editable-labels>`, {preserveSourceLabels:true,referenceCount:1});
    if (parsed.rejectedCount || parsed.labels.length !== 1 || parsed.labels[0].id !== label.id) return [];
    supported.push(label.id);
  }
  return supported;
}

function boundedPng(data) {
  if (typeof data !== 'string' || data.length > 32_000_000
    || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(data)) return false;
  try {
    const bytes = Uint8Array.from(atob(data.split(',')[1]), char => char.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const w = view.getUint32(16), h = view.getUint32(20);
    if (String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR' || !w || !h || w * h > 16_000_000) return false;
    let offset = 8, imageData = false;
    while (offset + 12 <= bytes.length) {
      const size = view.getUint32(offset), end = offset + 12 + size;
      if (end > bytes.length) return false;
      let crc = 0xffffffff;
      for (let i = offset+4; i < end-4; i++) {
        crc ^= bytes[i];
        for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
      }
      if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(end-4)) return false;
      const type = String.fromCharCode(...bytes.slice(offset+4,offset+8));
      if (type === 'IDAT') imageData = true;
      if (type === 'IEND') return size === 0 && end === bytes.length && imageData;
      offset = end;
    }
    return false;
  } catch { return false; }
}

// A user-opened review draft is separate from automatic acceptance and caches.
export function canEditLabelReviewDraft(candidate) {
  const draft = candidate?.editableDraft, plan = candidate?.sourceLabelPlan;
  const supported = draft ? externalLabelDraftIds(plan) : [];
  const external = draft?.version === 1 && draft.presentation === 'external-list'
    && candidate.labelPlan === null && candidate.imageLabelWorkflow?.imageKind === 'exam'
    && hash(draft.sourceSha256) && draft.sourceSha256 === candidate.sourceSha256
    && draft.sourceSha256 === candidate.candidateSha256 && draft.candidateSha256 === candidate.candidateSha256
    && hash(draft.planSha256) && draft.planSha256 === candidate.planSha256
    && plan?.sourceBindings?.[0]?.transportSha256 === candidate.sourceSha256
    && [candidate.sourceFrame,candidate.candidateFrame].every(frameValid)
    && (!candidate.sourceFrame || !candidate.candidateFrame
      || candidate.sourceFrame.width === candidate.candidateFrame.width && candidate.sourceFrame.height === candidate.candidateFrame.height)
    && Array.isArray(draft.labelIds) && draft.labelIds.length > 0 && new Set(draft.labelIds).size === draft.labelIds.length
    && draft.labelIds.every(id => supported.includes(id));
  return Boolean(candidate?.kind === 'generated' && candidate.id
    && candidate.imageLabelWorkflow?.explicit === true
    && candidate.imageLabelWorkflow.labelResult === 'restore-editable'
    && candidate.reviewState === 'needs-attention'
    && ['fail', 'uncertain'].includes(candidate.reviewReport?.verdict)
    && (external || !draft && candidate.labelPlan?.frozen === true && Array.isArray(candidate.labelPlan.labels))
    && /^[a-f0-9]{64}$/.test(candidate.candidateSha256 || '')
    && boundedPng(candidate.data));
}

export async function insertLabelReviewDraft({ candidate, taskId, isCurrent, insert }) {
  if (!canEditLabelReviewDraft(candidate) || !taskId || !isCurrent?.()) {
    throw new Error('검토할 이미지·라벨 결과를 확인할 수 없습니다.');
  }
  const data = candidate.data, hash = candidate.candidateSha256, candidateId = candidate.id;
  const external = candidate.editableDraft?.presentation === 'external-list';
  const planJson = JSON.stringify(external ? candidate.sourceLabelPlan : candidate.labelPlan), reportJson = JSON.stringify(candidate.reviewReport);
  const draftJson = JSON.stringify(candidate.editableDraft), sourceHash = candidate.sourceSha256, planHash = candidate.planSha256;
  const framesJson = JSON.stringify([candidate.sourceFrame,candidate.candidateFrame]);
  const sourcePlanJson = JSON.stringify(candidate.sourceLabelPlan), removalJson = JSON.stringify(candidate.removalReport);
  const removal = removalJson ? JSON.parse(removalJson) : null;
  const actual = await digest(data);
  if (actual !== hash) throw new Error('저장된 그림이 검수한 후보와 다릅니다. 다시 결과를 확인해 주세요.');
  if (removal?.status === 'partial') {
    const binding = removal.removalBinding;
    const sourcePlan = sourcePlanJson ? JSON.parse(sourcePlanJson) : null, plan = JSON.parse(planJson);
    if (binding?.version !== 1 || !sourcePlan || !plan?.sourcePlan || !removal.removalMasks
      || binding.sourceSha256 !== sourceHash || binding.planSha256 !== planHash || binding.candidateSha256 !== actual
      || sourcePlan.sourceBindings?.[0]?.transportSha256 !== sourceHash
      || binding.planSha256 !== await digest(sourcePlanJson)
      || binding.maskSha256 !== await digest(JSON.stringify(removal.removalMasks))
      || JSON.stringify(plan.removalBinding) !== JSON.stringify(binding)
      || JSON.stringify(plan.sourcePlan.removalBinding) !== JSON.stringify(binding)
      || !Array.isArray(binding.restoredLabelIds) || !binding.restoredLabelIds.length
      || new Set(binding.restoredLabelIds).size !== binding.restoredLabelIds.length
      || JSON.stringify(plan.labels.map(label => label.id)) !== JSON.stringify(binding.restoredLabelIds)
      || JSON.stringify(plan.sourcePlan.labels.map(label => label.id)) !== JSON.stringify(binding.restoredLabelIds)
      || binding.restoredLabelIds.some(id => !binding.removedLabelIds?.includes(id)
        || JSON.stringify(plan.labels.find(label => label.id === id))
          !== JSON.stringify(sourcePlan.labels.find(label => label.id === id)))) {
      throw new Error('부분 제거된 라벨의 원본 계획·제거 마스크·복원 목록 바인딩이 일치하지 않습니다.');
    }
  }
  if (external && await digest(planJson) !== planHash) throw new Error('원본 라벨 계획의 바인딩이 변경되었습니다.');
  const unchanged = () => isCurrent() && canEditLabelReviewDraft(candidate)
    && candidate.id === candidateId && candidate.data === data && candidate.candidateSha256 === hash
    && JSON.stringify(external ? candidate.sourceLabelPlan : candidate.labelPlan) === planJson && JSON.stringify(candidate.reviewReport) === reportJson
    && JSON.stringify(candidate.editableDraft) === draftJson && candidate.sourceSha256 === sourceHash && candidate.planSha256 === planHash
    && JSON.stringify([candidate.sourceFrame,candidate.candidateFrame]) === framesJson
    && JSON.stringify(candidate.sourceLabelPlan) === sourcePlanJson && JSON.stringify(candidate.removalReport) === removalJson;
  if (!unchanged()) throw new Error('검토 결과를 준비하는 동안 작업이나 후보가 변경되었습니다.');
  const plan = JSON.parse(planJson);
  if (external) {
    plan.sourcePlan = JSON.parse(planJson);
    plan.labels = plan.labels.filter(label => candidate.editableDraft.labelIds.includes(label.id));
    plan.relationGroups = (plan.relationGroups || []).filter(group => group.labelIds.every(id => candidate.editableDraft.labelIds.includes(id)));
    plan.targetPlacement = null;
    plan.candidateSha256 = hash;
  }
  plan.reviewRequired = true;
  plan.status = 'review';
  plan.qualityReview = JSON.parse(reportJson);
  plan.reviewDraft = { version: 1, candidateSha256: hash, origin: 'user-review-edit',
    ...(external ? {presentation:'external-list',sourceSha256:sourceHash,planSha256:planHash,labelIds:[...candidate.editableDraft.labelIds]} : {}) };
  return insert(data, { preserveBytes: true, centerArtboard: true, aiTaskId: taskId,
    aiCandidateId: candidateId, editableLabelPlan: plan, isCurrent: unchanged });
}

import { applyLabelTargetPlacement } from './ai-label-target-placement.js?v=1.7.0-four-session-integration';

// Local bitmap edits retain the frame and all label geometry. Materialize any
// existing mapped positions before dropping bindings to the previous bitmap.
// This is a user edit, never a new automatic verification pass.
export function localEditableLabelPlan(parent) {
  if (!parent?.labelPlan) return null;
  const plan = structuredClone(parent.labelPlan);
  if (plan.targetPlacement) {
    plan.labels = applyLabelTargetPlacement(plan.labels, plan.targetPlacement, { candidateSha256: plan.candidateSha256 });
  }
  plan.localEditOrigin = { candidateId: parent.id, candidateSha256: plan.candidateSha256 || null };
  for (const key of ['qualityReview', 'targetPlacement', 'candidateSha256', 'sourcePlan', 'reviewDraft']) delete plan[key];
  plan.reviewRequired = true; plan.status = 'review';
  return plan;
}

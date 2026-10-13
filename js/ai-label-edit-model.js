import { localEditableLabelPlan } from './ai-local-label-plan.js?v=1.7.0-four-session-integration';
import { createEditableImageLabelObjects } from './ai-editable-image-labels.js?v=1.7.0-four-session-integration';
import { nativeLabelBounds, measureLabelTypography, reconcileLabelTypography } from './ai-label-typography.js?v=1.7.0-four-session-integration';
import { TEXT_FONTS } from './state.js?v=1.7.0-four-session-integration';

export function manualLabelPlan(candidate) {
  let plan = localEditableLabelPlan(candidate);
  if (!plan && candidate?.editableDraft?.presentation === 'external-list' && candidate.sourceLabelPlan?.frozen) {
    plan = localEditableLabelPlan({ ...candidate, labelPlan: candidate.sourceLabelPlan });
    plan.labels = plan.labels.filter(label => candidate.editableDraft.labelIds.includes(label.id));
  }
  plan ||= { version:4, frozen:true, labels:[], relationGroups:[] };
  plan.frozen = true;
  plan.reviewRequired = true;
  plan.status = 'review';
  delete plan.removalBinding;
  return plan;
}

export function labelEditFrame(width, height, artboard) {
  const scale = Math.min(artboard.w * .9 / width, artboard.h * .9 / height, 1);
  return { id:'label-editor-image', x:0, y:0, w:width * scale, h:height * scale, rotation:0 };
}

export function labelEditObjects(plan, image) {
  let serial = 0;
  return createEditableImageLabelObjects({ labels:plan.labels, relationGroups:plan.relationGroups || [], image,
    idFactory:() => `label-editor-${++serial}` });
}

export function labelEditBounds(object) {
  if (object.type !== 'labeler') return nativeLabelBounds(object);
  const m = measureLabelTypography(object);
  return { x:object.p2.x-m.rotatedW/2, y:object.p2.y-m.rotatedH/2, w:m.rotatedW, h:m.rotatedH };
}

// Source typography can contain observations that the native display ignores.
// Starting a local edit must preserve what is actually painted, rather than
// treating those observations as a newly selected user font or weight.
export function preserveLabelPresentation(plan, objects, frame) {
  for (const label of plan.labels) {
    if (label.manualStyle) continue;
    const object = objects.find(object => object.aiSourceLabelId === label.id);
    if (!object) continue;
    label.manualStyle = { size:(object.fontSize || object.labelSize)/frame.h, defaultFontPinned:true };
    const typography = label.typography ||= { role:object.aiLabelRole || 'text' };
    const font = TEXT_FONTS.find(font => font.css === object.fontFamily);
    delete typography.font; delete typography.fontProfile;
    if (font) typography.font = font.label;
    else typography.fontProfile = 'equation';
    typography.fontWeight = object.fontWeight || 'normal';
    typography.italic = object.italic === true;
    for (const [key,value] of [['letterSpacing',object.letterSpacing],['lineHeight',object.labelLineHeight]]) {
      if (Number.isFinite(value)) typography[key] = value;
      else delete typography[key];
    }
  }
}

export function changeLabelText(label, text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 1000) throw new Error('라벨 문구는 1~1000자로 입력하세요.');
  const styles = reconcileLabelTypography({ text:label.text, contentMode:label.contentMode,
    labelStyleText:label.text, labelRuns:label.typography?.runs, labelScriptStyles:label.typography?.scriptStyles }, text);
  label.text = text;
  label.typography ||= { role:'text' };
  if (styles.labelRuns) label.typography.runs = styles.labelRuns; else delete label.typography.runs;
  if (styles.labelScriptStyles) label.typography.scriptStyles = styles.labelScriptStyles; else delete label.typography.scriptStyles;
}

export function moveLabel(label, dx, dy, part = 'position') {
  if (part === 'anchor') { moveLeaderHandle(label,part,dx,dy); return; }
  const clamp = n => Math.max(0, Math.min(1, n));
  const start = label[part];
  const x = clamp(start.x+dx), y = clamp(start.y+dy);
  dx = x-start.x; dy = y-start.y;
  label[part] = { x, y };
  if (part === 'position') {
    if (label.mode === 'text') label.anchor = { x, y };
    // Leader targets stay attached to the diagram when its caption moves.
    for (const route of label.leaderRoutes || []) route.start = { x:clamp(route.start.x+dx), y:clamp(route.start.y+dy) };
  }
}

// Legacy anchor aliases and routed endpoints represent the same connection.
// Editing either must keep every alias on that physical point synchronized.
export function moveLeaderHandle(label, part, dx, dy) {
  const keys = part.split(':');
  const p = part === 'anchor' ? label.anchor : part === 'elbow' ? label.elbow
    : keys[0] === 'extra' ? label.extraAnchors?.[+keys[1]]
    : keys[0] === 'control' ? label.leaderRoutes?.[+keys[1]]?.controls?.[+keys[2]]
    : label.leaderRoutes?.[+keys[1]]?.target;
  if (!p) return;
  const old = {...p}, next = {x:Math.max(0,Math.min(1,p.x+dx)), y:Math.max(0,Math.min(1,p.y+dy))};
  const points = keys[0] === 'control' || part === 'elbow'
    ? [label.elbow, ...(label.leaderRoutes || []).flatMap(r => r.controls || [])]
    : [label.anchor, ...(label.extraAnchors || []), ...(label.leaderRoutes || []).map(r => r.target)];
  for (const linked of points) if (linked && Math.hypot(linked.x-old.x,linked.y-old.y) < 1e-6) Object.assign(linked,next);
}

export function userOutputLabelPlan(candidate) {
  if (!candidate.labelPlan && candidate.editableDraft?.presentation !== 'external-list') return null;
  const plan = manualLabelPlan(candidate);
  plan.bundleWithImage = true;
  plan.manualReview = { origin:'user-output', candidateId:candidate.id, reviewState:candidate.reviewState || 'idle' };
  return plan;
}

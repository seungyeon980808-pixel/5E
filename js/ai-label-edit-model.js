import { snapAngle } from './geometry.js?v=1.7.0-four-session-integration';
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
  // 11-09: 라벨 편집 창과 PNG 저장도 캔버스 넣기와 같은 글자 크기(원본에서 잰 비율 × 그림 높이, 1.8~8).
  const measured = Number.isFinite(plan?.measuredLabelSize) && plan.measuredLabelSize > 0 ? { labelSizeMm: Math.min(8, Math.max(1.8, plan.measuredLabelSize * image.h)) } : {};
  return createEditableImageLabelObjects({ labels:plan.labels, relationGroups:plan.relationGroups || [], image, ...measured,
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
    // 11-26 길이 표시: 글자를 옮기면 양 끝 화살표도 함께 옮긴다.
    if (label.dimension) for (const key of ['a','b']) label.dimension[key] = { x:clamp(label.dimension[key].x+dx), y:clamp(label.dimension[key].y+dy) };
  }
}

// Use image-space distances so a non-square image snaps to the visible angle.
export function snappedLeaderDelta(label, part, dx, dy, frame) {
  const [kind, routeIndex, controlIndex] = part.split(':');
  const route = label.leaderRoutes?.[Number(routeIndex) || 0];
  const controls = route?.controls || [];
  let moving, pivot;
  if (kind === 'dim') {
    moving = label.dimension?.[routeIndex]; pivot = label.dimension?.[routeIndex === 'a' ? 'b' : 'a'];
  } else if (kind === 'position') {
    moving = route?.start || label.position;
    pivot = controls[0] || route?.target || label.elbow || label.anchor;
  } else if (kind === 'control') {
    moving = controls[Number(controlIndex)];
    pivot = controls[Number(controlIndex) + 1] || route?.target;
  } else if (kind === 'elbow') {
    moving = label.elbow;
    pivot = label.anchor;
  } else {
    moving = kind === 'extra' ? label.extraAnchors?.[Number(routeIndex)] : kind === 'route' ? route?.target : label.anchor;
    pivot = controls.at(-1) || route?.start || label.elbow || label.position;
  }
  if (!moving || !pivot) return {dx,dy};
  const end = snapAngle({x:pivot.x*frame.w, y:pivot.y*frame.h},
    {x:(moving.x+dx)*frame.w, y:(moving.y+dy)*frame.h});
  const vx = end.x/frame.w-pivot.x, vy = end.y/frame.h-pivot.y;
  const limit = (start,v) => v > 0 ? (1-start)/v : v < 0 ? -start/v : Infinity;
  const k = Math.min(1,limit(pivot.x,vx),limit(pivot.y,vy));
  return {dx:pivot.x+k*vx-moving.x, dy:pivot.y+k*vy-moving.y};
}

// Legacy anchor aliases and routed endpoints represent the same connection.
// Editing either must keep every alias on that physical point synchronized.
export function moveLeaderHandle(label, part, dx, dy) {
  const keys = part.split(':');
  // 11-26 길이 표시 끝점: 한 끝을 옮기면 글자는 두 끝의 가운데로 따라간다(시안 v6).
  if (keys[0] === 'dim') {
    const p = label.dimension?.[keys[1]]; if (!p) return;
    label.dimension[keys[1]] = { x:Math.max(0,Math.min(1,p.x+dx)), y:Math.max(0,Math.min(1,p.y+dy)) };
    const {a,b} = label.dimension, mid = { x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
    label.position = { ...mid }; label.anchor = { ...mid };
    return;
  }
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
  // 11-10: 검수를 건너뛴 라벨 읽기 결과(reviewSkipped, 통과)는 캔버스·한글로 보낼 때도 「검토 필요」를 붙이지 않는다(742a44c4와 같은 판정).
  if (candidate.reviewReport?.reviewSkipped === true && candidate.reviewState === 'passed') { plan.reviewRequired = false; plan.status = 'ready'; }
  // New drawings are drafts for hand editing. Reference-label restoration keeps its existing bundled output.
  plan.bundleWithImage = plan.origin !== 'figure-generation';
  plan.manualReview = { origin:'user-output', candidateId:candidate.id, reviewState:candidate.reviewState || 'idle' };
  // 11-09: 기출 글자를 하나도 지우지 못한 결과(원본 글자가 그대로 남음)를 검수 없이 넣을 때도 편집 라벨을 원본 글자 위에
  // 겹쳐 놓지 않는다(같은 글자가 두 번 보였음). 「라벨 목록 편집」과 같이 그림 오른쪽에 목록으로 놓는다.
  if (!candidate.labelPlan && candidate.editableDraft?.presentation === 'external-list')
    plan.reviewDraft = { version:1, origin:'user-output', presentation:'external-list', labelIds:[...candidate.editableDraft.labelIds] };
  return plan;
}

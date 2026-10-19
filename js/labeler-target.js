/* Target markers belong to the labeler; their centers follow its anchors. */
export const DEFAULT_LABELER_DOT_DIAMETER = 1;

export function labelerDotDiameter(obj) {
  return Number.isFinite(obj?.targetDotDiameter) && obj.targetDotDiameter > 0
    ? obj.targetDotDiameter : DEFAULT_LABELER_DOT_DIAMETER;
}

export function labelerTargetDots(obj) {
  if (obj?.targetMarker !== "dot") return [];
  const r = labelerDotDiameter(obj) / 2;
  return [obj.p1 || { x: 0, y: 0 }, obj.p3, ...(obj.extraAnchors || [])]
    .filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    .map(p => ({ x: p.x, y: p.y, r }));
}

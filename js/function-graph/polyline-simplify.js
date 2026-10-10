/* Remove redundant editing anchors, not observations or meaningful geometry.
 * Collinearity uses only floating-point roundoff allowance, never a visual-fit
 * tolerance. Call with rendered coordinates when either axis is nonlinear.
 */
export function simplifyPolyline(points, options = {}) {
  const originalPoints = Array.isArray(points) ? points.map(p => ({ ...p })) : [];
  const identity = reason => ({ points: originalPoints.map(p => ({ ...p })), originalPoints,
    keptIndices: originalPoints.map((_, i) => i), indexMap: originalPoints.map((_, i) => i),
    removedIndices: [], contacts: [], breaks: [...(options.breaks || [])], changed: false, reason });
  if (!Array.isArray(points) || points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return identity('invalid-points');
  if (points.length < 3) return identity('already-minimal');
  if (options.closed || options.lineVisible === false || options.curveStyle === 'smooth'
    || options.markerShape && options.markerShape !== 'none'
    || options.handles?.length || options.handlesMath?.length || options.handlesMode === 'manual'
    || options.segmentModes?.length || options.arrowSpecs?.length || options.fit?.enabled) return identity('protected-geometry');
  const protect = new Set([0, points.length - 1, ...(options.protectedIndices || []),
    ...(options.endpointMarkers || options.endpoints || []).map(e => e.index)]);
  const breaks = options.breaks || [];
  if (breaks.some(b => !Number.isInteger(b) || b <= 0 || b >= points.length)) return identity('invalid-breaks');
  for (const b of breaks) { protect.add(b - 1); protect.add(b); }
  // Unknown per-point fields can carry marker/label semantics. Keep those points.
  points.forEach((p, i) => { if (Object.keys(p).some(k => k !== 'x' && k !== 'y')) protect.add(i); });
  const redundant = (a, b, c) => {
    const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    // Preserve duplicate samples and direction reversals, including vertical ones.
    if (ux * vx + uy * vy <= 0) return false;
    const cross = ux * vy - uy * vx;
    const scale = Math.max(Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y), Math.abs(c.x), Math.abs(c.y));
    const roundoff = 32 * Number.EPSILON * (Math.abs(ux * vy) + Math.abs(uy * vx)
      + scale * (Math.abs(ux) + Math.abs(uy) + Math.abs(vx) + Math.abs(vy)));
    return Math.abs(cross) <= roundoff;
  };
  const keptIndices = [];
  for (let i = 0; i < points.length; i++) {
    while (keptIndices.length >= 2) {
      const b = keptIndices.at(-1), a = keptIndices.at(-2);
      if (protect.has(b) || !redundant(points[a], points[b], points[i])) break;
      keptIndices.pop();
    }
    keptIndices.push(i);
  }
  const indexMap = points.map(() => null);
  keptIndices.forEach((old, i) => { indexMap[old] = i; });
  const removedIndices = points.flatMap((_, i) => indexMap[i] === null ? [i] : []);
  const contacts = [];
  for (let segmentIndex = 0; segmentIndex < keptIndices.length - 1; segmentIndex++) {
    const start = keptIndices[segmentIndex], end = keptIndices[segmentIndex + 1];
    const a = points[start], b = points[end], dx = b.x - a.x, dy = b.y - a.y;
    for (let i = start + 1; i < end; i++) contacts[i] = { segmentIndex,
      t: ((points[i].x - a.x) * dx + (points[i].y - a.y) * dy) / (dx * dx + dy * dy) };
  }
  return { points: keptIndices.map(i => ({ ...points[i] })), originalPoints, keptIndices, indexMap,
    removedIndices, contacts, breaks: breaks.map(b => indexMap[b]), changed: removedIndices.length > 0,
    reason: removedIndices.length ? 'redundant-collinear-anchors' : 'already-minimal' };
}

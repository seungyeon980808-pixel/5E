// Source evidence only: no extrapolation of a partly hidden lattice. Full-span
// neutral thin ink in both directions is required before adding any geometry.
export const SOURCE_GRID_VERSION = 'source-grid-v1';

export function matchSourceGrid(plan, raster) {
  const box = plan?.source?.plotBox, data = raster?.dataRGBA ?? raster?.data;
  const unchanged = (reason, measurements = []) => ({ plan, applied: false, measurements, reason, removedIDs: [], transforms: [] });
  if (!box || !raster || raster.width !== plan.source.width || raster.height !== plan.source.height || data?.length !== raster.width * raster.height * 4) return unchanged('source-raster-unavailable');
  if (![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.w < 30 || box.h < 30 || box.x < 0 || box.y < 0 || box.x + box.w > raster.width || box.y + box.h > raster.height) return unchanged('invalid-plot-box');
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const scan = vertical => {
    const origin = vertical ? box.x : box.y, span = vertical ? box.w : box.h;
    const cross = vertical ? box.y : box.x, length = vertical ? box.h : box.w;
    const candidates = [];
    for (let pos = Math.ceil(origin + 3); pos < origin + span - 2; pos++) {
      const bins = Array(8).fill(0), levels = [];
      for (let q = Math.ceil(cross + 3); q < cross + length - 2; q++) {
        const i = ((vertical ? q : pos) * raster.width + (vertical ? pos : q)) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2], level = (r + g + b) / 3;
        if (data[i + 3] >= 240 && Math.max(r, g, b) - Math.min(r, g, b) <= 18 && level >= 65 && level <= 225) {
          levels.push(level); bins[Math.min(7, Math.floor((q - cross) / length * 8))]++;
        }
      }
      // Occluding captions may hide part of a printed grid. Require distributed
      // evidence, across the plot rather than accepting a long local curve. Weak
      // occluded lines require separate lattice corroboration below.
      const strong = levels.length / length >= .48 && bins.filter(n => n >= length / 8 * .2).length >= 6;
      const occluded = levels.length / length >= .36 && bins.filter(n => n >= length / 8 * .2).length >= 4 && bins[0] >= 3 && bins[7] >= 3;
      if (strong || occluded) {
        candidates.push({ pos, level: median(levels), coverage: levels.length / length, strong });
      }
    }
    const groups = [];
    for (const c of candidates) {
      const last = groups.at(-1);
      if (last && c.pos === last.at(-1).pos + 1) last.push(c); else groups.push([c]);
    }
    return groups.filter(g => g.length <= 3).map(g => {
      const positionPx = g.reduce((s, c) => s + c.pos, 0) / g.length;
      return { orientation: vertical ? 'vertical' : 'horizontal', positionPx,
        normalizedPosition: vertical ? (positionPx - box.x) / box.w : 1 - (positionPx - box.y) / box.h,
        strong: g.some(c => c.strong), widthPx: g.length, strokeLevel: Math.round(median(g.map(c => c.level))), coverage: Math.max(...g.map(c => c.coverage)) };
    });
  };
  let lines = [...scan(true), ...scan(false)];
  if (!lines.length) return unchanged('no-source-grid');
  // Heavy gray axes are often neutral too, but differ from the repeated light
  // grid stroke. Do not turn an axis or a dark plateau into a grid line.
  const level = median(lines.map(l => l.strokeLevel));
  lines = lines.filter(l => Math.abs(l.strokeLevel - level) <= 25);
  // Weak evidence is accepted only on the lattice independently established by
  // at least three strong source lines of the same direction and gray level.
  lines = lines.filter(l => {
    if (l.strong) return true;
    const strong = lines.filter(q => q.orientation === l.orientation && q.strong).sort((a, b) => a.positionPx - b.positionPx);
    if (strong.length < 3) return false;
    const gap = median(strong.slice(1).map((q, i) => q.positionPx - strong[i].positionPx));
    return gap > 5 && Math.abs((l.positionPx - strong[0].positionPx) / gap - Math.round((l.positionPx - strong[0].positionPx) / gap)) * gap <= 2;
  });
  const vertical = lines.filter(l => l.orientation === 'vertical');
  const horizontal = lines.filter(l => l.orientation === 'horizontal');
  if (vertical.length < 3 || horizontal.length < 3) return unchanged('insufficient-cross-grid-evidence', lines);
  const axisEvidence = [];
  for (const [axis, orientation, span] of [['x', 'horizontal', box.h], ['y', 'vertical', box.w]]) {
    const placement = plan.axisPlacement?.[axis];
    if (placement?.mode !== 'fraction' || !(placement.value > 0 && placement.value < 1)) continue;
    const verticalAxis = orientation === 'vertical', fraction = placement.value;
    const center = verticalAxis ? box.x + fraction * box.w : box.y + (1 - fraction) * box.h;
    const start = verticalAxis ? box.y : box.x, length = verticalAxis ? box.h : box.w;
    let best = 0;
    for (let pos = Math.round(center) - 2; pos <= Math.round(center) + 2; pos++) {
      let ink = 0;
      for (let q = Math.ceil(start + 3); q < start + length - 2; q++) {
        const i = ((verticalAxis ? q : pos) * raster.width + (verticalAxis ? pos : q)) * 4;
        if (data[i + 3] >= 240 && Math.max(data[i], data[i+1], data[i+2]) - Math.min(data[i], data[i+1], data[i+2]) <= 18 && (data[i] + data[i+1] + data[i+2]) / 3 < 130) ink++;
      }
      best = Math.max(best, ink / (length - 5));
    }
    if (best >= .9) axisEvidence.push({ axis, orientation, normalizedPosition: fraction, positionPx: center, coverage: best, evidence: 'verified-dark-axis' });
  }
  const completeLattice = (direction, span) => {
    const positions = [...direction, ...axisEvidence.filter(a => a.orientation === direction[0]?.orientation)].map(l => l.normalizedPosition * span).sort((a, b) => a - b);
    const gaps = positions.slice(1).map((p, i) => p - positions[i]);
    const step = median(gaps), count = Math.round(span / step);
    if (count < 4 || count > 100 || Math.abs(span / count - step) > 2) return null;
    const exactStep = span / count;
    // Every rendered interior line must have independently observed source ink.
    for (let i = 1; i < count; i++) if (!positions.some(p => Math.abs(p - i * exactStep) <= 2)) return null;
    if (positions.some(p => Math.abs(p - Math.round(p / exactStep) * exactStep) > 2)) return null;
    return 1 / count;
  };
  const xStep = completeLattice(vertical, box.w), yStep = completeLattice(horizontal, box.h);
  const style = { strokeWidth: median(lines.map(l => l.widthPx)) * 70 / box.w, dashLength: 0, dashGap: 0, strokeLevel: level };
  const next = structuredClone(plan);
  const removedIDs = [], transforms = [];
  const normalize = (p, space, axis = 'y') => {
    if (space === 'normalized') return p;
    const x = plan.axes?.x, y = plan.axes?.[axis];
    if (space !== 'data' || x?.scale !== 'linear' || y?.scale !== 'linear' || ![x.min, x.max, y.min, y.max].every(Number.isFinite) || x.max <= x.min || y.max <= y.min) return null;
    return { x: (p.x - x.min) / (x.max - x.min), y: (p.y - y.min) / (y.max - y.min) };
  };
  const near = (a, b) => Math.abs(a.x - b.x) * box.w <= 2 && Math.abs(a.y - b.y) * box.h <= 2;
  const endpoints = line => line.orientation === 'vertical' ? [{ x: line.normalizedPosition, y: 0 }, { x: line.normalizedPosition, y: 1 }] : [{ x: 0, y: line.normalizedPosition }, { x: 1, y: line.normalizedPosition }];
  const matchedLine = (from, to, space, axis) => {
    const a = normalize(from, space, axis), b = normalize(to, space, axis);
    if (!a || !b) return null;
    return lines.find(l => { const [u, v] = endpoints(l); return near(a, u) && near(b, v) || near(a, v) && near(b, u); });
  };
  if (!plan.grid && (xStep || yStep)) next.grid = { coordinateSpace: 'normalized', ...(xStep ? { xStep } : {}), ...(yStep ? { yStep } : {}), style };
  const representedByGrid = l => {
    const grid = next.grid, step = grid?.[l.orientation === 'vertical' ? 'xStep' : 'yStep'];
    if (grid?.coordinateSpace !== 'normalized' || !(step > 0)) return false;
    const span = l.orientation === 'vertical' ? box.w : box.h;
    return Math.abs(l.normalizedPosition - Math.round(l.normalizedPosition / step) * step) * span <= 2;
  };
  next.annotations = (next.annotations || []).filter(a => {
    if (a.kind !== 'guide' || !a.to || a.text || a.seriesId || a.pointIndex !== undefined || a.endStyle && a.endStyle !== 'none') return true;
    const line = matchedLine(a, a.to, a.coordinateSpace, a.axis);
    if (!line) return true;
    if (representedByGrid(line)) { removedIDs.push(a.id); transforms.push({ kind: 'guide-to-grid', id: a.id, positionsPx: [line.positionPx] }); return false; }
    Object.assign(a, { ...style, strokeWidth: line.widthPx * 70 / box.w, strokeLevel: line.strokeLevel });
    transforms.push({ kind: 'guide-style', id: a.id, positionsPx: [line.positionPx] });
    return true;
  });
  next.series = (next.series || []).filter(s => {
    if (s.kind !== 'points' || s.certainty === 'exact' || s.candidateFamily && s.candidateFamily !== 'none' || s.physicsModel || s.curveStyle && s.curveStyle !== 'straight' || s.label || s.endLabel || s.markerShape && s.markerShape !== 'none' || s.endpoints?.length || s.arrows?.length || s.arrowSpecs?.length || s.segmentModes?.length || s.arrowStart || s.arrowEnd || s.closed || s.lineVisible === false || s.handlesMath || s.handles || s.fit?.enabled || (plan.annotations || []).some(a => a.seriesId === s.id)) return true;
    const points = s.points || [], cuts = [0, ...(s.breaks || []), points.length];
    if (cuts.some((cut, i) => i && (!Number.isInteger(cut) || cut - cuts[i - 1] !== 2))) return true;
    const matches = cuts.slice(1).map((end, i) => matchedLine(points[cuts[i]], points[end - 1], s.coordinateSpace, s.axis));
    if (!matches.length || matches.some(l => !l)) return true;
    removedIDs.push(s.id); transforms.push({ kind: 'series-to-source-grid', id: s.id, positionsPx: matches.map(l => l.positionPx) });
    return false;
  });
  const ids = new Set(next.annotations.map(a => a.id));
  for (const line of lines) {
    if (representedByGrid(line)) continue;
    const p = line.normalizedPosition, verticalLine = line.orientation === 'vertical';
    const from = verticalLine ? { x: p, y: 0 } : { x: 0, y: p };
    const to = verticalLine ? { x: p, y: 1 } : { x: 1, y: p };
    const duplicate = next.annotations.some(a => a.kind === 'guide' && a.to && matchedLine(a, a.to, a.coordinateSpace, a.axis) === line);
    if (duplicate) continue;
    let id = `source-grid-${line.orientation}-${line.positionPx}`;
    while (ids.has(id)) id += '-'; ids.add(id);
    next.annotations.push({ id, kind: 'guide', text: '', orientation: line.orientation, coordinateSpace: 'normalized', axis: 'y', endStyle: 'none', ...from, to, ...style });
  }
  return { plan: next, applied: true, measurements: lines, reason: xStep && yStep ? 'complete-observed-grid' : 'observed-grid-lines', removedIDs, transforms, axisEvidence, version: SOURCE_GRID_VERSION };
}

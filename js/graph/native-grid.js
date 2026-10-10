// Move only complete, regularly spaced frame-wide lines into the existing grid.
// Irregular/partial guides and every labelled, marked or curved series stay intact.
export function mapNativeGrid(plan) {
  const unchanged = { series: plan.series, annotations: plan.annotations, grid: null, migrated: [] };
  if (plan.grid) return unchanged;
  if (['x', 'y'].some(k => plan.axes[k].scale === 'log')) return unchanged;
  const bounds = k => plan.coordinateMode === 'observed' ? [0, 1] : [plan.axes[k].min, plan.axes[k].max];
  const normal = (q, space) => space === 'normalized' ? q : Object.fromEntries(['x', 'y'].map(k => {
    const [lo, hi] = bounds(k); return [k, (q[k] - lo) / (hi - lo)];
  }));
  const tol = 2 / Math.min(plan.source.plotBox.w, plan.source.plotBox.h);
  const axisFraction = k => plan.axisPlacement?.[k]?.mode === 'fraction' ? plan.axisPlacement[k].value : 0;
  const candidates = [];
  const line = (a, b, owner, style) => {
    let axis, value;
    if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(Math.min(a.y, b.y)) <= tol && Math.abs(Math.max(a.y, b.y) - 1) <= tol) { axis = 'x'; value = a.x; }
    else if (Math.abs(a.y - b.y) < 1e-9 && Math.abs(Math.min(a.x, b.x)) <= tol && Math.abs(Math.max(a.x, b.x) - 1) <= tol) { axis = 'y'; value = a.y; }
    else return false;
    if (value < -tol || value > 1 + tol) return false;
    candidates.push({ axis, value, owner, style }); return true;
  };
  for (const s of plan.series) {
    if (s.kind !== 'points' || s.certainty === 'exact' || s.candidateFamily && s.candidateFamily !== 'none' || s.physicsModel || s.curveStyle !== 'straight' || s.closed || s.lineVisible === false || s.axis === 'y2'
      || s.label || s.endLabel || s.endpoints?.length || s.arrowSpecs?.length || s.handlesMath
      || s.markerShape && s.markerShape !== 'none' || s.segmentModes?.some(m => m !== 'line')
      || plan.annotations.some(a => a.seriesId === s.id)) continue;
    const breaks = new Set(s.breaks || []), segments = [];
    let start = 0;
    for (let i = 1; i <= s.points.length; i++) if (i === s.points.length || breaks.has(i)) { segments.push(s.points.slice(start, i)); start = i; }
    if (segments.some(seg => seg.length !== 2)) continue;
    const count = candidates.length;
    const style = { strokeWidth: s.strokeWidth ?? plan.style?.strokeWidth ?? 0.1,
      dashLength: s.dashLength ?? (s.lineStyle === 'dashed' ? 1.2 : 0), dashGap: s.dashGap ?? (s.lineStyle === 'dashed' ? 0.9 : 0) };
    if (s.dashPattern) continue;
    if (!segments.every(seg => line(normal(seg[0], s.coordinateSpace), normal(seg[1], s.coordinateSpace), { kind: 'series', id: s.id }, style))) candidates.length = count;
  }
  for (const a of plan.annotations) {
    if (a.kind !== 'guide' || a.text || a.seriesId || a.axis === 'y2') continue;
    const axisValue = k => a.coordinateSpace === 'normalized' ? axisFraction(k === 'x' ? 'y' : 'x') : bounds(k)[0] + axisFraction(k === 'x' ? 'y' : 'x') * (bounds(k)[1] - bounds(k)[0]);
    const end = a.to || (a.orientation === 'horizontal' ? { x: axisValue('x'), y: a.y } : { x: a.x, y: axisValue('y') });
    const style = { strokeWidth: 0.1, dashLength: 0.55, dashGap: 0.4, ...plan.style?.guideStyle };
    for (const k of ['strokeWidth', 'dashLength', 'dashGap', 'strokeLevel']) if (a[k] !== undefined) style[k] = a[k];
    line(normal(a, a.coordinateSpace), normal(end, a.coordinateSpace), { kind: 'annotation', id: a.id }, style);
  }
  const groups = new Map();
  for (const c of candidates) {
    const key = JSON.stringify(c.style);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const regular = (items, axis) => {
    const values = [...new Set(items.filter(c => c.axis === axis).map(c => c.value))].filter(v => v > tol && v < 1 - tol).sort((a, b) => a - b);
    if (values.length < 3) return null;
    const initial = Math.min(values[0], ...values.slice(1).map((v, i) => v - values[i]));
    const indices = values.map(v => Math.round(v / initial));
    if (indices[0] !== 1 || indices.at(-1) > 159 || new Set(indices).size !== indices.length) return null;
    const step = values.reduce((sum, v, i) => sum + v * indices[i], 0) / indices.reduce((sum, k) => sum + k * k, 0);
    if (values.some((v, i) => Math.abs(v - indices[i] * step) > tol)) return null;
    const expected = Math.floor((1 - tol) / step);
    const present = new Set(indices);
    // A grid line can be absent only where the explicit internal axis supplies it.
    for (let k = 1; k <= expected; k++) if (!present.has(k) && Math.abs(k * step - axisFraction(axis === 'x' ? 'y' : 'x')) > tol) return null;
    return step;
  };
  for (const items of [...groups.values()].sort((a, b) => b.length - a.length)) {
    const xStep = regular(items, 'x'), yStep = regular(items, 'y');
    if (!xStep || !yStep) continue;
    const owners = new Set(items.map(c => `${c.owner.kind}:${c.owner.id}`));
    // Never remove half of a multi-segment object that belongs to another style/group.
    if (candidates.some(c => owners.has(`${c.owner.kind}:${c.owner.id}`) && !items.includes(c))) continue;
    return { series: plan.series.filter(s => !owners.has(`series:${s.id}`)), annotations: plan.annotations.filter(a => !owners.has(`annotation:${a.id}`)),
      grid: { xStep, yStep, coordinateSpace: 'normalized', style: items[0].style },
      migrated: items.map(c => ({ ...c.owner, axis: c.axis, position: c.value })) };
  }
  return unchanged;
}

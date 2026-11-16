// Measure repeated neutral dash runs only on an already-observed guide.
// Ambiguous/solid lines keep their original style; no geometry is added or moved.
export const SOURCE_GUIDE_STYLE_VERSION = 'source-guide-style-v1';
export function matchSourceGuideDashes(plan, raster) {
  const box = plan?.source?.plotBox, data = raster?.data;
  if (!box || !raster || raster.width !== plan.source.width || raster.height !== plan.source.height || data?.length !== raster.width * raster.height * 4) return { plan, applied: false, measurements: [] };
  const median = list => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
  const marks = [], next = structuredClone(plan);
  for (const a of next.annotations || []) {
    if (a.kind !== 'guide' || a.coordinateSpace !== 'normalized' || a.text) continue;
    const end = a.to || (a.orientation === 'horizontal' ? { x: plan.axisPlacement?.y?.value || 0, y: a.y } : { x: a.x, y: plan.axisPlacement?.x?.value || 0 });
    const horizontal = Math.abs(a.y - end.y) < 1e-9, vertical = Math.abs(a.x - end.x) < 1e-9;
    if (horizontal === vertical) continue;
    const from = horizontal ? box.x + a.x * box.w : box.y + (1 - a.y) * box.h;
    const to = horizontal ? box.x + end.x * box.w : box.y + (1 - end.y) * box.h;
    const fixed = horizontal ? box.y + (1 - a.y) * box.h : box.x + a.x * box.w;
    if (Math.abs(to - from) < 50) continue;
    const rows = [];
    for (let offset = -2; offset <= 2; offset++) {
      const cross = Math.round(fixed + offset), runs = []; let prior = null, length = 0;
      for (let p = Math.ceil(Math.min(from, to) + 4); p < Math.max(from, to) - 4; p++) {
        const x = horizontal ? p : cross, y = horizontal ? cross : p;
        if (x < 0 || x >= raster.width || y < 0 || y >= raster.height) continue;
        const i = (y * raster.width + x) * 4, rgb = [data[i], data[i + 1], data[i + 2]];
        const ink = data[i + 3] > 200 && Math.max(...rgb) - Math.min(...rgb) < 20 && (rgb[0] + rgb[1] + rgb[2]) / 3 < 200;
        if (ink === prior) length++; else { if (prior !== null) runs.push({ ink: prior, length }); prior = ink; length = 1; }
      }
      runs.push({ ink: prior, length });
      const inner = runs.slice(1, -1), on = inner.filter(r => r.ink && r.length >= 2).map(r => r.length), off = inner.filter(r => !r.ink).map(r => r.length);
      if (on.length < 4 || off.length < 4) continue;
      const dash = median(on), gap = median(off);
      if (dash < 2 || gap < 2 || dash > 25 || gap > 25 || on.filter(n => Math.abs(n - dash) <= 2).length / on.length < .8 || off.filter(n => Math.abs(n - gap) <= 2).length / off.length < .8) continue;
      rows.push({ offset, dash, gap, count: Math.min(on.length, off.length) });
    }
    if (!rows.length) continue;
    const best = rows.sort((a, b) => b.count - a.count)[0], factor = 70 / box.w;
    a.dashLength = best.dash * factor; a.dashGap = best.gap * factor;
    marks.push({ annotationId: a.id, dashPx: best.dash, gapPx: best.gap, measuredRepeats: best.count });
  }
  return { plan: marks.length ? next : plan, applied: marks.length > 0, measurements: marks };
}

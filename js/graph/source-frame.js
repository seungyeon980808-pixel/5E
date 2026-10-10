// A frame correction is supported only by four continuous, thin, neutral border
// strokes at the supplied source plot box. No plot geometry or axes are moved.
export const SOURCE_FRAME_VERSION = 'source-frame-v1';

export function matchSourceFrame(plan, raster) {
  const box = plan?.source?.plotBox, data = raster?.dataRGBA ?? raster?.data;
  const measurements = [];
  const unchanged = reason => ({ plan, applied: false, measurements, reason, version: SOURCE_FRAME_VERSION });
  if (!box || !raster || raster.width !== plan.source.width || raster.height !== plan.source.height || data?.length !== raster.width * raster.height * 4) return unchanged('source-raster-unavailable');
  if (![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.w < 40 || box.h < 40 || box.x < 3 || box.y < 3 || box.x + box.w > raster.width - 3 || box.y + box.h > raster.height - 3) return unchanged('invalid-plot-box');
  if (!plan.axes?.x || !plan.axes?.y || !plan.series?.length) return unchanged('graph-context-unavailable');
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const ink = (x, y) => {
    if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return null;
    const i = (y * raster.width + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
    const level = (r + g + b) / 3;
    return data[i + 3] >= 240 && Math.max(r, g, b) - Math.min(r, g, b) <= 18 && level <= 180 ? level : null;
  };
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const vertical = side === 'left' || side === 'right';
    const expected = vertical ? box.x + (side === 'right' ? box.w : 0) : box.y + (side === 'bottom' ? box.h : 0);
    const start = Math.ceil((vertical ? box.y : box.x) + 5), end = Math.floor((vertical ? box.y + box.h : box.x + box.w) - 5);
    const sample = position => {
      let count = 0, gap = 0, maxGap = 0; const bins = Array.from({ length: 8 }, () => ({ ink: 0, count: 0 })), levels = [];
      for (let q = start; q <= end; q++) {
        const bin = bins[Math.min(7, Math.floor((q - start) / (end - start + 1) * 8))]; bin.count++;
        const level = ink(vertical ? position : q, vertical ? q : position);
        if (level !== null) { count++; bin.ink++; levels.push(level); gap = 0; } else { gap++; maxGap = Math.max(maxGap, gap); }
      }
      return { positionPx: position, coverage: count / (end - start + 1), maxGapPx: maxGap, bins: bins.map(b => b.ink / b.count), strokeLevel: levels.length ? median(levels) : null };
    };
    const candidates = [];
    for (let position = Math.round(expected) - 2; position <= Math.round(expected) + 2; position++) {
      const observed = sample(position);
      if (observed.coverage >= .96 && observed.maxGapPx <= 3 && observed.bins.every(c => c >= .9)) candidates.push(observed);
    }
    if (!candidates.length) return unchanged(`missing-continuous-${side}-border`);
    candidates.sort((a, b) => b.coverage - a.coverage || Math.abs(a.positionPx - expected) - Math.abs(b.positionPx - expected));
    const best = candidates[0];
    // A filled band, broad experimental object or parallel strokes cannot be
    // accepted as one thin border. Crossings at isolated grid lines are fine.
    let low = best.positionPx, high = best.positionPx;
    while (sample(low - 1).coverage >= .85 && best.positionPx - low < 5) low--;
    while (sample(high + 1).coverage >= .85 && high - best.positionPx < 5) high++;
    if (high - low + 1 > 4 || sample(low - 4).coverage > .25 || sample(high + 4).coverage > .25) return unchanged(`ambiguous-${side}-border-width`);
    measurements.push({ side, expectedPx: expected, ...best, widthPx: high - low + 1 });
  }
  if (Math.max(...measurements.map(m => m.strokeLevel)) - Math.min(...measurements.map(m => m.strokeLevel)) > 35) return unchanged('border-styles-inconsistent');
  const side = name => measurements.find(m => m.side === name).positionPx;
  // Four unrelated long curves/central axes must not qualify: they must close
  // at the four measured corners of the actual plot boundary.
  for (const [x, y, dx, dy] of [[side('left'), side('top'), 1, 1], [side('right'), side('top'), -1, 1], [side('left'), side('bottom'), 1, -1], [side('right'), side('bottom'), -1, -1]]) {
    let horizontalJoin = 0, verticalJoin = 0;
    for (let distance = 0; distance <= 6; distance++) {
      if ([-1, 0, 1].some(offset => ink(x + dx * distance, y + offset) !== null)) horizontalJoin++;
      if ([-1, 0, 1].some(offset => ink(x + offset, y + dy * distance) !== null)) verticalJoin++;
    }
    if (horizontalJoin < 5 || verticalJoin < 5) return unchanged('border-corners-disconnected');
  }
  if (plan.frame?.variant === 'box') return unchanged('source-box-already-preserved');
  // Changing the variant changes omitted arrow defaults in the renderer. Avoid
  // that behavior change unless the plan has explicit settings to preserve.
  if (typeof plan.frame?.arrowX !== 'boolean' || typeof plan.frame?.arrowY !== 'boolean' || plan.axes.y2 && typeof plan.frame?.arrowY2 !== 'boolean') return unchanged('arrow-settings-ambiguous');
  const next = structuredClone(plan);
  next.frame = { ...next.frame, variant: 'box' };
  return { plan: next, applied: true, measurements, reason: 'four-source-borders-confirmed', arrowSettingsPreserved: true, version: SOURCE_FRAME_VERSION };
}

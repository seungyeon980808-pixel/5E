// Bounded source measurement. Only a symmetric, tapering head distinct from
// the shaft is accepted; missing/ambiguous ink leaves the supplied style intact.
export const SOURCE_ARROW_SIZE_VERSION = 'source-axis-arrow-size-v1';

export async function decodeGraphSourceRaster(dataUrl, source) {
  if (typeof Image === 'undefined' || typeof document === 'undefined' || source.width * source.height > 12_000_000) return null;
  try {
    const image = new Image(); image.src = dataUrl; await image.decode();
    if (image.naturalWidth !== source.width || image.naturalHeight !== source.height) return null;
    const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
  } catch { return null; }
}

export function matchSourceAxisArrowSize(plan, raster) {
  const box = plan?.source?.plotBox, frame = plan.frame || {};
  const unchanged = reason => ({ plan, measurements: [], applied: false, reason });
  if (!box || !raster || raster.width !== plan.source.width || raster.height !== plan.source.height || raster.data?.length !== raster.width * raster.height * 4) return unchanged('source-raster-unavailable');
  const axisFraction = key => {
    const placement = plan.axisPlacement?.[key];
    if (placement?.mode === 'fraction') return placement.value;
    return frame.variant === 'quadrant' ? 0 : null;
  };
  const x = axisFraction('y'), y = axisFraction('x');
  const enabled = key => frame[key] ?? (frame.variant !== 'box');
  const candidates = [
    { axis: 'x', horizontal: true, center: box.y + (1 - y) * box.h, tip: box.x + box.w, visible: y !== null && enabled('arrowX') },
    { axis: 'y', horizontal: false, center: box.x + x * box.w, tip: -box.y, visible: x !== null && enabled('arrowY') },
    { axis: 'y2', horizontal: false, center: box.x + box.w, tip: -box.y, visible: !!plan.axes.y2 && enabled('arrowY2') },
  ].filter(a => a.visible);
  if (!candidates.length) return unchanged('no-measurable-axis-arrows');
  const radius = Math.max(6, Math.min(32, box.w * .04));
  const reach = Math.max(12, Math.min(80, box.w * .12));
  const margin = Math.max(4, Math.min(20, box.w * .04));
  const ink = (px, py) => {
    if (px < 0 || py < 0 || px >= raster.width || py >= raster.height) return false;
    const i = (py * raster.width + px) * 4, d = raster.data;
    return d[i + 3] >= 128 && .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2] <= 140;
  };
  const measurements = [];
  for (const a of candidates) {
    const rows = [];
    for (let t = Math.floor(a.tip - reach); t <= Math.ceil(a.tip + margin); t++) {
      const pixels = [];
      for (let c = Math.floor(a.center - radius); c <= Math.ceil(a.center + radius); c++) if (ink(a.horizontal ? t : c, a.horizontal ? c : -t)) pixels.push(c);
      const min = pixels[0], max = pixels.at(-1);
      const centered = pixels.some(c => Math.abs(c - a.center) <= 1.5);
      const symmetric = pixels.length && Math.abs((min + max) / 2 - a.center) <= 1.5;
      rows.push({ t, width: symmetric && centered ? max - min + 1 : 0, centered });
    }
    const widths = rows.map(r => r.width).filter(w => w > 0).sort((a, b) => a - b);
    const shaft = widths[Math.floor(widths.length * .2)] || 0;
    const peak = rows.reduce((p, r, i) => r.width > rows[p].width ? i : p, 0);
    if (!shaft || rows[peak].width < Math.max(5, shaft * 2.2) || rows[peak].width >= radius * 1.8) return unchanged('head-not-distinct-from-shaft');
    const threshold = Math.max(shaft + 2, shaft * 1.6);
    let start = peak, end = peak;
    while (start > 0 && rows[start - 1].width > threshold) start--;
    while (end + 1 < rows.length && rows[end + 1].centered) end++;
    const lengthPx = rows[end].t - rows[start].t + 1, widthPx = rows[peak].width;
    const taper = rows.slice(peak + 1, end + 1).every((r, i) => r.width <= rows[peak + i].width + 2);
    if (!taper || end === rows.length - 1 || Math.abs(rows[end].t - a.tip) > margin || lengthPx < 5 || lengthPx > reach || lengthPx < widthPx * .75) return unchanged('head-boundary-ambiguous');
    measurements.push({ axis: a.axis, lengthPx, widthPx, tipOffsetPx: rows[end].t - a.tip });
  }
  // The existing editor has shared axis-head dimensions. Do not invent a common
  // size when the source visibly uses different heads on its axes.
  for (const key of ['lengthPx', 'widthPx']) {
    const sizes = measurements.map(m => m[key]);
    if (Math.max(...sizes) / Math.min(...sizes) > 1.25) return unchanged('axis-head-sizes-differ');
  }
  const mean = key => measurements.reduce((sum, m) => sum + m[key], 0) / measurements.length;
  const next = structuredClone(plan);
  next.frame = { ...frame, arrowLength: mean('lengthPx') * 70 / box.w, arrowWidth: mean('widthPx') * 70 / box.w };
  return { plan: next, measurements, applied: true, version: SOURCE_ARROW_SIZE_VERSION };
}

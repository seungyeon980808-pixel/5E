/* Shape-preserving cubic handles. Offsets share the input coordinate system.
 * Each monotone-x run is interpolated independently. Vertical segments, explicit
 * lines and breaks never borrow a tangent from their neighbours. */
export function shapePreservingHandles(points, segmentModes = [], breaks = []) {
  const h = points.map(() => ({ ix: 0, iy: 0, ox: 0, oy: 0 }));
  const cut = new Set(breaks);
  const valid = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const eligible = i => i < points.length - 1 && !cut.has(i + 1) && segmentModes[i] !== 'line' && valid(points[i]) && valid(points[i + 1]) && points[i + 1].x !== points[i].x;
  // Default straight controls also make unsupported/vertical spans safe.
  for (let i = 0; i < points.length - 1; i++) {
    if (cut.has(i + 1) || !valid(points[i]) || !valid(points[i + 1])) continue;
    const dx = (points[i + 1].x - points[i].x) / 3, dy = (points[i + 1].y - points[i].y) / 3;
    Object.assign(h[i], { ox: dx, oy: dy }); Object.assign(h[i + 1], { ix: -dx, iy: -dy });
  }
  for (let start = 0; start < points.length - 1;) {
    if (!eligible(start)) { start++; continue; }
    const direction = Math.sign(points[start + 1].x - points[start].x);
    let end = start + 1;
    while (eligible(end) && Math.sign(points[end + 1].x - points[end].x) === direction) end++;
    const widths = [], slopes = [];
    for (let i = start; i < end; i++) { widths.push(Math.abs(points[i + 1].x - points[i].x)); slopes.push((points[i + 1].y - points[i].y) / widths.at(-1)); }
    const m = [slopes[0]];
    for (let j = 1; j < slopes.length; j++) {
      const a = slopes[j - 1], b = slopes[j], w1 = 2 * widths[j] + widths[j - 1], w2 = widths[j] + 2 * widths[j - 1];
      m[j] = a * b <= 0 ? 0 : (w1 + w2) / (w1 / a + w2 / b);
    }
    m[slopes.length] = slopes.at(-1);
    for (let j = 0; j < slopes.length; j++) {
      const i = start + j, dx = direction * widths[j] / 3;
      Object.assign(h[i], { ox: dx, oy: m[j] * widths[j] / 3 });
      Object.assign(h[i + 1], { ix: -dx, iy: -m[j + 1] * widths[j] / 3 });
    }
    start = end;
  }
  return h;
}
export const handlesOffsets = shapePreservingHandles;

// Position and unnormalised tangent at t on an editable span.
export function sampleShapeSegment(points, handles, segmentIndex, t, segmentModes = []) {
  const a = points[segmentIndex], b = points[segmentIndex + 1];
  if (!a || !b || !Number.isFinite(t)) return null;
  t = Math.max(0, Math.min(1, t));
  if (segmentModes[segmentIndex] === 'line' || !handles?.[segmentIndex] || !handles?.[segmentIndex + 1]) return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: b.x - a.x, dy: b.y - a.y };
  const ah = handles[segmentIndex], bh = handles[segmentIndex + 1], u = 1 - t;
  const c = { x: a.x + ah.ox, y: a.y + ah.oy }, d = { x: b.x + bh.ix, y: b.y + bh.iy };
  const result = {};
  for (const k of ['x', 'y']) {
    result[k] = u ** 3 * a[k] + 3 * u * u * t * c[k] + 3 * u * t * t * d[k] + t ** 3 * b[k];
    result[`d${k}`] = 3 * u * u * (c[k] - a[k]) + 6 * u * t * (d[k] - c[k]) + 3 * t * t * (b[k] - d[k]);
  }
  return result;
}

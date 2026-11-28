function validate(width, height, points) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > 16000000)
    throw new RangeError('지울 이미지 크기가 지원 범위를 벗어났습니다.');
  if (!Array.isArray(points) || !points.length || points.length > 4096 || points.some(p => !Number.isFinite(p?.x) || !Number.isFinite(p?.y)))
    throw new TypeError('지우개 경로를 확인하세요.');
}

// Coordinates may lie outside the image. Clip the raster mask, not the path:
// clamping a stroke would erase an edge the pointer never crossed.
export function rectanglePixelMask(width, height, points) {
  validate(width, height, points);
  const a = points[0], b = points.at(-1), mask = new Uint8Array(width * height);
  const x0 = Math.max(0, Math.ceil(Math.min(a.x, b.x) - .5)), x1 = Math.min(width, Math.ceil(Math.max(a.x, b.x) - .5));
  const y0 = Math.max(0, Math.ceil(Math.min(a.y, b.y) - .5)), y1 = Math.min(height, Math.ceil(Math.max(a.y, b.y) - .5));
  if (x1 > x0) for (let y = y0; y < y1; y++) mask.fill(1, y * width + x0, y * width + x1);
  return mask;
}

export function brushPixelMask(width, height, points, diameter) {
  validate(width, height, points);
  if (!Number.isFinite(diameter) || diameter <= 0 || diameter > 32000) throw new RangeError('지우개 굵기를 확인하세요.');
  const mask = new Uint8Array(width * height), radius = diameter / 2;
  // A capsule is the union of a segment's rotated rectangle and round caps.
  // Scan only intersecting rows; long diagonal strokes do not visit their whole
  // bounding box, and overlapping samples cannot erase extra pixels.
  for (let i = 0; i < Math.max(1, points.length - 1); i++) {
    const a = points[i], b = points[Math.min(i + 1, points.length - 1)], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    const nx = length ? -dy / length * radius : 0, ny = length ? dx / length * radius : 0;
    const corners = [{x:a.x+nx,y:a.y+ny},{x:b.x+nx,y:b.y+ny},{x:b.x-nx,y:b.y-ny},{x:a.x-nx,y:a.y-ny}];
    const y0 = Math.max(0, Math.ceil(Math.min(a.y, b.y) - radius - .5)), y1 = Math.min(height - 1, Math.floor(Math.max(a.y, b.y) + radius - .5));
    for (let y = y0; y <= y1; y++) {
      const scan = y + .5, xs = [];
      for (const p of [a,b]) {
        const delta = scan - p.y;
        if (Math.abs(delta) <= radius) { const reach = Math.sqrt(Math.max(0, radius * radius - delta * delta)); xs.push(p.x - reach, p.x + reach); }
      }
      if (length) for (let j = 0; j < 4; j++) {
        const p = corners[j], q = corners[(j + 1) % 4];
        if ((p.y <= scan && scan <= q.y) || (q.y <= scan && scan <= p.y)) {
          if (p.y === q.y) xs.push(p.x, q.x);
          else xs.push(p.x + (scan - p.y) * (q.x - p.x) / (q.y - p.y));
        }
      }
      if (!xs.length) continue;
      const left = Math.max(0, Math.ceil(Math.min(...xs) - .5)), right = Math.min(width, Math.floor(Math.max(...xs) - .5) + 1);
      if (right > left) mask.fill(1, y * width + left, y * width + right);
    }
  }
  return mask;
}

// 11-26 사각 지우개 끝: 축에 맞춘 정사각형을 경로를 따라 끈 자리. 한 구간의 자국은 두 끝 정사각형의 볼록 껍질(최대 육각형)이다.
export function squareBrushSegments(points, diameter) {
  const h = diameter / 2, out = [];
  for (let i = 0; i < Math.max(1, points.length - 1); i++) {
    const a = points[i], b = points[Math.min(i + 1, points.length - 1)];
    const corners = [];
    for (const p of [a, b]) corners.push({x:p.x-h,y:p.y-h},{x:p.x+h,y:p.y-h},{x:p.x+h,y:p.y+h},{x:p.x-h,y:p.y+h});
    out.push(convexHull(corners));
  }
  return out;
}
function convexHull(points) {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y), cross = (o, a, b) => (a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
export function squareBrushPixelMask(width, height, points, diameter) {
  validate(width, height, points);
  if (!Number.isFinite(diameter) || diameter <= 0 || diameter > 32000) throw new RangeError('지우개 굵기를 확인하세요.');
  const mask = new Uint8Array(width * height);
  for (const poly of squareBrushSegments(points, diameter)) {
    const ys = poly.map(p => p.y), y0 = Math.max(0, Math.ceil(Math.min(...ys) - .5)), y1 = Math.min(height - 1, Math.floor(Math.max(...ys) - .5));
    for (let y = y0; y <= y1; y++) {
      const scan = y + .5, xs = [];
      for (let j = 0; j < poly.length; j++) {
        const p = poly[j], q = poly[(j + 1) % poly.length];
        if ((p.y <= scan && scan <= q.y) || (q.y <= scan && scan <= p.y)) {
          if (p.y === q.y) xs.push(p.x, q.x); else xs.push(p.x + (scan - p.y) * (q.x - p.x) / (q.y - p.y));
        }
      }
      if (!xs.length) continue;
      const left = Math.max(0, Math.ceil(Math.min(...xs) - .5)), right = Math.min(width, Math.floor(Math.max(...xs) - .5) + 1);
      if (right > left) mask.fill(1, y * width + left, y * width + right);
    }
  }
  return mask;
}

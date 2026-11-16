// Pixel-center, even/odd scan conversion. Geometry is the selected bitmap's
// coordinate space, never the main canvas or another image's dimensions.
export function polygonPixelMask(width, height, polygon) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0
    || width * height > 16000000) throw new RangeError('지울 이미지 크기가 지원 범위를 벗어났습니다.');
  if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 4096
    || polygon.some(p => !Number.isFinite(p?.x) || !Number.isFinite(p?.y))) throw new TypeError('닫힌 지우기 영역을 지정하세요.');
  const points = polygon.map(p => ({ x: Math.max(0, Math.min(width, p.x)), y: Math.max(0, Math.min(height, p.y)) }));
  const mask = new Uint8Array(width * height);
  const first = Math.max(0, Math.ceil(Math.min(...points.map(p => p.y)) - .5));
  const last = Math.min(height - 1, Math.floor(Math.max(...points.map(p => p.y)) - .5));
  for (let y = first; y <= last; y++) {
    const line = y + .5, xs = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[j], b = points[i];
      if ((a.y > line) !== (b.y > line)) xs.push(a.x + (line - a.y) * (b.x - a.x) / (b.y - a.y));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const left = Math.max(0, Math.ceil(xs[i] - .5));
      const right = Math.min(width, Math.ceil(xs[i + 1] - .5));
      if (right > left) mask.fill(1, y * width + left, y * width + right);
    }
  }
  return mask;
}


// 11-26 시안 v6 「자르기 → 조각 분리」: 그린 닫힌 영역의 그림을 떼어 따로 옮길 수 있는 조각으로 만든다.
// 조각은 저장 전까지 수정본(draft.pieces)에 따로 두고, 저장·지우개 전에 바탕 그림에 다시 합친다(flattenPieces).

// decode()는 창이 가려져 있으면 끝나지 않을 때가 있어(확인용 앱에서 4초 넘게 멈춤) load 이벤트로 기다린다.
const loadImage = src => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('그림을 읽지 못했습니다.')); img.src = src; });
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const tracePolygon = (g, points) => { g.beginPath(); points.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); };

export function pointInPolygon(points, x, y) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

// 바탕(source, PNG data URL)에서 polygon(그림 픽셀 좌표) 안을 떼어 낸다.
// 조각은 거의 흰 바탕(밝기 245 이상)을 투명하게 해 그림만 옮겨지게 하고, 떼어 낸 자리는 흰색으로 채운다(시험지 종이).
export async function splitPiece(source, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) throw new RangeError('자를 영역을 조금 더 크게 그려 주세요.');
  const img = await loadImage(source), W = img.naturalWidth, H = img.naturalHeight;
  const xs = polygon.map(p => p.x), ys = polygon.map(p => p.y);
  const x = Math.max(0, Math.floor(Math.min(...xs))), y = Math.max(0, Math.floor(Math.min(...ys)));
  const w = Math.min(W, Math.ceil(Math.max(...xs))) - x, h = Math.min(H, Math.ceil(Math.max(...ys))) - y;
  if (w < 2 || h < 2) throw new RangeError('자를 영역을 조금 더 크게 그려 주세요.');
  const piece = canvasOf(w, h), pg = piece.getContext('2d');
  pg.translate(-x, -y); tracePolygon(pg, polygon); pg.clip(); pg.drawImage(img, 0, 0); pg.setTransform(1, 0, 0, 1, 0, 0);
  const pixels = pg.getImageData(0, 0, w, h), d = pixels.data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] && d[i] >= 245 && d[i + 1] >= 245 && d[i + 2] >= 245) d[i + 3] = 0;
    if (d[i + 3] > 8) ink++;
  }
  if (!ink) throw new RangeError('선택한 영역 안에 그림이 없습니다.');
  pg.putImageData(pixels, 0, 0);
  const rest = canvasOf(W, H), rg = rest.getContext('2d');
  rg.drawImage(img, 0, 0); tracePolygon(rg, polygon); rg.fillStyle = '#fff'; rg.fill();
  return { base: rest.toDataURL('image/png'), piece: { x, y, w, h, data: piece.toDataURL('image/png') } };
}

// 저장·지우개·다시 자르기 전에 조각을 바탕에 합친다.
export async function flattenPieces(base, pieces = []) {
  const live = pieces.filter(piece => !piece.deleted);
  if (!live.length) return base;
  const img = await loadImage(base), c = canvasOf(img.naturalWidth, img.naturalHeight), g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  for (const piece of live) g.drawImage(await loadImage(piece.data), piece.x, piece.y, piece.w, piece.h);
  return c.toDataURL('image/png');
}

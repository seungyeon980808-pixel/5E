// AI가 새로 그린 그림을 원본과 같은 비율의 판으로 다시 놓는다(11-07 사용자 「라벨이 지 맘대로 날아다닌다」).
// AI 그림 도구는 원본 비율(예: 5.5:1)을 지키지 않고 정해진 판(3:1·1:1 등)에 여백을 붙여 그린다. 라벨 자리는
// 원본 0~1 좌표로 재어 두었으므로, 판이 바뀌면 라벨이 위아래·좌우로 어긋난다. 그래서 두 그림의 실제 그림 영역
// (원본은 라벨 글자 상자를 뺀 잉크 영역)을 찾아, 새 그림의 그림 영역이 원본 그림 영역 자리에 오도록 원본 비율 판에 다시 그린다.
// 그림 자체는 늘이거나 줄이기만 하고 새로 그리지 않는다. 그림 영역을 못 찾거나 이미 맞으면 원래 그림을 그대로 돌려준다.
const LUMINANCE = 242;   // ai-label-placement-harness의 잉크 기준과 같게
const LABEL_PAD = 0.004; // 라벨 글자 상자 둘레 여유(0~1)
const MIN_INK = 24;      // 이보다 적은 잉크는 그림 영역으로 보지 않음

async function decode(dataUrl, signal) {
  const image = new Image(); image.src = dataUrl; await image.decode();
  if (signal?.aborted) throw new DOMException('작업이 취소되었습니다.', 'AbortError');
  return image;
}

function pixels(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  canvas.width = canvas.height = 0;
  return { width: image.naturalWidth, height: image.naturalHeight, data };
}

// 잉크 영역(0~1). skip 상자(0~1) 안 픽셀은 세지 않는다.
export function inkBounds({ width, height, data }, skip = []) {
  const boxes = skip.map(b => ({ x0: Math.floor((b.x - LABEL_PAD) * width), y0: Math.floor((b.y - LABEL_PAD) * height),
    x1: Math.ceil((b.x + b.w + LABEL_PAD) * width), y1: Math.ceil((b.y + b.h + LABEL_PAD) * height) }));
  let x0 = width, y0 = height, x1 = -1, y1 = -1, count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, a = data[i + 3] / 255;
      const lum = (.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]) * a + 255 * (1 - a);
      if (lum >= LUMINANCE) continue;
      if (boxes.some(b => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1)) continue;
      count++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (count < MIN_INK || x1 <= x0 || y1 <= y0) return null;
  return { x: x0 / width, y: y0 / height, w: (x1 + 1 - x0) / width, h: (y1 + 1 - y0) / height };
}

// 원본 그림 픽셀에서 라벨 글자 높이(0~1, 원본 높이 기준)를 잰다(11-07: AI가 준 상자 높이는 실제 글자보다 작게 잡혀 라벨이 작아졌다).
// 라벨 상자 가로 범위 안에서, 상자 가운데 줄을 포함하는 잉크 줄 덩어리의 높이. 글자 하나짜리 이름 등도 같은 방법.
export async function measureSourceLabelHeights({ sourceDataUrl, labels = [], signal }) {
  const source = await decode(sourceDataUrl, signal), px = pixels(source), { width, height, data } = px;
  const ink = (x, y) => { const i = (y * width + x) * 4, a = data[i + 3] / 255; return (.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]) * a + 255 * (1 - a) < LUMINANCE; };
  const out = [];
  for (const label of labels) {
    const b = label?.typography?.bounds;
    if (!b || String(label.text || '').includes('\n')) continue;
    const x0 = Math.max(0, Math.floor(b.x * width)), x1 = Math.min(width, Math.ceil((b.x + b.w) * width));
    const cy = Math.round((b.y + b.h / 2) * height), reach = Math.ceil(b.h * height * 1.2);
    // 세로선(실·축·상자 옆선)처럼 찾는 범위 위아래로 거의 다 잉크인 세로줄은 글자가 아니므로 뺀다.
    const ya = Math.max(0, cy - reach), yb = Math.min(height, cy + reach), span = Math.max(1, yb - ya);
    const cols = [];
    for (let x = x0; x < x1; x++) { let n = 0; for (let y = ya; y < yb; y++) if (ink(x, y)) n++; if (n < span * .7) cols.push(x); }
    const rowInk = y => { let n = 0; for (const x of cols) if (ink(x, y)) n++; return n; };
    const full = Math.max(1, cols.length);
    const isText = y => { const n = rowInk(y); return n > 0 && n < full * .9; }; // 가로선(꽉 찬 줄)은 글자가 아님
    let top = cy, bottom = cy, gap = 0;
    if (!isText(cy)) { let found = false; for (let d = 1; d <= reach && !found; d++) for (const y of [cy - d, cy + d]) if (y >= 0 && y < height && isText(y)) { top = bottom = y; found = true; break; } if (!found) continue; }
    for (let y = top - 1, g = 0; y >= Math.max(0, cy - reach); y--) { if (isText(y)) { top = y; g = 0; } else if (++g > 2) break; }
    for (let y = bottom + 1, g = 0; y < Math.min(height, cy + reach); y++) { if (isText(y)) { bottom = y; g = 0; } else if (++g > 2) break; }
    out.push({ id: label.id, text: label.text, h: (bottom + 1 - top) / height });
  }
  return out;
}

// 새 그림(candidate)을 원본 비율 판으로. 결과 { data, reframed, transform }.
export async function reframeCandidateToSource({ candidateDataUrl, sourceDataUrl, labels = [], signal }) {
  const [candidate, source] = await Promise.all([decode(candidateDataUrl, signal), decode(sourceDataUrl, signal)]);
  const sourceAspect = source.naturalWidth / source.naturalHeight, candidateAspect = candidate.naturalWidth / candidate.naturalHeight;
  const skip = labels.map(label => label?.typography?.bounds).filter(b => b && ['x', 'y', 'w', 'h'].every(k => Number.isFinite(b[k])));
  const sourceBox = inkBounds(pixels(source), skip), candidateBox = inkBounds(pixels(candidate));
  if (!sourceBox || !candidateBox) return { data: candidateDataUrl, reframed: false, reason: 'ink-bounds-unavailable' };
  // 새 그림 판의 픽셀 크기를 그대로 살려, 그림 영역 폭이 같도록 원본 비율 판 크기를 정한다.
  const contentW = candidateBox.w * candidate.naturalWidth, contentH = candidateBox.h * candidate.naturalHeight;
  const outW = Math.max(1, Math.round(contentW / sourceBox.w));
  const outH = Math.max(1, Math.round(outW / sourceAspect));
  // 그림 영역이 원본과 같은 자리·크기에 오게 가로·세로 배율을 따로 둔다(AI가 비율을 조금 바꿔 그려도 맞춤).
  const sx = (sourceBox.w * outW) / contentW, sy = (sourceBox.h * outH) / contentH;
  const tx = sourceBox.x * outW - candidateBox.x * candidate.naturalWidth * sx;
  const ty = sourceBox.y * outH - candidateBox.y * candidate.naturalHeight * sy;
  const close = Math.abs(candidateAspect - sourceAspect) / sourceAspect < .01
    && Math.abs(sx - 1) < .01 && Math.abs(sy - 1) < .01 && Math.abs(tx) < 1.5 && Math.abs(ty) < 1.5;
  if (close) return { data: candidateDataUrl, reframed: false, reason: 'already-aligned' };
  // 배율이 크게 다르면(그림이 크게 바뀜) 억지로 맞추지 않는다.
  if (!(sx > 0 && sy > 0) || Math.max(sx / sy, sy / sx) > 1.6) return { data: candidateDataUrl, reframed: false, reason: 'content-shape-changed' };
  const canvas = document.createElement('canvas'); canvas.width = outW; canvas.height = outH;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, outW, outH);
  context.imageSmoothingQuality = 'high';
  context.setTransform(sx, 0, 0, sy, tx, ty);
  context.drawImage(candidate, 0, 0);
  const data = canvas.toDataURL('image/png');
  canvas.width = canvas.height = 0;
  if (signal?.aborted) throw new DOMException('작업이 취소되었습니다.', 'AbortError');
  return { data, reframed: true, transform: { sx, sy, tx, ty, outW, outH }, sourceBox, candidateBox };
}

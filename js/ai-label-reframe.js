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

// 11-08 사용자 결정: 「라벨 켬과 끔은 무조건 같은 그림, 그 위에 라벨만 올린다」·「크기를 재고 그 크기를 벗어나지 않게」.
// 그래서 판 맞춤은 라벨 켬·끔과 상관없이 늘 같은 방법으로 하고, 가로·세로를 같은 배율로만 키우거나 줄인다(모양이 바뀌지 않음).
// 원본의 그림 영역(글자 상자는 뺌) 안에 새 그림의 그림 영역이 들어가도록 같은 배율로 맞추고 가운데에 놓는다.
// 판은 원본과 같은 비율이다. 그림 영역을 못 찾으면 새 그림 전체를 원본 비율 판 안에 같은 배율로 넣는다.
export async function fitCandidateToSource({ candidateDataUrl, sourceDataUrl, textBoxes = [], signal }) {
  const [candidate, source] = await Promise.all([decode(candidateDataUrl, signal), decode(sourceDataUrl, signal)]);
  const sourceAspect = source.naturalWidth / source.naturalHeight;
  const skip = textBoxes.filter(b => b && ['x', 'y', 'w', 'h'].every(k => Number.isFinite(b[k])));
  const CW = candidate.naturalWidth, CH = candidate.naturalHeight;
  let sourceBox = inkBounds(pixels(source), skip), candidateBox = inkBounds(pixels(candidate));
  if (!sourceBox || !candidateBox) { sourceBox = { x: 0, y: 0, w: 1, h: 1 }; candidateBox = { x: 0, y: 0, w: 1, h: 1 }; }
  const contentW = candidateBox.w * CW, contentH = candidateBox.h * CH;
  // 판 크기: 새 그림의 해상도를 살리되 원본 비율로.
  let outW = Math.max(1, Math.round(contentW / sourceBox.w)), outH = Math.max(1, Math.round(outW / sourceAspect));
  if (outH * sourceBox.h < contentH * .5) { outH = Math.max(1, Math.round(contentH / sourceBox.h)); outW = Math.max(1, Math.round(outH * sourceAspect)); }
  const s = Math.min((sourceBox.w * outW) / contentW, (sourceBox.h * outH) / contentH);
  const tx = (sourceBox.x + sourceBox.w / 2) * outW - (candidateBox.x * CW + contentW / 2) * s;
  const ty = (sourceBox.y + sourceBox.h / 2) * outH - (candidateBox.y * CH + contentH / 2) * s;
  if (Math.abs(CW / CH - sourceAspect) / sourceAspect < .005 && Math.abs(s - 1) < .005 && Math.abs(tx) < 1 && Math.abs(ty) < 1) {
    return { data: candidateDataUrl, fitted: false, reason: 'already-aligned' };
  }
  const canvas = document.createElement('canvas'); canvas.width = outW; canvas.height = outH;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, outW, outH);
  context.imageSmoothingQuality = 'high';
  context.setTransform(s, 0, 0, s, tx, ty);
  context.drawImage(candidate, 0, 0);
  const data = canvas.toDataURL('image/png');
  canvas.width = canvas.height = 0;
  if (signal?.aborted) throw new DOMException('작업이 취소되었습니다.', 'AbortError');
  return { data, fitted: true, transform: { s, tx, ty, outW, outH } };
}

// (11-08 사용자 결정으로 쓰지 않음 — 그림을 라벨 켤 때만 바꾸게 되므로) 11-08 안전장치(사용자 「라벨이 빠진다」): AI가 원본 글자를 라벨 목록에서 빠뜨리면, 새 그림에서는 그 글자가 지워지고
// 라벨로도 돌아오지 않아 사라졌다(저울 그림 A·B 세 번 중 한 번). 판 비율을 맞춘 뒤 새 그림과 원본은 자리가 같으므로,
// 원본의 글자 크기 잉크 덩어리 중 라벨 상자에 들지 않고 새 그림에서 비어 버린 곳을 찾아 원본 픽셀을 그 자리에 되붙인다.
// 편집은 안 되지만 사라지지는 않는다. 결과 { data, restored:[{x,y,w,h}] } (0~1 원본 좌표).
export async function restoreVanishedText({ candidateDataUrl, sourceDataUrl, labels = [], signal }) {
  const [candidate, source] = await Promise.all([decode(candidateDataUrl, signal), decode(sourceDataUrl, signal)]);
  const src = pixels(source), { width: W, height: H, data } = src, cand = pixels(candidate);
  const inkAt = (d, w, x, y) => { const i = (y * w + x) * 4, a = d[i + 3] / 255; return (.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]) * a + 255 * (1 - a) < LUMINANCE; };
  // 글자는 획이 붙어 있지 않으므로 2px 넓혀 한 덩어리로 본다.
  const ink = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inkAt(data, W, x, y)) ink[y * W + x] = 1;
  const grown = new Uint8Array(W * H), R = Math.max(1, Math.round(Math.min(W, H) * .006));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ink[y * W + x]) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < H && xx >= 0 && xx < W) grown[yy * W + xx] = 1; }
  const seen = new Uint8Array(W * H), boxes = [];
  for (let s = 0; s < W * H; s++) {
    if (!grown[s] || seen[s]) continue;
    let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0; const stack = [s]; seen[s] = 1;
    while (stack.length) { const p = stack.pop(), x = p % W, y = (p / W) | 0; if (ink[p]) n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - W, p + W]) if (q >= 0 && q < W * H && !seen[q] && grown[q] && Math.abs((q % W) - x) <= 1) { seen[q] = 1; stack.push(q); } }
    const bw = x1 + 1 - x0, bh = y1 + 1 - y0;
    // 글자 크기: 높이 2~12%, 폭 30% 이하, 너무 성기거나(선) 너무 빽빽하지(칠한 면) 않음
    if (bh < H * .02 || bh > H * .12 || bw > W * .3 || bw < 2) continue;
    const fill = n / (bw * bh); if (fill < .06 || fill > .6) continue;
    boxes.push({ x: x0 / W, y: y0 / H, w: bw / W, h: bh / H, n });
  }
  const pad = .01, labelBoxes = labels.map(l => l?.typography?.bounds).filter(Boolean);
  const covered = b => labelBoxes.some(l => b.x < l.x + l.w + pad && b.x + b.w > l.x - pad && b.y < l.y + l.h + pad && b.y + b.h > l.y - pad);
  const CW = cand.width, CH = cand.height, restored = [];
  for (const b of boxes) {
    if (covered(b)) continue;
    let m = 0; const cx0 = Math.floor(b.x * CW), cy0 = Math.floor(b.y * CH), cx1 = Math.ceil((b.x + b.w) * CW), cy1 = Math.ceil((b.y + b.h) * CH);
    for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) if (x >= 0 && y >= 0 && x < CW && y < CH && inkAt(cand.data, CW, x, y)) m++;
    const expected = b.n * (CW * CH) / (W * H);
    if (m < expected * .15) restored.push(b); // 새 그림에서 거의 비었다 → 사라진 글자
  }
  if (!restored.length) return { data: candidateDataUrl, restored };
  const canvas = document.createElement('canvas'); canvas.width = CW; canvas.height = CH;
  const g = canvas.getContext('2d'); g.drawImage(candidate, 0, 0); g.imageSmoothingQuality = 'high';
  for (const b of restored) {
    const e = .004, sx = Math.max(0, b.x - e), sy = Math.max(0, b.y - e), sw = Math.min(1 - sx, b.w + 2 * e), sh = Math.min(1 - sy, b.h + 2 * e);
    g.fillStyle = '#fff'; g.fillRect(sx * CW, sy * CH, sw * CW, sh * CH);
    g.drawImage(source, sx * W, sy * H, sw * W, sh * H, sx * CW, sy * CH, sw * CW, sh * CH);
  }
  const out = canvas.toDataURL('image/png'); canvas.width = canvas.height = 0;
  return { data: out, restored: restored.map(({ n, ...b }) => b) };
}

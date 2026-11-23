// 11-23 앱 반영 후보(생성 3차 우승안 「여러 장면 한 장 + 2배 키우기」): 그림 엔진 fix.multiCombined·fix.multiUpscale에 넣는 AI 없는 도구.
//  - splitPanels: 여러 장면을 한 장에 나란히 그린 그림을 세로 흰 틈에서 n칸으로 자른다(칸마다 같은 세로 범위 → 배율 유지).
//  - upscaleClean: 선화용 깨끗한 키우기(흰 바탕에 얹은 회색 → 바이큐빅 ×f → 약한 선명화 → 거의 흰 곳은 흰색).
// 실험 실행기(run/c2-tools.mjs splitPanels·run/c3-tools.mjs upscaleClean, pngjs 판)와 같은 셈을 픽셀 배열로 옮겼다 — 검사가 픽셀 일치를 본다.
// 픽셀 판(…Rgba)은 node·브라우저 어디서나, dataUrl 판은 브라우저 canvas가 있을 때만 쓴다. 칸 수가 안 맞으면 빈 배열(엔진이 장면마다 따로 그림).

const grayOf = (rgba, n) => {
  const g = new Float32Array(n);
  for (let i = 0, k = 0; k < n; k++, i += 4) { const a = rgba[i + 3] / 255; g[k] = ((rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3) * a + 255 * (1 - a); }
  return g;
};

/** 칸 자르기(픽셀 판). @returns {{ x: number, y: number, width: number, height: number }[]} 칸 상자(못 자르면 []). */
export function splitPanelBoxes(rgba, W, H, n) {
  if (!(n >= 2) || !W || !H) return [];
  const g = grayOf(rgba, W * H);
  const col = new Int32Array(W), row = new Int32Array(H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y * W + x] < 200) { col[x]++; row[y]++; }
  let L = 0, R = W - 1; while (L < W && col[L] === 0) L++; while (R > 0 && col[R] === 0) R--;
  let T = 0, B = H - 1; while (T < H && row[T] === 0) T++; while (B > 0 && row[B] === 0) B--;
  if (L >= R) return [];
  const gaps = []; let s = -1;
  for (let x = L; x <= R + 1; x++) { const white = x <= R && col[x] <= 1; if (white && s < 0) s = x; if (!white && s >= 0) { gaps.push({ s, e: x - 1, w: x - s }); s = -1; } }
  const minW = Math.max(6, Math.round(W * 0.012));
  const cand = gaps.filter((q) => q.w >= minW).sort((a, b) => b.w - a.w).slice(0, n - 1).sort((a, b) => a.s - b.s);
  if (cand.length !== n - 1) return [];
  const cuts = [L, ...cand.map((q) => Math.round((q.s + q.e) / 2)), R + 1];
  const mY = Math.round(H * 0.03); const y0 = Math.max(0, T - mY), y1 = Math.min(H, B + 1 + mY);
  const out = [];
  for (let i = 0; i < n; i++) {
    let a = cuts[i], b = cuts[i + 1]; while (a < b && col[a] === 0) a++; while (b > a && col[b - 1] === 0) b--;
    const mX = Math.round((y1 - y0) * 0.06); const x0 = Math.max(0, a - mX), x1 = Math.min(W, b + mX);
    if (x1 - x0 < 20) return [];
    out.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
  }
  return out;
}

/** 상자대로 픽셀 잘라 내기. */
export function cropRgba(rgba, W, box) {
  const out = new Uint8ClampedArray(box.width * box.height * 4);
  for (let y = 0; y < box.height; y++) {
    const from = ((box.y + y) * W + box.x) * 4;
    out.set(rgba.subarray(from, from + box.width * 4), y * box.width * 4);
  }
  return out;
}

const cubic = (t) => { const a = -0.5, x = Math.abs(t); return x <= 1 ? (a + 2) * x ** 3 - (a + 3) * x ** 2 + 1 : x < 2 ? a * x ** 3 - 5 * a * x ** 2 + 8 * a * x - 4 * a : 0; };

/** 선화용 깨끗한 키우기(픽셀 판). @returns {{ data: Uint8ClampedArray, width: number, height: number }} */
export function upscaleCleanRgba(rgba, W, H, f = 2) {
  const g = grayOf(rgba, W * H);
  const w = Math.round(W * f), h = Math.round(H * f);
  const tmp = new Float32Array(w * H);
  for (let x = 0; x < w; x++) {
    const sx = (x + 0.5) / f - 0.5, x0 = Math.floor(sx); const wt = [cubic(sx - (x0 - 1)), cubic(sx - x0), cubic(sx - (x0 + 1)), cubic(sx - (x0 + 2))];
    for (let y = 0; y < H; y++) { let s = 0; for (let k = 0; k < 4; k++) { const xx = Math.min(W - 1, Math.max(0, x0 - 1 + k)); s += wt[k] * g[y * W + xx]; } tmp[y * w + x] = s; }
  }
  const o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = (y + 0.5) / f - 0.5, y0 = Math.floor(sy); const wt = [cubic(sy - (y0 - 1)), cubic(sy - y0), cubic(sy - (y0 + 1)), cubic(sy - (y0 + 2))];
    for (let x = 0; x < w; x++) { let s = 0; for (let k = 0; k < 4; k++) { const yy = Math.min(H - 1, Math.max(0, y0 - 1 + k)); s += wt[k] * tmp[yy * w + x]; } o[y * w + x] = s; }
  }
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w) { s += o[yy * w + xx]; n++; } }
    let v = o[y * w + x] + 0.6 * (o[y * w + x] - s / n); if (v > 238) v = 255; v = Math.max(0, Math.min(255, Math.round(v)));
    const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}

// ── 브라우저(canvas) 판: dataUrl ↔ 픽셀 ──
async function decode(dataUrl) {
  const image = new Image(); image.src = dataUrl; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  try { const c = canvas.getContext('2d'); c.drawImage(image, 0, 0); return { data: c.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height }; }
  finally { canvas.width = 0; canvas.height = 0; }
}
function encode(data, width, height) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  try { canvas.getContext('2d').putImageData(new ImageData(data, width, height), 0, 0); return canvas.toDataURL('image/png'); }
  finally { canvas.width = 0; canvas.height = 0; }
}

/** 엔진 splitPanels(dataUrl, n) → dataUrl[] (못 자르면 []). */
export async function splitPanelsDataUrl(dataUrl, n) {
  const p = await decode(dataUrl);
  return splitPanelBoxes(p.data, p.width, p.height, n).map((box) => encode(cropRgba(p.data, p.width, box), box.width, box.height));
}
/** 엔진 upscale(dataUrl, f) → dataUrl. */
export async function upscaleCleanDataUrl(dataUrl, f = 2) {
  const p = await decode(dataUrl);
  const u = upscaleCleanRgba(p.data, p.width, p.height, f);
  return encode(u.data, u.width, u.height);
}

/** canvas가 있는 곳(설치판·브라우저)에서만 엔진에 넣을 도구. 없으면 null(엔진이 장면마다 따로 그림). */
export function figurePanelTools() {
  if (typeof document === 'undefined' || typeof Image !== 'function' || typeof ImageData !== 'function') return null;
  return { splitPanels: splitPanelsDataUrl, upscale: upscaleCleanDataUrl };
}

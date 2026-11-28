// 11-23 앱 반영 후보(생성 3차 우승안 「여러 장면 한 장 + 2배 키우기」): 그림 엔진 fix.multiCombined·fix.multiUpscale에 넣는 AI 없는 도구.
//  - splitPanels: 여러 장면을 한 장에 나란히 그린 그림을 세로 흰 틈에서 n칸으로 자른다(칸마다 같은 세로 범위 → 배율 유지).
//  - upscaleClean: 선화용 깨끗한 키우기(흰 바탕에 얹은 회색 → 바이큐빅 ×f → 약한 선명화 → 거의 흰 곳은 흰색).
// 실험 실행기(run/c2-tools.mjs splitPanels·run/c3-tools.mjs upscaleClean, pngjs 판)와 같은 셈을 픽셀 배열로 옮겼다 — 검사가 픽셀 일치를 본다.
// 1.7.3(E): 큰 검은 칠을 연회색으로(softenSolidFillsRgba), 선 두께를 지키는 키우기(upscaleLineRgba), 흰 종이에 얹어 읽기, 칸 그림 지시(panelSheetRequest).
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

// ── 1.7.3(E) 여러 장 칸 그림 고침 ──

/** 한 장에 여러 칸을 그리게 하는 지시(옛 combinedPanelsRequest를 고친 판). 칸을 가득 채워 크게, 글자는 작게, 어두운 면은 연회색, 칸 이름 글자 없음. */
export function panelSheetRequest(scenes) {
  const n = scenes.length;
  return `한 장의 가로로 긴 그림에 다음 ${n}개 그림을 왼쪽에서 오른쪽으로 한 줄로 나란히 그린다(나중에 칸별로 잘라 시험지에 한 장씩 따로 싣는다). `
    + `칸 사이는 넓은 흰 여백(그림 폭의 6% 이상)으로 떼고, 칸을 겹치거나 선·화살표·글자가 칸 사이 여백을 건너가지 않게 한다. 칸 테두리·칸 번호·(가)(나) 같은 이름표·장면 이름(제목) 글자는 넣지 않는다(요청에 적힌 라벨만). `
    + `각 칸의 그림은 칸을 거의 가득 채울 만큼 크게(칸 폭의 85% 안팎) 그리고, 라벨 글자는 그림에 비해 작게(글자 높이가 그림 높이의 4~5% 안팎) 쓴다. `
    + `어둡게 나타낼 넓은 부분(달의 어두운 쪽, 그림자, 밤 쪽 등)은 검게 칠하지 않고 연회색 평면으로 칠한다(요청에 '검은'이라고 한 작은 입자·점은 검게). `
    + `모든 칸은 같은 배율·같은 용기·장치 크기·같은 바닥 높이·선 굵기·글꼴로 그려, 칸끼리 바뀌는 양(부피·높이·개수·모양)이 서로 정확한 비율로 보이게 한다.\n`
    + scenes.map((x, i) => `${i + 1}번째 칸(왼쪽부터): ${x}`).join('\n');
}

/** 요청이 검은 칠을 바라는지(그러면 큰 검은 칠을 그대로 둔다). */
export const wantsBlackFill = (text) => /검은|검게|까만|까맣|검정|흑색/u.test(String(text || ''));

/**
 * 큰 검은 칠(달의 어두운 쪽 등)을 연회색 평면으로(제자리). 가는 선·글자·작은 입자는 그대로 검게 둔다.
 * 검은 덩어리 가운데 안쪽 반지름(rCore)보다 두꺼운 속이 넓게(coreArea) 있는 것만 골라, 가장자리 e화소는 검은 테두리로 남기고 안쪽을 gray로 칠한다.
 * @returns {number} 바꾼 화소 수
 */
export function softenSolidFillsRgba(rgba, W, H, { gray = 190, dark = 100 } = {}) {
  const N = W * H; if (!N) return 0;
  const g = grayOf(rgba, N);
  const m = Math.min(W, H);
  const rCore = Math.max(5, Math.round(m * 0.012)), e = Math.max(2, Math.round(m * 0.0035)), coreArea = Math.round((m * 0.05) ** 2);
  // 거리 변환(3-4 챔퍼, /3 ≈ 화소): 검은 화소에서 가장 가까운 검지 않은 화소까지
  const BIG = 1 << 28; const d = new Int32Array(N);
  for (let k = 0; k < N; k++) d[k] = g[k] < dark ? BIG : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x; if (!d[k]) continue; let v = d[k];
    if (x > 0) v = Math.min(v, d[k - 1] + 3); else v = Math.min(v, 3);
    if (y > 0) { v = Math.min(v, d[k - W] + 3); if (x > 0) v = Math.min(v, d[k - W - 1] + 4); if (x < W - 1) v = Math.min(v, d[k - W + 1] + 4); } else v = Math.min(v, 3);
    d[k] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const k = y * W + x; if (!d[k]) continue; let v = d[k];
    if (x < W - 1) v = Math.min(v, d[k + 1] + 3); else v = Math.min(v, 3);
    if (y < H - 1) { v = Math.min(v, d[k + W] + 3); if (x < W - 1) v = Math.min(v, d[k + W + 1] + 4); if (x > 0) v = Math.min(v, d[k + W - 1] + 4); } else v = Math.min(v, 3);
    d[k] = v;
  }
  // 검은 덩어리(4방향 이음)마다 두꺼운 속 넓이를 센다
  const lab = new Int32Array(N).fill(-1); const keep = []; const stack = new Int32Array(N);
  for (let k0 = 0; k0 < N; k0++) {
    if (!d[k0] || lab[k0] >= 0) continue;
    const id = keep.length; let sp = 0, core = 0; stack[sp++] = k0; lab[k0] = id;
    while (sp) {
      const k = stack[--sp]; if (d[k] >= rCore * 3) core++;
      const x = k % W;
      if (x > 0 && d[k - 1] && lab[k - 1] < 0) { lab[k - 1] = id; stack[sp++] = k - 1; }
      if (x < W - 1 && d[k + 1] && lab[k + 1] < 0) { lab[k + 1] = id; stack[sp++] = k + 1; }
      if (k >= W && d[k - W] && lab[k - W] < 0) { lab[k - W] = id; stack[sp++] = k - W; }
      if (k + W < N && d[k + W] && lab[k + W] < 0) { lab[k + W] = id; stack[sp++] = k + W; }
    }
    keep.push(core >= coreArea);
  }
  if (!keep.some(Boolean)) return 0;
  let changed = 0;
  for (let k = 0; k < N; k++) {
    if (!d[k] || !keep[lab[k]] || d[k] <= e * 3) continue;
    const i = k * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = gray; rgba[i + 3] = 255; changed++;
  }
  return changed;
}

/**
 * 선 두께를 지키는 키우기(픽셀 판): 바이큐빅 ×f 뒤, 둘레 명암 폭이 큰 곳(선 가장자리)만 가운데(50%) 문턱으로 가파르게 해 번짐을 1~2화소로 줄인다.
 * 넓은 회색 평면은 둘레 폭이 작아 그대로. 배율은 f와 「가로 minWidth 이상」 가운데 큰 쪽(최대 4).
 * @returns {{ data: Uint8ClampedArray, width: number, height: number, factor: number }}
 */
export function upscaleLineRgba(rgba, W, H, f = 2, { minWidth = 1000, maxFactor = 4 } = {}) {
  const fac = Math.min(maxFactor, Math.max(f, Math.ceil(minWidth / Math.max(1, W))));
  const g = grayOf(rgba, W * H);
  const w = Math.round(W * fac), h = Math.round(H * fac);
  const tmp = new Float32Array(w * H);
  for (let x = 0; x < w; x++) {
    const sx = (x + 0.5) / fac - 0.5, x0 = Math.floor(sx); const wt = [cubic(sx - (x0 - 1)), cubic(sx - x0), cubic(sx - (x0 + 1)), cubic(sx - (x0 + 2))];
    for (let y = 0; y < H; y++) { let s = 0; for (let k = 0; k < 4; k++) { const xx = Math.min(W - 1, Math.max(0, x0 - 1 + k)); s += wt[k] * g[y * W + xx]; } tmp[y * w + x] = s; }
  }
  const o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = (y + 0.5) / fac - 0.5, y0 = Math.floor(sy); const wt = [cubic(sy - (y0 - 1)), cubic(sy - y0), cubic(sy - (y0 + 1)), cubic(sy - (y0 + 2))];
    for (let x = 0; x < w; x++) { let s = 0; for (let k = 0; k < 4; k++) { const yy = Math.min(H - 1, Math.max(0, y0 - 1 + k)); s += wt[k] * tmp[yy * w + x]; } o[y * w + x] = s; }
  }
  // 둘레(반지름 r) 최소·최대 — 가로·세로 두 번
  const r = Math.max(1, Math.round(fac));
  const mn1 = new Float32Array(w * h), mx1 = new Float32Array(w * h), mn = new Float32Array(w * h), mx = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 255, b = 0; for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; const v = o[y * w + xx]; if (v < a) a = v; if (v > b) b = v; }
    mn1[y * w + x] = a; mx1[y * w + x] = b;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 255, b = 0; for (let dy = -r; dy <= r; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; const k = yy * w + x; if (mn1[k] < a) a = mn1[k]; if (mx1[k] > b) b = mx1[k]; }
    mn[y * w + x] = a; mx[y * w + x] = b;
  }
  const data = new Uint8ClampedArray(w * h * 4);
  for (let k = 0; k < w * h; k++) {
    let v = o[k]; const lo = mn[k], range = mx[k] - lo;
    if (range >= 48) { let t = (v - lo) / range; t = Math.max(0, Math.min(1, (t - 0.5) * 2.4 + 0.5)); v = lo + t * range; }
    if (v > 238) v = 255; v = Math.max(0, Math.min(255, Math.round(v)));
    const i = k * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { data, width: w, height: h, factor: fac };
}

/**
 * dataUrl 도구 묶음(decode/encode만 갈아 끼우면 canvas·pngjs 어디서나 같은 셈).
 * splitPanels(u, n, { softenFills }) → dataUrl[] (못 자르면 []), upscale(u, f, { line }) → dataUrl.
 */
export function makePanelTools({ decode, encode }) {
  return {
    async splitPanels(dataUrl, n, { softenFills = false } = {}) {
      const p = await decode(dataUrl);
      flattenAlpha(p.data);
      if (softenFills) softenSolidFillsRgba(p.data, p.width, p.height);
      const boxes = splitPanelBoxes(p.data, p.width, p.height, n);
      return Promise.all(boxes.map((box) => encode(cropRgba(p.data, p.width, box), box.width, box.height)));
    },
    async upscale(dataUrl, f = 2, { line = true } = {}) {
      const p = await decode(dataUrl);
      const u = line ? upscaleLineRgba(p.data, p.width, p.height, f) : upscaleCleanRgba(p.data, p.width, p.height, f);
      return encode(u.data, u.width, u.height);
    },
  };
}
/** 알파를 흰 종이와 섞어 불투명하게(제자리). */
function flattenAlpha(rgba) {
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3]; if (a === 255) continue; const t = a / 255;
    rgba[i] = Math.round(rgba[i] * t + 255 * (1 - t)); rgba[i + 1] = Math.round(rgba[i + 1] * t + 255 * (1 - t)); rgba[i + 2] = Math.round(rgba[i + 2] * t + 255 * (1 - t)); rgba[i + 3] = 255;
  }
}

// ── 브라우저(canvas) 판: dataUrl ↔ 픽셀 ──
async function decode(dataUrl) {
  const image = new Image(); image.src = dataUrl; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  try { const c = canvas.getContext('2d'); c.fillStyle = '#ffffff'; c.fillRect(0, 0, canvas.width, canvas.height); c.drawImage(image, 0, 0); return { data: c.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height }; }
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
  return makePanelTools({ decode, encode: async (data, width, height) => encode(data, width, height) });
}

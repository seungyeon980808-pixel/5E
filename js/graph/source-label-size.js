// 11-12 밤샘: AI가 어림한 글자 크기(style.fontSizePx)는 그래프마다 들쭉날쭉해서, 어떤 복원은 눈금 숫자가 원본보다
// 훨씬 크게(아래 눈금이 잘림), 어떤 복원은 작게 나왔다. 숫자 눈금은 원본 그림에서 높이를 직접 잴 수 있으므로,
// 축 바깥 눈금 숫자 자리의 잉크 줄 높이를 재고 그 가운데값으로 글자 크기를 바로잡는다.
// 숫자(0-9 . − -)만 잰다: 숫자 높이 ≈ 렌더러가 맞추는 "H0" 높이(source-height 모드)라서 그대로 비교된다.
const LUMINANCE = 200;
const NUMERIC = /^(?:[-−+]?\d+(?:[.,]\d+)?|[가-힣]{1,6})$/; // 숫자, 또는 한글만(렌더러 기준 「가」 높이)
const charW = text => /[가-힣]/.test(text) ? 1.05 : 0.62;
// 정리된 계획은 position 대신 sourcePosition(원본에서 읽은 자리)을 쓴다.
const tickAt = tick => [tick?.sourcePosition, tick?.position].map(Number).find(Number.isFinite);

function inkAt({ width, data }, x, y) {
  const i = (y * width + x) * 4, a = data[i + 3] / 255;
  return (.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]) * a + 255 * (1 - a) < LUMINANCE;
}

// 상자 안 잉크 줄 덩어리(빈 줄 1개까지 이어 봄) 가운데 잉크가 가장 많은 덩어리의 높이(px). 너무 얇은 것은 눈금 표시.
function tallestTextRun(px, box, expected) {
  const x0 = Math.max(0, Math.floor(box.x0)), x1 = Math.min(px.width, Math.ceil(box.x1));
  const y0 = Math.max(0, Math.floor(box.y0)), y1 = Math.min(px.height, Math.ceil(box.y1));
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;
  // 세로로 거의 다 잉크인 열(축·보조선)과 가로로 거의 꽉 찬 줄(가로선)은 글자가 아니다.
  const cols = [];
  for (let x = x0; x < x1; x++) { let n = 0; for (let y = y0; y < y1; y++) if (inkAt(px, x, y)) n++; if (n < (y1 - y0) * .8) cols.push(x); }
  if (!cols.length) return null;
  const rows = [];
  for (let y = y0; y < y1; y++) { let n = 0; for (const x of cols) if (inkAt(px, x, y)) n++; rows.push(n > 0 && n < cols.length * .85 ? n : 0); }
  const runs = []; let start = -1, ink = 0, gap = 0;
  for (let i = 0; i <= rows.length; i++) {
    const n = i < rows.length ? rows[i] : 0;
    if (n) { if (start < 0) { start = i; ink = 0; } ink += n; gap = 0; }
    else if (start >= 0 && ++gap > 1) { runs.push({ h: i - gap + 1 - start, ink, top: start }); start = -1; gap = 0; }
  }
  const plausible = runs.filter(r => r.h >= Math.max(3, expected * .35) && r.h <= expected * 1.6);
  if (!plausible.length) return null;
  plausible.sort((a, b) => b.ink - a.ink);
  // 잘린 덩어리(상자 끝에 닿음)는 믿지 않는다.
  const best = plausible[0];
  if (best.top <= 0 || best.top + best.h >= rows.length) return null;
  return best.h;
}

// px: {width,height,data(RGBA)}. 돌려줌: 잰 숫자 눈금 높이(px) 목록.
export function measureTickLabelHeights(px, plan) {
  const pb = plan?.source?.plotBox, f = Number(plan?.style?.fontSizePx);
  if (!pb || !(pb.w > 0 && pb.h > 0)) return [];
  const expected = Number.isFinite(f) && f > 0 ? f : Math.max(8, pb.h * .06);
  const out = [];
  const xAxisY = pb.y + (1 - (Number(plan.axisPlacement?.x?.value) || 0)) * pb.h;
  const yAxisX = pb.x + (Number(plan.axisPlacement?.y?.value) || 0) * pb.w;
  for (const tick of plan.axes?.x?.ticks || []) {
    const text = String(tick?.label ?? '').trim();
    const at = tickAt(tick); if (!NUMERIC.test(text) || at === undefined) continue;
    const cx = pb.x + at * pb.w, half = expected * (charW(text) * text.length / 2 + 0.6);
    const h = tallestTextRun(px, { x0: cx - half, x1: cx + half, y0: xAxisY + 2, y1: xAxisY + expected * 3.2 }, expected);
    if (h) out.push({ axis: 'x', text, h });
  }
  for (const tick of plan.axes?.y?.ticks || []) {
    const text = String(tick?.label ?? '').trim();
    const at = tickAt(tick); if (!NUMERIC.test(text) || at === undefined) continue;
    const cy = pb.y + (1 - at) * pb.h, w = expected * (charW(text) * text.length + 0.45);
    const h = tallestTextRun(px, { x0: yAxisX - w, x1: yAxisX - 2, y0: cy - expected * 1.3, y1: cy + expected * 1.3 }, expected);
    if (h) out.push({ axis: 'y', text, h });
  }
  return out;
}

// 서로 맞는 잰 값이 2개 이상이면 글자 크기를 잰 가운데값으로(주석 글자도 같은 배율로) 바꾼 새 계획을 돌려준다.
export function calibratePlanLabelSize(plan, px) {
  const all = measureTickLabelHeights(px, plan), digits = all.filter(m => !/[가-힣]/.test(m.text));
  // 한글은 받침 때문에 숫자보다 높게 재지므로, 숫자가 2개 이상이면 숫자만 쓴다.
  const heights = (digits.length >= 2 ? digits : all).map(m => m.h).sort((a, b) => a - b);
  const ai = Number(plan?.style?.fontSizePx);
  const report = { ai: Number.isFinite(ai) ? ai : null, measured: null, count: heights.length, applied: false };
  if (heights.length < 2 || !(ai > 0)) return { plan, report };
  const mid = heights.length >> 1, median = heights.length % 2 ? heights[mid] : (heights[mid - 1] + heights[mid]) / 2;
  report.measured = median;
  // 서로 맞는 값(가운데값 ±15%)이 2개 이상일 때만 믿는다 — 축 제목·곡선이 섞인 값 하나로 바꾸지 않게.
  if (heights.filter(h => Math.abs(h / median - 1) <= .15).length < 2) return { plan, report };
  const factor = median / ai;
  if (factor < .4 || factor > 2.5) return { plan, report };
  // 잰 값은 원본 글자 높이 그대로이므로 그리는 쪽이 1.3배 보정을 하지 않게 표시한다(native-graph.js fontSizeMeasured).
  const next = structuredClone(plan);
  next.style.fontSizePx = median; next.style.fontSizeMeasured = true;
  for (const a of next.annotations || []) if (Number(a.fontSizePx) > 0) a.fontSizePx *= factor;
  report.applied = true; report.factor = factor;
  return { plan: next, report };
}

export async function calibratePlanLabelSizeFromImage(plan, dataUrl) {
  const image = new Image(); image.src = dataUrl; await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  const px = { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
  canvas.width = canvas.height = 0;
  return calibratePlanLabelSize(plan, px);
}

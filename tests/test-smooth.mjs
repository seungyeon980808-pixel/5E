// §2-3 회귀 테스트: 코너 보존 스무딩 + 축 스냅.
//  · 사각/회전사각/삼각 → 직각 보존 closed polyline (curved:false)
//  · 둥근 블롭 → closed curve (curved:true)
//  · 원 → §2-2 ellipse 우선(스무딩 아님)
//  · 회색 사각 → 다단계 경로 회귀(fillLevel 실측 유지)
import { vectorizeImage } from "../js/image-vectorize.js";

function makeImage(w, h) {
  const data = new Uint8Array(w * h * 4).fill(255);
  return {
    width: w, height: h, data,
    set(x, y, g) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = g; data[i + 3] = 255;
    },
  };
}
function fillRect(img, x0, y0, x1, y1, g) {
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) img.set(x, y, g);
}
// 회전 채움 사각형.
function fillRotRect(img, cx, cy, hw, hh, deg, g) {
  const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const R = Math.ceil(Math.hypot(hw, hh)) + 2;
  for (let y = cy - R; y <= cy + R; y += 1) for (let x = cx - R; x <= cx + R; x += 1) {
    const dx = x - cx, dy = y - cy, u = dx * c + dy * s, v = -dx * s + dy * c;
    if (Math.abs(u) <= hw && Math.abs(v) <= hh) img.set(x, y, g);
  }
}
// 채움 삼각형(세 꼭짓점).
function fillTri(img, A, B, C, g) {
  const minx = Math.min(A[0], B[0], C[0]), maxx = Math.max(A[0], B[0], C[0]);
  const miny = Math.min(A[1], B[1], C[1]), maxy = Math.max(A[1], B[1], C[1]);
  const sign = (p, a, b) => (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
  for (let y = miny; y <= maxy; y += 1) for (let x = minx; x <= maxx; x += 1) {
    const p = [x, y], d1 = sign(p, A, B), d2 = sign(p, B, C), d3 = sign(p, C, A);
    const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(neg && pos)) img.set(x, y, g);
  }
}
// 둥근 사각(squircle 유사): |x/a|^p + |y/b|^p <= 1, p=2.6 → 부드러운 곡선, 날카로운 코너 없음.
function fillSquircle(img, cx, cy, a, b, g) {
  for (let y = cy - b - 2; y <= cy + b + 2; y += 1) for (let x = cx - a - 2; x <= cx + a + 2; x += 1) {
    const u = Math.abs((x - cx) / a), v = Math.abs((y - cy) / b);
    if (u ** 2.6 + v ** 2.6 <= 1) img.set(x, y, g);
  }
}
function fillDisk(img, cx, cy, r, g) {
  for (let y = cy - r - 1; y <= cy + r + 1; y += 1) for (let x = cx - r - 1; x <= cx + r + 1; x += 1)
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) img.set(x, y, g);
}

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`); }
  else { fail += 1; console.log(`  ❌ ${name}  ${detail}`); }
};
const opts = { minArea: 40, dilateRadius: 3, textSizePx: 22, epsilon: 1.2 };
const interiorAngle = (P, Q, R) => { // Q 꼭짓점 각도(도)
  const a = [P[0] - Q[0], P[1] - Q[1]], b = [R[0] - Q[0], R[1] - Q[1]];
  const dot = a[0] * b[0] + a[1] * b[1], m = Math.hypot(...a) * Math.hypot(...b) || 1e-9;
  return Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180 / Math.PI;
};

// ── T1: 축정렬 사각형 → polyline 4점, 직각 4개 ──
{
  console.log("T1 축정렬 사각형");
  const img = makeImage(140, 120);
  fillRect(img, 30, 25, 110, 95, 0);
  const { components } = vectorizeImage(img, opts);
  const c = components[0];
  check("ellipse 아님", c && !c.ellipse);
  const loop = c && c.loops && c.loops[0];
  check("curved:false (직각 보존)", loop && loop.curved === false);
  check("정확히 4점", loop && loop.points.length === 4, `pts=${loop && loop.points.length}`);
  if (loop && loop.points.length === 4) {
    const p = loop.points;
    let ok = true;
    for (let i = 0; i < 4; i += 1) {
      const ang = interiorAngle(p[(i + 3) % 4], p[i], p[(i + 1) % 4]);
      if (Math.abs(ang - 90) > 4) ok = false;
    }
    check("네 각 모두 ~90°", ok, JSON.stringify(p));
    const xs = p.map((q) => q[0]).sort((a, b) => a - b), ys = p.map((q) => q[1]).sort((a, b) => a - b);
    check("bbox ≈ (30,25)-(110,95)",
      Math.abs(xs[0] - 30) < 2 && Math.abs(xs[3] - 110) < 2 && Math.abs(ys[0] - 25) < 2 && Math.abs(ys[3] - 95) < 2,
      `xs=${xs} ys=${ys}`);
  }
}

// ── T2: 회전 사각형(28°) → polyline 4점, 직각 보존 ──
{
  console.log("T2 회전 사각형 28°");
  const img = makeImage(180, 160);
  fillRotRect(img, 90, 80, 55, 34, 28, 0);
  const { components } = vectorizeImage(img, opts);
  const c = components[0];
  const loop = c && c.loops && c.loops[0];
  check("ellipse 아님", c && !c.ellipse);
  check("curved:false", loop && loop.curved === false);
  check("정확히 4점", loop && loop.points.length === 4, `pts=${loop && loop.points.length}`);
  if (loop && loop.points.length === 4) {
    let ok = true;
    for (let i = 0; i < 4; i += 1) {
      const ang = interiorAngle(loop.points[(i + 3) % 4], loop.points[i], loop.points[(i + 1) % 4]);
      if (Math.abs(ang - 90) > 5) ok = false;
    }
    check("네 각 모두 ~90° (LS 피팅)", ok, JSON.stringify(loop.points.map((q) => q.map((v) => +v.toFixed(1)))));
  }
}

// ── T3: 삼각형 → polyline 3점 ──
{
  console.log("T3 삼각형");
  const img = makeImage(140, 130);
  fillTri(img, [20, 110], [120, 110], [70, 20], 0);
  const { components } = vectorizeImage(img, opts);
  const loop = components[0] && components[0].loops && components[0].loops[0];
  check("curved:false", loop && loop.curved === false);
  check("정확히 3점", loop && loop.points.length === 3, `pts=${loop && loop.points.length}`);
}

// ── T4: 둥근 블롭(squircle) → closed curve ──
{
  console.log("T4 둥근 블롭 → 곡선");
  const img = makeImage(160, 130);
  fillSquircle(img, 80, 65, 55, 40, 0);
  const { components } = vectorizeImage(img, opts);
  const c = components[0];
  const loop = c && c.loops && c.loops[0];
  check("ellipse 아님(squircle)", c && !c.ellipse);
  check("curved:true (곡선화)", loop && loop.curved === true, `curved=${loop && loop.curved}`);
  check("곡선 제어점 충분(>8)", loop && loop.points.length > 8, `pts=${loop && loop.points.length}`);
}

// ── T5: 원 → §2-2 ellipse 우선(스무딩으로 새지 않음) ──
{
  console.log("T5 원 → ellipse 우선");
  const img = makeImage(120, 120);
  fillDisk(img, 60, 60, 34, 0);
  const { components } = vectorizeImage(img, opts);
  check("ellipse로 판정", components[0] && !!components[0].ellipse);
  check("loops 없음(curve로 안 샘)", components[0] && components[0].loops === undefined);
}

// ── T6: 회색 사각형 → 다단계 회귀(polyline + fillLevel 실측) ──
{
  console.log("T6 회색 사각형 다단계 회귀");
  const img = makeImage(120, 110);
  fillRect(img, 25, 20, 95, 90, 150);
  const { components } = vectorizeImage(img, opts);
  const loop = components[0] && components[0].loops && components[0].loops[0];
  check("curved:false", loop && loop.curved === false);
  check("4점 유지", loop && loop.points.length === 4, `pts=${loop && loop.points.length}`);
  check("fillLevel ~150 실측", loop && Math.abs(loop.fillLevel - 150) <= 8, `fillLevel=${loop && loop.fillLevel}`);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);

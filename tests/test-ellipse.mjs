// §2-2 회귀 테스트: 원/링 → ellipse 피팅, 사각형/찌그러짐 → 폴리곤 폴백.
import { vectorizeImage } from "../js/image-vectorize.js";

function makeImage(w, h) {
  const data = new Uint8Array(w * h * 4).fill(255); // 흰 배경, 불투명
  return {
    width: w, height: h, data,
    set(x, y, g) {
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = g; data[i + 3] = 255;
    },
  };
}
function drawDisk(img, cx, cy, r, gray) {
  for (let y = cy - r - 1; y <= cy + r + 1; y += 1)
    for (let x = cx - r - 1; x <= cx + r + 1; x += 1)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) img.set(x, y, gray);
}
function drawRing(img, cx, cy, rOut, rIn, gray) {
  for (let y = cy - rOut - 1; y <= cy + rOut + 1; y += 1)
    for (let x = cx - rOut - 1; x <= cx + rOut + 1; x += 1) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 <= rOut * rOut && d2 >= rIn * rIn) img.set(x, y, gray);
    }
}
function drawRect(img, x0, y0, x1, y1, gray) {
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) img.set(x, y, gray);
}
// a·b 반축, 각도 angleDeg 로 회전된 채움 타원.
function drawRotEllipse(img, cx, cy, a, b, angleDeg, gray) {
  const t = angleDeg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const R = Math.ceil(Math.max(a, b)) + 2;
  for (let y = cy - R; y <= cy + R; y += 1)
    for (let x = cx - R; x <= cx + R; x += 1) {
      const dx = x - cx, dy = y - cy;
      const u = dx * c + dy * s, v = -dx * s + dy * c;
      if ((u / a) ** 2 + (v / b) ** 2 <= 1) img.set(x, y, gray);
    }
}

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`); }
  else { fail += 1; console.log(`  ❌ ${name}  ${detail}`); }
}
const opts = { minArea: 25, dilateRadius: 3, textSizePx: 22, epsilon: 1.2 };

// ── T1: 검정 채움 원판 → ellipse, strokeWidth 0, fillLevel ~0 ──
{
  console.log("T1 검정 채움 원판");
  const img = makeImage(120, 120);
  drawDisk(img, 60, 60, 30, 0);
  const { components } = vectorizeImage(img, opts);
  check("컴포넌트 1개", components.length === 1, `got ${components.length}`);
  const c = components[0];
  check("ellipse로 판정", !!c.ellipse, JSON.stringify(Object.keys(c)));
  if (c.ellipse) {
    check("strokeWidthPx 0 (채움 원판)", c.ellipse.strokeWidthPx === 0);
    check("fillLevel ~0 (검정)", c.ellipse.fillLevel <= 10, `fillLevel=${c.ellipse.fillLevel}`);
    check("rx≈ry≈30", Math.abs(c.ellipse.rx - 30) < 2 && Math.abs(c.ellipse.ry - 30) < 2,
      `rx=${c.ellipse.rx.toFixed(1)} ry=${c.ellipse.ry.toFixed(1)}`);
    check("중심 ≈ (60,60)", Math.abs(c.ellipse.cx - 60) < 1.5 && Math.abs(c.ellipse.cy - 60) < 1.5,
      `c=(${c.ellipse.cx.toFixed(1)},${c.ellipse.cy.toFixed(1)})`);
  }
}

// ── T2: 회색(150) 채움 원판 → ellipse, fillLevel ~150 (§2-1 실측 연동) ──
{
  console.log("T2 회색 채움 원판");
  const img = makeImage(120, 120);
  drawDisk(img, 60, 60, 30, 150);
  const { components } = vectorizeImage(img, opts);
  const el = components.find((c) => c.ellipse);
  check("ellipse로 판정", !!el);
  if (el) check("fillLevel ~150", Math.abs(el.ellipse.fillLevel - 150) <= 8, `fillLevel=${el.ellipse.fillLevel}`);
}

// ── T3: 검정 링(흰 중심) → ellipse 1개, strokeWidth>0, fillLevel ~255 ──
{
  console.log("T3 검정 링");
  const img = makeImage(140, 140);
  drawRing(img, 70, 70, 40, 28, 0);
  const { components } = vectorizeImage(img, opts);
  const el = components.find((c) => c.ellipse);
  check("ellipse로 판정(링)", !!el, `comps=${components.length}`);
  if (el) {
    check("strokeWidthPx > 0 (링 두께)", el.ellipse.strokeWidthPx > 4,
      `sw=${el.ellipse.strokeWidthPx.toFixed(1)}`);
    check("strokeLevel ~0 (검정 링)", el.ellipse.strokeLevel <= 10, `sl=${el.ellipse.strokeLevel}`);
    check("fillLevel ~255 (흰 중심)", el.ellipse.fillLevel >= 245, `fl=${el.ellipse.fillLevel}`);
    check("중심선 반경 ~34", Math.abs(el.ellipse.rx - 34) < 3, `rx=${el.ellipse.rx.toFixed(1)}`);
    // 폴리곤 2겹(도넛+구멍)이 아니라 ellipse 1개여야 함
    check("loops 없음(폴리곤 2겹 아님)", el.loops === undefined);
  }
}

// ── T4: 사각형 → ellipse 거부, 폴리곤 폴백 ──
{
  console.log("T4 사각형(폴백)");
  const img = makeImage(120, 100);
  drawRect(img, 30, 25, 90, 75, 0);
  const { components } = vectorizeImage(img, opts);
  const c = components[0];
  check("컴포넌트 존재", !!c);
  if (c) {
    check("ellipse 아님", !c.ellipse);
    check("loops 폴백 존재", Array.isArray(c.loops) && c.loops.length >= 1);
  }
}

// ── T5: 회전 타원(35°) → ellipse, rotationDeg ≈ ±35 ──
{
  console.log("T5 회전 타원");
  const img = makeImage(160, 160);
  drawRotEllipse(img, 80, 80, 46, 24, 35, 0);
  const { components } = vectorizeImage(img, opts);
  const el = components.find((c) => c.ellipse);
  check("ellipse로 판정(회전)", !!el, `comps=${components.length}`);
  if (el) {
    const rot = ((el.ellipse.rotationDeg % 180) + 180) % 180; // 0~180 정규화
    const near = Math.min(Math.abs(rot - 35), Math.abs(rot - (35 + 90)), Math.abs(rot - (35 - 90)));
    check("rotationDeg ≈ 35 (축 대응)", near < 6, `rotationDeg=${el.ellipse.rotationDeg.toFixed(1)} (norm ${rot.toFixed(1)})`);
    const semi = [el.ellipse.rx, el.ellipse.ry].sort((a, b) => b - a);
    check("반축 ≈ 46·24", Math.abs(semi[0] - 46) < 4 && Math.abs(semi[1] - 24) < 4,
      `semi=${semi.map((v) => v.toFixed(1))}`);
  }
}

// ── T6: 회귀 — 원 없는 다도형(사각+삼각형 유사)에서 오검출 없음 ──
{
  console.log("T6 오검출 방어(가는 대각선 막대)");
  const img = makeImage(120, 120);
  for (let i = 0; i < 80; i += 1) { // 대각선 두께 3 막대
    for (let t = -1; t <= 1; t += 1) img.set(20 + i, 20 + i + t, 0);
  }
  const { components } = vectorizeImage(img, opts);
  const anyEllipse = components.some((c) => c.ellipse);
  check("막대는 ellipse 아님", !anyEllipse, `ellipse comps=${components.filter((c) => c.ellipse).length}`);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);

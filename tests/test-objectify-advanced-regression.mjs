// §8·§9 회귀 테스트: advancedShapes 토글 전체 파이프라인(vectorizeImage) 점검.
// 상대경로 import → 어느 워크트리에서 실행해도 그 폴더 모듈을 본다(test-line-extract 관례).
//  (a) advancedShapes 미지정(기본) → 결과 컴포넌트에 rect/strokes/strokedRegion 필드 전무(헌법 §0-3, 회귀 0)
//  (b) advancedShapes:true + 가는 선 → 어떤 컴포넌트가 strokes에 line 1개
//  (c) advancedShapes:true + 사각 링 → rect fit 성공
//  (d) advancedShapes:true + 무작위 덩어리 → 예외 없이 loops 폴백
import { vectorizeImage } from "../js/image-vectorize.js";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`); }
  else { fail += 1; console.log(`  ❌ ${name}  ${detail}`); }
};

/* ===== 합성 이미지 헬퍼 (test-rectfit/test-ellipse 스타일 준수) ===== */
function makeImage(w, h) {
  const data = new Uint8Array(w * h * 4).fill(255); // 흰 배경, 불투명
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
// 축정렬 사각 링(테두리만): 바깥 사각에서 안쪽 사각을 뺀 띠.
function drawRectRing(img, x0, y0, x1, y1, t, g) {
  fillRect(img, x0, y0, x1, y1, g);
  fillRect(img, x0 + t, y0 + t, x1 - t, y1 - t, 255); // 안쪽을 흰색으로 비움
}
// 가는 수평 획(굵기 t): 중심선 y0, x0~x1. 원 브러시로 두께 근사(test-line-extract 관례).
function drawStroke(img, x0, y0, x1, y1, t, g) {
  const r = (t - 1) / 2;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len));
  for (let s = 0; s <= steps; s += 1) {
    const cx = x0 + (x1 - x0) * s / steps, cy = y0 + (y1 - y0) * s / steps;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy += 1) {
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx += 1) {
        if (dx * dx + dy * dy <= r * r + 0.25) img.set(cx + dx, cy + dy, g);
      }
    }
  }
}
// 채운 삼각형 3개를 이어붙인 불규칙 얼룩 + 잔점 잡음(test-rectfit T5 노이즈 덩어리 관례).
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
function drawNoiseBlob(img) {
  const seed = [[40, 40], [70, 45], [80, 70], [55, 85], [38, 65], [60, 55]];
  fillTri(img, seed[0], seed[1], seed[2], 0);
  fillTri(img, seed[0], seed[2], seed[3], 0);
  fillTri(img, seed[3], seed[4], seed[0], 0);
  for (let i = 0; i < 40; i += 1) img.set(45 + (i * 7) % 30, 50 + (i * 5) % 30, 0);
}

const baseOpts = { minArea: 25, dilateRadius: 3, textSizePx: 22, epsilon: 1.2 };

// ── (a) advancedShapes 미지정(기본) → 신규 필드 전무, 현행과 100% 동일(회귀 0) ──
{
  console.log("(a) advancedShapes 미지정 → 신규 필드 없음(현행 그대로)");
  const img = makeImage(160, 130);
  drawRectRing(img, 30, 25, 130, 105, 8, 0);
  drawStroke(img, 10, 118, 150, 118, 3, 0);
  const { components } = vectorizeImage(img, baseOpts); // advancedShapes 옵션 자체를 생략
  check("컴포넌트 존재", components.length > 0, `n=${components.length}`);
  const hasAdvancedField = components.some((c) => c.rect || c.strokes || c.strokedRegion);
  check("rect/strokes/strokedRegion 필드 전무", !hasAdvancedField,
    JSON.stringify(components.map((c) => Object.keys(c))));
  const allHaveLoopsOrEllipse = components.every((c) => c.loops || c.ellipse);
  check("전부 loops 또는 ellipse(현행 형태)", allHaveLoopsOrEllipse);
}

// ── (a') advancedShapes:false 명시 → 위와 동일 결과(명시적 오프도 회귀 0) ──
{
  console.log("(a') advancedShapes:false 명시 → 신규 필드 없음");
  const img = makeImage(160, 130);
  drawRectRing(img, 30, 25, 130, 105, 8, 0);
  const { components } = vectorizeImage(img, { ...baseOpts, advancedShapes: false });
  const hasAdvancedField = components.some((c) => c.rect || c.strokes || c.strokedRegion);
  check("rect/strokes/strokedRegion 필드 전무", !hasAdvancedField,
    JSON.stringify(components.map((c) => Object.keys(c))));
}

// ── (b) advancedShapes:true + 가는 선(60×3px) → 어떤 컴포넌트가 strokes에 line 1개 ──
{
  console.log("(b) advancedShapes:true + 가는 선 60×3px → strokes line 1개");
  const img = makeImage(100, 60);
  drawStroke(img, 10, 30, 70, 30, 3, 0);
  const { components } = vectorizeImage(img, { ...baseOpts, advancedShapes: true });
  check("컴포넌트 존재", components.length > 0, `n=${components.length}`);
  const withStrokes = components.filter((c) => Array.isArray(c.strokes) && c.strokes.length);
  check("strokes 필드를 가진 컴포넌트 존재", withStrokes.length > 0,
    JSON.stringify(components.map((c) => Object.keys(c))));
  if (withStrokes.length) {
    const hasLine = withStrokes.some((c) => c.strokes.some((p) => p.kind === "line"));
    check("line 1개 이상 포함", hasLine,
      JSON.stringify(withStrokes.map((c) => c.strokes.map((p) => p.kind))));
  }
}

// ── (c) advancedShapes:true + 사각 링(40×30, 테두리 3px) → rect fit 성공 ──
{
  console.log("(c) advancedShapes:true + 사각 링 40×30(테두리3px) → rect fit 성공");
  const img = makeImage(80, 70);
  drawRectRing(img, 20, 20, 60, 50, 3, 0); // 바깥 40×30, 테두리 3px
  const { components } = vectorizeImage(img, { ...baseOpts, advancedShapes: true });
  const withRect = components.filter((c) => c.rect);
  check("rect fit 성공(컴포넌트 존재)", withRect.length > 0,
    JSON.stringify(components.map((c) => Object.keys(c))));
  if (withRect.length) {
    const r = withRect[0].rect;
    check("hasFill true(링)", r.hasFill === true, `hasFill=${r.hasFill}`);
    check("w>0,h>0", r.w > 0 && r.h > 0, `w=${r.w} h=${r.h}`);
  }
}

// ── (d) advancedShapes:true + 무작위 덩어리 → 예외 없이 loops 폴백 ──
{
  console.log("(d) advancedShapes:true + 무작위 덩어리 → 예외 없이 loops 폴백");
  const img = makeImage(120, 120);
  drawNoiseBlob(img);
  let components = null, threw = false, err = null;
  try {
    ({ components } = vectorizeImage(img, { ...baseOpts, advancedShapes: true }));
  } catch (e) { threw = true; err = e; }
  check("예외 없음", !threw, err ? String(err) : "");
  if (!threw) {
    check("컴포넌트 존재", components.length > 0, `n=${components.length}`);
    const fellBackToLoops = components.some((c) => c.loops && !c.rect && !c.strokes && !c.strokedRegion);
    check("적어도 하나는 loops 폴백(rect/strokes/strokedRegion 아님)", fellBackToLoops,
      JSON.stringify(components.map((c) => Object.keys(c))));
  }
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);

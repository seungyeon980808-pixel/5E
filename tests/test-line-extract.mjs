// 가는 획 → 중심선 추출(extractStrokes) 검증. 상대경로 import → 어느 워크트리에서 실행해도 그 폴더 모듈을 본다.
import { extractStrokes } from "../js/image-line-extract.js";

let pass = 0, fail = 0;
const check = (n, c, d = "") => { if (c) { pass += 1; console.log(`  ✅ ${n}`); } else { fail += 1; console.log(`  ❌ ${n}  ${d}`); } };

// 합성 잉크 픽스처: 켜진 픽셀 집합(Set "x,y") → getInk. 두께는 브레젠험 없이 사각/원 브러시로.
function fixture() {
  const set = new Set();
  const on = (x, y) => set.add(`${Math.round(x)},${Math.round(y)}`);
  return {
    // 굵기 t의 수평/수직/일반 선분: 중심선 (x0,y0)-(x1,y1)에 반지름 r 원 브러시.
    stroke(x0, y0, x1, y1, t) {
      const r = (t - 1) / 2;
      const len = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(1, Math.ceil(len));
      for (let s = 0; s <= steps; s++) {
        const cx = x0 + (x1 - x0) * s / steps, cy = y0 + (y1 - y0) * s / steps;
        for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
          for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++)
            if (dx * dx + dy * dy <= r * r + 0.25) on(cx + dx, cy + dy);
      }
      return this;
    },
    // 채운 원호(1/4원): 각 a0→a1, 반지름 R, 굵기 t.
    arc(cx, cy, R, a0, a1, t) {
      const r = (t - 1) / 2;
      const steps = Math.ceil(Math.abs(a1 - a0) * R) + 4;
      for (let s = 0; s <= steps; s++) {
        const a = a0 + (a1 - a0) * s / steps;
        const px = cx + R * Math.cos(a), py = cy + R * Math.sin(a);
        for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
          for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++)
            if (dx * dx + dy * dy <= r * r + 0.25) on(px + dx, py + dy);
      }
      return this;
    },
    // 꽉 찬 사각(윤곽 아님).
    fillRect(x0, y0, x1, y1) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) on(x, y);
      return this;
    },
    // 채운 삼각형(화살촉용): 세 꼭짓점.
    fillTri(ax, ay, bx, by, cx, cy) {
      const minX = Math.floor(Math.min(ax, bx, cx)), maxX = Math.ceil(Math.max(ax, bx, cx));
      const minY = Math.floor(Math.min(ay, by, cy)), maxY = Math.ceil(Math.max(ay, by, cy));
      const sign = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const d1 = sign(x, y, ax, ay, bx, by), d2 = sign(x, y, bx, by, cx, cy), d3 = sign(x, y, cx, cy, ax, ay);
        const neg = (d1 < 0) || (d2 < 0) || (d3 < 0), pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
        if (!(neg && pos)) on(x, y);
      }
      return this;
    },
    getInk() { return (x, y) => set.has(`${Math.round(x)},${Math.round(y)}`); },
    bbox() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const k of set) { const [x, y] = k.split(",").map(Number); if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
      return [x0, y0, x1, y1];
    },
  };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ends = (p) => [p.points[0], p.points[p.points.length - 1]];
const nearAny = (pt, cands, tol) => cands.some((c) => dist(pt, c) < tol);

console.log("(1) 수평 막대 60×3px → line 1개");
{
  const f = fixture().stroke(5, 20, 64, 20, 3);
  const [bx0, by0, bx1, by1] = f.bbox();
  const r = extractStrokes(f.getInk(), bx0, by0, bx1, by1);
  check("결과 있음", !!r, JSON.stringify(r));
  if (r) {
    check("path 1개", r.paths.length === 1, `got ${r.paths.length}`);
    const p = r.paths[0];
    check("kind line", p && p.kind === "line", p && p.kind);
    check("굵기≈3", p && Math.abs(p.thicknessPx - 3) < 1.2, p && p.thicknessPx);
    if (p) {
      const e = ends(p);
      const cands = [{ x: 5, y: 20 }, { x: 64, y: 20 }];
      check("끝점 오차<2px", e.every((pt) => nearAny(pt, cands, 2)), JSON.stringify(e));
    }
  }
}

console.log("(2) L자 꺾인 획 → line 2개(꺾임 분할)");
{
  // 세로 (20,5)-(20,40) + 가로 (20,40)-(55,40), 굵기 3
  const f = fixture().stroke(20, 5, 20, 40, 3).stroke(20, 40, 55, 40, 3);
  const [bx0, by0, bx1, by1] = f.bbox();
  const r = extractStrokes(f.getInk(), bx0, by0, bx1, by1);
  check("결과 있음", !!r);
  if (r) {
    const lines = r.paths.filter((p) => p.kind === "line");
    // 한 경로가 꺾임 분할로 line 2개가 되거나(=polyline 아님), 최소 곧은 마디 2개.
    check("직선 마디 2개(폴리라인 1 + 곧은 마디 or line 2)",
      lines.length >= 2 || (r.paths.length === 1 && r.paths[0].kind === "polyline" && r.paths[0].points.length >= 3),
      JSON.stringify(r.paths.map((p) => p.kind + ":" + p.points.length)));
  }
}

console.log("(3) X 십자 → 4 토막(분기 분리)");
{
  // 두 대각선이 (30,30)서 교차, 굵기 3
  const f = fixture().stroke(10, 10, 50, 50, 3).stroke(50, 10, 10, 50, 3);
  const [bx0, by0, bx1, by1] = f.bbox();
  const r = extractStrokes(f.getInk(), bx0, by0, bx1, by1);
  check("결과 있음", !!r);
  if (r) {
    // 분기점 제거로 4개 토막(중심에서 갈라짐). 세선화 오차로 3~4개 허용.
    check("3~4 토막", r.paths.length >= 3 && r.paths.length <= 5, `got ${r.paths.length}: ${r.paths.map(p=>p.kind)}`);
  }
}

console.log("(4) 1/4 원호(굵기 3) → curve 1개");
{
  // 중심(50,50) 반지름 30, 각 180°→270° (좌상 사분면 호), 굵기 3
  const f = fixture().arc(50, 50, 30, Math.PI, Math.PI * 1.5, 3);
  const [bx0, by0, bx1, by1] = f.bbox();
  const r = extractStrokes(f.getInk(), bx0, by0, bx1, by1);
  check("결과 있음", !!r);
  if (r) {
    const curves = r.paths.filter((p) => p.kind === "curve");
    check("curve 1개(이상)", curves.length >= 1, JSON.stringify(r.paths.map((p) => p.kind)));
  }
}

console.log("(5) 선+화살촉 덩어리 → line 수락 + 화살촉 영역서 isResidualInk true");
{
  // 긴 수평 선 (5,30)-(90,30) 굵기 3 + 오른쪽 끝에 작은 채운 삼각형(화살촉).
  // 실제 화살표 비율(짧은 촉) — 획이 잉크 대부분을 설명하므로 커버리지≥0.6 통과.
  const f = fixture().stroke(5, 30, 90, 30, 3).fillTri(90, 25, 90, 35, 100, 30);
  const [bx0, by0, bx1, by1] = f.bbox();
  const r = extractStrokes(f.getInk(), bx0, by0, bx1, by1);
  check("결과 있음", !!r);
  if (r) {
    const hasLine = r.paths.some((p) => p.kind === "line" || p.kind === "polyline");
    check("line/polyline 수락", hasLine, JSON.stringify(r.paths.map((p) => p.kind)));
    // 화살촉 몸통(96,30) 근처는 잔여 잉크여야.
    check("화살촉 영역 isResidualInk true", r.isResidualInk(96, 30) === true, `residual@96,30=${r.isResidualInk(96, 30)}`);
    // 선 몸통(30,30)은 설명됨 → 잔여 아님.
    check("선 몸통 isResidualInk false", r.isResidualInk(30, 30) === false, `residual@30,30=${r.isResidualInk(30, 30)}`);
  }
}

console.log("(6) 30×30 꽉 찬 사각 → null(가늘지 않음)");
{
  const f = fixture().fillRect(10, 10, 39, 39);
  const [bx0, by0, bx1, by1] = f.bbox();
  const r = extractStrokes(f.getInk(), bx0, by0, bx1, by1);
  check("null 반환", r === null, JSON.stringify(r && r.paths.map((p) => p.kind + ":" + p.thicknessPx)));
}

console.log("(7) 도넛 링 → 크래시 없이 null 또는 합리적 결과");
{
  // 채운 큰 원 - 채운 작은 원 = 링. arc를 촘촘히 겹쳐 두꺼운 링(굵기≈5) 근사.
  const f = fixture();
  // 반지름 25, 굵기 5의 닫힌 링
  for (let k = 0; k < 4; k++) f.arc(50, 50, 25, k * Math.PI / 2, (k + 1) * Math.PI / 2 + 0.05, 5);
  const [bx0, by0, bx1, by1] = f.bbox();
  let r, threw = false;
  try { r = extractStrokes(f.getInk(), bx0, by0, bx1, by1); } catch (_e) { threw = true; }
  check("크래시 없음", !threw);
  check("null 또는 결과객체(합리적)", r === null || (r && Array.isArray(r.paths)), JSON.stringify(r && r.paths && r.paths.map((p) => p.kind)));
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);

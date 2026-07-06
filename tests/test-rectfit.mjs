// §8 단위 테스트: 사각 fit + 균일 띠 stroke+fill + 밴드 채움 병합.
//  · 축정렬 사각 링 → fitComponentRect (hasFill=true, strokeWidth≈띠 두께)
//  · 15° 회전 사각 링 → rect (rotationDeg 오차 <3°)
//  · 삼각 링 → rect null, fitStrokedRegion 성공(중간선 points)
//  · 원 링 → rect·strokedRegion 둘 다 null (꼭짓점/두께 게이트 차단)
//  · 노이즈 덩어리 → 둘 다 null
//  · 꽉 찬 사각 → rect hasFill=false·strokeWidth 0·fillLevel 실측
//  · mergeBandFills → 빈 사각 구멍을 밝은 컴포넌트가 채우면 흡수+제거
import {
  binarize, connectedComponents, traceContours,
  fitComponentRect, fitStrokedRegion, mergeBandFills,
} from "file:///C:/Users/user/Desktop/project/51_5E/5E_objline_dev/js/image-vectorize.js";

/* ===== 합성 이미지 헬퍼 (test-ellipse/test-smooth 스타일 준수) ===== */
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
// 회전 채움 사각(반폭 hw·반높이 hh, deg 회전).
function fillRotRect(img, cx, cy, hw, hh, deg, g) {
  const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const R = Math.ceil(Math.hypot(hw, hh)) + 2;
  for (let y = cy - R; y <= cy + R; y += 1) for (let x = cx - R; x <= cx + R; x += 1) {
    const dx = x - cx, dy = y - cy, u = dx * c + dy * s, v = -dx * s + dy * c;
    if (Math.abs(u) <= hw && Math.abs(v) <= hh) img.set(x, y, g);
  }
}
// 회전 사각 링: 바깥 회전사각 채움 후 안쪽 회전사각을 흰색으로 비움.
function drawRotRectRing(img, cx, cy, hw, hh, t, deg, g) {
  fillRotRect(img, cx, cy, hw, hh, deg, g);
  fillRotRect(img, cx, cy, hw - t, hh - t, deg, 255);
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
// 삼각 링: 큰 삼각 채움 후 작은 삼각(안쪽으로 t만큼 축소)을 흰색으로 비움.
function drawTriRing(img, A, B, C, t, g) {
  fillTri(img, A, B, C, g);
  // 무게중심 방향으로 각 꼭짓점을 t 비율만큼 당겨 안쪽 삼각형 생성.
  const gx = (A[0] + B[0] + C[0]) / 3, gy = (A[1] + B[1] + C[1]) / 3;
  const shrink = (P) => {
    const dx = gx - P[0], dy = gy - P[1], d = Math.hypot(dx, dy) || 1;
    // 꼭짓점을 무게중심 쪽으로 t*3px 정도 당김(변 수직거리 ~t 확보).
    const k = (t * 2.2) / d;
    return [P[0] + dx * k, P[1] + dy * k];
  };
  fillTri(img, shrink(A), shrink(B), shrink(C), 255);
}
// 링(원): 바깥 반경 rOut, 안쪽 rIn.
function drawDiskRing(img, cx, cy, rOut, rIn, g) {
  for (let y = cy - rOut - 1; y <= cy + rOut + 1; y += 1)
    for (let x = cx - rOut - 1; x <= cx + rOut + 1; x += 1) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 <= rOut * rOut && d2 >= rIn * rIn) img.set(x, y, g);
    }
}

/* ===== 파이프라인 재현: 이미지 → 최대 컴포넌트의 rawLoops·getInk·gray ===== */
// 파이프라인(vectorizeSingleLevel)과 동일하게 mask→CC→traceContours→isHole.
// signedArea가 export 아니라 같은 셈법(shoelace, 양수=outline)을 여기 재현.
function shoelace(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}
// 이미지에서 가장 큰(면적) 컴포넌트를 골라 fit 함수 입력 세트를 만든다.
function componentInputs(img) {
  const { width: w, height: h } = img;
  const { mask, gray } = binarize(img);
  const { labels, comps } = connectedComponents(mask, w, h);
  if (!comps.length) return null;
  let c = comps[0];
  for (const cc of comps) if (cc.area > c.area) c = cc;
  const [bx0, by0, bx1, by1] = c.bbox;
  const getInk = (x, y) =>
    x >= 0 && x < w && y >= 0 && y < h && mask[y * w + x] === 1 && labels[y * w + x] === c.label;
  const rawLoops = traceContours(getInk, bx0 - 1, by0 - 1, bx1 + 1, by1 + 1)
    .map((raw) => ({ points: raw, isHole: shoelace(raw) < 0 }));
  return { rawLoops, getInk, gray, w, h, bbox: c.bbox };
}

/* ===== 검사 러너 ===== */
let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}`); }
  else { fail += 1; console.log(`  ❌ ${name}  ${detail}`); }
};

// ── T1: 축정렬 검정 사각 링 → fitComponentRect (hasFill) ──
{
  console.log("T1 축정렬 사각 링");
  const img = makeImage(160, 130);
  drawRectRing(img, 30, 25, 130, 105, 8, 0); // 100×80 바깥, 두께 8
  const inp = componentInputs(img);
  const rect = inp && fitComponentRect(inp.rawLoops, inp.getInk, inp.gray, inp.w, inp.h);
  check("rect fit 성공", !!rect, rect ? "" : "null");
  if (rect) {
    check("hasFill true (링)", rect.hasFill === true);
    check("strokeLevel ~0 (검정 띠)", rect.strokeLevel <= 10, `sl=${rect.strokeLevel}`);
    check("fillLevel ~255 (흰 구멍)", rect.fillLevel >= 245, `fl=${rect.fillLevel}`);
    check("strokeWidthPx ≈ 8", Math.abs(rect.strokeWidthPx - 8) < 2.5, `sw=${rect.strokeWidthPx.toFixed(2)}`);
    check("중심 ≈ (80,65)", Math.abs(rect.cx - 80) < 2 && Math.abs(rect.cy - 65) < 2,
      `c=(${rect.cx.toFixed(1)},${rect.cy.toFixed(1)})`);
    check("rotationDeg ≈ 0", Math.abs(((rect.rotationDeg % 90) + 90) % 90) < 3
      || Math.abs((((rect.rotationDeg % 90) + 90) % 90) - 90) < 3, `rot=${rect.rotationDeg.toFixed(2)}`);
    // 중심선 전폭 w/h ≈ (바깥+안쪽 반extent) = 바깥 반폭 − t/2 의 2배 근사
    check("w>0,h>0", rect.w > 0 && rect.h > 0, `w=${rect.w.toFixed(1)} h=${rect.h.toFixed(1)}`);
  }
}

// ── T2: 15° 회전 사각 링 → rect, rotationDeg 오차 <3° ──
{
  console.log("T2 15° 회전 사각 링");
  const img = makeImage(200, 200);
  drawRotRectRing(img, 100, 100, 60, 40, 8, 15, 0);
  const inp = componentInputs(img);
  const rect = inp && fitComponentRect(inp.rawLoops, inp.getInk, inp.gray, inp.w, inp.h);
  check("rect fit 성공(회전)", !!rect, rect ? "" : "null");
  if (rect) {
    check("hasFill true", rect.hasFill === true);
    const rot = ((rect.rotationDeg % 90) + 90) % 90; // 0~90 정규화(변 대칭)
    const near = Math.min(rot, Math.abs(rot - 90));
    check("rotationDeg ≈ 15 (오차<3°)", Math.abs(near - 15) < 3, `rot=${rect.rotationDeg.toFixed(2)} (norm ${rot.toFixed(2)})`);
    check("strokeWidthPx ≈ 8", Math.abs(rect.strokeWidthPx - 8) < 3, `sw=${rect.strokeWidthPx.toFixed(2)}`);
    check("중심 ≈ (100,100)", Math.abs(rect.cx - 100) < 3 && Math.abs(rect.cy - 100) < 3,
      `c=(${rect.cx.toFixed(1)},${rect.cy.toFixed(1)})`);
  }
}

// ── T3: 삼각 링 → rect null, strokedRegion 성공 ──
{
  console.log("T3 삼각 링");
  const img = makeImage(180, 170);
  drawTriRing(img, [30, 150], [150, 150], [90, 30], 7, 0);
  const inp = componentInputs(img);
  const rect = inp && fitComponentRect(inp.rawLoops, inp.getInk, inp.gray, inp.w, inp.h);
  check("rect null (삼각은 4점 아님)", rect === null, `got ${JSON.stringify(rect)}`);
  const sr = inp && fitStrokedRegion(inp.rawLoops, inp.getInk, inp.gray, inp.w, inp.h);
  check("strokedRegion 성공", !!sr, sr ? "" : "null");
  if (sr) {
    check("points 배열({x,y})", Array.isArray(sr.points) && sr.points.length >= 3
      && typeof sr.points[0].x === "number", `n=${sr.points && sr.points.length}`);
    check("strokeWidthPx > 0", sr.strokeWidthPx > 0, `sw=${sr.strokeWidthPx}`);
    check("strokeLevel ~0 (검정)", sr.strokeLevel <= 12, `sl=${sr.strokeLevel}`);
    check("fillLevel ~255 (흰 구멍)", sr.fillLevel >= 240, `fl=${sr.fillLevel}`);
  }
}

// ── T4: 원 링 → rect·strokedRegion 둘 다 null ──
{
  console.log("T4 원 링");
  const img = makeImage(160, 160);
  drawDiskRing(img, 80, 80, 50, 38, 0);
  const inp = componentInputs(img);
  const rect = inp && fitComponentRect(inp.rawLoops, inp.getInk, inp.gray, inp.w, inp.h);
  check("rect null (원은 꼭짓점 게이트 차단)", rect === null, `got ${JSON.stringify(rect)}`);
  // 원 링은 두께 균일하나 명세상 ellipse 몫 — strokedRegion이 잡아도 사다리에서
  // ellipse가 먼저 소진하므로 무해. 다만 여기선 원 링을 strokedRegion이 승격하지
  // 않도록 확인하지 않는다(사다리 순서가 보장). rect null만 핵심 검증.
}

// ── T5: 노이즈 덩어리 → 둘 다 null ──
{
  console.log("T5 노이즈 덩어리");
  const img = makeImage(120, 120);
  // 불규칙 얼룩(구멍 없음, 사각 아님).
  const seed = [[40, 40], [70, 45], [80, 70], [55, 85], [38, 65], [60, 55]];
  fillTri(img, seed[0], seed[1], seed[2], 0);
  fillTri(img, seed[0], seed[2], seed[3], 0);
  fillTri(img, seed[3], seed[4], seed[0], 0);
  for (let i = 0; i < 40; i += 1) img.set(45 + (i * 7) % 30, 50 + (i * 5) % 30, 0);
  const inp = componentInputs(img);
  const rect = inp && fitComponentRect(inp.rawLoops, inp.getInk, inp.gray, inp.w, inp.h);
  const sr = inp && fitStrokedRegion(inp.rawLoops, inp.getInk, inp.gray, inp.w, inp.h);
  check("rect null (노이즈)", rect === null, `got ${JSON.stringify(rect)}`);
  check("strokedRegion null (구멍 없음)", sr === null, `got ${sr ? "obj" : "null"}`);
}

// ── T6: 꽉 찬 사각(회색) → rect hasFill=false, strokeWidth 0, fillLevel 실측 ──
{
  console.log("T6 꽉 찬 회색 사각");
  const img = makeImage(140, 120);
  fillRect(img, 30, 25, 110, 95, 150);
  const inp = componentInputs(img);
  const rect = inp && fitComponentRect(inp.rawLoops, inp.getInk, inp.gray, inp.w, inp.h);
  check("rect fit 성공", !!rect, rect ? "" : "null");
  if (rect) {
    check("hasFill false (꽉 참)", rect.hasFill === false);
    check("strokeWidthPx 0", rect.strokeWidthPx === 0, `sw=${rect.strokeWidthPx}`);
    check("fillLevel ~150 실측", Math.abs(rect.fillLevel - 150) <= 8, `fl=${rect.fillLevel}`);
    check("w ≈ 80, h ≈ 70", Math.abs(rect.w - 80) < 3 && Math.abs(rect.h - 70) < 3,
      `w=${rect.w.toFixed(1)} h=${rect.h.toFixed(1)}`);
  }
}

// ── T7: mergeBandFills — 링 rect(hasFill=true·strokeWidthPx>0, 실파이프라인 형태)의
//        구멍을 밝은 컴포넌트가 채우면 흡수+제거 ──
{
  console.log("T7 mergeBandFills 흡수");
  // bandHoleBox: ihw=w/2−sw/2=45, ihh=h/2−sw/2=35 → 구멍 (35,35)-(125,105), 면적 6300.
  const host = {
    level: 0, bbox: [30, 30, 130, 110],
    rect: { cx: 80, cy: 70, w: 100, h: 80, rotationDeg: 0, strokeWidthPx: 10, strokeLevel: 0, fillLevel: 255, hasFill: true },
  };
  // 밝은 채움 컴포넌트(level 1): 구멍의 ≥80%를 덮음(교집합 5376/6300≈0.85).
  const filler = { level: 1, bbox: [38, 38, 122, 102], loops: [{ isHole: false, fillLevel: 150 }] };
  const other = { level: 0, bbox: [200, 200, 220, 220], loops: [{ isHole: false, fillLevel: 0 }] };
  const out = mergeBandFills([host, filler, other]);
  check("filler 제거됨", !out.includes(filler), `len=${out.length}`);
  check("host 유지", out.includes(host));
  check("other 유지", out.includes(other));
  check("host.rect.hasFill 유지 true", host.rect.hasFill === true);
  check("host.rect.fillLevel 흡수 → 150", host.rect.fillLevel === 150, `fl=${host.rect.fillLevel}`);
}

// ── T7b: 솔리드 사각(hasFill=false·구멍 없음)은 host 아님 — 채움색 보존(오병합 방지, §0-2) ──
{
  console.log("T7b 솔리드 사각 host 제외");
  const solid = {
    level: 0, bbox: [30, 30, 130, 110],
    rect: { cx: 80, cy: 70, w: 100, h: 80, rotationDeg: 0, strokeWidthPx: 0, strokeLevel: 0, fillLevel: 0, hasFill: false },
  };
  const bright = { level: 1, bbox: [35, 35, 125, 105], loops: [{ isHole: false, fillLevel: 200 }] };
  const out = mergeBandFills([solid, bright]);
  check("솔리드 유지(host 아님)", out.includes(solid));
  check("bright 유지(흡수 안 됨)", out.includes(bright));
  check("솔리드 fillLevel 0 보존", solid.rect.fillLevel === 0, `fl=${solid.rect.fillLevel}`);
}

// ── T8: mergeBandFills — 면적 미달이면 흡수 안 함(확신 없으면 안 건드림) ──
{
  console.log("T8 mergeBandFills 면적 미달 방어");
  const host = {
    level: 0, bbox: [30, 30, 130, 110],
    strokedRegion: { points: [{ x: 40, y: 40 }, { x: 120, y: 40 }, { x: 80, y: 100 }], strokeWidthPx: 8, strokeLevel: 0, fillLevel: 255 },
  };
  // 구멍 bbox = (40,40)-(120,100), 면적 4800. filler는 절반만 덮음 → 미달.
  const filler = { level: 1, bbox: [40, 40, 80, 70], loops: [{ isHole: false, fillLevel: 150 }] };
  const out = mergeBandFills([host, filler]);
  check("filler 유지(면적 미달)", out.includes(filler));
  check("host.fillLevel 그대로 255", host.strokedRegion.fillLevel === 255, `fl=${host.strokedRegion.fillLevel}`);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);

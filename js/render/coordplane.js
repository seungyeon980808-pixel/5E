/* ===== RENDER/COORDPLANE: math coordinate plane + (step 3) funcgraph ===== */
//
// renderCoordplane draws a full math coordinate system inside its bbox: optional
// grid, the two axis lines (drawn only where 0 is inside the range), arrowheads,
// tick marks, and — new vs the decorative `axes` symbol — NUMERIC tick labels.
// Everything is a PROJECTION computed from the data (x/y/w/h + range + steps),
// never stored as separate objects (mirrors renderAxes, annotations.js).
//
// The math↔world mapping is the shared coords.js helper (single source of truth,
// 기획서 결정 C/§4), so a graph previewed in the modal lands identically here.
// Convention: +X right, +Y UP (world y flipped).

import {
  SVG_NS,
  grayHex,
  fillTextWithRomanRuns,
  applyObjectLabelFont,
  catmullRomPath,
  applyDash,
} from "./core.js?v=0.54.30";
import { worldXFromMathX, worldYFromMathY } from "../function-graph/coords.js?v=0.54.30";
import { renderGraphLabel } from "./graph-label.js?v=0.54.30";

// dominant-baseline(구식 addName) → renderGraphLabel vAlign 매핑.
function baselineToVAlign(b) {
  return b === "hanging" ? "top" : b === "middle" ? "middle" : "baseline";
}

// Grid lines are deliberately light + thin (grayscale project); a hard cap keeps a
// tiny step over a wide range from spraying hundreds of lines.
const GRID_LEVEL = 135;        // medium gray (0=black … 255=white) — 평가원 dashed grid
const GRID_MAX_LINES = 160;    // per axis; beyond this the grid is skipped

/* ----- filled swept-back(barbed) arrowhead (평가원 만년필식) -----
 * 단순 삼각형이 아니라 뒤가 안쪽으로 파인 갈고리형: 뒤 양 날개가 뒤로 젖혀지고
 * 가운데(축이 들어오는 곳)가 앞으로 파여 오목하다. 4점 폴리곤:
 *   tip(앞) → 위 날개(뒤·넓게) → notch(가운데·앞으로 파임) → 아래 날개(뒤·넓게).
 * d=진행방향 단위벡터, p=수직. 길이/폭/젖힘/파임은 sw(=headSw) 배수. */
function appendArrow(g, tipX, tipY, dirX, dirY, sw, color) {
  const len = sw * 6.2;    // 날개(뒤 끝)까지 길이
  const half = sw * 2.5;   // 날개 반폭(넓게)
  const notch = sw * 2.6;  // 가운데 오목하게 파인 깊이(앞쪽으로)
  const px = -dirY, py = dirX; // unit perpendicular
  const bx = tipX - dirX * len, by = tipY - dirY * len;          // 날개 뒤 기준선
  const nx = tipX - dirX * (len - notch), ny = tipY - dirY * (len - notch); // notch(앞으로)
  const poly = document.createElementNS(SVG_NS, "polygon");
  poly.setAttribute("points",
    `${tipX},${tipY} ${bx + px * half},${by + py * half} ${nx},${ny} ${bx - px * half},${by - py * half}`);
  poly.setAttribute("fill", color);
  poly.setAttribute("stroke", "none");
  poly.setAttribute("stroke-linejoin", "round");
  g.appendChild(poly);
}

/* ----- format a tick value: kill float noise, trim trailing zeros ----- */
function fmtTick(v) {
  if (!Number.isFinite(v)) return "";
  const r = Math.round(v * 1e6) / 1e6;
  if (Object.is(r, -0)) return "0";
  if (Number.isInteger(r)) return String(r);
  return String(parseFloat(r.toFixed(6)));
}

/* ----- integer k range so that k*step covers [lo,hi] without float drift ----- */
function tickRange(lo, hi, step) {
  const s = Math.abs(step) > 1e-9 ? Math.abs(step) : 1;
  return { kStart: Math.ceil(lo / s - 1e-9), kEnd: Math.floor(hi / s + 1e-9), step: s };
}

function renderCoordplane(obj) {
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;

  // Whole-bbox transparent body → the plane is ONE solid click/drag target from
  // anywhere inside (same trick as renderAxes), not just on a drawn line.
  const body = document.createElementNS(SVG_NS, "rect");
  body.setAttribute("x", obj.x);
  body.setAttribute("y", obj.y);
  body.setAttribute("width", obj.w);
  body.setAttribute("height", obj.h);
  body.setAttribute("fill", "transparent");
  g.appendChild(body);

  const color = grayHex(obj.strokeLevel);
  const gridColor = grayHex(GRID_LEVEL);
  const sw = obj.strokeWidth || 0.2;

  const P = obj; // coords helpers read x/y/w/h/xMin..yMax straight off the object
  const xMin = obj.xMin, xMax = obj.xMax, yMin = obj.yMin, yMax = obj.yMax;
  const left = obj.x, right = obj.x + obj.w, top = obj.y, bottom = obj.y + obj.h;

  const addLine = (x1, y1, x2, y2, stroke, w) => {
    const l = document.createElementNS(SVG_NS, "line");
    l.setAttribute("x1", x1); l.setAttribute("y1", y1);
    l.setAttribute("x2", x2); l.setAttribute("y2", y2);
    l.setAttribute("stroke", stroke);
    l.setAttribute("stroke-width", w);
    g.appendChild(l);
  };

  // Origin in world; each axis is on-screen only if 0 lies within its range.
  const worldX0 = worldXFromMathX(P, 0);
  const worldY0 = worldYFromMathY(P, 0);
  const xAxisVisible = yMin <= 0 && 0 <= yMax;   // horizontal axis at y=0 crosses the box?
  const yAxisVisible = xMin <= 0 && 0 <= xMax;   // vertical axis at x=0 crosses the box?

  // ----- axis variant (형태): 십자(cross) / ㄴ자(quadrant) / ㅏ자(halfcross) / 직선(single) -----
  //   cross     : x·y 양방향 (십자, 공간좌표)
  //   quadrant  : x·y 모두 0부터 (ㄴ자, 1사분면)
  //   halfcross : x는 0부터, y는 양방향 (ㅏ자 — 시간축은 음수 없고 물리량만 ±)
  //   single    : x축만 (직선)
  const variant = obj.axisVariant || "cross";
  const hasYArm = variant !== "single";                    // 세로축을 그리나?
  const xBoth = variant === "cross";                       // x축 음의 방향도 그리나?
  const yBoth = variant === "cross" || variant === "halfcross"; // y축 음의 방향도?
  const rich = !!obj.richLabels;       // 혼합 라벨러(한글정자+영문이탤릭+수식) 사용
  const gridToData = !!obj.gridToData; // 격자를 데이터 사각형 끝까지(꼬리 없이)
  // Positive-only forms start each axis at the origin; fall back to the box edge
  // when 0 is outside the perpendicular range so the line never begins off-canvas.
  const xAxisLeft   = xBoth ? left   : (yAxisVisible ? worldX0 : left);
  const yAxisBottom = yBoth ? bottom : (xAxisVisible ? worldY0 : bottom);

  // Grid/ticks/numbers at the exact box edge read as a terminal "bar" ⊢ and crowd
  // the arrow; skip them so the GRID stops one cell short of the range (평가원:
  // 범위 [-5,5] → 격자 [-4,4]) and the axis ends cleanly with just the arrow.
  const atEdgeX = (v) => Math.abs(v - xMin) < 1e-6 || Math.abs(v - xMax) < 1e-6;
  const atEdgeY = (v) => Math.abs(v - yMin) < 1e-6 || Math.abs(v - yMax) < 1e-6;

  // 눈금/격자의 '데이터 칸' k 범위. graph 도구가 gridCountX/Y(양의 칸 수)를 주면 마지막
  // 눈금을 ±gridCount로 캡한다(그러면 xMax/yMax의 남는 여백은 순수 화살표 마진 — 사진3의
  // "한 칸+α"). gridOver = 격자를 마지막 눈금 밖으로 더 뻗는 칸(사진4의 "반 칸"). 둘 다
  // 없으면(구 좌표평면) 기존처럼 xMin..xMax 정수배수.
  const stepX = obj.gridStepX || 1, stepY = obj.gridStepY || 1;
  const gcX = Number.isFinite(obj.gridCountX) ? obj.gridCountX : null;
  const gcY = Number.isFinite(obj.gridCountY) ? obj.gridCountY : null;
  const gridOver = Number.isFinite(obj.gridOver) ? obj.gridOver : 0;
  const kx = gcX != null ? { kStart: xBoth ? -gcX : 0, kEnd: gcX, step: stepX } : tickRange(xMin, xMax, stepX);
  const ky = gcY != null ? { kStart: yBoth ? -gcY : 0, kEnd: gcY, step: stepY } : tickRange(yMin, yMax, stepY);
  // 눈금/라벨 스킵 판정: gridCount·gridToData 경로에선 데이터 범위를 이미 정확히 캡했으니
  // 박스-끝 트리밍(atEdge)을 걸지 않는다. 구 좌표평면(둘 다 없음)에서만 atEdge로 다듬는다.
  const legacyTrim = gcX == null && !gridToData;
  const skipTickX = (v) => legacyTrim && atEdgeX(v);
  const skipTickY = (v) => (gcY == null && !gridToData) && atEdgeY(v);

  // ----- GRID (light, dashed — 평가원 style) -----
  // Every grid line spans the SAME grid rectangle so the ends line up cleanly
  // (no dashes poking into the one-cell axis margin, #3). The rectangle is bounded
  // by the outermost drawn grid lines; the origin sides (L자/직선) are the axes.
  if (obj.showGrid) {
    const gdash = Math.max(sw * 3.5, 0.7);
    const addGrid = (x1, y1, x2, y2) => {
      const l = document.createElementNS(SVG_NS, "line");
      l.setAttribute("x1", x1); l.setAttribute("y1", y1);
      l.setAttribute("x2", x2); l.setAttribute("y2", y2);
      l.setAttribute("stroke", gridColor);
      l.setAttribute("stroke-width", sw * 0.5);
      l.setAttribute("stroke-dasharray", `${gdash} ${gdash * 0.85}`);
      g.appendChild(l);
    };
    // 격자선이 놓이는 정수 k 범위. gridCount·gridToData면 데이터 끝(마지막 눈금)까지;
    // 구경로면 박스-끝 한 칸 트리밍.
    let xLoK, xHiK, yLoK, yHiK;
    if (!legacyTrim) {
      xLoK = xBoth ? kx.kStart : Math.max(0, kx.kStart); xHiK = kx.kEnd;
      yLoK = yBoth ? ky.kStart : Math.max(0, ky.kStart); yHiK = ky.kEnd;
    } else {
      let gXhi = kx.kEnd * kx.step; if (atEdgeX(gXhi)) gXhi -= kx.step;
      let gXlo = kx.kStart * kx.step; if (atEdgeX(gXlo)) gXlo += kx.step;
      let gYhi = ky.kEnd * ky.step; if (atEdgeY(gYhi)) gYhi -= ky.step;
      let gYlo = ky.kStart * ky.step; if (atEdgeY(gYlo)) gYlo += ky.step;
      xLoK = Math.round(gXlo / kx.step); xHiK = Math.round(gXhi / kx.step);
      yLoK = Math.round(gYlo / ky.step); yHiK = Math.round(gYhi / ky.step);
    }
    // 격자 사각형 경계 = 마지막 눈금 + gridOver 칸(사진4: 데이터 밖으로 반 칸 더).
    const rectLeft  = xBoth ? worldXFromMathX(P, (xLoK - gridOver) * kx.step) : worldX0;
    const rectRight = worldXFromMathX(P, (xHiK + gridOver) * kx.step);
    const rectTop   = worldYFromMathY(P, (yHiK + gridOver) * ky.step);
    const rectBot   = yBoth ? worldYFromMathY(P, (yLoK - gridOver) * ky.step) : worldY0;
    if (kx.kEnd - kx.kStart <= GRID_MAX_LINES) {
      for (let k = xLoK; k <= xHiK; k++) {
        if ((!xBoth && k < 0) || skipTickX(k * kx.step)) continue;
        const vx = worldXFromMathX(P, k * kx.step);
        if (yAxisVisible && Math.abs(vx - worldX0) < 1e-6) continue; // axis draws this one
        addGrid(vx, rectTop, vx, rectBot);
      }
    }
    if (hasYArm && ky.kEnd - ky.kStart <= GRID_MAX_LINES) { // 직선이면 가로 격자 없음
      for (let k = yLoK; k <= yHiK; k++) {
        if ((!yBoth && k < 0) || skipTickY(k * ky.step)) continue;
        const vy = worldYFromMathY(P, k * ky.step);
        if (xAxisVisible && Math.abs(vy - worldY0) < 1e-6) continue;
        addGrid(rectLeft, vy, rectRight, vy);
      }
    }
  }

  // ----- AXIS LINES + arrowheads (scaled 1.5× like renderAxes) -----
  // 축선은 화살표 notch(가운데 파인 지점)까지만 그어 촉과 깔끔히 이어지게 한다.
  const headSw = sw * 1.5;
  const shaftGap = headSw * 3.6;   // = 화살표 notch 깊이(appendArrow의 len-notch)
  if (obj.showAxisLines) {
    if (xAxisVisible) {
      addLine(xAxisLeft, worldY0, right - shaftGap, worldY0, color, sw); // X axis → +X right
      appendArrow(g, right, worldY0, 1, 0, headSw, color);
    }
    if (hasYArm && yAxisVisible) {
      addLine(worldX0, yAxisBottom, worldX0, top + shaftGap, color, sw); // Y axis → +Y up
      appendArrow(g, worldX0, top, 0, -1, headSw, color);
    }
  }

  // ----- TICK MARKS on the visible axes (skip the origin + box-edge ends) -----
  // 눈금은 '데이터 쪽(안쪽)으로만' 뻗는다(요구): ㄴ자면 x축 눈금은 위로만(아래로 안 튀어나옴),
  // y축 눈금은 오른쪽으로만(왼쪽으로 안 튀어나옴). 반대쪽으로는 그 방향에 데이터가 있을 때만
  // (십자=양쪽). x축 아래쪽은 y가 음수 범위(yBoth)일 때만, y축 왼쪽은 x가 음수 범위(xBoth)일 때만.
  const tIn = sw * 3.4;              // 안쪽(데이터 쪽) 길이
  if (obj.showTicks) {
    if (xAxisVisible) {
      const up = tIn, down = yBoth ? tIn : 0;       // 위=항상, 아래=y음수범위일 때만
      if (kx.kEnd - kx.kStart <= GRID_MAX_LINES) for (let k = kx.kStart; k <= kx.kEnd; k++) {
        if (k === 0 || (!xBoth && k < 0) || skipTickX(k * kx.step)) continue;
        const vx = worldXFromMathX(P, k * kx.step);
        addLine(vx, worldY0 - up, vx, worldY0 + down, color, sw);  // -y = 위(안쪽)
      }
    }
    if (hasYArm && yAxisVisible) {
      const rightLen = tIn, leftLen = xBoth ? tIn : 0; // 오른쪽=항상, 왼쪽=x음수범위일 때만
      if (ky.kEnd - ky.kStart <= GRID_MAX_LINES) for (let k = ky.kStart; k <= ky.kEnd; k++) {
        if (k === 0 || (!yBoth && k < 0) || skipTickY(k * ky.step)) continue;
        const vy = worldYFromMathY(P, k * ky.step);
        addLine(worldX0 - leftLen, vy, worldX0 + rightLen, vy, color, sw); // +x = 오른쪽(안쪽)
      }
    }
  }

  // ----- TICK LABELS (숫자 또는 기호) -----
  const numSize = Math.max(obj.tickLabelSize || 2.6, 1);
  // 축↔라벨 간격: 눈금이 안쪽으로만 뻗으니 라벨을 축 바로 밑에 더 바짝(요구: 여전히 낮다).
  const tickGap = numSize * 0.04 + sw * 1.5;
  const addNumber = (text, nx, ny, anchor, baseline) => {
    if (rich) {
      const gl = renderGraphLabel(text, { x: nx, y: ny, size: numSize, color, anchor, vAlign: baselineToVAlign(baseline), halo: false });
      if (gl) g.appendChild(gl);
      return;
    }
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", nx); t.setAttribute("y", ny);
    t.setAttribute("font-size", numSize);
    // Upright serif numerals (math-axis convention); NOT the italic 물리량 font.
    t.setAttribute("font-family", "'Times New Roman', 'IBM Plex Serif', serif");
    t.setAttribute("fill", color);
    t.setAttribute("text-anchor", anchor);
    t.setAttribute("dominant-baseline", baseline);
    t.textContent = text;
    g.appendChild(t);
  };
  // 눈금 라벨 모드: "none"(없음) | "number"(자동 숫자) | "text"(문자 눈금 — t_0, 2t_0 등 직접).
  // 구파일 호환: tickLabelMode 없으면 showTickLabels로 판정. 문자 눈금은 양의 방향
  // k=1,2,3… 눈금에 배열 순서대로 붙는다(수식 가능 — rich 경로가 renderGraphLabel로 렌더).
  const tickMode = obj.tickLabelMode || (obj.showTickLabels ? "number" : "none");
  if (tickMode !== "none") {
    const labelFor = (k, step, arr) =>
      tickMode === "text" ? (k >= 1 && arr && arr[k - 1] != null ? String(arr[k - 1]) : "") : fmtTick(k * step);
    if (xAxisVisible) {
      if (kx.kEnd - kx.kStart <= GRID_MAX_LINES) for (let k = kx.kStart; k <= kx.kEnd; k++) {
        if (k === 0 || (!xBoth && k < 0) || skipTickX(k * kx.step)) continue;
        const txt = labelFor(k, kx.step, obj.tickTextX);
        if (!txt) continue;
        const vx = worldXFromMathX(P, k * kx.step);
        // 눈금 라벨을 눈금선보다 살짝 왼쪽으로(요구): 아래첨자(t₀의 ₀) 때문에 우측으로
        // 치우쳐 보이는 걸 보정.
        addNumber(txt, vx - numSize * 0.14, worldY0 + tickGap, "middle", "hanging");
      }
    }
    if (hasYArm && yAxisVisible) {
      if (ky.kEnd - ky.kStart <= GRID_MAX_LINES) for (let k = ky.kStart; k <= ky.kEnd; k++) {
        if (k === 0 || (!yBoth && k < 0) || skipTickY(k * ky.step)) continue;
        const txt = labelFor(k, ky.step, obj.tickTextY);
        if (!txt) continue;
        const vy = worldYFromMathY(P, k * ky.step);
        addNumber(txt, worldX0 - tickGap, vy, "end", "middle");
      }
    }
  }

  // ----- AXIS NAME LABELS + ORIGIN -----
  const nameSize = obj.axisLabelSize ? Math.max(obj.axisLabelSize, 1) : Math.max(sw * 14, 3);
  const addName = (text, lx, ly, anchor, baseline, size = nameSize) => {
    if (!text) return;
    if (rich) {
      // 혼합 라벨러: 한글 정자 + 영문 이탤릭 + 줄바꿈 + 수식 + halo.
      const gl = renderGraphLabel(text, { x: lx, y: ly, size, color, anchor, vAlign: baselineToVAlign(baseline), halo: true });
      if (gl) g.appendChild(gl);
      return;
    }
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", lx); t.setAttribute("y", ly);
    t.setAttribute("font-size", size);
    applyObjectLabelFont(t, obj.labelType);
    t.setAttribute("fill", color);
    t.setAttribute("text-anchor", anchor);
    t.setAttribute("dominant-baseline", baseline);
    fillTextWithRomanRuns(t, text);
    g.appendChild(t);
  };
  const showX = obj.showAxisLabels !== false && obj.showAxisLabelX !== false; // 라벨별 on/off
  const showY = obj.showAxisLabels !== false && obj.showAxisLabelY !== false;
  if (obj.showAxisLines) {
    const Lshape = (variant === "quadrant" || variant === "halfcross");
    if (Lshape) {
      // ㄴ/ㅏ(사진 기준): x이름 = 화살표의 '아래쪽 오른편', 눈금 숫자와 같은 줄에 나란히
      // (t₀·2t₀… 와 같은 높이, 화살표 오른쪽). y이름 = y축 화살표 '왼쪽 위'.
      // x이름 = 화살표 오른쪽 아래, 눈금 숫자·원점과 '같은 줄'에 오도록 baseline 정렬(요구: 빨간 점 위치).
      // 눈금 숫자(top=worldY0+tickGap)의 baseline ≈ worldY0 + tickGap + numSize*0.72. "x"가 더 커도
      // baseline을 맞추면 숫자와 한 줄로 읽힌다.
      const numBaseY = worldY0 + tickGap + numSize * 0.78;
      // 화살표 팁보다 왼쪽(대략 화살표 아래)로 — 요구: 더 왼쪽. start 앵커라 시작점을 팁 왼쪽에 둔다.
      if (xAxisVisible && showX) addName(obj.labelX, right - nameSize * 0.35, numBaseY, "start", "alphabetic");
      if (hasYArm && yAxisVisible && showY) addName(obj.labelY, worldX0 - nameSize * 0.32, top + nameSize * 0.85, "end", "auto");
    } else {
      // 십자/직선: x이름=화살표 위, y이름=y축 오른쪽 위.
      if (xAxisVisible && showX) addName(obj.labelX, right, worldY0 - nameSize * 0.5, "end", "auto");
      if (hasYArm && yAxisVisible && showY) addName(obj.labelY, worldX0 + nameSize * 0.6, top, "start", "hanging");
    }
  }
  // 원점 라벨: ㅏ자(halfcross)는 원점 "좌측"(요구 12), 그 외는 좌하단.
  if (obj.showOrigin && xAxisVisible && yAxisVisible) {
    const oText = obj.labelOrigin ?? "O";
    // 원점 라벨: 기본 크기 살짝 작게(nameSize*0.82) + 원점에 더 가까이(오프셋 축소).
    const oSize = nameSize * 0.82;
    if (variant === "halfcross") addName(oText, worldX0 - oSize * 0.35, worldY0, "end", "middle", oSize);
    else addName(oText, worldX0 - oSize * 0.22, worldY0 + oSize * 0.08, "end", "hanging", oSize);
  }

  // ----- rotation: whole plane turns about its bbox center -----
  const rot = obj.rotation ?? 0;
  if (rot) {
    const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
    g.setAttribute("transform", `rotate(${rot} ${cx} ${cy})`);
  }
  return g;
}

/* ===== FUNCGRAPH (step 3): a formula-driven open curve =====
 * points[] are already baked to WORLD mm by the sampler, so rendering is just the
 * open Catmull-Rom path — identical to an open `curve`. No arrowheads, no fill. */
// 불연속(점근선/극점)에서 sampler가 run을 끊어 두면 flat points[]에 큰 점프가 남는다.
// 그 점프를 그대로 이으면 존재하지 않는 가짜 세로선이 그려지므로, 인접 점 간 거리가
// (중앙값의 8배 이상으로) 크게 튀는 지점에서 서브패스를 분리해 개별 M으로 그린다.
function funcgraphPathD(pts) {
  if (!pts || pts.length < 2) return catmullRomPath(pts || []);
  const dists = [];
  for (let i = 1; i < pts.length; i++) dists.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const sorted = [...dists].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)] || 0;
  const thresh = med * 8;
  let run = [pts[0]];
  const parts = [];
  for (let i = 1; i < pts.length; i++) {
    if (med > 0 && dists[i - 1] > thresh) { parts.push(run); run = [pts[i]]; }
    else run.push(pts[i]);
  }
  parts.push(run);
  return parts.map((r) => catmullRomPath(r)).filter(Boolean).join(" ").trim();
}

// 직선/꺾은선 계열(사용자가 클릭으로 찍은 점): 점 사이를 곡선이 아니라 그냥 직선으로 잇는다.
function straightPathD(pts) {
  if (!pts || pts.length < 2) return "";
  return `M ${pts[0].x} ${pts[0].y} ` + pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ");
}

function renderFuncgraph(obj) {
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;

  const pts = obj.points || [];
  // curveStyle: "straight"(수동 계열 기본, 요구 ④의 직선/꺾은선) | "smooth"(함수식 기본, 기존 Catmull-Rom).
  const style = obj.curveStyle || (obj.sourceKind === "points" ? "straight" : "smooth");
  const el = document.createElementNS(SVG_NS, "path");
  el.setAttribute("d", style === "straight" ? straightPathD(pts) : funcgraphPathD(pts));
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", grayHex(obj.strokeLevel));
  el.setAttribute("stroke-width", obj.strokeWidth ?? 0.2);
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("stroke-linejoin", "round");
  applyDash(el, obj);
  g.appendChild(el);

  // 끝 라벨(요구 ⑬): 계열의 마지막 점 옆에 이름을 붙인다. 혼합 라벨러 재사용(한글정자+
  // 영문이탤릭+수식+halo) — 그래프 선 위에 걸쳐도 부드럽게 끊긴다(요구 ⑯).
  if (obj.endLabel && pts.length) {
    const last = pts[pts.length - 1];
    const prev = pts.length > 1 ? pts[pts.length - 2] : last;
    const dx = last.x - prev.x, dy = last.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const size = obj.endLabelSize || Math.max((obj.strokeWidth || 0.2) * 14, 3);
    // 선의 진행 방향으로 아주 살짝만 띄워 끝에 더 바짝(요구: 더 가까이). 거의 수직이면 오른쪽에.
    const nx = dx / len, ny = dy / len;
    const lx = last.x + nx * size * 0.18 + (Math.abs(nx) < 0.2 ? size * 0.28 : 0);
    const ly = last.y + ny * size * 0.18;
    const lbl = renderGraphLabel(obj.endLabel, {
      x: lx, y: ly, size, color: grayHex(obj.strokeLevel),
      anchor: nx >= 0 ? "start" : "end", vAlign: "middle", halo: true,
    });
    if (lbl) g.appendChild(lbl);
  }
  return g;
}

export { renderCoordplane, renderFuncgraph };

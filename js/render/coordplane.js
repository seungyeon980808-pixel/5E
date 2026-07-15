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
} from "./core.js?v=1.0.0";
import { worldXFromMathX, worldYFromMathY } from "../function-graph/coords.js?v=1.0.0";
import { renderGraphLabel } from "./graph-label.js?v=1.0.0";
import { renderPolyline } from "./shapes.js?v=1.0.0";

// dominant-baseline(구식 addName) → renderGraphLabel vAlign 매핑.
function baselineToVAlign(b) {
  return b === "hanging" ? "top" : b === "middle" ? "middle" : "baseline";
}

// Grid lines are deliberately light + thin (grayscale project); a hard cap keeps a
// tiny step over a wide range from spraying hundreds of lines.
const GRID_LEVEL = 160;        // light gray (0=black … 255=white) — 평가원 dashed grid(살짝 옅게)
const TICK_LEVEL = 140;        // 눈금 표시선: 축(검정)보다 확실히 옅은 회색(#8c8c8c). 격자(160)보단 살짝 진해 눈금으로 읽힘(요구: 회색)
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
  const tickColor = grayHex(TICK_LEVEL);   // 눈금 표시선 전용 회색(축선 색과 분리)
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
  // 음의 방향 축 팔은 범위가 실제로 음수까지 갈 때만 그린다(비대칭 범위 지원 — variant 대신
  // xMin/yMin으로 판정). 기존 3모양(ㄴ자·ㅏ자·십자)에선 결과가 동일하다.
  const xBoth = xMin < -1e-9;                              // x축 음의 방향도 그리나?
  const yBoth = hasYArm && yMin < -1e-9;                   // y축 음의 방향도?
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
  // 격자·눈금 칸 수: 방향별(pos/neg) 우선, 없으면 대칭 gridCountX/Y로 폴백(구파일 호환).
  const gcXpos = Number.isFinite(obj.gridCountXPos) ? obj.gridCountXPos : (Number.isFinite(obj.gridCountX) ? obj.gridCountX : null);
  const gcYpos = Number.isFinite(obj.gridCountYPos) ? obj.gridCountYPos : (Number.isFinite(obj.gridCountY) ? obj.gridCountY : null);
  const gcXneg = Number.isFinite(obj.gridCountXNeg) ? obj.gridCountXNeg : (Number.isFinite(obj.gridCountX) ? obj.gridCountX : gcXpos);
  const gcYneg = Number.isFinite(obj.gridCountYNeg) ? obj.gridCountYNeg : (Number.isFinite(obj.gridCountY) ? obj.gridCountY : gcYpos);
  const gridOver = Number.isFinite(obj.gridOver) ? obj.gridOver : 0;
  const kx = gcXpos != null ? { kStart: xBoth ? -gcXneg : 0, kEnd: gcXpos, step: stepX } : tickRange(xMin, xMax, stepX);
  const ky = gcYpos != null ? { kStart: yBoth ? -gcYneg : 0, kEnd: gcYpos, step: stepY } : tickRange(yMin, yMax, stepY);
  // 눈금/라벨 스킵 판정: gridCount·gridToData 경로에선 데이터 범위를 이미 정확히 캡했으니
  // 박스-끝 트리밍(atEdge)을 걸지 않는다. 구 좌표평면(둘 다 없음)에서만 atEdge로 다듬는다.
  const legacyTrim = gcXpos == null && !gridToData;
  const skipTickX = (v) => legacyTrim && atEdgeX(v);
  const skipTickY = (v) => (gcYpos == null && !gridToData) && atEdgeY(v);

  // ----- GRID (light, dashed — 평가원 style) -----
  // Every grid line spans the SAME grid rectangle so the ends line up cleanly
  // (no dashes poking into the one-cell axis margin, #3). The rectangle is bounded
  // by the outermost drawn grid lines; the origin sides (L자/직선) are the axes.
  if (obj.showGrid) {
    // 격자 스타일: 대시를 더 짧게(점에 가깝게) + 간격을 넓혀 성기게(요구: 스타일 변경).
    const gdash = Math.max(sw * 1.8, 0.4);
    const addGrid = (x1, y1, x2, y2) => {
      const l = document.createElementNS(SVG_NS, "line");
      l.setAttribute("x1", x1); l.setAttribute("y1", y1);
      l.setAttribute("x2", x2); l.setAttribute("y2", y2);
      l.setAttribute("stroke", gridColor);
      l.setAttribute("stroke-width", sw * 0.5);
      l.setAttribute("stroke-linecap", "round");            // 짧은 대시가 점처럼 둥글게
      l.setAttribute("stroke-dasharray", `${gdash} ${gdash * 1.35}`);
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
  const tIn = sw * 4.8;              // 안쪽(데이터 쪽) 길이 — 눈금을 조금 더 길게(요구)
  if (obj.showTicks) {
    if (xAxisVisible) {
      const up = tIn, down = yBoth ? tIn : 0;       // 위=항상, 아래=y음수범위일 때만
      if (kx.kEnd - kx.kStart <= GRID_MAX_LINES) for (let k = kx.kStart; k <= kx.kEnd; k++) {
        if (k === 0 || (!xBoth && k < 0) || skipTickX(k * kx.step)) continue;
        const vx = worldXFromMathX(P, k * kx.step);
        addLine(vx, worldY0 - up, vx, worldY0 + down, tickColor, sw);  // -y = 위(안쪽), 회색
      }
    }
    if (hasYArm && yAxisVisible) {
      const rightLen = tIn, leftLen = xBoth ? tIn : 0; // 오른쪽=항상, 왼쪽=x음수범위일 때만
      if (ky.kEnd - ky.kStart <= GRID_MAX_LINES) for (let k = ky.kStart; k <= ky.kEnd; k++) {
        if (k === 0 || (!yBoth && k < 0) || skipTickY(k * ky.step)) continue;
        const vy = worldYFromMathY(P, k * ky.step);
        addLine(worldX0 - leftLen, vy, worldX0 + rightLen, vy, tickColor, sw); // +x = 오른쪽(안쪽), 회색
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
  // 축 이름 전용: 저장된 오프셋(labelXOffset/labelYOffset)만큼 옮겨 그리고, 모달 드래그가
  // 잡을 수 있게 data-axisname으로 태깅한다(요구: 축 라벨 이동 가능).
  const offX = obj.labelXOffset && Number.isFinite(obj.labelXOffset.dx) ? obj.labelXOffset : { dx: 0, dy: 0 };
  const offY = obj.labelYOffset && Number.isFinite(obj.labelYOffset.dx) ? obj.labelYOffset : { dx: 0, dy: 0 };
  const addAxisName = (which, text, lx, ly, anchor, baseline) => {
    if (!text) return;
    const off = which === "x" ? offX : offY;
    const px = lx + (off.dx || 0), py = ly + (off.dy || 0);
    let el = null;
    if (rich) el = renderGraphLabel(text, { x: px, y: py, size: nameSize, color, anchor, vAlign: baselineToVAlign(baseline), halo: true });
    else {
      el = document.createElementNS(SVG_NS, "text");
      el.setAttribute("x", px); el.setAttribute("y", py); el.setAttribute("font-size", nameSize);
      applyObjectLabelFont(el, obj.labelType); el.setAttribute("fill", color);
      el.setAttribute("text-anchor", anchor); el.setAttribute("dominant-baseline", baseline);
      fillTextWithRomanRuns(el, text);
    }
    if (el) { el.setAttribute("data-axisname", which); g.appendChild(el); }
  };
  const showX = obj.showAxisLabels !== false && obj.showAxisLabelX !== false; // 라벨별 on/off
  const showY = obj.showAxisLabels !== false && obj.showAxisLabelY !== false;
  if (obj.showAxisLines) {
    const Lshape = (variant === "quadrant" || variant === "halfcross");
    if (Lshape) {
      // ㄴ/ㅏ(사진 기준): x이름 = 화살표의 '아래쪽 오른편', 눈금 숫자와 같은 줄에 나란히
      // (t₀·2t₀… 와 같은 높이, 화살표 오른쪽). y이름 = y축 화살표 '왼쪽 위'.
      const numBaseY = worldY0 + tickGap + numSize * 0.78;
      if (xAxisVisible && showX) addAxisName("x", obj.labelX, right - nameSize * 0.35, numBaseY, "start", "alphabetic");
      if (hasYArm && yAxisVisible && showY) addAxisName("y", obj.labelY, worldX0 - nameSize * 0.32, top + nameSize * 0.85, "end", "auto");
    } else {
      // 십자/직선: x이름=화살표 위, y이름=y축 오른쪽 위.
      if (xAxisVisible && showX) addAxisName("x", obj.labelX, right, worldY0 - nameSize * 0.5, "end", "auto");
      if (hasYArm && yAxisVisible && showY) addAxisName("y", obj.labelY, worldX0 + nameSize * 0.6, top, "start", "hanging");
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
// ----- Centripetal Catmull-Rom → 한 구간(p1→p2)의 큐빅 베지어 제어점 -----
// 지정한 점을 '정확히' 지나가는 보간 곡선(요구: 내가 찍은 점을 정확히 통과). 균일 방식은
// 점 간격이 들쭉날쭉하거나 급히 꺾이면 곡선이 출렁이거나 고리를 만든다(overshoot). 중심
// 매개변수(centripetal, α=0.5)는 그런 출렁임·꼬임 없이 매끄럽다(d3 curveCatmullRom 방식).
// 곡률 t: 제어점을 앵커에서 t배만큼 밀어 볼록함 조절(1=표준). 앵커는 그대로라 통과 보장.
function crBezierCP(p0, p1, p2, p3, t) {
  const EPS = 1e-12;
  const d01 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const d12 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const d23 = Math.hypot(p3.x - p2.x, p3.y - p2.y);
  const l01a = Math.sqrt(d01), l12a = Math.sqrt(d12), l23a = Math.sqrt(d23);
  let c1x = p1.x, c1y = p1.y, c2x = p2.x, c2y = p2.y;
  if (l01a > EPS) {
    const a = 2 * d01 + 3 * l01a * l12a + d12, n = 3 * l01a * (l01a + l12a);
    c1x = (p1.x * a - p0.x * d12 + p2.x * d01) / n;
    c1y = (p1.y * a - p0.y * d12 + p2.y * d01) / n;
  }
  if (l23a > EPS) {
    const b = 2 * d23 + 3 * l23a * l12a + d12, m = 3 * l23a * (l23a + l12a);
    c2x = (p2.x * b + p1.x * d23 - p3.x * d12) / m;
    c2y = (p2.y * b + p1.y * d23 - p3.y * d12) / m;
  }
  const s = Number.isFinite(t) ? t : 1;   // 곡률: 제어점을 앵커 기준 s배로 스케일
  if (s !== 1) {
    c1x = p1.x + (c1x - p1.x) * s; c1y = p1.y + (c1y - p1.y) * s;
    c2x = p2.x + (c2x - p2.x) * s; c2y = p2.y + (c2y - p2.y) * s;
  }
  return { c1x, c1y, c2x, c2y };
}
function catmullRomPathT(pts, t) {
  if (!pts || pts.length < 2) return "";
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  const n = pts.length;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)];
    const { c1x, c1y, c2x, c2y } = crBezierCP(p0, p1, p2, p3, t);
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}
// 곡선(스무딩) 렌더와 동일한 기하로 폴리라인을 촘촘한 점으로 편다(표시점/수선/화살표가
// '그려진 곡선 위'에 정확히 앉게 하는 용도). 렌더와 같은 centripetal 제어점을 써야 어긋나지 않는다.
function smoothSamplePts(pts, t, segs = 12) {
  if (!pts || pts.length < 3) return pts || [];
  const n = pts.length;
  const out = [{ x: pts[0].x, y: pts[0].y }];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)];
    const { c1x, c1y, c2x, c2y } = crBezierCP(p0, p1, p2, p3, t);
    for (let j = 1; j <= segs; j++) {
      const u = j / segs, v = 1 - u;
      out.push({
        x: v * v * v * p1.x + 3 * v * v * u * c1x + 3 * v * u * u * c2x + u * u * u * p2.x,
        y: v * v * v * p1.y + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * p2.y,
      });
    }
  }
  return out;
}
// 명시적 경계(breaks = 샘플러가 준 '새 run 시작 인덱스')로만 점 배열을 run으로 나눈다.
// 경계가 없으면 한 덩어리. 사용자가 찍은 꺾은선의 긴 구간이 임의로 끊기지 않게, 직선 계열은
// 이것만 쓴다(거리 추정 없음).
function splitByBreaks(pts, breaks) {
  if (!breaks || !breaks.length) return [pts];
  const set = new Set(breaks);
  const runs = []; let run = [];
  for (let i = 0; i < pts.length; i++) {
    if (set.has(i) && run.length) { runs.push(run); run = []; }
    run.push(pts[i]);
  }
  if (run.length) runs.push(run);
  return runs;
}
// 구파일(breaks 없이 저장된 함수식) 호환용: 이웃 점 간 거리가 튀는 곳에서 끊는다. 정확하진
// 않지만 없는 것보다 낫다. breaks가 있으면 그쪽이 우선(정확).
function distanceSplitRuns(pts) {
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
  return parts;
}
function funcgraphPathD(pts, curvature = 1, breaks) {
  if (!pts || pts.length < 2) return catmullRomPathT(pts || [], curvature);
  // breaks가 배열이면(빈 배열 포함) sampler가 준 정확한 경계 = 신뢰한다. 빈 배열 = 끊김 없는
  // 완전 연속 곡선 = 한 덩어리. breaks가 아예 없을 때(구파일)만 거리 휴리스틱으로 폴백한다.
  // ★ 예전엔 빈 배열도 휴리스틱으로 넘어가, 고주파 함수의 가파른 구간을 '끊김'으로 오판해
  //   연속 곡선을 여러 조각으로 쪼개고 큰 틈을 냈다(사진2·3 버그). Array.isArray로 해결.
  const runs = Array.isArray(breaks) ? splitByBreaks(pts, breaks) : distanceSplitRuns(pts);
  return runs.map((r) => catmullRomPathT(r, curvature)).filter(Boolean).join(" ").trim();
}

// 직선/꺾은선 계열(사용자가 클릭으로 찍은 점): 점 사이를 곡선이 아니라 그냥 직선으로 잇는다.
// breaks가 있으면(직선 모양 함수식) 그 경계에서만 끊고, 없으면 통째로 잇는다(종전과 동일).
function straightPathD(pts, breaks) {
  if (!pts || pts.length < 2) return "";
  return splitByBreaks(pts, breaks)
    .map((r) => r.length < 2 ? "" : `M ${r[0].x} ${r[0].y} ` + r.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" "))
    .filter(Boolean).join(" ").trim();
}

function renderFuncgraph(obj) {
  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;

  const pts = obj.points || [];
  // curveStyle: "straight"(수동 계열 기본, 요구 ④의 직선/꺾은선) | "smooth"(함수식 기본, 기존 Catmull-Rom).
  const style = obj.curveStyle || (obj.sourceKind === "points" ? "straight" : "smooth");
  const el = document.createElementNS(SVG_NS, "path");
  el.setAttribute("d", style === "straight" ? straightPathD(pts, obj.breaks) : funcgraphPathD(pts, obj.curvature, obj.breaks));
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

  // ----- 그래프 요소(표시점 ● / 수선의 발 / 구간 화살표) -----
  // 모달에서 세팅되어 fg에 세계좌표로 베이크된 것들. renderFuncgraph가 계열과 함께 그려
  // 미리보기·캔버스·저장이 한 경로로 통일된다(그래프 요소 원본 math 스펙은 markerXs/guideXs/
  // arrowSpecs로 함께 저장 — 재편집 시 모달이 되읽는다).
  const gc = grayHex(obj.strokeLevel);
  const gsw = obj.strokeWidth || 0.3;
  (obj.guideSegs || []).forEach((seg) => {
    if (!seg || seg.length < 2) return;
    const l = document.createElementNS(SVG_NS, "line");
    l.setAttribute("x1", seg[0].x); l.setAttribute("y1", seg[0].y);
    l.setAttribute("x2", seg[1].x); l.setAttribute("y2", seg[1].y);
    l.setAttribute("stroke", gc); l.setAttribute("stroke-width", gsw * 0.55);
    l.setAttribute("stroke-dasharray", "0.54 0.42"); l.setAttribute("stroke-linecap", "round"); // 대시·간격 40%↓(요구)
    g.appendChild(l);
  });
  (obj.arrowPolys || []).forEach((ap) => {
    if (!ap || !ap.points || ap.points.length < 2) return;
    const el = renderPolyline({
      type: "polyline", points: ap.points, arrowHead: ap.arrowHead, arrowVariant: ap.arrowVariant,
      strokeWidth: ap.strokeWidth || 0.525, strokeLevel: obj.strokeLevel,
    });
    if (el) g.appendChild(el);
  });
  (obj.markers || []).forEach((m) => {
    if (!m) return;
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", m.x); c.setAttribute("cy", m.y);
    c.setAttribute("r", obj.markerSize || Math.max(gsw * 1.82, 0.7)); // 요구: 종전 대비 30%↓
    c.setAttribute("fill", gc); c.setAttribute("stroke", "none");
    g.appendChild(c);
  });
  return g;
}

export { renderCoordplane, renderFuncgraph, smoothSamplePts };

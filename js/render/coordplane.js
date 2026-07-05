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
} from "./core.js?v=0.48.6";
import { worldXFromMathX, worldYFromMathY } from "../function-graph/coords.js?v=0.48.6";

// Grid lines are deliberately light + thin (grayscale project); a hard cap keeps a
// tiny step over a wide range from spraying hundreds of lines.
const GRID_LEVEL = 135;        // medium gray (0=black … 255=white) — 평가원 dashed grid
const GRID_MAX_LINES = 160;    // per axis; beyond this the grid is skipped

/* ----- simple filled-triangle arrowhead (평가원 style, no notch) ----- */
function appendArrow(g, tipX, tipY, dirX, dirY, sw, color) {
  const len = sw * 4.6, half = sw * 1.7;
  const bx = tipX - dirX * len, by = tipY - dirY * len;
  const px = -dirY, py = dirX; // unit perpendicular
  const poly = document.createElementNS(SVG_NS, "polygon");
  poly.setAttribute("points",
    `${tipX},${tipY} ${bx + px * half},${by + py * half} ${bx - px * half},${by - py * half}`);
  poly.setAttribute("fill", color);
  poly.setAttribute("stroke", "none");
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

  // ----- axis variant (형태): 십자(cross) / L자(quadrant) / 직선(single) — renderAxes와 동일 -----
  const variant = obj.axisVariant || "cross";
  const hasYArm   = variant !== "single";   // draw the vertical axis + its ticks/labels at all?
  const bothSides = variant === "cross";    // negative-side arms/ticks/labels/grid too?
  // Positive-only forms start each axis at the origin; fall back to the box edge
  // when 0 is outside the perpendicular range so the line never begins off-canvas.
  const xAxisLeft   = bothSides ? left   : (yAxisVisible ? worldX0 : left);
  const yAxisBottom = bothSides ? bottom : (xAxisVisible ? worldY0 : bottom);

  // Grid/ticks/numbers at the exact box edge read as a terminal "bar" ⊢ and crowd
  // the arrow; skip them so the GRID stops one cell short of the range (평가원:
  // 범위 [-5,5] → 격자 [-4,4]) and the axis ends cleanly with just the arrow.
  const atEdgeX = (v) => Math.abs(v - xMin) < 1e-6 || Math.abs(v - xMax) < 1e-6;
  const atEdgeY = (v) => Math.abs(v - yMin) < 1e-6 || Math.abs(v - yMax) < 1e-6;

  // ----- GRID (light, dashed — 평가원 style) -----
  // Every grid line spans the SAME grid rectangle so the ends line up cleanly
  // (no dashes poking into the one-cell axis margin, #3). The rectangle is bounded
  // by the outermost drawn grid lines; the origin sides (L자/직선) are the axes.
  if (obj.showGrid) {
    const gx = tickRange(xMin, xMax, obj.gridStepX || 1);
    const gy = tickRange(yMin, yMax, obj.gridStepY || 1);
    // outermost non-edge grid multiples (one cell inside the range)
    let gXhi = gx.kEnd * gx.step; if (atEdgeX(gXhi)) gXhi -= gx.step;
    let gXlo = gx.kStart * gx.step; if (atEdgeX(gXlo)) gXlo += gx.step;
    let gYhi = gy.kEnd * gy.step; if (atEdgeY(gYhi)) gYhi -= gy.step;
    let gYlo = gy.kStart * gy.step; if (atEdgeY(gYlo)) gYlo += gy.step;
    const rectTop   = worldYFromMathY(P, gYhi);
    const rectBot   = bothSides ? worldYFromMathY(P, gYlo) : worldY0; // origin side = x-axis
    const rectLeft  = bothSides ? worldXFromMathX(P, gXlo) : worldX0; // origin side = y-axis
    const rectRight = worldXFromMathX(P, gXhi);
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
    if (gx.kEnd - gx.kStart <= GRID_MAX_LINES) {
      for (let k = gx.kStart; k <= gx.kEnd; k++) {
        if ((!bothSides && k < 0) || atEdgeX(k * gx.step)) continue; // 양의 구역만 + 한 칸 짧게
        const vx = worldXFromMathX(P, k * gx.step);
        if (yAxisVisible && Math.abs(vx - worldX0) < 1e-6) continue; // axis draws this one
        addGrid(vx, rectTop, vx, rectBot);
      }
    }
    if (hasYArm && gy.kEnd - gy.kStart <= GRID_MAX_LINES) { // 직선이면 가로 격자 없음
      for (let k = gy.kStart; k <= gy.kEnd; k++) {
        if ((!bothSides && k < 0) || atEdgeY(k * gy.step)) continue;
        const vy = worldYFromMathY(P, k * gy.step);
        if (xAxisVisible && Math.abs(vy - worldY0) < 1e-6) continue;
        addGrid(rectLeft, vy, rectRight, vy);
      }
    }
  }

  // ----- AXIS LINES + arrowheads (scaled 1.5× like renderAxes) -----
  const headSw = sw * 1.5;
  const head = headSw * 4.5;
  if (obj.showAxisLines) {
    if (xAxisVisible) {
      addLine(xAxisLeft, worldY0, right - head * 0.6, worldY0, color, sw); // X axis → +X right
      appendArrow(g, right, worldY0, 1, 0, headSw, color);
    }
    if (hasYArm && yAxisVisible) {
      addLine(worldX0, yAxisBottom, worldX0, top + head * 0.6, color, sw); // Y axis → +Y up
      appendArrow(g, worldX0, top, 0, -1, headSw, color);
    }
  }

  // ----- TICK MARKS on the visible axes (skip the origin + box-edge ends) -----
  const tHalf = sw * 4;
  if (obj.showTicks) {
    if (xAxisVisible) {
      const tr = tickRange(xMin, xMax, obj.gridStepX || 1);
      for (let k = tr.kStart; k <= tr.kEnd; k++) {
        if (k === 0 || (!bothSides && k < 0) || atEdgeX(k * tr.step)) continue;
        const vx = worldXFromMathX(P, k * tr.step);
        addLine(vx, worldY0 - tHalf, vx, worldY0 + tHalf, color, sw);
      }
    }
    if (hasYArm && yAxisVisible) {
      const tr = tickRange(yMin, yMax, obj.gridStepY || 1);
      for (let k = tr.kStart; k <= tr.kEnd; k++) {
        if (k === 0 || (!bothSides && k < 0) || atEdgeY(k * tr.step)) continue;
        const vy = worldYFromMathY(P, k * tr.step);
        addLine(worldX0 - tHalf, vy, worldX0 + tHalf, vy, color, sw);
      }
    }
  }

  // ----- NUMERIC TICK LABELS (the coordplane-only feature) -----
  const numSize = Math.max(obj.tickLabelSize || 2.6, 1);
  const addNumber = (text, nx, ny, anchor, baseline) => {
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", nx);
    t.setAttribute("y", ny);
    t.setAttribute("font-size", numSize);
    // Upright serif numerals (math-axis convention); NOT the italic 물리량 font.
    t.setAttribute("font-family", "'Times New Roman', 'IBM Plex Serif', serif");
    t.setAttribute("fill", color);
    t.setAttribute("text-anchor", anchor);
    t.setAttribute("dominant-baseline", baseline);
    t.textContent = text;
    g.appendChild(t);
  };
  if (obj.showTickLabels) {
    if (xAxisVisible) {
      const tr = tickRange(xMin, xMax, obj.gridStepX || 1);
      for (let k = tr.kStart; k <= tr.kEnd; k++) {
        if (k === 0 || (!bothSides && k < 0) || atEdgeX(k * tr.step)) continue;
        const vx = worldXFromMathX(P, k * tr.step);
        addNumber(fmtTick(k * tr.step), vx, worldY0 + tHalf + numSize * 1.05, "middle", "hanging");
      }
    }
    if (hasYArm && yAxisVisible) {
      const tr = tickRange(yMin, yMax, obj.gridStepY || 1);
      for (let k = tr.kStart; k <= tr.kEnd; k++) {
        if (k === 0 || (!bothSides && k < 0) || atEdgeY(k * tr.step)) continue;
        const vy = worldYFromMathY(P, k * tr.step);
        addNumber(fmtTick(k * tr.step), worldX0 - tHalf - numSize * 0.5, vy, "end", "middle");
      }
    }
  }

  // ----- AXIS NAME LABELS (x / y) + ORIGIN (O) — equation font, toggleable -----
  const nameSize = obj.axisLabelSize ? Math.max(obj.axisLabelSize, 1) : Math.max(sw * 14, 3);
  const addName = (text, lx, ly, anchor, baseline) => {
    if (!text) return;
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", lx);
    t.setAttribute("y", ly);
    t.setAttribute("font-size", nameSize);
    applyObjectLabelFont(t, obj.labelType);
    t.setAttribute("fill", color);
    t.setAttribute("text-anchor", anchor);
    t.setAttribute("dominant-baseline", baseline);
    fillTextWithRomanRuns(t, text);
    g.appendChild(t);
  };
  if (obj.showAxisLines && obj.showAxisLabels !== false) {
    if (variant === "quadrant") {
      // L자(1사분면, 평가원): x는 x축 화살표 바로 오른쪽(축 높이), y는 y축 화살표 왼쪽.
      if (xAxisVisible) addName(obj.labelX, right + nameSize * 0.22, worldY0 - nameSize * 0.05, "start", "middle");
      if (hasYArm && yAxisVisible) addName(obj.labelY, worldX0 - nameSize * 0.5, top + nameSize, "end", "auto");
    } else {
      if (xAxisVisible) addName(obj.labelX, right, worldY0 - nameSize * 0.5, "end", "auto");
      if (hasYArm && yAxisVisible) addName(obj.labelY, worldX0 + nameSize * 0.6, top, "start", "hanging");
    }
  }
  // Origin "O" — below-left of the origin, only when the origin is on-screen (평가원).
  if (obj.showOrigin && xAxisVisible && yAxisVisible) {
    addName("O", worldX0 - nameSize * 0.35, worldY0 + nameSize * 0.35, "end", "hanging");
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
function renderFuncgraph(obj) {
  const el = document.createElementNS(SVG_NS, "path");
  el.setAttribute("d", catmullRomPath(obj.points || []));
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", grayHex(obj.strokeLevel));
  el.setAttribute("stroke-width", obj.strokeWidth ?? 0.2);
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("stroke-linejoin", "round");
  applyDash(el, obj);
  if (obj.id) el.dataset.id = obj.id;
  return el;
}

export { renderCoordplane, renderFuncgraph };

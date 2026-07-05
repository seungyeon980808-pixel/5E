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
  makeArrowHead,
  fillTextWithRomanRuns,
  applyObjectLabelFont,
  catmullRomPath,
  applyDash,
} from "./core.js?v=0.47.0";
import { worldXFromMathX, worldYFromMathY } from "../function-graph/coords.js?v=0.47.0";

// Grid lines are deliberately light + thin (grayscale project); a hard cap keeps a
// tiny step over a wide range from spraying hundreds of lines.
const GRID_LEVEL = 205;        // light gray (0=black … 255=white)
const GRID_MAX_LINES = 160;    // per axis; beyond this the grid is skipped

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

  // ----- GRID (light) — vertical at each gridStepX, horizontal at each gridStepY.
  if (obj.showGrid) {
    const gx = tickRange(xMin, xMax, obj.gridStepX || 1);
    const gy = tickRange(yMin, yMax, obj.gridStepY || 1);
    if (gx.kEnd - gx.kStart <= GRID_MAX_LINES) {
      for (let k = gx.kStart; k <= gx.kEnd; k++) {
        const vx = worldXFromMathX(P, k * gx.step);
        if (yAxisVisible && Math.abs(vx - worldX0) < 1e-6) continue; // axis draws this one
        addLine(vx, top, vx, bottom, gridColor, sw * 0.6);
      }
    }
    if (gy.kEnd - gy.kStart <= GRID_MAX_LINES) {
      for (let k = gy.kStart; k <= gy.kEnd; k++) {
        const vy = worldYFromMathY(P, k * gy.step);
        if (xAxisVisible && Math.abs(vy - worldY0) < 1e-6) continue;
        addLine(left, vy, right, vy, gridColor, sw * 0.6);
      }
    }
  }

  // ----- AXIS LINES + arrowheads (scaled 1.5× like renderAxes) -----
  const headSw = sw * 1.5;
  const head = headSw * 4.5;
  if (obj.showAxisLines) {
    if (xAxisVisible) {
      addLine(left, worldY0, right - head * 0.6, worldY0, color, sw);      // X axis → +X right
      g.appendChild(makeArrowHead(right, worldY0, 1, 0, headSw, color));
    }
    if (yAxisVisible) {
      addLine(worldX0, bottom, worldX0, top + head * 0.6, color, sw);      // Y axis → +Y up
      g.appendChild(makeArrowHead(worldX0, top, 0, -1, headSw, color));
    }
  }

  // ----- TICK MARKS on the visible axes (skip the origin) -----
  const tHalf = sw * 4;
  if (obj.showTicks) {
    if (xAxisVisible) {
      const tr = tickRange(xMin, xMax, obj.gridStepX || 1);
      for (let k = tr.kStart; k <= tr.kEnd; k++) {
        if (k === 0) continue;
        const vx = worldXFromMathX(P, k * tr.step);
        addLine(vx, worldY0 - tHalf, vx, worldY0 + tHalf, color, sw);
      }
    }
    if (yAxisVisible) {
      const tr = tickRange(yMin, yMax, obj.gridStepY || 1);
      for (let k = tr.kStart; k <= tr.kEnd; k++) {
        if (k === 0) continue;
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
        if (k === 0) continue;
        const vx = worldXFromMathX(P, k * tr.step);
        addNumber(fmtTick(k * tr.step), vx, worldY0 + tHalf + numSize * 1.05, "middle", "hanging");
      }
    }
    if (yAxisVisible) {
      const tr = tickRange(yMin, yMax, obj.gridStepY || 1);
      for (let k = tr.kStart; k <= tr.kEnd; k++) {
        if (k === 0) continue;
        const vy = worldYFromMathY(P, k * tr.step);
        addNumber(fmtTick(k * tr.step), worldX0 - tHalf - numSize * 0.5, vy, "end", "middle");
      }
    }
  }

  // ----- AXIS NAME LABELS (x / y) near each arrow tip (equation font) -----
  const nameSize = Math.max(sw * 14, 3);
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
  if (obj.showAxisLines) {
    if (xAxisVisible) addName(obj.labelX, right, worldY0 - nameSize * 0.5, "end", "auto");
    if (yAxisVisible) addName(obj.labelY, worldX0 + nameSize * 0.6, top, "start", "hanging");
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

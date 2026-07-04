/* ===== RENDER/CORE: shared SVG primitives + path/geometry helpers ===== */
// Bottom layer of the js/render/ module split — imports only app-level modules
// (state, text-rendering), never other js/render/ modules.

import {
  DEFAULT_TEXT_FONT,
  TOOL_LABEL_FONT_FAMILY,
  EQUATION_LETTER_SPACING,
  VARIABLE_LABEL_FONT_STYLE,
  OBJECT_LABEL_TYPES,
  OBJECT_LABEL_QUANTITY_FONT_FAMILY,
  OBJECT_LABEL_TEXT_FONT_FAMILY,
  resolveTextLetterSpacing,
} from "../state.js?v=0.43.0";
import { fillSvgTextWithRomanRuns } from "../text-rendering.js?v=0.43.0";

const SVG_NS = "http://www.w3.org/2000/svg";

/* ----- grayscale level (0??55) ??hex; 0 = black, 255 = white (DESIGN 7-2) ----- */
function grayHex(level = 0) {
  const v = Math.max(0, Math.min(255, Math.round(level)));
  const h = v.toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
}

/* ----- dashes (line/polyline/curve): SVG stroke-dasharray in world units (mm) ----- */
// Solid = dashLength 0 (or gap 0) ??no dasharray attribute set at all (DESIGN: presets).
function applyDash(el, obj) {
  const dl = obj.dashLength ?? 0;
  const dg = obj.dashGap ?? 0;
  if (dl > 0 && dg > 0) el.setAttribute("stroke-dasharray", `${dl} ${dg}`);
}

/* ----- arrowhead: filled triangle pointing in (dirX, dirY), tip at (tipX, tipY) ----- */
function makeArrowHead(tipX, tipY, dirX, dirY, strokeWidth, color) {
  const length     = strokeWidth * 4.5;
  const halfWidth  = strokeWidth * 1.8;
  const notchDepth = length * 0.3;

  const perpX = -dirY, perpY = dirX;

  const baseX = tipX - dirX * length;
  const baseY = tipY - dirY * length;

  const leftX  = baseX + perpX * halfWidth;
  const leftY  = baseY + perpY * halfWidth;
  const rightX = baseX - perpX * halfWidth;
  const rightY = baseY - perpY * halfWidth;

  const notchX = tipX - dirX * (length - notchDepth);
  const notchY = tipY - dirY * (length - notchDepth);

  const poly = document.createElementNS(SVG_NS, "polygon");
  poly.setAttribute("points", `${tipX},${tipY} ${leftX},${leftY} ${notchX},${notchY} ${rightX},${rightY}`);
  poly.setAttribute("fill", color);
  poly.setAttribute("stroke", "none");
  return poly;
}

/* ----- rotate point (px,py) about center (cx,cy) by deg degrees (SVG clockwise) ----- */
export function rotPt(px, py, cx, cy, deg) {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  const dx = px - cx, dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/* ----- point + travel direction at 50% of a polyline's total path length ----- */
// Used by polyline "center" arrowhead: visually natural midpoint of the whole path.
function polylineMidpoint(pts) {
  if (!pts || pts.length < 2) return null;
  const segLens = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const L = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    segLens.push(L);
    total += L;
  }
  if (total === 0) return null;
  const target = total / 2;
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    if (acc + segLens[i] >= target) {
      const a = pts[i], b = pts[i + 1];
      const L = segLens[i] || 1;
      const t = (target - acc) / L;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: (b.x - a.x) / L, dy: (b.y - a.y) / L };
    }
    acc += segLens[i];
  }
  return null;
}

/* ----- rounded corners (경사면처리): per-vertex quadratic fillet path ----- */
// Projection only — NEVER mutates points[]. Each interior vertex V becomes a
// quadratic Bezier whose CONTROL point is V itself, so straight slope/flat
// segments stay perfectly straight and only the joints round off (this is a
// per-vertex fillet, NOT a spline through all points). The back-off distance is
// clamped to a QUARTER of each adjacent segment, so each end loses at most 1/4
// and at least half of every segment ALWAYS stays straight (straight runs
// dominate, fillets stay narrow — as in the reference inclined-plane figure).
// Open path: P0 and Pn are left sharp (arrowhead direction unaffected).
function roundedPolylinePath(pts, radius, closed) {
  const P = pts || [];
  const n = P.length;
  if (n < 2) return "";
  const r = Math.max(0, radius || 0);
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  // point on segment V→T, `off` world units away from V (toward T)
  const backoff = (V, T, off) => {
    const L = dist(V, T);
    if (L === 0) return { x: V.x, y: V.y }; // zero-length segment: no movement
    return { x: V.x + ((T.x - V.x) / L) * off, y: V.y + ((T.y - V.y) / L) * off };
  };

  if (closed) {
    if (n < 3) return ""; // nothing to round below a triangle
    let d = "";
    for (let i = 0; i < n; i++) {
      const V = P[i];
      const A = P[(i - 1 + n) % n];
      const B = P[(i + 1) % n];
      const off = Math.min(r, 0.25 * dist(A, V), 0.25 * dist(V, B));
      const p1 = backoff(V, A, off);
      const p2 = backoff(V, B, off);
      d += i === 0 ? `M ${p1.x} ${p1.y}` : ` L ${p1.x} ${p1.y}`;
      d += ` Q ${V.x} ${V.y} ${p2.x} ${p2.y}`;
    }
    return d + " Z"; // Z draws the straight remainder of the wrap-around edge
  }

  let d = `M ${P[0].x} ${P[0].y}`;
  for (let i = 1; i < n - 1; i++) {
    const V = P[i];
    const A = P[i - 1];
    const B = P[i + 1];
    const off = Math.min(r, 0.25 * dist(A, V), 0.25 * dist(V, B));
    const p1 = backoff(V, A, off);
    const p2 = backoff(V, B, off);
    d += ` L ${p1.x} ${p1.y} Q ${V.x} ${V.y} ${p2.x} ${p2.y}`;
  }
  return d + ` L ${P[n - 1].x} ${P[n - 1].y}`;
}

/* ----- Catmull-Rom spline ??SVG cubic Bezier path string ----- */
// Passes through every anchor point. 2-point degenerate case = straight line.
function catmullRomPath(pts) {
  if (!pts || pts.length < 2) return "";
  if (pts.length === 2) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  }
  const n = pts.length;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, n - 1)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

/* ----- Catmull-Rom spline closed loop ??SVG cubic Bezier path string + Z ----- */
function catmullRomClosedPath(pts) {
  if (!pts || pts.length < 3) return "";
  const n = pts.length;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  d += " Z";
  return d;
}

/* ----- curve outline as a flat list of {x,y} samples (for snapping/hit-tests) -----
 * Mirrors catmullRomPath / catmullRomClosedPath exactly (same control points), so
 * the sampled polyline tracks the rendered curve. Projection-only; never mutates
 * obj.points. Closed curves include the wrap-around span. */
export function curveSamplePoints(obj, samplesPerSeg = 12) {
  const pts = (obj && obj.points) || [];
  const n = pts.length;
  if (n < 2) return pts.map((p) => ({ x: p.x, y: p.y }));
  if (n === 2) return [{ x: pts[0].x, y: pts[0].y }, { x: pts[1].x, y: pts[1].y }];
  const closed = obj.closed === true && n >= 3;
  const evalSeg = (p0, p1, p2, p3, t) => {
    const cp1x = p1.x + (p2.x - p0.x) / 6, cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6, cp2y = p2.y - (p3.y - p1.y) / 6;
    const u = 1 - t;
    const x = u * u * u * p1.x + 3 * u * u * t * cp1x + 3 * u * t * t * cp2x + t * t * t * p2.x;
    const y = u * u * u * p1.y + 3 * u * u * t * cp1y + 3 * u * t * t * cp2y + t * t * t * p2.y;
    return { x, y };
  };
  const out = [{ x: pts[0].x, y: pts[0].y }];
  const segCount = closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const p0 = closed ? pts[(i - 1 + n) % n] : pts[Math.max(i - 1, 0)];
    const p1 = closed ? pts[i] : pts[i];
    const p2 = closed ? pts[(i + 1) % n] : pts[i + 1];
    const p3 = closed ? pts[(i + 2) % n] : pts[Math.min(i + 2, n - 1)];
    for (let s = 1; s <= samplesPerSeg; s++) out.push(evalSeg(p0, p1, p2, p3, s / samplesPerSeg));
  }
  return out;
}

// A plain world-space stroke segment between two {x,y} points.
function cLine(a, b, sw, color) {
  const l = document.createElementNS(SVG_NS, "line");
  l.setAttribute("x1", a.x); l.setAttribute("y1", a.y);
  l.setAttribute("x2", b.x); l.setAttribute("y2", b.y);
  l.setAttribute("stroke", color); l.setAttribute("stroke-width", sw);
  return l;
}
// A centered glyph (shared by circle-body elements + diode terminal labels + optics label).
function cText(g, x, y, text, size, color, fontFamily = null, fontStyle = null, labelType = null) {
  const t = document.createElementNS(SVG_NS, "text");
  t.setAttribute("x", x); t.setAttribute("y", y);
  t.setAttribute("font-size", size);
  if (fontFamily || fontStyle) {
    applySvgTextFont(t, {
      family: fontFamily || TOOL_LABEL_FONT_FAMILY,
      style: fontStyle || VARIABLE_LABEL_FONT_STYLE,
      letterSpacing: fontFamily ? resolveTextLetterSpacing({ fontFamily }) : EQUATION_LETTER_SPACING,
    });
  } else {
    applyObjectLabelFont(t, labelType);
  }
  t.setAttribute("fill", color);
  t.setAttribute("text-anchor", "middle");
  t.setAttribute("dominant-baseline", "central");
  fillTextWithRomanRuns(t, text);
  g.appendChild(t);
}

// A stroke segment in the optics box (optional thicker `width`).
function oLine(g, x1, y1, x2, y2, sw, color, width) {
  const l = document.createElementNS(SVG_NS, "line");
  l.setAttribute("x1", x1); l.setAttribute("y1", y1);
  l.setAttribute("x2", x2); l.setAttribute("y2", y2);
  l.setAttribute("stroke", color); l.setAttribute("stroke-width", width || sw);
  g.appendChild(l);
}
// A quadratic-arc stroke (lens/mirror curves).
function oQuad(g, x0, y0, cx, cy, x1, y1, sw, color) {
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", `M ${x0} ${y0} Q ${cx} ${cy} ${x1} ${y1}`);
  p.setAttribute("fill", "none");
  p.setAttribute("stroke", color); p.setAttribute("stroke-width", sw);
  g.appendChild(p);
}
// Point on a quadratic Bézier at parameter t (for mirror hatch placement).
function quadPt(x0, y0, cx, cy, x1, y1, t) {
  const u = 1 - t;
  return { x: u * u * x0 + 2 * u * t * cx + t * t * x1, y: u * u * y0 + 2 * u * t * cy + t * t * y1 };
}
// Filled dot (point light / node / pivot center / pulley axle).
function oDot(g, cx, cy, r, color) {
  const c = document.createElementNS(SVG_NS, "circle");
  c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", r);
  c.setAttribute("fill", color);
  g.appendChild(c);
}
// Short 45° hatch ticks along a vertical line x=X, on side `sign` (mirror backing/screen).
function hatchVLine(g, X, top, bottom, sign, sw, color) {
  const n = 6, len = Math.min((bottom - top) * 0.12, 2) + 0.4;
  for (let i = 1; i <= n; i++) {
    const y = top + (bottom - top) * (i / (n + 1));
    oLine(g, X, y, X + sign * len, y - len, sw, color);
  }
}
// Thin vertical dashed line (lens optical-axis / center line). Follows the body
// color/strokeLevel but is drawn thinner than the lens outline.
function oDashV(g, x, y1, y2, sw, color) {
  const l = document.createElementNS(SVG_NS, "line");
  l.setAttribute("x1", x); l.setAttribute("y1", y1);
  l.setAttribute("x2", x); l.setAttribute("y2", y2);
  l.setAttribute("stroke", color);
  l.setAttribute("stroke-width", Math.max(sw * 0.6, 0.1));
  l.setAttribute("stroke-dasharray", "1.2 1");
  l.setAttribute("fill", "none");
  g.appendChild(l);
}

function applySvgTextFont(t, { family, style = "normal", weight = null, letterSpacing = null }) {
  t.setAttribute("font-family", family || DEFAULT_TEXT_FONT);
  t.setAttribute("font-style", style || "normal");
  if (weight) t.setAttribute("font-weight", weight);
  if (letterSpacing != null) t.setAttribute("letter-spacing", letterSpacing);
  else t.removeAttribute("letter-spacing");
}

/* ----- roman-numeral serif runs -----
 * Fill a <text>/<tspan> with `str`, wrapping standalone ASCII I/II/III runs in
 * the same serif/Myeongjo child <tspan> used by labeler text. Non-roman runs stay
 * in the parent's font. Export reuses renderObject, so SVG/PNG follow this path. */
const fillTextWithRomanRuns = fillSvgTextWithRomanRuns;

function resolveLabelType(labelType, fallback = "quantity") {
  return OBJECT_LABEL_TYPES.includes(labelType) ? labelType : fallback;
}

function applyObjectLabelFont(t, labelType, fallback = "quantity") {
  const resolved = resolveLabelType(labelType, fallback);
  if (resolved === "label") {
    applySvgTextFont(t, {
      family: OBJECT_LABEL_TEXT_FONT_FAMILY,
      style: "normal",
      letterSpacing: "normal",
    });
    return;
  }
  applySvgTextFont(t, {
    family: OBJECT_LABEL_QUANTITY_FONT_FAMILY,
    style: VARIABLE_LABEL_FONT_STYLE,
    letterSpacing: "normal",
  });
}

export {
  SVG_NS,
  grayHex,
  applyDash,
  makeArrowHead,
  polylineMidpoint,
  roundedPolylinePath,
  catmullRomPath,
  catmullRomClosedPath,
  quadPt,
  cLine,
  cText,
  oLine,
  oQuad,
  oDot,
  hatchVLine,
  oDashV,
  applySvgTextFont,
  fillTextWithRomanRuns,
  applyObjectLabelFont,
};

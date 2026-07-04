/* ===== GEOMETRY (pure math helpers) ===== */
//
// MOVE-ONLY extraction from tools.js (v0.43.0). Every function here is PURE:
// no module-level state, no DOM/SVG access — safe to import from anywhere.

function snapLineEnd(start, end, ctrlHeld) {
  if (!ctrlHeld) return end;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
  return {
    x: start.x + Math.cos(angle) * distance,
    y: start.y + Math.sin(angle) * distance,
  };
}

// perpendicular distance from point p to the segment a→b (world units).
function fdPerpDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const cx = a.x + t * dx, cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

// Ramer–Douglas–Peucker: drop points that lie within eps of the kept polyline.
function simplifyRDP(points, eps) {
  if (points.length < 3) return points.slice();
  let maxD = 0, idx = 0;
  const a = points[0], b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = fdPerpDist(points[i], a, b);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) {
    const left = simplifyRDP(points.slice(0, idx + 1), eps);
    const right = simplifyRDP(points.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

/* ----- Ctrl angle snap: snap the segment from `anchor` to `cur` to the nearest
 * 15° increment, keeping the same length. For axis-aligned angles (0/90/180/270)
 * the off-axis component is zeroed EXACTLY, so a horizontal stays exactly
 * horizontal (p1.y === p2.y) and a vertical stays exactly vertical (p1.x === p2.x)
 * with no float drift. Shared by BOTH the preview and the commit so they match. */
function snapAngle(anchor, cur) {
  const dx = cur.x - anchor.x, dy = cur.y - anchor.y;
  const dist = Math.hypot(dx, dy);
  const deg = Math.round((Math.atan2(dy, dx) * 180 / Math.PI) / 15) * 15;
  const rad = (deg * Math.PI) / 180;
  let nx = Math.cos(rad), ny = Math.sin(rad);
  const n = ((deg % 360) + 360) % 360;
  if (n === 0 || n === 180) ny = 0;   // horizontal: exact
  if (n === 90 || n === 270) nx = 0;  // vertical: exact
  return { x: anchor.x + nx * dist, y: anchor.y + ny * dist };
}

function mathAngleDeg(center, point) {
  return Math.atan2(-(point.y - center.y), point.x - center.x) * 180 / Math.PI;
}

function snappedDeg(deg) {
  return Math.round(deg / 15) * 15;
}

function normalizeSweep(deg) {
  let v = deg;
  while (v <= -180) v += 360;
  while (v > 180) v -= 360;
  return v;
}

/* ----- AABB intersection test (touching counts as intersecting) ----- */
function bboxIntersects(a, b) {
  return a.x <= b.x + b.w && a.x + a.w >= b.x &&
         a.y <= b.y + b.h && a.y + a.h >= b.y;
}

function localPointForSizeObject(o, p) {
  const deg = o.rotation || 0;
  if (!deg) return p;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const rad = -deg * Math.PI / 180;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

function triangleVertices(o) {
  const flipX = o.flipX ?? false;
  const flipY = o.flipY ?? false;
  if (!flipX && !flipY) {
    return [
      { x: o.x, y: o.y + o.h },
      { x: o.x + o.w, y: o.y + o.h },
      { x: o.x, y: o.y },
    ];
  }
  if (flipX && !flipY) {
    return [
      { x: o.x + o.w, y: o.y + o.h },
      { x: o.x, y: o.y + o.h },
      { x: o.x + o.w, y: o.y },
    ];
  }
  if (!flipX && flipY) {
    return [
      { x: o.x, y: o.y },
      { x: o.x + o.w, y: o.y },
      { x: o.x, y: o.y + o.h },
    ];
  }
  return [
    { x: o.x + o.w, y: o.y },
    { x: o.x, y: o.y },
    { x: o.x + o.w, y: o.y + o.h },
  ];
}

/* ----- point-in-triangle via consistent sign of edge cross products ----- */
function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/* ----- point-in-polygon via ray casting (for closed-polyline interior hits) ----- */
function pointInPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    const intersect = (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/* ----- shortest distance from point (px,py) to segment (ax,ay)-(bx,by) ----- */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const ex = px - (ax + t * dx), ey = py - (ay + t * dy);
  return Math.sqrt(ex * ex + ey * ey);
}

/* ----- Catmull-Rom cubic Bezier control points for segment i ??i+1 ----- */
function curveBezierSeg(pts, i) {
  const n = pts.length;
  const p0 = pts[Math.max(i - 1, 0)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(i + 2, n - 1)];
  return {
    sx: p1.x, sy: p1.y,
    cp1x: p1.x + (p2.x - p0.x) / 6, cp1y: p1.y + (p2.y - p0.y) / 6,
    cp2x: p2.x - (p3.x - p1.x) / 6, cp2y: p2.y - (p3.y - p1.y) / 6,
    ex: p2.x, ey: p2.y,
  };
}

/* ----- closed-curve Bezier control points for span i ??i+1 (indices wrap) ----- */
// The closing span (last ??first) is span i = n-1; neighbors wrap modulo n so the
// whole loop stays smooth, mirroring render's catmullRomClosedPath.
function curveBezierSegClosed(pts, i) {
  const n = pts.length;
  const p0 = pts[(i - 1 + n) % n];
  const p1 = pts[i];
  const p2 = pts[(i + 1) % n];
  const p3 = pts[(i + 2) % n];
  return {
    sx: p1.x, sy: p1.y,
    cp1x: p1.x + (p2.x - p0.x) / 6, cp1y: p1.y + (p2.y - p0.y) / 6,
    cp2x: p2.x - (p3.x - p1.x) / 6, cp2y: p2.y - (p3.y - p1.y) / 6,
    ex: p2.x, ey: p2.y,
  };
}

/* ----- evaluate cubic Bezier at parameter t ??[0,1] ----- */
function evalBezier(seg, t) {
  const u = 1 - t;
  return {
    x: u*u*u*seg.sx + 3*u*u*t*seg.cp1x + 3*u*t*t*seg.cp2x + t*t*t*seg.ex,
    y: u*u*u*seg.sy + 3*u*u*t*seg.cp1y + 3*u*t*t*seg.cp2y + t*t*t*seg.ey,
  };
}

export {
  segDist, pointInPolygon, pointInTriangle, triangleVertices,
  localPointForSizeObject, bboxIntersects,
  curveBezierSeg, curveBezierSegClosed, evalBezier,
  snapAngle, mathAngleDeg, snappedDeg, normalizeSweep,
  snapLineEnd, fdPerpDist, simplifyRDP,
};

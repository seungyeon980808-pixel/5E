/* ===== PICK (selection / hit-testing) ===== */
//
// MOVE-ONLY extraction from tools.js (v0.44.0): which object a world-space
// point selects. hitTest/getObjectBBox measure text/formula objects via the
// LIVE rendered SVG element (getBBox), so this module keeps its own _svg
// reference, assigned by initPick(svg) from initTools.

import { screenToWorld, getRenderScale } from "./viewport.js?v=0.48.5";
import { DEFAULT_TEXT_SIZE_MM } from "./state.js?v=0.48.5";
// Single-source circuit body geometry: hit-testing reuses the SAME polygon the
// renderer draws, so the clickable box and the visible box can never diverge.
import { circuitBodyPolygon, pendulumGeometry, pendulumBBox } from "./render.js?v=0.48.5";
import {
  segDist, pointInPolygon, pointInTriangle, triangleVertices,
  localPointForSizeObject, curveBezierSeg, curveBezierSegClosed, evalBezier,
  bboxIntersects,
} from "./geometry.js?v=0.48.5";

const HIT_TOL_PX = 6; // CSS px of slop around an edge so thin strokes are clickable
const LINE_HIT_TOL_PX = 20; // existing screen-space slop for line-family segments
const BASIC_LINE_MIN_HIT_WIDTH_PX = 24;

// A closed polyline keeps branch-B storage (point array) but takes branch-A
// (face) interaction ??selectable by interior, ratio-resizable, rotatable.
function isClosedPoly(o) { return o && o.type === "polyline" && o.closed === true; }
// A closed curve follows the SAME pattern: branch-B storage (anchor array) +
// branch-A (face) interaction. The gap is closed with a smooth curved span.
function isClosedCurve(o) { return o && o.type === "curve" && o.closed === true; }

let _svg = null;
export function initPick(svg) { _svg = svg; }

// A background-mode image that has NOT been recognized as an object is entirely
// unreachable via canvas interaction (click AND marquee) — it acts as if absent
// for selection purposes, while still rendering normally. This is deliberately
// INDEPENDENT of `locked` (DESIGN 6-3): once recognized it becomes a normal
// object and `locked` resumes its usual "protected but selectable" meaning.
function isBackgroundUnrecognized(obj) {
  return !!obj && obj.type === "image" && obj.mode === "background" && obj.locked === true;
}

function isLockedTracingImage(obj) {
  return !!obj && obj.type === "image" && (obj.imageSelectionLocked === true || (obj.mode === "background" && obj.locked === true));
}

function isObjectSelectable(state, obj) {
  if (!obj) return false;
  if (obj.id === "image-edit-session") return !!state.imageEditSession;
  if (isLockedTracingImage(obj)) return false;
  if (isBackgroundUnrecognized(obj)) return false;
  const layerId = obj.layerId ?? 1;
  const layer = (state.layers || []).find((item) => item.id === layerId);
  return !!layer && layer.visible !== false && layerId === state.activeLayerId;
}

function isPositionMovableForCursor(obj) {
  return obj && !obj.locked && !obj.positionLocked;
}

function isBasicLine(obj) {
  if (!obj || obj.type !== "line") return false;
  const arrowHead = obj.arrowHead ?? "none";
  const mode = obj.lineMode ?? obj.lineStyle ?? (arrowHead === "none" ? "solid" : "arrow");
  const dashed = (obj.dashLength ?? 0) > 0 && (obj.dashGap ?? 0) > 0;
  return mode === "solid" && arrowHead === "none" && !dashed;
}

function basicLineHitThreshold(line, renderScale) {
  const visibleStrokePx = (line.strokeWidth ?? 0) * renderScale;
  const hitWidthPx = Math.max(visibleStrokePx * 3, BASIC_LINE_MIN_HIT_WIDTH_PX);
  return hitWidthPx / 2 / renderScale;
}

function nearestBasicLine(objects, p, renderScale, isSelectable = () => true) {
  let nearestId = null;
  let nearestDistance = Infinity;
  for (let i = objects.length - 1; i >= 0; i--) {
    const line = objects[i];
    if (!isBasicLine(line) || !isSelectable(line)) continue;
    const distance = segDist(p.x, p.y, line.p1.x, line.p1.y, line.p2.x, line.p2.y);
    if (distance <= basicLineHitThreshold(line, renderScale) && distance < nearestDistance) {
      nearestDistance = distance;
      nearestId = line.id;
    }
  }
  return nearestId;
}

function pickSelectableObject(state, p, tol, lineTol) {
  const objects = state.imageEditSession
    ? [...state.objects, { ...state.imageEditSession, id: "image-edit-session" }]
    : state.objects;
  const selectableNonBasic = objects.filter((o) =>
    !isBasicLine(o) && isObjectSelectable(state, o)
  );
  const hitId = hitTest(selectableNonBasic, p, tol, lineTol);
  if (hitId !== null) return hitId;
  return nearestBasicLine(
    objects,
    p,
    getRenderScale(),
    (o) => isObjectSelectable(state, o)
  );
}

export function pickTolerances() {
  const scale = getRenderScale() || 1;
  return {
    tol: HIT_TOL_PX / scale,
    lineTol: LINE_HIT_TOL_PX / scale,
  };
}

export function pickSelectableObjectAtPoint(state, p) {
  const { tol, lineTol } = pickTolerances();
  return pickSelectableObject(state, p, tol, lineTol);
}

export function pickSelectableObjectFromEvent(svg, state, event) {
  if (!svg || !state || !event) return null;
  const p = screenToWorld(svg, state.viewBox, event.clientX, event.clientY);
  const id = pickSelectableObjectAtPoint(state, p);
  if (id === "image-edit-session") return state.imageEditSession ? { ...state.imageEditSession, id } : null;
  return id ? state.objects.find((o) => o.id === id) || null : null;
}

/* ----- hit-test: topmost shape whose ACTUAL outline/interior (grown outward) contains p ----- */
// Array order = z-order (last = top), so scan from the end. Each shape is tested
// against its REAL geometry (not just its bbox), expanded OUTWARD by margin =
// strokeWidth/2 (to reach the stroke's outer edge) + tol (a few screen px of
// click slack). Rect's bbox == its shape, so it keeps the bbox test; the ellipse
// and triangle use shape-specific tests so the empty bbox corners do NOT select.
function hitTest(objects, p, tol = 0, lineTol = tol) {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (o.type !== "rect" && o.type !== "ellipse" && o.type !== "triangle" &&
        o.type !== "line" && o.type !== "polyline" && o.type !== "curve" && o.type !== "funcgraph" &&
        o.type !== "text" && o.type !== "formula" && o.type !== "image" && o.type !== "svgAsset" && o.type !== "axes" && o.type !== "coordplane" &&
        o.type !== "anglearc" && o.type !== "rightangle" && o.type !== "circuit" &&
        o.type !== "optics" && o.type !== "apparatus" && o.type !== "labeler" &&
        o.type !== "pendulum") continue;

    if (o.type === "text" || o.type === "formula") {
      // Use the rendered SVG element's getBBox for an accurate hit area.
      const svgEl = _svg.querySelector(`[data-id="${o.id}"]`);
      if (!svgEl) continue;
      try {
        const bb = svgEl.getBBox();
        if (p.x >= bb.x - tol && p.x <= bb.x + bb.width + tol &&
            p.y >= bb.y - tol && p.y <= bb.y + bb.height + tol) return o.id;
      } catch (_) { /* element not in layout yet */ }
      continue;
    }
    // A line has no area: clickable band = stroke half-width + the screen-px
    // slack already converted to world units (tol = tolerancePx / currentZoom),
    // so the band stays visually constant at any zoom (DESIGN-style tolerance).
    const margin = (o.strokeWidth || 0) / 2 +
      ((o.type === "line" || o.type === "polyline" || o.type === "curve" || o.type === "funcgraph" || o.type === "circuit" || o.type === "pendulum") ? lineTol : tol);

    if (o.type === "line") {
      if (segDist(p.x, p.y, o.p1.x, o.p1.y, o.p2.x, o.p2.y) <= margin) return o.id;
      continue;
    }

    if (o.type === "circuit") {
      // Reuse the line hit-test along the p1→p2 axis (covers both leads and the
      // body's center line), plus the body box polygon for clicks on its off-axis
      // area. circuitBodyPolygon() is the SAME geometry the renderer draws.
      if (segDist(p.x, p.y, o.p1.x, o.p1.y, o.p2.x, o.p2.y) <= margin) return o.id;
      if (pointInPolygon(p.x, p.y, circuitBodyPolygon(o))) return o.id;
      continue;
    }

    if (o.type === "pendulum") {
      // Clickable = the real string segment, the real bob disk, and (when shown)
      // each ghost string/bob — the SAME geometry the renderer draws.
      const geo = pendulumGeometry(o);
      const onString = (a, b) => segDist(p.x, p.y, a.x, a.y, b.x, b.y) <= margin;
      const inBob = (c) => Math.hypot(p.x - c.x, p.y - c.y) <= geo.radius + margin;
      if (onString(geo.pivot, geo.bob) || inBob(geo.bob)) return o.id;
      if (o.showCenterGhost !== false && (onString(geo.pivot, geo.centerBob) || inBob(geo.centerBob))) return o.id;
      if (o.showSymmetricGhost !== false && (onString(geo.pivot, geo.symBob) || inBob(geo.symBob))) return o.id;
      continue;
    }

    if (o.type === "polyline") {
      // Hit if within margin of ANY segment between consecutive vertices.
      const pts = o.points || [];
      for (let k = 0; k < pts.length - 1; k++) {
        if (segDist(p.x, p.y, pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y) <= margin) return o.id;
      }
      // A CLOSED polyline behaves like a face: also test the closing edge AND
      // the interior (ray casting), so an inside click selects it too ??the
      // outline still selects via the segment loop above. Open polyline: edges only.
      if (isClosedPoly(o) && pts.length >= 3) {
        const last = pts[pts.length - 1], first = pts[0];
        if (segDist(p.x, p.y, last.x, last.y, first.x, first.y) <= margin) return o.id;
        if (pointInPolygon(p.x, p.y, pts)) return o.id;
      }
      continue;
    }

    if (o.type === "curve" || o.type === "funcgraph") {
      const pts = o.points || [];
      if (pts.length < 2) continue;
      if (pts.length === 2) {
        if (segDist(p.x, p.y, pts[0].x, pts[0].y, pts[1].x, pts[1].y) <= margin) return o.id;
        continue;
      }
      const SAMPLES = 12;
      // A CLOSED curve behaves like a face: sample EVERY span (incl. the closing
      // last?뭚irst span) finely into a polygon approximation, then accept an
      // interior click via point-in-polygon. The on-curve outline still hits too.
      if (isClosedCurve(o) && pts.length >= 3) {
        const poly = [];
        let hit = false;
        for (let k = 0; k < pts.length; k++) {
          const seg = curveBezierSegClosed(pts, k);
          let prev = { x: seg.sx, y: seg.sy };
          poly.push(prev);
          for (let s = 1; s <= SAMPLES; s++) {
            const cur = evalBezier(seg, s / SAMPLES);
            if (segDist(p.x, p.y, prev.x, prev.y, cur.x, cur.y) <= margin) hit = true;
            poly.push(cur);
            prev = cur;
          }
        }
        if (hit) return o.id;
        if (pointInPolygon(p.x, p.y, poly)) return o.id;
        continue;
      }
      // OPEN curve: sample each Catmull-Rom Bezier segment for fine outline hits.
      let hit = false;
      for (let k = 0; k < pts.length - 1 && !hit; k++) {
        const seg = curveBezierSeg(pts, k);
        let prev = { x: seg.sx, y: seg.sy };
        for (let s = 1; s <= SAMPLES; s++) {
          const cur = evalBezier(seg, s / SAMPLES);
          if (segDist(p.x, p.y, prev.x, prev.y, cur.x, cur.y) <= margin) { hit = true; break; }
          prev = cur;
        }
      }
      if (hit) return o.id;
      continue;
    }

    if (o.type === "rect" || o.type === "image" || o.type === "svgAsset" || o.type === "axes" || o.type === "coordplane" || o.type === "optics" || o.type === "apparatus") {
      // box == actual shape: outward-grown bbox containment (axes/coordplane/optics
      // select as one indivisible object via the bounding box; same as rect)
      const q = localPointForSizeObject(o, p);
      if (q.x >= o.x - margin && q.x <= o.x + o.w + margin &&
          q.y >= o.y - margin && q.y <= o.y + o.h + margin) return o.id;
      continue;
    }

    if (o.type === "anglearc") {
      // Selects as ONE indivisible object via its vertex-centered square bbox
      // (the transparent pie-sector body also makes the wedge a drag target).
      const r = o.radius || 0;
      if (p.x >= o.x - r - margin && p.x <= o.x + r + margin &&
          p.y >= o.y - r - margin && p.y <= o.y + r + margin) return o.id;
      continue;
    }

    if (o.type === "rightangle") {
      const r = (o.size || 0) * 1.6;
      if (p.x >= o.x - r - margin && p.x <= o.x + r + margin &&
          p.y >= o.y - r - margin && p.y <= o.y + r + margin) return o.id;
      continue;
    }

    if (o.type === "labeler") {
      // Hit on the leader segment (p1→p2) OR inside the label box centered at p2.
      const a = o.p1, b = o.p2;
      if (a && b) {
        if (segDist(p.x, p.y, a.x, a.y, b.x, b.y) <= margin) return o.id;
        const sz = o.labelSize || DEFAULT_TEXT_SIZE_MM;
        const half = sz * 0.7 + margin; // ~ one glyph box around the label point
        if (p.x >= b.x - half && p.x <= b.x + half &&
            p.y >= b.y - half && p.y <= b.y + half) return o.id;
      }
      continue;
    }

    if (o.type === "ellipse") {
      // inside the ellipse curve, grown outward by margin on each radius
      const rx = o.w / 2 + margin, ry = o.h / 2 + margin;
      if (rx <= 0 || ry <= 0) continue;
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      const q = localPointForSizeObject(o, p);
      const nx = (q.x - cx) / rx, ny = (q.y - cy) / ry;
      if (nx * nx + ny * ny <= 1) return o.id;
      continue;
    }

    if (o.type === "triangle") {
      const q = localPointForSizeObject(o, p);
      const [a, b, c] = triangleVertices(o);
      if (pointInTriangle(q.x, q.y, a.x, a.y, b.x, b.y, c.x, c.y)) return o.id;
      // hollow shapes also accept a click within margin of any edge
      if (o.fillNone && (
          segDist(q.x, q.y, a.x, a.y, b.x, b.y) <= margin ||
          segDist(q.x, q.y, b.x, b.y, c.x, c.y) <= margin ||
          segDist(q.x, q.y, c.x, c.y, a.x, a.y) <= margin)) return o.id;
      continue;
    }
  }
  return null;
}

/* ----- axis-aligned bounding box of any object (for marquee intersection) ----- */
function getObjectBBox(o) {
  if (o.type === "rect" || o.type === "ellipse" || o.type === "triangle" || o.type === "image" || o.type === "svgAsset" || o.type === "axes" || o.type === "coordplane" || o.type === "optics" || o.type === "apparatus") {
    return { x: o.x, y: o.y, w: o.w, h: o.h };
  }
  if (o.type === "anglearc") {
    const r = o.radius || 0;
    return { x: o.x - r, y: o.y - r, w: 2 * r, h: 2 * r };
  }
  if (o.type === "rightangle") {
    const r = (o.size || 0) * 1.6;
    return { x: o.x - r, y: o.y - r, w: 2 * r, h: 2 * r };
  }
  if (o.type === "line" || o.type === "circuit") {
    return {
      x: Math.min(o.p1.x, o.p2.x), y: Math.min(o.p1.y, o.p2.y),
      w: Math.abs(o.p2.x - o.p1.x), h: Math.abs(o.p2.y - o.p1.y),
    };
  }
  if (o.type === "pendulum") {
    return pendulumBBox(o);
  }
  if (o.type === "labeler") {
    const a = o.p1 || { x: 0, y: 0 }, b = o.p2 || a;
    const sz = (o.labelSize || DEFAULT_TEXT_SIZE_MM) * 0.7; // pad for the label glyph
    const minX = Math.min(a.x, b.x - sz), minY = Math.min(a.y, b.y - sz);
    const maxX = Math.max(a.x, b.x + sz), maxY = Math.max(a.y, b.y + sz);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (o.type === "polyline" || o.type === "curve" || o.type === "funcgraph") {
    const pts = o.points || [];
    if (!pts.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of pts) {
      if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (o.type === "text" || o.type === "formula") {
    const svgEl = _svg.querySelector(`[data-id="${o.id}"]`);
    if (!svgEl) return null;
    try { const bb = svgEl.getBBox(); return { x: bb.x, y: bb.y, w: bb.width, h: bb.height }; }
    catch (_) { return null; }
  }
  return null;
}

/* ----- marquee (drag) selection: geometry-aware, consistent with hitTest -----
 * BUG FIX: marquee used to select any object whose BBOX intersected the drag rect.
 * A thin line/curve (예: 경사면) has a bbox covering the whole figure, so a small
 * drag over empty space near it wrongly selected it — mismatching click, which
 * hit-tests the actual stroke. Now an OPEN line/polyline/curve is selected only
 * when its actual stroke segments intersect the rect; filled/box objects (and
 * closed poly/curve, whose interior click also selects) keep bbox-intersect. */
function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
function segSegCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
function segIntersectsRect(x1, y1, x2, y2, r) {
  if (pointInRect(x1, y1, r) || pointInRect(x2, y2, r)) return true;
  const rx2 = r.x + r.w, ry2 = r.y + r.h;
  return segSegCross(x1, y1, x2, y2, r.x, r.y, rx2, r.y) ||
         segSegCross(x1, y1, x2, y2, rx2, r.y, rx2, ry2) ||
         segSegCross(x1, y1, x2, y2, rx2, ry2, r.x, ry2) ||
         segSegCross(x1, y1, x2, y2, r.x, ry2, r.x, r.y);
}
// 열린 선형 객체의 실제 획 선분 목록(곡선은 베지어 샘플). 히트테스트와 동일 기하.
function objectStrokeSegments(o) {
  const segs = [];
  if (o.type === "line") { if (o.p1 && o.p2) segs.push([o.p1.x, o.p1.y, o.p2.x, o.p2.y]); return segs; }
  if (o.type === "polyline") {
    const pts = o.points || [];
    for (let k = 0; k < pts.length - 1; k++) segs.push([pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y]);
    return segs;
  }
  if (o.type === "curve" || o.type === "funcgraph") {
    const pts = o.points || [];
    if (pts.length < 2) return segs;
    if (pts.length === 2) { segs.push([pts[0].x, pts[0].y, pts[1].x, pts[1].y]); return segs; }
    const SAMPLES = 10;
    for (let k = 0; k < pts.length - 1; k++) {
      const seg = curveBezierSeg(pts, k);
      let prev = { x: seg.sx, y: seg.sy };
      for (let s = 1; s <= SAMPLES; s++) { const cur = evalBezier(seg, s / SAMPLES); segs.push([prev.x, prev.y, cur.x, cur.y]); prev = cur; }
    }
    return segs;
  }
  return segs;
}
function marqueeHitsObject(o, selRect) {
  const bb = getObjectBBox(o);
  if (!bb || !bboxIntersects(bb, selRect)) return false;          // 빠른 배제
  const isStroke = o.type === "line"
    || (o.type === "polyline" && !o.closed)
    || (o.type === "curve" && !o.closed)
    || o.type === "funcgraph"; // formula-driven open stroke — same as an open curve
  if (!isStroke) return true;                                     // 채움/박스/닫힌도형 = bbox로 충분
  return objectStrokeSegments(o).some((s) => segIntersectsRect(s[0], s[1], s[2], s[3], selRect));
}

export {
  isClosedPoly, isClosedCurve,
  isBackgroundUnrecognized, isLockedTracingImage, isObjectSelectable,
  isPositionMovableForCursor, isBasicLine, basicLineHitThreshold,
  nearestBasicLine, pickSelectableObject,
  hitTest, getObjectBBox, marqueeHitsObject,
};

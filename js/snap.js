/* ===== SNAP (DESIGN: object snapping during body-move drag) =====
 *
 * Ported from the original PyQt program's three move-time snap behaviors,
 * re-expressed for this data-as-truth model. transform.js calls resolveSnap()
 * once per mousemove in the body-move branch, BEFORE applyDelta, and applies
 * the returned (adjusted) delta.
 *
 * Three behaviors (faithful to _reference_pyqt/items.py):
 *   1) ALIGN  - always on, threshold SNAP_PX (7 screen px). Shifts the move so a
 *               dragged left/centerX/right or top/centerY/bottom line aligns with
 *               the same reference line of another object. Single closest match
 *               per axis. ORIGINAL CONSTRAINT: skipped when any dragged object is
 *               rotated (rotation !== 0), matching the original rotation()==0.
 *   2) MAGNET - only while Ctrl is held, threshold MAGNET_PX (22 screen px).
 *               Attaches the dragged group's bbox top-left to one of a neighbor's
 *               12 candidate edge points (4 sides x 3 alignments). Works for
 *               rotated objects too. Takes priority over ALIGN when it attaches.
 *   3) ENDPOINT (line) snap - NOT implemented in this pass (release-time).
 *
 * TEMPORARY DISABLE: if Alt is held during the drag, ALL snapping is bypassed
 * (raw delta passes through untouched).
 *
 * Coordinate basis: render.js singleObjBBox() (rotation-applied bbox). We never
 * use the unrotated hitTest. The dragged group is treated as ONE combined bbox.
 * A move is a pure translation, so the dragged group's proposed bbox is its
 * original bbox shifted by the raw delta (rotation/size unchanged).
 */

import { singleObjBBox } from "./render.js?v=0.32.0";

const SNAP_PX   = 7;   // ALIGN threshold (screen px; converted via zoom)
const MAGNET_PX = 22;  // MAGNET threshold (screen px; converted via zoom)

/* ----- translate a geometry clone of an object by (dx, dy) ----- */
function translatedClone(o, dx, dy) {
  const c = JSON.parse(JSON.stringify(o));
  if (c.type === "line") {
    c.p1 = { x: o.p1.x + dx, y: o.p1.y + dy };
    c.p2 = { x: o.p2.x + dx, y: o.p2.y + dy };
  } else if (c.type === "polyline" || c.type === "curve") {
    c.points = o.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  } else {
    c.x = (o.x || 0) + dx;
    c.y = (o.y || 0) + dy;
  }
  return c;
}

/* ----- proposed (rotation-applied) bbox of one dragged object at orig+delta -----
 * For text the bbox depends on the rendered glyph metrics, so we read the LIVE
 * element's bbox and re-anchor it at the proposed top-left. Everything else is
 * pure math via singleObjBBox on a translated clone. */
function proposedSingleBBox(orig, dx, dy, state, scene) {
  if (orig.type === "text") {
    const live = state.get().objects.find((o) => o.id === orig.id);
    const lbb = live ? singleObjBBox(live, scene) : null;
    if (lbb && live) {
      const offX = (orig.x + dx) - live.x;
      const offY = (orig.y + dy) - live.y;
      return { x: lbb.x + offX, y: lbb.y + offY, w: lbb.w, h: lbb.h };
    }
    return { x: (orig.x || 0) + dx, y: (orig.y || 0) + dy, w: orig.w || 0, h: orig.h || 0 };
  }
  return singleObjBBox(translatedClone(orig, dx, dy), scene);
}

/* ----- union the proposed bboxes of the whole dragged group ----- */
function proposedGroupBBox(origObjs, moveObjIds, dx, dy, state, scene) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of moveObjIds) {
    const orig = origObjs[id];
    if (!orig) continue;
    const b = proposedSingleBBox(orig, dx, dy, state, scene);
    if (!b) continue;
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/* ----- rotation-applied reference lines of every OTHER object ----- */
function targetLines(moveObjIds, state, scene) {
  const xs = [], ys = [];
  const moving = new Set(moveObjIds);
  for (const o of state.get().objects) {
    if (moving.has(o.id)) continue;
    const b = singleObjBBox(o, scene);
    if (!b) continue;
    xs.push(b.x, b.x + b.w / 2, b.x + b.w);
    ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return { xs, ys };
}

/* ----- ALIGN: single closest match per axis within threshold ----- */
function alignAdjust(box, lines, thresh) {
  const itemXs = [box.x, box.x + box.w / 2, box.x + box.w];
  const itemYs = [box.y, box.y + box.h / 2, box.y + box.h];
  let bestDx = 0, bd = thresh;
  for (const ix of itemXs) for (const tx of lines.xs) {
    const d = tx - ix;
    if (Math.abs(d) < bd) { bd = Math.abs(d); bestDx = d; }
  }
  let bestDy = 0; bd = thresh;
  for (const iy of itemYs) for (const ty of lines.ys) {
    const d = ty - iy;
    if (Math.abs(d) < bd) { bd = Math.abs(d); bestDy = d; }
  }
  return { dx: bestDx, dy: bestDy };
}

/* ----- MAGNET: attach dragged bbox top-left to a neighbor's 12 edge points -----
 * Returns the world-space top-left to snap to, or null if nothing is in range. */
function magnetAttach(box, moveObjIds, state, scene, thresh) {
  const w = box.w, h = box.h;
  const moving = new Set(moveObjIds);
  let best = null, bestD = thresh;
  for (const o of state.get().objects) {
    if (moving.has(o.id)) continue;
    const b = singleObjBBox(o, scene);
    if (!b) continue;
    const sx = b.x, sy = b.y, sw = b.w, sh = b.h;
    const cands = [
      // attach to neighbor's RIGHT side (top / center / bottom)
      { x: sx + sw, y: sy },
      { x: sx + sw, y: sy + (sh - h) / 2 },
      { x: sx + sw, y: sy + sh - h },
      // LEFT side
      { x: sx - w, y: sy },
      { x: sx - w, y: sy + (sh - h) / 2 },
      { x: sx - w, y: sy + sh - h },
      // BOTTOM side (left / center / right)
      { x: sx,                y: sy + sh },
      { x: sx + (sw - w) / 2, y: sy + sh },
      { x: sx + sw - w,       y: sy + sh },
      // TOP side
      { x: sx,                y: sy - h },
      { x: sx + (sw - w) / 2, y: sy - h },
      { x: sx + sw - w,       y: sy - h },
    ];
    for (const c of cands) {
      const d = Math.hypot(c.x - box.x, c.y - box.y);
      if (d < bestD) { bestD = d; best = c; }
    }
  }
  return best;
}

/* ----- public: resolve the snapped move delta for one mousemove frame ----- *
 * moveObjIds : ids of the dragged selection (group treated as one combined bbox)
 * origObjs   : { id -> pre-drag snapshot } captured at drag start
 * raw        : { dx, dy } proposed delta this frame (world units)
 * mods       : { alt, ctrl }  (Alt bypasses all snap; Ctrl enables magnet)
 * zoom       : screen px per world unit (getRenderScale), to convert thresholds
 * state      : the app store
 * scene      : SVG element (for text getBBox inside singleObjBBox)
 * returns adjusted { dx, dy } */
export function resolveSnap(moveObjIds, origObjs, raw, mods, zoom, state, scene) {
  if (mods && mods.alt) return raw;                 // temporary disable
  if (!moveObjIds || moveObjIds.length === 0) return raw;
  const z = zoom > 0 ? zoom : 1;

  const box = proposedGroupBBox(origObjs, moveObjIds, raw.dx, raw.dy, state, scene);
  if (!box) return raw;

  // 1) MAGNET (Ctrl only) - takes priority when it attaches.
  if (mods && mods.ctrl) {
    const att = magnetAttach(box, moveObjIds, state, scene, MAGNET_PX / z);
    if (att) {
      return { dx: raw.dx + (att.x - box.x), dy: raw.dy + (att.y - box.y) };
    }
  }

  // 2) ALIGN - always on, but only when no dragged object is rotated.
  const anyRotated = moveObjIds.some((id) => {
    const o = origObjs[id];
    return o && Math.abs(o.rotation || 0) > 1e-6;
  });
  if (!anyRotated) {
    const lines = targetLines(moveObjIds, state, scene);
    const adj = alignAdjust(box, lines, SNAP_PX / z);
    if (adj.dx || adj.dy) {
      return { dx: raw.dx + adj.dx, dy: raw.dy + adj.dy };
    }
  }

  return raw;
}

/* ===== RENDER/PENDULUM: simple pendulum symbol + geometry/bbox helpers ===== */

import { SVG_NS, grayHex } from "./core.js?v=0.44.2";
import { makeUprightLabel } from "./labels.js?v=0.44.2";
import { DEFAULT_TEXT_SIZE_MM } from "../state.js?v=0.44.2";

/* ===== SIMPLE PENDULUM (native object; pivot = p1, bob center = p2) =====
 * Data (see tools.js makePendulum): p1 (pivot/support), p2 (bob center),
 * bobRadius, showCenterGhost, showSymmetricGhost, showLengthLabel, lengthLabel.
 * All secondary geometry (ghost bobs, the vertical normal) is PROJECTION —
 * derived here from p1/p2, never stored — so move/rotate/endpoint-drag stay
 * correct with no extra bookkeeping (mirrors circuit's leads/body). */
export function pendulumGeometry(obj) {
  const pivot = obj.p1 || { x: 0, y: 0 };
  const bob = obj.p2 || pivot;
  const L = Math.hypot(bob.x - pivot.x, bob.y - pivot.y);
  const radius = pendulumBobRadius(obj, L);
  // Center ghost: straight down the vertical normal (SVG +y = downward), same L.
  const centerBob = { x: pivot.x, y: pivot.y + L };
  // Symmetric ghost: mirror the real bob across the vertical line through pivot
  // (same length, same angle from vertical, opposite side).
  const symBob = { x: 2 * pivot.x - bob.x, y: bob.y };
  return { pivot, bob, L, radius, centerBob, symBob };
}

// Bob radius scales with the pendulum length, clamped to a sensible mm range so
// short pendulums stay visible and long ones don't grow an oversized bob. An
// explicit stored bobRadius (e.g. after a future manual edit) always wins.
export function pendulumBobRadius(obj, L = null) {
  if (typeof obj.bobRadius === "number" && obj.bobRadius > 0) return obj.bobRadius;
  const len = L == null ? Math.hypot((obj.p2?.x ?? 0) - (obj.p1?.x ?? 0), (obj.p2?.y ?? 0) - (obj.p1?.y ?? 0)) : L;
  return Math.max(2, Math.min(8, len * 0.16));
}

function renderPendulum(obj) {
  const sw = obj.strokeWidth ?? 0.2;
  const color = grayHex(obj.strokeLevel);
  const { pivot, bob, L, radius, centerBob, symBob } = pendulumGeometry(obj);

  const g = document.createElementNS(SVG_NS, "g");
  if (obj.id) g.dataset.id = obj.id;

  const mkLine = (a, b, dashed) => {
    const ln = document.createElementNS(SVG_NS, "line");
    ln.setAttribute("x1", a.x); ln.setAttribute("y1", a.y);
    ln.setAttribute("x2", b.x); ln.setAttribute("y2", b.y);
    ln.setAttribute("stroke", color);
    ln.setAttribute("stroke-width", sw);
    if (dashed) ln.setAttribute("stroke-dasharray", `${sw * 4} ${sw * 3}`);
    return ln;
  };
  const mkCircle = (c, r, ghost) => {
    const ci = document.createElementNS(SVG_NS, "circle");
    ci.setAttribute("cx", c.x); ci.setAttribute("cy", c.y); ci.setAttribute("r", r);
    ci.setAttribute("fill", ghost ? "none" : "#d9d9d9");
    ci.setAttribute("stroke", color);
    ci.setAttribute("stroke-width", sw);
    if (ghost) ci.setAttribute("stroke-dasharray", `${sw * 4} ${sw * 3}`);
    return ci;
  };

  // ----- ghost pendulums (behind the real one): dashed string + hollow bob -----
  if (obj.showCenterGhost !== false && L > 0) {
    g.appendChild(mkLine(pivot, centerBob, true));
    g.appendChild(mkCircle(centerBob, radius, true));
  }
  if (obj.showSymmetricGhost !== false && L > 0) {
    g.appendChild(mkLine(pivot, symBob, true));
    g.appendChild(mkCircle(symBob, radius, true));
  }

  // ----- real pendulum: solid string, then the filled bob on top -----
  g.appendChild(mkLine(pivot, bob, false));
  g.appendChild(mkCircle(bob, radius, false));
  // small central dot inside the bob (matches the exam-style reference)
  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("cx", bob.x); dot.setAttribute("cy", bob.y);
  dot.setAttribute("r", Math.max(sw * 1.2, radius * 0.12));
  dot.setAttribute("fill", color);
  g.appendChild(dot);

  // ----- top pivot/support: a short ceiling bar with hatch marks -----
  const barHalf = Math.max(radius * 0.9, 3);
  const bar = document.createElementNS(SVG_NS, "line");
  bar.setAttribute("x1", pivot.x - barHalf); bar.setAttribute("y1", pivot.y);
  bar.setAttribute("x2", pivot.x + barHalf); bar.setAttribute("y2", pivot.y);
  bar.setAttribute("stroke", color);
  bar.setAttribute("stroke-width", sw * 1.4);
  g.appendChild(bar);
  const hatchN = 5;
  const hatch = Math.max(barHalf * 0.5, 1.4);
  for (let i = 0; i < hatchN; i++) {
    const hx = pivot.x - barHalf + (2 * barHalf) * (i / (hatchN - 1));
    const hl = document.createElementNS(SVG_NS, "line");
    hl.setAttribute("x1", hx); hl.setAttribute("y1", pivot.y);
    hl.setAttribute("x2", hx - hatch * 0.7); hl.setAttribute("y2", pivot.y - hatch);
    hl.setAttribute("stroke", color);
    hl.setAttribute("stroke-width", sw);
    g.appendChild(hl);
  }

  // ----- optional length label near the real string (physics-quantity style) -----
  if (obj.showLengthLabel !== false && String(obj.lengthLabel ?? "") && L > 0) {
    const mx = (pivot.x + bob.x) / 2, my = (pivot.y + bob.y) / 2;
    const dx = bob.x - pivot.x, dy = bob.y - pivot.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;      // string normal
    if (nx > 0) { nx = -nx; ny = -ny; }     // default to the left of the string
    const size = obj.labelSize || DEFAULT_TEXT_SIZE_MM;
    const off = size * 0.9;
    const lbl = makeUprightLabel(obj.lengthLabel, mx + nx * off, my + ny * off, color, size, { labelType: "quantity" });
    if (lbl) g.appendChild(lbl);
  }

  return g;
}

/* Axis-aligned bbox spanning the pivot, the real bob, and any visible ghost bobs
 * (each grown by its radius). Shared by render (guides/marker) + tools (marquee)
 * + transform (group bbox) so the selectable region matches what's drawn. */
export function pendulumBBox(o) {
  const { pivot, bob, radius, centerBob, symBob } = pendulumGeometry(o);
  const pts = [pivot];
  const bobs = [bob];
  if (o.showCenterGhost !== false) bobs.push(centerBob);
  if (o.showSymmetricGhost !== false) bobs.push(symBob);
  let minX = pivot.x, minY = pivot.y, maxX = pivot.x, maxY = pivot.y;
  for (const b of bobs) {
    if (b.x - radius < minX) minX = b.x - radius;
    if (b.y - radius < minY) minY = b.y - radius;
    if (b.x + radius > maxX) maxX = b.x + radius;
    if (b.y + radius > maxY) maxY = b.y + radius;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export { renderPendulum };

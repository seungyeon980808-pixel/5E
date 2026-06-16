/* ===== STATE (DESIGN 1-1: data is the single source of truth) ===== */
//
// The whole drawing is one plain data object. SVG is only a projection of it.
// In Phase 1A `objects` stays empty (zero shapes); render.js temporarily plots
// fixed-world-coordinate verification dots so the projection is visible.
//
// `viewBox` mirrors the SVG viewBox and is the ONLY coordinate authority
// (DESIGN 1-2). Zoom/pan mutate this, never a CSS transform.

import { createStore } from "./store.js";

/* ----- initial state ----- */
export const state = createStore({
  // objects: array of { id, type, ...props } — empty until Phase 1.
  objects: [],

  // viewBox: world-space rectangle currently shown (x, y, w, h).
  // 100 × 100 matches the future 100mm artboard (DESIGN §8-1).
  viewBox: { x: 0, y: 0, w: 100, h: 100 },

  // TEMP (Phase 1A only): fixed world-coordinate dots used to prove the
  // projection. Remove this field once real shape objects exist.
  verifyDots: [
    { x: 25, y: 25, r: 1.6, color: "#0969da" },
    { x: 75, y: 25, r: 1.6, color: "#0e7490" },
    { x: 50, y: 50, r: 1.6, color: "#0969da" },
    { x: 25, y: 75, r: 1.6, color: "#0e7490" },
    { x: 75, y: 75, r: 1.6, color: "#0969da" },
  ],
});

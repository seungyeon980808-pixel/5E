/* ===== FUNCTION-GRAPH / COORDS: math ↔ world-mm mapping for a coordplane ===== */
//
// The SINGLE source of truth for "수학 좌표 ↔ 월드 mm" (기획서 결정 C / §4). A
// coordplane owns a draw box (x,y,w,h in world mm) and a display range
// (xMin..xMax × yMin..yMax in math units); "1단위 = N mm" is NOT stored — it is
// derived here so the plane and every graph on it resize together (bbox is truth).
//
// Shared by the sampler, the preview modal, the inspector, and (extension) graph
// markers — so a graph drawn in the preview lands identically on the canvas.
//
// Convention: +X points right, +Y points UP → world y is flipped (math-up =
// screen-up = smaller SVG y). This module is PURE: no imports, no DOM.

/* ----- derived scale: mm per one math unit on each axis ----- */
// A degenerate range (xMax === xMin) would divide by zero; we return unit 0 so
// the mapping collapses to the box origin instead of producing NaN/Infinity.
function planeUnits(P) {
  const dx = P.xMax - P.xMin;
  const dy = P.yMax - P.yMin;
  return {
    unitX: dx !== 0 ? P.w / dx : 0,   // mm per math x-unit
    unitY: dy !== 0 ? P.h / dy : 0,   // mm per math y-unit
  };
}

/* ----- math → world (per axis) ----- */
function worldXFromMathX(P, mx) {
  const dx = P.xMax - P.xMin;
  return P.x + (dx !== 0 ? (mx - P.xMin) * (P.w / dx) : 0);
}
function worldYFromMathY(P, my) {
  const dy = P.yMax - P.yMin;
  // y flip: math yMax sits at the TOP of the box (smaller SVG y).
  return P.y + (dy !== 0 ? (P.yMax - my) * (P.h / dy) : 0);
}
function worldFromMath(P, mx, my) {
  return { x: worldXFromMathX(P, mx), y: worldYFromMathY(P, my) };
}

/* ----- world → math (per axis) — inverse of the above ----- */
// Used by the 정의역 드래그(화면→수학 x 환산) and hit-mapping.
function mathXFromWorldX(P, wx) {
  return P.w !== 0 ? P.xMin + (wx - P.x) * ((P.xMax - P.xMin) / P.w) : P.xMin;
}
function mathYFromWorldY(P, wy) {
  return P.h !== 0 ? P.yMax - (wy - P.y) * ((P.yMax - P.yMin) / P.h) : P.yMax;
}
function mathFromWorld(P, wx, wy) {
  return { x: mathXFromWorldX(P, wx), y: mathYFromWorldY(P, wy) };
}

/* ----- world coords of the math origin (0,0) ----- */
// The axis crosses the visible box only when 0 is inside the corresponding range;
// callers that draw the axis lines test that separately (0 in [xMin,xMax] etc.).
function originWorld(P) {
  return { x: worldXFromMathX(P, 0), y: worldYFromMathY(P, 0) };
}

export {
  planeUnits,
  worldFromMath, worldXFromMathX, worldYFromMathY,
  mathFromWorld, mathXFromWorldX, mathYFromWorldY,
  originWorld,
};

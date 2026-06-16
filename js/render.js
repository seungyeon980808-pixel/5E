/* ===== RENDER (DESIGN 1-1: SVG is a projection of state.objects) ===== */
//
// render(state) repaints the <g id="scene"> from data. It is registered as a
// store subscriber in main.js, so ANY state.update() repaints automatically —
// no caller ever invokes render() by hand. That is the data-as-truth proof.
//
// Phase 1A has zero real shapes, so we additionally plot temporary verification
// dots from state.verifyDots (fixed WORLD coordinates). They let us see the
// projection and prove two things:
//   1. changing the data array (via state.update) moves the dots on screen;
//   2. during zoom/pan the dots stay fixed in world space.

const SVG_NS = "http://www.w3.org/2000/svg";

/* ----- main draw: clear the scene group, repaint from state ----- */
export function render(state) {
  const scene = document.getElementById("scene");
  if (!scene) return;

  // Simplest correct projection: wipe and rebuild. Fine at Phase 1A scale;
  // a keyed/diffing pass can replace this once real objects exist.
  scene.replaceChildren();

  // ----- real objects (empty in 1A, but the loop is already here) -----
  for (const obj of state.objects) {
    const el = renderObject(obj);
    if (el) scene.appendChild(el);
  }

  // ----- TEMPORARY verification dots (remove once shapes land) -----
  drawVerifyDots(scene, state.verifyDots || []);
}

/* ----- per-object dispatch (stub until Phase 1 shapes exist) ----- */
function renderObject(obj) {
  // No shape types implemented yet (objects stays []). Placeholder for the
  // future type switch: rect / ellipse / line / polyline / arc / text.
  return null;
}

/* ===== TEMP: verification dots ===== */
function drawVerifyDots(scene, dots) {
  for (const d of dots) {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", d.x);
    c.setAttribute("cy", d.y);
    // radius in WORLD units → the dot scales with zoom (proves world-fixed).
    c.setAttribute("r", d.r ?? 1.6);
    c.setAttribute("fill", d.color || "#0969da");
    scene.appendChild(c);
  }
}

/* ===== RENDER FACADE =====
 * js/render.js was split into domain modules under js/render/ (v0.41.0).
 * This file only re-exports the symbols consumed outside the render layer
 * (main.js, snap.js, svg-export.js, templates.js, tools.js, transform.js),
 * so every existing `from "./render.js?v=..."` import keeps working. */

export { render, setSnapPreview, renderObject, singleObjBBox } from "./render/scene.js?v=0.54.51";
export { rotPt, curveSamplePoints } from "./render/core.js?v=0.54.51";
export { makeFillPattern } from "./render/fill.js?v=0.54.51";
export { circuitBodyPolygon } from "./render/circuit.js?v=0.54.51";
export { pendulumGeometry, pendulumBobRadius, pendulumBBox } from "./render/pendulum.js?v=0.54.51";

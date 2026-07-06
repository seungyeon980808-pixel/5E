/* ===== 6a: NODE (점) SINGLE-CLICK PLACEMENT =====
 * The node tool creates a default-size 점 on ONE click (atomic, not a drag).
 * With Shift held it snaps to the nearest straight edge/line OR object boundary
 * outline (rect/triangle edges, ellipse/circle/curve surfaces) via the SAME
 * shared resolveEndpointSnap path the line-endpoint snap uses; a single red dot
 * marks the snapped point and the click commits there.
 *
 * MOVE-ONLY extraction from tools.js: setupNodePlacement(svg, state) is called
 * from initTools. Space-held (pan) and the armed optics-kind stay owned by
 * tools.js and are read via its isSpaceHeld() / getOpticsKind() getters. */
// A 점 renders as a filled dot of radius = min(w,h) × NODE_DOT_RADIUS_RATIO (see
// render.js node drawer). Reference look: dot DIAMETER ≈ POINT_DIAMETER_PER_WIDTH
// × line width, so with the 0.2 mm default line width a new 점 is ≈ 1.0 mm Ø
// (0.5 mm radius). Tune POINT_DIAMETER_PER_WIDTH to rescale every new 점.

import { screenToWorld, getRenderScale } from "../viewport.js?v=0.51.0";
import { resolveEndpointSnap } from "../snap.js?v=0.51.0";
import { setSnapPreview } from "../render.js?v=0.51.0";
import { nextObjectId } from "./id.js?v=0.51.0";
import { isSpaceHeld, getOpticsKind } from "../tools.js?v=0.51.0";

const DEFAULT_STROKE_WIDTH = 0.2;     // mirrors tools.js default line width (DESIGN 3-2)
const POINT_DIAMETER_PER_WIDTH = 5;   // dot Ø ≈ 5 × line width (estimated from reference)
const NODE_DOT_RADIUS_RATIO = 0.22;   // must match render.js node drawer
const NODE_DEFAULT_SIZE =
  (DEFAULT_STROKE_WIDTH * POINT_DIAMETER_PER_WIDTH) / (2 * NODE_DOT_RADIUS_RATIO); // ≈ 2.27 mm bbox → 1.0 mm Ø dot

let _svg = null;
let _state = null;
let _nodePreviewActive = false; // a red dot is currently shown for node placement

function isNodeToolArmed() {
  return _state.get().activeTool === "OPTICS" && getOpticsKind() === "node";
}
function nodePlacementPoint(rawWorld, shiftHeld) {
  if (!shiftHeld) return { place: rawWorld, snapped: false };
  const snap = resolveEndpointSnap(rawWorld, [], getRenderScale(), _state);
  if (snap && snap.attach) return { place: snap.target, snapped: true };
  return { place: rawWorld, snapped: false };
}

export function setupNodePlacement(svg, state) {
  _svg = svg;
  _state = state;

  const clearNodePreview = () => {
    if (!_nodePreviewActive) return;
    _nodePreviewActive = false;
    setSnapPreview(null);
    _state.update(() => {});
  };
  // Hover preview: a single red dot at the snapped point while Shift is held.
  _svg.addEventListener("pointermove", (e) => {
    if (!isNodeToolArmed() || isSpaceHeld() || !e.shiftKey) { clearNodePreview(); return; }
    const raw = screenToWorld(_svg, _state.get().viewBox, e.clientX, e.clientY);
    const { place, snapped } = nodePlacementPoint(raw, true);
    if (!snapped) { clearNodePreview(); return; }
    setSnapPreview({ from: place, to: place });
    _nodePreviewActive = true;
    _state.update(() => {}); // repaint so the red dot follows the cursor
  });

  // Click commits a node at the (snapped) point.
  _svg.addEventListener("click", (e) => {
    if (e.button !== 0 || isSpaceHeld()) return;
    if (!isNodeToolArmed()) return;
    const raw = screenToWorld(_svg, _state.get().viewBox, e.clientX, e.clientY);
    const { place } = nodePlacementPoint(raw, e.shiftKey);
    const sz = NODE_DEFAULT_SIZE;
    _state.update((s) => {
      const snap = JSON.parse(JSON.stringify(s.objects));
      const obj = {
        id: nextObjectId(),
        type: "optics", kind: "node",
        x: place.x - sz / 2, y: place.y - sz / 2, w: sz, h: sz,
        rotation: 0, strokeLevel: 0, strokeWidth: 0.3,
        fillLevel: 255, fillNone: true,
        label: "", showLabel: false, labelPos: "above", labelType: "quantity",
        dashLength: 0, dashGap: 0, locked: false, positionLocked: false,
        layerId: s.activeLayerId, order: s.objects.length,
      };
      s.objects.push(obj);
      s.undoStack.push(snap);
      s.redoStack = [];
      s.selectedIds = [obj.id];
      s.activeTool = "V"; // auto-return to select after placing
    });
    setSnapPreview(null);
  });
}

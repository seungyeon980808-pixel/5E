/* ===== CLICK-TO-CLICK DRAWING (line L + polyline P — one shared mechanism) =====
//
// Both place vertices by CLICKING (no button hold). A running point list
// (draftPoints) is built one click at a time; a live SOLID rubber-band preview
// (state.draft, rendered as a polyline) runs from the last placed vertex to the
// mouse. The only difference between the tools is when they finish:
//   • LINE (L): the 2-point case — the 2nd click commits and finishes.
//   • POLYLINE (P): many points — double-click or Enter finishes (≥2 points).
// ESC cancels the whole draft (nothing committed). All clicks convert to world
// coords through the SHARED screenToWorld helper — no new coordinate math.
//
// ARC / RIGHTANGLE / LABELER reuse the SAME click-to-click locals and commit path.
//
// MOVE-ONLY extraction from tools.js: setupClickDrawing(svg, state) is called from
// initTools. Space-held (pan) state, the shared object builders (makeLine /
// makeCircuit / makePolyline / makeCurve), the commit gate (isCommittable) and the
// DEFAULT_STROKE_WIDTH / MIN_SIZE constants stay owned by tools.js and are read via
// its getters/exports. clearClickLocals is exported back so setActiveTool (tools.js)
// can discard an in-progress draft when another tool is armed. */

import { screenToWorld, getRenderScale } from "../viewport.js?v=0.54.6";
import { snapAngle, mathAngleDeg, snappedDeg, normalizeSweep } from "../geometry.js?v=0.54.6";
import { setSnapPreview } from "../render.js?v=0.54.6";
import { resolveEndpointSnap } from "../snap.js?v=0.54.6";
import { applyNewObjectStyleDefaults } from "../style-mode.js?v=0.54.6";
import { DEFAULT_TEXT_FONT, DEFAULT_TEXT_SIZE_MM } from "../state.js?v=0.54.6";
import { nextObjectId } from "./id.js?v=0.54.6";
import { openLabelerTextEditor } from "../text-editor.js?v=0.54.6";
import {
  isSpaceHeld,
  makeLine, makeCircuit, makePolyline, makeCurve, isCommittable,
  DEFAULT_STROKE_WIDTH, MIN_SIZE,
} from "../tools.js?v=0.54.6";

const CLICK_TOOLS = { L: "line", P: "polyline", C: "curve", CIRCUIT: "circuit" };

let _svg = null;
let _state = null;
let clickTool = null;     // armed click-to-click tool ("L"/"P"/"C"/"CIRCUIT") while drafting, else null
let draftPoints = [];     // world-space vertices placed so far
let mouseWorld = null;    // last mouse world pos, for the rubber-band segment

export function setupClickDrawing(svg, state) {
  _svg = svg;
  _state = state;

  // Each click appends a vertex. Line auto-commits at 2 points; polyline keeps going.
  _svg.addEventListener("click", (e) => {
    if (e.button !== 0) return;                  // left button only
    if (isSpaceHeld()) return;                    // Space+click = pan, not draw
    const tool = _state.get().activeTool;
    if (tool === "ARC") { handleArcClick(e); return; }
    if (tool === "RIGHTANGLE") { handleRightAngleClick(e); return; }
    if (tool === "LABELER") { handleLabelerClick(e); return; }
    if (!CLICK_TOOLS[tool]) return;               // only L / P place points
    const vb = _state.get().viewBox;
    let cur = screenToWorld(_svg, vb, e.clientX, e.clientY);
    // Shift (line tool) = snap the placed endpoint onto another object's edge/curve/
    // vertex (Feature C); takes precedence over Ctrl angle snap. Otherwise apply the
    // SAME Ctrl angle snap used for the live preview so the COMMITTED endpoint is
    // identical to what the preview showed (no last-pixel drift). See snapAngle.
    if (tool === "L" && e.shiftKey) {
      cur = snapDrawPoint(cur, true);
    } else if (e.ctrlKey && (tool === "L" || tool === "P" || tool === "CIRCUIT") && draftPoints.length > 0) {
      cur = snapAngle(draftPoints[draftPoints.length - 1], cur);
    }
    draftPoints.push(cur);
    clickTool = tool;

    if (tool === "L" && draftPoints.length === 2) { commitLine(); return; }
    if (tool === "CIRCUIT" && draftPoints.length === 2) { commitCircuit(); return; } // two-click, like line
    updateDraftPreview();                         // refresh the committed-segments preview
  });

  // Rubber-band: redraw preview from the placed points to the live mouse.
  window.addEventListener("mousemove", (e) => {
    if (!clickTool) return;
    const vb = _state.get().viewBox;
    let cur = screenToWorld(_svg, vb, e.clientX, e.clientY);
    // Shift (line tool) = live object-snap preview for the floating endpoint (Feature
    // C); precedence over Ctrl. Ctrl = 15° angle snap (line / polyline / circuit /
    // arc), sharing snapAngle with the commit path so preview and commit never diverge.
    if (clickTool === "L" && e.shiftKey) {
      cur = snapDrawPoint(cur, true);
    } else if (e.ctrlKey && (clickTool === "L" || clickTool === "P" || clickTool === "CIRCUIT" || clickTool === "ARC" || clickTool === "RIGHTANGLE" || clickTool === "LABELER") && draftPoints.length > 0) {
      cur = snapAngle(draftPoints[draftPoints.length - 1], cur);
    } else if (clickTool === "L") {
      setSnapPreview(null); // Shift released mid-draw: drop the stale overlay
    }
    mouseWorld = cur;
    updateDraftPreview();
  });

  // Double-click finishes a polyline or curve. Its two click events already
  // appended a duplicate vertex at the finish spot, so drop it before committing.
  _svg.addEventListener("dblclick", () => {
    if (clickTool !== "P" && clickTool !== "C") return;
    if (draftPoints.length > 0) draftPoints.pop();
    finishPolyline();
  });

  // Enter finishes a polyline/curve; Esc cancels any in-progress click draft.
  window.addEventListener("keydown", (e) => {
    if (!clickTool) return;
    if (e.key === "Escape") { e.preventDefault(); resetClickDraft(); }
    else if (e.key === "Enter" && (clickTool === "P" || clickTool === "C")) { e.preventDefault(); finishPolyline(); }
  });
}

// Live preview = the placed segments PLUS a rubber-band from the last vertex to
// the mouse. For curve, renders as a smooth curve preview so it matches the result.
function updateDraftPreview() {
  if (!clickTool || draftPoints.length === 0) return;
  if (clickTool === "ARC") { updateArcPreview(); return; }
  if (clickTool === "RIGHTANGLE") { updateRightAnglePreview(); return; }
  if (clickTool === "LABELER") { updateLabelerPreview(); return; }
  if (clickTool === "CIRCUIT") {
    // Live preview: leads + body, rebuilt from p1 and the floating mouse (p2).
    const end = mouseWorld || draftPoints[0];
    _state.update((s) => { s.draft = makeCircuit(draftPoints[0], end); });
    return;
  }
  const pts = mouseWorld ? [...draftPoints, mouseWorld] : draftPoints.slice();
  _state.update((s) => { s.draft = clickTool === "C" ? makeCurve(pts) : makePolyline(pts); });
}

// LINE: exactly two clicks. Commit a real line object, or cancel a zero-length one.
function commitLine() {
  const line = makeLine(draftPoints[0], draftPoints[1]);
  if (isCommittable(line)) commitClickShape(line);
  else resetClickDraft();
}

// CIRCUIT: exactly two clicks, mirroring the line tool. Commit one circuit object
// (undoable, auto-selected, returns to V via commitClickShape) or cancel a
// zero-length placement.
function commitCircuit() {
  const circ = makeCircuit(draftPoints[0], draftPoints[1]);
  if (isCommittable(circ)) commitClickShape(circ);
  else resetClickDraft();
}

/* ===== ANGLE ARC (ARC): two-click placement, mirroring the line tool ===== */
//
// Reuses the SAME click-to-click locals (draftPoints / mouseWorld / clickTool)
// and the SAME store commit path as the line tool — no new interaction machinery.
//   * Click 1 → vertex (x,y).
//   * Move    → live preview (vertex + rubber-band radius + arc; see render.js).
//   * Click 2 → start point: radius = dist(vertex,pt2), startAngle = atan2
//               direction vertex→pt2 in MATH convention (+Y up, like the inspector).
// sweepAngle defaults to 60°, refined afterward via the inspector/handles (no
// third click). Commit auto-selects the arc and returns to V; switching tools or
// ESC mid-gesture discards the draft (handled by setActiveTool / the ESC keydown).
function handleArcClick(e) {
  const vb = _state.get().viewBox;
  let cur = screenToWorld(_svg, vb, e.clientX, e.clientY);
  if (e.ctrlKey && draftPoints.length > 0) cur = snapAngle(draftPoints[0], cur);
  draftPoints.push(cur);
  clickTool = "ARC";
  mouseWorld = cur;
  if (draftPoints.length >= 3) { commitArc(); return; }
  updateArcPreview();
}

// Build an anglearc draft from the vertex and a point on its start radius. Mirrors
// the template's anglearc shape (templates.js) so the inspector works post-commit.
function makeAngleArcDraft(vertex, point, sweepPoint = null, ctrlKey = false) {
  const dx = point.x - vertex.x, dy = point.y - vertex.y;
  const radius = Math.hypot(dx, dy);
  // Math convention (+Y up): world y grows downward, so negate dy for atan2.
  let startAngle = mathAngleDeg(vertex, point);
  if (ctrlKey) startAngle = snappedDeg(startAngle);
  let sweepAngle = 60;
  if (sweepPoint) {
    let endAngle = mathAngleDeg(vertex, sweepPoint);
    if (ctrlKey) endAngle = snappedDeg(endAngle);
    sweepAngle = normalizeSweep(endAngle - startAngle);
  }
  return applyNewObjectStyleDefaults({
    id: null,                 // assigned on commit
    type: "anglearc",
    x: vertex.x,              // arc vertex
    y: vertex.y,
    radius,
    startAngle,               // math convention (CCW positive, +Y up)
    sweepAngle,
    label: "θ",
    labelType: "quantity",
    showLabel: true,
    strokeLevel: 0,           // 0 = black (DESIGN 2-2)
    strokeWidth: DEFAULT_STROKE_WIDTH,
    locked: false,
    positionLocked: false,
    layerId: 1,
    order: 0,                 // assigned on commit
  });
}

// Live preview: vertex + rubber-band radius + arc, driven by the floating mouse.
function updateArcPreview() {
  if (draftPoints.length === 0) return;
  const v = draftPoints[0];
  const start = draftPoints[1] || mouseWorld || v;
  const sweep = draftPoints.length >= 2 ? (mouseWorld || start) : null;
  _state.update((s) => { s.draft = makeAngleArcDraft(v, start, sweep); });
}

// Click 2 commits the arc through the shared store path (or discards a zero-radius
// placement, exactly like a zero-length line is discarded).
function commitArc() {
  const arc = makeAngleArcDraft(draftPoints[0], draftPoints[1], draftPoints[2]);
  if ((arc.radius || 0) < MIN_SIZE) { resetClickDraft(); return; }
  commitClickShape(arc);
}

function handleRightAngleClick(e) {
  const vb = _state.get().viewBox;
  let cur = screenToWorld(_svg, vb, e.clientX, e.clientY);
  if (e.ctrlKey && draftPoints.length > 0) cur = snapAngle(draftPoints[0], cur);
  draftPoints.push(cur);
  clickTool = "RIGHTANGLE";
  mouseWorld = cur;
  if (draftPoints.length >= 3) { commitRightAngle(); return; }
  updateRightAnglePreview();
}

function makeRightAngleDraft(vertex, firstPoint, sidePoint = null, ctrlKey = false) {
  const dx = firstPoint.x - vertex.x, dy = firstPoint.y - vertex.y;
  const size = Math.max(MIN_SIZE, Math.hypot(dx, dy));
  let angle = Math.atan2(dy, dx) * 180 / Math.PI;
  if (ctrlKey) angle = snappedDeg(angle);
  let orientation = 1;
  if (sidePoint) {
    const rad = angle * Math.PI / 180;
    const ax = Math.cos(rad), ay = Math.sin(rad);
    const bx = sidePoint.x - vertex.x, by = sidePoint.y - vertex.y;
    orientation = (ax * by - ay * bx) >= 0 ? 1 : -1;
  }
  return applyNewObjectStyleDefaults({
    id: null,
    type: "rightangle",
    x: vertex.x,
    y: vertex.y,
    size,
    angle,
    orientation,
    strokeLevel: 0,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    locked: false,
    positionLocked: false,
    layerId: 1,
    order: 0,
  });
}

function updateRightAnglePreview() {
  if (draftPoints.length === 0) return;
  const v = draftPoints[0];
  const first = draftPoints[1] || mouseWorld || v;
  const side = draftPoints.length >= 2 ? (mouseWorld || first) : null;
  _state.update((s) => { s.draft = makeRightAngleDraft(v, first, side); });
}

function commitRightAngle() {
  const marker = makeRightAngleDraft(draftPoints[0], draftPoints[1], draftPoints[2]);
  if ((marker.size || 0) < MIN_SIZE) { resetClickDraft(); return; }
  commitClickShape(marker);
}

/* ===== LABELER (지시선 + 이름): two-click placement, mirroring the line tool =====
 *
 * Reuses the SAME click-to-click locals + commit path as line/arc — no new
 * interaction machinery. Stores two world points like a line (p1 = leader anchor
 * on the graph, p2 = label position); render.js draws a short leader from p1 toward
 * p2 with a small end-gap, then the upright label at p2 (renderLabeler).
 *   * Click 1 → leader-line start (anchor on/near the graph).
 *   * Move    → live preview of leader + label.
 *   * Click 2 → label position → commit (auto-selects, returns to V).
 * Ctrl = 15° angle-snap of the label point relative to the anchor (shared with the
 * other click tools via snapAngle). No keyboard shortcut (tool button only). */
function makeLabelerDraft(anchor, labelPt) {
  return applyNewObjectStyleDefaults({
    id: null,                          // assigned on commit
    type: "labeler",
    p1: { x: anchor.x, y: anchor.y },  // leader anchor (graph side)
    p2: { x: labelPt.x, y: labelPt.y },// label position
    text: "㉠",                        // circled-letter preset (changeable in inspector)
    labelType: "label",
    fontFamily: DEFAULT_TEXT_FONT,     // Dotum-first normal text (callout default)
    labelSize: DEFAULT_TEXT_SIZE_MM,   // mm; settable in inspector
    strokeLevel: 0,                    // 0 = black (DESIGN 2-2)
    strokeWidth: DEFAULT_STROKE_WIDTH,
    locked: false,
    positionLocked: false,
    layerId: 1,
    order: 0,                          // assigned on commit
  });
}

function handleLabelerClick(e) {
  const vb = _state.get().viewBox;
  let cur = screenToWorld(_svg, vb, e.clientX, e.clientY);
  if (e.ctrlKey && draftPoints.length > 0) cur = snapAngle(draftPoints[0], cur);
  draftPoints.push(cur);
  clickTool = "LABELER";
  mouseWorld = cur;
  if (draftPoints.length >= 2) { commitLabeler(); return; }
  updateLabelerPreview();
}

function updateLabelerPreview() {
  if (draftPoints.length === 0) return;
  const a = draftPoints[0];
  const b = draftPoints[1] || mouseWorld || a;
  _state.update((s) => { s.draft = makeLabelerDraft(a, b); });
}

function commitLabeler() {
  const lab = makeLabelerDraft(draftPoints[0], draftPoints[1]);
  const d = Math.hypot(lab.p2.x - lab.p1.x, lab.p2.y - lab.p1.y);
  if (d < MIN_SIZE) { resetClickDraft(); return; } // zero-length placement: discard
  commitClickShape(lab);                 // assigns lab.id and pushes it into state
  // Two-click placement is preserved; right after committing, open the multiline
  // text editor (like the text tool) so the user types the label content directly.
  _state.update((s) => { s.selectedIds = lab.id ? [lab.id] : []; s.targetedId = null; });
  if (lab.id) openLabelerTextEditor(lab.id);
}

// POLYLINE / CURVE: needs ≥2 vertices; otherwise the draft is discarded.
function finishPolyline() {
  if (draftPoints.length < 2) { resetClickDraft(); return; }
  const shape = clickTool === "C" ? makeCurve(draftPoints) : makePolyline(draftPoints);
  commitClickShape(shape);
}

// Push a finished click-to-click shape through the SAME store path as the drag
// flow (id + z-order assigned on commit), then auto-return to V (DESIGN 4-3).
function commitClickShape(shape) {
  _state.update((s) => {
    // Snapshot the pre-creation objects so a single Ctrl+Z removes this shape.
    const snap = JSON.parse(JSON.stringify(s.objects));
    shape.id = nextObjectId();
    shape.order = s.objects.length;
    shape.layerId = s.activeLayerId;
    s.objects.push(shape);
    s.undoStack.push(snap);
    s.redoStack = [];
    s.draft = null;
    s.activeTool = "V";
  });
  clearClickLocals();
}

export function clearClickLocals() {
  draftPoints = [];
  clickTool = null;
  mouseWorld = null;
  setSnapPreview(null); // drop any transient endpoint-snap overlay
}

/* ----- Feature C: snap a line being DRAWN to other objects (Shift-gated) -----
 * MOVE-ONLY relocation of the active endpoint to the nearest edge/curve/vertex.
 * Shows the same projection-only preview overlay as the handle-edit path. Returns
 * the (possibly snapped) world point. No exclusions — the line isn't an object yet. */
function snapDrawPoint(world, shiftKey) {
  if (!shiftKey) { setSnapPreview(null); return world; }
  const snap = resolveEndpointSnap(world, [], getRenderScale(), _state);
  setSnapPreview(snap ? snap.preview : null);
  return snap && snap.attach ? { x: snap.target.x, y: snap.target.y } : world;
}

function resetClickDraft() {
  clearClickLocals();
  if (_state.get().draft) _state.update((s) => { s.draft = null; });
}

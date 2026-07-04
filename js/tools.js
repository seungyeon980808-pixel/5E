/* ===== TOOLS (DESIGN 짠3 tool selection + the rectangle draw pipeline) ===== */
//
// Two responsibilities, both routed through the store so data stays the truth:
//   1. Tool selection ??V (select) / R (rectangle), via buttons or keyboard.
//      The armed tool lives in state.activeTool.
//   2. Rectangle drawing ??mouse down?뭗rag?뭫p while R is armed. The drag builds
//      a `draft` rect (live preview via state.draft); mouse-up commits it into
//      state.objects, then auto-returns to V (DESIGN 4-3).
//
// Mouse points are screen pixels; they are converted to WORLD coords through
// screenToWorld BEFORE being stored, so shapes are anchored in world space and
// survive zoom/pan unchanged (DESIGN 1-2).

import { screenToWorld, getRenderScale, worldToScreen } from "./viewport.js?v=0.44.1";
import {
  TEXT_FONTS, DEFAULT_TEXT_FONT, DEFAULT_TEXT_SIZE_PX, DEFAULT_TEXT_SIZE_MM,
  TEXT_SIZE_PRESETS, ptToMm, mmToPt, MIN_TEXT_PT,
  EQUATION_FONT_FAMILY,
  resolveTextFontStyle, resolveTextLetterSpacing,
  normalizeTextRuns, normalizeTextRunStyle, textRunStyleFromObject, textRunsToText,
  hasStyledTextRuns, SECTION_ROMAN_STYLE, QUANTITY_STYLE,
} from "./state.js?v=0.44.1";
import { setSnapPreview, pendulumBobRadius } from "./render.js?v=0.44.1";
import { resolveEndpointSnap } from "./snap.js?v=0.44.1";
import { applyNewObjectStyleDefaults } from "./style-mode.js?v=0.44.1";
import { measureFormula, renderFormula, fontOf } from "./formula.js?v=0.44.1";
import { fillHtmlTextWithRomanRuns } from "./text-rendering.js?v=0.44.1";
import { getSvgAsset } from "./svg-assets.js?v=0.44.1";
// Pure math helpers (MOVE-ONLY extraction, v0.44.0) — see js/geometry.js.
import {
  snapLineEnd, snapAngle, mathAngleDeg, snappedDeg, normalizeSweep,
  simplifyRDP, bboxIntersects,
} from "./geometry.js?v=0.44.1";
// Selection / hit-testing (MOVE-ONLY extraction, v0.44.0) — see js/pick.js.
// initPick(svg) hands pick.js the live SVG root for text/formula getBBox measurement.
import {
  initPick, pickSelectableObjectAtPoint, pickSelectableObjectFromEvent,
  isPositionMovableForCursor, isLockedTracingImage, isBackgroundUnrecognized,
  getObjectBBox,
} from "./pick.js?v=0.44.1";
// Re-export the picking API at its historical home so existing importers of
// tools.js (transform.js: pickSelectableObjectFromEvent, and any future callers
// of pickTolerances / pickSelectableObjectAtPoint) keep working unchanged.
export { pickTolerances, pickSelectableObjectAtPoint, pickSelectableObjectFromEvent } from "./pick.js?v=0.44.1";
// Text/formula editing subsystem (MOVE-ONLY extraction, v0.44.0) — see js/text-editor.js.
// initTextEditing(svg, state) registers the text tool + click-to-edit + shortcuts +
// context menu (called from initTools). isTextEditorOpen() replaces the old direct
// _textEditor reads in setupDrawing; cancelActive*Editor are called by setActiveTool.
import {
  initTextEditing, isTextEditorOpen,
  startEditingTextObject, openLabelerTextEditor, openAngleArcLabelEditor, insertLabelerChar,
  cancelActiveTextEditor, cancelActiveFormulaEditor,
} from "./text-editor.js?v=0.44.1";
// Re-export the editor entry points at their historical home so existing importers of
// tools.js keep working unchanged (inspector/section-geometry.js imports
// openAngleArcLabelEditor; the openers are also used internally by the drawing code).
export { startEditingTextObject, openLabelerTextEditor, openAngleArcLabelEditor, insertLabelerChar } from "./text-editor.js?v=0.44.1";

// Default look until the inspector exists (DESIGN 짠3-2: border only, hollow).
const DEFAULT_STROKE_WIDTH = 0.2; // world units (mm)
const MIN_SIZE = 0.3; // world units; ignore stray clicks that draw nothing
const TEXT_EDITOR_PX = 14; // on-screen px of the text editor (matches .text-editor-overlay font-size)
const TEXT_LINE_HEIGHT = 1.4; // matches .text-editor-overlay line-height AND renderText() tspan dy
// A textarea centers its glyphs in the line box, so the first line sits half a
// leading below the element top. The committed SVG <text> uses dominant-baseline:
// hanging (glyph top AT the anchor), so we shift the editor up by that half-leading
// to keep the draft and the final text from jumping vertically on commit.
const TEXT_HALF_LEADING_PX = TEXT_EDITOR_PX * (TEXT_LINE_HEIGHT - 1) / 2;

let _svg = null;
let _state = null;
let _idCounter = 0;

// Which circuit element / optics kind the next placement creates. Set via
// armSymbol() when a left-panel symbol button is clicked; the placement pipelines
// read these so a single CIRCUIT/OPTICS tool covers every variant.
let _circuitElement = "resistor";
let _opticsKind = "convex_lens";
let _apparatusKind = "wire";
let _svgAssetId = "pulley";
const APPARATUS_TEMPLATE_IDS = {
  wire: "E001",
  compass: "E002",
  pulley: "M001",
  clamp: "M004",
  scale: "M003",
};
const CIRCUIT_CAP_GAP_DEFAULT = 2; // capacitor plate gap default (mm); mirrors render.js

// The UNIQUE id (data-symbol) of the library symbol currently armed, or null when
// a plain drawing tool is active. Drives single-button highlight in syncButtons:
// many symbols share ONE placement tool (CIRCUIT/OPTICS/ARC) but each button has a
// unique data-symbol, so exactly one highlights — fixing the old all-CIRCUIT /
// all-OPTICS multi-highlight where every button matching data-tool lit up.
let _activeSymbolId = null;
// Tools that a library symbol arms (vs. the plain V/R/O/... drawing tools). While
// one of these is active, _activeSymbolId names WHICH symbol armed it; any other
// tool (incl. auto-return to V after a commit) means no symbol is armed.
const SYMBOL_TOOLS = new Set(["CIRCUIT", "OPTICS", "ARC", "APPARATUS", "SVGASSET", "RIGHTANGLE", "LABELER", "PENDULUM"]);

/* ----- public: wire buttons, keyboard, and the drawing gestures ----- */
export function initTools(svg, state) {
  _svg = svg;
  initPick(svg); // pick.js keeps its own _svg for text/formula getBBox hit-testing
  _state = state;

  setupButtons();
  setupKeyboard();
  setupDrawing();
  setupClickDrawing();
  setupFreeDraw();
  setupNodePlacement();
  initTextEditing(_svg, _state); // text tool + click-to-edit + shortcuts + context menu

  // Keep the tool buttons in sync with state.activeTool on every change.
  state.subscribe((s) => syncButtons(s.activeTool));
  syncButtons(state.get().activeTool);
}

/* ----- tool selection: the one path that changes the armed tool ----- */
function setActiveTool(tool) {
  if (_state.get().activeTool === tool) return;
  clearClickLocals(); // arming another tool discards any in-progress click draft
  cancelActiveTextEditor(); // discard any in-progress text edit
  cancelActiveFormulaEditor(); // discard any in-progress formula edit
  _state.update((s) => {
    s.activeTool = tool;
    s.draft = null; // arming another tool discards any unfinished draft
  });
}

/* ----- left-panel buttons (the plain V/R/O/Y/L/P/C/T/rotate drawing tools) ----- */
// These map ONE button to ONE tool via data-tool. Library symbol buttons are NOT
// wired here — they carry data-symbol and are handled by templates.js, which calls
// armSymbol() below to record the variant and arm the shared placement tool.
function setupButtons() {
  document.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.addEventListener("click", () => setActiveTool(btn.dataset.tool));
  });
}

/* ----- arm a library symbol (called by templates.js for "shape"-kind symbols) -----
 * Records the concrete variant (the EXACT thing the old per-element/per-kind
 * buttons did) then arms the shared placement tool. syncButtons runs explicitly so
 * the highlight updates even when the armed tool is unchanged (e.g. 저항 → 전지,
 * both on CIRCUIT, where setActiveTool early-returns and fires no subscriber). */
export function armSymbol(symbolId, tool, variant) {
  if (tool === "CIRCUIT") _circuitElement = variant || "resistor";
  if (tool === "OPTICS")  _opticsKind = variant || "convex_lens";
  if (tool === "APPARATUS") _apparatusKind = variant || "wire";
  if (tool === "SVGASSET") _svgAssetId = variant || "pulley";
  _activeSymbolId = symbolId;
  setActiveTool(tool);
  syncButtons(_state.get().activeTool);
}

function syncButtons(activeTool) {
  // A library symbol stays armed only while its placement tool is active; any plain
  // tool (or the auto-return to V after a commit) clears the symbol highlight.
  if (!SYMBOL_TOOLS.has(activeTool)) _activeSymbolId = null;
  // Plain tool buttons: one button ↔ one tool (unchanged behavior).
  document.querySelectorAll("[data-tool]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tool === activeTool);
  });
  // Symbol buttons share a placement tool but each has a UNIQUE data-symbol, so
  // exactly one highlights — keyed on the armed symbol id, not the shared tool.
  document.querySelectorAll("[data-symbol]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.symbol === _activeSymbolId);
  });
}

/* ----- keyboard shortcuts: V / S / R / O / Y / L / P(꺾은선) / N(점) / C / T ----- */
function setupKeyboard() {
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave Ctrl+R (reload) etc.
    if (e.shiftKey && (e.key.toLowerCase() === "c" || e.key.toLowerCase() === "v")) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const key = e.key.toLowerCase();
    if (key === "v") setActiveTool("V");
    else if (key === "s") setActiveTool("R");
    else if (key === "r") setActiveTool("rotate");
    else if (key === "o") setActiveTool("O");
    else if (key === "y") setActiveTool("Y");
    else if (key === "l") setActiveTool("L");
    else if (key === "p") setActiveTool("P");              // 꺾은선 (polyline)
    else if (key === "n") activateSymbolShortcut("node", "N"); // 점 (node, mnemonic: node)
    else if (key === "x") activateSymbolShortcut("axes", "X");
    else if (key === "a") activateSymbolShortcut("anglearc", "A"); // 각도호 — single binding
    else if (key === "g" && e.shiftKey) activateSymbolShortcut("rightangle", "Shift+G");
    else if (key === "c") setActiveTool("C");
    else if (key === "t" && e.shiftKey) activateSymbolShortcut("labeler", "Shift+T"); // 라벨러 (텍스트 도구 T와 한 글자 차이)
    else if (key === "t") setActiveTool("T");
    else if (key === "f") setActiveTool("F");              // 자유그리기 (free-draw)
  });
}

function activateSymbolShortcut(symbolId, shortcutLabel) {
  const btn = document.querySelector(`[data-symbol="${symbolId}"]`);
  if (btn) btn.click();
  else console.warn(`[tools] shortcut ${shortcutLabel} could not find ${symbolId}`);
}

/* ===== SHAPE DRAWING (rect / ellipse / triangle ??one shared pipeline) ===== */

// Armed tool ??object type. Size-based shapes (rect/ellipse/triangle) draw
// through the SAME down?뭗rag?뭫p flow; only the stored geometry differs
// (makeShape branches on type). Line (L) and polyline (P) are click-to-click
// instead ??see setupClickDrawing below.
const SHAPE_TYPE = { R: "rect", O: "ellipse", Y: "triangle", OPTICS: "optics", APPARATUS: "apparatus", SVGASSET: "svgAsset", PENDULUM: "pendulum" };

let drawing = false;
let startWorld = null; // world coord of the mouse-down point
let drawType = null;   // type being drawn for the current drag
let spaceHeld = false; // mirror viewport's Space-pan so we never draw while panning
// text-editor.js reads Space-held state in its "don't act while panning" guards.
// Exposed as a getter (setupDrawing owns the keydown/keyup tracker) so the editor
// never keeps a divergent copy.
export function isSpaceHeld() { return spaceHeld; }

let _marqueeStart = null; // world {x,y} of marquee drag start, or null
let _marqueeEl = null;    // temporary SVG <rect> shown during marquee drag

function constrainShapeEnd(type, start, end, shiftHeld) {
  if (type === "svgAsset") {
    const asset = getSvgAsset(_svgAssetId);
    const ratio = asset ? asset.defaultWidth / asset.defaultHeight : 1;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let w = Math.abs(dx);
    let h = Math.abs(dy);
    if (w / Math.max(h, MIN_SIZE) > ratio) w = h * ratio;
    else h = w / ratio;
    return {
      x: start.x + (dx < 0 ? -w : w),
      y: start.y + (dy < 0 ? -h : h),
    };
  }
  if (!shiftHeld || (type !== "rect" && type !== "ellipse")) return end;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x: start.x + (dx < 0 ? -size : size),
    y: start.y + (dy < 0 ? -size : size),
  };
}

function setupDrawing() {
  // track Space locally so a Space+drag pans (viewport) instead of drawing.
  window.addEventListener("keydown", (e) => { if (e.code === "Space") spaceHeld = true; });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") spaceHeld = false; });

  _svg.addEventListener("pointermove", (e) => {
    if (e.buttons & 1) return;
    const s = _state.get();
    const activeTool = s.activeTool;
    if (activeTool !== "V" && activeTool !== "rotate") {
      _svg.style.cursor = "";
      return;
    }
    if (spaceHeld) {
      _svg.style.cursor = "";
      return;
    }
    if (e.target?.dataset?.handle) return;
    const picked = pickSelectableObjectFromEvent(_svg, s, e);
    if (!picked) {
      _svg.style.cursor = activeTool === "V" ? "default" : "";
      return;
    }
    const isSelected = (s.selectedIds || []).includes(picked.id);
    _svg.style.cursor = activeTool === "V" && isSelected && isPositionMovableForCursor(picked)
      ? "grab"
      : "pointer";
  });

  _svg.addEventListener("pointerleave", () => {
    _svg.style.cursor = "";
  });

  // HOVER CURSOR is now driven by the open-path hit twin (render.js): each twin
  // carries cursor:pointer over the SAME fat transparent band that drives click
  // selection and grab/move, so hover and click share one element. The old
  // pointermove handler here set a "grab" cursor only for basic lines via a
  // separate geometric test — that divergence is removed so the two can't disagree.

  // V (select): click hit-tests committed rects by world bbox, topmost wins.
  // Clicking empty space clears the selection.
  _svg.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;                  // left button only
    if (spaceHeld) return;                        // Space+left = pan, not select
    const _at = _state.get().activeTool;
    if (_at !== "V" && _at !== "rotate") return;  // select or rotate tool picks
    // A click on a selection handle means "manipulate the selected object",
    // NOT "change selection". Handles can sit OUTSIDE the shape outline
    // (ellipse/triangle corners), where hitTest finds empty space and would
    // wrongly clear selectedIds ??breaking transform.js's handle-drag guard.
    const tgt = e.target;
    if (tgt && tgt.dataset && tgt.dataset.handle) return;
    const p = screenToWorld(_svg, _state.get().viewBox, e.clientX, e.clientY);
    const shiftHeld = e.shiftKey;
    let hitId = null;
    _state.update((s) => {
      hitId = pickSelectableObjectAtPoint(s, p);
      if (hitId === null) {
        if (_at !== "V") s.selectedIds = []; // rotate: clear immediately
        // V: defer selection to mouseup so marquee can run
      } else if (shiftHeld) {
        const idx = s.selectedIds.indexOf(hitId);
        if (idx === -1) s.selectedIds = [...s.selectedIds, hitId];
        else s.selectedIds = s.selectedIds.filter(id => id !== hitId);
      } else {
        const _hitObj = s.objects.find((o) => o.id === hitId);
        if (_hitObj && _hitObj.groupId) {
          if (e.detail >= 2) {
            // Double-click targets the individual member (DESIGN 6-2). We detect
            // it here via e.detail rather than via a dblclick listener: every
            // mousedown re-renders (scene.replaceChildren), detaching the clicked
            // node before mouseup, so the browser never fires click/dblclick.
            s.targetedId = hitId;
            s.selectedIds = [hitId];
          } else if (s.targetedId === hitId) {
            // Already targeting this member ??preserve targeted state
            s.selectedIds = [hitId];
          } else {
            const _grp = s.groups.find((g) => g.id === _hitObj.groupId);
            s.selectedIds = _grp ? [..._grp.memberIds] : [hitId];
            s.targetedId = null;
          }
        } else if (!s.selectedIds.includes(hitId)) {
          s.selectedIds = [hitId];
          s.targetedId = null;
        }
      }
    });
    // Double-click a text object → edit its content in place (DESIGN: like the
    // group-member targeting above, detected via e.detail since re-render detaches
    // the node before a real dblclick can fire).
    if (hitId !== null && e.detail >= 2 && !shiftHeld) {
      const _ho = _state.get().objects.find((o) => o.id === hitId);
      if (_ho && _ho.type === "text") {
        if (isTextEditorOpen()) return; // already editing (e.g. opened by click-to-edit on press #1)
        startEditingTextObject(hitId, { x: e.clientX, y: e.clientY }); return;
      }
      if (_ho && _ho.type === "formula") {
        if (isTextEditorOpen()) return;
        startEditingTextObject(hitId, { x: e.clientX, y: e.clientY }); return;
      }
      if (_ho && _ho.type === "labeler") {
        openLabelerTextEditor(hitId); return;
      }
      if (_ho && _ho.type === "anglearc") {
        openAngleArcLabelEditor(hitId); return;
      }
    }
    if (hitId === null && _at === "V") {
      _marqueeStart = { x: p.x, y: p.y };
      _marqueeEl = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      _marqueeEl.setAttribute("fill", "rgba(9,105,218,0.08)");
      _marqueeEl.setAttribute("stroke", "#0969da");
      _marqueeEl.setAttribute("stroke-width", "0.3");
      _marqueeEl.setAttribute("stroke-dasharray", "0.7 0.5");
      _marqueeEl.setAttribute("pointer-events", "none");
      _marqueeEl.setAttribute("x", p.x);
      _marqueeEl.setAttribute("y", p.y);
      _marqueeEl.setAttribute("width", "0");
      _marqueeEl.setAttribute("height", "0");
      _svg.appendChild(_marqueeEl);
    }
  });

  _svg.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;                 // left button only
    if (spaceHeld) return;                       // Space+left = pan, not draw
    const type = SHAPE_TYPE[_state.get().activeTool];
    if (!type) return;                           // only a shape tool draws
    // 6a: node (점) is placed by a single CLICK (atomic), not a size-drag — the
    // dedicated setupNodePlacement() click handler owns it, so skip the drag flow.
    if (type === "optics" && _opticsKind === "node") return;
    e.preventDefault();

    const vb = _state.get().viewBox;
    startWorld = screenToWorld(_svg, vb, e.clientX, e.clientY);
    drawing = true;
    drawType = type;
    _state.update((s) => { s.draft = makeShape(drawType, startWorld, startWorld); });
  });

  // move/up on window so a fast drag that leaves the SVG still tracks.
  window.addEventListener("mousemove", (e) => {
    if (!drawing) return;
    const vb = _state.get().viewBox;
    const pointer = screenToWorld(_svg, vb, e.clientX, e.clientY);
    // Shift = aspect-ratio lock: force w === h (perfect square / circle) using the
    // larger of the two extents, preserving the drag direction on each axis.
    const cur = drawType === "line"
      ? snapLineEnd(startWorld, pointer, e.ctrlKey)
      : constrainShapeEnd(drawType, startWorld, pointer, e.shiftKey);
    _state.update((s) => { s.draft = makeShape(drawType, startWorld, cur); });
  });

  window.addEventListener("mouseup", (e) => {
    if (!drawing) return;
    drawing = false;
    const vb = _state.get().viewBox;
    const pointer = screenToWorld(_svg, vb, e.clientX, e.clientY);
    const cur = drawType === "line"
      ? snapLineEnd(startWorld, pointer, e.ctrlKey)
      : constrainShapeEnd(drawType, startWorld, pointer, e.shiftKey);
    const shape = makeShape(drawType, startWorld, cur);
    startWorld = null;
    drawType = null;

    _state.update((s) => {
      s.draft = null;
      // Only commit a real drag; a click with no movement draws nothing.
      if (isCommittable(shape)) {
        // Snapshot the pre-creation objects so a single Ctrl+Z removes this shape.
        const snap = JSON.parse(JSON.stringify(s.objects));
        shape.id = `obj_${Date.now().toString(36)}_${++_idCounter}`;
        shape.order = s.objects.length;
        shape.layerId = s.activeLayerId;
        s.objects.push(shape);
        s.undoStack.push(snap);
        s.redoStack = [];
        s.activeTool = "V"; // auto-return to select right after drawing (DESIGN 4-3)
      }
    });
  });

  // Marquee drag ??update the dashed selection rect while dragging empty space.
  window.addEventListener("mousemove", (e) => {
    if (!_marqueeStart) return;
    const vb = _state.get().viewBox;
    const cur = screenToWorld(_svg, vb, e.clientX, e.clientY);
    const rx = Math.min(_marqueeStart.x, cur.x);
    const ry = Math.min(_marqueeStart.y, cur.y);
    const rw = Math.abs(cur.x - _marqueeStart.x);
    const rh = Math.abs(cur.y - _marqueeStart.y);
    _marqueeEl.setAttribute("x", rx);
    _marqueeEl.setAttribute("y", ry);
    _marqueeEl.setAttribute("width", rw);
    _marqueeEl.setAttribute("height", rh);
  });

  // Marquee drag ??commit or cancel on mouse-up.
  window.addEventListener("mouseup", (e) => {
    if (!_marqueeStart) return;
    const vb = _state.get().viewBox;
    const cur = screenToWorld(_svg, vb, e.clientX, e.clientY);
    const start = _marqueeStart;
    _marqueeStart = null;
    if (_marqueeEl) { _marqueeEl.remove(); _marqueeEl = null; }

    const dist = Math.hypot(cur.x - start.x, cur.y - start.y);
    if (dist < 2) {
      // Plain empty-click ??clear selection.
      _state.update((s) => { s.selectedIds = []; s.targetedId = null; });
      return;
    }
    const rx = Math.min(start.x, cur.x);
    const ry = Math.min(start.y, cur.y);
    const rw = Math.abs(cur.x - start.x);
    const rh = Math.abs(cur.y - start.y);
    const selRect = { x: rx, y: ry, w: rw, h: rh };
    _state.update((s) => {
      s.targetedId = null;
      s.selectedIds = s.objects
        .filter((o) => {
          if (isLockedTracingImage(o)) return false;
          if (isBackgroundUnrecognized(o)) return false; // unrecognized bg = not marquee-selectable
          const _mLayerId = o.layerId ?? 1;
          const _mLayer = (s.layers || []).find(l => l.id === _mLayerId);
          if (!_mLayer || _mLayer.visible === false || _mLayerId !== s.activeLayerId) return false;
          const bb = getObjectBBox(o);
          return bb && bboxIntersects(bb, selRect);
        })
        .map((o) => o.id);
    });
  });

  window.addEventListener("pointercancel", () => {
    drawing = false;
    startWorld = null;
    drawType = null;
    _marqueeStart = null;
    if (_marqueeEl) { _marqueeEl.remove(); _marqueeEl = null; }
    _state.update((s) => { s.draft = null; });
  });

  // NOTE: targeting a group member on double-click is handled in the mousedown
  // handler above (e.detail >= 2). A dblclick listener can't be used here: every
  // mousedown re-renders (scene.replaceChildren) and detaches the clicked node
  // before mouseup, so the browser never fires click/dblclick on it.
}

/* ===== CLICK-TO-CLICK DRAWING (line L + polyline P ??one shared mechanism) ===== */
//
// Both place vertices by CLICKING (no button hold). A running point list
// (draftPoints) is built one click at a time; a live SOLID rubber-band preview
// (state.draft, rendered as a polyline) runs from the last placed vertex to the
// mouse. The only difference between the tools is when they finish:
//   ??LINE (L): the 2-point case ??the 2nd click commits and finishes.
//   ??POLYLINE (P): many points ??double-click or Enter finishes (?? points).
// ESC cancels the whole draft (nothing committed). All clicks convert to world
// coords through the SHARED screenToWorld helper ??no new coordinate math.
const CLICK_TOOLS = { L: "line", P: "polyline", C: "curve", CIRCUIT: "circuit" };

let clickTool = null;     // armed click-to-click tool ("L"/"P"/"C"/"CIRCUIT") while drafting, else null
let draftPoints = [];     // world-space vertices placed so far
let mouseWorld = null;    // last mouse world pos, for the rubber-band segment

/* ===== FREE-DRAW TOOL (F): freehand drag → simplified+smoothed closed curve =====
 * Captures a freehand pointer drag as raw world points, previews them live as an
 * open curve, then on release simplifies them (Ramer–Douglas–Peucker) and stores
 * them as a CLOSED curve object — reusing the closed-curve fill/render/hit infra.
 * The Catmull-Rom closed renderer smooths the anchors AND the end→start wrap, so
 * the shape closes cleanly. Default fill = opaque WHITE, default no stroke
 * (borderless; main use = covering parts of an imported image). Fill/stroke stay
 * editable in the inspector; it exports, undoes in one step, and round-trips via
 * project-io exactly like any other curve. */
let _fdActive = false;    // a free-draw drag is in progress
let _fdRaw = null;        // raw captured world points during the drag
const FD_MIN_STEP = 0.3;  // min world-mm movement to record a new raw point
const FD_RDP_EPS  = 0.6;  // RDP simplification tolerance (world mm)

function setupFreeDraw() {
  _svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (spaceHeld) return;
    if (_state.get().activeTool !== "F") return;
    e.preventDefault();
    _fdActive = true;
    const p = screenToWorld(_svg, _state.get().viewBox, e.clientX, e.clientY);
    _fdRaw = [p];
    try { _svg.setPointerCapture(e.pointerId); } catch (_) {}
  });

  _svg.addEventListener("pointermove", (e) => {
    if (!_fdActive) return;
    const p = screenToWorld(_svg, _state.get().viewBox, e.clientX, e.clientY);
    const last = _fdRaw[_fdRaw.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < FD_MIN_STEP) return;
    _fdRaw.push(p);
    // Live preview: an OPEN curve with a thin visible stroke so the path is seen
    // while drawing (the committed object is closed + borderless white).
    _state.update((s) => {
      s.draft = {
        type: "curve", points: _fdRaw.slice(), closed: false, rotation: 0,
        strokeLevel: 0, strokeWidth: 0.3, fillNone: true, dashLength: 0, dashGap: 0,
      };
    });
  });

  window.addEventListener("pointerup", (e) => {
    if (!_fdActive) return;
    _fdActive = false;
    try { _svg.releasePointerCapture(e.pointerId); } catch (_) {}
    const raw = _fdRaw || [];
    _fdRaw = null;
    const simplified = simplifyRDP(raw, FD_RDP_EPS);
    _state.update((s) => {
      s.draft = null;
      if (simplified.length < 3) return; // need 3+ anchors for a closed fillable curve
      const snap = JSON.parse(JSON.stringify(s.objects));
      const obj = {
        id: `obj_${Date.now().toString(36)}_${++_idCounter}`,
        type: "curve",
        points: simplified,
        closed: true,
        rotation: 0,
        strokeLevel: 0,
        strokeWidth: 0,      // borderless by default (no stroke)
        fillLevel: 255,      // opaque white fill
        fillNone: false,
        fillStyle: "solid",
        dashLength: 0,
        dashGap: 0,
        locked: false,
        positionLocked: false,
        layerId: s.activeLayerId,
        order: s.objects.length,
      };
      s.objects.push(obj);
      s.undoStack.push(snap);
      s.redoStack = [];
      s.selectedIds = [obj.id];
      s.activeTool = "V"; // auto-return to select right after drawing (DESIGN 4-3)
    });
  });
}

/* ===== 6a: NODE (점) SINGLE-CLICK PLACEMENT =====
 * The node tool creates a default-size 점 on ONE click (atomic, not a drag).
 * With Shift held it snaps to the nearest straight edge/line OR object boundary
 * outline (rect/triangle edges, ellipse/circle/curve surfaces) via the SAME
 * shared resolveEndpointSnap path the line-endpoint snap uses; a single red dot
 * marks the snapped point and the click commits there. */
// A 점 renders as a filled dot of radius = min(w,h) × NODE_DOT_RADIUS_RATIO (see
// render.js node drawer). Reference look: dot DIAMETER ≈ POINT_DIAMETER_PER_WIDTH
// × line width, so with the 0.2 mm default line width a new 점 is ≈ 1.0 mm Ø
// (0.5 mm radius). Tune POINT_DIAMETER_PER_WIDTH to rescale every new 점.
const POINT_DIAMETER_PER_WIDTH = 5;   // dot Ø ≈ 5 × line width (estimated from reference)
const NODE_DOT_RADIUS_RATIO = 0.22;   // must match render.js node drawer
const NODE_DEFAULT_SIZE =
  (DEFAULT_STROKE_WIDTH * POINT_DIAMETER_PER_WIDTH) / (2 * NODE_DOT_RADIUS_RATIO); // ≈ 2.27 mm bbox → 1.0 mm Ø dot
function isNodeToolArmed() {
  return _state.get().activeTool === "OPTICS" && _opticsKind === "node";
}
function nodePlacementPoint(rawWorld, shiftHeld) {
  if (!shiftHeld) return { place: rawWorld, snapped: false };
  const snap = resolveEndpointSnap(rawWorld, [], getRenderScale(), _state);
  if (snap && snap.attach) return { place: snap.target, snapped: true };
  return { place: rawWorld, snapped: false };
}
let _nodePreviewActive = false; // a red dot is currently shown for node placement
function setupNodePlacement() {
  const clearNodePreview = () => {
    if (!_nodePreviewActive) return;
    _nodePreviewActive = false;
    setSnapPreview(null);
    _state.update(() => {});
  };
  // Hover preview: a single red dot at the snapped point while Shift is held.
  _svg.addEventListener("pointermove", (e) => {
    if (!isNodeToolArmed() || spaceHeld || !e.shiftKey) { clearNodePreview(); return; }
    const raw = screenToWorld(_svg, _state.get().viewBox, e.clientX, e.clientY);
    const { place, snapped } = nodePlacementPoint(raw, true);
    if (!snapped) { clearNodePreview(); return; }
    setSnapPreview({ from: place, to: place });
    _nodePreviewActive = true;
    _state.update(() => {}); // repaint so the red dot follows the cursor
  });

  // Click commits a node at the (snapped) point.
  _svg.addEventListener("click", (e) => {
    if (e.button !== 0 || spaceHeld) return;
    if (!isNodeToolArmed()) return;
    const raw = screenToWorld(_svg, _state.get().viewBox, e.clientX, e.clientY);
    const { place, snapped } = nodePlacementPoint(raw, e.shiftKey);
    console.log("[SNAP-6a node-place commit] snapped=", snapped,
      "at=", `${place.x.toFixed(1)},${place.y.toFixed(1)}`);
    const sz = NODE_DEFAULT_SIZE;
    _state.update((s) => {
      const snap = JSON.parse(JSON.stringify(s.objects));
      const obj = {
        id: `obj_${Date.now().toString(36)}_${++_idCounter}`,
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

function setupClickDrawing() {
  // Each click appends a vertex. Line auto-commits at 2 points; polyline keeps going.
  _svg.addEventListener("click", (e) => {
    if (e.button !== 0) return;                  // left button only
    if (spaceHeld) return;                        // Space+click = pan, not draw
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

// POLYLINE / CURVE: needs ?? vertices; otherwise the draft is discarded.
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
    shape.id = `obj_${Date.now().toString(36)}_${++_idCounter}`;
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

function clearClickLocals() {
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

/* ----- commit gate: ignore stray clicks that drew nothing ----- */
// Size-based shapes need a non-trivial box; a line needs a non-trivial length.
function isCommittable(shape) {
  if (shape.type === "line" || shape.type === "circuit" || shape.type === "labeler" || shape.type === "pendulum") {
    return Math.hypot(shape.p2.x - shape.p1.x, shape.p2.y - shape.p1.y) >= MIN_SIZE;
  }
  if (shape.type === "rightangle") return (shape.size || 0) >= MIN_SIZE;
  return shape.w >= MIN_SIZE && shape.h >= MIN_SIZE;
}

/* ----- build a size-based shape from two world points (handles negative drags) ----- */
// DESIGN 2-1 branch A (size-based): x/y is the top-left, w/h are positive.
// `type` is "rect" | "ellipse" | "triangle"; all share this identical structure.
function makeShape(type, a, b) {
  if (type === "line") return makeLine(a, b);
  if (type === "pendulum") return makePendulum(a, b);
  const shape = {
    id: null, // assigned on commit
    type,
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
    rotation: 0,
    strokeLevel: 0,        // 0 = black (DESIGN 2-2)
    strokeWidth: DEFAULT_STROKE_WIDTH,
    fillLevel: 255,        // opaque white default for new shapes
    fillNone: false,
    fillStyle: "solid",   // "solid" | "dots" | "cross" | "hatch"
    dashLength: 0,
    dashGap: 0,
    labelType: "quantity",
    locked: false,
    positionLocked: false,
    layerId: 1,
    order: 0,              // assigned on commit (z-order within layer)
  };
  if (type === "triangle") shape.flipX = b.x < a.x;
  // Rectangle internal labels are typically block NAMES (A, B, C …), so a new rect
  // defaults to the "label"(정체·upright) type. The user can still switch it to
  // "물리량"(quantity) in the inspector to render the label as Times New Roman italic.
  if (type === "rect") shape.labelType = "label";
  // Optics (branch A): reuse the size-drag box wholesale; only kind + label fields
  // are added. Default fillNone so lenses/mirrors drop as clean outlines.
  if (type === "optics") {
    shape.kind = _opticsKind || "convex_lens";
    shape.label = "";
    shape.labelType = "quantity";
    shape.showLabel = false;
    shape.fillNone = true;
    // node (점) carries an always-upright text label (Feature G); labelPos picks
    // the side (above/below). Old node objects without these default to no label.
    if (shape.kind === "node") shape.labelPos = "above";
    if (shape.kind === "object_arrow") {
      shape.dashLength = 0;
      shape.dashGap = 0;
    }
    // Center dashed-line option: convex/concave lenses only (default off).
    if (shape.kind === "convex_lens" || shape.kind === "concave_lens") {
      shape.centerLine = "none";
    }
  }
  if (type === "apparatus") {
    shape.kind = _apparatusKind || "wire";
    shape.templateId = APPARATUS_TEMPLATE_IDS[shape.kind] || null;
    shape.fillNone = true;
    shape.label = "";
    if (shape.kind === "wire") {
      shape.length = Math.max(shape.w, 18);
      shape.thickness = 1.8;
      shape.gap = shape.thickness;
      shape.angle = 0;
      shape.w = Math.max(shape.w, shape.length);
      shape.h = Math.max(shape.h, shape.thickness * 3);
      shape.rotation = 0;
    } else if (shape.kind === "compass") {
      const size = Math.max(shape.w, shape.h, 12);
      shape.w = size;
      shape.h = size;
      shape.lockAspect = true;
      shape.needleAngle = -90;
    } else if (shape.kind === "pulley") {
      const size = Math.max(shape.w, shape.h, 18);
      shape.w = size * 1.18;
      shape.h = size;
      shape.lockAspect = true;
      shape.variant = "basic";
    } else if (shape.kind === "clamp") {
      const size = Math.max(shape.w, shape.h, 20);
      shape.w = size * 0.7;
      shape.h = size;
      shape.lockAspect = true;
      shape.flipped = false;
    } else if (shape.kind === "scale") {
      shape.w = Math.max(shape.w, 26);
      shape.h = Math.max(shape.h, 13);
      shape.lockAspect = true;
      shape.displayText = "0.99 N";
    }
  }
  if (type === "svgAsset") {
    const asset = getSvgAsset(_svgAssetId);
    if (asset) {
      shape.assetId = asset.id;
      shape.name = asset.name;
      shape.lockAspect = true;
      shape.fillNone = true;
      shape.strokeWidth = 0;
    }
  }
  return applyNewObjectStyleDefaults(shape);
}

/* ----- build an endpoint-based line from two world points (DESIGN 2-1 branch B) ----- */
// A line is defined by TWO endpoints (p1/p2), not x/y/w/h, and has no fill.
function makeLine(a, b) {
  return applyNewObjectStyleDefaults({
    id: null, // assigned on commit
    type: "line",
    p1: { x: a.x, y: a.y },
    p2: { x: b.x, y: b.y },
    rotation: 0,
    strokeLevel: 0,        // 0 = black (DESIGN 2-2)
    strokeWidth: DEFAULT_STROKE_WIDTH,
    // ----- branch-B common line props (arrow + dashes) -----
    lineMode: "solid",     // "solid" | "arrow" | "middleArrow" | "lengthArrow"
    lineStyle: "solid",    // legacy alias retained for project compatibility
    arrowVariant: "right",
    dimensionVariant: "basic",
    arrowHead: "none",     // "none" | "end" | "start" | "both"
    dashLength: 0,         // world units (mm); 0 = solid (no dasharray)
    dashGap: 0,            // world units (mm); 0 = solid
    locked: false,
    positionLocked: false,
    layerId: 1,
    order: 0,              // assigned on commit (z-order within layer)
  });
}

/* ----- build a simple pendulum from a drag (branch B, same family as line) -----
 * drag start (a) = pivot / top support; drag end (b) = real bob center. All other
 * geometry (ghost bobs, vertical normal) is derived at render (see render.js
 * pendulumGeometry), never stored. bobRadius is seeded from the length so the bob
 * scales sensibly; it is then a stored, editable property. */
function makePendulum(a, b) {
  return applyNewObjectStyleDefaults({
    id: null,                     // assigned on commit
    type: "pendulum",
    p1: { x: a.x, y: a.y },       // pivot / top support
    p2: { x: b.x, y: b.y },       // real bob center
    bobRadius: pendulumBobRadius({ p1: a, p2: b }),
    showCenterGhost: true,        // 중앙잔상 (vertical normal, directly below pivot)
    showSymmetricGhost: true,     // 대칭잔상 (mirror across the vertical normal)
    showLengthLabel: true,        // 길이표시
    lengthLabel: "L_B",           // physics-quantity label near the real string
    labelType: "quantity",
    strokeLevel: 0,               // 0 = black (DESIGN 2-2)
    strokeWidth: DEFAULT_STROKE_WIDTH,
    locked: false,
    positionLocked: false,
    layerId: 1,
    order: 0,                     // assigned on commit (z-order within layer)
  });
}

/* ----- build a circuit element from two terminals (branch B, same family as line) ----- */
// Two endpoints (p1/p2), one label, one element kind. Leads + body geometry are
// PROJECTION (derived at render time from p1/p2), never stored — see render.js.
function makeCircuit(a, b) {
  const element = _circuitElement || "resistor";
  const obj = {
    id: null,                 // assigned on commit
    type: "circuit",
    element,                  // render dispatches the body on this
    p1: { x: a.x, y: a.y },   // left terminal
    p2: { x: b.x, y: b.y },   // right terminal
    label: "",                // single optional text label (empty allowed)
    labelType: "quantity",
    strokeLevel: 0,           // 0 = black (DESIGN 2-2)
    strokeWidth: DEFAULT_STROKE_WIDTH,
    locked: false,
    positionLocked: false,
    layerId: 1,
    order: 0,                 // assigned on commit (z-order within layer)
  };
  // Element-specific data fields (only the relevant element carries each).
  if (["resistor", "inductor", "capacitor", "voltmeter", "ammeter"].includes(element)) {
    obj.height = (element === "voltmeter" || element === "ammeter") ? 5.12 : 3.2;
  }
  if (element === "capacitor") obj.gap = CIRCUIT_CAP_GAP_DEFAULT; // plate separation (world mm)
  if (element === "diode") obj.terminalLabels = ["", ""];          // 단자1 / 단자2
  return applyNewObjectStyleDefaults(obj);
}

/* ----- build a polyline from a list of world points (click-to-click) ----- */
// Many vertices, connected in order; no fill. Used both for the live preview
// (placed points + floating mouse) and the committed object.
function makePolyline(points) {
  return applyNewObjectStyleDefaults({
    id: null, // assigned on commit
    type: "polyline",
    points: points.map((p) => ({ x: p.x, y: p.y })),
    rotation: 0,
    strokeLevel: 0,        // 0 = black (DESIGN 2-2)
    strokeWidth: DEFAULT_STROKE_WIDTH,
    // ----- branch-B common line props (arrow + dashes) -----
    arrowHead: "none",     // "none" | "end" | "start" | "both"
    dashLength: 0,         // world units (mm); 0 = solid (no dasharray)
    dashGap: 0,            // world units (mm); 0 = solid
    // ----- closed-fill props: a closed polyline behaves like a fillable shape -----
    closed: false,         // false = open <polyline>; true = filled <polygon>
    fillLevel: 255,        // opaque white default for new shapes (mark shade when closed)
    fillNone: false,
    fillStyle: "solid",    // "solid" | "dots" | "cross" | "hatch"
    // ----- 경사면처리 (corner-rounding): render-time fillet, never mutates points[] -----
    rounded: false,        // false = sharp joints; true = quadratic-fillet each interior vertex
    cornerRadius: 10,      // back-off distance in world units (mm), clamped per segment at render
    locked: false,
    positionLocked: false,
    layerId: 1,
    order: 0,              // assigned on commit (z-order within layer)
  });
}

/* ----- build a curve from a list of world points (click-to-click, Catmull-Rom) ----- */
function makeCurve(points) {
  return applyNewObjectStyleDefaults({
    id: null,
    type: "curve",
    points: points.map((p) => ({ x: p.x, y: p.y })),
    rotation: 0,
    strokeLevel: 0,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    // ----- branch-B common line props (curve: dashes only this round) -----
    arrowHead: "none",     // schema-common; curve excluded from arrowheads for now
    dashLength: 0,         // world units (mm); 0 = solid (no dasharray)
    dashGap: 0,            // world units (mm); 0 = solid
    // ----- closed-fill props: a closed curve behaves like a fillable shape -----
    closed: false,         // false = open <path>; true = smoothly-closed filled <path>
    fillLevel: 255,        // opaque white default for new shapes (mark shade when closed)
    fillNone: false,
    fillStyle: "solid",    // "solid" | "dots" | "cross" | "hatch"
    locked: false,
    positionLocked: false,
    layerId: 1,
    order: 0,
  });
}

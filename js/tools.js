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

import { screenToWorld, getRenderScale, worldToScreen } from "./viewport.js?v=0.55.0";
import {
  TEXT_FONTS, DEFAULT_TEXT_FONT, DEFAULT_TEXT_SIZE_PX, DEFAULT_TEXT_SIZE_MM,
  TEXT_SIZE_PRESETS, ptToMm, mmToPt, MIN_TEXT_PT,
  EQUATION_FONT_FAMILY,
  resolveTextFontStyle, resolveTextLetterSpacing,
  normalizeTextRuns, normalizeTextRunStyle, textRunStyleFromObject, textRunsToText,
  hasStyledTextRuns, SECTION_ROMAN_STYLE, QUANTITY_STYLE,
} from "./state.js?v=0.55.0";
import { setSnapPreview, pendulumBobRadius } from "./render.js?v=0.55.0";
import { resolveEndpointSnap } from "./snap.js?v=0.55.0";
import { applyNewObjectStyleDefaults } from "./style-mode.js?v=0.55.0";
import { measureFormula, renderFormula, fontOf } from "./formula.js?v=0.55.0";
import { fillHtmlTextWithRomanRuns } from "./text-rendering.js?v=0.55.0";
import { getSvgAsset } from "./svg-assets.js?v=0.55.0";
import { openPlaneModal } from "./function-graph/plane-modal.js?v=0.55.0";
import { openDataPlotEditor, isDataPlotPlane } from "./data-plot.js?v=0.55.0";
import { nextObjectId } from "./tools/id.js?v=0.55.0";
import { setupFreeDraw } from "./tools/free-draw.js?v=0.55.0";
import { setupNodePlacement } from "./tools/node-placement.js?v=0.55.0";
import { setupClickDrawing, clearClickLocals } from "./tools/click-placement.js?v=0.55.0";
// Pure math helpers (MOVE-ONLY extraction, v0.44.0) — see js/geometry.js.
import {
  snapLineEnd, snapAngle, mathAngleDeg, snappedDeg, normalizeSweep,
  bboxIntersects,
} from "./geometry.js?v=0.55.0";
// Selection / hit-testing (MOVE-ONLY extraction, v0.44.0) — see js/pick.js.
// initPick(svg) hands pick.js the live SVG root for text/formula getBBox measurement.
import {
  initPick, pickSelectableObjectAtPoint, pickSelectableObjectFromEvent,
  isPositionMovableForCursor, isLockedTracingImage, isBackgroundUnrecognized,
  getObjectBBox, marqueeHitsObject,
} from "./pick.js?v=0.55.0";
// Re-export the picking API at its historical home so existing importers of
// tools.js (transform.js: pickSelectableObjectFromEvent, and any future callers
// of pickTolerances / pickSelectableObjectAtPoint) keep working unchanged.
export { pickTolerances, pickSelectableObjectAtPoint, pickSelectableObjectFromEvent } from "./pick.js?v=0.55.0";
// Text/formula editing subsystem (MOVE-ONLY extraction, v0.44.0) — see js/text-editor.js.
// initTextEditing(svg, state) registers the text tool + click-to-edit + shortcuts +
// context menu (called from initTools). isTextEditorOpen() replaces the old direct
// _textEditor reads in setupDrawing; cancelActive*Editor are called by setActiveTool.
import {
  initTextEditing, isTextEditorOpen,
  startEditingTextObject, openLabelerTextEditor, openAngleArcLabelEditor, insertLabelerChar,
  cancelActiveTextEditor, cancelActiveFormulaEditor,
} from "./text-editor.js?v=0.55.0";
// Re-export the editor entry points at their historical home so existing importers of
// tools.js keep working unchanged (inspector/section-geometry.js imports
// openAngleArcLabelEditor; the openers are also used internally by the drawing code).
export { startEditingTextObject, openLabelerTextEditor, openAngleArcLabelEditor, insertLabelerChar } from "./text-editor.js?v=0.55.0";
// Guide hover cursor: ruler.js owns guide geometry. Called only at runtime inside
// the pointermove handler, so the ruler↔tools import cycle stays safe.
import { guideCursorAt } from "./ruler.js?v=0.55.0";

// Default look until the inspector exists (DESIGN 짠3-2: border only, hollow).
export const DEFAULT_STROKE_WIDTH = 0.2; // world units (mm)
export const MIN_SIZE = 0.3; // world units; ignore stray clicks that draw nothing
const TEXT_EDITOR_PX = 14; // on-screen px of the text editor (matches .text-editor-overlay font-size)
const TEXT_LINE_HEIGHT = 1.4; // matches .text-editor-overlay line-height AND renderText() tspan dy
// A textarea centers its glyphs in the line box, so the first line sits half a
// leading below the element top. The committed SVG <text> uses dominant-baseline:
// hanging (glyph top AT the anchor), so we shift the editor up by that half-leading
// to keep the draft and the final text from jumping vertically on commit.
const TEXT_HALF_LEADING_PX = TEXT_EDITOR_PX * (TEXT_LINE_HEIGHT - 1) / 2;

let _svg = null;
let _state = null;
// object-id generation moved to tools/id.js (nextObjectId) so extracted tool
// pipelines share one counter and can never mint colliding ids.

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
  setupClickDrawing(_svg, _state);
  setupFreeDraw(_svg, _state);
  setupNodePlacement(_svg, _state);
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
  // 같은 배치 도구 안에서 소자만 바꾸면(예: 저항→전지) setActiveTool이 조기 반환해
  // 진행 중이던 첫 단자 클릭 draft가 남는다 → 도구 전환 여부와 무관하게 항상 폐기.
  clearClickLocals();
  _state.update((s) => { s.draft = null; });
  setActiveTool(tool);
  syncButtons(_state.get().activeTool);
}

// Read the armed optics kind. Exposed as a getter (armSymbol owns the value) so
// tools/node-placement.js can tell when the 점 tool is armed without a copy.
export function getOpticsKind() { return _opticsKind; }

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

// Mirrors transform.js's own F-key precondition (selected, unlocked, type "triangle")
// so tools.js can tell whether THAT handler is about to flip a triangle instead.
function hasFlippableTriangleSelected() {
  const s = _state.get();
  return (s.selectedIds || []).some((id) => {
    const o = s.objects.find((ob) => ob.id === id);
    return !!o && !o.locked && o.type === "triangle";
  });
}

/* ----- keyboard shortcuts: V / S / R / O / Y / L / P(꺾은선) / D(자유그리기) / N(점) / C / E(자르기) / T ----- */
function setupKeyboard() {
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // leave Ctrl+R (reload) etc.
    if (e.shiftKey && (e.key.toLowerCase() === "c" || e.key.toLowerCase() === "v")) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const key = e.key.toLowerCase();
    if (key === "v") setActiveTool("V");
    else if (key === "s") setActiveTool("RECT");       // 사각형 — shortcut is S, not R (see SHAPE_TYPE note)
    else if (key === "r") setActiveTool("rotate");
    else if (key === "o") setActiveTool("O");
    else if (key === "y") setActiveTool("Y");
    else if (key === "l") setActiveTool("L");
    else if (key === "p") setActiveTool("P");              // 꺾은선 (polyline)
    else if (key === "d" && !e.shiftKey) setActiveTool("F"); // 자유 그리기 (Draw) — 도구코드는 "F"; Shift+D는 좌표 디버그 오버레이(main.js) 몫
    else if (key === "n") activateSymbolShortcut("node", "N"); // 점 (node, mnemonic: node)
    else if (key === "a" && e.shiftKey) activateSymbolShortcut("rightangle", "Shift+A"); // 직각 표시 (④: Shift+G에서 이전, Shift+G는 폐기)
    else if (key === "a") activateSymbolShortcut("anglearc", "A"); // 각도호
    else if (key === "c") setActiveTool("C");
    else if (key === "e") setActiveTool("CUT");           // 자르기(가위) — 자유곡선/Shift 직선/Shift+Ctrl 각도스냅 (cut-tool.js)
    else if (key === "t" && e.shiftKey) activateSymbolShortcut("labeler", "Shift+T"); // 라벨러 (텍스트 도구 T와 한 글자 차이)
    else if (key === "t") setActiveTool("T");
    else if (key === "f") {
      // F collides with transform.js's triangle flipY toggle (same reason as above).
      // Skip the shortcut whenever an unlocked triangle is selected — transform.js
      // will flip it instead. 자유그리기 is now button-only (its F shortcut moved to
      // 함수 입력, freeing F up — 확정 항목 ⑧).
      if (!hasFlippableTriangleSelected()) activateSymbolShortcut("funcgraph", "F"); // 함수 입력
    }
    else if (key === "tab") {
      // ④: while the angle-tool pair is armed, Tab toggles 호(ARC) ↔ 직각(RIGHTANGLE)
      // in place instead of tabbing focus away.
      const activeTool = _state.get().activeTool;
      if (activeTool === "ARC" || activeTool === "RIGHTANGLE") {
        e.preventDefault();
        activateSymbolShortcut(activeTool === "ARC" ? "rightangle" : "anglearc", "Tab");
      }
    }
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
// NOTE: keys are internal tool-ids (state.activeTool values), NOT keyboard shortcut
// letters — RECT's actual shortcut key is "S" (see setupKeyboard), not "R". The
// letter "R" is reserved for the rotate-mode shortcut; using "RECT" here (instead of
// the old bare "R") avoids reading like a collision with rotate.
const SHAPE_TYPE = { RECT: "rect", O: "ellipse", Y: "triangle", OPTICS: "optics", APPARATUS: "apparatus", SVGASSET: "svgAsset", PENDULUM: "pendulum", RULER: "gauge", PROTRACTOR: "gauge" };
// 자·각도기는 같은 오브젝트 타입("gauge")이라 도구코드로 kind를 구분한다(드래그 시작 시 캡처).
const GAUGE_KIND = { RULER: "ruler", PROTRACTOR: "protractor" };
let _drawKind = null; // 현재 드래그로 만드는 gauge의 kind

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
    if (activeTool === "CUT") return; // 자르기 도구의 커서(가위/칼)는 cut-tool.js가 전담 — 여기서 지우지 않는다
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
      // Over an empty spot: if a ruler guide passes under the pointer, show the
      // grab (↕/↔) affordance — the visible guide line is pointer-transparent, so
      // without this there is NO hover cue that the guide is draggable over the
      // artboard (ruler.js owns the proximity test; objects already won above).
      const guideCursor = activeTool === "V" ? guideCursorAt(e.clientX, e.clientY) : null;
      _svg.style.cursor = guideCursor || (activeTool === "V" ? "default" : "");
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
      if (_ho && _ho.type === "coordplane") {
        // 데이터 자료변환으로 만든 그래프면 데이터 편집창을, 아니면 평면 상세편집을 연다.
        if (isDataPlotPlane(_ho)) { openDataPlotEditor(hitId); return; }
        openPlaneModal(hitId); return;
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
    _drawKind = GAUGE_KIND[_state.get().activeTool] || null; // gauge일 때만 유효
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
        shape.id = nextObjectId();
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
          return marqueeHitsObject(o, selRect); // 기하 기반: 큰 선의 bbox만 겹쳐도 선택되던 버그 수정
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

// CLICK-TO-CLICK drawing (line/polyline/curve/circuit) + ARC / RIGHTANGLE / LABELER
// placement extracted to tools/click-placement.js (setupClickDrawing, clearClickLocals).
// FREE-DRAW (F) -> tools/free-draw.js ; NODE -> tools/node-placement.js.

/* ----- commit gate: ignore stray clicks that drew nothing ----- */
// Size-based shapes need a non-trivial box; a line needs a non-trivial length.
export function isCommittable(shape) {
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
  // 모든 도형의 기본 라벨은 "물리량"(quantity, 수식 글꼴 이탤릭) + 가운데(labelPos 미설정
  // → withBoxLabel에서 "center"). 사각형도 동일하게 quantity로 시작한다(블록 이름 A·B·C를
  // 쓸 때는 인스펙터에서 "라벨" 종류로 바꾸면 신명중명조 정체로 렌더된다).
  // shape.labelType은 위에서 이미 "quantity"로 초기화되어 있으므로 rect 전용 재지정은 없다.
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
  if (type === "gauge") {
    const d = gaugeTickDefaults();
    shape.kind = _drawKind || "ruler";
    shape.opacity = 1;
    shape.fillNone = true;
    if (shape.kind === "ruler") {
      // 눈금자: 폭=드래그 가로길이, 높이=고정 띠(10mm). 눈금 간격은 드래그와 무관.
      shape.tickIntervalMm = d.rulerTickMm;
      shape.h = 10;
    } else {
      // 각도기: 반지름=드래그 더 큰 변, 폭=지름, 높이=반지름(반원 bbox).
      const rad = Math.max(shape.w, shape.h);
      shape.w = rad * 2;
      shape.h = rad;
      shape.lockAspect = true;
      shape.tickIntervalDeg = d.protractorTickDeg;
    }
  }
  return applyNewObjectStyleDefaults(shape);
}

/* 자·각도기 눈금 간격 기본값 — 기본값 설정(localStorage)에서 읽는다(순환 import
 * 회피를 위해 직접 파싱). 값이 없거나 깨졌으면 안전한 기본값(10mm / 10°). */
function gaugeTickDefaults() {
  const fallback = { rulerTickMm: 10, protractorTickDeg: 10 };
  try {
    const d = JSON.parse(localStorage.getItem("phyDraw.defaults") || "{}");
    return {
      rulerTickMm: Number(d.rulerTickMm) > 0 ? Number(d.rulerTickMm) : fallback.rulerTickMm,
      protractorTickDeg: Number(d.protractorTickDeg) > 0 ? Number(d.protractorTickDeg) : fallback.protractorTickDeg,
    };
  } catch (_) {
    return fallback;
  }
}

/* ----- build an endpoint-based line from two world points (DESIGN 2-1 branch B) ----- */
// A line is defined by TWO endpoints (p1/p2), not x/y/w/h, and has no fill.
export function makeLine(a, b) {
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
export function makeCircuit(a, b) {
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
export function makePolyline(points) {
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
export function makeCurve(points) {
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

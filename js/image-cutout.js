/* ===== IMAGE CUTOUT EDITING (edit-mode image objects only) =====
//
// DESIGN 1-1 (data-as-truth): an erased region is DATA on the image object, not a
// separate white cover / selectable object. Each edit-mode image carries
// `cutouts: []`; every entry describes a transparent region in the image's OWN
// local coordinate system:
//
//   rect:  { id, type:"rect", x, y, w, h }          — all in [0..1] fractions
//   path:  { id, type:"path", points:[{x,y}…], brushWidth }  — fractions
//
// Coordinates are fractions of the image box with the ORIGIN at the image's
// top-left corner BEFORE rotation. Because they are fractions of the box, moving,
// resizing, or rotating the image keeps the erased areas attached automatically —
// render.js projects them through an SVG <mask maskContentUnits="objectBoundingBox">
// so no per-object reference size or transform.js coordinate math is needed.
//
// This module owns ONLY the interactive erase gesture (사각형/자유 영역 지우기) and
// the 지운 영역 초기화 clear. Rendering + export live in render.js/svg-export.js
// (they read obj.cutouts). Temporary drag UI is drawn on the SVG root (not in
// state.objects), so it is never selectable and never exported. */

import { screenToWorld } from "./viewport.js?v=0.38.0";

const SVG_NS = "http://www.w3.org/2000/svg";

// Default freeform brush thickness as a fraction of the image box (objectBoundingBox
// stroke length). ~3% erases small text/marks cleanly without swallowing the image.
export const DEFAULT_BRUSH_WIDTH = 0.03;

let _state = null;
let _svg = null;
let _idCounter = 0;

// erase-mode session (null when idle)
let _mode = null;          // "rect" | "path"
let _imageId = null;       // id of the image being erased
let _dragging = false;     // a drag gesture is in progress
let _rectStart = null;     // {x,y} fraction of the rect drag start
let _rectPending = null;   // {x,y,w,h} committed-on-Enter rect (fractions)
let _pathPoints = null;    // [{x,y}] fractions accumulated for the freeform stroke

// transient DOM: instruction banner + SVG preview element (both never exported)
let _banner = null;
let _preview = null;

/* ----- image lookup helpers ----- */
function selectedImageId(s) {
  const ids = s.selectedIds || [];
  if (ids.length !== 1) return null;
  const o = s.objects.find((x) => x.id === ids[0]);
  return o && o.type === "image" && o.mode === "edit" ? o.id : null;
}
function imageById(s, id) {
  const o = s.objects.find((x) => x.id === id);
  return o && o.type === "image" ? o : null;
}

/* ----- world <-> local-fraction conversion (origin = top-left, pre-rotation) ----- */
function worldToFraction(obj, wx, wy) {
  const rot = obj.rotation || 0;
  const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
  let px = wx, py = wy;
  if (rot) {
    const a = -rot * Math.PI / 180; // un-rotate about the center
    const dx = wx - cx, dy = wy - cy;
    px = cx + dx * Math.cos(a) - dy * Math.sin(a);
    py = cy + dx * Math.sin(a) + dy * Math.cos(a);
  }
  return { x: (px - obj.x) / obj.w, y: (py - obj.y) / obj.h };
}
function fractionToWorld(obj, fx, fy) {
  const rot = obj.rotation || 0;
  const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
  const px = obj.x + fx * obj.w, py = obj.y + fy * obj.h;
  if (!rot) return { x: px, y: py };
  const a = rot * Math.PI / 180;
  const dx = px - cx, dy = py - cy;
  return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// objectBoundingBox interprets a stroke-width as a fraction of the normalized
// diagonal — mirror that here so the on-canvas preview thickness matches the mask.
function brushWorldWidth(obj, frac) {
  return frac * Math.sqrt((obj.w * obj.w + obj.h * obj.h) / 2);
}

/* ----- instruction banner (fixed overlay; never part of state/export) ----- */
function showBanner(text) {
  if (!_banner) {
    _banner = document.createElement("div");
    _banner.className = "cutout-instruction";
    document.body.appendChild(_banner);
  }
  _banner.textContent = text;
  _banner.style.display = "";
}
function hideBanner() {
  if (_banner) _banner.style.display = "none";
}

/* ----- preview overlay (drawn on the SVG root, world coords, pointer-transparent) ----- */
function clearPreview() {
  if (_preview) { _preview.remove(); _preview = null; }
}
function ensurePreview(tag) {
  if (_preview && _preview.tagName.toLowerCase() !== tag) clearPreview();
  if (!_preview) {
    _preview = document.createElementNS(SVG_NS, tag);
    _preview.setAttribute("pointer-events", "none");
    _preview.dataset.ui = "cutout-preview";
    _svg.appendChild(_preview);
  }
  return _preview;
}
function drawRectPreview(obj, aFrac, bFrac) {
  const corners = [
    { x: aFrac.x, y: aFrac.y }, { x: bFrac.x, y: aFrac.y },
    { x: bFrac.x, y: bFrac.y }, { x: aFrac.x, y: bFrac.y },
  ].map((c) => fractionToWorld(obj, c.x, c.y));
  const el = ensurePreview("polygon");
  el.setAttribute("points", corners.map((p) => `${p.x},${p.y}`).join(" "));
  el.setAttribute("fill", "rgba(9,105,218,0.18)");
  el.setAttribute("stroke", "#0969da");
  el.setAttribute("stroke-width", "0.3");
  el.setAttribute("stroke-dasharray", "0.7 0.5");
}
function drawPathPreview(obj, ptsFrac) {
  const world = ptsFrac.map((p) => fractionToWorld(obj, p.x, p.y));
  const el = ensurePreview("polyline");
  el.setAttribute("points", world.map((p) => `${p.x},${p.y}`).join(" "));
  el.setAttribute("fill", "none");
  el.setAttribute("stroke", "rgba(9,105,218,0.55)");
  el.setAttribute("stroke-width", brushWorldWidth(obj, DEFAULT_BRUSH_WIDTH));
  el.setAttribute("stroke-linecap", "round");
  el.setAttribute("stroke-linejoin", "round");
}

/* ----- undo-aware mutation of the selected image's cutouts ----- */
function pushCutout(cutout) {
  const s = _state.get();
  const snap = JSON.parse(JSON.stringify(s.objects));
  _state.update((s2) => {
    const o = imageById(s2, _imageId);
    if (!o) return;
    if (!Array.isArray(o.cutouts)) o.cutouts = [];
    o.cutouts.push(cutout);
    s2.undoStack.push(snap);
    s2.redoStack = [];
  });
}

/* ----- enter / exit erase mode ----- */
function enterMode(mode) {
  const s = _state.get();
  const id = selectedImageId(s);
  if (!id) return; // guarded by the inspector, but stay safe
  exitMode(); // clear any prior session first
  _mode = mode;
  _imageId = id;
  _dragging = false;
  _rectStart = null;
  _rectPending = null;
  _pathPoints = null;
  showBanner(mode === "rect"
    ? "지울 영역을 드래그하십시오. Enter 확정, Esc 취소"
    : "지울 부분을 드래그하십시오. Enter 확정, Esc 취소");
}
function exitMode() {
  _mode = null;
  _imageId = null;
  _dragging = false;
  _rectStart = null;
  _rectPending = null;
  _pathPoints = null;
  hideBanner();
  clearPreview();
}

/* ===== public API (called by inspector.js) ===== */
export function startRectErase() { enterMode("rect"); }
export function startPathErase() { enterMode("path"); }
export function clearCutouts() {
  const s = _state.get();
  const id = selectedImageId(s);
  if (!id) return;
  const o = imageById(s, id);
  if (!o || !Array.isArray(o.cutouts) || o.cutouts.length === 0) return;
  const snap = JSON.parse(JSON.stringify(s.objects));
  _state.update((s2) => {
    const t = imageById(s2, id);
    if (!t) return;
    t.cutouts = [];
    s2.undoStack.push(snap);
    s2.redoStack = [];
  });
}
export function isErasing() { return _mode !== null; }

/* ----- commit helpers ----- */
function commitRect() {
  if (!_rectPending) { exitMode(); return; }
  const r = _rectPending;
  if (r.w > 0.001 && r.h > 0.001) {
    pushCutout({ id: `cut_${Date.now().toString(36)}_${++_idCounter}`, type: "rect",
      x: r.x, y: r.y, w: r.w, h: r.h });
  }
  exitMode();
}
function commitPath() {
  const pts = _pathPoints || [];
  if (pts.length >= 1) {
    pushCutout({ id: `cut_${Date.now().toString(36)}_${++_idCounter}`, type: "path",
      points: pts.map((p) => ({ x: p.x, y: p.y })), brushWidth: DEFAULT_BRUSH_WIDTH });
  }
  exitMode();
}

/* ===== init: capture-phase mouse/key interception (preempts select/draw/move) ===== */
export function initImageCutout(state, svg) {
  _state = state;
  _svg = svg;

  // If the selected image changes or is deleted mid-gesture, cancel safely so the
  // mode can never get stuck on a stale object (interaction-safety requirement).
  state.subscribe((s) => {
    if (!_mode) return;
    const o = imageById(s, _imageId);
    const stillSelected = (s.selectedIds || []).length === 1 && (s.selectedIds || [])[0] === _imageId;
    if (!o || !stillSelected) exitMode();
  });

  const worldAt = (e) => screenToWorld(_svg, _state.get().viewBox, e.clientX, e.clientY);

  // mousedown (capture on window → runs before the bubble select/draw/move handlers)
  window.addEventListener("mousedown", (e) => {
    if (!_mode) return;
    if (e.button !== 0) return;         // let middle/right (pan) through
    e.preventDefault();
    e.stopPropagation();
    const obj = imageById(_state.get(), _imageId);
    if (!obj) { exitMode(); return; }
    const w0 = worldAt(e);
    const f = worldToFraction(obj, w0.x, w0.y);
    _dragging = true;
    if (_mode === "rect") {
      _rectStart = { x: clamp01(f.x), y: clamp01(f.y) };
      _rectPending = null;
      drawRectPreview(obj, _rectStart, _rectStart);
    } else {
      _pathPoints = [{ x: clamp01(f.x), y: clamp01(f.y) }];
      drawPathPreview(obj, _pathPoints);
    }
  }, true);

  window.addEventListener("mousemove", (e) => {
    if (!_mode || !_dragging) return;
    e.stopPropagation();
    const obj = imageById(_state.get(), _imageId);
    if (!obj) { exitMode(); return; }
    const w = worldAt(e);
    const f = worldToFraction(obj, w.x, w.y);
    if (_mode === "rect") {
      const cur = { x: clamp01(f.x), y: clamp01(f.y) };
      drawRectPreview(obj, _rectStart, cur);
      _rectPending = {
        x: Math.min(_rectStart.x, cur.x), y: Math.min(_rectStart.y, cur.y),
        w: Math.abs(cur.x - _rectStart.x), h: Math.abs(cur.y - _rectStart.y),
      };
    } else {
      _pathPoints.push({ x: clamp01(f.x), y: clamp01(f.y) });
      drawPathPreview(obj, _pathPoints);
    }
  }, true);

  window.addEventListener("mouseup", (e) => {
    if (!_mode || !_dragging) return;
    e.stopPropagation();
    _dragging = false;
    // Freeform commits on release (spec 4). Rectangle keeps its preview so Enter
    // confirms / Esc cancels / a fresh drag redefines it (spec 3).
    if (_mode === "path") commitPath();
  }, true);

  // Enter 확정 / Esc 취소. Also swallow bare tool-shortcut keys so erase mode can
  // never be knocked out from under the pointer by a stray "v"/"s"/… keypress.
  window.addEventListener("keydown", (e) => {
    if (!_mode) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); exitMode(); return; }
    if (e.key === "Enter") {
      e.preventDefault(); e.stopPropagation();
      if (_mode === "rect") commitRect(); else commitPath();
      return;
    }
    // let modifier combos (Ctrl+Z, etc.) pass; block plain single keys.
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
      e.preventDefault(); e.stopPropagation();
    }
  }, true);
}

/* ===== RENDER (DESIGN 1-1: SVG is a projection of state.objects) ===== */
//
// render(state) repaints the <g id="scene"> from data. It is registered as a
// store subscriber in main.js, so ANY state.update() repaints automatically ??// no caller ever invokes render() by hand. That is the data-as-truth proof.
//
// Each object carries its own world coordinates (x/y/w/h in viewBox units), so
// the projection stays anchored in world space through zoom/pan (the viewBox
// alone changes what slice of that space is shown).

import { getZoom, getRenderScale } from "../viewport.js?v=1.0.2";
import { SVG_NS, rotPt, catmullRomPath } from "./core.js?v=1.0.2";
import { renderText } from "./labels.js?v=1.0.2";
import { makeFillPattern } from "./fill.js?v=1.0.2";
import {
  renderRect,
  renderEllipse,
  renderTriangle,
  renderLine,
  renderPolyline,
  renderCurve,
  renderImage,
  renderSvgAsset,
} from "./shapes.js?v=1.0.2";
import { renderAxes, renderAngleArc, renderRightAngle, renderLabeler } from "./annotations.js?v=1.0.2";
import { renderCoordplane, renderFuncgraph } from "./coordplane.js?v=1.0.2";
import { renderCircuit } from "./circuit.js?v=1.0.2";
import { renderOptics, renderApparatus } from "./optics-apparatus.js?v=1.0.2";
import { renderPendulum, pendulumBBox } from "./pendulum.js?v=1.0.2";
import { renderGauge } from "./gauge.js?v=1.0.2";
import { DEFAULT_TEXT_SIZE_MM } from "../state.js?v=1.0.2";
import { SIZE_TYPES, TEXT_MEASURED_TYPES, POINT_ARRAY_TYPES } from "../object-types.js?v=1.0.2";
import { resolveObjectStyle } from "../style-mode.js?v=1.0.2";
import { renderFormula } from "../formula.js?v=1.0.2";
import { IMAGE_EDIT_SESSION_ID } from "../image-cutout.js?v=1.0.2";

function renderObjectById(state, id) {
  if (id === IMAGE_EDIT_SESSION_ID) return state.imageEditSession || null;
  return state.objects.find((o) => o.id === id) || null;
}

/* ===== SNAP PREVIEW STATE: transient render data, never persisted ===== */
let snapPreview = null;

export function setSnapPreview(preview) {
  const validPoint = (point) => point
    && Number.isFinite(point.x) && Number.isFinite(point.y);
  snapPreview = preview && validPoint(preview.from) && validPoint(preview.to)
    ? preview
    : null;
}

/* ===== SNAP PREVIEW OVERLAY: closest pair only, zoom-invariant styling ===== */
function renderSnapPreview(scene, zoom) {
  if (!snapPreview) return;
  const scale = zoom > 0 ? zoom : 1;
  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("id", "snap-preview");
  group.setAttribute("pointer-events", "none");

  // SINGLE red-dot indicator: when from and to coincide (endpoint/node attach),
  // draw ONE dot and no connecting line. Otherwise (body-move pairing preview)
  // keep the dashed link + a dot at each end.
  const coincident = Math.hypot(snapPreview.to.x - snapPreview.from.x,
                                snapPreview.to.y - snapPreview.from.y) < 0.5 / scale;
  if (!coincident) {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", snapPreview.from.x);
    line.setAttribute("y1", snapPreview.from.y);
    line.setAttribute("x2", snapPreview.to.x);
    line.setAttribute("y2", snapPreview.to.y);
    line.setAttribute("stroke", "#e03131");
    line.setAttribute("stroke-width", 1 / scale);
    line.setAttribute("stroke-dasharray", `${4 / scale} ${3 / scale}`);
    group.appendChild(line);
  }

  const dotPoints = coincident ? [snapPreview.to] : [snapPreview.from, snapPreview.to];
  for (const point of dotPoints) {
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", point.x);
    dot.setAttribute("cy", point.y);
    dot.setAttribute("r", 4 / scale);
    dot.setAttribute("fill", "#e03131");
    group.appendChild(dot);
  }
  scene.appendChild(group);
}

/* ----- main draw: clear the scene group, repaint from state ----- */
export function render(state) {
  const scene = document.getElementById("scene");
  if (!scene) return;

  // Simplest correct projection: wipe and rebuild. Fine at this scale; a
  // keyed/diffing pass can replace this once object counts grow.
  scene.replaceChildren();

  // ----- per-object fill patterns: regenerated every render into a fresh <defs> -----
  // (matches the wipe-and-rebuild model ??each object's pattern carries its own
  // fillLevel as the mark color, so different levels never collide).
  const defs = document.createElementNS(SVG_NS, "defs");
  scene.appendChild(defs);
  for (const obj of state.objects) {
    const pat = makeFillPattern(obj);
    if (pat) defs.appendChild(pat);
  }

  // ----- artboard: world-space rect from state.artboard (single source of truth),
  // centered on origin, non-interactive, always first. 1 world unit = 1 mm. -----
  const { w: _abW, h: _abH } = state.artboard;
  const artboard = document.createElementNS(SVG_NS, "rect");
  artboard.setAttribute("x", -_abW / 2);
  artboard.setAttribute("y", -_abH / 2);
  artboard.setAttribute("width", _abW);
  artboard.setAttribute("height", _abH);
  artboard.setAttribute("fill", "#ffffff");
  artboard.setAttribute("stroke", "#d0d7de");
  artboard.setAttribute("stroke-width", "1");
  artboard.setAttribute("vector-effect", "non-scaling-stroke");
  artboard.setAttribute("pointer-events", "none");
  scene.appendChild(artboard);

  // ----- grid layer (between artboard and objects; never exported) -----
  if (state.grid && state.grid.visible) {
    scene.appendChild(renderGrid(state));
  }

  // ----- committed objects (z-order = array order, DESIGN 1-1) -----
  const _editingId = state.draftText && state.draftText.editingId;
  for (const obj of state.objects) {
    // The object being re-edited is drawn by the draftText preview instead, so
    // skip its committed render to avoid double text while editing.
    if (_editingId && obj.id === _editingId) continue;
    // A formula being re-edited is replaced by its inline editor overlay; skip
    // its committed render so the old glyphs don't show behind the input.
    if (state.editingFormulaId && obj.id === state.editingFormulaId) continue;
    const _layerId = obj.layerId ?? 1;
    const _layer = (state.layers || []).find(l => l.id === _layerId);
    if (_layer && _layer.visible === false) continue;
    const el = renderObject(obj);
    if (!el) continue;
    const _isActive = _layerId === state.activeLayerId;
    if (!_isActive) el.setAttribute("opacity", "0.5");
    if (isLockedTracingImage(obj)) el.setAttribute("pointer-events", "none");
    if (!_isActive) el.setAttribute("pointer-events", "none");
    scene.appendChild(el);
    // Open-path hit twin: only on the active layer (other layers stay non-interactive).
    // The twin width is HIT_PX / getZoom(), so a zoom/viewBox change recomputes it via
    // the store subscribe → render path (main.js: state.subscribe(render)).
    if (_isActive && !isLockedTracingImage(obj)) {
      const twin = makeHitTwin(obj);
      if (twin) {
        el.setAttribute("pointer-events", "none"); // only the twin receives events
        scene.appendChild(twin);
      }
    }
  }

  // Temporary pasted-image cleanup session. It is rendered but not committed:
  // no data-id, no picking, no export/save until Ctrl+Enter creates an object.
  if (state.imageEditSession) {
    const temp = renderImage({ ...state.imageEditSession, id: IMAGE_EDIT_SESSION_ID, opacity: 1 });
    if (temp) {
      temp.dataset.ui = "image-edit-session";
      scene.appendChild(temp);
    }
  }

  // ----- ruler guides: editing aids only; export builds from objects separately -----
  const vb = state.viewBox;
  for (const guide of state.guides || []) {
    const group = document.createElementNS(SVG_NS, "g");
    group.dataset.guideId = guide.id;

    const setEnds = (line) => {
      if (guide.axis === "x") {
        line.setAttribute("x1", guide.position);
        line.setAttribute("x2", guide.position);
        line.setAttribute("y1", vb.y - vb.h);
        line.setAttribute("y2", vb.y + vb.h * 2);
      } else {
        // Extend past the viewBox so SVG letterboxing cannot leave a visible
        // gap between a horizontal guide and the left ruler.
        line.setAttribute("x1", vb.x - vb.w);
        line.setAttribute("x2", vb.x + vb.w * 2);
        line.setAttribute("y1", guide.position);
        line.setAttribute("y2", guide.position);
      }
    };

    const line = document.createElementNS(SVG_NS, "line");
    setEnds(line);
    line.setAttribute("stroke", state.selectedGuideId === guide.id ? "#0550ae" : "#0969da");
    line.setAttribute("stroke-width", state.selectedGuideId === guide.id ? "1.5" : "1");
    line.setAttribute("stroke-opacity", state.selectedGuideId === guide.id ? "0.9" : "0.65");
    line.setAttribute("vector-effect", "non-scaling-stroke");
    line.setAttribute("pointer-events", "none");
    group.appendChild(line);

    // Only the margins outside the artboard are draggable. The visible line
    // through the drawing area deliberately remains pointer-transparent.
    const addDragZone = (x1, y1, x2, y2) => {
      if (x1 === x2 && y1 === y2) return;
      const hit = document.createElementNS(SVG_NS, "line");
      hit.setAttribute("x1", x1);
      hit.setAttribute("y1", y1);
      hit.setAttribute("x2", x2);
      hit.setAttribute("y2", y2);
      hit.setAttribute("stroke", "transparent");
      hit.setAttribute("stroke-width", "10");
      hit.setAttribute("vector-effect", "non-scaling-stroke");
      hit.dataset.guideId = guide.id;
      hit.style.cursor = guide.axis === "x" ? "col-resize" : "row-resize";
      group.appendChild(hit);
    };
    if (guide.axis === "x") {
      const topEnd = Math.min(-_abH / 2, vb.y + vb.h);
      const bottomStart = Math.max(_abH / 2, vb.y);
      if (topEnd > vb.y) addDragZone(guide.position, vb.y, guide.position, topEnd);
      if (bottomStart < vb.y + vb.h) {
        addDragZone(guide.position, bottomStart, guide.position, vb.y + vb.h);
      }
    } else {
      const leftEnd = Math.min(-_abW / 2, vb.x + vb.w);
      const rightStart = Math.max(_abW / 2, vb.x);
      if (leftEnd > vb.x) addDragZone(vb.x, guide.position, leftEnd, guide.position);
      if (rightStart < vb.x + vb.w) {
        addDragZone(rightStart, guide.position, vb.x + vb.w, guide.position);
      }
    }
    scene.appendChild(group);
  }

  // ----- selection outline (blue dashed bbox; world space so it tracks zoom/pan) -----
  const _selIds = state.selectedIds || [];

  // For a grouped multi-selection, draw ONE combined green rect instead of per-member outlines.
  const _groupMembers = _selIds.map((id) => renderObjectById(state, id)).filter(Boolean);
  const _firstMember = _groupMembers[0];
  const _allSameGroup = _selIds.length > 1 && _firstMember && _firstMember.groupId &&
    _groupMembers.every((o) => o.groupId === _firstMember.groupId);
  if (_allSameGroup) {
    const _gbox = combinedGroupBBox(_groupMembers, scene);
    if (_gbox) {
      const _grect = document.createElementNS(SVG_NS, "rect");
      _grect.setAttribute("x", _gbox.x);
      _grect.setAttribute("y", _gbox.y);
      _grect.setAttribute("width", _gbox.w);
      _grect.setAttribute("height", _gbox.h);
      _grect.setAttribute("fill", "none");
      _grect.setAttribute("stroke-width", "0.4");
      _grect.setAttribute("stroke-dasharray", "0.6 0.6");
      _grect.style.stroke = "#2f9e44";
      scene.appendChild(_grect);
    }
  }

  for (const _sid of _selIds) {
    const sel = renderObjectById(state, _sid);
    if (!sel) continue;
    const _selLayer = (state.layers || []).find(l => l.id === (sel.layerId ?? 1));
    if (_selLayer && _selLayer.visible === false) continue;
    if (sel.positionLocked) renderPositionLockMarker(sel, scene, getZoom());
    if (_allSameGroup) continue; // combined rect already drawn above
    const _selColor = (state.targetedId === _sid) ? "#e67700"
                    : sel.groupId  ? "#2f9e44"
                    : sel.locked   ? "#e53e3e"
                    : sel.positionLocked ? "#8b5cf6"
                    : "var(--c-main, #0969da)";
    if (sel.type === "line" || sel.type === "circuit" || sel.type === "pendulum") {
      // Line/circuit/pendulum have no bbox; the selection guide is a dashed copy
      // of the p1–p2 segment (pendulum: pivot → real bob, i.e. the string axis).
      const ln = document.createElementNS(SVG_NS, "line");
      ln.setAttribute("x1", sel.p1.x);
      ln.setAttribute("y1", sel.p1.y);
      ln.setAttribute("x2", sel.p2.x);
      ln.setAttribute("y2", sel.p2.y);
      ln.setAttribute("stroke-width", "0.4"); // world units
      ln.setAttribute("stroke-dasharray", "0.6 0.6");
      ln.style.stroke = _selColor;
      ln.setAttribute("pointer-events", "none"); // decorative; the hit twin owns events
      scene.appendChild(ln);
    } else if (sel.type === "polyline" && sel.closed === true) {
      // Closed polyline takes branch-A (face) treatment: a dashed bbox rect guide,
      // matching rect/ellipse/triangle. Points are world-true so the box is axis-aligned.
      const bb = singleObjBBox(sel, scene);
      if (bb) {
        const box = document.createElementNS(SVG_NS, "rect");
        box.setAttribute("x", bb.x);
        box.setAttribute("y", bb.y);
        box.setAttribute("width", bb.w);
        box.setAttribute("height", bb.h);
        box.setAttribute("fill", "none");
        box.setAttribute("stroke-width", "0.4"); // world units
        box.setAttribute("stroke-dasharray", "0.6 0.6");
        box.style.stroke = _selColor;
        scene.appendChild(box);
      }
    } else if (sel.type === "polyline") {
      // Open polyline: guide is a dashed copy of the path.
      const pl = document.createElementNS(SVG_NS, "polyline");
      pl.setAttribute("points", sel.points.map((p) => `${p.x},${p.y}`).join(" "));
      pl.setAttribute("fill", "none");
      pl.setAttribute("stroke-width", "0.4"); // world units
      pl.setAttribute("stroke-dasharray", "0.6 0.6");
      pl.style.stroke = _selColor;
      pl.setAttribute("pointer-events", "none"); // decorative; the hit twin owns events
      scene.appendChild(pl);
    } else if (sel.type === "curve" && sel.closed === true) {
      // Closed curve: bbox rect guide (same as closed polyline).
      const bb = singleObjBBox(sel, scene);
      if (bb) {
        const box = document.createElementNS(SVG_NS, "rect");
        box.setAttribute("x", bb.x);
        box.setAttribute("y", bb.y);
        box.setAttribute("width", bb.w);
        box.setAttribute("height", bb.h);
        box.setAttribute("fill", "none");
        box.setAttribute("stroke-width", "0.4");
        box.setAttribute("stroke-dasharray", "0.6 0.6");
        box.style.stroke = _selColor;
        scene.appendChild(box);
      }
    } else if (sel.type === "curve") {
      // Open curve: dashed copy of the smooth path.
      const cv = document.createElementNS(SVG_NS, "path");
      cv.setAttribute("d", catmullRomPath(sel.points));
      cv.setAttribute("fill", "none");
      cv.setAttribute("stroke-width", "0.4"); // world units
      cv.setAttribute("stroke-dasharray", "0.6 0.6");
      cv.style.stroke = _selColor;
      cv.setAttribute("pointer-events", "none"); // decorative; the hit twin owns events
      scene.appendChild(cv);
    } else if (sel.type === "text" || sel.type === "formula") {
      // getBBox() on the already-rendered element gives the exact visual bounds.
      // (formula's <g> includes a transparent body rect spanning its whole box.)
      const textEl = scene.querySelector(`[data-id="${sel.id}"]`);
      if (textEl) {
        try {
          const bb = textEl.getBBox();
          const box = document.createElementNS(SVG_NS, "rect");
          box.setAttribute("x", bb.x);
          box.setAttribute("y", bb.y);
          box.setAttribute("width", bb.width);
          box.setAttribute("height", bb.height);
          box.setAttribute("fill", "none");
          box.setAttribute("stroke-width", "0.4");
          box.setAttribute("stroke-dasharray", "0.6 0.6");
          box.style.stroke = _selColor;
          // getBBox()는 요소 자신의 rotate 변환을 반영하지 않으므로 회전된 텍스트/수식은
          // 선택 외곽선이 회전 전 위치에 남는다 → 렌더와 동일한 rotate를 박스에도 적용.
          // (text는 앵커 obj.x/obj.y, formula는 박스 중심이 피벗)
          if (sel.rotation) {
            const px = sel.type === "formula" ? sel.x + (sel.w || 0) / 2 : sel.x;
            const py = sel.type === "formula" ? sel.y + (sel.h || 0) / 2 : sel.y;
            box.setAttribute("transform", `rotate(${sel.rotation} ${px} ${py})`);
          }
          scene.appendChild(box);
        } catch (_) { /* not laid out yet */ }
      }
    } else if (sel.type === "anglearc") {
      // EDIT-TIME GUIDE: the arc's TWO bounding radii (vertex → each arc end),
      // drawn as dashed lines in the SAME visual family as the selection box.
      // Projection only — lives in this overlay (never in renderObject), so it
      // shows only while selected and is excluded from SVG/PNG export like handles.
      const r = sel.radius || 0;
      const a0 = (sel.startAngle || 0) * Math.PI / 180;
      const a1 = ((sel.startAngle || 0) + (sel.sweepAngle ?? 0)) * Math.PI / 180;
      for (const rad of [a0, a1]) {
        const ray = document.createElementNS(SVG_NS, "line");
        ray.setAttribute("x1", sel.x);
        ray.setAttribute("y1", sel.y);
        ray.setAttribute("x2", sel.x + r * Math.cos(rad));
        ray.setAttribute("y2", sel.y - r * Math.sin(rad)); // +Y up → SVG y down
        ray.setAttribute("fill", "none");
        ray.setAttribute("stroke-width", "0.4"); // world units, matches the box
        ray.setAttribute("stroke-dasharray", "0.6 0.6");
        ray.style.stroke = _selColor;
        ray.setAttribute("pointer-events", "none");
        scene.appendChild(ray);
      }
      // Dashed bbox guide (vertex-centered square of radius r), matching the
      // branch-A selection boxes so the arc reads as a normal selected object.
      const _bb = singleObjBBox(sel, scene);
      if (_bb) {
        const box = document.createElementNS(SVG_NS, "rect");
        box.setAttribute("x", _bb.x);
        box.setAttribute("y", _bb.y);
        box.setAttribute("width", _bb.w);
        box.setAttribute("height", _bb.h);
        box.setAttribute("fill", "none");
        box.setAttribute("stroke-width", "0.4");
        box.setAttribute("stroke-dasharray", "0.6 0.6");
        box.style.stroke = _selColor;
        scene.appendChild(box);
      }
    } else {
      const box = document.createElementNS(SVG_NS, "rect");
      box.setAttribute("x", sel.x);
      box.setAttribute("y", sel.y);
      box.setAttribute("width", sel.w);
      box.setAttribute("height", sel.h);
      box.setAttribute("fill", "none");
      box.setAttribute("stroke-width", "0.4"); // world units
      box.setAttribute("stroke-dasharray", "0.6 0.6");
      box.style.stroke = _selColor;
      if (sel.rotation) {
        const cx = sel.x + sel.w / 2, cy = sel.y + sel.h / 2;
        box.setAttribute("transform", `rotate(${sel.rotation} ${cx} ${cy})`);
      }
      scene.appendChild(box);
    }
  }

  // ----- selection handles (DESIGN 5-2: fixed 10 CSS px = 10/zoom world units) -----
  if (_selIds.length === 1) {
    const handleSel = renderObjectById(state, _selIds[0]);
    // 숨긴 레이어의 객체에는 핸들을 그리지 않는다(보이지 않는 객체가 변형되는 것 방지).
    const _hLayer = handleSel && (state.layers || []).find(l => l.id === (handleSel.layerId ?? 1));
    const _hVisible = !(_hLayer && _hLayer.visible === false);
    if (handleSel && _hVisible && !state.targetedId) {
      renderHandles(handleSel, scene, getZoom(), state.activeTool);
    }
  } else if (_selIds.length > 1 && !state.targetedId) {
    // Whole-group selection (green): every selected object shares one groupId.
    // Draw 8 resize handles on the COMBINED bbox so the group scales as a unit
    // (DESIGN 6-2). Targeted (orange) is excluded above, so it never gets handles.
    const _members = _selIds.map((id) => state.objects.find((o) => o.id === id)).filter(Boolean);
    const _first = _members[0];
    const _sharedGid = _first && _first.groupId &&
      _members.every((o) => o.groupId === _first.groupId) ? _first.groupId : null;
    if (_sharedGid) {
      const _box = combinedGroupBBox(_members, scene);
      if (_box) {
        // Reuse renderHandles via a synthetic axis-aligned rect (id "__group__"):
        // it emits the same 8 white squares the resize logic listens for.
        renderHandles(
          { type: "rect", id: "__group__", x: _box.x, y: _box.y, w: _box.w, h: _box.h, rotation: 0 },
          scene, getZoom(), state.activeTool
        );
      }
    } else {
      // Plain multi-selection (no shared groupId): still draw the 8 handles on the
      // combined bbox so an ad-hoc selection scales/rotates as a unit.
      const _box = combinedGroupBBox(_members, scene);
      if (_box) {
        renderHandles(
          { type: "rect", id: "__group__", x: _box.x, y: _box.y, w: _box.w, h: _box.h, rotation: 0 },
          scene, getZoom(), state.activeTool
        );
      }
    }
  }

  /* ===== SNAP PREVIEW OVERLAY HOOK: same transient layer as selection handles ===== */
  renderSnapPreview(scene, getZoom());

  // ----- live drag preview (ephemeral; not in state.objects yet) -----
  if (state.draft) {
    const d = state.draft;

    // For size-based shapes (ellipse/triangle) the bbox differs from the shape
    // outline, so draw a dashed rectangle guide spanning the drag bounds first.
    // (rect's own preview already IS that rectangle; the line has no bbox ??it
    // shows its own solid preview below ??so both skip the duplicate guide.)
    if (d.type !== "rect" && d.type !== "line" && d.type !== "polyline" && d.type !== "curve" && d.type !== "anglearc" && d.type !== "rightangle" && d.type !== "circuit" && d.type !== "labeler" && d.type !== "pendulum") {
      const box = document.createElementNS(SVG_NS, "rect");
      box.setAttribute("x", d.x);
      box.setAttribute("y", d.y);
      box.setAttribute("width", d.w);
      box.setAttribute("height", d.h);
      box.setAttribute("fill", "none");
      box.style.stroke = "var(--c-main, #0969da)";
      box.setAttribute("stroke-width", d.strokeWidth);
      box.setAttribute("stroke-dasharray", "0.6 0.6"); // world-unit dashes
      scene.appendChild(box);
    }

    // anglearc preview: a blue dashed rubber-band radius from the vertex to the
    // start point, showing the vertex + radius while the arc (below) previews the
    // sweep. Projection only — the committed arc carries no radius line.
    if (d.type === "anglearc") {
      const rad = (d.startAngle || 0) * Math.PI / 180;
      const ex = d.x + (d.radius || 0) * Math.cos(rad);
      const ey = d.y - (d.radius || 0) * Math.sin(rad); // +Y up → SVG y down
      const guide = document.createElementNS(SVG_NS, "line");
      guide.setAttribute("x1", d.x);
      guide.setAttribute("y1", d.y);
      guide.setAttribute("x2", ex);
      guide.setAttribute("y2", ey);
      guide.setAttribute("fill", "none");
      guide.style.stroke = "var(--c-main, #0969da)";
      guide.setAttribute("stroke-width", "0.3");
      guide.setAttribute("stroke-dasharray", "0.6 0.6");
      guide.setAttribute("pointer-events", "none");
      scene.appendChild(guide);
    }

    // The actual shape outline that will be committed, drawn inside the guide.
    // Render it SOLID exactly as the real shape will look (black stroke, same
    // stroke-width from renderObject) ??no dashing ??so the preview matches.
    const el = renderObject(d);
    if (el) {
      scene.appendChild(el);
    }
  }

  // Optional non-native preview. Normal editing uses the textarea overlay so
  // its visible glyphs and native caret share one browser text layout.
  if (state.draftText && !state.draftText.nativeEditor && (state.draftText.text || "").length) {
    const dt = state.draftText;
    const tEl = renderText(dt);
    tEl.dataset.ui = "draft-text";
    scene.appendChild(tEl);
    try {
      const bb = tEl.getBBox();
      const pad = 3 / getRenderScale(); // ~3 screen px of padding, zoom-stable
      const box = document.createElementNS(SVG_NS, "rect");
      box.setAttribute("x", bb.x - pad);
      box.setAttribute("y", bb.y - pad);
      box.setAttribute("width", bb.width + pad * 2);
      box.setAttribute("height", bb.height + pad * 2);
      box.setAttribute("fill", "none");
      box.setAttribute("stroke-width", "0.4");
      box.setAttribute("stroke-dasharray", "0.6 0.6");
      box.style.stroke = "var(--c-main, #0969da)";
      box.setAttribute("pointer-events", "none");
      box.dataset.ui = "draft-text-outline";
      scene.appendChild(box);
    } catch (_) { /* not laid out yet */ }
  }
}

function renderPositionLockMarker(obj, scene, zoom) {
  const box = singleObjBBox(obj, scene);
  if (!box) return;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const arm = 6 / zoom;
  const gap = 2 / zoom;
  const sw = 1.5 / zoom;
  const marker = document.createElementNS(SVG_NS, "g");
  marker.setAttribute("data-ui", "position-lock-anchor");
  marker.setAttribute("pointer-events", "none");
  for (const [x1, y1, x2, y2] of [
    [cx - arm, cy, cx - gap, cy], [cx + gap, cy, cx + arm, cy],
    [cx, cy - arm, cx, cy - gap], [cx, cy + gap, cx, cy + arm],
  ]) {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", x1); line.setAttribute("y1", y1);
    line.setAttribute("x2", x2); line.setAttribute("y2", y2);
    line.setAttribute("stroke", "#8b5cf6");
    line.setAttribute("stroke-width", sw);
    line.setAttribute("stroke-linecap", "round");
    marker.appendChild(line);
  }
  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("cx", cx); dot.setAttribute("cy", cy);
  dot.setAttribute("r", 1.5 / zoom);
  dot.setAttribute("fill", "#8b5cf6");
  marker.appendChild(dot);
  scene.appendChild(marker);
}

/* ===== GRID LAYER (reference grid drawn on artboard; never in exports) ===== */
function renderGrid(state) {
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("id", "grid-layer");
  g.setAttribute("pointer-events", "none");

  const { w: abW, h: abH } = state.artboard;
  const left   = -abW / 2;
  const right  =  abW / 2;
  const top    = -abH / 2;
  const bottom =  abH / 2;

  // 1-10 → 0.1-1.0, applied directly to stroke color so lines are fully black at max
  const opacity = state.grid.opacity / 10;
  const majorStroke = `rgba(0,0,0,${opacity.toFixed(2)})`;
  const minorStroke = `rgba(0,0,0,${(opacity * 0.5).toFixed(2)})`;

  // 음수/0/빈값이 들어오면(입력칸 min 속성은 타이핑을 못 막음) x가 매회 감소하며
  // x<=xMax가 영원히 참이 돼 무한 루프로 탭이 정지한다 → 하한 1로 클램프.
  const STEP  = Math.max(1, Number(state.grid.interval) || 10);
  const MAJOR = STEP * 5;

  // Vertical lines (x = constant)
  const xMin = Math.ceil(left  / STEP) * STEP;
  const xMax = Math.floor(right / STEP) * STEP;
  for (let x = xMin; x <= xMax; x += STEP) {
    const isMajor = x % MAJOR === 0;
    const ln = document.createElementNS(SVG_NS, "line");
    ln.setAttribute("x1", x);  ln.setAttribute("y1", top);
    ln.setAttribute("x2", x);  ln.setAttribute("y2", bottom);
    ln.setAttribute("stroke", isMajor ? majorStroke : minorStroke);
    ln.setAttribute("stroke-width", isMajor ? 0.3 : 0.2);
    ln.setAttribute("vector-effect", "non-scaling-stroke");
    g.appendChild(ln);
    if (isMajor) {
      const lbl = document.createElementNS(SVG_NS, "text");
      lbl.setAttribute("x", x);
      lbl.setAttribute("y", bottom + 1.5);
      lbl.setAttribute("font-size", "1.8");
      lbl.setAttribute("fill", majorStroke);
      lbl.setAttribute("text-anchor", "middle");
      lbl.setAttribute("dominant-baseline", "hanging");
      lbl.setAttribute("font-family", "IBM Plex Mono, monospace");
      lbl.textContent = String(x);
      g.appendChild(lbl);
    }
  }

  // Horizontal lines (y = constant)
  const yMin = Math.ceil(top    / STEP) * STEP;
  const yMax = Math.floor(bottom / STEP) * STEP;
  for (let y = yMin; y <= yMax; y += STEP) {
    const isMajor = y % MAJOR === 0;
    const ln = document.createElementNS(SVG_NS, "line");
    ln.setAttribute("x1", left);  ln.setAttribute("y1", y);
    ln.setAttribute("x2", right); ln.setAttribute("y2", y);
    ln.setAttribute("stroke", isMajor ? majorStroke : minorStroke);
    ln.setAttribute("stroke-width", isMajor ? 0.3 : 0.2);
    ln.setAttribute("vector-effect", "non-scaling-stroke");
    g.appendChild(ln);
    if (isMajor) {
      const lbl = document.createElementNS(SVG_NS, "text");
      lbl.setAttribute("x", left - 1);
      lbl.setAttribute("y", y);
      lbl.setAttribute("font-size", "1.8");
      lbl.setAttribute("fill", majorStroke);
      lbl.setAttribute("text-anchor", "end");
      lbl.setAttribute("dominant-baseline", "middle");
      lbl.setAttribute("font-family", "IBM Plex Mono, monospace");
      lbl.textContent = String(y);
      g.appendChild(lbl);
    }
  }

  return g;
}

/* ===== HIT TWIN (open paths: one fat invisible band unifies hover + grab/click) =====
 * A thin line/polyline/curve is only ~1px of real geometry, so the visible stroke
 * is the lone element that can receive pointer events — making thin open paths
 * almost impossible to grab (transform.js reads e.target's data-id) and giving no
 * hover affordance. Fix: for every OPEN path render a transparent duplicate over
 * the SAME geometry with a fat, zoom-INVARIANT stroke (HIT_PX screen px / getZoom()
 * world units) carrying the SAME data-id. pointer-events="stroke" makes the band
 * hittable despite transparent paint; cursor:pointer drives hover + selection/grab
 * from this ONE element. The visible stroke is set pointer-events="none" so only the
 * twin is interactive. Closed shapes already grab via their (transparent-capable)
 * fill, so they get no twin. Twins exist only in the editor render() — export builds
 * from renderObject(), so they never reach SVG/PNG output or the export viewBox. */
const HIT_PX = 12; // constant on-screen hit width (px), mirroring the handle/zoom pattern

function isLockedTracingImage(obj) {
  return !!obj && obj.type === "image" && (obj.imageSelectionLocked === true || (obj.mode === "background" && obj.locked === true));
}

function makeHitTwin(obj) {
  let twin = null;
  if (obj.type === "line") {
    twin = document.createElementNS(SVG_NS, "line");
    twin.setAttribute("x1", obj.p1.x);
    twin.setAttribute("y1", obj.p1.y);
    twin.setAttribute("x2", obj.p2.x);
    twin.setAttribute("y2", obj.p2.y);
  } else if (obj.type === "polyline" && obj.closed !== true) {
    twin = document.createElementNS(SVG_NS, "polyline");
    twin.setAttribute("points", (obj.points || []).map((p) => `${p.x},${p.y}`).join(" "));
  } else if (obj.type === "funcgraph" && (obj.curveStyle === "straight" || obj.sourceKind === "points")) {
    // 직선/꺾은선 계열(요구 ④): 히트 영역도 실제 렌더(직선 세그먼트)와 맞춘다(Catmull-Rom 곡선이면 어긋남).
    twin = document.createElementNS(SVG_NS, "polyline");
    twin.setAttribute("points", (obj.points || []).map((p) => `${p.x},${p.y}`).join(" "));
  } else if ((obj.type === "curve" && obj.closed !== true) || obj.type === "funcgraph") {
    twin = document.createElementNS(SVG_NS, "path");
    twin.setAttribute("d", catmullRomPath(obj.points || []));
  } else if (obj.type === "rect" || obj.type === "ellipse" || obj.type === "triangle" ||
             obj.type === "image" || obj.type === "svgAsset" || obj.type === "axes" || obj.type === "coordplane" || obj.type === "optics" ||
             obj.type === "apparatus") {
    twin = document.createElementNS(SVG_NS, "rect");
    twin.setAttribute("x", obj.x);
    twin.setAttribute("y", obj.y);
    twin.setAttribute("width", obj.w);
    twin.setAttribute("height", obj.h);
    if (obj.rotation) {
      const cx = obj.x + obj.w / 2, cy = obj.y + obj.h / 2;
      twin.setAttribute("transform", `rotate(${obj.rotation} ${cx} ${cy})`);
    }
  } else if (obj.type === "anglearc") {
    const r = obj.radius || 0;
    twin = document.createElementNS(SVG_NS, "rect");
    twin.setAttribute("x", obj.x - r);
    twin.setAttribute("y", obj.y - r);
    twin.setAttribute("width", r * 2);
    twin.setAttribute("height", r * 2);
  } else if (obj.type === "rightangle") {
    const r = (obj.size || 0) * 1.6;
    twin = document.createElementNS(SVG_NS, "rect");
    twin.setAttribute("x", obj.x - r);
    twin.setAttribute("y", obj.y - r);
    twin.setAttribute("width", r * 2);
    twin.setAttribute("height", r * 2);
  } else if (obj.type === "labeler") {
    // Hover band along the leader (p1→p2); the label glyph grabs via its own fill.
    const a = obj.p1 || { x: 0, y: 0 }, b = obj.p2 || a;
    twin = document.createElementNS(SVG_NS, "line");
    twin.setAttribute("x1", a.x);
    twin.setAttribute("y1", a.y);
    twin.setAttribute("x2", b.x);
    twin.setAttribute("y2", b.y);
  } else {
    return null; // not an open path → no twin (closed shapes grab via fill)
  }
  const isRectTwin = twin.tagName.toLowerCase() === "rect";
  twin.setAttribute("fill", isRectTwin ? "transparent" : "none");
  twin.setAttribute("stroke", "transparent");
  twin.setAttribute("stroke-width", HIT_PX / getZoom()); // zoom-invariant screen px
  twin.setAttribute("stroke-linecap", "round");
  twin.setAttribute("stroke-linejoin", "round");
  twin.setAttribute("pointer-events", isRectTwin ? "all" : "stroke");
  if (obj.id) twin.dataset.id = obj.id;
  twin.dataset.ui = "hit-twin";
  return twin;
}

/* ----- per-object dispatch (one branch per shape type) ----- */
// Exported so SVG export reuses the exact same per-object node builders
// (no duplicated shape-drawing code; DESIGN 1-1 projection stays single-source).
export function renderObject(obj) {
  obj = resolveObjectStyle(obj);
  switch (obj.type) {
    case "rect":
      return renderRect(obj);
    case "ellipse":
      return renderEllipse(obj);
    case "triangle":
      return renderTriangle(obj);
    case "line":
      return renderLine(obj);
    case "polyline":
      return renderPolyline(obj);
    case "curve":
      return renderCurve(obj);
    case "text":
      return renderText(obj);
    case "formula":
      return renderFormula(obj);
    case "image":
      return renderImage(obj);
    case "svgAsset":
      return renderSvgAsset(obj);
    case "axes":
      return renderAxes(obj);
    case "coordplane":
      return renderCoordplane(obj);
    case "funcgraph":
      return renderFuncgraph(obj);
    case "anglearc":
      return renderAngleArc(obj);
    case "rightangle":
      return renderRightAngle(obj);
    case "labeler":
      return renderLabeler(obj);
    case "circuit":
      return renderCircuit(obj);
    case "optics":
      return renderOptics(obj);
    case "apparatus":
      return renderApparatus(obj);
    case "pendulum":
      return renderPendulum(obj);
    case "gauge":
      return renderGauge(obj);
    default:
      return null;
  }
}

/* ----- selection handles: 10-CSS-px white squares, zoom-invariant (DESIGN 5-2) ----- */
/* ----- bbox of one object in world space (text uses its rendered <text> box) ----- */
export function singleObjBBox(o, scene) {
  // was: rect|ellipse|triangle|image|svgAsset|axes|coordplane|optics|apparatus
  if (SIZE_TYPES.has(o.type)) {
    const deg = o.rotation || 0;
    if (!deg) return { x: o.x, y: o.y, w: o.w, h: o.h };
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const corners = [
      rotPt(o.x,       o.y,       cx, cy, deg),
      rotPt(o.x + o.w, o.y,       cx, cy, deg),
      rotPt(o.x + o.w, o.y + o.h, cx, cy, deg),
      rotPt(o.x,       o.y + o.h, cx, cy, deg),
    ];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of corners) {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  // anglearc has no x/y/w/h — its box is the vertex-centered square of radius r.
  if (o.type === "anglearc") {
    const r = o.radius || 0;
    return { x: o.x - r, y: o.y - r, w: 2 * r, h: 2 * r };
  }
  if (o.type === "rightangle") {
    const r = (o.size || 0) * 1.6;
    return { x: o.x - r, y: o.y - r, w: 2 * r, h: 2 * r };
  }
  if (TEXT_MEASURED_TYPES.has(o.type)) { // was: text|formula
    const el = scene.querySelector(`[data-id="${o.id}"]`);
    if (el) {
      try { const bb = el.getBBox(); return { x: bb.x, y: bb.y, w: bb.width, h: bb.height }; }
      catch (_) { /* not laid out yet */ }
    }
    return null;
  }
  if (o.type === "line" || o.type === "circuit") {
    return {
      x: Math.min(o.p1.x, o.p2.x), y: Math.min(o.p1.y, o.p2.y),
      w: Math.abs(o.p2.x - o.p1.x), h: Math.abs(o.p2.y - o.p1.y),
    };
  }
  if (o.type === "labeler") {
    const a = o.p1 || { x: 0, y: 0 }, b = o.p2 || a;
    const sz = (o.labelSize || DEFAULT_TEXT_SIZE_MM) * 0.7; // pad for the label glyph
    const minX = Math.min(a.x, b.x - sz), minY = Math.min(a.y, b.y - sz);
    const maxX = Math.max(a.x, b.x + sz), maxY = Math.max(a.y, b.y + sz);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (o.type === "pendulum") {
    return pendulumBBox(o);
  }
  if (POINT_ARRAY_TYPES.has(o.type)) { // was: polyline|curve|funcgraph
    const pts = o.points || [];
    if (!pts.length) return null;
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const p of pts) { if (p.x < a) a = p.x; if (p.y < b) b = p.y; if (p.x > c) c = p.x; if (p.y > d) d = p.y; }
    return { x: a, y: b, w: c - a, h: d - b };
  }
  return null;
}

/* ----- union bbox of several objects (for whole-group resize handles) ----- */
function combinedGroupBBox(members, scene) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of members) {
    const b = singleObjBBox(o, scene);
    if (!b) continue;
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  if (!isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function renderHandles(sel, scene, zoom, activeTool) {
  const half = 5 / zoom;   // resize square is half*2 = 10 CSS px (DESIGN 5-2 base size)
  const sw   = 0.5 / zoom;

  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("id", "handles");

  const makeHandle = (wx, wy, label, easierPointerTarget = false) => {
    if (easierPointerTarget) {
      const hit = document.createElementNS(SVG_NS, "rect");
      const hitHalf = 12 / zoom;
      hit.setAttribute("x", wx - hitHalf);
      hit.setAttribute("y", wy - hitHalf);
      hit.setAttribute("width", hitHalf * 2);
      hit.setAttribute("height", hitHalf * 2);
      hit.setAttribute("fill", "transparent");
      hit.dataset.handle = label;
      hit.dataset.id = sel.id;
      g.appendChild(hit);
    }
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", wx - half);
    r.setAttribute("y", wy - half);
    r.setAttribute("width",  half * 2);
    r.setAttribute("height", half * 2);
    r.setAttribute("fill", "#ffffff");
    r.setAttribute("stroke", "#0969da");
    r.setAttribute("stroke-width", sw);
    r.dataset.handle = label;
    r.dataset.id = sel.id;
    g.appendChild(r);
  };

  const _closedPoly  = sel.type === "polyline" && sel.closed === true;
  const _closedCurve = sel.type === "curve"    && sel.closed === true;
  const _anglearc = sel.type === "anglearc";
  const _rightangle = sel.type === "rightangle";
  // Open polyline/curve normally shows per-vertex handles (edit each point), but under
  // the rotate tool it borrows branch-A corner rotate handles so it spins about its
  // bbox center like other shapes — cut pieces are open polylines and must rotate too.
  const _openPolyRot = (sel.type === "polyline" || sel.type === "curve") && !sel.closed && activeTool === "rotate";
  // was: rect|ellipse|triangle|image|svgAsset|axes|coordplane|optics|apparatus (+ derived-box cases)
  if (SIZE_TYPES.has(sel.type) || _anglearc || _rightangle || _closedPoly || _closedCurve || _openPolyRot) {
    // Closed polyline/curve and anglearc reuse branch-A handles on a derived
    // (axis-aligned) bbox; none has x/y/w/h or a rotation field, so derive the
    // box and pin deg to 0 (anglearc's rotation lives in startAngle, not a box).
    let x, y, w, h, deg;
    if (_closedPoly || _closedCurve || _anglearc || _rightangle || _openPolyRot) {
      const bb = singleObjBBox(sel, scene);
      // points가 빈 배열인 폴리라인/커브(옛 프로젝트 파일·객체화 산출물) 등은 bb가 null —
      // 다른 호출부(예: 283-298행)처럼 방어해 핸들을 그리지 않고 빠진다. 방어 없이
      // 구조분해하면 render()가 예외를 던지고, render는 state.subscribe(render)라
      // 이후 모든 상태 변경이 화면에 반영되지 않는 정지 상태에 빠진다.
      if (!bb) return g;
      ({ x, y, w, h } = bb);
      deg = 0;
    } else {
      ({ x, y, w, h } = sel);
      deg = sel.rotation || 0;
    }
    const cx = x + w / 2, cy = y + h / 2;
    const rx = x + w, by = y + h;

    // Compute rotated world positions for all 8 handle anchor points
    const hNW = rotPt(x,  y,  cx, cy, deg);
    const hN  = rotPt(cx, y,  cx, cy, deg);
    const hNE = rotPt(rx, y,  cx, cy, deg);
    const hE  = rotPt(rx, cy, cx, cy, deg);
    const hSE = rotPt(rx, by, cx, cy, deg);
    const hS  = rotPt(cx, by, cx, cy, deg);
    const hSW = rotPt(x,  by, cx, cy, deg);
    const hW  = rotPt(x,  cy, cx, cy, deg);

    if (activeTool === "rotate") {
      const rotOuter = 28 / zoom;
      // edge handles: normal white squares
      makeHandle(hN.x,  hN.y,  "n");
      makeHandle(hE.x,  hE.y,  "e");
      makeHandle(hS.x,  hS.y,  "s");
      makeHandle(hW.x,  hW.y,  "w");
      // corner handles: blue circles + 90째 arc indicators
      const makeArc = (px, py, startDeg, endDeg) => {
        const R = rotOuter;
        const s = startDeg * Math.PI / 180;
        const e = endDeg   * Math.PI / 180;
        const x1 = px + R * Math.cos(s), y1 = py + R * Math.sin(s);
        const x2 = px + R * Math.cos(e), y2 = py + R * Math.sin(e);
        const arc = document.createElementNS(SVG_NS, "path");
        arc.setAttribute("d", `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`);
        arc.setAttribute("fill", "none");
        arc.setAttribute("stroke", "#0969da");
        arc.setAttribute("stroke-width", 1.5 / zoom);
        arc.setAttribute("pointer-events", "none");
        g.appendChild(arc);
      };
      // base angles per corner (unrotated): arc faces outward from shape
      for (const [label, pt, base] of [
        ["nw", hNW, 180], ["ne", hNE, 270], ["se", hSE, 0], ["sw", hSW, 90]
      ]) {
        const c = document.createElementNS(SVG_NS, "circle");
        c.setAttribute("cx", pt.x);
        c.setAttribute("cy", pt.y);
        c.setAttribute("r",  half);
        c.setAttribute("fill", "#0969da");
        c.setAttribute("stroke", "none");
        c.dataset.handle = label;
        c.dataset.id = sel.id;
        g.appendChild(c);
        makeArc(pt.x, pt.y, base + deg, base + deg + 90);
      }
    } else {
      // normal resize mode: all 8 handles as white squares
      makeHandle(hNW.x, hNW.y, "nw");
      makeHandle(hN.x,  hN.y,  "n");
      makeHandle(hNE.x, hNE.y, "ne");
      makeHandle(hE.x,  hE.y,  "e");
      makeHandle(hSE.x, hSE.y, "se");
      makeHandle(hS.x,  hS.y,  "s");
      makeHandle(hSW.x, hSW.y, "sw");
      makeHandle(hW.x,  hW.y,  "w");
    }
  } else if (sel.type === "labeler" && activeTool === "rotate") {
    // Labeler rotation: corner handles (blue circles + 90° arc hints) around the
    // derived bbox spin the whole object (leader + label) about its center. Under
    // the V tool the labeler instead shows its two endpoint handles (below).
    const bb = singleObjBBox(sel, scene);
    if (bb) {
      const { x, y, w, h } = bb;
      const rx = x + w, by = y + h;
      const rotOuter = 28 / zoom;
      const makeArc = (px, py, startDeg, endDeg) => {
        const R = rotOuter;
        const s = startDeg * Math.PI / 180, en = endDeg * Math.PI / 180;
        const x1 = px + R * Math.cos(s), y1 = py + R * Math.sin(s);
        const x2 = px + R * Math.cos(en), y2 = py + R * Math.sin(en);
        const arc = document.createElementNS(SVG_NS, "path");
        arc.setAttribute("d", `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`);
        arc.setAttribute("fill", "none");
        arc.setAttribute("stroke", "#0969da");
        arc.setAttribute("stroke-width", 1.5 / zoom);
        arc.setAttribute("pointer-events", "none");
        g.appendChild(arc);
      };
      for (const [label, hx, hy, base] of [
        ["nw", x, y, 180], ["ne", rx, y, 270], ["se", rx, by, 0], ["sw", x, by, 90]
      ]) {
        const c = document.createElementNS(SVG_NS, "circle");
        c.setAttribute("cx", hx);
        c.setAttribute("cy", hy);
        c.setAttribute("r", half);
        c.setAttribute("fill", "#0969da");
        c.setAttribute("stroke", "none");
        c.dataset.handle = label;
        c.dataset.id = sel.id;
        g.appendChild(c);
        makeArc(hx, hy, base, base + 90);
      }
    }
  } else if (sel.type === "line" || sel.type === "circuit" || sel.type === "labeler" || sel.type === "pendulum") {
    // Circuit + labeler + pendulum reuse the line's two endpoint handles: drag
    // p1/p2 to move an endpoint. For the pendulum, p0 = pivot, p1 = real bob.
    makeHandle(sel.p1.x, sel.p1.y, "p0", true);
    makeHandle(sel.p2.x, sel.p2.y, "p1", true);
  } else if ((sel.type === "polyline" || sel.type === "curve") && !sel.closed) {
    sel.points.forEach((p, i) => makeHandle(p.x, p.y, `p${i}`, true));
  }
  // text: no handles

  scene.appendChild(g);
}

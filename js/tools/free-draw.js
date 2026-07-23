/* ===== FREE-DRAW TOOL (F): freehand drag → simplified+smoothed closed curve =====
 * Captures a freehand pointer drag as raw world points, previews them live as an
 * open curve, then on release simplifies them (Ramer–Douglas–Peucker) and stores
 * them as a CLOSED curve object — reusing the closed-curve fill/render/hit infra.
 * The Catmull-Rom closed renderer smooths the anchors AND the end→start wrap, so
 * the shape closes cleanly. Default fill = opaque WHITE, default no stroke
 * (borderless; main use = covering parts of an imported image). Fill/stroke stay
 * editable in the inspector; it exports, undoes in one step, and round-trips via
 * project-io exactly like any other curve.
 *
 * MOVE-ONLY extraction from tools.js: setupFreeDraw(svg, state) is called from
 * initTools. Space-held (pan) state stays owned by tools.js and is read via its
 * isSpaceHeld() getter so there is never a divergent copy. */

import { screenToWorld } from "../viewport.js?v=1.2.0";
import { simplifyRDP } from "../geometry.js?v=1.2.0";
import { nextObjectId } from "./id.js?v=1.2.0";
import { isSpaceHeld } from "../tools.js?v=1.2.0";

let _svg = null;
let _state = null;
let _fdActive = false;    // a free-draw drag is in progress
let _fdRaw = null;        // raw captured world points during the drag
const FD_MIN_STEP = 0.3;  // min world-mm movement to record a new raw point
const FD_RDP_EPS  = 0.6;  // RDP simplification tolerance (world mm)

export function setupFreeDraw(svg, state) {
  _svg = svg;
  _state = state;

  _svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (isSpaceHeld()) return;
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

  // 터치 환경에서 pointercancel(제스처 가로채기 등)이 오면 pointerup이 안 와서
  // _fdActive가 영구히 남고 이후 이동만으로 유령 곡선이 쌓인다 → 상태를 리셋하고
  // 진행 중이던 미리보기 draft도 지운다.
  window.addEventListener("pointercancel", (e) => {
    if (!_fdActive) return;
    _fdActive = false;
    _fdRaw = null;
    try { _svg.releasePointerCapture(e.pointerId); } catch (_) {}
    _state.update((s) => { s.draft = null; });
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
        id: nextObjectId(),
        type: "curve",
        points: simplified,
        closed: true,
        rotation: 0,
        strokeLevel: 255,
        strokeWidth: 0.2,
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

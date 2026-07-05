/* ===== FUNCTION-GRAPH / INSERT: commit a funcgraph (+ plane) to the canvas ===== */
//
// The commit path shared by the palette "함수 입력" button now, and by the §10-④
// 모달 later (the modal collects expr + domain + preview, then calls this). If a
// coordplane is currently selected, the graph is drawn onto it (planeId ref);
// otherwise a fresh default plane is created at the view center. One undo snapshot
// covers both objects, and the new funcgraph is auto-selected.

import { sampleFunctionPoints } from "./sampler.js?v=0.46.0";
import { makeDefaultCoordplane } from "./defaults.js?v=0.46.0";

let _fgCounter = 0;

// insertFunctionGraph(state, expr) → { ok, error }
// error is a user-facing message (bad formula / empty domain) when ok is false.
function insertFunctionGraph(state, expr) {
  const s = state.get();
  const selId = (s.selectedIds || [])[0];
  const selected = selId ? s.objects.find((o) => o.id === selId) : null;
  const reusePlane = selected && selected.type === "coordplane" ? selected : null;

  // Plane to sample against: the selected one, or a fresh draft at view center.
  let newPlane = null;
  let plane = reusePlane;
  if (!plane) {
    const vb = s.viewBox;
    newPlane = makeDefaultCoordplane({ x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 });
    plane = newPlane;
  }

  // MVP domain = the plane's full x-range (기획서 §10-④ 모달에서 드래그로 좁힘).
  const domainMin = plane.xMin, domainMax = plane.xMax;
  const { points, error } = sampleFunctionPoints(expr, domainMin, domainMax, plane);
  if (error) return { ok: false, error };
  if (points.length < 2) return { ok: false, error: "정의역 안에서 그릴 수 있는 점이 없습니다" };

  state.update((st) => {
    const snap = JSON.parse(JSON.stringify(st.objects));
    const stamp = Date.now().toString(36);
    let planeId;
    if (newPlane) {
      newPlane.id = `obj_${stamp}_fgp${++_fgCounter}`;
      newPlane.order = st.objects.length;
      newPlane.layerId = st.activeLayerId;
      st.objects.push(newPlane);
      planeId = newPlane.id;
    } else {
      planeId = reusePlane.id;
    }
    const fg = {
      type: "funcgraph",
      expr,
      domainMin, domainMax,
      planeId,
      points,
      closed: false,
      strokeLevel: 0,
      strokeWidth: 0.3,          // a touch bolder than the 0.2 axes/grid
      dashLength: 0, dashGap: 0,
      label: "", labelShow: false,
      id: `obj_${stamp}_fg${++_fgCounter}`,
      order: st.objects.length,
      layerId: st.activeLayerId,
      locked: false,
      positionLocked: false,
    };
    st.objects.push(fg);
    st.undoStack.push(snap);
    st.redoStack = [];
    st.selectedIds = [fg.id];   // auto-select the new graph
    st.targetedId = null;
    st.activeTool = "V";
  });
  return { ok: true };
}

export { insertFunctionGraph };

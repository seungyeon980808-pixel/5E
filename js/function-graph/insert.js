/* ===== FUNCTION-GRAPH / INSERT: commit a funcgraph (+ plane) to the canvas ===== */
//
// The commit path shared by the palette "함수 입력" button now, and by the §10-④
// 모달 later (the modal collects expr + domain + preview, then calls this). If a
// coordplane is currently selected, the graph is drawn onto it (planeId ref);
// otherwise a fresh default plane is created at the view center. One undo snapshot
// covers both objects, and the new funcgraph is auto-selected.

import { sampleFunctionPoints } from "./sampler.js?v=0.54.10";
import { makeDefaultCoordplane } from "./defaults.js?v=0.54.10";

let _fgCounter = 0;

// insertFunctionGraph(state, expr, domain?) → { ok, error }
// domain = { min, max } (math x) limits where the curve is generated; defaults to
// the plane's full x-range. error is a user-facing message when ok is false.
function insertFunctionGraph(state, expr, domain) {
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

  // Domain = the modal's dragged range, else the plane's full x-range. Clamped to
  // the plane so the curve never generates outside the visible box.
  const domainMin = domain ? Math.max(plane.xMin, Math.min(domain.min, domain.max)) : plane.xMin;
  const domainMax = domain ? Math.min(plane.xMax, Math.max(domain.min, domain.max)) : plane.xMax;
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

// insertFunctionGraphs(state, funcs) → { ok, error }
// funcs: [{ expr, domain:{min,max}, strokeWidth, dashLength, dashGap }]. 여러 함수를
// 한 평면(선택된 coordplane, 없으면 새로 생성)에 한 번에 커밋한다. undo 스냅샷 1개.
function insertFunctionGraphs(state, funcs) {
  const s = state.get();
  const selId = (s.selectedIds || [])[0];
  const selected = selId ? s.objects.find((o) => o.id === selId) : null;
  const reusePlane = selected && selected.type === "coordplane" ? selected : null;

  let newPlane = null;
  let plane = reusePlane;
  if (!plane) {
    const vb = s.viewBox;
    newPlane = makeDefaultCoordplane({ x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 });
    plane = newPlane;
  }

  // 각 함수 샘플링(하나라도 오류면 커밋 안 함). 평면 x범위로 정의역 클램프.
  const prepared = [];
  for (const f of funcs || []) {
    const expr = String(f.expr || "").trim();
    if (!expr) continue;
    const dMin = f.domain ? Math.max(plane.xMin, Math.min(f.domain.min, f.domain.max)) : plane.xMin;
    const dMax = f.domain ? Math.min(plane.xMax, Math.max(f.domain.min, f.domain.max)) : plane.xMax;
    const { points, error } = sampleFunctionPoints(expr, dMin, dMax, plane);
    if (error) return { ok: false, error: `${expr}: ${error}` };
    if (points.length < 2) return { ok: false, error: `${expr}: 정의역 안에서 그릴 점이 없습니다` };
    prepared.push({
      expr, domainMin: dMin, domainMax: dMax, points,
      strokeWidth: Number.isFinite(f.strokeWidth) ? f.strokeWidth : 0.3,
      dashLength: f.dashLength || 0, dashGap: f.dashGap || 0,
    });
  }
  if (!prepared.length) return { ok: false, error: "함수를 입력하세요" };

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
    const ids = [];
    for (const p of prepared) {
      const fg = {
        type: "funcgraph",
        expr: p.expr, domainMin: p.domainMin, domainMax: p.domainMax,
        planeId, points: p.points, closed: false,
        strokeLevel: 0, strokeWidth: p.strokeWidth,
        dashLength: p.dashLength, dashGap: p.dashGap,
        label: "", labelShow: false,
        id: `obj_${stamp}_fg${++_fgCounter}`,
        order: st.objects.length,
        layerId: st.activeLayerId, locked: false, positionLocked: false,
      };
      st.objects.push(fg);
      ids.push(fg.id);
    }
    st.undoStack.push(snap);
    st.redoStack = [];
    st.selectedIds = ids;   // 삽입한 함수 모두 선택
    st.targetedId = null;
    st.activeTool = "V";
  });
  return { ok: true };
}

export { insertFunctionGraph, insertFunctionGraphs };

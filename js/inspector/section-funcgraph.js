/* ===== INSPECTOR SECTION — 함수 그래프 (funcgraph) =====
 * 개편(2026-07): 함수·요소의 모든 상세 설정(수식·정의역·끝라벨·선종류·선모양·표시점·
 * 수선·구간 화살표)은 이제 "그래프" 모달에서 미리 세팅한다. 재편집도 모달로 한다
 * (좌표평면 더블클릭, 또는 아래 "그래프 편집…" 버튼). 이 인스펙터에는 진입 버튼과
 * 파괴적 escape hatch("곡선으로 변환")만 남긴다. 선 색·굵기는 공용 "선" 섹션(sec1)이 담당.
 * Mount + show/hide live in js/inspector.js. */

import { makeSection } from "./widgets.js?v=1.0.1";
import { openGraphModal } from "../graph/graph-modal.js?v=1.0.1";

const BTN_CSS = "font-size:11px;border:1px solid var(--border);border-radius:6px;padding:4px 8px;background:var(--bg-input);color:var(--text-primary);cursor:pointer;";

export function buildFuncgraphSection(ctx) {
  const { state } = ctx;
  const body = document.createElement("div");

  function currentFuncgraph() {
    const s = state.get();
    const id = (s.selectedIds || [])[0];
    const o = id ? s.objects.find((it) => it.id === id) : null;
    return o && o.type === "funcgraph" ? o : null;
  }

  // 안내: 상세 설정은 모달에서.
  const hint = document.createElement("div");
  hint.style.cssText = "font-size:11px;color:var(--text-secondary);line-height:1.6;margin-bottom:8px;";
  hint.textContent = "함수·표시점·수선·화살표 설정은 그래프 편집 창에서 바꿉니다. (좌표평면 더블클릭 또는 아래 버튼)";
  body.appendChild(hint);

  // 그래프 편집…: 이 계열이 속한 좌표평면의 통합 모달을 편집 모드로 연다.
  const editRow = document.createElement("div");
  editRow.className = "insp-row";
  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.textContent = "그래프 편집…";
  editBtn.style.cssText = BTN_CSS + "width:100%;";
  editRow.appendChild(editBtn);
  body.appendChild(editRow);
  editBtn.addEventListener("click", () => {
    const o = currentFuncgraph();
    if (!o) return;
    if (o.planeId) openGraphModal(o.planeId);
    else window.alert("소속 좌표평면을 찾을 수 없습니다 (곡선으로 변환된 계열일 수 있습니다).");
  });

  // 곡선으로 변환 (§3-2): funcgraph → 일반 곡선(수식/요소 구동을 끊음, 되돌리기 불가).
  const convRow = document.createElement("div");
  convRow.className = "insp-row";
  const convBtn = document.createElement("button");
  convBtn.type = "button";
  convBtn.textContent = "곡선으로 변환";
  convBtn.title = "수식 구동을 끊고 점을 직접 편집할 수 있는 일반 곡선으로 바꿉니다 (표시점·수선·화살표는 사라짐, 되돌리기 불가)";
  convBtn.style.cssText = BTN_CSS + "width:100%;margin-top:4px;";
  convRow.appendChild(convBtn);
  body.appendChild(convRow);
  convBtn.addEventListener("click", () => {
    const o = currentFuncgraph();
    if (!o || o.locked) return;
    const s = state.get();
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o2 = s2.objects.find((it) => it.id === o.id);
      if (!o2 || o2.locked || o2.type !== "funcgraph") return;
      o2.type = "curve";
      delete o2.expr; delete o2.domainMin; delete o2.domainMax; delete o2.planeId;
      // 그래프 요소(표시점/수선/화살표) 베이크·스펙 제거 — 일반 곡선엔 의미 없음.
      delete o2.markers; delete o2.guideSegs; delete o2.arrowPolys;
      delete o2.markerXs; delete o2.guideXs; delete o2.arrowSpecs;
      o2.fillLevel = 255; o2.fillNone = false; o2.fillStyle = "solid"; o2.arrowHead = "none";
      s2.undoStack.push(snap); s2.redoStack = [];
    });
  });

  const secFunc = makeSection("함수 그래프", body);

  function sync(obj) {
    editBtn.disabled = false;      // 편집 창 진입은 잠금과 무관
    convBtn.disabled = !!obj.locked;
  }

  return { secFunc, syncFuncgraph: sync };
}

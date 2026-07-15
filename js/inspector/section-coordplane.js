/* ===== INSPECTOR SECTION — 좌표평면 (coordplane) =====
 * 좌표평면의 각종 설정(형태·범위·격자·눈금·라벨…)은 인스펙터에 펼치지 않는다 —
 * 전부 그래프 모달(graph-modal.js) 한 화면에서 다룬다(사용자 지시: "설정이 밖으로
 * 튀어나올 필요가 없다. 좌표 세팅 → 함수 세팅 → 출력"). 여기는 진입 버튼과
 * 내보내기 토글만 남긴 슬림 패널.
 *   - 그래프 편집… : richLabels(그래프 도구) 평면 → 통합 그래프 모달(편집 모드),
 *                    구형 평면(함수입력이 만든 것) → 기존 상세 편집 모달.
 *   - 내보내기 포함 : exportable 토글(요구 6 잔존 기능).
 * 더블클릭 재편집도 같은 분기를 탄다(tools.js). */

import { makeSection } from "./widgets.js?v=1.0.1";
import { openPlaneModal } from "../function-graph/plane-modal.js?v=1.0.1";
import { openGraphModal } from "../graph/graph-modal.js?v=1.0.1";
import { state } from "../state.js?v=1.0.1";

export function buildCoordplaneSection(ctx) {
  const { commitSelectedObject } = ctx;
  const body = document.createElement("div");

  const applies = (o) => o && o.type === "coordplane";

  // ---- 편집 진입 버튼: 좌표·계열·라벨 전부 모달에서 ----
  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.textContent = "그래프 편집…";
  editBtn.title = "좌표 틀과 그 위의 함수·직선/꺾은선을 한 화면에서 편집합니다 (더블클릭과 동일)";
  editBtn.style.cssText = "width:100%;margin-bottom:8px;font-size:12px;padding:6px;border:1px solid var(--accent);border-radius:6px;background:color-mix(in srgb, var(--accent) 22%, var(--bg-input));color:var(--text-primary);cursor:pointer;";
  editBtn.addEventListener("click", () => {
    const s = state.get();
    const id = (s.selectedIds || [])[0];
    const o = id ? s.objects.find((it) => it.id === id) : null;
    if (!o || o.type !== "coordplane") return;
    if (o.richLabels) openGraphModal(o.id);
    else openPlaneModal(o.id);
  });
  body.appendChild(editBtn);

  const hint = document.createElement("div");
  hint.textContent = "형태·칸 수·라벨·계열은 편집 화면에서 바꿉니다.";
  hint.style.cssText = "font-size:11px;color:var(--text-secondary);line-height:1.6;margin-bottom:8px;";
  body.appendChild(hint);

  // ---- 내보내기 포함 (exportable) ----
  const exportRow = document.createElement("div");
  exportRow.className = "insp-row";
  const exportCb = document.createElement("input");
  exportCb.type = "checkbox";
  exportCb.className = "insp-cb";
  const exportLbl = document.createElement("label");
  exportLbl.className = "insp-field-label";
  exportLbl.textContent = "내보내기 포함";
  exportRow.appendChild(exportCb);
  exportRow.appendChild(exportLbl);
  body.appendChild(exportRow);
  exportCb.addEventListener("change", () => {
    const val = exportCb.checked;
    commitSelectedObject((o) => {
      if (!applies(o) || o.exportable === val) return false;
      o.exportable = val;
      return true;
    });
  });

  const secCoord = makeSection("좌표평면", body);

  function sync(obj) {
    editBtn.disabled = !!obj.locked;
    exportCb.checked = obj.exportable !== false;
    exportCb.disabled = !!obj.locked;
  }

  return { secCoord, syncCoordplane: sync };
}

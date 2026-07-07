/* ===== 전체 수정: 여러 오브젝트의 속성을 한 번에 통일/변화 =====
 *
 * 고급 기능 [전체 수정] 버튼 → 모달.
 *   · 대상: 오브젝트를 선택해 두었으면 '선택한 N개', 아니면 '캔버스 전체'.
 *     (잠긴 오브젝트는 건드리지 않는다)
 *   · 모드 2가지
 *     - 통일   : 체크한 항목을 입력값으로 전부 맞춘다 (예: 선 굵기 전부 0.3mm).
 *     - 전체 수정: 현재 값에서 입력한 만큼 증감한다 (예: 글씨 크기 +2pt).
 *   · 항목: 선 굵기(mm) · 선 색(어둡기 0~255) · 면 색(어둡기 0~255) ·
 *           글씨 크기(pt: 텍스트 fontSize + 라벨 labelSize) · 각도(°)
 *   · 적용 = Undo 1스텝.
 */

import { ptToMm, MIN_TEXT_PT } from "./state.js?v=0.54.10";
import { SHAPE_TYPES } from "./object-types.js?v=0.54.10";
import { showAlert } from "./ui-dialogs.js?v=0.54.10";

let _state = null;
let _overlay = null;

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

/* 항목 정의: key, 라벨, 단위, 통일 기본값, 대상 판정, 적용 함수들 */
const FIELDS = [
  {
    key: "strokeWidth", label: "선 굵기", unit: "mm", step: 0.1, uniDefault: 0.2,
    has: (o) => typeof o.strokeWidth === "number",
    setUni: (o, v) => { o.strokeWidth = Math.max(0, v); },
    setDelta: (o, d) => { o.strokeWidth = Math.max(0, Math.round((o.strokeWidth + d) * 100) / 100); },
  },
  {
    key: "strokeLevel", label: "선 색(어둡기)", unit: "0~255", step: 5, uniDefault: 255,
    has: (o) => typeof o.strokeLevel === "number",
    // 내부 level은 0=검정·255=흰색, UI 어둡기는 반대 → 변환해 적용
    setUni: (o, v) => { o.strokeLevel = clamp255(255 - v); },
    setDelta: (o, d) => { o.strokeLevel = clamp255(o.strokeLevel - d); },
  },
  {
    key: "fillLevel", label: "면 색(어둡기)", unit: "0~255", step: 5, uniDefault: 0,
    has: (o) => typeof o.fillLevel === "number",
    setUni: (o, v) => { o.fillLevel = clamp255(255 - v); },
    setDelta: (o, d) => { o.fillLevel = clamp255(o.fillLevel - d); },
  },
  {
    key: "textSize", label: "글씨 크기", unit: "pt", step: 1, uniDefault: 10,
    has: (o) => o.type === "text" || typeof o.labelSize === "number",
    setUni: (o, v) => {
      const mm = ptToMm(Math.max(MIN_TEXT_PT, v));
      if (o.type === "text") o.fontSize = mm;
      if (typeof o.labelSize === "number") o.labelSize = mm;
    },
    setDelta: (o, d) => {
      const dmm = ptToMm(d) - ptToMm(0); // pt→mm 스케일 변환된 증분
      const minMm = ptToMm(MIN_TEXT_PT);
      if (o.type === "text" && typeof o.fontSize === "number") o.fontSize = Math.max(minMm, o.fontSize + dmm);
      if (typeof o.labelSize === "number") o.labelSize = Math.max(minMm, o.labelSize + dmm);
    },
  },
  {
    key: "rotation", label: "각도", unit: "°", step: 5, uniDefault: 0,
    has: (o) => SHAPE_TYPES.has(o.type) || typeof o.rotation === "number",
    setUni: (o, v) => { o.rotation = v % 360; },
    setDelta: (o, d) => { o.rotation = ((o.rotation || 0) + d) % 360; },
  },
];

function targets() {
  const s = _state.get();
  const ids = s.selectedIds || [];
  const pool = ids.length
    ? ids.map((id) => s.objects.find((o) => o.id === id)).filter(Boolean)
    : s.objects;
  return { objs: pool.filter((o) => !o.locked), scoped: ids.length > 0 };
}

function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="bulk-title"
         style="width:min(380px, calc(100vw - 32px))">
      <h2 class="modal-title" id="bulk-title">전체 수정</h2>
      <p class="objectify-description" id="bulk-target" style="margin:0 0 8px;"></p>
      <div class="modal-field">
        <span class="modal-label">모드</span>
        <div class="seg" id="bulk-mode">
          <button type="button" class="seg-btn is-active" data-mode="uniform"
                  title="체크한 항목을 입력값으로 전부 맞춥니다">통일</button>
          <button type="button" class="seg-btn" data-mode="delta"
                  title="현재 값에서 입력한 만큼 증감합니다 (+/-)">전체 수정</button>
        </div>
      </div>
      <div id="bulk-fields"></div>
      <div class="modal-actions">
        <button type="button" class="modal-btn" id="bulk-cancel">취소</button>
        <button type="button" class="modal-btn modal-btn-primary" id="bulk-apply">적용</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

let _mode = "uniform";
const _rows = new Map(); // key -> { cb, input }

function renderFields() {
  const host = _overlay.querySelector("#bulk-fields");
  host.innerHTML = "";
  _rows.clear();
  for (const f of FIELDS) {
    const row = document.createElement("label");
    row.className = "modal-field modal-field-row";
    row.style.cssText = "display:flex;align-items:center;gap:8px;";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    const lbl = document.createElement("span");
    lbl.className = "modal-label";
    lbl.style.cssText = "flex:1 1 auto;margin:0;";
    lbl.textContent = f.label;
    const input = document.createElement("input");
    input.type = "number";
    input.step = String(f.step);
    input.className = "modal-input";
    input.style.cssText = "width:90px;flex:none;";
    input.value = _mode === "uniform" ? String(f.uniDefault) : "0";
    const unit = document.createElement("span");
    unit.style.cssText = "flex:none;font-size:11px;color:var(--text-secondary);width:38px;";
    unit.textContent = _mode === "delta" ? `±${f.unit}` : f.unit;
    input.addEventListener("input", () => { cb.checked = true; });
    row.appendChild(cb); row.appendChild(lbl); row.appendChild(input); row.appendChild(unit);
    host.appendChild(row);
    _rows.set(f.key, { cb, input });
  }
}

function syncTargetText() {
  const { objs, scoped } = targets();
  _overlay.querySelector("#bulk-target").textContent = scoped
    ? `대상: 선택한 오브젝트 ${objs.length}개 (잠긴 오브젝트 제외)`
    : `대상: 캔버스 전체 ${objs.length}개 (잠긴 오브젝트 제외)`;
}

function apply() {
  const picked = FIELDS.filter((f) => {
    const r = _rows.get(f.key);
    if (!r || !r.cb.checked) return false;
    const v = Number(r.input.value);
    if (!isFinite(v)) return false;
    if (_mode === "delta" && v === 0) return false;
    return true;
  });
  if (!picked.length) { showAlert("적용할 항목을 체크하고 값을 입력하세요.", { title: "전체 수정" }); return; }
  const { objs } = targets();
  if (!objs.length) { showAlert("적용할 오브젝트가 없습니다.", { title: "전체 수정" }); return; }
  const idSet = new Set(objs.map((o) => o.id));
  _state.update((s2) => {
    s2.undoStack.push(JSON.parse(JSON.stringify(s2.objects)));
    s2.redoStack = [];
    for (const o of s2.objects) {
      if (!idSet.has(o.id) || o.locked) continue;
      for (const f of picked) {
        if (!f.has(o)) continue;
        const v = Number(_rows.get(f.key).input.value);
        if (_mode === "uniform") f.setUni(o, v);
        else f.setDelta(o, v);
      }
    }
  });
  _overlay.hidden = true;
}

export function initBulkEdit(state) {
  _state = state;
  _overlay = buildModal();
  const modeSeg = _overlay.querySelector("#bulk-mode");
  modeSeg.addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    modeSeg.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    _mode = btn.dataset.mode;
    renderFields();
  });
  _overlay.querySelector("#bulk-cancel").addEventListener("click", () => { _overlay.hidden = true; });
  _overlay.addEventListener("mousedown", (e) => { if (e.target === _overlay) _overlay.hidden = true; });
  _overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); _overlay.hidden = true; }
  });
  _overlay.querySelector("#bulk-apply").addEventListener("click", apply);
  document.getElementById("bulk-edit-open")?.addEventListener("click", () => {
    _mode = "uniform";
    modeSeg.querySelectorAll(".seg-btn").forEach((b, i) => b.classList.toggle("is-active", i === 0));
    renderFields();
    syncTargetText();
    _overlay.hidden = false;
  });
}

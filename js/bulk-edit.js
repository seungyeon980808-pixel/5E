/* ===== 전체 통일/수정: 여러 오브젝트의 속성을 한 번에 =====
 *
 * 고급 기능 [전체 통일/수정] 버튼 → 모달.
 *   · 대상: 오브젝트를 선택해 두었으면 '선택한 N개', 아니면 '캔버스 전체'.
 *     (잠긴 오브젝트는 건드리지 않는다)
 *   · 모드 2가지
 *     - 전체 통일: 모든 오브젝트를 같은 수치로 통일합니다.
 *     - 전체 수정: 모든 오브젝트의 수치를 일정하게 변화시킵니다(± 증감).
 *   · 항목(공통): 선 굵기 · 선 색(어둡기) · 면 색(어둡기) · 글씨 크기 · 각도
 *   · 항목(통일 전용): 글씨체 · 위치 고정 · 오브젝트 잠금
 *   · 각도: 도형/자·각도기 등은 rotation, 직선(line/circuit)은 양 끝점을
 *     중점 기준으로 회전(통일=절대각, 수정=상대각).
 *   · 적용 = Undo 1스텝.
 */

import { ptToMm, MIN_TEXT_PT, TEXT_FONTS, DEFAULT_TEXT_FONT } from "./state.js?v=1.1.0";
import { SHAPE_TYPES } from "./object-types.js?v=1.1.0";
import { showAlert } from "./ui-dialogs.js?v=1.1.0";

let _state = null;
let _overlay = null;

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
const round2 = (v) => Math.round(v * 100) / 100;

/* ----- 각도 회전 헬퍼 ----- */
const isLineLike = (o) => o.type === "line" || o.type === "circuit";
const hasAngle = (o) => typeof o.rotation === "number" || isLineLike(o) || SHAPE_TYPES.has(o.type);

function rotatePt(p, cx, cy, deg) {
  const r = (deg * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  const dx = p.x - cx, dy = p.y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}
function lineAngleDeg(o) {
  return Math.atan2(o.p2.y - o.p1.y, o.p2.x - o.p1.x) * 180 / Math.PI;
}
function rotateLineBy(o, deltaDeg) {
  const cx = (o.p1.x + o.p2.x) / 2, cy = (o.p1.y + o.p2.y) / 2;
  o.p1 = rotatePt(o.p1, cx, cy, deltaDeg);
  o.p2 = rotatePt(o.p2, cx, cy, deltaDeg);
}
function setAngleUni(o, deg) {
  if (isLineLike(o) && o.p1 && o.p2) {
    rotateLineBy(o, deg - lineAngleDeg(o)); // 절대각으로 통일
  } else if (typeof o.rotation === "number" || SHAPE_TYPES.has(o.type)) {
    o.rotation = deg % 360;
  }
}
function setAngleDelta(o, d) {
  if (isLineLike(o) && o.p1 && o.p2) {
    rotateLineBy(o, d);
  } else if (typeof o.rotation === "number" || SHAPE_TYPES.has(o.type)) {
    o.rotation = ((o.rotation || 0) + d) % 360;
  }
}

/* ----- 항목 정의 -----
 * type: "number"(양쪽 모드) | "font"(통일 전용) | "bool"(통일 전용)
 * uniformOnly: 통일 모드에서만 노출 */
const FIELDS = [
  {
    key: "strokeWidth", type: "number", label: "선 굵기", unit: "mm", step: 0.1, uniDefault: 0.2,
    has: (o) => typeof o.strokeWidth === "number",
    setUni: (o, v) => { o.strokeWidth = Math.max(0, v); },
    setDelta: (o, d) => { o.strokeWidth = Math.max(0, round2(o.strokeWidth + d)); },
  },
  {
    key: "strokeLevel", type: "number", label: "선 색(어둡기)", unit: "0~255", step: 5, uniDefault: 255,
    has: (o) => typeof o.strokeLevel === "number",
    setUni: (o, v) => { o.strokeLevel = clamp255(255 - v); },   // UI 어둡기 → 내부 level(반전)
    setDelta: (o, d) => { o.strokeLevel = clamp255(o.strokeLevel - d); },
  },
  {
    key: "fillLevel", type: "number", label: "면 색(어둡기)", unit: "0~255", step: 5, uniDefault: 0,
    has: (o) => typeof o.fillLevel === "number",
    setUni: (o, v) => { o.fillLevel = clamp255(255 - v); },
    setDelta: (o, d) => { o.fillLevel = clamp255(o.fillLevel - d); },
  },
  {
    key: "textSize", type: "number", label: "글씨 크기", unit: "pt", step: 1, uniDefault: 10,
    // formula도 fontSize로 글자 크기를 가지므로 함께 포함(기존엔 text만 반영됐음).
    has: (o) => o.type === "text" || o.type === "formula" || typeof o.labelSize === "number",
    setUni: (o, v) => {
      const mm = ptToMm(Math.max(MIN_TEXT_PT, v));
      if (o.type === "text" || o.type === "formula") o.fontSize = mm;
      if (typeof o.labelSize === "number") o.labelSize = mm;
    },
    setDelta: (o, d) => {
      const dmm = ptToMm(d) - ptToMm(0);
      const minMm = ptToMm(MIN_TEXT_PT);
      if ((o.type === "text" || o.type === "formula") && typeof o.fontSize === "number") o.fontSize = Math.max(minMm, o.fontSize + dmm);
      if (typeof o.labelSize === "number") o.labelSize = Math.max(minMm, o.labelSize + dmm);
    },
  },
  {
    key: "rotation", type: "number", label: "각도", unit: "°", step: 5, uniDefault: 0,
    has: hasAngle,
    setUni: setAngleUni,
    setDelta: setAngleDelta,
  },
  {
    key: "fontFamily", type: "font", label: "글씨체", uniformOnly: true,
    has: (o) => o.type === "text" || o.type === "formula",
    setUni: (o, css) => { o.fontFamily = css; },
  },
  {
    key: "positionLocked", type: "bool", label: "위치 고정", uniformOnly: true,
    has: () => true,
    setUni: (o, on) => { o.positionLocked = on; },
  },
  {
    key: "locked", type: "bool", label: "오브젝트 잠금", uniformOnly: true,
    has: () => true,
    setUni: (o, on) => { o.locked = on; },
  },
];

/* 잠긴 오브젝트에도 변경을 허용하는 '잠금 계열' 필드 */
const LOCK_KEYS = new Set(["locked", "positionLocked"]);

function targets() {
  const s = _state.get();
  const ids = s.selectedIds || [];
  const pool = ids.length
    ? ids.map((id) => s.objects.find((o) => o.id === id)).filter(Boolean)
    : s.objects;
  return { objs: pool, locked: pool.filter((o) => o.locked).length, scoped: ids.length > 0 };
}

const MODE_DESC = {
  uniform: "모든 오브젝트를 같은 수치로 통일합니다.",
  delta: "모든 오브젝트의 수치를 일정하게 변화시킵니다.",
};

function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="bulk-title"
         style="width:min(400px, calc(100vw - 32px))">
      <h2 class="modal-title" id="bulk-title">전체 통일/수정</h2>
      <div class="modal-field">
        <span class="modal-label">모드</span>
        <div class="seg" id="bulk-mode">
          <button type="button" class="seg-btn is-active" data-mode="uniform">전체 통일</button>
          <button type="button" class="seg-btn" data-mode="delta">전체 수정</button>
        </div>
      </div>
      <p class="objectify-description" id="bulk-mode-desc" style="margin:2px 0 8px;"></p>
      <p class="objectify-description" id="bulk-target" style="margin:0 0 8px;"></p>
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
const _rows = new Map(); // key -> { cb, read(), field }

function renderFields() {
  const host = _overlay.querySelector("#bulk-fields");
  host.innerHTML = "";
  _rows.clear();
  const fontOptions = TEXT_FONTS.map((f) =>
    `<option value="${f.css.replace(/"/g, "&quot;")}"${f.css === DEFAULT_TEXT_FONT ? " selected" : ""}>${f.label}</option>`
  ).join("");

  for (const f of FIELDS) {
    if (f.uniformOnly && _mode !== "uniform") continue; // 통일 전용 항목은 수정 모드에서 숨김

    const row = document.createElement("label");
    row.className = "modal-field modal-field-row";
    row.style.cssText = "display:flex;align-items:center;gap:8px;";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    const lbl = document.createElement("span");
    lbl.className = "modal-label";
    lbl.style.cssText = "flex:1 1 auto;margin:0;";
    lbl.textContent = f.label;
    row.appendChild(cb); row.appendChild(lbl);

    let read;
    if (f.type === "font") {
      const sel = document.createElement("select");
      sel.className = "modal-input";
      sel.style.cssText = "width:150px;flex:none;";
      sel.innerHTML = fontOptions;
      sel.addEventListener("change", () => { cb.checked = true; });
      row.appendChild(sel);
      read = () => sel.value;
    } else if (f.type === "bool") {
      const sel = document.createElement("select");
      sel.className = "modal-input";
      sel.style.cssText = "width:90px;flex:none;";
      sel.innerHTML = `<option value="on">켜기</option><option value="off">끄기</option>`;
      sel.addEventListener("change", () => { cb.checked = true; });
      row.appendChild(sel);
      read = () => sel.value === "on";
    } else {
      const input = document.createElement("input");
      input.type = "number";
      input.step = String(f.step);
      input.className = "modal-input";
      input.style.cssText = "width:90px;flex:none;";
      input.value = _mode === "uniform" ? String(f.uniDefault) : "0";
      input.addEventListener("input", () => { cb.checked = true; });
      const unit = document.createElement("span");
      unit.style.cssText = "flex:none;font-size: calc(11px * var(--text-scale, 1));color:var(--text-secondary);width:38px;";
      unit.textContent = _mode === "delta" ? `±${f.unit}` : f.unit;
      row.appendChild(input); row.appendChild(unit);
      read = () => Number(input.value);
    }
    host.appendChild(row);
    _rows.set(f.key, { cb, read, field: f });
  }
}

function syncTargetText() {
  const { objs, locked, scoped } = targets();
  const where = scoped ? `선택한 오브젝트 ${objs.length}개` : `캔버스 전체 ${objs.length}개`;
  const note = locked ? ` (잠긴 ${locked}개는 잠금 항목만 변경)` : "";
  _overlay.querySelector("#bulk-target").textContent = `대상: ${where}${note}`;
  _overlay.querySelector("#bulk-mode-desc").textContent = MODE_DESC[_mode];
}

function apply() {
  const picked = [];
  for (const [, r] of _rows) {
    if (!r.cb.checked) continue;
    if (r.field.type === "number") {
      const v = r.read();
      if (!isFinite(v)) continue;
      if (_mode === "delta" && v === 0) continue; // 변화 없음
    }
    picked.push({ field: r.field, value: r.read() });
  }
  if (!picked.length) { showAlert("적용할 항목을 체크하고 값을 입력하세요.", { title: "전체 통일/수정" }); return; }
  const { objs } = targets();
  if (!objs.length) { showAlert("적용할 오브젝트가 없습니다.", { title: "전체 통일/수정" }); return; }
  const idSet = new Set(objs.map((o) => o.id));
  _state.update((s2) => {
    s2.undoStack.push(JSON.parse(JSON.stringify(s2.objects)));
    s2.redoStack = [];
    for (const o of s2.objects) {
      if (!idSet.has(o.id)) continue;
      for (const { field, value } of picked) {
        // 잠긴 오브젝트는 잠금 계열 필드만 변경 허용(→ 전체 잠금 해제 가능)
        if (o.locked && !LOCK_KEYS.has(field.key)) continue;
        if (!field.has(o)) continue;
        if (_mode === "uniform") field.setUni(o, value);
        else if (field.setDelta) field.setDelta(o, value);
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
    syncTargetText();
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
    // 모달 내부로 포커스를 옮겨야 ESC 키가 오버레이 keydown 핸들러에 도달하고,
    // Delete가 뒤편 캔버스로 새지 않는다.
    (_overlay.querySelector("#bulk-apply") || _overlay.querySelector(".modal-input"))?.focus();
  });
}

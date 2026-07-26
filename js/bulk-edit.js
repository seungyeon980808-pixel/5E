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

import { ptToMm, MIN_TEXT_PT, TEXT_FONTS, DEFAULT_TEXT_FONT } from "./state.js?v=1.2.0";
import { SHAPE_TYPES } from "./object-types.js?v=1.2.0";
import { showAlert } from "./ui-dialogs.js?v=1.2.0";
import { getObjectBBox } from "./pick.js?v=1.2.0";
import { translateObject } from "./transform.js?v=1.2.0";

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

/* ----- 크기 헬퍼 -----
 * "크기"의 뜻이 타입마다 다르다: 상자 계열(사각형·이미지·입체·자…)은 폭·높이지만
 * 두 끝점 계열(선·회로·용수철·장 그림)은 길이다. 그래서 항목을 셋으로 나누고 각
 * 항목의 has()가 해당되는 타입에만 걸리게 한다.
 * lockAspect가 켜진 오브젝트(도르래·각도기 등)는 한 축만 바꾸면 찌그러지므로
 * 반대 축을 같은 비율로 따라가게 한다. */
const MIN_SIZE_MM = 0.5;

function setBoxW(o, w) {
  const v = Math.max(MIN_SIZE_MM, w);
  if (o.lockAspect && o.w > 0) o.h = Math.max(MIN_SIZE_MM, o.h * (v / o.w));
  o.w = v;
}
function setBoxH(o, h) {
  const v = Math.max(MIN_SIZE_MM, h);
  if (o.lockAspect && o.h > 0) o.w = Math.max(MIN_SIZE_MM, o.w * (v / o.h));
  o.h = v;
}
const lineLen = (o) => Math.hypot(o.p2.x - o.p1.x, o.p2.y - o.p1.y);
// 중점과 방향은 그대로 두고 길이만 바꾼다 — 한쪽 끝을 고정하면 여러 개를 통일했을 때
// 선들이 한쪽으로 쏠려 배치가 무너진다.
function setLineLen(o, len) {
  const want = Math.max(MIN_SIZE_MM, len);
  const cur = lineLen(o);
  const cx = (o.p1.x + o.p2.x) / 2, cy = (o.p1.y + o.p2.y) / 2;
  const ux = cur < 1e-9 ? 1 : (o.p2.x - o.p1.x) / cur;
  const uy = cur < 1e-9 ? 0 : (o.p2.y - o.p1.y) / cur;
  const h = want / 2;
  o.p1 = { x: cx - ux * h, y: cy - uy * h };
  o.p2 = { x: cx + ux * h, y: cy + uy * h };
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
    key: "boxW", type: "number", label: "폭", unit: "mm", step: 1, uniDefault: 20,
    has: (o) => typeof o.w === "number" && typeof o.h === "number",
    setUni: (o, v) => setBoxW(o, v),
    setDelta: (o, d) => setBoxW(o, o.w + d),
  },
  {
    key: "boxH", type: "number", label: "높이", unit: "mm", step: 1, uniDefault: 20,
    has: (o) => typeof o.w === "number" && typeof o.h === "number",
    setUni: (o, v) => setBoxH(o, v),
    setDelta: (o, d) => setBoxH(o, o.h + d),
  },
  {
    key: "lineLen", type: "number", label: "길이", unit: "mm", step: 1, uniDefault: 20,
    has: (o) => !!(o.p1 && o.p2),
    setUni: (o, v) => setLineLen(o, v),
    setDelta: (o, d) => setLineLen(o, lineLen(o) + d),
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
      <div id="bulk-spacing" style="border-top:1px solid var(--border);margin-top:8px;padding-top:8px;">
        <label class="modal-field modal-field-row" style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="bulk-gap-cb" />
          <span class="modal-label" style="flex:1 1 auto;margin:0;">간격</span>
          <select class="modal-input" id="bulk-gap-axis" style="width:74px;flex:none;">
            <option value="x">가로</option>
            <option value="y">세로</option>
            <option value="z">깊이</option>
          </select>
          <input type="number" class="modal-input" id="bulk-gap-val" step="1" value="4" style="width:64px;flex:none;" />
          <span style="flex:none;font-size:11px;color:var(--text-secondary);width:22px;">mm</span>
        </label>
        <p class="objectify-description" id="bulk-gap-desc" style="margin:2px 0 0;"></p>
      </div>
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
      unit.style.cssText = "flex:none;font-size: 11px;color:var(--text-secondary);width:38px;";
      unit.textContent = _mode === "delta" ? `±${f.unit}` : f.unit;
      row.appendChild(input); row.appendChild(unit);
      read = () => Number(input.value);
    }
    host.appendChild(row);
    _rows.set(f.key, { cb, read, field: f });
  }
}

/* ----- 간격 통일 -----
 * FIELDS(객체를 하나씩 고치는 표)와 달리 **선택 전체를 줄 세우는 집합 연산**이라
 * 따로 둔다. 모든 타입의 bbox로 계산하므로 타입 구분이 없다.
 *
 * 축이 셋인 이유: 입체 그림에서 상판 위에 놓인 물체는 가로뿐 아니라 **안쪽(깊이)**
 * 으로도 늘어선다(기출 p1_2026_06_05의 블록 B·C). 깊이 축은 입체의 투영각과 같은
 * 방향이라야 물체들이 같은 면 위에 있는 것처럼 보인다.
 * 간격은 bbox 사이의 빈 거리(edge-to-edge)다 — 중심 간 거리가 아니다. */
function depthAxisAngle(objs) {
  const s = objs.find((o) => o.type === "solid3d" && Number.isFinite(o.projAngle));
  if (s) return s.projAngle;
  try {
    const v = Number(JSON.parse(localStorage.getItem("phyDraw.defaults") || "{}").solid3dProjAngle);
    if (v > 0 && v < 90) return v;
  } catch (_) { /* 기본값으로 */ }
  return 50;
}

function axisUnit(axis, objs) {
  if (axis === "x") return { ux: 1, uy: 0 };
  if (axis === "y") return { ux: 0, uy: 1 };
  const a = (depthAxisAngle(objs) * Math.PI) / 180;
  return { ux: Math.cos(a), uy: -Math.sin(a) };   // 깊이 = 오른쪽 위로
}

function applySpacing(objs, axis, gap) {
  const movable = objs.filter((o) => !o.locked && !o.positionLocked);
  if (movable.length < 2) return 0;
  const { ux, uy } = axisUnit(axis, objs);
  const items = movable.map((o) => {
    const b = getObjectBBox(o);
    if (!b) return null;
    // bbox 네 꼭짓점을 축에 투영 → 그 축에서 차지하는 구간 [min, max]
    const ps = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]
      .map(([px, py]) => px * ux + py * uy);
    return { o, min: Math.min(...ps), max: Math.max(...ps) };
  }).filter(Boolean);
  if (items.length < 2) return 0;
  items.sort((a, b) => a.min - b.min);
  // 첫 번째는 그 자리에 두고 나머지를 차례로 밀어 붙인다(기준점이 움직이면 그림 전체가 밀린다).
  let cursor = items[0].max;
  let moved = 0;
  for (let i = 1; i < items.length; i++) {
    const it = items[i];
    const wantMin = cursor + gap;
    const shift = wantMin - it.min;
    if (Math.abs(shift) > 1e-6) { translateObject(it.o, shift * ux, shift * uy); moved += 1; }
    cursor = wantMin + (it.max - it.min);
  }
  return moved;
}

function syncTargetText() {
  const { objs, locked, scoped } = targets();
  const where = scoped ? `선택한 오브젝트 ${objs.length}개` : `캔버스 전체 ${objs.length}개`;
  const note = locked ? ` (잠긴 ${locked}개는 잠금 항목만 변경)` : "";
  _overlay.querySelector("#bulk-target").textContent = `대상: ${where}${note}`;
  _overlay.querySelector("#bulk-mode-desc").textContent = MODE_DESC[_mode];
  // 간격은 '통일' 개념 자체라 증감(전체 수정) 모드에서는 숨긴다.
  const gapBox = _overlay.querySelector("#bulk-spacing");
  gapBox.style.display = _mode === "uniform" ? "" : "none";
  const axis = _overlay.querySelector("#bulk-gap-axis").value;
  // "줄을 맞춘다"가 아니라 "간격만 고른다"이다 — 축과 직각인 방향은 건드리지 않는다.
  // (직각 방향까지 맞추면 사용자가 잡아둔 배치가 통째로 움직여 버린다)
  _overlay.querySelector("#bulk-gap-desc").textContent = axis === "z"
    ? `깊이(투영 ${depthAxisAngle(objs)}°) 방향 간격만 고릅니다. 맨 앞 오브젝트는 그대로 둡니다.`
    : "그 방향 간격만 고릅니다. 직각 방향 위치와 맨 앞 오브젝트는 그대로 둡니다.";
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
  // 간격은 FIELDS가 아니라 별도 집합 연산이라 따로 읽는다(통일 모드 전용).
  const gapCb = _overlay.querySelector("#bulk-gap-cb");
  const gapOn = _mode === "uniform" && gapCb && gapCb.checked;
  const gapVal = Number(_overlay.querySelector("#bulk-gap-val").value);
  const gapAxis = _overlay.querySelector("#bulk-gap-axis").value;
  if (gapOn && !isFinite(gapVal)) { showAlert("간격에 숫자를 입력하세요.", { title: "전체 통일/수정" }); return; }

  if (!picked.length && !gapOn) { showAlert("적용할 항목을 체크하고 값을 입력하세요.", { title: "전체 통일/수정" }); return; }
  const { objs } = targets();
  if (!objs.length) { showAlert("적용할 오브젝트가 없습니다.", { title: "전체 통일/수정" }); return; }
  if (gapOn && objs.length < 2) { showAlert("간격을 맞추려면 오브젝트가 2개 이상이어야 합니다.", { title: "전체 통일/수정" }); return; }
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
    // 간격은 크기 변경이 끝난 뒤에 잡아야 한다 — 폭을 통일하고 나면 bbox가 달라지므로
    // 순서를 바꾸면 간격이 어긋난다.
    if (gapOn) applySpacing(s2.objects.filter((o) => idSet.has(o.id)), gapAxis, gapVal);
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
  // 간격 값·축을 건드리면 체크박스를 자동으로 켠다(다른 항목과 같은 규칙).
  const gapCb = _overlay.querySelector("#bulk-gap-cb");
  _overlay.querySelector("#bulk-gap-val").addEventListener("input", () => { gapCb.checked = true; });
  _overlay.querySelector("#bulk-gap-axis").addEventListener("change", () => { gapCb.checked = true; syncTargetText(); });
  _overlay.querySelector("#bulk-cancel").addEventListener("click", () => { _overlay.hidden = true; });
  _overlay.addEventListener("mousedown", (e) => { if (e.target === _overlay) _overlay.hidden = true; });
  _overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); _overlay.hidden = true; }
  });
  _overlay.querySelector("#bulk-apply").addEventListener("click", apply);
  document.getElementById("bulk-edit-open")?.addEventListener("click", () => {
    _mode = "uniform";
    modeSeg.querySelectorAll(".seg-btn").forEach((b, i) => b.classList.toggle("is-active", i === 0));
    gapCb.checked = false;   // 열 때마다 간격은 꺼진 상태로 시작(실수로 배치가 밀리지 않게)
    renderFields();
    syncTargetText();
    _overlay.hidden = false;
    // 모달 내부로 포커스를 옮겨야 ESC 키가 오버레이 keydown 핸들러에 도달하고,
    // Delete가 뒤편 캔버스로 새지 않는다.
    (_overlay.querySelector("#bulk-apply") || _overlay.querySelector(".modal-input"))?.focus();
  });
}

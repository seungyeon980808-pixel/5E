/* ===== COORDPLANE / DETAIL MODAL: 좌표평면 상세 편집 =====
 *
 * 좌표평면은 설정 항목이 많아 인스펙터 대신 전용 모달에서 다룬다:
 *   - 좌: 형태·범위·눈금 간격·격자/눈금/축선/숫자라벨 토글·축 이름/원점 라벨·크기·내보내기
 *   - 우: 실시간 미리보기(실제 renderCoordplane) → WYSIWYG
 * 좌표평면을 더블클릭하거나 인스펙터 "상세 편집…" 버튼으로 연다.
 * 편집은 draft(깊은 복사)에 하고, 확인 시 실제 객체에 한 번에 반영(undo 1회). */

import { state } from "../state.js?v=0.52.0";
import { renderCoordplane } from "../render/coordplane.js?v=0.52.0";

const SVG_NS = "http://www.w3.org/2000/svg";
const VARIANTS = [["cross", "십자"], ["quadrant", "L자"], ["single", "직선"]];

let _overlay = null;
let _els = null;
let _planeId = null;
let _draft = null;

function findPlane(id) {
  return state.get().objects.find((o) => o && o.id === id && o.type === "coordplane") || null;
}

function fmt(v) { return (Math.round(v * 1000) / 1000).toString(); }

/* ----- 미리보기: draft를 박스 중앙에 채워 렌더 ----- */
function renderPreview() {
  const d = _draft;
  const svg = document.createElementNS(SVG_NS, "svg");
  // 회전은 미리보기에서 무시(설정 확인이 목적). 박스를 중앙 정렬해 채운다.
  const pad = Math.max(d.w, d.h) * 0.12;
  const vx = -d.w / 2 - pad, vy = -d.h / 2 - pad;
  const vw = d.w + pad * 2, vh = d.h + pad * 2;
  svg.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  // 렌더용 임시 평면(중앙 배치, 회전 0)
  const preview = { ...d, x: -d.w / 2, y: -d.h / 2, rotation: 0 };
  svg.appendChild(renderCoordplane(preview));
  _els.preview.replaceChildren(svg);
}

/* ----- 컨트롤 → draft 반영 헬퍼 ----- */
function set(prop, v) { _draft[prop] = v; renderPreview(); }

function numInput(prop, step) {
  const inp = document.createElement("input");
  inp.type = "number"; inp.step = step || "any"; inp.className = "modal-input";
  inp.style.cssText = "width:66px;";
  inp.addEventListener("input", () => {
    const v = Number(inp.value);
    if (Number.isFinite(v)) set(prop, v);
  });
  inp._prop = prop;
  return inp;
}

function textInput(prop) {
  const inp = document.createElement("input");
  inp.type = "text"; inp.className = "modal-input"; inp.autocomplete = "off"; inp.spellcheck = false;
  inp.style.cssText = "width:120px;font-family:monospace;";
  inp.addEventListener("input", () => set(prop, inp.value));
  inp._prop = prop;
  return inp;
}

function checkbox(prop, defaultTrue) {
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.addEventListener("change", () => { set(prop, cb.checked); syncVisibility(); });
  cb._prop = prop; cb._defaultTrue = defaultTrue;
  return cb;
}

function row(labelText, ...nodes) {
  const r = document.createElement("div");
  r.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:#c9d1d9;";
  const l = document.createElement("label");
  l.textContent = labelText;
  l.style.cssText = "flex:0 0 92px;color:#8b949e;";
  r.appendChild(l);
  nodes.forEach((n) => r.appendChild(n));
  return r;
}
function span(text) { const s = document.createElement("span"); s.textContent = text; s.style.color = "#8b949e"; return s; }

/* 숫자 라벨/축 이름 크기 행의 표시 여부를 토글 상태에 맞춘다. */
function syncVisibility() {
  _els.tickSizeRow.style.display = _draft.showTickLabels ? "" : "none";
  _els.nameSizeRow.style.display = (_draft.showAxisLabels !== false) ? "" : "none";
}

function syncControls() {
  const d = _draft;
  _els.variantBtns.forEach((b) => {
    const on = b._val === (d.axisVariant || "cross");
    b.style.background = on ? "#0d2847" : "#1e1f22";
    b.style.borderColor = on ? "#0969da" : "#3a3c41";
  });
  const setV = (inp) => { if (inp && document.activeElement !== inp) inp.value = d[inp._prop] ?? ""; };
  _els.inputs.forEach(setV);
  _els.checks.forEach((cb) => { cb.checked = cb._defaultTrue ? d[cb._prop] !== false : d[cb._prop] === true; });
  syncVisibility();
}

function build() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "coordplane-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="좌표평면 상세 편집" style="width:780px;max-width:96vw;">
      <h2 class="modal-title">좌표평면 상세 편집</h2>
      <div style="display:flex;gap:18px;align-items:flex-start;">
        <div id="cp-controls" style="flex:0 0 360px;"></div>
        <div style="flex:1;min-width:0;">
          <div class="modal-label" style="margin-bottom:4px;">미리보기</div>
          <div id="cp-preview" style="width:100%;height:360px;border:1px solid #30363d;border-radius:4px;background:#fff;overflow:hidden;"></div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="modal-btn" id="cp-cancel">취소</button>
        <button type="button" class="modal-btn modal-btn-primary" id="cp-confirm">확인</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const controls = overlay.querySelector("#cp-controls");
  const preview = overlay.querySelector("#cp-preview");
  const inputs = [];
  const checks = [];

  // 형태
  const variantBtns = [];
  const variantWrap = document.createElement("div");
  variantWrap.style.cssText = "display:flex;gap:4px;";
  VARIANTS.forEach(([val, text]) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = text; b._val = val;
    b.style.cssText = "font-size:12px;border:1px solid #3a3c41;border-radius:3px;padding:3px 10px;background:#1e1f22;color:#dcddde;cursor:pointer;";
    b.addEventListener("click", () => { set("axisVariant", val); syncControls(); });
    variantBtns.push(b); variantWrap.appendChild(b);
  });
  controls.appendChild(row("형태", variantWrap));

  // 범위
  const xMin = numInput("xMin"), xMax = numInput("xMax"), yMin = numInput("yMin"), yMax = numInput("yMax");
  const gsx = numInput("gridStepX"), gsy = numInput("gridStepY");
  inputs.push(xMin, xMax, yMin, yMax, gsx, gsy);
  controls.appendChild(row("x 범위", xMin, span("~"), xMax));
  controls.appendChild(row("y 범위", yMin, span("~"), yMax));
  controls.appendChild(row("눈금 간격", gsx, span("·"), gsy));

  // 토글
  const cAxis = checkbox("showAxisLines", true), cGrid = checkbox("showGrid", false),
    cTicks = checkbox("showTicks", true), cNums = checkbox("showTickLabels", false);
  checks.push(cAxis, cGrid, cTicks, cNums);
  const toggleWrap = document.createElement("div");
  toggleWrap.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;";
  [["축선", cAxis], ["격자", cGrid], ["눈금", cTicks], ["숫자 라벨", cNums]].forEach(([t, cb]) => {
    const l = document.createElement("label");
    l.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
    l.append(cb, document.createTextNode(t));
    toggleWrap.appendChild(l);
  });
  controls.appendChild(row("표시", toggleWrap));

  // 숫자 크기 (숫자 라벨 on일 때만)
  const tickSize = numInput("tickLabelSize", "0.1"); inputs.push(tickSize);
  const tickSizeRow = row("숫자 크기", tickSize, span("mm"));
  controls.appendChild(tickSizeRow);

  // 축 이름/원점 라벨 (수식 LaTeX 입력 가능: v_0, \theta 등)
  const labelX = textInput("labelX"), labelY = textInput("labelY"), labelOrigin = textInput("labelOrigin");
  inputs.push(labelX, labelY, labelOrigin);
  controls.appendChild(row("x축 이름", labelX));
  controls.appendChild(row("y축 이름", labelY));
  const cAxisNames = checkbox("showAxisLabels", true); checks.push(cAxisNames);
  const cOrigin = checkbox("showOrigin", true); checks.push(cOrigin);
  const originWrap = document.createElement("div");
  originWrap.style.cssText = "display:flex;align-items:center;gap:6px;";
  originWrap.append(cOrigin, labelOrigin);
  controls.appendChild(row("원점 라벨", originWrap));
  const nameSize = numInput("axisLabelSize", "0.1"); inputs.push(nameSize);
  const nameSizeRow = row("이름 크기", cAxisNames, span("표시"), nameSize, span("mm"));
  controls.appendChild(nameSizeRow);

  // 내보내기
  const cExport = checkbox("exportable", true); checks.push(cExport);
  const exportLabel = document.createElement("label");
  exportLabel.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
  exportLabel.append(cExport, document.createTextNode("포함"));
  controls.appendChild(row("내보내기", exportLabel));

  const hint = document.createElement("div");
  hint.style.cssText = "font-size:11px;color:#8b949e;line-height:1.6;margin-top:4px;";
  hint.innerHTML = "· 라벨은 LaTeX 문법 지원(<code>v_0</code>, <code>\\theta</code>).<br>· 원점 라벨을 비우면 원점 글자가 숨겨집니다.";
  controls.appendChild(hint);

  _els = {
    preview, inputs, checks, variantBtns, tickSizeRow, nameSizeRow,
  };

  overlay.querySelector("#cp-confirm").addEventListener("click", commit);
  overlay.querySelector("#cp-cancel").addEventListener("click", hide);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) hide(); });
  overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); hide(); } });
  return overlay;
}

function hide() { if (_overlay) _overlay.hidden = true; }

const DRAFT_FIELDS = [
  "axisVariant", "xMin", "xMax", "yMin", "yMax", "gridStepX", "gridStepY",
  "showAxisLines", "showGrid", "showTicks", "showTickLabels", "tickLabelSize",
  "labelX", "labelY", "labelOrigin", "showAxisLabels", "axisLabelSize",
  "showOrigin", "exportable",
];

function commit() {
  state.update((st) => {
    const o = st.objects.find((x) => x.id === _planeId && x.type === "coordplane");
    if (!o) return;
    const snap = JSON.parse(JSON.stringify(st.objects));
    let changed = false;
    for (const k of DRAFT_FIELDS) {
      if (_draft[k] !== undefined && o[k] !== _draft[k]) { o[k] = _draft[k]; changed = true; }
    }
    if (!changed) return;
    st.undoStack.push(snap);
    st.redoStack = [];
  });
  hide();
}

/* ----- PUBLIC: open the 상세 편집 modal for a coordplane ----- */
export function openPlaneModal(planeId) {
  const o = findPlane(planeId);
  if (!o) return;
  _planeId = planeId;
  _draft = JSON.parse(JSON.stringify(o));
  if (_draft.labelOrigin === undefined) _draft.labelOrigin = "O";
  if (!_overlay) _overlay = build();
  syncControls();
  renderPreview();
  _overlay.hidden = false;
}

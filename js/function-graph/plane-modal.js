/* ===== COORDPLANE / DETAIL MODAL: 좌표평면 상세 편집 =====
 *
 * 좌표평면은 설정 항목이 많아 인스펙터 대신 전용 모달에서 다룬다:
 *   - 좌: 형태·범위·눈금 간격·격자/눈금/축선/숫자라벨 토글·축 이름/원점 라벨·크기·내보내기
 *   - 우: 실시간 미리보기(실제 renderCoordplane) → WYSIWYG
 * 좌표평면을 더블클릭하거나 인스펙터 "상세 편집…" 버튼으로 연다.
 * 편집은 draft(깊은 복사)에 하고, 확인 시 실제 객체에 한 번에 반영(undo 1회). */

import { state } from "../state.js?v=1.7.0-four-session-integration";
import { renderCoordplane } from "../render/coordplane.js?v=1.7.0-four-session-integration";
import { sampleFunctionPoints } from "./sampler.js?v=1.7.0-four-session-integration";
import { openGraphModal } from "../graph/graph-modal.js?v=1.7.0-four-session-integration";
import { worldFromMath, mathFromWorld, planeAsY2, originWorld, logRangeValid } from "./coords.js?v=1.7.0-four-session-integration";

import { buildRegionGeometry } from "../graph/graph-features.js?v=1.7.0-four-session-integration";

const SVG_NS = "http://www.w3.org/2000/svg";
const VARIANTS = [["cross", "십자"], ["quadrant", "L자"], ["single", "직선"], ["box", "박스"]];

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
  const error = scaleError(d);
  _els.error.textContent = error;
  if (error) return;
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
function scaleError(d) {
  for (const axis of ['x', 'y']) if (d[`${axis}Scale`] === 'log' && !logRangeValid(d[`${axis}Min`], d[`${axis}Max`])) return `${axis} 로그축 범위는 0보다 크고 최댓값이 최솟값보다 커야 합니다.`;
  if (d.y2?.enabled && d.y2.scale === 'log' && !logRangeValid(d.y2.y2Min, d.y2.y2Max)) return '오른쪽 로그축 범위는 0보다 크고 최댓값이 최솟값보다 커야 합니다.';
  return '';
}

function numInput(prop, step) {
  const inp = document.createElement("input");
  inp.type = "number"; inp.step = step || "any"; inp.className = "modal-input";
  inp.style.cssText = "width:66px;";
  inp.addEventListener("input", () => {
    // 빈 칸일 때 Number("")===0(유한값)이라 그대로 커밋하면, 지우자마자 draft가 0으로
    // 바뀌어 확인을 누르면 0(또는 [0,0] 붕괴)이 실제 평면에 저장된다 — 새 값을 입력하기
    // 전까지는(빈 칸인 동안) draft를 건드리지 않는다(modal.js의 parseFloat NaN 가드와 동일 의도).
    if (inp.value.trim() === "") return;
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
  r.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size: 12px;color:#c9d1d9;";
  const l = document.createElement("label");
  l.textContent = labelText;
  l.style.cssText = "flex:0 0 92px;color:var(--text-secondary);";
  r.appendChild(l);
  nodes.forEach((n) => r.appendChild(n));
  return r;
}
function span(text) { const s = document.createElement("span"); s.textContent = text; s.style.color = "var(--text-secondary)"; return s; }

/* 숫자 라벨/축 이름 크기 행의 표시 여부를 토글 상태에 맞춘다. */
function syncVisibility() {
  _els.tickSizeRow.style.display = _draft.showTickLabels ? "" : "none";
  _els.nameSizeRow.style.display = (_draft.showAxisLabels !== false) ? "" : "none";
}

function syncControls() {
  const d = _draft;
  _els.variantBtns.forEach((b) => {
    const on = b._val === (d.axisVariant || "cross");
    b.style.background = on ? "color-mix(in srgb, var(--accent) 22%, var(--bg-input))" : "var(--bg-input)";
    b.style.borderColor = on ? "var(--accent)" : "var(--border)";
  });
  const setV = (inp) => { if (inp && document.activeElement !== inp) inp.value = d[inp._prop] ?? ""; };
  _els.inputs.forEach(setV);
  _els.scales.forEach(inp => { inp.value = inp._axis === 'y2' ? d.y2?.scale || 'linear' : d[`${inp._axis}Scale`] || 'linear'; });
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
    b.style.cssText = "font-size: 12px;border:1px solid var(--border);border-radius:3px;padding:3px 10px;background:var(--bg-input);color:var(--text-primary);cursor:pointer;";
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
  const scales = ['x', 'y', 'y2'].map(axis => {
    const select = document.createElement('select'); select.className = 'modal-input'; select._axis = axis;
    select.setAttribute('aria-label', `${axis} 축 척도`);
    select.innerHTML = '<option value="linear">선형</option><option value="log">로그 (10)</option>';
    select.addEventListener('change', () => {
      if (axis === 'y2') _draft.y2 = { ..._draft.y2, scale: select.value };
      else _draft[`${axis}Scale`] = select.value;
      renderPreview();
    });
    controls.appendChild(row(`${axis} 축 척도`, select));
    return select;
  });

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
  hint.style.cssText = "font-size: 11px;color:var(--text-secondary);line-height:1.6;margin-top:4px;";
  hint.innerHTML = "· 라벨은 LaTeX 문법 지원(<code>v_0</code>, <code>\\theta</code>).<br>· 원점 라벨을 비우면 원점 글자가 숨겨집니다.";
  controls.appendChild(hint);

  const error = document.createElement('div'); error.id = 'cp-error'; error.setAttribute('role', 'alert'); error.style.color = '#e66'; controls.appendChild(error);
  _els = {
    error, scales, preview, inputs, checks, variantBtns, tickSizeRow, nameSizeRow,
  };

  overlay.querySelector("#cp-confirm").addEventListener("click", commit);
  overlay.querySelector("#cp-cancel").addEventListener("click", hide);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) hide(); });
  overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); hide(); } });
  return overlay;
}

function hide() { if (_overlay) _overlay.hidden = true; }

const DRAFT_FIELDS = [
  "xScale", "yScale", "y2", "axisVariant", "xMin", "xMax", "yMin", "yMax", "gridStepX", "gridStepY",
  "showAxisLines", "showGrid", "showTicks", "showTickLabels", "tickLabelSize",
  "labelX", "labelY", "labelOrigin", "showAxisLabels", "axisLabelSize",
  "showOrigin", "exportable",
];

function commit() {
  const error = scaleError(_draft);
  if (error) { _els.error.textContent = error; return; }
  let rejected = false;
  state.update((st) => {
    const o = st.objects.find((x) => x.id === _planeId && x.type === "coordplane");
    if (!o) return;
    const snap = JSON.parse(JSON.stringify(st.objects));
    const oldPlane = structuredClone(o);
    let changed = false;
    let rangeChanged = false;
    const RANGE_KEYS = new Set(["xMin", "xMax", "yMin", "yMax", "xScale", "yScale", "y2"]);
    for (const k of DRAFT_FIELDS) {
      if (_draft[k] !== undefined && JSON.stringify(o[k]) !== JSON.stringify(_draft[k])) {
        // labelOrigin 특별 처리: openPlaneModal이 표시용으로 _draft.labelOrigin에
        // 기본값 "O"를 주입했을 뿐인데(원본은 undefined), 이 차이 때문에 아무 것도
        // 안 건드리고 확인만 눌러도 changed=true → undo 스냅샷이 쌓였다. 원본이
        // undefined이고 draft가 그 주입 기본값 그대로면 실질적으로 변경 없음으로 취급.
        if (k === "labelOrigin" && o[k] === undefined && _draft[k] === "O") continue;
        if (RANGE_KEYS.has(k)) rangeChanged = true;
        o[k] = _draft[k]; changed = true;
      }
    }
    if (!changed) return;
    // 평면 범위가 바뀌면 이 평면에 속한 함수그래프의 baked 좌표가 옛 눈금 기준이라
    // 어긋난다 → 새 평면 기준으로 재샘플링한다(정의역은 새 x범위로 클램프).
    if (rangeChanged) {
      for (const fg of st.objects) {
        if (fg.type !== "funcgraph" || fg.planeId !== o.id || fg.sourceKind === "region") continue;
        if (fg.expr) {
          // 옛 정의역이 새 x범위와 겹치지 않으면(dMin>=dMax로 붕괴) sampler가 빈 결과를
          // 돌려주고 조용히 건너뛰어 옛 눈금 기준 points가 새 축 위에 그대로 남아 어긋났다
          // — 겹치지 않으면 평면 전체 범위로 되돌려 최소한 곡선이 새 축과 맞게 만든다.
          let dMin = Math.max(o.xMin, Math.min(fg.domainMin, fg.domainMax));
          let dMax = Math.min(o.xMax, Math.max(fg.domainMin, fg.domainMax));
          if (!(dMin < dMax)) { dMin = o.xMin; dMax = o.xMax; }
          const samplingPlane = fg.axis === 'y2' && o.y2?.enabled ? planeAsY2(o) : o;
          const yRange = Number.isFinite(fg.rangeMin) && Number.isFinite(fg.rangeMax) ? { min: fg.rangeMin, max: fg.rangeMax } : null;
          const { points, breaks } = sampleFunctionPoints(fg.expr, dMin, dMax, samplingPlane, { yRange });
          if (points && points.length >= 2) {
            fg.points = points.map(p => {
              const m = mathFromWorld(samplingPlane, p.x, p.y);
              return worldFromMath(samplingPlane, m.x + (fg.offset?.dx || 0), m.y + (fg.offset?.dy || 0));
            });
            // breaks도 새 points 길이에 맞춰 함께 갱신 — 안 하면 옛 인덱스가 새 배열을
            // 엉뚱한 자리에서 끊어(렌더러가 배열이면 그대로 신뢰) 점근선이 잘못 끊긴다.
            fg.breaks = breaks || [];
            fg.domainMin = dMin; fg.domainMax = dMax;
          } else { rejected = true; break; }
        } else if (Array.isArray(fg.mathPoints) && fg.mathPoints.length) {
          // 손그림/점찍기 계열(sourceKind:'points')은 수식이 없어 재샘플이 안 되지만,
          // 원본 수학좌표(mathPoints)를 새 평면 매핑으로 다시 투영하면 된다.
          fg.points = fg.mathPoints.map((m) => worldFromMath(o, m.x, m.y));
        }
        const before = fg.axis === 'y2' && oldPlane.y2?.enabled ? planeAsY2(oldPlane) : oldPlane;
        const after = fg.axis === 'y2' && o.y2?.enabled ? planeAsY2(o) : o;
        const remap = p => { const m = mathFromWorld(before, p.x, p.y); return { ...p, ...worldFromMath(after, m.x, m.y) }; };
        if (fg.axis === 'y2' && Array.isArray(fg.mathPoints)) fg.points = fg.mathPoints.map(m => worldFromMath(after, m.x, m.y));
        if (fg.markers) fg.markers = fg.markers.map(remap);
        // Projection guides ending on the old zero axis attach to the new
        // boundary when zero is not defined on a logarithmic axis.
        const remapGuide = p => {
          const m = mathFromWorld(before, p.x, p.y);
          if (after.xScale === 'log' && Math.abs(m.x) < 1e-10) m.x = after.xMin;
          if (after.yScale === 'log' && Math.abs(m.y) < 1e-10) m.y = after.yMin;
          return { ...p, ...worldFromMath(after, m.x, m.y) };
        };
        if (fg.guideSegs) fg.guideSegs = fg.guideSegs.map(seg => seg.map(remapGuide));
        if (fg.arrowPolys) fg.arrowPolys = fg.arrowPolys.map(ap => ({ ...ap, points: ap.points.map(remap) }));
        if (fg.arrowMarks) fg.arrowMarks = fg.arrowMarks.map(a => { const p = remap(a), q = remap({ x: a.x + a.dx, y: a.y + a.dy }); return { ...p, dx: q.x - p.x, dy: q.y - p.y }; });
        if (fg.handles) fg.handles = fg.handles.map(h => { const a = remap({ x: h.inX, y: h.inY }), b = remap({ x: h.outX, y: h.outY }); return { inX: a.x, inY: a.y, outX: b.x, outY: b.y }; });
        if (fg.area) { fg.area.baseY = originWorld(after).y; if (Number.isFinite(fg.area.from)) fg.area.worldFrom = worldFromMath(after, fg.area.from, 0).x; if (Number.isFinite(fg.area.to)) fg.area.worldTo = worldFromMath(after, fg.area.to, 0).x; }
      }
    }
    if (rangeChanged && !rejected) {
      const dependentSeries = st.objects.filter(fg => fg.type === 'funcgraph' && fg.planeId === o.id && fg.sourceKind !== 'region');
      for (const region of st.objects.filter(fg => fg.type === 'funcgraph' && fg.planeId === o.id && fg.sourceKind === 'region')) {
        const geometry = buildRegionGeometry(region.regionSpec, o, dependentSeries);
        if (!geometry.ok) { rejected = true; break; }
        region.mathPoints = geometry.mathPoints;
        region.points = geometry.points;
      }
    }
    const finiteGeometry = value => {
      if (typeof value === 'number') return Number.isFinite(value);
      if (Array.isArray(value)) return value.every(finiteGeometry);
      if (value && typeof value === 'object') return Object.values(value).every(finiteGeometry);
      return true;
    };
    if (rejected || st.objects.some(fg => fg.type === 'funcgraph' && fg.planeId === o.id &&
      ['points', 'handles', 'markers', 'guideSegs', 'arrowPolys', 'arrowMarks', 'area'].some(k => !finiteGeometry(fg[k])))) {
      st.objects = snap; rejected = true; return;
    }
    st.undoStack.push(snap);
    st.redoStack = [];
  });
  if (rejected) { _els.error.textContent = '새 축 범위에 표시할 수 없는 점이나 곡선이 있습니다. 데이터와 범위를 확인해 주세요.'; return; }
  hide();
}

/* ----- PUBLIC: open the 상세 편집 modal for a coordplane ----- */
export function openPlaneModal(planeId) {
  const o = findPlane(planeId);
  if (!o) return;
  if (o.reconstruction?.preserveAxes) { openGraphModal(planeId); return; }
  _planeId = planeId;
  _draft = JSON.parse(JSON.stringify(o));
  if (_draft.labelOrigin === undefined) _draft.labelOrigin = "O";
  if (!_overlay) _overlay = build();
  syncControls();
  renderPreview();
  _overlay.hidden = false;
  // 연 직후 포커스가 오버레이 밖(예: 방금 클릭한 평면 아이콘)에 남아 있으면 overlay의
  // keydown 리스너까지 Escape가 전달되지 않아 모달이 안 닫혔다 — 첫 입력칸에 포커스를
  // 줘서 이후 키 입력이 모달 안에서 잡히게 한다(가장 간단한 해결).
  if (_els.inputs[0]) _els.inputs[0].focus();
}

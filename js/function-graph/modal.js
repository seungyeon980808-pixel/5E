/* ===== FUNCTION-GRAPH / MODAL: 함수 입력 dialog (다중 함수) =====
 *
 * 한 세션에서 여러 함수를 한 좌표평면에 추가한다:
 *   - 상단 함수 목록(칩): 추가/삭제/선택. 선택된 함수를 아래 컨트롤이 편집.
 *   - 선택 함수: y= 수식 + 도우미 버튼, 선 굵기, 선 종류(실선/점선/파선), 정의역.
 *   - 큰 실시간 미리보기(실제 renderCoordplane + renderFuncgraph): 모든 함수 표시,
 *     선택 함수는 파랑으로 강조. 정의역 드래그 핸들은 선택 함수에 적용.
 * 확인 = insertFunctionGraphs로 모든 함수를 한 평면에 한 번에 커밋(undo 1회). */

import { state } from "../state.js?v=0.54.8";
import { renderCoordplane, renderFuncgraph } from "../render/coordplane.js?v=0.54.8";
import { makeDefaultCoordplane } from "./defaults.js?v=0.54.8";
import { sampleFunctionPoints } from "./sampler.js?v=0.54.8";
import { insertFunctionGraphs } from "./insert.js?v=0.54.8";
import { worldXFromMathX, mathXFromWorldX } from "./coords.js?v=0.54.8";

const SVG_NS = "http://www.w3.org/2000/svg";

// [button label, text inserted at the cursor]
const HELPERS = [
  ["sin", "sin("], ["cos", "cos("], ["tan", "tan("], ["log", "log("], ["ln", "ln("],
  ["√", "sqrt("], ["exp", "exp("], ["xⁿ", "^"], ["π", "pi"], ["x", "x"],
  ["(", "("], [")", ")"], ["+", "+"], ["−", "-"], ["×", "*"], ["÷", "/"],
];

// [label, dashLength, dashGap] — 회색조 프로젝트라 색 대신 선 종류로 함수를 구분.
// 점선 간격 0.4→1.0: 종전엔 촘촘해서 실선처럼 보였음(점선답게 띄움).
const LINE_STYLES = [["실선", 0, 0], ["점선", 0.5, 1.0], ["파선", 1.4, 0.6]];

let _overlay = null;
let _els = null;
let _plane = null;                 // the preview plane (also the sample plane)
let _svgEl = null;                 // current preview <svg> (for screen↔math mapping)
let _funcs = [];                   // [{ expr, domain:{min,max}, strokeWidth, styleIdx }]
let _sel = 0;

/* ----- the coordplane the graph will land on: selected one, else null (→ new). ----- */
function targetPlane() {
  const s = state.get();
  const sel = (s.selectedIds || [])[0];
  const o = sel ? s.objects.find((it) => it.id === sel) : null;
  return o && o.type === "coordplane" ? o : null;
}

// A draft plane sized to the preview box, inheriting range/form/grid from the
// target plane when one is selected (so the preview matches where it will land).
function buildPreviewPlane() {
  const draft = makeDefaultCoordplane({ x: 0, y: 0 });
  const t = targetPlane();
  if (t) {
    for (const k of ["xMin", "xMax", "yMin", "yMax", "gridStepX", "gridStepY",
      "showAxisLines", "showGrid", "showTicks", "showTickLabels", "axisVariant",
      "labelX", "labelY", "w", "h", "lockAspect"]) {
      if (t[k] !== undefined) draft[k] = t[k];
    }
    draft.x = -draft.w / 2;
    draft.y = -draft.h / 2;
  }
  return draft;
}

function fmt(v) { return (Math.round(v * 100) / 100).toString(); }
function cur() { return _funcs[_sel] || null; }
function newFunc() {
  return { expr: "", domain: { min: _plane.xMin, max: _plane.xMax }, strokeWidth: 0.3, styleIdx: 0 };
}

/* ----- 함수 목록 칩 ----- */
function renderChips() {
  const host = _els.chipHost;
  host.replaceChildren();
  _funcs.forEach((f, i) => {
    const chip = document.createElement("button");
    chip.type = "button";
    const on = i === _sel;
    chip.style.cssText = "display:inline-flex;align-items:center;gap:6px;font:12px monospace;" +
      "border:1px solid " + (on ? "var(--accent)" : "var(--border)") + ";border-radius:4px;padding:3px 8px;" +
      "background:" + (on ? "color-mix(in srgb, var(--accent) 22%, var(--bg-input))" : "var(--bg-input)") + ";color:var(--text-primary);cursor:pointer;max-width:180px;";
    const lbl = document.createElement("span");
    lbl.textContent = "y=" + (f.expr.trim() || "…");
    lbl.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    chip.appendChild(lbl);
    chip.addEventListener("click", () => { _sel = i; syncControls(); renderPreview(); _els.input.focus(); });
    if (_funcs.length > 1) {
      const x = document.createElement("span");
      x.textContent = "×";
      x.style.cssText = "color:#e5534b;font-weight:700;flex:0 0 auto;";
      x.addEventListener("click", (e) => {
        e.stopPropagation();
        _funcs.splice(i, 1);
        if (_sel >= _funcs.length) _sel = _funcs.length - 1;
        syncControls(); renderPreview();
      });
      chip.appendChild(x);
    }
    host.appendChild(chip);
  });
  const add = document.createElement("button");
  add.type = "button";
  add.textContent = "+ 함수 추가";
  add.style.cssText = "font-size:12px;border:1px dashed var(--border);border-radius:4px;padding:3px 10px;" +
    "background:transparent;color:var(--text-secondary);cursor:pointer;";
  add.addEventListener("click", () => {
    _funcs.push(newFunc());
    _sel = _funcs.length - 1;
    syncControls(); renderPreview();
    _els.input.focus();
  });
  host.appendChild(add);
}

/* ----- 선택 함수 → 컨트롤 값 동기화 ----- */
function syncControls() {
  const f = cur();
  if (!f) return;
  _els.input.value = f.expr;
  _els.widthInput.value = f.strokeWidth;
  [..._els.styleHost.children].forEach((b, i) => {
    const on = i === f.styleIdx;
    b.style.background = on ? "color-mix(in srgb, var(--accent) 22%, var(--bg-input))" : "var(--bg-input)";
    b.style.borderColor = on ? "var(--accent)" : "var(--border)";
  });
  _els.domainMin.value = fmt(f.domain.min);
  _els.domainMax.value = fmt(f.domain.max);
  renderChips();
}

function renderPreview() {
  const { previewHost, errorEl, confirmBtn, domainEl } = _els;
  const plane = _plane;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `${plane.x} ${plane.y} ${plane.w} ${plane.h}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.appendChild(renderCoordplane(plane));

  let selError = "";
  _funcs.forEach((f, i) => {
    const expr = f.expr.trim();
    if (!expr) return;
    const { points, error } = sampleFunctionPoints(expr, f.domain.min, f.domain.max, plane);
    if (error) { if (i === _sel) selError = error; return; }
    if (points.length < 2) { if (i === _sel) selError = "정의역 안에 그릴 점이 없습니다"; return; }
    const [, dl, dg] = LINE_STYLES[f.styleIdx] || LINE_STYLES[0];
    const el = renderFuncgraph({ points, strokeLevel: 0, strokeWidth: f.strokeWidth, dashLength: dl, dashGap: dg });
    if (i === _sel) el.querySelectorAll("path,polyline,polygon").forEach((p) => { p.style.stroke = "var(--accent)"; });
    svg.appendChild(el);
  });

  // ----- 선택 함수 정의역 음영 + 드래그 핸들 -----
  const f = cur();
  if (f) {
    const wMin = worldXFromMathX(plane, f.domain.min);
    const wMax = worldXFromMathX(plane, f.domain.max);
    const addRect = (x, w) => {
      if (w <= 0) return;
      const r = document.createElementNS(SVG_NS, "rect");
      r.setAttribute("x", x); r.setAttribute("y", plane.y);
      r.setAttribute("width", w); r.setAttribute("height", plane.h);
      r.setAttribute("fill", "rgba(90,100,120,0.16)");
      svg.appendChild(r);
    };
    addRect(plane.x, wMin - plane.x);
    addRect(wMax, plane.x + plane.w - wMax);
    const addHandle = (wx, which) => {
      const vis = document.createElementNS(SVG_NS, "line");
      vis.setAttribute("x1", wx); vis.setAttribute("y1", plane.y);
      vis.setAttribute("x2", wx); vis.setAttribute("y2", plane.y + plane.h);
      vis.style.stroke = "var(--accent)"; vis.setAttribute("stroke-width", 0.7);
      svg.appendChild(vis);
      const hit = document.createElementNS(SVG_NS, "line");
      hit.setAttribute("x1", wx); hit.setAttribute("y1", plane.y);
      hit.setAttribute("x2", wx); hit.setAttribute("y2", plane.y + plane.h);
      hit.setAttribute("stroke", "transparent"); hit.setAttribute("stroke-width", 4);
      hit.style.cursor = "ew-resize";
      hit.addEventListener("mousedown", (e) => startDrag(which, e));
      svg.appendChild(hit);
    };
    addHandle(wMin, "min");
    addHandle(wMax, "max");
  }

  previewHost.replaceChildren(svg);
  _svgEl = svg;

  domainEl.textContent = f ? `정의역 [${fmt(f.domain.min)}, ${fmt(f.domain.max)}]` : "";
  errorEl.textContent = selError;
  const hasAny = _funcs.some((ff) => ff.expr.trim());
  confirmBtn.disabled = !hasAny;
  confirmBtn.style.opacity = hasAny ? "" : "0.5";
}

function clientXToMathX(clientX) {
  if (!_svgEl || !_svgEl.getScreenCTM) return null;
  const ctm = _svgEl.getScreenCTM();
  if (!ctm) return null;
  const pt = _svgEl.createSVGPoint();
  pt.x = clientX; pt.y = 0;
  const world = pt.matrixTransform(ctm.inverse());
  return mathXFromWorldX(_plane, world.x);
}

function startDrag(which, e) {
  e.preventDefault();
  const f = cur();
  if (!f) return;
  const onMove = (ev) => {
    const mx = clientXToMathX(ev.clientX);
    if (mx == null) return;
    const v = Math.max(_plane.xMin, Math.min(_plane.xMax, mx));
    const gap = (_plane.xMax - _plane.xMin) * 0.02;
    if (which === "min") f.domain.min = Math.min(v, f.domain.max - gap);
    else f.domain.max = Math.max(v, f.domain.min + gap);
    _els.domainMin.value = fmt(f.domain.min);
    _els.domainMax.value = fmt(f.domain.max);
    renderPreview();
  };
  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function insertAtCursor(input, text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const caret = start + text.length;
  input.setSelectionRange(caret, caret);
  input.focus();
}

function hide() { if (_overlay) _overlay.hidden = true; }

function commit() {
  const funcs = _funcs
    .filter((f) => f.expr.trim())
    .map((f) => {
      const [, dl, dg] = LINE_STYLES[f.styleIdx] || LINE_STYLES[0];
      return { expr: f.expr.trim(), domain: { ...f.domain }, strokeWidth: f.strokeWidth, dashLength: dl, dashGap: dg };
    });
  if (!funcs.length) return;
  const res = insertFunctionGraphs(state, funcs);
  if (!res.ok) { _els.errorEl.textContent = res.error; return; }
  hide();
}

function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "funcgraph-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="함수 입력" style="width:820px;max-width:96vw;">
      <h2 class="modal-title">함수 입력</h2>
      <div id="fg-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;"></div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
        <span class="modal-label" style="white-space:nowrap;">y =</span>
        <input type="text" id="fg-expr" class="modal-input" autocomplete="off"
               spellcheck="false" placeholder="예: sin(5x), x^2-3x+1, log(x)"
               style="flex:1;font-family:monospace;" />
      </div>
      <div id="fg-helpers" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;"></div>
      <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;margin-bottom:10px;font-size:12px;color:var(--text-secondary);">
        <label style="display:flex;align-items:center;gap:6px;">선 굵기
          <input type="number" id="fg-width" min="0.1" max="2" step="0.1" style="width:60px;" class="modal-input" />
        </label>
        <span style="display:flex;align-items:center;gap:6px;">선 종류 <span id="fg-styles" style="display:inline-flex;gap:4px;"></span></span>
        <label style="display:flex;align-items:center;gap:6px;">정의역
          <input type="number" id="fg-dmin" step="0.5" style="width:64px;" class="modal-input" /> ~
          <input type="number" id="fg-dmax" step="0.5" style="width:64px;" class="modal-input" />
        </label>
      </div>
      <div style="display:flex;gap:16px;align-items:flex-start;">
        <div style="flex:0 0 auto;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
            <span class="modal-label">미리보기</span>
            <span id="fg-domain" style="color:var(--text-secondary);font-size:12px;"></span>
          </div>
          <div id="fg-preview" style="width:420px;height:420px;border:1px solid #30363d;border-radius:4px;background:#fff;overflow:hidden;"></div>
        </div>
        <div style="flex:1;min-width:0;">
          <div id="fg-error" style="color:#e5534b;font-size:12px;min-height:16px;"></div>
          <div style="margin-top:8px;color:var(--text-secondary);font-size:12px;line-height:1.7;">
            · <b style="color:var(--accent);">＋ 함수 추가</b>로 여러 함수를 한 평면에.<br>
            · 함수별로 선 굵기·종류·정의역을 따로 정할 수 있어요.<br>
            · 미리보기의 <b style="color:var(--accent);">세로 핸들</b>을 드래그해 선택 함수의 범위를 정하세요.<br>
            · 각도는 라디안. <code>5x</code>는 <code>5*x</code>로 자동 인식.<br>
            · 함수는 괄호 필요: <code>sin(5x)</code> (○), <code>sin5x</code> (×).
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="modal-btn" id="fg-cancel">취소</button>
        <button type="button" class="modal-btn modal-btn-primary" id="fg-confirm">확인</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector("#fg-expr");
  const helperHost = overlay.querySelector("#fg-helpers");
  const errorEl = overlay.querySelector("#fg-error");
  const previewHost = overlay.querySelector("#fg-preview");
  const confirmBtn = overlay.querySelector("#fg-confirm");
  const cancelBtn = overlay.querySelector("#fg-cancel");
  const domainEl = overlay.querySelector("#fg-domain");
  const chipHost = overlay.querySelector("#fg-chips");
  const widthInput = overlay.querySelector("#fg-width");
  const styleHost = overlay.querySelector("#fg-styles");
  const domainMin = overlay.querySelector("#fg-dmin");
  const domainMax = overlay.querySelector("#fg-dmax");
  _els = { input, errorEl, previewHost, confirmBtn, domainEl, chipHost, widthInput, styleHost, domainMin, domainMax };

  HELPERS.forEach(([label, text]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = "font-size:12px;font-family:monospace;border:1px solid var(--border);border-radius:3px;padding:3px 9px;background:var(--bg-input);color:var(--text-primary);cursor:pointer;";
    b.addEventListener("click", () => {
      insertAtCursor(input, text);
      if (cur()) cur().expr = input.value;
      renderPreview(); renderChips();
    });
    helperHost.appendChild(b);
  });

  LINE_STYLES.forEach(([label], i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = "font-size:12px;border:1px solid var(--border);border-radius:3px;padding:3px 9px;background:var(--bg-input);color:var(--text-primary);cursor:pointer;";
    b.addEventListener("click", () => { if (cur()) { cur().styleIdx = i; syncControls(); renderPreview(); } });
    styleHost.appendChild(b);
  });

  input.addEventListener("input", () => { if (cur()) cur().expr = input.value; renderPreview(); renderChips(); });
  widthInput.addEventListener("input", () => {
    const v = parseFloat(widthInput.value);
    if (cur() && Number.isFinite(v)) { cur().strokeWidth = Math.max(0.1, Math.min(2, v)); renderPreview(); }
  });
  const readDomain = () => {
    const f = cur(); if (!f) return;
    const lo = parseFloat(domainMin.value), hi = parseFloat(domainMax.value);
    if (Number.isFinite(lo)) f.domain.min = Math.max(_plane.xMin, Math.min(lo, _plane.xMax));
    if (Number.isFinite(hi)) f.domain.max = Math.max(_plane.xMin, Math.min(hi, _plane.xMax));
    if (f.domain.min > f.domain.max) { const t = f.domain.min; f.domain.min = f.domain.max; f.domain.max = t; }
    renderPreview();
  };
  domainMin.addEventListener("change", readDomain);
  domainMax.addEventListener("change", readDomain);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !confirmBtn.disabled) { e.preventDefault(); commit(); }
    else if (e.key === "Escape") { e.preventDefault(); hide(); }
  });
  confirmBtn.addEventListener("click", commit);
  cancelBtn.addEventListener("click", hide);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) hide(); });
  overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hide(); } });
  return overlay;
}

/* ----- PUBLIC: open the 함수 입력 modal ----- */
export function openFunctionModal() {
  if (!_overlay) _overlay = buildModal();
  _plane = buildPreviewPlane();
  _funcs = [{ expr: "sin(x)", domain: { min: _plane.xMin, max: _plane.xMax }, strokeWidth: 0.3, styleIdx: 0 }];
  _sel = 0;
  _overlay.hidden = false;
  syncControls();
  renderPreview();
  _els.input.focus();
  _els.input.select();
}

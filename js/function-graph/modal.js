/* ===== FUNCTION-GRAPH / MODAL: 함수 입력 dialog (기획서 §10-④) =====
 *
 * A proper 함수 입력 modal (replaces the interim prompt):
 *   - y= formula input + function helper buttons (with implicit multiplication, so
 *     sin(5x) works).
 *   - a LARGE live SVG preview drawn with the REAL renderers (renderCoordplane +
 *     renderFuncgraph) → WYSIWYG.
 *   - 정의역 드래그: two blue handles on the preview set where the curve is
 *     generated([domainMin, domainMax]); the excluded region is shaded.
 * Confirm commits through insertFunctionGraph with the dragged domain. Built once,
 * lazily, appended to <body>; reuses the shared .modal-overlay CSS. */

import { state } from "../state.js?v=0.48.4";
import { renderCoordplane, renderFuncgraph } from "../render/coordplane.js?v=0.48.4";
import { makeDefaultCoordplane } from "./defaults.js?v=0.48.4";
import { sampleFunctionPoints } from "./sampler.js?v=0.48.4";
import { insertFunctionGraph } from "./insert.js?v=0.48.4";
import { worldXFromMathX, mathXFromWorldX } from "./coords.js?v=0.48.4";

const SVG_NS = "http://www.w3.org/2000/svg";

// [button label, text inserted at the cursor]
const HELPERS = [
  ["sin", "sin("], ["cos", "cos("], ["tan", "tan("], ["log", "log("], ["ln", "ln("],
  ["√", "sqrt("], ["exp", "exp("], ["xⁿ", "^"], ["π", "pi"], ["x", "x"],
  ["(", "("], [")", ")"], ["+", "+"], ["−", "-"], ["×", "*"], ["÷", "/"],
];

let _overlay = null;
let _els = null;
let _plane = null;                 // the preview plane (also the sample plane)
let _svgEl = null;                 // current preview <svg> (for screen↔math mapping)
let _domain = { min: -5, max: 5 }; // dragged generation range (math x)

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
  const draft = makeDefaultCoordplane({ x: 0, y: 0 }); // centered → x,y = -w/2,-h/2
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

function renderPreview() {
  const { previewHost, errorEl, confirmBtn, input, domainEl } = _els;
  const expr = input.value.trim();
  const plane = _plane;

  const { points, error } = expr
    ? sampleFunctionPoints(expr, _domain.min, _domain.max, plane)
    : { points: [], error: null };

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `${plane.x} ${plane.y} ${plane.w} ${plane.h}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  svg.appendChild(renderCoordplane(plane));
  if (!error && points.length >= 2) {
    svg.appendChild(renderFuncgraph({ points, strokeLevel: 0, strokeWidth: 0.5, dashLength: 0, dashGap: 0 }));
  }

  // ----- domain shading + drag handles -----
  const wMin = worldXFromMathX(plane, _domain.min);
  const wMax = worldXFromMathX(plane, _domain.max);
  const addRect = (x, w) => {
    if (w <= 0) return;
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", x); r.setAttribute("y", plane.y);
    r.setAttribute("width", w); r.setAttribute("height", plane.h);
    r.setAttribute("fill", "rgba(90,100,120,0.20)");
    svg.appendChild(r);
  };
  addRect(plane.x, wMin - plane.x);                 // shade left of domainMin
  addRect(wMax, plane.x + plane.w - wMax);          // shade right of domainMax

  const addHandle = (wx, which) => {
    const vis = document.createElementNS(SVG_NS, "line");
    vis.setAttribute("x1", wx); vis.setAttribute("y1", plane.y);
    vis.setAttribute("x2", wx); vis.setAttribute("y2", plane.y + plane.h);
    vis.setAttribute("stroke", "#0969da"); vis.setAttribute("stroke-width", 0.7);
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

  previewHost.replaceChildren(svg);
  _svgEl = svg;

  domainEl.textContent = `정의역 [${fmt(_domain.min)}, ${fmt(_domain.max)}]`;
  const bad = !expr || !!error || points.length < 2;
  errorEl.textContent = expr && error ? error : "";
  confirmBtn.disabled = bad;
  confirmBtn.style.opacity = bad ? "0.5" : "";
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
  const onMove = (ev) => {
    const mx = clientXToMathX(ev.clientX);
    if (mx == null) return;
    const v = Math.max(_plane.xMin, Math.min(_plane.xMax, mx));
    const gap = (_plane.xMax - _plane.xMin) * 0.02; // keep the two handles apart
    if (which === "min") _domain.min = Math.min(v, _domain.max - gap);
    else _domain.max = Math.max(v, _domain.min + gap);
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
  const expr = _els.input.value.trim();
  if (!expr) return;
  const res = insertFunctionGraph(state, expr, { min: _domain.min, max: _domain.max });
  if (!res.ok) { _els.errorEl.textContent = res.error; return; }
  hide();
}

function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "funcgraph-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="함수 입력" style="width:760px;max-width:96vw;">
      <h2 class="modal-title">함수 입력</h2>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
        <span class="modal-label" style="white-space:nowrap;">y =</span>
        <input type="text" id="fg-expr" class="modal-input" value="sin(x)" autocomplete="off"
               spellcheck="false" placeholder="예: sin(5x), x^2-3x+1, log(x)"
               style="flex:1;font-family:monospace;" />
      </div>
      <div id="fg-helpers" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;"></div>
      <div style="display:flex;gap:16px;align-items:flex-start;">
        <div style="flex:0 0 auto;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
            <span class="modal-label">미리보기</span>
            <span id="fg-domain" style="color:#8b949e;font-size:12px;"></span>
          </div>
          <div id="fg-preview" style="width:420px;height:420px;border:1px solid #30363d;border-radius:4px;background:#fff;overflow:hidden;"></div>
        </div>
        <div style="flex:1;min-width:0;">
          <div id="fg-error" style="color:#e5534b;font-size:12px;min-height:16px;"></div>
          <div style="margin-top:8px;color:#8b949e;font-size:12px;line-height:1.7;">
            · 미리보기의 <b style="color:#0969da;">파란 세로 핸들</b>을 좌우로 드래그해<br>&nbsp;&nbsp;그릴 범위(정의역)를 정하세요.<br>
            · 각도는 라디안. <code>5x</code>는 <code>5*x</code>로 자동 인식.<br>
            · 함수는 괄호 필요: <code>sin(5x)</code> (○), <code>sin5x</code> (×).<br>
            · 함수: sin cos tan asin·acos·atan sinh·cosh·tanh<br>&nbsp;&nbsp;log(상용) ln exp sqrt abs floor ceil round sign,<br>&nbsp;&nbsp;상수 pi e.
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
  _els = { input, errorEl, previewHost, confirmBtn, domainEl };

  HELPERS.forEach(([label, text]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = "font-size:12px;font-family:monospace;border:1px solid #3a3c41;border-radius:3px;padding:3px 9px;background:#1e1f22;color:#dcddde;cursor:pointer;";
    b.addEventListener("click", () => { insertAtCursor(input, text); renderPreview(); });
    helperHost.appendChild(b);
  });

  input.addEventListener("input", renderPreview);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !confirmBtn.disabled) { e.preventDefault(); commit(); }
    else if (e.key === "Escape") { e.preventDefault(); hide(); }
  });
  confirmBtn.addEventListener("click", commit);
  cancelBtn.addEventListener("click", hide);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) hide(); });
  return overlay;
}

/* ----- PUBLIC: open the 함수 입력 modal ----- */
export function openFunctionModal() {
  if (!_overlay) _overlay = buildModal();
  _plane = buildPreviewPlane();
  _domain = { min: _plane.xMin, max: _plane.xMax }; // reset generation range on open
  _overlay.hidden = false;
  renderPreview();
  _els.input.focus();
  _els.input.select();
}

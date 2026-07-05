/* ===== FUNCTION-GRAPH / MODAL: 함수 입력 dialog (기획서 §10-④) =====
 *
 * Replaces the interim prompt(): a proper 2-column modal — LEFT: formula input +
 * function helper buttons + inline error; RIGHT: a live SVG preview drawn with the
 * REAL renderers (renderCoordplane + renderFuncgraph) so 미리보기 = 결과물(WYSIWYG).
 * Confirm commits through insertFunctionGraph (same path the prompt used). Built
 * once, lazily, and appended to <body>; reuses the shared .modal-overlay CSS. */

import { state } from "../state.js?v=0.47.0";
import { renderCoordplane, renderFuncgraph } from "../render/coordplane.js?v=0.47.0";
import { makeDefaultCoordplane } from "./defaults.js?v=0.47.0";
import { sampleFunctionPoints } from "./sampler.js?v=0.47.0";
import { insertFunctionGraph } from "./insert.js?v=0.47.0";

const SVG_NS = "http://www.w3.org/2000/svg";

// [button label, text inserted at the cursor]
const HELPERS = [
  ["sin", "sin("], ["cos", "cos("], ["tan", "tan("], ["log", "log("], ["ln", "ln("],
  ["√", "sqrt("], ["exp", "exp("], ["xⁿ", "^"], ["π", "pi"], ["x", "x"],
  ["(", "("], [")", ")"], ["+", "+"], ["−", "-"], ["×", "*"], ["÷", "/"],
];

let _overlay = null;
let _els = null;

/* ----- the target plane the graph will land on: the selected coordplane, else a
 * fresh default. The preview uses this plane's RANGE/FORM so it matches exactly. */
function targetPlane() {
  const s = state.get();
  const sel = (s.selectedIds || [])[0];
  const o = sel ? s.objects.find((it) => it.id === sel) : null;
  return o && o.type === "coordplane" ? o : null;
}

// A draft plane sized to the preview box (0,0,60,48), inheriting range/form/grid
// from the target plane when one is selected.
function previewPlane() {
  const draft = makeDefaultCoordplane({ x: 30, y: 24 }); // → x:0 y:0 w:60 h:48
  const t = targetPlane();
  if (t) {
    for (const k of ["xMin", "xMax", "yMin", "yMax", "gridStepX", "gridStepY",
      "showAxisLines", "showGrid", "showTicks", "showTickLabels", "axisVariant",
      "labelX", "labelY"]) {
      if (t[k] !== undefined) draft[k] = t[k];
    }
  }
  return draft;
}

function renderPreview() {
  const { previewHost, errorEl, confirmBtn, input } = _els;
  const expr = input.value.trim();
  const plane = previewPlane();
  const { points, error } = expr
    ? sampleFunctionPoints(expr, plane.xMin, plane.xMax, plane)
    : { points: [], error: null };

  previewHost.innerHTML = "";
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `${plane.x} ${plane.y} ${plane.w} ${plane.h}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.appendChild(renderCoordplane(plane));
  if (!error && points.length >= 2) {
    svg.appendChild(renderFuncgraph({ points, strokeLevel: 0, strokeWidth: 0.4, dashLength: 0, dashGap: 0 }));
  }
  previewHost.appendChild(svg);

  const bad = !expr || !!error || points.length < 2;
  errorEl.textContent = expr && error ? error : "";
  confirmBtn.disabled = bad;
  confirmBtn.style.opacity = bad ? "0.5" : "";
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
  const res = insertFunctionGraph(state, expr);
  if (!res.ok) { _els.errorEl.textContent = res.error; return; }
  hide();
}

function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "funcgraph-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="함수 입력" style="width:600px;max-width:94vw;">
      <h2 class="modal-title">함수 입력</h2>
      <div style="display:flex;gap:16px;align-items:flex-start;">
        <div style="flex:1;min-width:0;">
          <label class="modal-field" style="align-items:center;">
            <span class="modal-label" style="white-space:nowrap;">y =</span>
            <input type="text" id="fg-expr" class="modal-input" value="sin(x)"
                   autocomplete="off" spellcheck="false"
                   placeholder="예: sin(x), x^2-3*x+1, log(x)" style="font-family:monospace;" />
          </label>
          <div id="fg-helpers" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:10px;"></div>
          <div id="fg-error" style="margin-top:10px;color:#e5534b;font-size:12px;min-height:16px;"></div>
          <div style="margin-top:2px;color:#8b949e;font-size:11px;">각도는 라디안. 함수: sin cos tan asin..atan sinh.. log(상용) ln exp sqrt abs floor ceil round sign, 상수 pi e.</div>
        </div>
        <div style="flex:0 0 210px;">
          <span class="modal-label" style="display:block;margin-bottom:4px;">미리보기</span>
          <div id="fg-preview" style="width:210px;height:168px;border:1px solid #30363d;border-radius:4px;background:#fff;overflow:hidden;"></div>
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
  _els = { input, errorEl, previewHost, confirmBtn };

  HELPERS.forEach(([label, text]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = "font-size:12px;font-family:monospace;border:1px solid #3a3c41;border-radius:3px;padding:3px 8px;background:#1e1f22;color:#dcddde;cursor:pointer;";
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
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) hide(); }); // click backdrop
  return overlay;
}

/* ----- PUBLIC: open the 함수 입력 modal ----- */
export function openFunctionModal() {
  if (!_overlay) _overlay = buildModal();
  _overlay.hidden = false;
  renderPreview();
  _els.input.focus();
  _els.input.select();
}

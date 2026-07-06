/* ===== EXPORT DIALOG (파일 dropdown + image-export modal) ===== */
//
// Owns two pieces of top-bar UI, both kept out of index.html so markup stays
// minimal (mirrors project-io.js's dynamically-created file input):
//
//   1. "파일 ▾" dropdown — opens on click, closes on outside-click / Escape.
//      Its items are: 프로젝트 저장 / 프로젝트 불러오기 (both wired in
//      project-io.js by id), a divider, and 이미지로 내보내기 (opens the modal).
//
//   2. Export modal — filename + format (PNG/SVG) + resolution (DPI, PNG only),
//      with 취소 / 내보내기. On 내보내기 it delegates to svg-export.js's
//      exportPng() or exportSvg(); the extension is appended from the format.

import { exportPng, exportSvg, formatExportTimestamp } from "./svg-export.js?v=0.52.0";
import { registerTopMenu } from "./top-menu.js?v=0.52.0";
import { screenToWorld } from "./viewport.js?v=0.52.0";
import { openExamPreview } from "./exam-preview.js?v=0.52.0";

// Default export filename base = local date/time to the minute (YYYYMMDD_HHmm),
// recomputed each time the modal opens so it reflects the actual export time.
const defaultNameBase = () => formatExportTimestamp();

/* ----- dropdown: exclusive with 설정 (shared top-menu) + hover descriptions ----- */
const DEFAULT_FILE_DESC = "파일 작업을 선택하세요.";
function initFileMenu() {
  const btn = document.getElementById("file-menu-btn");
  const list = document.getElementById("file-menu-list");
  const desc = document.getElementById("file-menu-desc");
  if (!btn || !list) return;

  // Bottom description area: reflect the hovered / keyboard-focused item; fall
  // back to the default prompt when nothing is hovered or focused.
  const reset = () => { if (desc) desc.textContent = DEFAULT_FILE_DESC; };
  if (desc) {
    list.querySelectorAll(".file-menu-item").forEach((item) => {
      const text = item.getAttribute("data-desc");
      const show = () => { if (text) desc.textContent = text; };
      item.addEventListener("mouseenter", show);
      item.addEventListener("focus", show);
      item.addEventListener("mouseleave", reset);
      item.addEventListener("blur", reset);
    });
  }

  // Reset the description each time the menu opens (nothing hovered yet).
  registerTopMenu("file", btn, list, { onOpen: reset });
}

/* ----- modal markup, built once and appended to <body> ----- */
function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "export-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="export-title" style="width:min(400px, calc(100vw - 32px))">
      <h2 class="modal-title" id="export-title">이미지로 내보내기</h2>

      <label class="modal-field" for="export-filename">
        <span class="modal-label">파일 이름</span>
        <input type="text" id="export-filename" class="modal-input"
               value="${defaultNameBase()}" autocomplete="off" spellcheck="false" />
      </label>

      <div class="modal-field">
        <span class="modal-label">형식</span>
        <div class="seg" id="export-format">
          <button type="button" class="seg-btn is-active" data-format="png">PNG</button>
          <button type="button" class="seg-btn" data-format="svg">SVG</button>
        </div>
      </div>

      <div class="modal-field" id="export-dpi-field">
        <span class="modal-label">해상도</span>
        <div class="seg" id="export-dpi">
          <button type="button" class="seg-btn" data-dpi="200">200 dpi</button>
          <button type="button" class="seg-btn is-active" data-dpi="300">300 dpi</button>
          <button type="button" class="seg-btn" data-dpi="400">400 dpi</button>
        </div>
      </div>

      <label class="modal-field modal-field-row" for="export-include-reference-images">
        <input type="checkbox" id="export-include-reference-images" checked />
        <span class="modal-label">배경/참고 이미지 포함</span>
      </label>

      <div class="modal-actions">
        <button type="button" class="modal-btn" id="export-cancel">취소</button>
        <button type="button" class="modal-btn" id="export-preview">미리보기</button>
        <button type="button" class="modal-btn" id="export-area">영역 지정</button>
        <button type="button" class="modal-btn modal-btn-primary" id="export-confirm">내보내기</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

/* ----- segmented control: single active button, returns chosen value ----- */
function wireSegment(group, attr, onChange) {
  group.addEventListener("click", (e) => {
    const target = e.target.closest(".seg-btn");
    if (!target) return;
    group.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("is-active"));
    target.classList.add("is-active");
    if (onChange) onChange(target.getAttribute(attr));
  });
}
function segValue(group, attr) {
  const active = group.querySelector(".seg-btn.is-active");
  return active ? active.getAttribute(attr) : null;
}

/* ----- selected-area capture: 그리기 → 크기 조절 → Enter 확정 -----
 * 화면을 어둡게 덮고 사용자가 사각형을 그린다. 마우스업 후에도 바로 끝나지 않고,
 * 8개 핸들로 크기를 조절하거나 본체를 끌어 이동할 수 있으며 드래그·조절 내내 실제
 * 크기(mm)가 실시간 표시된다. Enter로 확정(화면 사각형 → world 좌표 → onDone(bounds)),
 * Esc/우클릭으로 취소(onDone(null)). world 1단위=1mm이므로 라벨은 mm.
 * 미리보기·영역지정(export) 둘 다 이 한 함수를 쓴다. */
function runAreaCapture(svg, state, onDone, hintText) {
  const overlay = document.createElement("div");
  overlay.className = "capture-overlay";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:9000;cursor:crosshair;" +
    "background:rgba(0,0,0,0.35);user-select:none;";

  const HINT_DRAW = hintText || "저장할 영역을 드래그하십시오";
  const HINT_ADJUST = "핸들로 크기 조절 · 드래그로 이동 · Enter 확정 · Esc 취소";
  const hint = document.createElement("div");
  hint.textContent = HINT_DRAW;
  hint.style.cssText =
    "position:absolute;top:18px;left:50%;transform:translateX(-50%);z-index:2;" +
    "padding:6px 14px;border-radius:4px;background:rgba(20,20,22,0.92);white-space:nowrap;" +
    "color:#fff;font-size:13px;font-weight:500;pointer-events:none;" +
    "box-shadow:0 1px 6px rgba(0,0,0,0.4);";
  overlay.appendChild(hint);

  const rect = document.createElement("div");
  rect.style.cssText =
    "position:absolute;border:1.5px solid #4aa3ff;background:rgba(74,163,255,0.18);" +
    "display:none;box-sizing:border-box;";
  overlay.appendChild(rect);

  // 실제 크기(mm) 라벨 — 클릭해 숫자를 직접 입력할 수 있다: 가로 입력 → Tab → 세로,
  // Enter로 확정. 입력을 위해 pointer-events를 켠다(overlay onDown은 이 영역 클릭을 통과시킴).
  const dim = document.createElement("div");
  dim.dataset.dim = "1";
  dim.style.cssText =
    "position:absolute;display:none;z-index:3;padding:2px 6px;border-radius:3px;cursor:text;" +
    "background:#1f6feb;color:#fff;font-size:12px;font-weight:600;" +
    "white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.4);";
  const INP =
    "width:46px;text-align:right;font:inherit;color:#fff;border:0;border-radius:3px;" +
    "background:rgba(255,255,255,0.18);padding:1px 4px;outline:none;";
  const wInput = document.createElement("input");
  wInput.type = "text"; wInput.inputMode = "decimal"; wInput.style.cssText = INP;
  const hInput = document.createElement("input");
  hInput.type = "text"; hInput.inputMode = "decimal"; hInput.style.cssText = INP;
  const sepX = document.createElement("span"); sepX.textContent = " × "; sepX.style.pointerEvents = "none";
  const sepU = document.createElement("span"); sepU.textContent = " mm"; sepU.style.pointerEvents = "none";
  dim.append(wInput, sepX, hInput, sepU);
  overlay.appendChild(dim);
  [wInput, hInput].forEach((inp) => {
    inp.addEventListener("focus", () => { inp.select(); inp.style.background = "rgba(255,255,255,0.40)"; });
    inp.addEventListener("blur", () => { inp.style.background = "rgba(255,255,255,0.18)"; });
  });
  wInput.addEventListener("input", () => applyTypedSize("w"));
  hInput.addEventListener("input", () => applyTypedSize("h"));
  // 라벨의 숫자 아닌 부분(× / mm / 여백)을 눌러도 가로 입력으로 포커스.
  dim.addEventListener("mousedown", (e) => {
    if (e.target === dim || e.target === sepX || e.target === sepU) { e.preventDefault(); wInput.focus(); }
  });

  // 8개 리사이즈 핸들: [id, x비율, y비율] (0=좌/상, .5=중앙, 1=우/하).
  const HANDLES = [
    ["nw", 0, 0], ["n", 0.5, 0], ["ne", 1, 0],
    ["w", 0, 0.5],               ["e", 1, 0.5],
    ["sw", 0, 1], ["s", 0.5, 1], ["se", 1, 1],
  ];
  const CURSORS = { nw: "nwse-resize", ne: "nesw-resize", se: "nwse-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };
  const handleEls = {};
  for (const [id] of HANDLES) {
    const h = document.createElement("div");
    h.dataset.h = id;
    h.style.cssText =
      "position:absolute;width:11px;height:11px;margin:-6px 0 0 -6px;display:none;z-index:4;" +
      "background:#fff;border:1.5px solid #1f6feb;border-radius:2px;box-sizing:border-box;cursor:" + CURSORS[id] + ";";
    overlay.appendChild(h);
    handleEls[id] = h;
  }

  document.body.appendChild(overlay);

  let box = null;      // { l, t, r, b } client px (그리는 중엔 비정규화 가능)
  let phase = "draw";  // "draw" | "adjust"
  let mode = null;     // null | "draw" | "move" | "resize"
  let dragH = null;    // 리사이즈 중 핸들 id
  let anchor = null;   // move 시작 스냅샷

  function normBox() {
    if (!box) return;
    if (box.l > box.r) { const t = box.l; box.l = box.r; box.r = t; }
    if (box.t > box.b) { const t = box.t; box.t = box.b; box.b = t; }
  }
  function worldSize() {
    const vb = state.get().viewBox;
    const w1 = screenToWorld(svg, vb, box.l, box.t);
    const w2 = screenToWorld(svg, vb, box.r, box.b);
    return { w: Math.abs(w2.x - w1.x), h: Math.abs(w2.y - w1.y) };
  }
  // 화면 px ↔ world(mm) 배율(현재 줌). 타이핑한 mm를 박스 화면 크기로 되돌릴 때 쓴다.
  function screenPerMm() {
    const vb = state.get().viewBox;
    const a = screenToWorld(svg, vb, 0, 0);
    const b = screenToWorld(svg, vb, 200, 200);
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
    return { x: dx > 1e-6 ? 200 / dx : 1, y: dy > 1e-6 ? 200 / dy : 1 };
  }
  // 입력한 mm로 박스 크기를 맞춘다(좌상단 고정). 입력 중인 필드는 render가 덮어쓰지 않음.
  function applyTypedSize(which) {
    if (!box) return;
    const val = parseFloat((which === "w" ? wInput.value : hInput.value).trim());
    if (!isFinite(val) || val <= 0) return;
    normBox();
    const s = screenPerMm();
    if (which === "w") box.r = box.l + val * s.x;
    else box.b = box.t + val * s.y;
    render();
  }
  function render() {
    if (!box) {
      rect.style.display = "none"; dim.style.display = "none";
      for (const id in handleEls) handleEls[id].style.display = "none";
      return;
    }
    const l = Math.min(box.l, box.r), t = Math.min(box.t, box.b);
    const w = Math.abs(box.r - box.l), h = Math.abs(box.b - box.t);
    rect.style.display = "block";
    rect.style.left = l + "px"; rect.style.top = t + "px";
    rect.style.width = w + "px"; rect.style.height = h + "px";
    rect.style.cursor = phase === "adjust" ? "move" : "crosshair";
    rect.style.pointerEvents = phase === "adjust" ? "auto" : "none";
    const showH = phase === "adjust";
    for (const [id, ex, ey] of HANDLES) {
      const el = handleEls[id];
      el.style.display = showH ? "block" : "none";
      if (showH) { el.style.left = (l + ex * w) + "px"; el.style.top = (t + ey * h) + "px"; }
    }
    const ws = worldSize();
    if (document.activeElement !== wInput) wInput.value = ws.w.toFixed(1);
    if (document.activeElement !== hInput) hInput.value = ws.h.toFixed(1);
    dim.style.display = "block";
    let dy = t - 26; if (dy < 4) dy = t + 4;
    dim.style.left = l + "px"; dim.style.top = dy + "px";
  }

  function cleanup() {
    overlay.removeEventListener("mousedown", onDown);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    window.removeEventListener("keydown", onKey, true);
    overlay.removeEventListener("contextmenu", onCtx);
    overlay.remove();
  }
  function finish(bounds) { cleanup(); onDone(bounds); }
  function cancel() { finish(null); }
  function confirm() {
    if (!box) return;
    normBox();
    if ((box.r - box.l) < 4 || (box.b - box.t) < 4) return; // 너무 작으면 무시
    const vb = state.get().viewBox;
    const w1 = screenToWorld(svg, vb, box.l, box.t);
    const w2 = screenToWorld(svg, vb, box.r, box.b);
    finish({
      x: Math.min(w1.x, w2.x), y: Math.min(w1.y, w2.y),
      w: Math.abs(w2.x - w1.x), h: Math.abs(w2.y - w1.y),
    });
  }

  function onDown(e) {
    if (e.button !== 0) return; // 좌클릭만; 우클릭은 onCtx로 취소
    if (e.target && e.target.closest && e.target.closest("[data-dim]")) return; // 숫자 입력 클릭 → 포커스만
    e.preventDefault();
    const hEl = e.target && e.target.closest ? e.target.closest("[data-h]") : null;
    if (phase === "adjust" && hEl) {                 // 핸들 → 리사이즈
      mode = "resize"; dragH = hEl.dataset.h;
    } else if (phase === "adjust" && e.target === rect) { // 본체 → 이동
      mode = "move";
      anchor = { x: e.clientX, y: e.clientY, l: box.l, t: box.t, r: box.r, b: box.b };
    } else {                                          // 빈 곳 → 새로 그리기
      mode = "draw"; phase = "draw"; hint.textContent = HINT_DRAW;
      box = { l: e.clientX, t: e.clientY, r: e.clientX, b: e.clientY };
    }
    render();
  }
  function onMove(e) {
    if (!mode) return;
    if (mode === "draw") {
      box.r = e.clientX; box.b = e.clientY;
    } else if (mode === "move") {
      const dx = e.clientX - anchor.x, dy = e.clientY - anchor.y;
      box.l = anchor.l + dx; box.r = anchor.r + dx;
      box.t = anchor.t + dy; box.b = anchor.b + dy;
    } else if (mode === "resize") {
      const id = dragH;
      if (id.includes("w")) box.l = e.clientX;
      if (id.includes("e")) box.r = e.clientX;
      if (id.includes("n")) box.t = e.clientY;
      if (id.includes("s")) box.b = e.clientY;
    }
    render();
  }
  function onUp() {
    if (!mode) return;
    if (mode === "draw") {
      normBox();
      if ((box.r - box.l) < 4 || (box.b - box.t) < 4) { box = null; phase = "draw"; }
      else { phase = "adjust"; hint.textContent = HINT_ADJUST; }
    } else {
      normBox();
    }
    mode = null; dragH = null; anchor = null;
    render();
  }
  function onKey(e) {
    // 캡처 단계 + stopPropagation: 뒤의 다이얼로그/앱 단축키가 함께 발동하지 않게.
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); }
    else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); confirm(); }
  }
  function onCtx(e) { e.preventDefault(); cancel(); }

  overlay.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("keydown", onKey, true);
  overlay.addEventListener("contextmenu", onCtx);
}

/* ----- initExportDialog: wire dropdown + modal to the export functions ----- */
export function initExportDialog(state, svg) {
  initFileMenu();

  const overlay = buildModal();
  const formatGroup = overlay.querySelector("#export-format");
  const dpiGroup = overlay.querySelector("#export-dpi");
  const dpiField = overlay.querySelector("#export-dpi-field");
  const filenameInput = overlay.querySelector("#export-filename");
  const includeReferenceImagesInput = overlay.querySelector("#export-include-reference-images");

  function showModal() {
    overlay.hidden = false;
    // Refresh the default name to the current minute each time the dialog opens
    // (unless the user has typed a custom name this session is fine to overwrite —
    // the field is always reset to the live timestamp on open).
    filenameInput.value = defaultNameBase();
    filenameInput.focus();
    filenameInput.select();
  }
  function hideModal() {
    overlay.hidden = true;
  }

  // 해상도 row is meaningful for PNG only.
  wireSegment(formatGroup, "data-format", (fmt) => {
    dpiField.style.display = fmt === "svg" ? "none" : "";
  });
  wireSegment(dpiGroup, "data-dpi", null);

  // Open from the dropdown item.
  const openBtn = document.getElementById("image-export");
  if (openBtn) openBtn.addEventListener("click", showModal);

  // Cancel / overlay-click / Escape close without exporting.
  overlay.querySelector("#export-cancel").addEventListener("click", hideModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) hideModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) hideModal();
  });

  // Alt+P → open the image export dialog (P = print/picture; mirrors the text
  // tool's single-key feel). preventDefault only inside the app so it never
  // collides with a browser/system shortcut. Skip while typing in a field.
  window.addEventListener("keydown", (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.key || "").toLowerCase() !== "p") return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    e.preventDefault();
    if (overlay.hidden) showModal();
  });

  // Export the current settings, optionally cropped to a world-coord rectangle.
  function doExport(bounds) {
    const name = (filenameInput.value || "").trim() || defaultNameBase();
    const format = segValue(formatGroup, "data-format");
    const options = { includeReferenceImages: includeReferenceImagesInput?.checked !== false };
    if (format === "svg") {
      exportSvg(state, `${name}.svg`, bounds, options);
    } else {
      const dpi = parseInt(segValue(dpiGroup, "data-dpi"), 10) || 300;
      exportPng(state, `${name}.png`, dpi, bounds, options);
    }
  }

  // Full-artboard export (unchanged behavior: bounds = null).
  overlay.querySelector("#export-confirm").addEventListener("click", () => {
    doExport(null);
    hideModal();
  });

  // 미리보기: 먼저 영역을 지정하게 한 뒤(영역지정과 동일한 드래그), 그 영역을 실제
  // 시험지 위 실제 크기로 얹어 확인한다. 같은 dpi/참고이미지 설정을 넘겨 "미리 본
  // 그대로 내보내지도록" 한다. 취소 시 다이얼로그로 복귀.
  const previewBtn = overlay.querySelector("#export-preview");
  if (previewBtn && svg) {
    previewBtn.addEventListener("click", () => {
      hideModal();
      runAreaCapture(svg, state, (bounds) => {
        if (!bounds) { showModal(); return; }
        const dpi = parseInt(segValue(dpiGroup, "data-dpi"), 10) || 300;
        const options = { includeReferenceImages: includeReferenceImagesInput?.checked !== false };
        openExamPreview({ state, dpi, options, bounds });
      }, "미리볼 영역을 드래그하십시오");
    });
  }

  // Selected-area export: hide the modal, drag a rectangle, export just that.
  const areaBtn = overlay.querySelector("#export-area");
  if (areaBtn && svg) {
    areaBtn.addEventListener("click", () => {
      hideModal();
      runAreaCapture(svg, state, (bounds) => {
        if (bounds) doExport(bounds);
        else showModal(); // cancelled → reopen the dialog where we left off
      });
    });
  }
}

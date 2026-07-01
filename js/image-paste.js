/* ===== IMAGE PASTE (Ctrl+V system-clipboard image → background/edit object) =====
//
// DESIGN 1-1 (data-as-truth): a pasted image becomes a REAL object in
// state.objects with an { id, type:"image", x,y,w,h, rotation, src, mode,
// opacity, aspectLocked, exportable, locked, layerId, order, cutouts:[] } shape.
// The SVG canvas is only a projection of that data (render.js renderImage).
//
// Coordination with internal object copy/paste (transform.js):
//   • On Ctrl+V, transform.js pastes internal objects when any are copied.
//   • This module handles the *system* clipboard ONLY when nothing is copied
//     internally (hasInternalClipboard() === false), so a single Ctrl+V never
//     double-pastes. It also never fires while the user types in a field/modal.
//
// Scope note: `cutouts:[]` is prepared as future data only. No erase/cutout
// editing, SVG mask/clipPath, or transparent cutout rendering happens here. */

import { hasInternalClipboard, getLastMouseWorld } from "./transform.js?v=0.37.0";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg"]);
let _idCounter = 0;

/* ----- do not steal Ctrl+V while the user is typing (text/inputs/modals) ----- */
function isEditingFieldTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
    target.isContentEditable ||
    (target.closest && target.closest("#inspector, .text-editor-overlay, .font-modal-overlay, .text-ctx-menu, .modal-overlay"));
}

/* ----- paste-mode choice modal (배경 / 편집 / 취소) ----- */
function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal modal-image-paste" role="dialog" aria-modal="true" aria-labelledby="imgpaste-title">
      <h2 class="modal-title" id="imgpaste-title">이미지 붙여넣기</h2>
      <p class="objectify-description">클립보드 이미지를 어떻게 삽입할지 선택하세요. 배경 모드는 따라 그리기용 반투명 이미지(내보내기 제외), 편집 모드는 일반 이미지 객체입니다.</p>
      <div class="modal-actions">
        <button id="imgpaste-cancel" type="button" class="modal-btn">취소</button>
        <button id="imgpaste-background" type="button" class="modal-btn">배경 모드로 삽입</button>
        <button id="imgpaste-edit" type="button" class="modal-btn modal-btn-primary">편집 모드로 삽입</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

/* ----- load a data-URL image to learn its natural pixel size ----- */
function loadImageSize(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => reject(new Error("이미지를 디코딩하지 못했습니다."));
    img.src = src;
  });
}

/* ----- fit natural pixel size into ~90% of the artboard, preserving ratio ----- */
function fitToArtboard(natural, artboard) {
  const scale = Math.min((artboard.w * 0.9) / natural.w, (artboard.h * 0.9) / natural.h);
  return { w: natural.w * scale, h: natural.h * scale };
}

/* ----- insert an edit-mode image: normal, selectable, ratio-locked object ----- */
function insertEditImage(state, src, size) {
  const s0 = state.get();
  const fitted = fitToArtboard(size, s0.artboard);
  // Prefer the current mouse world position; fall back to the viewport center.
  const target = getLastMouseWorld() ||
    { x: s0.viewBox.x + s0.viewBox.w / 2, y: s0.viewBox.y + s0.viewBox.h / 2 };
  const x = target.x - fitted.w / 2;
  const y = target.y - fitted.h / 2;
  const id = `obj_${Date.now().toString(36)}_imgpaste${++_idCounter}`;
  state.update((s) => {
    s.undoStack.push(JSON.parse(JSON.stringify(s.objects)));
    s.redoStack = [];
    s.objects.push({
      id, type: "image", src,
      x, y, w: fitted.w, h: fitted.h,
      rotation: 0,
      mode: "edit",
      opacity: 1,
      aspectLocked: true,
      exportable: true,
      locked: false,
      positionLocked: false,
      layerId: s.activeLayerId,
      order: s.objects.length,
      cutouts: [],
    });
    s.selectedIds = [id];
    s.targetedId = null;
    s.activeTool = "V";
  });
}

/* ----- insert a background-mode image: semi-transparent, locked, backmost ----- */
function insertBackgroundImage(state, src, size) {
  const s0 = state.get();
  const fitted = fitToArtboard(size, s0.artboard);
  // Background tracing image is centered on the artboard origin (world 0,0).
  const x = -fitted.w / 2;
  const y = -fitted.h / 2;
  const id = `obj_${Date.now().toString(36)}_imgbg${++_idCounter}`;
  state.update((s) => {
    s.undoStack.push(JSON.parse(JSON.stringify(s.objects)));
    s.redoStack = [];
    // Backmost z-order = front of the array (render/export paint array order).
    s.objects.unshift({
      id, type: "image", src,
      x, y, w: fitted.w, h: fitted.h,
      rotation: 0,
      mode: "background",
      opacity: 0.35,
      aspectLocked: true,
      exportable: false,
      locked: true,
      positionLocked: false,
      layerId: s.activeLayerId,
      order: 0,
      cutouts: [],
    });
    // Select it so its inspector controls (opacity/unlock/remove) are reachable
    // immediately — a locked backmost image is otherwise hard to click.
    s.selectedIds = [id];
    s.targetedId = null;
    s.activeTool = "V";
  });
}

export function initImagePaste(state, svg) {
  const overlay = buildModal();
  const btnBackground = overlay.querySelector("#imgpaste-background");
  const btnEdit = overlay.querySelector("#imgpaste-edit");
  const btnCancel = overlay.querySelector("#imgpaste-cancel");

  let pendingSrc = null;

  const close = () => {
    overlay.hidden = true;
    pendingSrc = null;
  };
  const openWith = (src) => {
    pendingSrc = src;
    overlay.hidden = false;
    btnEdit.focus();
  };

  async function chooseMode(mode) {
    if (!pendingSrc) return;
    const src = pendingSrc;
    close();
    try {
      const size = await loadImageSize(src);
      if (mode === "background") insertBackgroundImage(state, src, size);
      else insertEditImage(state, src, size);
    } catch (_) {
      // Decode failure: silently abort (no partial insert, no stale listeners).
    }
  }

  btnBackground.addEventListener("click", () => chooseMode("background"));
  btnEdit.addEventListener("click", () => chooseMode("edit"));
  btnCancel.addEventListener("click", close);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) close(); });

  // System-clipboard image paste. Fires alongside the Ctrl+V keydown that
  // transform.js uses for internal object paste; we defer to that whenever
  // objects are copied internally, and only act when nothing internal is pending.
  document.addEventListener("paste", (e) => {
    if (!overlay.hidden) return;               // choice already open
    if (isEditingFieldTarget(e.target)) return; // typing in a field/modal
    if (hasInternalClipboard()) return;         // internal object paste wins
    const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
    const imageItem = items.find((it) => ACCEPTED_TYPES.has(it.type));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    const reader = new FileReader();
    reader.onload = () => openWith(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

/* ===== IMAGE PASTE (Ctrl+V system-clipboard image -> normal image object) ===== */

import { hasInternalClipboard, getLastMouseWorld } from "./transform.js?v=0.43.0";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg"]);
let _idCounter = 0;

function isEditingFieldTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
    target.isContentEditable ||
    (target.closest && target.closest("#inspector, .text-editor-overlay, .font-modal-overlay, .text-ctx-menu, .modal-overlay"));
}

function loadImageSize(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => reject(new Error("Unable to decode image"));
    img.src = src;
  });
}

function fitToArtboard(natural, artboard) {
  const scale = Math.min((artboard.w * 0.9) / natural.w, (artboard.h * 0.9) / natural.h);
  return { w: natural.w * scale, h: natural.h * scale };
}

function insertImageObject(state, src, size) {
  const s0 = state.get();
  const fitted = fitToArtboard(size, s0.artboard);
  const target = getLastMouseWorld() ||
    { x: s0.viewBox.x + s0.viewBox.w / 2, y: s0.viewBox.y + s0.viewBox.h / 2 };
  const x = target.x - fitted.w / 2;
  const y = target.y - fitted.h / 2;
  const id = `obj_${Date.now().toString(36)}_img${++_idCounter}`;

  state.update((s) => {
    s.undoStack.push(JSON.parse(JSON.stringify(s.objects)));
    s.redoStack = [];
    s.objects.push({
      id,
      type: "image",
      src,
      x,
      y,
      w: fitted.w,
      h: fitted.h,
      rotation: 0,
      mode: "edit",
      opacity: 1,
      aspectLocked: true,
      exportable: true,
      locked: false,
      positionLocked: false,
      imageSelectionLocked: false,
      layerId: s.activeLayerId,
      order: s.objects.length,
      cutouts: [],
    });
    s.selectedIds = [id];
    s.targetedId = null;
    s.activeTool = "V";
  });
}

export function initImagePaste(state, svg) {
  async function insertFromSrc(src) {
    try {
      const size = await loadImageSize(src);
      insertImageObject(state, src, size);
    } catch (_) {
      // Decode failure: silently abort.
    }
  }

  document.addEventListener("paste", (e) => {
    if (isEditingFieldTarget(e.target)) return;
    if (hasInternalClipboard()) return;
    const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
    const imageItem = items.find((it) => ACCEPTED_TYPES.has(it.type));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    const reader = new FileReader();
    reader.onload = () => insertFromSrc(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

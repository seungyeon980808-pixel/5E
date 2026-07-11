/* ===== IMAGE PASTE (Ctrl+V system-clipboard image -> normal image object) ===== */

import { hasInternalClipboard, getLastMouseWorld } from "./transform.js?v=0.55.0";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg"]);
const MAX_IMG_DIM = 2000; // px — 초고해상도 붙여넣기 이미지는 이 상한으로 다운스케일
const MAX_UNDO = 60;      // undo 스냅샷 개수 상한(딥클론 누적 메모리 폭증 방지)
let _idCounter = 0;

// 자연 크기가 상한을 넘으면 canvas로 축소 재인코딩해 저장(=undo 스냅샷에 딥클론되는
// data URL 크기를 줄여 메모리 폭증을 막는다). 상한 이하면 원본 그대로.
function downscaleIfNeeded(src, natural) {
  const max = Math.max(natural.w, natural.h);
  if (max <= MAX_IMG_DIM) return Promise.resolve({ src, size: natural });
  const scale = MAX_IMG_DIM / max;
  const w = Math.max(1, Math.round(natural.w * scale));
  const h = Math.max(1, Math.round(natural.h * scale));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve({ src: c.toDataURL("image/png"), size: { w, h } });
      } catch (_) { resolve({ src, size: natural }); }
    };
    img.onerror = () => resolve({ src, size: natural });
    img.src = src;
  });
}

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

function insertImageObject(state, src, size, place) {
  const s0 = state.get();
  const fitted = fitToArtboard(size, s0.artboard);
  // place.at 지정 시 그 지점(예: 아트보드 원점)을 기준으로, 아니면 마지막 마우스/뷰포트 중앙.
  const target = (place && place.at) ? place.at : (getLastMouseWorld() ||
    { x: s0.viewBox.x + s0.viewBox.w / 2, y: s0.viewBox.y + s0.viewBox.h / 2 });
  const off = (place && place.offset) || { dx: 0, dy: 0 };
  const x = target.x - fitted.w / 2 + off.dx;
  const y = target.y - fitted.h / 2 + off.dy;
  const id = `obj_${Date.now().toString(36)}_img${++_idCounter}`;

  state.update((s) => {
    s.undoStack.push(JSON.parse(JSON.stringify(s.objects)));
    if (s.undoStack.length > MAX_UNDO) s.undoStack.splice(0, s.undoStack.length - MAX_UNDO);
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

/* 외부 모듈용(기출 라이브러리·이미지 불러오기 등): dataURL을 즉시 이미지 객체로 삽입.
 * 내부 붙여넣기 경로와 달리 디코드 실패를 삼키지 않고 throw한다.
 * opts.at={x,y} = 삽입 기준점(예: 아트보드 원점), opts.offset={dx,dy} = 카스케이드용. */
export async function insertImageFromSrc(state, src, opts) {
  const natural = await loadImageSize(src);
  const scaled = await downscaleIfNeeded(src, natural);
  insertImageObject(state, scaled.src, scaled.size, opts);
}

export function initImagePaste(state, svg) {
  async function insertFromSrc(src) {
    try {
      const natural = await loadImageSize(src);
      const scaled = await downscaleIfNeeded(src, natural);
      insertImageObject(state, scaled.src, scaled.size);
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

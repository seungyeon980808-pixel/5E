import { blocksCanvasShortcut } from "./platform.js?v=1.4.0";
import { showAlert } from "./ui-dialogs.js?v=1.4.0";
/* ===== IMAGE PASTE (Ctrl+V system-clipboard image -> normal image object) ===== */

import { getLastMouseWorld } from "./transform.js?v=1.4.0";

// 왜: png/jpeg만 허용하면 webp/gif/bmp를 클립보드로 붙여넣을 때 조용히 무시된다.
const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"]);
const MAX_IMG_DIM = 2000; // px — 초고해상도 붙여넣기 이미지는 이 상한으로 다운스케일
const MAX_UNDO = 60;      // undo 스냅샷 개수 상한(딥클론 누적 메모리 폭증 방지)
let _idCounter = 0;

// 자연 크기가 상한을 넘으면 canvas로 축소 재인코딩해 저장(=undo 스냅샷에 딥클론되는
// data URL 크기를 줄여 메모리 폭증을 막는다). 상한 이하면 원본 그대로.
// project-io.js(드래그앤드롭 이미지 삽입)도 같은 축소를 쓴다 — 붙여넣기 경로만
// 축소하고 드롭 경로는 원본 그대로 저장하면 저장 파일·자동저장이 고해상도 사진에서
// 폭증한다(1건 프로젝트-저장/페이지 감사 finding).
export function downscaleIfNeeded(src, natural) {
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
    img.onload = () => {
      const w = Number(img.naturalWidth), h = Number(img.naturalHeight);
      if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
        reject(new Error("이미지 크기를 확인할 수 없습니다."));
        return;
      }
      resolve({ w, h });
    };
    img.onerror = () => reject(new Error("Unable to decode image"));
    img.src = src;
  });
}

function fitToArtboard(natural, artboard) {
  // 왜: Math.min만 쓰면 작은 이미지가 아트보드의 90%까지 강제 확대돼 화질이
  // 열화된다 — 1을 상한으로 둬 축소만 하고 확대는 하지 않는다.
  const scale = Math.min((artboard.w * 0.9) / natural.w, (artboard.h * 0.9) / natural.h, 1);
  return { w: natural.w * scale, h: natural.h * scale };
}

function targetStateFingerprint(target) {
  const { src, ...state } = target;
  return JSON.stringify(state);
}

function insertImageObject(state, src, size, place) {
  const s0 = state.get();
  const fitted = fitToArtboard(size, s0.artboard);
  // place.at 지정 시 그 지점(예: 아트보드 원점)을 기준으로, 아니면 마지막 마우스/뷰포트 중앙.
  const target = place?.centerArtboard
    ? { x: 0, y: 0 }
    : (place && place.at) ? place.at : (getLastMouseWorld() ||
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
      ...(place?.aiTaskId ? {aiTaskId:place.aiTaskId,aiCandidateId:place.aiCandidateId} : {}),
    });
    s.selectedIds = [id];
    s.targetedId = null;
    s.activeTool = "V";
  });
  return id;
}

/* 외부 모듈용(기출 라이브러리·이미지 불러오기 등): dataURL을 즉시 이미지 객체로 삽입.
 * 내부 붙여넣기 경로와 달리 디코드 실패를 삼키지 않고 throw한다.
 * opts.at={x,y} = 삽입 기준점(예: 아트보드 원점), opts.offset={dx,dy} = 카스케이드용. */
export async function insertImageFromSrc(state, src, opts = {}) {
  // Capture intent before decoding. UI state (page, selected object, even opts)
  // can change while Image.onload/downscaling is pending.
  const options = { ...opts,
    ...(opts?.at ? { at: { ...opts.at } } : {}),
    ...(opts?.offset ? { offset: { ...opts.offset } } : {}),
  };
  if (typeof src !== "string" || !src.trim()) throw new Error("삽입할 이미지가 없습니다.");
  const hasAiMetadata = options.aiTaskId != null || options.aiCandidateId != null;
  if (hasAiMetadata && (![options.aiTaskId, options.aiCandidateId].every(value => typeof value === "string" && value.trim()))) {
    throw new Error("이미지 작업·버전 정보를 확인할 수 없습니다.");
  }
  if (options.replaceId && !hasAiMetadata) throw new Error("교체할 이미지 작업 정보가 없습니다.");

  const initial = state.get();
  const pageId = initial.activePageId ?? null;
  const pageRecord = initial.pages?.find(page => page.id === pageId) ?? null;
  const objectsAtStart = initial.objects;
  const initialTarget = options.replaceId ? initial.objects.find(obj => obj.id === options.replaceId) : null;
  const targetSnapshot = initialTarget ? targetStateFingerprint(initialTarget) : null;
  const targetSource = initialTarget?.src;
  const targetCandidateId = initialTarget?.aiCandidateId;
  let invalidationError = null;
  function assertContext(s) {
    if (invalidationError) throw invalidationError;
    if ((s.activePageId ?? null) !== pageId
      || (s.pages?.find(page => page.id === pageId) ?? null) !== pageRecord
      || s.objects !== objectsAtStart) {
      throw new Error("이미지를 준비하는 동안 페이지가 변경되었습니다. 다시 시도해 주세요.");
    }
    if (!options.replaceId) return null;
    const target = s.objects.find(obj => obj.id === options.replaceId);
    if (!target || target !== initialTarget || targetStateFingerprint(target) !== targetSnapshot || target.type !== "image"
      || target.aiTaskId !== options.aiTaskId || target.src !== targetSource
      || target.aiCandidateId !== targetCandidateId
      || s.selectedIds?.length !== 1 || s.selectedIds[0] !== target.id) {
      throw new Error("교체 대상 이미지나 선택이 변경되었습니다. 다시 선택해 주세요.");
    }
    if (target.locked || target.positionLocked || target.imageSelectionLocked) {
      throw new Error("잠긴 이미지는 교체할 수 없습니다.");
    }
    return target;
  }
  assertContext(initial);
  // Latch temporary page/selection changes too (switch away and back is not
  // permission to complete an earlier operation). Always release the listener.
  const unsubscribe = state.subscribe?.((s) => {
    try { assertContext(s); } catch (error) { invalidationError ??= error; }
  });
  try {
    const natural = await loadImageSize(src);
    assertContext(state.get());
    if (options.replaceId) {
      state.update((s) => {
        const target = assertContext(s);
        const undo = JSON.parse(JSON.stringify(s.objects));
        s.undoStack.push(undo);
        if (s.undoStack.length > MAX_UNDO) s.undoStack.splice(0, s.undoStack.length - MAX_UNDO);
        s.redoStack = [];
        // Geometry, layer, grouping, clipping and other image settings remain.
        target.src = src;
        target.aiCandidateId = options.aiCandidateId;
        s.selectedIds = [target.id];
        s.targetedId = null;
        s.activeTool = "V";
      });
      return options.replaceId;
    }
    const scaled = options.preserveBytes ? { src, size: natural } : await downscaleIfNeeded(src, natural);
    assertContext(state.get());
    return insertImageObject(state, scaled.src, scaled.size, options);
  } finally {
    if (typeof unsubscribe === "function") unsubscribe();
  }
}

export function initImagePaste(state, svg) {
  document.addEventListener("paste", (event) => {
    if (isEditingFieldTarget(event.target) || blocksCanvasShortcut(event)) return;
    const items = Array.from(event.clipboardData?.items || []);
    const file = items.find(item => ACCEPTED_TYPES.has(item.type))?.getAsFile();
    if (!file) return;
    event.preventDefault();
    const initial = state.get();
    const page = initial.pages?.find(record => record.id === initial.activePageId);
    const pageId = initial.activePageId;
    const at = getLastMouseWorld() || { x: initial.viewBox.x + initial.viewBox.w / 2, y: initial.viewBox.y + initial.viewBox.h / 2 };
    let stale = false;
    const changedPage = current => current.activePageId !== pageId ||
      current.pages?.find(record => record.id === pageId) !== page;
    const unsubscribe = state.subscribe(current => { if (changedPage(current)) stale = true; });
    const reader = new FileReader();
    const failed = message => {
      unsubscribe();
      void showAlert(message, { title: "이미지 붙여넣기" });
    };
    reader.onerror = () => failed("이미지를 읽지 못했습니다. 다시 복사하거나 이미지 파일을 불러와 주세요.");
    reader.onload = async () => {
      try {
        if (stale || changedPage(state.get())) throw new Error("페이지가 바뀌어 붙여넣기를 취소했습니다. 원하는 페이지에서 다시 붙여넣어 주세요.");
        await insertImageFromSrc(state, String(reader.result || ""), { at });
      } catch (error) {
        void showAlert(error?.message?.includes("페이지") ? error.message :
          "이미지를 붙여넣지 못했습니다. 다시 복사하거나 이미지 파일을 불러와 주세요.", { title: "이미지 붙여넣기" });
      } finally { unsubscribe(); }
    };
    try { reader.readAsDataURL(file); }
    catch { failed("이미지를 읽지 못했습니다. 이미지 파일을 불러와 주세요."); }
  });
}

/* ===== ARTBOARD AREA CAPTURE — 드래그한 사각형을 새 아트보드로 지정 =====
 * 내보내기 영역 지정과 동일한 오버레이에서 고른 world 사각형의 크기를 새 아트보드로
 * 쓰고, 그 중심이 원점에 오도록 모든 객체와 가이드를 평행이동한다. */

import { runAreaCapture } from "./export-dialog.js?v=1.4.3";
import { translateObject } from "./transform.js?v=1.4.0";
import { artboardChangeFromBounds } from "./artboard-area.js?v=1.4.3";

export function applyArtboardBounds(state, bounds) {
  const change = artboardChangeFromBounds(bounds);
  if (!change) return false;
  state.update((s) => {
    for (const obj of s.objects) translateObject(obj, change.dx, change.dy);
    for (const guide of s.guides || []) {
      if (guide.axis === "x") guide.position += change.dx;
      else if (guide.axis === "y") guide.position += change.dy;
    }
    s.artboard = change.artboard;
    s.artboardResizeMode = false;
  });
  return true;
}

export function initArtboardResize(svg, state) {
  let captureOpen = false;
  function startCapture() {
    if (captureOpen) return;
    captureOpen = true;
    runAreaCapture(svg, state, (bounds) => {
      captureOpen = false;
      if (bounds) applyArtboardBounds(state, bounds);
      else state.update((s) => { s.artboardResizeMode = false; });
    }, "새 아트보드로 사용할 영역을 드래그하십시오");
  }
  state.subscribe((s) => {
    if (s.artboardResizeMode === true && !captureOpen) queueMicrotask(startCapture);
  });
  if (state.get().artboardResizeMode === true) queueMicrotask(startCapture);
}

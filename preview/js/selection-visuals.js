export const SELECTION_COLOR = "#0969da";
export const SELECTION_MARQUEE_FILL = "rgba(9,105,218,0.08)";
export const SELECTION_HANDLE_COUNT = 8;
export const SELECTION_STROKE_PX = 1;
export const SELECTION_DASH_PX = [4, 3];
export const SELECTION_HANDLE_PX = 8;
export const SELECTION_HIT_PX = 24;

export function selectionVisualMetrics(zoom) {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return {
    strokeWorld: SELECTION_STROKE_PX / scale,
    handleWorld: SELECTION_HANDLE_PX / scale,
    hitWorld: SELECTION_HIT_PX / scale,
    dashWorld: SELECTION_DASH_PX.map((value) => value / scale),
  };
}

export function selectionScaleForSvg(svg, viewBox) {
  const rect = svg?.getBoundingClientRect?.();
  if (!rect || !viewBox || !(viewBox.w > 0) || !(viewBox.h > 0)) return 1;
  return Math.min(rect.width / viewBox.w, rect.height / viewBox.h);
}

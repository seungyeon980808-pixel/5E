const AB_MIN = 10;
const AB_MAX = 200;
const round1 = (v) => Math.round(v * 10) / 10;
const clampSize = (v) => Math.max(AB_MIN, Math.min(AB_MAX, round1(v)));

export function artboardChangeFromBounds(bounds) {
  if (!bounds || !(bounds.w > 0) || !(bounds.h > 0)) return null;
  const centerX = bounds.x + bounds.w / 2;
  const centerY = bounds.y + bounds.h / 2;
  return {
    artboard: { w: clampSize(bounds.w), h: clampSize(bounds.h) },
    dx: centerX === 0 ? 0 : -centerX,
    dy: centerY === 0 ? 0 : -centerY,
  };
}

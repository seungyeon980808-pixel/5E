const STEP = 0.01;
const MIN_SIZE = 0.01;
const round = (value) => Math.round(value * 1000) / 1000;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function adjustCropBoxWithKeyboard(box, key, { shiftKey = false } = {}) {
  const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
  if (!box || !direction) return null;
  const next = { ...box };
  if (shiftKey) {
    if (direction[0]) next.w = clamp(box.w + direction[0] * STEP, MIN_SIZE, 1 - box.x);
    if (direction[1]) next.h = clamp(box.h + direction[1] * STEP, MIN_SIZE, 1 - box.y);
  } else {
    next.x = clamp(box.x + direction[0] * STEP, 0, 1 - box.w);
    next.y = clamp(box.y + direction[1] * STEP, 0, 1 - box.h);
  }
  return Object.fromEntries(Object.entries(next).map(([name, value]) => [name, round(value)]));
}

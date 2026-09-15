import {
  validateChangeMask,
  validatePreserveMask,
  validateRgbaImage,
} from "./image-background-core.js";

export const IMAGE_LINE_THICKNESS_LEVELS = Object.freeze([0, 1, 2]);

export function thickenDarkLines(rgba, {
  width,
  height,
  radius = 0,
  preserveMask,
  changeMask,
} = {}) {
  const count = validateRgbaImage(rgba, width, height);
  if (!IMAGE_LINE_THICKNESS_LEVELS.includes(radius)) {
    throw new RangeError("선 굵기는 0, 1, 2 중 하나여야 합니다.");
  }
  const protectedPixels = preserveMask === undefined
    ? undefined
    : validatePreserveMask(preserveMask, count);
  const editablePixels = changeMask === undefined
    ? undefined
    : validateChangeMask(changeMask, count);
  const output = new Uint8ClampedArray(rgba);
  if (radius === 0) return output;

  const offsets = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy <= radius * radius) offsets.push([dx, dy]);
    }
  }
  for (let pixel = 0; pixel < count; pixel += 1) {
    const source = pixel * 4;
    const low = Math.min(rgba[source], rgba[source + 1], rgba[source + 2]);
    const high = Math.max(rgba[source], rgba[source + 1], rgba[source + 2]);
    const alpha = rgba[source + 3];
    if (alpha === 0 || high > 96 || high - low > 12) continue;
    const darkness = (255 - high) * alpha;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    for (const [dx, dy] of offsets) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const targetPixel = ny * width + nx;
      if (protectedPixels?.[targetPixel] || editablePixels?.[targetPixel] === 0) continue;
      const target = targetPixel * 4;
      const targetLow = Math.min(output[target], output[target + 1], output[target + 2]);
      const targetHigh = Math.max(output[target], output[target + 1], output[target + 2]);
      if (output[target + 3] && targetHigh - targetLow > 12) continue;
      if ((255 - targetHigh) * output[target + 3] >= darkness) continue;
      output.set(rgba.subarray(source, source + 4), target);
    }
  }
  return output;
}

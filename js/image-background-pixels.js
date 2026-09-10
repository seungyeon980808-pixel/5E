import { EXAM_GRAY_PALETTE, IMAGE_BACKGROUND_POLICY_OPTIONS } from "./image-background-options.js";
import { validateChangeMask, validatePreserveMask } from "./image-background-core.js";

export function quantizeExamLineart(rgba, {
  palette = EXAM_GRAY_PALETTE,
  whiteCutoff = 248,
  preserveMask,
  changeMask,
  preserveTranslucent = true,
} = {}) {
  if (!rgba || typeof rgba.length !== "number") return rgba;
  if (preserveMask !== undefined) validatePreserveMask(preserveMask, Math.floor(rgba.length / 4));
  if (changeMask !== undefined) validateChangeMask(changeMask, Math.floor(rgba.length / 4));
  const tones = Array.from(new Set((palette || EXAM_GRAY_PALETTE).map(Number)))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 255)
    .sort((a, b) => a - b);
  if (!tones.includes(0) || !tones.includes(255)) throw new Error("평가원 팔레트에는 검정과 흰색이 필요합니다.");
  for (let pixel = 0; pixel * 4 + 3 < rgba.length; pixel += 1) {
    const offset = pixel * 4, alpha = rgba[offset + 3];
    if (alpha === 0 || preserveMask?.[pixel] || changeMask?.[pixel] === 0 || (preserveTranslucent && alpha < 255)) continue;
    const luminance = Math.round(rgba[offset] * .2126 + rgba[offset + 1] * .7152 + rgba[offset + 2] * .0722);
    const target = luminance >= whiteCutoff
      ? 255
      : tones.reduce((best, tone) => Math.abs(tone - luminance) < Math.abs(best - luminance) ? tone : best, tones[0]);
    rgba[offset] = target;
    rgba[offset + 1] = target;
    rgba[offset + 2] = target;
  }
  return rgba;
}

/* 명시적으로 모든 근백색을 지우는 레거시 경로다. 둘러싸인 흰 면도 대상이며,
 * 흰 바탕 위 선의 근백색 안티앨리어싱은 검정 coverage alpha로 바꾼다. */
export function makeNearWhiteTransparent(rgba, {
  threshold = IMAGE_BACKGROUND_POLICY_OPTIONS["all-near-white"].threshold,
  neutralTolerance = IMAGE_BACKGROUND_POLICY_OPTIONS["all-near-white"].neutralTolerance,
  preserveMask,
  changeMask,
} = {}) {
  if (!rgba || typeof rgba.length !== "number") return rgba;
  if (preserveMask !== undefined) validatePreserveMask(preserveMask, Math.floor(rgba.length / 4));
  if (changeMask !== undefined) validateChangeMask(changeMask, Math.floor(rgba.length / 4));
  for (let pixel = 0; pixel * 4 + 3 < rgba.length; pixel += 1) {
    if (preserveMask?.[pixel] || changeMask?.[pixel] === 0) continue;
    const offset = pixel * 4;
    const red = rgba[offset], green = rgba[offset + 1], blue = rgba[offset + 2], alpha = rgba[offset + 3];
    const high = Math.max(red, green, blue), low = Math.min(red, green, blue);
    if (low < threshold || high - low > neutralTolerance || alpha === 0) continue;
    const luminance = Math.round(red * .2126 + green * .7152 + blue * .0722);
    const coverage = Math.max(0, Math.min(1, (255 - luminance) / 255));
    rgba[offset] = 0;
    rgba[offset + 1] = 0;
    rgba[offset + 2] = 0;
    rgba[offset + 3] = Math.round(alpha * coverage);
  }
  return rgba;
}

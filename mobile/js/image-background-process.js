import { BACKGROUND_POLICIES } from "./image-background-options.js";
import {
  applyChangeScope,
  applyTransparencyMask,
  changedPixels,
  makeAnalysis,
  mergeMask,
  notifyReview,
  restorePreservedPixels,
  unchangedAnalysis,
  validateChangeMask,
  validateOnReview,
  validatePreserveMask,
  validateRgbaImage,
} from "./image-background-core.js";
import { checkerboardAnalysis } from "./image-background-checkerboard.js";
import { connectedBackgroundAnalysis } from "./image-background-connected.js";
import { thickenDarkLines } from "./image-line-thickness.js";
import { makeNearWhiteTransparent, quantizeExamLineart } from "./image-background-pixels.js";

/* 순수 픽셀 API: 입력은 절대 수정하지 않고 source에 원본 바이트를 보관한다. reviewMask의 1은
 * 자동 삭제하지 않은 보호/수동 검토 후보다. changeMask의 1 안에서만 제거와 팔레트를 적용하고
 * 그 밖은 exact RGBA로 복구한다. 처리 정책은 prompt의 white|transparent|preserve와 별개다. */
export function processImageBackgroundPixels(rgba, width, height, {
  backgroundPolicy = "connected",
  examPalette = false,
  lineThickness = 0,
  preserveMask,
  changeMask,
  connectedOptions = {},
  allNearWhiteOptions = {},
  checkerboardOptions = {},
  paletteOptions = {},
  onReview,
} = {}) {
  if (!BACKGROUND_POLICIES.has(backgroundPolicy)) throw new RangeError(`지원하지 않는 backgroundPolicy입니다: ${backgroundPolicy}`);
  const count = validateRgbaImage(rgba, width, height);
  const checkedMask = preserveMask === undefined ? undefined : validatePreserveMask(preserveMask, count);
  const checkedChangeMask = changeMask === undefined ? undefined : validateChangeMask(changeMask, count);
  validateOnReview(onReview);
  const source = rgba.slice();
  let data = rgba.slice();
  let analysis;

  if (backgroundPolicy === "connected") {
    analysis = connectedBackgroundAnalysis(data, width, height, { ...connectedOptions, preserveMask: checkedMask });
    analysis = applyChangeScope(analysis, width, height, checkedChangeMask);
    applyTransparencyMask(data, analysis.removalMask);
  } else if (backgroundPolicy === "all-near-white") {
    makeNearWhiteTransparent(data, { ...allNearWhiteOptions, preserveMask: checkedMask, changeMask: checkedChangeMask });
    const removalMask = changedPixels(source, data, checkedMask, checkedChangeMask);
    const protectedMask = new Uint8Array(count);
    if (checkedMask) mergeMask(protectedMask, checkedMask);
    analysis = applyChangeScope(makeAnalysis(width, height, { removalMask, protectedMask }), width, height, checkedChangeMask);
  } else if (backgroundPolicy === "checkerboard") {
    analysis = checkerboardAnalysis(data, width, height, { ...checkerboardOptions, preserveMask: checkedMask });
    analysis = applyChangeScope(analysis, width, height, checkedChangeMask);
    applyTransparencyMask(data, analysis.removalMask);
  } else {
    analysis = applyChangeScope(unchangedAnalysis(width, height, checkedMask), width, height, checkedChangeMask);
  }

  if (examPalette) quantizeExamLineart(data, {
    ...paletteOptions,
    preserveMask: analysis.protectedMask,
    changeMask: checkedChangeMask,
  });
  restorePreservedPixels(data, source, checkedMask, checkedChangeMask);
  data = thickenDarkLines(data, {
    width,
    height,
    radius: lineThickness,
    preserveMask: checkedMask,
    changeMask: checkedChangeMask,
  });
  const result = { width, height, data, source, backgroundPolicy, ...analysis };
  notifyReview(onReview, result);
  return result;
}

/* AI 선화의 흰색 래스터 배경을 투명 알파로 바꾼다.
 * 바깥 배경 제거와 모든 흰색 제거는 의미가 다르다. 자동 판정이 애매하면 원본 RGBA를
 * 남기고 reviewMask로 알리며, 명시적인 all-near-white 경로에서만 내부 흰색도 제거한다. */

import { BACKGROUND_POLICIES } from "./image-background-options.js?v=1.6.0-preview-labeler-0917-1111";
import {
  validateChangeMask,
  validateOnReview,
  validatePreserveMask,
} from "./image-background-core.js?v=1.6.0-preview-labeler-0917-1111";
import { processImageBackgroundPixels } from "./image-background-process.js?v=1.6.0-preview-labeler-0917-1111";

export {
  EXAM_GRAY_PALETTE,
  IMAGE_BACKGROUND_POLICY_OPTIONS,
  IMAGE_BACKGROUND_SCOPE_OPTIONS,
  IMAGE_BACKGROUND_VERSION,
} from "./image-background-options.js?v=1.6.0-preview-labeler-0917-1111";
export { makeNearWhiteTransparent, quantizeExamLineart } from "./image-background-pixels.js?v=1.6.0-preview-labeler-0917-1111";
export { analyzeEmbeddedCheckerboard, removeEmbeddedCheckerboard } from "./image-background-checkerboard.js?v=1.6.0-preview-labeler-0917-1111";
export { analyzeConnectedLightBackground, removeConnectedLightBackground } from "./image-background-connected.js?v=1.6.0-preview-labeler-0917-1111";
export { processImageBackgroundPixels };

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:\/\//i.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("생성 이미지를 불러오지 못했습니다."));
    img.src = src;
  });
}

export async function transparentizeGeneratedImage(src, options = {}) {
  const { backgroundPolicy = "connected", preserveMask, changeMask, onReview } = options;
  if (!BACKGROUND_POLICIES.has(backgroundPolicy)) throw new RangeError(`지원하지 않는 backgroundPolicy입니다: ${backgroundPolicy}`);
  if (preserveMask !== undefined) validatePreserveMask(preserveMask);
  if (changeMask !== undefined) validateChangeMask(changeMask);
  validateOnReview(onReview);

  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width || 1;
  canvas.height = img.naturalHeight || img.height || 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("이미지 투명화용 캔버스를 만들지 못했습니다.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const result = processImageBackgroundPixels(pixels.data, canvas.width, canvas.height, options);
  pixels.data.set(result.data);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png");
}

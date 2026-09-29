import { IMAGE_BACKGROUND_POLICY_OPTIONS } from "./image-background-options.js?v=1.6.0-preview-labeler-0917-1111";
import { checkerboardAnalysis } from "./image-background-checkerboard.js?v=1.6.0-preview-labeler-0917-1111";
import {
  applyChangeScope,
  applyTransparencyMask,
  hasRgbaShape,
  isNeutralLight,
  makeAnalysis,
  mergeMask,
  notifyReview,
  validateChangeMask,
  validateOnReview,
  validatePreserveMask,
  validateRgbaImage,
  frameHasTransparency,
} from "./image-background-core.js?v=1.6.0-preview-labeler-0917-1111";

function labelStructuralComponents(structural, width, height) {
  const count = width * height;
  const labels = new Uint32Array(count);
  const queue = new Uint32Array(count);
  let label = 0;
  for (let start = 0; start < count; start += 1) {
    if (!structural[start] || labels[start]) continue;
    label += 1;
    let head = 0, tail = 0;
    labels[start] = label;
    queue[tail++] = start;
    while (head < tail) {
      const pixel = queue[head++], x = pixel % width, y = Math.floor(pixel / width);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if ((!dx && !dy) || x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
          const next = pixel + dy * width + dx;
          if (!structural[next] || labels[next]) continue;
          labels[next] = label;
          queue[tail++] = next;
        }
      }
    }
  }
  return labels;
}

/* 같은 구조 성분의 양쪽 벽 사이를 내부로 본다. 닫힌 윤곽뿐 아니라 U자형 열린 비커의
 * 흰 내부도 보존하되, 바깥에서 닿는 내부는 open-light-region으로 검토를 요구한다. */
function findInteriorLight(definite, ambiguous, components, width, height) {
  const count = width * height;
  const interior = new Uint8Array(count);
  const firstSide = new Uint32Array(count);
  for (let y = 0; y < height; y += 1) {
    let left = 0;
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (components[pixel]) left = components[pixel];
      else firstSide[pixel] = left;
    }
    let right = 0;
    for (let x = width - 1; x >= 0; x -= 1) {
      const pixel = y * width + x;
      if (components[pixel]) right = components[pixel];
      else if ((definite[pixel] || ambiguous[pixel]) && right && firstSide[pixel] === right) interior[pixel] = 1;
    }
  }
  firstSide.fill(0);
  for (let x = 0; x < width; x += 1) {
    let top = 0;
    for (let y = 0; y < height; y += 1) {
      const pixel = y * width + x;
      if (components[pixel]) top = components[pixel];
      else firstSide[pixel] = top;
    }
    let bottom = 0;
    for (let y = height - 1; y >= 0; y -= 1) {
      const pixel = y * width + x;
      if (components[pixel]) bottom = components[pixel];
      else if ((definite[pixel] || ambiguous[pixel]) && bottom && firstSide[pixel] === bottom) interior[pixel] = 1;
    }
  }
  return interior;
}

function floodFromFrame(width, height, qualifies) {
  const count = width * height;
  const seen = new Uint8Array(count);
  const queue = new Uint32Array(count);
  let head = 0, tail = 0;
  const enqueue = (pixel) => {
    if (seen[pixel] || !qualifies(pixel)) return;
    seen[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y + 1 < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++], x = pixel % width;
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < width) enqueue(pixel + 1);
    if (pixel >= width) enqueue(pixel - width);
    if (pixel + width < count) enqueue(pixel + width);
  }
  return seen;
}

export function connectedBackgroundAnalysis(rgba, width, height, {
  threshold = IMAGE_BACKGROUND_POLICY_OPTIONS.connected.threshold,
  neutralTolerance = IMAGE_BACKGROUND_POLICY_OPTIONS.connected.neutralTolerance,
  ambiguityThreshold = IMAGE_BACKGROUND_POLICY_OPTIONS.connected.ambiguityThreshold,
  ambiguityNeutralTolerance = IMAGE_BACKGROUND_POLICY_OPTIONS.connected.ambiguityNeutralTolerance,
  preserveMask,
  checkerboardOptions = {},
} = {}) {
  const count = width * height;
  const protectedMask = new Uint8Array(count);
  if (preserveMask) mergeMask(protectedMask, preserveMask);
  if (frameHasTransparency(rgba, width, height)) {
    protectedMask.fill(1);
    return makeAnalysis(width, height, { protectedMask, genuineAlpha: true });
  }

  const checkerboard = checkerboardAnalysis(rgba, width, height, { ...checkerboardOptions, preserveMask });
  const definite = new Uint8Array(count);
  const ambiguous = new Uint8Array(count);
  const structural = new Uint8Array(count);
  for (let pixel = 0; pixel < count; pixel += 1) {
    const offset = pixel * 4, alpha = rgba[offset + 3];
    if (preserveMask?.[pixel] || checkerboard.detectedMask[pixel]) {
      structural[pixel] = 1;
      protectedMask[pixel] = 1;
      continue;
    }
    if (alpha === 0) continue;
    if (alpha < 255) {
      structural[pixel] = 1;
      protectedMask[pixel] = 1;
      continue;
    }
    if (isNeutralLight(rgba, pixel, threshold, neutralTolerance)) {
      definite[pixel] = 1;
      continue;
    }
    if (isNeutralLight(rgba, pixel, ambiguityThreshold, ambiguityNeutralTolerance)) {
      ambiguous[pixel] = 1;
      protectedMask[pixel] = 1;
      continue;
    }
    structural[pixel] = 1;
    const red = rgba[offset], green = rgba[offset + 1], blue = rgba[offset + 2];
    if (Math.min(red, green, blue) >= ambiguityThreshold) protectedMask[pixel] = 1;
  }
  mergeMask(protectedMask, checkerboard.uncertainMask);

  const components = labelStructuralComponents(structural, width, height);
  const interior = findInteriorLight(definite, ambiguous, components, width, height);
  mergeMask(protectedMask, interior);
  const exterior = floodFromFrame(width, height, (pixel) => {
    if (preserveMask?.[pixel] || protectedMask[pixel]) return rgba[pixel * 4 + 3] === 0;
    return definite[pixel] === 1 || rgba[pixel * 4 + 3] === 0;
  });
  const potentialExterior = floodFromFrame(width, height, (pixel) => {
    if (preserveMask?.[pixel] || checkerboard.detectedMask[pixel]) return false;
    return definite[pixel] === 1 || ambiguous[pixel] === 1 || rgba[pixel * 4 + 3] === 0;
  });

  const removalMask = new Uint8Array(count);
  const reviewMask = new Uint8Array(count);
  let openInteriorCount = 0, ambiguousExteriorCount = 0, uncertainCheckerboardCount = 0;
  for (let pixel = 0; pixel < count; pixel += 1) {
    if (exterior[pixel] && definite[pixel]) removalMask[pixel] = 1;
    if (potentialExterior[pixel] && interior[pixel]) {
      reviewMask[pixel] = 1;
      openInteriorCount += 1;
    } else if (potentialExterior[pixel] && ambiguous[pixel]) {
      reviewMask[pixel] = 1;
      ambiguousExteriorCount += 1;
    }
    if (potentialExterior[pixel] && checkerboard.uncertainMask[pixel]) {
      reviewMask[pixel] = 1;
      uncertainCheckerboardCount += 1;
    }
  }
  if (checkerboard.removedPixelCount) mergeMask(reviewMask, checkerboard.detectedMask);

  const reviewReasons = [];
  if (openInteriorCount) reviewReasons.push("open-light-region");
  if (ambiguousExteriorCount) reviewReasons.push("ambiguous-light-pixels");
  if (checkerboard.removedPixelCount) reviewReasons.push("embedded-checkerboard");
  if (uncertainCheckerboardCount) reviewReasons.push("checkerboard-pattern-uncertain");
  return makeAnalysis(width, height, { removalMask, protectedMask, reviewMask, reviewReasons });
}

export function analyzeConnectedLightBackground(rgba, width, height, options = {}) {
  const count = validateRgbaImage(rgba, width, height);
  const preserveMask = options.preserveMask === undefined ? undefined : validatePreserveMask(options.preserveMask, count);
  const changeMask = options.changeMask === undefined ? undefined : validateChangeMask(options.changeMask, count);
  validateOnReview(options.onReview);
  const analysis = applyChangeScope(
    connectedBackgroundAnalysis(rgba, width, height, { ...options, preserveMask }),
    width,
    height,
    changeMask,
  );
  notifyReview(options.onReview, analysis);
  return analysis;
}

/* 외곽과 연결됐다는 이유만으로 흰 내부를 지우지 않는다. 확실한 불투명 근백색 배경의 alpha만
 * 바꾸며 RGB, 회색 면, 얇은 선, 안티앨리어싱, 반투명 픽셀은 원본 그대로 남긴다. */
export function removeConnectedLightBackground(rgba, width, height, options = {}) {
  if (!hasRgbaShape(rgba, width, height)) return rgba;
  const analysis = analyzeConnectedLightBackground(rgba, width, height, options);
  applyTransparencyMask(rgba, analysis.removalMask);
  return rgba;
}

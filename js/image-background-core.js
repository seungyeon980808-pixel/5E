export function hasRgbaShape(rgba, width, height) {
  return rgba && typeof rgba.length === "number"
    && Number.isSafeInteger(width) && Number.isSafeInteger(height)
    && width > 0 && height > 0
    && Number.isSafeInteger(width * height * 4)
    && rgba.length >= width * height * 4;
}

export function validateRgbaImage(rgba, width, height) {
  if (!(rgba instanceof Uint8Array) && !(rgba instanceof Uint8ClampedArray)) {
    throw new TypeError("rgba는 Uint8Array 또는 Uint8ClampedArray여야 합니다.");
  }
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new TypeError("이미지 width와 height는 양의 정수여야 합니다.");
  }
  const count = width * height;
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(count * 4) || rgba.length !== count * 4) {
    throw new TypeError("rgba 크기는 width * height * 4와 같아야 합니다.");
  }
  return count;
}

function validateBinaryMask(mask, expectedLength, name) {
  if (!(mask instanceof Uint8Array) && !(mask instanceof Uint8ClampedArray)) {
    throw new TypeError(`${name}는 Uint8Array 또는 Uint8ClampedArray여야 합니다.`);
  }
  if (expectedLength !== undefined && mask.length !== expectedLength) {
    throw new TypeError(`${name} 크기는 이미지의 width * height와 같아야 합니다.`);
  }
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (mask[pixel] !== 0 && mask[pixel] !== 1) throw new RangeError(`${name} 값은 0 또는 1이어야 합니다.`);
  }
  return mask;
}

export function validatePreserveMask(mask, expectedLength) {
  return validateBinaryMask(mask, expectedLength, "preserveMask");
}

export function validateChangeMask(mask, expectedLength) {
  return validateBinaryMask(mask, expectedLength, "changeMask");
}

export function validateOnReview(onReview) {
  if (onReview !== undefined && typeof onReview !== "function") throw new TypeError("onReview는 함수여야 합니다.");
}

export function restorePreservedPixels(rgba, source, preserveMask, changeMask) {
  if (!preserveMask && !changeMask) return;
  for (let pixel = 0; pixel < rgba.length / 4; pixel += 1) {
    if (!preserveMask?.[pixel] && changeMask?.[pixel] !== 0) continue;
    const offset = pixel * 4;
    rgba[offset] = source[offset];
    rgba[offset + 1] = source[offset + 1];
    rgba[offset + 2] = source[offset + 2];
    rgba[offset + 3] = source[offset + 3];
  }
}

export function frameHasTransparency(rgba, width, height) {
  for (let x = 0; x < width; x += 1) {
    if (rgba[x * 4 + 3] < 255 || rgba[((height - 1) * width + x) * 4 + 3] < 255) return true;
  }
  for (let y = 1; y + 1 < height; y += 1) {
    if (rgba[y * width * 4 + 3] < 255 || rgba[(y * width + width - 1) * 4 + 3] < 255) return true;
  }
  return false;
}

export function isNeutralLight(rgba, pixel, threshold, neutralTolerance) {
  const offset = pixel * 4;
  const red = rgba[offset], green = rgba[offset + 1], blue = rgba[offset + 2];
  return Math.min(red, green, blue) >= threshold
    && Math.max(red, green, blue) - Math.min(red, green, blue) <= neutralTolerance;
}

export function mergeMask(target, source) {
  if (!source) return target;
  for (let pixel = 0; pixel < target.length; pixel += 1) if (source[pixel]) target[pixel] = 1;
  return target;
}

export function countMask(mask) {
  let count = 0;
  for (const value of mask) count += value ? 1 : 0;
  return count;
}

function maskBounds(mask, width, height) {
  let x0 = width, y0 = height, x1 = 0, y1 = 0, found = false;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (!mask[pixel]) continue;
    found = true;
    const x = pixel % width, y = Math.floor(pixel / width);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
  }
  return found ? { x0, y0, x1, y1 } : null;
}

export function makeAnalysis(width, height, {
  removalMask = new Uint8Array(width * height),
  protectedMask = new Uint8Array(width * height),
  reviewMask = new Uint8Array(width * height),
  reviewReasons = [],
  genuineAlpha = false,
} = {}) {
  return {
    removalMask,
    protectedMask,
    reviewMask,
    removedPixelCount: countMask(removalMask),
    protectedPixelCount: countMask(protectedMask),
    reviewPixelCount: countMask(reviewMask),
    reviewBounds: maskBounds(reviewMask, width, height),
    reviewRequired: reviewReasons.length > 0,
    reviewReasons,
    genuineAlpha,
  };
}

export function applyChangeScope(analysis, width, height, changeMask) {
  if (!changeMask) return analysis;
  const removalMask = analysis.removalMask.slice();
  const protectedMask = analysis.protectedMask.slice();
  const reviewMask = analysis.reviewMask.slice();
  for (let pixel = 0; pixel < changeMask.length; pixel += 1) {
    if (changeMask[pixel]) continue;
    removalMask[pixel] = 0;
    reviewMask[pixel] = 0;
    protectedMask[pixel] = 1;
  }
  const reviewReasons = countMask(reviewMask) ? analysis.reviewReasons : [];
  return {
    ...analysis,
    ...makeAnalysis(width, height, {
      removalMask,
      protectedMask,
      reviewMask,
      reviewReasons,
      genuineAlpha: analysis.genuineAlpha,
    }),
  };
}

export function notifyReview(onReview, analysis) {
  if (onReview) onReview(analysis);
}

export function applyTransparencyMask(rgba, mask) {
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (mask[pixel]) rgba[pixel * 4 + 3] = 0;
  }
}

export function unchangedAnalysis(width, height, preserveMask) {
  const protectedMask = new Uint8Array(width * height);
  if (preserveMask) mergeMask(protectedMask, preserveMask);
  return makeAnalysis(width, height, { protectedMask });
}

export function changedPixels(before, after, preserveMask, changeMask) {
  const mask = new Uint8Array(before.length / 4);
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (preserveMask?.[pixel] || changeMask?.[pixel] === 0) continue;
    const offset = pixel * 4;
    if (before[offset] !== after[offset]
      || before[offset + 1] !== after[offset + 1]
      || before[offset + 2] !== after[offset + 2]
      || before[offset + 3] !== after[offset + 3]) mask[pixel] = 1;
  }
  return mask;
}

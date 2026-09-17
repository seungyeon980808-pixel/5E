import { IMAGE_BACKGROUND_POLICY_OPTIONS } from "./image-background-options.js?v=1.6.0-preview-labeler-0917-1111";
import {
  applyChangeScope,
  applyTransparencyMask,
  countMask,
  frameHasTransparency,
  hasRgbaShape,
  isNeutralLight,
  makeAnalysis,
  mergeMask,
  notifyReview,
  validateChangeMask,
  validateOnReview,
  validatePreserveMask,
  validateRgbaImage,
} from "./image-background-core.js?v=1.6.0-preview-labeler-0917-1111";

export function checkerboardAnalysis(rgba, width, height, {
  threshold = IMAGE_BACKGROUND_POLICY_OPTIONS.checkerboard.threshold,
  neutralTolerance = IMAGE_BACKGROUND_POLICY_OPTIONS.checkerboard.neutralTolerance,
  minimumPixels = IMAGE_BACKGROUND_POLICY_OPTIONS.checkerboard.minimumPixels,
  minimumToneGap = IMAGE_BACKGROUND_POLICY_OPTIONS.checkerboard.minimumToneGap,
  preserveMask,
} = {}) {
  const count = width * height;
  const detectedMask = new Uint8Array(count);
  const uncertainMask = new Uint8Array(count);
  const protectedMask = new Uint8Array(count);
  if (preserveMask) mergeMask(protectedMask, preserveMask);
  if (frameHasTransparency(rgba, width, height)) {
    protectedMask.fill(1);
    return { ...makeAnalysis(width, height, { protectedMask, genuineAlpha: true }), detectedMask, uncertainMask };
  }

  const seen = new Uint8Array(count);
  const tone = new Uint8Array(count);
  const toneSeen = new Uint8Array(count);
  const queue = new Int32Array(count);
  const qualifies = (pixel) => !preserveMask?.[pixel]
    && rgba[pixel * 4 + 3] === 255
    && isNeutralLight(rgba, pixel, threshold, neutralTolerance);
  const luminanceBin = (pixel) => {
    const offset = pixel * 4;
    const luminance = Math.round(rgba[offset] * .2126 + rgba[offset + 1] * .7152 + rgba[offset + 2] * .0722);
    return Math.min(63, Math.floor(luminance / 4));
  };
  const visitNeighbors = (pixel, visit) => {
    const x = pixel % width;
    if (x > 0) visit(pixel - 1);
    if (x + 1 < width) visit(pixel + 1);
    if (pixel >= width) visit(pixel - width);
    if (pixel + width < count) visit(pixel + width);
  };
  const hasRepeatedPattern = (component, firstBin, secondBin) => {
    for (const pixel of component) {
      const bin = luminanceBin(pixel);
      tone[pixel] = Math.abs(bin - firstBin) <= Math.abs(bin - secondBin) ? 1 : 2;
    }
    let horizontalTransitions = 0, verticalTransitions = 0;
    for (const pixel of component) {
      const x = pixel % width;
      if (x + 1 < width && tone[pixel + 1] && tone[pixel + 1] !== tone[pixel]) horizontalTransitions += 1;
      if (pixel + width < count && tone[pixel + width] && tone[pixel + width] !== tone[pixel]) verticalTransitions += 1;
    }
    if (horizontalTransitions < 2 || verticalTransitions < 2) return false;

    const islands = [0, 0];
    for (const start of component) {
      if (toneSeen[start]) continue;
      const targetTone = tone[start];
      islands[targetTone - 1] += 1;
      let head = 0, tail = 0;
      queue[tail++] = start;
      toneSeen[start] = 1;
      while (head < tail) {
        const pixel = queue[head++];
        visitNeighbors(pixel, (next) => {
          if (toneSeen[next] || tone[next] !== targetTone) return;
          toneSeen[next] = 1;
          queue[tail++] = next;
        });
      }
    }
    return islands[0] >= 3 && islands[1] >= 3;
  };

  for (let start = 0; start < count; start += 1) {
    if (seen[start] || !qualifies(start)) continue;
    let head = 0, tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    const component = [];
    const histogram = new Uint32Array(64);
    while (head < tail) {
      const pixel = queue[head++];
      component.push(pixel);
      histogram[luminanceBin(pixel)] += 1;
      visitNeighbors(pixel, (next) => {
        if (seen[next] || !qualifies(next)) return;
        seen[next] = 1;
        queue[tail++] = next;
      });
    }
    if (component.length < minimumPixels) continue;
    const peaks = Array.from(histogram, (amount, bin) => ({ amount, bin }))
      .filter((entry) => entry.amount)
      .sort((a, b) => b.amount - a.amount);
    const first = peaks[0];
    const minimumBinGap = Math.max(1, Math.ceil(minimumToneGap / 4));
    const second = peaks.find((entry) => Math.abs(entry.bin - first.bin) >= minimumBinGap);
    if (!second) continue;
    const firstShare = first.amount / component.length;
    const secondShare = second.amount / component.length;
    if (firstShare < .12 || secondShare < .12 || firstShare + secondShare < .62) continue;
    const target = hasRepeatedPattern(component, first.bin, second.bin) ? detectedMask : uncertainMask;
    for (const pixel of component) target[pixel] = 1;
  }

  mergeMask(protectedMask, uncertainMask);
  const reviewReasons = countMask(uncertainMask) ? ["checkerboard-pattern-uncertain"] : [];
  return {
    ...makeAnalysis(width, height, {
      removalMask: detectedMask,
      protectedMask,
      reviewMask: uncertainMask,
      reviewReasons,
    }),
    detectedMask,
    uncertainMask,
  };
}

export function analyzeEmbeddedCheckerboard(rgba, width, height, options = {}) {
  const count = validateRgbaImage(rgba, width, height);
  const preserveMask = options.preserveMask === undefined ? undefined : validatePreserveMask(options.preserveMask, count);
  const changeMask = options.changeMask === undefined ? undefined : validateChangeMask(options.changeMask, count);
  validateOnReview(options.onReview);
  const analysis = applyChangeScope(
    checkerboardAnalysis(rgba, width, height, { ...options, preserveMask }),
    width,
    height,
    changeMask,
  );
  notifyReview(options.onReview, analysis);
  return analysis;
}

/* 실제 알파 프레임은 그대로 두고, 불투명 RGB에 반복된 두 밝기 checker pattern만 지운다.
 * 두 톤이 있어도 공간 반복성이 불확실하면 uncertain reviewMask에 남긴다. */
export function removeEmbeddedCheckerboard(rgba, width, height, options = {}) {
  if (!hasRgbaShape(rgba, width, height)) return rgba;
  const analysis = analyzeEmbeddedCheckerboard(rgba, width, height, options);
  applyTransparencyMask(rgba, analysis.removalMask);
  return rgba;
}

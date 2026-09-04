import { makeNearWhiteTransparent } from "./image-background.js";

export const IMAGE_TREATMENTS = Object.freeze({
  ORIGINAL: "original",
  CLEANUP: "cleanup",
  AI_REDRAW: "ai-redraw",
});

export const IMAGE_BACKGROUND_MODES = Object.freeze({
  WHITE: "white",
  TRANSPARENT: "transparent",
});

export const IMAGE_OUTPUT_LIMITS = Object.freeze({
  maxScale: 4,
  maxLongEdge: 4096,
  maxPixels: 16_000_000,
});
export const IMAGE_TRANSFORM_VERSION = "image-transform-v1";

export function normalizeImageTreatment(value) {
  return Object.values(IMAGE_TREATMENTS).includes(value) ? value : IMAGE_TREATMENTS.AI_REDRAW;
}

export function normalizeBackgroundMode(value) {
  return value === IMAGE_BACKGROUND_MODES.TRANSPARENT
    ? IMAGE_BACKGROUND_MODES.TRANSPARENT
    : IMAGE_BACKGROUND_MODES.WHITE;
}

export function normalizeOutputScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(IMAGE_OUTPUT_LIMITS.maxScale, Math.max(1, numeric));
}

export function buildImageOutputFilename(sourceName, {
  treatment = IMAGE_TREATMENTS.AI_REDRAW,
  revision = 1,
} = {}) {
  const raw = String(sourceName || "diagram").replace(/\.[^.]+$/, "");
  let safe = raw
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/[\s-]+/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, 96) || "diagram";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe)) safe = `_${safe}`;
  const mode = normalizeImageTreatment(treatment);
  const sequence = Math.max(1, Math.floor(Number(revision) || 1));
  return `${safe}-${mode}-r${String(sequence).padStart(2, "0")}.png`;
}

export function planImageTransform({ width, height, scale = 1 } = {}) {
  if (!(width > 0) || !(height > 0)) throw new TypeError("이미지 크기는 1px 이상이어야 합니다.");
  const requestedScale = normalizeOutputScale(scale);
  const edgeScale = IMAGE_OUTPUT_LIMITS.maxLongEdge / Math.max(width, height);
  const pixelScale = Math.sqrt(IMAGE_OUTPUT_LIMITS.maxPixels / (width * height));
  const appliedScale = Math.min(requestedScale, edgeScale, pixelScale);
  const outputWidth = Math.max(1, Math.round(width * appliedScale));
  const outputHeight = Math.max(1, Math.round(height * appliedScale));
  return {
    requestedScale,
    appliedScale: Math.round(appliedScale * 1000) / 1000,
    width: outputWidth,
    height: outputHeight,
    estimatedBytes: outputWidth * outputHeight * 4,
    capped: appliedScale < requestedScale,
    limitLabel: "긴 변 4096px · 최대 16MP",
  };
}

function luminanceAt(rgba, pixelIndex) {
  const offset = pixelIndex * 4;
  return (rgba[offset] * 299 + rgba[offset + 1] * 587 + rgba[offset + 2] * 114) / 1000;
}

export function cleanAndSharpenPixels(rgba, width, height) {
  const output = new Uint8ClampedArray(rgba);
  if (!rgba || rgba.length < width * height * 4) return output;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      if (rgba[offset + 3] === 0) continue;
      const maximum = Math.max(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
      const minimum = Math.min(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
      if (maximum - minimum > 14) continue;
      const center = luminanceAt(rgba, pixel);
      if (center <= 24) continue;
      let neighborTotal = 0;
      let neighborCount = 0;
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny += 1) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx += 1) {
          if (nx === x && ny === y) continue;
          neighborTotal += luminanceAt(rgba, ny * width + nx);
          neighborCount += 1;
        }
      }
      const neighborMean = neighborCount ? neighborTotal / neighborCount : center;
      const sharpened = center + (center - neighborMean) * 0.45;
      const contrasted = sharpened < 210
        ? 128 + (sharpened - 128) * 1.18
        : 210 + (sharpened - 210) * 1.35;
      const tone = Math.max(0, Math.min(255, Math.round(contrasted)));
      output[offset] = output[offset + 1] = output[offset + 2] = tone;
    }
  }
  return output;
}

export function imageSharpnessScore(rgba, width, height) {
  if (!rgba || width < 2 || height < 2) return 0;
  let total = 0;
  let edges = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = luminanceAt(rgba, y * width + x);
      if (x + 1 < width) {
        total += Math.abs(center - luminanceAt(rgba, y * width + x + 1));
        edges += 1;
      }
      if (y + 1 < height) {
        total += Math.abs(center - luminanceAt(rgba, (y + 1) * width + x));
        edges += 1;
      }
    }
  }
  return edges ? total / edges : 0;
}

export function applyBackgroundMode(rgba, mode) {
  const output = new Uint8ClampedArray(rgba);
  if (normalizeBackgroundMode(mode) === IMAGE_BACKGROUND_MODES.TRANSPARENT) {
    makeNearWhiteTransparent(output);
    return output;
  }
  for (let offset = 0; offset + 3 < output.length; offset += 4) {
    const alpha = output[offset + 3] / 255;
    output[offset] = Math.round(output[offset] * alpha + 255 * (1 - alpha));
    output[offset + 1] = Math.round(output[offset + 1] * alpha + 255 * (1 - alpha));
    output[offset + 2] = Math.round(output[offset + 2] * alpha + 255 * (1 - alpha));
    output[offset + 3] = 255;
  }
  return output;
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("변환할 이미지를 불러오지 못했습니다."));
    image.src = dataUrl;
  });
}

export async function transformImageDataUrl(dataUrl, {
  treatment = IMAGE_TREATMENTS.ORIGINAL,
  background = IMAGE_BACKGROUND_MODES.WHITE,
  scale = 1,
} = {}) {
  const image = await loadImage(dataUrl);
  const plan = planImageTransform({ width: image.naturalWidth, height: image.naturalHeight, scale });
  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const context = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, plan.width, plan.height);
  const pixels = context.getImageData(0, 0, plan.width, plan.height);
  const treated = normalizeImageTreatment(treatment) === IMAGE_TREATMENTS.CLEANUP
    ? cleanAndSharpenPixels(pixels.data, plan.width, plan.height)
    : new Uint8ClampedArray(pixels.data);
  pixels.data.set(applyBackgroundMode(treated, background));
  context.clearRect(0, 0, plan.width, plan.height);
  context.putImageData(pixels, 0, 0);
  return { data: canvas.toDataURL("image/png"), plan };
}

export async function transformImageBatch(items, options, {
  concurrency = 3,
  transform = transformImageDataUrl,
  onStart,
  onProgress,
} = {}) {
  const sources = [...(items || [])];
  const results = new Array(sources.length);
  const workerCount = Math.max(1, Math.min(sources.length || 1, Math.floor(concurrency) || 1));
  let cursor = 0;
  let completed = 0;
  const worker = async () => {
    while (cursor < sources.length) {
      const index = cursor;
      cursor += 1;
      const item = sources[index];
      onStart?.({ index, item });
      try {
        const transformed = await transform(item.data, options);
        results[index] = { status: "complete", item, ...transformed };
      } catch (error) {
        results[index] = { status: "failed", item, error: error.message || String(error) };
      }
      completed += 1;
      onProgress?.({ index, completed, total: sources.length, result: results[index] });
    }
  };
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

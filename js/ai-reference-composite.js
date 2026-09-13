export const REFERENCE_COMPOSITE_VERSION = "reference-composite-v1";
export const REFERENCE_COMPOSITE_FAILURE_MESSAGE = "이미지를 연결하지 못했습니다. 순서나 방향을 바꾼 뒤 다시 시도해 주세요.";

export class ReferenceCompositeError extends Error {
  constructor(cause) {
    super(REFERENCE_COMPOSITE_FAILURE_MESSAGE, { cause });
    this.name = "ReferenceCompositeError";
  }
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new TypeError(`${label} must be a positive integer.`);
  return number;
}

function checkedPixels(image) {
  const width = positiveInteger(image?.width ?? image?.naturalWidth, "Image width");
  const height = positiveInteger(image?.height ?? image?.naturalHeight, "Image height");
  const data = image?.data ?? image?.pixels;
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray) || data.length !== width * height * 4) {
    throw new TypeError("Decoded image must contain width × height RGBA pixels.");
  }
  return { width, height, data };
}

function createCanvas(width, height) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error("Canvas is unavailable.");
}

function canvasContext(canvas) {
  const context = canvas.getContext?.("2d", { alpha: false, willReadFrequently: true });
  if (!context) throw new Error("2D Canvas is unavailable.");
  return context;
}

async function defaultDecodeImage(source) {
  const direct = source?.image ?? source?.pixels;
  if (direct?.data || direct?.pixels) return checkedPixels(direct);
  const payload = source?.imageBitmap
    ?? source?.blob
    ?? source?.dataUrl
    ?? source?.data
    ?? source?.image
    ?? source?.aiTransport?.transportDataUrl;
  if (payload?.data && Number.isFinite(payload.width) && Number.isFinite(payload.height)) return checkedPixels(payload);
  let drawable = payload;
  let ownedDrawable = false;
  if (typeof payload === "string") {
    if (typeof fetch !== "function") throw new Error("Image data URL decoding is unavailable.");
    drawable = await (await fetch(payload)).blob();
  }
  if (typeof Blob === "function" && drawable instanceof Blob) {
    if (typeof createImageBitmap !== "function") throw new Error("ImageBitmap decoding is unavailable.");
    drawable = await createImageBitmap(drawable);
    ownedDrawable = true;
  }
  const width = positiveInteger(drawable?.width ?? drawable?.naturalWidth, "Image width");
  const height = positiveInteger(drawable?.height ?? drawable?.naturalHeight, "Image height");
  return { width, height, drawable, ownedDrawable };
}

async function blobToDataUrl(blob) {
  if (typeof FileReader !== "function") return blob;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Composite encoding failed."));
    reader.readAsDataURL(blob);
  });
}

async function defaultEncodeImage(image) {
  const canvas = image.canvas || createCanvas(image.width, image.height);
  if (!image.canvas) {
    const context = canvasContext(canvas);
    const frame = context.createImageData(image.width, image.height);
    frame.data.set(image.data);
    context.putImageData(frame, 0, 0);
  }
  if (typeof canvas.convertToBlob === "function") return blobToDataUrl(await canvas.convertToBlob({ type: "image/png" }));
  if (typeof canvas.toDataURL === "function") return canvas.toDataURL("image/png");
  throw new Error("PNG encoding is unavailable.");
}

function layout(decoded, orientation) {
  const horizontal = orientation === "horizontal";
  const width = horizontal ? decoded.reduce((sum, item) => sum + item.width, 0) : Math.max(...decoded.map((item) => item.width));
  const height = horizontal ? Math.max(...decoded.map((item) => item.height)) : decoded.reduce((sum, item) => sum + item.height, 0);
  let offset = 0;
  const rects = decoded.map((item, order) => {
    const rect = { sourceId: item.sourceId, order, x: horizontal ? offset : 0, y: horizontal ? 0 : offset, width: item.width, height: item.height };
    offset += horizontal ? item.width : item.height;
    return rect;
  });
  return { width, height, rects };
}

function scaledLayout(initial, maxLongEdge) {
  const bound = Number(maxLongEdge);
  const scale = Number.isFinite(bound) && bound > 0 ? Math.min(1, bound / Math.max(initial.width, initial.height)) : 1;
  const width = Math.max(1, Math.round(initial.width * scale));
  const height = Math.max(1, Math.round(initial.height * scale));
  const sourceRects = initial.rects.map((rect) => {
    const x = Math.round(rect.x * scale);
    const y = Math.round(rect.y * scale);
    return {
      ...rect,
      x,
      y,
      width: Math.round((rect.x + rect.width) * scale) - x,
      height: Math.round((rect.y + rect.height) * scale) - y,
    };
  });
  return { width, height, sourceRects, scale };
}

function defaultYieldControl() {
  if (typeof scheduler !== "undefined" && typeof scheduler.yield === "function") return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function stitchBoundedPixels(decoded, completed, yieldControl) {
  const pixels = new Uint8ClampedArray(completed.width * completed.height * 4);
  pixels.fill(255);
  const shouldYield = completed.width * completed.height > 1_000_000;
  let completedRows = 0;
  for (const [sourceIndex, source] of decoded.entries()) {
    const rect = completed.sourceRects[sourceIndex];
    for (let y = 0; y < rect.height; y += 1) {
      const sourceY = Math.min(source.height - 1, Math.floor(y * source.height / rect.height));
      for (let x = 0; x < rect.width; x += 1) {
        const sourceX = Math.min(source.width - 1, Math.floor(x * source.width / rect.width));
        const sourceOffset = (sourceY * source.width + sourceX) * 4;
        const targetOffset = ((rect.y + y) * completed.width + rect.x + x) * 4;
        const alpha = source.data[sourceOffset + 3] / 255;
        pixels[targetOffset] = Math.round(source.data[sourceOffset] * alpha + 255 * (1 - alpha));
        pixels[targetOffset + 1] = Math.round(source.data[sourceOffset + 1] * alpha + 255 * (1 - alpha));
        pixels[targetOffset + 2] = Math.round(source.data[sourceOffset + 2] * alpha + 255 * (1 - alpha));
        pixels[targetOffset + 3] = 255;
      }
      completedRows += 1;
      if (shouldYield && completedRows % 64 === 0) await yieldControl();
    }
  }
  return { ...completed, pixels, canvas: null };
}

async function stitchBrowserCanvas(decoded, completed, yieldControl) {
  const canvas = createCanvas(completed.width, completed.height);
  const context = canvasContext(canvas);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, completed.width, completed.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  for (const [index, source] of decoded.entries()) {
    const rect = completed.sourceRects[index];
    context.drawImage(source.drawable, rect.x, rect.y, rect.width, rect.height);
    if (source.ownedDrawable) source.drawable.close?.();
  }
  await yieldControl();
  const pixels = context.getImageData(0, 0, completed.width, completed.height).data;
  return { ...completed, pixels, canvas };
}

async function pixelHash(width, height, pixels) {
  if (!globalThis.crypto?.subtle) throw new Error("SHA-256 is unavailable.");
  const header = new TextEncoder().encode(`${width}x${height}:`);
  const bytes = new Uint8Array(header.length + pixels.byteLength);
  bytes.set(header);
  bytes.set(pixels, header.length);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return `sha256:${[...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function moveReferenceOrder(order, sourceId, direction) {
  const next = Array.isArray(order) ? [...order] : [];
  const index = next.indexOf(sourceId);
  const delta = direction === "earlier" ? -1 : direction === "later" ? 1 : 0;
  const destination = index + delta;
  if (index < 0 || delta === 0 || destination < 0 || destination >= next.length) return next;
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}

export async function composeReferenceImages({
  sources = [],
  orientation = "horizontal",
  maxLongEdge = Infinity,
  decodeImage = defaultDecodeImage,
  encodeImage = null,
  yieldControl = defaultYieldControl,
} = {}) {
  try {
    if (!Array.isArray(sources) || sources.length === 0) throw new TypeError("At least one input source is required.");
    if (orientation !== "horizontal" && orientation !== "vertical") throw new TypeError("Invalid composite orientation.");
    const sourceIds = sources.map((source, index) => String(source?.id ?? `source-${index + 1}`));
    if (new Set(sourceIds).size !== sourceIds.length) throw new TypeError("Composite source ids must be unique.");
    if (sources.some((source) => source?.referenceRole === "STYLE_REFERENCE")) throw new TypeError("Style references cannot enter the structural composite.");
    const decoded = await Promise.all(sources.map(async (source, index) => {
      const value = await decodeImage(source);
      const normalized = value?.data || value?.pixels
        ? checkedPixels(value)
        : {
          width: positiveInteger(value?.width ?? value?.naturalWidth, "Image width"),
          height: positiveInteger(value?.height ?? value?.naturalHeight, "Image height"),
          drawable: value?.drawable ?? value,
          ownedDrawable: value?.ownedDrawable === true,
        };
      return { ...normalized, sourceId: sourceIds[index] };
    }));
    const initial = layout(decoded, orientation);
    const target = scaledLayout(initial, maxLongEdge);
    const completed = decoded.every((source) => source.drawable)
      ? await stitchBrowserCanvas(decoded, target, yieldControl)
      : await stitchBoundedPixels(decoded, target, yieldControl);
    const browserCanEncode = typeof OffscreenCanvas === "function"
      || (typeof document !== "undefined" && typeof document.createElement === "function");
    const encoder = encodeImage || (browserCanEncode ? defaultEncodeImage : null);
    const encoded = encoder
      ? await encoder({ width: completed.width, height: completed.height, data: completed.pixels, canvas: completed.canvas })
      : null;
    const dataUrl = typeof encoded === "string" ? encoded : null;
    const blob = typeof Blob === "function" && encoded instanceof Blob ? encoded : null;
    const sourceOrder = completed.sourceRects.map((rect) => rect.sourceId);
    const result = {
      version: REFERENCE_COMPOSITE_VERSION,
      id: "reference-composite",
      name: "연결 원본.png",
      kind: "reference",
      referenceRole: "INPUT_SOURCE",
      orientation,
      sourceOrder,
      sourceRects: completed.sourceRects,
      sourceRectMap: Object.fromEntries(completed.sourceRects.map((rect) => [rect.sourceId, { ...rect }])),
      width: completed.width,
      height: completed.height,
      scale: completed.scale,
      pixels: completed.pixels,
      data: dataUrl,
      dataUrl,
      blob,
      compositeHash: await pixelHash(completed.width, completed.height, completed.pixels),
    };
    result.comments = mapReferenceCommentsToComposite(sources, result);
    return result;
  } catch (error) {
    if (error instanceof ReferenceCompositeError) throw error;
    throw new ReferenceCompositeError(error);
  }
}

function percentGeometry(comment, source) {
  const declared = String(comment?.coordinateSpace || comment?.unit || "percent").toLowerCase();
  const sourceWidth = Number(comment?.sourceWidth || comment?.imageWidth || source.width);
  const sourceHeight = Number(comment?.sourceHeight || comment?.imageHeight || source.height);
  const pixelUnit = ["pixel", "pixels", "px", "image-pixels"].includes(declared);
  const fractionUnit = ["fraction", "normalized", "ratio", "0..1"].includes(declared);
  const x = Number(comment?.x);
  const y = Number(comment?.y);
  const factorX = pixelUnit ? 100 / sourceWidth : fractionUnit ? 100 : 1;
  const factorY = pixelUnit ? 100 / sourceHeight : fractionUnit ? 100 : 1;
  return { x: x * factorX, y: y * factorY, w: Number(comment?.w ?? comment?.width) * factorX, h: Number(comment?.h ?? comment?.height) * factorY };
}

export function mapReferenceCommentsToComposite(sources = [], composite) {
  const width = Number(composite?.width);
  const height = Number(composite?.height);
  if (!(width > 0 && height > 0)) return [];
  const rects = composite.sourceRectMap || Object.fromEntries((composite.sourceRects || []).map((rect) => [rect.sourceId, rect]));
  const mapped = [];
  for (const source of sources || []) {
    const sourceId = String(source?.id ?? "");
    const rect = rects[sourceId];
    if (!rect) continue;
    for (const comment of source.comments || []) {
      const text = String(comment?.text || "").trim();
      const geometry = percentGeometry(comment, source);
      const area = comment?.type === "area";
      if (!text || !Number.isFinite(geometry.x) || !Number.isFinite(geometry.y)
        || geometry.x < 0 || geometry.y < 0 || geometry.x > 100 || geometry.y > 100
        || (area && (!(geometry.w > 0) || !(geometry.h > 0)
          || geometry.x + geometry.w > 100 || geometry.y + geometry.h > 100))) continue;
      const next = {
        ...comment,
        x: (rect.x + rect.width * geometry.x / 100) * 100 / width,
        y: (rect.y + rect.height * geometry.y / 100) * 100 / height,
        text,
        sourceId,
        coordinateSpace: "percent",
      };
      delete next.unit;
      delete next.sourceWidth;
      delete next.sourceHeight;
      delete next.imageWidth;
      delete next.imageHeight;
      if (area) {
        next.w = rect.width * geometry.w / width;
        next.h = rect.height * geometry.h / height;
        delete next.width;
        delete next.height;
      } else {
        delete next.w;
        delete next.h;
        delete next.width;
        delete next.height;
      }
      mapped.push(next);
    }
  }
  return mapped;
}

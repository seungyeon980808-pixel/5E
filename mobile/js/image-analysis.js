import { vectorizeImage } from "./image-vectorize.js?v=1.4.0";

export const MAX_PROCESS_DIMENSION = 2000;
export const MAX_DENSE_INK_RATIO = 0.55;

function analysisError(code, message, detail = {}) {
  const error = new Error(message);
  error.name = "ImageAnalysisError";
  error.code = code;
  Object.assign(error, detail);
  return error;
}

function imageBytes(data) {
  if (data instanceof Uint8ClampedArray) return data;
  if (data instanceof Uint8Array) return new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return new Uint8ClampedArray(data);
  throw analysisError("INVALID_BUFFER", "Image pixels must be an RGBA byte buffer.");
}

export function inspectImageData({ width, height, data }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw analysisError("INVALID_DIMENSIONS", "Image dimensions must be positive integers.");
  }
  if (width > MAX_PROCESS_DIMENSION || height > MAX_PROCESS_DIMENSION) {
    throw analysisError(
      "IMAGE_TOO_LARGE",
      `Processed image dimensions must not exceed ${MAX_PROCESS_DIMENSION}px.`,
      { width, height },
    );
  }
  const bytes = imageBytes(data);
  const expectedLength = width * height * 4;
  if (bytes.byteLength !== expectedLength) {
    throw analysisError("INVALID_BUFFER", `Expected ${expectedLength} RGBA bytes, received ${bytes.byteLength}.`);
  }

  let ink = 0;
  let opaque = 0;
  for (let index = 0; index < bytes.length; index += 4) {
    if (bytes[index + 3] < 16) continue;
    opaque += 1;
    const luminance = (0.299 * bytes[index]) + (0.587 * bytes[index + 1]) + (0.114 * bytes[index + 2]);
    if (luminance < 128) ink += 1;
  }
  const inkRatio = opaque ? ink / opaque : 0;
  if (inkRatio > MAX_DENSE_INK_RATIO) {
    throw analysisError(
      "DENSE_INK",
      `Dark image area is too high (${Math.round(inkRatio * 100)}%).`,
      { inkRatio },
    );
  }
  return { bytes, inkRatio };
}

export function analyzeImageData({ width, height, data, options = {} }) {
  const { bytes, inkRatio } = inspectImageData({ width, height, data });
  return {
    result: vectorizeImage({ width, height, data: bytes }, options),
    inkRatio,
  };
}


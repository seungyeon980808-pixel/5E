/**
 * Byte-exact RGBA scoped-edit primitives.
 * These functions operate only on typed arrays; PNG encoding/decoding is intentionally out of scope.
 */
export const AI_SCOPED_EDIT_VERSION = '1.0.0';

function isByteArray(value) {
  return value instanceof Uint8Array || value instanceof Uint8ClampedArray;
}

function checkedPixelCount(width, height, label) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new TypeError(`${label} width and height must be positive safe integers.`);
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || !Number.isSafeInteger(pixels * 4)) {
    throw new RangeError(`${label} dimensions are too large.`);
  }
  return pixels;
}

/** Validates { width, height, data } without copying or modifying it. */
export function validateRgbaImage(image, label = 'image') {
  if (!image || typeof image !== 'object' || Array.isArray(image)) {
    throw new TypeError(`${label} must be an object with width, height, and data.`);
  }
  const pixels = checkedPixelCount(image.width, image.height, label);
  if (!isByteArray(image.data) || image.data.length !== pixels * 4) {
    throw new TypeError(`${label}.data must be a Uint8Array or Uint8ClampedArray of exactly width * height * 4 bytes.`);
  }
  return { width: image.width, height: image.height, data: image.data, pixelCount: pixels };
}

/** Validates a raw, explicit one-byte-per-pixel binary mask. */
export function validateBinaryMask(mask, width, height) {
  const pixels = checkedPixelCount(width, height, 'mask');
  if (!isByteArray(mask) || mask.length !== pixels) {
    throw new TypeError('mask must be a Uint8Array or Uint8ClampedArray of exactly width * height bytes.');
  }
  for (let i = 0; i < pixels; i += 1) {
    if (mask[i] !== 0 && mask[i] !== 1) throw new RangeError('mask values must be exactly 0 or 1.');
  }
  return mask;
}

function validatePair(original, candidate) {
  const source = validateRgbaImage(original, 'original');
  const proposal = validateRgbaImage(candidate, 'candidate');
  if (source.width !== proposal.width || source.height !== proposal.height) {
    throw new RangeError('original and candidate dimensions must match exactly.');
  }
  if (source.data.constructor !== proposal.data.constructor) {
    throw new TypeError('original and candidate data must use the same typed-array type.');
  }
  return { source, proposal };
}

/**
 * Returns a new typed array of the original's exact type. Only mask value 1 selects candidate RGBA bytes.
 * Inputs may share ArrayBuffers: output is allocated before any reads and inputs are never written.
 */
export function compositeRgbaWithinMask(original, candidate, mask) {
  const { source, proposal } = validatePair(original, candidate);
  validateBinaryMask(mask, source.width, source.height);
  const output = new source.data.constructor(source.data.length);
  for (let pixel = 0; pixel < source.pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const selected = mask[pixel] === 1 ? proposal.data : source.data;
    output[offset] = selected[offset];
    output[offset + 1] = selected[offset + 1];
    output[offset + 2] = selected[offset + 2];
    output[offset + 3] = selected[offset + 3];
  }
  return output;
}

/** True only when every RGBA channel outside mask value 1 is byte-identical. */
export function isRgbaOutsideMaskUnchanged(original, result, mask) {
  const { source, proposal: checkedResult } = validatePair(original, result);
  validateBinaryMask(mask, source.width, source.height);
  for (let pixel = 0; pixel < source.pixelCount; pixel += 1) {
    if (mask[pixel] !== 0) continue;
    const offset = pixel * 4;
    if (source.data[offset] !== checkedResult.data[offset]
      || source.data[offset + 1] !== checkedResult.data[offset + 1]
      || source.data[offset + 2] !== checkedResult.data[offset + 2]
      || source.data[offset + 3] !== checkedResult.data[offset + 3]) return false;
  }
  return true;
}

/**
 * Computes exact per-pixel RGBA differences, including hidden RGB under alpha 0 and partial alpha changes.
 * bounds uses half-open coordinates: { x0, y0, x1, y1 }; null means no changed pixels.
 */
export function deriveRgbaChangeMask(original, result) {
  const { source, proposal: checkedResult } = validatePair(original, result);
  const mask = new Uint8Array(source.pixelCount);
  let changedPixelCount = 0;
  let x0 = source.width, y0 = source.height, x1 = 0, y1 = 0;
  for (let pixel = 0; pixel < source.pixelCount; pixel += 1) {
    const offset = pixel * 4;
    if (source.data[offset] === checkedResult.data[offset]
      && source.data[offset + 1] === checkedResult.data[offset + 1]
      && source.data[offset + 2] === checkedResult.data[offset + 2]
      && source.data[offset + 3] === checkedResult.data[offset + 3]) continue;
    mask[pixel] = 1;
    changedPixelCount += 1;
    const x = pixel % source.width;
    const y = Math.floor(pixel / source.width);
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x + 1 > x1) x1 = x + 1;
    if (y + 1 > y1) y1 = y + 1;
  }
  return { mask, changedPixelCount, bounds: changedPixelCount ? { x0, y0, x1, y1 } : null };
}

/**
 * Creates an explicit binary mask from a non-empty, in-bounds half-open rectangle [x0, x1) × [y0, y1).
 * Coordinates are never clamped or expanded.
 */
export function rectangleToBinaryMask(width, height, rectangle) {
  const pixels = checkedPixelCount(width, height, 'rectangle');
  if (!rectangle || typeof rectangle !== 'object' || Array.isArray(rectangle)) {
    throw new TypeError('rectangle must provide x0, y0, x1, and y1.');
  }
  const { x0, y0, x1, y1 } = rectangle;
  if (![x0, y0, x1, y1].every(Number.isSafeInteger)
    || x0 < 0 || y0 < 0 || x1 > width || y1 > height || x0 >= x1 || y0 >= y1) {
    throw new RangeError('rectangle must be a non-empty in-bounds half-open range.');
  }
  const mask = new Uint8Array(pixels);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) mask[y * width + x] = 1;
  }
  return mask;
}

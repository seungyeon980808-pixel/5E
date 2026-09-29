export const IMAGE_OCR_LIMITS = Object.freeze({
  maxEncodedBytes: 64 * 1024 * 1024,
  maxRgbaBytes: 64 * 1024 * 1024,
  maxDimension: 16_384,
  maxEngineMs: 30_000,
});

function resourceError(code, message) {
  const error = new RangeError(message);
  error.code = code;
  return error;
}

function stringByteLengthThroughLimit(value, limit) {
  let bytes = 0;
  for (let index = 0; index < value.length && bytes <= limit; index += 1) {
    const first = value.charCodeAt(index);
    if (first < 0x80) bytes += 1;
    else if (first < 0x800) bytes += 2;
    else if (first >= 0xd800 && first <= 0xdbff
      && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

function checkEncodedBytes(byteLength) {
  if (byteLength > IMAGE_OCR_LIMITS.maxEncodedBytes) {
    throw resourceError(
      "IMAGE_ENCODED_TOO_LARGE",
      `OCR encoded image exceeds the ${IMAGE_OCR_LIMITS.maxEncodedBytes}-byte limit.`,
    );
  }
}

export function copyImageForEngine(image) {
  if (typeof image === "string") {
    checkEncodedBytes(stringByteLengthThroughLimit(image, IMAGE_OCR_LIMITS.maxEncodedBytes));
    return image;
  }
  if (typeof Blob === "function" && image instanceof Blob) {
    checkEncodedBytes(image.size);
    return image;
  }
  if (image instanceof ArrayBuffer) {
    checkEncodedBytes(image.byteLength);
    return image.slice(0);
  }
  if (ArrayBuffer.isView(image)) {
    checkEncodedBytes(image.byteLength);
    return new Uint8Array(image.buffer, image.byteOffset, image.byteLength).slice();
  }
  if (image && typeof image === "object" && Number.isInteger(image.width) && Number.isInteger(image.height)
    && ArrayBuffer.isView(image.data)) {
    if (image.width < 1 || image.height < 1) {
      throw new TypeError("OCR RGBA dimensions must be positive integers.");
    }
    if (image.width > IMAGE_OCR_LIMITS.maxDimension || image.height > IMAGE_OCR_LIMITS.maxDimension) {
      throw resourceError(
        "IMAGE_DIMENSIONS_TOO_LARGE",
        `OCR RGBA dimensions must not exceed ${IMAGE_OCR_LIMITS.maxDimension}px.`,
      );
    }
    const expectedBytes = image.width * image.height * 4;
    if (expectedBytes > IMAGE_OCR_LIMITS.maxRgbaBytes || image.data.byteLength > IMAGE_OCR_LIMITS.maxRgbaBytes) {
      throw resourceError(
        "IMAGE_RGBA_TOO_LARGE",
        `OCR RGBA image exceeds the ${IMAGE_OCR_LIMITS.maxRgbaBytes}-byte limit.`,
      );
    }
    if (image.data.byteLength !== expectedBytes) {
      throw new TypeError(`OCR RGBA data must contain exactly ${expectedBytes} bytes.`);
    }
    return {
      width: image.width,
      height: image.height,
      data: new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength).slice(),
    };
  }
  throw new TypeError("OCR image must be an encoded string, Blob, byte buffer, or RGBA image data.");
}

function executionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function engineDeadline(externalSignal, timeoutMs) {
  const controller = new AbortController();
  let rejectFailure;
  let closed = false;
  const failure = new Promise((_, reject) => { rejectFailure = reject; });
  const stop = error => {
    if (closed || controller.signal.aborted) return;
    // Settle the deadline first so an adapter rejecting from its abort listener
    // cannot replace the stable boundary error with an engine-specific one.
    rejectFailure(error);
    controller.abort(error);
  };
  const onExternalAbort = () => stop(executionError("ENGINE_ABORTED", "OCR engine execution was aborted."));
  if (externalSignal?.aborted) onExternalAbort();
  else externalSignal?.addEventListener?.("abort", onExternalAbort, { once: true });
  const timer = setTimeout(() => stop(executionError(
    "ENGINE_TIMEOUT",
    `OCR engine did not complete within ${timeoutMs} ms.`,
  )), timeoutMs);

  return {
    signal: controller.signal,
    run(operation) {
      if (controller.signal.aborted) return Promise.reject(controller.signal.reason);
      return Promise.race([failure, Promise.resolve().then(operation)]);
    },
    close() {
      closed = true;
      clearTimeout(timer);
      externalSignal?.removeEventListener?.("abort", onExternalAbort);
    },
  };
}

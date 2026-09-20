/* AI 참고 이미지 전송 최적화.
 *
 * 원본 data URL은 UI/캔버스용으로 절대 변경하지 않고, AI 전송에만 사용할
 * 축소 사본을 만든다. 크기 계산과 지문 생성은 DOM에 의존하지 않으므로
 * Node 단위 테스트에서도 그대로 사용할 수 있다.
 */

export const AI_IMAGE_TRANSPORT_VERSION = "ai-image-transport-v1";

export const AI_IMAGE_TRANSPORT_DEFAULTS = Object.freeze({
  maxLongEdge: 1536,
  maxPixels: 2_500_000,
  webpQuality: 0.9,
  preservePng: true,
  signatureSamples: 1024,
});

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function validDimension(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.max(1, Math.round(number)) : null;
}

/**
 * 원본 종횡비를 유지하면서 긴 변과 총 화소 제한을 모두 만족하는 크기를 계산한다.
 * 확대는 하지 않는다.
 */
export function calculateTransportDimensions(width, height, options = {}) {
  const sourceWidth = validDimension(width);
  const sourceHeight = validDimension(height);
  if (!sourceWidth || !sourceHeight) {
    throw new TypeError("Image width and height must be positive finite numbers.");
  }

  const maxLongEdge = positiveNumber(options.maxLongEdge, AI_IMAGE_TRANSPORT_DEFAULTS.maxLongEdge);
  const maxPixels = positiveNumber(options.maxPixels, AI_IMAGE_TRANSPORT_DEFAULTS.maxPixels);
  const longEdge = Math.max(sourceWidth, sourceHeight);
  const sourcePixels = sourceWidth * sourceHeight;
  const edgeScale = Math.min(1, maxLongEdge / longEdge);
  const pixelScale = Math.min(1, Math.sqrt(maxPixels / sourcePixels));
  const scale = Math.min(edgeScale, pixelScale);

  if (scale >= 1) {
    return {
      sourceWidth,
      sourceHeight,
      width: sourceWidth,
      height: sourceHeight,
      scale: 1,
      resized: false,
      limitedByLongEdge: false,
      limitedByPixels: false,
    };
  }

  // floor를 사용해 반올림 때문에 화소 제한을 다시 넘지 않게 한다.
  const targetWidth = Math.max(1, Math.floor(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.floor(sourceHeight * scale));
  return {
    sourceWidth,
    sourceHeight,
    width: targetWidth,
    height: targetHeight,
    scale,
    resized: targetWidth !== sourceWidth || targetHeight !== sourceHeight,
    limitedByLongEdge: edgeScale <= pixelScale && edgeScale < 1,
    limitedByPixels: pixelScale <= edgeScale && pixelScale < 1,
  };
}

export function shouldResizeImage(width, height, options = {}) {
  return calculateTransportDimensions(width, height, options).resized;
}

export function parseImageDataUrlMimeType(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = /^data:(image\/[a-z0-9.+-]+)(?:;[^,]*)?,/i.exec(dataUrl);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  return mimeType === "image/jpg" ? "image/jpeg" : mimeType;
}

/** data URL의 대략적인 바이너리 크기. 메모리/전송 계측용이며 디코딩하지 않는다. */
export function estimateImageDataUrlBytes(dataUrl) {
  if (typeof dataUrl !== "string") return 0;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (/;base64(?:;|$)/i.test(header)) {
    const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor(payload.length * 3 / 4) - padding);
  }
  try {
    return new TextEncoder().encode(decodeURIComponent(payload)).length;
  } catch {
    return payload.length;
  }
}

function hashStep(hash, characterCode) {
  hash ^= characterCode;
  return Math.imul(hash, 0x01000193) >>> 0;
}

/**
 * 같은 작업 안에서 중복 첨부를 거르는 용도의 안정적인 저비용 지문이다.
 * 전체 base64를 순회하지 않고 균등 표본을 두 개의 32-bit 해시에 반영한다.
 * 보안 또는 영구 파일 무결성 검증용 해시는 아니다.
 */
export function createCheapImageSignature(dataUrl, options = {}) {
  if (typeof dataUrl !== "string" || !dataUrl.length) return "imgsig-v1:empty";
  const requestedSamples = Math.round(positiveNumber(
    options.signatureSamples,
    AI_IMAGE_TRANSPORT_DEFAULTS.signatureSamples,
  ));
  const sampleCount = Math.max(32, Math.min(dataUrl.length, requestedSamples));
  let forwardHash = 0x811c9dc5;
  let reverseHash = 0x9e3779b9;

  if (sampleCount === dataUrl.length) {
    for (let index = 0; index < dataUrl.length; index += 1) {
      forwardHash = hashStep(forwardHash, dataUrl.charCodeAt(index));
      reverseHash = hashStep(reverseHash, dataUrl.charCodeAt(dataUrl.length - 1 - index));
    }
  } else {
    const last = dataUrl.length - 1;
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const index = Math.floor(sample * last / (sampleCount - 1));
      forwardHash = hashStep(forwardHash, dataUrl.charCodeAt(index));
      reverseHash = hashStep(reverseHash, dataUrl.charCodeAt(last - index));
    }
  }

  const mimeType = parseImageDataUrlMimeType(dataUrl) || "unknown";
  const hex = (number) => number.toString(16).padStart(8, "0");
  return `imgsig-v1:${mimeType}:${dataUrl.length}:${hex(forwardHash)}${hex(reverseHash)}`;
}

/**
 * 출력 형식을 정한다. 기본값에서는 PNG/선화를 손실 압축하지 않는다.
 * 사진인 PNG를 WebP로 보내려면 contentKind: "photo", preservePng: false를 준다.
 */
export function selectTransportMimeType(sourceMimeType, options = {}) {
  const source = String(sourceMimeType || "").toLowerCase();
  const contentKind = String(options.contentKind || "auto").toLowerCase();
  const preservePng = options.preservePng !== false;
  const preferWebp = options.preferWebp !== false;
  const isLineArt = contentKind === "line-art" || contentKind === "lineart"
    || contentKind === "diagram" || contentKind === "drawing";

  if (isLineArt) return "image/png";
  if (source === "image/png" && preservePng) return "image/png";

  const isPhotoLike = contentKind === "photo" || contentKind === "capture"
    || source === "image/jpeg" || source === "image/webp";
  if (isPhotoLike && preferWebp) return "image/webp";
  if (source === "image/png" || source === "image/jpeg" || source === "image/webp") return source;
  return "image/png";
}

function makeResult(originalDataUrl, {
  transportDataUrl = originalDataUrl,
  sourceMimeType = parseImageDataUrlMimeType(originalDataUrl),
  transportMimeType = parseImageDataUrlMimeType(transportDataUrl) || sourceMimeType,
  sourceWidth = null,
  sourceHeight = null,
  width = sourceWidth,
  height = sourceHeight,
  resized = false,
  reencoded = false,
  usedFallback = false,
  reason = "unchanged",
  error = null,
} = {}) {
  return {
    // originalDataUrl은 UI/캔버스에서 계속 사용하는 불변 원본이다.
    originalDataUrl,
    // transportDataUrl만 IPC/AI 첨부에 사용한다.
    transportDataUrl,
    sourceMimeType,
    transportMimeType,
    sourceWidth,
    sourceHeight,
    width,
    height,
    resized,
    reencoded,
    usedFallback,
    reason,
    error,
    sourceBytes: estimateImageDataUrlBytes(originalDataUrl),
    transportBytes: estimateImageDataUrlBytes(transportDataUrl),
    sourceSignature: createCheapImageSignature(originalDataUrl),
    transportSignature: createCheapImageSignature(transportDataUrl),
  };
}

function loadBrowserImage(dataUrl) {
  return new Promise((resolve, reject) => {
    if (typeof Image !== "function") {
      reject(new Error("Browser Image API is unavailable."));
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image data URL could not be decoded."));
    image.src = dataUrl;
  });
}

function createBrowserCanvas(width, height) {
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    throw new Error("Browser Canvas API is unavailable.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * 브라우저 Canvas를 사용해 AI 전송 사본을 만든다.
 * 디코딩/Canvas/인코딩 실패는 모두 원본 fallback 결과로 반환한다.
 */
export async function prepareAIImageForTransport(originalDataUrl, options = {}) {
  const sourceMimeType = parseImageDataUrlMimeType(originalDataUrl);
  if (!sourceMimeType) {
    return makeResult(originalDataUrl, {
      sourceMimeType: null,
      transportMimeType: null,
      usedFallback: true,
      reason: "invalid-source",
      error: "Expected an image data URL.",
    });
  }

  let image = null;
  let sourceWidth = validDimension(options.width ?? options.sourceWidth);
  let sourceHeight = validDimension(options.height ?? options.sourceHeight);

  try {
    if (!sourceWidth || !sourceHeight) {
      image = await loadBrowserImage(originalDataUrl);
      sourceWidth = validDimension(image.naturalWidth || image.width);
      sourceHeight = validDimension(image.naturalHeight || image.height);
    }
    if (!sourceWidth || !sourceHeight) throw new Error("Decoded image has invalid dimensions.");

    const dimensions = calculateTransportDimensions(sourceWidth, sourceHeight, options);
    const mustReencode = options.forceReencode === true || sourceMimeType === "image/svg+xml";
    if (!dimensions.resized && !mustReencode) {
      return makeResult(originalDataUrl, {
        sourceMimeType,
        sourceWidth,
        sourceHeight,
        width: sourceWidth,
        height: sourceHeight,
        reason: "unchanged-small-image",
      });
    }

    // 너비/높이만 전달받은 경우 실제 픽셀을 그릴 때 한 번만 decode한다.
    if (!image) image = await loadBrowserImage(originalDataUrl);
    const canvas = createBrowserCanvas(dimensions.width, dimensions.height);
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("2D Canvas context is unavailable.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.clearRect(0, 0, dimensions.width, dimensions.height);
    context.drawImage(image, 0, 0, dimensions.width, dimensions.height);

    const requestedMimeType = selectTransportMimeType(sourceMimeType, options);
    const webpQuality = Math.max(0, Math.min(1, positiveNumber(
      options.webpQuality,
      AI_IMAGE_TRANSPORT_DEFAULTS.webpQuality,
    )));
    let transportDataUrl = canvas.toDataURL(requestedMimeType, webpQuality);
    let actualMimeType = parseImageDataUrlMimeType(transportDataUrl);

    // WebP 미지원 브라우저는 PNG를 돌려줄 수 있다. 사진은 JPEG를 두 번째 선택으로 쓴다.
    if (requestedMimeType === "image/webp" && actualMimeType !== "image/webp"
      && sourceMimeType === "image/jpeg") {
      transportDataUrl = canvas.toDataURL("image/jpeg", webpQuality);
      actualMimeType = parseImageDataUrlMimeType(transportDataUrl);
    }
    if (!actualMimeType) throw new Error("Canvas returned an invalid image data URL.");

    return makeResult(originalDataUrl, {
      transportDataUrl,
      sourceMimeType,
      transportMimeType: actualMimeType,
      sourceWidth,
      sourceHeight,
      width: dimensions.width,
      height: dimensions.height,
      resized: dimensions.resized,
      reencoded: transportDataUrl !== originalDataUrl,
      reason: mustReencode && !dimensions.resized ? "rasterized-for-transport" : "optimized",
    });
  } catch (error) {
    return makeResult(originalDataUrl, {
      sourceMimeType,
      sourceWidth,
      sourceHeight,
      width: sourceWidth,
      height: sourceHeight,
      usedFallback: true,
      reason: "original-fallback",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

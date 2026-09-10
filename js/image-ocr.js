import {
  IMAGE_OCR_LIMITS,
  copyImageForEngine,
  engineDeadline,
} from "./image-ocr-boundary.js";

/**
 * Isolated OCR suggestion boundary. It has no engine dependency and never
 * mutates application state or authorizes replacing the source image.
 */
export const IMAGE_OCR_EXPERIMENT_VERSION = "0.1.0";

const MODES = new Set(["off", "suggest"]);
const LANGUAGES = new Set(["kor", "kor+eng"]);

function elapsedMilliseconds(startedAt, now) {
  return Math.max(0, Number((now() - startedAt).toFixed(3)));
}

function resultBase(options, engineId, elapsedMs = 0) {
  return {
    version: IMAGE_OCR_EXPERIMENT_VERSION,
    mode: options.mode,
    language: options.language,
    preserveOriginal: true,
    originalPreserved: true,
    replacementAllowed: false,
    reviewRequired: false,
    engineId,
    elapsedMs,
    suggestions: [],
  };
}

function failureResult(base, status, code, message) {
  return {
    ...base,
    status,
    error: { code, message },
  };
}

function engineIdentifier(engine) {
  const value = typeof engine === "function" ? engine.engineId : engine?.id;
  return typeof value === "string" && value.trim() ? value.trim() : "unavailable";
}

function normalizedRecognition(value) {
  if (typeof value === "string") return { text: value, confidence: null, uncertain: true };
  if (!value || typeof value !== "object" || typeof value.text !== "string") {
    throw new TypeError("OCR engine returned an invalid recognition result.");
  }
  const confidence = Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 100
    ? value.confidence
    : null;
  return {
    text: value.text,
    confidence,
    // Unknown certainty fails closed. Even explicit certainty still requires review.
    uncertain: value.uncertain !== false,
  };
}

function publicError(error, fallbackCode, fallbackMessage) {
  const code = typeof error?.code === "string" && error.code.trim() ? error.code.trim() : fallbackCode;
  const message = typeof error?.message === "string" && error.message.trim() ? error.message.trim() : fallbackMessage;
  return { code, message };
}

export function normalizeImageOcrOptions(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("OCR options must be an object.");
  }
  const mode = options.mode ?? "off";
  const language = options.language ?? "kor";
  const preserveOriginal = options.preserveOriginal ?? true;
  if (!MODES.has(mode)) throw new RangeError(`Unsupported OCR mode: ${String(mode)}`);
  if (!LANGUAGES.has(language)) throw new RangeError(`Unsupported OCR language: ${String(language)}`);
  if (preserveOriginal !== true) throw new RangeError("OCR preserveOriginal must be true.");
  return Object.freeze({ mode, language, preserveOriginal: true });
}

/**
 * Runs an injected OCR adapter and returns review-only suggestions.
 *
 * Engine contract:
 *   { id, available?: boolean|({ signal }) => boolean|Promise<boolean>,
 *     recognize(imageCopy, { language, signal }): Promise<{text, confidence?, uncertain?}> }
 * A function can be supplied directly as the engine for small adapters.
 * `timeoutMs` may lower, but never raise, IMAGE_OCR_LIMITS.maxEngineMs.
 */
export async function suggestImageText(image, options = {}, dependencies = {}) {
  const normalizedOptions = normalizeImageOcrOptions(options);
  if (normalizedOptions.mode === "off") {
    return { ...resultBase(normalizedOptions, "unavailable"), status: "off" };
  }

  const {
    engine = null,
    signal,
    now = () => performance.now(),
    timeoutMs = IMAGE_OCR_LIMITS.maxEngineMs,
  } = dependencies;
  const engineId = engineIdentifier(engine);
  const startedAt = now();
  const base = () => resultBase(normalizedOptions, engineId, elapsedMilliseconds(startedAt, now));
  const recognize = typeof engine === "function" ? engine : engine?.recognize?.bind(engine);
  if (!recognize) {
    return failureResult(base(), "unavailable", "ENGINE_UNAVAILABLE", "No OCR engine is available.");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > IMAGE_OCR_LIMITS.maxEngineMs) {
    return failureResult(
      base(),
      "failed",
      "INVALID_TIMEOUT",
      `OCR timeoutMs must be an integer from 1 to ${IMAGE_OCR_LIMITS.maxEngineMs}.`,
    );
  }

  let imageCopy;
  try {
    imageCopy = copyImageForEngine(image);
  } catch (error) {
    const detail = publicError(error, "INVALID_IMAGE", "The OCR image is invalid.");
    return failureResult(base(), "failed", detail.code, detail.message);
  }

  const deadline = engineDeadline(signal, timeoutMs);
  try {
    try {
      const availability = typeof engine?.available === "function"
        ? await deadline.run(() => engine.available({ signal: deadline.signal }))
        : engine?.available;
      if (availability === false) {
        return failureResult(base(), "unavailable", "ENGINE_UNAVAILABLE", "The OCR engine is unavailable.");
      }
    } catch (error) {
      const detail = publicError(error, "ENGINE_UNAVAILABLE", "The OCR engine availability check failed.");
      return failureResult(base(), "unavailable", detail.code, detail.message);
    }

    try {
      const recognition = normalizedRecognition(await deadline.run(() => recognize(imageCopy, {
        language: normalizedOptions.language,
        signal: deadline.signal,
      })));
      const text = recognition.text.replace(/\r\n?/g, "\n").trim();
      if (!text) {
        return failureResult(base(), "no-text", "NO_TEXT", "The OCR engine returned no text.");
      }
      return {
        ...base(),
        status: "suggested",
        reviewRequired: true,
        suggestions: [{
          text,
          confidence: recognition.confidence,
          uncertain: recognition.uncertain,
        }],
      };
    } catch (error) {
      const detail = publicError(error, "RECOGNITION_FAILED", "OCR recognition failed.");
      return failureResult(base(), "failed", detail.code, detail.message);
    }
  } finally {
    deadline.close();
  }
}

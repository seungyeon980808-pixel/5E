import assert from "node:assert/strict";
import test from "node:test";

import { IMAGE_OCR_LIMITS } from "../js/image-ocr-boundary.js";
import {
  IMAGE_OCR_EXPERIMENT_VERSION,
  normalizeImageOcrOptions,
  suggestImageText,
} from "../js/image-ocr.js";
import { normalizeOcrText, scoreOcrText } from "../experiments/image-ocr/metrics.mjs";
import {
  assertFixedOcrFixtures,
  assertGeneratedOcrFixtures,
} from "./helpers/image-ocr-fixture-assertions.mjs";

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("OCR options default to off, Korean, and original preservation", () => {
  const options = normalizeImageOcrOptions();
  assert.deepEqual(options, { mode: "off", language: "kor", preserveOriginal: true });
  assert.equal(Object.isFrozen(options), true);
});

test("unsupported OCR modes, languages, and source replacement are rejected", () => {
  assert.throws(() => normalizeImageOcrOptions({ mode: "replace" }), RangeError);
  assert.throws(() => normalizeImageOcrOptions({ language: "eng" }), RangeError);
  assert.throws(() => normalizeImageOcrOptions({ preserveOriginal: false }), RangeError);
  assert.throws(() => normalizeImageOcrOptions([]), TypeError);
});

test("off mode does not inspect the image, engine, clock, signal, or timeout", async () => {
  let inspections = 0;
  const inaccessible = new Proxy({}, {
    get() {
      inspections += 1;
      throw new Error("off mode inspected an inactive dependency");
    },
  });
  const result = await suggestImageText(inaccessible, {}, inaccessible);
  assert.equal(inspections, 0);
  assert.deepEqual(result, {
    version: IMAGE_OCR_EXPERIMENT_VERSION,
    mode: "off",
    language: "kor",
    preserveOriginal: true,
    originalPreserved: true,
    replacementAllowed: false,
    reviewRequired: false,
    engineId: "unavailable",
    elapsedMs: 0,
    suggestions: [],
    status: "off",
  });
});

test("suggest mode gives an engine a byte copy and only returns review-required evidence", async () => {
  const original = Uint8Array.of(137, 80, 78, 71);
  const engine = {
    id: "fixture-engine",
    available: true,
    async recognize(image, request) {
      assert.notEqual(image.buffer, original.buffer);
      assert.equal(request.language, "kor+eng");
      image[0] = 0;
      return { text: "  속력 12 m/s²\r\n", confidence: 99, uncertain: false };
    },
  };
  let tick = 10;
  const result = await suggestImageText(original, {
    mode: "suggest", language: "kor+eng", preserveOriginal: true,
  }, { engine, now: () => tick++ });

  assert.deepEqual(original, Uint8Array.of(137, 80, 78, 71));
  assert.equal(result.status, "suggested");
  assert.equal(result.originalPreserved, true);
  assert.equal(result.replacementAllowed, false);
  assert.equal(result.reviewRequired, true);
  assert.deepEqual(result.suggestions, [{ text: "속력 12 m/s²", confidence: 99, uncertain: false }]);
});

test("RGBA input data is copied before recognition", async () => {
  const source = { width: 1, height: 1, data: Uint8ClampedArray.of(1, 2, 3, 4) };
  const result = await suggestImageText(source, { mode: "suggest" }, {
    engine: async image => {
      image.data.fill(255);
      return { text: "가", confidence: 80 };
    },
  });
  assert.deepEqual(source.data, Uint8ClampedArray.of(1, 2, 3, 4));
  assert.equal(result.suggestions[0].uncertain, true);
});

test("suggest mode rejects encoded bytes, RGBA bytes, and dimensions above fixed limits", async () => {
  class OversizedBlob extends Blob {
    get size() { return IMAGE_OCR_LIMITS.maxEncodedBytes + 1; }
  }
  const rgbaHeightOverLimit = Math.floor(
    IMAGE_OCR_LIMITS.maxRgbaBytes / (IMAGE_OCR_LIMITS.maxDimension * 4),
  ) + 1;
  const cases = [
    [new OversizedBlob(), "IMAGE_ENCODED_TOO_LARGE"],
    [{
      width: IMAGE_OCR_LIMITS.maxDimension + 1,
      height: 1,
      data: Uint8ClampedArray.of(1, 2, 3, 4),
    }, "IMAGE_DIMENSIONS_TOO_LARGE"],
    [{
      width: IMAGE_OCR_LIMITS.maxDimension,
      height: rgbaHeightOverLimit,
      data: Uint8ClampedArray.of(1, 2, 3, 4),
    }, "IMAGE_RGBA_TOO_LARGE"],
    [{ width: 1, height: 1, data: Uint8ClampedArray.of(1, 2, 3) }, "INVALID_IMAGE"],
  ];
  let engineCalls = 0;
  for (const [image, code] of cases) {
    const result = await suggestImageText(image, { mode: "suggest" }, {
      engine: async () => { engineCalls += 1; return "should not run"; },
    });
    assert.equal(result.status, "failed");
    assert.equal(result.error.code, code);
    assert.equal(result.originalPreserved, true);
    assert.equal(result.replacementAllowed, false);
    assert.deepEqual(result.suggestions, []);
  }
  assert.equal(engineCalls, 0);
});

test("the engine deadline aborts stalled recognition through its exact signal", { timeout: 1_000 }, async () => {
  const aborted = deferred();
  const pending = suggestImageText(Uint8Array.of(1), { mode: "suggest" }, {
    timeoutMs: 10,
    engine: (_image, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        aborted.resolve(signal.reason);
        reject(signal.reason);
      }, { once: true });
    }),
  });

  const [result, reason] = await Promise.all([pending, aborted.promise]);
  assert.equal(reason.code, "ENGINE_TIMEOUT");
  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "ENGINE_TIMEOUT");
  assert.equal(result.originalPreserved, true);
  assert.equal(result.replacementAllowed, false);
  assert.deepEqual(result.suggestions, []);
});

test("the same deadline bounds asynchronous availability without invoking recognition", { timeout: 1_000 }, async () => {
  const aborted = deferred();
  let recognizeCalls = 0;
  const resultPromise = suggestImageText(Uint8Array.of(1), { mode: "suggest" }, {
    timeoutMs: 10,
    engine: {
      available({ signal }) {
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted.resolve(signal.reason);
            reject(signal.reason);
          }, { once: true });
        });
      },
      recognize() { recognizeCalls += 1; },
    },
  });

  const [result, reason] = await Promise.all([resultPromise, aborted.promise]);
  assert.equal(reason.code, "ENGINE_TIMEOUT");
  assert.equal(result.status, "unavailable");
  assert.equal(result.error.code, "ENGINE_TIMEOUT");
  assert.equal(result.replacementAllowed, false);
  assert.equal(recognizeCalls, 0);
});

test("caller abort is forwarded only after recognition starts and fails closed", { timeout: 1_000 }, async () => {
  const controller = new AbortController();
  const started = deferred();
  const aborted = deferred();
  const pending = suggestImageText(Uint8Array.of(1), { mode: "suggest" }, {
    signal: controller.signal,
    engine: (_image, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        aborted.resolve(signal.reason);
        reject(signal.reason);
      }, { once: true });
      started.resolve();
    }),
  });

  await started.promise;
  controller.abort();
  const [result, reason] = await Promise.all([pending, aborted.promise]);
  assert.equal(reason.code, "ENGINE_ABORTED");
  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "ENGINE_ABORTED");
  assert.equal(result.originalPreserved, true);
  assert.equal(result.replacementAllowed, false);
});

test("unavailable, failed, malformed, and empty engines preserve the original without suggestions", async () => {
  const source = Uint8Array.of(1, 2, 3, 4);
  const cases = [
    [null, "unavailable", "ENGINE_UNAVAILABLE"],
    [{ id: "down", available: false, recognize() {} }, "unavailable", "ENGINE_UNAVAILABLE"],
    [{ id: "throws", async recognize() { throw Object.assign(new Error("offline"), { code: "NETWORK_DOWN" }); } }, "failed", "NETWORK_DOWN"],
    [{ id: "bad", async recognize() { return { confidence: 90 }; } }, "failed", "RECOGNITION_FAILED"],
    [{ id: "empty", async recognize() { return { text: " \n", confidence: 90 }; } }, "no-text", "NO_TEXT"],
  ];
  for (const [engine, status, code] of cases) {
    const result = await suggestImageText(source, { mode: "suggest" }, { engine });
    assert.equal(result.status, status);
    assert.equal(result.error.code, code);
    assert.equal(result.originalPreserved, true);
    assert.equal(result.replacementAllowed, false);
    assert.equal(result.reviewRequired, false);
    assert.deepEqual(result.suggestions, []);
    assert.deepEqual(source, Uint8Array.of(1, 2, 3, 4));
  }
});

test("OCR scoring keeps meaningful glyph distinctions while normalizing layout whitespace", () => {
  assert.equal(normalizeOcrText("  가\u1100\u1161  \r\n\n  3.0\u00a0V  "), "가가\n3.0 V");
  const exact = scoreOcrText("광합성 속도", "  광합성   속도\n");
  assert.equal(exact.exact, true);
  assert.equal(exact.characterAccuracy, 1);

  const ambiguous = scoreOcrText("O0 I1", "00 11");
  assert.equal(ambiguous.exact, false);
  assert.equal(ambiguous.editDistance, 2);
  assert.deepEqual(ambiguous.misreads.map(item => [item.operation, item.expected, item.actual]), [
    ["substitute", "O", "0"],
    ["substitute", "I", "1"],
  ]);
});

test("committed OCR fixtures cover every required condition with pinned PNG bytes", async () => {
  await assertGeneratedOcrFixtures();
});

test("fixed OCR fixtures retain literal Korean labels and blur coverage", async () => {
  await assertFixedOcrFixtures();
});

import assert from "node:assert/strict";
import {
  AI_IMAGE_TRANSPORT_DEFAULTS,
  calculateTransportDimensions,
  createCheapImageSignature,
  estimateImageDataUrlBytes,
  parseImageDataUrlMimeType,
  prepareAIImageForTransport,
  selectTransportMimeType,
  shouldResizeImage,
} from "../js/ai-image-transport.js";

const small = calculateTransportDimensions(1200, 800);
assert.deepEqual(
  { width: small.width, height: small.height, resized: small.resized },
  { width: 1200, height: 800, resized: false },
  "small images must remain byte-for-byte eligible",
);

const landscape = calculateTransportDimensions(4000, 3000);
assert.deepEqual(
  { width: landscape.width, height: landscape.height },
  { width: 1536, height: 1152 },
  "long edge must be capped while preserving aspect ratio",
);
assert.equal(landscape.limitedByLongEdge, true);
assert.equal(landscape.width * landscape.height <= AI_IMAGE_TRANSPORT_DEFAULTS.maxPixels, true);

const portrait = calculateTransportDimensions(1000, 3000);
assert.deepEqual({ width: portrait.width, height: portrait.height }, { width: 512, height: 1536 });

const pixelLimited = calculateTransportDimensions(3000, 3000, { maxLongEdge: 4000, maxPixels: 2_500_000 });
assert.equal(pixelLimited.limitedByPixels, true);
assert.equal(pixelLimited.width * pixelLimited.height <= 2_500_000, true);
assert.equal(shouldResizeImage(800, 600), false);
assert.equal(shouldResizeImage(2400, 600), true);
assert.throws(() => calculateTransportDimensions(0, 100), TypeError);

assert.equal(parseImageDataUrlMimeType("data:image/png;base64,AA=="), "image/png");
assert.equal(parseImageDataUrlMimeType("data:image/jpg;base64,AA=="), "image/jpeg");
assert.equal(parseImageDataUrlMimeType("https://example.test/image.png"), null);
assert.equal(estimateImageDataUrlBytes("data:image/png;base64,AA=="), 1);

assert.equal(selectTransportMimeType("image/png"), "image/png", "PNG must stay lossless by default");
assert.equal(selectTransportMimeType("image/jpeg", { contentKind: "photo" }), "image/webp");
assert.equal(selectTransportMimeType("image/png", { contentKind: "photo" }), "image/png");
assert.equal(
  selectTransportMimeType("image/png", { contentKind: "photo", preservePng: false }),
  "image/webp",
  "callers can explicitly optimize a photographic PNG",
);
assert.equal(selectTransportMimeType("image/jpeg", { contentKind: "line-art" }), "image/png");

const sourceA = "data:image/png;base64," + "A".repeat(5000);
const sourceACopy = `${sourceA}`;
const sourceB = "data:image/png;base64," + "B".repeat(5000);
assert.equal(createCheapImageSignature(sourceA), createCheapImageSignature(sourceACopy));
assert.notEqual(createCheapImageSignature(sourceA), createCheapImageSignature(sourceB));
assert.match(createCheapImageSignature(sourceA), /^imgsig-v1:image\/png:/);

// 알려진 작은 크기는 DOM 없이도 원본을 그대로 반환한다.
const unchanged = await prepareAIImageForTransport("data:image/png;base64,AA==", { width: 20, height: 10 });
assert.equal(unchanged.originalDataUrl, "data:image/png;base64,AA==");
assert.equal(unchanged.transportDataUrl, unchanged.originalDataUrl);
assert.equal(unchanged.usedFallback, false);
assert.equal(unchanged.reason, "unchanged-small-image");

// SVG 미리보기는 작더라도 데스크톱 localImage가 읽는 base64 래스터로 바꾼다.
const previousImage = globalThis.Image;
const previousDocument = globalThis.document;
globalThis.Image = class FakeImage {
  constructor() { this.naturalWidth = 100; this.naturalHeight = 50; }
  set src(_value) { queueMicrotask(() => this.onload?.()); }
};
globalThis.document = {
  createElement(name) {
    assert.equal(name, "canvas");
    return {
      width: 0,
      height: 0,
      getContext: () => ({
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
        clearRect() {},
        drawImage() {},
      }),
      toDataURL: () => "data:image/png;base64,U1ZH",
    };
  },
};
const svgTransport = await prepareAIImageForTransport(
  "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E",
  { width: 100, height: 50, contentKind: "line-art" },
);
assert.equal(svgTransport.transportDataUrl, "data:image/png;base64,U1ZH");
assert.equal(svgTransport.transportMimeType, "image/png");
assert.equal(svgTransport.resized, false);
assert.equal(svgTransport.reencoded, true);
assert.equal(svgTransport.reason, "rasterized-for-transport");
globalThis.Image = previousImage;
globalThis.document = previousDocument;

// Node에는 Image/Canvas가 없으므로 큰 이미지의 브라우저 처리 실패 시 원본 fallback을 검증한다.
const fallback = await prepareAIImageForTransport("data:image/png;base64,AA==", { width: 4000, height: 3000 });
assert.equal(fallback.transportDataUrl, fallback.originalDataUrl);
assert.equal(fallback.usedFallback, true);
assert.equal(fallback.reason, "original-fallback");
assert.match(fallback.error, /Image API/);

const invalid = await prepareAIImageForTransport("not-a-data-url");
assert.equal(invalid.usedFallback, true);
assert.equal(invalid.reason, "invalid-source");

console.log("AI image transport unit tests passed");

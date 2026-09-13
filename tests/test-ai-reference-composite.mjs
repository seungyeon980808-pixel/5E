import test from "node:test";
import assert from "node:assert/strict";

import {
  REFERENCE_COMPOSITE_FAILURE_MESSAGE,
  composeReferenceImages,
  mapReferenceCommentsToComposite,
} from "../js/ai-reference-composite.js";

const rgba = (...pixels) => new Uint8ClampedArray(pixels.flat());
const RED = [255, 0, 0, 255];
const GREEN = [0, 255, 0, 255];
const BLUE = [0, 0, 255, 255];
const BLACK = [0, 0, 0, 255];
const WHITE = [255, 255, 255, 255];

const sourceA = {
  id: "a",
  name: "wide",
  referenceRole: "INPUT_SOURCE",
  image: { width: 2, height: 1, data: rgba(RED, GREEN) },
  comments: [
    { id: "point", type: "point", x: 50, y: 100, text: "점" },
    { id: "area", type: "area", x: 25, y: 0, w: 50, h: 100, text: "영역" },
  ],
};
const sourceB = {
  id: "b",
  name: "tall",
  referenceRole: "INPUT_SOURCE",
  image: { width: 1, height: 2, data: rgba(BLUE, BLACK) },
};

test("horizontal stitch uses ordered unequal images with white padding and no gap", async () => {
  // Given unequal input images in the selected order.
  // When they are composed horizontally.
  const result = await composeReferenceImages({ sources: [sourceA, sourceB], orientation: "horizontal" });

  // Then pixels, bounds, and source rectangles describe one gapless canvas.
  assert.deepEqual([result.width, result.height], [3, 2]);
  assert.deepEqual([...result.pixels], [...rgba(RED, GREEN, BLUE, WHITE, WHITE, BLACK)]);
  assert.deepEqual(result.sourceRects, [
    { sourceId: "a", order: 0, x: 0, y: 0, width: 2, height: 1 },
    { sourceId: "b", order: 1, x: 2, y: 0, width: 1, height: 2 },
  ]);
});

test("vertical stitch uses ordered unequal images with white padding and no gap", async () => {
  // Given unequal input images in the selected order.
  // When they are composed vertically.
  const result = await composeReferenceImages({ sources: [sourceA, sourceB], orientation: "vertical" });

  // Then the second source starts immediately after the first.
  assert.deepEqual([result.width, result.height], [2, 3]);
  assert.deepEqual([...result.pixels], [...rgba(RED, GREEN, BLUE, WHITE, BLACK, WHITE)]);
  assert.deepEqual(result.sourceRects, [
    { sourceId: "a", order: 0, x: 0, y: 0, width: 2, height: 1 },
    { sourceId: "b", order: 1, x: 0, y: 1, width: 1, height: 2 },
  ]);
});

test("transparent source pixels are flattened onto the white composite canvas", async () => {
  // Given a transparent colored pixel.
  const transparent = { id: "transparent", image: { width: 1, height: 1, data: rgba([12, 34, 56, 0]) } };

  // When it is stitched onto the composite canvas.
  const result = await composeReferenceImages({ sources: [transparent] });

  // Then the completed structural input is opaque white.
  assert.deepEqual([...result.pixels], WHITE);
});

test("original image bytes win over a transport-resized derivative", async () => {
  // Given original pixels and a deliberately different transport derivative.
  const source = {
    id: "original-first",
    data: { width: 2, height: 1, data: rgba(RED, GREEN) },
    aiTransport: { transportDataUrl: "data:image/png;base64,transport-resized-must-not-enter-stitch" },
  };

  // When the default decoder selects the composition source.
  const result = await composeReferenceImages({ sources: [source] });

  // Then only the original dimensions and bytes enter the stitch.
  assert.deepEqual([result.width, result.height], [2, 1]);
  assert.deepEqual([...result.pixels], [...rgba(RED, GREEN)]);
});

test("one completed-composite ratio scales canvas and every source rectangle to the transport bound", async () => {
  // Given a 400 by 200 horizontal composite.
  const sources = [
    { id: "large", image: { width: 300, height: 100, data: new Uint8ClampedArray(300 * 100 * 4).fill(255) } },
    { id: "small", image: { width: 100, height: 200, data: new Uint8ClampedArray(100 * 200 * 4).fill(255) } },
  ];

  // When its completed canvas is bounded to a 200-pixel long edge.
  const result = await composeReferenceImages({ sources, orientation: "horizontal", maxLongEdge: 200 });

  // Then a single 0.5 ratio applies to the whole composite and its map.
  assert.equal(result.scale, 0.5);
  assert.deepEqual([result.width, result.height], [200, 100]);
  assert.deepEqual(result.sourceRects, [
    { sourceId: "large", order: 0, x: 0, y: 0, width: 150, height: 50 },
    { sourceId: "small", order: 1, x: 150, y: 0, width: 50, height: 100 },
  ]);
});

test("point and area comments map from original percentages into their composite sub-rectangle", async () => {
  // Given comments owned by the first source in a horizontal composite.
  const composite = await composeReferenceImages({ sources: [sourceA, sourceB], orientation: "horizontal" });

  // When original comments are projected through the source rectangle map.
  const mapped = mapReferenceCommentsToComposite([sourceA], composite);

  // Then both use composite percentage coordinates while retaining their identity.
  assert.deepEqual(mapped, [
    { id: "point", type: "point", x: 100 / 3, y: 50, text: "점", sourceId: "a", coordinateSpace: "percent" },
    { id: "area", type: "area", x: 100 / 6, y: 0, w: 100 / 3, h: 50, text: "영역", sourceId: "a", coordinateSpace: "percent" },
  ]);
});

test("empty and invalid original geometry never enters the mapped request", async () => {
  // Given empty text, an out-of-bounds point, and an overflowing area.
  const source = {
    ...sourceA,
    comments: [
      { type: "point", x: 50, y: 50, text: " " },
      { type: "point", x: 101, y: 50, text: "밖" },
      { type: "area", x: 80, y: 80, w: 30, h: 30, text: "넘침" },
    ],
  };
  const composite = await composeReferenceImages({ sources: [source] });

  // When comments are projected.
  const mapped = mapReferenceCommentsToComposite([source], composite);

  // Then none of the invalid records survives.
  assert.deepEqual(mapped, []);
});

test("decode rejection uses the exact Korean message and leaves caller-owned state byte-equal", async () => {
  // Given caller state and a decoder that rejects.
  const state = { orientation: "horizontal", order: ["a", "b"], draft: "보존", sources: [sourceA, sourceB] };
  const before = structuredClone(state);

  // When composition fails.
  await assert.rejects(
    composeReferenceImages({
      sources: state.sources,
      orientation: state.orientation,
      decodeImage: async () => { throw new Error("decode failed"); },
    }),
    (error) => error.message === REFERENCE_COMPOSITE_FAILURE_MESSAGE,
  );

  // Then caller-owned orientation, order, draft, sources, and comments are unchanged.
  assert.deepEqual(state, before);
});

test("realistic unequal PDF crops stay bounded and yield the event loop while preserving source fidelity", async () => {
  // Given two realistic unequal PDF crops with distinct opaque fills.
  const white = new Uint8ClampedArray(1600 * 2200 * 4).fill(255);
  const black = new Uint8ClampedArray(1800 * 1200 * 4);
  for (let offset = 3; offset < black.length; offset += 4) black[offset] = 255;
  const sources = [
    { id: "page-a", image: { width: 1600, height: 2200, data: white } },
    { id: "page-b", image: { width: 1800, height: 1200, data: black } },
  ];
  let timerFired = false;
  const timer = setTimeout(() => { timerFired = true; }, 0);
  const startedAt = performance.now();

  // When the completed horizontal composite is bounded to 1536 pixels.
  const result = await composeReferenceImages({ sources, orientation: "horizontal", maxLongEdge: 1536 });
  const elapsedMs = performance.now() - startedAt;
  clearTimeout(timer);

  // Then one ratio bounds memory, adjacent rectangles retain order, and work yields before completion.
  assert.equal(result.scale, 1536 / 3400);
  assert.deepEqual([result.width, result.height], [1536, 994]);
  assert.deepEqual(result.sourceRects, [
    { sourceId: "page-a", order: 0, x: 0, y: 0, width: 723, height: 994 },
    { sourceId: "page-b", order: 1, x: 723, y: 0, width: 813, height: 542 },
  ]);
  assert.deepEqual([...result.pixels.slice(0, 4)], WHITE);
  assert.deepEqual([...result.pixels.slice((1535 * 4), (1535 * 4) + 4)], BLACK);
  assert.equal(result.pixels.byteLength, 1536 * 994 * 4);
  assert.equal(timerFired, true, `composition blocked the event loop for ${elapsedMs.toFixed(1)}ms`);
  assert.equal(elapsedMs < 5000, true, `bounded composition took ${elapsedMs.toFixed(1)}ms`);
});

test("browser ImageBitmaps draw directly into one bounded final canvas before pixels are read", async () => {
  // Given decoded browser drawables and a canvas recorder.
  const originalOffscreenCanvas = globalThis.OffscreenCanvas;
  const canvases = [];
  class CanvasRecorder {
    constructor(width, height) {
      this.width = width;
      this.height = height;
      this.operations = [];
      canvases.push(this);
    }

    getContext() {
      return {
        fillRect: (...args) => this.operations.push(["fillRect", ...args]),
        drawImage: (...args) => this.operations.push(["drawImage", ...args]),
        getImageData: (...args) => {
          this.operations.push(["getImageData", ...args]);
          return { data: new Uint8ClampedArray(this.width * this.height * 4).fill(255) };
        },
      };
    }
  }
  globalThis.OffscreenCanvas = CanvasRecorder;
  const bitmapA = { width: 1600, height: 2200 };
  const bitmapB = { width: 1800, height: 1200 };

  try {
    // When default decoding receives ImageBitmap-shaped originals.
    const result = await composeReferenceImages({
      sources: [{ id: "bitmap-a", imageBitmap: bitmapA }, { id: "bitmap-b", imageBitmap: bitmapB }],
      maxLongEdge: 1536,
      encodeImage: async ({ canvas }) => {
        assert.equal(canvas, canvases[0]);
        return "data:image/png;base64,FINAL";
      },
    });

    // Then only the bounded final canvas exists and both originals draw into mapped rectangles.
    assert.equal(canvases.length, 1);
    assert.deepEqual([canvases[0].width, canvases[0].height], [1536, 994]);
    assert.deepEqual(
      canvases[0].operations.filter(([name]) => name === "drawImage"),
      [["drawImage", bitmapA, 0, 0, 723, 994], ["drawImage", bitmapB, 723, 0, 813, 542]],
    );
    assert.equal(canvases[0].operations.filter(([name]) => name === "getImageData").length, 1);
    assert.equal(result.dataUrl, "data:image/png;base64,FINAL");
  } finally {
    if (originalOffscreenCanvas === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = originalOffscreenCanvas;
  }
});

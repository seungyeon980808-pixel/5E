import assert from "node:assert/strict";
import test from "node:test";
import {
  EXAM_GRAY_PALETTE,
  analyzeConnectedLightBackground,
  analyzeEmbeddedCheckerboard,
  makeNearWhiteTransparent,
  processImageBackgroundPixels,
  quantizeExamLineart,
  removeConnectedLightBackground,
  removeEmbeddedCheckerboard,
  transparentizeGeneratedImage,
} from "../js/image-background.js";
import { imageBackgroundFixtures, pixelAt } from "./fixtures/image-background-fixtures.mjs";
import {
  alphaAt,
  alphaByteAt,
  cloneImage,
  installGeneratedImageBrowserFixture,
  maskAt,
  maskFromPoints,
  paletteScopeFixture,
} from "./helpers/image-background-test-helpers.mjs";

test("palette conversion is executable through the public facade and honors both operation masks", () => {
  const { data, preserveMask, changeMask } = paletteScopeFixture();

  assert.equal(quantizeExamLineart(data, { palette: EXAM_GRAY_PALETTE, preserveMask, changeMask }), data);
  assert.deepEqual(Array.from(data), [
    0, 0, 0, 255,
    176, 176, 176, 255,
    255, 255, 255, 255,
    40, 80, 120, 83,
    100, 100, 100, 255,
    100, 100, 100, 255,
  ]);
});

test("connected removal preserves a closed beaker interior while all-near-white removal does not", () => {
  const fixture = imageBackgroundFixtures().closedBeaker;
  const connected = cloneImage(fixture);
  const aggressive = cloneImage(fixture);

  removeConnectedLightBackground(connected.data, connected.width, connected.height);
  makeNearWhiteTransparent(aggressive.data);

  assert.equal(alphaAt(connected, fixture.points.exterior), 0);
  assert.deepEqual(pixelAt(connected, fixture.points.enclosedWhite), [255, 255, 255, 255]);
  assert.deepEqual(pixelAt(connected, fixture.points.paleLiquid), [224, 224, 224, 255]);
  assert.deepEqual(pixelAt(connected, fixture.points.outline), [0, 0, 0, 255]);
  assert.equal(alphaAt(aggressive, fixture.points.enclosedWhite), 0);
});

test("all-near-white converts qualifying antialias and translucent pixels without consuming source bytes", () => {
  const fixture = imageBackgroundFixtures().nearWhiteSamples;
  const direct = cloneImage(fixture);

  assert.equal(makeNearWhiteTransparent(direct.data), direct.data);
  const result = processImageBackgroundPixels(fixture.data, fixture.width, fixture.height, {
    backgroundPolicy: "all-near-white",
    examPalette: false,
  });

  assert.deepEqual(result.data, direct.data);
  assert.deepEqual(result.source, fixture.data);
  assert.deepEqual(pixelAt(result, fixture.points.white), [0, 0, 0, 0]);
  assert.deepEqual(pixelAt(result, fixture.points.antialiasedWhite), [0, 0, 0, 7]);
  assert.deepEqual(pixelAt(result, fixture.points.translucentWhite), [0, 0, 0, 3]);
  for (const point of [fixture.points.gray, fixture.points.black, fixture.points.chromaticLight]) {
    assert.deepEqual(pixelAt(result, point), pixelAt(fixture, point));
  }
  assert.equal(maskAt(result.removalMask, fixture.width, fixture.points.white), 1);
  assert.equal(maskAt(result.removalMask, fixture.width, fixture.points.antialiasedWhite), 1);
  assert.equal(maskAt(result.removalMask, fixture.width, fixture.points.gray), 0);
});

test("connected removal protects an open beaker cavity and surfaces it for manual review", () => {
  const fixture = imageBackgroundFixtures().openBeaker;
  const before = new Uint8ClampedArray(fixture.data);

  const result = processImageBackgroundPixels(fixture.data, fixture.width, fixture.height);

  assert.deepEqual(fixture.data, before, "processing must not consume the caller's source bytes");
  assert.deepEqual(result.source, before, "the result must retain a byte-exact reprocessing source");
  assert.equal(alphaAt(result, fixture.points.exterior), 0);
  assert.deepEqual(pixelAt(result, fixture.points.openInteriorWhite), [255, 255, 255, 255]);
  assert.deepEqual(pixelAt(result, fixture.points.paleLiquid), [226, 226, 226, 255]);
  assert.deepEqual(pixelAt(result, fixture.points.outline), [0, 0, 0, 255]);
  assert.equal(result.reviewRequired, true);
  assert.ok(result.reviewReasons.includes("open-light-region"));
  assert.equal(maskAt(result.reviewMask, fixture.width, fixture.points.openInteriorWhite), 1);
  assert.equal(maskAt(result.protectedMask, fixture.width, fixture.points.openInteriorWhite), 1);
});

test("connected analysis reports ambiguous exterior pixels and changeMask can exclude that review", () => {
  const fixture = imageBackgroundFixtures().ambiguousExterior;
  const before = new Uint8ClampedArray(fixture.data);
  let reviewed = null;

  const analysis = analyzeConnectedLightBackground(fixture.data, fixture.width, fixture.height, {
    onReview: value => { reviewed = value; },
  });

  assert.deepEqual(fixture.data, before);
  assert.equal(reviewed, analysis);
  assert.equal(analysis.reviewRequired, true);
  assert.deepEqual(analysis.reviewReasons, ["ambiguous-light-pixels"]);
  assert.deepEqual(analysis.reviewBounds, { x0: 0, y0: 3, x1: 1, y1: 4 });
  assert.equal(maskAt(analysis.removalMask, fixture.width, fixture.points.definiteExterior), 1);
  assert.equal(maskAt(analysis.removalMask, fixture.width, fixture.points.ambiguousExterior), 0);
  assert.equal(maskAt(analysis.reviewMask, fixture.width, fixture.points.ambiguousExterior), 1);
  assert.equal(maskAt(analysis.protectedMask, fixture.width, fixture.points.ambiguousExterior), 1);

  const changeMask = new Uint8Array(fixture.width * fixture.height).fill(1);
  changeMask[fixture.points.ambiguousExterior[1] * fixture.width + fixture.points.ambiguousExterior[0]] = 0;
  const scoped = processImageBackgroundPixels(fixture.data, fixture.width, fixture.height, {
    changeMask,
    examPalette: false,
  });
  assert.equal(scoped.reviewRequired, false);
  assert.deepEqual(scoped.reviewReasons, []);
  assert.deepEqual(pixelAt(scoped, fixture.points.ambiguousExterior), pixelAt(fixture, fixture.points.ambiguousExterior));
  assert.equal(alphaAt(scoped, fixture.points.definiteExterior), 0);
});

test("connected removal retains bright objects, thin strokes, antialiasing, and translucent edges", () => {
  const fixture = imageBackgroundFixtures().brightObjectAndThinEdges;
  const result = processImageBackgroundPixels(fixture.data, fixture.width, fixture.height, { examPalette: false });

  assert.equal(alphaAt(result, fixture.points.exterior), 0);
  for (const point of [
    fixture.points.brightFill,
    fixture.points.thinLine,
    fixture.points.antialiasedEdge,
    fixture.points.translucentEdge,
    fixture.points.brightChromaticObject,
  ]) assert.deepEqual(pixelAt(result, point), pixelAt(fixture, point));
});

test("a genuine alpha source is never mistaken for an opaque background or baked checkerboard", () => {
  const fixture = imageBackgroundFixtures().realAlpha;
  const connected = processImageBackgroundPixels(fixture.data, fixture.width, fixture.height, { examPalette: false });
  const checkerboard = cloneImage(fixture);

  removeEmbeddedCheckerboard(checkerboard.data, checkerboard.width, checkerboard.height);

  assert.deepEqual(connected.data, fixture.data);
  assert.deepEqual(checkerboard.data, fixture.data);
  assert.deepEqual(pixelAt(connected, fixture.points.transparentFrame), [23, 31, 47, 0]);
  assert.deepEqual(pixelAt(connected, fixture.points.translucentEdge), [72, 91, 110, 83]);
  assert.deepEqual(pixelAt(connected, fixture.points.internalWhite), [255, 255, 255, 255]);
});

test("connected mode retains a drawn checkerboard for review while checkerboard mode removes only the detected pattern", () => {
  const fixture = imageBackgroundFixtures().drawnCheckerboard;
  const connected = processImageBackgroundPixels(fixture.data, fixture.width, fixture.height, { examPalette: false });
  const checkerboard = processImageBackgroundPixels(fixture.data, fixture.width, fixture.height, {
    backgroundPolicy: "checkerboard",
    examPalette: false,
  });

  assert.deepEqual(connected.data, fixture.data);
  assert.equal(connected.reviewRequired, true);
  assert.ok(connected.reviewReasons.includes("embedded-checkerboard"));
  assert.equal(checkerboard.removedPixelCount, fixture.width * fixture.height);
  assert.equal(alphaAt(checkerboard, fixture.points.firstTile), 0);
  assert.equal(alphaAt(checkerboard, fixture.points.secondTile), 0);
  assert.deepEqual(checkerboard.source, fixture.data);
  assert.deepEqual(pixelAt({ ...checkerboard, data: checkerboard.source }, fixture.points.firstTile), pixelAt(fixture, fixture.points.firstTile));
});

test("two light tones without spatial repetition are preserved and surfaced for checkerboard review", () => {
  const fixture = imageBackgroundFixtures().uncertainTwoToneBackground;
  const before = new Uint8ClampedArray(fixture.data);
  let reviewed = null;
  const analysis = analyzeEmbeddedCheckerboard(fixture.data, fixture.width, fixture.height, {
    onReview: value => { reviewed = value; },
  });

  assert.deepEqual(fixture.data, before);
  assert.equal(reviewed, analysis);
  assert.equal(analysis.removedPixelCount, 0);
  assert.equal(analysis.reviewPixelCount, fixture.width * fixture.height);
  assert.deepEqual(analysis.reviewReasons, ["checkerboard-pattern-uncertain"]);
  for (const point of [fixture.points.firstBand, fixture.points.secondBand]) {
    assert.equal(maskAt(analysis.uncertainMask, fixture.width, point), 1);
    assert.equal(maskAt(analysis.protectedMask, fixture.width, point), 1);
  }

  const mutable = cloneImage(fixture);
  assert.equal(removeEmbeddedCheckerboard(mutable.data, mutable.width, mutable.height), mutable.data);
  assert.deepEqual(mutable.data, before);
});

test("preserve policy returns independent byte-exact source and output snapshots", () => {
  const fixture = imageBackgroundFixtures().closedBeaker;
  const result = processImageBackgroundPixels(fixture.data, fixture.width, fixture.height, {
    backgroundPolicy: "preserve",
  });

  assert.equal(result.backgroundPolicy, "preserve");
  assert.notEqual(result.data, fixture.data);
  assert.notEqual(result.source, fixture.data);
  assert.notEqual(result.data, result.source);
  assert.deepEqual(result.data, fixture.data);
  assert.deepEqual(result.source, fixture.data);
  assert.equal(result.removedPixelCount, 0);
  assert.equal(result.reviewRequired, false);
});

test("line thickness expands dark neutral pixels in the shared processing pipeline", () => {
  const data = new Uint8ClampedArray(7 * 7 * 4).fill(255);
  data.set([20, 20, 20, 255], (3 * 7 + 3) * 4);
  const result = processImageBackgroundPixels(data, 7, 7, {
    backgroundPolicy: "preserve",
    lineThickness: 1,
  });
  const darkPixels = Array.from({ length: 49 }, (_, pixel) => result.data[pixel * 4] === 20)
    .filter(Boolean).length;
  assert.equal(darkPixels, 5);
  assert.deepEqual(result.source, data);
  assert.deepEqual(data.slice(0, 4), Uint8ClampedArray.of(255, 255, 255, 255));
});

test("line thickness respects preserve and change masks", () => {
  const data = new Uint8ClampedArray(5 * 5 * 4).fill(255);
  data.set([0, 0, 0, 255], (2 * 5 + 2) * 4);
  const preserveMask = new Uint8Array(25);
  preserveMask[2 * 5 + 1] = 1;
  const changeMask = new Uint8Array(25);
  changeMask.fill(1);
  changeMask[2 * 5 + 3] = 0;
  const result = processImageBackgroundPixels(data, 5, 5, {
    backgroundPolicy: "preserve",
    lineThickness: 1,
    preserveMask,
    changeMask,
  });
  assert.deepEqual(result.data.slice((2 * 5 + 1) * 4, (2 * 5 + 2) * 4), Uint8ClampedArray.of(255, 255, 255, 255));
  assert.deepEqual(result.data.slice((2 * 5 + 3) * 4, (2 * 5 + 4) * 4), Uint8ClampedArray.of(255, 255, 255, 255));
  assert.deepEqual(result.data.slice((1 * 5 + 2) * 4, (1 * 5 + 3) * 4), Uint8ClampedArray.of(0, 0, 0, 255));
});

test("palette conversion is an explicit opt-in and leaves the source reusable", () => {
  const source = Uint8ClampedArray.of(226, 226, 226, 255);
  const result = processImageBackgroundPixels(source, 1, 1, {
    backgroundPolicy: "preserve",
    examPalette: true,
  });
  assert.deepEqual([...result.data], [255, 255, 255, 255]);
  assert.deepEqual([...source], [226, 226, 226, 255]);
  assert.deepEqual(result.source, source);
});

test("preserveMask keeps exact RGBA through removal and palette conversion", () => {
  const fixture = imageBackgroundFixtures().closedBeaker;
  const preserveMask = maskFromPoints(fixture.width, fixture.height, [fixture.points.paleLiquid, fixture.points.exterior]);

  const result = processImageBackgroundPixels(fixture.data, fixture.width, fixture.height, { preserveMask, examPalette: true });

  assert.deepEqual(pixelAt(result, fixture.points.paleLiquid), pixelAt(fixture, fixture.points.paleLiquid));
  assert.deepEqual(pixelAt(result, fixture.points.exterior), pixelAt(fixture, fixture.points.exterior));
  assert.equal(maskAt(result.protectedMask, fixture.width, fixture.points.paleLiquid), 1);
});

test("changeMask confines aggressive removal and palette conversion to the selected operation scope", () => {
  const fixture = imageBackgroundFixtures().closedBeaker;
  const changeMask = maskFromPoints(fixture.width, fixture.height, [fixture.points.exterior]);

  const result = processImageBackgroundPixels(fixture.data, fixture.width, fixture.height, {
    backgroundPolicy: "all-near-white",
    changeMask,
    examPalette: true,
  });

  assert.equal(alphaAt(result, fixture.points.exterior), 0);
  for (let pixel = 0; pixel < changeMask.length; pixel += 1) {
    if (changeMask[pixel]) continue;
    const offset = pixel * 4;
    assert.deepEqual(result.data.slice(offset, offset + 4), fixture.data.slice(offset, offset + 4));
    assert.equal(result.protectedMask[pixel], 1);
  }
});

test("invalid processing policies and binary masks fail closed", () => {
  const fixture = imageBackgroundFixtures().closedBeaker;
  for (const backgroundPolicy of ["threshold-everything", "transparent", "white"]) assert.throws(
    () => processImageBackgroundPixels(fixture.data, fixture.width, fixture.height, { backgroundPolicy }),
    RangeError,
  );
  assert.throws(
    () => processImageBackgroundPixels(fixture.data, fixture.width, fixture.height, { preserveMask: new Uint8Array(2) }),
    TypeError,
  );
  const nonBinary = new Uint8Array(fixture.width * fixture.height);
  nonBinary[4] = 2;
  assert.throws(
    () => processImageBackgroundPixels(fixture.data, fixture.width, fixture.height, { preserveMask: nonBinary }),
    RangeError,
  );
  assert.throws(
    () => processImageBackgroundPixels(fixture.data, fixture.width, fixture.height, { changeMask: nonBinary }),
    RangeError,
  );
});

test("transparentizeGeneratedImage defaults to connected removal and reports protected review pixels", async () => {
  const fixture = imageBackgroundFixtures().openBeaker;
  const browser = installGeneratedImageBrowserFixture(fixture);
  let review = null;

  try {
    const output = await transparentizeGeneratedImage("fixture://open-beaker", {
      onReview: value => { review = value; },
    });
    assert.equal(output, "data:image/png;base64,fixture");
    assert.equal(alphaByteAt(browser.written, fixture.width, fixture.points.exterior), 0);
    assert.equal(alphaByteAt(browser.written, fixture.width, fixture.points.openInteriorWhite), 255);
    assert.deepEqual(pixelAt({ data: browser.written, width: fixture.width }, fixture.points.paleLiquid), [226, 226, 226, 255]);
    assert.equal(review.reviewRequired, true);
    assert.ok(review.reviewReasons.includes("open-light-region"));
    await assert.rejects(transparentizeGeneratedImage("fixture://open-beaker", { backgroundPolicy: "unknown" }), RangeError);
  } finally {
    browser.restore();
  }
});

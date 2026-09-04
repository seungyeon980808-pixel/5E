const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const modulePromise = import("../js/image-transform-options.mjs");

function fixturePixels() {
  return new Uint8ClampedArray([
    255, 255, 255, 255, 248, 248, 248, 255, 255, 255, 255, 255,
    255, 255, 255, 255, 142, 142, 142, 255, 255, 255, 255, 255,
    255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255,
  ]);
}

test("transform modes, background, and scale are explicit with safe defaults", async () => {
  const {
    normalizeBackgroundMode,
    normalizeImageTreatment,
    normalizeOutputScale,
    planImageTransform,
  } = await modulePromise;

  assert.equal(normalizeImageTreatment("original"), "original");
  assert.equal(normalizeImageTreatment("cleanup"), "cleanup");
  assert.equal(normalizeImageTreatment("unknown"), "ai-redraw");
  assert.equal(normalizeBackgroundMode("transparent"), "transparent");
  assert.equal(normalizeBackgroundMode("unknown"), "white");
  assert.equal(normalizeOutputScale(9), 4);
  assert.equal(normalizeOutputScale(0), 1);
  assert.deepEqual(
    planImageTransform({ width: 4000, height: 3000, scale: 4 }),
    {
      requestedScale: 4,
      appliedScale: 1.024,
      width: 4096,
      height: 3072,
      estimatedBytes: 50331648,
      capped: true,
      limitLabel: "긴 변 4096px · 최대 16MP",
    },
  );
  assert.equal(planImageTransform({ width: 4000, height: 4000, scale: 4 }).estimatedBytes, 64000000);
});

test("cleanup increases local line contrast without deleting tiny black symbols", async () => {
  const { cleanAndSharpenPixels, imageSharpnessScore } = await modulePromise;
  const input = fixturePixels();
  const output = cleanAndSharpenPixels(input, 3, 3);

  assert.ok(imageSharpnessScore(output, 3, 3) > imageSharpnessScore(input, 3, 3));
  assert.deepEqual(Array.from(output.slice(28, 32)), [0, 0, 0, 255]);
  assert.equal(output.length, input.length);
});

test("transparent and white outputs produce real corner pixels", async () => {
  const { applyBackgroundMode } = await modulePromise;
  const transparent = applyBackgroundMode(fixturePixels(), "transparent");
  assert.equal(transparent[3], 0);
  assert.ok(transparent[7] < 255);

  const white = applyBackgroundMode(transparent, "white");
  assert.deepEqual(Array.from(white.slice(0, 4)), [255, 255, 255, 255]);
  assert.deepEqual(Array.from(white.slice(12, 16)), [255, 255, 255, 255]);
});

test("cleanup preserves every exact black pixel in thin arrows and science glyphs", async () => {
  const { cleanAndSharpenPixels } = await modulePromise;
  const width = 7;
  const height = 5;
  const input = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let offset = 3; offset < input.length; offset += 4) input[offset] = 255;
  const blackPixels = [[1, 2], [2, 2], [3, 2], [4, 2], [4, 1], [4, 3], [6, 1], [6, 2]];
  for (const [x, y] of blackPixels) {
    const offset = (y * width + x) * 4;
    input.set([0, 0, 0, 255], offset);
  }

  const output = cleanAndSharpenPixels(input, width, height);

  assert.deepEqual(
    blackPixels.map(([x, y]) => Array.from(output.slice((y * width + x) * 4, (y * width + x) * 4 + 4))),
    blackPixels.map(() => [0, 0, 0, 255]),
  );
});

test("AI panel exposes treatment, background, and bounded scale controls", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  for (const mode of ["original", "cleanup", "ai-redraw"]) {
    assert.match(html, new RegExp(`data-ai-treatment="${mode}"`));
  }
  assert.match(html, /data-ai-background="white"/);
  assert.match(html, /data-ai-background="transparent"/);
  assert.match(html, /data-ai-output-scale[^>]*max="4"/);
  assert.match(html, /긴 변 4096px · 최대 16MP/);
});

test("output filenames retain stable PDF candidate identity and sanitize revisions", async () => {
  const { buildImageOutputFilename } = await modulePromise;

  assert.equal(
    buildImageOutputFilename("물리:중간-p007-c03.png", { treatment: "cleanup", revision: 2 }),
    "물리-중간-p007-c03-cleanup-r02.png",
  );
  assert.equal(
    buildImageOutputFilename("CON.png", { treatment: "ai-redraw", revision: 1 }),
    "_CON-ai-redraw-r01.png",
  );
});

test("local batch transformation preserves order, caps concurrency, and isolates failures", async () => {
  const { transformImageBatch } = await modulePromise;
  let active = 0;
  let peak = 0;
  const progress = [];
  const items = ["a", "bad", "c", "d"].map((name) => ({ name, data: name }));
  const results = await transformImageBatch(items, { treatment: "cleanup" }, {
    concurrency: 2,
    transform: async (data) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      if (data === "bad") throw new Error("fixture failure");
      return { data: `done:${data}`, plan: { width: 10, height: 10, capped: false } };
    },
    onProgress: (event) => progress.push(event),
  });

  assert.equal(peak, 2);
  assert.deepEqual(results.map(({ status }) => status), ["complete", "failed", "complete", "complete"]);
  assert.deepEqual(results.map(({ item }) => item.name), ["a", "bad", "c", "d"]);
  assert.match(results[1].error, /fixture failure/);
  assert.equal(progress.at(-1).completed, 4);
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeImageOutputOptions,
  resolveImageOutput,
} from "../js/ai-output-processing.js";

test("output options default to the byte-preserving source and original colors", () => {
  assert.deepEqual(normalizeImageOutputOptions(), {
    backgroundPolicy: "preserve",
    examPalette: false,
    lineThickness: 0,
  });
  assert.deepEqual(normalizeImageOutputOptions({ backgroundPolicy: "unknown", examPalette: "yes" }), {
    backgroundPolicy: "preserve",
    examPalette: false,
    lineThickness: 0,
  });
});

test("preserve mode returns the original result without invoking pixel conversion", async () => {
  let calls = 0;
  const item = { data: "data:image/png;base64,source" };
  const result = await resolveImageOutput(item, {}, async () => { calls += 1; return "changed"; });
  assert.equal(result, item.data);
  assert.equal(calls, 0);
});

test("explicit background and palette choices are passed to the real converter", async () => {
  const received = [];
  const transform = async (source, options) => { received.push([source, options]); return "processed"; };
  const item = { data: "source" };
  assert.equal(await resolveImageOutput(item, {
    backgroundPolicy: "connected",
    examPalette: true,
  }, transform), "processed");
  assert.deepEqual(received, [["source", { backgroundPolicy: "connected", examPalette: true, lineThickness: 0 }]]);
});

test("explicit line thickness uses the same output transform while preserving the source item", async () => {
  const item = { data: "source" };
  let received;
  const result = await resolveImageOutput(item, { lineThickness: 2 }, async (source, options) => {
    received = [source, options];
    return "thickened";
  });
  assert.equal(result, "thickened");
  assert.equal(item.data, "source");
  assert.deepEqual(received, ["source", {
    backgroundPolicy: "preserve",
    examPalette: false,
    lineThickness: 2,
  }]);
});

test("editable vector results bypass raster processing", async () => {
  let calls = 0;
  const item = { data: "vector", sceneResult: { objects: [{}] } };
  assert.equal(await resolveImageOutput(item, { backgroundPolicy: "all-near-white" }, async () => {
    calls += 1;
    return "changed";
  }), "vector");
  assert.equal(calls, 0);
});

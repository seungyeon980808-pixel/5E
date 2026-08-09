import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { smartCutoutRgba } from "../js/smart-cutout.js";

function solid(width, height, color) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) data.set(color, pixel * 4);
  return data;
}

function setPixel(data, width, x, y, color) {
  data.set(color, (y * width + x) * 4);
}

const box = [
  { x: .08, y: .08 }, { x: .92, y: .08 },
  { x: .92, y: .92 }, { x: .08, y: .92 },
];

test("smart cutout removes lasso-connected background and keeps an outlined object", () => {
  const width = 11, height = 11;
  const data = solid(width, height, [255, 255, 255, 255]);
  for (let y = 3; y <= 7; y += 1) {
    for (let x = 3; x <= 7; x += 1) {
      const edge = x === 3 || x === 7 || y === 3 || y === 7;
      setPixel(data, width, x, y, edge ? [0, 0, 0, 255] : [205, 205, 205, 255]);
    }
  }
  const result = smartCutoutRgba(data, width, height, box, 50);
  assert.equal(result.data[(2 * width + 2) * 4 + 3], 0, "connected white background must be transparent");
  assert.equal(result.data[(3 * width + 3) * 4 + 3], 255, "black outline must remain opaque");
  assert.equal(result.data[(5 * width + 5) * 4 + 3], 255, "gray fill enclosed by the outline must remain");
  assert.deepEqual(result.bbox, { x: 3, y: 3, w: 5, h: 5 });
});

test("sensitivity expands removal to similar gray background", () => {
  const width = 9, height = 9;
  const data = solid(width, height, [255, 255, 255, 255]);
  for (let y = 2; y <= 6; y += 1) for (let x = 2; x <= 6; x += 1) {
    setPixel(data, width, x, y, [215, 215, 215, 255]);
  }
  setPixel(data, width, 4, 4, [0, 0, 0, 255]);
  const low = smartCutoutRgba(data, width, height, box, 0);
  const high = smartCutoutRgba(data, width, height, box, 100);
  assert.ok(low.data[(3 * width + 3) * 4 + 3] > 0, "low sensitivity should retain gray pixels");
  assert.equal(high.data[(3 * width + 3) * 4 + 3], 0, "high sensitivity should remove connected gray pixels");
  assert.equal(high.data[(4 * width + 4) * 4 + 3], 255, "foreground must remain");
});

test("smart cutout UI exposes lasso, sensitivity preview, and confirmation", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const cutout = fs.readFileSync(path.join(root, "js", "image-cutout.js"), "utf8");
  const inspector = fs.readFileSync(path.join(root, "js", "inspector", "section-image.js"), "utf8");
  const globalImage = fs.readFileSync(path.join(root, "js", "inspector", "section-global-image.js"), "utf8");
  assert.match(inspector, /스마트 누끼/);
  assert.match(globalImage, /startSmartCutoutForImage/);
  assert.match(cutout, /startSmartCutout/);
  assert.match(cutout, /type="range" min="0" max="100"/);
  assert.match(cutout, /누끼 확정/);
});

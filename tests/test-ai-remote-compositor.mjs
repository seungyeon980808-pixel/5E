import assert from "node:assert/strict";
import {
  composeRemoteImageInputPlan,
  composeRemoteVisual,
  resolveCropPixelRect,
} from "../js/ai-remote-compositor.js";

assert.deepEqual(
  resolveCropPixelRect({ x: 10, y: 20, w: 25, h: 50 }, 1000, 800),
  { x: 100, y: 160, width: 250, height: 400, unit: "percent" },
);
assert.deepEqual(
  resolveCropPixelRect({ x: 0.1, y: 0.2, w: 0.25, h: 0.5 }, 1000, 800),
  { x: 100, y: 160, width: 250, height: 400, unit: "fraction" },
);
assert.deepEqual(
  resolveCropPixelRect({ x: 50, y: 20, w: 100, h: 60, sourceWidth: 500, sourceHeight: 400 }, 1000, 800),
  { x: 100, y: 40, width: 200, height: 120, unit: "pixels" },
  "preview-pixel coordinates must scale to natural pixels",
);
assert.deepEqual(
  resolveCropPixelRect({ x: 50, y: 20, w: 100, h: 60, unit: "pixels" }, 1000, 800),
  { x: 50, y: 20, width: 100, height: 60, unit: "pixels" },
  "explicit small pixel coordinates must not be mistaken for percentages",
);
assert.deepEqual(
  resolveCropPixelRect({ x: 900, y: 750, w: 300, h: 200, unit: "pixels" }, 1000, 800),
  { x: 900, y: 750, width: 100, height: 50, unit: "pixels" },
  "pixel crops must clamp to image bounds",
);

const operations = [];
function createCanvas(width, height) {
  const canvas = { width, height, operations: [] };
  const context = {
    drawImage: (...args) => canvas.operations.push(["drawImage", ...args]),
    fillRect: (...args) => canvas.operations.push(["fillRect", ...args]),
    clearRect: (...args) => canvas.operations.push(["clearRect", ...args]),
    beginPath: () => canvas.operations.push(["beginPath"]),
    moveTo: (...args) => canvas.operations.push(["moveTo", ...args]),
    lineTo: (...args) => canvas.operations.push(["lineTo", ...args]),
    stroke: () => canvas.operations.push(["stroke"]),
    fillText: (...args) => canvas.operations.push(["fillText", ...args]),
    save: () => canvas.operations.push(["save"]),
    restore: () => canvas.operations.push(["restore"]),
  };
  canvas.getContext = () => context;
  operations.push(canvas);
  return canvas;
}

const dimensions = new Map([
  ["data:image/png;base64,A", [1000, 800]],
  ["data:image/png;base64,B", [600, 1200]],
]);
let loadCount = 0;
const dependencies = {
  createCanvas,
  loadImage: async (dataUrl) => {
    loadCount += 1;
    const [naturalWidth, naturalHeight] = dimensions.get(dataUrl);
    return { dataUrl, naturalWidth, naturalHeight };
  },
  encodeCanvas: async (canvas) => `data:image/png;base64,canvas-${canvas.width}x${canvas.height}`,
};
const sourceA = { id: "a", data: "data:image/png;base64,A" };
const sourceB = { id: "b", data: "data:image/png;base64,B" };

const overview = await composeRemoteVisual({ kind: "overview", role: "primary", sourceId: "a", source: sourceA }, dependencies);
assert.equal(overview.dataUrl, sourceA.data);
assert.equal(overview.reusedSource, true);
assert.equal(operations.length, 0, "overview must avoid needless Canvas work");

const crop = await composeRemoteVisual({
  kind: "crop",
  sourceId: "a",
  source: sourceA,
  rect: { x: 10, y: 20, w: 25, h: 50 },
}, dependencies);
assert.equal(crop.dataUrl, "data:image/png;base64,canvas-250x400");
const cropDraw = operations.at(-1).operations.find((operation) => operation[0] === "drawImage");
assert.deepEqual(cropDraw.slice(2, 6), [100, 160, 250, 400]);

operations.length = 0;
loadCount = 0;
const contact = await composeRemoteVisual({
  kind: "contact-sheet",
  columns: 2,
  tiles: [
    { kind: "overview", sourceId: "a", source: sourceA },
    { kind: "crop", sourceId: "a", source: sourceA, rect: { x: 0, y: 0, w: 50, h: 50 } },
    { kind: "overview", sourceId: "b", source: sourceB },
  ],
}, dependencies);
assert.equal(contact.tileCount, 3);
assert.equal(contact.columns, 2);
assert.equal(loadCount, 2, "contact sheet must decode each unique source once");
const contactOps = operations[0].operations;
assert.equal(contactOps.filter((operation) => operation[0] === "drawImage").length, 3);
assert.equal(contactOps.filter((operation) => operation[0] === "fillText").length, 0, "contact sheets must never contain text labels");
assert.equal(contactOps.some((operation) => operation[0] === "stroke"), true, "contact sheet must use only separator lines");

operations.length = 0;
loadCount = 0;
let clock = 0;
const composedPlan = await composeRemoteImageInputPlan({
  visuals: [
    { kind: "overview", sourceId: "a", source: sourceA },
    { kind: "crop", sourceId: "a", source: sourceA, rect: { x: 0, y: 0, w: 50, h: 50 } },
  ],
}, { ...dependencies, now: () => ++clock });
assert.equal(composedPlan.attachments.length, 2);
assert.equal(loadCount, 1, "parallel plan composition must share decoded sources");
assert.equal(composedPlan.metrics.reusedOverviewCount, 1);
assert.equal(composedPlan.metrics.composedCount, 1);

console.log("AI remote Canvas compositor tests passed");

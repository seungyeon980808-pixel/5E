const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { installSvgDom } = require("../tests/stabilization/harness/svg-dom.cjs");

const root = path.join(__dirname, "..");

test("synthetic label workflow preserves pixels and editable label state", async () => {
  // Given
  installSvgDom();
  const harness = await import(pathToFileURL(path.join(root, "scripts", "stabilization", "label-harness.mjs")));
  const fixture = JSON.parse(fs.readFileSync(path.join(root, "tests", "stabilization", "fixtures", "labels", "synthetic-label-cases.json"), "utf8"));

  // When
  const result = harness.runSyntheticLabelCase(fixture);

  // Then
  assert.equal(result.crop.pixelMatch, true);
  assert.equal(result.request.labelPolicy, "omit");
  assert.deepEqual(result.request.labels, []);
  assert.deepEqual(result.request.transportPixels, fixture.transmittedPixels);
  assert.deepEqual(result.ocr.map(({ text, bounds, uncertain }) => ({ text, bounds, uncertain })), fixture.expectedOcr);
  assert.deepEqual(result.objects.map(({ type }) => type), ["labeler", "labeler"]);
  assert.deepEqual(result.objects[0].p1, { x: 40, y: 24 });
  assert.deepEqual(result.objects[0].p2, { x: 20, y: 16 });
  assert.equal(result.edited.find(({ id }) => id === "label-1").text, "수정 A");
  assert.deepEqual(result.edited.find(({ id }) => id === "label-1").p2, { x: 28, y: 19 });
  assert.equal(result.edited.some(({ id }) => id === "label-2"), false);
  assert.equal(result.objects.find(({ id }) => id === "label-2").text, "미상 (?)");
  assert.equal(result.generated.every((object) => !Object.hasOwn(object, "fontFamily")), true);
  assert.equal(result.persisted.every(({ fontFamily }) => typeof fontFamily === "string" && fontFamily.length > 0), true);
  assert.equal(result.rendered.every(({ tag, leaders, text }) => tag === "g" && leaders > 0 && text.length > 0), true);
  assert.equal(result.inspectorBounds.every(({ w, h }) => w > 0 && h > 0), true);
  assert.deepEqual(result.edited.find(({ id }) => id === "label-1").p1, { x: 48, y: 27 });
  assert.deepEqual(result.editPaths, ["inspector", "transform", "store-delete"]);
  assert.deepEqual(result.comparison, { sourceId: "synthetic-source", resultId: "synthetic-result", layout: "side-by-side" });
  assert.deepEqual(result.recovery, ["failed", "retrying", "ready"]);
});

test("label harness rejects a transmitted crop whose pixels differ", async () => {
  // Given
  const { compareCropPixels } = await import(pathToFileURL(path.join(root, "scripts", "stabilization", "label-harness.mjs")));

  // When / Then
  assert.deepEqual(compareCropPixels([0, 1, 2, 3], [0, 1, 9, 3]), { pixelMatch: false, differingBytes: 1 });
});

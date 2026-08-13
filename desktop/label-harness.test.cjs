const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.join(__dirname, "..");

test("synthetic label workflow preserves pixels and editable label state", async () => {
  // Given
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
  assert.deepEqual(result.objects.map(({ type }) => type), ["text", "labeler", "text", "labeler"]);
  assert.equal(result.edited.find(({ id }) => id === "label-1-text").text, "수정 A");
  assert.deepEqual(result.edited.find(({ id }) => id === "label-1-leader").p2, [28, 19]);
  assert.equal(result.edited.some(({ id }) => id === "label-2-text"), false);
  assert.equal(result.objects.find(({ id }) => id === "label-2-text").text, "미상 (?)");
  assert.deepEqual(result.comparison, { sourceId: "synthetic-source", resultId: "synthetic-result", layout: "side-by-side" });
  assert.deepEqual(result.recovery, ["failed", "retrying", "ready"]);
});

test("label harness rejects a transmitted crop whose pixels differ", async () => {
  // Given
  const { compareCropPixels } = await import(pathToFileURL(path.join(root, "scripts", "stabilization", "label-harness.mjs")));

  // When / Then
  assert.deepEqual(compareCropPixels([0, 1, 2, 3], [0, 1, 9, 3]), { pixelMatch: false, differingBytes: 1 });
});

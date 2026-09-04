const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { validateExportLeaf, writeExportFile } = require("./export-file.cjs");

test("desktop export writes exact bytes inside a Windows temp directory", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "5e-export-smoke-"));
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const result = await writeExportFile(root, "실험 결과.png", bytes);
  assert.equal(result.status, "saved");
  assert.equal(result.path, path.join(root, "실험 결과.png"));
  assert.deepEqual(await fs.promises.readFile(result.path), bytes);
});

test("desktop export rejects traversal, reserved names, and unsupported formats", () => {
  assert.throws(() => validateExportLeaf("..\\escape.png"));
  assert.throws(() => validateExportLeaf("CON.png"));
  assert.throws(() => validateExportLeaf("notes.txt"));
});

test("desktop export refuses to overwrite a hard-linked leaf", async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "5e-export-link-"));
  const outside = path.join(os.tmpdir(), `5e-outside-${process.pid}-${Date.now()}.png`);
  t.after(() => Promise.all([fs.promises.rm(root, { recursive: true, force: true }), fs.promises.rm(outside, { force: true })]));
  await fs.promises.writeFile(outside, "safe");
  await fs.promises.link(outside, path.join(root, "report.png"));
  await assert.rejects(() => writeExportFile(root, "report.png", Buffer.from("changed")), /안전하지 않은/);
  assert.equal(await fs.promises.readFile(outside, "utf8"), "safe");
});

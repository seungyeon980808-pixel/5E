import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const fixtureRoot = new URL("../fixtures/image-ocr/", import.meta.url);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export async function assertGeneratedOcrFixtures() {
  const manifestBytes = await readFile(new URL("manifest.json", fixtureRoot));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.schema, "5e-image-ocr-fixtures@1");
  assert.equal(manifest.fixtures.length, 8);
  const categories = new Set(manifest.fixtures.flatMap(fixture => fixture.categories));
  for (const category of ["korean", "numeric", "scientific", "ambiguous-glyph", "unit", "subscript", "superscript", "small", "faint"]) {
    assert.equal(categories.has(category), true, category);
  }

  const font = await readFile(new URL(manifest.font.file, fixtureRoot));
  assert.equal(font.byteLength, manifest.font.bytes);
  assert.equal(sha256(font), manifest.font.sha256);
  for (const fixture of manifest.fixtures) {
    const png = await readFile(new URL(fixture.png, fixtureRoot));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), fixture.width);
    assert.equal(png.readUInt32BE(20), fixture.height);
    assert.equal(png.byteLength, fixture.pngBytes);
    assert.equal(sha256(png), fixture.pngSha256);
  }
}

export async function assertFixedOcrFixtures() {
  const manifest = JSON.parse(await readFile(new URL("supplemental/manifest.json", fixtureRoot)));
  assert.equal(manifest.schema, "5e-image-ocr-fixed-fixtures@1");
  assert.deepEqual(manifest.fixtures.map(fixture => fixture.expected), ["묽은 염산", "증류수", "묽은 염산"]);
  assert.equal(manifest.fixtures.some(fixture => fixture.categories.includes("blurred")), true);

  for (const fixture of manifest.fixtures) {
    const png = await readFile(new URL(fixture.png, fixtureRoot));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), fixture.width);
    assert.equal(png.readUInt32BE(20), fixture.height);
    assert.equal(png.byteLength, fixture.pngBytes);
    assert.equal(sha256(png), fixture.pngSha256);
  }
}

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function syntheticPage() {
  const width = 100, height = 140;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  const fill = (left, top, right, bottom) => {
    for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
      pixels[offset + 3] = 255;
    }
  };
  fill(10, 15, 70, 18); fill(10, 23, 88, 26);
  fill(38, 42, 85, 45); fill(38, 75, 85, 78);
  fill(38, 42, 41, 78); fill(82, 42, 85, 78);
  return { data: pixels, width, height };
}

test("local pixel analysis suggests distinct editable question and figure regions", async () => {
  const { suggestPageRegions } = await import("../js/pdf-region-suggestions.mjs");
  const regions = suggestPageRegions(syntheticPage());
  assert.deepEqual(regions.map(({ kind }) => kind), ["question", "figure"]);
  assert.ok(regions[0].box.x < regions[1].box.x);
  assert.ok(regions[0].box.y < regions[1].box.y);
  assert.ok(regions[0].box.w > regions[1].box.w);
  for (const region of regions) for (const value of Object.values(region.box)) {
    assert.ok(value >= 0 && value <= 1);
  }
});

test("blank pages do not invent a region that could be silently confirmed", async () => {
  const { suggestPageRegions } = await import("../js/pdf-region-suggestions.mjs");
  assert.deepEqual(suggestPageRegions({ data: new Uint8ClampedArray(80 * 80 * 4).fill(255), width: 80, height: 80 }), []);
});

test("workspace exposes local suggestions and a separate explicit confirmation", () => {
  const dialog = fs.readFileSync(path.join(__dirname, "..", "js", "ai-reference-dialog.js"), "utf8");
  const workspace = fs.readFileSync(path.join(__dirname, "..", "js", "ai-pdf-workspace.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "..", "css", "ai-panel.css"), "utf8");
  assert.match(dialog, /data-ai-pdf-suggest-question[^>]*>문항 전체 제안/);
  assert.match(dialog, /data-ai-pdf-suggest-figure[^>]*>도판 영역 제안/);
  assert.match(dialog, /data-ai-pdf-crop-preview/);
  assert.match(dialog, /data-ai-pdf-page-wrap[^>]*>[\s\S]*?<\/div>\s*<\/div><aside class="ai-pdf-crop-preview"/);
  assert.match(workspace, /suggestPageRegions/);
  assert.match(workspace, /preview\.show/);
  assert.match(workspace, /onAddCrop/);
  assert.match(css, /\.ai-pdf-page-viewer\s*\{[^}]*position:\s*relative;/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.ai-pdf-crop-preview\s*\{[^}]*bottom:\s*8px;/);
});

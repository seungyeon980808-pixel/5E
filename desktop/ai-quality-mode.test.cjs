const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function importLocal(name) {
  const url = pathToFileURL(path.join(__dirname, "..", "js", name));
  url.searchParams.set("test", String(Date.now()));
  return import(url.href);
}

test("quality and output choices are explicit and safe by default", async () => {
  const modes = await importLocal("ai-quality-mode.js");
  assert.equal(modes.normalizeQualityMode("simple"), "simple");
  assert.equal(modes.normalizeQualityMode("complex"), "complex");
  assert.equal(modes.normalizeQualityMode("unknown"), "standard");
  assert.equal(modes.normalizeOutputEngine("asset"), "asset");
  assert.equal(modes.normalizeOutputEngine("automatic"), "raster");
  for (const mode of ["simple", "standard", "complex"]) {
    const rule = modes.qualityModeRule(mode);
    assert.match(rule, /어떤 경우에도 바꾸지 않는다/);
  }
  assert.match(modes.qualityModeRule("simple"), /형태를 단순화하거나 다른 물체로 치환하지 않는다/);
  assert.match(modes.qualityModeRule("simple"), /고품질 1회 변환/);
  assert.match(modes.qualityModeRule("complex", { revision: true }), /맞는 영역은 그대로 보존/);
});

test("exam palette removes color and keeps only black, gray and white", async () => {
  const { quantizeExamLineart } = await importLocal("image-background.js");
  const rgba = new Uint8ClampedArray([
    255, 0, 0, 255,
    20, 190, 80, 255,
    250, 250, 250, 255,
    40, 40, 40, 0,
  ]);
  quantizeExamLineart(rgba);
  for (let index = 0; index < rgba.length; index += 4) {
    if (rgba[index + 3] === 0) continue;
    assert.equal(rgba[index], rgba[index + 1]);
    assert.equal(rgba[index + 1], rgba[index + 2]);
    assert.ok([0, 176, 255].includes(rgba[index]));
  }
});

test("AI panel exposes three modes, explicit output engines, tabs and batch conversion", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const panel = fs.readFileSync(path.join(__dirname, "..", "js", "ai-panel.js"), "utf8");
  for (const mode of ["simple", "standard", "complex"]) {
    assert.match(html, new RegExp(`data-ai-quality="${mode}"`));
  }
  assert.match(html, /data-ai-output-engine="raster"/);
  assert.match(html, /data-ai-output-engine="asset"/);
  assert.match(html, /data-ai-batch/);
  assert.match(html, /data-ai-tab-list/);
  assert.match(panel, /const BATCH_CONCURRENCY = 5/);
  assert.doesNotMatch(panel, /createStructureLockedLineart/);
  assert.match(panel, /복잡 변환 완료 · 원본 구조 확인 필요/);
  assert.match(panel, /normalizeQualityMode\(currentRunInput\?\.qualityMode\) === AI_QUALITY_MODES\.COMPLEX/);
  assert.match(panel, /AI_OUTPUT_ENGINES\.RASTER/);
});

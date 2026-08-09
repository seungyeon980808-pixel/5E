const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("Luna is the session default and non-Luna models show a compact warning", () => {
  const panel = read("js/ai-panel.js");
  const html = read("index.html");
  const css = read("css/ai-panel.css");

  assert.match(panel, /sessionStorage\.getItem\("5e\.aiModelExplicit"\)/);
  assert.match(panel, /availableModels\.find\(\(item\) => \/luna\/i\.test/);
  assert.ok(
    panel.indexOf('sessionStorage.getItem("5e.aiModelExplicit")')
      < panel.indexOf('availableModels.find((item) => /luna/i.test'),
    "an explicit choice in this session must win before the Luna default",
  );
  assert.match(panel, /sessionStorage\.setItem\("5e\.aiModelExplicit", modelSelect\.value\)/);
  assert.match(panel, /modelWarning\.hidden = !modelSelect\.value \|\| isLunaModel\(\)/);

  assert.match(html, /data-ai-model-warning[^>]*hidden>Luna 외 모델은 생성 시간이 길어질 수 있습니다\.<\/span>/);
  assert.match(css, /\.ai-model-warning\s*\{[^}]*var\(--text-secondary/s);
  assert.match(css, /\.ai-model-warning\[hidden\]\s*\{\s*display:\s*none;/);
});

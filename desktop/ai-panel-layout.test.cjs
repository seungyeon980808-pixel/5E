const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("AI conversation controls use a readable aligned option grid", () => {
  const html = read("index.html");
  const css = read("css/ai-panel.css");

  assert.equal((html.match(/class="ai-mode-options"/g) || []).length, 3);
  assert.match(css, /--ai-type-control:\s*12px/);
  assert.match(css, /--ai-type-body:\s*12\.5px/);
  assert.match(css, /grid-template-columns:\s*minmax\(760px, 1fr\) 360px/);
  assert.match(css, /\.ai-mode-row\s*\{[^}]*grid-template-columns:\s*76px minmax\(0, 1fr\)/s);
  assert.match(css, /\.ai-mode-options\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(css, /\.ai-quality-row \.ai-mode-options\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(css, /\.ai-conversation-actions button\s*\{[^}]*min-height:\s*38px/s);
});

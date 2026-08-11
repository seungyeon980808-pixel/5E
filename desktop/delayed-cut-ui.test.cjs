const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("delayed cut is reachable from the visible cut chooser and keyboard", () => {
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const tools = fs.readFileSync(path.join(root, "js", "tools.js"), "utf8");
  const cutTool = fs.readFileSync(path.join(root, "js", "cut-tool.js"), "utf8");

  assert.match(index, /id="tool-cut-merged"/);
  assert.match(index, /id="chooser-cut"/);
  const toolListStart = index.indexOf('id="tool-list"');
  const toolListEnd = index.indexOf('id="subject-section"');
  const chooserStart = index.indexOf('id="chooser-cut"');
  const aiPanelStart = index.indexOf('id="ai-image-panel"');
  assert.ok(toolListStart >= 0 && toolListEnd > toolListStart);
  assert.ok(chooserStart > toolListStart && chooserStart < toolListEnd,
    "cut chooser must be rendered inside the visible left tool list");
  assert.ok(chooserStart < aiPanelStart,
    "cut chooser must not be nested in the hidden AI image panel");
  assert.match(index, /data-tool="CUT"/);
  assert.match(index, /data-tool="DELAYED_CUT"/);
  assert.match(index, /data-tool="ERASE"/);
  assert.match(index, /지연 자르기/);
  assert.match(index, /style\.css\?v=1\.5\.3/);
  assert.match(index, /main\.js\?v=1\.5\.9-delayed-cut-cache/);
  assert.match(fs.readFileSync(path.join(root, "js", "main.js"), "utf8"), /tools\.js\?v=1\.5\.4/);
  assert.match(fs.readFileSync(path.join(root, "js", "main.js"), "utf8"), /cut-tool\.js\?v=1\.5\.3/);
  assert.match(fs.readFileSync(path.join(root, "js", "main.js"), "utf8"), /tool-hint\.js\?v=1\.5\.2/);
  assert.match(tools, /setActiveTool\("DELAYED_CUT"\)/);
  assert.match(cutTool, /activeTool === "DELAYED_CUT"/);
  assert.match(cutTool, /class="delayed-cut-confirm"/);
});

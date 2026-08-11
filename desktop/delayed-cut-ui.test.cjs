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
  assert.match(index, /data-tool="CUT"/);
  assert.match(index, /data-tool="DELAYED_CUT"/);
  assert.match(index, /data-tool="ERASE"/);
  assert.match(index, /지연 자르기/);
  assert.match(tools, /setActiveTool\("DELAYED_CUT"\)/);
  assert.match(cutTool, /activeTool === "DELAYED_CUT"/);
  assert.match(cutTool, /class="delayed-cut-confirm"/);
});

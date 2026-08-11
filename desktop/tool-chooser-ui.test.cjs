const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("text, angle and cut choosers preserve the confirmed click-to-open workflow", () => {
  const tools = fs.readFileSync(path.join(root, "js", "tools.js"), "utf8");

  for (const [button, chooser] of [
    ["tool-text-merged", "chooser-text"],
    ["tool-angle-merged", "chooser-angle"],
    ["tool-cut-merged", "chooser-cut"],
  ]) {
    assert.match(tools, new RegExp(`btn: "${button}", chooser: "${chooser}", persistent: true`));
  }
  assert.match(tools, /c\.addEventListener\("click", \(\) => \{ if \(!persistent\) closeAll\(\); \}\)/);
  assert.match(tools, /persistentOpen && !e\.target\.closest\("\.tool-btn"\)/);
  assert.match(tools, /activeTool === "ARC" \|\| activeTool === "RIGHTANGLE"/);
  assert.match(tools, /activateSymbolShortcut\(activeTool === "ARC" \? "rightangle" : "anglearc", "Tab"\)/);
});

test("every tools module importer shares the initialized cache identity", () => {
  const importers = [
    "main.js", "ruler.js", "text-editor.js", "templates.js", "transform.js", "tutorial-courses.js",
    path.join("inspector", "section-geometry.js"),
    path.join("tools", "click-placement.js"),
    path.join("tools", "free-draw.js"),
    path.join("tools", "node-placement.js"),
  ];
  for (const relativePath of importers) {
    const source = fs.readFileSync(path.join(root, "js", relativePath), "utf8");
    assert.doesNotMatch(source, /tools\.js\?v=(?!1\.5\.4)/,
      `${relativePath} must not create a second, uninitialized tools module instance`);
  }
});

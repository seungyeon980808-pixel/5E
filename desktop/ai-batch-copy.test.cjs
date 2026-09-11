const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("multi-image input uses task tabs instead of a second batch interface", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const panel = fs.readFileSync(path.join(__dirname, "..", "js", "ai-panel.js"), "utf8");
  assert.doesNotMatch(source, /data-ai-batch/);
  assert.match(source, /data-ai-tab-list/);
  assert.match(panel, /addReferencesAsTasks\(selectedFiles\.map/);
  assert.match(panel, /addReferencesAsTasks\(dropped\.map/);
});

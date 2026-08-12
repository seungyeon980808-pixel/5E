const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Pages toolbar starts immediate Cut mode just like the local editor", () => {
  const index = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

  assert.match(
    index,
    /<button class="tool-btn" type="button" data-tool="CUT" title="자르기·영역 분리 \(E\)">/,
  );
  assert.doesNotMatch(index, /id="tool-cut-merged"/);
});

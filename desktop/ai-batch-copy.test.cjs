const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("batch action advertises the implemented one-at-a-time behavior", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const match = source.match(/<button type="button" data-ai-batch title="([^"]+)">([^<]+)<\/button>/);

  assert.ok(match, "batch action should remain present in the AI panel");
  assert.equal(match[2], "대기열 시작");
  assert.match(source, /대기열 결과는 독립 검수되지 않습니다/);
  assert.equal(match[1], "추가한 참고 이미지를 각각 독립적으로 1개씩 순차 변환합니다");
});

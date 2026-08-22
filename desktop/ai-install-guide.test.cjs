const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("AI image feature is launched from the image workflow hub", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const guide = fs.readFileSync(path.join(__dirname, "..", "js", "ai-install-guide.js"), "utf8");
  assert.match(html, /id="ai-image-install-open"/);
  assert.match(html, /id="ai-image-install-open"[\s\S]*?AI 이미지 생성[\s\S]*?<\/button>/);
  assert.match(html, /id="ai-image-panel"[^>]*hidden/);
  assert.match(guide, /Windows용 5E 데스크톱 앱/);
  assert.match(guide, /releases\/latest/);
  assert.match(guide, /Assets/);
  assert.match(guide, /window\.fiveEDesktop/);
  assert.match(guide, /openDesktopPanel\(\)/);
});

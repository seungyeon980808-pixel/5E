const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("AI image feature exposes a desktop handoff from the image workflow hub", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const guide = fs.readFileSync(path.join(__dirname, "..", "js", "ai-install-guide.js"), "utf8");
  assert.match(html, /id="ai-image-install-open"/);
  assert.match(html, /id="ai-image-install-open"[\s\S]*?AI 이미지 변환[\s\S]*?<\/button>/);
  assert.match(html, /id="ai-image-panel"[^>]*hidden/);
  assert.match(guide, /createDesktopHandoff/);
  assert.match(guide, /DESKTOP_RELEASE_URL/);
  assert.match(guide, /reportAiSuccess/);
  assert.match(guide, /reportLocalFolderIntent/);
  assert.match(guide, /window\.fiveEDesktop/);
  assert.match(guide, /openDesktopPanel\?\.\(\)/);
});

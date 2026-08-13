const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Given the production image hub, When its only action is used, Then it opens the diagram panel directly", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const guide = fs.readFileSync(path.join(__dirname, "..", "js", "ai-install-guide.js"), "utf8");
  const hubStart = html.indexOf('<div class="image-workflow-hub"');
  const hubEnd = html.indexOf("</div>", hubStart);
  assert.notEqual(hubStart, -1);
  assert.notEqual(hubEnd, -1);
  const hub = html.slice(hubStart, hubEnd);

  assert.equal((hub.match(/<button\b/g) || []).length, 1);
  assert.match(hub, /id="ai-image-install-open"/);
  assert.doesNotMatch(hub, /exam-library-open|parts-library-open/);
  assert.match(html, /id="ai-image-panel"[^>]*hidden/);
  assert.doesNotMatch(guide, /releases\/latest/);
  assert.doesNotMatch(guide, /window\.fiveEDesktop/);
  assert.match(guide, /getElementById\("ai-image-install-open"\)/);
  assert.match(guide, /addEventListener\("click"/);
  assert.match(guide, /openDesktopPanel\(\)/);
});

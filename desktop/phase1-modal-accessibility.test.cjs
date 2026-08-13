const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const panel = fs.readFileSync(path.join(root, "js", "ai-panel.js"), "utf8");
const referenceSearch = fs.readFileSync(path.join(root, "js", "ai-reference-search.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("Phase 1 dialogs delegate focus trapping and restoration", () => {
  assert.match(panel, /import \{ installModalFocus \} from "\.\/modal-focus\.js\?v=/);
  assert.match(panel, /installModalFocus\(\{[\s\S]*?root: panel,[\s\S]*?returnFocus,/);
  assert.match(panel, /installModalFocus\(\{[\s\S]*?root: overlay,[\s\S]*?onRequestClose:/);
  assert.match(panel, /dialog\.setAttribute\("aria-labelledby", title\.id\)/);
});

test("task tabs expose a separate keyboard-operable close action", () => {
  assert.match(panel, /closeTab = document\.createElement\("button"\)/);
  assert.match(panel, /closeTab\.className = "ai-task-tab-close"/);
  assert.doesNotMatch(panel, /closeTab = document\.createElement\("i"\)/);
});

test("public metadata describes the local diagram workflow", () => {
  const descriptions = [...html.matchAll(/<(?:meta[^>]+(?:name|property)="(?:description|og:description|twitter:description)"[^>]+content|meta[^>]+content)="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.ok(descriptions.length >= 3);
  assert.doesNotMatch(descriptions.join("\n"), /라이브러리에서 기출문항/);
  assert.match(descriptions.join("\n"), /PDF|이미지/);
});

test("folder permission failures stay visible inside the active dialog", () => {
  assert.match(referenceSearch, /result\.status === "denied"[\s\S]*?referenceLoadStatus\?\.error/);
  assert.match(referenceSearch, /pickLocal\(\)\.catch\([\s\S]*?referenceLoadStatus\?\.error\(error\)/);
});

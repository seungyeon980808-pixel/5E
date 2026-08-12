const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("Windows package, visible footer and desktop guide share one release identity", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const main = fs.readFileSync(path.join(root, "js", "main.js"), "utf8");
  const desktopGuide = fs.readFileSync(path.join(root, "docs", "DESKTOP_WINDOWS.md"), "utf8");

  assert.equal(pkg.version, "1.5.6");
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
  assert.match(index, /5E<\/strong> <strong>v1\.5\.6 · 2026\.08\.12<\/strong>/);
  assert.match(main, /\[5E v1\.5\.6\]/);
  assert.match(desktopGuide, /release\/5E Setup 1\.5\.6\.exe/);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("Windows package, visible footer and release notes share one final identity", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const main = fs.readFileSync(path.join(root, "js", "main.js"), "utf8");
  const notes = fs.readFileSync(path.join(root, "docs", "RELEASE_NOTES_v1.5.0.md"), "utf8");
  const desktopGuide = fs.readFileSync(path.join(root, "docs", "DESKTOP_WINDOWS.md"), "utf8");
  const releaseWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "windows-release.yml"), "utf8");

  assert.equal(pkg.version, "1.5.0");
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
  assert.match(pkg.scripts["package:win"], /--publish never/);
  assert.match(index, /5E<\/strong> <strong>v1\.5\.0 · 2026\.08\.10<\/strong>/);
  assert.match(main, /\[5E v1\.5\.0\]/);
  assert.match(notes, /release-title: v1\.5\.0 — 그림을 가져오고, 고치고, 다시 쓰는 5E/);
  assert.match(notes, /Full Changelog.*v1\.4\.0\.\.\.v1\.5\.0/);
  assert.match(desktopGuide, /release\/5E Setup 1\.5\.0\.exe/);
  assert.match(releaseWorkflow, /--notes-file \$notesPath/);
  assert.match(releaseWorkflow, /RELEASE_NOTES_\$tag\.md/);
});

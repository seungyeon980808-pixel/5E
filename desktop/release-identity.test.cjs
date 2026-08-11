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
  const notes = fs.readFileSync(path.join(root, "docs", "RELEASE_NOTES_v1.5.3.md"), "utf8");
  const desktopGuide = fs.readFileSync(path.join(root, "docs", "DESKTOP_WINDOWS.md"), "utf8");
  const releaseWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "windows-release.yml"), "utf8");
  const desktopMain = fs.readFileSync(path.join(root, "desktop", "main.cjs"), "utf8");

  assert.equal(pkg.version, "1.5.3");
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
  assert.match(pkg.scripts["package:win"], /--publish never/);
  assert.equal(pkg.build.win.icon, "assets/icon.ico");
  assert.ok(fs.statSync(path.join(root, "assets", "icon.ico")).size > 0);
  assert.match(desktopMain, /app\.setAppUserModelId\(APP_ID\)/);
  assert.equal((desktopMain.match(/icon: APP_ICON_PATH/g) || []).length, 2);
  assert.match(index, /5E<\/strong> <strong>v1\.5\.3 · 2026\.08\.11<\/strong>/);
  assert.match(main, /\[5E v1\.5\.3\]/);
  assert.match(notes, /release-title: v1\.5\.3 — 지연 자르기 업데이트 캐시 수정/);
  assert.match(notes, /Full Changelog.*v1\.5\.2\.\.\.v1\.5\.3/);
  assert.match(desktopGuide, /release\/5E Setup 1\.5\.3\.exe/);
  assert.match(releaseWorkflow, /--notes-file \$notesPath/);
  assert.match(releaseWorkflow, /RELEASE_NOTES_\$tag\.md/);
});

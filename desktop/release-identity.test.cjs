const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("Windows package, visible footer and release notes share one beta identity", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const main = fs.readFileSync(path.join(root, "js", "main.js"), "utf8");
  const notes = fs.readFileSync(path.join(root, "docs", "RELEASE_NOTES_v1.5.0.md"), "utf8");
  const desktopGuide = fs.readFileSync(path.join(root, "docs", "DESKTOP_WINDOWS.md"), "utf8");

  assert.equal(pkg.version, "1.5.0-beta.1");
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
  assert.match(index, /5E<\/strong> <strong>v1\.5\.0-beta\.1 · 2026\.08\.09<\/strong>/);
  assert.match(main, /\[5E v1\.5\.0-beta\.1\]/);
  assert.match(notes, /현재 Windows 검증 빌드는 `v1\.5\.0-beta\.1`입니다/);
  assert.match(notes, /공개 태그와 설치 파일은 최종 배포 절차에서 같은 버전으로 맞춥니다/);
  assert.match(desktopGuide, /release\/5E Setup 1\.5\.0-beta\.1\.exe/);
});

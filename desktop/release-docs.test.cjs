const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const validator = path.join(root, "scripts", "check-release-docs.cjs");

test("public release documentation identifies the observed v1.5.8 release", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  assert.match(readme, /releases\/tag\/v1\.5\.8/);
  assert.match(readme, /최신 릴리즈 <strong>v1\.5\.8<\/strong>/);
});

test("release documentation and channel provenance are internally consistent", () => {
  const result = spawnSync(process.execPath, [validator], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.ok(result.stdout.includes(`Release docs OK: candidate ${require("../package.json").version} HOLD`));
  assert.match(result.stdout, /PDF\/Drive metadata schema 1/);
  const channels = JSON.parse(fs.readFileSync(path.join(root, "release-channels.json"), "utf8"));
  assert.equal(Object.hasOwn(channels.candidate, "sourceSha"), false);
});

test("release documentation checker reads current PDF/Drive metadata", (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "5e-release-docs-drive-config-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  for (const relative of ["README.md", "DESIGN.md", "LICENSE", ".nvmrc", "package.json", "release-channels.json", "docs", "preview/PREVIEW.md"]) {
    const source = path.join(root, relative);
    const target = path.join(fixture, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true });
  }
  const configRelative = path.join("preview", "assets", "pdf-library", "google-drive.json");
  const configPath = path.join(fixture, configRelative);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.copyFileSync(path.join(root, configRelative), configPath);

  fs.rmSync(configPath);
  const missing = spawnSync(process.execPath, [validator, "--root", fixture], { cwd: root, encoding: "utf8" });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /google-drive\.json/);

  fs.copyFileSync(path.join(root, configRelative), configPath);
  const restored = spawnSync(process.execPath, [validator, "--root", fixture], { cwd: root, encoding: "utf8" });
  assert.equal(restored.status, 0, restored.stderr || restored.stdout);
  assert.match(restored.stdout, /PDF\/Drive metadata schema 1/);
});

test("checksum validation uses exact artifact basenames and bytes", (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "5e-release-docs-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const artifactDir = path.join(fixture, "artifacts");
  fs.mkdirSync(artifactDir);
  const name = "5E.Setup.1.5.8.exe";
  const bytes = Buffer.from("checksum fixture only\n", "utf8");
  fs.writeFileSync(path.join(artifactDir, name), bytes);
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  const checksums = path.join(fixture, "SHA256SUMS.txt");
  fs.writeFileSync(checksums, `${digest}  ${name}\n`);

  const result = spawnSync(process.execPath, [validator, "--artifacts-dir", artifactDir, "--checksums", checksums], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Artifact checksums OK: 1 files/);
});

test("checksum validation rejects the published v1.5.8 wrong basename", (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "5e-release-docs-wrong-name-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const artifactDir = path.join(fixture, "artifacts");
  fs.mkdirSync(artifactDir);
  const bytes = Buffer.from("checksum fixture only\n", "utf8");
  fs.writeFileSync(path.join(artifactDir, "5E.Setup.1.5.8.exe"), bytes);
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  const checksums = path.join(fixture, "SHA256SUMS.txt");
  fs.writeFileSync(checksums, `${digest}  5E Setup 1.5.8.exe\n`);

  const result = spawnSync(process.execPath, [validator, "--artifacts-dir", artifactDir, "--checksums", checksums], {
    cwd: root,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checksum basenames do not match actual artifacts/);
});

test("checksum validation rejects changed artifact bytes", (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "5e-release-docs-changed-bytes-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const artifactDir = path.join(fixture, "artifacts");
  fs.mkdirSync(artifactDir);
  const name = "5E.Setup.1.5.8.exe";
  fs.writeFileSync(path.join(artifactDir, name), "new bytes\n");
  const checksums = path.join(fixture, "SHA256SUMS.txt");
  fs.writeFileSync(checksums, `${"0".repeat(64)}  ${name}\n`);

  const result = spawnSync(process.execPath, [validator, "--artifacts-dir", artifactDir, "--checksums", checksums], {
    cwd: root,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checksum mismatch/);
});

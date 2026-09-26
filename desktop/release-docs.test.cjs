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
  assert.match(result.stdout, /Release docs OK: candidate 1\.6\.0 HOLD/);
  const channels = JSON.parse(fs.readFileSync(path.join(root, "release-channels.json"), "utf8"));
  assert.equal(Object.hasOwn(channels.candidate, "sourceSha"), false);
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

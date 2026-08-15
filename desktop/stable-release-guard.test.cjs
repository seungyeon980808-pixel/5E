const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createStableReleasePlan } = require("../scripts/stabilization/stable-release-guard.cjs");

const SHA = "1234567890abcdef1234567890abcdef12345678";

function stable(overrides = {}) {
  return {
    version: "1.6.0",
    tag: "v1.6.0",
    githubSha: SHA,
    headSha: SHA,
    tagSha: SHA,
    mainAncestor: true,
    installers: ["5E-Setup-1.6.0-windows-x64.exe"],
    audit: { passed: true, version: "1.6.0", commit: SHA },
    notes: "RELEASE_NOTES_v1.6.0.md",
    checksum: { passed: true, file: "SHA256SUMS.txt" },
    ...overrides,
  };
}

test("an exact stable identity and verified bundle produces a draft publish plan", () => {
  assert.deepEqual(createStableReleasePlan(stable()), {
    version: "1.6.0",
    tag: "v1.6.0",
    commit: SHA,
    installer: "5E-Setup-1.6.0-windows-x64.exe",
    checksum: "SHA256SUMS.txt",
    notes: "RELEASE_NOTES_v1.6.0.md",
    draft: true,
    latest: true,
  });
});

for (const [name, overrides, code] of [
  ["RC package version", { version: "1.6.0-rc.1", tag: "v1.6.0-rc.1", installers: [] }, "STABLE_VERSION_REQUIRED"],
  ["RC tag", { tag: "v1.6.0-rc.1" }, "STABLE_TAG_REQUIRED"],
  ["malformed tag value", { tag: 160 }, "STABLE_TAG_REQUIRED"],
  ["shell-shaped tag", { tag: "v1.6.0;git push" }, "STABLE_TAG_REQUIRED"],
  ["leading-zero version", { version: "01.6.0", tag: "v01.6.0" }, "STABLE_VERSION_REQUIRED"],
  ["tag and package mismatch", { tag: "v1.6.1" }, "TAG_VERSION_MISMATCH"],
  ["tag commit mismatch", { tagSha: "a".repeat(40) }, "TAG_COMMIT_MISMATCH"],
  ["checked-out commit mismatch", { headSha: "c".repeat(40) }, "HEAD_COMMIT_MISMATCH"],
  ["event SHA malformed", { githubSha: "main" }, "GITHUB_SHA_INVALID"],
  ["tag SHA malformed", { tagSha: "HEAD" }, "TAG_SHA_INVALID"],
  ["non-main commit", { mainAncestor: false }, "MAIN_ANCESTRY_REQUIRED"],
  ["missing installer", { installers: [] }, "INSTALLER_SET_INVALID"],
  ["extra installer", { installers: ["5E-Setup-1.6.0-windows-x64.exe", "other.exe"] }, "INSTALLER_SET_INVALID"],
  ["wrong installer", { installers: ["setup.exe"] }, "INSTALLER_SET_INVALID"],
  ["failed audit", { audit: { passed: false, version: "1.6.0", commit: SHA } }, "ARTIFACT_AUDIT_REQUIRED"],
  ["metadata version mismatch", { audit: { passed: true, version: "1.5.8", commit: SHA } }, "ARTIFACT_VERSION_MISMATCH"],
  ["metadata commit mismatch", { audit: { passed: true, version: "1.6.0", commit: "b".repeat(40) } }, "ARTIFACT_COMMIT_MISMATCH"],
  ["missing notes", { notes: null }, "RELEASE_NOTES_REQUIRED"],
  ["wrong notes", { notes: "notes.md" }, "RELEASE_NOTES_REQUIRED"],
  ["failed checksum", { checksum: { passed: false, file: "SHA256SUMS.txt" } }, "CHECKSUM_REQUIRED"],
  ["wrong checksum file", { checksum: { passed: true, file: "checksums.txt" } }, "CHECKSUM_REQUIRED"],
]) {
  test(`stable release guard rejects ${name}`, () => {
    assert.throws(() => createStableReleasePlan(stable(overrides)), { code });
  });
}

test("the unchanged RC package is denied before tag resolution or a publish plan", () => {
  const root = path.join(__dirname, "..");
  const result = spawnSync(process.execPath, ["scripts/stabilization/stable-release-cli.cjs", "preflight"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, RELEASE_TAG: "v1.6.0-rc.1", EXPECTED_SHA: SHA },
  });
  assert.equal(result.status, 1);
  const receipt = JSON.parse(result.stderr.trim());
  assert.equal(receipt.code, "STABLE_VERSION_REQUIRED");
  assert.equal(receipt.gate, "stable-release-preflight");
  assert.equal(receipt.state, "failed");
});

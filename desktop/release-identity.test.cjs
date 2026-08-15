const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createTargetFixture, replaceOnce, writeJson } = require("./release-identity-fixture.cjs");
const {
  AUTHORITATIVE_FILES,
  CURRENT_NOTES,
  TARGET_INSTALLER,
  TARGET_VERSION,
  auditReleaseIdentity,
  formatAudit,
} = require("./release-identity-audit.cjs");

const root = path.join(__dirname, "..");

function createMatchingFixture(t) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "5e-release-identity-"));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  createTargetFixture(root, fixture);
  return fixture;
}

test("RC identity contract accepts the aligned authoritative source tree", () => {
  // Given: the source tree whose current release surfaces are aligned to the RC.
  // When: those release surfaces are audited against the RC contract.
  const audit = auditReleaseIdentity(root);
  // Then: no authoritative mismatch remains.
  assert.deepEqual(audit.errors, [], formatAudit(audit));
});

test("RC identity contract rejects each controlled one-field mismatch", async (t) => {
  // Given: a copied fixture whose complete authoritative allowlist matches the RC.
  assert.equal(AUTHORITATIVE_FILES.includes("docs/RELEASE_NOTES_v1.5.8.md"), false);
  const fixture = createMatchingFixture(t);
  assert.equal(auditReleaseIdentity(fixture).errors.length, 0);
  const mutations = [
    ["package-version", "package.json", (value) => { value.version = "9.9.9"; }],
    ["lock-root-version", "package-lock.json", (value) => { value.version = "9.9.9"; }],
    ["lock-package-version", "package-lock.json", (value) => { value.packages[""].version = "9.9.9"; }],
    ["installer-artifact-name", "package.json", (value) => { value.build.artifactName = "wrong.exe"; }],
  ];

  for (const [expectedId, relativePath, mutate] of mutations) {
    await t.test(expectedId, () => {
      // When: exactly one structured field is changed in an isolated fixture copy.
      const copy = fs.mkdtempSync(path.join(os.tmpdir(), "5e-release-identity-mismatch-"));
      try {
        fs.cpSync(fixture, copy, { recursive: true });
        const file = path.join(copy, relativePath);
        const value = JSON.parse(fs.readFileSync(file, "utf8"));
        mutate(value);
        writeJson(file, value);
        // Then: the audit is nonzero-equivalent and names only that field.
        assert.deepEqual(auditReleaseIdentity(copy).errors.map(({ id }) => id), [expectedId]);
      } finally {
        fs.rmSync(copy, { recursive: true, force: true });
      }
    });
  }

  const textMutations = [
    ["footer-version", "index.html", `v${TARGET_VERSION} ·`, "v9.9.9 ·"],
    ["style-cache-version", "index.html", `css/style.css?v=${TARGET_VERSION}`, "css/style.css?v=9.9.9"],
    ["main-cache-version", "index.html", `js/main.js?v=${TARGET_VERSION}`, "js/main.js?v=9.9.9"],
    ["cut-tool-cache-version", "js/main.js", `./cut-tool.js?v=${TARGET_VERSION}`, "./cut-tool.js?v=9.9.9"],
    ["runtime-banner-version", "js/main.js", `[5E v${TARGET_VERSION}]`, "[5E v9.9.9]"],
    ["current-notes-metadata", CURRENT_NOTES, `release-title: v${TARGET_VERSION} `, "release-title: v9.9.9 "],
    ["current-notes-heading", CURRENT_NOTES, `# v${TARGET_VERSION} `, "# v9.9.9 "],
    ["desktop-guide-installer", "docs/DESKTOP_WINDOWS.md", TARGET_INSTALLER, "wrong.exe"],
  ];
  for (const [expectedId, relativePath, original, replacement] of textMutations) {
    await t.test(expectedId, () => {
      const copy = fs.mkdtempSync(path.join(os.tmpdir(), "5e-release-identity-mismatch-"));
      try {
        fs.cpSync(fixture, copy, { recursive: true });
        const file = path.join(copy, relativePath);
        const changed = replaceOnce(fs.readFileSync(file, "utf8"), new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), replacement, expectedId);
        fs.writeFileSync(file, changed);
        assert.deepEqual(auditReleaseIdentity(copy).errors.map(({ id }) => id), [expectedId]);
      } finally {
        fs.rmSync(copy, { recursive: true, force: true });
      }
    });
  }
});

test("RC identity contract fails closed for malformed and missing authority", async (t) => {
  const cases = [
    ["malformed package", "package.json", "{"],
    ["missing current notes", CURRENT_NOTES, null],
  ];
  for (const [name, relativePath, contents] of cases) {
    await t.test(name, () => {
      // Given: an otherwise matching copied fixture with one unreadable authority.
      const fixture = createMatchingFixture(t);
      const file = path.join(fixture, relativePath);
      if (contents === null) fs.rmSync(file);
      else fs.writeFileSync(file, contents);
      // When: the release identity is audited.
      const audit = auditReleaseIdentity(fixture);
      // Then: it fails as a contract mismatch instead of crashing the harness.
      assert.ok(audit.errors.length > 0);
      assert.match(formatAudit(audit), /<malformed JSON>|<missing file>/);
    });
  }
});

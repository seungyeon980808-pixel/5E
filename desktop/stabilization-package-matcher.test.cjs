const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { auditPackageSources } = require("../scripts/stabilization/package-assets-audit.cjs");

const BASE_POLICY = Object.freeze({
  schema: "5e-package-assets-policy-v1",
  assetRoot: "assets",
  allowedAssetRoots: ["assets", "assets/exam-parts", "assets/svg_object"],
  requiredRuntime: ["index.html"],
  forbiddenBuildPatterns: ["assets/**/*"],
  forbiddenAssetRoots: ["assets/exam-library", "assets/parts-library"],
});

function fixture(buildFiles, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "5e-package-matcher-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ build: { files: buildFiles } }));
  for (const [relativePath, contents] of Object.entries(files)) {
    const destination = path.join(root, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, contents);
  }
  return root;
}

function audit(buildFiles, files, policy = BASE_POLICY) {
  const root = fixture(buildFiles, files);
  try {
    return auditPackageSources({ root, policy });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function directoryLink(target, linkPath) {
  fs.symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
}

test("build.files string **/* includes nested files and exposes forbidden assets", () => {
  // Given
  const files = { "index.html": "app", "assets/exam-library/a.png": "abc" };

  // When
  const report = audit("**/*", files);

  // Then
  assert.deepEqual(report.assetFamilies, [{ path: "assets/exam-library", files: 1, bytes: 3 }]);
  assert.ok(report.violations.some(({ code, value }) =>
    code === "FORBIDDEN_ASSET_ROOT" && value === "assets/exam-library"));
});

test("directory patterns include their descendants", () => {
  // Given
  const files = { "index.html": "app", "assets/exam-parts/nested/a.svg": "xy" };

  // When
  const report = audit(["index.html", "assets/exam-parts"], files);

  // Then
  assert.deepEqual(report.assetFamilies, [{ path: "assets/exam-parts", files: 1, bytes: 2 }]);
});

test("ordered negation permits a later positive pattern to re-include files", () => {
  // Given
  const files = {
    "index.html": "app",
    "assets/exam-parts/allowed.svg": "ok",
    "assets/unlisted/rejected.svg": "no",
  };

  // When
  const report = audit(["assets/**/*", "!assets/**/*", "assets/exam-parts/**/*", "index.html"], files);

  // Then
  assert.deepEqual(report.assetFamilies, [{ path: "assets/exam-parts", files: 1, bytes: 2 }]);
  assert.equal(report.violations.some(({ code }) => code === "UNAPPROVED_ASSET_ROOT"), false);
});

test("FileSet from/filter forms resolve sources and reject unsupported keys", () => {
  // Given
  const files = {
    "index.html": "app",
    "assets/exam-parts/a.svg": "ok",
    "assets/exam-library/no.svg": "no",
  };

  // When
  const report = audit(
    { from: "assets", to: "assets", filter: ["**/*", "!exam-library/**/*"] },
    files,
  );

  // Then
  assert.deepEqual(report.assetFamilies, [{ path: "assets/exam-parts", files: 1, bytes: 2 }]);
  assert.throws(
    () => audit({ from: "assets", filter: "**/*", extra: true }, files),
    { code: "UNSUPPORTED_FILE_SET" },
  );
});

test("every included unapproved first-level asset family is a violation", () => {
  // Given
  const files = {
    "index.html": "app",
    "assets/app-icon.png": "i",
    "assets/rogue/a.png": "r",
    "assets/unknown/b.png": "u",
  };

  // When
  const report = audit(["index.html", "assets/**/*"], files);

  // Then
  assert.deepEqual(report.violations.filter(({ code }) => code === "UNAPPROVED_ASSET_ROOT"), [
    { code: "UNAPPROVED_ASSET_ROOT", value: "assets/rogue" },
    { code: "UNAPPROVED_ASSET_ROOT", value: "assets/unknown" },
  ]);
});

test("policy paths cannot be absolute or traverse outside the audited root", () => {
  // Given
  const files = { "index.html": "app" };
  const policies = [
    { ...BASE_POLICY, requiredRuntime: ["../outside.js"] },
    { ...BASE_POLICY, allowedAssetRoots: [path.resolve(os.tmpdir(), "outside")] },
  ];

  // When / Then
  for (const policy of policies) {
    assert.throws(() => audit(["index.html"], files, policy), { code: "POLICY_PATH_OUTSIDE_ROOT" });
  }
});

test("unsupported minimatch constructs fail closed with a stable error", () => {
  // Given
  const patterns = ["assets/{one,two}/**/*", "assets/[ab]/**/*", "assets/@(one|two)/**/*", "assets/\\*.png"];

  // When / Then
  for (const pattern of patterns) {
    assert.throws(
      () => audit(["index.html", pattern], { "index.html": "app" }),
      { code: "UNSUPPORTED_GLOB_SYNTAX" },
    );
  }
});

test("unsupported glob syntax makes the CLI exit 2 before emitting a report", () => {
  // Given
  const root = fixture(["assets/{one,two}/**/*"], { "index.html": "app" });
  const policyPath = path.join(root, "policy.json");
  fs.writeFileSync(policyPath, JSON.stringify(BASE_POLICY));
  const cli = path.join(__dirname, "..", "scripts", "stabilization", "package-assets-audit.cjs");

  try {
    // When
    const result = spawnSync(process.execPath, [cli, "--root", root, "--policy", policyPath], { encoding: "utf8" });

    // Then
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(JSON.parse(result.stderr).code, "UNSUPPORTED_GLOB_SYNTAX");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("default string patterns and FileSets remain independent union scopes", () => {
  // Given
  const files = { "index.html": "app", "assets/exam-parts/a.svg": "ok" };

  // When
  const report = audit([
    "assets/exam-parts/**/*",
    { from: "assets", filter: ["**/*", "!exam-parts/**/*"] },
  ], files);

  // Then
  assert.deepEqual(report.assetFamilies, [{ path: "assets/exam-parts", files: 1, bytes: 2 }]);
});

test("top-level assetRoot junctions cannot escape the canonical audit root", () => {
  // Given
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "5e-package-outside-"));
  const root = fixture(["assets/**/*", "index.html"], { "index.html": "app" });
  fs.writeFileSync(path.join(outside, "secret.png"), "secret");
  directoryLink(outside, path.join(root, "assets"));

  try {
    // When / Then
    assert.throws(() => auditPackageSources({ root, policy: BASE_POLICY }), { code: "PACKAGE_PATH_OUTSIDE_ROOT" });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("nested asset junctions cannot escape the canonical audit root", () => {
  // Given
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "5e-package-outside-"));
  const root = fixture(["assets/**/*", "index.html"], { "index.html": "app", "assets/root.png": "ok" });
  fs.writeFileSync(path.join(outside, "secret.png"), "secret");
  directoryLink(outside, path.join(root, "assets", "escape"));

  try {
    // When / Then
    assert.throws(() => auditPackageSources({ root, policy: BASE_POLICY }), { code: "PACKAGE_PATH_OUTSIDE_ROOT" });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

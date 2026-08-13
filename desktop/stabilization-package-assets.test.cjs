const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const modulePath = path.join(__dirname, "..", "scripts", "stabilization", "package-assets-audit.cjs");
const auditModule = fs.existsSync(modulePath) ? require(modulePath) : {};
const { auditPackageSources } = auditModule;

const POLICY = Object.freeze({
  schema: "5e-package-assets-policy-v1",
  assetRoot: "assets",
  allowedAssetRoots: ["assets", "assets/alpha", "assets/exam-parts", "assets/svg_object", "assets/zeta"],
  requiredRuntime: ["index.html", "desktop/main.cjs"],
  forbiddenBuildPatterns: ["assets/**/*"],
  forbiddenAssetRoots: ["assets/exam-library", "assets/parts-library"],
});

function writeFile(root, relativePath, contents = "x") {
  const destination = path.join(root, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, contents);
}

function createWorkspace(buildFiles, files, policy = POLICY) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "5e-package-audit-"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ build: { files: buildFiles } }));
  for (const [relativePath, contents] of Object.entries(files)) writeFile(root, relativePath, contents);
  const policyPath = path.join(root, "policy.json");
  fs.writeFileSync(policyPath, JSON.stringify(policy));
  return { root, policyPath };
}

function removeWorkspace(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

test("reports deterministic included asset-family counts and runtime presence", () => {
  // Given
  assert.equal(typeof auditPackageSources, "function");
  const workspace = createWorkspace(
    ["assets/zeta/**/*", "index.html", "desktop/**/*", "assets/alpha/**/*"],
    {
      "assets/zeta/z.bin": "1234",
      "assets/alpha/b.bin": "12",
      "assets/alpha/a.bin": "3",
      "assets/ignored/no.bin": "ignored",
      "index.html": "app",
      "desktop/main.cjs": "runtime",
    },
  );

  try {
    // When
    const report = auditPackageSources({ root: workspace.root, policy: POLICY });

    // Then
    assert.deepEqual(report.assetFamilies, [
      { path: "assets/alpha", files: 2, bytes: 3 },
      { path: "assets/zeta", files: 1, bytes: 4 },
    ]);
    assert.deepEqual(report.requiredRuntime, [
      { path: "desktop/main.cjs", present: true, included: true },
      { path: "index.html", present: true, included: true },
    ]);
    assert.deepEqual(report.violations, []);
  } finally {
    removeWorkspace(workspace.root);
  }
});

test("reports broad asset patterns and forbidden asset roots in stable order", () => {
  // Given
  assert.equal(typeof auditPackageSources, "function");
  const workspace = createWorkspace(
    ["index.html", "desktop/**/*", "assets/**/*"],
    { "index.html": "app", "desktop/main.cjs": "runtime" },
  );

  try {
    // When
    const report = auditPackageSources({ root: workspace.root, policy: POLICY });

    // Then
    assert.deepEqual(report.violations, [
      { code: "FORBIDDEN_ASSET_ROOT", value: "assets/exam-library" },
      { code: "FORBIDDEN_ASSET_ROOT", value: "assets/parts-library" },
      { code: "FORBIDDEN_BUILD_PATTERN", value: "assets/**/*" },
    ]);
  } finally {
    removeWorkspace(workspace.root);
  }
});

test("reports required runtime files that are missing or excluded", () => {
  // Given
  assert.equal(typeof auditPackageSources, "function");
  const policy = {
    ...POLICY,
    requiredRuntime: ["index.html", "desktop/main.cjs", "js/main.js"],
  };
  const workspace = createWorkspace(["index.html"], { "index.html": "app", "js/main.js": "runtime" }, policy);

  try {
    // When
    const report = auditPackageSources({ root: workspace.root, policy });

    // Then
    assert.deepEqual(report.requiredRuntime, [
      { path: "desktop/main.cjs", present: false, included: false },
      { path: "index.html", present: true, included: true },
      { path: "js/main.js", present: true, included: false },
    ]);
    assert.deepEqual(report.violations, [
      { code: "REQUIRED_RUNTIME_EXCLUDED", value: "js/main.js" },
      { code: "REQUIRED_RUNTIME_MISSING", value: "desktop/main.cjs" },
    ]);
  } finally {
    removeWorkspace(workspace.root);
  }
});

test("CLI reports violations without failing unless strict mode is requested", () => {
  // Given
  assert.equal(typeof auditPackageSources, "function");
  const workspace = createWorkspace(
    ["index.html", "desktop/**/*", "assets/**/*"],
    { "index.html": "app", "desktop/main.cjs": "runtime", "assets/exam-library/a.png": "image" },
  );
  const args = [modulePath, "--root", workspace.root, "--policy", workspace.policyPath];

  try {
    // When
    const reportOnly = spawnSync(process.execPath, args, { encoding: "utf8" });
    const strict = spawnSync(process.execPath, [...args, "--strict"], { encoding: "utf8" });

    // Then
    assert.equal(reportOnly.status, 0);
    assert.equal(strict.status, 1);
    assert.deepEqual(JSON.parse(reportOnly.stdout).violations, JSON.parse(strict.stdout).violations);
    assert.equal(JSON.parse(reportOnly.stdout).schema, "5e-package-source-audit-v1");
  } finally {
    removeWorkspace(workspace.root);
  }
});

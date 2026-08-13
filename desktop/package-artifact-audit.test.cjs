const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const modulePath = path.join(__dirname, "..", "scripts", "stabilization", "package-artifact-audit.cjs");
const auditModule = fs.existsSync(modulePath) ? require(modulePath) : {};
const { auditPackageArtifact } = auditModule;

const POLICY = Object.freeze({
  schema: "5e-package-artifact-policy@1",
  allowedRoots: ["package.json", "build-identity.json", "index.html", "desktop", "js", "css", "fonts", "vendor/pdfjs", "assets/exam-parts", "assets/svg_object"],
  requiredFiles: ["package.json", "build-identity.json", "index.html", "desktop/main.cjs", "js/main.js", "fonts/lmroman10-regular.woff2", "vendor/pdfjs/pdf.min.mjs"],
  forbiddenRoots: ["assets/exam-library", "assets/parts-library"],
});

function writeFiles(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const target = path.join(root, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
}

function pickle(payload) {
  const aligned = Math.ceil(payload.length / 4) * 4;
  const output = Buffer.alloc(4 + aligned);
  output.writeUInt32LE(aligned, 0);
  payload.copy(output, 4);
  return output;
}

function writeAsar(filename, files) {
  let offset = 0;
  const header = { files: {} };
  const bodies = [];
  for (const [relativePath, contents] of Object.entries(files)) {
    const body = Buffer.from(contents);
    let node = header;
    const segments = relativePath.split("/");
    segments.forEach((segment, index) => {
      node.files ||= {};
      if (index === segments.length - 1) node.files[segment] = { size: body.length, offset: String(offset) };
      else node = node.files[segment] ||= { files: {} };
    });
    bodies.push(body);
    offset += body.length;
  }
  const json = Buffer.from(JSON.stringify(header));
  const headerPayload = Buffer.alloc(4 + json.length);
  headerPayload.writeUInt32LE(json.length, 0);
  json.copy(headerPayload, 4);
  const headerPickle = pickle(headerPayload);
  const sizePayload = Buffer.alloc(4);
  sizePayload.writeUInt32LE(headerPickle.length, 0);
  fs.writeFileSync(filename, Buffer.concat([pickle(sizePayload), headerPickle, ...bodies]));
}

function appFiles(extra = {}) {
  return {
    "package.json": JSON.stringify({ version: "1.5.8" }),
    "build-identity.json": JSON.stringify({ version: "1.5.8", commit: "abc123" }),
    "index.html": "web", "desktop/main.cjs": "desktop", "js/main.js": "ui",
    "fonts/lmroman10-regular.woff2": "font", "vendor/pdfjs/pdf.min.mjs": "pdf", ...extra,
  };
}

test("directory artifact reports sorted files sizes policy and identity parity", () => {
  // Given
  assert.equal(typeof auditPackageArtifact, "function");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "5e-artifact-dir-"));
  writeFiles(root, appFiles({ "assets/exam-library/original.png": "forbidden" }));

  try {
    // When
    const report = auditPackageArtifact({ artifactPath: root, policy: POLICY, webIdentity: { version: "1.5.8", commit: "abc123" } });

    // Then
    assert.equal(report.kind, "unpacked");
    assert.deepEqual(report.files.map(({ path: file }) => file), [...report.files.map(({ path: file }) => file)].sort());
    assert.equal(report.totalFileBytes, report.files.reduce((sum, file) => sum + file.bytes, 0));
    assert.deepEqual(report.identity, { web: { version: "1.5.8", commit: "abc123" }, desktop: { version: "1.5.8", commit: "abc123" }, matches: true });
    assert.deepEqual(report.violations, [{ code: "FORBIDDEN_ARTIFACT_ROOT", value: "assets/exam-library/original.png" }]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("asar and staged artifacts are inspected instead of assumed clean", () => {
  // Given
  assert.equal(typeof auditPackageArtifact, "function");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "5e-artifact-asar-"));
  const archive = path.join(root, "app.asar");
  writeAsar(archive, appFiles({ "assets/parts-library/source.svg": "forbidden" }));
  const staged = path.join(root, "staged");
  fs.mkdirSync(path.join(staged, "resources"), { recursive: true });
  fs.copyFileSync(archive, path.join(staged, "resources", "app.asar"));
  fs.writeFileSync(path.join(staged, "5E.exe"), "launcher");

  try {
    // When
    const asarReport = auditPackageArtifact({ artifactPath: archive, policy: POLICY, webIdentity: { version: "1.5.8", commit: "abc123" } });
    const stagedReport = auditPackageArtifact({ artifactPath: staged, policy: POLICY, webIdentity: { version: "1.5.8", commit: "abc123" } });

    // Then
    assert.equal(asarReport.kind, "asar");
    assert.equal(stagedReport.kind, "staged");
    assert.equal(stagedReport.artifactBytes > asarReport.artifactBytes, true);
    assert.equal(stagedReport.violations.some(({ code }) => code === "FORBIDDEN_ARTIFACT_ROOT"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("artifact audit exposes missing runtimes and web desktop identity mismatch", () => {
  // Given
  assert.equal(typeof auditPackageArtifact, "function");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "5e-artifact-debt-"));
  writeFiles(root, {
    "package.json": JSON.stringify({ version: "1.5.7", buildCommit: "desktop-sha" }),
    "build-identity.json": JSON.stringify({ version: "1.5.7", commit: "desktop-sha" }),
  });

  try {
    // When
    const report = auditPackageArtifact({ artifactPath: root, policy: POLICY, webIdentity: { version: "1.5.8", commit: "web-sha" } });

    // Then
    assert.equal(report.identity.matches, false);
    assert.equal(report.violations.some(({ code }) => code === "REQUIRED_ARTIFACT_FILE_MISSING"), true);
    assert.equal(report.violations.some(({ code }) => code === "WEB_DESKTOP_VERSION_MISMATCH"), true);
    assert.equal(report.violations.some(({ code }) => code === "WEB_DESKTOP_COMMIT_MISMATCH"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("asar traversal-like entry names fail closed", () => {
  // Given
  assert.equal(typeof auditPackageArtifact, "function");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "5e-artifact-traversal-"));
  const archive = path.join(root, "app.asar");
  writeAsar(archive, appFiles());
  const buffer = fs.readFileSync(archive);
  const marker = Buffer.from("package.json");
  const index = buffer.indexOf(marker);
  marker.copy(buffer, index);
  buffer[index] = 0x2e;
  buffer[index + 1] = 0x2e;
  buffer[index + 2] = 0x2f;
  fs.writeFileSync(archive, buffer);

  try {
    // When / Then
    assert.throws(
      () => auditPackageArtifact({ artifactPath: archive, policy: POLICY, webIdentity: { version: "1.5.8", commit: "abc123" } }),
      { code: "INVALID_ASAR_PATH" },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("asar body truncation fails closed", () => {
  // Given
  assert.equal(typeof auditPackageArtifact, "function");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "5e-artifact-truncated-"));
  const archive = path.join(root, "app.asar");
  writeAsar(archive, appFiles());
  const buffer = fs.readFileSync(archive);
  fs.writeFileSync(archive, buffer.subarray(0, buffer.length - 1));

  try {
    // When / Then
    assert.throws(
      () => auditPackageArtifact({ artifactPath: archive, policy: POLICY, webIdentity: { version: "1.5.8", commit: "abc123" } }),
      { code: "INVALID_ASAR_ENTRY" },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

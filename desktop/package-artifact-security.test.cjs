const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const POLICY = require(path.join(ROOT, "scripts", "stabilization", "package-artifact-policy.json"));
const { auditPackageArtifact } = require(path.join(ROOT, "scripts", "stabilization", "package-artifact-audit.cjs"));
const { openArtifact } = require(path.join(ROOT, "scripts", "stabilization", "package-artifact-reader.cjs"));

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

function writeUnpackedAsar(filename, relativePath, bytes) {
  const header = { files: {} };
  let node = header;
  const segments = relativePath.split("/");
  segments.forEach((segment, index) => {
    node.files ||= {};
    if (index === segments.length - 1) node.files[segment] = { size: bytes, unpacked: true };
    else node = node.files[segment] ||= { files: {} };
  });
  const json = Buffer.from(JSON.stringify(header));
  const headerPayload = Buffer.alloc(4 + json.length);
  headerPayload.writeUInt32LE(json.length, 0);
  json.copy(headerPayload, 4);
  const headerPickle = pickle(headerPayload);
  const sizePayload = Buffer.alloc(4);
  sizePayload.writeUInt32LE(headerPickle.length, 0);
  fs.writeFileSync(filename, Buffer.concat([pickle(sizePayload), headerPickle]));
}

test("desktop tests benchmarks smoke probes and dev helpers are unapproved", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "5e-artifact-runtime-policy-"));
  writeFiles(root, {
    "package.json": JSON.stringify({ version: "1.5.8", buildCommit: "abc123" }),
    "desktop/main.test.cjs": "test",
    "desktop/benchmark-image-turn.cjs": "benchmark",
    "desktop/run-smoke.cjs": "smoke",
    "desktop/browser-served-probe.cjs": "probe",
    "desktop/example-dev.cjs": "dev",
  });
  try {
    const report = auditPackageArtifact({
      artifactPath: root,
      policy: POLICY,
      webIdentity: { version: "1.5.8", commit: "abc123" },
    });
    for (const relativePath of [
      "desktop/main.test.cjs", "desktop/benchmark-image-turn.cjs", "desktop/run-smoke.cjs",
      "desktop/browser-served-probe.cjs", "desktop/example-dev.cjs",
    ]) {
      assert.ok(report.violations.some(({ code, value }) => code === "UNAPPROVED_ARTIFACT_PATH" && value === relativePath));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("required PDF runtime tree detects a missing full-manifest member", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "5e-artifact-pdf-tree-"));
  writeFiles(root, {
    "package.json": JSON.stringify({ version: "1.5.8", buildCommit: "abc123" }),
    "vendor/pdfjs/cmaps/A.bcmap": "present",
  });
  try {
    const report = auditPackageArtifact({
      artifactPath: root,
      policy: {
        schema: "test-policy@1",
        allowedRoots: ["package.json", "vendor/pdfjs/cmaps"],
        requiredFiles: ["package.json"],
        requiredTrees: [{ root: "vendor/pdfjs/cmaps", files: ["A.bcmap", "B.bcmap"] }],
        forbiddenRoots: [],
      },
      webIdentity: { version: "1.5.8", commit: "abc123" },
    });
    assert.ok(report.violations.some(({ code, value }) =>
      code === "REQUIRED_ARTIFACT_FILE_MISSING" && value === "vendor/pdfjs/cmaps/B.bcmap"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("PDF runtime policy freezes the complete checked-in font and CMap manifests", () => {
  for (const relativeRoot of ["vendor/pdfjs/standard_fonts", "vendor/pdfjs/cmaps"]) {
    const requiredTree = POLICY.requiredTrees?.find(({ root }) => root === relativeRoot);
    assert.ok(requiredTree, `missing required tree: ${relativeRoot}`);
    const sourceFiles = fs.readdirSync(path.join(ROOT, ...relativeRoot.split("/"))).sort();
    assert.deepEqual([...requiredTree.files].sort(), sourceFiles);
  }
});

test("unpacked ASAR parent links cannot escape the canonical unpacked root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "5e-artifact-unpacked-link-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "5e-artifact-unpacked-outside-"));
  const archive = path.join(root, "app.asar");
  const unpackedRoot = `${archive}.unpacked`;
  const body = Buffer.from("outside secret");
  fs.writeFileSync(path.join(outside, "payload.bin"), body);
  fs.mkdirSync(unpackedRoot);
  fs.symlinkSync(outside, path.join(unpackedRoot, "linked"), process.platform === "win32" ? "junction" : "dir");
  writeUnpackedAsar(archive, "linked/payload.bin", body.length);
  try {
    assert.throws(() => openArtifact(archive), { code: "ARTIFACT_PATH_OUTSIDE_ROOT" });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

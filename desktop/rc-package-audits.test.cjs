const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SHA = "a".repeat(40);
const VERSION = "1.6.0-rc.1";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "5e-rc-audits-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const scripts = path.join(root, "scripts", "stabilization");
  const output = path.join(root, "release-candidates", "candidate");
  const unpacked = path.join(output, "win-unpacked");
  const asar = path.join(unpacked, "resources", "app.asar");
  fs.mkdirSync(path.dirname(asar), { recursive: true });
  for (const relative of [
    "package.json", "desktop/main.cjs", "desktop/preload.cjs", "index.html", "js/main.js",
    "js/pdf-document-index.mjs", "vendor/pdfjs/pdf.min.mjs", "vendor/pdfjs/pdf.worker.min.mjs",
    "scripts/stabilization/package-assets-audit.cjs", "scripts/stabilization/package-artifact-audit.cjs",
    "scripts/stabilization/package-artifact-reader.cjs",
  ]) {
    const file = path.join(root, ...relative.split("/"));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, relative === "package.json" ? JSON.stringify({ version: VERSION }) : "fixture");
  }
  fs.writeFileSync(path.join(scripts, "package-assets-policy.json"), JSON.stringify({
    requiredRuntime: ["desktop/main.cjs", "desktop/preload.cjs", "index.html", "js/main.js",
      "js/pdf-document-index.mjs", "vendor/pdfjs/pdf.min.mjs", "vendor/pdfjs/pdf.worker.min.mjs"],
  }));
  fs.writeFileSync(path.join(scripts, "package-artifact-policy.json"), "{}");
  fs.writeFileSync(asar, "asar");
  fs.writeFileSync(path.join(unpacked, "5E.exe"), "exe");
  fs.writeFileSync(path.join(output, "5E-Setup-1.6.0-rc.1-windows-x64.exe"), "installer");
  return { root, output, unpacked, asar };
}

function sourceReport() {
  const requiredRuntime = ["desktop/main.cjs", "desktop/preload.cjs", "index.html", "js/main.js",
    "js/pdf-document-index.mjs", "vendor/pdfjs/pdf.min.mjs", "vendor/pdfjs/pdf.worker.min.mjs"]
    .map((file) => ({ path: file, present: true, included: true }));
  return { schema: "5e-package-source-audit-v1", requiredRuntime, violations: [] };
}

function artifactReport(item) {
  return {
    schema: "5e-package-artifact-audit@1", artifactPath: path.resolve(item.unpacked), kind: "staged",
    identity: { web: { version: VERSION, commit: SHA }, desktop: { version: VERSION, commit: SHA }, matches: true },
    violations: [],
  };
}

function runner(item, mutate = () => {}) {
  return (_file, args) => {
    const artifact = args.includes("--artifact");
    mutate(artifact, item);
    return { status: 0, signal: null, stdout: JSON.stringify(artifact ? artifactReport(item) : sourceReport()), stderr: "" };
  };
}

function outputs(item) {
  return {
    installer: path.join(item.output, "5E-Setup-1.6.0-rc.1-windows-x64.exe"),
    unpackedExecutable: path.join(item.unpacked, "5E.exe"), asar: item.asar,
  };
}

test("Given strict audit reports, When source and staged payload are audited, Then structured policy reports are returned", (t) => {
  const item = fixture(t);
  const { createAuditSession } = require("../scripts/stabilization/rc-package-audits.cjs");
  const calls = [];
  const runCommand = (...args) => { calls.push(args); return runner(item)(...args); };
  const session = createAuditSession({ ...item, commit: SHA, version: VERSION, runCommand });
  const source = session.auditSource();
  const reports = session.auditArtifact(outputs(item));
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0][1].slice(-3), ["--strict", "--root", item.root]);
  assert.deepEqual(calls[1][1].slice(-7), ["--strict", "--artifact", item.unpacked, "--web-version", VERSION, "--web-commit", SHA]);
  assert.deepEqual(reports, {
    source, stagedPayload: artifactReport(item), installer: { metadata: "pending", asarAudited: false },
  });
});

for (const [name, result, code] of [
  ["nonzero source audit", { status: 1, stdout: JSON.stringify(sourceReport()), stderr: "private path" }, "SOURCE_AUDIT_FAILED"],
  ["malformed source JSON", { status: 0, stdout: "not-json", stderr: "private path" }, "SOURCE_AUDIT_REPORT_INVALID"],
  ["duplicate source JSON", { status: 0, stdout: "{}\n{}", stderr: "private path" }, "SOURCE_AUDIT_REPORT_INVALID"],
  ["source violations", { status: 0, stdout: JSON.stringify({ ...sourceReport(), violations: [{ code: "X" }] }) }, "SOURCE_AUDIT_POLICY_REJECTED"],
  ["missing runtime", { status: 0, stdout: JSON.stringify({ ...sourceReport(), requiredRuntime: sourceReport().requiredRuntime.slice(1) }) }, "SOURCE_AUDIT_RUNTIME_INVALID"],
  ["source timeout", { status: null, error: { code: "ETIMEDOUT" }, stdout: "", stderr: "private path" }, "SOURCE_AUDIT_TIMEOUT"],
  ["thrown source failure", () => { throw new Error("private path"); }, "SOURCE_AUDIT_EXEC_FAILED"],
]) {
  test(`Given ${name}, When source audit runs, Then packaging fails closed without leaking diagnostics`, (t) => {
    const item = fixture(t);
    const { createAuditSession } = require("../scripts/stabilization/rc-package-audits.cjs");
    const session = createAuditSession({ ...item, commit: SHA, version: VERSION, runCommand: () => typeof result === "function" ? result() : result });
    assert.throws(() => session.auditSource(), (error) => error.message === code && !/private|path/i.test(error.message));
  });
}

for (const [name, makeResult, code] of [
  ["nonzero", (item) => ({ status: 1, stdout: JSON.stringify(artifactReport(item)), stderr: "private path" }), "ARTIFACT_AUDIT_FAILED"],
  ["malformed JSON", () => ({ status: 0, stdout: "not-json" }), "ARTIFACT_AUDIT_REPORT_INVALID"],
  ["duplicate JSON", () => ({ status: 0, stdout: "{}\n{}" }), "ARTIFACT_AUDIT_REPORT_INVALID"],
  ["policy violation", (item) => ({ status: 0, stdout: JSON.stringify({ ...artifactReport(item), violations: [{ code: "X" }] }) }), "ARTIFACT_AUDIT_POLICY_REJECTED"],
  ["identity mismatch", (item) => ({ status: 0, stdout: JSON.stringify({ ...artifactReport(item), identity: { ...artifactReport(item).identity, matches: false } }) }), "ARTIFACT_AUDIT_IDENTITY_INVALID"],
  ["timeout", () => ({ status: null, error: { code: "ETIMEDOUT" }, stderr: "private path" }), "ARTIFACT_AUDIT_TIMEOUT"],
]) {
  test(`Given artifact audit ${name}, When staged payload is checked, Then packaging fails closed`, (t) => {
    const item = fixture(t);
    const { createAuditSession } = require("../scripts/stabilization/rc-package-audits.cjs");
    const runCommand = (_file, args) => args.includes("--artifact") ? makeResult(item) : runner(item)(_file, args);
    const session = createAuditSession({ ...item, commit: SHA, version: VERSION, runCommand });
    session.auditSource();
    assert.throws(() => session.auditArtifact(outputs(item)), (error) => error.message === code && !/private|path/i.test(error.message));
  });
}

test("Given source mutation, When artifact audit runs, Then the frozen source snapshot rejects it", (t) => {
  const item = fixture(t);
  const { createAuditSession } = require("../scripts/stabilization/rc-package-audits.cjs");
  const changed = createAuditSession({ ...item, commit: SHA, version: VERSION, runCommand: (_file, args) => {
    if (args.includes("--artifact")) fs.appendFileSync(path.join(item.root, "package.json"), " ");
    return { status: 0, stdout: JSON.stringify(args.includes("--artifact") ? artifactReport(item) : sourceReport()) };
  } });
  changed.auditSource();
  assert.throws(() => changed.auditArtifact(outputs(item)), /SOURCE_SNAPSHOT_CHANGED/);
});

test("Given output mutation, When artifact audit runs, Then the frozen payload snapshot rejects it", (t) => {
  const item = fixture(t);
  const { createAuditSession } = require("../scripts/stabilization/rc-package-audits.cjs");
  const session = createAuditSession({ ...item, commit: SHA, version: VERSION, runCommand: runner(item, (artifact) => {
    if (artifact) fs.appendFileSync(item.asar, "changed");
  }) });
  session.auditSource();
  assert.throws(() => session.auditArtifact(outputs(item)), /OUTPUT_SNAPSHOT_CHANGED/);
});

test("Given a wrong staged path, When artifact audit begins, Then the auditor is not invoked", (t) => {
  const item = fixture(t);
  const { createAuditSession } = require("../scripts/stabilization/rc-package-audits.cjs");
  let calls = 0;
  const session = createAuditSession({ ...item, commit: SHA, version: VERSION, runCommand: (...args) => (calls++, runner(item)(...args)) });
  session.auditSource();
  assert.throws(() => session.auditArtifact({ installer: "x", unpackedExecutable: "y", asar: path.join(item.output, "other.asar") }), /ARTIFACT_PATH_INVALID/);
  assert.equal(calls, 1);
});

test("Given a real NTFS hardlink to an authority file, When snapshots are captured, Then the source is rejected", { skip: process.platform !== "win32" }, (t) => {
  const item = fixture(t);
  fs.linkSync(path.join(item.root, "package.json"), path.join(item.root, "package-hardlink.json"));
  const { createAuditSession } = require("../scripts/stabilization/rc-package-audits.cjs");
  assert.throws(
    () => createAuditSession({ ...item, commit: SHA, version: VERSION, runCommand: runner(item) }),
    /AUDIT_SNAPSHOT_LINK_COUNT_INVALID/,
  );
});

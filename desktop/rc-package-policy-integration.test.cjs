const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { packageRc } = require("../scripts/stabilization/rc-package-orchestrator.cjs");

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
}

function fixture(t) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "5e-rc-policy-integration-"));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const root = path.join(sandbox, "source");
  const output = path.join(root, "release-candidates", "candidate");
  fs.mkdirSync(path.join(root, "node_modules", "electron-builder", "out", "cli"), { recursive: true });
  fs.mkdirSync(path.dirname(output));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "1.6.0-rc.1" }));
  fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\nrelease-candidates/\n");
  fs.writeFileSync(path.join(root, "node_modules", "electron-builder", "out", "cli", "cli.js"), "builder");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "user.name", "Fixture"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "fixture"]);
  return { root, output };
}

function writeOutputs(output) {
  fs.mkdirSync(path.join(output, "win-unpacked", "resources"), { recursive: true });
  fs.writeFileSync(path.join(output, "5E-Setup-1.6.0-rc.1-windows-x64.exe"), "installer");
  fs.writeFileSync(path.join(output, "win-unpacked", "5E.exe"), "runtime");
  fs.writeFileSync(path.join(output, "win-unpacked", "resources", "app.asar"), "asar");
}

function builder(events) {
  return (_file, args) => {
    events.push("builder");
    const output = args.find((arg) => arg.startsWith("-c.directories.output=")).slice("-c.directories.output=".length);
    writeOutputs(output);
    return { status: 0 };
  };
}

test("Given clean source and outputs, When packaging completes, Then policy audits bracket the builder and bind the receipt", (t) => {
  const item = fixture(t);
  const events = [];
  const reports = Object.freeze({
    source: { violations: [] }, stagedPayload: { identity: { matches: true }, violations: [] },
    installer: { metadata: "pending", asarAudited: false },
  });
  const createAuditSession = () => ({
    auditSource() { events.push("source-audit"); return reports.source; },
    auditArtifact(outputs) {
      events.push("artifact-audit");
      assert.equal(outputs.asar, path.join(item.output, "win-unpacked", "resources", "app.asar"));
      return reports;
    },
  });
  const receipt = packageRc({ ...item, runCommand: builder(events), createAuditSession });
  assert.deepEqual(events, ["source-audit", "builder", "artifact-audit"]);
  assert.equal(receipt.state, "artifact_policy_validated");
  assert.deepEqual(receipt.policyReports, reports);
  assert.deepEqual(receipt.policyReports.installer, { metadata: "pending", asarAudited: false });
});

test("Given source policy rejection, When packaging starts, Then builder and output reservation never run", (t) => {
  const item = fixture(t);
  let builderCalls = 0;
  const createAuditSession = () => ({ auditSource() { throw new Error("SOURCE_AUDIT_POLICY_REJECTED"); } });
  assert.throws(() => packageRc({ ...item, createAuditSession, runCommand: () => (builderCalls++, { status: 0 }) }), /SOURCE_AUDIT_POLICY_REJECTED/);
  assert.equal(builderCalls, 0);
  assert.equal(fs.existsSync(item.output), false);
});

test("Given source auditor Git mutation, When the pre-build invariant runs, Then no builder executes", (t) => {
  const item = fixture(t);
  let builderCalls = 0;
  const createAuditSession = () => ({
    auditSource() {
      fs.appendFileSync(path.join(item.root, "package.json"), " ");
      return { violations: [] };
    },
  });
  assert.throws(() => packageRc({ ...item, createAuditSession, runCommand: () => (builderCalls++, { status: 0 }) }), /GIT_STATE_CHANGED/);
  assert.equal(builderCalls, 0);
});

for (const [name, mutate, code] of [
  ["Git source", (item) => fs.appendFileSync(path.join(item.root, "package.json"), " "), "GIT_STATE_CHANGED"],
  ["ownership receipt", (item) => fs.appendFileSync(path.join(item.output, ".5e-rc-build-owner.json"), " "), "OUTPUT_OWNERSHIP_LOST"],
]) {
  test(`Given artifact auditor ${name} mutation, When final invariants run, Then packaging fails closed`, (t) => {
    const item = fixture(t);
    const createAuditSession = () => ({
      auditSource: () => ({ violations: [] }),
      auditArtifact() { mutate(item); return { source: {}, artifact: {} }; },
    });
    assert.throws(() => packageRc({ ...item, createAuditSession, runCommand: builder([]) }), new RegExp(code));
  });
}

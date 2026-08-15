const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const SHA = /^[0-9a-f]{40}$/;

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
}

function fixture(t, version = "1.6.0-rc.1") {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "5e-rc-package-"));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const root = path.join(sandbox, "source");
  fs.mkdirSync(path.join(root, "node_modules", "electron-builder", "out", "cli"), { recursive: true });
  fs.mkdirSync(path.join(root, "release-candidates"));
  fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify({ version, devDependencies: { electron: "43.4.0" } })}\n`);
  fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\n.omo/\nrelease-candidates/\n");
  fs.writeFileSync(path.join(root, "node_modules", "electron-builder", "out", "cli", "cli.js"), "");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "user.name", "Fixture"]);
  git(root, ["add", "package.json", ".gitignore"]);
  git(root, ["commit", "-qm", "fixture"]);
  const createAuditSession = () => ({
    auditSource: () => ({ schema: "source", violations: [] }),
    auditArtifact: () => ({ source: { schema: "source", violations: [] }, artifact: { schema: "artifact", violations: [] } }),
  });
  const output = path.join(root, "release-candidates", "candidate");
  const createProvenance = (_context, hooks) => {
    hooks.beforeCommit();
    return { state: "candidate_manifest_validated", manifest: path.join(output, "RC_MANIFEST.json") };
  };
  return { root, output, sandbox, createAuditSession, createProvenance };
}

function load() {
  return require("../scripts/stabilization/rc-package-orchestrator.cjs");
}

function writeOutputs(output) {
  fs.mkdirSync(path.join(output, "win-unpacked", "resources"), { recursive: true });
  fs.writeFileSync(path.join(output, "5E-Setup-1.6.0-rc.1-windows-x64.exe"), "installer");
  fs.writeFileSync(path.join(output, "win-unpacked", "5E.exe"), "runtime");
  fs.writeFileSync(path.join(output, "win-unpacked", "resources", "app.asar"), "asar");
}

function successfulRunner(calls, mutate) {
  return (file, args, options) => {
    calls.push({ file, args, options });
    const output = args.find((arg) => arg.startsWith("-c.directories.output=")).split("=").slice(1).join("=");
    writeOutputs(output);
    mutate?.(options.cwd, output);
    return { status: 0 };
  };
}

test("RC packaging binds one NSIS and dir build to the clean full SHA", (t) => {
  const item = fixture(t);
  const calls = [];
  const receipt = load().packageRc({ ...item, runCommand: successfulRunner(calls) });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, process.execPath);
  assert.deepEqual(calls[0].args, [
    path.join(item.root, "node_modules", "electron-builder", "out", "cli", "cli.js"),
    "--win", "nsis", "dir", "--x64", "--publish", "never",
    `-c.directories.output=${item.output}`,
    `-c.extraMetadata.buildCommit=${receipt.commit}`,
  ]);
  assert.match(receipt.commit, SHA);
  assert.equal(receipt.state, "candidate_manifest_validated");
  assert.equal(receipt.version, "1.6.0-rc.1");
  assert.equal(receipt.output, item.output);
  assert.equal(receipt.ownershipReceipt, path.join(item.output, ".5e-rc-build-owner.json"));
  assert.equal(receipt.outputs.installer, path.join(item.output, "5E-Setup-1.6.0-rc.1-windows-x64.exe"));
});

for (const [name, prepare, code] of [
  ["short HEAD", () => ({ readGitState: () => ({ sha: "59b2c23", status: "" }) }), "GIT_HEAD_INVALID"],
  ["dirty tracked source", (item) => (fs.appendFileSync(path.join(item.root, "package.json"), " "), {}), "GIT_TREE_DIRTY"],
  ["untracked source", (item) => (fs.writeFileSync(path.join(item.root, "surprise.txt"), "dirty"), {}), "GIT_TREE_DIRTY"],
  ["ignored source dirt", (item) => {
    fs.appendFileSync(path.join(item.root, ".gitignore"), "masked-source.js\n");
    git(item.root, ["add", ".gitignore"]);
    git(item.root, ["commit", "-qm", "ignore fixture"]);
    fs.writeFileSync(path.join(item.root, "masked-source.js"), "dirty");
    return {};
  }, "GIT_TREE_DIRTY"],
  ["stale output", (item) => (fs.mkdirSync(item.output), {}), "OUTPUT_ALREADY_EXISTS"],
  ["wrong package version", (item) => ({ readPackage: () => ({ version: "1.6.0" }) }), "PACKAGE_VERSION_INVALID"],
]) {
  test(`RC packaging rejects ${name} before builder execution`, (t) => {
    const item = fixture(t);
    const options = prepare(item);
    let calls = 0;
    assert.throws(() => load().packageRc({ ...item, ...options, runCommand: () => (calls++, { status: 0 }) }), new RegExp(code));
    assert.equal(calls, 0);
  });
}

test("RC packaging rejects a junction node_modules", (t) => {
  const item = fixture(t);
  const outside = path.join(item.sandbox, "shared-dependencies");
  fs.rmSync(path.join(item.root, "node_modules"), { recursive: true, force: true });
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(item.root, "node_modules"), "junction");
  assert.throws(() => load().packageRc({ ...item, runCommand: () => ({ status: 0 }) }), /NODE_MODULES_REPARSE_POINT/);
});

test("dependency validation rejects a physical-looking path resolved outside the worktree", (t) => {
  const item = fixture(t);
  const fakeFs = { lstatSync: () => ({ isDirectory: () => true, isSymbolicLink: () => false }), realpathSync: () => item.sandbox };
  assert.throws(() => load().validateNodeModules(item.root, fakeFs), /NODE_MODULES_OUTSIDE_WORKTREE/);
});

test("output validation rejects unsafe path surfaces and reparse-point parents", (t) => {
  const item = fixture(t);
  const physical = path.join(item.sandbox, "physical-output");
  const linked = path.join(item.root, "release-candidates", "linked-output");
  fs.mkdirSync(physical);
  fs.symlinkSync(physical, linked, "junction");
  assert.throws(() => load().parseCli(["--output", "release-relative"]), /OUTPUT_PATH_NOT_ABSOLUTE/);
  assert.throws(() => load().validateOutputPath(item.root, path.join(item.root, "release-candidates-sibling", "candidate")), /OUTPUT_PATH_OUTSIDE_SUBTREE/);
  assert.throws(() => load().parseCli(["--output", `${item.output}:stream`]), /OUTPUT_PATH_UNSAFE/);
  assert.throws(() => load().parseCli(["--output", "\\\\server\\share\\candidate"]), /OUTPUT_PATH_UNSAFE/);
  assert.throws(() => load().parseCli(["--output", `\\\\?\\${item.output}`]), /OUTPUT_PATH_UNSAFE/);
  assert.throws(() => load().validateOutputPath(item.root, path.join(linked, "candidate")), /OUTPUT_PARENT_REPARSE_POINT/);
});

test("RC packaging propagates builder failure", (t) => {
  const item = fixture(t);
  const sentinel = "preexisting-failure-receipt";
  const runner = (_file, args) => {
    const output = args.find((arg) => arg.startsWith("-c.directories.output=")).split("=").slice(1).join("=");
    fs.writeFileSync(path.join(output, ".5e-rc-build-failure.json"), sentinel, { flag: "wx" });
    return { status: 7 };
  };
  assert.throws(() => load().packageRc({ ...item, runCommand: runner }), /BUILDER_FAILED:7/);
  assert.equal(fs.readFileSync(path.join(item.output, ".5e-rc-build-failure.json"), "utf8"), sentinel);
});

test("RC packaging rejects a nested junction in the electron-builder CLI path", (t) => {
  const item = fixture(t);
  const packagePath = path.join(item.root, "node_modules", "electron-builder");
  const outside = path.join(item.sandbox, "external-builder");
  fs.rmSync(packagePath, { recursive: true, force: true });
  fs.mkdirSync(path.join(outside, "out", "cli"), { recursive: true });
  fs.writeFileSync(path.join(outside, "out", "cli", "cli.js"), "");
  fs.symlinkSync(outside, packagePath, "junction");
  assert.throws(() => load().packageRc({ ...item, runCommand: () => ({ status: 0 }) }), /BUILDER_PATH_REPARSE_POINT/);
});

test("RC packaging atomically rejects a race-to-create output", (t) => {
  const item = fixture(t);
  let calls = 0;
  assert.throws(() => load().packageRc({ ...item, beforeReserve: (output) => fs.mkdirSync(output), runCommand: () => (calls++, { status: 0 }) }), /OUTPUT_RESERVATION_CONFLICT/);
  assert.equal(calls, 0);
});

test("RC packaging rejects timeout and retains an owned failure receipt", (t) => {
  const item = fixture(t);
  const timeout = Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
  assert.throws(() => load().packageRc({ ...item, runCommand: () => ({ status: null, signal: "SIGTERM", error: timeout }) }), /BUILDER_TIMEOUT/);
  assert.ok(fs.existsSync(path.join(item.output, ".5e-rc-build-failure.json")));
  assert.equal(load().BUILD_TIMEOUT_MS, 20 * 60 * 1000);
});

for (const [name, result, code] of [
  ["spawn error", Object.assign(new Error("denied"), { code: "EACCES" }), "BUILDER_EXEC_FAILED:EACCES"],
  ["termination signal", { status: null, signal: "SIGKILL" }, "BUILDER_SIGNALLED:SIGKILL"],
]) {
  test(`RC packaging classifies ${name}`, (t) => {
    const item = fixture(t);
    const runner = result instanceof Error ? () => { throw result; } : () => result;
    assert.throws(() => load().packageRc({ ...item, runCommand: runner }), new RegExp(code));
    assert.ok(fs.existsSync(path.join(item.output, ".5e-rc-build-failure.json")));
  });
}

test("builder success without its owned output cannot claim completion", (t) => {
  const item = fixture(t);
  const runner = (_file, args) => {
    const output = args.find((arg) => arg.startsWith("-c.directories.output=")).split("=").slice(1).join("=");
    fs.rmSync(output, { recursive: true, force: true });
    return { status: 0 };
  };
  assert.throws(() => load().packageRc({ ...item, runCommand: runner }), /OUTPUT_OWNERSHIP_LOST|OUTPUT_MISSING/);
});

test("zero-status builder with no artifacts cannot claim validated outputs", (t) => {
  const item = fixture(t);
  assert.throws(() => load().packageRc({ ...item, runCommand: () => ({ status: 0 }) }), /INSTALLER_COUNT_INVALID/);
});

test("RC packaging rejects an extra root installer after builder success", (t) => {
  const item = fixture(t);
  const runner = successfulRunner([], (_root, output) => fs.writeFileSync(path.join(output, "extra.exe"), "extra"));
  assert.throws(() => load().packageRc({ ...item, runCommand: runner }), /INSTALLER_COUNT_INVALID:2/);
  assert.ok(fs.existsSync(path.join(item.output, ".5e-rc-build-failure.json")));
});

test("output validation cannot mutate the owned receipt", (t) => {
  const item = fixture(t);
  const validateOutputs = () => {
    fs.appendFileSync(path.join(item.output, ".5e-rc-build-owner.json"), " ");
    return {};
  };
  assert.throws(() => load().packageRc({ ...item, runCommand: successfulRunner([]), validateOutputs }), /OUTPUT_OWNERSHIP_LOST/);
});

test("output validation cannot mutate the frozen Git source", (t) => {
  const item = fixture(t);
  const validateOutputs = () => {
    fs.writeFileSync(path.join(item.root, "late-validator-source.txt"), "dirty");
    return {};
  };
  assert.throws(() => load().packageRc({ ...item, runCommand: successfulRunner([]), validateOutputs }), /GIT_STATE_CHANGED/);
});

for (const [name, mutate] of [
  ["installer", (output) => {
    const installer = path.join(output, "5E-Setup-1.6.0-rc.1-windows-x64.exe");
    fs.rmSync(installer);
    fs.writeFileSync(installer, "replacement");
  }],
  ["parent", (output) => {
    const unpacked = path.join(output, "win-unpacked");
    fs.renameSync(unpacked, `${unpacked}-old`);
    fs.mkdirSync(path.join(unpacked, "resources"), { recursive: true });
    fs.writeFileSync(path.join(unpacked, "5E.exe"), "replacement");
    fs.writeFileSync(path.join(unpacked, "resources", "app.asar"), "replacement");
  }],
]) {
  test(`integrated output validation rejects a validator-time ${name} swap`, (t) => {
    const item = fixture(t);
    let changed = false;
    const validateOutputs = (output) => require("../scripts/stabilization/rc-package-outputs.cjs").validateCandidateOutputs(output, {
      inspectFile: () => {
        if (!changed) { changed = true; mutate(output); }
        return { reparse: false, sparse: false, allocatedBytes: "4096", streams: [] };
      },
    });
    assert.throws(() => load().packageRc({ ...item, runCommand: successfulRunner([]), validateOutputs }), /IDENTITY_CHANGED/);
  });
}

test("RC packaging rejects post-build source mutation", (t) => {
  const item = fixture(t);
  const runner = successfulRunner([], (root) => fs.writeFileSync(path.join(root, "late-source.txt"), "dirty"));
  assert.throws(() => load().packageRc({ ...item, runCommand: runner }), /GIT_STATE_CHANGED/);
});

test("RC packaging rejects a post-build HEAD change even when the tree is clean", (t) => {
  const item = fixture(t);
  const runner = successfulRunner([], (root) => git(root, ["commit", "--allow-empty", "-qm", "late"]));
  assert.throws(() => load().packageRc({ ...item, runCommand: runner }), /GIT_STATE_CHANGED/);
});

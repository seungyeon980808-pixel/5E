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
  fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify({ version })}\n`);
  fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\n.omo/\nrelease-candidates/\n");
  fs.writeFileSync(path.join(root, "node_modules", "electron-builder", "out", "cli", "cli.js"), "");
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "user.name", "Fixture"]);
  git(root, ["add", "package.json", ".gitignore"]);
  git(root, ["commit", "-qm", "fixture"]);
  return { root, output: path.join(root, "release-candidates", "candidate"), sandbox };
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
  // Given: a clean Git fixture with physical in-worktree dependencies and a fresh output path.
  const item = fixture(t);
  const calls = [];
  // When: the local RC orchestrator runs through its injected builder boundary.
  const receipt = load().packageRc({ ...item, runCommand: successfulRunner(calls) });
  // Then: one non-publishing invocation carries both targets, exact output, version, and full commit.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, process.execPath);
  assert.deepEqual(calls[0].args, [
    path.join(item.root, "node_modules", "electron-builder", "out", "cli", "cli.js"),
    "--win", "nsis", "dir", "--x64", "--publish", "never",
    `-c.directories.output=${item.output}`,
    `-c.extraMetadata.buildCommit=${receipt.commit}`,
  ]);
  assert.match(receipt.commit, SHA);
  assert.equal(receipt.state, "outputs_validated");
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
    // Given: one invalid pre-build boundary.
    const item = fixture(t);
    const options = prepare(item);
    let calls = 0;
    // When/Then: the orchestrator fails closed before invoking electron-builder.
    assert.throws(() => load().packageRc({ ...item, ...options, runCommand: () => (calls++, { status: 0 }) }), new RegExp(code));
    assert.equal(calls, 0);
  });
}

test("RC packaging rejects a junction node_modules", (t) => {
  // Given: node_modules is replaced by a directory junction to another tree.
  const item = fixture(t);
  const outside = path.join(item.sandbox, "shared-dependencies");
  fs.rmSync(path.join(item.root, "node_modules"), { recursive: true, force: true });
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(item.root, "node_modules"), "junction");
  // When/Then: no builder is allowed to consume reparse-point dependencies.
  assert.throws(() => load().packageRc({ ...item, runCommand: () => ({ status: 0 }) }), /NODE_MODULES_REPARSE_POINT/);
});

test("dependency validation rejects a physical-looking path resolved outside the worktree", (t) => {
  // Given: an adapter reports a directory but canonical resolution escapes the exact worktree.
  const item = fixture(t);
  const fakeFs = { lstatSync: () => ({ isDirectory: () => true, isSymbolicLink: () => false }), realpathSync: () => item.sandbox };
  // When/Then: canonical containment fails independently of reparse detection.
  assert.throws(() => load().validateNodeModules(item.root, fakeFs), /NODE_MODULES_OUTSIDE_WORKTREE/);
});

test("output validation rejects unsafe path surfaces and reparse-point parents", (t) => {
  // Given: relative, sibling, ADS, UNC, device, and junction-parent targets.
  const item = fixture(t);
  const physical = path.join(item.sandbox, "physical-output");
  const linked = path.join(item.root, "release-candidates", "linked-output");
  fs.mkdirSync(physical);
  fs.symlinkSync(physical, linked, "junction");
  // When/Then: none is accepted as a dedicated physical in-worktree output path.
  assert.throws(() => load().parseCli(["--output", "release-relative"]), /OUTPUT_PATH_NOT_ABSOLUTE/);
  assert.throws(() => load().validateOutputPath(item.root, path.join(item.root, "release-candidates-sibling", "candidate")), /OUTPUT_PATH_OUTSIDE_SUBTREE/);
  assert.throws(() => load().parseCli(["--output", `${item.output}:stream`]), /OUTPUT_PATH_UNSAFE/);
  assert.throws(() => load().parseCli(["--output", "\\\\server\\share\\candidate"]), /OUTPUT_PATH_UNSAFE/);
  assert.throws(() => load().parseCli(["--output", `\\\\?\\${item.output}`]), /OUTPUT_PATH_UNSAFE/);
  assert.throws(() => load().validateOutputPath(item.root, path.join(linked, "candidate")), /OUTPUT_PARENT_REPARSE_POINT/);
});

test("RC packaging propagates builder failure", (t) => {
  // Given: valid preflight state and one failing builder process.
  const item = fixture(t);
  const sentinel = "preexisting-failure-receipt";
  const runner = (_file, args) => {
    const output = args.find((arg) => arg.startsWith("-c.directories.output=")).split("=").slice(1).join("=");
    fs.writeFileSync(path.join(output, ".5e-rc-build-failure.json"), sentinel, { flag: "wx" });
    return { status: 7 };
  };
  // When/Then: the nonzero child status becomes a stable orchestration failure.
  assert.throws(() => load().packageRc({ ...item, runCommand: runner }), /BUILDER_FAILED:7/);
  assert.equal(fs.readFileSync(path.join(item.output, ".5e-rc-build-failure.json"), "utf8"), sentinel);
});

test("RC packaging rejects a nested junction in the electron-builder CLI path", (t) => {
  // Given: physical node_modules contains a nested package junction to external bytes.
  const item = fixture(t);
  const packagePath = path.join(item.root, "node_modules", "electron-builder");
  const outside = path.join(item.sandbox, "external-builder");
  fs.rmSync(packagePath, { recursive: true, force: true });
  fs.mkdirSync(path.join(outside, "out", "cli"), { recursive: true });
  fs.writeFileSync(path.join(outside, "out", "cli", "cli.js"), "");
  fs.symlinkSync(outside, packagePath, "junction");
  // When/Then: ancestor walking rejects the nested reparse point before spawn.
  assert.throws(() => load().packageRc({ ...item, runCommand: () => ({ status: 0 }) }), /BUILDER_PATH_REPARSE_POINT/);
});

test("RC packaging atomically rejects a race-to-create output", (t) => {
  // Given: another actor creates the validated output immediately before reservation.
  const item = fixture(t);
  let calls = 0;
  // When/Then: exclusive mkdir reports the conflict and the builder is never called.
  assert.throws(() => load().packageRc({ ...item, beforeReserve: (output) => fs.mkdirSync(output), runCommand: () => (calls++, { status: 0 }) }), /OUTPUT_RESERVATION_CONFLICT/);
  assert.equal(calls, 0);
});

test("RC packaging rejects timeout and retains an owned failure receipt", (t) => {
  // Given: the bounded process runner reports its timeout termination.
  const item = fixture(t);
  const timeout = Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
  // When/Then: timeout is classified and the owned reservation is retained, never deleted.
  assert.throws(() => load().packageRc({ ...item, runCommand: () => ({ status: null, signal: "SIGTERM", error: timeout }) }), /BUILDER_TIMEOUT/);
  assert.ok(fs.existsSync(path.join(item.output, ".5e-rc-build-failure.json")));
  assert.equal(load().BUILD_TIMEOUT_MS, 20 * 60 * 1000);
});

for (const [name, result, code] of [
  ["spawn error", Object.assign(new Error("denied"), { code: "EACCES" }), "BUILDER_EXEC_FAILED:EACCES"],
  ["termination signal", { status: null, signal: "SIGKILL" }, "BUILDER_SIGNALLED:SIGKILL"],
]) {
  test(`RC packaging classifies ${name}`, (t) => {
    // Given: the bounded process boundary returns one non-status failure class.
    const item = fixture(t);
    const runner = result instanceof Error ? () => { throw result; } : () => result;
    // When/Then: the class is preserved and the owned failure receipt remains local.
    assert.throws(() => load().packageRc({ ...item, runCommand: runner }), new RegExp(code));
    assert.ok(fs.existsSync(path.join(item.output, ".5e-rc-build-failure.json")));
  });
}

test("builder success without its owned output cannot claim completion", (t) => {
  // Given: a zero-status child removes the reserved output instead of producing into it.
  const item = fixture(t);
  const runner = (_file, args) => {
    const output = args.find((arg) => arg.startsWith("-c.directories.output=")).split("=").slice(1).join("=");
    fs.rmSync(output, { recursive: true, force: true });
    return { status: 0 };
  };
  // When/Then: ownership validation rejects the false success receipt.
  assert.throws(() => load().packageRc({ ...item, runCommand: runner }), /OUTPUT_OWNERSHIP_LOST|OUTPUT_MISSING/);
});

test("zero-status builder with no artifacts cannot claim validated outputs", (t) => {
  // Given: the child returns zero but adds nothing beyond the ownership receipt.
  const item = fixture(t);
  // When/Then: builder success is insufficient without the exact Todo8 output contract.
  assert.throws(() => load().packageRc({ ...item, runCommand: () => ({ status: 0 }) }), /INSTALLER_COUNT_INVALID/);
});

test("RC packaging rejects an extra root installer after builder success", (t) => {
  // Given: the builder emits the canonical output tree plus a second distributable EXE.
  const item = fixture(t);
  const runner = successfulRunner([], (_root, output) => fs.writeFileSync(path.join(output, "extra.exe"), "extra"));
  // When/Then: post-builder cardinality fails and the owned failure receipt records the gate.
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
  // Given: the builder boundary creates an untracked source file after preflight.
  const item = fixture(t);
  const runner = successfulRunner([], (root) => fs.writeFileSync(path.join(root, "late-source.txt"), "dirty"));
  // When/Then: the frozen Git state comparison fails after the child returns.
  assert.throws(() => load().packageRc({ ...item, runCommand: runner }), /GIT_STATE_CHANGED/);
});

test("RC packaging rejects a post-build HEAD change even when the tree is clean", (t) => {
  // Given: the child advances HEAD with an empty commit.
  const item = fixture(t);
  const runner = successfulRunner([], (root) => git(root, ["commit", "--allow-empty", "-qm", "late"]));
  // When/Then: the frozen full SHA comparison fails.
  assert.throws(() => load().packageRc({ ...item, runCommand: runner }), /GIT_STATE_CHANGED/);
});

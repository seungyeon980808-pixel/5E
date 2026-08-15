const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { classifyRootExecutables, validateCandidateOutputs } = require("../scripts/stabilization/rc-package-outputs.cjs");
const { inspectWindowsFile } = require("../scripts/stabilization/rc-package-file-inspector.cjs");

const INSTALLER = "5E-Setup-1.6.0-rc.1-windows-x64.exe";
const PHYSICAL_METADATA = Object.freeze({ reparse: false, sparse: false, allocatedBytes: "4096", streams: [] });

function fixture(t) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "5e-rc-outputs-"));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const output = path.join(sandbox, "candidate");
  fs.mkdirSync(path.join(output, "win-unpacked", "resources"), { recursive: true });
  fs.writeFileSync(path.join(output, INSTALLER), "installer");
  fs.writeFileSync(path.join(output, "win-unpacked", "5E.exe"), "runtime");
  fs.writeFileSync(path.join(output, "win-unpacked", "resources", "app.asar"), "asar");
  return { sandbox, output };
}

test("Given exact builder outputs, When validated, Then only canonical distributables are returned", (t) => {
  const item = fixture(t);
  const result = validateCandidateOutputs(item.output, { inspectFile: () => PHYSICAL_METADATA });
  assert.deepEqual(result, {
    installer: path.join(item.output, INSTALLER),
    unpackedExecutable: path.join(item.output, "win-unpacked", "5E.exe"),
    asar: path.join(item.output, "win-unpacked", "resources", "app.asar"),
  });
});

test("Given the checked-in builder pattern, When resolved for the RC, Then it names the canonical installer", () => {
  const packageJson = require("../package.json");
  const resolved = packageJson.build.artifactName
    .replace("${version}", packageJson.version).replace("${arch}", "x64").replace("${ext}", "exe");
  assert.equal(resolved, INSTALLER);
});

test("Given Windows-trimmed names, When classified, Then disguised root executables remain distributables", () => {
  assert.deepEqual(classifyRootExecutables([INSTALLER, "extra.exe ", "other.EXE."]), [INSTALLER, "extra.exe ", "other.EXE."]);
});

test("Given Windows metadata inspection, When spawned, Then execution resources are bounded", () => {
  let observed;
  const run = (...args) => {
    observed = args;
    return '{"reparse":false,"sparse":false,"allocatedBytes":"4096","streams":[]}';
  };
  inspectWindowsFile("C:\\sentinel\\artifact.exe", { run });
  const options = observed[2];
  assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe"]);
  assert.equal(options.windowsHide, true);
  assert.equal(options.shell, false);
  assert.equal(options.timeout, 15_000);
  assert.equal(options.maxBuffer, 1024 * 1024);
  assert.equal(options.env.FIVE_E_OUTPUT_FILE, "C:\\sentinel\\artifact.exe");
  assert.doesNotMatch(observed[1].join(" "), /sentinel|artifact\.exe/i);
});

for (const [condition, run] of [
  ["timeout", () => { const error = new Error("C:\\secret\\artifact.exe"); error.code = "ETIMEDOUT"; throw error; }],
  ["buffer overflow", () => { const error = new Error("stdout maxBuffer length exceeded C:\\secret"); error.code = "ENOBUFS"; throw error; }],
  ["nonzero exit with raw stderr", () => { const error = new Error("command failed"); error.stderr = Buffer.from("RAW_STDERR_SENTINEL C:\\secret"); throw error; }],
  ["missing file", () => { const error = new Error("Get-Item C:\\missing\\artifact.exe"); error.stderr = Buffer.from("PathNotFound"); throw error; }],
  ["malformed JSON", () => "RAW_STDERR_SENTINEL C:\\secret"],
]) {
  test(`Given ${condition}, When Windows metadata inspection fails, Then diagnostics are stable and redacted`, () => {
    assert.throws(
      () => inspectWindowsFile("C:\\secret\\artifact.exe", { run }),
      (error) => error.message === "OUTPUT_FILE_METADATA_UNAVAILABLE" && !/secret|sentinel|stderr|artifact/i.test(error.message),
    );
  });
}

for (const [name, mutate, code] of [
  ["missing installer", ({ output }) => fs.rmSync(path.join(output, INSTALLER)), "INSTALLER_COUNT_INVALID"],
  ["extra root installer", ({ output }) => fs.writeFileSync(path.join(output, "extra.exe"), "extra"), "INSTALLER_COUNT_INVALID"],
  ["wrong installer name", ({ output }) => fs.renameSync(path.join(output, INSTALLER), path.join(output, "setup.exe")), "INSTALLER_NAME_INVALID"],
  ["case-confusable installer", ({ output }) => fs.renameSync(path.join(output, INSTALLER), path.join(output, INSTALLER.toLowerCase())), "INSTALLER_NAME_INVALID"],
  ["zero-byte installer", ({ output }) => fs.truncateSync(path.join(output, INSTALLER), 0), "INSTALLER_INVALID"],
  ["missing unpacked executable", ({ output }) => fs.rmSync(path.join(output, "win-unpacked", "5E.exe")), "UNPACKED_EXECUTABLE_MISSING"],
  ["zero-byte unpacked executable", ({ output }) => fs.truncateSync(path.join(output, "win-unpacked", "5E.exe"), 0), "UNPACKED_EXECUTABLE_INVALID"],
  ["missing ASAR", ({ output }) => fs.rmSync(path.join(output, "win-unpacked", "resources", "app.asar")), "ASAR_MISSING"],
  ["zero-byte ASAR", ({ output }) => fs.truncateSync(path.join(output, "win-unpacked", "resources", "app.asar"), 0), "ASAR_INVALID"],
]) {
  test(`Given ${name}, When validated, Then output acceptance fails closed`, (t) => {
    const item = fixture(t);
    mutate(item);
    assert.throws(() => validateCandidateOutputs(item.output, { inspectFile: () => PHYSICAL_METADATA }), new RegExp(code));
  });
}

test("Given a nested runtime EXE, When validated, Then it is not counted as a distributable", (t) => {
  const item = fixture(t);
  fs.writeFileSync(path.join(item.output, "win-unpacked", "helper.exe"), "helper");
  assert.doesNotThrow(() => validateCandidateOutputs(item.output, { inspectFile: () => PHYSICAL_METADATA }));
});

test("Given a file link node, When validated, Then linked installer bytes are rejected", (t) => {
  const item = fixture(t);
  const installer = path.join(item.output, INSTALLER);
  const fsApi = new Proxy(fs, { get(target, property) {
    if (property !== "lstatSync") return target[property];
    return (file, ...args) => {
      const stat = target.lstatSync(file, ...args);
      return file === installer ? new Proxy(stat, { get(value, key) {
        return key === "isSymbolicLink" ? () => true : value[key];
      } }) : stat;
    };
  } });
  assert.throws(() => validateCandidateOutputs(item.output, { fsApi, inspectFile: () => PHYSICAL_METADATA }), /INSTALLER_REPARSE_POINT/);
});

test("Given a junction outside output, When validated, Then physical ancestry is rejected", (t) => {
  const item = fixture(t);
  const outside = path.join(item.sandbox, "outside-unpacked");
  fs.renameSync(path.join(item.output, "win-unpacked"), outside);
  fs.symlinkSync(outside, path.join(item.output, "win-unpacked"), "junction");
  assert.throws(() => validateCandidateOutputs(item.output, { inspectFile: () => PHYSICAL_METADATA }), /OUTPUT_REPARSE_POINT/);
});

test("Given an alternate data stream, When validated, Then hidden bytes are rejected", (t) => {
  const item = fixture(t);
  const inspectFile = (file) => ({ ...PHYSICAL_METADATA, streams: file.endsWith(INSTALLER) ? ["hidden"] : [] });
  assert.throws(() => validateCandidateOutputs(item.output, { inspectFile }), /INSTALLER_ALTERNATE_DATA_STREAM/);
});

test("Given a real NTFS alternate stream, When validated, Then default inspection rejects it", { skip: process.platform !== "win32" }, (t) => {
  const item = fixture(t);
  fs.writeFileSync(`${path.join(item.output, INSTALLER)}:hidden`, "hidden");
  assert.throws(() => validateCandidateOutputs(item.output), /INSTALLER_ALTERNATE_DATA_STREAM/);
});

test("Given a reparse attribute, When validated, Then the physical file is rejected", (t) => {
  const item = fixture(t);
  const inspectFile = (file) => ({ ...PHYSICAL_METADATA, reparse: file.endsWith(INSTALLER) });
  assert.throws(() => validateCandidateOutputs(item.output, { inspectFile }), /INSTALLER_REPARSE_POINT/);
});

test("Given a real NTFS hardlink, When validated, Then shared required bytes are rejected", { skip: process.platform !== "win32" }, (t) => {
  const item = fixture(t);
  const installer = path.join(item.output, INSTALLER);
  const outside = path.join(item.sandbox, "outside-hardlink.exe");
  fs.renameSync(installer, outside);
  fs.linkSync(outside, installer);
  assert.throws(() => validateCandidateOutputs(item.output, { inspectFile: () => ({ reparse: false, sparse: false, allocatedBytes: "4096", streams: [] }) }), /INSTALLER_LINK_COUNT_INVALID/);
});

test("Given a real NTFS sparse file, When validated, Then sparse installer bytes are rejected", { skip: process.platform !== "win32" }, (t) => {
  const item = fixture(t);
  const installer = path.join(item.output, INSTALLER);
  require("node:child_process").execFileSync("fsutil.exe", ["sparse", "setflag", installer], { windowsHide: true });
  assert.throws(() => validateCandidateOutputs(item.output), /INSTALLER_SPARSE_FILE/);
});

test("Given installer replacement during inspection, When validated, Then immutable identity rejects the swap", (t) => {
  const item = fixture(t);
  const installer = path.join(item.output, INSTALLER);
  let changed = false;
  const inspectFile = (file) => {
    if (!changed && file === installer) {
      changed = true;
      fs.rmSync(installer);
      fs.writeFileSync(installer, "replacement");
    }
    return { reparse: false, sparse: false, allocatedBytes: "4096", streams: [] };
  };
  assert.throws(() => validateCandidateOutputs(item.output, { inspectFile }), /(?:OUTPUT|INSTALLER)_IDENTITY_CHANGED/);
});

test("Given parent replacement during inspection, When validated, Then ancestor identity rejects the swap", (t) => {
  const item = fixture(t);
  const unpacked = path.join(item.output, "win-unpacked");
  let changed = false;
  const inspectFile = (file) => {
    if (!changed && file.endsWith("5E.exe")) {
      changed = true;
      fs.renameSync(unpacked, `${unpacked}-old`);
      fs.mkdirSync(path.join(unpacked, "resources"), { recursive: true });
      fs.writeFileSync(path.join(unpacked, "5E.exe"), "replacement");
      fs.writeFileSync(path.join(unpacked, "resources", "app.asar"), "replacement");
    }
    return { reparse: false, sparse: false, allocatedBytes: "4096", streams: [] };
  };
  assert.throws(() => validateCandidateOutputs(item.output, { inspectFile }), /OUTPUT_IDENTITY_CHANGED/);
});

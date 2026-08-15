const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const preflight = require("./rc-package-preflight.cjs");

const BUILD_TIMEOUT_MS = 20 * 60 * 1000;

function defaultRunCommand(file, args, options) {
  return spawnSync(file, args, {
    ...options,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
    timeout: BUILD_TIMEOUT_MS,
    killSignal: "SIGTERM",
  });
}

function reserveOutput(root, output, commit, token = randomUUID()) {
  try { fs.mkdirSync(output); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("OUTPUT_RESERVATION_CONFLICT");
    throw new Error(`OUTPUT_RESERVATION_FAILED:${error.code || "UNKNOWN"}`);
  }
  const receipt = Object.freeze({ schema: 1, token, commit });
  try {
    fs.writeFileSync(path.join(output, ".5e-rc-build-owner.json"), `${JSON.stringify(receipt)}\n`, { flag: "wx" });
  } catch (error) {
    throw new Error(`OUTPUT_OWNER_RECEIPT_FAILED:${error.code || "UNKNOWN"}`);
  }
  return preflight.captureReservedOutput(root, output, receipt);
}

function classifyBuilder(result) {
  if (result?.error?.code === "ETIMEDOUT") throw new Error("BUILDER_TIMEOUT");
  if (result?.error) throw new Error(`BUILDER_EXEC_FAILED:${result.error.code || "UNKNOWN"}`);
  if (result?.signal) throw new Error(`BUILDER_SIGNALLED:${result.signal}`);
  if (result?.status !== 0) throw new Error(`BUILDER_FAILED:${result?.status ?? "NO_STATUS"}`);
}

function recordFailure(root, output, owner, code) {
  try {
    preflight.validateReservedOutput(root, output, owner);
    fs.writeFileSync(path.join(output, ".5e-rc-build-failure.json"), `${JSON.stringify({ schema: 1, token: owner.receipt.token, code })}\n`, { flag: "wx" });
  } catch {
    // Retain unknown or changed output; never delete or overwrite it.
  }
}

function packageRc({
  root,
  output,
  runCommand = defaultRunCommand,
  readGitState = preflight.readGitState,
  readPackage = preflight.readPackage,
  beforeReserve,
}) {
  const worktree = preflight.validateWorktree(root);
  const start = preflight.validateGitState(readGitState(worktree, [output]));
  const dependencies = preflight.validateNodeModules(worktree);
  const version = preflight.validateVersion(readPackage(worktree));
  const safeOutput = preflight.validateOutputPath(worktree, output);
  const cli = preflight.validateBuilderCli(worktree, dependencies);
  const args = [
    cli, "--win", "nsis", "dir", "--x64", "--publish", "never",
    `-c.directories.output=${safeOutput}`,
    `-c.extraMetadata.buildCommit=${start.sha}`,
  ];
  beforeReserve?.(safeOutput);
  const owner = reserveOutput(worktree, safeOutput, start.sha);
  try {
    preflight.validateReservedOutput(worktree, safeOutput, owner);
    let result;
    try { result = runCommand(process.execPath, args, { cwd: worktree }); }
    catch (error) { result = { error }; }
    const end = preflight.validateGitState(readGitState(worktree, [safeOutput]), false);
    if (end.sha !== start.sha || end.status !== start.status) throw new Error("GIT_STATE_CHANGED");
    classifyBuilder(result);
    const ownershipReceipt = preflight.validateReservedOutput(worktree, safeOutput, owner);
    return Object.freeze({
      state: "builder_completed_unverified",
      commit: start.sha,
      version,
      output: safeOutput,
      ownershipReceipt,
    });
  } catch (error) {
    recordFailure(worktree, safeOutput, owner, error.message);
    throw error;
  }
}

function parseCli(argv) {
  if (argv.length !== 2 || argv[0] !== "--output") throw new Error("USAGE: --output <fresh-absolute-directory>");
  return preflight.validateOutputSyntax(argv[1]);
}

function runCli() {
  try {
    const receipt = packageRc({ root: path.resolve(__dirname, "..", ".."), output: parseCli(process.argv.slice(2)) });
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (require.main === module) process.exitCode = runCli();

module.exports = {
  BUILD_TIMEOUT_MS,
  packageRc,
  parseCli,
  validateNodeModules: preflight.validateNodeModules,
  validateOutputPath: preflight.validateOutputPath,
};

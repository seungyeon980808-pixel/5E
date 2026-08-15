const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { isDeepStrictEqual } = require("node:util");

const FULL_SHA = /^[0-9a-f]{40}$/;
const TARGET_VERSION = "1.6.0-rc.1";
const OUTPUT_SUBTREE = "release-candidates";

function normalized(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  return normalized(left) === normalized(right);
}

function strictlyInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function runGit(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
}

function readGitState(root, allowedIgnored = []) {
  const status = runGit(root, ["status", "--porcelain=v1", "--untracked-files=all", "--ignore-submodules=none", "--ignored=matching"]);
  const allowed = [path.join(root, ".omo"), path.join(root, "node_modules"), path.join(root, OUTPUT_SUBTREE), ...allowedIgnored]
    .map((item) => path.relative(root, item).replaceAll("\\", "/").replace(/\/?$/, "/"));
  const visible = status.split(/\r?\n/).filter(Boolean).filter((line) => {
    if (!line.startsWith("!! ")) return true;
    const ignored = line.slice(3).replaceAll("\\", "/").replace(/\/?$/, "/");
    return !allowed.some((prefix) => ignored === prefix || ignored.startsWith(prefix));
  });
  return { sha: runGit(root, ["rev-parse", "HEAD"]), status: visible.join("\n") };
}

function validateGitState(state, requireClean = true) {
  if (!FULL_SHA.test(state?.sha || "")) throw new Error("GIT_HEAD_INVALID");
  if (requireClean && state.status !== "") throw new Error("GIT_TREE_DIRTY");
  return Object.freeze({ sha: state.sha, status: state.status });
}

function validateWorktree(root, fsApi = fs) {
  const lexical = path.resolve(root);
  const stat = fsApi.lstatSync(lexical);
  if (stat.isSymbolicLink()) throw new Error("WORKTREE_REPARSE_POINT");
  if (!stat.isDirectory()) throw new Error("WORKTREE_NOT_DIRECTORY");
  const real = fsApi.realpathSync(lexical);
  if (!samePath(lexical, real)) throw new Error("WORKTREE_REPARSE_POINT");
  return real;
}

function assertPhysicalChain(base, target, fsApi, code) {
  if (!samePath(base, target) && !strictlyInside(base, target)) throw new Error(`${code}_OUTSIDE`);
  const relative = path.relative(base, target);
  const components = relative ? relative.split(path.sep) : [];
  let current = base;
  for (const component of components) {
    current = path.join(current, component);
    const stat = fsApi.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`${code}_REPARSE_POINT`);
    if (!samePath(current, fsApi.realpathSync(current))) throw new Error(`${code}_REPARSE_POINT`);
  }
}

function validateNodeModules(root, fsApi = fs) {
  const dependencyPath = path.join(root, "node_modules");
  let stat;
  try { stat = fsApi.lstatSync(dependencyPath); } catch { throw new Error("NODE_MODULES_MISSING"); }
  if (stat.isSymbolicLink()) throw new Error("NODE_MODULES_REPARSE_POINT");
  if (!stat.isDirectory()) throw new Error("NODE_MODULES_NOT_DIRECTORY");
  const realDependency = fsApi.realpathSync(dependencyPath);
  if (!samePath(realDependency, path.join(root, "node_modules"))) throw new Error("NODE_MODULES_OUTSIDE_WORKTREE");
  return realDependency;
}

function invalidWindowsPath(value) {
  if (/^(?:\\\\|\/\/|\\[?.]\\)/.test(value)) return true;
  const withoutDrive = /^[A-Za-z]:/.test(value) ? value.slice(2) : value;
  return withoutDrive.includes(":");
}

function validateOutputSyntax(outputPath) {
  if (typeof outputPath !== "string" || !path.isAbsolute(outputPath)) throw new Error("OUTPUT_PATH_NOT_ABSOLUTE");
  if (invalidWindowsPath(outputPath)) throw new Error("OUTPUT_PATH_UNSAFE");
  return outputPath;
}

function outputLocation(root, outputPath) {
  validateOutputSyntax(outputPath);
  const target = path.resolve(outputPath);
  const subtree = path.join(root, OUTPUT_SUBTREE);
  if (!strictlyInside(subtree, target)) throw new Error("OUTPUT_PATH_OUTSIDE_SUBTREE");
  return { target, subtree };
}

function validateOutputPath(root, outputPath, fsApi = fs) {
  const { target, subtree } = outputLocation(root, outputPath);
  if (fsApi.existsSync(target)) throw new Error("OUTPUT_ALREADY_EXISTS");
  const parent = path.dirname(target);
  try { assertPhysicalChain(root, parent, fsApi, "OUTPUT_PARENT"); } catch (error) {
    if (error.code === "ENOENT") throw new Error("OUTPUT_PARENT_MISSING");
    throw error;
  }
  if (!samePath(subtree, fsApi.realpathSync(subtree))) throw new Error("OUTPUT_PARENT_REPARSE_POINT");
  return target;
}

function statIdentity(file, kind, fsApi = fs) {
  const stat = fsApi.lstatSync(file, { bigint: true });
  if (stat.isSymbolicLink()) throw new Error("OUTPUT_OWNERSHIP_LOST");
  // Node/libuv exposes the NTFS volume and file IDs as bigint dev/ino; zero fails closed.
  if (stat.ino === 0n) throw new Error("FILESYSTEM_IDENTITY_UNAVAILABLE");
  const identity = {
    dev: String(stat.dev),
    ino: String(stat.ino),
    birthtimeNs: String(stat.birthtimeNs),
  };
  if (kind === "receipt") Object.assign(identity, {
    ctimeNs: String(stat.ctimeNs),
    mtimeNs: String(stat.mtimeNs),
    size: String(stat.size),
  });
  return identity;
}

function readExactReceipt(ownerPath, expected, fsApi) {
  let actual;
  try { actual = JSON.parse(fsApi.readFileSync(ownerPath, "utf8")); }
  catch { throw new Error("OUTPUT_OWNERSHIP_LOST"); }
  if (!isDeepStrictEqual(actual, expected)) throw new Error("OUTPUT_OWNERSHIP_LOST");
}

function captureReservedOutput(root, outputPath, receipt, fsApi = fs) {
  const { target } = outputLocation(root, outputPath);
  const ownerPath = path.join(target, ".5e-rc-build-owner.json");
  try { assertPhysicalChain(root, ownerPath, fsApi, "OUTPUT"); }
  catch (error) {
    if (error.code === "ENOENT") throw new Error("OUTPUT_OWNERSHIP_LOST");
    throw error;
  }
  readExactReceipt(ownerPath, receipt, fsApi);
  return Object.freeze({
    receipt: Object.freeze({ ...receipt }),
    directoryRealpath: fsApi.realpathSync(target),
    receiptRealpath: fsApi.realpathSync(ownerPath),
    directoryIdentity: Object.freeze(statIdentity(target, "directory", fsApi)),
    receiptIdentity: Object.freeze(statIdentity(ownerPath, "receipt", fsApi)),
  });
}

function validateReservedOutput(root, outputPath, ownership, fsApi = fs) {
  const { target } = outputLocation(root, outputPath);
  const ownerPath = path.join(target, ".5e-rc-build-owner.json");
  try { assertPhysicalChain(root, ownerPath, fsApi, "OUTPUT"); }
  catch (error) {
    if (error.code === "ENOENT") throw new Error("OUTPUT_OWNERSHIP_LOST");
    throw error;
  }
  if (!samePath(fsApi.realpathSync(target), ownership.directoryRealpath)) throw new Error("OUTPUT_OWNERSHIP_LOST");
  if (!samePath(fsApi.realpathSync(ownerPath), ownership.receiptRealpath)) throw new Error("OUTPUT_OWNERSHIP_LOST");
  if (!isDeepStrictEqual(statIdentity(target, "directory", fsApi), ownership.directoryIdentity)) throw new Error("OUTPUT_OWNERSHIP_LOST");
  if (!isDeepStrictEqual(statIdentity(ownerPath, "receipt", fsApi), ownership.receiptIdentity)) throw new Error("OUTPUT_OWNERSHIP_LOST");
  readExactReceipt(ownerPath, ownership.receipt, fsApi);
  return ownerPath;
}

function validateBuilderCli(root, dependencyPath, fsApi = fs) {
  const cli = path.join(dependencyPath, "electron-builder", "out", "cli", "cli.js");
  try { assertPhysicalChain(dependencyPath, cli, fsApi, "BUILDER_PATH"); } catch (error) {
    if (error.code === "ENOENT") throw new Error("BUILDER_CLI_MISSING");
    throw error;
  }
  if (!fsApi.lstatSync(cli).isFile()) throw new Error("BUILDER_CLI_INVALID");
  if (!strictlyInside(root, fsApi.realpathSync(cli))) throw new Error("BUILDER_PATH_OUTSIDE_WORKTREE");
  return cli;
}

function readPackage(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")); }
  catch { throw new Error("PACKAGE_JSON_INVALID"); }
}

function validateVersion(packageJson) {
  if (packageJson?.version !== TARGET_VERSION) throw new Error("PACKAGE_VERSION_INVALID");
  return packageJson.version;
}

module.exports = {
  captureReservedOutput, readGitState, readPackage, validateBuilderCli, validateGitState, validateNodeModules,
  validateOutputPath, validateOutputSyntax, validateReservedOutput, validateVersion, validateWorktree,
};

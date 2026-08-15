const fs = require("node:fs");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const { inspectFile: defaultInspectFile } = require("./rc-package-file-inspector.cjs");

const INSTALLER = "5E-Setup-1.6.0-rc.1-windows-x64.exe";

function normalized(file) {
  const resolved = path.resolve(file);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function samePath(left, right) {
  return normalized(left) === normalized(right);
}

function classifyRootExecutables(names) {
  return names.filter((name) => name.replace(/[ .]+$/u, "").toLowerCase().endsWith(".exe"));
}

function identity(stat, realpath) {
  const value = {
    realpath: normalized(realpath),
    dev: String(stat.dev),
    ino: String(stat.ino),
    birthtimeNs: String(stat.birthtimeNs),
    ctimeNs: String(stat.ctimeNs),
    mtimeNs: String(stat.mtimeNs),
    size: String(stat.size),
    nlink: String(stat.nlink),
  };
  if (stat.blocks !== undefined) value.blocks = String(stat.blocks);
  return Object.freeze(value);
}

function capture(file, code, kind, fsApi) {
  let stat;
  try { stat = fsApi.lstatSync(file, { bigint: true }); }
  catch (error) {
    if (error.code === "ENOENT") throw new Error(`${code}_MISSING`);
    throw error;
  }
  const realpath = fsApi.realpathSync(file);
  if (stat.isSymbolicLink() || !samePath(file, realpath)) throw new Error(`${code}_REPARSE_POINT`);
  if (kind === "directory" && !stat.isDirectory()) throw new Error(`${code}_INVALID`);
  if (kind === "file") {
    if (!stat.isFile() || stat.size <= 0n) throw new Error(`${code}_INVALID`);
    if (stat.nlink !== 1n) throw new Error(`${code}_LINK_COUNT_INVALID:${stat.nlink}`);
  }
  return Object.freeze({ file, code, kind, identity: identity(stat, realpath) });
}

function revalidate(snapshot, fsApi) {
  const current = capture(snapshot.file, snapshot.code, snapshot.kind, fsApi);
  if (!isDeepStrictEqual(current.identity, snapshot.identity)) throw new Error(`${snapshot.code}_IDENTITY_CHANGED`);
}

function inspect(snapshot, chain, options) {
  const metadata = options.inspectFile(snapshot.file);
  for (const item of chain) revalidate(item, options.fsApi);
  if (typeof metadata?.reparse !== "boolean" || typeof metadata?.sparse !== "boolean"
    || typeof metadata?.allocatedBytes !== "string"
    || (!Array.isArray(metadata.streams) && typeof metadata.streams !== "string")) {
    throw new Error(`${snapshot.code}_METADATA_INVALID`);
  }
  if (metadata.reparse) throw new Error(`${snapshot.code}_REPARSE_POINT`);
  if (metadata.sparse) throw new Error(`${snapshot.code}_SPARSE_FILE`);
  if (!/^\d+$/.test(metadata.allocatedBytes) || BigInt(metadata.allocatedBytes) <= 0n) {
    throw new Error(`${snapshot.code}_ALLOCATION_INVALID`);
  }
  const streams = Array.isArray(metadata.streams) ? metadata.streams : [metadata.streams];
  if (streams.some((stream) => stream !== ":$DATA")) throw new Error(`${snapshot.code}_ALTERNATE_DATA_STREAM`);
}

function validateCandidateOutputs(output, overrides = {}) {
  const options = { fsApi: overrides.fsApi || fs, inspectFile: overrides.inspectFile || defaultInspectFile };
  const installers = classifyRootExecutables(options.fsApi.readdirSync(output, { withFileTypes: true }).map((entry) => entry.name));
  if (installers.length !== 1) throw new Error(`INSTALLER_COUNT_INVALID:${installers.length}`);
  if (installers[0] !== INSTALLER) throw new Error(`INSTALLER_NAME_INVALID:${installers[0]}`);
  const locations = [
    [output, "OUTPUT", "directory"],
    [path.join(output, "win-unpacked"), "OUTPUT", "directory"],
    [path.join(output, "win-unpacked", "resources"), "OUTPUT", "directory"],
    [path.join(output, INSTALLER), "INSTALLER", "file"],
    [path.join(output, "win-unpacked", "5E.exe"), "UNPACKED_EXECUTABLE", "file"],
    [path.join(output, "win-unpacked", "resources", "app.asar"), "ASAR", "file"],
  ];
  const snapshots = locations.map(([file, code, kind]) => capture(file, code, kind, options.fsApi));
  inspect(snapshots[3], [snapshots[0], snapshots[3]], options);
  inspect(snapshots[4], [snapshots[0], snapshots[1], snapshots[4]], options);
  inspect(snapshots[5], [snapshots[0], snapshots[1], snapshots[2], snapshots[5]], options);
  for (const snapshot of snapshots) revalidate(snapshot, options.fsApi);
  return Object.freeze({ installer: snapshots[3].file, unpackedExecutable: snapshots[4].file, asar: snapshots[5].file });
}

module.exports = { INSTALLER, classifyRootExecutables, validateCandidateOutputs };

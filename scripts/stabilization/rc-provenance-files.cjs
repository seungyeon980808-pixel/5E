const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");

function normalized(file) {
  const value = path.resolve(file);
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function identity(file, kind = "file") {
  let stat;
  let realpath;
  try {
    stat = fs.lstatSync(file, { bigint: true });
    realpath = fs.realpathSync.native(file);
  } catch { throw new Error("PROVENANCE_SNAPSHOT_INVALID"); }
  if (stat.isSymbolicLink() || normalized(file) !== normalized(realpath)) throw new Error("PROVENANCE_SNAPSHOT_INVALID");
  if (kind === "file" && (!stat.isFile() || stat.size <= 0n || stat.nlink !== 1n)) throw new Error("PROVENANCE_SNAPSHOT_INVALID");
  if (kind === "directory" && !stat.isDirectory()) throw new Error("PROVENANCE_SNAPSHOT_INVALID");
  return Object.freeze({
    file, kind, realpath: normalized(realpath), dev: String(stat.dev), ino: String(stat.ino),
    birthtimeNs: String(stat.birthtimeNs), ctimeNs: String(stat.ctimeNs), mtimeNs: String(stat.mtimeNs),
    size: String(stat.size), nlink: String(stat.nlink),
  });
}

function captureOutput(output, files) {
  const targets = new Map([[path.resolve(output), "directory"]]);
  for (const file of files) {
    let current = path.resolve(file);
    while (current !== path.resolve(output)) {
      targets.set(current, current === path.resolve(file) ? "file" : "directory");
      current = path.dirname(current);
    }
  }
  return Object.freeze([...targets].map(([file, kind]) => identity(file, kind)));
}

function captureFiles(filePaths) {
  return Object.freeze(filePaths.map((file) => identity(file)));
}

function fsyncFiles(filePaths) {
  for (const file of filePaths) {
    let descriptor;
    try {
      descriptor = fs.openSync(file, "r+");
      fs.fsyncSync(descriptor);
    } catch { throw new Error("PROVENANCE_FILE_SYNC_FAILED"); }
    finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
  }
}

function revalidate(snapshots) {
  try {
    for (const snapshot of snapshots) {
      if (!isDeepStrictEqual(identity(snapshot.file, snapshot.kind), snapshot)) throw new Error("changed");
    }
  } catch { throw new Error("PROVENANCE_SNAPSHOT_CHANGED"); }
}

function fileRecord(file, name) {
  const before = identity(file);
  const hash = crypto.createHash("sha256");
  let descriptor;
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    descriptor = fs.openSync(file, "r");
    let bytes;
    while ((bytes = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, bytes));
  } catch { throw new Error("PROVENANCE_FILE_UNAVAILABLE"); }
  finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
  const after = identity(file);
  if (!isDeepStrictEqual(before, after)) throw new Error("PROVENANCE_SNAPSHOT_CHANGED");
  const bytes = Number(after.size);
  if (!Number.isSafeInteger(bytes)) throw new Error("PROVENANCE_FILE_TOO_LARGE");
  return Object.freeze({ name, bytes, sha256: hash.digest("hex") });
}

function stageEntry(entry, session, index) {
  const temporary = path.join(path.dirname(entry.file), `.5e-rc-tmp-${session}-${index}-${path.basename(entry.file)}`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx");
    fs.writeFileSync(descriptor, entry.text, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    return { temporary, snapshot: identity(temporary) };
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    throw error;
  }
}

function assertPublicationFresh(finals) {
  const output = path.dirname(finals[0]);
  if (finals.some((file) => path.dirname(file) !== output || fs.existsSync(file))) {
    throw new Error("PROVENANCE_FILE_EXISTS");
  }
  if (fs.readdirSync(output).some((name) => name.startsWith(".5e-rc-tmp-"))) {
    throw new Error("PROVENANCE_TEMP_FILE_EXISTS");
  }
}

function publishTransaction(entries, hooks = {}) {
  assertPublicationFresh(entries.map((entry) => entry.file));
  const session = crypto.randomUUID();
  const staged = [];
  try {
    for (let index = 0; index < entries.length; index += 1) staged.push(stageEntry(entries[index], session, index));
    hooks.validateStaged?.(staged.map((item) => item.temporary));
    const commitIndex = entries.length - 1;
    for (let index = 0; index < commitIndex; index += 1) {
      hooks.beforePublish?.(index, entries[index].file);
      revalidate([staged[index].snapshot]);
      fs.linkSync(staged[index].temporary, entries[index].file);
      fs.unlinkSync(staged[index].temporary);
      identity(entries[index].file);
      hooks.afterPublish?.(index, entries[index].file);
    }
    hooks.beforePublish?.(commitIndex, entries[commitIndex].file);
    hooks.afterPublish?.(commitIndex, entries[commitIndex].file);
    hooks.beforeCommit?.();
    revalidate([staged[commitIndex].snapshot]);
    if (fs.existsSync(entries[commitIndex].file)) throw new Error("PROVENANCE_FILE_EXISTS");
    fs.renameSync(staged[commitIndex].temporary, entries[commitIndex].file);
    return;
  } catch (failure) {
    if (failure.code === "EEXIST") throw new Error("PROVENANCE_FILE_EXISTS");
    if (/^PROVENANCE_/u.test(failure.message || "")) throw failure;
  }
  throw new Error("PROVENANCE_WRITE_FAILED");
}

module.exports = { assertPublicationFresh, captureFiles, captureOutput, fileRecord, fsyncFiles, identity, publishTransaction, revalidate };

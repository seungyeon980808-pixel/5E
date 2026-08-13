const fs = require("node:fs");
const path = require("node:path");

class ArtifactInputError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "ArtifactInputError";
    this.code = code;
  }
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function walkDirectory(root) {
  const canonicalRoot = fs.realpathSync.native(root);
  const files = [];
  const visit = (directory, relativeDirectory = "") => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => compareText(a.name, b.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = path.posix.join(relativeDirectory, entry.name);
      const stats = fs.lstatSync(absolute);
      if (stats.isSymbolicLink()) throw new ArtifactInputError("ARTIFACT_LINK_UNSUPPORTED");
      const canonical = fs.realpathSync.native(absolute);
      const outside = path.relative(canonicalRoot, canonical);
      if (outside === ".." || outside.startsWith(`..${path.sep}`) || path.isAbsolute(outside)) {
        throw new ArtifactInputError("ARTIFACT_PATH_OUTSIDE_ROOT");
      }
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) files.push({ path: relative, bytes: stats.size });
    }
  };
  visit(canonicalRoot);
  return {
    files,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    read(relativePath) { return fs.readFileSync(path.join(canonicalRoot, ...relativePath.split("/"))); },
  };
}

function readAsar(archivePath) {
  const archive = fs.readFileSync(archivePath);
  if (archive.length < 16) throw new ArtifactInputError("INVALID_ASAR_HEADER");
  const headerSize = archive.readUInt32LE(4);
  const headerEnd = 8 + headerSize;
  if (headerSize < 8 || headerEnd > archive.length) throw new ArtifactInputError("INVALID_ASAR_HEADER");
  const jsonLength = archive.readUInt32LE(12);
  if (jsonLength < 2 || 16 + jsonLength > headerEnd) throw new ArtifactInputError("INVALID_ASAR_HEADER");
  let header;
  try { header = JSON.parse(archive.toString("utf8", 16, 16 + jsonLength)); }
  catch { throw new ArtifactInputError("INVALID_ASAR_HEADER"); }
  const files = [];
  const nodes = new Map();
  const unpackedRoot = path.resolve(`${archivePath}.unpacked`);
  const visit = (node, parent = "") => {
    for (const name of Object.keys(node.files || {}).sort(compareText)) {
      if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
        throw new ArtifactInputError("INVALID_ASAR_PATH");
      }
      const child = node.files[name];
      const relative = path.posix.join(parent, name);
      if (relative === ".." || relative.startsWith("../") || path.posix.isAbsolute(relative)) {
        throw new ArtifactInputError("INVALID_ASAR_PATH");
      }
      if (child.files) visit(child, relative);
      else {
        const bytes = Number(child.size);
        if (!Number.isSafeInteger(bytes) || bytes < 0) throw new ArtifactInputError("INVALID_ASAR_ENTRY");
        if (child.unpacked) {
          if (!fs.existsSync(unpackedRoot) || fs.lstatSync(unpackedRoot).isSymbolicLink()) {
            throw new ArtifactInputError("ARTIFACT_LINK_UNSUPPORTED");
          }
          const canonicalRoot = fs.realpathSync.native(unpackedRoot);
          const external = path.resolve(unpackedRoot, ...relative.split("/"));
          if (!fs.existsSync(external)) throw new ArtifactInputError("INVALID_ASAR_ENTRY");
          const canonicalExternal = fs.realpathSync.native(external);
          const outside = path.relative(canonicalRoot, canonicalExternal);
          if (outside === ".." || outside.startsWith(`..${path.sep}`) || path.isAbsolute(outside)) {
            throw new ArtifactInputError("ARTIFACT_PATH_OUTSIDE_ROOT");
          }
          if (fs.lstatSync(external).isSymbolicLink() || !fs.statSync(canonicalExternal).isFile()) {
            throw new ArtifactInputError("INVALID_ASAR_ENTRY");
          }
          if (fs.statSync(canonicalExternal).size !== bytes) throw new ArtifactInputError("INVALID_ASAR_ENTRY");
          child.canonicalExternal = canonicalExternal;
        } else {
          const offset = Number(child.offset ?? (bytes === 0 ? "0" : Number.NaN));
          if (!Number.isSafeInteger(offset) || offset < 0 || headerEnd + offset + bytes > archive.length) {
            throw new ArtifactInputError("INVALID_ASAR_ENTRY");
          }
        }
        files.push({ path: relative, bytes });
        nodes.set(relative, child);
      }
    }
  };
  visit(header);
  return {
    files,
    bytes: fs.statSync(archivePath).size,
    read(relativePath) {
      const node = nodes.get(relativePath);
      if (!node) throw new ArtifactInputError("ASAR_FILE_MISSING");
      if (node.unpacked) return fs.readFileSync(node.canonicalExternal);
      const offset = Number(node.offset ?? (node.size === 0 ? "0" : Number.NaN));
      return archive.subarray(headerEnd + offset, headerEnd + offset + node.size);
    },
  };
}

function openArtifact(artifactPath) {
  const resolved = path.resolve(artifactPath);
  if (!fs.existsSync(resolved)) throw new ArtifactInputError("ARTIFACT_NOT_FOUND");
  if (fs.statSync(resolved).isFile()) {
    if (path.extname(resolved).toLowerCase() !== ".asar") throw new ArtifactInputError("ARTIFACT_TYPE_UNSUPPORTED");
    return { kind: "asar", ...readAsar(resolved) };
  }
  const archive = path.join(resolved, "resources", "app.asar");
  if (fs.existsSync(archive)) {
    const app = readAsar(archive);
    return { kind: "staged", ...app, bytes: walkDirectory(resolved).bytes };
  }
  const appDirectory = path.join(resolved, "resources", "app");
  if (fs.existsSync(appDirectory)) {
    const app = walkDirectory(appDirectory);
    return { kind: "unpacked", ...app, bytes: walkDirectory(resolved).bytes };
  }
  return { kind: "unpacked", ...walkDirectory(resolved) };
}

module.exports = { ArtifactInputError, openArtifact };

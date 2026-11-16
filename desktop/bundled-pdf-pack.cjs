const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_ASSET_BYTES = 256 * 1024 * 1024;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

const RECENT_THREE_PACK_IDENTITY = Object.freeze({
  id: "ebsi.recent-three.science",
  version: "1.0.0",
  documentCount: 72,
  pageCount: 288,
  packManifestSha256: "6be959d2ed1159bfa47c56b4fabc1092b1457e8cb996d40bd9179d06603a8c49",
  checksumsManifestSha256: "e8cfa67c428c7b016b57f26b15cfd14e019e0ed5fc27c16407a2e376c7021c66",
});

function digest(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function safeRelativePath(value) {
  if (typeof value !== "string" || value.startsWith("/") || value.includes("\\") || /[%?#]/u.test(value)
    || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Bundled PDF pack asset must use a safe relative path.");
  }
  return value;
}

function boundedManifest(root, name) {
  const target = path.join(root, name);
  const details = fs.lstatSync(target);
  if (!details.isFile() || details.isSymbolicLink() || details.size > MAX_MANIFEST_BYTES) {
    throw new Error(`Invalid bundled PDF pack manifest: ${name}`);
  }
  return fs.readFileSync(target);
}

function assertIdentity(packBytes, checksumBytes, pack, expected) {
  if (!expected) return;
  for (const field of ["id", "version", "documentCount", "pageCount"]) {
    if (pack[field] !== expected[field]) throw new Error(`Bundled PDF pack ${field} does not match the release identity.`);
  }
  if (digest(packBytes) !== expected.packManifestSha256 || digest(checksumBytes) !== expected.checksumsManifestSha256) {
    throw new Error("Bundled PDF pack release manifest hashes do not match.");
  }
}

function createBundledPdfPackReader({ root, expectedIdentity = null }) {
  const realRoot = fs.realpathSync(root);
  const packBytes = boundedManifest(realRoot, "pack.json");
  const checksumBytes = boundedManifest(realRoot, "checksums.json");
  const pack = JSON.parse(packBytes.toString("utf8"));
  const checksums = JSON.parse(checksumBytes.toString("utf8"));
  if (pack?.schemaVersion !== 1 || typeof pack.id !== "string" || typeof pack.version !== "string"
    || checksums?.algorithm !== "sha256" || !HASH_PATTERN.test(checksums.pack ?? "")
    || !checksums.files || typeof checksums.files !== "object" || Array.isArray(checksums.files)) {
    throw new Error("Bundled PDF pack manifests are invalid.");
  }
  if (digest(Buffer.from(JSON.stringify(pack))) !== checksums.pack) throw new Error("Bundled PDF pack metadata checksum does not match.");
  assertIdentity(packBytes, checksumBytes, pack, expectedIdentity);
  const declared = new Set(["pack.json", "checksums.json", ...Object.keys(checksums.files).map(safeRelativePath)]);

  async function read(relativePath) {
    const safePath = safeRelativePath(relativePath);
    if (!declared.has(safePath)) throw new Error("Bundled PDF pack asset is not declared.");
    if (safePath === "pack.json") return new Uint8Array(packBytes);
    if (safePath === "checksums.json") return new Uint8Array(checksumBytes);
    const target = path.resolve(realRoot, safePath);
    const relative = path.relative(realRoot, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Bundled PDF pack asset escaped its root.");
    const details = await fs.promises.lstat(target);
    if (!details.isFile() || details.isSymbolicLink() || details.size > MAX_ASSET_BYTES) throw new Error("Bundled PDF pack asset is invalid.");
    const realTarget = await fs.promises.realpath(target);
    if (realTarget !== target) throw new Error("Bundled PDF pack symbolic links are not allowed.");
    const bytes = await fs.promises.readFile(realTarget);
    if (digest(bytes) !== checksums.files[safePath]) throw new Error("Bundled PDF pack asset checksum does not match.");
    return new Uint8Array(bytes);
  }

  return Object.freeze({
    describe: () => Object.freeze({
      available: true, id: pack.id, version: pack.version, title: pack.title,
      documentCount: pack.documentCount, pageCount: pack.pageCount,
    }),
    read,
  });
}

module.exports = { RECENT_THREE_PACK_IDENTITY, createBundledPdfPackReader };

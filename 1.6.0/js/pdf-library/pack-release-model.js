const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const MAX_PACK_BYTES = 768 * 1024 * 1024;

function text(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`Candidate ${field} must be text.`);
  return value;
}

function count(value, field, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new TypeError(`Candidate ${field} is invalid.`);
  return value;
}

function safePath(value, field) {
  const parsed = text(value, field);
  if (parsed.startsWith("/") || parsed.includes("\\") || parsed.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new TypeError(`Candidate ${field} must be a safe relative path.`);
  }
  return parsed;
}

function hash(value, field) {
  if (!HASH_PATTERN.test(value ?? "")) throw new TypeError(`Candidate ${field} must be a lowercase SHA-256 hash.`);
  return value;
}

function versionParts(value, field) {
  const match = VERSION_PATTERN.exec(text(value, field));
  if (!match) throw new TypeError(`Candidate ${field} must be a semantic version.`);
  return Object.freeze([Number(match[1]), Number(match[2]), Number(match[3])]);
}

function compareVersion(left, right) {
  const leftParts = versionParts(left, "pack.version");
  const rightParts = versionParts(right, "installed.version");
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

export function candidatePackMetadata(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || candidate.schemaVersion !== 1 || candidate.status !== "candidate") {
    throw new TypeError("Candidate manifest is unsupported.");
  }
  const pack = candidate.pack;
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) throw new TypeError("Candidate pack metadata is missing.");
  const id = text(pack.id, "pack.id");
  if (!ID_PATTERN.test(id)) throw new TypeError("Candidate pack.id is invalid.");
  versionParts(pack.version, "pack.version");
  return Object.freeze({
    id,
    version: pack.version,
    path: safePath(pack.path, "pack.path"),
    documentCount: count(pack.documentCount, "pack.documentCount"),
    pageCount: count(pack.pageCount, "pack.pageCount"),
    files: count(pack.files, "pack.files", 512),
    bytes: count(pack.bytes, "pack.bytes", MAX_PACK_BYTES),
    packManifestSha256: hash(pack.packManifestSha256, "pack.packManifestSha256"),
    checksumsManifestSha256: hash(pack.checksumsManifestSha256, "pack.checksumsManifestSha256"),
  });
}

export function packUpdateStatus(candidate, installed) {
  if (!installed) return Object.freeze({ status: "install", fromVersion: null, toVersion: candidate.version });
  if (installed.id !== candidate.id) throw new TypeError("Installed pack ID differs from the candidate pack ID.");
  const comparison = compareVersion(candidate.version, installed.version);
  if (comparison > 0) return Object.freeze({ status: "update", fromVersion: installed.version, toVersion: candidate.version });
  if (comparison === 0) return Object.freeze({ status: "current", fromVersion: installed.version, toVersion: candidate.version });
  return Object.freeze({ status: "stale", fromVersion: installed.version, toVersion: candidate.version });
}

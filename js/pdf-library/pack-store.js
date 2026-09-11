import { createIndexedDbPackAdapter, createMemoryPackAdapter } from "./pack-adapters.js";
import { createDocumentRecord } from "./contract.js";
import { PackNotInstalledError, PackValidationError } from "./pack-errors.js";
import { materializePackDocument, materializePackSearchEntry } from "./pack-identities.js";

export { createIndexedDbPackAdapter, createMemoryPackAdapter, PackNotInstalledError, PackValidationError };

const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 512,
  maxFileBytes: 256 * 1024 * 1024,
  maxTotalBytes: 768 * 1024 * 1024,
  maxJsonBytes: 32 * 1024 * 1024,
});
const PACK_KINDS = new Set(["exam", "textbook", "curriculum", "user"]);
const ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

function bytesOf(value, field) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new PackValidationError(field, "expected bytes");
}

function validPath(value, field) {
  if (typeof value !== "string" || value.length === 0 || value.length > 240) {
    throw new PackValidationError(field, "expected a non-empty relative path of at most 240 characters");
  }
  if (value.startsWith("/") || value.startsWith("\\") || value.includes("\\") || value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new PackValidationError(field, "path must remain inside the pack");
  }
  return value;
}

function stringField(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw new PackValidationError(field, "expected text");
  return value;
}

function integerField(value, field, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new PackValidationError(field, `expected an integer >= ${minimum}`);
  return value;
}

function stringList(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new PackValidationError(field, "expected a text array");
  }
  return Object.freeze([...new Set(value)]);
}

function parseVersion(value, field) {
  const match = VERSION_PATTERN.exec(stringField(value, field));
  if (!match) throw new PackValidationError(field, "expected semantic version major.minor.patch");
  return Object.freeze([Number(match[1]), Number(match[2]), Number(match[3])]);
}

function compareVersions(left, right) {
  const a = parseVersion(left, "version");
  const b = parseVersion(right, "installed version");
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function copyRecord(record) {
  const fileChecksums = record.fileChecksums ? Object.freeze({ ...record.fileChecksums }) : undefined;
  return Object.freeze({ ...record, pack: Object.freeze({ ...record.pack }), fileChecksums });
}

function parseJsonAsset(bytes, field) {
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new PackValidationError(field, "expected a JSON object");
    return parsed;
  } catch (error) {
    if (error instanceof PackValidationError) throw error;
    throw new PackValidationError(field, "expected valid UTF-8 JSON");
  }
}

function catalogDocument(catalog, document) {
  const parsed = createDocumentRecord(document);
  const metadata = catalog.documentMetadata?.[parsed.id];
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? Object.freeze({ ...parsed, metadata: Object.freeze({ ...metadata }) })
    : parsed;
}

function normalizePack(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new PackValidationError("pack.json", "expected an object");
  if (raw.schemaVersion !== 1) throw new PackValidationError("schemaVersion", "only version 1 is supported");
  const id = stringField(raw.id, "id");
  if (!ID_PATTERN.test(id)) throw new PackValidationError("id", "use lowercase letters, numbers, dots, underscores, or hyphens");
  parseVersion(raw.version, "version");
  parseVersion(raw.minAppVersion, "minAppVersion");
  if (!PACK_KINDS.has(raw.kind)) throw new PackValidationError("kind", "unsupported kind");
  const createdAt = stringField(raw.createdAt, "createdAt");
  if (!Number.isFinite(Date.parse(createdAt))) throw new PackValidationError("createdAt", "expected an ISO date");
  if (!raw.paths || typeof raw.paths !== "object" || Array.isArray(raw.paths)) throw new PackValidationError("paths", "expected an object");
  const academicYears = Array.isArray(raw.academicYears) ? raw.academicYears.map((year) => integerField(year, "academicYears", 1900)) : null;
  if (!academicYears) throw new PackValidationError("academicYears", "expected an integer array");
  const documents = Array.isArray(raw.paths.documents) ? raw.paths.documents.map((path, index) => validPath(path, `paths.documents[${index}]`)) : null;
  if (!documents) throw new PackValidationError("paths.documents", "expected a path array");
  return Object.freeze({
    schemaVersion: 1,
    id,
    version: raw.version,
    title: stringField(raw.title, "title"),
    kind: raw.kind,
    subjects: stringList(raw.subjects, "subjects"),
    academicYears: Object.freeze([...new Set(academicYears)]),
    documentCount: integerField(raw.documentCount, "documentCount"),
    pageCount: integerField(raw.pageCount, "pageCount"),
    paths: Object.freeze({
      catalog: validPath(raw.paths.catalog, "paths.catalog"),
      searchIndex: validPath(raw.paths.searchIndex, "paths.searchIndex"),
      documents: Object.freeze(documents),
    }),
    createdAt,
    minAppVersion: raw.minAppVersion,
  });
}

async function validateBundle(bundle, configuredLimits) {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) throw new PackValidationError("bundle", "expected an object");
  const limits = Object.freeze({ ...DEFAULT_LIMITS, ...configuredLimits });
  const pack = normalizePack(bundle.pack);
  if (!bundle.checksums || bundle.checksums.algorithm !== "sha256" || !HASH_PATTERN.test(bundle.checksums.pack ?? "") || !bundle.checksums.files || typeof bundle.checksums.files !== "object") {
    throw new PackValidationError("checksums.json", "expected SHA-256 file hashes");
  }
  if (!Array.isArray(bundle.assets) || bundle.assets.length === 0 || bundle.assets.length > limits.maxFiles) {
    throw new PackValidationError("assets", `expected 1 to ${limits.maxFiles} files`);
  }
  const assets = [];
  let totalBytes = 0;
  const seenPaths = new Set();
  for (let index = 0; index < bundle.assets.length; index += 1) {
    const rawAsset = bundle.assets[index];
    if (!rawAsset || typeof rawAsset !== "object") throw new PackValidationError(`assets[${index}]`, "expected an object");
    const path = validPath(rawAsset.path, `assets[${index}].path`);
    if (seenPaths.has(path)) throw new PackValidationError(`assets[${index}].path`, "duplicate path");
    seenPaths.add(path);
    const bytes = bytesOf(rawAsset.bytes, `assets[${index}].bytes`);
    if (bytes.byteLength > limits.maxFileBytes) throw new PackValidationError(path, `file exceeds ${limits.maxFileBytes} bytes`);
    totalBytes += bytes.byteLength;
    if (totalBytes > limits.maxTotalBytes) throw new PackValidationError("assets", `pack exceeds ${limits.maxTotalBytes} bytes`);
    const expected = bundle.checksums.files[path];
    if (typeof expected !== "string" || !HASH_PATTERN.test(expected)) throw new PackValidationError(`checksums.${path}`, "expected a lowercase SHA-256 hash");
    if (await sha256Hex(bytes) !== expected) throw new PackValidationError(path, "SHA-256 mismatch");
    assets.push(Object.freeze({ path, bytes: new Uint8Array(bytes), checksum: expected }));
  }
  const checksumPaths = Object.keys(bundle.checksums.files);
  if (checksumPaths.length !== assets.length || checksumPaths.some((path) => !seenPaths.has(path))) {
    throw new PackValidationError("checksums.json", "hash paths must exactly match assets");
  }
  const requiredPaths = [pack.paths.catalog, pack.paths.searchIndex, ...pack.paths.documents];
  if (requiredPaths.some((path) => !seenPaths.has(path))) throw new PackValidationError("paths", "a declared file is missing");
  const parsedJson = new Map();
  for (const jsonPath of [pack.paths.catalog, pack.paths.searchIndex]) {
    const jsonAsset = assets.find((asset) => asset.path === jsonPath);
    if (jsonAsset.bytes.byteLength > limits.maxJsonBytes) throw new PackValidationError(jsonPath, `JSON exceeds ${limits.maxJsonBytes} bytes`);
    parsedJson.set(jsonPath, parseJsonAsset(jsonAsset.bytes, jsonPath));
  }
  const catalog = parsedJson.get(pack.paths.catalog);
  const searchIndex = parsedJson.get(pack.paths.searchIndex);
  if (!Array.isArray(catalog.documents) || catalog.documents.length !== pack.documentCount) {
    throw new PackValidationError(pack.paths.catalog, "document count does not match pack.json");
  }
  let normalizedDocuments;
  try {
    normalizedDocuments = catalog.documents.map((document) => catalogDocument(catalog, document));
  } catch (error) {
    throw new PackValidationError(pack.paths.catalog, error instanceof Error ? error.message : "invalid document contract");
  }
  const pageCount = normalizedDocuments.reduce((sum, document) => sum + document.pageCount, 0);
  if (pageCount !== pack.pageCount) throw new PackValidationError(pack.paths.catalog, "page count does not match pack.json");
  if (searchIndex.schemaVersion !== "pdf-search-index-v1" || !Array.isArray(searchIndex.entries)) {
    throw new PackValidationError(pack.paths.searchIndex, "unsupported search index");
  }
  for (const documentPath of pack.paths.documents) {
    const documentAsset = assets.find((asset) => asset.path === documentPath);
    if (documentAsset.bytes.byteLength < 5 || new TextDecoder().decode(documentAsset.bytes.subarray(0, 5)) !== "%PDF-") {
      throw new PackValidationError(documentPath, "expected PDF bytes");
    }
  }
  const metadataHash = await sha256Hex(new TextEncoder().encode(JSON.stringify(pack)));
  if (metadataHash !== bundle.checksums.pack) throw new PackValidationError("checksums.pack", "pack.json metadata mismatch");
  const checksumFingerprint = await sha256Hex(new TextEncoder().encode(JSON.stringify([bundle.checksums.pack, Object.entries(bundle.checksums.files).sort()])));
  return Object.freeze({ pack, assets: Object.freeze(assets), checksumFingerprint });
}

export async function sha256Hex(value) {
  const bytes = bytesOf(value, "hash input");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createPackStore({ adapter, limits = {} }) {
  if (!adapter || typeof adapter.list !== "function" || typeof adapter.commitInstall !== "function") {
    throw new PackValidationError("adapter", "missing pack persistence methods");
  }
  return Object.freeze({
    async list() {
      return (await adapter.list()).map(copyRecord);
    },
    async install(bundle) {
      const validated = await validateBundle(bundle, limits);
      const installed = (await adapter.list()).find(({ id }) => id === validated.pack.id);
      if (installed && compareVersions(validated.pack.version, installed.version) < 0) {
        throw new PackValidationError("version", `cannot replace ${installed.version} with an older version`);
      }
      if (installed && validated.pack.version === installed.version) {
        if (installed.checksumFingerprint !== validated.checksumFingerprint) throw new PackValidationError("version", "an installed version cannot change its checksums");
        return copyRecord(installed);
      }
      const fileChecksums = Object.freeze(Object.fromEntries(validated.assets.map((asset) => [asset.path, asset.checksum]))); const record = Object.freeze({ ...validated.pack, pack: validated.pack, enabled: installed?.enabled ?? true, checksumFingerprint: validated.checksumFingerprint, fileChecksums });
      await adapter.commitInstall(record, validated.assets, installed?.version ?? null);
      return copyRecord(record);
    },
    async setEnabled(packId, enabled) {
      if (typeof enabled !== "boolean") throw new PackValidationError("enabled", "expected a boolean");
      await adapter.setEnabled(stringField(packId, "packId"), enabled);
    },
    async remove(packId) {
      await adapter.remove(stringField(packId, "packId"));
    },
    async readAsset(packId, path) {
      return adapter.readAsset(stringField(packId, "packId"), validPath(path, "path"));
    },
    async enabledCatalog() {
      const enabled = (await adapter.list()).filter((record) => record.enabled);
      const documents = [];
      const entries = [];
      for (const record of enabled) {
        const [catalogBytes, searchBytes] = await Promise.all([
          adapter.readAsset(record.id, record.paths.catalog),
          adapter.readAsset(record.id, record.paths.searchIndex),
        ]);
        const catalog = parseJsonAsset(catalogBytes, record.paths.catalog);
        const searchIndex = parseJsonAsset(searchBytes, record.paths.searchIndex);
        for (const document of catalog.documents) {
          const prefix = `${record.id}/`; const relative = document.source?.locator?.startsWith(prefix) ? document.source.locator.slice(prefix.length) : "";
          documents.push(materializePackDocument(record.id, catalog, document, record.fileChecksums?.[relative] ?? record.checksumFingerprint));
        }
        entries.push(...searchIndex.entries.map((entry) => materializePackSearchEntry(record.id, entry)));
      }
      return Object.freeze({
        documents: Object.freeze(documents),
        searchIndex: Object.freeze({ schemaVersion: "pdf-search-index-v1", entries: Object.freeze(entries) }),
      });
    },
    async enabledDocuments() {
      return (await this.enabledCatalog()).documents;
    },
    async openDocument(runtime, document) {
      if (!runtime || typeof runtime.openDocument !== "function") throw new PackValidationError("runtime", "missing openDocument");
      const records = await adapter.list();
      const record = records.find(({ id, enabled }) => enabled && document?.source?.locator?.startsWith(`${id}/`));
      if (!record) throw new PackValidationError("document.source", "enabled pack is not installed");
      const relativePath = validPath(document.source.locator.slice(record.id.length + 1), "document.source.locator");
      return runtime.openDocument({ id: document.id, title: document.title, source: document.source, metadata: document.metadata, data: await adapter.readAsset(record.id, relativePath) });
    },
  });
}

import { PackValidationError, sha256Hex } from "./pack-store.js?v=1.6.0-preview-labeler-0917-1111";
import { materializePackDocument, materializePackSearchEntry } from "./pack-identities.js?v=1.6.0-preview-labeler-0917-1111";

const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_JSON_BYTES = 32 * 1024 * 1024;
const MAX_PDF_BYTES = 256 * 1024 * 1024;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

function packPath(value, field) {
  if (typeof value !== "string" || value.startsWith("/") || value.includes("\\") || /[%?#]/u.test(value) || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new PackValidationError(field, "expected a safe relative path");
  }
  return value;
}

function packAssetUrl(root, value, field) {
  const relativePath = packPath(value, field);
  const resolved = new URL(relativePath, root);
  if (resolved.origin !== root.origin || !resolved.pathname.startsWith(root.pathname) || resolved.search || resolved.hash) {
    throw new PackValidationError(field, "expected a safe relative path");
  }
  return resolved;
}

function safeRemoteUrl(value, label) {
  const url = value instanceof URL ? value : new URL(value);
  if (url.username || url.password) throw new PackValidationError(label, "credentials are not allowed");
  if (url.protocol === "https:") return url;
  if (url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "[::1]")) return url;
  throw new PackValidationError(label, "expected HTTPS or exact loopback HTTP");
}

async function boundedBytes(response, maximum, label) {
  if (!response.ok) throw new PackValidationError(label, `HTTP ${response.status}`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum) throw new PackValidationError(label, `exceeds ${maximum} bytes`);
  if (!response.body) throw new PackValidationError(label, "response body is missing");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new PackValidationError(label, `exceeds ${maximum} bytes`);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function json(bytes, label) {
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new PackValidationError(label, "expected an object");
    return value;
  } catch (error) {
    if (error instanceof PackValidationError) throw error;
    throw new PackValidationError(label, "expected valid UTF-8 JSON");
  }
}

async function fetchBytes(fetcher, url, maximum, label) {
  const requestUrl = safeRemoteUrl(url, label);
  const response = await fetcher(requestUrl.href, { redirect: "manual" });
  if (response.url) safeRemoteUrl(response.url, label);
  return boundedBytes(response, maximum, label);
}

export function createBrowserRemoteAssetCache({ storage = globalThis.caches, cacheName = "5e-pdf-library-v1" } = {}) {
  if (!storage || typeof storage.open !== "function") return null;
  const cacheKey = (url, checksum) => {
    const key = new URL(url);
    key.searchParams.set("__5e_sha256", checksum);
    return key.href;
  };
  return Object.freeze({
    async get(url, checksum) {
      const response = await (await storage.open(cacheName)).match(cacheKey(url, checksum));
      return response?.ok ? new Uint8Array(await response.arrayBuffer()) : null;
    },
    async put(url, checksum, bytes) {
      await (await storage.open(cacheName)).put(cacheKey(url, checksum), new Response(bytes, {
        status: 200,
        headers: { "content-type": new URL(url).pathname.endsWith(".json") ? "application/json" : "application/pdf", "content-length": String(bytes.byteLength) },
      }));
    },
    async delete(url, checksum) {
      await (await storage.open(cacheName)).delete(cacheKey(url, checksum));
    },
  });
}

export async function loadRemotePack({ baseUrl, fetcher = globalThis.fetch, assetCache = createBrowserRemoteAssetCache() }) {
  if (typeof baseUrl !== "string" || baseUrl.trim() === "") throw new PackValidationError("baseUrl", "remote pack is unconfigured");
  const root = safeRemoteUrl(new URL(baseUrl, globalThis.location?.href ?? "http://localhost/"), "baseUrl");
  if (!root.pathname.endsWith("/") || root.search || root.hash) throw new PackValidationError("baseUrl", "expected a directory URL without query or fragment");
  const [packBytes, checksumBytes] = await Promise.all([
    fetchBytes(fetcher, new URL("pack.json", root).href, MAX_MANIFEST_BYTES, "pack.json"),
    fetchBytes(fetcher, new URL("checksums.json", root).href, MAX_MANIFEST_BYTES, "checksums.json"),
  ]);
  const pack = json(packBytes, "pack.json");
  const checksums = json(checksumBytes, "checksums.json");
  if (pack.schemaVersion !== 1 || typeof pack.id !== "string" || typeof pack.version !== "string") throw new PackValidationError("pack.json", "unsupported manifest");
  if (checksums.algorithm !== "sha256" || !HASH_PATTERN.test(checksums.pack ?? "") || !checksums.files || typeof checksums.files !== "object") {
    throw new PackValidationError("checksums.json", "expected SHA-256 hashes");
  }
  if (await sha256Hex(new TextEncoder().encode(JSON.stringify(pack))) !== checksums.pack) throw new PackValidationError("pack.json", "metadata checksum mismatch");
  const catalogPath = packPath(pack.paths?.catalog, "paths.catalog");
  const searchPath = packPath(pack.paths?.searchIndex, "paths.searchIndex");
  const readIndex = async (relativePath) => {
    const url = packAssetUrl(root, relativePath, "index").href;
    const checksum = checksums.files[relativePath];
    if (!HASH_PATTERN.test(checksum ?? "")) throw new PackValidationError(relativePath, "missing checksum");
    let bytes;
    try { bytes = await assetCache?.get(url, checksum); } catch {}
    if (bytes && bytes.byteLength <= MAX_JSON_BYTES && await sha256Hex(bytes) === checksum) return bytes;
    bytes = await fetchBytes(fetcher, url, MAX_JSON_BYTES, relativePath);
    if (await sha256Hex(bytes) !== checksum) throw new PackValidationError(relativePath, "SHA-256 mismatch");
    try { await assetCache?.put(url, checksum, bytes); } catch {}
    return bytes;
  };
  const [catalogBytes, searchBytes] = await Promise.all([readIndex(catalogPath), readIndex(searchPath)]);
  if (await sha256Hex(catalogBytes) !== checksums.files[catalogPath]) throw new PackValidationError(catalogPath, "SHA-256 mismatch");
  if (await sha256Hex(searchBytes) !== checksums.files[searchPath]) throw new PackValidationError(searchPath, "SHA-256 mismatch");
  const catalog = json(catalogBytes, catalogPath);
  const searchIndex = json(searchBytes, searchPath);
  if (!Array.isArray(catalog.documents) || catalog.documents.length !== pack.documentCount) throw new PackValidationError(catalogPath, "document count mismatch");
  if (searchIndex.schemaVersion !== "pdf-search-index-v1" || !Array.isArray(searchIndex.entries)) throw new PackValidationError(searchPath, "unsupported search index");
  const documents = Object.freeze(catalog.documents.map((document) => {
    const prefix = `${pack.id}/`;
    if (!document.source?.locator?.startsWith(prefix)) throw new PackValidationError("document.source", "does not belong to this pack");
    const relativePath = packPath(document.source.locator.slice(prefix.length), "document.source.locator");
    const sourceSha256 = checksums.files[relativePath];
    if (!HASH_PATTERN.test(sourceSha256 ?? "")) throw new PackValidationError(relativePath, "missing checksum");
    return materializePackDocument(pack.id, catalog, document, sourceSha256);
  }));
  if (documents.reduce((sum, document) => sum + document.pageCount, 0) !== pack.pageCount) throw new PackValidationError(catalogPath, "page count mismatch");
  const pendingDocuments = new Map();
  const readDocument = async (document) => {
    const prefix = `${pack.id}/`;
    if (!document?.source?.locator?.startsWith(prefix)) throw new PackValidationError("document.source", "does not belong to this pack");
    const relativePath = packPath(document.source.locator.slice(prefix.length), "document.source.locator");
    const checksum = checksums.files[relativePath];
    if (!HASH_PATTERN.test(checksum ?? "")) throw new PackValidationError(relativePath, "missing checksum");
    if (!pendingDocuments.has(relativePath)) {
      pendingDocuments.set(relativePath, (async () => {
        const assetUrl = packAssetUrl(root, relativePath, "document.source.locator").href;
        let bytes = null;
        try { bytes = await assetCache?.get(assetUrl, checksum); } catch {}
        const isPdf = bytes && bytes.byteLength >= 5 && new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
        if (bytes && (bytes.byteLength > MAX_PDF_BYTES || !isPdf || await sha256Hex(bytes) !== checksum)) {
          try { await assetCache?.delete(assetUrl, checksum); } catch {}
          bytes = null;
        }
        if (!bytes) {
          bytes = await fetchBytes(fetcher, assetUrl, MAX_PDF_BYTES, relativePath);
          if (await sha256Hex(bytes) !== checksum) throw new PackValidationError(relativePath, "SHA-256 mismatch");
          if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new PackValidationError(relativePath, "expected PDF bytes");
          try { await assetCache?.put(assetUrl, checksum, bytes); } catch {}
        }
        return bytes;
      })());
    }
    const pending = pendingDocuments.get(relativePath);
    try { return (await pending).slice(); }
    finally { if (pendingDocuments.get(relativePath) === pending) pendingDocuments.delete(relativePath); }
  };
  return Object.freeze({
    id: pack.id,
    version: pack.version,
    title: pack.title,
    academicYears: Object.freeze([...(pack.academicYears || [])]),
    subjects: Object.freeze([...(pack.subjects || [])]),
    documentCount: pack.documentCount,
    pageCount: pack.pageCount,
    bytes: Number(pack.bytes) || null,
    documents,
    searchIndex: Object.freeze({
      ...searchIndex,
      entries: Object.freeze(searchIndex.entries.map((entry) => materializePackSearchEntry(pack.id, entry))),
    }),
    async downloadDocument(document) {
      return Object.freeze({
        bytes: await readDocument(document),
        fileName: document.source.displayName || `${document.title}.pdf`,
        mimeType: "application/pdf",
      });
    },
    async openDocument(runtime, document) {
      return runtime.openDocumentResource({ id: document.id, title: document.title, source: document.source, metadata: document.metadata, data: await readDocument(document) }, document);
    },
  });
}

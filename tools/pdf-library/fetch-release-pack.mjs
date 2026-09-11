import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createMemoryPackAdapter, createPackStore } from "../../js/pdf-library/pack-store.js";
import { readPackDirectory } from "./pack-directory.mjs";

const require = createRequire(import.meta.url);
const { RECENT_THREE_PACK_IDENTITY } = require("../../desktop/bundled-pdf-pack.cjs");
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_ASSET_BYTES = 256 * 1024 * 1024;
const MAX_TOTAL_BYTES = 768 * 1024 * 1024;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeBaseUrl(value) {
  const url = new URL(value);
  const loopback = url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "[::1]");
  if (url.username || url.password || (url.protocol !== "https:" && !loopback)) {
    throw new Error("PDF pack base URL must be credential-free HTTPS (exact loopback HTTP is test-only).");
  }
  if (!url.pathname.endsWith("/") || url.pathname.includes("%") || url.search || url.hash) {
    throw new Error("PDF pack base URL must be an unambiguous directory URL.");
  }
  return url;
}

function safeAssetPath(value) {
  if (typeof value !== "string" || value.startsWith("/") || value.includes("\\") || /[%?#]/u.test(value)
    || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`PDF pack manifest contains an unsafe asset path: ${value}`);
  }
  return value;
}

function assetUrl(root, relativePath) {
  const url = new URL(safeAssetPath(relativePath), root);
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname) || url.search || url.hash) {
    throw new Error(`PDF pack asset escaped its base URL: ${relativePath}`);
  }
  return url;
}

async function fetchBounded(url, maximum) {
  const response = await fetch(url, { redirect: "manual" });
  if (!response.ok) throw new Error(`PDF pack download failed with HTTP ${response.status}: ${url.pathname}`);
  if (response.url) {
    const finalUrl = new URL(response.url);
    if (finalUrl.origin !== url.origin || finalUrl.pathname !== url.pathname || finalUrl.search || finalUrl.hash) {
      throw new Error(`PDF pack response URL changed unexpectedly: ${url.pathname}`);
    }
  }
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximum) throw new Error(`PDF pack asset exceeds ${maximum} bytes: ${url.pathname}`);
  if (!response.body) throw new Error(`PDF pack response body is missing: ${url.pathname}`);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) { await reader.cancel(); throw new Error(`PDF pack asset exceeds ${maximum} bytes: ${url.pathname}`); }
    chunks.push(value);
  }
  const bytes = Buffer.allocUnsafe(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function parseManifest(bytes, name) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { throw new Error(`PDF pack ${name} is not valid JSON.`); }
}

function assertReleaseIdentity(packBytes, checksumBytes, pack, expected) {
  for (const field of ["id", "version", "documentCount", "pageCount"]) {
    if (pack[field] !== expected[field]) throw new Error(`PDF pack ${field} does not match the required release pack.`);
  }
  if (sha256(packBytes) !== expected.packManifestSha256 || sha256(checksumBytes) !== expected.checksumsManifestSha256) {
    throw new Error("PDF pack release manifest hashes do not match.");
  }
}

async function verifyDownloadedPack(directory, expected) {
  const store = createPackStore({ adapter: createMemoryPackAdapter() });
  const record = await store.install(await readPackDirectory(directory));
  for (const field of ["id", "version", "documentCount", "pageCount"]) {
    if (record[field] !== expected[field]) throw new Error(`Downloaded PDF pack ${field} does not match.`);
  }
  return record;
}

export async function fetchReleasePack({ baseUrl, output, expectedIdentity = RECENT_THREE_PACK_IDENTITY }) {
  const root = safeBaseUrl(baseUrl);
  const destination = path.resolve(output);
  try { await stat(destination); throw new Error(`PDF pack output already exists: ${destination}`); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  const staging = `${destination}.building-${randomUUID()}`;
  await mkdir(staging, { recursive: true });
  try {
    const [packBytes, checksumBytes] = await Promise.all([
      fetchBounded(new URL("pack.json", root), MAX_MANIFEST_BYTES),
      fetchBounded(new URL("checksums.json", root), MAX_MANIFEST_BYTES),
    ]);
    const pack = parseManifest(packBytes, "pack.json");
    const checksums = parseManifest(checksumBytes, "checksums.json");
    if (pack?.schemaVersion !== 1 || checksums?.algorithm !== "sha256" || !HASH_PATTERN.test(checksums.pack ?? "")
      || !checksums.files || typeof checksums.files !== "object" || Array.isArray(checksums.files)) {
      throw new Error("PDF pack manifests are invalid.");
    }
    assertReleaseIdentity(packBytes, checksumBytes, pack, expectedIdentity);
    if (sha256(Buffer.from(JSON.stringify(pack))) !== checksums.pack) throw new Error("PDF pack metadata checksum does not match.");
    const assets = Object.entries(checksums.files).map(([relativePath, expectedHash]) => {
      if (!HASH_PATTERN.test(expectedHash)) throw new Error(`PDF pack checksum is invalid: ${relativePath}`);
      return { relativePath: safeAssetPath(relativePath), expectedHash };
    });
    const required = [pack.paths?.catalog, pack.paths?.searchIndex, ...(pack.paths?.documents || [])].map(safeAssetPath);
    const declared = new Set(assets.map((asset) => asset.relativePath));
    if (required.length !== pack.documentCount + 2 || required.some((relativePath) => !declared.has(relativePath))) {
      throw new Error("PDF pack declared paths do not match its catalog and documents.");
    }
    await Promise.all([
      writeFile(path.join(staging, "pack.json"), packBytes),
      writeFile(path.join(staging, "checksums.json"), checksumBytes),
    ]);
    let cursor = 0;
    let totalBytes = packBytes.byteLength + checksumBytes.byteLength;
    const worker = async () => {
      while (cursor < assets.length) {
        const asset = assets[cursor];
        cursor += 1;
        const bytes = await fetchBounded(assetUrl(root, asset.relativePath), MAX_ASSET_BYTES);
        totalBytes += bytes.byteLength;
        if (totalBytes > MAX_TOTAL_BYTES) throw new Error("PDF pack exceeds the total download limit.");
        if (sha256(bytes) !== asset.expectedHash) throw new Error(`PDF pack asset checksum does not match: ${asset.relativePath}`);
        const target = path.join(staging, asset.relativePath);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, bytes, { flag: "wx" });
      }
    };
    const outcomes = await Promise.allSettled(Array.from({ length: Math.min(4, assets.length) }, worker));
    const failed = outcomes.find((outcome) => outcome.status === "rejected");
    if (failed) throw failed.reason;
    const record = await verifyDownloadedPack(staging, expectedIdentity);
    await mkdir(path.dirname(destination), { recursive: true });
    await rename(staging, destination);
    return { output: destination, id: record.id, version: record.version, documents: record.documentCount, pages: record.pageCount, bytes: totalBytes };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? null : process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name} argument.`);
  return value;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const result = await fetchReleasePack({ baseUrl: argument("--base-url"), output: argument("--output") });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

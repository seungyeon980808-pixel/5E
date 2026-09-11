import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { candidatePackMetadata } from "../../js/pdf-library/pack-release-model.js";
import { createMemoryPackAdapter, createPackStore } from "../../js/pdf-library/pack-store.js";
import { readPackDirectory } from "./pack-directory.mjs";

const input = process.argv[2];
if (!input) throw new Error("Usage: node tools/pdf-library/verify-deployment-candidate.mjs CANDIDATE_DIRECTORY");
const candidateRoot = path.resolve(input);

function safePath(value, field) {
  if (typeof value !== "string" || value.startsWith("/") || value.includes("\\") || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`${field} must be a safe relative path.`);
  }
  return value;
}

async function filesBelow(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) return filesBelow(path.join(directory, entry.name), relative);
    if (!entry.isFile()) throw new Error(`Candidate contains a non-file entry: ${relative}`);
    return [relative];
  }));
  return nested.flat();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const candidateBytes = await readFile(path.join(candidateRoot, "candidate.json"));
const candidateText = candidateBytes.toString("utf8");
if (candidateText.includes(".omo")) throw new Error("Candidate manifest contains a repository evidence path.");
const candidate = JSON.parse(candidateText);
const packMetadata = candidatePackMetadata(candidate);
const appPath = safePath(candidate.app?.path, "app.path");
const packPath = packMetadata.path;
const allFiles = await filesBelow(candidateRoot);
if (allFiles.some((file) => file.split("/").includes(".omo"))) throw new Error("Candidate includes a .omo path.");
const [stageManifest, packManifest, checksumsManifest] = await Promise.all([
  readFile(path.join(candidateRoot, appPath, "stage-manifest.json")),
  readFile(path.join(candidateRoot, packPath, "pack.json")),
  readFile(path.join(candidateRoot, packPath, "checksums.json")),
]);
if (sha256(stageManifest) !== candidate.app.manifestSha256) throw new Error("App stage manifest SHA-256 mismatch.");
if (sha256(packManifest) !== packMetadata.packManifestSha256) throw new Error("Pack manifest SHA-256 mismatch.");
if (sha256(checksumsManifest) !== packMetadata.checksumsManifestSha256) throw new Error("Checksums manifest SHA-256 mismatch.");
const packFiles = await filesBelow(path.join(candidateRoot, packPath));
const packSizes = await Promise.all(packFiles.map((file) => stat(path.join(candidateRoot, packPath, file))));
if (packFiles.length !== packMetadata.files) throw new Error("Pack file count mismatch.");
if (packSizes.reduce((sum, details) => sum + details.size, 0) !== packMetadata.bytes) throw new Error("Pack byte size mismatch.");
const store = createPackStore({ adapter: createMemoryPackAdapter() });
await store.install(await readPackDirectory(path.join(candidateRoot, packPath)));
const [record] = await store.list();
if (record.id !== packMetadata.id || record.version !== packMetadata.version) throw new Error("Pack identity or version mismatch.");
process.stdout.write(`${JSON.stringify({ valid: true, candidate: candidateRoot, appVersion: candidate.appVersion, pack: packMetadata, files: allFiles.length })}\n`);

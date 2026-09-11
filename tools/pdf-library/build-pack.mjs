import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPackStore, createMemoryPackAdapter } from "../../js/pdf-library/pack-store.js";
import { createPdfRuntime } from "../../js/pdf-library/pdf-runtime.js";
import { buildSearchIndex } from "../../js/pdf-library/search.js";
import { readPackDirectory } from "./pack-directory.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? null : process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name} argument`);
  return path.resolve(value);
}

function requiredText(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`spec.${field} must be text`);
  return value;
}

function destinationPath(value) {
  const destination = requiredText(value, "documents[].destination");
  if (path.isAbsolute(destination) || destination.includes("\\") || destination.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe destination: ${destination}`);
  }
  return destination;
}

async function atomicReplace(staging, output) {
  const backup = `${output}.previous-${randomUUID()}`;
  let backedUp = false;
  try {
    try { await rename(output, backup); backedUp = true; } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    }
    await rename(staging, output);
  } catch (error) {
    if (backedUp) await rename(backup, output);
    throw error;
  }
  if (backedUp) await rm(backup, { recursive: true, force: true });
}

async function build() {
  const specPath = argument("--spec");
  const output = argument("--output");
  const specRoot = path.dirname(specPath);
  const spec = JSON.parse(await readFile(specPath, "utf8"));
  if (!Array.isArray(spec.documents) || spec.documents.length === 0) throw new Error("spec.documents must contain at least one PDF");
  const staging = `${output}.building-${randomUUID()}`;
  await mkdir(staging, { recursive: true });
  const runtime = createPdfRuntime();
  try {
    const documents = [];
    const documentMetadata = {};
    const figureCandidates = {};
    const destinations = [];
    for (const input of spec.documents) {
      const sourcePath = path.resolve(specRoot, requiredText(input.source, "documents[].source"));
      const destination = destinationPath(input.destination);
      const data = new Uint8Array(await readFile(sourcePath));
      const document = await runtime.openDocument({
        id: requiredText(input.id, "documents[].id"),
        title: requiredText(input.title, "documents[].title"),
        source: { kind: "pack", locator: `${spec.id}/${destination}`, displayName: path.basename(destination) },
        metadata: input.metadata,
        data,
      });
      documents.push(document);
      if (input.metadata) documentMetadata[document.id] = input.metadata;
      for (const page of document.pages) {
        for (const item of page.items) {
          figureCandidates[item.id] = await runtime.detectFigureCandidates({
            documentId: document.id,
            pageNumber: page.pageNumber,
            item,
          });
        }
      }
      destinations.push(destination);
      const target = path.join(staging, destination);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(sourcePath, target);
    }
    const catalog = {
      schemaVersion: "pdf-library-v1",
      documents: documents.map((document) => ({ ...document, pages: [] })),
      documentMetadata,
      figureCandidates,
    };
    const rawSearchIndex = buildSearchIndex(documents);
    const searchIndex = {
      ...rawSearchIndex,
      entries: rawSearchIndex.entries.map((entry) => ({
        ...entry,
        words: [],
        compactWords: entry.words.map((word) => [word.text, ...word.rect.map((value) => Math.round(value * 100000) / 100000)]),
        metadata: documentMetadata[entry.documentId] ?? null,
        figureCandidates: entry.itemId ? figureCandidates[entry.itemId]?.candidates ?? [] : [],
      })),
    };
    await writeFile(path.join(staging, "catalog.json"), `${JSON.stringify(catalog)}\n`);
    await writeFile(path.join(staging, "search-index.json"), `${JSON.stringify(searchIndex)}\n`);
    const pack = {
      schemaVersion: 1,
      id: spec.id,
      version: spec.version,
      title: spec.title,
      kind: spec.kind,
      subjects: spec.subjects,
      academicYears: spec.academicYears,
      documentCount: documents.length,
      pageCount: documents.reduce((sum, document) => sum + document.pageCount, 0),
      paths: { catalog: "catalog.json", searchIndex: "search-index.json", documents: destinations },
      createdAt: spec.createdAt,
      minAppVersion: spec.minAppVersion,
    };
    await writeFile(path.join(staging, "pack.json"), `${JSON.stringify(pack, null, 2)}\n`);
    const assetPaths = ["catalog.json", "search-index.json", ...destinations];
    const files = {};
    for (const relativePath of [...assetPaths].sort()) {
      files[relativePath] = createHash("sha256").update(await readFile(path.join(staging, relativePath))).digest("hex");
    }
    const packHash = createHash("sha256").update(JSON.stringify(pack)).digest("hex");
    await writeFile(path.join(staging, "checksums.json"), `${JSON.stringify({ algorithm: "sha256", pack: packHash, files }, null, 2)}\n`);
    const bundle = await readPackDirectory(staging);
    const store = createPackStore({ adapter: createMemoryPackAdapter() });
    await store.install(bundle);
    await atomicReplace(staging, output);
    process.stdout.write(`Validated PDF pack ${pack.id} ${pack.version}: ${pack.documentCount} documents, ${pack.pageCount} pages\n`);
  } finally {
    await runtime.clearCache();
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build().catch((error) => { // no-excuse-ok: catch
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

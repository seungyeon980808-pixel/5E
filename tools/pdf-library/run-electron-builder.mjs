import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { createMemoryPackAdapter, createPackStore } from "../../js/pdf-library/pack-store.js";
import { readPackDirectory } from "./pack-directory.mjs";

const require = createRequire(import.meta.url);
const { RECENT_THREE_PACK_IDENTITY } = require("../../desktop/bundled-pdf-pack.cjs");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function filesBelow(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relative = path.posix.join(prefix, entry.name);
    const target = path.join(directory, entry.name);
    const details = await lstat(target);
    if (details.isSymbolicLink()) throw new Error(`PDF pack source contains a symbolic link: ${relative}`);
    if (details.isDirectory()) return filesBelow(target, relative);
    if (!details.isFile()) throw new Error(`PDF pack source contains a non-file entry: ${relative}`);
    return [relative];
  }));
  return nested.flat();
}

async function verifyPackSource(source) {
  const root = path.resolve(source);
  const [packBytes, checksumBytes, bundle, sourceFiles] = await Promise.all([
    readFile(path.join(root, "pack.json")),
    readFile(path.join(root, "checksums.json")),
    readPackDirectory(root),
    filesBelow(root),
  ]);
  const store = createPackStore({ adapter: createMemoryPackAdapter() });
  const record = await store.install(bundle);
  for (const field of ["id", "version", "documentCount", "pageCount"]) {
    if (record[field] !== RECENT_THREE_PACK_IDENTITY[field]) throw new Error(`PDF pack ${field} does not match the required release pack.`);
  }
  if (sha256(packBytes) !== RECENT_THREE_PACK_IDENTITY.packManifestSha256
    || sha256(checksumBytes) !== RECENT_THREE_PACK_IDENTITY.checksumsManifestSha256) {
    throw new Error("PDF pack release manifest hashes do not match.");
  }
  const declaredFiles = ["pack.json", "checksums.json", ...Object.keys(bundle.checksums.files)].sort();
  if (JSON.stringify(sourceFiles.sort()) !== JSON.stringify(declaredFiles)) {
    throw new Error("PDF pack source must contain exactly its manifests and declared assets.");
  }
  return { root, record };
}

const platform = process.argv.includes("--win") ? "win" : process.argv.includes("--mac") ? "mac" : null;
if (!platform) throw new Error("Usage: node tools/pdf-library/run-electron-builder.mjs --win|--mac [--verify-only]");
const source = process.env.FIVE_E_PDF_PACK_SOURCE;
if (!source) throw new Error("FIVE_E_PDF_PACK_SOURCE must point to the verified recent-three-pack directory.");
const verified = await verifyPackSource(source);
process.stdout.write(`${JSON.stringify({ verifiedPack: verified.root, id: verified.record.id, documents: verified.record.documentCount, pages: verified.record.pageCount })}\n`);

if (!process.argv.includes("--verify-only")) {
  const builderCli = require.resolve("electron-builder/cli.js");
  const arguments_ = platform === "win"
    ? ["--win", "nsis", "--x64", "--publish", "never"]
    : ["--mac", "dmg", "--x64", "--arm64", "--publish", "never"];
  const result = spawnSync(process.execPath, [builderCli, ...arguments_], {
    stdio: "inherit", env: { ...process.env, FIVE_E_PDF_PACK_SOURCE: verified.root },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

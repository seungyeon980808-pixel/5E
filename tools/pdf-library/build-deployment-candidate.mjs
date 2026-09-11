import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createMemoryPackAdapter, createPackStore } from "../../js/pdf-library/pack-store.js";
import { readPackDirectory } from "./pack-directory.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function argument(name) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? null : process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name} argument.`);
  return value;
}

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function filesBelow(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) return filesBelow(path.join(directory, entry.name), relative);
    if (!entry.isFile()) throw new Error(`Candidate source contains a non-file entry: ${relative}`);
    return [relative];
  }));
  return nested.flat();
}

async function copyDirectory(source, destination) {
  const files = await filesBelow(source);
  for (const relative of files) {
    await mkdir(path.dirname(path.join(destination, relative)), { recursive: true });
    await copyFile(path.join(source, relative), path.join(destination, relative));
  }
  return files;
}

async function runStage(output, baseUrl) {
  const script = path.join(root, "tools", "pdf-library", "stage-distribution.mjs");
  const child = spawn(process.execPath, [script, "--output", output, "--pdf-pack-base-url", baseUrl], {
    cwd: root, stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (code !== 0) throw new Error(`App staging failed: ${stderr.trim()}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function gitOutput(arguments_) {
  const result = spawnSync("git", arguments_, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Unable to record candidate source identity: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

async function build() {
  const output = path.resolve(argument("--output"));
  const packSource = path.resolve(argument("--pack"));
  const baseUrl = argument("--pdf-pack-base-url");
  if (inside(root, output)) throw new Error("Candidate output must be outside the repository checkout.");
  try { await stat(output); throw new Error(`Candidate output already exists: ${output}`); } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  const store = createPackStore({ adapter: createMemoryPackAdapter() });
  await store.install(await readPackDirectory(packSource));
  const [packRecord] = await store.list();
  const staging = `${output}.building-${randomUUID()}`;
  const appPath = path.join(staging, "app");
  const packPath = path.join(staging, "pack", "recent-three");
  try {
    await mkdir(staging, { recursive: true });
    await runStage(appPath, baseUrl);
    const packFiles = await copyDirectory(packSource, packPath);
    const packSizes = await Promise.all(packFiles.map((relative) => stat(path.join(packPath, relative))));
    const [packageJson, stageManifest, packManifest, checksumsManifest] = await Promise.all([
      readFile(path.join(root, "package.json"), "utf8"),
      readFile(path.join(appPath, "stage-manifest.json")),
      readFile(path.join(packPath, "pack.json")),
      readFile(path.join(packPath, "checksums.json")),
    ]);
    const app = JSON.parse(stageManifest);
    const candidate = {
      schemaVersion: 1,
      status: "candidate",
      source: { gitCommit: gitOutput(["rev-parse", "HEAD"]), worktree: gitOutput(["status", "--porcelain=v1"]) === "" ? "clean" : "dirty" },
      appVersion: JSON.parse(packageJson).version,
      configuredPackBaseUrl: baseUrl,
      app: { path: "app", files: app.totals.files + 1, bytes: app.totals.bytes + stageManifest.byteLength, manifestSha256: sha256(stageManifest) },
      pack: {
        id: packRecord.id, version: packRecord.version, path: "pack/recent-three",
        documentCount: packRecord.documentCount, pageCount: packRecord.pageCount,
        files: packFiles.length, bytes: packSizes.reduce((sum, details) => sum + details.size, 0),
        packManifestSha256: sha256(packManifest), checksumsManifestSha256: sha256(checksumsManifest),
      },
    };
    const serialized = `${JSON.stringify(candidate, null, 2)}\n`;
    if (serialized.includes(".omo")) throw new Error("Candidate manifest contains a repository evidence path.");
    await writeFile(path.join(staging, "candidate.json"), serialized);
    await rename(staging, output);
    process.stdout.write(`${JSON.stringify({ candidate: output, appVersion: candidate.appVersion, pack: candidate.pack })}\n`);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

build().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

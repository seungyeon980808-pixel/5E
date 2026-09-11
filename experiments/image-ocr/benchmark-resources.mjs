import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fileBytes(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await fileBytes(file);
    else if (entry.isFile()) total += (await stat(file)).size;
  }
  return total;
}

export function createBenchmarkResourceInspector(experimentDirectory) {
  async function dependencyClosure(name, found = new Set()) {
    if (found.has(name)) return found;
    found.add(name);
    const metadata = JSON.parse(await readFile(path.join(experimentDirectory, "node_modules", name, "package.json"), "utf8"));
    for (const dependency of Object.keys(metadata.dependencies || {})) await dependencyClosure(dependency, found);
    return found;
  }

  async function packageInventory(rootName) {
    const names = [...await dependencyClosure(rootName)].sort();
    const packages = [];
    for (const name of names) {
      const directory = path.join(experimentDirectory, "node_modules", name);
      const metadata = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
      packages.push({ name, version: metadata.version, installedFileBytes: await fileBytes(directory) });
    }
    return {
      packages,
      installedFileBytes: packages.reduce((sum, item) => sum + item.installedFileBytes, 0),
    };
  }

  async function browserAsset(relative) {
    const file = path.join(experimentDirectory, "node_modules", relative);
    const bytes = await readFile(file);
    return {
      file: relative,
      bytes: bytes.byteLength,
      gzipBytes: gzipSync(bytes, { level: 9 }).byteLength,
      brotliBytes: brotliCompressSync(bytes).byteLength,
      sha256: sha256(bytes),
    };
  }

  return { browserAsset, packageInventory };
}

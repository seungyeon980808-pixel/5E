import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const MAX_FILES = 512;
const MAX_FILE_BYTES = 256 * 1024 * 1024;
const MAX_TOTAL_BYTES = 768 * 1024 * 1024;

function safePackPath(root, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath) || relativePath.includes("\\")) {
    throw new Error(`Unsafe pack path: ${relativePath}`);
  }
  const resolved = path.resolve(root, relativePath);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Pack path escapes its directory: ${relativePath}`);
  return resolved;
}

export async function readPackDirectory(directory) {
  const root = path.resolve(directory);
  const pack = JSON.parse(await readFile(path.join(root, "pack.json"), "utf8"));
  const checksums = JSON.parse(await readFile(path.join(root, "checksums.json"), "utf8"));
  const paths = Object.keys(checksums.files ?? {});
  if (paths.length === 0 || paths.length > MAX_FILES) throw new Error(`Pack contains an invalid file count: ${paths.length}`);
  const sizes = await Promise.all(paths.map(async (relativePath) => {
    const filePath = safePackPath(root, relativePath);
    const info = await stat(filePath);
    if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new Error(`Pack file exceeds limits: ${relativePath}`);
    return { relativePath, filePath, size: info.size };
  }));
  if (sizes.reduce((sum, item) => sum + item.size, 0) > MAX_TOTAL_BYTES) throw new Error("Pack exceeds the total byte limit");
  const assets = await Promise.all(sizes.map(async ({ relativePath, filePath }) => ({
    path: relativePath,
    bytes: new Uint8Array(await readFile(filePath)),
  })));
  return { pack, checksums, assets };
}

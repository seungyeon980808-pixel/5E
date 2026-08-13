const fs = require("node:fs");
const path = require("node:path");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"]);
const PDF_EXTENSIONS = new Set([".pdf"]);
const ASSET_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...PDF_EXTENSIONS]);

function isPathInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isAllowedLocalAsset(roots, filePath, extensions = ASSET_EXTENSIONS) {
  const resolved = path.resolve(String(filePath || ""));
  if (!extensions.has(path.extname(resolved).toLowerCase())) return false;
  try {
    const realCandidate = fs.realpathSync(resolved);
    return Array.from(roots).some((root) => isPathInside(fs.realpathSync(root), realCandidate));
  } catch {
    return false;
  }
}

function collectLocalAssets(root, limit = 5000) {
  const resolvedRoot = path.resolve(root);
  const assets = [];
  const pending = [resolvedRoot];
  while (pending.length && assets.length < limit) {
    const folder = pending.pop();
    let entries = [];
    try { entries = fs.readdirSync(folder, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        pending.push(fullPath);
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase();
      if (!entry.isFile() || !ASSET_EXTENSIONS.has(extension)) continue;
      let stat;
      try { stat = fs.statSync(fullPath); } catch { continue; }
      assets.push({
        path: fullPath,
        name: entry.name,
        relativePath: path.relative(resolvedRoot, fullPath),
        size: stat.size,
        modifiedAt: stat.mtimeMs,
        kind: PDF_EXTENSIONS.has(extension) ? "pdf" : "image",
      });
      if (assets.length >= limit) break;
    }
  }
  assets.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "ko"));
  return {
    images: assets.filter((asset) => asset.kind === "image"),
    pdfs: assets.filter((asset) => asset.kind === "pdf"),
  };
}

module.exports = {
  IMAGE_EXTENSIONS,
  PDF_EXTENSIONS,
  collectLocalAssets,
  isAllowedLocalAsset,
};

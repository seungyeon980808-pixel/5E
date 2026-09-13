const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_PDF_BYTES = 256 * 1024 * 1024;
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const READ_CHUNK_BYTES = 1024 * 1024;
const PDF_SIGNATURE = Buffer.from("%PDF-", "ascii");

const IMAGE_MIME_TYPES = Object.freeze({
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
});

class PdfLibraryScanError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PdfLibraryScanError";
    this.code = code;
  }
}

function assertActive(signal) {
  if (signal?.aborted) {
    throw new PdfLibraryScanError("PDF_LIBRARY_CANCELLED", "PDF folder scan was cancelled.");
  }
}

function tooLargeError(size, maxBytes) {
  const error = new PdfLibraryScanError("PDF_LIBRARY_TOO_LARGE", `Library file exceeds the ${maxBytes}-byte limit.`);
  error.size = size;
  error.maxBytes = maxBytes;
  return error;
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function hasPdfSignature(bytes) {
  return bytes.byteLength >= PDF_SIGNATURE.byteLength
    && Buffer.from(bytes.buffer, bytes.byteOffset, PDF_SIGNATURE.byteLength).equals(PDF_SIGNATURE);
}

async function readFileBounded(filePath, options) {
  assertActive(options.signal);
  const initial = await fs.promises.stat(filePath);
  if (initial.size > options.maxBytes) throw tooLargeError(initial.size, options.maxBytes);
  const handle = await fs.promises.open(filePath, "r");
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      assertActive(options.signal);
      const remainingWithSentinel = options.maxBytes - total + 1;
      const buffer = Buffer.allocUnsafe(Math.min(READ_CHUNK_BYTES, remainingWithSentinel));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > options.maxBytes) throw tooLargeError(total, options.maxBytes);
      chunks.push(buffer.subarray(0, bytesRead));
      await options.onChunk?.({ bytesRead, total });
    }
    return Buffer.concat(chunks, total);
  } finally {
    await handle.close();
  }
}

async function fileDigest(filePath, signal, maxBytes, readFile, expectedPdf) {
  assertActive(signal);
  const bytes = readFile
    ? await readFile(filePath, { signal })
    : await readFileBounded(filePath, { maxBytes, signal });
  assertActive(signal);
  if (bytes.byteLength > maxBytes) throw tooLargeError(bytes.byteLength, maxBytes);
  if (expectedPdf && !hasPdfSignature(bytes)) {
    throw new PdfLibraryScanError("PDF_LIBRARY_INVALID_PDF", "Library PDF does not have a valid PDF signature.");
  }
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function scanPdfFolder(options) {
  const root = await fs.promises.realpath(options.root);
  const rootStat = await fs.promises.stat(root);
  if (!rootStat.isDirectory()) {
    throw new PdfLibraryScanError("PDF_LIBRARY_FOLDER", "The connected PDF path is not a folder.");
  }
  const documents = [];
  const images = [];
  const folders = [];
  const warnings = [];
  const pending = [root];
  let scanned = 0;
  while (pending.length > 0) {
    assertActive(options.signal);
    const folder = pending.pop();
    const folderRelativePath = path.relative(root, folder).split(path.sep).join("/");
    const folderRecord = {
      relativePath: folderRelativePath,
      name: folderRelativePath ? path.basename(folder) : path.basename(root) || root,
      documentCount: 0,
      imageCount: 0,
      excludedDocumentCount: 0,
      excludedImageCount: 0,
    };
    folders.push(folderRecord);
    const entries = await fs.promises.readdir(folder, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      assertActive(options.signal);
      if (entry.isSymbolicLink()) continue;
      const candidate = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        const realFolder = await fs.promises.realpath(candidate);
        if (isPathInside(root, realFolder)) pending.push(realFolder);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      if (extension !== ".pdf" && !IMAGE_MIME_TYPES[extension]) continue;
      const included = !options.shouldInclude || options.shouldInclude(folderRelativePath);
      if (extension === ".pdf") {
        folderRecord.documentCount += 1;
        if (!included) folderRecord.excludedDocumentCount += 1;
      } else {
        folderRecord.imageCount += 1;
        if (!included) folderRecord.excludedImageCount += 1;
      }
      if (!included) continue;
      const realFile = await fs.promises.realpath(candidate);
      if (!isPathInside(root, realFile)) continue;
      const stat = await fs.promises.stat(realFile);
      const relativePath = path.relative(root, realFile).split(path.sep).join("/");
      const kind = IMAGE_MIME_TYPES[extension] ? "image" : "pdf";
      const maxBytes = kind === "image" ? MAX_IMAGE_BYTES : MAX_PDF_BYTES;
      if (stat.size > maxBytes) {
        const warning = { code: "PDF_LIBRARY_TOO_LARGE", kind, relativePath, size: stat.size, maxBytes };
        warnings.push(warning);
        options.onWarning?.(warning);
        continue;
      }
      let version;
      try {
        const previous = options.previousRecords?.get(relativePath);
        const unchanged = previous && previous.size === stat.size && previous.modifiedAt === stat.mtimeMs
          && typeof previous.version === "string" && /^[a-f0-9]{64}$/u.test(previous.version);
        version = unchanged ? previous.version
          : await fileDigest(realFile, options.signal, maxBytes, options.readFile, kind === "pdf");
      } catch (error) {
        if (error?.code !== "PDF_LIBRARY_TOO_LARGE" && error?.code !== "PDF_LIBRARY_INVALID_PDF") throw error;
        const warning = error.code === "PDF_LIBRARY_TOO_LARGE"
          ? { code: error.code, kind, relativePath, size: error.size, maxBytes }
          : { code: error.code, kind, relativePath };
        warnings.push(warning);
        options.onWarning?.(warning);
        continue;
      }
      if (IMAGE_MIME_TYPES[extension]) {
        images.push({ relativePath, name: path.basename(realFile), size: stat.size, modifiedAt: stat.mtimeMs, version, mimeType: IMAGE_MIME_TYPES[extension] });
        continue;
      }
      scanned += 1;
      documents.push({ relativePath, name: path.basename(realFile), size: stat.size, modifiedAt: stat.mtimeMs, version });
      options.onProgress?.({ scanned, relativePath });
      assertActive(options.signal);
    }
  }
  documents.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en"));
  images.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en"));
  folders.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "en"));
  return { root, documents, images, folders, warnings };
}

module.exports = { MAX_IMAGE_BYTES, MAX_PDF_BYTES, PdfLibraryScanError, hasPdfSignature, isPathInside, readFileBounded, scanPdfFolder };

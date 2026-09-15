export const PDF_IMPORT_MAX_BYTES = 256 * 1024 * 1024;
export const PDF_IMPORT_BATCH_MAX_BYTES = 512 * 1024 * 1024;
export const PDF_IMPORT_BATCH_MAX_FILES = 100;
export const IMAGE_IMPORT_MAX_BYTES = 64 * 1024 * 1024;
export const IMAGE_IMPORT_BATCH_MAX_BYTES = 256 * 1024 * 1024;
export const IMAGE_IMPORT_BATCH_MAX_FILES = 100;

const IMAGE_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
]);

function extension(name = "") {
  return String(name).toLowerCase().match(/\.[^.]+$/)?.[0] || "";
}

function matchesType(file, expected) {
  return !file.type || file.type === expected;
}

export function partitionLibraryImports(files, { currentPdfBytes = 0, currentPdfCount = 0, currentImageBytes = 0, currentImageCount = 0 } = {}) {
  const acceptedPdfs = [];
  const acceptedImages = [];
  const rejected = [];
  let pdfBytes = currentPdfBytes;
  let imageBytes = currentImageBytes;
  for (const file of files) {
    const ext = extension(file.name);
    if (ext === ".pdf" && matchesType(file, "application/pdf")) {
      if (file.size > PDF_IMPORT_MAX_BYTES) rejected.push({ file, reason: "PDF_SIZE" });
      else if (currentPdfCount + acceptedPdfs.length >= PDF_IMPORT_BATCH_MAX_FILES) rejected.push({ file, reason: "PDF_COUNT" });
      else if (pdfBytes + file.size > PDF_IMPORT_BATCH_MAX_BYTES) rejected.push({ file, reason: "PDF_BATCH_SIZE" });
      else {
        acceptedPdfs.push(file);
        pdfBytes += file.size;
      }
      continue;
    }
    const imageType = IMAGE_TYPES.get(ext);
    if (imageType && matchesType(file, imageType)) {
      if (currentImageCount + acceptedImages.length >= IMAGE_IMPORT_BATCH_MAX_FILES) rejected.push({ file, reason: "IMAGE_COUNT" });
      else if (file.size > IMAGE_IMPORT_MAX_BYTES) rejected.push({ file, reason: "IMAGE_SIZE" });
      else if (imageBytes + file.size > IMAGE_IMPORT_BATCH_MAX_BYTES) rejected.push({ file, reason: "IMAGE_BATCH_SIZE" });
      else {
        acceptedImages.push(file);
        imageBytes += file.size;
      }
      continue;
    }
    rejected.push({ file, reason: "UNSUPPORTED" });
  }
  return Object.freeze({ acceptedPdfs, acceptedImages, rejected });
}

export function safeExternalSourceUrl(value, baseUrl = globalThis.location?.href) {
  if (!value) return null;
  try {
    const raw = String(value).trim();
    if (!raw || /\s/.test(raw) || (raw.includes(":") && !/^[a-z][a-z\d+.-]*:/i.test(raw))) return null;
    const url = new URL(raw, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function importRejectionMessage(rejected) {
  const counts = rejected.reduce((groups, item) => ((groups[item.reason] = (groups[item.reason] || 0) + 1), groups), {});
  const parts = [];
  if (counts.UNSUPPORTED) parts.push(`지원하지 않는 형식 ${counts.UNSUPPORTED}개`);
  if (counts.PDF_SIZE) parts.push(`256MB 초과 PDF ${counts.PDF_SIZE}개`);
  if (counts.PDF_COUNT) parts.push(`100개 초과 PDF ${counts.PDF_COUNT}개`);
  if (counts.PDF_BATCH_SIZE) parts.push(`PDF 합계 512MB 초과 ${counts.PDF_BATCH_SIZE}개`);
  if (counts.IMAGE_SIZE) parts.push(`64MB 초과 이미지 ${counts.IMAGE_SIZE}개`);
  if (counts.IMAGE_COUNT) parts.push(`100개 초과 이미지 ${counts.IMAGE_COUNT}개`);
  if (counts.IMAGE_BATCH_SIZE) parts.push(`이미지 합계 256MB 초과 ${counts.IMAGE_BATCH_SIZE}개`);
  return parts.length ? `${parts.join(" · ")}를 가져오지 않았습니다.` : "";
}

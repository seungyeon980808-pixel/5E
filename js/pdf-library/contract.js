export const PDF_LIBRARY_SCHEMA = "pdf-library-v1";
export const PDF_RENDER_SCHEMA = "pdf-render-v1";

function nonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${field} must be a non-empty string`);
  return value;
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${field} must be a positive integer`);
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (ArrayBuffer.isView(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function normalizedRect(rect) {
  if (!Array.isArray(rect) || rect.length !== 4 || rect.some((value) => !Number.isFinite(value))) {
    throw new TypeError("Normalized rectangle must contain four finite numbers");
  }
  const [x, y, width, height] = rect;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
    throw new RangeError("Normalized rectangle must fit within the page");
  }
  return Object.freeze([x, y, width, height]);
}

export function createSourceRecord(input) {
  if (!input || !["file", "pack", "url"].includes(input.kind)) throw new TypeError("source.kind is invalid");
  const source = {
    kind: input.kind,
    locator: nonEmptyString(input.locator, "source.locator"),
    displayName: nonEmptyString(input.displayName, "source.displayName"),
  };
  if (input.sha256 !== undefined) source.sha256 = nonEmptyString(input.sha256, "source.sha256");
  if (input.connectionId !== undefined) source.connectionId = nonEmptyString(input.connectionId, "source.connectionId");
  if (input.relativePath !== undefined) {
    const relativePath = nonEmptyString(input.relativePath, "source.relativePath").replace(/\\/gu, "/");
    if (relativePath.length > 4096 || relativePath.includes("\0") || relativePath.startsWith("/") || /^[a-z]:\//iu.test(relativePath)
      || relativePath.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new TypeError("source.relativePath must be a safe relative path");
    }
    source.relativePath = relativePath;
  }
  return deepFreeze(source);
}

export function createCropSource(input) {
  return deepFreeze({
    documentId: nonEmptyString(input?.documentId, "documentId"),
    pageNumber: positiveInteger(input?.pageNumber, "pageNumber"),
    rect: normalizedRect(input?.rect),
    fullPageFallback: input?.fullPageFallback === true,
  });
}

export function createWordRecord(input) {
  return deepFreeze({ text: nonEmptyString(input?.text, "word.text"), rect: normalizedRect(input?.rect) });
}

export function createItemRecord(input) {
  const itemNumber = input?.itemNumber === null ? null : positiveInteger(input?.itemNumber, "itemNumber");
  const confidence = input?.confidence ?? 1;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new RangeError("confidence must be between 0 and 1");
  const source = createCropSource(input.source);
  return deepFreeze({
    id: nonEmptyString(input.id, "item.id"), documentId: source.documentId, pageNumber: source.pageNumber,
    itemNumber, label: nonEmptyString(input.label, "item.label"), rect: source.rect, confidence, source,
  });
}

export function createPageRecord(input) {
  const widthPoints = input?.widthPoints;
  const heightPoints = input?.heightPoints;
  if (!Number.isFinite(widthPoints) || widthPoints <= 0 || !Number.isFinite(heightPoints) || heightPoints <= 0) {
    throw new TypeError("Page dimensions must be positive finite numbers");
  }
  return deepFreeze({
    documentId: nonEmptyString(input.documentId, "page.documentId"),
    pageNumber: positiveInteger(input.pageNumber, "pageNumber"), widthPoints, heightPoints,
    rotation: Number.isFinite(input.rotation) ? input.rotation : 0, text: typeof input.text === "string" ? input.text : "",
    words: (input.words ?? []).map(createWordRecord), items: (input.items ?? []).map(createItemRecord),
  });
}

export function createDocumentRecord(input) {
  if (!input || !["indexed", "image-only", "error"].includes(input.status)) throw new TypeError("document.status is invalid");
  const id = nonEmptyString(input.id, "document.id");
  const pages = (input.pages ?? []).map(createPageRecord);
  if (pages.some((page) => page.documentId !== id)) throw new TypeError("Every page must belong to its document");
  return deepFreeze({
    schemaVersion: PDF_LIBRARY_SCHEMA, id, title: nonEmptyString(input.title, "document.title"),
    source: createSourceRecord(input.source), pageCount: positiveInteger(input.pageCount, "pageCount"),
    status: input.status, pages,
  });
}

export function createRenderResult(input) {
  if (!(input?.bytes instanceof Uint8Array)) throw new TypeError("render bytes must be Uint8Array");
  return deepFreeze({
    kind: PDF_RENDER_SCHEMA, mimeType: "image/png", bytes: input.bytes,
    width: positiveInteger(input.width, "render.width"), height: positiveInteger(input.height, "render.height"),
    dpi: positiveInteger(input.dpi, "render.dpi"), source: createCropSource(input.source),
  });
}

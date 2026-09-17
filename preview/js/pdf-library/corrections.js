import { createCropSource, normalizedRect } from "./contract.js?v=1.6.0-preview-labeler-0917-1111";

export const PDF_ITEM_CORRECTION_SCHEMA = "pdf-item-correction-v1";

function requiredText(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${field} must be a non-empty string`);
  return value;
}

function positiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${field} must be a positive integer`);
  return value;
}

export function correctionKey(input) {
  return `${requiredText(input.documentId, "documentId")}:${positiveInteger(input.pageNumber, "pageNumber")}:${positiveInteger(input.itemNumber, "itemNumber")}`;
}

export function createPdfItemCorrection(input) {
  const documentId = requiredText(input?.documentId, "documentId");
  const version = requiredText(input?.version, "version");
  const pageNumber = positiveInteger(input?.pageNumber, "pageNumber");
  const itemNumber = positiveInteger(input?.itemNumber, "itemNumber");
  const rect = normalizedRect(input?.rect);
  const updatedAt = input.updatedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(updatedAt))) throw new TypeError("updatedAt must be an ISO date");
  return Object.freeze({
    schemaVersion: PDF_ITEM_CORRECTION_SCHEMA,
    correctionId: correctionKey({ documentId, pageNumber, itemNumber }),
    documentId,
    version,
    pageNumber,
    itemNumber,
    label: requiredText(input?.label, "label"),
    rect,
    updatedAt,
  });
}

function pageFallback(documentId, pageNumber) {
  return createCropSource({ documentId, pageNumber, rect: [0, 0, 1, 1], fullPageFallback: true });
}

export function applyItemCorrections(index, corrections) {
  if (!index || index.schemaVersion !== "pdf-search-index-v1" || !Array.isArray(index.entries)) {
    throw new TypeError("A PDF search index is required");
  }
  const entries = index.entries.map((entry) => ({ ...entry }));
  for (const raw of corrections ?? []) {
    const correction = createPdfItemCorrection(raw);
    let entry = entries.find((candidate) => candidate.documentId === correction.documentId
      && candidate.pageNumber === correction.pageNumber && candidate.itemNumber === correction.itemNumber);
    if (!entry) {
      const page = entries.find((candidate) => candidate.documentId === correction.documentId
        && candidate.pageNumber === correction.pageNumber);
      if (!page) continue;
      entry = {
        ...page,
        itemId: correction.correctionId,
        itemNumber: correction.itemNumber,
        text: `${correction.label} ${page.text}`.trim(),
        normalized: `${correction.label} ${page.normalized}`.trim(),
      };
      entries.push(entry);
    }
    entry.itemNumber = correction.itemNumber;
    entry.itemLabel = correction.label;
    entry.source = createCropSource({
      documentId: correction.documentId,
      pageNumber: correction.pageNumber,
      rect: correction.rect,
      fullPageFallback: false,
    });
    entry.correction = correction;
  }
  return Object.freeze({ schemaVersion: index.schemaVersion, entries: Object.freeze(entries.map(Object.freeze)) });
}

export function resolveItemOrPageResult(index, input) {
  const documentId = requiredText(input?.documentId, "documentId");
  const pageNumber = positiveInteger(input?.pageNumber, "pageNumber");
  const itemNumber = positiveInteger(input?.itemNumber, "itemNumber");
  const exact = index?.entries?.find((entry) => entry.documentId === documentId
    && entry.pageNumber === pageNumber && entry.itemNumber === itemNumber);
  if (exact) return Object.freeze({ kind: "item", ...exact, source: exact.source });
  const page = index?.entries?.find((entry) => entry.documentId === documentId && entry.pageNumber === pageNumber);
  if (!page) return null;
  return Object.freeze({ ...page, kind: "page", itemId: null, itemNumber, source: pageFallback(documentId, pageNumber) });
}

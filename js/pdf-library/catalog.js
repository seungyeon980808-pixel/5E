import { createDocumentRecord } from "./contract.js";

export function createPdfCatalog(initialDocuments = []) {
  const documents = new Map();

  function upsert(document) {
    const parsed = createDocumentRecord(document);
    documents.set(parsed.id, parsed);
    return parsed;
  }

  for (const document of initialDocuments) upsert(document);

  return Object.freeze({
    upsert,
    remove(documentId) { return documents.delete(documentId); },
    get(documentId) { return documents.get(documentId) ?? null; },
    list() { return Object.freeze([...documents.values()]); },
    clear() { documents.clear(); },
  });
}

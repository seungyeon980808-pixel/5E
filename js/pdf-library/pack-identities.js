import { createDocumentRecord } from "./contract.js?v=1.6.0-preview-labeler-0917-1111";

function namespaced(packId, id) {
  return `${packId}::${id}`;
}

function cropSource(packId, source) {
  return source ? { ...source, documentId: namespaced(packId, source.documentId) } : source;
}

function candidate(packId, value) {
  return {
    ...value,
    id: namespaced(packId, value.id),
    documentId: namespaced(packId, value.documentId),
    itemId: namespaced(packId, value.itemId),
    source: cropSource(packId, value.source),
  };
}

export function materializePackDocument(packId, catalog, document, sourceSha256) {
  const rawId = document.id;
  const parsed = createDocumentRecord({
    ...document,
    id: namespaced(packId, rawId),
    source: { ...document.source, ...(sourceSha256 ? { sha256: sourceSha256 } : {}) },
    pages: (document.pages ?? []).map((page) => ({
      ...page,
      documentId: namespaced(packId, page.documentId),
      items: (page.items ?? []).map((item) => ({
        ...item,
        id: namespaced(packId, item.id),
        documentId: namespaced(packId, item.documentId),
        source: cropSource(packId, item.source),
      })),
    })),
  });
  const metadata = catalog.documentMetadata?.[rawId];
  return Object.freeze({
    ...parsed,
    packId,
    ...(metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { metadata: Object.freeze({ ...metadata }) } : {}),
  });
}

export function materializePackSearchEntry(packId, entry) {
  return Object.freeze({
    ...entry,
    packId,
    documentId: namespaced(packId, entry.documentId),
    itemId: entry.itemId ? namespaced(packId, entry.itemId) : null,
    source: cropSource(packId, entry.source),
    figureCandidates: Object.freeze((entry.figureCandidates ?? []).map((value) => Object.freeze(candidate(packId, value)))),
  });
}

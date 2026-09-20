function entryKey(entry) {
  return `${entry.documentId}\u0000${entry.itemId || ""}\u0000${entry.pageNumber}`;
}

export function mergePreferredCatalogs(remote, installed) {
  const remoteDocuments = remote?.documents || [];
  const installedDocuments = installed?.documents || [];
  const documentsById = new Map(remoteDocuments.map((document) => [document.id, document]));
  for (const document of installedDocuments) documentsById.set(document.id, document);

  const entriesById = new Map();
  for (const entry of [...(remote?.searchIndex?.entries || []), ...(installed?.searchIndex?.entries || [])]) {
    entriesById.set(entryKey(entry), entry);
  }
  return {
    documents: [...documentsById.values()],
    searchIndex: { schemaVersion: "pdf-search-index-v1", entries: [...entriesById.values()] },
    installedDocumentIds: new Set(installedDocuments.map((document) => document.id)),
  };
}

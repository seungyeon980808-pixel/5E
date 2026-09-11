import { createCropSource } from "./contract.js";
export { applyItemCorrections, resolveItemOrPageResult } from "./corrections.js";

function normalizedText(value) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}

function wordCenterIsInside(word, rect) {
  const centerX = word.rect[0] + word.rect[2] / 2;
  const centerY = word.rect[1] + word.rect[3] / 2;
  return centerX >= rect[0] && centerX <= rect[0] + rect[2] && centerY >= rect[1] && centerY <= rect[1] + rect[3];
}

function createEntry(document, page, item) {
  const words = item ? page.words.filter((word) => wordCenterIsInside(word, item.rect)) : page.words;
  const text = words.map((word) => word.text).join(" ") || page.text;
  return Object.freeze({
    documentId: document.id, documentTitle: document.title, pageNumber: page.pageNumber,
    itemId: item?.id ?? null, itemNumber: item?.itemNumber ?? null, text, normalized: normalizedText(text), words,
    source: item?.source ?? createCropSource({ documentId: document.id, pageNumber: page.pageNumber, rect: [0, 0, 1, 1], fullPageFallback: true }),
  });
}

export function buildSearchIndex(documents) {
  const entries = [];
  for (const document of documents) {
    for (const page of document.pages) {
      if (page.items.length === 0) entries.push(createEntry(document, page, null));
      else for (const item of page.items) entries.push(createEntry(document, page, item));
    }
  }
  return Object.freeze({ schemaVersion: "pdf-search-index-v1", entries: Object.freeze(entries) });
}

export function searchIndex(index, options) {
  const terms = normalizedText(options?.query ?? "").split(" ").filter(Boolean);
  if (terms.length === 0) return Object.freeze([]);
  const allowed = options.documentIds ? new Set(options.documentIds) : null;
  const filters = options?.filters ?? {};
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 50;
  const results = [];
  for (const entry of index.entries) {
    if (allowed && !allowed.has(entry.documentId)) continue;
    if (filters.academicYear && String(entry.metadata?.academicYear) !== String(filters.academicYear)) continue;
    if (filters.administration && entry.metadata?.administration !== filters.administration) continue;
    if (filters.subject && entry.metadata?.subject !== filters.subject) continue;
    if (!terms.every((term) => entry.normalized.includes(term))) continue;
    const matchedWords = entry.words.filter((word) => terms.some((term) => normalizedText(word.text).includes(term)));
    const firstOffset = Math.min(...terms.map((term) => entry.normalized.indexOf(term)).filter((offset) => offset >= 0));
    const start = Math.max(0, firstOffset - 48);
    const snippet = entry.text.slice(start, start + 160).trim();
    const occurrences = terms.reduce((sum, term) => sum + entry.normalized.split(term).length - 1, 0);
    results.push(Object.freeze({
      documentId: entry.documentId, documentTitle: entry.documentTitle, pageNumber: entry.pageNumber,
      itemId: entry.itemId, itemNumber: entry.itemNumber, score: occurrences / terms.length,
      snippet, matchRects: Object.freeze(matchedWords.map((word) => word.rect)), source: entry.source,
      ...(entry.metadata ? { metadata: entry.metadata } : {}),
      ...(entry.contentSource ? { contentSource: entry.contentSource } : {}),
      ...(entry.figureCandidates?.length ? { figureCandidates: entry.figureCandidates } : {}),
    }));
  }
  results.sort((left, right) => right.score - left.score || left.pageNumber - right.pageNumber);
  return Object.freeze(results.slice(0, limit));
}

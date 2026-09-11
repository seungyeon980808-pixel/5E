import { buildSearchIndex, searchIndex } from "./search.js";
import { createCropSource } from "./contract.js";

const MAX_PREBUILT_ENTRIES = 100_000;
const MAX_ENTRY_TEXT = 500_000;
const MAX_PREBUILT_TEXT = 64_000_000;

function boundedText(value, field, maximum = MAX_ENTRY_TEXT) {
  if (typeof value !== "string" || value.length > maximum) throw new TypeError(`${field} is invalid`);
  return value;
}

function ownedSource(entry, source, field, pageCounts) {
  let parsed;
  try {
    parsed = createCropSource(source);
  } catch {
    throw new TypeError(`${field} is invalid`);
  }
  if (parsed.documentId !== entry.documentId || parsed.pageNumber !== entry.pageNumber) {
    throw new TypeError(`${field} does not belong to its entry document and page`);
  }
  const pageCount = pageCounts.get(entry.documentId);
  if (!Number.isInteger(pageCount) || parsed.pageNumber > pageCount) {
    throw new TypeError(`${field} is outside its document page bounds`);
  }
  return parsed;
}

function securedEntry(entry, prefix, pageCounts) {
  const source = ownedSource(entry, entry.source, `${prefix}.source`, pageCounts);
  const contentSource = entry.contentSource === undefined
    ? undefined : ownedSource(entry, entry.contentSource, `${prefix}.contentSource`, pageCounts);
  if (!Array.isArray(entry.figureCandidates ?? [])) throw new TypeError(`${prefix}.figureCandidates is invalid`);
  const figureCandidates = (entry.figureCandidates ?? []).map((candidate, index) => {
    const candidatePrefix = `${prefix}.figureCandidates[${index}]`;
    if ((candidate?.documentId !== undefined && candidate.documentId !== entry.documentId)
      || (candidate?.pageNumber !== undefined && candidate.pageNumber !== entry.pageNumber)) {
      throw new TypeError(`${candidatePrefix}.source does not belong to its entry document and page`);
    }
    return Object.freeze({
      ...candidate,
      documentId: entry.documentId,
      pageNumber: entry.pageNumber,
      source: ownedSource(entry, candidate?.source, `${candidatePrefix}.source`, pageCounts),
    });
  });
  return Object.freeze({
    ...entry,
    source,
    ...(contentSource ? { contentSource } : {}),
    ...(figureCandidates.length ? { figureCandidates: Object.freeze(figureCandidates) } : { figureCandidates: Object.freeze([]) }),
  });
}

function descriptorPageCounts(descriptors, prefix) {
  if (!Array.isArray(descriptors) || descriptors.length > MAX_PREBUILT_ENTRIES) {
    throw new TypeError(`${prefix}.documents is invalid`);
  }
  const pageCounts = new Map();
  for (let index = 0; index < descriptors.length; index += 1) {
    const descriptor = descriptors[index];
    const documentId = boundedText(descriptor?.id, `${prefix}.documents[${index}].id`, 512);
    if (!Number.isInteger(descriptor?.pageCount) || descriptor.pageCount < 1) {
      throw new TypeError(`${prefix}.documents[${index}].pageCount is invalid`);
    }
    if (pageCounts.has(documentId)) throw new TypeError(`${prefix}.documents contains a duplicate id`);
    pageCounts.set(documentId, descriptor.pageCount);
  }
  return pageCounts;
}

function prebuiltEntries(input, pageCounts) {
  if (!input || input.schemaVersion !== "pdf-search-index-v1" || !Array.isArray(input.entries) || input.entries.length > MAX_PREBUILT_ENTRIES) {
    throw new TypeError("Prebuilt PDF search index is invalid");
  }
  let textSize = 0;
  return input.entries.map((entry, index) => {
    const prefix = `index.entries[${index}]`;
    const documentId = boundedText(entry?.documentId, `${prefix}.documentId`, 512);
    if (!pageCounts.has(documentId)) throw new TypeError(`${prefix}.documentId is outside its catalog`);
    const text = boundedText(entry.text, `${prefix}.text`);
    const normalized = boundedText(entry.normalized, `${prefix}.normalized`);
    textSize += text.length + normalized.length;
    if (textSize > MAX_PREBUILT_TEXT) throw new TypeError("Prebuilt PDF search index text budget exceeded");
    const compactWords = entry.compactWords ?? [];
    if (!Array.isArray(compactWords) || compactWords.length > 20_000) throw new TypeError(`${prefix}.compactWords is invalid`);
    const words = entry.words ?? compactWords.map((word, wordIndex) => {
      if (!Array.isArray(word) || word.length !== 5 || typeof word[0] !== "string" || word[0].length > 1000 || !word.slice(1).every(Number.isFinite)) {
        throw new TypeError(`${prefix}.compactWords[${wordIndex}] is invalid`);
      }
      const rect = word.slice(1);
      if (rect[0] < 0 || rect[1] < 0 || rect[2] <= 0 || rect[3] <= 0 || rect[0] + rect[2] > 1.001 || rect[1] + rect[3] > 1.001) {
        throw new TypeError(`${prefix}.compactWords[${wordIndex}] is outside the page`);
      }
      return { text: word[0], rect };
    });
    if (!Array.isArray(words) || words.length > 20_000) throw new TypeError(`${prefix}.words is invalid`);
    for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
      const word = words[wordIndex];
      if (typeof word?.text !== "string" || word.text.length > 1000 || !Array.isArray(word.rect) || word.rect.length !== 4 || !word.rect.every(Number.isFinite)) {
        throw new TypeError(`${prefix}.words[${wordIndex}] is invalid`);
      }
    }
    const { compactWords: _compactWords, ...rest } = entry;
    return securedEntry({ ...rest, documentId, text, normalized, words }, prefix, pageCounts);
  });
}

export function createSearchWorkerController() {
  const documents = new Map();
  const pageCounts = new Map();
  let index = buildSearchIndex([]);
  return Object.freeze({
    handle(message) {
      switch (message.type) {
        case "replace": {
          documents.clear();
          pageCounts.clear();
          for (const document of message.documents ?? []) {
            documents.set(document.id, document);
            if (!Number.isInteger(document.pageCount) || document.pageCount < 1) throw new TypeError("document.pageCount is invalid");
            pageCounts.set(document.id, document.pageCount);
          }
          const entries = [...buildSearchIndex(documents.values()).entries]
            .map((entry, index) => securedEntry(entry, `documents.entries[${index}]`, pageCounts));
          for (let sourceIndex = 0; sourceIndex < (message.prebuilt ?? []).length; sourceIndex += 1) {
            const source = message.prebuilt[sourceIndex];
            const sourcePageCounts = descriptorPageCounts(source.documents, `prebuilt[${sourceIndex}]`);
            for (const [documentId, pageCount] of sourcePageCounts) {
              if (pageCounts.has(documentId) && pageCounts.get(documentId) !== pageCount) {
                throw new TypeError(`prebuilt[${sourceIndex}].documents conflicts with its catalog`);
              }
              pageCounts.set(documentId, pageCount);
            }
            entries.push(...prebuiltEntries(source.index, sourcePageCounts));
          }
          index = Object.freeze({ schemaVersion: "pdf-search-index-v1", entries: Object.freeze(entries) });
          return { count: documents.size, entries: entries.length };
        }
        case "upsert": documents.set(message.document.id, message.document); break;
        case "remove": documents.delete(message.documentId); break;
        case "search": return Object.freeze(searchIndex(index, message.options)
          .map((entry, entryIndex) => securedEntry(entry, `results[${entryIndex}]`, pageCounts)));
        default: throw new TypeError(`Unsupported search worker message: ${message.type}`);
      }
      pageCounts.clear();
      for (const document of documents.values()) {
        if (!Number.isInteger(document.pageCount) || document.pageCount < 1) throw new TypeError("document.pageCount is invalid");
        pageCounts.set(document.id, document.pageCount);
      }
      index = Object.freeze({
        schemaVersion: "pdf-search-index-v1",
        entries: Object.freeze(buildSearchIndex(documents.values()).entries
          .map((entry, index) => securedEntry(entry, `documents.entries[${index}]`, pageCounts))),
      });
      return { count: documents.size };
    },
  });
}

if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  const controller = createSearchWorkerController();
  self.addEventListener("message", (event) => {
    const id = event.data?.id;
    try {
      self.postMessage({ id, ok: true, result: controller.handle(event.data) });
    } catch (error) {
      self.postMessage({ id, ok: false, error: { code: "PDF_SEARCH_ERROR", message: error instanceof Error ? error.message : String(error) } });
    }
  });
}

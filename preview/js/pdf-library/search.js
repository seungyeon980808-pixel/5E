import { createCropSource } from "./contract.js?v=1.6.0-preview-labeler-0917-1111";
import { deriveExamMetadata } from "../library/exam-code.js?v=1.6.0-preview-labeler-0917-1111";
export { applyItemCorrections, resolveItemOrPageResult } from "./corrections.js?v=1.6.0-preview-labeler-0917-1111";

function normalizedText(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}

const BASE_HIGHLIGHT_COLORS = Object.freeze(["#ffcf4a", "#5fd3ff", "#ff7ab8", "#83e377", "#b59cff", "#ff9866", "#63e6be", "#f783ff"]);

function stableTermId(term) {
  let hash = 2166136261;
  for (const character of term) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return `term-${(hash >>> 0).toString(36)}`;
}

export function queryHighlightTerms(query) {
  const labels = new Map();
  for (const raw of normalizedText(query).match(/[\p{L}\p{N}]+/gu) ?? []) {
    const term = raw.replace(/\s+/gu, "");
    if (term && !labels.has(term)) labels.set(term, raw);
  }
  const ordered = [...labels.keys()].sort((left, right) => left.localeCompare(right, "ko"));
  const colors = new Map(ordered.map((term, index) => [term, BASE_HIGHLIGHT_COLORS[index] ?? `hsl(${Math.round((index * 137.508) % 360)}deg ${68 + index % 3 * 4}% ${48 + index % 4 * 3}%)`]));
  return Object.freeze([...labels].map(([term, label]) => Object.freeze({ termId: stableTermId(term), term, label, color: colors.get(term) })));
}

export function mapQueryHighlights(entry, queryOrTerms) {
  const terms = Array.isArray(queryOrTerms) ? queryOrTerms : queryHighlightTerms(queryOrTerms);
  const words = (entry.words ?? []).flatMap((word) => {
    const text = normalizedText(word.text).replace(/\s+/gu, "");
    return text ? [{ text, characters: [...text], rect: word.rect }] : [];
  });
  const runs = [];
  for (const word of words) {
    const previous = runs.at(-1)?.words.at(-1);
    const horizontalGap = previous ? word.rect[0] - (previous.rect[0] + previous.rect[2]) : Infinity;
    const maximumAdjacentGap = previous ? Math.max(
      previous.rect[2] / previous.characters.length,
      word.rect[2] / word.characters.length,
    ) * 2.5 : 0;
    const sameLine = previous
      && Math.abs((previous.rect[1] + previous.rect[3] / 2) - (word.rect[1] + word.rect[3] / 2)) <= Math.max(previous.rect[3], word.rect[3]) * 0.65
      && horizontalGap >= -Math.max(previous.rect[2], word.rect[2]) * 0.1
      && horizontalGap <= maximumAdjacentGap;
    if (!sameLine) runs.push({ words: [], stream: "", offsets: [] });
    const run = runs.at(-1);
    const start = [...run.stream].length;
    run.words.push(word);
    run.stream += word.text;
    run.offsets.push({ word, start, end: start + word.characters.length });
  }
  const highlights = [];
  const misses = [];
  for (const term of terms) {
    let found = false;
    const termLength = [...term.term].length;
    for (const run of runs) {
      let start = run.stream.indexOf(term.term);
      while (start >= 0) {
        found = true;
        const end = start + termLength;
        for (const part of run.offsets.filter((offset) => offset.end > start && offset.start < end)) {
          const localStart = Math.max(0, start - part.start);
          const localEnd = Math.min(part.word.characters.length, end - part.start);
          const [x, y, width, height] = part.word.rect;
          const rect = [
            x + width * localStart / part.word.characters.length,
            y,
            width * (localEnd - localStart) / part.word.characters.length,
            height,
          ];
          highlights.push(Object.freeze({
            ...term, coordinateSpace: "page-normalized",
            documentId: entry.documentId, pageNumber: entry.pageNumber,
            cropId: entry.itemId ?? `${entry.documentId}:p${entry.pageNumber}`, rect: Object.freeze(rect),
          }));
        }
        start = run.stream.indexOf(term.term, start + 1);
      }
    }
    if (!found) misses.push(term.termId);
  }
  return Object.freeze({ terms, highlights: Object.freeze(highlights), misses: Object.freeze(misses) });
}

function wordCenterIsInside(word, rect) {
  const centerX = word.rect[0] + word.rect[2] / 2;
  const centerY = word.rect[1] + word.rect[3] / 2;
  return centerX >= rect[0] && centerX <= rect[0] + rect[2] && centerY >= rect[1] && centerY <= rect[1] + rect[3];
}

function createEntry(document, page, item) {
  const words = item ? page.words.filter((word) => wordCenterIsInside(word, item.rect)) : page.words;
  const text = words.map((word) => word.text).join(" ") || page.text;
  const metadata = deriveExamMetadata({ metadata: document.metadata, source: document.source });
  return Object.freeze({
    documentId: document.id, documentTitle: document.title, pageNumber: page.pageNumber,
    itemId: item?.id ?? null, itemNumber: item?.itemNumber ?? null, text, normalized: normalizedText(text), words,
    source: item?.source ?? createCropSource({ documentId: document.id, pageNumber: page.pageNumber, rect: [0, 0, 1, 1], fullPageFallback: true }),
    ...(metadata ? { metadata } : {}),
    ...(item?.contentSource ? { contentSource: item.contentSource } : {}),
    ...(item?.figureCandidates?.length ? { figureCandidates: Object.freeze([...item.figureCandidates]) } : {}),
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
  const terms = queryHighlightTerms(options?.query ?? "");
  if (terms.length === 0) return Object.freeze([]);
  const allowed = options.documentIds ? new Set(options.documentIds) : null;
  const filters = options?.filters ?? {};
  const limit = options?.limit === null ? Number.POSITIVE_INFINITY
    : Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 50;
  const candidates = [];
  for (const entry of index.entries) {
    if (allowed && !allowed.has(entry.documentId)) continue;
    if (filters.academicYear && String(entry.metadata?.academicYear) !== String(filters.academicYear)) continue;
    if (filters.administration && entry.metadata?.administration !== filters.administration) continue;
    if (filters.subject && entry.metadata?.subject !== filters.subject) continue;
    const searchable = normalizedText(entry.normalized ?? entry.text).replace(/\s+/gu, "");
    if (!terms.every(({ term }) => searchable.includes(term))) continue;
    const firstOffset = Math.min(...terms.map(({ term }) => searchable.indexOf(term)).filter((offset) => offset >= 0));
    const start = Math.max(0, firstOffset - 48);
    const occurrences = terms.reduce((sum, { term }) => sum + searchable.split(term).length - 1, 0);
    candidates.push({ entry, score: occurrences / terms.length, snippet: entry.text.slice(start, start + 160).trim() });
  }
  candidates.sort((left, right) => right.score - left.score || left.entry.pageNumber - right.entry.pageNumber);
  const results = candidates.slice(0, limit).map(({ entry, score, snippet }) => {
    const mapped = mapQueryHighlights(entry, terms);
    const legacyHighlights = mapped.highlights.length || !entry.matchRects?.length ? [] : entry.matchRects.map((rect) => Object.freeze({
      ...terms[0], coordinateSpace: "page-normalized", legacy: true,
      documentId: entry.documentId, pageNumber: entry.pageNumber,
      cropId: entry.itemId ?? `${entry.documentId}:p${entry.pageNumber}`, rect: Object.freeze([...rect]),
    }));
    const highlights = mapped.highlights.length ? mapped.highlights : Object.freeze(legacyHighlights);
    const misses = legacyHighlights.length ? Object.freeze(terms.slice(1).map((term) => term.termId)) : mapped.misses;
    return Object.freeze({
      documentId: entry.documentId, documentTitle: entry.documentTitle, pageNumber: entry.pageNumber,
      itemId: entry.itemId, itemNumber: entry.itemNumber, score,
      snippet, terms, highlights, misses,
      matchRects: Object.freeze(highlights.map((highlight) => highlight.rect)), source: entry.source,
      ...(entry.metadata ? { metadata: entry.metadata } : {}),
      ...(entry.contentSource ? { contentSource: entry.contentSource } : {}),
      ...(entry.figureCandidates?.length ? { figureCandidates: entry.figureCandidates } : {}),
    });
  });
  return Object.freeze(results);
}

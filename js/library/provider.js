import { deriveExamMetadata, examMetadataMatches, parseCompactExamCode } from "./exam-code.js";
import { createHierarchicalSourceNodes, normalizeSourceCategory } from "./source-tree.js";
import { createCropSource } from "../pdf-library/contract.js";

const RESULT_KINDS = new Set(["image", "crop", "page"]);

function normalizedText(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}

function tokens(value) {
  return normalizedText(value).split(/[#\s]+/u).filter(Boolean);
}

function stableId(namespace, ...segments) {
  return [namespace, ...segments.map((value) => {
    const text = String(value ?? "");
    return `${text.length}:${text}`;
  })].join("|");
}

function matchesText(haystack, queryTokens) {
  const normalized = normalizedText(haystack);
  const withoutSpaces = normalized.replace(/\s+/gu, "");
  return queryTokens.every((token) => normalized.includes(token) || withoutSpaces.includes(token));
}

function boundedLimit(value) {
  return Number.isInteger(value) && value > 0 ? Math.min(value, 500) : 100;
}

function freezeResult(value) {
  return Object.freeze({
    ...value,
    provenance: Object.freeze(value.provenance),
    metadata: Object.freeze(value.metadata ?? {}),
    preview: Object.freeze(value.preview ?? {}),
    ...(value.matchContext ? { matchContext: Object.freeze(value.matchContext) } : {}),
    ...(value.variants ? { variants: Object.freeze({
      ...value.variants,
      full: Object.freeze(value.variants.full),
      content: Object.freeze(value.variants.content),
      figures: Object.freeze(value.variants.figures.map(Object.freeze)),
    }) } : {}),
  });
}

function sourceNode(id, label, resultKinds, count, options = {}) {
  return Object.freeze({ id, label, resultKinds: Object.freeze(resultKinds), count, ...options });
}

function pathSegments(value) {
  return String(value ?? "").split(/[\\/]/u).map((part) => part.trim()).filter(Boolean);
}

function imageResult(provider, item, sourceId, sourceLabel, fields) {
  const fileName = item.fileName ?? item.file ?? item.name ?? item.id;
  return freezeResult({
    id: stableId("image", provider, sourceId, item.id ?? fileName),
    kind: "image",
    title: item.title ?? item.name ?? fileName,
    subtitle: fields.subtitle ?? sourceLabel,
    sourceId,
    sourceLabel,
    searchText: fields.searchText,
    metadata: fields.metadata,
    preview: { url: fields.previewUrl ?? item.url ?? item.src ?? null, mimeType: item.mimeType ?? null },
    provenance: {
      provider,
      itemId: item.id ?? null,
      fileName,
      locator: item.relativePath ?? item.path ?? fields.previewUrl ?? item.url ?? item.src ?? null,
      sourceUrl: item.source ?? null,
      license: item.license ?? null,
    },
  });
}

function externalExamImageUrl(input, item) {
  if (typeof item.url === "string" && item.url) return item.url;
  if (typeof item.src === "string" && item.src) return item.src;
  if (typeof input.examBaseUrl !== "string" || !input.examBaseUrl.trim() || !item.file) return null;
  const baseUrl = `${input.examBaseUrl.trim().replace(/\/+$/u, "")}/`;
  const relative = `images/${encodeURIComponent(item.file)}`;
  try {
    return new URL(relative, baseUrl).href;
  } catch {
    return `${baseUrl}${relative}`;
  }
}

function collectImageResults(input) {
  const results = [];
  const sources = [];
  const items = new Map();

  const partsBySource = new Map();
  for (const item of input.partsManifest?.items ?? []) {
    const subject = item.subject || "all";
    const sourceId = stableId("source", "parts", subject);
    if (!partsBySource.has(sourceId)) partsBySource.set(sourceId, []);
    partsBySource.get(sourceId).push(item);
    const result = imageResult("parts", item, sourceId, item.subjectLabel || "과학 부품", {
      subtitle: [item.subjectLabel, item.part].filter(Boolean).join(" · "),
      searchText: [item.id, item.name, ...(item.keywords ?? []), ...(item.sourceTags ?? []), item.part, item.subjectLabel].join(" "),
      metadata: { subject: item.subject ?? null, subjectLabel: item.subjectLabel ?? null, part: item.part ?? null, curated: true },
      previewUrl: `assets/parts-library/svg/${encodeURIComponent(item.file)}`,
    });
    results.push(result); items.set(result.id, item);
  }
  for (const [id, values] of partsBySource) sources.push(sourceNode(id, values[0].subjectLabel || "과학 부품", ["image"], values.length, {
    origin: "provided", category: "other", pathSegments: ["과학 부품"],
  }));

  const examsBySource = new Map();
  for (const item of input.examManifest?.items ?? []) {
    const subject = item.subject || "all";
    const sourceId = stableId("source", "exam-images", subject);
    if (!examsBySource.has(sourceId)) examsBySource.set(sourceId, []);
    examsBySource.get(sourceId).push(item);
    const previewUrl = externalExamImageUrl(input, item);
    const result = imageResult("exam-image", item, sourceId, item.subjectLabel || "기출 이미지", {
      subtitle: [item.subjectLabel, item.exam, item.no ? `${item.no}번` : null].filter(Boolean).join(" · "),
      searchText: [item.id, item.title, ...(item.tags ?? []), ...(item.parts ?? [])].join(" "),
      metadata: {
        subject: item.subject ?? null, academicYear: item.year ?? null,
        administration: String(item.month ?? "").padStart(2, "0"), itemNumber: item.no ?? null, curated: true,
      },
      previewUrl,
    });
    results.push(result); items.set(result.id, item);
  }
  for (const [id, values] of examsBySource) sources.push(sourceNode(id, values[0].subjectLabel || "기출 이미지", ["image"], values.length, {
    origin: "provided", category: "past-exams", pathSegments: ["이미지"],
  }));

  const importsBySource = new Map();
  for (const item of input.importedImages ?? []) {
    const externalId = item.sourceId || "imports";
    const category = normalizeSourceCategory(item.category);
    const folders = pathSegments(item.relativePath ?? item.path).slice(0, -1);
    const categoryLabel = category === "textbooks" ? "교과서" : category === "past-exams" ? "기출문제" : "기타";
    if (folders[0] === categoryLabel) folders.shift();
    const sourceId = stableId("source", "import", externalId, ...folders);
    if (!importsBySource.has(sourceId)) importsBySource.set(sourceId, []);
    importsBySource.get(sourceId).push(item);
    const sourceLabel = item.sourceLabel || "가져온 이미지";
    const result = imageResult("imported-image", item, sourceId, sourceLabel, {
      subtitle: `${sourceLabel} · 파일명으로만 검색`,
      searchText: item.fileName ?? item.file ?? item.name ?? "",
      metadata: { imported: true, fileNameSearchOnly: true },
      previewUrl: item.url ?? item.src ?? null,
    });
    results.push(result); items.set(result.id, item);
  }
  for (const [id, values] of importsBySource) {
    const first = values[0];
    const category = normalizeSourceCategory(first.category);
    const folders = pathSegments(first.relativePath ?? first.path).slice(0, -1);
    const categoryLabel = category === "textbooks" ? "교과서" : category === "past-exams" ? "기출문제" : "기타";
    if (folders[0] === categoryLabel) folders.shift();
    sources.push(sourceNode(id, first.sourceLabel || "가져온 이미지", ["image"], values.length, {
      origin: "local", category, pathSegments: folders,
    }));
  }
  return { results, sources, items };
}

function pdfSourceId(document) {
  return stableId("source", "pdf", document.id, document.source?.kind, document.source?.locator);
}

function pdfProvenance(document, source) {
  return {
    provider: "pdf", documentId: document.id, pageNumber: source.pageNumber,
    rect: Object.freeze([...(source.rect ?? [0, 0, 1, 1])]), fullPageFallback: source.fullPageFallback === true,
    locator: document.source?.locator ?? null, displayName: document.source?.displayName ?? document.title,
    sha256: document.source?.sha256 ?? null, sourceKind: document.source?.kind ?? null,
  };
}

function entriesForDocument(index, document) {
  const indexed = (index?.entries ?? []).filter((entry) => entry.documentId === document.id).map((entry) => ({
    ...entry,
    words: entry.words?.length ? entry.words : (entry.compactWords ?? []).map((word) => ({ text: word[0], rect: word.slice(1) })),
  }));
  if (indexed.length) return indexed;
  return (document.pages ?? []).flatMap((page) => (page.items ?? []).map((item) => {
    const words = (page.words ?? []).filter((word) => {
      const centerX = word.rect[0] + word.rect[2] / 2;
      const centerY = word.rect[1] + word.rect[3] / 2;
      return centerX >= item.rect[0] && centerX <= item.rect[0] + item.rect[2]
        && centerY >= item.rect[1] && centerY <= item.rect[1] + item.rect[3];
    });
    const text = words.map((word) => word.text).join(" ");
    return {
      documentId: document.id, documentTitle: document.title, pageNumber: page.pageNumber,
      itemId: item.id, itemNumber: item.itemNumber, text, normalized: normalizedText(text), words,
      source: item.source, metadata: document.metadata,
    };
  }));
}

function pdfPageResult(document, pageNumber, pageText, metadata, itemNumbers) {
  const sourceId = pdfSourceId(document);
  const source = { documentId: document.id, pageNumber, rect: [0, 0, 1, 1], fullPageFallback: true };
  const code = metadata?.documentCode ?? null;
  return freezeResult({
    id: stableId("page", sourceId, pageNumber), kind: "page",
    title: `${document.title} · ${pageNumber}쪽`,
    subtitle: [code ? `${code}.pdf` : document.source?.displayName, `${pageNumber}쪽`].filter(Boolean).join(" · "),
    sourceId, sourceLabel: document.source?.displayName ?? document.title,
    searchText: [document.title, document.source?.displayName, code, pageText].join(" "),
    metadata: { ...metadata, pageNumber, itemNumbers: Object.freeze([...itemNumbers]) },
    preview: { source }, provenance: pdfProvenance(document, source),
  });
}

function pdfQuestionResult(document, entry, metadata) {
  const pageNumber = entry.pageNumber;
  const itemNumber = entry.itemNumber ?? null;
  const source = entry.source;
  const code = metadata?.documentCode ?? null;
  const itemCode = code && itemNumber ? `${code}${String(itemNumber).padStart(2, "0")}` : null;
  const figures = (entry.figureCandidates ?? []).map((candidate, index) => ({
    id: candidate.id ?? `${entry.itemId}:figure:${index + 1}`,
    label: `이미지 ${index + 1}`,
    source: candidate.source,
  }));
  const contentSource = entry.contentSource ?? source;
  const matchText = String(entry.text ?? entry.snippet ?? "");
  const matchRects = Object.freeze((entry.matchRects ?? []).map((rect) => Object.freeze([...rect])));
  return freezeResult({
    id: stableId("crop", pdfSourceId(document), pageNumber, "question", entry.itemId ?? itemNumber),
    kind: "crop", cropType: "question",
    title: `${itemCode || document.title} 문항`,
    subtitle: [document.source?.displayName, `${pageNumber}쪽`, itemNumber ? `${itemNumber}번` : null].filter(Boolean).join(" · "),
    sourceId: pdfSourceId(document), sourceLabel: document.source?.displayName ?? document.title,
    parentId: stableId("page", pdfSourceId(document), pageNumber),
    searchText: [document.title, document.source?.displayName, code, itemCode, entry.text].join(" "),
    metadata: { ...metadata, itemNumber, itemCode, pageNumber },
    preview: { source }, provenance: pdfProvenance(document, source),
    variants: {
      full: { label: "전체", source },
      content: { label: "내용", source: contentSource },
      figures,
    },
    matchContext: { snippet: String(entry.snippet ?? matchText.slice(0, 240)).trim(), matchRects },
    matchText,
    searchWords: Object.freeze([...(entry.words ?? [])]),
  });
}

function documentOwnsPage(document, pageNumber) {
  if (!document) return false;
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return false;
  if (Number.isInteger(document.pageCount) && document.pageCount > 0) return pageNumber <= document.pageCount;
  const declaredPages = (document.pages ?? []).map((page) => page.pageNumber).filter(Number.isInteger);
  return declaredPages.length === 0 || declaredPages.includes(pageNumber);
}

function ownedCropSource(document, pageNumber, source) {
  if (!documentOwnsPage(document, pageNumber) || source?.documentId !== document.id || source?.pageNumber !== pageNumber) return null;
  try {
    return createCropSource(source);
  } catch {
    return null;
  }
}

function securedPdfEntry(document, entry) {
  const source = ownedCropSource(document, entry.pageNumber, entry.source);
  if (!source) return null;
  const contentSource = ownedCropSource(document, entry.pageNumber, entry.contentSource) ?? source;
  const figureCandidates = (entry.figureCandidates ?? []).flatMap((candidate) => {
    if ((candidate.documentId !== undefined && candidate.documentId !== document.id)
      || (candidate.pageNumber !== undefined && candidate.pageNumber !== entry.pageNumber)) return [];
    const candidateSource = ownedCropSource(document, entry.pageNumber, candidate.source);
    return candidateSource ? [{ ...candidate, documentId: document.id, pageNumber: entry.pageNumber, source: candidateSource }] : [];
  });
  return { ...entry, documentId: document.id, source, contentSource, figureCandidates };
}

function pdfResults(documents, index) {
  const results = [];
  const sources = [];
  for (const document of documents) {
    const entries = entriesForDocument(index, document).flatMap((entry) => {
      const secured = securedPdfEntry(document, entry);
      return secured ? [secured] : [];
    });
    const metadata = deriveExamMetadata({
      metadata: document.metadata ?? entries.find((entry) => entry.metadata)?.metadata,
      source: document.source,
    });
    const pages = new Map();
    const itemNumbersByPage = new Map();
    for (let pageNumber = 1; pageNumber <= (document.pageCount ?? 0); pageNumber += 1) pages.set(pageNumber, "");
    for (const page of document.pages ?? []) {
      pages.set(page.pageNumber, page.text ?? "");
      itemNumbersByPage.set(page.pageNumber, new Set((page.items ?? []).map((item) => item.itemNumber).filter(Number.isInteger)));
    }
    for (const entry of entries) {
      if (!pages.has(entry.pageNumber)) pages.set(entry.pageNumber, entry.text ?? "");
      else if (entry.text && !pages.get(entry.pageNumber).includes(entry.text)) {
        pages.set(entry.pageNumber, `${pages.get(entry.pageNumber)} ${entry.text}`.trim());
      }
      if (!itemNumbersByPage.has(entry.pageNumber)) itemNumbersByPage.set(entry.pageNumber, new Set());
      if (Number.isInteger(entry.itemNumber)) itemNumbersByPage.get(entry.pageNumber).add(entry.itemNumber);
    }
    for (const [pageNumber, text] of pages) {
      const itemNumbers = itemNumbersByPage.get(pageNumber) ?? new Set();
      const pageResult = pdfPageResult(document, pageNumber, text, metadata, itemNumbers);
      results.push(freezeResult({ ...pageResult, metadata: { ...pageResult.metadata, boundaryUncertain: itemNumbers.size === 0 } }));
    }
    const questions = new Map();
    for (const entry of entries) {
      if (!entry.itemId && !Number.isInteger(entry.itemNumber)) continue;
      if (entry.source.fullPageFallback === true) continue;
      const key = entry.itemId ?? `${entry.pageNumber}:${entry.itemNumber}`;
      const previous = questions.get(key);
      questions.set(key, previous ? {
        ...previous,
        text: `${previous.text ?? ""} ${entry.text ?? ""}`.trim(),
        words: [...(previous.words ?? []), ...(entry.words ?? [])],
        figureCandidates: [...(previous.figureCandidates ?? []), ...(entry.figureCandidates ?? [])],
      } : entry);
    }
    for (const entry of questions.values()) results.push(pdfQuestionResult(document, entry, metadata));
    const origin = document.source?.kind === "pack" ? "provided" : "local";
    const relativeFolders = pathSegments(document.source?.relativePath).slice(0, -1);
    const category = normalizeSourceCategory(document.metadata?.category ?? (metadata ? "past-exams" : relativeFolders[0]));
    const administration = metadata?.administration === "06" ? "6월 모의평가"
      : metadata?.administration === "09" ? "9월 모의평가" : metadata?.administration === "11" ? "대학수학능력시험" : null;
    const categoryLabel = category === "textbooks" ? "교과서" : category === "past-exams" ? "기출문제" : "기타";
    if (relativeFolders[0] === categoryLabel) relativeFolders.shift();
    const examPath = metadata ? [`${metadata.academicYear}학년도`, administration].filter(Boolean)
      : [document.source?.kind === "file" ? "연결 폴더" : null, ...relativeFolders].filter(Boolean);
    sources.push(sourceNode(pdfSourceId(document), document.source?.displayName ?? document.title, ["crop", "page"], pages.size, {
      origin, category, pathSegments: examPath,
    }));
  }
  return { results, sources };
}

function resultMatches(result, query, compact) {
  if (!compact) return matchesText(result.searchText, tokens(query));
  const actual = result.metadata;
  if (!examMetadataMatches(actual, compact)) return false;
  if (compact.itemNumber === null) return true;
  if (result.kind === "image") return actual.itemNumber === compact.itemNumber;
  if (result.kind === "crop") return actual.itemNumber === compact.itemNumber;
  return actual.itemNumbers?.includes(compact.itemNumber) === true;
}

function dedupeResults(results) {
  return [...new Map(results.map((result) => [result.id, result])).values()];
}

function normalizedKinds(kinds) {
  if (!Array.isArray(kinds)) return null;
  const aliases = { question: "crop", pdf: "page" };
  return new Set(kinds.map((kind) => aliases[kind] ?? kind).filter((kind) => RESULT_KINDS.has(kind)));
}

function contextualized(result, query) {
  if (result.kind !== "crop" || result.cropType !== "question") return result;
  const terms = tokens(query);
  const text = String(result.matchText ?? result.matchContext?.snippet ?? "");
  const normalized = normalizedText(text);
  const offsets = terms.map((term) => normalized.indexOf(term)).filter((offset) => offset >= 0);
  const start = offsets.length ? Math.max(0, Math.min(...offsets) - 48) : 0;
  const snippet = text.slice(start, start + 180).trim();
  const derivedMatchRects = (result.searchWords ?? []).filter((word) =>
    terms.some((term) => normalizedText(word.text).includes(term))).map((word) => Object.freeze([...word.rect]));
  const matchRects = result.searchWords?.length ? derivedMatchRects : (result.matchContext?.matchRects ?? []);
  return freezeResult({ ...result, matchContext: { snippet, matchRects: Object.freeze(matchRects) } });
}

export function createUnifiedLibraryProvider(input = {}) {
  const images = collectImageResults(input);
  let documents = [...(input.pdfDocuments ?? [])];
  let searchIndex = input.pdfSearchIndex ?? { schemaVersion: "pdf-search-index-v1", entries: [] };
  let pdf = pdfResults(documents, searchIndex);
  const materializers = input.materializers ?? {};

  function allResults() {
    return dedupeResults([...images.results, ...pdf.results]);
  }

  function search(options = {}) {
    const compact = parseCompactExamCode(options.query);
    const allowedSources = Array.isArray(options.sourceIds) ? new Set(options.sourceIds) : null;
    const allowedKinds = normalizedKinds(options.kinds);
    let found = allResults().filter((result) =>
      (!allowedSources || allowedSources.has(result.sourceId))
      && (!allowedKinds || allowedKinds.has(result.kind))
      && (allowedKinds || result.kind !== "page" || result.metadata.boundaryUncertain === true)
      && resultMatches(result, options.query ?? "", compact));
    if (!allowedKinds && compact?.itemNumber !== null && found.some((result) => result.kind === "crop")) {
      found = found.filter((result) => result.kind === "crop");
    }
    found.sort((left, right) => {
      const exactLeft = compact && left.metadata.itemCode === compact.itemCode ? 1 : 0;
      const exactRight = compact && right.metadata.itemCode === compact.itemCode ? 1 : 0;
      return exactRight - exactLeft || left.title.localeCompare(right.title, "ko");
    });
    return Object.freeze(found.slice(0, boundedLimit(options.limit)).map((result) => contextualized(result, options.query ?? "")));
  }

  function normalizeWorkerEntries(entries) {
    const byDocument = new Map(documents.map((document) => [document.id, document]));
    return entries.flatMap((entry) => {
      const document = byDocument.get(entry.documentId);
      if (!document) return [];
      const metadata = deriveExamMetadata({ metadata: entry.metadata ?? document.metadata, source: document.source });
      if ((entry.itemId || Number.isInteger(entry.itemNumber)) && entry.source?.fullPageFallback !== true) {
        const secured = securedPdfEntry(document, entry);
        return secured ? [pdfQuestionResult(document, secured, metadata)] : [];
      }
      const secured = securedPdfEntry(document, entry);
      if (!secured) return [];
      const page = pdfPageResult(document, entry.pageNumber, entry.text ?? "", metadata, new Set());
      return [freezeResult({ ...page, metadata: { ...page.metadata, boundaryUncertain: true } })];
    });
  }

  return Object.freeze({
    search,
    async searchAsync(options = {}) {
      const local = search(options);
      const allowedSources = Array.isArray(options.sourceIds) ? new Set(options.sourceIds) : null;
      const allowedKinds = normalizedKinds(options.kinds);
      if (typeof input.searchPdf !== "function" || parseCompactExamCode(options.query)
        || (allowedKinds && !allowedKinds.has("crop") && !allowedKinds.has("page"))) return local;
      const workerEntries = await input.searchPdf({
        query: options.query ?? "",
        documentIds: documents.filter((document) => !allowedSources || allowedSources.has(pdfSourceId(document))).map((document) => document.id),
        filters: options.filters ?? {}, limit: boundedLimit(options.limit),
      });
      const merged = dedupeResults([...local, ...normalizeWorkerEntries(workerEntries ?? [])]).filter((result) =>
        (!allowedSources || allowedSources.has(result.sourceId))
        && (!allowedKinds || allowedKinds.has(result.kind))
        && (allowedKinds || result.kind !== "page" || result.metadata.boundaryUncertain === true));
      return Object.freeze(merged.slice(0, boundedLimit(options.limit)).map((result) => contextualized(result, options.query ?? "")));
    },
    replacePdfCatalog(next = {}) {
      documents = [...(next.documents ?? [])];
      searchIndex = next.searchIndex ?? { schemaVersion: "pdf-search-index-v1", entries: [] };
      pdf = pdfResults(documents, searchIndex);
    },
    getSources() {
      return createHierarchicalSourceNodes([...images.sources, ...pdf.sources]);
    },
    async materialize(result, options = {}) {
      if (!result || !RESULT_KINDS.has(result.kind)) throw new TypeError("Unknown library result");
      if (result.provenance.provider === "pdf") {
        if (typeof materializers.pdf !== "function") throw new TypeError("PDF materializer is unavailable");
        const canonical = allResults().find((candidate) => candidate.id === result.id && candidate.provenance.provider === "pdf");
        if (!canonical) throw new TypeError("PDF result provenance is unavailable");
        const representation = options.representation ?? "full";
        let source = result.variants?.[representation]?.source ?? result.provenance;
        let canonicalSource = canonical.variants?.[representation]?.source ?? canonical.provenance;
        if (representation.startsWith("figure:")) {
          const index = Number(representation.slice("figure:".length));
          source = result.variants?.figures?.[index]?.source ?? source;
          canonicalSource = canonical.variants?.figures?.[index]?.source ?? canonicalSource;
        }
        const securedSource = ownedCropSource(
          documents.find((document) => document.id === canonical.provenance.documentId),
          canonical.provenance.pageNumber,
          source,
        );
        const canonicalRect = canonicalSource?.rect ?? [];
        if (!securedSource || canonicalSource?.documentId !== securedSource.documentId
          || canonicalSource?.pageNumber !== securedSource.pageNumber
          || (canonicalSource?.fullPageFallback === true) !== securedSource.fullPageFallback
          || canonicalRect.length !== securedSource.rect.length
          || canonicalRect.some((value, index) => value !== securedSource.rect[index])) {
          throw new TypeError("PDF materialization source does not match result provenance");
        }
        return materializers.pdf({ result, source: securedSource, options });
      }
      const item = images.items.get(result.id);
      const materializer = materializers[result.provenance.provider === "parts" ? "part" : result.provenance.provider === "exam-image" ? "examImage" : "importedImage"];
      if (typeof materializer === "function") return materializer({ result, item, options });
      const bytes = item?.bytes instanceof Uint8Array ? item.bytes : item?.data instanceof Uint8Array ? item.data : null;
      if (bytes) return { bytes: bytes.slice(), mimeType: item.mimeType ?? null, result };
      return { result, item, url: result.preview.url };
    },
  });
}

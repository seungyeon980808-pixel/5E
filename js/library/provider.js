import { cropPrebuiltPreview } from "./prebuilt-preview-crop.js";
import { providedPagePreviews } from "../../assets/pdf-library/previews/manifest.js";
import { deriveExamMetadata, examMetadataMatches, parseCompactExamCode } from "./exam-code.js";
import { createHierarchicalSourceNodes, normalizeSourceCategory } from "./source-tree.js";
import { createCropSource } from "../pdf-library/contract.js";
import { isAnswerChoiceBoxCandidate, textBeforeFooter, trimImageCandidateAtExternalCaption, trimQuestionRectAtFooter } from "../pdf-library/page-geometry.js";
import { mapQueryHighlights, queryHighlightTerms } from "../pdf-library/search.js";

async function providedPagePreview(document, source, result, options = {}) {
  if ((options.original && !options.continuous) || !document?.source?.locator?.startsWith("5e.shared.drive/")) return null;
  const hash = document.source.sha256;
  if (!providedPagePreviews[hash] || source.pageNumber > providedPagePreviews[hash]) return null;
  const fullPage = source.rect.every((value, index) => value === [0, 0, 1, 1][index]);
  const url = new URL(`../../assets/pdf-library/previews/${hash}/${source.pageNumber}${fullPage && options.thumbnail === true ? "-thumb" : ""}.webp`, import.meta.url).href;
  const image = fullPage ? { url } : await cropPrebuiltPreview(url, source.rect, options.thumbnail === true);
  return Object.freeze({
    ...image,
    source, provenance: result.provenance, result, previewOnly: true,
  });
}

const RESULT_KINDS = new Set(["image", "crop", "page"]);
const SUBJECT_LABELS = Object.freeze({ p1: "물리학Ⅰ", p2: "물리학Ⅱ", c1: "화학Ⅰ", c2: "화학Ⅱ", b1: "생명과학Ⅰ", b2: "생명과학Ⅱ", e1: "지구과학Ⅰ", e2: "지구과학Ⅱ" });
const ADMINISTRATION_LABELS = Object.freeze({ "06": "6월 모의평가", "09": "9월 모의평가", "11": "대학수학능력시험" });

export function humanExamName(metadata = {}, itemNumber = null) {
  if (!metadata) return "";
  const subject = SUBJECT_LABELS[metadata.subject];
  const validYear = Number.isInteger(metadata.academicYear) && metadata.academicYear >= 2000 && metadata.academicYear <= 2099;
  const administration = ADMINISTRATION_LABELS[metadata.administration];
  if (!subject || !validYear || !administration) return "";
  const year = `${metadata.academicYear}학년도`;
  const question = Number.isInteger(itemNumber) ? `${itemNumber}번` : "";
  return [subject, year, administration, question].filter(Boolean).join(" ");
}

function matchesFilters(result, filters = {}) {
  const metadata = result.metadata ?? {};
  return (!filters.subject || metadata.subject === filters.subject)
    && (!filters.academicYear || metadata.academicYear === Number(filters.academicYear))
    && (!filters.administration || metadata.administration === filters.administration);
}

function normalizedText(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}

function tokens(value) {
  return queryHighlightTerms(value).map(({ term }) => term);
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
  const matchContext = value.matchContext ? {
    ...value.matchContext,
    terms: Object.freeze((value.matchContext.terms ?? []).map(Object.freeze)),
    highlights: Object.freeze((value.matchContext.highlights ?? []).map((highlight) => Object.freeze({ ...highlight, rect: Object.freeze([...(highlight.rect ?? [])]) }))),
    misses: Object.freeze([...(value.matchContext.misses ?? [])]),
  } : null;
  return Object.freeze({
    ...value,
    provenance: Object.freeze(value.provenance),
    metadata: Object.freeze(value.metadata ?? {}),
    preview: Object.freeze(value.preview ?? {}),
    ...(matchContext ? { matchContext: Object.freeze(matchContext) } : {}),
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
    origin: "provided", category: "other", pathSegments: ["과학 부품"], counts: { pdf: 0, image: values.length, page: 0, question: 0 },
  }));

  const examsBySource = new Map();
  for (const item of input.examManifest?.items ?? []) {
    const subject = item.subject || "all";
    const sourceId = stableId("source", "exam-images", subject);
    if (!examsBySource.has(sourceId)) examsBySource.set(sourceId, []);
    examsBySource.get(sourceId).push(item);
    const previewUrl = externalExamImageUrl(input, item);
    const derived = deriveExamMetadata({
      metadata: { subject: item.subject, academicYear: item.year, administration: item.month },
      source: { displayName: item.fileName ?? item.file ?? item.name },
    });
    const examMetadata = {
      subject: derived?.subject ?? null, academicYear: derived?.academicYear ?? null,
      administration: derived?.administration ?? null, documentCode: derived?.documentCode ?? null,
      itemNumber: Number.isInteger(item.no) ? item.no : null, curated: true,
    };
    const fallbackTitle = item.fileName ?? item.file ?? item.name ?? item.id;
    const result = imageResult("exam-image", { ...item, title: humanExamName(examMetadata, item.no) || fallbackTitle }, sourceId, item.subjectLabel || "기출 이미지", {
      subtitle: [item.subjectLabel, item.exam, item.no ? `${item.no}번` : null].filter(Boolean).join(" · "),
      searchText: [item.id, item.title, ...(item.tags ?? []), ...(item.parts ?? [])].join(" "),
      metadata: examMetadata,
      previewUrl,
    });
    results.push(result); items.set(result.id, item);
  }
  for (const [id, values] of examsBySource) sources.push(sourceNode(id, values[0].subjectLabel || "기출 이미지", ["image"], values.length, {
    origin: "provided", category: "past-exams", pathSegments: ["이미지"], counts: { pdf: 0, image: values.length, page: 0, question: 0 },
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
      origin: "local", category, pathSegments: folders, counts: { pdf: 0, image: values.length, page: 0, question: 0 },
    }));
  }
  return { results, sources, items };
}

function pdfSourceId(document) {
  return stableId("source", "pdf", document.id, document.source?.kind, document.source?.locator);
}

function uniquePdfDocuments(documents) {
  const seen = new Set();
  return (documents ?? []).filter((document) => {
    const locator = String(document?.source?.locator ?? "").normalize("NFKC").trim();
    const identity = locator ? `${document?.source?.kind ?? "unknown"}\0${locator}` : `id\0${document?.id ?? ""}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
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
      source: item.source, contentSource: item.contentSource, figureCandidates: item.figureCandidates, metadata: document.metadata,
    };
  }));
}

function pdfPageResult(document, pageNumber, pageText, metadata, itemNumbers, pageWords = []) {
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
    matchText: pageText, searchWords: Object.freeze([...pageWords]),
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
    title: humanExamName(metadata, itemNumber) || `${itemCode || document.title} 문항`,
    subtitle: [document.source?.displayName, `${pageNumber}쪽`, itemNumber ? `${itemNumber}번` : null].filter(Boolean).join(" · "),
    sourceId: pdfSourceId(document), sourceLabel: document.source?.displayName ?? document.title,
    parentId: stableId("page", pdfSourceId(document), pageNumber),
    searchText: [document.title, document.source?.displayName, code, itemCode, entry.text].join(" "),
    metadata: { ...metadata, itemNumber, itemCode, pageNumber },
    preview: { source }, provenance: { ...pdfProvenance(document, source), itemId: entry.itemId ?? null },
    variants: {
      full: { label: "전체", source },
      content: { label: "내용", source: contentSource },
      figures,
    },
    matchContext: {
      snippet: String(entry.snippet ?? matchText.slice(0, 240)).trim(), matchRects,
      terms: entry.terms ?? [], highlights: entry.highlights ?? [], misses: entry.misses ?? [],
    },
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
  const originalSource = ownedCropSource(document, entry.pageNumber, entry.source);
  if (!originalSource) return null;
  const repairedRect = trimQuestionRectAtFooter(originalSource.rect, entry.words ?? []);
  const source = createCropSource({ ...originalSource, rect: repairedRect });
  const originalContent = ownedCropSource(document, entry.pageNumber, entry.contentSource);
  const contentRect = originalContent
    ? trimQuestionRectAtFooter(originalContent.rect, entry.words ?? [])
    : repairedRect;
  const contentSource = originalContent ? createCropSource({ ...originalContent, rect: contentRect }) : source;
  const figureCandidates = (entry.figureCandidates ?? []).flatMap((candidate) => {
    if ((candidate.documentId !== undefined && candidate.documentId !== document.id)
      || (candidate.pageNumber !== undefined && candidate.pageNumber !== entry.pageNumber)) return [];
    const candidateSource = ownedCropSource(document, entry.pageNumber, candidate.source);
    const repairedCandidateRect = candidateSource
      ? trimImageCandidateAtExternalCaption(candidate, entry.words ?? [])
      : null;
    const repairedCandidateSource = candidateSource && repairedCandidateRect
      ? createCropSource({ ...candidateSource, rect: repairedCandidateRect })
      : null;
    const questionBottom = source.rect[1] + source.rect[3];
    const candidateBottom = repairedCandidateSource ? repairedCandidateSource.rect[1] + repairedCandidateSource.rect[3] : 0;
    const insideQuestion = repairedCandidateSource
      && repairedCandidateSource.rect[0] >= source.rect[0]
      && repairedCandidateSource.rect[1] >= source.rect[1]
      && repairedCandidateSource.rect[0] + repairedCandidateSource.rect[2] <= source.rect[0] + source.rect[2]
      && candidateBottom <= questionBottom;
    const securedCandidate = repairedCandidateSource
      ? { ...candidate, documentId: document.id, pageNumber: entry.pageNumber, rect: repairedCandidateRect, source: repairedCandidateSource }
      : null;
    return insideQuestion && securedCandidate && !isAnswerChoiceBoxCandidate(securedCandidate, entry.words ?? []) ? [securedCandidate] : [];
  });
  const words = (entry.words ?? []).filter((word) => {
    const centerY = word.rect[1] + word.rect[3] / 2;
    return centerY >= source.rect[1] && centerY <= source.rect[1] + source.rect[3];
  });
  const text = textBeforeFooter(entry.text ?? entry.snippet, entry.words ?? []);
  return { ...entry, documentId: document.id, text, normalized: normalizedText(text), words, source, contentSource, figureCandidates };
}

function pdfResults(documents, index) {
  const results = [];
  const sources = [];
  const files = [];
  for (const document of documents) {
    const resultStart = results.length;
    const entries = entriesForDocument(index, document).flatMap((entry) => {
      const secured = securedPdfEntry(document, entry);
      return secured ? [secured] : [];
    });
    const metadata = deriveExamMetadata({
      metadata: document.metadata ?? entries.find((entry) => entry.metadata)?.metadata,
      source: document.source,
    });
    const pages = new Map();
    const pageWords = new Map();
    const indexedPageWords = new Map();
    const itemNumbersByPage = new Map();
    for (let pageNumber = 1; pageNumber <= (document.pageCount ?? 0); pageNumber += 1) pages.set(pageNumber, "");
    for (const page of document.pages ?? []) {
      pages.set(page.pageNumber, page.text ?? "");
      pageWords.set(page.pageNumber, page.words ?? []);
      itemNumbersByPage.set(page.pageNumber, new Set((page.items ?? []).map((item) => item.itemNumber).filter(Number.isInteger)));
    }
    for (const entry of entries) {
      if (!pages.has(entry.pageNumber)) pages.set(entry.pageNumber, entry.text ?? "");
      else if (entry.text && !pages.get(entry.pageNumber).includes(entry.text)) {
        pages.set(entry.pageNumber, `${pages.get(entry.pageNumber)} ${entry.text}`.trim());
      }
      if (!itemNumbersByPage.has(entry.pageNumber)) itemNumbersByPage.set(entry.pageNumber, new Set());
      if (Number.isInteger(entry.itemNumber)) itemNumbersByPage.get(entry.pageNumber).add(entry.itemNumber);
      if (!indexedPageWords.has(entry.pageNumber)) indexedPageWords.set(entry.pageNumber, []);
      indexedPageWords.get(entry.pageNumber).push(...(entry.words ?? []));
    }
    for (const [pageNumber, text] of pages) {
      const itemNumbers = itemNumbersByPage.get(pageNumber) ?? new Set();
      const words = pageWords.get(pageNumber)?.length ? pageWords.get(pageNumber) : indexedPageWords.get(pageNumber) ?? [];
      const pageResult = pdfPageResult(document, pageNumber, text, metadata, itemNumbers, words);
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
    const sourceId = pdfSourceId(document);
    const firstPage = results.slice(resultStart).find((result) => result.kind === "page");
    const inventorySource = { documentId: document.id, pageNumber: 1, rect: [0, 0, 1, 1], fullPageFallback: true };
    files.push(freezeResult({
        ...(firstPage ?? {
          id: stableId("file", sourceId), kind: "page", sourceId,
          metadata, preview: {}, provenance: pdfProvenance(document, inventorySource),
        }),
        id: stableId("file", sourceId),
        title: humanExamName(metadata) || document.title || document.source?.displayName,
        subtitle: [document.source?.displayName, `PDF ${pages.size}쪽`].filter(Boolean).join(" · "),
        documentId: document.id,
        folderId: document.source?.folderId ?? document.folderId ?? null,
        sourceId,
        sourceLabel: document.source?.displayName ?? document.title,
        fileSourceId: sourceId,
        pageCount: pages.size,
        indexState: document.indexState ?? null,
        diagnostic: document.indexState?.diagnostic ?? null,
        searchText: [document.title, document.source?.displayName, metadata?.documentCode].join(" "),
      }));
    const origin = document.source?.kind === "pack" ? "provided" : "local";
    const relativeFolders = pathSegments(document.source?.relativePath).slice(0, -1);
    const category = normalizeSourceCategory(document.metadata?.category ?? (metadata ? "past-exams" : relativeFolders[0]));
    const administration = metadata?.administration === "06" ? "6월 모의평가"
      : metadata?.administration === "09" ? "9월 모의평가" : metadata?.administration === "11" ? "대학수학능력시험" : null;
    const categoryLabel = category === "textbooks" ? "교과서" : category === "past-exams" ? "기출문제" : "기타";
    if (relativeFolders[0] === categoryLabel) relativeFolders.shift();
    const examPath = metadata ? [`${metadata.academicYear}학년도`, administration].filter(Boolean)
      : [document.source?.kind === "file" ? "연결 폴더" : null, ...relativeFolders].filter(Boolean);
    sources.push(sourceNode(sourceId, document.source?.displayName ?? document.title, ["crop", "page"], 1, {
      origin, category, pathSegments: document.driveFolder ? pathSegments(document.source.relativePath).slice(0, -1) : examPath,
      ...(document.driveFolder ? { driveFolder: document.driveFolder } : {}),
      counts: { pdf: 1, image: 0, page: pages.size, question: questions.size },
    }));
  }
  return { results, sources, files };
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
  if (result.provenance?.provider !== "pdf" || (result.kind !== "page" && (result.kind !== "crop" || result.cropType !== "question"))) return result;
  const terms = tokens(query);
  const text = String(result.matchText ?? result.matchContext?.snippet ?? "");
  const normalized = normalizedText(text);
  const offsets = terms.map((term) => normalized.indexOf(term)).filter((offset) => offset >= 0);
  const start = offsets.length ? Math.max(0, Math.min(...offsets) - 48) : 0;
  const snippet = text.slice(start, start + 180).trim();
  const termRecords = queryHighlightTerms(query);
  const mapped = result.searchWords?.length ? mapQueryHighlights({
    documentId: result.provenance.documentId, pageNumber: result.provenance.pageNumber,
    itemId: result.provenance.itemId ?? result.id, words: result.searchWords,
  }, termRecords) : null;
  const typed = mapped?.highlights?.length ? mapped.highlights : (result.matchContext?.highlights ?? []);
  const legacyRects = result.matchContext?.matchRects ?? [];
  const fallback = typed.length || !termRecords.length ? [] : legacyRects.map((rect) => ({
    ...termRecords[0], coordinateSpace: "page-normalized", legacy: true,
    documentId: result.provenance.documentId, pageNumber: result.provenance.pageNumber,
    cropId: result.provenance.itemId ?? result.id, rect,
  }));
  const highlights = [...typed, ...fallback];
  const matchRects = highlights.map((highlight) => highlight.rect);
  return freezeResult({ ...result, matchContext: {
    snippet, terms: termRecords, highlights, matchRects,
    misses: mapped?.misses ?? (highlights.length ? [] : termRecords.map((term) => term.termId)),
  } });
}

export function createUnifiedLibraryProvider(input = {}) {
  const images = collectImageResults(input);
  let documents = uniquePdfDocuments(input.pdfDocuments);
  let searchIndex = input.pdfSearchIndex ?? { schemaVersion: "pdf-search-index-v1", entries: [] };
  let pdf = pdfResults(documents, searchIndex);
  let revision = String(input.revision ?? input.catalogRevision ?? "catalog:0");
  const resolvedPdfResults = (Array.isArray(input.resolvedPdfResults) ? input.resolvedPdfResults : []).flatMap((resolved) => {
    const canonical = pdf.results.find((result) => result.id === resolved?.id && result.kind === "crop" && result.cropType === "question");
    const document = documents.find((value) => value.id === canonical?.provenance?.documentId);
    if (!canonical || !document) return [];
    const candidates = (resolved.variants?.figures ?? []).map((figure) => ({
      id: figure.id,
      label: figure.label,
      evidence: figure.evidence,
      source: {
        documentId: document.id,
        pageNumber: canonical.provenance.pageNumber,
        rect: figure.source?.rect,
        fullPageFallback: false,
      },
    }));
    const secured = securedPdfEntry(document, {
      pageNumber: canonical.provenance.pageNumber,
      source: canonical.provenance,
      words: canonical.searchWords,
      figureCandidates: candidates,
    });
    if (!secured) return [];
    return [freezeResult({
      ...canonical,
      variants: {
        ...canonical.variants,
        figures: secured.figureCandidates.map((candidate, index) => ({
          id: candidate.id ?? `${canonical.id}:figure:${index + 1}`,
          label: candidate.label ?? `이미지 ${index + 1}`,
          source: candidate.source,
        })),
      },
    })];
  });
  const materializers = input.materializers ?? {};

  async function loadPdfPage(file, pageNumber = 1, options = {}) {
    const document = documents.find((candidate) => candidate.id === file.documentId);
    const page = Number(pageNumber);
    if (!document || !Number.isInteger(page) || page < 1 || page > file.pageCount) {
      throw new RangeError("PDF preview page is outside the document");
    }
    const result = pdf.results.find((candidate) => candidate.kind === "page"
      && candidate.provenance.documentId === document.id
      && candidate.provenance.pageNumber === page);
    if (!result) throw new RangeError("PDF preview page is outside the document");
    const source = Object.freeze({ documentId: document.id, pageNumber: page, rect: Object.freeze([0, 0, 1, 1]), fullPageFallback: true });
    const prebuilt = await providedPagePreview(document, source, result, options);
    if (prebuilt) return prebuilt;
    if (typeof materializers.pdf !== "function") return Object.freeze({ file, result });
    const materialized = await materializers.pdf({ result, source, options: { ...options, preview: options.thumbnail !== true } });
    return Object.freeze({ ...materialized, result });
  }

  function allResults() {
    return dedupeResults([...images.results, ...pdf.results, ...resolvedPdfResults]);
  }

  function withManualCrop(result) {
    if (result.kind !== "crop" || result.cropType !== "question" || typeof input.cropForResult !== "function") return result;
    const rect = input.cropForResult(result);
    const base = result.variants?.full?.source?.rect ?? result.provenance.rect;
    if (!Array.isArray(rect) || rect.length !== 4 || rect.every((value, index) => value === base[index])) return result;
    const source = { ...result.provenance, rect: [...rect], fullPageFallback: false };
    return freezeResult({ ...result, variants: { ...result.variants, manual: { label: "조정한 범위", source } } });
  }

  function search(options = {}) {
    const compact = parseCompactExamCode(options.query);
    const allowedSources = Array.isArray(options.sourceIds) ? new Set(options.sourceIds) : null;
    const allowedKinds = normalizedKinds(options.kinds);
    let found = allResults().filter((result) =>
      (!allowedSources || allowedSources.has(result.sourceId))
      && (!allowedKinds || allowedKinds.has(result.kind))
      && matchesFilters(result, options.filters)
      && (allowedKinds || result.kind !== "page" || result.metadata.boundaryUncertain === true)
      && resultMatches(result, options.query ?? "", compact));
    if (!allowedKinds && compact?.itemNumber !== null && found.some((result) => result.kind === "crop")) {
      found = found.filter((result) => result.kind === "crop");
    }
    found.sort((left, right) => {
      const exactLeft = compact && left.metadata.itemCode === compact.itemCode ? 1 : 0;
      const exactRight = compact && right.metadata.itemCode === compact.itemCode ? 1 : 0;
      return exactRight - exactLeft
        || ((left.metadata.itemNumber ?? Number.MAX_SAFE_INTEGER) - (right.metadata.itemNumber ?? Number.MAX_SAFE_INTEGER))
        || left.title.localeCompare(right.title, "ko");
    });
    return Object.freeze(found.slice(0, boundedLimit(options.limit)).map((result) => contextualized(withManualCrop(result), options.query ?? "")));
  }

  function normalizeWorkerEntries(entries) {
    const byDocument = new Map(documents.map((document) => [document.id, document]));
    return entries.flatMap((entry) => {
      const document = byDocument.get(entry.documentId);
      if (!document) return [];
      const metadata = deriveExamMetadata({ metadata: entry.metadata ?? document.metadata, source: document.source });
      if ((entry.itemId || Number.isInteger(entry.itemNumber)) && entry.source?.fullPageFallback !== true) {
        const canonical = pdf.results.find((result) => result.kind === "crop"
          && result.provenance.documentId === document.id
          && result.provenance.pageNumber === entry.pageNumber
          && (entry.itemId ? result.provenance.itemId === entry.itemId : result.metadata.itemNumber === entry.itemNumber));
        if (canonical) return [freezeResult({
          ...canonical,
          matchText: String(entry.text ?? canonical.matchText ?? ""),
          matchContext: {
            snippet: String(entry.snippet ?? entry.text ?? canonical.matchContext?.snippet ?? "").trim(),
            matchRects: entry.matchRects ?? canonical.matchContext?.matchRects ?? [],
            terms: entry.terms ?? canonical.matchContext?.terms ?? [],
            highlights: entry.highlights ?? canonical.matchContext?.highlights ?? [],
            misses: entry.misses ?? canonical.matchContext?.misses ?? [],
          },
        })];
        const secured = securedPdfEntry(document, entry);
        return secured ? [pdfQuestionResult(document, secured, metadata)] : [];
      }
      const secured = securedPdfEntry(document, entry);
      if (!secured) return [];
      const page = pdfPageResult(document, entry.pageNumber, entry.text ?? "", metadata, new Set(), entry.words ?? []);
      return [freezeResult({ ...page, metadata: { ...page.metadata, boundaryUncertain: true } })];
    });
  }

  return Object.freeze({
    get revision() { return revision; },
    search,
    listPdfFiles(options = {}) {
      const compact = parseCompactExamCode(options.query);
      const allowedSources = Array.isArray(options.sourceIds) ? new Set(options.sourceIds) : null;
      const queryText = options.query ?? "";
      const found = pdf.files.filter((file) => {
        if (allowedSources && !allowedSources.has(file.sourceId)) return false;
        if (!matchesFilters(file, options.filters)) return false;
        if (!String(queryText).trim()) return true;
        return pdf.results.some((result) => result.sourceId === file.sourceId
          && matchesFilters(result, options.filters)
          && resultMatches(result, queryText, compact));
      });
      return Object.freeze(found.sort((left, right) => left.title.localeCompare(right.title, "ko")).map((file) => Object.freeze({
        ...file,
        firstMatchingPage: 1,
        loadPreview: (pageNumber = 1, previewOptions = {}) => loadPdfPage(file, pageNumber, previewOptions),
      })));
    },
    async searchPdfFiles(options = {}) {
      if (options.signal?.aborted) throw new DOMException("PDF search was cancelled", "AbortError");
      const query = String(options.query ?? "").trim();
      if (!query) return this.listPdfFiles(options);
      if (typeof input.searchPdf !== "function") return Object.freeze([]);
      const allowedSources = Array.isArray(options.sourceIds) ? new Set(options.sourceIds) : null;
      const allowedDocuments = documents.filter((document) => !allowedSources || allowedSources.has(pdfSourceId(document)));
      const entries = [...(await input.searchPdf({
        query,
        documentIds: allowedDocuments.map((document) => document.id),
        filters: options.filters ?? {},
        limit: null,
        requestId: options.requestId,
        signal: options.signal,
      }))];
      const queryTokens = tokens(query);
      const matchedPages = new Set(entries.map((entry) => `${entry.documentId}\0${entry.pageNumber}`));
      for (const document of allowedDocuments) {
        for (const page of document.pages ?? []) {
          const key = `${document.id}\0${page.pageNumber}`;
          if (matchedPages.has(key) || !matchesText(page.text, queryTokens)) continue;
          const mapped = mapQueryHighlights({ ...page, documentId: document.id }, query);
          const pageText = String(page.text ?? "");
          const firstMatch = queryTokens.reduce((offset, token) => {
            const found = normalizedText(pageText).indexOf(token);
            return found < 0 ? offset : Math.min(offset, found);
          }, Number.POSITIVE_INFINITY);
          const snippetStart = Number.isFinite(firstMatch) ? Math.max(0, firstMatch - 48) : 0;
          entries.push(Object.freeze({
            documentId: document.id,
            pageNumber: page.pageNumber,
            snippet: pageText.slice(snippetStart, snippetStart + 160).trim(),
            terms: mapped.terms,
            highlights: mapped.highlights,
            misses: mapped.misses,
          }));
          matchedPages.add(key);
        }
      }
      if (options.signal?.aborted) throw new DOMException("PDF search was cancelled", "AbortError");
      const filesByDocument = new Map(this.listPdfFiles({ ...options, query: "" }).map((file) => [file.documentId, file]));
      const matchesByDocument = new Map();
      for (const entry of entries ?? []) {
        if (!filesByDocument.has(entry.documentId)) continue;
        let pages = matchesByDocument.get(entry.documentId);
        if (!pages) {
          pages = new Map();
          matchesByDocument.set(entry.documentId, pages);
        }
        const current = pages.get(entry.pageNumber);
        const source = Object.freeze({ documentId: entry.documentId, pageNumber: entry.pageNumber, rect: Object.freeze([0, 0, 1, 1]), fullPageFallback: true });
        if (!current) {
          pages.set(entry.pageNumber, {
            pageNumber: entry.pageNumber, source, snippet: String(entry.snippet ?? ""),
            terms: [...(entry.terms ?? [])], highlights: [...(entry.highlights ?? [])], misses: [...(entry.misses ?? [])],
          });
          continue;
        }
        for (const term of entry.terms ?? []) {
          if (!current.terms.some((candidate) => (candidate.termId ?? candidate.term) === (term.termId ?? term.term))) current.terms.push(term);
        }
        for (const highlight of entry.highlights ?? []) {
          const key = JSON.stringify([highlight.termId ?? highlight.term, highlight.rect]);
          if (!current.highlights.some((candidate) => JSON.stringify([candidate.termId ?? candidate.term, candidate.rect]) === key)) current.highlights.push(highlight);
        }
        for (const miss of entry.misses ?? []) if (!current.misses.includes(miss)) current.misses.push(miss);
      }
      return Object.freeze([...matchesByDocument].slice(0, boundedLimit(options.limit)).map(([documentId, pages]) => {
        const matches = [...pages.values()].sort((left, right) => left.pageNumber - right.pageNumber).map((match) => Object.freeze({
          ...match,
          terms: Object.freeze(match.terms), highlights: Object.freeze(match.highlights), misses: Object.freeze(match.misses),
        }));
        const file = filesByDocument.get(documentId);
        const first = matches[0];
        return Object.freeze({
          ...file,
          metadata: Object.freeze({ ...file.metadata, pageNumber: first.pageNumber }),
          preview: Object.freeze({ source: first.source }),
          provenance: Object.freeze({ ...file.provenance, ...first.source }),
          revision,
          requestId: options.requestId ?? null,
          firstMatchingPage: first.pageNumber,
          matches: Object.freeze(matches),
          loadPreview: (pageNumber = matches[0].pageNumber, previewOptions = {}) => loadPdfPage(file, pageNumber, previewOptions),
        });
      }));
    },
    listPdfPages(options = {}) {
      const compact = parseCompactExamCode(options.query);
      const allowedSources = Array.isArray(options.sourceIds) ? new Set(options.sourceIds) : null;
      const found = pdf.results.filter((result) => result.kind === "page"
        && (!allowedSources || allowedSources.has(result.sourceId))
        && (!options.sourceId || result.sourceId === options.sourceId)
        && matchesFilters(result, options.filters)
        && resultMatches(result, options.query ?? "", compact))
        .map((result) => contextualized(result, options.query ?? ""));
      const limit = Number.isInteger(options.limit) && options.limit > 0 ? boundedLimit(options.limit) : found.length;
      return Object.freeze(found.slice(0, limit));
    },
    getExamFilterOptions() {
      const metadata = allResults().filter((result) => result.kind === "crop").map((result) => result.metadata ?? {});
      return Object.freeze({
        subjects: Object.freeze([...new Set(metadata.map((item) => item.subject).filter((value) => SUBJECT_LABELS[value]))].sort()),
        academicYears: Object.freeze([...new Set(metadata.map((item) => item.academicYear).filter((value) => Number.isInteger(value) && value >= 2000 && value <= 2099))].sort((a, b) => b - a)),
        administrations: Object.freeze([...new Set(metadata.map((item) => item.administration).filter((value) => ADMINISTRATION_LABELS[value]))].sort()),
      });
    },
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
      const nonPdf = local.filter((result) => result.provenance?.provider !== "pdf");
      const merged = dedupeResults([...nonPdf, ...normalizeWorkerEntries(workerEntries ?? [])]).filter((result) =>
        (!allowedSources || allowedSources.has(result.sourceId))
        && (!allowedKinds || allowedKinds.has(result.kind))
        && matchesFilters(result, options.filters)
        && (allowedKinds || result.kind !== "page" || result.metadata.boundaryUncertain === true));
      return Object.freeze(merged.slice(0, boundedLimit(options.limit)).map((result) => contextualized(withManualCrop(result), options.query ?? "")));
    },
    replacePdfCatalog(next = {}) {
      documents = uniquePdfDocuments(next.documents);
      searchIndex = next.searchIndex ?? { schemaVersion: "pdf-search-index-v1", entries: [] };
      revision = String(next.revision ?? next.catalogRevision ?? revision);
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
        const manual = representation === "manual" && result.variants?.manual?.source;
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
        if (!securedSource || (!manual && (canonicalSource?.documentId !== securedSource.documentId
          || canonicalSource?.pageNumber !== securedSource.pageNumber
          || (canonicalSource?.fullPageFallback === true) !== securedSource.fullPageFallback
          || canonicalRect.length !== securedSource.rect.length
          || canonicalRect.some((value, index) => value !== securedSource.rect[index])))) {
          throw new TypeError("PDF materialization source does not match result provenance");
        }
        const materializerResult = source === result.provenance ? result : Object.freeze({
          ...result,
          provenance: Object.freeze({ ...result.provenance, ...securedSource }),
        });
        if (options.thumbnail === true || options.preview === true) {
          const prebuilt = await providedPagePreview(documents.find(document => document.id === securedSource.documentId), securedSource, materializerResult, options);
          if (prebuilt) return prebuilt;
        }
        return materializers.pdf({ result: materializerResult, source: securedSource, options });
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

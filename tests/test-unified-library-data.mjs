import assert from "node:assert/strict";
import test from "node:test";

import { parseCompactExamCode, deriveExamMetadata } from "../js/library/exam-code.js";
import { createUnifiedLibraryProvider } from "../js/library/provider.js";
import { computeSourceSelection } from "../js/library/source-tree.js";
import { queryHighlightTerms, searchIndex } from "../js/pdf-library/search.js";
import { assertPdfMaterializationSource } from "../js/pdf-library/pdf-library-ui.js";
import { insertPartsAsset } from "../js/parts-library.js";

const pdfSource = Object.freeze({
  kind: "pack",
  locator: "verified-pack/documents/p12606.pdf",
  displayName: "p12606.pdf",
  sha256: "a".repeat(64),
});

function pdfDocument(id = "verified::p12606") {
  return {
    id,
    title: "2026학년도 6월 모의평가 물리학 I",
    source: pdfSource,
    metadata: { academicYear: 2026, administration: "june", subject: "phy1" },
    pageCount: 1,
    pages: [{
      documentId: id,
      pageNumber: 1,
      text: "1. 운동량 보존 실험 도판",
      words: [{ text: "운동량", rect: [0.2, 0.2, 0.1, 0.03] }],
      items: [{
        id: `${id}:p1:q1`, itemNumber: 1, label: "1", rect: [0.1, 0.1, 0.8, 0.7],
        source: { documentId: id, pageNumber: 1, rect: [0.1, 0.1, 0.8, 0.7], fullPageFallback: false },
      }],
    }],
  };
}

test("compact exam codes are strict and preserve item/page ambiguity", () => {
  assert.deepEqual(parseCompactExamCode("p1260601"), {
    subject: "p1", academicYear: 2026, administration: "06", itemNumber: 1,
    documentCode: "p12606", itemCode: "p1260601",
  });
  assert.deepEqual(parseCompactExamCode("p12606.pdf"), {
    subject: "p1", academicYear: 2026, administration: "06", itemNumber: null,
    documentCode: "p12606", itemCode: null,
  });
  for (const malformed of ["p1261301", "p1260600", "p3260601", "xp1260601", "p126060101"]) {
    assert.equal(parseCompactExamCode(malformed), null, malformed);
  }
});

test("lazy runtime figures become canonical for subsequently created action providers", async () => {
  const document = pdfDocument();
  const initial = createUnifiedLibraryProvider({ pdfDocuments: [document] }).search({ query: "p1260601" })[0];
  const figureSource = { ...initial.provenance, rect: [0.2, 0.2, 0.3, 0.25], fullPageFallback: false };
  const resolved = {
    ...initial,
    variants: { ...initial.variants, figures: [{ id: `${initial.id}:figure:1`, label: "이미지 1", source: figureSource }] },
  };
  let received = null;
  const actionProvider = createUnifiedLibraryProvider({
    pdfDocuments: [document], resolvedPdfResults: [resolved],
    materializers: { pdf: (input) => { received = input; return input; } },
  });
  await actionProvider.materialize(resolved, { representation: "figure:0" });
  assert.deepEqual(received.source.rect, figureSource.rect);
});

test("Given a resolved runtime figure outside its question, when an action provider materializes it, then the forged geometry is rejected", async () => {
  const document = pdfDocument();
  const initial = createUnifiedLibraryProvider({ pdfDocuments: [document] }).search({ query: "p1260601" })[0];
  const forged = {
    ...initial,
    variants: {
      ...initial.variants,
      figures: [{
        id: `${initial.id}:figure:forged`, label: "이미지 1",
        source: { documentId: document.id, pageNumber: 1, rect: [0.91, 0.91, 0.08, 0.08], fullPageFallback: false },
      }],
    },
  };
  let materializerCalls = 0;
  const actionProvider = createUnifiedLibraryProvider({
    pdfDocuments: [document], resolvedPdfResults: [forged],
    materializers: { pdf: () => { materializerCalls += 1; } },
  });

  await assert.rejects(
    actionProvider.materialize(forged, { representation: "figure:0" }),
    /provenance|unavailable/iu,
  );
  assert.equal(materializerCalls, 0);
});

test("multi-term PDF search deduplicates # tokens and maps split Korean words to term-owned page coordinates", () => {
  const entry = {
    documentId: "space", documentTitle: "우주", pageNumber: 2, itemId: "space:p2:q3", itemNumber: 3,
    text: "우주 선 질량 보존", normalized: "우주 선 질량 보존",
    words: [
      { text: "우주", rect: [0.1, 0.2, 0.08, 0.03] },
      { text: "선", rect: [0.18, 0.2, 0.03, 0.03] },
      { text: "질량", rect: [0.3, 0.2, 0.08, 0.03] },
    ],
    source: { documentId: "space", pageNumber: 2, rect: [0.05, 0.1, 0.8, 0.7], fullPageFallback: false },
  };
  const [result] = searchIndex({ entries: [entry] }, { query: "우주선 #질량 질량" });
  assert.deepEqual(result.terms.map((term) => term.term), ["우주선", "질량"]);
  assert.deepEqual(result.highlights.map(({ term, documentId, pageNumber, cropId, rect }) => ({ term, documentId, pageNumber, cropId, rect })), [
    { term: "우주선", documentId: "space", pageNumber: 2, cropId: "space:p2:q3", rect: [0.1, 0.2, 0.08, 0.03] },
    { term: "우주선", documentId: "space", pageNumber: 2, cropId: "space:p2:q3", rect: [0.18, 0.2, 0.03, 0.03] },
    { term: "질량", documentId: "space", pageNumber: 2, cropId: "space:p2:q3", rect: [0.3, 0.2, 0.08, 0.03] },
  ]);
  const colors = new Map(queryHighlightTerms("질량 우주선").map((term) => [term.termId, term.color]));
  assert.deepEqual(new Map(result.terms.map((term) => [term.termId, term.color])), colors);
});

test("character matches inside one PDF word use only the matching glyph span", () => {
  const entry = {
    documentId: "glyphs", documentTitle: "glyphs", pageNumber: 1, itemId: "glyphs:q1",
    text: "우주선질량", normalized: "우주선질량",
    words: [{ text: "우주선질량", rect: [0.1, 0.2, 0.3, 0.04] }],
    source: { documentId: "glyphs", pageNumber: 1, rect: [0, 0, 1, 1], fullPageFallback: false },
  };
  const [result] = searchIndex({ entries: [entry] }, { query: "질량" });
  assert.equal(result.highlights.length, 1);
  assert.deepEqual(result.highlights[0].rect.map((value) => Math.round(value * 100) / 100), [0.28, 0.2, 0.12, 0.04]);
  assert.equal(result.highlights[0].coordinateSpace, "page-normalized");
});

test("visual-line grouping joins adjacent Korean runs but separates distant columns", () => {
  const base = {
    documentId: "columns", documentTitle: "columns", pageNumber: 1, itemId: "columns:q1",
    text: "화산 섬", normalized: "화산 섬",
    source: { documentId: "columns", pageNumber: 1, rect: [0, 0, 1, 1], fullPageFallback: false },
  };
  const adjacent = {
    ...base,
    words: [
      { text: "화산", rect: [0.1, 0.1, 0.08, 0.03] },
      { text: "섬", rect: [0.185, 0.1, 0.03, 0.03] },
    ],
  };
  const [adjacentResult] = searchIndex({ entries: [adjacent] }, { query: "화산섬" });
  assert.equal(adjacentResult.highlights.length, 2);
  assert.deepEqual(adjacentResult.misses, []);
  const distant = {
    ...base,
    words: [
      { text: "화산", rect: [0.1, 0.1, 0.08, 0.03] },
      { text: "섬", rect: [0.8, 0.1, 0.03, 0.03] },
    ],
  };
  const [result] = searchIndex({ entries: [distant] }, { query: "화산섬" });
  assert.equal(result.highlights.length, 0);
  assert.deepEqual(result.misses, [result.terms[0].termId]);
});

test("legacy prebuilt rectangles remain readable when word positions are absent", () => {
  const entry = {
    documentId: "legacy", documentTitle: "legacy", pageNumber: 1, itemId: "legacy:q1",
    text: "질량", normalized: "질량", words: [], matchRects: [[0.25, 0.3, 0.1, 0.04]],
    source: { documentId: "legacy", pageNumber: 1, rect: [0, 0, 1, 1], fullPageFallback: false },
  };
  const [result] = searchIndex({ entries: [entry] }, { query: "#질량" });
  assert.deepEqual(result.matchRects, [[0.25, 0.3, 0.1, 0.04]]);
  assert.equal(result.highlights[0].coordinateSpace, "page-normalized");
  assert.equal(result.highlights[0].legacy, true);
});

test("PDF AND terms must coexist inside one question and generated colors stay distinct beyond the base palette", () => {
  const base = { documentId: "d", documentTitle: "d", pageNumber: 1, source: { documentId: "d", pageNumber: 1, rect: [0, 0, 1, 1], fullPageFallback: false }, words: [] };
  const entries = [
    { ...base, itemId: "q1", text: "우주선", normalized: "우주선" },
    { ...base, itemId: "q2", text: "질량", normalized: "질량" },
  ];
  assert.deepEqual(searchIndex({ entries }, { query: "우주선 질량" }), []);
  const terms = queryHighlightTerms(Array.from({ length: 18 }, (_, index) => `term${index}`).join(" "));
  assert.equal(new Set(terms.map((term) => term.color)).size, 18);
});

test("real pack metadata derives canonical exam codes without renaming its PDF", () => {
  assert.deepEqual(deriveExamMetadata({
    metadata: { academicYear: 2026, administration: "june", subject: "phy1" },
    source: { displayName: "2026-june-physics1.pdf" },
  }), {
    subject: "p1", academicYear: 2026, administration: "06",
    documentCode: "p12606", sourceFileName: "2026-june-physics1.pdf",
  });
});

test("readable imported exam filenames derive canonical metadata", () => {
  assert.deepEqual(deriveExamMetadata({ source: { displayName: "2025-june-phy1.pdf" } }), {
    subject: "p1", academicYear: 2025, administration: "06", documentCode: "p12506", sourceFileName: "2025-june-phy1.pdf",
  });
});

test("malformed exam metadata falls back to the original filename instead of inventing an exam title", () => {
  const provider = createUnifiedLibraryProvider({
    examManifest: { items: [{
      id: "bad-meta", file: "teacher-original-name.png", title: "internal-code-13",
      subject: "unknown", year: 1900, month: 13, no: 7,
    }] },
  });
  const [result] = provider.search({ query: "internal-code-13", kinds: ["image"] });
  assert.equal(result.title, "teacher-original-name.png");
  assert.equal(result.metadata.academicYear, null);
  assert.equal(result.metadata.administration, null);
});

test("PDF inventory stays file-based beyond the page search cap and deduplicates stale catalog entries", () => {
  const documents = Array.from({ length: 501 }, (_, index) => ({
    ...pdfDocument(`document-${index}`),
    source: { ...pdfSource, locator: `verified-pack/documents/document-${index}.pdf`, displayName: `document-${index}.pdf` },
  }));
  documents.push({ ...documents[0], id: "stale-duplicate-id", title: "stale duplicate" });
  const provider = createUnifiedLibraryProvider({ pdfDocuments: documents });
  assert.equal(typeof provider.listPdfFiles, "function");
  assert.equal(provider.listPdfFiles({}).length, 501);
  assert.equal(provider.search({ kinds: ["page"], limit: 500 }).length, 500);
});

test("PDF source metadata separates one physical file from its pages and questions", () => {
  const document = { ...pdfDocument(), pageCount: 2, pages: [
    pdfDocument().pages[0],
    { ...pdfDocument().pages[0], pageNumber: 2, text: "2. 파동", items: [] },
  ] };
  const provider = createUnifiedLibraryProvider({ pdfDocuments: [document] });
  const source = provider.getSources().find((node) => node.kind === "source");
  assert.equal(provider.listPdfFiles({})[0].title, "물리학Ⅰ 2026학년도 6월 모의평가");
  assert.match(provider.listPdfFiles({})[0].subtitle, /p12606\.pdf · PDF 2쪽/u);
  assert.equal(source.count, 1);
  assert.deepEqual(source.counts, { pdf: 1, image: 0, page: 2, question: 1 });
});

test("PDF file drilldown keeps term-owned page coordinates for page thumbnails and previews", () => {
  const provider = createUnifiedLibraryProvider({ pdfDocuments: [pdfDocument()] });
  const file = provider.listPdfFiles({ query: "#운동량" })[0];
  const [page] = provider.listPdfPages({ sourceId: file.sourceId, query: "#운동량" });
  assert.equal(page.kind, "page");
  assert.equal(page.matchContext.highlights.length, 1);
  assert.equal(page.matchContext.highlights[0].coordinateSpace, "page-normalized");
  assert.equal(page.matchContext.highlights[0].documentId, pdfDocument().id);
});

test("exact item search returns one question card with full, content, and figure variants", async () => {
  const document = pdfDocument();
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [document],
    pdfSearchIndex: { schemaVersion: "pdf-search-index-v1", entries: [{
      documentId: document.id, documentTitle: document.title, pageNumber: 1,
      itemId: `${document.id}:p1:q1`, itemNumber: 1, text: "운동량 보존 실험 도판", normalized: "운동량 보존 실험 도판",
      source: document.pages[0].items[0].source,
      metadata: document.metadata,
      figureCandidates: [{
        id: `${document.id}:figure:1`, itemId: `${document.id}:p1:q1`, itemNumber: 1,
        documentId: document.id, pageNumber: 1, rect: [0.3, 0.3, 0.2, 0.2],
        source: { documentId: document.id, pageNumber: 1, rect: [0.3, 0.3, 0.2, 0.2], fullPageFallback: false },
      }],
    }] },
    materializers: {
      pdf: async ({ source }) => ({ bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), source }),
    },
  });

  const results = provider.search({ query: "p1260601" });
  assert.deepEqual(results.map(({ kind }) => kind), ["crop"]);
  assert.equal(results[0].cropType, "question");
  assert.deepEqual(Object.keys(results[0].variants), ["full", "content", "figures"]);
  assert.equal(results[0].variants.figures.length, 1);
  assert.equal(results[0].variants.figures[0].source.rect.join(","), "0.3,0.3,0.2,0.2");
  assert.match(results[0].matchContext.snippet, /운동량/u);
  assert.equal(results.every(({ provenance }) => provenance.sha256 === pdfSource.sha256), true);

  const rendered = await provider.materialize(results[0]);
  assert.deepEqual([...rendered.bytes], [0x89, 0x50, 0x4e, 0x47]);
  assert.equal(rendered.source.documentId, document.id);
  const figure = await provider.materialize(results[0], { representation: "figure:0" });
  assert.equal(figure.source.rect.join(","), "0.3,0.3,0.2,0.2");
});

test("WHERE sources and WHAT kinds are independent and colliding source ids remain distinct", () => {
  const first = pdfDocument("shared");
  const second = { ...pdfDocument("shared"), source: { ...pdfSource, locator: "pack-b/documents/p12606.pdf", sha256: "b".repeat(64) } };
  const provider = createUnifiedLibraryProvider({ pdfDocuments: [first, second] });
  const pages = provider.search({ query: "운동량", kinds: ["page"] });
  assert.equal(pages.length, 2);
  assert.equal(new Set(pages.map(({ id }) => id)).size, 2);
  assert.equal(new Set(pages.map(({ sourceId }) => sourceId)).size, 2);
  assert.deepEqual(provider.search({ query: "운동량", kinds: ["image"] }), []);
  assert.equal(provider.search({ query: "운동량", sourceIds: [pages[0].sourceId], kinds: ["page"] }).length, 1);
});

test("word search yields one card per identified question and raw pages only by explicit page filter", () => {
  const document = pdfDocument();
  const provider = createUnifiedLibraryProvider({ pdfDocuments: [document] });
  const defaults = provider.search({ query: "운동량" });
  assert.deepEqual(defaults.map(({ kind }) => kind), ["crop"]);
  assert.equal(defaults[0].metadata.itemNumber, 1);
  assert.match(defaults[0].matchContext.snippet, /운동량/u);
  assert.deepEqual(provider.search({ query: "운동량", kinds: ["page"] }).map(({ kind }) => kind), ["page"]);
});

test("a locally opened PDF matches words only inside each identified question boundary", () => {
  const first = pdfDocument("local-boundaries");
  const page = {
    ...first.pages[0],
    text: "1. 운동량 2. 굴절",
    words: [
      { text: "운동량", rect: [0.2, 0.2, 0.1, 0.03] },
      { text: "굴절", rect: [0.2, 0.7, 0.1, 0.03] },
    ],
    items: [
      {
        ...first.pages[0].items[0], rect: [0.1, 0.1, 0.8, 0.45],
        source: { documentId: "local-boundaries", pageNumber: 1, rect: [0.1, 0.1, 0.8, 0.45], fullPageFallback: false },
      },
      {
        id: "local-boundaries:p1:q2", itemNumber: 2, label: "2", rect: [0.1, 0.6, 0.8, 0.3],
        source: { documentId: "local-boundaries", pageNumber: 1, rect: [0.1, 0.6, 0.8, 0.3], fullPageFallback: false },
      },
    ],
  };
  const provider = createUnifiedLibraryProvider({ pdfDocuments: [{ ...first, pages: [page] }] });
  assert.deepEqual(provider.search({ query: "굴절" }).map((result) => result.metadata.itemNumber), [2]);
});

test("an exact exam code prefers its indexed PDF question over a duplicate curated image", () => {
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [pdfDocument()],
    examManifest: { items: [{
      id: "p1_2026_06_01", file: "p1_2026_06_01.png", subject: "p1", year: 2026, month: 6, no: 1, title: "1번",
    }] },
  });
  const found = provider.search({ query: "p1260601" });
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "crop");
  assert.equal(found[0].metadata.itemCode, "p1260601");
});

test("a page without a trustworthy item boundary remains an honest default page fallback", () => {
  const document = { ...pdfDocument(), pages: [{ ...pdfDocument().pages[0], items: [] }] };
  const provider = createUnifiedLibraryProvider({ pdfDocuments: [document] });
  const [fallback] = provider.search({ query: "운동량" });
  assert.equal(fallback.kind, "page");
  assert.equal(fallback.provenance.fullPageFallback, true);
});

test("worker search is async, groups matching question once, and catalog replacement is immediate", async () => {
  const document = { ...pdfDocument("worker-doc"), pageCount: 3, pages: [] };
  let workerOptions;
  let workerCalls = 0;
  const workerEntry = {
    documentId: document.id, documentTitle: document.title, pageNumber: 3,
    itemId: "worker-doc:q4", itemNumber: 4, snippet: "프리즘을 지난 빛의 굴절 실험",
    matchRects: [[0.42, 0.24, 0.08, 0.03]],
    source: { documentId: document.id, pageNumber: 3, rect: [0.1, 0.1, 0.8, 0.6], fullPageFallback: false },
    metadata: { academicYear: 2026, administration: "june", subject: "phy1" },
  };
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [document],
    searchPdf: async (options) => { workerCalls += 1; workerOptions = options; return [workerEntry, workerEntry]; },
  });
  const pdfSourceId = provider.getSources().find(({ kind }) => kind === "source").id;
  const results = await provider.searchAsync({ query: "굴절", sourceIds: [pdfSourceId] });
  assert.equal(results.filter(({ kind }) => kind === "page").length, 0);
  assert.equal(results.filter(({ kind }) => kind === "crop").length, 1);
  assert.match(results[0].matchContext.snippet, /굴절/u);
  assert.deepEqual(results[0].matchContext.matchRects, [[0.42, 0.24, 0.08, 0.03]]);
  assert.match(results[0].matchText, /굴절/u);
  assert.deepEqual(workerOptions.documentIds, ["worker-doc"]);
  await provider.searchAsync({ query: "굴절", sourceIds: [], kinds: ["image"] });
  assert.equal(workerCalls, 1);
  provider.replacePdfCatalog({ documents: [], searchIndex: { schemaVersion: "pdf-search-index-v1", entries: [] } });
  assert.deepEqual(provider.search({ query: "굴절" }), []);
});

test("worker question search reuses canonical secured geometry when its compact result omits words", async () => {
  const document = pdfDocument("worker-canonical");
  const canonicalSource = document.pages[0].items[0].source;
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [document],
    materializers: { pdf: async ({ result, source }) => ({ source: assertPdfMaterializationSource(result, source, 1) }) },
    searchPdf: async () => [{
      documentId: document.id,
      pageNumber: 1,
      itemId: document.pages[0].items[0].id,
      itemNumber: 1,
      text: "worker snippet 운동량",
      snippet: "worker snippet 운동량",
      terms: [{ term: "운동량", termId: "worker-term", label: "운동량", color: "#123456" }],
      source: { ...canonicalSource, rect: [0.1, 0.1, 0.8, 0.85] },
    }],
  });

  const [result] = await provider.searchAsync({ query: "운동량", kinds: ["crop"] });

  assert.deepEqual(result.provenance.rect, canonicalSource.rect);
  assert.deepEqual(result.variants.full.source.rect, canonicalSource.rect);
  assert.match(result.matchContext.snippet, /worker snippet/u);
  assert.deepEqual((await provider.materialize(result, { representation: "full" })).source.rect, canonicalSource.rect);
  assert.deepEqual((await provider.materialize(result, { thumbnail: true })).source.rect, canonicalSource.rect);
});

test("a PDF file match materializes its active page through a canonical full-page result", async () => {
  const document = {
    ...pdfDocument("textbook-327"),
    pageCount: 327,
    pages: [{
      documentId: "textbook-327", pageNumber: 272, text: "active page term", words: [], items: [],
    }],
  };
  let received;
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [document],
    searchPdf: async () => [{
      documentId: document.id, pageNumber: 272, snippet: "active page term",
      terms: [], highlights: [], misses: [],
    }],
    materializers: { pdf: async (input) => { received = input; return { dataUrl: "data:image/png;base64,AA==" }; } },
  });

  const [file] = await provider.searchPdfFiles({ query: "active page term" });
  assert.match(file.id, /^file\|/u);
  const rendered = await file.loadPreview(272, { original: true });

  assert.equal(rendered.result.kind, "page");
  assert.notEqual(rendered.result.id, file.id);
  assert.equal(received.result.provenance.pageNumber, 272);
  assert.deepEqual(received.source, {
    documentId: document.id, pageNumber: 272, rect: [0, 0, 1, 1], fullPageFallback: true,
  });
  assert.equal(received.options.original, true);
});

test("an empty PDF query exposes the same canonical page preview contract", async () => {
  const document = { ...pdfDocument("inventory-pdf"), pageCount: 2 };
  let received;
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [document],
    materializers: { pdf: async (input) => { received = input; return { dataUrl: "data:image/png;base64,AA==" }; } },
  });

  const [file] = await provider.searchPdfFiles({ query: "" });
  assert.equal(file.kind, "page");
  assert.equal(file.firstMatchingPage, 1);
  assert.equal(typeof file.loadPreview, "function");
  const rendered = await file.loadPreview(2, { original: true });

  assert.equal(rendered.result.kind, "page");
  assert.equal(rendered.result.provenance.pageNumber, 2);
  assert.equal(received.source.pageNumber, 2);
  assert.equal(received.options.original, true);
  await assert.rejects(file.loadPreview(3), /outside the document/u);

  await file.loadPreview(1, { thumbnail: true });
  assert.equal(received.options.thumbnail, true);
  assert.equal(received.options.preview, false);
});

test("PDF page inventory preserves selected sources and applies an explicit bounded limit", () => {
  const withSecondPage = (document) => ({
    ...document,
    source: { ...document.source, locator: `verified-pack/documents/${document.id}.pdf`, displayName: `${document.id}.pdf` },
    pageCount: 2,
    pages: [...document.pages, {
      documentId: document.id, pageNumber: 2, text: "2쪽", words: [], items: [],
    }],
  });
  const first = withSecondPage(pdfDocument("page-source-a"));
  const second = withSecondPage(pdfDocument("page-source-b"));
  const provider = createUnifiedLibraryProvider({ pdfDocuments: [first, second] });
  const sources = provider.getSources().filter(({ kind }) => kind === "source");
  const firstSource = sources.find(({ id }) => id.includes("page-source-a"));
  const secondSource = sources.find(({ id }) => id.includes("page-source-b"));

  assert.equal(provider.listPdfPages({ query: "" }).length, 4);
  assert.deepEqual(provider.listPdfPages({ query: "", sourceIds: [secondSource.id] }).map(({ sourceId }) => sourceId), [
    secondSource.id,
    secondSource.id,
  ]);
  assert.deepEqual(provider.listPdfPages({ query: "", sourceIds: [] }), []);
  assert.equal(provider.listPdfPages({ query: "", sourceIds: [firstSource.id, secondSource.id], limit: 3 }).length, 3);
});

test("PDF file search includes a term elsewhere on a page with detected question items", async () => {
  const document = pdfDocument("full-page-occurrence");
  document.pages[0] = {
    ...document.pages[0],
    text: "1. 운동량 보존 실험 도판 부록에는 말굽자석 해설이 있다",
    words: [
      ...document.pages[0].words,
      { text: "말굽자석", rect: [0.1, 0.92, 0.1, 0.03] },
    ],
  };
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [document],
    searchPdf: async () => [],
  });

  const [file] = await provider.searchPdfFiles({ query: "자석 해설" });
  assert.equal(file.matches.length, 1);
  assert.equal(file.matches[0].pageNumber, 1);
  assert.match(file.matches[0].snippet, /말굽자석/u);
  assert.deepEqual(await provider.searchPdfFiles({ query: "자석 없는말" }), []);
  assert.deepEqual(await provider.searchPdfFiles({ query: "자석", sourceIds: [] }), []);
  assert.deepEqual(await provider.searchPdfFiles({ query: "자석", filters: { subject: "bio1" } }), []);
});

test("prebuilt and worker question results reject cross-document crop provenance", async () => {
  const owner = pdfDocument("owner-doc");
  const other = pdfDocument("other-doc");
  const otherSource = { documentId: other.id, pageNumber: 1, rect: [0.2, 0.2, 0.5, 0.5], fullPageFallback: false };
  const safeSource = owner.pages[0].items[0].source;
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [owner, other],
    pdfSearchIndex: { schemaVersion: "pdf-search-index-v1", entries: [
      {
        documentId: owner.id, documentTitle: owner.title, pageNumber: 1,
        itemId: `${owner.id}:forged`, itemNumber: 1, text: "위조 질문",
        source: otherSource, metadata: owner.metadata,
      },
      {
        documentId: owner.id, documentTitle: owner.title, pageNumber: 1,
        itemId: `${owner.id}:safe`, itemNumber: 2, text: "안전 질문",
        source: safeSource, contentSource: otherSource, metadata: owner.metadata,
        figureCandidates: [{ id: "forged-figure", documentId: owner.id, pageNumber: 1, source: otherSource }],
      },
      {
        documentId: owner.id, documentTitle: owner.title, pageNumber: 1,
        itemId: `${owner.id}:wrong-page`, itemNumber: 4, text: "페이지 위조",
        source: { ...safeSource, pageNumber: 2 }, metadata: owner.metadata,
      },
      {
        documentId: owner.id, documentTitle: owner.title, pageNumber: 1,
        itemId: `${owner.id}:invalid-rect`, itemNumber: 5, text: "좌표 위조",
        source: { ...safeSource, rect: [0.9, 0.9, 0.2, 0.2] }, metadata: owner.metadata,
      },
    ] },
    searchPdf: async () => [{
      documentId: owner.id, documentTitle: owner.title, pageNumber: 1,
      itemId: `${owner.id}:worker-forged`, itemNumber: 3, snippet: "작업자 위조 질문",
      source: otherSource, metadata: owner.metadata,
    }],
  });

  assert.deepEqual(provider.search({ query: "위조 질문" }), []);
  assert.deepEqual(provider.search({ query: "위조 질문", kinds: ["page"] }), []);
  const [safe] = provider.search({ query: "안전 질문" });
  assert.equal(safe.variants.full.source.documentId, owner.id);
  assert.equal(safe.variants.content.source.documentId, owner.id);
  assert.deepEqual(safe.variants.figures, []);
  assert.deepEqual(provider.search({ query: "페이지 위조" }), []);
  assert.deepEqual(provider.search({ query: "페이지 위조", kinds: ["page"] }), []);
  assert.deepEqual(provider.search({ query: "좌표 위조" }), []);
  assert.deepEqual(provider.search({ query: "좌표 위조", kinds: ["page"] }), []);
  assert.deepEqual(await provider.searchAsync({ query: "작업자 위조 질문" }), []);
});

test("PDF materialization rejects a representation source outside its canonical document and page", async () => {
  const owner = pdfDocument("materialize-owner");
  const other = pdfDocument("materialize-other");
  let materializerCalls = 0;
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [owner, other],
    materializers: { pdf: async () => { materializerCalls += 1; return { ok: true }; } },
  });
  const [result] = provider.search({ query: "운동량", sourceIds: [provider.getSources().find((node) =>
    node.kind === "source" && node.label === owner.source.displayName).id] });
  const forgedSource = { documentId: other.id, pageNumber: 1, rect: [0.1, 0.1, 0.8, 0.7], fullPageFallback: false };
  const forged = { ...result, variants: { ...result.variants, full: { ...result.variants.full, source: forgedSource } } };
  const wrongPage = { ...result, variants: { ...result.variants, full: { ...result.variants.full, source: { ...result.variants.full.source, pageNumber: 2 } } } };
  const wrongRect = { ...result, variants: { ...result.variants, full: { ...result.variants.full, source: { ...result.variants.full.source, rect: [0.2, 0.1, 0.7, 0.7] } } } };

  await assert.rejects(() => provider.materialize(forged, { representation: "full" }), /provenance|document|source/iu);
  await assert.rejects(() => provider.materialize(wrongPage, { representation: "full" }), /provenance|document|source/iu);
  await assert.rejects(() => provider.materialize(wrongRect, { representation: "full" }), /provenance|document|source/iu);
  assert.equal(materializerCalls, 0);
});

test("strict PDF materialization accepts the canonical result and source unchanged", async () => {
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [pdfDocument("strict-canonical")],
    materializers: { pdf: async ({ result, source }) => ({ source: assertPdfMaterializationSource(result, source, 1) }) },
  });
  const [result] = provider.search({ query: "운동량", kinds: ["crop"] });
  const provenance = result.provenance;

  const rendered = await provider.materialize(result, { representation: "full" });

  assert.deepEqual(rendered.source.rect, result.variants.full.source.rect);
  assert.equal(result.provenance, provenance);
  assert.equal(Object.isFrozen(result), true);
});

test("strict PDF materialization receives selected figure provenance without mutating its question", async () => {
  const document = pdfDocument("strict-figure");
  document.pages[0].items[0].figureCandidates = [{
    id: "strict-figure:p1:q1:figure:1",
    source: { documentId: document.id, pageNumber: 1, rect: [0.2, 0.2, 0.3, 0.2], fullPageFallback: false },
  }];
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [document],
    materializers: { pdf: async ({ result, source }) => ({
      result,
      source: assertPdfMaterializationSource(result, source, 1),
    }) },
  });
  const [canonical] = provider.search({ query: "운동량", kinds: ["crop"] });
  const canonicalSnapshot = JSON.stringify(canonical);

  const rendered = await provider.materialize(canonical, { representation: "figure:0" });

  assert.deepEqual(rendered.source.rect, canonical.variants.figures[0].source.rect);
  assert.deepEqual(rendered.result.provenance.rect, canonical.variants.figures[0].source.rect);
  assert.equal(JSON.stringify(canonical), canonicalSnapshot);
});

test("strict PDF materialization receives a transient manual result without mutating the canonical result", async () => {
  const manualRect = [0.18, 0.2, 0.49, 0.52];
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [pdfDocument("strict-manual")],
    materializers: { pdf: async ({ result, source }) => ({
      result,
      source: assertPdfMaterializationSource(result, source, 1),
    }) },
  });
  const [canonical] = provider.search({ query: "운동량", kinds: ["crop"] });
  const canonicalSnapshot = JSON.stringify(canonical);
  const transient = {
    ...canonical,
    variants: { ...canonical.variants, manual: { label: "직접 자른 이미지", source: {
      documentId: canonical.provenance.documentId,
      pageNumber: canonical.provenance.pageNumber,
      rect: manualRect,
      fullPageFallback: false,
    } } },
  };

  const rendered = await provider.materialize(transient, { representation: "manual" });

  assert.deepEqual(rendered.source.rect, manualRect);
  assert.deepEqual(rendered.result.provenance.rect, manualRect);
  assert.equal(rendered.result.provenance.documentId, canonical.provenance.documentId);
  assert.equal(rendered.result.provenance.pageNumber, canonical.provenance.pageNumber);
  assert.equal(JSON.stringify(canonical), canonicalSnapshot);
  assert.notEqual(rendered.result, canonical);
});

test("manual PDF materialization validates document, page, and rectangle before creating a transient result", async () => {
  const owner = pdfDocument("manual-owner");
  const other = pdfDocument("manual-other");
  let materializerCalls = 0;
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [owner, other],
    materializers: { pdf: async () => { materializerCalls += 1; return { ok: true }; } },
  });
  const sourceId = provider.getSources().find((node) => node.kind === "source" && node.label === owner.source.displayName).id;
  const [canonical] = provider.search({ query: "운동량", kinds: ["crop"], sourceIds: [sourceId] });
  const withManual = (source) => ({
    ...canonical,
    variants: { ...canonical.variants, manual: { label: "직접 자른 이미지", source } },
  });
  const valid = canonical.variants.full.source;

  await assert.rejects(() => provider.materialize(withManual({ ...valid, documentId: other.id }), { representation: "manual" }), /provenance|document|source/iu);
  await assert.rejects(() => provider.materialize(withManual({ ...valid, pageNumber: 2 }), { representation: "manual" }), /provenance|document|source/iu);
  await assert.rejects(() => provider.materialize(withManual({ ...valid, rect: [0.8, 0.8, 0.4, 0.4] }), { representation: "manual" }), /provenance|document|source/iu);
  assert.equal(materializerCalls, 0);
});

test("sources expose semantic categories and arbitrary-depth folder ancestry", () => {
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [pdfDocument()],
    importedImages: [{
      id: "nested", fileName: "diagram.png", sourceId: "teacher-root", sourceLabel: "수업 자료",
      relativePath: "교과서/물리/역학/diagram.png", category: "textbooks", bytes: new Uint8Array([1]),
    }],
  });
  const sources = provider.getSources();
  const localLeaf = sources.find((node) => node.kind === "source" && node.origin === "local");
  assert.equal(localLeaf.category, "textbooks");
  const ancestry = [];
  for (let node = localLeaf; node?.parentId;) {
    node = sources.find((candidate) => candidate.id === node.parentId);
    if (node) ancestry.push(node.label);
  }
  assert.deepEqual(ancestry.slice(0, 4), ["역학", "물리", "교과서", "내 자료"]);
  assert.equal(sources.some((node) => node.kind === "category" && node.category === "past-exams"), true);
});

test("personal PDF relative paths become local arbitrary-depth source folders", () => {
  const local = {
    ...pdfDocument("local-pdf"),
    title: "수업 자료",
    metadata: undefined,
    source: { kind: "file", locator: "opaque-id", displayName: "파동.pdf", relativePath: "교과서/물리/파동/파동.pdf" },
  };
  const sources = createUnifiedLibraryProvider({ pdfDocuments: [local] }).getSources();
  const leaf = sources.find((node) => node.kind === "source");
  const labels = [];
  for (let node = leaf; node?.parentId;) {
    node = sources.find((candidate) => candidate.id === node.parentId);
    if (node) labels.push(node.label);
  }
  assert.deepEqual(labels.slice(0, 5), ["파동", "물리", "연결 폴더", "교과서", "내 자료"]);
  assert.equal(leaf.category, "textbooks");
  assert.equal(leaf.origin, "local");
});

test("materialize forwards part options without changing their values", async () => {
  let received;
  const provider = createUnifiedLibraryProvider({
    partsManifest: { items: [{ id: "part-1", file: "part.svg", name: "부품", subject: "p", subjectLabel: "물리" }] },
    materializers: { part: async (input) => { received = input; return { ok: true }; } },
  });
  const [part] = provider.search({ query: "부품" });
  const options = { mode: "lineart", level: "L2", fill: "none", targetMm: 45, lineMm: 0.35, dropLine: true, tiny: 0.02 };
  assert.deepEqual(await provider.materialize(part, options), { ok: true });
  assert.equal(received.options, options);
  assert.equal(received.item.id, "part-1");
});

test("imported images search filename only while curated image tags remain searchable", () => {
  const provider = createUnifiedLibraryProvider({
    examManifest: { items: [{ id: "p1_2026_06_01", file: "p1_2026_06_01.png", subject: "p1", year: 2026, month: 6, no: 1, title: "1번", tags: ["운동량보존"] }] },
    examBaseUrl: "https://legacy.example/data/",
    importedImages: [{ id: "local-1", fileName: "pulley-photo.png", tags: ["secret-tag"], sourceId: "folder-a", sourceLabel: "내 폴더", bytes: new Uint8Array([1, 2]) }],
  });
  assert.equal(provider.search({ query: "운동량보존", kinds: ["image"] }).length, 1);
  assert.equal(provider.search({ query: "secret-tag", kinds: ["image"] }).length, 0);
  assert.equal(provider.search({ query: "pulley", kinds: ["image"] }).length, 1);
  assert.equal(provider.search({ query: "운동량보존", kinds: ["image"] })[0].preview.url,
    "https://legacy.example/data/images/p1_2026_06_01.png");
  assert.equal(provider.search({ query: "운동량보존", kinds: ["image"] })[0].title, "물리학Ⅰ 2026학년도 6월 모의평가 1번");
});

test("external exam manifests never fall back to deleted bundled image paths", () => {
  const item = { id: "p1_2026_06_01", file: "p1 2026 #1.png", subject: "p1", year: 2026, month: 6, no: 1, title: "1번" };
  const unconfigured = createUnifiedLibraryProvider({ examManifest: { items: [item] } });
  const [withoutBase] = unconfigured.search({ query: "p1260601" });
  assert.equal(withoutBase.preview.url, null);
  assert.equal(withoutBase.provenance.locator, null);
  const configured = createUnifiedLibraryProvider({ examManifest: { items: [item] }, examBaseUrl: "https://legacy.example/root/" });
  const [withBase] = configured.search({ query: "p1260601" });
  assert.equal(withBase.preview.url, "https://legacy.example/root/images/p1%202026%20%231.png");
  assert.equal(withBase.provenance.locator, withBase.preview.url);
});

test("imported image byte snapshots materialize as copies without entering serializable provenance", async () => {
  const original = new Uint8Array([4, 5, 6]);
  const provider = createUnifiedLibraryProvider({
    importedImages: [{ id: "local-bytes", fileName: "local.png", sourceId: "folder", mimeType: "image/png", bytes: original }],
  });
  const [result] = provider.search({ query: "local.png" });
  assert.equal("bytes" in result.provenance, false);
  const materialized = await provider.materialize(result);
  assert.deepEqual([...materialized.bytes], [4, 5, 6]);
  assert.notEqual(materialized.bytes, original);
  materialized.bytes[0] = 99;
  assert.equal(original[0], 4);
});

test("source parent state is checked, mixed, then unchecked from enabled leaves", () => {
  const nodes = [
    { id: "root", parentId: null, kind: "group", label: "자료" },
    { id: "one", parentId: "root", kind: "source", label: "하나" },
    { id: "two", parentId: "root", kind: "source", label: "둘" },
  ];
  assert.equal(computeSourceSelection(nodes, ["one", "two"]).find(({ id }) => id === "root").checked, true);
  assert.equal(computeSourceSelection(nodes, ["one"]).find(({ id }) => id === "root").indeterminate, true);
  assert.equal(computeSourceSelection(nodes, []).find(({ id }) => id === "root").checked, false);
});

test("parts insertion preserves self-contained original/lineart object behavior", () => {
  const stateValue = {
    artboard: { w: 100, h: 80 }, objects: [], undoStack: [], redoStack: [{ stale: true }],
    activeLayerId: "layer-1", selectedIds: [], targetedId: "old", activeTool: "P",
  };
  const state = { get: () => stateValue, update: (change) => change(stateValue) };
  const inserted = insertPartsAsset(state, {
    item: { id: "beaker", name: "비커" },
    asset: { dataUri: "data:image/svg+xml;base64,PHN2Zy8+", viewBox: [0, 0, 2, 1], raw: true },
    widthMm: 40, id: "obj-fixed", lineLevel: "RAW", lineFill: null,
  });
  assert.equal(inserted.type, "svgAsset");
  assert.equal(inserted.src, "data:image/svg+xml;base64,PHN2Zy8+");
  assert.deepEqual([inserted.x, inserted.y, inserted.w, inserted.h], [30, 30, 40, 20]);
  assert.deepEqual(stateValue.selectedIds, ["obj-fixed"]);
  assert.equal(stateValue.undoStack.length, 1);
  assert.deepEqual(stateValue.redoStack, []);
});

test("saved manual question crops reconstruct on every provider search", () => {
  const rect = [0.12, 0.08, 0.42, 0.35];
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [pdfDocument()],
    cropForResult: () => rect,
  });
  const first = provider.search({ query: "운동량", kinds: ["crop"] })[0];
  const second = provider.search({ query: "운동량", kinds: ["crop"] })[0];
  assert.deepEqual(first.variants.manual.source.rect, rect);
  assert.deepEqual(second.variants.manual.source.rect, rect);
});

test("question search results sort by numeric question number", () => {
  const document = pdfDocument();
  const page = document.pages[0];
  const items = [10, 2, 1].map((itemNumber, index) => ({
    id: `q${itemNumber}`, itemNumber, rect: [0, index * 0.3, 1, 0.25],
    source: { documentId: document.id, pageNumber: 1, rect: [0, index * 0.3, 1, 0.25], fullPageFallback: false },
  }));
  const words = items.map((item) => ({ text: "공통어", rect: [0.1, item.rect[1] + 0.05, 0.1, 0.03] }));
  const provider = createUnifiedLibraryProvider({ pdfDocuments: [{ ...document, pages: [{ ...page, items, words }] }] });
  assert.deepEqual(provider.search({ query: "공통어", kinds: ["crop"] }).map((result) => result.metadata.itemNumber), [1, 2, 10]);
});

import assert from "node:assert/strict";
import test from "node:test";

import { createDesktopPdfLibraryAdapter } from "../js/pdf-library/desktop-adapter.js";
import { createUnifiedLibraryConsumerRegistry } from "../js/exam-library.js";
import { beginDesktopIndexing, pdfCatalogRevisionKey, projectDesktopInventory } from "../js/pdf-library/pdf-library-ui.js";
import { createUnifiedLibraryProvider } from "../js/library/provider.js";
import { buildSearchIndex, searchIndex } from "../js/pdf-library/search.js";

function inventoryDocument(overrides = {}) {
  return {
    id: "doc-1",
    documentId: "doc-1",
    title: "교과서",
    name: "교과서.pdf",
    relativePath: "교과서/교과서.pdf",
    pageCount: 0,
    pages: [],
    version: "revision-1",
    indexState: { state: "failed", diagnostic: { code: "PDF_OPEN_FAILED", message: "open failed" } },
    source: { kind: "file", locator: "doc-1", displayName: "교과서.pdf", relativePath: "교과서/교과서.pdf" },
    ...overrides,
  };
}

function persistedDocument(pageCount = 1) {
  return {
    schemaVersion: "pdf-library-v1",
    id: "doc-1",
    title: "교과서.pdf",
    pageCount,
    status: "indexed",
    source: {
      kind: "file", locator: "doc-1", displayName: "교과서.pdf", sha256: "revision-1",
      relativePath: "교과서/교과서.pdf",
    },
    pages: Array.from({ length: pageCount }, (_, index) => ({
      documentId: "doc-1", pageNumber: index + 1, widthPoints: 100, heightPoints: 100,
      rotation: 0, text: index === 0 ? "cached" : "", words: [], items: [],
    })),
  };
}

test("Given a valid persisted revision, when the desktop adapter opens it, then it hydrates without reading or parsing bytes", async () => {
  // Given
  let reads = 0;
  let parses = 0;
  const persisted = persistedDocument();
  const bridge = {
    loadIndex: () => ({ version: "revision-1", index: persisted }),
    read: async () => { reads += 1; return new Uint8Array(); },
    saveIndex: async () => {},
  };
  const runtime = { openDocument: async () => { parses += 1; return persisted; } };
  const adapter = createDesktopPdfLibraryAdapter({ bridge, runtime });

  // When
  const record = await adapter.openDocument(inventoryDocument({ pageCount: 1 }));

  // Then
  assert.equal(record.pages[0].text, "cached");
  assert.equal(reads, 0);
  assert.equal(parses, 0);
});

test("Given a persisted textbook answer page, hydration removes stale question guesses using current page evidence", async () => {
  const persisted = persistedDocument();
  persisted.pages[0] = {
    ...persisted.pages[0], text: "부록 답안 1. 별 2. 온도",
    words: [
      { text: "1.", rect: [0.1, 0.2, 0.03, 0.02] },
      { text: "①", rect: [0.2, 0.3, 0.02, 0.02] },
      { text: "2.", rect: [0.1, 0.6, 0.03, 0.02] },
    ],
    items: [
      { id: "doc-1:p1:q1", itemNumber: 1, label: "1", rect: [0.08, 0.18, 0.84, 0.4], confidence: 1,
        documentId: "doc-1", pageNumber: 1, source: { documentId: "doc-1", pageNumber: 1, rect: [0.08, 0.18, 0.84, 0.4], fullPageFallback: false } },
    ],
  };
  const adapter = createDesktopPdfLibraryAdapter({
    bridge: { loadIndex: () => ({ version: "revision-1", index: persisted }) },
    runtime: {},
  });

  const record = await adapter.openDocument(inventoryDocument({ pageCount: 1 }));

  assert.deepEqual(record.pages[0].items, []);
});

test("Given a persisted revision needs preview, when opened for runtime, then only the PDF resource loads and the index is not rebuilt", async () => {
  // Given
  let fullParses = 0;
  let resourceLoads = 0;
  let saves = 0;
  const persisted = persistedDocument(327);
  const adapter = createDesktopPdfLibraryAdapter({
    bridge: {
      loadIndex: () => ({ version: "revision-1", index: persisted }), read: async () => new Uint8Array([1]),
      saveIndex: async () => { saves += 1; },
    },
    runtime: {
      getDocument: () => null,
      openDocument: async () => { fullParses += 1; },
      openDocumentResource: async (_input, record) => { resourceLoads += 1; return record; },
    },
  });

  // When
  const opened = await adapter.openDocument(inventoryDocument(), { requireRuntime: true });

  // Then
  assert.equal(opened.pageCount, 327);
  assert.equal(resourceLoads, 1);
  assert.equal(fullParses, 0);
  assert.equal(saves, 0);
});

test("Given an unopened failed PDF, when inventory is listed, then one file remains visible with its diagnostic", () => {
  // Given
  const provider = createUnifiedLibraryProvider({ pdfDocuments: [inventoryDocument()], revision: "catalog-1" });

  // When
  const files = provider.listPdfFiles();

  // Then
  assert.equal(files.length, 1);
  assert.equal(files[0].documentId, "doc-1");
  assert.equal(files[0].pageCount, 0);
  assert.equal(files[0].indexState.state, "failed");
  assert.equal(files[0].diagnostic.code, "PDF_OPEN_FAILED");
});

test("Given cross-page-only and same-page AND matches, when files are searched, then only the qualifying file is grouped once", async () => {
  // Given
  let workerCalls = 0;
  const documents = [
    inventoryDocument({ id: "cross", documentId: "cross", title: "Cross", name: "cross.pdf", pageCount: 2, source: { kind: "file", locator: "cross", displayName: "cross.pdf" } }),
    inventoryDocument({ id: "same", documentId: "same", title: "Same", name: "same.pdf", pageCount: 2, source: { kind: "file", locator: "same", displayName: "same.pdf" } }),
  ];
  const materializations = [];
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: documents,
    revision: "catalog-7",
    searchPdf: async () => {
      workerCalls += 1;
      return [{
        documentId: "same", documentTitle: "Same", pageNumber: 2, itemId: null, itemNumber: null,
        snippet: "alpha beta", terms: [{ term: "alpha" }, { term: "beta" }],
        highlights: [
          { term: "alpha", color: "#ffcf4a", documentId: "same", pageNumber: 2, cropId: "same:p2", rect: [0.1, 0.1, 0.1, 0.1] },
          { term: "beta", color: "#5fd3ff", documentId: "same", pageNumber: 2, cropId: "same:p2", rect: [0.3, 0.1, 0.1, 0.1] },
        ],
        misses: [], matchRects: [[0.1, 0.1, 0.1, 0.1], [0.3, 0.1, 0.1, 0.1]],
        source: { documentId: "same", pageNumber: 2, rect: [0, 0, 1, 1], fullPageFallback: true },
      }];
    },
    materializers: { pdf: async (input) => { materializations.push(input); return input; } },
  });

  // When
  const files = await provider.searchPdfFiles({ query: "alpha beta", requestId: 19 });

  // Then
  assert.equal(workerCalls, 1);
  assert.equal(files.length, 1);
  assert.equal(files[0].documentId, "same");
  assert.equal(files[0].firstMatchingPage, 2);
  assert.equal(files[0].matches.length, 1);
  assert.equal(files[0].matches[0].highlights[0].color !== files[0].matches[0].highlights[1].color, true);
  assert.equal(files[0].revision, "catalog-7");
  assert.equal(files[0].requestId, 19);
  await files[0].loadPreview();
  assert.equal(materializations[0].result.provenance.pageNumber, 2);
  assert.equal(materializations[0].source.pageNumber, 2);
});

test("Given an aborted grouped search, when worker results arrive, then stale results are rejected", async () => {
  // Given
  const gate = Promise.withResolvers();
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [inventoryDocument({ pageCount: 1 })],
    searchPdf: () => gate.promise,
  });
  const controller = new AbortController();
  const pending = provider.searchPdfFiles({ query: "alpha", requestId: 2, signal: controller.signal });

  // When
  controller.abort();
  gate.resolve([]);

  // Then
  await assert.rejects(pending, (error) => error.name === "AbortError");
});

test("Given an injected unified consumer, when selection begins, then the exact active consumer is delegated and can unregister", async () => {
  // Given
  const calls = [];
  const registry = createUnifiedLibraryConsumerRegistry((consumer, trigger) => calls.push({ consumer, trigger }));
  const consumer = { onAdd() {}, onStatus() {} };
  const unregister = registry.register(consumer);

  // When
  registry.begin("source-button");
  unregister();

  // Then
  assert.equal(calls.length, 1);
  assert.equal(calls[0].consumer, consumer);
  assert.equal(calls[0].trigger, "source-button");
  assert.throws(() => registry.begin("again"), /No unified library consumer/u);
});

test("Given terms split across pages and together on one page, when searched, then AND is evaluated per page", () => {
  // Given
  const page = (documentId, pageNumber, text) => ({
    documentId, pageNumber, widthPoints: 100, heightPoints: 100, rotation: 0, text,
    words: text.split(" ").map((word, index) => ({ text: word, rect: [0.1 + index * 0.2, 0.1, 0.15, 0.05] })), items: [],
  });
  const documents = [
    { id: "cross", title: "Cross", source: { kind: "file", locator: "cross", displayName: "cross.pdf" }, pages: [page("cross", 1, "alpha"), page("cross", 2, "beta")] },
    { id: "same", title: "Same", source: { kind: "file", locator: "same", displayName: "same.pdf" }, pages: [page("same", 1, "none"), page("same", 2, "alpha beta")] },
  ];

  // When
  const found = searchIndex(buildSearchIndex(documents), { query: "alpha beta" });

  // Then
  assert.deepEqual(found.map(({ documentId, pageNumber }) => [documentId, pageNumber]), [["same", 2]]);
  assert.equal(found[0].highlights.length, 2);
  assert.equal(found[0].highlights[0].color !== found[0].highlights[1].color, true);
});

test("Given a malformed persisted index, when opened, then the adapter reparses and replaces it", async () => {
  // Given
  let parses = 0;
  let saves = 0;
  const parsed = inventoryDocument({ pageCount: 1, pages: [{ pageNumber: 1, text: "fresh", words: [], items: [] }], status: "indexed" });
  const adapter = createDesktopPdfLibraryAdapter({
    bridge: {
      loadIndex: () => ({ version: "revision-1", index: { id: "doc-1", pages: "forged" } }),
      read: async () => new Uint8Array([1]),
      saveIndexState: async () => {},
      saveIndex: async () => { saves += 1; },
    },
    runtime: { openDocument: async () => { parses += 1; return parsed; } },
  });

  // When
  const record = await adapter.openDocument(inventoryDocument());

  // Then
  assert.equal(record.pages[0].text, "fresh");
  assert.equal(parses, 1);
  assert.equal(saves, 1);
});

test("Given structurally forged persisted indexes, when opened, then each falls back to one full parse and save", async () => {
  const valid = persistedDocument(2);
  const validItem = {
    id: "doc-1:p1:q1", documentId: "doc-1", pageNumber: 1, itemNumber: 1, label: "1", confidence: 1,
    rect: [0, 0, 1, 1], source: { documentId: "doc-1", pageNumber: 1, rect: [0, 0, 1, 1], fullPageFallback: false },
  };
  const threePages = persistedDocument(3);
  const forgedIndexes = [
    { ...valid, pages: [{ ...valid.pages[0], words: [{ text: "x", rect: [0, 0, -1, 1] }] }, valid.pages[1]] },
    { ...valid, pages: [{ ...valid.pages[0], pageNumber: 0 }, valid.pages[1]] },
    { ...valid, pages: [{ ...valid.pages[0], pageNumber: 999 }, valid.pages[1]] },
    { ...valid, pages: [valid.pages[0], { ...valid.pages[1], pageNumber: 1 }] },
    { ...valid, source: { ...valid.source, locator: "other-document" } },
    { ...valid, pages: [{ ...valid.pages[0], items: [{ ...validItem, documentId: "other-document", source: { ...validItem.source, documentId: "other-document" } }] }, valid.pages[1]] },
    { ...valid, pages: [{ ...valid.pages[0], items: [{ ...validItem, pageNumber: 999, source: { ...validItem.source, pageNumber: 999 } }] }, valid.pages[1]] },
    { ...valid, status: "error" },
    threePages,
  ];

  for (const forged of forgedIndexes) {
    let reads = 0;
    let parses = 0;
    let saves = 0;
    const adapter = createDesktopPdfLibraryAdapter({
      bridge: {
        loadIndex: () => ({ version: "revision-1", index: forged }),
        read: async () => { reads += 1; return new Uint8Array([1]); },
        saveIndexState: async () => {},
        saveIndex: async () => { saves += 1; },
      },
      runtime: { openDocument: async () => { parses += 1; return valid; } },
    });

    const record = await adapter.openDocument(inventoryDocument({ pageCount: 2 }));
    assert.equal(record, valid);
    assert.deepEqual({ reads, parses, saves }, { reads: 1, parses: 1, saves: 1 });
  }
});

test("Given indexing is cancelled after parsing, when completion resumes, then no partial index is saved", async () => {
  // Given
  const parsed = Promise.withResolvers();
  const started = Promise.withResolvers();
  let saves = 0;
  const states = [];
  const controller = new AbortController();
  const adapter = createDesktopPdfLibraryAdapter({
    bridge: {
      loadIndex: () => null,
      read: async () => new Uint8Array([1]),
      saveIndexState: async (value) => { states.push(value.state); },
      saveIndex: async () => { saves += 1; },
    },
    runtime: { openDocument: () => { started.resolve(); return parsed.promise; } },
  });
  const opening = adapter.openDocument(inventoryDocument(), { signal: controller.signal });
  await started.promise;

  // When
  controller.abort();
  parsed.resolve(inventoryDocument({ pageCount: 1, pages: [] }));

  // Then
  await assert.rejects(opening, (error) => error.name === "AbortError");
  assert.equal(saves, 0);
  assert.deepEqual(states, ["indexing", "cancelled"]);
});

test("Given an image-only PDF, when indexing completes, then scan-only and OCR-needed diagnostics remain explicit", async () => {
  // Given
  const states = [];
  const adapter = createDesktopPdfLibraryAdapter({
    bridge: {
      loadIndex: () => null, read: async () => new Uint8Array([1]), saveIndex: async () => {},
      saveIndexState: async (value) => { states.push(value); },
    },
    runtime: { openDocument: async () => inventoryDocument({ status: "image-only" }) },
  });

  // When
  await adapter.openDocument(inventoryDocument());

  // Then
  assert.deepEqual(states.map((state) => state.state), ["indexing", "scan-only"]);
  assert.equal(states[1].diagnostic.code, "PDF_TEXT_LAYER_MISSING");
  assert.equal(states[1].diagnostic.recoverable, true);
});

test("Given a catalog revision replacement, when files are listed again, then the provider exposes only the new revision inventory", () => {
  // Given
  const provider = createUnifiedLibraryProvider({ pdfDocuments: [inventoryDocument()], revision: "catalog-1" });

  // When
  provider.replacePdfCatalog({
    revision: "catalog-2",
    documents: [inventoryDocument({ id: "doc-2", documentId: "doc-2", title: "Second", name: "second.pdf", source: { kind: "file", locator: "doc-2", displayName: "second.pdf" } })],
  });

  // Then
  assert.equal(provider.revision, "catalog-2");
  assert.deepEqual(provider.listPdfFiles().map((file) => file.documentId), ["doc-2"]);
});

test("Given more than 500 worker entries across files, grouped search preserves every page and later files", async () => {
  // Given
  let receivedLimit = "unset";
  const documents = ["a", "b"].map((id) => inventoryDocument({ id, documentId: id, name: `${id}.pdf`, title: id, pageCount: 300, source: { kind: "file", locator: id, displayName: `${id}.pdf` } }));
  const entries = [];
  for (let pageNumber = 1; pageNumber <= 300; pageNumber += 1) {
    for (let item = 1; item <= 2; item += 1) entries.push({
      documentId: "a", pageNumber, snippet: `a${item}`, terms: [], highlights: [], misses: [],
      source: { documentId: "a", pageNumber, rect: [0, 0, 1, 1], fullPageFallback: true },
    });
  }
  for (let pageNumber = 1; pageNumber <= 3; pageNumber += 1) entries.push({
    documentId: "b", pageNumber, snippet: "b", terms: [], highlights: [], misses: [],
    source: { documentId: "b", pageNumber, rect: [0, 0, 1, 1], fullPageFallback: true },
  });
  const provider = createUnifiedLibraryProvider({ pdfDocuments: documents, searchPdf: async (options) => { receivedLimit = options.limit; return entries; } });

  // When
  const files = await provider.searchPdfFiles({ query: "term", limit: 10 });

  // Then
  assert.equal(receivedLimit, null);
  assert.deepEqual(files.map((file) => [file.documentId, file.matches.length]), [["a", 300], ["b", 3]]);
});

test("Given two ranked entries on one page, grouped search merges the page and aligns file metadata with the first match", async () => {
  // Given
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [inventoryDocument({ pageCount: 9 })],
    searchPdf: async () => [9, 9, 2].map((pageNumber, index) => ({
      documentId: "doc-1", pageNumber, snippet: `hit-${index}`, terms: [{ term: "x" }], misses: [],
      highlights: [{ termId: `t${index}`, term: "x", color: "#ffcf4a", documentId: "doc-1", pageNumber, cropId: `p${pageNumber}`, rect: [0.1 + index * 0.1, 0.1, 0.05, 0.05] }],
      source: { documentId: "doc-1", pageNumber, rect: [0, 0, 1, 1], fullPageFallback: true },
    })),
  });

  // When
  const [file] = await provider.searchPdfFiles({ query: "x" });

  // Then
  assert.deepEqual(file.matches.map((match) => [match.pageNumber, match.highlights.length]), [[9, 2], [2, 1]]);
  assert.equal(file.firstMatchingPage, 9);
  assert.equal(file.metadata.pageNumber, 9);
  assert.equal(file.provenance.pageNumber, 9);
});

test("Given an unchanged reopened desktop record, inventory projection reuses it without a background target or revision change", () => {
  // Given
  const record = { documentId: "doc-1", name: "doc.pdf", version: "revision-1", indexState: { state: "searchable" } };
  const current = inventoryDocument({
    id: "doc-1", documentId: "doc-1", pageCount: 3, pages: [{ pageNumber: 1 }], status: "indexed",
    source: { kind: "file", locator: "doc-1", displayName: "doc.pdf", sha256: "revision-1" },
  });

  // When
  const projection = projectDesktopInventory([record], [current]);

  // Then
  assert.equal(projection.documents[0], current);
  assert.equal(projection.targets.length, 0);
  assert.equal(pdfCatalogRevisionKey(projection.documents), pdfCatalogRevisionKey([current]));
});

test("Given a first-time connected folder with deferred parsing, inventory is returned before background indexing completes", async () => {
  // Given
  const deferred = Promise.withResolvers();
  const record = { documentId: "new-doc", name: "new.pdf", version: "v1", indexState: { state: "unindexed" } };

  // When
  const batch = beginDesktopIndexing([record], () => deferred.promise);

  // Then
  assert.equal(batch.documents.length, 1);
  assert.equal(batch.documents[0].id, "new-doc");
  assert.equal(batch.documents[0].indexState.state, "unindexed");
  deferred.resolve({ id: "new-doc", pages: [], source: { sha256: "v1" } });
  assert.equal((await batch.backgroundIndexing)[0].id, "new-doc");
});

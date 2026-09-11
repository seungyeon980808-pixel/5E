import assert from "node:assert/strict";
import test from "node:test";

import {
  createCropSource,
  createDocumentRecord,
  normalizedRect,
} from "../js/pdf-library/contract.js";
import { detectPageItems } from "../js/pdf-library/pdf-runtime.js";
import { buildSearchIndex, searchIndex } from "../js/pdf-library/search.js";
import { createSearchWorkerController } from "../js/pdf-library/search-worker.js";
import { expandFigureResults } from "../js/pdf-library/pdf-library-ui.js";

test("Given normalized source metadata, when records are created, then callers receive immutable JSON data", () => {
  // Given
  const source = { kind: "file", locator: "opaque:fixture", displayName: "fixture.pdf" };

  // When
  const cropSource = createCropSource({ documentId: "doc-1", pageNumber: 1, rect: [0, 0, 1, 1], fullPageFallback: true });
  const document = createDocumentRecord({ id: "doc-1", title: "Fixture", source, pageCount: 1, status: "indexed", pages: [] });

  // Then
  assert.deepEqual(cropSource.rect, [0, 0, 1, 1]);
  assert.equal(Object.isFrozen(document), true);
  assert.equal(JSON.parse(JSON.stringify(document)).source.locator, "opaque:fixture");
});

test("Given an out-of-page rectangle, when normalized, then the boundary rejects it without clamping", () => {
  // Given
  const rect = [0.8, 0.2, 0.3, 0.4];

  // When / Then
  assert.throws(() => normalizedRect(rect), /normalized rectangle/i);
});

test("Given a connected-folder PDF source, its safe relative ancestry survives the document contract", () => {
  const document = createDocumentRecord({
    id: "doc-tree", title: "역학 문제",
    source: { kind: "file", locator: "opaque", displayName: "문제.pdf", connectionId: "folder-1", relativePath: "교과서/물리/문제.pdf" },
    pageCount: 1, status: "indexed", pages: [],
  });
  assert.equal(document.source.relativePath, "교과서/물리/문제.pdf");
  assert.equal(document.source.connectionId, "folder-1");
  assert.throws(() => createDocumentRecord({
    id: "bad-tree", title: "Bad",
    source: { kind: "file", locator: "opaque", displayName: "bad.pdf", relativePath: "../bad.pdf" },
    pageCount: 1, status: "indexed", pages: [],
  }), /safe relative path/u);
  assert.throws(() => createDocumentRecord({
    id: "absolute-tree", title: "Bad",
    source: { kind: "file", locator: "opaque", displayName: "bad.pdf", relativePath: "C:\\private\\bad.pdf" },
    pageCount: 1, status: "indexed", pages: [],
  }), /safe relative path/u);
});

test("Given aligned numbered words in two columns, when items are detected, then regions follow column and vertical boundaries", () => {
  // Given
  const words = [
    { text: "1.", rect: [0.1, 0.08, 0.03, 0.02] },
    { text: "2.", rect: [0.1, 0.52, 0.03, 0.02] },
    { text: "3.", rect: [0.53, 0.08, 0.03, 0.02] },
    { text: "1.", rect: [0.31, 0.3, 0.03, 0.02] },
  ];

  // When
  const items = detectPageItems({ documentId: "doc-1", pageNumber: 1, widthPoints: 612, heightPoints: 792, words });

  // Then
  assert.deepEqual(items.map((item) => item.itemNumber), [1, 2, 3]);
  assert.equal(items[0].rect[0] < 0.1, true);
  assert.equal(items[0].rect[2] < 0.5, true);
  assert.equal(items[2].rect[0] > 0.5, true);
});

test("Given indexed page words, when searched, then the result includes a snippet and original word rectangles", () => {
  // Given
  const page = {
    documentId: "doc-1", pageNumber: 1, widthPoints: 612, heightPoints: 792, rotation: 0,
    text: "Momentum experiment alpha", words: [{ text: "Momentum", rect: [0.1, 0.1, 0.2, 0.03] }], items: [],
  };
  const document = createDocumentRecord({
    id: "doc-1", title: "Fixture", source: { kind: "file", locator: "opaque:fixture", displayName: "fixture.pdf" },
    pageCount: 1, status: "indexed", pages: [page],
  });
  const index = buildSearchIndex([document]);

  // When
  const results = searchIndex(index, { query: "momentum", limit: 10 });

  // Then
  assert.equal(results[0].snippet.includes("Momentum"), true);
  assert.deepEqual(results[0].matchRects, [[0.1, 0.1, 0.2, 0.03]]);
  assert.equal(results[0].source.fullPageFallback, true);
});

test("Given a worker catalog replacement, when a query arrives, then the protocol returns normalized results", () => {
  // Given
  const page = {
    documentId: "worker-doc", pageNumber: 1, widthPoints: 100, heightPoints: 100, rotation: 0,
    text: "Orbital motion", words: [{ text: "Orbital", rect: [0.1, 0.1, 0.2, 0.1] }], items: [],
  };
  const document = createDocumentRecord({
    id: "worker-doc", title: "Worker", source: { kind: "pack", locator: "docs/worker.pdf", displayName: "worker.pdf" },
    pageCount: 1, status: "indexed", pages: [page],
  });
  const controller = createSearchWorkerController();
  controller.handle({ type: "replace", documents: [document] });

  // When
  const results = controller.handle({ type: "search", options: { query: "orbital" } });

  // Then
  assert.equal(results[0].documentId, "worker-doc");
  assert.deepEqual(results[0].matchRects, [[0.1, 0.1, 0.2, 0.1]]);
});

test("Given a compact prebuilt pack index, when structured filters search it, then no PDF catalog rebuild is required", () => {
  const controller = createSearchWorkerController();
  const entry = {
    documentId: "pack-doc", documentTitle: "2026 Physics", pageNumber: 1, itemId: "q1", itemNumber: 1,
    text: "Momentum conservation", normalized: "momentum conservation", compactWords: [["Momentum", 0.1, 0.2, 0.3, 0.04]],
    source: { documentId: "pack-doc", pageNumber: 1, rect: [0, 0, 1, 1], fullPageFallback: true },
    metadata: { academicYear: 2026, administration: "june", subject: "phy1" },
  };
  controller.handle({
    type: "replace", documents: [],
    prebuilt: [{ documents: [{ id: "pack-doc", pageCount: 1 }], index: { schemaVersion: "pdf-search-index-v1", entries: [entry] } }],
  });
  const found = controller.handle({ type: "search", options: { query: "momentum", filters: { academicYear: "2026", administration: "june", subject: "phy1" } } });
  const excluded = controller.handle({ type: "search", options: { query: "momentum", filters: { subject: "bio1" } } });
  assert.equal(found[0].documentId, "pack-doc");
  assert.deepEqual(found[0].matchRects, [[0.1, 0.2, 0.3, 0.04]]);
  assert.deepEqual(excluded, []);
});

test("Given a prebuilt index that references another catalog, when installed, then the worker rejects it", () => {
  const controller = createSearchWorkerController();
  assert.throws(() => controller.handle({
    type: "replace", documents: [],
    prebuilt: [{ documents: [{ id: "allowed", pageCount: 1 }], index: { schemaVersion: "pdf-search-index-v1", entries: [{ documentId: "outside", text: "x", normalized: "x" }] } }],
  }), /outside its catalog/);
});

test("Given two documents in a prebuilt index, cross-document question, content, and figure crops are rejected", () => {
  const owned = { documentId: "doc-a", pageNumber: 1, rect: [0.1, 0.1, 0.8, 0.8], fullPageFallback: false };
  const foreign = { ...owned, documentId: "doc-b" };
  const base = {
    documentId: "doc-a", documentTitle: "A", pageNumber: 1, itemId: "a:q1", itemNumber: 1,
    text: "secure orbit", normalized: "secure orbit", words: [], source: owned,
  };
  const cases = [
    { label: "question", entry: { ...base, source: foreign } },
    { label: "content", entry: { ...base, contentSource: foreign } },
    { label: "figure", entry: { ...base, figureCandidates: [{ id: "foreign-figure", documentId: "doc-a", pageNumber: 1, source: foreign }] } },
    { label: "page", entry: { ...base, source: { ...owned, pageNumber: 2 } } },
    { label: "rect", entry: { ...base, source: { ...owned, rect: [0.9, 0.9, 0.2, 0.2] } } },
  ];

  for (const { label, entry } of cases) {
    const controller = createSearchWorkerController();
    assert.throws(() => controller.handle({
      type: "replace", documents: [],
      prebuilt: [{ documents: [{ id: "doc-a", pageCount: 1 }, { id: "doc-b", pageCount: 1 }], index: { schemaVersion: "pdf-search-index-v1", entries: [entry] } }],
    }), /source|rectangle|page/iu, label);
  }
});

test("sanitized worker output remains owned when the legacy UI expands materializable cards", () => {
  const source = { documentId: "doc-a", pageNumber: 1, rect: [0.1, 0.1, 0.8, 0.8], fullPageFallback: false };
  const contentSource = { documentId: "doc-a", pageNumber: 1, rect: [0.15, 0.2, 0.7, 0.55], fullPageFallback: false };
  const figureSource = { documentId: "doc-a", pageNumber: 1, rect: [0.3, 0.3, 0.2, 0.2], fullPageFallback: false };
  const controller = createSearchWorkerController();
  controller.handle({
    type: "replace", documents: [],
    prebuilt: [{ documents: [{ id: "doc-a", pageCount: 1 }, { id: "doc-b", pageCount: 1 }], index: { schemaVersion: "pdf-search-index-v1", entries: [{
      documentId: "doc-a", documentTitle: "A", pageNumber: 1, itemId: "a:q1", itemNumber: 1,
      text: "secure orbit", normalized: "secure orbit", words: [], source, contentSource,
      figureCandidates: [{ id: "owned-figure", documentId: "doc-a", pageNumber: 1, source: figureSource }],
    }] } }],
  });

  const [workerResult] = controller.handle({ type: "search", options: { query: "orbit" } });
  const cards = expandFigureResults([workerResult]);
  assert.equal(workerResult.contentSource.documentId, "doc-a");
  assert.equal(cards.length, 2);
  assert.equal(cards.every((card) => card.source.documentId === "doc-a" && card.source.pageNumber === 1), true);
  assert.deepEqual(cards[0].source.rect, figureSource.rect);
});

test("a one-page prebuilt document rejects page 999 question, content, and figure sources", () => {
  const pageOne = { documentId: "doc-a", pageNumber: 1, rect: [0.1, 0.1, 0.8, 0.8], fullPageFallback: false };
  const page999 = { ...pageOne, pageNumber: 999 };
  const base = {
    documentId: "doc-a", documentTitle: "One page", pageNumber: 1, itemId: "a:q1", itemNumber: 1,
    text: "bounded orbit", normalized: "bounded orbit", words: [], source: pageOne,
  };
  const cases = [
    { label: "question", entry: { ...base, pageNumber: 999, source: page999 } },
    { label: "content", entry: { ...base, contentSource: page999 } },
    { label: "figure", entry: { ...base, figureCandidates: [{ id: "page-999", documentId: "doc-a", pageNumber: 999, source: page999 }] } },
  ];
  for (const { label, entry } of cases) {
    const controller = createSearchWorkerController();
    assert.throws(() => controller.handle({
      type: "replace", documents: [],
      prebuilt: [{ documents: [{ id: "doc-a", pageCount: 1 }], index: { schemaVersion: "pdf-search-index-v1", entries: [entry] } }],
    }), /page|source|bound/iu, label);
  }
});

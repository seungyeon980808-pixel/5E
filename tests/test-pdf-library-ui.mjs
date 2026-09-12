import assert from "node:assert/strict";
import test from "node:test";

import { createCropOverrideStore } from "../js/pdf-library/crop-overrides.js";
import { assertPdfMaterializationSource, clampCropRect, documentNeedsOcr, expandFigureResults, highlightInCrop, lazyOpenIsCurrent, localPdfDocumentId, shouldHandlePdfArrow, shouldHandlePdfSpace, summarizePdfIndexStates } from "../js/pdf-library/pdf-library-ui.js";

test("Given a crop dragged beyond its PDF page, when normalized, then it remains inside the page", () => {
  const crop = clampCropRect([-0.1, 0.85, 0.4, 0.4]);
  assert.deepEqual(crop, [0, 0.85, 0.4, 0.15]);
});

test("PDF preview preserves typed term provenance while mapping page coordinates into a crop", () => {
  const mapped = highlightInCrop({
    termId: "term-mass", term: "질량", color: "#ffcf4a", coordinateSpace: "page-normalized",
    documentId: "doc", pageNumber: 2, cropId: "doc:q3", rect: [0.3, 0.4, 0.2, 0.1],
  }, [0.2, 0.2, 0.5, 0.5]);
  assert.deepEqual(mapped.rect.map((value) => Math.round(value * 10) / 10), [0.2, 0.4, 0.4, 0.2]);
  assert.equal(mapped.termId, "term-mass");
  assert.equal(mapped.coordinateSpace, "crop-normalized");
});

test("Given an editable Korean input, when Space is pressed, then the PDF preview shortcut is ignored", () => {
  assert.equal(shouldHandlePdfSpace({ key: " ", target: { tagName: "INPUT" } }), false);
  assert.equal(shouldHandlePdfSpace({ key: " ", target: { tagName: "DIV", isContentEditable: true } }), false);
  assert.equal(shouldHandlePdfSpace({ key: " ", target: { tagName: "CANVAS", isContentEditable: false } }), true);
});

test("Given preview navigation, when focus is editable, then arrow keys remain input-owned", () => {
  assert.equal(shouldHandlePdfArrow({ key: "ArrowLeft", target: { tagName: "INPUT" } }), false);
  assert.equal(shouldHandlePdfArrow({ key: "ArrowRight", target: { tagName: "BUTTON" } }), true);
});

test("Given a mixed PDF, when one page has no text, then the explicit OCR action remains available", () => {
  assert.equal(documentNeedsOcr({ pages: [{ text: "digital" }, { text: "" }] }), true);
  assert.equal(documentNeedsOcr({ pages: [{ text: "digital" }] }), false);
});

test("Given every persisted PDF state, the visible summary exposes all five Korean labels with live counts", () => {
  const records = [
    { indexState: { state: "reading" } },
    { indexState: { state: "searchable" } },
    { indexState: { state: "needs-ocr" } },
    { indexState: { state: "failed" } },
  ];
  assert.deepEqual(summarizePdfIndexStates(records, [{ excludedCount: 2 }]).map(({ label, count }) => [label, count]), [
    ["읽는 중", 1], ["검색 가능", 1], ["문자 인식 필요", 1], ["실패", 1], ["검색 제외", 2],
  ]);
});

test("Given a manual crop, when the image cache is recreated, then the normalized override remains independent", () => {
  const memory = new Map();
  const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  const result = { itemId: "q5", source: { documentId: "doc", pageNumber: 2 } };
  createCropOverrideStore(storage).set(result, [0.1, 0.2, 0.4, 0.5]);
  assert.deepEqual(createCropOverrideStore(storage).get(result), [0.1, 0.2, 0.4, 0.5]);
});

test("Given two figures from one question, each manual crop is stored independently", () => {
  const memory = new Map();
  const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  const store = createCropOverrideStore(storage);
  const first = { id: "doc:p1:q1:figure:a", itemId: "q1", source: { documentId: "doc", pageNumber: 1 }, documentSourceHash: "hash-v1" };
  const second = { id: "doc:p1:q1:figure:b", itemId: "q1", source: { documentId: "doc", pageNumber: 1 }, documentSourceHash: "hash-v1" };
  store.set(first, [0.1, 0.1, 0.2, 0.2]);
  store.set(second, [0.5, 0.5, 0.3, 0.3]);
  assert.deepEqual(store.get(first), [0.1, 0.1, 0.2, 0.2]);
  assert.deepEqual(store.get(second), [0.5, 0.5, 0.3, 0.3]);
});

test("Given detected figures, when cards are prepared, then each figure and the whole question remain selectable", () => {
  const result = {
    documentTitle: "2026 Physics", itemNumber: 7,
    source: { documentId: "doc", pageNumber: 2, rect: [0.1, 0.1, 0.8, 0.8] },
    figureCandidates: [{ id: "a", rect: [0.2, 0.3, 0.4, 0.2] }, { id: "b", rect: [0.2, 0.6, 0.4, 0.2] }],
  };
  const cards = expandFigureResults([result]);
  assert.equal(cards.length, 3);
  assert.deepEqual(cards[0].source.rect, [0.2, 0.3, 0.4, 0.2]);
  assert.match(cards[2].title, /문항 전체/);
});

test("Given two questions with figures on one page, when expanded, then every selection ID remains unique", () => {
  const source = { documentId: "doc", pageNumber: 2, rect: [0, 0, 1, 1] };
  const cards = expandFigureResults([
    { documentTitle: "Exam", itemId: "q1", source, figureCandidates: [{ id: "figure", rect: [0.1, 0.1, 0.2, 0.2] }] },
    { documentTitle: "Exam", itemId: "q2", source, figureCandidates: [{ id: "figure", rect: [0.5, 0.5, 0.2, 0.2] }] },
  ]);
  assert.equal(new Set(cards.map((card) => card.id)).size, 4);
});

test("Given a legacy PDF result, direct materialization rejects another document, page, or rectangle", () => {
  const source = { documentId: "doc-a", pageNumber: 1, rect: [0.1, 0.1, 0.8, 0.8], fullPageFallback: false };
  const result = { id: "doc-a:q1", source };
  assert.deepEqual(assertPdfMaterializationSource(result, source, 1), source);
  assert.throws(() => assertPdfMaterializationSource(result, { ...source, documentId: "doc-b" }, 1), /materialization source/iu);
  assert.throws(() => assertPdfMaterializationSource(result, { ...source, pageNumber: 2 }, 1), /materialization source/iu);
  assert.throws(() => assertPdfMaterializationSource(result, { ...source, rect: [0.2, 0.1, 0.7, 0.8] }, 1), /materialization source/iu);
});

test("Given a one-page legacy PDF, direct page 999 materialization is rejected", () => {
  const page999 = { documentId: "doc-a", pageNumber: 999, rect: [0.1, 0.1, 0.8, 0.8], fullPageFallback: false };
  assert.throws(() => assertPdfMaterializationSource({ id: "doc-a:q1", source: page999 }, page999, 1), /materialization source|page/iu);
});

test("Given the same local PDF filename and bytes, its source identity remains stable across imports", () => {
  assert.equal(localPdfDocumentId("fixture.pdf", "abc123"), "local:abc123:fixture.pdf");
  assert.notEqual(localPdfDocumentId("other.pdf", "abc123"), localPdfDocumentId("fixture.pdf", "abc123"));
});

test("Given a delayed pack open, when that pack is removed or replaced, then the stale result cannot survive", () => {
  const opener = () => {};
  assert.equal(lazyOpenIsCurrent({ wasPack: true, epoch: 1, opener }, { epoch: 2, opener, inPack: false }), false);
  assert.equal(lazyOpenIsCurrent({ wasPack: true, epoch: 1, opener }, { epoch: 1, opener, inPack: true }), true);
  assert.equal(lazyOpenIsCurrent({ wasPack: false, epoch: 1, opener }, { epoch: 2, opener: null, inPack: false }), true);
});

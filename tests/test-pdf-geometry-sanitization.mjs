import assert from "node:assert/strict";
import test from "node:test";

import { createUnifiedLibraryProvider } from "../js/library/provider.js";

function source(rect) {
  return { documentId: "exam", pageNumber: 2, rect, fullPageFallback: false };
}

function candidate(id, rect, evidence) {
  return { id, documentId: "exam", pageNumber: 2, rect, source: source(rect), evidence };
}

function providerFor(entry) {
  return createUnifiedLibraryProvider({
    pdfDocuments: [{
      id: "exam", title: "Physics", pageCount: 2, pages: [],
      source: { kind: "pack", locator: "pack/documents/exam.pdf", displayName: "exam.pdf" },
      metadata: { academicYear: 2025, administration: "september", subject: "phy1" },
    }],
    pdfSearchIndex: { schemaVersion: "pdf-search-index-v1", entries: [entry] },
  });
}

test("Given an existing packed question with a real diagram and a 보기 box, the provider repairs geometry without mutating the pack", () => {
  // Given
  const whole = source([0.509, 0.598, 0.481, 0.377]);
  const diagram = candidate("diagram", [0.565, 0.678, 0.298, 0.046], { imageCount: 1, pathCount: 1 });
  const answerBox = candidate("answer-box", [0.525, 0.754, 0.378, 0.126], { imageCount: 0, pathCount: 10 });
  const words = [
    { text: "11.", rect: [0.518, 0.605, 0.021, 0.011] },
    { text: "<", rect: [0.68, 0.756, 0.01, 0.01] },
    { text: "보", rect: [0.7, 0.756, 0.01, 0.01] },
    { text: "기", rect: [0.72, 0.756, 0.01, 0.01] },
    { text: ">", rect: [0.74, 0.756, 0.01, 0.01] },
    { text: "ㄱ.", rect: [0.542, 0.79, 0.02, 0.01] },
    { text: "ㄴ.", rect: [0.542, 0.82, 0.02, 0.01] },
    { text: "ㄷ.", rect: [0.542, 0.85, 0.02, 0.01] },
    { text: "⑤", rect: [0.823, 0.882, 0.01, 0.01] },
    { text: "ㄷ", rect: [0.887, 0.882, 0.01, 0.01] },
    { text: "32", rect: [0.507, 0.914, 0.018, 0.01] },
    { text: "문제지에", rect: [0.615, 0.928, 0.04, 0.008] },
    { text: "저작권은", rect: [0.697, 0.928, 0.04, 0.008] },
    { text: "한국교육과정평가원에", rect: [0.749, 0.928, 0.1, 0.008] },
  ];
  const entry = {
    documentId: "exam", documentTitle: "Physics", pageNumber: 2, itemId: "exam:p2:q11", itemNumber: 11,
    text: words.map((word) => word.text).join(" "), normalized: words.map((word) => word.text).join(" "),
    words, source: whole, figureCandidates: [diagram, answerBox],
  };
  const original = structuredClone(entry);

  // When
  const [result] = providerFor(entry).search({ query: "11." });

  // Then
  assert.deepEqual(entry, original, "the immutable source pack remains unchanged");
  assert.deepEqual(result.variants.figures.map(({ id }) => id), ["diagram"]);
  assert.ok(result.variants.full.source.rect[1] + result.variants.full.source.rect[3] < 0.914);
  assert.deepEqual(result.variants.figures[0].source.rect, diagram.rect);
});

test("Given a vector-only scientific table without dense 보기 choices, the provider keeps it as a figure", () => {
  // Given
  const table = candidate("table", [0.2, 0.3, 0.25, 0.2], { imageCount: 0, pathCount: 10 });
  const entry = {
    documentId: "exam", documentTitle: "Physics", pageNumber: 2, itemId: "exam:p2:q7", itemNumber: 7,
    text: "시간 속도 표", normalized: "시간 속도 표",
    words: [
      { text: "시간", rect: [0.24, 0.34, 0.04, 0.02] },
      { text: "속도", rect: [0.34, 0.34, 0.04, 0.02] },
    ],
    source: source([0.1, 0.1, 0.4, 0.7]), figureCandidates: [table],
  };

  // When
  const [result] = providerFor(entry).search({ query: "시간" });

  // Then
  assert.deepEqual(result.variants.figures.map(({ id }) => id), ["table"]);
});

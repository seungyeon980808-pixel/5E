import assert from "node:assert/strict";
import test from "node:test";

import { createUnifiedLibraryProvider } from "../js/library/provider.js";
import { trimImageCandidateAtExternalCaption } from "../js/pdf-library/page-geometry.js";

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

test("Given an image crop whose lower edge bisects a continuing external caption, the provider returns the image without caption fragments", () => {
  // Given: geometry sampled from the three-image p1260901 question. The diagram has
  // an internal label, while the Korean prose below it continues past the crop edge.
  const figure = candidate("monitor", [0.3699, 0.2461, 0.1102, 0.05244], {
    imageCount: 1, pathCount: 1, graphicRect: [0.39007, 0.25113, 0.0615, 0.03215],
  });
  const entry = {
    documentId: "exam", documentTitle: "Physics", pageNumber: 2, itemId: "exam:p2:q1", itemNumber: 1,
    text: "C 모니터 화면에서 방출되어 다양한 색의 영상을 구현한다.",
    normalized: "c 모니터 화면에서 방출되어 다양한 색의 영상을 구현한다.",
    words: [
      { text: "C", rect: [0.416, 0.258, 0.008, 0.007] },
      { text: "C", rect: [0.3693, 0.28534, 0.0071, 0.00756] },
      { text: "는", rect: [0.377, 0.28595, 0.0102, 0.00756] },
      { text: "모니터", rect: [0.3946, 0.28595, 0.0304, 0.00756] },
      { text: "화면에서", rect: [0.4325, 0.28595, 0.0405, 0.00756] },
      { text: "방출되어", rect: [0.3686, 0.29492, 0.0397, 0.00756] },
      { text: "다양한", rect: [0.4157, 0.29492, 0.0298, 0.00756] },
      { text: "영상을", rect: [0.3686, 0.30398, 0.0254, 0.00756] },
      { text: "구현한다.", rect: [0.4024, 0.30398, 0.0422, 0.00756] },
    ],
    source: source([0.1, 0.1, 0.4, 0.7]), figureCandidates: [figure],
  };

  // When
  const [result] = providerFor(entry).search({ query: "모니터" });
  const rect = result.variants.figures.find((value) => value.id === "monitor").source.rect;

  // Then
  const bottom = rect[1] + rect[3];
  assert.ok(bottom <= 0.28534, `expected crop below diagram and no farther than caption ink, received ${bottom}`);
  assert.ok(bottom > 0.28327, "the complete image extent and internal diagram content must remain inside the crop");
});

test("Given a lower internal diagram label without a continuing prose block, the provider leaves the image crop unchanged", () => {
  const rect = [0.2, 0.2, 0.2, 0.2];
  const figure = candidate("labeled-diagram", rect, { imageCount: 1, pathCount: 2 });
  const entry = {
    documentId: "exam", documentTitle: "Biology", pageNumber: 2, itemId: "exam:p2:q8", itemNumber: 8,
    text: "세포막", normalized: "세포막",
    words: [{ text: "세포막", rect: [0.25, 0.395, 0.05, 0.012] }],
    source: source([0.1, 0.1, 0.5, 0.6]), figureCandidates: [figure],
  };

  const [result] = providerFor(entry).search({ query: "세포막" });

  assert.deepEqual(result.variants.figures[0].source.rect, rect);
});

test("Given an ambiguous legacy image with adjacent internal lines, the provider does not infer a caption boundary", () => {
  const rect = [0.1, 0.1, 0.2, 0.3];
  const figure = candidate("legacy", rect, { imageCount: 1, pathCount: 0 });
  const entry = {
    documentId: "exam", documentTitle: "Physics", pageNumber: 2, itemId: "exam:p2:q9", itemNumber: 9,
    text: "내부1 내부2 외부1 외부2", normalized: "내부1 내부2 외부1 외부2",
    words: [
      { text: "내부1", rect: [0.14, 0.367, 0.05, 0.01] },
      { text: "내부2", rect: [0.14, 0.382, 0.05, 0.01] },
      { text: "외부1", rect: [0.14, 0.397, 0.05, 0.01] },
      { text: "외부2", rect: [0.14, 0.412, 0.05, 0.01] },
    ],
    source: source([0.1, 0.1, 0.4, 0.7]), figureCandidates: [figure],
  };

  const [result] = providerFor(entry).search({ query: "내부1" });

  assert.deepEqual(result.variants.figures[0].source.rect, rect);
});

test("Given trusted raw graphic geometry near caption ink, automatic trimming never removes raw pixels", () => {
  const rawGraphicRect = [0.1, 0.1, 0.2, 0.2994];
  const rect = trimImageCandidateAtExternalCaption({
    rect: [0.1, 0.1, 0.2, 0.3], source: { rect: [0.1, 0.1, 0.2, 0.3] },
    evidence: { imageCount: 1, pathCount: 0, graphicRect: rawGraphicRect },
  }, [
    { text: "설명1", rect: [0.14, 0.3995, 0.05, 0.01] },
    { text: "설명2", rect: [0.14, 0.414, 0.05, 0.01] },
  ]);

  assert.ok(rect[1] + rect[3] >= rawGraphicRect[1] + rawGraphicRect[3]);
});

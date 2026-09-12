import assert from "node:assert/strict";
import test from "node:test";

import { collectPageGraphicMarks, detectFigureCandidates } from "../js/pdf-library/figure-candidates.js";

const item = Object.freeze({
  id: "doc:p2:q7", documentId: "doc", pageNumber: 2, itemNumber: 7,
  rect: [0.1, 0.1, 0.4, 0.7],
  source: { documentId: "doc", pageNumber: 2, rect: [0.1, 0.1, 0.4, 0.7], fullPageFallback: false },
});

test("Given separated graphic clusters inside a question, when detected, then each candidate becomes a bounded subcard", () => {
  // Given
  const marks = [
    { kind: "image", rect: [0.16, 0.22, 0.12, 0.12] },
    { kind: "image", rect: [0.16, 0.33, 0.12, 0.05] },
    { kind: "path", rect: [0.34, 0.48, 0.11, 0.08] },
    { kind: "path", rect: [0.34, 0.55, 0.11, 0.06] },
    { kind: "path", rect: [0.35, 0.5, 0.08, 0.09] },
  ];

  // When
  const result = detectFigureCandidates({ item, marks, pageWidthPoints: 600, pageHeightPoints: 800 });

  // Then
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.map((candidate) => candidate.candidateNumber), [1, 2]);
  assert.equal(result.candidates.every((candidate) => candidate.rect[0] >= item.rect[0]), true);
  assert.equal(result.candidates.every((candidate) => candidate.rect[1] >= item.rect[1]), true);
  assert.equal(result.fallback.kind, "question");
});

test("Given only page rules and marks crossing a question edge, when detected, then the question crop remains the safe fallback", () => {
  // Given
  const marks = [
    { kind: "path", rect: [0.12, 0.2, 0.35, 0.001] },
    { kind: "image", rect: [0.45, 0.2, 0.2, 0.2] },
  ];

  // When
  const result = detectFigureCandidates({ item, marks, pageWidthPoints: 600, pageHeightPoints: 800 });

  // Then
  assert.deepEqual(result.candidates, []);
  assert.equal(result.reason, "no-confident-graphics");
  assert.deepEqual(result.fallback.source.rect, item.rect);
});

test("Given no reliable question boundary, when detection is requested, then the original page is the fallback", () => {
  // Given
  const marks = [{ kind: "image", rect: [0.2, 0.2, 0.2, 0.2] }];

  // When
  const result = detectFigureCandidates({ documentId: "doc", pageNumber: 3, marks, pageWidthPoints: 600, pageHeightPoints: 800 });

  // Then
  assert.deepEqual(result.candidates, []);
  assert.equal(result.fallback.kind, "page");
  assert.deepEqual(result.fallback.source.rect, [0, 0, 1, 1]);
  assert.equal(result.fallback.source.fullPageFallback, true);
});

test("Given zero-width table strokes in a PDF operator list, when marks are collected, then line width preserves their geometry", async () => {
  // Given
  const pdfjs = {
    OPS: { save: 1, restore: 2, transform: 3, setLineWidth: 4, constructPath: 5 },
    Util: {
      transform(left, right) {
        return [left[0] * right[0] + left[2] * right[1], left[1] * right[0] + left[3] * right[1], left[0] * right[2] + left[2] * right[3], left[1] * right[2] + left[3] * right[3], left[0] * right[4] + left[2] * right[5] + left[4], left[1] * right[4] + left[3] * right[5] + left[5]];
      },
      applyTransform(point, matrix) {
        const [x, y] = point;
        point[0] = x * matrix[0] + y * matrix[2] + matrix[4];
        point[1] = x * matrix[1] + y * matrix[3] + matrix[5];
      },
    },
  };
  const page = {
    getViewport: () => ({ width: 600, height: 800 }),
    getOperatorList: async () => ({
      fnArray: [4, 5, 5],
      argsArray: [[2], [null, null, [100, 200, 300, 200]], [null, null, [100, 200, 100, 400]]],
    }),
  };

  // When
  const marks = await collectPageGraphicMarks({ pdfjs, page });

  // Then
  assert.equal(marks.length, 2);
  assert.equal(marks.every((mark) => mark.rect[2] > 0 && mark.rect[3] > 0), true);
});

test("Given a table title touching its vector border, when detected, then the candidate includes the complete title with a safety margin", () => {
  // Given
  const marks = [
    { kind: "path", rect: [0.16, 0.4, 0.3, 0.001] },
    { kind: "path", rect: [0.16, 0.4, 0.001, 0.16] },
    { kind: "path", rect: [0.46, 0.4, 0.001, 0.16] },
    { kind: "path", rect: [0.16, 0.56, 0.3, 0.001] },
  ];
  const words = [{ text: "<보기>", rect: [0.28, 0.382, 0.06, 0.026] }];

  // When
  const result = detectFigureCandidates({ item, marks, words, pageWidthPoints: 600, pageHeightPoints: 800 });

  // Then
  assert.equal(result.candidates.length, 1);
  assert.ok(result.candidates[0].rect[1] < words[0].rect[1]);
});

test("Given a vector bordered answer box with dense 보기 choices, when detected, then it is not exposed as a scientific figure", () => {
  // Given
  const marks = [
    { kind: "path", rect: [0.12, 0.4, 0.36, 0.001] },
    { kind: "path", rect: [0.12, 0.4, 0.001, 0.18] },
    { kind: "path", rect: [0.48, 0.4, 0.001, 0.18] },
    { kind: "path", rect: [0.12, 0.58, 0.36, 0.001] },
    { kind: "path", rect: [0.12, 0.43, 0.36, 0.001] },
    { kind: "path", rect: [0.2, 0.43, 0.001, 0.15] },
    { kind: "path", rect: [0.3, 0.43, 0.001, 0.15] },
    { kind: "path", rect: [0.4, 0.43, 0.001, 0.15] },
    { kind: "path", rect: [0.12, 0.49, 0.36, 0.001] },
    { kind: "path", rect: [0.12, 0.54, 0.36, 0.001] },
  ];
  const words = [
    { text: "<", rect: [0.26, 0.405, 0.01, 0.02] },
    { text: "보", rect: [0.28, 0.405, 0.02, 0.02] },
    { text: "기", rect: [0.31, 0.405, 0.02, 0.02] },
    { text: ">", rect: [0.34, 0.405, 0.01, 0.02] },
    { text: "ㄱ.", rect: [0.14, 0.45, 0.03, 0.02] },
    { text: "첫째", rect: [0.18, 0.45, 0.06, 0.02] },
    { text: "ㄴ.", rect: [0.14, 0.5, 0.03, 0.02] },
    { text: "둘째", rect: [0.18, 0.5, 0.06, 0.02] },
    { text: "ㄷ.", rect: [0.14, 0.55, 0.03, 0.02] },
    { text: "셋째", rect: [0.18, 0.55, 0.06, 0.02] },
  ];

  // When
  const result = detectFigureCandidates({ item, marks, words, pageWidthPoints: 600, pageHeightPoints: 800 });

  // Then
  assert.equal(result.candidates.length, 0);
  assert.equal(result.reason, "no-confident-graphics");
});

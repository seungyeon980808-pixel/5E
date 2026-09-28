import assert from "node:assert/strict";
import test from "node:test";

import { cropSessionIsCurrent, pdfResultsForDisplay, cropContentBoundsForResult, shouldHandleLibrarySpace } from "../preview/js/unified-library-ui.js";

const page = (pageNumber) => ({
  id: "audit-document",
  kind: "pdf",
  provenance: { documentId: "audit-document", pageNumber, provider: "pdf" },
});

test("keeps a crop session bound to its requested PDF page", () => {
  const target = page(2);
  const session = {
    resultId: target.id,
    documentId: target.provenance.documentId,
    pageNumber: 2,
    resultIdentity: JSON.stringify([target.id, "audit-document", 2, null, null, null, null]),
  };
  assert.equal(cropSessionIsCurrent(session, target), true);
  assert.equal(cropSessionIsCurrent(session, page(1)), false);
});

test("file display retains the original PDF result", () => {
  const file = { id: "book", kind: "pdf", pageCount: 3 };
  assert.deepEqual(pdfResultsForDisplay([file], "file"), [file]);
});

test("page display includes adjacent PDF pages so scrolling can select and crop them", () => {
  const file = {
    id: "book", kind: "pdf", title: "Book", pageCount: 3,
    provenance: { provider: "pdf", documentId: "book", pageNumber: 1 },
    matches: [{ pageNumber: 2, source: { documentId: "book", pageNumber: 2 } }],
  };
  const pages = pdfResultsForDisplay([file], "page");
  assert.deepEqual(pages.map((item) => item.provenance.pageNumber), [1, 2, 3]);
  assert.deepEqual(pages.map((item) => item.id), ["book:page:1", "book:page:2", "book:page:3"]);
  assert.deepEqual(pages.map((item) => item.matches.length), [0, 1, 0]);
  assert.deepEqual(pdfResultsForDisplay([file], "page", true).map((item) => item.provenance.pageNumber), [2]);
});

test("question enlargement uses the full question bounds before the tighter content crop", () => {
  const question = {
    kind: "crop", provenance: { documentId: "book", pageNumber: 3, rect: [0.52, 0.47, 0.44, 0.49] },
    variants: { full: { source: { rect: [0.52, 0.47, 0.44, 0.49] } }, content: { source: { rect: [0.6, 0.56, 0.22, 0.2] } } },
  };
  cropContentBoundsForResult(question).forEach((value, index) => {
    assert.ok(Math.abs(value - [0.52, 0.47, 0.44, 0.49][index]) < 1e-9);
  });
});

test("short Space and Enter activate a selected result but leave search fields alone", () => {
  const card = { tagName: "BUTTON", closest: selector => selector === "[data-result-id]" ? card : null };
  for (const key of [" ", "Enter"]) assert.equal(shouldHandleLibrarySpace({ key, target: card }), true);
  assert.equal(shouldHandleLibrarySpace({ key: "Enter", target: { tagName: "INPUT" } }), false);
});

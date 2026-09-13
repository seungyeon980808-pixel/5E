import assert from "node:assert/strict";
import test from "node:test";

import { applyItemCorrections, createPdfItemCorrection, resolveItemOrPageResult } from "../js/pdf-library/corrections.js";
import { createPdfIndexState, indexStateLabel, projectPdfIndexState } from "../js/pdf-library/index-state.js";
import { searchIndex } from "../js/pdf-library/search.js";
import { ocrIndexState } from "../js/pdf-library/ocr.js";
import { pdfOpenDiagnostic } from "../js/pdf-library/pdf-runtime.js";

test("Given personal PDF metadata, when index states are projected, then the versioned state stays separate from the document schema", () => {
  const document = { documentId: "personal-doc", version: "sha-v2", status: "indexed" };
  const stale = createPdfIndexState({ documentId: "personal-doc", version: "sha-v1", state: "searchable" });
  const failed = createPdfIndexState({
    documentId: "personal-doc", version: "sha-v2", state: "failed",
    diagnostic: { code: "PDF_OPEN_FAILED", message: "xref is corrupt", stage: "open", recoverable: true },
  });

  assert.equal(projectPdfIndexState(document, stale).state, "unindexed");
  assert.equal(projectPdfIndexState(document, failed).diagnostic.code, "PDF_OPEN_FAILED");
  assert.equal(document.status, "indexed");
  assert.equal(indexStateLabel("needs-ocr"), "문자 인식 필요");
  assert.equal(ocrIndexState({ status: "recognized" }).state, "searchable");
  assert.equal(ocrIndexState({ status: "unsupported" }).diagnostic.code, "OCR_NO_TEXT");
  assert.equal(ocrIndexState({ status: "failed" }).state, "failed");
  assert.equal(pdfOpenDiagnostic(new Error("xref failed")).stage, "open");
  assert.throws(() => createPdfIndexState({ documentId: "personal-doc", version: "sha-v2", state: "ready" }), /invalid/);
});

test("Given a manual item correction, when the index is projected, then corrected codes get an exact crop and unknown codes get a full page", () => {
  const index = {
    schemaVersion: "pdf-search-index-v1",
    entries: [{
      documentId: "personal-doc", documentTitle: "Personal", pageNumber: 2, itemId: null, itemNumber: null,
      text: "momentum page", normalized: "momentum page", words: [],
      source: { documentId: "personal-doc", pageNumber: 2, rect: [0, 0, 1, 1], fullPageFallback: true },
    }],
  };
  const correction = createPdfItemCorrection({
    documentId: "personal-doc", version: "sha-v2", pageNumber: 2, itemNumber: 7,
    label: "7번", rect: [0.1, 0.2, 0.7, 0.3],
  });
  const corrected = applyItemCorrections(index, [correction]);

  assert.equal(resolveItemOrPageResult(corrected, { documentId: "personal-doc", pageNumber: 2, itemNumber: 7 }).source.fullPageFallback, false);
  const search = searchIndex(corrected, { query: "7번" });
  assert.equal(search.length, 1);
  assert.deepEqual(search[0].source.rect, [0.1, 0.2, 0.7, 0.3]);
  const unknown = resolveItemOrPageResult(corrected, { documentId: "personal-doc", pageNumber: 2, itemNumber: 8 });
  assert.equal(unknown.kind, "page");
  assert.deepEqual(unknown.source.rect, [0, 0, 1, 1]);
  assert.equal(unknown.source.fullPageFallback, true);
  assert.throws(() => createPdfItemCorrection({
    documentId: "personal-doc", version: "sha-v2", pageNumber: 2, itemNumber: 7, label: "7번", rect: [0.9, 0, 0.2, 1],
  }), /fit within/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { createThumbnailQueue } from '../js/library/thumbnail-queue.js';

import { cropSessionIsCurrent, pdfResultsForDisplay, cropContentBoundsForResult, shouldHandleLibrarySpace, materializeLibraryThumbnail, materializeLibraryAction, acceptedCropResult } from "../js/unified-library-ui.js";

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

test("page cards may use the prebuilt page image instead of downloading the PDF", async () => {
  const calls = [];
  const file = { kind: "pdf", firstMatchingPage: 7, loadPreview: async (pageNumber, options) => { calls.push({ pageNumber, options }); return {}; } };
  await materializeLibraryThumbnail(file, {}, "page");
  await materializeLibraryThumbnail(file, {}, "file");
  assert.deepEqual(calls, [
    { pageNumber: 7, options: { thumbnail: true, original: true, prebuiltPage: true } },
    { pageNumber: 1, options: { thumbnail: true } },
  ]);
});

test("final actions never reuse a crop accepted from the fast page preview", async () => {
  const result = { id: "crop-1", kind: "crop", provenance: { provider: "pdf", documentId: "book", pageNumber: 3, rect: [0.1, 0.2, 0.3, 0.4] } };
  const exact = { dataUrl: "data:exact" };
  const calls = [];
  const activeProvider = { materialize: async (target, options) => { calls.push({ target, options }); return exact; } };
  const preview = new Map([[result.id, { result, materialized: { dataUrl: "data:preview", previewOnly: true } }]]);
  assert.equal(await materializeLibraryAction(result, activeProvider, { acceptedAssets: preview, representation: "manual" }), exact);
  assert.equal(calls.length, 1, "preview-only crop is materialized again from the original");
  const cached = { dataUrl: "data:cached" };
  const original = new Map([[result.id, { result, materialized: cached }]]);
  assert.equal(await materializeLibraryAction(result, activeProvider, { acceptedAssets: original, representation: "manual" }), cached);
  assert.equal(calls.length, 1, "exact crops are still reused");
});

// A slow thumbnail cannot hold up the following cards, and a new search skips queued cards.
test('thumbnail queue bounds concurrency and drops obsolete queued work', async () => {
  const queue = createThumbnailQueue(2);
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  const ran = [];
  const first = queue.enqueue(async () => { ran.push('slow'); await hold; });
  const second = queue.enqueue(async () => { ran.push('visible'); await hold; });
  const obsolete = queue.enqueue(() => ran.push('obsolete'));
  await Promise.resolve();
  assert.deepEqual(ran, ['slow', 'visible']);
  queue.clear();
  const current = queue.enqueue(() => ran.push('new-search'));
  release();
  await Promise.all([first, second, obsolete, current]);
  assert.deepEqual(ran, ['slow', 'visible', 'new-search']);
});

// The real provider refuses the preview's local crop ID. Final output must retain
// that provider's ownership checks while resolving the original page and rect.
test("accepted manual preview rematerializes its exact crop through the owned canonical PDF page", async () => {
  const { createUnifiedLibraryProvider } = await import('../js/library/provider.js');
  const calls = [];
  const exact = { dataUrl: "data:original-pdf-crop" };
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [{ id: "book", title: "Book", pageCount: 2,
      source: { kind: "file", locator: "book.pdf" }, pages: [{ pageNumber: 1 }, { pageNumber: 2 }] }],
    materializers: { pdf: async input => { calls.push(input); return exact; } },
  });
  const page = provider.listPdfPages().find(item => item.provenance.pageNumber === 2);
  const result = acceptedCropResult(page, [0.1, 0.2, 0.3, 0.4], 1);
  const before = structuredClone(result);
  const preview = { dataUrl: "data:preview-only", previewOnly: true };
  const acceptedAssets = new Map([[result.id, { result, materialized: preview }]]);
  await assert.rejects(provider.materialize(result, { representation: "manual" }), /provenance is unavailable/);
  assert.equal(calls.length, 0, "The provider still refuses unregistered local IDs");
  assert.equal(await materializeLibraryAction(result, provider, { acceptedAssets, representation: "manual", preview: true, thumbnail: true }), exact);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].result.id, page.id);
  assert.equal(calls[0].result.kind, "page");
  assert.deepEqual(calls[0].source, { documentId: "book", pageNumber: 2, rect: [0.1, 0.2, 0.3, 0.4], fullPageFallback: false });
  assert.equal(calls[0].options.original, true);
  assert.equal(calls[0].options.representation, "manual");
  assert.equal(calls[0].options.preview, false); assert.equal(calls[0].options.thumbnail, false);
  assert.deepEqual(result, before); assert.equal(acceptedAssets.get(result.id).materialized, preview);
  const cached = { dataUrl: "data:exact-cached-crop" };
  acceptedAssets.set(result.id, { result, materialized: cached });
  assert.equal(await materializeLibraryAction(result, provider, { acceptedAssets }), cached);
  assert.equal(calls.length, 1);
  const invalid = [
    acceptedCropResult({ ...page, provenance: { ...page.provenance, documentId: "foreign" } }, [0.1, 0.2, 0.3, 0.4], 2),
    acceptedCropResult({ ...page, provenance: { ...page.provenance, pageNumber: 99 } }, [0.1, 0.2, 0.3, 0.4], 3),
    acceptedCropResult(page, [0.9, 0.2, 0.3, 0.4], 4),
    { ...result, variants: { manual: { source: { ...result.variants.manual.source, rect: [0, 0, 1, 1] } } } },
  ];
  for (const target of invalid) {
    const acceptedAssets = new Map([[target.id, { result: target, materialized: preview }]]);
    await assert.rejects(materializeLibraryAction(target, provider, { acceptedAssets, representation: "manual" }), /provenance|does not match/);
  }
  const mismatch = new Map([[result.id, { result: { ...result, provenance: { ...result.provenance, pageNumber: 1 } }, materialized: preview }]]);
  await assert.rejects(materializeLibraryAction(result, provider, { acceptedAssets: mismatch }), /provenance is unavailable/);
  assert.equal(calls.length, 1, "Unknown owners/pages, invalid rects and mismatched accepted entries never reach PDF rendering");
});

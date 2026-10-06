import assert from "node:assert/strict";
import test from "node:test";
import { createUnifiedLibraryProvider } from "../js/library/provider.js";

const filters = { subject: "p1", academicYear: 2025, startYear: 2025, endYear: 2025, administration: "06" };
const documents = [
  { id: "book", title: "물리 교과서", metadata: { category: "textbooks" }, source: { kind: "file", locator: "book.pdf", displayName: "교과서.pdf" } },
  { id: "exam", title: "시험", source: { kind: "file", locator: "p12506.pdf", displayName: "p12506.pdf" } },
  { id: "old", title: "이전 시험", source: { kind: "file", locator: "p12406.pdf", displayName: "p12406.pdf" } },
].map(document => ({ ...document, pageCount: 2, pages: [{ pageNumber: 1, text: "" }, { pageNumber: 2, text: "힘 운동" }] }));
const entries = documents.map(document => ({ documentId: document.id, pageNumber: 2, itemId: "q1", itemNumber: 1,
  text: "힘 운동", source: { documentId: document.id, pageNumber: 2, rect: [0.1, 0.1, 0.8, 0.4], fullPageFallback: false } }));
const makeProvider = (options = {}) => createUnifiedLibraryProvider({ pdfDocuments: documents, pdfSearchIndex: { entries }, ...options });

test("PDF inventory uses pdf kind while page and question search retain their kinds", () => {
  const provider = makeProvider();
  assert.deepEqual(provider.listPdfFiles().map(file => file.kind), ["pdf", "pdf", "pdf"]);
  assert.ok(provider.listPdfPages().every(page => page.kind === "page"));
  assert.equal(provider.search({ kinds: ["crop"] }).length, 2);
  const unindexed = createUnifiedLibraryProvider({ pdfDocuments: [{ ...documents[0], pages: [], pageCount: 0 }] });
  assert.equal(unindexed.listPdfFiles()[0].kind, "pdf");
});

test("PDF inventory keeps textbooks under stale exam filters but filters exams", () => {
  const provider = makeProvider();
  for (const query of ["", "힘"]) {
    assert.deepEqual(provider.listPdfFiles({ filters, query }).map(file => file.documentId).sort(), ["book", "exam"]);
  }
  const book = provider.listPdfFiles().find(file => file.documentId === "book");
  assert.deepEqual(provider.listPdfFiles({ filters, sourceIds: [book.sourceId] }).map(file => file.documentId), ["book"]);
});

test("PDF inventory previews materialize the canonical page result", async () => {
  const calls = [];
  const provider = makeProvider({ materializers: { pdf: async input => { calls.push(input); return { url: "preview" }; } } });
  const file = provider.listPdfFiles().find(file => file.documentId === "book");
  const preview = await file.loadPreview(2);
  assert.equal(preview.result.kind, "page");
  assert.equal(calls[0].result.provenance.documentId, "book");
  assert.equal(calls[0].source.pageNumber, 2);
  await provider.materialize(preview.result);
  assert.equal(calls[1].result.kind, "page");
});

test("worker PDF search keeps textbook matches and scopes exam filters before dispatch", async () => {
  let request;
  const provider = makeProvider({ searchPdf: async options => {
    request = options;
    return entries.filter(entry => options.documentIds.includes(entry.documentId));
  } });
  const files = await provider.searchPdfFiles({ query: "힘", filters });
  assert.deepEqual(files.map(file => file.documentId).sort(), ["book", "exam"]);
  assert.deepEqual(request.documentIds.sort(), ["book", "exam"]);
  assert.deepEqual(request.filters, {});
  assert.ok(files.every(file => file.kind === "pdf" && file.firstMatchingPage === 2));
  const book = files.find(file => file.documentId === "book");
  const scoped = await provider.searchPdfFiles({ query: "힘", filters, sourceIds: [book.sourceId] });
  assert.deepEqual(scoped.map(file => file.documentId), ["book"]);
  assert.deepEqual(request.documentIds, ["book"]);
});

test("PDF files and page results expose target dimensions before materialization", async () => {
  const document = { ...documents[0], pages: [{ pageNumber: 1, widthPoints: 600, heightPoints: 800 }, { pageNumber: 2, widthPoints: 800, heightPoints: 400 }] };
  const provider = makeProvider({ pdfDocuments: [document], pdfSearchIndex: { entries: [] } });
  const file = provider.listPdfFiles()[0];
  assert.deepEqual(file.getPageGeometry(2), { width: 800, height: 400 });
  const page = provider.listPdfPages().find(item => item.provenance.pageNumber === 1);
  assert.deepEqual(page.preview.pageGeometry, { width: 600, height: 800 });
  assert.equal(file.getPageGeometry(99), null);
});

test('shared textbook uses prebuilt pages for browsing and the PDF for original output', async () => {
  const calls = [];
  const book = { ...documents[0], source: { ...documents[0].source, locator: '5e.shared.drive/textbook.pdf', sha256: '54eb8dfd49d9cd6ed9ed7438da4a5b52792099b603ae6a57e8d26c3a83a40545' } };
  const provider = makeProvider({ pdfDocuments: [book], materializers: { pdf: async input => { calls.push(input); return { url: 'original-pdf-render' }; } } });
  const file = provider.listPdfFiles()[0];
  const thumbnail = await file.loadPreview(2, { thumbnail: true });
  assert.match(thumbnail.url, /\/2-thumb\.webp\?/);
  const page = await file.loadPreview(2, { thumbnail: true, original: true, prebuiltPage: true });
  assert.match(page.url, /\/2\.webp\?/);
  assert.equal(page.previewOnly, true);
  assert.equal(calls.length, 0);
  const original = await file.loadPreview(2, { original: true });
  assert.equal(original.url, 'original-pdf-render');
  assert.equal(original.previewOnly, undefined);
  assert.equal(calls.length, 1);
});

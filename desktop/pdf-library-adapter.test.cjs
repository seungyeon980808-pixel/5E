const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function loadAdapter() {
  const file = path.join(__dirname, "..", "js", "pdf-library", "desktop-adapter.js");
  return import(`${pathToFileURL(file).href}?test=${crypto.randomUUID()}`);
}

test("Given desktop IPC bytes, when a folder document opens, then the adapter sends a typed copy to the shared PDF runtime and persists its normalized record", async () => {
  // Given
  const { createDesktopPdfLibraryAdapter } = await loadAdapter();
  const calls = [];
  const bridge = {
    async read(payload) { calls.push(["read", payload]); return { data: [37, 80, 68, 70] }; },
    async saveIndex(payload) { calls.push(["save", payload]); return { saved: true }; },
  };
  const runtime = {
    async openDocument(input) {
      calls.push(["open", input]);
      return { schemaVersion: "pdf-library-v1", id: input.id, title: input.title, source: input.source, pageCount: 1, status: "indexed", pages: [] };
    },
  };
  const adapter = createDesktopPdfLibraryAdapter({ bridge, runtime });
  const document = { documentId: "doc123", connectionId: "folder123", name: "exam.pdf", relativePath: "nested/exam.pdf", version: "abc123" };

  // When
  const record = await adapter.openDocument(document);

  // Then
  assert.deepEqual(calls[0], ["read", { documentId: "doc123" }]);
  assert.equal(calls[1][1].data instanceof Uint8Array, true);
  assert.deepEqual(Array.from(calls[1][1].data), [37, 80, 68, 70]);
  assert.deepEqual(calls[1][1].source, {
    kind: "file", locator: "doc123", displayName: "exam.pdf", sha256: "abc123",
    connectionId: "folder123", relativePath: "nested/exam.pdf",
  });
  assert.deepEqual(calls[2], ["save", { documentId: "doc123", version: "abc123", index: record }]);
});

test("Given an OCR-updated normalized record, when it is persisted, then the adapter binds it to the selected catalog version", async () => {
  // Given
  const { createDesktopPdfLibraryAdapter } = await loadAdapter();
  let saved;
  const bridge = { async saveIndex(payload) { saved = payload; return { saved: true }; } };
  const adapter = createDesktopPdfLibraryAdapter({ bridge, runtime: {} });
  const index = { id: "doc123", status: "indexed", pages: [{ text: "인식된 문장" }] };

  // When
  const result = await adapter.saveDocumentIndex("doc123", "version456", index);

  // Then
  assert.deepEqual(saved, { documentId: "doc123", version: "version456", index });
  assert.deepEqual(result, { saved: true });
});

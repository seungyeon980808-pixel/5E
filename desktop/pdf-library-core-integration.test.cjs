const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createPdfLibraryService } = require("./pdf-library-service.cjs");

test("Given a connected real PDF, when the desktop adapter opens it, then shared PDF.js extracts and persists the normalized catalog", async (t) => {
  // Given
  const [{ createCanvas }, { createPdfLibraryFixture }, { createPdfRuntime }, { createDesktopPdfLibraryAdapter }] = await Promise.all([
    import("@napi-rs/canvas"),
    import("../tests/helpers/pdf-library-fixture.mjs"),
    import("../js/pdf-library/pdf-runtime.js"),
    import("../js/pdf-library/desktop-adapter.js"),
  ]);
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "5e-pdf-core-"));
  const source = path.join(temporaryRoot, "source");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "fixture.pdf"), createPdfLibraryFixture());
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const service = createPdfLibraryService({ storagePath: path.join(temporaryRoot, "catalog.json") });
  const connection = await service.connect(source);
  await service.sync({ connectionId: connection.connectionId, operationId: "core-sync" });
  const document = service.list({ connectionId: connection.connectionId }).documents[0];
  const bridge = {
    read: (payload) => service.read(payload),
    saveIndex: (payload) => service.saveIndex(payload),
  };
  const runtime = createPdfRuntime({ canvasFactory: { create: createCanvas } });
  t.after(() => runtime.clearCache());
  const adapter = createDesktopPdfLibraryAdapter({ bridge, runtime });

  // When
  const record = await adapter.openDocument(document);
  const persisted = service.loadIndex({ documentId: document.documentId });
  const artifactPath = path.join(process.cwd(), ".omo", "evidence", "pdf-library", "T3", "adapter-real-core-record.json");
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, JSON.stringify({
    documentId: record.id,
    source: record.source,
    pageCount: record.pageCount,
    status: record.status,
    textSample: record.pages[0].text.slice(0, 80),
    persistedVersion: persisted.version,
  }, null, 2));

  // Then
  assert.equal(record.pages[0].text.includes("Momentum experiment alpha"), true);
  assert.equal(record.source.kind, "file");
  assert.equal(record.source.locator, document.documentId);
  assert.equal(persisted.index.id, record.id);
  assert.equal(persisted.version, document.version);
});

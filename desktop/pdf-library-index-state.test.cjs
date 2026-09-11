const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createPdfLibraryService } = require("./pdf-library-service.cjs");

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "5e-pdf-index-state-"));
  const source = path.join(root, "source");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "personal.pdf"), "%PDF-1.4\npersonal\n%%EOF");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, source, storagePath: path.join(root, "state.json") };
}

test("Given a personal PDF, when state and a correction are saved, then both survive restart and project into search", async (t) => {
  const fixture = setup(t);
  const service = createPdfLibraryService({ storagePath: fixture.storagePath });
  const connection = await service.connect(fixture.source);
  await service.sync({ connectionId: connection.connectionId, operationId: "initial" });
  const document = service.list().documents[0];
  assert.equal(document.indexState.state, "reading");
  await service.saveIndex({
    documentId: document.documentId, version: document.version,
    index: { schemaVersion: "pdf-search-index-v1", entries: [{
      documentId: document.documentId, documentTitle: "Personal", pageNumber: 1, itemId: null, itemNumber: null,
      text: "momentum page", normalized: "momentum page", words: [],
      source: { documentId: document.documentId, pageNumber: 1, rect: [0, 0, 1, 1], fullPageFallback: true },
    }] },
  });
  await service.saveCorrection({
    documentId: document.documentId, version: document.version, pageNumber: 1, itemNumber: 7,
    label: "7번", rect: [0.1, 0.2, 0.7, 0.3],
  });
  const restarted = createPdfLibraryService({ storagePath: fixture.storagePath });
  const projected = restarted.loadIndex({ documentId: document.documentId });

  assert.equal(restarted.indexState({ documentId: document.documentId }).state, "searchable");
  assert.equal(restarted.listCorrections({ documentId: document.documentId }).length, 1);
  assert.equal(projected.index.entries[1].itemNumber, 7);
  assert.deepEqual(projected.index.entries[1].source.rect, [0.1, 0.2, 0.7, 0.3]);
});

test("Given durable state, when source bytes change, then stale state and corrections are invalidated", async (t) => {
  const fixture = setup(t);
  const service = createPdfLibraryService({ storagePath: fixture.storagePath });
  const connection = await service.connect(fixture.source);
  await service.sync({ connectionId: connection.connectionId, operationId: "first" });
  const original = service.list().documents[0];
  await service.saveIndexState({
    documentId: original.documentId, version: original.version, state: "failed",
    diagnostic: { code: "PDF_OPEN_FAILED", message: "corrupt xref", stage: "open", recoverable: true },
  });
  await service.saveCorrection({
    documentId: original.documentId, version: original.version, pageNumber: 1, itemNumber: 3,
    label: "3번", rect: [0.1, 0.1, 0.8, 0.4],
  });
  fs.appendFileSync(path.join(fixture.source, "personal.pdf"), "changed");
  await service.sync({ connectionId: connection.connectionId, operationId: "second" });
  const changed = service.list().documents[0];

  assert.notEqual(changed.version, original.version);
  assert.equal(changed.indexState.state, "reading");
  assert.deepEqual(service.listCorrections({ documentId: changed.documentId }), []);
  await assert.rejects(service.saveCorrection({
    documentId: changed.documentId, version: original.version, pageNumber: 1, itemNumber: 3,
    label: "3번", rect: [0.1, 0.1, 0.8, 0.4],
  }), (error) => error.code === "PDF_LIBRARY_STALE");
});

test("Given invalid or unauthorized correction payloads, when saved concurrently, then validation and commit serialization hold", async (t) => {
  const fixture = setup(t);
  const service = createPdfLibraryService({ storagePath: fixture.storagePath });
  const connection = await service.connect(fixture.source);
  await service.sync({ connectionId: connection.connectionId, operationId: "sync" });
  const document = service.list().documents[0];
  const base = { documentId: document.documentId, version: document.version, pageNumber: 1 };

  await assert.rejects(service.saveCorrection({ ...base, itemNumber: 1, label: "", rect: [0, 0, 1, 1] }), (error) => error.code === "PDF_LIBRARY_PAYLOAD");
  await assert.rejects(service.saveCorrection({ ...base, documentId: "unauthorized", itemNumber: 1, label: "1", rect: [0, 0, 1, 1] }), (error) => error.code === "PDF_LIBRARY_UNAUTHORIZED");
  await Promise.all([
    service.saveCorrection({ ...base, itemNumber: 1, label: "1번", rect: [0, 0, 0.5, 1] }),
    service.saveCorrection({ ...base, itemNumber: 2, label: "2번", rect: [0.5, 0, 0.5, 1] }),
  ]);
  assert.deepEqual(service.listCorrections({ documentId: document.documentId }).map((item) => item.itemNumber).sort(), [1, 2]);
});

test("Given a malformed current-version correction on disk, when the catalog restarts, then loading ignores and purges it", async (t) => {
  const fixture = setup(t);
  const service = createPdfLibraryService({ storagePath: fixture.storagePath });
  const connection = await service.connect(fixture.source);
  await service.sync({ connectionId: connection.connectionId, operationId: "sync" });
  const document = service.list().documents[0];
  await service.saveIndex({
    documentId: document.documentId, version: document.version,
    index: { schemaVersion: "pdf-search-index-v1", entries: [{
      documentId: document.documentId, pageNumber: 1, itemNumber: null,
      text: "page", normalized: "page", words: [],
      source: { documentId: document.documentId, pageNumber: 1, rect: [0, 0, 1, 1], fullPageFallback: true },
    }] },
  });
  const disk = JSON.parse(fs.readFileSync(fixture.storagePath, "utf8"));
  disk.corrections[document.documentId] = [{
    schemaVersion: "pdf-item-correction-v1", correctionId: `${document.documentId}:1:7`,
    documentId: document.documentId, version: document.version, pageNumber: 1, itemNumber: 7,
    label: { malicious: true }, rect: "not-a-rectangle", updatedAt: new Date().toISOString(),
  }];
  fs.writeFileSync(fixture.storagePath, JSON.stringify(disk));

  const restarted = createPdfLibraryService({ storagePath: fixture.storagePath });

  assert.doesNotThrow(() => restarted.loadIndex({ documentId: document.documentId }));
  assert.deepEqual(restarted.listCorrections({ documentId: document.documentId }), []);
  const repaired = JSON.parse(fs.readFileSync(fixture.storagePath, "utf8"));
  assert.equal(Object.hasOwn(repaired.corrections, document.documentId), false);
});

test("Given a saved correction, when its connection is unavailable, excluded, or disconnected, then deletion is unauthorized", async (t) => {
  const fixture = setup(t);
  let failScan = false;
  const service = createPdfLibraryService({
    storagePath: fixture.storagePath,
    async scanFolder(options) {
      if (failScan) throw new Error("folder unavailable");
      return require("./pdf-library-scanner.cjs").scanPdfFolder(options);
    },
  });
  const connection = await service.connect(fixture.source);
  await service.sync({ connectionId: connection.connectionId, operationId: "good" });
  const document = service.list().documents[0];
  const correction = await service.saveCorrection({
    documentId: document.documentId, version: document.version, pageNumber: 1, itemNumber: 4,
    label: "4번", rect: [0.1, 0.1, 0.8, 0.4],
  });
  const deletion = { documentId: document.documentId, version: document.version, correctionId: correction.correctionId };
  failScan = true;
  await assert.rejects(service.sync({ connectionId: connection.connectionId, operationId: "bad" }), /folder unavailable/);

  await assert.rejects(service.deleteCorrection(deletion), (error) => error.code === "PDF_LIBRARY_UNAVAILABLE");
  assert.equal(JSON.parse(fs.readFileSync(fixture.storagePath, "utf8")).corrections[document.documentId].length, 1);

  const restored = createPdfLibraryService({ storagePath: fixture.storagePath });
  const rootFolder = restored.folderTree({ connectionId: connection.connectionId }).tree;
  await restored.setFolderSelection({ folderId: rootFolder.folderId, selected: false });
  await assert.rejects(restored.deleteCorrection(deletion), (error) => error.code === "PDF_LIBRARY_UNAUTHORIZED");
  await restored.disconnect({ connectionId: connection.connectionId });
  await assert.rejects(restored.deleteCorrection(deletion), (error) => error.code === "PDF_LIBRARY_UNAUTHORIZED");
});

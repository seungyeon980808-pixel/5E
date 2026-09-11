const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createPdfLibraryService } = require("./pdf-library-service.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "5e-pdf-library-"));
  const source = path.join(root, "source");
  fs.mkdirSync(path.join(source, "nested"), { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, source, storagePath: path.join(root, "state", "catalog.json") };
}

function writePdf(filePath, text) {
  fs.writeFileSync(filePath, Buffer.from(`%PDF-1.4\n${text}\n%%EOF`));
}

async function persistJson(storagePath, value) {
  await fs.promises.mkdir(path.dirname(storagePath), { recursive: true });
  const temporaryPath = `${storagePath}.${crypto.randomUUID()}.tmp`;
  await fs.promises.writeFile(temporaryPath, JSON.stringify(value));
  await fs.promises.rename(temporaryPath, storagePath);
}

test("Given a connected folder, when files change across restarts, then inventory and indexes remain version-consistent", async (t) => {
  // Given
  const f = fixture(t);
  writePdf(path.join(f.source, "a.pdf"), "alpha");
  writePdf(path.join(f.source, "nested", "b.PDF"), "beta");
  fs.writeFileSync(path.join(f.source, "ignored.txt"), "not a pdf");
  const outside = path.join(f.root, "outside.pdf");
  writePdf(outside, "secret");
  try { fs.symlinkSync(outside, path.join(f.source, "escape.pdf")); } catch {}
  const service = createPdfLibraryService({ storagePath: f.storagePath });
  const connection = await service.connect(f.source);

  // When
  const first = await service.sync({ connectionId: connection.connectionId, operationId: "sync-1" });
  const documents = service.list({ connectionId: connection.connectionId }).documents;
  await service.saveIndex({ documentId: documents[0].documentId, version: documents[0].version, index: { pages: [{ text: "alpha" }] } });
  const restarted = createPdfLibraryService({ storagePath: f.storagePath });

  // Then
  assert.deepEqual(documents.map((item) => item.relativePath), ["a.pdf", "nested/b.PDF"]);
  assert.deepEqual(first.summary, { added: 2, changed: 0, removed: 0, unchanged: 0 });
  assert.deepEqual(restarted.loadIndex({ documentId: documents[0].documentId }), { version: documents[0].version, index: { pages: [{ text: "alpha" }] } });

  writePdf(path.join(f.source, "a.pdf"), "alpha changed");
  fs.rmSync(path.join(f.source, "nested", "b.PDF"));
  writePdf(path.join(f.source, "c.pdf"), "gamma");
  const second = await restarted.sync({ connectionId: connection.connectionId, operationId: "sync-2" });
  assert.deepEqual(second.summary, { added: 1, changed: 1, removed: 1, unchanged: 0 });
  assert.equal(restarted.loadIndex({ documentId: documents[0].documentId }), null);
});

test("Given an indexed snapshot, when a later sync is cancelled, then the committed catalog stays intact", async (t) => {
  // Given
  const f = fixture(t);
  writePdf(path.join(f.source, "kept.pdf"), "kept");
  let service;
  let shouldCancel = false;
  service = createPdfLibraryService({
    storagePath: f.storagePath,
    onProgress(progress) {
      if (shouldCancel && progress.scanned === 1) service.cancel({ operationId: progress.operationId });
    },
  });
  const connection = await service.connect(f.source);
  await service.sync({ connectionId: connection.connectionId, operationId: "initial" });
  writePdf(path.join(f.source, "new.pdf"), "new");
  shouldCancel = true;

  // When
  const cancelled = service.sync({ connectionId: connection.connectionId, operationId: "cancelled" });

  // Then
  await assert.rejects(cancelled, (error) => error.code === "PDF_LIBRARY_CANCELLED");
  assert.deepEqual(service.list({ connectionId: connection.connectionId }).documents.map((item) => item.relativePath), ["kept.pdf"]);
});

test("Given overlapping scans for one connection, when older persistence is delayed and superseded, then the final catalog keeps newest bytes", async (t) => {
  // Given
  const f = fixture(t);
  const filePath = path.join(f.source, "version.pdf");
  writePdf(filePath, "initial");
  let delayPersistence = false;
  let releasePersistence;
  let markPersistenceStarted;
  const persistenceStarted = new Promise((resolve) => { markPersistenceStarted = resolve; });
  const persistenceGate = new Promise((resolve) => { releasePersistence = resolve; });
  const service = createPdfLibraryService({
    storagePath: f.storagePath,
    async persistState(storagePath, value) {
      if (delayPersistence) {
        delayPersistence = false;
        markPersistenceStarted();
        await persistenceGate;
      }
      await persistJson(storagePath, value);
    },
  });
  const connection = await service.connect(f.source);
  await service.sync({ connectionId: connection.connectionId, operationId: "initial" });
  writePdf(filePath, "older snapshot");
  delayPersistence = true;
  const older = service.sync({ connectionId: connection.connectionId, operationId: "older" });
  const olderOutcome = older.catch((error) => error);
  await persistenceStarted;
  writePdf(filePath, "newest snapshot");

  // When
  const newer = service.sync({ connectionId: connection.connectionId, operationId: "newer" });
  releasePersistence();
  await newer;

  // Then
  assert.equal((await olderOutcome).code, "PDF_LIBRARY_CANCELLED");
  const current = service.list({ connectionId: connection.connectionId }).documents[0];
  assert.equal((await service.read({ documentId: current.documentId })).includes(Buffer.from("newest snapshot")), true);
});

test("Given concurrent commits for different connections, when one persistence is delayed, then neither connection loses the other's documents", async (t) => {
  // Given
  const f = fixture(t);
  const secondSource = path.join(f.root, "second-source");
  fs.mkdirSync(secondSource);
  writePdf(path.join(f.source, "first.pdf"), "first");
  writePdf(path.join(secondSource, "second.pdf"), "second");
  let delayPersistence = false;
  let releasePersistence;
  let markPersistenceStarted;
  const persistenceStarted = new Promise((resolve) => { markPersistenceStarted = resolve; });
  const persistenceGate = new Promise((resolve) => { releasePersistence = resolve; });
  const service = createPdfLibraryService({
    storagePath: f.storagePath,
    async persistState(storagePath, value) {
      if (delayPersistence) {
        delayPersistence = false;
        markPersistenceStarted();
        await persistenceGate;
      }
      await persistJson(storagePath, value);
    },
  });
  const firstConnection = await service.connect(f.source);
  const secondConnection = await service.connect(secondSource);
  delayPersistence = true;
  const firstSync = service.sync({ connectionId: firstConnection.connectionId, operationId: "first-sync" });
  await persistenceStarted;

  // When
  const secondSync = service.sync({ connectionId: secondConnection.connectionId, operationId: "second-sync" });
  releasePersistence();
  await Promise.all([firstSync, secondSync]);

  // Then
  assert.deepEqual(service.list({ connectionId: firstConnection.connectionId }).documents.map((item) => item.name), ["first.pdf"]);
  assert.deepEqual(service.list({ connectionId: secondConnection.connectionId }).documents.map((item) => item.name), ["second.pdf"]);
  const restarted = createPdfLibraryService({ storagePath: f.storagePath });
  assert.equal(restarted.list().documents.length, 2);
});

test("Given a document read in flight, when its folder disconnects, then no stale bytes escape and source files remain", async (t) => {
  // Given
  const f = fixture(t);
  const filePath = path.join(f.source, "source.pdf");
  writePdf(filePath, "source remains");
  let releaseRead;
  const readStarted = new Promise((resolve) => { releaseRead = resolve; });
  let finishRead;
  const readGate = new Promise((resolve) => { finishRead = resolve; });
  const service = createPdfLibraryService({
    storagePath: f.storagePath,
    async readFile(target) {
      const bytes = await fs.promises.readFile(target);
      releaseRead();
      await readGate;
      return bytes;
    },
  });
  const connection = await service.connect(f.source);
  await service.sync({ connectionId: connection.connectionId, operationId: "sync" });
  const document = service.list({ connectionId: connection.connectionId }).documents[0];
  const pendingRead = service.read({ documentId: document.documentId });
  await readStarted;

  // When
  await service.disconnect({ connectionId: connection.connectionId });
  finishRead();

  // Then
  await assert.rejects(pendingRead, (error) => error.code === "PDF_LIBRARY_UNAUTHORIZED");
  assert.equal(fs.existsSync(filePath), true);
  assert.deepEqual(service.connections(), []);
});

test("Given untrusted payloads, when IDs, versions, or index data are invalid, then the service rejects them", async (t) => {
  // Given
  const f = fixture(t);
  writePdf(path.join(f.source, "safe.pdf"), "safe");
  const service = createPdfLibraryService({ storagePath: f.storagePath });
  const connection = await service.connect(f.source);
  await service.sync({ connectionId: connection.connectionId, operationId: "sync" });
  const document = service.list({ connectionId: connection.connectionId }).documents[0];

  // When / Then
  await assert.rejects(service.read({ documentId: "../safe.pdf" }), (error) => error.code === "PDF_LIBRARY_PAYLOAD");
  await assert.rejects(service.saveIndex({ documentId: document.documentId, version: crypto.randomUUID(), index: {} }), (error) => error.code === "PDF_LIBRARY_STALE");
  await assert.rejects(service.saveIndex({ documentId: document.documentId, version: document.version, index: undefined }), (error) => error.code === "PDF_LIBRARY_PAYLOAD");
});

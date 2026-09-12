const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createPdfLibraryService } = require("./pdf-library-service.cjs");
const { registerPdfLibraryIpc } = require("./pdf-library-ipc.cjs");
const { MAX_IMAGE_BYTES, MAX_PDF_BYTES, readFileBounded, scanPdfFolder } = require("./pdf-library-scanner.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "5e-library-folders-"));
  const documentsPath = path.join(root, "Documents");
  const storagePath = path.join(root, "state", "catalog.json");
  fs.mkdirSync(documentsPath, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, documentsPath, storagePath };
}

function writePdf(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(`%PDF-1.4\n${text}\n%%EOF`));
}

test("Given an explicit default-folder action, when it runs twice, then required folders are connected without overwriting files", async (t) => {
  // Given
  const f = fixture(t);
  const existing = path.join(f.documentsPath, "5E", "내 자료", "기출문제", "keep.pdf");
  writePdf(existing, "keep-original");
  const service = createPdfLibraryService({ storagePath: f.storagePath, documentsPath: f.documentsPath });

  // When
  const first = await service.ensureDefaultFolder();
  const second = await service.ensureDefaultFolder();

  // Then
  assert.equal(first.connection.connectionId, second.connection.connectionId);
  assert.deepEqual(first.tree.children.map((folder) => folder.name), ["교과서", "기출문제", "기타 자료"]);
  assert.equal(fs.readFileSync(existing, "utf8").includes("keep-original"), true);
  assert.equal(fs.existsSync(path.join(f.documentsPath, "5E", "내 자료", "교과서")), true);
  assert.equal(fs.existsSync(path.join(f.documentsPath, "5E", "내 자료", "기타 자료")), true);
});

test("Given nested PDFs, images, and non-library files, when a subtree is excluded and the service restarts, then visibility and authorization follow the persistent inherited rule", async (t) => {
  // Given
  const f = fixture(t);
  const source = path.join(f.root, "source");
  writePdf(path.join(source, "included", "a.pdf"), "included");
  writePdf(path.join(source, "excluded", "nested", "b.pdf"), "excluded");
  fs.writeFileSync(path.join(source, "excluded", "nested", "figure.png"), Buffer.from([137, 80, 78, 71]));
  fs.writeFileSync(path.join(source, "excluded", "notes.txt"), "ignore me");
  const service = createPdfLibraryService({ storagePath: f.storagePath, documentsPath: f.documentsPath });
  const connection = await service.connect(source);
  await service.sync({ connectionId: connection.connectionId, operationId: "initial" });
  const before = service.list({ connectionId: connection.connectionId });
  const excludedDocument = before.documents.find((item) => item.name === "b.pdf");
  const excludedImage = before.images[0];
  const imageRead = await service.readImage({ imageId: excludedImage.imageId });
  const excludedFolder = service.folderTree({ connectionId: connection.connectionId }).tree.children.find((item) => item.name === "excluded");
  await service.saveIndex({ documentId: excludedDocument.documentId, version: excludedDocument.version, index: { pages: [{ text: "must disappear" }] } });

  // When
  await service.setFolderSelection({ folderId: excludedFolder.folderId, selected: false });
  assert.deepEqual(service.list({ connectionId: connection.connectionId }).documents.map((item) => item.name), ["a.pdf"]);
  assert.deepEqual(service.list({ connectionId: connection.connectionId }).images, []);
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(f.storagePath, "utf8")).indexes, excludedDocument.documentId), false);
  writePdf(path.join(source, "excluded", "new-child", "new.pdf"), "inherits-exclusion");
  await service.sync({ connectionId: connection.connectionId, operationId: "after-change" });
  const restarted = createPdfLibraryService({ storagePath: f.storagePath, documentsPath: f.documentsPath });

  // Then
  assert.deepEqual(restarted.list({ connectionId: connection.connectionId }).documents.map((item) => item.name), ["a.pdf"]);
  assert.deepEqual(restarted.list({ connectionId: connection.connectionId }).images, []);
  assert.deepEqual(Buffer.from(imageRead.data), Buffer.from([137, 80, 78, 71]));
  assert.equal(imageRead.mimeType, "image/png");
  assert.equal(restarted.folderTree({ connectionId: connection.connectionId }).tree.selection, "partial");
  const restartedTree = restarted.folderTree({ connectionId: connection.connectionId }).tree;
  const restartedExcluded = restartedTree.children.find((item) => item.name === "excluded");
  assert.equal(restartedExcluded.selection, "excluded");
  assert.deepEqual({ documentCount: restartedTree.documentCount, imageCount: restartedTree.imageCount }, { documentCount: 1, imageCount: 0 });
  assert.deepEqual({ documentCount: restartedExcluded.documentCount, imageCount: restartedExcluded.imageCount }, { documentCount: 0, imageCount: 0 });
  await assert.rejects(restarted.read({ documentId: excludedDocument.documentId }), (error) => error.code === "PDF_LIBRARY_UNAUTHORIZED");
  assert.equal(fs.existsSync(path.join(source, "excluded", "nested", "b.pdf")), true);
});

test("Given a connected folder that disappears, a failed refresh exposes no ghost file counts", async (t) => {
  const f = fixture(t);
  const source = path.join(f.root, "source");
  writePdf(path.join(source, "nested", "live.pdf"), "live");
  const service = createPdfLibraryService({ storagePath: f.storagePath, documentsPath: f.documentsPath });
  const connection = await service.connect(source);
  await service.sync({ connectionId: connection.connectionId, operationId: "before-removal" });
  assert.equal(service.folderTree({ connectionId: connection.connectionId }).tree.documentCount, 1);

  fs.rmSync(source, { recursive: true, force: true });
  await assert.rejects(service.sync({ connectionId: connection.connectionId, operationId: "after-removal" }));

  assert.deepEqual(service.list({ connectionId: connection.connectionId }).documents, []);
  assert.equal(service.folderTree({ connectionId: connection.connectionId }).tree.documentCount, 0);
});

test("Given an excluded directory, when the real scanner refreshes it, then entries are counted without reading PDF or image bytes", async (t) => {
  // Given
  const f = fixture(t);
  const source = path.join(f.root, "source");
  writePdf(path.join(source, "excluded", "secret.pdf"), "must-not-read");
  fs.writeFileSync(path.join(source, "excluded", "secret.png"), Buffer.from([1, 2, 3]));
  const reads = [];

  // When
  const scanned = await scanPdfFolder({
    root: source,
    shouldInclude: (relativePath) => relativePath !== "excluded",
    async readFile(target, options) {
      reads.push(target);
      return fs.promises.readFile(target, options);
    },
  });

  // Then
  assert.deepEqual(reads, []);
  assert.deepEqual(scanned.documents, []);
  assert.deepEqual(scanned.images, []);
  const excluded = scanned.folders.find((folder) => folder.relativePath === "excluded");
  assert.deepEqual({ documentCount: excluded.documentCount, imageCount: excluded.imageCount }, { documentCount: 1, imageCount: 1 });
});

test("Given files at and beyond library limits, when scanned, then oversized sparse bytes are skipped with safe warnings while boundary files remain eligible", async (t) => {
  // Given
  const f = fixture(t);
  const source = path.join(f.root, "source");
  fs.mkdirSync(source);
  const boundary = path.join(source, "boundary.png");
  const oversized = path.join(source, "oversized.pdf");
  fs.writeFileSync(boundary, "x");
  fs.truncateSync(boundary, MAX_IMAGE_BYTES);
  fs.writeFileSync(oversized, "x");
  fs.truncateSync(oversized, MAX_PDF_BYTES + 1);
  const reads = [];

  // When
  const scanned = await scanPdfFolder({
    root: source,
    async readFile(target) { reads.push(path.basename(target)); return Buffer.from("bounded-fixture"); },
  });

  // Then
  assert.deepEqual(reads, ["boundary.png"]);
  assert.deepEqual(scanned.documents, []);
  assert.equal(scanned.images[0].name, "boundary.png");
  assert.deepEqual(scanned.warnings, [{ code: "PDF_LIBRARY_TOO_LARGE", kind: "pdf", relativePath: "oversized.pdf", size: MAX_PDF_BYTES + 1, maxBytes: MAX_PDF_BYTES }]);
});

test("Given a file that grows during a bounded read, when it crosses the cap, then reading stops with a size error", async (t) => {
  // Given
  const f = fixture(t);
  const target = path.join(f.root, "growing.pdf");
  fs.writeFileSync(target, Buffer.alloc(700, 1));
  let grew = false;

  // When
  const read = readFileBounded(target, {
    maxBytes: 1024,
    async onChunk() {
      if (grew) return;
      grew = true;
      await fs.promises.appendFile(target, Buffer.alloc(700, 2));
    },
  });

  // Then
  await assert.rejects(read, (error) => error.code === "PDF_LIBRARY_TOO_LARGE");
});

test("Given a selected PDF that grows beyond its limit after sync, when read, then bytes are rejected before the service reader runs", async (t) => {
  // Given
  const f = fixture(t);
  const source = path.join(f.root, "source");
  writePdf(path.join(source, "grows.pdf"), "small-at-sync");
  const reads = [];
  const service = createPdfLibraryService({
    storagePath: f.storagePath,
    documentsPath: f.documentsPath,
    async readFile(target) { reads.push(target); return fs.promises.readFile(target); },
  });
  const connection = await service.connect(source);
  await service.sync({ connectionId: connection.connectionId, operationId: "growth-sync" });
  const document = service.list({ connectionId: connection.connectionId }).documents[0];
  fs.truncateSync(path.join(source, "grows.pdf"), MAX_PDF_BYTES + 1);

  // When / Then
  await assert.rejects(service.read({ documentId: document.documentId }), (error) => error.code === "PDF_LIBRARY_TOO_LARGE");
  assert.deepEqual(reads, []);
});

test("Given a selected image that grows beyond its limit after sync, when read, then bytes are rejected before the service reader runs", async (t) => {
  // Given
  const f = fixture(t);
  const source = path.join(f.root, "source");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "grows.png"), Buffer.from([137, 80, 78, 71]));
  const reads = [];
  const service = createPdfLibraryService({
    storagePath: f.storagePath,
    documentsPath: f.documentsPath,
    async readFile(target) { reads.push(target); return fs.promises.readFile(target); },
  });
  const connection = await service.connect(source);
  await service.sync({ connectionId: connection.connectionId, operationId: "image-growth-sync" });
  const image = service.list({ connectionId: connection.connectionId }).images[0];
  fs.truncateSync(path.join(source, "grows.png"), MAX_IMAGE_BYTES + 1);

  // When / Then
  await assert.rejects(service.readImage({ imageId: image.imageId }), (error) => error.code === "PDF_LIBRARY_TOO_LARGE");
  assert.deepEqual(reads, []);
});

test("Given one valid PDF and one oversized PDF, when the service syncs, then the valid file commits and the renderer receives a safe warning", async (t) => {
  // Given
  const f = fixture(t);
  const source = path.join(f.root, "source");
  writePdf(path.join(source, "valid.pdf"), "valid");
  const oversized = path.join(source, "oversized.pdf");
  fs.writeFileSync(oversized, "x");
  fs.truncateSync(oversized, MAX_PDF_BYTES + 1);
  const service = createPdfLibraryService({ storagePath: f.storagePath, documentsPath: f.documentsPath });
  const connection = await service.connect(source);

  // When
  const result = await service.sync({ connectionId: connection.connectionId, operationId: "warning-sync" });

  // Then
  assert.deepEqual(service.list({ connectionId: connection.connectionId }).documents.map((item) => item.name), ["valid.pdf"]);
  assert.equal(result.warningCount, 1);
  assert.deepEqual(result.warnings, [{ code: "PDF_LIBRARY_TOO_LARGE", kind: "pdf", relativePath: "oversized.pdf", size: MAX_PDF_BYTES + 1, maxBytes: MAX_PDF_BYTES }]);
  assert.equal(JSON.stringify(result.warnings).includes(f.root), false);
});

test("Given valid and forged PDF siblings, when the real scanner synchronizes them, then only the exact PDF signature enters the catalog", async (t) => {
  // Given
  const f = fixture(t);
  const source = path.join(f.root, "source");
  writePdf(path.join(source, "valid.pdf"), "valid sibling");
  fs.writeFileSync(path.join(source, "forged.pdf"), Buffer.from("<script>not a pdf</script>"));
  fs.writeFileSync(path.join(source, "uppercase.pdf"), Buffer.from("%pdf-1.4\nnot exact"));
  const service = createPdfLibraryService({ storagePath: f.storagePath, documentsPath: f.documentsPath });
  const connection = await service.connect(source);

  // When
  const result = await service.sync({ connectionId: connection.connectionId, operationId: "signature-sync" });

  // Then
  assert.deepEqual(service.list({ connectionId: connection.connectionId }).documents.map((item) => item.name), ["valid.pdf"]);
  assert.deepEqual(result.warnings.map((warning) => ({ code: warning.code, relativePath: warning.relativePath })), [
    { code: "PDF_LIBRARY_INVALID_PDF", relativePath: "forged.pdf" },
    { code: "PDF_LIBRARY_INVALID_PDF", relativePath: "uppercase.pdf" },
  ]);
});

test("Given an authorized PDF replaced with forged bytes, when it is read, then the bytes are rejected as invalid before escaping", async (t) => {
  // Given
  const f = fixture(t);
  const source = path.join(f.root, "source");
  const target = path.join(source, "replace.pdf");
  writePdf(target, "valid at synchronization");
  const service = createPdfLibraryService({ storagePath: f.storagePath, documentsPath: f.documentsPath });
  const connection = await service.connect(source);
  await service.sync({ connectionId: connection.connectionId, operationId: "replacement-sync" });
  const document = service.list({ connectionId: connection.connectionId }).documents[0];
  fs.writeFileSync(target, Buffer.from("<script>changed after scan</script>"));

  // When / Then
  await assert.rejects(service.read({ documentId: document.documentId }), (error) => error.code === "PDF_LIBRARY_INVALID_PDF");
});

test("Given a valid cached catalog, when refresh fails, then cached bytes remain persisted but stale results are hidden until a successful refresh", async (t) => {
  // Given
  const f = fixture(t);
  const source = path.join(f.root, "source");
  writePdf(path.join(source, "cached.pdf"), "cached");
  let fail = false;
  const service = createPdfLibraryService({
    storagePath: f.storagePath,
    documentsPath: f.documentsPath,
    async scanFolder(options) {
      if (fail) throw new Error("folder unreadable");
      return scanPdfFolder(options);
    },
  });
  const connection = await service.connect(source);
  await service.sync({ connectionId: connection.connectionId, operationId: "good" });
  fail = true;

  // When
  await assert.rejects(service.sync({ connectionId: connection.connectionId, operationId: "bad" }), /folder unreadable/);

  // Then
  assert.deepEqual(service.list({ connectionId: connection.connectionId }).documents, []);
  assert.equal(service.connections()[0].status, "unavailable");
  const persisted = JSON.parse(fs.readFileSync(f.storagePath, "utf8"));
  assert.equal(persisted.documents[0].name, "cached.pdf");
});

test("Given opaque folder and item IDs, when desktop open and reveal handlers run, then only authorized resolved targets reach Electron shell", async (t) => {
  // Given
  const f = fixture(t);
  const source = path.join(f.root, "source");
  writePdf(path.join(source, "inside", "shown.pdf"), "shown");
  const service = createPdfLibraryService({ storagePath: f.storagePath, documentsPath: f.documentsPath });
  const connection = await service.connect(source);
  await service.sync({ connectionId: connection.connectionId, operationId: "shell-sync" });
  const folder = service.folderTree({ connectionId: connection.connectionId }).tree.children[0];
  const document = service.list({ connectionId: connection.connectionId }).documents[0];
  const calls = [];
  const handlers = new Map();
  registerPdfLibraryIpc({
    ipcMain: { handle(channel, handler) { handlers.set(channel, handler); } },
    dialog: {},
    shell: {
      async openPath(target) { calls.push(["open", target]); return ""; },
      showItemInFolder(target) { calls.push(["reveal", target]); },
    },
    getWindow: () => null,
    service,
  });
  const invoke = (channel, payload) => handlers.get(`pdf-library:${channel}`)(null, payload);

  // When
  await invoke("open-folder", { folderId: folder.folderId });
  await invoke("reveal-item", { documentId: document.documentId });

  // Then
  const realSource = fs.realpathSync(source);
  assert.deepEqual(calls, [["open", path.join(realSource, "inside")], ["reveal", path.join(realSource, "inside", "shown.pdf")]]);
  await assert.rejects(invoke("open-folder", { folderId: "../../outside" }), (error) => error.code === "PDF_LIBRARY_PAYLOAD");
  await assert.rejects(invoke("reveal-item", { documentId: "not-authorized" }), (error) => error.code === "PDF_LIBRARY_UNAUTHORIZED");
});

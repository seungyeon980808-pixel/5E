const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { registerPdfLibraryIpc } = require("./pdf-library-ipc.cjs");
const { createPdfLibraryService } = require("./pdf-library-service.cjs");

test("Given the desktop bridge, when PDF library APIs are inspected, then folder and index operations cross narrow IPC channels", () => {
  // Given
  const preload = fs.readFileSync(path.join(__dirname, "preload.cjs"), "utf8");
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const registration = fs.readFileSync(path.join(__dirname, "pdf-library-ipc.cjs"), "utf8");

  // When
  const channels = [
    "pick-folder", "ensure-default-folder", "connections", "folder-tree", "set-folder-selection",
    "disconnect", "sync", "cancel", "list", "read", "read-image", "open-folder", "reveal-item",
    "save-index", "load-index", "capabilities", "save-download",
  ];

  // Then
  for (const channel of channels) {
    assert.match(preload, new RegExp(`pdf-library:${channel}`));
    assert.match(registration, new RegExp(`(?:pdf-library:|invoke\\(")${channel}`));
  }
  assert.match(main, /registerPdfLibraryIpc/);
  assert.match(preload, /pdf-library:progress/);
});

test("Given verified PDF bytes, when desktop save is requested, then the system-selected path receives the unchanged document", async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "5e-pdf-download-"));
  const destination = path.join(temporaryRoot, "saved.pdf");
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const handlers = new Map();
  registerPdfLibraryIpc({
    ipcMain: { handle(channel, handler) { handlers.set(channel, handler); } },
    dialog: {
      async showSaveDialog(_window, options) {
        assert.equal(path.basename(options.defaultPath), "unsafe-name.pdf");
        return { canceled: false, filePath: destination };
      },
    },
    getWindow: () => null,
    downloadsPath: temporaryRoot,
    service: {},
  });
  const bytes = Buffer.from("%PDF-1.4\ndownload fixture\n%%EOF");

  const result = await handlers.get("pdf-library:save-download")(null, { fileName: "unsafe/name.pdf", data: [...bytes] });

  assert.deepEqual(result, { saved: true, canceled: false, filePath: destination });
  assert.deepEqual(fs.readFileSync(destination), bytes);
  await assert.rejects(
    handlers.get("pdf-library:save-download")(null, { fileName: "bad.pdf", data: [...Buffer.from("not a pdf")] }),
    /PDF 데이터/,
  );
});

test("Given real PDF folder services behind IPC, when renderer calls connect, sync, read, index, and disconnect, then handlers enforce the complete lifecycle", async (t) => {
  // Given
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "5e-pdf-ipc-"));
  const source = path.join(temporaryRoot, "source");
  fs.mkdirSync(source);
  const bytes = Buffer.from("%PDF-1.4\nipc execution\n%%EOF");
  const sourcePath = path.join(source, "ipc.pdf");
  fs.writeFileSync(sourcePath, bytes);
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const handlers = new Map();
  const service = createPdfLibraryService({ storagePath: path.join(temporaryRoot, "catalog.json") });
  registerPdfLibraryIpc({
    ipcMain: { handle(channel, handler) { handlers.set(channel, handler); } },
    dialog: { async showOpenDialog() { return { canceled: false, filePaths: [source] }; } },
    getWindow: () => null,
    service,
  });
  const invoke = (channel, payload) => handlers.get(`pdf-library:${channel}`)(null, payload);

  // When
  const connection = await invoke("pick-folder");
  await invoke("sync", { connectionId: connection.connectionId, operationId: "ipc-sync" });
  const document = (await invoke("list", { connectionId: connection.connectionId })).documents[0];
  const read = await invoke("read", { documentId: document.documentId });
  await invoke("save-index", { documentId: document.documentId, version: document.version, index: { pages: ["indexed"] } });
  const stored = await invoke("load-index", { documentId: document.documentId });
  const capabilities = await invoke("capabilities");
  await invoke("disconnect", { connectionId: connection.connectionId });

  // Then
  assert.deepEqual(Buffer.from(read), bytes);
  assert.deepEqual(stored.index, { pages: ["indexed"] });
  assert.equal(capabilities.ocr.integrated, false);
  await assert.rejects(invoke("read", { documentId: document.documentId }), (error) => error.code === "PDF_LIBRARY_UNAUTHORIZED");
  assert.equal(fs.readFileSync(sourcePath).equals(bytes), true);
});

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function backupModule() {
  let source = fs.readFileSync(path.join(root, "js/backup-zip.js"), "utf8");
  source = source.replace(/\bexport\s+/g, "");
  source += "\nglobalThis.__exports = { buildBackupZip, parseBackupZip, isZip, zipStore };";
  const sandbox = { Blob, TextEncoder, TextDecoder, Uint8Array, DataView, JSON, Map, Error, atob, btoa };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "js/backup-zip.js" });
  return sandbox.__exports;
}

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function storedZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.data);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034B50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, entry.flags || 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);
    localParts.push(local);
    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014B50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, entry.flags || 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length;
  }
  const centralStart = offset;
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054B50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralStart, true);
  const size = localParts.length + centralParts.length + 1;
  const chunks = [...localParts, ...centralParts, end];
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let cursor = 0;
  for (const chunk of chunks) { output.set(chunk, cursor); cursor += chunk.length; }
  assert.equal(size, chunks.length);
  return output;
}

async function bytesOf(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

function personalModule(store) {
  let source = fs.readFileSync(path.join(root, "js/personal-objects.js"), "utf8");
  source = source.replace(/^import\s+.*?;\r?\n/gm, "").replace(/\bexport\s+/g, "");
  source += "\nasync function __bootForTest() { await bootstrapStorage(); }\nfunction __configureFixture(state, names) { _state = state; askNameCategory = (_cats, done) => done(names.shift(), '기본'); }\nasync function __drainForTest() { await _mutationTail; }\nglobalThis.__exports = { exportLibraryString, importLibraryString, __bootForTest, __configureFixture, __drainForTest, saveCurrentSelection, deleteItem };";
  const sandbox = {
    Array, Date: store.Date || Date, JSON, Map, Set, Math, Promise, Error,
    document: { documentElement: { getAttribute: () => "p" } },
    localStorage: { getItem: () => null, setItem() {} },
    idbAvailable: () => true,
    idbGet: async () => store.read(),
    idbSet: async (_key, value) => store.write(value),
    showAlert() {}, showConfirm: store.confirm || (async () => false),
    renderObject() {}, getObjectBBox() {}, instantiateObjectsAt() {},
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "js/personal-objects.js" });
  return sandbox.__exports;
}

function settingsModule(importLibraryString) {
  let source = fs.readFileSync(path.join(root, "js/settings.js"), "utf8");
  source = source.replace(/^import\s+[\s\S]*?;\r?\n/gm, "").replace(/\bexport\s+/g, "");
  source += "\nglobalThis.__exports = { applyImportedSettings };";
  const sandbox = {
    Array, Date, JSON, Object, Promise, Set, Map, TextDecoder,
    TEXT_FONTS: [], TEXT_STYLES: [], DEFAULT_TEXT_FONT: "sans-serif", DEFAULT_TEXT_SIZE_MM: 3,
    PREVIEW_BG_KEY: "5e.previewBackgrounds", loadPreviewBackgrounds() {}, addPreviewBackground() {}, removePreviewBackground() {},
    localStorage: { getItem: () => null, setItem() {} },
    document: { documentElement: { setAttribute() {} }, getElementById: () => null },
    showConfirm: async () => true,
    importLibraryString,
    hasLibraryItems: () => false,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "js/settings.js" });
  return sandbox.__exports;
}

test("Given a writer-produced backup, when parsed, then image payloads round-trip", async () => {
  const zip = backupModule();
  const payload = {
    kind: "5e-settings",
    data: { picture: "data:image/png;base64,AQID" },
  };
  const encoded = await bytesOf(zip.buildBackupZip(payload));
  assert.equal(zip.isZip(encoded), true);
  assert.deepEqual(JSON.parse(JSON.stringify(zip.parseBackupZip(encoded))), payload);
});

test("Given a Korean export path, when written, then both ZIP headers mark UTF-8 and Python decodes the name", async () => {
  const zip = backupModule();
  const name = "5E-AI-결과/선택 결과.png";
  const encoded = await bytesOf(zip.zipStore([{ name, data: Uint8Array.of(1, 2, 3) }]));
  const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034B50);
  assert.equal(view.getUint16(6, true), 0x0800, "local header must mark its UTF-8 name");
  const centralOffset = encoded.findIndex((byte, index) =>
    byte === 0x50 && encoded[index + 1] === 0x4B && encoded[index + 2] === 0x01 && encoded[index + 3] === 0x02);
  assert.ok(centralOffset > 0);
  assert.equal(view.getUint16(centralOffset + 8, true), 0x0800, "central header must mark its UTF-8 name");

  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "5e-zip-utf8-"));
  const archivePath = path.join(tempDirectory, "result.zip");
  try {
    fs.writeFileSync(archivePath, encoded);
    const independent = spawnSync("python3", [
      "-c",
      "import json,sys,zipfile; print(json.dumps(zipfile.ZipFile(sys.argv[1]).namelist(), ensure_ascii=False))",
      archivePath,
    ], { encoding: "utf8" });
    assert.equal(independent.status, 0, independent.stderr);
    assert.deepEqual(JSON.parse(independent.stdout), [name]);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("Given a legacy flag-zero backup, when parsed, then it remains readable while unrelated flags are rejected", () => {
  const zip = backupModule();
  const entries = [
    { name: "backup.json", data: JSON.stringify({ kind: "legacy" }) },
    { name: "manifest.json", data: "[]" },
  ];
  assert.deepEqual(JSON.parse(JSON.stringify(zip.parseBackupZip(storedZip(entries)))), { kind: "legacy" });
  assert.throws(
    () => zip.parseBackupZip(storedZip(entries.map(entry => ({ ...entry, flags: 0x0001 })))),
    /지원하지 않거나 너무 큰 ZIP 항목/,
  );
});

test("Given corrupt, truncated, duplicate, unsafe, or incomplete ZIP data, when parsed, then it rejects", async () => {
  const zip = backupModule();
  const valid = await bytesOf(zip.buildBackupZip({ data: { picture: "data:image/png;base64,AQID" } }));
  const corrupted = valid.slice();
  const imageOffset = new TextDecoder().decode(corrupted).indexOf("\u0001\u0002\u0003");
  corrupted[imageOffset] ^= 0xFF;
  const requiredBackup = JSON.stringify({ data: { picture: "[[5E-ZIPIMG:0]]" } });
  const malformed = [
    corrupted,
    valid.slice(0, valid.length - 8),
    storedZip([{ name: "backup.json", data: "{}" }, { name: "backup.json", data: "{}" }, { name: "manifest.json", data: "[]" }]),
    storedZip([{ name: "backup.json", data: "{}" }, { name: "manifest.json", data: "[]" }, { name: "../outside", data: "x" }]),
    storedZip([{ name: "backup.json", data: requiredBackup }, { name: "manifest.json", data: "[]" }]),
    storedZip([{ name: "backup.json", data: "{}" }]),
  ];
  for (const bytes of malformed) assert.throws(() => zip.parseBackupZip(bytes), /ZIP|backup|manifest|CRC|이미지|항목/);
});

test("Given quota or transaction abort, when a library import is attempted, then the good cache remains published", async () => {
  for (const failureName of ["QuotaExceededError", "AbortError"]) {
    const stored = [{ id: "good" }];
    let writes = 0;
    const library = personalModule({
      read: () => stored,
      write: async () => {
        if (writes++ === 0) throw new Error(failureName);
      },
    });
    await library.__bootForTest();
    const applied = await library.importLibraryString(JSON.stringify([{ id: "bad" }]));
    assert.equal(applied, false);
    assert.equal(library.exportLibraryString(), JSON.stringify(stored));
    assert.equal(await library.importLibraryString(JSON.stringify([{ id: "retry" }])), true);
    assert.equal(library.exportLibraryString(), JSON.stringify([{ id: "retry" }]));
  }
});

test("Given two library imports, when the first durable commit is delayed, then commits and publication stay ordered", async () => {
  let releaseFirst;
  const firstWriteStarted = new Promise((resolve) => { releaseFirst = resolve; });
  const writes = [];
  const library = personalModule({
    read: () => [{ id: "good" }],
    write: async (value) => {
      writes.push(value[0].id);
      if (value[0].id === "first") await firstWriteStarted;
    },
  });
  await library.__bootForTest();
  const first = library.importLibraryString(JSON.stringify([{ id: "first" }]));
  const second = library.importLibraryString(JSON.stringify([{ id: "second" }]));
  await Promise.resolve();
  assert.equal(library.exportLibraryString(), JSON.stringify([{ id: "good" }]));
  releaseFirst();
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.deepEqual(writes, ["first", "second"]);
  assert.equal(library.exportLibraryString(), JSON.stringify([{ id: "second" }]));
});

test("Given two same-tick actual save callbacks, when one saved entry is deleted, then the other remains addressable", async () => {
  let releaseFirst;
  let markFirstWrite;
  const firstWrite = new Promise((resolve) => { markFirstWrite = resolve; });
  const unblockFirst = new Promise((resolve) => { releaseFirst = resolve; });
  const frozenTime = 1_735_689_600_000;
  class FrozenDate extends Date {
    constructor(...args) { super(...(args.length ? args : [frozenTime])); }
    static now() { return frozenTime; }
  }
  const library = personalModule({
    Date: FrozenDate,
    confirm: () => true,
    read: () => [],
    write: async (value) => {
      if (value.length === 1) { markFirstWrite(); await unblockFirst; }
    },
  });
  await library.__bootForTest();
  const state = { get: () => ({ selectedIds: ["object"], objects: [{ id: "object", type: "rect" }] }) };
  library.__configureFixture(state, ["A", "B"]);
  library.saveCurrentSelection();
  library.saveCurrentSelection();
  await firstWrite;
  releaseFirst();
  await library.__drainForTest();
  const savedItems = JSON.parse(library.exportLibraryString());
  assert.deepEqual(savedItems.map((item) => item.name), ["A", "B"]);
  assert.notEqual(savedItems[0].id, savedItems[1].id, "same-tick saves must receive unique durable IDs");
  assert.equal(await library.deleteItem(savedItems[0]), true);
  assert.deepEqual(JSON.parse(library.exportLibraryString()), [savedItems[1]]);
});

test("Given imported IDs for a frozen clock tick, when an actual save callback runs, then it chooses an unused ID", async () => {
  const frozenTime = 1_735_689_600_000;
  class FrozenDate extends Date {
    constructor(...args) { super(...(args.length ? args : [frozenTime])); }
    static now() { return frozenTime; }
  }
  const timestamp = frozenTime.toString(36);
  const library = personalModule({
    Date: FrozenDate,
    read: () => [{ id: `po_${timestamp}` }, { id: `po_${timestamp}_0` }],
    write: async () => {},
  });
  await library.__bootForTest();
  const state = { get: () => ({ selectedIds: ["object"], objects: [{ id: "object", type: "rect" }] }) };
  library.__configureFixture(state, ["A"]);
  library.saveCurrentSelection();
  await library.__drainForTest();
  const savedItems = JSON.parse(library.exportLibraryString());
  assert.equal(new Set(savedItems.map((item) => item.id)).size, savedItems.length);
});

test("Given a delayed imported ID, when an actual save callback queues and is deleted, then the import remains", async () => {
  let releaseImport;
  let markImportWrite;
  const importWrite = new Promise((resolve) => { markImportWrite = resolve; });
  const unblockImport = new Promise((resolve) => { releaseImport = resolve; });
  const frozenTime = 1_735_689_600_000;
  class FrozenDate extends Date {
    constructor(...args) { super(...(args.length ? args : [frozenTime])); }
    static now() { return frozenTime; }
  }
  const imported = { id: `po_${frozenTime.toString(36)}_0`, name: "imported" };
  let writes = 0;
  const library = personalModule({
    Date: FrozenDate,
    confirm: () => true,
    read: () => [],
    write: async () => {
      if (writes++ === 0) { markImportWrite(); await unblockImport; }
    },
  });
  await library.__bootForTest();
  const importing = library.importLibraryString(JSON.stringify([imported]));
  await importWrite;
  const state = { get: () => ({ selectedIds: ["object"], objects: [{ id: "object", type: "rect" }] }) };
  library.__configureFixture(state, ["saved"]);
  library.saveCurrentSelection();
  releaseImport();
  assert.equal(await importing, true);
  await library.__drainForTest();
  const savedItems = JSON.parse(library.exportLibraryString());
  assert.equal(new Set(savedItems.map((item) => item.id)).size, savedItems.length);
  const saved = savedItems.find((item) => item.name === "saved");
  assert.equal(await library.deleteItem(saved), true);
  assert.deepEqual(JSON.parse(library.exportLibraryString()), [imported]);
});

test("Given two rapid actual delete callbacks, when the first commit is delayed, then neither item is resurrected", async () => {
  let releaseFirst;
  let markFirstWrite;
  const firstWrite = new Promise((resolve) => { markFirstWrite = resolve; });
  const unblockFirst = new Promise((resolve) => { releaseFirst = resolve; });
  const library = personalModule({
    read: () => [{ id: "A" }, { id: "B" }],
    confirm: () => true,
    write: async (value) => {
      if (value.length === 1) { markFirstWrite(); await unblockFirst; }
    },
  });
  await library.__bootForTest();
  const first = library.deleteItem({ id: "A", name: "A" });
  const second = library.deleteItem({ id: "B", name: "B" });
  await firstWrite;
  releaseFirst();
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(library.exportLibraryString(), null);
});

test("Given queued add, delete, and replacement import, when the first commit is delayed, then every operation observes its predecessor", async () => {
  let releaseFirst;
  let markFirstWrite;
  const firstWrite = new Promise((resolve) => { markFirstWrite = resolve; });
  const unblockFirst = new Promise((resolve) => { releaseFirst = resolve; });
  const writes = [];
  const library = personalModule({
    read: () => [{ id: "old" }, { id: "keep" }],
    confirm: () => true,
    write: async (value) => {
      writes.push(value.map((item) => item.id || item.name));
      if (writes.length === 1) { markFirstWrite(); await unblockFirst; }
    },
  });
  await library.__bootForTest();
  const state = { get: () => ({ selectedIds: ["object"], objects: [{ id: "object", type: "rect" }] }) };
  library.__configureFixture(state, ["added"]);
  library.saveCurrentSelection();
  const deleted = library.deleteItem({ id: "old", name: "old" });
  await Promise.resolve();
  await Promise.resolve();
  const imported = library.importLibraryString(JSON.stringify([{ id: "imported" }]));
  await firstWrite;
  releaseFirst();
  assert.equal(await deleted, true);
  assert.equal(await imported, true);
  const normalizedWrites = writes.map((write) => write.map((id) => id.startsWith("po_") ? "added" : id));
  assert.deepEqual(normalizedWrites, [["old", "keep", "added"], ["keep", "added"], ["imported"]]);
  assert.equal(library.exportLibraryString(), JSON.stringify([{ id: "imported" }]));
});

test("Given a failed library restore, when settings applies it, then the result does not report it as applied", async () => {
  const settings = settingsModule(async () => false);
  const result = await settings.applyImportedSettings({ "5e.personalObjects": "[]" });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    applied: [], failed: ["5e.personalObjects"], skipped: [],
  });
});

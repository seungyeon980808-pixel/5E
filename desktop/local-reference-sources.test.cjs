const test = require("node:test");
const assert = require("node:assert/strict");

test("web folders expose images and PDFs through the shared source shape", async () => {
  const { sourcesFromWebFiles } = await import("../js/local-reference-sources.mjs");
  const files = [
    { name: "diagram.png", webkitRelativePath: "lesson/diagram.png", size: 3, lastModified: 1 },
    { name: "optics.pdf", webkitRelativePath: "lesson/optics.pdf", size: 4, lastModified: 2,
      arrayBuffer: async () => new ArrayBuffer(4) },
    { name: "notes.txt", webkitRelativePath: "lesson/notes.txt", size: 5, lastModified: 3 },
  ];
  const result = sourcesFromWebFiles(files);
  assert.deepEqual(result.images.map((item) => item.relativePath), ["lesson/diagram.png"]);
  assert.deepEqual(result.pdfs.map((item) => item.relativePath), ["lesson/optics.pdf"]);
  assert.equal((await result.pdfs[0].read()).byteLength, 4);
});

test("desktop PDF sources read bytes only through the desktop bridge", async () => {
  const { sourcesFromDesktopResult } = await import("../js/local-reference-sources.mjs");
  const calls = [];
  const result = sourcesFromDesktopResult({
    items: [],
    pdfs: [{ path: "C:\\lesson\\optics.pdf", name: "optics.pdf", relativePath: "optics.pdf" }],
  }, { readLocalPdf: async (path) => { calls.push(path); return new Uint8Array([1, 2]); } });
  assert.deepEqual(Array.from(await result.pdfs[0].read()), [1, 2]);
  assert.deepEqual(calls, ["C:\\lesson\\optics.pdf"]);
});

test("web and desktop entry points are both wired into the search UI", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const search = fs.readFileSync(path.join(__dirname, "..", "js", "ai-reference-search.js"), "utf8");
  const dialog = fs.readFileSync(path.join(__dirname, "..", "js", "ai-reference-dialog.js"), "utf8");
  const workspace = fs.readFileSync(path.join(__dirname, "..", "js", "ai-pdf-workspace.js"), "utf8");
  const preload = fs.readFileSync(path.join(__dirname, "preload.cjs"), "utf8");
  const installGuide = fs.readFileSync(path.join(__dirname, "..", "js", "ai-install-guide.js"), "utf8");
  assert.match(dialog, /webkitdirectory/);
  assert.match(workspace, /setAttribute\("aria-pressed"/);
  assert.match(search, /event\.key === "Escape"/);
  assert.match(search, /sourcesFromWebFiles/);
  assert.match(search, /createDesktopFolderConnector/);
  assert.match(search, /PDF 검색 가능 페이지/);
  assert.match(workspace, /Windows 폴더 선택창에서는 파일이 표시되지 않습니다/);
  assert.match(dialog, /data-ai-pdf-workspace/);
  assert.match(dialog, /data-ai-pdf-crop-toggle/);
  assert.match(dialog, /data-ai-pdf-add-crop/);
  assert.match(workspace, /canvas\.toDataURL\("image\/png"\)/);
  assert.match(search, /sourceKind: "local-pdf-crop"/);
  assert.match(preload, /readLocalPdf/);
  assert.doesNotMatch(installGuide, /window\.fiveEDesktop &&/);
  assert.match(installGuide, /openDesktopPanel\(\)/);
});

test("desktop folder picker explains that Windows hides files in directory mode", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const main = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  assert.match(main, /PDF 파일은 표시되지 않습니다 — 현재 폴더를 선택하세요/);
  assert.match(main, /properties: \["openDirectory"\]/);
});

test("PDF empty-state text preserves Korean words before overflow fallback", () => {
  // Given
  const fs = require("node:fs");
  const path = require("node:path");

  // When
  const css = fs.readFileSync(path.join(__dirname, "..", "css", "ai-panel.css"), "utf8");

  // Then
  assert.match(css, /\.ai-pdf-result-empty\s*\{[^}]*word-break:\s*keep-all;[^}]*overflow-wrap:\s*anywhere;[^}]*\}/s);
});

test("textless PDF notices wrap without hiding the Korean outcome", () => {
  // Given / When
  const fs = require("node:fs");
  const path = require("node:path");
  const search = fs.readFileSync(path.join(__dirname, "..", "js", "ai-reference-search.js"), "utf8");

  // Then
  assert.match(search, /folderLabel\.style\.whiteSpace = localNotices\.length \? "normal" : ""/);
  assert.match(search, /folderLabel\.style\.wordBreak = localNotices\.length \? "keep-all" : ""/);
  assert.match(search, /folderLabel\.style\.overflowWrap = localNotices\.length \? "anywhere" : ""/);
});

test("browser folder reconnect re-requests read permission through the public connector", async () => {
  // Given
  const { createBrowserFolderConnector } = await import("../js/local-reference-sources.mjs");
  const permissions = ["granted", "prompt"];
  const requests = [];
  const file = { name: "별빛.pdf", size: 4, lastModified: 1, arrayBuffer: async () => new ArrayBuffer(4) };
  const handle = {
    name: "시험",
    queryPermission: async () => permissions.shift(),
    requestPermission: async (options) => { requests.push(options); return "granted"; },
    values: async function* values() { yield { kind: "file", name: file.name, getFile: async () => file }; },
  };
  const connector = createBrowserFolderConnector({ showDirectoryPicker: async () => handle });
  await connector.connect();

  // When
  const result = await connector.reconnect();

  // Then
  assert.equal(result.status, "connected");
  assert.equal(result.folderLabel, "시험");
  assert.deepEqual(result.assets.pdfs.map((item) => item.relativePath), ["시험/별빛.pdf"]);
  assert.deepEqual(requests, [{ mode: "read" }]);
});

test("browser folder connector distinguishes denied and cancelled outcomes", async () => {
  // Given
  const { createBrowserFolderConnector } = await import("../js/local-reference-sources.mjs");
  const deniedHandle = {
    name: "거부",
    queryPermission: async () => "prompt",
    requestPermission: async () => "denied",
  };
  const denied = createBrowserFolderConnector({ showDirectoryPicker: async () => deniedHandle });
  const cancelled = createBrowserFolderConnector({
    showDirectoryPicker: async () => { throw new DOMException("cancelled", "AbortError"); },
  });

  // When / Then
  assert.deepEqual(await denied.connect(), { status: "denied" });
  assert.deepEqual(await cancelled.connect(), { status: "cancelled" });
});

test("desktop folder reconnect uses the same outcome seam and returns the newest listing", async () => {
  // Given
  const { createDesktopFolderConnector } = await import("../js/local-reference-sources.mjs");
  const folders = ["C:\\old", "C:\\new"];
  const desktop = {
    pickLocalImageFolder: async () => ({ folder: folders.shift() }),
    listLocalImages: async (folder) => ({
      folder,
      items: [],
      pdfs: [{ path: `${folder}\\latest.pdf`, name: "latest.pdf", relativePath: "latest.pdf" }],
    }),
    readLocalPdf: async () => new Uint8Array(),
  };
  const connector = createDesktopFolderConnector(desktop);
  await connector.connect();

  // When
  const result = await connector.reconnect();

  // Then
  assert.equal(result.status, "connected");
  assert.equal(result.folderLabel, "C:\\new");
  assert.deepEqual(result.assets.pdfs.map((item) => item.path), ["C:\\new\\latest.pdf"]);
});

test("a slow folder connection cannot replace a newer accepted connection", async () => {
  // Given
  const { createFolderConnectionSession } = await import("../js/local-reference-sources.mjs");
  const pending = [];
  const accepted = [];
  const connector = { reconnect: () => new Promise((resolve) => pending.push(resolve)) };
  const session = createFolderConnectionSession(connector,
    async (assets, label) => accepted.push({ assets, label }));

  // When
  const slow = session.reconnect();
  const fast = session.reconnect();
  pending[1]({ status: "connected", assets: { images: [{ id: "new" }] }, folderLabel: "new" });
  await fast;
  pending[0]({ status: "connected", assets: { images: [{ id: "old" }] }, folderLabel: "old" });
  await slow;

  // Then
  assert.deepEqual(accepted, [{ assets: { images: [{ id: "new" }] }, label: "new" }]);
});

test("a denied browser handle is discarded before the next explicit reconnect", async () => {
  // Given
  const { createBrowserFolderConnector } = await import("../js/local-reference-sources.mjs");
  const denied = { name: "denied", queryPermission: async () => "denied" };
  const granted = { name: "granted", queryPermission: async () => "granted",
    values: async function* values() {} };
  const picked = [denied, granted];
  let pickerCalls = 0;
  const connector = createBrowserFolderConnector({
    showDirectoryPicker: async () => { pickerCalls += 1; return picked.shift(); },
  });

  // When
  const first = await connector.reconnect();
  const second = await connector.reconnect();

  // Then
  assert.equal(first.status, "denied");
  assert.equal(second.status, "connected");
  assert.equal(second.folderLabel, "granted");
  assert.equal(pickerCalls, 2);
});

test("a slow browser connect cannot replace the connector handle selected by a newer connect", async () => {
  // Given
  const { createBrowserFolderConnector } = await import("../js/local-reference-sources.mjs");
  let releaseSlowPermission;
  const slowPermission = new Promise((resolve) => { releaseSlowPermission = resolve; });
  const folder = (name, queryPermission) => ({
    name,
    queryPermission,
    values: async function* values() {},
  });
  const picked = [
    folder("slow-A", () => slowPermission),
    folder("fast-B", async () => "granted"),
  ];
  const connector = createBrowserFolderConnector({
    showDirectoryPicker: async () => picked.shift(),
  });

  // When
  const slow = connector.connect();
  const fast = connector.connect();
  const fastResult = await fast;
  releaseSlowPermission("granted");
  const slowResult = await slow;
  const thirdResult = await connector.reconnect();

  // Then
  assert.equal(fastResult.folderLabel, "fast-B");
  assert.deepEqual(slowResult, { status: "superseded" });
  assert.equal(thirdResult.folderLabel, "fast-B");
});

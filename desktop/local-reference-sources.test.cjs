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
  const preload = fs.readFileSync(path.join(__dirname, "preload.cjs"), "utf8");
  const installGuide = fs.readFileSync(path.join(__dirname, "..", "js", "ai-install-guide.js"), "utf8");
  assert.match(search, /webkitdirectory/);
  assert.match(search, /setAttribute\("aria-pressed"/);
  assert.match(search, /event\.key === "Escape"/);
  assert.match(search, /sourcesFromWebFiles/);
  assert.match(search, /sourcesFromDesktopResult/);
  assert.match(search, /PDF 검색 가능 페이지/);
  assert.match(search, /Windows 폴더 선택창에서는 파일이 표시되지 않습니다/);
  assert.match(search, /`\$\{item\.pageNumber\}쪽 · \$\{item\.name\}`/);
  assert.match(search, /data-ai-pdf-workspace/);
  assert.match(search, /data-ai-pdf-crop-toggle/);
  assert.match(search, /data-ai-pdf-add-crop/);
  assert.match(search, /canvas\.toDataURL\("image\/png"\)/);
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

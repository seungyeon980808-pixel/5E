const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("collectLocalAssets finds nested images and PDFs when a folder is connected", () => {
  // Given
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "5e-local-assets-"));
  const nested = path.join(root, "단원 자료");
  fs.mkdirSync(nested);
  fs.writeFileSync(path.join(root, "대표.png"), Buffer.from([0]));
  fs.writeFileSync(path.join(nested, "빛과 렌즈.pdf"), Buffer.from("%PDF-1.4"));
  fs.writeFileSync(path.join(nested, "메모.txt"), "검색 제외");

  // When
  const { collectLocalAssets } = require("./local-assets.cjs");
  const result = collectLocalAssets(root);

  // Then
  assert.deepEqual(result.images.map((item) => item.relativePath), ["대표.png"]);
  assert.deepEqual(result.pdfs.map((item) => item.relativePath), [path.join("단원 자료", "빛과 렌즈.pdf")]);
});

test("isAllowedLocalAsset accepts only supported files inside a connected root", () => {
  // Given
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "5e-local-security-"));
  const root = path.join(parent, "connected");
  const outside = path.join(parent, "outside");
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  for (const file of [path.join(root, "문서.pdf"), path.join(root, "그림.svg"),
    path.join(root, "메모.txt"), path.join(outside, "문서.pdf")]) fs.writeFileSync(file, "fixture");
  const { isAllowedLocalAsset } = require("./local-assets.cjs");

  // When / Then
  assert.equal(isAllowedLocalAsset(new Set([root]), path.join(root, "문서.pdf")), true);
  assert.equal(isAllowedLocalAsset(new Set([root]), path.join(root, "그림.svg")), true);
  assert.equal(isAllowedLocalAsset(new Set([root]), path.join(root, "문서.pdf"), new Set([".svg"])), false);
  assert.equal(isAllowedLocalAsset(new Set([root]), path.join(outside, "문서.pdf")), false);
  assert.equal(isAllowedLocalAsset(new Set([root]), path.join(root, "메모.txt")), false);
});

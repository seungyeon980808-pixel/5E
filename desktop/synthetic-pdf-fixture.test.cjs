const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  SYNTHETIC_PDF_PROVENANCE,
  createLargeSyntheticPdfSource,
  createSyntheticPdf,
  createSyntheticPdfSource,
  createTextlessSyntheticPdfSource,
} = require("../tests/stabilization/fixtures/pdf/generate-synthetic-pdf.cjs");

globalThis.DOMMatrix ??= class DOMMatrix {};
globalThis.ImageData ??= class ImageData {};
globalThis.Path2D ??= class Path2D {};

async function extractFixturePages(onProgress) {
  const { clearPdfDocumentCache, extractPdfPages } = await import("../js/pdf-document-index.mjs");
  clearPdfDocumentCache();
  return extractPdfPages(createSyntheticPdfSource(), onProgress);
}

test("generated synthetic PDF bytes and provenance are deterministic", () => {
  // Given
  const first = createSyntheticPdf();
  const source = createSyntheticPdfSource();

  // When
  const second = createSyntheticPdf();

  // Then
  assert.deepEqual(second, first);
  assert.equal(
    createHash("sha256").update(first).digest("hex"),
    "9527a5ee75f5e32ab0439b07e2f23df27b18f748c8834e32d092884167cdb53b",
  );
  assert.equal(source.name, "별빛-물리-모의시험-07번.pdf");
  assert.equal(SYNTHETIC_PDF_PROVENANCE.copyrightStatus, "original-synthetic");
  assert.equal(SYNTHETIC_PDF_PROVENANCE.sourceMaterial, "none");
});

test("runtime-generated large PDF reports every indexing step deterministically", async () => {
  // Given
  const { clearPdfDocumentCache, extractPdfPages } = await import("../js/pdf-document-index.mjs");
  const source = createLargeSyntheticPdfSource(48);
  const progress = [];
  clearPdfDocumentCache();

  // When
  const pages = await extractPdfPages(source, (event) => progress.push(event));

  // Then
  assert.equal(source.size < 256 * 1024, true);
  assert.equal(pages.length, 48);
  assert.deepEqual(progress.map(({ pageNumber }) => pageNumber),
    Array.from({ length: 48 }, (_, index) => index + 1));
  assert.deepEqual(progress.at(-1), { pageNumber: 48, pageCount: 48, searchable: true });
});

test("runtime-generated scanned PDF reports only textless pages", async () => {
  // Given
  const { clearPdfDocumentCache, extractPdfPages } = await import("../js/pdf-document-index.mjs");
  const source = createTextlessSyntheticPdfSource(2);
  const progress = [];
  clearPdfDocumentCache();

  // When
  const pages = await extractPdfPages(source, (event) => progress.push(event));

  // Then
  assert.deepEqual(pages, []);
  assert.deepEqual(progress, [
    { pageNumber: 1, pageCount: 2, searchable: false },
    { pageNumber: 2, pageCount: 2, searchable: false },
  ]);
});

test("vendored PDF.js indexes text pages and reports textless page progress", async () => {
  // Given
  const progress = [];

  // When
  const pages = await extractFixturePages((event) => progress.push(event));

  // Then
  assert.deepEqual(progress, [
    { pageNumber: 1, pageCount: 3, searchable: true },
    { pageNumber: 2, pageCount: 3, searchable: true },
    { pageNumber: 3, pageCount: 3, searchable: false },
  ]);
  assert.deepEqual(pages.map((page) => page.pageNumber), [1, 2]);
  assert.match(pages[0].text, /Exam Aster Subject Physics Question 7/);
  assert.match(pages[1].text, /Question 8/);
});

test("generated PDF includes real vector and raster operators", async () => {
  // Given
  await import("../js/pdf-document-index.mjs");
  const { getDocument, OPS } = await import("../vendor/pdfjs/pdf.min.mjs");
  const loadingTask = getDocument({ data: new Uint8Array(createSyntheticPdf()) });
  const pdf = await loadingTask.promise;

  // When
  const operations = await (await pdf.getPage(1)).getOperatorList();
  await pdf.destroy();

  // Then
  assert.ok(operations.fnArray.includes(OPS.constructPath));
  assert.ok(operations.fnArray.includes(OPS.paintImageXObject));
});

test("PDF index exposes authored metadata and rotated page geometry", async () => {
  // Given
  const expectedMetadata = {
    title: "Aster Synthetic Field Exam",
    author: "5E project contributors",
    subject: "Physics",
    keywords: "exam question photon prism",
    creator: "5E deterministic fixture generator",
    producer: "5E test harness",
    exam: "Aster 2026",
    question: "7-8",
  };

  // When
  const pages = await extractFixturePages();

  // Then
  assert.deepEqual(pages[0].metadata, expectedMetadata);
  assert.deepEqual(
    pages.map(({ pageNumber, rotation, width, height }) => ({ pageNumber, rotation, width, height })),
    [
      { pageNumber: 1, rotation: 0, width: 400, height: 300 },
      { pageNumber: 2, rotation: 90, width: 300, height: 400 },
    ],
  );
});

test("PDF metadata normalization excludes arbitrary values", async () => {
  // Given
  const { normalizePdfMetadata } = await import("../js/pdf-document-index.mjs");
  const info = {
    Title: ["not", "scalar"],
    Subject: "Physics",
    Keywords: "x".repeat(1001),
    Custom: { Exam: { injected: true }, Question: 7, Hidden: "not allowlisted" },
  };

  // When
  const metadata = normalizePdfMetadata(info);

  // Then
  assert.deepEqual(metadata, {
    title: "",
    author: "",
    subject: "Physics",
    keywords: "x".repeat(1000),
    creator: "",
    producer: "",
    exam: "",
    question: "7",
  });
});

test("PDF search ranks filename and metadata fields", async () => {
  // Given
  const { rankPdfPages } = await import("../js/pdf-search.mjs");
  const pages = await extractFixturePages();

  // When
  const resultIds = ["별빛", "Field Physics", "Aster 2026", "7 8"]
    .map((query) => rankPdfPages(pages, query).map((page) => page.id));

  // Then
  assert.deepEqual(resultIds, [
    ["synthetic-pdf-fixture:2", "synthetic-pdf-fixture:1"],
    ["synthetic-pdf-fixture:2", "synthetic-pdf-fixture:1"],
    ["synthetic-pdf-fixture:2", "synthetic-pdf-fixture:1"],
    ["synthetic-pdf-fixture:2", "synthetic-pdf-fixture:1"],
  ]);
});

test("PDF search gives repeated multi-token matches a stable higher rank", async () => {
  // Given
  const { rankPdfPages } = await import("../js/pdf-search.mjs");
  const pages = await extractFixturePages();

  // When
  const rankings = [rankPdfPages(pages, "photon prism"), rankPdfPages(pages, "photon prism")];

  // Then
  assert.deepEqual(rankings[1], rankings[0]);
  assert.deepEqual(rankings[0].map((page) => page.id), [
    "synthetic-pdf-fixture:1",
    "synthetic-pdf-fixture:2",
  ]);
  assert.equal(rankings[0][0].matchPercent, 100);
  assert.ok(rankings[0][1].matchPercent < 100);
});

test("PDF search breaks exact metadata score ties by stable page id", async () => {
  // Given
  const { rankPdfPages } = await import("../js/pdf-search.mjs");
  const [page] = await extractFixturePages();
  const tiedPages = [{ ...page, id: "fixture:z" }, { ...page, id: "fixture:a" }];

  // When
  const results = rankPdfPages(tiedPages, "Aster 2026");

  // Then
  assert.deepEqual(results.map((result) => result.id), ["fixture:a", "fixture:z"]);
});

test("crop pixels honor units, rotated dimensions, and image edges", async () => {
  // Given
  const { resolveCropPixelRect } = await import("../js/ai-remote-compositor.js");
  const [, rotatedPage] = await extractFixturePages();

  // When
  const crops = [
    resolveCropPixelRect({ x: 0.1, y: 0.2, w: 0.25, h: 0.5 }, 400, 300),
    resolveCropPixelRect({ x: 10, y: 20, w: 25, h: 50 }, 400, 300),
    resolveCropPixelRect(
      { x: 30, y: 20, w: 60, h: 40, sourceWidth: 150, sourceHeight: 200 },
      rotatedPage.width,
      rotatedPage.height,
    ),
    resolveCropPixelRect({ x: -10, y: 390, w: 500, h: 50, unit: "pixels" }, 300, 400),
  ];

  // Then
  assert.deepEqual(crops, [
    { x: 40, y: 60, width: 100, height: 150, unit: "fraction" },
    { x: 40, y: 60, width: 100, height: 150, unit: "percent" },
    { x: 60, y: 40, width: 120, height: 80, unit: "pixels" },
    { x: 0, y: 390, width: 300, height: 10, unit: "pixels" },
  ]);
});

test("corrupted PDFs reject with a machine-readable PDF.js error type", async () => {
  // Given
  const bytes = createSyntheticPdf().subarray(0, 96);
  const source = {
    ...createSyntheticPdfSource(),
    id: "corrupted-synthetic-pdf",
    size: bytes.length,
    read: async () => Buffer.from(bytes),
  };
  const { clearPdfDocumentCache, extractPdfPages } = await import("../js/pdf-document-index.mjs");
  clearPdfDocumentCache();

  // When / Then
  await assert.rejects(
    extractPdfPages(source),
    (error) => error?.name === "InvalidPDFException",
  );
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { createSyntheticPdfSource } = require("../tests/stabilization/fixtures/pdf/generate-synthetic-pdf.cjs");

globalThis.DOMMatrix ??= class DOMMatrix {};
globalThis.ImageData ??= class ImageData {};
globalThis.Path2D ??= class Path2D {};

function pageWithFigures(figureCount) {
  const width = 160;
  const height = 120;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const line = (left, top, right, bottom) => {
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = data[offset + 1] = data[offset + 2] = 0;
        data[offset + 3] = 255;
      }
    }
  };
  const box = (left, top, boxWidth, boxHeight) => {
    line(left, top, left + boxWidth, top + 3);
    line(left, top + boxHeight - 3, left + boxWidth, top + boxHeight);
    line(left, top, left + 3, top + boxHeight);
    line(left + boxWidth - 3, top, left + boxWidth, top + boxHeight);
  };
  if (figureCount >= 1) box(12, 18, 54, 38);
  if (figureCount >= 2) box(92, 66, 54, 38);
  return { data, width, height };
}

test("whole PDF inventory retains textless pages for diagram discovery", async () => {
  const { extractPdfPageInventory, clearPdfDocumentCache } = await import("../js/pdf-document-index.mjs");
  const source = createSyntheticPdfSource();
  await clearPdfDocumentCache();

  const pages = await extractPdfPageInventory(source);

  assert.equal(pages.length, 3);
  assert.deepEqual(pages.map((page) => page.pageNumber), [1, 2, 3]);
  assert.deepEqual(pages.map((page) => page.searchable), [true, true, false]);
  assert.equal(pages.every((page) => page.source === source), true);
});

test("diagram discovery scans every page and returns stable ordered candidates", async () => {
  const { discoverPdfCandidates } = await import("../js/pdf-candidate-workflow.mjs");
  const source = createSyntheticPdfSource();
  const pages = [1, 2, 3].map((pageNumber) => ({
    id: `${source.id}:${pageNumber}`,
    pageNumber,
    source,
  }));

  const manifest = await discoverPdfCandidates({
    source,
    pages,
    loadPageImageData: async (_source, pageNumber) => (
      pageNumber === 1 ? pageWithFigures(2)
        : pageNumber === 2 ? pageWithFigures(1)
          : pageWithFigures(0)
    ),
  });

  assert.deepEqual(manifest.candidates.map(({ pageNumber }) => pageNumber), [1, 1, 2]);
  assert.deepEqual(manifest.candidates.map(({ candidateIndex }) => candidateIndex), [1, 2, 1]);
  assert.equal(manifest.candidates.every(({ included }) => included), true);
  assert.equal(manifest.candidates.every(({ box }) => Object.values(box).every((value) => value >= 0 && value <= 1)), true);
  assert.deepEqual(manifest.pages.map(({ pageNumber, candidateCount }) => ({ pageNumber, candidateCount })), [
    { pageNumber: 1, candidateCount: 2 },
    { pageNumber: 2, candidateCount: 1 },
    { pageNumber: 3, candidateCount: 0 },
  ]);
});

test("candidate review supports include, split, merge, and deterministic restore", async () => {
  const { createPdfCandidateReview } = await import("../js/pdf-candidate-workflow.mjs");
  const manifest = {
    version: 1,
    sourceId: "pdf",
    sourceName: "exam.pdf",
    pages: [{ pageNumber: 1, candidateCount: 2 }],
    candidates: [
      {
        id: "pdf:p1:c1",
        sourceId: "pdf",
        pageNumber: 1,
        candidateIndex: 1,
        box: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
        included: true,
      },
      {
        id: "pdf:p1:c2",
        sourceId: "pdf",
        pageNumber: 1,
        candidateIndex: 2,
        box: { x: 0.5, y: 0.2, w: 0.4, h: 0.5 },
        included: true,
      },
    ],
  };
  const review = createPdfCandidateReview(manifest);

  assert.equal(review.toggleIncluded("pdf:p1:c1").included, false);
  const split = review.split("pdf:p1:c2", "vertical");
  assert.deepEqual(split.map(({ box }) => box), [
    { x: 0.5, y: 0.2, w: 0.2, h: 0.5 },
    { x: 0.7, y: 0.2, w: 0.2, h: 0.5 },
  ]);
  review.toggleMergeSelection(split[0].id);
  review.toggleMergeSelection(split[1].id);
  const merged = review.mergeSelected();
  assert.deepEqual(merged.box, { x: 0.5, y: 0.2, w: 0.4, h: 0.5 });
  assert.deepEqual(review.included().map(({ id }) => id), [merged.id]);

  const snapshot = review.snapshot();
  const restored = createPdfCandidateReview(snapshot);
  assert.deepEqual(restored.snapshot(), snapshot);
});

test("candidate review refuses to merge regions from different pages", async () => {
  const { createPdfCandidateReview } = await import("../js/pdf-candidate-workflow.mjs");
  const review = createPdfCandidateReview({
    version: 1,
    sourceId: "pdf",
    sourceName: "exam.pdf",
    pages: [],
    candidates: [
      { id: "a", sourceId: "pdf", pageNumber: 1, box: { x: 0, y: 0, w: 0.2, h: 0.2 }, included: true },
      { id: "b", sourceId: "pdf", pageNumber: 2, box: { x: 0, y: 0, w: 0.2, h: 0.2 }, included: true },
    ],
  });
  review.toggleMergeSelection("a");
  review.toggleMergeSelection("b");

  assert.throws(() => review.mergeSelected(), /같은 PDF 페이지/);
  assert.equal(review.candidates().length, 2);
});

test("candidate filenames preserve source, page, and candidate while removing forbidden characters", async () => {
  const { buildCandidateFilename } = await import("../js/pdf-candidate-workflow.mjs");

  assert.equal(
    buildCandidateFilename({ name: "물리:중간고사?<1>.pdf" }, 7, 3),
    "물리-중간고사-1-p007-c03.png",
  );
  assert.equal(
    buildCandidateFilename({ name: "CON.pdf" }, 1, 1),
    "_CON-p001-c01.png",
    "Windows device names must not become output basenames",
  );
});

test("candidate manifests are byte-stable for identical PDF page pixels", async () => {
  const { discoverPdfCandidates } = await import("../js/pdf-candidate-workflow.mjs");
  const source = { id: "stable", name: "exam.pdf" };
  const pages = [{ id: "stable:1", pageNumber: 1, source }];
  const input = {
    source,
    pages,
    loadPageImageData: async () => pageWithFigures(2),
  };

  assert.equal(JSON.stringify(await discoverPdfCandidates(input)), JSON.stringify(await discoverPdfCandidates(input)));
});

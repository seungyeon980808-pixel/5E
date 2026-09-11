import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { createCanvas, GlobalFonts, loadImage, PDFDocument } from "@napi-rs/canvas";
import { createWorker } from "tesseract.js";
import { createDocumentRecord } from "../js/pdf-library/contract.js";
import { createPdfOcrService } from "../js/pdf-library/ocr.js";
import { createPdfRuntime } from "../js/pdf-library/pdf-runtime.js";
import { buildSearchIndex, searchIndex } from "../js/pdf-library/search.js";

function imageOnlyDocument(pageCount = 1) {
  return createDocumentRecord({
    id: "scan", title: "Scanned worksheet",
    source: { kind: "file", locator: "test:scan", displayName: "scan.pdf" },
    pageCount, status: "image-only",
    pages: Array.from({ length: pageCount }, (_, index) => ({
      documentId: "scan", pageNumber: index + 1, widthPoints: 612, heightPoints: 792,
      rotation: 0, text: "", words: [], items: [],
    })),
  });
}

async function rasterKoreanPdf() {
  const fontPath = "/System/Library/Fonts/Supplemental/AppleGothic.ttf";
  if (!GlobalFonts.registerFromPath(fontPath, "OcrFixtureHangul")) throw new Error("A Korean fixture font is required");
  const raster = createCanvas(1400, 700);
  const context = raster.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, raster.width, raster.height);
  context.fillStyle = "#000000";
  context.font = "64px OcrFixtureHangul";
  context.fillText("운동량 보존 실험", 80, 180);
  context.fillText("MOMENTUM LAB", 80, 360);
  const image = await loadImage(await raster.encode("png"));
  const pdf = new PDFDocument({ title: "Raster OCR fixture", creator: "5E test" });
  const page = pdf.beginPage(612, 792);
  page.fillStyle = "#ffffff";
  page.fillRect(0, 0, 612, 792);
  page.drawImage(image, 0, 0, 612, 306);
  pdf.endPage();
  return new Uint8Array(pdf.close());
}

test("Given an image-only document, when OCR finishes, then normalized words are searchable", async () => {
  // Given
  const document = imageOnlyDocument(2);
  const renderedPages = [];
  let activeRecognitions = 0;
  let maximumActiveRecognitions = 0;
  let terminated = 0;
  const runtime = {
    async renderPage({ pageNumber, dpi }) {
      renderedPages.push({ pageNumber, dpi });
      return { bytes: Uint8Array.of(137, 80, 78, 71), width: 1000, height: 2000 };
    },
  };
  const worker = {
    async recognize(_bytes, _options, output) {
      activeRecognitions += 1;
      maximumActiveRecognitions = Math.max(maximumActiveRecognitions, activeRecognitions);
      assert.deepEqual(output, { blocks: true, text: true });
      await Promise.resolve();
      activeRecognitions -= 1;
      return { data: {
        text: "운동량 보존 실험",
        blocks: [{ paragraphs: [{ lines: [{ words: [
          { text: "운동량", confidence: 94, bbox: { x0: 100, y0: 200, x1: 300, y1: 280 } },
          { text: "보존", confidence: 88, bbox: { x0: 320, y0: 200, x1: 450, y1: 280 } },
        ] }] }] }],
        confidence: 91,
      } };
    },
    async terminate() { terminated += 1; },
  };
  const service = createPdfOcrService({ runtime, workerFactory: async () => worker });

  // When
  const result = await service.recognizeDocument({ document, language: "kor+eng" });
  const matches = searchIndex(buildSearchIndex([result.document]), { query: "운동량 보존" });

  // Then
  assert.equal(result.status, "recognized");
  assert.equal(result.confidence, 0.91);
  assert.equal(result.document.status, "indexed");
  assert.deepEqual(result.document.pages[0].words[0].rect, [0.1, 0.1, 0.2, 0.04]);
  assert.equal(matches.length, 2);
  assert.deepEqual(renderedPages, [{ pageNumber: 1, dpi: 240 }, { pageNumber: 2, dpi: 240 }]);
  assert.equal(maximumActiveRecognitions, 1);
  assert.equal(terminated, 1);
  assert.equal(document.status, "image-only");
  assert.equal(document.pages[0].text, "");
});

test("Given OCR in progress, when aborted, then its worker terminates and no document is returned", async () => {
  // Given
  const controller = new AbortController();
  let rejectRecognition;
  let terminated = 0;
  let markRecognitionStarted;
  const recognitionStarted = new Promise((resolve) => { markRecognitionStarted = resolve; });
  const worker = {
    recognize() {
      return new Promise((_resolve, reject) => {
        rejectRecognition = reject;
        markRecognitionStarted();
      });
    },
    async terminate() {
      terminated += 1;
      rejectRecognition(new DOMException("Aborted", "AbortError"));
    },
  };
  const service = createPdfOcrService({
    runtime: { async renderPage() { return { bytes: Uint8Array.of(1), width: 10, height: 10 }; } },
    workerFactory: async () => worker,
  });

  // When
  const pending = service.recognizeDocument({ document: imageOnlyDocument(), signal: controller.signal });
  await recognitionStarted;
  controller.abort();

  // Then
  await assert.rejects(pending, (error) => error?.name === "AbortError");
  assert.equal(terminated, 1);
});

test("Given OCR is active, when another document starts, then a second worker is not created", async () => {
  // Given
  let finishRecognition;
  const recognition = new Promise((resolve) => { finishRecognition = resolve; });
  let workerCount = 0;
  const service = createPdfOcrService({
    runtime: { async renderPage() { return { bytes: Uint8Array.of(1), width: 10, height: 10 }; } },
    workerFactory: async () => {
      workerCount += 1;
      return { recognize: () => recognition, async terminate() {} };
    },
  });
  const first = service.recognizeDocument({ document: imageOnlyDocument() });
  await Promise.resolve();

  // When / Then
  await assert.rejects(() => service.recognizeDocument({ document: imageOnlyDocument() }), /already active/i);
  assert.equal(workerCount, 1);
  finishRecognition({ data: { text: "done", blocks: [], confidence: 90 } });
  await first;
});

test("Given a page with no recognized words, when OCR finishes, then it reports unsupported", async () => {
  // Given
  const service = createPdfOcrService({
    runtime: { async renderPage() { return { bytes: Uint8Array.of(1), width: 10, height: 10 }; } },
    workerFactory: async () => ({
      async recognize() { return { data: { text: "", blocks: [], confidence: 0 } }; },
      async terminate() {},
    }),
  });

  // When
  const result = await service.recognizeDocument({ document: imageOnlyDocument() });

  // Then
  assert.equal(result.status, "unsupported");
  assert.equal(result.pages[0].status, "unsupported");
  assert.equal(result.document.status, "image-only");
});

test("Given a text-indexed document, when OCR is requested, then it is rejected before rendering", async () => {
  // Given
  const imageOnly = imageOnlyDocument();
  const indexed = createDocumentRecord({
    ...imageOnly, status: "indexed",
    pages: [{ ...imageOnly.pages[0], text: "Existing digital text", words: [{ text: "Existing", rect: [0.1, 0.1, 0.1, 0.03] }] }],
  });
  let rendered = false;
  const service = createPdfOcrService({
    runtime: { async renderPage() { rendered = true; } },
    workerFactory: async () => { throw new Error("must not create worker"); },
  });

  // When / Then
  await assert.rejects(() => service.recognizeDocument({ document: indexed }), /image-only/i);
  assert.equal(rendered, false);
});

test("Given a mixed document, when OCR runs, then only its image-only pages are rendered", async () => {
  // Given
  const blank = imageOnlyDocument(2);
  const mixed = createDocumentRecord({
    ...blank, status: "indexed",
    pages: [
      { ...blank.pages[0], text: "Existing text", words: [{ text: "Existing", rect: [0.1, 0.1, 0.1, 0.03] }] },
      blank.pages[1],
    ],
  });
  const renderedPages = [];
  const service = createPdfOcrService({
    runtime: { async renderPage({ pageNumber }) { renderedPages.push(pageNumber); return { bytes: Uint8Array.of(1), width: 100, height: 100 }; } },
    workerFactory: async () => ({
      async recognize() { return { data: { text: "New scan text", blocks: [], confidence: 90 } }; },
      async terminate() {},
    }),
  });

  // When
  const result = await service.recognizeDocument({ document: mixed, language: "eng" });

  // Then
  assert.deepEqual(renderedPages, [2]);
  assert.equal(result.document.pages[0].text, "Existing text");
  assert.equal(result.document.pages[1].text, "New scan text");
});

test("Given a genuine raster-only PDF, when local OCR runs, then Hangul is recognized and searchable", async (context) => {
  // Given
  const evidenceDirectory = ".omo/evidence/pdf-library/OCR";
  await mkdir(evidenceDirectory, { recursive: true });
  const fixture = await rasterKoreanPdf();
  await writeFile(`${evidenceDirectory}/raster-korean-fixture.pdf`, fixture);
  const runtime = createPdfRuntime({ canvasFactory: { create: createCanvas }, maxRenderPixels: 16_000_000 });
  context.after(() => runtime.clearCache());
  const document = await runtime.openDocument({
    id: "raster-korean", title: "Raster Korean fixture",
    source: { kind: "file", locator: "test:raster-korean", displayName: "raster-korean.pdf" },
    data: fixture,
  });
  const progress = [];
  const service = createPdfOcrService({
    runtime,
    workerFactory: ({ language, logger }) => createWorker(language.split("+"), 1, {
      langPath: resolve("vendor/ocr/lang"), gzip: true, cacheMethod: "none", logger,
    }),
  });

  // When
  const result = await service.recognizeDocument({
    document, language: "kor+eng", onProgress(event) { progress.push(event); },
  });
  const matches = searchIndex(buildSearchIndex([result.document]), { query: "운동량 보존" });
  const rendered = await runtime.renderPage({ documentId: document.id, pageNumber: 1, dpi: 120 });
  await writeFile(`${evidenceDirectory}/raster-korean-rendered.png`, rendered.bytes);
  await writeFile(`${evidenceDirectory}/ocr-result.json`, JSON.stringify({
    sourceStatus: document.status,
    recognizedStatus: result.status,
    confidence: result.confidence,
    text: result.document.pages[0].text,
    words: result.document.pages[0].words,
    searchMatches: matches.length,
    progressStages: progress.map((event) => event.stage),
  }, null, 2));

  // Then
  assert.equal(document.status, "image-only");
  assert.equal(result.document.pages[0].text.includes("운동량 보존 실험"), true);
  assert.equal(result.confidence >= 0.8, true);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].matchRects.length >= 2, true);
  assert.equal(progress.some((event) => event.stage === "recognizing" && event.progress > 0), true);
  assert.equal(progress.at(-1).stage, "complete");
});

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";

import { createCanvas, loadImage, PDFDocument } from "@napi-rs/canvas";
import { createPdfRuntime } from "../js/pdf-library/pdf-runtime.js";
import { buildSearchIndex, searchIndex } from "../js/pdf-library/search.js";
import { createKoreanPdfLibraryFixture, createPdfLibraryFixture } from "./helpers/pdf-library-fixture.mjs";

test("Given an unindexed PDF, page metadata and full-page rendering are available before text extraction completes", async (context) => {
  const fixture = new PDFDocument({ title: "Metadata first" });
  for (let pageNumber = 1; pageNumber <= 24; pageNumber += 1) {
    const canvas = fixture.beginPage(300, 420);
    canvas.fillText(`Page ${pageNumber}`, 24, 36);
    fixture.endPage();
  }
  const bytes = new Uint8Array(fixture.close());
  const runtime = createPdfRuntime({ canvasFactory: { create: createCanvas } });
  context.after(() => runtime.clearCache());
  let resolveMetadata;
  const metadataReady = new Promise((resolve) => { resolveMetadata = resolve; });
  const indexing = runtime.openDocument({
    id: "metadata-first", title: "Metadata first", data: bytes,
    source: { kind: "file", locator: "metadata-first", displayName: "metadata-first.pdf" },
    onMetadata: resolveMetadata,
  });
  const metadata = await metadataReady;
  assert.equal(metadata.pageCount, 24);
  assert.equal(metadata.status, "unindexed");
  assert.equal(metadata.pages.length, 0);
  assert.equal(runtime.getDocument("metadata-first").pageCount, 24);
  const lastPage = await runtime.renderPage({ documentId: "metadata-first", pageNumber: 24, dpi: 72 });
  assert.ok(lastPage.bytes.byteLength > 0);
  const indexed = await indexing;
  assert.equal(indexed.pages.length, 24);
});

test("Given a real vector and text PDF, when opened and cropped at 300 dpi, then text and source pixels are preserved", async (context) => {
  // Given
  const fixture = createPdfLibraryFixture();
  const outputDirectory = ".omo/evidence/pdf-library/T1";
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(`${outputDirectory}/fixture.pdf`, fixture);
  const runtime = createPdfRuntime({ canvasFactory: { create: createCanvas }, maxRenderPixels: 20_000_000, maxCacheBytes: 32_000_000 });
  context.after(() => runtime.clearCache());

  // When
  const document = await runtime.openDocument({
    id: "fixture", title: "Runtime fixture",
    source: { kind: "file", locator: "test:fixture", displayName: "fixture.pdf" }, data: fixture,
  });
  const source = { documentId: "fixture", pageNumber: 1, rect: [0.1, 0.04, 0.42, 0.48], fullPageFallback: false };
  const crop = await runtime.renderCrop({ source, dpi: 300 });
  await writeFile(`${outputDirectory}/crop-300dpi.png`, crop.bytes);
  const image = await loadImage(crop.bytes);
  const sampleCanvas = createCanvas(crop.width, crop.height);
  const sampleContext = sampleCanvas.getContext("2d");
  sampleContext.drawImage(image, 0, 0);
  const blue = [...sampleContext.getImageData(180, 550, 1, 1).data];
  const white = [...sampleContext.getImageData(900, 1400, 1, 1).data];

  // Then
  assert.equal(document.pages[0].text.includes("Momentum experiment alpha"), true);
  assert.deepEqual(document.pages[0].items.map((item) => item.itemNumber), [1, 2, 3]);
  assert.equal(crop.dpi, 300);
  assert.equal(crop.width >= 1070, true);
  assert.equal(crop.height >= 1580, true);
  assert.equal(crop.bytes[0], 0x89);
  assert.equal(crop.bytes[1], 0x50);
  assert.deepEqual(blue, [51, 102, 204, 255]);
  assert.deepEqual(white, [255, 255, 255, 255]);
  crop.bytes[0] = 0;
  const cachedCrop = await runtime.renderCrop({ source, dpi: 300 });
  assert.equal(cachedCrop.bytes[0], 0x89);
  const thumbnail = await runtime.renderCrop({ source, dpi: 96 });
  assert.equal(thumbnail.dpi, 96);
  assert.equal(thumbnail.width < crop.width, true);
});

test("Given a requested render beyond the pixel budget, when rendered, then it fails before allocating a canvas", async (context) => {
  // Given
  const runtime = createPdfRuntime({ canvasFactory: { create: createCanvas }, maxRenderPixels: 100_000, maxCacheBytes: 1_000_000 });
  context.after(() => runtime.clearCache());
  await runtime.openDocument({
    id: "bounded", title: "Bounded fixture",
    source: { kind: "file", locator: "test:bounded", displayName: "fixture.pdf" }, data: createPdfLibraryFixture(),
  });

  // When / Then
  await assert.rejects(() => runtime.renderPage({ documentId: "bounded", pageNumber: 1, dpi: 300 }), /pixel budget/i);
});

test("Given an embedded Korean font PDF, when extracted and searched, then Hangul text maps back to page rectangles", async (context) => {
  // Given
  const fixture = createKoreanPdfLibraryFixture();
  await writeFile(".omo/evidence/pdf-library/T1/fixture-korean.pdf", fixture);
  const runtime = createPdfRuntime({ canvasFactory: { create: createCanvas } });
  context.after(() => runtime.clearCache());
  const document = await runtime.openDocument({
    id: "korean", title: "Korean fixture",
    source: { kind: "file", locator: "test:korean", displayName: "fixture-korean.pdf" }, data: fixture,
  });

  // When
  const results = searchIndex(buildSearchIndex([document]), { query: "운동량 보존" });

  // Then
  assert.equal(document.pages[0].text.includes("운동량 보존 실험"), true);
  assert.equal(results.length, 1);
  assert.equal(results[0].matchRects.length >= 2, true);
});

test("Given an open document, when replacement parsing fails, then the last successful document remains available", async (context) => {
  // Given
  const runtime = createPdfRuntime({ canvasFactory: { create: createCanvas } });
  context.after(() => runtime.clearCache());
  await runtime.openDocument({
    id: "replace", title: "Original", source: { kind: "file", locator: "test:original", displayName: "original.pdf" },
    data: createPdfLibraryFixture(),
  });

  // When
  await assert.rejects(() => runtime.openDocument({
    id: "replace", title: "Broken", source: { kind: "file", locator: "test:broken", displayName: "broken.pdf" },
    data: new TextEncoder().encode("not a pdf"),
  }));

  // Then
  assert.equal(runtime.getDocument("replace").title, "Original");
  const rendered = await runtime.renderPage({ documentId: "replace", pageNumber: 1, dpi: 72 });
  assert.equal(rendered.bytes[0], 0x89);
});

test("Given competing opens for one ID, when the older parse finishes last, then it cannot replace the newer document", async (context) => {
  // Given
  const fixture = createPdfLibraryFixture();
  let releaseResponse;
  const responseGate = new Promise((resolve) => { releaseResponse = resolve; });
  let markRequested;
  const requestStarted = new Promise((resolve) => { markRequested = resolve; });
  const server = createServer(async (_request, response) => {
    markRequested();
    await responseGate;
    response.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": fixture.byteLength });
    response.end(fixture);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const runtime = createPdfRuntime({ canvasFactory: { create: createCanvas } });
  context.after(() => runtime.clearCache());
  const port = server.address().port;
  const older = runtime.openDocument({
    id: "race", title: "Older", source: { kind: "url", locator: "test:older", displayName: "older.pdf" },
    url: `http://127.0.0.1:${port}/older.pdf`,
  });
  await requestStarted;

  // When
  await runtime.openDocument({
    id: "race", title: "Newer", source: { kind: "file", locator: "test:newer", displayName: "newer.pdf" }, data: fixture,
  });
  releaseResponse();

  // Then
  await assert.rejects(older, (error) => error.name === "AbortError");
  assert.equal(runtime.getDocument("race").title, "Newer");
});

test("preindexed resource renders without scanning and analyzes only a requested crop page", async (t) => {
  const runtime = createPdfRuntime({canvasFactory:{create:createCanvas}}); t.after(()=>runtime.clearCache());
  const record = {id:'lazy',title:'lazy',pageCount:1,pages:[],source:{kind:'file',locator:'lazy',displayName:'lazy.pdf'}};
  await runtime.openDocumentResource({id:'lazy',data:createPdfLibraryFixture()},record);
  const rendered = await runtime.renderPage({documentId:'lazy',pageNumber:1,dpi:72});
  assert.ok(rendered.bytes.byteLength>0); assert.equal(runtime.getDocument('lazy').pages.length,0);
  const page = await runtime.ensurePageRecord('lazy',1);
  assert.ok(page.text.length>0); assert.equal(runtime.getDocument('lazy').pages.length,1);
  assert.equal(await runtime.ensurePageRecord('lazy',1),page);
});

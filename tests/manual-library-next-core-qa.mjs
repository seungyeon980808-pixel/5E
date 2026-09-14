import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const output = process.argv[2] || ".omo/evidence/library-next/core";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const evidence = {};
const decodedDataUrlHash = (dataUrl) => createHash("sha256").update(Buffer.from(dataUrl.split(",", 2)[1], "base64")).digest("hex");

try {
  await page.goto("http://127.0.0.1:24891/tests/fixtures/unified-library-ui-qa.html?independent=1");
  await page.waitForSelector(".unilib-result-card");

  const query = page.locator("[data-unilib-query]");
  await query.fill("2026");
  await query.press("Enter");
  await page.waitForFunction(() => document.activeElement?.classList.contains("unilib-result-card"));
  evidence.search = await page.evaluate(() => ({
    focused: document.activeElement?.dataset.resultId,
    countBesideInput: document.querySelector("[data-unilib-count]").parentElement.classList.contains("unilib-search-row"),
    snippets: document.querySelectorAll(".unilib-result-snippet").length,
    metadataRows: document.querySelectorAll(".unilib-card-meta").length,
    firstCardTooltip: document.querySelector(".library-card-name")?.title,
  }));
  assert.ok(evidence.search.focused);
  assert.equal(evidence.search.countBesideInput, true);
  assert.equal(evidence.search.snippets, 0);
  assert.ok(evidence.search.metadataRows > 0);
  assert.match(evidence.search.firstCardTooltip, /QA 자료팩.*1쪽/u);

  await page.evaluate(() => { window.qaOriginalGate = Promise.withResolvers(); });
  await page.getByRole("button", { name: "PDF에서 자르기" }).click();
  await page.waitForFunction(() => window.qaOriginalStarted === true);
  await page.evaluate(() => window.qaReplaceFirstSource());
  await query.press("Enter");
  await page.waitForFunction(() => document.querySelector("[data-unilib-crop]").hidden);
  await page.evaluate(() => window.qaOriginalGate.resolve());
  await page.waitForFunction(() => window.qaOriginalFinished === true);
  evidence.staleCropSource = await page.evaluate(() => ({
    cropHidden: document.querySelector("[data-unilib-crop]").hidden,
    acceptedCount: document.querySelectorAll("[data-unilib-crop-remove]").length,
    selectedCount: document.querySelectorAll("[data-unilib-selected-remove]").length,
  }));
  assert.deepEqual(evidence.staleCropSource, { cropHidden: true, acceptedCount: 0, selectedCount: 0 });

  await query.fill("");
  await query.press("Enter");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await page.waitForSelector(".unilib-stage.is-continuous-pdf");
  await page.waitForFunction(() => window.qaPreviewCalls.some((call) => call.options.thumbnail));
  evidence.fileThumbnail = await page.evaluate(() => ({
    page: window.qaPreviewCalls.find((call) => call.options.thumbnail)?.pageNumber,
    tooltip: document.querySelector(".library-card-name")?.title,
  }));
  assert.equal(evidence.fileThumbnail.page, 1);
  assert.match(evidence.fileThumbnail.tooltip, /아주 긴 한국어 제목의 자석 물리 자료\.pdf.*1쪽/u);
  await page.locator(".unilib-result-card").first().click();
  await page.keyboard.down("Space");
  await page.waitForSelector(".unilib-preview.library-reader--expanded");
  await page.keyboard.up("Space");
  await page.waitForSelector('.unilib-pdf-page[data-pdf-page="1"] .unilib-pdf-page-frame[data-page-state="ready"]');
  evidence.fileReader = await page.evaluate(() => ({
    visiblePage: Number(document.querySelector(".unilib-stage").dataset.visiblePdfPage),
    continuousPages: document.querySelectorAll(".unilib-pdf-page").length,
    cropDialogHidden: document.querySelector("[data-unilib-crop]").hidden,
  }));
  assert.equal(evidence.fileReader.visiblePage, 1);
  assert.ok(evidence.fileReader.continuousPages > 1);
  assert.equal(evidence.fileReader.cropDialogHidden, true);
  await page.screenshot({ path: `${output}/file-continuous-reader.png` });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".unified-library-overlay").isVisible(), true);

  await query.fill("A B");
  await query.press("Enter");
  await page.getByRole("button", { name: "페이지", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".unilib-result-card").length === 2);
  await page.locator(".unilib-result-card").first().click();
  await page.keyboard.down("Space");
  await page.waitForSelector("[data-unilib-crop]:not([hidden]).is-view-only");
  await page.keyboard.up("Space");
  await page.waitForFunction(() => document.querySelector("[data-unilib-crop-image]").naturalWidth > 0);
  evidence.pageReader = await page.evaluate(() => ({
    page: Number(document.querySelector("[data-unilib-crop]").dataset.pdfPage || 0),
    draftHidden: document.querySelector("[data-unilib-crop-box]").hidden,
    imageVisible: document.querySelector("[data-unilib-crop-image]").getBoundingClientRect().height > 0,
  }));
  assert.equal(evidence.pageReader.draftHidden, true);
  assert.equal(evidence.pageReader.imageVisible, true);
  await page.screenshot({ path: `${output}/page-single-reader.png` });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "파일", exact: true }).click();
  await page.waitForSelector(".unilib-stage.is-continuous-pdf");
  await page.getByRole("button", { name: "PDF에서 자르기" }).click();
  await page.waitForSelector("[data-unilib-crop]:not([hidden]):not(.is-view-only)");
  await page.waitForFunction(() => document.querySelector("[data-unilib-crop-image]").naturalWidth > 0);
  const drawCrop = async ([x1, y1, x2, y2]) => {
    const box = await page.locator("[data-unilib-crop-canvas]").boundingBox();
    assert.ok(box && box.width > 0 && box.height > 0);
    await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * x2, box.y + box.height * y2, { steps: 4 });
    await page.mouse.up();
    await page.waitForFunction(() => !document.querySelector("[data-unilib-crop-box]").hidden
      && !document.querySelector("[data-unilib-crop-save]").disabled
      && document.querySelector("[data-unilib-crop-save]").textContent === "선택 추가");
  };
  await drawCrop([0.12, 0.16, 0.36, 0.42]);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll("[data-unilib-crop-remove]").length === 1);
  await drawCrop([0.56, 0.52, 0.84, 0.78]);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll("[data-unilib-crop-remove]").length === 2);
  const cropProvenance = await page.locator("[data-unilib-crop-collection]").innerText();
  assert.equal(await page.locator(".unilib-crop-collection-thumb").count(), 2);
  const cropThumbnails = await page.locator(".unilib-crop-collection-thumb").evaluateAll((images) => images.map((image) => ({
    alt: image.alt,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    sourceLength: image.src.length,
    dataUrl: image.src,
  })));
  assert.ok(cropThumbnails.every(({ naturalWidth, naturalHeight, sourceLength }) => naturalWidth > 0 && naturalHeight > 0 && sourceLength > 100));
  const cropRegions = await page.locator(".unilib-crop-collection-item span").evaluateAll((labels) => labels.map((label) => label.title));
  const cropPixelHashes = cropThumbnails.map(({ dataUrl }) => decodedDataUrlHash(dataUrl));
  const cropCenterPixels = await page.locator(".unilib-crop-collection-thumb").evaluateAll((images) => images.map((image) => {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    return [...context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data];
  }));
  assert.equal(new Set(cropRegions).size, 2);
  assert.equal(new Set(cropPixelHashes).size, 2);
  assert.notDeepEqual(cropCenterPixels[0], cropCenterPixels[1]);
  const finishedCropState = await page.evaluate(() => ({
    currentPreviewHidden: document.querySelector("[data-unilib-crop-preview]").style.display === "none",
    finishText: document.querySelector("[data-unilib-crop-save]").textContent,
    finishDisabled: document.querySelector("[data-unilib-crop-save]").disabled,
  }));
  assert.deepEqual(finishedCropState, { currentPreviewHidden: true, finishText: "자르기 완료", finishDisabled: false });
  await page.screenshot({ path: `${output}/multi-crop-two-accepted.png` });
  await page.locator("[data-unilib-crop-remove]").first().click();
  assert.equal(await page.locator("[data-unilib-crop-remove]").count(), 1);
  await page.screenshot({ path: `${output}/multi-crop-after-remove.png` });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("[data-unilib-crop]").hidden);
  evidence.crops = {
    cropProvenance,
    cropRegions,
    cropPixelHashes,
    cropCenterPixels,
    finishedCropState,
    cropThumbnails: cropThumbnails.map(({ dataUrl, ...thumbnail }) => thumbnail),
    selected: await page.locator("[data-unilib-selected-remove]").count(),
  };
  assert.equal(evidence.crops.selected, 1);

  await page.locator('[data-select-result="file:qa"]').check();
  await page.getByRole("button", { name: /AI 작업에 추가$/u }).click();
  await page.waitForSelector(".workbench-assignment-overlay");
  await page.getByRole("button", { name: "계속", exact: true }).click();
  await page.waitForFunction(() => window.qaIndependentCalls.length === 1);
  evidence.assignment = await page.evaluate(() => {
    const call = window.qaIndependentCalls[0];
    return { count: call.references.length, groups: call.groups, placement: call.placement, startGeneration: call.startGeneration };
  });
  assert.deepEqual(evidence.assignment, { count: 2, groups: [[0], [1]], placement: "separate", startGeneration: false });

  await page.goto("http://127.0.0.1:24891/tests/fixtures/unified-library-ui-qa.html");
  await page.waitForSelector(".unilib-result-card");
  await page.locator("[data-unilib-close]").click();
  evidence.pointerClose = await page.evaluate(() => ({ activeId: document.activeElement?.id || "", overlayHidden: document.querySelector(".unified-library-overlay").hidden }));
  assert.equal(evidence.pointerClose.overlayHidden, true);
  assert.notEqual(evidence.pointerClose.activeId, "open");
  await page.locator("#open").click();
  await page.locator("[data-unilib-query]").press("Escape");
  evidence.keyboardCloseFocus = await page.evaluate(() => document.activeElement?.id || "");
  assert.equal(evidence.keyboardCloseFocus, "open");

  await writeFile(`${output}/core-browser.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`PASS library core browser scenarios: ${output}/core-browser.json`);
} finally {
  await browser.close();
}

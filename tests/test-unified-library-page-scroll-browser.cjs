const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

(async () => {
  const engine = process.env.LIBRARY_TEST_ENGINE === "webkit" ? webkit : chromium;
  const browser = await engine.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.route('**/fixture', (route) => route.fulfill({
      contentType: 'text/html',
      body: '<html><head><link rel="stylesheet" href="/preview/css/style.css"><link rel="stylesheet" href="/preview/css/unified-library.css"></head><body></body></html>',
    }));
    await page.goto(new URL('/fixture', process.env.PREVIEW_URL).href);
    await page.evaluate(async () => {
      const { createUnifiedLibraryUi } = await import("/preview/js/unified-library-ui.js");
      const image = (number) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="white"/><text x="80" y="400" font-size="150">${number}</text></svg>`)}`;
      const file = {
        id: "book", kind: "pdf", title: "Test book", pageCount: 3, sourceId: "source",
        sourceLabel: "Test book", documentId: "book",
        provenance: { provider: "pdf", documentId: "book", pageNumber: 1 },
        loadPreview: async (number, options = {}) => {
          if (options.thumbnail && window.thumbnailDelay?.number === number) await window.thumbnailDelay.promise;
          if (options.continuous && window.failContinuousPage === number) throw new Error('temporary page failure');
          if ((options.original || options.continuous) && window.pageDelay?.number === number) await window.pageDelay.promise;
          return ({
          dataUrl: image(number), provenance: { documentId: "book", pageNumber: number },
          result: { id: `page-${number}`, kind: "page", provenance: { provider: "pdf", documentId: "book", pageNumber: number } },
          });
        },
      };
      window.pageScrollFile = file;
      window.setPageDelay = (number) => {
        let release;
        const promise = new Promise((resolve) => { release = resolve; });
        window.pageDelay = { number, promise, release };
      };
      const question = {
        id: "question-1", kind: "crop", title: "Test question", sourceId: "source",
        provenance: { provider: "pdf", documentId: "book", pageNumber: 1, rect: [0.1, 0.1, 0.6, 0.6] },
      };
      const provider = {
        revision: "page-scroll-test",
        getSources: () => [], getExamFilterOptions: () => ({ academicYears: [] }),
        search: ({ kinds } = {}) => kinds?.includes("crop") ? [question] : [], listPdfFiles: () => [file],
        searchPdfFiles: async () => [{ ...file, firstMatchingPage: 2, matches: [{ pageNumber: 2, source: { documentId: "book", pageNumber: 2 } }] }],
        materialize: async (result) => ({ dataUrl: image(result.provenance.pageNumber), provenance: result.provenance }),
      };
      window.pageScrollFixture = createUnifiedLibraryUi({ getProvider: async () => provider, insertMaterialized: async () => {} });
      await window.pageScrollFixture.open();
    });
    const ui = page.locator('.unified-library-overlay').last();
    await ui.locator('[data-unilib-type="pdf"]').click();
    await ui.locator('[data-result-id="book:page:1"]').waitFor();
    const stage = ui.locator('[data-unilib-stage]');
    await ui.locator('[data-unilib-stage][data-visible-pdf-page="1"]').waitFor();
    assert.equal(await stage.getAttribute("data-visible-pdf-page"), "1");
    await stage.hover();
    await page.mouse.wheel(0, 760);
    await ui.locator('[data-unilib-stage][data-visible-pdf-page="2"]').waitFor();
    assert.equal(await ui.locator('[data-result-id="book:page:2"]').getAttribute("aria-selected"), "true");
    assert.match(await ui.locator('[data-result-id="book:page:2"]').textContent(), /2쪽/);
    if (process.env.EVIDENCE_DIR) {
      fs.mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.EVIDENCE_DIR, "page-2-selected.png") });
    }
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1600, height: 1000 }]) {
      await page.setViewportSize(viewport);
      await stage.evaluate((el) => {
        const extent = parseFloat(getComputedStyle(el.closest('.unilib')).getPropertyValue('--unilib-pdf-page-extent'));
        el.scrollTop = extent - el.clientHeight / 2 - 20;
      });
      await ui.locator('[data-result-id="book:page:1"][aria-selected="true"]').waitFor();
      await stage.evaluate((el) => { el.scrollTop += 40; });
      await ui.locator('[data-result-id="book:page:2"][aria-selected="true"]').waitFor();
    }
    await ui.locator('[data-unilib-adjust]').click();
    await ui.locator('[data-unilib-crop][data-pdf-page="2"]').waitFor({ state: "visible" });
    assert.match(await ui.locator('[data-unilib-crop-image]').getAttribute("src"), /%3E2%3C/);
    await ui.locator('[data-unilib-crop-load-state]').waitFor({ state: "hidden" });
    assert.equal(await ui.locator('[data-crop-magnifier-toggle]').count(), 1, 'crop inspector must offer a magnifier toggle');
    const cropBounds = await ui.locator('[data-unilib-crop-canvas]').boundingBox();
    assert.ok(cropBounds && cropBounds.width > 100 && cropBounds.height > 100);
    await page.mouse.move(cropBounds.x + cropBounds.width * 0.2, cropBounds.y + cropBounds.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(cropBounds.x + cropBounds.width * 0.7, cropBounds.y + cropBounds.height * 0.7, { steps: 5 });
    await page.mouse.up();
    await ui.locator('[data-unilib-crop-save]:not([disabled])').waitFor();
    await ui.locator('[data-unilib-crop-save]').click();
    assert.match(await ui.locator('[data-unilib-crop-count]').textContent(), /1개/);
    await ui.locator('[data-unilib-crop-cancel]').click();
    await stage.hover();
    await page.mouse.wheel(0, -760);
    await ui.locator('[data-unilib-stage][data-visible-pdf-page="1"]').waitFor();
    assert.equal(await ui.locator('[data-result-id="book:page:1"]').getAttribute("aria-selected"), "true");
    await ui.locator('[data-unilib-adjust]').click();
    await ui.locator('[data-unilib-crop][data-pdf-page="1"]').waitFor({ state: "visible" });
    assert.match(await ui.locator('[data-unilib-crop-image]').getAttribute("src"), /%3E1%3C/);
    await ui.locator('[data-unilib-crop-cancel]').click();
    await ui.locator('.unilib-search input').fill('found');
    await ui.locator('[data-result-id="book:page:2"][aria-selected="true"]').waitFor();
    assert.equal(await ui.locator('[data-unilib-results] [data-result-id]').count(), 1, 'search should initially show only matching pages');
    await ui.locator('[data-unilib-stage][data-visible-pdf-page="2"]').waitFor();
    await stage.hover();
    await page.mouse.wheel(0, 760);
    await ui.locator('[data-unilib-stage][data-visible-pdf-page="3"]').waitFor();
    assert.equal(await ui.locator('[data-result-id="book:page:3"]').getAttribute("aria-selected"), "true");
    await ui.locator('[data-unilib-adjust]').click();
    await ui.locator('[data-unilib-crop][data-pdf-page="3"]').waitFor({ state: "visible" });
    assert.match(await ui.locator('[data-unilib-crop-image]').getAttribute("src"), /%3E3%3C/);
    await ui.locator('[data-unilib-crop-cancel]').click();
    await ui.locator('[data-unilib-type="question"]').click();
    await ui.locator('[data-result-id="question-1"]').click();
    await ui.locator('[data-unilib-adjust]').click();
    await ui.locator('[data-unilib-crop][data-pdf-page="1"]').waitFor({ state: "visible" });
    assert.equal(await ui.locator('[data-unilib-crop-page-controls]').isVisible(), true, 'question crop should expose document pages');
    const cropStage = ui.locator('[data-unilib-crop-stage]');
    await cropStage.hover();
    await page.mouse.wheel(0, 1900);
    await page.waitForTimeout(300);
    await ui.locator('[data-unilib-crop][data-pdf-page="2"]').waitFor({ state: "visible" });
    assert.match(await ui.locator('[data-unilib-crop-image]').getAttribute("src"), /%3E2%3C/);
    assert.equal(await ui.locator('[data-result-id="book:page:2"]').getAttribute("aria-selected"), "true", 'left page preview should follow crop page');
    await ui.locator('[data-unilib-crop-load-state]').waitFor({ state: 'hidden' });
    const questionCropBounds = await ui.locator('[data-unilib-crop-canvas]').boundingBox();
    const cropViewport = await cropStage.boundingBox();
    const visibleTop = Math.max(questionCropBounds.y, cropViewport.y);
    const visibleHeight = Math.min(questionCropBounds.y + questionCropBounds.height, cropViewport.y + cropViewport.height) - visibleTop;
    assert.ok(visibleHeight > 100, 'scrolled page should be visible for cropping');
    await page.mouse.move(questionCropBounds.x + questionCropBounds.width * .2, visibleTop + visibleHeight * .2);
    await page.mouse.down();
    await page.mouse.move(questionCropBounds.x + questionCropBounds.width * .6, visibleTop + visibleHeight * .6, { steps: 5 });
    await page.mouse.up();
    await ui.locator('[data-unilib-crop-save]:not([disabled])').click();
    assert.match(await ui.locator('[data-unilib-crop-count]').textContent(), /[1-9]\d*개/, 'scrolled question page should be croppable');
    await ui.locator('[data-unilib-crop-page-prev]').click();
    await ui.locator('[data-unilib-crop][data-pdf-page="1"]').waitFor({ state: "visible" });
    assert.match(await ui.locator('[data-unilib-crop-image]').getAttribute("src"), /%3E1%3C/);
    await ui.locator('[data-unilib-crop-cancel]').click();
    await ui.locator('[data-unilib-type="pdf"]').click();
    await ui.locator('[data-result-id="book:page:2"]').click();
    await ui.locator('[data-unilib-adjust]').click();
    await ui.locator('[data-unilib-crop][data-pdf-page="2"]').waitFor({ state: "visible" });
    await cropStage.hover();
    await page.mouse.wheel(0, 1900);
    await ui.locator('[data-unilib-crop][data-pdf-page="3"]').waitFor({ state: "visible" });
    assert.equal(await ui.locator('[data-result-id="book:page:3"]').getAttribute("aria-selected"), "true", 'page search preview should follow crop scroll');
    await ui.locator('[data-unilib-crop-cancel]').click();
    await ui.locator('[data-unilib-type="question"]').click();
    await ui.locator('[data-result-id="question-1"]').click();
    await page.evaluate(() => window.setPageDelay(2));
    await ui.locator('[data-unilib-adjust]').click();
    await ui.locator('[data-unilib-crop][data-pdf-page="1"]').waitFor({ state: "visible" });
    await cropStage.evaluate((el) => { el.scrollTop = 1200; });
    await ui.locator('.unilib-crop-page[data-page="2"][data-loaded="loading"]').waitFor();
    assert.equal(await ui.locator('.unilib-crop-page[data-page="2"] .unilib-crop-page-placeholder').count(), 1, 'pending page should keep a neutral paper placeholder');
    await ui.locator('[data-unilib-crop-page-next]').click();
    await ui.locator('[data-unilib-crop-load-state][data-state="loading"]').waitFor({ state: "visible" });
    await ui.locator('.unilib-crop-load-preview:not([hidden])').waitFor();
    assert.match(await ui.locator('.unilib-crop-load-preview').getAttribute('src'), /%3E2%3C/, 'loading preview must depict the target page, never the previous page');
    assert.equal(await ui.locator('.unilib-crop-load-preview').evaluate((el) => getComputedStyle(el).filter), 'blur(1.5px)');
    assert.equal(await ui.locator('[data-unilib-crop-image]').isVisible(), false, 'previous crop must be hidden while the target page loads');
    assert.equal(await ui.locator('[data-unilib-crop-canvas]').evaluate((el) => getComputedStyle(el).filter), 'none', 'loading should not blur the crop canvas');
    if (process.env.EVIDENCE_DIR) await page.screenshot({ path: path.join(process.env.EVIDENCE_DIR, 'crop-page-loading.png') });
    await page.evaluate(() => window.pageDelay.release());
    await ui.locator('[data-unilib-crop][data-pdf-page="2"]').waitFor({ state: "visible" });
    await ui.locator('[data-unilib-crop-load-state]').waitFor({ state: "hidden" });
    if (process.env.EVIDENCE_DIR) await page.screenshot({ path: path.join(process.env.EVIDENCE_DIR, 'crop-page-settled.png') });
    await ui.locator('[data-unilib-crop-cancel]').click();
    await ui.locator('[data-unilib-type="question"]').click();
    await ui.locator('[data-result-id="question-1"]').click();
    await ui.locator('[data-unilib-adjust]').click();
    await ui.locator('[data-unilib-crop-load-state]').waitFor({ state: 'hidden' });
    await page.evaluate(() => {
      window.setPageDelay(2);
      let release;
      window.thumbnailDelay = { number: 2, promise: new Promise((resolve) => { release = resolve; }) };
      window.thumbnailDelay.release = release;
    });
    await ui.locator('[data-unilib-crop-page-next]').click();
    await ui.locator('[data-unilib-crop-load-state][data-state="loading"]').waitFor({ state: 'visible' });
    assert.equal(await ui.locator('.unilib-crop-load-paper').isVisible(), true, 'unavailable target thumbnail should leave a neutral paper placeholder');
    await page.evaluate(() => window.pageDelay.release());
    await ui.locator('[data-unilib-crop-load-state]').waitFor({ state: 'hidden' });
    assert.match(await ui.locator('[data-unilib-crop-image]').getAttribute('src'), /%3E2%3C/, 'original must become ready without waiting for the thumbnail');
    await ui.locator('[data-unilib-crop-cancel]').click();
    await ui.locator('[data-unilib-type="question"]').click();
    await ui.locator('[data-result-id="question-1"]').click();
    await ui.locator('[data-unilib-adjust]').click();
    await ui.locator('[data-unilib-crop-load-state]').waitFor({ state: 'hidden' });
    await page.evaluate(async () => {
      window.thumbnailDelay.release();
      window.thumbnailDelay = null;
      for (let frame = 0; frame < 4; frame++) await new Promise(requestAnimationFrame);
    });
    assert.match(await ui.locator('[data-unilib-crop-image]').getAttribute('src'), /%3E1%3C/);
    assert.equal(await ui.locator('.unilib-crop-load-preview').getAttribute('src'), null, 'a stale thumbnail cannot replace the reopened page');
    await ui.locator('[data-unilib-crop-cancel]').click();
    await page.evaluate(() => { window.failContinuousPage = 2; window.pageDelay = null; });
    await ui.locator('[data-unilib-type="question"]').click();
    await ui.locator('[data-result-id="question-1"]').click();
    await ui.locator('[data-unilib-adjust]').click();
    await ui.locator('[data-unilib-crop][data-pdf-page="1"]').waitFor({ state: "visible" });
    await cropStage.evaluate((el) => { el.scrollTop = 1200; });
    await ui.locator('.unilib-crop-page[data-page="2"][data-loaded="error"] .unilib-crop-page-status button').waitFor();
    const retryBounds = await ui.locator('.unilib-crop-page[data-page="2"] .unilib-crop-page-status button').boundingBox();
    const errorViewport = await cropStage.boundingBox();
    assert.ok(retryBounds && errorViewport && retryBounds.y < errorViewport.y + errorViewport.height && retryBounds.y + retryBounds.height > errorViewport.y, 'retry button should appear within the current crop viewport');
    if (process.env.EVIDENCE_DIR) await page.screenshot({ path: path.join(process.env.EVIDENCE_DIR, 'crop-page-error.png') });
    await page.evaluate(() => { window.failContinuousPage = null; });
    await ui.locator('.unilib-crop-page[data-page="2"] .unilib-crop-page-status button').click();
    await ui.locator('.unilib-crop-page[data-page="2"][data-loaded="ready"]').waitFor();
    await ui.locator('[data-unilib-crop-cancel]').click();
    await page.evaluate(() => {
      window.pageScrollFixture.close();
      const file = window.pageScrollFile;
      let release;
      const thumbnail = new Promise((resolve) => { release = resolve; });
      window.releaseFirstThumbnail = release;
      window.initialThumbnailLoads = [];
      const NativeObserver = window.IntersectionObserver;
      window.delayedThumbnailObservers = [];
      window.IntersectionObserver = class extends NativeObserver {
        constructor(callback, options) {
          super((entries, observer) => {
            if (options?.root?.classList.contains('unilib-result-scroll')) window.delayedThumbnailObservers.push(() => callback(entries, observer));
            else callback(entries, observer);
          }, options);
        }
      };
      const loadingProvider = {
        revision: 'slow-thumbnail', getSources: () => [], getExamFilterOptions: () => ({ academicYears: [] }),
        search: () => [], listPdfFiles: () => Array.from({ length: 20 }, (_, index) => ({
          ...file, id: index ? `book-${index}` : 'book', documentId: index ? `book-${index}` : 'book',
          title: `Test book ${index + 1}`, provenance: { ...file.provenance, documentId: index ? `book-${index}` : 'book' },
          loadPreview: async (number, options) => {
            if (options?.thumbnail) {
              window.initialThumbnailLoads.push(index);
              if (index === 1) await thumbnail;
              if (index === 2) throw new Error('thumbnail unavailable');
            }
            return file.loadPreview(number, options);
          },
        })),
        materialize: async () => { throw new Error('unexpected materialize'); },
      };
      window.loadingUiPromise = import('/preview/js/unified-library-ui.js').then(({ createUnifiedLibraryUi }) => {
        window.loadingUi = createUnifiedLibraryUi({ getProvider: async () => loadingProvider, insertMaterialized: async () => {} });
        return window.loadingUi.open();
      });
    });
    const loadingUi = page.locator('.unified-library-overlay').last();
    await loadingUi.locator('[data-result-id="book"]').waitFor();
    await page.evaluate(async () => { for (let frame = 0; frame < 8; frame++) await new Promise(requestAnimationFrame); });
    assert.equal(await loadingUi.locator('[data-unilib-result-state]').isVisible(), true, 'initial loading must wait for the second visible thumbnail even after the first is ready');
    assert.equal(await loadingUi.locator('[data-result-id="book"] img').evaluate((image) => image.complete && image.naturalWidth > 0), true);
    if (process.env.EVIDENCE_DIR) await page.screenshot({ path: path.join(process.env.EVIDENCE_DIR, 'library-first-loading.png') });
    await page.evaluate(() => { window.releaseFirstThumbnail(); });
    await loadingUi.locator('[data-unilib-result-state]').waitFor({ state: 'hidden' });
    assert.equal(await loadingUi.locator('[data-result-id="book"] img').evaluate((image) => image.complete && image.naturalWidth > 0), true);
    assert.equal(await loadingUi.locator('[data-result-id="book-1"] img').evaluate((image) => image.complete && image.naturalWidth > 0), true);
    assert.equal(await loadingUi.locator('[data-result-id="book-2"] .unilib-thumb').getAttribute('data-thumbnail-state'), 'error', 'failed visible thumbnail should settle into its error placeholder');
    assert.equal(await page.evaluate(() => window.initialThumbnailLoads.includes(19)), false, 'offscreen thumbnails must remain lazy');
    if (process.env.EVIDENCE_DIR) await page.screenshot({ path: path.join(process.env.EVIDENCE_DIR, 'library-first-settled.png') });
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log("PASS page scroll selects thumbnails and crop source follows both directions");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

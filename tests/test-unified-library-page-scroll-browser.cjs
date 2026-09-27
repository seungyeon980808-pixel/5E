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
        loadPreview: async (number) => ({
          dataUrl: image(number), provenance: { documentId: "book", pageNumber: number },
          result: { id: `page-${number}`, kind: "page", provenance: { provider: "pdf", documentId: "book", pageNumber: number } },
        }),
      };
      const provider = {
        revision: "page-scroll-test",
        getSources: () => [], getExamFilterOptions: () => ({ academicYears: [] }),
        search: () => [], listPdfFiles: () => [file],
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
    await ui.locator('[data-unilib-adjust]').click();
    await ui.locator('[data-unilib-crop][data-pdf-page="2"]').waitFor({ state: "visible" });
    assert.match(await ui.locator('[data-unilib-crop-image]').getAttribute("src"), /%3E2%3C/);
    await ui.locator('[data-unilib-crop-load-state]').waitFor({ state: "hidden" });
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
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log("PASS page scroll selects thumbnails and crop source follows both directions");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

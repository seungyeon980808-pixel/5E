const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

(async () => {
  const browser = await (process.env.LIBRARY_TEST_ENGINE === 'webkit' ? webkit : chromium).launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.route('**/fixture', (route) => route.fulfill({ contentType: 'text/html', body: '<html><head><link rel="stylesheet" href="/preview/css/style.css"><link rel="stylesheet" href="/preview/css/unified-library.css"></head><body></body></html>' }));
    await page.goto(new URL('/fixture', process.env.PREVIEW_URL).href);
    await page.evaluate(async () => {
      const [{ createUnifiedLibraryProvider }, { createUnifiedLibraryUi }] = await Promise.all([
        import('/preview/js/library/provider.js'), import('/preview/js/unified-library-ui.js'),
      ]);
      const document = { id: 'real-provider-exam', title: '생명1 27년 6평', pageCount: 4, source: { displayName: 'b12706.pdf', kind: 'pack' } };
      const source = { documentId: document.id, pageNumber: 1, rect: [.1, .1, .6, .5], fullPageFallback: false };
      const provider = createUnifiedLibraryProvider({
        pdfDocuments: [document],
        pdfSearchIndex: { entries: [{ documentId: document.id, pageNumber: 1, itemId: 'question-2', itemNumber: 2, text: '생태계', source }] },
        materializers: { pdf: async ({ result, source: pageSource }) => {
          const canvas = window.document.createElement('canvas');
          canvas.width = 600; canvas.height = 800;
          const context = canvas.getContext('2d');
          context.fillStyle = ['#fff', '#dff5df', '#f5e5df', '#dfe5f5'][pageSource.pageNumber - 1];
          context.fillRect(0, 0, 600, 800);
          context.fillStyle = '#111'; context.font = '80px sans-serif';
          context.fillText(`PAGE ${pageSource.pageNumber}`, 90, 400);
          return { dataUrl: canvas.toDataURL(), source: pageSource, provenance: result.provenance, result };
        } },
      });
      window.actualProviderUi = createUnifiedLibraryUi({ getProvider: async () => provider, insertMaterialized: async () => {} });
      await window.actualProviderUi.open();
    });
    const ui = page.locator('.unified-library-overlay').last();
    await ui.locator('[data-unilib-type="question"]').click();
    await ui.locator('[data-result-kind="crop"]').first().click();
    await ui.locator('[data-unilib-adjust]').click();
    await ui.locator('[data-unilib-crop-load-state]').waitFor({ state: 'hidden' });
    assert.equal(await ui.locator('[data-unilib-crop-page-controls]').isVisible(), true, 'actual provider question must expose all four PDF pages');
    assert.match(await ui.locator('[data-unilib-crop-page]').textContent(), /1 \/ 4/);
    const cropStage = ui.locator('[data-unilib-crop-stage]');
    await cropStage.hover();
    await page.mouse.wheel(0, await ui.locator('.unilib-crop-page').first().evaluate((slot) => slot.offsetHeight));
    await page.waitForFunction(() => Number(document.querySelector('[data-unilib-crop]').dataset.pdfPage) > 1);
    await ui.locator('[data-unilib-crop-load-state]').waitFor({ state: 'hidden' });
    const pageNumber = Number(await ui.locator('[data-unilib-crop]').getAttribute('data-pdf-page'));
    assert.ok(pageNumber > 1 && pageNumber <= 4);
    const canvas = ui.locator('[data-unilib-crop-canvas]');
    const bounds = await canvas.boundingBox();
    const viewport = await cropStage.boundingBox();
    const top = Math.max(bounds.y, viewport.y), bottom = Math.min(bounds.y + bounds.height, viewport.y + viewport.height);
    assert.ok(bottom - top > 80, 'scrolled PDF has visible crop surface');
    await page.mouse.move(bounds.x + bounds.width * .2, top + (bottom - top) * .2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * .6, top + (bottom - top) * .6, { steps: 6 });
    await page.mouse.up();
    await ui.locator('[data-unilib-crop-save]:not([disabled])').click();
    assert.match(await ui.locator('[data-unilib-crop-count]').textContent(), /1개/);
    if (process.env.EVIDENCE_DIR) {
      fs.mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.EVIDENCE_DIR, 'actual-provider-scrolled-crop.png') });
    }
    while (Number(await ui.locator('[data-unilib-crop]').getAttribute('data-pdf-page')) > 1) {
      const current = Number(await ui.locator('[data-unilib-crop]').getAttribute('data-pdf-page'));
      await ui.locator('[data-unilib-crop-page-prev]').click();
      await page.waitForFunction((before) => Number(document.querySelector('[data-unilib-crop]').dataset.pdfPage) < before, current);
      await ui.locator('[data-unilib-crop-load-state]').waitFor({ state: 'hidden' });
    }
    assert.match(await ui.locator('[data-unilib-crop-page]').textContent(), /1 \/ 4/);
    await ui.locator('[data-unilib-crop-cancel]').click();
    await ui.locator('[data-unilib-type="pdf"]').click();
    const stage = ui.locator('[data-unilib-stage]');
    await ui.locator('[data-unilib-stage][data-visible-pdf-page="1"]').waitFor();
    await stage.hover();
    await page.mouse.wheel(0, 800);
    await page.waitForFunction(() => Number(document.querySelector('[data-unilib-stage]').dataset.visiblePdfPage) > 1);
    const visiblePage = Number(await stage.getAttribute('data-visible-pdf-page'));
    assert.match(await ui.locator('[data-result-id][aria-selected="true"] strong').textContent(), new RegExp(`${visiblePage}쪽`));
    assert.deepEqual(errors, []);
    console.log('PASS actual provider → question → scroll → crop → return, PDF scroll → selected thumbnail');
  } catch (error) {
    console.error('Crop scroll state:', await page.locator('[data-unilib-crop-stage]').evaluate((el) => ({
      scrollTop: el.scrollTop, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight,
      pages: [...el.querySelectorAll('.unilib-crop-page')].map((slot) => ({ page: slot.dataset.page, top: slot.offsetTop, height: slot.offsetHeight })),
    })).catch(() => null));
    if (process.env.EVIDENCE_DIR) {
      fs.mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.EVIDENCE_DIR, 'failure.png') });
    }
    throw error;
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

async function scenario(engine, origin, surface) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await h.navigate(page, new URL(surface + '?mode=pro&mobile=0&exam=0', origin).href);
    await h.ready(page);
    const runtime = h.runtime(page);
    const moduleUrl = new URL('unified-library-ui.js' + runtime.moduleQuery, runtime.mainUrl).href;
    await page.evaluate(async moduleUrl => {
      const { createUnifiedLibraryUi } = await import(moduleUrl);
      const dataUrl = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="white"/><circle cx="300" cy="400" r="100" fill="black"/></svg>');
      const file = { id: 'confirm-book', kind: 'pdf', title: '확정 검수', pageCount: 1, sourceId: 'source', sourceLabel: '확정 검수', documentId: 'confirm-book',
        provenance: { provider: 'pdf', documentId: 'confirm-book', pageNumber: 1 },
        loadPreview: async () => ({ dataUrl, result: { id: 'page-1', kind: 'page', provenance: { provider: 'pdf', documentId: 'confirm-book', pageNumber: 1, rect: [0, 0, 1, 1] } } }) };
      window.delayCrop = () => { let release; window.cropGate = { promise: new Promise(resolve => { release = resolve; }), release: () => release() }; };
      const provider = { revision: 'confirm-test', getSources: () => [], getExamFilterOptions: () => ({}), search: () => [], listPdfFiles: () => [file],
        materialize: async (result, options) => { if (options.representation === 'manual') await window.cropGate.promise; return { dataUrl, provenance: result.provenance }; } };
      window.confirmUi = createUnifiedLibraryUi({ getProvider: async () => provider, insertMaterialized: async () => {} });
      await window.confirmUi.open();
    }, moduleUrl);
    const ui = page.locator('.unified-library-overlay').last();
    await ui.locator('[data-unilib-adjust]').click();
    await ui.locator('[data-unilib-crop-load-state]').waitFor({ state: 'hidden' });
    const stage = ui.locator('[data-unilib-crop-stage]'), count = ui.locator('[data-unilib-crop-count]');
    const save = ui.locator('[data-unilib-crop-save]');
    // A real keypress occurs while the exact crop is still unavailable. It must
    // be applied once after readiness, without accepting a newer rectangle.
    await page.evaluate(() => window.delayCrop()); await stage.focus();
    await page.keyboard.press('Enter'); await page.keyboard.press('Space'); await page.keyboard.press('Space');
    assert.match(await count.textContent(), /0개/); assert.equal(await save.isDisabled(), true);
    await page.evaluate(() => window.cropGate.release());
    await count.filter({ hasText: '1개' }).waitFor();
    assert.equal(await ui.locator('[data-unilib-crop-box]').isVisible(), false);

    await page.evaluate(() => window.delayCrop()); await stage.focus();
    await page.keyboard.press('Shift+Enter'); await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight'); await page.evaluate(() => window.cropGate.release());
    await save.locator(':scope:not([disabled])').waitFor();
    assert.match(await count.textContent(), /1개/, 'moving the draft cancels the earlier confirmation');
    await page.keyboard.press('Space'); await count.filter({ hasText: '2개' }).waitFor();

    await page.evaluate(() => window.delayCrop()); await stage.focus();
    await page.keyboard.press('Shift+Enter'); await page.keyboard.press('Space'); await page.keyboard.press('Escape');
    await page.evaluate(() => window.cropGate.release());
    await ui.locator('[data-unilib-adjust]').click();
    await ui.locator('[data-unilib-crop-load-state]').waitFor({ state: 'hidden' });
    assert.match(await count.textContent(), /0개/, 'closing discards uncommitted session crops and cancels pending confirmation');
    assert.deepEqual(errors, []);
    console.log(engine.name() + ' ' + surface + ': immediate Space, duplicate keys, changed draft and close cancellation passed');
  } finally { await browser.close(); }
}
(async () => h.withServer(async origin => {
  for (const engine of [chromium,webkit].filter(e=>!process.env.BROWSER_ENGINE||e.name()===process.env.BROWSER_ENGINE)) for (const surface of ['/', '/preview/']) await scenario(engine, origin, surface);
}))().catch(error => { console.error(error); process.exitCode = 1; });

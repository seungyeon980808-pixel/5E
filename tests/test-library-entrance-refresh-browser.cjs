const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

h.withServer(async origin => {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/fixture', route => route.fulfill({
        contentType: 'text/html',
        body: '<html><head><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/unified-library.css"></head><body></body></html>',
      }));
      await page.goto(origin + '/fixture');
      const firstFrame = await page.evaluate(async () => {
        const { createUnifiedLibraryUi } = await import('/js/unified-library-ui.js?v=1.7.0-four-session-integration');
        const ready = Promise.withResolvers();
        const provider = {
          getSources: () => [], getExamFilterOptions: () => ({ academicYears: [] }),
          search: () => [], listPdfPages: () => [], listPdfFiles: () => [],
        };
        const fixture = window.entranceFixture = { requests: 0, release: () => ready.resolve(provider) };
        fixture.ui = createUnifiedLibraryUi({
          getProvider: () => { fixture.requests += 1; return ready.promise; },
          insertMaterialized: async () => {}, initialSearchReadiness: 'loading',
        });
        fixture.opened = fixture.ui.open();
        fixture.ui.setSearchReadiness('ready');
        return { requests: fixture.requests, motion: fixture.ui.element.dataset.modalMotionState };
      });
      assert.equal(firstFrame.motion, 'start');
      assert.equal(firstFrame.requests, 0, 'readiness cannot start catalog work during entrance');
      await page.waitForFunction(() => window.entranceFixture.requests > 0);
      assert.equal(await page.locator('.unified-library-overlay').getAttribute('data-modal-motion-state'), 'open');
      await page.evaluate(async () => { const f = window.entranceFixture; f.release(); await f.opened; });
      assert.equal(await page.locator('[data-unilib-result-state]').getAttribute('data-state'), 'empty');
      const closing = await page.evaluate(() => {
        const f = window.entranceFixture;
        const before = f.requests;
        f.ui.close({ restoreFocus: false });
        f.ui.setSearchReadiness('ready');
        return { before, after: f.requests };
      });
      assert.equal(closing.after, closing.before, 'closing does not start a background refresh');
      await page.locator('.unified-library-overlay').waitFor({ state: 'hidden' });
      assert.deepEqual(errors, []);
      console.log(name + ': background readiness preserves entrance, latest catalog loads, closing skips refresh');
    } finally { await browser.close(); }
  }
}).catch(error => { console.error(error); process.exitCode = 1; });

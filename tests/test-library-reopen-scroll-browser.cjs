const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/library-reopen-scroll');
fs.mkdirSync(evidence, { recursive: true });
const receipts = [];

async function snapshot(page) {
  return page.evaluate(() => {
    const overlay = document.querySelector('.unified-library-overlay');
    const scroller = overlay.querySelector('.unilib-result-scroll');
    const selected = overlay.querySelector('[data-result-id][aria-selected="true"]');
    const bounds = scroller.getBoundingClientRect();
    const card = selected?.getBoundingClientRect();
    const preview = overlay.querySelector('.unilib-preview-image img');
    return {
      cards: overlay.querySelectorAll('[data-result-id]').length,
      scrollTop: scroller.scrollTop,
      selectedId: selected?.dataset.resultId ?? null,
      selectedVisible: !!card && card.bottom > bounds.top && card.top < bounds.bottom,
      selectedTop: card ? card.top - bounds.top : null,
      selectedHeight: card?.height ?? null,
      retainedSelectedNode: selected === window.beforeReopenCard,
      previewSrc: preview?.getAttribute('src') ?? null,
      previewSize: preview ? [preview.naturalWidth, preview.naturalHeight] : null,
      title: overlay.querySelector('[data-unilib-preview-title]').textContent,
    };
  });
}

h.withServer(async origin => {
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const layout of ['all', 'image']) {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/reopen-fixture', route => route.fulfill({
          contentType: 'text/html',
          body: '<html><head><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/unified-library.css"></head><body></body></html>',
        }));
        await page.goto(origin + '/reopen-fixture');
        await page.evaluate(async () => {
          const { createUnifiedLibraryUi } = await import('/js/unified-library-ui.js?v=1.7.0-four-session-integration');
          const provider = {
            getSources: () => [], getExamFilterOptions: () => ({ academicYears: [] }),
            search: ({ query = '' }) => Array.from({ length: 1000 }, (_, i) => ({
              id: 'reopen-' + i, kind: 'image', title: 'Image ' + i,
              preview: '/tests/fixtures/rights-clear-smoke.png',
            })).filter(result => result.title.includes(query)),
            listPdfFiles: () => [],
            materialize: async () => ({ src: '/tests/fixtures/rights-clear-smoke.png' }),
          };
          window.reopenFixture = createUnifiedLibraryUi({ getProvider: () => provider, insertMaterialized: async () => {} });
          await window.reopenFixture.open();
        });
        if (layout !== 'all') {
          await page.locator(`[data-unilib-type="${layout}"]`).click();
          await page.waitForFunction(() => document.querySelector('[data-unilib-result-state]')?.dataset.state === 'ready');
        }
        for (let i = 0; i < 10 && !await page.locator('[data-result-id="reopen-419"]').count(); i++) {
          await page.locator('.unilib-result-scroll').evaluate(async el => {
            el.scrollTop = el.scrollHeight;
            el.dispatchEvent(new Event('scroll'));
            await new Promise(requestAnimationFrame);
          });
        }
        await page.locator('[data-result-id="reopen-419"]').click();
        await page.waitForFunction(() => document.querySelector('.unilib-preview-image img')?.complete
          && document.querySelector('[data-unilib-preview-title]')?.textContent === 'Image 419');
        const before = await snapshot(page);
        assert.equal(before.selectedId, 'reopen-419');
        assert.equal(before.selectedVisible, true);
        assert.ok(before.scrollTop > 1000);

        for (let cycle = 1; cycle <= 3; cycle++) {
          await page.evaluate(() => { window.beforeReopenCard = document.querySelector('[data-result-id][aria-selected="true"]'); });
          await page.keyboard.press('Escape');
          await page.locator('.unified-library-overlay').waitFor({ state: 'hidden' });
          await page.evaluate(() => window.reopenFixture.open());
          const after = await snapshot(page);
          receipts.push({ engine: name, layout, cycle, before, after });
          fs.writeFileSync(path.join(evidence, 'receipt.json'), JSON.stringify(receipts, null, 2));
          await page.screenshot({ path: path.join(evidence, `${name}-${layout}-reopen-${cycle}.png`) });
          assert.equal(after.selectedId, before.selectedId, 'reopening retains the selected card beyond the first batch');
          assert.equal(after.selectedVisible, true, 'the retained selection stays in view');
          assert.ok(Math.abs(after.selectedTop - before.selectedTop) <= 1, 'reopening retains the selection at the same viewport position');
          assert.equal(after.previewSrc, before.previewSrc);
          assert.deepEqual(after.previewSize, before.previewSize);
          assert.equal(after.title, before.title);
          assert.ok(after.cards >= before.cards, 'already rendered batches remain available');
        }
        await page.locator('[data-unilib-query]').fill('Image 42');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('[data-unilib-result-state]')?.dataset.state === 'ready'
          && document.querySelector('[data-unilib-count]')?.textContent === '11개'
          && document.querySelector('[data-unilib-preview-title]')?.textContent === 'Image 42');
        const filtered = await snapshot(page);
        assert.equal(filtered.selectedId, 'reopen-42');
        assert.equal(filtered.cards, 11, 'a new search replaces the old batches');
        assert.equal(filtered.selectedVisible, true);
        receipts.push({ engine: name, layout, case: 'new-search-replaces-retained-batches', filtered });
        fs.writeFileSync(path.join(evidence, 'receipt.json'), JSON.stringify(receipts, null, 2));
        assert.deepEqual(errors, []);
        console.log(`${name}/${layout}: deep selection and scroll survive 3 Escape/reopen cycles; new search replaces old batches`);
        await page.close();
      }
    } finally { await browser.close(); }
  }
}).catch(error => { console.error(error); process.exitCode = 1; });

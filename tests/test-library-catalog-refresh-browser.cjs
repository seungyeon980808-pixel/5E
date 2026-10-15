const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

h.withServer(async origin => {
  for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([name]) => !process.env.CATALOG_ENGINE || process.env.CATALOG_ENGINE === name)) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1298, height: 897 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/catalog-fixture', route => route.fulfill({ contentType: 'text/html', body:
        '<!doctype html><html><head>' + ['style.css', 'unified-library.css', 'loading/blur-reveal.css', 'loading/library-loading.css']
          .map(file => `<link rel="stylesheet" href="/css/${file}">`).join('') + '</head><body></body></html>' }));
      await page.goto(origin + '/catalog-fixture');
      const result = await page.evaluate(async () => {
        const { createUnifiedLibraryUi } = await import('/js/unified-library-ui.js?v=1.7.0-four-session-integration');
        const src = '/tests/fixtures/rights-clear-smoke.png';
        const old = { id: 'existing-image', kind: 'image', title: 'Existing image', preview: src };
        const added = Array.from({ length: 8412 }, (_, i) => ({ id: 'new-' + i, kind: 'crop', title: 'New question ' + i, preview: src }));
        let ready = false;
        const provider = {
          getSources: () => [], getExamFilterOptions: () => ({ academicYears: [] }),
          search: ({ kinds, query }) => (ready ? [...added, old] : [old]).filter(item => kinds.includes(item.kind) && (!query || item.title.includes(query))),
          listPdfFiles: () => [], materialize: async () => ({ src }),
        };
        const ui = createUnifiedLibraryUi({ getProvider: () => provider, insertMaterialized: async () => {} });
        window.catalogFixture = ui;
        await ui.open();
        const list = ui.element.querySelector('[data-unilib-results]');
        const selectedBefore = list.querySelector('[aria-selected="true"]').dataset.resultId;
        // Abort an over-budget synchronous layout before WebKit spends minutes
        // measuring thousands of content-visibility cards. This is a rendering
        // budget assertion, not a timing benchmark or a production fallback.
        const native = Element.prototype.getBoundingClientRect;
        let maxLayoutCards = 0;
        Element.prototype.getBoundingClientRect = function () {
          maxLayoutCards = Math.max(maxLayoutCards, list.children.length);
          if (list.children.length > 120) throw new Error('Catalog refresh rendered an unbounded prefix');
          return native.call(this);
        };
        ready = true;
        try { await ui.refresh(); }
        finally { Element.prototype.getBoundingClientRect = native; }
        return {
          selectedBefore, selectedAfter: list.querySelector('[aria-selected="true"]')?.dataset.resultId,
          first: list.firstElementChild?.querySelector('[data-result-id]')?.dataset.resultId,
          cards: list.children.length, maxLayoutCards,
          count: ui.element.querySelector('[data-unilib-count]').textContent,
          state: ui.element.querySelector('[data-unilib-result-state]').dataset.state,
        };
      });
      assert.ok(result.maxLayoutCards <= 120, JSON.stringify(result));
      assert.equal(result.state, 'ready');
      assert.equal(result.count, '8413개');
      assert.equal(result.selectedAfter, result.selectedBefore, 'background results preserve the current selection');
      assert.equal(result.first, 'existing-image', 'background arrivals retain existing result positions');
      assert.ok(result.cards <= 120);
      await page.locator('[data-unilib-type="question"]').click();
      await page.waitForFunction(() => document.querySelector('[data-unilib-result-state]').dataset.state === 'ready');
      assert.equal(await page.locator('[data-unilib-count]').textContent(), '8412개', 'all added questions remain searchable');
      assert.equal(await page.locator('[data-result-id]').first().getAttribute('data-result-id'), 'new-0', 'explicit filters use provider order');
      await page.evaluate(() => catalogFixture.close());
      assert.deepEqual(errors, []);
      console.log(name + ': 8412 late results preserve selection with bounded cards; explicit filter uses fresh order');
    } finally { await browser.close(); }
  }
}).catch(error => { console.error(error); process.exitCode = 1; });

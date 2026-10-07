const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium, webkit } = require('playwright');
const origin = process.env.RELEASE_URL || 'http://127.0.0.1:5173/';
const evidence = path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/library-startup/browser');
const snapshot = JSON.parse(fs.readFileSync('assets/pdf-library/catalog-bootstrap.json'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const book = snapshot.payload.catalog.documents.find(d => d.source.displayName === '교과서_중2.pdf');
const encode = value => JSON.stringify(value);
const gate = () => { let release; const promise = new Promise(r => release = r); return { promise, release }; };
async function setup(browser, { changed = false, fallback = false, indexFailure = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage(); const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message)); page.on('request', request => requests.push(request.url()));
  const metadata = gate(), indexGate = gate();
  const pack = structuredClone(snapshot.payload.pack), checksums = structuredClone(snapshot.payload.checksums), catalog = structuredClone(snapshot.payload.catalog);
  if (changed) { catalog.documents.find(d => d.id === book.id).title = '갱신된 중2 교과서'; pack.version += '-updated'; }
  if (changed || fallback) checksums.files[pack.paths.catalog] = hash(encode(catalog));
  checksums.pack = hash(encode(pack));
  const search = { schemaVersion: 'pdf-search-index-v1', entries: [{ documentId: book.id, pageNumber: 316, text: '교과서 힘 운동', normalized: '교과서 힘 운동', documentTitle: book.title, source: { documentId: book.id, pageNumber: 316, rect: [0,0,1,1], fullPageFallback: true } }] };
  checksums.files[pack.paths.searchIndex] = hash(encode(search));
  const state = { indexFailure, requests, errors, metadata, indexGate };
  if (fallback) await context.route('**/assets/pdf-library/catalog-bootstrap.json', route => route.fulfill({ status: 404, body: 'missing' }));
  await context.route('https://5e-google-drive-gateway.5e-desktop.workers.dev/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    const name = pathname.split('/').at(-1);
    try {
      if (name === 'pack.json' || name === 'checksums.json') {
        await metadata.promise; await route.fulfill({ contentType: 'application/json', body: encode(name === 'pack.json' ? pack : checksums) });
      } else if (name === pack.paths.catalog) await route.fulfill({ contentType: 'application/json', body: encode(catalog) });
      else if (name === pack.paths.searchIndex) {
        await indexGate.promise; await route.fulfill(state.indexFailure ? { status: 503, body: 'offline' } : { contentType: 'application/json', body: encode(search) });
      } else await route.fulfill({ status: 503, body: 'original offline' });
    } catch (error) { if (!page.isClosed()) throw error; }
  });
  await page.goto(`${origin}?mode=pro&mobile=0`, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  const skip = page.getByRole('button', { name: '건너뛰기', exact: true }); if (await skip.isVisible()) await skip.click();
  const ui = page.locator('.unified-library-overlay').last();
  const open = async () => { await page.locator('#exam-library-open').click(); await ui.locator('[data-result-id]').first().waitFor(); };
  return { context, page, ui, open, state };
}
async function cropBook(f) {
  const { page, ui } = f;
  await ui.locator('[data-unilib-type="pdf"]').click();
  await ui.locator('[data-unilib-query]').fill('교과서');
  const card = ui.locator(`[data-result-id$="${book.source.displayName}:page:1"]`);
  await card.waitFor(); await card.scrollIntoViewIfNeeded(); await card.click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-unilib-stage] img')].some(img => img.complete && img.naturalWidth));
  await ui.locator('[data-unilib-adjust]').click(); await ui.locator('[data-unilib-crop-load-state]').waitFor({ state: 'hidden' });
  await ui.locator('[data-unilib-crop-zoom-in]').click();
  const image = await ui.locator('[data-unilib-crop-image]').boundingBox();
  const stage = await ui.locator('[data-unilib-crop-stage]').boundingBox();
  const left = Math.max(image.x, stage.x) + 80, top = Math.max(image.y, stage.y) + 80;
  await page.mouse.move(left, top); await page.mouse.down(); await page.mouse.move(left + 120, top + 140, { steps: 6 }); await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector('[data-unilib-crop-save]')?.disabled);
}
const stateOfCrop = ui => ui.evaluate(el => ({ page: el.querySelector('[data-unilib-crop-page]').textContent, zoom: el.querySelector('[data-unilib-crop-zoom]').textContent, rect: el.querySelector('[data-unilib-crop-box]').getAttribute('style'), scroll: [el.querySelector('[data-unilib-crop-stage]').scrollLeft, el.querySelector('[data-unilib-crop-stage]').scrollTop], query: el.querySelector('[data-unilib-query]').value }));
(async () => {
  fs.mkdirSync(evidence, { recursive: true }); const results = [];
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true }); const contexts = [];
    try {
      let f = await setup(browser); contexts.push(f.context);
      const started = performance.now(); await f.open();
      const listMs = Math.round(performance.now() - started);
      assert.equal(await f.ui.getAttribute('data-search-readiness'), 'loading');
      assert.equal(f.state.requests.filter(url => /search-index\.json|catalog\.json/.test(url)).length, 0, 'no remote catalog/index blocks first list');
      assert.equal(f.state.requests.filter(url => /parts-library\/manifest|pdf-runtime\.js/.test(url)).length, 0, 'web listing has no parts/PDF runtime gate');
      await cropBook(f); const before = await stateOfCrop(f.ui);
      f.state.metadata.release(); f.state.indexGate.release();
      await f.page.waitForFunction(() => document.querySelector('.unified-library-overlay')?.dataset.searchReadiness === 'ready');
      await f.page.waitForTimeout(200); assert.deepEqual(await stateOfCrop(f.ui), before, 'index arrival preserves page, zoom, scroll, draft and query');
      await f.page.screenshot({ path: path.join(evidence, `${name}-crop-index-ready.png`) });
      await f.ui.locator('[data-unilib-crop-cancel]').click();
      await f.ui.locator('[data-unilib-query]').fill('힘 운동');
      await f.ui.locator(`[data-result-id$="${book.source.displayName}:page:316"]`).waitFor();
      assert.equal(await f.ui.locator('[data-unilib-query]').inputValue(), '힘 운동');
      await f.ui.locator('[data-unilib-query]').fill('교과서_중2.pdf');
      await f.ui.locator(`[data-result-id$="${book.source.displayName}:page:1"]`).waitFor();
      results.push({ engine: name, case: 'catalog-before-index-and-crop-preservation', listMs, before, errors: f.state.errors });
      assert.deepEqual(f.state.errors, []); await f.context.close();

      f = await setup(browser, { changed: true }); contexts.push(f.context); await f.open(); await cropBook(f);
      const oldCrop = await stateOfCrop(f.ui); f.state.metadata.release();
      await f.page.waitForTimeout(250); assert.deepEqual(await stateOfCrop(f.ui), oldCrop);
      assert.equal(f.state.requests.some(url => url.endsWith('search-index.json')), false, 'catalog replacement waits until crop closes');
      f.state.indexGate.release(); await f.ui.locator('[data-unilib-crop-cancel]').click();
      await f.page.waitForFunction(() => document.querySelector('.unified-library-overlay')?.dataset.searchReadiness === 'ready');
      await f.ui.locator('[data-unilib-query]').fill('힘 운동');
      await f.ui.locator(`[data-result-id$="${book.source.displayName}:page:316"]`).waitFor();
      assert.ok((await f.ui.locator(`[data-result-id$="${book.source.displayName}:page:316"]`).textContent()).includes('갱신된'));
      assert.deepEqual(f.state.errors, []); results.push({ engine: name, case: 'updated-catalog-deferred-during-crop', errors: f.state.errors }); await f.context.close();

      f = await setup(browser, { indexFailure: true }); contexts.push(f.context); await f.open();
      await f.ui.locator('[data-unilib-type="pdf"]').click();
      await f.ui.locator('[data-unilib-query]').fill('힘 운동'); await f.page.waitForTimeout(200);
      assert.ok((await f.ui.textContent()).includes('본문 검색 준비 중'));
      assert.equal(await f.ui.locator('[data-unilib-query]').inputValue(), '힘 운동');
      f.state.metadata.release(); f.state.indexGate.release();
      await f.page.waitForFunction(() => document.querySelector('.unified-library-overlay')?.dataset.searchReadiness === 'error');
      f.state.indexFailure = false; await f.ui.locator('[data-unilib-provided-retry]').click();
      await f.page.waitForFunction(() => document.querySelector('.unified-library-overlay')?.dataset.searchReadiness === 'ready');
      await f.ui.locator(`[data-result-id$="${book.source.displayName}:page:316"]`).waitFor();
      assert.equal(await f.ui.locator('[data-unilib-query]').inputValue(), '힘 운동');
      assert.deepEqual(f.state.errors, []); results.push({ engine: name, case: 'search-failure-retry-retains-query', errors: f.state.errors }); await f.context.close();

      f = await setup(browser, { fallback: true }); contexts.push(f.context);
      await f.page.evaluate(async base => { const cache = await caches.open('5e-library-catalog-v1'); await cache.put(new URL('__5e_catalog_snapshot__', base).href, new Response('{"payload":"corrupt"}')); }, snapshot.payload.baseUrl);
      f.state.metadata.release(); f.state.indexGate.release(); await f.open();
      await f.page.waitForFunction(() => document.querySelector('.unified-library-overlay')?.dataset.searchReadiness === 'ready');
      assert.ok(f.state.requests.some(url => url.endsWith('/catalog.json')));
      assert.deepEqual(f.state.errors, []); results.push({ engine: name, case: 'corrupt-cache-missing-bootstrap-remote-fallback', errors: f.state.errors }); await f.context.close();

      f = await setup(browser); contexts.push(f.context); await f.open();
      await f.ui.locator('[data-unilib-close]').click(); await f.ui.waitFor({ state: 'hidden' });
      f.state.metadata.release(); f.state.indexGate.release();
      await f.page.waitForFunction(() => document.querySelector('.unified-library-overlay')?.dataset.searchReadiness === 'ready');
      assert.equal(await f.ui.isVisible(), false); await f.open();
      assert.equal(await f.ui.getAttribute('data-search-readiness'), 'ready');
      assert.equal(f.state.requests.filter(url => url.endsWith('google-drive.json')).length, 1, 'mount/config deduplicated across reopen');
      assert.deepEqual(f.state.errors, []); results.push({ engine: name, case: 'closed-view-not-reopened-late-and-reopen-deduplicated', errors: f.state.errors });
    } finally { for (const context of contexts) await context.close().catch(() => {}); await browser.close(); }
  }
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify({ results, passed: results.length }, null, 2));
  console.log(`Stable library startup: ${results.length} Chromium/WebKit cases passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });

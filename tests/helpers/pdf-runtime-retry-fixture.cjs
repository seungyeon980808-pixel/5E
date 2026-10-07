const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium, webkit } = require('playwright');

const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value);

// Original, deterministic PDF geometry/text; no textbook or external material.
function pdfBytes() {
  const content = '0 0 0 RG 3 w 40 40 220 320 re S\nBT /F1 22 Tf 60 300 Td (1. MODULE RETRY) Tj ET\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
  ];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

function fixturePack() {
  const relative = '기출문제/물리1/p1_2025_11.pdf', id = 'module-retry-pdf';
  const source = { documentId: id, pageNumber: 1, rect: [.1, .1, .8, .8], fullPageFallback: false };
  const document = { schemaVersion: 'pdf-library-v1', id, title: 'p1_2025_11.pdf',
    source: { kind: 'pack', locator: `5e.shared.drive/${relative}`, displayName: 'p1_2025_11.pdf' },
    pageCount: 1, status: 'indexed', pages: [] };
  const metadata = { documentCode: 'p1_2025_11', academicYear: 2025, administration: '11', subject: 'p1' };
  const catalog = { schemaVersion: 'pdf-library-v1', documentMetadata: {}, documents: [document] };
  const search = { schemaVersion: 'pdf-search-index-v1', entries: [{ documentId: id, pageNumber: 1,
    itemId: 'q1', itemNumber: 1, text: 'MODULE RETRY', normalized: 'module retry', metadata, source }] };
  const pack = { schemaVersion: 1, id: '5e.shared.drive', version: 'test-module-retry', title: '5E 공유 자료',
    kind: 'exam', subjects: ['phy1'], academicYears: [2025], documentCount: 1, pageCount: 1,
    paths: { catalog: 'catalog.json', searchIndex: 'search-index.json', documents: [relative] } };
  const pdf = pdfBytes();
  const checksums = { algorithm: 'sha256', pack: hash(json(pack)), files: {
    'catalog.json': hash(json(catalog)), 'search-index.json': hash(json(search)), [relative]: hash(pdf),
  } };
  return { pack, checksums, catalog, search, pdf };
}

async function runPdfRuntimeRetryCases({ origin, evidence }) {
  fs.mkdirSync(evidence, { recursive: true });
  const results = [], fixture = fixturePack();
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const scenario of ['normal', 'automatic-retry', 'manual-retry']) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        const page = await context.newPage();
        const errors = [], moduleRequests = []; let offline = scenario === 'manual-retry';
        await context.addInitScript(() => localStorage.setItem('5e.tutorial.bannerSeen', 'true'));
        page.on('pageerror', error => errors.push(error.message));
        await context.route('**/assets/pdf-library/catalog-bootstrap.json', route => route.fulfill({ status: 404, body: 'force verified remote fixture' }));
        await context.route('https://5e-google-drive-gateway.5e-desktop.workers.dev/**', route => {
          const url = decodeURIComponent(new URL(route.request().url()).pathname);
          const body = url.endsWith('/pack.json') ? json(fixture.pack)
            : url.endsWith('/checksums.json') ? json(fixture.checksums)
            : url.endsWith('/catalog.json') ? json(fixture.catalog)
            : url.endsWith('/search-index.json') ? json(fixture.search)
            : fixture.pdf;
          return route.fulfill({ contentType: url.endsWith('.pdf') ? 'application/pdf' : 'application/json', body });
        });
        await context.route('**/js/pdf-library/pdf-runtime.js?*', route => {
          moduleRequests.push(route.request().url());
          return offline || (scenario === 'automatic-retry' && moduleRequests.length === 1)
            ? route.abort('failed') : route.continue();
        });
        try {
          await page.goto(`${origin}?mode=pro&mobile=0`, { waitUntil: 'load' });
          await page.locator('#canvas').waitFor({ state: 'visible' });
          const skip = page.getByRole('button', { name: '건너뛰기', exact: true });
          if (await skip.isVisible()) await skip.click();
          await page.locator('#exam-library-open').click();
          const ui = page.locator('.unified-library-overlay').last();
          await page.waitForFunction(() => document.querySelector('.unified-library-overlay')?.dataset.searchReadiness === 'ready');
          await ui.locator('[data-unilib-type="question"]').click();
          await ui.locator('[data-result-kind="crop"]').first().click();
          const stage = ui.locator('[data-unilib-stage]');
          if (scenario === 'manual-retry') {
            const retry = stage.getByRole('button', { name: '다시 시도', exact: true });
            await retry.waitFor({ state: 'visible' });
            const before = moduleRequests.length;
            assert.ok(before >= 2, 'automatic retry was attempted before reporting failure');
            await page.screenshot({ path: path.join(evidence, `${name}-retry-visible.png`) });
            offline = false;
            await retry.click();
            await stage.locator('.unilib-preview-image img').waitFor();
            assert.ok(moduleRequests.length > before, 'manual retry actually fetches a fresh module');
          }
          const preview = stage.locator('.unilib-preview-image img');
          await preview.waitFor();
          await preview.evaluate(img => img.decode());
          assert.ok(await preview.evaluate(img => img.naturalWidth > 100));
          assert.equal(new Set(moduleRequests).size, moduleRequests.length, 'no failed module URL is reused');
          assert.equal(new URL(moduleRequests[0]).searchParams.get('v'), '1.6.3-pdf-runtime-retry');
          if (scenario === 'normal') assert.equal(moduleRequests.length, 1);
          if (scenario === 'automatic-retry') assert.equal(moduleRequests.length, 2);

          await ui.locator('[data-unilib-adjust]').click();
          const image = ui.locator('[data-unilib-crop-image]');
          await image.waitFor(); await image.evaluate(img => img.decode());
          // Poll synchronously: an async predicate can be mistaken for a truthy Promise.
          await page.waitForFunction(() => {
            const img = document.querySelector('[data-unilib-crop-image]');
            const quality = document.querySelector('[data-unilib-crop-quality]');
            return img?.naturalWidth >= 600 && quality?.hidden;
          });
          const originalWidth = await image.evaluate(img => img.naturalWidth);
          await ui.locator('[data-unilib-crop-stage]').focus();
          await page.keyboard.press('Enter');
          await ui.locator('[data-unilib-crop-save]:not([disabled])').click();
          await ui.locator('.unilib-crop-collection-thumb').first().waitFor();
          assert.match(await ui.locator('[data-unilib-crop-count]').textContent(), /1개/);
          assert.deepEqual(errors, []);
          await page.screenshot({ path: path.join(evidence, `${name}-${scenario}-original-crop.png`) });
          results.push({ engine: name, scenario, originalWidth, moduleRequests, realPdfJsRender: true, crop: true, errors, passed: true });
        } catch (error) {
          await page.screenshot({ path: path.join(evidence, `${name}-${scenario}-failure.png`) }).catch(() => {});
          results.push({ engine: name, scenario, moduleRequests, passed: false, error: error.stack });
          throw error;
        } finally {
          await context.close();
          fs.writeFileSync(path.join(evidence, 'results.json'), json(results));
        }
      }
    } finally { await browser.close(); }
  }
  return results;
}

module.exports = { runPdfRuntimeRetryCases };

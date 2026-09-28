const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { fixture, root } = require('./helpers/separation-fixtures.cjs');
const evidence = process.env.TASK6_EVIDENCE || path.join(root, '.omo/evidence/ai-workbench-polish-0928/task6');
const contentTypes = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2' };
function server() {
  return http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname === '/review') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Separation review QA</title><link rel="stylesheet" href="/preview/css/style.css"><link rel="stylesheet" href="/preview/css/ai-editable-assets.css"></head><body><button id="review">분리 결과 확인</button></body></html>');
      return;
    }
    const target = path.resolve(root, `.${decodeURIComponent(pathname)}`);
    if (!target.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    fs.readFile(target, (error, body) => {
      if (error) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'Content-Type': contentTypes[path.extname(target)] || 'application/octet-stream' }); response.end(body);
    });
  });
}

test('numbered original regions, isolated PNGs and stale/cancel/retry dialog behavior in Chromium and WebKit', { timeout: 180000 }, async context => {
  fs.mkdirSync(evidence, { recursive: true });
  const source = await fixture();
  const local = server();
  await new Promise(resolve => local.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise(resolve => local.close(resolve)));
  const records = [];
  for (const [engine, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await browserType.launch({ headless: true });
    try {
      for (const width of [375, 768, 1280]) {
        const theme = width === 768 ? 'dark' : 'light';
        const session = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce', colorScheme: theme });
        try {
          await session.tracing.start({ screenshots: true, snapshots: true });
          const page = await session.newPage();
          const errors = []; page.on('pageerror', error => errors.push(error.message));
          let remoteRequests = 0;
          await page.route('**/*', route => {
            if (!route.request().url().startsWith(`http://127.0.0.1:${local.address().port}/`)) { remoteRequests++; return route.abort(); }
            return route.continue();
          });
          await page.goto(`http://127.0.0.1:${local.address().port}/review`);
          await page.evaluate(async ({ dataUrl, theme }) => {
            document.documentElement.dataset.theme = theme;
            const { prepareSeparatedAssets } = await import('/preview/js/ai-separated-assets.js');
            const { openEditableAssetsDialog } = await import('/preview/js/ai-editable-assets-dialog.js');
            const prepared = await prepareSeparatedAssets(dataUrl);
            window.reviewState = { prepared, source: dataUrl, original: JSON.stringify(prepared), current: true, inserts: [], resolutions: [], failInsert: false, fallback: false };
            document.querySelector('#review').onclick = () => {
              const state = window.reviewState;
              void openEditableAssetsDialog({ dataUrl, initialPrepared: state.fallback ? { ...prepared, fallbackToOriginal: true } : prepared, artboard: { w: 90, h: 60 }, isCurrent: () => state.current,
                onInsert: result => { if (state.failInsert) return false; state.inserts.push(result); return true; },
              }).then(value => state.resolutions.push(value));
            };
          }, { dataUrl: source.dataUrl, theme });
          // Given: an already generated fixture; When: opening production review via a click.
          await page.click('#review');
          await page.waitForFunction(() => document.querySelectorAll('.aea-thumbnail img').length === 3);
          // Then: default original and numbered bounds map one-to-one to isolated PNGs.
          assert.equal(await page.locator('.aea-original').isVisible(), true);
          assert.equal(await page.locator('.aea-overlay').isVisible(), true);
          assert.deepEqual(await page.locator('.aea-region-number').allTextContents(), ['1', '2', '3']);
          const mapping = await page.evaluate(() => window.reviewState.prepared.assets.map(asset => {
            const row = [...document.querySelectorAll('.aea-row')].find(node => node.dataset.regionId === asset.id);
            const region = [...document.querySelectorAll('.aea-overlay g')].find(node => node.dataset.regionId === asset.id).querySelector('rect');
            return { id: asset.id, thumbnailMatches: row.querySelector('img').src === asset.data, boundsMatch: ['x', 'y', 'width', 'height'].every(key => Number(region.getAttribute(key)) === asset[key]) };
          }));
          assert.ok(mapping.every(item => item.thumbnailMatches && item.boundsMatch));
          await page.locator('.aea-thumbnail').nth(1).click();
          assert.equal(await page.locator('.aea-overlay g[aria-pressed="true"]').getAttribute('data-region-id'), 'separated_2');
          await page.locator('.aea-overlay g[data-region-id="separated_1"] .aea-region-number-bg').click();
          assert.equal(await page.locator('.aea-row[data-selected="true"]').getAttribute('data-region-id'), 'separated_1');
          await page.locator('.aea-overlay g[data-region-id="separated_3"]').focus();
          await page.keyboard.press('Enter');
          assert.equal(await page.locator('.aea-row[data-selected="true"]').getAttribute('data-region-id'), 'separated_3');
          assert.equal(await page.evaluate(() => {
            const row = document.querySelector('.aea-row[data-selected="true"]').getBoundingClientRect();
            const list = document.querySelector('.aea-list').getBoundingClientRect();
            return row.top >= list.top - 1 && row.bottom <= list.bottom + 1;
          }), true, 'selected thumbnail remains visible in its scrolling list');
          await page.screenshot({ path: path.join(evidence, `${engine}-${width}-regions.png`) });
          await page.click('[data-action="preview"]');
          assert.equal(await page.locator('.aea-preview').isVisible(), true);
          await page.screenshot({ path: path.join(evidence, `${engine}-${width}-isolated.png`) });
          await page.click('[data-action="preview"]');
          assert.equal(await page.locator('.aea-overlay').isVisible(), true);
          await page.click('[data-action="zoom-in"]');
          assert.equal(await page.locator('.aea-zoom').textContent(), '125%');
          await page.click('[data-action="fit"]');
          assert.equal(await page.locator('.aea-zoom').textContent(), '100%');
          await page.click('[data-action="refine"]');
          await page.click('[data-mode="merge"]');
          await page.locator('.aea-thumbnail').nth(0).click();
          await page.locator('.aea-thumbnail').nth(1).click();
          await page.waitForFunction(() => document.querySelectorAll('.aea-thumbnail').length === 2);
          assert.equal(await page.locator('.aea-overlay g[data-region-id]').count(), 2);
          assert.equal(await page.evaluate(() => JSON.stringify(window.reviewState.prepared) === window.reviewState.original), true);
          await page.screenshot({ path: path.join(evidence, `${engine}-${width}-refined.png`) });
          await page.click('[data-action="cancel"]');
          assert.equal(await page.locator('.aea-dialog').count(), 0);
          assert.deepEqual(await page.evaluate(() => window.reviewState.resolutions), [false]);
          await page.click('#review');
          await page.waitForFunction(() => document.querySelectorAll('.aea-thumbnail img').length === 3);
          await page.evaluate(() => { window.reviewState.failInsert = true; });
          await page.click('[data-action="insert"]');
          assert.equal(await page.locator('.aea-dialog').count(), 1);
          assert.equal(await page.evaluate(() => window.reviewState.inserts.length), 0);
          await page.evaluate(() => { window.reviewState.failInsert = false; });
          await page.click('[data-action="insert"]');
          await page.waitForFunction(() => window.reviewState.inserts.length === 1);
          assert.equal(await page.evaluate(() => window.reviewState.inserts[0].assets.length), 3);
          assert.equal(await page.evaluate(() => window.reviewState.inserts[0].assets.every((asset, index) => asset.data === window.reviewState.prepared.assets[index].data)), true);
          assert.equal(await page.locator('.aea-dialog').count(), 0);
          assert.equal(await page.evaluate(() => JSON.stringify(window.reviewState.prepared) === window.reviewState.original), true);
          assert.equal(await page.evaluate(() => window.reviewState.source), source.dataUrl);
          // Given: an open review; When: caller invalidates output; Then: no stale insertion.
          await page.click('#review');
          await page.waitForFunction(() => document.querySelectorAll('.aea-thumbnail img').length === 3);
          await page.evaluate(() => { window.reviewState.current = false; });
          await page.click('[data-action="insert"]');
          assert.equal(await page.locator('[data-action="insert"]').isDisabled(), true);
          assert.equal(await page.evaluate(() => window.reviewState.inserts.length), 1);
          await page.evaluate(() => { window.reviewState.current = true; });
          assert.equal(await page.locator('[data-action="insert"]').isDisabled(), true, 'an invalidated review cannot revive');
          await page.click('[data-action="cancel"]');
          await page.evaluate(() => { window.reviewState.current = true; window.reviewState.fallback = true; });
          await page.click('#review');
          await page.waitForFunction(() => document.querySelector('.aea-source')?.naturalWidth === 160);
          assert.equal(await page.locator('[data-action="insert"]').isDisabled(), true);
          await page.click('[data-action="cancel"]');
          assert.deepEqual(errors, []);
          assert.equal(remoteRequests, 0, 'local separation causes no remote request');
          records.push({ engine, width, theme, regionCount: 3, mapping, zoomReset: true, refinedCount: 2, cancelled: true, retryInserted: 3, staleRejected: true, fallbackRejected: true, remoteRequests, errors });
          await session.tracing.stop({ path: path.join(evidence, `${engine}-${width}-trace.zip`) });
        } finally { await session.close(); }
      }
    } finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(evidence, 'browser-results.json'), JSON.stringify(records, null, 2));
});

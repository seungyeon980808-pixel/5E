/** Check the cumulative report's filters, image viewer, downloads and layout. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const [evidence] = process.argv.slice(2);
if (!evidence) throw Error('Usage: node tools/check-graph-restoration-report.cjs evidence-directory');
const output = path.resolve(evidence, 'report-qa'); fs.mkdirSync(output, { recursive: true });
const url = process.env.REPORT_URL || 'http://127.0.0.1:8797/outputs/graph-restoration/index.html';
const contextData = JSON.parse(fs.readFileSync(path.resolve(evidence, 'context.json')));
const report = { browser: 'WebKit', url, nativeSafari: false, checks: [], screenshots: [] };
(async () => {
  const browser = await webkit.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url); await page.evaluate(() => document.querySelectorAll('img').forEach(i => i.loading = 'eager'));
    await page.evaluate(async () => Promise.all([...document.images].filter(i => i.src).map(i => i.decode())));
    const count = await page.locator('.graph-case').count();
    assert(count >= 8); assert.equal(await page.locator('#visible-count').textContent(), count+'개 결과');
    report.checks.push({ name: 'Images decoded; all records counted', pass: true, records: count });
    await page.locator('#run').selectOption(contextData.runId);
    assert.equal(await page.locator('.graph-case:visible').count(), 8);
    await page.screenshot({ path: path.join(output, 'desktop.png') }); report.screenshots.push('desktop.png');
    await page.locator('#group').selectOption('replay'); assert.equal(await page.locator('.graph-case:visible').count(), 5);
    for (const card of await page.locator('.graph-case:visible').all()) {
      const id = await card.getAttribute('data-search'); const key = id.match(/p[12]_\d{4}_\d{2}_\d{2}/)[0];
      await card.locator('.comparison').scrollIntoViewIfNeeded();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const filename = 'replay-'+key+'.png'; await card.locator('.comparison').screenshot({ path: path.join(output, filename) }); report.screenshots.push(filename);
    }
    await page.locator('#group').selectOption('live'); assert.equal(await page.locator('.graph-case:visible').count(), 3);
    for (const card of await page.locator('.graph-case:visible').all()) {
      const id = await card.getAttribute('data-search'); const key = id.match(/p[12]_\d{4}_\d{2}_\d{2}/)[0];
      await card.locator('.comparison').scrollIntoViewIfNeeded();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const filename = 'live-'+key+'.png'; await card.locator('.comparison').screenshot({ path: path.join(output, filename) }); report.screenshots.push(filename);
    }
    await page.locator('#group').selectOption('all'); await page.locator('#search').fill('2024학년도');
    assert.equal(await page.locator('.graph-case:visible').count(), 2);
    await page.locator('#search').fill('없는문항TEST'); assert.equal(await page.locator('.graph-case:visible').count(), 0);
    await page.locator('#search').fill(''); await page.locator('#review').check();
    assert((await page.locator('.graph-case:visible').count()) > 0);
    await page.locator('#review').uncheck();
    await page.locator('.image-open:visible').first().click(); await page.locator('dialog[open]').waitFor();
    assert((await page.locator('dialog img').evaluate(i => i.naturalWidth)) > 0);
    await page.keyboard.press('Escape'); assert.equal(await page.locator('dialog[open]').count(), 0);
    await page.locator('.technical:visible').first().locator('summary').click(); assert((await page.locator('.technical:visible code').count()) > 0);
    const downloads = await page.locator('.graph-case:not([hidden]) .download').evaluateAll(a => a.map(a => a.href));
    for (const file of downloads) assert.equal((await page.request.get(file)).status(), 200);
    report.checks.push({ name: 'Run/group/search/review filters, formula disclosure, zoom and 8 file links', pass: true });
    await page.locator('#run').selectOption('all'); await page.locator('#group').selectOption('history');
    assert.equal(await page.locator('.graph-case:visible').count(), count-8);
    report.checks.push({ name: 'Historical records remain independently accessible', pass: true, records: count-8 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } }); const phone = await mobile.newPage();
    await phone.goto(url); await phone.locator('#run').selectOption(contextData.runId);
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await phone.screenshot({ path: path.join(output, 'mobile.png') }); report.screenshots.push('mobile.png');
    assert.deepEqual(errors, []); report.checks.push({ name: '1440px and 390px layouts; no horizontal overflow or page errors', pass: true });
    await mobile.close(); await context.close();
    report.pass = true;
  } finally { await browser.close(); fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

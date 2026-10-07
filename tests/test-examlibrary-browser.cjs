const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const root = path.resolve(__dirname, '..');
const site = process.env.FIVE_E_SITE_ROOT || root;
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/examlibrary-browser');
const publicRoute = process.env.FIVE_E_PUBLIC_ROUTE === '1';
const address = 'https://www.5e.ai.kr/examlibrary/';
const html = fs.readFileSync(path.join(site, 'examlibrary/index.html'), 'utf8');

(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const records = [];
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const [width, id, group, subject] of [
        [1440, '2026_11_math_common_odd_01', 'math', 'math'],
        [375, 'p1_2025_11_01', 'science', 'p1'],
      ]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 }, acceptDownloads: true });
        page.setDefaultTimeout(120000);
        const errors = [], pdfResponses = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => {
          if (response.url().includes('.workers.dev/') && response.headers()['content-type']?.includes('application/pdf')) pdfResponses.push(response.status());
        });
        if (!publicRoute) await page.route(`${address}**`, route => route.fulfill({ contentType: 'text/html', body: html }));
        const query = new URLSearchParams({ group, subject, id, view: 'split' });
        await page.goto(`${address}?${query}`);
        const app = page.frameLocator('#examlibrary');
        const frame = await page.locator('#examlibrary').boundingBox();
        assert.equal(frame.width, width, 'the app fills the available width');
        assert.equal(frame.height, 1000, 'the app fills the viewport without an extra header');
        await app.locator('#open-editable').click();
        await app.locator('#editable-image-mode').selectOption('exclude');
        await app.locator('#editable-start').click();
        await app.locator('#editable-download').waitFor({ state: 'visible' });
        await app.locator('#editable-download:not([disabled])').waitFor();
        await app.frameLocator('#editable-host iframe').getByRole('textbox', { name: '문서 편집 입력' }).waitFor();
        const event = page.waitForEvent('download');
        await app.locator('#editable-download').click();
        const download = await event;
        const filename = path.join(evidence, `${name}-${width}.hwpx`);
        await download.saveAs(filename);
        const bytes = fs.readFileSync(filename);
        assert.ok(bytes.length > 1000, 'HWPX downloads work through the 5E wrapper');
        assert.ok(pdfResponses.includes(200), 'the original PDF really loads');
        await app.locator('#editable-close').click();
        await app.locator('#workspace-mode').selectOption('files');
        await page.waitForURL(url => url.origin === 'https://www.5e.ai.kr' && url.pathname === '/examlibrary/' && url.searchParams.get('mode') === 'files');
        await app.locator('.file-row').first().waitFor();
        await app.locator('.file-row .file-select').first().click();
        await app.locator('.file-page-canvas[data-rendered="true"]').first().waitFor();
        await page.screenshot({ path: path.join(evidence, `${name}-${width}.png`) });
        assert.deepEqual(errors, []);
        records.push({ browser: name, width, id, publicRoute, bytes: bytes.length, pdfResponses, bookmark: page.url(), errors });
        console.log(`${name} ${width}px: real PDF, editable HWPX download, file preview, and 5E bookmarks PASS`);
        await page.close();
      }
    } finally { await browser.close(); }
  }
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(records, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });

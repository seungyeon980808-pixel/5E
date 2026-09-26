const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const ROOT = path.resolve(__dirname, '..');
const EVIDENCE = process.env.EVIDENCE_DIR || path.join(ROOT, '.omo/evidence/task5-input');
const MIME = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

function startStaticServer() {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relative = pathname === '/' ? '/preview/index.html' : pathname;
    const filePath = path.resolve(ROOT, `.${relative}`);
    if (!filePath.startsWith(`${ROOT}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      response.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function waitForPersonalLibrary(page) {
  await page.locator('#personal-parts').waitFor({ state: 'attached' });
}

async function initPersonalLibrary(page) {
  await page.evaluate(async () => {
    const { initPersonalObjects } = await import('./js/personal-objects.js?v=1.6.0-preview-lite-hybrid-0922');
    await initPersonalObjects({ get: () => ({}) });
  });
}

async function importCategory(page, category) {
  await page.evaluate(async ({ category }) => {
    const { importLibraryString } = await import('./js/personal-objects.js?v=1.6.0-preview-lite-hybrid-0922');
    await importLibraryString(JSON.stringify([{
      id: 'qa-personal-category',
      name: 'CJK \'name\' «angle»',
      category,
      subject: 'p',
      savedAt: '2026-09-26T00:00:00.000Z',
      objects: [],
    }]));
  }, { category });
}

async function observe(page) {
  return page.evaluate(() => {
    const header = document.querySelector('#personal-parts .subject-part-header');
    const category = header?.querySelector(':scope > span:first-child');
    return {
      probe: window.__categoryProbe,
      headerText: header?.textContent || null,
      categoryText: category?.textContent || null,
      categoryHtml: category?.innerHTML || null,
      nestedImages: category?.querySelectorAll('img').length || 0,
      nestedElements: category?.children.length || 0,
      collapsed: header?.parentElement?.classList.contains('is-collapsed') || false,
      stored: JSON.parse(localStorage.getItem('5e.preview:5e.personalObjects') || 'null'),
    };
  });
}

(async () => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const server = await startStaticServer();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== '0' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const probeRequests = [];
  page.on('request', (request) => {
    if (request.url().includes('__missing-category-probe')) probeRequests.push(request.url());
  });
  await page.addInitScript(() => {
    localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
    localStorage.setItem('5e.tutorial.bannerSeen', 'true');
    window.__categoryProbe = 0;
  });

  try {
    const initialCategory = '역학 "인용" <각도>';
    const category = '역학 "인용" <img src="/__missing-category-probe" onerror="window.__categoryProbe += 1"> <각도>';
    await page.goto(`${origin}/preview/index.html?mode=pro&mobile=0`, { waitUntil: 'domcontentloaded' });
    await waitForPersonalLibrary(page);
    await initPersonalLibrary(page);
    await importCategory(page, initialCategory);
    await page.waitForTimeout(50);
    const initial = await observe(page);
    assert.equal(initial.categoryText, initialCategory, 'CJK, quotes, and angle brackets must remain literal after import');
    assert.equal(initial.nestedElements, 0, 'Normal category punctuation must not create child elements');
    await importCategory(page, category);
    await page.waitForTimeout(150);
    const imported = await observe(page);
    assert.equal(imported.categoryText, category, 'Imported category must remain literal text in the library header');
    assert.equal(imported.nestedImages, 0, 'Markup-looking category text must not create an image element');
    assert.equal(imported.nestedElements, 0, 'Markup-looking category text must not create child elements');
    assert.equal(imported.probe, 0, 'Category markup must not execute an event handler');
    assert.deepEqual(probeRequests, [], 'Literal category text must not request a probe URL');

    const header = page.locator('#personal-parts .subject-part-header');
    await header.evaluate((element) => element.click());
    assert.equal((await observe(page)).collapsed, false, 'Category header button must still toggle its section');
    await page.locator('.personal-store-btn').evaluate((element) => element.click());
    await page.locator('#postore-cat').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#postore-cat option').filter({ hasText: category }).count(), 1, 'Store filter must preserve the literal category label');
    await page.screenshot({ path: path.join(EVIDENCE, 'category-import-render.png'), fullPage: true });
    await page.locator('#postore-close').evaluate((element) => element.click());

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForPersonalLibrary(page);
    await initPersonalLibrary(page);
    const reloaded = await observe(page);
    assert.equal(reloaded.categoryText, category, 'Persisted category must remain literal text after reload');
    assert.equal(reloaded.nestedImages, 0, 'Reload must not interpret persisted category markup');
    assert.equal(reloaded.probe, 0, 'Reload must not execute persisted category markup');
    await page.screenshot({ path: path.join(EVIDENCE, 'category-persisted-reload.png'), fullPage: true });
    assert.deepEqual(errors, [], 'Browser page must have no uncaught errors');

    const report = {
      scenario: 'import-markup-looking-category-render-persist-reload',
      invocation: `node ${path.relative(ROOT, __filename)} with isolated Chromium context`,
      origin,
      imported,
      initial,
      reloaded,
      probeRequests,
      screenshots: ['category-import-render.png', 'category-persisted-reload.png'],
      errors,
      passed: true,
    };
    fs.writeFileSync(path.join(EVIDENCE, 'category-text-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await context.close();
    await browser.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

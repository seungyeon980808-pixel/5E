const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8798/preview/';
const evidence = process.env.EVIDENCE_DIR;
(async () => {
  if (evidence) mkdirSync(evidence, { recursive: true });
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    try {
      for (const mode of ['pro', 'lite']) {
        const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
        await page.addInitScript(() => {
          localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
          localStorage.setItem('5e.tutorial.bannerSeen', 'true');
        });
        const failures = [];
        page.on('pageerror', error => failures.push(error.message));
        page.on('response', response => {
          if (response.status() >= 400 && /\.(js|css)(\?|$)/.test(response.url())) failures.push(response.url());
        });
        await page.goto(`${base}?mode=${mode}&mobile=0`);
        await page.locator('#object-search-title').waitFor({ state: 'attached' });
        assert.ok(await page.locator('#scene > *').count(), 'Artboard must render');
        assert.equal(await page.locator('.app-shell-header').count(), 1);
        const file = await page.locator('#file-menu-btn').boundingBox();
        const theme = await page.locator('#theme-toggle').boundingBox();
        if (file && theme) assert.ok(file.x + file.width <= theme.x, 'Header controls must not overlap');
        assert.deepEqual(failures, []);
        if (evidence) await page.screenshot({ path: `${evidence}/${name}-${mode}.png` });
        await page.close();
      }
      const page = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 1512, height: 982 } });
      await page.goto(base);
      assert.equal(await page.locator('.app-shell-header .toolbar-history #undo-btn').count(), 1);
      const file = await page.locator('#file-menu-btn').boundingBox();
      const theme = await page.locator('#theme-toggle').boundingBox();
      assert.ok(file && theme && file.x + file.width <= theme.x, 'Static header must not overlap');
      if (evidence) await page.screenshot({ path: `${evidence}/${name}-static.png` });
      console.log(`${name}: Pro/Lite startup and static header PASS`);
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

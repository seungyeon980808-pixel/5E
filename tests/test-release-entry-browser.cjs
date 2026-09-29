const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.RELEASE_URL || 'http://127.0.0.1:8798/';
const evidence = process.env.EVIDENCE_DIR;

async function drawLine(page, stateModule) {
  await page.locator('[data-tool="L"]').click();
  const canvas = await page.locator('#canvas').boundingBox();
  assert.ok(canvas, 'canvas must be visible');
  await page.mouse.click(canvas.x + canvas.width * 0.4, canvas.y + canvas.height * 0.4);
  await page.mouse.click(canvas.x + canvas.width * 0.6, canvas.y + canvas.height * 0.6);
  await page.keyboard.press('Escape');
  return page.evaluate(async modulePath => {
    const { state } = await import(modulePath);
    return state.get().objects.length;
  }, stateModule);
}

(async () => {
  if (evidence) fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      localStorage.setItem('5e.tutorial.bannerSeen', 'true');
      localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
    });
    const report = [];
    for (const surface of [
      { name: 'root', url: 'index.html', stateModule: './js/state.js?v=1.4.0' },
      { name: 'preview', url: 'preview/?mode=pro&mobile=0', stateModule: './js/state.js?v=1.7.0-preview-0930' },
    ]) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push({ type: 'pageerror', text: error.message }));
      page.on('response', response => {
        if (response.status() >= 400 && response.url().startsWith(base)) {
          errors.push({ type: 'response', status: response.status(), url: response.url() });
        }
      });
      await page.goto(new URL(surface.url, base).href, { waitUntil: 'load' });
      await page.locator('#canvas').waitFor({ state: 'visible' });
      assert.equal(await drawLine(page, surface.stateModule), 1, `${surface.name} draws a line`);
      await page.locator('#undo-btn').click();
      assert.equal(await page.evaluate(async modulePath => {
        const { state } = await import(modulePath);
        return state.get().objects.length;
      }, surface.stateModule), 0, `${surface.name} undoes the line`);

      if (surface.name === 'preview') {
        await page.locator('#redo-btn').click();
        await page.locator('#mode-toggle-btn').click();
        await page.getByRole('button', { name: '취소', exact: true }).click();
        assert.equal(await page.locator('html').getAttribute('data-mode'), 'pro');
        await page.locator('#mode-toggle-btn').click();
        await page.getByRole('button', { name: '유지하고 전환', exact: true }).click();
        await page.waitForFunction(() => !document.getElementById('mode-toggle-btn').disabled);
        assert.equal(await page.locator('html').getAttribute('data-mode'), 'lite');
        assert.equal(await page.evaluate(async modulePath => {
          const { state } = await import(modulePath);
          return state.get().objects.length;
        }, surface.stateModule), 1, 'preview retains the line across mode switch');
      }

      assert.deepEqual(errors, [], `${surface.name} browser errors`);
      if (evidence) await page.screenshot({ path: path.join(evidence, `${surface.name}.png`), fullPage: true });
      report.push({ surface: surface.name, errors, passed: true });
      await page.close();
    }
    if (evidence) fs.writeFileSync(path.join(evidence, 'browser-results.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const previewUrl = process.env.PREVIEW_URL || 'http://127.0.0.1:8765/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 375, height: 900 } });
    await context.addInitScript(() => {
      Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined });
    });
    const page = await context.newPage();
    await page.goto(previewUrl, { waitUntil: 'load' });
    await page.evaluate(() => document.querySelector('.tut-welcome-overlay')?.remove());
    assert.match(await page.evaluate(() => Function.prototype.toString.call(window.showDirectoryPicker)), /\[native code\]/);
    assert.equal(await page.evaluate(() => typeof window.showSaveFilePicker), 'undefined');
    await page.locator('#file-menu-btn').click();
    await page.locator('#project-save').click();
    const dialog = page.locator('#project-save-overlay');
    await dialog.waitFor({ state: 'visible' });
    assert.equal(await dialog.locator('#project-save-dir-pick').innerText(), '폴더 연결');
    assert.equal(await dialog.getByRole('button', { name: '폴더에 저장', exact: true }).isDisabled(), true);
    assert.match(await dialog.locator('#project-save-dir-path').innerText(), /폴더에 저장하려면 연결/);
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await context.close();
  } finally {
    await browser.close();
  }
  console.log('project save folder dialog exposes only a real directory-capable branch');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

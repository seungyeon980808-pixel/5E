const assert = require('node:assert/strict');
const fs = require('node:fs');
const { webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const previewUrl = process.env.PREVIEW_URL || 'http://127.0.0.1:8765/';

(async () => {
  const browser = await webkit.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.addInitScript(() => {
      localStorage.setItem('5e.preview:5e.tutorial.bannerSeen', 'true');
      localStorage.setItem('5e.tutorial.bannerSeen', 'true');
    });
    await page.goto(previewUrl, { waitUntil: 'load' });
    assert.equal(await page.evaluate(() => typeof window.showDirectoryPicker), 'undefined');
    assert.equal(await page.evaluate(() => typeof window.showSaveFilePicker), 'undefined');
    await page.locator('#file-menu-btn').click();
    await page.locator('#project-save').click();
    const dialog = page.locator('.modal-overlay:not([hidden])').last();
    await dialog.locator('.modal-input').fill('왕복 확인');
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: '저장', exact: true }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename().normalize('NFC'), '왕복 확인.5e');
    const saved = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(saved.version, '0.17');
    assert.equal(saved.pages.length, 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
  console.log('project save fallback download parsed successfully');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:24894";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${baseUrl}/tests/fixtures/unified-library-ui-qa.html`);
  await page.waitForSelector(".unilib-result-card");
  await page.evaluate(() => { window.qaPreviewDelay = 10000; });
  await page.locator('[data-unilib-type="pdf"]').click();
  await page.waitForFunction(() => window.qaPreviewCalls.some((call) => call.options.thumbnail));
  await page.evaluate(() => { window.qaPreviewDelay = 0; });
  await page.locator('[data-unilib-pdf-mode="page"]').click();
  const started = Date.now();
  const query = page.locator("[data-unilib-query]");
  await query.fill("A B");
  await page.waitForFunction(() => document.querySelector("[data-unilib-count]").textContent === "2개");
  const resultMs = Date.now() - started;
  await page.waitForFunction(() => document.querySelectorAll(".unilib-thumb img").length === 2, {}, { timeout: 1800 });
  const thumbnailMs = Date.now() - started;
  assert.ok(thumbnailMs < 2000, "new thumbnails must not wait for the old 10-second PDF request");
  const firstCalls = await page.evaluate(() => window.qaPreviewCalls.filter((call) => call.options.thumbnail).length);
  await query.fill("cross page");
  await page.waitForFunction(() => document.querySelector("[data-unilib-count]").textContent === "0개");
  await query.fill("A B");
  await page.waitForFunction(() => document.querySelectorAll(".unilib-thumb img").length === 2);
  assert.equal(await page.evaluate(() => window.qaPreviewCalls.filter((call) => call.options.thumbnail).length), firstCalls, "revisiting results reuses thumbnails");
  console.log(JSON.stringify({ resultMs, thumbnailMs, cachedThumbnailsReused: true }));
} finally {
  await browser.close();
}

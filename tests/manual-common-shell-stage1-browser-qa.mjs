import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url).pathname;
const output = ".omo/evidence/common-shell-0919/screenshots";
const mime = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  const path = normalize(join(root, decodeURIComponent(new URL(request.url, "http://localhost").pathname)));
  if (!path.startsWith(root)) { response.writeHead(403).end(); return; }
  try { response.setHeader("content-type", mime[extname(path)] || "application/octet-stream"); response.end(await readFile(path)); }
  catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 768 }, colorScheme: "dark" });
const url = `http://127.0.0.1:${server.address().port}/tests/fixtures/unified-library-ui-qa.html`;
const report = { url, viewport: [1280, 768] };

try {
  await page.goto(url);
  await page.waitForSelector(".unilib-result-card");
  const geometry = async () => page.evaluate(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return [box.x, box.y, box.width, box.height];
    };
    return { folder: rect("[data-unilib-folders-open]"), preview: rect("[data-unilib-preview-toggle]"), search: rect("[data-unilib-query]") };
  });
  report.headerBefore = await geometry();
  await page.locator("[data-unilib-pane-collapse]").click();
  report.headerAfterFolderCollapse = await geometry();
  assert.deepEqual(report.headerAfterFolderCollapse.folder, report.headerBefore.folder);
  assert.deepEqual(report.headerAfterFolderCollapse.preview, report.headerBefore.preview);
  await page.screenshot({ path: join(output, "library-1280-collapsed.png") });

  const searchBeforeHelp = report.headerAfterFolderCollapse.search;
  await page.locator("[data-unilib-help] summary").click();
  assert.equal((await geometry()).search[2], searchBeforeHelp[2]);
  await page.screenshot({ path: join(output, "library-help-open.png") });
  await page.locator("[data-unilib-query]").click();
  assert.equal(await page.locator("[data-unilib-help]").evaluate((node) => node.open), false);
  assert.equal(await page.locator(".unified-library-overlay").evaluate((node) => node.hidden), false);
  await page.locator("[data-unilib-help] summary").click();
  await page.keyboard.press("Escape");
  report.helpEscape = await page.evaluate(() => ({ helpOpen: document.querySelector("[data-unilib-help]").open, libraryHidden: document.querySelector(".unified-library-overlay").hidden }));
  assert.deepEqual(report.helpEscape, { helpOpen: false, libraryHidden: false });

  await page.evaluate(() => { window.qaProviderGate = Promise.withResolvers(); });
  await page.locator("[data-unilib-query]").fill("pending");
  await page.locator("[data-unilib-query]").press("Enter");
  await page.waitForSelector('[data-unilib-result-state][data-state="loading"]');
  report.loading = await page.evaluate(() => ({ count: document.querySelector("[data-unilib-count]").textContent, state: document.querySelector("[data-unilib-result-state]").textContent }));
  assert.equal(report.loading.count, "불러오는 중");
  await page.screenshot({ path: join(output, "library-search-loading.png") });
  await page.evaluate(() => window.qaProviderGate.resolve());
  await page.waitForSelector('[data-unilib-result-state][data-state="empty"]');

  await page.evaluate(() => { window.qaProviderGate = Promise.withResolvers(); });
  await page.locator("[data-unilib-query]").fill("failed");
  await page.locator("[data-unilib-query]").press("Enter");
  await page.waitForSelector('[data-unilib-result-state][data-state="loading"]');
  await page.evaluate(() => window.qaProviderGate.reject(new Error("fixture provider failure")));
  await page.waitForSelector('[data-unilib-result-state][data-state="error"]');
  report.error = await page.evaluate(() => ({ retryVisible: !document.querySelector("[data-unilib-result-retry]").hidden, text: document.querySelector("[data-unilib-result-state]").textContent }));
  assert.equal(report.error.retryVisible, true);
  await page.screenshot({ path: join(output, "library-search-error-retry.png") });
  await page.evaluate(() => { window.qaProviderGate = null; });
  await page.locator("[data-unilib-result-retry]").click();
  await page.waitForSelector('[data-unilib-result-state][data-state="empty"]');
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/panel-visibility-qa.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app [data-panel-toggle]");
  const panelGeometry = async () => page.evaluate(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height];
    };
    return {
      editorLeft: box('.app [data-panel-toggle="left"]'),
      editorRight: box('.app [data-panel-toggle="right"]'),
      aiLeft: box('#ai-image-panel [data-panel-toggle="left"]'),
      aiRight: box('#ai-image-panel [data-panel-toggle="right"]'),
    };
  });
  report.panelsBefore = await panelGeometry();
  await page.locator('.app [data-panel-toggle="left"]').evaluate((node) => node.click());
  await page.locator('.app [data-panel-toggle="right"]').evaluate((node) => node.click());
  await page.locator('#ai-image-panel [data-panel-toggle="left"]').evaluate((node) => node.click());
  await page.locator('#ai-image-panel [data-panel-toggle="right"]').evaluate((node) => node.click());
  await page.waitForTimeout(500);
  report.panelsAfterCollapse = await panelGeometry();
  assert.deepEqual(report.panelsAfterCollapse, report.panelsBefore);
  await page.screenshot({ path: join(output, "editor-ai-header-toggles-collapsed.png") });
  await writeFile(join(output, "browser-qa.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

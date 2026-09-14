import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url).pathname;
const evidence = join(root, ".omo/evidence/library-next/assignment");
const mime = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml" };
await mkdir(evidence, { recursive: true });
const server = createServer(async (request, response) => {
  const path = normalize(join(root, decodeURIComponent(new URL(request.url, "http://localhost").pathname)));
  if (!path.startsWith(root)) { response.writeHead(403).end(); return; }
  try { response.setHeader("content-type", mime[extname(path)] || "application/octet-stream"); response.end(await readFile(path)); }
  catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, colorScheme: "dark" });
const observations = [];
const open = async () => {
  await page.click("#open");
  await page.waitForSelector('.workbench-assignment[role="dialog"]');
  await page.waitForFunction(() => {
    const link = document.querySelector('link[data-workbench-assignment-style]');
    return Boolean(link?.sheet);
  });
};

try {
  await page.goto(`http://127.0.0.1:${address.port}/tests/fixtures/workbench-assignment-qa.html`);
  await open();
  assert.equal(await page.$eval(".workbench-assignment", (element) => getComputedStyle(element).borderRadius), "12px");
  assert.equal(await page.$eval('[data-action="continue"]', (element) => getComputedStyle(element).backgroundColor !== getComputedStyle(element.closest(".workbench-assignment")).backgroundColor), true);
  assert.equal(await page.getAttribute('[data-placement="separate"]', "aria-pressed"), "true");
  await page.screenshot({ path: join(evidence, "default-separate.png") });
  await page.locator('[data-action="continue"]').focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "닫기");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.action), "continue");
  await page.click('[data-action="continue"]');
  assert.deepEqual(await page.evaluate(() => window.qaResults.at(-1)), { placement: "separate", groups: [[0], [1], [2]] });
  assert.equal(await page.evaluate(() => document.activeElement.id), "open");
  observations.push("default separate result, focus trap, and return focus verified");

  await open();
  await page.click('[data-placement="together"]');
  await page.click('[data-action="continue"]');
  assert.deepEqual(await page.evaluate(() => window.qaResults.at(-1)), { placement: "together", groups: [[0, 1, 2]] });
  observations.push("together result verified");

  await open();
  await page.click('[data-placement="advanced"]');
  await page.click('[data-reference="0"]');
  await page.click('[data-action="add-bench"]');
  await page.click('[data-reference="0"]');
  await page.waitForSelector('[role="alertdialog"]');
  await page.screenshot({ path: join(evidence, "duplicate-confirmation.png") });
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.confirm), "ok");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator('[role="alertdialog"]').count(), 0);
  assert.equal(await page.locator('.workbench-assignment[role="dialog"]').count(), 1);
  await page.click('[data-reference="0"]');
  await page.click('[data-confirm="ok"]');
  assert.match(await page.textContent('[data-reference="0"] small'), /작업대 1 · 작업대 2/u);
  await page.click('[data-reference="0"]');
  assert.equal(await page.textContent('[data-reference="0"] small'), "작업대 1");
  await page.click('[data-reference="0"]');
  await page.click('[data-confirm="ok"]');
  observations.push("duplicate confirmation, top Escape priority, and selected-workbench removal verified");

  const continueButton = page.locator('[data-action="continue"]');
  await continueButton.focus();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "닫기");
  await page.click('[data-action="continue"]');
  await page.waitForSelector('[role="alertdialog"]');
  await page.screenshot({ path: join(evidence, "unassigned-confirmation.png") });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator('.workbench-assignment[role="dialog"]').count(), 1);
  await page.click('[data-action="continue"]');
  await page.click('[data-confirm="ok"]');
  assert.deepEqual(await page.evaluate(() => window.qaResults.at(-1)), { placement: "advanced", groups: [[0], [0]] });
  observations.push("main focus trap and explicit unassigned exclusion verified");

  await open();
  await page.click('[data-placement="advanced"]');
  await page.click('[data-action="continue"]');
  assert.match(await page.textContent("[data-error]"), /하나 이상/u);
  await page.screenshot({ path: join(evidence, "empty-rejected.png") });
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => window.qaResults.at(-1)), null);
  observations.push("empty advanced assignment rejected and Escape cancel verified");

  await open();
  await page.click('[data-placement="advanced"]');
  await page.click('[data-reference="0"]');
  await page.click('[data-action="add-bench"]');
  await page.click('[data-reference="0"]');
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.qaResults.at(-1) === null && !document.querySelector('.workbench-assignment[role="dialog"]'));
  assert.equal(await page.locator('.workbench-assignment[role="dialog"]').count(), 0);
  assert.equal(await page.evaluate(() => window.qaResults.at(-1)), null);
  observations.push("cancellation after a pending duplicate confirmation stays cancelled");

  await page.setViewportSize({ width: 560, height: 760 });
  await open();
  await page.click('[data-placement="advanced"]');
  await page.click('[data-reference="1"]');
  await page.screenshot({ path: join(evidence, "advanced-narrow.png"), fullPage: false });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await page.keyboard.press("Escape");
  observations.push("narrow advanced layout has no horizontal overflow");

  await writeFile(join(evidence, "browser-results.json"), JSON.stringify({ passed: true, scenarios: observations }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

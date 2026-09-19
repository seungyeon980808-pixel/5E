import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url).pathname;
const output = process.argv[2] || ".omo/evidence/crop-collection-0919/flow";
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });

const drawAndAccept = async ([x1, y1, x2, y2]) => {
  const box = await page.locator("[data-unilib-crop-canvas]").boundingBox();
  assert.ok(box, "crop canvas is visible");
  await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * x2, box.y + box.height * y2, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector("[data-unilib-crop-save]").disabled);
  await page.locator("[data-unilib-crop-save]").click();
};

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/unified-library-ui-qa.html`);
  await page.waitForSelector('[data-result-id="q1"]');

  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await page.locator('[data-result-id="file:qa"]').click();
  await page.locator("[data-unilib-adjust]").click();
  await page.waitForFunction(() => document.querySelector("[data-unilib-crop-stage]").getAttribute("aria-busy") === "false");
  await drawAndAccept([0.12, 0.16, 0.36, 0.42]);
  await drawAndAccept([0.56, 0.52, 0.84, 0.78]);
  await page.locator("[data-unilib-crop-cancel]").click();

  await page.locator("[data-unilib-query]").fill("A B");
  await page.locator("[data-unilib-query]").press("Enter");
  await page.getByRole("button", { name: "페이지", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-result-kind="pdf"]').length === 2);
  await page.locator('[data-result-kind="pdf"]').nth(1).click();
  await page.locator("[data-unilib-adjust]").click();
  await page.waitForFunction(() => document.querySelector("[data-unilib-crop-stage]").getAttribute("aria-busy") === "false");
  await drawAndAccept([0.18, 0.18, 0.42, 0.44]);
  await page.locator("[data-unilib-crop-cancel]").click();

  const tray = page.locator("[data-unilib-crop-tray]");
  await tray.waitFor({ state: "visible" });
  assert.equal(await page.locator("[data-unilib-crop-tray-count]").textContent(), "3개");
  assert.equal(await page.locator("[data-unilib-crop-tray-toggle]").getAttribute("aria-expanded"), "false");
  await page.screenshot({ path: join(output, "collapsed.png") });

  await page.locator("[data-unilib-crop-tray-toggle]").click();
  await tray.evaluate((node) => new Promise((resolve) => node.addEventListener("transitionend", resolve, { once: true })));
  assert.equal(await page.locator(".unilib-crop-tray-item").count(), 3);
  assert.equal(await tray.evaluate((node) => node.classList.contains("is-expanded")), true);
  const images = await page.locator(".unilib-crop-tray-item > img").evaluateAll((nodes) => nodes.map((node) => ({ fit: getComputedStyle(node).objectFit, width: node.clientWidth, height: node.clientHeight })));
  assert.ok(images.every(({ fit, width, height }) => fit === "contain" && width > 0 && height > 0), "every crop thumbnail is fully contained");
  await page.screenshot({ path: join(output, "expanded.png") });
  for (const width of [768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    if (await page.locator(".unilib").evaluate((node) => node.classList.contains("preview-open"))) {
      const transition = page.locator(".unilib-preview").evaluate((node) => new Promise((resolve) => node.addEventListener("transitionend", resolve, { once: true })));
      await page.locator("[data-unilib-preview-toggle]").click();
      await transition;
    }
    const scrim = page.locator("[data-unilib-scrim]");
    if (await scrim.isVisible()) {
      const transition = page.locator(".unilib-folders").evaluate((node) => new Promise((resolve) => node.addEventListener("transitionend", resolve, { once: true })));
      await scrim.click({ position: { x: 2, y: 2 } });
      await transition;
    }
    await page.locator(".unilib").evaluate((node) => Promise.all(node.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined))));
    assert.deepEqual(await page.locator(".unilib").evaluate((node) => ({ folders: node.classList.contains("folders-open"), preview: node.classList.contains("preview-open") })), { folders: false, preview: false });
    const overflow = await page.locator(".unilib").evaluate((node) => node.scrollWidth - node.clientWidth);
    assert.ok(overflow <= 1, `${width}px library has no horizontal overflow`);
    await page.screenshot({ path: join(output, `expanded-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.locator("[data-unilib-crop-review]").click();
  await page.waitForSelector(".workbench-assignment");
  assert.equal(await page.locator(".workbench-assignment-reference").count(), 3);
  assert.equal(await page.locator('[data-action="continue"]').textContent(), "AI 작업으로 보내기");
  await page.locator('[data-placement="together"]').click();
  await page.screenshot({ path: join(output, "assignment.png") });
  await page.locator('[data-action="continue"]').click();
  await page.waitForFunction(() => window.qaAiCalls.length === 1);
  const delivery = await page.evaluate(() => window.qaAiCalls[0]);
  assert.equal(delivery.references.length, 3);
  assert.deepEqual(delivery.groups, [[0, 1, 2]]);
  await writeFile(join(output, "result.json"), JSON.stringify({ pass: true, crops: 3, pages: [1, 4], collapsed: true, expanded: true, assignment: delivery.groups }, null, 2));
  console.log("PASS: crops from multiple pages persist, expand, and send through the existing workbench assignment.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

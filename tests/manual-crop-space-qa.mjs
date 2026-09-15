import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url).pathname;
const output = process.argv[2] || ".omo/evidence/library-page-crop-restore/impl";
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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });
const report = { scenarios: [] };

const captureFit = async (name) => {
  const geometry = await page.evaluate(() => {
    const stage = document.querySelector("[data-unilib-crop-stage]");
    const canvas = document.querySelector("[data-unilib-crop-canvas]");
    const image = document.querySelector("[data-unilib-crop-image]");
    return {
      viewport: [innerWidth, innerHeight],
      stage: [stage.clientWidth, stage.clientHeight],
      canvas: [canvas.offsetWidth, canvas.offsetHeight],
      natural: [image.naturalWidth, image.naturalHeight],
      horizontalOverflow: stage.scrollWidth > stage.clientWidth + 1,
      verticalOverflow: stage.scrollHeight > stage.clientHeight + 1,
    };
  });
  assert.equal(geometry.horizontalOverflow, false);
  assert.equal(geometry.verticalOverflow, false);
  assert.ok(Math.abs(geometry.canvas[0] / geometry.canvas[1] - geometry.natural[0] / geometry.natural[1]) < 0.01);
  await page.screenshot({ path: join(output, `${name}.png`) });
  report.scenarios.push({ name, geometry });
};

const openExpandedPage = async () => {
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/unified-library-ui-qa.html?independent=1`);
  await page.waitForSelector(".unilib-result-card");
  await page.locator("[data-unilib-query]").fill("A B");
  await page.locator("[data-unilib-query]").press("Enter");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await page.getByRole("button", { name: "페이지", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".unilib-result-card").length === 2);
  await page.locator(".unilib-result-card").first().click();
  await page.keyboard.down("Space");
  await page.waitForTimeout(450);
  await page.waitForSelector("[data-unilib-crop]:not([hidden])");
  await page.keyboard.up("Space");
  await page.waitForFunction(() => document.querySelector("[data-unilib-crop-image]").naturalWidth > 0);
  const initial = await page.evaluate(() => {
    const crop = document.querySelector("[data-unilib-crop]");
    return {
      page: Number(crop.dataset.pdfPage),
      viewOnly: crop.classList.contains("is-view-only"),
      sidebarVisible: document.querySelector(".unilib-crop-preview").getBoundingClientRect().width > 0,
      draftHidden: document.querySelector("[data-unilib-crop-box]").hidden,
      acceptedCount: document.querySelectorAll("[data-unilib-crop-remove]").length,
    };
  });
  assert.deepEqual(initial, { page: 2, viewOnly: false, sidebarVisible: true, draftHidden: true, acceptedCount: 0 });
};

const draw = async ([x1, y1, x2, y2]) => {
  const box = await page.locator("[data-unilib-crop-canvas]").boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0);
  await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * x2, box.y + box.height * y2, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector("[data-unilib-crop-save]").disabled);
};

try {
 await openExpandedPage();
 await draw([.12,.14,.36,.4]);
 await page.keyboard.down('Space');
 await page.keyboard.down('Space');
 await page.waitForTimeout(150);
 await page.keyboard.up('Space');
 assert.equal(await page.locator('[data-unilib-crop-remove]').count(),1);
 await draw([.56,.52,.84,.78]);
 await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelectorAll('[data-unilib-crop-remove]').length===2);
 await page.screenshot({path:join(output,'crop-space.png')});
 console.log('PASS: Space accepts once, Enter still accepts, opening Space does not accept');
} finally { await browser.close(); server.close(); }

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

const rejectStaleProviderOpen = async () => {
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/unified-library-ui-qa.html?independent=1`);
  await page.waitForSelector(".unilib-result-card");
  await page.locator("[data-unilib-query]").fill("A B");
  await page.locator("[data-unilib-query]").press("Enter");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await page.getByRole("button", { name: "페이지", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".unilib-result-card").length === 2);
  await page.locator(".unilib-result-card").first().click();
  await page.evaluate(() => { window.qaProviderGate = Promise.withResolvers(); });
  await page.keyboard.down("Space");
  await page.waitForFunction(() => window.qaProviderStarted === true);
  await page.waitForFunction(() => document.querySelector("[data-unilib-crop]").dataset.pdfPage === "2");
  await page.keyboard.up("Space");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.qaProviderGate.resolve());
  await page.waitForTimeout(50);
  const state = await page.evaluate(() => ({
    libraryHidden: document.querySelector(".unified-library-overlay").hidden,
    cropHidden: document.querySelector("[data-unilib-crop]").hidden,
    cropBusy: document.querySelector("[data-unilib-crop-stage]").getAttribute("aria-busy"),
  }));
  assert.deepEqual(state, { libraryHidden: true, cropHidden: true, cropBusy: null });
  report.scenarios.push({ name: "stale-provider-open-rejected", state });
};

const captureExpandedFile = async () => {
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/unified-library-ui-qa.html?independent=1`);
  await page.waitForSelector(".unilib-result-card");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await page.waitForSelector('.unilib-result-card[data-result-kind="pdf"]');
  await page.locator('.unilib-result-card[data-result-kind="pdf"]').click();
  await page.waitForSelector('.unilib-pdf-page[data-pdf-page="1"] img');
  await page.keyboard.down("Space");
  await page.waitForTimeout(450);
  await page.waitForSelector(".unilib-preview.library-reader--expanded");
  await page.keyboard.up("Space");
  const geometry = await page.evaluate(() => {
    const pages = [...document.querySelectorAll(".unilib-pdf-page")];
    const image = pages[0].querySelector("img");
    const box = image.getBoundingClientRect();
    return {
      natural: [image.naturalWidth, image.naturalHeight],
      display: [box.width, box.height],
      rowStride: pages[1].getBoundingClientRect().top - pages[0].getBoundingClientRect().top,
      pageCount: pages.length,
    };
  });
  assert.ok(Math.abs(geometry.display[0] / geometry.display[1] - geometry.natural[0] / geometry.natural[1]) < 0.01);
  assert.equal(Math.round(geometry.rowStride), 760);
  assert.ok(geometry.display[0] < 800 && geometry.display[1] <= 700 && geometry.pageCount > 1);
  await page.screenshot({ path: join(output, "file-continuous-fit-1920.png") });
  report.scenarios.push({ name: "file-continuous-fit-1920", geometry });
  await page.keyboard.press("Escape");
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

const acceptTwo = async () => {
  await draw([0.12, 0.14, 0.36, 0.4]);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll("[data-unilib-crop-remove]").length === 1);
  await draw([0.56, 0.52, 0.84, 0.78]);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll("[data-unilib-crop-remove]").length === 2);
};

try {
await page.setViewportSize({width:1440,height:900});await openExpandedPage();
const placement=await page.locator('.unilib-crop-help').evaluate(e=>({inHeader:!!e.closest('header'),previous:e.previousElementSibling?.hasAttribute('data-unilib-crop-fit'),footerCount:document.querySelectorAll('.unilib-crop-footer .unilib-crop-help').length}));
assert.deepEqual(placement,{inHeader:true,previous:true,footerCount:0});await page.screenshot({path:join(output,'header-help.png')});await writeFile(join(output,'result.json'),JSON.stringify(placement));
}finally{await browser.close();await new Promise(r=>server.close(r));}

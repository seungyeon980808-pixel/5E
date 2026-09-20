import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url).pathname;
const output = join(root, process.argv[2] || ".omo/evidence/crop-close-flow/current");
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
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, colorScheme: "dark" });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

const libraryState = () => page.evaluate(() => ({
  libraryVisible: !document.querySelector(".unified-library-overlay").hidden,
  cropVisible: !document.querySelector("[data-unilib-crop]").hidden,
  cropTrayExpanded: document.querySelector("[data-unilib-crop-tray]").classList.contains("is-expanded"),
  assignmentVisible: Boolean(document.querySelector(".workbench-assignment-overlay")),
  focusedResult: document.activeElement?.getAttribute("data-result-id") || null,
  aiFocused: document.activeElement?.hasAttribute("data-unilib-ai") || false,
}));
const expectedLibrary = (extra = {}) => ({
  libraryVisible: true,
  cropVisible: false,
  cropTrayExpanded: false,
  assignmentVisible: false,
  focusedResult: null,
  aiFocused: false,
  ...extra,
});

const openFixture = async () => {
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/unified-library-ui-qa.html?independent=1`);
  await page.waitForSelector('[data-result-id="q1"]');
};
const holdSpaceForExpandedSurface = async () => {
  await page.keyboard.down("Space");
  await page.waitForSelector("[data-unilib-crop]:not([hidden])");
  await page.keyboard.up("Space");
  await page.waitForFunction(() => document.querySelector("[data-unilib-crop-stage]").getAttribute("aria-busy") === "false");
};
const openPdfCrop = async () => {
  await page.locator('[data-result-id="q1"]').click();
  await page.waitForSelector("[data-unilib-stage] img");
  await holdSpaceForExpandedSurface();
};
const drawAndAccept = async ([x1, y1, x2, y2], expectedCount) => {
  const box = await page.locator("[data-unilib-crop-canvas]").boundingBox();
  assert.ok(box, "crop canvas is visible");
  await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * x2, box.y + box.height * y2, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector("[data-unilib-crop-save]").disabled);
  await page.locator("[data-unilib-crop-save]").click();
  await page.waitForFunction((count) => document.querySelectorAll("[data-unilib-crop-remove]").length === count, expectedCount);
};

const observations = [];
try {
  // Given a crop editor opened from a result, when its explicit close button is used,
  // then focus and state return to the library result without expanding the crop tray.
  await openFixture();
  await openPdfCrop();
  await page.locator("[data-unilib-crop-cancel]").click();
  assert.deepEqual(await libraryState(), expectedLibrary({ focusedResult: "q1" }));
  await page.screenshot({ path: join(output, "crop-close-button-library.png") });
  observations.push("crop close button returns to q1 in the open library");

  // Given the crop editor is open, when one allowed Escape is pressed,
  // then only the crop surface closes.
  await openPdfCrop();
  await page.keyboard.press("Escape");
  assert.deepEqual(await libraryState(), expectedLibrary({ focusedResult: "q1" }));
  await page.screenshot({ path: join(output, "crop-escape-library.png") });
  observations.push("crop Escape closes one surface and returns to q1");

  // Given a view-only expanded preview, when Escape is pressed,
  // then it returns to its result instead of leaving the library.
  await openFixture();
  await page.locator('[data-result-id="q2"]').click();
  await page.waitForSelector("[data-unilib-stage] img");
  await holdSpaceForExpandedSurface();
  await page.keyboard.press("Escape");
  assert.deepEqual(await libraryState(), expectedLibrary({ focusedResult: "q2" }));
  await page.screenshot({ path: join(output, "expanded-escape-library.png") });
  observations.push("expanded preview Escape returns to q2");

  // Given a workbench assignment opened from accepted crops, when Escape cancels it,
  // then the re-enabled library action regains focus and the library remains open.
  await openFixture();
  await openPdfCrop();
  await drawAndAccept([0.12, 0.14, 0.36, 0.4], 1);
  await drawAndAccept([0.56, 0.52, 0.84, 0.78], 2);
  await page.locator("[data-unilib-crop-workbench]").click();
  await page.locator("[data-unilib-ai]").click();
  await page.waitForSelector(".workbench-assignment-overlay");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.activeElement?.hasAttribute("data-unilib-ai"));
  assert.deepEqual(await libraryState(), expectedLibrary({ aiFocused: true }));
  observations.push("assignment Escape returns focus to the library AI action");

  // Given the same assignment can be reopened, when its close button is clicked,
  // then the click also returns to the library without activating content behind it.
  await page.locator("[data-unilib-ai]").click();
  await page.waitForSelector(".workbench-assignment-overlay");
  await page.locator('.workbench-assignment [aria-label="닫기"]').click();
  await page.waitForFunction(() => document.activeElement?.hasAttribute("data-unilib-ai"));
  assert.deepEqual(await libraryState(), expectedLibrary({ aiFocused: true }));
  observations.push("assignment close button returns focus to the library AI action");

  await page.locator("[data-unilib-crop-tray-toggle]").click();
  await page.waitForSelector("[data-unilib-crop-tray].is-expanded");
  const captions = await page.locator(".unilib-crop-tray-item > span").count();
  const sourceTooltip = await page.locator(".unilib-crop-tray-item").first().getAttribute("title");
  await page.screenshot({ path: join(output, "crop-tray-images-only.png"), animations: "disabled" });
  const imageFill = await page.locator(".unilib-crop-tray-item").first().evaluate(item => ({
    cardWidth: item.clientWidth, imageWidth: item.querySelector("img").getBoundingClientRect().width,
  }));
  assert.ok(Math.abs(imageFill.cardWidth - imageFill.imageWidth) < 2, "image must fill the card without a reserved metadata column");
  await page.keyboard.press("Escape");
  const afterTrayEscape = await libraryState();
  console.log(JSON.stringify({ captions, sourceTooltip, afterTrayEscape }));
  assert.equal(captions, 0, "crop collection must not render metadata or separator rows");
  assert.ok(sourceTooltip, "source remains available on hover");
  assert.equal(afterTrayEscape.libraryVisible, true, "Escape from the crop collection must keep the library open");
  assert.equal(afterTrayEscape.cropTrayExpanded, false, "Escape must collapse only the crop collection");
  assert.equal(await page.locator("[data-unilib-crop-tray-toggle]").evaluate(node => node === document.activeElement), true);
  assert.equal(await page.locator(".unilib-crop-tray-item").count(), 2, "Escape must preserve accepted crops");
  observations.push("expanded crop collection has images only and Escape preserves the library and both crops");

  assert.deepEqual(pageErrors, []);
  await page.screenshot({ path: join(output, "assignment-cancelled-library.png") });
  await writeFile(join(output, "browser-results.json"), `${JSON.stringify({ passed: true, observations, pageErrors }, null, 2)}\n`);
  console.log(`PASS: ${observations.join("; ")}`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

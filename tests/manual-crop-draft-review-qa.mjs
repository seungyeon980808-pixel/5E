import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url).pathname;
const output = process.argv[2] || ".omo/evidence/stage1-repair-0919/crop-draft-review";
const mime = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
await mkdir(output, { recursive: true });

const server = createServer(async (request, response) => {
  const path = normalize(join(root, decodeURIComponent(new URL(request.url, "http://localhost").pathname)));
  if (!path.startsWith(root)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader("content-type", mime[extname(path)] || "application/octet-stream");
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
const draw = async ([x1, y1, x2, y2]) => {
  const box = await page.locator("[data-unilib-crop-canvas]").boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, "crop canvas is available");
  await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * x2, box.y + box.height * y2, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(() => !document.querySelector("[data-unilib-crop-save]").disabled);
};

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/unified-library-ui-qa.html`);
  await page.waitForSelector('[data-result-id="q1"]');
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await page.locator('[data-result-id="file:qa"]').click();
  await page.locator("[data-unilib-adjust]").click();
  await page.waitForFunction(() => document.querySelector("[data-unilib-crop-stage]").getAttribute("aria-busy") === "false");

  await draw([0.12, 0.16, 0.36, 0.42]);
  assert.equal(await page.locator("[data-unilib-crop-ai]").isDisabled(), true, "an unaccepted draft cannot be sent to AI");
  assert.equal(await page.locator(".unilib-crop-collection-item").count(), 0, "accepted collection excludes the draft");
  assert.equal(await page.locator("[data-unilib-crop-draft-review]").isVisible(), true, "the draft has its own review area");
  await page.screenshot({ path: join(output, "draft-review.png") });

  await page.locator("[data-unilib-crop-draft-cancel]").click();
  assert.equal(await page.locator(".unilib-crop-collection-item").count(), 0, "cancel leaves no accepted card");

  await draw([0.12, 0.16, 0.36, 0.42]);
  await page.locator("[data-unilib-crop-save]").click();
  await page.waitForFunction(() => document.querySelectorAll("[data-unilib-crop-remove]").length === 1);
  const firstId = await page.locator("[data-accepted-crop-id]").first().getAttribute("data-accepted-crop-id");
  assert.equal(await page.locator("[data-unilib-crop-ai]").isEnabled(), true, "accepted crop can be sent to AI");

  await draw([0.56, 0.52, 0.84, 0.78]);
  assert.equal(await page.locator(".unilib-crop-collection-item").count(), 1, "a second draft does not add a second accepted card");
  assert.equal(await page.locator("[data-accepted-crop-id]").first().getAttribute("data-accepted-crop-id"), firstId, "first marker identity survives a new draft");
  await page.locator("[data-unilib-crop-draft-cancel]").click();
  assert.equal(await page.locator("[data-accepted-crop-id]").first().getAttribute("data-accepted-crop-id"), firstId, "first marker identity survives draft cancellation");

  await draw([0.56, 0.52, 0.84, 0.78]);
  await page.locator("[data-unilib-crop-save]").click();
  await page.waitForFunction(() => document.querySelectorAll("[data-unilib-crop-remove]").length === 2);
  const secondId = await page.locator("[data-accepted-crop-id]").nth(1).getAttribute("data-accepted-crop-id");
  await page.locator(`[data-unilib-crop-remove="${secondId}"]`).click();
  assert.equal(await page.locator("[data-accepted-crop-id]").count(), 1, "deleting the second accepted crop leaves one marker");
  assert.equal(await page.locator("[data-accepted-crop-id]").first().getAttribute("data-accepted-crop-id"), firstId, "deleting a later crop preserves the first identity");

  const marker = page.locator("[data-accepted-crop-id]").first();
  const markerBox = await marker.boundingBox();
  assert.ok(markerBox, "accepted marker remains editable");
  await page.mouse.move(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(markerBox.x + markerBox.width / 2 + 24, markerBox.y + markerBox.height / 2 + 18, { steps: 3 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector("[data-unilib-crop-box]").hidden);
  assert.equal(await marker.getAttribute("data-accepted-crop-id"), firstId, "editing retains the accepted marker identity");
  await page.screenshot({ path: join(output, "accepted-after-edit.png") });
  await writeFile(join(output, "result.json"), JSON.stringify({ pass: true, firstId, scenarios: ["draft-separate", "cancel-stable", "delete-stable", "edit-stable"] }, null, 2));
  console.log("PASS: draft review is separate from accepted cards and accepted identities remain stable.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const assert = require("node:assert/strict");
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const previewUrl = process.env.PREVIEW_URL || "http://127.0.0.1:8798/preview/?mode=lite";

function liteUrl() {
  const url = new URL(previewUrl);
  url.searchParams.set("mode", "lite");
  return url.href;
}

async function run(engine) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await page.addInitScript(() => {
      localStorage.setItem("5e.preview:5e.tutorial.bannerSeen", "true");
      localStorage.setItem("5e.tutorial.bannerSeen", "true");
      localStorage.setItem("5e.aiActiveTask.v1", JSON.stringify({ scope: "restored", taskId: "restored:task-1" }));
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(liteUrl(), { waitUntil: "load" });

    assert.equal(await page.locator("html").getAttribute("data-mode"), "lite");
    assert.equal(await page.locator("#canvas").isVisible(), true, "Lite keeps the shared main canvas");
    assert.equal(await page.locator("#panel-left").isVisible(), true, "Lite keeps tools on the left");
    assert.ok(await page.locator('#tool-list .tool-btn[data-lite-label]:visible').count() > 0, "Lite exposes approved tools");
    assert.equal(await page.locator("#ai-image-panel").isVisible(), false, "restored AI state does not auto-open a dock");
    assert.equal(await page.locator("#tutorial-btn").evaluate((button) => button.closest(".app-shell-header") !== null), true,
      "help remains in the current top toolbar position");
    assert.equal(await page.locator("#lite-dock").count(), 0, "retired Lite dock stays absent");
    assert.deepEqual(errors, []);
    console.log(`${engine.name()}: Lite shared canvas, left tools, help position, and no auto-open PASS`);
  } finally {
    await browser.close();
  }
}

(async () => {
  for (const engine of [chromium, webkit]) await run(engine);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

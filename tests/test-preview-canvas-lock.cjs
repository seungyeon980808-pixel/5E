const assert = require("node:assert/strict");
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const previewUrl = process.env.PREVIEW_URL || "http://127.0.0.1:8794/preview/";

async function viewBox(page) {
  return page.locator("#canvas").getAttribute("viewBox");
}

async function worldScreen(page, x, y) {
  return page.locator("#canvas").evaluate((svg, point) => {
    const source = svg.createSVGPoint();
    source.x = point.x;
    source.y = point.y;
    const result = source.matrixTransform(svg.getScreenCTM());
    const rect = svg.getBoundingClientRect();
    return { x: result.x, y: result.y, centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2 };
  }, { x, y });
}

async function chooseMode(page, mode) {
  await page.locator("#center-view-btn").click();
  await page.locator(`[data-canvas-lock-mode="${mode}"]`).click();
}

async function panHorizontally(page) {
  await page.locator("#canvas").hover({ position: { x: 700, y: 500 } });
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 180);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(50);
}

(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      await page.goto(previewUrl);
      await page.getByRole("button", { name: "건너뛰기", exact: true }).click();
      const button = page.locator("#center-view-btn");
      assert.equal(await button.getAttribute("data-mode"), "free");
      await button.click();
      assert.equal(await page.locator("#canvas-lock-menu").isVisible(), true);
      assert.equal(await page.locator("[data-canvas-lock-mode]").count(), 3);
      await page.locator("#canvas-lock-x").fill("12");
      await page.locator("#canvas-lock-y").fill("-7");
      await page.locator('[data-canvas-lock-mode="coordinate"]').click();
      assert.equal(await button.getAttribute("data-mode"), "coordinate");
      const target = await worldScreen(page, 12, -7);
      assert.ok(Math.abs(target.x - target.centerX) < 0.5, `${engine.name()} coordinate X is not centered`);
      assert.ok(Math.abs(target.y - target.centerY) < 0.5, `${engine.name()} coordinate Y is not centered`);

      const lockedView = await viewBox(page);
      await panHorizontally(page);
      assert.equal(await viewBox(page), lockedView, `${engine.name()} coordinate lock allowed panning`);

      const lockedTarget = await worldScreen(page, 12, -7);
      await page.locator('.app-shell-header [data-panel-toggle="right"]').click();
      await page.waitForTimeout(360);
      const afterPanel = await worldScreen(page, 12, -7);
      assert.ok(Math.abs(afterPanel.x - lockedTarget.x) < 0.5, `${engine.name()} panel moved locked X`);
      assert.ok(Math.abs(afterPanel.y - lockedTarget.y) < 0.5, `${engine.name()} panel moved locked Y`);

      await chooseMode(page, "free");
      const freeBefore = await viewBox(page);
      await panHorizontally(page);
      assert.notEqual(await viewBox(page), freeBefore, `${engine.name()} free mode blocked panning`);

      await chooseMode(page, "current");
      const currentView = await viewBox(page);
      await panHorizontally(page);
      assert.equal(await viewBox(page), currentView, `${engine.name()} current lock allowed panning`);
      console.log(`${engine.name()}: three canvas lock modes passed`);
    } finally {
      await browser.close();
    }
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

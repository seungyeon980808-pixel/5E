const assert = require("node:assert/strict");
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const previewUrl = process.env.PREVIEW_URL || "http://127.0.0.1:8794/preview/";

(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      await page.goto(previewUrl);
      const skip = page.getByRole("button", { name: "건너뛰기", exact: true });
      if (await skip.isVisible().catch(() => false)) await skip.click();

      const inspector = page.locator("#panel-right");
      assert.equal(Math.round((await inspector.boundingBox()).width), 200,
        `${engine.name()} inspector default width must be 200px`);

      await page.locator(".web-account-status").click();
      const dialog = page.locator(".web-login-dialog");
      await dialog.waitFor({ state: "visible" });
      const state = await dialog.evaluate(element => ({
        modal: element.matches(":modal"),
        width: element.getBoundingClientRect().width,
        viewportWidth: window.innerWidth,
      }));
      assert.equal(state.modal, false,
        `${engine.name()} login guide must not take over the editor as a modal`);
      assert.ok(state.width <= 420 && state.width < state.viewportWidth / 2,
        `${engine.name()} login guide must remain a bounded utility window`);

      await page.evaluate(() => window.dispatchEvent(new CustomEvent("5e:web-login-progress", {
        detail: { state: "layout", paired: true, codeLeft: 40, codeWidth: 420 },
      })));
      await page.waitForTimeout(340);
      const paired = await dialog.boundingBox();
      assert.ok(Math.abs(paired.x - 40) < 1 && Math.abs(paired.width - 420) < 1,
        `${engine.name()} paired login guide must honor the bounded companion-window slot`);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("5e:web-login-progress", {
        detail: { state: "layout", paired: false, codeLeft: 40, codeWidth: 420 },
      })));
      await page.waitForTimeout(340);
      await page.waitForTimeout(220);

      await page.screenshot({ path: `/tmp/5e-shell-presentation-${engine.name()}.png`, fullPage: true });
      console.log(`${engine.name()}: inspector width and bounded login guide passed`);
      await page.close();
    } finally {
      await browser.close();
    }
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

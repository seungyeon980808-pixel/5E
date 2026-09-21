const assert = require("node:assert/strict");
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const previewUrl = process.env.PREVIEW_URL || "http://127.0.0.1:8794/preview/";

(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      await page.addInitScript(() => {
        let fullscreenElement = null;
        Object.defineProperty(document, "fullscreenElement", {
          configurable: true,
          get: () => fullscreenElement,
        });
        Object.defineProperty(Element.prototype, "requestFullscreen", {
          configurable: true,
          value: async function requestFullscreen() {
            fullscreenElement = this;
            window.__fullscreenRequests = (window.__fullscreenRequests || 0) + 1;
            document.dispatchEvent(new Event("fullscreenchange"));
          },
        });
        Object.defineProperty(Document.prototype, "exitFullscreen", {
          configurable: true,
          value: async function exitFullscreen() {
            fullscreenElement = null;
            document.dispatchEvent(new Event("fullscreenchange"));
          },
        });
      });
      await page.goto(previewUrl);
      const skip = page.getByRole("button", { name: "건너뛰기", exact: true });
      if (await skip.isVisible().catch(() => false)) await skip.click();

      const leftPanel = page.locator("#panel-left");
      const inspector = page.locator("#panel-right");
      assert.equal(Math.round((await leftPanel.boundingBox()).width), 160,
        `${engine.name()} tool panel default width must be 160px`);
      assert.equal(Math.round((await inspector.boundingBox()).width), 180,
        `${engine.name()} inspector default width must be 180px`);

      const center = await page.locator(".panel-center").boundingBox();
      const shellCenter = center.x + center.width / 2;
      assert.ok(Math.abs(shellCenter - 790) < 1,
        `${engine.name()} canvas surface must be centered between the 160px and 180px panels`);
      const canvas = await page.locator("#canvas").boundingBox();
      assert.ok(Math.abs(canvas.x + canvas.width / 2 - shellCenter) < 1,
        `${engine.name()} actual SVG workspace must be centered in the canvas surface`);

      const toolbarMetrics = await page.evaluate(() => {
        const ids = ["settings-menu-btn", "file-menu-btn", "sharing-btn", "tutorial-btn", "theme-toggle", "fullscreen-toggle"];
        return ids.map((id) => {
          const el = document.getElementById(id);
          const rect = el.getBoundingClientRect();
          return { id, width: rect.width, height: rect.height, radius: getComputedStyle(el).borderRadius };
        });
      });
      for (const metric of toolbarMetrics) {
        assert.equal(Math.round(metric.width), 32, `${engine.name()} ${metric.id} width must be 32px`);
        assert.equal(Math.round(metric.height), 32, `${engine.name()} ${metric.id} height must be 32px`);
        assert.equal(metric.radius, "8px", `${engine.name()} ${metric.id} radius must be 8px`);
      }
      const iconMetrics = await page.evaluate(() => {
        const ids = ["settings-menu-btn", "file-menu-btn", "sharing-btn", "tutorial-btn", "theme-toggle", "fullscreen-toggle"];
        return ids.map((id) => {
          const svg = document.querySelector(`#${id} svg`);
          const rect = svg.getBoundingClientRect();
          return { id, width: rect.width, height: rect.height };
        });
      });
      for (const icon of iconMetrics) {
        assert.equal(Math.round(icon.width), 17, `${engine.name()} ${icon.id} icon width must be 17px`);
        assert.equal(Math.round(icon.height), 17, `${engine.name()} ${icon.id} icon height must be 17px`);
      }

      const toolbarGaps = await page.evaluate(() => {
        const gap = (leftId, rightId) => {
          const left = document.getElementById(leftId).getBoundingClientRect();
          const right = document.getElementById(rightId).getBoundingClientRect();
          return right.left - left.right;
        };
        return [
          gap("settings-menu-btn", "file-menu-btn"),
          gap("file-menu-btn", "sharing-btn"),
          gap("sharing-btn", "tutorial-btn"),
          gap("theme-toggle", "fullscreen-toggle"),
        ];
      });
      assert.deepEqual(toolbarGaps.map(Math.round), [8, 8, 8, 8],
        `${engine.name()} top shell button gaps must be 8px`);

      const textControls = await page.evaluate(() => {
        const elements = [document.querySelector(".mode-toggle-btn"), document.querySelector(".web-account-status")];
        return elements.map((el) => {
          const rect = el.getBoundingClientRect();
          return { height: rect.height, radius: getComputedStyle(el).borderRadius };
        });
      });
      for (const control of textControls) {
        assert.equal(Math.round(control.height), 32, `${engine.name()} text control height must be 32px`);
        assert.equal(control.radius, "8px", `${engine.name()} text control radius must be 8px`);
      }

      await page.locator("#settings-menu-btn").click();
      await page.locator("#open-screen").click();
      assert.equal(await page.locator("#pref-zoom").count(), 0,
        `${engine.name()} preferences must not expose a free-range zoom control`);
      assert.deepEqual(await page.locator("[data-screen-size]").allTextContents(), ["80%", "90%", "100%", "110%"],
        `${engine.name()} preferences must expose the four approved scale presets`);
      await page.locator("[data-screen-size='medium']").click();
      assert.equal(await page.locator("html").getAttribute("data-screen"), "medium",
        `${engine.name()} scale preset must apply immediately`);
      await page.locator("[data-screen-size='large']").click();
      await page.locator("#pref-close").click();

      const activeTab = page.locator(".page-tab.is-active");
      const menu = page.locator(".page-ctx-menu");
      for (const preset of ["small", "medium", "large", "wide"]) {
        await page.locator("html").evaluate((el, value) => el.setAttribute("data-screen", value), preset);
        await activeTab.click({ button: "right" });
        await menu.waitFor({ state: "visible" });
        const [tabBox, menuBox] = await Promise.all([activeTab.boundingBox(), menu.boundingBox()]);
        assert.ok(menuBox.y + menuBox.height <= tabBox.y - 7,
          `${engine.name()} page menu must open above the tab strip at ${preset} scale`);
        assert.ok(menuBox.x >= 8 && menuBox.x + menuBox.width <= 1592,
          `${engine.name()} page menu must remain inside the viewport at ${preset} scale`);
        await page.keyboard.press("Escape");
      }
      await page.locator("html").evaluate((el) => el.setAttribute("data-screen", "large"));

      await page.locator("#fullscreen-toggle").click();
      assert.equal(await page.evaluate(() => window.__fullscreenRequests), 1,
        `${engine.name()} fullscreen control must use the browser Fullscreen API`);
      assert.equal(await page.locator("html").evaluate((el) => el.classList.contains("is-workspace-maximized")), false,
        `${engine.name()} fullscreen control must not use workspace-maximize mode`);
      assert.equal(await page.locator("#fullscreen-toggle").getAttribute("aria-label"), "전체화면 해제");
      await page.locator("#fullscreen-toggle").click();

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
      console.log(`${engine.name()}: shell symmetry, presets, menus, fullscreen, and login guide passed`);
      await page.close();
    } finally {
      await browser.close();
    }
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

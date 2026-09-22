const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const evidence = process.env.EVIDENCE_DIR || "/tmp/5e-lite-hybrid-qa";
fs.mkdirSync(evidence, { recursive: true });
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const previewUrl = process.env.PREVIEW_URL || "http://127.0.0.1:8798/preview/?local=LITE-TOOLS-0922";

(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      // Exercise Safari-style browser download; native OS pickers need interactive QA.
      await page.addInitScript(() => { window.showSaveFilePicker = undefined; });
      await page.goto(previewUrl);
      const skipTutorial = page.getByRole("button", { name: "건너뛰기", exact: true });
      if (await skipTutorial.isVisible().catch(() => false)) await skipTutorial.click();
      await page.locator("#mode-toggle-btn").waitFor({ state: "visible" });

      assert.equal(await page.locator("html").getAttribute("data-mode"), "lite",
        `${engine.name()} Lite preview URL must activate Lite mode`);
      assert.equal(await page.locator("#mode-toggle-btn").innerText(), "Lite");

      const visibleTools = await page.locator("#tool-list .tool-btn:visible")
        .evaluateAll(buttons => buttons.map(button => button.dataset.liteLabel));
      assert.deepEqual(visibleTools,
        ["선택", "회전", "자르기", "선", "꺾은선", "텍스트", "지시선 라벨"],
        `${engine.name()} Lite must expose only the approved tool entries`);
      assert.equal(await page.locator("#image-objectify-open").isVisible(), false,
        `${engine.name()} image objectification must be hidden in Lite`);
      assert.equal(await page.locator("#exam-library-open").isVisible(), true);
      assert.equal(await page.locator("#ai-image-install-open").isVisible(), true);

      const separationOptions = await page.locator("[data-ai-separation-mode] option")
        .evaluateAll(options => options.map(option => ({
          value: option.value,
          hidden: option.hidden,
          disabled: option.disabled,
        })));
      assert.deepEqual(separationOptions, [
        { value: "off", hidden: false, disabled: false },
        { value: "auto", hidden: false, disabled: false },
        { value: "grid", hidden: true, disabled: true },
        { value: "manual", hidden: true, disabled: true },
      ], `${engine.name()} Lite must expose only off/auto separation`);

      const before = await page.locator("#canvas").evaluate(canvas => {
        const rect = canvas.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
      await page.locator("#mode-toggle-btn").click();
      await page.locator("[data-ai-background-policy]").evaluate((select) => {
        select.value = "all-near-white";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.locator("[data-ai-separation-mode]").evaluate((select) => {
        select.value = "grid";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.locator("#mode-toggle-btn").click();
      await page.locator("#mode-toggle-btn").click();
      assert.equal(await page.locator("[data-ai-background-policy]").inputValue(), "all-near-white",
        `${engine.name()} Pro background preference must survive Lite`);
      assert.equal(await page.locator("[data-ai-separation-mode]").inputValue(), "grid",
        `${engine.name()} Pro separation preference must survive Lite`);
      await page.locator("#mode-toggle-btn").click();
      const after = await page.locator("#canvas").evaluate(canvas => {
        const rect = canvas.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      });
      assert.deepEqual(after, before,
        `${engine.name()} Pro/Lite round trip must preserve the canvas geometry`);

      const canvas = await page.locator("#canvas").boundingBox();
      const center = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
      await page.locator('.lite-tool-direct[data-tool="T"]').click();
      await page.mouse.click(center.x, center.y);
      const textInput = page.locator(".unified-text-input:visible");
      await textInput.fill("텍스트");
      await textInput.press("Enter");
      assert.equal(await page.locator("html").getAttribute("data-lite-inspector"), "text");
      assert.deepEqual(await page.locator("#inspector [data-lite-control]:visible")
        .evaluateAll(controls => controls.map(control => control.dataset.liteControl)),
      ["font-size", "font-weight"],
      `${engine.name()} text inspector must expose only size and bold`);

      await page.screenshot({ path: path.join(evidence, `${engine.name()}-text.png`) });
      await page.locator('.lite-tool-direct[data-symbol="labeler"]').click();
      await page.mouse.click(center.x - 100, center.y + 80);
      await page.mouse.click(center.x, center.y + 20);
      await page.mouse.click(center.x + 120, center.y - 50);
      const labelInput = page.locator(".unified-text-input:visible");
      await labelInput.fill("지시선 라벨");
      await labelInput.press("Enter");
      assert.equal(await page.locator("html").getAttribute("data-lite-inspector"), "line");
      assert.deepEqual(await page.locator("#inspector [data-lite-control]:visible")
        .evaluateAll(controls => controls.map(control => control.dataset.liteControl)),
      ["stroke-width", "line-style"],
      `${engine.name()} leader-label inspector must expose only width and line style`);
      await page.locator('[data-lite-control="line-style"] button[title="점선1"]').click();
      assert.ok(await page.locator("#scene g[data-id] line[stroke-dasharray]").count() > 0,
        `${engine.name()} leader-label line style must render on the canvas`);

      await page.screenshot({ path: path.join(evidence, `${engine.name()}-line.png`) });
      await page.locator('#lite-save').click();
      await page.locator('#export-overlay').waitFor({ state: 'visible' });
      await page.screenshot({ path: path.join(evidence, `${engine.name()}-save.png`) });
      const downloadPromise = page.waitForEvent('download');
      await page.locator('#export-confirm').click();
      const download = await downloadPromise;
      assert.ok(download.suggestedFilename().endsWith('.png'));
      assert.equal(await download.failure(), null);
      await download.saveAs(path.join(evidence, `${engine.name()}-result.png`));
      if (await page.locator('#export-overlay').isVisible()) await page.locator('#export-cancel').click();
      await page.locator('#exam-library-open').click();
      await page.locator('[data-unilib-close]').waitFor({ state: 'visible', timeout: 20000 });
      await page.screenshot({ path: path.join(evidence, `${engine.name()}-library.png`) });
      await page.locator('[data-unilib-close]').click();
      console.log(`${engine.name()}: Lite tools, contextual edits, Pro round trip, PNG download, and library passed`);
    } finally {
      await browser.close();
    }
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const previewUrl = process.env.PREVIEW_URL || "http://127.0.0.1:8798/preview/?mode=lite";
const evidence = process.env.EVIDENCE_DIR || "/tmp/5e-lite-inspector-controls";
fs.mkdirSync(evidence, { recursive: true });

function liteUrl() {
  const url = new URL(previewUrl);
  url.searchParams.set("mode", "lite");
  return url.href;
}

async function dismissTutorial(page) {
  const skip = page.getByRole("button", { name: "건너뛰기", exact: true });
  if (await skip.waitFor({ state: "visible", timeout: 2_000 }).then(() => true).catch(() => false)) await skip.click();
}

async function drawLine(page, from, to) {
  await page.locator('#tool-list .tool-btn[data-tool="L"]').click();
  await page.mouse.click(from.x, from.y);
  await page.mouse.click(to.x, to.y);
}

(async () => {
  const report = [];
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(liteUrl());
      await dismissTutorial(page);
      await page.locator("#panel-left").waitFor({ state: "visible" });
      await page.locator("#canvas").waitFor({ state: "visible" });

      const canvas = await page.locator("#canvas").boundingBox();
      const center = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
      await drawLine(page, { x: center.x - 180, y: center.y - 80 }, { x: center.x - 20, y: center.y - 80 });
      assert.deepEqual(await page.locator("#inspector [data-lite-control]:visible")
        .evaluateAll(controls => controls.map(control => control.dataset.liteControl)),
      ["color", "stroke-width", "arrow-direction", "line-style"],
      `${engine.name()} Lite line must expose its approved controls`);

      const line = page.locator("#scene line[data-id]:not([data-ui])");
      const beforeColor = await line.getAttribute("stroke");
      await page.locator('[data-lite-control="color"] .cp-num-input').fill("170");
      await page.locator('[data-lite-control="color"] .cp-num-input').press("Enter");
      assert.notEqual(await line.getAttribute("stroke"), beforeColor,
        `${engine.name()} Lite color control must repaint the selected line`);
      await page.locator('[data-lite-control="stroke-width"] input[type="number"]').fill("0.5");
      await page.locator('[data-lite-control="stroke-width"] input[type="number"]').press("Enter");
      assert.equal(await line.getAttribute("stroke-width"), "0.5",
        `${engine.name()} Lite width control must update the selected line`);
      await page.locator('[data-lite-control="arrow-direction"] button').click();
      const arrowLine = page.locator("#scene g[data-id]").last();
      assert.ok(await arrowLine.locator("polygon").count() > 0,
        `${engine.name()} Lite arrow direction must render an arrowhead`);
      await page.locator('[data-lite-control="line-style"] button[title="점선1"]').click();
      assert.ok(await arrowLine.locator("line[stroke-dasharray]").count() > 0,
        `${engine.name()} Lite line style must render its dash pattern`);
      await page.screenshot({ path: path.join(evidence, `${engine.name()}-line-controls.png`) });

      await page.locator('#tool-list .lite-tool-direct[data-tool="T"]').click();
      await page.mouse.click(center.x, center.y);
      await page.locator(".unified-text-input:visible").fill("편집 전");
      await page.locator(".unified-text-input:visible").press("Enter");
      assert.deepEqual(await page.locator("#inspector [data-lite-control]:visible")
        .evaluateAll(controls => controls.map(control => control.dataset.liteControl)),
      ["font-size", "text-label"],
      `${engine.name()} Lite text must expose size and its existing editor`);
      const text = page.locator("#scene text[data-id]").last();
      const beforeTextSize = await text.getAttribute("font-size");
      await page.locator('[data-lite-control="font-size"] input').fill("18");
      await page.locator('[data-lite-control="font-size"] input').press("Enter");
      assert.notEqual(await text.getAttribute("font-size"), beforeTextSize,
        `${engine.name()} Lite text size control must update the selected text`);
      await page.locator('[data-lite-control="text-label"] button').click();
      await page.locator(".unified-text-input:visible").fill("편집 후");
      await page.locator(".unified-text-input:visible").press("Enter");
      assert.match(await page.locator("#scene").textContent(), /편집 후/,
        `${engine.name()} Lite text label editor must update the selected text`);
      await page.screenshot({ path: path.join(evidence, `${engine.name()}-text-label.png`) });

      await page.locator('#tool-list .lite-tool-direct[data-symbol="labeler"]').click();
      await page.mouse.click(center.x - 180, center.y + 100);
      await page.mouse.click(center.x - 40, center.y + 50);
      await page.mouse.click(center.x + 70, center.y);
      await page.locator(".unified-text-input:visible").fill("지시선 전");
      await page.locator(".unified-text-input:visible").press("Enter");
      assert.deepEqual(await page.locator("#inspector [data-lite-control]:visible")
        .evaluateAll(controls => controls.map(control => control.dataset.liteControl)),
      ["color", "stroke-width", "line-style", "leader-label"],
      `${engine.name()} Lite leader must expose line controls and its existing editor`);
      await page.locator('[data-lite-control="leader-label"] button').click();
      await page.locator(".unified-text-input:visible").fill("지시선 후");
      await page.locator(".unified-text-input:visible").press("Enter");
      assert.match(await page.locator("#scene").textContent(), /지시선 후/,
        `${engine.name()} Lite leader label editor must update the selected label`);
      await page.screenshot({ path: path.join(evidence, `${engine.name()}-leader-label.png`) });

      await page.locator("#mode-toggle-btn").click();
      await page.getByRole("button", { name: "유지하고 전환", exact: true }).click();
      await page.locator('html[data-mode="pro"]').waitFor();
      assert.equal(await page.locator('[data-lite-control="text-label"]').isVisible(), false,
        `${engine.name()} Pro must not gain the Lite text-label button`);
      assert.equal(await page.locator('[data-lite-control="leader-label"]').isVisible(), false,
        `${engine.name()} Pro must not gain the Lite leader-label button`);
      await page.screenshot({ path: path.join(evidence, `${engine.name()}-pro-unaffected.png`) });
      assert.deepEqual(errors, []);
      report.push({ engine: engine.name(), line: true, text: true, leader: true, proUnchanged: true });
    } finally {
      await browser.close();
    }
  }
  fs.writeFileSync(path.join(evidence, "report.json"), JSON.stringify(report, null, 2));
  console.log("Lite inspector controls: line/text/leader actions and Pro isolation PASS");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

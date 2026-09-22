const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.PREVIEW_URL || 'http://127.0.0.1:8800/preview/?mode=lite';
const evidence = process.env.EVIDENCE_DIR || '/tmp/5e-lite-hybrid-qa';
fs.mkdirSync(evidence, { recursive: true });
const projection = page => page.locator('#canvas').evaluate(svg => {
  const rect = svg.getBoundingClientRect(), m = svg.getScreenCTM();
  return { x: m.e, y: m.f, scale: m.a, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
});
function centered(p) {
  assert.ok(Math.abs(p.x - p.cx) < 1, `horizontal center ${JSON.stringify(p)}`);
  assert.ok(Math.abs(p.y - p.cy) < 1, `vertical center ${JSON.stringify(p)}`);
}
(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      await page.locator('#lite-dock').waitFor({ state: 'visible' });
      const skip = page.getByRole('button', { name: '건너뛰기', exact: true });
      if (await skip.isVisible()) await skip.click();
      await page.waitForTimeout(400);
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      for (const id of ['fullscreen-toggle', 'theme-toggle', 'grid-btn', 'center-view-btn', 'zoom-readout', 'panel-left', 'panel-right']) {
        assert.equal(await page.locator(`#${id}`).isVisible(), false, `${id} must be hidden`);
      }
      await page.locator('#mode-toggle-btn').click();
      await page.locator('#theme-toggle').click();
      const proTheme = await page.locator('html').getAttribute('data-theme');
      await page.locator('#grid-btn').click();
      const proGrid = await page.locator('#grid-btn').getAttribute('aria-pressed');
      await page.locator('#mode-toggle-btn').click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
      assert.equal(await page.locator('#grid-layer').count(), 0);
      await page.locator('#mode-toggle-btn').click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), proTheme);
      assert.equal(await page.locator('#grid-btn').getAttribute('aria-pressed'), proGrid);
      await page.locator('#mode-toggle-btn').click();
      const before = await projection(page); centered(before);
      await page.keyboard.press('Alt+Enter');
      assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement || document.webkitFullscreenElement)), false);
      await page.mouse.move(before.cx, before.cy);
      await page.mouse.wheel(0, 100);
      const afterPan = await projection(page); centered(afterPan);
      assert.ok(Math.abs(afterPan.scale - before.scale) < 0.001);
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, -80);
      await page.keyboard.up('Control');
      await page.waitForTimeout(150);
      const zoomed = await projection(page); centered(zoomed);
      assert.ok(zoomed.scale > before.scale, 'pinch/Ctrl-wheel remains available');
      for (const width of [1280, 768, 375]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(250);
        centered(await projection(page));
        assert.ok(Math.abs((await projection(page)).scale - zoomed.scale) < 0.02, 'resize preserves zoom');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal page overflow');
        const tools = await page.locator('#tool-list .tool-btn:visible').count();
        assert.equal(tools, 7);
        await page.screenshot({ path: path.join(evidence, `${engine.name()}-${width}-empty.png`) });
      }
      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(evidence, `${engine.name()}-1600-empty.png`) });
      const draw = await projection(page);
      await page.locator('#tool-list .tool-btn[data-tool="L"]').click();
      const points = [{ x: draw.cx - 110, y: draw.cy - 70 }, { x: draw.cx + 110, y: draw.cy + 70 }];
      await page.mouse.click(points[0].x, points[0].y);
      await page.mouse.click(points[1].x, points[1].y);
      const hit = await page.locator('#scene line[data-id]').first().evaluate(line => {
        const m = line.getScreenCTM();
        return [new DOMPoint(+line.getAttribute('x1'), +line.getAttribute('y1')).matrixTransform(m),
          new DOMPoint(+line.getAttribute('x2'), +line.getAttribute('y2')).matrixTransform(m)]
          .map(p => ({ x: p.x, y: p.y }));
      });
      for (let i = 0; i < 2; i++) assert.ok(Math.hypot(hit[i].x - points[i].x, hit[i].y - points[i].y) < 1, 'drawn endpoint matches pointer');
      assert.ok((await page.locator('#lite-context').boundingBox()).height < 160, 'context remains compact');
      centered(await projection(page));
      await page.setViewportSize({ width: 375, height: 900 });
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(evidence, `${engine.name()}-375-context.png`) });
      assert.deepEqual(errors, []);
      console.log(`${engine.name()}: Lite light/fullscreen/pan/zoom/resize and 4 viewport layouts passed`);
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

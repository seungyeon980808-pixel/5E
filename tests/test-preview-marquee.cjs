// Run against the local preview server. PLAYWRIGHT_MODULE may point to an existing installation.
const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({ headless: false });
    try {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8794/preview/');
      await page.getByRole('button', { name: '건너뛰기', exact: true }).click();
      await page.mouse.move(500, 300);
      await page.mouse.down();
      await page.mouse.move(850, 550, { steps: 8 });
      const result = await page.locator('#canvas > rect').evaluate(rect => {
        const bounds = rect.getBoundingClientRect();
        const scale = rect.getScreenCTM().a;
        const stroke = Number(rect.getAttribute('stroke-width'));
        return {
          x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
          fill: rect.getAttribute('fill'), stroke: rect.getAttribute('stroke'),
          strokePixels: stroke * (rect.getAttribute('vector-effect') === 'non-scaling-stroke' ? 1 : scale),
          expectedStrokePixels: 0.3 * scale,
          dash: rect.getAttribute('stroke-dasharray'),
        };
      });
      for (const [key, expected] of Object.entries({ x: 500, y: 300, width: 350, height: 250 })) {
        assert.ok(Math.abs(result[key] - expected) < 0.1, `${engine.name()} ${key}`);
      }
      assert.equal(result.fill, 'rgba(9,105,218,0.08)');
      assert.equal(result.stroke, '#0969da');
      assert.ok(Math.abs(result.strokePixels - result.expectedStrokePixels) < 0.01,
        `${engine.name()} legacy marquee stroke: ${result.strokePixels} vs ${result.expectedStrokePixels}`);
      assert.equal(result.dash, '0.7 0.5');
      if (process.env.MARQUEE_CAPTURE_DIR) {
        await page.screenshot({ path: `${process.env.MARQUEE_CAPTURE_DIR}/marquee-${engine.name()}.png` });
      }
      await page.mouse.up();
      assert.equal(await page.locator('#canvas > rect').count(), 0);
      console.log(`${engine.name()}: original marquee appearance, pointer alignment and release cleanup passed`);
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

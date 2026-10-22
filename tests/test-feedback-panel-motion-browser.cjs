const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
async function settle(page) {
  await page.evaluate(async () => {
    await Promise.allSettled(document.getAnimations().map(animation => animation.finished));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
h.withServer(async origin => {
  for (const [name, type] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) {
    const browser = await type.launch(), page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    try {
      await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=0'); await h.ready(page);
      await page.evaluate(async () => {
        const { state } = await import('/js/state.js?v=1.7.0-four-session-integration');
        state.update(s => { s.objects = Array.from({ length: 600 }, (_, i) => ({ id: 'load-' + i, type: 'line', p1: { x: (i % 30) - 15, y: Math.floor(i / 30) - 10 }, p2: { x: (i % 30) - 14, y: Math.floor(i / 30) - 9 }, strokeWidth: .2, strokeLevel: 0, layerId: 1, order: i })); });
        window.motionUpdates = 0; state.subscribe(() => { window.motionUpdates++; });
      });
      await settle(page);
      const projection = () => page.evaluate(() => {
        const svg = document.querySelector('#canvas'), point = new DOMPoint(0, 0).matrixTransform(svg.getScreenCTM());
        const rect=svg.getBoundingClientRect();
        return { centerX:rect.left+rect.width/2, centerY:rect.top+rect.height/2, x: point.x, y: point.y, updates: window.motionUpdates, footer: document.querySelector('.app-footer').getBoundingClientRect().height };
      });
      for (const side of ['left', 'right']) {
        const before = await projection(); await page.locator('#drawer-' + side + '-toggle').click(); await settle(page);
        const after = await projection();
        assert.ok(after.updates - before.updates <= 4, `600-object ${side} toggle paints only on layout changes: ${after.updates - before.updates}`);
        assert.ok(Math.hypot(after.x - after.centerX, after.y - after.centerY) < 1, 'artboard centers in available work area after panel toggle');
        assert.equal(after.footer, before.footer, 'footer height remains unchanged');
        // Reverse while the panel is still moving, through actual button input.
        await page.locator('#drawer-' + side + '-toggle').click();
        await page.locator('#drawer-' + side + '-toggle').click(); await settle(page);
        assert.equal(await page.locator('#panel-' + side).isVisible(), false, 'rapid reversal settles closed');
        await page.locator('#drawer-' + side + '-toggle').click(); await settle(page);
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.locator('#drawer-left-toggle').click();
      assert.equal(await page.locator('#panel-left').isVisible(), false, 'reduced motion closes immediately');
      assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
      assert.equal(await page.locator('[data-visitor-stats]').textContent(), '누적 — · 오늘 —', 'local QA never fabricates visitor counts');
      console.log(name + ': loaded canvas projection, bounded repaint, rapid reversal, reduced motion and one-line footer passed');
    } finally { await page.close(); await browser.close(); }
  }
}).catch(error => { console.error(error); process.exitCode = 1; });

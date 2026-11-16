const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.RELEASE_URL || process.env.EXAM_URL || process.env.PREVIEW_URL;
const evidence = path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/mode-projection');
for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  for (const motion of ['normal', 'reduced', 'fallback']) {
    test(`${engineName}/${motion}: keep-work mode switches retain panned projection and native data`, { timeout: 60000 }, async t => {
      assert.ok(base, 'Use the actual retained candidate server');
      const dir = path.join(evidence, engineName, motion);
      fs.mkdirSync(dir, { recursive: true });
      const browser = await engine.launch();
      t.after(() => browser.close());
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
      const errors = []; let paidCalls = 0;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/codex/**', route => { paidCalls++; return route.abort(); });
      await page.emulateMedia({ reducedMotion: motion === 'reduced' ? 'reduce' : 'no-preference' });
      await page.goto(new URL('?mode=pro&mobile=0', base).href, { waitUntil: 'domcontentloaded' });
      await page.locator('#mode-toggle-btn').waitFor({ state: 'visible' });
      const skip = page.getByRole('button', { name: '건너뛰기', exact: true });
      if (await skip.isVisible()) await skip.click();
      await page.locator('[data-tool="L"]').click();
      await page.mouse.click(720, 410); await page.mouse.click(810, 510);
      await page.keyboard.press('Escape');
      if (motion === 'fallback') await page.evaluate(() => { document.startViewTransition = undefined; });
      await page.locator('#center-view-btn').click();
      await page.locator('[data-canvas-lock-mode="free"]').click();
      await page.locator('#canvas').hover();
      await page.mouse.wheel(0, 65);
      const read = () => page.evaluate(async () => {
        const { state } = await import('/js/state.js?v=1.7.0-four-session-integration');
        const s = state.get(), matrix = document.querySelector('#canvas').getScreenCTM();
        return { matrix: ['a', 'b', 'c', 'd', 'e', 'f'].map(key => matrix[key]),
          native: JSON.parse(JSON.stringify({ objects: s.objects, pages: s.pages, undo: s.undoStack, redo: s.redoStack })) };
      });
      await page.waitForFunction(async () => {
        const { state } = await import('/js/state.js?v=1.7.0-four-session-integration');
        const v = state.get().viewBox;
        return Math.abs(v.y + v.h / 2) > 1;
      });
      const before = await read();
      assert.equal(before.native.objects.length, 1);
      const transitions = [];
      for (const mode of ['lite', 'pro']) {
        await page.locator('#mode-toggle-btn').click();
        await page.getByRole('button', { name: '유지하고 전환', exact: true }).click();
        await page.waitForFunction(mode => document.documentElement.dataset.mode === mode
          && !document.querySelector('#mode-toggle-btn').disabled
          && !document.documentElement.classList.contains('mode-transition'), mode);
        const after = await read(); transitions.push({ mode, matrix: after.matrix });
        fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify({ engineName, motion, before: before.matrix, transitions, errors, paidCalls }, null, 2));
        assert.deepEqual(after.native, before.native, 'objects, pages and undo/redo stay byte-identical');
        before.matrix.forEach((value, i) => assert.ok(Math.abs(value - after.matrix[i]) < .01,
          `${mode} matrix ${i}: ${value} -> ${after.matrix[i]}`));
      }
      assert.equal(paidCalls, 0); assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(dir, 'retained.png') });
    });
  }
}

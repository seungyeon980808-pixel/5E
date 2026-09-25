const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8798/preview/';
const evidence = process.env.EVIDENCE_DIR || '/private/tmp/5e-mode-qa';
fs.mkdirSync(evidence, { recursive: true });
const stateSnapshot = page => page.evaluate(async () => {
  const { state } = await import('./js/state.js?v=1.6.0-preview-labeler-0917-1111');
  const s = state.get();
  return JSON.parse(JSON.stringify({ objects: s.objects, pages: s.pages, undo: s.undoStack, redo: s.redoStack }));
});
const projection = page => page.locator('#canvas').evaluate(svg => {
  const m = svg.getScreenCTM(); return [m.a, m.e, m.f];
});
async function confirm(page, name) {
  await page.locator('#mode-toggle-btn').click();
  await page.getByRole('button', { name, exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('mode-toggle-btn').disabled);
  await page.waitForTimeout(150);
}
(async () => {
  const report = [];
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, recordVideo: { dir: `${evidence}/video`, size: { width: 1440, height: 960 } } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.goto(`${base}?mode=pro&mobile=0`);
      await page.waitForTimeout(2200);
      const skip = page.getByRole('button', { name: '건너뛰기', exact: true });
      if (await skip.isVisible()) await skip.click();
      await page.locator('[data-tool="L"]').click();
      await page.mouse.click(720,410); await page.mouse.click(810,510); await page.keyboard.press('Escape');
      const initial = await stateSnapshot(page); assert.equal(initial.objects.length, 1);
      const before = await projection(page);
      await page.screenshot({ path: `${evidence}/${name}-before.png` });
      for (const width of [375, 768, 1440]) {
        await page.setViewportSize({ width, height: 960 });
        await page.locator('#mode-toggle-btn').click();
        await page.waitForTimeout(350);
        const modal = page.locator('.mode-switch-dialog .modal');
        const box = await modal.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
        for (const b of await modal.locator('button').all()) {
          const r = await b.boundingBox(); assert.ok(r.x >= box.x && r.x+r.width <= box.x+box.width+1);
        }
        await page.screenshot({ path: `${evidence}/${name}-dialog-${width}.png` });
        await page.getByRole('button', { name: '취소', exact: true }).focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('html').getAttribute('data-mode'), 'pro');
        assert.deepEqual(await stateSnapshot(page), initial);
      }
      const stable = await projection(page);
      await confirm(page, '유지하고 전환');
      assert.equal(await page.locator('html').getAttribute('data-mode'), 'lite');
      assert.deepEqual(await stateSnapshot(page), initial);
      const retained = await projection(page);
      stable.forEach((value, i) => assert.ok(Math.abs(value-retained[i]) < .01, `projection ${i}: ${value} → ${retained[i]}`));
      await page.screenshot({ path: `${evidence}/${name}-lite.png` });
      await page.locator('#mode-toggle-btn').click(); await page.waitForTimeout(350);
      await page.screenshot({ path: `${evidence}/${name}-lite-dialog.png` });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('html').getAttribute('data-mode'), 'lite');
      await confirm(page, '유지하고 전환');
      assert.deepEqual(await stateSnapshot(page), initial);
      // A failed checkpoint must not clear the document or change mode.
      await page.evaluate(() => { window.qaOpen = indexedDB.open.bind(indexedDB); indexedDB.open = () => { throw new Error('QA storage unavailable'); }; });
      await page.locator('#mode-toggle-btn').click();
      await page.getByRole('button', { name: '새 작업으로 전환', exact: true }).click();
      await page.getByText('모드 전환 실패', { exact: true }).waitFor();
      assert.deepEqual(await stateSnapshot(page), initial);
      assert.equal(await page.locator('html').getAttribute('data-mode'), 'pro');
      await page.getByRole('button', { name: '확인', exact: true }).click();
      await page.evaluate(() => { indexedDB.open = window.qaOpen; delete window.qaOpen; });
      await confirm(page, '새 작업으로 전환');
      assert.equal((await stateSnapshot(page)).objects.length, 0);
      assert.equal((await stateSnapshot(page)).pages.length, 1);
      assert.equal((await stateSnapshot(page)).undo.length, 0);
      assert.equal(await page.locator('html').getAttribute('data-mode'), 'lite');
      const backup = await page.evaluate(() => new Promise((resolve, reject) => {
        const req = indexedDB.open('5e-autosave', 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => { const db = req.result; const read = db.transaction('snapshots').objectStore('snapshots').openCursor(null, 'prev'); read.onsuccess = () => { resolve(read.result?.value.data); db.close(); }; };
      }));
      assert.deepEqual(backup.pages[0].objects, initial.objects);
      await page.screenshot({ path: `${evidence}/${name}-fresh.png` });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await confirm(page, '새 작업으로 전환');
      assert.equal(await page.locator('html').getAttribute('data-mode'), 'pro');
      assert.equal((await stateSnapshot(page)).objects.length, 0);
      assert.equal(await page.locator('html').evaluate(el => el.classList.contains('mode-transition')), false);
      // Object-free document setup must also survive the new-work checkpoint.
      await page.evaluate(async () => {
        const { state } = await import('./js/state.js?v=1.6.0-preview-labeler-0917-1111');
        state.update(s => { s.artboard = { w: 120, h: 80 }; });
      });
      await confirm(page, '새 작업으로 전환');
      await page.reload();
      await page.getByRole('button', { name: '복구', exact: true }).click();
      await page.waitForTimeout(1000);
      assert.deepEqual(await page.evaluate(async () => {
        const { state } = await import('./js/state.js?v=1.6.0-preview-labeler-0917-1111');
        return state.get().artboard;
      }), { w: 120, h: 80 });
      await confirm(page, '유지하고 전환');
      // Exercise the no-View-Transition fallback separately.
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.evaluate(() => { document.startViewTransition = undefined; });
      await confirm(page, '유지하고 전환');
      assert.equal(await page.locator('html').getAttribute('data-mode'), 'lite');
      assert.deepEqual(errors, []);
      report.push({ engine: name, before, stable, retained, errors, passed: true });
      await page.close();
    } finally { await browser.close(); }
  }
  fs.writeFileSync(`${evidence}/results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exit(1); });

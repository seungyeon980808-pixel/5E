const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const h = require('./helpers/rhwp-exam.cjs');
const output = path.resolve('_work/overnight-qa/personal-graph-save');
fs.mkdirSync(output, { recursive: true });

h.withServer(async origin => {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try { for (const surface of ['/', '/preview/']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await h.navigate(page, new URL(surface + '?mode=pro&mobile=0&exam=0', origin).href);
      await h.ready(page);
      const { stateUrl } = h.runtime(page);
      const read = () => page.evaluate(async url => JSON.parse(JSON.stringify((await import(url)).state.get().objects)), stateUrl);
      const library = () => page.evaluate(async url => JSON.parse((await import(new URL('personal-objects.js?v=1.7.0-four-session-integration', url).href)).exportLibraryString() || '[]'), stateUrl);
      await page.locator('#graph-tool-open').click();
      await page.locator('#gm-tab-func-btn').click();
      await page.locator('#gm-add-series').click();
      await page.locator('#gm-expr').fill('x^2');
      await page.locator('#gm-area-on').check();
      await page.locator('#gm-area-from').fill('0');
      await page.locator('#gm-area-to').fill('1');
      await page.locator('#gm-add-series').click();
      await page.locator('#gm-expr').fill('x+1');
      await page.locator('#gm-confirm').click();
      const selected = await page.evaluate(async url => (await import(url)).state.get().selectedIds, stateUrl);
      assert.equal(selected.length, 1, 'Graph editor intentionally selects its plane');
      const source = await read(), plane = source.find(o => o.id === selected[0]);
      const bundle = source.filter(o => o.id === plane.id || o.planeId === plane.id);
      assert.equal(bundle.length, 3);
      await page.locator('#personal-object-save').click();
      const hiddenInitially = !await page.locator('#po-cat-new').isVisible();
      await page.locator('#po-name').fill('검수용 두 함수');
      await page.locator('#po-cat-select').selectOption('__new__');
      assert.ok(await page.locator('#po-cat-new').isVisible());
      await page.locator('#po-cat-new').fill('검수 분류');
      await page.locator('#po-cat-select').selectOption('기본');
      const hiddenAgain = !await page.locator('#po-cat-new').isVisible();
      await page.locator('#po-cat-select').selectOption('__new__');
      await page.locator('#po-ok').click();
      await page.waitForFunction(async url => (await import(new URL('personal-objects.js?v=1.7.0-four-session-integration', url).href)).hasLibraryItems(), stateUrl);
      const saved = (await library())[0];
      const baseline = { engine: engine.name(), surface, hiddenInitially, hiddenAgain, savedCount: saved.objects.length, expectedCount: bundle.length };
      console.log(JSON.stringify(baseline));
      if (process.env.BASELINE_ONLY === '1') { await page.close(); continue; }
      assert.ok(hiddenInitially && hiddenAgain, 'New-category field appears only when selected');
      assert.equal(saved.category, '검수 분류');
      assert.deepEqual(saved.objects, bundle, 'Saving a selected plane preserves both functions and shade');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await h.ready(page);
      await page.waitForFunction(async url => (await import(new URL('personal-objects.js?v=1.7.0-four-session-integration', url).href)).hasLibraryItems(), stateUrl);
      assert.deepEqual((await library())[0], saved, 'Library survives a real browser reload');
      const before = await read();
      const header = page.locator('#personal-parts').locator('xpath=../..').locator('.tool-section-header');
      if (!await page.locator('#personal-parts .subject-part-header').isVisible()) await header.click();
      await page.locator('#personal-parts .subject-part-header').click();
      await page.locator('#personal-parts .personal-item-btn').click();
      const after = await read(), oldIds = new Set(before.map(o => o.id));
      const added = after.filter(o => !oldIds.has(o.id)), copyPlane = added.find(o => o.type === 'coordplane');
      assert.equal(added.length, bundle.length);
      assert.ok(added.filter(o => o.type === 'funcgraph').every(o => o.planeId === copyPlane.id));
      assert.equal(new Set(added.map(o => o.groupId)).size, 1);
      assert.notEqual(copyPlane.groupId, plane.groupId);
      assert.deepEqual(after.filter(o => oldIds.has(o.id)), before, 'Reuse leaves original objects intact');
      const dx = copyPlane.x - plane.x, dy = copyPlane.y - plane.y;
      for (const original of bundle.filter(o => o.type === 'funcgraph')) {
        const copy = added.find(o => o.expr === original.expr);
        assert.ok(copy);
        assert.deepEqual(copy.mathPoints, original.mathPoints);
        for (let i = 0; i < copy.points.length; i++) {
          assert.ok(Math.abs(copy.points[i].x - original.points[i].x - dx) < 1e-8);
          assert.ok(Math.abs(copy.points[i].y - original.points[i].y - dy) < 1e-8);
        }
        if (original.area) assert.ok(Math.abs(copy.area.baseY - original.area.baseY - dy) < 1e-8);
      }
      await page.keyboard.press('Meta+z'); assert.deepEqual(await read(), before);
      await page.keyboard.press('Meta+Shift+z'); assert.deepEqual(await read(), after);
      await page.evaluate(async ({ url, id }) => (await import(new URL('graph/graph-modal.js?v=1.7.0-four-session-integration', url).href)).openGraphModal(id), { url: stateUrl, id: copyPlane.id });
      await page.locator('#gm-confirm').click();
      assert.equal((await read()).filter(o => o.planeId === copyPlane.id).length, 2, 'Reused graph remains editable');
      await page.screenshot({ path: path.join(output, `${engine.name()}-${surface === '/' ? 'root' : 'preview'}.png`) });
      assert.deepEqual(errors, []);
      console.log(`${engine.name()} ${surface}: category visibility, durable graph bundle, reuse, links, shade, undo/redo and re-edit PASS`);
      await page.close();
    }} finally { await browser.close(); }
  }
}).catch(error => { console.error(error); process.exitCode = 1; });

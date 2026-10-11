const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

async function scenario(engine, origin, surface) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await h.navigate(page, new URL(surface + '?mode=pro&mobile=0&exam=0', origin).href); await h.ready(page);
    const { stateUrl } = h.runtime(page);
    const field = page.locator('.insp-section-geometry .insp-row').filter({
      has: page.locator('label.insp-field-label', { hasText: /^회전$/ }),
    }).locator('input');
    const commit = async value => { await field.fill(String(value)); await field.press('Enter'); };
    const read = async () => h.drawing(page, stateUrl);
    for (const type of ['line', 'curve']) {
      await page.evaluate(async ({ stateUrl, type }) => {
        const { state } = await import(stateUrl); const layerId = state.get().activeLayerId;
        const objects = [-8, 8].map((y, i) => ({ id: 'point-group-' + i, type, layerId, rotation: 0,
          ...(type === 'line' ? { p1: { x: -18, y }, p2: { x: 18, y } }
            : { points: [{ x: -18, y }, { x: -18, y }, { x: 0, y: y + 4 }, { x: 18, y }, { x: -18, y }], closed: true }),
          strokeWidth: .3, strokeLevel: 0 }));
        state.update(s => { s.objects = objects; s.selectedIds = objects.map(o => o.id); s.undoStack = []; s.redoStack = []; });
      }, { stateUrl, type });
      await page.keyboard.press('v'); await page.keyboard.press('g'); const original = await read();
      await commit(20); const turned = await read();
      assert.equal(Number(await field.inputValue()), 20, type + ': rotation display must reflect the actual geometry');
      await commit(20); assert.deepEqual(await read(), turned, type + ': repeating an absolute angle must not rotate again or add undo');
      await page.keyboard.press('r'); await page.keyboard.press('Shift+PageUp');
      assert.equal(Number(await field.inputValue()), 50, type + ': keyboard rotation updates the same display');
      await commit(20); assert.equal(Number(await field.inputValue()), 20);
      await page.keyboard.press('Meta+z'); assert.equal(Number(await field.inputValue()), 50);
      await page.keyboard.press('Meta+z'); assert.deepEqual((await read()).objects, turned.objects);
      await page.keyboard.press('Meta+z'); assert.deepEqual((await read()).objects, original.objects);
      await page.keyboard.press('Meta+Shift+z'); assert.equal(Number(await field.inputValue()), 20);
      // Absolute direction stays stable across serialized object copies, with
      // no synthetic rotation field added to point-based renderers.
      await page.evaluate(async stateUrl => {
        const { state } = await import(stateUrl); const objects = JSON.parse(JSON.stringify(state.get().objects));
        state.update(s => { s.objects = objects; });
      }, stateUrl);
      await commit(20); assert.equal(Number(await field.inputValue()), 20);
    }
    assert.deepEqual(errors, []);
    console.log(engine.name() + ' ' + surface + ': point-only group absolute angle, repeat input, keyboard, undo/redo and serialized objects passed');
  } finally { await browser.close(); }
}
(async () => h.withServer(async origin => {
  for (const engine of [chromium, webkit]) for (const surface of ['/', '/preview/']) await scenario(engine, origin, surface);
}))().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');

async function scenario(engine, origin, surface) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await h.navigate(page, new URL(surface + '?mode=pro&mobile=0&exam=0', origin).href);
    await h.ready(page);
    const { stateUrl } = h.runtime(page);
    const field = label => page.locator('.insp-section-geometry .insp-row').filter({
      has: page.locator('label.insp-field-label', { hasText: new RegExp('^' + label + '$') }),
    }).locator('input');
    const commit = async (label, value) => { await field(label).fill(String(value)); await field(label).press('Enter'); };
    const read = async () => (await h.drawing(page, stateUrl)).objects[0];
    const seed = async options => page.evaluate(async ({ stateUrl, options }) => {
      const { state } = await import(stateUrl);
      const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 40;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 80, 40);
      ctx.fillStyle = '#000'; ctx.fillRect(10, 10, 60, 20);
      state.update(s => {
        s.objects = [{ id: 'aspect-fixture', type: 'image', x: -20, y: -10, w: 40, h: 20,
          src: canvas.toDataURL(), mode: 'edit', aspectLocked: true, opacity: 1,
          layerId: s.activeLayerId, ...options }];
        s.selectedIds = ['aspect-fixture']; s.undoStack = []; s.redoStack = [];
      });
    }, { stateUrl, options });

    await seed({});
    const source = (await read()).src;
    await commit('W', 60);
    assert.equal((await read()).h, 30, 'aspect-locked image height must follow entered width');
    assert.equal(await field('H').inputValue(), '30.00');
    await commit('H', 25);
    assert.equal((await read()).w, 50);
    await page.keyboard.press('Meta+z'); assert.equal((await read()).w, 60);
    await page.keyboard.press('Meta+z'); assert.equal((await read()).w, 40);
    await page.keyboard.press('Meta+Shift+z'); assert.equal((await read()).h, 30);
    assert.equal((await read()).src, source, 'size edits preserve original image bytes');

    await seed({ aspectLocked: false });
    await commit('W', 60); assert.equal((await read()).h, 20, 'unlocked image allows independent dimensions');
    await seed({ positionLocked: true });
    await commit('W', 60);
    const centered = await read();
    assert.equal(centered.x + centered.w / 2, 0); assert.equal(centered.y + centered.h / 2, 0);
    await commit('H', 40);
    const taller = await read(); assert.equal(taller.w, 80);
    assert.equal(taller.x + taller.w / 2, 0); assert.equal(taller.y + taller.h / 2, 0);

    await seed({ locked: true });
    assert.equal(await field('W').isDisabled(), true, 'locked object cannot resize');
    assert.equal((await read()).w, 40);
    await seed({ type: 'svgAsset',
      src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40"><rect width="80" height="40"/></svg>') });
    await commit('W', 60); assert.equal((await read()).h, 30, 'default-locked SVG dimensions keep the same aspect');
    await seed({ type: 'svgAsset', lockAspect: false });
    await commit('W', 60); assert.equal((await read()).h, 20, 'unlocked SVG allows independent dimensions');
    await seed({});
    await commit('W', 0); assert.equal((await read()).w, 40, 'invalid size does not enter undo history');
    await page.locator('#canvas').click({ position: { x: 10, y: 10 } });
    await page.locator('#page-add').click();
    assert.equal((await h.drawing(page, stateUrl)).objects.length, 0);
    await page.locator('.page-tab').first().click(); assert.equal((await read()).w, 40);
    assert.deepEqual(errors, []);
    console.log(engine.name() + ' ' + surface + ': numeric aspect lock, unlocked sizes, center lock, undo/redo, invalid input and page isolation passed');
  } finally { await browser.close(); }
}
(async () => h.withServer(async origin => {
  for (const engine of [chromium,webkit].filter(e=>!process.env.BROWSER_ENGINE||e.name()===process.env.BROWSER_ENGINE)) for (const surface of ['/', '/preview/']) await scenario(engine, origin, surface);
}))().catch(error => { console.error(error); process.exitCode = 1; });

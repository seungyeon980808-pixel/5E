const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const { installCropFixture } = require('./helpers/stable-crop-loading-fixture.cjs');

const evidence = path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/library-speed/progressive-crop');
const closeTo = (actual, expected, message, tolerance = 1) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} != ${expected}`);

async function drawRegion(page, ui) {
  const box = await ui.locator('[data-unilib-crop-image]').boundingBox();
  const stage = await ui.locator('[data-unilib-crop-stage]').boundingBox();
  const top = Math.max(box.y, stage.y) + 20;
  await page.mouse.move(box.x + box.width * .2, top);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .35, top + 40, { steps: 4 });
  await page.mouse.move(box.x + box.width * .5, top + 80, { steps: 4 });
  await page.mouse.up();
}

(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  const outcomes = [];
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      const ui = await installCropFixture(page);
      const layout = await page.evaluate(async () => {
        const { createContinuousCropPages } = await import('/js/library/continuous-crop-pages.js');
        const stage = document.createElement('div');
        stage.style.cssText = 'position:fixed;top:0;width:736px;height:400px;overflow:auto;visibility:hidden';
        const canvas = document.createElement('div'); stage.append(canvas); document.body.append(stage);
        const pages = createContinuousCropPages({ stage, canvas, loadPage: async () => window.cropSources[2], onPage: () => {} });
        pages.mount(327, 316); pages.size(736, 960); pages.activate(316, true);
        const before = stage.querySelector('[data-page="316"]').offsetTop;
        pages.size(736, 960.4);
        const after = stage.querySelector('[data-page="316"]').offsetTop;
        pages.reset(); stage.remove();
        return { before, after };
      });
      closeTo(layout.after, layout.before, '327-page geometry remains stable when original rounding changes');
      const load = ui.locator('[data-unilib-crop-load-state]');
      const quality = ui.locator('[data-unilib-crop-quality]');
      const image = ui.locator('[data-unilib-crop-image]');
      await page.evaluate(() => {
        // The original page is twice the preview resolution, like a 768px prebuilt image versus a PDF render.
        const preview = new Image();
        preview.src = window.cropSources[2];
        return preview.decode().then(() => {
          const canvas = document.createElement('canvas');
          canvas.width = preview.naturalWidth * 2; canvas.height = preview.naturalHeight * 2 + 1;
          canvas.getContext('2d').drawImage(preview, 0, 0, canvas.width, canvas.height);
          window.cropOriginalSources = { 2: canvas.toDataURL('image/png') };
          window.holdCrop('original-2');
        });
      });
      await ui.locator('[data-unilib-crop-page-next]').click();
      await load.waitFor({ state: 'hidden' });
      await quality.waitFor({ state: 'visible' });
      assert.equal(await quality.getAttribute('data-state'), 'loading');
      assert.equal(await image.evaluate(img => img.naturalWidth), 800, 'stage opens on the fast preview');
      await page.screenshot({ path: path.join(evidence, `${name}-preview-operable.png`) });

      await drawRegion(page, ui);
      const save = ui.locator('[data-unilib-crop-save]');
      await page.waitForFunction(() => !document.querySelector('.unified-library-overlay:last-of-type [data-unilib-crop-save]')?.disabled);
      await save.click();
      await ui.locator('.unilib-crop-collection-thumb').first().waitFor();
      const previewThumb = await ui.locator('.unilib-crop-collection-thumb').first().evaluate(img => img.decode().then(() => img.naturalWidth));
      assert.ok(previewThumb < 800, `accepted region starts as a preview crop (${previewThumb}px)`);

      const before = await ui.locator('[data-unilib-crop-canvas]').boundingBox();
      const scrollBefore = await ui.locator('[data-unilib-crop-stage]').evaluate(el => [el.scrollLeft, el.scrollTop]);
      await page.evaluate(() => window.cropGates['original-2'].release());
      await quality.waitFor({ state: 'hidden' });
      assert.equal(await image.evaluate(img => img.naturalWidth), 1600, 'original page replaces the preview');
      const after = await ui.locator('[data-unilib-crop-canvas]').boundingBox();
      closeTo(after.width, before.width, 'no width jump');
      closeTo(after.height, before.height, 'no height jump');
      const scrollAfter = await ui.locator('[data-unilib-crop-stage]').evaluate(el => [el.scrollLeft, el.scrollTop]);
      closeTo(scrollAfter[0], scrollBefore[0], 'scroll x kept');
      closeTo(after.y, before.y, 'same screen position despite rounded original geometry');
      // The fixture's exact materializer returns the original page, so an upgraded entry shows the 1600px image.
      await page.waitForFunction(() => [...document.querySelectorAll('.unilib-crop-collection-thumb')].some(img => img.naturalWidth === 1600));
      await page.screenshot({ path: path.join(evidence, `${name}-original-swapped.png`) });

      await ui.locator('[data-unilib-crop-remove]').first().click();
      // An original failure must retain an operable preview, and retry must upgrade it.
      await ui.locator('[data-unilib-crop-page-prev]').click();
      await load.waitFor({ state: 'hidden' });
      await page.evaluate(() => { window.cropOriginalFailure = 2; });
      await ui.locator('[data-unilib-crop-page-next]').click();
      await load.waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.querySelector('.unified-library-overlay:last-of-type [data-unilib-crop-quality]')?.dataset.state === 'error');
      assert.equal(await image.evaluate(img => img.naturalWidth), 800);
      await drawRegion(page, ui);
      await page.waitForFunction(() => !document.querySelector('.unified-library-overlay:last-of-type [data-unilib-crop-save]')?.disabled);
      await page.evaluate(() => { delete window.cropOriginalFailure; });
      await ui.locator('[data-unilib-crop-quality-retry]').click();
      await load.waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.querySelector('.unified-library-overlay:last-of-type [data-unilib-crop-image]')?.naturalWidth === 1600);
      await quality.waitFor({ state: 'hidden' });
      assert.equal(await image.evaluate(img => img.naturalWidth), 1600);

      // Broken previews must fall back to a working original.
      await ui.locator('[data-unilib-crop-page-prev]').click();
      await load.waitFor({ state: 'hidden' });
      await page.evaluate(() => { window.cropFastBroken = 2; });
      await ui.locator('[data-unilib-crop-page-next]').click();
      await load.waitFor({ state: 'hidden' });
      assert.equal(await image.evaluate(img => img.naturalWidth), 1600);
      await page.evaluate(() => { delete window.cropFastBroken; });

      // A late original from the previous page must not overwrite the current page.
      await ui.locator('[data-unilib-crop-page-prev]').click();
      await load.waitFor({ state: 'hidden' });
      await page.evaluate(() => window.holdCrop('original-2'));
      await ui.locator('[data-unilib-crop-page-next]').click();
      await load.waitFor({ state: 'hidden' });
      await ui.locator('[data-unilib-crop-page-next]').click();
      await load.waitFor({ state: 'hidden' });
      await page.evaluate(() => window.cropGates['original-2'].release());
      await page.waitForFunction(() => document.querySelector('.unified-library-overlay:last-of-type [data-unilib-crop-image]')?.naturalWidth === 700);
      assert.equal(await ui.locator('[data-unilib-crop]').getAttribute('data-pdf-page'), '3');
      await ui.locator('[data-unilib-crop-cancel]').click();
      await page.evaluate(() => window.cropFixture.close());
      assert.deepEqual(errors, []);
      outcomes.push({ engine: name, result: 'PASS', scenarios: ['operable on fast preview', 'indicator while original loads', 'accept preview crop', 'swap without size or scroll jump', 'accepted crop upgraded to original', 'original failure and retry', 'broken preview fallback', 'late previous-page original ignored'] });
    } catch (error) {
      await page.screenshot({ path: path.join(evidence, `${name}-failure.png`) });
      throw error;
    } finally { await context.close(); await browser.close(); }
  }
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(outcomes, null, 2));
  console.log(JSON.stringify(outcomes));
})().catch(error => { console.error(error); process.exitCode = 1; });

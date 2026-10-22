const { classifyAll } = require('./helpers/workbench-assignment.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium,webkit} = require('playwright');
const h = require('./helpers/rhwp-exam.cjs');
const {installCropFixture,pointerOnImage} = require('./helpers/crop-loading-fixture.cjs');

test('Space advances one ready action per press, while other pages always open a fresh crop', {timeout:120000}, async () => h.withServer(async origin => {
  for (const engine of [chromium,webkit].filter(e=>!process.env.BROWSER_ENGINE||e.name()===process.env.BROWSER_ENGINE)) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({viewport:{width:1440,height:950}}), errors = [];
      page.on('pageerror',error=>errors.push(error.message));
      process.env.PREVIEW_URL = origin;
      const ui = await installCropFixture(page,{origin,libraryTransfer:true});
      await page.evaluate(()=>{window.__transfer = async (...args)=>{ window.__spaceTransfers=(window.__spaceTransfers || 0)+1;window.__spaceTransfer=args; };});
      await page.keyboard.press('Escape');
      await ui.locator('[data-result-id="geometry-book:page:1"]').click();
      await page.keyboard.press('Space');
      await ui.locator('[data-unilib-crop-load-state]').waitFor({state:'hidden'});
      assert.equal(await ui.locator('[data-unilib-crop-box]').isVisible(),false,'opening a source never confirms the whole page implicitly');
      const {point} = await pointerOnImage(page,ui,.25);
      await page.mouse.down();await page.mouse.move(point.x+80,point.y+90,{steps:5});await page.mouse.up();
      await ui.locator('[data-unilib-crop-save]:not([disabled])').waitFor();
      assert.equal(await ui.locator('[data-unilib-crop-save]').getAttribute('aria-keyshortcuts'),'Space');
      if (process.env.EVIDENCE_DIR && engine === chromium) {
        fs.mkdirSync(process.env.EVIDENCE_DIR,{recursive:true});
        await page.screenshot({path:path.join(process.env.EVIDENCE_DIR,'crop-ready-1440.png')});
        await page.setViewportSize({width:1080,height:800});
        await page.screenshot({path:path.join(process.env.EVIDENCE_DIR,'crop-ready-1080.png')});
        await page.setViewportSize({width:1440,height:950});
      }
      await page.keyboard.press('Space');
      await ui.locator('[data-unilib-crop-count]').filter({hasText:'1개'}).waitFor();
      assert.equal(await ui.locator('[data-unilib-crop-workbench]').getAttribute('aria-keyshortcuts'),'Space');
      await page.keyboard.press('Space');
      await ui.locator('[data-unilib-crop]').waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>window.__acceptedAssets.size),1);
      await ui.locator('[data-result-id="geometry-book:page:2"]').dblclick();
      await ui.locator('[data-unilib-crop-load-state]').waitFor({state:'hidden'});
      assert.equal(await ui.locator('[data-unilib-crop]').getAttribute('data-pdf-page'),'2');
      assert.equal(await ui.locator('[data-unilib-crop-box]').isVisible(),false);
      assert.equal(await page.locator('.workbench-assignment').count(),0,'a different source must not be intercepted by old workbench images');
      assert.equal(await page.evaluate(()=>window.__acceptedAssets.size),1);
      await page.keyboard.press('Escape');
      await ui.locator('[data-result-id="geometry-book:page:1"]').click();
      await page.keyboard.press('Space');
      await ui.locator('[data-unilib-crop-load-state]').waitFor({state:'hidden'});
      await page.keyboard.press('Space');
      await ui.locator('[data-unilib-crop]').waitFor({state:'hidden'});
      await page.keyboard.press('Space');
      const assignment = page.locator('.workbench-assignment');await assignment.waitFor();
      assert.equal(await assignment.locator('[data-default-kind="image"]').count(),1);
      assert.equal(await assignment.locator('[data-action="continue"]').isEnabled(),true);
      await classifyAll(assignment);
      assert.equal(await assignment.locator('[data-action="continue"]').getAttribute('aria-keyshortcuts'),'Space');
      if (process.env.EVIDENCE_DIR && engine === chromium) await page.screenshot({path:path.join(process.env.EVIDENCE_DIR,'assignment-ready-1440.png')});
      await page.keyboard.down('Space');await page.keyboard.down('Space');await page.keyboard.up('Space');
      await ui.waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>window.__spaceTransfers),1);
      assert.equal(await page.evaluate(()=>window.__acceptedAssets.size),0);
      assert.deepEqual(errors,[]);
      if (process.env.EVIDENCE_DIR) {
        fs.mkdirSync(process.env.EVIDENCE_DIR,{recursive:true});
        fs.writeFileSync(path.join(process.env.EVIDENCE_DIR,`${engine.name()}-space.json`),JSON.stringify({oneTransfer:true,newPageDraftEmpty:true,errors},null,2));
      }
    } finally { await browser.close(); }
  }
}));

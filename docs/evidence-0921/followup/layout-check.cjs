const {chromium, webkit} = require(process.env.PLAYWRIGHT_PATH || '/tmp/5e-motion-playwright.n83LiO/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8767/preview/';
const output = __dirname;
const records = [];
(async () => {
  for (const [engine, launcher] of Object.entries({chromium, webkit})) {
    const browser = await launcher.launch();
    for (const width of [1440, 1024, 768, 375]) {
      const page = await browser.newPage({viewport:{width,height:1000}});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      await page.locator('.web-account-status').waitFor();
      await page.locator('.tut-welcome-overlay').evaluateAll(items => items.forEach(item => item.remove()));
      await page.evaluate(() => document.fonts.ready);
      const rect = selector => page.locator(selector).boundingBox();
      const shot = name => page.screenshot({path:`${output}/${engine}-${width}-${name}.png`});
      const checkHeader = async () => {
        const controls = await rect('.canvas-global-controls');
        const inspector = await rect('#panel-right');
        if (width >= 768 && inspector) assert(controls.x + controls.width <= inspector.x, 'controls cross inspector boundary');
        assert((await rect('#ruler-h')).height >= 19);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      };
      await checkHeader();
      await shot('editor');
      if (width >= 768) {
        const before = await rect('#panel-right');
        const handle = await rect('#inspector-resize');
        await page.mouse.move(handle.x+2,handle.y+60);
        await page.mouse.down();
        await page.mouse.move(handle.x+62,handle.y+60,{steps:8});
        await page.mouse.up();
        const after = await rect('#panel-right');
        assert(Math.abs(after.x+after.width-width)<1);
        assert(Math.abs(after.x-before.x-60)<1);
        await checkHeader();
        await shot('resized');
        for (const side of ['right','left']) {
          const toggle=page.locator(`.app-shell-header [data-panel-toggle="${side}"]`);
          await toggle.click();await page.waitForTimeout(350);
          assert.equal(await toggle.getAttribute('aria-expanded'),'false');
          await shot(`editor-${side}-closed`);
          await toggle.click();await page.waitForTimeout(350);
          await checkHeader();
        }
      }
      await page.evaluate(() => {
        window.fiveEWebAI.status = async () => ({login:{loggedIn:true}});
        window.dispatchEvent(new Event('5e:web-ai-status'));
      });
      await page.waitForFunction(() => document.querySelector('.web-account-status').textContent.includes('연결됨'));
      await page.locator('#ai-image-install-open').click();
      await page.locator('#ai-image-panel').waitFor({state:'visible'});
      await page.waitForTimeout(350);
      const head = await rect('#ai-image-panel .ai-head');
      const positions = {};
      for (const side of ['left','right']) {
        const selector = `#ai-image-panel [data-panel-toggle="${side}"]`;
        positions[side] = await rect(selector);
        assert(positions[side].y>=head.y && positions[side].y+positions[side].height<=head.y+head.height);
      }
      await shot('ai');
      for (const side of ['left','right']) {
        const toggle=page.locator(`#ai-image-panel [data-panel-toggle="${side}"]`);
        await toggle.click();await page.waitForTimeout(100);await shot(`ai-${side}-mid`);
        await page.waitForTimeout(300);await shot(`ai-${side}-toggled`);
        const moved=await toggle.boundingBox();
        assert(Math.abs(moved.x-positions[side].x)<1 && Math.abs(moved.y-positions[side].y)<1);
        await toggle.click();await page.waitForTimeout(350);
      }
      await page.locator('#ai-image-panel [data-ai-close]').click();
      if (width === 1440) {
        await page.evaluate(() => document.documentElement.style.setProperty('--ui-zoom','1.5'));
        const before=await rect('#panel-right'), handle=await rect('#inspector-resize');
        await page.mouse.move(handle.x+2,handle.y+60);await page.mouse.down();
        await page.mouse.move(handle.x-58,handle.y+60,{steps:8});await page.mouse.up();
        const after=await rect('#panel-right');
        assert(Math.abs(after.x-before.x+60)<1);
        assert(Math.abs(after.x+after.width-width)<1);
        await checkHeader();
        await shot('zoom150-resized');
      }
      assert.deepEqual(errors,[]);
      records.push({engine,width,errors,header:head,toggles:positions});
      await page.close();
    }
    await browser.close();
  }
  fs.writeFileSync(`${output}/layout-results.json`,JSON.stringify(records,null,2));
  console.log('PASS inspector fixed right edge, controls left of boundary, header toggles stable, 4 viewports × 2 engines');
})().catch(error=>{console.error(error);process.exit(1);});

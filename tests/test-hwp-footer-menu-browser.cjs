'use strict';

// Real footer menu hit testing and clicks. Narrow CSS viewports are covered
// here; QA8 separately covers genuine browser page zoom, without CSS zoom.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/hwp-footer-menu');
process.env.APP_ENTRY = '/';

h.withServer(async origin => {
  fs.mkdirSync(evidence, { recursive:true });
  for (const [name, engine] of Object.entries({ chromium, webkit })) {
    const browser = await engine.launch({ headless:true });
    const page = await browser.newPage({ viewport:{ width:1440, height:1000 } });
    const errors = [], observations = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await h.navigate(page, origin + '/?mode=pro&mobile=0&exam=0'); await h.ready(page);
      // A real canvas drawing enables the second menu action.
      await page.locator('[data-tool="L"]').first().click();
      const canvas = await page.locator('#canvas').boundingBox();
      await page.mouse.click(canvas.x + canvas.width*.35, canvas.y + canvas.height*.45);
      await page.mouse.click(canvas.x + canvas.width*.65, canvas.y + canvas.height*.55);
      await page.keyboard.press('Escape');
      for (const theme of ['light', 'dark']) for (const width of [1440, 720, 390]) {
        await page.setViewportSize({ width, height:1000 });
        await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
        const barBefore = await page.locator('.canvas-bottom-bar').boundingBox();
        await page.locator('#exam-send').click();
        await page.evaluate(() => Promise.allSettled(document.getAnimations().map(animation => animation.finished)));
        const result = await page.locator('#exam-document-menu').evaluate(menu => {
          const r = menu.getBoundingClientRect();
          return { rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom}, viewport:{width:innerWidth,height:innerHeight},
            items:[...menu.querySelectorAll('[role="menuitem"]')].map(item => {
              const bounds=item.getBoundingClientRect(), hit=document.elementFromPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
              return {disabled:item.disabled,topmost:item.contains(hit),hit:hit?.id || hit?.className};
            }) };
        });
        observations.push({ theme, width, ...result });
        fs.writeFileSync(path.join(evidence, name+'-controls.json'), JSON.stringify(observations,null,2));
        assert.ok(result.items.every(item=>item.topmost && !item.disabled), `Both real menu items receive pointer input at ${width}/${theme}: ${JSON.stringify(result)}`);
        assert.ok(result.rect.left >= 0 && result.rect.right <= result.viewport.width && result.rect.top >= 0 && result.rect.bottom <= result.viewport.height, 'Entire menu stays in the viewport');
        assert.deepEqual(await page.locator('.canvas-bottom-bar').boundingBox(), barBefore, 'Opening a menu does not reserve space or change the footer layout');
        await page.screenshot({ path:path.join(evidence, `${name}-${width}-${theme}.png`) });
        await page.locator('[data-exam-document-open]').click();
        await page.locator('#rhwp-exam-workspace').waitFor({state:'visible'}); await h.idle(page);
        await h.action(page,'close');
        await page.locator('#exam-send').click(); await page.locator('[data-exam-document-insert]').click();
        await page.locator('.capture-overlay').waitFor({state:'visible'});
        await page.keyboard.press('Escape'); await page.locator('.capture-overlay').waitFor({state:'detached'});
        await page.locator('#exam-send').focus(); await page.keyboard.press('ArrowDown');
        assert.equal(await page.locator('[data-exam-document-open]').evaluate(n=>document.activeElement===n),true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#exam-document-menu').isVisible(),false);
        assert.equal(await page.locator('#exam-send').evaluate(n=>document.activeElement===n),true);
      }
      assert.deepEqual(errors,[]); console.log(`PASS HWP footer menu ${name}: both actions, pointer/keyboard, three widths and two themes`);
    } finally { await browser.close(); }
  }
}).catch(error=>{console.error(error);process.exitCode=1;});

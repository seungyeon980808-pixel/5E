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
        // 10-20 입구 하나로: 아래 막대 「한글에 넣기」(#exam-send)는 메뉴 없이 바로 영역 고르기, 한글 문서는 맨 위 줄 「hwp」로 연다.
        const result = await page.evaluate(() => {
          const pick = sel => { const n=document.querySelector(sel),b=n.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
            return {rect:{left:b.left,right:b.right,top:b.top,bottom:b.bottom},topmost:n.contains(hit),disabled:n.disabled,hit:hit?.id||hit?.className}; };
          return { send:pick('#exam-send'), hwp:pick('.app-switch-image [data-app-switch="hwp"]'), viewport:{width:innerWidth,height:innerHeight}, legacy:!!document.querySelector('#exam-document-menu,[data-exam-document-open]'), pool:getComputedStyle(document.getElementById('exam-pool-open')).display };
        });
        observations.push({ theme, width, ...result });
        fs.writeFileSync(path.join(evidence, name+'-controls.json'), JSON.stringify(observations,null,2));
        assert.ok(result.send.topmost && !result.send.disabled && result.hwp.topmost, `「한글에 넣기」와 맨 위 「hwp」가 실제로 눌린다 at ${width}/${theme}: ${JSON.stringify(result)}`);
        assert.ok(result.send.rect.right <= result.viewport.width && result.hwp.rect.right <= result.viewport.width, 'both stay in the viewport');
        assert.equal(result.legacy,false,'no footer 5E_hwp menu (one entry: the top bar)');assert.equal(result.pool,'none','no footer 5E_ExamPool entry');
        await page.screenshot({ path:path.join(evidence, `${name}-${width}-${theme}.png`) });
        await page.locator('.app-switch-image [data-app-switch="hwp"]').click();
        await page.locator('#rhwp-exam-workspace').waitFor({state:'visible'}); await h.idle(page);
        await h.action(page,'close');
        await page.locator('#exam-send').click();
        await page.locator('.capture-overlay').waitFor({state:'visible'});
        await page.keyboard.press('Escape'); await page.locator('.capture-overlay').waitFor({state:'detached'});
      }
      assert.deepEqual(errors,[]); console.log(`PASS HWP footer action ${name}: 한글에 넣기 + top-bar hwp, three widths and two themes`);
    } finally { await browser.close(); }
  }
}).catch(error=>{console.error(error);process.exitCode=1;});

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
  for (const [name, engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)) {
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
        // 너비를 바꾼 바로 그 프레임에는 위 줄이 다시 배치되는 중이라 단추가 잠깐 겹칠 수 있다 — 두 프레임 기다린 뒤 잰다.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        // 10-21: 아래 막대 「한글에 넣기」(#exam-send)는 없앴다. 한글 문서는 맨 위 줄 「hwp」로 열고, 그림 넣기는 5E_hwp 집중 도구 줄 「그림 화면에서 넣기」로.
        const result = await page.evaluate(() => {
          const pick = sel => { const n=document.querySelector(sel),b=n.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
            return {rect:{left:b.left,right:b.right,top:b.top,bottom:b.bottom},topmost:n.contains(hit),disabled:n.disabled,hit:hit?.id||hit?.className}; };
          return { send:!!document.querySelector('#exam-send'), hwp:pick('.app-switch-image [data-app-switch="hwp"]'), viewport:{width:innerWidth,height:innerHeight}, legacy:!!document.querySelector('#exam-document-menu,[data-exam-document-open]'), pool:getComputedStyle(document.getElementById('exam-pool-open')).display };
        });
        observations.push({ theme, width, ...result });
        fs.writeFileSync(path.join(evidence, name+'-controls.json'), JSON.stringify(observations,null,2));
        assert.ok(!result.send && result.hwp.topmost, `아래 「한글에 넣기」는 없고 맨 위 「hwp」가 실제로 눌린다 at ${width}/${theme}: ${JSON.stringify(result)}`);
        assert.ok(result.hwp.rect.right <= result.viewport.width, 'hwp stays in the viewport');
        assert.equal(result.legacy,false,'no footer 5E_hwp menu (one entry: the top bar)');assert.equal(result.pool,'none','no footer 5E_ExamPool entry');
        await page.screenshot({ path:path.join(evidence, `${name}-${width}-${theme}.png`) });
        await page.locator('.app-switch-image [data-app-switch="hwp"]').click();
        await page.locator('#rhwp-exam-workspace').waitFor({state:'visible'}); await h.idle(page);
        // 5E_hwp 안에서 그림 화면의 영역을 골라 넣는다(예전 아래 막대 단추와 같은 동작). 취소하면 한글 문서로 돌아온다.
        // 아주 좁은 화면은 모드 단추를 감추므로(집중 모드로 씀) 스크립트로 고른다.
        await page.evaluate(() => document.querySelector('[data-exam-mode="focus"]').click()); await page.locator('.exam-inspector [data-ei-pane="pic"]').click();
        // 10-23 인스펙터: 「그림 화면에서 넣기」는 그림 칸의 「⋯ 더 보기」 안
        await page.locator('.exam-inspector .ei-pane:not([hidden]) [data-ei-more]').click();
        await page.getByRole('button',{name:'그림 화면에서 넣기',exact:true}).click();
        await page.locator('.capture-overlay').waitFor({state:'visible'});
        await page.keyboard.press('Escape'); await page.locator('.capture-overlay').waitFor({state:'detached'});
        await page.locator('#rhwp-exam-workspace').waitFor({state:'visible'}); await h.idle(page);
        await h.action(page,'close');
      }
      assert.deepEqual(errors,[]); console.log(`PASS HWP entry ${name}: no footer 한글에 넣기, top-bar hwp + 그림 화면에서 넣기, three widths and two themes`);
    } finally { await browser.close(); }
  }
}).catch(error=>{console.error(error);process.exitCode=1;});

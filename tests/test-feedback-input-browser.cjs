const assert = require('node:assert/strict');
const {chromium,webkit} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
h.withServer(async origin => {
  for (const [name,engine] of Object.entries({chromium,webkit})) {
    const browser=await engine.launch(),page=await browser.newPage({viewport:{width:1440,height:950}});
    try {
      await h.navigate(page,origin+'/?mode=pro&mobile=0&exam=0');await h.ready(page);
      for (const key of ['Enter','Space']) {
        await page.evaluate(async()=>{
          const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');
          const {deletePage}=await import('/js/pages.js?v=1.7.0-four-session-integration');
          state.update(s=>s.pages.push({...structuredClone(s.pages[0]),id:'keyboard-delete',name:'키보드 확인'}));
          window.deletion=deletePage(state,'keyboard-delete');
        });
        await page.getByRole('button',{name:'삭제',exact:true}).waitFor();
        assert.equal(await page.evaluate(()=>document.activeElement.textContent),'삭제');
        await page.keyboard.press(key);await page.evaluate(()=>window.deletion);
        assert.equal(await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');return state.get().pages.some(p=>p.id==='keyboard-delete');}),false);
      }
      await page.evaluate(async()=>{
        const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');
        const {runAreaCapture}=await import('/js/export-dialog.js?v=1.7.0-four-session-integration');
        runAreaCapture(document.querySelector('#canvas'),state,b=>window.captured=b,'확인',{initialBounds:{x:0,y:0,w:20,h:30}});
      });
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('.capture-overlay').count(),0);
      // 화면 좌표를 거쳐 돌아오므로 float32 반올림(약 0.000002mm)은 허용한다.
      assert.ok(Math.abs(await page.evaluate(()=>window.captured.w)-20)<1e-4);
      console.log(name+': page deletion Enter/Space and region capture cleanup passed');
    } finally {await browser.close();}
  }
}).catch(error=>{console.error(error);process.exitCode=1;});

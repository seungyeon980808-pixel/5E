const assert = require('node:assert/strict');
const { webkit,chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const {instrument,attach} = require('./profile-rhwp-exam-typing.cjs');

h.withServer(async origin => {
  for (const [name,engine] of Object.entries({webkit,chromium})) {
    const browser = await engine.launch({headless:true});
    try {
      const context = await browser.newContext({viewport:{width:1440,height:950}});
      const page = await context.newPage();
      await instrument(page);await page.clock.install();
      await h.navigate(page,origin+'/?mode=pro&mobile=0&exam=1',{waitUntil:'domcontentloaded'});await h.ready(page);
      await h.action(page,'demo');await h.idle(page);await attach(page);
      await page.clock.pauseAt(new Date(Date.now()+1000));
      await page.evaluate(() => {
        const p=window.__rhwpPerf;p.reset();p.active=true;
        const view=document.querySelector('#exam-studio iframe').contentWindow;
        const d=view.rhwpStudio.plugins.deps,area=d.getInputHandler().textarea;
        area.focus();area.dispatchEvent(new view.CompositionEvent('compositionstart',{bubbles:true}));
        area.value='하';area.dispatchEvent(new view.InputEvent('input',{data:'하',inputType:'insertCompositionText',isComposing:true,bubbles:true}));
        for(let i=0;i<40;i++) {
          d.eventBus.emit('document-changed');
          area.dispatchEvent(new view.KeyboardEvent('keyup',{key:'Process',keyCode:229,isComposing:true,bubbles:true}));
        }
      });
      await page.clock.runFor(1200);
      const during=await page.evaluate(()=>window.__rhwpPerf.metrics);
      for(const key of ['5E.list','5E.links','5E.save'])
        assert.equal(during[key]?.calls || 0,0,name+': no '+key+' during a long composition, including the 900ms autosave deadline');
      await page.evaluate(() => {
        const view=document.querySelector('#exam-studio iframe').contentWindow;
        view.rhwpStudio.plugins.deps.getInputHandler().textarea.dispatchEvent(new view.CompositionEvent('compositionend',{bubbles:true,data:'하'}));
      });
      await page.clock.runFor(300);
      const ended=await page.evaluate(()=>window.__rhwpPerf.metrics);
      assert.equal(ended['5E.links']?.calls,1,name+': repeated requests coalesce into one link check after composition');
      assert.ok(ended['5E.list']?.calls>0,name+': picture list resumes after composition');
      assert.equal(ended['5E.save']?.calls || 0,0,name+': autosave retains its input-idle deadline');
      await page.evaluate(() => {
        const p=window.__rhwpPerf;p.reset();
        const view=document.querySelector('#exam-studio iframe').contentWindow,area=view.rhwpStudio.plugins.deps.getInputHandler().textarea;
        for(let i=0;i<40;i++)area.dispatchEvent(new view.KeyboardEvent('keyup',{key:'ArrowLeft',bubbles:true}));
      });
      await page.clock.runFor(32);
      const navigation=await page.evaluate(()=>window.__rhwpPerf.metrics);
      assert.equal(navigation['5E.list']?.calls,1,name+': only one queued list refresh per frame');
      assert.equal(navigation['WASM.getPageControlLayout']?.calls || 0,0,name+': unchanged navigation reuses the picture inventory');
      await page.clock.runFor(1000);
      await h.waitForState(page,()=>document.querySelector('#exam-status').textContent.includes('자동 저장 완료'));
      assert.ok(await page.evaluate(()=>window.__rhwpPerf.metrics['5E.save']?.calls>0),name+': autosave resumes');
      assert.equal(await page.locator('#exam-status').getAttribute('data-error'),'false');
      await page.evaluate(() => {
        const p=window.__rhwpPerf;p.reset();
        const view=document.querySelector('#exam-studio iframe').contentWindow,area=view.rhwpStudio.plugins.deps.getInputHandler().textarea;
        area.dispatchEvent(new view.CompositionEvent('compositionstart',{bubbles:true}));
        area.value='ㅎ';area.dispatchEvent(new view.InputEvent('input',{data:'ㅎ',inputType:'insertCompositionText',isComposing:true,bubbles:true}));
        area.value='';area.dispatchEvent(new view.InputEvent('input',{data:'',inputType:'insertCompositionText',isComposing:true,bubbles:true}));
        area.dispatchEvent(new view.CompositionEvent('compositionend',{data:'',bubbles:true}));
      });
      await page.clock.runFor(300);
      const canceled=await page.evaluate(()=>window.__rhwpPerf.metrics);
      assert.equal(canceled['5E.links']?.calls,1,name+': empty/canceled composition resumes maintenance');
      assert.equal(canceled['5E.list']?.composingCalls || 0,0,name+': cancellation never scans during composition');
      await context.close();console.log(name+': composition deferral, coalescing, cached navigation and resumed autosave passed');
    } finally {await browser.close();}
  }
}).catch(error=>{console.error(error);process.exitCode=1;});

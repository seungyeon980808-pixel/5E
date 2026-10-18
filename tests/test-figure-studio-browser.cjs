const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function run() {
  const url = new URL(process.env.RELEASE_URL || 'http://127.0.0.1:19443/');
  assert.ok(['127.0.0.1','localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/', 'This feature lives in the integrated root entry');
  const out = process.env.EVIDENCE_DIR;
  if (out) fs.mkdirSync(out,{recursive:true});
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch({headless:true});
    try {
      const page = await browser.newPage({viewport:{width:1400,height:900}}), errors=[];
      page.setDefaultTimeout(10000);
      page.on('pageerror',e=>errors.push(e.message));
      // Isolate test documents and deny all external requests. No generation provider is used.
      await page.route('**/*',route=>new URL(route.request().url()).origin===url.origin ? route.continue() : route.abort());
      await page.addInitScript(() => localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true'));
      await page.goto(url.href+'?mode=pro&mobile=0');
      await page.waitForSelector('#figure-studio',{state:'attached'});
      const app = '/js/state.js?v=1.7.0-four-session-integration';
      const snapshot=()=>page.evaluate(async app=>structuredClone((await import(app)).state.get()),app);
      await page.evaluate(async app=>{
        const {state}=await import(app);
        state.update(s=>{s.objects=[{id:'retained',type:'rect',x:-44,y:-29,w:3,h:3,strokeLevel:0,strokeWidth:.2,fillNone:true,layerId:s.activeLayerId}];s.selectedIds=[];s.undoStack=[];s.redoStack=[];});
      },app);
      const prior=await snapshot();
      await page.click('#figure-studio-open');
      await page.click('[data-fs-mode="flow"]');
      assert.equal(await page.locator('[data-fs-submit]').isDisabled(),true);
      await page.click('[data-fs-example]');
      await page.waitForFunction(()=>!document.querySelector('[data-fs-svg]').hasAttribute('hidden'));
      assert.equal((await snapshot()).objects.length,prior.objects.length,'Preview must be pure');
      assert.equal(await page.locator('[data-fs-svg] rect').count(),4);
      if (out) await page.screenshot({path:path.join(out,`studio-flow-${engine.name()}.png`)});
      await page.click('[data-fs-submit]');
      const inserted=await snapshot();
      assert.equal(inserted.objects.length,8);assert.deepEqual(inserted.objects[0],prior.objects[0]);
      assert.equal(inserted.undoStack.length,1);assert.equal(inserted.selectedIds.length,7);
      assert.equal(new Set(inserted.objects.slice(1).map(o=>o.groupId)).size,1);
      console.log(`${engine.name()}: insertion PASS; checking exports`);
      const exported=await page.evaluate(async app=>{
        const {state}=await import(app), io=await import('/js/project-io.js?v=1.7.0-four-session-integration');
        const {buildExportSvg,rasterizeExportCanvas}=await import('/js/svg-export.js?v=1.7.0-four-session-integration');
        const svg=buildExportSvg(state.get());
        const png=await Promise.race([rasterizeExportCanvas(state.get(),{dpi:150}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('PNG export timed out')),10000))]);
        const restored=io.prepareLoadedProject(JSON.parse(JSON.stringify(io.serialize(state.get()))));
        if(restored.active.objects.length!==8 || restored.groups.length!==1) throw new Error('Native object/group project roundtrip failed');
        return {svg:typeof svg==='string'?svg:new XMLSerializer().serializeToString(svg),png:[png.canvas.width,png.canvas.height],json:io.serialize(state.get())};
      },app);
      assert.match(exported.svg,/문제 인식/);assert.ok(exported.png.every(n=>n>0));
      const saved=typeof exported.json==='string'?JSON.parse(exported.json):exported.json;
      assert.ok(JSON.stringify(saved).includes('결론 도출'));
      await page.evaluate(async app=>{const {state}=await import(app);const {undo}=await import('/js/transform.js?v=1.7.0-four-session-integration');undo(state);},app);
      assert.deepEqual((await snapshot()).objects,prior.objects);
      await page.click('#figure-studio-open');await page.click('[data-fs-mode="plot"]');
      await page.click('[data-fs-example]');
      await page.waitForFunction(()=>!document.querySelector('[data-fs-submit]').disabled);
      await page.fill('#fs-input','x,y\n0,0\n1,2oops');
      await page.waitForFunction(()=>document.querySelector('[data-fs-submit]').disabled);
      assert.match(await page.textContent('#fs-error'),/3행/);
      await page.click('[data-fs-example]');
      await page.waitForFunction(()=>!document.querySelector('[data-fs-submit]').disabled);
      if(out) await page.screenshot({path:path.join(out,`studio-plot-${engine.name()}.png`)});
      await page.click('[data-fs-submit]');
      const plotted=await snapshot();
      assert.equal(plotted.objects.length,8);assert.equal(plotted.objects.filter(o=>o.type==='optics').length,5);
      assert.equal(plotted.objects.find(o=>o.type==='coordplane').labelX,'시간(s)');
      await page.click('#figure-studio-open');await page.click('[data-fs-mode="image"]');
      await page.click('[data-fs-example]');
      const teacherBrief=await page.inputValue('#fs-input');
      assert.equal(await page.locator('.fs-styles').isVisible(),false);
      // Corrupt files fail locally; no broken image is forwarded.
      await page.locator('#fs-files').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('broken')});
      await page.waitForFunction(()=>document.querySelector('#fs-error').textContent.includes('손상'));
      const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jMZkAAAAASUVORK5CYII=','base64');
      await page.locator('#fs-files').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:png});
      await page.waitForSelector('.fs-references img');
      await page.click('[data-fs-submit]');
      await page.waitForFunction(()=>!document.querySelector('#ai-image-panel').hidden);
      assert.equal(await page.locator('#figure-studio').evaluate(el=>el.open),false);
      assert.deepEqual((await snapshot()).objects,plotted.objects,'AI handoff must not touch document');
      // Check the actual existing workbench draft and reference payload, not a mock API.
      const drafts=await page.locator('#ai-image-panel textarea').evaluateAll(els=>els.map(el=>el.value));
      assert.ok(drafts.includes(teacherBrief),'the editable draft stays short without internal style instructions');
      assert.match(await page.locator('#ai-image-panel [data-ai-request-hint]').textContent(),/자동으로 보강/);
      assert.ok(await page.locator('#ai-image-panel img').count()>0);
      await page.keyboard.press('Escape');
      await page.click('#figure-studio-open');
      await page.click('.fs-references button');
      await page.fill('#fs-input','새 도식: 지레의 원리');
      await page.click('[data-fs-submit]');
      await page.waitForFunction(()=>!document.querySelector('#ai-image-panel').hidden);
      await page.waitForFunction(()=>[...document.querySelectorAll('#ai-image-panel textarea')].some(el=>el.value.includes('지레')));
      assert.equal(await page.locator('#ai-image-panel [data-ai-reference-count]').textContent(),'0','A prompt-only draft cannot inherit previous references');
      assert.ok(await page.locator('[id^="ai-workspace-"] img').count()>0,'Prior work remains available');
      assert.ok((await page.locator('#ai-image-panel textarea').evaluateAll(els=>els.map(el=>el.value))).some(text=>text.includes('지레')));
      await page.keyboard.press('Escape');
      await page.click('#figure-studio-open');
      await page.setViewportSize({width:390,height:844});
      await page.click('[data-fs-mode="flow"]');
      assert.ok(await page.locator('[data-fs-submit]').isVisible());
      for (const colorMode of ['navy','graphite','white']) {
        await page.evaluate(async mode=>(await import('/js/color-mode.js?v=1.7.0-graphite')).setColorMode(mode),colorMode);
        for (const selector of ['[data-fs-mode="flow"]','[data-fs-submit]']) {
          await page.locator(selector).hover();
          const contrast=await page.locator(selector).evaluate(el=>{
            const luminance=color=>{const values=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722;};
            const css=getComputedStyle(el),a=luminance(css.color),b=luminance(css.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
          });
          assert.ok(contrast>=4.5,`${colorMode} ${selector} hover contrast ${contrast}`);
        }
      }
      await page.evaluate(async ()=>(await import('/js/color-mode.js?v=1.7.0-graphite')).setColorMode('navy'));

      assert.ok(await page.locator('#figure-studio').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'No horizontal overflow on mobile');
      if(out) await page.screenshot({path:path.join(out,`studio-mobile-${engine.name()}.png`)});
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#figure-studio').evaluate(el=>el.open),false);
      assert.deepEqual(errors,[]);
      console.log(`${engine.name()}: flow, plot, error, one-step undo, project/SVG/PNG, image handoff, mobile, Escape PASS`);
    } finally {await browser.close();}
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});

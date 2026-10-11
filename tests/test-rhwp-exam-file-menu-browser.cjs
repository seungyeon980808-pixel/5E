const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const h = require('./helpers/rhwp-exam.cjs');
const evidence = path.resolve(process.env.EVIDENCE_DIR || '_work/rhwp/verification/file-menu');
const fixture = fs.readFileSync(path.resolve(__dirname,'fixtures/rights-clear-smoke.png'));

async function save(page, action, filename) {
  const waiting=page.waitForEvent('download');await h.action(page,action);
  const download=await waiting,target=path.join(evidence,filename);
  await download.saveAs(target);await h.idle(page);return target;
}
async function stats(page) {
  return page.evaluate(() => {
    const wasm=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.wasm;
    const counts={};
    for(let i=0;i<wasm.pageCount;i++) for(const c of wasm.getPageControlLayout(i).controls||[]) counts[c.type]=(counts[c.type]||0)+1;
    return {pages:wasm.pageCount,counts};
  });
}
async function foreignPicture(page) {
  await page.evaluate(bytes => {
    const d=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps,w=d.wasm,input=d.getInputHandler();
    input.executeOperation({kind:'snapshot',operationType:'foreign-picture-fixture',operation:()=>{
      const r=w.insertPicture(0,0,0,'',new Uint8Array(bytes),18000,12000,600,400,'png','외부 그림',null,null);
      w.setPictureProperties(0,r.paraIdx,r.controlIdx,{treatAsChar:true});
      return {sectionIndex:0,paragraphIndex:r.paraIdx,charOffset:0};
    }});d.eventBus.emit('document-changed');
  },[...fixture]);
  await page.locator('.exam-figure[data-connection="unlinked"]').waitFor();
}
async function scenario(origin,engine,surface) {
  const browser=await ({chromium,webkit}[engine]).launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:950},acceptDownloads:true});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const tag=`${engine}-${surface?'preview':'root'}`;
  let stateUrl;
  try {
    await h.navigate(page,new URL(`${surface}?mode=pro&mobile=0&exam=1`,origin).href,{waitUntil:'domcontentloaded'});await h.ready(page);
    stateUrl=h.runtime(page).stateUrl;
    assert.equal(await page.locator('.exam-picture-actions').isVisible(),false);
    assert.ok(await page.locator('.exam-header').evaluate(n=>n.getBoundingClientRect().height)<150,'empty document header is compact');
    assert.equal(await page.frameLocator('#exam-studio iframe').locator('[data-menu="file"] .menu-title').textContent(),'문서 설정');
    // The file chooser must be triggered by the shipped menu in Safari/WebKit.
    const chooserWait=page.waitForEvent('filechooser');await h.action(page,'open-hwp');
    const chooser=await chooserWait;await h.idle(page);assert.equal(await chooser.element().getAttribute('accept'),'.hwp,.hwpx');
    await chooser.setFiles([]);await h.idle(page);assert.equal(await page.locator('#exam-name').inputValue(),'새 시험지');
    await foreignPicture(page);
    const fixtures={};
    for(const format of ['hwp','hwpx']) fixtures[format]=await save(page,`export-${format}`,`${tag}-foreign.${format}`);
    for(const format of ['hwp','hwpx']) {
      await h.action(page,'new');await h.idle(page);
      await h.nativeOpen(page,fixtures[format]);
      assert.equal(await page.locator('#exam-status').getAttribute('data-error'),'false',await page.locator('#exam-status').textContent());
      assert.equal(await page.locator('#exam-name').inputValue(),`${tag}-foreign`);
      assert.equal(await page.locator('.exam-figure[data-connection="unlinked"]').count(),1);
      assert.equal((await h.pictures(page))[0].figure,null,'foreign pixels are not invented editable objects');
      const counter=page.frameLocator('#exam-studio iframe').locator('#sb-page');
      await counter.waitFor();
      assert.doesNotMatch(await counter.textContent(),/undefined|NaN/,'native page status retains the total page argument');
    }
    const nativeHistory=await page.evaluate(()=>{
      const d=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps,input=d.getInputHandler();
      input.executeOperation({kind:'snapshot',operationType:'task6-history-fixture',operation:()=>{
        d.wasm.insertText(0,0,0,'Task6 history');
        return {sectionIndex:0,paragraphIndex:0,charOffset:13};
      }});
      d.eventBus.emit('document-changed');
      window.__task6NativeHistory={history:input.history,undo:[...input.history.undoStack],redo:[...input.history.redoStack]};
      return {generation:d.wasm.documentGeneration,undo:input.history.undoStack.length,redo:input.history.redoStack.length};
    });
    assert.ok(nativeHistory.undo>0,'malformed-open fixture contains actual native history');
    const before=await h.pictures(page),oldName=await page.locator('#exam-name').inputValue();
    await h.openFile(page,'open-hwp',{name:'손상된 문서.hwp',mimeType:'application/octet-stream',buffer:Buffer.from('invalid HWP')});
    assert.equal(await page.locator('#exam-status').getAttribute('data-error'),'true');
    assert.match(await page.locator('#exam-status').textContent(),/열지 못했습니다/);
    assert.equal(await page.locator('#exam-name').inputValue(),oldName);
    assert.deepEqual(await h.pictures(page),before,'a failed load restores the existing document');
    assert.deepEqual(await page.evaluate(()=>{
      const d=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps,h=d.getInputHandler().history,b=window.__task6NativeHistory;
      if(h!==b.history || h.undoStack.some((entry,index)=>entry!==b.undo[index]) || h.redoStack.some((entry,index)=>entry!==b.redo[index]))throw new Error('native history identity changed');
      return {generation:d.wasm.documentGeneration,undo:h.undoStack.length,redo:h.redoStack.length};
    }),nativeHistory,'failed native decode retains the exact document generation and history');
    await h.nativeOpen(page,fixtures.hwpx); // Same file is selectable again after resetting input.value.
    const p=await h.point(page,'image');await page.mouse.click(p.x,p.y);
    await page.locator('#exam-picture-controls:not([hidden])').waitFor();
    assert.equal(await page.locator('[data-picture-modify]').textContent(),'수정');
    assert.ok(await page.locator('.exam-header').evaluate(n=>n.getBoundingClientRect().height)<150,'selected picture controls share one row');
    if(engine==='webkit' && !surface) {
      await page.screenshot({path:path.join(evidence,'compact-desktop.png')});
      await page.locator('[data-exam-menu="file"]').click();
      await page.screenshot({path:path.join(evidence,'file-menu-desktop.png')});
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#exam-file-menu').isVisible(),false,'Escape closes a pointer-opened menu in Safari');
      await page.setViewportSize({width:640,height:900});
      await page.locator('[data-exam-menu="file"]').click();
      assert.equal(await page.locator('#exam-file-menu').isVisible(),true,'narrow menu is actually open');
      assert.equal(await page.locator('#exam-file-menu').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}),true);
      await page.screenshot({path:path.join(evidence,'file-menu-narrow.png')});
      await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:950});
    }
    await h.action(page,'edit');await page.locator('#exam-edit-bar').waitFor({state:'visible'});
    const linked=(await h.pictures(page))[0];assert.ok(linked.figure);
    assert.equal((await h.drawing(page,stateUrl)).objects.length,1,'registration keeps a single raster background');
    await page.locator('#exam-edit-bar .exam-region-actions button:last-child').click();await h.idle(page);
    assert.equal(await page.locator('.exam-figure[data-connection="linked"]').count(),1);
    assert.equal(await page.locator('.exam-figure strong').textContent(),linked.figure.name);
    // A crop-only draft is also visible and survives the project file.
    await page.evaluate(async ({stateUrl,link,bounds})=>{
      const {state}=await import(stateUrl);
      state.update(s=>{const p=s.pages.find(p=>p.meta?.examLink?.tabId===link.tabId);p.meta.examDraftRender={bounds:{...bounds,x:bounds.x+1,w:bounds.w-1},options:{includeReferenceImages:true,excludeAllImages:false}};});
    },{stateUrl,link:linked.figure.link,bounds:linked.figure.render.bounds});
    const bundle=await save(page,'save',`${tag}-draft.5e`);
    assert.match(await page.locator('.exam-figure span').textContent(),/미반영 수정/);
    await h.action(page,'new');await h.idle(page);await h.openFile(page,'open-project',bundle);
    assert.equal((await h.pictures(page))[0].figure.id,linked.figure.id);
    assert.match(await page.locator('.exam-figure span').textContent(),/미반영 수정/);
    await h.doubleClick(page);await page.locator('#exam-inline-editor:not([hidden])').waitFor();await h.idle(page);
    await page.locator('[data-inline-action="add-label"]').click();
    const box=await page.locator('.exam-inline-canvas').boundingBox();await page.mouse.click(box.x+box.width*.5,box.y+box.height*.35);
    await page.locator('[data-inline-field="text"]').fill('외부 그림 라벨');await page.locator('[data-inline-field="text"]').press('Tab');
    await page.locator('[data-inline-action="apply"]').click();await h.idle(page);
    const applied=(await h.pictures(page))[0];assert.equal(applied.figure.source.pages[0].objects.find(o=>o.type==='labeler').text,'외부 그림 라벨');
    for(const format of ['hwp','hwpx']) {
      const file=await save(page,`export-${format}`,`${tag}-edited.${format}`);
      await h.action(page,'new');await h.idle(page);await h.nativeOpen(page,file);
      const portable=(await h.pictures(page))[0];assert.deepEqual(portable.figure.link,applied.figure.link);
      assert.equal(portable.figure.source.pages[0].objects.find(o=>o.type==='labeler').text,'외부 그림 라벨');
    }
    // Optional, independently produced corpus; keep downloads outside Git.
    if(process.env.EXAM_EXTERNAL_FIXTURES && engine==='webkit' && !surface) {
      const directory=path.resolve(process.env.EXAM_EXTERNAL_FIXTURES),results=[];
      for(const file of fs.readdirSync(directory).filter(f=>/\.(hwp|hwpx)$/i.test(f))) {
        await h.nativeOpen(page,path.join(directory,file));
        assert.equal(await page.locator('#exam-status').getAttribute('data-error'),'false',`${file}: ${await page.locator('#exam-status').textContent()}`);
        const original=await stats(page);assert.ok(original.pages>0);
        let registered=false;
        if(original.counts.image) {
          const before=(await h.pictures(page))[0];
          await page.locator('.exam-figure[data-connection="unlinked"]').first().click();await h.action(page,'edit');
          await page.locator('#exam-edit-bar').waitFor({state:'visible'});
          assert.equal((await h.drawing(page,stateUrl)).objects[0].type,'image','independent corpus picture registers as a background');
          await page.locator('#exam-edit-bar .exam-region-actions button:last-child').click();await h.idle(page);
          const after=(await h.pictures(page))[0];assert.ok(after.figure);assert.equal(after.figure.name,'문서 그림 1');
          for(const key of ['width','height','rotationAngle','horzOffset','vertOffset','cropLeft','cropTop']) assert.equal(after.props[key],before.props[key],`${file}: registering preserves ${key}`);
          registered=true;
        }
        const roundtrip=await save(page,'export-hwpx',`external-${file}.hwpx`);
        await h.nativeOpen(page,roundtrip);assert.deepEqual(await stats(page),original,`${file}: page/control topology survives export`);
        if(registered) assert.ok((await h.pictures(page))[0].figure,'the independent corpus picture retains editable source after export/reopen');
        results.push({file,...original,registered});
      }
      fs.writeFileSync(path.join(evidence,'external-corpus-results.json'),JSON.stringify(results,null,2));
    }
    assert.deepEqual(errors,[]);console.log(`${tag}: real file choosers, HWP/HWPX load, cancel/reselect/failure rollback, foreign registration, crop drafts, project reopen and portable label roundtrips passed`);
  } finally {await context.close();await browser.close();}
}
fs.mkdirSync(evidence,{recursive:true});
h.withServer(async origin=>{
  for(const engine of ['webkit','chromium'].filter(n=>!process.env.EXAM_ENGINE||n===process.env.EXAM_ENGINE))
    for(const surface of ['','preview/'].filter(n=>!process.env.EXAM_SURFACE||n===(process.env.EXAM_SURFACE==='preview'?'preview/':''))) await scenario(origin,engine,surface);
}).catch(error=>{console.error(error);process.exitCode=1;});

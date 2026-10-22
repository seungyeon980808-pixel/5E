// 2026-10-12(b2f85a00)부터 한글 문서는 위쪽 '5E_hwp'(#exam-send) 메뉴의 '한글 문서로 이동'으로 열고, 편집은 '문서에 반영'으로 되돌린다.
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const evidence=path.resolve(process.env.EVIDENCE_DIR||'_work/rhwp/verification');
async function save(page,action,filename){const waiting=page.waitForEvent('download');await h.action(page,action);const file=await waiting;const target=path.join(evidence,filename);await file.saveAs(target);await h.idle(page);return target;}
h.withServer(async origin=>{
 fs.mkdirSync(evidence,{recursive:true});
 for(const [engineName,engine]of Object.entries({chromium,webkit}).filter(([name])=>!process.env.EXAM_ENGINE||name===process.env.EXAM_ENGINE)){
  const browser=await engine.launch({headless:true});
  try{for(const surface of['','preview/'].filter(surface=>!process.env.EXAM_SURFACE||surface===(process.env.EXAM_SURFACE==='preview'?'preview/':''))){
   const name=engineName+(surface?'-preview':''),stateUrl='/js/state.js?v=1.7.0-four-session-integration';
   const context=await browser.newContext({viewport:{width:1440,height:950},acceptDownloads:true});
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await h.navigate(page,new URL(surface,origin).href+'?mode=pro&mobile=0&exam=1',{waitUntil:'domcontentloaded'});await h.ready(page);
   for (const width of [1440,900,640,390]) {
    await page.setViewportSize({width,height:950});
    const layout = await page.evaluate(() => {
      const panel=document.querySelector('#rhwp-exam-workspace'),header=panel.querySelector('.exam-header'),body=panel.querySelector('.exam-body'),tools=panel.querySelector('.exam-focusbar');
      return {height:header.getBoundingClientRect().height,bodyTop:body.getBoundingClientRect().top,studioTop:panel.querySelector('#exam-studio').getBoundingClientRect().top,toolsTop:tools&&!tools.hidden?tools.getBoundingClientRect().top:null,toolsBottom:tools&&!tools.hidden?tools.getBoundingClientRect().bottom:null,barBottom:panel.querySelector('.exam-topbar').getBoundingClientRect().bottom,bottom:header.getBoundingClientRect().bottom,overflow:panel.scrollWidth>innerWidth};
    });
    // 10-20: 5E 세 프로그램 공통 맨 위 줄(40px) 바로 아래에서 편집 본문이 시작한다.
    // 10-22: 집중 도구 줄은 본문 안 문서 쪽 열 맨 위 — 본문은 맨 위 줄 바로 아래, 종이(#exam-studio)는 도구 줄 바로 아래.
    assert.equal(layout.bodyTop,layout.barBottom,'editor body starts right under the shared top bar at '+width);
    if(layout.toolsBottom!=null)assert.equal(layout.toolsTop,layout.bodyTop,'focus tool bar sits at the top of the body at '+width);
    assert.equal(layout.studioTop,layout.toolsBottom??layout.bodyTop,'paper starts right under the focus tool bar (or the top bar) at '+width);assert.ok(layout.barBottom<=41.5,'top bar is 40px + line');assert.equal(layout.overflow,false,'no outer horizontal overflow');
   }
   await page.setViewportSize({width:1440,height:950});
   await page.locator('[data-exam-menu="file"]').focus();await page.keyboard.press('ArrowDown');
   assert.equal(await page.locator('[data-exam-action="new"]').evaluate(element=>element===document.activeElement),true);
   await page.keyboard.press('Escape');assert.equal(await page.locator('#exam-file-menu').isVisible(),false);
   await h.action(page,'close');
   await page.evaluate(async url=>{const{state}=await import(url);state.update(s=>{s.objects=[{id:'line',type:'line',p1:{x:-15,y:-10},p2:{x:15,y:10},layerId:1,order:0,rotation:0,strokeWidth:.3,strokeLevel:0,lineMode:'solid',arrowHead:'none'}];s.undoStack=[[]];});},stateUrl);
   const original=await h.drawing(page,stateUrl);
   await h.crop(page);await page.locator('.exam-placement:not([hidden])').waitFor();await h.idle(page);
   {const top=await page.locator('#rhwp-exam-workspace .exam-focusbar').isVisible()?await page.locator('#rhwp-exam-workspace .exam-focusbar').boundingBox():await page.locator('#rhwp-exam-workspace .exam-topbar').boundingBox();assert.equal((await page.locator('#exam-studio').boundingBox()).y,top.y+top.height,'placement leaves editor right under the shared top bar (10-21: or the focus tool bar)');}
   assert.equal((await h.pictures(page)).length,0,'crop confirmation does not insert');
   assert.equal(await page.locator('[data-exam-action="confirm-placement"]').isDisabled(),true,'fresh document position is required');
   await page.screenshot({path:path.join(evidence,name+'-placement.png')});
   await h.place(page);const first=(await h.pictures(page))[0];
   assert.ok(first.figure.render.bounds);assert.equal(first.figure.source.pages[0].objects.length,1,'whole source survives the crop');
   await h.action(page,'close');
   await page.evaluate(async({url,surface})=>{const{state}=await import(url);const{addPage}=await import('/js/pages.js?v=1.7.0-four-session-integration');addPage(state);state.update(s=>{s.objects=[{id:'unrelated',type:'line',p1:{x:0,y:0},p2:{x:2,y:2},layerId:1,order:0,rotation:0,strokeWidth:.3}];});},{url:stateUrl,surface});
   await page.locator('.app-switch-image [data-app-switch=\"hwp\"]').click();await h.idle(page);await h.originalEdit(page);await page.locator('#exam-edit-bar').waitFor({state:'visible'});
   const reopened=await h.drawing(page,stateUrl);
   assert.equal(reopened.activePageId,original.activePageId,'original editing returns to the linked source tab');assert.equal(reopened.undo,1,'original tab undo history survives');
   assert.equal(await page.locator('#rhwp-exam-workspace').isVisible(),false,'full 5E working screen returns');
   await page.evaluate(async url=>{const{state}=await import(url);state.update(s=>{s.objects[0].p2.y=4;});},stateUrl);
   await page.screenshot({path:path.join(evidence,name+'-edit.png')});
   await page.locator('[data-source-apply]').click();await h.recrop(page);await h.idle(page);
   const edited=(await h.pictures(page))[0];assert.equal(edited.figure.source.pages[0].objects[0].p2.y,4);
   assert.equal(edited.figure.link.assetId,first.figure.link.assetId);assert.notEqual(edited.figure.id,first.figure.id);
   for(const key of['width','horzOffset','vertOffset','treatAsChar'])assert.equal(edited.props[key],first.props[key],key);
   assert.equal((await h.drawing(page,stateUrl)).pages.find(p=>p.id!==original.activePageId).objects[0].id,'unrelated','other tabs are untouched');
   await page.evaluate(async({url,surface})=>{const{state}=await import(url);const{switchPage}=await import('/js/pages.js?v=1.7.0-four-session-integration');switchPage(state,state.get().pages.find(p=>p.id!==state.get().activePageId).id);},{url:stateUrl,surface});
   await page.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().performUndo());
   await h.originalEdit(page);await page.locator('#exam-edit-bar').waitFor({state:'visible'});assert.equal((await h.drawing(page,stateUrl)).objects[0].p2.y,10,'native document undo opens the matching source revision');assert.equal((await h.drawing(page,stateUrl)).undo,0,'replacing a dormant source revision clears its earlier undo history');
   await page.locator('.app-switch-image [data-app-switch=\"hwp\"]').click();await h.idle(page);
   await page.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().performRedo());
   await h.originalEdit(page);await page.locator('#exam-edit-bar').waitFor({state:'visible'});assert.equal((await h.drawing(page,stateUrl)).objects[0].p2.y,4);
   await page.locator('.app-switch-image [data-app-switch=\"hwp\"]').click();await h.idle(page);
   await h.action(page,'close');await h.crop(page);await h.idle(page);
   assert.match(await page.locator('.exam-placement strong').textContent(),/갱신/);assert.equal(await page.locator('[data-exam-action="confirm-placement"]').isDisabled(),false);
   await page.locator('[data-exam-action="confirm-placement"]').click();await h.idle(page);assert.equal((await h.pictures(page)).length,1,'sending the same tab updates one picture');
   const geometryBeforeRename=(await h.pictures(page))[0],drawingBeforeRename=await h.drawing(page,stateUrl);
   await h.originalEdit(page);await page.locator('#exam-edit-bar').waitFor({state:'visible'});
   await page.locator('.page-tab.is-active').focus();await page.keyboard.press('F2');await page.locator('.page-ctx-menu').getByRole('menuitem',{name:'이름 변경',exact:true}).click();
   const renameDialog=page.getByRole('dialog',{name:'페이지 이름 변경'});await renameDialog.locator('input').fill('수정한 탭 이름');await renameDialog.getByRole('button',{name:'확인',exact:true}).click();
   await page.locator('.app-switch-image [data-app-switch=\"hwp\"]').click();await h.idle(page);
   assert.equal(await page.locator('.exam-figure strong').textContent(),'수정한 탭 이름');
   assert.equal(await page.locator('.exam-figure img').evaluate(image=>image.complete&&image.naturalWidth>0),true,'actual cropped bitmap thumbnail');
   const selectedPoint=await h.point(page,'image');await page.mouse.click(selectedPoint.x,selectedPoint.y);
   await h.waitForState(page,()=>document.querySelector('.exam-figure')?.getAttribute('aria-current')==='true');
   await page.screenshot({path:path.join(evidence,name+'-compact.png')});
   const bundle=await save(page,'save',name+'.5e');
   const renamed=(await h.pictures(page))[0];assert.equal(renamed.figure.name,'수정한 탭 이름');assert.equal(renamed.figure.source.pages[0].name,'수정한 탭 이름');
   assert.equal(renamed.figure.id,geometryBeforeRename.figure.id);assert.deepEqual(renamed.figure.link,geometryBeforeRename.figure.link);assert.equal(renamed.figure.version,geometryBeforeRename.figure.version);
   for(const key of ['width','height','horzOffset','vertOffset','treatAsChar'])assert.equal(renamed.props[key],geometryBeforeRename.props[key]);
   assert.equal((await h.drawing(page,stateUrl)).undo,drawingBeforeRename.undo,'rename leaves drawing undo history intact');
   const png=await save(page,'export-png',name+'-renamed.png');
   const pngFigure=await page.evaluate(async bytes=>{const {readEditablePng}=await import('/js/editable-png.js?v=1.7.0-four-session-integration');return readEditablePng(new Uint8Array(bytes));},[...fs.readFileSync(png)]);assert.equal(pngFigure.name,'수정한 탭 이름');
   for(const format of['hwpx','hwp']){
    const document=await save(page,'export-'+format,name+'.'+format);
    await h.action(page,'new');await h.idle(page);await h.nativeOpen(page,document);await h.idle(page);
    assert.equal((await h.pictures(page))[0].figure.name,'수정한 탭 이름');assert.equal((await h.pictures(page)).length,1);await h.originalEdit(page);await page.locator('#exam-edit-bar').waitFor({state:'visible'});assert.equal((await h.drawing(page,stateUrl)).objects[0].p2.y,4);
    await page.locator('.app-switch-image [data-app-switch=\"hwp\"]').click();await h.idle(page);
   }
   await page.locator('#exam-project-file').setInputFiles(bundle);await h.idle(page);
   const marker=(await h.pictures(page))[0].props.description;
   await page.evaluate(()=>{const d=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps,c=d.wasm.getPageControlLayout(0).controls.find(c=>c.type==='image'),input=d.getInputHandler();d.wasm.copyControl(c.secIdx,c.paraIdx,c.controlIdx,'[]');input.executeOperation({kind:'snapshot',operationType:'copy-picture',operation:()=>{const raw=d.wasm.pasteInternal(c.secIdx,c.paraIdx,1),result=typeof raw==='string'?JSON.parse(raw):raw;if(!result.ok)throw new Error('Native paste failed');return input.getCursorPosition();}});d.eventBus.emit('document-changed');});
   await h.waitForState(page,()=>document.querySelector('#exam-figures').querySelectorAll('button').length===2);
   const copies=await h.pictures(page);assert.equal(copies.length,2);assert.notEqual(copies[0].figure.link.tabId,copies[1].figure.link.tabId);assert.notEqual(copies[0].figure.link.assetId,copies[1].figure.link.assetId);
   await page.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().performUndo());assert.equal((await h.pictures(page)).length,1,'one native undo removes the independently linked copy');
   await page.evaluate(()=>document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps.getInputHandler().performRedo());await h.waitForState(page,()=>document.querySelector('#exam-figures').querySelectorAll('button').length===2);assert.equal((await h.pictures(page)).length,2);
   await h.action(page,'new');await h.idle(page);
   await page.evaluate(()=>{const d=document.querySelector('#exam-studio iframe').contentWindow.rhwpStudio.plugins.deps;d.getInputHandler().executeOperation({kind:'snapshot',operationType:'test-table',operation:()=>{const t=d.wasm.createTable(0,0,0,1,1);return{sectionIndex:0,paragraphIndex:0,charOffset:0,parentParaIndex:t.paraIdx,cellPath:[{controlIndex:t.controlIdx,cellIndex:0,cellParaIndex:0}]};}});d.eventBus.emit('document-changed');});
   await h.action(page,'close');await h.crop(page);await h.place(page,'table');
   assert.equal((await h.pictures(page))[0].control.cellPath.length,1,'confirmed table location receives inline picture');
   await h.originalEdit(page);await page.locator('#exam-edit-bar').waitFor({state:'visible'});await page.locator('[data-source-apply]').click();await h.recrop(page);await h.idle(page);assert.equal((await h.pictures(page))[0].control.cellPath.length,1);
   // A fresh browser has no live source pages or prior AI names to mask a stale bundle.
   const fresh=await browser.newContext({viewport:{width:1440,height:950}}),freshPage=await fresh.newPage();
   await h.navigate(freshPage,new URL(surface,origin).href+'?mode=pro&mobile=0&exam=1',{waitUntil:'domcontentloaded'});await h.ready(freshPage);
   await freshPage.locator('#exam-project-file').setInputFiles(bundle);await h.idle(freshPage);
   assert.equal(await freshPage.locator('.exam-figure strong').textContent(),'수정한 탭 이름');
   await h.originalEdit(freshPage);await freshPage.locator('#exam-edit-bar').waitFor({state:'visible'});
   const freshDrawing=await h.drawing(freshPage,stateUrl);assert.equal(freshDrawing.pages.find(p=>p.id===freshDrawing.activePageId).name,'수정한 탭 이름');
   await fresh.close();
   assert.deepEqual(errors,[]);await context.close();console.log(name+': crop and position confirmations, original tab, source revisions, one-to-one sends/copies, HWP/HWPX/workspace and table roundtrips passed');
  }}finally{await browser.close();}
 }
}).catch(error=>{console.error(error);process.exitCode=1;});

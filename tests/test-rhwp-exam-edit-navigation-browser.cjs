const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
const evidence=path.resolve(process.env.EVIDENCE_DIR||'_work/rhwp/verification/edit-navigation');

h.withServer(async origin=>{
 fs.mkdirSync(evidence,{recursive:true});
 for(const [engineName,engine] of Object.entries({chromium,webkit})){
  const browser=await engine.launch({headless:true});
  try{for(const surface of ['','preview/']){
   const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   const stateUrl='/js/state.js?v=1.7.0-four-session-integration';
   const textUrl='/js/text-editor.js?v=1.7.0-four-session-integration';
   await h.navigate(page,origin+'/'+surface+'?mode=pro&mobile=0&exam=1');await h.ready(page);await h.action(page,'close');
   await page.evaluate(async url=>{
    const {state,DEFAULT_TEXT_FONT}=await import(url);
    state.update(s=>{s.objects=[{id:'navigation-label',type:'labeler',p1:{x:-10,y:5},p2:{x:5,y:-5},text:'원래 라벨',labelType:'label',fontFamily:DEFAULT_TEXT_FONT,labelSize:3,strokeWidth:.2,layerId:1,order:0}];s.selectedIds=[];});
   },stateUrl);
   await h.crop(page);await h.place(page);const initial=(await h.pictures(page))[0];
   await h.originalEdit(page);
   const ownerPage=await page.evaluate(async url=>(await import(url)).state.get().activePageId,stateUrl);
   await page.evaluate(async url=>{const {state}=await import(url);const {addPage}=await import('/js/pages.js?v=1.7.0-four-session-integration');addPage(state);},stateUrl);
   await page.locator('#exam-source-region').waitFor({state:'hidden'});
   assert.equal(await page.locator('#exam-edit-bar').isVisible(),false,'a different page cannot display the owner figure region');
   await page.evaluate(async ({url,ownerPage})=>{const {state}=await import(url);const {switchPage}=await import('/js/pages.js?v=1.7.0-four-session-integration');switchPage(state,ownerPage);},{url:stateUrl,ownerPage});
   await page.locator('#exam-source-region').waitFor({state:'visible'});
   await page.evaluate(()=>window.dispatchEvent(new Event('5e:lite-ai-open')));
   await page.locator('#ai-image-panel').waitFor({state:'visible'});
   await page.locator('#exam-source-region').waitFor({state:'hidden'});
   assert.equal(await page.locator('#exam-edit-bar').isVisible(),false,'a canvas figure region cannot cover an unrelated AI workspace');
   await page.locator('#ai-image-panel [data-ai-close]').click();
   await page.locator('#ai-image-panel').waitFor({state:'hidden'});
   await page.locator('#exam-source-region').waitFor({state:'visible'});
   // Exercise the full text widget through the same tool and canvas click as
   // a person. It is a floating editor, not a native dialog or inline label.
   const canvas=await page.locator('#canvas').boundingBox();
   const openTextWidget=async()=>{
    await page.keyboard.press('t');
    await page.mouse.click(canvas.x+canvas.width*.55,canvas.y+canvas.height*.45);
    await page.locator('.unified-text-editor').waitFor({state:'visible'});
    await page.locator('#exam-source-region').waitFor({state:'hidden',timeout:3000});
    for(const selector of ['#exam-edit-bar','#exam-region-inspector'])assert.equal(await page.locator(selector).isVisible(),false,selector+' is suspended behind the real text widget');
   };
   await openTextWidget();
   await page.locator('.unified-text-editor textarea').fill('취소할 텍스트');
   await page.locator('.unified-text-editor').getByRole('button',{name:'취소',exact:true}).click();
   await page.locator('#exam-source-region').waitFor({state:'visible'});
   assert.equal((await h.drawing(page,stateUrl)).objects.length,1,'canceling the full widget leaves the figure unchanged');
   await openTextWidget();
   await page.locator('.unified-text-editor textarea').fill('새 텍스트');
   await page.locator('.unified-text-editor').getByRole('button',{name:'확인',exact:true}).click();
   await page.locator('#exam-source-region').waitFor({state:'visible'});
   assert.equal((await h.drawing(page,stateUrl)).objects.length,2,'confirming the widget preserves both the figure and added text');
   await page.evaluate(async url=>{const {openLabelerTextEditor}=await import(url);openLabelerTextEditor('navigation-label');},textUrl);
   // A full dialog must cover the source controls instead of sharing their layer.
   await page.evaluate(()=>{const dialog=document.createElement('dialog');dialog.id='region-occlusion-check';dialog.textContent='편집 창';document.body.append(dialog);dialog.showModal();});
   await page.locator('#exam-source-region').waitFor({state:'hidden'});
   assert.equal(await page.locator('#exam-edit-bar').isVisible(),false,'source controls do not protrude through dialogs');
   await page.evaluate(()=>{document.querySelector('#region-occlusion-check').remove();document.activeElement?.blur();});
   await page.locator('#exam-source-region').waitFor({state:'visible'});
   assert.equal(await page.locator('[data-source-apply]').textContent(),'문서에 반영');
   assert.equal(await page.locator('[data-edit-apply],[data-edit-cancel]').count(),0,'duplicate source actions are removed');
   const draftLabel=async text=>{
    await page.evaluate(async url=>{const {openLabelerTextEditor}=await import(url);openLabelerTextEditor('navigation-label');},textUrl);
    const editor = page.locator('textarea.ai-inline-label-editor');
    await editor.waitFor({state:'visible'});
    assert.equal(await editor.count(),1,'The current plain label uses exactly one native inline editor');
    assert.equal(await editor.getAttribute('aria-label'),'라벨 직접 편집');
    await editor.fill(text);
   };
   await draftLabel('돌아갈 때 보관한 라벨');
   // Trigger without blur: navigation itself must commit pending text.
   await page.evaluate(()=>document.querySelector('#exam-edit-bar .exam-region-actions button:last-child').click());await h.idle(page);
   await page.evaluate(()=>{window.dispatchEvent(new Event('resize'));document.dispatchEvent(new Event('scroll'));});
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   for(const selector of ['#exam-source-region','#exam-edit-bar','#exam-region-inspector'])assert.equal(await page.locator(selector).isVisible(),false,selector+' is cleaned up and stays hidden');
   assert.equal(await page.locator('body').evaluate(body=>body.classList.contains('exam-editing')),false);
   assert.equal((await h.pictures(page))[0].figure.id,initial.figure.id,'return preserves the document revision');
   await h.originalEdit(page);
   assert.equal((await h.drawing(page,stateUrl)).objects[0].text,'돌아갈 때 보관한 라벨','pending source text survives returning');
   await draftLabel('보내기로 확정한 라벨');
   // Hold the real PNG export to exercise the asynchronous transition boundary.
   await page.evaluate(()=>{window.examExportEntered=Promise.withResolvers();window.savedToBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback,...args){const canvas=this;window.resumeExamExport=()=>window.savedToBlob.call(canvas,callback,...args);HTMLCanvasElement.prototype.toBlob=window.savedToBlob;window.examExportEntered.resolve();};document.querySelector('[data-source-apply]').click();});
   await page.evaluate(()=>window.examExportEntered.promise);
   for(const selector of ['#exam-send','[data-source-apply]'])assert.equal(await page.locator(selector).isDisabled(),true,'navigation is locked during replacement');
   await page.evaluate(()=>window.resumeExamExport());await h.idle(page);
   const applied=(await h.pictures(page))[0];assert.notEqual(applied.figure.id,initial.figure.id);
   assert.equal(applied.figure.source.pages[0].objects[0].text,'보내기로 확정한 라벨','send commits the live text editor before capture');
   for(const key of ['width','height'])assert.ok(Math.abs(applied.props[key]-initial.props[key])<=1,key+' survives source editing within one native rounding unit');
   assert.equal(applied.props.treatAsChar,initial.props.treatAsChar);
   await h.originalEdit(page);
   await page.evaluate(()=>{const original=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback,...args){HTMLCanvasElement.prototype.toBlob=original;callback(null);};document.querySelector('[data-source-apply]').click();});
   const alert=page.getByRole('dialog',{name:'시험지 보내기'});await alert.waitFor({state:'visible'});
   assert.match(await alert.textContent(),/그림을 내보내지 못했습니다/);
   await alert.getByRole('button',{name:'확인',exact:true}).click();await h.idle(page);
   await page.locator('#exam-source-region').waitFor({state:'visible'});
   assert.equal(await page.locator('#exam-source-region').isVisible(),true,'failed replacement keeps the source recoverable');
   assert.equal((await h.pictures(page))[0].figure.id,applied.figure.id,'failed export preserves the document');
   // Wait for a real passive autosave, rather than an explicit save action.
   const savedAt=await page.evaluate(async()=>{const {listExamDrafts}=await import('/js/rhwp-exam-project.js?v=1.7.0-four-session-integration');return (await listExamDrafts())[0]?.updatedAt;});
   await page.evaluate(()=>window.dispatchEvent(new Event('5e:exam-workspace-changed')));
   await h.waitForState(page,async previous=>{const {listExamDrafts}=await import('/js/rhwp-exam-project.js?v=1.7.0-four-session-integration');return (await listExamDrafts())[0]?.updatedAt>previous;},savedAt);
   assert.equal(await page.locator('#exam-status').getAttribute('data-error'),'true');
   await page.locator('[data-source-apply]').click();await h.idle(page);
   assert.equal(await page.locator('#exam-source-region').isVisible(),false,'retry returns to the exam');
   assert.equal(await page.locator('#exam-status').getAttribute('data-error'),'false');
   assert.deepEqual(errors,[]);
   await page.screenshot({path:path.join(evidence,engineName+(surface?'-preview':'')+'.png')});
   console.log(engineName+' '+(surface||'root')+': draft return, overlay cleanup, pending text apply, transition lock, visible failure and retry passed');
   await page.close();
  }}finally{await browser.close();}
 }
}).catch(error=>{console.error(error);process.exitCode=1;});

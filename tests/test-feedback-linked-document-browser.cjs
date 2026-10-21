const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
h.withServer(async origin=>{
 for(const [name,engine] of Object.entries({chromium,webkit})) {
  const browser=await engine.launch(),page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try {
   await page.addInitScript(()=>{localStorage.setItem('5e.tutorial.bannerSeen','true');localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true');});
   await h.navigate(page,origin+'/?mode=pro&mobile=0&exam=1');await h.ready(page);await h.action(page,'close');
   await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');state.update(s=>{s.objects=[{id:'link-line',type:'line',p1:{x:-15,y:-10},p2:{x:15,y:10},layerId:1,order:0,rotation:0,strokeWidth:.3,strokeLevel:0,lineMode:'solid',arrowHead:'none'}];s.selectedIds=[];});});
   await h.sendCanvas(page);await page.locator('.capture-overlay').waitFor();await page.keyboard.press('Escape');await page.locator('.capture-overlay').waitFor({state:'hidden'});
   const metadata=()=>page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');return structuredClone(state.get().pages.find(p=>p.id===state.get().activePageId).meta);});
   assert.equal((await metadata()).examLink,undefined);assert.equal(await page.locator('.page-tab.is-exam-linked').count(),0);
   await h.crop(page);await h.idle(page);assert.equal((await metadata()).examLink,undefined);assert.equal(await page.locator('.page-tab.is-exam-linked').count(),0);
   await page.locator('#exam-name').focus();await page.keyboard.press('Escape');assert.equal((await h.pictures(page)).length,0);await h.action(page,'close');
   await h.crop(page);await h.place(page);await h.originalEdit(page);
   await page.locator('#ai-image-install-open').click();await page.locator('#ai-image-panel').waitFor({state:'visible'});
   await page.locator('#exam-source-region').waitFor({state:'hidden'});
   assert.equal(await page.locator('#exam-edit-bar').isVisible(),false,'AI shows no document badge or apply controls');
   await page.locator('#ai-image-panel [data-ai-close]').click();
   await page.locator('#exam-edit-bar').waitFor({state:'visible'});
   for(let revision=0;revision<2;revision++) {
    const linked=await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');return state.get().pages.find(p=>p.id===state.get().activePageId).meta.examLink;});assert.ok(linked);
    assert.ok(await page.locator('.page-tab.is-exam-linked.is-active').isVisible());
    assert.equal(await page.locator('[data-source-apply]').evaluate(n=>getComputedStyle(n).borderTopColor),'rgb(219, 165, 43)','linked editing uses the yellow outline');
    await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');state.update(s=>s.objects[0].strokeWidth+=.1);});
    await page.locator('[data-source-apply]').click();await h.idle(page);
    assert.equal((await h.pictures(page)).length,1,'revisions replace the linked picture');
    assert.equal(await page.locator('#exam-source-crop').evaluate(n=>n.children.length),0,'finished edit clears dashed crop overlay');
    await h.action(page,'close');
    await page.locator('#exam-edit-bar').waitFor({state:'visible'});
   }
   const committed=await metadata();await h.sendCanvas(page);await page.locator('.capture-overlay').waitFor();await page.keyboard.press('Escape');await page.locator('.capture-overlay').waitFor({state:'hidden'});
   assert.deepEqual((await metadata()).examLink,committed.examLink);assert.equal((await metadata()).examRevisionId,committed.examRevisionId);assert.equal(await page.locator('.page-tab.is-exam-linked').count(),1);
   await page.locator('.page-tab.is-exam-linked.is-active').click({button:'right'});
   await page.getByText('문서 그림 연결 해제',{exact:true}).click();
   assert.equal(await page.locator('.page-tab.is-exam-linked.is-active').count(),0);
   assert.equal(await page.locator('#exam-edit-bar').isVisible(),false);
   assert.equal(await page.locator('#exam-source-crop').evaluate(n=>n.children.length),0);
   assert.deepEqual(errors,[]);console.log(name+': crop/placement cancellation, committed link preservation, two replacements and explicit unlink passed');
  } finally {await browser.close();}
 }
}).catch(error=>{console.error(error);process.exitCode=1;});

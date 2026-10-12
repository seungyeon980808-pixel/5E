const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
h.withServer(async origin=>{
 for(const [name,engine] of Object.entries({chromium,webkit})) {
  const browser=await engine.launch(),page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try {
   await h.navigate(page,origin+'/?mode=pro&mobile=0&exam=1');await h.ready(page);await h.action(page,'close');
   await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');state.update(s=>{s.objects=[{id:'link-line',type:'line',p1:{x:-15,y:-10},p2:{x:15,y:10},layerId:1,order:0,rotation:0,strokeWidth:.3,strokeLevel:0,lineMode:'solid',arrowHead:'none'}];s.selectedIds=[];});});
   await h.crop(page);await h.place(page);await h.originalEdit(page);
   for(let revision=0;revision<2;revision++) {
    const linked=await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');return state.get().pages.find(p=>p.id===state.get().activePageId).meta.examLink;});assert.ok(linked);
    assert.ok(await page.locator('.page-tab.is-exam-linked.is-active').isVisible());
    assert.equal(await page.locator('[data-source-apply]').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 218, 114)','linked editing uses the yellow action style');
    await page.evaluate(async()=>{const {state}=await import('/js/state.js?v=1.7.0-four-session-integration');state.update(s=>s.objects[0].strokeWidth+=.1);});
    await page.locator('[data-source-apply]').click();await h.idle(page);
    assert.equal((await h.pictures(page)).length,1,'revisions replace the linked picture');
    assert.equal(await page.locator('#exam-source-crop').evaluate(n=>n.children.length),0,'finished edit clears dashed crop overlay');
    await h.action(page,'close');
    await page.locator('#exam-edit-bar').waitFor({state:'visible'});
   }
   await page.locator('.page-tab.is-exam-linked.is-active').click({button:'right'});
   await page.getByText('문서 그림 연결 해제',{exact:true}).click();
   assert.equal(await page.locator('.page-tab.is-exam-linked.is-active').count(),0);
   assert.equal(await page.locator('#exam-edit-bar').isVisible(),false);
   assert.equal(await page.locator('#exam-source-crop').evaluate(n=>n.children.length),0);
   assert.deepEqual(errors,[]);console.log(name+': two replacements, persistent linked tab and explicit unlink passed');
  } finally {await browser.close();}
 }
}).catch(error=>{console.error(error);process.exitCode=1;});

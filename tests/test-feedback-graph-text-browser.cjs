const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const h=require('./helpers/rhwp-exam.cjs');
h.withServer(async origin=>{for(const [name,engine]of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)){
 const browser=await engine.launch(),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await h.navigate(page,origin+'/?mode=pro&mobile=0&exam=0');await h.ready(page);
  await page.evaluate(async()=>{(await import('/js/graph/graph-modal.js?v=1.7.0-four-session-integration')).openGraphModal();await Promise.allSettled(document.querySelector('#graph-modal-overlay').getAnimations({subtree:true}).map(a=>a.finished));});
  const modal=page.locator('#graph-modal-overlay');await modal.locator('#gm-tab-annot-btn').click();await modal.locator('#gm-add-annotation').click();
  const preview=await modal.locator('#gm-preview > svg').boundingBox();await page.mouse.click(preview.x+preview.width*.6,preview.y+preview.height*.4);
  await modal.locator('#gm-add-annotation').click();
  const label=modal.locator('#gm-preview [data-graph-annotation]:not([data-annotation-hit])');await label.waitFor();await page.evaluate(()=>document.fonts.ready);
  const x=modal.locator('[data-annotation="0"][data-field="x"]'),y=modal.locator('[data-annotation="0"][data-field="y"]'),before={x:await x.inputValue(),y:await y.inputValue()};
  const box=await label.boundingBox();assert.ok(box);
  const hit=await modal.locator('#gm-preview [data-annotation-hit][data-graph-annotation]').boundingBox();assert.ok(hit && hit.width>0 && hit.height>0,'the whole rendered text has a hit box');
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2+25,{steps:6});await page.mouse.up();
  assert.notEqual(await x.inputValue(),before.x);assert.notEqual(await y.inputValue(),before.y);
  await modal.locator('#gm-confirm').click();
  const annotation=await page.evaluate(async()=>structuredClone((await import('/js/state.js?v=1.7.0-four-session-integration')).state.get().objects.find(o=>o.type==='coordplane').graphAnnotations[0]));
  assert.equal(annotation.kind,'text');assert.equal(annotation.seriesId,undefined);assert.equal(annotation.anchorX,undefined);assert.deepEqual(errors,[]);
  console.log(name+': newly placed graph text drags freely through its whole hit box and exports');
 }finally{await browser.close();}
}}).catch(e=>{console.error(e);process.exitCode=1;});

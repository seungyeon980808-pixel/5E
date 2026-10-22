const assert=require('node:assert/strict');const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const h=require('./helpers/rhwp-exam.cjs');
const V='?v=1.7.0-four-session-integration';
h.withServer(async origin=>{for(const[name,engine]of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)){
 const browser=await engine.launch(),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],manifests=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().includes('/assets/asset-library/manifest'))manifests.push(r.url());});
 try{
  await h.navigate(page,origin+'/?mode=pro&mobile=0&exam=0');await h.ready(page);
  assert.equal(manifests.length,0,'the manifest is not fetched at app start');
  await page.evaluate(async V=>{const{state}=await import('/js/state.js'+V);state.update(s=>{s.objects=[];s.selectedIds=[];});},V);
  await page.locator('#asset-library-section > .tool-section-header').click();
  const cards=page.locator('#asset-library-grid .asset-card');await cards.first().waitFor();
  assert.equal(await cards.count(),53,'physics follows the default subject');
  assert.ok(manifests.some(u=>u.includes('manifest-p.json'))&&manifests.some(u=>u.includes('manifest-cbe.json')),'subject part files are loaded on first open');

  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('5e:subject-changed',{detail:{subject:'c'}})));
  assert.equal(await cards.count(),7,'the tab follows the object subject switch');
  await page.locator('#asset-library-tabs button',{hasText:'물리'}).click();
  await page.locator('#asset-library-query').fill('학생 남');
  const hits=await page.locator('#asset-library-grid .asset-card-name').allTextContents();
  assert.ok(hits.length>0&&hits.every(t=>t.includes('학생')&&t.includes('남')),'every search word must match');
  await page.locator('#asset-library-query').fill('');

  const card=cards.first(),title=await card.locator('.asset-card-name').textContent();
  await page.evaluate(async V=>{window.__assetTestState=(await import('/js/state.js'+V)).state;},V);
  await card.click();
  const inserted=await page.waitForFunction(()=>{const o=window.__assetTestState.get().objects.find(o=>o.type==='image');return o&&o.w!==30?{name:o.name,w:o.w,h:o.h,src:o.src.slice(0,22),provider:o.sourceMetadata?.provider,itemId:o.sourceMetadata?.itemId}:null;}).then(r=>r.jsonValue());
  assert.equal(inserted.name,title);assert.equal(inserted.w,40);assert.equal(inserted.h,19.02);assert.equal(inserted.src,'data:image/png;base64,','bytes are embedded so saved files open without the library');
  assert.equal(inserted.provider,'asset-library');assert.equal(inserted.itemId,'p_spaceship_h');

  const reopened=await page.evaluate(async V=>{const{state}=await import('/js/state.js'+V),io=await import('/js/project-io.js'+V);const data=JSON.parse(JSON.stringify(io.serialize(state.get())));const loaded=io.prepareLoadedProject(data);const o=loaded.active.objects.find(o=>o.type==='image');return o?{name:o.name,w:o.w,h:o.h,same:o.src===state.get().objects.find(x=>x.type==='image').src}:null;},V);
  assert.deepEqual(reopened,{name:title,w:40,h:19.02,same:true},'save and reopen keep the asset');

  await page.locator('#undo-btn, [data-action="undo"], button[aria-label*="실행 취소"]').first().click();
  assert.equal(await page.evaluate(async V=>(await import('/js/state.js'+V)).state.get().objects.length,V),0,'one undo removes the inserted asset');
  assert.deepEqual(errors,[]);console.log(name+': lazy manifest, subject tabs, AND search, embedded insert, save/reopen and single undo passed');
 }finally{await browser.close();}
}}).catch(e=>{console.error(e);process.exitCode=1;});

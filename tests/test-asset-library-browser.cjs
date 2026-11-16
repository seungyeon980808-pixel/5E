const assert=require('node:assert/strict');const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const h=require('./helpers/rhwp-exam.cjs');
const V='?v=1.7.0-four-session-integration';
h.withServer(async origin=>{for(const[name,engine]of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)){
 const browser=await engine.launch(),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],manifests=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().includes('/assets/asset-library/manifest'))manifests.push(r.url());});
 try{
  await h.navigate(page,origin+'/?mode=pro&mobile=0&exam=0');await h.ready(page);
  assert.equal(manifests.length,0,'the manifest is not fetched at app start');
  await page.evaluate(async V=>{const{state}=await import('/js/state.js'+V);state.update(s=>{s.objects=[];s.selectedIds=[];});},V);
  // 10-24 시안 20: 에셋 라이브러리는 아래 「오브젝트」 탭 → 오브젝트 창 「그림」 탭(기본 보기 훑어보기, 「격자」로 바꿀 수 있음)으로 옮겼다.
  await page.click('#object-window-open');await page.click('.ow [data-ow-tab="pic"]');await page.waitForSelector('.ow-gal .ow-tile');
  await page.click('.ow [data-ow-view="grid"]');
  const cards=page.locator('.ow-grid.pic .ow-card');await cards.first().waitFor();
  assert.equal(await cards.count(),67,'all subjects in 「전체」');
  assert.ok(manifests.some(u=>u.includes('manifest-p.json'))&&manifests.some(u=>u.includes('manifest-cbe.json')),'subject part files are loaded on first open');
  await page.click('.ow-side [data-ow-cat="c"]');assert.equal(await cards.count(),7,'the left subject list filters');
  await page.click('.ow-side [data-ow-cat="person"]');assert.equal(await cards.count(),10,'people are their own group');
  await page.click('.ow-side [data-ow-cat="all"]');
  await page.fill('.ow-q','학생 남');await page.waitForFunction(()=>document.querySelectorAll('.ow-grid.pic .ow-card').length&&[...document.querySelectorAll('.ow-grid.pic .ow-name')].every(n=>/학생/.test(n.textContent)));
  const hits=await page.locator('.ow-grid.pic .ow-name').allTextContents();
  assert.ok(hits.length>0&&hits.every(t=>t.includes('학생')&&t.includes('남')),'every search word must match');
  await page.fill('.ow-q','');await page.waitForFunction(()=>document.querySelectorAll('.ow-grid.pic .ow-card').length===67);
  // 별표: 카드 ☆ → ★, 「별표만」으로 그 카드만.
  await cards.first().hover();await cards.first().locator('[data-ow-star-asset]').click();
  await page.click('[data-ow-staronly]');assert.equal(await cards.count(),1,'star-only shows the starred picture');await page.click('[data-ow-staronly]');
  const card=cards.first(),title=await card.locator('.ow-name').textContent();
  await page.evaluate(async V=>{window.__assetTestState=(await import('/js/state.js'+V)).state;},V);
  // 그림은 누르면 오른쪽 자세히 패널 → 「캔버스에 넣기」.
  await card.locator('[data-ow-asset-pick]').click();await page.waitForSelector('.ow-det');await page.click('.ow-det [data-ow-insert-asset]');await page.waitForSelector('.ow-back',{state:'hidden'});
  const inserted=await page.waitForFunction(()=>{const o=window.__assetTestState.get().objects.find(o=>o.type==='image');return o&&o.w!==30?{name:o.name,w:o.w,h:o.h,src:o.src.slice(0,22),provider:o.sourceMetadata?.provider,itemId:o.sourceMetadata?.itemId}:null;}).then(r=>r.jsonValue());
  assert.equal(inserted.name,title);assert.equal(inserted.w,40);assert.equal(inserted.h,19.02);assert.equal(inserted.src,'data:image/png;base64,','bytes are embedded so saved files open without the library');
  assert.equal(inserted.provider,'asset-library');assert.equal(inserted.itemId,'p_spaceship_h');

  const reopened=await page.evaluate(async V=>{const{state}=await import('/js/state.js'+V),io=await import('/js/project-io.js'+V);const data=JSON.parse(JSON.stringify(io.serialize(state.get())));const loaded=io.prepareLoadedProject(data);const o=loaded.active.objects.find(o=>o.type==='image');return o?{name:o.name,w:o.w,h:o.h,same:o.src===state.get().objects.find(x=>x.type==='image').src}:null;},V);
  assert.deepEqual(reopened,{name:title,w:40,h:19.02,same:true},'save and reopen keep the asset');

  await page.locator('#undo-btn, [data-action="undo"], button[aria-label*="실행 취소"]').first().click();
  assert.equal(await page.evaluate(async V=>(await import('/js/state.js'+V)).state.get().objects.length,V),0,'one undo removes the inserted asset');
  assert.deepEqual(errors,[]);console.log(name+': lazy manifest, object window picture tab, AND search, star, embedded insert, save/reopen and single undo passed');
 }finally{await browser.close();}
}}).catch(e=>{console.error(e);process.exitCode=1;});

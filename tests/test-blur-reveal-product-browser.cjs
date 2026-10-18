const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium, webkit} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {fixture} = require('./helpers/label-source-browser.cjs');
const base = process.env.RELEASE_URL || 'http://127.0.0.1:51819/';
const engine = process.env.TASK2_ENGINE === 'webkit' ? webkit : chromium;
const out = path.resolve(process.env.EVIDENCE_DIR || '_work/feedback/parts/blur-reveal-product');
fs.mkdirSync(out,{recursive:true});
const css = ['style.css','ai-panel.css','unified-library.css','loading/blur-reveal.css','loading/reveal-status.css','loading/library-loading.css'];
async function assertImageBounds(frame) {
 const boxes=await frame.evaluate(n=>{
  const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
  return {picture:rect(n.querySelector('.ai-loading-picture')),caption:rect(n.querySelector('.ai-loading-caption')),label:rect(n.querySelector('.rs-label')),host:rect(n.parentElement),clip:getComputedStyle(n.querySelector('.ai-loading-picture')).overflow};
 });
 assert.ok(Math.abs(boxes.picture.w/boxes.picture.h-4/3)<.01,'effect preserves the actual image aspect ratio');
 assert.ok(Math.abs(boxes.caption.y-boxes.picture.y)<1&&Math.abs(boxes.caption.h-boxes.picture.h)<1,'the approved band overlays the image');
 assert.ok(boxes.picture.x>=boxes.host.x&&boxes.picture.right<=boxes.host.right+1,'effect stays within the host horizontally');
 assert.ok(boxes.caption.bottom<=boxes.host.bottom+1,'image and status fit the available height');
 assert.ok(boxes.label.y>=boxes.picture.y&&boxes.label.bottom<=boxes.picture.bottom+1,'wrapped loading text stays inside the band');
 assert.equal(boxes.clip,'hidden','moving focus is clipped to the image rectangle');
}

test('approved loading lifecycle: fast, slow, failure, retry, decode error, cancellation, resize and motion budget', {timeout:60000},async t => {
 const browser=await engine.launch(), page=await browser.newPage({viewport:{width:1440,height:1000}});
 t.after(()=>browser.close()); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/blur-fixture',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><head>${css.map(c=>`<link rel="stylesheet" href="/css/${c}">`).join('')}</head><body><div id="ai-image-panel"><div id="host" style="position:relative;width:650px;height:480px"><div id="legacy"></div></div></div></body></html>`}));
 await page.goto(new URL('/blur-fixture',base).href);
 await page.evaluate(async()=>{
  const {createWorkbenchLoading}=await import('/js/loading/workbench-loading.js?v=20261015');
  const c=document.createElement('canvas');c.width=640;c.height=480;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,640,480);g.strokeStyle='#111';g.lineWidth=3;g.beginPath();g.moveTo(70,65);g.lineTo(70,400);g.lineTo(580,400);g.moveTo(70,260);g.bezierCurveTo(200,100,370,460,580,160);g.stroke();window.original=c.toDataURL();
  window.loading=createWorkbenchLoading({host:document.querySelector('#host'),legacy:document.querySelector('#legacy'),panel:document.querySelector('#ai-image-panel')});
  window.token={id:1};window.loading.begin({token,source:original,kind:'image'});
  await window.loading.finish({token,outcome:'completed',result:original});
 });
 assert.equal(await page.locator('[data-ai-loading-frame]').isVisible(),false,'fast result skips the effect');
 // A late original decode must not overlay a result that already completed.
 let releaseOriginal, originalRequested;
 const requested=new Promise(resolve=>originalRequested=resolve);
 await page.route('**/slow-original.png',route=>{releaseOriginal=()=>route.fulfill({contentType:'image/png',body:Buffer.from(sourcePng.split(',')[1],'base64')});originalRequested();});
 const sourcePng=await page.evaluate(()=>original);
 await page.evaluate(async()=>{const {BlurReveal}=await import('/js/loading/blur-reveal.js');const node=document.createElement('div');node.style.cssText='width:200px;height:150px';document.body.append(node);window.delayed=BlurReveal.attach(node);window.decoding=delayed.start('/slow-original.png');});
 await requested;
 await page.evaluate(()=>delayed.complete(original));
 await releaseOriginal();await page.evaluate(()=>decoding);
 assert.equal(await page.evaluate(()=>delayed.stage.querySelectorAll('.br-stack').length),0);
 await page.evaluate(()=>{const node=delayed.frame;delayed.destroy();node.remove();});

 await page.evaluate(()=>{window.token={id:2};loading.begin({token,source:original,kind:'image',plan:null,expectedMs:450});});
 const frame=page.locator('[data-ai-loading-frame]');await frame.locator('.br-layer').first().waitFor();
 assert.equal(await frame.locator('.rs-step').textContent(),'');
 await page.waitForFunction(()=>document.querySelector('.rs-text').textContent.includes('평소보다'));
 await page.waitForFunction(()=>document.querySelector('.rs-text').textContent.includes('아직 작업 중'));
 assert.equal(await frame.getAttribute('aria-busy'),'true');
 await assertImageBounds(frame);
 assert.match(await frame.locator('.rs-elapsed').textContent(),/^\d{2}:\d{2}$/);
 const frames=await frame.evaluate(n=>n.getAnimations({subtree:true}).flatMap(a=>a.effect.getKeyframes()));
 assert.ok(frames.every(f=>!f.filter&&!f.backdropFilter),'animations never change blur or backdrop-filter');
 await page.screenshot({path:path.join(out,'image-loading-desktop.png')});
 await page.setViewportSize({width:740,height:900});await page.evaluate(()=>document.querySelector('#host').style.width='350px');
 await page.waitForFunction(()=>document.querySelector('.ai-loading-picture').getBoundingClientRect().width<=334.1);
 const width=await frame.locator('.rs-label').evaluate(n=>({w:n.getBoundingClientRect().width,scroll:n.scrollWidth}));assert.ok(width.scroll<=width.w+1,'long copy fits after resizing');
 await assertImageBounds(frame);
 await page.screenshot({path:path.join(out,'image-loading-narrow.png')});
 await page.evaluate(()=>document.querySelector('#host').hidden=true);
 await page.waitForFunction(()=>document.querySelector('[data-ai-loading-frame]').dataset.loadingMotion==='paused');
 assert.ok(await frame.evaluate(n=>n.getAnimations({subtree:true}).every(a=>a.playState!=='running')),'offscreen loading animations pause');
 await page.evaluate(()=>document.querySelector('#host').hidden=false);
 await page.waitForFunction(()=>document.querySelector('[data-ai-loading-frame]').dataset.loadingMotion==='running');
 assert.ok(await frame.evaluate(n=>n.getAnimations({subtree:true}).some(a=>a.playState==='running')),'returning to the image resumes its motion');
 await page.evaluate(()=>{window.finished=loading.finish({token,outcome:'failed'});});
 await page.waitForFunction(()=>document.querySelector('[data-ai-loading-frame]').dataset.loadingState==='failed'&&!document.querySelector('[data-ai-loading-frame]').hasAttribute('aria-busy'));
 assert.equal(await frame.locator('.rs').evaluate(n=>n.classList.contains('is-done')),false,'failure has no success glint');
 assert.ok((await frame.locator('.rs-text').textContent()).includes('변환하지 못했어요'));
 await page.evaluate(()=>{window.old=token;window.token={id:3};loading.begin({token,source:original,kind:'graph',expectedMs:450});void loading.finish({token:old,outcome:'completed',result:original});});
 await frame.locator('.rs.is-on').waitFor();assert.equal(await frame.locator('.rs-step').textContent(),'');
 assert.ok((await frame.locator('.rs-text').textContent()).includes('그래프에서 축과 눈금'));
 await page.evaluate(()=>{window.finished=loading.finish({token,outcome:'completed',result:original});});await page.evaluate(()=>window.finished);
 assert.ok((await frame.locator('.rs-text').textContent()).includes('이제 직접 고칠 수 있어요'));
 await page.evaluate(()=>{window.token={id:4};loading.begin({token,source:original,kind:'image'});});await frame.locator('.br-layer').first().waitFor();
 await page.evaluate(()=>{window.finished=loading.finish({token,outcome:'completed',result:'data:image/png;base64,broken'});});await page.evaluate(()=>window.finished);
 assert.equal(await frame.getAttribute('data-loading-state'),'failed');assert.notEqual(await frame.getAttribute('aria-busy'),'true');
 await page.evaluate(()=>{window.token={id:5};loading.begin({token,source:original,kind:'image'});return loading.finish({token,outcome:'cancelled'});});assert.equal(await frame.isVisible(),false);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>{window.token={id:6};loading.begin({token,source:original,kind:'graph'});});await frame.locator('.br-layer').first().waitFor();
 assert.equal(await frame.locator('.rs-sheen').evaluate(n=>getComputedStyle(n).display),'none');
 assert.equal(await frame.locator('.br-focus-window').count(),0,'reduced motion has no moving focus band');
 assert.equal(await frame.locator('.rs-activity i').first().evaluate(n=>getComputedStyle(n).animationName),'none');
 await page.evaluate(()=>loading.reset());
 await page.emulateMedia({reducedMotion:'no-preference'});
 const perf=await page.evaluate(async()=>{
  const {BlurReveal}=await import('/js/loading/blur-reveal.js');const {trackLoadingMotion}=await import('/js/loading/activity-visibility.js');
  const reveals=[];for(let i=0;i<24;i++){const n=document.createElement('div');n.style.cssText='position:relative;width:180px;height:120px;display:inline-block';document.body.append(n);const r=BlurReveal.attach(n,{variant:'focus'});reveals.push({r,release:trackLoadingMotion(n),n});await r.start(original);}
  const prep= reveals.map(v=>v.r.prepMs);const layers=reveals.map(v=>v.n.querySelectorAll('.br-layer').length);reveals.forEach(v=>{v.release();v.r.destroy();v.n.remove();});return {prep,layers};
 });
 assert.ok(perf.layers.every(n=>n===3));assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'performance.json'),JSON.stringify(perf,null,2));
});

test('library real thumbnail arrival, partial failure, retry and search replacement', {timeout:60000},async t=>{
 const browser=await engine.launch(),page=await browser.newPage({viewport:{width:1440,height:1000}});t.after(()=>browser.close());
 const pending=[];let failed=true, released=false;
 await page.route('**/thumb-controlled-*',r=>new Promise(resolve=>{const complete=async()=>{if(failed&&r.request().url().endsWith('-1'))await r.fulfill({status:500,body:'failed'});else await r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="white"/><path d="M40 40V260H360L80 100" stroke="black" fill="none"/></svg>'});resolve();};if(released)void complete();else pending.push(complete);}));
 await page.route('**/library-loading-fixture',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><head>${css.map(c=>`<link rel="stylesheet" href="/css/${c}">`).join('')}</head><body></body></html>`}));await page.goto(new URL('/library-loading-fixture',base).href);
 await page.evaluate(async()=>{
  const {createUnifiedLibraryUi}=await import('/js/unified-library-ui.js?v=1.7.0-four-session-integration');
  window.items=Array.from({length:60},(_,i)=>({id:'item-'+i,kind:'image',title:'도해 '+i,preview:{src:'/thumb-controlled-'+i},provenance:{provider:'image'}}));
  const provider={getSources:()=>[],getExamFilterOptions:()=>({academicYears:[]}),search:()=>window.items,listPdfFiles:()=>[],materialize:async r=>({dataUrl:r.preview.src})};
  window.library=createUnifiedLibraryUi({getProvider:async()=>provider,insertMaterialized:async()=>{},desktopLibrary:null});window.opening=library.open();
 });
 await page.locator('.ll.is-on').waitFor();assert.equal(await page.locator('.ll').count(),1);
 const count=await page.locator('.ll-count').textContent();const total=Number(count.split('/')[1]);assert.ok(total>0&&total<60,'only requested visible/prefetched thumbnails count');
 await page.screenshot({path:path.join(out,'library-loading.png')});
 assert.ok(pending.length>0);released=true;for(const release of pending.splice(0))await release();
 await page.locator('.ll[data-state="partial-failure"]').waitFor();assert.ok((await page.locator('.ll-text').textContent()).includes('1개 불러오지 못함'));
 assert.equal(await page.locator('.unilib-thumb[data-thumbnail-state="error"]').count(),1);
 failed=false;await page.evaluate(()=>{window.retry=library.refresh();});await page.waitForFunction(()=>document.querySelector('.ll')?.dataset.state==='loading');
 for(const release of pending.splice(0))await release();
 // New search invalidates all old work and does not leave a global indicator behind.
 await page.evaluate(()=>{window.items=[];window.empty=library.refresh();});await page.evaluate(()=>window.empty);
 assert.notEqual(await page.locator('.ll-grid').getAttribute('aria-busy'),'true');assert.equal(await page.locator('.unilib-result-card').count(),0);
 await page.evaluate(()=>library.close());assert.equal(await page.locator('.ll').evaluate(n=>n.classList.contains('is-on')),false);
});

test('product entries and actual request signal mount the approved effect', {timeout:90000},async t=>{
 const evidence=path.join(out,'product');fs.mkdirSync(evidence,{recursive:true});const {page,errors}=await fixture(t,1,evidence);
 assert.equal(await page.locator('#exam-library-open').count(),1);
 assert.equal(await page.locator('#ai-image-install-open').count(),1);
 await page.evaluate(async()=>{
  const {chooseWorkbenchAssignment}=await import('/js/library/workbench-assignment.js?v=1.7.0-four-session-integration');
  window.__assignmentPromise=chooseWorkbenchAssignment({references:[{data:window.__task2.original,name:'교과서 이미지'}]});
 });
 const assignment=page.locator('.workbench-assignment');await assignment.waitFor();
 await page.keyboard.down('Space');await page.keyboard.down('Space');await page.keyboard.up('Space');
 assert.equal(await assignment.isVisible(),true,'first Space places images without leaving the classification desk');
 assert.equal(await assignment.locator('[data-pending-count]').textContent(),'0개');
 assert.equal(await assignment.locator('.workbench-assignment-bench').count(),1);
 assert.equal(await page.evaluate(()=>window.__task2.sends.length),0);
 await page.keyboard.down('Space');
 await page.evaluate(async()=>{
  const assignment=await window.__assignmentPromise;
  window.__imageReceipt=await window.__task2Manager.openIndependentReferences({references:[{dataUrl:window.__task2.original,name:'교과서 이미지'}],...assignment,startGeneration:false});
  document.querySelector('#ai-image-panel [data-ai-comments-apply]').focus();
 });
 await page.keyboard.down('Space');await page.keyboard.up('Space');
 assert.equal(await page.locator('.workbench-assignment').count(),0);
 assert.equal(await page.evaluate(()=>window.__task2.sends.length),0,'the confirming Space press cannot also run image generation');
 await page.locator('#ai-image-panel [data-ai-comments-apply]').click();
 await page.locator('#ai-image-panel [data-ai-loading-frame] .br-layer').first().waitFor();
 assert.match(await page.locator('#ai-image-panel .rs-text').textContent(),/원본(과 라벨)?을 읽고 있어요/);
 assert.equal(await page.locator('#ai-image-panel .ai-loading-stage').count(),4,'four real stages are shown');
 assert.equal(await page.locator('#ai-image-panel .ai-loading-stage[data-state="current"]').count(),1);
 assert.equal(await page.locator('#ai-image-panel .rs-step').textContent(),'');
 assert.equal(await page.locator('#ai-image-panel .br-stage').first().evaluate(n=>getComputedStyle(n).position),'absolute','the product entry loads the effect stylesheet');
 assert.equal(await page.locator('#ai-image-panel .rs').evaluate(n=>getComputedStyle(n).position),'absolute','the status band stylesheet is present in the real entry');
 assert.notEqual(await page.locator('#ai-image-panel .rs-sheen').evaluate(n=>getComputedStyle(n).display),'none');
 const alignment=await page.locator('#ai-image-panel').evaluate(n=>{
  const box=s=>{const r=n.querySelector(s).getBoundingClientRect();return {y:r.y,w:r.width,h:r.height};};
  return {source:box('.is-ai-active-source .ai-preview-stage > img'),effect:box('.ai-loading-picture')};
 });
 for(const key of ['y','w','h']) assert.ok(Math.abs(alignment.source[key]-alignment.effect[key])<2,`source/loading ${key} match: ${JSON.stringify(alignment)}`);
 await page.screenshot({path:path.join(evidence,'product-loading.png')});
 await page.waitForFunction(()=>window.__task2.sends.length>0);
 // Textbook/general conversion remains active through close/reopen. The
 // elapsed request clock and prepared blur canvases must survive navigation.
 const secs=t=>{const m=String(t).match(/(\d+):(\d+)$/);return m?Number(m[1])*60+Number(m[2]):-1;};
 await page.waitForFunction(()=>/0:0[1-9]|0:[1-5]\d/.test(document.querySelector('#ai-image-panel .ai-loading-meta').textContent));
 const before=secs(await page.locator('#ai-image-panel .ai-loading-meta').textContent());
 await page.evaluate(async()=>{window.__task2Manager.close();await window.__task2Manager.open();});
 assert.equal(await page.locator('#ai-image-panel').getAttribute('data-blur-loading'),'true');
 assert.equal(await page.locator('#ai-image-panel .br-layer').count(),3);
 assert.ok(secs(await page.locator('#ai-image-panel .ai-loading-meta').textContent())>=before);
 assert.equal(await page.locator('#ai-image-panel [data-ai-generating]').evaluate(n=>getComputedStyle(n).opacity),'0');
 await page.evaluate(async()=>{
  await window.__task2Manager.openIndependentReferences({references:[{dataUrl:window.__task2.original,name:'다른 작업대'}],startGeneration:false});
 });
 assert.notEqual(await page.locator('#ai-image-panel').getAttribute('data-blur-loading'),'true','unrelated workspace has no inherited loading effect');
 await page.evaluate(()=>window.__task2Manager.revealImportedReferences(window.__imageReceipt));
 assert.equal(await page.locator('#ai-image-panel').getAttribute('data-blur-loading'),'true','loading survives an independent workspace round trip');
 assert.equal(await page.locator('#ai-image-panel .br-layer').count(),3);
 assert.ok(secs(await page.locator('#ai-image-panel .ai-loading-meta').textContent())>=before);
 assert.equal(await page.evaluate(()=>window.__task2.sends.length),1,'navigation never starts another request');
 await page.evaluate(()=>window.__task2.emit(0,'error'));
 await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-ai-loading-frame]').dataset.loadingState==='failed');
 assert.ok((await page.locator('#ai-image-panel .rs-text').textContent()).includes('변환하지 못했어요'));
 // Empty graph workbench keeps imports on the original (left) side.
 await page.locator('#ai-image-panel [data-ai-workflow="graph"]').click();
 await page.locator('#ai-image-panel[data-ai-workflow="graph"]').waitFor();
 const imports=page.locator('#ai-image-panel [data-ai-empty-import]:visible');
 assert.equal(await imports.count(),1);
 assert.equal(await imports.evaluate(n=>!!n.closest('[data-ai-reference-empty]')),true);
 assert.equal(await page.locator('#ai-image-panel .ai-previews [data-ai-empty-import]').count(),0);
 assert.equal(await page.locator('#ai-image-panel [data-ai-empty] strong').textContent(),'생성 결과 없음');
 await page.screenshot({path:path.join(evidence,'product-empty-graph.png')});
 const png=await page.evaluate(()=>window.__task2.original.split(',')[1]);
 await page.locator('#ai-image-panel [data-ai-source-file]').setInputFiles({name:'graph.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await page.locator('#ai-image-panel [data-ai-send]').click();
 await page.waitForFunction(()=>window.__task2.sends.length>1);
 await page.locator('#ai-image-panel [data-ai-loading-frame] .br-layer').first().waitFor();
 assert.equal(await page.locator('#ai-image-panel .rs-step').textContent(),'');
 assert.ok((await page.locator('#ai-image-panel .rs-text').textContent()).includes('그래프에서 축과 눈금'));
 await page.screenshot({path:path.join(evidence,'product-graph-loading.png')});
 await page.evaluate(plan=>{
   const index=window.__task2.sends.length-1,request=window.__task2.sends[index].payload;
   const source=JSON.parse(request.text.match(/바인딩을 정확히 복사하고[^\n]*: (\{[^\n]+\})/)[1]);
   plan.source={...source,plotBox:{x:40,y:20,w:320,h:240}};
   window.__task2.emit(index,'assistant',JSON.stringify(plan));window.__task2.emit(index,'completed');
 },JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/graph-reconstruction/linear.json'))));
 await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-ai-loading-frame]').dataset.loadingState==='completed');
 assert.ok((await page.locator('#ai-image-panel .rs-text').textContent()).includes('이제 직접 고칠 수 있어요'));
 assert.deepEqual(errors,[]);
});

test('graph workbench cards switch from padding and status icons while requests stay isolated', {timeout:60000},async t=>{
 const evidence=path.join(out,'graph-card');fs.mkdirSync(evidence,{recursive:true});
 const {page,errors}=await fixture(t,2,evidence,{beforeNavigate:page=>page.addInitScript(()=>{
  window.__seedReady=window.__seedReady.then(()=>new Promise((resolve,reject)=>{
   const request=indexedDB.open('5e.preview:5e-ai-image-tasks',1);
   request.onsuccess=()=>{const db=request.result,tx=db.transaction('tasks','readwrite'),store=tx.objectStore('tasks'),read=store.get('workspace');
    read.onsuccess=()=>{const value=read.result;value.tabs.forEach(tab=>{tab.conversionKind='graph';});store.put(value);};
    tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
   };
  }));
 })});
 const panel=page.locator('#ai-image-panel');
 await panel.locator('[data-ai-send]').click();await page.waitForFunction(()=>__task2.sends.length===1);
 await panel.locator('.ai-task-tab-select').nth(1).click();
 await page.waitForFunction(()=>document.querySelector('#ai-image-panel .ai-task-tab.is-on')?.dataset.tabId==='task-1');
 await panel.locator('[data-ai-send]').click();await page.waitForFunction(()=>__task2.sends.length===2);
 const activate=async(id,point)=>{
  const row=panel.locator(`.ai-task-tab[data-tab-id="${id}"]`),box=await row.boundingBox();
  if(point==='padding') await page.mouse.click(box.x+2,box.y+box.height/2);
  else {const status=await row.locator('.ai-task-tab-status').boundingBox();assert.ok(status);await page.mouse.click(status.x+status.width/2,status.y+status.height/2);}
  await page.waitForFunction(id=>document.querySelector('#ai-image-panel .ai-task-tab.is-on')?.dataset.tabId===id,id);
 };
 await activate('task-0','padding');await activate('task-1','padding');
 await activate('task-0','status');await activate('task-1','status');
 assert.equal(await page.evaluate(()=>__task2.sends.length),2,'switching never starts or cancels another request');
 assert.equal(await panel.getAttribute('data-ai-busy'),'true');
 await page.screenshot({path:path.join(evidence,'graph-card-switch.png')});assert.deepEqual(errors,[]);
});

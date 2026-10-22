const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.EXAM_URL||'http://127.0.0.1:51819',version='?v=1.7.0-four-session-integration';
const out=path.resolve(process.env.EVIDENCE_DIR||'_work/feedback/parts/screen-loading-motion-20261015');fs.mkdirSync(out,{recursive:true});
(async()=>{for(const [name,engine] of Object.entries({chromium,webkit}).filter(([k])=>!process.env.BROWSER_ENGINE||k===process.env.BROWSER_ENGINE)){
 const browser=await engine.launch(),context=await browser.newContext({viewport:{width:1440,height:1000},screen:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 const deadline=setTimeout(()=>{console.error(name+': overall deadline');void browser.close();},30000);
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.route('**/screen-followup-fixture',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><head><link rel="stylesheet" href="/css/style.css${version}"><link rel="stylesheet" href="/css/unified-library.css${version}"><link rel="stylesheet" href="/css/loading/blur-reveal.css${version}"><link rel="stylesheet" href="/css/loading/reveal-status.css${version}"><link rel="stylesheet" href="/css/loading/library-loading.css${version}"></head><body></body></html>`}));
  await page.goto(base+'/screen-followup-fixture');
  await page.evaluate(async version=>{
   const {createUnifiedLibraryUi}=await import('/js/unified-library-ui.js'+version);
   const catalog=new Promise(r=>window.releaseCatalog=r),image=new Promise(r=>window.releaseImage=r);
   const c=document.createElement('canvas');c.width=400;c.height=200;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,400,200);ctx.fillStyle='#111';ctx.fillText('로딩 검수',30,50);window.fixtureImage=c.toDataURL();
   const item={id:'image-1',kind:'image',title:'검수 이미지',provenance:{provider:'image'},preview:{pageGeometry:{width:400,height:200}}};
   const provider={getSources:()=>[],getExamFilterOptions:()=>({academicYears:[]}),search:()=>window.emptyCatalog?[]:[item],listPdfFiles:()=>[],materialize:async()=>{await image;return {dataUrl:window.fixtureImage};}};
   window.ui=createUnifiedLibraryUi({getProvider:async()=>{await catalog;if(window.failCatalog)throw Error('Controlled catalog failure');return provider;},insertMaterialized:async()=>{},desktopLibrary:null});
   window.opening=window.ui.open();
  },version);
  const ui=page.locator('.unified-library-overlay'),stage=ui.locator('[data-unilib-stage]'),state=ui.locator('[data-unilib-result-state]');
  await ui.waitFor();assert.equal(await ui.locator('.unilib-result-placeholder').count(),6,'the frame appears before the provider resolves');
  assert.equal(await stage.locator('.unilib-loading-dots > i').count(),5);assert.equal(await state.getAttribute('data-state'),'loading');
  await page.waitForFunction(()=>document.querySelector('.unified-library-overlay').dataset.modalMotionState==='open');
  await page.screenshot({path:path.join(out,name+'-library-loading.png')});
  await page.setViewportSize({width:740,height:900});await page.screenshot({path:path.join(out,name+'-library-loading-narrow.png')});
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>window.releaseCatalog());await page.evaluate(()=>window.opening);
  await ui.locator('[data-result-id="image-1"]').click();await stage.locator('.unilib-preview-loading').waitFor();
  assert.equal(await stage.locator('.unilib-loading-dots > i').count(),5);assert.equal(await stage.locator('img').count(),0);
  const paper=await stage.locator('.unilib-preview-paper').boundingBox();assert.ok(Math.abs(paper.width/paper.height-2)<.01);
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await stage.locator('.unilib-loading-dots > i').first().evaluate(n=>getComputedStyle(n).animationName),'none');
  await page.evaluate(()=>window.releaseImage());await stage.locator('img').waitFor();await page.waitForFunction(()=>document.querySelector('[data-unilib-stage] img')?.naturalWidth===400);
  assert.notEqual(await stage.getAttribute('aria-busy'),'true');
  await page.evaluate(async()=>{window.emptyCatalog=true;await window.ui.refresh();});assert.equal(await state.getAttribute('data-state'),'empty');assert.equal(await ui.locator('.unilib-result-placeholder').count(),0);
  await page.evaluate(async()=>{window.ui.close();window.failCatalog=true;await window.ui.open();});assert.equal(await state.getAttribute('data-state'),'error');
  await page.evaluate(()=>{window.failCatalog=false;window.emptyCatalog=false;});await ui.locator('[data-unilib-result-retry]').click();await ui.locator('[data-result-id="image-1"]').waitFor();
  assert.equal(await ui.locator('[data-unilib-folder-loading]').getAttribute('data-state'),'ready','retry recovers source loading too');
  await page.evaluate(()=>window.ui.close());await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(async version=>{const {chooseWorkbenchAssignment}=await import('/js/library/workbench-assignment.js'+version);window.assignment=chooseWorkbenchAssignment({references:[1,2,3].map(n=>({name:'이미지 '+n,data:window.fixtureImage}))});},version);
  const bench=page.locator('.workbench-assignment');await bench.waitFor();
  const motion=await bench.locator('[data-classify-reference="0"][data-conversion-kind="image"]').evaluate(n=>{
   n.click();const host=document.querySelector('.workbench-assignment-overlay');return {cards:host.querySelectorAll('[data-reference]').length,ghosts:host.querySelectorAll('.workbench-assignment-motion-ghost').length,frames:host.getAnimations({subtree:true}).map(a=>a.effect.getKeyframes())};
  });
  assert.equal(motion.cards,3);assert.equal(motion.ghosts,1);assert.ok(motion.frames.flat().some(f=>String(f.transform).includes('14px')),'short movement explains classification');
  await bench.locator('[data-classify-reference="1"][data-conversion-kind="graph"]').evaluate(n=>n.click());
  await bench.locator('[data-reference="0"] [data-unassign]').evaluate(n=>n.click());
  assert.equal(await bench.locator('[data-reference]').count(),3,'rapid moves never duplicate or lose cards');
  await page.evaluate(()=>Promise.all(document.querySelector('.workbench-assignment-overlay').getAnimations({subtree:true}).filter(a=>Number.isFinite(a.effect.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{}))));
  assert.equal(await page.locator('.workbench-assignment-motion-ghost').count(),0);
  await page.screenshot({path:path.join(out,name+'-classification.png')});
  await page.emulateMedia({reducedMotion:'reduce'});
  const reduced=await bench.locator('[data-classify-reference="2"][data-conversion-kind="image"]').evaluate(n=>{n.click();return document.querySelector('.workbench-assignment-overlay').getAnimations({subtree:true}).flatMap(a=>a.effect.getKeyframes()).map(f=>f.transform);});
  assert.ok(reduced.every(t=>!t||t==='translateX(0px)'||t==='translateX(0)'),'reduced motion retains fades without travel');
  await bench.locator('[data-action="cancel"]').first().click();assert.equal(await page.locator('.workbench-assignment-motion-ghost').count(),0);
  // Exercise the real login controller with a fake popup and local transport.
  // No authentication request or credential is sent to the provider.
  await page.route('**/api/local-ai-config',r=>r.fulfill({json:{local:false}}));
  await page.route('**/api/web-login-*',r=>r.fulfill({json:r.request().url().endsWith('-start')?{ticket:'a'.repeat(64),authUrl:'https://auth.openai.com/device',userCode:'TEST-CODE'}:{state:'pending'}}));
  await page.evaluate(()=>{window.popupCalls=[];window.open=(url,name,features)=>{window.popupCalls.push({url,features});return {closed:false,resizeTo:(w,h)=>window.popupSize={w,h},moveTo:(x,y)=>window.popupPosition={x,y},location:{replace:url=>window.popupUrl=url},close(){this.closed=true;},focus(){}};};});
  await page.addScriptTag({path:path.resolve(__dirname,'../js/web-ai-connection.js')});
  await page.evaluate(async()=>{await window.fiveEWebLogin();await window.fiveEWebContinueLogin();});
  const popup=await page.evaluate(()=>({size:window.popupSize,position:window.popupPosition,url:window.popupUrl,screen:{w:screen.availWidth,h:screen.availHeight}}));
  assert.equal(popup.size.w,720);assert.equal(popup.size.h,Math.min(1080,popup.screen.h-32));assert.ok(popup.position.x>=0&&popup.position.y>=0);assert.equal(popup.url,'https://auth.openai.com/device');
  await page.evaluate(()=>window.fiveEWebCancelLogin());
  await page.addStyleTag({url:base+'/css/web-login.css'+version});
  await page.evaluate(async version=>{
   window.fiveEWebAI={status:async()=>({login:{loggedIn:false}})};
   const header=document.createElement('div');header.className='canvas-global-controls';document.body.append(header);
   const {initWebLoginUi}=await import('/js/web-login-ui.js'+version);window.loginUi=initWebLoginUi({openAi:()=>{}});
  },version);
  await page.locator('.web-account-status').click();
  await page.evaluate(()=>{
   window.dispatchEvent(new CustomEvent('5e:web-login-progress',{detail:{state:'ready',userCode:'TEST-CODE'}}));
   window.dispatchEvent(new CustomEvent('5e:web-login-progress',{detail:{state:'layout',paired:true,codeLeft:64,codeWidth:480}}));
  });
  const guide=page.locator('.web-login-dialog'),guideBox=await guide.boundingBox();
  assert.equal(guideBox.width,480);
  const alignment=await guide.evaluate(n=>{const a=n.querySelector('.web-login-code-row strong').getBoundingClientRect(),b=n.querySelector('[data-copy-code]').getBoundingClientRect();return {code:{y:a.y,h:a.height},copy:{y:b.y,h:b.height}};});
  assert.ok(Math.abs(alignment.code.y+alignment.code.h/2-alignment.copy.y-alignment.copy.h/2)<3,'code and copy stay on one row '+JSON.stringify(alignment));
  await page.screenshot({path:path.join(out,name+'-auth-guide.png')});
  await guide.locator('.web-login-close').click();
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,name+'-result.json'),JSON.stringify({motion,reduced,popup,errors},null,2));
  console.log(name+': shell/skeleton, preview wave, reduced motion, empty/error/retry, rapid classification and login popup PASS');
 }finally{clearTimeout(deadline);await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});

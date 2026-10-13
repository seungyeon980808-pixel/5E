const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
process.env.APP_ENTRY='/'; // This approval changes the canonical product, not the older preview copy.
const {installAiMain,fixtureContext}=require('./helpers/canonical-fixture-adapter.cjs');
const {startServer,stopServer}=require('./run-browser-tests.cjs');
const fixtureSource=fs.readFileSync(path.join(root,'tests/test-ai-workbench-integration-browser.cjs'),'utf8');
const seedStart=fixtureSource.indexOf('function seedRequestWorkspaces('),seedEnd=fixtureSource.indexOf('\nasync function requestBrowserFixture(');
assert.ok(seedStart>=0 && seedEnd>seedStart,'Use the established transport fixture, retaining its generation/review protocol');
const seed=fixtureSource.slice(seedStart,seedEnd);
const evidenceRoot=process.env.EVIDENCE_DIR || path.join(root,'_work/feedback/parts/button-design-correction');

async function assertOriginalAppearance(page, selector) {
  await page.evaluate(async()=>{
    await document.fonts.ready;
    await Promise.allSettled(document.getAnimations().filter(a=>a.playState==='running' && a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished));
  });
  const read = () => page.locator(selector).evaluateAll(els => els.map(el => {
    const s=getComputedStyle(el);
    return Object.fromEntries(['backgroundColor','borderTopWidth','borderTopColor','borderRadius','boxShadow','width','height','padding','color'].map(key=>[key,s[key]]));
  }));
  const actual=await read(); assert.ok(actual.length,selector);
  await page.locator('link[href*="button-design.css"]').evaluate(el=>{el.sheet.disabled=true;});
  const original=await read();
  await page.locator('link[href*="button-design.css"]').evaluate(el=>{el.sheet.disabled=false;});
  assert.deepEqual(actual,original,`Effects must preserve existing appearance: ${selector}`);
  return actual;
}

for (const engine of [chromium,webkit]) test(`canonical button design and unread conversion lifecycle in ${engine.name()}`,{timeout:90000},async t=>{
  const evidence=path.join(evidenceRoot,engine.name());fs.mkdirSync(evidence,{recursive:true});
  let server,origin=process.env.RELEASE_URL;
  if(!origin){server=startServer();origin=await server.ready;}
  const browser=await engine.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1512,height:982}});
  await context.tracing.start({screenshots:true,snapshots:true});
  const page=await context.newPage(),errors=[];
  // Button QA uses fixed library metadata instead of a live CORS-dependent gateway.
  const library=JSON.parse(fs.readFileSync(path.join(root,'assets/pdf-library/catalog-bootstrap.json'))).payload;
  await context.route('https://5e-google-drive-gateway.5e-desktop.workers.dev/**',route=>{
    const name=new URL(route.request().url()).pathname.split('/').at(-1);
    const body=name==='pack.json'?library.pack:name==='checksums.json'?library.checksums:name===library.pack.paths.catalog?library.catalog:null;
    return route.fulfill(body ? {contentType:'application/json',body:JSON.stringify(body)} : {status:503,contentType:'application/json',body:'{"error":"fixture unavailable"}'});
  });
  page.on('pageerror',error=>errors.push(error.message));
  t.after(async()=>{await context.tracing.stop({path:path.join(evidence,'trace.zip')});await browser.close();if(server)await stopServer(server.child);});
  const {runtimeInit}=fixtureContext(root);
  if(process.env.ATTENTION_DIAGNOSTIC==='1') {
    const attentionSource=fs.readFileSync(path.join(root,'js/ai-result-attention.js'),'utf8');
    await page.route('**/js/ai-result-attention.js*',route=>route.fulfill({contentType:'text/javascript',body:attentionSource.replace('  tab.resultAttention = { ...tab.resultAttention, pendingCandidateId: null };', '  (window.__attentionActions ||= []).push({id:candidateId,stack:new Error().stack});\n  tab.resultAttention = { ...tab.resultAttention, pendingCandidateId: null };')}));
  }
  await page.addInitScript({content:seed+`\nseedRequestWorkspaces(2,true,false,'pro',false,false,false,${JSON.stringify({runtime:runtimeInit})});`});
  await installAiMain(page,root,{},evidence);
  await page.goto(origin+'/?mode=pro&mobile=0&exam=0',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__task2Manager && document.getElementById('exam-send')?.classList.contains('ui-core-action'));
  await page.evaluate(()=>window.__task2Manager.sharingSnapshot());
  const welcome=page.locator('.tut-welcome-overlay .tut-banner-no');if(await welcome.isVisible())await welcome.click();
  const core=['exam-library-open','ai-image-install-open','graph-tool-open','exam-send'];
  await page.evaluate(()=>document.fonts.ready);
  const layout=await page.evaluate(ids=>ids.map(id=>{
    const el=document.getElementById(id),rect=el.getBoundingClientRect(),style=getComputedStyle(el);
    return {id,inHub:!!el.closest('.image-workflow-hub'),height:rect.height,radius:style.borderRadius,border:style.borderTopWidth,animation:getComputedStyle(el,'::before').animationName};
  }),core);
  assert.ok(layout.every(x=>x.inHub && x.height===27 && x.radius==='6px' && x.border==='1px' && x.animation==='none'),JSON.stringify(layout));
  const tools=await assertOriginalAppearance(page,'.tool-btn');
  const eyes=await assertOriginalAppearance(page,'.insp-layer-eye');
  assert.ok(eyes.every(x=>x.width==='22px' && x.height==='22px' && x.borderTopWidth==='0px' && x.backgroundColor==='rgba(0, 0, 0, 0)'),JSON.stringify(eyes));
  assert.equal(await page.locator('#panel-right').evaluate(el=>getComputedStyle(el).width),'198px');
  await page.evaluate(()=>{
    window.__clickMotions=[];
    document.addEventListener('click',event=>{
      const el=event.target.closest?.('.ui-core-action');if(!el)return;
      const animation=el.getAnimations().find(a=>a.effect?.getKeyframes().some(frame=>frame.scale==='1.03'));
      if(animation)window.__clickMotions.push({id:el.id,duration:animation.effect.getTiming().duration,scales:animation.effect.getKeyframes().map(frame=>frame.scale)});
    },true);
  });
  assert.equal(await page.locator('#auto-snap-btn svg').count(),1);
  assert.equal((await page.locator('#auto-snap-btn').textContent()).trim(),'');
  assert.equal(await page.locator('#center-view-btn').getAttribute('aria-pressed'),'true');
  await page.locator('#auto-snap-btn').click();assert.equal(await page.locator('#auto-snap-btn').getAttribute('aria-pressed'),'false');
  await page.locator('#auto-snap-btn').click();assert.equal(await page.locator('#auto-snap-btn svg').count(),1);
  await page.mouse.move(1000,400);await page.screenshot({path:path.join(evidence,'main-idle.png')});
  await page.locator('#exam-send').hover();
  assert.equal(await page.locator('#exam-send').evaluate(el=>getComputedStyle(el,'::before').animationName),'ui-button-orbit');
  await page.waitForFunction(()=>Number(getComputedStyle(document.getElementById('exam-send'),'::before').opacity)>.95);
  await page.screenshot({path:path.join(evidence,'main-hwp-hover.png')});
  await page.locator('#exam-send').click();
  assert.equal(await page.locator('#exam-document-menu').isVisible(),true);
  await assertOriginalAppearance(page,'#exam-document-menu button');
  await page.locator('#exam-send').evaluate(async el=>{await Promise.all(el.getAnimations().filter(a=>a.effect?.getKeyframes().some(frame=>frame.scale)).map(a=>a.finished));});
  const menuAlignment=await page.evaluate(()=>{
    const button=document.getElementById('exam-send').getBoundingClientRect(),menu=document.getElementById('exam-document-menu').getBoundingClientRect();
    return {leftGap:menu.left-button.left,verticalGap:button.top-menu.bottom};
  });
  assert.ok(Math.abs(menuAlignment.leftGap)<1 && Math.abs(menuAlignment.verticalGap-3)<1,JSON.stringify(menuAlignment));
  await page.screenshot({path:path.join(evidence,'hwp-menu-aligned.png')});
  await page.keyboard.press('Escape');
  await page.locator('#graph-tool-open').click();await page.locator('#graph-modal-overlay').waitFor({state:'visible'});
  await assertOriginalAppearance(page,'#graph-modal-overlay button');
  await page.locator('#gm-variant-sel button[data-variant="cross"]').click();await page.mouse.move(400,400);
  assert.equal(await page.locator('#gm-variant-sel button.on').getAttribute('data-variant'),'cross');
  const graphSelection=await page.locator('#gm-variant-sel button').evaluateAll(els=>els.map(el=>({selected:el.classList.contains('on'),background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopColor})));
  assert.notEqual(graphSelection.find(x=>x.selected).border,graphSelection.find(x=>!x.selected).border,'Selected graph tools remain distinguishable under the shared skin');
  await page.screenshot({path:path.join(evidence,'graph.png')});await page.keyboard.press('Escape');
  await page.locator('#exam-library-open').click();await page.locator('[data-unilib-close]').waitFor({state:'visible'});
  await assertOriginalAppearance(page,'[data-unilib-close]');
  const libraryMotion=await page.evaluate(()=>window.__clickMotions.find(x=>x.id==='exam-library-open'));
  assert.deepEqual(libraryMotion,{id:'exam-library-open',duration:200,scales:['1','1.03','1']});
  await page.screenshot({path:path.join(evidence,'library.png')});await page.keyboard.press('Escape');
  await page.locator('#ai-image-install-open').click();await page.locator('#ai-image-panel [data-ai-send]').waitFor({state:'visible'});
  await assertOriginalAppearance(page,'#ai-image-panel button');
  await page.screenshot({path:path.join(evidence,'ai-preparation.png')});
  await page.locator('#ai-image-panel [data-ai-send]').click();
  await page.waitForFunction(()=>window.__task2.generationSends.length===1);
  await page.evaluate(()=>{window.__task2.emitGeneration(0,'image');window.__task2.emitGeneration(0,'done');});
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel')?.dataset.aiBusy==='false' && document.querySelector('#ai-image-panel')?.dataset.aiResultCount==='1');
  const before=await page.evaluate(async()=>({tabs:(await window.__task2Manager.sharingSnapshot()).workspaces[0].tabs,sends:window.__task2.sends.length}));
  const attention=await page.evaluate(()=>({actions:window.__attentionActions,entry:document.getElementById('ai-image-install-open').outerHTML,panels:[...document.querySelectorAll('[data-ai-result-count]')].map(el=>({id:el.id,count:el.dataset.aiResultCount})),rows:[...document.querySelectorAll('.ai-task-tab-select')].map(el=>({label:el.getAttribute('aria-label'),attention:el.dataset.resultAttention}))}));
  fs.writeFileSync(path.join(evidence,'notification-observation.json'),JSON.stringify({before,attention},null,2));
  assert.equal(await page.locator('#ai-image-install-open').getAttribute('data-result-attention'),'true');
  assert.equal(await page.locator('[data-tab-id="task-0"] .ai-task-tab-select').getAttribute('data-result-attention'),'true');
  assert.equal(await page.locator('[data-tab-id="task-0"] .ai-task-tab-select').evaluate(el=>getComputedStyle(el,'::before').animationName),'ui-result-attention');
  await page.waitForFunction(()=>{
    const el=document.querySelector('[data-tab-id="task-0"] .ai-task-tab-select');
    if(!el)return false;
    const samples=window.__pulseSamples ||= []; samples.push(Number(getComputedStyle(el,'::before').opacity));
    return Math.min(...samples)<.25 && Math.max(...samples)>.95;
  },null,{timeout:5000});
  const pulse=await page.evaluate(()=>[Math.min(...window.__pulseSamples),Math.max(...window.__pulseSamples)]);
  assert.ok(pulse[0]<.25 && pulse[1]>.95,JSON.stringify(pulse));
  await page.screenshot({path:path.join(evidence,'conversion-needs-review.png')});
  await page.locator('#ai-image-panel [data-ai-close]').click();
  await page.locator('#ai-image-install-open').hover();
  assert.equal(await page.locator('#ai-image-install-open').evaluate(el=>getComputedStyle(el,'::before').animationName),'ui-result-attention','Unread pulse takes precedence over hover rotation');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('#ai-image-install-open').evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
  await page.emulateMedia({reducedMotion:'no-preference'});
  // Reload while unread: the saved result and notification must recover together.
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__task2Manager);
  await page.evaluate(()=>window.__task2Manager.sharingSnapshot());
  await page.waitForFunction(()=>document.querySelector('#ai-image-install-open')?.dataset.resultAttention==='true');
  await page.locator('#ai-image-install-open').click();
  await page.waitForFunction(()=>document.querySelector('#ai-image-install-open')?.dataset.resultAttention==='false');
  const after=await page.evaluate(async()=>({tabs:(await window.__task2Manager.sharingSnapshot()).workspaces[0].tabs,sends:window.__task2.sends.length}));
  for(const tab of before.tabs){const other=after.tabs.find(x=>x.id===tab.id);assert.deepEqual(other.generated,tab.generated);assert.deepEqual(other.attachments,tab.attachments);assert.equal(other.workState,tab.workState);}
  assert.equal(after.sends,0,'Viewing recovered results sends no provider request');
  await page.screenshot({path:path.join(evidence,'ai-reviewed.png')});
  await page.locator('#ai-image-panel [data-ai-close]').click();
  await page.locator('#ai-image-panel').waitFor({state:'hidden'});
  await page.locator('#theme-toggle').click();
  await page.waitForFunction(()=>{
    const style=getComputedStyle(document.getElementById('graph-tool-open'));
    return document.documentElement.dataset.theme==='light' && style.backgroundColor==='rgba(0, 0, 0, 0)';
  });
  await assertOriginalAppearance(page,'.tool-btn');
  await assertOriginalAppearance(page,'.insp-layer-eye');
  await page.screenshot({path:path.join(evidence,'main-light.png')});
  await page.locator('#theme-toggle').click();
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark' && getComputedStyle(document.getElementById('graph-tool-open')).backgroundColor==='rgba(0, 0, 0, 0)');
  await page.setViewportSize({width:320,height:780});
  await page.screenshot({path:path.join(evidence,'main-320.png')});
  const mobile=await page.evaluate(ids=>ids.map(id=>{const r=document.getElementById(id).getBoundingClientRect();return{id,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};}),core);
  assert.ok(mobile.every(r=>r.width>0 && r.left>=0 && r.right<=320 && r.bottom<=780),JSON.stringify(mobile));
  await page.locator('#exam-send').click();
  await page.locator('#exam-document-menu').evaluate(async el=>{await Promise.all(el.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished));});
  const narrowMenu=await page.locator('#exam-document-menu').boundingBox();
  assert.ok(narrowMenu.x>=7 && narrowMenu.x+narrowMenu.width<=313,JSON.stringify(narrowMenu));
  await page.keyboard.press('Escape');
  const touch=await browser.newContext({viewport:{width:320,height:780},hasTouch:true});
  const touchPage=await touch.newPage();
  await touchPage.addInitScript({content:seed+`\nseedRequestWorkspaces(2,false,false,'pro',false,false,false,${JSON.stringify({runtime:runtimeInit})});`});
  await installAiMain(touchPage,root,{},path.join(evidence,'touch'));
  await touchPage.goto(origin+'/?mode=pro&mobile=0&exam=0',{waitUntil:'domcontentloaded'});
  await touchPage.waitForFunction(()=>document.getElementById('exam-send')?.classList.contains('ui-core-action'));
  const touchWelcome=touchPage.locator('.tut-welcome-overlay .tut-banner-no');if(await touchWelcome.isVisible())await touchWelcome.click();
  const coarse=await touchPage.evaluate(ids=>ids.map(id=>({id,height:document.getElementById(id).getBoundingClientRect().height})),core);
  assert.ok(coarse.every(x=>x.height===27),JSON.stringify(coarse));
  await touchPage.screenshot({path:path.join(evidence,'main-touch-320.png')});await touch.close();
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(evidence,'receipt.json'),JSON.stringify({engine:engine.name(),layout,tools,eyes,menuAlignment,libraryMotion,mobile,narrowMenu,coarse,pulse,unreadPersisted:true,acknowledgmentPreservesResults:true,providerCalls:0,fixtureTransportOnly:true,errors},null,2));
});

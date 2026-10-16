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
  // Capture both styles synchronously: inspector rendering can replace eye nodes
  // between locator resolution and evaluation, yielding detached-node empty styles.
  const {actual,original}=await page.evaluate(selector=>{
    const sheet=document.querySelector('link[href*="button-design.css"]').sheet;
    const read=()=>[...document.querySelectorAll(selector)].map(el=>{
      const s=getComputedStyle(el);
      return Object.fromEntries(['backgroundColor','borderTopWidth','borderTopColor','borderRadius','boxShadow','width','height','padding','color'].map(key=>[key,s[key]]));
    });
    const actual=read();sheet.disabled=true;
    try {return {actual,original:read()};} finally {sheet.disabled=false;}
  },selector);
  assert.ok(actual.length,selector);
  assert.deepEqual(actual,original,`Effects must preserve existing appearance: ${selector}`);
  return actual;
}

async function readStateStyle(page, selector) {
  return page.locator(selector).evaluate(el=>{
    const s=getComputedStyle(el);
    return {background:s.backgroundColor,border:s.borderTopColor,color:s.color};
  });
}

async function assertWorkflowState(page,id,open,selected) {
  await page.waitForFunction(({id,open})=>document.getElementById(id)?.dataset.workflowOpen===String(open),{id,open});
  if(id!=='exam-send')assert.equal(await page.locator('#'+id).getAttribute('aria-expanded'),String(open));
  if(open)assert.deepEqual(await readStateStyle(page,'#'+id),selected,`${id} uses the same active state as the toolbar`);
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
  await page.goto(new URL('/?mode=pro&mobile=0&exam=0',origin).href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__task2Manager && document.getElementById('exam-send')?.classList.contains('ui-core-action'));
  await page.evaluate(()=>window.__task2Manager.sharingSnapshot());
  const welcome=page.locator('.tut-welcome-overlay .tut-banner-no');if(await welcome.isVisible())await welcome.click();
  const core=['exam-library-open','ai-image-install-open','graph-tool-open','exam-send'];
  await page.evaluate(()=>document.fonts.ready);
  const layout=await page.evaluate(ids=>ids.map(id=>{
    const el=document.getElementById(id),rect=el.getBoundingClientRect(),style=getComputedStyle(el);
    return {id,inHub:!!el.closest('.image-workflow-hub'),height:rect.height,radius:style.borderRadius,border:style.borderTopWidth,animation:getComputedStyle(el,'::before').animationName};
  }),core);
  // 그라파이트 규격(css/design-tokens.css): 기능 줄 버튼 28px·테두리 없음·장식 회전 없음.
  assert.ok(layout.every(x=>x.inHub && x.height===28 && x.radius==='6px' && x.border==='0px' && x.animation==='none'),JSON.stringify(layout));
  const idle=await page.locator('.image-workflow-hub .ui-core-action').evaluateAll(els=>els.map(el=>{
    const s=getComputedStyle(el),icon=getComputedStyle(el.querySelector('svg'));
    return {background:s.backgroundColor,border:s.borderTopColor,color:s.color,padding:s.padding,weight:s.fontWeight,gap:s.gap,iconWidth:icon.width,iconHeight:icon.height};
  }));
  assert.equal(idle.length,4);
  assert.ok(idle.every(s=>JSON.stringify(s)===JSON.stringify(idle[0])),JSON.stringify(idle));
  assert.equal(await page.locator('.image-workflow-divider').count(),0);
  assert.equal(idle[0].background,'rgba(0, 0, 0, 0)');
  const toolbar=await page.locator('#settings-menu-btn,#file-menu-btn,#sharing-btn,#auto-snap-btn,#grid-btn,#center-view-btn,#tutorial-btn,#quick-capture-btn').evaluateAll(els=>els.map(el=>{
    const s=getComputedStyle(el),icon=getComputedStyle(el.querySelector('svg'));
    return {id:el.id,width:s.width,height:s.height,radius:s.borderRadius,padding:s.padding,iconWidth:icon.width,iconHeight:icon.height};
  }));
  assert.equal(toolbar.length,8);
  // 그라파이트 규격: 위쪽 막대 버튼 28px·모서리 6px·아이콘 18px, 버튼 사이 2px.
  assert.ok(toolbar.every(s=>s.width==='28px' && s.height==='28px' && s.radius==='6px' && s.padding==='0px' && s.iconWidth==='18px' && s.iconHeight==='18px'),JSON.stringify(toolbar));
  assert.equal(await page.locator('.canvas-view-controls').evaluate(el=>getComputedStyle(el).gap),'2px');
  const tools=await assertOriginalAppearance(page,'.tool-btn');
  const eyes=await assertOriginalAppearance(page,'.insp-layer-eye');
  assert.ok(eyes.every(x=>x.width==='22px' && x.height==='22px' && x.borderTopWidth==='0px' && x.backgroundColor==='rgba(0, 0, 0, 0)'),JSON.stringify(eyes));
  assert.equal(await page.locator('#panel-right').evaluate(el=>getComputedStyle(el).width),'224px');
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
  const neutral=await readStateStyle(page,'#settings-menu-btn');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  assert.equal(await page.locator('#theme-toggle').getAttribute('aria-pressed'),'false');
  const darkStyle=await readStateStyle(page,'#theme-toggle');
  assert.equal(darkStyle.border,neutral.border);assert.equal(darkStyle.background,neutral.background);
  assert.equal(await page.locator('#center-view-btn').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#center-view-btn').getAttribute('data-mode'),'free');
  assert.equal(await page.locator('#auto-snap-btn').getAttribute('aria-pressed'),'false');
  assert.deepEqual(await readStateStyle(page,'#center-view-btn'),neutral);
  assert.deepEqual(await readStateStyle(page,'#auto-snap-btn'),neutral);
  for(const side of ['left','right'])assert.deepEqual(await readStateStyle(page,'#drawer-'+side+'-toggle'),neutral);
  await page.screenshot({path:path.join(evidence,'main-defaults.png')});
  await page.locator('#center-view-btn').click();await page.locator('[data-canvas-lock-mode="coordinate"]').click();
  await page.locator('#auto-snap-btn').click();
  const selected=await readStateStyle(page,'#center-view-btn');
  assert.notEqual(selected.border,neutral.border);
  assert.deepEqual(await readStateStyle(page,'#auto-snap-btn'),selected);
  for(const side of ['left','right']) {
    const selector='#drawer-'+side+'-toggle';
    assert.deepEqual(await readStateStyle(page,selector),neutral);
    assert.equal(await page.locator(selector+' svg').evaluate(el=>getComputedStyle(el).color),neutral.color,'Open panel uses the neutral default');
    await page.locator(selector).click();
    await page.waitForFunction(side=>document.querySelector('#drawer-'+side+'-toggle')?.getAttribute('aria-expanded')==='false',side);
    await page.mouse.move(1000,400);
    // 그라파이트: 접힌 패널 버튼은 면 대신 아이콘의 채운 칸이 사라지는 것으로 구별한다.
    assert.deepEqual(await readStateStyle(page,selector),neutral);
    assert.equal(await page.locator(selector+' .ds-fillcol').evaluate(el=>getComputedStyle(el).opacity),'0');
    await page.locator(selector).click();
    await page.waitForFunction(side=>document.querySelector('#drawer-'+side+'-toggle')?.getAttribute('aria-expanded')==='true',side);
    await page.mouse.move(1000,400);
    assert.deepEqual(await readStateStyle(page,selector),neutral);
  }
  await page.locator('#auto-snap-btn').click();assert.equal(await page.locator('#auto-snap-btn').getAttribute('aria-pressed'),'false');
  await page.mouse.move(1000,400);
  assert.deepEqual(await readStateStyle(page,'#auto-snap-btn'),await readStateStyle(page,'#settings-menu-btn'));
  await page.locator('#grid-btn').click();assert.equal(await page.locator('#grid-btn').getAttribute('aria-pressed'),'true');
  assert.deepEqual(await readStateStyle(page,'#grid-btn'),selected);await page.locator('#grid-btn').click();
  await page.locator('#center-view-btn').click();await page.locator('[data-canvas-lock-mode="free"]').click();
  await page.mouse.move(1000,400);
  assert.deepEqual(await readStateStyle(page,'#center-view-btn'),await readStateStyle(page,'#settings-menu-btn'));
  assert.equal(await page.locator('#auto-snap-btn svg').count(),1);
  await page.mouse.move(1000,400);await page.screenshot({path:path.join(evidence,'main-idle.png')});
  await page.locator('#exam-send').hover();
  // 그라파이트: 마우스를 올려도 도는 장식 테두리가 없다.
  assert.equal(await page.locator('#exam-send').evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
  await page.screenshot({path:path.join(evidence,'main-hwp-hover.png')});
  await page.locator('#exam-send').click();
  assert.equal(await page.locator('#exam-document-menu').isVisible(),true);
  await assertWorkflowState(page,'exam-send',true,selected);
  await assertOriginalAppearance(page,'#exam-document-menu button');
  await page.locator('#exam-send').evaluate(async el=>{await Promise.all(el.getAnimations().filter(a=>a.effect?.getKeyframes().some(frame=>frame.scale)).map(a=>a.finished));});
  const menuAlignment=await page.evaluate(()=>{
    const button=document.getElementById('exam-send').getBoundingClientRect(),menu=document.getElementById('exam-document-menu').getBoundingClientRect();
    return {leftGap:menu.left-button.left,verticalGap:button.top-menu.bottom};
  });
  assert.ok(Math.abs(menuAlignment.leftGap)<1 && Math.abs(menuAlignment.verticalGap-3)<1,JSON.stringify(menuAlignment));
  await page.screenshot({path:path.join(evidence,'hwp-menu-aligned.png')});
  await page.keyboard.press('Escape');
  await assertWorkflowState(page,'exam-send',false,selected);
  await page.locator('#graph-tool-open').click();await page.locator('#graph-modal-overlay').waitFor({state:'visible'});
  await assertWorkflowState(page,'graph-tool-open',true,selected);
  await assertOriginalAppearance(page,'#graph-modal-overlay button');
  await page.locator('#gm-variant-sel button[data-variant="cross"]').click();await page.mouse.move(400,400);
  assert.equal(await page.locator('#gm-variant-sel button.on').getAttribute('data-variant'),'cross');
  const graphSelection=await page.locator('#gm-variant-sel button').evaluateAll(els=>els.map(el=>({selected:el.classList.contains('on'),background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopColor})));
  assert.notEqual(graphSelection.find(x=>x.selected).border,graphSelection.find(x=>!x.selected).border,'Selected graph tools remain distinguishable under the shared skin');
  await page.screenshot({path:path.join(evidence,'graph.png')});await page.keyboard.press('Escape');
  await assertWorkflowState(page,'graph-tool-open',false,selected);
  await page.locator('#exam-library-open').click();await page.locator('[data-unilib-close]').waitFor({state:'visible'});
  await assertWorkflowState(page,'exam-library-open',true,selected);
  await assertOriginalAppearance(page,'[data-unilib-close]');
  const libraryMotion=await page.evaluate(()=>window.__clickMotions.find(x=>x.id==='exam-library-open'));
  // 그라파이트(Pro): 누를 때 커지는 장식 효과가 없다.
  assert.equal(libraryMotion,undefined);
  await page.screenshot({path:path.join(evidence,'library.png')});await page.keyboard.press('Escape');
  await assertWorkflowState(page,'exam-library-open',false,selected);
  await page.locator('#ai-image-install-open').click();await page.locator('#ai-image-panel [data-ai-send]').waitFor({state:'visible'});
  await assertWorkflowState(page,'ai-image-install-open',true,selected);
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
  // 그라파이트: 확인 필요 표시는 깜빡이지 않는 고정 테두리로 남는다.
  const pulseStyle=await page.locator('[data-tab-id="task-0"] .ai-task-tab-select').evaluate(el=>{const s=getComputedStyle(el,'::before');return {animation:s.animationName,opacity:Number(s.opacity),border:s.borderTopWidth};});
  assert.equal(pulseStyle.animation,'none');
  assert.ok(pulseStyle.opacity>.95 && pulseStyle.border!=='0px',JSON.stringify(pulseStyle));
  const pulse=[pulseStyle.opacity,pulseStyle.opacity];
  await page.screenshot({path:path.join(evidence,'conversion-needs-review.png')});
  await page.locator('#ai-image-panel [data-ai-close]').click();
  await page.locator('#ai-image-install-open').hover();
  const unread=await page.locator('#ai-image-install-open').evaluate(el=>{const s=getComputedStyle(el,'::before');return {animation:s.animationName,opacity:Number(s.opacity)};});
  assert.ok(unread.animation==='none' && unread.opacity>.95,'Unread mark stays visible without motion on hover: '+JSON.stringify(unread));
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
  await assertWorkflowState(page,'ai-image-install-open',false,selected);
  // 테마 버튼은 그라파이트 → 다크네이비 → 화이트 순환(js/color-mode.js). 두 번 눌러 화이트로.
  await page.locator('#theme-toggle').click();
  assert.equal(await page.locator('html').getAttribute('data-palette'),'classic');
  assert.equal(await page.locator('#theme-toggle').getAttribute('aria-pressed'),'false');
  await page.locator('#theme-toggle').click();
  assert.equal(await page.locator('#theme-toggle').getAttribute('aria-pressed'),'true');
  await page.waitForFunction(()=>{
    const style=getComputedStyle(document.getElementById('graph-tool-open'));
    return document.documentElement.dataset.theme==='light' && style.backgroundColor==='rgba(0, 0, 0, 0)';
  });
  await assertOriginalAppearance(page,'.tool-btn');
  await assertOriginalAppearance(page,'.insp-layer-eye');
  await page.screenshot({path:path.join(evidence,'main-light.png')});
  await page.locator('#theme-toggle').click();
  assert.equal(await page.locator('#theme-toggle').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('html').getAttribute('data-palette'),'graphite');
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark' && getComputedStyle(document.getElementById('graph-tool-open')).backgroundColor==='rgba(0, 0, 0, 0)');
  await page.setViewportSize({width:320,height:780});
  const narrowGaps=await page.evaluate(()=>({toolbar:getComputedStyle(document.querySelector('.toolbar-document')).gap,view:getComputedStyle(document.querySelector('.canvas-view-controls')).gap}));
  assert.equal(narrowGaps.view,narrowGaps.toolbar,'The narrow toolbar retains the same spacing across both groups');
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
  await touchPage.goto(new URL('/?mode=pro&mobile=0&exam=0',origin).href,{waitUntil:'domcontentloaded'});
  await touchPage.waitForFunction(()=>document.getElementById('exam-send')?.classList.contains('ui-core-action'));
  const touchWelcome=touchPage.locator('.tut-welcome-overlay .tut-banner-no');if(await touchWelcome.isVisible())await touchWelcome.click();
  const coarse=await touchPage.evaluate(ids=>ids.map(id=>({id,height:document.getElementById(id).getBoundingClientRect().height})),core);
  assert.ok(coarse.every(x=>x.height===27),JSON.stringify(coarse));
  await touchPage.screenshot({path:path.join(evidence,'main-touch-320.png')});await touch.close();
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(evidence,'receipt.json'),JSON.stringify({engine:engine.name(),layout,idle,toolbar,selected,tools,eyes,menuAlignment,libraryMotion,mobile,narrowGaps,narrowMenu,coarse,pulse,workflowStateLifecycle:true,panelStateLifecycle:true,unreadPersisted:true,acknowledgmentPreservesResults:true,providerCalls:0,fixtureTransportOnly:true,errors},null,2));
});

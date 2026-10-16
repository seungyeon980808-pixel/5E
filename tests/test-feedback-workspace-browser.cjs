const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
process.env.APP_ENTRY = '/';
const { instrumentAiMain } = require('./helpers/canonical-fixture-adapter.cjs');
const entry = require('./helpers/four-session-entry.cjs');
// This fixture uses no native graph builder: avoid loading unrelated browser-only
// dependency globals synchronously in Node when preparing the main route.
async function installAiMain(page, root, options) {
  const config = entry.entryConfiguration(process.env);
  const entryUrl = 'http://127.0.0.1/';
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const mainUrl = entry.mainModuleUrl(html, entryUrl);
  const source = fs.readFileSync(path.join(root, new URL(mainUrl).pathname), 'utf8');
  const runtime = entry.runtimeConfiguration(config, entryUrl, mainUrl, source);
  await page.addInitScript(value => { window.__runtime = value; }, {base:runtime.moduleBase,query:runtime.moduleQuery});
  await page.route(`**${runtime.moduleBase}main.js*`, route => route.fulfill({contentType:'text/javascript',body:instrumentAiMain(root,options).body}));
}
const playwright = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const evidence = path.resolve(process.env.EVIDENCE_DIR || path.join(root, '_work/ai-local-tools-qa'));
const lifecycleSource = fs.readFileSync(path.join(root, 'tests/test-ai-workspace-lifecycle-browser.cjs'), 'utf8');
const seedStart = lifecycleSource.indexOf('function seedRequestWorkspaces(');
const seedEnd = lifecycleSource.indexOf('\nasync function requestBrowserFixture(', seedStart);
assert.ok(seedStart >= 0 && seedEnd > seedStart);
const seed = lifecycleSource.slice(seedStart, seedEnd).replace('window.__task5Expected = structuredClone(tabs);', `
  for (const tab of tabs) { tab.conversionKind='image'; tab.generated[0].reviewState='scoped-applied'; }
  tabs[0].generated.push({...structuredClone(tabs[0].generated[0]),id:'candidate-empty-plan',name:'라벨 없는 다른 버전',data:modified,labelPlan:{version:4,frozen:true,labels:[],uncertainties:[],reviewRequired:false}});
  tabs[1].generated[0].labelPlan={version:4,frozen:true,reviewRequired:true,uncertainties:[],labels:[{id:'manual-label',text:'수정 라벨',mode:'text',scope:'general',contentMode:'plain',position:{x:.5,y:.2},anchor:{x:.5,y:.2},typography:{role:'text',bounds:{x:.35,y:.15,w:.3,h:.1}}}]};
  tabs[1].generated[0].comments[0].precisionCheck={kind:'move',dx:0,dy:0,search:{x0:128,y0:96,x1:256,y1:192}};
  window.__task5Expected = structuredClone(tabs);`);
const active = '#ai-image-panel';
const image = `${active} .is-ai-active-candidate .ai-preview-stage > img`;

async function fixture(t, engine) {
  fs.mkdirSync(path.join(evidence, engine), { recursive: true });
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
    const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.woff2':'font/woff2' };
    fs.readFile(file, (error, body) => { response.writeHead(error ? 404 : 200, { 'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' }); response.end(error ? 'missing' : body); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await playwright[engine].launch({ headless: true });
  const context = await browser.newContext({ viewport:{width:1440,height:1000}, acceptDownloads:true });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  t.after(async () => {
    if (!page.isClosed()) { await page.screenshot({path:path.join(evidence,engine,'final.png')}).catch(()=>{}); }
    await context.close(); await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(path.join(evidence,engine,'errors.json'), JSON.stringify(errors));
  });
  await page.addInitScript({content: `${seed}\nseedRequestWorkspaces(2);`});
  await installAiMain(page, root, {manager:'__localToolsManager',state:'__localToolsState'});
  await page.route('**/ai-label-composite.js*', route => {
    const source = fs.readFileSync(path.join(root,'js/ai-label-composite.js'),'utf8');
    return route.fulfill({contentType:'text/javascript',body:source.replace('export async function createEditableLabelComposite({ plan, placement, candidateDataUrl, artboard, signal }) {',
      'export async function createEditableLabelComposite({ plan, placement, candidateDataUrl, artboard, signal }) { window.__compositeCalls=(window.__compositeCalls||0)+1;')});
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin+'/?mode=pro&mobile=0&exam=0', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.__localToolsManager);
  await page.evaluate(() => window.__localToolsManager.sharingSnapshot());
  const welcome = page.locator('.tut-welcome-overlay .tut-banner-no'); if (await welcome.isVisible()) await welcome.click();
  await page.locator('#ai-image-install-open').click();
  await selected(page, 'candidate-0');
  assert.deepEqual(errors, []);
  return {page, errors, origin};
}
async function selected(page, id) {
  await page.waitForFunction(id => {
    const panel=document.querySelector('#ai-image-panel'), img=panel?.querySelector('.is-ai-active-candidate .ai-preview-stage > img');
    return panel?.dataset.aiSelectedCandidateId===id && img?.complete && img.naturalWidth===512;
  }, id);
  await page.evaluate(() => new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function selectVersion(page, id) {
  await page.locator(`${active} [data-ai-version-button]`).click();
  await page.locator(`${active} [data-ai-candidate-option="${id}"]`).click();
  await selected(page,id);
}
async function snapshot(page) {
  return page.evaluate(async () => (await window.__localToolsManager.sharingSnapshot()).workspaces.flatMap(w=>w.tabs));
}
async function geometry(page) {
  return page.evaluate(() => {
    const panel=document.querySelector('#ai-image-panel'), img=panel.querySelector('.is-ai-active-candidate .ai-preview-stage > img');
    const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    return {header:rect(panel.querySelector('.ai-result-pane .ai-pane-head')), image:rect(img), zoom:panel.aiWorkbench.getViewState().zoom,
      src:img.src, compositeCalls:window.__compositeCalls||0};
  });
}
async function lasso(page, points, finish=true) {
  const box=await page.locator(image).boundingBox(); assert.ok(box);
  const at=p=>({x:box.x+p.x/512*box.width,y:box.y+p.y/384*box.height});
  const first=at(points[0]);
  assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.closest('.is-ai-active-candidate')!==null,first),true,'lasso starts on the visible active result, not a clipped offscreen pixel');
  await page.mouse.move(first.x,first.y);await page.mouse.down();
  for(const p of points.slice(1)){const to=at(p);await page.mouse.move(to.x,to.y,{steps:4});}
  if(finish)await page.mouse.up();
}
async function saveEraseDraft(page) {
  const previous=await page.locator(active).getAttribute('data-ai-selected-candidate-id');
  await page.locator(`${active} [data-ai-edit-save]`).waitFor();
  await page.waitForFunction(()=>!document.querySelector('#ai-image-panel [data-ai-edit-save]').disabled);
  await page.locator(`${active} [data-ai-edit-save]`).click();
  await page.waitForFunction(id=>document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId!==id,previous);
  await page.waitForFunction(()=>!document.querySelector('#ai-image-panel [data-ai-local-erase]').disabled);
}
async function placePendingAndOpen(page, assignment) {
  await page.keyboard.press('Space');
  assert.equal(await assignment.isVisible(),true,'first Space places pending images without leaving classification');
  assert.equal((await assignment.locator('[data-pending-count]').textContent()).trim(),'0개');
  await page.keyboard.press('Space');await assignment.waitFor({state:'hidden'});
}

for (const engine of ['chromium','webkit']) test(`${engine}: screen followup defaults, comment editing and late thumbnails`, {timeout:60000}, async t => {
 const {page,errors}=await fixture(t,engine),panel=page.locator(active);
 const pan=panel.locator('[data-ai-comment-tool="pan"]'),visibility=panel.locator('[data-ai-comment-visibility]');
 assert.equal(await pan.getAttribute('aria-pressed'),'false');
 assert.equal(await visibility.getAttribute('aria-pressed'),'false');
 assert.equal(await panel.locator('[data-ai-mark-leaders]').inputValue(),'keep');
 await visibility.click();
 const marker=panel.locator('.is-ai-active-candidate .ai-comment-marker').first();
 await marker.hover();
 const popup=panel.locator('[data-ai-comment-popover]'),editor=popup.locator('[data-ai-inline-editor]');
 await editor.waitFor();
 const inputBox=await editor.boundingBox(),resultsBox=await panel.locator('.ai-results').boundingBox();
 assert.ok(inputBox.height>=180 && inputBox.x>=resultsBox.x && inputBox.x+inputBox.width<=resultsBox.x+resultsBox.width,'editor is anchored over the image, outside the sidebar '+JSON.stringify({inputBox,resultsBox}));
 assert.equal(await editor.evaluate(n=>n===document.activeElement),false,'hover does not steal keyboard focus');
 await page.mouse.move(10,10);await popup.waitFor({state:'hidden'});
 await marker.hover();await editor.click();
 assert.equal(await editor.evaluate(n=>n===document.activeElement),true,'clicking the expanded input starts editing');
 assert.equal(await popup.locator('.ai-workbench-comment > button').count(),0,'no redundant version/type row');
 const close=popup.locator('.ai-comment-popover-close'),del=popup.locator('[data-ai-inline-delete]');
 const a=await close.boundingBox(),b=await del.boundingBox();assert.ok(a.x-b.x-b.width<10 && Math.abs(a.y-b.y)<2,'close and delete are adjacent '+JSON.stringify({a,b}));
 await editor.fill('코멘트 입력 유지');
 await page.mouse.move(10,10);await page.waitForTimeout(250);
 assert.equal(await popup.isVisible(),true,'editing remains open after pointer leaves');
 await editor.dispatchEvent('keydown',{key:'Escape',isComposing:true,bubbles:true,cancelable:true});
 assert.equal(await popup.isVisible(),true,'IME Escape does not delete');
 await close.click();assert.equal(await popup.isVisible(),false);
 assert.ok((await snapshot(page))[0].generated[0].comments.some(c=>c.text==='코멘트 입력 유지'),'close preserves the comment');
 await panel.locator('.is-ai-active-candidate .ai-comment-marker').first().click();
 await editor.press('Escape');assert.equal(await popup.isVisible(),false);assert.equal(await panel.isVisible(),true);
 assert.equal((await snapshot(page))[0].generated[0].comments.length,0,'Escape removes only the selected comment');
 await panel.locator('[data-ai-model]').selectOption('gpt-6-luna',{force:true});
 await pan.click();assert.equal(await pan.getAttribute('aria-pressed'),'true');
 await panel.locator('[data-ai-mark-leaders]').selectOption('remove',{force:true});
 assert.equal(await panel.locator('[data-ai-mark-leaders]').inputValue(),'remove');
 await panel.locator('.ai-task-add').click();
 await page.waitForFunction(()=>{const row=document.querySelector('#ai-image-panel .ai-task-tab.is-on:not(.ai-task-add)');return row&&!['task-0','task-1'].includes(row.dataset.tabId);});
 assert.equal(await pan.getAttribute('aria-pressed'),'false','a new task starts neutral');
 assert.equal(await panel.locator('[data-ai-model]').inputValue(),'gpt-6.1-sol','new task uses Sol 6.1');
 assert.equal(await visibility.getAttribute('aria-pressed'),'false');
 assert.equal(await panel.locator('[data-ai-mark-leaders]').inputValue(),'keep','a new task preserves guides');
 const blank=panel.locator('.ai-task-tab.is-on:not(.ai-task-add)');
 assert.equal(await blank.locator('.ai-task-tab-thumb-frame img').count(),0);
 await page.evaluate(async()=>{await window.__localToolsManager.attachReference({src:window.__task5Expected[0].attachments[0].data,name:'나중에 추가한 원본'});});
 await page.waitForFunction(()=>{const img=document.querySelector('#ai-image-panel .ai-task-tab.is-on .ai-task-tab-thumb-frame img');return img?.complete&&img.naturalWidth===512;});
 assert.ok((await blank.locator('.ai-task-tab-thumb-frame img').getAttribute('src')).startsWith('data:image/png'));
 await panel.locator('[data-tab-id="task-0"] .ai-task-tab-select').click();
 await selected(page,'candidate-0');
 assert.equal(await panel.locator('[data-ai-model]').inputValue(),'gpt-6-luna','existing explicit model choice survives');
 assert.equal(await pan.getAttribute('aria-pressed'),'true','an explicit new-version pan preference survives task switches');
 assert.equal(await panel.locator('[data-ai-mark-leaders]').inputValue(),'remove','an explicit removal preference survives task switches');
 await page.screenshot({path:path.join(evidence,engine,'screen-followup-defaults.png')});
 assert.deepEqual(errors,[]);
});

for (const engine of ['chromium','webkit']) test(`${engine}: restored side panels, comments and stable comparison`, {timeout:60000}, async t => {
 const {page,errors}=await fixture(t,engine),panel=page.locator(active);
 assert.ok(await panel.locator('.ai-comment-tools-label').isVisible(),'point, box and free tools have a visible comment heading');
 const layout=await page.evaluate(()=>{
   const p=document.querySelector('#ai-image-panel'),box=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};};
   return {workspace:box(p.querySelector('.ai-workspace')),results:box(p.querySelector('.ai-results')),tasks:box(p.querySelector('.ai-task-rail')),request:box(p.querySelector('.ai-conversation'))};
 });
 assert.ok(layout.tasks.x+layout.tasks.w<=layout.results.x+2,JSON.stringify(layout));
 assert.ok(layout.results.x+layout.results.w<=layout.request.x+2,JSON.stringify(layout));
 assert.ok(Math.abs(layout.results.h-layout.workspace.h)<2 && layout.tasks.y===layout.request.y,JSON.stringify(layout));
 assert.ok(layout.tasks.w<layout.workspace.w*.2 && layout.request.w<layout.workspace.w*.3);
 await panel.locator('[data-ai-zoom-action="fit"]').click();
 const g=await geometry(page), count=(await snapshot(page)).length;
 assert.equal(await panel.locator('[data-ai-reuse-source], [data-ai-manual-split], [data-ai-task-export-mode], [data-ai-task-export]').count(),0,'unrequested tools are removed');
 await page.mouse.move(g.image.x+g.image.width*.4,g.image.y+g.image.height*.4);await page.mouse.down();await page.mouse.move(g.image.x+g.image.width*.7,g.image.y+g.image.height*.6,{steps:5});await page.mouse.up();
 assert.equal((await snapshot(page)).length,count,'preview dragging cannot add a work task');
 assert.equal(await panel.locator('.is-ai-active-source img').getAttribute('draggable'),'false');
 await panel.locator('[data-ai-comment-tool="free"]').click();
 const b=await page.locator(image).boundingBox();
 await page.mouse.move(b.x+b.width*.2,b.y+b.height*.2);await page.mouse.down();
 for(const [x,y] of [[.4,.2],[.3,.4],[.2,.2]])await page.mouse.move(b.x+b.width*x,b.y+b.height*y,{steps:4});
 await page.mouse.up();await panel.locator('[data-ai-inline-editor]').fill('자유 영역 확인');
 assert.equal(await panel.locator('[data-ai-comment-geometry]').count(),0);
 assert.ok((await snapshot(page))[0].generated[0].comments.at(-1).polygon.length>=3);
 await page.keyboard.press('Escape');assert.equal(await panel.locator('[data-ai-comment-popover]').isVisible(),false);assert.equal(await panel.isVisible(),true);
 assert.equal(await panel.locator('[data-ai-comment-tool="pan"]').getAttribute('aria-pressed'),'false');
 assert.equal((await snapshot(page))[0].generated[0].comments.some(c=>c.text==='자유 영역 확인'),false,'Escape deletes the selected comment');
 const erase=panel.locator('[data-ai-local-erase]');await erase.click();
 await panel.locator('[data-ai-erase-mode="rect"]').click();
 await lasso(page,[{x:75,y:75},{x:140,y:100}]);
 await saveEraseDraft(page);
 const firstErase=await panel.getAttribute('data-ai-selected-candidate-id');
 assert.equal(await erase.getAttribute('aria-pressed'),'false','saving selects the new version and closes the tool');
 await erase.click();
 await lasso(page,[{x:180,y:145},{x:235,y:195}]);
 await saveEraseDraft(page);
 assert.notEqual(await panel.getAttribute('data-ai-selected-candidate-id'),firstErase);
 const erased=(await snapshot(page))[0].generated.at(-1);assert.equal(erased.labelPlan,null);
 assert.equal(await page.locator(image).getAttribute('src'),erased.data,'displayed pixels are the persisted erased version');
 await erase.click();await page.keyboard.press('Escape');assert.equal(await erase.getAttribute('aria-pressed'),'false');assert.equal(await panel.isVisible(),true);
 await panel.locator('.ai-compare-menu summary').click();await panel.locator('[data-ai-layout-mode="stacked"]').click();
 assert.equal(await panel.locator('.ai-results').evaluate(n=>n.classList.contains('mode-stacked')),true);
 const panes=await panel.locator('.ai-image-pane').evaluateAll(ns=>ns.map(n=>{const b=n.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height};}));
 assert.ok(panes[1].y>=panes[0].y+panes[0].h-2);
 await panel.locator('.ai-compare-menu summary').click();await panel.locator('[data-ai-layout-mode="side-by-side"]').click();
 await panel.locator('[data-ai-zoom-action="fit"]').click();
 const dimensions=await panel.locator('.is-ai-active-source .ai-preview-stage > img, .is-ai-active-candidate .ai-preview-stage > img').evaluateAll(ns=>ns.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));
 assert.equal(dimensions.length,2);assert.ok(Math.abs(dimensions[0].w-dimensions[1].w)<2,JSON.stringify(dimensions));
 await page.screenshot({path:path.join(evidence,engine,'restored-side-panels.png')});
 // The user preferred side panels specifically because the app is often enlarged.
 await page.evaluate(()=>document.documentElement.style.setProperty('--ui-zoom','1.5'));
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const enlarged=await panel.boundingBox();assert.ok(enlarged);
 assert.ok(enlarged.x>=-1 && enlarged.y>=-1 && enlarged.x+enlarged.width<=1441 && enlarged.y+enlarged.height<=1001,JSON.stringify(enlarged));
 const beforeCollapse=await panel.locator('.ai-results').boundingBox();
 await panel.locator('[data-panel-toggle="right"]').click();
 await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.rightCollapsed==='true');
 const afterCollapse=await panel.locator('.ai-results').boundingBox();
 assert.ok(afterCollapse.width>beforeCollapse.width+250,'hiding the enlarged settings panel gives its width back to the picture');
 await panel.locator('[data-panel-toggle="right"]').click();
 await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.rightCollapsed==='false');
 assert.ok(await panel.locator('.ai-conversation').isVisible());
 await page.screenshot({path:path.join(evidence,engine,'restored-enlarged.png')});
 await page.evaluate(()=>document.documentElement.style.removeProperty('--ui-zoom'));
 assert.equal((await snapshot(page)).length,count,'no source-reuse side effect');
 assert.deepEqual(await panel.locator('select[data-ai-empty-import] option').allTextContents(),['이미지 불러오기','라이브러리에서 불러오기','파일 탐색기에서 불러오기']);
 const tabs=await snapshot(page);assert.ok(tabs.some(t=>t.generated?.some(c=>c.id==='candidate-0')),'existing result remains available');
 await page.setViewportSize({width:740,height:900});await page.screenshot({path:path.join(evidence,engine,'restored-mobile.png')});
 assert.deepEqual(errors,[]);
});

for (const engine of ['chromium','webkit']) test(`${engine}: local erasing preserves the editable label layer`, {timeout:60000}, async t => {
 const {page,errors}=await fixture(t,engine),panel=page.locator(active);
 await panel.locator('[data-tab-id="task-1"] .ai-task-tab-select').click();await selected(page,'candidate-1');
 const parent=(await snapshot(page))[1].generated[0],toggle=panel.locator('[data-ai-label-toggle]');
 if(await toggle.getAttribute('aria-checked')==='false')await toggle.click();
 await page.waitForFunction(data=>{const img=document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img');return img.complete && img.src!==data;},parent.data);
 assert.notEqual((await geometry(page)).src,parent.data,'the visible preview includes the label layer');
 const before=parent.data;await panel.locator('[data-ai-local-erase]').click();await panel.locator('[data-ai-erase-mode=rect]').click();
 const points=[{x:150,y:35},{x:345,y:135}];await lasso(page,points);
 await saveEraseDraft(page);
 const child=(await snapshot(page))[1].generated.at(-1);
 assert.deepEqual(child.labelPlan.labels,parent.labelPlan.labels,'the saved version retains editable labels');
 assert.equal(child.labelPlan.localEditOrigin.candidateId,parent.id);
 await page.waitForFunction(data=>{const img=document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img');return img.complete && img.src!==data;},child.data);
 const pixels=await page.evaluate(async({before,after,points})=>{
  const {decodeScopedPng}=await import('/js/ai-scoped-edit-png.js?v=1.7.0-four-session-integration'),{rectanglePixelMask}=await import('/js/image-erase-mask.js?v=1.7.0-four-session-integration');
  const read=async src=>decodeScopedPng(new Uint8Array(await (await fetch(src)).arrayBuffer()));
  const a=await read(before),b=await read(after),mask=rectanglePixelMask(a.width,a.height,points);let outsideChanges=0,erased=0;
  for(let i=0;i<mask.length;i++){if(!mask[i])for(let c=0;c<4;c++)outsideChanges+=Number(a.data[i*4+c]!==b.data[i*4+c]);else erased+=Number(a.data[i*4+3]>0 && b.data[i*4+3]===0);}
  return {outsideChanges,erased};
 },{before,after:child.data,points:child.scopedEditHistory.at(-1).points});
 assert.equal(pixels.outsideChanges,0,'the unflattened bitmap stays unchanged outside the erasure');assert.ok(pixels.erased>0);
 assert.deepEqual((await snapshot(page))[1].generated[0].labelPlan,parent.labelPlan,'the parent retains editable labels');assert.deepEqual(errors,[]);
});

for (const engine of ['chromium','webkit']) test(`${engine}: refinement numbering, compact comparison and removed controls`, {timeout:60000}, async t => {
 const {page,errors}=await fixture(t,engine),panel=page.locator(active);
 const pins=panel.locator('.is-ai-active-candidate .ai-comment-marker');
 const pop=panel.locator('[data-ai-comment-popover]'),editor=pop.locator('textarea');
 assert.equal(await panel.locator('[data-ai-reuse-source], [data-ai-manual-split], [data-ai-task-export-mode], [data-ai-task-export]').count(),0);
 await panel.locator('[data-ai-comment-visibility]').click();
 await pins.first().click();await editor.fill('첫 코멘트');await pop.locator('.ai-comment-popover-close').click();
 const addPoint=async(x,y,text)=>{
  if(await pop.isVisible())await pop.locator('.ai-comment-popover-close').click();
  const tool=panel.locator('[data-ai-comment-tool="point"]');if(await tool.getAttribute('aria-pressed')!=='true')await tool.click();
  const box=await page.locator(image).boundingBox();await page.mouse.click(box.x+box.width*x,box.y+box.height*y);await editor.fill(text);
 };
 await addPoint(.55,.3,'둘째 코멘트');await addPoint(.7,.65,'셋째 코멘트');
 assert.deepEqual(await pins.allTextContents(),['1','2','3']);
 await page.screenshot({path:path.join(evidence,engine,'refinement-comment-sidebar.png')});
 await pins.filter({hasText:/^2$/}).click();await pop.locator('[data-ai-inline-delete]').click();
 assert.deepEqual(await pins.allTextContents(),['1','2']);
 await pins.filter({hasText:/^2$/}).click();assert.equal(await editor.getAttribute('aria-label'),'코멘트 2 내용');
 assert.equal(await editor.inputValue(),'셋째 코멘트');
 let comments=(await snapshot(page))[0].generated[0].comments;
 assert.deepEqual(comments.map(c=>c.number),[1,3],'internal keys stay stable after deletion');
 const prompt=await page.evaluate(async comments=>{const {buildCommentRequest}=await import('/js/ai-image-comments.js');return buildCommentRequest([{id:'c',kind:'generated',name:'선택 버전',comments}]);},comments);
 assert.match(prompt,/점 2 .*셋째 코멘트/);assert.doesNotMatch(prompt,/점 3 /);
 await editor.press('Escape');await pins.first().click();await editor.press('Escape');
 assert.equal(await pins.count(),0);await addPoint(.5,.5,'다시 시작');assert.deepEqual(await pins.allTextContents(),['1']);
 await pop.locator('.ai-comment-popover-close').click();
 const tabs=await snapshot(page),first=tabs[0],latest=first.generated.at(-1).id,original=first.attachments[0].id;
 const openCompare=async()=>{await panel.locator('.ai-compare-menu summary').click();await panel.locator('[data-ai-compare]').click();};
 await openCompare();const comp=panel.locator('.ai-comparison'),selects=comp.locator('select');
 await page.waitForFunction(()=>[...document.querySelectorAll('.ai-comparison image')].every(n=>n.getAttribute('href')));
 assert.equal(await selects.nth(0).inputValue(),original);assert.equal(await selects.nth(1).inputValue(),latest);
 assert.match(await selects.nth(0).getAttribute('title'),/512 × 384 px/);
 const row=await comp.locator('.ai-comparison-controls').boundingBox(),toolbar=await comp.locator('.ai-comparison-toolbar').boundingBox();
 assert.ok(row.height<=40 && Math.abs(row.y-toolbar.y)<=4,'single compact desktop row '+JSON.stringify({row,toolbar}));
 await selects.nth(1).selectOption(first.generated[0].id);assert.equal(await selects.nth(1).inputValue(),first.generated[0].id);
 await openCompare();await openCompare();assert.equal(await selects.nth(1).inputValue(),latest,'reopening resets to latest');
 await page.screenshot({path:path.join(evidence,engine,'refinement-compare-desktop.png')});
 await page.setViewportSize({width:740,height:900});
 const bounds=await comp.boundingBox(),controls=await comp.locator('.ai-comparison-controls').boundingBox();assert.ok(controls.x+controls.width<=bounds.x+bounds.width+1);
 await page.screenshot({path:path.join(evidence,engine,'refinement-compare-narrow.png')});
 assert.deepEqual(errors,[]);
});

for (const engine of ['chromium','webkit']) test(`${engine}: empty workbench stays split and Space places then opens image destinations`, {timeout:60000}, async t => {
 const {page,errors}=await fixture(t,engine),panel=page.locator(active);
 await panel.locator('.ai-task-add').click();
 await page.waitForFunction(()=>document.querySelector('#ai-image-panel')?.dataset.aiStage==='empty');
 assert.equal(await panel.locator('.ai-rail-heading > strong').textContent(),'이미지 작업대');
 assert.equal(await panel.locator('.ai-task-add').textContent(),'＋ 이미지 추가');
 assert.equal(await panel.getAttribute('data-ai-layout'),'side-by-side');
 assert.equal(await panel.locator('[data-ai-fixed-speed], [data-ai-help-title="속도"]').count(),0);
 assert.equal(await panel.locator('[data-ai-send]').isVisible(),false,'one primary action in the footer');
 assert.equal(await panel.locator('[data-ai-comments-apply]').isVisible(),true);
 const boxes=()=>panel.evaluate(p=>Object.fromEntries(['.ai-original-pane','.ai-result-pane','.ai-conversation','.ai-compact-settings','.ai-side-tabs','.ai-workbench-actions'].map(s=>{
  const r=p.querySelector(s).getBoundingClientRect();return[s,{x:r.x,y:r.y,w:r.width,h:r.height}];
 })));
 const before=await boxes();assert.ok(before['.ai-original-pane'].w>200);
 assert.ok(before['.ai-original-pane'].x+before['.ai-original-pane'].w<=before['.ai-result-pane'].x+2);
 await page.screenshot({path:path.join(evidence,engine,'empty-split.png')});
 await page.evaluate(async()=>window.__localToolsManager.attachReference({src:window.__task5Expected[0].attachments[0].data,name:'빈 작업대에 추가'}));
 await page.waitForFunction(()=>document.querySelector('#ai-image-panel')?.dataset.aiStage==='preparation');
 const after=await boxes();for(const key of Object.keys(before))for(const axis of ['x','y','w','h'])assert.ok(Math.abs(before[key][axis]-after[key][axis])<2,`${key}.${axis}: ${JSON.stringify({before,after})}`);
 await page.screenshot({path:path.join(evidence,engine,'source-added-same-layout.png')});
 await panel.locator('[data-ai-workflow="graph"]').click();
 await page.waitForFunction(()=>document.querySelector('#ai-image-panel')?.dataset.aiWorkflow==='graph');
 assert.equal(await panel.locator('.ai-rail-heading > strong').textContent(),'그래프 작업대');
 assert.equal(await panel.getAttribute('data-ai-layout'),'side-by-side');
 assert.equal(await panel.locator('[data-ai-send]').isVisible(),true,'graph conversion keeps its primary action');
 await page.evaluate(async()=>{
  const {chooseWorkbenchAssignment}=await import('/js/library/workbench-assignment.js?v=1.7.0-four-session-integration');
  window.openAssignment=(count=3,options={})=>{window.assignmentResult=undefined;window.assignmentPromise=chooseWorkbenchAssignment({references:Array.from({length:count},(_,i)=>({name:'기본 이미지 '+i,data:window.__task5Expected[0].attachments[0].data})),...options}).then(r=>window.assignmentResult=r);};
  window.openAssignment();
 });
 const assignment=page.locator('.workbench-assignment');await assignment.waitFor();
 assert.equal(await assignment.locator('[data-default-kind="image"]').count(),3);
 assert.equal(await assignment.locator('[data-action="continue"]').isEnabled(),true);
 await placePendingAndOpen(page,assignment);
 assert.deepEqual(await page.evaluate(()=>window.assignmentResult),{conversionKind:'image',placement:'separate',groups:[[0],[1],[2]],groupKinds:['image','image','image']});
 await page.evaluate(()=>window.openAssignment(4));await assignment.waitFor();
 await assignment.locator('[data-classify-reference="0"][data-conversion-kind="graph"]').click();
 await assignment.locator('[data-classify-reference="1"][data-conversion-kind="image"]').click();
 await assignment.locator('[data-select-reference="2"]').click();
 await assignment.locator('[data-bench="0"]').click();
 await assignment.locator('[data-action="cancel"]').last().click();
 assert.equal(await page.evaluate(()=>window.assignmentResult),null);
 await page.evaluate(()=>window.openAssignment(4));await assignment.waitFor();
 assert.equal(await assignment.locator('[data-default-kind="image"]').count(),1,'draft keeps explicit choices and the remaining default');
 await placePendingAndOpen(page,assignment);
 assert.deepEqual(await page.evaluate(()=>window.assignmentResult),{conversionKind:'image',placement:'advanced',groups:[[1,2],[3],[0]],groupKinds:['image','image','graph']});
 await page.evaluate(()=>window.openAssignment(1,{allowConversionChoice:false}));await assignment.waitFor();
 assert.equal(await assignment.locator('[data-conversion-kind="graph"]').count(),0);
 await placePendingAndOpen(page,assignment);
 assert.deepEqual(await page.evaluate(()=>window.assignmentResult.groups),[[0]]);
 assert.deepEqual(errors,[]);
});

for (const engine of ['chromium','webkit']) test(`${engine}: eraser boundary diagnosis and explicit draft save`, {timeout:60000}, async t => {
 const {page,errors}=await fixture(t,engine),panel=page.locator(active);
 const before=(await snapshot(page))[0].generated.length,src=await page.locator(image).getAttribute('src');
 const erase=panel.locator('[data-ai-local-erase]'),save=panel.locator('[data-ai-edit-save]');
 await erase.click();await panel.locator('[data-ai-erase-mode="rect"]').click();
 await lasso(page,[{x:75,y:-18},{x:140,y:100}]);
 assert.equal(await save.isVisible(),false,'gestures starting outside the image are ignored');
 assert.equal(await page.locator(image).getAttribute('src'),src);
 if(await erase.getAttribute('aria-pressed')!=='true') await erase.click();
 await lasso(page,[{x:75,y:75},{x:140,y:140}]);
 await save.waitFor();await page.waitForFunction(()=>!document.querySelector('#ai-image-panel [data-ai-edit-save]').disabled);
 assert.equal((await snapshot(page))[0].generated.length,before,'erasing is a draft until explicitly saved');
 assert.notEqual(await page.locator(image).getAttribute('src'),src);
 await save.click();
 await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId.startsWith('generated-'));
 const versions=(await snapshot(page))[0].generated;
 assert.equal(versions.length,before+1);assert.equal(versions.at(-1).engine,'local-erase');
 assert.equal(versions.at(-1).scopedEditHistory.at(-1).operation,'local-rect-erase');
 assert.deepEqual(errors,[]);
});

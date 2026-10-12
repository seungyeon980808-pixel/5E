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

for (const engine of ['chromium','webkit']) test(`${engine}: restored side panels, comments, original reuse and stable comparison`, {timeout:60000}, async t => {
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
 const exportBox=await panel.locator('.is-ai-active-candidate [data-ai-canvas-output]').boundingBox();assert.ok(exportBox);assert.ok(Math.abs(exportBox.x+exportBox.width-(g.image.x+g.image.width))<40 && exportBox.y<g.image.y+45,'export is at the upper right of the picture');
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
 assert.equal(await panel.locator('[data-ai-comment-tool="pan"]').getAttribute('aria-pressed'),'true');
 const erase=panel.locator('[data-ai-local-erase]');await erase.click();
 await lasso(page,[{x:75,y:-18},{x:140,y:35},{x:140,y:100},{x:75,y:100}]);
 await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId.startsWith('generated-'));
 const firstErase=await panel.getAttribute('data-ai-selected-candidate-id');assert.equal(await erase.getAttribute('aria-pressed'),'true');
 await lasso(page,[{x:180,y:145},{x:235,y:145},{x:235,y:195},{x:180,y:195}]);
 await page.waitForFunction(id=>document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId!==id,firstErase);
 assert.equal(await erase.getAttribute('aria-pressed'),'true');
 const erased=(await snapshot(page))[0].generated.at(-1);assert.equal(erased.labelPlan,null);
 assert.equal(await page.locator(image).getAttribute('src'),erased.data,'displayed pixels are the persisted erased version');
 await page.keyboard.press('Escape');assert.equal(await erase.getAttribute('aria-pressed'),'false');assert.equal(await panel.isVisible(),true);
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
 await panel.locator('[data-ai-reuse-source]').click();assert.equal((await snapshot(page)).length,count+1);
 assert.deepEqual(await panel.locator('select[data-ai-empty-import] option').allTextContents(),['이미지 불러오기','라이브러리에서 불러오기','파일 탐색기에서 불러오기']);
 const tabs=await snapshot(page);assert.ok(tabs.some(t=>t.generated?.some(c=>c.id==='candidate-0')),'existing result remains available');
 await page.setViewportSize({width:740,height:900});await page.screenshot({path:path.join(evidence,engine,'restored-mobile.png')});
 assert.deepEqual(errors,[]);
});

for (const engine of ['chromium','webkit']) test(`${engine}: local erasing uses the visible label composite`, {timeout:60000}, async t => {
 const {page,errors}=await fixture(t,engine),panel=page.locator(active);
 await panel.locator('[data-tab-id="task-1"] .ai-task-tab-select').click();await selected(page,'candidate-1');
 const parent=(await snapshot(page))[1].generated[0],toggle=panel.locator('[data-ai-label-toggle]');
 if(await toggle.getAttribute('aria-checked')==='false')await toggle.click();
 await page.waitForFunction(data=>{const img=document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img');return img.complete && img.src!==data;},parent.data);
 const before=(await geometry(page)).src;await panel.locator('[data-ai-local-erase]').click();
 const points=[{x:150,y:35},{x:345,y:35},{x:345,y:135},{x:150,y:135}];await lasso(page,points);
 await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId.startsWith('generated-'));
 const child=(await snapshot(page))[1].generated.at(-1);assert.equal(child.labelPlan,null);
 const pixels=await page.evaluate(async({before,after,points})=>{
  const {decodeScopedPng}=await import('/js/ai-scoped-edit-png.js?v=1.7.0-four-session-integration'),{polygonPixelMask}=await import('/js/polygon-mask.js?v=1.7.0-four-session-integration');
  const read=async src=>decodeScopedPng(new Uint8Array(await (await fetch(src)).arrayBuffer()));
  const a=await read(before),b=await read(after),mask=polygonPixelMask(a.width,a.height,points);let outsideChanges=0,erased=0;
  for(let i=0;i<mask.length;i++){if(!mask[i])for(let c=0;c<4;c++)outsideChanges+=Number(a.data[i*4+c]!==b.data[i*4+c]);else erased+=Number(a.data[i*4+3]>0 && b.data[i*4+3]===0);}
  return {outsideChanges,erased};
 },{before,after:child.data,points:child.scopedEditHistory.at(-1).polygon});
 assert.equal(pixels.outsideChanges,0,'everything outside the erasure matches the displayed labels and picture');assert.ok(pixels.erased>0);
 assert.deepEqual((await snapshot(page))[1].generated[0].labelPlan,parent.labelPlan,'the parent retains editable labels');assert.deepEqual(errors,[]);
});

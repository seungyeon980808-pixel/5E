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

for (const engine of ['chromium','webkit']) test(`${engine}: brush strokes, rectangle, white/transparent, outside start and cancellation`,{timeout:120000},async t=>{
  const {page,errors}=await fixture(t,engine),panel=page.locator(active),erase=panel.locator('[data-ai-local-erase]');
  await page.evaluate(()=>Promise.allSettled(document.getAnimations().map(a=>a.finished)));const before=await snapshot(page),header=(await geometry(page)).header;
  await erase.click();assert.equal(await panel.locator('button[data-ai-erase-mode=brush]').getAttribute('aria-pressed'),'true');
  await panel.locator('[data-ai-erase-size]').fill('12');assert.equal(await panel.locator('[data-ai-erase-size-value]').textContent(),'12 px');
  const read=async src=>page.evaluate(async src=>{const {decodeScopedPng}=await import('/js/ai-scoped-edit-png.js?v=1.7.0-four-session-integration');const d=await decodeScopedPng(new Uint8Array(await(await fetch(src)).arrayBuffer()));return {width:d.width,height:d.height,data:[...d.data]};},src);
  const stroke=async points=>{const old=await panel.getAttribute('data-ai-selected-candidate-id');await lasso(page,points);await page.waitForFunction(id=>document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId!==id,old);return(await snapshot(page))[0].generated.at(-1);};
  const brush=await stroke([{x:65,y:80},{x:200,y:80},{x:200,y:220},{x:65,y:220},{x:65,y:80}]);
  assert.equal(brush.scopedEditHistory[0].operation,'local-brush-erase');const pixels=await read(brush.data);assert.equal(pixels.data[(150*512+132)*4+3],255,'closed brush loop keeps its center');
  const h=brush.scopedEditHistory[0],original=await read(before[0].generated[0].data);let inside=0;
  for(let y=0;y<384;y++)for(let x=0;x<512;x++){
    const onStroke=h.points.slice(1).some((b,i)=>{const a=h.points[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x+.5-a.x)*dx+(y+.5-a.y)*dy)/(dx*dx+dy*dy)||0));return Math.hypot(x+.5-a.x-t*dx,y+.5-a.y-t*dy)<=h.diameter/2+1e-8;});
    const at=(y*512+x)*4;if(onStroke){assert.deepEqual(pixels.data.slice(at,at+4),[0,0,0,0]);inside++;}else assert.deepEqual(pixels.data.slice(at,at+4),original.data.slice(at,at+4));
  }
  assert.equal(inside,h.maskedPixels);assert.deepEqual((await snapshot(page))[1],before[1]);assert.deepEqual((await snapshot(page))[0].generated[0],before[0].generated[0]);
  await panel.locator('[data-ai-erase-background]').selectOption('white');const white=await stroke([{x:65,y:80},{x:200,y:80}]);const whitePixels=await read(white.data);assert.deepEqual(whitePixels.data.slice((80*512+100)*4,(80*512+100)*4+4),[255,255,255,255]);
  await panel.locator('button[data-ai-erase-mode=rect]').click();assert.equal(await panel.locator('[data-ai-erase-size]').isDisabled(),true);
  await panel.locator('[data-ai-erase-background]').selectOption('transparent');const rect=await stroke([{x:300,y:260},{x:245,y:230}]);assert.equal(rect.scopedEditHistory[0].operation,'local-rect-erase');const rectPixels=await read(rect.data);assert.equal(rectPixels.data[(245*512+270)*4+3],0);
  await panel.locator('button[data-ai-erase-mode=brush]').click();const outside=await stroke([{x:100,y:-18},{x:100,y:45}]);assert.ok(outside.scopedEditHistory[0].points[0].y<0,'outside coordinates stay outside instead of snapping to an edge');
  const count=(await snapshot(page))[0].generated.length;await lasso(page,[{x:100,y:160},{x:200,y:160}],false);await page.keyboard.press('Escape');await page.mouse.up();assert.equal((await snapshot(page))[0].generated.length,count);assert.equal(await panel.locator('.ai-local-erase-overlay').count(),0);assert.equal(await panel.isVisible(),true);assert.equal(await panel.locator('[data-ai-local-erase-options]').isVisible(),false);
  assert.deepEqual((await geometry(page)).header,header,'tool settings never change the image fitting header');assert.equal(await page.evaluate(()=>window.__task2.sends.length),0);assert.deepEqual(errors,[]);
  await erase.click();await page.screenshot({path:path.join(evidence,engine,'brush-settings.png')});
});

for (const engine of ['chromium','webkit']) test(`${engine}: label switch, scoped settings and isolated local erasure through real workbench controls`, {timeout:150000}, async t => {
  const {page,errors}=await fixture(t,engine);
  const toggle=page.locator(`${active} [data-ai-label-toggle]`);
  assert.equal(await toggle.isDisabled(),true);
  await page.locator(`${active} [data-ai-zoom-action="in"]`).click();
  const base=await geometry(page);
  for(let i=0;i<3;i++){
    await selectVersion(page,'candidate-empty-plan'); const next=await geometry(page);
    assert.equal(next.header.height,base.header.height); assert.deepEqual(next.image,base.image); assert.deepEqual(next.zoom,base.zoom);
    await selectVersion(page,'candidate-0');
  }
  assert.equal((await geometry(page)).compositeCalls,0,'empty frozen plans never rasterize labels');
  await page.locator(`${active} [data-tab-id="task-1"] .ai-task-tab-select`).click();await selected(page,'candidate-1');
  await page.waitForFunction(()=>window.__compositeCalls===1);
  const labeled=await geometry(page);
  const advanced=page.locator(`${active} [data-ai-scoped-advanced]`), precision=page.locator(`${active} [data-ai-precision-settings]`);
  await page.locator(`${active} .is-ai-active-candidate button[data-ai-comment-marker]`).first().hover();
  await precision.waitFor({state:'visible'});
  assert.equal(await advanced.getAttribute('open'),null);assert.equal(await precision.getAttribute('open'),null,'existing precision checks do not force open experiment settings');
  await advanced.locator('summary').click();
  const mode=page.locator(`${active} [data-ai-scoped-prompt-mode]`);
  await mode.waitFor({state:'visible'}).catch(async error=>{fs.writeFileSync(path.join(evidence,engine,'advanced.json'),JSON.stringify(await advanced.evaluate(node=>({html:node.outerHTML,children:[...node.querySelectorAll('*')].map(n=>({tag:n.tagName,hidden:n.hidden,display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility,rect:JSON.stringify(n.getBoundingClientRect())}))})),null,2));throw error;});
  assert.equal(await mode.isVisible(),true);
  await advanced.locator('summary').click();
  for(let i=0;i<3;i++){
    await toggle.click();assert.equal(await toggle.getAttribute('aria-checked'),'false');
    await toggle.click();assert.equal(await toggle.getAttribute('aria-checked'),'true');
  }
  assert.equal((await geometry(page)).compositeCalls,1,'repeated toggles reuse the in-flight/finished composite');
  assert.deepEqual((await geometry(page)).header,labeled.header);assert.deepEqual((await geometry(page)).image,labeled.image);assert.deepEqual((await geometry(page)).zoom,labeled.zoom);
  await toggle.click(); // Persist label OFF across a task round trip and reload.
  await page.locator(`${active} [data-tab-id="task-0"] .ai-task-tab-select`).click();await selected(page,'candidate-0');
  await page.locator(`${active} [data-tab-id="task-1"] .ai-task-tab-select`).click();await selected(page,'candidate-1');
  assert.equal(await toggle.getAttribute('aria-checked'),'false');
  assert.equal((await geometry(page)).compositeCalls,1);
  await page.locator(`${active} [data-tab-id="task-0"] .ai-task-tab-select`).click();await selected(page,'candidate-0');
  const before=await snapshot(page); const comments=before[0].generated[0].comments.length;
  const erase=page.locator(`${active} [data-ai-local-erase]`);
  await erase.click();assert.equal(await erase.getAttribute('aria-pressed'),'true');await page.locator(`${active} [data-ai-erase-mode=rect]`).click();
  await lasso(page,[{x:75,y:35},{x:140,y:100}]);
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId.startsWith('generated-')).catch(async error=>{fs.writeFileSync(path.join(evidence,engine,'erase-trace.json'),JSON.stringify(await page.evaluate(()=>({trace:window.__eraseTrace,geometry:[...document.querySelectorAll('#ai-image-panel .is-ai-active-candidate .ai-preview-stage')].map(n=>({rect:JSON.stringify(n.getBoundingClientRect()),cls:n.className,img:n.querySelector('img')?.src.slice(0,80)})),status:document.querySelector('#ai-image-panel [data-ai-status]')?.textContent})),null,2));throw error;});
  const after=await snapshot(page), result=after[0].generated.at(-1);
  assert.equal(after[0].generated.length,before[0].generated.length+1);
  assert.deepEqual(after[1],before[1],'the other task is not modified');
  assert.equal(after[0].attachments[0].data,before[0].attachments[0].data);
  assert.deepEqual(after[0].generated.slice(0,-1),before[0].generated,'all original candidate metadata and pixels remain intact');
  assert.equal(after[0].generated[0].comments.length,comments,'erasure cannot create a comment box');
  assert.equal(result.scopedEditHistory.at(-1).operation,'local-rect-erase');assert.equal(result.reviewState,'scoped-applied');
  assert.notEqual(result.data,before[0].generated[0].data);
  assert.equal(await page.locator(`${active} [data-ai-comments-apply]`).textContent(),'수정하기');
  assert.equal(await page.locator(`${active} [data-ai-comments-apply]`).isDisabled(),true);
  assert.match(await page.locator(`${active} [data-ai-scoped-apply-hint]`).textContent(),/영역/);
  // Cancel a gesture by changing the selected version. The old captured pointer
  // must not create either an erased version or a request box on release.
  assert.equal(await erase.getAttribute('aria-pressed'),'true','eraser stays active after creating a revision');
  await lasso(page,[{x:100,y:100},{x:170,y:100},{x:170,y:170}],false);
  await page.evaluate(()=>{const p=document.querySelector('#ai-image-panel');p.dataset.aiSelectedCandidateId='candidate-0';p.aiWorkbench.restoreViewState({...p.aiWorkbench.getViewState(),selectedCandidateId:'candidate-0'});p.dispatchEvent(new CustomEvent('5e:ai-candidate-select',{detail:{candidateId:'candidate-0'}}));});
  await page.mouse.up();await selected(page,'candidate-0');
  assert.equal((await snapshot(page))[0].generated.length,after[0].generated.length);
  assert.equal(await page.locator(`${active} .ai-local-erase-overlay`).count(),0);
  await selectVersion(page,result.id);
  const downloadPromise=page.waitForEvent('download');await page.locator(`${active} [data-ai-save-selected]`).click();
  const download=await downloadPromise;const downloadPath=await download.path();
  assert.equal(fs.readFileSync(downloadPath).toString('base64'),result.data.split(',')[1],'PNG export uses the erased bytes');
  await page.locator(`${active} .is-ai-active-candidate [data-ai-canvas-output]`).click();
  await page.waitForFunction(()=>window.__localToolsState.get().objects.some(o=>o.aiCandidateId?.startsWith('generated-')));
  const inserted=await page.evaluate(id=>window.__localToolsState.get().objects.find(o=>o.aiCandidateId===id)?.src,result.id);
  assert.equal(inserted,result.data,'canvas insertion uses the same erased bytes');
  assert.equal(await page.evaluate(()=>window.__task2.sends.length),0,'local tools never call AI');
  await page.locator('#ai-image-install-open').click();
  await selected(page,result.id);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__localToolsManager);await page.evaluate(()=>window.__localToolsManager.sharingSnapshot());
  await page.locator('#ai-image-install-open').click();await selected(page,result.id);
  const recovered=await snapshot(page);
  assert.equal(recovered[0].generated.at(-1).data,result.data,'the edited version survives persistent recovery');
  assert.equal(recovered[0].generated.at(-1).scopedEditHistory.at(-1).parentCandidateId,'candidate-0');
  await selectVersion(page,'candidate-0');assert.equal((await geometry(page)).src,before[0].generated[0].data,'previous version restores untouched pixels');
  await page.locator(`${active} [data-tab-id="task-1"] .ai-task-tab-select`).click();await selected(page,'candidate-1');
  assert.equal(await toggle.getAttribute('aria-checked'),'false','label OFF survives persisted workspace recovery');
  await page.setViewportSize({width:800,height:900});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const compact = await page.locator(`${active} .ai-result-pane .ai-pane-head`).evaluate(header=>{
    const tools=header.querySelector('[data-ai-result-tools]').getBoundingClientRect(),r=header.getBoundingClientRect();
    return {left:tools.left,right:tools.right,headerLeft:r.left,headerRight:r.right,height:r.height};
  });
  assert.ok(compact.left>=compact.headerLeft && compact.right<=compact.headerRight,'result tools fit the narrow pane without clipping');
  assert.equal(compact.height,base.header.height);
  assert.equal(await erase.getAttribute('aria-label'),'지우개','compact icon retains its accessible name');
  await page.screenshot({path:path.join(evidence,engine,'compact.png')});
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(evidence,engine,'result.json'),JSON.stringify({headerHeight:base.header.height,noLabelRoundTrips:3,compositeCallsBeforeReload:1,changedPixels:result.scopedEditHistory.at(-1).changedPixels,exportAndInsertionMatch:true,previousVersionRestored:true,noAiCalls:true,errors},null,2));
});

for (const engine of ['chromium','webkit']) test(`${engine}: R01–R07 follow-up labels, compact views and location-bound comment editing`, {timeout:120000}, async t => {
  const {page,errors}=await fixture(t,engine);
  const panel=page.locator(active), popup=panel.locator('[data-ai-comment-popover]');
  assert.equal(await panel.locator('[data-ai-zoom-linked], [data-ai-connection-open], .ai-comments-list-section').count(),0);
  assert.equal(await panel.locator('[data-ai-exam-send]').count(),1,'task-owned HWP output remains available in the header');
  await page.evaluate(async()=>{await Promise.allSettled(document.getAnimations().map(a=>a.finished)); await new Promise(r=>requestAnimationFrame(r));});
  const coverage=await panel.locator('.ai-workbench').evaluate(n=>({rect:n.getBoundingClientRect().toJSON(),width:innerWidth,height:innerHeight,main:getComputedStyle(document.querySelector('.app-shell-header')).visibility}));
  assert.ok(Math.abs(coverage.rect.top)<1 && Math.abs(coverage.rect.height-coverage.height)<2,'AI workbench fills the application');
  assert.equal(coverage.main,'hidden');
  for(const mode of ['source','result']) { await panel.locator(`[data-ai-layout-mode="${mode}"]`).click(); assert.equal(await panel.getAttribute('data-ai-layout'),mode); }
  await panel.locator('.ai-compare-menu summary').click(); await panel.locator('[data-ai-layout-mode="side-by-side"]').click();
  assert.equal(await panel.getAttribute('data-ai-layout'),'side-by-side');
  await panel.locator('.ai-compare-menu summary').click(); await panel.locator('[data-ai-compare]').click();
  assert.equal(await panel.locator('.ai-results').getAttribute('class').then(v=>v.includes('is-wipe-comparing')),true);
  assert.equal(await panel.locator('[data-ai-layout-mode][aria-pressed="true"]').count(),0,'slider comparison is the sole selected view');
  await panel.locator('[data-ai-layout-mode="result"]').click();
  await panel.locator('[data-tab-id="task-1"] .ai-task-tab-select').click(); await selected(page,'candidate-1');
  const pin=panel.locator('.is-ai-active-candidate button[data-ai-comment-marker]').first();
  await pin.hover(); await popup.waitFor({state:'visible'});
  const editor=popup.locator('[data-ai-inline-editor]');
  await editor.hover(); await editor.fill('사각형 추가 · 위치 코멘트에서 편집');
  await page.setViewportSize({width:1280,height:900});
  await editor.press('End'); await editor.press('!');
  assert.equal(await editor.inputValue(),'사각형 추가 · 위치 코멘트에서 편집!','typing survives geometry changes');
  await page.screenshot({path:path.join(evidence,engine,'r07-comment.png')});
  await editor.press('Escape'); assert.equal(await popup.isVisible(),false);
  await pin.focus(); await pin.press('Enter'); assert.equal(await popup.isVisible(),true);
  // This scenario verifies label ownership, not the seeded zero-distance move check.
  await popup.locator('[data-ai-precision-settings] summary').click();
  await popup.locator('[data-ai-precision-kind]').selectOption('');
  await popup.locator('.ai-comment-popover-close').click();
  const parent=(await snapshot(page))[1].generated[0];
  const toggle=panel.locator('[data-ai-label-toggle]'); await toggle.click();
  assert.equal(await toggle.getAttribute('aria-checked'),'false');
  await panel.locator('[data-ai-comments-apply]').click();
  await page.waitForFunction(()=>window.__task2.sends.length===1);
  await page.evaluate(()=>{window.__task2.emit(0,'image');window.__task2.emit(0,'done');});
  await page.getByRole('dialog',{name:'수정 전후 비교'}).waitFor();
  await page.getByRole('button',{name:'적용',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false' && document.querySelectorAll('#ai-image-panel .ai-generated-card').length===2);
  const tab=(await snapshot(page))[1], child=tab.generated.at(-1);
  assert.deepEqual(child.labelPlan.labels,parent.labelPlan.labels,'follow-up preserves label text and positions');
  assert.deepEqual(tab.generated[0].labelPlan,parent.labelPlan,'parent label plan remains unchanged');
  assert.equal(child.labelPlan.reviewRequired,true,'revision does not inherit a provider QA pass');
  assert.equal(child.reviewState,'scoped-applied');
  assert.equal(await toggle.isEnabled(),true); assert.equal(await toggle.getAttribute('aria-checked'),'false');
  await toggle.click(); await selected(page,child.id);
  assert.equal(await toggle.getAttribute('aria-checked'),'true');
  await selectVersion(page,parent.id); assert.equal(await toggle.getAttribute('aria-checked'),'false');
  await selectVersion(page,child.id); assert.equal(await toggle.getAttribute('aria-checked'),'true');
  await panel.locator('.ai-compare-menu summary').click(); await panel.locator('[data-ai-layout-mode="side-by-side"]').click();
  await panel.locator('[data-ai-zoom-action="in"]').click();
  const synchronized=await page.evaluate(()=>document.querySelector('#ai-image-panel').aiWorkbench.getViewState());
  assert.equal(synchronized.zoom.source,synchronized.zoom.result); assert.equal(synchronized.tracking,true);
  await panel.locator('.ai-compare-menu summary').click(); await panel.locator('.ai-compare-menu summary').press('Escape');
  assert.equal(await panel.locator('.ai-compare-menu').getAttribute('open'),null); assert.equal(await panel.isVisible(),true);
  await page.evaluate(()=>document.querySelector('#ai-image-panel').aiWorkbench.restoreViewState({layout:'side-by-side',tracking:false,zoom:{source:3,result:1}}));
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel .is-ai-active-source').scrollWidth>document.querySelector('#ai-image-panel .is-ai-active-source').clientWidth);
  const sourceCard=panel.locator('.is-ai-active-source').first(); await sourceCard.hover(); await page.mouse.wheel(100,120);
  await page.waitForFunction(()=>{const p=document.querySelector('#ai-image-panel'),a=p.querySelector('.is-ai-active-source'),b=p.querySelector('.is-ai-active-candidate');return a.scrollTop>0 && Math.abs(a.scrollTop-b.scrollTop)<=1 && Math.abs(a.scrollLeft-b.scrollLeft)<=1;});
  const restoredTracking=await page.evaluate(()=>document.querySelector('#ai-image-panel').aiWorkbench.getViewState());
  assert.equal(restoredTracking.zoom.source,restoredTracking.zoom.result); assert.equal(restoredTracking.tracking,true);
  await page.screenshot({path:path.join(evidence,engine,'r01-follow-up-labels.png')});
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForFunction(()=>window.__localToolsManager);
  await page.locator('#ai-image-install-open').click(); await selected(page,child.id);
  assert.deepEqual((await snapshot(page))[1].generated.at(-1).labelPlan.labels,parent.labelPlan.labels,'labels survive persistent recovery');
  await panel.locator('[data-ai-close]').click();
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel').hidden);
  assert.equal(await page.locator('.app-shell-header').evaluate(n=>getComputedStyle(n).visibility),'visible');
  assert.deepEqual(errors,[]);
});

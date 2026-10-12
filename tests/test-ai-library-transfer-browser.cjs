const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const test = require('node:test');
const playwright = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { installCropFixture, pointerOnImage } = require('./helpers/crop-loading-fixture.cjs');
const root = path.resolve(__dirname, '..');
process.env.APP_ENTRY ??= '/';
const { fixtureContext, installAiMain } = require('./helpers/canonical-fixture-adapter.cjs');
const { runtime, inspectEntry } = fixtureContext(root);
async function fixture(t, engine = 'chromium') {
  const server = http.createServer((req, res) => {
    let file = path.join(root, new URL(req.url, 'http://localhost').pathname);
    if (file.endsWith('/')) file += 'index.html';
    fs.readFile(file, (err, body) => { res.writeHead(err ? 404 : 200, { 'Content-Type': ({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream' }); res.end(err ? '' : body); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await playwright[engine].launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => console.error(error.message));
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  process.env.PREVIEW_URL = origin + '/preview/';
  t.after(async () => {
    if (process.env.EVIDENCE_DIR) {
      fs.mkdirSync(process.env.EVIDENCE_DIR, {recursive:true});
      await page.screenshot({path:path.join(process.env.EVIDENCE_DIR, t.name.replace(/[^a-z0-9]+/gi,'-') + '.png')});
    }
    await browser.close(); await new Promise(resolve => server.close(resolve));
  });
  return { page, origin };
}
async function crop(page, ui, fraction = .25) {
  const { point } = await pointerOnImage(page, ui, fraction);
  await page.mouse.down(); await page.mouse.move(point.x + 80, point.y + 90, { steps: 5 }); await page.mouse.up();
  await ui.locator('[data-unilib-crop-save]').click();
}
async function library(t, count = 1, engine = 'chromium') {
  const { page } = await fixture(t, engine);
  const ui = await installCropFixture(page, { libraryTransfer: true, evidence: process.env.EVIDENCE_DIR });
  await page.evaluate(() => { window.__transfer = async () => {
    window.__transferStarted = true;
    if (window.__transferGate) await window.__transferGate;
    if (window.__failTransfer) {
      const error = new Error('fixture transfer failed');
      error.transferredReferenceIndices = window.__partial || [];
      throw error;
    }
    window.__transfers = (window.__transfers || 0) + 1;
  }; });
  for (let index = 0; index < count; index++) await crop(page, ui, .2 + index * .2);
  await ui.locator('[data-unilib-crop-workbench]').click();
  return { page, ui };
}
test('successful transfer clears the accepted crop tray on reopen and preserves the PDF source', async t => {
  const { page, ui } = await library(t);
  await ui.locator('[data-unilib-ai]').click();
  await page.locator('.workbench-assignment [data-action="continue"]').click();
  await ui.waitFor({state:'hidden'});
  await page.evaluate(() => window.cropFixture.open());
  assert.equal(await page.evaluate(() => window.__acceptedAssets.size), 0);
  assert.equal(await ui.locator('[data-result-id="geometry-book:page:1"]').count(), 1);
});
test('failed transfer keeps crops and the library open', async t => {
  const { page, ui } = await library(t);
  await page.evaluate(() => window.__failTransfer = true);
  await ui.locator('[data-unilib-ai]').click();
  await page.locator('.workbench-assignment [data-action="continue"]').click();
  await page.waitForFunction(() => document.querySelector('[data-unilib-status]').textContent.includes('failed'));
  assert.equal(await ui.isVisible(), true);
  assert.equal(await page.evaluate(() => window.__acceptedAssets.size), 1);
});
test('cancelled multi-crop assignment retains every crop', async t => {
  const { page, ui } = await library(t, 2);
  await ui.locator('[data-unilib-ai]').click();
  await page.locator('.workbench-assignment [data-action="cancel"]').last().click();
  assert.equal(await page.evaluate(() => window.__acceptedAssets.size), 2);
  assert.equal(await ui.isVisible(), true);
});
async function manager(t, engine = 'chromium') {
  const { page, origin } = await fixture(t, engine);
  await page.addInitScript(() => {
    localStorage.setItem('5e.tutorial.bannerSeen','true'); localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true'); localStorage.setItem('5e.preview:5e.mode','pro');
    window.__fixtureProviderCalls = [];
    window.fiveEDesktop = { web: true, status: async () => ({login:{loggedIn:true},server:true}), models:async()=>({data:[]}), account:async()=>({}), send:async payload=>{window.__fixtureProviderCalls.push(payload);throw new Error('Unexpected controlled generation during library ownership test');}, interrupt:async()=>({ok:true}), onEvent:()=>()=>{}, onState:()=>()=>{}, onLog:()=>()=>{} };
  });
  await installAiMain(page, root, { seedReady: false, manager: '__manager', state: null }, process.env.EVIDENCE_DIR);
  await page.route('**/js/ai-panel.js*', route => route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'js/ai-panel.js'),'utf8').replace('    await workspaceReady;\n    syncLiteModeUi();', '    await workspaceReady;\n    if (window.__failImport && references.some(reference => reference.name === "fail")) throw new Error("fixture import failed");\n    syncLiteModeUi();')}));
  if (process.env.TRANSFER_BASELINE) await page.route('**/js/ai-task-workspaces.js*', route => route.fulfill({contentType:'text/javascript',body:require('node:child_process').execFileSync('git',['show','HEAD:preview/js/ai-task-workspaces.js'],{cwd:root,encoding:'utf8'})}));
  const entryReceipt = await inspectEntry(page, origin, runtime);
  if(process.env.EVIDENCE_DIR) fs.writeFileSync(path.join(process.env.EVIDENCE_DIR, 'manager-entry.json'), JSON.stringify(entryReceipt,null,2));
  await page.waitForFunction(() => window.__manager);
  return page;
}

async function liveHandoffLibrary(t, engine) {
  const page = await manager(t, engine);
  await page.evaluate(async () => {
    const { createUnifiedLibraryUi } = await import(window.__runtime.base + 'unified-library-ui.js' + window.__runtime.query);
    const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 800;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 600, 800);
    ctx.fillStyle = '#1665aa'; ctx.fillRect(100, 100, 150, 150);
    const dataUrl = canvas.toDataURL();
    const source = { provider: 'pdf', documentId: 'handoff-book', pageNumber: 1 };
    const file = { id: 'handoff-book', kind: 'pdf', title: 'Handoff source', pageCount: 1,
      documentId: 'handoff-book', sourceId: 'source', provenance: source,
      getPageGeometry: () => ({ width: 600, height: 800 }),
      loadPreview: async () => ({dataUrl, provenance: source, result: {id: 'page-1', kind: 'page', provenance: source}}) };
    const provider = { getSources: () => [], getExamFilterOptions: () => ({ academicYears: [] }),
      search: () => [], listPdfFiles: () => [file], materialize: () => file.loadPreview() };
    window.__liveLibrary = createUnifiedLibraryUi({ getProvider: async () => provider, insertMaterialized: async () => {},
      openIndependentReferences: options => window.__manager.openIndependentReferences(options) });
    await window.__liveLibrary.open();
    window.__lateral = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function(frames, options) {
      const animation = animate.call(this, frames, options);
      if (frames?.[0]?.translate === '0px' && frames?.[1]?.translate === '-48px'
        || frames?.[0]?.translate === '48px' && frames?.[1]?.translate === '0px') {
        window.__lateral.push({frames, animation, source: this.classList.contains('unilib'),
          libraryVisible: !window.__liveLibrary.element.hidden,
          targetVisible: !document.getElementById('ai-image-panel').hidden,
          targetReady: document.getElementById('ai-image-panel').dataset.modalMotionState === 'open'});
      }
      return animation;
    };
  });
  const ui = page.locator('.unified-library-overlay').last();
  await ui.locator('[data-unilib-type="pdf"]').click();
  await ui.locator('[data-result-id="handoff-book:page:1"]').click();
  await ui.locator('[data-unilib-adjust]').click();
  await ui.locator('[data-unilib-crop-load-state]').waitFor({state:'hidden'});
  await crop(page, ui);
  await ui.locator('[data-unilib-crop-workbench]').click();
  return {page, ui};
}

for (const engine of ['chromium', 'webkit']) test(`${engine}: prepared library handoff slides into the real AI workbench and survives reopening`, async t => {
  const {page, ui} = await liveHandoffLibrary(t, engine);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await ui.locator('[data-unilib-ai]').click();
  await page.locator('.workbench-assignment [data-action="continue"]').click();
  await page.waitForFunction(() => window.__lateral.length === 2);
  const opening = await page.evaluate(() => window.__lateral.map(({frames, source, libraryVisible, targetVisible, targetReady}) => ({frames, source, libraryVisible, targetVisible, targetReady})));
  assert.deepEqual(opening.map(item => item.source), [true, false]);
  assert.ok(opening.every(item => item.libraryVisible && item.targetVisible && item.targetReady), 'no blank destination or competing pop entrance');
  await ui.waitFor({state:'hidden'});
  assert.equal(await page.locator('#ai-image-panel').isVisible(), true);
  assert.equal(await page.locator('[data-library-ai-handoff]').count(), 0);
  assert.deepEqual(await page.evaluate(() => window.__lateral.map(({animation}) => animation.playState)), ['idle','idle']);
  assert.equal(await page.evaluate(async () => (await window.__manager.sharingSnapshot()).workspaces[0].tabs[0].attachments.length), 1);
  assert.equal(await page.evaluate(() => window.__fixtureProviderCalls.length), 0);
  assert.equal(await page.locator('.modal-ai').first().evaluate(el => el.style.translate), '');

  // Reversing the source close must release both translate effects immediately.
  await page.evaluate(async () => {
    await window.__liveLibrary.open();
    window.__liveLibrary.close({restoreFocus:false,aiHandoff:true});
    window.__liveLibrary.open();
  });
  await page.waitForFunction(() => window.__liveLibrary.element.dataset.modalMotionState === 'open');
  assert.equal(await ui.isVisible(), true);
  assert.equal(await page.locator('[data-library-ai-handoff]').count(), 0);
  assert.ok(await page.evaluate(() => window.__lateral.every(({animation}) => animation.playState === 'idle')));
  assert.equal(await ui.locator('[data-result-id="handoff-book:page:1"]').count(), 1);
  await page.evaluate(() => {window.__liveLibrary.close({restoreFocus:false,aiHandoff:true}); document.getElementById('ai-image-panel').hidden=true;});
  await page.waitForFunction(() => !document.querySelector('[data-library-ai-handoff]'));
  assert.ok(await page.evaluate(() => window.__lateral.every(({animation}) => animation.playState === 'idle')), 'closing the target releases the source motion too');
});

for (const engine of ['chromium', 'webkit']) test(`${engine}: reduced motion library handoff keeps the real workbench stationary`, async t => {
  const {page, ui} = await liveHandoffLibrary(t, engine);
  await ui.locator('[data-unilib-ai]').click();
  await page.locator('.workbench-assignment [data-action="continue"]').click();
  await ui.waitFor({state:'hidden'});
  assert.equal(await page.locator('#ai-image-panel').isVisible(), true);
  assert.equal(await page.evaluate(() => window.__lateral.length), 0);
  assert.equal(await page.locator('[data-library-ai-handoff]').count(), 0);
  assert.equal(await page.evaluate(async () => (await window.__manager.sharingSnapshot()).workspaces[0].tabs[0].attachments.length), 1);
});
test('initial empty workspace is reused for a single reference and persists without a blank neighbor', async t => {
  const page = await manager(t);
  const result = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 20;
    await window.__manager.openIndependentReferences({references:[{dataUrl:c.toDataURL(),name:'crop'}]});
    const state = await window.__manager.sharingSnapshot(); await window.__manager.checkpointForClose();
    return {workspaces:state.workspaces.length, tabs:state.workspaces.map(w=>w.tabs.length)};
  });
  assert.deepEqual(result, {workspaces:1,tabs:[1]});
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(() => window.__manager);
  assert.equal(await page.evaluate(async () => (await window.__manager.sharingSnapshot()).workspaces.length), 1);
});

test('multi-crop success removes only the transferred snapshot and retains a concurrently added crop', async t => {
  const { page, ui } = await library(t, 2);
  await page.evaluate(() => { window.__transferGate = new Promise(resolve => window.__releaseTransfer = resolve); });
  await ui.locator('[data-unilib-ai]').click();
  await page.locator('.workbench-assignment [data-action="continue"]').click();
  await page.waitForFunction(() => window.__transferStarted);
  await page.evaluate(() => {
    const entry = structuredClone([...window.__acceptedAssets.values()][0]);
    entry.result.id = 'concurrent-crop';
    window.__acceptedAssets.set(entry.result.id, entry);
    window.__releaseTransfer();
  });
  await page.waitForFunction(() => window.__acceptedAssets.size === 1);
  assert.deepEqual(await page.evaluate(() => [...window.__acceptedAssets.keys()]), ['concurrent-crop']);
  assert.equal(await ui.isVisible(), true);
});

test('partial multi-crop failure retains only unsent crops and keeps the library open', async t => {
  const { page, ui } = await library(t, 2);
  const ids = await page.evaluate(() => [...window.__acceptedAssets.keys()]);
  await page.evaluate(() => { window.__failTransfer = true; window.__partial = [0]; });
  await ui.locator('[data-unilib-ai]').click();
  await page.locator('.workbench-assignment [data-action="continue"]').click();
  await page.waitForFunction(() => document.querySelector('[data-unilib-status]').textContent.includes('failed'));
  assert.deepEqual(await page.evaluate(() => [...window.__acceptedAssets.keys()]), [ids[1]]);
  assert.equal(await ui.isVisible(), true);
});

test('multiple independent references preserve a prompt-only workspace', async t => {
  const page = await manager(t);
  const result = await page.evaluate(async () => {
    await window.__manager.open({prompt:'keep this draft'});
    const c = document.createElement('canvas'); c.width = c.height = 20;
    await window.__manager.openIndependentReferences({references:[{dataUrl:c.toDataURL(),name:'first'},{dataUrl:c.toDataURL(),name:'second'}]});
    return (await window.__manager.sharingSnapshot()).workspaces.map(w=>({input:w.tabs[0].input, count:w.tabs[0].attachments.length}));
  });
  assert.deepEqual(result, [{input:'keep this draft',count:0},{input:'',count:1},{input:'',count:1}]);
});

test('failed imports remove newly created empty workspaces and retain earlier successful transfers across reload', async t => {
  const page = await manager(t);
  const result = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 20;
    window.__failImport = true;
    let transferred;
    try { await window.__manager.openIndependentReferences({references:[{dataUrl:c.toDataURL(),name:'first'},{dataUrl:c.toDataURL(),name:'fail'}]}); }
    catch(error) { transferred = error.transferredReferenceIndices; }
    const snapshot = await window.__manager.sharingSnapshot();
    return {transferred, workspaces:snapshot.workspaces.length, counts:snapshot.workspaces.map(w=>w.tabs[0].attachments.length), registry:JSON.parse(localStorage.getItem('5e.aiParallelWorkspaces.v1'))};
  });
  assert.deepEqual(result, {transferred:[0],workspaces:1,counts:[1],registry:[]});
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(() => window.__manager);
  assert.equal(await page.evaluate(async () => (await window.__manager.sharingSnapshot()).workspaces.length), 1);
});

test('a busy reference consumer rejects the handoff instead of acknowledging a discarded image', async t => {
  const page = await manager(t);
  const result = await page.evaluate(async () => {
    const { createUnifiedAiSourceConsumer } = await import(window.__runtime.base + 'ai-panel.js' + window.__runtime.query);
    const consumer = createUnifiedAiSourceConsumer({addReferencesAsTasks:()=>[],setStatus:()=>{}});
    try { consumer.onAddMany([{data:'sample'}], {placement:'separate'}); return 'accepted'; }
    catch(error) { return error.message; }
  });
  assert.match(result, /받지 못했습니다/);
});

for (const engine of ['chromium', 'webkit']) test(`${engine}: prepared library crops open AI with Space while text fields retain input`, async t => {
  const { page, ui } = await library(t, 2, engine);
  await page.evaluate(() => { window.__transfer = async ({references, conversionKind, placement, groups}) => { window.__handoff = {count:references.length, conversionKind, placement, groups}; }; });
  const search=ui.locator('input[type="search"]');
  await search.focus();await page.keyboard.press('Space');
  assert.equal(await page.locator('.workbench-assignment').count(),0,'typing Space in search cannot send images');
  await search.fill('');
  await ui.locator('[data-result-id="geometry-book:page:1"]').focus();
  await page.keyboard.down('Space');await page.keyboard.down('Space');await page.keyboard.up('Space');
  await page.locator('.workbench-assignment').waitFor();
  assert.equal(await page.locator('.workbench-assignment').count(),1,'a held key opens one assignment');
  assert.equal(await page.locator('.workbench-assignment [data-conversion-kind="image"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.workbench-assignment [data-placement="separate"]').getAttribute('aria-pressed'),'true');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>window.__acceptedAssets.size),2,'cancel preserves both crops');
  await ui.locator('[data-result-id="geometry-book:page:1"]').focus();await page.keyboard.press('Space');
  await page.locator('.workbench-assignment [data-action="continue"]').click();
  await ui.waitFor({state:'hidden'});
  const handoff=await page.evaluate(()=>window.__handoff);
  assert.equal(handoff.count,2);assert.equal(handoff.conversionKind,'image');assert.equal(handoff.placement,'separate');assert.deepEqual(handoff.groups,[[0],[1]]);
});

for (const engine of ['chromium','webkit']) test(`${engine}: assignment defaults are visible and route changes keep the same restrained selection`, async t => {
  const {page,ui}=await library(t,2,engine);
  await page.evaluate(()=>{window.__transfer=async({references,conversionKind,placement,groups})=>{window.__handoff={count:references.length,conversionKind,placement,groups};};});
  await ui.locator('[data-unilib-ai]').click();
  const dialog=page.locator('.workbench-assignment');await dialog.waitFor();
  const selectedStyle=async selector=>dialog.locator(selector).evaluate(n=>{const s=getComputedStyle(n);return{background:s.backgroundColor,image:s.backgroundImage,shadow:s.boxShadow,border:s.borderColor,check:getComputedStyle(n,'::before').content,animations:n.getAnimations().length};});
  const defaultImage=await selectedStyle('[data-conversion-kind="image"]'),defaultSeparate=await selectedStyle('[data-placement="separate"]');
  assert.equal(defaultImage.image,'none');assert.equal(defaultImage.shadow,'none');assert.equal(defaultSeparate.shadow,'none');assert.equal(defaultSeparate.animations,0);assert.match(defaultImage.check,/✓/);assert.match(defaultSeparate.check,/✓/);
  await dialog.locator('[data-placement="together"]').click();
  assert.deepEqual(await selectedStyle('[data-placement="together"]'),defaultSeparate,'an explicit choice is styled just as clearly as the default');
  await dialog.locator('[data-conversion-kind="graph"]').click();
  assert.deepEqual(await selectedStyle('[data-conversion-kind="graph"]'),defaultImage);
  const send=await selectedStyle('[data-action="continue"]');assert.equal(send.image,'none');assert.equal(send.shadow,'none');
  if(process.env.EVIDENCE_DIR)await page.screenshot({path:path.join(process.env.EVIDENCE_DIR,engine+'-assignment-selection.png')});
  await dialog.locator('[data-action="continue"]').click();await ui.waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(()=>window.__handoff),{count:2,conversionKind:'graph',placement:'together',groups:[[0,1]]});
});

for(const engine of ['chromium','webkit']) test(`${engine}: a selected PDF crop inserts exact bytes into the canvas without an AI handoff`,async t=>{
  const {page}=await fixture(t,engine);
  const ui=await installCropFixture(page,{libraryTransfer:true});
  await page.evaluate(async()=>{
    const {createStore}=await import(window.cropFixtureReceipt.moduleUrl.replace('unified-library-ui.js','store.js'));
    const {insertImageFromSrc}=await import(window.cropFixtureReceipt.moduleUrl.replace('unified-library-ui.js','image-paste.js'));
    const {unifiedLibrarySourceMetadata}=await import(window.cropFixtureReceipt.moduleUrl);
    window.__canvasState=createStore({activePageId:'canvas-page',objects:[],pages:[{id:'canvas-page'}],artboard:{w:600,h:400},layers:[{id:'layer-1'}],activeLayerId:'layer-1',undoStack:[],redoStack:[],selectedIds:[]});
    window.__insertMaterialized=async(result,asset,options,context)=>{
      window.__sentCrop={data:asset.dataUrl,result:structuredClone(result)};
      await insertImageFromSrc(window.__canvasState,asset.dataUrl,{preserveBytes:true,centerArtboard:true,sourceMetadata:unifiedLibrarySourceMetadata(result,asset),isCurrent:context.isCurrent});
    };
  });
  await crop(page,ui,.2);await crop(page,ui,.4);
  const send=ui.locator('[data-unilib-crop-insert]');assert.ok(await send.isVisible());assert.ok(await send.isDisabled(),'multiple crops require an explicit single selection');
  await ui.locator('[data-unilib-graph-crop]').first().click();assert.equal(await send.isDisabled(),false);
  const expected=await ui.locator('[data-unilib-graph-crop]').first().locator('img').getAttribute('src');
  await send.click();await ui.waitFor({state:'hidden'});
  const result=await page.evaluate(()=>({objects:window.__canvasState.get().objects,sent:window.__sentCrop,ai:window.__transfers||0,retained:window.__acceptedAssets.size}));
  assert.equal(result.objects.length,1);assert.equal(result.objects[0].type,'image');assert.equal(result.objects[0].src,expected);assert.equal(result.objects[0].src,result.sent.data);
  assert.equal(result.objects[0].sourceMetadata.documentId,'geometry-book');assert.equal(result.objects[0].sourceMetadata.pageNumber,1);assert.deepEqual(result.objects[0].sourceMetadata.rect,result.sent.result.provenance.rect);
  assert.equal(result.ai,0);assert.equal(result.retained,2,'inserting a crop keeps its source and the other crop available');
});

for(const engine of ['chromium','webkit']) test(`${engine}: crop insertion failure retains the source and closing cancels pending delivery`,async t=>{
  const {page}=await fixture(t,engine),ui=await installCropFixture(page,{libraryTransfer:true});
  await crop(page,ui,.2);
  await page.evaluate(()=>{window.__insertMaterialized=async()=>{throw new Error('fixture insertion failed');};});
  await ui.locator('[data-unilib-crop-insert]').click();
  await ui.locator('[data-unilib-crop-selection]').filter({hasText:'fixture insertion failed'}).waitFor();
  assert.ok(await ui.isVisible());assert.equal(await page.evaluate(()=>window.__acceptedAssets.size),1);
  await page.evaluate(()=>{window.__insertMaterialized=async(result,asset,options,context)=>{window.__insertStarted=true;await new Promise(r=>window.__releaseInsert=r);window.__mayInsert=context.isCurrent();};});
  await ui.locator('[data-unilib-crop-insert]').click();await page.waitForFunction(()=>window.__insertStarted);
  await page.keyboard.press('Escape');await page.evaluate(()=>window.__releaseInsert());
  await page.waitForFunction(()=>window.__mayInsert===false);
  assert.equal(await page.evaluate(()=>window.__acceptedAssets.size),1,'cancelled delivery keeps the source crop');
});

for(const engine of ['chromium','webkit']) test(`${engine}: the real canvas AI button sends one composed image with its layout intact`,async t=>{
 const page=await manager(t,engine);
 const before=await page.evaluate(async()=>{
   const {state}=await import(window.__runtime.base+'state.js'+window.__runtime.query);
   const square=color=>{const c=document.createElement('canvas');c.width=c.height=20;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,20,20);return c.toDataURL();};
   state.update(s=>{s.layers=[{id:1,visible:true},{id:2,visible:false}];s.objects=[
     {id:'red',type:'image',src:square('#ff0000'),x:-25,y:-10,w:20,h:20,layerId:1,order:0},
     {id:'blue',type:'image',src:square('#0000ff'),x:5,y:-10,w:20,h:20,layerId:1,order:1},
     {id:'bar',type:'rect',x:-2,y:-5,w:4,h:10,fill:'#000000',stroke:'none',strokeWidth:0,layerId:1,order:2},
     {id:'hidden',type:'rect',x:-25,y:-10,w:50,h:20,fill:'#00ff00',layerId:2,order:3}];s.selectedIds=['red','blue','bar'];});
   window.__compositionState=state;return JSON.stringify(state.get().objects);
 });
 await page.locator('#ai-image-install-open').click();await page.locator('#ai-image-panel').waitFor({state:'visible'});
 await page.waitForFunction(async()=>{const snap=await window.__manager.sharingSnapshot();return snap.workspaces.some(w=>w.tabs.some(t=>t.attachments.length===1));});
 const result=await page.evaluate(async()=>{
   const snap=await window.__manager.sharingSnapshot(),tab=snap.workspaces.flatMap(w=>w.tabs).find(t=>t.attachments.length===1),reference=tab.attachments[0];
   const img=new Image();img.src=reference.data;await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
   const pixel=(x,y)=>Array.from(ctx.getImageData(Math.round(c.width*x),Math.round(c.height*y),1,1).data);
   return {reference,generated:tab.generated.length,pixels:[pixel(.2,.5),pixel(.5,.5),pixel(.8,.5)],ratio:c.width/c.height,objects:JSON.stringify(window.__compositionState.get().objects),providerCalls:window.__fixtureProviderCalls.length};
 });
 assert.equal(result.reference.sourceKind,'canvas-composition');assert.deepEqual(result.reference.source.objectIds,['red','blue','bar']);assert.equal(result.generated,0);assert.equal(result.providerCalls,0);
 assert.deepEqual(result.pixels,[[255,0,0,255],[0,0,0,255],[0,0,255,255]]);assert.ok(result.ratio>2.2&&result.ratio<2.5);assert.equal(result.objects,before);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const test = require('node:test');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { installCropFixture, pointerOnImage } = require('./helpers/crop-loading-fixture.cjs');
const { classifyAll } = require('./helpers/workbench-assignment.cjs');
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
  await classifyAll(page.locator('.workbench-assignment'));
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
  await classifyAll(page.locator('.workbench-assignment'));
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
  // 참고 이미지 열기(open) 첫 단계 바로 뒤에 가짜 가져오기 실패를 넣는다. 사이에 줄이 더 생겨도(예: 설명으로 만들기의 새 탭) 맞도록
  // 'await workspaceReady;' 다음 줄들 중 syncLiteModeUi() 전까지를 찾고, 바꾸지 못하면 검사가 바로 실패하게 한다(조용히 넘어가지 않게).
  const panelSource=fs.readFileSync(path.join(root,'js/ai-panel.js'),'utf8');
  const patchedPanel=panelSource.replace(/(    await workspaceReady;\n)((?:    (?!syncLiteModeUi\(\);).*\n){0,3}    syncLiteModeUi\(\);)/, '$1    if (window.__failImport && references.some(reference => reference.name === "fail")) throw new Error("fixture import failed");\n$2');
  assert.notEqual(patchedPanel, panelSource, 'fixture failure hook must be injected into ai-panel.js open()');
  await page.route('**/js/ai-panel.js*', route => route.fulfill({contentType:'text/javascript',body:patchedPanel}));
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
  await page.keyboard.press('Space');
  const next=page.locator('.workbench-assignment [data-action="continue"]');await next.waitFor();
  // Pending crops default to the image workbench; Space is available but only places them.
  assert.equal(await page.locator('.workbench-assignment [data-default-kind="image"]').count(),1);
  assert.equal(await next.isEnabled(),true);
  await classifyAll(page.locator('.workbench-assignment'));
  assert.equal(await next.getAttribute('aria-keyshortcuts'),'Space');
  await page.keyboard.press('Space');
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
  await classifyAll(page.locator('.workbench-assignment'));
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
  await classifyAll(page.locator('.workbench-assignment'));
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
  await classifyAll(page.locator('.workbench-assignment'));
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
  const beforeSearch=await page.evaluate(()=>window.cropFixtureLog.length);
  await search.fill('');
  await ui.locator('[data-result-id="geometry-book:page:1"]').focus();
  await page.keyboard.down('Space');await page.keyboard.down('Space');await page.keyboard.up('Space');
  await page.locator('.workbench-assignment').waitFor();
  assert.equal(await page.locator('.workbench-assignment').count(),1,'a held key opens one assignment');
  assert.equal(await page.locator('.workbench-assignment [data-references] [data-reference]').count(),2);
  assert.equal(await page.locator('.workbench-assignment [data-default-kind="image"]').count(),2);
  assert.equal(await page.locator('.workbench-assignment [data-action="continue"]').isEnabled(),true);
  await page.keyboard.press('Space');
  assert.equal(await page.locator('.workbench-assignment').isVisible(),true,'first Space only places pending crops');
  assert.equal((await page.locator('.workbench-assignment [data-pending-count]').textContent()).trim(),'0개');
  assert.equal(await page.locator('.workbench-assignment [data-benches] [data-reference]').count(),2);
  assert.equal(await page.evaluate(()=>window.__handoff),undefined,'placing crops never sends them');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>window.__acceptedAssets.size),2,'cancel preserves both crops');
  await ui.locator('[data-result-id="geometry-book:page:1"]').focus();await page.keyboard.press('Space');
  await page.locator('.workbench-assignment').waitFor();
  // Let the pending search finish while assignment is open: the same selected
  // source must keep this transaction valid regardless of machine speed.
  await page.evaluate(after=>window.waitCropEvent({phase:'search-files'},after),beforeSearch);
  await ui.locator('[data-unilib-result-state]').waitFor({state:'hidden'});
  await classifyAll(page.locator('.workbench-assignment'));
  await page.locator('.workbench-assignment [data-action="continue"]').click();
  await ui.waitFor({state:'hidden'});
  const handoff=await page.evaluate(()=>window.__handoff);
  assert.equal(handoff.count,2);assert.equal(handoff.conversionKind,'image');assert.equal(handoff.placement,'separate');assert.deepEqual(handoff.groups,[[0],[1]]);
});

for (const engine of ['chromium','webkit']) test(`${engine}: pending assignment uses border-only selection and preserves the draft after cancel`, async t => {
  const {page,ui}=await library(t,2,engine);
  await page.evaluate(()=>{window.__transfer=async({references,conversionKind,placement,groups})=>{window.__handoff={count:references.length,conversionKind,placement,groups};};});
  await ui.locator('[data-unilib-ai]').click();
  const dialog=page.locator('.workbench-assignment');await dialog.waitFor();
  assert.equal(await dialog.locator('[data-benches] [data-reference], [data-graphs] [data-reference]').count(),0);
  assert.equal(await dialog.locator('[data-placement], [data-action="select-all"]').count(),0);
  const style=()=>dialog.locator('[data-select-reference="0"]').evaluate(async n=>{
    await Promise.all(n.getAnimations().filter(a=>Number.isFinite(a.effect.getTiming().iterations)).map(a=>a.finished));
    const s=getComputedStyle(n), parent=getComputedStyle(n.parentElement);
    return {background:s.backgroundColor,font:s.font,color:s.color,shadow:s.boxShadow,before:getComputedStyle(n,'::before').content,after:getComputedStyle(n,'::after').content,border:parent.borderColor};
  });
  const before=await style();await dialog.locator('[data-select-reference="0"]').click();
  const selected=await style();assert.notEqual(selected.border,before.border);
  delete selected.border;delete before.border;assert.deepEqual(selected,before,'selection changes only the border');
  assert.ok(!JSON.stringify(selected).includes('✓'));assert.equal(selected.shadow,'none');
  await dialog.locator('[data-classify-reference="0"][data-conversion-kind="graph"]').click();
  assert.equal(await dialog.locator('[data-references] [data-reference]').count(),1);
  assert.equal(await dialog.locator('[data-graphs] [data-reference]').count(),1);
  await page.keyboard.press('Escape');
  await ui.locator('[data-unilib-ai]').click();await dialog.waitFor();
  assert.equal(await dialog.locator('[data-graphs] [data-reference="0"]').count(),1,'same crop batch restores classification');
  await dialog.locator('[data-classify-reference="1"][data-conversion-kind="graph"]').click();
  assert.equal(await dialog.locator('[data-graph-destination] .workbench-assignment-bench').count(),0);
  await page.keyboard.press('Space');await ui.waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(()=>window.__handoff),{count:2,conversionKind:'graph',placement:'separate',groups:[[0],[1]]});
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

async function classifyMixed(page) {
  const dialog = page.locator('.workbench-assignment');await dialog.waitFor();
  assert.equal(await dialog.locator('[data-references] [data-reference]').count(),4);
  for (const index of [0,1]) await dialog.locator(`[data-classify-reference="${index}"][data-conversion-kind="image"]`).click();
  // Drop an image into an existing bench through the equivalent keyboard target.
  await dialog.locator('[data-select-reference="1"]').click();
  await dialog.locator('[data-bench="0"]').focus();await page.keyboard.press('Enter');
  for (const index of [2,3]) await dialog.locator(`[data-classify-reference="${index}"][data-conversion-kind="graph"]`).click();
  assert.equal(await dialog.locator('[data-image-destination] .workbench-assignment-bench').count(),1);
  assert.equal(await dialog.locator('[data-image-destination] [data-reference]').count(),2);
  assert.equal(await dialog.locator('[data-graphs] [data-reference]').count(),2);
  assert.equal(await dialog.locator('[data-references] [data-reference]').count(),0);
  assert.equal(await dialog.locator('[data-graph-destination] [data-placement], [data-graph-destination] [data-conversion-kind], [data-graph-destination] .workbench-assignment-bench').count(),0);
  return dialog;
}
for (const engine of ['chromium', 'webkit']) test(`${engine}: common workbench classifies mixed crops and Space forwards both destinations once`, async t => {
  const {page, ui} = await library(t, 4, engine);
  await page.evaluate(() => {window.__transfer = async options => { window.__mixedTransferCount = (window.__mixedTransferCount || 0) + 1; window.__mixedPlan = {groups:options.groups,groupKinds:options.groupKinds}; };});
  await ui.locator('[data-unilib-ai]').click();
  const dialog = await classifyMixed(page);
  if (process.env.EVIDENCE_DIR) {
    for (const [width,height] of [[1440,1000],[1080,800],[390,844]]) {
      await page.setViewportSize({width,height});
      const overflow = await dialog.evaluate(el => el.scrollWidth > el.clientWidth + 1);
      assert.equal(overflow,false,`no dialog overflow at ${width}`);
      await page.screenshot({path:path.join(process.env.EVIDENCE_DIR,`${engine}-classification-${width}.png`)});
    }
    await page.setViewportSize({width:1440,height:1000});
  }
  await dialog.locator('h2').click();
  await page.keyboard.down('Space');await page.keyboard.down('Space');await page.keyboard.up('Space');
  await ui.waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(() => window.__mixedPlan), {groups:[[0,1],[2],[3]],groupKinds:['image','graph','graph']});
  assert.equal(await page.evaluate(() => window.__mixedTransferCount),1);
  assert.equal(await page.evaluate(() => window.__acceptedAssets.size),0);
});

for (const engine of ['chromium','webkit']) test(`${engine}: mixed destinations preserve pixels, image groups and graph list through mode switches and reload`, async t => {
  const page = await manager(t,engine);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(async () => {
    await window.__manager.open({prompt:'보존할 기존 작업'});
    window.__mixedReferences = Array.from({length:4},(_,index)=>{
      const canvas=document.createElement('canvas');canvas.width=90;canvas.height=60;
      const ctx=canvas.getContext('2d');ctx.fillStyle=['red','green','blue','black'][index];ctx.fillRect(0,0,90,60);
      return {dataUrl:canvas.toDataURL(),name:`자료 ${index+1}`,sourceKind:'unified-library',source:{documentId:'mixed-fixture',pageNumber:index+1}};
    });
    const {chooseWorkbenchAssignment}=await import(window.__runtime.base+'library/workbench-assignment.js'+window.__runtime.query);
    void chooseWorkbenchAssignment({references:window.__mixedReferences}).then(async plan=>{
      window.__mixedReceipt=await window.__manager.openIndependentReferences({references:window.__mixedReferences,...plan});
      await window.__manager.checkpointForClose();window.__mixedSaved=true;
    });
  });
  const dialog=await classifyMixed(page);
  await page.keyboard.press('Space');await page.waitForFunction(()=>window.__mixedSaved);
  const inspect=()=>page.evaluate(async()=>{
    const snapshot=await window.__manager.sharingSnapshot();
    return snapshot.workspaces.flatMap(w=>w.tabs).map(t=>({kind:t.conversionKind,input:t.input,names:t.attachments.map(a=>a.name),pixels:t.attachments.map(a=>a.data),pages:t.attachments.map(a=>a.source?.pageNumber)}));
  });
  const saved=await inspect();
  assert.equal(saved.some(t=>t.input==='보존할 기존 작업' && !t.names.length),true);
  assert.deepEqual(saved.filter(t=>t.names.length).map(t=>[t.kind,t.names,t.pages]),[
    ['image',['자료 1','자료 2'],[1,2]],['graph',['자료 3'],[3]],['graph',['자료 4'],[4]],
  ]);
  const expectedPixels=await page.evaluate(()=>window.__mixedReferences.map(r=>r.dataUrl));
  assert.deepEqual(saved.flatMap(t=>t.pixels),expectedPixels);
  assert.deepEqual(await page.evaluate(()=>window.__mixedReceipt.flatMap(r=>r.referenceIndices)),[0,1,2,3]);
  await page.locator('#ai-image-panel [data-ai-workflow="graph"]').click();
  await page.locator('#ai-image-panel [data-ai-workflow="graph"][aria-pressed="true"]').waitFor();
  assert.equal(await page.locator('#ai-image-panel .ai-rail-heading > strong').textContent(),'그래프 작업대');
  assert.equal(await page.locator('#ai-image-panel .ai-task-tab:not(.ai-task-add)').count(),2);
  for (const row of await page.locator('#ai-image-panel .ai-task-tab:not(.ai-task-add) .ai-task-tab-select').all()) await row.click();
  await page.locator('#ai-image-panel [data-ai-workflow="image"]').click();
  await page.locator('#ai-image-panel [data-ai-workflow="image"][aria-pressed="true"]').waitFor();
  assert.equal(await page.locator('#ai-image-panel .ai-task-tab:not(.ai-task-add)').count(),2,'existing draft plus grouped image task');
  await page.evaluate(()=>window.__manager.checkpointForClose());
  await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__manager);
  assert.deepEqual(await inspect(),saved);
  assert.equal(await page.evaluate(()=>window.__fixtureProviderCalls.length),0);
  assert.deepEqual(errors,[]);
});

for (const engine of ['chromium','webkit']) test(`${engine}: a failed mixed import retains its saved group and retries graph destinations without duplication`, async t => {
  const page=await manager(t,engine);
  const result=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=20;canvas.height=20;
    const refs=['first','second','fail','last'].map((name,i)=>{
      const ctx=canvas.getContext('2d');ctx.fillStyle=['red','green','blue','black'][i];ctx.fillRect(0,0,20,20);
      return {name,dataUrl:canvas.toDataURL()};
    });
    const plan={references:refs,groups:[[0,1],[2],[3]],groupKinds:['image','graph','graph'],placement:'advanced',importId:'b3499770-9d48-4619-af24-22a1a6e4ba62'};
    window.__failImport=true;let transferred;
    try {await window.__manager.openIndependentReferences(plan);}catch(error){transferred=error.transferredReferenceIndices;}
    window.__failImport=false;
    const receipt=await window.__manager.openIndependentReferences(plan);
    await window.__manager.checkpointForClose();
    const tabs=(await window.__manager.sharingSnapshot()).workspaces.flatMap(w=>w.tabs).filter(t=>t.attachments.length);
    return {transferred,receipt:receipt.flatMap(r=>r.referenceIndices),tabs:tabs.map(t=>[t.conversionKind,t.attachments.map(a=>a.name)])};
  });
  assert.deepEqual(result,{transferred:[0,1],receipt:[0,1,2,3],tabs:[['image',['first','second']],['graph',['fail']],['graph',['last']]]});
});

for (const engine of ['chromium','webkit']) test(`${engine}: drag assigns, merges and moves crops without duplicates or implicit graph benches`,async t=>{
  const {page,ui}=await library(t,4,engine);
  await ui.locator('[data-unilib-ai]').click();const d=page.locator('.workbench-assignment');await d.waitFor();
  const drag=async(index,target)=>d.locator(`[data-reference="${index}"]`).dragTo(d.locator(target));
  await drag(0,'[data-drop-target="image"]:not([data-bench])');
  await drag(1,'[data-bench="0"]');
  assert.equal(await d.locator('[data-bench="0"] [data-reference]').count(),2);
  await drag(2,'[data-graph-destination]');
  await drag(1,'[data-graph-destination]');
  assert.equal(await d.locator('[data-bench="0"] [data-reference]').count(),1);
  assert.equal(await d.locator('[data-graphs] [data-reference]').count(),2);
  await drag(2,'[data-drop-target="pending"]');
  assert.equal(await d.locator('[data-references] [data-reference]').count(),2);
  assert.equal(await d.locator('[data-reference]').count(),4,'each original exists exactly once');
  await drag(3,'[data-bench="0"]');
  await d.locator('[data-classify-reference="2"][data-conversion-kind="graph"]').click();
  assert.equal(await d.locator('[data-action="continue"]').isEnabled(),true);
  await page.keyboard.press('Escape');await ui.locator('[data-unilib-ai]').click();await d.waitFor();
  assert.equal(await d.locator('[data-bench="0"] [data-reference]').count(),2);
  assert.equal(await d.locator('[data-graphs] [data-reference]').count(),2);
  assert.equal(await d.locator('[data-reference]').count(),4);
});

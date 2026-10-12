// Real crop UI -> manual graph -> library replacement/cancel -> Apply/reopen.
// Synthetic PDF pixels exercise transfers without a model or external library call.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium,webkit} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {pointerOnImage} = require('./helpers/crop-loading-fixture.cjs');
const crypto = require('node:crypto');
const {fixturePack} = require('./helpers/pdf-runtime-retry-fixture.cjs');
const Module = require('node:module');
// This component fixture supplies the same public openGraph callback as exam-library.
// Only the helper's constructor arguments and an accepted-map observation are adapted.
const cropHelperPath = require.resolve('./helpers/crop-loading-fixture.cjs');
const cropHelperSource = fs.readFileSync(cropHelperPath,'utf8');
const graphFactorySeam = '      getProvider: async () => provider, insertMaterialized: async (...args) => window.__insertMaterialized?.(...args),';
const graphFactoryReplacement = `${graphFactorySeam}
      openGraph: async reference => {
        const libraryUrl = new URL(moduleUrl, window.location.href);
        const graphUrl = new URL('./graph/graph-modal.js' + libraryUrl.search, libraryUrl);
        if (graphUrl.origin !== window.location.origin) throw new Error('Graph fixture module must remain on the owned origin');
        (window.__graphFactoryOpenCalls ||= []).push({ moduleUrl: graphUrl.href, source: structuredClone(reference.source) });
        return (await import(graphUrl.href)).openGraphModal(null, 'coord', { traceReference: reference });
      },`;
const graphObservationSeam = '  const libraryTransferHooks = [];';
const graphObservationReplacement = "  body = replaceOnce(body, 'const acceptedAssets = new Map();', 'const acceptedAssets = new Map(); window.__graphCrops = acceptedAssets;');\n" + graphObservationSeam;
assert.equal(cropHelperSource.split(graphFactorySeam).length-1,1,'Exact component constructor callback seam');
assert.equal(cropHelperSource.split(graphObservationSeam).length-1,1,'Exact accepted-crop observation seam');
const graphHelperSource = cropHelperSource.replace(graphFactorySeam,graphFactoryReplacement).replace(graphObservationSeam,graphObservationReplacement);
const graphHelper = new Module(cropHelperPath,module); graphHelper.filename=cropHelperPath; graphHelper.paths=Module._nodeModulePaths(path.dirname(cropHelperPath));
graphHelper._compile(graphHelperSource,cropHelperPath);
const installGraphCropFixture=graphHelper.exports.installCropFixture;
const graphFixtureQualification={scope:'component constructor callback plus accepted-map observation; actual main checked separately',originalHelperSHA256:crypto.createHash('sha256').update(cropHelperSource).digest('hex'),adaptedHelperSHA256:crypto.createHash('sha256').update(graphHelperSource).digest('hex'),constructorCallbackSeams:1,acceptedMapObservationSeams:1,productGraphCallbackParameterUnmodified:true,productBusinessBranchesUnmodified:true};
const root=path.resolve(__dirname,'..');
const out=path.resolve(process.env.EVIDENCE_DIR||'.omo/evidence/graph-editor-library-compact-20261009/library');
assert(process.env.RELEASE_URL || process.env.PREVIEW_URL,'Owned integration server URL is required');
process.env.PREVIEW_URL=new URL('/',process.env.RELEASE_URL || process.env.PREVIEW_URL).href;
const version='?v=1.7.0-four-session-integration';
async function crop(page,ui,fraction=.25) {
  const {point}=await pointerOnImage(page,ui,fraction);
  await page.mouse.down();await page.mouse.move(point.x+80,point.y+90,{steps:5});await page.mouse.up();
  await ui.locator('[data-unilib-crop-save]').click();
}
async function showSource(page) {
 await page.waitForFunction(()=>document.querySelector('[data-trace-view] option[value=overlay]')?.disabled===false);
 await page.locator('select[data-trace-view]').selectOption('overlay');
 await page.locator('#gm-preview [data-trace-layer="source"]').waitFor();
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});const reports=[];
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
  if(process.env.GRAPH_TEST_ENGINES&&!process.env.GRAPH_TEST_ENGINES.split(',').includes(name))continue;
  const browser=await engine.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1080},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const actions=[];const record=text=>actions.push(text);
  try{
   fs.writeFileSync(path.join(out,`${name}-graph-component-qualification.json`),JSON.stringify(graphFixtureQualification,null,2));
   const ui=await installGraphCropFixture(page,{root,evidence:path.join(out,`${name}-crop-fixture`)});
   await crop(page,ui);
   assert(await ui.locator('[data-unilib-crop-graph]').isEnabled());
   assert(await ui.locator('[data-unilib-crop-graph]').isVisible());
   await ui.locator('[data-unilib-crop-graph]').click();
   await showSource(page);
   assert(!await ui.isVisible());assert(await page.locator('#gm-tab-coord').isVisible());
   record('Accepted PDF crop opens real manual coordinate editor with a retained source; overlay chosen explicitly, without an AI conversion');
   await page.locator('#gm-tab-func-btn').click();await page.locator('#gm-add-series').click();
   await page.locator('#gm-expr').fill('cos(pi*x)^2');await page.locator('#gm-expr').press('Tab');
   await page.locator('#gm-tab-annot-btn').click();
   await page.locator('#gm-add-annotation').click();
   for(let i=0;i<4;i++){
    const box=await page.locator('#gm-preview').boundingBox();await page.mouse.click(box.x+box.width*(i%2 ? .75 : .25),box.y+box.height*(i<2 ? .25 : .75));
   }
   const bars=page.locator('#gm-display-list .gm-display-heading');
   assert.equal(await bars.count(),4);
   const boxes=await bars.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};}));
   assert(Math.abs(boxes[0].y-boxes[1].y)<1);assert(boxes[1].x>boxes[0].x);assert(boxes[2].y>boxes[0].y);assert(Math.abs(boxes[2].y-boxes[3].y)<1);assert(boxes.every(box=>Math.abs(box.w-boxes[0].w)<1));
   assert.equal(await page.locator('#gm-display-properties .gm-annotation-editor:visible').count(),1);
   assert.equal(await page.locator('#gm-display-list .gm-annotation-editor').count(),0);
   await page.locator('#gm-display-list .gm-display-remove').first().focus();await page.keyboard.press('Enter');
   assert.equal(await bars.count(),3);assert(await page.evaluate(()=>document.activeElement.matches('.gm-display-select')));
   await page.locator('#gm-element-guide').click();assert.equal(await page.locator('#gm-element-guide').getAttribute('aria-pressed'),'true');
   await page.screenshot({path:path.join(out,`${name}-compact-display.png`)});
   await page.locator('#gm-tab-func-btn').click();assert(!await page.locator('#gm-element-guide').isVisible());
   assert.equal(await page.locator('#gm-preview [data-guide-focus-frame]').count(),0);
   record('Two bars per row, adjacent keyboard deletion, one separate properties panel, guide only in Display');
   await page.evaluate(async version=>{
    const {registerPdfReferencePicker}=await import('/js/pdf-library/reference-picker.js'+version);
    registerPdfReferencePicker(({kind,onAdd,trigger})=>window.cropFixture.beginReferenceSelection({kind,onAdd},trigger));
   },version);
   await page.locator('[data-trace-import]').selectOption('library');await ui.waitFor({state:'visible'});
   assert(!await page.locator('#graph-modal-overlay').isVisible());
   await ui.locator('[data-unilib-close]').focus();await page.keyboard.press('Enter');await page.locator('#graph-modal-overlay').waitFor({state:'visible'});
   assert.equal(await page.locator('#gm-expr').inputValue(),'cos(pi*x)^2');assert.equal(await bars.count(),3);
   assert(await page.locator('[data-trace-import]').evaluate(n=>n===document.activeElement));
   record('Library cancellation restores pending expression/annotations and keyboard focus');
   await page.locator('[data-trace-import]').selectOption('library');await ui.waitFor({state:'visible'});
   await ui.locator('[data-unilib-adjust]').click();await ui.locator('[data-unilib-crop]').waitFor({state:'visible'});await ui.locator('[data-unilib-crop-load-state]').waitFor({state:'hidden'});
   await crop(page,ui,.8);
   await ui.locator('[data-unilib-crop-collection] [data-unilib-graph-crop]').last().click();
   await ui.locator('[data-unilib-crop-graph]').click();await page.locator('#graph-modal-overlay').waitFor({state:'visible'});
   await showSource(page);
   assert.equal(await page.locator('#gm-expr').inputValue(),'cos(pi*x)^2');
   await page.locator('#gm-confirm').click();
   const saved=await page.evaluate(async version=>{
    const {state}=await import('/js/state.js'+version);return structuredClone(state.get().objects);
   },version);
   const plane=saved.find(o=>o.type==='coordplane');assert(plane.graphTrace.reference.data.startsWith('data:image/png'));
   assert.equal(plane.graphTrace.reference.source.provider,'pdf');assert(Array.isArray(plane.graphTrace.reference.source.rect));
   assert.equal(saved.find(o=>o.type==='funcgraph'&&o.planeId===plane.id)?.expr,'cos(pi*x)^2');
   assert.equal(plane.graphAnnotations.length,3);
   await page.evaluate(async ({version,id})=>(await import('/js/graph/graph-modal.js'+version)).openGraphModal(id,'func'),{version,id:plane.id});
   await showSource(page);assert.equal(await page.locator('#gm-expr').inputValue(),'cos(pi*x)^2');
   await page.locator('#gm-cancel').click();
   const after=await page.evaluate(async version=>structuredClone((await import('/js/state.js'+version)).state.get().objects),version);
   assert.deepEqual(after,saved);record('A different crop replaces the reference, keeps the draft, and retains pixel data/source provenance through Apply/reopen/Cancel');
   await page.evaluate(()=>window.cropFixture.open());await ui.waitFor({state:'visible'});
   await ui.locator('[data-unilib-adjust]').click();await ui.locator('[data-unilib-crop-load-state]').waitFor({state:'hidden'});
   await crop(page,ui,.5);
   await ui.locator('[data-unilib-crop-workbench]').click();
   const retained=await page.evaluate(()=>[...window.__graphCrops.values()][0].result);
   await ui.locator('[data-unilib-graph]').click();await showSource(page);
   await page.locator('#gm-confirm').click();
   const created=await page.evaluate(async ({version,ids})=>(await import('/js/state.js'+version)).state.get().objects.find(o=>o.type==='coordplane'&&!ids.includes(o.id)),{version,ids:saved.map(o=>o.id)});
   assert(created.graphTrace.reference.data.startsWith('data:image/png'));assert.deepEqual(created.graphTrace.reference.source.rect,retained.provenance.rect);
   record('Workbench coordinate/function action retains the initial crop reference when Apply is clicked without touching comparison settings');
   const app=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
   const pdfFixture=fixturePack();
   await app.route('**/assets/pdf-library/catalog-bootstrap.json',route=>route.fulfill({status:404,body:'controlled catalog fixture'}));
   await app.route('https://5e-google-drive-gateway.5e-desktop.workers.dev/**',route=>{
    const url=decodeURIComponent(new URL(route.request().url()).pathname);
    const body=url.endsWith('/pack.json')?pdfFixture.pack:url.endsWith('/checksums.json')?pdfFixture.checksums:url.endsWith('/catalog.json')?pdfFixture.catalog:url.endsWith('/search-index.json')?pdfFixture.search:pdfFixture.pdf;
    return route.fulfill({contentType:Buffer.isBuffer(body)?'application/pdf':'application/json',body:Buffer.isBuffer(body)?body:JSON.stringify(body)});
   });
   await app.route('**/js/unified-library-ui.js*',route=>{
    const source=fs.readFileSync(path.join(root,'js/unified-library-ui.js'),'utf8');
    assert.equal(source.split('const acceptedAssets = new Map();').length-1,1);
    return route.fulfill({contentType:'text/javascript',body:source.replace('const acceptedAssets = new Map();','const acceptedAssets = new Map(); window.__actualAcceptedAssets=acceptedAssets;')});
   });
   await app.addInitScript(()=>{localStorage.setItem('5e.tutorial.bannerSeen','true');localStorage.setItem('5e.preview:5e.tutorial.bannerSeen','true');localStorage.setItem('5e.preview:5e.mode','pro');});
   await app.goto(process.env.PREVIEW_URL+'?mode=pro&mobile=0&exam=0',{waitUntil:'networkidle'});
   await app.evaluate(async version=>(await import('./js/graph/graph-modal.js'+version)).openGraphModal(null,'func'),version);
   await app.locator('#gm-add-series').click();await app.locator('#gm-expr').fill('2*x');await app.locator('#gm-expr').press('Tab');
   await app.locator('[data-trace-import]').selectOption('library');
   const live=app.locator('.unified-library-overlay');await live.waitFor({state:'visible'});
   assert.equal(await live.locator('[data-unilib-graph]').textContent(),'그래프 원본으로 선택');
   assert(!await live.locator('[data-unilib-ai]').isVisible());
   await live.locator('[data-unilib-close]').click();await app.locator('#graph-modal-overlay').waitFor({state:'visible'});
   assert.equal(await app.locator('#gm-expr').inputValue(),'2*x');
   await app.locator('[data-trace-import]').selectOption('library');await live.waitFor({state:'visible'});
   await app.waitForFunction(()=>document.querySelector('.unified-library-overlay').dataset.searchReadiness==='ready');
   await live.locator('[data-unilib-type="pdf"]').click();
   await live.locator('[data-result-kind="pdf"]').first().click();
   await live.locator('[data-unilib-adjust]').click();await live.locator('[data-unilib-crop-load-state]').waitFor({state:'hidden'});
   await crop(app,live);await live.locator('[data-unilib-crop-workbench]').click();
   const actualCrop=await app.evaluate(()=>structuredClone([...window.__actualAcceptedAssets.values()][0]));
   await live.locator('[data-unilib-graph]').click();await app.locator('#graph-modal-overlay').waitFor({state:'visible'});
   assert.equal(await app.locator('select[data-trace-view]').inputValue(),'graph','library import retains Graph only as the default');
   await showSource(app);assert.equal(await app.locator('#gm-expr').inputValue(),'2*x');
   await app.locator('#gm-confirm').click();
   const actualPlane=await app.evaluate(async version=>(await import('./js/state.js'+version)).state.get().objects.find(o=>o.type==='coordplane'),version);
   actualCrop.result.provenance.rect.forEach((value,index)=>assert.ok(Math.abs(actualPlane.graphTrace.reference.source.rect[index]-value)<=1e-6,'PDF normalization may round bounds below a source pixel'));
   assert.deepEqual(actualPlane.graphTrace.reference.source.rect,actualCrop.materialized.source.rect,'the exact renderer source bounds are retained');
   assert.equal(actualPlane.graphTrace.reference.source.documentId,actualCrop.result.provenance.documentId);
   assert.equal(actualPlane.graphTrace.reference.data,actualCrop.materialized.dataUrl,'the actual catalog/rasterizer transfers the prepared crop pixels');
   await app.evaluate(async({version,id})=>(await import('./js/graph/graph-modal.js'+version)).openGraphModal(id,'func'),{version,id:actualPlane.id});
   await showSource(app);assert.equal(await app.locator('#gm-expr').inputValue(),'2*x');await app.locator('#gm-cancel').click();
   record('Actual app catalog, PDF renderer, crop tray and graph dropdown preserve exact PNG pixels, source bounds within PDF normalized precision and expression through Apply/reopen');
   await app.evaluate(async({version,objects,id})=>{
    const {state}=await import('./js/state.js'+version);state.update(s=>{s.objects=objects;s.groups=[];s.selectedIds=[];});
    (await import('./js/graph/graph-modal.js'+version)).openGraphModal(id,'func');
   },{version,objects:saved,id:plane.id});
   await app.locator('#gm-tab-annot-btn').click();await app.locator('.gm-modal').screenshot({path:path.join(out,`${name}-full-app-display.png`)});
   await app.setViewportSize({width:720,height:900});await app.locator('.gm-modal').screenshot({path:path.join(out,`${name}-full-app-narrow.png`)});
   await app.locator('#gm-cancel').click();await app.close();
   record('Actual full-app library registration carries graph purpose and restores the draft on Close');
   const factoryCalls=await page.evaluate(()=>window.__graphFactoryOpenCalls);
   assert.equal(factoryCalls.length,2,'Direct crop and retained workbench crop each use the configured public callback');
   fs.writeFileSync(path.join(out,`${name}-graph-component-callbacks.json`),JSON.stringify(factoryCalls,null,2));
   assert.deepEqual(errors,[]);reports.push({browser:name,pass:true,providerCalls:0,actions,boxes});
  }catch(error){await page.screenshot({path:path.join(out,`${name}-failure.png`)});reports.push({browser:name,pass:false,actions,error:error.stack,errors});}
  finally{await browser.close();}
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));if(reports.some(r=>!r.pass))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});

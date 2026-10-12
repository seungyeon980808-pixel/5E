'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { instrumentAiMain } = require('./helpers/canonical-fixture-adapter.cjs');
const root = path.resolve(__dirname, '..');
const evidence = process.env.EVIDENCE_DIR || path.join(root, '_work/feedback/parts/graph-task-transfer');
const lifecycle = fs.readFileSync(path.join(__dirname, 'test-ai-workspace-lifecycle-browser.cjs'), 'utf8');
const start = lifecycle.indexOf('function seedRequestWorkspaces(');
const end = lifecycle.indexOf('\nasync function requestBrowserFixture(', start);
assert.ok(start >= 0 && end > start);
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/graph-reconstruction/linear.json'), 'utf8'));
const seed = lifecycle.slice(start, end);
// Render after canonical module loading starts. WebKit rejects early dynamic
// imports from an init script before its document module environment is ready.
const graphSeed = `await window.__seedReady;
window.__seedReady = window.__seedReady.then(async () => {
  window.__graphTransferSeedPhase = 'import';
  const api = await import('/js/graph/workbench-result.js?v=1.7.0-four-session-integration');
  const tab = structuredClone(window.__task5Expected[0]);
  const bytes = await (await fetch(tab.attachments[0].data)).arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2,'0')).join('');
  const plan = ${JSON.stringify(plan)};
  plan.source = {id:'source-0',hash,width:512,height:384,plotBox:{x:40,y:50,w:420,h:280}};
  const graphResult = api.buildWorkbenchGraph(plan, plan.source);
  window.__graphTransferSeedPhase = 'render';
  const data = await api.workbenchGraphDataUrl(graphResult);
  window.__graphTransferSeedPhase = 'persist';
  tab.conversionKind = 'graph';
  // A stored historical setting must not transform native graph output.
  tab.outputOptions = {backgroundPolicy:'connected',examPalette:true,lineThickness:2};
  Object.assign(tab.generated[0], {data,graphResult,sceneResult:{valid:true,supported:true,objects:graphResult.objects},
    sourceReferenceId:'source-0',sourceReferenceName:tab.attachments[0].name,reviewState:'needs-attention'});
  window.__graphTransferExpected = structuredClone(tab);
  await new Promise((resolve,reject) => {
    const request = indexedDB.open('5e.preview:5e-ai-image-tasks',1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('tasks','readwrite');
      tx.objectStore('tasks').put({key:'workspace',tabs:[tab],activeTaskTabId:tab.id,taskTabSerial:2,imageSerial:2});
      tx.oncomplete = () => {db.close();resolve();}; tx.onerror = () => reject(tx.error);
    };
  });
  window.__graphTransferSeedPhase = 'ready';
}).catch(error => {window.__graphTransferSeedError = String(error); throw error;});
await window.__seedReady;`;
const panel = '#ai-image-panel';
const snap = page => page.evaluate(async () => (await __graphTransferManager.sharingSnapshot()).workspaces.flatMap(w => w.tabs));

for (const engine of ['chromium','webkit']) test(`${engine}: native graph revisions transfer visible output without changing source geometry`, {timeout:90000}, async t => {
  const dir = path.join(evidence,engine); fs.mkdirSync(dir,{recursive:true});
  const server = http.createServer((req,res) => {
    const pathname = new URL(req.url,'http://localhost').pathname;
    const file = path.resolve(root,'.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    fs.readFile(file,(error,bytes) => {
      const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.mjs':'text/javascript'};
      res.writeHead(error ? 404 : 200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
      res.end(error ? 'missing' : bytes);
    });
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await playwright[engine].launch({headless:true});
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror',error => errors.push(error.message));
  t.after(async () => {
    if (!page.isClosed()) {
      fs.writeFileSync(path.join(dir,'diagnostic.json'),JSON.stringify({errors,...await page.evaluate(() => ({seedPhase:window.__graphTransferSeedPhase,seedError:window.__graphTransferSeedError}))},null,2));
      await page.screenshot({path:path.join(dir,'final.png')});
    }
    await context.close(); await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  });
  await page.addInitScript({content:seed + '\nseedRequestWorkspaces(1);'});
  await page.route('**/js/main.js*',route => route.fulfill({contentType:'text/javascript',body:graphSeed + '\n' + instrumentAiMain(root,{manager:'__graphTransferManager',seedReady:false}).body}));
  await page.goto(`http://127.0.0.1:${server.address().port}/?mode=pro&mobile=0&exam=0`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.__graphTransferManager);
  await page.evaluate(() => __graphTransferManager.sharingSnapshot());
  // Isolate only the system clipboard boundary. Keep the engine's real
  // ClipboardItem, SVG decoder, canvas rasterizer and PNG encoder.
  await page.evaluate(() => {
    document.addEventListener('click',event => {
      if (!event.target.closest('.ai-task-context-menu [data-task-action="copy"]')) return;
      window.__graphClipboardGesture = event.isTrusted;
      setTimeout(() => {window.__graphClipboardGesture = false;},0);
    },true);
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items => {
      const gesture = window.__graphClipboardGesture === true;
      const blob = await items[0].getType('image/png');
      const data = await new Promise((resolve,reject) => {
        const reader = new FileReader();reader.onload = () => resolve(reader.result);reader.onerror = () => reject(reader.error);reader.readAsDataURL(blob);
      });
      window.__graphClipboard = {data,type:blob.type,gesture};
    }}});
    window.__graphRasterDigest = async source => {
      const image = new Image();image.src = source;await image.decode();
      const canvas = document.createElement('canvas');canvas.width = image.naturalWidth;canvas.height = image.naturalHeight;
      const draw = canvas.getContext('2d');draw.drawImage(image,0,0);
      const rgba = draw.getImageData(0,0,canvas.width,canvas.height).data;
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',rgba))].map(n => n.toString(16).padStart(2,'0')).join('');
      return {width:canvas.width,height:canvas.height,hash};
    };
  });
  const welcome = page.locator('.tut-welcome-overlay .tut-banner-no'); if (await welcome.isVisible()) await welcome.click();
  await page.locator('#ai-image-install-open').click();
  await page.waitForFunction(() => document.querySelector('#ai-image-panel')?.dataset.aiSelectedCandidateId === 'candidate-0');
  const original = (await snap(page)).find(tab => tab.id === 'task-0');
  await page.locator(panel + ' [data-ai-graph-edit]').click();
  await page.locator('#gm-labelx').fill('Transferred time');
  await page.locator('#gm-labelx').dispatchEvent('change');
  await page.locator('#gm-confirm').click();
  await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-ai-status]')?.textContent.includes('그래프 편집을 적용했습니다'));
  const edited = (await snap(page)).find(tab => tab.id === 'task-0');
  assert.equal(edited.generated.length,2);
  assert.deepEqual(edited.generated[0],original.generated[0]);
  const revision = edited.generated.find(candidate => candidate.id === edited.selectedCandidateId);
  assert.equal(revision.graphResult.objects.find(o => o.type === 'coordplane').labelX,'Transferred time');
  assert.notEqual(revision.data,original.generated[0].data);
  const receipts = [];
  for (const candidateId of [revision.id,'candidate-0']) for (const targetKind of ['image','graph']) {
    await page.locator(panel + ' [data-ai-workflow="graph"]').click();
    await page.locator(panel + ' [data-tab-id="task-0"] .ai-task-tab-select').click();
    if ((await snap(page)).find(tab => tab.id === 'task-0').selectedCandidateId !== candidateId) {
      await page.locator(panel + ' [data-ai-version-button]').click();
      await page.locator(panel + ` [data-ai-candidate-option="${candidateId}"]`).click();
    }
    await page.waitForFunction(id => document.querySelector('#ai-image-panel')?.dataset.aiSelectedCandidateId === id,candidateId);
    const img = page.locator(panel + ' .is-ai-active-candidate .ai-preview-stage > img');
    await img.evaluate(image => image.decode());
    const displayed = await img.getAttribute('src');
    const before = await snap(page), sourceBefore = before.find(tab => tab.id === 'task-0');
    const dimensions = await img.evaluate(image => [image.naturalWidth,image.naturalHeight]);
    assert.deepEqual(dimensions,[512,384]);
    if (targetKind === 'image') {
      await page.evaluate(() => {window.__graphClipboard = null;});
      await page.locator(panel + ' [data-tab-id="task-0"] .ai-task-tab-select').click({button:'right'});
      await page.locator('.ai-task-context-menu [data-task-action="copy"]').click();
      await page.waitForFunction(() => window.__graphClipboard);
      const copy = await page.evaluate(async displayed => ({visible:await __graphRasterDigest(displayed),copied:await __graphRasterDigest(__graphClipboard.data),type:__graphClipboard.type,gesture:__graphClipboard.gesture}),displayed);
      assert.equal(copy.type,'image/png');assert.equal(copy.gesture,true);
      assert.deepEqual(copy.copied,copy.visible,'selected SVG revision copies identical raster pixels');
      assert.deepEqual(await snap(page),before,'copy retains native objects, original, revisions, review, comments and selection');
      receipts.push({action:'clipboard',candidateId,dimensions,pixels:copy.visible,pixelsMatch:true,sourcePreserved:true,writeDuringGesture:true});
    }
    await page.locator(panel + ' [data-tab-id="task-0"] .ai-task-tab-select').click({button:'right'});
    await page.locator('.ai-task-context-menu [data-task-action="send"]').click();
    await page.locator(`.ai-task-context-menu [data-task-action="${targetKind}"]`).click();
    await page.waitForFunction(({targetKind,count}) => document.querySelector('#ai-image-panel')?.dataset.aiWorkflow === targetKind
      && document.querySelector('#ai-image-panel [data-ai-tab-list] .is-on')?.dataset.tabId !== 'task-0'
      && __graphTransferManager.sharingSnapshot().then(s => s.workspaces.flatMap(w => w.tabs).length === count+1),{targetKind,count:before.length});
    const after = await snap(page), target = after.find(tab => !before.some(old => old.id === tab.id));
    assert.ok(target); assert.equal(target.conversionKind,targetKind); assert.equal(target.generated.length,0);
    assert.equal(target.attachments[0].data,displayed,'selected graph revision is delivered byte-for-byte');
    assert.deepEqual(after.find(tab => tab.id === 'task-0'),sourceBefore,'original, native geometry, revisions, review, comments and selection remain intact');
    const targetImage = page.locator(panel + ' [data-ai-attachment-list] .ai-preview-stage > img');
    await targetImage.evaluate(image => image.decode());
    assert.deepEqual(await targetImage.evaluate(image => [image.naturalWidth,image.naturalHeight]),dimensions);
    receipts.push({action:'transfer',candidateId,targetKind,targetMatchesVisible:true,dimensions,sourcePreserved:true});
    fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({engine,actualNativeRenderer:true,actualGraphEdit:true,providerCalls:await page.evaluate(() => __task2.sends.length),cases:receipts},null,2));
  }
  assert.deepEqual(errors,[]); assert.equal(await page.evaluate(() => __task2.sends.length),0);
});

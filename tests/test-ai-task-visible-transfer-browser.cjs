'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { instrumentAiMain } = require('./helpers/canonical-fixture-adapter.cjs');
const root = path.resolve(__dirname, '..');
const evidence = process.env.EVIDENCE_DIR || path.join(root, '_work/feedback/parts/task-visible-transfer');
const lifecycle = fs.readFileSync(path.join(__dirname, 'test-ai-workspace-lifecycle-browser.cjs'), 'utf8');
const start = lifecycle.indexOf('function seedRequestWorkspaces(');
const end = lifecycle.indexOf('\nasync function requestBrowserFixture(', start);
assert.ok(start >= 0 && end > start);
const seed = lifecycle.slice(start, end).replace('window.__task5Expected = structuredClone(tabs);', `
  for (const tab of tabs) {
    tab.conversionKind = 'image';
    tab.generated[0].reviewState = 'scoped-applied';
    tab.generated[0].labelPlan = {version:4,frozen:true,reviewRequired:false,uncertainties:[],labels:[
      {id:'visible-transfer-label',text:'VISIBLE',scope:'general',mode:'text',contentMode:'plain',
       position:{x:.5,y:.2},anchor:{x:.5,y:.2},typography:{role:'text',bounds:{x:.35,y:.15,w:.3,h:.1}}}
    ]};
  }
  // This persisted ordinary PNG predates editable binding; prepare it before
  // product boot rather than stripping provenance from a live modern result.
  tabs[2].generated[0].reviewState = 'idle';
  delete tabs[2].generated[0].labelPlan;
  window.__task5Expected = structuredClone(tabs);`);
const active = '#ai-image-panel';

async function snapshot(page) {
  return page.evaluate(async () => (await __transferManager.sharingSnapshot()).workspaces.flatMap(w => w.tabs));
}
async function visibleSource(page) {
  return page.locator(active + ' .is-ai-active-candidate .ai-preview-stage > img').getAttribute('src');
}
async function transfer(page, taskId, kind) {
  await page.locator(active + ` [data-tab-id="${taskId}"] .ai-task-tab-select`).click({button:'right'});
  await page.locator('.ai-task-context-menu [data-task-action="send"]').click();
  await page.locator(`.ai-task-context-menu [data-task-action="${kind}"]`).click();
  await page.waitForFunction(({kind,taskId}) => {
    const panel = document.querySelector('#ai-image-panel');
    return panel?.dataset.aiWorkflow === kind
      && panel.querySelector('[data-ai-tab-list] .is-on')?.dataset.tabId !== taskId
      && panel.querySelector('[data-ai-source-select]')?.options.length;
  }, {kind,taskId});
}
async function selectSource(page) {
  await page.locator(active + ' [data-ai-workflow="image"]').click();
  await page.locator(active + ' [data-tab-id="task-0"] .ai-task-tab-select').click();
  await page.waitForFunction(() => document.querySelector('#ai-image-panel')?.dataset.aiSelectedCandidateId === 'candidate-0');
}

for (const engine of ['chromium', 'webkit']) test(`${engine}: transfer and clipboard preserve visible labels, historical output settings and source tasks`, {timeout:90000}, async t => {
  const dir = path.join(evidence, engine); fs.mkdirSync(dir, {recursive:true});
  const server = http.createServer((req,res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    fs.readFile(file, (error, bytes) => {
      const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.mjs':'text/javascript'};
      res.writeHead(error ? 404 : 200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
      res.end(error ? 'missing' : bytes);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await playwright[engine].launch({headless:true});
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  t.after(async () => {
    if (!page.isClosed()) await page.screenshot({path:path.join(dir,'final.png')});
    await context.close(); await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  });
  await page.addInitScript({content:seed + '\nseedRequestWorkspaces(3);'});
  await page.route('**/js/main.js*', route => route.fulfill({contentType:'text/javascript',body:instrumentAiMain(root,{manager:'__transferManager'}).body}));
  await page.route('**/js/ai-task-workspaces.js*', route => {
    const body = fs.readFileSync(path.join(root,'js/ai-task-workspaces.js'),'utf8');
    const hook = 'const batchError = error => {';
    assert.equal(body.split(hook).length,2);
    return route.fulfill({contentType:'text/javascript',body:body.replace(hook,hook + ' window.__lastTaskMenuError = error?.message || String(error);')});
  });
  await page.route('**/js/ai-label-composite.js*', route => {
    const body = fs.readFileSync(path.join(root,'js/ai-label-composite.js'),'utf8');
    const hook = 'export async function createEditableLabelComposite({ plan, placement, candidateDataUrl, artboard, signal }) {';
    assert.equal(body.split(hook).length, 2);
    return route.fulfill({contentType:'text/javascript',body:body.replace(hook,
      hook + ' if (window.__transferCompositeGate) { window.__transferCompositeEntered = true; await window.__transferCompositeGate; }')});
  });
  await page.route('**/js/image-background.js*', route => {
    const body = fs.readFileSync(path.join(root,'js/image-background.js'),'utf8');
    const hook = 'export async function transparentizeGeneratedImage(src, options = {}) {';
    assert.equal(body.split(hook).length,2);
    return route.fulfill({contentType:'text/javascript',body:body.replace(hook,hook + `
      const gate = window.__historicalProcessingGate;
      if (gate && options.backgroundPolicy === gate.policy) {gate.entered = true;await gate.promise;}`)});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/?mode=pro&mobile=0&exam=0`, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.__transferManager);
  await page.evaluate(() => __transferManager.sharingSnapshot());
  const welcome = page.locator('.tut-welcome-overlay .tut-banner-no'); if (await welcome.isVisible()) await welcome.click();
  // Capture only this isolated browser context's clipboard boundary. The real
  // ClipboardItem, image decoder and PNG encoder still prepare the actual blob.
  await page.evaluate(() => {
    document.addEventListener('click', event => {
      if (!event.target.closest('.ai-task-context-menu [data-task-action="copy"]')) return;
      window.__clipboardGesture = event.isTrusted;
      setTimeout(() => {window.__clipboardGesture = false;},0);
    },true);
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items => {
      const gesture = window.__clipboardGesture === true;
      window.__clipboardWriteStarted = gesture;
      const blob = await items[0].getType('image/png');
      const data = await new Promise((resolve,reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
      });
      window.__copiedImage = {data,type:blob.type,gesture};
    }}});
    window.__rasterDigest = async source => {
      const image = new Image(); image.src = source; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const draw = canvas.getContext('2d'); draw.drawImage(image,0,0);
      const rgba = draw.getImageData(0,0,canvas.width,canvas.height).data;
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',rgba))].map(n => n.toString(16).padStart(2,'0')).join('');
      return {width:canvas.width,height:canvas.height,hash};
    };
  });
  await page.locator('#ai-image-install-open').click();
  await page.waitForFunction(() => {
    const image = document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img');
    return image?.complete && image.naturalWidth && image.src !== __task5Expected[0].generated[0].data;
  });
  const receipts = [];
  for (const included of [true,false]) for (const kind of ['graph','image']) {
    await selectSource(page);
    const toggle = page.locator(active + ' [data-ai-label-toggle]');
    if ((await toggle.getAttribute('aria-checked') === 'true') !== included) await toggle.click();
    await page.waitForFunction(included => {
      const image = document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img');
      return image?.complete && (image.src !== __task5Expected[0].generated[0].data) === included;
    }, included);
    const before = await snapshot(page), sourceBefore = before.find(tab => tab.id === 'task-0'), displayed = await visibleSource(page);
    await transfer(page, 'task-0', kind);
    const after = await snapshot(page), source = after.find(tab => tab.id === 'task-0');
    const targets = after.filter(tab => !before.some(old => old.id === tab.id));
    assert.equal(targets.length, 1);
    const target = targets[0];
    receipts.push({included,targetKind:target.conversionKind,targetMatchesVisible:target.attachments[0].data === displayed,sourcePreserved:JSON.stringify(source) === JSON.stringify(sourceBefore)});
    fs.writeFileSync(path.join(dir,'receipt.json'), JSON.stringify(receipts,null,2));
    assert.deepEqual(source, sourceBefore, 'original, candidate, label plan, comments and selection remain intact');
    assert.equal(target.attachments[0].data === displayed, true, 'other workflow receives the currently visible pixels');
    assert.equal(target.conversionKind, kind);
    assert.equal(target.generated.length, 0);
  }
  // Right-clicking an inactive task must use its own retained label state.
  const beforeDuplicate = await snapshot(page), sourceBefore = beforeDuplicate.find(tab => tab.id === 'task-0');
  await page.locator(active + ' [data-tab-id="task-0"] .ai-task-tab-select').click({button:'right'});
  await page.locator('.ai-task-context-menu [data-task-action="duplicate"]').click();
  await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-ai-tab-list] .is-on')?.dataset.tabId !== 'task-0'
    && document.querySelector('#ai-image-panel [data-ai-tab-list] .is-on')?.dataset.tabId);
  await page.waitForFunction(async count => (await __transferManager.sharingSnapshot()).workspaces.flatMap(w => w.tabs).length === count+1, beforeDuplicate.length);
  const afterDuplicate = await snapshot(page), duplicate = afterDuplicate.find(tab => !beforeDuplicate.some(old => old.id === tab.id));
  assert.equal(duplicate.attachments[0].data === sourceBefore.generated[0].data, true, 'inactive source OFF is independent of active task');
  assert.deepEqual(afterDuplicate.find(tab => tab.id === 'task-0'), sourceBefore);
  receipts.push({action:'inactive-source-duplicate',included:false,sourcePreserved:true,targetMatchesVisible:true});
  // Delay the actual compositor, then change visible labels before it resolves.
  await selectSource(page);
  await page.locator(active + ' [data-ai-label-toggle]').click();
  await page.waitForFunction(() => document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img')?.src !== __task5Expected[0].generated[0].data);
  const beforeRace = await snapshot(page);
  await page.evaluate(() => { window.__transferCompositeGate = new Promise(resolve => window.__releaseTransferComposite = resolve); });
  await page.locator(active + ' [data-tab-id="task-0"] .ai-task-tab-select').click({button:'right'});
  await page.locator('.ai-task-context-menu [data-task-action="send"]').click();
  await page.locator('.ai-task-context-menu [data-task-action="graph"]').click();
  await page.waitForFunction(() => window.__transferCompositeEntered);
  await page.locator(active + ' [data-ai-label-toggle]').click();
  await page.evaluate(() => { window.__releaseTransferComposite(); window.__transferCompositeGate = null; });
  await page.getByText('보내는 동안 작업의 그림이나 표시 설정이 바뀌었습니다. 다시 보내 주세요.', {exact:true}).waitFor();
  const afterRace = await snapshot(page), raceSource = afterRace.find(tab => tab.id === 'task-0');
  assert.deepEqual(afterRace.map(tab => tab.id), beforeRace.map(tab => tab.id), 'stale delivery creates no empty or misdirected task');
  assert.deepEqual(raceSource.generated, beforeRace.find(tab => tab.id === 'task-0').generated);
  assert.equal(raceSource.labelPreviewIncluded['candidate-0'], false, 'user toggle remains OFF after rejected delivery');
  receipts.push({action:'label-change-during-real-composition',rejected:true,noNewTask:true,candidatesPreserved:true});
  fs.writeFileSync(path.join(dir,'receipt.json'), JSON.stringify(receipts,null,2));
  for (const included of [true,false]) {
    await selectSource(page);
    const toggle = page.locator(active + ' [data-ai-label-toggle]');
    if ((await toggle.getAttribute('aria-checked') === 'true') !== included) await toggle.click();
    await page.waitForFunction(included => {
      const image = document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img');
      return image?.complete && (image.src !== __task5Expected[0].generated[0].data) === included;
    },included);
    const before = await snapshot(page), sourceBefore = before.find(tab => tab.id === 'task-0');
    const displayed = await visibleSource(page);
    await page.evaluate(() => {window.__copiedImage = null;});
    await page.locator(active + ' [data-tab-id="task-0"] .ai-task-tab-select').click({button:'right'});
    await page.locator('.ai-task-context-menu [data-task-action="copy"]').click();
    await page.waitForFunction(() => window.__copiedImage);
    const copied = await page.evaluate(() => __copiedImage);
    const pixels = await page.evaluate(async displayed => ({visible:await __rasterDigest(displayed),copied:await __rasterDigest(__copiedImage.data)}),displayed);
    const source = (await snapshot(page)).find(tab => tab.id === 'task-0');
    receipts.push({action:'clipboard-copy',included,type:copied.type,writeDuringGesture:copied.gesture,pixelsMatch:JSON.stringify(pixels.visible) === JSON.stringify(pixels.copied),sourcePreserved:JSON.stringify(source) === JSON.stringify(sourceBefore),pixels});
    fs.writeFileSync(path.join(dir,'receipt.json'), JSON.stringify(receipts,null,2));
    assert.equal(copied.type,'image/png'); assert.equal(copied.gesture,true,'clipboard.write begins during the trusted click');
    assert.deepEqual(source,sourceBefore);
    assert.deepEqual(pixels.copied,pixels.visible,'clipboard receives current visible labels');
  }
  // A stale preparation must reject before the clipboard receives any image.
  await page.locator(active + ' [data-ai-label-toggle]').click();
  await page.waitForFunction(() => document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img')?.src !== __task5Expected[0].generated[0].data);
  const beforeCopyRace = await snapshot(page);
  await page.evaluate(() => {
    window.__copiedImage = null; window.__clipboardWriteStarted = false; window.__transferCompositeEntered = false;
    window.__transferCompositeGate = new Promise(resolve => window.__releaseTransferComposite = resolve);
  });
  await page.locator(active + ' [data-tab-id="task-0"] .ai-task-tab-select').click({button:'right'});
  await page.locator('.ai-task-context-menu [data-task-action="copy"]').click();
  await page.waitForFunction(() => window.__transferCompositeEntered && window.__clipboardWriteStarted);
  await page.locator(active + ' [data-ai-label-toggle]').click();
  await page.evaluate(() => {window.__releaseTransferComposite();window.__transferCompositeGate = null;});
  await page.getByText('보내는 동안 작업의 그림이나 표시 설정이 바뀌었습니다. 다시 보내 주세요.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(() => __copiedImage),null);
  assert.deepEqual((await snapshot(page)).find(tab => tab.id === 'task-0').generated,beforeCopyRace.find(tab => tab.id === 'task-0').generated);
  receipts.push({action:'clipboard-change-during-real-composition',rejected:true,clipboardNotWritten:true,writeDuringGesture:true,candidatesPreserved:true});
  async function historical(policy) {
    await page.locator(active + ' [data-ai-workflow="image"]').click();
    await page.locator(active + ' [data-tab-id="task-2"] .ai-task-tab-select').click();
    await page.waitForFunction(() => document.querySelector('#ai-image-panel')?.dataset.aiSelectedCandidateId === 'candidate-2');
    const button = page.locator(active + ` [data-ai-legacy-result-settings] [data-ai-setting-key="background"] [data-ai-setting-value="${policy}"]`);
    assert.equal(await button.isVisible(),true); assert.equal(await button.isEnabled(),true);
    if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
    const ready = await page.waitForFunction(policy => {
      const image = document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img');
      if (!image?.complete || !image.naturalWidth) return false;
      const src = image.src;
      if ((src === __task5Expected[2].generated[0].data) !== (policy === 'preserve')) return false;
      if (image.src !== src || image.currentSrc !== src) return false;
      const canvas = document.createElement('canvas'); canvas.width = 512;canvas.height = 384;
      const draw = canvas.getContext('2d'); draw.drawImage(image,0,0);
      const outside = draw.getImageData(0,0,1,1).data[3], inside = draw.getImageData(250,150,1,1).data[3];
      return outside === (policy === 'preserve' ? 255 : 0) && inside === (policy === 'all-near-white' ? 0 : 255) && src;
    },policy);
    // Capture the validated loaded source atomically; later task-list refreshes
    // may briefly reset the card while its output variant loads again.
    const displayed = await ready.jsonValue();
    assert.match(displayed,/^data:image\/png;base64,/);
    return displayed;
  }
  const historicalCandidate = (await snapshot(page)).find(tab => tab.id === 'task-2').generated[0];
  const contract = await page.evaluate(async () => {
    const output = await import('/js/ai-output-processing.js?v=1.7.0-four-session-integration');
    const candidate = (await __transferManager.sharingSnapshot()).workspaces.flatMap(w => w.tabs).find(tab => tab.id === 'task-2').generated[0];
    return {historical:output.isHistoricalPngLocalResult(candidate),raw:output.requiresRawImageOutput(candidate)};
  });
  assert.deepEqual(contract,{historical:true,raw:false});
  for (const policy of ['preserve','connected','all-near-white']) {
    const displayed = await historical(policy), before = await snapshot(page);
    const sourceBefore = before.find(tab => tab.id === 'task-2');
    await page.evaluate(() => {window.__copiedImage = null;});
    await page.locator(active + ' [data-tab-id="task-2"] .ai-task-tab-select').click({button:'right'});
    await page.locator('.ai-task-context-menu [data-task-action="copy"]').click();
    await page.waitForFunction(() => window.__copiedImage);
    const copy = await page.evaluate(async displayed => ({visible:await __rasterDigest(displayed),copied:await __rasterDigest(__copiedImage.data),gesture:__copiedImage.gesture}),displayed);
    assert.deepEqual(copy.copied,copy.visible);assert.equal(copy.gesture,true);
    assert.deepEqual((await snapshot(page)).find(tab => tab.id === 'task-2'),sourceBefore);
    receipts.push({action:'historical-clipboard',policy,pixelsMatch:true,writeDuringGesture:true,sourcePreserved:true,pixels:copy.visible});
    for (const kind of ['image','graph']) {
      const displayed = await historical(policy), before = await snapshot(page), sourceBefore = before.find(tab => tab.id === 'task-2');
      await transfer(page,'task-2',kind);
      const after = await snapshot(page), targets = after.filter(tab => !before.some(old => old.id === tab.id));
      assert.equal(targets.length,1);assert.equal(targets[0].conversionKind,kind);
      assert.equal(targets[0].attachments[0].data,displayed);
      assert.deepEqual(after.find(tab => tab.id === 'task-2'),sourceBefore);
      receipts.push({action:'historical-transfer',policy,targetKind:kind,targetMatchesVisible:true,sourcePreserved:true});
    }
    assert.deepEqual((await snapshot(page)).find(tab => tab.id === 'task-2').generated[0],historicalCandidate);
    fs.writeFileSync(path.join(dir,'receipt.json'), JSON.stringify(receipts,null,2));
  }
  // The inactive owner retains its processed output independently of the active task.
  const inactiveVisible = await historical('connected');await selectSource(page);
  const inactiveBefore = await snapshot(page);
  await page.evaluate(() => {window.__copiedImage = null;});
  await page.locator(active + ' [data-tab-id="task-2"] .ai-task-tab-select').click({button:'right'});
  await page.locator('.ai-task-context-menu [data-task-action="copy"]').click();
  await page.waitForFunction(() => window.__copiedImage);
  const inactiveCopy = await page.evaluate(async data => ({visible:await __rasterDigest(data),copied:await __rasterDigest(__copiedImage.data),gesture:__copiedImage.gesture}),inactiveVisible);
  assert.deepEqual(inactiveCopy.copied,inactiveCopy.visible);assert.equal(inactiveCopy.gesture,true);assert.deepEqual(await snapshot(page),inactiveBefore);
  receipts.push({action:'inactive-historical-clipboard',policy:'connected',pixelsMatch:true,sourcePreserved:true,activeTaskPreserved:true,writeDuringGesture:true});
  for (const action of ['copy','image']) {
    await historical('connected'); const before = await snapshot(page), sourceBefore = before.find(tab => tab.id === 'task-2');
    await page.evaluate(() => {
      window.__copiedImage = null;window.__clipboardWriteStarted = false;window.__lastTaskMenuError = null;
      const gate = {policy:'connected',entered:false};gate.promise = new Promise(resolve => gate.release = resolve);window.__historicalProcessingGate = gate;
    });
    await page.locator(active + ' [data-tab-id="task-2"] .ai-task-tab-select').click({button:'right'});
    if (action === 'image') await page.locator('.ai-task-context-menu [data-task-action="send"]').click();
    await page.locator(`.ai-task-context-menu [data-task-action="${action}"]`).click();
    await page.waitForFunction(() => window.__historicalProcessingGate?.entered);
    if (action === 'copy') assert.equal(await page.evaluate(() => __clipboardWriteStarted),true);
    await page.locator(active + ' [data-ai-legacy-result-settings] [data-ai-setting-key="background"] [data-ai-setting-value="preserve"]').click();
    await page.evaluate(() => {window.__historicalProcessingGate.release();window.__historicalProcessingGate = null;});
    await page.waitForFunction(() => window.__lastTaskMenuError);
    const error = page.locator(active + ' [data-ai-workspace-batch] [role="alert"]');
    await error.waitFor();
    const after = await snapshot(page), source = after.find(tab => tab.id === 'task-2');
    assert.deepEqual(after.map(tab => tab.id),before.map(tab => tab.id));assert.deepEqual(source.generated,sourceBefore.generated);
    assert.equal(source.outputOptions.backgroundPolicy,'preserve');assert.equal(await page.evaluate(() => __copiedImage),null);
    const errorText = await error.innerText();
    receipts.push({action:'historical-setting-change-during-processing',destination:action,rejected:true,errorText,noNewTask:true,clipboardNotWritten:true,candidatesPreserved:true,userChoicePreserved:true});
    fs.writeFileSync(path.join(dir,'receipt.json'), JSON.stringify(receipts,null,2));
    assert.equal(errorText,'보내는 동안 작업의 그림이나 표시 설정이 바뀌었습니다. 다시 보내 주세요.');
  }
  // Existing view-only sharing permits copying; it still forbids send/duplicate.
  await selectSource(page);
  await page.locator(active + ' [data-ai-label-toggle]').click();
  await page.waitForFunction(() => document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img')?.src !== __task5Expected[0].generated[0].data);
  await page.evaluate(async () => {
    const document = await __transferManager.sharingSnapshot();
    const source = document.workspaces.find(workspace => workspace.tabs.some(tab => tab.id === 'task-0'));
    const tab = source.tabs.find(tab => tab.id === 'task-0');
    await __transferManager.openSharingDocument('clipboard-view-only',{mode:'view',activeWorkspace:0,workspaces:[{...source,tabs:[tab],activeTaskTabId:tab.id}]});
  });
  await page.waitForFunction(() => document.querySelector('#ai-image-panel')?.dataset.aiSharingMode === 'view'
    && document.querySelector('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img')?.src !== __task5Expected[0].generated[0].data);
  const readOnlyBefore = await snapshot(page), displayed = await visibleSource(page);
  await page.evaluate(() => {window.__copiedImage = null;});
  await page.locator(active + ' [data-tab-id="task-0"] .ai-task-tab-select[aria-pressed="true"]').click({button:'right'});
  assert.equal(await page.locator('.ai-task-context-menu [data-task-action="send"]').isDisabled(),true);
  assert.equal(await page.locator('.ai-task-context-menu [data-task-action="duplicate"]').isDisabled(),true);
  await page.locator('.ai-task-context-menu [data-task-action="copy"]').click();
  await page.waitForFunction(() => window.__copiedImage);
  const readOnlyCopy = await page.evaluate(async displayed => ({visible:await __rasterDigest(displayed),copied:await __rasterDigest(__copiedImage.data),gesture:__copiedImage.gesture}),displayed);
  assert.deepEqual(readOnlyCopy.copied,readOnlyCopy.visible); assert.equal(readOnlyCopy.gesture,true);
  assert.deepEqual(await snapshot(page),readOnlyBefore);
  receipts.push({action:'view-only-clipboard',included:true,pixelsMatch:true,sourcePreserved:true,sendDisabled:true,duplicateDisabled:true,writeDuringGesture:true});
  fs.writeFileSync(path.join(dir,'receipt.json'), JSON.stringify(receipts,null,2));
  // A clipboard permission refusal must surface immediately, even when the
  // real visible-image composition is still pending. Never wait for it merely
  // to decide which clipboard error to show.
  await page.evaluate(() => {
    window.__copiedImage = null;window.__lastTaskMenuError = null;
    window.__transferCompositeEntered = false;window.__clipboardWriteStarted = false;
    window.__transferCompositeGate = new Promise(resolve => window.__releaseTransferComposite = resolve);
    window.__savedClipboardWrite = navigator.clipboard.write;
    navigator.clipboard.write = () => {
      window.__clipboardWriteStarted = window.__clipboardGesture === true;
      return Promise.reject(new DOMException('클립보드 접근이 거부되었습니다.','NotAllowedError'));
    };
  });
  await page.locator(active + ' [data-tab-id="task-0"] .ai-task-tab-select[aria-pressed="true"]').click({button:'right'});
  await page.locator('.ai-task-context-menu [data-task-action="copy"]').click();
  await page.waitForFunction(() => window.__lastTaskMenuError && window.__transferCompositeEntered);
  assert.equal(await page.locator(active + ' [data-ai-workspace-batch] [role="alert"]').innerText(),'클립보드 접근이 거부되었습니다.');
  assert.equal(await page.evaluate(() => __copiedImage),null);
  assert.equal(await page.evaluate(() => __clipboardWriteStarted),true);
  assert.deepEqual(await snapshot(page),readOnlyBefore);
  receipts.push({action:'clipboard-denied-during-real-composition',originalErrorPreserved:true,reportedBeforePreparationCompletes:true,clipboardNotWritten:true,sourcePreserved:true,writeDuringGesture:true});
  fs.writeFileSync(path.join(dir,'receipt.json'), JSON.stringify(receipts,null,2));
  await page.evaluate(() => {window.__releaseTransferComposite();window.__transferCompositeGate = null;navigator.clipboard.write = window.__savedClipboardWrite;});
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => __task2.sends.length), 0);
});

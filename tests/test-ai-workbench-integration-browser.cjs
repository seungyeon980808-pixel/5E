const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const evidenceRoot = process.env.TASK7_EVIDENCE || process.env.EVIDENCE_DIR || path.join(root, '.omo/evidence/ai-workbench-polish-0928/task7/browser');
function seedRequestWorkspaces(count, initialGeneration = false, missingCapabilities = false, mode = 'pro', scoped = false, badTask = false, sourceOnly = false, fixtureOptions = {}) {
  localStorage.setItem('5e.tutorial.bannerSeen', 'true');
  localStorage.setItem('5e.preview:5e.mode', mode);
  const listeners = new Set();
  const sends = [];
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 384;
  const draw = canvas.getContext('2d');
  draw.fillStyle = '#fff'; draw.fillRect(0, 0, 512, 384);
  draw.strokeStyle = '#111'; draw.lineWidth = 4; draw.strokeRect(45, 70, 120, 180); draw.strokeRect(300, 70, 120, 180);
  const original = canvas.toDataURL('image/png');
  draw.fillStyle = '#111'; draw.fillRect(225, 300, 50, 50);
  const modified = canvas.toDataURL('image/png');
  const tabs = Array.from({ length: count }, (_, index) => ({
    id: `task-${index}`, title: `검증 작업 ${index + 1}`, workState: 'idle', input: '선택 영역 안에 작은 사각형 추가',
    model: index ? 'gpt-6.1-sol' : 'gpt-6-luna', effort: 'medium', serviceTier: 'priority', separationMode: fixtureOptions.separationMode || 'off',
    generationMode: fixtureOptions.separationMode === 'auto' ? 'separated' : 'single',
    imageLabelWorkflow: { version: '1.1.0', imageKind: 'general', labelResult: 'remove', verificationMode: 'full', auxiliaryMarks: 'remove', scientificArrows: 'keep', explicit: true },
    outputOptions: { backgroundPolicy: 'preserve', examPalette: false, lineThickness: 0 },
    attachments: [{ id: `source-${index}`, kind: 'reference', name: `원본 ${index + 1}`, data: original, comments: [] }],
    generated: [{ id: `candidate-${index}`, kind: 'generated', name: `결과 ${index + 1}`, data: original,
      comments: [], reviewState: 'idle' }, { id: `latest-${index}`, kind: 'generated', name: '최신 결과', data: modified, comments: [], reviewState: 'idle' }],
    selectedCandidateId: `latest-${index}`, conversationMessages: [], uiMessages: [],
  }));
  // Historical PNGs stay scoped: only genuine first-conversion fixtures clear history.
  for (let index = 0; index < tabs.length; index++) {
    if (sourceOnly === true || Array.isArray(sourceOnly) && sourceOnly.includes(index) || initialGeneration && index === 0) {
      tabs[index].generated = []; tabs[index].selectedCandidateId = null;
      tabs[index].mode='diagram'; tabs[index].outputEngine=fixtureOptions.sourcePipeline || 'raster';
    }
  }
  if (fixtureOptions.historicalPoint) tabs[0].generated[0].comments = [{ id: 'historical-point', imageId: 'candidate-0', type: 'point', number: 1, x: 20, y: 20, w: 0, h: 0, text: '보존 코멘트' }];

  const generationSends = [];
  const nativeSceneWire = { schema:'5e-fast-scene@1', mode:'diagram', artboard:{w:64,h:48}, elements:[
    {type:'rect',box:[45/8-32,70/8-24,120/8,180/8],tone:'none'},
    {type:'rect',box:[300/8-32,70/8-24,120/8,180/8],tone:'none'},
  ] };
  const observerPlan = {
    version: 4, observationVersion: 1, leaderObservationVersion: 1,
    observationContractRevision: '1.4.0', removalOnlyItems: [], reviewRequired: false,
    geometryLock: { version: 1, objects: [
      { id: 'left-frame', sourceRef: 1, description: 'Controlled left rectangle', bounds: { x: 45/512, y: 70/canvas.height, w: 120/512, h: 180/canvas.height }, relations: [] },
      { id: 'right-frame', sourceRef: 1, description: 'Controlled right rectangle', bounds: { x: 300/512, y: 70/canvas.height, w: 120/512, h: 180/canvas.height }, relations: [] },
    ] },
    labels: [], removalRegions: [], protectedRegions: [], preservedMarks: [], uncertainties: [],
  };
  const reviewChecks = ['object-counts','inside-outside','liquid-occupancy','connections','composition-state','black-fill-meaning','presentation','request-scope','kice-flat-style','flat-gray-regions','raster-label-removal','editable-label-coverage','leader-relations','label-overlay-alignment','label-typography','leader-overlay'];
  const reviewReport = { verdict: 'pass', checks: reviewChecks.map(id => ({ id, label: id, status: 'pass', detail: 'Controlled transport fixture for queue and ownership regression; not provider quality evidence' })), issues: [] };
  function deliver(send, method, params) {
    for (const listener of listeners) listener({ clientScope: send.payload.clientScope || '', method, params });
  }
  function mockObserver(send) {
    const text = String(send.payload.text || '');
    let response;
    if (text.includes('입력 원본 라벨 관찰')) { send.stage = 'source-observation'; response = observerPlan; }
    else if (text.includes('검수') || text.includes('FINAL_NATIVE_OVERLAY')) { send.stage = 'full-review'; response = reviewReport; }
    else throw new Error('Unrecognized non-image fixture request: ' + text.slice(0,200));
    // Deliver only the normal correlated bridge protocol, after the RPC binds.
    setTimeout(() => {
      deliver(send, 'item/completed', { turnId: send.turnId, item: { type: 'agentMessage', phase: 'final_answer', text: JSON.stringify(response) } });
      deliver(send, 'turn/completed', { turn: { id: send.turnId, status: 'completed' } });
    }, 0);
  }
  let statusGate = null;
  window.__task2 = {
    original, modified, sends, generationSends, seededTabs: structuredClone(tabs), longTasks: [],
    emitGeneration(index, kind) { this.emit(sends.indexOf(generationSends[index]), kind); },
    autoFinalizeGeneration(index) { this.autoFinalize(sends.indexOf(generationSends[index])); },
    delayStatus() { statusGate = {}; statusGate.promise = new Promise(resolve => { statusGate.resolve = resolve; }); },
    releaseStatus() { statusGate?.resolve({ login: { loggedIn: true }, server: true }); statusGate = null; },
    autoFinalize(index) {
      const send = sends[index];
      const deliver = (method, params) => {
        for (const listener of listeners) listener({ clientScope: send.payload.clientScope || '', method, params });
      };
      for (const state of ['interrupting', 'interruptAccepted']) deliver('5e/image-finalization', { turnId: send.turnId, state });
      deliver('turn/completed', { turn: { id: send.turnId, status: 'interrupted' } });
    },
    emit(index, kind) {
      const send = sends[index];
      const params = { turnId: send.turnId };
      let method;
      if (kind === 'image') { method = 'item/completed'; params.item = send.stage==='native-generation' ? { type:'agentMessage', phase:'final_answer', text:JSON.stringify(nativeSceneWire) } : { type: 'imageGeneration', imageDataUrl: modified }; }
      else if (kind === 'error') { method = 'error'; params.error = { message: 'late synthetic error' }; }
      else { method = 'turn/completed'; params.turn = { id: send.turnId, status: 'completed' }; }
      for (const listener of listeners) listener({ clientScope: send.payload.clientScope || '', method, params });
    },
  };
  window.__task2.longTaskSupported = PerformanceObserver.supportedEntryTypes.includes('longtask');
  if (window.__task2.longTaskSupported) new PerformanceObserver(list => window.__task2.longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration })))).observe({ type: 'longtask', buffered: false });
  window.fiveEDesktop = {
    web: true, status: async () => statusGate ? statusGate.promise : ({ login: { loggedIn: true }, server: true }),
    start: async () => ({ ok: true }), stop: async () => ({ ok: true }),
    models: async () => { window.__task2.catalogReads = (window.__task2.catalogReads || 0) + 1; return { data: [{ model: 'gpt-6.1-sol', displayName: 'Sol 6.1', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: missingCapabilities ? undefined : ['medium'], serviceTiers: ['priority'] }, { model: 'gpt-6-luna', displayName: 'Luna 6', defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'] }].filter(entry => !localStorage.getItem('task7-drop-luna') || entry.model !== 'gpt-6-luna') }; },
    captureSources: async () => [{name:'통합 캡처',data:original}],
    account: async () => ({ rateLimits: {} }), login: async () => {},
    send: async payload => {
      const turnId = `turn-${sends.length}`, threadId = `thread-${sends.length}`;
      sends.push({ payload, turnId, threadId });
      const sent = sends.at(-1);
      if (payload.purpose === 'image' || payload.purpose === 'scene' && String(payload.text).includes('5e-fast-scene@1')) { sent.stage = payload.purpose === 'image' ? 'image-generation' : 'native-generation'; generationSends.push(sent); }
      else mockObserver(sent);
      window.dispatchEvent(new Event('qa:bridge-send'));
      return { turnId, threadId };
    },
    interrupt: async () => ({ ok: true }),
    onEvent: callback => { listeners.add(callback); return () => listeners.delete(callback); },
    onState: () => () => {}, onLog: () => () => {}, setAiTaskShortcutActive() {}, onAiCloseTaskShortcut: () => () => {},
  };
  window.__seedReady = (async () => {
    if (fixtureOptions.nativeHistory) {
      // Init-script import() in WebKit otherwise resolves against web-inspector://bootstrap.js.
      const nativeModuleBase=new URL(fixtureOptions.runtime.base,window.location.href).href;
      const nativeSeedURLs=['ai-scene-fastpath.js','ai-scene-preview.js'].map(name=>new URL(name+fixtureOptions.runtime.query,nativeModuleBase).href);
      const sameOrigin=nativeSeedURLs.every(value=>new URL(value).origin===window.location.origin);
      const canonical=nativeSeedURLs.every((value,index)=>new URL(value).pathname===fixtureOptions.runtime.base+['ai-scene-fastpath.js','ai-scene-preview.js'][index]
        && new URL(value).search===fixtureOptions.runtime.query);
      window.__task2.nativeSeedModuleIdentity={entryURL:window.location.href,origin:window.location.origin,moduleBase:nativeModuleBase,canonicalModulePath:fixtureOptions.runtime.base,query:fixtureOptions.runtime.query,urls:nativeSeedURLs,sameOrigin,canonical};
      if(!sameOrigin || !canonical || !['http:','https:'].includes(new URL(nativeModuleBase).protocol))throw new Error('Native history imports must use exact canonical modules from the actual owned page origin');
      const {compileFastScene}=await import(nativeSeedURLs[0]);
      const {fastSceneToSvgDataUrl}=await import(nativeSeedURLs[1]);
      // Retained native compatibility path: actual compiled scene, SVG preview,
      // no PNG input attachment and no bypass of the explicit label guard.
      tabs[0].attachments=[]; tabs[0].mode='diagram'; tabs[0].outputEngine='raster';
      for(const [index,item] of tabs[0].generated.entries()) {
        const wire=structuredClone(nativeSceneWire);
        if(index===1)wire.elements.push({type:'rect',box:[225/8-32,300/8-24,50/8,50/8],tone:'gray'});
        const scene=compileFastScene(wire,{strict:true,idPrefix:item.id});
        if(!scene.valid || !scene.supported || scene.objects.length!==wire.elements.length || scene.errors.length || scene.unsupported.length)throw new Error('Native history fixture failed the actual compiler: '+JSON.stringify({valid:scene.valid,supported:scene.supported,objectCount:scene.objects.length,inputCount:wire.elements.length,errors:scene.errors,unsupported:scene.unsupported}));
        item.sceneResult=scene;item.sceneSource=JSON.stringify(wire);item.sceneCompileSource=item.sceneSource;
        item.engine='fast-scene';item.data=fastSceneToSvgDataUrl(scene);
      }
      window.__task2.seededTabs=structuredClone(tabs);
    }
    return new Promise((resolve, reject) => {
    const request = indexedDB.open('5e.preview:5e-ai-image-tasks', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('tasks', { keyPath: 'key' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result; const tx = db.transaction('tasks', 'readwrite');
      const stored = tx.objectStore('tasks').get('workspace');
      stored.onsuccess = () => { if (!stored.result) tx.objectStore('tasks').put({ key: 'workspace', tabs, activeTaskTabId: tabs[0].id, taskTabSerial: count + 1, imageSerial: count * 2 }); };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  });
  })();
}

async function requestBrowserFixture(context, count, evidence, { initialGeneration = false, missingCapabilities = false, mode = 'pro', scoped = false, serviceCap = 10, badTask = false, sourceOnly = false, fixtureOptions = {} } = {}) {
  const { fixtureContext, installAiMain } = require(path.join(root, 'tests/helpers/canonical-fixture-adapter.cjs'));
  const { runtime, runtimeInit, inspectEntry, startServer, stopServer, mixedCandidate } = fixtureContext(root);
  const http = require('node:http');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const server = http.createServer((request, response) => {
    let file = path.resolve(root, `.${new URL(request.url, 'http://localhost').pathname}`);
    if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    if (file.endsWith('/preview') || request.url.split('?')[0].endsWith('/')) file = path.join(file, 'index.html');
    fs.readFile(file, (error, body) => {
      response.writeHead(error ? 404 : 200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      response.end(error ? 'missing' : body);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const engine = process.env.TASK2_ENGINE === 'webkit' ? webkit : chromium;
  const moduleNetwork = [];
  let contextClosing = false;
  const browser = await engine.launch({ headless: true });
  const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await browserContext.tracing.start({ screenshots: true, snapshots: true });
  context.after(async () => {
    const finalPage = browserContext.pages()[0], cleanupErrors = [];
    let requests = null;
    const recordError = error => cleanupErrors.push(error);
    try {
      if (finalPage && !finalPage.isClosed()) {
        const diagnostic = await finalPage.evaluate(() => [...document.querySelectorAll('[data-ai-busy]')].map(panel => ({ id: panel.id, busy: panel.dataset.aiBusy, phase: panel.dataset.aiRequestPhase, status: panel.querySelector('[data-ai-status]')?.textContent, log: panel.querySelector('[data-ai-log]')?.textContent })));
        fs.writeFileSync(path.join(evidence, `diagnostic-${count}.json`), JSON.stringify(diagnostic, null, 2));
        if(fixtureOptions.nativeHistory){
          const identity=await finalPage.evaluate(()=>window.__task2?.nativeSeedModuleIdentity || null);
          fs.writeFileSync(path.join(evidence,'native-seed-module-identity.json'),JSON.stringify(identity,null,2));
        }
        requests = await finalPage.evaluate(() => window.__task2.sends);
        fs.writeFileSync(path.join(evidence, `all-transport-${count}.json`), JSON.stringify(requests, null, 2));
      }
    } catch (error) { recordError(error); }
    // Cleanup must run even when evidence capture or a transport oracle fails.
    try { await browserContext.tracing.stop({ path: path.join(evidence, `trace-${count}.zip`) }); } catch (error) { recordError(error); }
    let browserContextClosed = false;
    contextClosing = true;
    try { await browserContext.close(); browserContextClosed = true; } catch (error) { recordError(error); }
    try { fs.writeFileSync(path.join(evidence, `module-network-${count}.json`), JSON.stringify(moduleNetwork,null,2)); } catch (error) { recordError(error); }
    try { await browser.close(); } catch (error) { recordError(error); }
    const port = server.address()?.port;
    try { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); } catch (error) { recordError(error); }
    fs.writeFileSync(path.join(evidence, `cleanup-${count}.json`), JSON.stringify({ engine: process.env.TASK2_ENGINE || 'chromium', browserVersion: browser.version(), browserContextClosed, browserClosed: !browser.isConnected(), serverClosed: !server.listening, serverPort: port, errors: cleanupErrors.map(error => String(error.stack || error)) }));
    if (cleanupErrors.length) throw new AggregateError(cleanupErrors, 'Fixture capture/cleanup failed; original errors retained');
    assert.ok(Array.isArray(requests), 'Full transport evidence must be captured');
    assert.ok(requests.every(send => ['image-generation','native-generation','source-observation','full-review'].includes(send.stage)), 'Every actual transport request must be accounted for');
    assert.equal(requests.filter(send => ['source-observation','full-review'].includes(send.stage)).every(send => send.payload.purpose === 'scene' && send.payload.model === 'gpt-6-luna' && send.payload.effort === 'medium' && send.payload.serviceTier === 'priority'), true, 'Observer/review turns retain the actual tool-free Luna contract');
  });
  const page = await browserContext.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('TASK2 PAGE ERROR', error.message); });
  page.on('requestfailed', request => moduleNetwork.push({event:'requestfailed',url:request.url(),method:request.method(),resourceType:request.resourceType(),failure:request.failure(),contextClosing}));
  page.on('response', response => moduleNetwork.push({event:'response',url:response.url(),status:response.status(),resourceType:response.request().resourceType(),contentType:response.headers()['content-type'] || null,contextClosing}));
  await page.addInitScript({ content: `(${seedRequestWorkspaces.toString()})(${count}, ${initialGeneration}, ${missingCapabilities}, ${JSON.stringify(mode)}, ${JSON.stringify(scoped)}, ${badTask}, ${JSON.stringify(sourceOnly)}, ${JSON.stringify({...fixtureOptions, runtime:runtimeInit})})` });
  await installAiMain(page, root, {}, evidence);
  const entryReceipt = await inspectEntry(page, `http://127.0.0.1:${server.address().port}`, runtime);
  await page.evaluate(() => window.__seedReady);
  if(fixtureOptions.nativeHistory){
    const identity=await page.evaluate(()=>window.__task2.nativeSeedModuleIdentity);
    assert.ok(identity,'Actual native seed module receipt is present');
    assert.equal(identity.origin,new URL(entryReceipt.entryUrl).origin);
    assert.equal(identity.sameOrigin,true);
    assert.equal(identity.canonical,true);
    assert.deepEqual(identity.urls,['ai-scene-fastpath.js','ai-scene-preview.js'].map(name=>new URL(entryReceipt.moduleBase+name+entryReceipt.moduleQuery,entryReceipt.entryUrl).href));
    fs.writeFileSync(path.join(evidence,'native-seed-module-identity.json'),JSON.stringify(identity,null,2));
  }
  fs.writeFileSync(path.join(evidence, 'entry-' + count + '.json'), JSON.stringify(entryReceipt, null, 2));
  const welcome = page.locator('.tut-welcome-overlay .tut-banner-no');
  if (await welcome.isVisible()) await welcome.click();
  await page.locator('#ai-image-install-open').click();
  if (!initialGeneration && !(sourceOnly === true || Array.isArray(sourceOnly) && sourceOnly.includes(0))) await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-ai-candidate-option][aria-selected="true"]'));
  await page.waitForFunction(() => [...document.querySelectorAll('#ai-image-panel .ai-image-card img')].some(image => image.naturalWidth === 512));
  assert.deepEqual(errors, [], 'real app boot must have no runtime errors');

  if (fixtureOptions.nativeHistory) {
    const ids=await page.evaluate(()=>window.__task2.seededTabs.map(tab=>tab.id));
    for(const id of ids){
      await page.locator('#ai-image-panel [data-tab-id="'+id+'"] .ai-task-tab-select').click();
      await page.waitForFunction(id=>document.querySelector('#ai-image-panel [data-tab-id="'+id+'"] .ai-task-tab-select')?.getAttribute('aria-pressed')==='true',id);
      await page.waitForFunction(()=>[...document.querySelectorAll('#ai-image-panel .ai-image-card img')].some(image=>image.naturalWidth===512));
    }
    await page.locator('#ai-image-panel [data-tab-id="'+ids[0]+'"] .ai-task-tab-select').click();
    await page.waitForFunction(id=>document.querySelector('#ai-image-panel [data-tab-id="'+id+'"] .ai-task-tab-select')?.getAttribute('aria-pressed')==='true',ids[0]);
  }
  const baseline = await page.evaluate(async () => (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs));
  if (fixtureOptions.nativeHistory) {
    const seeded=await page.evaluate(()=>structuredClone(window.__task2.seededTabs));
    assert.equal(baseline.length,seeded.length);
    assert.equal(new Set(baseline.map(tab=>tab.id)).size,seeded.length);
    for(const originalTab of seeded){
      const canonical=baseline.find(tab=>tab.id===originalTab.id);
      assert.ok(canonical,'The original owner remains in the real canonical baseline');
      for(const field of Object.keys(originalTab).filter(field=>!['attachments','generated'].includes(field))){
        assert.equal(Object.hasOwn(canonical,field),true,'Originally seeded task field remains present: '+field);
        assert.deepEqual(canonical[field],originalTab[field],'Real preparation preserves the original task field: '+field);
      }
      for(const key of ['attachments','generated']){
        assert.equal(canonical[key].length,originalTab[key].length);
        for(let index=0;index<originalTab[key].length;index++){
          const originalItem=originalTab[key][index],canonicalItem=canonical[key][index];
          for(const field of Object.keys(originalItem)){
            assert.equal(Object.hasOwn(canonicalItem,field),true,'Original '+key+' field remains present: '+field);
            assert.deepEqual(canonicalItem[field],originalItem[field],'Real normalization preserves every originally seeded '+key+' field, source byte and native scene: '+field);
          }
        }
      }
    }
    fs.writeFileSync(path.join(evidence,'native-canonical-baseline-proof.json'),JSON.stringify({seeded,canonical:baseline,allOriginalImageFieldsExact:true},null,2));
  }
  fs.writeFileSync(path.join(evidence, 'fixture-baseline.json'), JSON.stringify(baseline, null, 2));
  return { page, errors, baseline };
}


async function currentPrimaryAction(page) {
  const panel = page.locator('#ai-image-panel');
  assert.equal(await panel.count(), 1, 'Exactly one actual active workbench');
  await page.waitForFunction(() => ['preparation', 'result'].includes(document.querySelector('#ai-image-panel')?.dataset.aiStage));
  const stage = await panel.getAttribute('data-ai-stage');
  assert.ok(['preparation', 'result'].includes(stage), 'Submission begins only in a real idle workbench stage: ' + stage);
  // 2026-10-16(83201a54)부터 이미지 작업은 준비 단계에서도 아래 '변환하기' 하나만 보인다. 그래프 작업만 준비 칸의 버튼을 쓴다.
  const graph = await panel.getAttribute('data-ai-workflow') === 'graph';
  const selector = stage === 'preparation' && graph ? '[data-ai-send]' : '[data-ai-comments-apply]';
  const button = page.locator('#ai-image-panel[data-ai-stage="' + stage + '"] ' + selector);
  assert.equal(await button.count(), 1, 'Exactly one canonical primary action bound to ' + stage);
  assert.equal(await button.isVisible(), true, 'The actual current primary action must be physically visible');
  assert.equal(await button.isEnabled(), true, 'The actual current primary action must be enabled');
  assert.equal(await panel.getAttribute('data-ai-stage'), stage, 'The selected primary stays in the observed stage');
  return button;
}

const active = '#ai-image-panel';
async function chooseModel(page, choice) { await page.locator(`${active} [data-ai-setting-key="model"] [data-ai-model-choice="${choice}"]`).click(); }
async function setting(page, key, value) {
  const contract = await page.evaluate(async ({ key, value }) => {
    const panel = document.querySelector('#ai-image-panel');
    const snapshot = await window.__task2Manager.sharingSnapshot();
    const workspace = snapshot.workspaces[snapshot.activeWorkspace];
    const tab = workspace?.tabs.find(tab => tab.id === workspace.activeTaskTabId);
    if (!tab) throw new Error('Actual active workspace and task are required');
    const selectedId = panel.dataset.aiSelectedCandidateId;
    const item = tab.generated.find(item => item.id === selectedId);
    const { isHistoricalPngLocalResult, canChooseLocalOutput } = await import(window.__runtime.base + 'ai-output-processing.js' + window.__runtime.query);
    // Empty source and historical candidate are distinct real controller owners.
    // A modern/bound result cannot be reclassified into either settings branch.
    const source = !selectedId && tab.generated.length === 0;
    if (!source && (!item || !isHistoricalPngLocalResult(item))) {
      throw new Error('Local settings require a genuine empty source or historical PNG candidate');
    }
    return { taskId: tab.id, selectedId, source, historical: Boolean(item && isHistoricalPngLocalResult(item)),
      allowed: canChooseLocalOutput(item || null, key, value, { mode: document.documentElement.dataset.mode,
        busy: panel.dataset.aiBusy === 'true', readOnly: panel.dataset.aiSharingMode === 'view', separationMode: tab.separationMode }),
      selector: source ? '[data-ai-compact-settings]' : '[data-ai-legacy-result-settings]' };
  }, { key, value });
  assert.equal(contract.allowed, true, 'The actual output eligibility/controller permits this choice');
  assert.equal(contract.source !== contract.historical, true, 'Exactly one authentic settings contract applies');
  const owner = page.locator(`${active} ${contract.selector}`);
  assert.equal(await owner.count(), 1, 'One actual settings owner');
  assert.equal(await owner.isVisible(), true, 'The current source or historical settings owner is physically visible');
  const button = owner.locator(`[data-ai-setting-key="${key}"] [data-ai-setting-value="${value}"]`);
  assert.equal(await button.count(), 1, 'One actual exposed choice');
  assert.equal(await button.isVisible(), true, 'No hidden native/legacy choice is used');
  assert.equal(await button.isEnabled(), true, 'The real controller enables the exposed choice');
  await button.click();
  const native = key === 'background' ? '[data-ai-background-policy]' : '[data-ai-separation-mode]';
  assert.equal(await page.locator(`${active} ${native}`).inputValue(), value, 'The visible setting delegates to the original native controller');
}
async function refreshModels(page) {
  await page.click(`${active} [data-ai-connection-open]`);
  await page.locator(`${active} [data-ai-connection-dialog][open] [data-ai-model-refresh]`).click();
  await page.locator(`${active} [data-ai-connection-dialog][open] [data-ai-info-close]`).click();
}
async function task(page, index) { await page.locator(`${active} [data-tab-id="task-${index}"] .ai-task-tab-select`).click(); await page.waitForFunction(index => document.querySelector('#ai-image-panel [data-tab-id="task-'+index+'"] .ai-task-tab-select')?.getAttribute('aria-pressed') === 'true', index); }
async function chooseRevision(page, id) { await page.click(`${active} [data-ai-version-button]`); await page.click(`${active} [data-ai-candidate-option="${id}"]`); }
async function openPanel(page) { await page.click('#ai-image-install-open'); await page.locator(active).waitFor({state:'visible'}); }
async function objects(page) { return page.evaluate(() => structuredClone(window.__integrationState.get().objects)); }

for (const engine of ['chromium', 'webkit']) {
  test(`integrated selected revision, local separation, model settings, crop and canvas undo in ${engine}`, {timeout:120000}, async context => {
    process.env.TASK2_ENGINE = engine;
    const evidence = path.join(evidenceRoot, engine, 'happy'); fs.mkdirSync(evidence,{recursive:true});
    const settingsEvidence=path.join(evidence,'source-settings');fs.mkdirSync(settingsEvidence,{recursive:true});
    const settingsFixture=await requestBrowserFixture(context,2,settingsEvidence,{sourceOnly:true});
    const settingsPage=settingsFixture.page;
    assert.equal(await settingsPage.locator(`${active} [data-ai-model]`).inputValue(),'gpt-6-luna');
    assert.deepEqual(await settingsPage.locator(`${active} [data-ai-effort] option`).evaluateAll(nodes=>nodes.map(node=>node.value)),['medium']);
    assert.equal(await settingsPage.locator(`${active} [data-ai-speed]`).inputValue(),'priority');
    await chooseModel(settingsPage,'sol');await chooseModel(settingsPage,'luna');
    await settingsPage.click(`${active} [data-ai-comment-tool="point"]`);
    await settingsPage.locator(`${active} .ai-image-card:not(.ai-generated-card) .ai-preview-stage > img`).first().click({position:{x:80,y:80}});
    await settingsPage.locator(`${active} [data-ai-comment-marker]`).first().waitFor();
    assert.equal(await settingsPage.locator(`${active} [data-ai-comment-marker]`).count(),1,'Actual physical point creation stays available on the input source');
    await setting(settingsPage,'background','preserve');await setting(settingsPage,'objects','auto');
    assert.equal(await settingsPage.locator(`${active} [data-ai-background-policy]`).inputValue(),'connected');
    assert.equal(await settingsPage.locator(`${active} [data-ai-background-policy]`).isDisabled(),true);
    assert.match(await settingsPage.locator(`${active} [data-ai-background-policy]`).getAttribute('title'),/한 장으로 전환/);
    await task(settingsPage,1);
    assert.equal(await settingsPage.locator(`${active} [data-ai-model]`).inputValue(),'gpt-6.1-sol');
    assert.equal(await settingsPage.locator(`${active} [data-ai-speed]`).inputValue(),'priority');
    await task(settingsPage,0);
    assert.equal(await settingsPage.locator(`${active} [data-ai-effort]`).inputValue(),'medium');
    assert.equal(await settingsPage.locator(`${active} [data-ai-speed]`).inputValue(),'priority');
    assert.equal(await settingsPage.locator(`${active} [data-ai-separation-mode]`).inputValue(),'auto');
    await setting(settingsPage,'objects','off');
    assert.equal(await settingsPage.locator(`${active} [data-ai-background-policy]`).inputValue(),'preserve');
    assert.equal(await settingsPage.locator(`${active} [data-ai-background-policy]`).isEnabled(),true);
    assert.equal(await settingsPage.evaluate(()=>window.__task2.sends.length),0,'All local source settings and point creation remain provider-free');
    const {page,errors} = await requestBrowserFixture(context,2,evidence,{fixtureOptions:{separationMode:'auto',historicalPoint:true}});
    assert.deepEqual(settingsFixture.errors,[]);
    await chooseRevision(page,'candidate-0');
    await page.click(`${active} [data-ai-compare]`);
    await page.locator(`${active} .ai-inline-comparison .ai-comparison`).waitFor();
    assert.equal(await page.locator('.ai-comparison-overlay').count(), 0);
    assert.equal(await page.locator(`${active} .ai-inline-comparison .ai-comparison`).evaluate(node => getComputedStyle(node).fontFamily.includes('IBM Plex Sans KR')), true);
    assert.equal(await page.getByRole('button',{name:'나란히 비교',exact:true}).count(), 0);
    assert.equal(await page.getByLabel('오른쪽 비교 버전',{exact:true}).inputValue(),'candidate-0');
    assert.equal(await page.getByLabel('왼쪽 비교 버전',{exact:true}).inputValue(),'source-0');
    await page.getByLabel('왼쪽 비교 버전',{exact:true}).selectOption('latest-0');
    assert.equal(await page.locator('.ai-comparison').getAttribute('data-mode'), 'wipe');
    await page.screenshot({path:path.join(evidence,'selected-comparison.png')});
    await page.click(`${active} [data-ai-compare]`);
    assert.equal(await page.locator(`${active} .ai-inline-comparison .ai-comparison`).count(), 0);
    assert.equal(await page.locator(`${active} .ai-generated-card .ai-image-card-head > strong`).first().evaluate(node => getComputedStyle(node).display), 'none');
    assert.equal(await page.locator(`${active} [data-ai-comment-tool="point"]`).isVisible(),false,'Generated PNG keeps area-only editing');
    assert.equal(await page.locator(`${active} [data-ai-comments-apply]`).isDisabled(),true,'A historical point cannot authorize whole-PNG regeneration');
    await page.locator(`${active} [data-ai-comment-marker]`).first().waitFor();
    const commentRows = await page.locator(`${active} [data-ai-comment-row]`).count();
    await page.click(`${active} [data-ai-comment-visibility]`);
    assert.equal(await page.locator(`${active} [data-ai-comment-visibility]`).getAttribute('aria-pressed'), 'false');
    await page.waitForFunction(() => {
      const markers = [...document.querySelectorAll('#ai-image-panel [data-ai-comment-marker]')];
      return markers.length > 0 && markers.every(node => getComputedStyle(node).display === 'none');
    });
    assert.equal(await page.locator(`${active} [data-ai-comment-row]`).count(), commentRows);
    await page.click(`${active} [data-ai-comment-visibility]`);
    await page.waitForFunction(() => [...document.querySelectorAll('#ai-image-panel [data-ai-comment-marker]')].some(node => node.isConnected && getComputedStyle(node).display !== 'none'));
    await page.click(`${active} [data-ai-comment-tool="pan"]`);
    await page.click(`${active} [data-ai-compare]`);
    await page.waitForFunction(() => document.querySelector('.ai-comparison-right .ai-comparison-markers circle') && document.querySelector('.ai-comparison-right image')?.getAttribute('href'));
    assert.equal(await page.locator('.ai-comparison-right .ai-comparison-markers text').first().textContent(), '1');
    assert.equal(await page.locator('.ai-comparison-left .ai-comparison-markers circle').count(), 0);
    await page.click(`${active} [data-ai-comment-visibility]`);
    assert.equal(await page.locator('.ai-comparison-right .ai-comparison-markers').evaluate(node => getComputedStyle(node).display), 'none');
    await page.click(`${active} [data-ai-comment-visibility]`);
    await page.click(`${active} [data-ai-compare]`);
    assert.equal(await page.locator(`${active} select[data-ai-generation-mode]`).inputValue(),'separated');
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-ai-editable-groups]')?.dataset.aiSeparationState==='ready');
    assert.equal(await page.locator(`${active} [data-ai-background-policy]`).inputValue(),'connected');
    assert.equal(await page.locator(`${active} [data-ai-background-policy]`).isDisabled(),true);
    assert.match(await page.locator(`${active} [data-ai-background-policy]`).getAttribute('title'),/한 장으로 전환/);
    assert.equal(await page.evaluate(()=>window.__task2.generationSends.length),0);assert.equal(await page.evaluate(()=>window.__task2.sends.length),0, 'Blocked input must send neither generation nor observation');
    await page.click(`${active} [data-ai-editable-groups]`);
    await page.waitForFunction(()=>document.querySelector('.aea-count')?.textContent==='2');
    assert.equal(await page.locator('.aea-thumbnail').count(),2);
    await page.screenshot({path:path.join(evidence,'selected-separated.png')});
    await page.click('.aea-dialog [data-action="insert"]');
    await page.locator(active).waitFor({state:'hidden'});
    const separated = await objects(page);
    assert.equal(separated.filter(item=>item.editableAssetRegionId).length,2);
    assert.ok(separated.every(item=>item.aiCandidateId==='candidate-0'));
    await page.click('#undo-btn');
    assert.equal((await objects(page)).length,0);
    await openPanel(page);
    await task(page,1);
    assert.equal(await page.locator(`${active} [data-ai-model]`).inputValue(),'gpt-6.1-sol');
    assert.equal(await page.locator(`${active} [data-ai-speed]`).inputValue(),'priority');
    await task(page,0);
    assert.equal(await page.locator(`${active} [data-ai-effort]`).inputValue(),'medium');
    assert.equal(await page.locator(`${active} [data-ai-speed]`).inputValue(),'priority');
    assert.equal(await page.locator(`${active} [data-ai-separation-mode]`).inputValue(),'auto');
    // The single-image insertion leg uses the same two original PNG revisions,
    // preconfigured off, since generated PNGs expose no conversion settings.
    const singleEvidence=path.join(evidence,'single-history');fs.mkdirSync(singleEvidence,{recursive:true});
    const singleFixture=await requestBrowserFixture(context,2,singleEvidence);
    const singlePage=singleFixture.page;await chooseRevision(singlePage,'candidate-0');
    assert.equal(await singlePage.locator(`${active} [data-ai-background-policy]`).inputValue(),'preserve');
    assert.equal(await singlePage.locator(`${active} [data-ai-background-policy]`).isEnabled(),true);
    assert.equal(await singlePage.locator(`${active} [data-ai-insert-selected]`).textContent(),'캔버스에서 편집');
    await singlePage.click(`${active} [data-ai-insert-selected]`);
    await singlePage.locator(active).waitFor({state:'hidden'});
    const single=await objects(singlePage); assert.equal(single.length,1); assert.equal(single[0].aiCandidateId,'candidate-0');
    await singlePage.click('#undo-btn'); assert.equal((await objects(singlePage)).length,0);
    await openPanel(singlePage);
    assert.equal(await singlePage.locator(`${active} [data-ai-capture]`).count(),0,'retired capture entry must not reappear');
    assert.equal(await singlePage.locator('#ai-capture-magnifier').count(),0);
    assert.equal(await singlePage.locator('.ai-crop-dialog').count(),0);
    const snapshots=await singlePage.evaluate(async()=> (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(item=>item.tabs));
    assert.equal(snapshots.some(tab=>tab.attachments.some(item=>item.name.includes('캡처'))),false);
    assert.equal(snapshots.find(tab=>tab.id==='task-0').generated[0].data,await singlePage.evaluate(()=>window.__task2.original));
    assert.equal(await singlePage.evaluate(()=>window.__task2.generationSends.length),0);assert.equal(await singlePage.evaluate(()=>window.__task2.sends.length),0, 'Blocked input must send neither generation nor observation');
    assert.deepEqual(singleFixture.errors,[]);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({selectedRevision:'candidate-0',separatedObjects:separated.length,singleObjects:single.length,undoObjects:0,localSeparationSends:0,captureEntryRemoved:true,modelRestored:true,backgroundRestored:true,physicalSourcePointCreated:true,historicalPointPreserved:true,originalPreserved:snapshots.find(tab=>tab.id==='task-0').generated[0].data===await singlePage.evaluate(()=>window.__task2.original)},null,2));
  });
}

for (const engine of ['chromium','webkit']) {
  test(`captured model payload and invalid effort refusal in ${engine}`,{timeout:60000},async context=>{
    process.env.TASK2_ENGINE=engine;
    const evidence=path.join(evidenceRoot,engine,'models');fs.mkdirSync(evidence,{recursive:true});
    const {page,errors,baseline}=await requestBrowserFixture(context,3,evidence,{sourceOnly:true});
    await chooseModel(page,'luna');
    await page.evaluate(()=>window.__task2.delayStatus());
    await page.click(`${active} [data-ai-send]`);
    await task(page,1);
    await page.evaluate(()=>window.__task2.releaseStatus());
    await page.waitForFunction(()=>window.__task2.generationSends.length===1);
    const pendingCard = page.locator(`${active} [data-tab-id="task-0"]`);
    assert.equal(await pendingCard.getAttribute('data-work-state'), 'busy');
    assert.equal(await pendingCard.locator('.ai-task-tab-thumb-frame').evaluate(node => getComputedStyle(node, '::after').animationName), 'ai-task-thumbnail-sheen');
    const payload=await page.evaluate(()=>{const {model,effort,serviceTier}=window.__task2.generationSends[0].payload;return {model,effort,serviceTier};});
    assert.deepEqual(payload,{model:'gpt-6-luna',effort:'medium',serviceTier:'priority'});
    await page.evaluate(()=>{window.__task2.emitGeneration(0,'image');window.__task2.emitGeneration(0,'done');});
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-tab-id="task-0"]').dataset.workState==='completed');
    assert.equal(await pendingCard.locator('.ai-task-tab-thumb-frame').evaluate(node => getComputedStyle(node, '::after').animationName), 'none');
    await task(page,0);
    const completed=await page.evaluate(async()=>(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(w=>w.tabs).find(t=>t.id==='task-0'));
    assert.equal(completed.generated.length,baseline.find(t=>t.id==='task-0').generated.length+1);
    assert.equal(await page.locator(`${active} [data-ai-comments-apply]`).isDisabled(),true,'No-area generated PNG cannot become a whole revision request');
    const callsBeforeInvalid=await page.evaluate(()=>window.__task2.sends.length);
    await task(page,1);await chooseModel(page,'sol');await chooseModel(page,'luna');
    const freshRequest='원본 아래쪽 빈 공간에 작은 사각형 하나를 추가해 주세요.';
    const freshInput=page.locator(`${active} [data-ai-input]`);
    assert.equal(await freshInput.isVisible(),true,'Distinct first-conversion request uses its real visible input');
    await freshInput.fill(freshRequest);
    assert.equal(await freshInput.inputValue(),freshRequest);
    assert.equal(await page.locator(`${active} [data-ai-effort]`).inputValue(),'medium','Actual permitted Sol→Luna switch retains supported medium');
    assert.equal(await page.locator(`${active} [data-ai-model-warning]`).evaluate(node=>node.hidden),true,'Supported choices clear the underlying warning even when the connection dialog is closed');
    // Controlled obsolete saved preference, never a physical hidden-control action.
    await page.locator(`${active} [data-ai-effort]`).evaluate(select=>{select.add(new Option('ultra · 사용할 수 없음','ultra'));select.value='ultra';select.dispatchEvent(new Event('change',{bubbles:true}));});
    assert.match(await page.locator(`${active} [data-ai-model-warning]`).textContent(),/ultra/);
    await (await currentPrimaryAction(page)).click();
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false');
    assert.equal(await page.evaluate(()=>window.__task2.generationSends.length),1,'Invalid capabilities must not send or silently substitute');
    assert.equal(await page.evaluate(()=>window.__task2.sends.length),callsBeforeInvalid,'Invalid preflight sends no observation either');
    assert.equal(await page.locator(`${active} [data-ai-retry-interrupted]`).isDisabled(),true,'Invalid fresh preflight cannot expose a prior successful owner as retry');
    await page.screenshot({path:path.join(evidence,'invalid-effort.png')});
    await chooseModel(page,'sol');await chooseModel(page,'luna');
    await (await currentPrimaryAction(page)).click();
    await page.waitForFunction(()=>window.__task2.generationSends.length===2);
    const revision=await page.evaluate(()=>{const {model,effort,serviceTier}=window.__task2.generationSends[1].payload;return {model,effort,serviceTier};});
    assert.deepEqual(revision,payload);
    await page.click(`${active} [data-ai-interrupt]`);
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false');
    const callsBeforeStale=await page.evaluate(()=>window.__task2.sends.length);
    await page.evaluate(()=>localStorage.setItem('task7-drop-luna','true'));
    await refreshModels(page);
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-ai-model-warning]').textContent.includes('gpt-6-luna'));
    assert.equal(await page.locator(`${active} [data-ai-model]`).inputValue(),'gpt-6-luna');
    await (await currentPrimaryAction(page)).click();
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false');
    assert.equal(await page.evaluate(()=>window.__task2.generationSends.length),2);
    assert.equal(await page.evaluate(()=>window.__task2.sends.length),callsBeforeStale);
    const finalCompleted=await page.evaluate(async()=>(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(w=>w.tabs).find(t=>t.id==='task-0'));
    for(const key of ['generated','attachments','selectedCandidateId'])assert.deepEqual(finalCompleted[key],completed[key], 'Completed peer owner '+key+' remains exact throughout invalid/stale requests');
    await page.screenshot({path:path.join(evidence,'stale-model.png')});
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({payload,revision,invalidChoicePreserved:true,staleModelPreserved:true,invalidSendCount:0},null,2));
  });
  test(`missing capabilities and stale task insertion in ${engine}`,{timeout:60000},async context=>{
    process.env.TASK2_ENGINE=engine;
    const evidence=path.join(evidenceRoot,engine,'adverse');fs.mkdirSync(evidence,{recursive:true});
    const preflightEvidence=path.join(evidence,'source-preflight');fs.mkdirSync(preflightEvidence,{recursive:true});
    const preflight=await requestBrowserFixture(context,2,preflightEvidence,{missingCapabilities:true,sourceOnly:true});
    assert.match(await preflight.page.locator(`${active} [data-ai-model-warning]`).textContent(),/기능 정보/);
    await (await currentPrimaryAction(preflight.page)).click();
    await preflight.page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false');
    assert.equal(await preflight.page.evaluate(()=>window.__task2.sends.length),0);
    await preflight.page.screenshot({path:path.join(preflightEvidence,'missing-capabilities.png')});
    assert.deepEqual(preflight.errors,[]);
    const {page,errors}=await requestBrowserFixture(context,2,evidence,{missingCapabilities:true});
    await page.evaluate(()=>{
      const NativeImage=window.Image; const pending=[];
      window.Image=class { naturalWidth=512; naturalHeight=384; set src(value){this.currentSrc=value;pending.push(this);} };
      window.__releaseInsertion=()=>{window.Image=NativeImage;for(const image of pending)image.onload?.();};
      window.__pendingInsertionCount=()=>pending.length;
      window.__insertionOwner=document.querySelector('#ai-image-panel');
    });
    await page.click(`${active} [data-ai-insert-selected]`);
    await page.waitForFunction(()=>window.__pendingInsertionCount()>0);
    await task(page,1);
    await page.evaluate(()=>window.__releaseInsertion());
    await page.waitForFunction(()=>window.__insertionOwner.dataset.aiBusy==='false');
    assert.equal((await objects(page)).length,0);
    assert.match(await page.evaluate(()=>window.__insertionOwner.querySelector('[data-ai-status]').textContent),/삽입 실패/);
    await page.screenshot({path:path.join(evidence,'stale-insertion-blocked.png')});
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({missingCapabilitySendCount:0,staleInsertionCanvasObjects:0,activeTask:'task-1'},null,2));
  });
}

for(const engine of ['chromium','webkit']) test(`Lite background lock, per-task preference and reload in ${engine}`,{timeout:60000},async context=>{
  process.env.TASK2_ENGINE=engine;
  const evidence=path.join(evidenceRoot,engine,'lite');fs.mkdirSync(evidence,{recursive:true});
  const {page,errors}=await requestBrowserFixture(context,2,evidence,{mode:'lite',sourceOnly:true});
  const sourceSettings=page.locator(`${active} [data-ai-compact-settings]`);
  assert.equal(await sourceSettings.count(),1);
  assert.equal(await sourceSettings.isVisible(),true,'Source-only preferences stay in the real compact source settings');
  const background=()=>sourceSettings.locator('[data-ai-setting-key=background]');
  const separation=()=>sourceSettings.locator('[data-ai-setting-key=objects]');
  await separation().locator('[data-ai-setting-value=off]').click();
  await background().locator('[data-ai-setting-value=preserve]').click();
  await separation().locator('[data-ai-setting-value=auto]').click();
  assert.equal(await page.locator(`${active} [data-ai-background-policy]`).inputValue(),'connected');
  assert.equal(await background().locator('[data-ai-setting-value=preserve]').isDisabled(),true);
  assert.equal(await page.locator(`${active} [data-ai-output-processing-status]`).isVisible(),true);
  assert.match(await page.locator(`${active} [data-ai-output-processing-status]`).textContent(),/한 장으로 전환/);
  assert.match(await page.locator(`${active} [data-ai-background-lock-hint]`).textContent(),/한 장으로 전환/);
  const disabled=await background().locator('[data-ai-setting-value=preserve]').boundingBox();
  await page.mouse.click(disabled.x+disabled.width/2,disabled.y+disabled.height/2);
  assert.equal(await page.locator(`${active} [data-ai-background-policy]`).inputValue(),'connected');
  await page.screenshot({path:path.join(evidence,'forced-background.png')});
  await task(page,1);
  await separation().locator('[data-ai-setting-value=off]').click();
  await background().locator('[data-ai-setting-value=connected]').click();
  await task(page,0);
  assert.equal(await page.locator(`${active} [data-ai-separation-mode]`).inputValue(),'auto');
  await separation().locator('[data-ai-setting-value=off]').click();
  assert.equal(await page.locator(`${active} [data-ai-background-policy]`).inputValue(),'preserve');
  await separation().locator('[data-ai-setting-value=auto]').click();
  await page.click(`${active} [data-ai-close]`);
  await page.evaluate(()=>window.__task2Manager.checkpointForClose());
  await page.reload({waitUntil:'networkidle'});await openPanel(page);
  await task(page,0);
  assert.equal(await page.locator(`${active} [data-ai-separation-mode]`).inputValue(),'auto');
  await separation().locator('[data-ai-setting-value=off]').click();
  assert.equal(await page.locator(`${active} [data-ai-background-policy]`).inputValue(),'preserve');
  await task(page,1);
  assert.equal(await page.locator(`${active} [data-ai-background-policy]`).inputValue(),'connected');
  assert.equal(await page.evaluate(()=>window.__task2.generationSends.length),0);assert.equal(await page.evaluate(()=>window.__task2.sends.length),0, 'Blocked input must send neither generation nor observation');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({disabledPointerClickIgnored:true,restoredA:'preserve',restoredB:'connected',survivedReload:true,sends:0},null,2));
});

for (const engine of ['chromium', 'webkit']) {
  for (const model of ['gpt-6.1-sol', 'gpt-6-luna']) {
    test(`white revision auto-finalized completion unlocks area controls in ${engine} ${model}`, { timeout: 60000 }, async context => {
      process.env.TASK2_ENGINE = engine;
      const evidence = path.join(evidenceRoot, engine, `completion-${model}`);
      fs.mkdirSync(evidence, { recursive: true });
      const { page, errors, baseline } = await requestBrowserFixture(context, 2, evidence, {fixtureOptions:{nativeHistory:true}});
      await chooseModel(page,model==='gpt-6.1-sol'?'sol':'luna');
      assert.equal(await page.locator(`${active} [data-ai-effort]`).inputValue(),'medium');
      assert.equal(await page.locator(`${active} [data-ai-speed]`).inputValue(),'priority');
      await (await currentPrimaryAction(page)).click();
      await page.waitForFunction(() => window.__task2.generationSends.length === 1);
      await page.evaluate(() => { window.__task2.emitGeneration(0, 'image'); window.__task2.autoFinalizeGeneration(0); });
      try {
        await page.waitForFunction(() => document.querySelector('#ai-image-panel').dataset.aiBusy === 'false', null, { timeout: 5000 });
        assert.deepEqual(errors, [], 'terminal callback must not throw after registering the generated revision');
        assert.equal(await page.locator(`${active} [data-ai-comment-tool="area"]`).isEnabled(), true);
        const observed = await page.evaluate(async () => ({
          sends: window.__task2.generationSends.map(({ payload }) => ({ model: payload.model, effort: payload.effort, serviceTier: payload.serviceTier })),
          tabs: (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs),
          phase: document.querySelector('#ai-image-panel').dataset.aiRequestPhase,
        }));
        assert.deepEqual(observed.sends, [{ model, effort: 'medium', serviceTier: 'priority' }], 'Disabled legacy review must not send another generation or substitute captured configuration');
        assert.equal(observed.tabs.find(tab => tab.id === 'task-0').generated.length, baseline.find(tab => tab.id === 'task-0').generated.length + 1);
        assert.deepEqual(await page.evaluate(()=>window.__task2.sends.map(s=>s.stage)),['image-generation'], 'The valid native-scene compatibility path sends exactly one actual raster request');
        assert.deepEqual(observed.tabs.find(tab=>tab.id==='task-0').generated.slice(0,baseline.find(tab=>tab.id==='task-0').generated.length),baseline.find(tab=>tab.id==='task-0').generated, 'Every original native history field is retained');
        assert.equal(observed.tabs.find(tab => tab.id === 'task-1').generated.length, baseline.find(tab => tab.id === 'task-1').generated.length);
        assert.deepEqual(observed.tabs.find(tab=>tab.id==='task-1').generated,baseline.find(tab=>tab.id==='task-1').generated);
        await page.click(`${active} [data-ai-comment-tool="area"]`);
        fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ model, errors, phase: observed.phase, originalTaskRevisions: baseline.find(tab=>tab.id==='task-0').generated.length+1, otherTaskRevisions: baseline.find(tab=>tab.id==='task-1').generated.length, areaEnabled: true, sends: observed.sends, terminalStatus: 'interrupted', finalizationStates: ['interrupting', 'interruptAccepted'] }, null, 2));
      } finally {
        fs.writeFileSync(path.join(evidence, 'pageerrors.json'), JSON.stringify(errors));
        await page.screenshot({ path: path.join(evidence, 'settled-area.png') });
      }
    });
  }
}

for (const engine of ['chromium', 'webkit']) {
  test(`interrupted terminal before image retires deadline and rejects late events in ${engine}`, { timeout: 60000 }, async context => {
    process.env.TASK2_ENGINE = engine;
    const evidence = path.join(evidenceRoot, engine, 'terminal-deadline');
    fs.mkdirSync(evidence, { recursive: true });
    const { page, errors, baseline } = await requestBrowserFixture(context, 3, evidence, {fixtureOptions:{nativeHistory:true}});
    await page.clock.install();
    await (await currentPrimaryAction(page)).click();
    await page.waitForFunction(() => window.__task2.generationSends.length === 1);
    await page.evaluate(() => window.__task2.autoFinalizeGeneration(0));
    await page.waitForFunction(() => document.querySelector('#ai-image-panel').dataset.aiBusy === 'false');
    const read = () => page.evaluate(() => ({
      busy: document.querySelector('#ai-image-panel').dataset.aiBusy,
      phase: document.querySelector('#ai-image-panel').dataset.aiRequestPhase,
      status: document.querySelector('#ai-image-panel [data-ai-status]').textContent,
      sends: window.__task2.generationSends.length, allTransport: structuredClone(window.__task2.sends),
    }));
    const before = await read();
    assert.equal(before.phase, 'cancelled');
    await page.screenshot({ path: path.join(evidence, 'after-terminal.png') });
    await task(page, 2);
    const other = await read();
    await page.evaluate(() => { window.__task2.emitGeneration(0, 'image'); window.__task2.emitGeneration(0, 'error'); window.__task2.autoFinalizeGeneration(0); });
    await page.clock.fastForward(180001);
    assert.deepEqual(await read(), other, 'late events and retired deadline must not mutate the active nonowner');
    await task(page, 0);
    const after = await read();
    assert.deepEqual(after, before, 'cancelled request must remain settled beyond its former deadline');
    const tabs = await page.evaluate(async () => (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs));
    assert.deepEqual(tabs.map(tab => tab.generated.length), baseline.map(tab=>tab.generated.length), 'Late images add exactly zero revisions to every source-only owner');
    for(const tab of baseline)assert.deepEqual(tabs.find(t=>t.id===tab.id).generated,tab.generated);
    assert.deepEqual(errors, []);
    assert.equal(await page.locator(`${active} [data-ai-comment-tool="area"]`).isEnabled(), true);
    await page.screenshot({ path: path.join(evidence, 'after-deadline.png') });
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ before, after, errors, lateImageRegistered: false, nonownerUnchanged: true }, null, 2));
  });
}

for (const engine of ['chromium', 'webkit']) {
  for (const operation of ['insert-undo', 'decode-error', 'switch-pending', 'close-pending', 'close-reopen-pending']) {
    test(`completed generation survives local ${operation} in ${engine}`, { timeout: 60000 }, async context => {
      process.env.TASK2_ENGINE = engine;
      const evidence = path.join(evidenceRoot, engine, `local-status-${operation}`);
      fs.mkdirSync(evidence, { recursive: true });
      // Given a genuinely completed fixture request with retained original/history.
      const { page, errors } = await requestBrowserFixture(context, 2, evidence, { initialGeneration: true });
      await page.click(`${active} [data-ai-send]`);
      await page.waitForFunction(() => window.__task2.generationSends.length === 1);
      await page.evaluate(() => { window.__task2.emitGeneration(0, 'image'); window.__task2.emitGeneration(0, 'done'); });
      await page.waitForFunction(() => document.querySelector('#ai-image-panel').dataset.aiBusy === 'false');
      await task(page, 1); await task(page, 0);
      const read = () => page.evaluate(async () => ({
        tabs: (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs),
        objects: window.__integrationState.get().objects, sends: window.__task2.generationSends.length, allTransport: structuredClone(window.__task2.sends),
        row: document.querySelector('[data-tab-id="task-0"]')?.textContent,
      }));
      const before = await read();
      assert.equal(before.tabs.find(tab => tab.id === 'task-0').workState, 'completed');
      assert.equal(await page.locator(`${active} select[data-ai-generation-mode]`).inputValue(),'single', 'Local insertion preserves the actual source-only default');
      await page.evaluate(() => {
        const NativeImage = window.Image, pending = [];
        window.Image = class { naturalWidth = 512; naturalHeight = 384; set src(value) { this.currentSrc = value; pending.push(this); } };
        window.__pendingLocalImages = () => pending.length;
        window.__releaseLocalImages = fail => { window.Image = NativeImage; for (const image of pending) fail ? image.onerror?.(new Event('error')) : image.onload?.(); };
        window.__localOwnerPanel = document.querySelector('#ai-image-panel');
      });
      // When local insertion is pending, completes, or is invalidated by user navigation.
      await page.click(`${active} [data-ai-insert-selected]`);
      await page.waitForFunction(() => window.__pendingLocalImages() > 0);
      const pending = await read();
      if (operation === 'switch-pending') await task(page, 1);
      if (operation === 'close-pending' || operation === 'close-reopen-pending') await page.click(`${active} [data-ai-close]`);
      if (operation === 'close-reopen-pending') {
        await openPanel(page);
        assert.equal(await page.locator(active).isVisible(), true, 'Physically reopened before the old held decode completes');
        assert.equal(await page.evaluate(() => window.__pendingLocalImages() > 0), true, 'The original local decode remains held across close and reopen');
      }
      await page.evaluate(fail => window.__releaseLocalImages(fail), operation === 'decode-error');
      await page.waitForFunction(() => window.__localOwnerPanel.dataset.aiBusy === 'false');
      const settled = await read();
      if (operation === 'insert-undo') { await page.click('#undo-btn'); await openPanel(page); }
      if (operation === 'switch-pending') await task(page, 0);
      if (operation === 'close-pending') await openPanel(page);
      const after = await read();
      fs.writeFileSync(path.join(evidence, 'observed.json'), JSON.stringify({ before, pending, settled, after }, null, 2));
      await page.screenshot({ path: path.join(evidence, 'settled.png') });
      // Then local work never rewrites the generation outcome or sends another request.
      assert.equal(pending.tabs.find(tab => tab.id === 'task-0').workState, 'completed', 'local insertion must not overwrite completed generation with busy');
      assert.equal(settled.tabs.find(tab => tab.id === 'task-0').workState, 'completed', 'local insertion/error must preserve completed generation');
      assert.equal(after.tabs.find(tab => tab.id === 'task-0').workState, 'completed');
      assert.match(after.row, /완료/);
      assert.equal(settled.objects.length, operation === 'insert-undo' ? 1 : 0);
      assert.equal(after.objects.length, 0);
      assert.equal(after.sends, before.sends);
      assert.deepEqual(after.allTransport,before.allTransport,'Local work sends no generation, observation or review and retains every original request field');
      for (const tab of before.tabs) {
        const restored = after.tabs.find(item => item.id === tab.id);
        assert.deepEqual(restored.attachments, tab.attachments);
        assert.deepEqual(restored.generated, tab.generated);
        assert.equal(restored.selectedCandidateId, tab.selectedCandidateId);
      }
      assert.deepEqual(errors, []);
    });
  }
}

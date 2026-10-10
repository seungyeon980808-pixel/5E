const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const evidenceRoot = process.env.TASK8_EVIDENCE || process.env.EVIDENCE_DIR || path.join(root, '.omo/evidence/ai-workbench-polish-0928/task8-ui/browser');
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
  if (scoped) for(let i=0;i<(scoped==='mixed'?1:2);i++){tabs[i].selectedCandidateId=`candidate-${i}`;tabs[i].generated[0].comments=[{id:`area-${i}`,imageId:`candidate-${i}`,type:'area',number:1,x:25,y:25,w:25,h:25,text:'사각형 추가'}];}
  if (scoped === 'malformed') tabs[0].generated[0].data = 'data:image/png;base64,iVBORw0KGgo=';
  if (badTask) tabs[1].effort='unsupported';
  // Historical PNGs stay scoped: only genuine first-conversion fixtures clear history.
  for (let index = 0; index < tabs.length; index++) {
    if (sourceOnly === true || Array.isArray(sourceOnly) && sourceOnly.includes(index) || initialGeneration && index === 0) {
      tabs[index].generated = []; tabs[index].selectedCandidateId = null;
      tabs[index].mode='diagram'; tabs[index].outputEngine=fixtureOptions.sourcePipeline || 'asset';
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
  let statusGate = null, interruptGate = null;
  window.__task2 = {
    original, modified, sends, generationSends, seededTabs: structuredClone(tabs), longTasks: [],
    emitGeneration(index, kind) { this.emit(sends.indexOf(generationSends[index]), kind); },
    delayInterrupt(){interruptGate={};interruptGate.promise=new Promise(resolve=>{interruptGate.resolve=resolve;});},
    releaseInterrupt(){interruptGate?.resolve({ok:true});interruptGate=null;},
    delayStatus() { statusGate = {}; statusGate.promise = new Promise(resolve => { statusGate.resolve = resolve; }); },
    releaseStatus() { statusGate?.resolve({ login: { loggedIn: true }, server: true }); statusGate = null; },
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
    interrupt: async () => interruptGate ? interruptGate.promise : ({ ok: true }),
    onEvent: callback => { listeners.add(callback); return () => listeners.delete(callback); },
    onState: () => () => {}, onLog: () => () => {}, setAiTaskShortcutActive() {}, onAiCloseTaskShortcut: () => () => {},
  };
  window.__seedReady = new Promise((resolve, reject) => {
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
}

async function requestBrowserFixture(context, count, evidence, { initialGeneration = false, missingCapabilities = false, mode = 'pro', scoped = false, serviceCap = 10, badTask = false, sourceOnly = scoped === 'mixed' ? [1] : !scoped, fixtureOptions = {} } = {}) {
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
        requests = await finalPage.evaluate(() => window.__task2.sends);
        fs.writeFileSync(path.join(evidence, `all-transport-${count}.json`), JSON.stringify(requests, null, 2));
      }
    } catch (error) { recordError(error); }
    // Cleanup must run even when evidence capture or a transport oracle fails.
    try { await browserContext.tracing.stop({ path: path.join(evidence, `trace-${count}.zip`) }); } catch (error) { recordError(error); }
    let browserContextClosed = false;
    try { await browserContext.close(); browserContextClosed = true; } catch (error) { recordError(error); }
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
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('TASK2 PAGE ERROR', error.message); });
  await page.addInitScript({ content: `(${seedRequestWorkspaces.toString()})(${count}, ${initialGeneration}, ${missingCapabilities}, ${JSON.stringify(mode)}, ${JSON.stringify(scoped)}, ${badTask}, ${JSON.stringify(sourceOnly)}, ${JSON.stringify({...fixtureOptions, runtime:runtimeInit})})` });
  await installAiMain(page, root, { serviceCap }, evidence);
  const entryReceipt = await inspectEntry(page, `http://127.0.0.1:${server.address().port}`, runtime);
  fs.writeFileSync(path.join(evidence, 'entry-' + count + '.json'), JSON.stringify(entryReceipt, null, 2));
  const welcome = page.locator('.tut-welcome-overlay .tut-banner-no');
  if (await welcome.isVisible()) await welcome.click();
  await page.locator('#ai-image-install-open').click();
  if (!initialGeneration && !(sourceOnly === true || Array.isArray(sourceOnly) && sourceOnly.includes(0))) await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-ai-candidate-option][aria-selected="true"]'));
  await page.waitForFunction(() => [...document.querySelectorAll('#ai-image-panel .ai-image-card img')].some(image => image.naturalWidth === 512));
  assert.deepEqual(errors, [], 'real app boot must have no runtime errors');
  const baseline = await page.evaluate(async () => (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs));
  fs.writeFileSync(path.join(evidence, 'fixture-baseline.json'), JSON.stringify(baseline, null, 2));
  return { page, errors, baseline };
}


async function currentPrimaryAction(page) {
  const panel = page.locator('#ai-image-panel');
  assert.equal(await panel.count(), 1, 'Exactly one actual active workbench');
  await page.waitForFunction(() => ['preparation', 'result'].includes(document.querySelector('#ai-image-panel')?.dataset.aiStage));
  const stage = await panel.getAttribute('data-ai-stage');
  assert.ok(['preparation', 'result'].includes(stage), 'Submission begins only in a real idle workbench stage: ' + stage);
  const selector = stage === 'preparation' ? '[data-ai-send]' : '[data-ai-comments-apply]';
  const button = page.locator('#ai-image-panel[data-ai-stage="' + stage + '"] ' + selector);
  assert.equal(await button.count(), 1, 'Exactly one canonical primary action bound to ' + stage);
  assert.equal(await button.isVisible(), true, 'The actual current primary action must be physically visible');
  assert.equal(await button.isEnabled(), true, 'The actual current primary action must be enabled');
  assert.equal(await panel.getAttribute('data-ai-stage'), stage, 'The selected primary stays in the observed stage');
  return button;
}

const active = '#ai-image-panel';
async function chooseModel(page, choice) { await page.locator(`${active} [data-ai-setting-key="model"] [data-ai-model-choice="${choice}"]`).click(); }
async function task(page, index) { await page.locator(`${active} [data-tab-id="task-${index}"] .ai-task-tab-select`).click(); await page.waitForFunction(index => document.querySelector('#ai-image-panel [data-tab-id="task-'+index+'"] .ai-task-tab-select')?.getAttribute('aria-pressed') === 'true', index); }
async function chooseRevision(page, id) { await page.click(`${active} [data-ai-version-button]`); await page.click(`${active} [data-ai-candidate-option="${id}"]`); }
async function openPanel(page) { await page.click('#ai-image-install-open'); await page.locator(active).waitFor({state:'visible'}); }
async function objects(page) { return page.evaluate(() => structuredClone(window.__integrationState.get().objects)); }

test('12 task selection uses existing primary action with immutable overflow snapshots', {timeout:120000}, async context => {
  const evidence=path.join(evidenceRoot,'overflow'); fs.mkdirSync(evidence,{recursive:true});
  const {page,baseline:originalBaseline}=await requestBrowserFixture(context,12,evidence);
  const initialIds=originalBaseline.map(tab=>tab.id);
  assert.deepEqual(initialIds,Array.from({length:12},(_,index)=>'task-'+index));
  assert.equal(new Set(initialIds).size,12);
  for(const id of initialIds){
    await page.locator('#ai-image-panel [data-tab-id="'+id+'"] .ai-task-tab-select').click();
    await page.waitForFunction(id=>document.querySelector('#ai-image-panel [data-tab-id="'+id+'"] .ai-task-tab-select')?.getAttribute('aria-pressed')==='true',id);
  }
  await task(page,0);
  const baseline=await page.evaluate(async()=>(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace=>workspace.tabs));
  assert.equal(baseline.length,12);
  assert.equal(new Set(baseline.map(tab=>tab.id)).size,12);
  assert.deepEqual(baseline.map(tab=>tab.id).sort(),initialIds.slice().sort());
  for(const originalTab of originalBaseline){
    const canonical=baseline.find(tab=>tab.id===originalTab.id);
    assert.ok(canonical,'Every original owner remains after real physical preparation');
    for(const key of ['attachments','generated']){
      assert.equal(canonical[key].length,originalTab[key].length);
      for(let index=0;index<originalTab[key].length;index++)for(const field of Object.keys(originalTab[key][index])){
        assert.equal(Object.hasOwn(canonical[key][index],field),true,'Original '+key+' field is still present: '+field);
        assert.deepEqual(canonical[key][index][field],originalTab[key][index][field],'Physical preparation preserves every original '+key+' field and raw byte: '+field);
      }
    }
  }
  assert.equal(await page.evaluate(()=>window.__task2.sends.length),0,'Baseline preparation makes zero provider requests');
  fs.writeFileSync(path.join(evidence,'overflow-canonical-baseline-proof.json'),JSON.stringify({original:originalBaseline,canonical:baseline,allOriginalImageFieldsExact:true},null,2));
  await page.click('#ai-image-panel [data-tab-id="task-0"] .ai-task-tab-select');
  for(let i=1;i<12;i++) await page.click(`#ai-image-panel [data-tab-id="task-${i}"] .ai-task-tab-select`,{modifiers:[i%2?'Meta':'Control']});
  assert.equal(await page.locator('#ai-image-panel [data-ai-selection-count]').textContent(),'12개 선택');
  await (await currentPrimaryAction(page)).click();
  await page.waitForFunction(()=>window.__task2.generationSends.length===10);
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().filter(j=>j.state==='queued').length===2);
  const submittedSources=await page.evaluate(()=>window.__task2Manager.workspaceBatchState().map(job=>structuredClone(job.sourceSnapshot)));
  assert.deepEqual(submittedSources.map(source=>source.owner.taskId),Array.from({length:12},(_,index)=>'task-'+index),'Queue capture preserves the exact original physical selection order');
  assert.equal(new Set(submittedSources.map(source=>JSON.stringify(source.owner))).size,12,'Every captured scope/task identity is unique');
  assert.equal(await page.locator('#ai-image-panel [data-tab-id="task-0"] .ai-task-tab-select').getAttribute('aria-pressed'),'true');
  await page.screenshot({path:path.join(evidence,'selection-12.png')});
  await task(page,11); await chooseModel(page,'luna');
  assert.equal(await page.locator('#ai-image-panel [data-ai-model]').inputValue(),'gpt-6-luna');
  assert.equal(await page.locator('#ai-image-panel [data-ai-effort]').inputValue(),'medium');
  await page.screenshot({path:path.join(evidence,'overflow.png')});
  await page.evaluate(()=>{for(let i=0;i<10;i++){window.__task2.emitGeneration(i,'image');window.__task2.emitGeneration(i,'done');}});
  await page.waitForFunction(()=>window.__task2.generationSends.length===12);
  assert.equal(await page.evaluate(()=>window.__task2.generationSends[11].payload.effort),'medium');
  assert.deepEqual(await page.evaluate(()=>{const {model,effort,serviceTier}=window.__task2.generationSends[11].payload;return {model,effort,serviceTier};}), {model:'gpt-6.1-sol',effort:'medium',serviceTier:'priority'}, 'The queued snapshot predates the permitted live Sol→Luna change');
  await page.evaluate(()=>{for(let i=10;i<12;i++){window.__task2.emitGeneration(i,'image');window.__task2.emitGeneration(i,'done');}});
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().filter(j=>j.state==='completed').length===12);
  const results=await page.evaluate(()=>window.__task2Manager.workspaceBatchState().map(j=>({state:j.state,task:j.sourceSnapshot.owner.taskId,revision:j.result?.output?.revisionId})));
  assert.equal(new Set(results.map(r=>r.task)).size,12);assert.ok(results.every(r=>r.revision));
  assert.deepEqual(await page.evaluate(()=>window.__task2Manager.workspaceBatchState().map(job=>job.sourceSnapshot)),submittedSources,'Every original source, owner, model and selection order remains exact after queued completion');
  assert.equal(await page.evaluate(()=>window.__task2.generationSends.length),12);
  const completedTabs=await page.evaluate(async()=>(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace=>workspace.tabs));
  assert.equal(baseline.length,12);
  assert.equal(completedTabs.length,12);
  assert.equal(new Set(baseline.map(tab=>tab.id)).size,12);
  assert.equal(new Set(completedTabs.map(tab=>tab.id)).size,12);
  const byTaskId=(left,right)=>left.id.localeCompare(right.id);
  assert.deepEqual(completedTabs.map(tab=>({id:tab.id,count:tab.generated.length})).sort(byTaskId),baseline.map(tab=>({id:tab.id,count:tab.generated.length+1})).sort(byTaskId), 'Each genuine first conversion adds one and only one revision to its original owner baseline');
  for(const tab of baseline){const after=completedTabs.find(t=>t.id===tab.id);assert.deepEqual(after.generated.slice(0,tab.generated.length),tab.generated);assert.deepEqual(after.attachments,tab.attachments);}
  assert.ok(completedTabs.every(tab=>tab.generated[0].sceneResult?.valid && tab.generated[0].sceneResult.supported && tab.generated[0].sceneResult.objects.length===2 && tab.generated[0].sceneResult.errors.length===0 && tab.generated[0].data.startsWith('data:image/svg+xml')), 'Completed candidates are real compiled native scenes');
  assert.deepEqual(await page.evaluate(()=>window.__task2.sends.reduce((counts,send)=>({...counts,[send.stage]:(counts[send.stage]||0)+1}),{})), {'native-generation':12}, 'Exactly twelve real asset requests; full unfiltered transport ledger has no observer/raster fallback calls');
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({results,immutableEffort:true,sends:12},null,2));
});

for(const engine of ['chromium','webkit']) test(`scoped A/B approvals remain task owned with C active in ${engine}`,{timeout:120000},async context=>{
  process.env.TASK2_ENGINE=engine;
  const evidence=path.join(evidenceRoot,engine,'scoped');fs.mkdirSync(evidence,{recursive:true});
  const {page}=await requestBrowserFixture(context,3,evidence,{scoped:true});
  const before=await cancellationHistory(page);
  await task(page,2);
  for(const id of [2,0,1])await page.click(`#ai-image-panel [data-tab-id="task-${id}"] .ai-task-tab-select`,{modifiers:['Meta']});
  await (await currentPrimaryAction(page)).click();
  await page.waitForFunction(()=>window.__task2.generationSends.length===2);
  assert.equal(await page.locator('#ai-image-panel dialog[open]').count(),0,'Primary click authorizes scope without an obsolete bounds dialog');
  const authorized=await page.evaluate(()=>window.__task2Manager.workspaceBatchState().map(job=>({owner:job.sourceSnapshot.owner.taskId,operation:job.sourceSnapshot.snapshot.operation,comments:job.sourceSnapshot.snapshot.comments,source:job.sourceSnapshot.dataUrl})));
  assert.deepEqual(authorized.map(job=>job.owner),['task-0','task-1']);
  assert.ok(authorized.every((job,index)=>job.operation==='scoped-edit' && job.source===before[index].generated[0].data && JSON.stringify(job.comments)===JSON.stringify(before[index].generated[0].comments)),'Explicit click freezes each real source and drawn scope');
  await task(page,2);
  await page.evaluate(()=>{for(let i=0;i<2;i++){window.__task2.emitGeneration(i,'image');window.__task2.emitGeneration(i,'done');}});
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().every(j=>j.progress?.phase==='confirmation-wait'));
  assert.equal(await page.locator('#ai-image-panel dialog[open]').count(),0);
  await page.screenshot({path:path.join(evidence,'C-active.png')});
  for(let i=0;i<2;i++) {await task(page,i);await page.locator('#ai-image-panel').getByRole('dialog',{name:'수정 전후 비교',exact:true}).waitFor();await page.locator('#ai-image-panel').getByRole('dialog',{name:'수정 전후 비교',exact:true}).getByRole('button',{name:'적용',exact:true}).click();await page.waitForFunction(id=>window.__task2Manager.workspaceBatchState().find(j=>j.sourceSnapshot.owner.taskId===id)?.state==='completed',`task-${i}`);}
  const jobs=await page.evaluate(()=>window.__task2Manager.workspaceBatchState());
  const pixelResults=await page.evaluate(async()=>{
    async function pixels(data){const image=new Image();image.src=data;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,image.width,image.height).data;}
    const original=await pixels(window.__task2.original),results=[];
    for(const job of window.__task2Manager.workspaceBatchState()){
      const output=await pixels(job.result.generation.candidate.data);let outside=0;
      for(let y=0;y<384;y++)for(let x=0;x<512;x++)if(x<128||x>=256||y<96||y>=192)for(let c=0;c<4;c++)if(output[(y*512+x)*4+c]!==original[(y*512+x)*4+c])outside++;
      results.push({task:job.sourceSnapshot.owner.taskId,outsideChangedBytes:outside,scopeConfirmed:job.result.generation.scopeConfirmed,approved:job.result.generation.approved});
    }return results;
  });
  assert.ok(pixelResults.every(result=>result.outsideChangedBytes===0&&result.scopeConfirmed&&result.approved));
  fs.writeFileSync(path.join(evidence,'pixels.json'),JSON.stringify(pixelResults,null,2));
  assert.equal(jobs.length,2);assert.ok(jobs.every(j=>j.state==='completed'));
  await task(page,2);assert.equal(await page.locator('#ai-image-panel [data-ai-candidate-option]').count(),2,'C keeps exactly its original revisions');
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(jobs.map(j=>({task:j.sourceSnapshot.owner.taskId,state:j.state,revision:j.result.output.revisionId})),null,2));
});

async function selectTasks(page,count){await page.click('#ai-image-panel [data-tab-id="task-0"] .ai-task-tab-select');for(let i=1;i<count;i++)await page.click(`#ai-image-panel [data-tab-id="task-${i}"] .ai-task-tab-select`,{modifiers:['Meta']});}
async function jobAction(page,taskId,action){const id=await page.evaluate(taskId=>window.__task2Manager.workspaceBatchState().find(j=>j.sourceSnapshot.owner.taskId===taskId).id,taskId);await page.click(`#ai-image-panel [data-ai-workspace-job="${id}"] [data-ai-workspace-job-action="${action}"]`);}

async function holdScopedPredispatch(page, count) {
  await page.evaluate(count=>{
    const original=crypto.subtle.digest, held=[];
    window.__scopedPredispatch={held,releaseAll(){for(const entry of held)entry.release();crypto.subtle.digest=original;}};
    crypto.subtle.digest=function(algorithm,input){
      const bytes=input instanceof ArrayBuffer?new Uint8Array(input):new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
      const genuine=Reflect.apply(original,crypto.subtle,[algorithm,input]);
      if(held.length>=count || bytes.length<8 || bytes[0]!==137 || bytes[1]!==80 || bytes[2]!==78 || bytes[3]!==71)return genuine;
      const capture={sourceBytes:Array.from(bytes),resolved:false,release:null};held.push(capture);
      return genuine.then(result=>new Promise(resolve=>{capture.resolved=true;capture.release=()=>resolve(result);}));
    };
  },count);
}

async function waitForScopedCancellationHistory(page, taskIds) {
  // Queue cancellation is published before the held SHA continuation ends.
  // Observe the original product catch/history checkpoint, then assert sends=0.
  await page.waitForFunction(async taskIds => {
    const tabs = (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs);
    return taskIds.every(id => tabs.find(tab => tab.id === id)?.generated.find(item => item.id === `candidate-${id.slice(5)}`)?.scopedEditHistory?.at(-1)?.status === 'cancelled');
  }, taskIds);
}

async function cancellationHistory(page) {
  return page.evaluate(async () => (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs).map(tab => ({
    id: tab.id, generated: tab.generated.map(({id, data, comments}) => ({id, data, comments})), attachments: tab.attachments.map(({id, data, comments}) => ({id, data, comments})), selectedCandidateId: tab.selectedCandidateId,
    conversationMessages: tab.conversationMessages, input: tab.input,
  })).sort((a, b) => a.id.localeCompare(b.id)));
}

for (const engine of ['chromium', 'webkit']) for (const stage of ['bounds', 'review']) test(`scoped ${stage} rejection is cancelled with peer pending in ${engine}`, { timeout: 90000 }, async context => {
  process.env.TASK2_ENGINE = engine;
  const evidence = path.join(evidenceRoot, engine, `cancel-${stage}`); fs.mkdirSync(evidence, { recursive: true });
  const { page } = await requestBrowserFixture(context, 3, evidence, { scoped: true });
  const before = await cancellationHistory(page);
  await task(page, 2);
  for (const id of [2, 0, 1]) await page.click(`#ai-image-panel [data-tab-id="task-${id}"] .ai-task-tab-select`, { modifiers: ['Meta'] });
  if(stage==='bounds')await holdScopedPredispatch(page,2);
  await (await currentPrimaryAction(page)).click();
  if(stage==='bounds') {
    await page.waitForFunction(()=>window.__scopedPredispatch.held.length===2&&window.__scopedPredispatch.held.every(entry=>entry.resolved));
    assert.equal(await page.evaluate(()=>window.__task2.sends.length),0,'Actual pre-dispatch hold has not sent any request');
    const captures=await page.evaluate(()=>window.__task2Manager.workspaceBatchState().map(job=>({operation:job.sourceSnapshot.snapshot.operation,comments:job.sourceSnapshot.snapshot.comments,data:job.sourceSnapshot.dataUrl})));
    assert.ok(captures.every((capture,index)=>capture.operation==='scoped-edit'&&capture.data===before[index].generated[0].data&&JSON.stringify(capture.comments)===JSON.stringify(before[index].generated[0].comments)), 'Primary-authorized bounds are immutable at the real SHA gate');
    assert.equal(await page.locator('#ai-image-panel dialog[open]').count(),0);
    await page.screenshot({path:path.join(evidence,'before-cancel.png')});
    await jobAction(page,'task-0','cancel');
    await task(page,0);
  } else {
    await page.waitForFunction(()=>window.__task2.generationSends.length===2);
    await page.evaluate(()=>{for(let i=0;i<2;i++){window.__task2.emitGeneration(i,'image');window.__task2.emitGeneration(i,'done');}});
    await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().every(job=>job.progress?.phase==='confirmation-wait'));
    assert.equal(await page.locator('#ai-image-panel dialog[open]').count(),0,'With C active neither peer review steals context');
    await task(page,0);await page.locator('#ai-image-panel').getByRole('dialog',{name:'수정 전후 비교',exact:true}).waitFor();
    assert.equal(await page.locator('#ai-image-panel').getByRole('dialog',{name:'수정 전후 비교',exact:true}).getAttribute('aria-label'),'수정 전후 비교');
    await page.screenshot({path:path.join(evidence,'before-cancel.png')});
    await page.locator('#ai-image-panel').getByRole('dialog',{name:'수정 전후 비교',exact:true}).getByRole('button',{name:'취소',exact:true}).click();
  }
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState()[0]?.state==='cancelled');
  const first = await page.evaluate(() => ({ jobs: window.__task2Manager.workspaceBatchState(), busy: document.querySelector('#ai-image-panel').dataset.aiBusy, phase: document.querySelector('#ai-image-panel').dataset.aiRequestPhase, status: document.querySelector('#ai-image-panel [data-ai-status]').textContent, sends: window.__task2.generationSends.length }));
  fs.writeFileSync(path.join(evidence, 'first-cancel.json'), JSON.stringify(first, null, 2));
  assert.deepEqual(first.jobs.map(job => job.state), ['cancelled', 'running']);
  if(stage==='review')assert.equal(first.jobs[1].progress.phase, 'confirmation-wait');
  else assert.equal(await page.evaluate(()=>window.__scopedPredispatch.held.every(entry=>entry.resolved)),true,'Peer remains held at its real pre-dispatch boundary');
  assert.equal(first.jobs[0].error, null); assert.equal(first.jobs[0].result, null);
  assert.equal(first.busy, 'false'); assert.equal(first.phase, 'cancelled');
  assert.match(first.status, /취소/); assert.doesNotMatch(first.status, /차단|PNG 치수/);
  assert.equal(first.sends, stage === 'bounds' ? 0 : 2);
  assert.equal(await page.locator('#ai-image-panel [data-ai-workspace-job-action="retry"]').count(), 0);
  if (stage === 'review') await page.evaluate(() => { window.__task2.emitGeneration(0, 'image'); window.__task2.emitGeneration(0, 'done'); window.__task2.emitGeneration(0, 'error'); });
  if(stage==='bounds') {
    await jobAction(page,'task-1','cancel');
    await page.evaluate(()=>window.__scopedPredispatch.releaseAll());
  } else {
    await task(page,1);await page.locator('#ai-image-panel').getByRole('dialog',{name:'수정 전후 비교',exact:true}).waitFor();
    await page.locator('#ai-image-panel').getByRole('dialog',{name:'수정 전후 비교',exact:true}).getByRole('button',{name:'취소',exact:true}).click();
  }
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().every(job=>job.state==='cancelled'));
  if(stage==='bounds')await waitForScopedCancellationHistory(page,['task-0','task-1']);
  if(stage==='bounds')assert.equal(await page.evaluate(()=>window.__task2.sends.length),0,'Cancelled owner recheck rejects both released authentic results before provider dispatch');
  const jobs = await page.evaluate(() => window.__task2Manager.workspaceBatchState());
  assert.deepEqual(jobs.map(job => job.state), ['cancelled', 'cancelled']);
  assert.deepEqual(await cancellationHistory(page), before, 'all images, revisions, comments and source selection remain immutable');
  await task(page, 2); await page.screenshot({ path: path.join(evidence, 'cancelled.png') });
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ states: jobs.map(job => job.state), providerCalls: first.sends, fixtureSends: first.sends, peerPending: true, historyUnchanged: true, idle: true, lateEventsIgnored: stage === 'review' }, null, 2));
});

test('malformed scoped PNG remains failed with explicit retry and no provider sends', { timeout: 90000 }, async context => {
  process.env.TASK2_ENGINE = 'chromium';
  const evidence = path.join(evidenceRoot, 'malformed-scoped'); fs.mkdirSync(evidence, { recursive: true });
  const { page } = await requestBrowserFixture(context, 3, evidence, { scoped: 'malformed' });
  const before = await cancellationHistory(page);
  await holdScopedPredispatch(page,1);
  await selectTasks(page, 2); await (await currentPrimaryAction(page)).click();
  await page.waitForFunction(() => window.__task2Manager.workspaceBatchState()[0]?.state === 'failed');
  await page.waitForFunction(()=>window.__scopedPredispatch.held.length===1&&window.__scopedPredispatch.held[0].resolved);
  const first = await page.evaluate(() => window.__task2Manager.workspaceBatchState());
  assert.match(first[0].error, /PNG/); assert.equal(first[0].attempt, 1);
  assert.equal(first[1].state, 'running'); assert.equal(await page.evaluate(() => window.__task2.generationSends.length), 0);
  await jobAction(page, 'task-0', 'retry');
  await page.waitForFunction(() => { const job = window.__task2Manager.workspaceBatchState()[0]; return job?.state === 'failed' && job.attempt === 2; });
  assert.equal(await page.evaluate(() => window.__task2.generationSends.length), 0);
  assert.deepEqual(await cancellationHistory(page), before);
  await page.screenshot({ path: path.join(evidence, 'failed-retry.png') });
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ first, after: await page.evaluate(() => window.__task2Manager.workspaceBatchState()), sends: 0, historyUnchanged: true }, null, 2));
  await jobAction(page,'task-1','cancel');
  await page.evaluate(()=>window.__scopedPredispatch.releaseAll());
  await waitForScopedCancellationHistory(page,['task-1']);
  await page.evaluate(() => window.__task2Manager.dispose());
  assert.equal(await page.evaluate(()=>window.__task2.sends.length),0,'Malformed retries and the cancelled peer never dispatch');
});
for(const engine of ['chromium','webkit']) test(`lower cap cancellation acknowledgement, failure and explicit retry in ${engine}`,{timeout:120000},async context=>{
  process.env.TASK2_ENGINE=engine;const evidence=path.join(evidenceRoot,engine,'isolation');fs.mkdirSync(evidence,{recursive:true});
  const {page}=await requestBrowserFixture(context,4,evidence,{serviceCap:2});
  await selectTasks(page,4);await (await currentPrimaryAction(page)).dblclick({delay:10});
  await page.waitForFunction(()=>window.__task2.generationSends.length===2);
  assert.equal(await page.locator('#ai-image-panel [data-ai-workspace-batch] [data-ai-workspace-job]').count(), 0);
  const runningCard = page.locator('#ai-image-panel [data-ai-generation-active="true"]').first();
  assert.equal(await runningCard.evaluate(node => getComputedStyle(node).animationName), 'ai-task-card-glow');
  await page.screenshot({path:path.join(evidence,'running-cards.png')});
  await page.evaluate(()=>window.__task2.emitGeneration(0,'error'));
  await page.waitForFunction(()=>window.__task2.generationSends.length===3);
  await page.evaluate(()=>window.__task2.delayInterrupt());
  await jobAction(page,'task-1','cancel');
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().find(j=>j.sourceSnapshot.owner.taskId==='task-1')?.state==='cancelled');
  assert.equal(await page.evaluate(()=>window.__task2.generationSends.length),3,'cancelled transport still reserves lower cap slot');
  await page.evaluate(()=>window.__task2.releaseInterrupt());
  await page.waitForFunction(()=>window.__task2.generationSends.length===4);
  await page.evaluate(()=>{for(let i=1;i<4;i++){window.__task2.emitGeneration(i,'image');window.__task2.emitGeneration(i,'done');}});
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().filter(j=>j.state==='completed').length===2);
  await jobAction(page,'task-0','retry');await page.waitForFunction(()=>window.__task2.generationSends.length===5);
  await page.evaluate(()=>{window.__task2.emitGeneration(0,'image');window.__task2.emitGeneration(0,'done');window.__task2.emitGeneration(4,'image');window.__task2.emitGeneration(4,'done');});
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().filter(j=>j.state==='completed').length===3);
  const jobs=await page.evaluate(()=>window.__task2Manager.workspaceBatchState());
  assert.equal(jobs.find(j=>j.sourceSnapshot.owner.taskId==='task-0').attempt,2);
  assert.equal(jobs.find(j=>j.sourceSnapshot.owner.taskId==='task-1').result,null);
  await page.screenshot({path:path.join(evidence,'statuses.png')});
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(jobs.map(j=>({task:j.sourceSnapshot.owner.taskId,state:j.state,attempt:j.attempt})),null,2));
});
test('persisted queued and running jobs recover failed without automatic sends', {timeout:120000},async context=>{
  process.env.TASK2_ENGINE='chromium';const evidence=path.join(evidenceRoot,'recovery');fs.mkdirSync(evidence,{recursive:true});
  const {page}=await requestBrowserFixture(context,3,evidence,{serviceCap:2});await selectTasks(page,3);await (await currentPrimaryAction(page)).click();
  await page.waitForFunction(()=>window.__task2.generationSends.length===2);await page.reload({waitUntil:'networkidle'});await page.click('#ai-image-install-open');
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().length===3);
  const recovered=await page.evaluate(()=>({sends:window.__task2.generationSends.length,states:window.__task2Manager.workspaceBatchState().map(j=>j.state)}));
  assert.deepEqual(recovered,{sends:0,states:['failed','failed','failed']});
  await jobAction(page,'task-0','retry');await page.waitForFunction(()=>window.__task2.generationSends.length===1);
  await page.evaluate(()=>{window.__task2.emitGeneration(0,'image');window.__task2.emitGeneration(0,'done');});
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().filter(j=>j.state==='completed').length===1);
  await page.screenshot({path:path.join(evidence,'recovered.png')});fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(recovered));
});

test('mixed eligibility blocks every send until user corrects selection', {timeout:60000},async context=>{
  process.env.TASK2_ENGINE='chromium';const evidence=path.join(evidenceRoot,'preflight');fs.mkdirSync(evidence,{recursive:true});
  const pngEvidence=path.join(evidence,'png-no-area');fs.mkdirSync(pngEvidence,{recursive:true});
  const pngFixture=await requestBrowserFixture(context,3,pngEvidence,{sourceOnly:false});
  const pngPage=pngFixture.page, pngBefore=await cancellationHistory(pngPage);
  await selectTasks(pngPage,3);
  const pngFullBefore=await pngPage.evaluate(async()=>(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(w=>w.tabs));
  assert.equal(await pngPage.locator('#ai-image-panel [data-ai-comments-apply]').isEnabled(),true);
  await (await currentPrimaryAction(pngPage)).click();
  await pngPage.locator('#ai-image-panel [data-ai-workspace-batch] [role="alert"]').waitFor();
  assert.match(await pngPage.locator('#ai-image-panel [data-ai-workspace-batch] [role="alert"]').textContent(),/영역|박스/);
  assert.equal(await pngPage.evaluate(()=>window.__task2.sends.length),0,'No-area historical PNGs must not fall back to full generation');
  assert.equal(await pngPage.evaluate(()=>window.__task2Manager.workspaceBatchState().length),0);
  assert.deepEqual(await cancellationHistory(pngPage),pngBefore,'Blocked PNG preflight preserves every attachment, revision, comment, selection, conversation and input');
  const pngFullAfter=await pngPage.evaluate(async()=>(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(w=>w.tabs));
  for(const tab of pngFullBefore){const after=pngFullAfter.find(t=>t.id===tab.id);assert.deepEqual(after.generated,tab.generated,'Every original PNG candidate field stays exact');assert.deepEqual(after.attachments,tab.attachments,'Every original attachment field stays exact');}
  await pngPage.screenshot({path:path.join(pngEvidence,'blocked.png')});
  const {page}=await requestBrowserFixture(context,3,evidence,{badTask:true});await selectTasks(page,3);await (await currentPrimaryAction(page)).click();
  await page.locator('#ai-image-panel [data-ai-workspace-batch] [role="alert"]').waitFor();
  assert.equal(await page.evaluate(()=>window.__task2.generationSends.length),0);assert.equal(await page.evaluate(()=>window.__task2.sends.length),0, 'Blocked input must send neither generation nor observation');
  const message=await page.locator('#ai-image-panel [data-ai-workspace-batch] [role="alert"]').textContent();assert.match(message,/unsupported/);
  await page.screenshot({path:path.join(evidence,'invalid.png')});
  await page.click('#ai-image-panel [data-tab-id="task-1"] .ai-task-tab-select',{modifiers:['Meta']});
  await (await currentPrimaryAction(page)).click();await page.waitForFunction(()=>window.__task2.generationSends.length===2);
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({message,beforeSends:0,afterExplicitSelectionSends:2}));
});
test('task checkpoint failure cannot claim success and explicit retry remains isolated',{timeout:120000},async context=>{
  process.env.TASK2_ENGINE='chromium';const evidence=path.join(evidenceRoot,'commit-failure');fs.mkdirSync(evidence,{recursive:true});
  const {page,baseline}=await requestBrowserFixture(context,2,evidence);await selectTasks(page,2);await (await currentPrimaryAction(page)).click();await page.waitForFunction(()=>window.__task2.generationSends.length===2);
  await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;window.__restorePut=()=>{IDBObjectStore.prototype.put=put;};IDBObjectStore.prototype.put=function(value,...args){if(this.name==='tasks'&&value.tabs?.some(tab=>tab.id==='task-0'&&tab.generated?.some(item=>item.workspaceBatch)))throw new DOMException('synthetic task checkpoint failure','QuotaExceededError');return put.call(this,value,...args);};window.__task2.emitGeneration(0,'image');window.__task2.emitGeneration(0,'done');});
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().some(j=>j.state==='failed'));
  const failed=await page.evaluate(()=>window.__task2Manager.workspaceBatchState().find(j=>j.state==='failed'));assert.match(failed.error,/checkpoint failure/);
  assert.equal(await page.locator('#ai-image-panel [data-ai-candidate-option]').count(),baseline.find(tab=>tab.id==='task-0').generated.length + 0, 'Failed checkpoint adds exactly zero revisions to the source-only baseline');
  const failedTab=await page.evaluate(async()=>(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(w=>w.tabs).find(t=>t.id==='task-0'));
  assert.deepEqual(failedTab.generated,baseline.find(tab=>tab.id==='task-0').generated,'Checkpoint failure preserves every original candidate field');
  assert.deepEqual(failedTab.attachments,baseline.find(tab=>tab.id==='task-0').attachments);
  await page.evaluate(()=>{window.__restorePut();window.__task2.emitGeneration(1,'image');window.__task2.emitGeneration(1,'done');});
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().some(j=>j.state==='completed'));
  await jobAction(page,'task-0','retry');await page.waitForFunction(()=>window.__task2.generationSends.length===3);await page.evaluate(()=>{window.__task2.emitGeneration(2,'image');window.__task2.emitGeneration(2,'done');});
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().every(j=>j.state==='completed'));
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({failedError:failed.error,retried:true,sends:3}));
});

test('malformed persisted retry remains failed and sends nothing',{timeout:90000},async context=>{
  process.env.TASK2_ENGINE='chromium';const evidence=path.join(evidenceRoot,'malformed');fs.mkdirSync(evidence,{recursive:true});
  const {page}=await requestBrowserFixture(context,2,evidence,{serviceCap:1});await selectTasks(page,2);await (await currentPrimaryAction(page)).click();await page.waitForFunction(()=>window.__task2.generationSends.length===1);
  await page.evaluate(async()=>{const {idbGet,idbSet}=await import(window.__runtime.base+'idb-store.js'+window.__runtime.query);const primary=JSON.parse(localStorage.getItem('5e.aiPrimaryWorkspace.v1')||'""');const key='ai-workspace-batch:'+JSON.stringify(['5e','workspace-selection:'+(primary||'main')]);const records=await idbGet(key);const job=records.find(j=>j.sourceSnapshot.owner.taskId==='task-1');job.sourceSnapshot.snapshot.model='';await idbSet(key,records);});
  await page.reload({waitUntil:'networkidle'});await page.click('#ai-image-install-open');await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().length===2);
  const before=await page.evaluate(()=>window.__task2Manager.workspaceBatchState().find(j=>j.sourceSnapshot.owner.taskId==='task-1').attempt);
  await jobAction(page,'task-1','retry');await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().some(j=>j.error?.includes('Retry blocked')));
  const result=await page.evaluate(()=>({sends:window.__task2.generationSends.length,job:window.__task2Manager.workspaceBatchState().find(j=>j.sourceSnapshot.owner.taskId==='task-1')}));
  assert.equal(result.sends,0);assert.equal(result.job.attempt,before);assert.equal(result.job.state,'failed');fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({sends:result.sends,attempt:before,error:result.job.error}));
});
test('repeated dispose waits for pending transport interruption and never starts queued peers',{timeout:90000},async context=>{
  process.env.TASK2_ENGINE='chromium';const evidence=path.join(evidenceRoot,'dispose');fs.mkdirSync(evidence,{recursive:true});
  const {page}=await requestBrowserFixture(context,4,evidence,{serviceCap:2});await selectTasks(page,4);await (await currentPrimaryAction(page)).click();await page.waitForFunction(()=>window.__task2.generationSends.length===2);
  const same=await page.evaluate(()=>{window.__task2.delayInterrupt();window.__disposed=false;const first=window.__task2Manager.dispose();const second=window.__task2Manager.dispose();first.then(()=>window.__disposed=true);return first===second;});assert.equal(same,true);
  assert.equal(await page.evaluate(()=>window.__disposed),false);assert.equal(await page.evaluate(()=>window.__task2.generationSends.length),2);
  await page.evaluate(()=>window.__task2.releaseInterrupt());await page.waitForFunction(()=>window.__disposed);
  await page.evaluate(()=>{window.__task2.emitGeneration(0,'image');window.__task2.emitGeneration(0,'done');});
  assert.equal(await page.evaluate(()=>window.__task2.generationSends.length),2);fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({samePromise:true,waitedForInterrupt:true,sends:2}));
});
test('mixed normal and area tasks retain their own operation from the existing action',{timeout:90000},async context=>{
  process.env.TASK2_ENGINE='chromium';const evidence=path.join(evidenceRoot,'mixed-operation');fs.mkdirSync(evidence,{recursive:true});
  const {page}=await requestBrowserFixture(context,3,evidence,{scoped:'mixed'});await selectTasks(page,2);await (await currentPrimaryAction(page)).click();
  await page.waitForFunction(()=>window.__task2.generationSends.length===2);
  assert.equal(await page.locator('#ai-image-panel dialog[open]').count(),0);
  await task(page,2);await page.evaluate(()=>{for(let i=0;i<2;i++){window.__task2.emitGeneration(i,'image');window.__task2.emitGeneration(i,'done');}});
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().some(j=>j.state==='completed'));
  await task(page,0);await page.locator('#ai-image-panel').getByRole('dialog',{name:'수정 전후 비교',exact:true}).waitFor();await page.locator('#ai-image-panel').getByRole('dialog',{name:'수정 전후 비교',exact:true}).getByRole('button',{name:'적용',exact:true}).click();await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().every(j=>j.state==='completed'));
  const ops=await page.evaluate(()=>window.__task2Manager.workspaceBatchState().map(j=>({task:j.sourceSnapshot.owner.taskId,operation:j.result.generation.operation,approved:j.result.generation.approved})));
  assert.deepEqual(ops.map(o=>o.operation),['scoped-edit','generate']);assert.equal(ops[0].approved,true);fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(ops));
});

test('durable candidate receipt prevents paid resend after queue journal completion failure',{timeout:120000},async context=>{
  process.env.TASK2_ENGINE='chromium';const evidence=path.join(evidenceRoot,'journal-failure');fs.mkdirSync(evidence,{recursive:true});
  const {page,baseline}=await requestBrowserFixture(context,2,evidence);await selectTasks(page,2);await (await currentPrimaryAction(page)).click();await page.waitForFunction(()=>window.__task2.generationSends.length===2);
  await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;window.__restorePut=()=>{IDBObjectStore.prototype.put=put;};IDBObjectStore.prototype.put=function(value,...args){if(this.name==='kv'&&Array.isArray(value)&&value.some(job=>job.state==='completed'&&job.sourceSnapshot?.owner?.taskId==='task-0'))throw new DOMException('synthetic queue journal failure','QuotaExceededError');return put.call(this,value,...args);};window.__task2.emitGeneration(0,'image');window.__task2.emitGeneration(0,'done');});
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-ai-workspace-batch] [role="alert"]')?.textContent.includes('queue journal failure'));
  await page.evaluate(()=>window.__restorePut());await page.reload({waitUntil:'networkidle'});await page.click('#ai-image-install-open');await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().length===2);
  assert.equal(await page.evaluate(()=>window.__task2.generationSends.length),0);assert.equal(await page.evaluate(()=>window.__task2.sends.length),0, 'Blocked input must send neither generation nor observation');
  await jobAction(page,'task-0','retry');await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().some(job=>job.sourceSnapshot.owner.taskId==='task-0'&&job.state==='completed'));
  assert.equal(await page.evaluate(()=>window.__task2.generationSends.length),0,'persisted commit receipt is reused rather than another provider request');
  assert.equal(await page.locator('#ai-image-panel [data-ai-candidate-option]').count(),baseline.find(tab=>tab.id==='task-0').generated.length + 1, 'Durable receipt adds exactly one revision');
  assert.match(await page.locator('#ai-image-panel [data-ai-status]').textContent(),/변환 완료/);
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({durableCandidateCount:baseline.find(tab=>tab.id==='task-0').generated.length+1,retrySends:0,completed:true}));
});

for(const engine of ['chromium','webkit'])test(`Lite existing primary submits two selected tasks in ${engine}`,{timeout:60000},async context=>{
  process.env.TASK2_ENGINE=engine;const evidence=path.join(evidenceRoot,engine,'lite');fs.mkdirSync(evidence,{recursive:true});
  const {page}=await requestBrowserFixture(context,2,evidence,{mode:'lite'});await selectTasks(page,2);
  assert.equal(await page.locator('#ai-image-panel [data-ai-selection-count]').textContent(),'2개 선택');
  await (await currentPrimaryAction(page)).click();await page.waitForFunction(()=>window.__task2.generationSends.length===2);
  await page.evaluate(()=>{for(let i=0;i<2;i++){window.__task2.emitGeneration(i,'image');window.__task2.emitGeneration(i,'done');}});await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().every(j=>j.state==='completed'));
  assert.match(await page.locator('#ai-image-panel [data-ai-status]').textContent(),/변환 완료/);
  assert.equal(await page.locator('#ai-image-panel [data-ai-review-summary]').getAttribute('data-state'),'first-generated');
  await page.screenshot({path:path.join(evidence,'completed.png')});fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({sends:2,completed:2,existingPrimary:true}));
});

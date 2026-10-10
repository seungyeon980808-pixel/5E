const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const evidenceRoot = process.env.BATCH_EVIDENCE || process.env.EVIDENCE_DIR || path.join(root, '.omo/evidence/ai-followup-0928/batch/browser');
function seedRequestWorkspaces(count, initialGeneration = false, missingCapabilities = false, mode = 'pro', scoped = false, badTask = false, sourceOnly = false, fixtureOptions = {}) {
  localStorage.setItem('5e.tutorial.bannerSeen', 'true');
  localStorage.setItem('5e.preview:5e.mode', mode);
  const listeners = new Set();
  const sends = [];
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 768;
  const draw = canvas.getContext('2d');
  draw.fillStyle = '#fff'; draw.fillRect(0, 0, 512, 384);
  const noise = draw.createImageData(512, 768); let seed = 92;
  for (let index = 0; index < noise.data.length; index += 4) {
    for (let channel = 0; channel < 3; channel++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; noise.data[index + channel] = seed >>> 24; }
    noise.data[index + 3] = 255;
  }
  draw.putImageData(noise, 0, 0);
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


test('selected workspaces queue both >1MiB PNGs with byte-identical persisted originals', {timeout:120000}, async context => {
  fs.mkdirSync(evidenceRoot, {recursive:true});
  const {page, errors, baseline: originalBaseline} = await requestBrowserFixture(context, 2, evidenceRoot);
  for(const id of ['task-0','task-1']){
    await page.locator('#ai-image-panel [data-tab-id="'+id+'"] .ai-task-tab-select').click();
    await page.waitForFunction(id=>document.querySelector('#ai-image-panel [data-tab-id="'+id+'"] .ai-task-tab-select')?.getAttribute('aria-pressed')==='true',id);
  }
  await page.locator('#ai-image-panel [data-tab-id="task-0"] .ai-task-tab-select').click();
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-tab-id="task-0"] .ai-task-tab-select')?.getAttribute('aria-pressed')==='true');
  const baseline=await page.evaluate(async()=>(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace=>workspace.tabs));
  assert.equal(baseline.length,2);
  assert.equal(new Set(baseline.map(tab=>tab.id)).size,2);
  for(const originalTab of originalBaseline){
    const canonical=baseline.find(tab=>tab.id===originalTab.id);
    assert.ok(canonical);
    assert.equal(canonical.attachments.length,originalTab.attachments.length);
    for(let index=0;index<originalTab.attachments.length;index++)for(const field of Object.keys(originalTab.attachments[index])){
      assert.equal(Object.hasOwn(canonical.attachments[index],field),true);
      assert.deepEqual(canonical.attachments[index][field],originalTab.attachments[index][field],'Physical preparation preserves every original attachment field and raw byte: '+field);
    }
  }
  fs.writeFileSync(path.join(evidenceRoot,'batch-canonical-baseline-proof.json'),JSON.stringify({original:originalBaseline,canonical:baseline,allOriginalAttachmentFieldsExact:true},null,2));
  const before = await page.evaluate(() => ({bytes: atob(window.__task2.original.split(',')[1]).length}));
  assert.ok(before.bytes > 1_048_576, `fixture must reproduce old limit: ${before.bytes}`);
  fs.writeFileSync(path.join(evidenceRoot, 'before.txt'), await page.locator('#ai-image-panel').innerText());
  await page.click('#ai-image-panel [data-tab-id="task-0"] .ai-task-tab-select');
  await page.click('#ai-image-panel [data-tab-id="task-1"] .ai-task-tab-select', {modifiers:['Meta']});
  assert.equal(await page.locator('#ai-image-panel [data-ai-selection-count]').textContent(), '2개 선택');
  await (await currentPrimaryAction(page)).click();
  await page.waitForFunction(() => window.__task2.generationSends.length === 2);
  await page.waitForFunction(() => window.__task2Manager.workspaceBatchState().length === 2);
  const capturedBatchSources=await page.evaluate(()=>window.__task2Manager.workspaceBatchState().map(job=>job.sourceSnapshot));
  assert.deepEqual(capturedBatchSources.map(source=>source.owner.taskId),['task-0','task-1']);
  assert.equal(new Set(capturedBatchSources.map(source=>JSON.stringify(source.owner))).size,2);
  for(const source of capturedBatchSources){
    assert.equal(source.snapshotVersion,1,'Exact compact journal encoding version');
    assert.equal(Object.hasOwn(source.snapshot,'dataUrl'),false,'Encoded nested snapshot deliberately omits the original byte field');
    assert.equal(source.dataUrl,await page.evaluate(()=>window.__task2.original),'The actual encoded original PNG remains byte exact');
  }
  const result = await page.evaluate(async () => {
    const jobs = window.__task2Manager.workspaceBatchState();
    const {idbGet} = await import(window.__runtime.base + 'idb-store.js' + window.__runtime.query);
    const primaryScope = JSON.parse(localStorage.getItem('5e.aiPrimaryWorkspace.v1') || '""');
    const records = await idbGet(`ai-workspace-batch:${JSON.stringify(['5e','workspace-selection:' + (primaryScope || 'main')])}`);
    const parallelScopes = JSON.parse(localStorage.getItem('5e.aiParallelWorkspaces.v1') || '[]');
    const isScope = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
    if (primaryScope !== '' && !isScope(primaryScope)) throw new Error('Unexpected native primary workspace scope');
    if (!Array.isArray(parallelScopes) || parallelScopes.some(scope => !isScope(scope))) throw new Error('Unexpected native parallel workspace registry');
    const registeredScopes = new Set([primaryScope, ...parallelScopes]);
    const durableOwners = [];
    for (const job of jobs) {
      const taskId = job.sourceSnapshot.owner.taskId;
      const rows = [...document.querySelectorAll('#ai-image-panel [data-ai-tab-list] [data-ai-workspace-link]')].filter(row => row.dataset.tabId === taskId);
      if (rows.length !== 1) throw new Error('Expected one actual navigation owner for ' + taskId);
      const navigationScope = rows[0].dataset.aiWorkspaceLink;
      const scope = navigationScope === 'legacy' ? '' : navigationScope;
      if (!(scope === '' || isScope(scope)) || !registeredScopes.has(scope)) throw new Error('Actual navigation scope is absent from the native workspace registry: ' + taskId);
      const dbName = '5e.preview:5e-ai-image-tasks' + (scope ? '-' + scope : '');
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error('Expected exact task owner database is absent: ' + dbName)); };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      let workspace;
      try {
        workspace = await new Promise((resolve, reject) => {
          const request = db.transaction('tasks').objectStore('tasks').get('workspace');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      } finally { db.close(); }
      const tabs = workspace?.tabs?.filter(tab => tab.id === taskId);
      if (tabs?.length !== 1) throw new Error('Expected exactly one stored original task in its current owner database: ' + taskId);
      const tab = tabs[0];
      durableOwners.push({ taskId, scope, navigationScope, dbName,
        batchOwnerPresent: Object.hasOwn(tab, 'batchOwner'),
        ...(Object.hasOwn(tab, 'batchOwner') ? {batchOwner: tab.batchOwner} : {}),
        attachments: tab.attachments });
    }
    return {
      sends: window.__task2.generationSends.length,
      queuedJobs: jobs.length,
      originalBytes: atob(window.__task2.original.split(',')[1]).length,
      owners: jobs.map(job => job.sourceSnapshot.owner.taskId),
      states: jobs.map(job => job.state),
      snapshotsUnchanged: jobs.every(job => job.sourceSnapshot.dataUrl === window.__task2.original),
      persistedCount: records?.length,
      persistedRecordBytes: records?.map(record => new TextEncoder().encode(JSON.stringify(record)).byteLength),
      persistedTotalBytes: records ? new TextEncoder().encode(JSON.stringify(records)).byteLength : null,
      durableOwners,
      persistedAttachmentsUnchanged: durableOwners.every(owner => owner.attachments[0]?.data === window.__task2.original),
      operations: jobs.map(job => job.sourceSnapshot.snapshot.operation),
      rawCalls: window.__task2.sends.map(send => ({ stage: send.stage, model: send.payload.model, purpose: send.payload.purpose })),
      persistedOriginalsUnchanged: records?.every(job => job.sourceSnapshot.dataUrl === window.__task2.original),
      sizeError: document.body.textContent.includes('Batch source exceeds the size limit.'),
    };
  });
  await page.screenshot({path:path.join(evidenceRoot, 'both-queued.png')});
  fs.writeFileSync(path.join(evidenceRoot, 'result.json'), JSON.stringify(result,null,2));
  assert.equal(result.sends,2); assert.equal(result.queuedJobs,2);
  assert.deepEqual(new Set(result.owners),new Set(['task-0','task-1']));
  assert.deepEqual(result.states,['running','running']);
  assert.equal(result.snapshotsUnchanged,true); assert.equal(result.persistedCount,2);
  assert.equal(result.persistedOriginalsUnchanged,true); assert.equal(result.persistedAttachmentsUnchanged,true);
  assert.equal(result.durableOwners.length,2);
  assert.equal(new Set(result.durableOwners.map(owner=>owner.taskId)).size,2);
  assert.deepEqual(result.durableOwners.map(owner=>owner.taskId),result.owners);
  assert.deepEqual(await page.evaluate(()=>window.__task2Manager.workspaceBatchState().map(job=>job.sourceSnapshot)),capturedBatchSources,'Every actual captured source, nested metadata and original owner remains exact during durable ownership inspection');
  for(const owner of result.durableOwners){
    if(owner.batchOwnerPresent && owner.batchOwner != null) assert.deepEqual(owner.batchOwner,capturedBatchSources.find(source=>source.owner.taskId===owner.taskId).owner,'Only actually persisted batch identity is compared; absence stays observed absence');
    assert.deepEqual(owner.attachments,baseline.find(tab=>tab.id===owner.taskId).attachments,'Every original durable attachment field and raw byte stays exact in its actual owner');
  }
  assert.deepEqual(result.operations,['generate','generate']);
  assert.equal(result.rawCalls.length,2); assert.deepEqual(result.rawCalls.map(call=>call.stage),['native-generation','native-generation']); assert.deepEqual(result.rawCalls.map(call=>call.purpose),['scene','scene']);
  assert.ok(result.persistedRecordBytes.every(bytes=>bytes>1_048_576)); assert.ok(result.persistedTotalBytes>2_097_152); assert.equal(result.sizeError,false);
  assert.deepEqual(errors,[]);
});


// Immediate native completion: observations call the actual cache methods and
// return their original values. No cache record, hit, output or owner is seeded.
async function installImmediateSceneCacheObservation(page) {
  await page.evaluate(async () => {
    const moduleUrl = new URL(window.__runtime.base + 'ai-output-cache-store.js' + window.__runtime.query, window.location.href);
    const entryBase = new URL(window.__runtime.base, window.location.href);
    if (moduleUrl.origin !== window.location.origin || moduleUrl.pathname !== entryBase.pathname + 'ai-output-cache-store.js' || moduleUrl.search !== window.__runtime.query) throw new Error('Cache observation must import the exact canonical same-origin module');
    const { ExactOutputCacheStore } = await import(moduleUrl.href);
    const original = { get: ExactOutputCacheStore.prototype.get, put: ExactOutputCacheStore.prototype.put };
    const proof = window.__immediateSceneCacheProof = { phase: 'warm', gets: [], puts: [], methodPassThrough: true, moduleUrl: moduleUrl.href, documentUrl: window.location.href };
    for (const method of ['get','put']) ExactOutputCacheStore.prototype[method] = function (...args) {
      const phase = proof.phase;
      const key = method === 'get' ? args[0] : args[0]?.key;
      const result = Reflect.apply(original[method], this, args);
      return result.then(async value => {
        // Observe the already-used actual backend handle; leave it open for its
        // product owner. The original method above performs every read/write.
        const database = await this.backend.open();
        proof[method === 'get' ? 'gets' : 'puts'].push({phase,key,backendName:this.backend.databaseName,backendClass:this.backend.constructor.name,databaseName:database.name,result:structuredClone(value)});
        return value;
      });
    };
    window.__restoreImmediateSceneCacheObservation = () => {
      for (const method of ['get','put']) ExactOutputCacheStore.prototype[method] = original[method];
    };
    // Exact owner database reads only. Manager registry keys deliberately use
    // native localStorage, while task databases retain their preview prefix.
    window.__readImmediateSceneTaskOwners = async taskIds => {
      const primary = JSON.parse(localStorage.getItem('5e.aiPrimaryWorkspace.v1') || '""');
      const parallel = JSON.parse(localStorage.getItem('5e.aiParallelWorkspaces.v1') || '[]');
      const validScope = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
      if (primary !== '' && !validScope(primary) || !Array.isArray(parallel) || parallel.some(value => !validScope(value))) throw new Error('Invalid actual native workspace registry');
      const registered = new Set([primary,...parallel]);
      const owners = [];
      for (const taskId of taskIds) {
        const rows = [...document.querySelectorAll('#ai-image-panel [data-ai-tab-list] [data-ai-workspace-link]')].filter(row => row.dataset.tabId === taskId);
        if (rows.length !== 1) throw new Error('Expected one actual navigation owner: ' + taskId);
        const navigationScope = rows[0].dataset.aiWorkspaceLink;
        const scope = navigationScope === 'legacy' ? '' : navigationScope;
        if (!(scope === '' || validScope(scope)) || !registered.has(scope)) throw new Error('Exact navigation scope is not registered: ' + taskId);
        const dbName = '5e.preview:5e-ai-image-tasks' + (scope ? '-' + scope : '');
        const db = await new Promise((resolve,reject) => {
          const request = indexedDB.open(dbName,1);
          request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error('Actual task owner database absent: ' + dbName)); };
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result);
        });
        let workspace;
        try {
          workspace = await new Promise((resolve,reject) => {
            const request = db.transaction('tasks').objectStore('tasks').get('workspace');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
        } finally { db.close(); }
        const tabs = workspace?.tabs?.filter(tab => tab.id === taskId);
        if (tabs?.length !== 1) throw new Error('Expected one exact durable task owner: ' + taskId);
        const tab = tabs[0];
        owners.push({taskId,scope,navigationScope,dbName,batchOwnerPresent:Object.hasOwn(tab,'batchOwner'),...(Object.hasOwn(tab,'batchOwner') ? {batchOwner:tab.batchOwner} : {}),tab});
      }
      return owners;
    };
  });
}

async function selectImmediateSceneTask(page, taskId) {
  const button = page.locator('#ai-image-panel [data-tab-id="' + taskId + '"] .ai-task-tab-select');
  assert.equal(await button.count(),1);
  await button.click();
  await page.waitForFunction(taskId => {
    const button = document.querySelector('#ai-image-panel [data-tab-id="' + taskId + '"] .ai-task-tab-select');
    return button?.getAttribute('aria-pressed') === 'true';
  },taskId);
}

function assertEveryOriginalAttachmentField(canonical, original) {
  assert.equal(canonical.attachments.length,original.attachments.length);
  for (let index=0;index<original.attachments.length;index++) for (const field of Object.keys(original.attachments[index])) {
    assert.equal(Object.hasOwn(canonical.attachments[index],field),true);
    assert.deepEqual(canonical.attachments[index][field],original.attachments[index][field],'Preparation retains original attachment field and bytes: ' + field);
  }
}

async function immediateSceneFixture(context,count,evidence,engine) {
  const previousEngine=process.env.TASK2_ENGINE; process.env.TASK2_ENGINE=engine;
  try { return await requestBrowserFixture(context,count,evidence); }
  finally {
    // Register restoration after the real fixture's cleanup hooks, including
    // failed boot: cleanup receipts must retain their actual engine identity.
    context.after(()=>{if(previousEngine===undefined)delete process.env.TASK2_ENGINE;else process.env.TASK2_ENGINE=previousEngine;});
  }
}

for (const engine of ['chromium','webkit']) test('real native scene cache completes selected batch once with one uncached peer in ' + engine,{timeout:180000},async context => {
  const evidence=path.join(evidenceRoot,engine,'real-scene-cache-batch'); fs.mkdirSync(evidence,{recursive:true});
  const {page,errors,baseline:initial}=await immediateSceneFixture(context,3,evidence,engine);
  for (const id of ['task-0','task-1','task-2']) await selectImmediateSceneTask(page,id);
  const baseline=await page.evaluate(async()=>(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace=>workspace.tabs));
  assert.equal(baseline.length,3); assert.equal(new Set(baseline.map(tab=>tab.id)).size,3);
  for (const tab of initial) {
    assertEveryOriginalAttachmentField(baseline.find(item=>item.id===tab.id),tab);
    assert.ok(Buffer.from(tab.attachments[0].data.split(',')[1],'base64').byteLength>1_048_576,'The real warmed/batched source attachment retains the original large PNG');
  }
  assert.ok(baseline.every(tab=>tab.generated.length===0&&tab.selectedCandidateId===null&&tab.outputEngine==='asset'&&tab.imageLabelWorkflow.explicit===true));
  assert.equal(baseline.find(tab=>tab.id==='task-1').model,'gpt-6.1-sol');
  assert.equal(baseline.find(tab=>tab.id==='task-2').model,'gpt-6.1-sol');
  assert.equal(baseline.find(tab=>tab.id==='task-0').model,'gpt-6-luna');
  await installImmediateSceneCacheObservation(page);
  await (await currentPrimaryAction(page)).click();
  await page.waitForFunction(()=>window.__task2.generationSends.length===1);
  assert.equal(await page.evaluate(()=>window.__task2.generationSends[0].stage),'native-generation');
  await page.evaluate(()=>{window.__task2.emitGeneration(0,'image');window.__task2.emitGeneration(0,'done');});
  await page.waitForFunction(()=>window.__immediateSceneCacheProof.puts.some(row=>row.phase==='warm'&&row.result.stored===true&&row.result.entry?.output?.sceneSource));
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel')?.dataset.aiBusy==='false');
  const originalWarm=await page.evaluate(async()=>(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace=>workspace.tabs).find(tab=>tab.id==='task-2'));
  const warmSelection=await page.evaluate(()=>{
    const panel=document.querySelector('#ai-image-panel');
    const cards=[...panel.querySelectorAll('.ai-generated-card.is-ai-active-candidate')];
    const options=[...panel.querySelectorAll('[data-ai-candidate-option][aria-selected="true"]')];
    return {activeOwner:window.__task2Manager.activeExamTask(),panelCandidateId:panel.dataset.aiSelectedCandidateId,
      activeCardIds:cards.map(card=>card.dataset.aiCandidateId),selectedOptionIds:options.map(option=>option.dataset.aiCandidateOption),
      workbench:panel.aiWorkbench.getViewState()};
  });
  assert.equal(originalWarm.generated.length,1);
  const warmCandidateId=originalWarm.generated[0].id;
  assert.equal(warmSelection.activeOwner.taskId,'task-2');
  assert.equal(warmSelection.panelCandidateId,warmCandidateId,'The native singleton selects its authoritative candidate before any owner switch/reload');
  assert.deepEqual(warmSelection.activeCardIds,[warmCandidateId],'Exactly one actual active native card belongs to the authoritative candidate');
  assert.deepEqual(warmSelection.selectedOptionIds,[warmCandidateId]);
  assert.equal(warmSelection.workbench.selectedCandidateId,warmCandidateId);
  assert.equal(originalWarm.selectedCandidateId,warmCandidateId,'Live controller capture agrees with the rendered native singleton');
  assert.equal(originalWarm.workbenchViewState.selectedCandidateId,warmCandidateId);
  fs.writeFileSync(path.join(evidence,'real-native-singleton-selection.json'),JSON.stringify({tab:originalWarm,selection:warmSelection},null,2));
  // Use the actual physical owner restore before the strict full baseline. Its
  // serializer may add defaults, but it must preserve every already-present field.
  await selectImmediateSceneTask(page,'task-0'); await selectImmediateSceneTask(page,'task-2');
  const warm=await page.evaluate(async()=>({proof:structuredClone(window.__immediateSceneCacheProof),tab:(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace=>workspace.tabs).find(tab=>tab.id==='task-2'),sends:structuredClone(window.__task2.sends)}));
  assertEveryOriginalAttachmentField(warm.tab,originalWarm);
  assert.equal(warm.tab.generated.length,originalWarm.generated.length);
  for(let index=0;index<originalWarm.generated.length;index++) for(const field of Object.keys(originalWarm.generated[index])) {
    assert.equal(Object.hasOwn(warm.tab.generated[index],field),true);
    assert.deepEqual(warm.tab.generated[index][field],originalWarm.generated[index][field],'Real owner restore retains each original native candidate field: '+field);
  }
  const warmPuts=warm.proof.puts.filter(row=>row.phase==='warm'&&row.result.stored);
  assert.equal(warmPuts.length,1); const entry=warmPuts[0].result.entry;
  assert.equal(warm.proof.gets.length,1); assert.equal(warm.proof.gets[0].result.hit,false);
  assert.equal(warmPuts[0].backendName,'5e-ai-output-cache');
  assert.equal(warmPuts[0].backendClass,'IndexedDBOutputCacheBackend');
  assert.equal(warmPuts[0].databaseName,'5e.preview:5e-ai-output-cache');
  assert.equal(entry.output.complete,true); assert.ok(entry.output.sceneSource); assert.ok(entry.output.sceneCompileSource);
  assert.equal(warm.tab.generated.length,1); assert.equal(warm.tab.generated[0].sceneResult.valid,true); assert.equal(warm.tab.generated[0].sceneResult.supported,true);
  assert.equal(warm.sends.length,1); assert.equal(warm.sends[0].payload.model,'gpt-6.1-sol');
  fs.writeFileSync(path.join(evidence,'real-cache-warm.json'),JSON.stringify(warm,null,2));
  await selectImmediateSceneTask(page,'task-0');
  await page.locator('#ai-image-panel [data-tab-id="task-1"] .ai-task-tab-select').click({modifiers:['Meta']});
  assert.equal(await page.locator('#ai-image-panel [data-ai-selection-count]').textContent(),'2개 선택');
  await page.evaluate(()=>{window.__immediateSceneCacheProof.phase='selected-batch';});
  await (await currentPrimaryAction(page)).click();
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().length===2&&window.__task2Manager.workspaceBatchState().find(job=>job.sourceSnapshot.owner.taskId==='task-1')?.state==='completed'&&window.__task2.generationSends.length===2);
  const mid=await page.evaluate(()=>({jobs:window.__task2Manager.workspaceBatchState(),proof:structuredClone(window.__immediateSceneCacheProof),sends:structuredClone(window.__task2.sends)}));
  const capturedSources=mid.jobs.map(job=>job.sourceSnapshot);
  for(const source of capturedSources) {
    assert.equal(source.snapshotVersion,1);
    assert.equal(Object.hasOwn(source.snapshot,'dataUrl'),false,'The nested compact encoding omits only its duplicated byte field');
    assert.equal(source.dataUrl,initial.find(tab=>tab.id===source.owner.taskId).attachments[0].data,'Captured original source remains byte exact');
  }
  assert.equal(new Set(capturedSources.map(source=>JSON.stringify(source.owner))).size,2);
  assert.deepEqual(capturedSources.map(source=>source.owner.taskId),['task-0','task-1']);
  const hit=mid.proof.gets.filter(row=>row.phase==='selected-batch'&&row.result.hit);
  assert.equal(hit.length,1); assert.equal(hit[0].key,entry.key); assert.deepEqual(hit[0].result.entry.descriptor,entry.descriptor); assert.deepEqual(hit[0].result.entry.output,entry.output);
  assert.equal(hit[0].backendClass,'IndexedDBOutputCacheBackend'); assert.equal(hit[0].databaseName,'5e.preview:5e-ai-output-cache');
  assert.equal(mid.proof.gets.filter(row=>row.phase==='selected-batch'&&row.result.hit===false).length,1);
  assert.equal(mid.sends.length,2,'Warm request once plus only one actual uncached batch request');
  assert.deepEqual(mid.sends.map(send=>send.stage),['native-generation','native-generation']);
  assert.deepEqual(mid.sends.map(send=>send.payload.model),['gpt-6.1-sol','gpt-6-luna']);
  assert.equal(mid.jobs.find(job=>job.sourceSnapshot.owner.taskId==='task-0').state,'running');
  const cachedJob=mid.jobs.find(job=>job.sourceSnapshot.owner.taskId==='task-1');
  assert.equal(cachedJob.state,'completed'); assert.equal(cachedJob.attempt,1);
  assert.equal(cachedJob.result.generation.operation,'generate');
  assert.deepEqual({scope:cachedJob.result.generation.scope,taskId:cachedJob.result.generation.taskId},cachedJob.sourceSnapshot.owner);
  assert.equal(cachedJob.result.generation.candidateId,`workspace-${cachedJob.id}-${cachedJob.attempt}`);
  assert.equal(cachedJob.result.output.committed,true); assert.equal(cachedJob.result.output.revisionId,cachedJob.result.generation.candidateId);
  assert.equal(cachedJob.result.generation.candidate.sceneSource,entry.output.sceneSource); assert.equal(cachedJob.result.generation.candidate.sceneCompileSource,entry.output.sceneCompileSource);
  fs.writeFileSync(path.join(evidence,'real-cache-batch-mid.json'),JSON.stringify(mid,null,2));
  await selectImmediateSceneTask(page,'task-1');
  const cachedVisible=await page.evaluate(async()=>(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace=>workspace.tabs).find(tab=>tab.id==='task-1'));
  assert.equal(cachedVisible.generated.length,1); assert.equal(cachedVisible.generated[0].id,cachedJob.result.generation.candidateId);
  assert.equal(cachedVisible.generated[0].workspaceBatch.jobId,cachedJob.id);
  await page.evaluate(()=>{window.__task2.emitGeneration(1,'image');window.__task2.emitGeneration(1,'done');});
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().every(job=>job.state==='completed'));
  for (const id of ['task-0','task-1','task-2']) await selectImmediateSceneTask(page,id);
  await page.waitForFunction(async()=>{
    const actual=(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace=>workspace.tabs);
    const stored=await window.__readImmediateSceneTaskOwners(['task-0','task-1','task-2']);
    const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
    return stored.every(owner=>JSON.stringify(canonical(owner.tab))===JSON.stringify(canonical(actual.find(tab=>tab.id===owner.taskId))));
  });
  const final=await page.evaluate(async()=>({jobs:window.__task2Manager.workspaceBatchState(),tabs:(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace=>workspace.tabs),durable:await window.__readImmediateSceneTaskOwners(['task-0','task-1','task-2']),proof:structuredClone(window.__immediateSceneCacheProof),sends:structuredClone(window.__task2.sends)}));
  assert.deepEqual(final.jobs.map(job=>job.sourceSnapshot),capturedSources,'All captured source bytes, settings and owner identities stay exact');
  assert.deepEqual(final.jobs.map(job=>job.state),['completed','completed']); assert.equal(final.sends.length,2);
  assert.equal(new Set(final.tabs.map(tab=>tab.id)).size,3); assert.equal(final.tabs.length,3);
  for (const original of baseline) {
    const tab=final.tabs.find(tab=>tab.id===original.id);
    assert.equal(tab.generated.length,original.generated.length+1); assert.equal(new Set(tab.generated.map(item=>item.id)).size,1);
    assert.deepEqual(tab.attachments,original.attachments,'Full original normalized attachment fields and raw bytes remain exact');
    assert.equal(tab.generated[0].sceneResult.valid,true); assert.equal(tab.generated[0].sceneResult.supported,true);
  }
  for (const owner of final.durable) {
    assert.deepEqual(owner.tab,final.tabs.find(tab=>tab.id===owner.taskId),'Whole owner task and every candidate field are durably identical');
    const captured=capturedSources.find(source=>source.owner.taskId===owner.taskId);
    if(captured && owner.batchOwnerPresent && owner.batchOwner!=null) assert.deepEqual(owner.batchOwner,captured.owner,'Compare only an actually stored batch identity; absence remains observed absence');
  }
  assert.deepEqual(final.tabs.find(tab=>tab.id==='task-2').generated,warm.tab.generated,'The unselected warm owner keeps its complete original native history');
  fs.writeFileSync(path.join(evidence,'real-cache-batch-final.json'),JSON.stringify(final,null,2));
  await page.evaluate(()=>window.__restoreImmediateSceneCacheObservation());
  await page.reload({waitUntil:'networkidle'}); await page.locator('#ai-image-install-open').click();
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().length===2&&window.__task2Manager.workspaceBatchState().every(job=>job.state==='completed'));
  for (const id of ['task-0','task-1','task-2']) await selectImmediateSceneTask(page,id);
  const reopened=await page.evaluate(async()=>({jobs:window.__task2Manager.workspaceBatchState(),tabs:(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace=>workspace.tabs),sends:structuredClone(window.__task2.sends)}));
  assert.deepEqual(reopened.jobs,final.jobs,'Reload preserves the entire completed journal and exact owners');
  assert.deepEqual(reopened.tabs.map(tab=>tab.id).sort(),final.tabs.map(tab=>tab.id).sort());
  for (const tab of final.tabs) assert.deepEqual(reopened.tabs.find(item=>item.id===tab.id),tab,'Reselect and reload preserve every complete task/candidate field');
  assert.equal(reopened.sends.length,0,'Restoring completed cached/transport rows never replays a provider request');
  fs.writeFileSync(path.join(evidence,'real-cache-batch-reload.json'),JSON.stringify(reopened,null,2));
  assert.deepEqual(errors,[]);
});

for (const engine of ['chromium','webkit']) test('source-free workspaces expose no physical send; local motif router/compiler component is valid in ' + engine,{timeout:120000},async context=>{
  const evidence=path.join(evidenceRoot,engine,'source-free-ui-and-local-component'); fs.mkdirSync(evidence,{recursive:true});
  const {page,errors,baseline:initial}=await immediateSceneFixture(context,2,evidence,engine);
  page.on('dialog',async dialog=>{assert.equal(dialog.type(),'confirm');await dialog.accept();});
  const request='한반도 물리 해안선 지도를 그려 줘';
  // Visit both real owners before the exact baseline, retaining every original
  // field while allowing the application's normal first-open initialization.
  for (const id of ['task-0','task-1']) await selectImmediateSceneTask(page,id);
  const canonical=await page.evaluate(async()=>(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace=>workspace.tabs));
  assert.equal(canonical.length,2); assert.equal(new Set(canonical.map(tab=>tab.id)).size,2);
  for(const tab of initial) assertEveryOriginalAttachmentField(canonical.find(item=>item.id===tab.id),tab);
  assert.ok(canonical.every(tab=>tab.generated.length===0&&tab.selectedCandidateId===null&&tab.outputEngine==='asset'&&tab.imageLabelWorkflow.explicit===true));
  const deletionReceipts=[];
  const inspectPhysicalActions=async()=>{
    const actions=[];
    for(const selector of ['[data-ai-send]','[data-ai-comments-apply]']) {
      const buttons=page.locator('#ai-image-panel '+selector);
      const count=await buttons.count(); assert.ok(count<=1,'One canonical action per selector in the actual active panel');
      const observations=[];
      for(let index=0;index<count;index++) {
        const button=buttons.nth(index);
        observations.push({visible:await button.isVisible(),enabled:await button.isEnabled()});
      }
      assert.equal(observations.filter(button=>button.visible&&button.enabled).length,0,'Source-free empty stage has no available physical action: '+selector);
      actions.push({selector,count,observations});
    }
    assert.equal(await page.locator('#ai-image-panel [data-ai-input]').isVisible(),false);
    assert.equal(await page.locator('#ai-image-panel').getAttribute('data-ai-stage'),'empty');
    assert.equal(await page.evaluate(()=>window.__task2.sends.length),0);
    assert.equal(await page.evaluate(()=>window.__task2Manager.workspaceBatchState().length),0);
    return actions;
  };
  for(const id of ['task-0','task-1']) {
    await selectImmediateSceneTask(page,id);
    // Pin a real user-chosen layout before deletion. Removing the source must
    // not change zoom/layout, unrelated owner fields, history or settings.
    const compare=page.locator('#ai-image-panel [data-ai-layout-mode="side-by-side"]');
    assert.equal(await compare.count(),1); assert.equal(await compare.isVisible(),true); assert.equal(await compare.isEnabled(),true); await compare.click();
    const settings=page.locator('#ai-image-panel [data-ai-side-tab="comments"]');
    assert.equal(await settings.isVisible(),true); await settings.click();
    const owner=await page.evaluate(()=>window.__task2Manager.activeExamTask()); assert.equal(owner.taskId,id);
    const before=await page.evaluate(async()=>(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace=>workspace.tabs));
    const prior=before.find(tab=>tab.id===id);
    assert.equal(prior.attachments.length,1); assert.equal(prior.generated.length,0);
    assert.equal(prior.workbenchViewState.layout,'side-by-side');
    assert.equal(prior.workbenchViewState.selectedSourceId,prior.attachments[0].id);
    assert.equal(prior.commentViewState.selected,null); assert.equal(prior.commentViewState.tab,'comments');
    const input=page.locator('#ai-image-panel [data-ai-input]'); assert.equal(await input.isVisible(),true); assert.equal(await input.isEnabled(),true); await input.fill(request);
    const typed=await page.evaluate(async()=>(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace=>workspace.tabs));
    for(const tab of before) {
      const expected=structuredClone(tab); if(tab.id===id) expected.input=request;
      assert.deepEqual(typed.find(item=>item.id===tab.id),expected,'Physical typing changes only the exact owned input; every peer/owner field remains exact');
    }
    const remove=page.locator('#ai-image-panel .ai-reference-card button[title="이미지 제거"]');
    assert.equal(await remove.count(),1); assert.equal(await remove.isVisible(),true); assert.equal(await remove.isEnabled(),true); await remove.click();
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel')?.dataset.aiStage==='empty'&&document.querySelectorAll('#ai-image-panel .ai-reference-card').length===0);
    assert.equal(await input.inputValue(),request); assert.equal(await remove.count(),0);
    const sourceDeletion=await page.evaluate(async composition=>{
      const url=new URL(window.__runtime.base+'ai-source-tasking.js'+window.__runtime.query,window.location.href);
      if(url.origin!==window.location.origin||url.search!==window.__runtime.query)throw new Error('Source composition must use the actual canonical same-origin module');
      const {normalizeReferenceComposition}=await import(url.href);
      return {moduleUrl:url.href,composition:normalizeReferenceComposition(composition,[])};
    },typed.find(tab=>tab.id===id).referenceComposition);
    const after=await page.evaluate(async()=>(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace=>workspace.tabs));
    for(const tab of typed) {
      const expected=structuredClone(tab);
      if(tab.id===id) {
        expected.attachments=[];
        // These two dependent source fields are the exact deletion transition,
        // not omitted/filtered fields or a generic snapshot normalizer.
        expected.referenceComposition=sourceDeletion.composition;
        expected.workbenchViewState.selectedSourceId='';
      }
      assert.deepEqual(after.find(item=>item.id===tab.id),expected,'Only source deletion and its exact source references change; the complete owner/peer task remains exact');
    }
    assert.deepEqual(await page.evaluate(()=>window.__task2Manager.activeExamTask()),owner,'Source removal preserves the actual controller scope and task identity');
    const actions=await inspectPhysicalActions();
    deletionReceipts.push({owner,before,typed,after,sourceDeletion,actions});
  }
  await selectImmediateSceneTask(page,'task-0');
  await page.locator('#ai-image-panel [data-tab-id="task-1"] .ai-task-tab-select').click({modifiers:['Meta']});
  assert.equal(await page.locator('#ai-image-panel [data-ai-selection-count]').textContent(),'2개 선택');
  const beforeComponent=await page.evaluate(async()=>(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace=>workspace.tabs));
  assert.ok(beforeComponent.every(tab=>tab.attachments.length===0&&tab.generated.length===0&&tab.input===request));
  for(const tab of deletionReceipts.at(-1).after) assert.deepEqual(beforeComponent.find(item=>item.id===tab.id),tab,'Physical multi-selection does not mutate a complete source-free task');
  const selectedActions=await inspectPhysicalActions();
  // Positive evidence is limited to actual public component APIs. This never
  // invokes submit/runBatch, registers a candidate, primes a cache or inserts.
  const component=await page.evaluate(async({request,references})=>{
    const names=['ai-local-asset-router','ai-panel','ai-scene-preview'];
    const urls=names.map(name=>new URL(window.__runtime.base+name+'.js'+window.__runtime.query,window.location.href));
    if(urls.some(url=>url.origin!==window.location.origin||url.search!==window.__runtime.query))throw new Error('Local component imports must retain the actual canonical same-origin query');
    const [router,panel,preview]=await Promise.all(urls.map(url=>import(url.href)));
    const match=router.matchLocalAssetRequest({request,mode:'diagram',references:[]});
    const compiled=panel.compilePanelScene(match.motifRequest,{mode:'diagram',layerId:window.__integrationState.get().activeLayerId,idPrefix:'local_component'});
    const data=preview.fastSceneToSvgDataUrl(compiled.result);
    const svg=new DOMParser().parseFromString(decodeURIComponent(data.slice(data.indexOf(',')+1)),'image/svg+xml');
    return {request,urls:urls.map(url=>url.href),origin:window.location.origin,moduleBase:window.__runtime.base,moduleQuery:window.__runtime.query,
      match,compiled,svgData:data,svgRoot:svg.documentElement.localName,svgParseErrors:svg.querySelectorAll('parsererror').length,
      withOriginalSource:router.matchLocalAssetRequest({request,mode:'diagram',references}),
      wrongMode:router.matchLocalAssetRequest({request,mode:'physics',references:[]}),
      qualification:'Actual router/compiler/renderer component APIs only; no singleton UI generation, batch completion, cache hit or provider execution is established.'};
  },{request,references:deletionReceipts.flatMap(receipt=>receipt.typed.find(tab=>tab.id===receipt.owner.taskId).attachments)});
  for(const url of component.urls) {
    const parsed=new URL(url); assert.equal(parsed.origin,component.origin); assert.equal(parsed.search,component.moduleQuery);
    assert.ok(parsed.pathname.startsWith(component.moduleBase));
  }
  assert.equal(component.match.matched,true);
  assert.equal(component.compiled.expansionError,null);
  assert.equal(component.compiled.result.valid,true); assert.equal(component.compiled.result.supported,true);
  assert.ok(component.compiled.result.objects.length>0); assert.equal(component.compiled.result.stats.outputObjects,component.compiled.result.objects.length);
  assert.match(component.compiled.compileSource,/verified_map_outline/);
  assert.match(component.svgData,/^data:image\/svg\+xml;charset=utf-8,/); assert.equal(component.svgRoot,'svg'); assert.equal(component.svgParseErrors,0);
  assert.equal(component.withOriginalSource.matched,false); assert.equal(component.withOriginalSource.reason,'references-present');
  assert.equal(component.wrongMode.matched,false); assert.equal(component.wrongMode.reason,'diagram-mode-only');
  const afterComponent=await page.evaluate(async()=>({tabs:(await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace=>workspace.tabs),sends:structuredClone(window.__task2.sends),jobs:window.__task2Manager.workspaceBatchState()}));
  assert.deepEqual(afterComponent.tabs.map(tab=>tab.id).sort(),beforeComponent.map(tab=>tab.id).sort());
  for(const tab of beforeComponent) assert.deepEqual(afterComponent.tabs.find(item=>item.id===tab.id),tab,'Component calls leave every complete workspace task/history/source/owner field unchanged');
  assert.deepEqual(afterComponent.sends,[]); assert.deepEqual(afterComponent.jobs,[]);
  assert.equal(await page.locator('#ai-image-panel .ai-generated-card').count(),0);
  await inspectPhysicalActions();
  fs.writeFileSync(path.join(evidence,'source-free-ui-and-local-component.json'),JSON.stringify({canonical,deletionReceipts,selectedActions,beforeComponent,component,afterComponent,
    singletonUiGenerationEstablished:false,positiveLocalBatchEstablished:false},null,2));
  assert.deepEqual(errors,[]);
});

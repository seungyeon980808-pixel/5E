const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const evidenceRoot = process.env.DELETION_EVIDENCE || path.join(root, '.omo/evidence/ai-followup-0928/deletion/after');
function seedRequestWorkspaces(count, initialGeneration = false, missingCapabilities = false, mode = 'pro') {
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
    model: index ? 'catalog-sol' : 'catalog-luna', effort: 'medium', serviceTier: index ? 'priority' : null, separationMode: 'off',
    outputOptions: { backgroundPolicy: 'preserve', examPalette: false, lineThickness: 0 },
    attachments: [{ id: `source-${index}`, kind: 'reference', name: `원본 ${index + 1}`, data: original, comments: [] }],
    generated: [{ id: `candidate-${index}`, kind: 'generated', name: `결과 ${index + 1}`, data: original,
      comments: [], reviewState: 'idle' }, { id: `latest-${index}`, kind: 'generated', name: '최신 결과', data: modified, comments: [], reviewState: 'idle' }],
    selectedCandidateId: `latest-${index}`, conversationMessages: [], uiMessages: [],
  }));
  if (initialGeneration) { tabs[0].generated = []; tabs[0].selectedCandidateId = null; }
  let statusGate = null;
  window.__task2 = {
    original, modified, sends, longTasks: [],
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
      if (kind === 'image') { method = 'item/completed'; params.item = { type: 'imageGeneration', imageDataUrl: modified }; }
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
    models: async () => ({ data: [{ model: 'catalog-sol', displayName: 'Fixture Sol', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: missingCapabilities ? undefined : ['medium','ultra'], serviceTiers: ['priority'] }, { model: 'catalog-luna', displayName: 'Fixture Luna', defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium','high'], serviceTiers: ['priority'] }].filter(entry => !localStorage.getItem('task7-drop-luna') || entry.model !== 'catalog-luna') }),
    captureSources: async () => [{name:'통합 캡처',data:original}],
    account: async () => ({ rateLimits: {} }), login: async () => {},
    send: async payload => { const turnId = `turn-${sends.length}`; const threadId = `thread-${sends.length}`; sends.push({ payload, turnId, threadId }); return { turnId, threadId }; },
    interrupt: async () => ({ ok: true }),
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

async function requestBrowserFixture(context, count, evidence, { transferGate = '', initialGeneration = false, missingCapabilities = false, mode = 'pro' } = {}) {
  const http = require('node:http');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const server = http.createServer((request, response) => {
    let file = path.resolve(root, `.${new URL(request.url, 'http://localhost').pathname}`);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
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
    fs.writeFileSync(path.join(evidence, 'console-errors.json'), JSON.stringify(errors));
    const finalPage = browserContext.pages()[0];
    if (finalPage && !finalPage.isClosed()) {
      const diagnostic = await finalPage.evaluate(() => [...document.querySelectorAll('[data-ai-busy]')].map(panel => ({ id: panel.id, busy: panel.dataset.aiBusy, phase: panel.dataset.aiRequestPhase, status: panel.querySelector('[data-ai-status]')?.textContent, log: panel.querySelector('[data-ai-log]')?.textContent })));
      fs.writeFileSync(path.join(evidence, `diagnostic-${count}.json`), JSON.stringify(diagnostic, null, 2));
    }
    await browserContext.tracing.stop({ path: path.join(evidence, `trace-${count}.zip`) });
    await browserContext.close();
    await browser.close();
    const port = server.address()?.port;
    await new Promise(resolve => server.close(resolve));
    fs.writeFileSync(path.join(evidence, `cleanup-${count}.json`), JSON.stringify({ engine: process.env.TASK2_ENGINE || 'chromium', browserVersion: browser.version(), browserContextClosed: true, browserClosed: !browser.isConnected(), serverClosed: !server.listening, serverPort: port }));
  });
  const page = await browserContext.newPage();
  page.setDefaultTimeout(10_000);
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => { errors.push(error.message); console.error('DELETION PAGE ERROR', error.stack); });
  await page.addInitScript({ content: `(${seedRequestWorkspaces.toString()})(${count}, ${initialGeneration}, ${missingCapabilities}, ${JSON.stringify(mode)})` });
  await page.route('**/preview/js/main.js*', route => route.fulfill({ contentType: 'text/javascript', body:
    'await window.__seedReady;\n' + fs.readFileSync(path.join(root, 'preview/js/main.js'), 'utf8').replace(
      'const aiPanel = initAiPanel(state, { freshStart: recoveryChoice === "fresh" });',
      'const aiPanel = initAiPanel(state, { freshStart: false }); window.__task2Manager = aiPanel; window.__integrationState = state;') }));
  await page.route('**/preview/js/ai-panel.js*', route => {
    let source = fs.readFileSync(path.join(root, 'preview/js/ai-panel.js'), 'utf8');
    if (transferGate === 'snapshot') source = source.replace("return structuredClone({ key: 'workspace', tabs: [tab], activeTaskTabId: id, taskTabSerial, imageSerial });", "const snapshot = structuredClone({ key: 'workspace', tabs: [tab], activeTaskTabId: id, taskTabSerial, imageSerial }); window.__transferWaiting = true; await new Promise(resolve => { window.__releaseTransfer = resolve; }); return snapshot;");
    if (transferGate === 'import') source = source.replace("await taskStore.put({ ...snapshot, key: 'workspace', sharingMode: mode || null });", "await taskStore.put({ ...snapshot, key: 'workspace', sharingMode: mode || null }); window.__transferWaiting = true; await new Promise(resolve => { window.__releaseTransfer = resolve; });");
    return route.fulfill({contentType:'text/javascript',body:source});
  });
  await page.route('**/preview/js/ai-task-workspaces.js*', route => route.fulfill({contentType:'text/javascript',body:
    fs.readFileSync(path.join(root,'preview/js/ai-task-workspaces.js'),'utf8').replace('pendingSelections.delete(key);','pendingSelections.delete(key); window.__transferSettled = true;')}));
  await page.goto(`http://127.0.0.1:${server.address().port}/preview/`, { waitUntil: 'networkidle' });
  const welcome = page.locator('.tut-welcome-overlay .tut-banner-no');
  if (await welcome.isVisible()) await welcome.click();
  await page.locator('#ai-image-install-open').click();
  if (!initialGeneration) await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-ai-candidate-option][aria-selected="true"]'));
  await page.waitForFunction(() => [...document.querySelectorAll('#ai-image-panel .ai-image-card img')].some(image => image.naturalWidth === 512));
  assert.deepEqual(errors, [], 'real app boot must have no runtime errors');
  return { page, errors };
}


const active = '#ai-image-panel';
async function advanced(page) { const details = page.locator(`${active} .ai-advanced-settings`); if (!await details.evaluate(node => node.open)) await details.locator('summary').click(); }
async function task(page, index) { await page.locator(`${active} [data-tab-id="task-${index}"] .ai-task-tab-select`).click(); await page.waitForFunction(index => document.querySelector('#ai-image-panel [data-tab-id="task-'+index+'"] .ai-task-tab-select')?.getAttribute('aria-pressed') === 'true', index); }
async function chooseRevision(page, id) { await page.click(`${active} [data-ai-version-button]`); await page.click(`${active} [data-ai-candidate-option="${id}"]`); }
async function openPanel(page) { await page.click('#ai-image-install-open'); await page.locator(active).waitFor({state:'visible'}); }
async function objects(page) { return page.evaluate(() => structuredClone(window.__integrationState.get().objects)); }
async function removeTask(page, id) {
  await page.click(`${active} [data-tab-id="${id}"] .ai-task-delete`);
  await page.getByRole('dialog', {name:'작업 삭제',exact:true}).waitFor();
  await page.click(`${active} .ai-confirm-accept`);
  await page.locator('.ai-confirm-dialog').waitFor({state:'detached'});
}
async function record(page, evidence, name) {
  const state = await page.evaluate(async () => ({
    cards: [...document.querySelectorAll('#ai-image-panel [data-ai-workspace-link]')].map(node=>node.dataset.tabId),
    selection: JSON.parse(localStorage.getItem('5e.aiActiveTask.v1')),
    snapshot: await window.__task2Manager.sharingSnapshot(),
    transfers: JSON.parse(localStorage.getItem('5e.aiTaskTransfers.v1') || '[]'),
    sends: window.__task2.sends.length,
  }));
  fs.writeFileSync(path.join(evidence,`${name}.json`),JSON.stringify(state,null,2));
  await page.screenshot({path:path.join(evidence,`${name}.png`)});
  const images = await page.evaluate(() => ({ original: window.__task2.original, modified: window.__task2.modified }));
  for (const tab of state.snapshot.workspaces.flatMap(workspace => workspace.tabs)) {
    const index = tab.id.slice('task-'.length);
    assert.equal(tab.input, '선택 영역 안에 작은 사각형 추가');
    assert.deepEqual(tab.attachments.map(item => [item.id, item.data]), [[`source-${index}`, images.original]]);
    assert.deepEqual(tab.generated.map(item => [item.id, item.data]), [[`candidate-${index}`, images.original], [`latest-${index}`, images.modified]]);
    assert.equal(tab.selectedCandidateId, `latest-${index}`);
  }
  return state;
}
for (const count of [1,3]) {
  test(`real task panel deletes ${count === 1 ? 'last task' : 'active and non-active tasks'} without ghost cards`, {timeout:60000},async context=>{
    const evidence=path.join(evidenceRoot,`tasks-${count}`);fs.mkdirSync(evidence,{recursive:true});
    const {page,errors}=await requestBrowserFixture(context,count,evidence);
    const alerts=[]; page.on('dialog',async dialog=>{alerts.push(dialog.message());await dialog.dismiss();});
    if(count===3){
      await page.click(`${active} [data-tab-id="task-1"] .ai-task-tab-select`,{modifiers:['ControlOrMeta']});
      await removeTask(page,'task-1');
      const nonactive=await record(page,evidence,'nonactive-deleted');
      assert.deepEqual(nonactive.cards,['task-0','task-2']);
      assert.equal(await page.locator(`${active} [data-ai-selection-count]`).textContent(),'1개 선택');
    }
    await removeTask(page,'task-0');
    const result=await record(page,evidence,'active-deleted');
    assert.deepEqual(result.cards,count===1?[]:['task-2'],'deleted task card must be removed immediately');
    assert.notEqual(result.selection?.taskId,'task-0');
    if(count===3){await task(page,2);await record(page,evidence,'remaining-open');}
    await page.evaluate(()=>window.__task2Manager.checkpointForClose());
    await page.reload({waitUntil:'networkidle'});await openPanel(page);
    const reloaded=await record(page,evidence,'reloaded');
    assert.deepEqual(reloaded.cards,count===1?[]:['task-2']);
    assert.equal(reloaded.sends,0);
    assert.deepEqual(errors,[]);assert.deepEqual(alerts,[]);
  });
}
for (const transferGate of ['snapshot','import']) {
  test(`deleted task cannot return from pending ${transferGate} callback`, {timeout:60000},async context=>{
    const evidence=path.join(evidenceRoot,`pending-${transferGate}`);fs.mkdirSync(evidence,{recursive:true});
    const {page,errors}=await requestBrowserFixture(context,2,evidence,{transferGate});
    const alerts=[];page.on('dialog',async dialog=>{alerts.push(dialog.message());await dialog.dismiss();});
    await page.click(`${active} [data-tab-id="task-1"] .ai-task-tab-select`);
    await page.waitForFunction(()=>window.__transferWaiting===true);
    await removeTask(page,'task-1');
    await page.evaluate(()=>window.__releaseTransfer());
    await page.waitForFunction(()=>window.__transferSettled===true);
    await page.evaluate(()=>window.__task2Manager.checkpointForClose());
    const result=await record(page,evidence,'callback-settled');
    assert.deepEqual(result.cards,['task-0'],'late callback must not resurrect a deleted task');
    assert.equal(result.selection.taskId,'task-0');assert.deepEqual(result.transfers,[]);
    await page.reload({waitUntil:'networkidle'});await openPanel(page);
    const reloaded=await record(page,evidence,'reloaded');assert.deepEqual(reloaded.cards,['task-0']);
    await task(page,0);assert.deepEqual(errors,[]);assert.deepEqual(alerts,[]);
  });
}
test('deleting a transferred workspace persists its empty state before disposal', {timeout:60000},async context=>{
  const evidence=path.join(evidenceRoot,'transferred');fs.mkdirSync(evidence,{recursive:true});
  const {page,errors}=await requestBrowserFixture(context,2,evidence);
  await task(page,1);await removeTask(page,'task-1');
  const result=await record(page,evidence,'workspace-deleted');assert.deepEqual(result.cards,['task-0']);
  await task(page,0);await removeTask(page,'task-0');
  await page.evaluate(()=>window.__task2Manager.checkpointForClose());
  await page.reload({waitUntil:'networkidle'});await openPanel(page);
  const reloaded=await record(page,evidence,'all-deleted-reloaded');assert.deepEqual(reloaded.cards,[]);assert.deepEqual(errors,[]);
});
test('deleting the primary workspace preserves remaining task after reload', {timeout:60000},async context=>{
  const evidence=path.join(evidenceRoot,'primary');fs.mkdirSync(evidence,{recursive:true});
  const {page,errors}=await requestBrowserFixture(context,2,evidence);
  await task(page,1);await removeTask(page,'task-0');
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-tab-id="task-1"] .ai-task-tab-select')?.getAttribute('aria-pressed')==='true');
  const result=await record(page,evidence,'primary-deleted');assert.deepEqual(result.cards,['task-1']);
  assert.equal(result.selection.taskId,'task-1');
  await page.reload({waitUntil:'networkidle'});await openPanel(page);
  const reloaded=await record(page,evidence,'reloaded');assert.deepEqual(reloaded.cards,['task-1']);
  await task(page,1);assert.equal(await page.locator(`${active} [data-ai-input]`).inputValue(),'선택 영역 안에 작은 사각형 추가');
  assert.deepEqual(errors,[]);
});

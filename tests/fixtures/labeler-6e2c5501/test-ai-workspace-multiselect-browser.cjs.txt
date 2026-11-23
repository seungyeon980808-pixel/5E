const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const evidenceRoot = process.env.TASK8_EVIDENCE || path.join(root, '.omo/evidence/ai-workbench-polish-0928/task8-ui/browser');
function seedRequestWorkspaces(count, initialGeneration = false, missingCapabilities = false, mode = 'pro', scoped = false, badTask = false) {
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
  if (scoped) for(let i=0;i<(scoped==='mixed'?1:2);i++){tabs[i].selectedCandidateId=`candidate-${i}`;tabs[i].generated[0].comments=[{id:`area-${i}`,imageId:`candidate-${i}`,type:'area',number:1,x:25,y:25,w:25,h:25,text:'사각형 추가'}];}
  if (scoped === 'malformed') tabs[0].generated[0].data = 'data:image/png;base64,iVBORw0KGgo=';
  if (badTask) tabs[1].effort='unsupported';
  if (initialGeneration) { tabs[0].generated = []; tabs[0].selectedCandidateId = null; }
  let statusGate = null, interruptGate = null;
  window.__task2 = {
    original, modified, sends, longTasks: [],
    delayInterrupt(){interruptGate={};interruptGate.promise=new Promise(resolve=>{interruptGate.resolve=resolve;});},
    releaseInterrupt(){interruptGate?.resolve({ok:true});interruptGate=null;},
    delayStatus() { statusGate = {}; statusGate.promise = new Promise(resolve => { statusGate.resolve = resolve; }); },
    releaseStatus() { statusGate?.resolve({ login: { loggedIn: true }, server: true }); statusGate = null; },
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

async function requestBrowserFixture(context, count, evidence, { initialGeneration = false, missingCapabilities = false, mode = 'pro', scoped = false, serviceCap = 10, badTask = false } = {}) {
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
  page.on('pageerror', error => { errors.push(error.message); console.error('TASK2 PAGE ERROR', error.message); });
  await page.addInitScript({ content: `(${seedRequestWorkspaces.toString()})(${count}, ${initialGeneration}, ${missingCapabilities}, ${JSON.stringify(mode)}, ${JSON.stringify(scoped)}, ${badTask})` });
  await page.route('**/preview/js/main.js*', route => route.fulfill({ contentType: 'text/javascript', body:
    'await window.__seedReady;\n' + fs.readFileSync(path.join(root, 'preview/js/main.js'), 'utf8').replace(
      'const aiPanel = initAiPanel(state, { freshStart: recoveryChoice === "fresh" });',
      `const aiPanel = initAiPanel(state, { freshStart: false, serviceCap: ${serviceCap} }); window.__task2Manager = aiPanel; window.__integrationState = state;`) }));
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

test('12 task selection uses existing primary action with immutable overflow snapshots', {timeout:120000}, async context => {
  const evidence=path.join(evidenceRoot,'overflow'); fs.mkdirSync(evidence,{recursive:true});
  const {page}=await requestBrowserFixture(context,12,evidence);
  await page.click('#ai-image-panel [data-tab-id="task-0"] .ai-task-tab-select');
  for(let i=1;i<12;i++) await page.click(`#ai-image-panel [data-tab-id="task-${i}"] .ai-task-tab-select`,{modifiers:[i%2?'Meta':'Control']});
  assert.equal(await page.locator('#ai-image-panel [data-ai-selection-count]').textContent(),'12개 선택');
  await page.click('#ai-image-panel [data-ai-comments-apply]');
  await page.waitForFunction(()=>window.__task2.sends.length===10);
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().filter(j=>j.state==='queued').length===2);
  assert.equal(await page.locator('#ai-image-panel [data-tab-id="task-0"] .ai-task-tab-select').getAttribute('aria-pressed'),'true');
  await page.screenshot({path:path.join(evidence,'selection-12.png')});
  await task(page,11); await advanced(page); await page.selectOption('#ai-image-panel [data-ai-effort]','ultra');
  await page.screenshot({path:path.join(evidence,'overflow.png')});
  await page.evaluate(()=>{for(let i=0;i<10;i++){window.__task2.emit(i,'image');window.__task2.emit(i,'done');}});
  await page.waitForFunction(()=>window.__task2.sends.length===12);
  assert.equal(await page.evaluate(()=>window.__task2.sends[11].payload.effort),'medium');
  await page.evaluate(()=>{for(let i=10;i<12;i++){window.__task2.emit(i,'image');window.__task2.emit(i,'done');}});
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().filter(j=>j.state==='completed').length===12);
  const results=await page.evaluate(()=>window.__task2Manager.workspaceBatchState().map(j=>({state:j.state,task:j.sourceSnapshot.owner.taskId,revision:j.result?.output?.revisionId})));
  assert.equal(new Set(results.map(r=>r.task)).size,12);assert.ok(results.every(r=>r.revision));
  assert.equal(await page.evaluate(()=>window.__task2.sends.length),12);
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({results,immutableEffort:true,sends:12},null,2));
});

for(const engine of ['chromium','webkit']) test(`scoped A/B approvals remain task owned with C active in ${engine}`,{timeout:120000},async context=>{
  process.env.TASK2_ENGINE=engine;
  const evidence=path.join(evidenceRoot,engine,'scoped');fs.mkdirSync(evidence,{recursive:true});
  const {page}=await requestBrowserFixture(context,3,evidence,{scoped:true});
  await task(page,2);
  for(const id of [2,0,1])await page.click(`#ai-image-panel [data-tab-id="task-${id}"] .ai-task-tab-select`,{modifiers:['Meta']});
  await page.click('#ai-image-panel [data-ai-comments-apply]');
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().length===2&&window.__task2Manager.workspaceBatchState().every(j=>j.progress?.phase==='confirmation-wait'));
  assert.equal(await page.locator('#ai-image-panel dialog[open]').count(),0);
  await task(page,0);
  await page.locator('#ai-image-panel dialog[open]').waitFor();
  await page.click('#ai-image-panel dialog[open] .ai-confirm-accept');
  await page.waitForFunction(()=>window.__task2.sends.length===1);
  await task(page,1);
  await page.locator('#ai-image-panel dialog[open]').waitFor();
  await page.click('#ai-image-panel dialog[open] .ai-confirm-accept');
  await page.waitForFunction(()=>window.__task2.sends.length===2);
  await task(page,2);
  await page.evaluate(()=>{for(let i=0;i<2;i++){window.__task2.emit(i,'image');window.__task2.emit(i,'done');}});
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().every(j=>j.progress?.phase==='confirmation-wait'));
  assert.equal(await page.locator('#ai-image-panel dialog[open]').count(),0);
  await page.screenshot({path:path.join(evidence,'C-active.png')});
  for(let i=0;i<2;i++) {await task(page,i);await page.locator('#ai-image-panel dialog[open]').waitFor();await page.click('#ai-image-panel dialog[open] .ai-confirm-accept');await page.waitForFunction(id=>window.__task2Manager.workspaceBatchState().find(j=>j.sourceSnapshot.owner.taskId===id)?.state==='completed',`task-${i}`);}
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
  await page.click('#ai-image-panel [data-ai-comments-apply]');
  await page.waitForFunction(() => window.__task2Manager.workspaceBatchState().length === 2 && window.__task2Manager.workspaceBatchState().every(job => job.progress?.phase === 'confirmation-wait'));
  assert.equal(await page.locator('#ai-image-panel dialog[open]').count(), 0);
  await task(page, 0);
  await page.locator('#ai-image-panel dialog[open]').waitFor();
  if (stage === 'review') {
    await page.click('#ai-image-panel dialog[open] .ai-confirm-accept');
    await page.waitForFunction(() => window.__task2.sends.length === 1);
    await page.evaluate(() => { window.__task2.emit(0, 'image'); window.__task2.emit(0, 'done'); });
    await page.locator('#ai-image-panel dialog[open][aria-label="선택 영역 수정 후보 · 아직 미적용"]').waitFor();
  }
  await page.screenshot({ path: path.join(evidence, 'before-cancel.png') });
  await page.locator('#ai-image-panel dialog[open]').getByRole('button', { name: '취소', exact: true }).click();
  await page.waitForFunction(() => ['failed', 'cancelled'].includes(window.__task2Manager.workspaceBatchState()[0]?.state));
  const first = await page.evaluate(() => ({ jobs: window.__task2Manager.workspaceBatchState(), busy: document.querySelector('#ai-image-panel').dataset.aiBusy, phase: document.querySelector('#ai-image-panel').dataset.aiRequestPhase, status: document.querySelector('#ai-image-panel [data-ai-status]').textContent, sends: window.__task2.sends.length }));
  fs.writeFileSync(path.join(evidence, 'first-cancel.json'), JSON.stringify(first, null, 2));
  assert.deepEqual(first.jobs.map(job => job.state), ['cancelled', 'running']);
  assert.equal(first.jobs[1].progress.phase, 'confirmation-wait');
  assert.equal(first.jobs[0].error, null); assert.equal(first.jobs[0].result, null);
  assert.equal(first.busy, 'false'); assert.equal(first.phase, 'cancelled');
  assert.match(first.status, /취소/); assert.doesNotMatch(first.status, /차단|PNG 치수/);
  assert.equal(first.sends, stage === 'bounds' ? 0 : 1);
  assert.equal(await page.locator('#ai-image-panel [data-ai-workspace-job-action="retry"]').count(), 0);
  if (stage === 'review') await page.evaluate(() => { window.__task2.emit(0, 'image'); window.__task2.emit(0, 'done'); window.__task2.emit(0, 'error'); });
  await task(page, 1); await page.locator('#ai-image-panel dialog[open]').waitFor();
  await page.locator('#ai-image-panel dialog[open]').getByRole('button', { name: '취소', exact: true }).click();
  await page.waitForFunction(() => window.__task2Manager.workspaceBatchState().every(job => ['failed', 'cancelled'].includes(job.state)));
  const jobs = await page.evaluate(() => window.__task2Manager.workspaceBatchState());
  assert.deepEqual(jobs.map(job => job.state), ['cancelled', 'cancelled']);
  assert.deepEqual(await cancellationHistory(page), before, 'all images, revisions, comments and source selection remain immutable');
  await task(page, 2); await page.screenshot({ path: path.join(evidence, 'cancelled.png') });
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ states: jobs.map(job => job.state), providerCalls: 0, fixtureSends: first.sends, peerPending: true, historyUnchanged: true, idle: true, lateEventsIgnored: stage === 'review' }, null, 2));
});

test('malformed scoped PNG remains failed with explicit retry and no provider sends', { timeout: 90000 }, async context => {
  process.env.TASK2_ENGINE = 'chromium';
  const evidence = path.join(evidenceRoot, 'malformed-scoped'); fs.mkdirSync(evidence, { recursive: true });
  const { page } = await requestBrowserFixture(context, 3, evidence, { scoped: 'malformed' });
  const before = await cancellationHistory(page);
  await selectTasks(page, 2); await page.click('#ai-image-panel [data-ai-comments-apply]');
  await page.waitForFunction(() => window.__task2Manager.workspaceBatchState()[0]?.state === 'failed');
  const first = await page.evaluate(() => window.__task2Manager.workspaceBatchState());
  assert.match(first[0].error, /PNG/); assert.equal(first[0].attempt, 1);
  assert.equal(first[1].state, 'running'); assert.equal(await page.evaluate(() => window.__task2.sends.length), 0);
  await jobAction(page, 'task-0', 'retry');
  await page.waitForFunction(() => { const job = window.__task2Manager.workspaceBatchState()[0]; return job?.state === 'failed' && job.attempt === 2; });
  assert.equal(await page.evaluate(() => window.__task2.sends.length), 0);
  assert.deepEqual(await cancellationHistory(page), before);
  await page.screenshot({ path: path.join(evidence, 'failed-retry.png') });
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ first, after: await page.evaluate(() => window.__task2Manager.workspaceBatchState()), sends: 0, historyUnchanged: true }, null, 2));
  await page.evaluate(() => window.__task2Manager.dispose());
});
for(const engine of ['chromium','webkit']) test(`lower cap cancellation acknowledgement, failure and explicit retry in ${engine}`,{timeout:120000},async context=>{
  process.env.TASK2_ENGINE=engine;const evidence=path.join(evidenceRoot,engine,'isolation');fs.mkdirSync(evidence,{recursive:true});
  const {page}=await requestBrowserFixture(context,4,evidence,{serviceCap:2});
  await selectTasks(page,4);await page.dblclick('#ai-image-panel [data-ai-comments-apply]',{delay:10});
  await page.waitForFunction(()=>window.__task2.sends.length===2);
  assert.equal(await page.locator('#ai-image-panel [data-ai-workspace-batch] [data-ai-workspace-job]').count(), 0);
  const runningCard = page.locator('#ai-image-panel [data-ai-generation-active="true"]').first();
  assert.equal(await runningCard.evaluate(node => getComputedStyle(node).animationName), 'ai-task-card-glow');
  await page.screenshot({path:path.join(evidence,'running-cards.png')});
  await page.evaluate(()=>window.__task2.emit(0,'error'));
  await page.waitForFunction(()=>window.__task2.sends.length===3);
  await page.evaluate(()=>window.__task2.delayInterrupt());
  await jobAction(page,'task-1','cancel');
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().find(j=>j.sourceSnapshot.owner.taskId==='task-1')?.state==='cancelled');
  assert.equal(await page.evaluate(()=>window.__task2.sends.length),3,'cancelled transport still reserves lower cap slot');
  await page.evaluate(()=>window.__task2.releaseInterrupt());
  await page.waitForFunction(()=>window.__task2.sends.length===4);
  await page.evaluate(()=>{for(let i=1;i<4;i++){window.__task2.emit(i,'image');window.__task2.emit(i,'done');}});
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().filter(j=>j.state==='completed').length===2);
  await jobAction(page,'task-0','retry');await page.waitForFunction(()=>window.__task2.sends.length===5);
  await page.evaluate(()=>{window.__task2.emit(0,'image');window.__task2.emit(0,'done');window.__task2.emit(4,'image');window.__task2.emit(4,'done');});
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().filter(j=>j.state==='completed').length===3);
  const jobs=await page.evaluate(()=>window.__task2Manager.workspaceBatchState());
  assert.equal(jobs.find(j=>j.sourceSnapshot.owner.taskId==='task-0').attempt,2);
  assert.equal(jobs.find(j=>j.sourceSnapshot.owner.taskId==='task-1').result,null);
  await page.screenshot({path:path.join(evidence,'statuses.png')});
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(jobs.map(j=>({task:j.sourceSnapshot.owner.taskId,state:j.state,attempt:j.attempt})),null,2));
});
test('persisted queued and running jobs recover failed without automatic sends', {timeout:120000},async context=>{
  process.env.TASK2_ENGINE='chromium';const evidence=path.join(evidenceRoot,'recovery');fs.mkdirSync(evidence,{recursive:true});
  const {page}=await requestBrowserFixture(context,3,evidence,{serviceCap:2});await selectTasks(page,3);await page.click('#ai-image-panel [data-ai-comments-apply]');
  await page.waitForFunction(()=>window.__task2.sends.length===2);await page.reload({waitUntil:'networkidle'});await page.click('#ai-image-install-open');
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().length===3);
  const recovered=await page.evaluate(()=>({sends:window.__task2.sends.length,states:window.__task2Manager.workspaceBatchState().map(j=>j.state)}));
  assert.deepEqual(recovered,{sends:0,states:['failed','failed','failed']});
  await jobAction(page,'task-0','retry');await page.waitForFunction(()=>window.__task2.sends.length===1);
  await page.evaluate(()=>{window.__task2.emit(0,'image');window.__task2.emit(0,'done');});
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().filter(j=>j.state==='completed').length===1);
  await page.screenshot({path:path.join(evidence,'recovered.png')});fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(recovered));
});

test('mixed eligibility blocks every send until user corrects selection', {timeout:60000},async context=>{
  process.env.TASK2_ENGINE='chromium';const evidence=path.join(evidenceRoot,'preflight');fs.mkdirSync(evidence,{recursive:true});
  const {page}=await requestBrowserFixture(context,3,evidence,{badTask:true});await selectTasks(page,3);await page.click('#ai-image-panel [data-ai-comments-apply]');
  await page.locator('#ai-image-panel [data-ai-workspace-batch] [role="alert"]').waitFor();
  assert.equal(await page.evaluate(()=>window.__task2.sends.length),0);
  const message=await page.locator('#ai-image-panel [data-ai-workspace-batch] [role="alert"]').textContent();assert.match(message,/unsupported/);
  await page.screenshot({path:path.join(evidence,'invalid.png')});
  await page.click('#ai-image-panel [data-tab-id="task-1"] .ai-task-tab-select',{modifiers:['Meta']});
  await page.click('#ai-image-panel [data-ai-comments-apply]');await page.waitForFunction(()=>window.__task2.sends.length===2);
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({message,beforeSends:0,afterExplicitSelectionSends:2}));
});
test('task checkpoint failure cannot claim success and explicit retry remains isolated',{timeout:120000},async context=>{
  process.env.TASK2_ENGINE='chromium';const evidence=path.join(evidenceRoot,'commit-failure');fs.mkdirSync(evidence,{recursive:true});
  const {page}=await requestBrowserFixture(context,2,evidence);await selectTasks(page,2);await page.click('#ai-image-panel [data-ai-comments-apply]');await page.waitForFunction(()=>window.__task2.sends.length===2);
  await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;window.__restorePut=()=>{IDBObjectStore.prototype.put=put;};IDBObjectStore.prototype.put=function(value,...args){if(this.name==='tasks'&&value.tabs?.some(tab=>tab.id==='task-0'&&tab.generated?.some(item=>item.workspaceBatch)))throw new DOMException('synthetic task checkpoint failure','QuotaExceededError');return put.call(this,value,...args);};window.__task2.emit(0,'image');window.__task2.emit(0,'done');});
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().some(j=>j.state==='failed'));
  const failed=await page.evaluate(()=>window.__task2Manager.workspaceBatchState().find(j=>j.state==='failed'));assert.match(failed.error,/checkpoint failure/);
  assert.equal(await page.locator('#ai-image-panel [data-ai-candidate-option]').count(),2);
  await page.evaluate(()=>{window.__restorePut();window.__task2.emit(1,'image');window.__task2.emit(1,'done');});
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().some(j=>j.state==='completed'));
  await jobAction(page,'task-0','retry');await page.waitForFunction(()=>window.__task2.sends.length===3);await page.evaluate(()=>{window.__task2.emit(2,'image');window.__task2.emit(2,'done');});
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().every(j=>j.state==='completed'));
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({failedError:failed.error,retried:true,sends:3}));
});

test('malformed persisted retry remains failed and sends nothing',{timeout:90000},async context=>{
  process.env.TASK2_ENGINE='chromium';const evidence=path.join(evidenceRoot,'malformed');fs.mkdirSync(evidence,{recursive:true});
  const {page}=await requestBrowserFixture(context,2,evidence,{serviceCap:1});await selectTasks(page,2);await page.click('#ai-image-panel [data-ai-comments-apply]');await page.waitForFunction(()=>window.__task2.sends.length===1);
  await page.evaluate(async()=>{const {idbGet,idbSet}=await import('/preview/js/idb-store.js');const key='ai-workspace-batch:'+JSON.stringify(['5e','workspace-selection:main']);const records=await idbGet(key);const job=records.find(j=>j.sourceSnapshot.owner.taskId==='task-1');job.sourceSnapshot.snapshot.model='';await idbSet(key,records);});
  await page.reload({waitUntil:'networkidle'});await page.click('#ai-image-install-open');await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().length===2);
  const before=await page.evaluate(()=>window.__task2Manager.workspaceBatchState().find(j=>j.sourceSnapshot.owner.taskId==='task-1').attempt);
  await jobAction(page,'task-1','retry');await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().some(j=>j.error?.includes('Retry blocked')));
  const result=await page.evaluate(()=>({sends:window.__task2.sends.length,job:window.__task2Manager.workspaceBatchState().find(j=>j.sourceSnapshot.owner.taskId==='task-1')}));
  assert.equal(result.sends,0);assert.equal(result.job.attempt,before);assert.equal(result.job.state,'failed');fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({sends:result.sends,attempt:before,error:result.job.error}));
});
test('repeated dispose waits for pending transport interruption and never starts queued peers',{timeout:90000},async context=>{
  process.env.TASK2_ENGINE='chromium';const evidence=path.join(evidenceRoot,'dispose');fs.mkdirSync(evidence,{recursive:true});
  const {page}=await requestBrowserFixture(context,4,evidence,{serviceCap:2});await selectTasks(page,4);await page.click('#ai-image-panel [data-ai-comments-apply]');await page.waitForFunction(()=>window.__task2.sends.length===2);
  const same=await page.evaluate(()=>{window.__task2.delayInterrupt();window.__disposed=false;const first=window.__task2Manager.dispose();const second=window.__task2Manager.dispose();first.then(()=>window.__disposed=true);return first===second;});assert.equal(same,true);
  assert.equal(await page.evaluate(()=>window.__disposed),false);assert.equal(await page.evaluate(()=>window.__task2.sends.length),2);
  await page.evaluate(()=>window.__task2.releaseInterrupt());await page.waitForFunction(()=>window.__disposed);
  await page.evaluate(()=>{window.__task2.emit(0,'image');window.__task2.emit(0,'done');});
  assert.equal(await page.evaluate(()=>window.__task2.sends.length),2);fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({samePromise:true,waitedForInterrupt:true,sends:2}));
});
test('mixed normal and area tasks retain their own operation from the existing action',{timeout:90000},async context=>{
  process.env.TASK2_ENGINE='chromium';const evidence=path.join(evidenceRoot,'mixed-operation');fs.mkdirSync(evidence,{recursive:true});
  const {page}=await requestBrowserFixture(context,3,evidence,{scoped:'mixed'});await selectTasks(page,2);await page.click('#ai-image-panel [data-ai-comments-apply]');await page.locator('#ai-image-panel dialog[open]').waitFor();
  await page.waitForFunction(()=>window.__task2.sends.length===1);await page.click('#ai-image-panel dialog[open] .ai-confirm-accept');await page.waitForFunction(()=>window.__task2.sends.length===2);
  await task(page,2);await page.evaluate(()=>{for(let i=0;i<2;i++){window.__task2.emit(i,'image');window.__task2.emit(i,'done');}});
  await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().some(j=>j.state==='completed'));
  await task(page,0);await page.locator('#ai-image-panel dialog[open]').waitFor();await page.click('#ai-image-panel dialog[open] .ai-confirm-accept');await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().every(j=>j.state==='completed'));
  const ops=await page.evaluate(()=>window.__task2Manager.workspaceBatchState().map(j=>({task:j.sourceSnapshot.owner.taskId,operation:j.result.generation.operation,approved:j.result.generation.approved})));
  assert.deepEqual(ops.map(o=>o.operation),['scoped-edit','generate']);assert.equal(ops[0].approved,true);fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify(ops));
});

test('durable candidate receipt prevents paid resend after queue journal completion failure',{timeout:120000},async context=>{
  process.env.TASK2_ENGINE='chromium';const evidence=path.join(evidenceRoot,'journal-failure');fs.mkdirSync(evidence,{recursive:true});
  const {page}=await requestBrowserFixture(context,2,evidence);await selectTasks(page,2);await page.click('#ai-image-panel [data-ai-comments-apply]');await page.waitForFunction(()=>window.__task2.sends.length===2);
  await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;window.__restorePut=()=>{IDBObjectStore.prototype.put=put;};IDBObjectStore.prototype.put=function(value,...args){if(this.name==='kv'&&Array.isArray(value)&&value.some(job=>job.state==='completed'&&job.sourceSnapshot?.owner?.taskId==='task-0'))throw new DOMException('synthetic queue journal failure','QuotaExceededError');return put.call(this,value,...args);};window.__task2.emit(0,'image');window.__task2.emit(0,'done');});
  await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-ai-workspace-batch] [role="alert"]')?.textContent.includes('queue journal failure'));
  await page.evaluate(()=>window.__restorePut());await page.reload({waitUntil:'networkidle'});await page.click('#ai-image-install-open');await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().length===2);
  assert.equal(await page.evaluate(()=>window.__task2.sends.length),0);
  await jobAction(page,'task-0','retry');await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().some(job=>job.sourceSnapshot.owner.taskId==='task-0'&&job.state==='completed'));
  assert.equal(await page.evaluate(()=>window.__task2.sends.length),0,'persisted commit receipt is reused rather than another provider request');
  assert.equal(await page.locator('#ai-image-panel [data-ai-candidate-option]').count(),3);
  assert.match(await page.locator('#ai-image-panel [data-ai-status]').textContent(),/변환 완료/);
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({durableCandidateCount:3,retrySends:0,completed:true}));
});

for(const engine of ['chromium','webkit'])test(`Lite existing primary submits two selected tasks in ${engine}`,{timeout:60000},async context=>{
  process.env.TASK2_ENGINE=engine;const evidence=path.join(evidenceRoot,engine,'lite');fs.mkdirSync(evidence,{recursive:true});
  const {page}=await requestBrowserFixture(context,2,evidence,{mode:'lite'});await selectTasks(page,2);
  assert.equal(await page.locator('#ai-image-panel [data-ai-selection-count]').textContent(),'2개 선택');
  await page.click('#ai-image-panel [data-ai-comments-apply]');await page.waitForFunction(()=>window.__task2.sends.length===2);
  await page.evaluate(()=>{for(let i=0;i<2;i++){window.__task2.emit(i,'image');window.__task2.emit(i,'done');}});await page.waitForFunction(()=>window.__task2Manager.workspaceBatchState().every(j=>j.state==='completed'));
  assert.match(await page.locator('#ai-image-panel [data-ai-status]').textContent(),/변환 완료/);
  assert.equal(await page.locator('#ai-image-panel [data-ai-review-summary]').getAttribute('data-state'),'first-generated');
  await page.screenshot({path:path.join(evidence,'completed.png')});fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({sends:2,completed:2,existingPrimary:true}));
});

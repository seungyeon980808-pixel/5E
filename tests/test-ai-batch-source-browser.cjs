const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const evidenceRoot = process.env.BATCH_EVIDENCE || path.join(root, '.omo/evidence/ai-followup-0928/batch/browser');
function seedRequestWorkspaces(count, initialGeneration = false, missingCapabilities = false, mode = 'pro', scoped = false, badTask = false) {
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
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('TASK2 PAGE ERROR', error.message); });
  await page.addInitScript({ content: `(${seedRequestWorkspaces.toString()})(${count}, ${initialGeneration}, ${missingCapabilities}, ${JSON.stringify(mode)}, ${JSON.stringify(scoped)}, ${badTask})` });
  await page.route('**/preview/js/main.js*', route => route.fulfill({ contentType: 'text/javascript', body:
    'await window.__seedReady;\n' + fs.readFileSync(path.join(root, 'preview/js/main.js'), 'utf8').replace(
      'const aiPanel = initAiPanel(state, { freshStart: recoveryChoice === "fresh" });',
      `const aiPanel = initAiPanel(state, { freshStart: false, serviceCap: ${serviceCap} }); window.__task2Manager = aiPanel; window.__integrationState = state;`) }));
  await page.goto(`http://127.0.0.1:${server.address().port}/preview/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const welcome = page.locator('.tut-welcome-overlay .tut-banner-no');
  if (await welcome.isVisible()) await welcome.click();
  await page.locator('#ai-image-install-open').click();
  if (!initialGeneration) await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-ai-candidate-option][aria-selected="true"]'));
  await page.waitForFunction(() => [...document.querySelectorAll('#ai-image-panel .ai-image-card img')].some(image => image.naturalWidth === 512));
  assert.deepEqual(errors, [], 'real app boot must have no runtime errors');
  return { page, errors };
}


test('selected workspaces queue both >1MiB PNGs with byte-identical persisted originals', {timeout:120000}, async context => {
  fs.mkdirSync(evidenceRoot, {recursive:true});
  const {page, errors} = await requestBrowserFixture(context, 2, evidenceRoot);
  const before = await page.evaluate(() => ({bytes: atob(window.__task2.modified.split(',')[1]).length}));
  assert.ok(before.bytes > 1_048_576, `fixture must reproduce old limit: ${before.bytes}`);
  fs.writeFileSync(path.join(evidenceRoot, 'before.txt'), await page.locator('#ai-image-panel').innerText());
  await page.click('#ai-image-panel [data-tab-id="task-0"] .ai-task-tab-select');
  await page.click('#ai-image-panel [data-tab-id="task-1"] .ai-task-tab-select', {modifiers:['Meta']});
  assert.equal(await page.locator('#ai-image-panel [data-ai-selection-count]').textContent(), '2개 선택');
  await page.click('#ai-image-panel [data-ai-comments-apply]');
  await page.waitForFunction(() => window.__task2.sends.length === 2);
  await page.waitForFunction(() => window.__task2Manager.workspaceBatchState().length === 2);
  const result = await page.evaluate(async () => {
    const jobs = window.__task2Manager.workspaceBatchState();
    const {idbGet} = await import('/preview/js/idb-store.js');
    const records = await idbGet(`ai-workspace-batch:${JSON.stringify(['5e','workspace-selection:main'])}`);
    return {
      sends: window.__task2.sends.length,
      queuedJobs: jobs.length,
      originalBytes: atob(window.__task2.modified.split(',')[1]).length,
      owners: jobs.map(job => job.sourceSnapshot.owner.taskId),
      states: jobs.map(job => job.state),
      snapshotsUnchanged: jobs.every(job => job.sourceSnapshot.dataUrl === window.__task2.modified),
      persistedCount: records?.length,
      persistedRecordBytes: records?.map(record => new TextEncoder().encode(JSON.stringify(record)).byteLength),
      persistedTotalBytes: records ? new TextEncoder().encode(JSON.stringify(records)).byteLength : null,
      persistedOriginalsUnchanged: records?.every(job => job.sourceSnapshot.dataUrl === window.__task2.modified),
      sizeError: document.body.textContent.includes('Batch source exceeds the size limit.'),
    };
  });
  await page.screenshot({path:path.join(evidenceRoot, 'both-queued.png')});
  fs.writeFileSync(path.join(evidenceRoot, 'result.json'), JSON.stringify(result,null,2));
  assert.equal(result.sends,2); assert.equal(result.queuedJobs,2);
  assert.deepEqual(new Set(result.owners),new Set(['task-0','task-1']));
  assert.deepEqual(result.states,['running','running']);
  assert.equal(result.snapshotsUnchanged,true); assert.equal(result.persistedCount,2);
  assert.equal(result.persistedOriginalsUnchanged,true); assert.equal(result.sizeError,false);
  assert.deepEqual(errors,[]);
});

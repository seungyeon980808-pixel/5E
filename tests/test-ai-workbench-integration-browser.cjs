const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const evidenceRoot = process.env.TASK7_EVIDENCE || path.join(root, '.omo/evidence/ai-workbench-polish-0928/task7/browser');
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

async function requestBrowserFixture(context, count, evidence, { initialGeneration = false, missingCapabilities = false, mode = 'pro' } = {}) {
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
  await page.addInitScript({ content: `(${seedRequestWorkspaces.toString()})(${count}, ${initialGeneration}, ${missingCapabilities}, ${JSON.stringify(mode)})` });
  await page.route('**/preview/js/main.js*', route => route.fulfill({ contentType: 'text/javascript', body:
    'await window.__seedReady;\n' + fs.readFileSync(path.join(root, 'preview/js/main.js'), 'utf8').replace(
      'const aiPanel = initAiPanel(state, { freshStart: recoveryChoice === "fresh" });',
      'const aiPanel = initAiPanel(state, { freshStart: false }); window.__task2Manager = aiPanel; window.__integrationState = state;') }));
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

for (const engine of ['chromium', 'webkit']) {
  test(`integrated selected revision, local separation, model settings, crop and canvas undo in ${engine}`, {timeout:120000}, async context => {
    process.env.TASK2_ENGINE = engine;
    const evidence = path.join(evidenceRoot, engine, 'happy'); fs.mkdirSync(evidence,{recursive:true});
    const {page,errors} = await requestBrowserFixture(context,2,evidence);
    await advanced(page);
    assert.equal(await page.locator(`${active} [data-ai-model]`).inputValue(),'catalog-luna');
    assert.deepEqual(await page.locator(`${active} [data-ai-effort] option`).evaluateAll(nodes=>nodes.map(node=>node.value)),['medium','high']);
    assert.equal(await page.locator(`${active} [data-ai-speed]`).inputValue(),'');
    await page.selectOption(`${active} [data-ai-effort]`,'high');
    await chooseRevision(page,'candidate-0');
    await page.click(`${active} [data-ai-compare]`);
    await page.locator('.ai-comparison').waitFor();
    assert.equal(await page.getByLabel('오른쪽 비교 버전',{exact:true}).inputValue(),'candidate-0');
    assert.equal(await page.getByLabel('왼쪽 비교 버전',{exact:true}).inputValue(),'source-0');
    await page.getByRole('button',{name:'나란히 비교',exact:true}).click();
    await page.getByLabel('왼쪽 비교 버전',{exact:true}).selectOption('latest-0');
    await page.getByRole('button',{name:'겹쳐 비교',exact:true}).click();
    await page.screenshot({path:path.join(evidence,'selected-comparison.png')});
    await page.getByRole('dialog',{name:'원본과 수정본 비교',exact:true}).getByRole('button',{name:'비교 닫기',exact:true}).click();
    await page.selectOption(`${active} [data-ai-background-policy]`,'preserve');
    await page.selectOption(`${active} select[data-ai-generation-mode]`,'separated');
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-ai-editable-groups]')?.dataset.aiSeparationState==='ready');
    assert.equal(await page.locator(`${active} [data-ai-background-policy]`).inputValue(),'connected');
    assert.equal(await page.locator(`${active} [data-ai-background-policy]`).isDisabled(),true);
    assert.match(await page.locator(`${active} [data-ai-background-policy]`).getAttribute('title'),/한 장으로 전환/);
    assert.equal(await page.evaluate(()=>window.__task2.sends.length),0);
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
    await task(page,1); await advanced(page);
    assert.equal(await page.locator(`${active} [data-ai-model]`).inputValue(),'catalog-sol');
    assert.equal(await page.locator(`${active} [data-ai-speed]`).inputValue(),'priority');
    await task(page,0); await advanced(page);
    assert.equal(await page.locator(`${active} [data-ai-effort]`).inputValue(),'high');
    assert.equal(await page.locator(`${active} [data-ai-speed]`).inputValue(),'');
    assert.equal(await page.locator(`${active} [data-ai-separation-mode]`).inputValue(),'auto');
    await page.selectOption(`${active} select[data-ai-generation-mode]`,'single');
    assert.equal(await page.locator(`${active} [data-ai-background-policy]`).inputValue(),'preserve');
    assert.equal(await page.locator(`${active} [data-ai-background-policy]`).isEnabled(),true);
    assert.equal(await page.locator(`${active} [data-ai-insert-selected]`).textContent(),'캔버스에 삽입');
    await page.click(`${active} [data-ai-insert-selected]`);
    await page.locator(active).waitFor({state:'hidden'});
    const single=await objects(page); assert.equal(single.length,1); assert.equal(single[0].aiCandidateId,'candidate-0');
    await page.click('#undo-btn'); assert.equal((await objects(page)).length,0);
    await openPanel(page);
    await page.click(`${active} [data-ai-capture]`);
    await page.click('.ai-capture-source');
    await page.locator('.ai-crop-inspector [data-crop-magnifier-toggle]').waitFor();
    const image = page.locator('.ai-crop-image-wrap > img'); await image.waitFor();
    const box=await image.boundingBox(); await page.mouse.move(box.x+45,box.y+100);
    await page.locator('#ai-capture-magnifier').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>Number(getComputedStyle(document.querySelector('#ai-capture-magnifier')).zIndex)>Number(getComputedStyle(document.querySelector('.ai-crop-dialog').parentElement).zIndex)),true,'lens must paint above capture overlay');
    assert.equal(await page.locator('#ai-capture-magnifier image').first().getAttribute('href'),await page.evaluate(()=>window.__task2.original));
    await page.screenshot({path:path.join(evidence,'capture-magnifier.png')});
    await page.locator('.ai-crop-inspector [data-crop-magnifier-toggle]').uncheck();
    await page.locator('#ai-capture-magnifier').waitFor({state:'hidden'});
    await page.locator('.ai-crop-inspector [data-crop-magnifier-toggle]').check();
    await page.mouse.move(box.x+30,box.y+30); await page.mouse.down(); await page.mouse.move(box.x+180,box.y+160); await page.mouse.up();
    await page.click('[data-ai-crop-apply]');
    assert.equal(await page.locator('#ai-capture-magnifier').count(),0);
    assert.equal(await page.locator('.ai-crop-dialog').count(),0);
    const snapshots=await page.evaluate(async()=> (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(item=>item.tabs));
    assert.ok(snapshots.some(tab=>tab.attachments.some(item=>item.name.includes('캡처'))));
    assert.equal(snapshots.find(tab=>tab.id==='task-0').generated[0].data,await page.evaluate(()=>window.__task2.original));
    assert.equal(await page.evaluate(()=>window.__task2.sends.length),0);
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({selectedRevision:'candidate-0',separatedObjects:separated.length,singleObjects:single.length,undoObjects:0,localSeparationSends:0,cropAdded:true,modelRestored:true,backgroundRestored:true,originalPreserved:snapshots.find(tab=>tab.id==='task-0').generated[0].data===await page.evaluate(()=>window.__task2.original)},null,2));
  });
}

for (const engine of ['chromium','webkit']) {
  test(`captured model payload and invalid effort refusal in ${engine}`,{timeout:60000},async context=>{
    process.env.TASK2_ENGINE=engine;
    const evidence=path.join(evidenceRoot,engine,'models');fs.mkdirSync(evidence,{recursive:true});
    const {page,errors}=await requestBrowserFixture(context,3,evidence,{initialGeneration:true});
    await advanced(page); await page.selectOption(`${active} [data-ai-effort]`,'high');
    await page.evaluate(()=>window.__task2.delayStatus());
    await page.click(`${active} [data-ai-send]`);
    await task(page,1);
    await page.evaluate(()=>window.__task2.releaseStatus());
    await page.waitForFunction(()=>window.__task2.sends.length===1);
    const payload=await page.evaluate(()=>{const {model,effort,serviceTier}=window.__task2.sends[0].payload;return {model,effort,serviceTier};});
    assert.deepEqual(payload,{model:'catalog-luna',effort:'high',serviceTier:null});
    await page.evaluate(()=>{window.__task2.emit(0,'image');window.__task2.emit(0,'done');});
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-ai-request-phase]')].some(panel=>panel.dataset.aiRequestPhase==='completed'));
    await task(page,0); await advanced(page);
    await page.selectOption(`${active} [data-ai-model]`,'catalog-sol');
    await page.selectOption(`${active} [data-ai-effort]`,'ultra');
    await page.selectOption(`${active} [data-ai-model]`,'catalog-luna');
    assert.equal(await page.locator(`${active} [data-ai-effort]`).inputValue(),'ultra','unsupported saved effort stays visible');
    assert.match(await page.locator(`${active} [data-ai-model-warning]`).textContent(),/ultra/);
    await page.click(`${active} [data-ai-comments-apply]`);
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false');
    assert.equal(await page.evaluate(()=>window.__task2.sends.length),1,'invalid capabilities must not send or silently substitute');
    assert.equal(await page.locator(`${active} [data-ai-retry-interrupted]`).isDisabled(),true,'invalid preflight must not expose the prior successful request as retry');
    await page.screenshot({path:path.join(evidence,'invalid-effort.png')});
    await page.selectOption(`${active} [data-ai-effort]`,'high');
    await page.click(`${active} [data-ai-comments-apply]`);
    await page.waitForFunction(()=>window.__task2.sends.length===2);
    const revision=await page.evaluate(()=>{const {model,effort,serviceTier}=window.__task2.sends[1].payload;return {model,effort,serviceTier};});
    assert.deepEqual(revision,payload);
    await page.click(`${active} [data-ai-interrupt]`);
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false');
    await page.evaluate(()=>localStorage.setItem('task7-drop-luna','true'));
    await page.click(`${active} [data-ai-model-refresh]`);
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel [data-ai-model-warning]').textContent.includes('catalog-luna을 사용할 수 없습니다'));
    assert.equal(await page.locator(`${active} [data-ai-model]`).inputValue(),'catalog-luna');
    await page.click(`${active} [data-ai-comments-apply]`);
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false');
    assert.equal(await page.evaluate(()=>window.__task2.sends.length),2);
    await page.screenshot({path:path.join(evidence,'stale-model.png')});
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({payload,revision,invalidChoicePreserved:true,staleModelPreserved:true,invalidSendCount:0},null,2));
  });
  test(`missing capabilities and stale task insertion in ${engine}`,{timeout:60000},async context=>{
    process.env.TASK2_ENGINE=engine;
    const evidence=path.join(evidenceRoot,engine,'adverse');fs.mkdirSync(evidence,{recursive:true});
    const {page,errors}=await requestBrowserFixture(context,2,evidence,{missingCapabilities:true});
    await advanced(page);
    assert.match(await page.locator(`${active} [data-ai-model-warning]`).textContent(),/기능 정보/);
    await page.click(`${active} [data-ai-comments-apply]`);
    await page.waitForFunction(()=>document.querySelector('#ai-image-panel').dataset.aiBusy==='false');
    assert.equal(await page.evaluate(()=>window.__task2.sends.length),0);
    await page.screenshot({path:path.join(evidence,'missing-capabilities.png')});
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
  const {page,errors}=await requestBrowserFixture(context,2,evidence,{mode:'lite'});
  const group=selector=>page.locator(`${active} ${selector} + .lite-ai-segment-group`);
  const background=()=>group('[data-ai-background-policy]');
  const separation=()=>group('[data-ai-separation-mode]');
  await separation().getByRole('button',{name:'안 함',exact:true}).click();
  await background().getByRole('button',{name:'유지',exact:true}).click();
  await separation().getByRole('button',{name:'자동',exact:true}).click();
  assert.equal(await page.locator(`${active} [data-ai-background-policy]`).inputValue(),'connected');
  assert.equal(await background().getByRole('button',{name:'유지',exact:true}).isDisabled(),true);
  assert.equal(await page.locator(`${active} [data-ai-background-lock-hint]`).isVisible(),true);
  const disabled=await background().getByRole('button',{name:'유지',exact:true}).boundingBox();
  await page.mouse.click(disabled.x+disabled.width/2,disabled.y+disabled.height/2);
  assert.equal(await page.locator(`${active} [data-ai-background-policy]`).inputValue(),'connected');
  await page.screenshot({path:path.join(evidence,'forced-background.png')});
  await task(page,1);
  await separation().getByRole('button',{name:'안 함',exact:true}).click();
  await background().getByRole('button',{name:'제거',exact:true}).click();
  await task(page,0);
  assert.equal(await page.locator(`${active} [data-ai-separation-mode]`).inputValue(),'auto');
  await separation().getByRole('button',{name:'안 함',exact:true}).click();
  assert.equal(await page.locator(`${active} [data-ai-background-policy]`).inputValue(),'preserve');
  await separation().getByRole('button',{name:'자동',exact:true}).click();
  await page.click(`${active} [data-ai-close]`);
  await page.evaluate(()=>window.__task2Manager.checkpointForClose());
  await page.reload({waitUntil:'networkidle'});await openPanel(page);
  await task(page,0);
  assert.equal(await page.locator(`${active} [data-ai-separation-mode]`).inputValue(),'auto');
  await separation().getByRole('button',{name:'안 함',exact:true}).click();
  assert.equal(await page.locator(`${active} [data-ai-background-policy]`).inputValue(),'preserve');
  await task(page,1);
  assert.equal(await page.locator(`${active} [data-ai-background-policy]`).inputValue(),'connected');
  assert.equal(await page.evaluate(()=>window.__task2.sends.length),0);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({disabledPointerClickIgnored:true,restoredA:'preserve',restoredB:'connected',survivedReload:true,sends:0},null,2));
});

for (const engine of ['chromium', 'webkit']) {
  for (const model of ['catalog-sol', 'catalog-luna']) {
    test(`white revision auto-finalized completion unlocks area controls in ${engine} ${model}`, { timeout: 60000 }, async context => {
      process.env.TASK2_ENGINE = engine;
      const evidence = path.join(evidenceRoot, engine, `completion-${model}`);
      fs.mkdirSync(evidence, { recursive: true });
      const { page, errors } = await requestBrowserFixture(context, 2, evidence);
      await advanced(page);
      await page.selectOption(`${active} [data-ai-model]`, model);
      await page.selectOption(`${active} [data-ai-effort]`, 'medium');
      await page.selectOption(`${active} [data-ai-speed]`, '');
      await page.click(`${active} [data-ai-comments-apply]`);
      await page.waitForFunction(() => window.__task2.sends.length === 1);
      await page.evaluate(() => { window.__task2.emit(0, 'image'); window.__task2.autoFinalize(0); });
      try {
        await page.waitForFunction(() => document.querySelector('#ai-image-panel').dataset.aiBusy === 'false', null, { timeout: 5000 });
        assert.deepEqual(errors, [], 'terminal callback must not throw after registering the generated revision');
        assert.equal(await page.locator(`${active} [data-ai-comment-tool="area"]`).isEnabled(), true);
        const observed = await page.evaluate(async () => ({
          sends: window.__task2.sends.map(({ payload }) => ({ model: payload.model, effort: payload.effort, serviceTier: payload.serviceTier })),
          tabs: (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs),
          phase: document.querySelector('#ai-image-panel').dataset.aiRequestPhase,
        }));
        assert.deepEqual(observed.sends, [{ model, effort: 'medium', serviceTier: null }], 'disabled review must not send another generation or substitute configuration');
        assert.equal(observed.tabs.find(tab => tab.id === 'task-0').generated.length, 3);
        assert.equal(observed.tabs.find(tab => tab.id === 'task-1').generated.length, 2);
        await page.click(`${active} [data-ai-comment-tool="area"]`);
        fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ model, errors, phase: observed.phase, originalTaskRevisions: 3, otherTaskRevisions: 2, areaEnabled: true, sends: observed.sends, terminalStatus: 'interrupted', finalizationStates: ['interrupting', 'interruptAccepted'] }, null, 2));
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
    const { page, errors } = await requestBrowserFixture(context, 3, evidence);
    await page.clock.install();
    await page.click(`${active} [data-ai-comments-apply]`);
    await page.waitForFunction(() => window.__task2.sends.length === 1);
    await page.evaluate(() => window.__task2.autoFinalize(0));
    await page.waitForFunction(() => document.querySelector('#ai-image-panel').dataset.aiBusy === 'false');
    const read = () => page.evaluate(() => ({
      busy: document.querySelector('#ai-image-panel').dataset.aiBusy,
      phase: document.querySelector('#ai-image-panel').dataset.aiRequestPhase,
      status: document.querySelector('#ai-image-panel [data-ai-status]').textContent,
      sends: window.__task2.sends.length,
    }));
    const before = await read();
    assert.equal(before.phase, 'cancelled');
    await page.screenshot({ path: path.join(evidence, 'after-terminal.png') });
    await task(page, 2);
    const other = await read();
    await page.evaluate(() => { window.__task2.emit(0, 'image'); window.__task2.emit(0, 'error'); window.__task2.autoFinalize(0); });
    await page.clock.fastForward(180001);
    assert.deepEqual(await read(), other, 'late events and retired deadline must not mutate the active nonowner');
    await task(page, 0);
    const after = await read();
    assert.deepEqual(after, before, 'cancelled request must remain settled beyond its former deadline');
    const tabs = await page.evaluate(async () => (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs));
    assert.deepEqual(tabs.map(tab => tab.generated.length), [2, 2, 2], 'late images must not register any revision');
    assert.deepEqual(errors, []);
    assert.equal(await page.locator(`${active} [data-ai-comment-tool="area"]`).isEnabled(), true);
    await page.screenshot({ path: path.join(evidence, 'after-deadline.png') });
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ before, after, errors, lateImageRegistered: false, nonownerUnchanged: true }, null, 2));
  });
}

for (const engine of ['chromium', 'webkit']) {
  for (const operation of ['insert-undo', 'decode-error', 'switch-pending', 'close-pending']) {
    test(`completed generation survives local ${operation} in ${engine}`, { timeout: 60000 }, async context => {
      process.env.TASK2_ENGINE = engine;
      const evidence = path.join(evidenceRoot, engine, `local-status-${operation}`);
      fs.mkdirSync(evidence, { recursive: true });
      // Given a genuinely completed fixture request with retained original/history.
      const { page, errors } = await requestBrowserFixture(context, 2, evidence, { initialGeneration: true });
      await page.click(`${active} [data-ai-send]`);
      await page.waitForFunction(() => window.__task2.sends.length === 1);
      await page.evaluate(() => { window.__task2.emit(0, 'image'); window.__task2.autoFinalize(0); });
      await page.waitForFunction(() => document.querySelector('#ai-image-panel').dataset.aiBusy === 'false');
      await task(page, 1); await task(page, 0);
      const read = () => page.evaluate(async () => ({
        tabs: (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs),
        objects: window.__integrationState.get().objects, sends: window.__task2.sends.length,
        row: document.querySelector('[data-tab-id="task-0"]')?.textContent,
      }));
      const before = await read();
      assert.equal(before.tabs.find(tab => tab.id === 'task-0').workState, 'completed');
      await page.selectOption(`${active} select[data-ai-generation-mode]`, 'single');
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
      if (operation === 'close-pending') await page.click(`${active} [data-ai-close]`);
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

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const playwrightPath = process.env.PLAYWRIGHT_MODULE
  || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium, webkit } = require(playwrightPath);
const root = path.resolve(__dirname, '..');

test('ARCH-160-01: 100 empty workspace removals dispose DOM, controller, and registry state', async (context) => {
  const browser = await chromium.launch({ headless: true });
  context.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://workspace-lifecycle.invalid/', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><body></body>',
  }));
  await page.route('**/preview/js/**', route => { const file=path.join(root,new URL(route.request().url()).pathname);return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(file,'utf8')}); });
  await page.goto('https://workspace-lifecycle.invalid/');

  const managerSource = fs.readFileSync(path.join(root, 'preview/js/ai-task-workspaces.js'), 'utf8');
  const createTaskWorkspaces = managerSource
    .slice(managerSource.indexOf('export function createTaskWorkspaces('))
    .replace(/^export /, '');
  const indexSource = fs.readFileSync(path.join(root, 'preview/index.html'), 'utf8');
  const result = await page.evaluate(async ({ createTaskWorkspaces, indexSource }) => {
    const parsed = new DOMParser().parseFromString(indexSource, 'text/html');
    const template = parsed.getElementById('ai-image-panel');
    template.dataset.lifecyclePanel = 'true';
    document.body.innerHTML = template.outerHTML;

    const factory = (await import('/preview/js/ai-task-workspaces.js')).createTaskWorkspaces;
    let created = 0;
    let disposed = 0;
    const controllers = [];
    const initialize = (_state, options) => {
      created += 1;
      let tabs = [];
      if (created === 1) {
        const row = document.createElement('div');
        row.className = 'ai-task-tab';
        row.dataset.tabId = 'primary-task';
        row.innerHTML = '<button class="ai-task-tab-select" aria-pressed="true">Primary</button><button class="ai-task-delete">Delete</button>';
        tabs = [row];
      }
      options.navigationChanged(tabs);
      const controller = {
        options,
        ready: Promise.resolve(),
        activeTask: () => tabs[0]?.dataset.tabId || null,
        ownsTask: (id) => tabs.some((tab) => tab.dataset.tabId === id),
        batchOwner: id => ({scope:{sessionId:'5e',workspaceId:options.clientScope||'main'},taskId:id}),
        ownsBatchOwner: owner => tabs.some(tab=>tab.dataset.tabId===owner.taskId)&&owner.scope.workspaceId===(options.clientScope||'main'),
        selectTask() {},
        checkpointForClose: async () => ({ recovered: true, hasWork: tabs.length > 0 }),
        sharingSnapshot: async () => ({ tabs: tabs.map((tab) => ({ id: tab.dataset.tabId })) }),
        open: async () => {},
        close() {},
        dispose() { disposed += 1; },
        deleteAll() {
          tabs = [];
          options.navigationChanged(tabs);
          options.workspaceEmpty();
        },
      };
      controllers.push(controller);
      return controller;
    };
    const manager = factory(
      { get: () => ({ objects: [], selectedIds: [] }) },
      initialize,
      () => {},
    );
    await manager.open();
    for (let cycle = 0; cycle < 100; cycle += 1) {
      controllers.at(-1).options.newWorkspace();
      await Promise.resolve();
      controllers.at(-1).deleteAll();
      await Promise.resolve();
    }
    const registry = JSON.parse(localStorage.getItem('5e.aiParallelWorkspaces.v1') || '[]');
    return {
      panels: document.querySelectorAll('[data-lifecycle-panel]').length,
      created,
      disposed,
      liveControllers: created - disposed,
      registryEntries: registry.length,
      snapshotWorkspaces: (await manager.sharingSnapshot()).workspaces.length,
    };
  }, { createTaskWorkspaces, indexSource });

  assert.equal(result.panels, 1);
  assert.equal(result.liveControllers, 1);
  assert.equal(result.disposed, 100);
  assert.equal(result.registryEntries, 0);
  assert.equal(result.snapshotWorkspaces, 1);
});

test('ARCH-160-01: disposed workspaces cannot reactivate when deferred recovery settles', async (context) => {
  const browser = await chromium.launch({ headless: true });
  context.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://workspace-ready-race.invalid/', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><body></body>',
  }));
  await page.route('**/preview/js/**', route => { const file=path.join(root,new URL(route.request().url()).pathname);return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(file,'utf8')}); });
  await page.goto('https://workspace-ready-race.invalid/');

  const managerSource = fs.readFileSync(path.join(root, 'preview/js/ai-task-workspaces.js'), 'utf8');
  const createTaskWorkspaces = managerSource
    .slice(managerSource.indexOf('export function createTaskWorkspaces('))
    .replace(/^export /, '');
  const indexSource = fs.readFileSync(path.join(root, 'preview/index.html'), 'utf8');
  const result = await page.evaluate(async ({ createTaskWorkspaces, indexSource }) => {
    const parsed = new DOMParser().parseFromString(indexSource, 'text/html');
    const template = parsed.getElementById('ai-image-panel');
    document.body.innerHTML = template.outerHTML;
    const factory = (await import('/preview/js/ai-task-workspaces.js')).createTaskWorkspaces;
    const controllers = [];
    const activationEvents = [];
    window.addEventListener('5e:ai-workspace-activate', (event) => activationEvents.push({
      scope: event.detail.scope,
      connected: event.detail.panel.isConnected,
    }));
    let serial = 0;
    const initialize = (_state, options) => {
      serial += 1;
      let tabs = [];
      if (serial === 1) {
        const row = document.createElement('div');
        row.className = 'ai-task-tab';
        row.dataset.tabId = 'primary-task';
        row.innerHTML = '<button class="ai-task-tab-select" aria-pressed="true">Primary</button><button class="ai-task-delete">Delete</button>';
        tabs = [row];
      }
      let resolveReady;
      let rejectReady;
      const ready = serial === 1 ? Promise.resolve() : new Promise((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
      });
      options.navigationChanged(tabs);
      const controller = {
        options, ready, resolveReady, rejectReady,
        activeTask: () => tabs[0]?.dataset.tabId || null,
        ownsTask: (id) => tabs.some((tab) => tab.dataset.tabId === id),
        batchOwner: id => ({scope:{sessionId:'5e',workspaceId:options.clientScope||'main'},taskId:id}),
        ownsBatchOwner: owner => tabs.some(tab=>tab.dataset.tabId===owner.taskId)&&owner.scope.workspaceId===(options.clientScope||'main'),
        selectTask() {}, dispose() {}, close() {}, attachReference() {}, open: async () => {},
        sharingSnapshot: async () => ({ tabs: tabs.map((tab) => ({ id: tab.dataset.tabId })) }),
        deleteAll() {
          tabs = [];
          options.navigationChanged(tabs);
          options.workspaceEmpty();
        },
      };
      controllers.push(controller);
      return controller;
    };
    const manager = factory({ get: () => ({ objects: [], selectedIds: [] }) }, initialize, () => {});
    await manager.open();

    controllers[0].options.newWorkspace();
    const resolving = controllers.at(-1);
    const resolvingPanel = resolving.options.panel;
    resolving.deleteAll();
    resolving.resolveReady();
    await Promise.resolve();
    await Promise.resolve();

    controllers[0].options.newWorkspace();
    const rejecting = controllers.at(-1);
    const rejectingPanel = rejecting.options.panel;
    rejecting.deleteAll();
    rejecting.rejectReady(new Error('synthetic recovery rejection'));
    await Promise.resolve();
    await Promise.resolve();

    const afterStalePanel = document.getElementById('ai-image-panel');
    const afterStale = {
      activeConnected: afterStalePanel?.isConnected === true,
      activeIsPrimary: afterStalePanel === controllers[0].options.panel,
      primaryVisible: controllers[0].options.panel.hidden === false,
    };

    controllers[0].options.newWorkspace();
    const live = controllers.at(-1);
    const livePanel = live.options.panel;
    live.resolveReady();
    await Promise.resolve();
    await Promise.resolve();
    const liveActivation = {
      connected: livePanel.isConnected,
      active: document.getElementById('ai-image-panel') === livePanel,
      visible: livePanel.hidden === false,
    };
    live.deleteAll();

    return {
      afterStale,
      liveActivation,
      primaryRestored: document.getElementById('ai-image-panel') === controllers[0].options.panel,
      resolvingConnected: resolvingPanel.isConnected,
      rejectingConnected: rejectingPanel.isConnected,
      staleActivation: activationEvents.some((event) => !event.connected),
      registryEntries: JSON.parse(localStorage.getItem('5e.aiParallelWorkspaces.v1') || '[]').length,
    };
  }, { createTaskWorkspaces, indexSource });

  assert.deepEqual(result.afterStale, { activeConnected: true, activeIsPrimary: true, primaryVisible: true });
  assert.deepEqual(result.liveActivation, { connected: true, active: true, visible: true });
  assert.equal(result.primaryRestored, true);
  assert.equal(result.resolvingConnected, false);
  assert.equal(result.rejectingConnected, false);
  assert.equal(result.staleActivation, false);
  assert.equal(result.registryEntries, 0);
});

test('ARCH-160-01: 100 real workbench disposals release listeners and observers', async (context) => {
  const browser = await chromium.launch({ headless: true });
  context.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  const indexSource = fs.readFileSync(path.join(root, 'preview/index.html'), 'utf8');
  const rawWorkbench = fs.readFileSync(path.join(root, 'preview/js/ai-workbench.js'), 'utf8');
  const workbenchSource = rawWorkbench
    .replace(/^import .*;\n/gm, '')
    .replace(/^export /gm, '')
    .slice(0, rawWorkbench.replace(/^import .*;\n/gm, '').replace(/^export /gm, '').indexOf('\nif (typeof document !== "undefined")'));

  const result = await page.evaluate(async ({ indexSource, workbenchSource }) => {
    const parsed = new DOMParser().parseFromString(indexSource, 'text/html');
    const markup = parsed.getElementById('ai-image-panel').outerHTML;
    const listeners = [];
    const nativeAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, callback, options) {
      if (options?.signal) {
        const record = { type, active: !options.signal.aborted };
        listeners.push(record);
        nativeAdd.call(options.signal, 'abort', () => { record.active = false; }, { once: true });
      }
      return nativeAdd.call(this, type, callback, options);
    };
    const observers = [];
    const NativeMutationObserver = MutationObserver;
    window.MutationObserver = class extends NativeMutationObserver {
      constructor(callback) { super(callback); this.record = { active: false }; observers.push(this.record); }
      observe(...args) { this.record.active = true; return super.observe(...args); }
      disconnect() { this.record.active = false; return super.disconnect(); }
    };
    window.ResizeObserver = class {
      constructor() { this.record = { active: false }; observers.push(this.record); }
      observe() { this.record.active = true; }
      disconnect() { this.record.active = false; }
    };
    const setup = new Function('composeReferenceImages', `${workbenchSource}; return setupAiWorkbench;`)(async () => null);
    for (let cycle = 0; cycle < 100; cycle += 1) {
      const host = document.createElement('div');
      host.innerHTML = markup;
      const panel = host.firstElementChild;
      document.body.append(panel);
      setup(panel);
      panel.aiWorkbench.dispose();
      panel.remove();
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      activeListeners: listeners.filter((record) => record.active).length,
      activeObservers: observers.filter((record) => record.active).length,
      panels: document.querySelectorAll('#ai-image-panel, [id^="ai-workspace-"]').length,
      totalListeners: listeners.length,
      totalObservers: observers.length,
    };
  }, { indexSource, workbenchSource });

  assert.ok(result.totalListeners > 0);
  assert.ok(result.totalObservers > 0);
  assert.equal(result.activeListeners, 0);
  assert.equal(result.activeObservers, 0);
  assert.equal(result.panels, 0);
});

test('TPK-005: pane header resize writes after observer delivery and coalesces unchanged height', async (context) => {
  const browser = await chromium.launch({ headless: true });
  context.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  const indexSource = fs.readFileSync(path.join(root, 'preview/index.html'), 'utf8');
  const rawWorkbench = fs.readFileSync(path.join(root, 'preview/js/ai-workbench.js'), 'utf8');
  const workbenchSource = rawWorkbench
    .replace(/^import .*;\n/gm, '')
    .replace(/^export /gm, '')
    .slice(0, rawWorkbench.replace(/^import .*;\n/gm, '').replace(/^export /gm, '').indexOf('\nif (typeof document !== "undefined")'));

  const result = await page.evaluate(async ({ indexSource, workbenchSource }) => {
    const parsed = new DOMParser().parseFromString(indexSource, 'text/html');
    const panel = parsed.getElementById('ai-image-panel');
    document.body.append(panel);
    const observers = [];
    window.ResizeObserver = class {
      constructor(callback) { this.callback = callback; this.active = true; observers.push(this); }
      observe() {}
      disconnect() { this.active = false; }
    };
    const writes = [];
    const nativeSetProperty = panel.style.setProperty.bind(panel.style);
    panel.style.setProperty = (name, value, priority) => {
      if (name === '--ai-pane-head-height') writes.push(value);
      nativeSetProperty(name, value, priority);
    };
    const setup = new Function('composeReferenceImages', `${workbenchSource}; return setupAiWorkbench;`)(async () => null);
    setup(panel);
    const headObserver = observers[0];
    headObserver.callback([]);
    const duringDelivery = panel.style.getPropertyValue('--ai-pane-head-height');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const afterDelivery = panel.style.getPropertyValue('--ai-pane-head-height');
    const writesAfterFirstDelivery = writes.length;
    headObserver.callback([]);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const writesAfterUnchangedDelivery = writes.length;
    panel.aiWorkbench.dispose();
    return {
      duringDelivery,
      afterDelivery,
      writesAfterFirstDelivery,
      writesAfterUnchangedDelivery,
      disconnected: headObserver.active === false,
    };
  }, { indexSource, workbenchSource });

  assert.equal(result.duringDelivery, '');
  assert.equal(result.afterDelivery, '16px');
  assert.equal(result.writesAfterFirstDelivery, 1);
  assert.equal(result.writesAfterUnchangedDelivery, 1);
  assert.equal(result.disconnected, true);
});

function seedRequestWorkspaces(count, initialGeneration = false) {
  localStorage.setItem('5e.tutorial.bannerSeen', 'true');
  localStorage.setItem('5e.aiReviewDefaultsVersion', '1');
  const listeners = new Set();
  const sends = [];
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 384;
  const draw = canvas.getContext('2d');
  draw.fillStyle = '#fff'; draw.fillRect(0, 0, 512, 384);
  draw.strokeStyle = '#111'; draw.lineWidth = 3; draw.strokeRect(40, 50, 420, 280);
  const original = canvas.toDataURL('image/png');
  draw.fillStyle = '#111'; draw.fillRect(150, 120, 30, 30);
  const modified = canvas.toDataURL('image/png');
  const tabs = Array.from({ length: count }, (_, index) => ({
    id: `task-${index}`, title: `검증 작업 ${index + 1}`, workState: 'idle', input: '선택 영역 안에 작은 사각형 추가',
    model: 'gpt-6-sol', effort: 'medium', serviceTier: '', separationMode: 'off',
    outputOptions: { backgroundPolicy: 'preserve', examPalette: false, lineThickness: 0 },
    attachments: [{ id: `source-${index}`, kind: 'reference', name: `원본 ${index + 1}`, data: original, comments: [] }],
    generated: [{ id: `candidate-${index}`, kind: 'generated', name: `결과 ${index + 1}`, data: original,
      comments: [{ id: `area-${index}`, imageId: `candidate-${index}`, type: 'area', number: 1, x: 25, y: 25, w: 25, h: 25, text: '사각형 추가' }], reviewState: 'idle' }],
    selectedCandidateId: `candidate-${index}`, conversationMessages: [], uiMessages: [],
  }));
  if (initialGeneration) { tabs[0].generated = []; tabs[0].selectedCandidateId = null; }
  let statusGate = null;
  window.__task2 = {
    original, modified, sends, longTasks: [],
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
    models: async () => ({ data: [{ model: 'gpt-6-sol', displayName: 'Sol', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'] }] }),
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

async function requestBrowserFixture(context, count, evidence, { initialGeneration = false } = {}) {
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
  let tracing = true;
  context.after(async () => {
    const finalPage = browserContext.pages()[0];
    if (finalPage && !finalPage.isClosed()) {
      const diagnostic = await finalPage.evaluate(() => [...document.querySelectorAll('[data-ai-busy]')].map(panel => ({ id: panel.id, busy: panel.dataset.aiBusy, phase: panel.dataset.aiRequestPhase, status: panel.querySelector('[data-ai-status]')?.textContent, log: panel.querySelector('[data-ai-log]')?.textContent })));
      fs.writeFileSync(path.join(evidence, `diagnostic-${count}.json`), JSON.stringify(diagnostic, null, 2));
    }
    if (tracing) await browserContext.tracing.stop({ path: path.join(evidence, `trace-${count}.zip`) });
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
  await page.addInitScript({ content: `(${seedRequestWorkspaces.toString()})(${count}, ${initialGeneration})` });
  await page.route('**/preview/js/main.js*', route => route.fulfill({ contentType: 'text/javascript', body:
    'await window.__seedReady;\n' + fs.readFileSync(path.join(root, 'preview/js/main.js'), 'utf8').replace(
      'const aiPanel = initAiPanel(state, { freshStart: recoveryChoice === "fresh" });',
      'const aiPanel = initAiPanel(state, { freshStart: false }); window.__task2Manager = aiPanel;') }));
  await page.goto(`http://127.0.0.1:${server.address().port}/preview/`, { waitUntil: 'networkidle' });
  const welcome = page.locator('.tut-welcome-overlay .tut-banner-no');
  if (await welcome.isVisible()) await welcome.click();
  await page.locator('#ai-image-install-open').click();
  if (!initialGeneration) await page.waitForFunction(() => document.querySelector('#ai-image-panel [data-ai-candidate-option][aria-selected="true"]'));
  await page.waitForFunction(() => [...document.querySelectorAll('#ai-image-panel .ai-image-card img')].some(image => image.naturalWidth === 512));
  assert.deepEqual(errors, [], 'real app boot must have no runtime errors');
  return { page, errors,
    async pauseTracing() {
      await browserContext.tracing.stop({ path: path.join(evidence, `before-performance-trace-${count}.zip`) });
      tracing = false;
    },
    async resumeTracing() {
      await browserContext.tracing.start({ screenshots: true, snapshots: true });
      tracing = true;
    },
  };
}

for (const count of [1, 10, 30]) {
  test(`request ownership and decoded cached selection with ${count} populated tasks`, { timeout: 120_000 }, async context => {
    const evidence = process.env.TASK2_EVIDENCE || path.join(root, '.omo/evidence/ai-workbench-polish-0928/task2/browser');
    fs.mkdirSync(evidence, { recursive: true });
    const { page, errors, pauseTracing, resumeTracing } = await requestBrowserFixture(context, count, evidence);
    const task = index => `#ai-image-panel [data-tab-id="task-${index}"] .ai-task-tab-select`;
    assert.equal(await page.locator('#ai-image-panel .ai-task-tab-select').count(), count);
    const timings = [];
    for (let index = 0; index < count; index += 1) {
      await page.locator(task(index)).click();
      await page.waitForFunction(id => document.querySelector('#ai-image-panel')?.dataset.aiSelectedCandidateId === id, `candidate-${index}`);
      await page.waitForFunction(() => [...document.querySelectorAll('#ai-image-panel .ai-image-card img')].some(image => image.naturalWidth === 512));
    }
    await pauseTracing();
    await page.waitForTimeout(100);
    await page.evaluate(() => { window.__task2.longTasks = []; window.__task2.warmStarted = performance.now(); });
    for (let index = 0; index < 6; index += 1) {
      const target = index % count;
      const duration = await page.evaluate(async target => {
        const before = performance.now();
        document.querySelector(`#ai-image-panel [data-tab-id="task-${target}"] .ai-task-tab-select`).click();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const panel = document.querySelector('#ai-image-panel');
        if (panel.dataset.aiSelectedCandidateId !== `candidate-${target}`) throw new Error('Wrong restored revision');
        if (![...panel.querySelectorAll('.ai-image-card img')].some(image => image.complete && image.naturalWidth === 512)) throw new Error('Decoded image absent');
        return performance.now() - before;
      }, target);
      timings.push(duration);
    }
    await page.evaluate(() => { window.__task2.warmEnded = performance.now(); });
    await resumeTracing();
    await page.locator(task(0)).click();
    await page.screenshot({ path: path.join(evidence, `populated-${count}.png`) });
    await page.locator('#ai-image-panel [data-ai-comments-apply]').click();
    await page.getByRole('dialog', { name: '수정 허용 범위 확인' }).waitFor();
    assert.equal(await page.locator('#ai-image-panel [data-ai-generating]').isVisible(), true);
    await page.getByRole('button', { name: '이 범위로 생성', exact: true }).click();
    await page.waitForFunction(() => window.__task2.sends.length === 1);
    if (count > 1) await page.locator(task(1)).click();
    await page.evaluate(() => { window.__task2.emit(0, 'image'); window.__task2.emit(0, 'done'); });
    if (count > 1) {
      await page.waitForFunction(() => [...document.querySelectorAll('[data-ai-request-phase]')].some(panel => panel.dataset.aiRequestPhase === 'confirmation-wait'));
      assert.equal(await page.locator('dialog[open]').count(), 0, 'background review must not take focus from B');
      assert.equal(await page.locator('#ai-image-panel .ai-generated-card').count(), 1);
      await page.locator(task(0)).click();
    }
    await page.getByRole('dialog', { name: '선택 영역 수정 후보 · 아직 미적용' }).waitFor();
    const restoredPhase = await page.evaluate(() => ({
      phase: document.querySelector('#ai-image-panel').dataset.aiRequestPhase,
      row: document.querySelector('#ai-image-panel [data-tab-id="task-0"] .ai-task-tab-time').textContent,
    }));
    fs.writeFileSync(path.join(evidence, `restored-phase-${count}.json`), JSON.stringify(restoredPhase, null, 2));
    assert.equal(restoredPhase.phase, 'confirmation-wait');
    assert.match(restoredPhase.row, /확인 대기/, 'restored row immediately uses the canonical request phase, without waiting for the elapsed-time tick');
    await page.screenshot({ path: path.join(evidence, `review-${count}.png`) });
    await page.getByRole('button', { name: '적용', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#ai-image-panel .ai-generated-card').length === 2);
    await page.waitForFunction(() => document.querySelector('#ai-image-panel').dataset.aiBusy === 'false');
    const snapshot = await page.evaluate(async () => (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs));
    assert.equal(snapshot.find(tab => tab.id === 'task-0').generated.length, 2);
    assert.ok(snapshot.filter(tab => tab.id !== 'task-0').every(tab => tab.generated.length === 1));
    assert.equal(snapshot.find(tab => tab.id === 'task-0').generated[0].data, await page.evaluate(() => window.__task2.original));
    const longTasks = await page.evaluate(() => window.__task2.longTasks.filter(entry => entry.start >= window.__task2.warmStarted && entry.start < window.__task2.warmEnded));
    const report = { count, engine: process.env.TASK2_ENGINE || 'chromium', longTaskSupported: await page.evaluate(() => window.__task2.longTaskSupported), timings, maxMs: Math.max(...timings), longTasks, errors, originalPreserved: true, resultOnlyInOrigin: true };
    fs.writeFileSync(path.join(evidence, `scenario-${count}.json`), JSON.stringify(report, null, 2));
    await page.screenshot({ path: path.join(evidence, `completed-${count}.png`) });
    assert.equal(longTasks.filter(entry => entry.duration > 50).length, 0, 'Warm task switching has no long tasks over 50ms');
    assert.ok(timings.every(value => value < 100), `Cached selection exceeded 100ms: ${timings}`);
    assert.deepEqual(errors, []);
  });
}

test('cancel/retry isolates late A1 events while scoped A2 and B await approval with C active', { timeout: 90_000 }, async context => {
  const evidence = process.env.TASK2_EVIDENCE || path.join(root, '.omo/evidence/ai-workbench-polish-0928/task2/browser');
  fs.mkdirSync(evidence, { recursive: true });
  const { page, errors } = await requestBrowserFixture(context, 3, evidence);
  const select = async index => {
    await page.locator(`#ai-image-panel [data-tab-id="task-${index}"] .ai-task-tab-select`).click();
    await page.waitForFunction(id => document.querySelector('#ai-image-panel')?.dataset.aiSelectedCandidateId === id, `candidate-${index}`);
  };
  const start = async count => {
    await page.locator('#ai-image-panel [data-ai-comments-apply]').click();
    await page.getByRole('dialog', { name: '수정 허용 범위 확인' }).getByRole('button', { name: '이 범위로 생성', exact: true }).click();
    await page.waitForFunction(count => window.__task2.sends.length === count, count);
  };
  await start(1);
  for (const index of [1, 2, 0, 2, 0]) {
    const target = await page.waitForFunction(index => {
      const button = [...document.querySelectorAll(`[data-tab-id="task-${index}"] .ai-task-tab-select`)].find(element => element.getClientRects().length);
      if (!button) return false;
      const { x, y, width, height } = button.getBoundingClientRect();
      return { x, y, width, height };
    }, index);
    const bounds = await target.jsonValue();
    await target.dispose();
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  }
  await page.waitForFunction(() => document.querySelector('#ai-image-panel')?.dataset.aiSelectedCandidateId === 'candidate-0');
  assert.equal(await page.locator('#ai-image-panel').getAttribute('data-ai-busy'), 'true', 'rapid switches preserve the originating request');
  await page.locator('#ai-image-panel [data-ai-interrupt]').click();
  await page.waitForFunction(() => document.querySelector('#ai-image-panel').dataset.aiBusy === 'false');
  await start(2);
  await select(1);
  await start(3);
  await select(2);
  await page.evaluate(() => { for (const kind of ['image', 'error', 'done']) window.__task2.emit(0, kind); });
  const before = await page.evaluate(async () => (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs));
  assert.ok(before.every(tab => tab.generated.length === 1), 'cancelled A1 cannot register a result');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  await page.evaluate(() => { for (const index of [1, 2]) { window.__task2.emit(index, 'image'); window.__task2.emit(index, 'done'); } });
  await page.waitForFunction(() => document.querySelectorAll('[data-ai-request-phase="confirmation-wait"]').length === 2);
  assert.equal(await page.locator('dialog[open]').count(), 0, 'C retains focus while A and B require explicit approval');
  await page.screenshot({ path: path.join(evidence, 'a-b-waiting-c-active.png') });
  for (const index of [0, 1]) {
    await select(index);
    await page.getByRole('dialog', { name: '선택 영역 수정 후보 · 아직 미적용' }).getByRole('button', { name: '적용', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#ai-image-panel .ai-generated-card').length === 2 && document.querySelector('#ai-image-panel').dataset.aiBusy === 'false');
  }
  const result = await page.evaluate(async () => {
    const tabs = (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs);
    const { decodeScopedPng } = await import('/preview/js/ai-scoped-edit-png.js');
    const bytes = data => Uint8Array.from(atob(data.split(',')[1]), c => c.charCodeAt(0));
    const original = await decodeScopedPng(bytes(window.__task2.original));
    let outsideUnchanged = true;
    for (const tab of tabs.filter(tab => ['task-0', 'task-1'].includes(tab.id))) {
      const output = await decodeScopedPng(bytes(tab.generated.at(-1).data));
      for (let y = 0; y < original.height; y += 1) for (let x = 0; x < original.width; x += 1) {
        if (x >= 128 && x < 256 && y >= 96 && y < 192) continue;
        const offset = (y * original.width + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) if (original.data[offset + channel] !== output.data[offset + channel]) outsideUnchanged = false;
      }
    }
    return { counts: Object.fromEntries(tabs.map(tab => [tab.id, tab.generated.length])), outsideUnchanged, originalPreserved: tabs.every(tab => tab.generated[0].data === window.__task2.original), sends: window.__task2.sends.length };
  });
  assert.deepEqual(result.counts, { 'task-0': 2, 'task-1': 2, 'task-2': 1 });
  assert.equal(result.outsideUnchanged, true);
  assert.equal(result.originalPreserved, true);
  assert.equal(result.sends, 3, 'retry is explicit and never duplicated');
  assert.deepEqual(errors, []);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#ai-image-install-open').click();
  await page.waitForFunction(() => document.querySelectorAll('#ai-image-panel .ai-task-tab-select').length === 3);
  const recovered = await page.evaluate(async () => {
    const tabs = (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs);
    return { ids: tabs.map(tab => tab.id), counts: Object.fromEntries(tabs.map(tab => [tab.id, tab.generated.length])), sends: window.__task2.sends.length, transfers: JSON.parse(localStorage.getItem('5e.aiTaskTransfers.v1') || '[]') };
  });
  assert.equal(new Set(recovered.ids).size, 3);
  assert.deepEqual(recovered.counts, result.counts);
  assert.equal(recovered.sends, 0, 'recovery must never resend generation');
  assert.deepEqual(recovered.transfers, []);
  fs.writeFileSync(path.join(evidence, 'cancel-retry-scoped-abc.json'), JSON.stringify({ ...result, recovered, rapidSwitchLastSelection: 'task-0', rapidSwitchPreservedRequest: true }, null, 2));
});

test('a hung scoped response expires without success or automatic resend', { timeout: 60_000 }, async context => {
  const evidence = process.env.TASK2_EVIDENCE || path.join(root, '.omo/evidence/ai-workbench-polish-0928/task2/browser');
  fs.mkdirSync(evidence, { recursive: true });
  const { page, errors } = await requestBrowserFixture(context, 2, evidence);
  await page.clock.install();
  await page.locator('#ai-image-panel [data-ai-comments-apply]').click();
  await page.getByRole('dialog', { name: '수정 허용 범위 확인' }).getByRole('button', { name: '이 범위로 생성', exact: true }).click();
  await page.waitForFunction(() => window.__task2.sends.length === 1);
  await page.clock.fastForward(181_000);
  await page.waitForFunction(() => document.querySelector('#ai-image-panel').dataset.aiBusy === 'false');
  const result = await page.evaluate(() => ({ phase: document.querySelector('#ai-image-panel').dataset.aiRequestPhase, count: document.querySelectorAll('#ai-image-panel .ai-generated-card').length, sends: window.__task2.sends.length }));
  assert.deepEqual(result, { phase: 'failed', count: 1, sends: 1 });
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(evidence, 'hung-response.png') });
  fs.writeFileSync(path.join(evidence, 'hung-response.json'), JSON.stringify(result, null, 2));
});

test('initial generation shows preparation before delayed status and completes in A while B stays selected', { timeout: 60_000 }, async context => {
  const evidence = process.env.TASK2_EVIDENCE || path.join(root, '.omo/evidence/ai-workbench-polish-0928/task2/browser');
  fs.mkdirSync(evidence, { recursive: true });
  const { page, errors } = await requestBrowserFixture(context, 4, evidence, { initialGeneration: true });
  await page.evaluate(() => window.__task2.delayStatus());
  await page.locator('#ai-image-panel [data-ai-send]').click();
  assert.equal(await page.locator('#ai-image-panel [data-ai-generating]').isVisible(), true);
  assert.equal(await page.locator('#ai-image-panel').getAttribute('data-ai-request-phase'), 'preparing');
  await page.screenshot({ path: path.join(evidence, 'normal-preparation.png') });
  await page.locator('#ai-image-panel [data-tab-id="task-1"] .ai-task-tab-select').click();
  await page.waitForFunction(() => document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId === 'candidate-1');
  await page.evaluate(() => window.__task2.releaseStatus());
  await page.waitForFunction(() => window.__task2.sends.length === 1);
  await page.evaluate(() => { window.__task2.emit(0, 'image'); window.__task2.emit(0, 'done'); });
  await page.waitForFunction(() => [...document.querySelectorAll('[data-ai-request-phase]')].some(panel => panel.dataset.aiRequestPhase === 'completed'));
  assert.equal(await page.locator('#ai-image-panel').getAttribute('data-ai-selected-candidate-id'), 'candidate-1');
  const result = await page.evaluate(async () => {
    const tasks = (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs);
    return { counts: Object.fromEntries(tasks.map(task => [task.id, task.generated.length])), state: tasks.find(task => task.id === 'task-0').workState, sends: window.__task2.sends.length };
  });
  assert.deepEqual(result.counts, { 'task-0': 1, 'task-2': 1, 'task-3': 1, 'task-1': 1 });
  assert.equal(result.state, 'completed');
  assert.equal(result.sends, 1);
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(evidence, 'normal-generation.json'), JSON.stringify(result, null, 2));
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const playwrightPath = process.env.PLAYWRIGHT_MODULE
  || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium, webkit } = require(playwrightPath);
const root = path.resolve(__dirname, '..');
const { loadForHostedCi, timingCheck } = require('./helpers/performance-reference.cjs');
const physicalReference = loadForHostedCi(root);
const { entryConfiguration, inspectEntry } = require('./helpers/four-session-entry.cjs');
const { startServer, stopServer } = require('./run-browser-tests.cjs');
const { mixedCandidate, assertCandidateUnion } = require('./fixtures/candidate-union.cjs');
const entryConfig = entryConfiguration(process.env);
const runtime = { ...entryConfig, moduleBase: entryConfig.moduleBase ?? '/js/', moduleQuery: entryConfig.moduleQuery ?? '?v=1.7.0-four-session-integration' };
const runtimeInit = { base: runtime.moduleBase, query: runtime.moduleQuery };

test('ARCH-160-01: 100 empty workspace removals dispose DOM, controller, and registry state', async (context) => {
  const browser = await chromium.launch({ headless: true });
  context.after(() => browser.close());
  const page = await browser.newPage();
  await page.addInitScript(value => { window.__runtime = value; }, runtimeInit);
  await page.route('https://workspace-lifecycle.invalid/', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><body></body>',
  }));
  await page.route('**/js/**', route => { const file=path.join(root,new URL(route.request().url()).pathname);return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(file,'utf8')}); });
  await page.goto('https://workspace-lifecycle.invalid/');

  const managerSource = fs.readFileSync(path.join(root, 'js/ai-task-workspaces.js'), 'utf8');
  const createTaskWorkspaces = managerSource
    .slice(managerSource.indexOf('export function createTaskWorkspaces('))
    .replace(/^export /, '');
  const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const result = await page.evaluate(async ({ createTaskWorkspaces, indexSource }) => {
    const parsed = new DOMParser().parseFromString(indexSource, 'text/html');
    const template = parsed.getElementById('ai-image-panel');
    template.dataset.lifecyclePanel = 'true';
    document.body.innerHTML = template.outerHTML;

    const factory = (await import(window.__runtime.base + 'ai-task-workspaces.js' + window.__runtime.query)).createTaskWorkspaces;
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
  await page.addInitScript(value => { window.__runtime = value; }, runtimeInit);
  await page.route('https://workspace-ready-race.invalid/', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><body></body>',
  }));
  await page.route('**/js/**', route => { const file=path.join(root,new URL(route.request().url()).pathname);return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(file,'utf8')}); });
  await page.goto('https://workspace-ready-race.invalid/');

  const managerSource = fs.readFileSync(path.join(root, 'js/ai-task-workspaces.js'), 'utf8');
  const createTaskWorkspaces = managerSource
    .slice(managerSource.indexOf('export function createTaskWorkspaces('))
    .replace(/^export /, '');
  const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const result = await page.evaluate(async ({ createTaskWorkspaces, indexSource }) => {
    const parsed = new DOMParser().parseFromString(indexSource, 'text/html');
    const template = parsed.getElementById('ai-image-panel');
    document.body.innerHTML = template.outerHTML;
    const factory = (await import(window.__runtime.base + 'ai-task-workspaces.js' + window.__runtime.query)).createTaskWorkspaces;
    const controllers = [];
    const activationEvents = [];
    const workflowWrites = [];
    const unhandledRejections = [];
    window.addEventListener('unhandledrejection',event=>{
      unhandledRejections.push(String(event.reason));event.preventDefault();
    });
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
        setEmptyWorkflow(kind) { options.panel.dataset.aiWorkflow=kind;workflowWrites.push({scope:options.clientScope,connected:options.panel.isConnected,kind});return true; },
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
    await new Promise(resolve=>setTimeout(resolve,0));

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
      liveRetained: document.getElementById('ai-image-panel') === livePanel && !livePanel.hidden && livePanel.isConnected,
      resolvingConnected: resolvingPanel.isConnected,
      rejectingConnected: rejectingPanel.isConnected,
      staleActivation: activationEvents.some((event) => !event.connected),
      staleWorkflowWrite: workflowWrites.some(write=>!write.connected),
      workflowWrites:workflowWrites.length,
      unhandledRejections,
      registryEntries: JSON.parse(localStorage.getItem('5e.aiParallelWorkspaces.v1') || '[]').length,
    };
  }, { createTaskWorkspaces, indexSource });

  assert.deepEqual(result.afterStale, { activeConnected: true, activeIsPrimary: true, primaryVisible: true });
  assert.deepEqual(result.liveActivation, { connected: true, active: true, visible: true });
  assert.equal(result.primaryRestored, false,'deleting the active empty workspace keeps its own conversion workflow visible');
  assert.equal(result.liveRetained, true);
  assert.equal(result.resolvingConnected, false);
  assert.equal(result.rejectingConnected, false);
  assert.equal(result.staleActivation, false);
  assert.equal(result.staleWorkflowWrite, false,'disposed workspaces cannot persist workflow changes');
  assert.equal(result.workflowWrites, 1,'only the live workspace is initialized');
  assert.deepEqual(result.unhandledRejections,[],'a disposed recovery rejection is consumed without an application error');
  assert.equal(result.registryEntries, 1,'the visible empty workspace remains recoverable');
});

test('ARCH-160-01: 100 real workbench disposals release listeners and observers', async (context) => {
  const browser = await chromium.launch({ headless: true });
  context.after(() => browser.close());
  const page = await browser.newPage();
  await page.addInitScript(value => { window.__runtime = value; }, runtimeInit);
  await page.route('https://workbench-component.invalid/', route => route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));
  await page.route('**/js/**', route => route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,new URL(route.request().url()).pathname),'utf8')}));
  await page.goto('https://workbench-component.invalid/');
  const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  const result = await page.evaluate(async ({ indexSource }) => {
    const { setupAiWorkbench: setup } = await import(window.__runtime.base + 'ai-workbench.js' + window.__runtime.query);
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
  }, { indexSource });

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
  await page.addInitScript(value => { window.__runtime = value; }, runtimeInit);
  await page.route('https://workbench-component.invalid/', route => route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));
  await page.route('**/js/**', route => route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,new URL(route.request().url()).pathname),'utf8')}));
  await page.goto('https://workbench-component.invalid/');
  const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  const result = await page.evaluate(async ({ indexSource }) => {
    const { setupAiWorkbench: setup } = await import(window.__runtime.base + 'ai-workbench.js' + window.__runtime.query);
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
    // 2026-10-16(83201a54)부터 머리 줄 높이 = 조절 줄 높이 + 머리 줄의 실제 위아래 여백·테두리(예전 고정 +8px 대신).
    const measuredHeadHeight = Math.max(0,...Array.from(panel.querySelectorAll('.ai-pane-head-controls'),control=>{
      const style=getComputedStyle(control.parentElement);
      return control.offsetHeight+['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'].reduce((total,key)=>total+(parseFloat(style[key])||0),0);
    }));
    const nativeSetProperty = panel.style.setProperty.bind(panel.style);
    panel.style.setProperty = (name, value, priority) => {
      if (name === '--ai-pane-head-height') writes.push(value);
      nativeSetProperty(name, value, priority);
    };
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
      measuredHeadHeight,
      writesAfterFirstDelivery,
      writesAfterUnchangedDelivery,
      disconnected: headObserver.active === false,
    };
  }, { indexSource });

  assert.equal(result.duringDelivery, '');
  assert.equal(result.afterDelivery, `${Math.ceil(result.measuredHeadHeight)}px`,'one shared header includes its measured controls and spacing');
  assert.equal(result.writesAfterFirstDelivery, 1);
  assert.equal(result.writesAfterUnchangedDelivery, 1);
  assert.equal(result.disconnected, true);
});

function seedRequestWorkspaces(count, initialGeneration = false, mixedCandidate) {
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
    model: 'gpt-6.1-sol', effort: 'medium', serviceTier: '', separationMode: 'off',
    outputOptions: { backgroundPolicy: 'preserve', examPalette: false, lineThickness: 0 },
    attachments: [{ id: `source-${index}`, kind: 'reference', name: `원본 ${index + 1}`, data: original, comments: [] }],
    generated: [{ id: `candidate-${index}`, kind: 'generated', name: `결과 ${index + 1}`, data: original,
      comments: [{ id: `area-${index}`, imageId: `candidate-${index}`, type: 'area', number: 1, x: 25, y: 25, w: 25, h: 25, text: '사각형 추가' }], reviewState: 'idle' }],
    selectedCandidateId: `candidate-${index}`, conversationMessages: [], uiMessages: [],
  }));
  for (const tab of mixedCandidate ? tabs : []) {
    tab.conversionKind = 'graph';
    for (const item of tab.generated) {
      const { id, name, comments } = item;
      Object.assign(item, mixedCandidate(original), { id, name, comments });
    }
  }
  window.__task5Expected = structuredClone(tabs);
  if (initialGeneration) {
    tabs[0].generated = []; tabs[0].selectedCandidateId = null;
    tabs[0].imageLabelWorkflow = { version: '1.1.0', imageKind: 'general', labelResult: 'remove', verificationMode: 'full', auxiliaryMarks: 'remove', scientificArrows: 'keep', explicit: true };
  }
  const generationSends = [];
  const sourceObservation = {
    version: 4, observationVersion: 1, leaderObservationVersion: 1, observationContractRevision: '1.4.0',
    removalOnlyItems: [], reviewRequired: false,
    geometryLock: { version: 1, objects: [{ id: 'frame', sourceRef: 1, role: 'scientific-object', description: 'Controlled original frame', bounds: { x: 40/512, y: 50/384, w: 420/512, h: 280/384 }, relations: [] }] },
    labels: [], removalRegions: [], protectedRegions: [], preservedMarks: [], uncertainties: [],
  };
  const reviewIds = ['object-counts','inside-outside','liquid-occupancy','connections','composition-state','black-fill-meaning','presentation','request-scope','kice-flat-style','flat-gray-regions','raster-label-removal','editable-label-coverage','leader-relations','label-overlay-alignment','label-typography','leader-overlay'];
  const sourceReview = { verdict: 'pass', checks: reviewIds.map(id => ({ id, label: id, status: 'pass', detail: 'Controlled transport for request ownership; not provider quality evidence' })), issues: [] };
  const deliver = (send, method, params) => {
    for (const listener of listeners) listener({ clientScope: send.payload.clientScope || '', method, params });
  };
  const observerReply = send => {
    const text = String(send.payload.text || '');
    let response;
    if (text.includes('입력 원본 라벨 관찰')) { send.stage = 'source-observation'; response = sourceObservation; }
    else if (text.includes('검수') || text.includes('FINAL_NATIVE_OVERLAY')) { send.stage = 'full-review'; response = sourceReview; }
    else throw new Error('Unexpected controlled observer request: ' + text.slice(0, 200));
    setTimeout(() => {
      deliver(send, 'item/completed', { turnId: send.turnId, item: { type: 'agentMessage', phase: 'final_answer', text: JSON.stringify(response) } });
      deliver(send, 'turn/completed', { turn: { id: send.turnId, status: 'completed' } });
    }, 0);
  };
  let statusGate = null;
  window.__task2 = {
    original, modified, sends, generationSends, longTasks: [],
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
    models: async () => ({ data: [{ model: 'gpt-6.1-sol', displayName: 'Sol', isDefault: true, defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'] }, { model: 'gpt-6-luna', displayName: 'Luna', defaultReasoningEffort: 'medium', supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'] }] }),
    account: async () => ({ rateLimits: {} }), login: async () => {},
    send: async payload => {
      const turnId = `turn-${sends.length}`, threadId = `thread-${sends.length}`;
      const send = { payload, turnId, threadId }; sends.push(send);
      if (payload.purpose === 'image') { send.stage = 'image-generation'; generationSends.push(send); }
      else observerReply(send);
      return { turnId, threadId };
    },
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

async function requestBrowserFixture(context, count, evidence, { initialGeneration = false, union = false } = {}) {
  const { fixtureContext, installAiMain } = require(path.join(root, 'tests/helpers/canonical-fixture-adapter.cjs'));
  const { runtime, runtimeInit, inspectEntry, startServer, stopServer, mixedCandidate } = fixtureContext(root);
  const server = process.env.PREVIEW_URL ? null : startServer();
  const origin = process.env.PREVIEW_URL ? new URL(process.env.PREVIEW_URL).origin : await server.ready;
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
    const port = new URL(origin).port;
    if (server) await stopServer(server.child);
    fs.writeFileSync(path.join(evidence, `cleanup-${count}.json`), JSON.stringify({ engine: process.env.TASK2_ENGINE || 'chromium', browserVersion: browser.version(), browserContextClosed: true, browserClosed: !browser.isConnected(), serverClosed: server ? server.child.exitCode !== null || server.child.signalCode !== null : null, officialServerReused: !server, serverPort: port }));
  });
  const page = await browserContext.newPage();
  await page.addInitScript(value => { window.__runtime = value; }, runtimeInit);
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('TASK2 PAGE ERROR', error.message); });
  await page.addInitScript({ content: `(${seedRequestWorkspaces.toString()})(${count}, ${initialGeneration}, ${union ? mixedCandidate.toString() : 'null'})` });
  await installAiMain(page, root, {}, evidence);
  const entryReceipt = await inspectEntry(page, origin, runtime);
  fs.writeFileSync(path.join(evidence, 'entry-' + count + '.json'), JSON.stringify(entryReceipt, null, 2));
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
    const evidence = process.env.TASK2_EVIDENCE || process.env.EVIDENCE_DIR || path.join(root, '.omo/evidence/ai-workbench-polish-0928/task2/browser');
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
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
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
    assert.equal(await page.locator('#ai-image-panel [data-ai-generating]').isVisible(), true);
    assert.equal(await page.getByRole('dialog', { name: '수정 허용 범위 확인' }).count(), 0, 'The explicit primary scope action already authorizes the captured bounds');
    await page.waitForFunction(() => window.__task2.sends.length === 1);
    if (count > 1) await page.locator(task(1)).click();
    await page.evaluate(() => { window.__task2.emit(0, 'image'); window.__task2.emit(0, 'done'); });
    if (count > 1) {
      await page.waitForFunction(() => [...document.querySelectorAll('[data-ai-request-phase]')].some(panel => panel.dataset.aiRequestPhase === 'confirmation-wait'));
      assert.equal(await page.locator('dialog[open]').count(), 0, 'background review must not take focus from B');
      assert.equal(await page.locator('#ai-image-panel .ai-generated-card').count(), 1);
      await page.locator(task(0)).click();
    }
    await page.getByRole('dialog', { name: '수정 전후 비교' }).waitFor();
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
    if (physicalReference) {
      const scenario = `${report.engine}/tasks-${count}`;
      const reference = physicalReference.scenarios.find(row => `${row.engine}/${row.name}` === scenario);
      assert.ok(reference, 'The validated physical reference must cover this task count and browser');
      fs.writeFileSync(path.join(evidence, `timing-acceptance-${count}.json`), JSON.stringify({
        source: 'physical-reference', sourceCommit: physicalReference.sourceCommit,
        identity: physicalReference.identity, scenario, hostedVmTiming: report,
        reference: reference.performance,
      }, null, 2));
      console.log(`${scenario}: functional ownership/content assertions remain live; hosted VM timing is diagnostic; strict physical reference enforces <100ms samples and no >50ms long tasks.`);
    } else {
      timingCheck(longTasks.filter(entry => entry.duration > 50).length === 0, `Warm task switching has no long tasks over 50ms: ${longTasks.filter(entry => entry.duration > 50).length}`);
      timingCheck(timings.every(value => value < 100), `Cached selection exceeded 100ms: ${timings}`);
    }
    assert.deepEqual(errors, []);
  });
}

test('cancel/retry isolates late A1 events while scoped A2 and B await approval with C active', { timeout: 90_000 }, async context => {
  const evidence = process.env.TASK2_EVIDENCE || process.env.EVIDENCE_DIR || path.join(root, '.omo/evidence/ai-workbench-polish-0928/task2/browser');
  fs.mkdirSync(evidence, { recursive: true });
  const { page, errors } = await requestBrowserFixture(context, 3, evidence);
  const select = async index => {
    await page.locator(`#ai-image-panel [data-tab-id="task-${index}"] .ai-task-tab-select`).click();
    await page.waitForFunction(id => document.querySelector('#ai-image-panel')?.dataset.aiSelectedCandidateId === id, `candidate-${index}`);
  };
  const start = async count => {
    await page.locator('#ai-image-panel [data-ai-comments-apply]').click();
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
    await page.getByRole('dialog', { name: '수정 전후 비교' }).getByRole('button', { name: '적용', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('#ai-image-panel .ai-generated-card').length === 2 && document.querySelector('#ai-image-panel').dataset.aiBusy === 'false');
  }
  const result = await page.evaluate(async () => {
    const tabs = (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs);
    const { decodeScopedPng } = await import(window.__runtime.base + 'ai-scoped-edit-png.js' + window.__runtime.query);
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
  const evidence = process.env.TASK2_EVIDENCE || process.env.EVIDENCE_DIR || path.join(root, '.omo/evidence/ai-workbench-polish-0928/task2/browser');
  fs.mkdirSync(evidence, { recursive: true });
  const { page, errors } = await requestBrowserFixture(context, 2, evidence);
  await page.clock.install();
  await page.locator('#ai-image-panel [data-ai-comments-apply]').click();
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
  const evidence = process.env.TASK2_EVIDENCE || process.env.EVIDENCE_DIR || path.join(root, '.omo/evidence/ai-workbench-polish-0928/task2/browser');
  fs.mkdirSync(evidence, { recursive: true });
  const { page, errors } = await requestBrowserFixture(context, 4, evidence, { initialGeneration: true });
  await page.evaluate(() => window.__task2.delayStatus());
  await page.locator('#ai-image-panel [data-ai-comments-apply]').click();
  assert.equal(await page.locator('#ai-image-panel [data-ai-generating]').isVisible(), true);
  assert.equal(await page.locator('#ai-image-panel').getAttribute('data-ai-request-phase'), 'preparing');
  await page.screenshot({ path: path.join(evidence, 'normal-preparation.png') });
  await page.locator('#ai-image-panel [data-tab-id="task-1"] .ai-task-tab-select').click();
  await page.waitForFunction(() => document.querySelector('#ai-image-panel').dataset.aiSelectedCandidateId === 'candidate-1');
  await page.evaluate(() => window.__task2.releaseStatus());
  await page.waitForFunction(() => window.__task2.generationSends.length === 1);
  await page.evaluate(() => { const index = window.__task2.sends.indexOf(window.__task2.generationSends[0]); window.__task2.emit(index, 'image'); window.__task2.emit(index, 'done'); });
  await page.waitForFunction(() => [...document.querySelectorAll('[data-ai-request-phase]')].some(panel => panel.dataset.aiRequestPhase === 'completed'));
  assert.equal(await page.locator('#ai-image-panel').getAttribute('data-ai-selected-candidate-id'), 'candidate-1');
  const result = await page.evaluate(async () => {
    const tasks = (await window.__task2Manager.sharingSnapshot()).workspaces.flatMap(workspace => workspace.tabs);
    return { counts: Object.fromEntries(tasks.map(task => [task.id, task.generated.length])), state: tasks.find(task => task.id === 'task-0').workState, sends: window.__task2.generationSends.length, transportStages: window.__task2.sends.map(send => send.stage) };
  });
  assert.deepEqual(result.counts, { 'task-0': 1, 'task-2': 1, 'task-3': 1, 'task-1': 1 });
  assert.equal(result.state, 'completed');
  assert.equal(result.sends, 1);
  assert.deepEqual(result.transportStages, ['source-observation', 'image-generation', 'full-review'], 'All three real correlated transport stages are accounted for; exactly one generation occurs');
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(evidence, 'normal-generation.json'), JSON.stringify(result, null, 2));
});

test('X13: actual sharing, exam, project and root-preview-root writers retain the complete union', { timeout: 90_000 }, async context => {
  const evidence = process.env.EVIDENCE_DIR || process.env.TASK2_EVIDENCE || path.join(root, '.omo/evidence/task5-union');
  fs.mkdirSync(evidence, { recursive: true });
  const { page, errors } = await requestBrowserFixture(context, 5, evidence, { union: true });
  const expected = await page.evaluate(() => window.__task5Expected[0].generated[0]);
  const records = [];
  const prove = (boundary, value) => {
    assertCandidateUnion(assert, value, expected);
    records.push({ boundary, status: 'PASS', fields: Object.keys(expected), actual: value });
  };
  const shared = await page.evaluate(async () => (await window.__task2Manager.sharingSnapshot()).workspaces[0]);
  prove('sharingSnapshot', shared.tabs.find(tab => tab.id === 'task-0').generated[0]);
  assert.equal(shared.tabs[0].conversionKind, 'graph');
  const checkpoint = await page.evaluate(async () => {
    await window.__task2Manager.checkpointForClose();
    return new Promise((resolve, reject) => {
      const opening = indexedDB.open('5e.preview:5e-ai-image-tasks', 1);
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result, tx = db.transaction('tasks', 'readonly');
        let saved;
        tx.oncomplete = () => { db.close(); resolve(saved); };
        tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
        const request = tx.objectStore('tasks').get('workspace');
        request.onsuccess = () => { saved = request.result; };
      };
    });
  });
  prove('active task checkpoint / actual IndexedDB', checkpoint.tabs.find(tab => tab.id === 'task-0').generated[0]);

  const imported = await page.evaluate(async snapshot => {
    await window.__task2Manager.openSharingDocument('union-share', { mode: 'edit', workspaces: [snapshot], activeWorkspace: 0 });
    return window.__task2Manager.captureExamTask();
  }, shared);
  prove('importSharingSnapshot / restored task', imported.snapshot.tabs[0].generated[0]);
  prove('captureExamTask / examTaskSnapshot', imported.snapshot.tabs[0].generated[0]);
  assert.equal(imported.snapshot.tabs[0].selectedCandidateId, expected.id);

  const examInput = structuredClone(imported);
  examInput.taskId = 'task-exam-independent';
  examInput.snapshot.activeTaskTabId = examInput.taskId;
  examInput.snapshot.tabs[0].id = examInput.taskId;
  examInput.snapshot.tabs[0].examLink = { tabId: 'independent-exam-tab', assetId: 'independent-exam-asset' };
  const examRestored = await page.evaluate(value => window.__task2Manager.restoreExamTask(value), examInput);
  prove('restoreExamTask independent scope', examRestored.snapshot.tabs[0].generated[0]);

  const project = { workspaces: [structuredClone(shared)], activeWorkspace: 0 };
  project.workspaces[0].tabs = [project.workspaces[0].tabs[0]];
  project.workspaces[0].tabs[0].id = 'project-union-task';
  project.workspaces[0].tabs[0].examLink = { tabId: 'project-source-tab', assetId: 'project-source-asset' };
  project.workspaces[0].activeTaskTabId = 'project-union-task';
  const restoredProject = await page.evaluate(async value => {
    await window.__task2Manager.restoreProjectSnapshot(value);
    return window.__task2Manager.captureExamTask();
  }, project);
  prove('restoreProjectSnapshot independent scope', restoredProject.snapshot.tabs[0].generated[0]);
  const replacement = structuredClone(project);
  replacement.workspaces[0].tabs[0].generated[0].graphEdit.revision.id = 'replacement-native-revision';
  replacement.workspaces[0].tabs[0].generated[0].editableDraft.annotationDrafts[0].after.x = .79;
  const matching = await page.evaluate(async value => {
    await window.__task2Manager.restoreProjectSnapshot(value);
    return window.__task2Manager.captureExamTask();
  }, replacement);
  assertCandidateUnion(assert, matching.snapshot.tabs[0].generated[0], replacement.workspaces[0].tabs[0].generated[0]);
  records.push({ boundary: 'restoreProjectSnapshot matching workspace reimport', status: 'PASS', actual: matching.snapshot.tabs[0].generated[0] });
  const rejected = structuredClone(replacement);
  rejected.workspaces[0].tabs[0].generated[0].sourceFrame.width = -5;
  await assert.rejects(page.evaluate(value => window.__task2Manager.restoreProjectSnapshot(value), rejected), /source\/frame/);
  const preserved = await page.evaluate(() => window.__task2Manager.captureExamTask());
  assertCandidateUnion(assert, preserved.snapshot.tabs[0].generated[0], replacement.workspaces[0].tabs[0].generated[0]);

  const origin = new URL(page.url()).origin;
  for (const entry of [runtime.entry === '/' ? '/preview/' : '/', runtime.entry]) {
    await page.evaluate(() => window.__task2Manager.checkpointForClose());
    const receipt = await inspectEntry(page, origin, { ...runtime, entry });
    assert.equal(receipt.resources.some(resource => /\/preview\/js\//.test(resource.url)), false);
    const reloaded = await page.evaluate(async () => {
      await window.__task2Manager.checkpointForClose();
      return window.__task2Manager.sharingSnapshot();
    });
    const original = reloaded.workspaces.flatMap(workspace => workspace.tabs).find(tab => tab.id === 'task-0');
    prove(`same-origin ${entry} checkpoint and reload`, original.generated[0]);
    fs.writeFileSync(path.join(evidence, entry === '/' ? 'union-root-runtime.json' : 'union-preview-runtime.json'), JSON.stringify(receipt, null, 2));
  }
  const identities = await page.evaluate(async () => {
    const q = window.__runtime.query, result = {};
    const keys = { state: 'state', store: 'createStore', 'text-editor': 'commitActiveText', 'ai-panel': 'snapshotImageItem', 'ai-task-workspaces': 'createTaskWorkspaces', 'ai-label-background': 'resolveImageLabelBackground' };
    const loadedBefore = performance.getEntriesByType('resource').map(entry => entry.name);
    for (const [file, key] of Object.entries(keys)) {
      const canonical = await import(window.__runtime.base + file + '.js' + q);
      const alias = await import('/preview/js/' + file + '.js');
      result[file] = canonical[key] === alias[key];
    }
    return { result, loadedBefore };
  });
  assert.ok(Object.values(identities.result).every(Boolean), 'compatibility aliases must forward identical live exports');
  for (const name of ['main', 'state', 'text-editor', 'ai-label-background']) {
    assert.ok(identities.loadedBefore.includes(`${origin}/js/${name}.js${runtime.moduleQuery}`), `actual boot loaded ${name}`);
  }
  assert.deepEqual(errors, []);
  const paneSelectors = {
    source: '#ai-image-panel:not([hidden]) .is-ai-active-source .ai-preview-stage > img',
    result: '#ai-image-panel:not([hidden]) .is-ai-active-candidate .ai-preview-stage > img',
  };
  await page.evaluate(selectors => {
    window.__task5VisibleRasters = new Promise((resolve, reject) => {
      const watched = new WeakSet();
      let images = [];
      const events = ['load', 'animationend', 'animationcancel', 'transitionend', 'transitioncancel'];
      const cleanup = () => {
        clearTimeout(timer);
        resize.disconnect();
        mutations.disconnect();
        for (const event of events) document.removeEventListener(event, check, true);
      };
      const check = () => {
        const panel = document.querySelector('#ai-image-panel:not([hidden])');
        if (!panel) return;
        images = Object.entries(selectors).map(([name, selector]) => ({ name, image: document.querySelector(selector) }));
        if (images.some(({ image }) => !image)) return;
        for (const { image } of images) for (const node of [image, image.parentElement]) {
          if (!watched.has(node)) { watched.add(node); resize.observe(node); }
        }
        if (panel.getAnimations({ subtree: true }).some(animation =>
          animation.effect.getComputedTiming().iterations !== Infinity
          && !['finished', 'idle'].includes(animation.playState))) return;
        const panes = [];
        for (const { name, image } of images) {
          const stage = image.parentElement;
          if (!image.complete || image.naturalWidth !== 512 || image.naturalHeight !== 384
            || !(Number(stage.dataset.aiFitWidth) > 0) || !(Number(stage.dataset.aiFitHeight) > 0)) return;
          const rect = image.getBoundingClientRect();
          if (!(rect.width > 0 && rect.height > 0)) return;
          let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
          let right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
          for (let node = image; node; node = node.parentElement) {
            const style = getComputedStyle(node), bounds = node.getBoundingClientRect();
            if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) !== 1) return;
            if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
              left = Math.max(left, bounds.left); right = Math.min(right, bounds.right);
            }
            if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
              top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);
            }
          }
          if (right - left < rect.width - 1 || bottom - top < rect.height - 1) return;
          panes.push({ name, x: rect.x, y: rect.y, width: rect.width, height: rect.height,
            region: image.closest('.ai-image-pane').getBoundingClientRect().toJSON() });
        }
        cleanup();
        resolve({ panes, viewport: { width: innerWidth, height: innerHeight } });
      };
      const resize = new ResizeObserver(check);
      const mutations = new MutationObserver(check);
      const timer = setTimeout(() => {
        const diagnostic = images.filter(({ image }) => image).map(({ name, image }) => ({
          name, connected: image.isConnected, current: image === document.querySelector(selectors[name]),
          decoded: [image.naturalWidth, image.naturalHeight], bounds: image.getBoundingClientRect().toJSON(),
          fit: { ...image.parentElement?.dataset },
        }));
        cleanup();
        reject(new Error(`Source/result rasters did not become fitted and visible: ${JSON.stringify(diagnostic)}`));
      }, 10_000);
      mutations.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'style', 'src', 'data-ai-fit-width', 'data-ai-fit-height'] });
      for (const event of events) document.addEventListener(event, check, true);
    });
  }, paneSelectors);
  await page.locator('#ai-image-install-open').click();
  await page.locator('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img').evaluate(image => image.decode());
  await page.locator('#ai-image-panel .ai-reference-card .ai-preview-stage > img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  const visibility = await page.evaluate(() => window.__task5VisibleRasters);
  assert.ok(await page.locator('#ai-image-panel .is-ai-active-candidate .ai-preview-stage > img')
    .evaluate(image => image.naturalWidth === 512 && image.getBoundingClientRect().width > 0), 'restored workbench raster is decoded and visibly laid out');
  const capturePaint = async filename => {
    const screenshot = await page.screenshot({ path: path.join(evidence, filename) });
    return page.evaluate(async ({ png, visibility, selectors }) => {
      // Opening/restoring can change horizontal versus vertical comparison.
      // Sample the pane regions at capture time, not an earlier layout frame.
      visibility = {viewport:{width:innerWidth,height:innerHeight},panes:visibility.panes.map(pane=>({
        ...pane,region:document.querySelector(selectors[pane.name]).getBoundingClientRect().toJSON()
      }))};
      const { decodeScopedPng } = await import(window.__runtime.base + 'ai-scoped-edit-png.js' + window.__runtime.query);
      const pixels = await decodeScopedPng(Uint8Array.from(atob(png), character => character.charCodeAt(0)));
      // Sample the existing fixture's rectangle edges and white interior, not pane chrome.
      const samples = [[250, 50, 'dark'], [250, 330, 'dark'], [40, 190, 'dark'], [460, 190, 'dark'],
        [80, 80, 'white'], [350, 250, 'white']];
      return Object.fromEntries(visibility.panes.map(pane => {
        const scaleX = pixels.width / visibility.viewport.width, scaleY = pixels.height / visibility.viewport.height;
        const left = Math.max(0, Math.ceil(pane.region.left * scaleX));
        const right = Math.min(pixels.width, Math.floor(pane.region.right * scaleX));
        const top = Math.max(0, Math.ceil(pane.region.top * scaleY));
        const bottom = Math.min(pixels.height, Math.floor(pane.region.bottom * scaleY));
        let paperLeft = right, paperRight = -1, paperTop = bottom, paperBottom = -1;
        for (let y = top; y < bottom; y += 1) {
          let white = 0, first = right, last = -1;
          for (let x = left; x < right; x += 1) {
            const offset = (y * pixels.width + x) * 4;
            if (pixels.data[offset + 3] === 255 && pixels.data[offset] > 235
              && pixels.data[offset + 1] > 235 && pixels.data[offset + 2] > 235) {
              white += 1; first = Math.min(first, x); last = x;
            }
          }
          if (white > (right - left) / 2) {
            paperLeft = Math.min(paperLeft, first); paperRight = Math.max(paperRight, last);
            paperTop = Math.min(paperTop, y); paperBottom = y;
          }
        }
        if (paperRight < paperLeft || paperBottom < paperTop) return [pane.name, { paper: null, samples: [] }];
        const paper = { x: paperLeft, y: paperTop, width: paperRight - paperLeft + 1, height: paperBottom - paperTop + 1 };
        const cssBounds = { x: paper.x / scaleX, y: paper.y / scaleY, width: paper.width / scaleX, height: paper.height / scaleY };
        return [pane.name, { paper, cssBounds, samples: samples.map(([x, y, kind]) => {
          const sx = Math.round(paper.x + paper.width * x / 512);
          const sy = Math.round(paper.y + paper.height * y / 384);
          let matches = 0;
          for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
            const px = sx + dx, py = sy + dy;
            if (px < 0 || py < 0 || px >= pixels.width || py >= pixels.height) continue;
            const offset = (py * pixels.width + px) * 4;
            const rgb = pixels.data.subarray(offset, offset + 3);
            if (pixels.data[offset + 3] === 255 && (kind === 'dark' ? rgb.every(value => value < 80) : rgb.every(value => value > 235))) matches += 1;
          }
          return { x, y, kind, matches };
        }) }];
      }));
    }, { png: screenshot.toString('base64'), visibility, selectors:paneSelectors });
  };
  const assertPainted = (paint, pane) => assert.ok(paint[pane].paper
    && Math.abs(paint[pane].paper.width / paint[pane].paper.height - 512 / 384) < .02
    && paint[pane].samples.length === 6 && paint[pane].samples.every(sample => sample.matches > 0),
  `${pane} captured raster must contain the fixture border and interior: ${JSON.stringify(paint[pane])}`);
  const painted = await capturePaint('union-restored-ui.png');
  assertPainted(painted, 'source');
  assertPainted(painted, 'result');
  const blankNegatives = [];
  for (const pane of visibility.panes) {
    await page.evaluate(bounds => {
      const cover = document.createElement('div');
      cover.dataset.task5BlankPane = bounds.name;
      Object.assign(cover.style, { position: 'fixed', left: `${bounds.x}px`, top: `${bounds.y}px`,
        width: `${bounds.width}px`, height: `${bounds.height}px`, background: '#fff', zIndex: '2147483647', pointerEvents: 'none' });
      document.body.append(cover);
    }, { ...painted[pane.name].cssBounds, name: pane.name });
    try {
      assert.ok(await page.locator(paneSelectors[pane.name])
        .evaluate(image => image.naturalWidth === 512 && image.getBoundingClientRect().width > 0));
      const blank = await capturePaint(`union-blank-${pane.name}.png`);
      assert.throws(() => assertPainted(blank, pane.name), { code: 'ERR_ASSERTION' });
      assertPainted(blank, pane.name === 'source' ? 'result' : 'source');
      blankNegatives.push({ pane: pane.name, oldWidthGuardPassed: true, capturedPixelGuardRejected: true, samples: blank[pane.name] });
    } finally {
      await page.evaluate(() => document.querySelector('[data-task5-blank-pane]').remove());
    }
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(evidence, 'union-live-boundaries.json'), JSON.stringify({ records, identities, errors, visibility, painted, blankNegatives }, null, 2));
});

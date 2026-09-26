const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const playwrightPath = process.env.PLAYWRIGHT_MODULE
  || '/Users/parkseungyeon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(playwrightPath);
const root = path.resolve(__dirname, '..');

test('ARCH-160-01: 100 empty workspace removals dispose DOM, controller, and registry state', async (context) => {
  const browser = await chromium.launch({ headless: true });
  context.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://workspace-lifecycle.invalid/', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><body></body>',
  }));
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

    const factory = new Function('createTaskBridge', `${createTaskWorkspaces}; return createTaskWorkspaces;`)(() => undefined);
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

test('ARCH-160-01: 100 real workbench disposals release listeners and observers', async (context) => {
  const browser = await chromium.launch({ headless: true });
  context.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  const indexSource = fs.readFileSync(path.join(root, 'preview/index.html'), 'utf8');
  const rawWorkbench = fs.readFileSync(path.join(root, 'preview/js/ai-workbench.js'), 'utf8');
  const workbenchSource = rawWorkbench
    .replace(/^import .*;\n/, '')
    .replace(/^export /gm, '')
    .slice(0, rawWorkbench.replace(/^import .*;\n/, '').replace(/^export /gm, '').indexOf('\nif (typeof document !== "undefined")'));

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

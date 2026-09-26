const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../preview/js');
const read = name => fs.readFileSync(path.join(root, `${name}.js`), 'utf8');
const strip = source => source
  .replace(/^import\s[\s\S]*?;\n/gm, '')
  .replace(/\bexport\s+(?=(?:async\s+)?function|const|let|class)/g, '');
const clone = value => JSON.parse(JSON.stringify(value));

function page(id, objects = []) {
  return {
    id, name: id, meta: { number: '', points: '' }, objects, guides: [],
    layers: [{ id: 1, name: '레이어 1', visible: true }], artboard: { w: 90, h: 60 },
  };
}

function line(id, x = 0) {
  return { id, type: 'line', layerId: 1, p1: { x, y: 0 }, p2: { x: x + 10, y: 10 } };
}

function makeStore(ctx, pages, activePageId = pages[0].id) {
  const active = pages.find(candidate => candidate.id === activePageId);
  return ctx.createStore({
    pages, activePageId, objects: active.objects, guides: active.guides,
    layers: active.layers, artboard: active.artboard, undoStack: [], redoStack: [],
    selectedIds: [], selectedGuideId: null, activeLayerId: 1, groups: [],
    targetedId: null, draft: null, draftText: null,
  });
}

function dataContext() {
  const ctx = vm.createContext({
    console, Blob, URL, TextEncoder, TextDecoder, Uint8Array, DataView, atob, btoa,
    window: {}, document: { getElementById: () => null }, showConfirm: async () => true,
    LABEL_CAPABLE_TYPES: new Set(['rect', 'ellipse', 'labeler']),
    migrateObjectStyleMode: () => {}, DEFAULT_TEXT_FONT: 'sans-serif', DEFAULT_TEXT_SIZE_MM: 3,
    normalizeTextRuns: value => value.textRuns,
    textRunsToText: runs => runs.map(run => run.text).join(''),
  });
  vm.runInContext(strip(read('object-types')), ctx, { filename: 'object-types.js' });
  ctx.geometryCoverage = vm.runInContext(`OBJECT_TYPE_IDS.filter(type => !SIZE_TYPES.has(type)
    && !ENDPOINT_HANDLE_TYPES.has(type) && !POINT_ARRAY_TYPES.has(type)
    && !TEXT_MEASURED_TYPES.has(type) && type !== 'anglearc' && type !== 'rightangle')`, ctx);
  for (const name of ['store', 'page-history', 'document-history']) {
    vm.runInContext(strip(read(name)), ctx, { filename: `${name}.js` });
  }
  vm.runInContext(strip(read('project-io')), ctx, { filename: 'project-io.js' });
  vm.runInContext(strip(read('pages')), ctx, { filename: 'pages.js' });
  vm.runInContext(strip(read('transform').split('/* ===== MOVE GESTURE ===== */')[0]), ctx,
    { filename: 'transform-history.js' });
  return ctx;
}

async function testPageHistory() {
  const ctx = dataContext();
  const state = makeStore(ctx, [page('a', [line('a1', 5)]), page('b', [line('b1', 8)])]);
  state.get().undoStack.push([line('a1', 0)]);
  ctx.switchPage(state, 'b');
  state.get().undoStack.push([line('b1', 0)]);
  ctx.switchPage(state, 'a');

  await ctx.deletePage(state, 'a');
  ctx.undo(state);
  assert.equal(state.get().activePageId, 'a');
  assert.equal(state.get().undoStack.length, 1, 'restored active page keeps its edit history');
  ctx.undo(state);
  assert.equal(state.get().objects[0].p1.x, 0, 'restored active page edit remains undoable');
  ctx.redo(state);
  assert.equal(state.get().objects[0].p1.x, 5, 'restored active page edit remains redoable');

  ctx.switchPage(state, 'b');
  ctx.undo(state);
  assert.equal(state.get().objects[0].p1.x, 0, 'neighbor page history is not consumed');

  const inactive = makeStore(ctx, [page('a', [line('a2', 4)]), page('b', [line('b2', 7)])]);
  inactive.get().undoStack.push([line('a2', 0)]);
  ctx.switchPage(inactive, 'b');
  inactive.get().undoStack.push([line('b2', 0)]);
  await ctx.deletePage(inactive, 'a');
  ctx.undo(inactive);
  ctx.switchPage(inactive, 'a');
  ctx.undo(inactive);
  assert.equal(inactive.get().objects[0].p1.x, 0, 'inactive restored page keeps its history');
}

function testAtomicImport() {
  const ctx = dataContext();
  assert.deepEqual(clone(ctx.geometryCoverage), [], 'every registered object type has a geometry parser');
  const state = makeStore(ctx, [page('original', [line('safe', 3)])]);
  state.get().selectedIds = ['safe'];
  state.get().undoStack.push([line('safe', 0)]);
  const fixtures = [
    ['null endpoint', { ...line('bad-null'), p1: null }],
    ['null point', { id: 'bad-point', type: 'polyline', layerId: 1, points: [{ x: 0, y: 0 }, null] }],
    ['string coordinate', { ...line('bad-string'), p1: { x: '1', y: 0 } }],
    ['unknown type', { id: 'bad-type', type: 'not-a-real-object', layerId: 1, x: 0, y: 0 }],
  ];
  for (const [label, object] of fixtures) {
    const before = JSON.stringify(state.get());
    assert.throws(() => ctx.applyLoaded(state, {
      pages: [page('good'), page('inactive-corrupt', [object])], activePageId: 'good',
    }), undefined, label);
    assert.equal(JSON.stringify(state.get()), before, `${label} import is atomic`);
  }
}

function testPageContextGuard() {
  const ctx = dataContext();
  const state = makeStore(ctx, [page('a'), page('b')]);
  const a = state.capturePageContext();
  assert.equal(state.isPageContextCurrent(a), true);
  ctx.switchPage(state, 'b');
  ctx.switchPage(state, 'a');
  assert.equal(state.isPageContextCurrent(a), false, 'A -> B -> A invalidates stale async context');
  const current = state.capturePageContext();
  state.update(s => { s.objects = [...s.objects]; });
  assert.equal(state.isPageContextCurrent(current), true, 'same-page edits keep page identity current');
  const beforeReplacement = state.capturePageContext();
  state.update(s => { s.pages = s.pages.map(candidate => ({ ...candidate })); });
  assert.equal(state.isPageContextCurrent(beforeReplacement), false,
    'same page id in a replacement document invalidates stale async context');
}

class MemoryIndexedDB {
  constructor() {
    this.records = new Map();
    this.failOpen = false;
  }

  async databases() {
    return [...this.records.keys()].map(name => ({ name }));
  }

  open(name, version) {
    if (this.failOpen) throw new Error('forced IndexedDB open failure');
    const request = {};
    queueMicrotask(() => {
      let record = this.records.get(name);
      const oldVersion = record?.version || 0;
      if (!record) {
        record = { version, stores: new Map() };
        this.records.set(name, record);
      }
      const db = this.#database(record);
      request.result = db;
      if (version > oldVersion) {
        record.version = version;
        request.onupgradeneeded?.({ oldVersion, newVersion: version });
      }
      request.onsuccess?.();
    });
    return request;
  }

  #database(record) {
    return {
      objectStoreNames: { contains: name => record.stores.has(name) },
      createObjectStore: (name, options = {}) => {
        const store = { keyPath: options.keyPath, autoIncrement: options.autoIncrement, next: 1, rows: [] };
        record.stores.set(name, store);
        return store;
      },
      transaction: names => {
        const tx = { pending: 0, completed: false };
        const finish = () => {
          if (tx.pending || tx.completed) return;
          tx.completed = true;
          setImmediate(() => tx.oncomplete?.());
        };
        const request = (operation) => {
          const req = {};
          tx.pending += 1;
          queueMicrotask(() => {
            try { req.result = operation(); req.onsuccess?.(); }
            catch (error) { req.error = error; req.onerror?.(); tx.onerror?.(); }
            finally { tx.pending -= 1; finish(); }
          });
          return req;
        };
        tx.objectStore = name => {
          const store = record.stores.get(name);
          if (!store) throw new Error(`missing object store: ${name}`);
          return {
            add: value => request(() => {
              const row = clone(value);
              if (store.autoIncrement && row[store.keyPath] == null) row[store.keyPath] = store.next++;
              store.rows.push(row);
              return row[store.keyPath];
            }),
            getAll: () => request(() => clone(store.rows)),
            getAllKeys: () => request(() => store.rows.map(row => row[store.keyPath])),
            delete: key => request(() => {
              const index = store.rows.findIndex(row => row[store.keyPath] === key);
              if (index >= 0) store.rows.splice(index, 1);
            }),
            get: key => request(() => clone(store.rows.find(row => row[store.keyPath] === key))),
          };
        };
        setImmediate(finish);
        return tx;
      },
      close() {},
    };
  }
}

function autosaveContext(indexedDB) {
  const timers = new Map();
  let timerId = 0;
  const ctx = vm.createContext({
    console, JSON, Date, DOMException, indexedDB,
    serialize: state => state.project,
    migrate: value => value,
    applyLoaded: (state, project) => { state.project = clone(project); },
    captureProjectStatus: () => '', markProjectStatus: () => {},
    showAlert: async () => {}, showConfirm: async () => false,
    document: { visibilityState: 'visible', addEventListener() {} },
    window: { addEventListener() {} },
    setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(strip(read('autosave')), ctx, { filename: 'autosave.js' });
  return {
    ctx,
    async flush() {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach(callback => callback());
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

function project(label, x = 0) {
  return { version: '0.17', pages: [page(label, [line(label, x)])], activePageId: label };
}

function autosaveState(value) {
  return { project: value, get() { return this; }, subscribe(callback) { this.changed = callback; } };
}

async function testAutosaveServices() {
  const indexedDB = new MemoryIndexedDB();
  const first = autosaveContext(indexedDB);
  const a = autosaveState(project('A'));
  const checkpoint = await first.ctx.createRecoveryCheckpoint(a, { reason: 'mode-switch' });
  assert.equal(checkpoint.source, 'preview');
  assert.equal(checkpoint.label, 'A');
  assert.equal(checkpoint.pageCount, 1);

  const b = autosaveState(project('B', 1));
  await first.ctx.initAutosave(b);
  for (let x = 1; x <= 9; x += 1) {
    b.project = project('B', x);
    b.changed();
    await first.flush();
  }

  const reopened = autosaveContext(indexedDB);
  const checkpoints = await reopened.ctx.listRecoveryCheckpoints();
  assert.equal(checkpoints.length, 1, 'rolling autosaves never prune transition checkpoints');
  assert.equal(checkpoints[0].id, checkpoint.id);
  const blank = autosaveState(project('blank'));
  await reopened.ctx.restoreRecoveryCheckpoint(blank, checkpoints[0]);
  assert.deepEqual(blank.project, project('A'), 'checkpoint restores every serialized page field');

  const previewRecord = indexedDB.records.get('5e-preview-autosave');
  assert.equal(previewRecord.stores.get('snapshots').rows.length, 8);
  assert.equal(previewRecord.stores.get('checkpoints').rows.length, 1);
  assert.equal(indexedDB.records.has('5e-autosave'), false,
    'preview recovery does not create or write the stable/legacy database');

  const legacy = await new Promise((resolve, reject) => {
    const request = indexedDB.open('5e-autosave', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots', {
      keyPath: 'id', autoIncrement: true,
    });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const tx = legacy.transaction('snapshots', 'readwrite');
    tx.objectStore('snapshots').add({ ts: 1, data: project('legacy-A') });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  legacy.close();
  const legacyRecovery = await reopened.ctx.inspectLegacyRecovery();
  assert.equal(legacyRecovery.status, 'available');
  assert.equal(legacyRecovery.checkpoints.length, 1);
  const legacyTarget = autosaveState(project('legacy-blank'));
  await reopened.ctx.restoreRecoveryCheckpoint(legacyTarget, legacyRecovery.checkpoints[0]);
  assert.deepEqual(legacyTarget.project, project('legacy-A'));
  assert.equal(indexedDB.records.get('5e-autosave').stores.get('snapshots').rows.length, 1,
    'legacy recovery is read-only and non-destructive');
  assert.equal(previewRecord.stores.get('snapshots').rows.length, 8,
    'legacy recovery cannot affect preview pruning');

  indexedDB.failOpen = true;
  await assert.rejects(first.ctx.checkpointBeforeModeSwitch(a), /forced IndexedDB open failure/);
}

(async () => {
  const scenarios = [
    ['active/inactive page-history undo/redo', testPageHistory],
    ['atomic all-page object validation', testAtomicImport],
    ['A -> B -> A page context guard', testPageContextGuard],
    ['checkpoint A -> B nine saves -> reopen/list/restore A and failure rejection', testAutosaveServices],
  ];
  const results = [];
  for (const [name, run] of scenarios) {
    try {
      await run();
      results.push({ name, passed: true });
    } catch (error) {
      results.push({ name, passed: false, error: error.stack || String(error) });
    }
  }
  console.log(JSON.stringify({ passed: results.every(result => result.passed), results }, null, 2));
  if (results.some(result => !result.passed)) process.exitCode = 1;
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

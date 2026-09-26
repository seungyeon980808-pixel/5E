import { createStore } from '../preview/js/store.js';
import {
  checkpointBeforeModeSwitch, createRecoveryCheckpoint, initAutosave,
  inspectLegacyRecovery, listRecoveryCheckpoints, restoreRecoveryCheckpoint,
} from '../preview/js/autosave.js';
import { applyLoaded, migrate, serialize } from '../preview/js/project-io.js';
import { deletePage, switchPage } from '../preview/js/pages.js';
import { redo, undo } from '../preview/js/transform.js';

const result = document.getElementById('result');
const clone = value => JSON.parse(JSON.stringify(value));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const equal = (actual, expected, message) => {
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    `${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
};

function line(id, x = 0) {
  return { id, type: 'line', layerId: 1, p1: { x, y: 0 }, p2: { x: x + 10, y: 10 } };
}

function page(id, objects = [], guides = []) {
  return {
    id, name: id, meta: { number: '', points: '' }, objects, guides,
    layers: [{ id: 1, name: '레이어 1', visible: true }], artboard: { w: 90, h: 60 },
  };
}

function project(pages, activePageId = pages[0].id) {
  return { version: '0.17', pages, activePageId };
}

function stateFor(data) {
  const active = data.pages.find(candidate => candidate.id === data.activePageId);
  return createStore({
    pages: clone(data.pages), activePageId: data.activePageId,
    objects: clone(active.objects), guides: clone(active.guides),
    layers: clone(active.layers), artboard: clone(active.artboard), groups: [],
    undoStack: [], redoStack: [], selectedIds: [], selectedGuideId: null,
    activeLayerId: 1, targetedId: null, draft: null, draftText: null,
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function openDatabase(name, stores) {
  const request = indexedDB.open(name, 1);
  request.onupgradeneeded = () => {
    for (const store of stores) {
      if (!request.result.objectStoreNames.contains(store)) {
        request.result.createObjectStore(store, { keyPath: 'id', autoIncrement: true });
      }
    }
  };
  return requestResult(request);
}

async function storeRows(database, store) {
  return requestResult(database.transaction(store, 'readonly').objectStore(store).getAll());
}

async function addRow(database, store, value) {
  const tx = database.transaction(store, 'readwrite');
  tx.objectStore(store).add(value);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function resetDatabase(name) {
  await requestResult(indexedDB.deleteDatabase(name));
}

async function confirmDelete(state, pageId) {
  const pending = deletePage(state, pageId);
  await new Promise(resolve => setTimeout(resolve));
  document.querySelector('.modal-btn-primary')?.click();
  await pending;
}

async function run() {
  await resetDatabase('5e-preview-autosave');
  await resetDatabase('5e-autosave');

  const image = { id: 'image-a', type: 'image', layerId: 1, x: 2, y: 3, w: 20, h: 10,
    src: 'data:image/png;base64,iVBORw0KGgo=', opacity: 1 };
  const sourceA = project([
    page('A1', [line('line-a'), image], [{ id: 'guide-a', axis: 'x', position: 4 }]),
    page('A2', [line('line-a2', 6)], [{ id: 'guide-a2', axis: 'y', position: 7 }]),
  ], 'A1');
  const stateA = stateFor(sourceA);
  const checkpoint = await createRecoveryCheckpoint(stateA, { reason: 'mode-switch' });

  const stateB = stateFor(project([page('B', [line('line-b', 1)])], 'B'));
  await initAutosave(stateB);
  for (let x = 1; x <= 9; x += 1) {
    stateB.update(state => { state.objects[0].p1.x = x; });
    window.dispatchEvent(new Event('pagehide'));
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  await new Promise(resolve => setTimeout(resolve, 250));

  const checkpoints = await listRecoveryCheckpoints({ includeLegacy: false });
  assert(checkpoints.some(candidate => candidate.id === checkpoint.id),
    'transition checkpoint survives nine rolling autosaves');
  const restored = stateFor(project([page('blank')], 'blank'));
  await restoreRecoveryCheckpoint(restored, checkpoint);
  equal(serialize(restored.get()), migrate(sourceA), 'all A pages/objects/images/guides restore');

  const previewDb = await openDatabase('5e-preview-autosave', []);
  const previewAutosaves = await storeRows(previewDb, 'snapshots');
  const previewCheckpoints = await storeRows(previewDb, 'checkpoints');
  previewDb.close();
  assert(previewAutosaves.length === 8, 'preview autosaves prune to eight');
  assert(previewCheckpoints.length === 1, 'checkpoint store is independent from pruning');

  const stableDb = await openDatabase('5e-autosave', ['snapshots']);
  await addRow(stableDb, 'snapshots', { ts: 1, data: project([page('legacy')], 'legacy') });
  stableDb.close();
  const legacy = await inspectLegacyRecovery();
  assert(legacy.status === 'available' && legacy.checkpoints.length === 1,
    'legacy recovery is explicitly discoverable');
  const stableReadback = await openDatabase('5e-autosave', []);
  assert((await storeRows(stableReadback, 'snapshots')).length === 1,
    'legacy recovery discovery is non-destructive');
  stableReadback.close();

  const originalOpen = indexedDB.open.bind(indexedDB);
  indexedDB.open = () => { throw new Error('forced checkpoint failure'); };
  let checkpointError = '';
  try { await checkpointBeforeModeSwitch(stateA); }
  catch (error) { checkpointError = error.message; }
  indexedDB.open = originalOpen;
  assert(checkpointError === 'forced checkpoint failure', 'checkpoint failure rejects to caller');

  const importState = stateFor(project([page('original', [line('safe', 3)])], 'original'));
  importState.get().selectedIds = ['safe'];
  importState.get().undoStack.push([line('safe', 0)]);
  const importBefore = JSON.stringify(importState.get());
  let importError = '';
  try {
    applyLoaded(importState, project([
      page('good'), page('inactive-bad', [{ ...line('bad'), p1: null }]),
    ], 'good'));
  } catch (error) { importError = error.message; }
  assert(importError.includes('끝점'), 'inactive corrupt page rejects before apply');
  assert(JSON.stringify(importState.get()) === importBefore, 'corrupt import leaves state byte-identical');

  const history = stateFor(project([page('a', [line('a1', 5)]), page('b', [line('b1', 8)])], 'a'));
  history.get().undoStack.push([line('a1', 0)]);
  switchPage(history, 'b');
  history.get().undoStack.push([line('b1', 0)]);
  switchPage(history, 'a');
  await confirmDelete(history, 'a');
  undo(history);
  undo(history);
  assert(history.get().objects[0].p1.x === 0, 'active deleted page edit remains undoable');
  redo(history);
  switchPage(history, 'b');
  undo(history);
  assert(history.get().objects[0].p1.x === 0, 'neighbor page edit history remains independent');

  const report = {
    passed: true,
    checkpoint,
    checkpointCount: checkpoints.length,
    previewAutosaves: previewAutosaves.length,
    previewCheckpoints: previewCheckpoints.length,
    legacyStatus: legacy.status,
    checkpointError,
    importError,
    pageHistory: 'active and inactive stacks preserved',
  };
  const reportText = JSON.stringify(report, null, 2);
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#111827';
  context.font = '24px monospace';
  reportText.split('\n').forEach((lineText, index) => context.fillText(lineText, 36, 50 + index * 30));
  const screenshot = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const [reportResponse, screenshotResponse] = await Promise.all([
    fetch('/__task4_report', { method: 'POST', body: `${reportText}\n` }),
    fetch('/__task4_screenshot', { method: 'POST', body: screenshot }),
  ]);
  assert(reportResponse.ok && screenshotResponse.ok, 'browser evidence persisted');
  result.dataset.status = 'passed';
  result.textContent = reportText;
  document.title = 'PASS Task 4 data contracts';
  window.task4Report = report;
}

run().catch(error => {
  result.dataset.status = 'failed';
  result.textContent = error.stack || String(error);
  document.title = 'FAIL Task 4 data contracts';
  window.task4Error = error;
});

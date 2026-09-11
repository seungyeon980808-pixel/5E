const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
function load() {
  const sandbox = { console, showConfirm: async () => true,
    rebuildGroups(s) { s.groups = s.objects.filter(o => o.groupId).map(o => ({ id: o.groupId, memberIds: [o.id] })); } };
  const helper = path.join(root, 'js/page-history.js');
  let source = fs.existsSync(helper) ? fs.readFileSync(helper, 'utf8') : '';
  source += '\n' + fs.readFileSync(path.join(root, 'js/pages.js'), 'utf8');
  source = source.replace(/^import\s+[\s\S]*?;\r?\n/gm, '').replace(/\bexport\s+/g, '');
  source += '\n globalThis.api = {switchPage, deletePage};';
  vm.runInNewContext(source, sandbox);
  return { ...sandbox.api, sandbox };
}
function makeState() {
  const pages = ['a', 'b'].map(id => ({ id, name: id, objects: [{ id: id + '-object', groupId: id + '-group' }], guides: [{ id: id + '-guide' }], layers: [{ id: 1 }, { id: 2 }], artboard: { w: 100, h: 80 } }));
  const s = { pages, activePageId: 'a', ...Object.fromEntries(['objects', 'guides', 'layers', 'artboard'].map(key => [key, pages[0][key]])), undoStack: [[{ id: 'before' }]], redoStack: [], selectedIds: ['a-object'], selectedGuideId: 'a-guide', activeLayerId: 2 };
  return { get: () => s, update(fn) { fn(s); } };
}
test('page switching preserves separate undo, redo, layer and selection state', () => {
  const api = load(), state = makeState(), s = state.get();
  const undo = s.undoStack, redo = s.redoStack;
  api.switchPage(state, 'b');
  assert.equal(s.undoStack.length, 0);
  s.undoStack.push([{ id: 'b-before' }]);
  api.switchPage(state, 'a');
  assert.equal(s.undoStack, undo); assert.equal(s.redoStack, redo);
  assert.deepEqual(Array.from(s.selectedIds), ['a-object']);
  assert.equal(s.selectedGuideId, 'a-guide'); assert.equal(s.activeLayerId, 2);
  api.switchPage(state, 'b'); assert.equal(s.undoStack.length, 1);
});
test('page deletion records reversible recovery without adding runtime fields to pages', async () => {
  const api = load(), state = makeState(), s = state.get();
  const removed = s.pages[0];
  await api.deletePage(state, 'a');
  assert.equal(s.activePageId, 'b');
  const entry = s.undoStack.at(-1);
  assert.equal(entry?.kind, 'page-presence');
  api.sandbox.entry = entry; api.sandbox.stateValue = s;
  vm.runInNewContext('globalThis.inverse = inversePageHistoryEntry(stateValue, entry); restorePageHistoryEntry(stateValue, entry)', api.sandbox);
  assert.equal(s.pages[0], removed); assert.equal(s.pages.length, 2);
  api.switchPage(state, 'a'); assert.equal(s.undoStack.length, 1);
  api.switchPage(state, 'b');
  vm.runInNewContext('restorePageHistoryEntry(stateValue, inverse)', api.sandbox);
  assert.equal(s.pages.length, 1);
  assert.equal(Object.keys(removed).includes('undoStack'), false);
});
test('a different project reusing page IDs cannot inherit runtime history', () => {
  const api = load(), first = makeState();
  api.switchPage(first, 'b');
  const second = makeState(); second.get().undoStack = [];
  api.switchPage(second, 'b'); api.switchPage(second, 'a');
  assert.equal(second.get().undoStack.length, 0);
});
test('deleting inactive page preserves current edits and refuses to delete final page', async () => {
  const api = load(), state = makeState(), s = state.get();
  const objects = s.objects, guides = s.guides, layers = s.layers;
  await api.deletePage(state, 'b');
  assert.equal(s.activePageId, 'a');
  assert.equal(s.objects, objects); assert.equal(s.guides, guides); assert.equal(s.layers, layers);
  assert.equal(s.undoStack.length, 2);
  await api.deletePage(state, 'a'); assert.equal(s.pages.length, 1);
});
test('restored page retains objects, guides, layers and relationship IDs', async () => {
  const api = load(), state = makeState(), s = state.get();
  s.objects.push({ id: 'function', planeId: 'a-object', groupId: 'a-group' });
  const original = JSON.stringify(s.pages[0]);
  await api.deletePage(state, 'a');
  api.sandbox.entry = s.undoStack.at(-1); api.sandbox.stateValue = s;
  vm.runInNewContext('restorePageHistoryEntry(stateValue, entry)', api.sandbox);
  assert.equal(JSON.stringify(s.pages[0]), original);
  api.switchPage(state, 'a');
  assert.equal(s.objects[1].planeId, 'a-object');
  assert.equal(s.guides[0].id, 'a-guide');
});
test('editing a restored page invalidates its pending deletion redo', async () => {
  const api = load(), state = makeState(), s = state.get();
  await api.deletePage(state, 'a');
  api.sandbox.entry = s.undoStack.pop(); api.sandbox.stateValue = s;
  vm.runInNewContext('globalThis.inverse = inversePageHistoryEntry(stateValue, entry); restorePageHistoryEntry(stateValue, entry)', api.sandbox);
  s.redoStack.push(api.sandbox.inverse);
  api.switchPage(state, 'a'); s.objects.push({ id: 'new-work' });
  api.switchPage(state, 'b');
  assert.equal(s.redoStack.length, 0);
  vm.runInNewContext('globalThis.applied = restorePageHistoryEntry(stateValue, inverse)', api.sandbox);
  assert.equal(api.sandbox.applied, false);
  assert.equal(s.pages.length, 2);
  assert.equal(s.pages[0].objects.at(-1).id, 'new-work');
});
test('visiting a restored page without editing retains deletion redo', async () => {
  const api = load(), state = makeState(), s = state.get();
  await api.deletePage(state, 'a');
  api.sandbox.entry = s.undoStack.pop(); api.sandbox.stateValue = s;
  vm.runInNewContext('globalThis.inverse = inversePageHistoryEntry(stateValue, entry); restorePageHistoryEntry(stateValue, entry)', api.sandbox);
  s.redoStack.push(api.sandbox.inverse);
  api.switchPage(state, 'a'); api.switchPage(state, 'b');
  assert.equal(s.redoStack.length, 1);
});

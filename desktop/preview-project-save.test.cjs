const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'preview/js/project-io.js'), 'utf8');
const saveCode = source.slice(source.indexOf('export async function saveProject('), source.indexOf('/* ----- defaultLayers')).replace('export ', '');
function harness({ filename = '테스트.5e', picker, native, target, projectWriter } = {}) {
  const calls = { downloads: [], marks: [], alerts: [], writes: [], targets: [] };
  const state = { get: () => ({ pages: [{ id: 'a', name: '페이지 1', objects: [] }] }) };
  const context = vm.createContext({
    window: { showSaveFilePicker: picker, fiveEDesktop: native ? { project: { save: native } } : undefined },
    chooseProjectSaveTarget: async () => {
      calls.targets.push(true);
      return target ?? (filename ? { kind: 'download', filename } : { kind: 'cancelled' });
    },
    FS_DIR_SUPPORTED: false,
    loadSavedProjectDir: async () => null,
    currentProjectDirName: () => '',
    pickProjectDir: async () => null,
    writeProjectToDir: async (...args) => {
      calls.writes.push(args);
      return projectWriter ? projectWriter(...args) : false;
    },
    timestampProjectFilename: () => '20260921_0324.5e',
    captureProjectStatus: () => 'snapshot', serialize: value => value,
    markProjectStatus: (...args) => calls.marks.push(args),
    showAlert: async message => calls.alerts.push(message),
    document: { body: { appendChild() {} }, createElement: () => ({ click() { calls.downloads.push(this.download); }, remove() {} }) },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }, Blob, setTimeout() {},
  });
  vm.runInContext('const projectNames = new WeakMap(); let savingProject = false;\n' + saveCode, context);
  return { calls, save: () => context.saveProject(state) };
}
test('filename dialog cancellation creates no file', async () => {
  const { save, calls } = harness({ filename: null });
  assert.equal((await save()).kind, 'cancelled');
  assert.equal(calls.downloads.length, 0);
  assert.equal(calls.marks.length, 0);
});
test('browser download uses the confirmed filename', async () => {
  const { save, calls } = harness();
  assert.equal((await save()).kind, 'download-requested');
  assert.deepEqual(calls.downloads, ['테스트.5e']);
  assert.equal(calls.marks[0][2], 'download');
});
test('picker failure cannot silently download or claim save success', async () => {
  const { save, calls } = harness({ picker: async () => { throw new Error('permission denied'); } });
  assert.equal((await save()).kind, 'failed');
  assert.equal(calls.downloads.length, 0);
  assert.equal(calls.marks.length, 0);
  assert.equal(calls.alerts.length, 1);
});
test('picker cancellation creates no download or error', async () => {
  const { save, calls } = harness({ picker: async () => { const e = new Error(); e.name = 'AbortError'; throw e; } });
  assert.equal((await save()).kind, 'cancelled');
  assert.equal(calls.downloads.length + calls.alerts.length, 0);
});
test('native picker writes full document before marking saved', async () => {
  let written, suggestedName, closed = false;
  const { save, calls } = harness({ picker: async options => {
    suggestedName = options.suggestedName;
    return { name: '다른 이름.5e', createWritable: async () => ({ write: async blob => { written = JSON.parse(await blob.text()); }, close: async () => { closed = true; } }) };
  } });
  assert.equal((await save()).kind, 'saved');
  assert.equal(suggestedName, '20260921_0324.5e');
  assert.equal(calls.targets.length, 0);
  assert.equal(written.pages[0].id, 'a');
  assert.equal(closed, true);
  assert.equal(calls.marks[0][2], 'file');
});
test('filename normalization preserves Korean and prevents path injection', () => {
  const code = fs.readFileSync(path.join(root, 'preview/js/project-save-dialog.js'), 'utf8');
  const fn = code.slice(code.indexOf('export function projectFilename'), code.indexOf('export async function chooseProjectFilename')).replaceAll('export ', '');
  const context = vm.createContext({}); vm.runInContext(fn, context);
  assert.equal(context.timestampProjectFilename(new Date(2026, 0, 2, 3, 4)), '20260102_0304.5e');
  assert.equal(context.projectFilename(' 물리 프로젝트.5e '), '물리 프로젝트.5e');
  assert.equal(context.projectFilename('물리 프로젝트.5e.5e'), '물리 프로젝트.5e');
  assert.equal(context.projectFilename('../../test.json'), '.._.._test.5e');
  assert.equal(context.projectFilename('  '), '새 프로젝트.5e');
});
test('serialization retains active edits and inactive pages with guides layers and images', () => {
  const code = source.slice(source.indexOf('export function serialize('), source.indexOf('/* Native Save As')).replace('export ', '');
  const context = vm.createContext({ SCHEMA_VERSION: '0.17' }); vm.runInContext(code, context);
  const activeImage = { id: 'image', type: 'image', src: 'data:image/png;base64,x' };
  const guides = [{ axis: 'x', position: 12 }], layers = [{ id: 1, name: '레이어 1', visible: true }];
  const state = { pages: [{ id: 'a', name: '첫 장', objects: [], guides: [], layers, artboard: { w: 90, h: 60 } }, { id: 'b', name: '둘째 장', objects: [{ id: 'other' }], guides, layers, artboard: { w: 80, h: 50 } }], activePageId: 'a', objects: [activeImage], guides, layers, artboard: { w: 95, h: 50 } };
  const saved = JSON.parse(JSON.stringify(context.serialize(state)));
  assert.deepEqual(saved.pages[0].objects, [activeImage]);
  assert.deepEqual(saved.pages[0].guides, guides);
  assert.deepEqual(saved.pages[0].layers, layers);
  assert.deepEqual(saved.pages[0].artboard, state.artboard);
  assert.equal(saved.pages[1].objects[0].id, 'other');
  assert.equal(saved.activePageId, 'a');
});
test('workflow shortcuts do not consume browser new-tab or location shortcuts', () => {
  const code = fs.readFileSync(path.join(root, 'preview/js/settings-shortcuts.js'), 'utf8').replace(/^import .*\n/, '').replaceAll('export ', '');
  let onKey; const clicks = [];
  const context = vm.createContext({ IS_MAC: false, keyLabel: value => value, modKey: event => event.ctrlKey,
    shortcutKey: event => event.key, blocksCanvasShortcut: event => event.editing,
    window: { addEventListener() {} }, document: { getElementById: id => null, addEventListener: (type, cb) => { onKey = cb; } },
  });
  vm.runInContext(code + '\ninitSettingsShortcuts();', context);
  context.document.getElementById = id => ({ click: () => clicks.push(id) });
  const event = (key, extra = {}) => ({ key, ctrlKey: true, altKey: false, shiftKey: false, preventDefault() { this.prevented = true; }, ...extra });
  onKey(event('t')); onKey(event('l')); assert.deepEqual(clicks, []);
  onKey(event('t', { altKey: true, shiftKey: true }));
  onKey(event('l', { altKey: true, shiftKey: true }));
  onKey(event('a', { altKey: true, shiftKey: true }));
  assert.deepEqual(clicks, ['image-objectify-open', 'exam-library-open', 'ai-image-install-open']);
  onKey(event('k', { altKey: true, shiftKey: true, editing: true })); assert.equal(clicks.length, 3);
});

test('native picker is invoked synchronously before yielding user activation', async () => {
  let invoked = false;
  const { save, calls } = harness({ picker: () => { invoked = true; const error = new Error(); error.name = 'AbortError'; return Promise.reject(error); } });
  const pending = save();
  assert.equal(invoked, true);
  assert.equal(calls.targets.length, 0);
  await pending;
});
test('write failure does not mark saved or download', async () => {
  const { save, calls } = harness({ picker: async () => ({ createWritable: async () => ({ write: async () => { throw new Error('disk full'); } }) }) });
  assert.equal((await save()).kind, 'failed');
  assert.equal(calls.downloads.length + calls.marks.length, 0);
  assert.equal(calls.alerts.length, 1);
});
test('desktop bridge gets timestamp without a web name prompt', async () => {
  let payload;
  const { save, calls } = harness({ native: async value => { payload = value; return { kind: 'cancelled' }; } });
  assert.equal((await save()).kind, 'cancelled');
  assert.equal(payload.suggestedName, '20260921_0324.5e');
  assert.equal(calls.targets.length, 0);
  assert.equal(calls.downloads.length + calls.marks.length, 0);
});

test('connected project folder writes before marking saved', async () => {
  let saved;
  const { save, calls } = harness({
    target: { kind: 'directory', filename: '물리.5e' },
    projectWriter: async (filename, blob) => {
      saved = { filename, document: JSON.parse(await blob.text()) };
      return true;
    },
  });
  assert.equal((await save()).kind, 'saved');
  assert.equal(saved.filename, '물리.5e');
  assert.equal(saved.document.pages[0].id, 'a');
  assert.equal(calls.downloads.length, 0);
  assert.equal(calls.marks[0][2], 'file');
});

test('project folder write failure cannot claim saved or download', async () => {
  const { save, calls } = harness({
    target: { kind: 'directory', filename: '물리.5e' },
    projectWriter: async () => false,
  });
  assert.equal((await save()).kind, 'failed');
  assert.equal(calls.downloads.length + calls.marks.length, 0);
  assert.equal(calls.alerts.length, 1);
});

test('project folder dialog cancellation has no file side effect', async () => {
  const { save, calls } = harness({ target: { kind: 'cancelled' } });
  assert.equal((await save()).kind, 'cancelled');
  assert.equal(calls.downloads.length + calls.marks.length + calls.writes.length, 0);
});

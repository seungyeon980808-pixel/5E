const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'preview/js/export-dir.js'), 'utf8')
  .replace(/^import .*\n/m, '')
  .replace(/^export /gm, '');

function harness({ stored = {}, picker = async () => null } = {}) {
  const calls = { gets: [], sets: [], deletes: [], picker: [], writes: [] };
  const context = vm.createContext({
    window: { showDirectoryPicker: async options => { calls.picker.push(options); return picker(options); } },
    idbAvailable: () => true,
    idbGet: async key => { calls.gets.push(key); return stored[key]; },
    idbSet: async (key, value) => { calls.sets.push([key, value]); },
    idbDel: async key => { calls.deletes.push(key); },
  });
  vm.runInContext(`${source}\nglobalThis.api = { loadSavedDir, currentDirName, pickDir, clearDir, writeToDir, loadSavedProjectDir, currentProjectDirName, pickProjectDir, clearProjectDir, writeProjectToDir };`, context);
  return { api: context.api, calls };
}

test('project and image folders use separate persisted keys', async () => {
  const exportHandle = { name: '이미지', queryPermission: async () => 'granted' };
  const projectHandle = { name: '프로젝트', queryPermission: async () => 'granted' };
  const { api, calls } = harness({ stored: { 'export-dir-handle': exportHandle, 'project-dir-handle': projectHandle } });
  await api.loadSavedDir();
  await api.loadSavedProjectDir();
  assert.deepEqual(calls.gets, ['export-dir-handle', 'project-dir-handle']);
  assert.equal(api.currentDirName(), '이미지');
  assert.equal(api.currentProjectDirName(), '프로젝트');
});

test('project folder picker and writer use the project capability and close before success', async () => {
  let closed = false;
  const handle = {
    name: '프로젝트',
    queryPermission: async () => 'granted',
    getFileHandle: async (filename, options) => ({
      createWritable: async () => ({
        write: async blob => { calls.writes.push([filename, options, blob]); },
        close: async () => { closed = true; },
      }),
    }),
  };
  const { api, calls } = harness({ picker: async () => handle });
  await api.pickProjectDir();
  assert.deepEqual(JSON.parse(JSON.stringify(calls.picker)), [{ id: '5e-project', mode: 'readwrite' }]);
  assert.equal(calls.sets[0][0], 'project-dir-handle');
  assert.equal(await api.writeProjectToDir('물리.5e', 'document'), true);
  assert.equal(calls.writes[0][0], '물리.5e');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.writes[0][1])), { create: true });
  assert.equal(closed, true);
});

test('project writer reports false when permission is refused', async () => {
  const { api } = harness({ stored: { 'project-dir-handle': { name: '프로젝트', queryPermission: async () => 'denied', requestPermission: async () => 'denied' } } });
  assert.equal(await api.writeProjectToDir('물리.5e', 'document'), false);
});

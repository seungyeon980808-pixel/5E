const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const modules = import('../js/ai-task-workspaces.js?v=1.7.0-four-session-integration');
const panelSource = fs.readFileSync(require.resolve('../js/ai-panel.js'), 'utf8');
const gate = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const workspace = id => ({ key: 'workspace', tabs: [{ id: 'task', attachments: [], generated: [{ id, data: id }], selectedCandidateId: id }], activeTaskTabId: 'task', taskTabSerial: 1, imageSerial: 1 });
function actualHandler(name) {
  const start = panelSource.indexOf(`    ${name}: async (snapshot, mode) => {`);
  assert.notEqual(start, -1);
  const end = panelSource.indexOf('\n    },', start) + '\n    }'.length;
  assert.ok(end > start);
  return panelSource.slice(start, end);
}

for (const name of ['importSharingSnapshot', 'importTaskSnapshot']) {
  test(`${name}: armed old timer and newly scheduled capture cannot overwrite replacement`, async () => {
    const { createTaskPersistence, recoverTaskWorkspaceSnapshot } = await modules;
    const entered = gate(), release = gate(), writes = [], warnings = [];
    let timer, stored, captures = 0;
    const old = workspace('old'), replacement = workspace('new');
    const sandbox = {
      graphOwnerEpoch: 0, workspaceReady: Promise.resolve(), recoverTaskWorkspaceSnapshot,
      taskTabs: new Map([['task', old.tabs[0]]]), taskViews: new Map(),
      taskTabSerial: 1, imageSerial: 1, activeTaskTabId: 'task', panel: { dataset: {} },
      restoreTaskTab() {}, renderTaskTabs() {},
      taskStore: { async put(value) {
        if (!writes.length) { entered.resolve(); await release.promise; }
        stored = structuredClone(value); writes.push(stored.tabs[0].generated[0].id);
      } },
    };
    const persistence = createTaskPersistence({
      store: sandbox.taskStore, capture() { captures++; },
      snapshot: () => ({ ...old, tabs: [...sandbox.taskTabs.values()] }),
      warn: error => warnings.push(error), setTimer(fn) { timer = fn; return 0; }, clearTimer() { timer = null; },
    });
    sandbox.taskPersistence = persistence;
    const controller = vm.runInNewContext(`({${actualHandler(name)}})`, sandbox);
    persistence.schedule(); const canceledCallback = timer;
    const imported = controller[name](replacement, null);
    await entered.promise;
    assert.equal(timer, null, 'replacement cancels the armed timer, including timer ID zero');
    canceledCallback();
    assert.equal(captures, 0, 'an already dispatched canceled callback is inert');
    persistence.schedule(); timer();
    assert.equal(captures, 0, 'new capture waits for replacement and controller install');
    assert.equal(sandbox.taskTabs.get('task').generated[0].id, 'old');
    release.resolve(); await imported; await persistence.settled();
    assert.deepEqual(writes, ['new', 'new']);
    assert.equal(stored.tabs[0].generated[0].id, 'new');
    assert.equal(sandbox.taskTabs.get('task').generated[0].id, 'new');
    assert.equal(captures, 1);
    assert.deepEqual(warnings, []);
    persistence.dispose();
  });
}

test('already started checkpoint commits before replacement and a required concurrent checkpoint captures the new owner', async () => {
  const { createTaskPersistence } = await modules;
  const entered = gate(), release = gate(), writes = [];
  let current = workspace('old');
  const persistence = createTaskPersistence({ capture() {}, snapshot: () => current, warn(error) { throw error; },
    store: { async put(value) {
      const id = value.tabs[0].generated[0].id;
      if (id === 'old') { entered.resolve(); await release.promise; }
      writes.push(id);
    } },
  });
  const previous = persistence.checkpoint(); await entered.promise;
  const replacement = workspace('new');
  const imported = persistence.replace(replacement, () => { current = replacement; });
  const next = persistence.checkpoint();
  release.resolve(); await Promise.all([previous, imported, next]);
  assert.deepEqual(writes, ['old', 'new', 'new']);
  assert.equal(current.tabs[0].generated[0].id, 'new');
  persistence.dispose();
});

test('replacement storage failure rejects without installing state, and a later valid replacement still commits', async () => {
  const { createTaskPersistence } = await modules;
  let current = workspace('old'), fail = true, stored;
  const warnings = [];
  const persistence = createTaskPersistence({ capture() {}, snapshot: () => current, warn: error => warnings.push(error.message),
    store: { async put(value) { if (fail) throw new Error('quota exceeded'); stored = structuredClone(value); } },
  });
  await assert.rejects(persistence.replace(workspace('bad'), () => { current = workspace('bad'); }), /quota exceeded/);
  assert.equal(current.tabs[0].generated[0].id, 'old');
  assert.equal(stored, undefined);
  fail = false;
  await persistence.replace(workspace('new'), () => { current = workspace('new'); });
  await persistence.checkpoint();
  assert.equal(stored.tabs[0].generated[0].id, 'new');
  assert.deepEqual(warnings, ['quota exceeded']);
  persistence.dispose();
});

test('surviving inactive owner completion remains persisted after a replacement', async () => {
  const { createTaskPersistence } = await modules;
  let current = workspace('old'), stored;
  const persistence = createTaskPersistence({ capture() {}, snapshot: () => current, warn(error) { throw error; },
    store: { async put(value) { stored = structuredClone(value); } },
  });
  const replacement = workspace('new');
  replacement.tabs.push({ id: 'inactive', attachments: [], generated: [{ id: 'pending', data: 'pending' }] });
  await persistence.replace(replacement, () => { current = replacement; });
  current.tabs[1].generated.push({ id: 'completed', data: 'complete-native-candidate' });
  await persistence.checkpoint();
  assert.equal(stored.tabs[0].generated[0].id, 'new');
  assert.deepEqual(stored.tabs[1].generated.map(item => item.id), ['pending', 'completed']);
  persistence.dispose();
});

test('dispose invalidates an already dispatched debounce callback without a write', async () => {
  const { createTaskPersistence } = await modules;
  let callback, writes = 0;
  const persistence = createTaskPersistence({ capture() { assert.fail('disposed capture'); }, snapshot: () => workspace('old'),
    store: { put() { writes++; } }, warn(error) { throw error; }, setTimer(fn) { callback = fn; return 1; }, clearTimer() {},
  });
  persistence.schedule(); persistence.dispose(); callback(); await persistence.settled();
  assert.equal(writes, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskPersistence, recoverTaskWorkspaceSnapshot } from '../js/ai-task-workspaces.js';

class FakeClock {
  constructor() { this.nextId = 1; this.timers = new Map(); }
  setTimeout = (callback) => {
    const id = this.nextId++;
    this.timers.set(id, callback);
    return id;
  };
  clearTimeout = (id) => this.timers.delete(id);
  fire() {
    const pending = [...this.timers.values()];
    this.timers.clear();
    for (const callback of pending) callback();
  }
}

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
};

test('pending task changes flush immediately when the page is hidden', async () => {
  const clock = new FakeClock();
  const writes = [];
  let value = { activeTaskTabId: 'task-a', tabs: [{ id: 'task-a', input: 'latest comment' }] };
  const persistence = createTaskPersistence({
    store: { put: async snapshot => writes.push(snapshot) },
    capture: () => {},
    snapshot: () => value,
    warn: () => assert.fail('storage should stay available'),
    setTimer: clock.setTimeout,
    clearTimer: clock.clearTimeout,
  });

  persistence.schedule();
  assert.equal(writes.length, 0, 'the ordinary debounce should still defer the write');
  await persistence.flush();
  assert.equal(writes.length, 1, 'page lifecycle flush must start the pending IndexedDB write');
  assert.deepEqual(writes[0], value);
});

test('slow writes are serialized and keep immutable task, image, version, and comment snapshots', async () => {
  const clock = new FakeClock();
  const first = deferred();
  const writes = [];
  let value = {
    activeTaskTabId: 'task-a',
    tabs: [{ id: 'task-a', generated: [{ id: 'v1', data: 'png-a', comments: [{ number: 1, text: 'old' }] }] }],
  };
  const persistence = createTaskPersistence({
    store: { put: snapshot => { writes.push(snapshot); return writes.length === 1 ? first.promise : Promise.resolve(); } },
    capture: () => {},
    snapshot: () => value,
    warn: () => assert.fail('storage should stay available'),
    setTimer: clock.setTimeout,
    clearTimer: clock.clearTimeout,
  });

  persistence.schedule();
  clock.fire();
  await Promise.resolve();
  assert.equal(writes.length, 1);

  value.tabs[0].generated[0].comments[0].text = 'mutated after capture';
  value = {
    activeTaskTabId: 'task-b',
    tabs: [
      { id: 'task-a', generated: [{ id: 'v1', data: 'png-a', comments: [{ number: 1, text: 'old' }] }] },
      { id: 'task-b', generated: [{ id: 'v2', data: 'png-b', comments: [{ number: 2, text: 'new' }] }] },
    ],
  };
  persistence.schedule();
  clock.fire();
  await Promise.resolve();
  assert.equal(writes.length, 1, 'a second backend write must wait for the first one');
  assert.equal(writes[0].tabs[0].generated[0].comments[0].text, 'old');

  first.resolve();
  await persistence.settled();
  assert.equal(writes.length, 2);
  assert.equal(writes[1].activeTaskTabId, 'task-b');
  assert.deepEqual(writes[1].tabs.map(tab => tab.generated[0].data), ['png-a', 'png-b']);
});

test('a required checkpoint waits for an older write before committing its exact latest snapshot', async () => {
  const clock = new FakeClock();
  const first = deferred();
  const writes = [];
  let value = { key: 'workspace', tabs: [{ id: 'task-a', workState: 'idle' }] };
  const persistence = createTaskPersistence({
    store: { put: snapshot => { writes.push(snapshot); return writes.length === 1 ? first.promise : Promise.resolve(); } },
    capture: () => {},
    snapshot: () => value,
    warn: () => assert.fail('storage should stay available'),
    setTimer: clock.setTimeout,
    clearTimer: clock.clearTimeout,
  });

  persistence.schedule();
  clock.fire();
  await Promise.resolve();
  value = { key: 'workspace', tabs: [{ id: 'task-a', workState: 'busy', inFlightRequest: { type: 'chat' } }] };
  const checkpoint = persistence.checkpoint();
  await Promise.resolve();
  assert.equal(writes.length, 1, 'the checkpoint must remain behind the earlier store transaction');

  first.resolve();
  assert.equal(await checkpoint, true);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].tabs[0].workState, 'busy');
  assert.equal(writes[1].tabs[0].inFlightRequest.type, 'chat');
});

test('a recovered store reports a later independent outage', async () => {
  const clock = new FakeClock();
  const warnings = [];
  let attempt = 0;
  const persistence = createTaskPersistence({
    store: { put: async () => { attempt += 1; if (attempt !== 2) throw new Error(`failure-${attempt}`); } },
    capture: () => {},
    snapshot: () => ({ key: 'workspace', attempt }),
    warn: error => warnings.push(error.message),
    setTimer: clock.setTimeout,
    clearTimer: clock.clearTimeout,
  });

  for (let index = 0; index < 3; index += 1) {
    persistence.schedule();
    clock.fire();
    await persistence.settled();
  }
  assert.deepEqual(warnings, ['failure-1', 'failure-3']);
});

test('an uncloneable pending snapshot warns without escaping the lifecycle callback', async () => {
  const clock = new FakeClock();
  const warnings = [];
  let value = { key: 'workspace', invalid: () => {} };
  const persistence = createTaskPersistence({
    store: { put: async () => {} },
    capture: () => {},
    snapshot: () => value,
    warn: error => warnings.push(error.name),
    setTimer: clock.setTimeout,
    clearTimer: clock.clearTimeout,
  });

  persistence.schedule();
  assert.doesNotThrow(() => clock.fire());
  await persistence.settled();
  assert.deepEqual(warnings, ['DataCloneError']);

  value = { key: 'workspace', tabs: [] };
  persistence.schedule();
  clock.fire();
  await persistence.settled();
  assert.deepEqual(warnings, ['DataCloneError'], 'a cloneable later state should recover normally');
});

test('restart marks an unknown in-flight provider request interrupted without losing source, results, selection, or output settings', () => {
  const value = {
    key: 'workspace', activeTaskTabId: 'task-a', taskTabSerial: 1, imageSerial: 2,
    tabs: [{
      id: 'task-a', workState: 'busy', input: 'latest request',
      attachments: [
        {id:'source',data:pngFixture('source'),comments:[{number:1,type:'area',x:10,y:20,w:30,h:40,text:'보존'}]},
        {id:'source-2',data:pngFixture('source-2'),source:{pageNumber:7}},
      ],
      generated: [{id:'v1',data:pngFixture('one'),comments:[{number:1,type:'point',x:25,y:35,w:0,h:0,text:'첫 결과'}]},{id:'v2',data:pngFixture('two')}],
      selectedCandidateId: 'v1',
      referenceComposition: {orientation:'vertical',sourceOrder:['source-2','source']},
      workbenchViewState: {selectedCandidateId:'v1',zoom:{source:1.5,result:2},scroll:{source:{left:14,top:21},result:{left:34,top:55}}},
      outputOptions: {backgroundPolicy:'connected',examPalette:true,lineThickness:2},
      inFlightRequest: {type:'image',snapshot:{entered:'retry me',runInput:{mode:'diagram'}}},
    }],
  };

  const recovered = recoverTaskWorkspaceSnapshot(value);
  const tab = recovered.tabs[0];
  assert.equal(tab.workState, 'interrupted');
  assert.equal(tab.inFlightRequest, null);
  assert.deepEqual(tab.retryRequest, value.tabs[0].inFlightRequest);
  assert.equal(tab.attachments[0].id, 'source');
  assert.deepEqual(tab.generated.map(item => item.id), ['v1', 'v2']);
  assert.equal(tab.selectedCandidateId, 'v1');
  assert.deepEqual(tab.referenceComposition, value.tabs[0].referenceComposition);
  assert.deepEqual(tab.workbenchViewState, value.tabs[0].workbenchViewState);
  assert.deepEqual(tab.attachments[0].comments, value.tabs[0].attachments[0].comments);
  assert.deepEqual(tab.generated[0].comments, value.tabs[0].generated[0].comments);
  assert.deepEqual(tab.outputOptions, value.tabs[0].outputOptions);
  assert.equal(value.tabs[0].workState, 'busy', 'recovery must not mutate the stored input object');
});

function pngFixture(value) {
  return `data:image/png;base64,${Buffer.from(value).toString('base64')}`;
}

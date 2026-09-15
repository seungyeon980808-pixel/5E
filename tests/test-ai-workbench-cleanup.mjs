import test from 'node:test';
import assert from 'node:assert/strict';
import { clearTaskWorkspaces } from '../js/ai-task-workspaces.js';
import { createUngroupedSplitOutputs } from '../js/ai-editable-assets.js';
import { acknowledgeActiveTaskClearCancellation } from '../js/ai-panel.js';

test('Given mixed tasks, when clearing all, then count confirmation precedes cancellation and deletion', async () => {
  const calls = [];
  const tasks = [
    { id: 'running', workState: 'busy', source: new Uint8Array([1, 2, 3]) },
    { id: 'queued', workState: 'queued', source: new Uint8Array([4, 5, 6]) },
    { id: 'done', workState: 'idle', source: new Uint8Array([7, 8, 9]) },
  ];

  const result = await clearTaskWorkspaces({
    tasks,
    confirm: async count => { calls.push(`confirm:${count}`); return true; },
    cancel: async task => { calls.push(`cancel:${task.id}`); return { acknowledged: true }; },
    remove: async task => { calls.push(`remove:${task.id}`); },
  });

  assert.deepEqual(calls, [
    'confirm:3', 'cancel:running', 'remove:running', 'remove:queued', 'remove:done',
  ]);
  assert.deepEqual(result, { confirmed: true, removedIds: ['running', 'queued', 'done'], retainedIds: [] });
});

test('Given the production cancellation boundary, queued work clears locally while rejected running work remains', async () => {
  const interrupted = [];
  const removed = [];
  const tasks = [
    { id: 'queued', workState: 'queued', source: new Uint8Array([1, 2]) },
    { id: 'running', workState: 'busy', source: new Uint8Array([3, 4]) },
    { id: 'failed', workState: 'failed', source: new Uint8Array([5, 6]) },
  ];
  const before = tasks.map(task => task.source.slice());

  const result = await clearTaskWorkspaces({
    tasks,
    confirm: async () => true,
    cancel: tab => acknowledgeActiveTaskClearCancellation({
      tab,
      activeTaskTabId: 'running',
      interrupt: async () => { interrupted.push(tab.id); return { ok: false }; },
    }),
    remove: async tab => { removed.push(tab.id); },
  });

  assert.deepEqual(interrupted, ['running']);
  assert.deepEqual(removed, ['queued', 'failed']);
  assert.deepEqual(result, { confirmed: true, removedIds: ['queued', 'failed'], retainedIds: ['running'] });
  assert.deepEqual(tasks.map(task => task.source), before);
});

test('Given a cancellation rejection, when clearing all, then that task and its source bytes are retained', async () => {
  const source = new Uint8Array([10, 20, 30, 40]);
  const before = source.slice();
  const tasks = [
    { id: 'running', workState: 'busy', source },
    { id: 'done', workState: 'idle', source: new Uint8Array([50]) },
  ];
  const removed = [];

  const result = await clearTaskWorkspaces({
    tasks,
    confirm: async () => true,
    cancel: async () => { throw new Error('transport refused cancellation'); },
    remove: async task => { removed.push(task.id); },
  });

  assert.deepEqual(result, { confirmed: true, removedIds: ['done'], retainedIds: ['running'] });
  assert.deepEqual(removed, ['done']);
  assert.deepEqual(source, before);
});

test('Given failed work, when clearing all, then failed work is removed too', async () => {
  const removed = [];
  const result = await clearTaskWorkspaces({
    tasks: [{ id: 'failed', workState: 'failed', error: 'network unavailable' }],
    confirm: async count => count === 1,
    cancel: async () => assert.fail('failed tasks are not cancellable'),
    remove: async task => { removed.push(task.id); },
  });

  assert.deepEqual(result, { confirmed: true, removedIds: ['failed'], retainedIds: [] });
  assert.deepEqual(removed, ['failed']);
});

test('Given separated assets, when creating outputs, then identities are unique and ungrouped without input mutation', () => {
  const prepared = {
    originalData: 'data:image/png;base64,source',
    assets: [
      { id: 'region-a', data: 'data:image/png;base64,a', x: 1, y: 2 },
      { id: 'region-b', data: 'data:image/png;base64,b', x: 3, y: 4 },
    ],
  };
  const before = structuredClone(prepared);
  const ids = ['object-a', 'object-b'];

  const outputs = createUngroupedSplitOutputs(prepared, { idFactory: () => ids.shift() });

  assert.deepEqual(outputs.map(({ objectId, groupId }) => ({ objectId, groupId })), [
    { objectId: 'object-a', groupId: null },
    { objectId: 'object-b', groupId: null },
  ]);
  assert.notEqual(outputs[0], prepared.assets[0]);
  assert.deepEqual(prepared, before);
});

test('Given a misleading ID factory, when creating split outputs, then duplicate identity is rejected', () => {
  assert.throws(() => createUngroupedSplitOutputs({
    assets: [{ id: 'a', data: 'a' }, { id: 'b', data: 'b' }],
  }, { idFactory: () => 'duplicate' }), /고유/);
});

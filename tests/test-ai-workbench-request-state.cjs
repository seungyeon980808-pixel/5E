const assert = require('node:assert/strict');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const moduleUrl = pathToFileURL(path.join(__dirname, '../preview/js/ai-workbench-request-state.js')).href;

test('request progress starts before transport and remains with its originating task', async () => {
  const { createWorkbenchRequestState } = await import(moduleUrl);
  let now = 100;
  const state = createWorkbenchRequestState({ clock: () => now });
  const a = state.begin('A', 'A-revision-2');
  const b = state.begin('B', 'B-original');
  now = 1100;
  state.advance(a, 'confirmation-wait');
  assert.equal(state.snapshot('A').phase, 'confirmation-wait');
  assert.equal(state.snapshot('A').elapsedMs, 1000);
  assert.equal(state.snapshot('B').phase, 'preparing');
  assert.equal(state.snapshot('B').token, b);
});

test('cancelled A1 events cannot update retried A2 or independent B', async () => {
  const { createWorkbenchRequestState } = await import(moduleUrl);
  const state = createWorkbenchRequestState();
  const a1 = state.begin('A', 'revision');
  state.bind(a1, { turnId: 'A1', threadId: 'thread-A1' });
  state.advance(a1, 'cancelled');
  const a2 = state.begin('A', 'revision');
  state.bind(a2, { turnId: 'A2', threadId: 'thread-A2' });
  state.advance(a2, 'generating');
  const b = state.begin('B', 'other');
  for (const kind of ['image', 'error', 'done']) {
    assert.equal(state.accepts(a2, { kind, turnId: 'A1', threadId: 'thread-A1' }), false);
    assert.equal(state.accepts(a1, { kind, turnId: 'A1' }), false);
  }
  assert.equal(state.advance(a1, 'completed'), false);
  assert.equal(state.snapshot('A').phase, 'generating');
  assert.equal(state.snapshot('B').token, b);
  assert.equal(state.snapshot('B').phase, 'preparing');
});

test('event routing rejects conflicting transport identifiers and stopped requests', async () => {
  const { createWorkbenchRequestState } = await import(moduleUrl);
  const state = createWorkbenchRequestState();
  const token = state.begin('A', 'revision');
  assert.equal(state.accepts(token, { turnId: 'one' }), false);
  state.bind(token, { turnId: 'one', renderThreadId: 'thread-one' });
  assert.equal(state.accepts(token, { threadId: 'thread-one' }), true);
  assert.equal(state.accepts(token, { turnId: 'other', threadId: 'thread-one' }), false);
  assert.equal(state.accepts(token, { turnId: 'one', threadId: 'other' }), false);
  state.advance(token, 'completed');
  assert.equal(state.accepts(token, { turnId: 'one' }), false);
});

test('terminal elapsed time freezes and confirmation wait never claims success', async () => {
  const { createWorkbenchRequestState } = await import(moduleUrl);
  let now = 0;
  const state = createWorkbenchRequestState({ clock: () => now });
  const token = state.begin('A');
  now = 1000;
  state.advance(token, 'confirmation-wait');
  assert.equal(state.live(token), true);
  assert.throws(() => state.begin('A'));
  now = 5000;
  state.advance(token, 'failed');
  now = 9000;
  assert.equal(state.snapshot('A').elapsedMs, 5000);
  assert.equal(state.snapshot('A').phase, 'failed');
});

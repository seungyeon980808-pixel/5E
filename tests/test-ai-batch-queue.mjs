import assert from 'node:assert/strict';
import test from 'node:test';

import { createBatchQueue } from '../js/ai-batch-queue.js';
import { createMemoryBatchStore } from '../js/ai-batch-store.js';

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mNg+M8AAAICAQB7CYpPAAAAAElFTkSuQmCC';

const makeSources = count => Array.from({ length: count }, (_, index) => ({
  id: `source-${index + 1}`,
  name: `figure-${index + 1}.png`,
  dataUrl: PNG_DATA_URL,
}));

function controlledGeneration() {
  const starts = [];
  const interrupts = [];
  return {
    starts,
    interrupts,
    start(job, emit) {
      starts.push({ job: structuredClone(job), emit });
    },
    interrupt(job) {
      interrupts.push(structuredClone(job));
    },
  };
}

function clock() {
  let value = 1_700_000_000_000;
  return () => ++value;
}

test('Given 25 inputs, when enqueued, then ten run and fifteen remain queued', async () => {
  // Given
  const generation = controlledGeneration();
  const queue = createBatchQueue({ store: createMemoryBatchStore(), generation, now: clock() });

  // When
  await queue.enqueue({ sessionId: 'session-a', workspaceId: 'workspace-a', sources: makeSources(25), options: { mode: 'line-art' } });

  // Then
  const jobs = await queue.list({ sessionId: 'session-a', workspaceId: 'workspace-a' });
  assert.deepEqual(jobs.reduce((counts, job) => ({ ...counts, [job.state]: (counts[job.state] || 0) + 1 }), {}), { running: 10, queued: 15 });
  assert.equal(generation.starts.length, 10);
  assert.equal(jobs[0].attempt, 1);
  assert.deepEqual(jobs[0].sourceSnapshot, makeSources(1)[0]);
});

test('Given queued and running jobs, when cancelled repeatedly, then both stay cancelled and only the running job is interrupted once', async () => {
  // Given
  const generation = controlledGeneration();
  const queue = createBatchQueue({ store: createMemoryBatchStore(), generation, maxRunning: 1, now: clock() });
  const [running, queued] = await queue.enqueue({ sessionId: 's', workspaceId: 'w', sources: makeSources(2), options: {} });

  // When
  await queue.cancel(queued.id);
  await queue.cancel(running.id);
  await queue.cancel(running.id);

  // Then
  assert.deepEqual((await queue.list({ sessionId: 's', workspaceId: 'w' })).map(job => job.state), ['cancelled', 'cancelled']);
  assert.equal(generation.interrupts.length, 1);
});

test('Given a hung interrupt adapter, when a running job is cancelled, then cancellation still settles durably', async () => {
  // Given
  const generation = controlledGeneration();
  generation.interrupt = () => new Promise(() => {});
  const queue = createBatchQueue({ store: createMemoryBatchStore(), generation, maxRunning: 1, now: clock() });
  const [running] = await queue.enqueue({ sessionId: 's', workspaceId: 'w', sources: makeSources(1), options: {} });

  // When
  let settled = false;
  void queue.cancel(running.id).then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));

  // Then
  assert.equal(settled, true);
  assert.equal((await queue.list({ sessionId: 's', workspaceId: 'w' }))[0].state, 'cancelled');
});

test('Given failed and completed jobs, when retry is requested, then only the failed job receives a fresh attempt', async () => {
  // Given
  const generation = controlledGeneration();
  const queue = createBatchQueue({ store: createMemoryBatchStore(), generation, maxRunning: 2, now: clock() });
  const [failed, completed] = await queue.enqueue({ sessionId: 's', workspaceId: 'w', sources: makeSources(2), options: {} });
  await queue.handleEvent({ jobId: failed.id, attempt: 1, eventId: 'fail-1', type: 'failed', error: 'fixture failure' });
  await queue.handleEvent({ jobId: completed.id, attempt: 1, eventId: 'done-1', type: 'completed', result: { data: 'png-b' } });

  // When
  const retried = await queue.retryFailed(failed.id);

  // Then
  assert.equal(retried.attempt, 2);
  assert.equal(retried.state, 'running');
  await assert.rejects(() => queue.retryFailed(completed.id), /failed jobs can be retried/i);
  assert.equal(generation.starts.at(-1).job.attempt, 2);
});

test('Given persisted running and completed jobs, when reloaded, then running resumes as a fresh attempt and completed is not rerun', async () => {
  // Given
  const store = createMemoryBatchStore();
  const firstGeneration = controlledGeneration();
  const first = createBatchQueue({ store, generation: firstGeneration, maxRunning: 2, now: clock() });
  const [stale, completed] = await first.enqueue({ sessionId: 's', workspaceId: 'w', sources: makeSources(2), options: {} });
  await first.handleEvent({ jobId: completed.id, attempt: 1, eventId: 'done', type: 'completed', result: { data: 'complete' } });
  const resumedGeneration = controlledGeneration();
  const resumed = createBatchQueue({ store, generation: resumedGeneration, maxRunning: 2, now: clock() });

  // When
  await resumed.resume({ sessionId: 's', workspaceId: 'w' });

  // Then
  const jobs = await resumed.list({ sessionId: 's', workspaceId: 'w' });
  assert.equal(jobs.find(job => job.id === stale.id).attempt, 2);
  assert.equal(jobs.find(job => job.id === stale.id).state, 'running');
  assert.equal(jobs.find(job => job.id === completed.id).state, 'completed');
  assert.deepEqual(resumedGeneration.starts.map(entry => entry.job.id), [stale.id]);
});

test('Given duplicate and stale terminal events, when handled, then output is written once and the terminal result remains unchanged', async () => {
  // Given
  const generation = controlledGeneration();
  const writes = [];
  const queue = createBatchQueue({
    store: createMemoryBatchStore(), generation, now: clock(),
    output: { async write(context) { writes.push(structuredClone(context)); return { path: '/out/result.png', sha256: 'hash-1' }; } },
  });
  const [job] = await queue.enqueue({ sessionId: 's', workspaceId: 'w', sources: makeSources(1), options: {} });

  // When
  await queue.handleEvent({ jobId: job.id, attempt: 1, eventId: 'done', type: 'completed', result: { data: 'first' } });
  await queue.handleEvent({ jobId: job.id, attempt: 1, eventId: 'done', type: 'completed', result: { data: 'duplicate' } });
  await queue.handleEvent({ jobId: job.id, attempt: 0, eventId: 'stale', type: 'failed', error: 'stale' });

  // Then
  const [saved] = await queue.list({ sessionId: 's', workspaceId: 'w' });
  assert.equal(saved.state, 'completed');
  assert.deepEqual(saved.result, { generation: { data: 'first' }, output: { path: '/out/result.png', sha256: 'hash-1' } });
  assert.equal(writes.length, 1);
});

test('Given two sessions and workspaces, when one scope changes, then the other scope remains isolated', async () => {
  // Given
  const generation = controlledGeneration();
  const queue = createBatchQueue({ store: createMemoryBatchStore(), generation, maxRunning: 2, now: clock() });
  const [first] = await queue.enqueue({ sessionId: 'session-a', workspaceId: 'workspace-a', sources: makeSources(1), options: { label: 'a' } });
  const [second] = await queue.enqueue({ sessionId: 'session-b', workspaceId: 'workspace-b', sources: makeSources(1), options: { label: 'b' } });

  // When
  await queue.cancel(first.id);

  // Then
  assert.equal((await queue.list({ sessionId: 'session-a', workspaceId: 'workspace-a' }))[0].state, 'cancelled');
  assert.equal((await queue.list({ sessionId: 'session-b', workspaceId: 'workspace-b' }))[0].state, 'running');
  assert.equal(second.options.label, 'b');
});

test('Given malformed persisted records, when resumed, then valid records load and malformed records are ignored', async () => {
  // Given
  const store = createMemoryBatchStore();
  await store.save({ sessionId: 's', workspaceId: 'w' }, [{ nope: true }, null]);
  const queue = createBatchQueue({ store, generation: controlledGeneration(), now: clock() });

  // When
  const jobs = await queue.resume({ sessionId: 's', workspaceId: 'w' });

  // Then
  assert.deepEqual(jobs, []);
});

test('Given a quota failure, when enqueue rejects, then admission rolls back and a later enqueue can use the slot', async () => {
  // Given
  const generation = controlledGeneration();
  const durable = createMemoryBatchStore();
  let fail = true;
  const store = {
    load: scope => durable.load(scope),
    async save(scope, records) {
      if (fail) throw new Error('quota');
      await durable.save(scope, records);
    },
  };
  const queue = createBatchQueue({ store, generation, maxRunning: 1, now: clock() });

  // When
  await assert.rejects(() => queue.enqueue({ sessionId: 's', workspaceId: 'w', sources: makeSources(1), options: {} }), /quota/);
  fail = false;
  const afterFailure = await queue.list({ sessionId: 's', workspaceId: 'w' });
  const [recovered] = await queue.enqueue({ sessionId: 's', workspaceId: 'w', sources: makeSources(1), options: {} });

  // Then
  assert.deepEqual(afterFailure, []);
  assert.equal(recovered.state, 'running');
  assert.equal(generation.starts.length, 1);
});

test('Given invalid or oversized source snapshots, when enqueue is requested, then they are rejected before persistence or generation', async () => {
  // Given
  const generation = controlledGeneration();
  let saves = 0;
  const memory = createMemoryBatchStore();
  const store = {
    load: scope => memory.load(scope),
    save: async (scope, records) => { saves += 1; await memory.save(scope, records); },
  };
  const queue = createBatchQueue({ store, generation, now: clock() });

  // When
  const invalid = queue.enqueue({ sessionId: 's', workspaceId: 'w', sources: [{ name: 'bad.png', dataUrl: 'definitely-not-image' }], options: {} });
  const oversized = queue.enqueue({ sessionId: 's', workspaceId: 'w', sources: [{ name: 'huge.png', dataUrl: PNG_DATA_URL, payload: 'x'.repeat(2_000_000) }], options: {} });

  // Then
  await assert.rejects(invalid, /valid image data URL/i);
  await assert.rejects(oversized, /size limit/i);
  assert.equal(saves, 0);
  assert.equal(generation.starts.length, 0);
});

test('Given a persisted record with an invalid image signature, when resumed, then it is discarded before generation', async () => {
  // Given
  const scope = { sessionId: 's', workspaceId: 'w' };
  const store = createMemoryBatchStore();
  await store.save(scope, [{
    id: 'bad-signature', ...scope, sourceSnapshot: { name: 'fake.png', dataUrl: 'data:image/png;base64,AAAA' }, options: {},
    state: 'queued', attempt: 1, result: null, error: null, eventIds: [],
    timestamps: { createdAt: 1, queuedAt: 1, startedAt: null, completedAt: null, failedAt: null, cancelledAt: null, updatedAt: 1 },
  }]);
  const generation = controlledGeneration();
  const queue = createBatchQueue({ store, generation, now: clock() });

  // When
  const jobs = await queue.resume(scope);

  // Then
  assert.deepEqual(jobs, []);
  assert.equal(generation.starts.length, 0);
});

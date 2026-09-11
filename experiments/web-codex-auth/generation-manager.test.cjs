const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { GenerationManager } = require('./generation-manager.cjs');
const { GlobalGenerationScheduler } = require('./global-generation-scheduler.cjs');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';

class FakeRuntime extends EventEmitter {
  constructor() { super(); this.directory = '/tmp/5e-generation-manager'; this.serial = 0; }
  async rpc(method, params = {}) {
    if (method === 'thread/start') return { thread: { id: `thread-${++this.serial}` } };
    if (method === 'turn/start') return { turn: { id: `turn-${params.threadId.slice(7)}` } };
    return {};
  }
}

async function until(predicate) {
  for (let index = 0; index < 100; index++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('Timed out');
}

test('manager enforces active limit, releases completed slots, and detaches listeners', async () => {
  const runtime = new FakeRuntime();
  const manager = new GenerationManager(runtime, { maxActive: 10, maxRetained: 2 });
  const started = Array.from({ length: 10 }, (_, index) => manager.start({ request: `diagram ${index}` }));
  await until(() => started.every(entry => entry.generation.job.turnId));
  assert.equal(runtime.listenerCount('notification'), 10);
  assert.throws(() => manager.start({ request: 'eleventh' }), error => error.status === 429);
  for (const entry of started) runtime.emit('notification', { method: 'item/completed', params: { threadId: entry.generation.job.threadId, turnId: entry.generation.job.turnId, item: { type: 'imageGeneration', result: PNG } } });
  await until(() => started.every(entry => entry.generation.isReleasable()));
  manager.releaseCompleted();
  assert.equal(manager.active.size, 0);
  assert.equal(runtime.listenerCount('notification'), 0);
  assert.equal(manager.start({ request: 'replacement' }).job.state, 'running');
  manager.close();
});

test('retention remains bounded when the last-started job completes first', async () => {
  const runtime = new FakeRuntime();
  const manager = new GenerationManager(runtime, { maxActive: 2, maxRetained: 1 });
  const first = manager.start({ request: 'first' });
  const latest = manager.start({ request: 'latest' });
  await until(() => first.generation.job.turnId && latest.generation.job.turnId);
  for (const entry of [latest, first]) {
    runtime.emit('notification', { method: 'item/completed', params: { threadId: entry.generation.job.threadId, turnId: entry.generation.job.turnId, item: { type: 'imageGeneration', result: PNG } } });
    await until(() => entry.generation.isReleasable());
    manager.snapshot(entry.job.jobId);
  }
  assert.equal(manager.jobs.size, 1);
  assert.equal(manager.snapshot(null).jobId, first.job.jobId);
  manager.close();
});

test('closing a session removes its queued callback and cannot launch it after another session releases', async () => {
  const scheduler = new GlobalGenerationScheduler({ maxRunning: 1 });
  const firstRuntime = new FakeRuntime();
  const closedRuntime = new FakeRuntime();
  const first = new GenerationManager(firstRuntime, { scheduler, schedulerOwner: 'first' });
  const closed = new GenerationManager(closedRuntime, { scheduler, schedulerOwner: 'closed' });
  const running = first.start({ request: 'running' });
  closed.start({ request: 'must never launch' });
  await until(() => running.generation.job.turnId);
  closed.close();
  await first.cancel(running.job.jobId);
  assert.deepEqual(scheduler.status(), { maxRunning: 1, running: 0, queued: 0 });
  assert.equal(closedRuntime.serial, 0);
  first.close();
});

test('Given a runtime RPC hangs before creating a turn, when its generation times out, then the global slot admits queued work', async () => {
  class HangingRuntime extends FakeRuntime {
    async rpc(method, params) {
      if (method === 'thread/start') return new Promise(() => {});
      return super.rpc(method, params);
    }
  }
  const scheduler = new GlobalGenerationScheduler({ maxRunning: 1 });
  const hanging = new GenerationManager(new HangingRuntime(), {
    generationTimeout: 10,
    scheduler,
    schedulerOwner: 'hanging',
  });
  const peerRuntime = new FakeRuntime();
  const peer = new GenerationManager(peerRuntime, { scheduler, schedulerOwner: 'peer' });
  const stalled = hanging.start({ request: 'stalled' });
  const waiting = peer.start({ request: 'waiting' });
  await until(() => stalled.generation.job.state === 'failed');
  await until(() => waiting.generation.job.state === 'running');
  assert.deepEqual(scheduler.status(), { maxRunning: 1, running: 1, queued: 0 });
  hanging.close();
  peer.close();
});

test('Given interrupt acknowledgement hangs, when running work is cancelled, then the runtime timeout releases the slot once', async () => {
  class HangingInterruptRuntime extends FakeRuntime {
    async rpc(method, params) {
      if (method === 'turn/interrupt') return new Promise(() => {});
      return super.rpc(method, params);
    }
    close() { this.dead = true; this.emit('unavailable'); }
  }
  const scheduler = new GlobalGenerationScheduler({ maxRunning: 1 });
  const first = new GenerationManager(new HangingInterruptRuntime(), {
    generationTimeout: 10,
    scheduler,
    schedulerOwner: 'first',
  });
  const peer = new GenerationManager(new FakeRuntime(), { scheduler, schedulerOwner: 'peer' });
  const running = first.start({ request: 'running' });
  const waiting = peer.start({ request: 'waiting' });
  await until(() => running.generation.job.turnId);
  void first.cancel(running.job.jobId);
  await until(() => waiting.generation.job.state === 'running');
  assert.deepEqual(scheduler.status(), { maxRunning: 1, running: 1, queued: 0 });
  first.close();
  peer.close();
});

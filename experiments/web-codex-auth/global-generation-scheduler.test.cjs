const test = require('node:test');
const assert = require('node:assert/strict');
const { GlobalGenerationScheduler } = require('./global-generation-scheduler.cjs');

test('Given the default server policy, when one browser starts ten independent crops, then all ten are admitted', () => {
  const scheduler = new GlobalGenerationScheduler();
  const started = [];
  for (let index = 0; index < 10; index++) scheduler.enqueue('one-browser', { start: () => started.push(index) });
  assert.equal(started.length, 10);
  assert.deepEqual(scheduler.status(), { maxRunning: 10, running: 10, queued: 0 });
});

test('Given one browser already runs ten crops, when two other sessions wait, then released slots admit those peers fairly', () => {
  const scheduler = new GlobalGenerationScheduler();
  const started = [];
  const firstBrowser = Array.from({ length: 10 }, (_, index) => scheduler.enqueue('browser-a', { start: () => started.push(`a${index}`) }));
  scheduler.enqueue('browser-b', { start: () => started.push('b') });
  scheduler.enqueue('browser-c', { start: () => started.push('c') });
  firstBrowser[0].release();
  firstBrowser[1].release();
  assert.deepEqual(started.slice(-2), ['b', 'c']);
});

test('Given work from six browser sessions, when the global capacity is five, then only five sessions run and the sixth is visibly queued', () => {
  const scheduler = new GlobalGenerationScheduler({ maxRunning: 5 });
  const started = [];
  const tickets = Array.from({ length: 6 }, (_, index) => scheduler.enqueue(`session-${index}`, {
    start: () => started.push(index),
  }));
  assert.deepEqual(started, [0, 1, 2, 3, 4]);
  assert.equal(tickets[5].state, 'queued');
  assert.deepEqual(scheduler.status(), { maxRunning: 5, running: 5, queued: 1 });
});

test('Given one noisy session and two waiting peers, when slots release, then round-robin admission prevents starvation', () => {
  const scheduler = new GlobalGenerationScheduler({ maxRunning: 1 });
  const started = [];
  const first = scheduler.enqueue('session-a', { start: () => started.push('a1') });
  scheduler.enqueue('session-a', { start: () => started.push('a2') });
  const peerB = scheduler.enqueue('session-b', { start: () => started.push('b1') });
  const peerC = scheduler.enqueue('session-c', { start: () => started.push('c1') });
  scheduler.enqueue('session-a', { start: () => started.push('a3') });
  first.release();
  assert.deepEqual(started, ['a1', 'a2']);
  scheduler.runningTickets()[0].release();
  assert.deepEqual(started, ['a1', 'a2', 'b1']);
  peerB.release();
  assert.deepEqual(started, ['a1', 'a2', 'b1', 'c1']);
  peerC.release();
  assert.deepEqual(started, ['a1', 'a2', 'b1', 'c1', 'a3']);
});

test('Given queued and running jobs, when each is cancelled, then queued work never starts and running capacity is reclaimed once', () => {
  const scheduler = new GlobalGenerationScheduler({ maxRunning: 1 });
  const started = [];
  const running = scheduler.enqueue('session-a', { start: () => started.push('running') });
  const queued = scheduler.enqueue('session-b', { start: () => started.push('queued') });
  assert.equal(queued.cancel(), true);
  assert.equal(queued.cancel(), false);
  assert.equal(running.cancel(), true);
  assert.deepEqual(started, ['running']);
  assert.deepEqual(scheduler.status(), { maxRunning: 1, running: 0, queued: 0 });
});

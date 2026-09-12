import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceGenerationTiming,
  restoreGenerationTiming,
  sampleGenerationTiming,
  serializeGenerationTiming,
  startGenerationTiming,
} from '../js/ai-generation-timing.js';

class FakeClock {
  constructor(nowMs = 0) { this.nowMs = nowMs; }
  now = () => this.nowMs;
  advance(ms) { this.nowMs += ms; }
  set(nowMs) { this.nowMs = nowMs; }
}

const event = (turnId, type, outcome) => ({ turnId, type, outcome });
const viewAt = (timing, nowMs) => sampleGenerationTiming(timing, nowMs).view;

test('elapsed time starts at runtime acceptance and excludes earlier validation', () => {
  const clock = new FakeClock(10_000);
  clock.advance(7_500); // validation, checkpoint, and attachment preparation
  const timing = startGenerationTiming({ turnId: 'turn-a', acceptedAtMs: clock.now() });

  assert.equal(viewAt(timing, clock.now()).formatted, '00:00');
  clock.advance(1_999);
  assert.deepEqual(viewAt(timing, clock.now()), {
    available: true,
    running: true,
    elapsedMs: 1_999,
    formatted: '00:01',
    phase: 'accepted',
    outcome: null,
  });
});

test('MM:SS formatting and monotonic elapsed hold at minute boundaries and clock rollback', () => {
  const clock = new FakeClock(1_000);
  let timing = startGenerationTiming({ turnId: 'turn-a', acceptedAtMs: clock.now() });

  clock.set(60_999);
  assert.equal(viewAt(timing, clock.now()).formatted, '00:59');
  timing = serializeGenerationTiming(timing, clock.now());
  clock.set(61_000);
  assert.equal(viewAt(timing, clock.now()).formatted, '01:00');
  clock.set(500); // a corrected wall clock must never move elapsed time backwards
  assert.equal(viewAt(timing, clock.now()).elapsedMs, 59_999);
  clock.set(3_601_999);
  assert.equal(viewAt(timing, clock.now()).formatted, '60:00');
});

test('a displayed sample becomes the floor when cancellation follows wall-clock rollback', () => {
  const clock = new FakeClock(1_000);
  let timing = startGenerationTiming({ turnId: 'turn-a', acceptedAtMs: clock.now() });
  clock.set(11_000);
  const displayed = sampleGenerationTiming(timing, clock.now());
  timing = displayed.timing;
  assert.equal(displayed.view.elapsedMs, 10_000);

  clock.set(500);
  timing = advanceGenerationTiming(timing, event('turn-a', 'turn-terminal', 'cancelled'), clock.now());
  assert.equal(viewAt(timing, clock.now()).elapsedMs, 10_000);
});

test('per-task snapshots continue independently across tab switches', () => {
  const clock = new FakeClock(5_000);
  const tasks = new Map([
    ['task-a', startGenerationTiming({ turnId: 'turn-a', acceptedAtMs: clock.now() })],
  ]);
  clock.advance(30_000);
  tasks.set('task-a', serializeGenerationTiming(tasks.get('task-a'), clock.now()));
  tasks.set('task-b', startGenerationTiming({ turnId: 'turn-b', acceptedAtMs: clock.now() }));
  clock.advance(5_000);

  assert.equal(viewAt(tasks.get('task-a'), clock.now()).formatted, '00:35');
  assert.equal(viewAt(tasks.get('task-b'), clock.now()).formatted, '00:05');
});

test('completed image timing waits for factual local postprocessing and then freezes', () => {
  const clock = new FakeClock(1_000);
  let timing = startGenerationTiming({ turnId: 'turn-a', acceptedAtMs: clock.now() });
  clock.advance(2_000);
  timing = advanceGenerationTiming(timing, event('turn-a', 'image-started'), clock.now());
  assert.equal(timing.phase, 'image-generating');

  clock.advance(8_000);
  timing = advanceGenerationTiming(timing, event('turn-a', 'image-received'), clock.now());
  timing = advanceGenerationTiming(timing, event('turn-a', 'postprocess-started'), clock.now());
  clock.advance(1_000);
  timing = advanceGenerationTiming(timing, event('turn-a', 'turn-terminal', 'completed'), clock.now());
  assert.equal(viewAt(timing, clock.now()).running, true);

  clock.advance(3_000);
  timing = advanceGenerationTiming(timing, event('turn-a', 'postprocess-completed'), clock.now());
  assert.deepEqual(viewAt(timing, clock.now()), {
    available: true,
    running: false,
    elapsedMs: 14_000,
    formatted: '00:14',
    phase: 'terminal',
    outcome: 'completed',
  });
  clock.advance(60_000);
  assert.equal(viewAt(timing, clock.now()).elapsedMs, 14_000);
});

test('failure, cancellation, and local postprocess failure freeze immediately', () => {
  for (const [type, outcome, expected] of [
    ['turn-terminal', 'failed', 'failed'],
    ['turn-terminal', 'cancelled', 'cancelled'],
    ['postprocess-failed', undefined, 'failed'],
  ]) {
    const clock = new FakeClock(2_000);
    let timing = startGenerationTiming({ turnId: 'turn-a', acceptedAtMs: clock.now() });
    if (type === 'postprocess-failed') {
      timing = advanceGenerationTiming(timing, event('turn-a', 'image-received'), clock.now());
    }
    clock.advance(4_200);
    timing = advanceGenerationTiming(timing, event('turn-a', type, outcome), clock.now());
    clock.advance(60_000);
    const view = viewAt(timing, clock.now());
    assert.equal(view.running, false);
    assert.equal(view.elapsedMs, 4_200);
    assert.equal(view.outcome, expected);
  }
});

test('assistant text is inert and a no-image completed turn freezes as no-image', () => {
  const clock = new FakeClock(1_000);
  let timing = startGenerationTiming({ turnId: 'turn-image', acceptedAtMs: clock.now() });
  clock.advance(1_000);
  const before = timing;
  timing = advanceGenerationTiming(timing, event('turn-image', 'assistant'), clock.now());
  assert.equal(timing, before);

  clock.advance(2_000);
  timing = advanceGenerationTiming(timing, event('turn-image', 'turn-terminal', 'completed'), clock.now());
  const view = viewAt(timing, clock.now());
  assert.equal(view.running, false);
  assert.equal(view.outcome, 'no-image');
  assert.notEqual(view.outcome, 'completed');
});

test('late, foreign, and unscoped events cannot mutate the active turn', () => {
  const timing = startGenerationTiming({ turnId: 'turn-new', acceptedAtMs: 5_000 });
  for (const stale of [
    event('turn-old', 'image-started'),
    event(null, 'image-received'),
    event('turn-old', 'turn-terminal', 'completed'),
  ]) {
    assert.equal(advanceGenerationTiming(timing, stale, 9_000), timing);
  }
  assert.equal(viewAt(timing, 9_000).phase, 'accepted');
});

test('restart interrupts a running snapshot at its last persisted elapsed without counting downtime', () => {
  const live = startGenerationTiming({ turnId: 'turn-a', acceptedAtMs: 1_000 });
  const persisted = serializeGenerationTiming(live, 43_345);
  const restored = restoreGenerationTiming(persisted, { interruptRunning: true });

  assert.deepEqual(viewAt(restored, 9_000_000), {
    available: true,
    running: false,
    elapsedMs: 42_345,
    formatted: '00:42',
    phase: 'terminal',
    outcome: 'interrupted',
  });
  assert.equal(restored.endedAtMs, null, 'the unknown interruption instant must not be invented');
});

test('a valid serialized running state can resume without losing its monotonic floor', () => {
  const persisted = serializeGenerationTiming(
    startGenerationTiming({ turnId: 'turn-a', acceptedAtMs: 1_000 }),
    11_000,
  );
  const resumed = restoreGenerationTiming(persisted, { interruptRunning: false });
  assert.equal(viewAt(resumed, 16_500).elapsedMs, 15_500);
  assert.equal(viewAt(resumed, 500).elapsedMs, 10_000);
});

test('legacy, malformed, and unsupported timing snapshots restore as unavailable', () => {
  for (const value of [
    undefined,
    null,
    {},
    { version: 1, turnId: '', startedAtMs: 1, lastElapsedMs: 0 },
    { version: 1, turnId: 'turn-a', startedAtMs: Number.NaN, lastElapsedMs: 0 },
    { version: 1, turnId: 'turn-a', startedAtMs: 1, lastElapsedMs: -1 },
    { version: 1, turnId: 'turn-a', startedAtMs: 1, lastElapsedMs: 0, endedAtMs: null, phase: 'accepted', outcome: null, terminalOutcome: null },
    { version: 1, turnId: 'turn-a', startedAtMs: 1, lastElapsedMs: 0, endedAtMs: null, phase: 'accepted', outcome: null, imageReceived: false, postprocessPending: true, terminalOutcome: null },
    { version: 1, turnId: 'turn-a', startedAtMs: 1, lastElapsedMs: 0, endedAtMs: null, phase: 'image-received', outcome: null, imageReceived: false, postprocessPending: false, terminalOutcome: null },
    { version: 1, turnId: 'turn-a', startedAtMs: 1, lastElapsedMs: 0, endedAtMs: 2, phase: 'terminal', outcome: 'no-image', imageReceived: true, postprocessPending: false, terminalOutcome: 'no-image' },
    { version: 2, turnId: 'turn-a', startedAtMs: 1, lastElapsedMs: 0 },
  ]) {
    assert.equal(restoreGenerationTiming(value), null);
    assert.deepEqual(viewAt(restoreGenerationTiming(value), 5_000), {
      available: false,
      running: false,
      elapsedMs: null,
      formatted: null,
      phase: null,
      outcome: null,
    });
  }
});

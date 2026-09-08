import test from 'node:test';
import assert from 'node:assert/strict';
import { runScopedPanelEdit } from '../js/ai-panel.js';
import { encodeTestRgbaPng, decodeTestPng } from './helpers/scoped-edit-png-fixture.mjs';

function fixture() {
  const sourcePng = encodeTestRgbaPng({ width: 3, height: 1, data: Uint8Array.from([
    10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255,
  ]) });
  const candidate = encodeTestRgbaPng({ width: 3, height: 1, data: new Uint8Array(12).fill(199) });
  const current = { taskId: 'task-a', candidateId: 'image-a', epoch: 1, selectionRevision: 0, sourcePng };
  let accepted;
  return {
    current, sourcePng, candidate,
    options: {
      getCurrent: () => current,
      comments: [{ type: 'area', imageId: 'image-a', x: 33, y: 0, w: 34, h: 100 }],
      confirmBounds: async () => true,
      generate: async () => candidate,
      review: async () => true,
      register: async bytes => { accepted = bytes; },
    },
    get accepted() { return accepted; },
  };
}

test('timing keeps confirmation and candidate-review waits separate from AI generation', async () => {
  const f = fixture();
  let tick = 0;
  const events = [];
  f.options.clock = () => tick;
  f.options.timingObserver = event => events.push(event);
  f.options.confirmBounds = async () => { tick += 500; return true; };
  f.options.generate = async () => { tick += 125; return f.candidate; };
  f.options.review = async () => { tick += 900; return true; };
  assert.equal(await runScopedPanelEdit(f.options), true);
  assert.deepEqual(events.find(event => event.phase === 'bounds-confirmation'),
    { phase: 'bounds-confirmation', durationMs: 500, outcome: 'completed' });
  assert.deepEqual(events.find(event => event.phase === 'ai-generation'),
    { phase: 'ai-generation', durationMs: 125, outcome: 'completed' });
  assert.deepEqual(events.find(event => event.phase === 'candidate-review'),
    { phase: 'candidate-review', durationMs: 900, outcome: 'completed' });
});

test('a throwing timing observer cannot interfere with a successful explicit application', async () => {
  const f = fixture();
  f.options.timingObserver = () => { throw new Error('observer unavailable'); };
  assert.equal(await runScopedPanelEdit(f.options), true);
  assert.deepEqual([...decodeTestPng(f.accepted).data], [
    10, 20, 30, 255, 199, 199, 199, 199, 70, 80, 90, 255,
  ]);
});

test('failed generation reports a failed phase without registration', async () => {
  const f = fixture();
  const events = [];
  f.options.timingObserver = event => events.push(event);
  f.options.generate = async () => { throw new Error('transport failed'); };
  await assert.rejects(runScopedPanelEdit(f.options), /transport failed/);
  assert.equal(f.accepted, undefined);
  assert.equal(events.find(event => event.phase === 'ai-generation')?.outcome, 'failed');
});

test('cancelled bounds are measured and leave the original bytes unregistered', async () => {
  const f = fixture();
  const events = [];
  f.options.timingObserver = event => events.push(event);
  f.options.confirmBounds = async () => false;
  assert.equal(await runScopedPanelEdit(f.options), false);
  assert.equal(f.accepted, undefined);
  assert.deepEqual(decodeTestPng(f.sourcePng).data, Uint8Array.from([
    10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255,
  ]));
  assert.deepEqual(events.find(event => event.phase === 'bounds-confirmation')?.outcome, 'cancelled');
  assert.equal(events.some(event => event.phase === 'ai-generation'), false);
});

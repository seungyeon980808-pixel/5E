import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/ai-panel.js', import.meta.url), 'utf8');
const start = source.indexOf('  const finishCurrentTurnUi = ');
const end = source.indexOf('\n  const dispatchAiEvent = ', start);
const body = source.slice(start, end);
function terminal(overrides = {}) {
  const states = [];
  const context = {
    currentRequestEpoch: 1, serverTurnFinished: false, previewPending: false,
    currentImageOutputError: null, currentTerminalOutcome: 'completed',
    currentRunInput: { approvedFirstPng: true }, currentReviewCandidate: { id: 'image-1' },
    currentTurnStartedAt: 0, currentTurnDone: false, currentTurnPerformance: {}, currentTurnUsage: null,
    pendingCacheOutput: null, imageReceived: true,
    setTaskState: value => states.push(value), setGenerating() {}, setBusy() {}, setStatus() {},
    dispatchReviewEvent() {}, persistPerformance() {}, addTokenFooter() {}, loadAccountOverview() {},
    candidateReviewOnTerminal: () => null, aiTerminalStatusView: () => null,
    CustomEvent: class {}, panel: { dispatchEvent() {} }, ...overrides,
  };
  new Function(...Object.keys(context), `${body}; finishCurrentTurnUi();`)(...Object.values(context));
  return states;
}
test('image arrival is not completion before server terminal confirmation', () => {
  assert.deepEqual(terminal(), []);
});
test('terminal confirmation waits for image postprocessing', () => {
  assert.deepEqual(terminal({ serverTurnFinished: true, previewPending: true }), []);
});
test('confirmed and processed first PNG marks task completed', () => {
  assert.deepEqual(terminal({ serverTurnFinished: true }), ['completed']);
});
test('failed or cancelled terminal cannot mark a received image completed', () => {
  for (const currentTerminalOutcome of ['failed', 'cancelled']) {
    assert.deepEqual(terminal({ serverTurnFinished: true, currentTerminalOutcome }), [currentTerminalOutcome === 'failed' ? 'failed' : 'idle']);
  }
});

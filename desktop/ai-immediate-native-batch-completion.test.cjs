const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/ai-panel.js'), 'utf8');
const productModule = name => import(pathToFileURL(path.join(root, 'js', name + '.js')).href + '?v=1.7.0-four-session-integration');
function sourcePart(start, end) {
  assert.equal(source.split(start).length - 1, 1, 'The real product extraction seam is unique');
  const first = source.indexOf(start), last = source.indexOf(end, first);
  assert.ok(last > first, 'The complete real product function boundary exists');
  return source.slice(first, last);
}
const completion = sourcePart('  function assertImmediateNativeBatchOwner(', '  const addScenePreview = ');
const ownerEquality = sourcePart('  const sameBatchOwner = ', '  function captureBatchTask(');
const terminal = context => ({
  imageReceived: context.imageReceived, serverTurnFinished: context.serverTurnFinished,
  currentTurnDone: context.currentTurnDone, currentTerminalOutcome: context.currentTerminalOutcome,
  awaitingTurnId: context.awaitingTurnId, previewPending: context.previewPending,
});
const pending = { imageReceived: false, serverTurnFinished: false, currentTurnDone: false,
  currentTerminalOutcome: null, awaitingTurnId: true, previewPending: true };
const completed = { imageReceived: true, serverTurnFinished: true, currentTurnDone: true,
  currentTerminalOutcome: 'completed', awaitingTurnId: false, previewPending: false };

async function fixture() {
  const [router, panel, engine, quality] = await Promise.all([
    'ai-local-asset-router', 'ai-panel', 'ai-engine-router', 'ai-quality-mode',
  ].map(productModule));
  const match = router.matchLocalAssetRequest({ request: '한반도 물리 해안선 지도를 그려 줘', mode: 'diagram', references: [] });
  assert.equal(match.matched, true);
  const compiled = panel.compilePanelScene(match.motifRequest, { mode: 'diagram', layerId: 'layer', idPrefix: 'immediate_native_unit' });
  assert.equal(compiled.expansionError, null);
  assert.equal(compiled.result.valid, true); assert.equal(compiled.result.supported, true);
  assert.ok(compiled.result.objects.length > 0); assert.match(compiled.compileSource, /verified_map_outline/);
  const owner = { scope: { sessionId: '5e', workspaceId: 'c27924d4-62b6-456b-9708-42e29128d61a' }, taskId: 'task-local' };
  const abort = new AbortController();
  // This is explicit unit input built from the actual compiled result. It is
  // never described as an observed browser candidate, cache hit or UI batch.
  const candidate = { id: 'workspace-unit-job-1', sceneResult: compiled.result,
    sceneSource: compiled.source, sceneCompileSource: compiled.compileSource };
  const run = { context: { owner, signal: abort.signal, jobId: 'unit-job', attempt: 1,
    snapshot: { operation: 'generate' } }, candidate };
  const calls = [], ownerReads = [];
  const context = {
    ...pending, DOMException, batchRun: run, disposed: false, currentCancelRequested: false,
    currentRequestEpoch: 7, activeTaskTabId: owner.taskId, realOwner: structuredClone(owner),
    currentEngine: engine.IMAGE_ENGINE_IDS.FAST_SCENE, IMAGE_ENGINE_IDS: engine.IMAGE_ENGINE_IDS,
    AI_OUTPUT_ENGINES: quality.AI_OUTPUT_ENGINES, normalizeOutputEngine: quality.normalizeOutputEngine,
    currentRunInput: { outputEngine: quality.AI_OUTPUT_ENGINES.ASSET, imageLabelWorkflow: { explicit: true } },
    batchOwner: id => { ownerReads.push(id); return context.realOwner; },
    finishCurrentTurnUi: epoch => {
      calls.push({ epoch, flags: terminal(context), sameRun: context.batchRun === run,
        sameCandidate: context.batchRun.candidate === candidate, owner: structuredClone(context.realOwner) });
    },
  };
  vm.createContext(context);
  vm.runInContext(ownerEquality + completion + '\nglobalThis.finish = finishImmediateNativeBatch;', context);
  return { context, run, candidate, abort, calls, ownerReads, engine, quality };
}

test('actual immediate native completion delegates once after full terminal state, without registering an output', async () => {
  const f = await fixture(), originalCandidate = structuredClone(f.candidate), originalOwner = structuredClone(f.run.context.owner);
  assert.equal(f.context.finish(f.run, f.candidate, 7), true);
  assert.deepEqual(terminal(f.context), completed);
  assert.deepEqual(f.calls, [{ epoch: 7, flags: completed, sameRun: true, sameCandidate: true, owner: originalOwner }]);
  assert.deepEqual(f.ownerReads, [originalOwner.taskId]);
  assert.deepEqual(f.candidate, originalCandidate); assert.deepEqual(f.run.context.owner, originalOwner);
  // The unit observes the existing completion delegate, not durable commit or
  // provider execution. Real cache browser cases prove those separate effects.
});

test('nonbatch completion returns false with no state or delegate side effects', async () => {
  const f = await fixture();
  assert.equal(f.context.finish(null, f.candidate, 7), false);
  assert.deepEqual(terminal(f.context), pending); assert.deepEqual(f.calls, []); assert.deepEqual(f.ownerReads, []);
});

const ownerCases = [
  ['retired batch run', f => { f.context.batchRun = {}; }],
  ['disposed controller', f => { f.context.disposed = true; }],
  ['aborted actual signal', f => { f.abort.abort(); }],
  ['cancelled request', f => { f.context.currentCancelRequested = true; }],
  ['new request epoch', f => { f.context.currentRequestEpoch += 1; }],
  ['different active task', f => { f.context.activeTaskTabId = 'task-other'; }],
  ['different current owner scope', f => { f.context.realOwner.scope.workspaceId = 'a59418e7-e855-4d71-9a83-869c542aebfc'; }],
  ['different current owner session', f => { f.context.realOwner.scope.sessionId = 'other-session'; }],
  ['different current owner task', f => { f.context.realOwner.taskId = 'task-other'; }],
];
for (const [name, mutate] of ownerCases) test('actual owner fence rejects ' + name + ' before terminal mutation', async () => {
  const f = await fixture(); mutate(f);
  assert.throws(() => f.context.finish(f.run, f.candidate, 7), error => error.name === 'AbortError');
  assert.deepEqual(terminal(f.context), pending); assert.deepEqual(f.calls, []);
});

const eligibilityCases = [
  ['scoped-edit operation', f => { f.run.context.snapshot.operation = 'scoped-edit'; }],
  ['raster engine', f => { f.context.currentEngine = f.engine.IMAGE_ENGINE_IDS.RASTER; }],
  ['nonasset output', f => { f.context.currentRunInput.outputEngine = f.quality.AI_OUTPUT_ENGINES.RASTER; }],
  ['implicit label workflow', f => { f.context.currentRunInput.imageLabelWorkflow.explicit = false; }],
  ['frozen label plan', f => { f.context.currentRunInput.frozenLabelPlan = { frozen: true }; }],
  ['different staged candidate identity', f => { f.run.candidate = structuredClone(f.candidate); }],
  ['different job candidate id', f => { f.candidate.id = 'workspace-other-job-1'; }],
  ['graph candidate', f => { f.candidate.graphResult = {}; }],
  ['invalid native compilation', f => { f.candidate.sceneResult = { ...f.candidate.sceneResult, valid: false }; }],
  ['unsupported native compilation', f => { f.candidate.sceneResult = { ...f.candidate.sceneResult, supported: false }; }],
  ['missing native object array', f => { f.candidate.sceneResult = { ...f.candidate.sceneResult, objects: null }; }],
  ['empty native object array', f => { f.candidate.sceneResult = { ...f.candidate.sceneResult, objects: [] }; }],
];
for (const [name, mutate] of eligibilityCases) test('actual eligibility fence rejects ' + name + ' before terminal mutation', async () => {
  const f = await fixture(); mutate(f);
  assert.throws(() => f.context.finish(f.run, f.candidate, 7), /검증된 네이티브 도식 작업의 완료 후보가 아닙니다/);
  assert.deepEqual(terminal(f.context), pending); assert.deepEqual(f.calls, []);
});

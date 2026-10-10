const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(new URL('../js/ai-panel.js', `file://${__filename}`), 'utf8');
const handler = source.match(/sendButton\.onclick = \(\) => \{[\s\S]*?\n  \};/)[0];
function route(item, launchSelected = () => false, workflowExplicit = false, conversionKind = 'image') {
  const calls = [];
  const context = { sendButton: {}, launchSelected, conversionKind, selectedOutputItem: () => item,
    readImageLabelWorkflow: () => ({ explicit: workflowExplicit }),
    startScopedEdit: value => calls.push(['scoped', value]),
    submit: (kind, options) => calls.push(['transform', kind, options?.bypassCache]) };
  vm.runInNewContext(handler, context);
  context.sendButton.onclick();
  return calls;
}
assert.deepEqual(route(null), [['transform', 'image', true]]);
assert.deepEqual(route(null, () => false, true), [['transform', 'image', false]], 'An explicit image label workflow must allow its bound output cache');
const emptyRaster = {kind:'generated',comments:[]};
assert.deepEqual(route(emptyRaster), [['scoped',emptyRaster]], 'A raster without boxes must validate instead of regenerating the whole image');
const image = {kind:'generated',comments:[{type:'area',text:'컵만 수정'}]};
assert.deepEqual(route(image), [['scoped',image]]);
const unfinished = {kind:'generated',comments:[{type:'area',text:''}]};
assert.deepEqual(route(unfinished), [['scoped',unfinished]], 'Incomplete area requests must validate, never fall through to full generation');
const pointRaster = {kind:'generated',comments:[{type:'point',text:'수정'}]};
assert.deepEqual(route(pointRaster), [['scoped',pointRaster]], 'Point-only raster comments cannot fall back to full generation');
assert.deepEqual(route({kind:'generated',sceneResult:{},comments:[]}), [['transform','image',true]], 'Native scene generation keeps its existing route');
let graphSelectionOffers = 0;
assert.deepEqual(route(image, () => { graphSelectionOffers += 1; return false; }, false, 'graph'),
  [['transform', 'image', undefined]], 'Graph work uses its own submit route exactly once');
assert.equal(graphSelectionOffers, 1, 'A single graph action checks the owned selection once before submitting');
assert.deepEqual(route(image, () => { graphSelectionOffers += 1; return true; }, false, 'graph'), [],
  'An accepted graph multiselect must not directly submit or scope-edit the active task');
assert.equal(graphSelectionOffers, 2, 'A graph batch delegates the selected task set exactly once');
let batchCalls = 0;
for (const selected of [null, image, unfinished]) {
  assert.deepEqual(route(selected, () => { batchCalls += 1; return true; }), [],
    'An accepted multiselect action must not also submit or scope-edit the active task');
}
assert.equal(batchCalls, 3, 'Each primary click offers the selected task set exactly once');
assert.deepEqual(route(image, null), [['scoped', image]], 'A declared absent batch callback preserves single-task behavior');
console.log('Primary action: original single-task routing, incomplete-area guard, and exclusive batch routing passed');

const library = fs.readFileSync(new URL('../js/unified-library-ui.js', `file://${__filename}`), 'utf8');
const selectedActive = library.match(/const selectedActiveResult = \(\) => \{[\s\S]*?\n  \};/)[0];
const emptyContext = { selectedResult: () => null, cropSession: null, continuousView: null, pdfMatchIndex: 0,
  activePdfPageResult: result => result, pdfFilePageResult: () => { throw new Error('Empty library is not a PDF page'); } };
assert.equal(vm.runInNewContext(selectedActive + '\nselectedActiveResult()', emptyContext), null);
console.log('Library empty selection: no null PDF-view access');

const pdfResult = { id: 'pdf-result', kind: 'pdf' };
const cropContext = { selectedResult: () => pdfResult,
  cropSession: { resultId: pdfResult.id, pageNumber: 2 }, continuousView: null, pdfMatchIndex: 0,
  activePdfPageResult: () => { throw new Error('Crop session must select its bound PDF page'); },
  pdfFilePageResult: (result, pageNumber) => ({ result, pageNumber }) };
assert.deepEqual(vm.runInNewContext(selectedActive + '\nselectedActiveResult()', cropContext),
  { result: pdfResult, pageNumber: 2 });
console.log('Library crop selection: bound PDF page remains active');

const useResultBlock = source.match(/if \(useResult && initialPrepared\) \{[\s\S]*?\n        return;\n      \}/)[0];
const helperStart = source.indexOf('  const isAdoptableImageLabelCandidate =');
const helperEnd = source.indexOf('  const reviewSourceLabelCandidate =', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'Product byte-binding helpers are present');
const bindingHelpers = source.slice(helperStart, helperEnd);
test('result use verifies the bound RAW, inserts prepared objects with labels off and rejects stale bytes', async () => {
  const { imageLabelDigest } = await import('../js/ai-image-label-run.js?v=1.7.0-four-session-integration');
  const { enforceImageLabelAcceptance, isImageLabelCandidateAccepted } = await import('../js/ai-image-review.js?v=1.7.0-four-session-integration');
  const data = 'prepared-candidate-source', candidateSha256 = await imageLabelDigest(data);
  const workflow = { imageKind: 'general', labelResult: 'remove', explicit: true };
  const ids = ['object-counts','inside-outside','liquid-occupancy','connections','composition-state','black-fill-meaning','presentation','request-scope','raster-label-removal','kice-flat-style','flat-gray-regions'];
  const reviewReport = enforceImageLabelAcceptance({ verdict: 'pass', checks: ids.map(id => ({ id, label: id, status: 'pass', detail: 'Complete primary-action fixture review' })), issues: [] }, { workflow, candidateSha256 }).report;
  for (const tampered of [false, true]) {
    const used = [];
    const useContext = { useResult: true, initialPrepared: { assets: [{ id: 'one' }], labelsDisabled: false },
      item: { data: tampered ? 'changed-candidate-source' : data, imageLabelWorkflow: workflow, candidateSha256, reviewReport, reviewState: 'passed' },
      imageLabelDigest, isImageLabelCandidateAccepted, state: {}, isCurrent: () => true, taskId: 'task', candidateId: 'candidate',
      candidateAlreadyInserted: () => false,
      insertEditableAssets: (_state, prepared) => { used.push(prepared); return true; },
      captureActiveTaskTab: () => {}, persistTasks: () => {}, close: options => used.push(options) };
    const execution = vm.runInNewContext(`${bindingHelpers}\n(async () => { ${useResultBlock} })()`, useContext);
    if (tampered) {
      await assert.rejects(execution);
      assert.equal(used.length, 0, 'Changed RAW bytes cannot use a cached prepared result');
    } else {
      await execution;
      assert.equal(used[0].labelsDisabled, true);
      assert.equal(used[0].assets[0].id, 'one');
      assert.equal(used[1].integratedEdit, true);
      assert.equal(useContext.initialPrepared.labelsDisabled, false, 'Do not mutate the prepared cache');
      assert.equal(useContext.item.verifiedCandidateData, data, 'The actual product helper verifies candidate bytes');
      assert.equal(isImageLabelCandidateAccepted({ ...useContext.item, reviewState: 'needs-attention' }), false,
        'An unapproved result cannot bypass the real review guard');
    }
  }
});
test('primary PNG validation rejects empty, point-only and unfinished scopes and accepts a valid bound box', async () => {
  const { collectScopedAreaComments } = await import('../js/ai-scoped-edit-prompt.js?v=1.7.0-four-session-integration');
  assert.throws(() => collectScopedAreaComments(emptyRaster.comments, 'candidate'), /박스/);
  assert.throws(() => collectScopedAreaComments(pointRaster.comments, 'candidate'), /박스/);
  const box = { type: 'area', imageId: 'candidate', x: 10, y: 10, w: 20, h: 20, text: '컵만 수정' };
  assert.throws(() => collectScopedAreaComments([{ ...box, text: '' }], 'candidate'), /수정 내용을/);
  assert.throws(() => collectScopedAreaComments([box], 'another-candidate'), /현재 선택한 이미지/);
  assert.deepEqual(collectScopedAreaComments([box], 'candidate'), [box]);
});

test('repeated missing-review normalization preserves diagnostics and never approves the candidate', async () => {
  const { enforceImageLabelAcceptance } = await import('../js/ai-image-review.js?v=1.7.0-four-session-integration');
  const candidateSha256 = 'a'.repeat(64);
  const options = { workflow: { imageKind: 'general', labelResult: 'restore-editable', explicit: true }, candidateSha256 };
  const report = { verdict: 'uncertain', checks: [], issues: [
    { code: 'optional-review-not-run', message: 'Optional review has not run', severity: 'major', evidence: { retained: true } },
    { code: 'target-correspondence-uncertain', message: 'Correspondence is uncertain', severity: 'major' },
  ], compositeBindings: { candidateSha256, planSha256: 'b'.repeat(64), compositeSha256: 'c'.repeat(64) },
    mechanicalDiagnostics: [{ code: 'retained-pixel-diagnostic' }], targetVerified: false, placementVerified: false };
  const original = structuredClone(report);
  const once = enforceImageLabelAcceptance(report, options);
  assert.equal(once.accepted, false); assert.equal(once.state, 'needs-attention');
  assert.deepEqual(once.report.issues.slice(0, report.issues.length), report.issues);
  assert.equal(once.report.issues.length, report.issues.length + 1);
  assert.deepEqual(once.report.compositeBindings, report.compositeBindings);
  assert.deepEqual(once.report.mechanicalDiagnostics, report.mechanicalDiagnostics);
  let repeated = once;
  for (let i = 0; i < 8; i++) {
    repeated = enforceImageLabelAcceptance(repeated.report, options);
    assert.deepEqual(repeated, once, 'capture, save and reopen must preserve the complete normalized report');
    assert.equal(repeated.accepted, false); assert.equal(repeated.state, 'needs-attention');
  }
  assert.deepEqual(report, original, 'the caller report remains unchanged');
  const warning = once.report.issues.at(-1);
  const distinct = { ...report, issues: [...report.issues,
    { ...warning, message: 'A different missing-review diagnostic' }, { ...warning, severity: 'minor' }] };
  const next = enforceImageLabelAcceptance(distinct, options);
  assert.deepEqual(next.report.issues.slice(0, distinct.issues.length), distinct.issues);
  assert.deepEqual(next.report.issues.at(-1), warning);
  assert.equal(next.report.issues.length, distinct.issues.length + 1, 'same code cannot suppress distinct message or severity');
  const historical = { ...report, issues: [...report.issues, warning, { ...warning, evidence: { historical: true } }] };
  const kept = enforceImageLabelAcceptance(historical, options);
  assert.deepEqual(kept.report.issues, historical.issues, 'existing diagnostics, including historical duplicates, are never filtered');
  assert.deepEqual(enforceImageLabelAcceptance(kept.report, options), kept);
});

test('complete accepted review remains accepted and stable after repeated normalization', async () => {
  const { enforceImageLabelAcceptance, isImageLabelCandidateAccepted } = await import('../js/ai-image-review.js?v=1.7.0-four-session-integration');
  const candidateSha256 = 'd'.repeat(64), workflow = { imageKind: 'general', labelResult: 'remove', explicit: true };
  const ids = ['object-counts','inside-outside','liquid-occupancy','connections','composition-state','black-fill-meaning','presentation','request-scope','raster-label-removal','kice-flat-style','flat-gray-regions'];
  const report = { verdict: 'pass', checks: ids.map(id => ({ id, label: id, status: 'pass', detail: 'Complete independently supplied test review' })), issues: [] };
  const original = structuredClone(report);
  const once = enforceImageLabelAcceptance(report, { workflow, candidateSha256 });
  assert.equal(once.accepted, true); assert.equal(once.state, 'passed');
  assert.deepEqual(enforceImageLabelAcceptance(once.report, { workflow, candidateSha256 }), once);
  assert.equal(isImageLabelCandidateAccepted({ imageLabelWorkflow: workflow, candidateSha256, reviewReport: once.report, reviewState: once.state }), true);
  assert.deepEqual(report, original);
});

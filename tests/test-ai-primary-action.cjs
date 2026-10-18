const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(new URL('../js/ai-panel.js', `file://${__filename}`), 'utf8');
const handler = source.match(/sendButton\.onclick = \(\) => \{[\s\S]*?\n  \};/)[0];
function route(item, launchSelected = () => false, workflowExplicit = false, conversionKind = 'image', examBrief = false) {
  const calls = [];
  const context = { sendButton: {}, launchSelected, conversionKind, selectedOutputItem: () => item,localEraseController:null,
    isGraphWorkflow: kind => kind === 'graph' || kind === 'graph-create', isExamBrief: () => examBrief, taskTabs: new Map(), activeTaskTabId: null,
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
assert.deepEqual(route(image, () => false, false, 'graph-create'), [['transform', 'image', undefined]], 'Description graph creation uses the graph submit route');
assert.deepEqual(route(image, () => false, false, 'image', true), [['transform', 'image', true]], 'A one-line picture result is revised by a new request, not a box-scoped edit');
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
      localEraseController:null,
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


// Exercise the complete actual app adapter at its workflow boundary. The test
// doubles stand in for async input preparation and workflow execution; no
// eligibility condition or request-composition algorithm is reimplemented.
function capturedFirstSourceTurn(runInput, options = {}, { held = false } = {}) {
  const begin = source.indexOf('  const runImageLabelConversion =');
  const end = source.indexOf('\n  const submit =', begin);
  assert.ok(begin >= 0 && end > begin, 'Complete original source-turn adapter must be available');
  const calls = [], ownershipStates = [];
  const boundary = new Error('Controlled workflow boundary reached');
  let enterPreparation, releasePreparation, liveControlReads = 0;
  const preparationEntered = new Promise(resolve => { enterPreparation = resolve; });
  const preparation = new Promise(resolve => { releasePreparation = resolve; });
  const context = {
    AbortController, DOMException, clearTimeout,
    AI_ASSET_GENERATION_MODES: { SINGLE: 'single', SEPARATED: 'separated' },
    SEPARATED_ASSETS_PROMPT: null,
    currentRequestEpoch: 0, activeTaskTabId: 'captured-owner', disposed: false,
    imageLabelRunAbort: null, batchRun: null, requestTimeout: null,
    currentCancelRequested: false, currentTurnType: null, currentEngine: null,
    currentTurnStartedAt: null, currentTerminalOutcome: null, currentTurnDone: false,
    currentRunInput: null, currentTurnPerformance: null, currentCacheRequest: null,
    pendingCacheOutput: null, currentRequestSnapshot: null, providerRequestPersistable: false,
    IMAGE_ENGINE_IDS: { RASTER: 'raster' }, sourceLabelAnalysis: {}, imageLabelRaster: {},
    availableModels: [], outputCache: null, labelBackgroundCache: null,
    taskTabs: new Map([['captured-owner', {}]]), state: { get: () => ({ artboard: { w: 512, h: 384 } }) },
    setBusy: value => ownershipStates.push(['busy', value]), requestPhase() {},
    setTaskState: value => ownershipStates.push(['state', value]), setGenerating() {}, setStatus() {}, captureActiveTaskTab() {}, taskPersistence: { checkpoint: async () => {} },
    commentPrompt: refs => {
      assert.equal(refs[0], runInput.attachments[0], 'Comments remain bound to the captured original');
      return 'Captured original source comments';
    },
    prepareApprovedFirstAttachment: async original => {
      assert.equal(original.data, runInput.attachments[0].data);
      enterPreparation();
      if (held) await preparation;
      return { name: 'INPUT_SOURCE.png', data: original.data };
    },
    createExamLocalRestore: () => undefined,
    executeImageLabelRun: async args => { calls.push(args); throw boundary; },
  };
  for (const control of ['selectedAssetGenerationMode', 'selectedMode', 'selectedCandidateId', 'attachments', 'generatedImages']) {
    Object.defineProperty(context, control, { get() { liveControlReads++; throw new Error(`Read live UI ${control}`); } });
  }
  return {
    context, calls, boundary, ownershipStates, preparationEntered,
    release: () => releasePreparation(), liveReads: () => liveControlReads,
    run: supplement => {
      context.SEPARATED_ASSETS_PROMPT = supplement;
      vm.runInNewContext(source.slice(begin, end) + '\nthis.invokeSourceTurn = runImageLabelConversion;', context);
      return context.invokeSourceTurn({ runInput, request: 'Captured original scientific request',
        generationInstructions: 'Captured original scientific request', options, originatingTaskId: 'captured-owner' });
    },
  };
}

function capturedSourceInput(overrides = {}) {
  const input = {
    imageLabelWorkflow: Object.freeze({ explicit: true, imageKind: 'general', labelResult: 'remove', verificationMode: 'full' }),
    generationMode: 'separated', generated: Object.freeze([]), selectedCandidateId: null,
    attachments: Object.freeze([Object.freeze({ id: 'captured-source', referenceRole: 'INPUT_SOURCE', data: 'data:image/png;base64,captured-original', comments: [] })]),
    model: 'gpt-6.1-sol', effort: 'medium', serviceTier: 'priority', modelCatalog: [],
    ...overrides,
  };
  return Object.freeze(input);
}

test('actual first-source adapter preserves full framing only for the captured first explicit separated request', { timeout: 3000 }, async () => {
  const { SEPARATED_ASSETS_PROMPT } = await import('../js/ai-separated-assets.js?v=1.7.0-four-session-integration');
  const { APPROVED_FIRST_PROMPT, approvedFirstRequestText } = await import('../js/ai-approved-first-png.js?v=1.7.0-four-session-integration');
  const cases = [
    ['first separated source', {}, {}, true],
    ['first single source', { generationMode: 'single' }, {}, false],
    ['saved candidate', { generated: Object.freeze([Object.freeze({ id: 'saved', data: 'saved-RAW', kind: 'generated' })]) }, {}, false],
    ['optional review', {}, { verifyOnly: true }, false],
    ['exam source', { imageLabelWorkflow: Object.freeze({ explicit: true, imageKind: 'exam', labelResult: 'remove' }) }, {}, false],
    ['implicit workflow', { imageLabelWorkflow: Object.freeze({ explicit: false, imageKind: 'general', labelResult: 'remove' }) }, {}, false],
    ['no captured separation choice', { generationMode: undefined }, {}, false],
  ];
  for (const [name, overrides, options, expectsPreservation] of cases) {
    const input = capturedSourceInput(overrides), original = JSON.stringify(input);
    const turn = capturedFirstSourceTurn(input, options);
    await assert.rejects(turn.run(SEPARATED_ASSETS_PROMPT), error => error === turn.boundary);
    assert.equal(turn.calls.length, 1, name);
    const args = turn.calls[0];
    assert.equal(args.source, input.attachments[0], `${name}: original source identity`);
    assert.equal(args.previousCandidates, input.generated, `${name}: previous RAW candidates remain captured`);
    assert.equal(args.workflow, input.imageLabelWorkflow);
    assert.equal(args.verifyOnly, options.verifyOnly === true);
    assert.match(args.generationInstructions, /Captured original scientific request/);
    assert.match(args.generationInstructions, /Captured original source comments/);
    if (expectsPreservation) {
      assert.match(args.generationInstructions, /원본 전체의 종횡비와 프레이밍/);
      assert.match(args.generationInstructions, /객체마다 따로 확대·축소하거나 중앙 정렬하지 않는다/);
      assert.match(args.generationInstructions, /객체를 이동하거나 잘라내지 않는다/);
      assert.equal(args.generationInstructions.split(SEPARATED_ASSETS_PROMPT).length - 1, 1, 'The existing whole supplement appears exactly once');
    } else {
      assert.equal(args.generationInstructions.includes(SEPARATED_ASSETS_PROMPT), false, name);
    }
    const assembled = approvedFirstRequestText({ instructions: args.generationInstructions });
    assert.equal(assembled.startsWith(APPROVED_FIRST_PROMPT), true, 'The entire approved prefix remains immutable');
    assert.equal(assembled.slice(0, APPROVED_FIRST_PROMPT.length), APPROVED_FIRST_PROMPT);
    assert.equal(turn.context.currentRunInput.generationMode, 'single', 'Local separation must not alter the single RAW generation route');
    if (input.imageLabelWorkflow.imageKind === 'general' && !options.verifyOnly) assert.equal(args.generationSource.data, input.attachments[0].data);
    else assert.equal(args.generationSource, undefined);
    assert.equal(JSON.stringify(input), original, `${name}: captured snapshot is not mutated`);
    assert.equal(turn.liveReads(), 0, `${name}: no live controls or selected task inputs`);
    assert.equal(turn.context.imageLabelRunAbort, null, 'Actual finally retires this request controller');
  }
});

test('held source preparation retains captured separation and rejects a retired owner before workflow execution', { timeout: 3000 }, async () => {
  const { SEPARATED_ASSETS_PROMPT } = await import('../js/ai-separated-assets.js?v=1.7.0-four-session-integration');
  for (const retired of [false, true]) {
    const input = capturedSourceInput(), turn = capturedFirstSourceTurn(input, {}, { held: true });
    const pending = turn.run(SEPARATED_ASSETS_PROMPT);
    pending.catch(() => {});
    try {
      await turn.preparationEntered;
      // A real held promise spans the owner transition. Live selection getters
      // throw if request construction reads them instead of the input snapshot.
      if (retired) turn.context.activeTaskTabId = 'new-owner';
    } finally { turn.release(); }
    if (retired) {
      await assert.rejects(pending, error => error.name === 'AbortError');
      assert.equal(turn.calls.length, 0, 'A retired source owner cannot execute or rewrite another task');
      assert.equal(turn.ownershipStates.some(([key]) => key === 'state'), false, 'Stale completion does not alter the new task state');
    } else {
      await assert.rejects(pending, error => error === turn.boundary);
      assert.equal(turn.calls.length, 1);
      assert.match(turn.calls[0].generationInstructions, /원본 전체의 종횡비와 프레이밍/);
      assert.equal(turn.calls[0].source, input.attachments[0]);
    }
    assert.equal(turn.liveReads(), 0);
    assert.equal(turn.context.imageLabelRunAbort, null);
  }
});

for (const received of [false, true]) test(`current image evidence distinguishes review failure from generation failure (${received})`, async () => {
  const f = capturedFirstSourceTurn(capturedSourceInput());
  const raw = {id:'current-image', data:'data:image/png;base64,current', card:{}, reviewState:'needs-attention'};
  const statuses=[];
  f.context.addPreview = async () => raw;
  f.context.setStatus = (message, kind) => statuses.push({message,kind});
  // Even when an old result exists, only this invocation's onRaster permits completion.
  f.context.taskTabs.get('captured-owner').generated = [{id:'older-image',data:raw.data}];
  f.context.executeImageLabelRun = async args => {
    if(received) await args.onRaster({data:raw.data, workflow:{explicit:true}});
    throw new Error(received ? 'review transport unavailable' : 'generation unavailable');
  };
  await assert.rejects(f.run(''), /unavailable/);
  assert.equal(f.context.currentTerminalOutcome, received ? 'completed' : 'failed');
  assert.equal(f.context.taskTabs.get('captured-owner').generationNotice,received?'review':undefined);
  assert.equal(statuses.at(-1).kind,received?'warn':'error');
});

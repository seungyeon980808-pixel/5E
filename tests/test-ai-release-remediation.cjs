const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const panelSource = fs.readFileSync(path.join(root, 'js/ai-panel.js'), 'utf8');
const productModule = name => import(`${pathToFileURL(path.join(root, `js/${name}.js`)).href}?v=1.7.0-four-session-integration`);
const retainedPng = 'data:image/png;base64,' + fs.readFileSync(path.join(root,'tests/fixtures/rights-clear-smoke.png')).toString('base64');
const { fixture: separationPngFixture } = require('./helpers/separation-fixtures.cjs');
async function separationGuards(){ const [panel,output]=await Promise.all([productModule('ai-panel'),productModule('ai-output-processing')]);return {candidateUsesAutomaticSeparation:panel.candidateUsesAutomaticSeparation,candidateUsesSeparatedAssets:panel.candidateUsesSeparatedAssets,isHistoricalPngLocalResult:output.isHistoricalPngLocalResult}; }

function sourcePart(start, end) {
  const first = panelSource.indexOf(start);
  const last = panelSource.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `source bounds exist: ${start}`);
  return panelSource.slice(first, last);
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function flush() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

async function resultInsertionScenario(change = () => {}, { duringDecode = false } = {}) {
  const [review, labels, store, materializer, transform] = await Promise.all([
    'ai-image-review', 'ai-image-label-run', 'store', 'ai-candidate-materializer', 'transform',
  ].map(productModule));
  const guards = await separationGuards();
  const data = retainedPng, candidateSha256 = await labels.imageLabelDigest(data);
  const workflow = { imageKind: 'general', labelResult: 'remove', explicit: true };
  const ids = ['object-counts','inside-outside','liquid-occupancy','connections','composition-state','black-fill-meaning','presentation','request-scope','raster-label-removal','kice-flat-style','flat-gray-regions'];
  const acceptance = review.enforceImageLabelAcceptance({ verdict: 'pass', checks: ids.map(id => ({ id, label: id, status: 'pass', detail: 'Complete race fixture review' })), issues: [] }, { workflow, candidateSha256 });
  assert.equal(acceptance.accepted, true, 'The real review gate accepts the complete, byte-bound baseline fixture');
  const outputGate = deferred();
  const completed = deferred();
  const decodeGate = deferred();
  const decodeStarted = deferred();
  const pageA = [];
  const pageB = [];
  const draft = {
    objects: pageA,
    pages: [{ id: 'A' }, { id: 'B' }],
    activePageId: 'A',
    activeLayerId: 'layer',
    artboard: { w: 90, h: 60 },
    selectedIds: [],
    undoStack: [],
    redoStack: [],
  };
  let workbenchOpen = true;
  const context = {
    state: store.createStore(draft),
    disposed: false,
    localVisibilityEpoch: 0,
    motion: {
      isOpen: () => workbenchOpen,
      hide: () => { workbenchOpen = false; context.panel.inert = true; },
    },
    busy: false,
    output: {},
    item: { id: 'candidate-A', kind:'generated', data, imageLabelWorkflow: workflow, candidateSha256,
      reviewReport: acceptance.report, reviewState: acceptance.state, verifiedCandidateData: data },
    isImageLabelCandidateAccepted: review.isImageLabelCandidateAccepted,
    imageLabelDigest: labels.imageLabelDigest,
    rebuildGroups: transform.rebuildGroups,
    selectedItem: null,
    activeTaskTabId: 'task-A',
    selectedCandidateId: 'candidate-A',
    generatedImages: [],
    selectedSeparationMode: 'off',
    selectedImageOutputOptions: {},
    imageOutputOptionsKey: value => JSON.stringify(value),
    AI_SEPARATION_MODES: { OFF: 'off' },
    ...guards,
    selectedOutputItem: () => context.selectedItem,
    setBusy: (value) => {
      context.busy = value;
      if (!value) completed.resolve();
    },
    setStatus: () => {},
    panel: { hidden: false, inert: false, querySelector: () => null },
    resolveOutputVariant: () => outputGate.promise,
    captureActiveTaskTab: () => {},
    persistTasks: () => {},
    // Closing retires local operations immediately; hidden changes after settling.
    close: () => { context.localVisibilityEpoch += 1; context.motion.hide(); },
    addLog: () => {},
    Image: class {
      naturalWidth = 20;
      naturalHeight = 20;
      set src(_value) {
        decodeStarted.resolve();
        if (duringDecode) decodeGate.promise.then(() => this.onload());
        else queueMicrotask(() => this.onload());
      }
    },
    getLastMouseWorld: () => null,
  };
  const pasteSource = fs.readFileSync(path.join(root, 'js/image-paste.js'), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/^export /gm, '');
  const handler = sourcePart('output.onclick = () => {', '\n      };');
  context.selectedItem = context.item;
  const bindingHelpers = sourcePart('  const isAdoptableImageLabelCandidate =', '  const reviewSourceLabelCandidate =');
  const buttonHelper = sourcePart('  const syncEditableLabelPlanButton =', '  const attachEditableLabelPlan =');
  vm.runInNewContext(`${bindingHelpers}\n${buttonHelper}\n${pasteSource}\n${handler}\n};`, context);
  context.materializeCandidate = materializer.createCandidateMaterializer(context.state, {
    insertImageFromSrc: context.insertImageFromSrc,
    prepareImageCandidateRevision: context.prepareImageCandidateRevision,
    rebuildGroups: transform.rebuildGroups,
  });

  context.output.onclick();
  if (!duringDecode) change(context, { pageA, pageB });
  outputGate.resolve(data);
  if (duringDecode) {
    await decodeStarted.promise;
    change(context, { pageA, pageB });
    decodeGate.resolve();
  }
  await completed.promise;
  // Materialization commits a new objects array. Observe the live active page,
  // not an obsolete pre-transaction array that could hide a successful insert.
  return { context, draft,
    pageA: draft.activePageId === 'A' ? draft.objects : pageA,
    pageB: draft.activePageId === 'B' ? draft.objects : pageB };
}

const switchPage = (context, { pageB }) => context.state.update((state) => {
  state.activePageId = 'B';
  state.objects = pageB;
});

test('AI-160-01: ordinary result use rejects page, close, candidate, and decode races', async () => {
  const toB = await resultInsertionScenario(switchPage);
  assert.equal(toB.pageB.length, 0, 'A to B must not insert on B');

  const backToA = await resultInsertionScenario((context, pages) => {
    switchPage(context, pages);
    context.state.update((state) => {
      state.activePageId = 'A';
      state.objects = pages.pageA;
    });
  });
  assert.equal(backToA.pageA.length, 0, 'A to B to A must remain invalid');

  const closed = await resultInsertionScenario((context) => { context.close(); });
  assert.equal(closed.pageA.length, 0, 'closing the panel must invalidate use');
  assert.equal(closed.context.panel.inert, true, 'Closing makes the panel inert immediately');
  assert.equal(closed.context.panel.hidden, false, 'The close race occurs before the hide animation settles');

  const changedCandidate = await resultInsertionScenario((context) => {
    context.selectedItem = { id: 'candidate-B', kind:'generated', data:retainedPng };
  });
  assert.equal(changedCandidate.pageA.length, 0, 'changing candidate must invalidate use');

  const changedOutput = await resultInsertionScenario(context => { context.selectedImageOutputOptions = { backgroundPolicy: 'connected' }; });
  assert.equal(changedOutput.pageA.length, 0, 'changing output options must invalidate use');

  const decodeRace = await resultInsertionScenario(switchPage, { duringDecode: true });
  assert.equal(decodeRace.pageB.length, 0, 'page changes during image decode must invalidate use');

  const unchanged = await resultInsertionScenario();
  assert.equal(unchanged.pageA.length, 1);
  assert.equal(unchanged.draft.undoStack.length, 1);
});

test('AI-160-02: candidate preparation is keyed by source, output, and separation options', async () => {
  const guards=await separationGuards();
  // Controlled valid PNG variants exercise ownership/options, not provider quality.
  const variants=Object.fromEntries(await Promise.all([['A:thickness-0',160],['B:thickness-2',161],['A:thickness-2',162]].map(async([key,width])=>[key,(await separationPngFixture({width})).dataUrl])));
  const candidateA = { id: 'A', kind: 'generated', data: variants['A:thickness-0'] };
  const candidateB = { id: 'B', kind: 'generated', data: variants['B:thickness-2'] };
  const calls = [];
  const context = {
    generatedImages: [candidateA, candidateB],
    selectedCandidateId: 'A',
    automaticSeparationRun: null,
    automaticSeparationCache: new Map(),
    panel: { dataset: {} },
    activeTaskTabId: 'task-A',
    selectedSeparationMode: 'off',
    selectedImageOutputOptions: {},
    imageOutputOptionsKey: value => JSON.stringify(value),
    selectedImageOutputOptions: { lineThickness: 0 },
    AbortController,
    AI_SEPARATION_MODES: { OFF: 'off', MANUAL: 'manual' },
    syncSelectedOutputActions: () => {},
    ...guards,
    separationOptionsForMode: (mode) => ({ layout: mode }),
    normalizeImageOutputOptions: (value) => ({ ...value }),
    transparentizeGeneratedImage: () => {},
    resolveOutputVariant: async (item) => {
      const options = context.selectedImageOutputOptions;
      const value = `${item.id}:thickness-${options.lineThickness}`;
      calls.push(value);
      return variants[value];
    },
    automaticSeparationCacheKey: async (data, options, separation) => `${data}:${options.lineThickness}:${separation.layout}`,
    prepareSeparatedAssets: async (data) => ({ assets: [{ id: data, source: data }] }),
  };
  vm.runInNewContext(sourcePart('  function selectedOutputItem() {', '  function candidateAlreadyInserted(item) {'), context);

  context.selectedSeparationMode = 'auto';
  context.restartSelectedAutomaticSeparation('separation-mode-changed');
  await context.automaticSeparationRun.promise;
  context.selectedCandidateId = 'B';
  context.selectedImageOutputOptions = { lineThickness: 2 };
  context.restartSelectedAutomaticSeparation();
  await context.automaticSeparationRun.promise;
  context.selectedCandidateId = 'A';
  const prepared = await context.startAutomaticSeparation(candidateA);

  assert.equal(prepared.assets[0].source, variants['A:thickness-2']);
  assert.deepEqual(calls, ['A:thickness-0', 'B:thickness-2', 'A:thickness-2']);
});

test('AI-160-02: the real cache key changes for every rendered or separation input', async () => {
  const module = await productModule('ai-panel');
  const source = retainedPng;
  const alternative=(await separationPngFixture({width:161})).dataUrl;
  const output = { backgroundPolicy: 'preserve', examPalette: false, lineThickness: 0 };
  const separation = { layout: 'auto', maxAssets: 128, maxDurationMs: 8000 };
  const base = await module.automaticSeparationCacheKey(source, output, separation);
  const variants = await Promise.all([
    module.automaticSeparationCacheKey(alternative, output, separation),
    module.automaticSeparationCacheKey(source, { ...output, backgroundPolicy: 'connected' }, separation),
    module.automaticSeparationCacheKey(source, { ...output, examPalette: true }, separation),
    module.automaticSeparationCacheKey(source, { ...output, lineThickness: 2 }, separation),
    module.automaticSeparationCacheKey(source, output, { ...separation, layout: 'grid' }),
  ]);
  assert.equal(new Set([base, ...variants]).size, variants.length + 1);
});

async function submitContext(statusPromise) {
  const [quality, workflow, kice, white, models, snapshots, references, composition, marks, requests] = await Promise.all([
    'ai-quality-mode', 'ai-image-label-workflow', 'kice-image-workflow', 'ai-white-png',
    'ai-model-capabilities', 'ai-candidate-snapshot', 'ai-reference-roles', 'ai-source-tasking', 'ai-mark-policy', 'ai-request-plan',
  ].map(productModule));
  const sends = [];
  let statusCalls = 0;
  const context = {
    panel: { dataset: {}, hidden: false },
    disposed: false,
    busy: false,
    conversionKind: 'image',
    desktop: { web: true, status: () => { statusCalls += 1; return statusPromise; } },
    input: { value: 'request-A' },
    chatInput: { value: 'request-A' },
    activeTaskTabId: 'task-A',
    attachments: [{ id: 'source-A' }],
    generatedImages: [],
    selectedMode: 'diagram',
    // This preflight fixture exercises the native scene request path. Raster
    // requests enter the explicit image-label workflow before the legacy tail.
    selectedOutputEngine: quality.AI_OUTPUT_ENGINES.ASSET,
    AI_OUTPUT_ENGINES: quality.AI_OUTPUT_ENGINES,
    normalizeOutputEngine: quality.normalizeOutputEngine,
    selectedQualityMode: 'default',
    selectedCandidateId: null,
    referenceComposition: {},
    selectedAssetGenerationMode: 'single',
    modelSelect: { value: 'synthetic' },
    effortSelect: { value: 'medium' },
    speedSelect: { value: '' },
    reviewModeCheckbox: { checked: false },
    currentRequestEpoch: 0,
    preflightRun: null,
    batchRun: null,
    modelsLoaded: true,
    availableModels: [{ model: 'synthetic', supportedReasoningEfforts: ['medium'], serviceTiers: ['priority'] }],
    modelSelection: () => ({model:'synthetic',effort:'medium',serviceTier:null}),
    savedModelPreference: () => ({model:'synthetic',effort:'medium',serviceTier:null}),
    defaultAIModelSelection: models.defaultAIModelSelection,
    requestToken: null,
    beginRequest: () => { context.requestToken = {}; return context.requestToken; },
    requestStates: { live: () => true, advance: () => {} },
    requestPhase: () => {},
    setGenerating: () => {},
    queueMicrotask,
    structuredClone,
    isWhitePngWorkflow: white.isWhitePngWorkflow,
    kiceImageRequest: kice.kiceImageRequest,
    compactConversation: requests.compactConversation,
    conversationMessages: [],
    recordConversationMessage: (role, text) => context.conversationMessages.push({ role, text }),
    snapshotImageItem: snapshots.snapshotImageItem,
    enforceKiceImageRunInput: kice.enforceKiceImageRunInput,
    normalizeReferenceComposition: composition.normalizeReferenceComposition,
    normalizeMarkPolicy: marks.normalizeMarkPolicy,
    readMarkPolicy: () => marks.normalizeMarkPolicy({}),
    readPreserveSourceLabels: () => false,
    readImageLabelWorkflow: () => workflow.normalizeImageLabelWorkflow(null),
    normalizeImageLabelWorkflow: workflow.normalizeImageLabelWorkflow,
    preciseRestoreCheckbox: { checked: false },
    partitionReferenceItems: references.partitionReferenceItems,
    orderedInputReferences: (value) => value,
    commentPrompt: () => '',
    refresh: () => {},
    setStatus: () => {},
    setBusy: (value) => { context.busy = value; sends.push(value); },
  };
  const prefix = sourcePart('  const submit = async (type, options = {}) => {', '    imageReceived = false;');
  vm.runInNewContext(`${prefix}\nreturn {request, taskId:activeTaskTabId, sourceIds:runInput.attachments.map(item=>item.id), reviewEnabled:runInput.reviewEnabled, requestEpoch};\n};\nglobalThis.submit = submit;`, context);
  return { context, sends, statusCalls: () => statusCalls };
}

test('AI-160-03: preflight locks before status await so a double click prepares one request', async () => {
  const status = deferred();
  const { context, sends, statusCalls } = await submitContext(status.promise);
  const first = context.submit('image');
  const second = context.submit('image');
  status.resolve({ login: { loggedIn: true } });
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult.request, 'request-A');
  assert.equal(firstResult.taskId, 'task-A');
  assert.equal(firstResult.sourceIds.join(','), 'source-A');
  assert.equal(firstResult.requestEpoch, 1);
  assert.equal(secondResult, undefined);
  assert.deepEqual(sends, [true], 'only the owning preflight may enter the request pipeline');
  assert.equal(statusCalls(), 1, 'a double click must perform one status preflight');
});

test('AI-160-03: model loading is covered by the same preflight lock', async () => {
  const models = deferred();
  const { context, statusCalls } = await submitContext(Promise.resolve({ login: { loggedIn: true } }));
  context.modelsLoaded = false;
  context.loadModels = () => models.promise;
  const first = context.submit('image');
  await flush();
  const second = context.submit('image');
  models.resolve();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult.request, 'request-A');
  assert.equal(secondResult, undefined);
  assert.equal(statusCalls(), 1);
});

test('AI-160-03: task input is captured before delayed status and model awaits', async () => {
  const status = deferred();
  const { context } = await submitContext(status.promise);
  const request = context.submit('image');
  context.activeTaskTabId = 'task-B';
  context.input.value = 'request-B';
  context.attachments = [{ id: 'source-B' }];
  status.resolve({ login: { loggedIn: true } });
  const result = await request;

  assert.ok(result === undefined || (
    result.taskId === 'task-A'
    && result.request === 'request-A'
    && result.sourceIds.join(',') === 'source-A'
  ), 'a request clicked in task A must be cancelled or remain bound to task A');
});

test('AI-160-03: a failed preflight releases only its own lock so retry can start', async () => {
  const firstStatus = deferred();
  const { context } = await submitContext(firstStatus.promise);
  const first = context.submit('image');
  firstStatus.resolve(Promise.reject(new Error('synthetic status failure')));
  assert.equal(await first, undefined);
  assert.equal(context.preflightRun, null);

  context.desktop.status = async () => ({ login: { loggedIn: true } });
  const retry = await context.submit('image');
  assert.equal(retry.request, 'request-A');
  assert.equal(retry.sourceIds.join(','), 'source-A');
});

test('AI-160-02: an aborted separation never publishes a stale ready result', async () => {
  const guards=await separationGuards();
  const candidate = { id: 'A', kind: 'generated', data: retainedPng };
  const pending = deferred(),entered=deferred();
  const context = {
    generatedImages: [candidate], selectedCandidateId: 'A', automaticSeparationRun: null,
    automaticSeparationCache: new Map(), panel: { dataset: {} }, activeTaskTabId: 'task-A',
    selectedSeparationMode: 'auto', selectedImageOutputOptions: { lineThickness: 0 }, AbortController,
    AI_SEPARATION_MODES: { OFF: 'off', MANUAL: 'manual' }, syncSelectedOutputActions: () => {},
    ...guards, separationOptionsForMode: () => ({ layout: 'auto' }),
    normalizeImageOutputOptions: (value) => value, transparentizeGeneratedImage: () => {},
    resolveOutputVariant: async () => retainedPng, automaticSeparationCacheKey: async () => 'key-A',
    prepareSeparatedAssets: () => {entered.resolve();return pending.promise;},
  };
  vm.runInNewContext(sourcePart('  function selectedOutputItem() {', '  function candidateAlreadyInserted(item) {'), context);
  const obsolete = context.startAutomaticSeparation(candidate);
  await entered.promise;
  context.abortAutomaticSeparation('candidate-changed');
  pending.resolve({ assets: [{ id: 'obsolete' }] });
  await obsolete;
  assert.notEqual(candidate.automaticSeparationState, 'ready');
  assert.equal(candidate.automaticSeparationPrepared, null);
});

test('SEC-160-04: default sharing serializes only the active workspace and active task', async () => {
  const module = await import(`${pathToFileURL(path.join(root, 'js/ai-sharing-document.mjs')).href}?v=1.7.0-four-session-integration`);
  const image = { id: 'image', name: 'image', kind: 'generated', data: 'data:image/png;base64,AA==' };
  const task = (id, input) => ({ id, title: id, attachments: [], generated: [image], conversationMessages: [], input });
  const workspaces = [
    { tabs: [task('A-active', 'share me'), task('A-private', 'private A')], activeTaskTabId: 'A-active' },
    { tabs: [task('B-private', 'private B')], activeTaskTabId: 'B-private' },
  ];
  const document = await module.createSharingDocument(workspaces, { activeWorkspace: 0 });

  assert.equal(document.workspaces.length, 1);
  assert.deepEqual(document.workspaces[0].tabs.map((tab) => tab.id), ['A-active']);
  assert.equal(JSON.stringify(document).includes('private'), false);
});

for (const enabled of [false, true]) {
  test(`white revision terminal routes captured review preference ${enabled} without reading live model controls`, () => {
    const calls = [];
    const context = {
      currentRequestEpoch: 7, serverTurnFinished: true, previewPending: false, batchRun: null,
      currentImageOutputError: null, currentTerminalOutcome: 'completed',
      currentRunInput: { model: 'catalog-luna', effort: 'high', serviceTier: null, reviewEnabled: enabled },
      currentTurnType: 'image', currentEngine: 'raster', IMAGE_ENGINE_IDS: { RASTER: 'raster' },
      isWhitePngWorkflow: () => true, imageReceived: true, currentReviewCandidate: { id: 'owner-candidate' },
      currentReviewScheduled: false, pendingCacheOutput: {}, currentTurnStartedAt: Date.now(),
      advanceGenerationClock() {}, reviewModeCheckbox: { checked: !enabled },
      handleReviewLifecycle: (detail, candidate) => calls.push({ type: 'lifecycle', detail, candidate }),
      beginWhiteImageReview: (candidate, epoch) => calls.push({ type: 'review', candidate, epoch }),
      get modelSelect() { throw new Error('live model selection must not replace originating config'); },
      get effortSelect() { throw new Error('live effort selection must not replace originating config'); },
    };
    vm.createContext(context);
    const finish = panelSource.match(/  const finishCurrentTurnUi = \([\s\S]*?\n  \};/)[0];
    const predicate = panelSource.match(/  const reviewEnabled = [^\n]+/)[0];
    vm.runInContext(`${predicate}\n${finish}\nfinishCurrentTurnUi(6); finishCurrentTurnUi(7); finishCurrentTurnUi(7);`, context);
    assert.equal(calls.length, 1, 'stale and duplicate terminal callbacks must not route another review');
    assert.equal(calls[0].candidate.id, 'owner-candidate');
    if (enabled) {
      assert.equal(calls[0].type, 'review');
      assert.equal(calls[0].epoch, 7);
    } else {
      assert.equal(calls[0].type, 'lifecycle');
      assert.equal(calls[0].detail.state, 'needs-attention');
      assert.equal(calls[0].detail.reviewCount, 0);
      assert.equal(calls[0].detail.model, 'catalog-luna');
      assert.equal(calls[0].detail.effort, 'high');
      assert.equal(calls[0].detail.serviceTier, null);
    }
  });
}

test('review preference is captured before delayed status even if its control changes', async () => {
  const status = deferred();
  const { context } = await submitContext(status.promise);
  const pending = context.submit('image');
  context.reviewModeCheckbox.checked = true;
  status.resolve({ login: { loggedIn: true } });
  assert.equal((await pending).reviewEnabled, false);
});

test('raster preflight retains the actual explicit-workflow guard and captured request ownership', async () => {
  const { normalizeImageLabelWorkflow } = await productModule('ai-image-label-workflow');
  const { context: invalid } = await submitContext(Promise.resolve({ login: { loggedIn: true } }));
  const errors = [], invalidRuns = [];
  invalid.selectedOutputEngine = invalid.AI_OUTPUT_ENGINES.RASTER;
  invalid.setStatus = (message, type) => errors.push({ message, type });
  invalid.runImageLabelConversion = async detail => invalidRuns.push(detail);
  await invalid.submit('image');
  assert.equal(invalidRuns.length, 0, 'Missing explicit policy cannot reach the conversion boundary');
  assert.ok(errors.some(error => error.type === 'error' && /이미지 종류와 라벨 처리 선택/.test(error.message)));
  assert.equal(invalid.preflightRun, null);

  const status = deferred();
  const { context: valid, statusCalls } = await submitContext(status.promise);
  const runs = [];
  valid.selectedOutputEngine = valid.AI_OUTPUT_ENGINES.RASTER;
  const workflow = normalizeImageLabelWorkflow({ imageKind: 'general', labelResult: 'restore-editable' }, { requireExplicit: true });
  valid.readImageLabelWorkflow = () => workflow;
  valid.runImageLabelConversion = async detail => runs.push(detail);
  const first = valid.submit('image'), second = valid.submit('image');
  valid.readImageLabelWorkflow = () => normalizeImageLabelWorkflow({ imageKind: 'exam', labelResult: 'remove' });
  valid.reviewModeCheckbox.checked = true;
  status.resolve({ login: { loggedIn: true } });
  await Promise.all([first, second]);
  assert.equal(statusCalls(), 1);
  assert.equal(runs.length, 1, 'Only the owning preflight reaches the real normalized conversion route');
  assert.equal(runs[0].originatingTaskId, 'task-A');
  assert.equal(runs[0].request, 'request-A');
  assert.deepEqual(Array.from(runs[0].runInput.attachments, item => item.id), ['source-A']);
  assert.deepEqual(runs[0].runInput.imageLabelWorkflow, workflow);
  assert.equal(runs[0].runInput.reviewEnabled, false);
});

test('batch capture retains only selected revision inputs and immutable operation settings without changing stored history', async () => {
  const [{ snapshotImageItem }, { collectScopedAreaComments }, models, workflow, quality] = await Promise.all([
    'ai-candidate-snapshot', 'ai-scoped-edit-prompt', 'ai-model-capabilities', 'ai-image-label-workflow', 'ai-quality-mode',
  ].map(productModule));
  const source = { id:'original',kind:'reference',data:'original-bytes',comments:[{text:'original comment'}] };
  const selected = { id:'selected',kind:'generated',data:'selected-bytes',comments:[{type:'area',imageId:'selected',x:10,y:10,w:20,h:20,text:'captured comment'}] };
  const tab = { id:'A',title:'A',input:'request',attachments:[source],generated:[{id:'older',data:'history-bytes'},selected,{id:'newer',data:'newer-history'}],selectedCandidateId:'selected',model:'catalog-sol',effort:'medium',serviceTier:null,mode:'diagram',outputEngine:'raster',qualityMode:'default',generationMode:'single',referenceComposition:{kind:'all'},markPolicy:{text:'preserve'},imageLabelWorkflow:workflow.normalizeImageLabelWorkflow({imageKind:'general',labelResult:'restore-editable'}),conversationMessages:[],uiMessages:[{text:'unrelated history'}] };
  const stored=JSON.stringify(tab);
  const context={structuredClone,collectScopedAreaComments,scopedPromptMode:{value:'compact'},
    taskTabs:new Map([['A',tab]]),activeTaskTabId:'C',
    availableModels:['catalog-sol','catalog-luna'].map(model=>({model,supportedReasoningEfforts:['medium'],serviceTiers:['priority']})),
    snapshotImageItem,defaultAIModelSelection:models.defaultAIModelSelection,resolveAIModelSelection:models.resolveAIModelSelection,
    normalizeImageLabelWorkflow:workflow.normalizeImageLabelWorkflow,AI_OUTPUT_ENGINES:quality.AI_OUTPUT_ENGINES,
    compactConversation:()=>'',batchOwner:taskId=>({taskId,scope:{sessionId:'session',workspaceId:'workspace'}}),
    panel:{dataset:{}},busy:false,preflightRun:null,desktop:{send(){}}};
  vm.runInNewContext(sourcePart('  function captureBatchTask(id) {','  async function runWorkspaceBatch(context,emit) {')+'\nglobalThis.capture=captureBatchTask;globalThis.preflight=preflightBatch;',context);
  const scoped=context.capture('A');
  assert.equal(scoped.snapshot.operation,'scoped-edit');
  assert.equal(scoped.snapshot.options.attachments.length,0);
  assert.deepEqual(Array.from(scoped.snapshot.options.generated,item=>item.id),['selected']);
  assert.equal(scoped.snapshot.options.uiMessages,undefined);
  assert.equal(scoped.snapshot.scopeEdit.promptMode,'compact');
  assert.equal(scoped.snapshot.options.serviceTier,'priority');
  context.scopedPromptMode.value='legacy';
  assert.equal(scoped.snapshot.scopeEdit.promptMode,'compact','A later control change must not change the queued request');
  assert.equal(context.preflight(scoped),null);
  assert.equal(JSON.stringify(tab),stored);
  selected.comments[0].text='later comment';tab.model='catalog-luna';
  assert.equal(scoped.snapshot.comments[0].text,'captured comment');
  assert.equal(scoped.snapshot.options.model,'catalog-sol');
  selected.data='changed source';assert.match(context.preflight(scoped),/원본 버전이 변경/);selected.data='selected-bytes';
  selected.comments=[];
  const missingBox=context.capture('A');
  assert.equal(missingBox.snapshot.operation,'scoped-edit');
  assert.match(context.preflight(missingBox),/박스/);
  assert.equal(missingBox.snapshot.options.attachments.length,0,'Missing boxes cannot turn a raster revision into a new whole-image request');
  selected.sceneResult={};
  const normal=context.capture('A');
  assert.equal(normal.snapshot.operation,'generate');
  assert.deepEqual(Array.from(normal.snapshot.options.generated,item=>item.id),['selected']);
  assert.equal(normal.snapshot.options.attachments[0].data,'original-bytes');
  assert.equal(normal.snapshot.options.attachments[0].comments[0].text,'original comment');
  assert.equal(context.preflight(normal),null,'A native scene request with an explicit workflow and real catalog remains valid');
  const invalidPolicy=structuredClone(normal);
  invalidPolicy.snapshot.options.imageLabelWorkflow={explicit:false};
  assert.match(context.preflight(invalidPolicy),/이미지 종류와 라벨 처리 선택/);
  const invalidModel=structuredClone(normal);
  invalidModel.snapshot.model='missing-model';
  invalidModel.snapshot.options.model='missing-model';
  assert.match(context.preflight(invalidModel),/선택 모델 missing-model/);
  assert.equal(tab.generated.length,3);
});


test('bound RAW cannot enter automatic, manual or cached legacy-separated delegates', async()=>{
  const [guards,review,labels,store]=await Promise.all([separationGuards(),productModule('ai-image-review'),productModule('ai-image-label-run'),productModule('store')]);
  const candidateSha256=await labels.imageLabelDigest(retainedPng),workflow={imageKind:'general',labelResult:'remove',explicit:true};
  const ids=['object-counts','inside-outside','liquid-occupancy','connections','composition-state','black-fill-meaning','presentation','request-scope','raster-label-removal','kice-flat-style','flat-gray-regions'];
  const acceptance=review.enforceImageLabelAcceptance({verdict:'pass',checks:ids.map(id=>({id,label:id,status:'pass',detail:'Controlled complete byte-bound unit review'})),issues:[]},{workflow,candidateSha256});
  assert.equal(acceptance.accepted,true);
  for(const metadata of [{},{imageLabelWorkflow:false},{imageLabelWorkflow:{}},{labelPlan:{frozen:true}},{targetPlacement:{}},{scopedEditHistory:[{status:'cancelled'}]},{graphResult:{}},{sceneResult:{objects:[]}},{nativeGraph:{}},{candidateSha256:'invalid'}]){
    const candidate={id:'protected',kind:'generated',data:retainedPng,imageLabelWorkflow:workflow,candidateSha256,reviewReport:acceptance.report,reviewState:acceptance.state,verifiedCandidateData:retainedPng,
      generationMode:'separated',automaticSeparationState:'ready',automaticSeparationPrepared:{assets:[{id:'stale',data:retainedPng}]},...metadata};
    const before=structuredClone(candidate),calls={variant:0,automatic:0,dialog:0,insertion:0},statuses=[];
    const context={...guards,generatedImages:[candidate],selectedCandidateId:candidate.id,activeTaskTabId:'task-A',selectedSeparationMode:'auto',selectedImageOutputOptions:{},
      automaticSeparationRun:null,automaticSeparationCache:new Map(),AbortController,panel:{dataset:{}},AI_SEPARATION_MODES:{OFF:'off',MANUAL:'manual'},
      disposed:false,motion:{isOpen:()=>true},localVisibilityEpoch:0,busy:false,currentRequestEpoch:1,state:store.createStore({activePageId:'A',objects:[],artboard:{w:90,h:60},activeLayerId:1}),
      isAdoptableImageLabelCandidate:review.isImageLabelCandidateAccepted,verifyImageLabelCandidateBytes:async item=>!item.imageLabelWorkflow?.explicit||(await labels.imageLabelDigest(item.data)===item.candidateSha256&&review.isImageLabelCandidateAccepted(item)),
      imageOutputOptionsKey:JSON.stringify,normalizeImageOutputOptions:value=>value,separationOptionsForMode:()=>({layout:'auto'}),automaticSeparationCacheKey:async()=> 'cached',
      resolveOutputVariant:async()=>{calls.variant++;return retainedPng;},prepareSeparatedAssets:async()=>{calls.automatic++;throw Error('Protected RAW reached segmentation');},
      openEditableAssetsDialog:async()=>{calls.dialog++;throw Error('Protected RAW reached manual processing');},insertEditableAssets:()=>{calls.insertion++;return true;},
      setStatus:(text,level)=>statuses.push({text,level}),syncSelectedOutputActions(){},captureActiveTaskTab(){},persistTasks(){},prepareEditableLabelFonts:async()=>{}};
    vm.runInNewContext(sourcePart('  function selectedOutputItem() {','  function syncSelectedOutputActions() {'),context);
    for(const mode of ['auto','grid','manual']){
      context.selectedSeparationMode=mode;
      assert.equal(await context.startAutomaticSeparation(candidate),null);
      await context.openGroupsForItem(candidate,false,mode==='manual',true);
      await context.openGroupsForItem(candidate,true,true,true); // Cached legacy flag cannot bypass the RAW guard.
    }
    assert.deepEqual(calls,{variant:0,automatic:0,dialog:0,insertion:0});
    assert.deepEqual(candidate,before,'Neither stale cached assets nor malformed metadata may mutate RAW');
    assert.equal(context.state.get().objects.length,0);assert.ok(statuses.every(status=>status.level==='warn'));
  }
});

test('a historical separation awaiting its source loses authority if RAW metadata appears',async()=>{
  const guards=await separationGuards(),source=deferred(),entered=deferred();let preparedCalls=0;
  const item={id:'A',kind:'generated',data:retainedPng};
  const context={...guards,generatedImages:[item],selectedCandidateId:'A',activeTaskTabId:'task-A',selectedSeparationMode:'auto',selectedImageOutputOptions:{},automaticSeparationRun:null,automaticSeparationCache:new Map(),AbortController,
    panel:{dataset:{}},AI_SEPARATION_MODES:{OFF:'off',MANUAL:'manual'},syncSelectedOutputActions(){},normalizeImageOutputOptions:value=>value,separationOptionsForMode:()=>({layout:'auto'}),
    resolveOutputVariant:()=>{entered.resolve();return source.promise;},automaticSeparationCacheKey:async()=> 'key',prepareSeparatedAssets:async()=>{preparedCalls++;return {assets:[{id:'forbidden'}]};}};
  vm.runInNewContext(sourcePart('  function selectedOutputItem() {','  function candidateAlreadyInserted(item) {'),context);
  const pending=context.startAutomaticSeparation(item);await entered.promise;
  item.imageLabelWorkflow={explicit:true};const now=structuredClone(item);source.resolve(retainedPng);
  assert.equal(await pending,null);assert.equal(preparedCalls,0);assert.deepEqual(item,now);assert.equal(context.automaticSeparationRun,null);
});


test('a held historical manual byte check cannot annotate or process newly bound RAW',async()=>{
  const [guards,review,store]=await Promise.all([separationGuards(),productModule('ai-image-review'),productModule('store')]);
  const item={id:'A',kind:'generated',data:retainedPng,separatedAssetsError:'Retained historical error'},byteCheck=deferred(),entered=deferred();
  const calls={variant:0,dialog:0,capture:0,persist:0};
  const context={...guards,generatedImages:[item],selectedCandidateId:item.id,activeTaskTabId:'task-A',selectedSeparationMode:'manual',selectedImageOutputOptions:{},
    automaticSeparationRun:null,automaticSeparationCache:new Map(),AbortController,panel:{dataset:{}},AI_SEPARATION_MODES:{OFF:'off',MANUAL:'manual'},
    disposed:false,motion:{isOpen:()=>true},localVisibilityEpoch:0,busy:false,currentRequestEpoch:1,state:store.createStore({activePageId:'A',objects:[],artboard:{w:90,h:60},activeLayerId:1}),
    isAdoptableImageLabelCandidate:review.isImageLabelCandidateAccepted,verifyImageLabelCandidateBytes:()=>{entered.resolve();return byteCheck.promise;},imageOutputOptionsKey:JSON.stringify,
    resolveOutputVariant:async()=>{calls.variant++;return retainedPng;},openEditableAssetsDialog:async()=>{calls.dialog++;throw Error('Rebound RAW reached manual segmentation');},
    setStatus(){},syncSelectedOutputActions(){},captureActiveTaskTab(){calls.capture++;},persistTasks(){calls.persist++;}};
  vm.runInNewContext(sourcePart('  function selectedOutputItem() {','  function syncSelectedOutputActions() {'),context);
  const pending=context.openGroupsForItem(item,true,true,false);await entered.promise;
  item.imageLabelWorkflow={explicit:true};const now=structuredClone(item);byteCheck.resolve(true);await pending;
  assert.deepEqual(item,now,'The obsolete separated-error branch must preserve every newly bound RAW field');
  assert.deepEqual(calls,{variant:0,dialog:0,capture:0,persist:0});assert.equal(context.state.get().objects.length,0);
});

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

for (const transition of ['scoped-start', 'scoped-cancel', 'workflow-bound', 'scoped-decode-failure']) {
  test('pending historical conversion returns RAW after ' + transition, async () => {
    const { resolveImageOutput } = await productModule('ai-output-processing');
    const item = { id: 'pending-historical', kind: 'generated', data: retainedPng };
    const entered = deferred(), gate = deferred(); let calls = 0;
    const pending = resolveImageOutput(item, { backgroundPolicy: 'connected' }, (data) => {
      assert.equal(data, retainedPng); calls++; entered.resolve(); return gate.promise;
    });
    await entered.promise;
    if (transition === 'workflow-bound') item.imageLabelWorkflow = { explicit: true };
    else item.scopedEditHistory = [{ status: transition === 'scoped-cancel' ? 'cancelled' : 'preparing' }];
    const bound = structuredClone(item);
    if (transition === 'scoped-decode-failure') gate.reject(new Error('Obsolete local decoding failed'));
    else gate.resolve('local-transformed-output');
    assert.equal(await pending, retainedPng);
    assert.equal(calls, 1); assert.deepEqual(item, bound, 'Late local processing cannot mutate newly bound RAW metadata or bytes');
  });
}

test('unchanged historical conversion retains its real result and failure', async () => {
  const { resolveImageOutput } = await productModule('ai-output-processing');
  const item = { id: 'historical', kind: 'generated', data: retainedPng };
  const gate = deferred(); let entered = false;
  const pending = resolveImageOutput(item, { backgroundPolicy: 'connected' }, () => { entered = true; return gate.promise; });
  assert.equal(entered, true); gate.resolve('local-transformed-output');
  assert.equal(await pending, 'local-transformed-output');
  const failure = new Error('Current historical decoding failed');
  await assert.rejects(resolveImageOutput(item, { backgroundPolicy: 'connected' }, async () => { throw failure; }), error => error === failure);
  assert.equal(item.data, retainedPng); assert.equal(item.scopedEditHistory, undefined);
});

for (const failed of [false, true]) test('settled local cache respects a newly bound RAW contract: ' + (failed ? 'rejection' : 'result'), async () => {
  const output = await productModule('ai-output-processing');
  const item = { id: 'cached-historical', kind: 'generated', data: retainedPng };
  const options = { backgroundPolicy: 'connected' }, cache = new WeakMap();
  const settled = failed ? Promise.reject(new Error('Obsolete cached failure')) : Promise.resolve('cached-local-output');
  cache.set(item, new Map([[output.imageOutputOptionsKey(options), settled]]));
  const context = { ...output, panel: { dataset: { aiBoxEdit: 'true' } }, selectedOutputItem: () => item,
    selectedImageOutputOptions: options, outputVariantCache: cache,
    transparentizeGeneratedImage: () => { throw new Error('The settled-cache case must not restart conversion'); } };
  vm.runInNewContext(sourcePart('  const resolveOutputVariant = (item) => {', '  const renderOutputVariant = async (item')
    + '\nglobalThis.variant = resolveOutputVariant;', context);
  const pending = context.variant(item);
  item.scopedEditHistory = [{ status: 'preparing' }]; const bound = structuredClone(item);
  assert.equal(await pending, retainedPng);
  assert.deepEqual(item, bound);
});

function sourcePart(start, end) {
  const first = panelSource.indexOf(start);
  const last = panelSource.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `source bounds exist: ${start}`);
  return panelSource.slice(first, last);
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
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
    labelPreviewStates: new WeakMap(),
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
  const labelViewHelper = sourcePart('  function labelPreviewState(item) {', '  function ensureCompositePreviewControl(item) {');
  vm.runInNewContext(`${bindingHelpers}\n${buttonHelper}\n${labelViewHelper}\n${pasteSource}\n${handler}\n};`, context);
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
  for (const duringDecode of [false, true]) {
    const changedLabelView = await resultInsertionScenario(context => {
      context.labelPreviewStates.get(context.item).included = false;
    }, { duringDecode });
    assert.equal(changedLabelView.pageA.length, 0, 'Changed visible label choice cannot commit an older insertion');
  }
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


// Managed collective export races: actual controller source and portable writer.
// Held local-decode/filesystem promises replace only completion transport.
async function managedExportFixture({active='owner',held=false}={}) {
  const api=await productModule('ai-task-export'),output=await productModule('ai-output-processing');
  const current={id:'export-candidate',kind:'generated',data:retainedPng};
  const tab={id:'owner',title:'원본 작업',attachments:[],generated:[structuredClone(current)],
    selectedCandidateId:current.id,outputOptions:{backgroundPolicy:'connected'},workState:'completed',
    batchOwner:{scope:{sessionId:'5e',workspaceId:'exports'},taskId:'owner'}};
  const gate=deferred(),entered=deferred();
  const c={structuredClone,clientScope:'exports',disposed:false,activeTaskTabId:active,busy:active!=='owner',
    preflightRun:null,taskTabs:new Map([[tab.id,tab]]),taskViews:new Map(),generatedImages:active==='owner'?[current]:[],
    captureActiveTaskTab:()=>{},taskExportSelection:api.taskExportSelection,
    normalizeImageOutputOptions:output.normalizeImageOutputOptions,requiresRawImageOutput:output.requiresRawImageOutput,
    resolveImageOutput:output.resolveImageOutput,transparentizeGeneratedImage:()=>{entered.resolve();return held?gate.promise:'data:image/png;base64,AQID';}};
  c.taskViews.set(tab.id,{attachments:[],generatedImages:[current],sourceSnapshot:tab.attachments,outputSnapshot:tab.generated});
  const owners=sourcePart('  const batchOwner = id =>','  function captureBatchTask(id) {');
  const code=sourcePart('  const exportResults = async (mode,kind = null) => {','  collectiveExportButton.addEventListener(');
  vm.runInNewContext(owners+'\n'+code+'\nglobalThis.exportResults=exportResults;',c);
  return{c,tab,current,gate,entered,api};
}
for(const active of ['owner','unrelated-busy-task']) {
  test('collective export reads late RAW from the live '+active+' owner without changing the captured snapshot',async()=>{
    const f=await managedExportFixture({active,held:true}),snapshot=structuredClone(f.tab.generated);
    const pending=f.c.exportResults('selected');await f.entered.promise;
    f.current.scopedEditHistory=[{status:'cancelled'}];
    f.gate.resolve('data:image/png;base64,AQID');const [record]=await pending;
    assert.equal(record.dataUrl,retainedPng);assert.equal(record.currentDataUrl(),retainedPng);
    assert.deepEqual(record.item,snapshot[0]);assert.deepEqual(f.tab.generated,snapshot,'Detached persisted fields are not rewritten');
  });
}
for(const reason of ['busy','preflight','deleted','owner','data','disposed']) {
  test('managed export rejects its own '+reason+' transition after local decoding',async()=>{
    const f=await managedExportFixture({held:true});const pending=f.c.exportResults('all');
    const rejection=assert.rejects(pending,/저장할/);await f.entered.promise;
    if(reason==='busy')f.tab.workState='busy';
    if(reason==='preflight')f.c.preflightRun={};
    if(reason==='deleted')f.c.taskTabs.delete(f.tab.id);
    if(reason==='owner')f.tab.batchOwner.scope.sessionId='other';
    if(reason==='data')f.current.data='data:image/png;base64,AQID';
    if(reason==='disposed')f.c.disposed=true;
    f.gate.resolve('data:image/png;base64,AQID');await rejection;
  });
}
test('inactive stored-item replacement cannot rewrite the captured export data while decode is held',async()=>{
  const f=await managedExportFixture({active:'unrelated-busy-task',held:true});f.c.taskViews.clear();
  const pending=f.c.exportResults('selected'),rejection=assert.rejects(pending,/결과가 변경/);await f.entered.promise;
  f.tab.generated[0].data='data:image/png;base64,AQID';
  f.gate.resolve('data:image/png;base64,AQID');await rejection;
});
test('collective selected/all preserve selection, versions, inactive tasks, and plain public records',async()=>{
  const f=await managedExportFixture({active:'unrelated-busy-task'}),other={id:'version-2',kind:'generated',data:retainedPng};
  f.tab.generated.push(structuredClone(other));f.c.taskViews.get(f.tab.id).generatedImages.push(other);
  const selected=await f.c.exportResults('selected'),all=await f.c.exportResults('all');
  assert.deepEqual(Array.from(selected,r=>r.candidateId),[f.current.id]);
  assert.deepEqual(Array.from(all,r=>r.candidateId),[f.current.id,other.id]);
  assert.match(all[0].sourceName,/버전 1/);assert.match(all[1].sourceName,/버전 2/);
  const saved=[];const result=await f.api.writeTaskExports({kind:'desktop',folder:'private',writer:{save:async value=>{saved.push(value);return{path:value.sourceName};}}},
    [{sourceName:'public-read-only-snapshot',dataUrl:retainedPng}]);
  assert.equal(result.count,1);assert.equal(saved[0].dataUrl,retainedPng);
  assert.equal(saved[0].appendConverted,false);assert.equal(saved[0].outputDirectory,'private');
});

function heldExportDirectory(stage) {
  const entered=deferred(),gate=deferred(),events=[],writes=[],commits=[];
  const stop=async name=>{events.push(name);if(name===stage){entered.resolve();await gate.promise;}};
  const handle={createWritable:async()=>{await stop('writable');return{
    write:async blob=>{writes.push(Buffer.from(await blob.arrayBuffer()));await stop('write');},
    close:async()=>{events.push('close');commits.push(writes.at(-1));},abort:async()=>{events.push('abort');},
  };}};
  const directory={getFileHandle:async(name,options)=>{
    if(!options?.create){await stop('name');const error=new Error('absent');error.name='NotFoundError';throw error;}
    await stop('handle');return handle;
  },removeEntry:async()=>assert.fail('Never delete a potentially external file')};
  return{directory,entered,gate,events,writes,commits};
}
for(const stage of ['name','handle','writable']) {
  test('portable directory export refreshes RAW after the held '+stage+' boundary',async()=>{
    const f=await managedExportFixture(),[record]=await f.c.exportResults('selected'),d=heldExportDirectory(stage);
    const before=structuredClone(f.current),pending=f.api.writeTaskExports({kind:'browser-directory',directory:d.directory},[record]);
    await d.entered.promise;f.current.scopedEditHistory=[{status:'cancelled'}];d.gate.resolve();
    const result=await pending;assert.equal(result.count,1);assert.equal(d.commits.length,1);
    assert.deepEqual(d.commits[0],Buffer.from(retainedPng.split(',')[1],'base64'));
    assert.equal(f.current.data,before.data);assert.deepEqual(record.item,before);
  });
}
for(const stage of ['name','handle','writable','write']) {
  test('portable directory export aborts a deleted owner at the held '+stage+' boundary',async()=>{
    const f=await managedExportFixture(),[record]=await f.c.exportResults('selected'),d=heldExportDirectory(stage);
    const pending=f.api.writeTaskExports({kind:'browser-directory',directory:d.directory},[record]);
    const rejection=assert.rejects(pending,error=>{assert.match(error.message,/소유자/);
      if(stage!=='name')assert.match(error.taskExportPreparedFile,/\.png$/);return true;});
    await d.entered.promise;f.c.taskTabs.delete(f.tab.id);d.gate.resolve();await rejection;
    assert.equal(d.commits.length,0);assert.equal(d.events.includes('close'),false);
    assert.equal(d.events.filter(name=>name==='abort').length,['writable','write'].includes(stage)?1:0);
    assert.equal(d.writes.length,stage==='write'?1:0,'A held staged write is never claimed to have been absent');
  });
}
test('RAW binding during a staged write aborts before close rather than committing processed bytes',async()=>{
  const f=await managedExportFixture(),[record]=await f.c.exportResults('selected'),d=heldExportDirectory('write');
  const pending=f.api.writeTaskExports({kind:'browser-directory',directory:d.directory},[record]);
  const rejection=assert.rejects(pending,/RAW/);await d.entered.promise;
  f.current.scopedEditHistory=[{status:'cancelled'}];d.gate.resolve();await rejection;
  assert.equal(d.commits.length,0);assert.equal(d.events.filter(name=>name==='abort').length,1);
  assert.equal(f.current.data,retainedPng);assert.equal(record.item.scopedEditHistory,undefined);
});
test('desktop dispatch rechecks the next record after the previous writer await',async()=>{
  const f=await managedExportFixture(),[record]=await f.c.exportResults('selected');
  const gate=deferred(),entered=deferred(),writes=[];
  const first={sourceName:'public-first',dataUrl:retainedPng};
  const pending=f.api.writeTaskExports({kind:'desktop',folder:'private',writer:{save:async value=>{
    writes.push(value);if(writes.length===1){entered.resolve();await gate.promise;}return{path:value.sourceName};
  }}},[first,record]);
  await entered.promise;f.current.scopedEditHistory=[{status:'cancelled'}];gate.resolve();
  assert.equal((await pending).count,2);assert.equal(writes[1].dataUrl,retainedPng);
  assert.equal(record.item.scopedEditHistory,undefined);
});


// Full actual capture body, with only its ordinary UI/input reads supplied.
async function installActualExportCapture(f) {
  const snapshots=await productModule('ai-candidate-snapshot');
  const timing=await productModule('ai-generation-timing');
  const c=f.c;
  Object.assign(c,{taskItemCopy:snapshots.taskItemCopy,attachments:[],conversationMessages:[],
    log:{querySelectorAll:()=>[]},selectedCandidateId:f.current.id,referenceComposition:null,
    panel:{},commentController:null,input:{value:''},conversationId:null,selectedMode:'kice',
    selectedQualityMode:'normal',selectedOutputEngine:'raster',selectedAssetGenerationMode:'single',
    readMarkPolicy:()=>({}),conversionKind:'image',readPreserveSourceLabels:()=>false,
    readImageLabelWorkflow:()=>({imageKind:'general',labelResult:'remove',explicit:true}),preciseRestoreCheckbox:null,
    selectedImageOutputOptions:{backgroundPolicy:'connected'},selectedSeparationMode:'off',singleBackgroundPolicy:'connected',
    modelsLoaded:false,generationTiming:null,serializeGenerationTiming:timing.serializeGenerationTiming,
    providerRequestPersistable:false,currentRequestSnapshot:null});
  const capture=sourcePart('  const captureActiveTaskTab = () => {','  const taskPersistence = createTaskPersistence({');
  // Capture now reads per-candidate label presentation state. Execute the real
  // closures as well; a constant false predicate would hide snapshot regressions.
  const labelPreview=sourcePart('  const hasPreviewLabels = item =>','  function ensureCompositePreviewControl(item) {');
  vm.runInNewContext('const labelPreviewStates = new WeakMap();\n'+labelPreview+'\n'+capture
    +'\nglobalThis.captureActiveTaskTab=captureActiveTaskTab;globalThis.labelPreviewState=labelPreviewState;',c);
  // Component-only restoration of the actual cached-view/array authority slice.
  // This is not a claim that the full physical tab UI has run in this unit.
  const arrays=sourcePart('    const savedView = taskViews.get(tab.id);','    referenceComposition = normalizeReferenceComposition(tab.referenceComposition, attachments);');
  vm.runInNewContext('globalThis.restoreExportArrays = tab => { let attachments, generatedImages;\n'+arrays+'\nreturn {attachments,generatedImages}; };',c);
}

test('ordinary actual capture and persistence snapshot reads preserve export owner and bytes',async()=>{
  const f=await managedExportFixture({held:true});await installActualExportCapture(f);
  const workspace=await productModule('ai-task-workspaces'),put=[];
  const originalItem=structuredClone(f.current),pending=f.c.exportResults('selected');await f.entered.promise;
  const beforeArray=f.tab.generated;f.c.captureActiveTaskTab();
  assert.equal(f.c.taskTabs.get(f.tab.id),f.tab,'Actual capture mutates fields, not Map owner identity');
  assert.notEqual(f.tab.generated,beforeArray,'Actual snapshot arrays are replaced');
  const persistence=workspace.createTaskPersistence({capture:f.c.captureActiveTaskTab,
    snapshot:()=>({key:'workspace',tabs:[...f.c.taskTabs.values()],activeTaskTabId:f.c.activeTaskTabId}),
    store:{put:async value=>{put.push(value);}},warn:error=>assert.fail(error.message)});
  try {await persistence.checkpoint();assert.equal(put.length,1);
    assert.notEqual(put[0].tabs[0],f.tab,'Real readSnapshot returns a clone without installing it');
    assert.equal(f.c.taskTabs.get(f.tab.id),f.tab);
    f.gate.resolve('data:image/png;base64,AQID');const [record]=await pending;
    assert.equal(record.dataUrl,'data:image/png;base64,AQID');assert.equal(record.currentDataUrl(),record.dataUrl);
    assert.equal(record.item.data,retainedPng);assert.deepEqual(f.current,originalItem);
  } finally {persistence.dispose();}
});

test('actual capture persists only editable label presentation without changing the owner or candidate bytes',async()=>{
  const f=await managedExportFixture();await installActualExportCapture(f);
  f.current.labelPlan={frozen:true,labels:[{id:'label-1',scope:'general',text:'라벨'}]};
  const empty={id:'no-label',kind:'generated',data:retainedPng,labelPlan:{frozen:true,labels:[]}};
  const graph={id:'graph-label',kind:'generated',data:retainedPng,labelPlan:{frozen:true,labels:[{scope:'graph'}]}};
  f.c.generatedImages.push(empty,graph);
  f.c.labelPreviewState(f.current).included=false;
  const before=structuredClone(f.c.generatedImages),owner=f.tab,batchOwner=structuredClone(f.tab.batchOwner);
  f.c.captureActiveTaskTab();
  assert.equal(f.c.taskTabs.get(f.tab.id),owner);assert.deepEqual(f.tab.batchOwner,batchOwner);
  assert.deepEqual(structuredClone(f.tab.labelPreviewIncluded),{[f.current.id]:false});
  assert.deepEqual(f.c.generatedImages,before,'Presentation capture never mutates candidate bytes or label plans');
  f.c.labelPreviewState(f.current).included=true;f.c.captureActiveTaskTab();
  assert.deepEqual(structuredClone(f.tab.labelPreviewIncluded),{[f.current.id]:true});
  assert.deepEqual(f.c.generatedImages,before);assert.equal(f.tab.selectedCandidateId,f.current.id);
});

for(const active of ['owner','unrelated-busy-task']) {
  test('same scoped owner after real snapshot recovery remains exportable for '+active,async()=>{
    const f=await managedExportFixture({active,held:true}),workspace=await productModule('ai-task-workspaces');
    const pending=f.c.exportResults('selected');await f.entered.promise;
    const recovered=workspace.recoverTaskWorkspaceSnapshot({key:'workspace',tabs:[f.tab],activeTaskTabId:f.tab.id});
    assert.ok(recovered);const next=recovered.tabs[0];assert.notEqual(next,f.tab);
    assert.deepEqual(next.batchOwner,f.tab.batchOwner);assert.equal(next.generated[0].data,retainedPng);
    // Exact Map/cache replacement semantics of importTaskSnapshot/importSharingSnapshot.
    f.c.taskTabs.clear();f.c.taskViews.clear();for(const tab of recovered.tabs)f.c.taskTabs.set(tab.id,tab);
    if(active==='owner')f.c.generatedImages=next.generated;
    const before=structuredClone(next);
    f.gate.resolve('data:image/png;base64,AQID');const [record]=await pending;
    assert.equal(record.dataUrl,'data:image/png;base64,AQID');assert.equal(record.currentDataUrl(),record.dataUrl);
    assert.equal(record.item.data,retainedPng);assert.deepEqual(next,before,'Export cannot rewrite a recovered record');
  });
}

test('unchanged reselect/recapture keeps an inactive retained view authoritative',async()=>{
  const f=await managedExportFixture({held:true});await installActualExportCapture(f);
  const pending=f.c.exportResults('selected');await f.entered.promise;
  f.c.captureActiveTaskTab();const firstView=f.c.taskViews.get(f.tab.id);
  f.c.activeTaskTabId='unrelated-busy-task';f.c.busy=true;f.c.generatedImages=[];
  const restored=f.c.restoreExportArrays(f.tab);
  assert.equal(restored.generatedImages,firstView.generatedImages);
  assert.equal(restored.generatedImages[0],f.current,'Actual restore cached-view slice retains the same live candidate');
  // Reselect this owner, recapture it, then restore the unrelated active owner.
  f.c.activeTaskTabId=f.tab.id;f.c.busy=false;f.c.attachments=restored.attachments;f.c.generatedImages=restored.generatedImages;
  f.c.captureActiveTaskTab();assert.notEqual(f.c.taskViews.get(f.tab.id),firstView);
  f.c.activeTaskTabId='unrelated-busy-task';f.c.busy=true;f.c.generatedImages=[];
  const captured=structuredClone(f.tab.generated);
  f.gate.resolve('data:image/png;base64,AQID');const [record]=await pending;
  assert.equal(record.dataUrl,'data:image/png;base64,AQID');assert.equal(record.currentDataUrl(),record.dataUrl);
  assert.deepEqual(f.tab.generated,captured);assert.equal(record.item.data,retainedPng);
});

{
// RAW-SAVE-HANDLER-RACES-APPEND-02: all new bindings stay inside this block.
// Real source bodies in a VM with controlled dependencies; no browser/file/pixel oracle.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const evidenceParent = path.join(root, '.omo/evidence');
fs.mkdirSync(evidenceParent, { recursive: true });
const evidence = fs.mkdtempSync(path.join(evidenceParent, 'raw-save-handler-units-' + Date.now() + '-' + process.pid + '-'));
process.stdout.write('[raw-save-handler-units evidence] ' + evidence + '\n');
const sourcePath = path.join(root, 'js/ai-panel.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const outputPath = path.join(root, 'js/ai-output-processing.js');
const outputSource = fs.readFileSync(outputPath, 'utf8');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
fs.writeFileSync(path.join(evidence, 'source-receipt.json'), JSON.stringify({ status: 'source-loaded-extraction-pending', sourcePath, sourceSHA256: sha(source), outputPath, outputSHA256: sha(outputSource) }, null, 2) + '\n');

function oneSlice(text, start, end, label) {
  assert.equal(text.split(start).length - 1, 1, `${label}: one original start seam`);
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(to > from, `${label}: original closing seam exists`);
  return text.slice(from, to);
}
// The *complete original assignment*, including its actual finally, is executed.
// Nothing replaces its body or substitutes a copied implementation.
const onclickSource = oneSlice(source, '      savePng.onclick = async () => {',
  '\n      actions.appendChild(savePng);', 'PNG onclick');
assert.ok(onclickSource.trimEnd().endsWith('};'), 'Full onclick assignment includes its closing brace');
const footerSource = oneSlice(source, "  panel.querySelector('[data-ai-save-selected]')?.addEventListener('click', () => {",
  '\n  const exportCount = (mode,kind = null) => {', 'actual footer delegate');
const statusSource = oneSlice(source, '  const setStatus = (text, kind = "", cause) => {',
  '\n  const closeSourceMenu =', 'actual status side effects');
const rawSource = oneSlice(outputSource, 'const BOUND_FIELDS =',
  'export function canChooseLocalOutput(', 'actual RAW eligibility');
const footerDisabledStatement = 'if (save) save.disabled = busy || !item || Boolean(item.sceneResult);';
assert.equal(source.split(footerDisabledStatement).length - 1, 1, 'One actual footer disabled-state rule');
const provenance = {
  sourcePath, sourceSHA256: sha(source), outputPath, outputSHA256: sha(outputSource),
  onclickSHA256: sha(onclickSource), footerSHA256: sha(footerSource), statusSHA256: sha(statusSource),
  rawEligibilitySHA256: sha(rawSource), footerDisabledStatementSHA256: sha(footerDisabledStatement),
  extraction: 'Complete onclick and footer listener, complete setStatus, actual RAW classifier prefix; only ES export keywords removed from classifier for VM.',
  dependencySeams: ['resolveOutputVariant controlled deferred/fulfilled/rejected promise', 'DOM disabled click semantics modeled', 'syncSelectedOutputActions executes original footer disabled statement only', 'setTaskState records new-job mutations; no persistence runtime'],
  limits: 'No actual DOM, browser download, file bytes, image decode, PNG pixel, setBusy integration, or task-restore runtime claim.',
};
fs.mkdirSync(evidence, { recursive: true });
fs.writeFileSync(path.join(evidence, 'source-receipt.json'), JSON.stringify(provenance, null, 2) + '\n');

const RAW = 'data:image/png;base64,UkFX';
const PROCESSED = 'data:image/png;base64,UFJPQ0VTU0VE';
const CHANGED = 'data:image/png;base64,Q0hBTkdFRA==';
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const outcomes = [], operations = [], downloads = [], statuses = [], syncs = [], resolverCalls = [];
  const newJob = { phase: 'generating', failures: [], rejected: [] };
  let statusText = 'new job untouched', statusTitle = 'new job untouched';
  const status = { dataset: { kind: 'busy' },
    get textContent() { return statusText; }, set textContent(value) { statusText = value; statuses.push(value); },
    get title() { return statusTitle; }, set title(value) { statusTitle = value; },
  };
  function button() {
    return { disabled: false, onclick: null, listeners: [], blockedClicks: 0,
      addEventListener(type, callback) { assert.equal(type, 'click'); this.listeners.push(callback); },
      click() {
        if (this.disabled) { this.blockedClicks++; return; }
        if (this.onclick) {
          const operation = this.onclick.call(this);
          if (operation && typeof operation.then === 'function') operations.push(operation);
        }
        for (const listener of this.listeners) listener.call(this);
      },
    };
  }
  const savePng = button(), footer = button();
  const item = { id: 'candidate-a', kind: 'generated', data: RAW, name: 'owner-A', scopedEditHistory: [] };
  item.card = { querySelector(selector) { assert.equal(selector, '[data-ai-save-candidate]'); return savePng; } };
  const sandbox = {
    item, savePng, busy: false, disposed: false, activeTaskTabId: 'task-A', localVisibilityEpoch: 7,
    generatedImages: [item], selected: item, insertingOutput: false, batchRun: null, status,
    selectedOutputItem: () => sandbox.selected,
    panel: { querySelector(selector) { assert.equal(selector, '[data-ai-save-selected]'); return footer; } },
    document: { createElement(tag) {
      assert.equal(tag, 'a');
      return { href: '', download: '', click() { downloads.push({ href: this.href, download: this.download }); } };
    } },
    resolveOutputVariant(value) {
      assert.equal(value, item); resolverCalls.push(value.id);
      assert.ok(outcomes.length, 'Each real resolver call consumes an explicitly supplied outcome');
      return outcomes.shift();
    },
    errorLog: { record() {} }, safeAiErrorText: value => value,
    setTaskState(value) { newJob.phase = value; newJob.failures.push(value); },
    syncSelectedOutputActions() { syncs.push('sync'); syncFooter(); },
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(rawSource.replace(/^export /gm, '') + '\n' + statusSource + '\n' + onclickSource + '\n' + footerSource,
    context, { filename: sourcePath + '#actual-png-save-and-footer' });
  function syncFooter() {
    vm.runInContext("{ const save = panel.querySelector('[data-ai-save-selected]'); const item = selectedOutputItem(); "
      + footerDisabledStatement + ' }', context, { filename: sourcePath + '#actual-footer-disabled-rule' });
  }
  function clickFooter() {
    const before = operations.length; footer.click();
    return operations.length > before ? operations.at(-1) : null;
  }
  function clickCard() {
    const before = operations.length; savePng.click();
    return operations.length > before ? operations.at(-1) : null;
  }
  const receipt = () => ({ downloads, statuses, resolverCalls, syncs, newJob,
    localButtonDisabled: savePng.disabled, footerDisabled: footer.disabled,
    blockedCardClicks: savePng.blockedClicks, busy: sandbox.busy, disposed: sandbox.disposed,
    task: sandbox.activeTaskTabId, selected: sandbox.selected?.id, member: sandbox.generatedImages.includes(item),
    status: { text: status.textContent, title: status.title, kind: status.dataset.kind } });
  return { sandbox, item, savePng, footer, outcomes, downloads, statuses, syncs, resolverCalls, newJob,
    clickFooter, clickCard, syncFooter, receipt };
}
function unchangedJob(f) {
  assert.deepEqual(f.statuses, [], 'No status write from obsolete/busy operation');
  assert.deepEqual(f.newJob, { phase: 'generating', failures: [], rejected: [] }, 'No new-job mutation or batch rejection');
}
function caseTest(name, body) {
  test(name, { concurrency: false }, async () => {
    let f, outcome = 'failed', failure = null;
    try { f = fixture(); await body(f); outcome = 'passed'; }
    catch (error) { failure = String(error.stack || error); throw error; }
    finally {
      const slug = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      fs.writeFileSync(path.join(evidence, slug + '.json'), JSON.stringify({ scenario: name, outcome, failure,
        sourceSHA256: provenance.sourceSHA256, onclickSHA256: provenance.onclickSHA256,
        scope: provenance.limits, observed: f ? f.receipt() : null }, null, 2) + '\n');
    }
  });
}

caseTest('held completion while busy releases local lock and idle footer delegate saves RAW once', async f => {
  const gate = deferred(); f.outcomes.push(gate.promise);
  const pending = f.clickFooter(); assert.ok(pending); assert.equal(f.savePng.disabled, true);
  f.item.scopedEditHistory.push({ status: 'preparing' }); f.sandbox.busy = true; f.syncFooter();
  gate.resolve(PROCESSED); await pending;
  assert.equal(f.downloads.length, 0); unchangedJob(f);
  assert.equal(f.savePng.disabled, false, 'Settled local operation must not retain task busy as its lock');
  f.savePng.click(); assert.equal(f.resolverCalls.length, 1, 'Real handler still blocks direct card click while busy');
  f.item.scopedEditHistory[0].status = 'cancelled'; f.sandbox.busy = false; f.syncFooter();
  f.outcomes.push(Promise.resolve(PROCESSED)); const second = f.clickFooter(); assert.ok(second); await second;
  assert.deepEqual(f.downloads, [{ href: RAW, download: 'owner-A.png' }]); assert.equal(f.resolverCalls.length, 2);
});

caseTest('inactive owner settles while peer busy then same retained card can save after reselect', async f => {
  const retained = f.item, gate = deferred(); f.outcomes.push(gate.promise);
  const pending = f.clickFooter(); assert.ok(pending);
  f.sandbox.activeTaskTabId = 'task-B'; f.sandbox.selected = { id: 'candidate-b' };
  f.sandbox.generatedImages = []; f.sandbox.busy = true;
  gate.resolve(PROCESSED); await pending;
  assert.equal(f.downloads.length, 0); unchangedJob(f); assert.equal(f.savePng.disabled, false);
  f.sandbox.busy = false; f.sandbox.activeTaskTabId = 'task-A';
  f.sandbox.selected = retained; f.sandbox.generatedImages = [retained]; f.syncFooter();
  assert.equal(retained.card.querySelector('[data-ai-save-candidate]'), f.savePng, 'Same modeled retained card identity');
  f.outcomes.push(Promise.resolve(PROCESSED)); const next = f.clickFooter(); assert.ok(next); await next;
  assert.deepEqual(f.downloads, [{ href: PROCESSED, download: 'owner-A.png' }]);
});

const invalidate = {
  dispose: f => { f.sandbox.disposed = true; },
  task: f => { f.sandbox.activeTaskTabId = 'task-B'; },
  visibilityEpoch: f => { f.sandbox.localVisibilityEpoch++; },
  data: f => { f.item.data = CHANGED; },
  membership: f => { f.sandbox.generatedImages = []; },
  'selected-owner': f => { f.sandbox.selected = { id: 'candidate-b', kind: 'generated', data: RAW }; },
};
for (const [reason, change] of Object.entries(invalidate)) {
  for (const settlement of ['resolve', 'reject']) {
    caseTest(`${settlement} after obsolete ${reason} makes no download status or new-job mutation`, async f => {
      const gate = deferred(); f.outcomes.push(gate.promise);
      const pending = f.clickFooter(); assert.ok(pending); change(f);
      f.sandbox.batchRun = { reject: error => f.newJob.rejected.push(String(error)) };
      if (settlement === 'resolve') gate.resolve(PROCESSED); else gate.reject(new Error('obsolete decode failure'));
      await pending;
      assert.equal(f.downloads.length, 0); unchangedJob(f); assert.deepEqual(f.syncs, []);
      assert.equal(f.savePng.disabled, reason === 'dispose', 'Only disposed controller keeps completed card disabled');
    });
  }
}

caseTest('busy rejection is ignored and does not poison the newer job', async f => {
  const gate = deferred(); f.outcomes.push(gate.promise); const pending = f.clickFooter(); assert.ok(pending);
  f.sandbox.busy = true; f.sandbox.batchRun = { reject: error => f.newJob.rejected.push(String(error)) };
  gate.reject(new Error('late failure')); await pending;
  assert.equal(f.downloads.length, 0); unchangedJob(f); assert.equal(f.savePng.disabled, false);
});

caseTest('historical same-owner positive preserves processed data', async f => {
  f.outcomes.push(Promise.resolve(PROCESSED)); const pending = f.clickFooter(); assert.ok(pending); await pending;
  assert.deepEqual(f.downloads, [{ href: PROCESSED, download: 'owner-A.png' }]);
  assert.equal(f.item.data, RAW); assert.deepEqual(f.item.scopedEditHistory, []);
  assert.equal(f.statuses.length, 1); assert.equal(f.savePng.disabled, false); assert.equal(f.footer.disabled, false);
});

caseTest('nonselected same-owner card retains selectedAtStart false policy', async f => {
  const gate = deferred(); f.outcomes.push(gate.promise); f.sandbox.selected = { id: 'candidate-b' };
  const pending = f.clickCard(); assert.ok(pending);
  f.sandbox.selected = { id: 'candidate-c' }; gate.resolve(PROCESSED); await pending;
  assert.deepEqual(f.downloads, [{ href: PROCESSED, download: 'owner-A.png' }]); assert.equal(f.item.data, RAW);
});

caseTest('duplicate clicks stay locally locked while the first resolver is pending', async f => {
  const gate = deferred(); f.outcomes.push(gate.promise); const pending = f.clickFooter(); assert.ok(pending);
  f.footer.click(); f.savePng.click(); await f.savePng.onclick();
  assert.equal(f.resolverCalls.length, 1); assert.equal(f.downloads.length, 0);
  assert.equal(f.savePng.disabled, true); assert.equal(f.footer.disabled, true);
  gate.resolve(PROCESSED); await pending;
  assert.equal(f.downloads.length, 1); assert.equal(f.resolverCalls.length, 1); assert.equal(f.savePng.disabled, false);
});

caseTest('same-owner idle rejection remains a visible save error and unlocks', async f => {
  const gate = deferred(); f.outcomes.push(gate.promise); const pending = f.clickFooter(); assert.ok(pending);
  gate.reject(new Error('current decode failure')); await pending;
  assert.equal(f.downloads.length, 0); assert.equal(f.statuses.length, 1);
  assert.match(f.statuses[0], /PNG 저장 실패: current decode failure/);
  assert.equal(f.savePng.disabled, false); assert.equal(f.newJob.phase, 'generating');
});


// Complete production listener; no copied canReportExport implementation.
const collectiveSource = oneSlice(source, "  collectiveExportButton.addEventListener('click', async () => {",
  "  panel.querySelector('[data-ai-insert-selected]')", 'actual complete collective export listener');
function actualOwnerLine(prefix) {
  const lines = source.split('\n').filter(line => line.startsWith(prefix));
  assert.equal(lines.length, 1, 'One actual owner helper: ' + prefix);
  return lines[0];
}
const ownerSource = actualOwnerLine('  const batchOwner =') + '\n' + actualOwnerLine('  const sameBatchOwner =');
fs.writeFileSync(path.join(evidence, 'collective-source-receipt.json'), JSON.stringify({
  sourcePath, sourceSHA256: sha(source), collectiveHandlerSHA256: sha(collectiveSource),
  setStatusSHA256: sha(statusSource), ownerHelpersSHA256: sha(ownerSource),
  extraction: 'Complete actual listener, setStatus and batchOwner/sameBatchOwner source, unmodified in VM.',
  seams: ['exportCollection held promise', 'status and DOM mutation observations', 'setTaskState and batchRun rejection record newer-job mutations'],
  limits: 'No real export writer, browser, filesystem save, PNG bytes or pixels are exercised.',
}, null, 2) + '\n');

function collectiveFixture() {
  const gate = deferred(), statusCalls = [], domWrites = [], exportCalls = [];
  const newJob = { phase: 'generating', failures: [], rejected: [] };
  let callback, text = 'initial', title = 'initial';
  const status = { dataset: { kind: 'ok' },
    get textContent() { return text; }, set textContent(value) { text = value; statusCalls.push(value); },
    get title() { return title; }, set title(value) { title = value; },
  };
  function control(name) {
    let disabled = false;
    return { value: 'selected',
      get disabled() { return disabled; },
      set disabled(value) { disabled = value; domWrites.push({ name, disabled: value }); },
      addEventListener(type, fn) { assert.equal(type, 'click'); assert.equal(callback, undefined); callback = fn; },
    };
  }
  const collectiveExportButton = control('button'), collectiveExportMode = control('mode');
  const owner = { taskId: 'task-A', scope: { sessionId: 'session-A', workspaceId: 'workspace-A' } };
  const item = { id: 'candidate-A', kind: 'generated', data: RAW, scopedEditHistory: [] };
  const tab = { id: owner.taskId, batchOwner: owner, generated: [item] };
  const sandbox = {
    busy: false, preflightRun: null, disposed: false, exportInProgress: false, insertingOutput: false,
    activeTaskTabId: 'task-A', localVisibilityEpoch: 7, currentRequestEpoch: 20, clientScope: 'workspace-A',
    taskTabs: new Map([[tab.id, tab]]), generatedImages: [item], structuredClone,
    collectiveExportButton, collectiveExportMode, status, batchRun: null,
    exportCollection(mode) { exportCalls.push(mode); return gate.promise; },
    errorLog: { record() {} }, safeAiErrorText: value => value,
    setTaskState(value) { newJob.phase = value; newJob.failures.push(value); },
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(ownerSource + '\n' + statusSource + '\n' + collectiveSource,
    context, { filename: sourcePath + '#complete-collective-export-handler' });
  assert.equal(typeof callback, 'function');
  const statusSnapshot = () => ({ text: status.textContent, title: status.title, kind: status.dataset.kind });
  function begin() {
    const pending = callback();
    assert.equal(sandbox.exportInProgress, true);
    assert.equal(collectiveExportButton.disabled, true); assert.equal(collectiveExportMode.disabled, true);
    assert.deepEqual(exportCalls, ['selected']);
    assert.equal(statusCalls.length, 1, 'Original initial preparing status is retained');
    return pending;
  }
  function currentJobMarker() {
    // External state change models the newer request's visible message.
    status.textContent = 'new request visible'; status.title = 'new request visible'; status.dataset.kind = 'busy';
    sandbox.batchRun = { reject: error => newJob.rejected.push(String(error)) };
    statusCalls.length = 0;
    return statusSnapshot();
  }
  const receipt = () => ({ statusCalls, status: statusSnapshot(), domWrites, exportCalls, newJob,
    exportInProgress: sandbox.exportInProgress, disposed: sandbox.disposed, busy: sandbox.busy,
    preflight: Boolean(sandbox.preflightRun), taskId: sandbox.activeTaskTabId,
    visibilityEpoch: sandbox.localVisibilityEpoch, requestEpoch: sandbox.currentRequestEpoch,
    owner: tab.batchOwner, buttonDisabled: collectiveExportButton.disabled, modeDisabled: collectiveExportMode.disabled,
  });
  return { sandbox, gate, tab, item, begin, currentJobMarker, statusSnapshot, statusCalls, domWrites,
    newJob, collectiveExportButton, collectiveExportMode, receipt };
}
function collectiveCase(name, body) {
  test(name, { concurrency: false }, async () => {
    let f, outcome = 'failed', failure = null;
    try { f = collectiveFixture(); await body(f); outcome = 'passed'; }
    catch (error) { failure = String(error.stack || error); throw error; }
    finally {
      const slug = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      fs.writeFileSync(path.join(evidence, slug + '.json'), JSON.stringify({ scenario: name, outcome, failure,
        sourceSHA256: sha(source), collectiveHandlerSHA256: sha(collectiveSource), setStatusSHA256: sha(statusSource),
        observed: f ? f.receipt() : null, scope: 'Actual source in VM; no writer/browser/pixel claim.' }, null, 2) + '\n');
    }
  });
}
const staleCollective = {
  busy: f => { f.sandbox.busy = true; },
  'request-epoch': f => { f.sandbox.currentRequestEpoch++; },
  'cancelled-new-scope': f => {
    // Completion occurs after a newer scope has both started and cancelled;
    // busy alone has returned false and cannot protect the newer UI.
    f.sandbox.currentRequestEpoch++; f.sandbox.busy = true;
    f.item.scopedEditHistory.push({ status: 'cancelled' }); f.sandbox.busy = false; f.newJob.phase = 'cancelled';
  },
  task: f => { f.sandbox.activeTaskTabId = 'task-B'; },
  visibility: f => { f.sandbox.localVisibilityEpoch++; },
  disposal: f => { f.sandbox.disposed = true; },
  preflight: f => { f.sandbox.preflightRun = { requestId: 'new-preflight' }; },
  'batch-owner': f => { f.tab.batchOwner = { ...f.tab.batchOwner, scope: { ...f.tab.batchOwner.scope, sessionId: 'session-B' } }; },
};
for (const [reason, invalidate] of Object.entries(staleCollective)) {
  for (const settlement of ['complete', 'reject']) {
    collectiveCase(`collective ${settlement} after ${reason} cannot report into newer job`, async f => {
      const pending = f.begin(); invalidate(f); const currentStatus = f.currentJobMarker();
      const jobBeforeSettlement = structuredClone(f.newJob);
      const writesBeforeSettlement = f.domWrites.length;
      if (settlement === 'complete') f.gate.resolve({ status: 'stored', count: 1 });
      else f.gate.reject(new Error('old export failure'));
      await pending;
      assert.deepEqual(f.statusCalls, [], 'No late generic setStatus invocation');
      assert.deepEqual(f.statusSnapshot(), currentStatus, 'Newer visible status is unchanged');
      assert.deepEqual(f.newJob, jobBeforeSettlement, 'No newer-job failure or batch rejection');
      assert.equal(f.sandbox.exportInProgress, false, 'Operation lock always releases');
      if (reason === 'disposal') assert.equal(f.domWrites.length, writesBeforeSettlement, 'Disposed DOM gets no finally updates');
      if (reason === 'busy') assert.equal(f.collectiveExportButton.disabled, true, 'New active job retains export busy guard');
    });
  }
}
for (const expected of [
  { status: 'stored', count: 2, kind: 'ok', message: /결과 2개를 선택한 폴더에 저장했습니다/ },
  { status: 'download-requested', count: 2, kind: 'warn', message: /결과 2개의 ZIP 다운로드를 요청했습니다/ },
  { status: 'cancelled', count: 0, kind: 'warn', message: /결과 저장을 취소했습니다/ },
]) {
  collectiveCase(`collective current same-owner ${expected.status} still reports`, async f => {
    const pending = f.begin(); f.gate.resolve({ status: expected.status, count: expected.count }); await pending;
    assert.equal(f.statusCalls.length, 2, 'Initial preparing status plus actual completion');
    assert.match(f.statusCalls[1], expected.message); assert.equal(f.statusSnapshot().kind, expected.kind);
    assert.equal(f.sandbox.exportInProgress, false); assert.equal(f.collectiveExportButton.disabled, false);
    assert.equal(f.collectiveExportMode.disabled, false); assert.deepEqual(f.newJob.failures, []);
    assert.equal(f.item.data, RAW); assert.deepEqual(f.item.scopedEditHistory, []);
  });
}
collectiveCase('collective same-owner historical export failure remains visible', async f => {
  const pending = f.begin(); f.gate.reject(new Error('historical transform failure')); await pending;
  assert.equal(f.statusCalls.length, 2); assert.match(f.statusCalls[1], /여러 작업 저장 실패: historical transform failure/);
  assert.equal(f.statusSnapshot().kind, 'error'); assert.equal(f.sandbox.exportInProgress, false);
  assert.equal(f.collectiveExportButton.disabled, false); assert.equal(f.collectiveExportMode.disabled, false);
  assert.deepEqual(f.newJob.failures, []); assert.equal(f.item.data, RAW); assert.deepEqual(f.item.scopedEditHistory, []);
});

}

{
// PREVIEW-LIFETIME-MODEL-TESTS-APPEND-07. Append verbatim; keep every prior byte.
// Full actual source bodies in a VM; controlled transform/DOM/lifecycle dependencies.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const evidenceParent = path.join(root, '.omo/evidence');
fs.mkdirSync(evidenceParent, { recursive: true });
const evidence = fs.mkdtempSync(path.join(evidenceParent, 'preview-lifetime-units-' + Date.now() + '-' + process.pid + '-'));
process.stdout.write('[preview-lifetime-units evidence] ' + evidence + '\n');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const sourcePath = path.join(root, 'js/ai-panel.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const outputPath = path.join(root, 'js/ai-output-processing.js');
const outputSource = fs.readFileSync(outputPath, 'utf8');
const policyPath = path.join(root, 'js/image-background-options.js');
const policySource = fs.readFileSync(policyPath, 'utf8');
const write = (name, data) => fs.writeFileSync(path.join(evidence, name), JSON.stringify(data, null, 2) + '\n');
write('source-receipt.json', { status: 'loaded-extraction-pending', sourcePath, sourceSHA256: sha(source),
  outputPath, outputSHA256: sha(outputSource), policyPath, policySHA256: sha(policySource) });
function oneSlice(text, start, end, label) {
  assert.equal(text.split(start).length - 1, 1, label + ': unique original start');
  const from = text.indexOf(start), to = text.indexOf(end, from + start.length);
  assert.ok(to > from, label + ': original end seam exists');
  return text.slice(from, to);
}
const pieces = {
  status: oneSlice(source, '  const setOutputProcessingStatus = (text, item = null, revision = outputProcessingRevision) => {',
    '  const syncOutputProcessingUi = () => {', 'full processing status'),
  preview: oneSlice(source, '  const resolveOutputVariant = (item) => {',
    '  const emptyReviewReport = () =>', 'full resolver, render, refresh and showWorkbench'),
  openClose: oneSlice(source, '  const open = async ({ reference, references = [], prompt, startGeneration = false,',
    '  const panelFocusables = () =>', 'full open and close'),
  visibilityDispose: oneSlice(source, '    setWorkbenchVisible: (visible, { animate = true } = {}) => {',
    '    snapshotTask: async id => {', 'full visibility and disposal methods'),
};
const importLine = 'import { BACKGROUND_POLICIES } from "./image-background-options.js?v=1.7.0-four-session-integration";\n';
assert.equal(outputSource.split(importLine).length - 1, 1, 'Only known policy import is removed');
const outputVmSource = outputSource.replace(importLine, '').replace(/^export /gm, '');
const policyVmSource = policySource.replace(/^export /gm, '');
assert.equal(pieces.preview.split('  const showWorkbench = () => {').length - 1, 1,
  'Parent fixed source includes actual shared showWorkbench helper');
for (const [name, text] of Object.entries(pieces)) fs.writeFileSync(path.join(evidence, 'extracted-' + name + '.txt'), text);
fs.writeFileSync(path.join(evidence, 'captured-output-processing.txt'), outputSource);
fs.writeFileSync(path.join(evidence, 'captured-background-options.txt'), policySource);
const provenance = {
  status: 'extracted-not-browser-qualified', sourcePath, sourceSHA256: sha(source),
  outputPath, outputSHA256: sha(outputSource), policyPath, policySHA256: sha(policySource),
  extractedSHA256: Object.fromEntries(Object.entries(pieces).map(([name, text]) => [name, sha(text)])),
  classification: 'Source-qualified ModelTests; not browser coverage',
  extraction: 'Entire source resolver/render/refresh/showWorkbench, processing-status function, open/close and setWorkbenchVisible/dispose methods; output-processing and policy modules lose only export keywords and the explicit policy import.',
  seams: ['Deferred transform promises replace native decode/alpha work', 'DOM setters record writes',
    'Motion, persistence, comparison disposal, desktop/account refresh, task restore and other external dependencies are controlled stand-ins',
    'Local erase controller is an observation stand-in: cancel/destroy calls are recorded, not a gesture/bitmap implementation',
    'Simple open path uses no incoming references, no task restore and no automatic separation', 'VM microtask draining is not browser RAF or timing evidence'],
  limits: 'No actual DOM, native decode, pixels, file writes/downloads, provider, physical workspace integration, CSS/RAF/Safari or product initialization coverage.',
};
write('source-receipt.json', provenance);
const RAW = 'data:image/png;base64,UkFX';
const PROCESSED = 'data:image/png;base64,UFJPQ0VTU0VE';
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function drain() { for (let index = 0; index < 20; index++) await Promise.resolve(); }
function fixture() {
  const writes = [], lifecycleEvents = [], transforms = [], gates = [];
  const ready = deferred(); ready.resolve();
  const image = { classList: { toggle: (name, value) => writes.push({ type: 'class', name, value }) } };
  let src = RAW, statusText = 'initial';
  Object.defineProperty(image, 'src', { get: () => src,
    set: value => { src = value; writes.push({ type: 'src', value }); } });
  const item = { id: 'retained-historical', kind: 'generated', data: RAW, outputImage: image };
  const outputProcessingStatus = {};
  Object.defineProperty(outputProcessingStatus, 'textContent', { get: () => statusText,
    set: value => { statusText = value; writes.push({ type: 'status', value }); } });
  const noop = () => {};
  const unsupported = name => () => { throw new Error('Unexpected fixture path: ' + name); };
  // Only the open target is modeled. No spring/CSS/RAF or native visibility is executed.
  let motionOpen = true;
  const motion = { isOpen: () => motionOpen,
    show: () => { motionOpen = true; lifecycleEvents.push('show'); },
    hide: () => { motionOpen = false; lifecycleEvents.push('hide'); },
    finish: () => lifecycleEvents.push('finish'),
    dispose: () => { motionOpen = false; lifecycleEvents.push('motion-dispose'); } };
  const sandbox = {
    disposed: false, localVisibilityEpoch: 0, outputProcessingRevision: 0,
    activeTaskTabId: 'owner-task', selectedImageOutputOptions: { backgroundPolicy: 'connected', examPalette: false, lineThickness: 0 },
    selectedSeparationMode: 'off', AI_SEPARATION_MODES: { OFF: 'off' },
    SEPARATION_BACKGROUND_HINT: 'background', SEPARATION_LIMITS_HINT: 'limits',
    generatedImages: [item], outputVariantCache: new WeakMap(), selectedOutputItem: () => item,
    outputProcessingStatus, imageOutputSummary: () => 'current output summary',
    renderLabelPreview: unsupported('frozen label preview outside historical fixture'),
    comparison: { update: () => writes.push({ type: 'comparison' }) }, comparisonRevisions: () => [],
    syncLegacyResultUi: noop, syncOutputProcessingUi: noop,
    transparentizeGeneratedImage: (data, options) => {
      const gate = deferred(); gates.push(gate); transforms.push({ data, options: { ...options } }); return gate.promise;
    },
    panel: { dataset: {}, hidden: false, querySelector: () => null, dispatchEvent: unsupported('candidate dispatch') },
    workspaceReady: ready.promise, syncLiteModeUi: noop, busy: false, preflightRun: null,
    taskTabs: new Map([['owner-task', { id: 'owner-task', workState: 'idle' }]]),
    restoreTaskTab: unsupported('task restore'), state: { get: () => ({ selectedIds: [], objects: [] }) },
    syncSelectedOutputActions: noop, motion,
    // Notification lifecycle is covered by the canonical browser and attention suites.
    acknowledgeVisibleResult: noop, syncResultEntry: noop,
    candidateUsesAutomaticSeparation: () => false, startAutomaticSeparation: unsupported('automatic separation'),
    desktop: { setAiTaskShortcutActive: value => lifecycleEvents.push('shortcut:' + value) },
    refresh: () => Promise.resolve(), sourceToDataUrl: unsupported('incoming references'),
    addReferencesAsTasks: unsupported('incoming task creation'), addLog: unsupported('incoming failure'),
    setStatus: unsupported('generic status'), input: { value: '', focus: noop }, submit: unsupported('generation'),
    closeComparison: () => lifecycleEvents.push('close-comparison'), closeCapture: null,
    abortAutomaticSeparation: reason => lifecycleEvents.push(reason),
    captureActiveTaskTab: noop, persistTasks: noop,
    taskPersistence: { flush: () => Promise.resolve(), dispose: () => lifecycleEvents.push('persistence-dispose') },
    document: { querySelector: () => null, getElementById: () => ({ focus: noop }) },
    graphOwnerEpoch: 0, graphWorkflow: { cancel: () => Promise.resolve() },
    lifecycle: { abort: () => lifecycleEvents.push('lifecycle-abort') }, imageLabelRunAbort: null,
    localEraseController: {
      cancel: () => lifecycleEvents.push('erase-cancel'),
      destroy: () => lifecycleEvents.push('erase-destroy'),
    },
    structureAnalysis: { cancel: noop }, abortSourceComposites: noop, sourceLabelControllers: [],
    imageReview: null, generationTimingTimer: null, clearInterval: noop, clearTimeout: noop, requestTimeout: null,
    taskViews: new Map(), taskRows: new Map(), requestStates: { live: () => false, advance: unsupported('request advance') },
    requestToken: null, disposalCallbacks: [],
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(policyVmSource + '\n' + outputVmSource + '\n' + pieces.status + '\n' + pieces.preview
    + '\n' + pieces.openClose + '\nconst controller = {\n' + pieces.visibilityDispose + '\n};'
    + '\nglobalThis.api = { renderOutputVariant, refreshOutputPreviews, showWorkbench, open, close, controller };',
    context, { filename: sourcePath + '#actual-preview-lifetimes' });
  const settle = (index, rejection = false) => {
    assert.ok(gates[index], 'Expected actual resolver transform call ' + index);
    if (rejection) gates[index].reject(new Error('held historical decode failure'));
    else gates[index].resolve(PROCESSED);
  };
  const terminal = name => {
    const before = lifecycleEvents.length;
    if (name === 'close') sandbox.api.close();
    else if (name === 'dispose') sandbox.api.controller.dispose();
    else sandbox.api.controller.setWorkbenchVisible(false);
    const events = lifecycleEvents.slice(before);
    if (name === 'close') {
      assert.equal(events.filter(event => event === 'erase-cancel').length, 1, 'Actual close cancels the local gesture once');
      assert.ok(events.indexOf('erase-cancel') < events.indexOf('hide'), 'Gesture cancellation precedes hiding the workbench');
    } else if (name === 'dispose') {
      assert.equal(events.filter(event => event === 'erase-destroy').length, 1, 'Actual disposal destroys the local tool once');
      assert.ok(events.indexOf('lifecycle-abort') < events.indexOf('erase-destroy'));
      assert.ok(events.indexOf('erase-destroy') < events.indexOf('persistence-dispose'));
    }
  };
  const reopen = async name => {
    if (name === 'open') await sandbox.api.open();
    else sandbox.api.controller.setWorkbenchVisible(true);
    await drain();
  };
  const receipt = () => ({ writes, lifecycleEvents, transforms, src, statusText,
    disposed: sandbox.disposed, visibilityEpoch: sandbox.localVisibilityEpoch,
    revision: sandbox.outputProcessingRevision, motionOpen, itemData: item.data, cachePresent: sandbox.outputVariantCache.has(item) });
  return { sandbox, api: sandbox.api, motion, image, item, writes, lifecycleEvents, transforms, gates, settle, terminal, reopen, receipt };
}
let serial = 0;
function previewCase(name, body) {
  const id = String(++serial).padStart(2, '0');
  test('preview lifetime ModelTest: ' + name, async () => {
    let f, outcome = 'failed', error = null;
    try { f = fixture(); await body(f); outcome = 'passed'; }
    catch (failure) { error = { message: failure.message, stack: failure.stack }; throw failure; }
    finally { write('case-' + id + '.json', { name, outcome, error, sourceSHA256: sha(source),
      extractedSHA256: provenance.extractedSHA256, observable: f?.receipt(), limits: provenance.limits }); }
  });
}
function resultWrites(f) { return f.writes.filter(write => write.type !== 'status'); }
function failures(f) { return f.writes.filter(write => write.type === 'status' && write.value.startsWith('결과 처리 실패:')); }
function assertCurrentCompletion(f, rejected, { srcWrites = 1 } = {}) {
  assert.equal(f.item.data, RAW, 'Preview does not rewrite stored raw input');
  if (rejected) {
    assert.equal(resultWrites(f).length, 0);
    assert.equal(failures(f).length, 1, 'Only current render reports one error');
  } else {
    assert.deepEqual(resultWrites(f).map(write => write.type), [...Array(srcWrites).fill('src'), 'class', 'comparison']);
    assert.equal(f.image.src, PROCESSED);
    assert.equal(failures(f).length, 0);
    assert.equal(f.writes.filter(write => write.type === 'status' && write.value === 'current output summary').length, 1);
  }
}
for (const transition of ['close', 'dispose', 'workbench-hide']) for (const rejected of [false, true]) {
  previewCase(transition + ' ignores held ' + (rejected ? 'rejection' : 'success'), async f => {
    const pending = f.api.renderOutputVariant(f.item, f.image);
    assert.equal(f.transforms.length, 1);
    f.terminal(transition);
    assert.equal(f.sandbox.localVisibilityEpoch, 1, 'Actual lifetime method advances epoch');
    const before = JSON.stringify(f.writes);
    f.settle(0, rejected); await pending; await drain();
    assert.equal(JSON.stringify(f.writes), before, 'Old continuation has zero preview/status writes');
    assert.equal(f.image.src, RAW); assert.equal(f.item.data, RAW);
  });
}
for (const reveal of ['open', 'workbench']) for (const rejected of [false, true]) {
  previewCase(reveal + ' starts current render over retained pending ' + (rejected ? 'rejection' : 'success'), async f => {
    const old = f.api.renderOutputVariant(f.item, f.image);
    f.terminal(reveal === 'open' ? 'close' : 'workbench-hide');
    await f.reopen(reveal);
    assert.equal(f.sandbox.outputProcessingRevision, 1, 'Actual reveal refreshes preview revision');
    assert.equal(f.transforms.length, 1, 'Fresh consumer reuses normal pending resolver cache');
    f.writes.length = 0; f.settle(0, rejected); await old; await drain();
    assertCurrentCompletion(f, rejected);
  });
}
for (const rejected of [false, true]) {
  previewCase('settlement while closed followed by open: ' + (rejected ? 'retry rejected cache' : 'reuse resolved cache'), async f => {
    const old = f.api.renderOutputVariant(f.item, f.image); f.api.close();
    f.settle(0, rejected); await old; await drain();
    assert.deepEqual(f.writes, [], 'Closed completion/rejection remains silent');
    await f.api.open(); await drain();
    if (rejected) {
      assert.equal(f.transforms.length, 2, 'Existing resolver evicts rejected promise and retries');
      f.writes.length = 0; f.settle(1); await drain();
    } else assert.equal(f.transforms.length, 1, 'Resolved cache is retained normally');
    assertCurrentCompletion(f, false);
  });
  previewCase('unchanged historical ' + (rejected ? 'rejection remains visible' : 'processing stays visible'), async f => {
    const pending = f.api.renderOutputVariant(f.item, f.image);
    f.settle(0, rejected); await pending;
    assertCurrentCompletion(f, rejected);
  });
  previewCase('reopen preserves RAW transition despite old transform ' + (rejected ? 'rejection' : 'success'), async f => {
    const old = f.api.renderOutputVariant(f.item, f.image); f.api.close();
    f.item.scopedEditHistory = [{ status: 'preparing' }];
    await f.reopen('open');
    assert.equal(f.image.src, RAW); assert.equal(f.transforms.length, 1);
    assert.equal(f.writes.filter(write => write.type === 'src').length, 0, 'Retained RAW is not needlessly reassigned');
    const before = JSON.stringify(f.writes);
    f.settle(0, rejected); await old; await drain();
    assert.equal(JSON.stringify(f.writes), before, 'Old transform cannot overwrite reopened RAW');
    assert.equal(f.item.scopedEditHistory[0].status, 'preparing');
    assert.equal(f.writes.find(write => write.type === 'class').value, false);
  });
}
previewCase('already resolved cache survives close/reopen', async f => {
  const first = f.api.renderOutputVariant(f.item, f.image); f.settle(0); await first;
  f.api.close(); f.writes.length = 0; await f.reopen('open');
  assert.equal(f.transforms.length, 1); assertCurrentCompletion(f, false, { srcWrites: 0 });
});
previewCase('manager-style visible then open shares cache and only latest render writes', async f => {
  const old = f.api.renderOutputVariant(f.item, f.image); f.api.close();
  f.api.controller.setWorkbenchVisible(true); await f.api.open(); await drain();
  assert.equal(f.sandbox.outputProcessingRevision, 1, 'Only the closed-to-open transition refreshes');
  assert.equal(f.transforms.length, 1, 'Actual reveal methods do not duplicate the pending conversion');
  f.writes.length = 0; f.settle(0); await old; await drain();
  assertCurrentCompletion(f, false);
});
previewCase('modern RAW reveal starts no local transform', async f => {
  f.item.imageLabelWorkflow = { explicit: true };
  f.api.close();
  await f.reopen('open');
  assert.equal(f.transforms.length, 0); assert.equal(f.image.src, RAW);
  assert.equal(f.writes.filter(write => write.type === 'src').length, 0, 'Retained RAW reveal does not repeat the image load');
  assert.equal(f.writes.find(write => write.type === 'class').value, false);
});
previewCase('disposed controller cannot restart preview through render or either reveal method', async f => {
  f.terminal('dispose'); f.api.controller.dispose();
  assert.equal(f.lifecycleEvents.filter(event => event === 'erase-destroy').length, 1, 'Repeated disposal must not destroy the tool twice');
  const showCount = f.lifecycleEvents.filter(value => value === 'show').length;
  await f.api.renderOutputVariant(f.item, f.image);
  await f.api.open(); f.api.controller.setWorkbenchVisible(true); await drain();
  assert.equal(f.lifecycleEvents.filter(value => value === 'show').length, showCount);
  assert.equal(f.motion.isOpen(), false);
  assert.deepEqual(f.writes, []); assert.equal(f.transforms.length, 0);
});
previewCase('open waiting for workspace readiness cannot revive disposed view', async f => {
  const gate = deferred(); f.sandbox.workspaceReady = gate.promise;
  const pending = f.api.open(); f.api.controller.dispose();
  const showCount = f.lifecycleEvents.filter(value => value === 'show').length;
  gate.resolve(); await pending; await drain();
  assert.equal(f.lifecycleEvents.filter(value => value === 'show').length, showCount);
  assert.equal(f.motion.isOpen(), false);
  assert.deepEqual(f.writes, []); assert.equal(f.transforms.length, 0);
});
previewCase('non-revealing open does not force a visible preview refresh', async f => {
  await f.api.open({ reveal: false }); await drain();
  assert.equal(f.sandbox.outputProcessingRevision, 0); assert.equal(f.transforms.length, 0);
  assert.deepEqual(f.writes, []); assert.equal(f.lifecycleEvents.includes('show'), false);
});
for (const rejected of [false, true]) previewCase('motion target closed without epoch advance blocks ' + (rejected ? 'error' : 'success'), async f => {
  const pending = f.api.renderOutputVariant(f.item, f.image);
  f.motion.hide(); assert.equal(f.sandbox.localVisibilityEpoch, 0);
  f.settle(0, rejected); await pending; await drain();
  assert.deepEqual(f.writes, []); assert.equal(f.image.src, RAW);
});
previewCase('already-open repeated reveals do not bump revision or rerender', async f => {
  const pending = f.api.renderOutputVariant(f.item, f.image);
  f.api.controller.setWorkbenchVisible(true); await f.api.open(); await drain();
  assert.equal(f.sandbox.outputProcessingRevision, 0); assert.equal(f.transforms.length, 1);
  assert.deepEqual(f.writes, []); f.settle(0); await pending; await drain();
  assertCurrentCompletion(f, false);
});
write('case-count.json', { count: serial, executionComplete: false,
  note: 'Registration only. Per-case receipts and the parent node:test result determine execution outcomes.' });
}

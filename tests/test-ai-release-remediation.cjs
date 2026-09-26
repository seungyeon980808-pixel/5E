const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const panelSource = fs.readFileSync(path.join(root, 'preview/js/ai-panel.js'), 'utf8');

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
  const outputGate = deferred();
  const completed = deferred();
  const decodeGate = deferred();
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
  const listeners = new Set();
  let pageRevision = 0;
  const context = {
    state: {
      get: () => draft,
      update: (update) => {
        const pageId = draft.activePageId;
        const pages = draft.pages;
        const page = pages.find((item) => item.id === pageId);
        update(draft);
        const nextPage = draft.pages.find((item) => item.id === draft.activePageId);
        if (draft.activePageId !== pageId || draft.pages !== pages || nextPage !== page) pageRevision += 1;
        for (const listener of listeners) listener(draft);
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      capturePageContext: () => ({ pageId: draft.activePageId, revision: pageRevision }),
      isPageContextCurrent: (token) => token.pageId === draft.activePageId && token.revision === pageRevision,
    },
    busy: false,
    output: {},
    item: { id: 'candidate-A', data: 'candidate-source-A' },
    selectedItem: null,
    activeTaskTabId: 'task-A',
    selectedCandidateId: 'candidate-A',
    generatedImages: [],
    selectedSeparationMode: 'off',
    AI_SEPARATION_MODES: { OFF: 'off' },
    candidateUsesSeparatedAssets: () => false,
    candidateUsesAutomaticSeparation: () => true,
    selectedOutputItem: () => context.selectedItem,
    setBusy: (value) => {
      context.busy = value;
      if (!value) completed.resolve();
    },
    setStatus: () => {},
    panel: { hidden: false, querySelector: () => null },
    resolveOutputVariant: () => outputGate.promise,
    captureActiveTaskTab: () => {},
    persistTasks: () => {},
    close: () => { context.panel.hidden = true; },
    addLog: () => {},
    Image: class {
      naturalWidth = 20;
      naturalHeight = 20;
      set src(_value) {
        if (duringDecode) decodeGate.promise.then(() => this.onload());
        else queueMicrotask(() => this.onload());
      }
    },
    getLastMouseWorld: () => null,
  };
  const pasteSource = fs.readFileSync(path.join(root, 'preview/js/image-paste.js'), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/^export /gm, '');
  const handler = sourcePart('output.onclick = () => {', '\n      };');
  context.selectedItem = context.item;
  vm.runInNewContext(`${pasteSource}\n${handler}\n};`, context);

  context.output.onclick();
  if (!duringDecode) change(context, { pageA, pageB });
  outputGate.resolve('data:image/png;base64,synthetic');
  if (duringDecode) {
    await flush();
    change(context, { pageA, pageB });
    decodeGate.resolve();
  }
  await completed.promise;
  return { context, draft, pageA, pageB };
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

  const closed = await resultInsertionScenario((context) => { context.panel.hidden = true; });
  assert.equal(closed.pageA.length, 0, 'closing the panel must invalidate use');

  const changedCandidate = await resultInsertionScenario((context) => {
    context.selectedItem = { id: 'candidate-B', data: 'candidate-source-B' };
  });
  assert.equal(changedCandidate.pageA.length, 0, 'changing candidate must invalidate use');

  const decodeRace = await resultInsertionScenario(switchPage, { duringDecode: true });
  assert.equal(decodeRace.pageB.length, 0, 'page changes during image decode must invalidate use');

  const unchanged = await resultInsertionScenario();
  assert.equal(unchanged.pageA.length, 1);
  assert.equal(unchanged.draft.undoStack.length, 1);
});

test('AI-160-02: candidate preparation is keyed by source, output, and separation options', async () => {
  const candidateA = { id: 'A', kind: 'generated', data: 'source-A' };
  const candidateB = { id: 'B', kind: 'generated', data: 'source-B' };
  const calls = [];
  const context = {
    generatedImages: [candidateA, candidateB],
    selectedCandidateId: 'A',
    automaticSeparationRun: null,
    automaticSeparationCache: new Map(),
    panel: { dataset: {} },
    activeTaskTabId: 'task-A',
    selectedSeparationMode: 'off',
    selectedImageOutputOptions: { lineThickness: 0 },
    AbortController,
    AI_SEPARATION_MODES: { OFF: 'off', MANUAL: 'manual' },
    syncSelectedOutputActions: () => {},
    candidateUsesAutomaticSeparation: (item) => item?.kind === 'generated',
    separationOptionsForMode: (mode) => ({ layout: mode }),
    normalizeImageOutputOptions: (value) => ({ ...value }),
    transparentizeGeneratedImage: () => {},
    resolveImageOutput: async (item, options) => {
      const value = `${item.id}:thickness-${options.lineThickness}`;
      calls.push(value);
      return value;
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

  assert.equal(prepared.assets[0].source, 'A:thickness-2');
  assert.deepEqual(calls, ['A:thickness-0', 'B:thickness-2', 'A:thickness-2']);
});

test('AI-160-02: the real cache key changes for every rendered or separation input', async () => {
  const module = await import(pathToFileURL(path.join(root, 'preview/js/ai-panel.js')).href);
  const source = 'data:image/png;base64,AA==';
  const output = { backgroundPolicy: 'preserve', examPalette: false, lineThickness: 0 };
  const separation = { layout: 'auto', maxAssets: 128, maxDurationMs: 8000 };
  const base = await module.automaticSeparationCacheKey(source, output, separation);
  const variants = await Promise.all([
    module.automaticSeparationCacheKey('data:image/png;base64,AQ==', output, separation),
    module.automaticSeparationCacheKey(source, { ...output, backgroundPolicy: 'connected' }, separation),
    module.automaticSeparationCacheKey(source, { ...output, examPalette: true }, separation),
    module.automaticSeparationCacheKey(source, { ...output, lineThickness: 2 }, separation),
    module.automaticSeparationCacheKey(source, output, { ...separation, layout: 'grid' }),
  ]);
  assert.equal(new Set([base, ...variants]).size, variants.length + 1);
});

function submitContext(statusPromise) {
  const sends = [];
  let statusCalls = 0;
  const context = {
    panel: { dataset: {}, hidden: false },
    disposed: false,
    busy: false,
    desktop: { web: true, status: () => { statusCalls += 1; return statusPromise; } },
    input: { value: 'request-A' },
    chatInput: { value: 'request-A' },
    activeTaskTabId: 'task-A',
    attachments: [{ id: 'source-A' }],
    generatedImages: [],
    selectedMode: 'diagram',
    selectedOutputEngine: 'raster',
    selectedQualityMode: 'default',
    selectedCandidateId: null,
    referenceComposition: {},
    selectedAssetGenerationMode: 'single',
    modelSelect: { value: 'synthetic' },
    effortSelect: { value: 'medium' },
    speedSelect: { value: '' },
    currentRequestEpoch: 0,
    preflightRun: null,
    structuredClone,
    isWhitePngWorkflow: () => false,
    kiceImageRequest: (value) => value,
    compactConversation: () => '',
    conversationMessages: [],
    snapshotImageItem: (value) => ({ ...value }),
    enforceKiceImageRunInput: (value) => value,
    normalizeReferenceComposition: (value) => value,
    normalizeMarkPolicy: (value) => value,
    readMarkPolicy: () => ({}),
    partitionReferenceItems: (inputs) => ({ inputs, styleReferences: [] }),
    orderedInputReferences: (value) => value,
    commentPrompt: () => '',
    refresh: () => {},
    setStatus: () => {},
    setBusy: (value) => { context.busy = value; sends.push(value); },
  };
  const prefix = sourcePart('  const submit = async (type, options = {}) => {', '    imageReceived = false;');
  vm.runInNewContext(`${prefix}\nreturn {request, taskId:activeTaskTabId, sourceIds:runInput.attachments.map(item=>item.id), requestEpoch};\n};\nglobalThis.submit = submit;`, context);
  return { context, sends, statusCalls: () => statusCalls };
}

test('AI-160-03: preflight locks before status await so a double click prepares one request', async () => {
  const status = deferred();
  const { context, sends, statusCalls } = submitContext(status.promise);
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
  const { context, statusCalls } = submitContext(Promise.resolve({ login: { loggedIn: true } }));
  let workflowChecks = 0;
  context.isWhitePngWorkflow = () => ++workflowChecks === 1;
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
  const { context } = submitContext(status.promise);
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
  const { context } = submitContext(firstStatus.promise);
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
  const candidate = { id: 'A', kind: 'generated', data: 'source-A' };
  const pending = deferred();
  const context = {
    generatedImages: [candidate], selectedCandidateId: 'A', automaticSeparationRun: null,
    automaticSeparationCache: new Map(), panel: { dataset: {} }, activeTaskTabId: 'task-A',
    selectedSeparationMode: 'auto', selectedImageOutputOptions: { lineThickness: 0 }, AbortController,
    AI_SEPARATION_MODES: { OFF: 'off', MANUAL: 'manual' }, syncSelectedOutputActions: () => {},
    candidateUsesAutomaticSeparation: () => true, separationOptionsForMode: () => ({ layout: 'auto' }),
    normalizeImageOutputOptions: (value) => value, transparentizeGeneratedImage: () => {},
    resolveImageOutput: async () => 'source-A', automaticSeparationCacheKey: async () => 'key-A',
    prepareSeparatedAssets: () => pending.promise,
  };
  vm.runInNewContext(sourcePart('  function selectedOutputItem() {', '  function candidateAlreadyInserted(item) {'), context);
  const obsolete = context.startAutomaticSeparation(candidate);
  await flush();
  context.abortAutomaticSeparation('candidate-changed');
  pending.resolve({ assets: [{ id: 'obsolete' }] });
  await obsolete;
  assert.notEqual(candidate.automaticSeparationState, 'ready');
  assert.equal(candidate.automaticSeparationPrepared, null);
});

test('SEC-160-04: default sharing serializes only the active workspace and active task', async () => {
  const module = await import(pathToFileURL(path.join(root, 'preview/js/ai-sharing-document.mjs')).href);
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

const { pathToFileURL } = require('node:url');

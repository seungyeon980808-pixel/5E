// Exercise the actual commitEdit across local and isolated native owners.
// Its statements remain unchanged while only external rendering/IPC is held.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const query = '?v=1.7.0-four-session-integration';
const imports = Promise.all([
  import(pathToFileURL(path.join(root, 'js/rhwp-exam-links.js')).href + query),
  import(pathToFileURL(path.join(root, 'js/project-io.js')).href + query),
]);
const clone = value => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function fixture({ remote = true, ai = true, holdOwner = false } = {}) {
  const [links, project] = await imports;
  const sourceText = fs.readFileSync(path.join(root, 'js/rhwp-exam-workspace.js'), 'utf8');
  const begin = sourceText.indexOf('  async function commitEdit(captured) {');
  const end = sourceText.indexOf('\n  async function loadProject(bytes)', begin);
  assert.ok(begin >= 0 && end > begin, 'Actual commitEdit boundary must exist');
  const link = { tabId: 'tab-original', assetId: 'asset-original' };
  const source = { activePageId: 'page-original', pages: [{
    id: 'page-original', name: 'Rights-clear unit drawing',
    objects: [{ id: 'manual-line', type: 'line', p1: { x: 1, y: 2 }, p2: { x: 8, y: 9 } }],
    guides: [], meta: { examLink: clone(link), sentinel: { keep: ['full', 'source'] } },
  }] };
  project.prepareLoadedProject(source); // Actual native project validator.
  const aiContext = ai ? { scope: 'scope-original', taskId: 'task-original', snapshot: {
    key: 'workspace', activeTaskTabId: 'task-original', tabs: [{ id: 'task-original', generated: [] }],
  } } : null;
  const context = { version: 1, pageId: source.activePageId, viewBox: null, selectedIds: [], ai: aiContext };
  links.validateExamContext(context); // Actual candidate/context validation.
  const original = { id: 'figure-original', version: 1, name: 'Original',
    link: clone(link), context: clone(context), source: clone(source),
    render: { bounds: { x: 0, y: 0, w: 20, h: 20 } },
  };
  const captured = { link: clone(link), context: clone(context), source: clone(source), render: clone(original.render) };
  const primary = { activePageId: source.activePageId, pages: clone(source.pages),
    ai: ai ? { scope: aiContext.scope, taskId: aiContext.taskId } : null,
  };
  // The isolated native canvas intentionally has no copy of the primary page.
  const local = remote ? { activePageId: 'native-empty', pages: [] } : primary;
  const native = [{ id: original.id, bytes: 'original PNG bytes', source: clone(original.source),
    geometry: { x: 10, y: 20, w: 20, h: 20 }, unrelated: { all: ['retained'] } }];
  const raster = deferred(), entered = deferred(), ownerRelease = deferred(), ownerEntered = deferred();
  const calls = { replace: 0, revision: 0, end: 0, changed: 0, save: 0, localLookup: 0, localAi: 0, owner: [] };
  const bridge = { generation: 42, replaceFigure(id, image, nextId, ref, geometry) {
    calls.replace++;
    assert.equal(id, original.id); assert.equal(image, 'new raster bytes');
    native[0] = { ...native[0], id: nextId, bytes: image, geometry: clone(geometry.after) };
  } };
  const figures = new Map([[original.id, clone(original)]]);
  const editing = { id: original.id, figure: clone(original), generation: bridge.generation,
    remote, requestId: '11111111-1111-1111-1111-111111111111', ref: { sec: 0, ppi: 0, ci: 0 } };
  const sandbox = vm.createContext({ clone, crypto: { randomUUID: () => 'figure-next' },
    ...links, prepareLoadedProject: project.prepareLoadedProject, editing, bridge, figures,
    state: { get: () => local },
    tabs: {
      pageForLink(value) { calls.localLookup++; return local.pages.find(page =>
        page.meta?.examLink?.tabId === value.tabId && page.meta.examLink.assetId === value.assetId); },
      markRevision: () => { calls.revision++; },
    },
    connectedAi: { activeExamTask: () => { calls.localAi++; return local.ai; } },
    window: { fiveEExam: { snapshot: async request => {
      calls.owner.push(clone(request)); ownerEntered.resolve();
      if (holdOwner) await ownerRelease.promise;
      const page = primary.pages.find(page => page.meta?.examLink?.tabId === link.tabId && page.meta.examLink.assetId === link.assetId);
      return { pageId: page?.id || null, activePageId: primary.activePageId,
        link: page ? clone(page.meta.examLink) : null, ai: clone(primary.ai) };
    } } },
    imageFor: async () => { entered.resolve(); return raster.promise; },
    figureBounds: value => clone(value.render.bounds),
    endEdit: () => { calls.end++; sandbox.editing = null; },
    changed: () => { calls.changed++; },
    stableSave: async () => { calls.save++; }, message() {},
  });
  vm.runInContext(sourceText.slice(begin, end), sandbox);
  const beforeNative = clone(native), beforeFigures = clone([...figures]);
  const completion = sandbox.commitEdit(captured);
  completion.catch(() => {}); // Preserve rejection until the awaited assertion.
  await entered.promise;
  return { primary, sandbox, native, figures, captured, calls, bridge,
    raster, ownerEntered, ownerRelease, completion, beforeNative, beforeFigures };
}
for (const mutation of ['asset', 'tab', 'removed-page', 'foreign-page-id', 'inactive-page', 'ai-task', 'ai-scope', 'ai-unavailable']) {
  test('actual native commit rejects late primary owner change: ' + mutation, async () => {
    const f = await fixture();
    if (mutation === 'asset') f.primary.pages[0].meta.examLink.assetId = 'asset-foreign';
    if (mutation === 'tab') f.primary.pages[0].meta.examLink.tabId = 'tab-foreign';
    if (mutation === 'removed-page') f.primary.pages = [];
    if (mutation === 'foreign-page-id') { f.primary.pages[0].id = 'page-foreign'; f.primary.activePageId = 'page-foreign'; }
    if (mutation === 'inactive-page') f.primary.activePageId = 'page-foreign';
    if (mutation === 'ai-task') f.primary.ai.taskId = 'task-foreign';
    if (mutation === 'ai-scope') f.primary.ai.scope = 'scope-foreign';
    if (mutation === 'ai-unavailable') f.primary.ai = null;
    const edited = clone(f.primary);
    f.raster.resolve('new raster bytes');
    await assert.rejects(f.completion, /연결된 원래/);
    assert.deepEqual(f.calls.owner, [{ editRequestId: '11111111-1111-1111-1111-111111111111' }]);
    assert.equal(f.calls.localLookup, 0); assert.equal(f.calls.localAi, 0);
    for (const key of ['replace', 'revision', 'end', 'changed', 'save']) assert.equal(f.calls[key], 0, key);
    assert.deepEqual(f.native, f.beforeNative); assert.deepEqual([...f.figures], f.beforeFigures);
    assert.deepEqual(f.primary, edited, 'Every edited primary field is preserved');
  });
}
for (const ai of [false, true]) {
  test('valid native return uses authoritative primary proof, ai=' + ai, async () => {
    const f = await fixture({ ai }); const primaryBefore = clone(f.primary);
    f.raster.resolve('new raster bytes');
    const figure = await f.completion;
    assert.equal(figure.id, 'figure-next'); assert.equal(figure.version, 2);
    assert.deepEqual(figure.link, f.captured.link); assert.deepEqual(figure.context, f.captured.context);
    assert.equal(f.calls.localLookup, 0); assert.equal(f.calls.localAi, 0); assert.equal(f.calls.owner.length, 1);
    for (const key of ['replace', 'revision', 'end', 'changed', 'save']) assert.equal(f.calls[key], 1, key);
    assert.deepEqual(f.figures.get('figure-original'), f.beforeFigures[0][1]);
    assert.deepEqual(f.native[0].unrelated, f.beforeNative[0].unrelated);
    assert.deepEqual(f.primary, primaryBefore);
  });
}
for (const change of ['session', 'generation']) {
  test('actual native commit rechecks ' + change + ' after awaited owner proof', async () => {
    const f = await fixture({ holdOwner: true });
    f.raster.resolve('new raster bytes');
    // A missing remote path must fail, not leave this test waiting forever.
    await Promise.race([f.ownerEntered.promise, f.completion.then(() => assert.fail('Commit completed before owner proof'), error => { throw error; })]);
    if (change === 'session') f.sandbox.editing = { ...f.sandbox.editing };
    else f.bridge.generation++;
    f.ownerRelease.resolve();
    await assert.rejects(f.completion, /시험지가 바뀌었습니다/);
    for (const key of ['replace', 'revision', 'end', 'changed', 'save']) assert.equal(f.calls[key], 0, key);
    assert.deepEqual(f.native, f.beforeNative); assert.deepEqual([...f.figures], f.beforeFigures);
  });
}
test('local commit keeps the actual synchronous ownership path', async () => {
  const f = await fixture({ remote: false });
  f.primary.pages[0].meta.examLink.assetId = 'asset-foreign';
  const edited = clone(f.primary); f.raster.resolve('new raster bytes');
  await assert.rejects(f.completion, /연결된 원래/);
  assert.equal(f.calls.owner.length, 0); assert.equal(f.calls.replace, 0);
  assert.deepEqual(f.native, f.beforeNative); assert.deepEqual([...f.figures], f.beforeFigures); assert.deepEqual(f.primary, edited);
});

test('actual compact proof validator rejects arrays, unknown fields, missing fields and malformed identities', () => {
  const source = fs.readFileSync(path.join(root, 'desktop/main.cjs'), 'utf8');
  const recordStart = source.indexOf('function annotationRecord(value) {');
  const recordEnd = source.indexOf('\nfunction annotationFields(', recordStart);
  const proofStart = source.indexOf('function validateExamOwnerProof(value) {');
  const proofEnd = source.indexOf('\nconst examWorkspaceRequests=', proofStart);
  assert.ok(recordStart >= 0 && recordEnd > recordStart && proofStart >= 0 && proofEnd > proofStart,
    'Actual main-process proof validator must exist');
  const context = vm.createContext({});
  vm.runInContext(source.slice(recordStart, recordEnd) + '\n' + source.slice(proofStart, proofEnd), context);
  const valid = { pageId: 'page-original', activePageId: 'page-original',
    link: { tabId: 'tab-original', assetId: 'asset-original' },
    ai: { scope: 'scope-original', taskId: 'task-original' } };
  const validate = value => {
    // IPC supplies data records in the recipient realm; do not create a false
    // prototype failure by passing a host-realm object to an extracted VM guard.
    context.input = JSON.stringify(value);
    return vm.runInContext('validateExamOwnerProof(JSON.parse(input))', context);
  };
  assert.deepEqual(clone(validate(valid)), valid);
  assert.deepEqual(clone(validate({ ...valid, ai: null })), { ...valid, ai: null });
  const missing = clone(valid); delete missing.pageId;
  const invalid = [null, [], [valid], missing,
    { ...valid, drawing: { pages: [] } },
    { ...valid, pageId: 17 }, { ...valid, activePageId: '' },
    { ...valid, pageId: 'x'.repeat(201) },
    { ...valid, link: [] }, { ...valid, link: null },
    { ...valid, link: { ...valid.link, extra: true } },
    { ...valid, link: { ...valid.link, assetId: 'bad/source/id' } },
    { ...valid, ai: [] }, { ...valid, ai: { ...valid.ai, extra: true } },
    { ...valid, ai: { ...valid.ai, scope: 17 } },
    { ...valid, ai: { ...valid.ai, scope: 'x'.repeat(257) } },
    { ...valid, ai: { ...valid.ai, taskId: '' } }];
  for (const value of invalid) assert.throws(() => validate(value), /그림 소유 확인 응답/, JSON.stringify(value));
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { mixedCandidate, assertCandidateUnion } = require('../tests/fixtures/candidate-union.cjs');

const query = '?v=1.7.0-four-session-integration';
const modules = Promise.all([
  import('../js/store.js' + query),
  import('../js/ai-candidate-materializer.js' + query),
  import('../js/ai-candidate-snapshot.js' + query),
  import('../js/graph/workbench-result.js' + query),
  import('../js/ai-task-workspaces.js' + query),
  import('../js/fivee-project.js' + query),
  import('../js/backup-zip.js' + query),
  import('../js/rhwp-exam-project.js' + query),
  import('../js/editable-png.js' + query),
]).then(parts => Object.assign({}, ...parts));
const planFixture = JSON.parse(fs.readFileSync(require.resolve('../tests/fixtures/graph-reconstruction/linear.json'), 'utf8'));
const png = new Uint8Array(fs.readFileSync(require.resolve('../tests/fixtures/rights-clear-smoke.png')));
const drawing = { version: '0.17', activePageId: 'page', pages: [{ id: 'page', name: 'Source', objects: [] }] };
const bytes = async blob => new Uint8Array(await blob.arrayBuffer());

function nativeCandidate(api, review = false) {
  const plan = structuredClone(planFixture);
  if (review) {
    plan.series[0].curveStyle = 'smooth';
    plan.series[0].analyticFitFailure = 'No safe formula; editable observations retained';
    plan.review.push({ path: 'series.0', reason: 'Keep source review obligation' });
  }
  const graphResult = api.buildWorkbenchGraph(plan, plan.source);
  for (const object of graphResult.objects) object.layerId = 'source-layer';
  return { ...mixedCandidate('data:image/png;base64,AQID'), graphResult };
}

function workspace(candidate, location = 'generated') {
  return { key: 'workspace', tabs: [{ id: 'task-mixed', title: 'Source task', workState: 'idle',
    attachments: location === 'attachments' ? [candidate] : [],
    generated: location === 'generated' ? [candidate] : [], selectedCandidateId: candidate.id,
    conversionKind: 'graph', examLink: { tabId: 'source-tab', assetId: 'asset' },
  }], activeTaskTabId: 'task-mixed', imageSerial: 18, taskTabSerial: 3 };
}

function figure(candidate) {
  return { id: 'figure', name: 'Source', version: 1, source: structuredClone(drawing),
    link: { tabId: 'source-tab', assetId: 'asset' },
    context: { version: 1, pageId: 'page', viewBox: null, selectedIds: [],
      ai: { scope: 'source-scope', taskId: 'task-mixed', snapshot: workspace(candidate) } } };
}

// Preparation is isolated; ownership, validation, live commit and history are real.
function cluster(api, kind = 'image', prepare) {
  const target = { id: 'background', type: kind, aiTaskId: 'task', aiCandidateId: 'old',
    ...(kind === 'image' ? { src: 'old-RAW', imageSelectionLocked: true, aiLabelEditingBackground: true }
      : { x: 0, y: 0, w: 60, h: 45 }) };
  const child = { id: 'child', aiTaskId: 'task', aiCandidateId: 'old',
    ...(kind === 'image' ? { type: 'labeler', text: 'Keep my lock', aiAutoLabel: true, aiParentImageId: target.id }
      : { type: 'funcgraph', planeId: target.id, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }) };
  const manual = { id: 'manual', type: 'text', text: 'Unrelated', locked: true, groupId: 'manual-group' };
  const otherOwner = { ...child, id: 'other-owner', aiTaskId: 'other-task', locked: true };
  const page = { id: 'page', meta: { examLink: { tabId: 'source-tab', assetId: 'asset' } } };
  const state = api.createStore({ activePageId: page.id, pages: [page], objects: [target, child, manual, otherOwner],
    groups: [{ id: 'manual-group', memberIds: [manual.id] }], selectedIds: [child.id], targetedId: child.id,
    activeTool: 'T', undoStack: [], redoStack: [[{ id: 'previous', type: 'text' }]] });
  const calls = { preparation: 0, graphInsertion: 0, rasterInsertion: 0, groupRebuild: 0, notifications: 0 };
  state.subscribe(() => calls.notifications++);
  const prepared = () => ({ image: { ...target, src: 'new-RAW', aiCandidateId: 'new' },
    labels: [{ ...child, id: 'new-child', aiCandidateId: 'new' }] });
  const materialize = api.createCandidateMaterializer(state, {
    validateWorkbenchGraph: api.validateWorkbenchGraph,
    prepareImageCandidateRevision: async () => { calls.preparation++; return prepare ? prepare(prepared) : prepared(); },
    insertWorkbenchGraph: (staging, graph, owner) => {
      calls.graphInsertion++;
      staging.update(value => {
        value.objects = structuredClone(graph.objects).map(object => ({ ...object, aiTaskId: owner.taskId, aiCandidateId: owner.candidateId }));
        value.selectedIds = [value.objects.find(object => object.type === 'coordplane').id];
      });
      return { planeId: staging.get().selectedIds[0], ids: staging.get().objects.map(object => object.id) };
    },
    insertImageFromSrc: () => { calls.rasterInsertion++; assert.fail('Unexpected raster fallback'); },
    rebuildGroups: () => { calls.groupRebuild++; },
  });
  const candidate = kind === 'image' ? { id: 'new', data: 'new-RAW', labelPlan: { labels: [{ text: 'New' }] } }
    : { ...nativeCandidate(api), id: 'new' };
  return { state, target, child, manual, otherOwner, calls, candidate, materialize };
}

for (const kind of ['image', 'coordplane']) {
  for (const lock of ['locked', 'positionLocked']) {
    test(`${kind} owned replacement rejects a child with ${lock} before preparation or mutation`, async () => {
      const api = await modules, f = cluster(api, kind);
      f.child[lock] = true;
      const before = structuredClone(f.state.get()), identities = [...f.state.get().objects];
      await assert.rejects(f.materialize(f.candidate, { taskId: 'task', replaceId: f.target.id }), /잠긴/);
      assert.deepEqual(f.state.get(), before, 'Objects, groups, selection and both history stacks must survive rejection');
      f.state.get().objects.forEach((object, i) => assert.equal(object, identities[i]));
      assert.deepEqual(f.calls, { preparation: 0, graphInsertion: 0, rasterInsertion: 0, groupRebuild: 0, notifications: 0 });
    });
  }

  test(`${kind} unlocked owned replacement still commits once and preserves unrelated locked objects`, async () => {
    const api = await modules, f = cluster(api, kind), before = structuredClone(f.state.get().objects);
    const candidateBefore = structuredClone(f.candidate);
    await f.materialize(f.candidate, { taskId: 'task', replaceId: f.target.id });
    assert.deepEqual(f.state.get().undoStack, [before]);
    assert.deepEqual(f.state.get().redoStack, []);
    assert.equal(f.state.get().objects.find(object => object.id === f.manual.id), f.manual);
    assert.equal(f.state.get().objects.find(object => object.id === f.otherOwner.id), f.otherOwner);
    assert.equal(f.state.get().objects.some(object => object.id === f.child.id), false);
    assert.deepEqual(f.state.get().groups, [{ id: 'manual-group', memberIds: [f.manual.id] }]);
    assert.equal(f.calls.notifications, 1);
    assert.equal(f.calls.groupRebuild, 1);
    assert.equal(f.calls.preparation + f.calls.graphInsertion, 1);
    assert.equal(f.calls.rasterInsertion, 0);
    assert.deepEqual(f.candidate, candidateBefore);
  });
}

test('generic target locks and foreign ownership retain the replacement rejection', async () => {
  const api = await modules;
  for (const patch of [{ locked: true }, { positionLocked: true }, { aiLabelEditingBackground: false }, { aiTaskId: 'foreign' }]) {
    const f = cluster(api);
    Object.assign(f.target, patch);
    const before = structuredClone(f.state.get());
    await assert.rejects(f.materialize(f.candidate, { taskId: 'task', replaceId: f.target.id }), /소유/);
    assert.deepEqual(f.state.get(), before);
    assert.equal(f.calls.preparation, 0);
    assert.equal(f.calls.notifications, 0);
  }
});

test('locking and unlocking an owned child during pending preparation still invalidates the transaction', async () => {
  const api = await modules;
  for (const lock of ['locked', 'positionLocked']) {
    const entered = Promise.withResolvers(), release = Promise.withResolvers();
    const f = cluster(api, 'image', async prepared => { entered.resolve(); await release.promise; return prepared(); });
    const pending = f.materialize(f.candidate, { taskId: 'task', replaceId: f.target.id });
    await entered.promise;
    f.state.update(() => { f.child[lock] = true; });
    f.state.update(() => { f.child[lock] = false; });
    const before = structuredClone(f.state.get());
    release.resolve();
    await assert.rejects(pending, /변경/);
    assert.deepEqual(f.state.get(), before);
    assert.equal(f.calls.notifications, 2, 'Only the two external lock edits notify; no replacement commits');
    assert.equal(f.calls.groupRebuild, 0);
  }
});

const corruptions = [
  ['null tick', graph => { graph.objects.find(o => o.type === 'coordplane').explicitTicksX = [null]; }],
  ['foreign series plane', graph => { graph.objects.find(o => o.type === 'funcgraph').planeId = 'foreign-plane'; }],
  ['null native point coordinate', graph => { graph.objects.find(o => o.type === 'funcgraph').points[0].x = null; }],
  ['duplicate native identity', graph => { graph.objects[1].id = graph.objects[0].id; }],
  ['foreign group member', graph => { graph.groups = [{ id: 'group', memberIds: ['missing'] }]; }],
  ['source hash mismatch', graph => { graph.source.hash = 'another-source'; }],
  ['unsupported native schema', graph => { graph.schema = 'unsupported'; }],
];

for (const [name, corrupt] of corruptions) {
  test(`malformed graph ${name} is rejected by snapshot, workspace, recovery and portable build without altering input`, async () => {
    const api = await modules, item = nativeCandidate(api);
    corrupt(item.graphResult);
    let nativeError;
    assert.throws(() => api.validateWorkbenchGraph(item.graphResult), error => { nativeError = error.message; return true; });
    const before = structuredClone(item), check = error => error.message === nativeError;
    assert.throws(() => api.validateCandidateSnapshot(item), check);
    assert.throws(() => api.snapshotImageItem(item), check);
    assert.throws(() => api.taskItemCopy(item), check);
    for (const location of ['generated', 'attachments']) {
      const value = workspace(item, location), workspaceBefore = structuredClone(value);
      assert.throws(() => api.validateWorkspaceCandidates(value), check);
      assert.throws(() => api.recoverTaskWorkspaceSnapshot(value), check);
      assert.throws(() => api.buildFiveEProject({ projectId: 'bad-graph', drawing,
        workspace: { ai: { workspaces: [value] } } }), check);
      assert.deepEqual(value, workspaceBefore);
    }
    assert.deepEqual(item, before, 'Reject malformed source data; never repair, clamp or delete it');
  });
}

async function corruptPortable(api, packed, mutate) {
  const files = api.unzipStore(packed);
  const payload = JSON.parse(new TextDecoder().decode(files.get('project.json')));
  mutate(payload);
  files.set('project.json', new TextEncoder().encode(JSON.stringify(payload)));
  // Repack valid CRCs so the parser must catch native structure, not archive damage.
  return bytes(api.zipStore([...files].map(([name, data]) => ({ name, data }))));
}

test('portable parser rejects a one-field native corruption before calling the drawing loader', async () => {
  const api = await modules, item = nativeCandidate(api);
  const original = await bytes(api.buildFiveEProject({ projectId: 'graph-parser', drawing,
    workspace: { ai: { workspaces: [workspace(item)] } } }));
  const packed = await corruptPortable(api, original, payload => {
    corruptions[0][1](payload.workspace.ai.workspaces[0].tabs[0].generated[0].graphResult);
  });
  const before = Uint8Array.from(packed), liveDrawing = { objects: [{ id: 'live', type: 'text' }], undoStack: [] };
  const liveBefore = structuredClone(liveDrawing);
  let loaderCalls = 0;
  assert.throws(() => api.parseFiveEProject(packed, source => {
    loaderCalls++;
    liveDrawing.objects = source.pages[0].objects;
    return source;
  }), /눈금/);
  assert.equal(loaderCalls, 0);
  assert.deepEqual(liveDrawing, liveBefore);
  assert.deepEqual(packed, before);
});

test('exam figure context rejects malformed native structure before source restoration', async () => {
  const api = await modules, item = nativeCandidate(api), source = figure(item);
  const original = await bytes(api.buildExamProject({ projectId: 'graph-exam', name: 'Exam',
    documentBytes: new Uint8Array([80, 75, 3, 4]), figures: [source] }));
  const packed = await corruptPortable(api, original, payload => {
    corruptions[0][1](payload.figures[0].context.ai.snapshot.tabs[0].generated[0].graphResult);
  });
  let loaderCalls = 0;
  assert.throws(() => api.parseExamProject(packed, value => { loaderCalls++; return value; }), /눈금/);
  assert.equal(loaderCalls, 0);
  corruptions[0][1](source.context.ai.snapshot.tabs[0].generated[0].graphResult);
  const before = structuredClone(source);
  assert.throws(() => api.buildExamProject({ projectId: 'bad-exam', name: 'Exam',
    documentBytes: new Uint8Array([80, 75, 3, 4]), figures: [source] }), /눈금/);
  assert.throws(() => api.embedEditablePng(png, source), /눈금/);
  assert.deepEqual(source, before);
});

test('malformed native graph never reaches materializer services or commits its inherited raster', async () => {
  const api = await modules, f = cluster(api), item = nativeCandidate(api);
  corruptions[0][1](item.graphResult);
  const before = structuredClone(f.state.get());
  await assert.rejects(f.materialize(item, { taskId: 'task', replaceId: f.target.id }), /눈금/);
  assert.deepEqual(f.state.get(), before);
  assert.deepEqual(f.calls, { preparation: 0, graphInsertion: 0, rasterInsertion: 0, groupRebuild: 0, notifications: 0 });
});

test('valid mixed union and source quality diagnostics survive projection, recovery, drawing, exam and PNG', async () => {
  const api = await modules, expected = nativeCandidate(api, true);
  assert.equal(expected.graphResult.quality.status, 'review');
  assert.ok(expected.graphResult.quality.issues.some(issue => issue.code === 'ANALYTIC_FALLBACK'));
  // A retained critical quality diagnostic is not structural validation authority.
  expected.graphResult.quality.status = 'fail';
  expected.graphResult.quality.issues.push({ code: 'RETAINED_SOURCE_DIAGNOSTIC', severity: 'critical', path: 'series.0', message: 'Preserve pending review' });
  const before = structuredClone(expected);
  api.validateWorkbenchGraph(expected.graphResult);
  for (const projected of [api.snapshotImageItem(expected), api.taskItemCopy(expected)]) {
    assertCandidateUnion(assert, projected, expected);
    assert.notEqual(projected.graphResult, expected.graphResult);
    assert.equal(projected.reviewState, 'needs-attention');
  }
  assertCandidateUnion(assert, api.recoverTaskWorkspaceSnapshot(workspace(expected)).tabs[0].generated[0], expected);
  const restoredDrawing = api.parseFiveEProject(await bytes(api.buildFiveEProject({ projectId: 'valid-union', drawing,
    workspace: { ai: { workspaces: [workspace(expected)] } } })));
  assertCandidateUnion(assert, restoredDrawing.workspace.ai.workspaces[0].tabs[0].generated[0], expected);
  const source = figure(expected);
  const restoredExam = api.parseExamProject(await bytes(api.buildExamProject({ projectId: 'valid-exam', name: 'Exam',
    documentBytes: new Uint8Array([80, 75, 3, 4]), figures: [source] })));
  assert.deepEqual(restoredExam.figures[0], source);
  assertCandidateUnion(assert, restoredExam.figures[0].context.ai.snapshot.tabs[0].generated[0], expected);
  const restoredPng = api.readEditablePng(api.embedEditablePng(png, source));
  assert.deepEqual(restoredPng, source);
  assertCandidateUnion(assert, restoredPng.context.ai.snapshot.tabs[0].generated[0], expected);
  assert.deepEqual(expected, before, 'Validation and round trips never promote or recompute quality/source diagnostics');
});

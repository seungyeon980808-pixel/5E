const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { mixedCandidate, assertCandidateUnion } = require('../tests/fixtures/candidate-union.cjs');
const query = '?v=1.7.0-four-session-integration';
const projection = import('../js/ai-candidate-snapshot.js' + query);
const workspace = import('../js/ai-task-workspaces.js' + query);
const portable = import('../js/fivee-project.js' + query);
const exam = import('../js/rhwp-exam-project.js' + query);
const pngModule = import('../js/editable-png.js' + query);
const png = new Uint8Array(fs.readFileSync(require.resolve('../tests/fixtures/rights-clear-smoke.png')));
const candidate = () => mixedCandidate('data:image/png;base64,' + Buffer.from(png).toString('base64'));
const snapshot = item => ({ key: 'workspace', tabs: [{
  id: 'task-mixed', title: 'Union task', workState: 'idle', conversionKind: 'graph',
  generated: [item], attachments: [], selectedCandidateId: item.id,
  input: 'preserve draft', conversationMessages: [{ role: 'user', text: 'original intent' }],
  examLink: { tabId: 'source-tab-9', assetId: 'asset-9' },
}], activeTaskTabId: 'task-mixed', imageSerial: 18, taskTabSerial: 3 });
const drawing = { version: '0.17', activePageId: 'page-9', pages: [{ id: 'page-9', name: 'Source', objects: [
  { id: 'native-label-9', type: 'labeler', text: 'm_B', p1: { x: 10, y: 20 }, p2: { x: 20, y: 10 }, leaderRoutes: [{ kind: 'straight', attachment: 'label', start: { x: 20, y: 10 }, target: { x: 10, y: 20 }, controls: [], end: 'circle' }] },
  { id: 'plane-4', type: 'coordplane', x: 0, y: 0, w: 20, h: 20 },
] }] };
const figure = item => ({ id: 'figure-9', version: 2, name: 'Native source', source: drawing,
  link: { tabId: 'source-tab-9', assetId: 'asset-9' },
  context: { version: 1, pageId: 'page-9', viewBox: { x: 2, y: 3, w: 90, h: 60 }, selectedIds: ['native-label-9'],
    ai: { scope: 'union-scope', taskId: 'task-mixed', snapshot: snapshot(item) } } });
const bytes = async blob => new Uint8Array(await blob.arrayBuffer());

test('snapshotImageItem and taskItemCopy retain the independent complete union', async () => {
  const { snapshotImageItem, taskItemCopy } = await projection;
  const expected = candidate();
  assertCandidateUnion(assert, snapshotImageItem(expected), expected);
  const copy = taskItemCopy(expected);
  assertCandidateUnion(assert, copy, expected);
  assert.equal(copy.card, null);
  copy.reviewMeta.checks[0].detail.revision = 99;
  copy.graphEdit.revision.id = 'changed';
  copy.comments[0].review.provenance.push('changed');
  assert.equal(expected.reviewMeta.checks[0].detail.revision, 7);
  assert.equal(expected.graphEdit.revision.id, 'native-7');
  assert.deepEqual(expected.comments[0].review.provenance, ['source-doc-7']);
});

test('checkpoint and independent recovery preserve union and interrupted-state policy', async () => {
  const { createTaskPersistence, recoverTaskWorkspaceSnapshot } = await workspace;
  const { taskItemCopy } = await projection;
  const expected = candidate();
  let stored;
  const current = snapshot(expected);
  const persistence = createTaskPersistence({
    capture() { current.tabs[0].generated = current.tabs[0].generated.map(taskItemCopy); },
    snapshot: () => current, store: { async put(value) { stored = structuredClone(value); } },
    warn(error) { throw error; },
  });
  await persistence.checkpoint();
  assertCandidateUnion(assert, stored.tabs[0].generated[0], expected);
  const restored = recoverTaskWorkspaceSnapshot(snapshot(expected));
  assertCandidateUnion(assert, restored.tabs[0].generated[0], expected);
  assert.equal(restored.tabs[0].conversionKind, 'graph');
  const interrupted = snapshot(expected);
  interrupted.tabs[0].workState = 'busy';
  interrupted.tabs[0].inFlightRequest = { snapshot: { request: 'do not resend automatically' } };
  const recovered = recoverTaskWorkspaceSnapshot(interrupted);
  assert.equal(recovered.tabs[0].workState, 'interrupted');
  assert.equal(recovered.tabs[0].inFlightRequest, null);
  assert.deepEqual(recovered.tabs[0].retryRequest, interrupted.tabs[0].inFlightRequest);
  persistence.dispose();
});

test('portable drawing independently retains native objects and mixed candidate metadata', async () => {
  const { buildFiveEProject, parseFiveEProject } = await portable;
  const expected = candidate(), input = { projectId: 'drawing-union', drawing, workspace: { drawing, ai: { workspaces: [snapshot(expected)], activeWorkspace: 0 } } };
  const restored = parseFiveEProject(await bytes(buildFiveEProject(input)));
  assertCandidateUnion(assert, restored.workspace.ai.workspaces[0].tabs[0].generated[0], expected);
  assert.deepEqual(restored.drawing, drawing);
});

test('portable exam independently retains committed and unapplied full source contexts', async () => {
  const { buildExamProject, parseExamProject } = await exam;
  const expected = candidate(), input = { projectId: 'exam-union', name: 'Exam', documentBytes: new Uint8Array([80, 75, 3, 4]), figures: [figure(expected)],
    workspace: { drawing, ai: { workspaces: [snapshot(expected)], activeWorkspace: 0 }, annotationDrafts: [{ id: 'draft-unapplied', text: 'B' }] } };
  const restored = parseExamProject(await bytes(buildExamProject(input)));
  assert.deepEqual(restored, input);
  assertCandidateUnion(assert, restored.figures[0].context.ai.snapshot.tabs[0].generated[0], expected);
  assertCandidateUnion(assert, restored.workspace.ai.workspaces[0].tabs[0].generated[0], expected);
});

test('embedded PNG independently retains full source, frame, drafts, graph and review', async () => {
  const { embedEditablePng, readEditablePng } = await pngModule;
  const expected = candidate(), input = figure(expected);
  const restored = readEditablePng(embedEditablePng(png, input));
  assert.deepEqual(restored, input);
  assertCandidateUnion(assert, restored.context.ai.snapshot.tabs[0].generated[0], expected);
});

test('direct actual roundtrip oracle rejects dropped label and graphEdit mutations', async () => {
  const { buildFiveEProject, parseFiveEProject } = await portable;
  const { taskItemCopy } = await projection;
  for (const key of ['labelPlan', 'graphEdit']) {
    const expected = candidate(), broken = taskItemCopy(expected);
    delete broken[key];
    const restored = parseFiveEProject(await bytes(buildFiveEProject({ projectId: 'mutant', drawing, workspace: { ai: { workspaces: [snapshot(broken)] } } })));
    assert.throws(() => assertCandidateUnion(assert, restored.workspace.ai.workspaces[0].tabs[0].generated[0], expected),
      error => error.code === 'ERR_ASSERTION' && error.message.includes(key));
  }
});

test('invalid candidate source and frame reject independently at recovery and all portable boundaries', async () => {
  const { snapshotImageItem } = await projection;
  const { recoverTaskWorkspaceSnapshot } = await workspace;
  const { buildFiveEProject } = await portable;
  const { buildExamProject } = await exam;
  const { embedEditablePng } = await pngModule;
  for (const mutate of [c => { c.sourceFrame.width = -1; }, c => { c.candidateFrame.height = 0; },
    c => { c.source = 'unvalidated source'; }, c => { c.targetPlacement.candidateSha256 = 'e'.repeat(64); }]) {
    const bad = candidate(); mutate(bad);
    assert.throws(() => snapshotImageItem(bad), /source|frame|binding/);
    assert.throws(() => recoverTaskWorkspaceSnapshot(snapshot(bad)), /source|frame|binding/);
    assert.throws(() => buildFiveEProject({ drawing, workspace: { ai: { workspaces: [snapshot(bad)] } } }), /source|frame|binding/);
    assert.throws(() => buildExamProject({ name: 'Exam', documentBytes: new Uint8Array([80, 75, 3, 4]), figures: [figure(bad)] }), /source|frame|binding/);
    assert.throws(() => embedEditablePng(png, figure(bad)), /source|frame|binding/);
  }
});

test('live source receipt retains identity only before a persistence clone', async () => {
  const { snapshotImageItem } = await projection;
  const expected = candidate(), receipt = Object.freeze({ binding: { sourceSha256: expected.sourceSha256 }, words: [] });
  expected.sourceTextCandidates = receipt;
  const live = snapshotImageItem(expected);
  assert.equal(live.sourceTextCandidates, receipt);
  assert.notEqual(structuredClone(live).sourceTextCandidates, receipt);
  assert.notEqual(JSON.parse(JSON.stringify(live)).sourceTextCandidates, receipt);
  assert.equal(Object.hasOwn(live, 'verified'), false);
});

test('store change metadata never suppresses any notification', async () => {
  const { createStore } = await import('../js/store.js' + query);
  const state = createStore({ value: 0 }), calls = [];
  state.subscribe((value, change) => calls.push([value.value, change]));
  state.update(value => { value.value = 1; }, 'native-text-input');
  state.update(value => { value.value = 2; });
  assert.deepEqual(calls, [[1, 'native-text-input'], [2, undefined]]);
});

test('RAW pending requests share one live service through the compatibility alias', async () => {
  const canonical = await import('../js/ai-label-background.js' + query);
  const compatibility = await import('../preview/js/ai-label-background.js');
  assert.equal(compatibility.resolveImageLabelBackground, canonical.resolveImageLabelBackground);
  const contract = await canonical.imageLabelBackgroundContract({
    payload: { text: 'preserve RAW', attachments: [], model: 'fixture', effort: 'medium' },
    sourceSha256: 'a'.repeat(64), harness: { id: 'union-harness', promptSha256: 'd'.repeat(64) },
  });
  let release, calls = 0;
  const ready = new Promise(resolve => { release = resolve; });
  const options = { contract, generate: async () => { calls++; await ready; return { data: candidate().data }; } };
  const first = canonical.resolveImageLabelBackground(options);
  const second = compatibility.resolveImageLabelBackground(options);
  release();
  const [one, two] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(one.data, two.data);
  assert.equal(one.candidateSha256, two.candidateSha256);
  assert.equal(one.reused, false);
  assert.equal(two.reused, 'concurrent');
});

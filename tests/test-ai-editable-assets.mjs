import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareEditableAssets, insertEditableAssets } from '../js/ai-editable-assets.js';
import { encodeScopedPng, decodeScopedPng } from '../js/ai-scoped-edit-png.js';
const url = bytes => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
const decode = data => decodeScopedPng(new Uint8Array(Buffer.from(data.split(',')[1], 'base64')));
async function fixture(open = false) {
  const data = new Uint8Array(9 * 7 * 4).fill(255);
  for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) {
    if ((x === 1 || x === 5 || y === 1 || y === 5) && !(open && x === 3 && y === 1)) data.set([20, 30, 40, 255], (y * 9 + x) * 4);
  }
  data.set([13, 27, 46, 91], (3 * 9 + 3) * 4);
  return { data, src: url(await encodeScopedPng({ width: 9, height: 7, data })) };
}
const region = { id: 'a', x: 0, y: 0, width: 7, height: 7, label: '<script>㉠</script>', anchor: { x: 3, y: 3 }, labelPoint: { x: 6, y: 0 } };
test('boundary flood removes only exterior alpha and preserves enclosed RGBA exactly', async () => {
  const source = await fixture();
  const result = await prepareEditableAssets(source.src, [region]);
  const out = await decode(result.assets[0].data);
  assert.equal(out.data[3], 0);
  assert.equal(out.data[(2 * 7 + 2) * 4 + 3], 255);
  assert.deepEqual([...out.data.slice((3 * 7 + 3) * 4, (3 * 7 + 3) * 4 + 4)], [13, 27, 46, 91]);
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const o = (y * 7 + x) * 4, s = (y * 9 + x) * 4;
    assert.deepEqual(out.data.slice(o, o + 3), source.data.slice(s, s + 3));
    if (out.data[o + 3]) assert.equal(out.data[o + 3], source.data[s + 3]);
  }
  assert.equal(result.stats.rgbaVerified, true);
});
test('manual keep rectangle preserves white interior reached through open contour', async () => {
  const { src } = await fixture(true);
  const unprotected = await prepareEditableAssets(src, [region]);
  const protectedResult = await prepareEditableAssets(src, [{ ...region, keepRects: [{ x: 2, y: 2, width: 3, height: 3 }] }]);
  assert.equal((await decode(unprotected.assets[0].data)).data[(2 * 7 + 2) * 4 + 3], 0);
  assert.equal((await decode(protectedResult.assets[0].data)).data[(2 * 7 + 2) * 4 + 3], 255);
  assert.equal(protectedResult.assets[0].stats.keepPixelCount, 9);
});
test('invalid regions reject; clipped regions retain original coordinates', async () => {
  const { src } = await fixture();
  for (const regions of [[], [region, { ...region, id: 'b' }], [{ ...region, x: NaN }], [{ ...region, width: 0 }], [{ ...region, x: 0.2 }]]) await assert.rejects(prepareEditableAssets(src, regions));
  const result = await prepareEditableAssets(src, [{ ...region, x: -2, width: 5 }]);
  assert.equal(result.assets[0].x, 0);
  assert.equal(result.assets[0].width, 3);
});
function stateFixture() {
  const value = { activePageId: 'page1', artboard: { w: 90, h: 70 }, objects: [{ id: 'existing' }], undoStack: [], redoStack: [], groups: [], activeLayerId: 8 };
  let updates = 0;
  return { get: () => value, update: fn => { updates++; fn(value); }, updates: () => updates };
}
test('manual correction accepts every region allowed by the separation contract without truncation', async () => {
  const width = 63, height = 7, data = new Uint8Array(width * height * 4).fill(255);
  const src = url(await encodeScopedPng({ width, height, data }));
  const regions = Array.from({ length: 21 }, (_, index) => ({
    id: `region_${index + 1}`, x: index * 3, y: 0, width: 3, height, label: '', labelMode: 'none',
  }));

  const prepared = await prepareEditableAssets(src, regions);
  const state = stateFixture();
  const inserted = insertEditableAssets(state, prepared, { isCurrent: () => true });

  assert.equal(prepared.assets.length, 21);
  assert.equal(inserted.groupIds.length, 21);
  assert.equal(inserted.added, 21);
  assert.equal(state.get().undoStack.length, 1);
});

test('single atomic insertion gives independent groups, native labels, provenance and one undo snapshot', async () => {
  const { src } = await fixture();
  const prepared = await prepareEditableAssets(src, [region, { id: 'b', x: 7, y: 0, width: 2, height: 7, label: 'B', anchor: { x: 8, y: 3 }, labelPoint: { x: 8, y: 0 } }]);
  const state = stateFixture();
  const result = insertEditableAssets(state, prepared, { isCurrent: s => s.activePageId === 'page1', aiTaskId: 'task', aiCandidateId: 'candidate' });
  const value = state.get();
  assert.equal(state.updates(), 1);
  assert.equal(result.added, 4);
  assert.equal(value.groups.length, 2);
  assert.equal(value.undoStack.length, 1);
  assert.deepEqual(value.undoStack[0], [{ id: 'existing' }]);
  assert.equal(value.objects[2].text, '<script>㉠</script>');
  assert.equal(value.objects[2].type, 'labeler');
  for (const object of value.objects.slice(1)) {
    assert.equal(object.aiTaskId, 'task'); assert.equal(object.aiCandidateId, 'candidate'); assert.equal(object.layerId, 8);
    assert(value.groups.find(g => g.id === object.groupId).memberIds.includes(object.id));
  }
  assert.notEqual(value.objects[1].groupId, value.objects[3].groupId);
  assert.equal(value.objects[1].w / value.objects[1].h, 1);
  assert.equal(value.objects[1].src, prepared.assets[0].data);
  // Existing editor undo restores objects and derives its group index from groupId.
  value.objects = value.undoStack.pop();
  const groups = new Map();
  for (const o of value.objects) if (o.groupId) groups.set(o.groupId, [...(groups.get(o.groupId) ?? []), o.id]);
  assert.equal(groups.size, 0);
});
test('automatic insertion keeps separated rasters label-free in one group at source-relative positions', async () => {
  const { src } = await fixture();
  const prepared = await prepareEditableAssets(src, [region, {
    id: 'b', x: 7, y: 0, width: 2, height: 7, label: 'invented label',
    anchor: { x: 8, y: 3 }, labelPoint: { x: 8, y: 0 },
  }]);
  prepared.labelsDisabled = true;
  const state = stateFixture();

  const result = insertEditableAssets(state, prepared, {
    isCurrent: current => current.activePageId === 'page1',
    aiTaskId: 'automatic-task', aiCandidateId: 'automatic-candidate', groupMode: 'single',
  });
  const images = state.get().objects.filter(object => object.type === 'image');

  assert.equal(state.updates(), 1);
  assert.equal(state.get().undoStack.length, 1);
  assert.equal(result.added, 2);
  assert.equal(result.groupIds.length, 1);
  assert.equal(state.get().groups.length, 1);
  assert.deepEqual(state.get().groups[0].memberIds, images.map(image => image.id));
  assert(images.every(image => image.groupId === result.groupIds[0]));
  assert.equal(state.get().objects.some(object => object.type === 'labeler'), false);
  assert.equal(images[1].x - images[0].x, 7 * result.scale);
  assert.equal(images[1].y - images[0].y, 0);
});
test('unknown insertion group modes reject before state mutation', () => {
  const prepared = { width: 10, height: 10, assets: [{ id: 'a', x: 0, y: 0, width: 1, height: 1, data: 'data:image/png;base64,AA==', label: '' }] };
  const state = stateFixture(), before = structuredClone(state.get());
  assert.throws(() => insertEditableAssets(state, prepared, { isCurrent: () => true, groupMode: 'nested' }), /그룹 방식/);
  assert.equal(state.updates(), 0);
  assert.deepEqual(state.get(), before);
});
test('stale preparation and stale callback at commit never mutate object/undo state', async () => {
  const { src } = await fixture();
  const prepared = await prepareEditableAssets(src, [region]);
  for (const limit of [0, 1]) {
    const state = stateFixture(), before = structuredClone(state.get()); let calls = 0;
    assert.throws(() => insertEditableAssets(state, prepared, { isCurrent: () => calls++ < limit }), /변경/);
    assert.deepEqual(state.get(), before);
  }
});
test('per-object label modes and global suppression agree with native inserted labels', async () => {
  const { src } = await fixture();
  for (const mode of ['leader', 'text', 'none']) {
    const prepared = await prepareEditableAssets(src, [{ ...region, labelMode: mode }]);
    const state = stateFixture();
    insertEditableAssets(state, prepared, { isCurrent: () => true });
    const labels = state.get().objects.filter(o => o.type === 'labeler');
    assert.equal(labels.length, mode === 'none' ? 0 : 1);
    if (mode === 'text') assert.deepEqual(labels[0].p1, labels[0].p2);
    if (mode === 'leader') assert.notDeepEqual(labels[0].p1, labels[0].p2);
    prepared.labelsDisabled = true;
    const disabledState = stateFixture();
    insertEditableAssets(disabledState, prepared, { isCurrent: () => true });
    assert.equal(disabledState.get().objects.filter(o => o.type === 'labeler').length, 0);
    assert.equal(prepared.assets[0].labelMode, mode);
    assert.equal(prepared.assets[0].label, region.label);
  }
});

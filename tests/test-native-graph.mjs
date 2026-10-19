import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { buildNativeGraph, insertNativeGraph } from '../js/graph/native-graph.js';
import { jsonClone } from '../js/json-clone.js';

const dir = process.env.EVIDENCE_DIR ? path.resolve(process.env.EVIDENCE_DIR) : path.resolve(import.meta.dirname, '../.omo/evidence/graph-reconstruction-20261004/native');
fs.mkdirSync(dir, { recursive: true });
const plan = () => ({ schema: '5e.graph-reconstruction/v1', source: { id: 'fixture', hash: 'synthetic-test-fixture', width: 600, height: 400, plotBox: { x: 20, y: 20, w: 500, h: 300 } },
  axes: { x: { scale: 'linear', title: '시간', unit: 's', min: -2, max: 8, step: 2, ticks: [{ value: -2, label: '−2' }, { value: 8, label: '8' }] },
    y: { scale: 'linear', title: '', unit: '', min: -5, max: 15, step: 5, ticks: [] } },
  series: [{ id: 'a', kind: 'points', axis: 'y', certainty: 'exact', coordinateSpace: 'data', points: [{ x: -2, y: -5 }, { x: 0, y: 0 }, { x: 8, y: 15 }], breaks: [2], endpoints: [{ index: 1, kind: 'open' }, { index: 2, kind: 'closed' }] }],
  annotations: [{ id: 'note', kind: 'text', text: '구간', x: 2, y: 4, axis: 'y', orientation: 'vertical' }], review: [] });
const results = [];
function scenario(name, run) { try { run(); results.push({ name, pass: true }); } catch (error) { results.push({ name, pass: false, error: error.stack }); } }
const opts = { box: { x: 10, y: 20, w: 100, h: 200 }, layerId: 'main' };
scenario('exact coordinates, labels, breaks and native metadata survive JSON', () => {
  const input = plan(), before = JSON.stringify(input), built = buildNativeGraph(input, opts);
  assert.equal(built.ok, true, built.error); assert.equal(JSON.stringify(input), before);
  const [p, f] = built.objects;
  assert.deepEqual(f.points, [{ x: 10, y: 220 }, { x: 30, y: 170 }, { x: 110, y: 20 }]);
  assert.deepEqual(f.mathPoints, input.series[0].points); assert.deepEqual(f.breaks, [2]);
  assert.deepEqual(f.endpointMarkers, input.series[0].endpoints);
  assert.equal(p.labelY, ''); assert.equal(p.labelOrigin, ''); assert.equal(p.labelX, '시간 (s)');
  assert.deepEqual(p.explicitTicksX, input.axes.x.ticks); assert.deepEqual(p.graphAnnotations, input.annotations);
  assert.deepEqual(JSON.parse(JSON.stringify(built)).objects[1].reconstruction.original, input.series[0]);
  assert.equal(f.planeId, p.id); assert.equal(f.groupId, p.groupId);
  fs.writeFileSync(path.join(dir, 'exact-native-objects.json'), JSON.stringify(built, null, 2));
});
scenario('observed normalized geometry remains explicitly observed', () => {
  const input = plan(); Object.assign(input.series[0], { certainty: 'observed', coordinateSpace: 'normalized', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], breaks: [], endpoints: [] });
  const result = buildNativeGraph(input, opts); assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.objects[1].points, [{ x: 10, y: 220 }, { x: 110, y: 20 }]);
  assert.equal(result.objects[1].reconstruction.certainty, 'observed'); assert.ok(result.review.length > 0);
});
scenario('normalized annotations become editable data positions with original retained', () => {
  const input = plan(); Object.assign(input.annotations[0], { coordinateSpace: 'normalized', x: 0.5, y: 0.25 });
  const result = buildNativeGraph(input, opts); assert.equal(result.ok, true, result.error);
  const p = result.objects[0]; assert.equal(p.graphAnnotations[0].x, 3); assert.equal(p.graphAnnotations[0].y, 0);
  assert.equal(p.graphAnnotations[0].coordinateSpace, 'data'); assert.deepEqual(p.reconstruction.annotations, input.annotations);
});
scenario('y2 bars use original numeric heights without auto-fit', () => {
  const input = plan(); input.axes.y2 = { scale: 'linear', title: '속도', unit: 'm/s', min: -20, max: 200, step: 20, ticks: [] };
  input.series = [{ id: 'bars', kind: 'bar', axis: 'y2', certainty: 'exact', coordinateSpace: 'data', items: [{ label: 'A', value: 200 }, { label: 'B', value: -20 }] }];
  const result = buildNativeGraph(input, opts); assert.equal(result.ok, true, result.error);
  assert.ok(Math.abs(result.objects[1].bars.items[0].h - 200 * 200 / 220) < 1e-10); assert.ok(Math.abs(result.objects[1].bars.items[1].h - 20 * 200 / 220) < 1e-10);
  assert.equal(result.objects[1].barItems[0].value, 200); assert.equal(result.objects[0].y2.y2Max, 200);
  input.series[0].items[0].value = 201; assert.equal(buildNativeGraph(input, opts).ok, false);
});
scenario('expression and shading retain domain and explicit boundaries', () => {
  const input = plan(); input.series = [{ id: 'curve', kind: 'expression', axis: 'y', certainty: 'exact', coordinateSpace: 'data', expression: 'x', domain: { min: -2, max: 8 }, area: { enabled: true, min: 0, max: 4 } }];
  const result = buildNativeGraph(input, opts); assert.equal(result.ok, true, result.error);
  const f = result.objects[1]; assert.equal(f.expr, 'x'); assert.equal(f.domainMin, -2); assert.equal(f.area.worldFrom, 30); assert.equal(f.area.worldTo, 70); assert.equal(f.area.baseY, 170);
});
scenario('invalid input and duplicate IDs leave state byte-for-byte unchanged', () => {
  let data = { objects: [{ id: 'existing', type: 'text', text: 'keep' }], groups: [], activeLayerId: 'main', undoStack: [], redoStack: ['keep'] };
  const store = { get: () => data, update: (fn) => fn(data) }, before = JSON.stringify(data);
  const input = plan(); input.axes.x.max = input.axes.x.min;
  assert.equal(insertNativeGraph(store, input, opts).ok, false); assert.equal(JSON.stringify(data), before);
  assert.equal(insertNativeGraph(store, plan(), { ...opts, nextId: () => 'existing' }).ok, false); assert.equal(JSON.stringify(data), before);
  assert.equal(insertNativeGraph(store, plan(), { ...opts, source: { ...plan().source, hash: 'another-source' } }).ok, false); assert.equal(JSON.stringify(data), before);
});
scenario('one atomic insertion, undo snapshot and serialized group membership', () => {
  const data = { objects: [{ id: 'existing', type: 'text', text: 'keep' }], groups: [], activeLayerId: 'main', undoStack: [], redoStack: ['discard'] };
  let updates = 0; const store = { get: () => data, update: (fn) => { updates++; fn(data); } };
  const result = insertNativeGraph(store, plan(), opts); assert.equal(result.ok, true); assert.equal(updates, 1); assert.equal(data.undoStack.length, 1);
  assert.deepEqual(data.undoStack[0], [{ id: 'existing', type: 'text', text: 'keep' }]); assert.deepEqual(data.redoStack, []);
  assert.deepEqual(data.groups[0].memberIds, result.objectIds);
  const saved = JSON.parse(JSON.stringify(data)); assert.equal(saved.objects[2].groupId, saved.objects[1].groupId); assert.equal(saved.objects[1].planeId, saved.objects[2].id);
  assert.equal(saved.objects[1].type, 'funcgraph'); assert.equal(saved.objects[2].type, 'coordplane'); assert.ok(saved.objects[1].order < saved.objects[2].order);
  fs.writeFileSync(path.join(dir, 'atomic-insertion-state.json'), JSON.stringify(saved, null, 2));
});
scenario('real history engine undo and redo rebuild imported groups', () => {
  const text = fs.readFileSync(path.resolve(import.meta.dirname, '../js/transform.js'), 'utf8');
  const history = text.slice(text.indexOf('function cloneObjects('), text.indexOf('/* ===== MOVE GESTURE'));
  const context = vm.createContext({ isPageHistoryEntry: () => false, jsonClone });
  vm.runInContext(history.replace(/export /g, '') + ';globalThis.history = {undo,redo};', context);
  const data = { objects: [], groups: [], activeLayerId: 'main', undoStack: [], redoStack: [], selectedIds: [] };
  const store = { get: () => data, update: (fn) => fn(data) };
  const inserted = insertNativeGraph(store, plan(), opts); assert.equal(inserted.ok, true);
  context.history.undo(store); assert.equal(data.objects.length, 0); assert.equal(data.groups.length, 0); assert.equal(data.redoStack.length, 1);
  context.history.redo(store); assert.equal(data.objects.length, 2); assert.equal(data.groups.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(data.groups[0].memberIds)).sort(), [...inserted.objectIds].sort());
  assert.equal(data.objects.find(o => o.type === 'funcgraph').reconstruction.original.id, 'a');
  assert.equal(data.objects.at(-1).type, 'coordplane');
  fs.writeFileSync(path.join(dir, 'history-roundtrip.json'), JSON.stringify(data, null, 2));
});
scenario('Bezier math handles and world controls preserve source geometry', () => {
  const input = plan(); input.series[0].handlesMath = input.series[0].points.map(() => ({ ix: -0.5, iy: 0.5, ox: 1, oy: -1 }));
  const built = buildNativeGraph(input, opts); assert.equal(built.ok, true, built.error);
  assert.deepEqual(built.objects[1].handles[1], { inX: 25, inY: 165, outX: 40, outY: 180 });
  assert.deepEqual(built.objects[1].handlesMath, input.series[0].handlesMath);
});
scenario('unsupported variant returns review and makes no insert', () => {
  const input = plan(); input.variant = 'nonuniform';
  const built = buildNativeGraph(input, opts); assert.equal(built.ok, false); assert.ok(built.review.length); assert.deepEqual(built.objects, []);
});
scenario('normalized Bezier offsets use the same y or y2 mapping as their anchors', () => {
  for (const axis of ['y', 'y2']) {
    const input = plan(); input.axes.y2 = { scale: 'linear', title: '', unit: '', min: 20, max: 200, step: 20, ticks: [] };
    Object.assign(input.series[0], { axis, certainty: 'observed', coordinateSpace: 'normalized', points: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }], breaks: [], endpoints: [], handlesMath: [{ ix: -0.1, iy: 0.1, ox: 0.1, oy: -0.1 }, { ix: -0.1, iy: 0.1, ox: 0.1, oy: -0.1 }] });
    const built = buildNativeGraph(input, opts); assert.equal(built.ok, true, built.error);
    const graph = built.objects[1], anchor = graph.points[0], handle = graph.handles[0];
    assert.ok(Math.abs(handle.inX - (anchor.x - 10)) < 1e-9); assert.ok(Math.abs(handle.inY - (anchor.y - 20)) < 1e-9);
    assert.ok(Math.abs(handle.outX - (anchor.x + 10)) < 1e-9); assert.ok(Math.abs(handle.outY - (anchor.y + 20)) < 1e-9);
    assert.deepEqual(graph.reconstruction.original.handlesMath, input.series[0].handlesMath);
    assert.equal(graph.handlesMath[0].iy, axis === 'y2' ? 18 : 2);
  }
});
scenario('legend names suppress automatic duplicate end labels but explicit end labels remain', () => {
  const input = plan(); input.series[0].label = 'A';
  input.legends = [{ x: 2, y: 10, coordinateSpace: 'data', rows: [{ text: 'A', markerShape: 'circle', lineVisible: false }] }];
  const before = JSON.stringify(input);
  assert.equal(buildNativeGraph(input, opts).objects[1].endLabel, '');
  assert.equal(JSON.stringify(input), before);
  input.series[0].endLabel = 'A';
  assert.equal(buildNativeGraph(input, opts).objects[1].endLabel, 'A');
  delete input.series[0].endLabel; delete input.legends;
  assert.equal(buildNativeGraph(input, opts).objects[1].endLabel, 'A');
});
fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ invocation: 'node tests/test-native-graph.mjs', syntheticFixtures: true, results }, null, 2));
for (const result of results) console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.error ? '\n' + result.error : ''}`);
if (results.some((r) => !r.pass)) process.exitCode = 1;

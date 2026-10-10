import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { simplifyPolyline } from '../js/function-graph/polyline-simplify.js';
import { buildNativeGraph } from '../js/graph/native-graph.js';

const dir = path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/graph-polyline-simplify');
fs.mkdirSync(dir, { recursive: true });
const results = [];
const seven = [{ x: 0, y: -1 }, { x: .25, y: -.5 }, { x: .5, y: 0 }, { x: .75, y: .5 },
  { x: 1, y: 1 }, { x: 1.5, y: 1 }, { x: 2, y: .5 }];
function scenario(name, run) {
  try { const observable = run(); results.push({ name, pass: true, observable }); }
  catch (error) { results.push({ name, pass: false, error: error.stack }); }
}
const plan = () => ({ schema: '5e.graph-reconstruction/v1',
  source: { id: 'polyline', hash: 'synthetic-seven-point-polyline', width: 600, height: 400, plotBox: { x: 0, y: 0, w: 600, h: 400 } },
  axes: { x: { scale: 'linear', title: 't', unit: '', min: 0, max: 2, step: .5, ticks: [] },
    y: { scale: 'linear', title: 'I', unit: '', min: -1, max: 1, step: .5, ticks: [] } },
  series: [{ id: 'current', kind: 'points', certainty: 'exact', coordinateSpace: 'data', axis: 'y', curveStyle: 'straight', points: structuredClone(seven), breaks: [], endpoints: [] }],
  annotations: [], review: [] });
const build = input => { const result = buildNativeGraph(input, { layerId: 'main' }); assert.equal(result.ok, true, result.error); return result; };

scenario('seven samples become four vertices without changing the three straight sections', () => {
  const source = structuredClone(seven), result = simplifyPolyline(source);
  assert.deepEqual(result.keptIndices, [0, 4, 5, 6]);
  assert.deepEqual(result.indexMap, [0, null, null, null, 1, 2, 3]);
  assert.deepEqual(source, seven); assert.deepEqual(result.originalPoints, seven);
  for (const i of result.removedIndices) {
    const contact = result.contacts[i], a = result.points[contact.segmentIndex], b = result.points[contact.segmentIndex + 1];
    assert.deepEqual({ x: a.x + contact.t * (b.x - a.x), y: a.y + contact.t * (b.y - a.y) }, seven[i]);
  }
  fs.writeFileSync(path.join(dir, 'seven-to-four.json'), JSON.stringify({ before: seven, after: result }, null, 2));
  return { vertices: result.points.length, sections: result.points.length - 1, restoredRemovedContacts: 3 };
});
scenario('genuine small bends are not rounded away', () => {
  const source = [{ x: 0, y: 0 }, { x: .5, y: .500001 }, { x: 1, y: 1 }];
  assert.deepEqual(simplifyPolyline(source).points, source);
  return { retainedVertices: 3 };
});
scenario('floating point affine mapping does not introduce artificial anchors', () => {
  const source = seven.map(p => ({ x: 10 + p.x * 30, y: 55 - (p.y + 1) * 22.5 }));
  assert.deepEqual(simplifyPolyline(source).keptIndices, [0, 4, 5, 6]);
  return { retainedVertices: 4 };
});
scenario('vertical and repeated-x segments simplify without inventing y=f(x)', () => {
  const source = [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }];
  assert.deepEqual(simplifyPolyline(source).keptIndices, [0, 2, 3]);
  return { retainedVertices: 3, verticalSegment: true };
});
scenario('reversals and duplicate points retain their topology', () => {
  for (const source of [[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: .5, y: 0 }],
    [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 }]]) assert.deepEqual(simplifyPolyline(source).points, source);
  return { preservedCases: 2 };
});
scenario('break boundaries survive and their indices are remapped', () => {
  const source = Array.from({ length: 8 }, (_, i) => ({ x: i, y: i }));
  const result = simplifyPolyline(source, { breaks: [4] });
  assert.deepEqual(result.keptIndices, [0, 3, 4, 7]); assert.deepEqual(result.breaks, [2]);
  return { vertices: 4, breakIndex: 2 };
});
scenario('closed curves, scatter, markers, handles, explicit segment modes and fit remain intact', () => {
  const cases = [{ closed: true }, { lineVisible: false }, { markerShape: 'circle' }, { curveStyle: 'smooth' },
    { handlesMode: 'manual' }, { handlesMath: [{ ix: 0, iy: 0, ox: 0, oy: 0 }] },
    { segmentModes: Array(6).fill('line') }, { arrowSpecs: [{ segmentIndex: 1, t: .5 }] }, { fit: { enabled: true } }];
  for (const options of cases) assert.equal(simplifyPolyline(seven, options).changed, false, JSON.stringify(options));
  return { preservedCases: cases.length };
});
scenario('individual markers, explicit protected indices and unknown point fields remain', () => {
  assert.deepEqual(simplifyPolyline(seven, { endpointMarkers: [{ index: 2, kind: 'open' }] }).keptIndices, [0, 2, 4, 5, 6]);
  assert.deepEqual(simplifyPolyline(seven, { protectedIndices: [3] }).keptIndices, [0, 3, 4, 5, 6]);
  const source = structuredClone(seven); source[1].label = 'measured';
  assert(simplifyPolyline(source).keptIndices.includes(1));
  return { preservedCases: 3 };
});
scenario('native reconstruction stores four edit vertices and all seven source observations', () => {
  const input = plan(), before = structuredClone(input), built = build(input), f = built.objects[1];
  assert.equal(f.mathPoints.length, 4); assert.equal(f.points.length, 4);
  assert.deepEqual(f.originalMathPoints, seven); assert.deepEqual(f.observedOriginalPoints, seven);
  assert.deepEqual(f.reconstruction.original.points, seven); assert.deepEqual(input, before);
  const reopened = JSON.parse(JSON.stringify(built));
  assert.deepEqual(reopened.objects[1], f);
  fs.writeFileSync(path.join(dir, 'native-roundtrip.json'), JSON.stringify({ input, built, reopened }, null, 2));
  return { editableVertices: 4, originalObservations: 7, serializationEqual: true };
});
scenario('native point-index annotations and endpoint markers retain exact contacts after remapping', () => {
  const input = plan(); input.series[0].endpoints = [{ index: 6, kind: 'closed' }];
  input.annotations = [{ id: 'middle', kind: 'guide', text: '', orientation: 'horizontal', coordinateSpace: 'data', axis: 'y', x: .5, y: 0,
    to: { x: 0, y: 0 }, seriesId: 'current', pointIndex: 2 }];
  const built = build(input), p = built.objects[0], f = built.objects[1];
  assert.equal(f.mathPoints.length, 5); assert.equal(p.graphAnnotations[0].pointIndex, 1);
  assert.deepEqual(f.mathPoints[p.graphAnnotations[0].pointIndex], seven[2]);
  assert.equal(f.endpointMarkers[0].index, 4); assert.deepEqual(f.mathPoints[4], seven[6]);
  assert.equal(p.reconstruction.annotations[0].pointIndex, 2);
  fs.writeFileSync(path.join(dir, 'native-protected-contacts.json'), JSON.stringify(built, null, 2));
  return { editableVertices: 5, guideContactEqual: true, endpointContactEqual: true };
});
scenario('log axes use rendered geometry for collinearity', () => {
  const input = plan();
  input.axes.x = { scale: 'log', title: 'x', unit: '', min: 1, max: 100, step: 1, ticks: [] };
  input.axes.y = { scale: 'linear', title: 'y', unit: '', min: 1, max: 100, step: 1, ticks: [] };
  input.series[0].points = [{ x: 1, y: 1 }, { x: 10, y: 10 }, { x: 100, y: 100 }];
  assert.equal(build(input).objects[1].mathPoints.length, 3);
  input.axes.y.scale = 'log'; assert.equal(build(input).objects[1].mathPoints.length, 2);
  return { semilogVertices: 3, loglogVertices: 2 };
});
scenario('native per-point markers and explicit segment modes preserve every vertex', () => {
  for (const properties of [{ markerShape: 'circle' }, { segmentModes: Array(6).fill('line') },
    { arrowSpecs: [{ segmentIndex: 1, t: .5, dir: 1 }] }]) {
    const input = plan(); Object.assign(input.series[0], properties);
    assert.equal(build(input).objects[1].mathPoints.length, 7);
  }
  return { preservedCases: 3 };
});
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ runtime: process.version,
  invocation: `${process.execPath} tests/test-graph-polyline-simplify.mjs`, results,
  passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length }, null, 2));
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.error ? `\n${r.error}` : ''}`);
if (results.some(r => !r.pass)) process.exitCode = 1;

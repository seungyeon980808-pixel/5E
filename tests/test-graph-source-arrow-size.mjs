import assert from 'node:assert/strict';
import { matchSourceAxisArrowSize } from '../js/graph/source-arrow-size.js';
import { buildNativeGraph } from '../js/graph/native-graph.js';

const plan = { schema: '5e.graph-reconstruction/v1', coordinateMode: 'observed',
  source: { id: 'arrows', hash: 'synthetic', width: 400, height: 240, plotBox: { x: 40, y: 25, w: 320, h: 180 } },
  frame: { variant: 'quadrant', arrowX: true, arrowY: true, arrowLength: 2, arrowWidth: 1 },
  axisPlacement: { x: { mode: 'fraction', value: 0 }, y: { mode: 'fraction', value: 0 } },
  axes: Object.fromEntries(['x', 'y'].map(k => [k, { scale: 'unknown', min: null, max: null, step: null, title: '', unit: '', ticks: [] }])),
  series: [{ id: 'line', kind: 'points', certainty: 'observed', coordinateSpace: 'normalized', axis: 'y', points: [{ x: .1, y: .1 }, { x: .8, y: .8 }], breaks: [], endpoints: [] }], annotations: [], review: [] };
function source(heads = true, yWidth = 6) {
  const raster = { width: 400, height: 240, data: new Uint8ClampedArray(400 * 240 * 4).fill(255) };
  const dot = (x, y) => { const i = (y * 400 + x) * 4; raster.data[i] = raster.data[i + 1] = raster.data[i + 2] = 0; };
  for (let x = 40; x <= 360; x++) dot(x, 205);
  for (let y = 25; y <= 205; y++) dot(40, y);
  if (heads) {
    for (let x = 342; x <= 360; x++) for (let d = -Math.round(6 * (360 - x) / 18); d <= Math.round(6 * (360 - x) / 18); d++) dot(x, 205 + d);
    for (let y = 25; y <= 43; y++) for (let d = -Math.round(yWidth * (y - 25) / 18); d <= Math.round(yWidth * (y - 25) / 18); d++) dot(40 + d, y);
  }
  return raster;
}
const before = JSON.stringify(plan), r = matchSourceAxisArrowSize(plan, source());
assert(r.applied, r.reason); assert.equal(JSON.stringify(plan), before);
assert.equal(r.measurements.length, 2);
assert(r.measurements.every(m => Math.abs(m.lengthPx - 19) <= 1 && m.widthPx === 13));
for (const width of [35, 70, 140]) {
  const built = buildNativeGraph(r.plan, { box: { x: 0, y: 0, w: width, h: width * 180 / 320 } });
  assert(built.ok, built.error);
  assert(Math.abs(built.objects[0].axisArrowLength * 320 / width - 19) <= 1);
  assert(Math.abs(built.objects[0].axisArrowWidth * 320 / width - 13) < 1e-9);
}
assert(!matchSourceAxisArrowSize(plan, source(false)).applied, 'A shaft is not an arrowhead');
assert(!matchSourceAxisArrowSize(plan, null).applied);
assert(!matchSourceAxisArrowSize(plan, { ...source(), width: 399 }).applied);
assert(!matchSourceAxisArrowSize({ ...plan, frame: { variant: 'box' } }, source()).applied, 'No arrowheads on a box by default');
assert(!matchSourceAxisArrowSize({ ...plan, frame: { ...plan.frame, arrowX: false, arrowY: false } }, source()).applied);
assert(!matchSourceAxisArrowSize(plan, source(true, 10)).applied, 'Different source heads must not become one invented size');
console.log('PASS source arrowhead measurement, conservative rejection, immutable input and insertion scale');

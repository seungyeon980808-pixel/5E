import assert from 'node:assert/strict';
import { matchSourceGuideDashes } from '../js/graph/source-guide-style.js';

const width = 140, height = 80;
const plan = { source: { width, height, plotBox: { x: 10, y: 10, w: 120, h: 60 } }, annotations: [
  { id: 'dashed', kind: 'guide', text: '', coordinateSpace: 'normalized', orientation: 'horizontal', x: 1, y: .5 },
  { id: 'solid', kind: 'guide', text: '', coordinateSpace: 'normalized', orientation: 'horizontal', x: 1, y: 1 / 6 },
] };
const data = new Uint8ClampedArray(width * height * 4).fill(255);
for (let x = 10; x < 130; x++) {
  if ((x - 10) % 11 < 7) data.set([100, 100, 100, 255], (40 * width + x) * 4);
  data.set([100, 100, 100, 255], (60 * width + x) * 4);
}
const before = JSON.stringify(plan), result = matchSourceGuideDashes(plan, { width, height, data });
assert.equal(result.applied, true);
assert.deepEqual(result.measurements.map(m => [m.annotationId, m.dashPx, m.gapPx]), [['dashed', 7, 4]]);
assert(Math.abs(result.plan.annotations[0].dashLength - 7 * 70 / 120) < 1e-12);
assert.deepEqual(result.plan.annotations[1], plan.annotations[1]);
assert.equal(JSON.stringify(plan), before);
assert.equal(matchSourceGuideDashes(plan, null).plan, plan);
const color = new Uint8ClampedArray(data);
for (let x = 10; x < 130; x++) if ((x - 10) % 11 < 7) color.set([250, 90, 10, 255], (40 * width + x) * 4);
assert.equal(matchSourceGuideDashes(plan, { width, height, data: color }).applied, false);
const blank = new Uint8ClampedArray(width * height * 4).fill(255);
assert.equal(matchSourceGuideDashes(plan, { width, height, data: blank }).applied, false);
console.log('Observed guide dash measurement, solid/color rejection and immutability PASS');

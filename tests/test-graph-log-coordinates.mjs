import assert from 'node:assert/strict';
import { worldFromMath, mathFromWorld, originWorld, planeAsY2, worldYFromMathY2, mathY2FromWorldY, coordinateTicks } from '../js/function-graph/coords.js';
import { sampleFunctionPoints } from '../js/function-graph/sampler.js';
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
const p = { x: 10, y: 20, w: 120, h: 90, xMin: .1, xMax: 1000, yMin: .1, yMax: 100, xScale: 'log', yScale: 'log' };
const scenarios = [];
for (const x of [.1, 1, 10, 100, 1000]) for (const y of [.1, 1, 10, 100]) {
  const w = worldFromMath(p, x, y), m = mathFromWorld(p, w.x, w.y);
  close(m.x, x); close(m.y, y);
}
close(worldFromMath(p, 1, 1).x, 40); close(worldFromMath(p, 1, 1).y, 80);
assert.deepEqual(originWorld(p), { x: 10, y: 110 });
assert.deepEqual(coordinateTicks(p, 'y'), [.1, 1, 10, 100]);
assert.ok(Number.isNaN(worldFromMath(p, 0, 1).x));
assert.ok(Number.isNaN(worldFromMath({...p, yMin: 0}, 1, 1).y));
scenarios.push('log equal decades, forward/inverse, origin boundary, invalid domain');
const right = {...p, y2: {enabled: true, scale: 'log', y2Min: 1, y2Max: 10000}};
close(worldYFromMathY2(right, 100), 65); close(mathY2FromWorldY(right, 65), 100);
assert.equal(planeAsY2(right).yScale, 'log');
assert.equal(planeAsY2({...right, y2: {enabled: true, y2Min: 0, y2Max: 10}}).yScale, 'linear');
scenarios.push('independent right axis and inherited-scale isolation');
const linear = {...p, xScale:'linear', yScale:'linear', xMin:-2, xMax:4, yMin:-3, yMax:6};
assert.deepEqual(worldFromMath(linear, 1, 0), {x:70, y:80});
assert.deepEqual(mathFromWorld(linear, 70, 80), {x:1, y:0});
assert.deepEqual(coordinateTicks(linear,'x',2), [-2,0,2,4]);
scenarios.push('legacy linear arithmetic');
const sampled = sampleFunctionPoints('x', .1, 100, p);
assert.equal(sampled.error, null); assert.ok(sampled.points.length >= 2);
assert.ok(sampled.points.every(q => Number.isFinite(q.x) && Number.isFinite(q.y)));
for (const q of sampled.points) { const m = mathFromWorld(p,q.x,q.y); close(m.x,m.y); }
const invalid = sampleFunctionPoints('x', 0, 10, {...p,xMin:0}); assert.ok(invalid.error);
const crossing = sampleFunctionPoints('x - 1', .1, 100, p); assert.equal(crossing.error,null);
assert.ok(crossing.points.every(q => Number.isFinite(q.x) && Number.isFinite(q.y)));
scenarios.push('logarithmic-x sampling, positive-y clipping, invalid-range rejection');
console.log(JSON.stringify({pass:true,scenarios}, null, 2));

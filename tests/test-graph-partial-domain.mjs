import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleFunctionPoints } from '../js/function-graph/sampler.js';
import { mathFromWorld } from '../js/function-graph/coords.js';

const plane = { x: 0, y: 0, w: 100, h: 100, xMin: -3, xMax: 3, yMin: -2, yMax: 4 };
for (const [expression, valid] of [
  ['sqrt(x)', x => x >= -1e-9],
  ['ln(x)', x => x > 0],
  ['log(x)', x => x > 0],
  ['asin(x)', x => Math.abs(x) <= 1 + 1e-9],
  ['acos(x)', x => Math.abs(x) <= 1 + 1e-9],
  ['sqrt(1-x^2)', x => Math.abs(x) <= 1 + 1e-9],
]) {
  test(`${expression} renders its real-valued portion of a wider domain`, () => {
    const result = sampleFunctionPoints(expression, -3, 3, plane);
    assert.equal(result.error, null);
    assert.ok(result.points.length >= 2 && result.points.length <= 4000);
    assert.ok(result.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
    assert.ok(result.points.every(p => valid(mathFromWorld(plane, p.x, p.y).x)));
  });
}

test('invalid intervals still break separated real-valued branches', () => {
  const result = sampleFunctionPoints('sqrt(x^2-1)', -3, 3, plane);
  assert.equal(result.error, null);
  assert.ok(result.breaks.length > 0);
  for (const start of result.breaks) {
    const left = mathFromWorld(plane, result.points[start - 1].x, result.points[start - 1].y).x;
    const right = mathFromWorld(plane, result.points[start].x, result.points[start].y).x;
    assert.ok(left <= -1 && right >= 1, 'no stroke connects across the invalid central interval');
  }
});

test('a fully non-real domain yields no drawable points without a false detail-budget error', () => {
  const result = sampleFunctionPoints('sqrt(-x^2-1)', -3, 3, plane);
  assert.equal(result.error, null);
  assert.deepEqual(result.points, []);
});

test('high-frequency detail and discontinuity guards remain active', () => {
  const highFrequency = sampleFunctionPoints('sin(1600*pi*x)', -1, 1, { ...plane, xMin: -1, xMax: 1 });
  assert.match(highFrequency.error, /4,000/);
  assert.deepEqual(highFrequency.points, []);
  for (const expression of ['1/x', 'sign(x)', 'floor(x)']) {
    const result = sampleFunctionPoints(expression, -3, 3, plane);
    assert.equal(result.error, null);
    assert.ok(result.breaks.length > 0);
  }
});

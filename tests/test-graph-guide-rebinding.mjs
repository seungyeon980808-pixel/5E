import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { compile } from '../js/function-graph/parser.js';

// Invoke the real modal implementation without DOM setup. This is the same
// module loading approach as the existing editing reconstruction harness.
const source = readFileSync(new URL('../js/graph/graph-modal.js', import.meta.url), 'utf8')
  .replace(/^import\s[\s\S]*?from\s*["'][^"']+["'];\s*/gm, '')
  .replace(/\bexport\s+(?=function)/g, '');
const context = vm.createContext({ console, structuredClone, compile });
vm.runInContext(source + '\nglobalThis.runRebind=(plane,list,series,baseline)=>{_series=series;_editBaseline=baseline?{series:baseline}:null;rebindGraphAnnotations(plane,list);return plane;};', context);
const invoke = ({ annotations, current, baseline, points }) => {
  const plane = { graphAnnotations: structuredClone(annotations) };
  const list = [{ id: 'curve', seriesId: 'series', mathPoints: points || [] }];
  const result = context.runRebind(plane, list, [structuredClone(current)], baseline ? [structuredClone(baseline)] : null);
  return JSON.parse(JSON.stringify(result.graphAnnotations));
};
const expr = (expression = 'x', offset = { dx: 0, dy: 0 }) => ({ objectId: 'curve', seriesId: 'series', kind: 'expr', expr: expression, offset, domain: { min: 0, max: 4 } });
const guide = (orientation = 'horizontal', properties = {}) => ({ id: 'guide', kind: 'guide', seriesId: 'series', orientation, x: 2, y: 2, to: orientation === 'horizontal' ? { x: -.25, y: 2 } : { x: 2, y: -.5 }, anchorX: 2, strokeWidth: .19, dashLength: 1.34, dashGap: .76, ...properties });
let count = 0;
const test = (name, fn) => { fn(); count++; console.log(`PASS ${name}`); };
const close = (actual, expected) => assert(Math.abs(actual - expected) < 1e-12, `${actual} ≈ ${expected}`);

test('formula +0.05 moves both horizontal guide heights and preserves the axis-side extent and style', () => {
  const original = guide(), [changed] = invoke({ annotations: [original], current: expr('x+0.05'), baseline: expr() });
  close(changed.y, 2.05); close(changed.to.y, 2.05); assert.equal(changed.x, 2); assert.equal(changed.to.x, -.25);
  assert.equal(changed.anchorX, 2);
  for (const key of ['id', 'kind', 'orientation', 'strokeWidth', 'dashLength', 'dashGap', 'seriesId']) assert.equal(changed[key], original[key]);
});

test('formula offset moves both vertical guide x coordinates but retains its opposite y endpoint', () => {
  const original = guide('vertical', { x: 2.1, y: 2.2, anchorX: 2.1, to: { x: 2.1, y: -.5 } });
  const [changed] = invoke({ annotations: [original], current: expr('x', { dx: .35, dy: -.1 }), baseline: expr('x', { dx: .1, dy: .2 }) });
  close(changed.x, 2.35); close(changed.to.x, 2.35); close(changed.y, 1.9); assert.equal(changed.to.y, -.5); close(changed.anchorX, 2.35);
});

test('a horizontal offset extends its original horizontal guide without translating the axis-side x endpoint', () => {
  const [changed] = invoke({ annotations: [guide()], current: expr('x', { dx: .3, dy: .2 }), baseline: expr() });
  close(changed.x, 2.3); close(changed.y, 2.2); close(changed.to.y, 2.2); assert.equal(changed.to.x, -.25);
});

test('point-index horizontal guides move both heights when a point changes', () => {
  const current = { objectId: 'curve', seriesId: 'series', kind: 'points', pts: [{ x: 2.4, y: 2.3 }], editStartPoints: [{ x: 2, y: 2 }] };
  const baseline = { ...structuredClone(current), pts: [{ x: 2, y: 2 }] };
  const original = guide('horizontal', { anchorX: undefined, pointIndex: 0 });
  const [changed] = invoke({ annotations: [original], current, baseline, points: [{ x: 2.4, y: 2.3 }] });
  assert.equal(changed.x, 2.4); close(changed.y, 2.3); close(changed.to.y, 2.3); assert.equal(changed.to.x, -.25); assert.equal(changed.pointIndex, 0);
});

test('point-index vertical guides move both x coordinates and preserve the original lower endpoint', () => {
  const current = { objectId: 'curve', seriesId: 'series', kind: 'points', pts: [{ x: 2.4, y: 2.3 }], editStartPoints: [{ x: 2, y: 2 }] };
  const baseline = { ...structuredClone(current), pts: [{ x: 2, y: 2 }] };
  const [changed] = invoke({ annotations: [guide('vertical', { anchorX: undefined, pointIndex: 0 })], current, baseline, points: [{ x: 2.4, y: 2.3 }] });
  close(changed.x, 2.4); close(changed.to.x, 2.4); assert.equal(changed.to.y, -.5); close(changed.y, 2.3);
});

test('geometry takes precedence over label orientation for a two-ended vertical line', () => {
  const original = guide('horizontal', { to: { x: 2, y: -.5 } });
  const [changed] = invoke({ annotations: [original], current: expr('x', { dx: .3, dy: 0 }), baseline: expr() });
  close(changed.x, 2.3); close(changed.to.x, 2.3); assert.equal(changed.to.y, -.5);
});

test('style-only edits preserve all original rounded guide coordinates exactly', () => {
  const baseline = expr('cos(pi*x)^2'), current = { ...expr('cos(pi*x)^2'), strokeWidth: .7 };
  const original = guide('horizontal', { x: .4, y: .0955, anchorX: .4, to: { x: -.0003, y: .0955 } });
  assert.deepEqual(invoke({ annotations: [original], current, baseline }), [original]);
});

test('unchanged point geometry without an edit baseline never snaps a measured annotation to rounded samples', () => {
  const current = { objectId: 'curve', seriesId: 'series', kind: 'points', pts: [{ x: 2, y: 2 }], editStartPoints: [{ x: 2, y: 2 }] };
  const original = guide('horizontal', { x: 2.0001, y: 2.0001, to: { x: 0, y: 2.0001 }, anchorX: undefined, pointIndex: 0 });
  const expected = JSON.parse(JSON.stringify(original));
  assert.deepEqual(invoke({ annotations: [original], current, points: [{ x: 2, y: 2 }] }), [expected]);
});

test('arbitrary diagonal guide opposite endpoint is not translated by a formula edit', () => {
  const original = guide('horizontal', { to: { x: -.25, y: .8 } });
  const [changed] = invoke({ annotations: [original], current: expr('x+0.05'), baseline: expr() });
  close(changed.y, 2.05); assert.deepEqual(changed.to, original.to);
});

test('arrow and leader edits still change only their connected endpoint', () => {
  for (const kind of ['arrow', 'leader']) {
    const original = { id: kind, kind, seriesId: 'series', orientation: 'horizontal', x: -.2, y: .6, to: { x: 2, y: 2 }, anchorX: 2, strokeWidth: .21 };
    const [changed] = invoke({ annotations: [original], current: expr('x+0.05', { dx: .1, dy: 0 }), baseline: expr() });
    assert.equal(changed.x, -.2); assert.equal(changed.y, .6); close(changed.to.x, 2.1); close(changed.to.y, 2.05); assert.equal(changed.strokeWidth, .21);
  }
});

test('point-index arbitrary guide and arrows keep their independent endpoint and label positions', () => {
  const current = { objectId: 'curve', seriesId: 'series', kind: 'points', pts: [{ x: 2.5, y: 2.5 }], editStartPoints: [{ x: 2, y: 2 }] };
  const baseline = { ...structuredClone(current), pts: [{ x: 2, y: 2 }] };
  const original = guide('horizontal', { anchorX: undefined, pointIndex: 0, to: { x: 0, y: 1 } });
  const [diagonal] = invoke({ annotations: [original], current, baseline, points: [{ x: 2.5, y: 2.5 }] });
  assert.deepEqual(diagonal.to, original.to); assert.equal(diagonal.x, 2.5); assert.equal(diagonal.y, 2.5);
  const arrow = { id: 'arrow', kind: 'arrow', seriesId: 'series', pointIndex: 0, x: -.2, y: .6, to: { x: 2, y: 2 }, orientation: 'horizontal' };
  const [moved] = invoke({ annotations: [arrow], current, baseline, points: [{ x: 2.5, y: 2.5 }] });
  assert.equal(moved.x, -.2); assert.equal(moved.y, .6); assert.deepEqual(moved.to, { x: 2.5, y: 2.5 });
});

console.log(`${count} graph guide rebinding scenarios passed`);

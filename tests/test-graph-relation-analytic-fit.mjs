import assert from 'node:assert/strict';
import { fitRelationAnalyticPlan, checkRelationAnalyticApproximation, RELATION_ANALYTIC_FIT_VERSION } from '../js/function-graph/relation-analytic-fit.js';
import { compile } from '../js/function-graph/parser.js';
import { validateGraphPlan } from '../js/graph/reconstruction-contract.js';

let count = 0;
const test = (name, fn) => { fn(); count++; console.log(`PASS ${name}`); };
const samples = (f, lo, hi, n = 25) => Array.from({ length: n }, (_, i) => { const x = lo + (hi - lo) * i / (n - 1); return { x, y: f(x) }; });
const series = (id, points, properties = {}) => ({ id, kind: 'points', axis: 'y', certainty: 'observed', coordinateSpace: 'data', points, curveStyle: 'smooth', lineStyle: 'solid', breaks: [], endpoints: [], ...properties });
const plan = (curves, axes = {}) => ({ schema: '5e.graph-reconstruction/v1', variant: 'cartesian', coordinateMode: 'data', source: { id: 'relation-analytic-synthetic', hash: 'relation-analytic-synthetic-v1', width: 700, height: 500, plotBox: { x: 70, y: 50, w: 560, h: 400 } },
  axisPlacement: { x: { mode: 'fraction', value: 0 }, y: { mode: 'fraction', value: 0 } }, axes: { x: { scale: 'linear', title: '', unit: '', min: 0, max: 4, step: 1, ticks: [], ...axes.x }, y: { scale: 'linear', title: '', unit: '', min: 0, max: 5, step: 1, ticks: [], ...axes.y } }, series: curves,
  annotations: [{ id: 'origin-label', kind: 'text', text: '0', x: 0, y: 0, axis: 'y', coordinateSpace: 'normalized', orientation: 'horizontal' }], review: [] });
const wavePlan = (proposal = false) => {
  const p = plan([series('wave', samples(x => Math.cos(Math.PI * x) ** 2, 0, 3), { candidateFamily: 'periodic', ...(proposal ? { candidateExpression: 'cos(pi*x)^2' } : {}) })], {
    x: { scale: 'linear', min: 0, max: 3.6, ticks: [1, 2, 3].map(value => ({ value, label: `${value}t₀` })) },
    y: { scale: 'linear', min: 0, max: 1.6, ticks: [{ value: 1, label: 'h₀' }] } });
  for (let i = 1; i <= 3; i++) p.annotations.push({ id: `height-${i}`, kind: 'guide', text: '', x: i, y: 1, to: { x: 0, y: 1 }, axis: 'y', orientation: 'horizontal', coordinateSpace: 'data', seriesId: 'wave', pointIndex: i * 8 });
  return p;
};
const checked = p => {
  const before = JSON.stringify(p), result = fitRelationAnalyticPlan(p);
  assert.equal(JSON.stringify(p), before, 'Original plan remains immutable');
  for (const conversion of result.conversions) {
    const s = result.plan.series.find(s => s.id === conversion.seriesId);
    assert.equal(s.kind, 'expression');
    assert.equal(s.approximation.method, RELATION_ANALYTIC_FIT_VERSION);
    const check = checkRelationAnalyticApproximation(s, result.plan);
    assert(check.ok, JSON.stringify({ conversion, check }));
    assert.equal(s.certainty, 'observed');
  }
  return result;
};

test('twenty five observations with same-height peak anchors recover cos² without a candidate expression', () => {
  const p = wavePlan(), r = checked(p), s = r.plan.series[0];
  assert.equal(r.conversions.length, 1, JSON.stringify(r.rejected));
  assert.equal(s.approximation.family, 'cosine-square');
  assert.deepEqual(s.observedPoints, p.series[0].points);
  assert.deepEqual(r.plan.axes, p.axes);
  const f = compile(s.expression);
  for (const x of [0, 1, 2, 3]) assert(Math.abs(f(x) - 1) < 1e-10);
  for (const x of [.5, 1.5, 2.5]) assert(Math.abs(f(x)) < 1e-10);
  for (const [i, annotation] of p.annotations.entries()) {
    assert.equal(r.plan.annotations[i].x, annotation.x); assert.equal(r.plan.annotations[i].y, annotation.y); assert.deepEqual(r.plan.annotations[i].to, annotation.to);
  }
});

test('the exact AI candidate is considered despite calibrated tick units and a wrong family hint', () => {
  const p = wavePlan(true); p.series[0].candidateFamily = 'power-inverse';
  const r = checked(p), s = r.plan.series[0];
  assert.equal(s.kind, 'expression'); assert.equal(s.expression, 'cos(pi*x)^2'); assert.equal(s.approximation.sourceFamily, 'power-inverse');
});

test('a noisy periodic drawing preserves derived axis contacts and exact peak contacts', () => {
  const p = wavePlan(); p.series[0].points = p.series[0].points.map((p, i) => ({ ...p, y: p.y + (i % 4 ? .003 * Math.sin(i * 1.7) : 0) }));
  const r = checked(p), f = compile(r.plan.series[0].expression);
  assert.equal(r.conversions.length, 1); assert(Math.abs(f(1)) < 1.000001 && Math.abs(f(.5)) < 1e-9);
});

test('shifted square-root and low quadratic terms recover a vertical-start trajectory with few anchors', () => {
  const points = Array.from({ length: 17 }, (_, i) => { const t = i / 16; return { x: 2 * t * t, y: 4 * t - t * t }; });
  const p = plan([series('trajectory', points, { candidateFamily: 'none', lineStyle: 'dashed', dashLength: 2, dashGap: 1, endpoints: [{ index: 0, kind: 'closed' }, { index: 16, kind: 'open', markerSize: .8 }], arrowSpecs: [{ segmentIndex: 8, t: .4, dir: 1, strokeWidth: .7 }] })]);
  const r = checked(p), s = r.plan.series[0], f = compile(s.expression);
  assert.equal(r.conversions.length, 1, JSON.stringify(r.rejected));
  assert.equal(s.approximation.family, 'sqrt-quadratic');
  assert(Math.abs(f(0)) < 1e-10); assert(Math.abs(f(2) - 3) < 1e-10);
  assert.equal(s.lineStyle, 'dashed'); assert.equal(s.dashLength, 2); assert.equal(s.dashGap, 1);
  assert.equal(s.arrowSpecs[0].dir, 1); assert.equal(s.arrowSpecs[0].strokeWidth, .7);
  const markers = r.plan.annotations.filter(a => a.seriesId === s.id && a.kind === 'point');
  assert.deepEqual(markers.map(m => [m.x, m.y, m.endStyle]), [[0, 0, 'closed'], [2, 3, 'open']]);
  assert.equal(markers[1].markerSize, .8);
});

test('negative inverse branch plus background is allowed without inventing a shifted pole', () => {
  const p = plan([series('left', samples(x => .5 - .5 / x, -3, -.35), { candidateFamily: 'rational' })], {
    x: { scale: 'linear', min: -4, max: 4, ticks: [{ value: -1, label: '-d' }, { value: 1, label: 'd' }] },
    y: { scale: 'linear', min: -2, max: 3, ticks: [{ value: 1, label: 'E₁' }] } });
  const r = checked(p), s = r.plan.series[0]; assert.equal(s.kind, 'expression'); assert.equal(s.approximation.family, 'reciprocal');
  assert(Math.abs(compile(s.expression)(-1) - 1) < 1e-8);
});

test('opposite rational branches share exactly one pole and one background', () => {
  const left = samples(x => .5 - .5 / x, -3, -.25, 45), right = samples(x => .5 - .5 / x, .25, 3, 45);
  const li = left.findIndex(p => Math.abs(p.x + 1) < 1e-8), ri = right.findIndex(p => Math.abs(p.x - 1) < 1e-8);
  assert(li >= 0 && ri >= 0);
  const p = plan([series('left', left, { relationAnchors: [{ xTickLabel: '-d', yTickLabel: 'E₁' }] }), series('right', right, { relationAnchors: [{ xTickLabel: 'd', yTickLabel: '0' }] })], {
    x: { scale: 'linear', min: -4, max: 4, ticks: [{ value: -1, label: '-d' }, { value: 1, label: 'd' }] },
    y: { scale: 'linear', min: -2, max: 3, ticks: [{ value: 0, label: '0' }, { value: 1, label: 'E₁' }] } });
  const r = checked(p); assert.equal(r.conversions.length, 2, JSON.stringify(r.rejected));
  assert.equal(r.plan.series[0].approximation.family, 'shared-reciprocal');
  assert.equal(r.plan.series[0].expression, r.plan.series[1].expression);
  assert.deepEqual(r.plan.series[0].approximation.model.seriesIds, ['left', 'right']);
  const f = compile(r.plan.series[0].expression); assert(Math.abs(f(-1) - 1) < 1e-9); assert(Math.abs(f(1)) < 1e-9);
});

test('independent curves without opposing reference contacts are not grouped', () => {
  const p = plan([series('left', samples(x => .4 - .4 / x, -3, -.3)), series('right', samples(x => .7 - .2 / x, .3, 3))], {
    x: { scale: 'linear', min: -4, max: 4, ticks: [{ value: -1, label: '-d' }, { value: 1, label: 'd' }] }, y: { scale: 'linear', min: -2, max: 3, ticks: [] } });
  const r = checked(p); assert.equal(r.conversions.length, 2);
  assert(r.plan.series.every(s => s.approximation.model.kind !== 'shared-pole'));
});

test('shifted square root, exponential and logarithmic curves have bounded editable formulas', () => {
  for (const [f, lo, hi, family] of [[x => 1 + Math.sqrt(x - 1), 1, 3, 'shifted-sqrt'], [x => .5 + Math.exp(.8 * x), 0, 1, 'exponential'], [x => 2 + Math.log(x + .5), 0, 2, 'logarithmic']]) {
    const p = plan([series('curve', samples(f, lo, hi, 41), { candidateFamily: family })]);
    const r = checked(p), s = r.plan.series[0];
    assert.equal(s.kind, 'expression', JSON.stringify({ family, rejected: r.rejected })); assert(s.expression.length < 200);
  }
});

test('uncalibrated normalized periodic graphs remain in their original unknown axes', () => {
  const p = wavePlan(); p.coordinateMode = 'observed';
  p.axes = { x: { scale: 'unknown', title: 't', min: null, max: null, ticks: [] }, y: { scale: 'unknown', title: 'h', min: null, max: null, ticks: [] } };
  p.series[0].coordinateSpace = 'normalized'; p.series[0].points = samples(x => Math.cos(3 * Math.PI * x) ** 2, 0, 1); p.annotations = [];
  const r = checked(p); assert.equal(r.conversions.length, 1, JSON.stringify(r.rejected));
  assert.equal(r.plan.coordinateMode, 'observed'); assert.deepEqual(r.plan.axes, p.axes); assert.equal(r.plan.series[0].coordinateSpace, 'normalized');
});

test('saved observations, contacts, arrow directions and errors cannot be bypassed by metadata edits', () => {
  const valid = checked(wavePlan(true)).plan;
  for (const mutation of [s => s.expression = 'cos(2*pi*x)^2', s => s.approximation.maxDeviation = 0, s => s.approximation.tolerance.maxDistance = .8, s => s.approximation.anchors.pop(), s => s.approximation.sourceCurveStyle = 'straight', s => s.approximation.coefficientSource = 'physical-law', s => s.approximation.parameterCount = 2, s => s.domain.max = 2]) {
    const p = structuredClone(valid); mutation(p.series[0]); assert(!checkRelationAnalyticApproximation(p.series[0], p).ok);
  }
  const p = plan([series('quad', samples(x => x * x, 0, 1), { endpoints: [{ index: 0, kind: 'closed' }, { index: 24, kind: 'open' }], arrowSpecs: [{ segmentIndex: 4, t: .3, dir: -1 }] })]);
  const r = checked(p).plan;
  const moved = structuredClone(r); moved.annotations.find(a => a.endStyle).y = .1; assert(!checkRelationAnalyticApproximation(moved.series[0], moved).ok);
  const directed = structuredClone(r); directed.series[0].arrowSpecs[0].dir = 1; assert(!checkRelationAnalyticApproximation(directed.series[0], directed).ok);
});

test('aliased high-frequency proposals are rejected rather than recording fabricated zero errors', () => {
  const p = plan([series('curve', samples(x => x, 0, 1), { candidateExpression: 'x+sin(76800*pi*x)' })]);
  const r = checked(p); assert.equal(r.plan.series[0].approximation.family, 'linear');
  const forged = structuredClone(r.plan), s = forged.series[0];
  s.expression = 'x+sin(76800*pi*x)'; s.approximation.model = { kind: 'proposal', expression: s.expression }; s.approximation.family = 'candidate-expression'; s.approximation.parameterCount = 0; s.approximation.sourceCandidateExpression = s.expression;
  assert(!checkRelationAnalyticApproximation(s, forged).ok);
});

test('discrete dots, gaps, manual handles, closed cycles and non-functions retain original geometry', () => {
  for (const mutation of [s => s.lineVisible = false, s => s.markerShape = 'circle', s => s.closed = true, s => s.breaks = [4], s => s.handlesMath = [], s => s.points[3].x = s.points[2].x]) {
    const p = plan([series('curve', samples(x => x * x, 0, 1))]); mutation(p.series[0]);
    const r = checked(p); assert.equal(r.conversions.length, 0); assert.deepEqual(r.plan.series[0], p.series[0]);
  }
});

test('previous successful formulas survive re-entry and JSON persistence unchanged', () => {
  const p = checked(wavePlan(true)).plan, persisted = JSON.parse(JSON.stringify(p)), r = checked(persisted);
  assert.equal(r.conversions.length, 0); assert.deepEqual(r.plan, persisted); assert(checkRelationAnalyticApproximation(r.plan.series[0], r.plan).ok);
});

test('a real rounded periodic source with only time units derives period from exact zero contacts', () => {
  const heights = [.7163, .6977, .6233, .5163, .386, .2465, .1256, .0419, 0, .0372, .1256, .2419, .3814, .5116, .6233, .693, .7163, .693, .6233, .5116, .3814, .2465, .1256, .0372, 0, .0372, .1256, .2465, .3814, .5116, .6233, .693, .7163];
  const points = heights.map((y, i) => ({ x: i <= 8 ? i / 8 : i >= 28 ? i / 8 - .0002 : i / 8 - .0001, y }));
  const p = plan([series('energy', points, { candidateFamily: 'sinusoid' })], {
    x: { scale: 'linear', min: 0, max: 5.097, ticks: [1, 2, 3, 4].map(value => ({ value, label: `${value}t₀`, valueSource: 'tick-label' })) },
    y: { scale: 'linear', min: 0, max: 1, ticks: [], calibration: { method: 'frame-fraction' } } });
  p.annotations.push(...[8, 16, 24, 32].map(index => ({ id: `contact-${index}`, kind: 'guide', text: '', x: Math.round(points[index].x), y: points[index].y, to: { x: Math.round(points[index].x), y: 0 }, axis: 'y', orientation: 'vertical', coordinateSpace: 'data', seriesId: 'energy', pointIndex: index })));
  const r = checked(p), s = r.plan.series[0], f = compile(s.expression);
  assert.equal(r.conversions.length, 1, JSON.stringify(r.rejected)); assert.equal(s.approximation.family, 'cosine-square');
  assert(Math.abs(f(1)) < 1e-12 && Math.abs(f(3)) < 1e-12); assert(Math.abs(f(2) - .7163) < 1e-10);
});

test('equal center-line contacts identify a free sine phase without hard-coding observed peak positions', () => {
  const p = plan([series('wave', samples(x => 1.2 + Math.sin(Math.PI * x), 0, 3.2, 50), { candidateFamily: 'sinusoid' })], {
    x: { scale: 'linear', min: 0, max: 4, ticks: [0, 1, 2, 3].map(value => ({ value, label: String(value) })) },
    y: { scale: 'linear', min: 0, max: 3, ticks: [{ value: 1.2, label: '1.2' }] } });
  p.series[0].relationAnchors = [0, 1, 2, 3].map(x => ({ xTickLabel: String(x), yTickLabel: '1.2' }));
  const r = checked(p), s = r.plan.series[0], f = compile(s.expression);
  assert.equal(r.conversions.length, 1, JSON.stringify(r.rejected)); assert.equal(s.approximation.family, 'sinusoidal');
  for (const x of [0, 1, 2, 3]) assert(Math.abs(f(x) - 1.2) < 1e-10);
  assert(Math.abs(f(.5) - 2.2) < .001);
});

test('two-point straight primitives and broken axes remain basic editable geometry', () => {
  const p = plan([series('segment', [{ x: .1, y: 1 }, { x: .9, y: 1 }], { curveStyle: 'straight' })]);
  const r = checked(p); assert.equal(r.conversions.length, 0); assert.deepEqual(r.plan, p);
  const q = wavePlan(); q.variant = 'axis-break'; assert.deepEqual(checked(q).plan, q);
});

test('more than 128 linked contacts produce a formula that passes its own verifier and the graph contract', () => {
  const p = plan([series('quadratic', samples(x => .2 + x * x, 0, 1, 129)), series('other', samples(x => .1 + .2 * x, 0, 1, 17))]);
  p.annotations = p.series[0].points.map((point, i) => ({ id: `guide-${i}`, kind: 'guide', text: '', ...point, to: { x: 0, y: point.y }, axis: 'y', coordinateSpace: 'data', orientation: 'horizontal', seriesId: 'quadratic', pointIndex: i }));
  const r = checked(p); assert.equal(r.conversions.length, 2, JSON.stringify(r.rejected));
  assert.equal(r.plan.series[0].approximation.anchors.length, 129);
  const validation = validateGraphPlan(r.plan); assert(validation.ok, JSON.stringify(validation.errors));
});

test('malformed saved endpoint, arrow or model metadata returns a controlled invalid result', () => {
  const valid = checked(plan([series('quad', samples(x => x * x, 0, 1), { endpoints: [{ index: 0, kind: 'closed' }], arrowSpecs: [{ segmentIndex: 3, t: .5, dir: 1 }] })])).plan;
  for (const invalid of [null, 3, false, 'endpoint', {}]) {
    const p = structuredClone(valid); p.series[0].approximation.sourceEndpoints[0] = invalid;
    assert.equal(checkRelationAnalyticApproximation(p.series[0], p).ok, false);
  }
  for (const invalid of [null, 3, false, 'model', {}]) {
    const p = structuredClone(valid); p.series[0].approximation.model = invalid;
    assert.equal(checkRelationAnalyticApproximation(p.series[0], p).ok, false);
  }
  const p = structuredClone(valid); p.series[0].approximation.sourceArrowSpecs[0] = null;
  assert.equal(checkRelationAnalyticApproximation(p.series[0], p).ok, false);
});

test('marker conversion that would exceed annotation budget leaves only that curve as points', () => {
  const p = plan([series('marked', samples(x => .2 + x * x, 0, 1), { endpoints: [{ index: 0, kind: 'closed' }] }), series('other', samples(x => .1 + .2 * x, 0, 1, 17))]);
  p.annotations = Array.from({ length: 256 }, (_, i) => ({ id: `text-${i}`, kind: 'text', text: 'A', x: .5, y: .5, axis: 'y', coordinateSpace: 'normalized', orientation: 'horizontal' }));
  const r = checked(p); assert.equal(r.conversions.length, 1); assert.equal(r.plan.series[0].kind, 'points'); assert.equal(r.plan.series[1].kind, 'expression');
  const validation = validateGraphPlan(r.plan); assert(validation.ok, JSON.stringify(validation.errors));
});

console.log(`${count} relation analytic fit scenarios passed`);

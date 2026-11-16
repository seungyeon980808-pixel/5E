import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preferAnalyticGraphPlan } from '../js/function-graph/analytic-fit.js';
import { calibrateTickUnits, parseTickLabel } from '../js/function-graph/physics-fit.js';
import { compile } from '../js/function-graph/parser.js';
import { validateGraphPlan } from '../js/graph/reconstruction-contract.js';
import { buildNativeGraph } from '../js/graph/native-graph.js';

let count = 0;
const test = (name, fn) => { fn(); count++; console.log('PASS ' + name); };
const fixture = name => JSON.parse(readFileSync(new URL('fixtures/graph-physics/' + name + '.json', import.meta.url)));
// Unmodified actual first responses saved on 2026-10-08; no new AI calls.
const actual = name => fixture(name + '-live-observed');
const run = plan => { const input = validateGraphPlan(plan); assert(input.ok, JSON.stringify(input.errors)); const r = preferAnalyticGraphPlan(input.plan); const out = validateGraphPlan(r.plan); assert(out.ok, JSON.stringify(out.errors)); return { ...r, checked: out }; };
// Deterministic jitter so failures are reproducible.
let seed = 11; const jitter = a => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 * 2 - 1) * a; };

// Builds an observed plan exactly as the model returns it: normalized points and
// symbolic ticks at true positions. f maps tick units -> tick units.
function observed({ xTicks, yTicks, xMax, yMax, curves, guides = [], frame = 'quadrant' }) {
  const series = curves.map(c => {
    const pts = []; for (let i = 0; i < c.n; i++) { const x = c.lo + (c.hi - c.lo) * i / (c.n - 1); pts.push({ x: x / xMax, y: c.f(x) / yMax + jitter(c.noise ?? 0.003) + (c.bump ? c.bump(x) : 0) }); }
    return { id: c.id, kind: 'points', axis: 'y', certainty: 'observed', coordinateSpace: 'normalized', points: pts.map(p => ({ x: +p.x.toFixed(5), y: +p.y.toFixed(5) })), curveStyle: c.style ?? 'smooth', lineStyle: 'solid', breaks: [], endpoints: [], ...(c.extra || {}) };
  });
  const annotations = [{ id: 'origin', kind: 'text', text: '0', x: -0.05, y: -0.07, axis: 'y', coordinateSpace: 'normalized', orientation: 'horizontal' }];
  guides.forEach((g, i) => {
    const s = series.find(q => q.id === g.series), c = curves.find(q => q.id === g.series), pt = { x: +(g.x / xMax).toFixed(5), y: +(c.f(g.x) / yMax + jitter(0.002)).toFixed(5) };
    let k = s.points.findIndex(p => p.x > pt.x); if (k < 0) k = s.points.length; s.points.splice(k, 0, pt);
    for (const a of annotations) if (a.seriesId === s.id && a.pointIndex >= k) a.pointIndex++;
    annotations.push({ id: 'g' + i, kind: 'guide', text: '', ...pt, axis: 'y', coordinateSpace: 'normalized', orientation: g.orientation ?? 'vertical', seriesId: s.id, pointIndex: k });
  });
  const ticks = list => list.map(([label, v, max]) => ({ value: null, label, position: +(v / max).toFixed(5) }));
  return { schema: '5e.graph-reconstruction/v1', variant: 'cartesian', coordinateMode: 'observed', source: { id: 'synthetic', hash: 'synthetic', width: 700, height: 500, plotBox: { x: 70, y: 50, w: 560, h: 400 } },
    axisPlacement: { x: { mode: 'fraction', value: 0 }, y: { mode: 'fraction', value: 0 } },
    axes: { x: { scale: 'unknown', title: 'x', unit: '', min: null, max: null, step: null, ticks: ticks(xTicks.map(([l, v]) => [l, v, xMax])), orientation: 'horizontal' }, y: { scale: 'unknown', title: 'y', unit: '', min: null, max: null, step: null, ticks: ticks(yTicks.map(([l, v]) => [l, v, yMax])), orientation: 'horizontal' } },
    frame: { variant: frame }, series, annotations, review: [] };
}
const exprOf = (r, id) => r.plan.series.find(s => s.id === id);
const close = (expr, f, xs) => { const g = compile(expr); for (const x of xs) assert(Math.abs(g(x) - f(x)) < 1e-9, expr + ' at ' + x); };

test('tick labels are read as coefficient times one unit symbol', () => {
  const cases = { 'E_0': [1, 'E_0'], '4E_0': [4, 'E_0'], '\\lambda_0': [1, 'λ_0'], '3\\lambda_{0}': [3, 'λ_0'], '2t₁': [2, 't_1'], '−V₂': [-1, 'V_2'], 'L/2': [0.5, 'L'], '0.9': [0.9, ''], '\\sqrt{3}v_0': [Math.sqrt(3), 'v_0'] };
  for (const [label, [coef, unit]] of Object.entries(cases)) { const p = parseTickLabel(label); assert(p, label); assert(Math.abs(p.coef - coef) < 1e-12, label); assert.equal(p.unit, unit, label); }
  for (const label of ['10⁻¹', '90°N', '㉠', '']) assert.equal(parseTickLabel(label), null, label);
});

test('extended guides constrain linked contacts without shortening drawn extents', () => {
  const input = actual('p1_2024_06_17'), before = structuredClone(input), r = run(input);
  assert.deepEqual(r.plan.series.map(s => s.expression), ['2*x-1', '2*x-3']);
  for (const a of input.annotations.filter(a => a.kind === 'guide')) {
    const saved = r.plan.annotations.find(q => q.id === a.id);
    for (const key of ['x', 'y', 'to']) assert.deepEqual(saved[key], a[key]);
    if (a.pointIndex !== undefined) {
      const p = r.plan.series.find(s => s.id === a.seriesId);
      assert(Math.abs(saved.anchorX - (p.observedPoints[a.pointIndex].x - r.plan.axes.x.min) / (r.plan.axes.x.max - r.plan.axes.x.min)) < .012);
    }
  }
  assert.deepEqual(input, before);
  assert(validateGraphPlan(JSON.parse(JSON.stringify(r.plan))).ok);
});

test('continuous marked curves preserve native markers and progress arrows', () => {
  const previousSeed = seed;
  const p = observed({ xTicks: [['t', 1], ['2t', 2]], yTicks: [['d', 1], ['4d', 4]], xMax: 2.5, yMax: 6,
    curves: [{ id: 'Q', lo: .2, hi: 2.3, n: 24, noise: 0, f: x => x*x, extra: {
      candidateFamily: 'quadratic', relationAnchors: [{ xTickLabel: 't', yTickLabel: 'd' }, { xTickLabel: '2t', yTickLabel: '4d' }],
      endpoints: [{ index: 0, kind: 'open', markerSize: .7 }, { index: 12, kind: 'closed', markerSize: 1.3, fillLevel: 160 }],
      arrowSpecs: [{ segmentIndex: 5, t: .3, dir: -1, strokeWidth: .8 }], lineStyle: 'dashed', dashLength: 2, dashGap: 1
    }}] });
  seed = previousSeed;
  const r = run(p), s = r.plan.series[0];
  assert.equal(s.kind, 'expression'); assert.equal(s.endpoints, undefined);
  assert.equal(s.lineStyle, 'dashed'); assert.equal(s.dashLength, 2); assert.equal(s.dashGap, 1);
  const markers = r.plan.annotations.filter(a => a.kind === 'point');
  assert.deepEqual(markers.map(a => [a.endStyle, a.markerSize, a.fillLevel]), [['open', .7, undefined], ['closed', 1.3, 160]]);
  markers.forEach((a, i) => assert.equal(a.anchorX, s.observedPoints[p.series[0].endpoints[i].index].x));
  const [arrow] = s.arrowSpecs;
  assert.equal(arrow.segmentIndex, undefined); assert.equal(arrow.t, undefined); assert.equal(arrow.dir, -1); assert.equal(arrow.strokeWidth, .8);
  assert(Math.abs(arrow.x - (s.observedPoints[5].x + .3 * (s.observedPoints[6].x - s.observedPoints[5].x))) < 1e-9);
  const native = buildNativeGraph(r.checked.plan); assert(native.ok, native.error);
  assert.equal(native.objects.find(o => o.type === 'funcgraph').arrowMarks.length, 1);
  assert.equal(native.objects[0].graphAnnotations.filter(a => a.kind === 'point')[1].fillLevel, 160);
  assert(validateGraphPlan(JSON.parse(JSON.stringify(r.plan))).ok);
});

test('printed extrema and tick-aligned crossings recover an actual short wave', () => {
  const input = actual('p1_2026_09_06'), r = run(input), s = r.plan.series[0];
  assert.equal(s.kind, 'expression'); assert.equal(s.approximation.constraintMethod, 'tick-extrema-zero-relations');
  close(s.expression, x => 1.5 * Math.cos(Math.PI*x/2), [0, 1, 2, 3, 4, 5]);
  assert(s.approximation.maxDeviation < .025);
  for (const a of input.annotations.filter(a => a.kind === 'guide')) {
    const saved = r.plan.annotations.find(q => q.id === a.id);
    assert.deepEqual([saved.x, saved.y, saved.to], [a.x, a.y, a.to]);
  }
  const inaccurate = structuredClone(input); inaccurate.series[0].candidateExpression = '1.5*cos(pi*x)';
  close(run(inaccurate).plan.series[0].expression, x => 1.5*Math.cos(Math.PI*x/2), [0, 1, 2, 3]);
  const forged = structuredClone(r.plan); forged.series[0].expression = '1.5*cos(pi*x)'; assert(!validateGraphPlan(forged).ok);
  const missingHeights = structuredClone(input); missingHeights.axes.y.ticks = [];
  const estimated=run(missingHeights).plan.series[0];assert.equal(estimated.kind,'expression');assert.equal(estimated.certainty,'observed');assert.equal(estimated.approximation.coefficientSource,'relation-constrained-observations');assert(validateGraphPlan(run(missingHeights).plan).ok);
});

test('candidateFamily none does not veto independently constrained families', () => {
  const p = fixture('matter-wave-observed');
  for (const s of p.series) s.candidateFamily = 'none';
  // Remove the unresolved symbolic height; keep the known B(4)=1 contact.
  p.series = [p.series[1]];
  p.annotations = p.annotations.filter(a => !a.seriesId || a.seriesId === p.series[0].id);
  const r = run(p); assert.equal(r.plan.series[0].expression, '2/sqrt(x)');
  assert(validateGraphPlan(JSON.parse(JSON.stringify(r.plan))).ok);
});

test('printed straight-line constraints remain exact despite a new observation trace',()=>{
  const p=fixture('p1_2024_06_17-live-v23-observed'),r=run(p);
  assert.equal(exprOf(r,'p').expression,'2*x-1');
  assert.equal(exprOf(r,'q').expression,'2*x-3');
  assert(validateGraphPlan(r.plan).ok);
  for(const a of p.annotations.filter(a=>a.kind==='guide')) {
    const b=r.plan.annotations.find(b=>b.id===a.id);
    assert.deepEqual([b.x,b.y,b.to],[a.x,a.y,a.to]);
  }
});

test('frame-exterior circle markers do not suppress calibrated independent trajectories',()=>{
  const p=fixture('p2_2027_06_16-live-observed'),r=run(p);
  assert(validateGraphPlan(p).ok);
  assert.equal(r.plan.axes.x.calibration.unit,'L');
  assert.equal(r.plan.axes.y.calibration.unit,'L');
  const a=exprOf(r,'trajectory-A'),b=exprOf(r,'trajectory-B');
  assert.equal(a.approximation.coefficientSource,'endpoint-tangent-observations');
  assert(Math.abs(compile(a.expression)(0))<1e-8);
  assert(Math.abs(compile(a.expression)(2)-3)<1e-8);
  assert(compile(a.expression)(.0001)>compile(a.expression)(0));
  close(b.expression,x=>4-(1-Math.sqrt((x-2)/2))**2,[2,2.5,3,4]);
  assert(validateGraphPlan(r.plan).ok,JSON.stringify(validateGraphPlan(r.plan).errors));
  const rings=r.plan.series.filter(s=>s.closed);
  assert.equal(rings.length,3);
  for(const s of rings) {
    const original=p.series.find(q=>q.id===s.id),x=r.plan.axes.x,y=r.plan.axes.y;
    assert.equal(s.points.length,original.points.length);
    assert.equal(s.lineStyle,original.lineStyle);
    for(let i=0;i<s.points.length;i++) {
      assert(Math.abs((s.points[i].x-x.min)/(x.max-x.min)-original.points[i].x)*p.source.plotBox.w<.1);
      assert(Math.abs((s.points[i].y-y.min)/(y.max-y.min)-original.points[i].y)*p.source.plotBox.h<.1);
    }
  }
  assert(buildNativeGraph(r.plan).ok);
  const invalid=structuredClone(p);invalid.series.find(s=>s.closed).points[0].x=-10;
  assert(!validateGraphPlan(invalid).ok);
});

test('none-family P-V keeps all processes when formulas alter observed crossings',()=>{
  const p=fixture('p1_2026_06_14-live-observed'),r=run(p);
  assert.deepEqual(r.plan.series.map(s=>s.id),['AB','BC','CA']);
  assert(r.plan.series.every(s=>s.kind==='points'));
  assert(r.plan.series.filter(s=>s.id!=='BC').every(s=>s.analyticFitFailure.includes('교차')));
  assert(validateGraphPlan(r.plan).ok);
  assert(buildNativeGraph(r.plan).ok);
});

test('axis-break P-V stays editable without claiming a global physical coordinate',()=>{
  const p=fixture('p1_2025_06_10-live-observed'),r=run(p);
  assert.equal(r.plan.variant,'axis-break');
  assert.equal(r.plan.coordinateMode,'observed');
  for(const s of p.series)assert.deepEqual(r.plan.series.find(q=>q.id===s.id).points,s.points);
  assert(validateGraphPlan(r.plan).ok);
  assert(buildNativeGraph(r.plan).ok);
});

test('matter-wave exam trace with noise and a false bump becomes 4/sqrt(x) and 2/sqrt(x)', () => {
  const source = fixture('matter-wave-observed'), r = run(source), [A, B] = r.plan.series;
  assert.equal(A.expression, '4/sqrt(x)'); assert.equal(B.expression, '2/sqrt(x)');
  assert.deepEqual(r.plan.axes.x.ticks.map(t => [t.label, t.value]), [['E_0', 1], ['4E_0', 4]]);
  assert.deepEqual(r.plan.axes.y.ticks.map(t => [t.label, t.value]), [['\\lambda_0', 1], ['㉠', 2]]);
  for (const s of [A, B]) { assert.equal(s.certainty, 'observed'); assert.equal(s.approximation.method, 'physics-family-fit-v1'); assert(s.approximation.anchors.filter(a => a.strong).length >= 2); assert.equal(s.observedPoints.length, source.series.find(q => q.id === s.id).points.length); }
  // Guides end exactly on the formula: A(4)=2, B(1)=2, B(4)=1.
  close(A.expression, x => 4 / Math.sqrt(x), [1, 4]); close(B.expression, x => 2 / Math.sqrt(x), [1, 4]);
  const native = buildNativeGraph(r.checked.plan); assert(native.ok, native.error);
  assert.deepEqual(native.objects.filter(o => o.type === 'funcgraph').map(o => o.expr), ['4/sqrt(x)', '2/sqrt(x)']);
});

test('calibration preserves every drawn position', () => {
  const source = fixture('matter-wave-observed'), c = calibrateTickUnits(validateGraphPlan(source).plan);
  assert(c.calibrated); const ax = c.plan.axes.x, ay = c.plan.axes.y;
  c.plan.series.forEach((s, i) => s.points.forEach((q, j) => { const o = source.series[i].points[j]; assert(Math.abs((q.x - ax.min) / (ax.max - ax.min) - o.x) < 2e-4); assert(Math.abs((q.y - ay.min) / (ay.max - ay.min) - o.y) < 2e-4); }));
  for (const [axis, src] of [[ax, source.axes.x], [ay, source.axes.y]]) axis.ticks.forEach((t, i) => assert(Math.abs((t.value - axis.min) / (axis.max - axis.min) - src.ticks[i].position) < 0.012));
  assert.deepEqual(c.plan.annotations, validateGraphPlan(source).plan.annotations);
});

test('uniformly accelerated velocity line through tick contacts reads 2*x+1', () => {
  const r = run(observed({ xTicks: [['t_0', 1], ['2t_0', 2], ['3t_0', 3]], yTicks: [['v_0', 1], ['3v_0', 3], ['5v_0', 5], ['7v_0', 7]], xMax: 3.6, yMax: 8.5, curves: [{ id: 'v', lo: 0, hi: 3.2, n: 12, f: x => 2 * x + 1, style: 'straight' }], guides: [{ series: 'v', x: 1 }, { series: 'v', x: 2 }, { series: 'v', x: 3 }] }));
  assert.equal(exprOf(r, 'v').expression, '2*x+1');
});

test('position under constant acceleration becomes a short parabola', () => {
  const r = run(observed({ xTicks: [['t', 1], ['2t', 2]], yTicks: [['d', 1], ['4d', 4]], xMax: 2.4, yMax: 6, curves: [{ id: 's', lo: 0, hi: 2.3, n: 30, f: x => x * x }], guides: [{ series: 's', x: 1 }, { series: 's', x: 2 }] }));
  const s = exprOf(r, 's'); assert.equal(s.kind, 'expression'); assert(s.expression.length <= 12, s.expression); close(s.expression, x => x * x, [0, 1, 2]);
});

test('Coulomb force against distance becomes an inverse square law', () => {
  const r = run(observed({ xTicks: [['r', 1], ['2r', 2], ['3r', 3]], yTicks: [['F', 1], ['4F', 4]], xMax: 3.5, yMax: 5, curves: [{ id: 'F', lo: 0.47, hi: 3.3, n: 32, f: x => 1 / (x * x) }], guides: [{ series: 'F', x: 1 }, { series: 'F', x: 2 }] }));
  assert.equal(exprOf(r, 'F').expression, '1/x^2');
});

test('half-life decay becomes a 2^(-x/T) formula', () => {
  const r = run(observed({ xTicks: [['T', 1], ['2T', 2], ['3T', 3]], yTicks: [['N_0', 4], ['2N_0', 8], ['N_0/2', 2]], xMax: 4, yMax: 9, curves: [{ id: 'N', lo: 0, hi: 3.8, n: 30, f: x => 8 * 2 ** (-x) }], guides: [{ series: 'N', x: 1, orientation: 'horizontal' },{series:'N',x:2,orientation:'horizontal'}] }));
  const s = exprOf(r, 'N'); assert.equal(s.approximation.family, 'exponential'); assert.equal(s.expression, '2*2^(-x)');
});

test('harmonic oscillation becomes a sinusoid with readable period', () => {
  const r = run(observed({ xTicks: [['T', 2], ['2T', 4],['0.25T',.5],['0.5T',1],['0.75T',1.5]], yTicks: [['0.2',.2],['1.2',1.2],['2.2',2.2]], xMax: 4.5, yMax: 2.4, curves: [{ id: 'y', lo: 0, hi: 4, n: 60, f: x => 1.2 + Math.sin(Math.PI * x),extra:{candidateFamily:'sinusoid',relationAnchors:[{xTickLabel:'0.25T',yTickLabel:'2.2'},{xTickLabel:'0.5T',yTickLabel:'1.2'},{xTickLabel:'0.75T',yTickLabel:'0.2'},{xTickLabel:'T',yTickLabel:'1.2'}]} }], frame: 'quadrant' }));
  const s = exprOf(r, 'y'); assert.equal(s.approximation.family, 'sinusoid'); assert(s.expression.length < 40, s.expression);
  const g = compile(s.expression); for (const x of [0.25, 0.75, 1.25]) assert(Math.abs(g(x) - (1.2 + Math.sin(2 * Math.PI * x))) < 0.1, s.expression); // x counted in T (tick at 2 raw units)
});

test('two curves of one law share the family and keep their crossing topology', () => {
  const r = run(observed({ xTicks: [['E_0', 1], ['4E_0', 4]], yTicks: [['\\lambda_0', 1], ['3\\lambda_0', 3], ['0.75\\lambda_0',.75]], xMax: 6, yMax: 5, curves: [{ id: 'A', lo: 0.6, hi: 5.8, n: 30, f: x => 3 / Math.sqrt(x) }, { id: 'B', lo: 0.2, hi: 5.8, n: 30, f: x => 1.5 / Math.sqrt(x) }], guides: [{ series: 'A', x: 1, orientation: 'horizontal' }, { series: 'B', x: 4, orientation: 'horizontal' }] }));
  assert.deepEqual(r.plan.series.map(s => s.approximation?.family), ['power-0.5', 'power-0.5']);
  assert.equal(exprOf(r, 'A').expression, '3/sqrt(x)');
});

test('free-form multi-bump curves, scatter and loops stay editable points with a visible reason', () => {
  const wiggle = observed({ xTicks: [['t_0', 1], ['2t_0', 2]], yTicks: [['P_0', 1], ['2P_0', 2]], xMax: 3, yMax: 3, curves: [{ id: 'w', lo: 0, hi: 2.9, n: 40, f: x => 1.2 + 0.5 * Math.sin(5 * x) * Math.exp(-0.3 * x) + 0.3 * Math.sin(13 * x) }] });
  const r = run(wiggle); const w = exprOf(r, 'w'); assert.equal(w.kind, 'points'); assert.equal(typeof w.analyticFitFailure, 'string');
  assert(r.checked.review.some(x => x.reason.startsWith('함수 복원 미완료')));
  const scatter = observed({ xTicks: [['t_0', 1], ['2t_0', 2]], yTicks: [['v_0', 1]], xMax: 3, yMax: 3, curves: [{ id: 'p', lo: 0.2, hi: 2.8, n: 9, f: x => x, extra: { lineVisible: false, markerShape: 'circle' } }] });
  assert.equal(exprOf(run(scatter), 'p').kind, 'points');
  const loop = observed({ xTicks: [['V_0', 1], ['2V_0', 2]], yTicks: [['P_0', 1], ['2P_0', 2]], xMax: 3, yMax: 3, curves: [{ id: 'c', lo: 1, hi: 2, n: 8, f: x => 1 + (x - 1), extra: { closed: true } }] });
  assert.equal(exprOf(run(loop), 'c').kind, 'points');
});

test('graphs without readable unit ticks keep the previous display-space behaviour', () => {
  const p = observed({ xTicks: [], yTicks: [], xMax: 1, yMax: 1, curves: [{ id: 's', lo: 0, hi: 1, n: 41, f: x => 0.1 + 0.7 * x }] });
  const r = run(p); assert.equal(r.plan.coordinateMode, 'observed'); assert.equal(r.calibration, null); assert.equal(exprOf(r, 's').approximation.method, 'simple-image-fit-v1');
});

test('log-like or degree tick labels never calibrate a linear unit', () => {
  const p = observed({ xTicks: [['1', 1], ['3', 3], ['5', 5]], yTicks: [['10⁻¹', 1], ['1', 2], ['10', 3]], xMax: 6, yMax: 4, curves: [{ id: 's', lo: 1, hi: 5, n: 20, f: x => 1 + 0.4 * x }] });
  const c = calibrateTickUnits(validateGraphPlan(p).plan); assert.equal(c.plan.axes.y.calibration?.method ?? 'frame-fraction', 'frame-fraction');
});

test('a contract rejects a physics formula whose recorded error was edited', () => {
  const r = run(fixture('matter-wave-observed')), bad = structuredClone(r.checked.plan); bad.series[0].expression = '5/sqrt(x)';
  assert(!validateGraphPlan(bad).ok);
  const forged = structuredClone(r.checked.plan); forged.series[1].approximation.maxDeviation = 0.001; assert(!validateGraphPlan(forged).ok);
});


test('LaTeX fractional ticks keep one symbolic unit',()=>{
  assert.deepEqual(parseTickLabel('\\frac{L}{2}'),{unit:'L',coef:.5,text:'L/2'});
});

test('named relation anchors solve unknown height independently of tracing jitter',()=>{
  const p=fixture('matter-wave-observed');
  p.axes.y.ticks[1].position=.375; // visibly displaced print, not a rational snap
  for(const a of p.annotations)if(a.id==='g-k-h'||a.id==='g-4-v'||a.id==='g-E-v')a.y=.375;
  const r=run(p);
  assert.equal(r.plan.axes.y.ticks[1].value,2);
  assert.equal(r.plan.axes.y.ticks[1].valueSource,'relation');
  assert.equal(exprOf(r,'A').expression,'4/sqrt(x)');assert.equal(exprOf(r,'B').expression,'2/sqrt(x)');
  assert.equal(exprOf(r,'B').approximation.anchorDeviation,0);
});

test('inconsistent reference equalities are rejected and survive persistence',()=>{
  const p=observed({xTicks:[['r',1],['2r',2]],yTicks:[['F',1],['2F',2]],xMax:3,yMax:3,curves:[{id:'s',lo:.5,hi:2.8,n:28,f:x=>1/x,extra:{candidateFamily:'power-inverse',relationAnchors:[{xTickLabel:'r',yTickLabel:'F'},{xTickLabel:'2r',yTickLabel:'2F'}]}}]});
  const r=run(p);assert.equal(exprOf(r,'s').kind,'points');assert(exprOf(r,'s').analyticFitFailure);
  const again=run(JSON.parse(JSON.stringify(r.checked.plan)));assert.deepEqual(again.checked.plan,r.checked.plan);
});

test('one panel can keep unrelated linear and quadratic families',()=>{
  const p=observed({xTicks:[['t',1],['2t',2]],yTicks:[['d',1],['4d',4]],xMax:2.5,yMax:6,curves:[
    {id:'L',lo:.2,hi:2.3,n:24,noise:0,f:x=>x,extra:{candidateFamily:'linear',relationAnchors:[{xTickLabel:'t',yTickLabel:'d'}]}},
    {id:'Q',lo:.2,hi:2.3,n:24,noise:0,f:x=>x*x,extra:{candidateFamily:'quadratic',relationAnchors:[{xTickLabel:'t',yTickLabel:'d'},{xTickLabel:'2t',yTickLabel:'4d'}]}}]});
  const r=run(p);assert.equal(exprOf(r,'L').approximation.family,'linear');assert(['quadratic','power2'].includes(exprOf(r,'Q').approximation.family));
});

test('shifted reciprocal lens branches use a printed focal tick',()=>{
  const p=observed({xTicks:[['f',1],['2f',2]],yTicks:[['m',1],['2m',2]],xMax:3.5,yMax:7,curves:[{id:'M',lo:1.2,hi:3.3,n:36,f:x=>1/(x-1),extra:{candidateFamily:'power-inverse',relationAnchors:[{xTickLabel:'2f',yTickLabel:'m'}]}}]});
  const r=run(p);assert.equal(exprOf(r,'M').expression,'1/(x-1)');
});

test('changing or removing recorded strong contacts cannot bypass validation',()=>{
  const r=run(fixture('matter-wave-observed'));
  for(const field of ['bias','anchorDeviation']){const bad=structuredClone(r.plan);bad.series[1].approximation[field]=.5;assert(!validateGraphPlan(bad).ok);}
  const bad=structuredClone(r.plan);bad.series[1].approximation.anchors=[];assert(!validateGraphPlan(bad).ok);
});


test('unconstrained coefficients remain explicit observation estimates',()=>{
  const p=observed({xTicks:[['t',1],['2t',2]],yTicks:[['d',1],['4d',4]],xMax:2.5,yMax:6,curves:[{id:'Q',lo:.1,hi:2.3,n:24,f:x=>x*x,extra:{candidateFamily:'quadratic'}}]});
  const r=run(p),q=exprOf(r,'Q');assert.equal(q.kind,'expression');assert.equal(q.certainty,'observed');assert.equal(q.approximation.coefficientSource,'relation-constrained-observations');assert(q.observedPoints.length===24);assert.equal(q.approximation.anchors.filter(a=>a.strong).length,0);
});

test('center-line contacts fix equalities while amplitude is estimated',()=>{
  const p=observed({xTicks:[['0',0],['1',1],['2',2],['3',3]],yTicks:[['1.2',1.2]],xMax:3.5,yMax:3,curves:[{id:'s',lo:0,hi:3.2,n:50,f:x=>1.2+Math.sin(Math.PI*x),extra:{candidateFamily:'sinusoid',relationAnchors:[0,1,2,3].map(x=>({xTickLabel:String(x),yTickLabel:'1.2'}))}}]});
  const r=run(p),q=exprOf(r,'s');assert.equal(q.kind,'expression');assert.equal(q.approximation.coefficientSource,'relation-constrained-observations');assert.equal(q.approximation.anchorDeviation,0);for(const x of [0,1,2,3])assert(Math.abs(compile(q.expression)(x)-1.2)<1e-7);
});

test('a radical coefficient remains exact and readable',()=>{
  const p=observed({xTicks:[['E',1],['2E',2]],yTicks:[['L',1],['\\sqrt{2}L',Math.sqrt(2)]],xMax:3,yMax:4,curves:[{id:'B',lo:.15,hi:2.8,n:34,f:x=>Math.sqrt(2/x),extra:{candidateFamily:'power-inverse-sqrt',relationAnchors:[{xTickLabel:'E',yTickLabel:'\\sqrt{2}L'},{xTickLabel:'2E',yTickLabel:'L'}]}}]});
  const r=run(p);assert.equal(exprOf(r,'B').expression,'sqrt(2)/sqrt(x)');assert.equal(exprOf(r,'B').approximation.anchorDeviation,0);
});

test('a lens pole estimated from an unknown tick is never labeled exact',()=>{
  const p=observed({xTicks:[['㉠',1.5],['2d',2]],yTicks:[['m',1],['2m',2]],xMax:3.5,yMax:6,curves:[{id:'s',lo:1.7,hi:3.3,n:32,f:x=>1/(x-1.5),extra:{candidateFamily:'power-inverse',relationAnchors:[{xTickLabel:'2d',yTickLabel:'2m'}]}}]});
  const r=run(p),q=exprOf(r,'s');assert.equal(q.kind,'expression');assert.equal(q.certainty,'observed');assert.equal(q.approximation.coefficientSource,'relation-constrained-observations');assert.notEqual(r.plan.axes.x.ticks.find(t=>t.label==='㉠').valueSource,'tick-label');assert.equal(q.approximation.anchorDeviation,0);
  const good=run(fixture('matter-wave-observed')),bad=structuredClone(good.plan);bad.series[0].approximation.pole=1.5;assert(!validateGraphPlan(bad).ok);
});
test('exam extrema identify amplitude, phase and period despite zero derivatives',()=>{
  const input=fixture('p1_2021_11_13-observed'), before=structuredClone(input), r=run(input), s=r.plan.series[0];
  assert.equal(s.expression,'-2*cos(pi*x)');assert.equal(s.approximation.constraintMethod,'extremum-relations');
  close(s.expression,x=>-2*Math.cos(Math.PI*x),[0,1,2,3,4]);assert(s.approximation.maxDeviation<.005);
  assert.deepEqual(input,before);
  const bad=structuredClone(r.plan);bad.series[0].expression='-2*cos(3*pi*x)';assert(!validateGraphPlan(bad).ok);
});

test('a PV cycle becomes two endpoint-constrained expressions and two lines',()=>{
  const input=fixture('p1_2021_11_12-observed'), r=run(input);
  assert.equal(r.plan.series.filter(s=>s.kind==='expression').length,2);
  assert.equal(r.plan.series.filter(s=>s.kind==='points' && s.points.length===2).length,2);
  assert.equal(r.plan.annotations.filter(a=>a.kind==='point').length,4);
  for(const s of r.plan.series.filter(s=>s.kind==='expression')){
    const f=compile(s.expression);for(const p of [s.observedPoints[0],s.observedPoints.at(-1)])assert(Math.abs(f(p.x)-p.y)<1e-8);
    assert.equal(s.approximation.coefficientSource,'process-endpoints');assert(s.expression.length<80);
    assert(s.arrowSpecs.every(a=>a.segmentIndex===undefined && Number.isFinite(a.x)));
  }
  assert(validateGraphPlan(JSON.parse(JSON.stringify(r.plan))).ok);
  const native=buildNativeGraph(r.checked.plan);assert(native.ok,native.error);
  assert.equal(native.objects.filter(o=>o.type==='funcgraph').flatMap(o=>o.arrowMarks || []).length,4);
  for(const f of native.objects.filter(o=>o.sourceKind==='expression'))assert(Math.abs(f.arrowMarks[0].dy)>.05);
  const bad=structuredClone(r.plan);bad.series.find(s=>s.kind==='expression').expression='1/x';assert(!validateGraphPlan(bad).ok);
});

test('compound inverse fields share coefficients and preserve a printed zero',()=>{
  // Old actual response + explicitly supplied physical context, NOT a new AI run.
  const input=fixture('p1_2022_11_19-observed');
  for(const s of input.series)s.physicsModel={kind:'inverse-superposition',power:-2,poles:[0,3,5,8],groupId:'net-electric-field',zeroTicks:['2d'],reason:'Source apparatus has charges at 0,3d,5d,8d; source curve crosses at 2d. Charge sizes are not given.'};
  const r=run(input), [left,right]=r.plan.series;
  assert.equal(left.kind,'expression');assert.equal(right.kind,'expression');
  assert(Math.abs(compile(left.expression)(2))<1e-10);assert(left.expression.length<65,left.expression);
  assert.equal(left.approximation.coefficientSource,'relative-amplitude-with-relations');
  assert(left.expression.startsWith('0.026*('));assert(right.expression.startsWith('0.026*('));
  assert.equal(r.plan.axes.y.calibration.method,'relative-diagram');
  const bad=structuredClone(r.plan);bad.series[0].physicsModel.poles[1]=2.5;assert(!validateGraphPlan(bad).ok);
  const wrongZero=structuredClone(input);for(const s of wrongZero.series)s.physicsModel.zeroTicks=['d'];assert(run(wrongZero).plan.series.every(s=>s.kind==='points'),'a contradicted zero must not be ignored');
  const poleInside=structuredClone(input);poleInside.series[0].physicsModel.poles=[0,2,5,8];assert.equal(run(poleInside).plan.series[0].kind,'points');
});

test('two-wire fields accept a compound formula in explicitly relative coordinates',()=>{
  const input=fixture('p1_2020_11_13-observed');input.series[0].physicsModel={kind:'inverse-superposition',power:-1,poles:[0,-.08],reason:'Two wires; distance .08 is an explicitly estimated relative diagram parameter, not the printed d unit.'};
  const r=run(input), s=r.plan.series[0];assert.equal(s.kind,'expression');
  assert.equal(s.expression,'0.065/x-0.11/(x+0.08)');assert.equal(s.approximation.coefficientSource,'relative-amplitude');
  assert.equal(r.plan.axes.x.calibration.method,'relative-diagram');
  const native=buildNativeGraph(r.checked.plan);assert(native.ok,native.error);assert.equal(native.objects.find(o=>o.type==='funcgraph').expr,s.expression);
});

test('independent compound fields never share coefficients implicitly',()=>{
  const input=fixture('p1_2020_11_13-observed'), first=input.series[0], second=structuredClone(first), zero=input.axisPlacement.x.value;
  first.physicsModel={kind:'inverse-superposition',power:-1,poles:[0,-.08]};second.physicsModel=structuredClone(first.physicsModel);second.id='independent';
  second.points=second.points.map(p=>({...p,y:zero+(p.y-zero)*.5}));input.series.push(second);
  const r=run(input);assert(r.plan.series.every(s=>s.kind==='expression'));
  assert.notEqual(r.plan.series[0].expression,r.plan.series[1].expression);
  const a=compile(r.plan.series[0].expression),b=compile(r.plan.series[1].expression);assert(Math.abs(b(.5)/a(.5)-.5)<.1);
});

console.log(count + ' physics family scenarios passed');

import assert from 'node:assert/strict';
import { compile } from '../js/function-graph/parser.js';
import { mapNativeGrid } from '../js/graph/native-grid.js';
import { validateGraphPlan } from '../js/graph/reconstruction-contract.js';
import { buildNativeGraph } from '../js/graph/native-graph.js';
import { preferAnalyticGraphPlan } from '../js/function-graph/analytic-fit.js';
const base = () => ({ schema: '5e.graph-reconstruction/v1', variant: 'cartesian', coordinateMode: 'observed', source: { id: 'grid-test', hash: 'synthetic', width: 800, height: 600, plotBox: { x: 100, y: 50, w: 600, h: 400 } },
  axes: Object.fromEntries(['x', 'y'].map(k => [k, { scale: 'unknown', title: '', unit: '', min: null, max: null, step: null, ticks: [] }])),
  axisPlacement: { x: { mode: 'fraction', value: .6 }, y: { mode: 'fraction', value: 0 } }, frame: { variant: 'box', arrowX: false, arrowY: false }, series: [], annotations: [], review: [] });
const gridSeries = () => ({ id: 'arbitrary-name', kind: 'points', certainty: 'observed', coordinateSpace: 'normalized', axis: 'y', curveStyle: 'straight', label: '', markerShape: 'none', strokeWidth: .1, lineStyle: 'solid',
  points: [.2, .4, .6, .8].flatMap(x => [{ x, y: 0 }, { x, y: 1 }]).concat([.2, .4, .8].flatMap(y => [{ x: 0, y }, { x: 1, y }])), breaks: [2, 4, 6, 8, 10, 12], endpoints: [] });
const p = base(); p.series = [gridSeries()];
const before = JSON.stringify(p), built = buildNativeGraph(p);
assert(built.ok, built.error); assert.equal(JSON.stringify(p), before);
assert.equal(built.objects.length, 1); assert.equal(built.objects[0].showGrid, true);
assert.equal(built.objects[0].gridStepX, .2); assert.equal(built.objects[0].gridStepY, .2);
assert.equal(built.objects[0].axisPlacement.x.value, .6);
assert.equal(built.objects[0].reconstruction.gridMapping.length, 7);
for (const modify of [s => { s.candidateFamily = 'linear'; }, s => { s.label = 'data'; }, s => { s.markerShape = 'circle'; }, s => { s.points[0].y = .2; }]) {
  const q = base(); q.series = [gridSeries()]; modify(q.series[0]);
  assert.equal(buildNativeGraph(q).objects.length, 2, 'Scientific/partial geometry must remain editable series');
}
const guides = base(); guides.grid = { coordinateSpace: 'normalized', xStep: .2, style: { strokeWidth: .1, dashLength: 0, dashGap: 0, strokeLevel: 180 } };
guides.annotations = [{ id: 'partial', kind: 'guide', text: '', orientation: 'vertical', axis: 'y', coordinateSpace: 'normalized', x: .4, y: .9, to: { x: .4, y: .1 }, strokeWidth: .15, dashLength: 1, dashGap: .5 }];
const g = buildNativeGraph(guides); assert(g.ok, g.error); assert.equal(g.objects[0].showGridY, false);
assert.equal(g.objects[0].graphAnnotations[0].to.x, .4); assert(Math.abs(g.objects[0].graphAnnotations[0].to.y - .1) < 1e-12);
guides.annotations[0].to.y = 99; assert(!validateGraphPlan(guides).ok);
for (const invalid of [0, -1, .001, NaN]) { const q = base(); q.grid = { coordinateSpace: 'normalized', xStep: invalid }; assert(!validateGraphPlan(q).ok); }
const omitted = base(); omitted.variant = 'axis-break'; assert(validateGraphPlan(omitted).blocked);
omitted.annotations = [{ id: 'omission', kind: 'text', text: '≈', x: 0, y: .06, orientation: 'horizontal', axis: 'y', coordinateSpace: 'normalized' }];
assert(!validateGraphPlan(omitted).blocked); assert(buildNativeGraph(omitted).ok);
omitted.coordinateMode = 'data'; assert(validateGraphPlan(omitted).blocked, 'Omitted numerical intervals cannot become an exact global scale');
const emptyLeader = base(); emptyLeader.annotations = [{ id: 'leader', kind: 'leader', text: '', x: .2, y: .2, to: { x: .3, y: .3 }, coordinateSpace: 'normalized' }];
assert(validateGraphPlan(emptyLeader).ok); assert.equal(emptyLeader.annotations[0].orientation, undefined);
emptyLeader.annotations[0].orientation = 'nonsense'; assert(!validateGraphPlan(emptyLeader).ok);
const wave = base(); wave.series = [{ id: 'wave', kind: 'points', axis: 'y', certainty: 'observed', coordinateSpace: 'normalized', curveStyle: 'smooth', candidateFamily: 'sinusoid', lineStyle: 'solid', points: Array.from({ length: 81 }, (_, i) => ({ x: i / 80, y: .5 + .375 * Math.sin(5 * Math.PI * i / 80) })), breaks: [], endpoints: [] }];
const observed = JSON.stringify(wave), fit = preferAnalyticGraphPlan(wave, { requirePhysics: true, relativeDiagrams: true });
assert.equal(fit.plan.series[0].kind, 'expression');for(const x of [.1,.25,.4,.5,.7,.9])assert(Math.abs(compile(fit.plan.series[0].expression)(x)-(.5+.375*Math.sin(5*Math.PI*x)))<1e-7);
assert.equal(fit.plan.series[0].approximation.coefficientSource, 'relative-display-relations-estimated');
assert.deepEqual(fit.plan.axes, wave.axes); assert.equal(JSON.stringify(wave), observed); assert(validateGraphPlan(fit.plan).ok);
wave.series[0].candidateFamily = 'power-inverse-square';
const recovered=preferAnalyticGraphPlan(wave,{requirePhysics:true,relativeDiagrams:true}).plan.series[0];assert.equal(recovered.kind,'expression','An incorrect AI family hint must not veto a verified simple formula');assert.equal(recovered.certainty,'observed');assert(recovered.approximation.family!=='inverse-square');
console.log('textbook grid roles, explicit guides, omission semantics, relative sine and immutability PASS');

for (const field of ['annotations', 'review']) { const q = base(); q.variant = 'axis-break'; q[field] = {}; assert.equal(validateGraphPlan(q).ok, false); }
const logGrid = base(); logGrid.coordinateMode = 'data'; logGrid.axes.x = { ...logGrid.axes.x, scale: 'log', min: 1, max: 1000, step: 1 }; logGrid.axes.y = { ...logGrid.axes.y, scale: 'linear', min: 0, max: 1, step: 1 }; logGrid.grid = { coordinateSpace: 'normalized', xStep: .25 }; assert(validateGraphPlan(logGrid).errors.some(e => e.code === 'LOG_GRID'));

const exactGrid = base(); exactGrid.series = [{ ...gridSeries(), certainty: 'exact' }]; assert.deepEqual(mapNativeGrid(exactGrid).series, exactGrid.series);
const grayGrid = base(); grayGrid.series = []; grayGrid.annotations = gridSeries().points.reduce((a,p,i,ps) => i%2 ? a : [...a,{id:'guide'+i,kind:'guide',text:'',coordinateSpace:'normalized',orientation:p.x===ps[i+1].x?'vertical':'horizontal',...p,to:ps[i+1],strokeLevel:180}],[]); assert.equal(mapNativeGrid(grayGrid).grid.style.strokeLevel,180);

const caption = base(); caption.regions = [{ id:'edge-caption',kind:'polygon',coordinateSpace:'normalized',points:[{x:.9,y:.4},{x:1.04,y:.4},{x:1.04,y:.6},{x:.9,y:.6}],level:220 }];
assert(buildNativeGraph(caption).ok, 'Observed callout crossing the plot edge must remain inside the source image');
caption.regions[0].points[1].x = 5; assert(!buildNativeGraph(caption).ok, 'Do not permit backgrounds outside the source image');

const calibratedCaption = base(); calibratedCaption.coordinateMode = 'data'; calibratedCaption.axes = Object.fromEntries(['x','y'].map(k => [k,{scale:'linear',title:'',unit:'',min:0,max:10,step:1,ticks:[]}]));
calibratedCaption.regions = [{id:'caption',kind:'polygon',coordinateSpace:'normalized',points:[{x:.9,y:.4},{x:1.04,y:.4},{x:1.04,y:.6},{x:.9,y:.6}],level:220}];
assert(buildNativeGraph(calibratedCaption).ok, 'Calibration must not remove a source-bound caption background');
calibratedCaption.regions[0].points[1].x = 5; assert(!validateGraphPlan(calibratedCaption).ok);

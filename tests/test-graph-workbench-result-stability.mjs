import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildWorkbenchGraph, validateWorkbenchGraph, workbenchGraphDataUrl, editWorkbenchGraph, insertWorkbenchGraph } from '../js/graph/workbench-result.js';
import { auditGraphReconstructionQuality } from '../js/graph/reconstruction-quality.js';
import { auditGraphDescriptionQuality, GRAPH_DESCRIPTION_SAMPLE_COUNT } from '../js/graph/description-quality.js';
import {examSeriesStyle} from '../js/graph/exam-style.js';

const plan = JSON.parse(fs.readFileSync(new URL('./fixtures/graph-reconstruction/linear.json', import.meta.url), 'utf8'));
plan.axes.x.ticks = [{ value: 1, label: 't_0', displayMath: 't_0' }];
plan.axes.y.ticks = [{ value: 2, label: '값 2' }];
plan.axes.y2 = { scale: 'linear', title: '오른쪽 축', unit: '', min: 0, max: 8, step: 2, ticks: [{ value: 4, label: '4' }] };
const result = buildWorkbenchGraph(plan, plan.source);
const original = structuredClone(result);
const plane = validateWorkbenchGraph(result);
assert.deepEqual(result, original);
const cloned = structuredClone(result);
assert.deepEqual(validateWorkbenchGraph(cloned).explicitTicksX, plane.explicitTicksX);
assert.deepEqual(cloned.objects[0].explicitTicksY, plane.explicitTicksY);
assert.deepEqual(cloned.objects[0].y2.explicitTicks, plane.y2.explicitTicks);
const rows = [{ name: 'valid independent tick lists clone without mutation', pass: true }];
const designed = structuredClone(plan);
Object.assign(designed.axes.x,{title:'t',unit:'s',titlePosition:{x:.9,y:-.15},titleAnchor:'middle'});
Object.assign(designed.axes.y,{title:'V_C (V)',unit:'V'});
Object.assign(designed.axes.y2,{title:'I',unit:'mA'});
designed.series = [
  {id:'a',kind:'points',axis:'y',certainty:'exact',coordinateSpace:'data',label:'A',points:[{x:0,y:1},{x:2,y:3},{x:4,y:1}]},
  {id:'b',kind:'points',axis:'y',certainty:'exact',coordinateSpace:'data',label:'B',points:[{x:0,y:1},{x:2,y:2},{x:4,y:1.01}]},
];
const beforeDesign=structuredClone(designed);
const normal=buildWorkbenchGraph(designed,designed.source);
const creation=buildWorkbenchGraph(designed,designed.source,{descriptionLayout:true});
const designedPlane=validateWorkbenchGraph(creation);
assert.equal(designedPlane.graphStyle.arrowScale,1.45);
assert.equal(designedPlane.axisLabelScale,.7);

const manuallyStyled=structuredClone(creation), manualPlane=manuallyStyled.objects[0];
manualPlane.graphStyle.labelScale=.8;manualPlane.graphStyle.arrowScale=1.6;
manualPlane.labelYPos={fx:-.12,fy:.08};manualPlane.labelWeight=500;
manuallyStyled.plan.style={fontSizePx:26,labelWeight:400};
const manualA=manuallyStyled.objects.find(o=>o.reconstruction?.seriesId==='a');
manualA.styleOverrides={strokeWidth:{value:.61,width:50}};
const followPlan=structuredClone(manuallyStyled.plan);followPlan.axes.y.title='f(t)';
followPlan.series.find(s=>s.id==='b').strokeWidth=.8;
const followed=buildWorkbenchGraph(followPlan,followPlan.source,{descriptionLayout:true,priorResult:manuallyStyled});
assert.equal(followed.objects[0].graphStyle.labelScale,.8);
assert.equal(followed.objects[0].graphStyle.arrowScale,1.6);
assert.equal(followed.objects[0].labelWeight,500);
assert.deepEqual(followed.objects[0].labelYPos,manualPlane.labelYPos);
assert.equal(examSeriesStyle(followed.objects.find(o=>o.reconstruction?.seriesId==='a'),followed.objects[0]).strokeWidth,.61);
assert.equal(examSeriesStyle(followed.objects.find(o=>o.reconstruction?.seriesId==='b'),followed.objects[0]).strokeWidth,.8);
const biggerPlan=structuredClone(followPlan);biggerPlan.style.fontSizePx=32;
const bigger=buildWorkbenchGraph(biggerPlan,biggerPlan.source,{descriptionLayout:true,priorResult:followed});
assert.ok(Math.abs(bigger.objects[0].graphStyle.labelScale-.8*32/26)<1e-12);
const restoredWithPrior=buildWorkbenchGraph(followPlan,followPlan.source,{priorResult:manuallyStyled});
assert.equal(restoredWithPrior.objects[0].graphStyle.descriptionLayout,undefined);
rows.push({name:'followup keeps manual typography, positions and stroke edits while honoring a changed series style',pass:true});
assert.equal(designedPlane.labelX,'t(s)');
assert.equal(designedPlane.labelY,'V_C\n(V)');
assert.equal(designedPlane.y2.labelY2,'I\n(mA)');
assert.equal(normal.objects[0].labelY,'V_C (V)','Source-image reconstruction preserves the observed inline caption');
assert.deepEqual(designedPlane.labelXPos,normal.objects[0].labelXPos,'Explicit manual title positions survive default styling');
assert.equal(normal.objects[0].graphStyle.descriptionLayout,undefined,'Image reconstruction retains its existing style');
assert.deepEqual(creation.objects.filter(o=>o.type==='funcgraph').map(o=>o.mathPoints),normal.objects.filter(o=>o.type==='funcgraph').map(o=>o.mathPoints));
assert.deepEqual(designedPlane.graphAnnotations.filter(a=>a.kind==='text').map(a=>a.text),['A','B']);
assert.ok(creation.objects.filter(o=>o.type==='funcgraph').every(o=>o.endLabel==='' && o.graphStyle.labelScale===.7));
assert.deepEqual(designed,beforeDesign,'Styling never rewrites the accepted physical plan');
rows.push({name:'Description styling and label separation preserve physical coordinates and source plan',pass:true});
const annotated = structuredClone(designed);
annotated.annotations = [
  {id:'name-a',kind:'text',text:'A',x:2,y:3,axis:'y',coordinateSpace:'data',orientation:'horizontal'},
  {id:'formula-a',kind:'text',text:'y=x',x:2,y:2,axis:'y',coordinateSpace:'data',orientation:'horizontal',seriesId:'a'},
  {id:'quantity-point',kind:'point',text:'E_0',x:1,y:1,axis:'y',coordinateSpace:'data',orientation:'horizontal',endStyle:'none'},
];
const annotationBefore = structuredClone(annotated);
const styledAnnotations=validateWorkbenchGraph(buildWorkbenchGraph(annotated,annotated.source,{descriptionLayout:true})).graphAnnotations;
assert.equal(styledAnnotations.find(a=>a.id==='name-a').labelRole,'name','A series name remains upright even when placed without seriesId');
for(const id of ['formula-a','quantity-point']) assert.notEqual(styledAnnotations.find(a=>a.id===id).labelRole,'name','A formula or physical quantity is not a name merely because it is attached to a curve/point');
assert.deepEqual(annotated,annotationBefore);
rows.push({name:'Direct series names and linked physical formulas retain distinct typography roles',pass:true});
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const expressionPlan = (expression = 'x^2') => {
  const p = structuredClone(plan);
  p.axes.x.ticks = [];
  Object.assign(p.axes.y, { min: 0, max: 1, step: 1, ticks: [] });
  delete p.axes.y2;
  p.series = [{ id: 'formula', kind: 'expression', axis: 'y', certainty: 'exact', coordinateSpace: 'data', expression, domain: { min: 0, max: 4 } }];
  return p;
};
const sampleRow = quality => quality.metrics.descriptionExpressionSamples[0];
const descriptionIssue = (quality, code) => quality.issues.find(issue => issue.code === code);
const clippedPlan = freeze(expressionPlan()), clippedBefore = structuredClone(clippedPlan);
const clipped = buildWorkbenchGraph(clippedPlan, clippedPlan.source, { descriptionLayout: true });
assert.equal(clipped.quality.status, 'review', 'An exact expression can be intentionally clipped and must remain editable');
const clipping = descriptionIssue(clipped.quality, 'DESCRIPTION_EXPRESSION_CLIPPED');
assert.equal(clipping.severity, 'review');
assert.equal(clipping.path, 'series.0.expression');
assert.match(clipping.message, /축 범위나 정의역을 수정/);
assert.match(clipping.message, /의도한 잘림/);
assert.match(clipping.message, /수학적 증명은 아닙니다/);
assert.ok(clipped.quality.issues.every(issue => issue.severity !== 'critical'));
assert.deepEqual(sampleRow(clipped.quality), {
  seriesId: 'formula', axis: 'y', coordinateSpace: 'data', domain: { min: 0, max: 4 }, xSampling: 'linear',
  sampleCount: 129, finiteSampleCount: 129, visibleSampleCount: 33, clippedSampleCount: 96,
  nonpositiveLogSampleCount: 0, nonfiniteSampleCount: 0, visibleSampleFraction: 33 / 129,
});
assert.equal(sampleRow(clipped.quality).sampleCount, GRAPH_DESCRIPTION_SAMPLE_COUNT);
assert.equal(clipped.quality.coverage.descriptionExpressionSampling.samplesChecked, 129);
assert.equal(clipped.quality.coverage.descriptionExpressionSampling.expressionsChecked, 1);
assert.equal(clipped.quality.coverage.descriptionExpressionSampling.includesDomainEndpoints, true);
assert.equal(clipped.quality.coverage.descriptionExpressionSampling.mathematicalProof, false);
assert.equal(clipped.quality.physicalLawVerified, false);
assert.equal(clipped.quality.visualAcceptance, false);
assert.deepEqual(auditGraphDescriptionQuality(clippedPlan), clipped.quality, 'Sampling is deterministic');
assert.deepEqual(clipped.plan, clippedBefore);
assert.deepEqual(clippedPlan, clippedBefore, 'A frozen accepted physical plan is never rescaled or rewritten');
const restoredClipping = buildWorkbenchGraph(clippedPlan, clippedPlan.source);
assert.deepEqual(restoredClipping.quality, auditGraphReconstructionQuality(clippedPlan), 'Image restoration retains the entire original quality report');
assert.equal(restoredClipping.quality.status, 'pass');
assert.equal(restoredClipping.quality.metrics.descriptionExpressionSamples, undefined);
assert.equal(restoredClipping.quality.coverage.descriptionExpressionSampling, undefined);
assert.deepEqual(buildWorkbenchGraph(clippedPlan, clippedPlan.source, { descriptionLayout: false }).quality, restoredClipping.quality);
for (const key of ['xMin', 'xMax', 'yMin', 'yMax']) assert.equal(clipped.objects[0][key], restoredClipping.objects[0][key]);
for (const key of ['expr', 'domainMin', 'domainMax', 'mathPoints', 'breaks'])
  assert.deepEqual(clipped.objects[1][key], restoredClipping.objects[1][key], 'Review does not change the curve or its clipping');
rows.push({ name: 'Exact x^2 clipping is measured REVIEW only for description graphs, without plan or geometry changes', pass: true });

const visiblePlan = expressionPlan(); visiblePlan.axes.y.max = 16;
const visible = buildWorkbenchGraph(visiblePlan, visiblePlan.source, { descriptionLayout: true });
assert.equal(visible.quality.status, 'pass');
assert.equal(sampleRow(visible.quality).visibleSampleFraction, 1);
assert.equal(sampleRow(visible.quality).clippedSampleCount, 0);
const restricted = expressionPlan(); restricted.series[0].domain.max = 1;
assert.equal(sampleRow(buildWorkbenchGraph(restricted, restricted.source, { descriptionLayout: true }).quality).visibleSampleCount, 129,
  'Sample the expression domain, rather than the whole x axis');
const interior = expressionPlan('2*sin(pi*x/4)');
assert.ok(sampleRow(auditGraphDescriptionQuality(interior)).clippedSampleCount > 0, 'Visible endpoints do not hide clipped interior samples');
const endpoint = expressionPlan('floor(x)'); endpoint.series[0].domain.max = 1; endpoint.axes.y.max = .5;
assert.equal(sampleRow(auditGraphDescriptionQuality(endpoint)).clippedSampleCount, 1, 'The final domain endpoint is checked');
rows.push({ name: 'Visible curves, restricted domains, interior clipping and endpoint inclusion have focused coverage', pass: true });

const logarithmic = expressionPlan('x');
Object.assign(logarithmic.axes.x, { min: 1, max: 10000, scale: 'log' });
logarithmic.axes.y2 = { min: 1, max: 100, scale: 'log', title: '', unit: '', step: 1, ticks: [] };
Object.assign(logarithmic.series[0], { axis: 'y2', domain: { min: 1, max: 10000 } });
const logClipped = buildWorkbenchGraph(logarithmic, logarithmic.source, { descriptionLayout: true });
assert.equal(logClipped.quality.status, 'review');
assert.equal(sampleRow(logClipped.quality).axis, 'y2');
assert.equal(sampleRow(logClipped.quality).xSampling, 'log');
assert.equal(sampleRow(logClipped.quality).visibleSampleCount, 65, 'Half the log x span is visible on the independent log y2 range');
assert.equal(sampleRow(logClipped.quality).clippedSampleCount, 64);
assert.deepEqual(buildWorkbenchGraph(logarithmic, logarithmic.source).quality, auditGraphReconstructionQuality(logarithmic));
logarithmic.axes.y2.max = 10000;
assert.equal(buildWorkbenchGraph(logarithmic, logarithmic.source, { descriptionLayout: true }).quality.status, 'pass');
rows.push({ name: 'Log x spacing and the independent log y2 display range control sample coverage', pass: true });

for (const axis of ['y', 'y2']) {
  const nonpositive = expressionPlan('x-1');
  nonpositive.axes[axis] = { min: 1, max: 10, scale: 'log', title: '', unit: '', step: 1, ticks: [] };
  nonpositive.series[0].axis = axis;
  const q = buildWorkbenchGraph(nonpositive, nonpositive.source, { descriptionLayout: true }).quality;
  assert.equal(q.status, 'review');
  assert.equal(descriptionIssue(q, 'DESCRIPTION_EXPRESSION_LOG_NONPOSITIVE').severity, 'review');
  assert.match(descriptionIssue(q, 'DESCRIPTION_EXPRESSION_LOG_NONPOSITIVE').message, /0 이하.*수식·정의역·로그축 설정/);
  assert.equal(sampleRow(q).nonpositiveLogSampleCount, 33, 'Negative and zero values cannot be displayed on a log value axis');
  assert.equal(sampleRow(q).clippedSampleCount, 31, 'Positive values below the log range are classified as clipping');
  assert.equal(sampleRow(q).visibleSampleCount, 65);
  assert.equal(sampleRow(q).finiteSampleCount, 129);
  assert.equal(buildWorkbenchGraph(nonpositive, nonpositive.source).quality.status, 'pass', 'Restoration keeps its previous treatment of log-unplottable samples');
}
rows.push({ name: 'Nonpositive log y and y2 values yield user-correctable REVIEW with separate clipping counts', pass: true });

const normalized = expressionPlan('x');
Object.assign(normalized.axes.x, { min: 10, max: 100, scale: 'log' });
Object.assign(normalized.axes.y, { min: 100, max: 1000, scale: 'log' });
Object.assign(normalized.series[0], { certainty: 'observed', coordinateSpace: 'normalized', domain: { min: 0, max: 1 },
  observedPoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  approximation: { provenance: 'image-fit', method: 'simple-image-fit-v1', family: 'linear', tolerance: .008,
    maxDeviation: 0, rmsDeviation: 0, interiorMaxDeviation: 0, errorSpace: 'normalized-display', sourceCurveStyle: 'straight' } });
const normalizedResult = buildWorkbenchGraph(normalized, normalized.source, { descriptionLayout: true });
assert.equal(normalizedResult.quality.status, 'pass');
assert.equal(sampleRow(normalizedResult.quality).coordinateSpace, 'normalized');
assert.equal(sampleRow(normalizedResult.quality).xSampling, 'linear');
assert.equal(sampleRow(normalizedResult.quality).visibleSampleCount, 129, 'Normalized zero maps to the positive log-axis minimum');
assert.equal(sampleRow(normalizedResult.quality).nonpositiveLogSampleCount, 0);
assert.deepEqual(normalizedResult.plan, normalized);
rows.push({ name: 'Normalized formulas are sampled in normalized coordinates even with numeric log axes', pass: true });

const critical = expressionPlan();
critical.annotations = [{ id: 'contradiction', kind: 'guide', text: '', axis: 'y', coordinateSpace: 'data', orientation: 'horizontal',
  x: 0, y: 0, to: { x: 1, y: 1 } }];
const criticalBase = auditGraphReconstructionQuality(critical);
assert.equal(criticalBase.status, 'fail');
const criticalDescription = buildWorkbenchGraph(critical, critical.source, { descriptionLayout: true });
assert.equal(criticalDescription.quality.status, 'fail', 'A new review issue cannot weaken an existing critical failure');
assert.deepEqual(criticalDescription.quality.issues.slice(0, criticalBase.issues.length), criticalBase.issues);
assert.equal(descriptionIssue(criticalDescription.quality, 'DESCRIPTION_EXPRESSION_CLIPPED').severity, 'review');
assert.deepEqual(criticalDescription.quality.metrics.observationComparisons, criticalBase.metrics.observationComparisons);
assert.deepEqual(buildWorkbenchGraph(critical, critical.source).quality, criticalBase);
rows.push({ name: 'Existing critical issues and restoration reports survive the description-only review merge', pass: true });

const nonfinite = expressionPlan('1/(x-1)');
const nonfiniteQuality = auditGraphDescriptionQuality(nonfinite);
assert.equal(nonfiniteQuality.status, 'review');
assert.equal(sampleRow(nonfiniteQuality).nonfiniteSampleCount, 1);
assert.equal(sampleRow(nonfiniteQuality).finiteSampleCount, 128);
assert.equal(nonfiniteQuality.issues.filter(issue => issue.code.includes('NONFINITE_SAMPLE')).length, 1, 'Existing nonfinite diagnostics are not duplicated');
const logNonfinite = expressionPlan('1/(x-10)');
Object.assign(logNonfinite.axes.x, { min: 1, max: 100, scale: 'log' });
Object.assign(logNonfinite.axes.y, { min: -10, max: 10 });
logNonfinite.series[0].domain = { min: 1, max: 100 };
const logNonfiniteQuality = auditGraphDescriptionQuality(logNonfinite);
assert.equal(sampleRow(logNonfiniteQuality).nonfiniteSampleCount, 1);
assert.equal(descriptionIssue(logNonfiniteQuality, 'DESCRIPTION_EXPRESSION_NONFINITE_SAMPLE').severity, 'review', 'Log-spaced samples can find a singularity missed by the existing linear samples');
const multiple = expressionPlan();
multiple.series.push({ ...structuredClone(multiple.series[0]), id: 'visible', expression: 'x/4' });
const multiQuality = auditGraphDescriptionQuality(multiple);
assert.equal(multiQuality.coverage.descriptionExpressionSampling.samplesChecked, 258);
assert.equal(multiQuality.coverage.descriptionExpressionSampling.expressionsChecked, 2);
assert.deepEqual(multiQuality.metrics.descriptionExpressionSamples.map(row => row.visibleSampleCount), [33, 129]);
assert.deepEqual(auditGraphDescriptionQuality(designed).metrics.descriptionExpressionSamples, [], 'Non-expression geometry is unchanged');
rows.push({ name: 'Nonfinite samples remain distinct and bounded coverage accounts for each expression only', pass: true });
for (const axis of ['x', 'y', 'y2']) {
  const broken = structuredClone(result);
  const target = broken.objects.find(o => o.type === 'coordplane');
  if (axis === 'y2') target.y2.explicitTicks = [null];
  else target[`explicitTicks${axis.toUpperCase()}`] = [null];
  const before = structuredClone(broken);
  const controlled = error => error.name === 'Error' && /눈금/.test(error.message);
  assert.throws(() => validateWorkbenchGraph(broken), controlled);
  await assert.rejects(() => workbenchGraphDataUrl(broken), controlled);
  assert.throws(() => editWorkbenchGraph(broken), controlled);
  let stateAccesses = 0;
  const state = { get() { stateAccesses++; throw Error('State should not be accessed'); }, update() { stateAccesses++; throw Error('State should not be mutated'); } };
  assert.throws(() => insertWorkbenchGraph(state, broken), controlled);
  assert.equal(stateAccesses, 0);
  assert.deepEqual(broken, before);
  assert.deepEqual(result, original);
  rows.push({ name: `${axis} null tick controlled rejection before rendering/editing/insertion/state access`, pass: true });
}
if (process.env.EVIDENCE_DIR) {
  fs.mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.EVIDENCE_DIR, 'tick-unit-report.json'), JSON.stringify({ pass: true, rows }, null, 2));
}
console.log(`PASS Workbench description quality, null ticks and clone preservation (${rows.length} cases)`);

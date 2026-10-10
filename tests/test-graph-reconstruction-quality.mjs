import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { auditGraphReconstructionQuality } from '../js/graph/reconstruction-quality.js';
const base = () => ({ axes: { x: { min: 0, max: 10, scale: 'linear', title: '시간' }, y: { min: 0, max: 10, scale: 'linear', title: '온도' } },
  source: { plotBox: { w: 500, h: 400 } }, series: [], annotations: [], review: [] });
const pointSeries = (extra = {}) => ({ id: 's', kind: 'points', axis: 'y', coordinateSpace: 'data', certainty: 'observed', curveStyle: 'straight', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], ...extra });
const formula = (extra = {}) => ({ id: 's', kind: 'expression', expression: 'x', axis: 'y', coordinateSpace: 'data', certainty: 'exact', domain: { min: 0, max: 10 }, ...extra });
const cases = [];
function test(name, fn) { fn(); cases.push(name); }
const has = (audit, code) => audit.issues.some(i => i.code === code);
const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };

test('ordinary lines polylines and bars are successful editable geometry, not failed fits', () => {
  const p = base(); p.series = [pointSeries(), pointSeries({ id: 'poly', points: [{ x: 0, y: 1 }, { x: 5, y: 2 }, { x: 10, y: 1 }], analyticFitFailure: 'Intentional polygon' }), { id: 'bar', kind: 'bar', items: [{ x: 1, value: 2 }], analyticFitFailure: 'Not a function' }];
  const r = auditGraphReconstructionQuality(p);
  assert.equal(r.status, 'pass'); assert.equal(r.metrics.basicGeometryCount, 3); assert.equal(r.metrics.fallbackCount, 0);
  assert.equal(r.visualAcceptance, false); assert.equal(r.physicalLawVerified, false); assert.equal(r.coverage.completeVisualMatch, false); assert.equal(r.coverage.referenceInventory, false);
});
test('retained smooth function failure has a visible review reason', () => {
  const p = base(); p.series = [pointSeries({ curveStyle: 'smooth', analyticFitFailure: 'Insufficient reference units' })];
  const r = auditGraphReconstructionQuality(p); assert.equal(r.status, 'review'); assert(has(r, 'ANALYTIC_FALLBACK')); assert.match(r.issues[0].message, /Insufficient/);
});
test('every unresolved smooth editable curve is an incomplete analytic reconstruction', () => {
  for (const extra of [
    { curveStyle: 'smooth', candidateFamily: 'none' },
    { curveStyle: 'smooth' },
    { segmentModes: ['smooth'], closed: true },
    { handlesMath: [{ in: { x: 0, y: 0 }, out: { x: 1, y: 1 } }] },
    { curveStyle: 'smooth', markerShape: 'circle', breaks: [1], arrowSpecs: [{ segment: 0 }] },
  ]) {
    const p = base(); p.series = [pointSeries(extra)];
    const r = auditGraphReconstructionQuality(p);
    assert.equal(r.status, 'review'); assert.equal(r.metrics.fallbackCount, 1);
    assert(has(r, 'ANALYTIC_FALLBACK')); assert(r.issues[0].message.length > 0);
  }
  const p = base(); p.series = [pointSeries({ points: [{ x: 5, y: 0 }, { x: 5, y: 10 }] }),
    pointSeries({ lineVisible: false, curveStyle: 'smooth', markerShape: 'circle' })];
  assert.equal(auditGraphReconstructionQuality(p).metrics.fallbackCount, 0);
});
test('guide contact can lie inside an unchanged segment, but not its extension', () => {
  for (const [orientation, start, end, target] of [
    ['horizontal', { x: 10, y: 5 }, { x: 0, y: 5 }, { x: 4, y: 5 }],
    ['vertical', { x: 5, y: 0 }, { x: 5, y: 10 }, { x: 5, y: 4 }],
  ]) {
    const p = base(); p.series = [pointSeries({ points: [{ x: 0, y: 0 }, target] })];
    p.annotations = [{ kind: 'guide', seriesId: 's', pointIndex: 1, coordinateSpace: 'data', orientation, ...start, to: end }];
    const before = JSON.stringify(p), r = auditGraphReconstructionQuality(freeze(p));
    assert.equal(r.status, 'pass'); assert.equal(r.metrics.linkedContactsChecked, 1);
    assert.equal(JSON.stringify(p), before);
    const outside = structuredClone(p);
    outside.series[0].points[1][orientation === 'horizontal' ? 'x' : 'y'] = 11;
    assert(has(auditGraphReconstructionQuality(outside), 'CONTACT_POSITION_MISMATCH'));
    const offset = structuredClone(p);
    offset.series[0].points[1][orientation === 'horizontal' ? 'y' : 'x'] += .1;
    assert(has(auditGraphReconstructionQuality(offset), 'CONTACT_POSITION_MISMATCH'));
    const collapsed = structuredClone(p); collapsed.annotations[0].to = start;
    assert(has(auditGraphReconstructionQuality(collapsed), 'CONTACT_POSITION_MISMATCH'));
  }
});
test('interior formula guide contacts map independent logarithmic display spaces', () => {
  const p = base(); p.axes.x = p.axes.y = { min: 1, max: 100, scale: 'log' };
  p.series = [formula({ domain: { min: 1, max: 100 } })];
  p.annotations = [{ kind: 'guide', seriesId: 's', anchorX: .5, coordinateSpace: 'normalized',
    orientation: 'horizontal', x: 0, y: .5, to: { x: 1, y: .5 } }];
  assert.equal(auditGraphReconstructionQuality(p).status, 'pass');
  p.annotations[0].kind = 'leader';
  assert(has(auditGraphReconstructionQuality(p), 'CONTACT_POSITION_MISMATCH'));
});
test('linked leaders use endpoint contacts and labels can legitimately be offset', () => {
  const p = base(); p.series = [pointSeries()]; p.annotations = [{ id: 'a', kind: 'leader', seriesId: 's', pointIndex: 1, axis: 'y', coordinateSpace: 'normalized', x: .1, y: .9, to: { x: 1, y: 1 } }, { id: 'label', kind: 'text', seriesId: 's', pointIndex: 1, text: 'A', x: .7, y: .8, coordinateSpace: 'normalized' }];
  const r = auditGraphReconstructionQuality(p); assert.equal(r.status, 'pass'); assert.equal(r.metrics.linkedContactsChecked, 1);
  p.annotations[0].to.x = .8; assert(has(auditGraphReconstructionQuality(p), 'CONTACT_POSITION_MISMATCH'));
});
test('explicit partial guides preserve valid starts or ends and reject contradictory orientation', () => {
  const p = base(); p.series = [pointSeries()]; p.annotations = [{ id: 'g', kind: 'guide', seriesId: 's', pointIndex: 1, axis: 'y', coordinateSpace: 'data', orientation: 'horizontal', x: 8, y: 10, to: { x: 10, y: 10 } }];
  assert.equal(auditGraphReconstructionQuality(p).status, 'pass');
  p.annotations[0].to.y = 8; assert(has(auditGraphReconstructionQuality(p), 'GUIDE_DIRECTION_MISMATCH'));
  p.annotations[0].seriesId = 'missing'; assert(has(auditGraphReconstructionQuality(p), 'CONTACT_SERIES_MISSING'));
});
test('independent logarithmic coordinate spaces map the same actual contact', () => {
  const p = base(); p.axes.x = { min: 1, max: 100, scale: 'log' }; p.axes.y = { min: 1, max: 1000, scale: 'log' };
  p.series = [pointSeries({ points: [{ x: 1, y: 1 }, { x: 10, y: 100 }] })];
  p.annotations = [{ kind: 'point', seriesId: 's', pointIndex: 1, coordinateSpace: 'normalized', axis: 'y', x: .5, y: 2 / 3 }];
  assert.equal(auditGraphReconstructionQuality(p).status, 'pass');
  p.annotations[0].axis = 'y2'; assert(has(auditGraphReconstructionQuality(p), 'CONTACT_AXIS_MISMATCH'));
});
test('domain failures and nonfinite formula samples are separate from measured observation shape', () => {
  const p = base(); p.series = [formula({ domain: { min: 0, max: Infinity } })]; assert(has(auditGraphReconstructionQuality(p), 'EXPRESSION_DOMAIN_INVALID'));
  p.series = [formula({ expression: 'nonsense' })]; assert(has(auditGraphReconstructionQuality(p), 'EXPRESSION_UNEVALUABLE'));
  p.series = [formula({ expression: '1/x' })]; const exact = auditGraphReconstructionQuality(p); assert.equal(exact.status, 'review'); assert(has(exact, 'EXPRESSION_NONFINITE_SAMPLE'));
});
test('strong contacts and actual observations have independent diagnostics', () => {
  const p = base(); p.series = [formula({ certainty: 'observed', observedPoints: [{ x: 0, y: 0 }, { x: 10, y: 10 }], approximation: { errorSpace: 'normalized-display', tolerance: .01, anchors: [{ x: 5, y: 4, strong: true }] } })];
  const r = auditGraphReconstructionQuality(p); assert(has(r, 'STRONG_ANCHOR_MISMATCH')); assert(!has(r, 'OBSERVATION_SHAPE_DEVIATION')); assert.equal(r.metrics.observationComparisons[0].maxDeviation, 0);
  p.series[0].approximation.anchors[0].y = 5; p.series[0].observedPoints[1].y = 8;
  const shape = auditGraphReconstructionQuality(p); assert(!has(shape, 'STRONG_ANCHOR_MISMATCH')); assert(has(shape, 'OBSERVATION_SHAPE_DEVIATION')); assert(Math.abs(shape.metrics.observationComparisons[0].maxDeviation - .2) < 1e-12);
  p.series[0].approximation.errorSpace = 'normalized-display-distance'; assert(!has(auditGraphReconstructionQuality(p), 'OBSERVATION_SHAPE_DEVIATION'), 'Perpendicular distance is not the measured vertical difference');
});
test('formula-linked guide anchors use the correct series coordinate space', () => {
  const p = base(); p.series = [formula()]; p.annotations = [{ kind: 'guide', seriesId: 's', anchorX: .5, axis: 'y', coordinateSpace: 'normalized', orientation: 'horizontal', x: .5, y: .5, to: { x: 0, y: .5 } }];
  assert.equal(auditGraphReconstructionQuality(p).status, 'pass');
  p.annotations[0].y = .4; p.annotations[0].to.y = .4; assert(has(auditGraphReconstructionQuality(p), 'CONTACT_POSITION_MISMATCH'));
});
test('relative sine is reviewed as image approximation and never certified physical law', () => {
  const p = base(); p.series = [formula({ coordinateSpace: 'normalized', domain: { min: 0, max: 1 }, expression: '.5+.3*sin(2*pi*x)', observedPoints: [{ x: 0, y: .5 }, { x: 1, y: .5 }], approximation: { coefficientSource: 'relative-diagram-amplitude-period-phase', errorSpace: 'normalized-display', tolerance: .008 } })];
  const r = auditGraphReconstructionQuality(p); assert.equal(r.status, 'review'); assert(has(r, 'RELATIVE_FORMULA_REVIEW')); assert.equal(r.physicalLawVerified, false);
});
test('only explicit reference element inventory can report missing source roles', () => {
  const p = base(); p.frame = { variant: 'box', arrowX: true }; p.grid = { xStep: .2 }; p.series = [pointSeries()]; p.annotations = [{ id: 'g', kind: 'guide', x: 0, y: 0, to: { x: 0, y: 1 }, coordinateSpace: 'normalized', orientation: 'vertical' }];
  const requiredElements = [{ role: 'axis', axis: 'x' }, { role: 'axis', axis: 'y' }, { role: 'grid' }, { role: 'guide', id: 'g' }, { role: 'arrow', axis: 'x' }, { role: 'title', axis: 'x', text: '시간' }, { role: 'frame' }];
  const r = auditGraphReconstructionQuality(p, { reference: { requiredElements } }); assert.equal(r.status, 'pass'); assert.equal(r.metrics.referenceElementsChecked, 7); assert.equal(r.visualAcceptance, false);
  delete p.grid; delete p.frame.arrowX; p.axes.x.title = '';
  const missing = auditGraphReconstructionQuality(p, { expect: { requiredElements } }); assert.equal(missing.status, 'fail'); assert.equal(missing.issues.filter(i => i.code === 'REQUIRED_ELEMENT_MISSING').length, 3);
  assert.equal(auditGraphReconstructionQuality(p).status, 'pass');
});
test('explicit tick-pair relations compare saved geometry without proving units or law', () => {
  const p = base(); p.axes.x.ticks = [{ label: 't', value: 5 }]; p.axes.y.ticks = [{ label: 'h', value: 5 }];
  p.series = [pointSeries({ relationAnchors: [{ xTickLabel: 't', yTickLabel: 'h' }] })];
  const r = auditGraphReconstructionQuality(p); assert.equal(r.status, 'pass'); assert.equal(r.metrics.declaredRelationsChecked, 1);
  p.axes.y.ticks[0].value = 4; assert(has(auditGraphReconstructionQuality(p), 'RELATION_CONTACT_MISMATCH'));
  p.series[0].curveStyle = 'smooth'; assert(has(auditGraphReconstructionQuality(p), 'RELATION_CONTACT_UNVERIFIED'), 'Do not invent exact smooth-curve contacts between observations');
  p.series = [formula({ relationAnchors: [{ xTickLabel: 't', yTickLabel: 'h' }] })]; assert(has(auditGraphReconstructionQuality(p), 'RELATION_CONTACT_MISMATCH'));
});
test('declared formula contacts outside domain remain distinct from shape errors', () => {
  const p = base(); p.series = [formula({ approximation: { anchors: [{ x: 11, y: 11, strong: true }] } })];
  assert(has(auditGraphReconstructionQuality(p), 'STRONG_ANCHOR_OUTSIDE_DOMAIN'));
  p.series = [formula()]; p.annotations = [{ kind: 'point', seriesId: 's', anchorX: 11, axis: 'y', coordinateSpace: 'data', x: 11, y: 11 }];
  assert(has(auditGraphReconstructionQuality(p), 'CONTACT_OUTSIDE_DOMAIN'));
});
test('duplicate explicit labels get review without assuming an intended label position', () => {
  const p = base(); p.series = [pointSeries({ endLabel: 'A' })]; p.annotations = [{ kind: 'text', seriesId: 's', text: 'A', x: .5, y: .6 }];
  assert(has(auditGraphReconstructionQuality(p), 'DUPLICATE_END_LABEL'));
});
test('audit is deterministic, pure, robust to missing context, and does not invent measured fidelity', () => {
  const p = freeze(base()), before = JSON.stringify(p), options = freeze({ reference: { requiredElements: [{ role: 'grid' }] } });
  assert.deepEqual(auditGraphReconstructionQuality(p, options), auditGraphReconstructionQuality(p, options)); assert.equal(JSON.stringify(p), before);
  assert.equal(auditGraphReconstructionQuality(null).status, 'review');
  const r = auditGraphReconstructionQuality(p); assert.equal(r.coverage.schemaValidation, 'not-performed'); assert.equal(r.coverage.originalPixels, false);
});
const out = path.resolve(process.env.EVIDENCE_DIR || '.omo/evidence/graph-stability-20261007/quality');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'quality-tests.json'), JSON.stringify({ pass: true, cases }, null, 2));
console.log(`Graph reconstruction quality PASS (${cases.length} cases)`);

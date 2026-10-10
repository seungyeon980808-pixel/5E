import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPhysicsGraphResult, isPhysicsProviderUnavailable } from '../tools/physics-graph-result-audit.mjs';

const plan = {
  source: { plotBox: { w: 320 } }, style: { fontSizePx: 24 }, annotations: [{ id: 'A', text: 'A', fontSizePx: 18 }],
  series: [
    { id: 'formula', kind: 'expression', expression: '2/sqrt(x)', approximation: { coefficientSource: 'relation-anchors', anchorDeviation: 0, maxDeviation: .02, rmsDeviation: .01, errorSpace: 'normalized-display-distance' } },
    { id: 'uncertain', kind: 'points', analyticFitFailure: '기준점 부족' },
    { id: 'scatter', kind: 'points', lineVisible: false, markerShape: 'circle' },
    { id: 'closed', kind: 'points', closed: true },
  ],
};
const objects = [{ type: 'coordplane', w: 70, axisLabelSize: 24 * 70 / 320, tickLabelSize: 24 * 70 / 320, originLabelSize: 24 * 70 / 320,
  reconstruction: { labelSizeMode: 'source-height' }, graphAnnotations: [{ id: 'A', size: 18 * 70 / 320, labelSizeMode: 'source-height' }] }];
const heads = { applied: true, measurements: [{ axis: 'x', lengthPx: 19, widthPx: 13 }, { axis: 'y', lengthPx: 19, widthPx: 12 }] };

test('physics audit distinguishes formula counts, fallback reasons and unavailable style evidence', () => {
  const before = JSON.stringify(plan);
  const audit = auditPhysicsGraphResult(plan, { expectedAnalyticCurves: 2 });
  assert.equal(audit.formulaCount, 1); assert.equal(audit.relationCount, 1); assert.equal(audit.pointCount, 3); assert.equal(audit.failedCount, 1);
  assert.equal(audit.expectedFormulaCountMet, false); assert(audit.lines.some(l => l.includes('기준점 부족')));
  assert.equal(audit.style.fontEmbedded, null); assert.equal(audit.style.axisArrowSizePass, null);
  assert.equal(audit.style.labelHeightMappingPass, null);
  for (const field of ['visualAcceptance', 'physicalLawVerified', 'fakeBendsMeasured']) assert.equal(audit[field], false);
  assert.equal(JSON.stringify(plan), before);
  assert.equal(auditPhysicsGraphResult(null).style.labelHeightMappingPass, null);
});

test('style audit checks source/native label mapping and every measured axis without inventing passes', () => {
  const audit = auditPhysicsGraphResult(plan, { objects, sourceHeads: heads, renderedHeads: heads, fontEmbedded: true });
  assert.equal(audit.style.labelHeightMappingPass, true); assert.equal(audit.style.labelHeights.length, 4); assert.equal(audit.style.axisArrowSizePass, true);
  const smaller = { applied: true, measurements: [{ axis: 'x', lengthPx: 11, widthPx: 7 }] };
  assert.equal(auditPhysicsGraphResult(plan, { objects, sourceHeads: heads, renderedHeads: smaller }).style.axisArrowSizePass, false);
  assert.equal(auditPhysicsGraphResult(plan, { objects, sourceHeads: { applied: false, reason: 'ambiguous' }, renderedHeads: heads }).style.axisArrowSizePass, null);
  assert.equal(auditPhysicsGraphResult(plan, { objects, sourceHeads: heads, renderedHeads: { applied: false, reason: 'ambiguous' } }).style.axisArrowSizePass, null);
  const legacy = structuredClone(objects); legacy[0].reconstruction.labelSizeMode = 'legacy';
  assert.equal(auditPhysicsGraphResult(plan, { objects: legacy }).style.labelHeightMappingPass, false);
  const override = structuredClone(plan); override.style.labelSize = 5;
  assert.equal(auditPhysicsGraphResult(override, { objects }).style.labelHeights.length, 1);
});

test('provider-wide errors stop a batch while source-specific restoration failures do not', () => {
  for (const message of ['exceeded retry limit, last status: 429 Too Many Requests', 'Usage limit reached', '401 Unauthorized', '502 Bad Gateway: Provider unreachable: getaddrinfo ENOTFOUND chatgpt.com', 'ECONNRESET', 'AI 연결이 끊겼습니다. 연결을 확인하세요.']) assert(isPhysicsProviderUnavailable(message));
  for (const message of ['', 'Graph observation contract validation failed', 'Analysis timeout', 'unknown axis', '기준점 부족']) assert(!isPhysicsProviderUnavailable(message));
});


test('native basic geometry is not an analytic restoration failure',()=>{
  const p={series:[{kind:'points',curveStyle:'straight',points:[{x:0,y:0},{x:1,y:1},{x:2,y:0}]},{kind:'bar',items:[{label:'A',value:1}]}]};
  const a=auditPhysicsGraphResult(p);assert.equal(a.geometryCount,2);assert.equal(a.retainedCurveCount,0);assert.equal(a.failedCount,0);
});

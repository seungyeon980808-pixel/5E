import assert from 'node:assert/strict';
import { summarizeAnalyticGraph } from '../js/graph/analytic-summary.js';

const measured = (id, errorSpace, anchors = []) => ({ id, kind: 'expression', expression: '2/sqrt(x)', approximation: { errorSpace, maxDeviation: 0.0272, rmsDeviation: 0.012, anchors } });
const source = { series: [
  measured('A', 'normalized-display-distance', [{ strong: true }, { strong: true }, { strong: false }]),
  measured('B', 'normalized-display'),
  { id: 'C', kind: 'points', analyticFitFailure: '원본과 함수 종류가 맞지 않습니다.' },
  { id: 'D', kind: 'points', markerShape: 'cross', lineVisible: false },
] };
const before = structuredClone(source), summary = summarizeAnalyticGraph(source);
assert.deepEqual([summary.formulaCount, summary.pointCount, summary.failedCount], [2, 2, 1]);
assert(summary.lines.some(line => line.includes('A:') && line.includes('기준점 2개 검수') && line.includes('선 간 거리 최대 2.72%, RMS 1.20%')));
assert(summary.lines.some(line => line.includes('B:') && line.includes('확정 기준점 없음') && line.includes('세로 위치 차이 최대 2.72%')));
assert(summary.lines.some(line => line.includes('C: 함수 복원 미완료') && line.includes('함수 종류가 맞지')));
assert(summary.lines.some(line => line.includes('D:') && line.includes('산점도')));
assert(!summary.lines.some(line => line.includes('D: 함수 복원 미완료')));
assert(summary.lines.some(line => line.includes('인식한 선') && line.includes('편집 후에는 다시 측정되지')));
assert.deepEqual(source, before);
const relations = summarizeAnalyticGraph({ series: [
  { ...measured('exact', 'normalized-display-distance', [{ strong: true }]), approximation: { ...measured('exact', 'normalized-display-distance').approximation, coefficientSource: 'relation-anchors', anchorDeviation: 0, anchors: [{ strong: true }] } },
  { ...measured('partial', 'normalized-display-distance'), approximation: { ...measured('partial', 'normalized-display-distance').approximation, coefficientSource: 'partly-observed', anchorDeviation: 0 } },
] });
assert.equal(relations.relationCount, 1); assert.equal(relations.approximateCount, 1);
assert(relations.lines[0].includes('기준점으로 계수 계산 1개 · 근사 1개'));
assert(relations.lines[2].includes('근사 식'));

// Old/invalid metric provenance must never become a numerical quality claim.
for (const a of [{ errorSpace: 'data', maxDeviation: 2, rmsDeviation: 1 }, { errorSpace: 'normalized-display-distance', maxDeviation: NaN, rmsDeviation: -1 }]) {
  const s = summarizeAnalyticGraph({ series: [{ id: 'old', kind: 'expression', expression: 'x', approximation: a }] });
  assert(s.lines[1].includes('원본 차이 측정값 없음'));
  assert(!s.lines[1].includes('%'));
}
assert.equal(summarizeAnalyticGraph(null).formulaCount, 0);
assert(summarizeAnalyticGraph({ series: [{ kind: 'expression', expression: 'x' }] }).lines[1].includes('원본 차이 측정값 없음'));
console.log('PASS graph formula/retained-path counts, measured-error semantics and provenance reporting');

const basic=summarizeAnalyticGraph({series:[{kind:'points',curveStyle:'straight',points:[{x:0,y:0},{x:1,y:1},{x:2,y:0}]},{kind:'bar',items:[{label:'A',value:1}]}]});
assert.equal(basic.geometryCount,2);assert.equal(basic.failedCount,0);assert(basic.lines.some(l=>l.includes('꺾은선')));assert(basic.lines.some(l=>l.includes('막대')));assert(!basic.lines.some(l=>l.includes('미완료')));

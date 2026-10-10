// Describe the measured automatic result, without promising an exact physical law.
// This is also used after editing, where the original fit is deliberately identified.
const percent = value => Number.isFinite(value) && value >= 0 ? `${(value * 100).toFixed(2)}%` : null;
const relationBased = series => series.approximation?.coefficientSource === 'relation-anchors'
  && Number.isFinite(series.approximation.anchorDeviation) && series.approximation.anchorDeviation <= 1e-7;

export function isBasicGraphGeometry(series) {
  return series?.kind==='bar' || series?.kind==='points' && Array.isArray(series.points) && series.points.length>=2 && series.lineVisible!==false && (!series.markerShape || series.markerShape==='none') && series.curveStyle!=='smooth' && !series.segmentModes?.includes('smooth') && !series.handlesMath && !series.physicsModel;
}

function retainedReason(series) {
  if (series.analyticFitFailure) return String(series.analyticFitFailure);
  if (series.lineVisible === false || series.markerShape && series.markerShape !== 'none') return '산점도 또는 점 표시를 유지했습니다.';
  if (series.closed) return '닫힌 경로를 유지했습니다.';
  if (series.breaks?.length || series.endpoints?.length || series.arrowSpecs?.length) return '구간 경계 또는 방향 표시를 유지했습니다.';
  if (series.handlesMath || series.segmentModes?.length) return '직접 지정한 경로를 유지했습니다.';
  return '기준점과 함수 종류를 확정하지 못했습니다.';
}

export function summarizeAnalyticGraph(plan) {
  const series = Array.isArray(plan?.series) ? plan.series : [];
  const formulas = series.filter(s => s?.kind === 'expression');
  const points = series.filter(s => s?.kind === 'points');
  const geometry=series.filter(isBasicGraphGeometry);
  const failed = points.filter(s => !isBasicGraphGeometry(s) && Boolean(s.analyticFitFailure)).length;
  const relationCount = formulas.filter(relationBased).length;
  const approximateCount = formulas.filter(s => s.approximation && !relationBased(s)).length;
  const lines = [`식 ${formulas.length}개${relationCount || approximateCount ? ` (기준점으로 계수 계산 ${relationCount}개 · 근사 ${approximateCount}개)` : ''} · 기본 도형 ${geometry.length}개 · 점 경로 ${points.length-geometry.filter(s=>s.kind==='points').length}개${failed ? ` (함수 복원 미완료 ${failed}개)` : ''}`];
  for (const [index, s] of series.entries()) {
    if (!s || !['expression', 'points', 'bar'].includes(s.kind)) continue;
    const name = s.label || s.name || s.id || `곡선 ${index + 1}`;
    if(isBasicGraphGeometry(s)){
      lines.push(`${name}: 기본 도형 · ${s.kind==='bar'?'막대':s.points?.length===2?'직선':'꺾은선'} · 기존 도형 편집으로 수정 가능`); continue;
    }
    if (s.kind === 'points') {
      const intentional = !s.analyticFitFailure && (s.lineVisible === false || s.markerShape && s.markerShape !== 'none' || s.closed || s.breaks?.length || s.endpoints?.length || s.arrowSpecs?.length || s.handlesMath || s.segmentModes?.length);
      lines.push(`${name}: ${intentional ? '점 경로 유지' : '함수 복원 미완료'} · ${retainedReason(s)}`);
      continue;
    }
    const a = s.approximation;
    if (!a) { lines.push(`${name}: ${s.expression} · 원본 차이 측정값 없음`); continue; }
    const max = percent(a.maxDeviation), rms = percent(a.rmsDeviation);
    const measured = max && rms && ['normalized-display-distance', 'normalized-display'].includes(a.errorSpace);
    const metric = a.errorSpace === 'normalized-display-distance' ? '선 간 거리' : '세로 위치 차이';
    const contacts = Array.isArray(a.anchors) ? a.anchors.filter(p => p?.strong).length : 0;
    lines.push(`${name}: ${s.expression} · ${relationBased(s) ? '기준점으로 계수 계산' : a.coefficientSource==='relation-constrained-observations'?'관계 고정 · 나머지 계수 추정':a.coefficientSource==='relative-display-relations-estimated'?'상대 좌표 관계 고정 · 계수 추정':a.coefficientSource==='process-endpoints'?'과정 끝점으로 계산 (상대 좌표)':a.coefficientSource?.startsWith('relative-amplitude')?'물리 함수 모양 · 상대 높이 추정':'근사 식'}${contacts ? ` · 기준점 ${contacts}개 검수` : ' · 확정 기준점 없음'}${measured ? ` · ${metric} 최대 ${max}, RMS ${rms}` : ' · 원본 차이 측정값 없음'}`);
  }
  if (formulas.some(s => s.approximation)) lines.push('차이는 원본에서 인식한 선과 비교한 그래프 영역 비율입니다. 최초 자동 복원 기준이며 편집 후에는 다시 측정되지 않습니다.');
  return { formulaCount: formulas.length, relationCount, approximateCount, pointCount: points.length, geometryCount:geometry.length, retainedCurveCount:points.filter(s=>!isBasicGraphGeometry(s)).length, failedCount: failed, lines };
}

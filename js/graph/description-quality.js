import { compile } from '../function-graph/parser.js?v=1.7.0-four-session-integration';
import { auditGraphReconstructionQuality } from './reconstruction-quality.js?v=1.7.0-four-session-integration';

export const GRAPH_DESCRIPTION_QUALITY_VERSION = 'graph-description-quality-v1';
export const GRAPH_DESCRIPTION_SAMPLE_COUNT = 129;
const SAMPLE_LIMITATION = '유한 표본 검사이며 곡선 전체의 표시 여부·연속성·물리 법칙에 대한 수학적 증명은 아닙니다.';
const DISPLAY_EPSILON = 1e-9;
const finiteRange = range => Number.isFinite(range?.min) && Number.isFinite(range?.max) && range.max > range.min;
const validAxis = axis => finiteRange(axis) && (axis.scale !== 'log' || axis.min > 0);
const fraction = (value, axis) => axis.scale === 'log'
  ? (Math.log10(value) - Math.log10(axis.min)) / (Math.log10(axis.max) - Math.log10(axis.min))
  : (value - axis.min) / (axis.max - axis.min);
const inside = value => value >= -DISPLAY_EPSILON && value <= 1 + DISPLAY_EPSILON;

/** Description-only visibility audit, after validateGraphPlan. Pure and bounded:
 * no fitting, rescaling or mutation. Image reconstruction uses its own audit.
 * Visible/clipped/nonpositive-log/nonfinite categories partition the samples;
 * finiteSampleCount includes visible, clipped and nonpositive-log values.
 * Sample fractions do not measure curve length or the whole domain.
 */
export function auditGraphDescriptionQuality(plan) {
  const quality = auditGraphReconstructionQuality(plan);
  const issues = [...quality.issues], expressionSamples = [];
  for (const [index, series] of (plan?.series || []).entries()) {
    if (series?.kind !== 'expression' || !finiteRange(series.domain)) continue;
    const axis = series.axis || 'y', normalized = series.coordinateSpace === 'normalized';
    const xAxis = plan.axes?.x, yAxis = plan.axes?.[axis];
    if (!normalized && (!validAxis(xAxis) || !validAxis(yAxis))) continue;
    let evaluate;
    try { evaluate = compile(series.expression); }
    catch { continue; } // Existing audit retains the critical compile/domain issues.
    const { min, max } = series.domain;
    const logX = !normalized && xAxis.scale === 'log' && min > 0;
    const measured = { seriesId: series.id, axis, coordinateSpace: normalized ? 'normalized' : 'data',
      domain: { min, max }, xSampling: logX ? 'log' : 'linear', sampleCount: GRAPH_DESCRIPTION_SAMPLE_COUNT,
      finiteSampleCount: 0, visibleSampleCount: 0, clippedSampleCount: 0,
      nonpositiveLogSampleCount: 0, nonfiniteSampleCount: 0, visibleSampleFraction: 0 };
    for (let k = 0; k < GRAPH_DESCRIPTION_SAMPLE_COUNT; k++) {
      const t = k / (GRAPH_DESCRIPTION_SAMPLE_COUNT - 1);
      const x = k === 0 ? min : k === GRAPH_DESCRIPTION_SAMPLE_COUNT - 1 ? max
        : logX ? 10 ** (Math.log10(min) + (Math.log10(max) - Math.log10(min)) * t) : min + (max - min) * t;
      const y = evaluate(x);
      if (!Number.isFinite(y)) { measured.nonfiniteSampleCount++; continue; }
      measured.finiteSampleCount++;
      // Normalized zero is the axis minimum, including on logarithmic axes.
      if (!normalized && (xAxis.scale === 'log' && x <= 0 || yAxis.scale === 'log' && y <= 0)) {
        measured.nonpositiveLogSampleCount++; continue;
      }
      const fx = normalized ? x : fraction(x, xAxis), fy = normalized ? y : fraction(y, yAxis);
      if (inside(fx) && inside(fy)) measured.visibleSampleCount++;
      else measured.clippedSampleCount++;
    }
    measured.visibleSampleFraction = measured.visibleSampleCount / measured.sampleCount;
    expressionSamples.push(measured);
    const path = `series.${index}.expression`;
    const add = (code, message) => issues.push({ code, severity: 'review', path, message: `${message} ${SAMPLE_LIMITATION}` });
    if (measured.clippedSampleCount) add('DESCRIPTION_EXPRESSION_CLIPPED',
      `수식 계열 ${series.id}의 정의역 표본 ${measured.sampleCount}개 중 ${measured.clippedSampleCount}개가 x/${axis}축 표시 범위 밖으로 잘립니다. 전체를 보려면 축 범위나 정의역을 수정해 주세요. 의도한 잘림이면 현재 범위를 유지할 수 있습니다.`);
    if (measured.nonpositiveLogSampleCount) add('DESCRIPTION_EXPRESSION_LOG_NONPOSITIVE',
      `수식 계열 ${series.id}의 정의역 표본 ${measured.sampleCount}개 중 ${measured.nonpositiveLogSampleCount}개는 로그축에 표시할 수 없는 0 이하 값입니다. 수식·정의역·로그축 설정을 확인해 주세요.`);
    if (measured.nonfiniteSampleCount && !quality.issues.some(issue => issue.code === 'EXPRESSION_NONFINITE_SAMPLE' && issue.path === path))
      add('DESCRIPTION_EXPRESSION_NONFINITE_SAMPLE',
        `수식 계열 ${series.id}의 정의역 표본 ${measured.sampleCount}개 중 ${measured.nonfiniteSampleCount}개의 함수값이 유한하지 않습니다. 수식과 정의역에서 정의되지 않는 지점을 확인해 주세요.`);
  }
  return { ...quality,
    status: quality.status === 'fail' || issues.some(issue => issue.severity === 'critical') ? 'fail' : issues.length ? 'review' : 'pass',
    issues,
    metrics: { ...quality.metrics, descriptionExpressionSamples: expressionSamples },
    coverage: { ...quality.coverage, descriptionExpressionSampling: {
      version: GRAPH_DESCRIPTION_QUALITY_VERSION, samplesPerExpression: GRAPH_DESCRIPTION_SAMPLE_COUNT,
      expressionsChecked: expressionSamples.length, samplesChecked: expressionSamples.reduce((sum, row) => sum + row.sampleCount, 0),
      includesDomainEndpoints: true, mathematicalProof: false,
      meaning: `선형 x는 등간격, 데이터 좌표의 로그 x는 로그 간격으로 정의역을 검사합니다. 가시 비율은 곡선 길이나 정의역 전체의 비율이 아닌 표본 개수의 비율입니다. ${SAMPLE_LIMITATION}`,
    } },
  };
}

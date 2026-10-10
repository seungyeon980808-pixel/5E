import { summarizeAnalyticGraph } from '../js/graph/analytic-summary.js';

export function isPhysicsProviderUnavailable(message) {
  return /\b429\b|Too Many Requests|usage limit|rate.limit|quota exceeded|\b401\b|unauthori[sz]ed|provider unreachable|ENOTFOUND|ECONN(?:RESET|REFUSED)|AI 연결이 끊겼습니다/i.test(String(message || ''));
}

// Evaluation evidence only. Neither an editable result nor a physical-law proof.
export function auditPhysicsGraphResult(plan, { expectedAnalyticCurves, objects = [], sourceHeads, renderedHeads, fontEmbedded = null } = {}) {
  const analytic = summarizeAnalyticGraph(plan);
  const curves = (plan?.series || []).filter(s => ['expression', 'points'].includes(s.kind)).map(s => ({
    id: s.id, kind: s.kind, expression: s.kind === 'expression' ? s.expression : null,
    coefficientSource: s.approximation?.coefficientSource || null,
    anchorDeviation: s.approximation?.anchorDeviation ?? null,
    maxDeviation: s.approximation?.maxDeviation ?? null, rmsDeviation: s.approximation?.rmsDeviation ?? null,
    errorSpace: s.approximation?.errorSpace || null, failure: s.analyticFitFailure || null,
  }));
  const plane = objects.find(o => o.type === 'coordplane');
  const scale = plane?.w > 0 && plan?.source?.plotBox?.w > 0 ? plan.source.plotBox.w / plane.w : null;
  const expectedHeight = plan?.style?.fontSizePx;
  const heights = [];
  const addHeight = (id, inputPx, mm, mode) => {
    const actualPx = Number.isFinite(mm) && scale !== null ? mm * scale : null;
    heights.push({ id, inputPx, nativePx: actualPx, mode: mode || null,
      pass: !plane ? null : actualPx !== null && mode === 'source-height' && Math.abs(actualPx - inputPx) <= 1e-6 });
  };
  if (Number.isFinite(expectedHeight) && plan.style.labelSize === undefined) {
    for (const field of ['axisLabelSize', 'tickLabelSize', 'originLabelSize']) addHeight(field, expectedHeight, plane?.[field], plane?.reconstruction?.labelSizeMode);
  }
  for (const a of plan?.annotations || []) {
    if (!Number.isFinite(a.fontSizePx) || !a.text && !a.displayText && !a.displayMath) continue;
    const native = plane?.graphAnnotations?.find(n => n.id === a.id);
    addHeight(a.id, a.fontSizePx, native?.size, native?.labelSizeMode);
  }
  const sourceMeasured = sourceHeads?.applied === true && sourceHeads.measurements?.length > 0;
  const arrows = sourceMeasured ? sourceHeads.measurements.map(s => {
    const r = renderedHeads?.applied ? renderedHeads.measurements?.find(r => r.axis === s.axis) : null;
    return { axis: s.axis, sourceLengthPx: s.lengthPx, sourceWidthPx: s.widthPx,
      renderedLengthPx: r?.lengthPx ?? null, renderedWidthPx: r?.widthPx ?? null,
      pass: !r ? null : Math.abs(s.lengthPx - r.lengthPx) <= 2 && Math.abs(s.widthPx - r.widthPx) <= 2 };
  }) : [];
  return {
    schema: '5e.physics-graph-result-audit/v1', ...analytic, curves,
    expectedAnalyticCurves: Number.isInteger(expectedAnalyticCurves) ? expectedAnalyticCurves : null,
    expectedFormulaCountMet: Number.isInteger(expectedAnalyticCurves) ? analytic.formulaCount >= expectedAnalyticCurves : null,
    style: {
      fontEmbedded, labelHeights: heights, labelHeightMappingPass: plane && heights.length ? heights.every(h => h.pass) : null,
      labelHeightMeaning: 'Observed height preserved in native settings; original OCR and rendered ink height not measured here.',
      axisArrows: arrows, axisArrowSizePass: arrows.some(a => a.pass === false) ? false : arrows.length && arrows.every(a => a.pass === true) ? true : null,
      sourceArrowReason: sourceMeasured ? null : sourceHeads?.reason || 'not-measured',
      renderedArrowReason: renderedHeads?.applied ? null : renderedHeads?.reason || 'not-measured',
      pixelTolerance: 2,
    },
    visualAcceptance: false, physicalLawVerified: false, fakeBendsMeasured: false,
  };
}

import { compile } from '../function-graph/parser.js?v=1.7.0-four-session-integration';
import { isBasicGraphGeometry } from './analytic-summary.js?v=1.7.0-four-session-integration';

export const GRAPH_RECONSTRUCTION_QUALITY_VERSION = 'graph-reconstruction-quality-v2';
const array = value => Array.isArray(value) ? value : [];
const finitePoint = p => Number.isFinite(p?.x) && Number.isFinite(p?.y);
const finiteAxis = a => Number.isFinite(a?.min) && Number.isFinite(a?.max) && a.max > a.min && (a.scale !== 'log' || a.min > 0);
const fraction = (value, axis) => !finiteAxis(axis) ? null : axis.scale === 'log'
  ? value > 0 ? (Math.log(value) - Math.log(axis.min)) / (Math.log(axis.max) - Math.log(axis.min)) : null
  : (value - axis.min) / (axis.max - axis.min);
const fromFraction = (value, axis) => !finiteAxis(axis) ? null : axis.scale === 'log'
  ? Math.exp(Math.log(axis.min) + value * (Math.log(axis.max) - Math.log(axis.min)))
  : axis.min + value * (axis.max - axis.min);
const displayPoint = (p, space, plan, axis = 'y') => {
  if (!finitePoint(p)) return null;
  if (space === 'normalized') return { x: p.x, y: p.y };
  const x = fraction(p.x, plan.axes?.x), y = fraction(p.y, plan.axes?.[axis]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};
const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;

/** Audits explicit plan relationships, not JSON/schema validity or pixel fidelity.
 * Call after validateGraphPlan. No input mutation, state, DOM, network or fitting.
 * Optional reference/expect: {requiredElements:[{role,id?,axis?,text?,minCount?}]}.
 * A pass means only the checks described in coverage passed; visualAcceptance
 * and physicalLawVerified are always false, even with an element inventory.
 */
export function auditGraphReconstructionQuality(plan, { reference, expect } = {}) {
  const issues = [], series = array(plan?.series), annotations = array(plan?.annotations);
  const metrics = { seriesCount: series.length, expressionCount: 0, basicGeometryCount: 0, fallbackCount: 0,
    linkedContactsChecked: 0, strongAnchorsChecked: 0, declaredRelationsChecked: 0, sampledExpressions: 0,
    referenceElementsChecked: 0, observationComparisons: [], recordedFitMeasurements: [] };
  const add = (code, severity, path, message) => issues.push({ code, severity, path, message });
  const sourceBox = plan?.source?.plotBox;
  // Pixel alignment tolerance applies only when a real source frame is present.
  const relationTolerance = sourceBox?.w > 0 && sourceBox?.h > 0 ? Math.max(1e-6, 2 / Math.min(sourceBox.w, sourceBox.h)) : 1e-6;
  const evaluators = new Map();
  const byId = new Map(series.map((s, i) => [s?.id, { series: s, index: i }]));
  if (!plan || typeof plan !== 'object') add('PLAN_UNAVAILABLE', 'review', '$', 'No graph plan is available for relationship audit.');
  series.forEach((s, i) => {
    if (!s || typeof s !== 'object') return;
    const path = `series.${i}`;
    if (isBasicGraphGeometry(s)) metrics.basicGeometryCount++;
    const unresolvedSmooth = s.kind === 'points' && s.lineVisible !== false
      && (s.curveStyle === 'smooth' || array(s.segmentModes).includes('smooth') || s.handlesMath);
    if (!isBasicGraphGeometry(s) && s.kind !== 'bar' && (s.analyticFitFailure || unresolvedSmooth)) {
      metrics.fallbackCount++;
      add('ANALYTIC_FALLBACK', 'review', s.analyticFitFailure ? `${path}.analyticFitFailure` : path,
        `Incomplete analytic reconstruction: editable observations retained. ${s.analyticFitFailure || 'No analytic expression resolved for the smooth curve.'}`);
    }
    if (s.kind !== 'expression') return;
    metrics.expressionCount++;
    const domain = s.domain;
    if (!Number.isFinite(domain?.min) || !Number.isFinite(domain?.max) || domain.max <= domain.min) {
      add('EXPRESSION_DOMAIN_INVALID', 'critical', `${path}.domain`, 'Expression has no finite increasing domain.'); return;
    }
    let f;
    try { f = compile(s.expression); }
    catch { add('EXPRESSION_UNEVALUABLE', 'critical', `${path}.expression`, 'The saved expression cannot be evaluated.'); return; }
    evaluators.set(s.id, f);
    metrics.sampledExpressions++;
    let nonfinite = 0;
    // This finite sample is not a proof of continuity, shape or physical law.
    for (let k = 0; k <= 64; k++) if (!Number.isFinite(f(domain.min + (domain.max - domain.min) * k / 64))) nonfinite++;
    if (nonfinite) add('EXPRESSION_NONFINITE_SAMPLE', s.approximation ? 'critical' : 'review', `${path}.expression`, `Expression is undefined at ${nonfinite} of 65 domain samples; inspect discontinuities.`);
    const a = s.approximation;
    if (a) {
      metrics.recordedFitMeasurements.push({ seriesId: s.id, maxDeviation: a.maxDeviation ?? null, rmsDeviation: a.rmsDeviation ?? null, anchorDeviation: a.anchorDeviation ?? null, errorSpace: a.errorSpace ?? null, meaning: 'Recorded fitter report, not remeasured source-pixel fidelity.' });
      for (const [j, anchor] of array(a.anchors).entries()) {
        if (anchor?.strong !== true || !finitePoint(anchor)) continue;
        if (anchor.x < domain.min || anchor.x > domain.max) {
          add('STRONG_ANCHOR_OUTSIDE_DOMAIN', 'critical', `${path}.approximation.anchors.${j}`, 'Strong reference contact lies outside the saved expression domain.'); continue;
        }
        const y = f(anchor.x), actual = displayPoint({ x: anchor.x, y }, s.coordinateSpace, plan, s.axis);
        const expected = displayPoint(anchor, s.coordinateSpace, plan, s.axis);
        const error = distance(actual, expected);
        metrics.strongAnchorsChecked++;
        if (!Number.isFinite(y) || error !== null && error > 1e-7) add('STRONG_ANCHOR_MISMATCH', 'critical', `${path}.approximation.anchors.${j}`, 'Saved expression does not pass through its explicitly strong reference contact.');
        else if (error === null) add('ANCHOR_COORDINATES_UNVERIFIED', 'review', `${path}.approximation.anchors.${j}`, 'Reference contact cannot be compared without a finite axis mapping.');
      }
      if (Number.isFinite(a.anchorDeviation) && a.anchorDeviation > 1e-7 && array(a.anchors).some(p => p?.strong === true))
        add('REPORTED_ANCHOR_MISMATCH', 'critical', `${path}.approximation.anchorDeviation`, 'The recorded error already reports a mismatch at a strong reference contact.');
      const comparisons = [];
      for (const p of array(s.observedPoints)) {
        if (!finitePoint(p)) continue;
        const actual = displayPoint({ x: p.x, y: f(p.x) }, s.coordinateSpace, plan, s.axis);
        const expected = displayPoint(p, s.coordinateSpace, plan, s.axis);
        if (actual && expected) comparisons.push(Math.abs(actual.y - expected.y));
      }
      if (comparisons.length) {
        const maxDeviation = Math.max(...comparisons), rmsDeviation = Math.sqrt(comparisons.reduce((n, v) => n + v * v, 0) / comparisons.length);
        metrics.observationComparisons.push({ seriesId: s.id, samples: comparisons.length, maxDeviation, rmsDeviation,
          errorSpace: 'normalized-display-vertical-at-observed-x', meaning: 'Saved formula compared with recognized observations; original pixels and interior curve shape not measured.' });
        // Distance-based fits may move horizontally. Their perpendicular-distance
        // metrics cannot be compared with this vertical-error measurement.
        if (a.errorSpace === 'normalized-display' && Number.isFinite(a.tolerance) && maxDeviation > a.tolerance + 1e-6)
          add('OBSERVATION_SHAPE_DEVIATION', 'critical', `${path}.observedPoints`, 'Formula differs from saved observations beyond its declared vertical fitting tolerance.');
      } else add('OBSERVATION_SHAPE_UNMEASURED', 'review', `${path}.observedPoints`, 'No comparable recognized observations were available for the approximate formula.');
      if (a.coefficientSource === 'relative-diagram-amplitude-period-phase')
        add('RELATIVE_FORMULA_REVIEW', 'review', `${path}.approximation`, 'Relative amplitude, period and phase describe an image approximation, not an identified physical law.');
    }
  });
  // Explicit tick-pair contacts are geometry obligations. Comparing them does
  // not establish that tick OCR, units or the proposed physical family is true.
  series.forEach((s, i) => {
    if (!s) return;
    for (const [j, relation] of array(s.relationAnchors).entries()) {
      const axis = s.axis || 'y';
      const tick = (key, text) => array(plan?.axes?.[key]?.ticks).find(t => [t?.label, t?.displayMath].includes(text));
      const xTick = tick('x', relation?.xTickLabel), yTick = tick(axis, relation?.yTickLabel);
      const position = (t, key) => Number.isFinite(t?.position) ? t.position : Number.isFinite(t?.value) ? fraction(t.value, plan?.axes?.[key]) : null;
      const target = { x: position(xTick, 'x'), y: position(yTick, axis) };
      const path = `series.${i}.relationAnchors.${j}`;
      if (!finitePoint(target)) { add('RELATION_CONTACT_UNVERIFIED', 'review', path, 'Tick-pair contact has no comparable axis position.'); continue; }
      let actual = null;
      if (evaluators.has(s.id)) {
        const x = s.coordinateSpace === 'normalized' ? target.x : fromFraction(target.x, plan?.axes?.x);
        if (Number.isFinite(x) && x >= s.domain.min && x <= s.domain.max) actual = displayPoint({ x, y: evaluators.get(s.id)(x) }, s.coordinateSpace, plan, axis);
      } else {
        const points = array(s.points).map(p => displayPoint(p, s.coordinateSpace, plan, axis));
        // Exact source anchors can be checked even on smooth/controlled paths.
        actual = points.find(p => p && Math.abs(p.x - target.x) < 1e-9) || null;
        if (!actual && s.kind === 'points' && s.curveStyle !== 'smooth' && !s.handlesMath && !array(s.segmentModes).includes('smooth')) {
          for (let k = 1; k < points.length; k++) {
            const a = points[k - 1], b = points[k];
            if (!a || !b || array(s.breaks).includes(k) || b.x <= a.x || target.x < a.x || target.x > b.x) continue;
            actual = { x: target.x, y: a.y + (b.y - a.y) * (target.x - a.x) / (b.x - a.x) }; break;
          }
        }
      }
      if (!actual) { add('RELATION_CONTACT_UNVERIFIED', 'review', path, 'Tick-pair contact could not be verified on the explicitly saved geometry.'); continue; }
      metrics.declaredRelationsChecked++;
      if (distance(actual, target) > relationTolerance) add('RELATION_CONTACT_MISMATCH', 'critical', path, 'Saved geometry does not pass through its explicit tick-pair reference contact.');
    }
  });
  annotations.forEach((a, i) => {
    if (!a || !['point', 'guide', 'leader', 'arrow'].includes(a.kind)) return;
    const path = `annotations.${i}`, axis = a.axis || 'y', space = a.coordinateSpace || 'data';
    const start = displayPoint(a, space, plan, axis), end = displayPoint(a.to, space, plan, axis);
    if (a.kind === 'guide' && start && end && ['horizontal', 'vertical'].includes(a.orientation)) {
      const delta = a.orientation === 'horizontal' ? Math.abs(start.y - end.y) : Math.abs(start.x - end.x);
      if (delta > relationTolerance) add('GUIDE_DIRECTION_MISMATCH', 'critical', `${path}.to`, 'Explicit guide endpoints disagree with its stated horizontal/vertical direction.');
    }
    if (!a.seriesId) return;
    const entry = byId.get(a.seriesId);
    if (!entry) { add('CONTACT_SERIES_MISSING', 'critical', `${path}.seriesId`, 'An explicit contact refers to a missing series.'); return; }
    const s = entry.series;
    if ((s.axis || 'y') !== axis) { add('CONTACT_AXIS_MISMATCH', 'critical', `${path}.axis`, 'Linked annotation and series use different value axes.'); return; }
    let target = null;
    if (Number.isInteger(a.pointIndex)) target = displayPoint(array(s.points)[a.pointIndex], s.coordinateSpace, plan, axis);
    else if (Number.isFinite(a.anchorX) && evaluators.has(s.id)) {
      const x = s.coordinateSpace === space ? a.anchorX : space === 'normalized' ? fromFraction(a.anchorX, plan.axes?.x) : fraction(a.anchorX, plan.axes?.x);
      if (Number.isFinite(x) && (x < s.domain.min || x > s.domain.max)) { add('CONTACT_OUTSIDE_DOMAIN', 'critical', `${path}.anchorX`, 'Explicit formula contact is outside its saved domain.'); return; }
      target = displayPoint({ x, y: evaluators.get(s.id)(x) }, s.coordinateSpace, plan, axis);
    } else return; // Labels without a stated contact may legitimately be offset.
    if (!target) { add('CONTACT_UNVERIFIED', 'review', path, 'The explicitly linked contact has no comparable point or axis mapping.'); return; }
    const candidates = a.kind === 'leader' ? [end] : a.kind === 'guide' ? [start, end] : [start];
    // A guide can extend past a linked contact. Compare its finite segment
    // without shortening or otherwise changing the saved endpoints.
    if (a.kind === 'guide' && start && end) {
      const dx = end.x - start.x, dy = end.y - start.y, lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared ? Math.max(0, Math.min(1, ((target.x - start.x) * dx + (target.y - start.y) * dy) / lengthSquared)) : 0;
      candidates.push({ x: start.x + t * dx, y: start.y + t * dy });
    }
    const errors = candidates.map(p => distance(p, target)).filter(Number.isFinite);
    if (!errors.length) { add('CONTACT_UNVERIFIED', 'review', path, 'Linked annotation coordinates cannot be compared.'); return; }
    metrics.linkedContactsChecked++;
    if (Math.min(...errors) > relationTolerance) add('CONTACT_POSITION_MISMATCH', 'critical', path, 'Explicit annotation contact does not meet its linked point or formula anchor.');
  });
  // Explicit end labels and separate labels for the same series can both render.
  series.forEach((s, i) => {
    if (typeof s?.endLabel !== 'string' || !s.endLabel.trim()) return;
    if (annotations.some(a => a?.seriesId === s.id && a.kind === 'text' && [a.text, a.displayText, a.displayMath].includes(s.endLabel)))
      add('DUPLICATE_END_LABEL', 'review', `series.${i}.endLabel`, 'The same explicit end label also exists as a linked text annotation; inspect duplication.');
  });
  const inventory = buildInventory(plan, series, annotations);
  const required = array((reference || expect)?.requiredElements);
  required.forEach((r, i) => {
    if (!r || typeof r.role !== 'string') return;
    const available = inventory.filter(e => e.role === r.role && (r.id === undefined || e.id === r.id) && (r.axis === undefined || e.axis === r.axis) && (r.text === undefined || e.text === r.text));
    const count = Number.isInteger(r.minCount) && r.minCount >= 0 ? r.minCount : 1;
    metrics.referenceElementsChecked++;
    if (available.length < count) add('REQUIRED_ELEMENT_MISSING', 'critical', `reference.requiredElements.${i}`, `Required ${r.role} element is missing (${available.length}/${count}).`);
  });
  return { version: GRAPH_RECONSTRUCTION_QUALITY_VERSION,
    status: issues.some(i => i.severity === 'critical') ? 'fail' : issues.length ? 'review' : 'pass', issues, metrics, inventory,
    coverage: { schemaValidation: 'not-performed', explicitRelationships: true, referenceInventory: required.length > 0,
      originalPixels: false, completeVisualMatch: false, physicalLaw: false },
    visualAcceptance: false, physicalLawVerified: false,
    meaning: 'Pass applies only to audited explicit plan relationships and any supplied required element inventory; it is not approval of original-image fidelity.' };
}

function buildInventory(plan, series, annotations) {
  const items = [], add = (role, values = {}) => items.push({ role, ...values });
  for (const [axis, spec] of Object.entries(plan?.axes || {})) {
    if (!spec || typeof spec !== 'object') continue;
    add('axis', { axis });
    const title = spec.displayTitle ?? spec.displayMath ?? spec.title;
    if (typeof title === 'string' && title.trim()) add('title', { axis, text: title });
    array(spec.ticks).forEach(t => add('tick', { axis, text: t?.displayMath ?? t?.label }));
  }
  if (plan?.frame?.variant === 'box') add('frame', { variant: 'box' });
  if (plan?.grid && (plan.grid.xStep > 0 || plan.grid.yStep > 0)) add('grid');
  for (const [field, axis] of [['arrowX', 'x'], ['arrowY', 'y'], ['arrowY2', 'y2']]) if (plan?.frame?.[field] === true) add('arrow', { axis });
  series.forEach(s => {
    if (!s) return;
    add('series', { id: s.id, kind: s.kind });
    const label = s.endLabel ?? s.label;
    if (typeof label === 'string' && label.trim()) add('title', { id: s.id, text: label });
    array(s.arrowSpecs).forEach(() => add('arrow', { id: s.id, axis: s.axis || 'y' }));
    array(s.endpoints).forEach(() => add('point', { id: s.id, axis: s.axis || 'y' }));
  });
  annotations.forEach(a => {
    if (!a) return;
    if (['guide', 'arrow', 'point', 'legend'].includes(a.kind)) add(a.kind, { id: a.id, axis: a.axis || 'y' });
    if (a.kind === 'text' && [a.text, a.displayText, a.displayMath].some(t => typeof t === 'string' && t.trim())) add('title', { id: a.id, text: a.displayMath ?? a.displayText ?? a.text });
  });
  array(plan?.regions).forEach(r => add('region', { id: r?.id }));
  array(plan?.legends).forEach(l => add('legend', { id: l?.id }));
  return items;
}

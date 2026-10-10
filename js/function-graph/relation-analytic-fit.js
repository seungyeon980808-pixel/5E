/* A bounded, relation-constrained fallback for editable approximate formulas.
 * Exact printed/contact constraints are eliminated before fitting the remaining
 * coefficients. Samples remain evidence, not the definition of a saved curve. */
import { compile, tokenize, parse, FUNCS } from './parser.js?v=1.7.0-four-session-integration';
import { PHYSICS_LIMITS, measurePhysicsCandidate, solvePhysicsCoefficients, collectPhysicsAnchors, physicsDisplayMap } from './physics-fit.js?v=1.7.0-four-session-integration';
import { shapePreservingHandles, sampleShapeSegment } from './shape-preserving.js?v=1.7.0-four-session-integration';

export const RELATION_ANALYTIC_FIT_VERSION = 'relation-analytic-fit-v1';
const clone = value => JSON.parse(JSON.stringify(value));
const finite = Number.isFinite;
const MAX_POINTS = 512, MAX_EXPRESSION = 320, MAX_ANNOTATIONS = 256;
// Source endpoints + linked annotations + relation declarations + tick-derived
// contacts + two possible origin contacts, all within their source budgets.
const MAX_CONTACTS = MAX_POINTS + MAX_ANNOTATIONS + 256 + 64 + 2;
const number = value => {
  if (!finite(value)) throw Error('Nonfinite coefficient');
  if (Math.abs(value) < 1e-14) return '0';
  let text = String(Number(value.toPrecision(13)));
  if (!/[eE]/.test(text)) return text;
  const [mantissa, exponent] = text.split('e'), negative = mantissa.startsWith('-');
  const [whole, fraction = ''] = (negative ? mantissa.slice(1) : mantissa).split('.');
  const digits = whole + fraction, place = whole.length + Number(exponent);
  text = place <= 0 ? '0.' + '0'.repeat(-place) + digits : place >= digits.length ? digits + '0'.repeat(place - digits.length) : digits.slice(0, place) + '.' + digits.slice(place);
  return (negative ? '-' : '') + text;
};
const shift = value => value ? `(x-(${number(value)}))` : 'x';
const equation = (coefficients, terms) => coefficients.map((value, i) => Math.abs(value) < 1e-13 ? '' : `(${number(value)})${terms[i] ? `*(${terms[i]})` : ''}`).filter(Boolean).join('+') || '0';
const unique = values => [...new Set(values.filter(finite))];
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function eligible(series, points = series?.points) {
  if (!series || series.certainty !== 'observed' || !['data', 'normalized'].includes(series.coordinateSpace) || series.physicsModel || series.closed || series.breaks?.length || series.lineVisible === false || series.markerShape && series.markerShape !== 'none' || series.handlesMath || series.segmentModes?.length) return false;
  return Array.isArray(points) && points.length >= 2 && !(series.curveStyle === 'straight' && points.length === 2) && points.length <= MAX_POINTS && points.every((p, i) => p && finite(p.x) && finite(p.y) && (!i || p.x > points[i - 1].x));
}

// Unknown axes stay unknown in the result. The temporary [0,1] axes below are
// only a measuring frame; no physical unit or exact-data claim is introduced.
function measuringPlan(plan, series) {
  if (series.coordinateSpace === 'data') return physicsDisplayMap(plan, series.axis || 'y') ? plan : null;
  if (plan.coordinateMode !== 'observed') return null;
  const axes = {};
  for (const key of ['x', series.axis || 'y']) axes[key] = { ...plan.axes?.[key], scale: 'linear', min: 0, max: 1,
    ticks: (plan.axes?.[key]?.ticks || []).filter(t => finite(t.position)).map(t => ({ ...t, value: t.position, valueSource: 'relative-display-contact' })) };
  // Numerical zero in this measuring frame is the frame edge, which need not
  // be the drawn origin. Do not let the physical-zero helper conflate them.
  const annotations = (plan.annotations || []).filter(a => !(a.kind === 'text' && /^[0O]$/.test(String(a.text || a.displayMath || '').trim())));
  return { ...plan, axes: { ...plan.axes, ...axes }, annotations };
}

function contacts(plan, series, index) {
  if (series.endpoints !== undefined && (!Array.isArray(series.endpoints) || series.endpoints.length > MAX_POINTS)) return null;
  const measured = measuringPlan(plan, series), map = measured && physicsDisplayMap(measured, series.axis || 'y');
  if (!map) return null;
  const anchors = collectPhysicsAnchors(measured, { ...series, points: series.points }, index, map).map(a => ({ ...a }));
  // Visible source markers are contacts even when their absolute units are
  // unknown. They must not drift because a fitted curve is only approximate.
  for (const endpoint of series.endpoints || []) {
    if (!endpoint || typeof endpoint !== 'object' || !Number.isInteger(endpoint.index) || endpoint.index < 0 || !['open', 'closed'].includes(endpoint.kind)) return null;
    const point = series.points[endpoint.index]; if (!point) return null;
    anchors.push({ x: point.x, y: point.y, strong: true, sourceEndpoint: endpoint.index });
  }
  if (anchors.length > MAX_CONTACTS) return null;
  const axisY = series.coordinateSpace === 'normalized' ? plan.axisPlacement?.x?.value ?? 0 : 0;
  return { measured, map, anchors, axisY };
}

function waveFacts(points, anchors, map, axisY) {
  const spread = Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y));
  if (spread / (map.ymax - map.ymin) < .08 || points.length < 9) return null;
  const high = Math.max(...points.map(p => p.y)), low = Math.min(...points.map(p => p.y));
  const peaks = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], left = points[i - 1], right = points[i + 1];
    if (high - p.y > spread * .08 || left && p.y < left.y || right && p.y < right.y || left && right && p.y === left.y && p.y === right.y) continue;
    const exact = anchors.filter(a => a.strong && Math.abs(map.X(a.x) - map.X(p.x)) < .018 && Math.abs(map.Y(a.y) - map.Y(p.y)) < .018).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    peaks.push({ x: exact?.x ?? p.x, y: exact?.y ?? p.y });
  }
  if (peaks.length < 2) return null;
  const periods = peaks.slice(1).map((p, i) => p.x - peaks[i].x); let period = median(periods);
  if (!(period > 0) || periods.some(p => Math.abs(p / period - 1) > .10)) return null;
  const strongPeak = anchors.find(a => a.strong && peaks.some(p => Math.abs(map.X(a.x) - map.X(p.x)) < .018 && Math.abs(map.Y(a.y) - map.Y(p.y)) < .018));
  let phase = strongPeak?.x ?? peaks[0].x;
  // Exact zero contacts carry phase/period information even if the printed
  // height has no numerical tick. Calibrated samples can differ from their tick
  // by a rounded pixel; never turn that rounding into a conflicting period.
  const axisContacts = unique(anchors.filter(a => a.strong && Math.abs(map.Y(a.y) - map.Y(axisY)) < 1e-9).filter(a => {
    const near = points.reduce((best, p) => Math.abs(p.x - a.x) < Math.abs(best.x - a.x) ? p : best);
    return Math.abs(map.X(near.x) - map.X(a.x)) < .018 && Math.abs(map.Y(near.y) - map.Y(axisY)) < .012;
  }).map(a => a.x)).sort((a, b) => a - b);
  if (axisContacts.length >= 2) {
    const gaps = axisContacts.slice(1).map((x, i) => x - axisContacts[i]), contactPeriod = median(gaps);
    if (Math.abs(contactPeriod / period - 1) < .10 && gaps.every(gap => Math.abs(gap / contactPeriod - 1) < 1e-8)) { period = contactPeriod; phase = axisContacts[0] - period / 2; }
  }
  const zeroContacts = [];
  if (Math.abs(map.Y(low) - map.Y(axisY)) <= .012) {
    for (let k = Math.ceil((points[0].x - phase) / period - .5); phase + (k + .5) * period <= points.at(-1).x + 1e-10; k++) {
      const x = phase + (k + .5) * period;
      const near = points.reduce((best, p) => Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best);
      if (Math.abs(map.X(near.x) - map.X(x)) <= .035 && Math.abs(map.Y(near.y) - map.Y(axisY)) <= .012) zeroContacts.push({ x, y: axisY, strong: true, derived: 'periodic-axis-contact' });
    }
  }
  const peakContacts = [];
  if (zeroContacts.length && peaks.every(p => Math.abs(map.Y(p.y) - map.Y(high)) < .012)) {
    const height = strongPeak?.y ?? median(peaks.map(p => p.y));
    for (let k = Math.ceil((points[0].x - phase) / period); phase + k * period <= points.at(-1).x + period * .0001; k++) peakContacts.push({ x: phase + k * period, y: height, strong: true, derived: 'periodic-common-height-observed' });
  }
  return { period, phase, zeroContacts, peakContacts };
}

function basisFor(model, points) {
  const lo = points[0].x, hi = points.at(-1).x, span = hi - lo;
  if (!model || !(span > 0)) return null;
  const family = model.family, origin = model.origin ?? lo, parameter = model.parameter;
  if (family === 'linear') return { bases: [() => 1, x => x], terms: ['', 'x'] };
  if (family === 'quadratic') return { bases: [() => 1, x => x, x => x * x], terms: ['', 'x', 'x^2'] };
  if (['reciprocal', 'inverse-square', 'shifted-sqrt', 'sqrt-quadratic', 'logarithmic'].includes(family)) {
    if (!finite(origin) || origin < lo - span * 6 || origin > hi + span * 6) return null;
    const direction = model.direction;
    if (['reciprocal', 'inverse-square'].includes(family)) {
      if (origin >= lo && origin <= hi) return null;
      const power = family === 'reciprocal' ? 1 : 2, term = `1/${shift(origin)}${power === 2 ? '^2' : ''}`;
      return { bases: [() => 1, x => 1 / (x - origin) ** power], terms: ['', term] };
    }
    if (![1, -1].includes(direction) || points.some(p => direction * (p.x - origin) < -1e-12)) return null;
    const body = direction === 1 ? shift(origin) : `(-${shift(origin)})`;
    if (family === 'logarithmic') {
      if (points.some(p => direction * (p.x - origin) <= 0)) return null;
      return { bases: [() => 1, x => Math.log(direction * (x - origin))], terms: ['', `ln(${body})`] };
    }
    const root = x => Math.sqrt(Math.max(0, direction * (x - origin)));
    return family === 'sqrt-quadratic' ? { bases: [() => 1, root, x => x], terms: ['', `sqrt(${body})`, 'x'] } : { bases: [() => 1, root], terms: ['', `sqrt(${body})`] };
  }
  if (family === 'exponential') {
    if (!finite(parameter) || Math.abs(parameter * span) < .01 || Math.abs(parameter * span) > 12 || origin !== lo) return null;
    return { bases: [() => 1, x => Math.exp(parameter * (x - origin))], terms: ['', `exp(${number(parameter)}*${shift(origin)})`] };
  }
  if (['cosine-square', 'sinusoidal'].includes(family)) {
    if (!finite(parameter) || parameter < span / 8 || parameter > span * 4 || !finite(origin) || origin < lo - span * 4 || origin > hi + span * 4) return null;
    const argument = `${family === 'cosine-square' ? '' : '2*'}pi*${shift(origin)}/${number(parameter)}`;
    if (family === 'sinusoidal' && model.phaseFree === true) return { bases: [() => 1, x => Math.sin(2 * Math.PI * (x - origin) / parameter), x => Math.cos(2 * Math.PI * (x - origin) / parameter)], terms: ['', `sin(${argument})`, `cos(${argument})`] };
    return { bases: [() => 1, x => family === 'cosine-square' ? Math.cos(Math.PI * (x - origin) / parameter) ** 2 : Math.cos(2 * Math.PI * (x - origin) / parameter)], terms: ['', `cos(${argument})${family === 'cosine-square' ? '^2' : ''}`] };
  }
  return null;
}

function proposalAllowed(expression, points) {
  if (typeof expression !== 'string' || expression.length > MAX_EXPRESSION || /\b(?:floor|ceil|round|tan|asin|acos|atan|sinh|cosh|tanh)\b/i.test(expression)) return false;
  const identifiers = expression.match(/[a-zA-Z]+/g) || [];
  if (identifiers.some(id => !['x', 'pi', 'e', 'sin', 'cos', 'sqrt', 'exp', 'ln', 'log', 'abs', 'sign'].includes(id.toLowerCase())) || identifiers.filter(id => ['sin', 'cos', 'sqrt', 'exp', 'ln', 'log', 'abs', 'sign'].includes(id)).length > 6 || (expression.match(/\bx\b/gi) || []).length > 8 || (expression.match(/\^/g) || []).length > 3) return false;
  const powers = [...expression.matchAll(/\^\s*\(?\s*([+-]?\d+(?:\.\d+)?)/g)].map(m => Number(m[1]));
  if (powers.some(p => Math.abs(p) > 3)) return false;
  let f; try {
    f = compile(expression);
    const tokens = tokenize(expression), explicit = [];
    const end = t => t && (t.t === 'num' || t.v === ')' || ['x', 'pi', 'e'].includes(t.v));
    const start = t => t && (t.t === 'num' || t.t === 'id' || t.v === '(');
    tokens.forEach((t, i) => { explicit.push(t); if (end(t) && start(tokens[i + 1])) explicit.push({ t: 'op', v: '*' }); });
    const affine = node => {
      if (node.t === 'num' || node.t === 'const') return [0, node.v];
      if (node.t === 'var') return [1, 0];
      if (node.t === 'unary') { const a = affine(node.a); return a && a.map(v => v * (node.op === '-' ? -1 : 1)); }
      if (node.t === 'call') { const a = affine(node.a); return a && !a[0] ? [0, FUNCS[node.fn](a[1])] : null; }
      if (node.t !== 'bin') return null;
      const a = affine(node.a), b = affine(node.b); if (!a || !b) return null;
      if (node.op === '+' || node.op === '-') return [a[0] + (node.op === '+' ? b[0] : -b[0]), a[1] + (node.op === '+' ? b[1] : -b[1])];
      if (node.op === '*' && (!a[0] || !b[0])) return !a[0] ? b.map(v => v * a[1]) : a.map(v => v * b[1]);
      if (node.op === '/' && !b[0] && b[1]) return a.map(v => v / b[1]);
      if (node.op === '^' && !a[0] && !b[0]) return [0, a[1] ** b[1]];
      return null;
    };
    const span = points.at(-1).x - points[0].x;
    const bounded = (node, depth = 0) => {
      if (depth > 20) return false;
      if (node.t === 'call' && ['sin', 'cos', 'exp'].includes(node.fn)) {
        const linear = affine(node.a);
        if (!linear || !linear.every(finite) || Math.abs(linear[0] * span) > (node.fn === 'exp' ? 24 : 16 * Math.PI)) return false;
      }
      return (!node.a || bounded(node.a, depth + 1)) && (!node.b || bounded(node.b, depth + 1));
    };
    if (!bounded(parse(explicit))) return false;
  } catch { return false; }
  // Irrational probes cannot be hidden by adding an oscillation that aliases
  // all source samples. Bounded turn count also rejects high-frequency fits.
  let turns = 0, sign = 0, previous = null, base = null;
  const lo = points[0].x, span = points.at(-1).x - lo;
  for (let i = 0; i <= 1536; i++) {
    const x = lo + span * (i === 1536 ? 1 : (i + .211324865405187) / 1536), value = f(x);
    if (!finite(value)) return false;
    if (previous !== null) { const delta = value - previous, next = Math.sign(delta); if (next && sign && next !== sign) turns++; if (next) sign = next; }
    previous = value; base ??= value;
  }
  return turns <= 18;
}

function fitModel(model, points, anchors, facts) {
  if (model.kind === 'proposal') {
    if (!proposalAllowed(model.expression, points)) return null;
    return { model, expression: model.expression, family: 'candidate-expression', parameterCount: 0 };
  }
  if (model.family === 'cosine-square' && !facts?.zeroContacts.length) return null;
  const basis = basisFor(model, points); if (!basis) return null;
  const extra = model.family === 'cosine-square' && facts && Math.abs(facts.period - model.parameter) < 1e-10 && Math.abs(facts.phase - model.origin) < 1e-10 ? [...facts.zeroContacts, ...facts.peakContacts] : [];
  const coefficients = solvePhysicsCoefficients(points, basis.bases, [...anchors, ...extra], { allowRelativeResidual: true });
  if (!coefficients) return null;
  const expression = equation(coefficients, basis.terms);
  if (expression.length > MAX_EXPRESSION) return null;
  return { model, expression, family: model.family, parameterCount: basis.bases.length, extraAnchors: extra };
}

// Cheap perpendicular-distance proxy only ranks candidates. Final acceptance
// always uses the independent bidirectional dense measurement below.
function proxy(candidate, points, map, anchors) {
  let f; try { f = compile(candidate.expression); } catch { return Infinity; }
  for (const a of [...anchors, ...(candidate.extraAnchors || [])]) if (a.strong && (!finite(f(a.x)) || Math.abs(map.Y(f(a.x)) - map.Y(a.y)) > PHYSICS_LIMITS.anchorDistance)) return Infinity;
  const dx = (map.xmax - map.xmin) * 1e-5;
  let sum = 0;
  for (const p of points) {
    const value = f(p.x); if (!finite(value)) return Infinity;
    const a = f(p.x - dx), b = f(p.x + dx), slope = finite(a) && finite(b) ? (b - a) / (2 * dx) * (map.xmax - map.xmin) / (map.ymax - map.ymin) : 0;
    sum += ((map.Y(value) - map.Y(p.y)) / Math.sqrt(1 + slope * slope)) ** 2;
  }
  return Math.sqrt(sum / points.length);
}

function candidates(series, context) {
  const points = series.points, lo = points[0].x, hi = points.at(-1).x, span = hi - lo, { anchors, map, measured, axisY } = context;
  const facts = waveFacts(points, anchors, map, axisY), out = [], seen = new Set();
  const add = model => {
    const candidate = fitModel(model, points, anchors, facts);
    if (!candidate || seen.has(candidate.expression)) return;
    seen.add(candidate.expression); candidate.proxy = proxy(candidate, points, map, anchors);
    if (finite(candidate.proxy)) out.push(candidate);
  };
  if (series.candidateExpression) add({ kind: 'proposal', expression: series.candidateExpression });
  add({ kind: 'library', family: 'linear' });
  if (series.curveStyle !== 'smooth') return out;
  add({ kind: 'library', family: 'quadratic' });
  if (facts) {
    if (facts.zeroContacts.length) add({ kind: 'library', family: 'cosine-square', origin: facts.phase, parameter: facts.period });
    add({ kind: 'library', family: 'sinusoidal', origin: facts.phase, parameter: facts.period });
    add({ kind: 'library', family: 'sinusoidal', origin: lo, parameter: facts.period, phaseFree: true });
  }
  const strong = [...new Map(anchors.filter(a => a.strong).map(a => [a.x + ',' + a.y, a])).values()].sort((a, b) => a.x - b.x);
  for (let i = 0; i < strong.length - 1; i++) for (let j = i + 1; j < Math.min(strong.length, i + 4); j++) if (Math.abs(map.Y(strong[i].y) - map.Y(strong[j].y)) < 1e-9) {
    for (const multiplier of [1, 2]) add({ kind: 'library', family: 'sinusoidal', origin: lo, parameter: (strong[j].x - strong[i].x) * multiplier, phaseFree: true });
  }
  const poles = unique([0, ...(measured.axes.x.ticks || []).map(t => t.value), lo, hi, ...[.02, .05, .1, .25, .5, 1, 2, 4].flatMap(k => [lo - span * k, hi + span * k])]);
  for (const origin of poles) {
    for (const family of ['reciprocal', 'inverse-square']) add({ kind: 'library', family, origin });
    for (const direction of [-1, 1]) for (const family of ['shifted-sqrt', 'sqrt-quadratic', 'logarithmic']) add({ kind: 'library', family, origin, direction });
  }
  for (let j = -16; j <= 16; j++) if (j) add({ kind: 'library', family: 'exponential', origin: lo, parameter: j / 2 / span });
  // Refine only the best remaining one-dimensional rate/shift. This is bounded
  // coordinate search, not a polynomial or an unrestricted symbolic search.
  for (const family of ['exponential', 'reciprocal', 'inverse-square', 'logarithmic', 'shifted-sqrt']) {
    let best = out.filter(c => c.family === family).sort((a, b) => a.proxy - b.proxy)[0];
    if (!best) continue;
    const key = family === 'exponential' ? 'parameter' : 'origin';
    let step = family === 'exponential' ? .5 / span : span * .05;
    for (let iteration = 0; iteration < 18; iteration++) {
      const before = best;
      for (const direction of [-1, 1]) add({ ...best.model, [key]: best.model[key] + direction * step });
      best = out.filter(c => c.family === family).sort((a, b) => a.proxy - b.proxy)[0];
      if (best === before) step /= 2;
    }
  }
  const preferred = String(series.candidateFamily || '');
  const preference = c => preferred.includes('period') || preferred.includes('sin') || preferred.includes('trig') ? ['cosine-square', 'sinusoidal'].includes(c.family) : preferred.includes('inverse') || preferred === 'rational' ? ['reciprocal', 'inverse-square'].includes(c.family) : preferred.includes('sqrt') ? c.family.includes('sqrt') : c.family === preferred;
  out.forEach(c => { c.rank = c.proxy + c.parameterCount * .0005 + (c.family === 'candidate-expression' ? -.001 : 0) - (preference(c) ? .001 : 0); });
  // One representative of every family avoids a steep curve hiding another
  // family's valid shape behind many near-identical cheap proxy candidates.
  const sorted = out.sort((a, b) => a.rank - b.rank), shortlist = sorted.slice(0, 14);
  for (const family of new Set(sorted.map(c => c.family))) {
    const item = sorted.find(c => c.family === family); if (!shortlist.includes(item)) shortlist.push(item);
  }
  return shortlist;
}

function originalSeries(series) {
  const a = series.approximation;
  return { ...series, kind: 'points', points: series.observedPoints, curveStyle: a.sourceCurveStyle, endpoints: a.sourceEndpoints || [], arrowSpecs: a.sourceArrowSpecs || [], candidateExpression: a.sourceCandidateExpression, candidateFamily: a.sourceFamily };
}
function sourcePlan(plan) {
  const ids = new Set((plan.series || []).flatMap(s => s.approximation?.method === RELATION_ANALYTIC_FIT_VERSION ? s.approximation.endpointAnnotationIds || [] : []));
  return { ...plan, series: plan.series.map(s => s.approximation?.method === RELATION_ANALYTIC_FIT_VERSION ? originalSeries(s) : s), annotations: (plan.annotations || []).filter(a => !ids.has(a.id)).map(a => ({ ...a, ...(Number.isInteger(a.sourcePointIndex) ? { pointIndex: a.sourcePointIndex } : {}) })) };
}

function sharedPoleCandidate(plan, members) {
  if (members.length !== 2 || members.some(m => m.s.coordinateSpace !== 'data') || members[0].s.axis !== members[1].s.axis) return null;
  const [left, right] = [...members].sort((a, b) => a.s.points[0].x - b.s.points[0].x);
  const pole = 0, lp = left.s.points, rp = right.s.points;
  if (!(lp.at(-1).x < pole && rp[0].x > pole) || !(members[0].context.measured.axes.x.ticks || []).some(t => t.value < 0) || !(members[0].context.measured.axes.x.ticks || []).some(t => t.value > 0)) return null;
  const pair = left.context.anchors.filter(a => a.strong && a.x < 0).flatMap(a => right.context.anchors.filter(b => b.strong && b.x > 0 && Math.abs(a.x + b.x) < 1e-8).map(b => [a, b]));
  if (!pair.length) return null;
  const ys = members[0].context.map.ymax - members[0].context.map.ymin;
  if ((lp.at(-1).y - lp[0].y) * (rp.at(-1).y - rp[0].y) <= 0 || Math.abs(lp.at(-1).y - lp[0].y) / ys < .08 || Math.abs(rp.at(-1).y - rp[0].y) / ys < .08) return null;
  const points = members.flatMap(m => m.s.points), anchors = members.flatMap(m => m.context.anchors), choices = [];
  for (const power of [1, 2]) {
    const basis = x => power === 1 ? 1 / x : Math.sign(x) / x ** 2;
    const coefficients = solvePhysicsCoefficients(points, [() => 1, basis], anchors, { allowRelativeResidual: true });
    if (!coefficients) continue;
    const expression = equation(coefficients, ['', power === 1 ? '1/x' : 'sign(x)/x^2']);
    const measurements = members.map(m => measurePhysicsCandidate(expression, m.s.points, m.context.anchors, m.context.measured, m.s.axis || 'y', m.s.curveStyle || 'smooth'));
    if (measurements.some(m => !m.ok)) continue;
    choices.push({ expression, family: power === 1 ? 'shared-reciprocal' : 'shared-inverse-square', model: { kind: 'shared-pole', family: power === 1 ? 'shared-reciprocal' : 'shared-inverse-square', pole, power, seriesIds: members.map(m => m.s.id).sort() }, parameterCount: 2, measurements, members, score: Math.max(...measurements.map(m => m.rmsDeviation)) });
  }
  return choices.sort((a, b) => a.score - b.score)[0] || null;
}

function convertedArrows(source, curveStyle) {
  const handles = curveStyle === 'smooth' ? shapePreservingHandles(source.points, []) : [];
  return (source.arrowSpecs || []).map(({ segmentIndex, t, ...style }) => {
    const point = sampleShapeSegment(source.points, handles, segmentIndex, t, curveStyle === 'smooth' ? [] : Array(source.points.length - 1).fill('line'));
    return { ...style, x: point.x };
  });
}

function replaceSeries(plan, entry, candidate) {
  const { s, index, context } = entry, original = clone(s.points), map = context.map, endpointAnnotationIds = [];
  const usedIds = new Set((plan.annotations || []).map(a => a.id));
  for (const e of s.endpoints || []) {
    const p = original[e.index]; let id = `${s.id}-analytic-endpoint-${e.index}`;
    while (usedIds.has(id)) id += '-copy'; usedIds.add(id); endpointAnnotationIds.push(id);
    plan.annotations.push({ id, kind: 'point', text: '', orientation: 'horizontal', x: p.x, y: p.y, anchorX: p.x, seriesId: s.id, axis: s.axis || 'y', coordinateSpace: s.coordinateSpace, endStyle: e.kind,
      ...(e.markerSize === undefined && s.markerSize === undefined ? {} : { markerSize: e.markerSize ?? s.markerSize }), ...(e.fillLevel === undefined ? {} : { fillLevel: e.fillLevel }), ...(s.strokeWidth === undefined ? {} : { strokeWidth: s.strokeWidth }) });
  }
  const metadata = { provenance: 'image-fit', method: RELATION_ANALYTIC_FIT_VERSION, family: candidate.family, model: clone(candidate.model), coefficientSource: s.coordinateSpace === 'normalized' ? 'relative-display-relations-estimated' : 'relation-constrained-observations',
    parameterCount: candidate.parameterCount, sourceCurveStyle: s.curveStyle || 'straight', sourceEndpoints: clone(s.endpoints || []), sourceArrowSpecs: clone(s.arrowSpecs || []), endpointAnnotationIds,
    sourceFamily: s.candidateFamily ?? null, ...(s.candidateExpression ? { sourceCandidateExpression: s.candidateExpression } : {}),
    anchors: context.anchors.map(a => ({ x: a.x, y: a.y, strong: a.strong })), tolerance: { ...PHYSICS_LIMITS }, errorSpace: 'normalized-display-distance', ...Object.fromEntries(['maxDeviation', 'rmsDeviation', 'bias', 'anchorDeviation'].map(key => [key, candidate[key]])) };
  if (s.arrowSpecs?.length) s.arrowSpecs = convertedArrows(s, s.curveStyle || 'straight');
  for (const a of plan.annotations || []) if (a.seriesId === s.id && Number.isInteger(a.pointIndex)) {
    const anchor = context.anchors.find(q => q.annotationId === a.id && q.strong), point = anchor || original[a.pointIndex];
    if (!point) continue;
    a.anchorX = a.coordinateSpace === s.coordinateSpace ? point.x : a.coordinateSpace === 'normalized' ? map.X(point.x) : map.xmin + point.x * (map.xmax - map.xmin);
    a.sourcePointIndex = a.pointIndex; delete a.pointIndex;
  }
  s.kind = 'expression'; s.expression = candidate.expression; s.observedPoints = original; s.domain = { min: original[0].x, max: original.at(-1).x }; s.approximation = metadata;
  for (const key of ['points', 'endpoints', 'handlesMath', 'segmentModes', 'fit', 'candidateExpression', 'candidateFamily', 'analyticFitFailure']) delete s[key];
  return { seriesId: s.id, family: candidate.family, expression: candidate.expression, maxDeviation: candidate.maxDeviation, rmsDeviation: candidate.rmsDeviation, anchors: context.anchors.filter(a => a.strong).length, coefficientSource: metadata.coefficientSource };
}

export function fitRelationAnalyticPlan(input) {
  const plan = clone(input), conversions = [], rejected = [], entries = [], chosen = new Map();
  if (plan.variant === 'axis-break') return { plan, conversions, rejected };
  plan.annotations ||= [];
  for (const [index, s] of (plan.series || []).entries()) {
    if (s.kind !== 'points' || !eligible(s)) continue;
    const context = contacts(plan, s, index); if (!context) continue;
    entries.push({ s, index, context });
  }
  // Shared field branches are fitted jointly only with opposite-side reference
  // contacts and matching divergence/trend evidence. Independent curves remain
  // independent; an AI family label alone never causes grouping.
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    if (chosen.has(entries[i].s.id) || chosen.has(entries[j].s.id)) continue;
    const joint = sharedPoleCandidate(plan, [entries[i], entries[j]]); if (!joint) continue;
    joint.members.forEach((entry, k) => chosen.set(entry.s.id, { ...joint, ...joint.measurements[k] }));
  }
  for (const entry of entries) {
    if (chosen.has(entry.s.id)) continue;
    let best = null, failure = null;
    for (const candidate of candidates(entry.s, entry.context)) {
      const measurement = measurePhysicsCandidate(candidate.expression, entry.s.points, [...entry.context.anchors, ...(candidate.extraAnchors || [])], entry.context.measured, entry.s.axis || 'y', entry.s.curveStyle || 'straight');
      if (!measurement.ok) { failure ||= measurement.reason; continue; }
      const score = measurement.rmsDeviation + .001 * candidate.parameterCount + .00001 * candidate.expression.length - (candidate.family === 'cosine-square' ? .002 : 0);
      if (!best || score < best.score) best = { ...candidate, ...measurement, score };
    }
    if (best) chosen.set(entry.s.id, best);
    else rejected.push({ seriesId: entry.s.id, reason: '관계 제약을 유지하는 제한된 함수 후보를 검증했으나 접점·방향·모양 검증을 통과하지 못했습니다.', stage: RELATION_ANALYTIC_FIT_VERSION, failedCondition: failure || 'no-bounded-candidate' });
  }
  let annotationBudget = MAX_ANNOTATIONS - plan.annotations.length;
  const reserved = new Set();
  for (const entry of entries) {
    const candidate = chosen.get(entry.s.id); if (!candidate || reserved.has(entry.s.id)) continue;
    const ids = candidate.model.kind === 'shared-pole' ? candidate.model.seriesIds : [entry.s.id];
    const needed = ids.reduce((sum, id) => sum + (entries.find(e => e.s.id === id)?.s.endpoints?.length || 0), 0);
    ids.forEach(id => reserved.add(id));
    if (needed > annotationBudget) {
      ids.forEach(id => { chosen.delete(id); rejected.push({ seriesId: id, reason: '원래 표시점을 보존하면 표기 개수 한도를 넘으므로 이 곡선을 관찰점으로 유지했습니다.', stage: RELATION_ANALYTIC_FIT_VERSION, failedCondition: 'annotation-budget' }); });
    } else annotationBudget -= needed;
  }
  for (const entry of entries) if (chosen.has(entry.s.id)) conversions.push(replaceSeries(plan, entry, chosen.get(entry.s.id)));
  return { plan, conversions, rejected };
}

export function checkRelationAnalyticApproximation(series, plan) {
  const a = series?.approximation;
  const fail = reason => ({ ok: false, reason });
  if (!a || a.method !== RELATION_ANALYTIC_FIT_VERSION || a.provenance !== 'image-fit' || series.kind !== 'expression' || !eligible(series, series.observedPoints)) return fail('Relation analytic approximation requires bounded original observations');
  const original = originalSeries(series), points = original.points;
  if (!series.domain || series.domain.min !== points[0].x || series.domain.max !== points.at(-1).x || typeof series.expression !== 'string' || series.expression.length > MAX_EXPRESSION || !['straight', 'smooth'].includes(a.sourceCurveStyle) || a.errorSpace !== 'normalized-display-distance' || Object.keys(PHYSICS_LIMITS).some(key => a.tolerance?.[key] !== PHYSICS_LIMITS[key])) return fail('Invalid relation analytic domain or measurement policy');
  if (a.sourceCurveStyle !== (series.curveStyle || 'straight') || !['library', 'proposal', 'shared-pole'].includes(a.model?.kind) || a.coefficientSource !== (series.coordinateSpace === 'normalized' ? 'relative-display-relations-estimated' : 'relation-constrained-observations') || !Array.isArray(a.sourceEndpoints) || a.sourceEndpoints.length > MAX_POINTS || !Array.isArray(a.sourceArrowSpecs) || a.sourceArrowSpecs.length > MAX_POINTS || !Array.isArray(a.endpointAnnotationIds) || a.sourceEndpoints.length !== a.endpointAnnotationIds.length || new Set(a.endpointAnnotationIds).size !== a.endpointAnnotationIds.length) return fail('Invalid relation analytic source geometry');
  for (let i = 0; i < a.sourceEndpoints.length; i++) {
    const e = a.sourceEndpoints[i];
    if (!e || typeof e !== 'object' || !Number.isInteger(e.index) || e.index < 0) return fail('Invalid saved endpoint metadata');
    const point = points[e.index], marker = plan.annotations?.find(n => n?.id === a.endpointAnnotationIds[i]);
    if (!point || !['open', 'closed'].includes(e.kind) || !marker || marker.kind !== 'point' || marker.seriesId !== series.id || marker.x !== point.x || marker.y !== point.y || marker.anchorX !== point.x || marker.endStyle !== e.kind || marker.coordinateSpace !== series.coordinateSpace) return fail('A saved endpoint marker lost its original contact');
  }
  let arrows; try { arrows = convertedArrows(original, a.sourceCurveStyle); } catch { return fail('Invalid source arrow geometry'); }
  if (JSON.stringify(arrows) !== JSON.stringify(series.arrowSpecs || [])) return fail('A source arrow changed position or direction');
  const before = sourcePlan(plan), index = before.series.findIndex(s => s.id === series.id), source = before.series[index], context = contacts(before, source, index);
  if (!context || !Array.isArray(a.anchors) || a.anchors.length > MAX_CONTACTS || JSON.stringify(context.anchors.map(q => ({ x: q.x, y: q.y, strong: q.strong }))) !== JSON.stringify(a.anchors)) return fail('Relation contact provenance does not match source annotations');
  let expected;
  if (a.model?.kind === 'shared-pole') {
    if (!Array.isArray(a.model.seriesIds) || a.model.seriesIds.length !== 2 || !a.model.seriesIds.includes(series.id)) return fail('Invalid shared field group');
    const members = a.model.seriesIds.map(id => { const index = before.series.findIndex(s => s.id === id), s = before.series[index]; return s && eligible(s) ? { s, index, context: contacts(before, s, index) } : null; });
    if (members.some(m => !m?.context)) return fail('Shared field source observations are missing');
    expected = sharedPoleCandidate(before, members);
    if (!expected || JSON.stringify(expected.model) !== JSON.stringify(a.model) || a.model.seriesIds.some(id => { const peer = plan.series.find(s => s.id === id); return peer?.kind !== 'expression' || peer.expression !== series.expression || JSON.stringify(peer.approximation?.model) !== JSON.stringify(a.model); })) return fail('Shared field branches no longer share a validated pole and background');
  } else expected = fitModel(a.model, points, context.anchors, waveFacts(points, context.anchors, context.map, context.axisY));
  if (!expected || expected.expression !== series.expression || expected.family !== a.family || expected.parameterCount !== a.parameterCount || a.model.kind === 'proposal' && a.model.expression !== a.sourceCandidateExpression) return fail('Saved expression does not reproduce the bounded fitted model');
  const measurement = measurePhysicsCandidate(series.expression, points, [...context.anchors, ...(expected.extraAnchors || [])], context.measured, series.axis || 'y', a.sourceCurveStyle);
  if (!measurement.ok) return fail('Formula does not preserve source relations and shape: ' + measurement.reason);
  if (['maxDeviation', 'rmsDeviation', 'bias', 'anchorDeviation'].some(key => !finite(a[key]) || Math.abs(a[key] - measurement[key]) > 1e-6)) return fail('Recorded relation fitting errors do not match independent measurements');
  return { ok: true, ...measurement };
}

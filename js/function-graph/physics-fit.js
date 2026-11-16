/* Physics-family restoration in tick units.
 *
 * 1. calibrateTickUnits(): an observed plan whose tick labels are multiples of
 *    one symbol (E_0, 4E_0, \lambda_0, 2t_1 ...) or plain numbers becomes a
 *    data-mode plan by a pure affine map. Every drawn position is preserved;
 *    the editor then shows readable ticks such as 1:E_0, 4:4E_0.
 * 2. fitPhysicsGraphPlan(): smooth observed curves are matched to the small set
 *    of functions used in school physics (line, power law, quadratic,
 *    exponential, sinusoid) with simple coefficients. Guide/point contacts that
 *    sit on ticks are relation anchors and must be met; small tracing bumps are
 *    ignored; distance is measured perpendicular to the drawn line in display
 *    space, so steep parts near asymptotes are judged fairly.
 * 3. checkPhysicsApproximation(): the contract re-runs the same measurement.
 *
 * Formulas are approximations of the printed drawing in tick units. They never
 * claim absolute physical quantities. */
import { compile } from './parser.js?v=1.7.0-four-session-integration';
import { shapePreservingHandles, sampleShapeSegment } from './shape-preserving.js?v=1.7.0-four-session-integration';

export const PHYSICS_FIT_VERSION = 'physics-family-fit-v1';
export const PHYSICS_LIMITS = Object.freeze({ maxDistance: 0.04, rmsDistance: 0.015, anchorDistance: 1e-7, bias: 0.03, extremum: 0.03 });
const SNAP = 0.012;
const clone = v => JSON.parse(JSON.stringify(v));
const finite = Number.isFinite;

/* ---------- tick labels ---------- */
const SUBS = '₀₁₂₃₄₅₆₇₈₉';
const GREEK = { lambda:'λ', pi:'π', theta:'θ', omega:'ω', alpha:'α', beta:'β', mu:'μ', phi:'φ', tau:'τ', sigma:'σ', rho:'ρ', epsilon:'ε', varepsilon:'ε', Delta:'Δ', delta:'δ', nu:'ν', gamma:'γ' };
export function normalizeTickLabel(raw) {
  let s = String(raw ?? '');
  if (/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻^]/.test(s)) return null; // powers of ten: log-like, never a linear unit
  s = s.replace(/\\(?:mathrm|text|mathit|rm|operatorname)\s*\{([^{}]*)\}/g, '$1');
  s = s.replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2');
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)');
  s = s.replace(/\\([A-Za-z]+)/g, (m, name) => GREEK[name] ?? m);
  s = s.replace(/[₀-₉]+/g, m => '_' + [...m].map(c => SUBS.indexOf(c)).join(''));
  s = s.replace(/_\{([^{}]*)\}/g, '_$1');
  s = s.replace(/[−–—]/g, '-').replace(/\s+/g, '').replace(/[{}]/g, '');
  return s;
}
export function parseTickLabel(raw) {
  const s = normalizeTickLabel(raw);
  if (!s || /[°%\\]/.test(s)) return null;
  const m = s.match(/^([+-]?)(\d+(?:\.\d+)?)?(?:√(\d+(?:\.\d+)?|\(\d+(?:\.\d+)?\)))?(.*?)(?:\/(\d+(?:\.\d+)?))?$/);
  if (!m) return null;
  const unit = m[4] || '', div = m[5] !== undefined ? Number(m[5]) : 1;
  if (m[2] === undefined && m[3] === undefined && !unit) return null;
  if (unit && (!/^[A-Za-zα-ωΑ-Ω√(][A-Za-z0-9_α-ωΑ-Ω√()\/'·.]*$/.test(unit) || !/[A-Za-zα-ωΑ-Ω]/.test(unit))) return null;
  const root = m[3] !== undefined ? Math.sqrt(Number(m[3].replace(/[()]/g, ''))) : 1;
  const coef = (m[1] === '-' ? -1 : 1) * (m[2] !== undefined ? Number(m[2]) : 1) * root / div;
  return finite(coef) && div !== 0 ? { unit, coef, text: s } : null;
}

/* ---------- small numerics ---------- */
function lineFit(pts) {
  const n = pts.length; if (n < 2) return null;
  const mv = pts.reduce((s, p) => s + p.v, 0) / n, mp = pts.reduce((s, p) => s + p.pos, 0) / n;
  let sxx = 0, sxy = 0; for (const p of pts) { sxx += (p.v - mv) ** 2; sxy += (p.v - mv) * (p.pos - mp); }
  if (sxx < 1e-12) return null;
  const b = sxy / sxx, a = mp - b * mv;
  return { a, b, maxResidual: Math.max(...pts.map(p => Math.abs(a + b * p.v - p.pos))) };
}
function roundTo(v, q) { const r = Math.round(v / q) * q; return Number(r.toFixed(Math.max(0, Math.min(12, -Math.floor(Math.log10(q)) + 1)))); }

/* ---------- calibration ---------- */
function axisCalibration(axis, crossPos, originKnown) {
  if (!axis || (axis.scale && !['unknown', 'linear'].includes(axis.scale))) return null;
  const ticks = (axis.ticks || []).filter(t => finite(t.position));
  if (!ticks.length || ticks.some(t => /[⁰¹²³⁴⁵⁶⁷⁸⁹⁻^]/.test(String(t.displayMath ?? t.label ?? '')))) return null;
  const groups = new Map();
  for (const t of ticks) { const p = parseTickLabel(t.displayMath ?? t.label); if (!p) continue; if (!groups.has(p.unit)) groups.set(p.unit, []); groups.get(p.unit).push({ v: p.coef, pos: t.position }); }
  let best = null;
  for (const [unit, pts] of groups) {
    const distinct = new Set(pts.map(p => p.v)).size, score = distinct * 10 + (unit === '' ? 1 : 0);
    if (distinct === pts.length && (!best || score > best.score)) best = { unit, pts, distinct, score };
  }
  if (!best) return null;
  let pts = best.pts;
  if (best.distinct < 2) {
    // A single symbolic tick (e.g. only v_0) needs the printed origin and no rival symbols.
    if (!originKnown || groups.size !== 1 || pts[0].v === 0) return null;
    pts = [...pts, { v: 0, pos: crossPos }];
  } else if (originKnown && !pts.some(p => p.v === 0)) {
    const withOrigin = [...pts, { v: 0, pos: crossPos }], f = lineFit(withOrigin);
    if (f && f.maxResidual <= SNAP) pts = withOrigin;
  }
  const fit = lineFit(pts);
  if (!fit || !(fit.b > 1e-6) || fit.maxResidual > SNAP) return null;
  let { a, b } = fit;
  if (originKnown && Math.abs(a - crossPos) <= SNAP && pts.some(p => p.v !== 0)) {
    a = crossPos; const nz = pts.filter(p => p.v !== 0);
    b = nz.reduce((s, p) => s + (p.pos - a) * p.v, 0) / nz.reduce((s, p) => s + p.v * p.v, 0);
    if (!(b > 1e-6) || nz.some(p => Math.abs(a + b * p.v - p.pos) > SNAP)) return null;
  }
  const range = 1 / b, q = 10 ** (Math.floor(Math.log10(range)) - 3);
  const min = roundTo(-a / b, q), max = roundTo((1 - a) / b, q);
  if (!(max > min)) return null;
  return { method: 'tick-label-units', unit: best.unit, min, max, ticksUsed: best.distinct };
}
const frameUnits = () => ({ method: 'frame-fraction', unit: '', min: 0, max: 1, ticksUsed: 0 });
function tickValue(t, cal, used) {
  const raw = cal.min + t.position * (cal.max - cal.min), span = cal.max - cal.min;
  const parsed = cal.method === 'tick-label-units' ? parseTickLabel(t.displayMath ?? t.label) : null;
  const candidates = [];
  if (parsed && parsed.unit === cal.unit) candidates.push(parsed.coef);
  // Unknown symbols keep their measured location until a relation identifies them.
  let value = null;
  for (const c of candidates) if (Math.abs(c - raw) / span <= SNAP && !used.has(c)) { value = c; break; }
  if (value === null) { value = roundTo(raw, 10 ** (Math.floor(Math.log10(span)) - 4)); }
  value = Math.min(cal.max, Math.max(cal.min, value));
  used.add(value); return value;
}
function hasOriginLabel(plan, crossX, crossY) {
  const near = (x, y) => finite(x) && finite(y) && Math.abs(x - crossX) < 0.14 && Math.abs(y - crossY) < 0.14;
  if ((plan.annotations || []).some(a => a.kind === 'text' && a.coordinateSpace === 'normalized' && /^[0O]$/.test(normalizeTickLabel(a.displayMath ?? a.text ?? '') || '') && near(a.x, a.y))) return true;
  return ['x', 'y'].some(k => (plan.axes?.[k]?.ticks || []).some(t => /^\s*0\s*$/.test(String(t.label ?? '')) && finite(t.position) && Math.abs(t.position - (k === 'x' ? crossX : crossY)) < 0.02));
}
function inSourceBounds(points, source) {
  const b=source.plotBox;
  return Array.isArray(points) && points.every(p=>finite(p.x) && finite(p.y) && b.x+p.x*b.w>=0 && b.x+p.x*b.w<=source.width && b.y+(1-p.y)*b.h>=0 && b.y+(1-p.y)*b.h<=source.height);
}

export function calibrateTickUnits(input) {
  const unchanged = reason => ({ plan: input, calibrated: false, reason });
  if (!input || input.coordinateMode !== 'observed' || (input.variant && input.variant !== 'cartesian')) return unchanged('not-observed');
  if (input.axes?.y2) return unchanged('right-axis');
  if ((input.series || []).some(s => s.coordinateSpace !== 'normalized' || s.kind !== 'points' || s.axis === 'y2')) return unchanged('non-point-series');
  if ((input.series || []).some(s => s.handlesMath)) return unchanged('manual-handles');
  const placement = k => input.axisPlacement?.[k]?.mode === 'fraction' && finite(input.axisPlacement[k].value) ? input.axisPlacement[k].value : 0;
  const crossX = placement('y'), crossY = placement('x');
  const origin = hasOriginLabel(input, crossX, crossY);
  const cx = axisCalibration(input.axes?.x, crossX, origin), cy = axisCalibration(input.axes?.y, crossY, origin);
  if (!cx && !cy) return unchanged('no-unit-ticks');
  if (!(input.series || []).every(s => inSourceBounds(s.points,input.source))) return unchanged('geometry-beyond-source');
  const plan = clone(input), X = cx || frameUnits(), Y = cy || frameUnits();
  const sx = X.max - X.min, sy = Y.max - Y.min;
  const qx = 10 ** (Math.floor(Math.log10(sx)) - 4), qy = 10 ** (Math.floor(Math.log10(sy)) - 4);
  const toData = p => ({ ...p, x: roundTo(X.min + p.x * sx, qx), y: roundTo(Y.min + p.y * sy, qy) });
  for (const [key, cal] of [['x', X], ['y', Y]]) {
    const axis = plan.axes[key], used = new Set();
    const ticks = (axis.ticks || []).filter(t => finite(t.position)).map(t => {
      const { position, value, ...rest } = t;
      const parsed = parseTickLabel(t.displayMath ?? t.label);
      return { ...rest, value: tickValue(t, cal, used), sourcePosition: position,
        valueSource: cal.method === 'tick-label-units' && parsed?.unit === cal.unit ? 'tick-label' : 'observed-position' };
    });
    plan.axes[key] = { ...axis, scale: 'linear', min: cal.min, max: cal.max, step: ticks.length ? null : (cal.max - cal.min) / 4, ticks,
      calibration: { method: cal.method, unit: cal.unit, ticksUsed: cal.ticksUsed } };
  }
  for (const s of plan.series) { s.points = s.points.map(toData); s.coordinateSpace = 'data'; }
  plan.coordinateMode = 'data';
  // Observed rendering always drew a quadrant frame at fraction positions; keep it.
  plan.frame = { ...(plan.frame || {}), variant: plan.frame?.variant || 'quadrant' };
  return { plan, calibrated: true, calibration: { x: X, y: Y, origin } };
}

/* ---------- display-space geometry ---------- */
function displayMap(plan, axisKey) {
  const ax = plan.axes?.x, ay = plan.axes?.[axisKey];
  const ok = a => a && a.scale === 'linear' && finite(a.min) && finite(a.max) && a.max > a.min;
  if (!ok(ax) || !ok(ay)) return null;
  return { X: x => (x - ax.min) / (ax.max - ax.min), Y: y => (y - ay.min) / (ay.max - ay.min), xmin: ax.min, xmax: ax.max, ymin: ay.min, ymax: ay.max };
}
function denseTrace(points, curveStyle) {
  const smooth = curveStyle === 'smooth', handles = smooth ? shapePreservingHandles(points, []) : null, out = [];
  const span = points.at(-1).x - points[0].x || 1;
  for (let i = 0; i < points.length - 1; i++) {
    const count = Math.max(6, Math.ceil(600 * (points[i + 1].x - points[i].x) / span));
    for (let j = 0; j < count; j++) { const t = j / count; out.push(smooth ? sampleShapeSegment(points, handles, i, t, []) : { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t }); }
  }
  out.push({ x: points.at(-1).x, y: points.at(-1).y });
  return out.map(p => ({ x: p.x, y: p.y }));
}
function sampleCandidate(f, map, lo, hi) {
  const pts = [], n = 240;
  const at = x => { const y = f(x); return finite(y) ? { x: map.X(x), y: map.Y(y), dx: x } : null; };
  let prev = at(lo); if (!prev) return null; pts.push(prev);
  for (let i = 1; i <= n; i++) {
    const x = lo + (hi - lo) * i / n, next = at(x); if (!next) return null;
    const refine = (a, b, depth) => {
      if (depth > 7 || Math.hypot(b.x - a.x, b.y - a.y) <= 0.006) { pts.push(b); return true; }
      const mid = at((a.dx + b.dx) / 2); if (!mid) return false;
      return refine(a, mid, depth + 1) && refine(mid, b, depth + 1);
    };
    if (!refine(prev, next, 0)) return null; prev = next;
  }
  return pts;
}
function segDist(q, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y, len = vx * vx + vy * vy;
  const t = len ? Math.max(0, Math.min(1, ((q.x - a.x) * vx + (q.y - a.y) * vy) / len)) : 0;
  return Math.hypot(q.x - a.x - t * vx, q.y - a.y - t * vy);
}
function distanceTo(q, poly, window = 0.06) {
  let lo = 0, hi = poly.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (poly[mid].x < q.x - window) lo = mid + 1; else hi = mid; }
  let best = Infinity;
  for (let i = Math.max(0, lo - 1); i < poly.length - 1 && poly[i].x <= q.x + window; i++) best = Math.min(best, segDist(q, poly[i], poly[i + 1]));
  if (best === Infinity) best = Math.min(Math.hypot(q.x - poly[0].x, q.y - poly[0].y), Math.hypot(q.x - poly.at(-1).x, q.y - poly.at(-1).y));
  return best;
}
export function extremaOf(points, threshold) {
  const found = []; let sign = 0, start = points[0], peak = points[0];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (sign > 0 && p.y > peak.y || sign < 0 && p.y < peak.y) peak = p;
    const d = p.y - start.y; if (Math.abs(d) < threshold) continue;
    const next = Math.sign(d);
    if (sign && next !== sign) found.push({ x: peak.x, kind: sign });
    if (next !== sign) peak = p;
    sign = next; start = p;
  }
  return found;
}
function chordBias(points, valueAt) {
  const a = points[0], b = points.at(-1); let s = 0, n = 0;
  for (const p of points) { const c = a.y + (b.y - a.y) * (p.x - a.x) / ((b.x - a.x) || 1); const v = valueAt(p); if (finite(v)) { s += v - c; n++; } }
  return n ? s / n : 0;
}

/* Deterministic measurement used by both the fitter and the contract. */
export function measurePhysicsCandidate(expression, observations, anchors, plan, axisKey, curveStyle = 'smooth', { clipToFrame = false } = {}) {
  const map = displayMap(plan, axisKey); if (!map) return { ok: false, reason: 'axis' };
  let f; try { f = compile(expression); } catch { return { ok: false, reason: 'expression' }; }
  const lo = observations[0].x, hi = observations.at(-1).x;
  let cand = sampleCandidate(f, map, lo, hi); if (!cand) return { ok: false, reason: 'domain' };
  if (clipToFrame) {
    // Only trim invisible tails at the plotting boundary; never connect across
    // an internal excursion or pole. The editable expression itself is intact.
    const first=cand.findIndex(p=>p.y>=0 && p.y<=1), last=cand.findLastIndex(p=>p.y>=0 && p.y<=1);
    if(first<0 || first===last || cand.slice(first,last+1).some(p=>p.y<0 || p.y>1))return {ok:false,reason:'clipped'};
    const cut=(a,b,y)=>{const t=(y-a.y)/(b.y-a.y);return {x:a.x+t*(b.x-a.x),y,dx:a.dx+t*(b.dx-a.dx)};};
    const visible=cand.slice(first,last+1);
    if(first>0)visible.unshift(cut(cand[first-1],cand[first],cand[first-1].y<0?0:1));
    if(last<cand.length-1)visible.push(cut(cand[last],cand[last+1],cand[last+1].y<0?0:1));
    cand=visible;
  } else {
    // Tracing and tick calibration are measured in source pixels. Ink at an
    // axis contact can straddle that axis by one pixel without a visible tail.
    const edgeTolerance=Math.max(.002,1/plan.source.plotBox.h);
    if(cand.some(p=>p.y < -edgeTolerance || p.y > 1+edgeTolerance))return {ok:false,reason:'clipped'};
  }
  const trace = denseTrace(observations.map(p => ({ x: map.X(p.x), y: map.Y(p.y) })), curveStyle);
  let max1 = 0, sum = 0; const signed = [];
  const fAt = u => { const y = f(map.xmin + u * (map.xmax - map.xmin)); return finite(y) ? map.Y(y) : NaN; };
  for (const q of trace) { const d = distanceTo(q, cand); max1 = Math.max(max1, d); sum += d * d; const v = fAt(q.x); signed.push({ x: q.x, r: finite(v) ? Math.sign(q.y - v) * d : 0 }); }
  let max2 = 0; for (const q of cand) max2 = Math.max(max2, distanceTo(q, trace));
  const maxDeviation = Math.max(max1, max2), rmsDeviation = Math.sqrt(sum / trace.length);
  let bias = 0; const x0 = trace[0].x, x1 = trace.at(-1).x;
  for (let k = 0; k < 4; k++) { const part = signed.filter(s => s.x >= x0 + (x1 - x0) * k / 4 && s.x <= x0 + (x1 - x0) * (k + 1) / 4); if (part.length) bias = Math.max(bias, Math.abs(part.reduce((s, p) => s + p.r, 0) / part.length)); }
  let anchorDeviation = 0;
  for (const a of anchors || []) { if (!a.strong) continue; const y = f(a.x); anchorDeviation = Math.max(anchorDeviation, finite(y) ? Math.abs(map.Y(y) - map.Y(a.y)) : Infinity); }
  // Peaks/valleys: every clearly visible turn in one must exist in the other.
  // Small tracing bumps are below the visible level and are never reproduced.
  const visible = PHYSICS_LIMITS.extremum, faint = 0.006;
  const covers = (sig, low) => sig.every(e => low.some(q => q.kind === e.kind && Math.abs(q.x - e.x) <= 0.05));
  const extremaOk = covers(extremaOf(trace, visible), extremaOf(cand, faint)) && covers(extremaOf(cand, visible), extremaOf(trace, faint));
  const tb = chordBias(trace, p => p.y), cb = chordBias(trace, p => fAt(p.x));
  const convexOk = Math.abs(tb) <= 0.012 || Math.sign(tb) === Math.sign(cb);
  const sourceTrend=trace.at(-1).y-trace[0].y,candidateTrend=cand.at(-1).y-cand[0].y;
  const directionOk=Math.abs(sourceTrend)<=0.015 || Math.sign(sourceTrend)===Math.sign(candidateTrend);
  const L = PHYSICS_LIMITS;
  const reason = !directionOk ? 'direction' : !extremaOk ? 'extrema' : !convexOk ? 'convexity' : anchorDeviation > L.anchorDistance ? 'anchor' : maxDeviation > L.maxDistance || rmsDeviation > L.rmsDistance || bias > L.bias ? 'distance' : null;
  const r6 = v => Number(v.toFixed(6));
  return { ok: !reason, reason, maxDeviation: r6(maxDeviation), rmsDeviation: r6(rmsDeviation), bias: r6(bias), anchorDeviation: r6(anchorDeviation), f };
}

/* ---------- numbers and expressions ---------- */
function fmt(v) {
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  for(const n of [2,3,5,6])for(const d of [1,2,4]){
    const k=Math.round(v*d/Math.sqrt(n));
    if(k && Math.abs(k*Math.sqrt(n)/d-v)<1e-9)return (k===1?'':k===-1?'-':k+'*')+'sqrt('+n+')'+(d===1?'':'/'+d);
  }
  for (const d of [2, 4, 5, 10, 20, 100]) if (Math.abs(v * d - Math.round(v * d)) < 1e-9) return String(Number((Math.round(v * d) / d).toFixed(2)));
  for (const d of [3, 6]) if (Math.abs(v * d - Math.round(v * d)) < 1e-9) return '(' + Math.round(v * d) + '/' + d + ')';
  return String(Number(v.toPrecision(3)));
}
function niceCost(v) {
  if (Math.abs(v - Math.round(v)) < 1e-9) return 0;
  if (Math.abs(v * 2 - Math.round(v * 2)) < 1e-9) return 1;
  if ([3, 4, 5, 10].some(d => Math.abs(v * d - Math.round(v * d)) < 1e-9)) return 2;
  if (Math.abs(Number(v.toPrecision(2)) - v) < 1e-12) return 3;
  return 5;
}
function niceOptions(v, k = 4) {
  if (!finite(v)) return [];
  const set = new Set([Number(v.toPrecision(2))]);
  for(const n of [2,3,5,6])for(const d of [1,2,4])set.add(Math.round(v*d/Math.sqrt(n))*Math.sqrt(n)/d);
  for (const d of [1, 2, 3, 4, 5, 10]) set.add(Math.round(v * d) / d);
  if (v !== 0) { const e = Math.floor(Math.log10(Math.abs(v))); for (const sig of [1, 2]) { const q = 10 ** (e - sig + 1); set.add(Number((Math.round(v / q) * q).toPrecision(sig))); } }
  if (Math.abs(v) < 0.1) set.add(0);
  const scale = Math.max(Math.abs(v), 0.1);
  return [...set].filter(finite).map(c => ({ c, score: Math.abs(c - v) / scale + 0.01 * niceCost(c) })).sort((a, b) => a.score - b.score).slice(0, k).map(o => o.c);
}
const withConst = (e, c) => !c ? e : c > 0 ? e + '+' + fmt(c) : e + '-' + fmt(-c);
const times = (a, term) => a === 1 ? term : a === -1 ? '-' + term : fmt(a) + '*' + term;
function powerTerm(a, p) {
  const s = a < 0 ? '-' : '', m = Math.abs(a), num = fmt(m);
  if (p === -0.5) return s + num + '/sqrt(x)';
  if (p === -1) return s + num + '/x';
  if (p === -2) return s + num + '/x^2';
  if (p === 0.5) return times(a, 'sqrt(x)');
  if (p === 1) return times(a, 'x');
  return times(a, 'x^2');
}
const shift = (v, sym = 'x') => v === 0 ? sym : v > 0 ? '(' + sym + '-' + fmt(v) + ')' : '(' + sym + '+' + fmt(-v) + ')';

export function solvePhysicsCoefficients(points, bases, anchors = [], { allowRelativeResidual = false } = {}) {
  // Eliminate exact relation constraints first. Least squares can choose only
  // the remaining free coefficients, never move a printed reference contact.
  const strong = anchors.filter(a => a.strong);
  if (strong.length) {
    const k = bases.length, rows = strong.map(p => [...bases.map(f => f(p.x)), p.y]);
    if (rows.some(r => !r.every(finite))) return null;
    const pivots = []; let rank = 0;
    for (let col = 0; col < k && rank < rows.length; col++) {
      let idx = rank; for (let j = rank + 1; j < rows.length; j++) if (Math.abs(rows[j][col]) > Math.abs(rows[idx][col])) idx = j;
      if (Math.abs(rows[idx][col]) < 1e-10) continue;
      [rows[rank], rows[idx]] = [rows[idx], rows[rank]];
      const v = rows[rank][col]; for (let j = col; j <= k; j++) rows[rank][j] /= v;
      for (let i = 0; i < rows.length; i++) if (i !== rank) { const q = rows[i][col]; for (let j = col; j <= k; j++) rows[i][j] -= q * rows[rank][j]; }
      pivots.push(col); rank++;
    }
    if (rows.slice(rank).some(r => Math.abs(r[k]) > 1e-8)) return null;
    const fixed = Array(k).fill(0); pivots.forEach((p, i) => { fixed[p] = rows[i][k]; });
    const free = Array.from({length:k}, (_,i) => i).filter(i => !pivots.includes(i));
    if (!free.length) return fixed;
    if(!allowRelativeResidual)return null; // Exact tick fits require every coefficient to be identified.
    const basisFixed=x=>bases.reduce((sum,f,i)=>sum+fixed[i]*f(x),0);
    const freeBases=free.map(j=>x=>bases[j](x)-pivots.reduce((sum,p,i)=>sum+rows[i][j]*bases[p](x),0));
    const residual=solvePhysicsCoefficients(points.map(p=>({...p,y:p.y-basisFixed(p.x)})),freeBases);
    if(!residual)return null;
    for(let j=0;j<free.length;j++) {fixed[free[j]]=residual[j];pivots.forEach((p,i)=>{fixed[p]-=rows[i][free[j]]*residual[j];});}
    return fixed;
  }
  const k = bases.length, m = Array.from({ length: k }, () => Array(k + 1).fill(0));
  for (const p of points) {
    const b = bases.map(f => f(p.x)); if (!b.every(finite)) return null;
    const w = p.w || 1;
    for (let i = 0; i < k; i++) { for (let j = 0; j < k; j++) m[i][j] += w * b[i] * b[j]; m[i][k] += w * b[i] * p.y; }
  }
  for (let i = 0; i < k; i++) {
    let row = i; for (let j = i + 1; j < k; j++) if (Math.abs(m[j][i]) > Math.abs(m[row][i])) row = j;
    if (Math.abs(m[row][i]) < 1e-12) return null; [m[i], m[row]] = [m[row], m[i]];
    const pv = m[i][i]; for (let j = i; j <= k; j++) m[i][j] /= pv;
    for (let r = 0; r < k; r++) if (r !== i) { const q = m[r][i]; for (let j = i; j <= k; j++) m[r][j] -= q * m[i][j]; }
  }
  const c = m.map(r => r[k]); return c.every(v => finite(v) && Math.abs(v) < 1e7) ? c : null;
}
function product(lists) { return lists.reduce((acc, list) => acc.flatMap(a => list.map(v => [...a, v])), [[]]); }

const FAMILY_ALIASES = { linear: ['linear', 'power1'], quadratic: ['quadratic', 'power2'], 'power-square': ['power2', 'quadratic'], 'power-inverse': ['power-1'], 'power-inverse-square': ['power-2'], 'power-inverse-sqrt': ['power-0.5'], 'power-sqrt': ['power0.5'], exponential: ['exponential'], saturation: ['exponential'], sinusoid: ['sinusoid'], periodic: ['sinusoid'] };

// An extremum supplies both y(x)=height and y'(x)=0. Treating it as only
// a height loses period/phase information (the old Jacobian is singular there).
function extremumSinusoids(points, anchors, map) {
  const unique = [...new Map(anchors.filter(a => a.strong).map(a => [a.x, a])).values()].sort((a,b)=>a.x-b.x);
  const extrema = unique.filter(a => {
    const near = points.reduce((best,p,i)=>Math.abs(p.x-a.x)<Math.abs(points[best].x-a.x)?i:best,0);
    if (near <= 0 || near >= points.length-1 || Math.abs(map.X(points[near].x)-map.X(a.x))>SNAP) return false;
    const q=points[near], l=points[near-1], r=points[near+1];
    return (q.y>l.y && q.y>r.y) || (q.y<l.y && q.y<r.y);
  });
  const out=[];
  for(let i=0;i+2<extrema.length;i++) {
    const [a,b,c]=extrema.slice(i,i+3), half=b.x-a.x;
    if(!(half>0) || Math.abs(c.x-b.x-half)>1e-8 || Math.abs(a.y-c.y)>1e-8 || Math.abs(a.y-b.y)<1e-8)continue;
    const cycles=Math.floor(a.x/half), phase=a.x-cycles*half;
    const amplitude=(a.y-b.y)/2 * (-1)**cycles, middle=(a.y+b.y)/2, period=2*half;
    const frequency=period===2?'pi*':'2*pi*';
    const argument=frequency+shift(Math.abs(phase)<1e-9?0:phase)+(period===1||period===2?'':'/'+fmt(period));
    out.push({family:'sinusoid',params:4,expression:withConst(times(amplitude,'cos('+argument+')'),middle),extremumIdentified:true});
  }
  return out;
}

// Printed heights identify amplitude/offset; separate tick-aligned midline
// crossings identify period/phase. Unlabelled extremum x positions remain
// observations, not invented exact tick values.
function tickExtremaSinusoid(points, plan, map, axisKey) {
  const trace = denseTrace(points.map(p => ({ x: map.X(p.x), y: map.Y(p.y) })), 'smooth');
  const ticks = key => (plan.axes[key].ticks || []).filter(t => finite(t.value) && t.valueSource !== 'observed-position');
  const extrema = extremaOf(trace, .03).map(e => {
    const p = trace.reduce((best, q) => Math.abs(q.x-e.x) < Math.abs(best.x-e.x) ? q : best);
    const height = ticks(axisKey).filter(t => Math.abs(map.Y(t.value)-p.y) <= SNAP);
    return height.length === 1 ? { ...e, y: height[0].value } : null;
  });
  if (extrema.length < 3 || extrema.some(e => !e)) return null;
  const upper = extrema[0].kind > 0 ? extrema[0].y : extrema[1].y;
  const lower = extrema[0].kind < 0 ? extrema[0].y : extrema[1].y;
  if (!(upper > lower) || extrema.some((e, i) => e.kind !== extrema[0].kind * (-1)**i || e.y !== (e.kind > 0 ? upper : lower))) return null;
  const middle = (upper+lower)/2, mid = map.Y(middle), contacts = [];
  for (let i = 0; i < trace.length-1; i++) {
    const a = trace[i], b = trace[i+1];
    if ((a.y-mid)*(b.y-mid) > 0 || a.y === b.y) continue;
    const x = a.x+(b.x-a.x)*(mid-a.y)/(b.y-a.y);
    const matches = ticks('x').filter(t => Math.abs((t.sourcePosition ?? map.X(t.value))-x) <= SNAP);
    if (matches.length !== 1 || contacts.some(q => q.x === matches[0].value)) continue;
    contacts.push({ x: matches[0].value, y: middle, strong: true, dir: Math.sign(b.y-a.y) });
  }
  if (contacts.length < 2) return null;
  const half = contacts[1].x-contacts[0].x;
  if (!(half > 0) || contacts.some((p, i) => Math.abs(p.x-contacts[0].x-i*half) > 1e-8 || p.dir !== contacts[0].dir * (-1)**i)) return null;
  const phase = contacts[0].x-half/2, period = 2*half;
  // Every measured turn must correspond to a derived extremum. This is
  // independent of the later distance/shape and exact-contact checks.
  if (extrema.some(e => {
    const x = map.xmin+e.x*(map.xmax-map.xmin), n = Math.round((x-phase)/half);
    return Math.abs(map.X(phase+n*half)-e.x) > SNAP || e.kind !== -contacts[0].dir * (-1)**n;
  })) return null;
  const amplitude = -(upper-lower)/2 * contacts[0].dir;
  const term = period === 2 ? 'pi*'+shift(phase) : period === 4 ? 'pi*'+shift(phase)+'/2' : '2*pi*'+shift(phase)+(period === 1 ? '' : '/'+fmt(period));
  return { family: 'sinusoid', params: 4, expression: withConst(times(amplitude, 'cos('+term+')'), middle),
    extremumIdentified: true, constraintMethod: 'tick-extrema-zero-relations', contacts };
}

function familyCandidates(points, series, map, straight, anchors, plan) {
  const tracePoints = [...points].sort((a,b) => a.x-b.x).filter((p,i,all) => !i || p.x !== all[i-1].x);
  points = tracePoints;
  const out = [], lo = points[0].x, hi = points.at(-1).x, span = hi - lo;
  const solve = bases => anchors.some(a=>a.strong) ? solvePhysicsCoefficients(points, bases, anchors) : null;
  const push = (family, params, expression, extra={}) => { if (expression.length <= 120) out.push({ family, params, expression, ...extra }); };
  const snapCombos = (raw, k = 3) => product(raw.map(v => niceOptions(v, k)));
  // Line: a*x+b and proportional a*x.
  const lin = solve([() => 1, x => x]);
  if (lin) for (const [b, a] of snapCombos(lin)) push('linear', 2, a === 0 ? fmt(b) : withConst(times(a, 'x'), b));
  const proportional=solve([x=>x]);if(proportional)for(const [a] of snapCombos(proportional))push('linear',1,times(a,'x'));
  const constant=solve([()=>1]);if(constant)for(const [b] of snapCombos(constant))push('linear',1,fmt(b));
  if (straight) return out;
  out.push(...extremumSinusoids(series.points, anchors, map));
  const wave = tickExtremaSinusoid(series.points, plan, map, series.axis || 'y');
  if (wave) out.push(wave);
  for (const p of [-2, -1, -0.5, 0.5, 1, 2]) {
    if ((p < 0 && lo <= 0) || (p === 0.5 && lo < 0)) continue;
    const basis = x => x ** p, one = solve([basis]);
    if (one) for (const [a] of snapCombos(one, 4)) push('power' + p, 1, powerTerm(a, p));
    const two = solve([basis, () => 1]);
    if (two) for (const [a, c] of snapCombos(two)) push('power' + p, 2, withConst(powerTerm(a, p), c));
  }
  // Lens/magnification branches may have a pole at a printed focal tick.
  // Only try finite printed tick positions outside this branch's domain.
  for (const t of new Set((plan.axes.x.ticks || []).filter(t=>t.valueSource!=='observed-position').map(t => t.value))) {
    if (!finite(t) || t === 0 || (t >= lo && t <= hi)) continue;
    for (const p of [-1,-2]) {
      const side = t > hi ? -1 : 1, base = x => (side*(x-t))**p;
      const denom = side < 0 ? '('+fmt(t)+'-x)' : shift(t);
      for (const bs of [[base],[base,()=>1]]) {
        const c = solve(bs); if (!c) continue;
        for (const [a,b=0] of snapCombos(c)) push('power'+p,bs.length,withConst(fmt(a)+'/'+denom+(p===-2?'^2':''),b),{pole:t});
      }
    }
  }
  if (points.length >= 5) {
    const q = solve([() => 1, x => x, x => x * x]);
    if (q && Math.abs(q[2]) > 1e-9) {
      const [c, b, a] = q, h = -b / (2 * a), k = c - b * b / (4 * a);
      for (const [A, H, K] of snapCombos([a, h, k])) push('quadratic', 3, withConst(times(A, shift(H) + '^2'), K));
      for (const [C, B, A] of snapCombos([c, b, a], 2)) push('quadratic', 3, withConst(withConst(times(A, 'x^2'), 0) + (B ? (B > 0 ? '+' : '-') + times(Math.abs(B), 'x').replace(/^-/, '') : ''), C));
    }
  }
  if (points.length >= 5 && span > 0) {
    let best = null;
    for (let i = 0; i <= 48; i++) {
      const T = span * 0.04 * 100 ** (i / 48);
      for (const dir of [-1, 1]) {
        const basis = x => 2 ** (dir * x / T), c = solvePhysicsCoefficients(points,[basis, () => 1]); if (!c) continue;
        let e = 0; for (const p of points) e += (p.w || 1) * (c[0] * basis(p.x) + c[1] - p.y) ** 2;
        if (!best || e < best.e) best = { e, T, dir, c };
      }
    }
    if (best) for (const T of niceOptions(best.T, 3)) {
      if (!(T > 0)) continue; const basis = x => 2 ** (best.dir * x / T), term = '2^(' + (best.dir < 0 ? '-' : '') + (T === 1 ? 'x' : 'x/' + fmt(T)) + ')';
      const one = solve([basis]); if (one) for (const [a] of snapCombos(one, 4)) push('exponential', 2, times(a, term));
      const c = solve([basis, () => 1]); if (!c) continue;
      for (const [a, k] of snapCombos(c)) push('exponential', 3, withConst(times(a, term), k));
    }
  }
  if (points.length >= 7 && span > 0) {
    const ys = points.map(p => p.y), trace = points.map(p => ({ x: map.X(p.x), y: map.Y(p.y) }));
    const ex = extremaOf(trace, 0.02);
    const periods = new Set();
    for (let i = 1; i < ex.length; i++) { const d = (ex[i].x - ex[i - 1].x) * (map.xmax - map.xmin); periods.add(ex[i].kind === ex[i - 1].kind ? d : 2 * d); }
    if (ex.length >= 2) { const d = (ex.at(-1).x - ex[0].x) * (map.xmax - map.xmin) / (ex.length - 1); periods.add(2 * d); }
    for (let cycles = 0.5; cycles <= 4; cycles += 0.25) periods.add(span / cycles);
    let best = null;
    for (const P0 of periods) for (let s = -10; s <= 10; s++) {
      const P = P0 * (1 + s * 0.02), w = 2 * Math.PI / P, c = solvePhysicsCoefficients(points,[x => Math.sin(w * x), x => Math.cos(w * x), () => 1]); if (!c) continue;
      let e = 0; for (const p of points) e += (p.w || 1) * (c[0] * Math.sin(w * p.x) + c[1] * Math.cos(w * p.x) + c[2] - p.y) ** 2;
      if (!best || e < best.e) best = { e, P, c };
    }
    if (best && Math.max(...ys) - Math.min(...ys) > 0) {
      for(const PP of niceOptions(best.P,3)){
      if(!(PP>0))continue;const w=2*Math.PI/PP,c=solve([x=>Math.sin(w*x),x=>Math.cos(w*x),()=>1]);if(!c)continue;
      const [s, co, k] = c, A = Math.hypot(s, co), phi = Math.atan2(co, s), x0 = -phi * PP / (2 * Math.PI);
      for (const [AA, XX, KK] of product([niceOptions(A, 3), [...new Set([...niceOptions(x0, 3), ...niceOptions(((x0 % PP) + PP) % PP, 2)])], niceOptions(k, 3)])) {
        if (!(PP > 0) || !AA) continue;
        push('sinusoid', 4, withConst(times(AA, 'sin(2*pi*' + shift(XX) + (PP === 1 ? '' : '/' + fmt(PP)) + ')'), KK));
      }
      }
    }
  }
  return out;
}

function collectAnchors(plan, s, index, map) {
  const anchors = [];
  const ticks = k => (plan.axes?.[k]?.ticks || []).filter(t => finite(t.value));
  const origin=hasOriginLabel(plan,plan.axisPlacement?.y?.mode==='fraction'?plan.axisPlacement.y.value:0,plan.axisPlacement?.x?.mode==='fraction'?plan.axisPlacement.x.value:0);
  const snap = (v, k) => { const m = k === 'x' ? map.X : map.Y; let best = origin && Math.abs(m(v)-m(0))<=SNAP ? {d:Math.abs(m(v)-m(0)),v:0} : null; for (const t of ticks(k)) { if(t.valueSource === 'observed-position')continue; const d = Math.min(Math.abs(m(t.value) - m(v)), finite(t.sourcePosition) ? Math.abs(t.sourcePosition - m(v)) : Infinity); if (d <= SNAP && (!best || d < best.d)) best = { d, v: t.value }; } return best ? best.v : null; };
  if(origin)for(const i of [0,s.points.length-1]) {
    const p=s.points[i],x=snap(p.x,'x'),y=snap(p.y,s.axis || 'y');
    if(x!==null && y!==null && (x===0 || y===0))anchors.push({x,y,strong:true,axisContact:true,pointIndex:i,seriesIndex:index});
  }
  for (const a of s.relationAnchors || []) {
    const find = (k,label) => ticks(k).find(t => normalizeTickLabel(t.displayMath ?? t.label) === normalizeTickLabel(label));
    const x = find('x',a.xTickLabel), y = find(s.axis || 'y',a.yTickLabel);
    if (x && y) anchors.push({x:x.value,y:y.value,strong:x.valueSource !== 'observed-position' && y.valueSource !== 'observed-position',relation:true,seriesIndex:index});
  }
  for (const a of plan.annotations || []) {
    if (!['guide', 'point', 'leader'].includes(a.kind) || a.seriesId !== s.id || !Number.isInteger(a.pointIndex)) continue;
    const point = s.points[a.pointIndex]; if (!point) continue;
    const p = a.coordinateSpace === 'normalized' && finite(a.x) && finite(a.y) && a.kind === 'point'
      ? {x:map.xmin+a.x*(map.xmax-map.xmin),y:map.ymin+a.y*(map.ymax-map.ymin)} : point;
    const sx = snap(p.x, 'x'), sy = snap(p.y, s.axis || 'y');
    anchors.push({ x: sx ?? p.x, y: sy ?? p.y, strong: sx !== null && sy !== null, annotationId: a.id, pointIndex: a.pointIndex, seriesIndex: index });
  }
  if (s.curveStyle === 'smooth') {
    const wave = tickExtremaSinusoid(s.points, plan, map, s.axis || 'y');
    if (wave) anchors.push(...wave.contacts.map(({ x, y, strong }) => ({ x, y, strong })));
  }
  return anchors;
}
function eligible(s) {
  if (s.physicsModel || s.kind !== 'points' || s.certainty !== 'observed' || s.coordinateSpace !== 'data') return false;
  if (s.closed || s.breaks?.length || s.lineVisible === false || (s.markerShape && s.markerShape !== 'none') || s.handlesMath || s.segmentModes?.length) return false;
  const pts = s.points; if (!Array.isArray(pts) || pts.length < 2 || pts.length > 512) return false;
  return pts.every((p, i) => finite(p.x) && finite(p.y) && (!i || p.x > pts[i - 1].x));
}
const KOREAN_REASON = { direction:'증가·감소 방향이 기준 함수와 맞지 않습니다.', distance: '원본 선과의 차이가 커서 식으로 바꾸지 못했습니다.', anchor: '보조선이 만나는 점을 지나는 간단한 식을 찾지 못했습니다.', extrema: '봉우리·골짜기 모양이 맞는 간단한 식을 찾지 못했습니다.', convexity: '휘는 방향이 맞는 간단한 식을 찾지 못했습니다.', clipped: '식이 그래프 범위를 벗어나 점 곡선으로 유지했습니다.', domain: '정의역에서 계산되지 않는 식이라 점 곡선으로 유지했습니다.' };

function resolveRelationTicks(plan) {
  const power = {'power-inverse-sqrt':-.5,'power-inverse':-1,'power-inverse-square':-2,'power-sqrt':.5,'power-square':2};
  // A named unknown tick (e.g. ㄱ) is solved from another known contact of the
  // same stated power law. Its printed height is only a sanity check.
  for(let pass=0;pass<(plan.series || []).length;pass++){
    let changed=false;
    for(const s of plan.series || []){
      const p=power[s.candidateFamily];if(p === undefined)continue;
      const refs=(s.relationAnchors || []).map(a=>({
        x:plan.axes.x.ticks.find(t=>normalizeTickLabel(t.displayMath ?? t.label)===normalizeTickLabel(a.xTickLabel)),
        y:plan.axes[s.axis || 'y'].ticks.find(t=>normalizeTickLabel(t.displayMath ?? t.label)===normalizeTickLabel(a.yTickLabel))
      })).filter(r=>r.x && r.y && r.x.valueSource!=='observed-position' && r.x.value>0);
      const known=refs.filter(r=>r.y.valueSource!=='observed-position');if(!known.length)continue;
      const coef=known[0].y.value/known[0].x.value**p;
      if(known.some(r=>Math.abs(coef*r.x.value**p-r.y.value)>1e-8))continue;
      const ay=plan.axes[s.axis || 'y'];
      for(const r of refs)if(r.y.valueSource==='observed-position'){
        const value=coef*r.x.value**p;
        const pos=(value-ay.min)/(ay.max-ay.min);
        if(!finite(value) || value<ay.min || value>ay.max || Math.abs(pos-r.y.sourcePosition)>PHYSICS_LIMITS.maxDistance)continue;
        r.y.value=value;r.y.valueSource='relation';r.y.relationSource={seriesId:s.id,family:s.candidateFamily};changed=true;
      }
    }
    if(!changed)break;
  }
}

function crossings(a, b, lo, hi, margin) {
  const found = []; let prev = null;
  for (let i = 0; i <= 256; i++) { const x = lo + (hi - lo) * i / 256, d = a(x) - b(x); if (!finite(d)) return null; const sign = Math.abs(d) < margin ? 0 : Math.sign(d); if (sign && prev && sign !== prev.sign) found.push((prev.x + x) / 2); if (sign) prev = { sign, x }; }
  return found;
}
function identifiable(f,family,params,anchors,map){
  if(!['sinusoid','exponential'].includes(family))return true;
  const step=(map.xmax-map.xmin)*1e-5;
  const derivative=x=>(f(x+step)-f(x-step))/(2*step);
  let rows=anchors.filter(a=>a.strong).map(a=>family==='sinusoid'
    ? [f(a.x),derivative(a.x),a.x*derivative(a.x),1]
    : params===2?[f(a.x),a.x*derivative(a.x)]:[f(a.x),a.x*derivative(a.x),1]);
  if(rows.length<params || rows.some(r=>!r.every(finite)))return false;
  for(let j=0;j<params;j++){const scale=Math.max(...rows.map(r=>Math.abs(r[j])));for(const row of rows)row[j]=scale>1e-6?row[j]/scale:0;}
  let rank=0;
  for(let col=0;col<params && rank<rows.length;col++){
    let at=rank;for(let i=rank+1;i<rows.length;i++)if(Math.abs(rows[i][col])>Math.abs(rows[at][col]))at=i;
    if(Math.abs(rows[at][col])<1e-6)continue;[rows[rank],rows[at]]=[rows[at],rows[rank]];
    const v=rows[rank][col];for(let j=col;j<params;j++)rows[rank][j]/=v;
    for(let i=rank+1;i<rows.length;i++){const q=rows[i][col];for(let j=col;j<params;j++)rows[i][j]-=q*rows[rank][j];}rank++;
  }
  return rank===params;
}
function traceEvaluator(trace) { let i = 0; return x => { while (i < trace.length - 2 && trace[i + 1].x < x) i++; while (i > 0 && trace[i].x > x) i--; const a = trace[i], b = trace[i + 1] || a; return b.x === a.x ? a.y : a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x); }; }

export function fitPhysicsGraphPlan(input) {
  const plan = clone(input), conversions = [], rejected = [], results = [];
  if (!plan || plan.coordinateMode === 'observed') return { plan, conversions, rejected };
  resolveRelationTicks(plan);
  (plan.series || []).forEach((s, index) => {
    if (!eligible(s)) return;
    const map = displayMap(plan, s.axis || 'y'); if (!map) return;
    const straight = s.curveStyle !== 'smooth';
    const display = s.points.map(p => ({ x: map.X(p.x), y: map.Y(p.y) }));
    if (straight) { // only a single straight segment chain that is truly one line
      const a = display[0], b = display.at(-1);
      if (display.some(p => segDist(p, a, b) > 0.01)) return;
    }
    const anchors = collectAnchors(plan, s, index, map);
    const strong=anchors.filter(a=>a.strong);
    if(['sinusoid','periodic'].includes(s.candidateFamily) && strong.length && strong.every(a=>Math.abs(a.y-strong[0].y)<1e-9) && !tickExtremaSinusoid(s.points, plan, map, s.axis || 'y')){
      rejected.push({seriesId:s.id,reason:'같은 높이의 기준점만으로 진폭과 주기를 정할 수 없습니다.'});return;
    }
    const weighted = [...s.points.map(p => ({ x: p.x, y: p.y, w: 1 })), ...anchors.map(a => ({ x: a.x, y: a.y, w: a.strong ? 40 : 6 }))];
    const preferred = FAMILY_ALIASES[s.candidateFamily] || [];
    const seen = new Set(), candidates = [];
    let bestFailure = null;
    for (const c of familyCandidates(weighted, s, map, straight, anchors, plan)) {
      if (preferred.length && !preferred.includes(c.family)) continue;
      if(!c.extremumIdentified && new Set(anchors.filter(a=>a.strong).map(a=>a.x+','+a.y)).size<c.params)continue;
      if (seen.has(c.expression)) continue; seen.add(c.expression);
      const m = measurePhysicsCandidate(c.expression, s.points, anchors, plan, s.axis || 'y', s.curveStyle || 'straight');
      if (!m.ok) { if (m.reason && (!bestFailure || (m.maxDeviation ?? 9) < (bestFailure.maxDeviation ?? 9))) bestFailure = m; continue; }
      if(!c.extremumIdentified && !identifiable(m.f,c.family,c.params,anchors,map))continue;
      const nums = (c.expression.match(/\d+(?:\.\d+)?/g) || []).map(Number);
      const cost = nums.reduce((t, v) => t + niceCost(v), 0);
      const score = m.rmsDeviation + 0.006 * c.params + 0.0015 * cost + 0.0004 * c.expression.length - (preferred.includes(c.family) ? 0.006 : 0);
      candidates.push({ ...c, ...m, score });
    }
    results.push({ s, index, anchors, map, candidates: candidates.sort((a, b) => a.score - b.score), failure: bestFailure });
  });
  // Each curve keeps its own stated family and reference constraints.
  const chosen = new Map();
  for (const r of results) {
    if (!r.candidates.length) {
      rejected.push({ seriesId: r.s.id, reason: r.anchors.some(a=>a.strong) ? (KOREAN_REASON[r.failure?.reason] || '기준점만으로 계수를 정할 수 있는 간단한 식을 찾지 못했습니다.') : '계수를 계산할 확정 기준점이 부족합니다.', best: r.failure ? { maxDeviation: r.failure.maxDeviation, rmsDeviation: r.failure.rmsDeviation } : null });
      continue;
    }
    // A panel can contain unrelated laws: never override a curve's own family.
    chosen.set(r.s.id, { r, c: r.candidates[0] });
  }
  // Fitted curves must keep the drawn crossing topology between curves.
  for (const [id, { r, c }] of [...chosen]) {
    for (const other of results) {
      if (other.s.id === id || (other.s.axis || 'y') !== (r.s.axis || 'y')) continue;
      const ta = denseTrace(r.s.points.map(p => ({ x: r.map.X(p.x), y: r.map.Y(p.y) })), r.s.curveStyle), tb = denseTrace(other.s.points.map(p => ({ x: other.map.X(p.x), y: other.map.Y(p.y) })), other.s.curveStyle);
      const lo = Math.max(ta[0].x, tb[0].x), hi = Math.min(ta.at(-1).x, tb.at(-1).x); if (hi - lo < 0.02) continue;
      const fa = u => r.map.Y(c.f(r.map.xmin + u * (r.map.xmax - r.map.xmin)));
      const oc = chosen.get(other.s.id)?.c, fb = oc ? (u => other.map.Y(oc.f(other.map.xmin + u * (other.map.xmax - other.map.xmin)))) : traceEvaluator(tb);
      const before = crossings(traceEvaluator(ta), traceEvaluator(tb), lo, hi, 0.012), after = crossings(fa, fb, lo, hi, 0.012);
      if (!before || !after || before.length !== after.length || before.some((x, i) => Math.abs(x - after[i]) > 0.05)) { chosen.delete(id); rejected.push({ seriesId: id, reason: '곡선끼리 만나는 위치가 원본과 달라 식으로 바꾸지 않았습니다.' }); break; }
    }
  }
  for (const [id, { r, c }] of chosen) {
    const s = plan.series[r.index], source = clone(s.points);
    s.kind = 'expression'; s.expression = c.expression; s.domain = { min: source[0].x, max: source.at(-1).x }; s.observedPoints = source;
    s.approximation = { provenance: 'image-fit', method: PHYSICS_FIT_VERSION, family: c.family, tolerance: { ...PHYSICS_LIMITS }, maxDeviation: c.maxDeviation, rmsDeviation: c.rmsDeviation, bias: c.bias, anchorDeviation: c.anchorDeviation,
      anchors: r.anchors.map(a => ({ x: a.x, y: a.y, strong: a.strong })), errorSpace: 'normalized-display-distance', sourceCurveStyle: s.curveStyle || 'straight',
      coefficientSource: 'relation-anchors', ...(c.extremumIdentified?{constraintMethod:c.constraintMethod || 'extremum-relations'}:{}), parameterCount:c.params, pole:c.pole ?? 0, sourceFamily:s.candidateFamily === 'none' ? null : s.candidateFamily || null };
    for (const e of s.endpoints || []) {
      const p = source[e.index];
      plan.annotations.push({ id: `${s.id}-endpoint-${e.index}`, kind: 'point', text: '', orientation: 'horizontal',
        x: p.x, y: c.f(p.x), anchorX: p.x, coordinateSpace: 'data', seriesId: s.id, axis: s.axis || 'y', endStyle: e.kind,
        ...(e.markerSize === undefined && s.markerSize === undefined ? {} : { markerSize: e.markerSize ?? s.markerSize }),
        ...(e.fillLevel === undefined ? {} : { fillLevel: e.fillLevel }),
        ...(s.strokeWidth === undefined && plan.style?.strokeWidth === undefined ? {} : { strokeWidth: s.strokeWidth ?? plan.style.strokeWidth }) });
    }
    if (s.arrowSpecs?.length) {
      const handles = s.curveStyle === 'smooth' ? shapePreservingHandles(source, []) : [];
      s.arrowSpecs = s.arrowSpecs.map(({ segmentIndex, t, ...style }) => ({
        ...style, x: sampleShapeSegment(source, handles, segmentIndex, t, s.curveStyle === 'smooth' ? [] : Array(source.length - 1).fill('line')).x
      }));
    }
    delete s.endpoints;
    delete s.points; delete s.handlesMath; delete s.segmentModes; delete s.fit; delete s.candidateExpression; delete s.candidateFamily; delete s.analyticFitFailure;
    for (const a of plan.annotations || []) {
      if (a.seriesId !== s.id || !Number.isInteger(a.pointIndex)) continue;
      const anchor = r.anchors.find(q => q.annotationId === a.id), contact = anchor || source[a.pointIndex]; if (!contact) continue;
      if (a.coordinateSpace === 'normalized') { a.anchorX = r.map.X(contact.x); if (anchor?.strong && a.kind === 'point') { a.x = r.map.X(anchor.x); a.y = r.map.Y(anchor.y); } }
      else { a.anchorX = contact.x; if (anchor?.strong && a.kind === 'point') { a.x = anchor.x; a.y = anchor.y; } }
      if (a.kind === 'leader' && a.to && anchor?.strong) a.to = a.coordinateSpace === 'normalized' ? { x: r.map.X(anchor.x), y: r.map.Y(anchor.y) } : { x: anchor.x, y: anchor.y };
      a.sourcePointIndex = a.pointIndex; delete a.pointIndex;
    }
    conversions.push({ seriesId: id, family: c.family, expression: c.expression, maxDeviation: c.maxDeviation, rmsDeviation: c.rmsDeviation, anchors: r.anchors.filter(a => a.strong).length });
  }
  return { plan, conversions, rejected };
}

export function checkPhysicsApproximation(series, plan) {
  const a = series.approximation;
  if (!a || a.method !== PHYSICS_FIT_VERSION || a.provenance !== 'image-fit' || series.certainty !== 'observed' || series.coordinateSpace !== 'data') return { ok: false, reason: 'Physics approximation requires observed data-space provenance' };
  const obs = series.observedPoints;
  if (!Array.isArray(obs) || obs.length < 2 || obs.length > 512 || obs.some((p, i) => !p || !finite(p.x) || !finite(p.y) || (i && p.x <= obs[i - 1].x))) return { ok: false, reason: 'Approximate domain must match an increasing observed function' };
  if (!series.domain || series.domain.min !== obs[0].x || series.domain.max !== obs.at(-1).x || typeof series.expression !== 'string' || series.expression.length > 2048) return { ok: false, reason: 'Approximate domain must match observations' };
  if (!Array.isArray(a.anchors) || a.anchors.length > 64 || a.anchors.some(q => !q || !finite(q.x) || !finite(q.y) || typeof q.strong !== 'boolean')) return { ok: false, reason: 'Invalid relation anchors' };
  if (!['smooth','straight'].includes(a.sourceCurveStyle) || a.errorSpace !== 'normalized-display-distance' || Object.keys(PHYSICS_LIMITS).some(k => a.tolerance?.[k] !== PHYSICS_LIMITS[k])) return {ok:false,reason:'Invalid physics measurement policy'};
  if(a.sourceFamily && a.sourceFamily !== 'none' && !(FAMILY_ALIASES[a.sourceFamily] || []).includes(a.family))return {ok:false,reason:'Formula changes the stated physics family'};
  const counts={linear:[1,2],quadratic:[3],sinusoid:[4],exponential:[2,3],'power-2':[1,2],'power-1':[1,2],'power-0.5':[1,2],'power0.5':[1,2],power1:[1,2],power2:[1,2]};
  if(!counts[a.family]?.includes(a.parameterCount))return {ok:false,reason:'Invalid physics parameter count'};
  if(!finite(a.pole) || (a.pole!==0 && !plan.axes.x.ticks?.some(t=>t.valueSource!=='observed-position' && t.value===a.pole)))return {ok:false,reason:'A shifted pole requires a known reference tick'};
  const source={...series,kind:'points',points:obs};
  const before={...plan,annotations:(plan.annotations || []).map(n=>({...n,pointIndex:n.sourcePointIndex ?? n.pointIndex}))};
  const expected=collectAnchors(before,source,0,displayMap(plan,series.axis || 'y'));
  if(expected.length!==a.anchors.length || expected.some((q,i)=>q.strong!==a.anchors[i].strong || Math.abs(q.x-a.anchors[i].x)>1e-8 || Math.abs(q.y-a.anchors[i].y)>1e-8))return {ok:false,reason:'Relation anchor provenance does not match saved contacts'};
  if (series.closed || series.lineVisible === false || (series.markerShape && series.markerShape !== 'none') || series.breaks?.length || series.endpoints?.length) return { ok: false, reason: 'Approximate expression cannot reinterpret discrete geometry' };
  const m = measurePhysicsCandidate(series.expression, obs, a.anchors, plan, series.axis || 'y', a.sourceCurveStyle);
  if (!m.ok) return { ok: false, reason: 'Formula does not match observations, anchors or shape: ' + m.reason };
  const extremumIdentified = a.family==='sinusoid' && (
    a.constraintMethod === 'extremum-relations' && extremumSinusoids(obs,a.anchors,displayMap(plan,series.axis || 'y')).some(c=>c.expression===series.expression)
    || a.constraintMethod === 'tick-extrema-zero-relations' && tickExtremaSinusoid(obs,plan,displayMap(plan,series.axis || 'y'),series.axis || 'y')?.expression === series.expression);
  if(a.constraintMethod!==undefined && !extremumIdentified)return {ok:false,reason:'Extremum constraints do not reproduce the saved formula'};
  if(a.coefficientSource!=='relation-anchors' || !Number.isInteger(a.parameterCount) || a.parameterCount<1 || a.parameterCount>4 || !extremumIdentified && (new Set(a.anchors.filter(q=>q.strong).map(q=>q.x+','+q.y)).size<a.parameterCount || !identifiable(m.f,a.family,a.parameterCount,a.anchors,displayMap(plan,series.axis || 'y'))))return {ok:false,reason:'Reference contacts do not identify the formula parameters'};
  if (['maxDeviation','rmsDeviation','bias','anchorDeviation'].some(k => !finite(a[k]) || Math.abs(m[k]-a[k])>1e-6)) return { ok: false, reason: 'Recorded fitting error does not match' };
  return { ok: true, ...m };
}

// Shared relation extraction and display measurement for the bounded analytic fallback.
export { collectAnchors as collectPhysicsAnchors, displayMap as physicsDisplayMap };

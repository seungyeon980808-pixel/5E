/* ===== FUNCTION-GRAPH / SAMPLER: expr + domain + plane → world-mm points ===== */
//
// Ties the parser and the coord mapping together (기획서 §5): compile the formula,
// sample it across the domain, map each (x, f(x)) to world mm on the plane, drop
// non-finite results (out-of-domain / poles → the stroke simply skips them), then
// RDP-simplify to keep the point count modest.
//
// The output points[] are BAKED world coordinates — the funcgraph then renders,
// hit-tests, and exports exactly like an open `curve` (no special-case code).

import { compile } from "./parser.js?v=0.54.1";
import { worldXFromMathX, worldYFromMathY } from "./coords.js?v=0.54.1";
import { simplifyRDP } from "../geometry.js?v=0.54.1";

const DEFAULT_SAMPLES = 900;   // evenly across the domain before simplification
const DEFAULT_EPS_MM = 0.07;   // RDP tolerance (world mm); ~5× denser → smooth curve

/* ----- sample expr over [domainMin, domainMax] → { points, error } -----
 * error is a user-facing string when the formula won't compile / the domain is
 * empty; otherwise null. On error points is []. Non-finite f(x) (NaN/±Inf) ends
 * the current run so the curve breaks rather than drawing a spike across a pole
 * (MVP: runs are concatenated into one points[]; precise 구간 분할 is an extension). */
function sampleFunctionPoints(expr, domainMin, domainMax, plane, opts = {}) {
  const samples = Math.max(2, Math.floor(opts.samples || DEFAULT_SAMPLES));
  const eps = opts.epsMm ?? DEFAULT_EPS_MM;

  let fn;
  try { fn = compile(expr); }
  catch (err) { return { points: [], error: err.message }; }

  const lo = Math.min(domainMin, domainMax);
  const hi = Math.max(domainMin, domainMax);
  if (!(hi > lo)) return { points: [], error: "정의역이 비어 있습니다" };

  // Collect runs of consecutive finite samples; a non-finite value breaks the run.
  const runs = [];
  let run = [];
  for (let i = 0; i <= samples; i++) {
    const mx = lo + (hi - lo) * (i / samples);
    const my = fn(mx);
    if (Number.isFinite(my)) {
      run.push({ x: worldXFromMathX(plane, mx), y: worldYFromMathY(plane, my) });
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);

  let points = [];
  for (const r of runs) {
    points = points.concat(r.length > 2 ? simplifyRDP(r, eps) : r);
  }
  return { points, error: null };
}

export { sampleFunctionPoints, DEFAULT_SAMPLES, DEFAULT_EPS_MM };

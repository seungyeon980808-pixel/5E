/* ===== FUNCTION-GRAPH / SAMPLER: expr + domain + plane → world-mm points ===== */
//
// Ties the parser and the coord mapping together (기획서 §5): compile the formula,
// sample it across the domain, map each (x, f(x)) to world mm on the plane, drop
// non-finite results (out-of-domain / poles → the stroke simply skips them), then
// RDP-simplify to keep the point count modest.
//
// The output points[] are BAKED world coordinates — the funcgraph then renders,
// hit-tests, and exports exactly like an open `curve` (no special-case code).

import { compile } from "./parser.js?v=1.0.4";
import { worldXFromMathX, worldYFromMathY } from "./coords.js?v=1.0.4";
import { simplifyRDP } from "../geometry.js?v=1.0.4";

const DEFAULT_SAMPLES = 1600;  // evenly across the domain before simplification
                               // (고주파 함수 여유 — sin/cos(10x) 등에서 봉우리 표현 부족 방지)
const DEFAULT_EPS_MM = 0.02;   // RDP tolerance (world mm). 0.07→0.02: 봉우리당 점을 더 남겨
                               // 고주파 함수가 각진 스파이크 대신 부드러운 곡선으로 그려지게 한다.

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

  // 평면의 표시 y범위 — 이 밖으로 나가는 값은 run을 끊어(평면 밖으로 돌출하거나 점근선을
  // 가로지르는 가짜 세로선이 그려지지 않게) 렌더러가 별도 서브패스로 그리게 한다.
  const yLo = Math.min(plane.yMin, plane.yMax);
  const yHi = Math.max(plane.yMin, plane.yMax);

  // Collect runs of consecutive finite, in-range samples; a non-finite OR out-of-range
  // value breaks the run.
  const runs = [];
  let run = [];
  for (let i = 0; i <= samples; i++) {
    const mx = lo + (hi - lo) * (i / samples);
    const my = fn(mx);
    if (Number.isFinite(my) && my >= yLo && my <= yHi) {
      run.push({ x: worldXFromMathX(plane, mx), y: worldYFromMathY(plane, my) });
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);

  // 여러 run(평면 밖으로 나갔다 돌아온 구간)을 한 배열로 이어붙이되, 새 run이 시작하는
  // 인덱스를 breaks[]로 함께 돌려준다. 이 경계 정보가 없으면 렌더러가 화면 밖으로 나간
  // 조각들을 가짜 직선(고원·바닥선)으로 이어버린다(1사분면에서 sin/cos가 개판이 되던 원인).
  let points = [];
  const breaks = [];
  for (const r of runs) {
    const simp = r.length > 2 ? simplifyRDP(r, eps) : r;
    if (!simp.length) continue;
    if (points.length) breaks.push(points.length);   // 이 지점부터 새 run(선을 끊어야 함)
    points = points.concat(simp);
  }
  return { points, breaks, error: null };
}

export { sampleFunctionPoints, DEFAULT_SAMPLES, DEFAULT_EPS_MM };

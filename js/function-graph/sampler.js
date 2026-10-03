/* ===== FUNCTION-GRAPH / SAMPLER: expr + domain + plane → world-mm points ===== */
//
// Ties the parser and the coord mapping together (기획서 §5): compile the formula,
// sample it across the domain, map each (x, f(x)) to world mm on the plane, drop
// non-finite results (out-of-domain / poles → the stroke simply skips them), then
// RDP-simplify to keep the point count modest.
//
// The output points[] are BAKED world coordinates — the funcgraph then renders,
// hit-tests, and exports exactly like an open `curve` (no special-case code).

import { compile } from "./parser.js?v=1.6.0-preview-labeler-0917-1111";
import { worldXFromMathX, worldYFromMathY } from "./coords.js?v=1.6.0-preview-labeler-0917-1111";
import { simplifyRDP } from "../geometry.js?v=1.6.0-preview-labeler-0917-1111";

const DEFAULT_SAMPLES = 1600;  // evenly across the domain before simplification
                               // (고주파 함수 여유 — sin/cos(10x) 등에서 봉우리 표현 부족 방지)
const DEFAULT_EPS_MM = 0.02;   // RDP tolerance (world mm). 0.07→0.02: 봉우리당 점을 더 남겨
                               // 고주파 함수가 각진 스파이크 대신 부드러운 곡선으로 그려지게 한다.
const MAX_SAMPLE_POINTS = 4000;
const DETAIL_PROBES = [0.211324865405187, 0.5, 0.788675134594813];
const JUMP_FUNCTION_RE = /\b(?:sign|floor|ceil|round)\s*\(/i;

function linearErrorMm(a, b, probe, t, plane) {
  if (![a, b, probe].every(Number.isFinite)) return Infinity;
  const expected = a + (b - a) * t;
  return Math.abs(worldYFromMathY(plane, probe) - worldYFromMathY(plane, expected));
}

function isJumpCell(values, ySpan) {
  const [left, q1, mid, q3, right] = values;
  if (!values.every(Number.isFinite)) return false;
  const jump = Math.abs(right - left);
  const minJump = Math.max(ySpan * 1e-6, 1e-9);
  if (jump <= minJump) return false;
  const near = (a, b) => Math.abs(a - b) <= Math.max(jump * 0.08, minJump);
  return (near(q1, left) && near(q3, right))
    || (near(q1, left) && near(mid, left) && near(q3, left))
    || (near(q1, right) && near(mid, right) && near(q3, right));
}

function locateJump(fn, lo, hi, leftValue, xTolerance) {
  let left = lo;
  let right = hi;
  for (let i = 0; i < 52 && right - left > xTolerance; i++) {
    const mid = (left + right) / 2;
    const value = fn(mid);
    if (Object.is(value, leftValue) || Math.abs(value - leftValue) <= Number.EPSILON * 8) left = mid;
    else right = mid;
  }
  return { left, right };
}

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
  // opts.yRange(치역)가 있으면 더 좁은 쪽을 쓴다. 자르기는 반드시 '여기서' 해야 한다 —
  // 아래 RDP 단순화를 거친 성긴 점을 나중에 자르면 조각마다 점이 두어 개만 남아
  // 곡선 보간이 크게 튀고(세로 스파이크) 모양이 망가진다.
  let yLo = Math.min(plane.yMin, plane.yMax);
  let yHi = Math.max(plane.yMin, plane.yMax);
  if (opts.yRange && Number.isFinite(opts.yRange.min) && Number.isFinite(opts.yRange.max)) {
    yLo = Math.max(yLo, Math.min(opts.yRange.min, opts.yRange.max));
    yHi = Math.min(yHi, Math.max(opts.yRange.min, opts.yRange.max));
  }

  const cache = new Map();
  const valueAt = (x) => {
    if (!cache.has(x)) cache.set(x, fn(x));
    return cache.get(x);
  };
  const step = (hi - lo) / samples;
  const ySpan = Math.max(1e-12, yHi - yLo);
  const hasJumpFunction = JUMP_FUNCTION_RE.test(expr);

  // 균등 격자만 보면 주기와 간격이 맞아 모든 점이 0으로 겹칠 수 있다. 각 칸의 서로 다른
  // 세 위상에서 직선 보간 오차를 먼저 재고, 필요한 세부점이 예산을 넘으면 틀린 직선을
  // 성공으로 저장하지 않고 사용자에게 범위를 줄여 달라고 알린다.
  let projectedPoints = samples + 1;
  const detailByCell = [];
  for (let i = 0; i < samples; i++) {
    const x0 = lo + step * i;
    const x1 = i === samples - 1 ? hi : lo + step * (i + 1);
    const y0 = valueAt(x0);
    const y1 = valueAt(x1);
    const probes = DETAIL_PROBES.map((t) => ({ t, x: x0 + (x1 - x0) * t }));
    const values = [y0, ...probes.map((probe) => valueAt(probe.x)), y1];
    const jump = hasJumpFunction && isJumpCell(values, ySpan);
    const detail = jump ? [] : probes.filter((probe, index) => linearErrorMm(y0, y1, values[index + 1], probe.t, plane) > eps);
    projectedPoints += detail.length + (jump ? 1 : 0);
    detailByCell.push({ x0, x1, y0, y1, probes, values, jump, detail });
  }
  if (projectedPoints > MAX_SAMPLE_POINTS) {
    return {
      points: [], breaks: [],
      error: `이 범위의 함수는 표시 세부점 예산(${MAX_SAMPLE_POINTS.toLocaleString("ko-KR")}개)을 넘습니다. 정의역을 줄여 주세요.`,
    };
  }

  // Collect runs of consecutive finite, in-range samples; a non-finite OR out-of-range
  // value breaks the run. 계단 함수의 점프는 수학 x에서 이분 탐색해 양쪽 run의 끝점을
  // 보존한다. 가파른 연속 함수는 이 분기를 타지 않아 잘못 끊기지 않는다.
  const runs = [];
  let run = [];
  const append = (mx, my) => {
    if (Number.isFinite(my) && my >= yLo && my <= yHi) {
      run.push({ x: worldXFromMathX(plane, mx), y: worldYFromMathY(plane, my) });
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  };
  append(lo, valueAt(lo));
  for (const cell of detailByCell) {
    if (cell.jump) {
      const xTolerance = Math.abs(hi - lo) * (eps / Math.max(Math.abs(plane.w), eps));
      const edge = locateJump(valueAt, cell.x0, cell.x1, cell.y0, xTolerance);
      append(edge.left, valueAt(edge.left));
      if (run.length) { runs.push(run); run = []; }
      append(edge.right, valueAt(edge.right));
    } else {
      for (const probe of cell.detail) append(probe.x, valueAt(probe.x));
    }
    append(cell.x1, cell.y1);
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

export { sampleFunctionPoints, DEFAULT_SAMPLES, DEFAULT_EPS_MM, MAX_SAMPLE_POINTS };

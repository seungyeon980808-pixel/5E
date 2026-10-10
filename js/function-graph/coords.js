/* ===== FUNCTION-GRAPH / COORDS: math ↔ world-mm mapping for a coordplane ===== */
//
// The SINGLE source of truth for "수학 좌표 ↔ 월드 mm" (기획서 결정 C / §4). A
// coordplane owns a draw box (x,y,w,h in world mm) and a display range
// (xMin..xMax × yMin..yMax in math units); "1단위 = N mm" is NOT stored — it is
// derived here so the plane and every graph on it resize together (bbox is truth).
//
// Shared by the sampler, the preview modal, the inspector, and (extension) graph
// markers — so a graph drawn in the preview lands identically on the canvas.
//
// Convention: +X points right, +Y points UP → world y is flipped (math-up =
// screen-up = smaller SVG y). This module is PURE: no imports, no DOM.

/* ----- derived scale: mm per one math unit on each axis ----- */
// A degenerate range (xMax === xMin) would divide by zero; we return unit 0 so
// the mapping collapses to the box origin instead of producing NaN/Infinity.
function axisLog(P, axis) { return P[`${axis}Scale`] === 'log'; }
function logRangeValid(min, max) { return Number.isFinite(min) && Number.isFinite(max) && min > 0 && max > min; }
function coordinateTicks(P, axis, step = 1) {
  const min = P[`${axis}Min`], max = P[`${axis}Max`];
  if (axisLog(P, axis)) {
    if (!logRangeValid(min, max)) return [];
    const ticks = [];
    for (let exponent = Math.ceil(Math.log10(min) - 1e-12); exponent <= Math.floor(Math.log10(max) + 1e-12); exponent++) ticks.push(10 ** exponent);
    return ticks;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(step > 0) || !Number.isFinite(step)) return [];
  const ticks = [];
  for (let i = Math.ceil(min / step); i <= Math.floor(max / step) && ticks.length < 2000; i++) ticks.push(i * step);
  return ticks;
}

function planeUnits(P) {
  const dx = axisLog(P, "x") ? Math.log10(P.xMax) - Math.log10(P.xMin) : P.xMax - P.xMin;
  const dy = axisLog(P, "y") ? Math.log10(P.yMax) - Math.log10(P.yMin) : P.yMax - P.yMin;
  return {
    unitX: dx !== 0 ? P.w / dx : 0,   // mm per math x-unit
    unitY: dy !== 0 ? P.h / dy : 0,   // mm per math y-unit
  };
}

/* ----- math → world (per axis) ----- */
function worldXFromMathX(P, mx) {
  if (axisLog(P, 'x')) return logRangeValid(P.xMin, P.xMax) && mx > 0 && Number.isFinite(mx)
    ? P.x + (Math.log10(mx) - Math.log10(P.xMin)) * P.w / (Math.log10(P.xMax) - Math.log10(P.xMin)) : NaN;
  const dx = P.xMax - P.xMin;
  return P.x + (dx !== 0 ? (mx - P.xMin) * (P.w / dx) : 0);
}
function worldYFromMathY(P, my) {
  if (axisLog(P, 'y')) return logRangeValid(P.yMin, P.yMax) && my > 0 && Number.isFinite(my)
    ? P.y + (Math.log10(P.yMax) - Math.log10(my)) * P.h / (Math.log10(P.yMax) - Math.log10(P.yMin)) : NaN;
  const dy = P.yMax - P.yMin;
  // y flip: math yMax sits at the TOP of the box (smaller SVG y).
  return P.y + (dy !== 0 ? (P.yMax - my) * (P.h / dy) : 0);
}
function worldFromMath(P, mx, my) {
  return { x: worldXFromMathX(P, mx), y: worldYFromMathY(P, my) };
}

/* ----- world → math (per axis) — inverse of the above ----- */
// Used by the 정의역 드래그(화면→수학 x 환산) and hit-mapping.
function mathXFromWorldX(P, wx) {
  if (axisLog(P, 'x')) return logRangeValid(P.xMin, P.xMax)
    ? (P.w !== 0 ? 10 ** (Math.log10(P.xMin) + (wx - P.x) / P.w * (Math.log10(P.xMax) - Math.log10(P.xMin))) : P.xMin) : NaN;
  return P.w !== 0 ? P.xMin + (wx - P.x) * ((P.xMax - P.xMin) / P.w) : P.xMin;
}
function mathYFromWorldY(P, wy) {
  if (axisLog(P, 'y')) return logRangeValid(P.yMin, P.yMax)
    ? (P.h !== 0 ? 10 ** (Math.log10(P.yMax) - (wy - P.y) / P.h * (Math.log10(P.yMax) - Math.log10(P.yMin))) : P.yMax) : NaN;
  return P.h !== 0 ? P.yMax - (wy - P.y) * ((P.yMax - P.yMin) / P.h) : P.yMax;
}
function mathFromWorld(P, wx, wy) {
  return { x: mathXFromWorldX(P, wx), y: mathYFromWorldY(P, wy) };
}

/* ===== 오른쪽 세로축(y2) — 좌우 이중 y축 =====
 * 생명과학 자료해석 문항의 정형 형식(왼쪽 축과 오른쪽 축의 이름·눈금이 서로 다름).
 * 위의 worldYFromMathY는 옛 저장 파일 전부가 통과하는 단일 진리원이므로 절대 건드리지 않고,
 * y2 전용 매핑을 여기에 '덧붙인다'. 판(box)의 세로 높이 P.h는 그대로 쓰고, 대응시키는
 * 수학 범위만 y2Min~y2Max로 바꾼 선형 대응이다. y2 설정이 없으면 왼쪽 축과 동일해진다.
 * 저장 스키마: P.y2 = { enabled, labelY2, y2Min, y2Max, gridStepY2, tickStepY2,
 *                      tickTextY2, showTickY2 } — 기존 y 필드는 손대지 않는다. */
function hasY2(P) { return !!(P && P.y2 && P.y2.enabled); }
function y2RangeOf(P) {
  const c = (P && P.y2) || {};
  return {
    min: Number.isFinite(c.y2Min) ? c.y2Min : P.yMin,
    max: Number.isFinite(c.y2Max) ? c.y2Max : P.yMax,
  };
}
function worldYFromMathY2(P, my) {
  return worldYFromMathY(planeAsY2(P), my);
}
function mathY2FromWorldY(P, wy) {
  return mathYFromWorldY(planeAsY2(P), wy);
}
// y2 축을 '왼쪽 축인 척' 하는 평면 뷰로 바꿔 준다. 계열을 y2 스케일로 굽는 코드(샘플러·
// 베이크·미리보기)가 worldFromMath 등 기존 함수를 그대로 쓰게 하는 얇은 어댑터다 —
// 덕분에 y2 지원 때문에 매핑 호출부를 여기저기 분기시키지 않아도 된다.
function planeAsY2(P) {
  const r = y2RangeOf(P);
  const c = (P && P.y2) || {};
  const gs = Number.isFinite(c.gridStepY2) && c.gridStepY2 > 0 ? c.gridStepY2 : (P.gridStepY || 1);
  const ts = Number.isFinite(c.tickStepY2) && c.tickStepY2 > 0 ? c.tickStepY2 : gs;
  return { ...P, yMin: r.min, yMax: r.max, yScale: c.scale || 'linear', gridStepY: gs, tickStepY: ts };
}

/* ----- world coords of the math origin (0,0) ----- */
// The axis crosses the visible box only when 0 is inside the corresponding range;
// callers that draw the axis lines test that separately (0 in [xMin,xMax] etc.).
function originWorld(P) {
  return { x: worldXFromMathX(P, axisLog(P, 'x') ? P.xMin : 0), y: worldYFromMathY(P, axisLog(P, 'y') ? P.yMin : 0) };
}

export {
  planeUnits, coordinateTicks, logRangeValid,
  worldFromMath, worldXFromMathX, worldYFromMathY,
  mathFromWorld, mathXFromWorldX, mathYFromWorldY,
  originWorld,
  hasY2, y2RangeOf, worldYFromMathY2, mathY2FromWorldY, planeAsY2,
};

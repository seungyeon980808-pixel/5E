/* ===== FUNCTION-GRAPH / DEFAULTS: shared coordplane factory ===== */
//
// Single source for the default coordplane schema (기획서 §3-1), used by BOTH the
// 좌표평면 palette button (templates.js) and the function-graph inserter
// (insert.js) so they never drift. Pure data — returns an object WITHOUT
// id/order/layerId (the caller stamps those when committing).

const DEFAULT_STROKE_WIDTH = 0.2; // world mm — matches templates.js/tools.js shapes

function makeDefaultCoordplane(at) {
  const xMin = -5, xMax = 5, yMin = -5, yMax = 5;
  // Box derived from a target cell size so cells are SQUARE (unitX === unitY).
  // 6mm/unit → 60×60, fits the 90×60 artboard height; lockAspect keeps it square.
  const cellMm = 6;
  const w = cellMm * (xMax - xMin); // 60
  const h = cellMm * (yMax - yMin); // 60
  return {
    type: "coordplane",
    x: at.x - w / 2,
    y: at.y - h / 2,
    w,
    h,
    rotation: 0,
    lockAspect: true,               // resize keeps the box square → cells stay square
    axisVariant: "cross",           // 형태: "cross"(십자) | "quadrant"(L자) | "single"(직선)
    xMin, xMax,                     // display range (math units)
    yMin, yMax,
    gridStepX: 1, gridStepY: 1,     // grid/tick spacing (math units)
    showAxisLines: true,
    showGrid: true,                 // 평가원 양식: 격자 기본 on (미리보기·결과 동일)
    showTicks: true,
    showTickLabels: false,          // numeric labels — coordplane-only feature
    tickLabelSize: 2.6,             // mm
    labelX: "x", labelY: "y",
    labelType: "quantity",
    exportable: true,               // 요구 6: 평면 출력 on/off
    strokeLevel: 0,                 // 0 = black (DESIGN 2-2)
    strokeWidth: DEFAULT_STROKE_WIDTH,
    locked: false,
    positionLocked: false,
  };
}

export { makeDefaultCoordplane };

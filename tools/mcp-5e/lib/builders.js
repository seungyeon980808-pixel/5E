/* ===== BUILDERS — 좌표 계산이 필요한 "레시피" =====
 *
 * 저수준 add_objects만 있으면 회로도 하나 그리는 데 좌표를 20개 넘게 손으로 잡아야 하고,
 * LLM은 거기서 반드시 틀린다. 자주 그리는 두 가지(폐회로·좌표그래프)만 여기서 계산한다.
 */

import { sampleFunctionPoints } from "../../../js/function-graph/sampler.js";
import { worldXFromMathX, worldYFromMathY } from "../../../js/function-graph/coords.js";
import { CIRCUIT_BODY_MM } from "./schema.js";

const DEFAULT_ELEMENT_SPAN = 14;   // 소자 하나가 차지하는 단자간 거리(mm). 몸통 8 + 리드 3+3
const SIDES = ["top", "right", "bottom", "left"];

/* ===== 회로: 사각 폐회로 =====
 * box 둘레를 따라 소자를 놓고, 빈 구간은 line으로 이어 붙인다. 전원은 기본으로 왼쪽 변,
 * 나머지는 윗변에 균등 배치한다(시험지 회로도의 표준 배치).
 *
 * elements: [{ element, side?, t?, span?, label?, height?, gap? }]
 * branches: [{ at: 0..1, elements: [...] }]  — 위/아래 변을 잇는 세로 가지(병렬)
 */
export function buildCircuitLoop({ box, elements = [], branches = [], strokeWidth = 0.2 }) {
  const warnings = [];
  const objs = [];
  const { x, y, w, h } = box;

  const geom = {
    top:    { from: { x, y }, dir: { x: 1, y: 0 }, len: w },
    right:  { from: { x: x + w, y }, dir: { x: 0, y: 1 }, len: h },
    bottom: { from: { x: x + w, y: y + h }, dir: { x: -1, y: 0 }, len: w },
    left:   { from: { x, y: y + h }, dir: { x: 0, y: -1 }, len: h },
  };

  // 배치되지 않은 소자에 기본 변을 준다: 전원 → left, 나머지 → top.
  const bySide = { top: [], right: [], bottom: [], left: [] };
  elements.forEach((e, i) => {
    const side = SIDES.includes(e.side)
      ? e.side
      : (e.element === "dc_source" || e.element === "ac_source") ? "left" : "top";
    bySide[side].push({ ...e, _i: i });
  });

  for (const side of SIDES) {
    const list = bySide[side];
    const g = geom[side];
    // t 미지정 소자는 그 변 안에서 균등 분포
    const auto = list.filter((e) => !Number.isFinite(e.t));
    auto.forEach((e, k) => { e.t = (k + 1) / (auto.length + 1); });
    list.sort((a, b) => a.t - b.t);

    const placed = [];
    for (const e of list) {
      const span = Math.max(CIRCUIT_BODY_MM + 2, e.span || DEFAULT_ELEMENT_SPAN);
      if (span > g.len) {
        warnings.push(`${side}: 소자 ${e.element}의 길이(${span}mm)가 변 길이(${g.len}mm)보다 깁니다`);
      }
      const center = clamp(e.t * g.len, span / 2, g.len - span / 2);
      const s0 = center - span / 2, s1 = center + span / 2;
      placed.push({ e, s0, s1 });
      objs.push(trim({
        type: "circuit", element: e.element,
        p1: along(g, s0), p2: along(g, s1),
        label: e.label || "", height: e.height, gap: e.gap, strokeWidth,
      }));
    }
    // 남은 구간을 도선(line)으로 채운다
    let cursor = 0;
    for (const p of placed) {
      if (p.s0 - cursor > 0.05) objs.push(wire(along(g, cursor), along(g, p.s0), strokeWidth));
      cursor = Math.max(cursor, p.s1);
    }
    if (g.len - cursor > 0.05) objs.push(wire(along(g, cursor), along(g, g.len), strokeWidth));
  }

  // 병렬 가지: 윗변 ↔ 아랫변을 잇는 세로선 위에 소자를 얹는다
  branches.forEach((br, bi) => {
    const at = Number.isFinite(br.at) ? br.at : 0.5;
    const bx = x + w * at;
    const g = { from: { x: bx, y }, dir: { x: 0, y: 1 }, len: h };
    const list = (br.elements || []).map((e) => ({ ...e }));
    const auto = list.filter((e) => !Number.isFinite(e.t));
    auto.forEach((e, k) => { e.t = (k + 1) / (auto.length + 1); });
    list.sort((a, b) => a.t - b.t);

    const placed = [];
    for (const e of list) {
      const span = Math.max(CIRCUIT_BODY_MM + 2, e.span || DEFAULT_ELEMENT_SPAN);
      const center = clamp(e.t * g.len, span / 2, g.len - span / 2);
      placed.push({ s0: center - span / 2, s1: center + span / 2 });
      objs.push(trim({
        type: "circuit", element: e.element,
        p1: along(g, center - span / 2), p2: along(g, center + span / 2),
        label: e.label || "", height: e.height, gap: e.gap, strokeWidth,
      }));
    }
    let cursor = 0;
    for (const p of placed) {
      if (p.s0 - cursor > 0.05) objs.push(wire(along(g, cursor), along(g, p.s0), strokeWidth));
      cursor = Math.max(cursor, p.s1);
    }
    if (g.len - cursor > 0.05) objs.push(wire(along(g, cursor), along(g, g.len), strokeWidth));

    // 가지가 윗변 소자와 겹치는지 대략 확인 (겹치면 선이 소자를 뚫고 지나간다)
    const topHit = bySide.top.some((e) => Math.abs(e.t * w - w * at) < DEFAULT_ELEMENT_SPAN / 2);
    if (topHit) warnings.push(`가지 ${bi}(at=${at})가 윗변 소자와 겹칩니다 — at 값을 옮기세요`);
  });

  return { objects: objs, warnings };
}

function along(g, s) {
  return { x: g.from.x + g.dir.x * s, y: g.from.y + g.dir.y * s };
}
function wire(p1, p2, strokeWidth) {
  return { type: "line", p1, p2, strokeWidth };
}
function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi === undefined ? v : Math.max(lo, hi)); }
function trim(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}

/* ===== 좌표평면 + 함수 그래프 =====
 * 앱의 샘플러(js/function-graph/sampler.js)를 그대로 호출한다. 같은 코드로 뽑은
 * points[]라 앱에서 다시 그려도 모양이 어긋나지 않는다.
 */
export function buildGraph({ at, plane = {}, functions = [], series = [], planeId }) {
  const warnings = [];
  const xMin = num(plane.xMin, -5), xMax = num(plane.xMax, 5);
  const yMin = num(plane.yMin, -5), yMax = num(plane.yMax, 5);
  if (xMax <= xMin || yMax <= yMin) {
    return { error: "plane 범위가 잘못됐습니다 (xMax>xMin, yMax>yMin)" };
  }
  // 칸 크기. 축마다 다르게 줄 수 있다(cellMmX/cellMmY) — 시간축처럼 값 범위가 좁은 축을
  // 물리적으로 늘려야 그래프가 읽기 쉬워지기 때문(세로로 길쭉한 v-t 그래프 방지).
  const cell = num(plane.cellMm, 4.8);                    // defaults.js와 같은 기본 칸 크기
  const cellX = num(plane.cellMmX, cell);
  const cellY = num(plane.cellMmY, cell);
  const w = num(plane.w, cellX * (xMax - xMin));
  const h = num(plane.h, cellY * (yMax - yMin));
  const cx = num(at && at.x, 0), cy = num(at && at.y, 0);   // 원점 = 아트보드 중앙

  const planeObj = {
    type: "coordplane",
    x: cx - w / 2, y: cy - h / 2, w, h,
    xMin, xMax, yMin, yMax,
    id: planeId,
    ...pick(plane, [
      "axisVariant", "gridStepX", "gridStepY", "tickStepX", "tickStepY",
      "showAxisLines", "showGrid", "showTicks", "showTickLabels", "tickLabelSize",
      "tickLabelMode", "labelX", "labelY", "showAxisLabels", "axisLabelSize",
      "showOrigin", "labelOrigin", "strokeWidth", "strokeLevel", "lockAspect",
      // 그래프 도구(graph-modal) 평면과 같은 모양을 낼 수 있게 통과시키는 플래그들.
      // richLabels가 없으면 축 이름이 혼합 라벨러(한글정자+영문이탤릭)를 타지 못하고
      // 구식 세리프 이탤릭으로 렌더된다 — MCP로 만든 그래프 글씨체가 달랐던 원인.
      "richLabels", "gridToData",
      "gridCountX", "gridCountY", "gridCountXPos", "gridCountXNeg",
      "gridCountYPos", "gridCountYNeg",
      "gridOver", "gridOverXPos", "gridOverXNeg", "gridOverYPos", "gridOverYNeg",
      "padXPos", "padXNeg", "padYPos", "padYNeg",
      "seriesLock",
      // ③표시 탭의 평면 요소들(전부 math 좌표 — renderCoordplane이 world로 변환하므로
      // 평면을 옮기거나 리사이즈해도 따라온다). 앱 UI의 '배치 도구'와 같은 데이터다:
      //   annGuides  = 수선의 발  [{x,y}]      점에서 두 축으로 내리는 점선
      //   guideLines = 가이드라인 [{x1,y1,x2,y2}]  두 점을 잇는 점선(계단 불연속 연결 등)
      //   annMarkers = 표시점 [{x,y}] / annArrows = 화살표 / legends = 범례
      "annGuides", "guideLines", "annMarkers", "annArrows", "annLabelPoints", "legends",
      // 문자 눈금(t_0·8v_0 같은 첨자 라벨)과 라벨 미세이동 — 빠져 있어서 MCP 로는
      // 문자 눈금을 못 넣었다(2026-07-31 공백 #1). 렌더러(coordplane.js)는 원래 읽는 필드다.
      "tickTextX", "tickTextY", "tickOffX", "tickOffY",
      "labelXOffset", "labelYOffset",
    ]),
  };
  // 좌표·함수 묶기: 그래프 도구의 기본값과 같게 켠다(끄려면 seriesLock:false를 명시).
  // 켜져 있으면 평면을 옮길 때 계열·수선의 발·표시점이 함께 따라간다.
  if (planeObj.seriesLock === undefined) planeObj.seriesLock = true;

  /* 재편집 스펙(graphCfg) — 없으면 그래프 편집 모달이 평면 범위에서 '역산'을 하고,
   * 그 역산이 원래 설정과 달라져 "캔버스와 미리보기가 다른" 문제가 생긴다.
   * (예: yMax 5.8, padY 1.3 → Math.round(4.5)=5 로 칸 범위가 5가 되고,
   *  간격은 tickStepY 기본값 1이 쓰여 눈금이 1·2·3·4·5로 바뀌었다.)
   * 그래서 앱의 그래프 도구가 저장하는 것과 같은 스펙을 여기서도 만들어 둔다.
   * xPos/yPos = 마지막 눈금 값(= 범위 끝에서 화살표 여백 pad를 뺀 값). */
  const stepX = num(planeObj.gridStepX, 1) || 1;
  const stepY = num(planeObj.gridStepY, 1) || 1;
  planeObj.tickStepX = num(planeObj.tickStepX, stepX);
  planeObj.tickStepY = num(planeObj.tickStepY, stepY);
  const padXP = num(planeObj.padXPos, 1.6), padXN = num(planeObj.padXNeg, 1.6);
  const padYP = num(planeObj.padYPos, 1.3), padYN = num(planeObj.padYNeg, 1.3);
  if (planeObj.graphCfg === undefined) {
    planeObj.graphCfg = {
      xPos: round1(xMax - padXP),
      xNeg: xMin < 0 ? round1(-xMin - padXN) : 0,
      yPos: round1(yMax - padYP),
      yNeg: yMin < 0 ? round1(-yMin - padYN) : 0,
      tickStepX: planeObj.tickStepX,
      tickStepY: planeObj.tickStepY,
    };
  }

  const graphs = [];
  for (const f of functions) {
    const dMin = num(f.domain && f.domain.min, xMin);
    const dMax = num(f.domain && f.domain.max, xMax);
    const r = sampleFunctionPoints(f.expr, dMin, dMax, planeObj, {
      yRange: f.range && Number.isFinite(f.range.min) ? f.range : undefined,
    });
    if (r.error) return { error: `"${f.expr}": ${r.error}` };
    if (!r.points.length) {
      warnings.push(`"${f.expr}": 표시 범위 안에 그려질 점이 없습니다 (yMin/yMax 또는 정의역 확인)`);
      continue;
    }
    // 그래프 요소(수선의 발·표시점·화살촉)는 앱 그래프 도구와 같은 방식으로 굽는다:
    // math 좌표 스펙(guides/markers)을 세계좌표로 바꿔 funcgraph에 실으면 renderFuncgraph가
    // 계열과 함께 그린다. 원본 스펙(guideXs/markerXs)도 같이 저장해 모달에서 재편집된다.
    const els = bakeGraphElements(f, planeObj);
    graphs.push(trim({
      type: "funcgraph",
      expr: f.expr,
      domainMin: dMin, domainMax: dMax,
      planeId,
      points: r.points,
      breaks: r.breaks && r.breaks.length ? r.breaks : undefined,
      closed: false,
      strokeWidth: num(f.strokeWidth, 0.3),
      dashLength: num(f.dashLength, 0),
      dashGap: num(f.dashGap, 0),
      label: f.label || "",
      labelShow: !!f.label,
      // 곡선 끝 라벨은 renderFuncgraph가 endLabel을 읽는다. 도구 스키마의 label 설명이
      // "곡선 끝 라벨"이므로 label만 준 경우에도 끝 라벨로 동작하게 넘겨준다.
      endLabel: f.endLabel || f.label || undefined,
      // 곡선 아래 면적 채움. from·to는 정의역 값(생략 시 정의역 전체)이고,
      // 기준선 baseY만 세계좌표(mm)로 구워 넘긴다 — 렌더러가 평면을 몰라도 되도록.
      area: f.area ? trim({
        from: Number.isFinite(f.area.from) ? f.area.from : undefined,
        to: Number.isFinite(f.area.to) ? f.area.to : undefined,
        baseY: worldYFromMathY(planeObj, 0),
        level: Number.isFinite(f.area.level) ? f.area.level : 220,
        edges: f.area.edges === false ? false : undefined,
        label: f.area.label || undefined,
        labelSize: Number.isFinite(f.area.labelSize) ? f.area.labelSize : undefined,
      }) : undefined,
      ...els,
    }));
  }

  /* ----- 점 계열(꺾은선): 수식이 아니라 좌표를 직접 찍는 계열 -----
   * v-t 계단·꺾은선 그래프용(2026-07-31 공백 #2). 앱의 SERIES 도구·그래프 모달의
   * '직선·꺾은선' 계열과 같은 필드를 만든다 — sourceKind:"points" + mathPoints 를 함께
   * 저장하므로 그래프 편집 모달에서 "꺾은선 N점"으로 잡혀 재편집된다. */
  for (const s of series) {
    const raw = Array.isArray(s && s.points) ? s.points : [];
    const mathPoints = raw
      .map((p) => Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p && p.x, y: p && p.y })
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (mathPoints.length < 2) {
      return { error: `series: 점이 2개 이상 필요합니다 (지금 ${mathPoints.length}개)` };
    }
    const pts = mathPoints.map((m) => ({
      x: worldXFromMathX(planeObj, m.x), y: worldYFromMathY(planeObj, m.y),
    }));
    const els = bakeGraphElements(s, planeObj);
    graphs.push(trim({
      type: "funcgraph",
      sourceKind: "points",
      // 좌표 계열 기본은 꺾은선(직선). smooth 를 명시해야만 곡선 보간(Catmull-Rom).
      curveStyle: s.curveStyle === "smooth" ? "smooth" : "straight",
      planeId,
      mathPoints,
      points: pts,
      breaks: [],
      autoExtend: false,
      closed: false,
      strokeWidth: num(s.strokeWidth, 0.4),      // 바이블 §17: 그래프 계열 0.4
      dashLength: num(s.dashLength, 0),
      dashGap: num(s.dashGap, 0),
      label: "", labelShow: false,
      endLabel: s.endLabel || s.label || undefined,
      ...els,
    }));
  }

  return { plane: planeObj, graphs, warnings };
}

/* 그래프 요소 굽기 — graph-modal.js bakeElements()와 같은 규칙.
 *   guides : [{x, y}]  점에서 x축(수직)·y축(수평)으로 내린 '수선의 발'
 *   markers: [{x, y}]  곡선 위 표시점(●)
 * 좌표는 수학 좌표(축 눈금 값)로 준다 — 세계좌표(mm) 변환은 여기서 한다. */
function bakeGraphElements(f, plane) {
  const toWorld = (mx, my) => ({ x: worldXFromMathX(plane, mx), y: worldYFromMathY(plane, my) });
  const o0 = toWorld(0, 0);
  const guideSegs = [], markers = [];
  const guides = Array.isArray(f.guides) ? f.guides : [];
  const marks = Array.isArray(f.markers) ? f.markers : [];
  for (const gspec of guides) {
    if (!gspec || !Number.isFinite(gspec.x) || !Number.isFinite(gspec.y)) continue;
    const p = toWorld(gspec.x, gspec.y);
    if (Math.abs(p.y - o0.y) > 1e-6) guideSegs.push([{ x: p.x, y: p.y }, { x: p.x, y: o0.y }]); // → x축
    if (Math.abs(p.x - o0.x) > 1e-6) guideSegs.push([{ x: p.x, y: p.y }, { x: o0.x, y: p.y }]); // → y축
  }
  for (const mspec of marks) {
    if (!mspec || !Number.isFinite(mspec.x) || !Number.isFinite(mspec.y)) continue;
    markers.push(toWorld(mspec.x, mspec.y));
  }
  const out = {};
  if (guideSegs.length) { out.guideSegs = guideSegs; out.guideXs = guides.map((g) => ({ ...g })); }
  if (markers.length) { out.markers = markers; out.markerXs = marks.map((m) => ({ ...m })); }
  return out;
}

function num(v, d) { return Number.isFinite(v) ? v : d; }
function round1(v) { return Math.round(v * 10) / 10; }   // 부동소수 찌꺼기 정리(4.499999→4.5)
function pick(o, keys) {
  const out = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

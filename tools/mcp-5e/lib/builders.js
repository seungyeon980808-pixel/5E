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
export function buildCircuitLoop({ box, elements = [], branches = [], strokeWidth = 0.2, bodyScale }) {
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
        bodyScale: Number.isFinite(e.bodyScale) ? e.bodyScale : bodyScale,
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
        bodyScale: Number.isFinite(e.bodyScale) ? e.bodyScale : bodyScale,
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

/* ===== 회로: 임의 배선(사선·삼각형·격자) =====
 * buildCircuitLoop 은 사각 폐회로 전용이라 삼각형 배치·대각선 가지를 못 만들었다
 * (기출 5장). 소자(circuit)는 원래 p1·p2 두 점을 받아 **어느 각도로도** 놓이므로
 * 없던 것은 부품이 아니라 "구간을 따라 소자를 놓고 남은 곳을 도선으로 잇는" 계산뿐이다.
 *
 * wires: [{ from:[x,y]|{x,y}, to:…, elements:[{element,t,span,label,…}] }]
 * t 는 그 구간에서의 위치 0~1(생략 시 균등 분포), span 은 단자 간 거리 mm.
 */
export function buildCircuitPath({ wires = [], strokeWidth = 0.35, bodyScale }) {
  const objs = [], warnings = [];
  for (const [wi, seg] of wires.entries()) {
    const a = pt(seg && seg.from), b = pt(seg && seg.to);
    if (!a || !b) { warnings.push(`wires[${wi}]: from·to 가 필요합니다`); continue; }
    const dx = b.x - a.x, dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    if (L < 0.1) { warnings.push(`wires[${wi}]: 길이가 0입니다`); continue; }
    const u = { x: dx / L, y: dy / L };
    const at = (s) => ({ x: round1(a.x + u.x * s), y: round1(a.y + u.y * s) });

    const list = (seg.elements || []).map((e) => ({ ...e }));
    const auto = list.filter((e) => !Number.isFinite(e.t));
    auto.forEach((e, k) => { e.t = (k + 1) / (auto.length + 1); });
    list.sort((x, y) => x.t - y.t);

    const placed = [];
    for (const e of list) {
      const span = Math.max(CIRCUIT_BODY_MM + 2, e.span || DEFAULT_ELEMENT_SPAN);
      if (span > L) warnings.push(`wires[${wi}]: 소자 ${e.element}(${span}mm)가 구간(${round1(L)}mm)보다 깁니다`);
      const c = clamp(e.t * L, span / 2, L - span / 2);
      placed.push([c - span / 2, c + span / 2]);
      objs.push(trim({
        type: "circuit", element: e.element || "resistor",
        p1: at(c - span / 2), p2: at(c + span / 2),
        label: e.label || "", labelType: e.label ? "quantity" : undefined,
        height: e.height, gap: e.gap, strokeWidth,
        bodyScale: Number.isFinite(e.bodyScale) ? e.bodyScale : bodyScale,
      }));
    }
    let cur = 0;
    for (const [s0, s1] of placed.sort((p, q) => p[0] - q[0])) {
      if (s0 - cur > 0.05) objs.push(wire(at(cur), at(s0), strokeWidth));
      cur = Math.max(cur, s1);
    }
    if (L - cur > 0.05) objs.push(wire(at(cur), at(L), strokeWidth));
  }
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

/* ===== 치수 표시(dim_group) — 치수선 + 두 연장선 =====
 *
 * 기출 483장 중 129장이 치수 표시를 쓰고, 그중 89장은 이것 하나만 막고 있었다.
 * 치수선 '본체'는 이미 있다 — line 의 lineMode:"lengthArrow" 가 양끝 화살촉 +
 * 끝 캡(dimensionVariant) + 가운데 라벨(dimensionLabel)을 한 객체로 그린다.
 * 즉 이 빌더는 **직선 도구의 확장**이고, 새 객체 타입을 만들지 않는다.
 * 없던 것은 하나뿐이다: 두 기준점에서 치수선까지 뻗는 점선 연장선의 자동 정렬.
 *
 * 계약 — 모델은 오프셋의 '부호'를 계산하지 않는다:
 *   · 재는 두 점(from·to)은 그림 위의 실제 기준점을 그대로 준다(치수선 위치가 아니다).
 *   · 치수선이 놓일 쪽은 side 이름으로 고른다 — "above|below"(가로) / "left|right"(세로).
 *   · 연장선은 기준점 → 치수선 + overshoot 까지 자동으로 그어지고, 여러 치수가
 *     같은 기준점을 공유하면 겹치는 연장선은 한 번만 그린다.
 *   · 선 굵기·점선 간격은 §17 치수보조선 표준으로 고정한다.
 */
const DIM_SW = 0.35;                 // §17 표준 선 굵기
const DIM_EXT_DASH = { dashLength: 1.0, dashGap: 0.3 };   // scene.js LINE_KINDS["치수보조선"]
const DIM_LABEL_SIZE = 4.2;          // §2 이름표 크기에 맞춘 치수 라벨 (자동값 2.8은 너무 작다)
const DIM_CAPS = ["basic", "rightBar", "leftBar", "bothBars"];

/* ===== 균일 자기장 영역 (⊗ / ⊙ 격자) =====
 * 기출 617장 중 자기장·전자기가 87장으로 두 번째로 많은데(07 §8), 정작 이걸 그리는
 * 도구가 없어 매번 기호를 손으로 격자에 찍어야 했다. 그러다 보니 간격이 들쭉날쭉하고
 * **범례 문장을 빠뜨리기 쉽다** — 07 §7 은 "⊙/× 기호를 쓰면 범례 문장 필수"라고 못박는다.
 * 그래서 범례를 기본으로 켜 두고, 끄려면 명시적으로 legend:false 를 줘야 한다.
 *
 * 왜 이 구도인가: 자기장이 종이면에 수직이면 도선(면 안)과 힘(면 안)을 2D 로 정직하게
 * 그릴 수 있다. 자기장을 면 안에 그리면 힘이 면 밖으로 나가 화살표로 못 그린다.
 */
const FIELD_GLYPH = { into: "×", out: "⊙" };

export function buildFieldRegion({
  box, direction = "into", spacing = 8, symbolSize, boundary = "dashed",
  label = "", legend = true, plane = "종이면", legendAt, strokeWidth = 0.25,
  avoid = [],
}) {
  const errors = [], warnings = [], objects = [], notes = [];
  const b = box || {};
  for (const k of ["x", "y", "w", "h"]) {
    if (!Number.isFinite(Number(b[k]))) errors.push(`box.${k} 가 숫자가 아닙니다`);
  }
  if (!FIELD_GLYPH[direction]) {
    errors.push(`direction 은 into(⊗, 들어감) 또는 out(⊙, 나옴) 이어야 합니다`);
  }
  if (errors.length) return { objects: [], errors, warnings, notes };

  const x = Number(b.x), y = Number(b.y), w = Number(b.w), h = Number(b.h);
  const gap = Math.max(3, Number(spacing) || 8);
  const size = Math.max(2, Number(symbolSize) || gap * 0.45);
  const glyph = FIELD_GLYPH[direction];

  if (boundary !== "none") {
    const rect = {
      type: "rect", x, y, w, h, fillNone: true, strokeWidth,
    };
    if (boundary === "dashed") { rect.dashLength = 1.4; rect.dashGap = 1.0; }
    objects.push(rect);
  }

  // 기호는 테두리에서 안쪽으로 반 칸 들어간 격자에 균등 배치한다.
  const cols = Math.max(1, Math.floor((w - gap * 0.4) / gap));
  const rows = Math.max(1, Math.floor((h - gap * 0.4) / gap));
  const usedW = (cols - 1) * gap, usedH = (rows - 1) * gap;
  const startX = x + (w - usedW) / 2, startY = y + (h - usedH) / 2;
  // 도선·물체가 지나가는 자리에는 기호를 찍지 않는다 — 기출 도판도 그 자리를 비운다.
  const skips = (Array.isArray(avoid) ? avoid : [avoid]).filter(
    (r) => r && ["x", "y", "w", "h"].every((k) => Number.isFinite(Number(r[k]))));
  const inSkip = (px, py) => skips.some(
    (r) => px >= Number(r.x) && px <= Number(r.x) + Number(r.w)
        && py >= Number(r.y) && py <= Number(r.y) + Number(r.h));
  let placed = 0, skipped = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = startX + c * gap, cy = startY + r * gap;
      if (inSkip(cx, cy)) { skipped++; continue; }
      objects.push({
        type: "text", text: glyph, fontSize: size,
        // text 의 x,y 는 글자 상자의 왼쪽 '위' 기준이라 가운데 맞춤은 직접 계산한다.
        x: cx - size * 0.36, y: cy - size * 0.5,
      });
      placed++;
    }
  }
  notes.push(`기호 ${placed}개 (격자 ${rows}×${cols}, 간격 ${gap}mm, 크기 ${size.toFixed(1)}mm)`
             + (skipped ? `, 비운 자리 ${skipped}개` : ""));
  if (!placed) warnings.push("기호가 하나도 안 들어갔습니다 — avoid 범위가 영역 전체를 덮었는지 확인하세요");

  if (label) {
    objects.push({ type: "text", text: label, fontSize: 3.4,
                   x: x + 1.6, y: y + 1.4 });
  }

  if (legend !== false) {
    const dirWord = direction === "into"
      ? `${plane}에 수직으로 들어가는 방향` : `${plane}에서 수직으로 나오는 방향`;
    const text = typeof legend === "string" && legend.trim()
      ? legend.trim() : `${glyph}: ${dirWord}`;
    const at = legendAt && Number.isFinite(Number(legendAt.x))
      ? { x: Number(legendAt.x), y: Number(legendAt.y) }
      : { x: x, y: y + h + 3.2 };
    objects.push({ type: "text", text, fontSize: 3.2, x: at.x, y: at.y });
    notes.push(`범례: ${text}`);
  } else {
    warnings.push("범례를 껐습니다 — ⊙/× 기호를 쓰면 그림 아래 범례 문장이 필수입니다(07 §7)");
  }

  return { objects, errors, warnings, notes };
}

export function buildDimension(spec) {
  const list = Array.isArray(spec.dims) && spec.dims.length ? spec.dims : [spec];
  const objects = [], extras = [], errors = [], warnings = [], notes = [];
  const seenExt = new Set();          // 공유 기준점의 연장선 중복 방지

  for (const [i, d] of list.entries()) {
    const where = list.length > 1 ? `dims[${i}]` : "치수";
    const from = pt(d.from), to = pt(d.to);
    if (!from || !to) { errors.push(`${where}: from·to 는 {x,y} 또는 [x,y] 여야 합니다`); continue; }
    const dx = to.x - from.x, dy = to.y - from.y;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) { errors.push(`${where}: from 과 to 가 같은 점입니다`); continue; }

    // 방향 자동 판정: 한 축이 다른 축의 3배 이상이면 그 축의 치수(≈18° 이내), 아니면 빗변 평행
    let dir = ["horizontal", "vertical", "parallel"].includes(d.direction) ? d.direction : null;
    if (!dir) {
      const adx = Math.abs(dx), ady = Math.abs(dy);
      dir = adx >= ady * 3 ? "horizontal" : ady >= adx * 3 ? "vertical" : "parallel";
    }
    const off = Math.abs(num(d.offset, num(d.extend, 8)));     // extend 는 인수인계 문서의 이름
    const over = Math.abs(num(d.overshoot, 1.5));              // 치수선을 넘어 더 뻗는 길이
    const gap = Math.abs(num(d.gap, 0));                       // 기준점에서 띄우는 간격

    // 오프셋 방향(단위벡터). side 이름 → 부호. 기본은 가로=아래, 세로=왼쪽, 빗변=진행방향 왼쪽.
    let n, base1 = from, base2 = to, sideName;
    if (dir === "horizontal") {
      const below = d.side !== "above";
      sideName = below ? "아래쪽" : "위쪽";
      n = { x: 0, y: below ? 1 : -1 };
      const y = below ? Math.max(from.y, to.y) : Math.min(from.y, to.y);
      base1 = { x: from.x, y }; base2 = { x: to.x, y };        // 두 점의 y가 달라도 치수선은 한 높이
    } else if (dir === "vertical") {
      const right = d.side === "right";
      sideName = right ? "오른쪽" : "왼쪽";
      n = { x: right ? 1 : -1, y: 0 };
      const x = right ? Math.max(from.x, to.x) : Math.min(from.x, to.x);
      base1 = { x, y: from.y }; base2 = { x, y: to.y };
    } else {
      const u = unitVec(dx, dy);
      const right = d.side === "right";
      sideName = right ? "오른쪽" : "왼쪽";
      n = right ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x };   // +y 아래 좌표계에서 진행방향 기준
    }

    const q1 = { x: base1.x + n.x * off, y: base1.y + n.y * off };
    const q2 = { x: base2.x + n.x * off, y: base2.y + n.y * off };

    const label = d.label === undefined || d.label === null ? "d" : String(d.label);
    const labelSize = num(d.labelSize, DIM_LABEL_SIZE);
    const labelAside = ["above", "below", "left", "right"].includes(d.labelPos);
    objects.push(trim({
      type: "line", p1: q1, p2: q2,
      lineMode: "lengthArrow",
      dimensionVariant: DIM_CAPS.includes(d.caps) ? d.caps : "basic",
      // 라벨을 옆으로 뺄 때는 가운데 라벨을 비운다(렌더러는 빈 문자열이면 "d"를 쓴다 → 공백 한 칸)
      dimensionLabel: labelAside ? " " : label,
      dimensionLabelSize: labelSize,
      labelType: d.labelType,
      strokeWidth: DIM_SW, strokeLevel: 0,
    }));

    // 연장선 — 기준점에서 치수선 너머 overshoot 까지. off 가 0이면 그릴 것이 없다.
    let extCount = 0;
    if (d.extLines !== false && off > 0.05) {
      for (const [p, q] of [[base1, q1], [base2, q2]]) {
        const a = { x: p.x + n.x * gap, y: p.y + n.y * gap };
        const b = { x: q.x + n.x * over, y: q.y + n.y * over };
        const key = `${r2(a.x)},${r2(a.y)}→${r2(b.x)},${r2(b.y)}`;
        if (seenExt.has(key)) continue;
        seenExt.add(key);
        extras.push({
          type: "line", p1: a, p2: b, lineMode: "solid",
          strokeWidth: DIM_SW, strokeLevel: 0, ...DIM_EXT_DASH,
        });
        extCount++;
      }
    }

    // 라벨을 치수선 밖으로: 별도 text 객체(x,y = 좌상단, hanging 기준)로 중앙 정렬해 얹는다
    if (labelAside) {
      const mid = { x: (q1.x + q2.x) / 2, y: (q1.y + q2.y) / 2 };
      const lg = num(d.labelGap, labelSize * 0.75);
      const w = estWidth(label, labelSize);
      // 라벨 블록의 '중심'을 치수선 가운데에서 lg + 블록 절반만큼 민다
      const cx = mid.x + (d.labelPos === "left" ? -(lg + w / 2) : d.labelPos === "right" ? lg + w / 2 : 0);
      const cy = mid.y + (d.labelPos === "above" ? -(lg + labelSize / 2) : d.labelPos === "below" ? lg + labelSize / 2 : 0);
      objects.push({
        type: "text", x: cx - w / 2, y: cy - labelSize / 2,
        text: label, fontSize: labelSize,
      });
    }

    const L = Math.hypot(q2.x - q1.x, q2.y - q1.y);
    const dirKo = dir === "horizontal" ? "가로" : dir === "vertical" ? "세로" : "빗변 평행";
    notes.push(`치수 ${label || "(빈 라벨)"} — ${dirKo} ${L.toFixed(1)}mm, ${sideName}으로 ${off}mm 떨어뜨림, 연장선 ${extCount}개`);
    if (L < 4) warnings.push(`${where}: 치수선이 ${L.toFixed(1)}mm 로 짧습니다 — 화살촉 두 개가 라벨을 덮습니다(라벨을 labelPos로 빼세요)`);
    if (off > 0 && off < 2) warnings.push(`${where}: offset ${off}mm 는 너무 가까워 치수선이 도형에 붙습니다(권장 6~10)`);
  }

  // 연장선이 먼저(아래층), 치수선·라벨이 나중(§19 — 치수는 위층)
  return { objects: [...extras, ...objects], errors, warnings, notes };
}

function pt(p) {
  if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) return { x: p[0], y: p[1] };
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y };
  return null;
}
function unitVec(x, y) { const L = Math.hypot(x, y) || 1; return { x: x / L, y: y / L }; }
function r2(v) { return Math.round(v * 100) / 100; }
function estWidth(s, size) {
  // 서버에 폰트 메트릭이 없다 — 한글 전각, 라틴·숫자 0.55em 추정(scene.js estTextWidth 와 같은 규칙)
  let em = 0;
  for (const ch of String(s ?? "")) em += /[가-힣ㄱ-ㆎ]/.test(ch) ? 1 : 0.55;
  return em * size;
}

function num(v, d) { return Number.isFinite(v) ? v : d; }
function round1(v) { return Math.round(v * 10) / 10; }   // 부동소수 찌꺼기 정리(4.499999→4.5)
function pick(o, keys) {
  const out = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

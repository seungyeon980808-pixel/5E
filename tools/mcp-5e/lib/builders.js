/* ===== BUILDERS — 좌표 계산이 필요한 "레시피" =====
 *
 * 저수준 add_objects만 있으면 회로도 하나 그리는 데 좌표를 20개 넘게 손으로 잡아야 하고,
 * LLM은 거기서 반드시 틀린다. 자주 그리는 두 가지(폐회로·좌표그래프)만 여기서 계산한다.
 */

import { sampleFunctionPoints } from "../../../js/function-graph/sampler.js";
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
export function buildGraph({ at, plane = {}, functions = [], planeId }) {
  const warnings = [];
  const xMin = num(plane.xMin, -5), xMax = num(plane.xMax, 5);
  const yMin = num(plane.yMin, -5), yMax = num(plane.yMax, 5);
  if (xMax <= xMin || yMax <= yMin) {
    return { error: "plane 범위가 잘못됐습니다 (xMax>xMin, yMax>yMin)" };
  }
  const cell = num(plane.cellMm, 4.8);                    // defaults.js와 같은 기본 칸 크기
  const w = num(plane.w, cell * (xMax - xMin));
  const h = num(plane.h, cell * (yMax - yMin));
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
    ]),
  };

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
    }));
  }
  return { plane: planeObj, graphs, warnings };
}

function num(v, d) { return Number.isFinite(v) ? v : d; }
function pick(o, keys) {
  const out = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

/* ===== SCHEMA — 5E 객체 타입 정본 + 기본값 + 검증 =====
 *
 * 타입 목록(21종)은 앱 코드(`js/object-types.js`)를 런타임에 그대로 import 한다.
 * 하드코딩 복사본을 두지 않는 이유: 5E에 타입이 추가되면 이 서버가 조용히 옛 목록을
 * 들고 있게 되고, 그러면 "그림은 나오는데 왜인지 이상한" 상태가 된다.
 *
 * 반대로 kind/element 레지스트리(광학 심볼·회로 소자 등)는 렌더러 함수 이름으로만
 * 존재해 import 할 수 없어 여기에 적어 둔다. 드리프트는 `check-sync.mjs`가 잡는다.
 */

import {
  OBJECT_TYPE_IDS,
  SIZE_TYPES,
  POINT_ARRAY_TYPES,
} from "../../../js/object-types.js";

export { OBJECT_TYPE_IDS };

const DEFAULT_STROKE_WIDTH = 0.2;         // mm (tools.js DEFAULT_STROKE_WIDTH)
export const DEFAULT_TEXT_SIZE_MM = 3.7;  // state.js
export const TEXT_FONT_FAMILY =
  '"돋움", "Dotum", "Apple SD Gothic Neo", "맑은 고딕", "Malgun Gothic", sans-serif';
export const CIRCUIT_BODY_MM = 8;         // state.js — 소자 몸통 길이(리드는 파생)

/* ----- kind / element 레지스트리 (렌더러 디스패치와 1:1) ----- */
export const OPTICS_KINDS = [
  "convex_lens", "concave_lens", "convex_mirror", "concave_mirror", "plane_mirror",
  "object_arrow", "point_light", "screen", "pulley", "node",
];
export const APPARATUS_KINDS = ["wire", "compass", "pulley", "clamp", "scale", "transistor", "axis_break",
  "device_box", "speaker", "phototube", "slit", "thermometer", "bar_magnet", "fringe_pattern"];
export const CIRCUIT_ELEMENTS = [
  "resistor", "dc_source", "ac_source", "capacitor", "inductor",
  "diode", "lamp", "ammeter", "voltmeter", "galvanometer", "motor", "led", "unknown",
  "switch", "switch_spdt",
];
export const SVG_ASSET_IDS = ["pulley", "cart"];
// 도르래 형태: basic(원+축) | ceiling(천장 브래킷) | wall(벽 브래킷)
export const PULLEY_VARIANTS = ["basic", "ceiling", "wall"];
export const GAUGE_KINDS = ["ruler", "protractor"];
export const FILL_STYLES = ["solid", "dots", "cross", "hatch"];
export const ARROW_HEADS = ["none", "end", "start", "both"];
export const LINE_MODES = ["solid", "arrow", "middleArrow", "midInward", "lengthArrow", "wavyArrow"];
export const LABEL_TYPES = ["quantity", "label"];
export const LABEL_POSITIONS = ["center", "above", "below", "left", "right"];
// 상자 라벨 바깥 슬롯은 가운데가 없다 — 가운데는 안쪽 슬롯이 맡는다(BOX_LABEL_DUAL_SPEC).
export const OUTER_LABEL_POSITIONS = ["above", "below", "left", "right"];
// halfcross(ㅏ자) = x는 0부터, y는 양방향. 렌더러(coordplane.js)는 예전부터 지원하는데
// 이 목록에 빠져 있어 MCP로는 쓸 수 없었다.
export const AXIS_VARIANTS = ["cross", "quadrant", "halfcross", "single"];

// project-io.js APPARATUS_TEMPLATE_IDS
const APPARATUS_TEMPLATE_IDS = {
  wire: "E001", compass: "E002", pulley: "M001", clamp: "M004", scale: "M003",
  transistor: "E010", axis_break: "G010", device_box: "E011", bar_magnet: "E012",
  speaker: "W001", thermometer: "M010", phototube: "O010", slit: "O011", fringe_pattern: "O012",
};

// 기구별 기본 크기 (templates.js DEFAULT_SIZES 발췌)
const APPARATUS_SIZES = {
  wire: { w: 26, h: 6 }, compass: { w: 18, h: 18 }, pulley: { w: 18, h: 18 },
  clamp: { w: 18, h: 24 }, scale: { w: 26, h: 18 }, transistor: { w: 20, h: 20 }, axis_break: { w: 5, h: 7 },
  device_box: { w: 26, h: 14 }, speaker: { w: 18, h: 14 }, phototube: { w: 16, h: 20 },
  slit: { w: 4, h: 22 }, thermometer: { w: 7, h: 22 }, bar_magnet: { w: 26, h: 9 },
  fringe_pattern: { w: 7, h: 22 },
};

/* ----- 기하 분류 ----- */
const P1P2_TYPES = new Set(["line", "circuit", "pendulum", "labeler", "spring",
  "chargefield", "fieldlines", "standingwave"]);
const ANCHOR_TYPES = new Set(["text", "formula", "anglearc", "rightangle"]);
const NO_STROKE_TYPES = new Set(["text", "formula", "image"]);

const num = (v) => Number.isFinite(v);
const pt = (p) => !!p && num(p.x) && num(p.y);

/* ===== 타입별 기본값 =====
 * 각 함수는 "앱이 그 타입을 새로 만들 때 넣는 필드"를 그대로 재현한다.
 * 근거 위치는 주석에 적어 둔다 — 앱이 바뀌면 여기도 같이 본다.
 */
const BOX_STYLE = () => ({
  rotation: 0,
  fillLevel: 255, fillNone: false, fillStyle: "solid",
  dashLength: 0, dashGap: 0,
  labelType: "quantity",
});

const DEFAULTS = {
  // tools.js makeShape
  rect: () => ({ ...BOX_STYLE() }),
  ellipse: () => ({ ...BOX_STYLE() }),
  triangle: () => ({ ...BOX_STYLE(), flipX: false, flipY: false }),

  optics: (o) => ({
    ...BOX_STYLE(),
    kind: o.kind || "convex_lens",
    label: "", showLabel: false, fillNone: true,
    ...(o.kind === "node" ? { labelPos: "above" } : {}),
    ...(o.kind === "object_arrow" ? { dashLength: 0, dashGap: 0 } : {}),
  }),

  // project-io.js migrate (apparatus 분기)
  apparatus: (o) => {
    const kind = o.kind || "wire";
    const size = APPARATUS_SIZES[kind] || { w: 20, h: 12 };
    const d = {
      ...BOX_STYLE(), kind, templateId: APPARATUS_TEMPLATE_IDS[kind] ?? null,
      w: size.w, h: size.h, rotation: 0,
    };
    if (kind === "transistor") { d.variant = o.variant || "npn"; d.showTerminals = true; }
    if (kind === "axis_break") { d.slant = 22; d.style = o.style || "slash"; }
    if (kind === "device_box") { d.label = o.label || ""; d.terminals = Number.isFinite(o.terminals) ? o.terminals : 2; d.termSide = o.termSide || "bottom"; }
    if (kind === "speaker") { d.facing = o.facing || "right"; }
    if (kind === "slit") { d.slits = Math.max(1, Math.round(o.slits || 1)); d.slitLen = 1.6; d.slitGap = 4; }
    if (kind === "bar_magnet") { d.northSide = o.northSide || "left"; }
    if (kind === "wire") {
      d.length = o.w ?? size.w; d.angle = 0; d.thickness = 1.8; d.gap = 1.8;
    }
    if (kind === "compass") d.needleAngle = -90;
    if (kind === "pulley") d.variant = o.variant || "basic";
    if (kind === "clamp") d.flipped = false;
    if (kind === "scale") d.displayText = "0.99 N";
    if (kind !== "wire") d.lockAspect = true;
    return d;
  },

  svgAsset: () => ({ ...BOX_STYLE(), assetId: "pulley", w: 43, h: 38, lockAspect: true, strokeWidth: 0 }),
  gauge: (o) => ({ ...BOX_STYLE(), kind: o.kind || "ruler" }),
  image: () => ({ rotation: 0, mode: "edit", opacity: 1, aspectLocked: true, exportable: true, cutouts: [], recognized: false }),
  axes: () => ({ ...BOX_STYLE() }),

  // tools.js makeLine
  line: () => ({
    rotation: 0, lineMode: "solid", lineStyle: "solid",
    arrowVariant: "right", dimensionVariant: "basic", arrowHead: "none",
    dashLength: 0, dashGap: 0,
  }),

  // tools.js makePolyline / makeCurve
  polyline: () => ({
    rotation: 0, arrowHead: "none", dashLength: 0, dashGap: 0,
    closed: false, fillLevel: 255, fillNone: false, fillStyle: "solid",
    rounded: false, cornerRadius: 10,
  }),
  curve: () => ({
    rotation: 0, arrowHead: "none", dashLength: 0, dashGap: 0,
    closed: false, fillLevel: 255, fillNone: false, fillStyle: "solid",
  }),

  // tools.js makeCircuit
  circuit: (o) => {
    const element = o.element || "resistor";
    const d = { element, label: "", labelType: "quantity" };
    if (["resistor", "inductor", "capacitor", "voltmeter", "ammeter", "galvanometer", "motor"].includes(element)) {
      d.height = (element === "resistor" || element === "inductor" || element === "capacitor") ? 3.2 : 5.12;
    }
    if (element === "capacitor") d.gap = 1.6;
    if (element === "diode") d.terminalLabels = ["", ""];
    if (element === "switch") d.closed = false;                 // 기본 열림
    if (element === "switch_spdt") d.throwTo = "a";             // a 접점에 붙음
    return d;
  },

  // tools.js makePendulum
  // 용수철: 길이는 p1/p2가 정하고 코일 수·진폭·양끝 직선부는 필드다.
  spring: () => ({
    turns: 14, radius: 2, leadLength: 2, springStyle: "helix",
    label: "", labelShow: false, labelType: "quantity",
  }),

  // 장(場) 그림·정상파 — 전부 p1/p2 계열. 렌더러가 실제 장을 따라 선을 추적하므로
  // 좌표를 손으로 계산할 필요가 없다(전하 크기만 주면 개수·모양이 저절로 맞는다).
  chargefield: () => ({
    kind: "pair", q1: 1, q2: -1, lines: 12, arrowDist: 6, chargeR: 1.9,
    showCharge: true, label1: "", label2: "",
    label: "", labelShow: false, labelType: "quantity", strokeWidth: 0.25,
  }),
  fieldlines: () => ({
    kind: "bar", lines: 14, showMagnet: true, magnetThick: 5.2, rings: 3, into: false,
    label: "", labelShow: false, labelType: "quantity", strokeWidth: 0.25,
  }),
  standingwave: () => ({
    medium: "string", n: 2, amplitude: 4.2, closedEnd: "p1", showNodes: true,
    label: "", labelShow: false, labelType: "quantity", strokeWidth: 0.5,
  }),
  pendulum: () => ({
    showCenterGhost: true, showSymmetricGhost: true, showLengthLabel: true,
    lengthLabel: "L_B", labelType: "quantity",
  }),

  // tools/click-placement.js makeLabelerDraft
  labeler: () => ({
    text: "㉠", labelType: "label",
    fontFamily: TEXT_FONT_FAMILY, labelSize: DEFAULT_TEXT_SIZE_MM,
  }),

  // templates.js TEMPLATES.anglearc.make / rightangle.make
  anglearc: () => ({
    radius: 14, startAngle: 0, sweepAngle: 60,
    label: "θ", labelType: "quantity", showLabel: true, rotation: 0,
  }),
  rightangle: () => ({ size: 6, angle: 0, orientation: 1 }),

  // text-editor.js _commitText (common)
  text: () => ({
    text: "", fontSize: DEFAULT_TEXT_SIZE_MM, fontFamily: TEXT_FONT_FAMILY,
    fontWeight: "normal", fontStyle: "normal", italic: false,
    letterSpacing: 0, underline: false, strikeout: false, rotation: 0,
  }),
  formula: () => ({
    source: "", rawSource: "", fontSize: DEFAULT_TEXT_SIZE_MM,
    fontFamily: TEXT_FONT_FAMILY, fontWeight: "normal", fontStyle: "normal",
    italic: false, letterSpacing: 0, underline: false, strikeout: false, rotation: 0,
  }),

  // function-graph/defaults.js makeDefaultCoordplane
  coordplane: () => ({
    rotation: 0, lockAspect: true, axisVariant: "cross",
    xMin: -5, xMax: 5, yMin: -5, yMax: 5,
    gridStepX: 1, gridStepY: 1, tickStepX: 1, tickStepY: 1,
    showAxisLines: true, showGrid: true, showTicks: true, showTickLabels: false,
    tickLabelSize: 2.6, labelX: "x", labelY: "y", showAxisLabels: true,
    axisLabelSize: 3.5, showOrigin: true, labelOrigin: "O",
    labelType: "quantity", exportable: true,
  }),

  // function-graph/insert.js
  funcgraph: () => ({
    expr: "", domainMin: -5, domainMax: 5, planeId: null,
    points: [], closed: false, strokeWidth: 0.3,
    dashLength: 0, dashGap: 0, label: "", labelShow: false,
  }),
};

/* ===== 타입 설명 (describe_schema 툴이 쓰는 표) =====
 * LLM에게 21종 전체를 한 번에 던지면 토큰이 터지고 필드를 틀린다. 그래서 요약 한 줄 +
 * 필수 필드만 먼저 주고, 자세한 건 타입을 지정해 물어보게 한다.
 */
export const TYPE_DOC = {
  rect: { summary: "직사각형(블록·물체). 라벨 가능", required: "x,y,w,h" },
  ellipse: { summary: "타원·원", required: "x,y,w,h" },
  triangle: { summary: "직각삼각형(빗면). flipX/flipY로 방향", required: "x,y,w,h" },
  line: { summary: "직선. 화살표(arrowHead)·점선 지원. lineMode \"wavyArrow\"면 물결 화살표(광자·전자기파) — waveLength(파장mm, 기본 5)·waveAmp(진폭mm, 기본 1.1)", required: "p1,p2" },
  polyline: { summary: "꺾은선. closed:true면 채움 도형", required: "points[2+]" },
  curve: { summary: "부드러운 곡선(Catmull-Rom)", required: "points[2+]" },
  funcgraph: { summary: "함수 그래프. add_graph 툴로 만드는 것을 권장", required: "points[], planeId" },
  text: { summary: "일반 텍스트(x,y = 앵커). {roman1}~{roman12}는 Times 정체 로마숫자(I·II·III…)로 렌더. 흰 테두리(halo)는 기본 켜짐", required: "x,y,text" },
  formula: { summary: "수식(중괄호 문법). w/h는 앱이 실측하므로 추정치가 들어간다", required: "x,y,source" },
  image: {
    summary: "래스터 이미지. src(data URI) 또는 srcPath(로컬 파일 경로)를 준다. "
      + "srcPath를 주면 서버가 읽어 data URI로 바꾸고, w/h를 생략하면 원본 비율로 채운다",
    required: "x,y + (src | srcPath)",
  },
  svgAsset: { summary: `내장 SVG 심볼(${SVG_ASSET_IDS.join("/")})`, required: "x,y,w,h,assetId" },
  axes: { summary: "구형 좌표축. 신규 작업은 coordplane을 쓴다", required: "x,y,w,h" },
  coordplane: { summary: "좌표평면(축·격자·눈금). add_graph가 자동 생성", required: "x,y,w,h" },
  anglearc: { summary: "각도 호. x,y = 꼭짓점. label에 theta_1 처럼 쓰면 화면엔 θ₁로 변환됨(그리스어 이름·_아래첨자·^위첨자)", required: "x,y" },
  rightangle: { summary: "직각 표시. x,y = 꼭짓점", required: "x,y" },
  labeler: { summary: "지시선 + 라벨(㉠㉡). p1=가리키는 곳, p2=글자 위치", required: "p1,p2" },
  circuit: { summary: `회로 소자(${CIRCUIT_ELEMENTS.join("/")}). p1→p2가 양 단자. label에 R_1 처럼 쓰면 화면엔 R₁로 변환됨. bodyScale(소자 크기 배율, 기본 1)`, required: "p1,p2,element" },
  optics: { summary: `광학·역학 심볼(${OPTICS_KINDS.join("/")})`, required: "x,y,w,h,kind" },
  apparatus: { summary: `실험 기구(${APPARATUS_KINDS.join("/")})`, required: "x,y,kind" },
  chargefield: { summary: "전기력선. kind(pair 두 전하 | single 점전하 | uniform 평행판). p1·p2 = 두 전하 위치(single이면 p2가 그림 반경, uniform이면 두 점이 사각 영역의 마주보는 모서리). q1·q2(전하 크기, 부호 포함)·lines(가장 큰 전하에서 나가는 선 개수)·arrowDist(화살촉 거리mm)·chargeR·chargeLevel·label1·label2. 선 개수는 전하 크기에 비례하고, 짝을 못 찾은 선은 열린 선이 된다", required: "p1,p2" },
  fieldlines: { summary: "자기력선. kind(bar 막대자석 | wire 직선도선). bar: p1=N극 끝, p2=S극 끝, lines·magnetThick·showMagnet. wire: p1=도선, p2=바깥 원 위의 점, rings(동심원 수)·into(⊗ 들어가는 방향)", required: "p1,p2" },
  standingwave: { summary: "정상파. p1·p2 = 줄·관의 양 끝. medium(string 줄 | open 열린관 | closed 닫힌관)·n(배진동 차수, 닫힌관은 홀수만)·amplitude(배의 높이mm)·closedEnd(p1|p2)·showNodes(마디 ●)", required: "p1,p2" },
  pendulum: { summary: "단진자. p1=고정점, p2=추 중심. bobRadius(추 반지름 mm, 생략=길이 비례 자동)", required: "p1,p2" },
  spring: { summary: "용수철. p1→p2가 양 끝(물체에 닿는 지점). turns(감은 수, 기본 14)·radius(코일 반지름mm)·leadLength·springStyle(helix 감긴코일 | line 실·줄). 점선은 dashLength/dashGap", required: "p1,p2" },
  gauge: { summary: `측정 가이드(${GAUGE_KINDS.join("/")})`, required: "x,y,w,h,kind" },
};

export function describeType(type) {
  if (!OBJECT_TYPE_IDS.includes(type)) return null;
  const factory = DEFAULTS[type];
  return {
    type,
    ...TYPE_DOC[type],
    geometry: SIZE_TYPES.has(type) ? "box(x,y,w,h)"
      : P1P2_TYPES.has(type) ? "endpoints(p1,p2)"
      : POINT_ARRAY_TYPES.has(type) ? "points[]"
      : ANCHOR_TYPES.has(type) ? "anchor(x,y)" : "special",
    defaults: factory ? factory({}) : {},
    enums: enumsFor(type),
  };
}

function enumsFor(type) {
  const e = {};
  if (type === "optics") e.kind = OPTICS_KINDS;
  if (type === "apparatus") e.kind = APPARATUS_KINDS;
  if (type === "circuit") e.element = CIRCUIT_ELEMENTS;
  if (type === "svgAsset") e.assetId = SVG_ASSET_IDS;
  if (type === "gauge") e.kind = GAUGE_KINDS;
  if (type === "apparatus") e.variant = PULLEY_VARIANTS;   // 현재 variant를 쓰는 기구는 도르래뿐
  if (type === "line") { e.lineMode = LINE_MODES; e.arrowHead = ARROW_HEADS; }
  if (type === "polyline") e.arrowHead = ARROW_HEADS;
  if (type === "coordplane") e.axisVariant = AXIS_VARIANTS;
  if (["rect", "ellipse", "triangle", "polyline", "curve", "optics", "apparatus"].includes(type)) {
    e.fillStyle = FILL_STYLES;
  }
  if (["rect", "ellipse", "line", "optics", "circuit", "anglearc"].includes(type)) {
    e.labelType = LABEL_TYPES; e.labelPos = LABEL_POSITIONS;
  }
  if (["rect", "ellipse"].includes(type)) {
    // 상자 라벨 두 슬롯: 안쪽(물리량/이름표) + 바깥(위·아래·왼쪽·오른쪽)
    e.labelInnerType = LABEL_TYPES; e.labelOuterType = LABEL_TYPES;
    e.labelOuterPos = OUTER_LABEL_POSITIONS;
  }
  return e;
}

/* ===== 검증 + 기본값 채우기 =====
 * 왜 필요한가: `js/project-io.js`의 로드 경로는 매우 방어적이라 필드가 틀려도 조용히
 * 넘어가고 "그림만 이상한" 결과가 된다. 그래서 파일을 쓰기 전에 여기서 막는다.
 */
export function normalizeObject(input, opts = {}) {
  const errors = [];
  const warnings = [];
  if (!input || typeof input !== "object") {
    return { errors: ["객체가 아닙니다"], warnings, obj: null };
  }
  const type = input.type;
  if (!OBJECT_TYPE_IDS.includes(type)) {
    return { errors: [`알 수 없는 type "${type}" (가능: ${OBJECT_TYPE_IDS.join(", ")})`], warnings, obj: null };
  }
  // image: 렌더러(js/render/shapes.js renderImage)가 요구하는 건 x,y,w,h + src 뿐이다.
  // src는 data URI 여야 한다 — 프로젝트 .json 이 다른 기기로 옮겨져도 그림이 살아 있어야 하므로
  // 외부 파일 경로나 http URL 을 그대로 두지 않는다. 파일에서 만들려면 server.js 가
  // srcPath 를 읽어 data URI 로 바꿔 넣는다(add_objects 전처리).
  if (type === "image" && typeof input.src !== "string") {
    return {
      errors: ["image: src(data URI)가 없습니다 — srcPath로 파일 경로를 주면 서버가 변환합니다"],
      warnings, obj: null,
    };
  }

  const factory = DEFAULTS[type] || (() => ({}));
  const obj = {
    ...factory(input),
    ...stripUndefined(input),
    type,
    locked: input.locked ?? false,
    positionLocked: input.positionLocked ?? false,
    layerId: input.layerId ?? 1,
  };
  if (!NO_STROKE_TYPES.has(type)) {
    obj.strokeLevel = input.strokeLevel ?? 0;
    obj.strokeWidth = input.strokeWidth ?? obj.strokeWidth ?? DEFAULT_STROKE_WIDTH;
  }

  /* ----- 기하 검증 ----- */
  if (SIZE_TYPES.has(type)) {
    for (const k of ["x", "y", "w", "h"]) {
      if (!num(obj[k])) errors.push(`${type}: ${k}가 숫자가 아닙니다`);
    }
    if (num(obj.w) && obj.w <= 0) errors.push(`${type}: w는 0보다 커야 합니다`);
    if (num(obj.h) && obj.h <= 0) errors.push(`${type}: h는 0보다 커야 합니다`);
  } else if (P1P2_TYPES.has(type)) {
    if (!pt(obj.p1) || !pt(obj.p2)) errors.push(`${type}: p1/p2는 {x,y} 여야 합니다`);
    else if (obj.p1.x === obj.p2.x && obj.p1.y === obj.p2.y) errors.push(`${type}: p1과 p2가 같은 점입니다`);
  } else if (POINT_ARRAY_TYPES.has(type)) {
    if (!Array.isArray(obj.points) || obj.points.length < 2) errors.push(`${type}: points는 2개 이상 필요합니다`);
    else if (!obj.points.every(pt)) errors.push(`${type}: points 원소는 {x,y} 여야 합니다`);
  } else if (ANCHOR_TYPES.has(type)) {
    if (!num(obj.x) || !num(obj.y)) errors.push(`${type}: x,y가 숫자가 아닙니다`);
  }

  /* ----- 타입별 추가 검증 ----- */
  const enums = enumsFor(type);
  for (const [field, allowed] of Object.entries(enums)) {
    if (obj[field] !== undefined && !allowed.includes(obj[field])) {
      errors.push(`${type}.${field}: "${obj[field]}"는 허용되지 않습니다 (가능: ${allowed.join(", ")})`);
    }
  }
  if (type === "circuit") {
    const d = Math.hypot(obj.p2.x - obj.p1.x, obj.p2.y - obj.p1.y);
    if (d && d < CIRCUIT_BODY_MM + 2) {
      warnings.push(`circuit: 단자 간격 ${d.toFixed(1)}mm가 몸통(${CIRCUIT_BODY_MM}mm)보다 거의 짧아 리드가 안 보입니다 — 12mm 이상 권장`);
    }
  }
  if (type === "text" && !String(obj.text || "").length) warnings.push("text: 내용이 비어 있습니다");
  if (type === "formula") {
    obj.rawSource = obj.rawSource || obj.source || "";
    if (!num(obj.w) || !num(obj.h)) {
      // 앱은 캔버스로 실측하지만 서버에는 폰트 메트릭이 없다. 대략치를 넣고 경고한다.
      const n = String(obj.source || "").replace(/[{}\\]/g, "").length || 1;
      obj.w = obj.w ?? n * obj.fontSize * 0.55;
      obj.h = obj.h ?? obj.fontSize * 1.4;
      warnings.push("formula: w/h는 추정치입니다 — 앱에서 열어 한 번 클릭·이동하면 실측값으로 잡힙니다");
    }
  }
  if (type === "coordplane") {
    if (obj.xMax <= obj.xMin) errors.push("coordplane: xMax는 xMin보다 커야 합니다");
    if (obj.yMax <= obj.yMin) errors.push("coordplane: yMax는 yMin보다 커야 합니다");
  }
  if (type === "funcgraph" && (!Array.isArray(obj.points) || obj.points.length < 2)) {
    errors.push("funcgraph: points가 비었습니다 — add_graph 툴을 쓰세요");
  }

  /* ----- 아트보드 밖 경고: 내보내기에서 잘린다 -----
   * 아트보드 영역은 원점이 '중앙'이다 — svg-export.js exportRegion()이 내보내는
   * 사각형이 (-w/2, -h/2)~(+w/2, +h/2)다. 좌상단 기준으로 착각하면 그림 전체가
   * 페이지 밖으로 나가 내보내기에서 통째로 잘린다. */
  const ab = opts.artboard;
  if (ab && !errors.length) {
    const bb = bboxOf(obj);
    const hx = ab.w / 2, hy = ab.h / 2;
    if (bb && (bb.x < -hx - 0.01 || bb.y < -hy - 0.01 || bb.x + bb.w > hx + 0.01 || bb.y + bb.h > hy + 0.01)) {
      warnings.push(`아트보드 밖으로 나갑니다 — 그릴 수 있는 범위는 x ${-hx}~${hx}, y ${-hy}~${hy} (mm)입니다`);
    }
  }

  return { errors, warnings, obj: errors.length ? null : obj };
}

function stripUndefined(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}

/* 대략 bbox — 아트보드 밖 경고용이라 정밀할 필요는 없다(텍스트는 폭을 모르므로 제외). */
export function bboxOf(o) {
  if (SIZE_TYPES.has(o.type)) return { x: o.x, y: o.y, w: o.w, h: o.h };
  if (P1P2_TYPES.has(o.type)) {
    return {
      x: Math.min(o.p1.x, o.p2.x), y: Math.min(o.p1.y, o.p2.y),
      w: Math.abs(o.p2.x - o.p1.x), h: Math.abs(o.p2.y - o.p1.y),
    };
  }
  if (POINT_ARRAY_TYPES.has(o.type) && Array.isArray(o.points) && o.points.length) {
    const xs = o.points.map((p) => p.x), ys = o.points.map((p) => p.y);
    return {
      x: Math.min(...xs), y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
    };
  }
  return null;
}

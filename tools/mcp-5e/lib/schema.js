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
  "object_arrow", "point_light", "screen", "pulley", "node", "support_tri",
  "pivot", "bar_magnet",
];
export const APPARATUS_KINDS = ["wire", "compass", "pulley", "clamp", "scale"];
export const CIRCUIT_ELEMENTS = [
  "resistor", "dc_source", "ac_source", "capacitor", "inductor",
  "diode", "lamp", "ammeter", "voltmeter", "unknown",
];
export const SVG_ASSET_IDS = ["pulley", "cart"];
export const GAUGE_KINDS = ["ruler", "protractor"];
export const FILL_STYLES = ["solid", "dots", "cross", "hatch"];
export const ARROW_HEADS = ["none", "end", "start", "both"];
export const LINE_MODES = ["solid", "arrow", "middleArrow", "lengthArrow"];
export const LABEL_TYPES = ["quantity", "label"];
export const LABEL_POSITIONS = ["center", "above", "below", "left", "right"];
export const AXIS_VARIANTS = ["cross", "quadrant", "single"];

// project-io.js APPARATUS_TEMPLATE_IDS
const APPARATUS_TEMPLATE_IDS = {
  wire: "E001", compass: "E002", pulley: "M001", clamp: "M004", scale: "M003",
};

// 기구별 기본 크기 (templates.js DEFAULT_SIZES 발췌)
const APPARATUS_SIZES = {
  wire: { w: 26, h: 6 }, compass: { w: 18, h: 18 }, pulley: { w: 18, h: 18 },
  clamp: { w: 18, h: 24 }, scale: { w: 26, h: 18 },
};

/* ----- 기하 분류 ----- */
const P1P2_TYPES = new Set(["line", "circuit", "pendulum", "labeler"]);
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
    if (kind === "wire") {
      d.length = o.w ?? size.w; d.angle = 0; d.thickness = 1.8; d.gap = 1.8;
    }
    if (kind === "compass") d.needleAngle = -90;
    if (kind === "pulley") d.variant = "basic";
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
    if (["resistor", "inductor", "capacitor", "voltmeter", "ammeter"].includes(element)) {
      d.height = (element === "voltmeter" || element === "ammeter") ? 5.12 : 3.2;
    }
    if (element === "capacitor") d.gap = 1.6;
    if (element === "diode") d.terminalLabels = ["", ""];
    return d;
  },

  // tools.js makePendulum
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
  line: { summary: "직선. 화살표(arrowHead)·점선 지원", required: "p1,p2" },
  polyline: { summary: "꺾은선. closed:true면 채움 도형", required: "points[2+]" },
  curve: { summary: "부드러운 곡선(Catmull-Rom)", required: "points[2+]" },
  funcgraph: { summary: "함수 그래프. add_graph 툴로 만드는 것을 권장", required: "points[], planeId" },
  text: { summary: "일반 텍스트(x,y = 앵커)", required: "x,y,text" },
  formula: { summary: "수식(중괄호 문법). w/h는 앱이 실측하므로 추정치가 들어간다", required: "x,y,source" },
  image: { summary: "래스터 이미지. MCP로는 만들 수 없다(앱에서 붙여넣기)", required: "-" },
  svgAsset: { summary: `내장 SVG 심볼(${SVG_ASSET_IDS.join("/")})`, required: "x,y,w,h,assetId" },
  axes: { summary: "구형 좌표축. 신규 작업은 coordplane을 쓴다", required: "x,y,w,h" },
  coordplane: { summary: "좌표평면(축·격자·눈금). add_graph가 자동 생성", required: "x,y,w,h" },
  anglearc: { summary: "각도 호(θ 표시). x,y = 꼭짓점", required: "x,y" },
  rightangle: { summary: "직각 표시. x,y = 꼭짓점", required: "x,y" },
  labeler: { summary: "지시선 + 라벨(㉠㉡). p1=가리키는 곳, p2=글자 위치", required: "p1,p2" },
  circuit: { summary: `회로 소자(${CIRCUIT_ELEMENTS.join("/")}). p1→p2가 양 단자`, required: "p1,p2,element" },
  optics: { summary: `광학·역학 심볼(${OPTICS_KINDS.join("/")})`, required: "x,y,w,h,kind" },
  apparatus: { summary: `실험 기구(${APPARATUS_KINDS.join("/")})`, required: "x,y,kind" },
  pendulum: { summary: "단진자. p1=고정점, p2=추 중심", required: "p1,p2" },
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
  if (type === "line") { e.lineMode = LINE_MODES; e.arrowHead = ARROW_HEADS; }
  if (type === "polyline") e.arrowHead = ARROW_HEADS;
  if (type === "coordplane") e.axisVariant = AXIS_VARIANTS;
  if (["rect", "ellipse", "triangle", "polyline", "curve", "optics", "apparatus"].includes(type)) {
    e.fillStyle = FILL_STYLES;
  }
  if (["rect", "ellipse", "line", "optics", "circuit", "anglearc"].includes(type)) {
    e.labelType = LABEL_TYPES; e.labelPos = LABEL_POSITIONS;
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
  if (type === "image") {
    return { errors: ["image는 MCP로 만들 수 없습니다 — 앱에서 붙여넣기(Ctrl+V) 하세요"], warnings, obj: null };
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

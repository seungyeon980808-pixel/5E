import { createDraftHistory } from './draft-history.js?v=1.7.0-four-session-integration';
import { mountGraphInlineText } from './inline-text.js?v=1.7.0-four-session-integration';
/* ===== GRAPH MODAL: "그래프" 통합 제작기 (좌표 → 계열 → 출력) =====
 *
 * 사용자가 지정한 워크플로 그대로: ① 좌표 틀을 세팅하고 ② 같은 화면에서 그 위에
 * 함수식·직선/꺾은선 계열을 얹은 뒤 ③ "만들기" 한 번으로 완성본이 캔버스에 출력된다.
 * 좌표평면 각종 설정이 인스펙터로 흩어지지 않도록, 편집도 이 모달을 다시 연다
 * (coordplane 더블클릭 / 인스펙터 "그래프 편집…" → openGraphModal(planeId)).
 *
 * 계열 입력 2방식(둘 다 지원):
 *   - 함수식: y= 입력(+정의역), 미리보기에 즉시 렌더.
 *   - 직선/꺾은선: 미리보기를 직접 클릭해 점을 찍거나(반 칸 스냅), 좌표 텍스트로 입력.
 *
 * 삽입 결과 = coordplane 1개 + funcgraph N개(같은 planeId, undo 1회). 편집 모드는
 * 평면 속성만 갱신(박스 위치·크기 보존)하고 기존 계열 ID와 쌓임 순서를 보존한다 — 표시점/수선
 * 등 부속 객체는 funcgraph id가 아니라 planeId만 참조하므로 안전. */

import { state, ptToMm, mmToPt } from "../state.js?v=1.7.0-four-session-integration";
import { makeDefaultCoordplane } from "../function-graph/defaults.js?v=1.7.0-four-session-integration";
import { renderCoordplane, renderFuncgraph, smoothSamplePts, catmullRomHandles, bezierSamplePts, markerRadius } from "../render/coordplane.js?v=1.7.0-four-session-integration";
import { compile } from "../function-graph/parser.js?v=1.7.0-four-session-integration";
import { sampleFunctionPoints } from "../function-graph/sampler.js?v=1.7.0-four-session-integration";
import { worldFromMath, mathFromWorld, planeAsY2, originWorld } from "../function-graph/coords.js?v=1.7.0-four-session-integration";
import { nextObjectId } from "../tools/id.js?v=1.7.0-four-session-integration";
import { simplifyRDP, fdPerpDist } from "../geometry.js?v=1.7.0-four-session-integration";

import { shapePreservingHandles, sampleShapeSegment } from "../function-graph/shape-preserving.js?v=1.7.0-four-session-integration";

import { applyEngineCfg, validateEnginePlane, seriesFeatureFields, mountEngineControls, ENGINE_PLANE_FIELDS } from "./graph-engine-controls.js?v=1.7.0-four-session-integration";
import { buildRegionGeometry } from "./graph-features.js?v=1.7.0-four-session-integration";
import { fitObservedCurve } from "../function-graph/curve-fit.js?v=1.7.0-four-session-integration";
import { inferAxisStep, axisTickBounds, axisMargins, extendGuideGrid } from './axis-layout.js?v=1.7.0-four-session-integration';
import { EXAM_STYLE, isExamStyle, examMetrics, graphSizeAdvice } from './exam-style.js?v=1.7.0-four-session-integration';
import { registerEscapeLayer } from '../escape-layers.js?v=1.7.0-four-session-integration';
import { installGraphNumberFields, roundedGraphNumber } from './number-fields.js?v=1.7.0-four-session-integration';
import { simplifyPolyline } from '../function-graph/polyline-simplify.js?v=1.7.0-four-session-integration';
import { appendDisplayHeading, syncDisplayProperties } from './display-workspace.js?v=1.7.0-four-session-integration';
import { openPdfReferencePicker } from '../pdf-library/reference-picker.js?v=1.7.0-four-session-integration';
import { applyElementGuide, seriesGuideColor, annotationGuideColor } from './element-guide.js?v=1.7.0-four-session-integration';
import { createTraceEditor } from './trace-overlay.js?v=1.7.0-four-session-integration';

let _engineControls = null;
let _editBaseline = null;
let _numberFields = null, _elementGuide = false, _guideFocusSelector = null;
let _traceController = null, _traceTouched = false, _resumeFromLibrary = null;

function saveTrace(plane) {
  const settings = _traceController?.getState();
  if (settings && (_traceTouched || plane.graphTrace)) plane.graphTrace = settings;
}
const SVG_NS = "http://www.w3.org/2000/svg";
const PAD_X = 1.6;                // x: 마지막 눈금 → 화살표 여유(요구: 조금 줄임)
const PAD_Y = 1.3;                // y: 마지막 눈금 → 화살표 여유
const GRID_OVER = 0.5;            // 격자를 마지막 눈금 밖으로 더 뻗는 칸(사진4: "반 칸")
// 회색조 프로젝트: 색 대신 선 종류로 계열 구분. [라벨, dashLength, dashGap](mm).
// 대시·간격 40% 축소(요구): 점선 1.6/1.2→0.96/0.72, 파선 2.4/1.3→1.44/0.78.
// [이름, 대시 길이, 간격]. 0,0 = 실선. 글자로는 어떤 선인지 알 수 없어 버튼은 미니 SVG로 그린다.
const LINE_STYLES = [
  ["실선", 0, 0],
  ["촘촘한 점선", 0.42, 0.5],
  ["점선", 0.96, 0.72],
  ["파선", 1.9, 0.9],
  ["일점쇄선", 2, 0.8, [2, 0.8, 0.3, 0.8]],
  ["이점쇄선", 2, 0.8, [2, 0.8, 0.3, 0.8, 0.3, 0.8]],
];
// Display the effective pattern, including older files that contain both fields.
// Keep the saved fields intact until the user explicitly changes the line.
function effectiveLineStyleIndex(s) {
  const pattern = s.dashPattern;
  if (Array.isArray(pattern) && pattern.length >= 2 && pattern.every(v => Number.isFinite(v) && v >= 0) && pattern.some(v => v > 0)) {
    return LINE_STYLES.findIndex(([, dl, dg, full]) => JSON.stringify(full || (dl && dg ? [dl, dg] : [])) === JSON.stringify(pattern));
  }
  const [dl, dg] = s.customDash || (LINE_STYLES[s.styleIdx] ? LINE_STYLES[s.styleIdx].slice(1, 3) : [s.dashLength ?? 0, s.dashGap ?? 0]);
  return LINE_STYLES.findIndex(([, a, b, full]) => !full && Math.abs(a - dl) < 1e-6 && Math.abs(b - dg) < 1e-6);
}
// 수식 도우미 버튼(기존 함수 도구와 동일): [라벨, 커서에 삽입할 문자].
const HELPERS = [
  ["sin", "sin("], ["cos", "cos("], ["tan", "tan("], ["log", "log("], ["ln", "ln("],
  ["√", "sqrt("], ["exp", "exp("], ["xⁿ", "^"], ["π", "pi"], ["x", "x"],
  ["(", "("], [")", ")"], ["+", "+"], ["−", "-"], ["×", "*"], ["÷", "/"],
];
function insertAtCursor(input, text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const caret = start + text.length;
  input.setSelectionRange(caret, caret);
  input.focus();
}

let _overlay = null, _els = null;
let _draftHistory = null, _inlineText = null;
let _focusReturn = null, _disposeEscape = null, _cancelPreviewDrag = null;
let _regionPointer = null;
let _expressionErrors = new Map();
let _seriesInputDrafts = new WeakMap();
const _arrowInputIds = new WeakMap();
let _arrowInputSerial = 0;
let _mode = "create";             // "create" | "edit"
let _planeId = null;              // edit 대상 coordplane id
let _cfg = null;                  // 좌표 틀 설정(진실 원본 — DOM 리스너가 여기에 쓴다)
let _series = [];                 // [{kind:"expr",expr,domain:{min,max}|null,...} | {kind:"points",pts:[{x,y}수학],...}]
let _sel = -1;                    // 선택 계열 index
let _previewSvg = null;           // 클릭 좌표 환산용
let _previewPlane = null;
let _editingContext = null;
const editorState = () => _editingContext?.state || state;
let _placeMode = null;            // null | "marker" | "guide" | "arrow" — 미리보기 클릭 배치 모드
let _annMode = null;              // '표시' 탭 배치 모드: null | "marker"|"guide"|"arrow"|"guideline"|"legend"
let _annPending = null;           // 두 점짜리(화살표·가이드라인)의 첫 점 임시 저장
let _lpSel = -1;                  // 선택된 라벨러 표시점 index(-1=없음). PageUp/Down 각도 회전 대상
let _boxMode = false;             // 사각형 드래그로 정의역·치역을 한 번에 지정하는 중
let _areaMode = false;            // 좌우 드래그로 '면적 채움 구간'을 지정하는 중
let _selPts = null;               // 선택 계열의 baked world points(배치 고스트 스냅·클릭 가드용)
let _selBreaks = null;            // 선택 계열의 끊긴 구간 경계(worldYAtX가 빈 구간 건너뛰게)
let _allSeriesPts = [];           // 모든 계열의 baked world points [{pts,breaks}] — '표시' 탭 스냅용
let _activeDraw = -1;             // 클릭으로 '그리는 중'인 점 계열 index(-1=없음). 빈 클릭 선택해제 판정용

/* ---------- 기본값 ---------- */
function defaultCfg() {
  return {
    graphStyle: {preset:EXAM_STYLE.preset,referenceWidth:EXAM_STYLE.defaultWidth}, outputWidth:EXAM_STYLE.defaultWidth,
    engine: { strokeWidth: 0.3 }, engineBounds: null, engineY2: null, regions: [],
    guideStyle: {strokeWidth:0.14,dashLength:0.55,dashGap:0.4},
    axisPlacement: { x: { mode: "zero" }, y: { mode: "zero" } }, coordinateMode: "data", labelWeight: 400,
    variant: "quadrant", xNeg: 0, xPos: 5, yNeg: 0, yPos: 5,
    tickStepX: 1, tickStepY: 1,    // 한 칸이 나타내는 값(숫자 눈금 라벨 전용; 물리 칸은 불변)
    labelX: "x", labelY: "y", showX: true, showY: true,
    // 오른쪽 세로축(y2) — 생명과학 자료해석 문항의 좌우 이중 y축. 끄면(기본) 평면에
    // y2 필드 자체를 안 넣으므로, 옛 그래프는 물론 새로 만든 보통 그래프도 종전과 동일하다.
    y2On: false, labelY2: "", y2Pos: null,   // y2Pos = 오른쪽 축 마지막 눈금 값(null=왼쪽과 같음)
    y2ShowTick: false,                       // 기출 관례: 오른쪽 눈금 숫자가 없는 경우가 많다
    y2TickText: "",                          // 직접 문자 눈금(쉼표 구분, 아래→위)
    origin: "0", showOrigin: true,
    showGrid: true, showTicks: true,
    tickMode: "none",             // "none" | "number" | "multiple" | "text"
    tickTextX: "", tickTextY: "", // 직접 모드: 쉼표 구분 입력 원문
    tickBaseX: "", tickBaseY: "", // 배수 모드: 기준 문자(t_0 → t₀, 2t₀, 3t₀… 자동)
    axisLabelScale: 1.0,          // 축 이름 글씨 배율(요구: 성분 라벨과 분리)
    tickLabelScale: 1.0,          // 눈금·성분(끝 라벨 포함) 글씨 배율
    lockPosition: true,           // 좌표·함수 묶기 = 기본 ON(요구)
    labelMovable: true,           // 축 라벨은 항상 직접 이동
    labelXOffset: { dx: 0, dy: 0 }, // 축 이름 위치 오프셋(월드 mm; 드래그로 조정)
    labelYOffset: { dx: 0, dy: 0 },
    labelXPos: null, labelYPos: null, // 옮긴 축 이름의 박스 기준 절대 분율(요구 2). null=축 앵커 사용
    tickMovable: true,            // 눈금 라벨은 항상 직접 이동
    tickOffX: [], tickOffY: [],   // 눈금 숫자별 위치 오프셋 [{dx,dy}…] (순번 = 아래→위)
    // 고급: 화살표 촉 위치 = 마지막 눈금에서의 여백(네 끝 각각, 값 단위). 기본 = 현행(x 1.6·y 1.3).
    padXPos: PAD_X, padXNeg: PAD_X, padYPos: PAD_Y, padYNeg: PAD_Y,
    // 고급: 점선 격자가 눈금 밖으로 튀어나오는 칸(네 끝 각각). 0=닫힘, >0=열려 튀어나옴. 기본 0.5.
    gridOverXPos: GRID_OVER, gridOverXNeg: GRID_OVER, gridOverYPos: GRID_OVER, gridOverYNeg: GRID_OVER,
    // '표시' 레이어(요구 ③): 곡선에 종속되지 않는 독립 주석. 전부 math 좌표.
    annMarkers: [],               // 자유 표시점 [{x,y}]
    annGuides: [],                // 자유 수선의 발 [{x,y}] (두 축으로 점선)
    annArrows: [],                // 자유 화살촉 [{x,y, tx,ty}] (head, tail로 방향)
    guideLines: [],               // 가이드라인 [{x1,y1,x2,y2}] (두 점 점선)
    legends: [],                  // 범례 박스 [{x,y, rows:[{dash,text}]}]
    // 라벨러 표시점(요구 ⑥): 점 + A·B·C… 순서 라벨. dist(mm)·angle(도, 0=오른쪽·+=반시계)·
    // size(mm, 15pt 기본)로 라벨 위치·크기를 조절. text는 직접 수정 가능.
    annLabelPoints: [],            // [{x,y, text, dist, angle, size}]
  };
}
// 계열 기본 선 굵기: 축보다 굵되 과하지 않게(요구: 조금 더 얇게 → 0.4mm).
// curveStyle: 함수식=곡선(smooth), 직선·꺾은선=직선(straight) 기본. autoExtend: 자동 연장선(기본 off).
// movable: '이동' 체크(요구) — 켜면 미리보기에서 곡선 몸통 드래그 = 계열 전체 이동.
function newExprSeries() { return { kind: "expr", axis: "y", expr: "", domain: null, range: null, styleIdx: 0, strokeWidth: 0.45, curveStyle: "smooth", curvature: 1, offset: { dx: 0, dy: 0 }, endLabel: "", autoExtend: false, movable: false, markers: [], guides: [], arrows: [], area: null }; }
function newPointsSeries() { return { kind: "points", axis: "y", pts: [], handles: null, styleIdx: 0, strokeWidth: 0.45, curveStyle: "straight", curvature: 1, endLabel: "", autoExtend: false, movable: false, markers: [], guides: [], arrows: [] }; }
// 막대그래프 계열(생명과학 기출 관례): 세로 막대 + 회색 단색 + 검은 외곽선, 무늬 없음이 기본.
// items = [{label, value}] (값·이름표를 쉼표 한 줄로 받아 이 배열로 파싱). widthRatio =
// 한 칸(슬롯)에서 막대가 차지하는 비율 — 0.55면 막대:간격 ≈ 1:0.8 로 기출 판형에 가깝다.
function newBarSeries() { return { kind: "bar", axis: "y", items: [], widthRatio: 0.55, fillStyle: "gray", styleIdx: 0, strokeWidth: 0.3, endLabel: "", movable: false, markers: [], guides: [], arrows: [] }; }
// 막대 채우기 선택지: [라벨, 값]. 값은 기존 채우기 무늬 어휘(solid/hatch/dots/cross)를 그대로
// 재사용하되, 회색·흰색은 명도만 다른 solid이므로 여기서만 별칭으로 구분한다.
const BAR_FILLS = [["회색", "gray"], ["흰색", "white"], ["빗금", "hatch"], ["점", "dots"], ["교차", "cross"]];
const BAR_GRAY_LEVEL = 170;   // 기출 막대 회색(0=검정, 255=흰색)
const MAX_TICK_LABELS = 160;
// 막대 채우기 별칭 → 공용 채우기 필드(fillStyle/fillLevel). 렌더는 js/render/fill.js가 맡는다.
function barFillFields(alias) {
  const a = alias || "gray";
  if (a === "white") return { fillStyle: "solid", fillLevel: 255 };
  if (a === "gray") return { fillStyle: "solid", fillLevel: BAR_GRAY_LEVEL };
  return { fillStyle: a, fillLevel: 0 };   // hatch/dots/cross = 검은 무늬
}
// 쉼표 한 줄 ↔ 배열. 값은 숫자, 이름표는 글자 그대로(빈 칸 허용).
function parseCsvLine(text) {
  return String(text || "").split(",").map((t) => t.trim());
}
function barValuesText(s) { return (s.items || []).map((it) => (Number.isFinite(it.value) ? it.value : "")).join(", "); }
function barLabelsText(s) { return (s.items || []).map((it) => it.label || "").join(", "); }

/* ---------- cfg → coordplane 필드 반영 (범위·표시 — 박스 지오메트리 제외) ---------- */
function parseTicks(text) {
  const arr = String(text || "").split(",").map((s) => s.trim());
  while (arr.length && arr[arr.length - 1] === "") arr.pop();
  return arr;
}
// 배수 눈금(요구: 문자 눈금을 더 쉽게): 기준 하나로 [기준, 2기준, 3기준…] 자동 생성.
// 예: base="t_0", count=5 → ["t_0","2t_0","3t_0","4t_0","5t_0"] → 렌더 시 t₀,2t₀,…
function genMultiples(base, count) {
  const b = String(base || "").trim();
  if (!b) return [];
  const out = [];
  const visibleCount = Math.min(MAX_TICK_LABELS, Math.max(1, Math.floor(count)));
  for (let k = 1; k <= visibleCount; k++) out.push(k === 1 ? b : `${k}${b}`);
  return out;
}
function generatedTicks(plane, axis, mode, base = '') {
  const min=plane[`${axis}Min`],max=plane[`${axis}Max`],step=plane[`gridStep${axis.toUpperCase()}`] || 1;
  const values=[];
  if(plane[`${axis}Scale`]==='log') {
    for(let e=Math.ceil(Math.log10(min));e<=Math.floor(Math.log10(max))&&values.length<MAX_TICK_LABELS;e++)values.push(10**e);
  } else for(let k=Math.ceil(min/step);k<=Math.floor(max/step)&&values.length<MAX_TICK_LABELS;k++) if(k!==0)values.push(Number((k*step).toPrecision(12)));
  return values.map(value=>{const multiple=plane[`${axis}Scale`]==='log'?value:Number((value/step).toPrecision(12));return {value,label:mode==='number'?String(value):mode==='multiple'?(base?(multiple===1?base:multiple===-1?`-${base}`:`${multiple}${base}`):''):''};});
}
function applyDirectTicks(plane,cfg) {
  const base=cfg.exactInitial || {};
  const tickFields=['tickMode','tickBaseX','tickBaseY','tickTextX','tickTextY','explicitTicksX','explicitTicksY'];
  const unchanged=cfg.exactInitial && tickFields.every(key=>JSON.stringify(cfg[key])===JSON.stringify(base[key]));
  const automatic=cfg.tickMode==='number'||cfg.tickMode==='multiple';
  // Preserve imported tick metadata when neither the labels nor their generation inputs changed.
  if(unchanged && (!automatic || JSON.stringify(cfg.exactBounds)===JSON.stringify(base.exactBounds)))return;
  plane.graphTickMode=cfg.tickMode;plane.tickBaseX=cfg.tickBaseX;plane.tickBaseY=cfg.tickBaseY;
  plane.tickLabelMode=cfg.tickMode==='multiple'?'text':cfg.tickMode;plane.showTickLabels=cfg.tickMode==='number';
  for(const axis of ['x','y']) {
    const upper=axis.toUpperCase(),key=`explicitTicks${upper}`,textKey=`tickText${upper}`;
    if(cfg.tickMode==='text') {
      const original=cfg[key] || generatedTicks(plane,axis,'text');
      const labels=parseCsvLine(cfg[textKey]);
      plane[key]=structuredClone(original);
      if(cfg[textKey]!==base[textKey])plane[key]=plane[key].map((tick,i)=>{const next={...tick,label:labels[i]??''};delete next.displayMath;delete next.displayText;return next;});
      plane[textKey]=labels;
    } else if(cfg.tickMode==='number'||cfg.tickMode==='multiple')plane[key]=generatedTicks(plane,axis,cfg.tickMode,cfg[`tickBase${upper}`]);
    else plane[key]=structuredClone(cfg[key] || []);
  }
}
function applyLegacyCfg(plane, cfg) {
  plane.axisPlacement = structuredClone(cfg.axisPlacement || { x: { mode: "zero" }, y: { mode: "zero" } });
  plane.coordinateMode = cfg.coordinateMode || "data";
  plane.labelWeight = cfg.labelWeight ?? 400;
  if (cfg.exactBounds) {
    // Imported ranges are data coordinates, not the legacy last-tick plus padding UI.
    Object.assign(plane, cfg.exactBounds);
    const base = cfg.exactInitial || {};
    const fields = { labelX: 'labelX', labelY: 'labelY', showX: 'showAxisLabelX', showY: 'showAxisLabelY', showOrigin: 'showOrigin', origin: 'labelOrigin', showGrid: 'showGrid', showTicks: 'showTicks', lockPosition: 'seriesLock', labelXOffset: 'labelXOffset', labelYOffset: 'labelYOffset', labelXPos: 'labelXPos', labelYPos: 'labelYPos', tickOffX: 'tickOffX', tickOffY: 'tickOffY', annMarkers: 'annMarkers', annGuides: 'annGuides', annArrows: 'annArrows', guideLines: 'guideLines', legends: 'legends', annLabelPoints: 'annLabelPoints', graphAnnotations: 'graphAnnotations', axisLabelScale: 'axisLabelScale', tickLabelScale: 'tickLabelScale' };
    for (const [key, dest] of Object.entries(fields)) if (JSON.stringify(cfg[key]) !== JSON.stringify(base[key])) plane[dest] = structuredClone(cfg[key]);
    if (cfg.labelX !== base.labelX) { plane.showAxisLabelX = !!cfg.labelX; plane.showAxisLabels = true; }
    if (cfg.labelY !== base.labelY) { plane.showAxisLabelY = !!cfg.labelY; plane.showAxisLabels = true; }
    if (cfg.axisLabelScale !== base.axisLabelScale) plane.axisLabelSize = base.exactLabelSizes.axis * cfg.axisLabelScale / (base.axisLabelScale || 1);
    if (cfg.tickLabelScale !== base.tickLabelScale) plane.tickLabelSize = base.exactLabelSizes.tick * cfg.tickLabelScale / (base.tickLabelScale || 1);
    if (cfg.originLabelSize !== base.originLabelSize) plane.originLabelSize = cfg.originLabelSize;
    if (JSON.stringify(cfg.guideStyle) !== JSON.stringify(base.guideStyle)) plane.guideStyle = structuredClone(cfg.guideStyle);
    applyDirectTicks(plane,cfg);
    if (cfg.y2On !== base.y2On) { if (!cfg.y2On) delete plane.y2; }


    if (cfg.exactY2 && cfg.y2On) plane.y2 = { ...plane.y2, ...cfg.exactY2 };
    if (cfg.y2On && !plane.y2 && cfg.engineY2)plane.y2=structuredClone(cfg.engineY2);
    if (plane.y2) {
      plane.y2.enabled=true;
      if (cfg.labelY2 !== base.labelY2) plane.y2.labelY2 = cfg.labelY2;
      if (cfg.y2ShowTick !== base.y2ShowTick) plane.y2.showTickY2 = cfg.y2ShowTick;
      if (cfg.y2TickText !== base.y2TickText) {const labels=parseCsvLine(cfg.y2TickText);plane.y2.explicitTicks=(plane.y2.explicitTicks?.length?plane.y2.explicitTicks:generatedTicks(planeAsY2(plane),'y','number')).map((tick,i)=>({...tick,label:cfg.y2TickText.trim()?(labels[i]??''):String(tick.value)}));}
    }
    return plane;
  }
  // 축별로 음(neg)·양(pos) 방향 칸 수를 따로 둔다(요구 1·2: 비대칭 범위). neg=0이면 그 방향
  // 축 팔이 없다(ㄴ자·ㅏ자). 모양 프리셋은 이 값들을 채우고, 범위 입력으로 미세 조정한다.
  const xPos = Math.max(1, cfg.xPos), yPos = Math.max(1, cfg.yPos);
  const xNeg = Math.max(0, cfg.xNeg || 0), yNeg = Math.max(0, cfg.yNeg || 0);
  plane.axisVariant = cfg.variant;
  plane.richLabels = true;
  plane.gridToData = true;
  // 화살표 촉 위치(고급): 마지막 눈금에서의 여백을 네 끝 각각 지정(값 단위, 기본 현행 1.6/1.3).
  const padXP = Number.isFinite(cfg.padXPos) ? cfg.padXPos : PAD_X;
  const padXN = Number.isFinite(cfg.padXNeg) ? cfg.padXNeg : PAD_X;
  const padYP = Number.isFinite(cfg.padYPos) ? cfg.padYPos : PAD_Y;
  const padYN = Number.isFinite(cfg.padYNeg) ? cfg.padYNeg : PAD_Y;
  plane.xMin = xNeg > 0 ? -(xNeg + padXN) : 0;
  plane.xMax = xPos + padXP;
  plane.yMin = yNeg > 0 ? -(yNeg + padYN) : 0;
  plane.yMax = yPos + padYP;
  plane.padXPos = padXP; plane.padXNeg = padXN; plane.padYPos = padYP; plane.padYNeg = padYN;  // 재편집 복원용
  // 격자 간격(요구): 축이 덮는 값 범위(0~xPos)는 그대로 두고 **격자선을 그 간격마다** 긋는다.
  // 간격 0.5면 눈금이 0, 0.5, 1 … 로 촘촘해진다(칸이 2배). 라벨은 coordplane이 k×step으로
  // 계산하므로 별도 배율이 필요 없다 — 격자와 숫자가 자동으로 같은 값을 가리킨다.
  const gsx = Number.isFinite(cfg.tickStepX) && cfg.tickStepX >= 0.1 ? cfg.tickStepX : 1;
  const gsy = Number.isFinite(cfg.tickStepY) && cfg.tickStepY >= 0.1 ? cfg.tickStepY : 1;
  plane.gridStepX = gsx; plane.gridStepY = gsy;
  // tickStep*도 같은 값으로 맞춘다. 아래 graphCfg가 plane.tickStep*을 읽어 저장하는데,
  // 여기서 갱신하지 않으면 언제나 기본값 1이 저장돼 재편집 때 간격이 1로 되돌아갔다
  // (간격 1.5로 만든 그래프를 다시 열면 1이 되던 버그).
  plane.tickStepX = gsx; plane.tickStepY = gsy;
  // 칸 수 = 값 범위 ÷ 간격. 나누어떨어지지 않으면 반올림해 마지막 눈금을 범위 끝에 맞춘다.
  const kxPos = Math.max(1, Math.round(xPos / gsx)), kxNeg = Math.max(0, Math.round(xNeg / gsx));
  const kyPos = Math.max(1, Math.round(yPos / gsy)), kyNeg = Math.max(0, Math.round(yNeg / gsy));
  plane.gridCountX = kxPos; plane.gridCountY = kyPos;        // 구코드 호환(양의 칸 수)
  plane.gridCountXPos = kxPos; plane.gridCountXNeg = kxNeg;  // 비대칭 격자·눈금 범위
  plane.gridCountYPos = kyPos; plane.gridCountYNeg = kyNeg;
  // 점선 격자 튀어나옴(고급): 네 끝 각각(칸 단위). gridOver는 구코드 호환(대칭 폴백값)으로 남긴다.
  plane.gridOverXPos = Number.isFinite(cfg.gridOverXPos) ? cfg.gridOverXPos : GRID_OVER;
  plane.gridOverXNeg = Number.isFinite(cfg.gridOverXNeg) ? cfg.gridOverXNeg : GRID_OVER;
  plane.gridOverYPos = Number.isFinite(cfg.gridOverYPos) ? cfg.gridOverYPos : GRID_OVER;
  plane.gridOverYNeg = Number.isFinite(cfg.gridOverYNeg) ? cfg.gridOverYNeg : GRID_OVER;
  plane.gridOver = plane.gridOverXPos;            // 구코드 호환(단일값 폴백)
  plane.showGrid = cfg.showGrid;
  plane.showTicks = cfg.showTicks;
  // 눈금 라벨: 없음/숫자/배수(기준 문자 자동)/직접(쉼표). 배수·직접은 렌더상 "text" 모드.
  plane.graphTickMode = cfg.tickMode;   // cfg 레벨 모드(재편집 복원용; 배수↔직접 구분)
  plane.tickBaseX = cfg.tickBaseX; plane.tickBaseY = cfg.tickBaseY;
  if (cfg.tickMode === "multiple") {
    plane.tickLabelMode = "text"; plane.showTickLabels = false;
    // 배수 개수 = 그 방향 양의 칸 수(xPos/yPos). cx/cy는 이 함수 스코프에 없는 변수였다
    // — 라벨을 '배수'로 선택하는 즉시 ReferenceError로 모달 전체가 크래시했다.
    plane.tickTextX = genMultiples(cfg.tickBaseX, xPos);
    plane.tickTextY = genMultiples(cfg.tickBaseY, yPos);
  } else {
    plane.tickLabelMode = cfg.tickMode;
    plane.showTickLabels = cfg.tickMode === "number"; // 구코드 호환 플래그
    plane.tickTextX = parseTicks(cfg.tickTextX);
    plane.tickTextY = parseTicks(cfg.tickTextY);
  }
  // ----- 오른쪽 세로축(y2): 좌우 이중 y축 -----
  // 판(box)은 하나뿐이라 두 축의 격자·눈금 높이는 반드시 같은 자리여야 한다. 그래서 UI는
  // '오른쪽 축 마지막 눈금 값'(y2Pos) 하나만 받고, 왼쪽 축 범위 전체에 같은 배율 s2를 곱해
  // y2Min/y2Max를 만든다 → 오른쪽 눈금 k칸이 왼쪽 눈금 k칸과 정확히 같은 높이에 놓인다.
  // y2를 안 쓰면 plane.y2를 아예 지운다(필드가 없으면 렌더러가 종전과 100% 동일하게 그린다).
  if (cfg.y2On) {
    const y2Pos = Number.isFinite(cfg.y2Pos) && cfg.y2Pos > 0 ? cfg.y2Pos : yPos;
    const s2 = y2Pos / yPos;                       // 값 배율(왼쪽 1칸 = 오른쪽 gsy*s2)
    plane.y2 = {
      enabled: true,
      labelY2: cfg.labelY2 || "",
      y2Min: plane.yMin * s2, y2Max: plane.yMax * s2,
      gridStepY2: gsy * s2, tickStepY2: gsy * s2,
      tickTextY2: parseTicks(cfg.y2TickText),
      showTickY2: !!cfg.y2ShowTick,
      y2Pos,                                       // 재편집 복원용(원본 입력값)
    };
  } else if (plane.y2) {
    delete plane.y2;
  }
  plane.showAxisLines = true;
  plane.showAxisLabels = true;
  plane.showAxisLabelX = cfg.showX;
  plane.showAxisLabelY = cfg.showY;
  plane.labelX = cfg.labelX;
  plane.labelY = cfg.labelY;
  plane.showOrigin = cfg.showOrigin;
  plane.labelOrigin = cfg.origin;
  plane.labelType = "quantity";
  plane.lockAspect = false;
  plane.strokeWidth = 0.3;        // 축선을 격자보다 뚜렷하게(격자=이 값의 0.5배)
  // 글씨 크기: 축 이름 / 눈금·성분 분리(요구). 구파일 호환용 labelScale도 남긴다.
  plane.axisLabelScale = Number.isFinite(cfg.axisLabelScale) ? cfg.axisLabelScale : 1;
  plane.tickLabelScale = Number.isFinite(cfg.tickLabelScale) ? cfg.tickLabelScale : 1;
  plane.labelScale = plane.tickLabelScale;
  plane.seriesLock = !!cfg.lockPosition;  // 좌표·함수 묶기 의도(재편집 복원용)
  // 축 라벨 이동: 오프셋을 평면에 저장 → coordplane가 축 이름을 그만큼 옮겨 그린다.
  plane.labelXOffset = cfg.labelXOffset && Number.isFinite(cfg.labelXOffset.dx) ? { dx: cfg.labelXOffset.dx, dy: cfg.labelXOffset.dy } : { dx: 0, dy: 0 };
  plane.labelYOffset = cfg.labelYOffset && Number.isFinite(cfg.labelYOffset.dx) ? { dx: cfg.labelYOffset.dx, dy: cfg.labelYOffset.dy } : { dx: 0, dy: 0 };
  // 옮긴 축 이름의 박스 기준 절대 분율(요구 2). 없으면 null(축 앵커 사용).
  plane.labelXPos = cfg.labelXPos && Number.isFinite(cfg.labelXPos.fx) ? { fx: cfg.labelXPos.fx, fy: cfg.labelXPos.fy } : null;
  plane.labelYPos = cfg.labelYPos && Number.isFinite(cfg.labelYPos.fx) ? { fx: cfg.labelYPos.fx, fy: cfg.labelYPos.fy } : null;
  // 눈금 숫자 이동(요구 ②): 숫자별 {dx,dy} 오프셋 배열을 평면에 복사.
  const copyOffs = (arr) => Array.isArray(arr) ? arr.map((o) => (o && (Number.isFinite(o.dx) || Number.isFinite(o.dy))) ? { dx: o.dx || 0, dy: o.dy || 0 } : { dx: 0, dy: 0 }) : [];
  plane.tickOffX = copyOffs(cfg.tickOffX);
  plane.tickOffY = copyOffs(cfg.tickOffY);
  // '표시' 레이어(요구 ③): math 좌표 그대로 평면에 복사(렌더러가 P로 world 변환).
  const arr = (a) => Array.isArray(a) ? JSON.parse(JSON.stringify(a)) : [];
  plane.annMarkers = arr(cfg.annMarkers);
  plane.annGuides = arr(cfg.annGuides);
  plane.annArrows = arr(cfg.annArrows);
  plane.guideLines = arr(cfg.guideLines);
  plane.legends = arr(cfg.legends);
  plane.annLabelPoints = arr(cfg.annLabelPoints);
  plane.graphAnnotations = arr(cfg.graphAnnotations);
  if(Number.isFinite(cfg.originLabelSize))plane.originLabelSize=cfg.originLabelSize;
  plane.graphCfg = { xNeg, xPos, yNeg, yPos, tickStepX: plane.tickStepX, tickStepY: plane.tickStepY };   // 재편집 시 범위·간격 복원용 스펙
  return plane;
}

function applyCfg(plane, cfg) {
  const result = applyEngineCfg(applyLegacyCfg(plane, cfg), cfg);
  result.axisVariant = cfg.variant;
  if(cfg.engineBounds && !cfg.exactBounds) {
    for(const k of ['gridCountX','gridCountY','gridCountXPos','gridCountXNeg','gridCountYPos','gridCountYNeg'])delete result[k];
    result.gridToData=true;
    applyDirectTicks(result,cfg);
    if(result.y2&&cfg.y2On){result.y2.labelY2=cfg.labelY2;result.y2.showTickY2=cfg.y2ShowTick;const labels=parseCsvLine(cfg.y2TickText);result.y2.explicitTicks=(result.y2.explicitTicks?.length?result.y2.explicitTicks:generatedTicks(planeAsY2(result),'y','number')).map((tick,i)=>({...tick,label:cfg.y2TickText.trim()?(labels[i]??''):String(tick.value)}));}
  }
  if (directBounds(cfg)) {
    const base=cfg.exactInitial || cfg.boundsInitial || {};
    for (const key of ['padXPos','padXNeg','padYPos','padYNeg']) if (cfg[key] !== base[key]) result[key]=cfg[key];
    const gridKeys=['gridOverXPos','gridOverXNeg','gridOverYPos','gridOverYNeg'];
    if (gridKeys.some(key=>cfg[key] !== base[key])) {
      for (const key of gridKeys) result[key]=cfg[key];
      const x=axisTickBounds(result,'x'),y=axisTickBounds(result,'y');
      result.gridBounds={xMin:x.min,xMax:x.max,yMin:y.min,yMax:y.max};
      result.gridToData=true;
    }
    const ends=['padXPos','padXNeg','padYPos','padYNeg',...gridKeys];
    if (cfg.inferredSteps && JSON.stringify(cfg.exactBounds)===JSON.stringify(base.exactBounds) && ends.every(key=>cfg[key]===base[key]) && cfg.showGrid===base.showGrid) {
      for (const [upper, original] of Object.entries(cfg.inferredSteps)) {
        result[`gridStep${upper}`]=original.originalGrid;result[`tickStep${upper}`]=original.originalTick;
      }
    }
  }
  if (cfg.graphStyle) result.graphStyle=structuredClone(cfg.graphStyle); else delete result.graphStyle;
  if (Number.isFinite(cfg.outputWidth) && cfg.outputWidth>0 && cfg.outputWidth!==result.w) {
    const ratio=cfg.outputWidth/result.w,cx=result.x+result.w/2,cy=result.y+result.h/2;
    result.w=cfg.outputWidth;result.h*=ratio;result.x=cx-result.w/2;result.y=cy-result.h/2;
  }
  return result;
}

/* 계열이 '읽는 축'에 맞는 평면 뷰를 돌려준다(좌우 이중 y축).
 * axis:"y2"인 계열만 y2 스케일(planeAsY2 — yMin/yMax·gridStepY만 갈아끼운 얕은 복사)로 굽고,
 * 그 외(=기존 파일 전부, axis 없음 포함)는 평면 그 자체를 그대로 돌려준다. 덕분에 샘플러·
 * 베이크·스냅 등 매핑을 쓰는 코드가 y2를 몰라도 되고, 기존 동작이 한 줄도 안 바뀐다. */
function planeForSeries(s, plane) {
  return (s && s.axis === "y2" && plane && plane.y2 && plane.y2.enabled) ? planeAsY2(plane) : plane;
}

// 라벨 크기를 셀(칸) 크기에 비례해 크게(기본값 상향 — 사진처럼, 종전보다 +30%). 박스 정해진 뒤 호출.
function cellOf(plane) { const d = (plane.xMax - plane.xMin) || 1; return plane.w / d; }
const LABEL_TRIM = 0.35;   // 라벨을 약 1pt(≈0.35mm) 작게(요구)
function setLabelSizes(plane) {
  if(isExamStyle(plane)){const m=examMetrics(plane);plane.axisLabelSize=plane.tickLabelSize=plane.originLabelSize=m.label;return;}
  const cell = cellOf(plane);
  // 축 이름 / 눈금·성분 배율 분리(요구). 구파일은 labelScale로 폴백.
  const aS = Number.isFinite(plane.axisLabelScale) ? plane.axisLabelScale : (plane.labelScale || 1);
  const tS = Number.isFinite(plane.tickLabelScale) ? plane.tickLabelScale : (plane.labelScale || 1);
  plane.axisLabelSize = Math.max(1, Math.round((cell * 0.8 * aS - LABEL_TRIM) * 10) / 10);   // 축 이름
  plane.tickLabelSize = Math.max(1, Math.round((cell * 0.68 * tS - LABEL_TRIM) * 10) / 10);  // 눈금 숫자/문자
}

// 끝 라벨 크기 = 눈금·성분 라벨과 동일(요구: 라벨 1pt 축소 반영). 셀 기준으로 직접 계산해
// buildFrame(setLabelSizes) 전/후 어디서 불러도 일관.
function endLabelSizeOf(plane) {
  if(isExamStyle(plane))return examMetrics(plane).label;
  if (plane.reconstruction?.preserveAxes && Number.isFinite(plane.tickLabelSize)) return plane.tickLabelSize;
  const tS = Number.isFinite(plane.tickLabelScale) ? plane.tickLabelScale : (plane.labelScale || 1);
  return Math.max(1, Math.round((cellOf(plane) * 0.68 * tS - LABEL_TRIM) * 10) / 10);
}

// 자동 연장선(요구): 마지막 점에서 마지막 구간 방향으로 반 칸(0.5) 연장한 점을 덧붙인다.
// 눈대중으로 그린 꺾은선 끝을 반 칸 늘려, 그 구간에도 수선/표시점이 매칭되게 한다. 원본
// s.pts는 그대로 두고 렌더·베이크용 배열만 확장한다(재편집 시 원본 유지).
function extendedMathPts(s) {
  const pts = s.pts || [];
  if (!s.autoExtend || pts.length < 2) return pts;
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const amt = 0.5; // 한 눈금의 절반
  return [...pts, { x: b.x + (dx / len) * amt, y: b.y + (dy / len) * amt }];
}

// 자유곡선(요구 재정의): 점 계열 '곡선' 모양은 사용자가 찍은 점을 '정확히' 지나가야 한다.
// 그래서 점을 지우거나(RDP) 옮기지(라플라시안) 않는다 — 매끄러움은 렌더 단계의 centripetal
// Catmull-Rom(coordplane.js)이 담당한다(출렁임 없이 앵커를 그대로 통과). 여기선 점을 안 건드린다.

// 함수식 자유 이동(요구): 계열의 offset(math dx,dy)을 baked world 점들에 적용.
// math 오프셋이라 평면 위치·배율과 무관(미리보기/캔버스 일관).
function applyOffset(worldPts, plane, offset) {
  if (!offset || (!offset.dx && !offset.dy) || !worldPts) return worldPts;
  if (plane.xScale === 'log' || plane.yScale === 'log') return worldPts.map(p => {
    const q = mathFromWorld(plane,p.x,p.y); return worldFromMath(plane,q.x+(offset.dx||0),q.y+(offset.dy||0));
  });
  const ux = (plane.xMax - plane.xMin) ? plane.w / (plane.xMax - plane.xMin) : 0;
  const uy = (plane.yMax - plane.yMin) ? plane.h / (plane.yMax - plane.yMin) : 0;
  const dwx = offset.dx * ux, dwy = -offset.dy * uy;
  return worldPts.map((p) => ({ x: p.x + dwx, y: p.y + dwy }));
}

// 데이터(계열)가 놓일 수 있는 수학 범위 = 눈금 끝 + 격자 초과분(반 칸). 화살표 마진은 제외 —
// 함수/점이 화살표 아래까지 뻗지 않도록. 점 스냅 클램프·함수 기본 정의역에 공통 사용.
function dataBounds(plane) {
  if (plane.reconstruction?.preserveAxes || plane.graphEngineBounds || plane.xScale === "log" || plane.yScale === "log") return { xMin: plane.xMin, xMax: plane.xMax, yMin: plane.yMin, yMax: plane.yMax };
  const over = plane.gridOver || 0;
  // 격자 초과분(칸)을 네 끝 각각(고급). 없으면 단일 over로 폴백.
  const ovXP = Number.isFinite(plane.gridOverXPos) ? plane.gridOverXPos : over;
  const ovXN = Number.isFinite(plane.gridOverXNeg) ? plane.gridOverXNeg : over;
  const ovYP = Number.isFinite(plane.gridOverYPos) ? plane.gridOverYPos : over;
  const ovYN = Number.isFinite(plane.gridOverYNeg) ? plane.gridOverYNeg : over;
  const cxPos = Number.isFinite(plane.gridCountXPos) ? plane.gridCountXPos
    : (Number.isFinite(plane.gridCountX) ? plane.gridCountX : Math.max(1, Math.round(plane.xMax - PAD_X)));
  const cyPos = Number.isFinite(plane.gridCountYPos) ? plane.gridCountYPos
    : (Number.isFinite(plane.gridCountY) ? plane.gridCountY : Math.max(1, Math.round(plane.yMax - PAD_Y)));
  const cxNeg = Number.isFinite(plane.gridCountXNeg) ? plane.gridCountXNeg
    : (Number.isFinite(plane.gridCountX) ? plane.gridCountX : cxPos);   // 구파일=대칭 폴백
  const cyNeg = Number.isFinite(plane.gridCountYNeg) ? plane.gridCountYNeg
    : (Number.isFinite(plane.gridCountY) ? plane.gridCountY : cyPos);
  // 칸 인덱스 → 수학 값으로 환산한다. 격자 간격이 1이 아니면(예 0.5) 칸 수와 값이 달라져,
  // 그냥 칸 수를 쓰면 함수·점이 축 범위의 두 배까지 뻗는다.
  const sx = plane.gridStepX || 1, sy = plane.gridStepY || 1;
  const xMax = (cxPos + ovXP) * sx, yMax = (cyPos + ovYP) * sy;
  return {
    xMin: plane.xMin < 0 ? -(cxNeg + ovXN) * sx : 0, xMax,
    yMin: plane.yMin < 0 ? -(cyNeg + ovYN) * sy : 0, yMax,
  };
}

// 사용자가 '직접' 데이터를 놓을 수 있는 최대 범위 = 평면 박스 전체(= 화살표 여백까지).
// dataBounds(격자 끝)는 '자동'으로 정해지는 값(함수 기본 정의역)의 기준일 뿐, 손으로 그리거나
// 정의역을 직접 지정한 경우까지 격자에 가둘 이유가 없다(요구: 격자가 데이터 범위를 제한하지 않는다).
// 격자 초과분(gridOver)이 여백보다 클 수도 있으므로 둘 중 넓은 쪽을 쓴다.
function plotBounds(plane) {
  const db = dataBounds(plane);
  const px = Number.isFinite(plane.xMin) ? plane.xMin : db.xMin;
  const pX = Number.isFinite(plane.xMax) ? plane.xMax : db.xMax;
  const py = Number.isFinite(plane.yMin) ? plane.yMin : db.yMin;
  const pY = Number.isFinite(plane.yMax) ? plane.yMax : db.yMax;
  return {
    xMin: Math.min(db.xMin, px), xMax: Math.max(db.xMax, pX),
    yMin: Math.min(db.yMin, py), yMax: Math.max(db.yMax, pY),
  };
}

/* ---------- 그래프 요소(표시점 ● / 수선의 발 / 화살표) ---------- */
const ARROW_SW = 0.525;   // 화살표(화살촉) 두께 — 화살촉 크기가 여기 비례(요구: +50%, 0.35→0.525).
// 배치할 때 커서와 곡선의 거리는 제한하지 않는다(요구). 좌표 라벨·눈금에 가려 곡선을
// 정확히 짚기 어려운 자리가 많은데, 거리를 제한하면 그런 곳에서 아무리 눌러도 안 찍힌다.
// 어차피 찍히는 위치는 "곡선 위 최근접점"이라 멀리서 눌러도 결과가 곡선을 벗어나지 않는다.
// 모드 해제는 미리보기 바깥을 누르는 것으로 한다(아래 setupPlaceEscape).
// 요소 베이크·클릭 스냅용 기하: 곡선 스타일 점 계열은 렌더와 동일한 Catmull-Rom으로
// 촘촘히 편 점을 쓴다. 꼭짓점을 직선 보간하면 화살표/표시점/수선이 실제 그려진 곡선에서
// 떨어진 지점에 찍힌다(화살표 위치 버그의 원인). 함수식 계열은 이미 촘촘히 샘플됨.
function geomPts(s, pts) {
  const cs = s.curveStyle || (s.kind === "expr" ? "smooth" : "straight");
  return (s.kind === "points" && cs === "smooth") ? smoothSamplePts(pts, s.curvature) : pts;
}
// ----- 베지어 핸들(자유곡선 정밀 편집) -----
// 계열이 편집 가능한 핸들을 가졌는가(자유곡선 + handles가 pts와 평행).
function useHandles(s) {
  return s && s.kind === "points" && s.curveStyle === "smooth"
    && Array.isArray(s.handles) && s.handles.length === s.pts.length && s.pts.length >= 2;
}
// s.handles(앵커 기준 math 오프셋) → 절대 world 제어점 {inX,inY,outX,outY}[] (렌더/샘플용).
function worldHandlesOf(s, plane) {
  if (s.handlesMode === 'shape-preserving' && s.kind === 'points') s.handles = shapePreservingHandles(s.pts, s.segmentModes, s.breaks);
  if (!useHandles(s)) return null;
  return s.pts.map((p, i) => {
    const h = s.handles[i] || { ix: 0, iy: 0, ox: 0, oy: 0 };
    const inW = worldFromMath(plane, p.x + h.ix, p.y + h.iy);
    const outW = worldFromMath(plane, p.x + h.ox, p.y + h.oy);
    return { inX: inW.x, inY: inW.y, outX: outW.x, outY: outW.y };
  });
}
// 앵커를 추가/삭제해 pts 길이가 바뀌면 핸들을 현재 접선으로 다시 계산(구조 변경 시에만 호출).
// 앵커 '이동'에는 부르지 않는다 — 오프셋 저장이라 앵커와 함께 따라가는 게 맞다(수동 편집 보존).
function remapPointIndices(s, index, delta) {
  // Segment indices describe point pairs. Splitting/removing a pair invalidates
  // its direction marker; independent neighbouring pairs keep their identity.
  s.arrows = (s.arrows || []).filter(a => !Number.isInteger(a.segmentIndex) || (delta > 0 ? a.segmentIndex !== index - 1 : a.segmentIndex !== index - 1 && a.segmentIndex !== index))
    .map(a => Number.isInteger(a.segmentIndex) && a.segmentIndex >= index ? {...a,segmentIndex:a.segmentIndex+delta} : a);
  if (s.segmentModes?.length) {
    if (delta > 0) s.segmentModes.splice(Math.max(0,index-1),0,s.segmentModes[Math.max(0,index-1)] || s.segmentModes.at(-1) || 'line');
    else if(index === 0) s.segmentModes.shift();
    else if(index >= s.pts.length-1) s.segmentModes.pop();
    else { const merged = s.segmentModes[index-1] === 'smooth' && s.segmentModes[index] === 'smooth' ? 'smooth' : 'line'; s.segmentModes.splice(index-1,2,merged); }
  }
  s.breaks = (s.breaks || []).map(i => i >= index ? i + delta : i).filter(i => i > 0 && i < s.pts.length + delta);
  s.endpointMarkers = (s.endpointMarkers || []).filter(e => delta > 0 || e.index !== index).map(e => ({ ...e, index: e.index >= index ? e.index + delta : e.index }));
}
function syncHandlesToStructure(s) {
  if (s && Array.isArray(s.handles)) s.handles = catmullRomHandles(s.pts, s.curvature);
}
// 계열의 baked world points[]에서 world-x에 해당하는 world-y를 선형 보간(범위 밖 null).
// breaks(끊긴 구간 시작 인덱스)가 주어지면 그 경계 구간은 건너뛴다 — 평면 밖으로 나간
// 가짜 직선 위에 표시점/수선/화살표가 스냅되지 않게.
function worldYAtX(points, wx, breaks) {
  if (!points || points.length < 2) return null;
  const brk = (breaks && breaks.length) ? new Set(breaks) : null;
  for (let i = 1; i < points.length; i++) {
    if (brk && brk.has(i)) continue;   // i부터 새 run → (i-1, i)는 실제 선이 아님
    const a = points[i - 1], b = points[i];
    const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
    if (wx >= lo - 1e-9 && wx <= hi + 1e-9) {
      const dx = b.x - a.x;
      if (Math.abs(dx) < 1e-9) return a.y;
      return a.y + ((wx - a.x) / dx) * (b.y - a.y);
    }
  }
  return null;
}
// 계열의 baked world points[] 위에서 (wx, wy)에 가장 가까운 점을 찾는다.
// worldYAtX와 달리 마우스의 y도 함께 쓰므로 세로선·원처럼 x 하나에 y가 여럿인 도형도 다룬다.
// 각 선분에 점을 수직 투영해 최단거리 점을 고르는 표준 방식. breaks 경계 구간은 건너뛴다.
// 반환: { x, y, dx, dy, dist } — dx,dy는 그 지점의 단위 접선(화살촉 방향에 쓰임).
function nearestOnPolyline(points, wx, wy, breaks) {
  if (!points || points.length < 2) return null;
  const brk = (breaks && breaks.length) ? new Set(breaks) : null;
  let best = null;
  for (let i = 1; i < points.length; i++) {
    if (brk && brk.has(i)) continue;   // i부터 새 run → (i-1, i)는 실제 선이 아님
    const a = points[i - 1], b = points[i];
    const vx = b.x - a.x, vy = b.y - a.y;
    const len2 = vx * vx + vy * vy;
    if (len2 < 1e-18) continue;        // 길이 0 선분
    // 투영 파라미터 t를 [0,1]로 잘라 선분 안쪽(또는 끝점)의 최근접점을 얻는다.
    let t = ((wx - a.x) * vx + (wy - a.y) * vy) / len2;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    const px = a.x + t * vx, py = a.y + t * vy;
    const d = Math.hypot(wx - px, wy - py);
    if (!best || d < best.dist) {
      const len = Math.sqrt(len2);
      best = { x: px, y: py, dx: vx / len, dy: vy / len, dist: d };
    }
  }
  return best;
}
// 저장된 요소 스펙 하나를 math 좌표로 정규화한다.
// 구버전 파일은 x 숫자만 저장했으므로(정의역→치역 매핑 시절), 그 경우 y는 없는 것으로 두고
// 아래 resolveSpec에서 worldYAtX로 한 번 복원한다. 신규 저장은 {x, y}.
// 고스트 크기는 렌더러와 같은 함수(markerRadius)를 쓴다 — 값을 양쪽에 적어 두면 어긋난다.
function markerRadiusOf(s) {
  return markerRadius(s && Number.isFinite(s.strokeWidth) ? s.strokeWidth : 0.4);
}
// 요소 스펙 한 개를 얕게 복사한다(구버전 숫자 스펙과 신형 {x,y}를 모두 받는다).
function copySpec(v) { return typeof v === "number" ? v : { ...v }; }
function specMath(v) {
  if (typeof v === "number") return Number.isFinite(v) ? { x: v, y: null } : null;
  if (!v || !Number.isFinite(v.x)) return null;
  return { x: v.x, y: Number.isFinite(v.y) ? v.y : null };
}
// math 스펙 → 실제 곡선 위의 world 점. y가 있으면 최근접점으로, 없으면(구버전) x 매핑으로 복원.
// 평면 크기나 함수식이 바뀌어 곡선이 다시 샘플돼도 저장된 좌표에서 가장 가까운 곳으로 다시 붙는다.
function resolveSpec(spec, plane, pts, breaks) {
  const m = specMath(spec);
  if (!m) return null;
  const w = worldFromMath(plane, m.x, m.y == null ? 0 : m.y);
  if (m.y == null) {
    const wy = worldYAtX(pts, w.x, breaks);
    return wy == null ? null : nearestOnPolyline(pts, w.x, wy, breaks);
  }
  return nearestOnPolyline(pts, w.x, w.y, breaks);
}
/* 미리보기 전용: 찍어 둔 표시점이 눈에 띄게 한다(의견 7).
 * 표시점은 검은 원 하나라서 축·격자(검은 선) 위나 모서리에 찍히면 그림에 묻혀
 * 찍힌 건지 아닌지 분간이 안 된다. 그래서 두 가지를 얹는다.
 *   · 흰 테두리 — 검은 배경선 위에서도 점의 윤곽이 산다
 *   · 강조색 링 — "여기 찍혔다"는 표시
 * 최종 결과물(캔버스·내보내기)에는 손대지 않는다. 시험지에 파란 링이 나가면 안 되고,
 * 이건 그림의 일부가 아니라 편집 중에만 필요한 안내이기 때문이다.
 * renderFuncgraph가 만든 DOM에만 덧그리므로 저장되는 데이터도 그대로다. */
function markPlacedElements(groupEl) {
  if (!groupEl || !groupEl.querySelectorAll) return;
  groupEl.querySelectorAll("circle").forEach((c) => {
    const r = parseFloat(c.getAttribute("r")) || 0;
    if (!r) return;
    c.setAttribute("stroke", "#ffffff");
    c.setAttribute("stroke-width", String(r * 0.42));
    c.setAttribute("paint-order", "stroke");   // 흰 테두리가 채움 밖으로 나가게
    const ring = document.createElementNS(SVG_NS, "circle");
    ring.setAttribute("cx", c.getAttribute("cx"));
    ring.setAttribute("cy", c.getAttribute("cy"));
    ring.setAttribute("r", String(r * 2.05));
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "var(--accent)");
    ring.setAttribute("stroke-width", String(r * 0.5));
    ring.setAttribute("pointer-events", "none");
    c.parentNode.insertBefore(ring, c);
  });
}
/* 라벨러 표시점(표시 탭): '지금 PageUp/Down이 돌릴 점'을 미리보기에서 눈으로 알 수 있게 한다.
 * 선택된 점에만 강조 링을 얹고, 배치 모드가 꺼져 있을 때는 점을 눌러 선택을 옮길 수 있다
 * (배치 모드 중엔 클릭이 '새 점 찍기'여야 하므로 건드리지 않는다).
 * markPlacedElements와 같은 원칙: 미리보기 DOM에만 덧그리고 저장 데이터는 그대로 둔다. */
function markSelLabelPt(svg) {
  if (!svg) return;
  svg.querySelectorAll("[data-labelpt]").forEach((c) => {
    const i = parseInt(c.getAttribute("data-labelpt"), 10);
    if (!Number.isFinite(i)) return;
    if (!_annMode) {
      c.style.cursor = "pointer";
      c.setAttribute("pointer-events", "all");
      c.addEventListener("click", (e) => {
        e.stopPropagation();                     // 빈 화면 클릭(선택 해제)로 새어나가지 않게
        if (_lpSel === i) return;
        selectDisplay('labelpt',(_cfg.annLabelPoints || [])[i]);
      });
    }
    if (i !== _lpSel) return;
    const r = parseFloat(c.getAttribute("r")) || 0.6;
    const ring = document.createElementNS(SVG_NS, "circle");
    ring.setAttribute("cx", c.getAttribute("cx"));
    ring.setAttribute("cy", c.getAttribute("cy"));
    ring.setAttribute("r", String(r * 2.05));
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "var(--accent)");
    ring.setAttribute("stroke-width", String(r * 0.5));
    ring.setAttribute("pointer-events", "none");
    c.parentNode.insertBefore(ring, c);
  });
}

// 계열의 요소 math 스펙(markers/guides/arrows) → 세계좌표 렌더 데이터(renderFuncgraph가 그림).
function bakeElements(s, plane, pts, breaks) {
  const markers = [], guideSegs = [], arrowMarks = [];
  const o0 = originWorld(plane);
  if(plane.axisPlacement?.x?.mode==='fraction')o0.y=plane.y+plane.h*(1-plane.axisPlacement.x.value);
  if(plane.axisPlacement?.y?.mode==='fraction')o0.x=plane.x+plane.w*plane.axisPlacement.y.value;
  (s.markers || []).forEach((spec) => {
    const p = resolveSpec(spec, plane, pts, breaks);
    if (p) markers.push({ x: p.x, y: p.y });
  });
  (s.guides || []).forEach((spec) => {
    const p = resolveSpec(spec, plane, pts, breaks);
    if (!p) return;
    const wx = p.x, wy = p.y;
    if (Math.abs(wy - o0.y) > 1e-6) guideSegs.push([{ x: wx, y: wy }, { x: wx, y: o0.y }]); // → x축(수직)
    if (Math.abs(wx - o0.x) > 1e-6) guideSegs.push([{ x: wx, y: wy }, { x: o0.x, y: wy }]); // → y축(수평)
  });
  // 화살표: 찍은 그 지점에 '화살촉 하나만' 곡선의 접선 방향으로 놓는다.
  // 종전엔 화살촉만이 아니라 꼬리에서 클릭점까지 곡선을 따라가는 선을 통째로 새로 그렸다.
  // 그런데 꼬리를 계열 전체의 x-범위로 clamp해서, 클릭점이 시작부에서 ARROW_SPAN 안쪽이면
  // 꼬리가 곡선 첫 점으로 붙어버렸다 → "곡선 처음부터 클릭점까지 굵은 선이 덧그려지는" 증상.
  // 곡선 자체는 이미 그려져 있으므로 그 위에 화살촉만 얹으면 방향 표시로 충분하다(평가원 양식).
  (s.arrows || []).forEach((a) => {
    let p;
    if (Number.isInteger(a.segmentIndex) && s.pts?.[a.segmentIndex + 1]) {
      const anchors=s.pts.map(q=>worldFromMath(plane,q.x,q.y)),wh=worldHandlesOf(s,plane);
      const offsets=wh?.map((h,i)=>({ix:h.inX-anchors[i].x,iy:h.inY-anchors[i].y,ox:h.outX-anchors[i].x,oy:h.outY-anchors[i].y}));
      const m = sampleShapeSegment(anchors, offsets, a.segmentIndex, a.t ?? .5, s.segmentModes || []);
      if (m) { const len = Math.hypot(m.dx,m.dy) || 1;p = {x:m.x,y:m.y,dx:m.dx/len,dy:m.dy/len}; }
    } else p = resolveSpec(a, plane, pts, breaks);
    if (!p) return;
    const dir = a.dir < 0 ? -1 : 1;   // 방향 반전은 화살촉을 제자리에 둔 채 향만 뒤집는다
    arrowMarks.push({ x: p.x, y: p.y, dx: p.dx * dir, dy: p.dy * dir, strokeWidth: a.strokeWidth ?? ARROW_SW });
  });
  return { markers, guideSegs, arrowMarks };
}
// 커밋용: 세계좌표 렌더 데이터 + 원본 math 스펙(재편집 시 모달이 되읽음).
// markerXs/guideXs는 이름은 옛 그대로지만(저장 호환) 값은 이제 {x, y}다.
// 예전 파일의 숫자 값도 그대로 읽힌다 — specMath가 둘 다 받는다.
function elementFields(s, plane, pts, breaks) {
  const copy = (v) => (typeof v === "number" ? v : { ...v });
  return {
    ...bakeElements(s, plane, pts, breaks),
    markerXs: (s.markers || []).map(copy), guideXs: (s.guides || []).map(copy),
    arrowSpecs: (s.arrows || []).map((a) => ({ ...a })),
  };
}

/* ---------- 새 틀 생성(칸 수 → 박스 크기·위치까지) ---------- */
function buildFrame(cfg, at, artboard) {
  const plane = applyCfg(makeDefaultCoordplane(at), cfg);
  const A = artboard && artboard.w ? artboard : { w: 90, h: 60 };
  const totalX = plane.xMax - plane.xMin, totalY = plane.yMax - plane.yMin;
  const cell = Math.min((A.w * 0.72) / totalX, (A.h * 0.72) / totalY, 9); // 정사각 셀, 최대 9mm/칸
  const width=cfg.outputWidth || totalX*cell;
  plane.w = width; plane.h = totalY/totalX*width;
  plane.x = at.x - plane.w / 2; plane.y = at.y - plane.h / 2;
  setLabelSizes(plane);
  return plane;
}

/* 곡선 아래 면적 채움 — 계열의 area 스펙을 funcgraph 필드로 옮긴다.
 * from·to는 정의역 값 그대로 두고(재편집·재샘플에 살아남는다), 기준선 y=0 위치만
 * 세계좌표(mm)로 구워 넘긴다 — 렌더러가 평면을 몰라도 되게. */
function areaFields(s, plane) {
  if (!s || !s.area || !s.area.on) return {};
  const a = s.area;
  const dx = s.offset && Number.isFinite(s.offset.dx) ? s.offset.dx : 0;
  return {
    area: {
      from: Number.isFinite(a.from) ? a.from : undefined,
      to: Number.isFinite(a.to) ? a.to : undefined,
      worldFrom: Number.isFinite(a.from) ? worldFromMath(plane, a.from + dx, 0).x : undefined,
      worldTo: Number.isFinite(a.to) ? worldFromMath(plane, a.to + dx, 0).x : undefined,
      baseY: worldFromMath(plane, 0, 0).y,
      level: Number.isFinite(a.level) ? a.level : 220,
      edges: a.edges === false ? false : undefined,
      label: a.label || undefined,
    },
  };
}

/* 막대그래프 굽기 — 계열의 items(값·이름표)를 세계좌표(mm) 사각형으로 바꾼다.
 * 배치 규약: 데이터 x 범위를 막대 개수만큼 균등 분할한 '슬롯'을 만들고, 각 슬롯 한가운데에
 * 폭 = 슬롯 × widthRatio 인 막대를 세운다(막대:간격 ≈ 1:1). 값은 y 수학값 그대로 = 높이.
 * 반환 { bars, points }:
 *   bars.items = [{x,y,w,h,label}] — 사각형(요구한 world mm 규격, 회전 전 기준)
 *   points     = 막대마다 네 꼭짓점(bl,tl,tr,br) — funcgraph 공용 좌표 배열.
 *                이동·회전·리사이즈(transform.js)와 bbox·클릭(pick.js)이 이 배열만 보므로,
 *                여기에 같은 좌표를 실어야 캔버스에서 막대가 평면과 함께 움직인다.
 *                렌더러는 points가 맞으면 그쪽을 진실로 삼는다(변환 결과 반영). */
function bakeBars(s, plane) {
  const items = (s.items || []).filter((it) => it && Number.isFinite(it.value));
  if (!items.length) return null;
  const db = dataBounds(plane);
  const xLo = plane.reconstruction?.preserveAxes ? db.xMin : Math.max(0, db.xMin), xHi = db.xMax;
  const slot = (xHi - xLo) / items.length;
  if (!(slot > 0)) return null;
  const wr = Number.isFinite(s.widthRatio) ? (plane.reconstruction?.preserveAxes ? s.widthRatio : Math.max(0.1, Math.min(0.95, s.widthRatio))) : 0.55;
  // 높이 맞춤: 기출 막대그래프는 y축에 눈금이 없어(원점 0만) 값이 '상대 크기'로만 읽힌다.
  // 60·100·45처럼 축 범위(0~5칸)를 훌쩍 넘는 값을 그대로 쓰면 막대가 판을 뚫고 나가므로,
  // 가장 큰 값이 데이터 범위 끝을 넘을 때만 전체를 같은 비율로 줄여 판 안에 넣는다.
  // 값이 이미 범위 안이면 손대지 않는다 — 눈금을 켜고 쓰는 경우 값=좌표가 유지된다.
  const vMax = Math.max(...items.map((it) => Math.abs(it.value)));
  const fit = plane.reconstruction?.preserveAxes ? 1 : (vMax > 0 && vMax > db.yMax) ? db.yMax / vMax : 1;
  const base = worldFromMath(plane, plane.xMin, s.barBase ?? (plane.yScale === "log" ? plane.yMin : 0));
  const rects = [], points = [];
  items.forEach((it, i) => {
    const cx = it.x ?? (xLo + slot * (i + 0.5));
    const v = it.value * fit;
    const wa = worldFromMath(plane, cx - (slot * wr) / 2, v);
    const wb = worldFromMath(plane, cx + (slot * wr) / 2, v);
    const x0 = Math.min(wa.x, wb.x), x1 = Math.max(wa.x, wb.x);
    const baseY=it.base!==undefined?worldFromMath(plane,cx,it.base).y:base.y;
    const top = Math.min(wa.y, baseY), bot = Math.max(wa.y, baseY);
    rects.push({ x: x0, y: top, w: x1 - x0, h: bot - top, label: it.label || "", ...(it.fillLevel!==undefined?{fillLevel:it.fillLevel}:{}) });
    points.push({ x: x0, y: bot }, { x: x0, y: top }, { x: x1, y: top }, { x: x1, y: bot });
  });
  return {
    points,
    bars: {
      items: rects,
      labelSize: endLabelSizeOf(plane),
      strokeWidth: Number.isFinite(s.strokeWidth) ? s.strokeWidth : 0.3,
      ...barFillFields(s.fillStyle),
    },
  };
}

/* ---------- 계열 → funcgraph 필드 준비 (plane 기준 샘플/베이크) ---------- */
// 반환 { ok:true, list:[fgFields] } | { ok:false, error }. 빈 계열은 조용히 건너뜀(빈 틀 허용).
function prepareSeries(plane) {
  const error=validateEnginePlane(plane); if(error) return {ok:false,error};
  const list = [];
  const endSize = endLabelSizeOf(plane); // 끝 라벨(눈금 라벨과 동일 크기)
  for (const s of _series) {
    if(!s.objectId && !s.reconstruction)s.seriesId ||= `series-${_series.indexOf(s)+1}`;
    // 이 계열이 읽는 축(왼쪽 y / 오른쪽 y2)에 맞는 평면 뷰. axis가 없으면 plane 그대로다.
    const pl = planeForSeries(s, plane);
    const db = dataBounds(pl);
    const [dl, dg] = s.customDash || (LINE_STYLES[s.styleIdx] || LINE_STYLES[0]).slice(1);
    const common = {
      ...seriesFeatureFields(s), ...(isExamStyle(plane)?{graphStyle:structuredClone(plane.graphStyle),graphStyleWidth:plane.graphStyle.referenceWidth,customStyle:s.customStyle,customStyleWidth:s.customStyleWidth}:{}), seriesId:s.seriesId, id: s.objectId, type: "funcgraph", closed: !!s.closed, handlesMode: s.handlesMode, segmentModes: structuredClone(s.segmentModes || []), strokeLevel: 0,
      reconstruction: s.reconstruction ? structuredClone(s.reconstruction) : undefined,
      endpointMarkers: structuredClone(s.endpointMarkers || []),
      strokeWidth: Number.isFinite(s.strokeWidth) ? s.strokeWidth : 0.45,
      dashLength: dl, dashGap: dg,
      labelWeight: _cfg.exactInitial && _cfg.labelWeight === _cfg.exactInitial.labelWeight ? (s.labelWeight ?? plane.labelWeight) : plane.labelWeight,
      haloRatio: s.haloRatio,
      endLabel: s.endLabel || "", endLabelSize: s.endLabelSize ?? endSize, label: "", labelShow: false,
      curveStyle: s.curveStyle || (s.kind === "expr" ? "smooth" : "straight"),  // 선 모양(직선/곡선)
      curvature: Number.isFinite(s.curvature) ? s.curvature : 1,                // 곡률(요구)
      // 위치 고정은 개별 잠금(positionLocked)이 아니라 '평면+계열 그룹 묶기'로 처리한다
      // (요구: 좌표와 함께 움직임). 그룹 배선은 commitCreate/commitEdit에서.
      locked: false, positionLocked: false,
      axis: s.axis === "y2" ? "y2" : "y",     // 읽는 축(좌우 이중 y축) — 재편집 복원용
    };
    if (s.kind === "bar") {
      // 막대는 새 객체 타입을 만들지 않는다 — funcgraph에 bars 필드로 얹는다(요구).
      // 원본 math 스펙(barItems/barWidthRatio/barFill)도 함께 저장해야 재편집으로 되살아난다.
      const baked = bakeBars(s, pl);
      if (!baked) continue;
      list.push({
        ...common, sourceKind: "bar", curveStyle: "straight", endLabel: "",
        points: baked.points, breaks: [], bars: baked.bars, barPreserveValues: !!plane.reconstruction?.preserveAxes,
        barItems: (s.items || []).map((it) => ({ ...it, label: it.label || "", value: it.value })),
        barBase: s.barBase,
        barWidthRatio: Number.isFinite(s.widthRatio) ? s.widthRatio : 0.55,
        barFill: s.fillStyle || "gray",
      });
    } else if (s.kind === "expr") {
      const expr = String(s.expr || "").trim();
      if (!expr) continue;
      // 자동 정의역은 데이터 범위(눈금 끝+반 칸)까지 — 화살표 마진 아래로 저절로 뻗지 않게.
      // 반면 사용자가 정의역을 직접 준 경우엔 평면 박스 끝까지 허용한다(격자로 가두지 않는다).
      const pb = plotBounds(pl);
      const dMin = s.domain ? Math.max(pb.xMin, Math.min(s.domain.min, s.domain.max)) : db.xMin;
      const dMax = s.domain ? Math.min(pb.xMax, Math.max(s.domain.min, s.domain.max)) : db.xMax;
      const { points: sampled, breaks, error } = sampleFunctionPoints(expr, dMin, dMax, pl, { yRange: s.range });
      if (error) return { ok: false, error: `${expr}: ${error}` };
      if (sampled.length < 2) return { ok: false, error: `${expr}: 정의역 안에서 그릴 점이 없습니다` };
      const points = applyOffset(sampled, pl, s.offset);   // 함수식 자유 이동
      const off = s.offset && Number.isFinite(s.offset.dx) ? { dx: s.offset.dx, dy: s.offset.dy } : { dx: 0, dy: 0 };
      // breaks(끊긴 구간)를 함수그래프에 함께 저장 → 렌더러가 그 경계에서 선을 끊는다(가짜선 방지).
      // domainMin/domainMax는 항상 채워지는 '실제 그린 범위'(재샘플용) — '자동'이었는지는
      // 별도 domainAuto 플래그로 남겨야, 재편집·평면 범위 확장 시 domain을 다시 자동으로
      // 넓힐 수 있다(안 남기면 항상 '명시 정의역'으로 보여 옛 경계에 갇힌다).
      list.push({ ...common, sourceKind: "expression", expr, domainMin: dMin, domainMax: dMax, domainAuto: !s.domain,
        points, mathPoints:points.map(q=>mathFromWorld(pl,q.x,q.y)), breaks, offset: off,
        rangeMin: s.range ? Math.min(s.range.min, s.range.max) : null,
        rangeMax: s.range ? Math.max(s.range.min, s.range.max) : null,
        ...areaFields(s, pl),
        ...elementFields(s, pl, points, breaks) });
    } else {
      if (!s.pts || s.pts.length < 1) continue;
      const mathPoints = s.pts.map((p) => ({ x: p.x, y: p.y }));   // 원본(재편집용)
      const uh = useHandles(s);
      const points = (uh ? s.pts : extendedMathPts(s)).map((m) => worldFromMath(pl, m.x, m.y)); // 렌더·베이크
      const wHandles = uh ? worldHandlesOf(s, pl) : null;
      const geom = s.breaks?.length ? points : wHandles ? bezierSamplePts(points, wHandles, 16, s.segmentModes) : geomPts(s, points);
      const obj = { ...common, sourceKind: "points", mathPoints, points, breaks: [...(s.breaks || [])], autoExtend: !!s.autoExtend, ...areaFields(s, pl), ...elementFields(s, pl, geom, s.breaks) };
      // 베지어 핸들: world 제어점(렌더용) + math 오프셋(재편집용)을 함께 저장.
      if (uh) { obj.handles = wHandles; obj.handlesMath = s.handles.map((h) => ({ ...h })); }
      list.push(obj);
    }
  }
  if(_mode==='edit' && _editBaseline) {
    const current=editorState().get().objects.find(o=>o.id===_planeId);
    const keys=['x','y','w','h','xMin','xMax','yMin','yMax','xScale','yScale','y2','axisLabelSize','tickLabelSize','labelWeight','graphStyle'];
    const samePlane=current && keys.every(k=>JSON.stringify(current[k])===JSON.stringify(plane[k]));
    if(samePlane) for(let i=0;i<list.length;i++) {
      const index=_series.findIndex(s=>s.objectId===list[i].id);
      const original=editorState().get().objects.find(o=>o.id===list[i].id);
      if(index>=0 && original && JSON.stringify(_series[index])===JSON.stringify(_editBaseline.series[index]))list[i]=structuredClone(original);
    }
  }
  for(const f of list) {
    if(f.points.some(q=>!Number.isFinite(q.x)||!Number.isFinite(q.y)) || f.handles?.some(h=>Object.values(h).some(v=>!Number.isFinite(v)))) return {ok:false,error:'계열 데이터 또는 제어점이 로그축의 양수 범위를 벗어났습니다.'};
  }
  rebindGraphAnnotations(plane,list);
  const regions=[];
  for(const spec of _cfg.regions || []) {
    const geometry=buildRegionGeometry(spec,plane,list);
    if(!geometry.ok)return {ok:false,error:geometry.error};
    regions.push({id:spec.objectId,type:'funcgraph',sourceKind:'region',axis:spec.axis||'y',regionSpec:Object.fromEntries(Object.entries(structuredClone(spec)).filter(([k])=>k!=='objectId')),regionFillLevel:spec.level??220,regionOpacity:spec.opacity??1,closed:true,lineVisible:false,strokeWidth:0,mathPoints:geometry.mathPoints,points:geometry.points,breaks:[],curveStyle:'straight',locked:false,positionLocked:false});
  }
  return { ok: true, list:[...regions,...list] };
}

// Explicit two-ended axis guides keep their orientation when a contact moves.
// Only the perpendicular coordinate follows it; the drawn extent along the
// guide and the axis-side endpoint stay intact. Diagonal guides are untouched.
function moveGraphAnnotationContact(annotation, dx, dy) {
  const to=annotation.to;
  if(annotation.kind==='guide' && to && [annotation.x,annotation.y,to.x,to.y].every(Number.isFinite)) {
    const tolerance=64*Number.EPSILON*Math.max(1,Math.abs(annotation.x),Math.abs(annotation.y),Math.abs(to.x),Math.abs(to.y));
    const horizontal=Math.abs(annotation.y-to.y)<=tolerance && (Math.abs(annotation.x-to.x)>tolerance || annotation.orientation==='horizontal');
    const vertical=Math.abs(annotation.x-to.x)<=tolerance && !horizontal;
    if(horizontal)to.y+=dy;
    else if(vertical)to.x+=dx;
  }
  annotation.x+=dx;annotation.y+=dy;
}

function rebindGraphAnnotations(plane,list) {
  for(const a of plane.graphAnnotations || []) {
    // Text is placed freely. Older saved labels may still carry curve metadata,
    // but changing that curve must not move their visible position.
    if(a.kind==='text')continue;
    if(!a.seriesId)continue;
    const f=list.find(f=>f.reconstruction?.seriesId===a.seriesId||f.seriesId===a.seriesId||f.id===a.seriesId);
    const s=_series.find(s=>s.reconstruction?.seriesId===a.seriesId||s.seriesId===a.seriesId||s.objectId===a.seriesId);
    const baseline=_editBaseline?.series.find(old=>old.objectId===s?.objectId);
    // A style-only edit must not snap an observed contact to a rounded sample.
    const geometryKeys=['kind','expr','pts','offset','domain','breaks','handles','segmentModes','autoExtend'];
    if(baseline && geometryKeys.every(k=>JSON.stringify(s[k])===JSON.stringify(baseline[k])))continue;
    if(Number.isFinite(a.anchorX) && s?.kind==='expr') {
      const baseline=_editBaseline?.series.find(old=>old.objectId===s.objectId);
      if(!baseline)continue;
      const oldDx=baseline.offset?.dx||0,newDx=s.offset?.dx||0;
      const sourceX=a.anchorX-oldDx,newX=sourceX+newDx;
      if(s.domain && (sourceX<s.domain.min || sourceX>s.domain.max))continue;
      try {
        const oldY=compile(baseline.expr)(sourceX)+(baseline.offset?.dy||0),newY=compile(s.expr)(sourceX)+(s.offset?.dy||0);
        if(!Number.isFinite(oldY)||!Number.isFinite(newY))continue;
        const target=['leader','arrow'].includes(a.kind)?a.to:a;
        if(target===a)moveGraphAnnotationContact(a,newX-a.anchorX,newY-oldY);
        else if(target){target.x+=newX-a.anchorX;target.y+=newY-oldY;}
        a.anchorX=newX;
      } catch (_) {}
      continue;
    }
    if(!Number.isInteger(a.pointIndex))continue;
    const q=f?.mathPoints?.[a.pointIndex],old=s?.editStartPoints?.[a.pointIndex];if(!q||!old || q.x===old.x && q.y===old.y)continue;
    if(a.kind==='guide')moveGraphAnnotationContact(a,q.x-a.x,q.y-a.y);
    else if(a.kind==='point'){a.x=q.x;a.y=q.y;}
    else if(a.kind==='leader'||a.kind==='arrow'){a.to={x:q.x,y:q.y};}
  }
  // Restored process vertices belong to their analytic process. Adjacent native
  // straight segments follow those contacts rather than keeping stale pixels.
  for(const f of list)for(const binding of f.reconstruction?.original?.vertexBindings || []) {
    const curve=_series.find(s=>s.reconstruction?.seriesId===binding.seriesId), old=_editBaseline?.series.find(s=>s.objectId===curve?.objectId);
    const line=_series.find(s=>s.objectId===f.id);
    if(!curve || !old || curve.kind!=='expr' || !f.mathPoints?.[binding.index] || !line?.pts?.[binding.index])continue;
    if(curve.expr===old.expr && JSON.stringify(curve.offset)===JSON.stringify(old.offset))continue;
    try {
      const p={x:binding.anchorX+(curve.offset?.dx || 0),y:compile(curve.expr)(binding.anchorX)+(curve.offset?.dy || 0)};
      if(!Number.isFinite(p.y))continue;
      f.mathPoints[binding.index]={...p};f.points[binding.index]=worldFromMath(planeForSeries(line,plane),p.x,p.y);
      line.pts[binding.index]={...p};
    } catch (_) {}
  }

}

/* ---------- 커밋: 생성 / 편집 ---------- */
function commitCreate() {
  const s0 = editorState().get();
  const vb = s0.viewBox;
  const plane = buildFrame(_cfg, { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 }, s0.artboard);
  const prep = prepareSeries(plane);
  if (!prep.ok) { _els.error.textContent = prep.error; return; }
  saveTrace(plane);
  // "위치 고정" = 평면과 그 위 계열을 하나의 그룹으로 묶는다(요구 재정의). 못 움직이게
  // 잠그는 게 아니라, 평면을 끌면 계열이 함께 따라오도록 그룹 이동으로 동작한다.
  editorState().update((st) => {
    const snap = JSON.parse(JSON.stringify(st.objects));
    plane.id = nextObjectId();
    plane.order = st.objects.length;
    plane.layerId = st.activeLayerId;
    st.objects.push(plane);
    const memberIds = [plane.id];
    for (const f of prep.list) {
      f.id = nextObjectId(); f.planeId = plane.id;
      f.order = st.objects.length; f.layerId = st.activeLayerId;
      st.objects.push(f);
      memberIds.push(f.id);
    }
    if (_cfg.lockPosition && memberIds.length > 1) {
      const gid = "grp_" + plane.id;
      for (const id of memberIds) { const o = st.objects.find((x) => x.id === id); if (o) o.groupId = gid; }
      (st.groups = st.groups || []).push({ id: gid, memberIds });
    }
    st.undoStack.push(snap);
    st.redoStack = [];
    st.selectedIds = [plane.id];
    st.targetedId = null;
    st.activeTool = "V";
  });
  hide(true);
  return {pageId:s0.activePageId,planeId:plane.id};
}

function commitEdit() {
  const currentState=editorState().get(), members=currentState.objects.filter(o=>o.id===_planeId||(o.type==='funcgraph'&&o.planeId===_planeId));
  const grouped=members.length<2||currentState.groups?.some(g=>members.every(o=>o.groupId===g.id&&g.memberIds.includes(o.id)));
  if(grouped && !_traceTouched && _editBaseline && JSON.stringify(_cfg)===JSON.stringify(_editBaseline.cfg) && JSON.stringify(_series)===JSON.stringify(_editBaseline.series)){
    const result={pageId:currentState.activePageId,planeId:_planeId};
    hide(true);return result;
  }
  const cur = editorState().get().objects.find((o) => o.id === _planeId && o.type === "coordplane");
  if (!cur) { hide(); return; }
  // 검증은 먼저(실패 시 상태 무변경): 박스 보존 + 새 범위를 적용한 초안으로 샘플.
  const draft = applyCfg(JSON.parse(JSON.stringify(cur)), _cfg);
  const prep = prepareSeries(draft);
  if (!prep.ok) { _els.error.textContent = prep.error; return; }
  editorState().update((st) => {
    const o = st.objects.find((x) => x.id === _planeId && x.type === "coordplane");
    if (!o) return;
    const snap = JSON.parse(JSON.stringify(st.objects));
    applyCfg(o, _cfg);
    o.seriesLock=true;
    saveTrace(o);
    o.graphAnnotations=structuredClone(draft.graphAnnotations||[]);                       // 박스(x/y/w/h)는 그대로, 범위·표시만 갱신
    if (!_cfg.exactBounds) setLabelSizes(o);                        // 라벨 크기도 셀 기준으로 갱신
    const oldSeries = new Map(st.objects.filter(x => x.type === 'funcgraph' && x.planeId === o.id).map(x => [x.id,x]));
    const oldGid = o.groupId, autoGid = 'grp_' + o.id;
    const replacements = new Map(), added = [];
    for (const f of prep.list) {
      const previous = oldSeries.get(f.id);
      if (previous) {
        // A plane/style edit must not discard source fields the series editor
        // does not consume (for example saved domains on a points series).
        const series=_series.find(s=>s.objectId===previous.id);
        const baseline=_editBaseline?.series.find(s=>s.objectId===previous.id);
        if(series && baseline && JSON.stringify(series)===JSON.stringify(baseline)) {
          for(const [key,value] of Object.entries(previous)) if(!(key in f)) f[key]=structuredClone(value);
        }
        for (const key of ['arrowMarks','guideSegs','guideXs','markerXs','markers']) {
          if (!(key in previous) && Array.isArray(f[key]) && f[key].length===0) delete f[key];
        }
      }
      f.id = previous?.id || nextObjectId(); f.planeId = o.id;
      f.layerId = previous?.layerId ?? o.layerId ?? st.activeLayerId;
      if (previous) { f.order = previous.order; if(previous.groupId) f.groupId = previous.groupId; replacements.set(f.id,f); }
      else { if(oldGid && (_cfg.lockPosition || oldGid !== autoGid)) f.groupId=oldGid; added.push(f); }
    }
    // Replace in place: editing must not move a graph above unrelated objects.
    st.objects = st.objects.flatMap(x => oldSeries.has(x.id) ? (replacements.has(x.id) ? [replacements.get(x.id)] : []) : [x]);
    if (added.length) {
      let index = st.objects.indexOf(o);
      const regions=added.filter(f=>f.sourceKind==='region'),normal=added.filter(f=>f.sourceKind!=='region');
      const first=Math.min(index,...st.objects.map((x,i)=>x.planeId===o.id?i:index));
      if(regions.length)st.objects.splice(first,0,...regions);
      index=st.objects.indexOf(o);
      if(!o.reconstruction?.preserveAxes) index = Math.max(index,...st.objects.map((x,i)=>x.planeId===o.id?i:-1))+1;
      st.objects.splice(index,0,...normal);
    }
    if (added.length || replacements.size !== oldSeries.size) st.objects.forEach((x,i)=>{x.order=i;});
    const memberIds = [o.id,...prep.list.map(f=>f.id)], existingIds = new Set(st.objects.map(x=>x.id));
    const targetGid=oldGid||autoGid;
    if(memberIds.length>1){for(const id of memberIds)st.objects.find(x=>x.id===id).groupId=targetGid;}
    // Preserve unrelated manual-group members while connecting every curve to its plane.
    st.groups = (st.groups || []).map(g=>({...g,memberIds:g.memberIds.filter(id=>existingIds.has(id)&&st.objects.find(x=>x.id===id)?.groupId===g.id)})).filter(g=>g.memberIds.length);
    if(memberIds.length>1){
      const group=st.groups.find(g=>g.id===targetGid);
      if(group)group.memberIds=[...new Set([...group.memberIds,...memberIds])];
      else st.groups.push({id:targetGid,memberIds});
    }
    st.undoStack.push(snap);
    st.redoStack = [];
    st.selectedIds = [o.id];
    st.targetedId = null;
  });
  hide(true);
  return {pageId:currentState.activePageId,planeId:cur.id};
}

/* ---------- 미리보기 ---------- */
function seriesColorSel(el) { el.querySelectorAll("path:not([data-preview-hit]),polyline:not([data-preview-hit])").forEach((p) => { p.style.stroke = "var(--accent)"; }); }

function bindSeriesSelection(el, series, index) {
  el.setAttribute('data-preview-series', String(index));
  el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${seriesName(series)} 선택`);
  el.setAttribute('aria-pressed', String(index === _sel && _tab === 'func'));
  const select = e => {
    if (_annMode || _placeMode || _boxMode || _areaMode || _activeDraw !== -1) return;
    e.stopPropagation();
    if (index !== _sel || _tab !== 'func') selectSeries(index);
  };
  el.addEventListener('click', select); el.addEventListener('mousedown', select);
  el.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); select(e);
    _els.preview.querySelector(`[data-preview-series="${index}"]`)?.focus({preventScroll:true});
  });
  for (const path of [...el.querySelectorAll('path,polyline')]) {
    const hit = path.cloneNode(false); hit.removeAttribute('id'); hit.setAttribute('data-preview-hit', '');
    hit.style.stroke = 'transparent'; hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', '12'); hit.setAttribute('vector-effect', 'non-scaling-stroke');
    hit.setAttribute('fill', 'none'); hit.setAttribute('pointer-events', 'stroke');
    path.before(hit);
  }
}

// 점 계열 그리기 완료: 선택 해제(러버밴드 종료). Enter/우클릭에서 호출.
function finishPointsSeries() {
  const s = _series[_sel];
  if (!s || s.kind !== "points") return;
  _sel = -1; _activeDraw = -1;
  syncSeriesEditor(); renderChips(); refreshPreview();
}

function refreshPreview() {
  if (!_els) return;
  // 편집 모드에선 실제 평면의 박스(w/h)를 그대로 쓴다 — commitEdit가 "박스는 그대로,
  // 범위·표시만 갱신" 정책이므로, 미리보기도 같은 박스로 그려야 '적용 결과 = 미리보기'가
  // 성립한다. 종전엔 buildFrame(정사각 셀 강제)으로 새 틀을 만들어 보여줘서, 축별 칸
  // 크기가 다른 평면(가로로 늘린 시간축 등)을 열면 미리보기 비율이 캔버스와 달랐다.
  // 새로 만들기 모드는 종전대로 buildFrame(정사각 셀)을 쓴다.
  let plane = null;
  if (_planeId) {
    const cur = editorState().get().objects.find((o) => o.id === _planeId && o.type === "coordplane");
    if (cur) {
      plane = applyCfg(JSON.parse(JSON.stringify(cur)), _cfg);
      plane.x = -plane.w / 2; plane.y = -plane.h / 2;   // 미리보기 viewBox 중앙 정렬용
      if (!_cfg.exactBounds) setLabelSizes(plane);                              // commitEdit와 같은 라벨 크기 산출
    }
  }
  if (!plane) plane = buildFrame(_cfg, { x: 0, y: 0 }, { w: 90, h: 60 });
  _previewPlane = plane;
  const engineError=validateEnginePlane(plane);
  if(engineError){_els.error.textContent=engineError;return;}
  const mX = 14, mY = 13;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "gm-preview-svg");
  svg.setAttribute("viewBox", `${plane.x - mX} ${plane.y - mY} ${plane.w + 2 * mX} ${plane.h + 2 * mY}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const regionPrep=prepareSeries(plane);
  const planeLayer = renderCoordplane(plane);
  planeLayer.setAttribute('data-preview-plane', '');
  // Canvas-wide plane hit area must not cover series selection in the editor.
  planeLayer.firstElementChild.setAttribute('pointer-events','none');
  for(const f of regionPrep.ok ? regionPrep.list.filter(f=>f.sourceKind==='region') : [])svg.appendChild(renderFuncgraph(f,plane));
  svg.appendChild(planeLayer);
  markSelLabelPt(svg);   // 선택된 라벨러 표시점에 강조 링(편집 중 안내 — 결과물엔 안 나간다)

  _expressionErrors.clear();
  let selError = regionPrep.ok ? "" : regionPrep.error;
  _selPts = null; _selBreaks = null;   // 선택 계열의 baked points/경계를 이 렌더에서 갱신(배치 고스트·클릭 가드용)
  _allSeriesPts = [];                  // 모든 계열 곡선(표시 탭 스냅용)을 이 렌더에서 다시 모은다
  _series.forEach((s, i) => {
    // 읽는 축(왼쪽 y / 오른쪽 y2)에 맞는 평면 뷰 — 커밋(prepareSeries)과 같은 규약이라
    // 미리보기와 캔버스 결과가 어긋나지 않는다. axis가 없으면 plane 그대로.
    const pl = planeForSeries(s, plane);
    const [dl, dg] = s.customDash || (LINE_STYLES[s.styleIdx] || LINE_STYLES[0]).slice(1);
    let pts = null, sourceKind, curveStyle, breaks = null;
    // 면적 채움은 정의역 값 기준이라 렌더러가 '실제 그린 범위'를 알아야 한다 → 밖으로 뺀다.
    let dMinP = null, dMaxP = null;
    // 막대그래프: 커밋 경로(prepareSeries)와 완전히 같은 bakeBars 결과를 그대로 넘겨,
    // 미리보기와 캔버스가 한 함수에서 나온 같은 사각형을 그린다. 점·핸들·이동 편집 UI는
    // 막대에 해당 없으므로 여기서 끝낸다.
    if (s.kind === "bar") {
      const baked = bakeBars(s, pl);
      if (!baked) return;
      const el = renderFuncgraph({
        points: baked.points, bars: baked.bars, sourceKind: "bar", curveStyle: "straight",
        strokeLevel: 0, strokeWidth: s.strokeWidth, breaks: [],
      },plane);
      bindSeriesSelection(el, s, i);
      if (i === _sel && _tab === 'func') seriesColorSel(el);
      svg.appendChild(el);
      return;
    }
    if (s.kind === "expr") {
      const expr = String(s.expr || "").trim();
      if (!expr) return;
      const db = dataBounds(pl), pb = plotBounds(pl);   // 자동=격자 끝, 직접 지정=평면 박스 끝
      const dMin = s.domain ? Math.max(pb.xMin, Math.min(s.domain.min, s.domain.max)) : db.xMin;
      const dMax = s.domain ? Math.min(pb.xMax, Math.max(s.domain.min, s.domain.max)) : db.xMax;
      dMinP = dMin; dMaxP = dMax;
      const r = sampleFunctionPoints(expr, dMin, dMax, pl, { yRange: s.range });
      if (r.error) { _expressionErrors.set(s,r.error); if (i === _sel) selError = r.error; return; }
      if (r.points.length < 2) { _expressionErrors.set(s,"정의역 안에 그릴 점이 없습니다"); if (i === _sel) selError = "정의역 안에 그릴 점이 없습니다"; return; }
      pts = applyOffset(r.points, pl, s.offset);   // 함수식 자유 이동 반영
      breaks = r.breaks;                             // 끊긴 구간(평면 밖·치역 밖) 경계
    } else {
      if (!s.pts.length) return;
      // 핸들(베지어 변환)이 있으면 자동 연장 없이 s.pts 그대로 + 핸들로 렌더.
      pts = (useHandles(s) ? s.pts : extendedMathPts(s)).map((m) => worldFromMath(pl, m.x, m.y));
      sourceKind = "points"; curveStyle = "straight";
      breaks = [...(s.breaks || [])];   // 손그림 곡선은 끊김 없는 연속선 — 거리 휴리스틱으로 쪼개지지 않게 명시
    }
    const wHandles = worldHandlesOf(s, pl);                      // 핸들 있으면 world 제어점, 없으면 null
    const geom = breaks?.length ? pts : wHandles ? bezierSamplePts(pts, wHandles, 16, s.segmentModes) : geomPts(s, pts);  // 요소 베이크/스냅용 곡선
    if (i === _sel) { _selPts = geom; _selBreaks = breaks; }     // 선택 계열 곡선+경계(배치 스냅 기준)
    if (Array.isArray(geom) && geom.length >= 2) _allSeriesPts.push({ pts: geom, breaks });  // 표시 탭 스냅용
    const el = renderFuncgraph({
      ...seriesFeatureFields(s), reconstruction:s.reconstruction, closed: !!s.closed, segmentModes: s.segmentModes, points: pts, strokeLevel: 0, strokeWidth: s.strokeWidth, breaks, endpointMarkers: s.endpointMarkers,
      dashLength: dl, dashGap: dg, sourceKind,
      curveStyle: s.curveStyle || (s.kind === "points" ? "straight" : "smooth"),
      curvature: s.curvature, handles: wHandles,                // 있으면 렌더가 진짜 3차 베지어로
      labelWeight: _cfg.exactInitial && _cfg.labelWeight === _cfg.exactInitial.labelWeight ? (s.labelWeight ?? plane.labelWeight) : plane.labelWeight,
      haloRatio: s.haloRatio,
      endLabel: s.endLabel, endLabelSize: s.endLabelSize ?? endLabelSizeOf(plane),
      domainMin: dMinP, domainMax: dMaxP,
      ...areaFields(s, pl),                  // 곡선 아래 면적 채움 미리보기
      ...bakeElements(s, pl, geom, breaks),  // 표시점/수선/화살표 실시간 미리보기
    },plane);
    bindSeriesSelection(el, s, i);
    if (i === _sel && _tab === 'func') seriesColorSel(el);
    markPlacedElements(el);
    svg.appendChild(el);
    // 선택된 점 계열: 실제로 '찍은' 점만 파란 점으로 표시(자동 연장점은 제외).
    // 각 점은 드래그 핸들(요구: 자유곡선을 마우스 드래그로 변형) — 점을 끌면 s.pts가
    // 갱신되고, 곡선 모양이면 스무딩이 다시 돌아 매끄러운 곡선으로 따라온다.
    if (s.kind === "points" && i === _sel && _tab === 'func') {
      // '그리는 중'이면 기존 점 위에 드래그 히트 원을 얹지 않는다 — 얹으면 그 원이 클릭을
      // 가로채(stopPropagation) 같은 점을 다시 찍을 수 없어 폐쇄 고리((1,1)→…→(1,1))가
      // 완성되지 않는다(버그). 그리기 중엔 클릭이 svg 핸들러로 가 꼭짓점이 추가되고,
      // 드래그 편집 핸들은 그리기를 마친 뒤(선택 상태)에 되살아난다.
      const drawingThis = _activeDraw === i && !_placeMode;
      s.pts.forEach((mp, pi) => {
        const w = worldFromMath(pl, mp.x, mp.y);
        const c = document.createElementNS(SVG_NS, "circle");
        c.setAttribute("cx", w.x); c.setAttribute("cy", w.y); c.setAttribute("r", 0.9);
        c.setAttribute("fill", "var(--accent)");
        svg.appendChild(c);
        if (drawingThis) return;   // 드래그 핸들 생략 → 같은 점 재클릭 허용
        // 잡기 쉬운 투명 히트 원 + 드래그로 꼭짓점 이동(1/8칸 스냅은 clientToMath가 처리).
        const hitC = document.createElementNS(SVG_NS, "circle");
        hitC.setAttribute("cx", w.x); hitC.setAttribute("cy", w.y); hitC.setAttribute("r", 2.2);
        hitC.setAttribute("fill", "transparent"); hitC.style.cursor = "grab";
        hitC.addEventListener("click", (e) => e.stopPropagation());
        hitC.addEventListener("mousedown", (e) => {
          e.preventDefault(); e.stopPropagation();
          const onMove = (ev) => {
            const m = clientToMath(ev.clientX, ev.clientY);
            if (!m) return;
            s.pts[pi] = m;
            refreshPreview();
          };
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            syncSeriesEditor();   // 좌표 직접 입력창에 드래그 결과 반영
          };
          window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
        });
        // 우클릭 = 이 앵커만 삭제(요구: 앵커 개수 변경). 최소 2점은 유지. 그리는 중엔 무시.
        hitC.addEventListener("contextmenu", (e) => {
          if (_activeDraw === i || _placeMode) return;
          e.preventDefault(); e.stopPropagation();
          if (s.pts.length <= 2) return;
          remapPointIndices(s, pi, -1); s.pts.splice(pi, 1);
          if (s.handles) syncHandlesToStructure(s);
          syncSeriesEditor(); renderChips(); refreshPreview();
        });
        svg.appendChild(hitC);
      });
    }
    // 베지어 핸들 편집(스무스 노드): 선택된 자유곡선(변환됨)에서 각 앵커의 in/out 핸들을
    // 드래그해 곡선이 얼마나 볼록하게 휘는지 조절한다(잉크스케이프式). 두 핸들은 일직선 유지.
    if (i === _sel && _tab === 'func' && wHandles && _activeDraw !== i && !_placeMode) {
      s.pts.forEach((mp, pi) => {
        const a = worldFromMath(pl, mp.x, mp.y);
        const mkHandle = (which) => {
          const h = s.handles[pi];
          const off = which === "out" ? { x: h.ox, y: h.oy } : { x: h.ix, y: h.iy };
          if (off.x === 0 && off.y === 0) return;   // 끝점의 없는 핸들은 안 그림
          const hw = worldFromMath(pl, mp.x + off.x, mp.y + off.y);
          const line = document.createElementNS(SVG_NS, "line");
          line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
          line.setAttribute("x2", hw.x); line.setAttribute("y2", hw.y);
          line.setAttribute("stroke", "var(--accent)"); line.setAttribute("stroke-width", 0.22);
          line.setAttribute("stroke-opacity", "0.7"); line.setAttribute("pointer-events", "none");
          svg.appendChild(line);
          const dot = document.createElementNS(SVG_NS, "circle");
          dot.setAttribute("cx", hw.x); dot.setAttribute("cy", hw.y); dot.setAttribute("r", 0.75);
          dot.setAttribute("fill", "#fff"); dot.setAttribute("stroke", "var(--accent)"); dot.setAttribute("stroke-width", 0.4);
          svg.appendChild(dot);
          const hit = document.createElementNS(SVG_NS, "circle");
          hit.setAttribute("cx", hw.x); hit.setAttribute("cy", hw.y); hit.setAttribute("r", 1.9);
          hit.setAttribute("fill", "transparent"); hit.style.cursor = "grab";
          hit.addEventListener("click", (e) => e.stopPropagation());
          hit.addEventListener("mousedown", (e) => {
            e.preventDefault(); e.stopPropagation();
            const onMove = (ev) => {
              const w = clientToWorld(ev.clientX, ev.clientY);
              if (!w) return;
              const m = mathFromWorld(pl, w.x, w.y);
              const no = { x: m.x - mp.x, y: m.y - mp.y };   // 새 오프셋(math)
              s.handlesMode = "manual";
              const hh = s.handles[pi];
              if (which === "out") { hh.ox = no.x; hh.oy = no.y; } else { hh.ix = no.x; hh.iy = no.y; }
              // 스무스: 반대 핸들을 정반대 방향으로(자기 길이 유지). 반대가 없으면(끝점) 그대로.
              const opp = which === "out" ? { x: hh.ix, y: hh.iy } : { x: hh.ox, y: hh.oy };
              const oppLen = Math.hypot(opp.x, opp.y), nLen = Math.hypot(no.x, no.y) || 1;
              if (oppLen > 1e-6) {
                const ux = -no.x / nLen * oppLen, uy = -no.y / nLen * oppLen;
                if (which === "out") { hh.ix = ux; hh.iy = uy; } else { hh.ox = ux; hh.oy = uy; }
              }
              refreshPreview();
            };
            const onUp = () => {
              window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp);
              s.handlesMode = "manual";
              const hh = s.handles[pi];   // 소수 정리
              hh.ix = Math.round(hh.ix * 1000) / 1000; hh.iy = Math.round(hh.iy * 1000) / 1000;
              hh.ox = Math.round(hh.ox * 1000) / 1000; hh.oy = Math.round(hh.oy * 1000) / 1000;
            };
            window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
          });
          svg.appendChild(hit);
        };
        mkHandle("in"); mkHandle("out");
      });
    }
    // '이동' 체크(요구): 선택 계열의 곡선 몸통을 드래그하면 계열 전체가 따라온다.
    // 함수식 = offset(math) 누적, 점 계열 = 찍은 점들을 통째로 평행이동(저장·수선도 일관).
    // 곡선 위 투명 굵은 히트선 + 드래그. refreshPreview가 재생성해도 window 리스너로 이어감.
    if (i === _sel && _tab === 'func' && !_placeMode && s.movable && _activeDraw !== i) {
      const path = el.querySelector("path");
      if (path) {
        const hit = path.cloneNode(false);
        // cloneNode가 seriesColorSel이 넣은 인라인 style.stroke(=파랑)까지 복사한다. 인라인
        // 스타일은 stroke 속성(attribute)보다 우선하므로, 투명으로 두려면 인라인 쪽을 지워야
        // 한다 — 안 그러면 굵기 3짜리 투명 히트선이 파란 띠로 보인다.
        hit.style.stroke = "transparent"; hit.style.strokeWidth = "";
        hit.setAttribute("stroke", "transparent"); hit.setAttribute("stroke-width", 3);
        hit.setAttribute("fill", "none"); hit.style.cursor = "move";
        hit.addEventListener("click", (e) => e.stopPropagation());
        hit.addEventListener("mousedown", (e) => {
          e.preventDefault(); e.stopPropagation();
          const start = clientToWorld(e.clientX, e.clientY);
          if (!start) return;
          const baseOff = { ...(s.offset || { dx: 0, dy: 0 }) };
          const basePts = s.kind === "points" ? s.pts.map((p) => ({ ...p })) : null;
          // 표시점·수선·화살표는 곡선 '위'에 찍은 것이므로 곡선과 함께 움직여야 한다.
          // 이들은 math 절대좌표로 저장되는데, 종전엔 곡선만 옮기고 이 좌표는 두었다.
          // 그러면 다음 렌더에서 옮겨간 곡선을 기준으로 최근접점을 다시 잡아, 요소가
          // 곡선을 따라오는 대신 제자리에서 미끄러지듯 딴 데로 갔다.
          const baseEls = {
            markers: (s.markers || []).map(copySpec),
            guides: (s.guides || []).map(copySpec),
            arrows: (s.arrows || []).map((a) => ({ ...a })),
          };
          const ux = (pl.xMax - pl.xMin) ? pl.w / (pl.xMax - pl.xMin) : 1;
          const uy = (pl.yMax - pl.yMin) ? pl.h / (pl.yMax - pl.yMin) : 1;
          const onMove = (ev) => {
            const w = clientToWorld(ev.clientX, ev.clientY);
            if (!w) return;
            const dxm = (w.x - start.x) / ux, dym = -(w.y - start.y) / uy;
            if (s.kind === "expr") s.offset = { dx: baseOff.dx + dxm, dy: baseOff.dy + dym };
            else s.pts = basePts.map((p) => ({ x: p.x + dxm, y: p.y + dym }));
            // 곡선과 같은 양만큼 요소도 평행이동(구버전 숫자 스펙은 x만 있다).
            const shift = (v) => (typeof v === "number" ? v + dxm
              : { ...v, x: v.x + dxm, y: Number.isFinite(v.y) ? v.y + dym : v.y });
            s.markers = baseEls.markers.map(shift);
            s.guides = baseEls.guides.map(shift);
            s.arrows = baseEls.arrows.map((a) => ({
              ...a, x: a.x + dxm, y: Number.isFinite(a.y) ? a.y + dym : a.y,
            }));
            syncElementLists();
            refreshPreview();
          };
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            if (s.kind === "points") {
              // 자유 이동이라 소수가 길어진다 — 놓는 순간 1/1000로 반올림해 좌표를 깔끔하게.
              s.pts = s.pts.map((p) => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 }));
              syncSeriesEditor();   // 좌표 입력창에 이동 결과 반영
            }
          };
          window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
        });
        svg.appendChild(hit);
      }
    }
  });

  // 점 계열 선택 중이면 꺾은선 도구처럼 "그리는 과정"을 보여준다: 마지막 찍은 점에서
  // 커서까지 고무줄(러버밴드) 선 + 커서 위치 점. 클릭=꼭짓점 추가, Enter/우클릭=완료(요구).
  // ★ '그리는 중'(_activeDraw===_sel)인 점 계열에서만 러버밴드를 그린다. 칩으로 선택만 한
  //   상태(그리기 아님)나 배치 모드(_placeMode)에서는 안 그린다 — 함수 그리기와 표시점/보기
  //   상태는 완전 별개(요구). 러버밴드가 남으면 함수 끝에서 연장되듯 보인다.
  const drawing = _activeDraw === _sel && _series[_sel] && _series[_sel].kind === "points" && !_placeMode;
  // 자유곡선(smooth) 계열을 '그리는 중'이면 클릭 대신 드래그로 죽 그린다(요구: 대충 그리고
  // 앵커를 끌어 손보기). 아래 pointer 핸들러가 전담하며, 이때 click/러버밴드 경로는 비활성.
  const freehandDraw = drawing && _series[_sel].curveStyle === "smooth";
  let rubber = null, ghost = null;
  if (drawing) {
    rubber = document.createElementNS(SVG_NS, "line");
    rubber.setAttribute("stroke", "var(--accent)"); rubber.setAttribute("stroke-width", 0.4);
    rubber.setAttribute("stroke-dasharray", "1.2 1"); rubber.style.display = "none";
    rubber.setAttribute("pointer-events", "none");
    ghost = document.createElementNS(SVG_NS, "circle");
    ghost.setAttribute("r", 1.0); ghost.setAttribute("fill", "none");
    ghost.setAttribute("stroke", "var(--accent)"); ghost.setAttribute("stroke-width", 0.35);
    ghost.style.display = "none"; ghost.setAttribute("pointer-events", "none");
    svg.appendChild(rubber); svg.appendChild(ghost);
  }

  // 표시점/수선 배치 모드: 선택 계열의 함수 위에 '찍힐 위치'를 고스트로 미리 보여준다
  // (요구: 어디에 들어가는지 미리 볼 수 있어야). 선택 계열에 곡선이 없으면(_selPts null)
  // 고스트가 안 뜨고 클릭해도 무시 → 함수 밖/빈 계열에 찍히는 버그 원천 차단.
  const placing = !!_placeMode && Array.isArray(_selPts) && _selPts.length >= 2;
  let pGhost = null, pGhostRing = null, pV = null, pH = null;
  if (placing) {
    // 찍기 전 미리보기: 찍고 나면 어떻게 보일지를 그대로 보여준다(요구 2).
    // 종전엔 반투명 파란 원 하나라 "여기 찍힌다"가 아니라 그냥 커서 장식처럼 보였다.
    // 실제 표시점과 같은 구성(검은 점 + 흰 테두리 + 강조 링)에 점선 링만 더해
    // "아직 확정 아님"을 구분한다.
    pGhostRing = document.createElementNS(SVG_NS, "circle");
    pGhostRing.setAttribute("fill", "none");
    pGhostRing.setAttribute("stroke", "var(--accent)");
    pGhostRing.setAttribute("stroke-dasharray", "0.55 0.45");
    pGhostRing.setAttribute("pointer-events", "none");
    pGhostRing.style.display = "none";
    svg.appendChild(pGhostRing);

    pGhost = document.createElementNS(SVG_NS, "circle");
    pGhost.setAttribute("fill", "#111111");
    pGhost.setAttribute("fill-opacity", "0.75");
    pGhost.setAttribute("stroke", "#ffffff");
    pGhost.setAttribute("paint-order", "stroke");
    pGhost.style.display = "none";
    pGhost.setAttribute("pointer-events", "none");
    if (_placeMode === "guide") {
      const mkG = () => { const l = document.createElementNS(SVG_NS, "line");
        l.setAttribute("stroke", "var(--accent)"); l.setAttribute("stroke-width", 0.3);
        l.setAttribute("stroke-dasharray", "0.54 0.42"); l.setAttribute("pointer-events", "none");
        l.style.display = "none"; return l; };
      pV = mkG(); pH = mkG(); svg.appendChild(pV); svg.appendChild(pH);
    }
    svg.appendChild(pGhost);
  }
  // '표시' 탭(요구 ③) 배치 고스트: 옛 도구의 파란 미리보기를 이관 후에도 유지한다.
  // 곡선이 있으면 가장 가까운 곡선에 스냅(임계 안), 없으면 커서 좌표 그대로(함수 없이 배치).
  let annGhost = null, annRing = null, annV = null, annH = null, annSeg = null;
  if (_annMode) {
    const mkLine = (dash) => { const l = document.createElementNS(SVG_NS, "line");
      l.setAttribute("stroke", "var(--accent)"); l.setAttribute("stroke-width", 0.3);
      if (dash) l.setAttribute("stroke-dasharray", dash);
      l.setAttribute("pointer-events", "none"); l.style.display = "none"; return l; };
    annRing = document.createElementNS(SVG_NS, "circle");
    annRing.setAttribute("fill", "none"); annRing.setAttribute("stroke", "var(--accent)");
    annRing.setAttribute("stroke-dasharray", "0.55 0.45"); annRing.setAttribute("pointer-events", "none");
    annRing.style.display = "none"; svg.appendChild(annRing);
    if (_annMode === "guide") { annV = mkLine("0.54 0.42"); annH = mkLine("0.54 0.42"); svg.appendChild(annV); svg.appendChild(annH); }
    if (_annMode === "arrow" || _annMode === "guideline") { annSeg = mkLine(_annMode === "guideline" ? "1.2 0.9" : null); svg.appendChild(annSeg); }
    annGhost = document.createElementNS(SVG_NS, "circle");
    annGhost.setAttribute("fill", "#111111"); annGhost.setAttribute("fill-opacity", "0.75");
    annGhost.setAttribute("stroke", "#ffffff"); annGhost.setAttribute("paint-order", "stroke");
    annGhost.setAttribute("pointer-events", "none"); annGhost.style.display = "none";
    svg.appendChild(annGhost);
  }
  // 커서에서 가장 가까운 '곡선 위의 점'(world). 커서에서 너무 멀면 null(빈 곳 클릭은 무시).
  // 종전엔 커서의 x만 보고 그 x에서의 함숫값을 찾았다. 그래서 세로선(x가 일정)에서는
  // 어디를 눌러도 같은 점만 나오고, 원·좌우로 열린 포물선처럼 x 하나에 y가 둘 이상인
  // 도형에서는 항상 한쪽 가지만 잡혔다. 이제 커서의 x·y를 함께 써서 실제 최근접점을 찍는다.
  const snapToFunc = (clientX, clientY) => {
    const w = clientToWorld(clientX, clientY);
    if (!w) return null;
    const p = nearestOnPolyline(_selPts, w.x, w.y, _selBreaks);
    if (!p) return null;
    const m = mathFromWorld(_previewPlane, p.x, p.y);
    return { mx: m.x, my: m.y, wx: p.x, wy: p.y };
  };
  // '표시' 탭 배치용: 모든 곡선 중 최근접점(임계 안이면 스냅), 없으면 커서 좌표 그대로.
  // 모든 계열 곡선 중 최근접점(+접선 dx,dy). 곡선이 하나도 없으면 null.
  const nearestCurve = (clientX, clientY) => {
    const w = clientToWorld(clientX, clientY);
    if (!w) return null;
    let best = null;
    for (const sp of _allSeriesPts) {
      const p = nearestOnPolyline(sp.pts, w.x, w.y, sp.breaks);
      if (p && (!best || p.dist < best.dist)) best = p;
    }
    if (!best) return null;
    const m = mathFromWorld(_previewPlane, best.x, best.y);
    return { mx: m.x, my: m.y, wx: best.x, wy: best.y, dx: best.dx, dy: best.dy, dist: best.dist };
  };
  const snapAnn = (clientX, clientY) => {
    const nc = nearestCurve(clientX, clientY);
    const SNAP = 3;   // world mm 임계 — 이보다 가까우면 곡선에 붙는다
    if (nc && nc.dist <= SNAP) return { mx: nc.mx, my: nc.my, wx: nc.wx, wy: nc.wy, dx: nc.dx, dy: nc.dy, snapped: true };
    const m = clientToMath(clientX, clientY);
    if (!m) return null;
    const wf = worldFromMath(_previewPlane, m.x, m.y);
    return { mx: m.x, my: m.y, wx: wf.x, wy: wf.y, snapped: false };
  };

  // 좌표 툴팁(요구): 함수/수선/표시점을 찍을 때 커서가 노리는 좌표를 커서 바로 위에 표시.
  let coordTip = null;
  if (drawing || placing || _annMode) {   // '표시' 탭 배치 중에도 커서 좌표를 보여준다(요구 4)
    coordTip = document.createElementNS(SVG_NS, "text");
    coordTip.setAttribute("font-size", 3);
    coordTip.setAttribute("fill", "#111"); coordTip.setAttribute("text-anchor", "middle");
    coordTip.setAttribute("paint-order", "stroke"); coordTip.setAttribute("stroke", "#fff");
    coordTip.setAttribute("stroke-width", 0.9); coordTip.setAttribute("stroke-linejoin", "round");
    coordTip.setAttribute("pointer-events", "none"); coordTip.style.display = "none";
    svg.appendChild(coordTip);
  }
  const fmtCoord = (v) => { const r = Math.round(v * 100) / 100; return Object.is(r, -0) ? "0" : String(r); };
  const showCoordTip = (mx, my, wx, wy) => {
    if (!coordTip) return;
    coordTip.textContent = `(${fmtCoord(mx)}, ${fmtCoord(my)})`;
    coordTip.setAttribute("x", wx); coordTip.setAttribute("y", wy - 2.6); // 커서 바로 위
    coordTip.style.display = "";
  };

  /* 사각형 드래그로 정의역·치역을 한 번에 정한다(요구 6).
     끄는 동안 반투명 사각형을 보여 주고, 놓는 순간 그 x·y 범위를 계열에 넣는다.
     너무 작게 끌린 것(스치듯 클릭)은 무시한다 — 실수로 곡선이 사라지지 않게. */
  if (_boxMode && _series[_sel]) {
    let box = null, start = null;
    svg.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      start = clientToWorld(e.clientX, e.clientY);
      if (!start) return;
      box = document.createElementNS(SVG_NS, "rect");
      box.setAttribute("fill", "color-mix(in srgb, var(--accent) 14%, transparent)");
      box.setAttribute("stroke", "var(--accent)");
      box.setAttribute("stroke-width", 0.25);
      box.setAttribute("stroke-dasharray", "0.8 0.5");
      box.setAttribute("pointer-events", "none");
      svg.appendChild(box);
      const onMove = (ev) => {
        const w = clientToWorld(ev.clientX, ev.clientY);
        if (!w || !box) return;
        box.setAttribute("x", Math.min(start.x, w.x)); box.setAttribute("y", Math.min(start.y, w.y));
        box.setAttribute("width", Math.abs(w.x - start.x)); box.setAttribute("height", Math.abs(w.y - start.y));
      };
      const onUp = (ev) => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        const w = clientToWorld(ev.clientX, ev.clientY);
        if (box) { box.remove(); box = null; }
        const s2 = _series[_sel];
        if (!w || !s2) return;
        if (Math.abs(w.x - start.x) < 1 || Math.abs(w.y - start.y) < 1) return;  // 너무 작으면 무시
        const a = mathFromWorld(_previewPlane, start.x, start.y);
        const b = mathFromWorld(_previewPlane, w.x, w.y);
        const round2 = (v) => Math.round(v * 100) / 100;
        s2.domain = { min: round2(Math.min(a.x, b.x)), max: round2(Math.max(a.x, b.x)) };
        s2.range = { min: round2(Math.min(a.y, b.y)), max: round2(Math.max(a.y, b.y)) };
        _boxMode = false;                   // 한 번 정하면 모드는 꺼진다
        syncSeriesEditor(); refreshPreview();
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
    svg.style.cursor = "crosshair";
  }

  /* 좌우 드래그로 면적 채움 구간을 정한다. 세로는 무시하고 x만 읽는다 —
     "여기부터 저기까지"를 눈으로 정하는 작업이라 그림 위에서 하는 게 맞다. */
  if (_areaMode && _series[_sel] && _series[_sel].area && _series[_sel].area.on) {
    let band = null, start = null;
    svg.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      start = clientToWorld(e.clientX, e.clientY);
      if (!start) return;
      band = document.createElementNS(SVG_NS, "rect");
      band.setAttribute("fill", "color-mix(in srgb, var(--accent) 18%, transparent)");
      band.setAttribute("stroke", "var(--accent)");
      band.setAttribute("stroke-width", 0.25);
      band.setAttribute("pointer-events", "none");
      band.setAttribute("y", _previewPlane.y);
      band.setAttribute("height", _previewPlane.h);
      svg.appendChild(band);
      const onMove = (ev) => {
        const w = clientToWorld(ev.clientX, ev.clientY);
        if (!w || !band) return;
        band.setAttribute("x", Math.min(start.x, w.x));
        band.setAttribute("width", Math.abs(w.x - start.x));
      };
      const onUp = (ev) => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        const w = clientToWorld(ev.clientX, ev.clientY);
        if (band) { band.remove(); band = null; }
        const s2 = _series[_sel];
        if (!w || !s2 || !s2.area) return;
        if (Math.abs(w.x - start.x) < 1) return;         // 스치듯 클릭은 무시
        const a = mathFromWorld(_previewPlane, start.x, start.y);
        const b = mathFromWorld(_previewPlane, w.x, w.y);
        const round2 = (v) => Math.round(v * 100) / 100;
        s2.area.from = round2(Math.min(a.x, b.x));
        s2.area.to = round2(Math.max(a.x, b.x));
        _areaMode = false;                                // 한 번 정하면 모드는 꺼진다
        syncSeriesEditor(); refreshPreview();
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
    svg.style.cursor = "ew-resize";
  }

  svg.addEventListener("click", (e) => {
    if (_boxMode || _areaMode) return;   // 범위 지정 중에는 클릭 배치·선택 해제가 끼어들지 않게
    if (freehandDraw) return;   // 자유곡선 그리기는 아래 pointer 핸들러가 전담(탭 점찍기 포함)
    // '표시' 레이어 배치(요구 ③): 곡선이 가까우면 스냅, 없으면 클릭 좌표 그대로 — 함수 없이도 동작.
    if (_annMode) {
      // 화살표(요구 5): 함수 위에서만, 클릭 '한 번'에 그 지점 접선 방향으로 화살촉을 놓는다.
      if (_annMode === "arrow") {
        const nc = nearestCurve(e.clientX, e.clientY);
        if (!nc) return;   // 곡선이 없으면(또는 못 잡으면) 배치하지 않는다
        (_cfg.annArrows = _cfg.annArrows || []).push({ x: nc.mx, y: nc.my, dx: nc.dx, dy: nc.dy });
        _displaySelection = {kind:'arrow',spec:_cfg.annArrows.at(-1)}; _selectedAnnotationId = null; _lpSel = -1; _engineControls?.selectRegion(null);
        if (typeof syncAnnLists === "function") syncAnnLists();
        refreshPreview();
        return;
      }
      const hit = snapAnn(e.clientX, e.clientY);
      if (!hit) return;
      if (_annMode === "marker") (_cfg.annMarkers = _cfg.annMarkers || []).push({ x: hit.mx, y: hit.my });
      else if (_annMode === "guide") (_cfg.annGuides = _cfg.annGuides || []).push({ x: hit.mx, y: hit.my });
      else if (["text","single-guide"].includes(_annMode)) {
        const annotation = {id:`annotation-${Date.now()}`,kind:_annMode==='text'?'text':'guide',text:_annMode==='text'?'글자':'',x:hit.mx,y:hit.my,orientation:'horizontal'};
        (_cfg.graphAnnotations ||= []).push(annotation); _selectedAnnotationId = annotation.id;
      } else if (_annMode === "leader") {
        if (!_annPending) _annPending={x:hit.mx,y:hit.my};
        else {const annotation={id:`annotation-${Date.now()}`,kind:'leader',text:'',..._annPending,to:{x:hit.mx,y:hit.my},orientation:'horizontal'};(_cfg.graphAnnotations ||= []).push(annotation);_selectedAnnotationId=annotation.id;_annPending=null;}
      } else if (_annMode === "guideline") {
        if (!_annPending) { _annPending = { x: hit.mx, y: hit.my }; }   // 가이드라인 첫 점
        else { (_cfg.guideLines = _cfg.guideLines || []).push({ x1: _annPending.x, y1: _annPending.y, x2: hit.mx, y2: hit.my }); _annPending = null; }
      } else if (_annMode === "labelpt") {
        // 라벨러 표시점(요구 ⑥): 찍는 순서대로 A·B·C… 자동 부여(추후 개별 수정 가능).
        const arr = (_cfg.annLabelPoints = _cfg.annLabelPoints || []);
        arr.push({ x: hit.mx, y: hit.my, text: nextLabelLetter(arr.length), dist: 5, angle: 45, size: ptToMm(15) });
        _lpSel = arr.length - 1;   // 찍자마자 선택 상태 → PageUp/Down으로 바로 각도를 돌릴 수 있다(요구)
      }
      if (!_annPending) {
        if (['text','single-guide','leader'].includes(_annMode)) _displaySelection = {kind:'annotation',spec:_cfg.graphAnnotations.at(-1)};
        else {
          const kind = {marker:'marker',guide:'guide',guideline:'guideline',labelpt:'labelpt'}[_annMode];
          if (kind) { _displaySelection = {kind,spec:_cfg[DISPLAY_ARRAYS[kind]].at(-1)}; _selectedAnnotationId = null; if (kind !== 'labelpt') _lpSel = -1; }
        }
        _engineControls?.selectRegion(null);
      }
      if (typeof syncAnnLists === "function") syncAnnLists();
      refreshPreview();
      return;
    }
    if (_tab === 'annot' && _selectedAnnotationId && !e.target.closest('[data-graph-annotation], [data-graph-annotation-shape]')) {
      selectTypedAnnotation(null); return;
    }
    const s = _series[_sel];
    // 배치 모드: 함수 위를 클릭할 때만 찍는다(함수 밖 클릭은 무시). 표시점/수선/화살표 동일.
    if (s && (_placeMode === "marker" || _placeMode === "guide" || _placeMode === "arrow")) {
      const hit = snapToFunc(e.clientX, e.clientY);
      if (!hit) return;
      // 찍은 지점을 (x, y) 그대로 저장한다 — x만 저장하면 세로선·다가 도형에서 되살릴 수 없다.
      if (_placeMode === "marker") (s.markers = s.markers || []).push({ x: hit.mx, y: hit.my });
      else if (_placeMode === "guide") (s.guides = s.guides || []).push({ x: hit.mx, y: hit.my });
      else (s.arrows = s.arrows || []).push({ x: hit.mx, y: hit.my, dir: 1 }); // 기본 정방향(+), 칩 클릭으로 전환
      syncElementLists(); refreshPreview();
      return;
    }
    // '그리는 중'인 점 계열: 클릭 = 꼭짓점 추가.
    if (s && s.kind === "points" && _activeDraw === _sel && !_placeMode) {
      const m = clientToMath(e.clientX, e.clientY);
      if (!m) return;
      s.pts.push(m);
      syncSeriesEditor(); refreshPreview(); renderChips();
      return;
    }
    // 그 외(빈 화면 클릭): 선택 해제 → 파란 강조가 풀려 두 그래프를 온전한 색으로 본다(요구).
    if (_sel !== -1) { _sel = -1; _activeDraw = -1; _placeMode = null; syncSeriesEditor(); renderChips(); refreshPreview(); }
  });
  // 완성 = 우클릭(컨텍스트 메뉴 차단) 또는 Enter(아래 window 리스너). 더블클릭 아님(요구).
  svg.addEventListener("contextmenu", (e) => {
    const s = _series[_sel];
    if (!s || s.kind !== "points" || _placeMode) return;
    e.preventDefault();
    finishPointsSeries();
  });
  svg.addEventListener("mousemove", (e) => {
    // '표시' 탭 배치 고스트(요구): 찍힐 점을 커서를 따라 파란 미리보기로 보여준다.
    if (_annMode) {
      // 화살표는 곡선 위에서만 — 곡선 최근접점에 접선 방향 미리보기.
      const hit = _annMode === "arrow" ? nearestCurve(e.clientX, e.clientY) : snapAnn(e.clientX, e.clientY);
      if (!hit) {
        [annGhost, annRing, annV, annH, annSeg].forEach((el) => { if (el) el.style.display = "none"; });
        if (coordTip) coordTip.style.display = "none";
        return;
      }
      const gr = markerRadius(_cfg.strokeWidth || 0.4);
      annGhost.setAttribute("r", gr); annGhost.setAttribute("stroke-width", gr * 0.42);
      annGhost.setAttribute("cx", hit.wx); annGhost.setAttribute("cy", hit.wy); annGhost.style.display = "";
      annRing.setAttribute("r", gr * 2.05); annRing.setAttribute("stroke-width", gr * 0.5);
      annRing.setAttribute("cx", hit.wx); annRing.setAttribute("cy", hit.wy); annRing.style.display = "";
      if (_annMode === "guide") {
        const o0 = worldFromMath(_previewPlane, 0, 0);
        annV.setAttribute("x1", hit.wx); annV.setAttribute("y1", hit.wy); annV.setAttribute("x2", hit.wx); annV.setAttribute("y2", o0.y); annV.style.display = "";
        annH.setAttribute("x1", hit.wx); annH.setAttribute("y1", hit.wy); annH.setAttribute("x2", o0.x); annH.setAttribute("y2", hit.wy); annH.style.display = "";
      }
      if (_annMode === "arrow" && annSeg && Number.isFinite(hit.dx)) {
        // 접선 방향으로 짧은 선(화살촉이 놓일 방향 안내).
        const L = gr * 4;
        annSeg.setAttribute("x1", hit.wx - hit.dx * L); annSeg.setAttribute("y1", hit.wy - hit.dy * L);
        annSeg.setAttribute("x2", hit.wx + hit.dx * L); annSeg.setAttribute("y2", hit.wy + hit.dy * L); annSeg.style.display = "";
      } else if (_annMode === "guideline" && _annPending && annSeg) {
        const t = worldFromMath(_previewPlane, _annPending.x, _annPending.y);
        annSeg.setAttribute("x1", t.x); annSeg.setAttribute("y1", t.y); annSeg.setAttribute("x2", hit.wx); annSeg.setAttribute("y2", hit.wy); annSeg.style.display = "";
      }
      // 커서 좌표 표시(요구 4): 찍힐 좌표를 커서 위에.
      const cw = clientToWorld(e.clientX, e.clientY);
      showCoordTip(hit.mx, hit.my, cw ? cw.x : hit.wx, cw ? cw.y : hit.wy);
      return;
    }
    // 배치 모드 고스트: 함수 위 찍힐 점(+수선이면 축까지 안내선) 미리보기.
    if (placing) {
      const hit = snapToFunc(e.clientX, e.clientY);
      if (!hit) {
        pGhost.style.display = "none"; pGhostRing.style.display = "none";
        if (pV) pV.style.display = "none"; if (pH) pH.style.display = "none";
        if (coordTip) coordTip.style.display = "none"; return;
      }
      // 실제로 찍혔을 때와 같은 크기로 — 선 굵기를 따라간다(요구 3과 같은 식).
      const gr = markerRadiusOf(_series[_sel]);
      pGhost.setAttribute("r", gr);
      pGhost.setAttribute("stroke-width", gr * 0.42);
      pGhostRing.setAttribute("r", gr * 2.05);
      pGhostRing.setAttribute("stroke-width", gr * 0.5);
      pGhost.setAttribute("cx", hit.wx); pGhost.setAttribute("cy", hit.wy); pGhost.style.display = "";
      pGhostRing.setAttribute("cx", hit.wx); pGhostRing.setAttribute("cy", hit.wy); pGhostRing.style.display = "";
      if (_placeMode === "guide") {
        const o0 = worldFromMath(_previewPlane, 0, 0);
        pV.setAttribute("x1", hit.wx); pV.setAttribute("y1", hit.wy); pV.setAttribute("x2", hit.wx); pV.setAttribute("y2", o0.y); pV.style.display = "";
        pH.setAttribute("x1", hit.wx); pH.setAttribute("y1", hit.wy); pH.setAttribute("x2", o0.x); pH.setAttribute("y2", hit.wy); pH.style.display = "";
      }
      // 좌표 툴팁: 함수 위 찍힐 점의 좌표를 커서 위에.
      const my = mathFromWorld(_previewPlane, hit.wx, hit.wy).y;
      const cw = clientToWorld(e.clientX, e.clientY);
      showCoordTip(hit.mx, my, cw ? cw.x : hit.wx, cw ? cw.y : hit.wy);
      return;
    }
    if (freehandDraw) return;   // 자유곡선 드로잉 중엔 러버밴드/고스트 대신 실시간 스트로크만 그린다
    if (!drawing || !rubber) return;
    const m = clientToMath(e.clientX, e.clientY);
    if (!m) { rubber.style.display = "none"; ghost.style.display = "none"; if (coordTip) coordTip.style.display = "none"; return; }
    const w = worldFromMath(_previewPlane, m.x, m.y);
    ghost.setAttribute("cx", w.x); ghost.setAttribute("cy", w.y); ghost.style.display = "";
    showCoordTip(m.x, m.y, w.x, w.y);   // 좌표 툴팁: 찍힐 꼭짓점 좌표
    const s = _series[_sel];
    if (s && s.pts.length) {
      const last = worldFromMath(_previewPlane, s.pts[s.pts.length - 1].x, s.pts[s.pts.length - 1].y);
      rubber.setAttribute("x1", last.x); rubber.setAttribute("y1", last.y);
      rubber.setAttribute("x2", w.x); rubber.setAttribute("y2", w.y); rubber.style.display = "";
    } else rubber.style.display = "none";
  });
  svg.addEventListener("mouseleave", () => {
    if (rubber) rubber.style.display = "none";
    if (ghost) ghost.style.display = "none";
    if (pGhost) pGhost.style.display = "none";
    if (pGhostRing) pGhostRing.style.display = "none";
    if (pV) pV.style.display = "none";
    if (pH) pH.style.display = "none";
    if (coordTip) coordTip.style.display = "none";
    [annGhost, annRing, annV, annH, annSeg].forEach((el) => { if (el) el.style.display = "none"; });
  });
  svg.style.cursor = (drawing || placing) ? "crosshair" : "";

  // ── 자유곡선: 마우스로 죽 그리면(드래그) 성긴 앵커로 단순화된 매끄러운 곡선이 된다.
  //    손그림 원시점을 RDP로 대여섯 개 앵커만 남기고(모양=자유·근사), 그 앵커를 s.pts로 삼아
  //    기존 앵커 드래그 편집으로 인계한다(요구: 대충 그리고 손으로 다듬기). 탭(거의 안 움직임)은
  //    점 하나 추가. ★ 손그림 '모든 점'을 정확히 통과시키려 하지 않는다 — 그건 예전 버그의 원인.
  if (freehandDraw) {
    const ux = (plane.xMax - plane.xMin) ? plane.w / (plane.xMax - plane.xMin) : 1;
    const cellW = ux * (plane.gridStepX || 1);
    const FD_EPS = Math.max(1.2, cellW * 0.3);   // RDP 허용오차(월드mm) — 성긴 앵커
    const FD_MIN = 0.4;                           // 원시점 최소 간격(월드mm)
    let raw = null, moved = false, live = null;
    svg.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const w = clientToWorld(e.clientX, e.clientY);
      if (!w) return;
      e.preventDefault();
      raw = [{ x: w.x, y: w.y }]; moved = false;
      try { svg.setPointerCapture(e.pointerId); } catch (_) {}
      live = document.createElementNS(SVG_NS, "path");
      live.setAttribute("fill", "none"); live.setAttribute("stroke", "var(--accent)");
      live.setAttribute("stroke-width", 0.4); live.setAttribute("stroke-linecap", "round");
      live.setAttribute("stroke-linejoin", "round"); live.setAttribute("pointer-events", "none");
      svg.appendChild(live);
    });
    svg.addEventListener("pointermove", (e) => {
      if (!raw) return;
      const w = clientToWorld(e.clientX, e.clientY);
      if (!w) return;
      const last = raw[raw.length - 1];
      if (Math.hypot(w.x - last.x, w.y - last.y) < FD_MIN) return;
      raw.push({ x: w.x, y: w.y }); moved = true;
      live.setAttribute("d", "M " + raw.map((p) => `${p.x} ${p.y}`).join(" L "));
    });
    const endFD = (e) => {
      if (!raw) return;
      try { svg.releasePointerCapture(e.pointerId); } catch (_) {}
      const pts = raw; raw = null;
      if (live) { live.remove(); live = null; }
      const s = _series[_sel];
      if (!s) return;
      if (!moved || pts.length < 2) {
        // 탭 = 점 하나 추가(클릭 배치와 같은 감각). 계속 그리기 모드 유지.
        const m0 = clientToMath(e.clientX, e.clientY);
        if (m0) { s.pts.push(m0); if (s.handles) syncHandlesToStructure(s); syncSeriesEditor(); refreshPreview(); renderChips(); }
        return;
      }
      // 드래그 = 스트로크를 성긴 앵커로 단순화해 계열의 점으로 삼는다(1/8칸 스냅·박스 클램프).
      const anchorsW = simplifyRDP(pts, FD_EPS);
      const pb = plotBounds(plane);   // 격자가 아니라 평면 박스까지 — 손그림은 격자 밖으로 나갈 수 있다
      const sx = (plane.gridStepX || 1) / 8, sy = (plane.gridStepY || 1) / 8;
      s.pts = anchorsW.map((p) => {
        const m = mathFromWorld(plane, p.x, p.y);
        const nx = Math.round(m.x / sx) * sx, ny = Math.round(m.y / sy) * sy;
        return { x: Math.max(pb.xMin, Math.min(pb.xMax, nx)), y: Math.max(pb.yMin, Math.min(pb.yMax, ny)) };
      });
      if (s.handles) syncHandlesToStructure(s);   // (드물게) 이미 핸들이 있었다면 새 앵커에 맞춤
      finishPointsSeries();   // 그리기 종료 → 앵커가 드래그 편집 가능한 상태로
    };
    svg.addEventListener("pointerup", endFD);
    svg.addEventListener("pointercancel", endFD);
  }

  // 축 이름(data-axisname)은 항상 드래그해 위치를 조정한다.
  // 드래그 중 refreshPreview가 라벨을 재생성하므로, 이동 추적은 window 리스너로 이어간다.
  if (_cfg && _cfg.labelMovable) {
    ["x", "y"].forEach((which) => {
      const el = svg.querySelector(`[data-axisname="${which}"]`);
      if (!el) return;
      el.style.cursor = "move";
      el.setAttribute("pointer-events", "all");
      el.addEventListener("click", (e) => e.stopPropagation()); // svg 클릭(선택해제) 방지
      el.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        const start = clientToWorld(e.clientX, e.clientY);
        if (!start) return;
        // 라벨을 '평면 박스 기준 분율'로 저장한다(요구 2): 화살표 여백·범위를 바꿔 축이 움직여도
        // 라벨은 박스 안 같은 자리에 남는다. 기준 world = 현재 라벨 중심(분율 있으면 그로부터).
        const posKey = which === "x" ? "labelXPos" : "labelYPos";
        const pl = _previewPlane;
        let baseW;
        if (_cfg[posKey] && Number.isFinite(_cfg[posKey].fx)) baseW = { x: pl.x + _cfg[posKey].fx * pl.w, y: pl.y + _cfg[posKey].fy * pl.h };
        else {
          const b = el.getBoundingClientRect();
          baseW = clientToWorld(b.x + b.width / 2, b.y + b.height / 2) || start;
        }
        const onMove = (ev) => {
          const w = clientToWorld(ev.clientX, ev.clientY);
          if (!w) return;
          const nx = baseW.x + (w.x - start.x), ny = baseW.y + (w.y - start.y);
          _cfg[posKey] = { fx: (nx - pl.x) / pl.w, fy: (ny - pl.y) / pl.h };
          refreshPreview();
        };
        const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
        window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
        if (_tab !== 'coord') setTab('coord');
      });
    });
  }

  // 눈금 라벨(data-tick="axis:ord")은 항상 드래그해 오프셋을 조정한다.
  // 곡선을 피하려는 이동이라 2D 자유 드래그. 세로 정렬은 '첫 라벨에 맞추기' 버튼이 담당.
  if (_cfg && _cfg.tickMovable) {
    svg.querySelectorAll("[data-tick]").forEach((el) => {
      const tag = el.getAttribute("data-tick");         // "x:2" | "y:0"
      const [axis, ordStr] = tag.split(":");
      const ord = parseInt(ordStr, 10);
      if (!Number.isFinite(ord)) return;
      el.style.cursor = "move";
      el.setAttribute("pointer-events", "all");
      el.addEventListener("click", (e) => e.stopPropagation());
      el.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        const start = clientToWorld(e.clientX, e.clientY);
        if (!start) return;
        const arrKey = axis === "x" ? "tickOffX" : "tickOffY";
        const arr = _cfg[arrKey] = _cfg[arrKey] || [];
        const base = { ...(arr[ord] || { dx: 0, dy: 0 }) };
        const onMove = (ev) => {
          const w = clientToWorld(ev.clientX, ev.clientY);
          if (!w) return;
          arr[ord] = { dx: (base.dx || 0) + (w.x - start.x), dy: (base.dy || 0) + (w.y - start.y) };
          refreshPreview();
        };
        const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
        window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
        if (_tab !== 'coord') setTab('coord');
      });
    });
  }

  // 범례 박스 이동(요구 ③): '표시' 탭에서 범례 박스를 드래그해 anchor(math)를 옮긴다.
  if (!_annMode && !_placeMode && _activeDraw === -1) {
    svg.querySelectorAll("[data-legend]").forEach((el) => {
      const li = parseInt(el.getAttribute("data-legend"), 10);
      if (!Number.isFinite(li)) return;
      el.style.cursor = "move";
      el.setAttribute("pointer-events", "all");
      el.addEventListener("click", (e) => e.stopPropagation());
      el.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        // 범례는 미리보기 어디로든 자유 이동(요구 3): 데이터 범위로 클램프하는 clientToMath 대신
        // 언클램프 변환(clientToWorld → mathFromWorld)을 쓴다.
        const toM = (cx, cy) => { const w = clientToWorld(cx, cy); return w ? mathFromWorld(_previewPlane, w.x, w.y) : null; };
        const start = toM(e.clientX, e.clientY);
        const lg = (_cfg.legends || [])[li];
        if (!start || !lg) return;
        selectDisplay('legend',lg);
        const base = { x: lg.x, y: lg.y };
        const onMove = (ev) => {
          const m = toM(ev.clientX, ev.clientY);
          if (!m) return;
          lg.x = base.x + (m.x - start.x); lg.y = base.y + (m.y - start.y);
          refreshPreview();
        };
        const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
        window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
      });
    });
  }

  // Label hit boxes need their rendered glyph metrics. Attach the SVG before
  // measuring them; getBBox on a detached SVG is empty in Safari/WebKit.
  _els.preview.replaceChildren(svg);
  _previewSvg = svg;
  if(!_annMode && !_placeMode && _activeDraw === -1) {
    const targets = [...planeLayer.querySelectorAll('[data-graph-annotation], [data-graph-annotation-shape]')].flatMap(el => {
      if (!el.hasAttribute('data-graph-annotation-shape')) {
        // The spaces between glyphs must be draggable too. SVG groups normally
        // only receive a mouse event on a painted glyph, not their whole box.
        const box=el.getBBox(),hit=document.createElementNS(SVG_NS,'rect');
        hit.setAttribute('data-graph-annotation',el.getAttribute('data-graph-annotation'));
        hit.setAttribute('data-annotation-hit','');
        for(const [key,value] of Object.entries({x:box.x,y:box.y,width:box.width,height:box.height}))hit.setAttribute(key,String(value));
        if(el.hasAttribute('transform'))hit.setAttribute('transform',el.getAttribute('transform'));
        hit.setAttribute('fill','transparent');hit.setAttribute('pointer-events','all');el.before(hit);
        return [hit,el];
      }
      // Thin reference strokes remain thin; a transparent screen-sized stroke
      // makes them selectable without changing their saved or visible geometry.
      const hit = el.cloneNode(false); hit.removeAttribute('id'); hit.setAttribute('data-annotation-hit','');
      hit.setAttribute('stroke','transparent'); hit.setAttribute('stroke-width','12'); hit.setAttribute('vector-effect','non-scaling-stroke');
      hit.setAttribute('fill','none'); hit.setAttribute('pointer-events','stroke'); el.before(hit);
      return [hit, el];
    });
    targets.forEach(el=>{
      const id=el.getAttribute('data-graph-annotation')||el.getAttribute('data-graph-annotation-shape');
      el.style.cursor='move';
      const annotation=(_cfg.graphAnnotations||[]).find(a=>a.id===id);
      const index=(_cfg.graphAnnotations||[]).indexOf(annotation);
      if (!el.hasAttribute('data-annotation-hit')) { el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button'); }
      el.setAttribute('aria-label', `표시 ${index+1} 선택 ${annotation?.text || ANNOTATION_KIND_NAMES[annotation?.kind] || '표시'}`);
      el.setAttribute('aria-pressed', String(id === _selectedAnnotationId));
      el.addEventListener('click', e => { e.stopPropagation(); });
      el.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault(); e.stopPropagation(); selectTypedAnnotation(id);
        [..._els.preview.querySelectorAll('[data-graph-annotation], [data-graph-annotation-shape]')].find(node=>!node.hasAttribute('data-annotation-hit') && (node.getAttribute('data-graph-annotation')||node.getAttribute('data-graph-annotation-shape'))===id)?.focus({preventScroll:true});
      });
      el.addEventListener('mousedown',e=>{
        if(e.button!==0)return;e.preventDefault();e.stopPropagation();
        const annotation=(_cfg.graphAnnotations||[]).find(a=>a.id===id);if(!annotation)return;
        selectDisplay('annotation',annotation);
        drawAnnotationSelection(svg);
        const p=annotation.axis==='y2'?planeAsY2(_previewPlane):_previewPlane;
        const toMath=(x,y)=>{const w=clientToWorld(x,y);return w?mathFromWorld(p,w.x,w.y):null;};
        const start=toMath(e.clientX,e.clientY);if(!start)return;const base=structuredClone(annotation);let moved=false;
        const onMove=ev=>{const m=toMath(ev.clientX,ev.clientY);if(!m)return;const dx=m.x-start.x,dy=m.y-start.y;moved||=Math.abs(dx)+Math.abs(dy)>1e-7;if(!moved)return;annotation.x=base.x+dx;annotation.y=base.y+dy;if(base.to)annotation.to={x:base.to.x+dx,y:base.to.y+dy};delete annotation.seriesId;delete annotation.pointIndex;delete annotation.curveAnchor;delete annotation.anchorX;refreshPreview();};
        const onUp=()=>{window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp);if(moved)syncTypedAnnotations();};
        window.addEventListener('mousemove',onMove);window.addEventListener('mouseup',onUp);
      });
    });
  }
  if (!_annMode && !_placeMode && _activeDraw === -1) {
    for (const el of [...planeLayer.querySelectorAll('[data-display-kind]')]) {
      const kind = el.dataset.displayKind, index = Number(el.dataset.displayIndex);
      const spec = (_cfg[DISPLAY_ARRAYS[kind]] || [])[index]; if (!spec) continue;
      const selected = _displaySelection?.kind === kind && _displaySelection.spec === spec;
      el.setAttribute('tabindex','0'); el.setAttribute('role','button');
      el.setAttribute('aria-label',`${kind} ${index+1} 선택`); el.setAttribute('aria-pressed',String(selected));
      let hit = el;
      if (['line','path','polygon'].includes(el.tagName)) {
        hit = el.cloneNode(false); hit.removeAttribute('id'); hit.removeAttribute('tabindex');
        hit.setAttribute('stroke','transparent'); hit.setAttribute('stroke-width','12');
        hit.setAttribute('vector-effect','non-scaling-stroke'); hit.setAttribute('fill','none'); hit.setAttribute('pointer-events','stroke'); el.before(hit);
      }
      el.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault(); selectDisplay(kind,spec);
        _els.preview.querySelector(`[data-display-kind="${kind}"][data-display-index="${index}"][tabindex]`)?.focus({preventScroll:true});
      });
      const beginDrag=e=>{
        if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
        const toMath = (x,y) => {const w=clientToWorld(x,y); return w ? mathFromWorld(_previewPlane,w.x,w.y) : null;};
        const start = toMath(e.clientX,e.clientY); if (!start) return;
        const base = structuredClone(spec); selectDisplay(kind,spec);
        const move = ev=>{
          const point=toMath(ev.clientX,ev.clientY); if (!point) return;
          for (const key of kind === 'guideline' ? ['x1','y1','x2','y2'] : ['x','y',...('tx' in spec ? ['tx','ty'] : [])]) {
            spec[key]=base[key]+(key.startsWith('x') || key==='tx' ? point.x-start.x : point.y-start.y);
          }
          refreshPreview();
        };
        const up = ()=>{window.removeEventListener('mousemove',move);window.removeEventListener('mouseup',up);syncAnnLists();};
        window.addEventListener('mousemove',move); window.addEventListener('mouseup',up);
      };
      for (const target of hit===el ? [el] : [hit,el]) {
        target.style.cursor='move';target.addEventListener('click',e=>e.stopPropagation());
        target.addEventListener('mousedown',beginDrag);
      }
    }
  }
  if (plane.reconstruction?.preserveAxes) svg.appendChild(planeLayer);
  drawAnnotationSelection(svg);
  _engineControls?.renderRegions(svg,plane,regionPrep.ok?regionPrep.list:[],_tab==='annot'&&!_annMode);
  // Decoration hit targets must sit above curve hit strokes. Preserve every
  // inherited transform while moving only preview DOM, never graph coordinates.
  const decorationSelector='[data-graph-annotation],[data-graph-annotation-shape],[data-display-kind],[data-labelpt],[data-legend],[data-axisname],[data-tick],[data-y2-tick]';
  const decorationLayer=planeLayer.cloneNode(false); decorationLayer.removeAttribute('id');
  for (const el of [...planeLayer.querySelectorAll(decorationSelector)]) {
    if (el.parentElement.closest(decorationSelector)) continue;
    let node=el;
    for (let parent=el.parentElement;parent && parent!==planeLayer;parent=parent.parentElement) {
      const wrapper=parent.cloneNode(false);wrapper.removeAttribute('id');wrapper.append(node);node=wrapper;
    }
    decorationLayer.append(node);
  }
  svg.append(decorationLayer);
  // Formula groups contain unpainted spaces (subscripts, fractions). The entire
  // visible label box must accept a click or drag in both browser engines.
  for (const label of svg.querySelectorAll('g[data-axisname],g[data-tick],g[data-y2-tick],g[data-end-label],g[data-labelpoint-text],g[data-legend-text]')) {
    const box = label.getBBox(), hit = document.createElementNS(SVG_NS,'rect');
    for (const [key,value] of Object.entries({x:box.x,y:box.y,width:box.width,height:box.height})) hit.setAttribute(key,String(value));
    hit.setAttribute('fill','transparent'); hit.setAttribute('pointer-events','all'); label.prepend(hit);
  }
  // 배치 모드인데 선택 계열에 곡선이 없으면 안내(함수 위에서만 찍을 수 있음).
  if (!selError && _placeMode && !(Array.isArray(_selPts) && _selPts.length >= 2)) {
    selError = "먼저 함수(또는 직선·꺾은선)를 그린 뒤, 그 계열을 선택하고 함수 위를 클릭하세요.";
  }
  _els.error.textContent = selError;
  if (_displaySelection) {
    const {kind,spec}=_displaySelection;
    const items=kind==='annotation'?_cfg.graphAnnotations:kind==='region'?_cfg.regions:_cfg[DISPLAY_ARRAYS[kind]];
    if (!(items || []).includes(spec)) _displaySelection=null;
  }
  const context=_overlay.querySelector('#gm-context');
  const selection=_displaySelection;
  let caption='① 좌표 · 범위, 축 이름과 눈금';
  if (_tab==='func') caption=_series[_sel] ? `② 함수 · ${seriesName(_series[_sel])} · ${seriesLabel(_series[_sel])}` : '② 함수 · 계열을 추가하거나 선택하세요.';
  else if (_tab==='annot') {
    const selected=_overlay.querySelector('#gm-display-list .gm-display-select[aria-pressed="true"]');
    caption=selection && selected ? `③ 표시 · ${selected.textContent}` : '③ 표시 · 요소를 배치하거나 선택하세요.';
  }
  if(context.textContent!==caption)context.textContent=caption;
  context.title=caption;context.dataset.editingTab=_tab;
  const expressionError = _expressionErrors.get(_series[_sel]);
  const nearExpression = _overlay.querySelector('#gm-expr-error');
  nearExpression.textContent = expressionError ? `${expressionError} · x, 괄호의 짝, 지원 함수 이름과 정의역을 확인하세요.` : '';
  nearExpression.hidden = !expressionError; _els.expr.setAttribute('aria-invalid',String(!!expressionError));
  const bounds = svg.getBBox(), view = svg.viewBox.baseVal;
  const sizeNote=_overlay.querySelector('#gm-size-advice');
  if(sizeNote){
    const ab=editorState().get().artboard,fit=bounds.width<=ab.w && bounds.height<=ab.h;
    const withinGuide=bounds.width<=100 && bounds.height<=100;
    sizeNote.textContent = `${graphSizeAdvice(plane.w)} 전체 약 ${bounds.width.toFixed(1)} × ${bounds.height.toFixed(1)} mm · ${withinGuide?'100×100 mm 크기 가이드 이내':'100×100 mm 크기 가이드 초과'} · ${fit?'현재 용지 크기 이내':'현재 용지보다 큽니다. 출력 폭이나 용지를 조정하세요'}`;
  }
  const left=Math.min(view.x,bounds.x-2),top=Math.min(view.y,bounds.y-2);
  const right=Math.max(view.x+view.width,bounds.x+bounds.width+2),bottom=Math.max(view.y+view.height,bounds.y+bounds.height+2);
  svg.setAttribute('viewBox',`${left} ${top} ${right-left} ${bottom-top}`);
  applyElementGuide(svg, { enabled: _elementGuide && _tab === 'annot' && (!_traceController || _traceController.getState().mode === 'graph'), series: _series, annotations: _cfg.graphAnnotations, focusSelector: _guideFocusSelector });
  _traceController?.attachAfterBBox(svg, plane);
  syncDisplayProperties(_overlay);
  _numberFields?.format();
  const active = document.activeElement;
  _draftHistory?.record(active?.matches('input,textarea') ? active : null);
}

// 미리보기 화면좌표 → 월드 좌표(스냅 없음). 축 라벨 드래그용.
function clientToWorld(cx, cy) {
  if (!_previewSvg || !_previewSvg.getScreenCTM) return null;
  const ctm = _previewSvg.getScreenCTM();
  if (!ctm) return null;
  const pt = _previewSvg.createSVGPoint();
  pt.x = cx; pt.y = cy;
  return _traceController?.toGraphPoint(pt.matrixTransform(ctm.inverse())) || pt.matrixTransform(ctm.inverse());
}

// 미리보기 좌표 → 수학 좌표(반 칸 스냅). 데이터가 정의역을 '적당히' 벗어날 수 있도록
// 정수 칸이 아니라 박스 전체 범위(xMin..xMax, 즉 마지막 눈금 + 여백까지)로 클램프한다.
function clientToMath(cx, cy) {
  if (!_previewSvg || !_previewSvg.getScreenCTM) return null;
  const ctm = _previewSvg.getScreenCTM();
  if (!ctm) return null;
  const pt = _previewSvg.createSVGPoint();
  pt.x = cx; pt.y = cy;
  const w = _traceController?.toGraphPoint(pt.matrixTransform(ctm.inverse())) || pt.matrixTransform(ctm.inverse());
  // 선택 계열이 오른쪽 축(y2)을 읽으면 그 스케일로 환산한다(찍은 점이 오른쪽 눈금을 따르도록).
  // 선택이 없거나 왼쪽 축이면 _previewPlane 그대로 — 기존 동작과 동일.
  const cp = planeForSeries(_series[_sel], _previewPlane) || _previewPlane;
  const m = mathFromWorld(cp, w.x, w.y);
  // 스냅 간격을 더 촘촘하게(칸의 1/8 = 종전 1/4의 2배) — 원하는 점을 정확히 지나게(요구).
  const sx = (cp.gridStepX || 1) / 8, sy = (cp.gridStepY || 1) / 8;
  const tracing = !!_traceController?.getState().reference;
  const nx = tracing ? m.x : Math.round(m.x / sx) * sx, ny = tracing ? m.y : Math.round(m.y / sy) * sy;
  // 클램프는 '평면 박스'까지만 한다(요구). 격자 끝에서 막으면 정의역·치역이 격자에 갇힌 것처럼
  // 보여, 손으로 찍은 점·자유곡선이 마지막 눈금 밖으로 나가질 못한다.
  const pb = plotBounds(cp);
  return {
    x: Math.max(pb.xMin, Math.min(pb.xMax, nx)),
    y: Math.max(pb.yMin, Math.min(pb.yMax, ny)),
  };
}

/* ---------- 계열 칩 + 편집 패널 ---------- */
function seriesLabel(s) {
  if (s.kind === "bar") {
    const n = (s.items || []).filter((it) => it && Number.isFinite(it.value)).length;
    const names = (s.items || []).map((it) => it.label).filter(Boolean).join(",");
    return names ? `막대 ${names}` : `막대 ${n}개`;
  }
  if (s.kind === "expr") return "y=" + (String(s.expr || "").trim() || "…");
  const kind = (s.curveStyle === "smooth") ? "자유곡선" : "꺾은선";   // 하위 탭 타입에 맞춘 이름
  return (s.endLabel ? s.endLabel + " " : "") + `${kind} ${s.pts.length}점`;
}

let _seriesNames = new WeakMap(), _seriesNameCount = 0;
function seriesName(s) {
  const label = s.endLabel || s.reconstruction?.original?.label || s.label;
  if (label) return label;
  if (!_seriesNames.has(s)) _seriesNames.set(s, `계열 ${++_seriesNameCount}`);
  return _seriesNames.get(s);
}
function selectSeries(index) {
  flushEditorInput();
  rememberInvalidSeries();
  _sel = index; _placeMode = null; _activeDraw = -1;
  _boxMode = false; _areaMode = false;
  setTab('func'); renderChips(); syncSeriesEditor(); refreshPreview();
}
function flushEditorInput() {
  const input=document.activeElement;
  if (input?.matches('input,textarea,select') && input.closest('#graph-modal-overlay')) input.blur();
}
function rememberInvalidSeries() {
  const series = _series[_sel]; if (!series) return;
  const drafts = new Map();
  for (const input of _overlay.querySelectorAll('#gm-series-editor input[id],#gm-series-editor textarea[id],#gm-series-editor select[id]')) {
    if (!input.validity.valid) drafts.set(input.id,{value:input.value,message:input.validationMessage});
  }
  _seriesInputDrafts.set(series,drafts);
}
function handleGraphEscape() {
  if (_traceController?.isInteracting()) { _traceController.cancelInteraction(); return; }
  if (_helpPop) { const trigger = _helpForEl; closeHelpPopover(); trigger?.focus(); return; }
  if (_regionPointer?.host.hasPointerCapture(_regionPointer.id)) {
    _engineControls.cancelRegionDrag(); _regionPointer = null; return;
  }
  if (_cancelPreviewDrag) { _cancelPreviewDrag(); return; }
  if (_annMode || _annPending || _placeMode || _activeDraw !== -1 || _boxMode || _areaMode) {
    _annMode = null; _annPending = null; _placeMode = null; _activeDraw = -1; _boxMode = false; _areaMode = false;
    syncAnnLists(); syncSeriesEditor(); refreshPreview(); return;
  }
  const detail = document.activeElement?.closest('details[open]');
  if (detail) { detail.open = false; detail.querySelector('summary')?.focus(); return; }
  if (_els.advPanel && !_els.advPanel.hidden) {
    _els.advPanel.hidden = true; _els.advOpen.setAttribute('aria-expanded','false'); _els.advCaret.textContent = '▾'; _els.advOpen.focus(); return;
  }
  hide();
}
function renderChips() {
  const host = _els.chips;
  host.replaceChildren();
  _series.forEach((s, i) => {
    const item = document.createElement('div'); item.className = 'gm-series-item';
    item.style.setProperty('--gm-element-color', seriesGuideColor(s, i));
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = 'gm-series-chip'; chip.dataset.seriesIndex = String(i);
    chip.setAttribute('aria-pressed', String(i === _sel));
    chip.setAttribute('aria-controls', 'gm-series-editor');
    chip.setAttribute('aria-label', `${seriesName(s)} · ${seriesLabel(s)} 선택`);
    const swatch = document.createElementNS(SVG_NS, 'svg');
    swatch.setAttribute('class', 'gm-series-swatch'); swatch.setAttribute('viewBox', '0 0 36 12');
    swatch.setAttribute('aria-hidden', 'true');
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', '1'); line.setAttribute('x2', '35'); line.setAttribute('y1', '6'); line.setAttribute('y2', '6');
    line.setAttribute('stroke', 'currentColor'); line.setAttribute('stroke-width', '1.5');
    const dash = s.dashPattern || s.customDash || (LINE_STYLES[s.styleIdx] || LINE_STYLES[0]).slice(1,3);
    if (dash.some(v => v > 0)) line.setAttribute('stroke-dasharray', dash.map(v=>v*3).join(' '));
    swatch.append(line); chip.append(swatch);
    const lbl = document.createElement("span");
    lbl.className = 'gm-series-name'; lbl.textContent = seriesName(s);
    chip.appendChild(lbl);
    const kind = document.createElement('span'); kind.className = 'gm-series-kind';
    kind.textContent = ({expr:'함수식',poly:'직선·꺾은선',free:'자유곡선',bar:'막대그래프'})[funcTabOf(s)];
    chip.append(kind); chip.title = seriesLabel(s);
    chip.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      selectSeries(i);
      _els.chips.querySelector(`[data-series-index="${i}"]`)?.focus({preventScroll:true});
    });
    chip.addEventListener("click", () => selectSeries(i));
    const remove = document.createElement('button'); remove.type = 'button';
    remove.className = 'gm-series-remove'; remove.dataset.deleteSeries = String(i);
    remove.setAttribute('aria-label', `${seriesName(s)} 삭제`); remove.title = `${seriesName(s)} 삭제`;
    remove.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    remove.addEventListener('mousedown', e => e.stopPropagation());
    remove.addEventListener('click', e => { e.stopPropagation(); deleteSeries(i); });
    item.append(chip, remove); host.appendChild(item);
  });
}

function deleteSeries(index) {
  flushEditorInput();
  const series = _series[index]; if (!series) return;
  const ids = new Set([series.objectId, series.reconstruction?.seriesId].filter(Boolean));
  // Preserve visible annotations at their last contact; deleting the function
  // must not leave references to an absent curve or silently erase labels.
  if (_previewPlane) {
    const plane = { ..._previewPlane, graphAnnotations: _cfg.graphAnnotations || [] };
    const prepared = prepareSeries(plane);
    if (prepared.ok) rebindGraphAnnotations(plane, prepared.list);
  }
  for (const annotation of _cfg.graphAnnotations || []) if (ids.has(annotation.seriesId)) {
    for (const key of ['seriesId', 'pointIndex', 'curveAnchor', 'anchorX']) delete annotation[key];
  }
  _series.splice(index, 1);
  _sel = _series.length ? Math.min(index, _series.length - 1) : -1;
  _placeMode = null; _activeDraw = -1;
  renderChips(); syncSeriesEditor(); refreshPreview();
  if (_sel >= 0) _els.chips.querySelector(`[data-series-index="${_sel}"]`)?.focus({ preventScroll: true });
  else _overlay.querySelector('#gm-add-series')?.focus({ preventScroll: true });
}

function addSeries(s) {
  _series.push(s);
  _sel = _series.length - 1;
  _placeMode = null;
  _activeDraw = s.kind === "points" ? _sel : -1;   // 점 계열은 추가 즉시 '그리기 모드'
  renderChips(); syncSeriesEditor(); refreshPreview();
}

/* ---------- 그래프 요소 목록(칩) + 방향 버튼 동기화 ---------- */
// 칩 라벨: 이제 (x, y) 두 좌표를 다 보여준다. 구버전 파일의 숫자 스펙은 x만 표시.
// 라벨러 표시점(요구 ⑥): 찍은 개수 기준 base-26 문자열(A..Z, AA..AZ, BA..). 인덱스는 0부터.
function nextLabelLetter(count) {
  let s = "", n = count;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}
function chipLabel(spec) {
  const r = (v) => { const n = Math.round(v * 100) / 100; return Object.is(n, -0) ? "0" : String(n); };
  if (typeof spec === "number") return `x=${r(spec)}`;
  if (!spec || !Number.isFinite(spec.x)) return "?";
  return Number.isFinite(spec.y) ? `(${r(spec.x)}, ${r(spec.y)})` : `x=${r(spec.x)}`;
}
function elemChip(text, onDel) {
  const chip = document.createElement("span");
  chip.style.cssText = "display:inline-flex;align-items:center;gap:4px;font: 11px monospace;border:1px solid var(--border);border-radius:4px;padding:1px 6px;background:var(--bg-input);color:var(--text-primary);";
  const t = document.createElement("span"); t.textContent = text; chip.appendChild(t);
  const x = document.createElement("span"); x.textContent = "×";
  x.style.cssText = "color:#e5534b;font-weight:700;cursor:pointer;";
  x.addEventListener("click", onDel); chip.appendChild(x);
  return chip;
}
function syncElementLists() {
  const row = _overlay?.querySelector('#gm-series-arrow-row'), list = _overlay?.querySelector('#gm-series-arrow-list');
  if (list) {
    const s = _series[_sel]; list.replaceChildren();
    (s?.arrows || []).forEach((a,i) => {
      const label = Number.isInteger(a.segmentIndex) ? `구간 ${a.segmentIndex+1}` : chipLabel(a);
      const chip = elemChip(`${label} ${a.dir < 0 ? '←' : '→'}`, () => {s.arrows.splice(i,1);syncElementLists();refreshPreview();});
      chip.firstChild.title = '누르면 방향 전환'; chip.firstChild.style.cursor='pointer';
      chip.firstChild.addEventListener('click',()=>{a.dir=a.dir<0?1:-1;syncElementLists();refreshPreview();});
      const sizeLabel = document.createElement('label'); sizeLabel.textContent='화살촉 길이(mm) ';
      const input = document.createElement('input'); input.type='number';input.step='any';input.min='0';input.style.width='65px';input.setAttribute('aria-label',`화살촉 ${i+1} 길이(mm)`);
      if (!_arrowInputIds.has(a)) _arrowInputIds.set(a, `gm-series-arrow-size-${++_arrowInputSerial}`);
      input.id = _arrowInputIds.get(a);
      input.value=(a.strokeWidth ?? ARROW_SW)*4.5;
      const validate = () => {const v=Number(input.value);if(!input.value.trim() || !Number.isFinite(v) || v<=0){input.setCustomValidity('화살촉 길이는 0보다 큰 수여야 합니다.');return false;}input.setCustomValidity('');return true;};
      input.addEventListener('input', validate);
      input.addEventListener('change',()=>{if(!validate())return;a.strokeWidth=Number(input.value)/4.5;refreshPreview();});
      sizeLabel.appendChild(input);chip.appendChild(sizeLabel);list.appendChild(chip);
    });
    row.hidden = !list.children.length;
  }
  // 그래프 요소 UI는 '표시' 탭으로 이관돼 함수 탭에서 제거됐다 — 관련 엘리먼트가 없으면 no-op.
  if (!_els || !_els.markerList) return;
  const s = _series[_sel] || null;
  _els.markerList.replaceChildren();
  _els.guideList.replaceChildren();
  _els.arrowList.replaceChildren();
  if (s) {
    (s.markers || []).forEach((spec, i) => _els.markerList.appendChild(
      elemChip(chipLabel(spec), () => { s.markers.splice(i, 1); syncElementLists(); refreshPreview(); })));
    (s.guides || []).forEach((spec, i) => _els.guideList.appendChild(
      elemChip(chipLabel(spec), () => { s.guides.splice(i, 1); syncElementLists(); refreshPreview(); })));
    (s.arrows || []).forEach((a, i) => {
      const dirSym = a.dir < 0 ? "←" : "→";
      const chip = elemChip(`${chipLabel(a)} ${dirSym}`, () => { s.arrows.splice(i, 1); syncElementLists(); refreshPreview(); });
      // 좌표(라벨, ×제외)를 누르면 방향 전환(요구).
      const lbl = chip.firstChild;
      lbl.style.cursor = "pointer"; lbl.title = "누르면 방향 전환";
      lbl.addEventListener("click", () => { a.dir = a.dir < 0 ? 1 : -1; syncElementLists(); refreshPreview(); });
      _els.arrowList.appendChild(chip);
    });
  }
  // 클릭 배치 버튼 활성 표시(표시점/수선/화살표 동일 위계).
  // 버튼이 곧 스위치이므로 켜짐을 클래스로 표시한다(인라인 style 대신 — 테마와 함께 간다).
  const arm = (btn, on) => btn.classList.toggle("on", on);
  arm(_els.markerClick, _placeMode === "marker");
  arm(_els.guideClick, _placeMode === "guide");
  arm(_els.arrowClick, _placeMode === "arrow");
  // 사용법은 켜져 있을 때만 나온다(DESIGN 13-3) — 늘 떠 있으면 배경이 되어 안 읽힌다.
  const NOTE = {
    marker: "미리보기에서 곡선 위를 클릭하면 그 자리에 점이 생깁니다.",
    guide: "미리보기에서 곡선 위를 클릭하면 그 점에서 두 축까지 점선이 생깁니다.",
    arrow: "미리보기에서 곡선 위를 클릭하면 그 자리에 화살촉이 놓입니다. 칩의 좌표를 누르면 방향이 바뀝니다.",
  };
  if (_els.elemNote) {
    _els.elemNote.textContent = NOTE[_placeMode] || "";
    _els.elemNote.hidden = !NOTE[_placeMode];
  }
  // 찍은 것이 없는 칩 행은 감춘다 — 빈 줄이 세 개 떠 있을 이유가 없다.
  [[_els.markerRow, _els.markerList], [_els.guideRow, _els.guideList], [_els.arrowRow, _els.arrowList]]
    .forEach(([row, list]) => { if (row && list) row.hidden = list.children.length === 0; });
}

/* ---------- ③ 표시 탭: 칩 목록 + 도구 활성 + 범례 에디터(요구) ---------- */
// 범례 선 견본 스타일(dash = [on,off] world mm, null=실선).
const LEG_DASH = [
  { key: "solid", label: "실선", dash: null },
  { key: "dash", label: "파선", dash: [1.5, 1.0] },
  { key: "dot", label: "점선", dash: [0.5, 0.7] },
];
let _displaySelection = null;
const DISPLAY_ARRAYS = {marker:'annMarkers',guide:'annGuides',arrow:'annArrows',guideline:'guideLines',labelpt:'annLabelPoints',legend:'legends'};
function selectDisplay(kind, spec) {
  flushEditorInput();
  _displaySelection = spec ? {kind,spec} : null;
  _selectedAnnotationId = kind === 'annotation' ? spec?.id || null : null;
  _lpSel = kind === 'labelpt' ? (_cfg.annLabelPoints || []).indexOf(spec) : -1;
  _annMode = null; _annPending = null;
  _engineControls?.selectRegion(kind === 'region' ? spec : null);
  if (_tab !== 'annot') setTab('annot');
  syncAnnLists(); syncTypedAnnotations(true); refreshPreview();
}
function legDashKey(d) {
  if (!Array.isArray(d)) return "solid";
  const hit = LEG_DASH.find((o) => Array.isArray(o.dash) && o.dash[0] === d[0] && o.dash[1] === d[1]);
  return hit ? hit.key : "dash";
}
function syncAnnLists() {
  if (!_els || !_els.annMarkerList) return;
  const properties = _overlay.querySelector('#gm-legacy-properties'); properties.replaceChildren();
  const fmt = (p) => `(${(+p.x).toFixed(1)}, ${(+p.y).toFixed(1)})`;
  const fill = (list, row, arr, label, kind, name) => {
    list.replaceChildren();
    (arr || []).forEach((it, i) => {
      const entry = document.createElement('div'); entry.className = 'gm-display-item';
      const selected = _displaySelection?.kind === kind && _displaySelection.spec === it;
      const title = document.createElement('button'); title.type = 'button'; title.className = 'gm-display-select';
      title.textContent = `${name} ${i+1} · ${label(it)}`;
      title.setAttribute('aria-pressed', String(selected)); title.setAttribute('aria-expanded', String(selected));
      title.dataset.displayKind = kind; title.dataset.displayIndex = String(i);
      title.onclick = () => { selectDisplay(kind, it); _overlay.querySelector(`[data-display-kind="${kind}"][data-display-index="${i}"]`)?.focus({preventScroll:true}); };
      title.onmousedown=e=>{e.preventDefault();e.stopPropagation();title.onclick();};
      entry.style.setProperty('--gm-element-color', annotationGuideColor({kind: ['labelpt','legend'].includes(kind) ? 'text' : ['guide','guideline','arrow'].includes(kind) ? 'guide' : 'point'}));
      appendDisplayHeading(entry, title, `${name} ${i+1}`, () => { arr.splice(i,1); _displaySelection = null; _lpSel=-1; syncAnnLists(); refreshPreview(); });
      if (selected) {
        const editor = document.createElement('div'); editor.className = 'gm-annotation-editor'; editor.dataset.displayKind=kind; editor.dataset.displayIndex=String(i);
        if (!['labelpt','legend'].includes(kind)) {
          const detail = document.createElement('details'); detail.className = 'gm-detail';
          const summary = document.createElement('summary'); summary.textContent = '정확한 위치 · 끝점'; detail.append(summary);
          const fields = document.createElement('div'); fields.className = 'gm-annotation-positions'; detail.append(fields);
          const keys = kind === 'guideline' ? ['x1','y1','x2','y2'] : ['x','y',...('tx' in it ? ['tx','ty'] : [])];
          for (const key of keys) {
            const label = document.createElement('label'); label.textContent = key;
            const input = document.createElement('input'); input.type = 'number'; input.step = 'any'; input.className = 'gm-num';
            input.setAttribute('aria-label', `${name} ${i+1} ${key}`); input.value = it[key];
            input.onchange = () => {
              if (!input.value.trim() || !Number.isFinite(Number(input.value))) { input.setCustomValidity('유효한 좌표를 입력하세요.'); return; }
              input.setCustomValidity(''); it[key] = Number(input.value); refreshPreview();
            };
            label.append(input); fields.append(label);
          }
          if (kind === 'arrow') {
            const reverse = document.createElement('button'); reverse.type = 'button'; reverse.className = 'modal-btn'; reverse.textContent = '방향 뒤집기';
            reverse.onclick = () => {
              if (Number.isFinite(it.dx) && Number.isFinite(it.dy)) { it.dx = -it.dx; it.dy = -it.dy; }
              else { it.tx = 2*it.x-it.tx; it.ty = 2*it.y-it.ty; }
              refreshPreview();
            }; editor.append(reverse);
          }
          editor.append(detail);
          if (kind==='guide' || kind==='guideline') {
            const appearance=document.createElement('details');appearance.className='gm-detail';
            const summary=document.createElement('summary');summary.textContent='점선 모양 개별 조정';appearance.append(summary);
            const fields=document.createElement('div');fields.className='gm-annotation-positions';appearance.append(fields);
            const style=isExamStyle(_previewPlane)?examMetrics(_previewPlane):null;
            for(const [key,label] of [['strokeWidth','선 굵기(mm)'],['dashLength','점선 조각 길이(mm)'],['dashGap','점선 간격(mm)']]) {
              const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.className='gm-num';input.type='number';input.step='any';input.min=key==='strokeWidth'?'0.01':'0';input.setAttribute('aria-label',`${name} ${i+1} ${label}`);
              input.value=it[key]??(style?(key==='strokeWidth'?style.guide:key==='dashLength'?style.dash:style.gap):(_cfg.guideStyle?.[key]??(key==='strokeWidth'?.15:key==='dashLength'?.8:.6)));
              input.onchange=()=>{const v=Number(input.value);if(!input.value.trim()||!Number.isFinite(v)||(key==='strokeWidth'?v<=0:v<0)){input.setCustomValidity('유효한 점선 크기를 입력하세요.');return;}input.setCustomValidity('');it[key]=v;it.customStyle=true;it.customStyleWidth=_previewPlane.w;refreshPreview();};wrap.append(input);fields.append(wrap);
            }
            editor.append(appearance);
          }
        } else editor.append(kind === 'labelpt' ? _els.annLabelPtEditor : _els.annLegendEditor);
        properties.append(editor);
      }
      list.append(entry);
    });
    list.hidden = !list.children.length;
    if (row) row.hidden = true;
  };
  fill(_els.annMarkerList, _els.annMarkerRow, _cfg.annMarkers, fmt, 'marker', '표시점');
  fill(_els.annGuideList, _els.annGuideRow, _cfg.annGuides, fmt, 'guide', '수선의 발');
  fill(_els.annArrowList, _els.annArrowRow, _cfg.annArrows, (a) => fmt(a) + " →", 'arrow', '화살표');
  fill(_els.annGuidelineList, _els.annGuidelineRow, _cfg.guideLines,
    (g) => `(${(+g.x1).toFixed(1)},${(+g.y1).toFixed(1)})–(${(+g.x2).toFixed(1)},${(+g.y2).toFixed(1)})`, 'guideline', '가이드라인');
  fill(_els.annLabelPtList, _els.annLabelPtRow, _cfg.annLabelPoints,
    (lp) => `${lp.text ?? "?"} ${fmt(lp)}`, 'labelpt', '라벨러 표시점');
  fill(_overlay.querySelector('#gm-legend-list'), null, _cfg.legends,
    lg => (lg.rows || []).map(r=>r.text).filter(Boolean).join(' · ') || '선 견본', 'legend', '범례');
  renderLabelPtEditor();
  const arm = (btn, on) => btn && btn.classList.toggle("on", on);
  const selectTool=_overlay.querySelector('#gm-ann-select'), selecting=!_annMode && !_placeMode && _activeDraw===-1 && !_boxMode && !_areaMode;
  arm(selectTool,selecting);selectTool.setAttribute('aria-pressed',String(selecting));
  arm(_els.annMarker, _annMode === "marker");
  arm(_els.annGuide, _annMode === "guide");
  arm(_els.annArrow, _annMode === "arrow");
  arm(_els.annGuideline, _annMode === "guideline");
  arm(_els.annLabelPt, _annMode === "labelpt");
  arm(_overlay.querySelector('#gm-add-annotation'), _annMode === 'text');
  arm(_overlay.querySelector('#gm-ann-leader'), _annMode === 'leader');
  arm(_overlay.querySelector('#gm-ann-single-guide'), _annMode === 'single-guide');
  const H = {
    text: '미리보기를 클릭해 글자를 놓고 아래에서 내용을 바꿉니다.',
    leader: '시작과 끝을 차례로 클릭해 지시선을 놓습니다.',
    'single-guide': '미리보기를 클릭해 보조선을 놓고 가로·세로 방향을 선택합니다.',
    marker: "미리보기를 클릭해 표시점을 찍습니다.",
    guide: "미리보기를 클릭하면 그 점에서 두 축까지 점선(수선의 발)이 생깁니다.",
    arrow: "함수(곡선) 위를 클릭하면 그 자리에 접선 방향으로 화살촉이 놓입니다. 함수가 없으면 놓이지 않습니다.",
    guideline: "두 점을 클릭하면 그 사이에 안내 점선이 생깁니다.",
    labelpt: "미리보기를 클릭해 A·B·C… 순서로 표시점을 찍습니다. 찍은 점이 바로 선택되니 PageUp/PageDown으로 라벨 방향을 15°씩 돌리세요. 거리·글씨는 아래에서 조정합니다.",
  };
  _els.annHint.textContent = _annMode
    ? (_annPending ? "한 번 더 클릭해 끝점을 지정하세요." : H[_annMode])
    : "글자나 표시 요소를 눌러 선택하고 드래그해 이동합니다. 추가하려면 배치 도구를 고르세요.";
  renderLegendEditor();
  syncTypedAnnotations();
}
// 선택된 라벨러 표시점의 각도를 d(°)만큼 돌린다. PageUp/Down(전역·각도칸 공용) 진입점.
// 각도 칸이 화면에 있으면 값도 함께 갱신한다(에디터 전체를 다시 그리면 포커스가 날아간다).
function rotateSelLabelPt(d) {
  const lp = (_cfg.annLabelPoints || [])[_lpSel];
  if (!lp) return false;
  lp.angle = (Number.isFinite(lp.angle) ? lp.angle : 45) + d;
  const inp = _els.annLabelPtEditor && _els.annLabelPtEditor.querySelector(`[data-lp-angle="${_lpSel}"]`);
  if (inp) inp.value = Math.round(lp.angle);
  refreshPreview();
  return true;
}

// 라벨러 표시점 에디터(요구 ⑥): 점마다 텍스트·거리(mm)·각도(°, PageUp/Down 15°씩)·글씨크기(pt).
// 줄을 누르면 그 점이 '선택'된다(찍은 직후엔 자동 선택) — 선택된 점은 PageUp/Down으로 회전.
function renderLabelPtEditor() {
  const host = _els.annLabelPtEditor;
  if (!host) return;
  host.replaceChildren();
  const list = _cfg.annLabelPoints || [];
  if (_lpSel >= list.length) _lpSel = list.length - 1;   // 삭제로 인덱스가 밀린 경우 보정
  // 선택 표시는 '다시 그리기' 없이 스타일만 갈아끼운다 — 입력칸을 누르는 순간 DOM을 새로
  // 만들면 그 클릭이 사라진 요소로 가 포커스가 안 잡힌다.
  const rows = [];
  const paintSel = () => rows.forEach((r, i) => {
    r.style.background = i === _lpSel ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent";
    r.style.boxShadow = i === _lpSel ? "inset 2px 0 0 var(--accent)" : "none";
  });
  list.forEach((lp, i) => {
    if (_displaySelection?.kind !== 'labelpt' || _displaySelection.spec !== lp) return;
    const row = document.createElement("div");
    rows.push(row);
    row.style.cssText = "display:flex;gap:5px;align-items:center;margin:0;flex-wrap:wrap;"
      + "padding:3px 6px;border-radius:6px;cursor:pointer;";
    // 줄 아무 데나 누르면 그 점이 선택된다(입력칸을 누른 경우 포함) — 그다음 PageUp/Down이 이 점을 돌린다.
    row.addEventListener("mousedown", () => { if (_lpSel !== i) { _lpSel = i; paintSel(); refreshPreview(); } });
    const txt = document.createElement("input"); txt.type = "text"; txt.value = lp.text ?? "";
    txt.style.cssText = "width:44px;font-family:monospace;font-size: 12px;text-align:center;";
    txt.addEventListener("input", () => { lp.text = txt.value; refreshPreview(); });

    const numField = (label, val, step, min, onSet) => {
      const wrap = document.createElement("span");
      wrap.style.cssText = "display:flex;align-items:center;gap:3px;font-size: 11px;color:var(--text-secondary);";
      const lb = document.createElement("span"); lb.textContent = label;
      const inp = document.createElement("input"); inp.type = "number"; inp.step = String(step);
      if (min != null) inp.min = String(min);
      inp.value = val;
      inp.style.cssText = "width:56px;font-size: 11px;padding:2px 4px;background:var(--bg-input);color:inherit;border:1px solid var(--border);border-radius:4px;";
      inp.addEventListener("input", () => { onSet(parseFloat(inp.value)); refreshPreview(); });
      wrap.append(lb, inp);
      return { wrap, inp };
    };

    const distF = numField("거리(mm)", (Number.isFinite(lp.dist) ? lp.dist : 5).toFixed(1), 0.5, 0,
      (v) => { lp.dist = Number.isFinite(v) && v >= 0 ? v : lp.dist; });
    const angleF = numField("각도(°)", Math.round(Number.isFinite(lp.angle) ? lp.angle : 45), 15, null,
      (v) => { lp.angle = Number.isFinite(v) ? v : lp.angle; });
    angleF.inp.setAttribute("data-lp-angle", String(i));   // 전역 PageUp/Down이 값을 갱신할 대상
    // 요구: PageUp/PageDown으로 15°씩 회전 — 각도 칸에 포커스가 있을 때도 같은 동작.
    angleF.inp.addEventListener("keydown", (e) => {
      if (e.key !== "PageUp" && e.key !== "PageDown") return;
      e.preventDefault(); e.stopPropagation();   // 전역 핸들러와 이중 적용 방지
      _lpSel = i; paintSel();
      rotateSelLabelPt(e.key === "PageUp" ? 15 : -15);
    });
    const sizeF = numField("글씨(pt)", Math.round(mmToPt(Number.isFinite(lp.size) ? lp.size : ptToMm(15))), 1, 4,
      (v) => { lp.size = Number.isFinite(v) && v > 0 ? ptToMm(v) : lp.size; });


    row.append(txt, distF.wrap, angleF.wrap, sizeF.wrap);
    host.appendChild(row);
  });
  paintSel();
}

function renderLegendEditor() {
  const host = _els.annLegendEditor;
  if (!host) return;
  host.replaceChildren();
  const miniBtn = "font-size: 11px;padding:2px 7px;border:1px solid var(--border);border-radius:5px;background:var(--bg-input);color:inherit;cursor:pointer;";
  (_cfg.legends || []).forEach((lg, li) => {
    if (_displaySelection?.kind !== 'legend' || _displaySelection.spec !== lg) return;
    const box = document.createElement("div");
    box.style.cssText = "border:1px solid var(--border);border-radius:6px;padding:8px;margin:0;";
    const head = document.createElement("div");
    head.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;";
    const ttl = document.createElement("b"); ttl.style.fontSize = "12px"; ttl.textContent = `범례 ${li + 1}`;

    head.append(ttl); box.appendChild(head);
    // 글씨 크기·실 길이 조정(요구 3). 값이 없으면 렌더러 기본(2.2 / size*2.4)을 쓴다.
    const sizeRow = document.createElement("div");
    sizeRow.style.cssText = "display:flex;gap:8px;margin-bottom:6px;align-items:center;font-size: 11px;color:var(--text-secondary);";
    const numField = (label, val, dflt, on) => {
      const wrap = document.createElement("span");
      wrap.style.cssText = "display:flex;align-items:center;gap:3px;";
      const lb = document.createElement("span"); lb.textContent = label;
      const inp = document.createElement("input"); inp.type = "number"; inp.step = "any"; inp.min = "0.01";
      inp.value = Number.isFinite(val) ? val : dflt;
      inp.style.cssText = "width:48px;font-size: 11px;padding:2px 4px;background:var(--bg-input);color:inherit;border:1px solid var(--border);border-radius:4px;";
      inp.addEventListener("input", () => { const n = parseFloat(inp.value); on(Number.isFinite(n) && n > 0 ? n : undefined); refreshPreview(); });
      wrap.append(lb, inp); return wrap;
    };
    sizeRow.append(
      numField("글씨", lg.size, 2.2, (v) => { lg.size = v; }),
      numField("실 길이", lg.swatch, 5.3, (v) => { lg.swatch = v; }),
    );
    box.appendChild(sizeRow);
    (lg.rows || []).forEach((r, ri) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:4px;margin-bottom:4px;align-items:center;";
      const sel = document.createElement("select");
      sel.style.cssText = "font-size: 11px;flex:0 0 62px;";
      LEG_DASH.forEach((o) => { const op = document.createElement("option"); op.value = o.key; op.textContent = o.label; sel.appendChild(op); });
      sel.value = legDashKey(r.dash);
      sel.addEventListener("change", () => { r.dash = (LEG_DASH.find((o) => o.key === sel.value) || {}).dash || null; refreshPreview(); });
      const marker = document.createElement('select');
      marker.setAttribute('aria-label', `범례 ${li + 1} 줄 ${ri + 1} 점 모양`);
      for (const [value, text] of [['none','점 없음'],['circle','●'],['open-circle','○'],['cross','×'],['plus','＋'],['square','■']]) { const option = document.createElement('option'); option.value = value; option.textContent = text; marker.append(option); }
      marker.value = r.markerShape || 'none';
      marker.onchange = () => { r.markerShape = marker.value; refreshPreview(); };
      const line = document.createElement('input'); line.type = 'checkbox'; line.checked = r.lineVisible !== false;
      line.setAttribute('aria-label', `범례 ${li + 1} 줄 ${ri + 1} 선 표시`);
      line.onchange = () => { r.lineVisible = line.checked; refreshPreview(); };
      const markerSize = document.createElement('input'); markerSize.type = 'number'; markerSize.step = 'any'; markerSize.min = '0.01'; markerSize.style.width = '48px';
      markerSize.value = r.markerSize ?? (lg.size || 2.2) * .25;
      markerSize.setAttribute('aria-label', `범례 ${li + 1} 줄 ${ri + 1} 점 반지름(mm)`);
      markerSize.onchange = () => { const value = Number(markerSize.value); if (!markerSize.value.trim() || !Number.isFinite(value) || value <= 0) { markerSize.setCustomValidity('0보다 큰 크기를 입력하세요.'); return; } markerSize.setCustomValidity(''); r.markerSize = value; refreshPreview(); };
      const inp = document.createElement("input"); inp.type = "text"; inp.value = r.text || "";
      inp.placeholder = "예: y=f(x)"; inp.style.cssText = "flex:1;min-width:0;font-family:monospace;font-size: 12px;";
      inp.addEventListener("input", () => { r.text = inp.value; refreshPreview(); });
      const rm = document.createElement("button"); rm.type = "button"; rm.textContent = "×"; rm.style.cssText = miniBtn;
      rm.addEventListener("click", () => {
        lg.rows.splice(ri, 1);
        if (!lg.rows.length) _cfg.legends.splice(li, 1);
        syncAnnLists(); refreshPreview();
      });
      row.append(sel, line, marker, markerSize, inp, rm); box.appendChild(row);
    });
    const addRow = document.createElement("button"); addRow.type = "button"; addRow.textContent = "+ 줄 추가"; addRow.style.cssText = miniBtn;
    addRow.addEventListener("click", () => { (lg.rows = lg.rows || []).push({ dash: null, text: "" }); syncAnnLists(); refreshPreview(); });
    box.appendChild(addRow);
    host.appendChild(box);
  });
}

// 좌표 텍스트("0,0 1,2 3,2") ↔ pts[] 변환.
function ptsToText(pts) { return pts.map((p) => `${roundedGraphNumber(p.x)},${roundedGraphNumber(p.y)}`).join(" "); }
function textToPts(text) {
  const out = [];
  for (const tok of String(text || "").trim().split(/\s+/)) {
    if (!tok) continue;
    const m = tok.split(",");
    const x = Number(m[0]), y = Number(m[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
  }
  return out;
}

// 선택 계열 → 편집 패널 값 동기화(+kind별 행 표시 전환).
function syncSeriesEditor() {
  _overlay.querySelectorAll('#gm-series-editor input,#gm-series-editor textarea,#gm-series-editor select').forEach(input=>input.setCustomValidity(''));
  _engineControls?.sync();
  const s = _series[_sel] || null;
  _els.editor.style.display = s ? "" : "none";
  _els.emptyHint.style.display = s ? "none" : "";
  if (!s) return;
  _overlay.querySelector('#gm-series-title').textContent = `${seriesName(s)} · ${seriesLabel(s)}`;
  _els.exprRow.style.display = s.kind === "expr" ? "" : "none";
  _els.exprHelpers.style.display = s.kind === "expr" ? "flex" : "none";
  _els.domainRow.style.display = s.kind === "expr" ? "" : "none";
  _els.rangeRow.style.display = s.kind === "expr" ? "" : "none";
  _els.ptsRows.style.display = s.kind === "points" ? "" : "none";
  // 막대그래프 전용 행. 막대는 선이 아니므로 선 종류·모양·끝 라벨·이동은 의미가 없다.
  _els.barRows.style.display = s.kind === "bar" ? "" : "none";
  // 자동 연장선: 직선·꺾은선(점 계열)에만 의미 있음(눈대중 그리기). 끝 라벨과 한 줄(요구 8).
  _els.autoExtRow.style.display = s.kind === "points" ? "inline-flex" : "none";
  _els.autoExt.checked = !!s.autoExtend;
  _els.move.checked = !!s.movable;
  // 읽는 축: 오른쪽 축이 켜져 있을 때만 고르게 한다(꺼져 있으면 선택지가 하나뿐이라 무의미).
  const y2Avail = !!(_cfg && _cfg.y2On);
  _els.axisRow.style.display = y2Avail ? "" : "none";
  if (y2Avail) {
    const ax = s.axis === "y2" ? "y2" : "y";
    [..._els.axisSeg.children].forEach((b) => {
      const on = b._axis === ax;
      b.style.background = on ? "color-mix(in srgb, var(--accent) 22%, var(--bg-input))" : "var(--bg-input)";
      b.style.borderColor = on ? "var(--accent)" : "var(--border)";
    });
  }
  if (s.kind === "bar") {
    if (document.activeElement !== _els.barValues) _els.barValues.value = barValuesText(s);
    if (document.activeElement !== _els.barLabels) _els.barLabels.value = barLabelsText(s);
    _els.barWidth.min = _cfg.exactBounds ? "0" : "0.1"; _els.barWidth.max = _cfg.exactBounds ? "1" : "0.95";
    if (document.activeElement !== _els.barWidth) _els.barWidth.value = Number.isFinite(s.widthRatio) ? s.widthRatio : 0.55;
    [..._els.barFillHost.children].forEach((b) => {
      const on = b._fill === (s.fillStyle || "gray");
      b.style.background = on ? "color-mix(in srgb, var(--accent) 22%, var(--bg-input))" : "var(--bg-input)";
      b.style.borderColor = on ? "var(--accent)" : "var(--border)";
    });
  } else if (s.kind === "expr") {
    if (document.activeElement !== _els.expr) _els.expr.value = s.expr;
    if (document.activeElement !== _els.dMin) _els.dMin.value = s.domain ? s.domain.min : "";
    if (document.activeElement !== _els.dMax) _els.dMax.value = s.domain ? s.domain.max : "";
    if (document.activeElement !== _els.rMin) _els.rMin.value = s.range ? s.range.min : "";
    if (document.activeElement !== _els.rMax) _els.rMax.value = s.range ? s.range.max : "";
    _els.boxDrag.classList.toggle("on", _boxMode);
    _els.boxDrag.style.background = _boxMode ? "var(--accent)" : "";
    _els.boxDrag.style.color = _boxMode ? "#fff" : "";
    _els.boxNote.hidden = !_boxMode;
  } else {
    if (document.activeElement !== _els.pts) _els.pts.value = ptsToText(s.pts);
    _overlay.querySelector('#gm-closed').checked = !!s.closed;
    const modes = _overlay.querySelector('#gm-segment-modes'); if(document.activeElement !== modes) modes.value = (s.segmentModes || []).map(m => m === 'line' ? '직선' : '곡선').join(', ');
    const bi = _overlay.querySelector('#gm-breaks'), ei = _overlay.querySelector('#gm-endpoints');
    if (document.activeElement !== bi) bi.value = (s.breaks || []).map(i => i + 1).join(', ');
    if (document.activeElement !== ei) ei.value = (s.endpointMarkers || []).map(e => `${e.index + 1}:${e.kind === 'open' ? '빈원' : '채움'}${e.fillLevel === undefined && e.markerSize === undefined ? '' : ':' + (e.fillLevel ?? '')}${e.markerSize === undefined ? '' : ':' + e.markerSize}`).join(', ');
  }
  [..._els.styleHost.children].forEach((b, i) => {
    const on = i === effectiveLineStyleIndex(s);
    b.style.color = on ? "var(--accent)" : "var(--text-label)";
    b.setAttribute('aria-pressed', String(on));
    b.style.background = on ? "color-mix(in srgb, var(--accent) 22%, var(--bg-input))" : "var(--bg-input)";
    b.style.borderColor = on ? "var(--accent)" : "var(--border)";
  });
  // 막대는 실선 외곽선 하나뿐이라 선 종류·끝 라벨·이동 행을 숨긴다(선 굵기 = 외곽선 굵기).
  const isBar = s.kind === "bar";
  const styleRow = _els.styleHost.closest(".gm-row");
  if (styleRow) styleRow.style.display = isBar ? "none" : "";
  const endRow = _els.endLabel.closest(".gm-row");
  if (endRow) endRow.style.display = isBar ? "none" : "";
  const cs = s.curveStyle || (s.kind === "points" ? "straight" : "smooth");
  [..._els.curveHost.children].forEach((b) => {
    const on = b._curve === cs;
    b.style.background = on ? "color-mix(in srgb, var(--accent) 22%, var(--bg-input))" : "var(--bg-input)";
    b.style.borderColor = on ? "var(--accent)" : "var(--border)";
  });
  // 곡률 조절: 점 계열을 곡선으로 그릴 때만(꺾은선→곡선). 함수식은 식이 형태를 정하므로 숨김.
  const showCurv = s.kind === "points" && cs === "smooth";
  _els.curvatureRow.style.display = showCurv ? "" : "none";
  if (showCurv) _els.curvVal.textContent = Math.round((s.curvature || 1) * 100) + "%";
  // 앵커 수 조절: 자유곡선(smooth 점 계열)에만.
  _els.anchorsRow.style.display = showCurv ? "" : "none";
  if (showCurv) _els.anchorVal.textContent = s.pts.length;
  // 베지어 핸들 변환/해제: 자유곡선에만. 핸들 유무에 따라 변환/해제 버튼 전환.
  _els.bezierRow.style.display = showCurv ? "" : "none";
  if (showCurv) {
    const on = useHandles(s);
    _els.bezierOn.style.display = on ? "none" : "";
    _els.bezierOff.style.display = on ? "" : "none";
  }
  if (document.activeElement !== _els.width) _els.width.value = isExamStyle(_previewPlane) && !s.styleOverrides?.strokeWidth && !s.customStyle ? Number(examMetrics(_previewPlane).curve.toPrecision(6)) : s.strokeWidth;
  if (document.activeElement !== _els.endLabel) _els.endLabel.value = s.endLabel;

  // 면적 채움: 함수식 계열에만(점 계열은 정의역 개념이 없다).
  const areaAvail = s.kind !== "bar";
  _els.areaOn.closest(".gm-row").style.display = areaAvail ? "" : "none";
  const a = s.area || null;
  _els.areaOn.checked = !!(a && a.on);
  _els.areaRows.style.display = (areaAvail && a && a.on) ? "" : "none";
  if (a && a.on) {
    if (document.activeElement !== _els.areaFrom) _els.areaFrom.value = Number.isFinite(a.from) ? a.from : "";
    if (document.activeElement !== _els.areaTo) _els.areaTo.value = Number.isFinite(a.to) ? a.to : "";
    if (document.activeElement !== _els.areaLevel) _els.areaLevel.value = Number.isFinite(a.level) ? a.level : 220;
    if (document.activeElement !== _els.areaLabel) _els.areaLabel.value = a.label || "";
    _els.areaEdges.checked = a.edges !== false;
    _els.areaDrag.style.background = _areaMode ? "color-mix(in srgb, var(--accent) 22%, var(--bg-input))" : "";
    _els.areaNote.hidden = !_areaMode;
  }
  const dash = s.customDash || (LINE_STYLES[s.styleIdx] || LINE_STYLES[0]).slice(1);
  for (const [i,key] of ['dash','gap'].entries()) { const input = _overlay.querySelector(`#gm-custom-${key}`); if(document.activeElement !== input) input.value = dash[i]; }
  syncElementLists();
  for (const [id,draft] of _seriesInputDrafts.get(s) || []) {
    const input=_overlay.querySelector(`#${id}`);
    if (input) { input.value=draft.value; input.setCustomValidity(draft.message); }
  }
}

// 모양 프리셋 → 범위(neg/pos) 기본값. 음방향은 그 모양에 팔이 있을 때만 대칭값으로 채운다.
function applyVariantPreset(v) {
  _cfg.variant = v;
  if(v==='box'){(_cfg.engine ||= {}).axisArrowX=false;_cfg.engine.axisArrowY=false;_cfg.engine.axisArrowY2=false;}
  else {(_cfg.engine ||= {}).axisArrowX=true;_cfg.engine.axisArrowY=true;}
  const xp = Math.max(1, _cfg.xPos), yp = Math.max(1, _cfg.yPos);
  if (v === "quadrant") { _cfg.xNeg = 0; _cfg.yNeg = 0; }
  else if (v === "halfcross") { _cfg.xNeg = 0; _cfg.yNeg = yp; }
  else if (v === "cross") { _cfg.xNeg = xp; _cfg.yNeg = yp; }
  else if (v === "box") { _cfg.xNeg=0;_cfg.yNeg=0; }
}

/* ---------- 좌표(cfg) 컨트롤 동기화 ---------- */
function directBounds(cfg = _cfg) { return cfg.exactBounds || cfg.engineBounds; }
function writeBounds(key, value) {
  if (_cfg.exactBounds) _cfg.exactBounds[key] = value;
  else (_cfg.engineBounds ||= {})[key] = value;
}
function updateAxisMargin(key, value) {
  const bounds=directBounds();
  if (!bounds) return true;
  const axis=key[3].toLowerCase(), negative=key.endsWith('Neg');
  if ((_cfg.engine?.[`${axis}Scale`] || _previewPlane?.[`${axis}Scale`]) === 'log') return false;
  const tickBounds=axisTickBounds({..._previewPlane,...bounds},axis,_cfg[`explicitTicks${axis.toUpperCase()}`]);
  const next=(negative ? tickBounds.min-value*tickBounds.step : tickBounds.max+value*tickBounds.step);
  if (negative ? next >= bounds[`${axis}Max`] : next <= bounds[`${axis}Min`]) return false;
  writeBounds(`${axis}${negative?'Min':'Max'}`,Number(next.toPrecision(12)));
  return true;
}
function syncReconstructionControls() {
  const bounds = directBounds(), host = _overlay.querySelector('#gm-exact-axes');
  host.hidden = !bounds;
  _overlay.querySelector('#gm-bounds-on').checked = !!bounds;
  const legacy = _overlay.querySelector('.gm-axis-grid');
  [...legacy.children].forEach((node,i) => { if (i >= 3 && i < 6) node.style.display = bounds ? 'none' : ''; if(node.classList.contains('gm-neg-row'))node.style.display = !bounds && ['cross','halfcross'].includes(_cfg.variant) ? '' : 'none'; if(node.id==='gm-neg-note')node.style.display=!bounds && _cfg.variant==='halfcross' ? '' : 'none'; });
  for (const key of ['xPos','yPos','xNeg','yNeg','xStep','yStep']) _els[key].disabled = !!bounds;
  for (const a of ['x','y']) {
    const spec = _cfg.axisPlacement?.[a] || {mode:'zero'};
    const mode = _overlay.querySelector(`#gm-axis-${a}-mode`), value = _overlay.querySelector(`#gm-axis-${a}-fraction`);
    mode.value = spec.mode; value.value = spec.value ?? 0; value.disabled = spec.mode !== 'fraction';
    for (const k of ['min','max','step']) {
      const input = host.querySelector(`#gm-exact-${a}-${k}`);
      if (document.activeElement !== input) input.value = bounds?.[k === 'step' ? `gridStep${a.toUpperCase()}` : `${a}${k === 'min' ? 'Min' : 'Max'}`] ?? _cfg[`tickStep${a.toUpperCase()}`];
    }
  }
  _overlay.querySelector('#gm-label-weight').value = _cfg.labelWeight ?? 400;
  _overlay.querySelector('#gm-observed-note').hidden = _cfg.coordinateMode !== 'observed';
  _overlay.querySelector('#gm-observed-range-note').hidden = _cfg.coordinateMode !== 'observed';
  _overlay.querySelector('#gm-y2-min-row').hidden = !bounds;
  _els.y2On.disabled = false; _els.y2Pos.disabled = false; _els.y2TickText.disabled = false;
  const y2 = _cfg.exactY2 || _cfg.engineY2;
  for (const [id,value] of [['gm-y2-min',y2?.y2Min ?? 0],['gm-y2-scale',y2?.scale || 'linear']]) {
    const input = _overlay.querySelector(`#${id}`); if (document.activeElement !== input) input.value = value;
  }
  syncTickPositions();
  syncTypedAnnotations();
}

function syncTickPositions() {
  const host = _overlay.querySelector('#gm-tick-position-table'), details = _overlay.querySelector('#gm-tick-position-details');
  const enabled = !!directBounds() && _cfg.tickMode === 'text';
  details.hidden = !enabled;
  if (!enabled || host.contains(document.activeElement)) return;
  host.replaceChildren();
  for (const a of ['x','y']) {
    const ticks = _cfg[`explicitTicks${a.toUpperCase()}`] || [];
    const group = document.createElement('div'); group.className = 'gm-tick-table';
    const heading = document.createElement('strong'); heading.textContent = `${a}축 · 위치 / 표시 이름`; group.append(heading);
    ticks.forEach((tick, i) => {
      const row = document.createElement('div'); row.className = 'gm-tick-edit-row';
      for (const key of ['value','label']) {
        const input = document.createElement('input'); input.className = 'gm-num'; input.type = key === 'value' ? 'number' : 'text'; input.step = 'any'; input.value = tick[key] ?? '';
        input.setAttribute('aria-label', `${a} 눈금 ${i+1} ${key === 'value' ? '위치' : '이름'}`);
        input.onchange = () => {
          if (key === 'value' && (!input.value.trim() || !Number.isFinite(Number(input.value)))) { input.setCustomValidity('유효한 위치를 입력하세요.'); return; }
          input.setCustomValidity(''); tick[key] = key === 'value' ? Number(input.value) : input.value;
          if (key === 'label') { delete tick.displayMath; delete tick.displayText; _cfg[`tickText${a.toUpperCase()}`] = ticks.map(t=>t.label).join(', '); }
          refreshPreview(); syncCfgControls();
        }; row.append(input);
      }
      const remove = document.createElement('button'); remove.className = 'modal-btn'; remove.type = 'button'; remove.textContent = '삭제'; remove.onclick = () => { ticks.splice(i,1); _cfg[`tickText${a.toUpperCase()}`] = ticks.map(t=>t.label).join(', '); syncCfgControls(); refreshPreview(); }; row.append(remove); group.append(row);
    });
    host.append(group);
  }
}

const displayNumber = value => Number.isFinite(value) ? String(value) : value ?? '';
let _annotationSignature = '', _annotationCfg = null;
const ANNOTATION_KIND_NAMES = {text:'글자',region:'영역 이름',leader:'지시선',arrow:'화살표',guide:'보조선',point:'표시점'};
let _selectedAnnotationId = null;
function selectTypedAnnotation(id, focusList = false) {
  selectDisplay('annotation', (_cfg.graphAnnotations || []).find(a=>a.id===id) || null);
  if (focusList) [..._overlay.querySelectorAll('.gm-annotation-select')].find(b => b.dataset.annotationId === id)?.focus({preventScroll:true});
}
function drawAnnotationSelection(svg) {
  svg.querySelector('[data-annotation-selection]')?.remove();
  svg.querySelectorAll('[data-graph-annotation], [data-graph-annotation-shape]').forEach(el=>el.setAttribute('aria-pressed',String((el.getAttribute('data-graph-annotation')||el.getAttribute('data-graph-annotation-shape'))===_selectedAnnotationId)));
  if (_tab !== 'annot' || !_selectedAnnotationId || _annMode) return;
  const nodes = [...svg.querySelectorAll('[data-graph-annotation], [data-graph-annotation-shape]')].filter(el => !el.hasAttribute('data-annotation-hit') && (el.getAttribute('data-graph-annotation') || el.getAttribute('data-graph-annotation-shape')) === _selectedAnnotationId);
  const inverse = svg.getScreenCTM()?.inverse(); if (!inverse || !nodes.length) return;
  const corners = nodes.flatMap(el => {
    const matrix = el.getScreenCTM(); if (!matrix) return [];
    const box = el.getBBox();
    return [[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]].map(([x,y]) => {
      const q = svg.createSVGPoint(); q.x=x; q.y=y; return q.matrixTransform(matrix).matrixTransform(inverse);
    });
  });
  if (!corners.length) return;
  const xs=corners.map(q=>q.x),ys=corners.map(q=>q.y),frame=document.createElementNS(SVG_NS,'rect');
  for (const [k,v] of Object.entries({'data-annotation-selection':_selectedAnnotationId,x:Math.min(...xs)-.6,y:Math.min(...ys)-.6,width:Math.max(...xs)-Math.min(...xs)+1.2,height:Math.max(...ys)-Math.min(...ys)+1.2,fill:'none',stroke:'var(--accent)','stroke-width':'.25','pointer-events':'none'})) frame.setAttribute(k,v);
  svg.append(frame);
}
function syncTypedAnnotations(force = false) {
  const host = _overlay.querySelector('#gm-graph-annotations'), properties = _overlay.querySelector('#gm-typed-properties'), annotations = _cfg.graphAnnotations || [];
  _overlay.querySelector('#gm-annotation-editor').hidden = true;
  if (!annotations.some(a => a.id === _selectedAnnotationId)) _selectedAnnotationId = null;
  const signature = JSON.stringify([annotations, _selectedAnnotationId]);
  if (!force && (_annotationCfg === _cfg && _annotationSignature === signature || properties.contains(document.activeElement))) return;
  const openIds = new Set([...properties.querySelectorAll('details[open]')].map(d=>d.dataset.annotationId));
  _annotationCfg = _cfg; _annotationSignature = signature; host.replaceChildren(); properties.replaceChildren();
  annotations.forEach((a,i) => {
    const row = document.createElement('div'); row.className = 'gm-annotation-row gm-display-item'; row.dataset.annotationId = a.id; row.classList.toggle('is-selected',a.id===_selectedAnnotationId);
    row.style.setProperty('--gm-element-color', annotationGuideColor(a));
    const textOnly = ['text','region'].includes(a.kind) || (a.kind==='point' && a.endStyle==='none');
    const name = textOnly && a.kind==='point' ? '글자' : ANNOTATION_KIND_NAMES[a.kind] || '표시';
    const title = document.createElement('button'); title.type='button'; title.className='gm-annotation-select gm-display-select'; title.dataset.annotationId=a.id;
    title.textContent = `${name} ${i+1}${a.text ? ' · '+a.text : ''}`;
    title.setAttribute('aria-label', `표시 ${i+1} 선택`); title.setAttribute('aria-expanded', String(a.id === _selectedAnnotationId));
    title.setAttribute('aria-pressed', String(a.id === _selectedAnnotationId));
    title.setAttribute('aria-controls', `gm-annotation-fields-${i}`); title.onclick=()=>{
      selectTypedAnnotation(a.id);
      [...host.querySelectorAll('.gm-annotation-select')].find(b=>b.dataset.annotationId===a.id)?.focus({preventScroll:true});
    };
    appendDisplayHeading(row, title, `표시 ${i+1}`, () => { annotations.splice(i,1); _selectedAnnotationId=null; _displaySelection=null; syncTypedAnnotations(true); refreshPreview(); });
    title.onmousedown=e=>{e.preventDefault();e.stopPropagation();title.onclick();};
    const editor=document.createElement('div');editor.className='gm-annotation-editor';editor.id=`gm-annotation-fields-${i}`;editor.hidden=a.id!==_selectedAnnotationId; editor.dataset.annotationId=a.id; properties.append(editor);
    const fields = document.createElement('div'); fields.className = 'gm-annotation-fields'; editor.append(fields);
    const addField = (key,label,type='number',obj=a) => {
      const wrap=document.createElement('label'); wrap.textContent=label;
      const input=document.createElement('input'); input.type=type; input.className='gm-num'; input.step='any'; input.value=type==='number'?displayNumber(obj[key],['size','markerSize','strokeWidth'].includes(key)?3:6):obj[key]??'';
      input.setAttribute('aria-label', `표시 ${i+1} ${label}`);
      input.dataset.annotation=String(i); input.dataset.field=key;
      input.onchange=()=>{
        if(type==='number' && (!input.value.trim() || !Number.isFinite(Number(input.value)))) {input.setCustomValidity('유효한 값을 입력하세요.');return;}
        const value=type==='number'?Number(input.value):input.value;
        if((['size','markerSize','strokeWidth'].includes(key)&&value<=0)||(['dashLength','dashGap'].includes(key)&&value<0)){input.setCustomValidity('0보다 큰 크기를 입력하세요.');return;}
        input.setCustomValidity('');if(Object.is(obj[key],value))return;obj[key]=value;
        if(key==='text'){delete a.displayText;delete a.displayMath;}
        if(key==='size')delete a.fontSize;
        if(['size','fontSize','markerSize','strokeWidth','dashLength','dashGap'].includes(key)){a.customStyle=true;a.customStyleWidth=_previewPlane.w;}
        if(['x','y'].includes(key)){delete a.seriesId;delete a.pointIndex;delete a.curveAnchor;delete a.anchorX;}
        refreshPreview();
      };wrap.append(input);return wrap;
    };
    if (textOnly || a.text) fields.append(addField('text','글자','text'));
    else { const desc=document.createElement('span'); desc.className='gm-ax-note'; const target=_series.find(s=>s.reconstruction?.seriesId===a.seriesId||s.objectId===a.seriesId); desc.textContent = target ? `${target.reconstruction?.original?.label || target.endLabel || '함수 '+(_series.indexOf(target)+1)}에 연결` : a.kind==='guide' ? '축까지 한 방향 점선' : a.kind==='leader' ? '두 위치를 연결' : ''; if(desc.textContent)fields.append(desc); }
    if (textOnly) { const size=addField('size','글씨 크기'); size.querySelector('input').value=displayNumber(a.size??a.fontSize??_previewPlane?.axisLabelSize??3,3); fields.append(size); }
    if (textOnly) {
      const weight=addField('fontWeight','글씨 굵기'), input=weight.querySelector('input');
      input.value=a.fontWeight??_cfg.labelWeight??400;input.min='1';input.max='1000';fields.append(weight);
    }
    if (['arrow','leader','guide'].includes(a.kind)) {
      const width=addField('strokeWidth','선 굵기(mm)');
      width.querySelector('input').value=isExamStyle(_previewPlane)&&!a.customStyle?examMetrics(_previewPlane)[a.kind==='guide'?'guide':'axis']:a.strokeWidth??(a.kind==='guide'?_cfg.guideStyle?.strokeWidth:null)??((_previewPlane?.strokeWidth||.3)*(a.kind==='guide'?.55:.7));
      if(a.kind==='guide')for(const [key,label] of [['dashLength','점선 조각 길이(mm)'],['dashGap','점선 간격(mm)']]){const field=addField(key,label);field.querySelector('input').min='0';field.querySelector('input').value=a[key]??(isExamStyle(_previewPlane)?examMetrics(_previewPlane)[key==='dashLength'?'dash':'gap']:_cfg.guideStyle?.[key]??(key==='dashLength'?.8:.6));fields.append(field);}
      fields.append(width);
    }
    if (a.kind==='point' && !textOnly) { const size=addField('markerSize','점 반지름'); size.querySelector('input').value=displayNumber(a.markerSize??.8,3); fields.append(size); }
    if (a.kind==='point' && !textOnly) {
      const shape=document.createElement('select');shape.className='gm-num';shape.setAttribute('aria-label',`표시 ${i+1} 점 모양`);
      for(const[value,name]of [['filled','채운 점'],['open','빈 점']]) {const option=document.createElement('option');option.value=value;option.textContent=name;shape.append(option);}
      shape.value=a.endStyle==='open'?'open':'filled';shape.onchange=()=>{a.endStyle=shape.value;refreshPreview();};fields.append(shape);
    }
    if (a.kind==='guide' || textOnly) {
      const select=document.createElement('select'); select.className='gm-num'; select.setAttribute('aria-label',`표시 ${i+1} 방향`);
      const options=a.kind==='guide'?[['horizontal','가로 보조선'],['vertical','세로 보조선']]:[['horizontal','가로'],['vertical','세로'],['rotate','회전']];
      for(const[value,label]of options){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}select.value=a.orientation||'horizontal';select.onchange=()=>{a.orientation=select.value;refreshPreview();};fields.append(select);
    }
    const detail=document.createElement('details');detail.className='gm-detail';detail.dataset.annotationId=a.id;detail.open=openIds.has(a.id);
    const summary=document.createElement('summary');summary.textContent='세부 위치';detail.append(summary);
    const positions=document.createElement('div');positions.className='gm-annotation-positions'; positions.append(addField('x','x'),addField('y','y'));
    if(a.to)positions.append(addField('x','끝 x','number',a.to),addField('y','끝 y','number',a.to));detail.append(positions);editor.append(detail);
    host.append(row);
  });
}

function syncCfgControls() {
  _engineControls?.sync();
  syncReconstructionControls();
  const c = _cfg;
  // 모양은 버튼 세그먼트 — 고른 쪽에 .on을 준다.
  _els.variantSel.querySelectorAll("button[data-variant]").forEach((b) => {
    b.classList.toggle("on", b.dataset.variant === c.variant);
  });
  // 범위 입력: 양방향(pos)은 항상, 음방향(neg)은 그 축 팔이 있는 모양에서만 활성.
  //   ㄴ자: x-neg·y-neg 비활성(0) / ㅏ자: y-neg만 활성 / 십자: 둘 다 활성.
  if (document.activeElement !== _els.xPos) _els.xPos.value = c.xPos;
  if (document.activeElement !== _els.yPos) _els.yPos.value = c.yPos;
  if (document.activeElement !== _els.xNeg) _els.xNeg.value = c.xNeg;
  if (document.activeElement !== _els.yNeg) _els.yNeg.value = c.yNeg;
  if (document.activeElement !== _els.xStep) _els.xStep.value = c.tickStepX ?? 1;
  if (document.activeElement !== _els.yStep) _els.yStep.value = c.tickStepY ?? 1;
  const bounds=directBounds(),xNegOn = bounds ? bounds.xMin < 0 : c.variant === "cross";
  const yNegOn = bounds ? bounds.yMin < 0 : c.variant === "cross" || c.variant === "halfcross";
  // 흐림 처리는 스테퍼 칸 전체가 맡는다(.gm-step:has(input:disabled)) — 입력칸에 따로
  // opacity를 주면 이중으로 곱해져 글자가 안 보일 만큼 흐려진다.
  _els.xNeg.disabled = !!directBounds() || !xNegOn;
  _els.yNeg.disabled = !!directBounds() || !yNegOn;
  // '음의 방향' 행은 그 방향 축 팔이 있는 모양에서만 보인다 — ㄴ자에선 통째로 감춰
  // 잠긴 칸을 보여주지 않는다(종전엔 잠긴 칸이 늘 떠 있어 왜 못 쓰는지 헷갈렸다).
  const showNegRow = xNegOn || yNegOn;
  _els.overlay.querySelectorAll(".gm-neg-row").forEach((el) => {
    el.style.display = showNegRow && !directBounds() ? "" : "none";
  });
  // 행은 보이는데 한쪽만 잠긴 경우(ㅏ자)에만 이유를 덧붙인다.
  const negNote = _els.overlay.querySelector("#gm-neg-note");
  if (negNote) negNote.style.display = (showNegRow && !directBounds() && (!xNegOn || !yNegOn)) ? "" : "none";
  _els.labelX.value = c.labelX; _els.labelY.value = c.labelY;
  // 오른쪽 세로축(y2)
  _els.y2On.checked = !!c.y2On;
  _els.y2Rows.style.display = c.y2On ? "" : "none";
  if (document.activeElement !== _els.labelY2) _els.labelY2.value = c.labelY2 || "";
  if (document.activeElement !== _els.y2Pos) _els.y2Pos.value = directBounds() ? (c.exactY2 || c.engineY2)?.y2Max ?? "" : Number.isFinite(c.y2Pos) ? c.y2Pos : "";
  _els.y2Pos.min = directBounds() ? "" : "0.1"; _els.y2Pos.step = directBounds() ? "any" : "0.1";
  _els.y2ShowTick.checked = !!c.y2ShowTick;
  if (document.activeElement !== _els.y2TickText) _els.y2TickText.value = c.y2TickText || "";
  _els.showOrigin.checked = c.showOrigin;
  // 원점 표기는 0/O 두 버튼 세그먼트 — 현재 값 쪽에 .on을 준다(누를 수 있음이 드러나게).
  _els.originBtn.querySelectorAll("button[data-origin]").forEach((b) => {
    b.classList.toggle("on", b.dataset.origin === c.origin);
  });
  _els.showGrid.checked = c.showGrid;
  _els.showTicks.checked = c.showTicks;
  if (document.activeElement !== _els.axisScale) _els.axisScale.value = Math.round((c.axisLabelScale || 1) * 100);
  if (document.activeElement !== _els.tickScale) _els.tickScale.value = Math.round((c.tickLabelScale || 1) * 100);

  // 고급: 화살표 여백·격자 튀어나옴 네 끝 값 반영. 음의 방향이 없는 모양에선 x−/y− 비활성.
  const setEnd = (el, v, on) => { if (!el) return; if (document.activeElement !== el) el.value = v; el.disabled = !on; };
  const linearX=(c.engine?.xScale || _previewPlane?.xScale)!=='log',linearY=(c.engine?.yScale || _previewPlane?.yScale)!=='log';
  setEnd(_els.padXP, Number.isFinite(c.padXPos) ? c.padXPos : PAD_X, linearX);
  setEnd(_els.padXN, Number.isFinite(c.padXNeg) ? c.padXNeg : PAD_X, xNegOn&&linearX);
  setEnd(_els.padYP, Number.isFinite(c.padYPos) ? c.padYPos : PAD_Y, linearY);
  setEnd(_els.padYN, Number.isFinite(c.padYNeg) ? c.padYNeg : PAD_Y, yNegOn&&linearY);
  setEnd(_els.govXP, Number.isFinite(c.gridOverXPos) ? c.gridOverXPos : GRID_OVER, true);
  setEnd(_els.govXN, Number.isFinite(c.gridOverXNeg) ? c.gridOverXNeg : GRID_OVER, xNegOn);
  setEnd(_els.govYP, Number.isFinite(c.gridOverYPos) ? c.gridOverYPos : GRID_OVER, true);
  setEnd(_els.govYN, Number.isFinite(c.gridOverYNeg) ? c.gridOverYNeg : GRID_OVER, yNegOn);
  [..._els.tickModeHost.children].forEach((b) => {
    b.disabled = false;
    const on = b._mode === c.tickMode;
    b.style.background = on ? "color-mix(in srgb, var(--accent) 22%, var(--bg-input))" : "var(--bg-input)";
    b.style.borderColor = on ? "var(--accent)" : "var(--border)";
  });
  _els.tickTextRows.style.display = c.tickMode === "text" ? "" : "none";
  if (document.activeElement !== _els.tickTextX) _els.tickTextX.value = c.tickTextX;
  if (document.activeElement !== _els.tickTextY) _els.tickTextY.value = c.tickTextY;
  _els.tickBaseRows.style.display = c.tickMode === "multiple" ? "" : "none";
  if (document.activeElement !== _els.tickBaseX) _els.tickBaseX.value = c.tickBaseX || "";
  if (document.activeElement !== _els.tickBaseY) _els.tickBaseY.value = c.tickBaseY || "";
  _numberFields?.format();
}

/* ---------- 탭 전환 (좌표 / 함수) ---------- */
let _tab = "coord";               // "coord" | "func" | "annot"
function setTab(tab) {
  _tab = tab;
  _overlay.classList.toggle('gm-show-element-guide', _elementGuide && tab === 'annot');
  if (tab !== 'func') { _placeMode = null; _activeDraw = -1; _boxMode = false; _areaMode = false; }
  // '표시' 탭을 벗어나면 배치 모드를 끈다(다른 탭 클릭이 주석으로 새지 않게).
  if (tab !== "annot" && (_annMode || _annPending)) { _annMode = null; _annPending = null; }
  _els.tabCoord.style.display = tab === "coord" ? "" : "none";
  _els.tabFunc.style.display = tab === "func" ? "" : "none";
  _els.tabAnnot.style.display = tab === "annot" ? "" : "none";
  for (const [key, button] of [['coord',_els.tabCoordBtn],['func',_els.tabFuncBtn],['annot',_els.tabAnnotBtn]]) {
    button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(key === tab));
    button.setAttribute('aria-controls', `gm-tab-${key}`);
    _overlay.querySelector(`#gm-tab-${key}`).setAttribute('role', 'tabpanel');
  }
  if (tab === "func") { if (_sel === -1 && _series.length) _sel = 0; setFuncTab(_funcTab); }
  if (tab === "annot" && typeof syncAnnLists === "function") { syncAnnLists(); refreshPreview(); }
  _overlay.querySelector('.gm-tab-content').scrollTop = 0;
  refreshPreview();
}

/* ---------- 함수 하위 탭: 해석적 함수 / 직선·꺾은선 / 자유곡선 ---------- */
let _funcTab = "expr";            // "expr" | "poly" | "free" | "bar"
// 계열이 어느 하위 탭에 속하는지: 함수식=expr, 막대=bar, 점 계열은 곡선(smooth)=free /
// 직선(straight)=poly. ★ kind 분기를 먼저 본다 — 막대 계열은 curveStyle이 없어서
// 마지막 줄로 흘러가면 조용히 poly 탭에 섞인다(칩·편집 UI가 엉킨다).
function funcTabOf(s) {
  if (!s) return "expr";
  if (s.kind === "bar") return "bar";
  if (s.kind === "expr") return "expr";
  return (s.curveStyle === "smooth") ? "free" : "poly";
}
const FUNCTAB = {
  expr: { add: "＋ 함수식 추가", hint: "함수식(y=…)을 추가하세요.",
          make: () => newExprSeries() },
  poly: { add: "＋ 직선·꺾은선 추가", hint: "미리보기를 클릭해 점을 찍으면 직선·꺾은선이 됩니다.",
          make: () => { const s = newPointsSeries(); s.curveStyle = "straight"; return s; } },
  free: { add: "＋ 자유곡선 추가", hint: "미리보기에서 마우스로 죽 그리면(드래그) 매끄러운 자유곡선이 됩니다. 그린 뒤 파란 점(앵커)을 끌어 모양을 다듬으세요. (탭하면 점 하나씩 추가)",
          make: () => { const s = newPointsSeries(); s.curveStyle = "smooth"; return s; } },
  bar:  { add: "＋ 막대그래프 추가", hint: "값과 이름표를 쉼표로 구분해 한 줄씩 적으면 막대가 세워집니다.",
          make: () => newBarSeries() },
};
function setFuncTab(ft) {
  _funcTab = ft;
  const sub = { expr: _els.subExpr, poly: _els.subPoly, free: _els.subFree, bar: _els.subBar };
  Object.entries(sub).forEach(([k, btn]) => {
    const active = k === ft;
    btn.setAttribute('aria-pressed', String(active));
  });
  _els.addSeries.textContent = FUNCTAB[ft].add;
  _els.emptyHint.textContent = _series.length ? '목록이나 그래프에서 편집할 계열을 선택하세요.' : FUNCTAB[ft].hint;
  renderChips(); syncSeriesEditor(); refreshPreview();
}

/* ---------- 물음표(?) 도움말 팝오버 ---------- */
// 배지의 title(설명 문구)을 hover뿐 아니라 '클릭'해도 뜨게(요구). 같은 배지를 다시 누르거나
// 바깥을 누르면 닫힌다. 위치는 배지 바로 아래(뷰포트 기준 fixed), 우측 넘침은 클램프.
// 도움말 팝오버 엘리먼트를 모듈 스코프로 추적 — 모달이 Escape로 닫힐 때(hide())도
// 열려 있는 팝오버를 정리할 수 있어야 하므로 setupHelpPopovers 내부 지역변수로 가두지 않는다.
let _helpPop = null, _helpForEl = null;
function closeHelpPopover() { if (_helpPop) { _helpPop.remove(); _helpPop = null; _helpForEl = null; } }
function setupHelpPopovers(overlay) {
  overlay.addEventListener("click", (e) => {
    const badge = e.target.closest(".gm-help");
    if (!badge) { closeHelpPopover(); return; }
    // 배지가 <label> 안에 있으면(축 라벨 이동/묶기) 클릭이 체크박스로 한 번 더 전달돼 두 번째
    // click(target=input)이 close()를 불러 팝오버가 즉시 닫혔다. preventDefault로 라벨 전달 차단.
    e.preventDefault();
    e.stopPropagation();
    if (_helpForEl === badge) { closeHelpPopover(); return; }   // 같은 배지 재클릭 = 토글 닫기
    closeHelpPopover();
    const text = badge.getAttribute("data-help") || badge.getAttribute("title") || "";
    if (!text) return;
    _helpPop = document.createElement("div");
    _helpPop.className = "gm-help-pop";
    _helpPop.textContent = text;
    document.body.appendChild(_helpPop);
    _helpForEl = badge;
    const br = badge.getBoundingClientRect();
    const w = Math.min(260, window.innerWidth - 16);
    _helpPop.style.width = w + "px";
    _helpPop.style.left = Math.max(8, Math.min(br.left, window.innerWidth - w - 8)) + "px";
    _helpPop.style.top = (br.bottom + 6) + "px";
  });
}

// Ownership is kept with the setting that created the label. Only coordinate
// labels switch to Coordinates; curve labels and free text retain their editors.
function graphTextTarget(target) {
  if (_annMode || _placeMode || _activeDraw !== -1 || _traceController?.getState().interaction) return null;
  let el = target.closest('[data-axisname],[data-tick],[data-y2-tick],[data-end-label],[data-graph-annotation],[data-labelpoint-text],[data-legend-text]');
  if (!el) return null;
  if (el.hasAttribute('data-annotation-hit')) {
    const id = el.getAttribute('data-graph-annotation');
    el = [..._els.preview.querySelectorAll('[data-graph-annotation]:not([data-annotation-hit])')].find(node => node.getAttribute('data-graph-annotation') === id);
    if (!el) return null;
  }
  const identity = ['data-axisname','data-tick','data-y2-tick','data-end-label','data-graph-annotation','data-labelpoint-text','data-legend-text'].find(key => el.hasAttribute(key));
  const seriesIndex = el.closest('[data-preview-series]')?.dataset.previewSeries;
  const selector = `${seriesIndex === undefined ? '' : `[data-preview-series="${seriesIndex}"] `}[${identity}="${CSS.escape(el.getAttribute(identity))}"]:not([data-annotation-hit])`;
  const make = (label, value, tab, write, activate = () => {}) => ({
    element: el, label, value: String(value ?? ''),
    getRect: () => _els.preview.querySelector(selector)?.getBoundingClientRect(),
    activate: () => { activate(); setTab(tab); },
    save: value => {
      write(value);
      syncCfgControls(); syncAnnLists(); renderChips(); syncSeriesEditor(); refreshPreview();
      _draftHistory?.endGroup();
    },
  });
  if (el.hasAttribute('data-axisname')) {
    const axis = el.getAttribute('data-axisname');
    const key = {x:'labelX',y:'labelY',y2:'labelY2',origin:'origin'}[axis];
    if (key) return make(axis === 'origin' ? '원점 라벨' : `${axis}축 이름`, _cfg[key], 'coord', value => _cfg[key] = value);
  }
  if (el.hasAttribute('data-tick')) {
    const [axis, ord] = el.getAttribute('data-tick').split(':'), index = Number(ord);
    if (!['x','y'].includes(axis) || !Number.isInteger(index)) return null;
    const upper = axis.toUpperCase();
    const ticks = structuredClone(_previewPlane[`explicitTicks${upper}`] || generatedTicks(_previewPlane,axis,_cfg.tickMode,_cfg[`tickBase${upper}`]));
    if (!ticks[index]) return null;
    return make(`${axis}축 눈금`, ticks[index].label, 'coord', value => {
      ticks[index].label = value; delete ticks[index].displayText; delete ticks[index].displayMath;
      _cfg[`explicitTicks${upper}`] = ticks;
      _cfg[`tickText${upper}`] = ticks.map(tick => tick.label || '').join(', ');
      _cfg.tickMode = 'text';
    });
  }
  if (el.hasAttribute('data-y2-tick')) {
    const index = Number(el.getAttribute('data-y2-tick'));
    const ticks = structuredClone(_previewPlane.y2?.explicitTicks || generatedTicks(planeAsY2(_previewPlane),'y','number'));
    if (!ticks[index]) return null;
    return make('오른쪽 축 눈금', ticks[index].label, 'coord', value => {
      ticks[index].label = value; delete ticks[index].displayText; delete ticks[index].displayMath;
      const config = _cfg.exactY2 || _cfg.engineY2;
      if (config) config.explicitTicks = ticks;
      _cfg.y2TickText = ticks.map(tick => tick.label || '').join(', ');
    });
  }
  if (el.hasAttribute('data-end-label')) {
    const index = Number(el.closest('[data-preview-series]')?.dataset.previewSeries), series = _series[index];
    if (series) return make('함수 끝 라벨', series.endLabel, 'func', value => series.endLabel = value, () => { _sel = index; });
  }
  if (el.hasAttribute('data-graph-annotation')) {
    const annotation = (_cfg.graphAnnotations || []).find(a => a.id === el.getAttribute('data-graph-annotation'));
    if (annotation && ['text','math'].includes(annotation.kind)) return make('표시 텍스트', annotation.text, 'annot', value => annotation.text = value);
  }
  if (el.hasAttribute('data-labelpoint-text')) {
    const spec = _cfg.annLabelPoints?.[Number(el.getAttribute('data-labelpoint-text'))];
    if (spec) return make('표시점 라벨', spec.text, 'annot', value => spec.text = value);
  }
  if (el.hasAttribute('data-legend-text')) {
    const [legend,row] = el.getAttribute('data-legend-text').split(':').map(Number), spec = _cfg.legends?.[legend]?.rows?.[row];
    if (spec) return make('범례 텍스트', spec.text, 'annot', value => spec.text = value);
  }
  return null;
}

/* ---------- 모달 DOM ---------- */
function build() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "graph-modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal gm-modal" role="dialog" aria-modal="true" aria-label="그래프">
      <!-- 제목 오른쪽에 간단 설명(요구 1) -->
      <h2 class="modal-title" style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">
        <span id="gm-title">그래프 만들기</span>
        <span style="font-size: 12px;font-weight:400;color:var(--text-secondary);">원하는 좌표를 설정하고 자유롭게 그래프를 그립니다.</span>
        <button type="button" class="gm-close" id="gm-cancel" aria-label="그래프 닫기" title="닫기 (Esc)">×</button>
      </h2>
      <div class="gm-body">
        <div class="gm-left" style="flex:1;min-width:0;">
          <div class="gm-preview-toolbar"><div id="gm-trace-toolbar-host"></div>
          <div class="gm-export-actions"><button type="button" class="modal-btn" id="gm-undo" disabled title="실행 취소 (⌘/Ctrl+Z)">실행 취소</button><button type="button" class="modal-btn" id="gm-redo" disabled title="다시 실행 (⌘/Ctrl+Shift+Z)">다시 실행</button><button type="button" class="modal-btn" id="gm-send-exam">한글에 넣기</button><button type="button" class="modal-btn modal-btn-primary" id="gm-confirm">캔버스로 내보내기</button></div>
          </div>
          <div id="gm-preview" class="gm-preview" style="height:440px;"></div>
          <div id="gm-error" style="color:#e5534b;font-size: 12px;min-height:16px;margin-top:4px;"></div>
        </div>
        <!-- 높이를 고정한다(max-height가 아니라 height). max-height면 내용이 적은 탭에서만
             열이 짧아지고, 미리보기가 그 높이에 맞춰 늘어나므로(align-items:stretch)
             탭을 옮길 때마다 창과 미리보기가 같이 줄었다 늘었다 한다(실측 편차 103px). -->
        <div class="gm-right">

          <!-- 기존 세 탭을 유지하고 오른쪽에서 조작한다. -->
          <div class="gm-tabs" style="display:flex;gap:4px;margin-bottom:12px;">
            <button type="button" id="gm-tab-coord-btn">① 좌표</button>
            <button type="button" id="gm-tab-func-btn">② 함수</button>
            <button type="button" id="gm-tab-annot-btn">③ 표시</button>
          </div>

          <div id="gm-context" class="gm-context" role="status" aria-live="polite"></div>
          <div class="gm-tab-content">
          <div id="gm-tab-coord">
          <!-- 좌표 탭 레이아웃(UI 개선): 라벨 열을 92px로 고정하고 관련 항목을 그룹으로 묶는다.
               핵심은 '축 표' — x·y를 열로 세워 칸 개수 → 한 칸 값 → 축 이름이 같은 세로줄에
               계열로 쌓이게 했다(종전엔 라벨 길이가 달라 입력칸이 행마다 어긋났다).
               id는 종전 그대로라 이벤트 배선·populate는 손대지 않는다. -->
          <div class="gm-group">
            <div class="gm-group-h">축 만들기</div>
            <div class="gm-row"><span class="gm-row-lbl">범위 방식</span><div class="gm-row-body"><label class="gm-check"><input id="gm-bounds-on" type="checkbox"> 최소·최대값 지정</label></div></div>
            <div id="gm-exact-axes" hidden>
              ${['x','y'].map(a => `<div class="gm-row"><span class="gm-row-lbl">${a} 범위 / 간격</span><div class="gm-row-body gm-bounds-fields"><input class="gm-num" id="gm-exact-${a}-min" type="number" step="any" aria-label="${a} 최소값"><span>~</span><input class="gm-num" id="gm-exact-${a}-max" type="number" step="any" aria-label="${a} 최대값"><label>간격 <input class="gm-num" id="gm-exact-${a}-step" type="number" step="any" min="0" aria-label="${a} 눈금 간격"></label></div></div>`).join('')}
              <p id="gm-observed-range-note" class="gm-ax-note" hidden>실제 수치가 확인되지 않은 축입니다. 범위는 그림의 비율이며, 눈금 이름은 아래에서 수정합니다.</p>
            </div>
            <div class="gm-row">
              <span class="gm-row-lbl">모양</span>
              <div class="gm-row-body">
                <!-- 선택지가 셋뿐이라 드롭다운(클릭 2번) 대신 한 번에 고르는 버튼으로.
                     축 모양은 글자보다 그림이 빠르게 읽혀 미니 축 아이콘을 함께 둔다. -->
                <div class="gm-variant-seg" id="gm-variant-sel">
                  <button type="button" data-variant="quadrant" title="1사분면만 (음의 방향 없음)">
                    <svg viewBox="0 0 22 22" aria-hidden="true"><path d="M5 3 V17 H19"/></svg>ㄴ자</button>
                  <button type="button" data-variant="halfcross" title="y축은 양·음, x축은 양의 방향만">
                    <svg viewBox="0 0 22 22" aria-hidden="true"><path d="M6 2 V20 M6 11 H19"/></svg>ㅏ자</button>
                  <button type="button" data-variant="cross" title="네 방향 모두">
                    <svg viewBox="0 0 22 22" aria-hidden="true"><path d="M11 2 V20 M2 11 H20"/></svg>십자</button>
                  <button type="button" data-variant="box" title="사각형 프레임">□ 박스</button>
                </div>
              </div>
            </div>
            <div class="gm-axis-grid">
              <div></div>
              <div class="gm-ax-head"><i>x</i> 가로축</div>
              <div class="gm-ax-head"><i>y</i> 세로축</div>

              <!-- 칸 범위/간격: 종전 '축 범위'(칸 수)와 '격자 간격'을 한 줄에 나란히(요구). id 유지. -->
              <div class="gm-ax-lbl">칸 범위/간격</div>
              <div class="gm-ax-cell gm-range-step">
                <span class="gm-step"><input type="number" id="gm-xpos" min="1" value="5" title="x축 칸 범위 (0부터 어디까지)"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span>
                <span class="gm-rs-sep">/</span>
                <span class="gm-step"><input type="number" id="gm-xstep" min="0.1" step="0.1" value="1" title="x축 격자·눈금 간격 (0.5면 0, 0.5, 1 …)"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span>
              </div>
              <div class="gm-ax-cell gm-range-step">
                <span class="gm-step"><input type="number" id="gm-ypos" min="1" value="5" title="y축 칸 범위 (0부터 어디까지)"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span>
                <span class="gm-rs-sep">/</span>
                <span class="gm-step"><input type="number" id="gm-ystep" min="0.1" step="0.1" value="1" title="y축 격자·눈금 간격 (0.5면 0, 0.5, 1 …)"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span>
              </div>

              <div class="gm-ax-lbl gm-neg-row">음의 방향</div>
              <div class="gm-ax-cell gm-neg-row">
                <span class="gm-step"><input type="number" id="gm-xneg" min="0" value="0" title="왼쪽(음의 x) 칸 수"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span>
              </div>
              <div class="gm-ax-cell gm-neg-row">
                <span class="gm-step"><input type="number" id="gm-yneg" min="0" value="0" title="아래(음의 y) 칸 수"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span>
              </div>

              <div class="gm-ax-lbl">축 이름</div>
              <div class="gm-ax-cell">
                <textarea id="gm-labelx" class="gm-ta" rows="1" spellcheck="false" placeholder="예: 시간(s)"
                  style="flex:1;min-width:0;resize:none;field-sizing:content;min-height:36px;">x</textarea>
              </div>
              <div class="gm-ax-cell">
                <textarea id="gm-labely" class="gm-ta" rows="1" spellcheck="false" placeholder="예: 속도(m/s)"
                  style="flex:1;min-width:0;resize:none;field-sizing:content;min-height:36px;">y</textarea>
              </div>

              <div class="gm-ax-note" id="gm-neg-note">ㅏ자는 x축에 음의 방향이 없습니다 — 십자로 바꾸면 열립니다.</div>
            </div>

            <!-- 오른쪽 세로축(y2): 생명과학 자료해석 문항의 정형 형식(좌우 이중 y축).
                 판은 하나이므로 오른쪽 눈금은 왼쪽 격자와 같은 높이에 놓이고, '최대값'만
                 다르게 준다. 격자는 왼쪽 축 기준으로만 그린다(두 겹 방지). -->
            <div class="gm-row">
              <span class="gm-row-lbl">오른쪽 축</span>
              <div class="gm-row-body gm-checks">
                <label class="gm-check"><input type="checkbox" id="gm-y2-on"> 오른쪽 세로축 쓰기<span class="gm-help" title="왼쪽 축과 이름·눈금이 다른 오른쪽 세로축을 세웁니다. 계열마다 읽는 축을 골라 어느 축 눈금으로 그릴지 정합니다. 격자는 왼쪽 축 기준으로만 그려집니다.">?</span></label>
              </div>
            </div>
            <div id="gm-y2-rows" style="display:none;">
              <div class="gm-row">
                <span class="gm-row-lbl">축 이름</span>
                <div class="gm-row-body">
                  <textarea id="gm-labely2" class="gm-ta" rows="1" spellcheck="false" placeholder="예: 개체 수"
                    style="flex:1;min-width:0;resize:none;field-sizing:content;min-height:36px;"></textarea>
                </div>
              </div>
              <div class="gm-row" id="gm-y2-min-row" hidden><span class="gm-row-lbl">최소값 / 스케일</span><div class="gm-row-body"><input class="gm-num" id="gm-y2-min" type="number" step="any" aria-label="오른쪽 축 최소값"><select id="gm-y2-scale" class="gm-num" aria-label="오른쪽 축 스케일"><option value="linear">선형</option><option value="log">로그</option></select></div></div>
              <div class="gm-row">
                <span class="gm-row-lbl">최대값 / 눈금</span>
                <div class="gm-row-body">
                  <span class="gm-step"><input type="number" id="gm-y2-pos" min="0.1" step="0.1" placeholder="왼쪽과 같음" title="오른쪽 축 마지막 눈금의 값"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span>
                  <label class="gm-check" title="기출 도판은 오른쪽 축에 숫자가 없는 경우가 많습니다. 꺼도 축선과 축 이름은 그려집니다."><input type="checkbox" id="gm-y2-showtick"> 눈금 숫자</label>
                </div>
              </div>
              <div class="gm-row">
                <span class="gm-row-lbl">직접 눈금</span>
                <div class="gm-row-body"><input type="text" id="gm-y2-ticktext" class="gm-num" style="font-family:monospace;flex:1;min-width:0;" placeholder="예: N_0, 2N_0 (비우면 숫자)"></div>
              </div>
              <div class="gm-ax-note" style="padding-left:102px;">오른쪽 눈금은 왼쪽 격자와 같은 높이에 놓입니다 · 쉼표로 구분 · <b>아래부터 위 순서</b></div>
            </div>
          </div>

          <div class="gm-group">
            <div class="gm-group-h">표시 요소</div>
            <div class="gm-row">
              <span class="gm-row-lbl">보이기</span>
              <div class="gm-row-body gm-checks">
                <label class="gm-check"><input type="checkbox" id="gm-showgrid" checked> 격자</label>
                <label class="gm-check"><input type="checkbox" id="gm-showticks" checked> 눈금</label>
                <label class="gm-check"><input type="checkbox" id="gm-showorigin" checked> 원점</label>
                <span class="gm-origin-seg" id="gm-origin-toggle" title="원점 표기: 숫자 0 또는 영문 O">
                  <button type="button" data-origin="0">0</button><button type="button" data-origin="O">O</button>
                </span>
              </div>
            </div>
          </div>

          <div class="gm-group">
            <div class="gm-group-h">눈금 라벨</div>
            <div class="gm-row">
              <span class="gm-row-lbl">종류</span>
              <div class="gm-row-body">
                <div id="gm-tickmode"></div>
              </div>
            </div>
            <div id="gm-ticktext-rows" style="display:none;">
              <div class="gm-row">
                <span class="gm-row-lbl">x축 눈금</span>
                <div class="gm-row-body"><input type="text" id="gm-ticktext-x" class="gm-num" style="font-family:monospace;flex:1;min-width:0;" placeholder="예: t_0, 2t_0, 3t_0"></div>
              </div>
              <div class="gm-row">
                <span class="gm-row-lbl">y축 눈금</span>
                <div class="gm-row-body"><input type="text" id="gm-ticktext-y" class="gm-num" style="font-family:monospace;flex:1;min-width:0;" placeholder="예: v_0, 2v_0"></div>
              </div>
              <div class="gm-ax-note" style="grid-column:auto;padding-left:102px;">쉼표로 구분 · <b>맨 아래(왼쪽)부터 위(오른쪽) 순서</b> — 음의 축도 포함 · 수식 가능</div>
            </div>
            <details id="gm-tick-position-details" class="gm-detail" hidden><summary>눈금 위치 조정</summary><p class="gm-ax-note">눈금 이름을 바꾸면 기존 위치를 유지합니다. 숫자·배수를 선택하면 범위와 간격으로 다시 배치합니다.</p><div id="gm-tick-position-table"></div></details>
            <div id="gm-tickbase-rows" style="display:none;">
              <div class="gm-row">
                <span class="gm-row-lbl">x축 기준</span>
                <div class="gm-row-body"><input type="text" id="gm-tickbase-x" class="gm-num" style="font-family:monospace;flex:1;min-width:0;" placeholder="예: t_0  → t₀, 2t₀, 3t₀…"></div>
              </div>
              <div class="gm-row">
                <span class="gm-row-lbl">y축 기준</span>
                <div class="gm-row-body"><input type="text" id="gm-tickbase-y" class="gm-num" style="font-family:monospace;flex:1;min-width:0;" placeholder="예: v_0  → v₀, 2v₀, 3v₀…"></div>
              </div>
              <div class="gm-ax-note" style="grid-column:auto;padding-left:102px;">기준 문자 하나만 넣으면 2·3·4배가 자동 생성됩니다 · 화면 성능을 위해 축마다 최대 160개</div>
            </div>
          </div>

          <!-- 고급 옵션(요구): 좌표 탭 맨 아래에 두고, 클릭하면 바로 아래로 펼쳐지는 인라인 패널.
               모달로 띄우지 않으므로 값을 조정하는 동안 오른쪽 미리보기가 그대로 보인다.
               드문 축선 위치·글자 크기·여백·눈금 정렬을 담는다.
               좌표와 함수는 항상 묶고 축 이름과 눈금 라벨은 직접 드래그한다. -->
          <div class="gm-group" id="gm-adv-group">
            <button type="button" id="gm-adv-open" class="gm-adv-toggle" aria-expanded="false" aria-controls="gm-adv-panel">고급 옵션 <span id="gm-adv-caret">▾</span></button>
            <div id="gm-adv-panel" class="gm-adv-panel" hidden>
              <div class="gm-row"><span class="gm-row-lbl">눈금 정렬</span><div class="gm-row-body"><button type="button" id="gm-tickalign" class="modal-btn">첫 라벨에 맞추기</button></div></div>
              <div class="gm-row"><span class="gm-row-lbl">축선 위치</span><div class="gm-row-body gm-axis-placement">
                ${['x','y'].map(a => `<label class="gm-axis-placement-row"><span>${a}축</span><select class="gm-num" id="gm-axis-${a}-mode" aria-label="${a}축 위치 방식"><option value="zero">값 0</option><option value="fraction">그림 안 위치</option></select><input class="gm-num" id="gm-axis-${a}-fraction" type="number" min="0" max="1" step="any" aria-label="${a}축 위치 비율"></label>`).join('')}
                <small class="gm-ax-note">0: 아래·왼쪽, 1: 위·오른쪽</small>
              </div></div>
              <p id="gm-observed-note" class="gm-ax-note">이 그래프의 좌표는 그림 안 위치를 편집하는 표시용 좌표입니다. 실제 물리량을 뜻하지 않습니다.</p>
              <div class="gm-row"><label class="gm-row-lbl" for="gm-label-weight">글자 굵기</label><div class="gm-row-body"><input class="gm-num" id="gm-label-weight" type="number" min="100" max="900" step="any" value="400" aria-label="그래프 글자 굵기"></div></div>
              <div class="gm-row">
                <span class="gm-row-lbl">좌표 / 성분 크기</span>
                <div class="gm-row-body gm-scale-pair">
                  <span class="gm-scale-item">
                    <span class="gm-step"><input type="number" id="gm-axisscale" min="50" max="200" step="1" value="100" aria-label="좌표 크기(%)"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span>
                    <span class="gm-unit">%</span>
                  </span>
                  <span class="gm-scale-item">
                    <span class="gm-step"><input type="number" id="gm-tickscale" min="50" max="200" step="1" value="100" aria-label="성분 크기(%)"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span>
                    <span class="gm-unit">%</span>
                  </span>
                </div>
              </div>

              <div class="gm-adv-sect">
                <div class="gm-adv-h">화살표 위치<small>마지막 눈금에서의 여백(칸)</small></div>
                <div class="gm-end-row">
                  <span class="gm-end-item"><label>x+</label><span class="gm-step"><input type="number" id="gm-pad-xp" step="any" data-step-size="0.1" min="0" value="1.6"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span></span>
                  <span class="gm-end-item"><label>x−</label><span class="gm-step"><input type="number" id="gm-pad-xn" step="any" data-step-size="0.1" min="0" value="1.6"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span></span>
                  <span class="gm-end-item"><label>y+</label><span class="gm-step"><input type="number" id="gm-pad-yp" step="any" data-step-size="0.1" min="0" value="1.3"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span></span>
                  <span class="gm-end-item"><label>y−</label><span class="gm-step"><input type="number" id="gm-pad-yn" step="any" data-step-size="0.1" min="0" value="1.3"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span></span>
                </div>
              </div>

              <div class="gm-adv-sect">
                <div class="gm-adv-h">격자 튀어나옴<small>눈금 밖으로 더 뻗는 칸 (0=닫힘)</small></div>
                <div class="gm-end-row">
                  <span class="gm-end-item"><label>x+</label><span class="gm-step"><input type="number" id="gm-gov-xp" step="any" data-step-size="0.1" min="0" value="0.5"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span></span>
                  <span class="gm-end-item"><label>x−</label><span class="gm-step"><input type="number" id="gm-gov-xn" step="any" data-step-size="0.1" min="0" value="0.5"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span></span>
                  <span class="gm-end-item"><label>y+</label><span class="gm-step"><input type="number" id="gm-gov-yp" step="any" data-step-size="0.1" min="0" value="0.5"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span></span>
                  <span class="gm-end-item"><label>y−</label><span class="gm-step"><input type="number" id="gm-gov-yn" step="any" data-step-size="0.1" min="0" value="0.5"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span></span>
                </div>
              </div>
            </div>
          </div>
          </div><!-- /gm-tab-coord -->

          <div id="gm-tab-func" style="display:none;">
          <div class="gm-group-h">함수 · 선 목록</div>
          <div id="gm-chips" aria-label="모든 계열 목록"></div>
          <div class="gm-group-h">새 계열 종류</div>
          <!-- 함수 하위 탭(요구): 해석적 함수 / 직선·꺾은선 / 자유곡선 — 성격별로 분리 편집.
               미리보기는 셋이 공유하고, '만들기'는 모든 하위 탭의 계열을 한 평면에 합친다. -->
          <div id="gm-subtabs" class="gm-elem-seg" style="display:flex;margin-bottom:8px;">
            <button type="button" id="gm-sub-expr" style="flex:1;">해석적 함수</button>
            <button type="button" id="gm-sub-poly" style="flex:1;">직선·꺾은선</button>
            <button type="button" id="gm-sub-free" style="flex:1;">자유곡선</button>
            <button type="button" id="gm-sub-bar" style="flex:1;">막대그래프</button>
          </div>
          <button type="button" id="gm-add-series" class="modal-btn" style="width:100%;font-size: 12px;padding:6px;margin-bottom:8px;">＋ 함수식 추가</button>
          <div id="gm-empty-hint" style="font-size: 12px;color:var(--text-secondary);">
            함수식 또는 직선·꺾은선을 추가하세요.<span class="gm-help" title="계열 없이 좌표 틀만 만들 수도 있습니다. 추가한 함수는 미리보기 위에 바로 그려집니다.">?</span>
          </div>

          <div id="gm-series-editor" style="display:none;">
            <div class="gm-selected-heading"><strong id="gm-series-title"></strong></div>
            <!-- 아래 모든 행은 라벨 92px 고정 열(.gm-row)에 맞춘다 — 좌표 탭과 같은 세로
                 기준선을 쓰기 위해서다(DESIGN 13-1). 종전엔 행마다 제 글자 수만큼
                 입력칸이 밀려 시작점이 여섯 갈래였다. -->
            <div id="gm-expr-row" class="gm-group">
              <p class="gm-group-h">식</p>
              <div class="gm-row">
                <span class="gm-row-lbl">y =</span>
                <div class="gm-row-body">
                  <input type="text" id="gm-expr" class="gm-num" aria-describedby="gm-expr-error" style="font-family:monospace;flex:1;min-width:0;" spellcheck="false" placeholder="예: sin(x), x^2-3x+1">
                </div>
              </div>
              <div class="gm-row">
                <span class="gm-row-lbl"></span>
                <div class="gm-row-body" id="gm-expr-helpers" style="flex-wrap:wrap;gap:3px;"></div>
              </div>
              <div class="gm-row" id="gm-domain-row">
                <span class="gm-row-lbl">정의역 <i>x</i></span>
                <div class="gm-row-body">
                  <input type="number" id="gm-dmin" class="gm-num" style="width:70px;" step="any" placeholder="자동">
                  <span style="color:var(--text-secondary);">~</span>
                  <input type="number" id="gm-dmax" class="gm-num" style="width:70px;" step="any" placeholder="자동">
                </div>
              </div>
              <div class="gm-row" id="gm-range-row">
                <span class="gm-row-lbl">치역 <i>y</i></span>
                <div class="gm-row-body">
                  <input type="number" id="gm-rmin" class="gm-num" style="width:70px;" step="any" placeholder="자동">
                  <span style="color:var(--text-secondary);">~</span>
                  <input type="number" id="gm-rmax" class="gm-num" style="width:70px;" step="any" placeholder="자동">
                </div>
              </div>
              <div class="gm-row">
                <span class="gm-row-lbl"></span>
                <div class="gm-row-body">
                  <button type="button" id="gm-box-drag" class="modal-btn" style="font-size: 11px;padding:4px 10px;">드래그로 지정</button>
                  <button type="button" id="gm-box-clear" class="modal-btn" style="font-size: 11px;padding:4px 10px;">범위 해제</button>
                </div>
              </div>
              <p class="gm-ax-note" id="gm-box-note" hidden>미리보기에서 사각형을 끌면 그 안쪽만 남깁니다.</p>

              <div class="gm-row">
                <span class="gm-row-lbl">면적 채움</span>
                <div class="gm-row-body">
                  <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;">
                    <input type="checkbox" id="gm-area-on"> 곡선 아래를 채운다
                  </label>
                </div>
              </div>
              <div id="gm-area-rows" style="display:none;">
                <div class="gm-row">
                  <span class="gm-row-lbl">구간 <i>x</i></span>
                  <div class="gm-row-body">
                    <input type="number" id="gm-area-from" class="gm-num" style="width:70px;" step="any" placeholder="정의역 전체">
                    <span style="color:var(--text-secondary);">~</span>
                    <input type="number" id="gm-area-to" class="gm-num" style="width:70px;" step="any" placeholder="정의역 전체">
                    <button type="button" id="gm-area-drag" class="modal-btn" style="font-size:11px;padding:4px 10px;">드래그로 지정</button>
                  </div>
                </div>
                <div class="gm-row">
                  <span class="gm-row-lbl">명도·라벨</span>
                  <div class="gm-row-body">
                    <input type="number" id="gm-area-level" class="gm-num" style="width:60px;" step="5" min="0" max="255" title="회색 명도 0~255 (255=흰색)">
                    <input type="text" id="gm-area-label" class="gm-num" style="flex:1;min-width:0;" placeholder="면적 안 글자(예: 이동 거리)">
                    <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;white-space:nowrap;">
                      <input type="checkbox" id="gm-area-edges"> 경계선
                    </label>
                  </div>
                </div>
                <p class="gm-ax-note" id="gm-area-note" hidden>미리보기에서 좌우로 끌면 그 구간이 채워집니다.</p>
              </div>
            </div>

            <div id="gm-pts-rows" class="gm-group" style="display:none;">
              <p class="gm-group-h">점</p>
              <div class="gm-row">
                <span class="gm-row-lbl">좌표 입력</span>
                <div class="gm-row-body">
                  <input type="text" id="gm-pts" class="gm-num" style="font-family:monospace;flex:1;min-width:0;" spellcheck="false" placeholder="예: 0,0 1,2 3,2">
                </div>
              </div>
              <details class="gm-detail" id="gm-point-detail"><summary>끊김 · 닫힘 · 구간 · 개별 점</summary>
              <div class="gm-row">
                <span class="gm-row-lbl"></span>
                <div class="gm-row-body" style="flex-wrap:wrap;gap:8px">
                  <label>끊김 시작 점 번호 <input class="gm-num" id="gm-breaks" placeholder="예: 3, 5" style="width:70px"></label>
                  <label><input id="gm-closed" type="checkbox">닫힌 경로</label>
                  <label>구간 모양 <input id="gm-segment-modes" class="gm-num" placeholder="직선, 곡선, 직선" aria-label="구간별 직선 곡선" style="width:150px"></label>
                  <label>점 표시 <input class="gm-num" id="gm-endpoints" placeholder="1:빈원::1, 4:채움:220:2" title="점 번호:종류[:농도][:반지름 mm]. 농도 0 검정, 255 흰색" style="width:170px"></label>
                  <button type="button" id="gm-pts-undo" class="modal-btn" style="font-size: 11px;padding:3px 8px;">마지막 점 삭제</button>
                  <button type="button" id="gm-pts-clear" class="modal-btn" style="font-size: 11px;padding:3px 8px;">전체 지움</button>
                  <button type="button" id="gm-simplify-points" class="modal-btn">불필요한 점 정리</button>
                </div>
              </div>
              </details>
              <p class="gm-ax-note">미리보기를 클릭해 꼭짓점을 찍고, Enter 또는 우클릭으로 마칩니다.</p>
            </div>

            <!-- 막대그래프(생명과학 기출 관례): 값·이름표를 쉼표 한 줄로 받는다. y축은
                 눈금 없이 원점 0만 두고(좌표 탭 → 눈금 라벨 '없음'), x축 눈금선도 끄면
                 기출 판형과 같아진다 — 아래 안내 문구가 그 조합을 알려준다. -->
            <div id="gm-bar-rows" class="gm-group" style="display:none;">
              <p class="gm-group-h">막대</p>
              <div class="gm-row">
                <span class="gm-row-lbl">값</span>
                <div class="gm-row-body">
                  <input type="text" id="gm-bar-values" class="gm-num" style="font-family:monospace;flex:1;min-width:0;" spellcheck="false" placeholder="예: 60, 100, 45">
                </div>
              </div>
              <div class="gm-row">
                <span class="gm-row-lbl">이름표</span>
                <div class="gm-row-body">
                  <input type="text" id="gm-bar-labels" class="gm-num" style="font-family:monospace;flex:1;min-width:0;" spellcheck="false" placeholder="예: Ⅰ, Ⅱ, Ⅲ">
                </div>
              </div>
              <div class="gm-row">
                <span class="gm-row-lbl">막대 폭</span>
                <div class="gm-row-body">
                  <span class="gm-step"><input type="number" id="gm-bar-width" min="0.1" max="0.95" step="0.05" aria-label="막대 폭 비율">
                    <span class="gm-step-btns">
                      <button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button>
                      <button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button>
                    </span></span>
                  <span class="gm-unit">칸</span>
                  <span class="gm-help" title="한 칸에서 막대가 차지하는 비율입니다. 0.55면 막대와 간격이 거의 1:1이 되어 기출 판형과 비슷합니다.">?</span>
                </div>
              </div>
              <div class="gm-row">
                <span class="gm-row-lbl">채우기</span>
                <div class="gm-row-body"><span id="gm-bar-fill" style="display:inline-flex;gap:4px;flex-wrap:wrap;"></span></div>
              </div>
              <p class="gm-ax-note">값 개수만큼 막대가 균등하게 놓이고, 이름표는 막대 아래에 붙습니다. 값이 y축 범위를 넘으면 가장 큰 막대가 축 끝에 닿도록 전체를 같은 비율로 줄입니다(기출처럼 y축 눈금을 끄고 쓰면 상대 크기만 보입니다).</p>
            </div>

            <!-- 읽는 축(좌우 이중 y축): 오른쪽 축을 켜둔 경우에만 보인다. 막대·함수식·꺾은선 모두 적용. -->
            <div class="gm-row" id="gm-axis-row" style="display:none;">
              <span class="gm-row-lbl">읽는 축</span>
              <div class="gm-row-body">
                <span id="gm-axis-seg" style="display:inline-flex;gap:4px;"></span>
                <span class="gm-help" title="이 계열의 값을 왼쪽 세로축 눈금으로 읽을지, 오른쪽 세로축 눈금으로 읽을지 고릅니다.">?</span>
              </div>
            </div>
            <div class="gm-row" id="gm-shape-row" style="display:none;">
              <span class="gm-row-lbl">모양</span>
              <div class="gm-row-body"><span id="gm-curve" style="display:inline-flex;gap:4px;"></span></div>
            </div>
            <div class="gm-row" id="gm-curvature-row" style="display:none;">
              <span class="gm-row-lbl">곡률</span>
              <div class="gm-row-body">
                <span class="gm-pm">
                  <button type="button" id="gm-curv-dn">−</button>
                  <span id="gm-curv-val">100%</span>
                  <button type="button" id="gm-curv-up">＋</button>
                </span>
              </div>
            </div>
            <div class="gm-row" id="gm-anchors-row" style="display:none;">
              <span class="gm-row-lbl">앵커 수</span>
              <div class="gm-row-body">
                <span class="gm-pm">
                  <button type="button" id="gm-anchor-dn">−</button>
                  <span id="gm-anchor-val">0</span>
                  <button type="button" id="gm-anchor-up">＋</button>
                </span>
                <span class="gm-help" title="＋는 가장 성긴 구간에 점을 더하고, −는 모양을 가장 덜 바꾸는 점을 지웁니다. 미리보기에서 앵커를 우클릭하면 그 점만 지울 수도 있습니다.">?</span>
              </div>
            </div>
            <div class="gm-row" id="gm-bezier-row" style="display:none;">
              <span class="gm-row-lbl"></span>
              <div class="gm-row-body">
                <button type="button" id="gm-bezier-on" class="modal-btn" style="font-size: 11px;padding:3px 9px;">베지어로 변환</button>
                <button type="button" id="gm-bezier-off" class="modal-btn" style="font-size: 11px;padding:3px 9px;display:none;">자동 곡선으로</button>
                <span class="gm-help" title="변환하면 각 앵커에 접선 핸들이 생겨, 흰 점을 끌어 휘는 정도를 직접 조절할 수 있습니다.">?</span>
              </div>
            </div>

            <div class="gm-group">
              <p class="gm-group-h">모양</p>
              <div class="gm-row">
                <span class="gm-row-lbl">선 종류</span>
                <div class="gm-row-body gm-line-options"><span id="gm-styles" aria-label="선 종류"></span>
                  <details id="gm-line-detail" class="gm-detail"><summary>선 길이·간격 조정</summary>
                    <div class="gm-dash-pair"><label>선 길이 <input class="gm-num" id="gm-custom-dash" type="number" min="0" step="any" aria-label="계열 점선 길이"></label>
                    <label>간격 <input class="gm-num" id="gm-custom-gap" type="number" min="0" step="any" aria-label="계열 점선 간격"></label></div>
                    <label class="gm-dash-pattern">반복 패턴(mm)<input class="gm-num" id="gm-engine-dash-pattern" aria-label="반복 점선 패턴(mm)" placeholder="예: 2, 0.8, 0.3, 0.8"></label>
                  </details>
                </div>
              </div>
              <div class="gm-row">
                <span class="gm-row-lbl">선 굵기</span>
                <div class="gm-row-body">
                  <span class="gm-step"><input type="number" id="gm-width" min="0.01" max="2" step="any" aria-label="선 굵기">
                    <span class="gm-step-btns">
                      <button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button>
                      <button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button>
                    </span></span>
                  <span class="gm-unit">mm</span>
                </div>
              </div>
              <div class="gm-row" id="gm-series-arrow-row" hidden><span class="gm-row-lbl">진행 화살표</span><div id="gm-series-arrow-list" class="gm-row-body" style="flex-wrap:wrap;gap:6px"></div></div>
            <!-- 끝 라벨은 v_0 정도의 짧은 값만 들어간다. 남는 폭을 다 먹지 않게 줄이고,
                 이동·자동 연장선을 같은 행에 나란히 둔다(의견 5). -->
            <div class="gm-row">
              <span class="gm-row-lbl">끝 라벨</span>
              <div class="gm-row-body">
                <input type="text" id="gm-endlabel" class="gm-num gm-endlabel-in"
                       spellcheck="false" placeholder="예: v_0" aria-label="끝 라벨">
                <label class="gm-check" title="체크하면 미리보기에서 이 함수(곡선)를 끌어 옮길 수 있습니다.">
                  <input type="checkbox" id="gm-move"> 이동</label>
                <label class="gm-check" id="gm-autoext-row"
                       title="꺾은선 끝을 반 칸 늘려, 끝부분에도 수선·표시점이 잘 맞습니다.">
                  <input type="checkbox" id="gm-autoext"> 자동 연장선</label>
              </div>
            </div>

            </div>

            <!-- 그래프 요소(표시점·수선의 발·화살표)는 '③ 표시' 탭으로 이관했다(요구).
                 함수 탭에서는 더 이상 배치하지 않는다. 옛 파일의 계열 종속 요소는 하위호환으로
                 계속 렌더·저장되지만(새 UI 없음), 신규 배치는 표시 탭의 독립 주석으로 한다. -->
          </div>
          </div><!-- /gm-tab-func -->

          <!-- ③ 표시 탭(요구): 곡선에 종속되지 않는 독립 주석. 표시점·수선·화살표는 함수 없이도
               찍힌다. 가이드라인(두 점 점선)·범례(선 견본+글씨) 신규. 모두 미리보기 클릭으로 배치. -->
          <div id="gm-tab-annot" style="display:none;">
            <div class="gm-display-tools-heading"><span>표시 도구</span><button type="button" class="gm-element-guide" id="gm-element-guide" aria-pressed="false">요소 안내</button></div>
            <p class="gm-element-legend" id="gm-element-legend" hidden><span>글자·라벨</span><span>선·보조선</span><span>점</span><span>영역</span></p>
            <div class="gm-row">
              <span class="gm-row-lbl" hidden>배치 도구</span>
              <div class="gm-row-body gm-checks" style="flex-wrap:wrap;gap:6px;">
                <button type="button" id="gm-ann-select" class="gm-ann-tool" aria-pressed="true" title="글자나 표시 요소를 선택하고 드래그해 이동합니다.">선택 · 이동</button>
                <button type="button" id="gm-ann-marker" class="gm-ann-tool">표시점</button>
                <button type="button" id="gm-ann-guide" class="gm-ann-tool">수선의 발</button>
                <button type="button" id="gm-ann-arrow" class="gm-ann-tool">화살표</button>
                <button type="button" id="gm-ann-guideline" class="gm-ann-tool">가이드라인</button>
                <button type="button" id="gm-ann-labelpt" class="gm-ann-tool">라벨러 표시점</button>
                <button type="button" id="gm-add-annotation" class="gm-ann-tool">글자</button>
                <button type="button" id="gm-ann-leader" class="gm-ann-tool">지시선</button>
                <button type="button" id="gm-ann-single-guide" class="gm-ann-tool">한 방향 보조선</button>
              </div>
            </div>
            <div class="gm-ax-note" id="gm-ann-hint" style="padding-left:102px;">도구를 켜고 미리보기를 클릭해 배치합니다. 함수가 없어도 됩니다.</div>
            <div class="gm-group-h">표시 요소</div>
            <div id="gm-display-list" aria-label="표시 요소와 영역 목록"><div id="gm-legend-list"></div></div>
            <section id="gm-display-properties" aria-labelledby="gm-display-properties-title" hidden><h3 id="gm-display-properties-title"></h3><div id="gm-typed-properties"></div><div id="gm-legacy-properties"></div><div id="gm-region-properties"></div></section>
            <div class="gm-group" id="gm-annotation-editor"><div class="gm-group-h">글자 · 지시선 · 보조선</div><p class="gm-ax-note">그래프나 목록에서 요소를 선택하세요. 위치는 드래그로, 정확한 좌표는 세부 위치에서 조정합니다.</p><div id="gm-graph-annotations"></div></div>
            <div class="gm-row gm-elem-chiprow" id="gm-ann-marker-row" hidden>
              <span class="gm-row-lbl">표시점</span>
              <div class="gm-row-body"><div id="gm-ann-marker-list" class="gm-chips"></div></div>
            </div>
            <div class="gm-row gm-elem-chiprow" id="gm-ann-guide-row" hidden>
              <span class="gm-row-lbl">수선의 발</span>
              <div class="gm-row-body"><div id="gm-ann-guide-list" class="gm-chips"></div></div>
            </div>
            <div class="gm-row gm-elem-chiprow" id="gm-ann-arrow-row" hidden>
              <span class="gm-row-lbl">화살표</span>
              <div class="gm-row-body"><div id="gm-ann-arrow-list" class="gm-chips"></div></div>
            </div>
            <div class="gm-row gm-elem-chiprow" id="gm-ann-guideline-row" hidden>
              <span class="gm-row-lbl">가이드라인</span>
              <div class="gm-row-body"><div id="gm-ann-guideline-list" class="gm-chips"></div></div>
            </div>

            <div class="gm-row gm-elem-chiprow" id="gm-ann-labelpt-row" hidden style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px;">
              <span class="gm-row-lbl">라벨러 표시점</span>
              <div class="gm-row-body"><div id="gm-ann-labelpt-list" class="gm-chips"></div></div>
            </div>
            <div id="gm-ann-labelpt-editor"></div>

            <div class="gm-row" style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px;">
              <span class="gm-row-lbl">범례</span>
              <div class="gm-row-body">
                <button type="button" id="gm-ann-legend-add" class="gm-ann-tool">+ 범례 추가</button>
              </div>
            </div>
            <div class="gm-ax-note" style="padding-left:102px;">함수 선이 무엇인지 알려주는 작은 박스입니다. 미리보기에서 드래그해 옮깁니다.</div>
            <div id="gm-ann-legend-editor"></div>
          </div><!-- /gm-tab-annot -->
          </div><!-- /gm-tab-content -->
        </div>

      </div>
    </div>`;
  document.body.appendChild(overlay);

  // Move the existing controls, rather than duplicating their write paths.
  const advanced = overlay.querySelector('#gm-adv-panel');
  const groupControls = (title, nodes) => {
    const section = document.createElement('section'); section.className = 'gm-adv-sect';
    const heading = document.createElement('div'); heading.className = 'gm-adv-h'; heading.textContent = title;
    section.append(heading, ...nodes); advanced.append(section);
  };
  groupControls('눈금 라벨 정렬', [overlay.querySelector('#gm-tickalign').closest('.gm-row')]);
  groupControls('축선 위치', [overlay.querySelector('#gm-axis-x-mode').closest('.gm-row'), overlay.querySelector('#gm-observed-note')]);
  groupControls('그래프 글자 크기 · 굵기', [overlay.querySelector('#gm-label-weight').closest('.gm-row'), overlay.querySelector('#gm-axisscale').closest('.gm-row')]);
  groupControls('오른쪽 보조축', [overlay.querySelector('#gm-y2-on').closest('.gm-row'), overlay.querySelector('#gm-y2-rows')]);

  _els = {
    overlay,
    title: overlay.querySelector("#gm-title"),
    tabCoord: overlay.querySelector("#gm-tab-coord"), tabFunc: overlay.querySelector("#gm-tab-func"),
    tabCoordBtn: overlay.querySelector("#gm-tab-coord-btn"), tabFuncBtn: overlay.querySelector("#gm-tab-func-btn"),
    tabAnnot: overlay.querySelector("#gm-tab-annot"), tabAnnotBtn: overlay.querySelector("#gm-tab-annot-btn"),
    annMarker: overlay.querySelector("#gm-ann-marker"), annGuide: overlay.querySelector("#gm-ann-guide"),
    annArrow: overlay.querySelector("#gm-ann-arrow"), annGuideline: overlay.querySelector("#gm-ann-guideline"),
    annHint: overlay.querySelector("#gm-ann-hint"),
    annMarkerRow: overlay.querySelector("#gm-ann-marker-row"), annMarkerList: overlay.querySelector("#gm-ann-marker-list"),
    annGuideRow: overlay.querySelector("#gm-ann-guide-row"), annGuideList: overlay.querySelector("#gm-ann-guide-list"),
    annArrowRow: overlay.querySelector("#gm-ann-arrow-row"), annArrowList: overlay.querySelector("#gm-ann-arrow-list"),
    annGuidelineRow: overlay.querySelector("#gm-ann-guideline-row"), annGuidelineList: overlay.querySelector("#gm-ann-guideline-list"),
    annLabelPt: overlay.querySelector("#gm-ann-labelpt"),
    annLabelPtRow: overlay.querySelector("#gm-ann-labelpt-row"), annLabelPtList: overlay.querySelector("#gm-ann-labelpt-list"),
    annLabelPtEditor: overlay.querySelector("#gm-ann-labelpt-editor"),
    annLegendAdd: overlay.querySelector("#gm-ann-legend-add"), annLegendEditor: overlay.querySelector("#gm-ann-legend-editor"),
    variantSel: overlay.querySelector("#gm-variant-sel"),
    xNeg: overlay.querySelector("#gm-xneg"), xPos: overlay.querySelector("#gm-xpos"),
    yNeg: overlay.querySelector("#gm-yneg"), yPos: overlay.querySelector("#gm-ypos"),
    xStep: overlay.querySelector("#gm-xstep"), yStep: overlay.querySelector("#gm-ystep"),
    labelX: overlay.querySelector("#gm-labelx"), labelY: overlay.querySelector("#gm-labely"),
    y2On: overlay.querySelector("#gm-y2-on"), y2Rows: overlay.querySelector("#gm-y2-rows"),
    labelY2: overlay.querySelector("#gm-labely2"), y2Pos: overlay.querySelector("#gm-y2-pos"),
    y2ShowTick: overlay.querySelector("#gm-y2-showtick"), y2TickText: overlay.querySelector("#gm-y2-ticktext"),
    axisRow: overlay.querySelector("#gm-axis-row"), axisSeg: overlay.querySelector("#gm-axis-seg"),
    showOrigin: overlay.querySelector("#gm-showorigin"), originBtn: overlay.querySelector("#gm-origin-toggle"),
    showGrid: overlay.querySelector("#gm-showgrid"), showTicks: overlay.querySelector("#gm-showticks"),
    axisScale: overlay.querySelector("#gm-axisscale"), tickScale: overlay.querySelector("#gm-tickscale"),
    tickAlign: overlay.querySelector("#gm-tickalign"),
    // 고급 옵션(인라인 패널)
    advPanel: overlay.querySelector("#gm-adv-panel"), advOpen: overlay.querySelector("#gm-adv-open"), advCaret: overlay.querySelector("#gm-adv-caret"),
    padXP: overlay.querySelector("#gm-pad-xp"), padXN: overlay.querySelector("#gm-pad-xn"),
    padYP: overlay.querySelector("#gm-pad-yp"), padYN: overlay.querySelector("#gm-pad-yn"),
    govXP: overlay.querySelector("#gm-gov-xp"), govXN: overlay.querySelector("#gm-gov-xn"),
    govYP: overlay.querySelector("#gm-gov-yp"), govYN: overlay.querySelector("#gm-gov-yn"),
    tickModeHost: overlay.querySelector("#gm-tickmode"),
    tickTextRows: overlay.querySelector("#gm-ticktext-rows"),
    tickTextX: overlay.querySelector("#gm-ticktext-x"), tickTextY: overlay.querySelector("#gm-ticktext-y"),
    tickBaseRows: overlay.querySelector("#gm-tickbase-rows"),
    tickBaseX: overlay.querySelector("#gm-tickbase-x"), tickBaseY: overlay.querySelector("#gm-tickbase-y"),
    chips: overlay.querySelector("#gm-chips"), emptyHint: overlay.querySelector("#gm-empty-hint"),
    subExpr: overlay.querySelector("#gm-sub-expr"), subPoly: overlay.querySelector("#gm-sub-poly"),
    subFree: overlay.querySelector("#gm-sub-free"), subBar: overlay.querySelector("#gm-sub-bar"),
    addSeries: overlay.querySelector("#gm-add-series"),
    barRows: overlay.querySelector("#gm-bar-rows"),
    barValues: overlay.querySelector("#gm-bar-values"), barLabels: overlay.querySelector("#gm-bar-labels"),
    barWidth: overlay.querySelector("#gm-bar-width"), barFillHost: overlay.querySelector("#gm-bar-fill"),
    editor: overlay.querySelector("#gm-series-editor"),
    exprRow: overlay.querySelector("#gm-expr-row"), expr: overlay.querySelector("#gm-expr"),
    exprHelpers: overlay.querySelector("#gm-expr-helpers"),
    domainRow: overlay.querySelector("#gm-domain-row"),
    dMin: overlay.querySelector("#gm-dmin"), dMax: overlay.querySelector("#gm-dmax"),
    rangeRow: overlay.querySelector("#gm-range-row"),
    rMin: overlay.querySelector("#gm-rmin"), rMax: overlay.querySelector("#gm-rmax"),
    boxDrag: overlay.querySelector("#gm-box-drag"), boxClear: overlay.querySelector("#gm-box-clear"),
    boxNote: overlay.querySelector("#gm-box-note"),
    ptsRows: overlay.querySelector("#gm-pts-rows"), pts: overlay.querySelector("#gm-pts"),
    styleHost: overlay.querySelector("#gm-styles"), width: overlay.querySelector("#gm-width"),
    curveHost: overlay.querySelector("#gm-curve"),
    curvatureRow: overlay.querySelector("#gm-curvature-row"), curvVal: overlay.querySelector("#gm-curv-val"),
    anchorsRow: overlay.querySelector("#gm-anchors-row"), anchorVal: overlay.querySelector("#gm-anchor-val"),
    bezierRow: overlay.querySelector("#gm-bezier-row"), bezierOn: overlay.querySelector("#gm-bezier-on"), bezierOff: overlay.querySelector("#gm-bezier-off"),
    autoExt: overlay.querySelector("#gm-autoext"), autoExtRow: overlay.querySelector("#gm-autoext-row"),
    elemNote: overlay.querySelector("#gm-elem-note"),
    markerRow: overlay.querySelector("#gm-marker-row"),
    guideRow: overlay.querySelector("#gm-guide-row"),
    arrowRow: overlay.querySelector("#gm-arrow-row"),
    move: overlay.querySelector("#gm-move"),
    endLabel: overlay.querySelector("#gm-endlabel"),
    areaOn: overlay.querySelector("#gm-area-on"), areaRows: overlay.querySelector("#gm-area-rows"),
    areaFrom: overlay.querySelector("#gm-area-from"), areaTo: overlay.querySelector("#gm-area-to"),
    areaLevel: overlay.querySelector("#gm-area-level"), areaLabel: overlay.querySelector("#gm-area-label"),
    areaEdges: overlay.querySelector("#gm-area-edges"), areaDrag: overlay.querySelector("#gm-area-drag"),
    areaNote: overlay.querySelector("#gm-area-note"),
    markerClick: overlay.querySelector("#gm-marker-click"), markerList: overlay.querySelector("#gm-marker-list"),
    guideClick: overlay.querySelector("#gm-guide-click"), guideList: overlay.querySelector("#gm-guide-list"),
    arrowClick: overlay.querySelector("#gm-arrow-click"), arrowList: overlay.querySelector("#gm-arrow-list"),
    preview: overlay.querySelector("#gm-preview"), error: overlay.querySelector("#gm-error"),
    confirm: overlay.querySelector("#gm-confirm"), cancel: overlay.querySelector("#gm-cancel"),
  };

  /* --- 탭 전환 배선 --- */
  _els.tabCoordBtn.addEventListener("click", () => setTab("coord"));
  _els.tabFuncBtn.addEventListener("click", () => setTab("func"));
  _els.tabAnnotBtn.addEventListener("click", () => setTab("annot"));

  /* --- ③ 표시 탭: 배치 도구(요구) --- */
  const armAnn = (mode) => { _annMode = _annMode === mode ? null : mode; _annPending = null; syncAnnLists(); refreshPreview(); };
  _els.annMarker.addEventListener("click", () => armAnn("marker"));
  _els.annGuide.addEventListener("click", () => armAnn("guide"));
  _els.annArrow.addEventListener("click", () => armAnn("arrow"));
  _els.annGuideline.addEventListener("click", () => armAnn("guideline"));
  _els.annLabelPt.addEventListener("click", () => armAnn("labelpt"));
  _els.annLegendAdd.addEventListener("click", () => {
    // 미리보기 중앙 부근에 기본 2줄 범례를 놓는다. 위치는 드래그로 조정.
    const cx = (_previewPlane ? (_previewPlane.xMin + _previewPlane.xMax) / 2 : 1);
    const cy = (_previewPlane ? (_previewPlane.yMin + _previewPlane.yMax) * 0.7 : 4);
    (_cfg.legends = _cfg.legends || []).push({
      x: Math.round(cx * 10) / 10, y: Math.round(cy * 10) / 10,
      rows: [{ dash: null, text: "y=f(x)" }, { dash: null, text: "y=g(x)" }],
    });
    selectDisplay('legend',_cfg.legends.at(-1));
  });

  /* --- 좌표(cfg) 배선: 리스너가 _cfg에 쓰고 미리보기 갱신 --- */
  // 모양 = 프리셋: 고르면 범위 입력(음/양 방향 칸 수)을 그 모양 기본값으로 채우고
  // 음방향 입력을 활성/비활성한다(ㄴ자=음방향 없음 / ㅏ자=y음방향 / 십자=둘 다).
  _els.variantSel.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-variant]");
    if (!btn || btn.dataset.variant === _cfg.variant) return;
    applyVariantPreset(btn.dataset.variant);
    syncCfgControls();
    refreshPreview();
  });
  const int = (el, d) => { const n = parseInt(el.value, 10); return Number.isFinite(n) && n > 0 ? n : d; };
  const intNeg = (el) => { const n = parseInt(el.value, 10); return Number.isFinite(n) && n > 0 ? n : 0; };
  // 범위 칸 수: 양방향(pos)≥1, 음방향(neg)≥0(비대칭 허용). 증감은 입력칸 ▲▼ 스핀.
  _els.xPos.addEventListener("input", () => { _cfg.xPos = int(_els.xPos, 5); refreshPreview(); });
  _els.yPos.addEventListener("input", () => { _cfg.yPos = int(_els.yPos, 5); refreshPreview(); });
  _els.xNeg.addEventListener("input", () => { if (_els.xNeg.disabled) return; _cfg.xNeg = intNeg(_els.xNeg); refreshPreview(); });
  _els.yNeg.addEventListener("input", () => { if (_els.yNeg.disabled) return; _cfg.yNeg = intNeg(_els.yNeg); refreshPreview(); });
  // 한 칸 간격(눈금값): ≥0.1, 0.1 단위. 부동소수 누적 방지로 1/10 반올림해 저장.
  const stepVal = (el) => { const n = parseFloat(el.value); return Number.isFinite(n) && n >= 0.1 ? Math.round(n * 10) / 10 : 1; };
  _els.xStep.addEventListener("input", () => { _cfg.tickStepX = stepVal(_els.xStep); refreshPreview(); });
  _els.yStep.addEventListener("input", () => { _cfg.tickStepY = stepVal(_els.yStep); refreshPreview(); });
  // 글씨 크기(%) — 축 이름 / 눈금·성분 분리. 증감은 ▲▼ 스핀 버튼(요구 6, 50~200%).
  const clampScale = (el) => { const n = parseInt(el.value, 10); return Number.isFinite(n) ? Math.max(50, Math.min(200, n)) : 100; };
  _els.axisScale.addEventListener("input", () => { _cfg.axisLabelScale = clampScale(_els.axisScale) / 100;if(_cfg.graphStyle){_cfg.graphStyle.labelScale=_cfg.axisLabelScale;_cfg.tickLabelScale=_cfg.axisLabelScale;_engineControls?.sync();} refreshPreview(); });
  _els.tickScale.addEventListener("input", () => { _cfg.tickLabelScale = clampScale(_els.tickScale) / 100;if(_cfg.graphStyle){_cfg.graphStyle.labelScale=_cfg.tickLabelScale;_cfg.axisLabelScale=_cfg.tickLabelScale;_engineControls?.sync();} refreshPreview(); });
  // 고급 옵션(인라인): 클릭하면 바로 아래로 펼쳐/접힌다. 미리보기는 계속 보인다.
  _els.advOpen.addEventListener("click", () => {
    const open = _els.advPanel.hidden;
    _els.advPanel.hidden = !open;
    _els.advOpen.setAttribute('aria-expanded', String(open));
    if (_els.advCaret) _els.advCaret.textContent = open ? "▴" : "▾";
    // Keep the disclosure button under the pointer. Scrolling a panel taller
    // than its viewport can move the triggering button out of view mid-click.
    if (open) syncCfgControls();
  });
  // 화살표 여백·격자 튀어나옴(네 끝) — 입력 즉시 미리보기 반영(요구: 실시간).
  const numOrDefault = (el, d) => { const n = parseFloat(el.value); return Number.isFinite(n) && n >= 0 ? n : d; };
  const bindEnd = (el, key, d) => el.addEventListener("input", () => {
    if (!el.value.trim() || !Number.isFinite(Number(el.value)) || Number(el.value)<0) {el.setCustomValidity('0 이상의 값을 입력하세요.');return;}
    const value=numOrDefault(el,d);
    if (key.startsWith('pad') && !updateAxisMargin(key,value)) {el.setCustomValidity('축 범위를 유지할 수 있는 여백을 입력하세요.');return;}
    if (key.startsWith('gridOver') && directBounds()) {
      _cfg.graphAnnotations=extendGuideGrid(_cfg.graphAnnotations || [],{..._previewPlane,...directBounds(),explicitTicksX:_cfg.explicitTicksX,explicitTicksY:_cfg.explicitTicksY},key,value);
    }
    el.setCustomValidity('');_cfg[key]=value;refreshPreview();syncReconstructionControls();
  });
  bindEnd(_els.govXP, "gridOverXPos", GRID_OVER); bindEnd(_els.govXN, "gridOverXNeg", GRID_OVER);
  bindEnd(_els.govYP, "gridOverYPos", GRID_OVER); bindEnd(_els.govYN, "gridOverYNeg", GRID_OVER);
  bindEnd(_els.padXP, "padXPos", PAD_X); bindEnd(_els.padXN, "padXNeg", PAD_X);
  bindEnd(_els.padYP, "padYPos", PAD_Y); bindEnd(_els.padYN, "padYNeg", PAD_Y);
  // '첫 라벨에 맞추기': 미리보기에 실제로 그려진 눈금 숫자를 기준으로, 각 축의 세로(x축)·
  // 가로(y축) 높이를 첫 번째(맨 아래/맨 왼쪽) 숫자에 맞춘다. 곡선을 피한 나란한 이동은 보존.
  _els.tickAlign.addEventListener("click", () => {
    if (!_previewSvg) return;
    ["x", "y"].forEach((axis) => {
      const nodes = [..._previewSvg.querySelectorAll(`[data-tick^="${axis}:"]`)];
      const ords = nodes.map((n) => parseInt(n.getAttribute("data-tick").split(":")[1], 10)).filter(Number.isFinite).sort((a, b) => a - b);
      if (!ords.length) return;
      const arr = axis === "x" ? (_cfg.tickOffX = _cfg.tickOffX || []) : (_cfg.tickOffY = _cfg.tickOffY || []);
      const first = ords[0];
      const perp = axis === "x" ? ((arr[first] && arr[first].dy) || 0) : ((arr[first] && arr[first].dx) || 0);
      ords.forEach((o) => {
        arr[o] = arr[o] || { dx: 0, dy: 0 };
        if (axis === "x") arr[o].dy = perp; else arr[o].dx = perp;
      });
    });
    refreshPreview();
  });
  _els.labelX.addEventListener("input", () => { _cfg.labelX = _els.labelX.value; refreshPreview(); });
  _els.labelY.addEventListener("input", () => { _cfg.labelY = _els.labelY.value; refreshPreview(); });
  // 축 이름 칸에 포커스가 오면(탭 이동 포함) 기존 글자를 통째로 선택 → 바로 덮어쓸 수 있게(요구 1).
  // 일부 브라우저가 focus 직후 선택을 지우므로 setTimeout(0)으로 한 틱 뒤에 선택한다.
  [_els.labelX, _els.labelY].forEach((el) => el.addEventListener("focus", () => {
    setTimeout(() => { try { el.select(); } catch (_) {} }, 0);
  }));
  /* --- 오른쪽 세로축(y2) 배선 --- */
  _els.y2On.addEventListener("change", () => {
    _cfg.y2On = _els.y2On.checked;
    if(_cfg.y2On && directBounds() && !_cfg.exactY2 && !_cfg.engineY2) _cfg.engineY2={enabled:true,y2Min:_previewPlane.yMin,y2Max:_previewPlane.yMax,scale:'linear',gridStepY2:_previewPlane.gridStepY,tickStepY2:_previewPlane.tickStepY};
    // 끄면 계열의 '읽는 축'도 전부 왼쪽으로 되돌린다 — 안 그러면 보이지 않는 축을 읽는
    // 계열이 남아, 사용자가 알 수 없는 스케일로 값이 굽는다.
    if (!_cfg.y2On) _series.forEach((s2) => { s2.axis = "y"; });
    syncCfgControls(); syncSeriesEditor(); refreshPreview();
  });
  _els.labelY2.addEventListener("input", () => { _cfg.labelY2 = _els.labelY2.value; refreshPreview(); });
  _els.y2Pos.addEventListener("input", () => {
    const n = parseFloat(_els.y2Pos.value);
    if(directBounds()){const y2=_cfg.exactY2||_cfg.engineY2;if(!y2)return;if(!Number.isFinite(n)||n<=y2.y2Min){_els.y2Pos.setCustomValidity('최소값보다 큰 값을 입력하세요.');return;}_els.y2Pos.setCustomValidity('');y2.y2Max=n;}
    _cfg.y2Pos = Number.isFinite(n) && n > 0 ? n : null;   // 비우면 왼쪽 축과 같은 값
    refreshPreview();
  });
  _els.y2ShowTick.addEventListener("change", () => { _cfg.y2ShowTick = _els.y2ShowTick.checked; refreshPreview(); });
  _els.y2TickText.addEventListener("input", () => { _cfg.y2TickText = _els.y2TickText.value; if(_cfg.y2TickText.trim()){_cfg.y2ShowTick=true;_els.y2ShowTick.checked=true;} refreshPreview(); });
  // 계열별 '읽는 축' 선택(왼쪽/오른쪽) — 선 모양 버튼과 같은 세그먼트 방식.
  [["왼쪽", "y"], ["오른쪽", "y2"]].forEach(([label, val]) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b._axis = val;
    b.style.cssText = "font-size: 12px;border:1px solid var(--border);border-radius:3px;padding:3px 10px;background:var(--bg-input);color:var(--text-primary);cursor:pointer;";
    b.addEventListener("click", () => {
      const s2 = _series[_sel]; if (!s2) return;
      s2.axis = val; syncSeriesEditor(); renderChips(); refreshPreview();
    });
    _els.axisSeg.appendChild(b);
  });
  _els.showOrigin.addEventListener("change", () => { _cfg.showOrigin = _els.showOrigin.checked; refreshPreview(); });
  // 원점 표기: 숫자 0(정자) / 영문 O(이탤릭) 두 버튼 중 고른다(종전엔 눌러서 순환하는
  // 단일 버튼이라 클릭 가능하다는 게 드러나지 않았다).
  _els.originBtn.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-origin]");
    if (!btn || btn.dataset.origin === _cfg.origin) return;
    _cfg.origin = btn.dataset.origin;
    syncCfgControls(); refreshPreview();
  });
  // −/+ 스테퍼: 네이티브 ▲▼가 너무 작아 누르기 어려웠다. 버튼은 해당 input의
  // step만큼 값을 올리고 내리며(0.1 간격 조정에 특히 유리), 기존 리스너가 듣는
  // "input" 이벤트를 그대로 흘려보내 배선을 재사용한다.
  // (스테퍼 ▲▼ 동작은 js/stepper.js가 문서 전역에서 처리한다)
  _els.showGrid.addEventListener("change", () => { _cfg.showGrid = _els.showGrid.checked; refreshPreview(); });
  _els.showTicks.addEventListener("change", () => { _cfg.showTicks = _els.showTicks.checked; refreshPreview(); });
  [["none", "없음"], ["number", "숫자"], ["multiple", "배수"], ["text", "직접"]].forEach(([mode, label]) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b._mode = mode;
    b.style.cssText = "font-size: 12px;border:1px solid var(--border);border-radius:3px;padding:3px 10px;background:var(--bg-input);color:var(--text-primary);cursor:pointer;";
    b.addEventListener("click", () => {
      if(mode==='text' && _cfg.tickMode!==mode && directBounds()) {
        for(const a of ['X','Y']) {const ticks=_previewPlane[`explicitTicks${a}`] || [];_cfg[`explicitTicks${a}`]=structuredClone(ticks);_cfg[`tickText${a}`]=ticks.map(t=>t.label??'').join(', ');}
      }
      _cfg.tickMode = mode; syncCfgControls(); refreshPreview();
    });
    _els.tickModeHost.appendChild(b);
  });
  for(const [axis,input] of [['X',_els.tickTextX],['Y',_els.tickTextY]])input.addEventListener('input',()=>{
    _cfg[`tickText${axis}`]=input.value;
    if(directBounds()) {const labels=parseCsvLine(input.value),ticks=_cfg[`explicitTicks${axis}`] || generatedTicks(_previewPlane,axis.toLowerCase(),'text');_cfg[`explicitTicks${axis}`]=ticks.map((tick,i)=>{const next={...tick,label:labels[i]??''};delete next.displayMath;delete next.displayText;return next;});}
    refreshPreview();
  });
  _els.tickBaseX.addEventListener("input", () => { _cfg.tickBaseX = _els.tickBaseX.value; refreshPreview(); });
  _els.tickBaseY.addEventListener("input", () => { _cfg.tickBaseY = _els.tickBaseY.value; refreshPreview(); });

  /* --- 계열 배선 --- */
  _els.subExpr.addEventListener("click", () => setFuncTab("expr"));
  _els.subPoly.addEventListener("click", () => setFuncTab("poly"));
  _els.subFree.addEventListener("click", () => setFuncTab("free"));
  _els.subBar.addEventListener("click", () => setFuncTab("bar"));
  _els.addSeries.addEventListener("click", () => {
    addSeries(FUNCTAB[_funcTab].make());     // 현재 하위 탭 타입으로 추가
    if (_funcTab === "expr") _els.expr.focus();
    if (_funcTab === "bar") _els.barValues.focus();
  });
  /* --- 막대그래프 배선: 값·이름표는 쉼표 한 줄, 폭 비율·채우기는 즉시 반영 --- */
  // 값과 이름표는 서로 다른 길이로 들어올 수 있다(이름표만 먼저 적는 등) — 값 개수를
  // 기준으로 items를 만들고 이름표는 있는 만큼만 채운다. 값이 비면 그 칸은 막대 없음.
  const readBarItems = () => {
    const s = _series[_sel]; if (!s || s.kind !== "bar") return;
    const vals = parseCsvLine(_els.barValues.value);
    const labs = parseCsvLine(_els.barLabels.value);
    while (vals.length && vals[vals.length - 1] === "") vals.pop();
    s.items = vals.map((v, i) => ({...s.items[i], label: labs[i] || "", value: parseFloat(v) }));
    renderChips(); refreshPreview();
  };
  _els.barValues.addEventListener("input", readBarItems);
  _els.barLabels.addEventListener("input", readBarItems);
  _els.barWidth.addEventListener("input", () => {
    const s = _series[_sel]; if (!s || s.kind !== "bar") return;
    const n = parseFloat(_els.barWidth.value);
    if (_cfg.exactBounds && (!Number.isFinite(n) || n <= 0 || n > 1)) { _els.barWidth.setCustomValidity('막대 폭 비율은 0보다 크고 1 이하여야 합니다.'); _els.barWidth.reportValidity(); return; }
    _els.barWidth.setCustomValidity('');
    s.widthRatio = Number.isFinite(n) ? (_cfg.exactBounds ? n : Math.max(0.1, Math.min(0.95, n))) : 0.55;
    refreshPreview();
  });
  BAR_FILLS.forEach(([label, value]) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b._fill = value;
    b.style.cssText = "font-size: 12px;border:1px solid var(--border);border-radius:3px;padding:3px 10px;background:var(--bg-input);color:var(--text-primary);cursor:pointer;";
    b.addEventListener("click", () => {
      const s = _series[_sel]; if (!s || s.kind !== "bar") return;
      s.fillStyle = value;
      syncSeriesEditor(); refreshPreview();
    });
    _els.barFillHost.appendChild(b);
  });
  _els.expr.addEventListener("input", () => { const s = _series[_sel]; if (s) { s.expr = _els.expr.value; refreshPreview(); renderChips(); } });
  // 수식 도우미 버튼(기존 함수 도구처럼): 커서 위치에 삽입.
  HELPERS.forEach(([label, text]) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label;
    b.style.cssText = "font-size: 12px;font-family:monospace;border:1px solid var(--border);border-radius:3px;padding:2px 7px;background:var(--bg-input);color:var(--text-primary);cursor:pointer;";
    b.addEventListener("click", () => {
      insertAtCursor(_els.expr, text);
      const s = _series[_sel]; if (s) { s.expr = _els.expr.value; renderChips(); refreshPreview(); }
    });
    _els.exprHelpers.appendChild(b);
  });
  const readDomain = () => {
    const s = _series[_sel]; if (!s || s.kind !== "expr") return;
    const lo = parseFloat(_els.dMin.value), hi = parseFloat(_els.dMax.value);
    const edgePos = _cfg.xPos + GRID_OVER;                              // 오른쪽 데이터 끝
    const edgeNeg = (_cfg.xNeg > 0) ? -(_cfg.xNeg + GRID_OVER) : 0;     // 왼쪽 데이터 끝(음방향 없으면 0)
    s.domain = (Number.isFinite(lo) || Number.isFinite(hi))
      ? { min: Number.isFinite(lo) ? lo : edgeNeg, max: Number.isFinite(hi) ? hi : edgePos }
      : null;
    refreshPreview();
  };
  _els.dMin.addEventListener("change", readDomain);
  _els.dMax.addEventListener("change", readDomain);
  overlay.querySelector('#gm-bounds-on').onchange = e => {
    if(e.target.checked){const p=_previewPlane;_cfg.engineBounds=Object.fromEntries(['xMin','xMax','yMin','yMax','gridStepX','gridStepY','tickStepX','tickStepY'].map(k=>[k,p[k]]));_cfg.boundsInitial=structuredClone(_cfg);}
    else {delete _cfg.exactBounds;_cfg.engineBounds=null;delete _cfg.explicitTicksX;delete _cfg.explicitTicksY;}
    syncCfgControls();refreshPreview();
  };
  for (const a of ['x','y']) for (const k of ['min','max','step']) overlay.querySelector(`#gm-exact-${a}-${k}`).addEventListener('change', e => {
    const input=e.target,value=Number(input.value),key=k==='step'?`gridStep${a.toUpperCase()}`:`${a}${k==='min'?'Min':'Max'}`;
    const bounds={...directBounds(),[key]:value};
    if(!input.value.trim()||!Number.isFinite(value)||!(bounds[`${a}Min`]<bounds[`${a}Max`])||(k==='step'&&value<=0)){input.setCustomValidity('최소값, 최대값과 양수 간격을 확인하세요.');return;}
    input.setCustomValidity('');writeBounds(key,value);if(k==='step'){writeBounds(`tickStep${a.toUpperCase()}`,value);_cfg[`tickStep${a.toUpperCase()}`]=value;if(_cfg.inferredSteps)delete _cfg.inferredSteps[a.toUpperCase()];}refreshPreview();
  });
  overlay.querySelector('#gm-y2-min').onchange=e=>{const cfg=_cfg,y2=cfg.exactY2||cfg.engineY2;const value=Number(e.target.value);if(!y2)return;if(!e.target.value.trim()||!Number.isFinite(value)||value>=y2.y2Max){e.target.setCustomValidity('최대값보다 작은 값을 입력하세요.');return;}e.target.setCustomValidity('');y2.y2Min=value;refreshPreview();};
  overlay.querySelector('#gm-y2-scale').onchange=e=>{const y2=_cfg.exactY2||_cfg.engineY2;if(y2){y2.scale=e.target.value;refreshPreview();}};
  overlay.querySelector('#gm-ann-select').onclick = () => {
    _traceController?.cancelInteraction();_annMode=null;_annPending=null;_placeMode=null;_activeDraw=-1;_boxMode=false;_areaMode=false;
    syncAnnLists();syncSeriesEditor();refreshPreview();
  };
  overlay.querySelector('#gm-add-annotation').onclick = () => armAnn('text');
  overlay.querySelector('#gm-ann-leader').onclick = () => armAnn('leader');
  overlay.querySelector('#gm-ann-single-guide').onclick = () => armAnn('single-guide');
  overlay.querySelector('#gm-closed').addEventListener('change', e => { const s = _series[_sel]; if(s) {s.closed=e.target.checked;refreshPreview();} });
  overlay.querySelector('#gm-segment-modes').addEventListener('change', e => {
    const s = _series[_sel]; if(!s || s.kind !== 'points') return;
    const modes = e.target.value.trim() ? e.target.value.split(',').map(v => ({'직선':'line','곡선':'smooth',line:'line',smooth:'smooth'})[v.trim()]) : [];
    if(modes.length && (modes.length !== s.pts.length - 1 || modes.some(m=>!m))) { e.target.setCustomValidity('점 사이 구간마다 직선 또는 곡선을 쉼표로 입력하세요.'); return; }
    e.target.setCustomValidity(''); s.segmentModes=modes;
    if(modes.includes('smooth')) {s.curveStyle='smooth';s.handlesMode='shape-preserving';s.handles=shapePreservingHandles(s.pts,modes,s.breaks);} refreshPreview();
  });
  overlay.querySelector('#gm-breaks').addEventListener('change', e => {
    const s = _series[_sel]; if (!s || s.kind !== 'points') return;
    const values = e.target.value.trim() ? e.target.value.split(',').map(v => Number(v.trim()) - 1) : [];
    if (values.some(v => !Number.isInteger(v) || v < 1 || v >= s.pts.length)) { e.target.setCustomValidity('두 번째 이후 실제 점 번호를 입력하세요.'); e.target.reportValidity(); return; }
    e.target.setCustomValidity(''); s.breaks = [...new Set(values)].sort((a,b) => a-b); refreshPreview();
  });
  overlay.querySelector('#gm-endpoints').addEventListener('change', e => {
    const s = _series[_sel]; if (!s || s.kind !== 'points') return;
    const values = e.target.value.trim() ? e.target.value.split(',').map(v => {
      const parts = v.trim().split(':').map(p => p.trim()), [index, kind, level, radius] = parts;
      const marker = { index: Number(index) - 1, kind: kind === '빈원' || kind === 'open' ? 'open' : kind === '채움' || kind === 'closed' ? 'closed' : null };
      if (parts.length > 4 || !index || (parts.length === 3 && !level) || (parts.length === 4 && !radius)) marker.kind = null;
      if (level !== undefined && level !== '') marker.fillLevel = Number(level);
      if (radius !== undefined) marker.markerSize = Number(radius);
      return marker;
    }) : [];
    if (values.some(v => !Number.isInteger(v.index) || v.index < 0 || v.index >= s.pts.length || !v.kind || (v.markerSize !== undefined && (!Number.isFinite(v.markerSize) || v.markerSize <= 0)) || (v.fillLevel !== undefined && (v.kind !== 'closed' || !Number.isFinite(v.fillLevel) || v.fillLevel < 0 || v.fillLevel > 255))) || new Set(values.map(v => v.index)).size !== values.length) { e.target.setCustomValidity('점 번호:빈원 또는 점 번호:채움[:농도 0~255][:반지름 mm > 0]를 입력하세요.'); e.target.reportValidity(); return; }
    e.target.setCustomValidity(''); s.endpointMarkers = values; refreshPreview();
  });
  _els.pts.addEventListener("change", () => {
    const s = _series[_sel]; if (!s || s.kind !== "points") return;
    if (_els.pts.value === ptsToText(s.pts)) return;
    const tokens = _els.pts.value.trim().split(/\s+/).filter(Boolean);
    if (tokens.some(t => { const pair = t.split(','); return pair.length !== 2 || pair.some(v => !v.trim() || !Number.isFinite(Number(v))); })) { _els.pts.setCustomValidity('각 점을 x,y 숫자 쌍으로 입력하세요.'); _els.pts.reportValidity(); return; }
    _els.pts.setCustomValidity('');
    const nextPoints = textToPts(_els.pts.value).map((point, index) => Object.fromEntries(['x','y'].map(key => {
      const previous = s.pts[index]?.[key];
      return [key, Number.isFinite(previous) && point[key] === Number(roundedGraphNumber(previous)) ? previous : Number(roundedGraphNumber(point[key]))];
    })));
    if (nextPoints.length !== s.pts.length) {
      s.segmentModes = []; s.arrows = (s.arrows || []).filter(a => !Number.isInteger(a.segmentIndex));
      if (s.handles) {s.handlesMode='shape-preserving';s.handles=shapePreservingHandles(nextPoints,[],[]);}
      _els.error.textContent = '점 개수가 바뀌어 구간별 선 모양과 방향 화살표를 초기화했습니다. 새 경로에 맞게 확인해 주세요.';
    }
    s.pts = nextPoints;
    s.breaks = (s.breaks || []).filter(i => i > 0 && i < s.pts.length);
    s.endpointMarkers = (s.endpointMarkers || []).filter(e => e.index < s.pts.length);
    _els.pts.value = ptsToText(s.pts);
    renderChips(); refreshPreview();
  });
  overlay.querySelector('#gm-simplify-points').onclick = () => {
    flushEditorInput();
    const s = _series[_sel]; if (!s || s.kind !== 'points' || !_previewPlane) return;
    const ids = new Set([s.objectId, s.reconstruction?.seriesId].filter(Boolean));
    const annotations = (_cfg.graphAnnotations || []).filter(a => ids.has(a.seriesId));
    const protectedIndices = [...annotations.filter(a => Number.isInteger(a.pointIndex)).map(a => a.pointIndex), ...(s.fit?.protectedIndices || [])];
    const plane = planeForSeries(s, _previewPlane);
    const reduced = simplifyPolyline(s.pts.map(p => worldFromMath(plane, p.x, p.y)), { ...s, arrowSpecs: s.arrows, protectedIndices });
    if (!reduced.changed) { _els.error.textContent = reduced.reason === 'protected-geometry' ? '곡선·표시점·구간 설정이 있는 점은 유지합니다.' : '정리할 직선 중간점이 없습니다. 연결점과 꺾임은 유지합니다.'; return; }
    s.originalMathPoints ||= structuredClone(s.pts);
    s.pts = reduced.keptIndices.map(i => s.pts[i]);
    if (s.editStartPoints) s.editStartPoints = reduced.keptIndices.map(i => s.editStartPoints[i]);
    s.breaks = reduced.breaks;
    s.endpointMarkers = (s.endpointMarkers || []).map(e => ({ ...e, index: reduced.indexMap[e.index] }));
    for (const a of annotations) if (Number.isInteger(a.pointIndex)) a.pointIndex = reduced.indexMap[a.pointIndex];
    syncSeriesEditor(); renderChips(); refreshPreview();
    _els.error.textContent = `${reduced.originalPoints.length}개 점을 ${s.pts.length}개 꼭짓점으로 정리했습니다. 연결점과 꺾임은 유지했습니다.`;
  };
  overlay.querySelector("#gm-pts-undo").addEventListener("click", () => {
    const s = _series[_sel]; if (!s || s.kind !== "points") return;
    remapPointIndices(s, s.pts.length - 1, -1); s.pts.pop(); syncSeriesEditor(); renderChips(); refreshPreview();
  });
  overlay.querySelector("#gm-pts-clear").addEventListener("click", () => {
    const s = _series[_sel]; if (!s || s.kind !== "points") return;
    s.pts = []; s.breaks = []; s.endpointMarkers = []; syncSeriesEditor(); renderChips(); refreshPreview();
  });
  for (const a of ['x','y']) {
    const mode = overlay.querySelector(`#gm-axis-${a}-mode`), value = overlay.querySelector(`#gm-axis-${a}-fraction`);
    mode.addEventListener('change', () => { _cfg.axisPlacement[a] = { mode: mode.value, value: Number(value.value) }; value.disabled = mode.value !== 'fraction'; refreshPreview(); });
    value.addEventListener('input', () => { if (value.validity.valid && value.value !== '') { _cfg.axisPlacement[a].value = Number(value.value); refreshPreview(); } });
  }
  overlay.querySelector('#gm-label-weight').addEventListener('input', e => { if (e.target.validity.valid && e.target.value !== '') { _cfg.labelWeight = Number(e.target.value); refreshPreview(); } });
  for (const key of ['dash','gap']) overlay.querySelector(`#gm-custom-${key}`).addEventListener('input', e => {
    const s = _series[_sel]; if (!s || !e.target.validity.valid || e.target.value === '') return;
    s.customDash = ['dash','gap'].map(k => Number(overlay.querySelector(`#gm-custom-${k}`).value));
    delete s.dashPattern;
    s.styleIdx = effectiveLineStyleIndex(s); syncSeriesEditor(); refreshPreview();
  });
  // 선 종류는 대상이 그림 그 자체라 글자 대신 그 선을 그려 보여준다(DESIGN 13-2).
  // "점선"·"파선"이라는 이름만으로는 어느 쪽이 더 촘촘한지 알 수 없다.
  LINE_STYLES.forEach(([label, dl, dg, pattern], i) => {
    const b = document.createElement("button");
    b.type = "button"; b.title = label; b.setAttribute("aria-label", label);
    b.className = 'gm-line-preset';
    const svgEl = document.createElementNS(SVG_NS, "svg");
    svgEl.setAttribute("width", "40"); svgEl.setAttribute("height", "10");
    svgEl.setAttribute("viewBox", "0 0 40 10");
    const ln = document.createElementNS(SVG_NS, "line");
    ln.setAttribute("x1", 2); ln.setAttribute("y1", 5); ln.setAttribute("x2", 38); ln.setAttribute("y2", 5);
    ln.setAttribute("stroke", "currentColor"); ln.setAttribute("stroke-width", 1.7);
    // 대시 값은 world 단위(mm)라 40px짜리 미리보기에 맞춰 배로 키워 보여준다.
    if (pattern) ln.setAttribute('stroke-dasharray', pattern.map(v=>v*2.4).join(' '));
    else if (dl) ln.setAttribute("stroke-dasharray", `${dl * 2.4} ${dg * 2.4}`);
    svgEl.appendChild(ln); b.appendChild(svgEl);
    b.addEventListener("click", () => { const s = _series[_sel]; if (s) { s.styleIdx = i; s.customDash = null; if(pattern)s.dashPattern=structuredClone(pattern);else delete s.dashPattern; syncSeriesEditor(); refreshPreview(); } });
    _els.styleHost.appendChild(b);
  });
  // 선 모양(직선/곡선) 버튼 — 인스펙터에 있던 것을 모달로 이관(계열 스타일 완비).
  [["직선", "straight"], ["곡선", "smooth"]].forEach(([label, val]) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b._curve = val;
    b.style.cssText = "font-size: 12px;border:1px solid var(--border);border-radius:3px;padding:3px 10px;background:var(--bg-input);color:var(--text-primary);cursor:pointer;";
    b.addEventListener("click", () => { const s = _series[_sel]; if (s) { s.curveStyle = val; syncSeriesEditor(); refreshPreview(); } });
    _els.curveHost.appendChild(b);
  });
  _els.width.addEventListener("input", () => {
    const s = _series[_sel]; const v = parseFloat(_els.width.value);
    if (s && Number.isFinite(v)) { s.strokeWidth = Math.max(0.01, Math.min(2, v));(s.styleOverrides ||= {}).strokeWidth={value:s.strokeWidth,width:_previewPlane.w}; refreshPreview(); }
  });
  _els.endLabel.addEventListener("input", () => {
    const s = _series[_sel]; if (s) { s.endLabel = _els.endLabel.value; renderChips(); refreshPreview(); }
  });
  // 자동 연장선(요구): 계열별 토글.
  _els.autoExt.addEventListener("change", () => {
    const s = _series[_sel]; if (s) { s.autoExtend = _els.autoExt.checked; refreshPreview(); }
  });
  // ----- 정의역·치역 -----
  const readRange = () => {
    const a = parseFloat(_els.rMin.value), b = parseFloat(_els.rMax.value);
    return (Number.isFinite(a) && Number.isFinite(b)) ? { min: a, max: b } : null;
  };
  [_els.rMin, _els.rMax].forEach((el) => el.addEventListener("input", () => {
    const s2 = _series[_sel]; if (!s2) return;
    s2.range = readRange(); refreshPreview();
  }));

  // 사각형 드래그로 정의역·치역을 한 번에. 숫자 네 칸을 채우는 것보다 빠르고,
  // "여기부터 저기까지"를 눈으로 정하는 작업이라 그림 위에서 하는 게 맞다.
  _els.boxDrag.addEventListener("click", () => {
    if (!_series[_sel]) return;
    _boxMode = !_boxMode;
    if (_boxMode) _placeMode = null;   // 두 모드가 동시에 켜지면 클릭이 어디로 갈지 모호하다
    syncElementLists(); syncSeriesEditor(); refreshPreview();
  });
  _els.boxClear.addEventListener("click", () => {
    const s2 = _series[_sel]; if (!s2) return;
    s2.domain = null; s2.range = null; _boxMode = false;
    syncSeriesEditor(); refreshPreview();
  });

  /* ----- 곡선 아래 면적 채움 (함수 하나에 붙는 옵션) -----
   * 구간은 정의역 값으로 두 칸에 넣거나, 미리보기에서 좌우로 끌어 정한다.
   * 비워 두면 그 함수의 정의역 전체를 채운다. */
  const areaOf = (s) => (s.area ||= { on: false, from: null, to: null, level: 220, edges: true, label: "" });
  _els.areaOn.addEventListener("change", () => {
    const s = _series[_sel]; if (!s) return;
    areaOf(s).on = _els.areaOn.checked;
    if (!_els.areaOn.checked) _areaMode = false;
    syncSeriesEditor(); refreshPreview();
  });
  const readAreaNum = (el) => { const v = parseFloat(el.value); return Number.isFinite(v) ? v : null; };
  [_els.areaFrom, _els.areaTo].forEach((el) => el.addEventListener("input", () => {
    const s = _series[_sel]; if (!s) return;
    const a = areaOf(s);
    a.from = readAreaNum(_els.areaFrom); a.to = readAreaNum(_els.areaTo);
    refreshPreview();
  }));
  _els.areaLevel.addEventListener("input", () => {
    const s = _series[_sel]; if (!s) return;
    const v = parseFloat(_els.areaLevel.value);
    areaOf(s).level = Number.isFinite(v) ? Math.max(0, Math.min(255, v)) : 220;
    refreshPreview();
  });
  _els.areaLabel.addEventListener("input", () => {
    const s = _series[_sel]; if (!s) return;
    areaOf(s).label = _els.areaLabel.value; refreshPreview();
  });
  _els.areaEdges.addEventListener("change", () => {
    const s = _series[_sel]; if (!s) return;
    areaOf(s).edges = _els.areaEdges.checked; refreshPreview();
  });
  _els.areaDrag.addEventListener("click", () => {
    const s = _series[_sel]; if (!s || !s.area || !s.area.on) return;
    _areaMode = !_areaMode;
    if (_areaMode) { _boxMode = false; _placeMode = null; }
    syncElementLists(); syncSeriesEditor(); refreshPreview();
  });

  _els.move.addEventListener("change", () => {
    const s = _series[_sel]; if (s) { s.movable = _els.move.checked; refreshPreview(); }
  });
  // 곡률 증감(요구: 곡선일 때만). 현재값 기준 ±(0.4~2.4, 표준=1).
  const bumpCurv = (d) => {
    const s = _series[_sel]; if (!s) return;
    s.curvature = Math.max(0.4, Math.min(2.4, Math.round(((s.curvature || 1) + d) * 100) / 100));
    syncSeriesEditor(); refreshPreview();
  };
  overlay.querySelector("#gm-curv-dn").addEventListener("click", () => bumpCurv(-0.2));
  overlay.querySelector("#gm-curv-up").addEventListener("click", () => bumpCurv(0.2));
  // 앵커 수 조절(요구): ＋=가장 긴 구간의 중점에 앵커 삽입(성긴 곳을 촘촘하게),
  // −=이웃을 잇는 선에서 수직거리가 가장 작은 내부 앵커 제거(모양을 가장 덜 바꾸는 점). 끝점 유지.
  overlay.querySelector("#gm-anchor-up").addEventListener("click", () => {
    const s = _series[_sel]; if (!s || s.kind !== "points" || s.pts.length < 2) return;
    let bi = 0, bd = -1;
    for (let k = 0; k + 1 < s.pts.length; k++) {
      const d = Math.hypot(s.pts[k + 1].x - s.pts[k].x, s.pts[k + 1].y - s.pts[k].y);
      if (d > bd) { bd = d; bi = k; }
    }
    const a = s.pts[bi], b = s.pts[bi + 1];
    remapPointIndices(s, bi + 1, 1); s.pts.splice(bi + 1, 0, { x: Math.round((a.x + b.x) / 2 * 1000) / 1000, y: Math.round((a.y + b.y) / 2 * 1000) / 1000 });
    if (s.handles) syncHandlesToStructure(s);
    syncSeriesEditor(); renderChips(); refreshPreview();
  });
  overlay.querySelector("#gm-anchor-dn").addEventListener("click", () => {
    const s = _series[_sel]; if (!s || s.kind !== "points" || s.pts.length <= 2) return;
    let bi = -1, bd = Infinity;
    for (let k = 1; k + 1 < s.pts.length; k++) {
      const d = fdPerpDist(s.pts[k], s.pts[k - 1], s.pts[k + 1]);
      if (d < bd) { bd = d; bi = k; }
    }
    if (bi < 0) bi = s.pts.length - 2;   // 안전장치(전부 동일선상 등)
    remapPointIndices(s, bi, -1); s.pts.splice(bi, 1);
    if (s.handles) syncHandlesToStructure(s);
    syncSeriesEditor(); renderChips(); refreshPreview();
  });
  // 베지어 변환: 현재 접선에서 핸들을 초기화(모양 동일하게 시작) → 흰 핸들 드래그로 곡률 조절.
  _els.bezierOn.addEventListener("click", () => {
    const s = _series[_sel]; if (!s || s.kind !== "points" || s.curveStyle !== "smooth" || s.pts.length < 2) return;
    s.handlesMode = "manual";
    s.handles = catmullRomHandles(s.pts, s.curvature);
    syncSeriesEditor(); refreshPreview();
  });
  _els.bezierOff.addEventListener("click", () => {
    const s = _series[_sel]; if (!s) return;
    s.handlesMode = undefined; s.handles = null;   // 자동 곡선(centripetal)으로 복귀
    syncSeriesEditor(); refreshPreview();
  });

  // 그래프 요소(표시점/수선/화살표) 배선은 '③ 표시' 탭으로 이관했다 — 함수 탭 버튼은 제거됨.

  const commitValidated = () => {
    flushEditorInput();
    rememberInvalidSeries();
    const badExpression = _series.findIndex(s=>_expressionErrors.has(s));
    if (badExpression >= 0) { selectSeries(badExpression); _els.expr.scrollIntoView({block:'nearest'}); _els.expr.focus(); return; }
    const badSeries = _series.findIndex(s=>_seriesInputDrafts.get(s)?.size);
    if (badSeries >= 0) selectSeries(badSeries);
    const invalid = overlay.querySelector(':invalid');
    if (invalid) {
      const tab = invalid.closest('#gm-tab-coord') ? 'coord' : invalid.closest('#gm-tab-func') ? 'func' : 'annot';
      const id = invalid.id;
      if (_tab !== tab) setTab(tab);
      const target = (id && overlay.querySelector(`#${id}`)) || overlay.querySelector(':invalid');
      if (!target) return;
      if (target.closest('#gm-adv-panel')) { _els.advPanel.hidden=false; _els.advOpen.setAttribute('aria-expanded','true'); _els.advCaret.textContent='▴'; }
      for (let parent=target.parentElement;parent && parent!==overlay;parent=parent.parentElement) if (parent.tagName==='DETAILS') parent.open=true;
      target.scrollIntoView({block:'nearest'}); target.focus(); target.reportValidity(); return;
    }
    return _mode === "edit" ? commitEdit() : commitCreate();
  };
  _els.confirm.addEventListener("click", commitValidated);
  overlay.querySelector('#gm-send-exam').addEventListener('click', () => {
    if (_overlay.hidden || _editingContext || !document.querySelector('#exam-send')) return;
    const result = commitValidated();
    if (result) window.dispatchEvent(new CustomEvent('5e:exam-send-graph',{detail:result}));
  });

  _els.cancel.addEventListener("click", hide);
  overlay.addEventListener('input',e=>{if(e.target.closest('#gm-series-editor'))rememberInvalidSeries();});
  overlay.addEventListener('change',e=>{if(e.target.closest('#gm-series-editor'))rememberInvalidSeries();});
  overlay.addEventListener('keydown',e=>{
    if (e.key !== 'Delete' || e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (_tab==='func' && _sel>=0) {e.preventDefault();e.stopPropagation();deleteSeries(_sel);return;}
    if (_tab!=='annot' || !_displaySelection) return;
    e.preventDefault();e.stopPropagation();
    const {kind,spec}=_displaySelection;
    if (kind==='region') {const index=(_cfg.regions || []).indexOf(spec);if(index>=0)_cfg.regions.splice(index,1);_engineControls.selectRegion(null);}
    else {const array=kind==='annotation'?_cfg.graphAnnotations:_cfg[DISPLAY_ARRAYS[kind]];const index=array.indexOf(spec);if(index>=0)array.splice(index,1);}
    _displaySelection=null;_selectedAnnotationId=null;_lpSel=-1;syncAnnLists();syncTypedAnnotations(true);renderChips();syncSeriesEditor();refreshPreview();
  });
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) hide(); });
  // 미리보기 밖 중립 영역 클릭 → 함수 선택 해제(요구): 계열 편집기·칩·탭·추가버튼·미리보기·하단
  // 버튼은 선택 유지(그것들은 선택 계열을 편집/전환하므로). 그 외 모달 여백 클릭은 해제.
  // 배치 모드(표시점·수선·화살표) 해제: 미리보기 밖 아무 데나 누르면 꺼진다(요구).
  // 스냅 거리 제한을 없앤 뒤로는 미리보기 안을 누르면 늘 찍히므로, 빠져나갈 길이 필요하다.
  // 계열 선택은 건드리지 않는다 — 모드만 끄고 하던 작업은 그대로 이어가게.
  overlay.querySelector(".gm-modal").addEventListener("mousedown", (e) => {
    if (!_placeMode) return;
    if (e.target.closest("#gm-preview, .gm-elem-btns")) return;
    _placeMode = null;
    syncElementLists();
    refreshPreview();
  }, true);
  // Esc로도 빠져나온다 — 모드가 켜진 채 다른 걸 누르려다 헤매지 않게.
  overlay.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !_placeMode) return;
    e.stopPropagation();
    _placeMode = null;
    syncElementLists();
    refreshPreview();
  });

  overlay.querySelector(".gm-modal").addEventListener("mousedown", (e) => {
    if (_sel === -1 && !_placeMode && _activeDraw === -1) return;
    // 예외 목록이 옛 id(#gm-add-expr,#gm-add-points)를 가리키고 있었음 — 실제 DOM엔
    // #gm-add-series(추가 버튼)와 #gm-subtabs(하위 탭 컨테이너)가 있으므로 교체.
    // Viewing controls keep the selected curve. Redrawing on their mousedown
    // also interrupts WebKit's subsequent click on the zoom toggle.
    if (e.target.closest("#gm-preview, #gm-trace-toolbar-host, #gm-series-editor, #gm-engine-series, #gm-engine-controls, #gm-style-controls, #gm-adv-open, #gm-adv-panel, #gm-engine-regions, #gm-chips, .gm-tabs, #gm-subtabs, #gm-add-series, .modal-actions, .gm-export-actions")) return;
    _sel = -1; _placeMode = null; _activeDraw = -1;
    renderChips(); syncSeriesEditor(); refreshPreview();
  });
  _inlineText = mountGraphInlineText(_els.preview, graphTextTarget);
  const travel = redo => { _inlineText.cancel(); _draftHistory?.travel(redo); };
  overlay.querySelector('#gm-undo').onclick = () => travel(false);
  overlay.querySelector('#gm-redo').onclick = () => travel(true);
  overlay.addEventListener('focusout', () => _draftHistory?.endGroup());
  overlay.addEventListener('pointerdown', event => {
    if (event.button === 0 && event.target.closest('#gm-preview svg')) _draftHistory?.begin();
  }, true);
  const endGesture = () => queueMicrotask(() => _draftHistory?.end());
  window.addEventListener('pointerup', endGesture);
  window.addEventListener('pointercancel', endGesture);
  window.addEventListener('keydown', event => {
    if (!_overlay || _overlay.hidden || !(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key !== 'z' && key !== 'y') return;
    if (event.target.closest('input,textarea,[contenteditable="true"]')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    travel(key === 'y' || event.shiftKey);
  }, true);
  setupHelpPopovers(overlay);
  overlay.addEventListener('pointerdown',e=>{
    if (e.target.closest('[data-region-handle]')) _regionPointer={host:e.target.closest('#gm-preview'),id:e.pointerId};
  },true);
  overlay.addEventListener("keydown", e => {
    if (e.key !== 'Escape') return;
    e.preventDefault(); e.stopPropagation(); handleGraphEscape();
  });
  overlay.addEventListener('keydown',e=>{
    if (e.key !== 'Tab') return;
    const focusable = [...overlay.querySelectorAll('button,input,select,textarea,summary,a[href],[tabindex]')]
      .filter(el=>!el.disabled && el.tabIndex >= 0 && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    const first=focusable[0], last=focusable.at(-1);
    if (!first) {e.preventDefault();overlay.querySelector('.gm-modal').focus();return;}
    if (e.shiftKey && (document.activeElement===first || !focusable.includes(document.activeElement))) {e.preventDefault();last.focus();}
    else if (!e.shiftKey && (document.activeElement===last || !focusable.includes(document.activeElement))) {e.preventDefault();first.focus();}
  });
  overlay.addEventListener('mousedown',e=>{
    if (!e.target.closest('#gm-preview') || e.button !== 0) return;
    if (e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    flushEditorInput();
    const cfgBefore=structuredClone(_cfg), seriesBefore=_series.map(s=>structuredClone(s));
    const selectionBefore = _displaySelection ? {kind:_displaySelection.kind,index:_displaySelection.kind==='annotation'
      ? (_cfg.graphAnnotations || []).indexOf(_displaySelection.spec)
      : _displaySelection.kind==='region' ? (_cfg.regions || []).indexOf(_displaySelection.spec)
      : (_cfg[DISPLAY_ARRAYS[_displaySelection.kind]] || []).indexOf(_displaySelection.spec)} : null;
    const clear=()=>{window.removeEventListener('mouseup',clear);_cancelPreviewDrag=null;};
    _cancelPreviewDrag=()=>{
      window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
      for (const key of Object.keys(_cfg)) delete _cfg[key]; Object.assign(_cfg,cfgBefore);
      _series.forEach((s,i)=>{for(const key of Object.keys(s))delete s[key];Object.assign(s,seriesBefore[i]);});
      if (selectionBefore) {
        const {kind,index}=selectionBefore;
        _displaySelection={kind,spec:kind==='annotation'?_cfg.graphAnnotations[index]:kind==='region'?_cfg.regions[index]:_cfg[DISPLAY_ARRAYS[kind]][index]};
      } else _displaySelection=null;
      clear();syncCfgControls();syncAnnLists();syncSeriesEditor();refreshPreview();
    };
    window.addEventListener('mouseup',clear);
  },true);
  // PageUp/PageDown = 선택된 라벨러 표시점의 라벨 각도 15°씩 회전(요구).
  // 점을 찍으면 곧바로 선택되므로, 찍은 뒤 손을 옮기지 않고 바로 방향을 돌릴 수 있다.
  // 각도 입력칸에 포커스가 있을 땐 그 칸의 핸들러가 처리하고 여기까지 오지 않는다.
  window.addEventListener("keydown", (e) => {
    if (!_overlay || _overlay.hidden) return;
    if (e.key !== "PageUp" && e.key !== "PageDown") return;
    if (_tab !== "annot" || _lpSel < 0) return;
    const t = e.target;
    if (t && t.tagName === "TEXTAREA") return;   // 여러 줄 입력에서는 원래대로 스크롤
    if (!rotateSelLabelPt(e.key === "PageUp" ? 15 : -15)) return;
    e.preventDefault();
  });
  // Enter = 그리는 중인 점 계열 완성(요구). 입력칸 타이핑 중일 땐 무시. 모달 열려 있을 때만.
  window.addEventListener("keydown", (e) => {
    if (!_overlay || _overlay.hidden || e.key !== "Enter") return;
    const t = e.target;
    if (t?.closest?.('input,textarea,select,button,summary')) return;
    const s = _series[_sel];
    if (s && s.kind === "points" && _activeDraw === _sel && !_placeMode) { e.preventDefault(); finishPointsSeries(); }
  });
  _engineControls=mountEngineControls(overlay,{
    getCfg:()=>_cfg,getSeries:()=>_series,getSelected:()=>_series[_sel]||null,
    getSelectedRegion:()=>_displaySelection?.kind === 'region' ? _displaySelection.spec : null,
    onSelectRegion:spec=>selectDisplay('region',spec),
    onRegionAdded:spec=>selectDisplay('region',spec),
    getPlane:()=>{const cur=_planeId?editorState().get().objects.find(o=>o.id===_planeId):null;return cur?applyCfg(structuredClone(cur),_cfg):buildFrame(_cfg,{x:0,y:0},{w:90,h:60});},
    onChange:()=>{
      if (_overlay && !_overlay.hidden) _disposeEscape=registerEscapeLayer(_overlay.querySelector('.gm-modal'),handleGraphEscape);
      syncCfgControls();syncSeriesEditor();refreshPreview();
    },
    onData:(s,points)=>{const old=s.pts?.length||0;s.pts=points;if(old!==points.length){s.segmentModes=[];s.breaks=[];s.arrows=[];s.endpointMarkers=[];}if(s.curveStyle==='smooth'){s.handlesMode='shape-preserving';s.handles=shapePreservingHandles(s.pts,s.segmentModes,s.breaks);}else s.handles=null;delete s.fit;delete s.fitChangedIndices;delete s.originalMathPoints;},
    onFit:tolerance=>{const s=_series[_sel];if(!s||s.kind!=='points')return;const protectedIndices=[...new Set([...(_cfg.graphAnnotations||[]).filter(a=>a.seriesId===s.reconstruction?.seriesId&&Number.isInteger(a.pointIndex)).map(a=>a.pointIndex),...(s.endpointMarkers||[]).map(e=>e.index),...(s.fit?.protectedIndices||[])])];const r=fitObservedCurve(s.pts,{enabled:true,tolerance,certainty:s.reconstruction?.certainty,protectedIndices,segmentModes:s.segmentModes,breaks:s.breaks});if(!r.ok){_els.error.textContent=r.error;return;}s.originalMathPoints ||= structuredClone(s.pts);s.pts=r.points;s.fit={enabled:true,tolerance,protectedIndices};s.fitChangedIndices=r.changedIndices;s.curveStyle='smooth';s.handlesMode='shape-preserving';s.handles=shapePreservingHandles(s.pts,s.segmentModes,s.breaks);syncSeriesEditor();refreshPreview();},
    onRestore:()=>{const s=_series[_sel];if(!s?.originalMathPoints)return;s.pts=structuredClone(s.originalMathPoints);delete s.fit;delete s.fitChangedIndices;delete s.originalMathPoints;s.handlesMode='shape-preserving';s.handles=shapePreservingHandles(s.pts,s.segmentModes,s.breaks);syncSeriesEditor();refreshPreview();},
  });
  const displayList = overlay.querySelector('#gm-display-list');
  const expressionError = document.createElement('div'); expressionError.id='gm-expr-error'; expressionError.className='gm-input-error';
  expressionError.setAttribute('role','status'); expressionError.hidden=true; _els.expr.closest('.gm-row').after(expressionError);
  for (const id of ['gm-graph-annotations','gm-ann-marker-list','gm-ann-guide-list','gm-ann-arrow-list','gm-ann-guideline-list','gm-ann-labelpt-list']) {
    const list = overlay.querySelector(`#${id}`); list.classList.add('gm-display-section'); displayList.append(list);
  }
  const tools = overlay.querySelector('#gm-ann-marker').parentElement;
  _els.annLegendAdd.closest('.gm-row').hidden = true;
  tools.append(overlay.querySelector('#gm-ann-legend-add'), overlay.querySelector('#gm-engine-region-add'));
  tools.classList.add('gm-placement-tools');
  overlay.querySelector('#gm-engine-regions').hidden = true;
  overlay.querySelector('#gm-ann-legend-editor').previousElementSibling.hidden = true;
  _numberFields = installGraphNumberFields(overlay);
  for (const name of ['click', 'input', 'change']) overlay.querySelector('#gm-trace-toolbar-host').addEventListener(name, () => { _traceTouched = true; }, true);
  overlay.querySelector('#gm-element-guide').onclick = () => {
    _elementGuide = !_elementGuide;
    overlay.classList.toggle('gm-show-element-guide', _elementGuide && _tab === 'annot');
    overlay.querySelector('#gm-element-guide').setAttribute('aria-pressed', String(_elementGuide));
    overlay.querySelector('#gm-element-legend').hidden = !_elementGuide;
    refreshPreview();
  };
  overlay.addEventListener('focusin', e => {
    const input = e.target;
    if (!input.matches('input,select,textarea')) return;
    const annotation = input.closest('[data-annotation-id]')?.dataset.annotationId;
    const legacy = input.closest('[data-display-kind]');
    const region = input.closest('[data-region-id]');
    _guideFocusSelector = annotation ? `[data-graph-annotation="${CSS.escape(annotation)}"], [data-graph-annotation-shape="${CSS.escape(annotation)}"]`
      : legacy ? `[data-display-kind="${legacy.dataset.displayKind}"][data-display-index="${legacy.dataset.displayIndex}"]`
      : region ? `[data-graph-region-id="${CSS.escape(region.dataset.regionId)}"]` : null;
    if (_elementGuide) refreshPreview();
  });
  return overlay;
}


async function chooseTraceLibrary(trigger) {
  flushEditorInput();
  const controller = _traceController;
  _cancelPreviewDrag?.(); controller?.cancelInteraction();
  _overlay.hidden = true; _disposeEscape?.(); _disposeEscape=null;
  let resumed = false;
  const resume = () => {
    if(resumed)return; resumed=true;
    window.removeEventListener('5e:library-closed', resume);
    _resumeFromLibrary=null;
    if(_traceController!==controller)return;
    _overlay.hidden=false;
    _disposeEscape=registerEscapeLayer(_overlay.querySelector('.gm-modal'),handleGraphEscape);
    refreshPreview(); trigger.focus({preventScroll:true});
  };
  _resumeFromLibrary=resume;
  window.addEventListener('5e:library-closed',resume);
  try {
    await openPdfReferencePicker({ kind:'graph', trigger, onAdd:async reference => {
      if(_traceController!==controller)throw new Error('그래프 편집이 종료되었습니다. 다시 선택하세요.');
      if(!await controller.setReference(reference,{isCurrent:()=>_traceController===controller&&!resumed}))throw new Error('원본 이미지를 읽지 못했습니다. 다른 이미지를 선택하세요.');
      _traceTouched=true;
    } });
  } catch(error) { resume(); _els.error.textContent=error.message; }
}

// Escape 등으로 모달을 닫을 때 열려 있는 도움말(?) 팝오버가 화면에 남는 버그 수정 — 함께 정리.
function hide(applied = false) {
  _inlineText?.cancel(); _draftHistory = null;
  if(_resumeFromLibrary) { window.removeEventListener('5e:library-closed', _resumeFromLibrary); _resumeFromLibrary=null; }
  _cancelPreviewDrag?.(); _disposeEscape?.(); _disposeEscape = null;
  _engineControls?.cancelRegionDrag();
  _traceController?.destroy(); _traceController = null;
  if (_overlay) _overlay.hidden = true; _placeMode = null; closeHelpPopover();
  _focusReturn?.focus({preventScroll:true}); _focusReturn = null;
  const context = _editingContext; _editingContext = null;
  if (applied === true) context?.onApply?.();
  context?.onClose?.();
}

// funcgraph에 저장된 요소 원본 math 스펙 → 계열 편집 상태로.
function loadElements(fg, plane) {
  return {
    markers: Array.isArray(fg.markerXs) ? [...fg.markerXs] : (fg.markers || []).map(p => mathFromWorld(planeForSeries(fg, plane),p.x,p.y)),
    guides: Array.isArray(fg.guideXs) ? [...fg.guideXs] : [],
    arrows: Array.isArray(fg.arrowSpecs) ? fg.arrowSpecs.map((a) => ({ ...a })) : [],
  };
}

/* ---------- 편집 모드 로드: plane + 자식 계열 → cfg/_series ---------- */
function loadFromPlane(plane) {
  const objs = editorState().get().objects;
  const cfg = defaultCfg();
  cfg.graphStyle=plane.graphStyle ? structuredClone(plane.graphStyle) : undefined;cfg.outputWidth=plane.w;
  cfg.engine=Object.fromEntries(ENGINE_PLANE_FIELDS.filter(k=>plane[k]!==undefined).map(k=>[k,structuredClone(plane[k])]));
  cfg.engineBounds=plane.graphEngineBounds?Object.fromEntries(['xMin','xMax','yMin','yMax'].map(k=>[k,plane[k]])):null;
  cfg.engineY2=plane.graphEngineBounds&&plane.y2?structuredClone(plane.y2):null;cfg.regions=[];cfg.guideStyle=plane.guideStyle?structuredClone(plane.guideStyle):undefined;
  cfg.axisPlacement = structuredClone(plane.axisPlacement || cfg.axisPlacement);
  cfg.coordinateMode = plane.coordinateMode || "data";
  cfg.labelWeight = plane.labelWeight ?? 400;
  cfg.variant = plane.axisVariant || "quadrant";
  // 범위 복원: 신형 graphCfg(xNeg/xPos/yNeg/yPos) 우선 → 구형(cx/cy, 대칭) → 평면 범위 추정.
  const gc = plane.graphCfg || {};
  cfg.xPos = Number.isFinite(gc.xPos) ? gc.xPos : (Number.isFinite(gc.cx) ? gc.cx : Math.max(1, Math.round((plane.xMax ?? 5) - PAD_X)));
  cfg.yPos = Number.isFinite(gc.yPos) ? gc.yPos : (Number.isFinite(gc.cy) ? gc.cy : Math.max(1, Math.round((plane.yMax ?? 5) - PAD_Y)));
  cfg.xNeg = Number.isFinite(gc.xNeg) ? gc.xNeg : (cfg.variant === "cross" ? cfg.xPos : 0);
  cfg.yNeg = Number.isFinite(gc.yNeg) ? gc.yNeg : ((cfg.variant === "cross" || cfg.variant === "halfcross") ? cfg.yPos : 0);
  // 한 칸 간격(눈금값) 복원: graphCfg → plane.tickStep* → 기본 1.
  cfg.tickStepX = Number.isFinite(gc.tickStepX) ? gc.tickStepX : (Number.isFinite(plane.tickStepX) ? plane.tickStepX : 1);
  cfg.tickStepY = Number.isFinite(gc.tickStepY) ? gc.tickStepY : (Number.isFinite(plane.tickStepY) ? plane.tickStepY : 1);
  cfg.labelX = plane.labelX ?? "x"; cfg.labelY = plane.labelY ?? "y";
  // 오른쪽 세로축(y2) 복원. 필드가 없는 옛 파일 = 꺼짐(종전과 동일하게 그려진다).
  const y2 = plane.y2 || null;
  cfg.y2On = !!(y2 && y2.enabled);
  cfg.labelY2 = y2 ? (y2.labelY2 || "") : "";
  cfg.y2Pos = (y2 && Number.isFinite(y2.y2Pos)) ? y2.y2Pos : null;
  cfg.y2ShowTick = !!(y2 && y2.showTickY2);
  cfg.y2TickText = (y2 && Array.isArray(y2.tickTextY2)) ? y2.tickTextY2.join(", ") : "";
  cfg.showX = plane.showAxisLabelX !== false; cfg.showY = plane.showAxisLabelY !== false;   // 축 라벨은 항상 표시(on/off 제거 — 요구)
  cfg.origin = plane.labelOrigin ?? "0";
  cfg.showOrigin = plane.showOrigin !== false;
  cfg.showGrid = plane.showGrid === true;
  cfg.showTicks = plane.showTicks !== false;
  // cfg 레벨 모드는 graphTickMode 우선(배수↔직접 구분), 없으면 render 모드로 유도.
  cfg.tickMode = plane.graphTickMode || plane.tickLabelMode || (plane.showTickLabels ? "number" : "none");
  cfg.tickTextX = Array.isArray(plane.tickTextX) ? plane.tickTextX.join(", ") : "";
  cfg.tickTextY = Array.isArray(plane.tickTextY) ? plane.tickTextY.join(", ") : "";
  cfg.tickBaseX = plane.tickBaseX || ""; cfg.tickBaseY = plane.tickBaseY || "";
  // 글씨 크기: 신규 분리 필드 우선, 없으면 구 labelScale로 폴백(둘 다에 적용).
  cfg.axisLabelScale = Number.isFinite(plane.axisLabelScale) ? plane.axisLabelScale : (Number.isFinite(plane.labelScale) ? plane.labelScale : 1);
  cfg.tickLabelScale = Number.isFinite(plane.tickLabelScale) ? plane.tickLabelScale : (Number.isFinite(plane.labelScale) ? plane.labelScale : 1);
  // 축 라벨 이동 오프셋 복원.
  cfg.labelMovable = true;
  cfg.labelXOffset = plane.labelXOffset && Number.isFinite(plane.labelXOffset.dx) ? { dx: plane.labelXOffset.dx, dy: plane.labelXOffset.dy } : { dx: 0, dy: 0 };
  cfg.labelYOffset = plane.labelYOffset && Number.isFinite(plane.labelYOffset.dx) ? { dx: plane.labelYOffset.dx, dy: plane.labelYOffset.dy } : { dx: 0, dy: 0 };
  cfg.labelXPos = plane.labelXPos && Number.isFinite(plane.labelXPos.fx) ? { fx: plane.labelXPos.fx, fy: plane.labelXPos.fy } : null;
  cfg.labelYPos = plane.labelYPos && Number.isFinite(plane.labelYPos.fx) ? { fx: plane.labelYPos.fx, fy: plane.labelYPos.fy } : null;
  // 고급: 화살표 여백·격자 튀어나옴 네 끝 복원. 없으면 현행 기본값.
  cfg.padXPos = Number.isFinite(plane.padXPos) ? plane.padXPos : PAD_X;
  cfg.padXNeg = Number.isFinite(plane.padXNeg) ? plane.padXNeg : PAD_X;
  cfg.padYPos = Number.isFinite(plane.padYPos) ? plane.padYPos : PAD_Y;
  cfg.padYNeg = Number.isFinite(plane.padYNeg) ? plane.padYNeg : PAD_Y;
  const goFallback = Number.isFinite(plane.gridOver) ? plane.gridOver : GRID_OVER;
  cfg.gridOverXPos = Number.isFinite(plane.gridOverXPos) ? plane.gridOverXPos : goFallback;
  cfg.gridOverXNeg = Number.isFinite(plane.gridOverXNeg) ? plane.gridOverXNeg : goFallback;
  cfg.gridOverYPos = Number.isFinite(plane.gridOverYPos) ? plane.gridOverYPos : goFallback;
  cfg.gridOverYNeg = Number.isFinite(plane.gridOverYNeg) ? plane.gridOverYNeg : goFallback;
  // 눈금 숫자 이동 오프셋 복원(요구 ②).
  cfg.tickMovable = true;
  const restoreOffs = (arr) => Array.isArray(arr) ? arr.map((o) => (o && (Number.isFinite(o.dx) || Number.isFinite(o.dy))) ? { dx: o.dx || 0, dy: o.dy || 0 } : { dx: 0, dy: 0 }) : [];
  cfg.tickOffX = restoreOffs(plane.tickOffX);
  cfg.tickOffY = restoreOffs(plane.tickOffY);
  // '표시' 레이어 복원(요구 ③).
  const rArr = (a) => Array.isArray(a) ? JSON.parse(JSON.stringify(a)) : [];
  cfg.annMarkers = rArr(plane.annMarkers);
  cfg.annGuides = rArr(plane.annGuides);
  cfg.annArrows = rArr(plane.annArrows);
  cfg.guideLines = rArr(plane.guideLines);
  cfg.legends = rArr(plane.legends);
  cfg.annLabelPoints = rArr(plane.annLabelPoints);
  cfg.graphAnnotations = rArr(plane.graphAnnotations);
  if(cfg.engineBounds){cfg.explicitTicksX=rArr(plane.explicitTicksX);cfg.explicitTicksY=rArr(plane.explicitTicksY);if(cfg.tickMode==='text'){cfg.tickTextX=cfg.explicitTicksX.map(t=>t.label??'').join(', ');cfg.tickTextY=cfg.explicitTicksY.map(t=>t.label??'').join(', ');}if(cfg.engineY2?.explicitTicks)cfg.y2TickText=cfg.engineY2.explicitTicks.map(t=>t.label??'').join(', ');}

  // A graph is always moved as one unit; labels remain individually draggable.
  cfg.lockPosition = true;
  if (plane.reconstruction?.preserveAxes) {
    cfg.exactLabelSizes = { axis: plane.axisLabelSize || 3.5, tick: plane.tickLabelSize || 2.6 };
    cfg.originLabelSize = plane.originLabelSize || cfg.exactLabelSizes.axis * 0.82;
    cfg.guideStyle = plane.guideStyle ? structuredClone(plane.guideStyle) : { strokeWidth: (plane.strokeWidth || 0.3) * 0.45, dashLength: 0.45, dashGap: 0.35 };
    cfg.exactBounds = Object.fromEntries(['xMin','xMax','yMin','yMax','gridStepX','gridStepY','tickStepX','tickStepY'].map(k => [k, plane[k]]));
    cfg.explicitTicksX = rArr(plane.explicitTicksX); cfg.explicitTicksY = rArr(plane.explicitTicksY);
    cfg.exactY2 = plane.y2 ? structuredClone(plane.y2) : null;
    cfg.tickTextX=cfg.explicitTicksX.map(t=>t.label??'').join(', ');cfg.tickTextY=cfg.explicitTicksY.map(t=>t.label??'').join(', ');
    if(cfg.exactY2?.explicitTicks)cfg.y2TickText=cfg.exactY2.explicitTicks.map(t=>t.label??'').join(', ');
    // Older imports used the whole range as a fallback cell size. Recover a
    // useful editing interval without altering the stored graph on a no-op.
    for (const axis of ['x','y']) {
      const upper=axis.toUpperCase(),key=`gridStep${upper}`,b=cfg.exactBounds;
      if (b[key] === b[`${axis}Max`]-b[`${axis}Min`] && plane[`explicitTicks${upper}`]?.length > 1) {
        const step=inferAxisStep({min:b[`${axis}Min`],max:b[`${axis}Max`],ticks:plane[`explicitTicks${upper}`]});
        cfg.inferredSteps ||= {};cfg.inferredSteps[upper]={originalGrid:b[key],originalTick:b[`tickStep${upper}`]};
        b[key]=b[`tickStep${upper}`]=cfg[`tickStep${upper}`]=step;
      }
      if (plane[`${axis}Scale`] !== 'log') {
        const margins=axisMargins({...plane,...b},axis);
        if(!Number.isFinite(plane[`pad${upper}Pos`]))cfg[`pad${upper}Pos`]=margins.positive;
        if(!Number.isFinite(plane[`pad${upper}Neg`]))cfg[`pad${upper}Neg`]=margins.negative;
      }
    }
    cfg.exactInitial = structuredClone(cfg);
  }
  if(cfg.engineBounds)cfg.boundsInitial=structuredClone(cfg);
  _cfg = cfg;

  _series = [];
  const styleIdxOf = (fg) => {
    const dl = fg.dashLength ?? 0, dg = fg.dashGap ?? 0;
    const i = LINE_STYLES.findIndex(([, a, b]) => Math.abs(a - dl) < 1e-6 && Math.abs(b - dg) < 1e-6);
    return i;
  };
  for (const fg of objs) {
    if (fg.type !== "funcgraph" || fg.planeId !== plane.id) continue;
    if(fg.sourceKind==='region'){cfg.regions.push({...structuredClone(fg.regionSpec),objectId:fg.id});continue;}
    const preserved = { ...seriesFeatureFields(fg), seriesId:fg.seriesId, customStyle:fg.customStyle,customStyleWidth:fg.customStyleWidth, objectId: fg.id, labelWeight: fg.labelWeight, haloRatio: fg.haloRatio, handlesMode: fg.handlesMode, closed: !!fg.closed, segmentModes: rArr(fg.segmentModes), customDash: [fg.dashLength ?? 0, fg.dashGap ?? 0], endLabelSize: fg.endLabelSize, reconstruction: fg.reconstruction ? structuredClone(fg.reconstruction) : undefined, endpointMarkers: rArr(fg.endpointMarkers), breaks: rArr(fg.breaks), area: fg.area ? { ...structuredClone(fg.area), on: true } : null };
    if (fg.sourceKind === "bar" || fg.bars) {
      // 막대 재편집: 세계좌표 사각형(bars)이 아니라 원본 math 스펙(barItems)을 되읽는다.
      // 사각형은 평면이 바뀌면 어차피 bakeBars가 다시 구우므로 버린다.
      const items = Array.isArray(fg.barItems)
        ? fg.barItems.map((it) => ({ ...it, label: it.label || "", value: it.value }))
        : (fg.bars && Array.isArray(fg.bars.items) ? fg.bars.items.map((r) => ({ label: r.label || "", value: 0 })) : []);
      _series.push({
        ...preserved, kind: "bar", axis: fg.axis === "y2" ? "y2" : "y", items,
        widthRatio: Number.isFinite(fg.barWidthRatio) ? fg.barWidthRatio : 0.55,
        fillStyle: fg.barFill || "gray", barBase:fg.barBase,
        styleIdx: 0, strokeWidth: fg.strokeWidth ?? 0.3,
        endLabel: "", movable: false, markers: [], guides: [], arrows: [],
      });
    } else if (fg.sourceKind === "points") {
      const pts = Array.isArray(fg.mathPoints) && fg.mathPoints.length
        ? fg.mathPoints.map((p) => ({ x: p.x, y: p.y }))
        : (fg.points || []).map((p) => mathFromWorld(planeForSeries(fg, plane), p.x, p.y));
      _series.push({ ...preserved, kind: "points", axis: fg.axis === "y2" ? "y2" : "y", pts, styleIdx: styleIdxOf(fg), strokeWidth: fg.strokeWidth ?? 0.3, curveStyle: fg.curveStyle || "straight", curvature: Number.isFinite(fg.curvature) ? fg.curvature : 1, endLabel: fg.endLabel || "", autoExtend: !!fg.autoExtend, handles: (Array.isArray(fg.handlesMath) && fg.handlesMath.length === pts.length) ? fg.handlesMath.map((h) => ({ ...h })) : null, ...loadElements(fg, plane) });
    } else {
      _series.push({
        ...preserved, kind: "expr", range: Number.isFinite(fg.rangeMin) && Number.isFinite(fg.rangeMax) ? { min: fg.rangeMin, max: fg.rangeMax } : null, axis: fg.axis === "y2" ? "y2" : "y", expr: fg.expr || "",
        // domainAuto가 있으면(이 수정 이후 저장분) 그 값을 그대로 신뢰 — true면 '자동'으로
        // 복원해 평면 범위가 넓어지면 함수도 같이 넓게 다시 그려진다. domainAuto가 없는
        // 옛 파일은 이전 동작 그대로(명시 정의역으로 취급) — 하위호환.
        domain: (!fg.domainAuto && fg.domainMin != null && fg.domainMax != null) ? { min: fg.domainMin, max: fg.domainMax } : null,
        styleIdx: styleIdxOf(fg), strokeWidth: fg.strokeWidth ?? 0.3, curveStyle: fg.curveStyle || "smooth", curvature: Number.isFinite(fg.curvature) ? fg.curvature : 1,
        offset: (fg.offset && Number.isFinite(fg.offset.dx)) ? { dx: fg.offset.dx, dy: fg.offset.dy } : { dx: 0, dy: 0 },
        endLabel: fg.endLabel || "", autoExtend: !!fg.autoExtend,
        // 면적 채움: baseY는 평면에서 다시 구우므로 버리고 구간·모양만 되읽는다.
        area: fg.area ? {
          on: true,
          from: Number.isFinite(fg.area.from) ? fg.area.from : null,
          to: Number.isFinite(fg.area.to) ? fg.area.to : null,
          level: Number.isFinite(fg.area.level) ? fg.area.level : 220,
          edges: fg.area.edges !== false,
          label: fg.area.label || "",
        } : null,
        ...loadElements(fg, plane),
      });
    }
  }
  _series.forEach(s=>{if(s.kind==='points')s.editStartPoints=structuredClone(s.pts);});
  _sel = _series.length ? 0 : -1;
}

/* ----- PUBLIC: 열기. planeId 없으면 새로 만들기, 있으면 그 그래프를 편집.
 *   startTab: "coord"(기본) | "func" — F 단축키/버튼 진입점이 시작 탭을 지정. 확정: 둘 다 좌표 먼저. ----- */
export function openGraphModal(planeId = null, startTab = "coord", editingContext = null) {
  _inlineText?.cancel(); _draftHistory = null;
  _focusReturn = document.activeElement;
  _editingContext = editingContext;
  if (!_overlay) _overlay = build();
  _seriesNames = new WeakMap(); _seriesNameCount = 0;
  _seriesInputDrafts = new WeakMap(); _expressionErrors = new Map();
  const plane = planeId ? editorState().get().objects.find((o) => o.id === planeId && o.type === "coordplane") : null;
  if (plane) {
    _mode = "edit"; _planeId = plane.id;
    loadFromPlane(plane);
  } else {
    _mode = "create"; _planeId = null;
    _cfg = defaultCfg();
    _series = []; _sel = -1;
  }
  _placeMode = null; _activeDraw = -1;   // 열 때는 배치·그리기 모드 초기화
  _regionPointer = null;
  _annMode = null; _annPending = null;   // 표시 배치 모드도 초기화
  _selectedAnnotationId = null; _annotationSignature = ''; _annotationCfg = null;
  _displaySelection = null; _engineControls?.selectRegion(null);
  _overlay.querySelector('#gm-graph-annotations').replaceChildren();
  _overlay.querySelector('#gm-typed-properties').replaceChildren();
  _overlay.querySelector('#gm-legacy-properties').replaceChildren();
  _overlay.querySelector('#gm-line-detail').open = false;
  _overlay.querySelector('#gm-style-detail').open = false;
  _lpSel = -1;                           // 라벨러 표시점 선택도 초기화(옛 인덱스가 남지 않게)
  if (_els.advPanel) { _els.advPanel.hidden = true; _els.advOpen.setAttribute('aria-expanded','false'); if (_els.advCaret) _els.advCaret.textContent = "▾"; }   // 고급 패널은 접힌 채로 시작
  _els.title.textContent = _mode === "edit" ? "그래프 편집" : "그래프 만들기";
  _els.confirm.textContent = _mode === "edit" ? "적용" : "캔버스로 내보내기";
  _els.confirm.classList.add('modal-btn-primary');
  _overlay.querySelector('#gm-send-exam').hidden=!!editingContext || !document.querySelector('#exam-send');
  _els.error.textContent = "";
  _overlay.querySelectorAll("input, textarea, select").forEach(input => input.setCustomValidity(""));
  _overlay.hidden = false;
  _traceController?.destroy(); _traceTouched = !plane && !!editingContext?.traceReference;
  _traceController = createTraceEditor({
    toolbarHost: _overlay.querySelector('#gm-trace-toolbar-host'), previewHost: _els.preview,
    reference: editingContext?.traceReference || plane?.graphTrace?.reference || null,
    initialState: plane?.graphTrace || editingContext?.traceState || null,
    onChooseReference: chooseTraceLibrary,
    onChange: (settings, {initial=false}={}) => { if(!initial)_traceTouched=true; _numberFields?.format(); },
    onInteractionChange: interaction => {
      if (interaction) { _placeMode=null; _annMode=null; _activeDraw=-1; _boxMode=false; _areaMode=false; }
    },
  });
  _overlay.querySelector('.gm-modal').tabIndex = -1;
  _disposeEscape?.(); _disposeEscape = registerEscapeLayer(_overlay.querySelector('.gm-modal'),handleGraphEscape);
  _series.forEach(seriesName);
  setTab(startTab === "func" ? "func" : "coord");
  syncCfgControls();
  syncReconstructionControls();
  renderChips();
  syncSeriesEditor();
  _editBaseline = null;
  refreshPreview();
  _editBaseline = plane ? {cfg:structuredClone(_cfg),series:structuredClone(_series)} : null;
  _draftHistory = createDraftHistory({
    capture: () => ({cfg: _cfg, series: _series}),
    restore: value => {
      _cfg = value.cfg; _series = value.series;
      _sel = Math.min(_sel, _series.length - 1); _displaySelection = null; _selectedAnnotationId = null;
      _placeMode = null; _annMode = null; _activeDraw = -1;
      _seriesInputDrafts = new WeakMap();
      syncCfgControls(); syncAnnLists(); renderChips(); syncSeriesEditor(); refreshPreview();
    },
    changed: ({canUndo,canRedo}) => {
      _overlay.querySelector('#gm-undo').disabled = !canUndo;
      _overlay.querySelector('#gm-redo').disabled = !canRedo;
    },
  });
  (startTab === 'func' ? _els.tabFuncBtn : _els.tabCoordBtn).focus({preventScroll:true});
}

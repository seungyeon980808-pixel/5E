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
 * 평면 속성만 갱신(박스 위치·크기 보존)하고 계열은 전량 재생성한다 — 표시점/수선
 * 등 부속 객체는 funcgraph id가 아니라 planeId만 참조하므로 안전. */

import { state, ptToMm, mmToPt } from "../state.js?v=1.2.0";
import { makeDefaultCoordplane } from "../function-graph/defaults.js?v=1.2.0";
import { renderCoordplane, renderFuncgraph, smoothSamplePts, catmullRomHandles, bezierSamplePts, markerRadius } from "../render/coordplane.js?v=1.2.0";
import { sampleFunctionPoints } from "../function-graph/sampler.js?v=1.2.0";
import { worldFromMath, mathFromWorld } from "../function-graph/coords.js?v=1.2.0";
import { nextObjectId } from "../tools/id.js?v=1.2.0";
import { simplifyRDP, fdPerpDist } from "../geometry.js?v=1.2.0";

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
];
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
let _mode = "create";             // "create" | "edit"
let _planeId = null;              // edit 대상 coordplane id
let _cfg = null;                  // 좌표 틀 설정(진실 원본 — DOM 리스너가 여기에 쓴다)
let _series = [];                 // [{kind:"expr",expr,domain:{min,max}|null,...} | {kind:"points",pts:[{x,y}수학],...}]
let _sel = -1;                    // 선택 계열 index
let _previewSvg = null;           // 클릭 좌표 환산용
let _previewPlane = null;
let _placeMode = null;            // null | "marker" | "guide" | "arrow" — 미리보기 클릭 배치 모드
let _annMode = null;              // '표시' 탭 배치 모드: null | "marker"|"guide"|"arrow"|"guideline"|"legend"
let _annPending = null;           // 두 점짜리(화살표·가이드라인)의 첫 점 임시 저장
let _lpSel = -1;                  // 선택된 라벨러 표시점 index(-1=없음). PageUp/Down 각도 회전 대상
let _boxMode = false;             // 사각형 드래그로 정의역·치역을 한 번에 지정하는 중
let _selPts = null;               // 선택 계열의 baked world points(배치 고스트 스냅·클릭 가드용)
let _selBreaks = null;            // 선택 계열의 끊긴 구간 경계(worldYAtX가 빈 구간 건너뛰게)
let _allSeriesPts = [];           // 모든 계열의 baked world points [{pts,breaks}] — '표시' 탭 스냅용
let _activeDraw = -1;             // 클릭으로 '그리는 중'인 점 계열 index(-1=없음). 빈 클릭 선택해제 판정용

/* ---------- 기본값 ---------- */
function defaultCfg() {
  return {
    variant: "quadrant", xNeg: 0, xPos: 5, yNeg: 0, yPos: 5,
    tickStepX: 1, tickStepY: 1,    // 한 칸이 나타내는 값(숫자 눈금 라벨 전용; 물리 칸은 불변)
    labelX: "x", labelY: "y", showX: true, showY: true,
    origin: "0", showOrigin: true,
    showGrid: true, showTicks: true,
    tickMode: "none",             // "none" | "number" | "multiple" | "text"
    tickTextX: "", tickTextY: "", // 직접 모드: 쉼표 구분 입력 원문
    tickBaseX: "", tickBaseY: "", // 배수 모드: 기준 문자(t_0 → t₀, 2t₀, 3t₀… 자동)
    axisLabelScale: 1.0,          // 축 이름 글씨 배율(요구: 성분 라벨과 분리)
    tickLabelScale: 1.0,          // 눈금·성분(끝 라벨 포함) 글씨 배율
    lockPosition: true,           // 좌표·함수 묶기 = 기본 ON(요구)
    labelMovable: false,          // 축 라벨 이동 가능 — 켜면 미리보기에서 드래그(요구)
    labelXOffset: { dx: 0, dy: 0 }, // 축 이름 위치 오프셋(월드 mm; 드래그로 조정)
    labelYOffset: { dx: 0, dy: 0 },
    labelXPos: null, labelYPos: null, // 옮긴 축 이름의 박스 기준 절대 분율(요구 2). null=축 앵커 사용
    tickMovable: false,           // 눈금 숫자 이동 가능(요구 ②) — 켜면 숫자를 드래그
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
function newExprSeries() { return { kind: "expr", expr: "", domain: null, range: null, styleIdx: 0, strokeWidth: 0.4, curveStyle: "smooth", curvature: 1, offset: { dx: 0, dy: 0 }, endLabel: "", autoExtend: false, movable: false, markers: [], guides: [], arrows: [] }; }
function newPointsSeries() { return { kind: "points", pts: [], handles: null, styleIdx: 0, strokeWidth: 0.4, curveStyle: "straight", curvature: 1, endLabel: "", autoExtend: false, movable: false, markers: [], guides: [], arrows: [] }; }

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
  for (let k = 1; k <= Math.max(1, count); k++) out.push(k === 1 ? b : `${k}${b}`);
  return out;
}
function applyCfg(plane, cfg) {
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
  plane.graphCfg = { xNeg, xPos, yNeg, yPos, tickStepX: plane.tickStepX, tickStepY: plane.tickStepY };   // 재편집 시 범위·간격 복원용 스펙
  return plane;
}

// 라벨 크기를 셀(칸) 크기에 비례해 크게(기본값 상향 — 사진처럼, 종전보다 +30%). 박스 정해진 뒤 호출.
function cellOf(plane) { const d = (plane.xMax - plane.xMin) || 1; return plane.w / d; }
const LABEL_TRIM = 0.35;   // 라벨을 약 1pt(≈0.35mm) 작게(요구)
function setLabelSizes(plane) {
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
  const ux = (plane.xMax - plane.xMin) ? plane.w / (plane.xMax - plane.xMin) : 0;
  const uy = (plane.yMax - plane.yMin) ? plane.h / (plane.yMax - plane.yMin) : 0;
  const dwx = offset.dx * ux, dwy = -offset.dy * uy; // +y=위(월드 y 반전)
  return worldPts.map((p) => ({ x: p.x + dwx, y: p.y + dwy }));
}

// 데이터(계열)가 놓일 수 있는 수학 범위 = 눈금 끝 + 격자 초과분(반 칸). 화살표 마진은 제외 —
// 함수/점이 화살표 아래까지 뻗지 않도록. 점 스냅 클램프·함수 기본 정의역에 공통 사용.
function dataBounds(plane) {
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
    return wy == null ? null : { x: w.x, y: wy, dx: 1, dy: 0 };
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
  if (!svg || _tab !== "annot") return;
  svg.querySelectorAll("[data-labelpt]").forEach((c) => {
    const i = parseInt(c.getAttribute("data-labelpt"), 10);
    if (!Number.isFinite(i)) return;
    if (!_annMode) {
      c.style.cursor = "pointer";
      c.setAttribute("pointer-events", "all");
      c.addEventListener("click", (e) => {
        e.stopPropagation();                     // 빈 화면 클릭(선택 해제)로 새어나가지 않게
        if (_lpSel === i) return;
        _lpSel = i; renderLabelPtEditor(); refreshPreview();
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
  const o0 = worldFromMath(plane, 0, 0);
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
    const p = resolveSpec(a, plane, pts, breaks);
    if (!p) return;
    const dir = a.dir < 0 ? -1 : 1;   // 방향 반전은 화살촉을 제자리에 둔 채 향만 뒤집는다
    arrowMarks.push({ x: p.x, y: p.y, dx: p.dx * dir, dy: p.dy * dir, strokeWidth: ARROW_SW });
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
  plane.w = totalX * cell; plane.h = totalY * cell;
  plane.x = at.x - plane.w / 2; plane.y = at.y - plane.h / 2;
  setLabelSizes(plane);
  return plane;
}

/* ---------- 계열 → funcgraph 필드 준비 (plane 기준 샘플/베이크) ---------- */
// 반환 { ok:true, list:[fgFields] } | { ok:false, error }. 빈 계열은 조용히 건너뜀(빈 틀 허용).
function prepareSeries(plane) {
  const list = [];
  const endSize = endLabelSizeOf(plane); // 끝 라벨(눈금 라벨과 동일 크기)
  const db = dataBounds(plane);
  for (const s of _series) {
    const [, dl, dg] = LINE_STYLES[s.styleIdx] || LINE_STYLES[0];
    const common = {
      type: "funcgraph", closed: false, strokeLevel: 0,
      strokeWidth: Number.isFinite(s.strokeWidth) ? s.strokeWidth : 0.4,
      dashLength: dl, dashGap: dg,
      endLabel: s.endLabel || "", endLabelSize: endSize, label: "", labelShow: false,
      curveStyle: s.curveStyle || (s.kind === "expr" ? "smooth" : "straight"),  // 선 모양(직선/곡선)
      curvature: Number.isFinite(s.curvature) ? s.curvature : 1,                // 곡률(요구)
      // 위치 고정은 개별 잠금(positionLocked)이 아니라 '평면+계열 그룹 묶기'로 처리한다
      // (요구: 좌표와 함께 움직임). 그룹 배선은 commitCreate/commitEdit에서.
      locked: false, positionLocked: false,
    };
    if (s.kind === "expr") {
      const expr = String(s.expr || "").trim();
      if (!expr) continue;
      // 자동 정의역은 데이터 범위(눈금 끝+반 칸)까지 — 화살표 마진 아래로 저절로 뻗지 않게.
      // 반면 사용자가 정의역을 직접 준 경우엔 평면 박스 끝까지 허용한다(격자로 가두지 않는다).
      const pb = plotBounds(plane);
      const dMin = s.domain ? Math.max(pb.xMin, Math.min(s.domain.min, s.domain.max)) : db.xMin;
      const dMax = s.domain ? Math.min(pb.xMax, Math.max(s.domain.min, s.domain.max)) : db.xMax;
      const { points: sampled, breaks, error } = sampleFunctionPoints(expr, dMin, dMax, plane, { yRange: s.range });
      if (error) return { ok: false, error: `${expr}: ${error}` };
      if (sampled.length < 2) return { ok: false, error: `${expr}: 정의역 안에서 그릴 점이 없습니다` };
      const points = applyOffset(sampled, plane, s.offset);   // 함수식 자유 이동
      const off = s.offset && Number.isFinite(s.offset.dx) ? { dx: s.offset.dx, dy: s.offset.dy } : { dx: 0, dy: 0 };
      // breaks(끊긴 구간)를 함수그래프에 함께 저장 → 렌더러가 그 경계에서 선을 끊는다(가짜선 방지).
      // domainMin/domainMax는 항상 채워지는 '실제 그린 범위'(재샘플용) — '자동'이었는지는
      // 별도 domainAuto 플래그로 남겨야, 재편집·평면 범위 확장 시 domain을 다시 자동으로
      // 넓힐 수 있다(안 남기면 항상 '명시 정의역'으로 보여 옛 경계에 갇힌다).
      list.push({ ...common, expr, domainMin: dMin, domainMax: dMax, domainAuto: !s.domain,
        points, breaks, offset: off,
        rangeMin: s.range ? Math.min(s.range.min, s.range.max) : null,
        rangeMax: s.range ? Math.max(s.range.min, s.range.max) : null,
        ...elementFields(s, plane, points, breaks) });
    } else {
      if (!s.pts || s.pts.length < 2) continue;
      const mathPoints = s.pts.map((p) => ({ x: p.x, y: p.y }));   // 원본(재편집용)
      const uh = useHandles(s);
      const points = (uh ? s.pts : extendedMathPts(s)).map((m) => worldFromMath(plane, m.x, m.y)); // 렌더·베이크
      const wHandles = uh ? worldHandlesOf(s, plane) : null;
      const geom = wHandles ? bezierSamplePts(points, wHandles, 16) : geomPts(s, points);
      const obj = { ...common, sourceKind: "points", mathPoints, points, breaks: [], autoExtend: !!s.autoExtend, ...elementFields(s, plane, geom) };
      // 베지어 핸들: world 제어점(렌더용) + math 오프셋(재편집용)을 함께 저장.
      if (uh) { obj.handles = wHandles; obj.handlesMath = s.handles.map((h) => ({ ...h })); }
      list.push(obj);
    }
  }
  return { ok: true, list };
}

/* ---------- 커밋: 생성 / 편집 ---------- */
function commitCreate() {
  const s0 = state.get();
  const vb = s0.viewBox;
  const plane = buildFrame(_cfg, { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 }, s0.artboard);
  const prep = prepareSeries(plane);
  if (!prep.ok) { _els.error.textContent = prep.error; return; }
  // "위치 고정" = 평면과 그 위 계열을 하나의 그룹으로 묶는다(요구 재정의). 못 움직이게
  // 잠그는 게 아니라, 평면을 끌면 계열이 함께 따라오도록 그룹 이동으로 동작한다.
  state.update((st) => {
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
  hide();
}

function commitEdit() {
  const cur = state.get().objects.find((o) => o.id === _planeId && o.type === "coordplane");
  if (!cur) { hide(); return; }
  // 검증은 먼저(실패 시 상태 무변경): 박스 보존 + 새 범위를 적용한 초안으로 샘플.
  const draft = applyCfg(JSON.parse(JSON.stringify(cur)), _cfg);
  const prep = prepareSeries(draft);
  if (!prep.ok) { _els.error.textContent = prep.error; return; }
  state.update((st) => {
    const o = st.objects.find((x) => x.id === _planeId && x.type === "coordplane");
    if (!o) return;
    const snap = JSON.parse(JSON.stringify(st.objects));
    applyCfg(o, _cfg);                       // 박스(x/y/w/h)는 그대로, 범위·표시만 갱신
    setLabelSizes(o);                        // 라벨 크기도 셀 기준으로 갱신
    // 옛 그래프 그룹 해체(계열을 전량 교체하므로 멤버 구성이 바뀐다) — 단, 이 그래프
    // 자신의 자동 그룹("grp_"+id)일 때만. 사용자가 직접 만든 수동 그룹(예: 평면+텍스트
    // 상자를 Ctrl+G로 묶은 것)까지 종류 불문 해체하면, 무관한 멤버들의 groupId까지
    // 조용히 벗겨져 그룹 배치가 풀린다 — 자동 그룹인지 정확히 구분해서만 해체한다.
    // (마커/수선/화살표는 planeId 참조라 유지됨 — 위치 재베이크는 백로그).
    const oldGid = o.groupId;
    const isAutoGid = oldGid === "grp_" + o.id;
    if (oldGid && isAutoGid) {
      st.groups = (st.groups || []).filter((g) => g.id !== oldGid);
      st.objects.forEach((x) => { if (x.groupId === oldGid) delete x.groupId; });
    }
    st.objects = st.objects.filter((x) => !(x.type === "funcgraph" && x.planeId === o.id));
    const memberIds = [o.id];
    for (const f of prep.list) {
      f.id = nextObjectId(); f.planeId = o.id;
      f.order = st.objects.length; f.layerId = o.layerId ?? st.activeLayerId;
      st.objects.push(f);
      memberIds.push(f.id);
    }
    // 수동 그룹(oldGid가 있는데 자동 그룹이 아님)이면 재구성하지 않는다 — 사용자의 기존
    // 그룹 소속을 그대로 둔다(새 함수그래프만 그 그룹 밖에 남음, 자동그룹 재부여로
    // 수동 그룹에서 조용히 빼내지 않기 위함).
    if (_cfg.lockPosition && memberIds.length > 1 && (isAutoGid || !oldGid)) {
      const gid = "grp_" + o.id;
      for (const id of memberIds) { const x = st.objects.find((y) => y.id === id); if (x) x.groupId = gid; }
      (st.groups = st.groups || []).push({ id: gid, memberIds });
    }
    st.undoStack.push(snap);
    st.redoStack = [];
    st.selectedIds = [o.id];
    st.targetedId = null;
  });
  hide();
}

/* ---------- 미리보기 ---------- */
function seriesColorSel(el) { el.querySelectorAll("path,polyline").forEach((p) => { p.style.stroke = "var(--accent)"; }); }

// 점 계열 그리기 완료: 선택 해제(러버밴드 종료). Enter/우클릭에서 호출.
function finishPointsSeries() {
  const s = _series[_sel];
  if (!s || s.kind !== "points") return;
  _sel = -1; _activeDraw = -1;
  syncSeriesEditor(); renderChips(); refreshPreview();
}

function refreshPreview() {
  if (!_els) return;
  const plane = buildFrame(_cfg, { x: 0, y: 0 }, { w: 90, h: 60 });
  _previewPlane = plane;
  const mX = 14, mY = 13;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "gm-preview-svg");
  svg.setAttribute("viewBox", `${plane.x - mX} ${plane.y - mY} ${plane.w + 2 * mX} ${plane.h + 2 * mY}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.appendChild(renderCoordplane(plane));
  markSelLabelPt(svg);   // 선택된 라벨러 표시점에 강조 링(편집 중 안내 — 결과물엔 안 나간다)

  let selError = "";
  _selPts = null; _selBreaks = null;   // 선택 계열의 baked points/경계를 이 렌더에서 갱신(배치 고스트·클릭 가드용)
  _allSeriesPts = [];                  // 모든 계열 곡선(표시 탭 스냅용)을 이 렌더에서 다시 모은다
  _series.forEach((s, i) => {
    const [, dl, dg] = LINE_STYLES[s.styleIdx] || LINE_STYLES[0];
    let pts = null, sourceKind, curveStyle, breaks = null;
    if (s.kind === "expr") {
      const expr = String(s.expr || "").trim();
      if (!expr) return;
      const db = dataBounds(plane), pb = plotBounds(plane);   // 자동=격자 끝, 직접 지정=평면 박스 끝
      const dMin = s.domain ? Math.max(pb.xMin, Math.min(s.domain.min, s.domain.max)) : db.xMin;
      const dMax = s.domain ? Math.min(pb.xMax, Math.max(s.domain.min, s.domain.max)) : db.xMax;
      const r = sampleFunctionPoints(expr, dMin, dMax, plane, { yRange: s.range });
      if (r.error) { if (i === _sel) selError = r.error; return; }
      if (r.points.length < 2) { if (i === _sel) selError = "정의역 안에 그릴 점이 없습니다"; return; }
      pts = applyOffset(r.points, plane, s.offset);   // 함수식 자유 이동 반영
      breaks = r.breaks;                             // 끊긴 구간(평면 밖·치역 밖) 경계
    } else {
      if (!s.pts.length) return;
      // 핸들(베지어 변환)이 있으면 자동 연장 없이 s.pts 그대로 + 핸들로 렌더.
      pts = (useHandles(s) ? s.pts : extendedMathPts(s)).map((m) => worldFromMath(plane, m.x, m.y));
      sourceKind = "points"; curveStyle = "straight";
      breaks = [];   // 손그림 곡선은 끊김 없는 연속선 — 거리 휴리스틱으로 쪼개지지 않게 명시
    }
    const wHandles = worldHandlesOf(s, plane);                   // 핸들 있으면 world 제어점, 없으면 null
    const geom = wHandles ? bezierSamplePts(pts, wHandles, 16) : geomPts(s, pts);  // 요소 베이크/스냅용 곡선
    if (i === _sel) { _selPts = geom; _selBreaks = breaks; }     // 선택 계열 곡선+경계(배치 스냅 기준)
    if (Array.isArray(geom) && geom.length >= 2) _allSeriesPts.push({ pts: geom, breaks });  // 표시 탭 스냅용
    const el = renderFuncgraph({
      points: pts, strokeLevel: 0, strokeWidth: s.strokeWidth, breaks,
      dashLength: dl, dashGap: dg, sourceKind,
      curveStyle: s.curveStyle || (s.kind === "points" ? "straight" : "smooth"),
      curvature: s.curvature, handles: wHandles,                // 있으면 렌더가 진짜 3차 베지어로
      endLabel: s.endLabel, endLabelSize: endLabelSizeOf(plane),
      ...bakeElements(s, plane, geom, breaks),  // 표시점/수선/화살표 실시간 미리보기
    });
    if (i === _sel) seriesColorSel(el);
    markPlacedElements(el);
    svg.appendChild(el);
    // 선택된 점 계열: 실제로 '찍은' 점만 파란 점으로 표시(자동 연장점은 제외).
    // 각 점은 드래그 핸들(요구: 자유곡선을 마우스 드래그로 변형) — 점을 끌면 s.pts가
    // 갱신되고, 곡선 모양이면 스무딩이 다시 돌아 매끄러운 곡선으로 따라온다.
    if (s.kind === "points" && i === _sel) {
      // '그리는 중'이면 기존 점 위에 드래그 히트 원을 얹지 않는다 — 얹으면 그 원이 클릭을
      // 가로채(stopPropagation) 같은 점을 다시 찍을 수 없어 폐쇄 고리((1,1)→…→(1,1))가
      // 완성되지 않는다(버그). 그리기 중엔 클릭이 svg 핸들러로 가 꼭짓점이 추가되고,
      // 드래그 편집 핸들은 그리기를 마친 뒤(선택 상태)에 되살아난다.
      const drawingThis = _activeDraw === i && !_placeMode;
      s.pts.forEach((mp, pi) => {
        const w = worldFromMath(plane, mp.x, mp.y);
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
          s.pts.splice(pi, 1);
          if (s.handles) syncHandlesToStructure(s);
          syncSeriesEditor(); renderChips(); refreshPreview();
        });
        svg.appendChild(hitC);
      });
    }
    // 베지어 핸들 편집(스무스 노드): 선택된 자유곡선(변환됨)에서 각 앵커의 in/out 핸들을
    // 드래그해 곡선이 얼마나 볼록하게 휘는지 조절한다(잉크스케이프式). 두 핸들은 일직선 유지.
    if (i === _sel && wHandles && _activeDraw !== i && !_placeMode) {
      s.pts.forEach((mp, pi) => {
        const a = worldFromMath(plane, mp.x, mp.y);
        const mkHandle = (which) => {
          const h = s.handles[pi];
          const off = which === "out" ? { x: h.ox, y: h.oy } : { x: h.ix, y: h.iy };
          if (off.x === 0 && off.y === 0) return;   // 끝점의 없는 핸들은 안 그림
          const hw = worldFromMath(plane, mp.x + off.x, mp.y + off.y);
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
              const m = mathFromWorld(plane, w.x, w.y);
              const no = { x: m.x - mp.x, y: m.y - mp.y };   // 새 오프셋(math)
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
    if (i === _sel && !_placeMode && s.movable && _activeDraw !== i) {
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
          const ux = (plane.xMax - plane.xMin) ? plane.w / (plane.xMax - plane.xMin) : 1;
          const uy = (plane.yMax - plane.yMin) ? plane.h / (plane.yMax - plane.yMin) : 1;
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

  svg.addEventListener("click", (e) => {
    if (_boxMode) return;       // 범위 지정 중에는 클릭 배치·선택 해제가 끼어들지 않게
    if (freehandDraw) return;   // 자유곡선 그리기는 아래 pointer 핸들러가 전담(탭 점찍기 포함)
    // '표시' 레이어 배치(요구 ③): 곡선이 가까우면 스냅, 없으면 클릭 좌표 그대로 — 함수 없이도 동작.
    if (_annMode) {
      // 화살표(요구 5): 함수 위에서만, 클릭 '한 번'에 그 지점 접선 방향으로 화살촉을 놓는다.
      if (_annMode === "arrow") {
        const nc = nearestCurve(e.clientX, e.clientY);
        if (!nc) return;   // 곡선이 없으면(또는 못 잡으면) 배치하지 않는다
        (_cfg.annArrows = _cfg.annArrows || []).push({ x: nc.mx, y: nc.my, dx: nc.dx, dy: nc.dy });
        if (typeof syncAnnLists === "function") syncAnnLists();
        refreshPreview();
        return;
      }
      const hit = snapAnn(e.clientX, e.clientY);
      if (!hit) return;
      if (_annMode === "marker") (_cfg.annMarkers = _cfg.annMarkers || []).push({ x: hit.mx, y: hit.my });
      else if (_annMode === "guide") (_cfg.annGuides = _cfg.annGuides || []).push({ x: hit.mx, y: hit.my });
      else if (_annMode === "guideline") {
        if (!_annPending) { _annPending = { x: hit.mx, y: hit.my }; }   // 가이드라인 첫 점
        else { (_cfg.guideLines = _cfg.guideLines || []).push({ x1: _annPending.x, y1: _annPending.y, x2: hit.mx, y2: hit.my }); _annPending = null; }
      } else if (_annMode === "labelpt") {
        // 라벨러 표시점(요구 ⑥): 찍는 순서대로 A·B·C… 자동 부여(추후 개별 수정 가능).
        const arr = (_cfg.annLabelPoints = _cfg.annLabelPoints || []);
        arr.push({ x: hit.mx, y: hit.my, text: nextLabelLetter(arr.length), dist: 5, angle: 45, size: ptToMm(15) });
        _lpSel = arr.length - 1;   // 찍자마자 선택 상태 → PageUp/Down으로 바로 각도를 돌릴 수 있다(요구)
      }
      if (typeof syncAnnLists === "function") syncAnnLists();
      refreshPreview();
      return;
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

  // 축 라벨 이동(요구): 켜져 있으면 축 이름(data-axisname)을 드래그해 위치 오프셋을 조정한다.
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
        else { try { const b = el.getBBox(); baseW = { x: b.x + b.width / 2, y: b.y + b.height / 2 }; } catch (_) { baseW = { x: start.x, y: start.y }; } }
        const onMove = (ev) => {
          const w = clientToWorld(ev.clientX, ev.clientY);
          if (!w) return;
          const nx = baseW.x + (w.x - start.x), ny = baseW.y + (w.y - start.y);
          _cfg[posKey] = { fx: (nx - pl.x) / pl.w, fy: (ny - pl.y) / pl.h };
          refreshPreview();
        };
        const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
        window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
      });
    });
  }

  // 눈금 숫자 이동(요구 ②): 켜져 있으면 눈금 숫자(data-tick="axis:ord")를 드래그해 오프셋 조정.
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
      });
    });
  }

  // 범례 박스 이동(요구 ③): '표시' 탭에서 범례 박스를 드래그해 anchor(math)를 옮긴다.
  if (_tab === "annot") {
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

  _els.preview.replaceChildren(svg);
  _previewSvg = svg;
  // 배치 모드인데 선택 계열에 곡선이 없으면 안내(함수 위에서만 찍을 수 있음).
  if (!selError && _placeMode && !(Array.isArray(_selPts) && _selPts.length >= 2)) {
    selError = "먼저 함수(또는 직선·꺾은선)를 그린 뒤, 그 계열을 선택하고 함수 위를 클릭하세요.";
  } else if (!selError && _cfg && _cfg.labelMovable) {
    selError = "축 이름(예: y, t)을 드래그해 위치를 옮기세요.";
  }
  _els.error.textContent = selError;
}

// 미리보기 화면좌표 → 월드 좌표(스냅 없음). 축 라벨 드래그용.
function clientToWorld(cx, cy) {
  if (!_previewSvg || !_previewSvg.getScreenCTM) return null;
  const ctm = _previewSvg.getScreenCTM();
  if (!ctm) return null;
  const pt = _previewSvg.createSVGPoint();
  pt.x = cx; pt.y = cy;
  return pt.matrixTransform(ctm.inverse());
}

// 미리보기 좌표 → 수학 좌표(반 칸 스냅). 데이터가 정의역을 '적당히' 벗어날 수 있도록
// 정수 칸이 아니라 박스 전체 범위(xMin..xMax, 즉 마지막 눈금 + 여백까지)로 클램프한다.
function clientToMath(cx, cy) {
  if (!_previewSvg || !_previewSvg.getScreenCTM) return null;
  const ctm = _previewSvg.getScreenCTM();
  if (!ctm) return null;
  const pt = _previewSvg.createSVGPoint();
  pt.x = cx; pt.y = cy;
  const w = pt.matrixTransform(ctm.inverse());
  const m = mathFromWorld(_previewPlane, w.x, w.y);
  // 스냅 간격을 더 촘촘하게(칸의 1/8 = 종전 1/4의 2배) — 원하는 점을 정확히 지나게(요구).
  const sx = (_previewPlane.gridStepX || 1) / 8, sy = (_previewPlane.gridStepY || 1) / 8;
  const nx = Math.round(m.x / sx) * sx, ny = Math.round(m.y / sy) * sy;
  // 클램프는 '평면 박스'까지만 한다(요구). 격자 끝에서 막으면 정의역·치역이 격자에 갇힌 것처럼
  // 보여, 손으로 찍은 점·자유곡선이 마지막 눈금 밖으로 나가질 못한다.
  const pb = plotBounds(_previewPlane);
  return {
    x: Math.max(pb.xMin, Math.min(pb.xMax, nx)),
    y: Math.max(pb.yMin, Math.min(pb.yMax, ny)),
  };
}

/* ---------- 계열 칩 + 편집 패널 ---------- */
function seriesLabel(s) {
  if (s.kind === "expr") return "y=" + (String(s.expr || "").trim() || "…");
  const kind = (s.curveStyle === "smooth") ? "자유곡선" : "꺾은선";   // 하위 탭 타입에 맞춘 이름
  return (s.endLabel ? s.endLabel + " " : "") + `${kind} ${s.pts.length}점`;
}

function renderChips() {
  const host = _els.chips;
  host.replaceChildren();
  _series.forEach((s, i) => {
    if (funcTabOf(s) !== _funcTab) return;   // 현재 하위 탭 소속 계열만 칩으로 보인다
    const chip = document.createElement("button");
    chip.type = "button";
    const on = i === _sel;
    chip.style.cssText = "display:inline-flex;align-items:center;gap:6px;font: 12px monospace;max-width:170px;" +
      "border:1px solid " + (on ? "var(--accent)" : "var(--border)") + ";border-radius:4px;padding:3px 8px;cursor:pointer;" +
      "background:" + (on ? "color-mix(in srgb, var(--accent) 22%, var(--bg-input))" : "var(--bg-input)") + ";color:var(--text-primary);";
    const lbl = document.createElement("span");
    lbl.textContent = seriesLabel(s);
    lbl.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    chip.appendChild(lbl);
    const x = document.createElement("span");
    x.textContent = "×";
    x.style.cssText = "color:#e5534b;font-weight:700;flex:0 0 auto;";
    x.addEventListener("click", (e) => {
      e.stopPropagation();
      // splice 전에 '삭제 대상이 선택 중이었는지'와 '선택 앞쪽이 당겨지는지'를 먼저 판정한다
      // — 안 하면 앞쪽 계열 삭제로 배열이 한 칸 당겨질 때 _sel이 같은 자리를 가리켜 엉뚱한
      // (원래는 그 뒤에 있던) 계열이 조용히 선택으로 남고, 이후 입력이 그 계열을 덮어쓴다.
      const deletedWasSelected = i === _sel;
      _series.splice(i, 1);
      if (deletedWasSelected) {
        _sel = -1; // 선택 중이던 계열이 삭제됨 — 반드시 재선택
      } else if (i < _sel) {
        _sel -= 1; // 앞쪽이 당겨진 만큼 보정해 같은 계열을 계속 가리키게
      }
      // 삭제 후 선택은 현재 하위 탭 안에서 유지(밖이거나 없으면 이 탭 첫 계열, 없으면 해제).
      if (!_series[_sel] || funcTabOf(_series[_sel]) !== _funcTab) {
        _sel = _series.findIndex((ss) => funcTabOf(ss) === _funcTab);
      }
      _placeMode = null; _activeDraw = -1;
      renderChips(); syncSeriesEditor(); refreshPreview();
    });
    chip.appendChild(x);
    chip.addEventListener("click", () => { _sel = i; _placeMode = null; _activeDraw = -1; renderChips(); syncSeriesEditor(); refreshPreview(); });
    host.appendChild(chip);
  });
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
function legDashKey(d) {
  if (!Array.isArray(d)) return "solid";
  const hit = LEG_DASH.find((o) => Array.isArray(o.dash) && o.dash[0] === d[0] && o.dash[1] === d[1]);
  return hit ? hit.key : "dash";
}
function syncAnnLists() {
  if (!_els || !_els.annMarkerList) return;
  const fmt = (p) => `(${(+p.x).toFixed(1)}, ${(+p.y).toFixed(1)})`;
  const fill = (list, row, arr, label) => {
    list.replaceChildren();
    (arr || []).forEach((it, i) => list.appendChild(
      elemChip(label(it), () => { arr.splice(i, 1); syncAnnLists(); refreshPreview(); })));
    if (row) row.hidden = list.children.length === 0;
  };
  fill(_els.annMarkerList, _els.annMarkerRow, _cfg.annMarkers, fmt);
  fill(_els.annGuideList, _els.annGuideRow, _cfg.annGuides, fmt);
  fill(_els.annArrowList, _els.annArrowRow, _cfg.annArrows, (a) => fmt(a) + " →");
  fill(_els.annGuidelineList, _els.annGuidelineRow, _cfg.guideLines,
    (g) => `(${(+g.x1).toFixed(1)},${(+g.y1).toFixed(1)})–(${(+g.x2).toFixed(1)},${(+g.y2).toFixed(1)})`);
  fill(_els.annLabelPtList, _els.annLabelPtRow, _cfg.annLabelPoints,
    (lp) => `${lp.text ?? "?"} ${fmt(lp)}`);
  renderLabelPtEditor();
  const arm = (btn, on) => btn && btn.classList.toggle("on", on);
  arm(_els.annMarker, _annMode === "marker");
  arm(_els.annGuide, _annMode === "guide");
  arm(_els.annArrow, _annMode === "arrow");
  arm(_els.annGuideline, _annMode === "guideline");
  arm(_els.annLabelPt, _annMode === "labelpt");
  const H = {
    marker: "미리보기를 클릭해 표시점을 찍습니다.",
    guide: "미리보기를 클릭하면 그 점에서 두 축까지 점선(수선의 발)이 생깁니다.",
    arrow: "함수(곡선) 위를 클릭하면 그 자리에 접선 방향으로 화살촉이 놓입니다. 함수가 없으면 놓이지 않습니다.",
    guideline: "두 점을 클릭하면 그 사이에 안내 점선이 생깁니다.",
    labelpt: "미리보기를 클릭해 A·B·C… 순서로 표시점을 찍습니다. 찍은 점이 바로 선택되니 PageUp/PageDown으로 라벨 방향을 15°씩 돌리세요. 거리·글씨는 아래에서 조정합니다.",
  };
  _els.annHint.textContent = _annMode
    ? (_annPending ? "한 번 더 클릭해 끝점을 지정하세요." : H[_annMode])
    : "도구를 켜고 미리보기를 클릭해 배치합니다. 함수가 없어도 됩니다.";
  renderLegendEditor();
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
  const miniBtn = "font-size: 11px;padding:2px 7px;border:1px solid var(--border);border-radius:5px;background:var(--bg-input);color:inherit;cursor:pointer;";
  // 선택 표시는 '다시 그리기' 없이 스타일만 갈아끼운다 — 입력칸을 누르는 순간 DOM을 새로
  // 만들면 그 클릭이 사라진 요소로 가 포커스가 안 잡힌다.
  const rows = [];
  const paintSel = () => rows.forEach((r, i) => {
    r.style.background = i === _lpSel ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent";
    r.style.boxShadow = i === _lpSel ? "inset 2px 0 0 var(--accent)" : "none";
  });
  list.forEach((lp, i) => {
    const row = document.createElement("div");
    rows.push(row);
    row.style.cssText = "display:flex;gap:5px;align-items:center;margin:6px 0 0 102px;flex-wrap:wrap;"
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

    const rm = document.createElement("button"); rm.type = "button"; rm.textContent = "삭제"; rm.style.cssText = miniBtn;
    rm.addEventListener("click", () => {
      _cfg.annLabelPoints.splice(i, 1);
      if (_lpSel === i) _lpSel = Math.min(i, _cfg.annLabelPoints.length - 1);   // 지운 자리의 다음 점으로
      else if (_lpSel > i) _lpSel -= 1;
      syncAnnLists(); refreshPreview();
    });

    row.append(txt, distF.wrap, angleF.wrap, sizeF.wrap, rm);
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
    const box = document.createElement("div");
    box.style.cssText = "border:1px solid var(--border);border-radius:6px;padding:8px;margin:6px 0 0 102px;";
    const head = document.createElement("div");
    head.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;";
    const ttl = document.createElement("b"); ttl.style.fontSize = "12px"; ttl.textContent = `범례 ${li + 1}`;
    const delLeg = document.createElement("button"); delLeg.type = "button"; delLeg.textContent = "삭제"; delLeg.style.cssText = miniBtn;
    delLeg.addEventListener("click", () => { _cfg.legends.splice(li, 1); syncAnnLists(); refreshPreview(); });
    head.append(ttl, delLeg); box.appendChild(head);
    // 글씨 크기·실 길이 조정(요구 3). 값이 없으면 렌더러 기본(2.2 / size*2.4)을 쓴다.
    const sizeRow = document.createElement("div");
    sizeRow.style.cssText = "display:flex;gap:8px;margin-bottom:6px;align-items:center;font-size: 11px;color:var(--text-secondary);";
    const numField = (label, val, dflt, on) => {
      const wrap = document.createElement("span");
      wrap.style.cssText = "display:flex;align-items:center;gap:3px;";
      const lb = document.createElement("span"); lb.textContent = label;
      const inp = document.createElement("input"); inp.type = "number"; inp.step = "0.1"; inp.min = "0.5";
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
      const inp = document.createElement("input"); inp.type = "text"; inp.value = r.text || "";
      inp.placeholder = "예: y=f(x)"; inp.style.cssText = "flex:1;min-width:0;font-family:monospace;font-size: 12px;";
      inp.addEventListener("input", () => { r.text = inp.value; refreshPreview(); });
      const rm = document.createElement("button"); rm.type = "button"; rm.textContent = "×"; rm.style.cssText = miniBtn;
      rm.addEventListener("click", () => {
        lg.rows.splice(ri, 1);
        if (!lg.rows.length) _cfg.legends.splice(li, 1);
        syncAnnLists(); refreshPreview();
      });
      row.append(sel, inp, rm); box.appendChild(row);
    });
    const addRow = document.createElement("button"); addRow.type = "button"; addRow.textContent = "+ 줄 추가"; addRow.style.cssText = miniBtn;
    addRow.addEventListener("click", () => { (lg.rows = lg.rows || []).push({ dash: null, text: "" }); syncAnnLists(); refreshPreview(); });
    box.appendChild(addRow);
    host.appendChild(box);
  });
}

// 좌표 텍스트("0,0 1,2 3,2") ↔ pts[] 변환.
function ptsToText(pts) { return pts.map((p) => `${p.x},${p.y}`).join(" "); }
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
  const s = _series[_sel] || null;
  _els.editor.style.display = s ? "" : "none";
  _els.emptyHint.style.display = s ? "none" : "";
  if (!s) return;
  _els.exprRow.style.display = s.kind === "expr" ? "" : "none";
  _els.exprHelpers.style.display = s.kind === "expr" ? "flex" : "none";
  _els.domainRow.style.display = s.kind === "expr" ? "" : "none";
  _els.rangeRow.style.display = s.kind === "expr" ? "" : "none";
  _els.ptsRows.style.display = s.kind === "points" ? "" : "none";
  // 자동 연장선: 직선·꺾은선(점 계열)에만 의미 있음(눈대중 그리기). 끝 라벨과 한 줄(요구 8).
  _els.autoExtRow.style.display = s.kind === "points" ? "inline-flex" : "none";
  _els.autoExt.checked = !!s.autoExtend;
  _els.move.checked = !!s.movable;
  if (s.kind === "expr") {
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
  }
  [..._els.styleHost.children].forEach((b, i) => {
    b.style.color = (s.styleIdx === i) ? "var(--accent)" : "var(--text-label)";
    const on = i === s.styleIdx;
    b.style.background = on ? "color-mix(in srgb, var(--accent) 22%, var(--bg-input))" : "var(--bg-input)";
    b.style.borderColor = on ? "var(--accent)" : "var(--border)";
  });
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
  if (document.activeElement !== _els.width) _els.width.value = s.strokeWidth;
  if (document.activeElement !== _els.endLabel) _els.endLabel.value = s.endLabel;
  syncElementLists();
}

// 모양 프리셋 → 범위(neg/pos) 기본값. 음방향은 그 모양에 팔이 있을 때만 대칭값으로 채운다.
function applyVariantPreset(v) {
  _cfg.variant = v;
  const xp = Math.max(1, _cfg.xPos), yp = Math.max(1, _cfg.yPos);
  if (v === "quadrant") { _cfg.xNeg = 0; _cfg.yNeg = 0; }
  else if (v === "halfcross") { _cfg.xNeg = 0; _cfg.yNeg = yp; }
  else if (v === "cross") { _cfg.xNeg = xp; _cfg.yNeg = yp; }
}

/* ---------- 좌표(cfg) 컨트롤 동기화 ---------- */
function syncCfgControls() {
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
  const xNegOn = c.variant === "cross";
  const yNegOn = c.variant === "cross" || c.variant === "halfcross";
  // 흐림 처리는 스테퍼 칸 전체가 맡는다(.gm-step:has(input:disabled)) — 입력칸에 따로
  // opacity를 주면 이중으로 곱해져 글자가 안 보일 만큼 흐려진다.
  _els.xNeg.disabled = !xNegOn;
  _els.yNeg.disabled = !yNegOn;
  // '음의 방향' 행은 그 방향 축 팔이 있는 모양에서만 보인다 — ㄴ자에선 통째로 감춰
  // 잠긴 칸을 보여주지 않는다(종전엔 잠긴 칸이 늘 떠 있어 왜 못 쓰는지 헷갈렸다).
  const showNegRow = xNegOn || yNegOn;
  _els.overlay.querySelectorAll(".gm-neg-row").forEach((el) => {
    el.style.display = showNegRow ? "" : "none";
  });
  // 행은 보이는데 한쪽만 잠긴 경우(ㅏ자)에만 이유를 덧붙인다.
  const negNote = _els.overlay.querySelector("#gm-neg-note");
  if (negNote) negNote.style.display = (showNegRow && (!xNegOn || !yNegOn)) ? "" : "none";
  _els.labelX.value = c.labelX; _els.labelY.value = c.labelY;
  _els.showOrigin.checked = c.showOrigin;
  // 원점 표기는 0/O 두 버튼 세그먼트 — 현재 값 쪽에 .on을 준다(누를 수 있음이 드러나게).
  _els.originBtn.querySelectorAll("button[data-origin]").forEach((b) => {
    b.classList.toggle("on", b.dataset.origin === c.origin);
  });
  _els.showGrid.checked = c.showGrid;
  _els.showTicks.checked = c.showTicks;
  if (document.activeElement !== _els.axisScale) _els.axisScale.value = Math.round((c.axisLabelScale || 1) * 100);
  if (document.activeElement !== _els.tickScale) _els.tickScale.value = Math.round((c.tickLabelScale || 1) * 100);
  _els.lockPos.checked = !!c.lockPosition;
  _els.labelMove.checked = !!c.labelMovable;
  _els.tickMove.checked = !!c.tickMovable;
  _els.tickAlign.style.display = c.tickMovable ? "" : "none";
  // 고급: 화살표 여백·격자 튀어나옴 네 끝 값 반영. 음의 방향이 없는 모양에선 x−/y− 비활성.
  const setEnd = (el, v, on) => { if (!el) return; if (document.activeElement !== el) el.value = v; el.disabled = !on; };
  setEnd(_els.padXP, Number.isFinite(c.padXPos) ? c.padXPos : PAD_X, true);
  setEnd(_els.padXN, Number.isFinite(c.padXNeg) ? c.padXNeg : PAD_X, xNegOn);
  setEnd(_els.padYP, Number.isFinite(c.padYPos) ? c.padYPos : PAD_Y, true);
  setEnd(_els.padYN, Number.isFinite(c.padYNeg) ? c.padYNeg : PAD_Y, yNegOn);
  setEnd(_els.govXP, Number.isFinite(c.gridOverXPos) ? c.gridOverXPos : GRID_OVER, true);
  setEnd(_els.govXN, Number.isFinite(c.gridOverXNeg) ? c.gridOverXNeg : GRID_OVER, xNegOn);
  setEnd(_els.govYP, Number.isFinite(c.gridOverYPos) ? c.gridOverYPos : GRID_OVER, true);
  setEnd(_els.govYN, Number.isFinite(c.gridOverYNeg) ? c.gridOverYNeg : GRID_OVER, yNegOn);
  [..._els.tickModeHost.children].forEach((b) => {
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
}

/* ---------- 탭 전환 (좌표 / 함수) ---------- */
let _tab = "coord";               // "coord" | "func" | "annot"
function setTab(tab) {
  _tab = tab;
  // 좌표 탭으로 가면 선택돼 있던 함수를 해제한다(요구): 좌표를 볼 땐 함수 강조·배치모드가 남지 않게.
  if (tab === "coord" && (_sel !== -1 || _placeMode || _activeDraw !== -1)) {
    _sel = -1; _placeMode = null; _activeDraw = -1;
    if (typeof renderChips === "function") renderChips();
    if (typeof syncSeriesEditor === "function") syncSeriesEditor();
    if (typeof refreshPreview === "function") refreshPreview();
  }
  // '표시' 탭을 벗어나면 배치 모드를 끈다(다른 탭 클릭이 주석으로 새지 않게).
  if (tab !== "annot" && (_annMode || _annPending)) { _annMode = null; _annPending = null; }
  _els.tabCoord.style.display = tab === "coord" ? "" : "none";
  _els.tabFunc.style.display = tab === "func" ? "" : "none";
  _els.tabAnnot.style.display = tab === "annot" ? "" : "none";
  const base = "font-size: 13px;font-weight:600;padding:6px 16px;border:1px solid var(--border);border-radius:6px 6px 0 0;cursor:pointer;";
  const on = "background:var(--accent);border-color:var(--accent);color:#fff;";
  const off = "background:var(--bg-input);color:var(--text-primary);";
  _els.tabCoordBtn.style.cssText = base + (tab === "coord" ? on : off);
  _els.tabFuncBtn.style.cssText = base + (tab === "func" ? on : off);
  _els.tabAnnotBtn.style.cssText = base + (tab === "annot" ? on : off);
  if (tab === "func") setFuncTab(_funcTab);   // 함수 탭 진입 시 하위 탭 상태 반영
  if (tab === "annot" && typeof syncAnnLists === "function") syncAnnLists();
}

/* ---------- 함수 하위 탭: 해석적 함수 / 직선·꺾은선 / 자유곡선 ---------- */
let _funcTab = "expr";            // "expr" | "poly" | "free"
// 계열이 어느 하위 탭에 속하는지: 함수식=expr, 점 계열은 곡선(smooth)=free / 직선(straight)=poly.
function funcTabOf(s) {
  if (!s) return "expr";
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
};
function setFuncTab(ft) {
  _funcTab = ft;
  const sub = { expr: _els.subExpr, poly: _els.subPoly, free: _els.subFree };
  Object.entries(sub).forEach(([k, btn]) => {
    const active = k === ft;
    btn.style.background = active ? "var(--accent)" : "var(--bg-input)";
    btn.style.color = active ? "#fff" : "var(--text-primary)";
    btn.style.borderColor = active ? "var(--accent)" : "var(--border)";
  });
  _els.addSeries.textContent = FUNCTAB[ft].add;
  _els.emptyHint.textContent = FUNCTAB[ft].hint;
  // 선택 계열이 이 하위 탭 소속이 아니면, 이 탭의 첫 계열을 고른다(없으면 해제).
  if (_sel === -1 || !_series[_sel] || funcTabOf(_series[_sel]) !== ft) {
    _sel = _series.findIndex((s) => funcTabOf(s) === ft);
    _placeMode = null; _activeDraw = -1;
  }
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
      </h2>
      <div class="gm-body" style="flex-wrap:nowrap;">
        <!-- 높이를 고정한다(max-height가 아니라 height). max-height면 내용이 적은 탭에서만
             열이 짧아지고, 미리보기가 그 높이에 맞춰 늘어나므로(align-items:stretch)
             탭을 옮길 때마다 창과 미리보기가 같이 줄었다 늘었다 한다(실측 편차 103px). -->
        <div class="gm-right" style="flex:0 0 444px;height:66vh;overflow-y:auto;padding-right:6px;">

          <!-- 탭: 좌표 / 함수 (미리보기는 오른쪽 고정, 양 탭 공유) -->
          <div class="gm-tabs" style="display:flex;gap:4px;margin-bottom:12px;">
            <button type="button" id="gm-tab-coord-btn">① 좌표</button>
            <button type="button" id="gm-tab-func-btn">② 함수</button>
            <button type="button" id="gm-tab-annot-btn">③ 표시</button>
          </div>

          <div id="gm-tab-coord">
          <!-- 좌표 탭 레이아웃(UI 개선): 라벨 열을 92px로 고정하고 관련 항목을 그룹으로 묶는다.
               핵심은 '축 표' — x·y를 열로 세워 칸 개수 → 한 칸 값 → 축 이름이 같은 세로줄에
               계열로 쌓이게 했다(종전엔 라벨 길이가 달라 입력칸이 행마다 어긋났다).
               id는 종전 그대로라 이벤트 배선·populate는 손대지 않는다. -->
          <div class="gm-group">
            <div class="gm-group-h">축 만들기</div>
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
            <div id="gm-tickbase-rows" style="display:none;">
              <div class="gm-row">
                <span class="gm-row-lbl">x축 기준</span>
                <div class="gm-row-body"><input type="text" id="gm-tickbase-x" class="gm-num" style="font-family:monospace;flex:1;min-width:0;" placeholder="예: t_0  → t₀, 2t₀, 3t₀…"></div>
              </div>
              <div class="gm-row">
                <span class="gm-row-lbl">y축 기준</span>
                <div class="gm-row-body"><input type="text" id="gm-tickbase-y" class="gm-num" style="font-family:monospace;flex:1;min-width:0;" placeholder="예: v_0  → v₀, 2v₀, 3v₀…"></div>
              </div>
              <div class="gm-ax-note" style="grid-column:auto;padding-left:102px;">기준 문자 하나만 넣으면 2·3·4배가 자동 생성됩니다</div>
            </div>
          </div>

          <!-- 고급 옵션(요구): 좌표 탭 맨 아래에 두고, 클릭하면 바로 아래로 펼쳐지는 인라인 패널.
               모달로 띄우지 않으므로 값을 조정하는 동안 오른쪽 미리보기가 그대로 보인다.
               활용도 낮은 옵션(라벨/눈금 이동·묶기·글씨 크기)과 신규(화살표·격자 범위)를 담는다.
               컨트롤 id는 종전 그대로라 이벤트 배선은 손대지 않는다. -->
          <div class="gm-group" id="gm-adv-group">
            <button type="button" id="gm-adv-open" class="gm-adv-toggle">고급 옵션 <span id="gm-adv-caret">▾</span></button>
            <div id="gm-adv-panel" class="gm-adv-panel" hidden>
              <div class="gm-row">
                <span class="gm-row-lbl">동작</span>
                <div class="gm-row-body gm-checks" style="flex-wrap:wrap;">
                  <label class="gm-check"><input type="checkbox" id="gm-labelmove"> 축 라벨 이동<span class="gm-help" title="켜면 미리보기에서 축 이름(예: y, t)을 드래그해 위치를 옮길 수 있습니다. 끄면 원래 위치로 돌아갑니다.">?</span></label>
                  <label class="gm-check"><input type="checkbox" id="gm-tickmove"> 눈금 숫자 이동<span class="gm-help" title="켜면 미리보기에서 눈금 숫자를 드래그해 곡선을 피할 수 있습니다. '첫 라벨에 맞추기'로 세로 높이를 첫 숫자에 정렬합니다.">?</span></label>
                  <button type="button" id="gm-tickalign" style="display:none;font-size: 12px;padding:2px 8px;border:1px solid var(--border);border-radius:5px;background:var(--bg-input);color:inherit;cursor:pointer;">첫 라벨에 맞추기</button>
                  <label class="gm-check"><input type="checkbox" id="gm-lockpos"> 좌표·함수 묶기<span class="gm-help" title="좌표평면과 함수를 하나의 그룹으로 묶어 캔버스에서 함께 이동합니다.">?</span></label>
                </div>
              </div>
              <div class="gm-row">
                <span class="gm-row-lbl">좌표 / 성분 크기</span>
                <div class="gm-row-body gm-scale-pair">
                  <span class="gm-scale-item">
                    <span class="gm-step"><input type="number" id="gm-axisscale" min="50" max="200" step="10" value="100" aria-label="좌표 크기(%)"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span>
                    <span class="gm-unit">%</span>
                  </span>
                  <span class="gm-scale-item">
                    <span class="gm-step"><input type="number" id="gm-tickscale" min="50" max="200" step="10" value="100" aria-label="성분 크기(%)"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span>
                    <span class="gm-unit">%</span>
                  </span>
                </div>
              </div>

              <div class="gm-adv-sect">
                <div class="gm-adv-h">화살표 위치<small>마지막 눈금에서의 여백(칸)</small></div>
                <div class="gm-end-row">
                  <span class="gm-end-item"><label>x+</label><span class="gm-step"><input type="number" id="gm-pad-xp" step="0.1" min="0" value="1.6"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span></span>
                  <span class="gm-end-item"><label>x−</label><span class="gm-step"><input type="number" id="gm-pad-xn" step="0.1" min="0" value="1.6"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span></span>
                  <span class="gm-end-item"><label>y+</label><span class="gm-step"><input type="number" id="gm-pad-yp" step="0.1" min="0" value="1.3"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span></span>
                  <span class="gm-end-item"><label>y−</label><span class="gm-step"><input type="number" id="gm-pad-yn" step="0.1" min="0" value="1.3"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span></span>
                </div>
              </div>

              <div class="gm-adv-sect">
                <div class="gm-adv-h">격자 튀어나옴<small>눈금 밖으로 더 뻗는 칸 (0=닫힘)</small></div>
                <div class="gm-end-row">
                  <span class="gm-end-item"><label>x+</label><span class="gm-step"><input type="number" id="gm-gov-xp" step="0.1" min="0" value="0.5"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span></span>
                  <span class="gm-end-item"><label>x−</label><span class="gm-step"><input type="number" id="gm-gov-xn" step="0.1" min="0" value="0.5"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span></span>
                  <span class="gm-end-item"><label>y+</label><span class="gm-step"><input type="number" id="gm-gov-yp" step="0.1" min="0" value="0.5"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span></span>
                  <span class="gm-end-item"><label>y−</label><span class="gm-step"><input type="number" id="gm-gov-yn" step="0.1" min="0" value="0.5"><span class="gm-step-btns"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button></span></span></span>
                </div>
              </div>
            </div>
          </div>
          </div><!-- /gm-tab-coord -->

          <div id="gm-tab-func" style="display:none;">
          <!-- 함수 하위 탭(요구): 해석적 함수 / 직선·꺾은선 / 자유곡선 — 성격별로 분리 편집.
               미리보기는 셋이 공유하고, '만들기'는 모든 하위 탭의 계열을 한 평면에 합친다. -->
          <div id="gm-subtabs" class="gm-elem-seg" style="display:flex;margin-bottom:8px;">
            <button type="button" id="gm-sub-expr" style="flex:1;">해석적 함수</button>
            <button type="button" id="gm-sub-poly" style="flex:1;">직선·꺾은선</button>
            <button type="button" id="gm-sub-free" style="flex:1;">자유곡선</button>
          </div>
          <button type="button" id="gm-add-series" class="modal-btn" style="width:100%;font-size: 12px;padding:6px;margin-bottom:8px;">＋ 함수식 추가</button>
          <div id="gm-chips" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;"></div>
          <div id="gm-empty-hint" style="font-size: 12px;color:var(--text-secondary);">
            함수식 또는 직선·꺾은선을 추가하세요.<span class="gm-help" title="계열 없이 좌표 틀만 만들 수도 있습니다. 추가한 함수는 미리보기 위에 바로 그려집니다.">?</span>
          </div>

          <div id="gm-series-editor" style="display:none;">
            <!-- 아래 모든 행은 라벨 92px 고정 열(.gm-row)에 맞춘다 — 좌표 탭과 같은 세로
                 기준선을 쓰기 위해서다(DESIGN 13-1). 종전엔 행마다 제 글자 수만큼
                 입력칸이 밀려 시작점이 여섯 갈래였다. -->
            <div id="gm-expr-row" class="gm-group">
              <p class="gm-group-h">식</p>
              <div class="gm-row">
                <span class="gm-row-lbl">y =</span>
                <div class="gm-row-body">
                  <input type="text" id="gm-expr" class="gm-num" style="font-family:monospace;flex:1;min-width:0;" spellcheck="false" placeholder="예: sin(x), x^2-3x+1">
                </div>
              </div>
              <div class="gm-row">
                <span class="gm-row-lbl"></span>
                <div class="gm-row-body" id="gm-expr-helpers" style="flex-wrap:wrap;gap:3px;"></div>
              </div>
              <div class="gm-row" id="gm-domain-row">
                <span class="gm-row-lbl">정의역 <i>x</i></span>
                <div class="gm-row-body">
                  <input type="number" id="gm-dmin" class="gm-num" style="width:70px;" step="0.5" placeholder="자동">
                  <span style="color:var(--text-secondary);">~</span>
                  <input type="number" id="gm-dmax" class="gm-num" style="width:70px;" step="0.5" placeholder="자동">
                </div>
              </div>
              <div class="gm-row" id="gm-range-row">
                <span class="gm-row-lbl">치역 <i>y</i></span>
                <div class="gm-row-body">
                  <input type="number" id="gm-rmin" class="gm-num" style="width:70px;" step="0.5" placeholder="자동">
                  <span style="color:var(--text-secondary);">~</span>
                  <input type="number" id="gm-rmax" class="gm-num" style="width:70px;" step="0.5" placeholder="자동">
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
            </div>

            <div id="gm-pts-rows" class="gm-group" style="display:none;">
              <p class="gm-group-h">점</p>
              <div class="gm-row">
                <span class="gm-row-lbl">좌표 입력</span>
                <div class="gm-row-body">
                  <input type="text" id="gm-pts" class="gm-num" style="font-family:monospace;flex:1;min-width:0;" spellcheck="false" placeholder="예: 0,0 1,2 3,2">
                </div>
              </div>
              <div class="gm-row">
                <span class="gm-row-lbl"></span>
                <div class="gm-row-body">
                  <button type="button" id="gm-pts-undo" class="modal-btn" style="font-size: 11px;padding:3px 8px;">마지막 점 삭제</button>
                  <button type="button" id="gm-pts-clear" class="modal-btn" style="font-size: 11px;padding:3px 8px;">전체 지움</button>
                </div>
              </div>
              <p class="gm-ax-note">미리보기를 클릭해 꼭짓점을 찍고, Enter 또는 우클릭으로 마칩니다.</p>
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
                <div class="gm-row-body"><span id="gm-styles" style="display:inline-flex;gap:4px;"></span></div>
              </div>
              <div class="gm-row">
                <span class="gm-row-lbl">선 굵기</span>
                <div class="gm-row-body">
                  <span class="gm-step"><input type="number" id="gm-width" min="0.1" max="2" step="0.1" aria-label="선 굵기">
                    <span class="gm-step-btns">
                      <button type="button" data-step="1" tabindex="-1" aria-label="늘리기">▲</button>
                      <button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">▼</button>
                    </span></span>
                  <span class="gm-unit">mm</span>
                </div>
              </div>
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
            <div class="gm-row">
              <span class="gm-row-lbl">배치 도구</span>
              <div class="gm-row-body gm-checks" style="flex-wrap:wrap;gap:6px;">
                <button type="button" id="gm-ann-marker" class="gm-ann-tool">표시점</button>
                <button type="button" id="gm-ann-guide" class="gm-ann-tool">수선의 발</button>
                <button type="button" id="gm-ann-arrow" class="gm-ann-tool">화살표</button>
                <button type="button" id="gm-ann-guideline" class="gm-ann-tool">가이드라인</button>
                <button type="button" id="gm-ann-labelpt" class="gm-ann-tool">라벨러 표시점</button>
              </div>
            </div>
            <div class="gm-ax-note" id="gm-ann-hint" style="padding-left:102px;">도구를 켜고 미리보기를 클릭해 배치합니다. 함수가 없어도 됩니다.</div>
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
                <button type="button" id="gm-ann-legend-add" style="font-size: 12px;padding:3px 10px;border:1px solid var(--border);border-radius:5px;background:var(--bg-input);color:inherit;cursor:pointer;">+ 범례 추가</button>
              </div>
            </div>
            <div class="gm-ax-note" style="padding-left:102px;">함수 선이 무엇인지 알려주는 작은 박스입니다. 미리보기에서 드래그해 옮깁니다.</div>
            <div id="gm-ann-legend-editor"></div>
          </div><!-- /gm-tab-annot -->
        </div>

        <div class="gm-left" style="flex:1;min-width:0;">
          <div class="gm-preview-label">미리보기</div>
          <div id="gm-preview" class="gm-preview" style="height:440px;"></div>
          <div id="gm-error" style="color:#e5534b;font-size: 12px;min-height:16px;margin-top:4px;"></div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="modal-btn" id="gm-cancel">취소</button>
        <button type="button" class="modal-btn modal-btn-primary" id="gm-confirm">만들기</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

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
    showOrigin: overlay.querySelector("#gm-showorigin"), originBtn: overlay.querySelector("#gm-origin-toggle"),
    showGrid: overlay.querySelector("#gm-showgrid"), showTicks: overlay.querySelector("#gm-showticks"),
    axisScale: overlay.querySelector("#gm-axisscale"), tickScale: overlay.querySelector("#gm-tickscale"),
    lockPos: overlay.querySelector("#gm-lockpos"), labelMove: overlay.querySelector("#gm-labelmove"),
    tickMove: overlay.querySelector("#gm-tickmove"), tickAlign: overlay.querySelector("#gm-tickalign"),
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
    subFree: overlay.querySelector("#gm-sub-free"), addSeries: overlay.querySelector("#gm-add-series"),
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
    syncAnnLists(); refreshPreview();
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
  _els.axisScale.addEventListener("input", () => { _cfg.axisLabelScale = clampScale(_els.axisScale) / 100; refreshPreview(); });
  _els.tickScale.addEventListener("input", () => { _cfg.tickLabelScale = clampScale(_els.tickScale) / 100; refreshPreview(); });
  // 고급 옵션(인라인): 클릭하면 바로 아래로 펼쳐/접힌다. 미리보기는 계속 보인다.
  _els.advOpen.addEventListener("click", () => {
    const open = _els.advPanel.hidden;
    _els.advPanel.hidden = !open;
    if (_els.advCaret) _els.advCaret.textContent = open ? "▴" : "▾";
    if (open) { syncCfgControls(); _els.advPanel.scrollIntoView({ block: "nearest" }); }
  });
  // 화살표 여백·격자 튀어나옴(네 끝) — 입력 즉시 미리보기 반영(요구: 실시간).
  const numOrDefault = (el, d) => { const n = parseFloat(el.value); return Number.isFinite(n) && n >= 0 ? n : d; };
  const bindEnd = (el, key, d) => el.addEventListener("input", () => { _cfg[key] = numOrDefault(el, d); refreshPreview(); });
  bindEnd(_els.govXP, "gridOverXPos", GRID_OVER); bindEnd(_els.govXN, "gridOverXNeg", GRID_OVER);
  bindEnd(_els.govYP, "gridOverYPos", GRID_OVER); bindEnd(_els.govYN, "gridOverYNeg", GRID_OVER);
  bindEnd(_els.padXP, "padXPos", PAD_X); bindEnd(_els.padXN, "padXNeg", PAD_X);
  bindEnd(_els.padYP, "padYPos", PAD_Y); bindEnd(_els.padYN, "padYNeg", PAD_Y);
  _els.labelMove.addEventListener("change", () => {
    _cfg.labelMovable = _els.labelMove.checked;
    // 끄면 옮겼던 축 라벨을 원래 지정 위치로 되돌린다(요구).
    if (!_cfg.labelMovable) { _cfg.labelXOffset = { dx: 0, dy: 0 }; _cfg.labelYOffset = { dx: 0, dy: 0 }; _cfg.labelXPos = null; _cfg.labelYPos = null; }
    refreshPreview();
  });
  // 눈금 숫자 이동(요구 ②): 켜면 드래그 가능(offset은 유지 — 곡선 피한 위치는 확정된 배치).
  _els.tickMove.addEventListener("change", () => {
    _cfg.tickMovable = _els.tickMove.checked;
    _els.tickAlign.style.display = _cfg.tickMovable ? "" : "none";
    refreshPreview();
  });
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
  _els.lockPos.addEventListener("change", () => { _cfg.lockPosition = _els.lockPos.checked; });
  [["none", "없음"], ["number", "숫자"], ["multiple", "배수"], ["text", "직접"]].forEach(([mode, label]) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b._mode = mode;
    b.style.cssText = "font-size: 12px;border:1px solid var(--border);border-radius:3px;padding:3px 10px;background:var(--bg-input);color:var(--text-primary);cursor:pointer;";
    b.addEventListener("click", () => { _cfg.tickMode = mode; syncCfgControls(); refreshPreview(); });
    _els.tickModeHost.appendChild(b);
  });
  _els.tickTextX.addEventListener("input", () => { _cfg.tickTextX = _els.tickTextX.value; refreshPreview(); });
  _els.tickTextY.addEventListener("input", () => { _cfg.tickTextY = _els.tickTextY.value; refreshPreview(); });
  _els.tickBaseX.addEventListener("input", () => { _cfg.tickBaseX = _els.tickBaseX.value; refreshPreview(); });
  _els.tickBaseY.addEventListener("input", () => { _cfg.tickBaseY = _els.tickBaseY.value; refreshPreview(); });

  /* --- 계열 배선 --- */
  _els.subExpr.addEventListener("click", () => setFuncTab("expr"));
  _els.subPoly.addEventListener("click", () => setFuncTab("poly"));
  _els.subFree.addEventListener("click", () => setFuncTab("free"));
  _els.addSeries.addEventListener("click", () => {
    addSeries(FUNCTAB[_funcTab].make());     // 현재 하위 탭 타입으로 추가
    if (_funcTab === "expr") _els.expr.focus();
  });
  _els.expr.addEventListener("input", () => { const s = _series[_sel]; if (s) { s.expr = _els.expr.value; renderChips(); refreshPreview(); } });
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
  _els.pts.addEventListener("change", () => {
    const s = _series[_sel]; if (!s || s.kind !== "points") return;
    s.pts = textToPts(_els.pts.value);
    renderChips(); refreshPreview();
  });
  overlay.querySelector("#gm-pts-undo").addEventListener("click", () => {
    const s = _series[_sel]; if (!s || s.kind !== "points") return;
    s.pts.pop(); syncSeriesEditor(); renderChips(); refreshPreview();
  });
  overlay.querySelector("#gm-pts-clear").addEventListener("click", () => {
    const s = _series[_sel]; if (!s || s.kind !== "points") return;
    s.pts = []; syncSeriesEditor(); renderChips(); refreshPreview();
  });
  // 선 종류는 대상이 그림 그 자체라 글자 대신 그 선을 그려 보여준다(DESIGN 13-2).
  // "점선"·"파선"이라는 이름만으로는 어느 쪽이 더 촘촘한지 알 수 없다.
  LINE_STYLES.forEach(([label, dl, dg], i) => {
    const b = document.createElement("button");
    b.type = "button"; b.title = label; b.setAttribute("aria-label", label);
    b.style.cssText = "border:1px solid var(--border);border-radius:3px;padding:5px 8px;background:var(--bg-input);cursor:pointer;line-height:0;";
    const svgEl = document.createElementNS(SVG_NS, "svg");
    svgEl.setAttribute("width", "40"); svgEl.setAttribute("height", "10");
    svgEl.setAttribute("viewBox", "0 0 40 10");
    const ln = document.createElementNS(SVG_NS, "line");
    ln.setAttribute("x1", 2); ln.setAttribute("y1", 5); ln.setAttribute("x2", 38); ln.setAttribute("y2", 5);
    ln.setAttribute("stroke", "currentColor"); ln.setAttribute("stroke-width", 1.7);
    // 대시 값은 world 단위(mm)라 40px짜리 미리보기에 맞춰 배로 키워 보여준다.
    if (dl) ln.setAttribute("stroke-dasharray", `${dl * 2.4} ${dg * 2.4}`);
    svgEl.appendChild(ln); b.appendChild(svgEl);
    b.addEventListener("click", () => { const s = _series[_sel]; if (s) { s.styleIdx = i; syncSeriesEditor(); refreshPreview(); } });
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
    if (s && Number.isFinite(v)) { s.strokeWidth = Math.max(0.1, Math.min(2, v)); refreshPreview(); }
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
    s.pts.splice(bi + 1, 0, { x: Math.round((a.x + b.x) / 2 * 1000) / 1000, y: Math.round((a.y + b.y) / 2 * 1000) / 1000 });
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
    s.pts.splice(bi, 1);
    if (s.handles) syncHandlesToStructure(s);
    syncSeriesEditor(); renderChips(); refreshPreview();
  });
  // 베지어 변환: 현재 접선에서 핸들을 초기화(모양 동일하게 시작) → 흰 핸들 드래그로 곡률 조절.
  _els.bezierOn.addEventListener("click", () => {
    const s = _series[_sel]; if (!s || s.kind !== "points" || s.curveStyle !== "smooth" || s.pts.length < 2) return;
    s.handles = catmullRomHandles(s.pts, s.curvature);
    syncSeriesEditor(); refreshPreview();
  });
  _els.bezierOff.addEventListener("click", () => {
    const s = _series[_sel]; if (!s) return;
    s.handles = null;   // 자동 곡선(centripetal)으로 복귀
    syncSeriesEditor(); refreshPreview();
  });

  // 그래프 요소(표시점/수선/화살표) 배선은 '③ 표시' 탭으로 이관했다 — 함수 탭 버튼은 제거됨.

  _els.confirm.addEventListener("click", () => { if (_mode === "edit") commitEdit(); else commitCreate(); });
  _els.cancel.addEventListener("click", hide);
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
    if (e.target.closest("#gm-preview, #gm-series-editor, #gm-chips, .gm-tabs, #gm-subtabs, #gm-add-series, .modal-actions")) return;
    _sel = -1; _placeMode = null; _activeDraw = -1;
    renderChips(); syncSeriesEditor(); refreshPreview();
  });
  setupHelpPopovers(overlay);
  overlay.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    // 고급 패널이 펼쳐져 있으면 그것부터 접는다(전체 모달은 유지).
    if (_els.advPanel && !_els.advPanel.hidden) {
      e.preventDefault(); e.stopPropagation();
      _els.advPanel.hidden = true; if (_els.advCaret) _els.advCaret.textContent = "▾"; return;
    }
    e.preventDefault(); e.stopPropagation(); hide();
  });
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
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    const s = _series[_sel];
    if (s && s.kind === "points") { e.preventDefault(); finishPointsSeries(); }
  });
  return overlay;
}

// Escape 등으로 모달을 닫을 때 열려 있는 도움말(?) 팝오버가 화면에 남는 버그 수정 — 함께 정리.
function hide() { if (_overlay) _overlay.hidden = true; _placeMode = null; closeHelpPopover(); }

// funcgraph에 저장된 요소 원본 math 스펙 → 계열 편집 상태로.
function loadElements(fg) {
  return {
    markers: Array.isArray(fg.markerXs) ? [...fg.markerXs] : [],
    guides: Array.isArray(fg.guideXs) ? [...fg.guideXs] : [],
    arrows: Array.isArray(fg.arrowSpecs) ? fg.arrowSpecs.map((a) => ({ ...a })) : [],
  };
}

/* ---------- 편집 모드 로드: plane + 자식 계열 → cfg/_series ---------- */
function loadFromPlane(plane) {
  const objs = state.get().objects;
  const cfg = defaultCfg();
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
  cfg.showX = true; cfg.showY = true;   // 축 라벨은 항상 표시(on/off 제거 — 요구)
  cfg.origin = (plane.labelOrigin === "O") ? "O" : "0";
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
  cfg.labelMovable = !!plane.labelMovable;
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
  cfg.tickMovable = !!plane.tickMovable;
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
  // 계열 묶기는 평면의 seriesLock(신규) 우선, 없으면 자식 계열의 positionLocked로 유도.
  cfg.lockPosition = (plane.seriesLock !== undefined)
    ? !!plane.seriesLock
    : objs.some((o) => o.type === "funcgraph" && o.planeId === plane.id && o.positionLocked);
  _cfg = cfg;

  _series = [];
  const styleIdxOf = (fg) => {
    const dl = fg.dashLength ?? 0, dg = fg.dashGap ?? 0;
    const i = LINE_STYLES.findIndex(([, a, b]) => Math.abs(a - dl) < 1e-6 && Math.abs(b - dg) < 1e-6);
    return i >= 0 ? i : 0;
  };
  for (const fg of objs) {
    if (fg.type !== "funcgraph" || fg.planeId !== plane.id) continue;
    if (fg.sourceKind === "points") {
      const pts = Array.isArray(fg.mathPoints) && fg.mathPoints.length
        ? fg.mathPoints.map((p) => ({ x: p.x, y: p.y }))
        : (fg.points || []).map((p) => mathFromWorld(plane, p.x, p.y));
      _series.push({ kind: "points", pts, styleIdx: styleIdxOf(fg), strokeWidth: fg.strokeWidth ?? 0.3, curveStyle: fg.curveStyle || "straight", curvature: Number.isFinite(fg.curvature) ? fg.curvature : 1, endLabel: fg.endLabel || "", autoExtend: !!fg.autoExtend, handles: (Array.isArray(fg.handlesMath) && fg.handlesMath.length === pts.length) ? fg.handlesMath.map((h) => ({ ...h })) : null, ...loadElements(fg) });
    } else {
      _series.push({
        kind: "expr", expr: fg.expr || "",
        // domainAuto가 있으면(이 수정 이후 저장분) 그 값을 그대로 신뢰 — true면 '자동'으로
        // 복원해 평면 범위가 넓어지면 함수도 같이 넓게 다시 그려진다. domainAuto가 없는
        // 옛 파일은 이전 동작 그대로(명시 정의역으로 취급) — 하위호환.
        domain: (!fg.domainAuto && fg.domainMin != null && fg.domainMax != null) ? { min: fg.domainMin, max: fg.domainMax } : null,
        styleIdx: styleIdxOf(fg), strokeWidth: fg.strokeWidth ?? 0.3, curveStyle: fg.curveStyle || "smooth", curvature: Number.isFinite(fg.curvature) ? fg.curvature : 1,
        offset: (fg.offset && Number.isFinite(fg.offset.dx)) ? { dx: fg.offset.dx, dy: fg.offset.dy } : { dx: 0, dy: 0 },
        endLabel: fg.endLabel || "", autoExtend: !!fg.autoExtend, ...loadElements(fg),
      });
    }
  }
  _sel = _series.length ? 0 : -1;
}

/* ----- PUBLIC: 열기. planeId 없으면 새로 만들기, 있으면 그 그래프를 편집.
 *   startTab: "coord"(기본) | "func" — F 단축키/버튼 진입점이 시작 탭을 지정. 확정: 둘 다 좌표 먼저. ----- */
export function openGraphModal(planeId = null, startTab = "coord") {
  if (!_overlay) _overlay = build();
  const plane = planeId ? state.get().objects.find((o) => o.id === planeId && o.type === "coordplane") : null;
  if (plane) {
    _mode = "edit"; _planeId = plane.id;
    loadFromPlane(plane);
  } else {
    _mode = "create"; _planeId = null;
    _cfg = defaultCfg();
    _series = []; _sel = -1;
  }
  _placeMode = null; _activeDraw = -1;   // 열 때는 배치·그리기 모드 초기화
  _annMode = null; _annPending = null;   // 표시 배치 모드도 초기화
  _lpSel = -1;                           // 라벨러 표시점 선택도 초기화(옛 인덱스가 남지 않게)
  if (_els.advPanel) { _els.advPanel.hidden = true; if (_els.advCaret) _els.advCaret.textContent = "▾"; }   // 고급 패널은 접힌 채로 시작
  _els.title.textContent = _mode === "edit" ? "그래프 편집" : "그래프 만들기";
  _els.confirm.textContent = _mode === "edit" ? "적용" : "만들기";
  _els.error.textContent = "";
  _overlay.hidden = false;
  setTab(startTab === "func" ? "func" : "coord");
  syncCfgControls();
  renderChips();
  syncSeriesEditor();
  refreshPreview();
}

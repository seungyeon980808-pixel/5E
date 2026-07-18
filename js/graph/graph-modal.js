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

import { state } from "../state.js?v=1.0.2";
import { makeDefaultCoordplane } from "../function-graph/defaults.js?v=1.0.2";
import { renderCoordplane, renderFuncgraph, smoothSamplePts } from "../render/coordplane.js?v=1.0.2";
import { sampleFunctionPoints } from "../function-graph/sampler.js?v=1.0.2";
import { worldFromMath, mathFromWorld } from "../function-graph/coords.js?v=1.0.2";
import { nextObjectId } from "../tools/id.js?v=1.0.2";

const SVG_NS = "http://www.w3.org/2000/svg";
const PAD_X = 1.6;                // x: 마지막 눈금 → 화살표 여유(요구: 조금 줄임)
const PAD_Y = 1.3;                // y: 마지막 눈금 → 화살표 여유
const GRID_OVER = 0.5;            // 격자를 마지막 눈금 밖으로 더 뻗는 칸(사진4: "반 칸")
// 회색조 프로젝트: 색 대신 선 종류로 계열 구분. [라벨, dashLength, dashGap](mm).
// 대시·간격 40% 축소(요구): 점선 1.6/1.2→0.96/0.72, 파선 2.4/1.3→1.44/0.78.
const LINE_STYLES = [["실선", 0, 0], ["점선", 0.96, 0.72], ["파선", 1.44, 0.78]];
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
let _placeMode = null;            // null | "marker" | "guide" — 미리보기 클릭 배치 모드
let _selPts = null;               // 선택 계열의 baked world points(배치 고스트 스냅·클릭 가드용)
let _selBreaks = null;            // 선택 계열의 끊긴 구간 경계(worldYAtX가 빈 구간 건너뛰게)
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
  };
}
// 계열 기본 선 굵기: 축보다 굵되 과하지 않게(요구: 조금 더 얇게 → 0.4mm).
// curveStyle: 함수식=곡선(smooth), 직선·꺾은선=직선(straight) 기본. autoExtend: 자동 연장선(기본 off).
// movable: '이동' 체크(요구) — 켜면 미리보기에서 곡선 몸통 드래그 = 계열 전체 이동.
function newExprSeries() { return { kind: "expr", expr: "", domain: null, styleIdx: 0, strokeWidth: 0.4, curveStyle: "smooth", curvature: 1, offset: { dx: 0, dy: 0 }, endLabel: "", autoExtend: false, movable: false, markers: [], guides: [], arrows: [] }; }
function newPointsSeries() { return { kind: "points", pts: [], styleIdx: 0, strokeWidth: 0.4, curveStyle: "straight", curvature: 1, endLabel: "", autoExtend: false, movable: false, markers: [], guides: [], arrows: [] }; }

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
  plane.xMin = xNeg > 0 ? -(xNeg + PAD_X) : 0;
  plane.xMax = xPos + PAD_X;
  plane.yMin = yNeg > 0 ? -(yNeg + PAD_Y) : 0;
  plane.yMax = yPos + PAD_Y;
  plane.gridStepX = 1; plane.gridStepY = 1;                  // 물리 격자 칸 간격(불변)
  // 숫자 눈금 라벨의 '한 칸 값'(요구): 물리 칸과 분리 — 라벨만 k×tickStep으로 표기.
  plane.tickStepX = Number.isFinite(cfg.tickStepX) && cfg.tickStepX >= 0.1 ? cfg.tickStepX : 1;
  plane.tickStepY = Number.isFinite(cfg.tickStepY) && cfg.tickStepY >= 0.1 ? cfg.tickStepY : 1;
  plane.gridCountX = xPos; plane.gridCountY = yPos;          // 구코드 호환(양의 칸 수)
  plane.gridCountXPos = xPos; plane.gridCountXNeg = xNeg;    // 비대칭 격자·눈금 범위
  plane.gridCountYPos = yPos; plane.gridCountYNeg = yNeg;
  plane.gridOver = GRID_OVER;                     // 격자만 마지막 눈금 밖 반 칸 더
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
  const cxPos = Number.isFinite(plane.gridCountXPos) ? plane.gridCountXPos
    : (Number.isFinite(plane.gridCountX) ? plane.gridCountX : Math.max(1, Math.round(plane.xMax - PAD_X)));
  const cyPos = Number.isFinite(plane.gridCountYPos) ? plane.gridCountYPos
    : (Number.isFinite(plane.gridCountY) ? plane.gridCountY : Math.max(1, Math.round(plane.yMax - PAD_Y)));
  const cxNeg = Number.isFinite(plane.gridCountXNeg) ? plane.gridCountXNeg
    : (Number.isFinite(plane.gridCountX) ? plane.gridCountX : cxPos);   // 구파일=대칭 폴백
  const cyNeg = Number.isFinite(plane.gridCountYNeg) ? plane.gridCountYNeg
    : (Number.isFinite(plane.gridCountY) ? plane.gridCountY : cyPos);
  const xMax = cxPos + over, yMax = cyPos + over;
  return {
    xMin: plane.xMin < 0 ? -(cxNeg + over) : 0, xMax,
    yMin: plane.yMin < 0 ? -(cyNeg + over) : 0, yMax,
  };
}

/* ---------- 그래프 요소(표시점 ● / 수선의 발 / 화살표) ---------- */
const ARROW_SPAN = 1.8;   // 화살표 길이(수학 단위, ~1.8칸) — 곡선 접선을 따라간다(요구: +50%).
const ARROW_SW = 0.525;   // 화살표(화살촉) 두께 — 화살촉 크기가 여기 비례(요구: +50%, 0.35→0.525).
// 요소 베이크·클릭 스냅용 기하: 곡선 스타일 점 계열은 렌더와 동일한 Catmull-Rom으로
// 촘촘히 편 점을 쓴다. 꼭짓점을 직선 보간하면 화살표/표시점/수선이 실제 그려진 곡선에서
// 떨어진 지점에 찍힌다(화살표 위치 버그의 원인). 함수식 계열은 이미 촘촘히 샘플됨.
function geomPts(s, pts) {
  const cs = s.curveStyle || (s.kind === "expr" ? "smooth" : "straight");
  return (s.kind === "points" && cs === "smooth") ? smoothSamplePts(pts, s.curvature) : pts;
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
// 계열의 요소 math 스펙(markers/guides/arrows) → 세계좌표 렌더 데이터(renderFuncgraph가 그림).
function bakeElements(s, plane, pts, breaks) {
  const markers = [], guideSegs = [], arrowPolys = [];
  const o0 = worldFromMath(plane, 0, 0);
  (s.markers || []).forEach((mx) => {
    const wx = worldFromMath(plane, mx, 0).x, wy = worldYAtX(pts, wx, breaks);
    if (wy != null) markers.push({ x: wx, y: wy });
  });
  (s.guides || []).forEach((mx) => {
    const wx = worldFromMath(plane, mx, 0).x, wy = worldYAtX(pts, wx, breaks);
    if (wy == null) return;
    if (Math.abs(wy - o0.y) > 1e-6) guideSegs.push([{ x: wx, y: wy }, { x: wx, y: o0.y }]); // → x축(수직)
    if (Math.abs(wx - o0.x) > 1e-6) guideSegs.push([{ x: wx, y: wy }, { x: o0.x, y: wy }]); // → y축(수평)
  });
  // 화살표: 클릭한 바로 그 지점에 '화살촉'이 오도록 놓는다(요구 핵심 — "2,2에 찍으면 화살표가 2,2에").
  // 종전엔 클릭점을 '중심'으로 삼아 화살촉이 반 칸 앞(예: 클릭 2 → 화살촉 2.5)에 찍혀 딴 곳처럼 보였다.
  // 이제 화살촉 = 클릭 x, 꼬리 = 진행 반대쪽으로 ARROW_SPAN만큼. 방향 반전(dir)은 화살촉을 그
  // 자리에 둔 채(제자리) 꼬리 쪽과 화살촉 방향만 바꾼다. 미리보기 고스트(원)가 뜨는 자리 = 화살촉 자리.
  (s.arrows || []).forEach((a) => {
    if (!Number.isFinite(a.x)) return;
    const dir = a.dir < 0 ? -1 : 1;
    const cwx = worldFromMath(plane, a.x, 0).x;                 // 화살촉 = 클릭 지점
    const ccy = worldYAtX(pts, cwx, breaks);
    if (ccy == null) return;
    // 꼬리는 진행 반대쪽으로 ARROW_SPAN만큼. 단 선의 x-범위를 벗어나면 끝점으로 clamp한다 —
    // 벗어나면 worldYAtX가 null이라 높이가 ccy로 튀고, 원점 등을 지나며 지그재그 stub이 생김(버그).
    const xsMin = Math.min(...pts.map((p) => p.x)), xsMax = Math.max(...pts.map((p) => p.x));
    const rawTailX = worldFromMath(plane, a.x - dir * ARROW_SPAN, 0).x;
    const wTailX = Math.max(xsMin, Math.min(xsMax, rawTailX)); // 선 밖으로 안 나가게
    const yTail = worldYAtX(pts, wTailX, breaks);
    const lo = Math.min(cwx, wTailX), hi = Math.max(cwx, wTailX);
    // 꼬리 → (사이 곡선점) → 화살촉(마지막). arrowHead:"end"가 마지막 점(=클릭 지점)에 화살촉을 그린다.
    const poly = [{ x: wTailX, y: yTail != null ? yTail : ccy }];
    pts.filter((p) => p.x > lo + 1e-6 && p.x < hi - 1e-6)
       .sort((p, q) => (cwx > wTailX ? p.x - q.x : q.x - p.x))
       .forEach((p) => poly.push({ x: p.x, y: p.y }));
    poly.push({ x: cwx, y: ccy });
    if (poly.length < 2) return;
    arrowPolys.push({ points: poly, arrowHead: "end", strokeWidth: ARROW_SW }); // 화살촉=클릭 지점
  });
  return { markers, guideSegs, arrowPolys };
}
// 커밋용: 세계좌표 렌더 데이터 + 원본 math 스펙(재편집 시 모달이 되읽음).
function elementFields(s, plane, pts, breaks) {
  return {
    ...bakeElements(s, plane, pts, breaks),
    markerXs: [...(s.markers || [])], guideXs: [...(s.guides || [])],
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
      // 함수는 데이터 범위(눈금 끝+반 칸)까지만 — 화살표 마진 아래로 뻗지 않게.
      const dMin = s.domain ? Math.max(db.xMin, Math.min(s.domain.min, s.domain.max)) : db.xMin;
      const dMax = s.domain ? Math.min(db.xMax, Math.max(s.domain.min, s.domain.max)) : db.xMax;
      const { points: sampled, breaks, error } = sampleFunctionPoints(expr, dMin, dMax, plane);
      if (error) return { ok: false, error: `${expr}: ${error}` };
      if (sampled.length < 2) return { ok: false, error: `${expr}: 정의역 안에서 그릴 점이 없습니다` };
      const points = applyOffset(sampled, plane, s.offset);   // 함수식 자유 이동
      const off = s.offset && Number.isFinite(s.offset.dx) ? { dx: s.offset.dx, dy: s.offset.dy } : { dx: 0, dy: 0 };
      // breaks(끊긴 구간)를 함수그래프에 함께 저장 → 렌더러가 그 경계에서 선을 끊는다(가짜선 방지).
      // domainMin/domainMax는 항상 채워지는 '실제 그린 범위'(재샘플용) — '자동'이었는지는
      // 별도 domainAuto 플래그로 남겨야, 재편집·평면 범위 확장 시 domain을 다시 자동으로
      // 넓힐 수 있다(안 남기면 항상 '명시 정의역'으로 보여 옛 경계에 갇힌다).
      list.push({ ...common, expr, domainMin: dMin, domainMax: dMax, domainAuto: !s.domain, points, breaks, offset: off, ...elementFields(s, plane, points, breaks) });
    } else {
      if (!s.pts || s.pts.length < 2) continue;
      const mathPoints = s.pts.map((p) => ({ x: p.x, y: p.y }));   // 원본(재편집용)
      const points = extendedMathPts(s).map((m) => worldFromMath(plane, m.x, m.y)); // 렌더·베이크(자동 연장 반영, 매끄러움은 렌더 centripetal이 담당)
      list.push({ ...common, sourceKind: "points", mathPoints, points, breaks: [], autoExtend: !!s.autoExtend, ...elementFields(s, plane, geomPts(s, points)) });
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

  let selError = "";
  _selPts = null; _selBreaks = null;   // 선택 계열의 baked points/경계를 이 렌더에서 갱신(배치 고스트·클릭 가드용)
  _series.forEach((s, i) => {
    const [, dl, dg] = LINE_STYLES[s.styleIdx] || LINE_STYLES[0];
    let pts = null, sourceKind, curveStyle, breaks = null;
    if (s.kind === "expr") {
      const expr = String(s.expr || "").trim();
      if (!expr) return;
      const db = dataBounds(plane);
      const dMin = s.domain ? Math.max(db.xMin, Math.min(s.domain.min, s.domain.max)) : db.xMin;
      const dMax = s.domain ? Math.min(db.xMax, Math.max(s.domain.min, s.domain.max)) : db.xMax;
      const r = sampleFunctionPoints(expr, dMin, dMax, plane);
      if (r.error) { if (i === _sel) selError = r.error; return; }
      if (r.points.length < 2) { if (i === _sel) selError = "정의역 안에 그릴 점이 없습니다"; return; }
      pts = applyOffset(r.points, plane, s.offset);   // 함수식 자유 이동 반영
      breaks = r.breaks;                              // 끊긴 구간(평면 밖) 경계
    } else {
      if (!s.pts.length) return;
      pts = extendedMathPts(s).map((m) => worldFromMath(plane, m.x, m.y)); // 자동 연장 반영(매끄러움은 렌더 centripetal)
      sourceKind = "points"; curveStyle = "straight";
      breaks = [];   // 손그림 곡선은 끊김 없는 연속선 — 거리 휴리스틱으로 쪼개지지 않게 명시
    }
    if (i === _sel) { _selPts = geomPts(s, pts); _selBreaks = breaks; }   // 선택 계열 곡선+경계(배치 스냅 기준)
    const el = renderFuncgraph({
      points: pts, strokeLevel: 0, strokeWidth: s.strokeWidth, breaks,
      dashLength: dl, dashGap: dg, sourceKind,
      curveStyle: s.curveStyle || (s.kind === "points" ? "straight" : "smooth"),
      curvature: s.curvature,
      endLabel: s.endLabel, endLabelSize: endLabelSizeOf(plane),
      ...bakeElements(s, plane, geomPts(s, pts), breaks),  // 표시점/수선/화살표 실시간 미리보기
    });
    if (i === _sel) seriesColorSel(el);
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
        svg.appendChild(hitC);
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
          const ux = (plane.xMax - plane.xMin) ? plane.w / (plane.xMax - plane.xMin) : 1;
          const uy = (plane.yMax - plane.yMin) ? plane.h / (plane.yMax - plane.yMin) : 1;
          const onMove = (ev) => {
            const w = clientToWorld(ev.clientX, ev.clientY);
            if (!w) return;
            const dxm = (w.x - start.x) / ux, dym = -(w.y - start.y) / uy;
            if (s.kind === "expr") s.offset = { dx: baseOff.dx + dxm, dy: baseOff.dy + dym };
            else s.pts = basePts.map((p) => ({ x: p.x + dxm, y: p.y + dym }));
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
  let pGhost = null, pV = null, pH = null;
  if (placing) {
    pGhost = document.createElementNS(SVG_NS, "circle");
    pGhost.setAttribute("r", 1.1); pGhost.setAttribute("fill", "var(--accent)");
    pGhost.setAttribute("fill-opacity", "0.55"); pGhost.setAttribute("stroke", "var(--accent)");
    pGhost.setAttribute("stroke-width", 0.35); pGhost.style.display = "none";
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
  // 커서 x → 함수 위 점(world). 범위 밖이면 null.
  const snapToFunc = (clientX, clientY) => {
    const m = clientToMath(clientX, clientY);
    if (!m) return null;
    const wx = worldFromMath(_previewPlane, m.x, 0).x;
    const wy = worldYAtX(_selPts, wx, _selBreaks);
    return wy == null ? null : { mx: m.x, wx, wy };
  };

  // 좌표 툴팁(요구): 함수/수선/표시점을 찍을 때 커서가 노리는 좌표를 커서 바로 위에 표시.
  let coordTip = null;
  if (drawing || placing) {
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

  svg.addEventListener("click", (e) => {
    const s = _series[_sel];
    // 배치 모드: 함수 위를 클릭할 때만 찍는다(함수 밖 클릭은 무시). 표시점/수선/화살표 동일.
    if (s && (_placeMode === "marker" || _placeMode === "guide" || _placeMode === "arrow")) {
      const hit = snapToFunc(e.clientX, e.clientY);
      if (!hit) return;
      if (_placeMode === "marker") (s.markers = s.markers || []).push(hit.mx);
      else if (_placeMode === "guide") (s.guides = s.guides || []).push(hit.mx);
      else (s.arrows = s.arrows || []).push({ x: hit.mx, dir: 1 }); // 기본 정방향(+), 칩 클릭으로 전환
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
    // 배치 모드 고스트: 함수 위 찍힐 점(+수선이면 축까지 안내선) 미리보기.
    if (placing) {
      const hit = snapToFunc(e.clientX, e.clientY);
      if (!hit) { pGhost.style.display = "none"; if (pV) pV.style.display = "none"; if (pH) pH.style.display = "none"; if (coordTip) coordTip.style.display = "none"; return; }
      pGhost.setAttribute("cx", hit.wx); pGhost.setAttribute("cy", hit.wy); pGhost.style.display = "";
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
    if (pV) pV.style.display = "none";
    if (pH) pH.style.display = "none";
    if (coordTip) coordTip.style.display = "none";
  });
  svg.style.cursor = (drawing || placing) ? "crosshair" : "";

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
        const key = which === "x" ? "labelXOffset" : "labelYOffset";
        const base = { ...(_cfg[key] || { dx: 0, dy: 0 }) };
        if (!start) return;
        const onMove = (ev) => {
          const w = clientToWorld(ev.clientX, ev.clientY);
          if (!w) return;
          _cfg[key] = { dx: base.dx + (w.x - start.x), dy: base.dy + (w.y - start.y) };
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
  // 데이터 범위(눈금 끝 + 반 칸)로 클램프 — 화살표 마진(그 밖)까지는 안 나가게.
  const db = dataBounds(_previewPlane);
  return {
    x: Math.max(db.xMin, Math.min(db.xMax, nx)),
    y: Math.max(db.yMin, Math.min(db.yMax, ny)),
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
    chip.style.cssText = "display:inline-flex;align-items:center;gap:6px;font:12px monospace;max-width:170px;" +
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
function elemChip(text, onDel) {
  const chip = document.createElement("span");
  chip.style.cssText = "display:inline-flex;align-items:center;gap:4px;font:11px monospace;border:1px solid var(--border);border-radius:4px;padding:1px 6px;background:var(--bg-input);color:var(--text-primary);";
  const t = document.createElement("span"); t.textContent = text; chip.appendChild(t);
  const x = document.createElement("span"); x.textContent = "×";
  x.style.cssText = "color:#e5534b;font-weight:700;cursor:pointer;";
  x.addEventListener("click", onDel); chip.appendChild(x);
  return chip;
}
function syncElementLists() {
  const s = _series[_sel] || null;
  _els.markerList.replaceChildren();
  _els.guideList.replaceChildren();
  _els.arrowList.replaceChildren();
  if (s) {
    (s.markers || []).forEach((mx, i) => _els.markerList.appendChild(
      elemChip(`x=${mx}`, () => { s.markers.splice(i, 1); syncElementLists(); refreshPreview(); })));
    (s.guides || []).forEach((mx, i) => _els.guideList.appendChild(
      elemChip(`x=${mx}`, () => { s.guides.splice(i, 1); syncElementLists(); refreshPreview(); })));
    (s.arrows || []).forEach((a, i) => {
      const dirSym = a.dir < 0 ? "←" : "→";
      const chip = elemChip(`x=${a.x} ${dirSym}`, () => { s.arrows.splice(i, 1); syncElementLists(); refreshPreview(); });
      // 좌표(라벨, ×제외)를 누르면 방향 전환(요구).
      const lbl = chip.firstChild;
      lbl.style.cursor = "pointer"; lbl.title = "누르면 방향 전환";
      lbl.addEventListener("click", () => { a.dir = a.dir < 0 ? 1 : -1; syncElementLists(); refreshPreview(); });
      _els.arrowList.appendChild(chip);
    });
  }
  // 클릭 배치 버튼 활성 표시(표시점/수선/화살표 동일 위계).
  const arm = (btn, on) => { btn.style.background = on ? "var(--accent)" : ""; btn.style.color = on ? "#fff" : ""; };
  arm(_els.markerClick, _placeMode === "marker");
  arm(_els.guideClick, _placeMode === "guide");
  arm(_els.arrowClick, _placeMode === "arrow");
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
  _els.ptsRows.style.display = s.kind === "points" ? "" : "none";
  // 자동 연장선: 직선·꺾은선(점 계열)에만 의미 있음(눈대중 그리기). 끝 라벨과 한 줄(요구 8).
  _els.autoExtRow.style.display = s.kind === "points" ? "inline-flex" : "none";
  _els.autoExt.checked = !!s.autoExtend;
  _els.move.checked = !!s.movable;
  if (s.kind === "expr") {
    if (document.activeElement !== _els.expr) _els.expr.value = s.expr;
    if (document.activeElement !== _els.dMin) _els.dMin.value = s.domain ? s.domain.min : "";
    if (document.activeElement !== _els.dMax) _els.dMax.value = s.domain ? s.domain.max : "";
  } else {
    if (document.activeElement !== _els.pts) _els.pts.value = ptsToText(s.pts);
  }
  [..._els.styleHost.children].forEach((b, i) => {
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
  _els.curvatureRow.style.display = showCurv ? "flex" : "none";
  if (showCurv) _els.curvVal.textContent = Math.round((s.curvature || 1) * 100) + "%";
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
  _els.variantSel.value = c.variant;
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
  // 잠긴 칸이 있을 때만 이유를 안내한다(십자에선 다 열려 있어 불필요).
  const negNote = _els.overlay.querySelector("#gm-neg-note");
  if (negNote) negNote.style.display = (!xNegOn || !yNegOn) ? "" : "none";
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
let _tab = "coord";               // "coord" | "func"
function setTab(tab) {
  _tab = tab;
  // 좌표 탭으로 가면 선택돼 있던 함수를 해제한다(요구): 좌표를 볼 땐 함수 강조·배치모드가 남지 않게.
  if (tab === "coord" && (_sel !== -1 || _placeMode || _activeDraw !== -1)) {
    _sel = -1; _placeMode = null; _activeDraw = -1;
    if (typeof renderChips === "function") renderChips();
    if (typeof syncSeriesEditor === "function") syncSeriesEditor();
    if (typeof refreshPreview === "function") refreshPreview();
  }
  _els.tabCoord.style.display = tab === "coord" ? "" : "none";
  _els.tabFunc.style.display = tab === "func" ? "" : "none";
  const base = "font-size:13px;font-weight:600;padding:6px 16px;border:1px solid var(--border);border-radius:6px 6px 0 0;cursor:pointer;";
  const on = "background:var(--accent);border-color:var(--accent);color:#fff;";
  const off = "background:var(--bg-input);color:var(--text-primary);";
  _els.tabCoordBtn.style.cssText = base + (tab === "coord" ? on : off);
  _els.tabFuncBtn.style.cssText = base + (tab === "func" ? on : off);
  if (tab === "func") setFuncTab(_funcTab);   // 함수 탭 진입 시 하위 탭 상태 반영
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
  free: { add: "＋ 자유곡선 추가", hint: "미리보기를 클릭해 점을 찍으면 그 점들을 매끄럽게 잇는 자유곡선이 됩니다.",
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
    <div class="modal gm-modal" role="dialog" aria-modal="true" aria-label="그래프" style="width:min(960px,96vw);">
      <!-- 제목 오른쪽에 간단 설명(요구 1) -->
      <h2 class="modal-title" style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">
        <span id="gm-title">그래프 만들기</span>
        <span style="font-size:12px;font-weight:400;color:var(--text-secondary);">원하는 좌표를 설정하고 자유롭게 그래프를 그립니다.</span>
      </h2>
      <div class="gm-body" style="flex-wrap:nowrap;">
        <div class="gm-right" style="flex:0 0 370px;max-height:66vh;overflow-y:auto;padding-right:6px;">

          <!-- 탭: 좌표 / 함수 (미리보기는 오른쪽 고정, 양 탭 공유) -->
          <div class="gm-tabs" style="display:flex;gap:4px;margin-bottom:12px;">
            <button type="button" id="gm-tab-coord-btn">① 좌표</button>
            <button type="button" id="gm-tab-func-btn">② 함수</button>
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
                <select id="gm-variant-sel" class="gm-num" style="width:auto;padding:6px 8px;">
                  <option value="quadrant">ㄴ자</option>
                  <option value="halfcross">ㅏ자</option>
                  <option value="cross">십자</option>
                </select>
              </div>
            </div>
            <div class="gm-axis-grid">
              <div></div>
              <div class="gm-ax-head"><i>x</i> 가로축</div>
              <div class="gm-ax-head"><i>y</i> 세로축</div>

              <div class="gm-ax-lbl">칸 개수</div>
              <div class="gm-ax-cell">
                <span class="gm-step"><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">−</button><input type="number" id="gm-xneg" min="0" value="0" title="왼쪽(음의 x) 칸 수"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">+</button></span>
                <span class="gm-sep">~</span>
                <span class="gm-step"><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">−</button><input type="number" id="gm-xpos" min="1" value="5" title="오른쪽(양의 x) 칸 수"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">+</button></span>
              </div>
              <div class="gm-ax-cell">
                <span class="gm-step"><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">−</button><input type="number" id="gm-yneg" min="0" value="0" title="아래(음의 y) 칸 수"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">+</button></span>
                <span class="gm-sep">~</span>
                <span class="gm-step"><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">−</button><input type="number" id="gm-ypos" min="1" value="5" title="위(양의 y) 칸 수"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">+</button></span>
              </div>

              <div class="gm-ax-lbl">한 칸 값</div>
              <div class="gm-ax-cell">
                <span class="gm-step"><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">−</button><input type="number" id="gm-xstep" min="0.1" step="0.1" value="1" title="x축 한 칸이 나타내는 값(숫자 눈금)"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">+</button></span>
                <span class="gm-unit">0.1씩</span>
              </div>
              <div class="gm-ax-cell">
                <span class="gm-step"><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">−</button><input type="number" id="gm-ystep" min="0.1" step="0.1" value="1" title="y축 한 칸이 나타내는 값(숫자 눈금)"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">+</button></span>
                <span class="gm-unit">0.1씩</span>
              </div>

              <div class="gm-ax-lbl">축 이름</div>
              <div class="gm-ax-cell">
                <textarea id="gm-labelx" class="gm-ta" rows="1" spellcheck="false" placeholder="예: 시간(s)"
                  style="flex:1;min-width:0;resize:none;field-sizing:content;min-height:32px;">x</textarea>
              </div>
              <div class="gm-ax-cell">
                <textarea id="gm-labely" class="gm-ta" rows="1" spellcheck="false" placeholder="예: 속도(m/s)"
                  style="flex:1;min-width:0;resize:none;field-sizing:content;min-height:32px;">y</textarea>
              </div>

              <div class="gm-ax-note" id="gm-neg-note">ㄴ자는 음의 방향이 없어 왼쪽 칸이 잠깁니다 — 모양을 십자로 바꾸면 열립니다.</div>
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
            <div class="gm-row">
              <span class="gm-row-lbl">동작</span>
              <div class="gm-row-body gm-checks">
                <label class="gm-check"><input type="checkbox" id="gm-labelmove"> 축 라벨 이동<span class="gm-help" title="켜면 미리보기에서 축 이름(예: y, t)을 드래그해 위치를 옮길 수 있습니다. 끄면 원래 위치로 돌아갑니다.">?</span></label>
                <label class="gm-check"><input type="checkbox" id="gm-lockpos"> 좌표·함수 묶기<span class="gm-help" title="좌표평면과 함수를 하나의 그룹으로 묶어 캔버스에서 함께 이동합니다.">?</span></label>
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
              <div class="gm-ax-note" style="grid-column:auto;padding-left:102px;">쉼표로 구분해 입력합니다 · 수식 가능</div>
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
            <div class="gm-row">
              <span class="gm-row-lbl">좌표 크기</span>
              <div class="gm-row-body">
                <span class="gm-step"><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">−</button><input type="number" id="gm-axisscale" min="50" max="200" step="10" value="100"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">+</button></span>
                <span class="gm-unit">%</span>
              </div>
            </div>
            <div class="gm-row">
              <span class="gm-row-lbl">성분 크기</span>
              <div class="gm-row-body">
                <span class="gm-step"><button type="button" data-step="-1" tabindex="-1" aria-label="줄이기">−</button><input type="number" id="gm-tickscale" min="50" max="200" step="10" value="100"><button type="button" data-step="1" tabindex="-1" aria-label="늘리기">+</button></span>
                <span class="gm-unit">%</span>
              </div>
            </div>
          </div>
          </div><!-- /gm-tab-coord -->

          <div id="gm-tab-func" style="display:none;">
          <!-- 함수 하위 탭(요구): 해석적 함수 / 직선·꺾은선 / 자유곡선 — 성격별로 분리 편집.
               미리보기는 셋이 공유하고, '만들기'는 모든 하위 탭의 계열을 한 평면에 합친다. -->
          <div id="gm-subtabs" style="display:flex;gap:4px;margin-bottom:6px;">
            <button type="button" id="gm-sub-expr" class="modal-btn" style="flex:1;font-size:12px;padding:5px;">해석적 함수</button>
            <button type="button" id="gm-sub-poly" class="modal-btn" style="flex:1;font-size:12px;padding:5px;">직선·꺾은선</button>
            <button type="button" id="gm-sub-free" class="modal-btn" style="flex:1;font-size:12px;padding:5px;">자유곡선</button>
          </div>
          <button type="button" id="gm-add-series" class="modal-btn" style="width:100%;font-size:12px;padding:6px;margin-bottom:8px;">＋ 함수식 추가</button>
          <div id="gm-chips" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;"></div>
          <div id="gm-empty-hint" style="font-size:12px;color:var(--text-secondary);">
            함수식 또는 직선·꺾은선을 추가하세요.<span class="gm-help" title="계열 없이 좌표 틀만 만들 수도 있습니다. 추가한 함수는 미리보기 위에 바로 그려집니다.">?</span>
          </div>

          <div id="gm-series-editor" style="display:none;">
            <div id="gm-expr-row" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
              <span style="font-size:13px;color:var(--text-label);white-space:nowrap;">y =</span>
              <input type="text" id="gm-expr" class="gm-num" style="font-family:monospace;flex:1;" spellcheck="false" placeholder="예: sin(x), x^2-3x+1">
            </div>
            <div id="gm-expr-helpers" style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px;"></div>
            <div id="gm-domain-row" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;font-size:12px;color:var(--text-secondary);">
              정의역 <input type="number" id="gm-dmin" class="gm-num" style="width:62px;" step="0.5" placeholder="자동"> ~
              <input type="number" id="gm-dmax" class="gm-num" style="width:62px;" step="0.5" placeholder="자동">
            </div>
            <div id="gm-pts-rows" style="display:none;margin-bottom:6px;">
              <div style="font-size:12px;color:var(--text-secondary);margin-bottom:5px;">
                점 찍기 / 좌표 직접 입력<span class="gm-help" title="미리보기를 클릭해 꼭짓점을 찍으세요 — 커서까지 선이 따라옵니다. Enter 또는 우클릭이면 완료. 마지막 눈금 밖으로도 조금 나갈 수 있습니다. 아래 칸에 좌표를 직접 입력할 수도 있습니다.">?</span>
              </div>
              <input type="text" id="gm-pts" class="gm-num" style="font-family:monospace;width:100%;" spellcheck="false" placeholder="예: 0,0 1,2 3,2">
              <div style="display:flex;gap:6px;margin-top:5px;">
                <button type="button" id="gm-pts-undo" class="modal-btn" style="font-size:11px;padding:3px 8px;">마지막 점 삭제</button>
                <button type="button" id="gm-pts-clear" class="modal-btn" style="font-size:11px;padding:3px 8px;">전체 지움</button>
              </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;font-size:12px;color:var(--text-secondary);">
              선 <span id="gm-styles" style="display:inline-flex;gap:4px;"></span>
              굵기 <input type="number" id="gm-width" class="gm-num gm-spinnum" style="width:58px;" min="0.1" max="2" step="0.1">
            </div>
            <!-- 모양(직선/곡선)은 하위 탭이 결정하므로 숨김(직선·꺾은선=직선, 자유곡선=곡선). -->
            <div id="gm-shape-row" style="display:none;gap:8px;align-items:center;margin-bottom:6px;font-size:12px;color:var(--text-secondary);">
              모양 <span id="gm-curve" style="display:inline-flex;gap:4px;"></span>
            </div>
            <div id="gm-curvature-row" style="display:none;gap:8px;align-items:center;margin-bottom:6px;font-size:12px;color:var(--text-secondary);">
              곡률 <button type="button" id="gm-curv-dn" class="modal-btn" style="font-size:12px;padding:2px 9px;">−</button>
              <span id="gm-curv-val" style="min-width:38px;text-align:center;">100%</span>
              <button type="button" id="gm-curv-up" class="modal-btn" style="font-size:12px;padding:2px 9px;">＋</button>
            </div>
            <!-- 자동 연장선 + 끝 라벨 한 줄(요구 8) — 연장선 설명은 물음표 툴팁으로 -->
            <div style="display:flex;gap:14px;align-items:center;font-size:12px;color:var(--text-secondary);">
              <span style="display:inline-flex;align-items:center;">
                <label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;">
                  <input type="checkbox" id="gm-move"> 이동</label><span class="gm-help" title="체크하면 미리보기에서 이 함수(곡선)를 드래그해 자유롭게 옮길 수 있습니다.">?</span>
              </span>
              <span id="gm-autoext-row" style="display:none;align-items:center;">
                <label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer;">
                  <input type="checkbox" id="gm-autoext"> 자동 연장선</label><span class="gm-help" title="꺾은선 끝을 반 칸 늘려, 끝부분에도 수선·표시점이 잘 매칭되게 합니다.">?</span>
              </span>
              <span style="display:inline-flex;gap:6px;align-items:center;flex:1;min-width:0;">끝 라벨
                <input type="text" id="gm-endlabel" class="gm-num" style="font-family:monospace;flex:1;min-width:0;" spellcheck="false" placeholder="예: v_0 (비우면 없음)"></span>
            </div>

            <!-- 그래프 요소: 3개를 나란히(요구 9). 사용법은 물음표 툴팁으로(요구 7). -->
            <div id="gm-elements" style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px;">
              <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:5px;">그래프 요소</div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
                <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;font-size:12px;color:var(--text-secondary);">
                  <span style="display:inline-flex;align-items:center;white-space:nowrap;">표시점 ●<span class="gm-help" title="찍기를 누른 뒤 미리보기의 함수 위를 클릭하면 그 자리에 점이 생깁니다.">?</span></span>
                  <button type="button" id="gm-marker-click" class="modal-btn" style="font-size:11px;padding:2px 12px;">찍기</button>
                  <div id="gm-marker-list" style="display:flex;flex-wrap:wrap;gap:4px;"></div>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;font-size:12px;color:var(--text-secondary);">
                  <span style="display:inline-flex;align-items:center;white-space:nowrap;">수선의 발<span class="gm-help" title="찍기를 누른 뒤 미리보기의 함수 위를 클릭하면 그 점에서 두 축까지 점선 수선이 생깁니다.">?</span></span>
                  <button type="button" id="gm-guide-click" class="modal-btn" style="font-size:11px;padding:2px 12px;">찍기</button>
                  <div id="gm-guide-list" style="display:flex;flex-wrap:wrap;gap:4px;"></div>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;font-size:12px;color:var(--text-secondary);">
                  <!-- 문구 정정: 화살촉이 클릭 지점에 오고 꼬리가 반대로 뻗는 실제 동작과
                       "중심으로"라는 옛 문구가 어긋나 있었음(261행 주석 참고). -->
                  <span style="display:inline-flex;align-items:center;white-space:nowrap;">화살표<span class="gm-help" title="찍기를 누른 뒤 미리보기의 함수 위를 클릭하면 그 지점에 화살촉이 오도록 곡선을 따라가는 화살표가 생깁니다. 생긴 칩의 좌표를 누르면 방향이 반대로 바뀝니다.">?</span></span>
                  <button type="button" id="gm-arrow-click" class="modal-btn" style="font-size:11px;padding:2px 12px;">찍기</button>
                  <div id="gm-arrow-list" style="display:flex;flex-wrap:wrap;gap:4px;"></div>
                </div>
              </div>
            </div>
          </div>
          </div><!-- /gm-tab-func -->
        </div>

        <div class="gm-left" style="flex:1;min-width:0;">
          <div class="gm-preview-label">미리보기</div>
          <div id="gm-preview" class="gm-preview" style="height:440px;"></div>
          <div id="gm-error" style="color:#e5534b;font-size:12px;min-height:16px;margin-top:4px;"></div>
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
    variantSel: overlay.querySelector("#gm-variant-sel"),
    xNeg: overlay.querySelector("#gm-xneg"), xPos: overlay.querySelector("#gm-xpos"),
    yNeg: overlay.querySelector("#gm-yneg"), yPos: overlay.querySelector("#gm-ypos"),
    xStep: overlay.querySelector("#gm-xstep"), yStep: overlay.querySelector("#gm-ystep"),
    labelX: overlay.querySelector("#gm-labelx"), labelY: overlay.querySelector("#gm-labely"),
    showOrigin: overlay.querySelector("#gm-showorigin"), originBtn: overlay.querySelector("#gm-origin-toggle"),
    showGrid: overlay.querySelector("#gm-showgrid"), showTicks: overlay.querySelector("#gm-showticks"),
    axisScale: overlay.querySelector("#gm-axisscale"), tickScale: overlay.querySelector("#gm-tickscale"),
    lockPos: overlay.querySelector("#gm-lockpos"), labelMove: overlay.querySelector("#gm-labelmove"),
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
    ptsRows: overlay.querySelector("#gm-pts-rows"), pts: overlay.querySelector("#gm-pts"),
    styleHost: overlay.querySelector("#gm-styles"), width: overlay.querySelector("#gm-width"),
    curveHost: overlay.querySelector("#gm-curve"),
    curvatureRow: overlay.querySelector("#gm-curvature-row"), curvVal: overlay.querySelector("#gm-curv-val"),
    autoExt: overlay.querySelector("#gm-autoext"), autoExtRow: overlay.querySelector("#gm-autoext-row"),
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

  /* --- 좌표(cfg) 배선: 리스너가 _cfg에 쓰고 미리보기 갱신 --- */
  // 모양 = 프리셋: 고르면 범위 입력(음/양 방향 칸 수)을 그 모양 기본값으로 채우고
  // 음방향 입력을 활성/비활성한다(ㄴ자=음방향 없음 / ㅏ자=y음방향 / 십자=둘 다).
  _els.variantSel.addEventListener("change", () => {
    applyVariantPreset(_els.variantSel.value);
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
  _els.labelMove.addEventListener("change", () => {
    _cfg.labelMovable = _els.labelMove.checked;
    // 끄면 옮겼던 축 라벨을 원래 지정 위치로 되돌린다(요구).
    if (!_cfg.labelMovable) { _cfg.labelXOffset = { dx: 0, dy: 0 }; _cfg.labelYOffset = { dx: 0, dy: 0 }; }
    refreshPreview();
  });
  _els.labelX.addEventListener("input", () => { _cfg.labelX = _els.labelX.value; refreshPreview(); });
  _els.labelY.addEventListener("input", () => { _cfg.labelY = _els.labelY.value; refreshPreview(); });
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
  _els.tabCoord.addEventListener("click", (e) => {
    const btn = e.target.closest(".gm-step button[data-step]");
    if (!btn) return;
    const inp = btn.parentElement.querySelector("input");
    if (!inp || inp.disabled) return;
    if (Number(btn.dataset.step) > 0) inp.stepUp(); else inp.stepDown();
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });
  _els.showGrid.addEventListener("change", () => { _cfg.showGrid = _els.showGrid.checked; refreshPreview(); });
  _els.showTicks.addEventListener("change", () => { _cfg.showTicks = _els.showTicks.checked; refreshPreview(); });
  _els.lockPos.addEventListener("change", () => { _cfg.lockPosition = _els.lockPos.checked; });
  [["none", "없음"], ["number", "숫자"], ["multiple", "배수"], ["text", "직접"]].forEach(([mode, label]) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b._mode = mode;
    b.style.cssText = "font-size:12px;border:1px solid var(--border);border-radius:3px;padding:3px 10px;background:var(--bg-input);color:var(--text-primary);cursor:pointer;";
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
    b.style.cssText = "font-size:12px;font-family:monospace;border:1px solid var(--border);border-radius:3px;padding:2px 7px;background:var(--bg-input);color:var(--text-primary);cursor:pointer;";
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
  LINE_STYLES.forEach(([label], i) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label;
    b.style.cssText = "font-size:12px;border:1px solid var(--border);border-radius:3px;padding:3px 9px;background:var(--bg-input);color:var(--text-primary);cursor:pointer;";
    b.addEventListener("click", () => { const s = _series[_sel]; if (s) { s.styleIdx = i; syncSeriesEditor(); refreshPreview(); } });
    _els.styleHost.appendChild(b);
  });
  // 선 모양(직선/곡선) 버튼 — 인스펙터에 있던 것을 모달로 이관(계열 스타일 완비).
  [["직선", "straight"], ["곡선", "smooth"]].forEach(([label, val]) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b._curve = val;
    b.style.cssText = "font-size:12px;border:1px solid var(--border);border-radius:3px;padding:3px 10px;background:var(--bg-input);color:var(--text-primary);cursor:pointer;";
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

  /* --- 그래프 요소 배선(표시점/수선/화살표 — 전부 클릭식, 같은 위계) --- */
  // "찍기"를 켜면 배치 모드 → 미리보기의 함수 위를 클릭해 찍는다. 토글 시 미리보기 재생성.
  _els.markerClick.addEventListener("click", () => { _placeMode = _placeMode === "marker" ? null : "marker"; syncElementLists(); refreshPreview(); });
  _els.guideClick.addEventListener("click", () => { _placeMode = _placeMode === "guide" ? null : "guide"; syncElementLists(); refreshPreview(); });
  _els.arrowClick.addEventListener("click", () => { _placeMode = _placeMode === "arrow" ? null : "arrow"; syncElementLists(); refreshPreview(); });

  _els.confirm.addEventListener("click", () => { if (_mode === "edit") commitEdit(); else commitCreate(); });
  _els.cancel.addEventListener("click", hide);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) hide(); });
  // 미리보기 밖 중립 영역 클릭 → 함수 선택 해제(요구): 계열 편집기·칩·탭·추가버튼·미리보기·하단
  // 버튼은 선택 유지(그것들은 선택 계열을 편집/전환하므로). 그 외 모달 여백 클릭은 해제.
  overlay.querySelector(".gm-modal").addEventListener("mousedown", (e) => {
    if (_sel === -1 && !_placeMode && _activeDraw === -1) return;
    // 예외 목록이 옛 id(#gm-add-expr,#gm-add-points)를 가리키고 있었음 — 실제 DOM엔
    // #gm-add-series(추가 버튼)와 #gm-subtabs(하위 탭 컨테이너)가 있으므로 교체.
    if (e.target.closest("#gm-preview, #gm-series-editor, #gm-chips, .gm-tabs, #gm-subtabs, #gm-add-series, .modal-actions")) return;
    _sel = -1; _placeMode = null; _activeDraw = -1;
    renderChips(); syncSeriesEditor(); refreshPreview();
  });
  setupHelpPopovers(overlay);
  overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hide(); } });
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
      _series.push({ kind: "points", pts, styleIdx: styleIdxOf(fg), strokeWidth: fg.strokeWidth ?? 0.3, curveStyle: fg.curveStyle || "straight", curvature: Number.isFinite(fg.curvature) ? fg.curvature : 1, endLabel: fg.endLabel || "", autoExtend: !!fg.autoExtend, ...loadElements(fg) });
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

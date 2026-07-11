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

import { state } from "../state.js?v=0.54.30";
import { makeDefaultCoordplane } from "../function-graph/defaults.js?v=0.54.30";
import { renderCoordplane, renderFuncgraph } from "../render/coordplane.js?v=0.54.30";
import { sampleFunctionPoints } from "../function-graph/sampler.js?v=0.54.30";
import { worldFromMath, mathFromWorld } from "../function-graph/coords.js?v=0.54.30";
import { nextObjectId } from "../tools/id.js?v=0.54.30";

const SVG_NS = "http://www.w3.org/2000/svg";
const PAD_X = 1.6;                // x: 마지막 눈금 → 화살표 여유(요구: 조금 줄임)
const PAD_Y = 1.3;                // y: 마지막 눈금 → 화살표 여유
const GRID_OVER = 0.5;            // 격자를 마지막 눈금 밖으로 더 뻗는 칸(사진4: "반 칸")
// 회색조 프로젝트: 색 대신 선 종류로 계열 구분. [라벨, dashLength, dashGap](mm).
// 점선은 사진2 기준으로 성기게(종전 0.5/1.0은 너무 촘촘 → 대시·간격 키움).
const LINE_STYLES = [["실선", 0, 0], ["점선", 1.6, 1.2], ["파선", 2.4, 1.3]];

let _overlay = null, _els = null;
let _mode = "create";             // "create" | "edit"
let _planeId = null;              // edit 대상 coordplane id
let _cfg = null;                  // 좌표 틀 설정(진실 원본 — DOM 리스너가 여기에 쓴다)
let _series = [];                 // [{kind:"expr",expr,domain:{min,max}|null,...} | {kind:"points",pts:[{x,y}수학],...}]
let _sel = -1;                    // 선택 계열 index
let _previewSvg = null;           // 클릭 좌표 환산용
let _previewPlane = null;

/* ---------- 기본값 ---------- */
function defaultCfg() {
  return {
    variant: "quadrant", cx: 5, cy: 5,
    labelX: "x", labelY: "y", showX: true, showY: true,
    origin: "0", showOrigin: true,
    showGrid: true, showTicks: true,
    tickMode: "none",             // "none" | "number" | "text"
    tickTextX: "", tickTextY: "", // 직접 모드: 쉼표 구분 입력 원문
    labelScale: 1.0,              // 글씨 크기 배율(0.5~2.0) — 사용자 조절
    lockPosition: false,          // 생성 후 계열(함수) 이동 잠금
  };
}
// 계열 기본 선 굵기: 사진의 실선처럼 축보다 확실히 굵게(0.5mm).
function newExprSeries() { return { kind: "expr", expr: "", domain: null, styleIdx: 0, strokeWidth: 0.5, endLabel: "" }; }
function newPointsSeries() { return { kind: "points", pts: [], styleIdx: 0, strokeWidth: 0.5, endLabel: "" }; }

/* ---------- cfg → coordplane 필드 반영 (범위·표시 — 박스 지오메트리 제외) ---------- */
function parseTicks(text) {
  const arr = String(text || "").split(",").map((s) => s.trim());
  while (arr.length && arr[arr.length - 1] === "") arr.pop();
  return arr;
}
function applyCfg(plane, cfg) {
  const cx = Math.max(1, cfg.cx), cy = Math.max(1, cfg.cy);
  plane.axisVariant = cfg.variant;
  plane.richLabels = true;
  plane.gridToData = true;
  plane.xMin = cfg.variant === "cross" ? -(cx + PAD_X) : 0;
  plane.xMax = cx + PAD_X;
  plane.yMin = (cfg.variant === "cross" || cfg.variant === "halfcross") ? -(cy + PAD_Y) : 0;
  plane.yMax = cy + PAD_Y;
  plane.gridStepX = 1; plane.gridStepY = 1;
  plane.gridCountX = cx; plane.gridCountY = cy;  // 눈금/격자를 ±칸 수로 캡(나머지=화살표 마진)
  plane.gridOver = GRID_OVER;                     // 격자만 마지막 눈금 밖 반 칸 더
  plane.showGrid = cfg.showGrid;
  plane.showTicks = cfg.showTicks;
  plane.tickLabelMode = cfg.tickMode;
  plane.showTickLabels = cfg.tickMode === "number"; // 구코드 호환 플래그
  plane.tickTextX = parseTicks(cfg.tickTextX);
  plane.tickTextY = parseTicks(cfg.tickTextY);
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
  plane.labelScale = Number.isFinite(cfg.labelScale) ? cfg.labelScale : 1; // 글씨 크기 배율
  plane.seriesLock = !!cfg.lockPosition;  // 계열 이동 잠금 의도(재편집 복원용)
  plane.graphCfg = { cx, cy };   // 재편집 시 칸 수 복원용 스펙
  return plane;
}

// 라벨 크기를 셀(칸) 크기에 비례해 크게(기본값 상향 — 사진처럼, 종전보다 +30%). 박스 정해진 뒤 호출.
function cellOf(plane) { const d = (plane.xMax - plane.xMin) || 1; return plane.w / d; }
function setLabelSizes(plane) {
  const cell = cellOf(plane);
  const s = Number.isFinite(plane.labelScale) ? plane.labelScale : 1; // 사용자 글씨 크기 배율
  plane.axisLabelSize = Math.round(cell * 0.8 * s * 10) / 10;   // 축 이름
  plane.tickLabelSize = Math.round(cell * 0.68 * s * 10) / 10;  // 눈금 숫자/문자
}

// 데이터(계열)가 놓일 수 있는 수학 범위 = 눈금 끝 + 격자 초과분(반 칸). 화살표 마진은 제외 —
// 함수/점이 화살표 아래까지 뻗지 않도록. 점 스냅 클램프·함수 기본 정의역에 공통 사용.
function dataBounds(plane) {
  const over = plane.gridOver || 0;
  const cx = Number.isFinite(plane.gridCountX) ? plane.gridCountX : Math.max(1, Math.round(plane.xMax - PAD_X));
  const cy = Number.isFinite(plane.gridCountY) ? plane.gridCountY : Math.max(1, Math.round(plane.yMax - PAD_Y));
  const xMax = cx + over, yMax = cy + over;
  return { xMin: plane.xMin < 0 ? -xMax : 0, xMax, yMin: plane.yMin < 0 ? -yMax : 0, yMax };
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
  const endSize = Math.round(cellOf(plane) * 0.68 * (plane.labelScale || 1) * 10) / 10; // 끝 라벨(배율 반영)
  const db = dataBounds(plane);
  const lockPos = !!(_cfg && _cfg.lockPosition);
  for (const s of _series) {
    const [, dl, dg] = LINE_STYLES[s.styleIdx] || LINE_STYLES[0];
    const common = {
      type: "funcgraph", closed: false, strokeLevel: 0,
      strokeWidth: Number.isFinite(s.strokeWidth) ? s.strokeWidth : 0.5,
      dashLength: dl, dashGap: dg,
      endLabel: s.endLabel || "", endLabelSize: endSize, label: "", labelShow: false,
      locked: false, positionLocked: lockPos,
    };
    if (s.kind === "expr") {
      const expr = String(s.expr || "").trim();
      if (!expr) continue;
      // 함수는 데이터 범위(눈금 끝+반 칸)까지만 — 화살표 마진 아래로 뻗지 않게.
      const dMin = s.domain ? Math.max(db.xMin, Math.min(s.domain.min, s.domain.max)) : db.xMin;
      const dMax = s.domain ? Math.min(db.xMax, Math.max(s.domain.min, s.domain.max)) : db.xMax;
      const { points, error } = sampleFunctionPoints(expr, dMin, dMax, plane);
      if (error) return { ok: false, error: `${expr}: ${error}` };
      if (points.length < 2) return { ok: false, error: `${expr}: 정의역 안에서 그릴 점이 없습니다` };
      list.push({ ...common, expr, domainMin: dMin, domainMax: dMax, points });
    } else {
      if (!s.pts || s.pts.length < 2) continue;
      const mathPoints = s.pts.map((p) => ({ x: p.x, y: p.y }));
      const points = mathPoints.map((m) => worldFromMath(plane, m.x, m.y));
      list.push({ ...common, sourceKind: "points", mathPoints, points, curveStyle: "straight" });
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
  // "위치 고정"은 평면이 아니라 그 위의 '함수(계열)'를 잠근다(요구). 평면은 자유롭게 옮길 수 있고,
  // 계열만 positionLocked(prepareSeries에서 설정)이라 클릭으로 끌어 옮겨지지 않는다.
  state.update((st) => {
    const snap = JSON.parse(JSON.stringify(st.objects));
    plane.id = nextObjectId();
    plane.order = st.objects.length;
    plane.layerId = st.activeLayerId;
    st.objects.push(plane);
    for (const f of prep.list) {
      f.id = nextObjectId(); f.planeId = plane.id;
      f.order = st.objects.length; f.layerId = st.activeLayerId;
      st.objects.push(f);
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
    // 평면은 잠그지 않는다(자유 이동). 계열 잠금은 prepareSeries에서 반영됨.
    // 계열 전량 교체(마커/수선/화살표는 planeId 참조라 유지됨 — 위치 재베이크는 백로그)
    st.objects = st.objects.filter((x) => !(x.type === "funcgraph" && x.planeId === o.id));
    for (const f of prep.list) {
      f.id = nextObjectId(); f.planeId = o.id;
      f.order = st.objects.length; f.layerId = o.layerId ?? st.activeLayerId;
      st.objects.push(f);
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
  _sel = -1;
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
  _series.forEach((s, i) => {
    const [, dl, dg] = LINE_STYLES[s.styleIdx] || LINE_STYLES[0];
    let pts = null, sourceKind, curveStyle;
    if (s.kind === "expr") {
      const expr = String(s.expr || "").trim();
      if (!expr) return;
      const db = dataBounds(plane);
      const dMin = s.domain ? Math.max(db.xMin, Math.min(s.domain.min, s.domain.max)) : db.xMin;
      const dMax = s.domain ? Math.min(db.xMax, Math.max(s.domain.min, s.domain.max)) : db.xMax;
      const r = sampleFunctionPoints(expr, dMin, dMax, plane);
      if (r.error) { if (i === _sel) selError = r.error; return; }
      if (r.points.length < 2) { if (i === _sel) selError = "정의역 안에 그릴 점이 없습니다"; return; }
      pts = r.points;
    } else {
      if (!s.pts.length) return;
      pts = s.pts.map((m) => worldFromMath(plane, m.x, m.y));
      sourceKind = "points"; curveStyle = "straight";
    }
    const el = renderFuncgraph({
      points: pts, strokeLevel: 0, strokeWidth: s.strokeWidth,
      dashLength: dl, dashGap: dg, sourceKind, curveStyle,
      endLabel: s.endLabel, endLabelSize: Math.round(cellOf(plane) * 0.68 * (plane.labelScale || 1) * 10) / 10,
    });
    if (i === _sel) seriesColorSel(el);
    svg.appendChild(el);
    // 선택된 점 계열: 찍은 점을 점으로 표시(클릭 진행 상황 확인).
    if (s.kind === "points" && i === _sel) {
      pts.forEach((p) => {
        const c = document.createElementNS(SVG_NS, "circle");
        c.setAttribute("cx", p.x); c.setAttribute("cy", p.y); c.setAttribute("r", 0.9);
        c.setAttribute("fill", "var(--accent)");
        svg.appendChild(c);
      });
    }
  });

  // 점 계열 선택 중이면 꺾은선 도구처럼 "그리는 과정"을 보여준다: 마지막 찍은 점에서
  // 커서까지 고무줄(러버밴드) 선 + 커서 위치 점. 클릭=꼭짓점 추가, Enter/우클릭=완료(요구).
  const drawing = _series[_sel] && _series[_sel].kind === "points";
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
  svg.addEventListener("click", (e) => {
    const s = _series[_sel];
    if (!s || s.kind !== "points") return;
    const m = clientToMath(e.clientX, e.clientY);
    if (!m) return;
    s.pts.push(m);
    syncSeriesEditor(); refreshPreview(); renderChips();
  });
  // 완성 = 우클릭(컨텍스트 메뉴 차단) 또는 Enter(아래 window 리스너). 더블클릭 아님(요구).
  // 클릭이 점을 하나씩 깔끔히 넣으므로 중복 점 pop 불필요.
  svg.addEventListener("contextmenu", (e) => {
    const s = _series[_sel];
    if (!s || s.kind !== "points") return;
    e.preventDefault();
    finishPointsSeries();
  });
  svg.addEventListener("mousemove", (e) => {
    if (!drawing || !rubber) return;
    const m = clientToMath(e.clientX, e.clientY);
    if (!m) { rubber.style.display = "none"; ghost.style.display = "none"; return; }
    const w = worldFromMath(_previewPlane, m.x, m.y);
    ghost.setAttribute("cx", w.x); ghost.setAttribute("cy", w.y); ghost.style.display = "";
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
  });
  svg.style.cursor = drawing ? "crosshair" : "";

  _els.preview.replaceChildren(svg);
  _previewSvg = svg;
  _els.error.textContent = selError;
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
  return (s.endLabel ? s.endLabel + " " : "") + `꺾은선 ${s.pts.length}점`;
}

function renderChips() {
  const host = _els.chips;
  host.replaceChildren();
  _series.forEach((s, i) => {
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
      _series.splice(i, 1);
      if (_sel >= _series.length) _sel = _series.length - 1;
      renderChips(); syncSeriesEditor(); refreshPreview();
    });
    chip.appendChild(x);
    chip.addEventListener("click", () => { _sel = i; renderChips(); syncSeriesEditor(); refreshPreview(); });
    host.appendChild(chip);
  });
}

function addSeries(s) {
  _series.push(s);
  _sel = _series.length - 1;
  renderChips(); syncSeriesEditor(); refreshPreview();
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
  _els.domainRow.style.display = s.kind === "expr" ? "" : "none";
  _els.ptsRows.style.display = s.kind === "points" ? "" : "none";
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
  if (document.activeElement !== _els.width) _els.width.value = s.strokeWidth;
  if (document.activeElement !== _els.endLabel) _els.endLabel.value = s.endLabel;
}

/* ---------- 좌표(cfg) 컨트롤 동기화 ---------- */
function syncCfgControls() {
  const c = _cfg;
  _els.overlay.querySelectorAll('input[name="gm-variant"]').forEach((r) => { r.checked = r.value === c.variant; });
  _els.cx.value = c.cx; _els.cy.value = c.cy;
  _els.labelX.value = c.labelX; _els.labelY.value = c.labelY;
  _els.showX.checked = c.showX; _els.showY.checked = c.showY;
  _els.showOrigin.checked = c.showOrigin;
  _els.originBtn.textContent = c.origin;
  _els.originBtn.style.fontStyle = c.origin === "O" ? "italic" : "normal";
  _els.showGrid.checked = c.showGrid;
  _els.showTicks.checked = c.showTicks;
  if (document.activeElement !== _els.fontScale) _els.fontScale.value = Math.round((c.labelScale || 1) * 100);
  _els.lockPos.checked = !!c.lockPosition;
  [..._els.tickModeHost.children].forEach((b) => {
    const on = b._mode === c.tickMode;
    b.style.background = on ? "color-mix(in srgb, var(--accent) 22%, var(--bg-input))" : "var(--bg-input)";
    b.style.borderColor = on ? "var(--accent)" : "var(--border)";
  });
  _els.tickTextRows.style.display = c.tickMode === "text" ? "" : "none";
  if (document.activeElement !== _els.tickTextX) _els.tickTextX.value = c.tickTextX;
  if (document.activeElement !== _els.tickTextY) _els.tickTextY.value = c.tickTextY;
}

/* ---------- 모달 DOM ---------- */
function build() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "graph-modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal gm-modal" role="dialog" aria-modal="true" aria-label="그래프" style="width:min(960px,96vw);">
      <h2 class="modal-title" id="gm-title">그래프 만들기</h2>
      <div class="gm-body" style="flex-wrap:nowrap;">
        <div class="gm-right" style="flex:0 0 370px;max-height:66vh;overflow-y:auto;padding-right:6px;">

          <div class="gm-label" style="margin-bottom:6px;">① 좌표 틀</div>
          <div class="gm-field">
            <div class="gm-variant">
              <label><input type="radio" name="gm-variant" value="quadrant" checked> ㄴ자</label>
              <label><input type="radio" name="gm-variant" value="halfcross"> ㅏ자</label>
              <label><input type="radio" name="gm-variant" value="cross"> 십자</label>
            </div>
          </div>
          <!-- 칸 수: 한 줄 + −/＋ 스텝 버튼(요구 1) -->
          <div class="gm-field" style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;">
            <span style="display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:var(--text-label);">가로
              <button type="button" class="gm-step" id="gm-cx-dn">−</button>
              <input type="number" id="gm-cx" class="gm-num gm-stepnum" min="1" value="5">
              <button type="button" class="gm-step" id="gm-cx-up">＋</button></span>
            <span style="display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:var(--text-label);">세로
              <button type="button" class="gm-step" id="gm-cy-dn">−</button>
              <input type="number" id="gm-cy" class="gm-num gm-stepnum" min="1" value="5">
              <button type="button" class="gm-step" id="gm-cy-up">＋</button></span>
          </div>
          <!-- 축 이름: 가로/세로 한 줄에 두 칸(요구 2) -->
          <div class="gm-field" style="display:flex;gap:10px;">
            <div style="flex:1;min-width:0;">
              <label class="gm-labrow"><input type="checkbox" id="gm-showx" checked> 가로축 이름</label>
              <textarea id="gm-labelx" class="gm-ta" rows="2" spellcheck="false" placeholder="예: 시간(s)">x</textarea>
            </div>
            <div style="flex:1;min-width:0;">
              <label class="gm-labrow"><input type="checkbox" id="gm-showy" checked> 세로축 이름</label>
              <textarea id="gm-labely" class="gm-ta" rows="2" spellcheck="false" placeholder="예: 속도(m/s)">y</textarea>
            </div>
          </div>
          <!-- 격자 / 눈금 / 원점 순서 한 줄(요구 3) -->
          <div class="gm-field" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
            <label class="gm-check" style="margin-top:0;"><input type="checkbox" id="gm-showgrid" checked> 격자</label>
            <label class="gm-check" style="margin-top:0;"><input type="checkbox" id="gm-showticks" checked> 눈금</label>
            <span style="display:inline-flex;align-items:center;gap:7px;">
              <label class="gm-check" style="margin-top:0;"><input type="checkbox" id="gm-showorigin" checked> 원점</label>
              <button type="button" id="gm-origin-toggle" title="누르면 0 ↔ O 전환"
                style="font:600 14px serif;width:32px;height:24px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary);cursor:pointer;">0</button>
            </span>
          </div>
          <!-- 눈금 라벨: 제목 + 버튼 한 줄(요구 4) -->
          <div class="gm-field" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="gm-label" style="margin:0;white-space:nowrap;">눈금 라벨</span>
            <div id="gm-tickmode" style="display:flex;gap:4px;"></div>
          </div>
          <div id="gm-ticktext-rows" class="gm-field" style="display:none;">
            <label class="gm-sub" style="margin-bottom:5px;"><span>x축 눈금 (쉼표 구분·수식 가능)</span>
              <input type="text" id="gm-ticktext-x" class="gm-num" style="font-family:monospace;" placeholder="예: t_0, 2t_0, 3t_0"></label>
            <label class="gm-sub"><span>y축 눈금</span>
              <input type="text" id="gm-ticktext-y" class="gm-num" style="font-family:monospace;" placeholder="예: v_0, 2v_0"></label>
          </div>
          <div class="gm-field" style="display:flex;align-items:center;gap:8px;">
            <span class="gm-label" style="margin:0;white-space:nowrap;">글씨 크기</span>
            <button type="button" class="gm-step" id="gm-fs-dn">−</button>
            <input type="number" id="gm-fontscale" class="gm-num gm-stepnum" min="50" max="200" step="10" value="100">
            <span style="font-size:12px;color:var(--text-secondary);">%</span>
            <button type="button" class="gm-step" id="gm-fs-up">＋</button>
          </div>
          <div class="gm-field">
            <label class="gm-check" style="margin-top:0;"><input type="checkbox" id="gm-lockpos"> 생성 후 함수(계열) 위치 고정</label>
          </div>

          <div class="gm-label" style="margin:14px 0 6px;border-top:1px solid var(--border);padding-top:12px;">② 그래프 (계열)</div>
          <div style="display:flex;gap:6px;margin-bottom:8px;">
            <button type="button" id="gm-add-expr" class="modal-btn" style="flex:1;font-size:12px;padding:5px;">＋ 함수식</button>
            <button type="button" id="gm-add-points" class="modal-btn" style="flex:1;font-size:12px;padding:5px;">＋ 직선·꺾은선</button>
          </div>
          <div id="gm-chips" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;"></div>
          <div id="gm-empty-hint" style="font-size:12px;color:var(--text-secondary);line-height:1.6;">
            계열 없이 틀만 만들 수도 있습니다.<br>함수식 또는 직선·꺾은선을 추가하면 미리보기 위에 바로 그려집니다.
          </div>

          <div id="gm-series-editor" style="display:none;">
            <div id="gm-expr-row" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
              <span style="font-size:13px;color:var(--text-label);white-space:nowrap;">y =</span>
              <input type="text" id="gm-expr" class="gm-num" style="font-family:monospace;flex:1;" spellcheck="false" placeholder="예: sin(x), x^2-3x+1">
            </div>
            <div id="gm-domain-row" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;font-size:12px;color:var(--text-secondary);">
              정의역 <input type="number" id="gm-dmin" class="gm-num" style="width:62px;" step="0.5" placeholder="자동"> ~
              <input type="number" id="gm-dmax" class="gm-num" style="width:62px;" step="0.5" placeholder="자동">
            </div>
            <div id="gm-pts-rows" style="display:none;margin-bottom:6px;">
              <div style="font-size:12px;color:var(--text-secondary);line-height:1.6;margin-bottom:5px;">
                <b style="color:var(--accent);">미리보기를 클릭</b>해 꼭짓점을 찍으세요 — 커서까지 선이 따라옵니다.
                <b>Enter</b> 또는 <b>우클릭</b>이면 완료. 마지막 눈금 밖으로도 조금 나갈 수 있습니다.<br>또는 좌표를 직접 입력:
              </div>
              <input type="text" id="gm-pts" class="gm-num" style="font-family:monospace;width:100%;" spellcheck="false" placeholder="예: 0,0 1,2 3,2">
              <div style="display:flex;gap:6px;margin-top:5px;">
                <button type="button" id="gm-pts-undo" class="modal-btn" style="font-size:11px;padding:3px 8px;">마지막 점 삭제</button>
                <button type="button" id="gm-pts-clear" class="modal-btn" style="font-size:11px;padding:3px 8px;">전체 지움</button>
              </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;font-size:12px;color:var(--text-secondary);">
              선 <span id="gm-styles" style="display:inline-flex;gap:4px;"></span>
              굵기 <input type="number" id="gm-width" class="gm-num" style="width:54px;" min="0.1" max="2" step="0.1">
            </div>
            <div style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--text-secondary);">
              끝 라벨 <input type="text" id="gm-endlabel" class="gm-num" style="font-family:monospace;flex:1;" spellcheck="false" placeholder="예: v_0 (비우면 없음)">
            </div>
          </div>
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
    cx: overlay.querySelector("#gm-cx"), cy: overlay.querySelector("#gm-cy"),
    labelX: overlay.querySelector("#gm-labelx"), labelY: overlay.querySelector("#gm-labely"),
    showX: overlay.querySelector("#gm-showx"), showY: overlay.querySelector("#gm-showy"),
    showOrigin: overlay.querySelector("#gm-showorigin"), originBtn: overlay.querySelector("#gm-origin-toggle"),
    showGrid: overlay.querySelector("#gm-showgrid"), showTicks: overlay.querySelector("#gm-showticks"),
    fontScale: overlay.querySelector("#gm-fontscale"), lockPos: overlay.querySelector("#gm-lockpos"),
    tickModeHost: overlay.querySelector("#gm-tickmode"),
    tickTextRows: overlay.querySelector("#gm-ticktext-rows"),
    tickTextX: overlay.querySelector("#gm-ticktext-x"), tickTextY: overlay.querySelector("#gm-ticktext-y"),
    chips: overlay.querySelector("#gm-chips"), emptyHint: overlay.querySelector("#gm-empty-hint"),
    editor: overlay.querySelector("#gm-series-editor"),
    exprRow: overlay.querySelector("#gm-expr-row"), expr: overlay.querySelector("#gm-expr"),
    domainRow: overlay.querySelector("#gm-domain-row"),
    dMin: overlay.querySelector("#gm-dmin"), dMax: overlay.querySelector("#gm-dmax"),
    ptsRows: overlay.querySelector("#gm-pts-rows"), pts: overlay.querySelector("#gm-pts"),
    styleHost: overlay.querySelector("#gm-styles"), width: overlay.querySelector("#gm-width"),
    endLabel: overlay.querySelector("#gm-endlabel"),
    preview: overlay.querySelector("#gm-preview"), error: overlay.querySelector("#gm-error"),
    confirm: overlay.querySelector("#gm-confirm"), cancel: overlay.querySelector("#gm-cancel"),
  };

  /* --- 좌표(cfg) 배선: 리스너가 _cfg에 쓰고 미리보기 갱신 --- */
  overlay.querySelectorAll('input[name="gm-variant"]').forEach((r) => {
    r.addEventListener("change", () => { if (r.checked) { _cfg.variant = r.value; refreshPreview(); } });
  });
  const int = (el, d) => { const n = parseInt(el.value, 10); return Number.isFinite(n) && n > 0 ? n : d; };
  _els.cx.addEventListener("input", () => { _cfg.cx = int(_els.cx, 5); refreshPreview(); });
  _els.cy.addEventListener("input", () => { _cfg.cy = int(_els.cy, 5); refreshPreview(); });
  // −/＋ 스텝 버튼: 칸 수를 클릭으로 조절(최소 1).
  const bump = (key, d) => { _cfg[key] = Math.max(1, (_cfg[key] || 1) + d); syncCfgControls(); refreshPreview(); };
  overlay.querySelector("#gm-cx-dn").addEventListener("click", () => bump("cx", -1));
  overlay.querySelector("#gm-cx-up").addEventListener("click", () => bump("cx", 1));
  overlay.querySelector("#gm-cy-dn").addEventListener("click", () => bump("cy", -1));
  overlay.querySelector("#gm-cy-up").addEventListener("click", () => bump("cy", 1));
  // 글씨 크기(%) — 입력 + −/＋ 스텝(50~200%).
  const readScale = () => { const n = parseInt(_els.fontScale.value, 10); return Number.isFinite(n) ? Math.max(50, Math.min(200, n)) : 100; };
  _els.fontScale.addEventListener("input", () => { _cfg.labelScale = readScale() / 100; refreshPreview(); });
  const bumpScale = (d) => { _cfg.labelScale = Math.max(0.5, Math.min(2, (_cfg.labelScale || 1) + d)); syncCfgControls(); refreshPreview(); };
  overlay.querySelector("#gm-fs-dn").addEventListener("click", () => bumpScale(-0.1));
  overlay.querySelector("#gm-fs-up").addEventListener("click", () => bumpScale(0.1));
  _els.labelX.addEventListener("input", () => { _cfg.labelX = _els.labelX.value; refreshPreview(); });
  _els.labelY.addEventListener("input", () => { _cfg.labelY = _els.labelY.value; refreshPreview(); });
  _els.showX.addEventListener("change", () => { _cfg.showX = _els.showX.checked; refreshPreview(); });
  _els.showY.addEventListener("change", () => { _cfg.showY = _els.showY.checked; refreshPreview(); });
  _els.showOrigin.addEventListener("change", () => { _cfg.showOrigin = _els.showOrigin.checked; refreshPreview(); });
  // 원점: 입력이 아니라 토글 버튼 — 숫자 0(정자) ↔ 영문 O(이탤릭). 요구 3.
  _els.originBtn.addEventListener("click", () => {
    _cfg.origin = _cfg.origin === "0" ? "O" : "0";
    syncCfgControls(); refreshPreview();
  });
  _els.showGrid.addEventListener("change", () => { _cfg.showGrid = _els.showGrid.checked; refreshPreview(); });
  _els.showTicks.addEventListener("change", () => { _cfg.showTicks = _els.showTicks.checked; refreshPreview(); });
  _els.lockPos.addEventListener("change", () => { _cfg.lockPosition = _els.lockPos.checked; });
  [["none", "없음"], ["number", "숫자"], ["text", "직접 입력"]].forEach(([mode, label]) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b._mode = mode;
    b.style.cssText = "font-size:12px;border:1px solid var(--border);border-radius:3px;padding:3px 10px;background:var(--bg-input);color:var(--text-primary);cursor:pointer;";
    b.addEventListener("click", () => { _cfg.tickMode = mode; syncCfgControls(); refreshPreview(); });
    _els.tickModeHost.appendChild(b);
  });
  _els.tickTextX.addEventListener("input", () => { _cfg.tickTextX = _els.tickTextX.value; refreshPreview(); });
  _els.tickTextY.addEventListener("input", () => { _cfg.tickTextY = _els.tickTextY.value; refreshPreview(); });

  /* --- 계열 배선 --- */
  overlay.querySelector("#gm-add-expr").addEventListener("click", () => { addSeries(newExprSeries()); _els.expr.focus(); });
  overlay.querySelector("#gm-add-points").addEventListener("click", () => addSeries(newPointsSeries()));
  _els.expr.addEventListener("input", () => { const s = _series[_sel]; if (s) { s.expr = _els.expr.value; renderChips(); refreshPreview(); } });
  const readDomain = () => {
    const s = _series[_sel]; if (!s || s.kind !== "expr") return;
    const lo = parseFloat(_els.dMin.value), hi = parseFloat(_els.dMax.value);
    const edge = _cfg.cx + GRID_OVER;   // 데이터 끝(눈금+반 칸)
    s.domain = (Number.isFinite(lo) || Number.isFinite(hi))
      ? { min: Number.isFinite(lo) ? lo : -edge, max: Number.isFinite(hi) ? hi : edge }
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
  _els.width.addEventListener("input", () => {
    const s = _series[_sel]; const v = parseFloat(_els.width.value);
    if (s && Number.isFinite(v)) { s.strokeWidth = Math.max(0.1, Math.min(2, v)); refreshPreview(); }
  });
  _els.endLabel.addEventListener("input", () => {
    const s = _series[_sel]; if (s) { s.endLabel = _els.endLabel.value; renderChips(); refreshPreview(); }
  });

  _els.confirm.addEventListener("click", () => { if (_mode === "edit") commitEdit(); else commitCreate(); });
  _els.cancel.addEventListener("click", hide);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) hide(); });
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

function hide() { if (_overlay) _overlay.hidden = true; }

/* ---------- 편집 모드 로드: plane + 자식 계열 → cfg/_series ---------- */
function loadFromPlane(plane) {
  const objs = state.get().objects;
  const cfg = defaultCfg();
  cfg.variant = plane.axisVariant || "quadrant";
  cfg.cx = plane.graphCfg && plane.graphCfg.cx ? plane.graphCfg.cx : Math.max(1, Math.round((plane.xMax ?? 5) - PAD_X));
  cfg.cy = plane.graphCfg && plane.graphCfg.cy ? plane.graphCfg.cy : Math.max(1, Math.round((plane.yMax ?? 5) - PAD_Y));
  cfg.labelX = plane.labelX ?? "x"; cfg.labelY = plane.labelY ?? "y";
  cfg.showX = plane.showAxisLabelX !== false; cfg.showY = plane.showAxisLabelY !== false;
  cfg.origin = (plane.labelOrigin === "O") ? "O" : "0";
  cfg.showOrigin = plane.showOrigin !== false;
  cfg.showGrid = plane.showGrid === true;
  cfg.showTicks = plane.showTicks !== false;
  cfg.tickMode = plane.tickLabelMode || (plane.showTickLabels ? "number" : "none");
  cfg.tickTextX = Array.isArray(plane.tickTextX) ? plane.tickTextX.join(", ") : "";
  cfg.tickTextY = Array.isArray(plane.tickTextY) ? plane.tickTextY.join(", ") : "";
  cfg.labelScale = Number.isFinite(plane.labelScale) ? plane.labelScale : 1;
  // 계열 잠금은 평면의 seriesLock(신규) 우선, 없으면 자식 계열의 positionLocked로 유도.
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
      _series.push({ kind: "points", pts, styleIdx: styleIdxOf(fg), strokeWidth: fg.strokeWidth ?? 0.3, endLabel: fg.endLabel || "" });
    } else {
      _series.push({
        kind: "expr", expr: fg.expr || "",
        domain: (fg.domainMin != null && fg.domainMax != null) ? { min: fg.domainMin, max: fg.domainMax } : null,
        styleIdx: styleIdxOf(fg), strokeWidth: fg.strokeWidth ?? 0.3, endLabel: fg.endLabel || "",
      });
    }
  }
  _sel = _series.length ? 0 : -1;
}

/* ----- PUBLIC: 열기. planeId 없으면 새로 만들기, 있으면 그 그래프를 편집. ----- */
export function openGraphModal(planeId = null) {
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
  _els.title.textContent = _mode === "edit" ? "그래프 편집" : "그래프 만들기";
  _els.confirm.textContent = _mode === "edit" ? "적용" : "만들기";
  _els.error.textContent = "";
  _overlay.hidden = false;
  syncCfgControls();
  renderChips();
  syncSeriesEditor();
  refreshPreview();
}

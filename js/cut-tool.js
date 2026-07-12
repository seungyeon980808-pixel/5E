/* ===== CUT TOOL — 삽입(생성) 후 캔버스에서 객체 자르기 (가위 하나) =====
//
// activeTool === "CUT" 일 때만 동작한다. 진입 단축키 e는 tools.js에서 배선한다.
// 툴바 버튼(data-tool="CUT")도 진입 경로. 서브모드/칼 도구는 없다(가위 하나로 통합).
//
//   · 자유롭게 그은 경로가 지나가는 객체를 교차점에서 분할한다(획=조각, 채운 영역=채운 두 조각).
//   · Shift = 직선, Shift+Ctrl = 직선 + 각도 이산 스냅.
//   · 커서는 크로스헤어. 실제로 잘리는 지점(교차점)을 드래그 중 빨간 점으로 표시.
// 분할 수학은 cut-geometry.js(순수 함수, Node 테스트 완료). 여기선 UI·포인터·
// 스토어 교체(Undo 1스텝)만 담당. */

import { screenToWorld } from "./viewport.js?v=0.54.51";
import { cutObject, isCuttable, cutCrossingPoints } from "./cut-geometry.js?v=0.54.51";
import { snapLineEnd } from "./geometry.js?v=0.54.51";
import { simplifyRDP } from "./geometry.js?v=0.54.51";
import { getObjectBBox } from "./pick.js?v=0.54.51";

const SVG_NS = "http://www.w3.org/2000/svg";
const CUT_CURSOR = "crosshair";
const MIN_STEP_PX = 2;   // 화면 2px 이상 움직여야 새 자유점 기록
const RDP_EPS_PX = 1.5;  // 자유경로 단순화 허용오차(화면 px)

let _state, _svg;
let _drawing = null;     // 드래그 중: { start:{x,y}, free:[{x,y}...], path:[{x,y}...] }
let _overlay = null;     // 임시 미리보기 <g> (빨간 경로 + 교차점 점)
let _bboxLayer = null;   // 전체 오브젝트 bbox 표시 <g>
let _bboxRaf = 0;
let _space = false;
let _idc = 0;

/* 하단 안내 패널은 공용 tool-hint.js가 전담한다(자르기 포함 전 도구 공통 슬롯). */

function isActive() { return _state.get().activeTool === "CUT"; }

function syncUI(tool) {
  const on = tool === "CUT";
  setCursor(on ? CUT_CURSOR : "");
  if (on) scheduleBBoxes();
  else { clearOverlay(); clearBBoxes(); _drawing = null; }
}

function worldPos(e) { return screenToWorld(_svg, _state.get().viewBox, e.clientX, e.clientY); }
function worldPerPx() { return _state.get().viewBox.w / (_svg.getBoundingClientRect().width || 1); }
function setCursor(css) { _svg.style.cursor = css; }

/* ----- 전체 오브젝트 bbox 표시(자르기 도구일 때: 파랑=자를 수 있음) ----- */
function clearBBoxes() { if (_bboxLayer) { _bboxLayer.remove(); _bboxLayer = null; } }
function drawBBoxes() {
  clearBBoxes();
  if (!isActive()) return;
  const layer = document.createElementNS(SVG_NS, "g");
  layer.setAttribute("pointer-events", "none");
  const sw = worldPerPx() * 0.8;
  for (const o of _state.get().objects) {
    let bb; try { bb = getObjectBBox(o); } catch (_) { bb = null; }
    if (!bb || bb.w <= 0 || bb.h <= 0) continue;
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", bb.x); r.setAttribute("y", bb.y);
    r.setAttribute("width", bb.w); r.setAttribute("height", bb.h);
    r.setAttribute("fill", "none");
    r.setAttribute("stroke", isCuttable(o) ? "#0969da" : "#adb5bd");
    r.setAttribute("stroke-width", sw);
    r.setAttribute("stroke-dasharray", `${sw * 3} ${sw * 2}`);
    r.setAttribute("opacity", "0.55");
    layer.appendChild(r);
  }
  _bboxLayer = layer;
  _svg.appendChild(layer);
}
// setTimeout (rAF는 비활성 탭·헤드리스에서 안 fired) — 렌더가 오버레이를 지운 뒤 재그림.
function scheduleBBoxes() { clearTimeout(_bboxRaf); _bboxRaf = setTimeout(drawBBoxes, 0); }

/* ----- 임시 미리보기: 빨간 절단 경로 + 실제 잘리는 지점(교차점) 빨간 점 ----- */
function clearOverlay() { if (_overlay) { _overlay.remove(); _overlay = null; } }
function renderOverlay(path) {
  clearOverlay();
  if (!path || path.length < 2) return;
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("pointer-events", "none");
  // 그은 경로(빨간 점선)
  const sw = worldPerPx() * 1.6;
  const poly = document.createElementNS(SVG_NS, "polyline");
  poly.setAttribute("points", path.map((p) => `${p.x},${p.y}`).join(" "));
  poly.setAttribute("stroke", "#e0313c");
  poly.setAttribute("stroke-width", sw);
  poly.setAttribute("stroke-dasharray", `${sw * 3} ${sw * 2}`);
  poly.setAttribute("fill", "none");
  poly.setAttribute("stroke-linecap", "round");
  poly.setAttribute("stroke-linejoin", "round");
  g.appendChild(poly);
  // 실제 잘리는 지점: 채운 빨간 점
  const dotR = worldPerPx() * 3.2;
  for (const o of _state.get().objects) {
    if (!isCuttable(o)) continue;
    for (const pt of cutCrossingPoints(o, path)) {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", pt.x); c.setAttribute("cy", pt.y); c.setAttribute("r", dotR);
      c.setAttribute("fill", "#e0313c");
      c.setAttribute("stroke", "#fff");
      c.setAttribute("stroke-width", worldPerPx() * 0.8);
      g.appendChild(c);
    }
  }
  _overlay = g;
  _svg.appendChild(g);
}

/* ----- 그은 경로 계산: Shift=직선(+Ctrl 각도스냅), 그 외=자유곡선 누적 ----- */
function pathFromEvent(e, finalize) {
  const cur = worldPos(e);
  if (e.shiftKey) {
    const end = e.ctrlKey ? snapLineEnd(_drawing.start, cur, true) : cur;
    return [_drawing.start, end];
  }
  const free = _drawing.free;
  const last = free[free.length - 1];
  const stepW = MIN_STEP_PX * worldPerPx();
  if (!last || Math.hypot(cur.x - last.x, cur.y - last.y) >= stepW) free.push(cur);
  if (finalize) return simplifyRDP(free.slice(), RDP_EPS_PX * worldPerPx());
  return free.slice();
}

/* ----- 포인터: 드래그로 경로를 긋고, 놓으면 자름 ----- */
function onDown(e) {
  if (!isActive() || e.button !== 0 || _space) return;
  const p = worldPos(e);
  _drawing = { start: p, free: [p], path: [p] };
}
function onMove(e) {
  if (!_drawing) return;
  _drawing.path = pathFromEvent(e, false);
  renderOverlay(_drawing.path);
}
function onUp(e) {
  if (!_drawing) return;
  let path = _drawing.path;
  if (e && typeof e.clientX === "number") path = pathFromEvent(e, true);
  _drawing = null;
  clearOverlay();
  if (path && path.length >= 2) applyCut(path);
}

/* ----- 실제 자르기: 경로가 지나가는 모든 대상 → 조각으로 교체 (Undo 1스텝) ----- */
function applyCut(path) {
  const objs = _state.get().objects;
  const results = [];
  for (const o of objs) {
    if (!isCuttable(o)) continue;
    const pieces = cutObject(o, "freehand", { path });
    if (pieces && pieces.length) results.push({ id: o.id, pieces });
  }
  if (!results.length) return;

  const stamp = Date.now().toString(36);
  _state.update((s) => {
    const snapshot = JSON.parse(JSON.stringify(s.objects));
    const map = new Map(results.map((r) => [r.id, r.pieces]));
    const out = [];
    const addedIds = [];
    for (const o of s.objects) {
      const pieces = map.get(o.id);
      if (!pieces) { out.push(o); continue; }
      for (const piece of pieces) {
        piece.id = `obj_${stamp}_cut${++_idc}`;
        piece.layerId = o.layerId;
        piece.order = o.order;
        out.push(piece);
        addedIds.push(piece.id);
      }
    }
    s.objects = out;
    s.undoStack.push(snapshot);
    s.redoStack = [];
    s.selectedIds = addedIds;
    s.targetedId = null;
  });
}

export function initCutTool(svg, state) {
  _state = state; _svg = svg;
  state.subscribe((s) => syncUI(s.activeTool));
  syncUI(state.get().activeTool);
  svg.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("keydown", (e) => { if (e.code === "Space") _space = true; });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") _space = false; });
}

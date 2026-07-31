/* ===== ERASE TOOL — 이미지·SVG자산에 진짜 "구멍"을 뚫는 올가미 지우개 =====
//
// activeTool === "ERASE" 일 때만 동작한다. 진입 단축키 Shift+E는 tools.js에서 배선한다.
// 툴바 버튼(data-tool="ERASE")도 진입 경로.
//
//   · 드래그로 자유 경로를 그리고 놓으면 시작점-끝점을 이어 닫힌 다각형이 된다.
//   · 그 다각형과 겹치는 **모든** image·svgAsset 에 `poly` cutout 을 이어붙인다.
//   · 흰색으로 덮는 게 아니라 마스크로 지우므로 **실제로 투명**해진다(뒤가 비친다).
//
// cutouts 좌표계는 객체 상자의 0~1 분수(회전 풀기 전 좌상단 기준)라 이동·크기변경·
// 회전에 자동으로 따라붙는다(js/image-cutout.js 머리말 · render/shapes.js 마스크).
// 구조·규약(포인터 처리·오버레이 미리보기·Undo 1스텝)은 js/cut-tool.js 를 그대로 따랐다.
// 가위(CUT)와는 완전히 독립이며 가위 코드는 전혀 건드리지 않는다. */

import { screenToWorld } from "./viewport.js?v=1.3.0";
import { simplifyRDP } from "./geometry.js?v=1.3.0";
import { getObjectBBox } from "./pick.js?v=1.3.0";

const SVG_NS = "http://www.w3.org/2000/svg";
const ERASE_CURSOR = "crosshair";
const MIN_STEP_PX = 2;   // 화면 2px 이상 움직여야 새 자유점 기록
const RDP_EPS_PX = 1.5;  // 자유경로 단순화 허용오차(화면 px)

let _state, _svg;
let _drawing = null;     // 드래그 중: { free:[{x,y}...], path:[{x,y}...] }
let _overlay = null;     // 임시 미리보기 <g> (주황 점선 올가미 + 반투명 채움)
let _bboxLayer = null;   // 뚫을 수 있는 대상 표시 <g>
let _bboxTimer = 0;
let _space = false;
let _seq = 0;

function isActive() { return _state.get().activeTool === "ERASE"; }
// 구멍을 뚫을 수 있는 대상: 래스터 이미지와 내장 SVG 자산(둘 다 상자 + 마스크 구조).
function isErasable(o) { return !!o && (o.type === "image" || o.type === "svgAsset") && o.w > 0 && o.h > 0; }

function syncUI(tool) {
  const on = tool === "ERASE";
  setCursor(on ? ERASE_CURSOR : "");
  if (on) scheduleBBoxes();
  else { clearOverlay(); clearBBoxes(); _drawing = null; }
}

function worldPos(e) { return screenToWorld(_svg, _state.get().viewBox, e.clientX, e.clientY); }
function worldPerPx() { return _state.get().viewBox.w / (_svg.getBoundingClientRect().width || 1); }
function setCursor(css) { _svg.style.cursor = css; }

/* ----- 대상 표시(지우개일 때: 주황=뚫을 수 있음, 회색=대상 아님) ----- */
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
    r.setAttribute("stroke", isErasable(o) ? "#e8590c" : "#adb5bd");
    r.setAttribute("stroke-width", sw);
    r.setAttribute("stroke-dasharray", `${sw * 3} ${sw * 2}`);
    r.setAttribute("opacity", "0.55");
    layer.appendChild(r);
  }
  _bboxLayer = layer;
  _svg.appendChild(layer);
}
// setTimeout (rAF는 비활성 탭·헤드리스에서 안 fired) — 렌더가 오버레이를 지운 뒤 재그림.
function scheduleBBoxes() { clearTimeout(_bboxTimer); _bboxTimer = setTimeout(drawBBoxes, 0); }

/* ----- 임시 미리보기: 주황 점선 올가미 + 반투명 채움(가위의 빨강과 구분) ----- */
function clearOverlay() { if (_overlay) { _overlay.remove(); _overlay = null; } }
function renderOverlay(path) {
  clearOverlay();
  if (!path || path.length < 2) return;
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("pointer-events", "none");
  const sw = worldPerPx() * 1.6;
  const pts = path.map((p) => `${p.x},${p.y}`).join(" ");
  const fill = document.createElementNS(SVG_NS, "polygon");
  fill.setAttribute("points", pts);
  fill.setAttribute("fill", "#e8590c");
  fill.setAttribute("fill-opacity", "0.18");
  fill.setAttribute("stroke", "none");
  g.appendChild(fill);
  const poly = document.createElementNS(SVG_NS, "polygon");
  poly.setAttribute("points", pts);
  poly.setAttribute("fill", "none");
  poly.setAttribute("stroke", "#e8590c");
  poly.setAttribute("stroke-width", sw);
  poly.setAttribute("stroke-dasharray", `${sw * 3} ${sw * 2}`);
  poly.setAttribute("stroke-linecap", "round");
  poly.setAttribute("stroke-linejoin", "round");
  g.appendChild(poly);
  _overlay = g;
  _svg.appendChild(g);
}

/* ----- 기하 유틸 (cut-geometry.js의 worldToFrac 과 같은 식) ----- */
function round3(v) { return Math.round(v * 1000) / 1000; }
function rotatePt(px, py, cx, cy, deg) {
  if (!deg) return { x: px, y: py };
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const dx = px - cx, dy = py - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}
// 월드 점 → 객체 로컬 분수 좌표(회전 풀고 상자로 정규화). 0~1 밖은 마스크가 알아서 자른다.
function worldToFrac(o, p) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  const q = rotatePt(p.x, p.y, cx, cy, -(o.rotation || 0));
  return { x: round3((q.x - o.x) / o.w), y: round3((q.y - o.y) / o.h) };
}
function polygonArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}
// 분수 다각형이 객체 상자([0,1]²)와 실제로 겹치는지 — bbox 교차로 싸게 판정.
// (분수 좌표라 회전은 이미 풀려 있다. 안 겹치면 마스크에 넣어도 무의미하므로 건너뛴다.)
function fracPolyOverlapsBox(fpts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of fpts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return maxX > 0 && minX < 1 && maxY > 0 && minY < 1;
}

/* ----- 포인터: 드래그로 올가미를 두르고, 놓으면 뚫는다 ----- */
function pathFromEvent(e, finalize) {
  const cur = worldPos(e);
  const free = _drawing.free;
  const last = free[free.length - 1];
  const stepW = MIN_STEP_PX * worldPerPx();
  if (!last || Math.hypot(cur.x - last.x, cur.y - last.y) >= stepW) free.push(cur);
  if (finalize) return simplifyRDP(free.slice(), RDP_EPS_PX * worldPerPx());
  return free.slice();
}
function onDown(e) {
  if (!isActive() || e.button !== 0 || _space) return;
  const p = worldPos(e);
  _drawing = { free: [p], path: [p] };
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
  applyErase(path);
}

/* ----- 실제 뚫기: 올가미와 겹치는 모든 이미지·svgAsset 에 poly cutout 추가 (Undo 1스텝) ----- */
function applyErase(path) {
  if (!path || path.length < 3) return;                    // 점 3개 미만 = 다각형 아님
  const minArea = Math.pow(worldPerPx() * 3, 2);
  if (polygonArea(path) <= minArea) return;                // 면적 0(에 가까움) = 무시

  const stamp = Date.now().toString(36);
  const hits = [];
  for (const o of _state.get().objects) {
    if (!isErasable(o)) continue;
    const fpts = path.map((p) => worldToFrac(o, p));
    if (!fracPolyOverlapsBox(fpts)) continue;
    hits.push({ id: o.id, cut: { id: `cut_${stamp}_${++_seq}`, type: "poly", points: fpts } });
  }
  if (!hits.length) return;

  const map = new Map(hits.map((h) => [h.id, h.cut]));
  _state.update((s) => {
    const snapshot = JSON.parse(JSON.stringify(s.objects));
    s.objects = s.objects.map((o) => {
      const cut = map.get(o.id);
      if (!cut) return o;
      const next = JSON.parse(JSON.stringify(o));
      // 기존 cutouts를 지우지 않고 이어붙인다 — 여러 번 지울 수 있어야 한다.
      next.cutouts = [...(Array.isArray(next.cutouts) ? next.cutouts : []), cut];
      return next;
    });
    s.undoStack.push(snapshot);
    s.redoStack = [];
  });
}

export function initEraseTool(state, svg) {
  _state = state; _svg = svg;
  state.subscribe((s) => syncUI(s.activeTool));
  syncUI(state.get().activeTool);
  svg.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("keydown", (e) => { if (e.code === "Space") _space = true; });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") _space = false; });
}

/* ===== Canvas brush / rectangle eraser =====
 * Shift+E and the toolbar enter ERASE. Each completed gesture adds one history
 * step and keeps the source pixels and placement. Fraction coordinates follow
 * image/SVG movement, rotation and resizing. Older polygon cuts still render.
 */

import { screenToWorld } from "./viewport.js?v=1.7.0-four-session-integration";
import { getObjectBBox } from "./pick.js?v=1.7.0-four-session-integration";
import { tightenBoxObject } from "./cut-geometry.js?v=1.7.0-four-session-integration";
import { registerEscapeLayer } from './escape-layers.js?v=1.7.0-four-session-integration';

const SVG_NS = "http://www.w3.org/2000/svg";
const ERASE_CURSOR = "crosshair";
const MIN_STEP_PX = 2;   // 화면 2px 이상 움직여야 새 자유점 기록

let _state, _svg;
let _drawing = null;     // 드래그 중: { free:[{x,y}...], path:[{x,y}...] }
let _overlay = null;     // 임시 미리보기 <g> (주황 점선 올가미 + 반투명 채움)
let _bboxLayer = null;   // 뚫을 수 있는 대상 표시 <g>
let _bboxTimer = 0;
let _space = false;
let _seq = 0;
let _controls, _mode = 'brush', _background = 'transparent', _size = 20;

function isActive() { return _state.get().activeTool === "ERASE"; }
// 구멍을 뚫을 수 있는 대상: 래스터 이미지와 내장 SVG 자산(둘 다 상자 + 마스크 구조).
function isErasable(o) { return !!o && (o.type === "image" || o.type === "svgAsset") && o.w > 0 && o.h > 0
  && !o.locked && !o.imageSelectionLocked && !(_state.get().layers || []).some(l=>l.id===o.layerId && l.visible===false); }

function syncUI(tool) {
  const on = tool === "ERASE";
  setCursor(on ? ERASE_CURSOR : "");
  if (_controls) _controls.hidden = !on;
  if (on) scheduleBBoxes();
  else { clearOverlay(); clearBBoxes(); _drawing = null; }
}

function worldPos(e) { return screenToWorld(_svg, _state.get().viewBox, e.clientX, e.clientY); }
function worldPerPx() { const m=_svg.getScreenCTM();return m ? 1/Math.hypot(m.a,m.b) : _state.get().viewBox.w / (_svg.getBoundingClientRect().width || 1); }
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
  if (!path?.length) return;
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("pointer-events", "none");
  g.dataset.ui='erase-preview';
  const shape=document.createElementNS(SVG_NS,_mode==='brush'?'path':'rect'),a=path[0],b=path.at(-1);
  if(_mode==='brush') {
    shape.setAttribute('d',`M ${a.x} ${a.y} `+(path.length===1?'l .000001 0':path.slice(1).map(p=>`L ${p.x} ${p.y}`).join(' ')));shape.setAttribute('fill','none');shape.setAttribute('stroke-width',_drawing.diameter);shape.setAttribute('stroke-linecap','round');shape.setAttribute('stroke-linejoin','round');
  } else {
    for(const[k,v]of Object.entries({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)}))shape.setAttribute(k,v);
    shape.setAttribute('fill','#e8590c');shape.setAttribute('fill-opacity','.15');shape.setAttribute('stroke-width',worldPerPx()*1.5);
  }
  shape.setAttribute('stroke','#e8590c');shape.setAttribute('stroke-opacity','.35');g.append(shape);
  _overlay = g;
  _svg.appendChild(g);
}

/* ----- 기하 유틸 (cut-geometry.js의 worldToFrac 과 같은 식) ----- */
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
  return { x: (q.x - o.x) / o.w, y: (q.y - o.y) / o.h };
}
// 분수 다각형이 객체 상자([0,1]²)와 실제로 겹치는지 — bbox 교차로 싸게 판정.
// (분수 좌표라 회전은 이미 풀려 있다. 안 겹치면 마스크에 넣어도 무의미하므로 건너뛴다.)
function fracPolyOverlapsBox(fpts, padX=0, padY=0) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of fpts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return maxX+padX > 0 && minX-padX < 1 && maxY+padY > 0 && minY-padY < 1;
}

/* ----- 포인터: 드래그로 올가미를 두르고, 놓으면 뚫는다 ----- */
function pathFromEvent(e, finalize) {
  const cur = worldPos(e);
  const free = _drawing.free;
  const last = free[free.length - 1];
  const stepW = MIN_STEP_PX * worldPerPx();
  if (free.length<4095 && (!last || Math.hypot(cur.x - last.x, cur.y - last.y) >= stepW || finalize)) free.push(cur);
  return free.slice();
}
function onDown(e) {
  if (!isActive() || e.button !== 0 || _space) return;
  const p = worldPos(e);
  _drawing = { free: [p], path: [p], diameter:_size*worldPerPx(), objects:_state.get().objects, pageId:_state.get().activePageId };
  renderOverlay(_drawing.path);
}
function onMove(e) {
  if (!_drawing) return;
  _drawing.path = pathFromEvent(e, false);
  renderOverlay(_drawing.path);
}
function onUp(e) {
  if (!_drawing) return;
  let path = _drawing.path;const diameter=_drawing.diameter;
  if (e && typeof e.clientX === "number") path = pathFromEvent(e, true);
  _drawing = null;
  clearOverlay();
  applyErase(path,diameter);
}

/* ----- One completed brush/rectangle gesture, one history step ----- */
function applyErase(path, diameter) {
  if (!path?.length) return;
  if(_mode==='rect') {
    const a=path[0],b=path.at(-1);if(Math.abs(a.x-b.x)*Math.abs(a.y-b.y)<=Math.pow(worldPerPx()*2,2))return;
    path=[{x:a.x,y:a.y},{x:b.x,y:a.y},{x:b.x,y:b.y},{x:a.x,y:b.y}];
  }

  const stamp = Date.now().toString(36);
  const hits = [];
  for (const o of _state.get().objects) {
    if (!isErasable(o)) continue;
    const fpts = path.map((p) => worldToFrac(o, p));
    const dx=diameter/o.w,dy=diameter/o.h;
    if (!fracPolyOverlapsBox(fpts,_mode==='brush'?dx/2:0,_mode==='brush'?dy/2:0)) continue;
    hits.push({ id: o.id, cut: { id: `cut_${stamp}_${++_seq}`, type: _mode==='brush'?'brush':'poly', points: fpts, background:_background,
      ...(_mode==='brush'?{diameterX:dx,diameterY:dy}:{}) } });
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

/* ----- [여백 정리] — 선택한 상자형 객체의 상자를 보이는 그림에 맞춘다 -----
 * 자르기·지우기는 이미 자동으로 좁히지만, 옛 파일이나 여러 번 손댄 객체를 위해 손으로
 * 부를 수 있는 경로를 따로 둔다. 선택이 없으면 전체를 훑는다. Undo 1스텝.
 * 바뀐 객체 수를 반환(0이면 아무것도 안 함). */
export function trimSelectedBoxMargins() {
  if (!_state) return 0;
  const s = _state.get();
  const sel = new Set(s.selectedIds || []);
  const targets = s.objects.filter((o) => isErasable(o) && (sel.size === 0 || sel.has(o.id)));
  const map = new Map();
  for (const o of targets) {
    const t = tightenBoxObject(o);
    if (t) map.set(o.id, t);
  }
  if (!map.size) return 0;
  _state.update((s2) => {
    const snapshot = JSON.parse(JSON.stringify(s2.objects));
    s2.objects = s2.objects.map((o) => map.get(o.id) || o);
    s2.undoStack.push(snapshot);
    s2.redoStack = [];
  });
  return map.size;
}

export function initEraseTool(state, svg) {
  _state = state; _svg = svg;
  _controls=document.createElement('div');_controls.className='canvas-erase-options';_controls.dataset.canvasEraseOptions='';_controls.setAttribute('data-escape-layer','');_controls.setAttribute('aria-label','캔버스 지우개 설정');
  _controls.innerHTML='<select data-canvas-erase-mode aria-label="캔버스 지우개 방식"><option value="brush">문질러 지우기</option><option value="rect">사각 영역</option></select><label>굵기 <input data-canvas-erase-size type="range" min="1" max="80" value="20" aria-label="캔버스 지우개 굵기"><output>20 px</output></label><select data-canvas-erase-background aria-label="캔버스 지운 자리 배경"><option value="transparent">투명</option><option value="white">흰색</option></select>';
  svg.closest('.canvas-wrap').append(_controls);
  registerEscapeLayer(_controls,()=>{_drawing=null;clearOverlay();state.update(s=>{s.activeTool='V';});});
  const cancel=()=>{_drawing=null;clearOverlay();};
  _controls.querySelector('[data-canvas-erase-mode]').onchange=e=>{cancel();_mode=e.target.value;_controls.querySelector('input').disabled=_mode!=='brush';};
  _controls.querySelector('[data-canvas-erase-background]').onchange=e=>{cancel();_background=e.target.value;};
  _controls.querySelector('input').oninput=e=>{cancel();_size=Number(e.target.value);_controls.querySelector('output').textContent=`${_size} px`;};
  state.subscribe((s) => {if(_drawing&&(s.objects!==_drawing.objects||s.activePageId!==_drawing.pageId))cancel();syncUI(s.activeTool);});
  syncUI(state.get().activeTool);
  svg.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("keydown", (e) => { if (e.code === "Space") _space = true; });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") _space = false; });
  window.addEventListener('blur',()=>{_space=false;cancel();});
}

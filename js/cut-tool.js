/* ===== CUT TOOL — 삽입(생성) 후 캔버스에서 객체 자르기 (가위/칼) =====
//
// activeTool === "CUT" 일 때만 동작한다. 진입 단축키 k는 tools.js에서 배선하고,
// 서브모드 1(가위)/2(칼)는 이 파일에서 처리한다. 툴바 버튼(data-tool="CUT")도 진입 경로.
//
//   · 가위: 선을 클릭 → 그 지점에서 둘로
//   · 칼:   직선 드래그 → 지나가는 객체를 교차점서 분할(닫힌 도형은 두 호로)
// 분할 수학은 cut-geometry.js(순수 함수, Node 테스트 완료). 여기선 UI·포인터·
// 스토어 교체(Undo 1스텝)만 담당. */

import { screenToWorld } from "./viewport.js?v=0.52.0";
import { cutObject, isCuttable, distanceToObject } from "./cut-geometry.js?v=0.52.0";
import { snapLineEnd } from "./geometry.js?v=0.52.0";
import { getObjectBBox } from "./pick.js?v=0.52.0";

const SVG_NS = "http://www.w3.org/2000/svg";
const MODE_HINT = {
  scissors: "가위(1): 대상에 가까이 가면 가위가 닫힙니다. 클릭하면 그 지점에서 둘로.",
  knife: "칼(2): 드래그로 직선을 긋습니다(Ctrl=각도 스냅). 닫힌 도형은 2점 통과 시 두 호로.",
};

// 커스텀 커서(정지 이미지 2상태). 액션 지점(칼끝/가윗날)을 좌상단에 두고 hotspot 고정.
// 색상은 반드시 '#111'로 둔다 — 소스에 '%23111'처럼 미리 인코딩해 두면 encodeURIComponent가
// 다시 인코딩(%2523111)해 브라우저 디코드 후 무효 색이 되어 커서 획이 안 그려진다.
function cursorCss(inner, hx, hy) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 26 26' fill='none' stroke='#111' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'>${inner}</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") ${hx} ${hy}, crosshair`;
}
const CURSOR = {
  scissorsOpen: cursorCss(`<line x1='3' y1='3' x2='15' y2='12'/><line x1='3' y1='9' x2='15' y2='15'/><circle cx='18.5' cy='11' r='2.7'/><circle cx='18.5' cy='17' r='2.7'/>`, 3, 3),
  scissorsClosed: cursorCss(`<line x1='3' y1='5' x2='15' y2='13'/><line x1='3' y1='7' x2='15' y2='14.5'/><circle cx='18.5' cy='12' r='2.7'/><circle cx='18.5' cy='16.5' r='2.7'/>`, 3, 6),
  knifeClosed: cursorCss(`<rect x='11' y='11' width='11' height='5' rx='2' transform='rotate(35 16 13)'/>`, 3, 3),
  knifeOpen: cursorCss(`<path d='M3 3 L14 11 L11 14 Z' fill='#111'/><rect x='12' y='12' width='11' height='5' rx='2' transform='rotate(35 17 14)'/>`, 3, 3),
};

let _state, _svg, _panel, _hintEl;
let _mode = "scissors";
let _drawing = null;     // 드래그 중: { pts:[{x,y}...] }
let _overlay = null;     // 임시 미리보기 SVG 요소
let _bboxLayer = null;   // 전체 오브젝트 bbox 표시 <g>
let _bboxRaf = 0;
let _space = false;
let _idc = 0;

function injectStyles() {
  if (document.getElementById("cut-tool-styles")) return;
  const st = document.createElement("style");
  st.id = "cut-tool-styles";
  st.textContent = `
    #cut-tool-panel { position:fixed; top:110px; left:50%; transform:translateX(-50%); z-index:60;
      display:flex; align-items:center; gap:8px; padding:7px 12px; background:#fff; border:1px solid #d0d7de;
      border-radius:10px; box-shadow:0 4px 14px rgba(0,0,0,.12); font-family:"IBM Plex Sans KR",sans-serif; }
    #cut-tool-panel[hidden] { display:none; }   /* [hidden]이 ID의 display:flex를 이기도록(우선순위) */
    #cut-tool-panel .cut-tool-title { font-weight:700; color:#0d1117; margin-right:2px; }
    #cut-tool-panel .cut-tab { border:1px solid #d0d7de; background:#f6f8fa; color:#0d1117; border-radius:7px;
      padding:5px 12px; cursor:pointer; font-size:14px; }
    #cut-tool-panel .cut-tab.is-active { background:#0969da; color:#fff; border-color:#0969da; }
    #cut-tool-panel #cut-tool-hint { color:#6e7781; font-size:13px; margin-left:4px; }
  `;
  document.head.appendChild(st);
}

function buildPanel() {
  injectStyles();
  _panel = document.createElement("div");
  _panel.id = "cut-tool-panel";
  _panel.hidden = true;
  _panel.innerHTML = `
    <span class="cut-tool-title">✂ 자르기</span>
    <button type="button" class="cut-tab is-active" data-cutmode="scissors">가위</button>
    <button type="button" class="cut-tab" data-cutmode="knife">칼</button>
    <span id="cut-tool-hint">${MODE_HINT.scissors}</span>`;
  document.body.appendChild(_panel);
  _hintEl = _panel.querySelector("#cut-tool-hint");
  _panel.querySelectorAll(".cut-tab").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.cutmode));
  });
}

function setMode(mode) {
  _mode = mode;
  _panel.querySelectorAll(".cut-tab").forEach((b) => b.classList.toggle("is-active", b.dataset.cutmode === mode));
  _hintEl.textContent = MODE_HINT[mode];
  clearOverlay();
  _drawing = null;
  if (isActive()) setCursor(idleCursor());
}

function isActive() { return _state.get().activeTool === "CUT"; }

function syncUI(tool) {
  const on = tool === "CUT";
  _panel.hidden = !on;
  setCursor(on ? idleCursor() : "");
  if (on) scheduleBBoxes();
  else { clearOverlay(); clearBBoxes(); _drawing = null; }
}

function worldPos(e) { return screenToWorld(_svg, _state.get().viewBox, e.clientX, e.clientY); }
function worldPerPx() { return _state.get().viewBox.w / (_svg.getBoundingClientRect().width || 1); }

/* ----- 커서(정지 2상태): 가위 열림/닫힘, 칼 닫힘/열림 ----- */
function setCursor(css) { _svg.style.cursor = css; }
function idleCursor() {
  return _mode === "knife" ? CURSOR.knifeClosed : CURSOR.scissorsOpen;
}
// 가위: 자를 수 있는 대상 근처면 닫힌 가위, 아니면 열린 가위.
function updateScissorsCursor(e) {
  const p = worldPos(e);
  const tol = 12 * worldPerPx();
  let near = false;
  for (const o of _state.get().objects) {
    if (isCuttable(o) && distanceToObject(o, p) < tol) { near = true; break; }
  }
  setCursor(near ? CURSOR.scissorsClosed : CURSOR.scissorsOpen);
}

/* ----- 전체 오브젝트 bbox 표시(자르기 도구일 때) ----- */
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

/* ----- 임시 미리보기(칼=빨간 직선) ----- */
function clearOverlay() { if (_overlay) { _overlay.remove(); _overlay = null; } }
function renderOverlay() {
  clearOverlay();
  if (!_drawing || _mode !== "knife") return;
  const pts = _drawing.pts;
  if (pts.length < 2) return;
  const sw = worldPerPx() * 1.6;
  _overlay = document.createElementNS(SVG_NS, "line");
  _overlay.setAttribute("x1", pts[0].x); _overlay.setAttribute("y1", pts[0].y);
  _overlay.setAttribute("x2", pts[1].x); _overlay.setAttribute("y2", pts[1].y);
  _overlay.setAttribute("stroke", "#e0313c");
  _overlay.setAttribute("stroke-width", sw);
  _overlay.setAttribute("stroke-dasharray", `${sw * 3} ${sw * 2}`);
  _overlay.setAttribute("fill", "none");
  _overlay.setAttribute("pointer-events", "none");
  _svg.appendChild(_overlay);
}

/* ----- 포인터: 가위=클릭 즉시, 칼=직선 드래그 ----- */
function onDown(e) {
  if (!isActive() || e.button !== 0 || _space) return;
  const p = worldPos(e);
  if (_mode === "scissors") { applyCut({ mode: "scissors", point: p }); return; }
  setCursor(CURSOR.knifeOpen);   // 칼: 칼날 나옴
  _drawing = { pts: [p, p] };
  renderOverlay();
}
function onMove(e) {
  if (_drawing) {                                 // 칼 드래그만 _drawing을 만든다
    let p = worldPos(e);
    if (e.ctrlKey) p = snapLineEnd(_drawing.pts[0], p, true);
    _drawing.pts[1] = p;
    renderOverlay();
    return;
  }
  if (isActive() && _mode === "scissors") updateScissorsCursor(e); // 근접에 따라 가위 열림/닫힘
}
function onUp(e) {
  if (!_drawing) return;
  if (e && typeof e.clientX === "number") {       // 마우스업 위치를 최종점으로 반영
    let p = worldPos(e);
    if (e.ctrlKey) p = snapLineEnd(_drawing.pts[0], p, true);
    _drawing.pts[1] = p;
  }
  const pts = _drawing.pts; _drawing = null; clearOverlay();
  if (isActive()) setCursor(idleCursor());        // 칼날 닫힘 복귀
  if (pts.length >= 2) applyCut({ mode: "knife", a: pts[0], b: pts[1] });
}

/* ----- 실제 자르기: 대상 판정 → 조각으로 교체 (Undo 1스텝) ----- */
function applyCut(geom) {
  const objs = _state.get().objects;
  const results = [];
  if (geom.mode === "scissors") {
    const tol = 12 * worldPerPx();
    let target = null, bestD = tol;
    for (const o of objs) {
      if (!isCuttable(o)) continue;
      const d = distanceToObject(o, geom.point);
      if (d < bestD) { bestD = d; target = o; }
    }
    if (!target) return;
    const pieces = cutObject(target, "scissors", geom);
    if (pieces && pieces.length) results.push({ id: target.id, pieces });
  } else {
    for (const o of objs) {
      if (!isCuttable(o)) continue;
      const pieces = cutObject(o, geom.mode, geom);
      if (pieces && pieces.length) results.push({ id: o.id, pieces });
    }
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
  buildPanel();
  state.subscribe((s) => syncUI(s.activeTool));
  syncUI(state.get().activeTool);
  svg.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") _space = true;
    // 서브모드 단축키: 자르기 도구가 켜져 있을 때만 1=가위, 2=칼 (도구 진입 k는 tools.js).
    if (e.ctrlKey || e.metaKey || e.altKey || !isActive()) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.key === "1") setMode("scissors");
    else if (e.key === "2") setMode("knife");
  });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") _space = false; });
}

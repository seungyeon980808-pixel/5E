/* ===== CUT TOOL — 삽입(생성) 후 캔버스에서 객체 자르기 (가위 하나) =====
//
// activeTool === "CUT" 또는 "DELAYED_CUT" 일 때 동작한다.
// CUT은 기존처럼 마우스를 놓는 순간 자르고, DELAYED_CUT은 자르기 선을 오브젝트로
// 남겨 편집한 뒤 확정한다. 두 도구 모두 하단의 모드 탭(자유곡선·직선·꺾은선·사각형)으로
// 입력 방식을 선택한다.
//
//   · 자유롭게 그은 경로가 지나가는 객체를 교차점에서 분할한다(획=조각, 채운 영역=채운 두 조각).
//   · 모드 전환은 탭으로 하고, 각 모드의 Shift/Ctrl은 기존 도구의 규칙을 따른다.
//   · 커서는 크로스헤어. 실제로 잘리는 지점(교차점)을 드래그 중 빨간 점으로 표시.
// 분할 수학은 cut-geometry.js(순수 함수, Node 테스트 완료). 여기선 UI·포인터·
// 스토어 교체(Undo 1스텝)만 담당. */

import { screenToWorld, getRenderScale } from "./viewport.js?v=1.4.0";
import { cutObject, isCuttable, cutCrossingPoints, isBoxCuttable, cutBoxObject } from "./cut-geometry.js?v=1.4.0";
import { snapAngle } from "./geometry.js?v=1.4.0";
import { simplifyRDP } from "./geometry.js?v=1.4.0";
import { getObjectBBox } from "./pick.js?v=1.4.0";
import { resolveEndpointSnap } from "./snap.js?v=1.4.0";
import { setSnapPreview } from "./render.js?v=1.4.0";

import { snapKey } from "./platform.js?v=1.4.0";
const SVG_NS = "http://www.w3.org/2000/svg";
const CUT_CURSOR = "crosshair";
const MIN_STEP_PX = 2;   // 화면 2px 이상 움직여야 새 자유점 기록
const RDP_EPS_PX = 1.5;  // 자유경로 단순화 허용오차(화면 px)
const DELAYED_HIT_PX = 10;

let _state, _svg;
let _drawing = null;     // 드래그 중: { start:{x,y}, free:[{x,y}...], path:[{x,y}...] }
let _overlay = null;     // 임시 미리보기 <g> (빨간 경로 + 교차점 점)
let _bboxLayer = null;   // 전체 오브젝트 bbox 표시 <g>
let _bboxRaf = 0;
let _space = false;
let _idc = 0;

export function preferredCutSelectionIds(pieces) {
  const all = (pieces || []).map((piece) => piece?.id).filter(Boolean);
  const extracted = (pieces || [])
    .filter((piece) => (piece?.cutouts || []).some((cut) => cut?.type === "outside-poly"))
    .map((piece) => piece.id)
    .filter(Boolean);
  return extracted.length ? extracted : all;
}
let _pendingCuts = [];
let _pendingSeq = 0;
let _delayedDraft = null;  // { start, current, free[] }
let _delayedEdit = null;
let _delayedLayer = null;
let _delayedAction = null;
let _modeTabs = null;
let _cutMode = "freehand";       // CUT: freehand | line | polyline | rect
let _delayedMode = "freehand";   // DELAYED_CUT: freehand | line | polyline | rect
let _suppressNextClick = false;

/* 하단 안내 패널은 공용 tool-hint.js가 전담한다(자르기 포함 전 도구 공통 슬롯). */

function isActive() { return _state.get().activeTool === "CUT"; }
function isDelayedActive() { return _state.get().activeTool === "DELAYED_CUT"; }
function activeMode() { return isDelayedActive() ? _delayedMode : _cutMode; }

function syncUI(tool) {
  const on = tool === "CUT" || tool === "DELAYED_CUT";
  setCursor(on ? CUT_CURSOR : "");
  if (on) scheduleBBoxes();
  else { clearOverlay(); clearBBoxes(); _drawing = null; }
  if (!isDelayedActive()) { _delayedDraft = null; _delayedEdit = null; }
  renderDelayedCuts();
  updateDelayedAction();
  if (tool === "DELAYED_CUT") setDelayedMode(_delayedMode);
  else if (tool === "CUT") setCutMode(_cutMode);
}

function worldPos(e) { return screenToWorld(_svg, _state.get().viewBox, e.clientX, e.clientY); }
function worldPerPx() { return _state.get().viewBox.w / (_svg.getBoundingClientRect().width || 1); }
function setCursor(css) { _svg.style.cursor = css; }

const CUT_MODES = [
  ["freehand", "자유곡선"], ["line", "직선"], ["polyline", "꺾은선"], ["rect", "사각형"],
];
function modeForActiveTool() { return isDelayedActive() ? _delayedMode : _cutMode; }
function setMode(mode) {
  if (!CUT_MODES.some(([value]) => value === mode)) return;
  if (isDelayedActive()) setDelayedMode(mode); else if (isActive()) setCutMode(mode);
}
function syncModeTabs() {
  if (!_modeTabs) return;
  const visible = isActive() || isDelayedActive();
  _modeTabs.hidden = !visible;
  const mode = modeForActiveTool();
  _modeTabs.querySelectorAll("[data-cut-mode]").forEach((b) => {
    const on = b.dataset.cutMode === mode;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-selected", String(on));
  });
}
function ensureModeTabs() {
  if (_modeTabs?.isConnected) return;
  const panel = document.getElementById("panel-right");
  if (!panel) return;
  _modeTabs = document.createElement("div");
  _modeTabs.id = "cut-mode-tabs";
  _modeTabs.setAttribute("role", "tablist");
  const title = document.createElement("div");
  title.className = "cut-mode-tabs-title";
  title.textContent = "자르기 모드";
  _modeTabs.appendChild(title);
  for (const [value, label] of CUT_MODES) {
    const b = document.createElement("button");
    b.type = "button"; b.role = "tab"; b.dataset.cutMode = value; b.textContent = label;
    b.addEventListener("click", () => setMode(value));
    _modeTabs.appendChild(b);
  }
  panel.prepend(_modeTabs);
  syncModeTabs();
}

/* ----- 전체 오브젝트 bbox 표시(자르기 도구일 때: 파랑=자를 수 있음) ----- */
function clearBBoxes() { if (_bboxLayer) { _bboxLayer.remove(); _bboxLayer = null; } }
function drawBBoxes() {
  clearBBoxes();
  if (!isActive() && !isDelayedActive()) return;
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
    r.setAttribute("stroke", (isCuttable(o) || isBoxCuttable(o)) ? "#0969da" : "#adb5bd");
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

/* ----- 지연 자르기: 임시 절단선 ----------------------------------------- */
function delayedObject(cut) {
  return _state.get().objects.find((o) => o.id === cut.objectId) || null;
}
function delayedPath(cut) {
  const o = delayedObject(cut);
  if (o?.type === "line") return [o.p1, o.p2];
  if (o?.points?.length >= 2) return o.points.map((p) => ({ x: p.x, y: p.y }));
  return cut.path || [cut.p1, cut.p2].filter(Boolean);
}
function pathDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function delayedStatus(path, source = _state.get().objects) {
  for (const o of source) {
    // 지연 자르기 가이드 자체는 절단 대상이 아니므로 유효성 판정에서 제외합니다.
    if (o.delayedCut) continue;
    if (!isCuttable(o) && !isBoxCuttable(o)) continue;
    try { if (cutCrossingPoints(o, path).length === 2) return "valid"; } catch (_) { /* ignore */ }
  }
  return "empty";
}
function delayedHit(p) {
  const tol = DELAYED_HIT_PX * worldPerPx();
  let best = null;
  for (const cut of _pendingCuts) {
    const path = delayedPath(cut);
    let d = Infinity;
    for (let i = 1; i < path.length; i++) d = Math.min(d, pathDistance(p, path[i - 1], path[i]));
    if (d <= tol && (!best || d < best.d)) best = { cut, d };
  }
  return best && best.cut;
}
function clearDelayedLayer() {
  if (_delayedLayer) { _delayedLayer.remove(); _delayedLayer = null; }
}
function renderDelayedCuts() {
  clearDelayedLayer();
  if (!_svg || (!_pendingCuts.length && !_delayedDraft)) return;
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("pointer-events", "none");
  const sw = worldPerPx() * 1.6;
  const draw = (path, status, selected = false, draft = false) => {
    const line = document.createElementNS(SVG_NS, "polyline");
    line.setAttribute("points", path.map((p) => `${p.x},${p.y}`).join(" "));
    line.setAttribute("stroke", draft ? "#8b5cf6" : (status === "valid" ? "#e0313c" : "#8c959f"));
    line.setAttribute("stroke-width", selected ? sw * 1.7 : sw);
    line.setAttribute("stroke-dasharray", draft ? `${sw * 2} ${sw * 2}` : `${sw * 4} ${sw * 2}`);
    // SVG polyline은 열린 경로라도 기본 fill이 적용되면 시작점과 끝점을
    // 암묵적으로 연결해 면을 채운다. 지연 자르기는 오직 절단선만 보여야 한다.
    line.setAttribute("fill", "none");
    line.setAttribute("stroke-linecap", "round");
    g.appendChild(line);
    if (selected) {
      for (const p of [path[0], path[path.length - 1]]) {
        const c = document.createElementNS(SVG_NS, "circle");
        c.setAttribute("cx", p.x); c.setAttribute("cy", p.y); c.setAttribute("r", sw * 3.2);
        c.setAttribute("fill", "#fff"); c.setAttribute("stroke", "#0969da"); c.setAttribute("stroke-width", sw);
        g.appendChild(c);
      }
    }
  };
  for (const cut of _pendingCuts) draw(delayedPath(cut), delayedStatus(delayedPath(cut), _state.get().objects), cut.id === _delayedEdit?.id);
  if (_delayedDraft) draw(delayedDraftPath(), "empty", false, true);
  _delayedLayer = g;
  _svg.appendChild(g);
}
function ensureDelayedAction() {
  if (_delayedAction && _delayedAction.isConnected) return;
  const panel = document.getElementById("panel-right");
  if (!panel) return;
  const box = document.createElement("div");
  box.id = "delayed-cut-action";
  box.innerHTML = `<div class="delayed-cut-action-title">지연 자르기</div><div class="delayed-cut-action-mode"></div><div class="delayed-cut-action-status"></div><button type="button" class="delayed-cut-confirm">자르기 확정</button><button type="button" class="delayed-cut-cancel">전체 취소</button>`;
  // 인스펙터 하단에 묻히지 않도록 항상 속성 영역보다 먼저 배치합니다.
  panel.prepend(box);
  box.querySelector(".delayed-cut-confirm").addEventListener("click", applyDelayedCuts);
  box.querySelector(".delayed-cut-cancel").addEventListener("click", cancelDelayedCuts);
  _delayedAction = box;
}
function updateDelayedAction() {
  ensureDelayedAction();
  if (!_delayedAction) return;
  const has = _pendingCuts.length > 0;
  _delayedAction.hidden = !has;
  if (!has) {
    if (isDelayedActive()) {
      _delayedAction.hidden = false;
       _delayedAction.querySelector(".delayed-cut-action-mode").textContent = delayedModeLabel();
       _delayedAction.querySelector(".delayed-cut-action-status").textContent = "선을 그린 뒤 Enter로 선을 확정하고, 오른쪽 버튼으로 적용합니다";
      const btn = _delayedAction.querySelector(".delayed-cut-confirm");
      btn.textContent = "자르기 확정 (0)";
      btn.disabled = true;
    }
    return;
  }
  const valid = _pendingCuts.filter((c) => delayedStatus(delayedPath(c)) === "valid").length;
  _delayedAction.querySelector(".delayed-cut-action-mode").textContent = delayedModeLabel();
  _delayedAction.querySelector(".delayed-cut-action-status").textContent = valid
    ? `대기 선 ${_pendingCuts.length}개 · ${valid}개 적용 가능`
    : "자를 수 있는 오브젝트를 통과하는 선이 없습니다";
  const btn = _delayedAction.querySelector(".delayed-cut-confirm");
  btn.textContent = `자르기 확정 (${valid})`;
  btn.disabled = valid === 0;
}
function applyDelayedCuts() {
  if (!_pendingCuts.length) return;
  const pendingIds = new Set(_pendingCuts.map((c) => c.objectId));
  let working = JSON.parse(JSON.stringify(_state.get().objects)).filter((o) => !pendingIds.has(o.id));
  const applied = new Set();
  const addedIds = [];
  const stamp = Date.now().toString(36);
  for (const cut of _pendingCuts) {
    const path = delayedPath(cut);
    const out = [];
    let changed = false;
    for (const o of working) {
      const boxy = isBoxCuttable(o);
      if (!isCuttable(o) && !boxy) { out.push(o); continue; }
      const pieces = boxy ? cutBoxObject(o, path) : cutObject(o, "freehand", { path });
      if (!pieces || !pieces.length) { out.push(o); continue; }
      changed = true;
      for (const piece of pieces) {
        piece.id = `obj_${stamp}_delayed${++_idc}`;
        piece.layerId = o.layerId; piece.order = o.order;
        out.push(piece); addedIds.push(piece.id);
      }
    }
    if (changed) { working = out; applied.add(cut.id); }
  }
  if (!applied.size) return;
  const remaining = _pendingCuts.filter((c) => !applied.has(c.id));
  const original = _state.get().objects;
  const remainingIds = new Set(remaining.map((c) => c.objectId));
  working.push(...JSON.parse(JSON.stringify(original)).filter((o) => remainingIds.has(o.id)));
  _state.update((s) => {
    s.undoStack.push(JSON.parse(JSON.stringify(s.objects)));
    s.redoStack = [];
    s.objects = working;
    s.selectedIds = addedIds;
    s.targetedId = null;
  });
  _pendingCuts = remaining;
  _delayedEdit = null;
  renderDelayedCuts(); updateDelayedAction();
}

function cancelDelayedCuts() {
  const ids = new Set(_pendingCuts.map((c) => c.objectId));
  _state.update((s) => { s.objects = s.objects.filter((o) => !ids.has(o.id)); s.selectedIds = []; });
  _pendingCuts = []; _delayedEdit = null; _delayedDraft = null;
  renderDelayedCuts(); updateDelayedAction();
}

function modeLabel(mode, delayed = false) {
  return mode === "polyline" ? `꺾은선 모드 · Ctrl=각도 스냅 · Enter=${delayed ? "선 확정" : "자르기"}` :
    mode === "line" ? "직선 모드 · Ctrl=각도 스냅 · Shift=끝점 스냅" :
    mode === "rect" ? "사각형 모드 · Shift=정사각형" :
    "자유곡선 모드";
}
function delayedModeLabel() { return modeLabel(_delayedMode, true); }
function publishMode(mode, delayed) {
  const modeName = mode === "polyline" ? "꺾은선" : mode === "line" ? "직선" : mode === "rect" ? "사각형" : "자유곡선";
  const action = mode === "polyline"
    ? (delayed ? "꼭짓점 클릭 → Enter로 선 생성" : "꼭짓점 클릭 → Enter로 자르기")
    : mode === "line"
      ? (delayed ? "시작점·끝점 클릭 → 선 생성" : "시작점·끝점 클릭 → 즉시 자르기")
      : mode === "rect"
        ? (delayed ? "사각형 드래그 → 선 생성" : "사각형 드래그 → 네 변으로 자르기")
        : (delayed ? "경로 드래그 → 선 생성" : "경로 드래그 → 즉시 자르기");
  const keys = mode === "polyline"
    ? `Enter/더블클릭: ${delayed ? "선 완성" : "자르기"} · Shift: 직선 · Esc: 취소`
    : mode === "line"
      ? "Ctrl: 각도 스냅 · Shift: 끝점 스냅 · Esc: 취소"
      : mode === "rect"
        ? "Shift: 정사각형 · Esc: 취소"
        : "Esc: 취소";
  window.dispatchEvent(new CustomEvent("5e:tool-mode-hint", { detail: {
    title: `${delayed ? "✂◷ 지연 자르기" : "✂ 자르기"} · ${modeName}`,
    action,
    keys,
    activeKeys: mode === "polyline" ? ["Enter/더블클릭", "Shift"] : mode === "line" ? ["Ctrl", "Shift"] : mode === "rect" ? ["Shift"] : [],
  }}));
}
function setDelayedMode(mode) {
  if (_delayedMode !== mode) { _delayedDraft = null; _delayedEdit = null; }
  _delayedMode = mode;
  publishMode(_delayedMode, true);
  renderDelayedCuts(); updateDelayedAction(); syncModeTabs();
}
function setCutMode(mode) {
  if (_cutMode !== mode) { _drawing = null; clearOverlay(); }
  _cutMode = mode;
  publishMode(_cutMode, false);
  renderOverlay(_drawing?.path || []); syncModeTabs();
}
function delayedDraftPath() { return delayedDraftPathFor(false); }
function rectanglePath(start, current, square = false) {
  let end = current || start;
  if (square) {
    const dx = end.x - start.x, dy = end.y - start.y;
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    end = { x: start.x + (dx < 0 ? -size : size), y: start.y + (dy < 0 ? -size : size) };
  }
  const x1 = Math.min(start.x, end.x), x2 = Math.max(start.x, end.x);
  const y1 = Math.min(start.y, end.y), y2 = Math.max(start.y, end.y);
  return [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }, { x: x1, y: y1 }];
}
function delayedDraftPathFor(finalize = false) {
  if (!_delayedDraft) return [];
  if (_delayedDraft.kind === "line") return [_delayedDraft.points[0], _delayedDraft.current || _delayedDraft.points[0]];
  if (_delayedDraft.kind === "rect") return rectanglePath(_delayedDraft.start, _delayedDraft.current, _delayedDraft.square);
  if (_delayedDraft.kind === "polyline") {
    const points = (_delayedDraft.points || []).map((p) => ({ ...p }));
    if (!finalize && _delayedDraft.current && points.length &&
        Math.hypot(_delayedDraft.current.x - points[points.length - 1].x, _delayedDraft.current.y - points[points.length - 1].y) > worldPerPx()) {
      points.push({ ..._delayedDraft.current });
    }
    return points;
  }
  return _delayedDraft.free?.length > 1 ? _delayedDraft.free : [_delayedDraft.start, _delayedDraft.current];
}
function commitDelayedDraft() {
  const path = delayedDraftPathFor(true);
  const length = path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - path[i].x, p.y - path[i].y), 0);
  if (path.length < 2 || length < worldPerPx() * 3) { _delayedDraft = null; renderDelayedCuts(); return; }
  const obj = _delayedDraft.kind === "line"
    ? { type: "line", p1: { ...path[0] }, p2: { ...path[path.length - 1] } }
    : _delayedDraft.kind === "polyline"
      ? { type: "polyline", points: path.map((p) => ({ ...p })), closed: false }
      : _delayedDraft.kind === "rect"
        ? { type: "polyline", points: path.map((p) => ({ ...p })), closed: true }
      // 자유곡선은 일반 자르기와 같은 매끄러운 curve 객체로 저장합니다.
      : { type: "curve", points: path.map((p) => ({ ...p })), closed: false };
  Object.assign(obj, { id: `obj_${Date.now().toString(36)}_delayed${++_idc}`, rotation: 0, strokeLevel: 0, strokeWidth: 0.35, fillNone: true, dashLength: 0, dashGap: 0, arrowHead: "none", locked: false, positionLocked: false, delayedCut: true, layerId: _state.get().activeLayerId, order: _state.get().objects.length });
  _state.update((s) => { s.undoStack.push(JSON.parse(JSON.stringify(s.objects))); s.redoStack = []; s.objects.push(obj); s.selectedIds = [obj.id]; s.targetedId = null; });
  _pendingCuts.push({ id: `delayed-cut-${++_pendingSeq}`, objectId: obj.id });
  _delayedDraft = null; renderDelayedCuts(); updateDelayedAction();
}

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
    if (!isCuttable(o) && !isBoxCuttable(o)) continue;
    let crossings = [];
    try { crossings = cutCrossingPoints(o, path); } catch (_) { crossings = []; }
    // cutFreehand(cut-geometry.js)는 교차점이 정확히 2개(관통)일 때만 실제로 자른다.
    // 2개가 아니면 여기서 점을 찍어도 실제로는 안 잘리므로, 회색으로 표시해
    // "표시는 되지만 이 상태로는 적용되지 않음"을 시각적으로 구분한다.
    const willCut = crossings.length === 2;
    for (const pt of crossings) {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", pt.x); c.setAttribute("cy", pt.y); c.setAttribute("r", dotR);
      c.setAttribute("fill", willCut ? "#e0313c" : "#adb5bd");
      c.setAttribute("stroke", "#fff");
      c.setAttribute("stroke-width", worldPerPx() * 0.8);
      g.appendChild(c);
    }
  }
  _overlay = g;
  _svg.appendChild(g);
}

function modifierPoint(start, current, e) {
  if (e.shiftKey) {
    const snap = resolveEndpointSnap(current, [], getRenderScale(), _state);
    setSnapPreview(snap ? snap.preview : null);
    return snap && snap.attach ? { x: snap.target.x, y: snap.target.y } : current;
  }
  setSnapPreview(null);
  return e.ctrlKey ? snapAngle(start, current) : current;
}
function pointForMode(start, current, e, mode) {
  if (mode === "line") return modifierPoint(start, current, e);
  setSnapPreview(null);
  return e.ctrlKey ? snapAngle(start, current) : current;
}
/* ----- 그은 경로 계산: 자유곡선은 자유 입력, 직선은 기존 직선의 보정 규칙 ----- */
function pathFromEvent(e, finalize) {
  const cur = worldPos(e);
  if (_cutMode === "line") {
    const end = modifierPoint(_drawing.start, cur, e);
    const free = _drawing.free;
    if (free.length) free[free.length - 1] = end; else free.push(end);
    return [_drawing.start, end];
  }
  const free = _drawing.free;
  const last = free[free.length - 1];
  const stepW = MIN_STEP_PX * worldPerPx();
  if (!last || Math.hypot(cur.x - last.x, cur.y - last.y) >= stepW) free.push(cur);
  if (finalize) return simplifyRDP(free.slice(), RDP_EPS_PX * worldPerPx());
  return free.slice();
}

/* ----- 포인터: 기존 자유곡선(F)·직선(L)·꺾은선(P)의 입력 규칙을 그대로 사용 ----- */
function onDown(e) {
  if (e.button !== 0 || _space) return;
  const p = worldPos(e);
  if (isDelayedActive()) {
    const hit = delayedHit(p);
    if (hit) {
      const hitObj = delayedObject(hit);
      _suppressNextClick = true;
      _delayedEdit = { id: hit.id, start: p,
        p1: hitObj?.p1 ? { ...hitObj.p1 } : null,
        p2: hitObj?.p2 ? { ...hitObj.p2 } : null,
        points: hitObj?.points ? hitObj.points.map((q) => ({ ...q })) : [] };
      return;
    }
    if (_delayedMode === "freehand") _delayedDraft = { kind: "freehand", start: p, current: p, free: [p], dragged: false };
    else if (_delayedMode === "rect") _delayedDraft = { kind: "rect", start: p, current: p, square: e.shiftKey, dragged: false };
    return;
  }
  if (!isActive()) return;
  if (_cutMode === "freehand") _drawing = { kind: "freehand", start: p, free: [p], path: [p], dragged: false };
  else if (_cutMode === "rect") _drawing = { kind: "rect", start: p, current: p, path: [p], square: e.shiftKey, dragged: false };
}

function onMove(e) {
  const p = worldPos(e);
  if (_delayedEdit) {
    const dx = p.x - _delayedEdit.start.x, dy = p.y - _delayedEdit.start.y;
    const cut = _pendingCuts.find((c) => c.id === _delayedEdit.id);
    const obj = cut && delayedObject(cut);
    if (obj) {
      if (obj.type === "line") { obj.p1 = { x: _delayedEdit.p1.x + dx, y: _delayedEdit.p1.y + dy }; obj.p2 = { x: _delayedEdit.p2.x + dx, y: _delayedEdit.p2.y + dy }; }
      else obj.points = _delayedEdit.points.map((q) => ({ x: q.x + dx, y: q.y + dy }));
      _state.update(() => {});
    }
    renderDelayedCuts(); updateDelayedAction();
    return;
  }
  if (isDelayedActive() && _delayedDraft) {
    if (_delayedDraft.kind === "rect") {
      _delayedDraft.current = p;
      _delayedDraft.square = e.shiftKey;
      if (Math.hypot(p.x - _delayedDraft.start.x, p.y - _delayedDraft.start.y) >= worldPerPx() * 3) _delayedDraft.dragged = true;
    } else if (_delayedDraft.kind === "line" || _delayedDraft.kind === "polyline") {
      _delayedDraft.current = pointForMode(_delayedDraft.points[_delayedDraft.points.length - 1], p, e, _delayedDraft.kind);
    } else {
      _delayedDraft.current = p;
    }
    if (_delayedDraft.kind === "freehand") {
      const last = _delayedDraft.free[_delayedDraft.free.length - 1];
      if (Math.hypot(p.x - _delayedDraft.start.x, p.y - _delayedDraft.start.y) >= worldPerPx() * 3) _delayedDraft.dragged = true;
      if (Math.hypot(p.x - last.x, p.y - last.y) >= worldPerPx() * 1.5) _delayedDraft.free.push(p);
    }
    renderDelayedCuts();
    return;
  }
  if (isActive() && _drawing) {
    if (_drawing.kind === "freehand") {
      if (Math.hypot(p.x - _drawing.start.x, p.y - _drawing.start.y) >= worldPerPx() * 3) _drawing.dragged = true;
      _drawing.path = pathFromEvent(e, false);
    } else if (_drawing.kind === "rect") {
      _drawing.current = p; _drawing.square = e.shiftKey;
      if (Math.hypot(p.x - _drawing.start.x, p.y - _drawing.start.y) >= worldPerPx() * 3) _drawing.dragged = true;
      _drawing.path = rectanglePath(_drawing.start, p, _drawing.square);
    } else {
      _drawing.current = p;
      _drawing.path = [..._drawing.points, pointForMode(_drawing.points[_drawing.points.length - 1], p, e, _drawing.kind)];
    }
    renderOverlay(_drawing.path);
  }
}

function onUp(e) {
  if (_delayedEdit) {
    _delayedEdit = null; renderDelayedCuts(); updateDelayedAction();
    // mouseup 직후 브라우저가 발생시키는 click만 막고, 다음 정상 클릭은 살립니다.
    setTimeout(() => { _suppressNextClick = false; }, 0);
    return;
  }
  if (isDelayedActive() && _delayedDraft?.kind === "freehand") {
    if (!_delayedDraft.dragged) { _delayedDraft = null; renderDelayedCuts(); return; }
    commitDelayedDraft();
    return;
  }
  if (isDelayedActive() && _delayedDraft?.kind === "rect") {
    if (!_delayedDraft.dragged) { _delayedDraft = null; renderDelayedCuts(); return; }
    commitDelayedDraft(); return;
  }
  if (!isActive() || !_drawing) return;
  if (_drawing.kind === "rect") {
    if (!_drawing.dragged) { _drawing = null; clearOverlay(); return; }
    const path = rectanglePath(_drawing.start, worldPos(e), _drawing.square);
    _drawing = null; clearOverlay(); applyCut(path); return;
  }
  if (_drawing.kind !== "freehand") return;
  if (!_drawing.dragged) { _drawing = null; clearOverlay(); return; }
  const path = e && typeof e.clientX === "number" ? pathFromEvent(e, true) : _drawing.path;
  _drawing = null; clearOverlay();
  if (path?.length >= 2) applyCut(path);
}

function onClick(e) {
  if (e.button !== 0 || _space) return;
  if (_suppressNextClick) { _suppressNextClick = false; return; }
  const p = worldPos(e);
  if (isActive() && (_cutMode === "line" || _cutMode === "polyline")) {
    const previous = _drawing?.points?.[_drawing.points.length - 1] || p;
    const point = pointForMode(previous, p, e, _cutMode);
    if (!_drawing || _drawing.kind !== _cutMode) _drawing = { kind: _cutMode, points: [point], current: point, path: [point] };
    else _drawing.points.push(point);
    _drawing.current = point;
    _drawing.path = _drawing.points.slice();
    if (_cutMode === "line" && _drawing.points.length === 2) {
      const path = _drawing.points.slice(); _drawing = null; clearOverlay(); applyCut(path); return;
    }
    renderOverlay(_drawing.path); return;
  }
  if (isDelayedActive() && (_delayedMode === "line" || _delayedMode === "polyline")) {
    const previous = _delayedDraft?.points?.[_delayedDraft.points.length - 1] || p;
    const point = pointForMode(previous, p, e, _delayedMode);
    if (!_delayedDraft || _delayedDraft.kind !== _delayedMode) _delayedDraft = { kind: _delayedMode, points: [point], current: point };
    else _delayedDraft.points.push(point);
    _delayedDraft.current = point;
    if (_delayedMode === "line" && _delayedDraft.points.length === 2) { commitDelayedDraft(); return; }
    renderDelayedCuts();
  }
}

/* ----- 실제 자르기: 경로가 지나가는 모든 대상 → 조각으로 교체 (Undo 1스텝) ----- */
function applyCut(path) {
  const objs = _state.get().objects;
  const results = [];
  for (const o of objs) {
    const boxy = isBoxCuttable(o);
    if (!isCuttable(o) && !boxy) continue;
    // 상자형(이미지·svgAsset)은 점 배열이 아니라 마스크로 반쪽을 지운 복제 둘로 나뉜다.
    const pieces = boxy ? cutBoxObject(o, path) : cutObject(o, "freehand", { path });
    if (pieces && pieces.length) results.push({ id: o.id, pieces });
  }
  if (!results.length) return;

  const stamp = Date.now().toString(36);
  _state.update((s) => {
    const snapshot = JSON.parse(JSON.stringify(s.objects));
    const map = new Map(results.map((r) => [r.id, r.pieces]));
    const out = [];
    const addedPieces = [];
    for (const o of s.objects) {
      const pieces = map.get(o.id);
      if (!pieces) { out.push(o); continue; }
      for (const piece of pieces) {
        piece.id = `obj_${stamp}_cut${++_idc}`;
        piece.layerId = o.layerId;
        piece.order = o.order;
        out.push(piece);
        addedPieces.push(piece);
      }
    }
    s.objects = out;
    s.undoStack.push(snapshot);
    s.redoStack = [];
    s.selectedIds = preferredCutSelectionIds(addedPieces);
    s.targetedId = null;
  });
}

export function initCutTool(svg, state) {
  _state = state; _svg = svg;
  ensureDelayedAction();
  ensureModeTabs();
  state.subscribe((s) => { syncUI(s.activeTool); renderDelayedCuts(); updateDelayedAction(); syncModeTabs(); });
  syncUI(state.get().activeTool);
  svg.addEventListener("mousedown", onDown);
  // 기존 직선(L)·꺾은선(P)과 같은 click-to-click 입력 경로입니다.
  svg.addEventListener("click", onClick);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  // 기본 꺾은선 도구와 동일하게 더블클릭도 완성 동작으로 지원합니다.
  svg.addEventListener("dblclick", () => {
    if (isActive() && _cutMode === "polyline" && _drawing) {
      if (_drawing.points?.length > 1) _drawing.points.pop();
      const path = simplifyRDP((_drawing.points || []).slice(), RDP_EPS_PX * worldPerPx());
      _drawing = null; clearOverlay();
      if (path.length >= 2) applyCut(path);
    } else if (isDelayedActive() && _delayedMode === "polyline" && _delayedDraft) {
      if (_delayedDraft.points?.length > 1) _delayedDraft.points.pop();
      commitDelayedDraft();
    }
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") _space = true;
    if ((!isActive() && !isDelayedActive()) || e.repeat) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (isDelayedActive()) { _delayedDraft = null; _delayedEdit = null; renderDelayedCuts(); updateDelayedAction(); }
      else { _drawing = null; clearOverlay(); }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (isDelayedActive()) {
        if (_delayedDraft) commitDelayedDraft();
      } else if (_cutMode === "polyline" && _drawing) {
        const path = simplifyRDP((_drawing.points || []).slice(), RDP_EPS_PX * worldPerPx());
        _drawing = null;
        clearOverlay();
        if (path.length >= 2) applyCut(path);
      }
    }
  });
  window.addEventListener("keyup", (e) => { if (e.code === "Space") _space = false; });
}

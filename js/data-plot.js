/* ===== DATA-PLOT(데이터 자료변환): 실험 데이터 표 → 좌표평면 산점도(점 + 연결선) =====
 *
 * 모달의 엑셀식 그리드에 조작변인·종속변인 값을 입력(또는 엑셀/시트에서 복사·붙여넣기)하면,
 * 데이터 범위에 맞춰 축 눈금을 자동 설정한 좌표평면 위에 측정점(점 객체)과 선택적
 * 연결선(꺾은선)을 만든다. 조작변인/종속변인의 이름을 축 라벨로 지정할 수 있고, 만들기
 * 전에 실시간 미리보기로 결과를 확인한다.
 *
 * 설계 결정(기획 방침): 새 객체 타입을 만들지 않는다. coords.js의 수학→월드 mm 매핑을
 * 재사용해 표준 점 객체(type "optics", kind "node")들 + polyline 하나를 생성하므로
 * render/pick/transform/저장이 전부 무수정으로 동작한다.
 *
 * 좌표평면: 이미 선택돼 있으면 그 위에, 없으면 데이터 범위에 맞춰 새 평면을 자동 생성한다.
 * 미리보기는 실제 렌더러(renderCoordplane)를 그대로 재사용하므로 결과와 100% 일치한다.
 *
 * ※ 공유 모듈(state/coords/defaults/id/render)은 반드시 앱과 동일한 ?v= 쿼리로 import해야
 *   싱글턴이 유지된다(state가 갈리면 캔버스와 상태가 어긋난다).
 */

import { state } from "./state.js?v=0.55.0";
import { worldFromMath } from "./function-graph/coords.js?v=0.55.0";
import { makeDefaultCoordplane } from "./function-graph/defaults.js?v=0.55.0";
import { nextObjectId } from "./tools/id.js?v=0.55.0";
import { renderCoordplane } from "./render/coordplane.js?v=0.55.0";
import { SVG_NS } from "./render/core.js?v=0.55.0";

// 점 객체 기본 크기(bbox mm) — node-placement.js의 NODE_DEFAULT_SIZE와 일치.
const NODE_SIZE = 2.27;
// 미리보기·삽입에서 점을 그릴 반지름(mm) — optics-apparatus.js node 렌더(min(w,h)*0.22)와 일치.
const NODE_DOT_R = NODE_SIZE * 0.22;

/* ---------- 보기 좋은 눈금(1-2-5 스텝) ---------- */
function niceStep(span, target) {
  if (!(span > 0)) return 1;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let s;
  if (norm < 1.5) s = 1;
  else if (norm < 3) s = 2;
  else if (norm < 7) s = 5;
  else s = 10;
  return s * mag;
}

// 데이터 축 범위 + 스텝. 좌표축(원점)이 항상 박스 안에 보이도록 범위에 0을 포함시킨다.
// (양수 데이터면 0부터, 음수 데이터면 0까지). ★격자·눈금은 데이터 끝까지만 그리고(그 너머로
// 격자 안 그림), 화살표가 나갈 반 칸(0.55×스텝)만 여유를 둔다 — 범위를 다음 눈금으로 올림하지 않음.
function niceRange(dMin, dMax) {
  const min = Math.min(0, dMin), max = Math.max(0, dMax);
  const span = (min === max) ? 1 : (max - min);
  const step = niceStep(span, 6);
  const lo = dMin >= 0 ? 0 : dMin - step * 0.55;   // 원점 쪽은 0, 데이터 쪽만 반 칸 여유
  const hi = dMax <= 0 ? 0 : dMax + step * 0.55;
  // 부동소수 잔여 정리(예: 0.30000000004 → 0.3)
  const dp = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const round = (v) => Number(v.toFixed(dp));
  return { min: round(lo), max: round(hi), step: round(step) };
}

/* ---------- 데이터 범위 → 새 평면(축 범위·눈금·박스 자동 설정) ---------- */
// 삽입과 미리보기가 같은 평면을 쓰도록 분리(둘이 어긋나면 미리보기가 거짓말이 된다).
// 박스 크기는 아트보드(페이지)의 일부에 맞춰 잡아 그래프가 페이지를 넘지 않게 한다.
function makeDataPlane(pts, at, artboard) {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const rx = niceRange(Math.min(...xs), Math.max(...xs));
  const ry = niceRange(Math.min(...ys), Math.max(...ys));
  const plane = makeDefaultCoordplane(at);
  plane.xMin = rx.min; plane.xMax = rx.max;
  plane.yMin = ry.min; plane.yMax = ry.max;
  plane.gridStepX = rx.step; plane.gridStepY = ry.step;
  plane.showTickLabels = true;      // 데이터 축은 눈금 값이 보여야 읽힌다
  plane.lockAspect = false;         // x·y 스케일이 다를 수 있으므로 정사각 강제 해제
  // 형태: 데이터가 모두 양수면 L자(1사분면, 사진2) — y이름 좌상단·x이름 우측. 음수 있으면 십자.
  plane.axisVariant = (Math.min(...xs) >= 0 && Math.min(...ys) >= 0) ? "quadrant" : "cross";
  // 박스 크기: 기본 1:1 정사각(요구). 아트보드 안에 들어가게 짧은 변 기준 72%.
  const A = artboard && artboard.w && artboard.h ? artboard : { w: 90, h: 60 };
  const side = Math.min(A.w, A.h) * 0.72;
  plane.w = side; plane.h = side;
  plane.x = at.x - side / 2;
  plane.y = at.y - side / 2;
  return plane;
}

// 모달 옵션을 평면에 반영: 축 이름·원점·격자 on/off·눈금 간격·표준 수식 글꼴(정자)·전체 격자.
function applyPlaneOptions(plane, opts) {
  const o = opts || {};
  const labels = o.labels || {};
  if (labels.x) plane.labelX = labels.x;
  if (labels.y) plane.labelY = labels.y;
  plane.showAxisLabels = true;
  plane.showTickLabels = true;
  plane.uprightMathFont = true;   // 눈금 숫자·축 이름을 upright Latin Modern으로(요구 글꼴)
  plane.fullGrid = true;          // 격자를 박스 전체에 채운다(가장자리 한 칸도 포함)
  if (typeof o.showOrigin === "boolean") plane.showOrigin = o.showOrigin;
  if (typeof o.showGrid === "boolean") plane.showGrid = o.showGrid;
  // 눈금 간격 수동 지정(양수일 때만). 비우면 자동값(niceStep) 유지. 격자·눈금 둘 다에 적용.
  if (Number.isFinite(o.stepX) && o.stepX > 0) plane.gridStepX = o.stepX;
  if (Number.isFinite(o.stepY) && o.stepY > 0) plane.gridStepY = o.stepY;
}

// 더블클릭 재편집을 위해 그래프의 원본 스펙을 평면에 저장(데이터 + 모든 옵션).
function dataSpec(pts, opts) {
  const o = opts || {};
  return {
    pts: pts.map((p) => ({ x: p.x, y: p.y })),
    connect: !!o.connect,
    labels: { x: (o.labels && o.labels.x) || "", y: (o.labels && o.labels.y) || "" },
    showOrigin: o.showOrigin !== false,
    showGrid: o.showGrid !== false,
    stepX: Number.isFinite(o.stepX) ? o.stepX : null,
    stepY: Number.isFinite(o.stepY) ? o.stepY : null,
  };
}

// 삽입/미리보기 공통: 선택된 평면(있으면 그 사본)에 옵션 적용, 없으면 데이터로 새 평면.
// forceNew=true(재편집)면 선택 평면을 재사용하지 않고 항상 새 평면을 만든다.
// reuse = 재사용할 실제 평면 객체(없으면 null). plane = 좌표 매핑에 쓸 평면(사본/새것).
function resolvePlane(pts, opts, forceNew) {
  const s = state.get();
  const selId = (s.selectedIds || [])[0];
  const selected = selId ? s.objects.find((o) => o.id === selId) : null;
  const reuse = !forceNew && selected && selected.type === "coordplane" ? selected : null;
  if (reuse) {
    const plane = JSON.parse(JSON.stringify(reuse));
    applyPlaneOptions(plane, opts);
    return { plane, reuse };
  }
  const vb = s.viewBox;
  const plane = makeDataPlane(pts, { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 }, s.artboard);
  applyPlaneOptions(plane, opts);
  return { plane, reuse: null };
}

/* ---------- 삽입: 선택 평면(없으면 새 평면) + 점들 + 연결선 ---------- */
// insertDataPlot(pts, { connect, labels, showOrigin, showGrid, stepX, stepY, replaceGroupId }) → { ok, error }
// replaceGroupId가 있으면(더블클릭 재편집) 그 그룹을 지우고 새로 그린다(undo 1회).
function insertDataPlot(pts, opts) {
  const connect = !!(opts && opts.connect);
  const replaceGroupId = (opts && opts.replaceGroupId) || null;
  if (!pts || !pts.length) return { ok: false, error: "숫자 데이터를 찾지 못했습니다." };

  const { plane, reuse } = resolvePlane(pts, opts, !!replaceGroupId);
  // 수학 좌표 → 월드 mm (coords.js 매핑 재사용, 미리보기와 동일 평면).
  const world = pts.map((p) => worldFromMath(plane, p.x, p.y));

  state.update((st) => {
    const snap = JSON.parse(JSON.stringify(st.objects));
    const ids = [];

    // 재편집: 기존 그래프 그룹(평면+점+선)을 통째로 제거 후 새로 그린다.
    if (replaceGroupId) {
      const grp = (st.groups || []).find((x) => x.id === replaceGroupId);
      const memberSet = new Set(grp ? grp.memberIds
        : st.objects.filter((o) => o.groupId === replaceGroupId).map((o) => o.id));
      st.objects = st.objects.filter((o) => !memberSet.has(o.id));
      st.groups = (st.groups || []).filter((x) => x.id !== replaceGroupId);
    }

    if (reuse) {
      // 재사용 평면에는 옵션(라벨·원점·글꼴)만 실제 객체에 반영(범위/박스는 안 건드림).
      const target = st.objects.find((o) => o.id === reuse.id);
      if (target) applyPlaneOptions(target, opts);
    } else {
      // 새 평면을 커밋하고, 그룹으로 묶어 점들과 한 덩어리로 리사이즈되게 한다.
      plane.id = nextObjectId();
      plane.order = st.objects.length;
      plane.layerId = st.activeLayerId;
      plane.dataPlot = dataSpec(pts, opts);   // 더블클릭 재편집용 원본 스펙
      st.objects.push(plane);
      ids.push(plane.id);
    }

    // 연결선(꺾은선): 점들 위/아래 상관없이 렌더 순서상 먼저 넣어 점이 위에 오게.
    if (connect && world.length >= 2) {
      const poly = {
        id: nextObjectId(),
        type: "polyline",
        points: world.map((w) => ({ x: w.x, y: w.y })),
        rotation: 0,
        strokeLevel: 0, strokeWidth: 0.3,
        arrowHead: "none", dashLength: 0, dashGap: 0,
        closed: false,
        fillLevel: 255, fillNone: true, fillStyle: "solid",
        rounded: false, cornerRadius: 10,
        locked: false, positionLocked: false,
        layerId: st.activeLayerId, order: st.objects.length,
      };
      st.objects.push(poly);
      ids.push(poly.id);
    }

    // 측정점: 표준 점 객체(type optics/kind node) — node-placement.js 스키마 그대로.
    for (const w of world) {
      const node = {
        id: nextObjectId(),
        type: "optics", kind: "node",
        x: w.x - NODE_SIZE / 2, y: w.y - NODE_SIZE / 2, w: NODE_SIZE, h: NODE_SIZE,
        rotation: 0, strokeLevel: 0, strokeWidth: 0.3,
        fillLevel: 255, fillNone: true,
        label: "", showLabel: false, labelPos: "above", labelType: "quantity",
        dashLength: 0, dashGap: 0, locked: false, positionLocked: false,
        layerId: st.activeLayerId, order: st.objects.length,
      };
      st.objects.push(node);
      ids.push(node.id);
    }

    // 방금 만든 객체들을 하나의 그룹으로 묶는다(≥2개). 그래야 앱의 whole-group 리사이즈가
    // 켜지고(같은 groupId 요구), 나중에 하나만 클릭해도 그래프 전체가 재선택된다.
    if (ids.length >= 2) {
      const groupId = nextObjectId();
      for (const id of ids) {
        const o = st.objects.find((obj) => obj.id === id);
        if (o) o.groupId = groupId;
      }
      st.groups = st.groups || [];
      st.groups.push({ id: groupId, memberIds: [...ids] });
    }

    st.undoStack.push(snap);
    st.redoStack = [];
    st.selectedIds = ids;
    st.targetedId = null;
    st.activeTool = "V";
  });

  return { ok: true };
}

/* ---------- 미리보기 SVG: 실제 렌더러 재사용 → 결과와 동일 ---------- */
// 현재 그리드 데이터로 평면+점+연결선을 그려 <svg>로 반환(없으면 null).
function buildPreviewSvg(pts, opts) {
  if (!pts || !pts.length) return null;
  const connect = !!(opts && opts.connect);
  const { plane } = resolvePlane(pts, opts);
  const world = pts.map((p) => worldFromMath(plane, p.x, p.y));

  // 화살표·축 이름·눈금 숫자가 박스 밖으로 나가므로 여백을 둔다(mm). 박스가 작아졌으니
  // 여백도 줄여 그래프가 미리보기를 꽉 채우게 한다(넘치는 라벨은 이 여백 안에 들어온다).
  const mX = 12, mY = 11;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "dp-preview-svg");
  svg.setAttribute("viewBox", `${plane.x - mX} ${plane.y - mY} ${plane.w + 2 * mX} ${plane.h + 2 * mY}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  svg.appendChild(renderCoordplane(plane));   // 실제 캔버스와 동일한 축/격자/라벨

  if (connect && world.length >= 2) {
    const path = document.createElementNS(SVG_NS, "polyline");
    path.setAttribute("points", world.map((w) => `${w.x},${w.y}`).join(" "));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#000");
    path.setAttribute("stroke-width", "0.3");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
  }
  for (const w of world) {
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", w.x); c.setAttribute("cy", w.y);
    c.setAttribute("r", NODE_DOT_R);
    c.setAttribute("fill", "#000");
    svg.appendChild(c);
  }
  return svg;
}

/* ---------- 모달 UI: 엑셀식 입력 그리드(조작변인 | 종속변인) ---------- */
let _overlay = null;
let _els = null;
let _editGroupId = null;   // 재편집 중인 그래프 그룹 id(신규 생성이면 null)

const INITIAL_ROWS = 6;

// (rowIdx행, col열=0:조작변인/1:종속변인)의 입력칸에 포커스 + 전체 선택.
function focusCell(tbody, rowIdx, col) {
  const tr = tbody.children[rowIdx];
  if (!tr) return;
  const inp = tr.querySelectorAll("input")[col];
  if (inp) { inp.focus(); inp.select(); }
}

// 그리드 한 행 추가: 번호칸 + 칸 두 개(조작변인·종속변인) + 붙여넣기/방향키 이동 배선.
function addRow(tbody, xVal = "", yVal = "") {
  const tr = document.createElement("tr");
  const tdNum = document.createElement("td");   // 좌측 행 번호(입력 없음 → collectPoints가 안 셈)
  tdNum.className = "dp-rownum";
  const tdX = document.createElement("td");
  const tdY = document.createElement("td");
  const inputX = document.createElement("input");
  const inputY = document.createElement("input");
  for (const input of [inputX, inputY]) {
    input.type = "text";
    input.className = "dp-cell-input";
    input.inputMode = "decimal";
    input.spellcheck = false;
  }
  inputX.value = xVal;
  inputY.value = yVal;
  tdX.appendChild(inputX);
  tdY.appendChild(inputY);
  tr.appendChild(tdNum);
  tr.appendChild(tdX);
  tr.appendChild(tdY);
  tbody.appendChild(tr);
  tdNum.textContent = tbody.children.length;    // 1-based(추가는 항상 맨 끝이므로 재번호 불필요)

  for (const input of [inputX, inputY]) {
    // 엑셀에서 여러 행·열을 복사해 한 칸에 붙여넣으면, 그 칸을 시작점으로 그리드 전체에 채운다.
    input.addEventListener("paste", (e) => {
      const text = e.clipboardData.getData("text");
      if (!text.includes("\n") && !text.includes("\t")) return; // 값 하나뿐이면 기본 붙여넣기에 맡김
      e.preventDefault();
      const td = input.closest("td");
      const rowIdx = Array.prototype.indexOf.call(tbody.children, td.parentElement);
      const colIdx = Array.prototype.indexOf.call(td.parentElement.children, td); // 번호칸(0) 포함 DOM 인덱스
      distributePaste(tbody, rowIdx, colIdx, text);
    });
    // 방향키/Enter/Tab 셀 이동(엑셀식). 좌우는 커서가 칸 끝에 있을 때만 셀을 넘어간다.
    input.addEventListener("keydown", (e) => {
      const tr2 = input.closest("td").parentElement;
      const rowIdx = Array.prototype.indexOf.call(tbody.children, tr2);
      const inputs = [...tr2.querySelectorAll("input")];
      const col = inputs.indexOf(input);   // 0:조작변인 1:종속변인
      const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
      const atEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
      if (e.key === "Enter" || e.key === "ArrowDown") {
        e.preventDefault();
        if (rowIdx === tbody.children.length - 1) addRow(tbody);
        focusCell(tbody, rowIdx + 1, col);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusCell(tbody, rowIdx - 1, col);
      } else if (e.key === "ArrowLeft" && atStart && col > 0) {
        e.preventDefault();
        focusCell(tbody, rowIdx, col - 1);
      } else if (e.key === "ArrowRight" && atEnd && col < 1) {
        e.preventDefault();
        focusCell(tbody, rowIdx, col + 1);
      }
    });
  }
  return tr;
}

// 붙여넣은 여러 줄(엑셀 탭 구분)을 시작 칸부터 그리드에 채우고, 모자란 행은 자동 생성한다.
function distributePaste(tbody, startRowIdx, startColIdx, text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop(); // 복사 시 붙는 빈 줄 제거
  lines.forEach((line, i) => {
    const cols = line.split("\t");
    while (tbody.children.length <= startRowIdx + i) addRow(tbody);
    const tr = tbody.children[startRowIdx + i];
    cols.forEach((val, j) => {
      const td = tr.children[startColIdx + j];
      const input = td && td.querySelector("input");
      if (input) input.value = val.trim();
    });
  });
  refreshPreview();   // 프로그램적 .value 대입은 input 이벤트를 안 내므로 직접 갱신
}

// 그리드의 채워진 행만 모아 {x, y} 배열로 변환. 빈 행은 조용히 건너뛴다.
function collectPoints(tbody) {
  const pts = [];
  for (const tr of tbody.children) {
    const [inputX, inputY] = tr.querySelectorAll("input");
    const xRaw = inputX.value.trim();
    const yRaw = inputY.value.trim();
    if (!xRaw && !yRaw) continue;
    const x = parseFloat(xRaw);
    const y = parseFloat(yRaw);
    if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
  }
  return pts;
}

/* ---------- 셀 좌표 헬퍼 ---------- */
function cellRC(tbody, input) {
  const tr = input.closest("tr");
  return { row: [...tbody.children].indexOf(tr), col: [...tr.querySelectorAll("input")].indexOf(input) };
}
function cellInput(tbody, row, col) {
  const tr = tbody.children[row];
  return tr ? tr.querySelectorAll("input")[col] : null;
}

/* ---------- 범위 선택(드래그) · 삭제 (#8) ---------- */
let _selAnchor = null, _selFocus = null, _rangeActive = false;
function clearRange(tbody) {
  tbody.querySelectorAll(".dp-cell-sel").forEach((el) => el.classList.remove("dp-cell-sel"));
  _rangeActive = false; _selAnchor = null; _selFocus = null;
}
function highlightRange(tbody) {
  tbody.querySelectorAll(".dp-cell-sel").forEach((el) => el.classList.remove("dp-cell-sel"));
  if (!_selAnchor || !_selFocus) return;
  const r0 = Math.min(_selAnchor.row, _selFocus.row), r1 = Math.max(_selAnchor.row, _selFocus.row);
  const c0 = Math.min(_selAnchor.col, _selFocus.col), c1 = Math.max(_selAnchor.col, _selFocus.col);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const inp = cellInput(tbody, r, c); if (inp) inp.classList.add("dp-cell-sel");
  }
}
function deleteRange(tbody) {
  tbody.querySelectorAll(".dp-cell-sel").forEach((inp) => { inp.value = ""; });
  refreshPreview();
}
function selectAllCells(tbody) {
  if (!tbody.children.length) return;
  _selAnchor = { row: 0, col: 0 };
  _selFocus = { row: tbody.children.length - 1, col: 1 };
  _rangeActive = true;
  highlightRange(tbody);
  tbody.focus();
}
// 그리드 상호작용(드래그 선택·삭제·전체선택) 배선. buildModal에서 1회 호출.
function wireRangeSelection(tbody) {
  tbody.tabIndex = -1;
  tbody.addEventListener("mousedown", (e) => {
    const inp = e.target.closest(".dp-cell-input");
    if (!inp) return;
    clearRange(tbody);
    _selAnchor = cellRC(tbody, inp); _selFocus = _selAnchor;
    const onMove = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const c = el && el.closest ? el.closest(".dp-cell-input") : null;
      if (!c || !tbody.contains(c)) return;
      const rc = cellRC(tbody, c);
      if (rc.row !== _selAnchor.row || rc.col !== _selAnchor.col) {
        if (!_rangeActive) { _rangeActive = true; inp.blur(); tbody.focus(); }
        _selFocus = rc; highlightRange(tbody);
      }
    };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
  tbody.addEventListener("keydown", (e) => {
    if ((e.key === "Delete" || e.key === "Backspace") && _rangeActive) { e.preventDefault(); deleteRange(tbody); }
    else if ((e.key === "a" || e.key === "A") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); selectAllCells(tbody); }
  });
}

/* ---------- 자동 채우기 핸들 (#4): 등차수열 감지 → 마지막 셀에 핸들, 드래그로 채움 ---------- */
// 위에서부터 연속으로 채워진 숫자가 등차수열(간격 일정)이면 {lastRow, lastValue, diff}.
function columnFillInfo(tbody, col) {
  const vals = [];
  for (const tr of tbody.children) {
    const inp = tr.querySelectorAll("input")[col];
    const v = inp.value.trim();
    if (v === "") break;
    const n = parseFloat(v);
    if (!Number.isFinite(n)) break;
    vals.push(n);
  }
  if (vals.length < 2) return null;
  const diff = vals[1] - vals[0];
  for (let i = 2; i < vals.length; i++) if (Math.abs((vals[i] - vals[i - 1]) - diff) > 1e-9) return null;
  return { lastRow: vals.length - 1, lastValue: vals[vals.length - 1], diff };
}
function refreshFillHandles(tbody) {
  tbody.querySelectorAll(".dp-fill-handle").forEach((h) => h.remove());
  for (let col = 0; col < 2; col++) {
    const info = columnFillInfo(tbody, col);
    if (!info) continue;
    const inp = cellInput(tbody, info.lastRow, col);
    if (!inp) continue;
    const handle = document.createElement("div");
    handle.className = "dp-fill-handle";
    handle.title = "드래그해서 아래로 같은 간격으로 채우기";
    inp.closest("td").appendChild(handle);
    handle.addEventListener("mousedown", (e) => startFillDrag(e, tbody, col, info));
  }
}
function startFillDrag(e, tbody, col, info) {
  e.preventDefault(); e.stopPropagation();
  const onMove = (ev) => {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const c = el && el.closest ? el.closest(".dp-cell-input") : null;
    tbody.querySelectorAll(".dp-fill-preview").forEach((x) => x.classList.remove("dp-fill-preview"));
    if (!c || !tbody.contains(c)) return;
    const { row } = cellRC(tbody, c);
    for (let r = info.lastRow + 1; r <= row; r++) {
      const t = cellInput(tbody, r, col); if (t) t.classList.add("dp-fill-preview");
    }
  };
  const onUp = (ev) => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    tbody.querySelectorAll(".dp-fill-preview").forEach((x) => x.classList.remove("dp-fill-preview"));
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const c = el && el.closest ? el.closest(".dp-cell-input") : null;
    if (!c || !tbody.contains(c)) return;
    const { row } = cellRC(tbody, c);
    if (row <= info.lastRow) return;
    for (let r = info.lastRow + 1; r <= row; r++) {
      while (tbody.children.length <= r) addRow(tbody);
      const t = cellInput(tbody, r, col);
      if (t) t.value = fmtNum(info.lastValue + info.diff * (r - info.lastRow));
    }
    refreshPreview();
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}
// 부동소수 잔여 없이 채운 값 표기(0.1+0.2 → 0.3).
function fmtNum(v) { return String(Number(v.toFixed(10))); }

// 조작변인/종속변인 이름(축 라벨). 빈 값이면 축 기본 라벨(x/y)을 유지한다.
function readLabels() {
  return {
    x: _els ? _els.labelX.value.trim() : "",
    y: _els ? _els.labelY.value.trim() : "",
  };
}

// 현재 모달 입력을 옵션 객체로 모은다(미리보기·삽입 공통).
function readOpts() {
  const sx = parseFloat(_els.stepX.value);
  const sy = parseFloat(_els.stepY.value);
  return {
    connect: _els.connect.checked,
    labels: readLabels(),
    showOrigin: _els.origin.checked,
    showGrid: _els.gridToggle.checked,
    stepX: Number.isFinite(sx) ? sx : null,   // null이면 자동 간격
    stepY: Number.isFinite(sy) ? sy : null,
  };
}

// 조작변인·종속변인 각각 채워진 칸 수를 세어 표시. 개수가 다르면 경고(짝 안 맞는 데이터 제외).
function updateCount() {
  let nx = 0, ny = 0;
  for (const tr of _els.grid.children) {
    const [ix, iy] = tr.querySelectorAll("input");
    if (ix && ix.value.trim() !== "") nx++;
    if (iy && iy.value.trim() !== "") ny++;
  }
  const mismatch = nx !== ny;
  _els.count.textContent = `조작변인 ${nx} · 종속변인 ${ny}`
    + (mismatch ? " — 개수가 달라 짝이 안 맞는 데이터는 제외됩니다" : "");
  _els.count.classList.toggle("dp-count-warn", mismatch);
}

// 현재 그리드 데이터로 미리보기 SVG를 다시 그린다(데이터·라벨·옵션 변경 때마다 호출).
function refreshPreview() {
  if (!_els) return;
  updateCount();
  refreshFillHandles(_els.grid);   // 등차수열 감지 → 자동 채우기 핸들 갱신
  const pts = collectPoints(_els.grid);
  _els.preview.innerHTML = "";
  if (!pts.length) {
    _els.preview.innerHTML = `<span class="dp-preview-empty">데이터를 입력하면 여기에 미리보기가 그려집니다.</span>`;
    return;
  }
  const svg = buildPreviewSvg(pts, readOpts());
  if (svg) _els.preview.appendChild(svg);
}

function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "data-plot-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal dp-modal" role="dialog" aria-modal="true" aria-label="데이터 자료변환">
      <h2 class="modal-title">데이터 자료변환</h2>
      <p class="dp-desc">
        표 머리에 조작변인·종속변인 이름을 적고(비우면 x·y), 값을 한 칸씩 입력하세요.
        방향키로 칸을 옮기고, 엑셀/시트에서 두 열을 복사해 첫 칸에 붙여넣으면 여러 행이 한 번에 채워집니다.
        축 이름은 수식(LaTeX) 표기를 지원합니다 — 예: <code>v_0</code>, <code>\\theta</code>, <code>t_2</code>.
      </p>
      <div class="dp-body">
        <div class="dp-left">
          <div class="dp-preview-label">미리보기</div>
          <div id="dp-preview" class="dp-preview"></div>
          <div class="dp-hint">
            좌표평면을 먼저 선택하면 그 평면 위에, 아니면 데이터 범위에 맞춘 새 평면이 생깁니다.
            눈금은 여유 10%를 두고 보기 좋은 값(1·2·5 단위)으로 자동 설정됩니다.
          </div>
        </div>
        <div class="dp-right">
          <div class="dp-grid-wrap">
            <table class="dp-grid">
              <thead>
                <tr>
                  <th class="dp-corner">#</th>
                  <th><input type="text" id="dp-label-x" class="dp-head-input" spellcheck="false" placeholder="조작변인 입력" title="가로축 이름(비우면 x)" /></th>
                  <th><input type="text" id="dp-label-y" class="dp-head-input" spellcheck="false" placeholder="종속변인 입력" title="세로축 이름(비우면 y)" /></th>
                </tr>
              </thead>
              <tbody id="dp-grid-body"></tbody>
            </table>
          </div>
          <div class="dp-controls-row">
            <button type="button" id="dp-add-row" class="dp-add-row-btn">+ 행 추가</button>
            <span id="dp-count" class="dp-count"></span>
          </div>
          <label class="dp-check"><input type="checkbox" id="dp-connect" /> 측정점을 연결선(꺾은선)으로 잇기</label>
          <label class="dp-check"><input type="checkbox" id="dp-origin" checked /> 원점 O 표시</label>
          <label class="dp-check"><input type="checkbox" id="dp-grid" checked /> 격자 표시</label>
          <div class="dp-step-row">
            <label class="dp-step-field"><span>가로 눈금 간격</span>
              <input type="number" id="dp-step-x" class="dp-step-input" min="0" step="any" placeholder="자동" /></label>
            <label class="dp-step-field"><span>세로 눈금 간격</span>
              <input type="number" id="dp-step-y" class="dp-step-input" min="0" step="any" placeholder="자동" /></label>
          </div>
        </div>
      </div>
      <div id="dp-error" style="color:#e5534b;font-size:12px;min-height:16px;margin-top:6px;"></div>
      <div class="modal-actions">
        <button type="button" class="modal-btn" id="dp-cancel">취소</button>
        <button type="button" class="modal-btn modal-btn-primary" id="dp-confirm">만들기</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  _els = {
    grid: overlay.querySelector("#dp-grid-body"),
    addRowBtn: overlay.querySelector("#dp-add-row"),
    connect: overlay.querySelector("#dp-connect"),
    origin: overlay.querySelector("#dp-origin"),
    gridToggle: overlay.querySelector("#dp-grid"),
    stepX: overlay.querySelector("#dp-step-x"),
    stepY: overlay.querySelector("#dp-step-y"),
    count: overlay.querySelector("#dp-count"),
    labelX: overlay.querySelector("#dp-label-x"),
    labelY: overlay.querySelector("#dp-label-y"),
    preview: overlay.querySelector("#dp-preview"),
    error: overlay.querySelector("#dp-error"),
    confirm: overlay.querySelector("#dp-confirm"),
    cancel: overlay.querySelector("#dp-cancel"),
  };

  _els.addRowBtn.addEventListener("click", () => addRow(_els.grid));
  wireRangeSelection(_els.grid);   // 드래그 범위 선택 · Delete 삭제 · Ctrl+A 전체선택
  // 라이브 미리보기: 셀 타이핑(위임)·머리 이름·토글·눈금 간격 변경 때마다 다시 그린다.
  _els.grid.addEventListener("input", refreshPreview);
  _els.labelX.addEventListener("input", refreshPreview);
  _els.labelY.addEventListener("input", refreshPreview);
  _els.connect.addEventListener("change", refreshPreview);
  _els.origin.addEventListener("change", refreshPreview);
  _els.gridToggle.addEventListener("change", refreshPreview);
  _els.stepX.addEventListener("input", refreshPreview);
  _els.stepY.addEventListener("input", refreshPreview);

  const commit = () => {
    const pts = collectPoints(_els.grid);
    if (!pts.length) {
      _els.error.textContent = "숫자 조작변인·종속변인 값을 한 행도 찾지 못했습니다. 값을 입력하세요.";
      return;
    }
    // 재편집 모드면 기존 그래프를 교체(replaceGroupId), 아니면 새로 생성.
    const res = insertDataPlot(pts, { ...readOpts(), replaceGroupId: _editGroupId });
    if (!res.ok) { _els.error.textContent = res.error; return; }
    hide();
  };

  _els.confirm.addEventListener("click", commit);
  _els.cancel.addEventListener("click", hide);
  overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) hide(); });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hide(); }
  });
  return overlay;
}

function hide() { if (_overlay) _overlay.hidden = true; }

// 모달을 특정 옵션/데이터로 채운다. spec 없으면 빈 그리드(신규).
function resetModal(spec) {
  _els.grid.innerHTML = "";
  const rows = Math.max(INITIAL_ROWS, spec ? spec.pts.length + 1 : 0);
  for (let i = 0; i < rows; i++) addRow(_els.grid);
  if (spec) {
    spec.pts.forEach((p, i) => {
      const [ix, iy] = _els.grid.children[i].querySelectorAll("input");
      ix.value = String(p.x); iy.value = String(p.y);
    });
    _els.labelX.value = spec.labels.x || "";
    _els.labelY.value = spec.labels.y || "";
    _els.connect.checked = !!spec.connect;
    _els.origin.checked = spec.showOrigin !== false;
    _els.gridToggle.checked = spec.showGrid !== false;
    _els.stepX.value = spec.stepX != null ? String(spec.stepX) : "";
    _els.stepY.value = spec.stepY != null ? String(spec.stepY) : "";
  } else {
    _els.labelX.value = ""; _els.labelY.value = "";
    _els.connect.checked = false; _els.origin.checked = true; _els.gridToggle.checked = true;
    _els.stepX.value = ""; _els.stepY.value = "";
  }
  _els.error.textContent = "";
  _els.confirm.textContent = spec ? "다시 만들기" : "만들기";
  refreshPreview();
}

/* ----- PUBLIC: 데이터 자료변환 모달 열기(신규) ----- */
export function openDataPlotModal() {
  if (!_overlay) _overlay = buildModal();
  _editGroupId = null;
  resetModal(null);
  _overlay.hidden = false;
  _els.grid.querySelector("input")?.focus();
}

/* ----- PUBLIC: 그래프 더블클릭 → 데이터 편집창 다시 열기(교체) ----- */
export function openDataPlotEditor(planeId) {
  const plane = state.get().objects.find((o) => o.id === planeId && o.type === "coordplane");
  if (!plane || !plane.dataPlot) return false;
  if (!_overlay) _overlay = buildModal();
  _editGroupId = plane.groupId || null;
  resetModal(plane.dataPlot);
  _overlay.hidden = false;
  _els.grid.querySelector("input")?.focus();
  return true;
}

// coordplane이 데이터플롯 그래프인지(더블클릭 분기용).
export function isDataPlotPlane(obj) {
  return !!(obj && obj.type === "coordplane" && obj.dataPlot);
}

/* ----- PUBLIC: '고급 기능' 버튼 배선 ----- */
export function initDataPlot() {
  document.getElementById("data-plot-open")?.addEventListener("click", openDataPlotModal);
}

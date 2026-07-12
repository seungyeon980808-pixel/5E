/* ===== DATA-PLOT: 실험 데이터 표 → 좌표평면 산점도(점 + 연결선) =====
 *
 * 모달에 x·y 값을 직접 입력하거나 엑셀/시트에서 복사한(탭·쉼표·공백 구분) 데이터를
 * 붙여넣으면, 데이터 범위에 맞춰 축 눈금을 자동 설정한 좌표평면 위에 측정점(점 객체)과
 * 선택적 연결선(꺾은선)을 만든다.
 *
 * 설계 결정(기획 방침): 새 객체 타입을 만들지 않는다. coords.js의 수학→월드 mm 매핑을
 * 재사용해 표준 점 객체(type "optics", kind "node")들 + polyline 하나를 생성하므로
 * render/pick/transform/저장이 전부 무수정으로 동작한다.
 *
 * 좌표평면: 이미 선택돼 있으면 그 위에, 없으면 데이터 범위에 맞춰 새 평면을 자동 생성한다.
 */

import { state } from "./state.js?v=0.56.0";
import { worldFromMath } from "./function-graph/coords.js?v=0.56.0";
import { makeDefaultCoordplane } from "./function-graph/defaults.js?v=0.56.0";
import { nextObjectId } from "./tools/id.js?v=0.56.0";

// 점 객체 기본 크기(bbox mm) — node-placement.js의 NODE_DEFAULT_SIZE와 일치.
const NODE_SIZE = 2.27;

/* ---------- 파서: 붙여넣기 텍스트 → [{x, y}] (수학 좌표) ---------- */
// 한 줄 = 한 점. 탭/쉼표/공백 어느 것으로 나뉘어도 처리. 숫자 2개를 못 뽑는 줄
// (헤더 "x  y" 등)은 조용히 건너뛴다.
function parseData(text) {
  const pts = [];
  const skipped = [];
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const tokens = line.split(/[\s,]+/).filter((t) => t.length);
    const x = parseFloat(tokens[0]);
    const y = parseFloat(tokens[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
    else skipped.push(line);
  }
  return { pts, skipped };
}

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

// min/max에 여유 10%를 두고, 눈금 배수로 반올림한 축 범위 + 스텝을 돌려준다.
function niceRange(dMin, dMax) {
  let min = dMin, max = dMax;
  if (min === max) { min -= 1; max += 1; }        // 한 값뿐이면 최소 폭 확보
  const pad = (max - min) * 0.1;
  let lo = min - pad, hi = max + pad;
  const step = niceStep(hi - lo, 6);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  // 부동소수 잔여 정리(예: 0.30000000004 → 0.3)
  const dp = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const round = (v) => Number(v.toFixed(dp));
  return { min: round(lo), max: round(hi), step: round(step) };
}

/* ---------- 삽입: 선택 평면(없으면 새 평면) + 점들 + 연결선 ---------- */
// insertDataPlot(pts, { connect }) → { ok, error }
function insertDataPlot(pts, opts) {
  const connect = !!(opts && opts.connect);
  if (!pts || !pts.length) return { ok: false, error: "숫자 데이터를 찾지 못했습니다." };

  const s = state.get();
  const selId = (s.selectedIds || [])[0];
  const selected = selId ? s.objects.find((o) => o.id === selId) : null;
  const reusePlane = selected && selected.type === "coordplane" ? selected : null;

  // 새 평면: 데이터 범위에 맞춰 축 범위·눈금 자동 설정.
  let newPlane = null;
  let plane = reusePlane;
  if (!plane) {
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const rx = niceRange(Math.min(...xs), Math.max(...xs));
    const ry = niceRange(Math.min(...ys), Math.max(...ys));
    const vb = s.viewBox;
    newPlane = makeDefaultCoordplane({ x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 });
    newPlane.xMin = rx.min; newPlane.xMax = rx.max;
    newPlane.yMin = ry.min; newPlane.yMax = ry.max;
    newPlane.gridStepX = rx.step; newPlane.gridStepY = ry.step;
    newPlane.showTickLabels = true;      // 데이터 축은 눈금 값이 보여야 읽힌다
    newPlane.lockAspect = false;         // x·y 스케일이 다를 수 있으므로 정사각 강제 해제
    // 박스 크기: 가로 80mm 기준, 세로는 데이터 종횡비로(40~100mm 클램프).
    const w = 80;
    const spanX = rx.max - rx.min, spanY = ry.max - ry.min;
    const h = Math.max(40, Math.min(100, spanX > 0 ? (w * spanY) / spanX : 60));
    newPlane.w = w; newPlane.h = h;
    newPlane.x = (vb.x + vb.w / 2) - w / 2;
    newPlane.y = (vb.y + vb.h / 2) - h / 2;
    plane = newPlane;
  }

  // 수학 좌표 → 월드 mm (coords.js 매핑 재사용).
  const world = pts.map((p) => worldFromMath(plane, p.x, p.y));

  state.update((st) => {
    const snap = JSON.parse(JSON.stringify(st.objects));
    if (newPlane) {
      newPlane.id = nextObjectId();
      newPlane.order = st.objects.length;
      newPlane.layerId = st.activeLayerId;
      st.objects.push(newPlane);
    }

    const ids = [];

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

    st.undoStack.push(snap);
    st.redoStack = [];
    st.selectedIds = ids;
    st.targetedId = null;
    st.activeTool = "V";
  });

  return { ok: true };
}

/* ---------- 모달 UI ---------- */
let _overlay = null;
let _els = null;

function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "data-plot-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="데이터 표" style="width:560px;max-width:96vw;">
      <h2 class="modal-title">실험 데이터 표 → 산점도</h2>
      <p style="color:var(--text-secondary);font-size:12px;line-height:1.7;margin:0 0 8px;">
        한 줄에 <code>x&nbsp;&nbsp;y</code> 한 쌍씩 붙여넣으세요(탭·쉼표·공백 구분).
        엑셀/시트에서 두 열을 복사해 그대로 붙여넣어도 됩니다. 헤더 줄은 자동으로 건너뜁니다.
      </p>
      <textarea id="dp-text" class="modal-input" spellcheck="false"
        placeholder="예:
0	0
1	2.1
2	3.9
3	6.2"
        style="width:100%;height:200px;font-family:monospace;resize:vertical;"></textarea>
      <div style="display:flex;align-items:center;gap:16px;margin-top:10px;font-size:13px;color:var(--text-secondary);">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
          <input type="checkbox" id="dp-connect" /> 측정점을 연결선(꺾은선)으로 잇기
        </label>
      </div>
      <div id="dp-error" style="color:#e5534b;font-size:12px;min-height:16px;margin-top:6px;"></div>
      <div style="color:var(--text-secondary);font-size:12px;line-height:1.7;margin-top:2px;">
        · 좌표평면을 먼저 선택하면 그 평면 위에, 아니면 데이터 범위에 맞춘 새 평면이 생깁니다.<br>
        · 축 눈금은 최소·최대에 여유 10%를 두고 보기 좋은 값(1·2·5 단위)으로 자동 설정됩니다.
      </div>
      <div class="modal-actions">
        <button type="button" class="modal-btn" id="dp-cancel">취소</button>
        <button type="button" class="modal-btn modal-btn-primary" id="dp-confirm">만들기</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  _els = {
    text: overlay.querySelector("#dp-text"),
    connect: overlay.querySelector("#dp-connect"),
    error: overlay.querySelector("#dp-error"),
    confirm: overlay.querySelector("#dp-confirm"),
    cancel: overlay.querySelector("#dp-cancel"),
  };

  const commit = () => {
    const { pts, skipped } = parseData(_els.text.value);
    if (!pts.length) {
      _els.error.textContent = "숫자 x·y 쌍을 한 줄도 찾지 못했습니다. 형식을 확인하세요.";
      return;
    }
    const res = insertDataPlot(pts, { connect: _els.connect.checked });
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

/* ----- PUBLIC: 데이터 표 모달 열기 ----- */
export function openDataPlotModal() {
  if (!_overlay) _overlay = buildModal();
  _els.text.value = "";
  _els.error.textContent = "";
  _overlay.hidden = false;
  _els.text.focus();
}

/* ----- PUBLIC: '고급 기능' 버튼 배선 ----- */
export function initDataPlot() {
  document.getElementById("data-plot-open")?.addEventListener("click", openDataPlotModal);
}

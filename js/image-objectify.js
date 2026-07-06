/* ===== IMAGE OBJECTIFY (PNG → 분리된 편집 객체 삽입 UI) =====
//
// 인수인계서(5E_인수인계서_v2) 2단계 구현: 서로 떨어져 있는 잉크 덩어리를 각각
// 개별 오브젝트로 분리해 기존 타입(polyline/text/group)으로만 삽입한다.
// 알고리즘 본체는 image-vectorize.js (데모 exam_figure_editor_demo.html 이식본).
//
// 스키마 매핑 (스키마 변경 금지 원칙):
//  - 윤곽 루프 1개 → closed polyline (검정 채움, strokeWidth 0)
//  - 구멍 루프     → closed polyline (흰색 채움) — 같은 컴포넌트의 바깥 루프 위에 쌓임
//  - 글자 판정 덩어리 → 옵션: 남기기(polyline) / 지우기 / 텍스트 객체 대체(A,B,C…)
//  - 삽입물 전체를 groupId 하나로 묶음 (Shift+G로 해제 가능; undo는 rebuildGroups로 안전)
// 삽입은 반드시 state.update() 경유 — 스냅샷 1개 = Undo 1스텝. */

import { applyNewObjectStyleDefaults } from "./style-mode.js?v=0.50.8";
import { DEFAULT_TEXT_FONT } from "./state.js?v=0.50.8";
import { vectorizeImage } from "./image-vectorize.js?v=0.50.8";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_PROCESS_DIMENSION = 2000; // 데모 성능 검증 범위 (1초 이내)
const ARTBOARD_FIT_RATIO = 0.8;     // 인수인계서 §3: 아트보드 폭 80%에 맞춰 중앙 배치
let idCounter = 0;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function round3(value) {
  return Math.round(value * 1000) / 1000;
}
// 0→A, 1→B, … 25→Z, 26→AA … (재라벨링 자리표시용 순번 라벨)
function sequenceLabel(index) {
  let label = "";
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

// §2-4(C5): 글자 판정 bbox를 원본에서 크롭해 흰 배경을 투명화한 PNG dataURL로.
// 회색조 잉크는 RGB=(0,0,0) 고정 + alpha=255-gray → 흰 배경 위 원본을 정확히
// 재현(무손실). 유채색만 흰 배경 기준 un-premultiply로 색·알파 복원. 반환은
// { dataUrl, x0, y0, w, h }(x0/y0/w/h는 패딩 포함 이미지 px), 축소 시 null.
function makeTextCropDataUrl(sourceCanvas, bbox) {
  const pad = 1;
  const x0 = Math.max(0, Math.floor(bbox[0]) - pad);
  const y0 = Math.max(0, Math.floor(bbox[1]) - pad);
  const x1 = Math.min(sourceCanvas.width, Math.ceil(bbox[2]) + pad);
  const y1 = Math.min(sourceCanvas.height, Math.ceil(bbox[3]) + pad);
  const cw = x1 - x0, ch = y1 - y0;
  if (cw < 1 || ch < 1) return null;
  const src = sourceCanvas.getContext("2d").getImageData(x0, y0, cw, ch);
  const d = src.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const chromatic = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b)) > 16;
    if (!chromatic) {
      const gray = (r * 0.299 + g * 0.587 + b * 0.114) | 0;
      d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 255 - gray;
    } else {
      const a = 255 - Math.min(r, g, b);           // 흰 배경 위 잉크량
      if (a <= 0) { d[i + 3] = 0; }
      else {
        const inv = 255 / a;                        // un-premultiply over white
        d[i]     = Math.max(0, Math.min(255, (r - (255 - a)) * inv));
        d[i + 1] = Math.max(0, Math.min(255, (g - (255 - a)) * inv));
        d[i + 2] = Math.max(0, Math.min(255, (b - (255 - a)) * inv));
        d[i + 3] = a;
      }
    }
  }
  const oc = document.createElement("canvas");
  oc.width = cw; oc.height = ch;
  oc.getContext("2d").putImageData(src, 0, 0);
  return { dataUrl: oc.toDataURL("image/png"), x0, y0, w: cw, h: ch };
}

/* ===== 모달 스타일 주입 (css 파일 미변경 원칙 — JS로 대형 2단 레이아웃 오버라이드) ===== */
function injectObjectifyStyles() {
  if (document.getElementById("objectify-enh-styles")) return;
  const style = document.createElement("style");
  style.id = "objectify-enh-styles";
  style.textContent = `
    .modal-objectify { width:94vw !important; max-width:94vw !important; height:92vh; max-height:92vh; display:flex; flex-direction:column; gap:10px; }
    .objectify-body { display:flex; gap:16px; flex:1 1 auto; min-height:0; }
    .objectify-left { flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:8px; }
    .objectify-right { flex:0 0 330px; overflow-y:auto; display:flex; flex-direction:column; gap:12px; padding-right:4px; }
    .objectify-stage { flex:1 1 auto; min-height:0; overflow:hidden; position:relative; background:#eef1f4; border:1px solid #d0d7de; border-radius:8px; cursor:grab; }
    .objectify-stage.is-brush { cursor:crosshair; }
    .objectify-stage.is-panning { cursor:grabbing; }
    .objectify-stage canvas { position:absolute; top:0; left:0; transform-origin:0 0; }
    .objectify-tools { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
    .objectify-tools .modal-btn.is-active { background:#0969da; color:#fff; border-color:#0969da; }
    .modal-objectify .objectify-dropzone { position:absolute; inset:0; margin:0; z-index:3; display:flex; align-items:center; justify-content:center; text-align:center; padding:24px; background:#22272e; color:#adbac7; border:2px dashed #444c56; border-radius:8px; cursor:pointer; }
    .objectify-stage.has-image .objectify-dropzone { display:none; }
    .objectify-stage.is-dragover .objectify-dropzone { display:flex; background:#2d333b; border-color:#0969da; }
  `;
  document.head.appendChild(style);
}

/* ===== 모달 DOM ===== */
function buildModal() {
  injectObjectifyStyles();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal modal-objectify" role="dialog" aria-modal="true" aria-labelledby="objectify-title">
      <h2 class="modal-title" id="objectify-title">이미지 객체화 — 전처리</h2>
      <input id="objectify-file" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" hidden />
      <div class="objectify-body">
        <div class="objectify-left">
          <div id="objectify-stage" class="objectify-stage">
            <canvas id="objectify-preview" width="560" height="240"></canvas>
            <div id="objectify-dropzone" class="objectify-dropzone" role="button" tabindex="0">PNG/JPG/WEBP 파일을 여기에 끌어 놓기 · 클릭해 선택 · Ctrl+V 붙여넣기</div>
          </div>
          <div id="objectify-tools" class="objectify-tools" hidden>
            <button id="objectify-cut-toggle" type="button" class="modal-btn">✂ 자르기</button>
            <button id="objectify-group-toggle" type="button" class="modal-btn">🔗 묶기</button>
            <label class="modal-label" style="font-weight:normal;margin:0;white-space:nowrap;">브러시 <input id="objectify-cut-width" type="range" min="2" max="30" step="1" value="8" style="vertical-align:middle;width:80px;" /><output id="objectify-cut-width-value">8px</output></label>
            <button id="objectify-cut-clear" type="button" class="modal-btn" disabled>자른 선 지우기</button>
            <button id="objectify-group-clear" type="button" class="modal-btn" disabled>묶음 해제</button>
            <button id="objectify-zoom-reset" type="button" class="modal-btn">전체 보기</button>
            <span class="modal-label" id="objectify-tool-hint" style="font-weight:normal;color:#6e7781;margin:0;">휠=확대/축소 · 빈 곳 드래그=이동 · ✂/🔗 켜고 드래그=자르기/묶기 · 클릭=제외</span>
          </div>
          <p class="objectify-description" id="objectify-legend" hidden style="margin:0;">
            <span style="color:#0969da;">■ 도형</span>&nbsp;
            <span style="color:#e35d6a;">■ 글자 추정</span>&nbsp;
            <span style="color:#8250df;">■ 묶음</span>&nbsp;·&nbsp;클릭=제외/포함 전환.
          </p>
        </div>
        <div class="objectify-right">
          <p class="objectify-description" style="margin:0;">떨어진 잉크 덩어리를 편집 가능한 객체로 분리합니다. 흰 배경은 자동 투명 처리. 붙은 덩어리는 <b>✂ 자르기</b>로 나누고, 흩어진 조각은 <b>🔗 묶기</b>로 한 객체 묶음으로 만든 뒤 삽입하세요.</p>
          <div class="objectify-controls" style="grid-template-columns:1fr 1fr;">
            <label class="modal-field">
              <span class="modal-label">오브젝트 묶음 거리</span>
              <span class="objectify-range-row"><input id="objectify-dilate" type="range" min="1" max="9" step="1" value="3" /><output class="objectify-range-value" id="objectify-dilate-value">3px</output></span>
            </label>
            <label class="modal-field">
              <span class="modal-label">최소 오브젝트 크기</span>
              <span class="objectify-range-row"><input id="objectify-minarea" type="range" min="5" max="400" step="1" value="25" /><output class="objectify-range-value" id="objectify-minarea-value">25px²</output></span>
            </label>
            <label class="modal-field">
              <span class="modal-label">글자 판정 크기 기준</span>
              <span class="objectify-range-row"><input id="objectify-textsize" type="range" min="8" max="60" step="1" value="22" /><output class="objectify-range-value" id="objectify-textsize-value">22px</output></span>
            </label>
            <label class="modal-field">
              <span class="modal-label">곡선 단순화 정도</span>
              <span class="objectify-range-row"><input id="objectify-eps" type="range" min="0" max="40" step="1" value="12" /><output class="objectify-range-value" id="objectify-eps-value">1.2</output></span>
            </label>
          </div>
          <div class="modal-field">
            <span class="modal-label">글자(라벨) 처리</span>
            <span style="display:flex;flex-direction:column;gap:6px;">
              <label class="modal-field-row" style="margin:0;"><input type="radio" name="objectify-textmode" value="image" checked /><span class="modal-label" style="font-weight:normal;">원본 이미지로 유지 (권장)</span></label>
              <label class="modal-field-row" style="margin:0;"><input type="radio" name="objectify-textmode" value="keep" /><span class="modal-label" style="font-weight:normal;">남기기 (글자 모양 그대로)</span></label>
              <label class="modal-field-row" style="margin:0;"><input type="radio" name="objectify-textmode" value="remove" /><span class="modal-label" style="font-weight:normal;">지우기</span></label>
              <label class="modal-field-row" style="margin:0;"><input type="radio" name="objectify-textmode" value="replace" /><span class="modal-label" style="font-weight:normal;">텍스트 객체로 대체 (A, B, C…)</span></label>
            </span>
          </div>
          <label class="modal-field modal-field-row"><input id="objectify-graylevels" type="checkbox" checked /><span class="modal-label">회색 단계 보존 (흰/회색/검정 다단계 인식)</span></label>
          <label class="modal-field modal-field-row"><input id="objectify-removegrid" type="checkbox" /><span class="modal-label">격자·눈금선 제거 (그래프·도표용)</span></label>
          <label class="modal-field modal-field-row"><input id="objectify-reference" type="checkbox" /><span class="modal-label">원본 이미지를 반투명 배경으로 함께 삽입</span></label>
        </div>
      </div>
      <p id="objectify-status" class="objectify-status" role="status">이미지를 선택하세요.</p>
      <div class="modal-actions">
        <button id="objectify-cancel" type="button" class="modal-btn">취소</button>
        <button id="objectify-analyze" type="button" class="modal-btn" disabled>다시 분석</button>
        <button id="objectify-insert" type="button" class="modal-btn modal-btn-primary" disabled>객체로 삽입</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

/* ===== init ===== */
export function initImageObjectify(state) {
  const openButton = document.getElementById("image-objectify-open");
  if (!openButton) return;

  const overlay = buildModal();
  const fileInput = overlay.querySelector("#objectify-file");
  const dropzone = overlay.querySelector("#objectify-dropzone");
  const preview = overlay.querySelector("#objectify-preview");
  const legend = overlay.querySelector("#objectify-legend");
  const status = overlay.querySelector("#objectify-status");
  const analyzeButton = overlay.querySelector("#objectify-analyze");
  const insertButton = overlay.querySelector("#objectify-insert");
  const removeGridInput = overlay.querySelector("#objectify-removegrid");
  const grayLevelsInput = overlay.querySelector("#objectify-graylevels");
  const referenceInput = overlay.querySelector("#objectify-reference");
  const sliders = {
    dilate: overlay.querySelector("#objectify-dilate"),
    minarea: overlay.querySelector("#objectify-minarea"),
    textsize: overlay.querySelector("#objectify-textsize"),
    eps: overlay.querySelector("#objectify-eps"),
  };

  const stage = overlay.querySelector("#objectify-stage");
  const tools = overlay.querySelector("#objectify-tools");
  const cutToggle = overlay.querySelector("#objectify-cut-toggle");
  const groupToggle = overlay.querySelector("#objectify-group-toggle");
  const cutWidthInput = overlay.querySelector("#objectify-cut-width");
  const cutWidthValue = overlay.querySelector("#objectify-cut-width-value");
  const cutClearButton = overlay.querySelector("#objectify-cut-clear");
  const groupClearButton = overlay.querySelector("#objectify-group-clear");
  const zoomResetButton = overlay.querySelector("#objectify-zoom-reset");

  let sourceCanvas = null;   // 처리용 캔버스 (흰 배경 합성, 최대 2000px)
  let sourceDataUrl = null;  // 참고 이미지 삽입용 원본 dataURL
  let analysis = null;       // vectorizeImage 결과
  let previewPaths = [];     // 컴포넌트별 Path2D 캐시
  let excluded = new Set();  // 미리보기에서 제외한 컴포넌트 index
  let brushMode = null;      // null | "cut" | "group" — 현재 브러시
  let cutStrokes = [];       // 절단선 [{ points:[[x,y]...], width }]
  let groupStrokes = [];     // 묶음선 [{ points:[[x,y]...], width }]
  let drawingStroke = null;  // 현재 드래그 중인 브러시 선
  let bundles = [];          // 묶음: [[컴포넌트 index...], ...] (재분석마다 재계산)
  const view = { zoom: 1, ox: 0, oy: 0 }; // 미리보기 줌/팬
  let panning = null;        // 빈 곳 드래그 이동 상태
  let pointerMoved = false;  // 드래그 여부(클릭-제외 억제용)
  let needFit = false;       // 새 이미지 로드 시 1회 전체 보기

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  };
  const close = () => { overlay.hidden = true; };

  function currentOptions() {
    return {
      dilateRadius: Number(sliders.dilate.value),
      minArea: Number(sliders.minarea.value),
      textSizePx: Number(sliders.textsize.value),
      epsilon: Number(sliders.eps.value) / 10,
      removeGrid: removeGridInput.checked,
      preserveGrayLevels: grayLevelsInput.checked,
    };
  }

  // 분리 브러시: 사용자가 그은 절단선들을 sourceCanvas 해상도의 cutMask(1=자름)로
  // 래스터화. 원본은 불변, 분석 마스크에만 적용된다.
  function buildCutMask() {
    if (!sourceCanvas || !cutStrokes.length) return null;
    const c = document.createElement("canvas");
    c.width = sourceCanvas.width; c.height = sourceCanvas.height;
    const cx = c.getContext("2d");
    cx.strokeStyle = "#000"; cx.fillStyle = "#000"; cx.lineCap = "round"; cx.lineJoin = "round";
    for (const st of cutStrokes) {
      if (st.points.length === 1) {
        cx.beginPath(); cx.arc(st.points[0][0], st.points[0][1], st.width / 2, 0, Math.PI * 2); cx.fill();
        continue;
      }
      cx.lineWidth = st.width;
      cx.beginPath();
      cx.moveTo(st.points[0][0], st.points[0][1]);
      for (let i = 1; i < st.points.length; i += 1) cx.lineTo(st.points[i][0], st.points[i][1]);
      cx.stroke();
    }
    const d = cx.getImageData(0, 0, c.width, c.height).data;
    const mask = new Uint8Array(c.width * c.height);
    for (let i = 0; i < mask.length; i += 1) if (d[i * 4 + 3] > 0) mask[i] = 1;
    return mask;
  }

  // 브러시 선을 미리보기에 그린다(자르기=빨강, 묶기=보라).
  function drawBrushStroke(ctx, st, color) {
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = st.width;
    if (st.points.length === 1) {
      ctx.beginPath(); ctx.arc(st.points[0][0], st.points[0][1], st.width / 2, 0, Math.PI * 2); ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(st.points[0][0], st.points[0][1]);
    for (let i = 1; i < st.points.length; i += 1) ctx.lineTo(st.points[i][0], st.points[i][1]);
    ctx.stroke();
  }
  const bundleColor = (bi) => `hsl(${270 + (bi * 47) % 90}, 58%, 52%)`;

  // 이미지 px (x,y)에 있는 최상위(가장 작은) 컴포넌트 index.
  function componentIndexAt(x, y) {
    if (!analysis) return -1;
    let hit = -1, hitArea = Infinity;
    analysis.components.forEach((comp, index) => {
      const [x0, y0, x1, y1] = comp.bbox;
      if (x < x0 - 2 || x > x1 + 2 || y < y0 - 2 || y > y1 + 2) return;
      if (comp.area < hitArea) { hitArea = comp.area; hit = index; }
    });
    return hit;
  }
  // 묶음선이 지나가는 컴포넌트들을 묶음으로(union-find). 선 자체로 저장돼 있어
  // 슬라이더 변경·재분석 후에도 매번 현재 컴포넌트로 재매핑된다.
  function computeBundles() {
    bundles = [];
    if (!analysis || !groupStrokes.length) return;
    const n = analysis.components.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    for (const st of groupStrokes) {
      const touched = [];
      for (const [x, y] of st.points) { const idx = componentIndexAt(x, y); if (idx >= 0 && !touched.includes(idx)) touched.push(idx); }
      for (let k = 1; k < touched.length; k += 1) parent[find(touched[k])] = find(touched[0]);
    }
    const groups = new Map();
    for (let i = 0; i < n; i += 1) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
    bundles = [...groups.values()].filter((g) => g.length >= 2);
  }

  /* ----- 줌/팬 (미리보기 캔버스 CSS transform) ----- */
  function applyView() {
    preview.style.transform = `translate(${view.ox}px, ${view.oy}px) scale(${view.zoom})`;
  }
  function fitView() {
    if (!sourceCanvas) return;
    const sw = stage.clientWidth || 800, sh = stage.clientHeight || 400;
    const z = Math.min(sw / sourceCanvas.width, sh / sourceCanvas.height) || 1;
    view.zoom = z;
    view.ox = (sw - sourceCanvas.width * z) / 2;
    view.oy = (sh - sourceCanvas.height * z) / 2;
    applyView();
  }

  /* ----- 미리보기: 원본 흐리게 + 컴포넌트 오버레이 + 브러시선 ----- */
  function drawPreview() {
    if (!sourceCanvas || !analysis) return;
    preview.width = sourceCanvas.width;
    preview.height = sourceCanvas.height;
    const ctx = preview.getContext("2d");
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fillRect(0, 0, preview.width, preview.height);
    const lw = Math.min(6, Math.max(0.6, 1.8 / view.zoom)); // 줌 무관 일정한 시각 두께
    const bundleOf = new Map();
    bundles.forEach((b, bi) => b.forEach((ci) => bundleOf.set(ci, bi)));
    analysis.components.forEach((comp, index) => {
      const path = previewPaths[index];
      if (!path) return;
      let color;
      if (excluded.has(index)) color = "#6e7781";
      else if (bundleOf.has(index)) color = bundleColor(bundleOf.get(index));
      else color = comp.isText ? "#e35d6a" : "#0969da";
      ctx.globalAlpha = excluded.has(index) ? 0.22 : 0.58;
      ctx.fillStyle = color;
      ctx.fill(path, "evenodd");
      ctx.globalAlpha = 1;
      if (excluded.has(index)) {
        const [x0, y0, x1, y1] = comp.bbox;
        ctx.strokeStyle = "#6e7781"; ctx.lineWidth = lw;
        ctx.setLineDash([4 * lw, 3 * lw]);
        ctx.strokeRect(x0 - 1.5, y0 - 1.5, x1 - x0 + 3, y1 - y0 + 3);
        ctx.setLineDash([]);
      } else if (bundleOf.has(index)) {
        const [x0, y0, x1, y1] = comp.bbox;
        ctx.strokeStyle = color; ctx.lineWidth = lw;
        ctx.strokeRect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2);
      }
    });
    for (const st of cutStrokes) drawBrushStroke(ctx, st, "rgba(224,49,49,0.9)");
    for (const st of groupStrokes) drawBrushStroke(ctx, st, "rgba(130,80,223,0.85)");
    if (drawingStroke) drawBrushStroke(ctx, drawingStroke, brushMode === "cut" ? "rgba(224,49,49,0.9)" : "rgba(130,80,223,0.85)");
    stage.classList.add("has-image");   // 이미지 있음 → 안내 오버레이 숨김(미리보기와 통합)
    tools.hidden = false;
    legend.hidden = false;
  }

  function updateResultStatus() {
    if (!analysis) return;
    const total = analysis.components.length;
    const textCount = analysis.components.filter((c) => c.isText).length;
    const parts = [`오브젝트 ${total}개 (글자 추정 ${textCount}개)`];
    if (excluded.size) parts.push(`제외 ${excluded.size}개`);
    setStatus(total ? parts.join(" · ") : "조건에 맞는 오브젝트를 찾지 못했습니다. 설정을 조정해 보세요.", total === 0);
    insertButton.disabled = total - excluded.size === 0;
  }

  /* ----- 분석 실행 ----- */
  function analyze() {
    if (!sourceCanvas) return;
    analyzeButton.disabled = true;
    insertButton.disabled = true;
    setStatus("이미지를 분석하는 중입니다...");
    // 상태 메시지가 먼저 그려지도록 파이프라인은 살짝 미뤄 실행.
    // (rAF는 백그라운드 탭에서 멈추므로 setTimeout 사용)
    setTimeout(() => {
      try {
        const ctx = sourceCanvas.getContext("2d");
        const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
        analysis = vectorizeImage(imageData, { ...currentOptions(), cutMask: buildCutMask() });
        excluded = new Set();
        previewPaths = analysis.components.map((comp) => {
          const path = new Path2D();
          if (comp.ellipse) {
            const e = comp.ellipse;
            path.ellipse(e.cx, e.cy, e.rx, e.ry, (e.rotationDeg || 0) * Math.PI / 180, 0, Math.PI * 2);
            return path;
          }
          for (const loop of comp.loops) {
            path.moveTo(loop.points[0][0], loop.points[0][1]);
            for (let i = 1; i < loop.points.length; i += 1) path.lineTo(loop.points[i][0], loop.points[i][1]);
            path.closePath();
          }
          return path;
        });
        computeBundles();            // 묶음선 → 현재 컴포넌트로 재매핑
        if (needFit) { fitView(); needFit = false; }  // 새 이미지만 전체 보기
        drawPreview();
        updateResultStatus();
      } catch (error) {
        analysis = null;
        previewPaths = [];
        setStatus(`분석 중 오류가 발생했습니다: ${error.message || error}`, true);
      } finally {
        analyzeButton.disabled = !sourceCanvas;
      }
    }, 20);
  }

  let analyzeTimer = 0;
  function scheduleAnalyze() {
    if (!sourceCanvas) return;
    clearTimeout(analyzeTimer);
    analyzeTimer = setTimeout(analyze, 250);
  }

  /* ----- 파일 로드 ----- */
  function loadFile(file) {
    if (!file || !ACCEPTED_TYPES.has(file.type)) {
      setStatus("PNG, JPG, JPEG 또는 브라우저가 지원하는 WEBP 파일을 선택해 주세요.", true);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setStatus("이미지 파일을 읽지 못했습니다.", true);
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => setStatus("브라우저가 이 이미지 파일을 디코딩하지 못했습니다.", true);
      image.onload = () => {
        const scale = Math.min(1, MAX_PROCESS_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
        sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        sourceCanvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const ctx = sourceCanvas.getContext("2d");
        ctx.fillStyle = "#fff"; // 투명 PNG 대비: 흰 배경 먼저 채움
        ctx.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
        ctx.drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);
        sourceDataUrl = reader.result;
        analysis = null;
        excluded = new Set();
        // 새 이미지 → 자르기·묶기·모드 초기화 + 전체 보기
        cutStrokes = []; groupStrokes = []; bundles = []; drawingStroke = null; panning = null;
        cutClearButton.disabled = true; groupClearButton.disabled = true;
        setBrushMode(null); needFit = true;
        analyzeButton.disabled = false;
        analyze();
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ----- 미리보기 좌표 → 이미지 px (getBoundingClientRect가 줌/팬 transform 반영) ----- */
  function previewPointerPos(event) {
    const rect = preview.getBoundingClientRect();
    return [
      (event.clientX - rect.left) * (preview.width / rect.width),
      (event.clientY - rect.top) * (preview.height / rect.height),
    ];
  }

  /* ----- 브러시 모드 전환 (null=보기/제외, "cut", "group") ----- */
  function setBrushMode(mode) {
    brushMode = mode;
    cutToggle.classList.toggle("is-active", mode === "cut");
    groupToggle.classList.toggle("is-active", mode === "group");
    cutToggle.textContent = mode === "cut" ? "✂ 자르기 (켜짐)" : "✂ 자르기";
    groupToggle.textContent = mode === "group" ? "🔗 묶기 (켜짐)" : "🔗 묶기";
    stage.classList.toggle("is-brush", !!mode);
  }

  /* ----- 휠 줌 (커서 기준) ----- */
  stage.addEventListener("wheel", (event) => {
    if (!sourceCanvas) return;
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    const mx = event.clientX - rect.left, my = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    const nz = Math.max(0.05, Math.min(20, view.zoom * factor));
    view.ox = mx - (mx - view.ox) * (nz / view.zoom);
    view.oy = my - (my - view.oy) * (nz / view.zoom);
    view.zoom = nz;
    applyView();
  }, { passive: false });

  /* ----- 포인터: 브러시(자르기/묶기) 그리기 · 빈 곳 드래그=이동 · 클릭=제외 ----- */
  preview.addEventListener("mousedown", (event) => {
    if (!analysis || event.button !== 0) return;
    pointerMoved = false;
    if (brushMode) {
      event.preventDefault();
      drawingStroke = { points: [previewPointerPos(event)], width: Number(cutWidthInput.value) };
      drawPreview();
    } else {
      panning = { sx: event.clientX, sy: event.clientY, ox0: view.ox, oy0: view.oy };
      stage.classList.add("is-panning");
    }
  });
  window.addEventListener("mousemove", (event) => {
    if (drawingStroke) {
      pointerMoved = true;
      drawingStroke.points.push(previewPointerPos(event));
      drawPreview();
    } else if (panning) {
      if (Math.abs(event.clientX - panning.sx) + Math.abs(event.clientY - panning.sy) > 3) pointerMoved = true;
      view.ox = panning.ox0 + (event.clientX - panning.sx);
      view.oy = panning.oy0 + (event.clientY - panning.sy);
      applyView();
    }
  });
  window.addEventListener("mouseup", () => {
    if (drawingStroke) {
      const stroke = drawingStroke;
      drawingStroke = null;
      if (brushMode === "cut") {
        cutStrokes.push(stroke); cutClearButton.disabled = false;
        analyze();                       // 절단은 마스크 변경 → 재분석
      } else if (brushMode === "group") {
        groupStrokes.push(stroke); groupClearButton.disabled = false;
        computeBundles(); drawPreview();  // 묶음은 재분석 불필요 — 재매핑만
      }
    }
    panning = null;
    stage.classList.remove("is-panning");
  });
  // 클릭=제외/포함 (드래그·브러시가 아니었을 때만)
  preview.addEventListener("click", (event) => {
    if (!analysis || brushMode || pointerMoved) return;
    const [x, y] = previewPointerPos(event);
    const hit = componentIndexAt(x, y);
    if (hit < 0) return;
    if (excluded.has(hit)) excluded.delete(hit); else excluded.add(hit);
    drawPreview();
    updateResultStatus();
  });

  /* ===== 삽입: 이미지 px → world mm 매핑 + 스토어 액션 (Undo 1스텝) ===== */
  function insertObjects() {
    if (!analysis) return;
    const comps = analysis.components.filter((_, index) => !excluded.has(index));
    if (!comps.length) return;
    const textMode = overlay.querySelector('input[name="objectify-textmode"]:checked').value;

    const artboard = state.get().artboard;
    const scale = Math.min(
      (artboard.w * ARTBOARD_FIT_RATIO) / analysis.width,
      (artboard.h * ARTBOARD_FIT_RATIO) / analysis.height,
    );
    const ox = -(analysis.width * scale) / 2;  // 아트보드 중심(월드 원점)에 배치
    const oy = -(analysis.height * scale) / 2;
    const X = (v) => round3(ox + v * scale);
    const Y = (v) => round3(oy + v * scale);
    const stamp = Date.now().toString(36);

    // 텍스트 대체용 순번 라벨: 읽기 순서(위→아래, 왼→오른)로 A, B, C…
    const replacedLabels = new Map();
    if (textMode === "replace") {
      comps.filter((c) => c.isText)
        .sort((a, b) => (a.bbox[1] - b.bbox[1]) || (a.bbox[0] - b.bbox[0]))
        .forEach((comp, index) => replacedLabels.set(comp, sequenceLabel(index)));
    }

    // §2-4: "원본 이미지로 유지" — 글자 판정 컴포넌트를 원본 크롭 PNG로 미리 생성.
    const textCrops = new Map();
    if (textMode === "image" && sourceCanvas) {
      for (const comp of comps) {
        if (!comp.isText) continue;
        const crop = makeTextCropDataUrl(sourceCanvas, comp.bbox);
        if (crop) textCrops.set(comp, crop);
      }
    }

    state.update((s) => {
      const snapshot = clone(s.objects);
      const layerId = s.activeLayerId;
      const addedIds = [];
      const addedByComp = new Map();   // comp → [삽입된 obj.id...] (묶음 그룹화용)
      const pushObj = (obj, comp) => {
        s.objects.push(obj);
        addedIds.push(obj.id);
        if (!addedByComp.has(comp)) addedByComp.set(comp, []);
        addedByComp.get(comp).push(obj.id);
      };

      if (referenceInput.checked && sourceDataUrl) {
        s.objects.push(applyNewObjectStyleDefaults({
          id: `obj_${stamp}_ref${++idCounter}`,
          type: "image", src: sourceDataUrl,
          x: ox, y: oy, w: round3(analysis.width * scale), h: round3(analysis.height * scale),
          opacity: 0.28, rotation: 0, locked: true, positionLocked: true,
          aspectLocked: true, exportable: false, imageSelectionLocked: true,
          mode: "edit", cutouts: [], recognized: true,
          layerId, order: s.objects.length,
        }));
      }

      for (const comp of comps) {
        if (comp.isText && textMode === "remove") continue;
        // §2-4(C5): 원본 크롭 이미지로 유지 (기본·권장, 무손실). 크롭 실패 시 폴백.
        if (comp.isText && textMode === "image") {
          const crop = textCrops.get(comp);
          if (crop) {
            const imgObj = applyNewObjectStyleDefaults({
              id: `obj_${stamp}_vecimg${++idCounter}`,
              type: "image", src: crop.dataUrl,
              x: X(crop.x0), y: Y(crop.y0),
              w: round3(crop.w * scale), h: round3(crop.h * scale),
              rotation: 0, mode: "edit", opacity: 1,
              aspectLocked: true, exportable: true,
              locked: false, positionLocked: false, imageSelectionLocked: false,
              cutouts: [], layerId, order: s.objects.length,
            });
            pushObj(imgObj, comp);
            continue;
          }
          // 크롭 실패(초소형) 시 아래 폴리곤 벡터화로 폴백.
        }
        if (comp.isText && textMode === "replace") {
          const [bx0, by0, , by1] = comp.bbox;
          const fontSize = Math.min(12, Math.max(2.5, round3((by1 - by0) * scale)));
          const textObject = applyNewObjectStyleDefaults({
            id: `obj_${stamp}_vectext${++idCounter}`,
            type: "text",
            x: X(bx0), y: Y(by0),
            text: replacedLabels.get(comp) || "A",
            fontSize, fontFamily: DEFAULT_TEXT_FONT,
            fontWeight: "normal", fontStyle: "normal",
            italic: false, letterSpacing: null,
            underline: false, strikeout: false,
            rotation: 0, locked: false, positionLocked: false,
            layerId, order: s.objects.length,
          });
          pushObj(textObject, comp);
          continue;
        }
        // §2-2: 원/링 → 네이티브 ellipse 1객체 (px → world mm 환산).
        if (comp.ellipse) {
          const e = comp.ellipse;
          const cxW = ox + e.cx * scale, cyW = oy + e.cy * scale;
          const wW = e.rx * 2 * scale, hW = e.ry * 2 * scale;
          const ellipseObject = applyNewObjectStyleDefaults({
            id: `obj_${stamp}_vecel${++idCounter}`,
            type: "ellipse",
            x: round3(cxW - wW / 2), y: round3(cyW - hW / 2),
            w: round3(wW), h: round3(hW),
            rotation: round3(e.rotationDeg || 0),
            strokeLevel: e.strokeLevel, strokeWidth: round3(e.strokeWidthPx * scale),
            fillLevel: e.fillLevel, fillNone: false, fillStyle: "solid",
            dashLength: 0, dashGap: 0,
            labelType: "quantity",
            locked: false, positionLocked: false,
            layerId, order: s.objects.length,
          });
          pushObj(ellipseObject, comp);
          continue;
        }
        for (const loop of comp.loops) {
          // 채움 폴리곤 — 테두리 없음 (자유곡선 F 관례). 회색 단계 보존 시
          // loop.fillLevel = 실측 그레이 중앙값(§2-1); 폴백은 바깥=검정, 구멍=흰.
          const base = {
            id: `obj_${stamp}_vec${++idCounter}`,
            points: loop.points.map(([px, py]) => ({ x: X(px), y: Y(py) })),
            rotation: 0,
            strokeLevel: 0, strokeWidth: 0,
            dashLength: 0, dashGap: 0,
            closed: true,
            fillLevel: loop.fillLevel !== undefined ? loop.fillLevel : (loop.isHole ? 255 : 0),
            fillNone: false, fillStyle: "solid",
            locked: false, positionLocked: false,
            layerId, order: s.objects.length,
          };
          // §2-3: 곡선 스팬 포함 루프 → closed curve, 전 직선 → closed polyline.
          const shape = loop.curved
            ? applyNewObjectStyleDefaults({ ...base, type: "curve" })
            : applyNewObjectStyleDefaults({ ...base, type: "polyline", arrowHead: "none", rounded: false, cornerRadius: 10 });
          pushObj(shape, comp);
        }
      }

      // 🔗 묶기: 기본은 그룹 안 묶음(각각 분리). 단, 사용자가 묶음선으로 지정한
      // bundle의 멤버 객체들만 하나의 그룹으로 만든다(제외된 컴포넌트는 빠짐).
      for (const bundle of bundles) {
        const ids = [];
        for (const ci of bundle) {
          if (excluded.has(ci)) continue;
          const comp = analysis.components[ci];
          const compIds = addedByComp.get(comp);
          if (compIds) ids.push(...compIds);
        }
        if (ids.length >= 2) {
          const groupId = `grp_${stamp}_b${++idCounter}`;
          for (const id of ids) { const o = s.objects.find((x) => x.id === id); if (o) o.groupId = groupId; }
          s.groups.push({ id: groupId, memberIds: [...ids] });
        }
      }

      s.undoStack.push(snapshot);
      s.redoStack = [];
      s.selectedIds = addedIds;
      s.targetedId = null;
      s.activeTool = "V";
    });
    close();
  }

  /* ===== 이벤트 배선 ===== */
  openButton.addEventListener("click", () => {
    overlay.hidden = false;
    dropzone.focus();
  });
  overlay.querySelector("#objectify-cancel").addEventListener("click", close);
  overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !overlay.hidden) close(); });
  document.addEventListener("keydown", (event) => {
    if (!overlay.hidden && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
      event.stopPropagation();
    }
  }, true);
  document.addEventListener("paste", (event) => {
    if (overlay.hidden) return;
    const imageItem = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    const imageFile = imageItem.getAsFile();
    if (!imageFile) return;
    event.preventDefault();
    event.stopPropagation();
    loadFile(imageFile);
  }, true);

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener("change", () => { loadFile(fileInput.files?.[0]); fileInput.value = ""; });
  // 드래그/드롭은 stage 전체에 — 이미지가 이미 있어도 새 파일을 떨궈 교체할 수 있다.
  for (const type of ["dragenter", "dragover"]) {
    stage.addEventListener(type, (event) => { event.preventDefault(); stage.classList.add("is-dragover"); });
  }
  for (const type of ["dragleave", "drop"]) {
    stage.addEventListener(type, (event) => { event.preventDefault(); stage.classList.remove("is-dragover"); });
  }
  stage.addEventListener("drop", (event) => loadFile(event.dataTransfer.files?.[0]));

  // 슬라이더 값 표시 + 자동 재분석 (250ms 디바운스)
  const sliderUnits = { dilate: "px", minarea: "px²", textsize: "px", eps: "" };
  for (const [name, input] of Object.entries(sliders)) {
    const output = overlay.querySelector(`#objectify-${name}-value`);
    input.addEventListener("input", () => {
      const value = name === "eps" ? (Number(input.value) / 10).toFixed(1) : input.value;
      output.textContent = value + sliderUnits[name];
      scheduleAnalyze();
    });
  }
  removeGridInput.addEventListener("change", scheduleAnalyze);
  grayLevelsInput.addEventListener("change", scheduleAnalyze);
  analyzeButton.addEventListener("click", analyze);
  insertButton.addEventListener("click", insertObjects);

  // 전처리 툴바: 자르기·묶기·브러시굵기·지우기·전체보기
  cutToggle.addEventListener("click", () => setBrushMode(brushMode === "cut" ? null : "cut"));
  groupToggle.addEventListener("click", () => setBrushMode(brushMode === "group" ? null : "group"));
  cutWidthInput.addEventListener("input", () => { cutWidthValue.textContent = cutWidthInput.value + "px"; });
  cutClearButton.addEventListener("click", () => {
    if (!cutStrokes.length) return;
    cutStrokes = [];
    cutClearButton.disabled = true;
    analyze();                 // 절단 해제 → 재분석
  });
  groupClearButton.addEventListener("click", () => {
    if (!groupStrokes.length) return;
    groupStrokes = []; bundles = [];
    groupClearButton.disabled = true;
    drawPreview();             // 묶음 해제 → 재매핑만
  });
  zoomResetButton.addEventListener("click", fitView);
}

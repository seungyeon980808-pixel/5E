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

import { applyNewObjectStyleDefaults } from "./style-mode.js?v=0.54.1";
import { DEFAULT_TEXT_FONT } from "./state.js?v=0.54.1";
import { vectorizeImage } from "./image-vectorize.js?v=0.54.1";
import { measureFormula } from "./formula.js?v=0.54.1";

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
            <button id="objectify-zoom-reset" type="button" class="modal-btn">전체 보기</button>
            <span class="modal-label" id="objectify-tool-hint" style="font-weight:normal;color:#6e7781;margin:0;">휠=확대/축소 · 드래그=이동 · 클릭=제외</span>
          </div>
          <p class="objectify-description" id="objectify-legend" hidden style="margin:0;">
            <span id="objectify-legend-body">
              <span style="color:#0969da;">■ 도형</span>&nbsp;
              <span style="color:#e35d6a;">■ 글자 추정</span>
            </span>&nbsp;·&nbsp;클릭=제외/포함 전환.
          </p>
        </div>
        <div class="objectify-right">
          <p class="objectify-description" style="margin:0;">이미지 속 그림을 내 도구로 다시 편집할 수 있는 객체로 분리합니다. 흰 배경은 자동으로 투명 처리됩니다. 아래 설정으로 인식을 조정하고(가까운 잉크를 묶는 거리·무시할 최소 크기·글자 처리·회색 단계 보존 등), 미리보기에서 원치 않는 조각을 <b>클릭</b>해 제외한 뒤 <b>객체로 삽입</b>하세요.</p>
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
          <label class="modal-field modal-field-row"><input id="objectify-advanced" type="checkbox" /><span class="modal-label">[고급·미완성 ⚠] 선·도형 승격 — 실험 기능, 결과가 부정확할 수 있음 (획→선 객체, 사각→상자, 테두리+채움 통합)</span></label>
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
/* 외부 모듈용 진입점(기출 라이브러리 등): 모달을 열고 파일을 바로 로드.
 * initImageObjectify()가 실행된 뒤에만 동작 — 준비 전이면 false 반환. */
let _openWithFile = null;
export function openObjectifyWithFile(file) {
  if (!_openWithFile) return false;
  _openWithFile(file);
  return true;
}

export function initImageObjectify(state) {
  const openButton = document.getElementById("image-objectify-open");
  if (!openButton) return;

  const overlay = buildModal();
  const fileInput = overlay.querySelector("#objectify-file");
  const dropzone = overlay.querySelector("#objectify-dropzone");
  const preview = overlay.querySelector("#objectify-preview");
  const legend = overlay.querySelector("#objectify-legend");
  const legendBody = overlay.querySelector("#objectify-legend-body");
  const status = overlay.querySelector("#objectify-status");
  const analyzeButton = overlay.querySelector("#objectify-analyze");
  const insertButton = overlay.querySelector("#objectify-insert");
  const removeGridInput = overlay.querySelector("#objectify-removegrid");
  const grayLevelsInput = overlay.querySelector("#objectify-graylevels");
  const referenceInput = overlay.querySelector("#objectify-reference");
  const advancedInput = overlay.querySelector("#objectify-advanced");
  const sliders = {
    dilate: overlay.querySelector("#objectify-dilate"),
    minarea: overlay.querySelector("#objectify-minarea"),
    textsize: overlay.querySelector("#objectify-textsize"),
    eps: overlay.querySelector("#objectify-eps"),
  };

  const stage = overlay.querySelector("#objectify-stage");
  const tools = overlay.querySelector("#objectify-tools");
  const zoomResetButton = overlay.querySelector("#objectify-zoom-reset");

  let sourceCanvas = null;   // 처리용 캔버스 (흰 배경 합성, 최대 2000px)
  let sourceDataUrl = null;  // 참고 이미지 삽입용 원본 dataURL
  let analysis = null;       // vectorizeImage 결과
  let previewPaths = [];     // 컴포넌트별 Path2D 캐시
  let excluded = new Set();  // 미리보기에서 제외한 컴포넌트 index
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
      advancedShapes: advancedInput.checked,
    };
  }

  // 판정별 미리보기 색(명세 §4): 선=파랑, rect=초록, 균일띠=청록, 원=보라,
  // 텍스트=주황, 폴백=기존 도형(파랑)/글자(빨강) 표시 그대로 유지.
  const JUDGMENT_COLORS = {
    strokes: "#0969da", rect: "#2da44e", strokedRegion: "#0e7490", ellipse: "#8250df", text: "#bf5b04",
  };
  function judgmentColor(comp) {
    if (comp.isText) return advancedInput.checked ? JUDGMENT_COLORS.text : "#e35d6a";
    if (!advancedInput.checked) return "#0969da"; // 고급 꺼짐 = 기존 파랑 표시 그대로
    if (comp.ellipse) return JUDGMENT_COLORS.ellipse;
    if (comp.rect) return JUDGMENT_COLORS.rect;
    if (comp.strokedRegion) return JUDGMENT_COLORS.strokedRegion;
    if (comp.strokes) return JUDGMENT_COLORS.strokes;
    return "#0969da"; // 폴백(현행 조각)
  }

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
    analysis.components.forEach((comp, index) => {
      const path = previewPaths[index];
      if (!path) return;
      const color = excluded.has(index) ? "#6e7781" : judgmentColor(comp);
      ctx.globalAlpha = excluded.has(index) ? 0.22 : 0.58;
      if (comp.strokes && !excluded.has(index)) {
        // 획 판정: 채움 대신 굵은 선으로 강조(가는 선은 fill로는 안 보임).
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(3, 5 / view.zoom);
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.stroke(path);
        if (comp.loops.length) { ctx.fillStyle = color; ctx.fill(path, "evenodd"); }
      } else {
        ctx.fillStyle = color;
        ctx.fill(path, "evenodd");
      }
      ctx.globalAlpha = 1;
      if (excluded.has(index)) {
        const [x0, y0, x1, y1] = comp.bbox;
        ctx.strokeStyle = "#6e7781"; ctx.lineWidth = lw;
        ctx.setLineDash([4 * lw, 3 * lw]);
        ctx.strokeRect(x0 - 1.5, y0 - 1.5, x1 - x0 + 3, y1 - y0 + 3);
        ctx.setLineDash([]);
      }
    });
    stage.classList.add("has-image");   // 이미지 있음 → 안내 오버레이 숨김(미리보기와 통합)
    tools.hidden = false;
    legend.hidden = false;
    updateLegend();
  }

  // 고급 토글 상태에 맞춰 범례 갱신(명세 §4). 꺼짐 = 기존 3색 그대로.
  function updateLegend() {
    if (!legendBody) return;
    legendBody.innerHTML = advancedInput.checked
      ? `<span style="color:${JUDGMENT_COLORS.strokes};">■ 선</span>&nbsp;
         <span style="color:${JUDGMENT_COLORS.rect};">■ 상자</span>&nbsp;
         <span style="color:${JUDGMENT_COLORS.strokedRegion};">■ 균일 띠</span>&nbsp;
         <span style="color:${JUDGMENT_COLORS.ellipse};">■ 원</span>&nbsp;
         <span style="color:${JUDGMENT_COLORS.text};">■ 글자 추정</span>`
      : `<span style="color:#0969da;">■ 도형</span>&nbsp;
         <span style="color:#e35d6a;">■ 글자 추정</span>`;
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
        analysis = vectorizeImage(imageData, currentOptions());
        excluded = new Set();
        previewPaths = analysis.components.map((comp) => {
          const path = new Path2D();
          if (comp.ellipse) {
            const e = comp.ellipse;
            path.ellipse(e.cx, e.cy, e.rx, e.ry, (e.rotationDeg || 0) * Math.PI / 180, 0, Math.PI * 2);
            return path;
          }
          // §8 임무 C 미리보기: rect/strokedRegion/strokes 판정 하이라이트(명세 §4).
          if (comp.rect) {
            const r = comp.rect;
            const rot = (r.rotationDeg || 0) * Math.PI / 180;
            const cos = Math.cos(rot), sin = Math.sin(rot);
            const hw = r.w / 2, hh = r.h / 2;
            const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
              .map(([dx, dy]) => [r.cx + dx * cos - dy * sin, r.cy + dx * sin + dy * cos]);
            path.moveTo(corners[0][0], corners[0][1]);
            for (let i = 1; i < corners.length; i += 1) path.lineTo(corners[i][0], corners[i][1]);
            path.closePath();
            return path;
          }
          if (comp.strokedRegion) {
            const pts = comp.strokedRegion.points;
            path.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i += 1) path.lineTo(pts[i].x, pts[i].y);
            path.closePath();
            return path;
          }
          if (comp.strokes) {
            for (const sp of comp.strokes) {
              path.moveTo(sp.points[0][0], sp.points[0][1]);
              for (let i = 1; i < sp.points.length; i += 1) path.lineTo(sp.points[i][0], sp.points[i][1]);
            }
            for (const loop of comp.loops) {
              path.moveTo(loop.points[0][0], loop.points[0][1]);
              for (let i = 1; i < loop.points.length; i += 1) path.lineTo(loop.points[i][0], loop.points[i][1]);
              path.closePath();
            }
            return path;
          }
          for (const loop of comp.loops) {
            path.moveTo(loop.points[0][0], loop.points[0][1]);
            for (let i = 1; i < loop.points.length; i += 1) path.lineTo(loop.points[i][0], loop.points[i][1]);
            path.closePath();
          }
          return path;
        });
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
        // 새 이미지 → 팬 상태 초기화 + 전체 보기
        panning = null; needFit = true;
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

  /* ----- 포인터: 빈 곳 드래그=이동 · 클릭=제외 ----- */
  preview.addEventListener("mousedown", (event) => {
    if (!analysis || event.button !== 0) return;
    pointerMoved = false;
    panning = { sx: event.clientX, sy: event.clientY, ox0: view.ox, oy0: view.oy };
    stage.classList.add("is-panning");
  });
  window.addEventListener("mousemove", (event) => {
    if (panning) {
      if (Math.abs(event.clientX - panning.sx) + Math.abs(event.clientY - panning.sy) > 3) pointerMoved = true;
      view.ox = panning.ox0 + (event.clientX - panning.sx);
      view.oy = panning.oy0 + (event.clientY - panning.sy);
      applyView();
    }
  });
  window.addEventListener("mouseup", () => {
    panning = null;
    stage.classList.remove("is-panning");
  });
  // 클릭=제외/포함 (드래그가 아니었을 때만)
  preview.addEventListener("click", (event) => {
    if (!analysis || pointerMoved) return;
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
      const pushObj = (obj) => {
        s.objects.push(obj);
        addedIds.push(obj.id);
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
            pushObj(imgObj);
            continue;
          }
          // 크롭 실패(초소형) 시 아래 폴리곤 벡터화로 폴백.
        }
        // 명세 §5: textMode='replace'는 토글과 무관한 무조건 변경 — text 대신
        // formula 객체(placeholder 순번, text-editor.js 새 수식 생성 선례 필드).
        if (comp.isText && textMode === "replace") {
          const [bx0, by0, , by1] = comp.bbox;
          const fontSize = Math.min(12, Math.max(2.5, round3((by1 - by0) * scale)));
          const source = replacedLabels.get(comp) || "A";
          const fontFamily = DEFAULT_TEXT_FONT;
          const m = measureFormula(source, fontSize, { family: fontFamily, weight: "normal", style: "normal" });
          const formulaObject = applyNewObjectStyleDefaults({
            id: `obj_${stamp}_vectext${++idCounter}`,
            type: "formula",
            x: X(bx0), y: Y(by0),
            source, rawSource: source,
            w: m.w, h: m.h,
            fontSize, fontFamily,
            fontWeight: "normal", fontStyle: "normal",
            italic: false, letterSpacing: null,
            underline: false, strikeout: false,
            rotation: 0, locked: false, positionLocked: false,
            layerId, order: s.objects.length,
          });
          pushObj(formulaObject);
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
          pushObj(ellipseObject);
          continue;
        }
        // §8 임무 C 매핑(명세 §3): 사각 링/채움 사각 → 네이티브 rect 1객체
        // (ellipse 삽입의 px→mm scale 선례를 그대로 따른다).
        if (comp.rect) {
          const r = comp.rect;
          const cxW = ox + r.cx * scale, cyW = oy + r.cy * scale;
          const wW = r.w * scale, hW = r.h * scale;
          const rectObject = applyNewObjectStyleDefaults({
            id: `obj_${stamp}_vecrect${++idCounter}`,
            type: "rect",
            x: round3(cxW - wW / 2), y: round3(cyW - hW / 2),
            w: round3(wW), h: round3(hW),
            rotation: round3(r.rotationDeg || 0),
            strokeLevel: r.strokeLevel, strokeWidth: round3(r.strokeWidthPx * scale),
            // fitComponentRect은 솔리드(hasFill:false)=잉크 실측, 링(hasFill:true)=구멍 실측
            // 을 모두 fillLevel에 담는다 → 항상 실측 채움 사용(헌법 §0-2 겉보기 동일).
            fillLevel: r.fillLevel,
            fillNone: false, fillStyle: "solid",
            dashLength: 0, dashGap: 0,
            labelType: "label",
            locked: false, positionLocked: false,
            layerId, order: s.objects.length,
          });
          pushObj(rectObject);
          continue;
        }
        // 비사각 균일 띠(삼각 링 등) → stroke+fill 한 닫힌 polyline 1객체.
        if (comp.strokedRegion) {
          const sr = comp.strokedRegion;
          const polyObject = applyNewObjectStyleDefaults({
            id: `obj_${stamp}_vecband${++idCounter}`,
            type: "polyline",
            points: sr.points.map((p) => ({ x: X(p.x), y: Y(p.y) })),
            rotation: 0,
            strokeLevel: sr.strokeLevel, strokeWidth: round3(sr.strokeWidthPx * scale),
            arrowHead: "none", dashLength: 0, dashGap: 0,
            closed: true,
            fillLevel: sr.fillLevel, fillNone: false, fillStyle: "solid",
            rounded: false, cornerRadius: 10,
            locked: false, positionLocked: false,
            layerId, order: s.objects.length,
          });
          pushObj(polyObject);
          continue;
        }
        // 가는 획 망(§2 ⑤): 경로별 line/polyline/curve + 잔여 잉크는 아래 loops로.
        if (comp.strokes) {
          for (const sp of comp.strokes) {
            const strokeWidth = round3(sp.thicknessPx * scale);
            let strokeObj;
            if (sp.kind === "line") {
              const [p1, p2] = sp.points;
              strokeObj = applyNewObjectStyleDefaults({
                id: `obj_${stamp}_vecline${++idCounter}`,
                type: "line",
                p1: { x: X(p1[0]), y: Y(p1[1]) }, p2: { x: X(p2[0]), y: Y(p2[1]) },
                rotation: 0,
                strokeLevel: sp.strokeLevel !== undefined ? sp.strokeLevel : 0, strokeWidth,
                lineMode: "solid", lineStyle: "solid", arrowVariant: "right", dimensionVariant: "basic",
                arrowHead: "none", dashLength: 0, dashGap: 0,
                locked: false, positionLocked: false,
                layerId, order: s.objects.length,
              });
            } else if (sp.kind === "curve") {
              strokeObj = applyNewObjectStyleDefaults({
                id: `obj_${stamp}_veccurve${++idCounter}`,
                type: "curve",
                points: sp.points.map(([px, py]) => ({ x: X(px), y: Y(py) })),
                rotation: 0,
                strokeLevel: sp.strokeLevel !== undefined ? sp.strokeLevel : 0, strokeWidth,
                arrowHead: "none", dashLength: 0, dashGap: 0,
                closed: false, fillLevel: 255, fillNone: true, fillStyle: "solid",
                locked: false, positionLocked: false,
                layerId, order: s.objects.length,
              });
            } else {
              strokeObj = applyNewObjectStyleDefaults({
                id: `obj_${stamp}_vecpoly${++idCounter}`,
                type: "polyline",
                points: sp.points.map(([px, py]) => ({ x: X(px), y: Y(py) })),
                rotation: 0,
                strokeLevel: sp.strokeLevel !== undefined ? sp.strokeLevel : 0, strokeWidth,
                arrowHead: "none", dashLength: 0, dashGap: 0,
                closed: false, fillLevel: 255, fillNone: true, fillStyle: "solid",
                rounded: false, cornerRadius: 10,
                locked: false, positionLocked: false,
                layerId, order: s.objects.length,
              });
            }
            pushObj(strokeObj);
          }
          // 잔여 잉크는 현행 조각(폴백 폴리곤)으로 함께 방출 — 아래 loops 루프가 처리.
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
          pushObj(shape);
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
  _openWithFile = (file) => {
    overlay.hidden = false;
    loadFile(file);
  };
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
  advancedInput.addEventListener("change", scheduleAnalyze);
  analyzeButton.addEventListener("click", analyze);
  insertButton.addEventListener("click", insertObjects);

  // 전처리 툴바: 전체보기
  zoomResetButton.addEventListener("click", fitView);
}

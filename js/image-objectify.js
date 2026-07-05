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

import { applyNewObjectStyleDefaults } from "./style-mode.js?v=0.42.0";
import { DEFAULT_TEXT_FONT } from "./state.js?v=0.42.0";
import { vectorizeImage } from "./image-vectorize.js?v=0.42.0";

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

/* ===== 모달 DOM ===== */
function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal modal-objectify" role="dialog" aria-modal="true" aria-labelledby="objectify-title">
      <h2 class="modal-title" id="objectify-title">이미지 객체화</h2>
      <p class="objectify-description">떨어져 있는 잉크 덩어리를 각각 편집 가능한 객체로 분리합니다. 흰 배경은 벡터화 과정에서 자동으로 제거(투명)됩니다. 붙어 있는 도형은 한 덩어리가 되며, 삽입 후 지우개·삭제로 마무리하세요.</p>
      <input id="objectify-file" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" hidden />
      <div id="objectify-dropzone" class="objectify-dropzone" role="button" tabindex="0">PNG/JPG/WEBP 파일 선택, 끌어 놓기 또는 Ctrl+V 붙여넣기</div>
      <canvas id="objectify-preview" class="objectify-preview" width="560" height="240" hidden style="cursor:pointer;"></canvas>
      <p class="objectify-description" id="objectify-legend" hidden>
        <span style="color:#0969da;">■ 면(도형)</span>&nbsp;
        <span style="color:#1a7f37;">■ 선(획)</span>&nbsp;
        <span style="color:#e35d6a;">■ 글자 추정</span>&nbsp;·&nbsp;미리보기에서 덩어리를 클릭하면 제외/포함이 전환됩니다.
      </p>
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
        <span style="display:flex;gap:14px;flex-wrap:wrap;">
          <label class="modal-field-row" style="margin:0;"><input type="radio" name="objectify-textmode" value="image" checked /><span class="modal-label" style="font-weight:normal;">원본 이미지로 유지 (권장)</span></label>
          <label class="modal-field-row" style="margin:0;"><input type="radio" name="objectify-textmode" value="keep" /><span class="modal-label" style="font-weight:normal;">남기기 (글자 모양 그대로)</span></label>
          <label class="modal-field-row" style="margin:0;"><input type="radio" name="objectify-textmode" value="remove" /><span class="modal-label" style="font-weight:normal;">지우기</span></label>
          <label class="modal-field-row" style="margin:0;"><input type="radio" name="objectify-textmode" value="replace" /><span class="modal-label" style="font-weight:normal;">텍스트 객체로 대체 (A, B, C…)</span></label>
        </span>
      </div>
      <label class="modal-field modal-field-row"><input id="objectify-graylevels" type="checkbox" checked /><span class="modal-label">회색 단계 보존 (흰/회색/검정 다단계 인식)</span></label>
      <label class="modal-field modal-field-row"><input id="objectify-removegrid" type="checkbox" /><span class="modal-label">격자·눈금선 제거 (그래프·도표용)</span></label>
      <label class="modal-field modal-field-row"><input id="objectify-reference" type="checkbox" /><span class="modal-label">원본 이미지를 반투명 배경으로 함께 삽입</span></label>
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

  let sourceCanvas = null;   // 처리용 캔버스 (흰 배경 합성, 최대 2000px)
  let sourceDataUrl = null;  // 참고 이미지 삽입용 원본 dataURL
  let analysis = null;       // vectorizeImage 결과
  let previewPaths = [];     // 컴포넌트별 Path2D 캐시
  let excluded = new Set();  // 미리보기에서 제외한 컴포넌트 index

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

  /* ----- 미리보기: 원본 흐리게 + 컴포넌트 채움 오버레이 ----- */
  function drawPreview() {
    if (!sourceCanvas || !analysis) return;
    preview.width = sourceCanvas.width;
    preview.height = sourceCanvas.height;
    const ctx = preview.getContext("2d");
    ctx.drawImage(sourceCanvas, 0, 0);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillRect(0, 0, preview.width, preview.height);
    analysis.components.forEach((comp, index) => {
      const entry = previewPaths[index];
      if (!entry) return;
      // 타입별 색: 글자=빨강, 획(선)=초록, 면=파랑, 제외=회색.
      const color = excluded.has(index) ? "#6e7781"
        : comp.isText ? "#e35d6a" : comp.strokes ? "#1a7f37" : "#0969da";
      ctx.globalAlpha = excluded.has(index) ? 0.30 : 0.72;
      if (entry.stroke) {
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, entry.width);
        ctx.lineJoin = "round"; ctx.lineCap = "round";
        ctx.stroke(entry.path);
      } else {
        ctx.fillStyle = color;
        ctx.fill(entry.path, "evenodd");
      }
      ctx.globalAlpha = 1;
      if (excluded.has(index)) {
        const [x0, y0, x1, y1] = comp.bbox;
        ctx.strokeStyle = "#6e7781";
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x0 - 1.5, y0 - 1.5, x1 - x0 + 3, y1 - y0 + 3);
        ctx.setLineDash([]);
      }
    });
    preview.hidden = false;
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
        analysis = vectorizeImage(imageData, currentOptions());
        excluded = new Set();
        previewPaths = analysis.components.map((comp) => {
          const path = new Path2D();
          // §2-5: 획은 채움이 아니라 중심선 stroke로 표시(초록).
          if (comp.strokes) {
            let maxW = 1;
            for (const st of comp.strokes) {
              const p = st.points;
              path.moveTo(p[0][0], p[0][1]);
              for (let i = 1; i < p.length; i += 1) path.lineTo(p[i][0], p[i][1]);
              if (st.closed) path.closePath();
              if (st.strokeWidthPx > maxW) maxW = st.strokeWidthPx;
            }
            return { path, stroke: true, width: maxW };
          }
          if (comp.ellipse) {
            const e = comp.ellipse;
            path.ellipse(e.cx, e.cy, e.rx, e.ry, (e.rotationDeg || 0) * Math.PI / 180, 0, Math.PI * 2);
            return { path, stroke: false };
          }
          for (const loop of comp.loops) {
            path.moveTo(loop.points[0][0], loop.points[0][1]);
            for (let i = 1; i < loop.points.length; i += 1) path.lineTo(loop.points[i][0], loop.points[i][1]);
            path.closePath();
          }
          return { path, stroke: false };
        });
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
        analyzeButton.disabled = false;
        analyze();
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ----- 미리보기 클릭 → 컴포넌트 제외/포함 토글 ----- */
  preview.addEventListener("click", (event) => {
    if (!analysis) return;
    const rect = preview.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (preview.width / rect.width);
    const y = (event.clientY - rect.top) * (preview.height / rect.height);
    let hitIndex = -1;
    let hitArea = Infinity;
    analysis.components.forEach((comp, index) => {
      const [x0, y0, x1, y1] = comp.bbox;
      if (x < x0 - 2 || x > x1 + 2 || y < y0 - 2 || y > y1 + 2) return;
      if (comp.area < hitArea) { hitArea = comp.area; hitIndex = index; }
    });
    if (hitIndex < 0) return;
    if (excluded.has(hitIndex)) excluded.delete(hitIndex);
    else excluded.add(hitIndex);
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
            s.objects.push(imgObj);
            addedIds.push(imgObj.id);
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
          s.objects.push(textObject);
          addedIds.push(textObject.id);
          continue;
        }
        // §2-5: 획(선) → line/polyline/curve — 면(폴리곤)이 아니라 획으로.
        if (comp.strokes) {
          for (const st of comp.strokes) {
            const sw = Math.max(0.12, round3(st.strokeWidthPx * scale));
            if (st.kind === "line") {
              const [a, b] = st.points;
              const lineObj = applyNewObjectStyleDefaults({
                id: `obj_${stamp}_vecln${++idCounter}`, type: "line",
                p1: { x: X(a[0]), y: Y(a[1]) }, p2: { x: X(b[0]), y: Y(b[1]) },
                rotation: 0, strokeLevel: st.strokeLevel, strokeWidth: sw,
                lineMode: "solid", lineStyle: "solid", arrowVariant: "right", dimensionVariant: "basic",
                arrowHead: "none", dashLength: 0, dashGap: 0,
                locked: false, positionLocked: false, layerId, order: s.objects.length,
              });
              s.objects.push(lineObj); addedIds.push(lineObj.id);
            } else {
              const base = {
                id: `obj_${stamp}_vecst${++idCounter}`,
                type: st.kind === "curve" ? "curve" : "polyline",
                points: st.points.map(([px, py]) => ({ x: X(px), y: Y(py) })),
                rotation: 0, strokeLevel: st.strokeLevel, strokeWidth: sw,
                dashLength: 0, dashGap: 0, closed: !!st.closed,
                fillNone: true, fillLevel: 255, fillStyle: "solid",   // 획: 채움 없음(테두리만)
                locked: false, positionLocked: false, layerId, order: s.objects.length,
              };
              if (base.type === "polyline") { base.arrowHead = "none"; base.rounded = false; base.cornerRadius = 10; }
              const stObj = applyNewObjectStyleDefaults(base);
              s.objects.push(stObj); addedIds.push(stObj.id);
            }
          }
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
          s.objects.push(ellipseObject);
          addedIds.push(ellipseObject.id);
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
          s.objects.push(shape);
          addedIds.push(shape.id);
        }
      }

      // 그룹으로 묶지 않는다 (사용자 요구): 객체화의 목적이 '각각 분리'이므로
      // 삽입 직후 그룹은 오히려 방해. 다중 선택 상태만 남겨 원하면 바로 함께
      // 옮길 수 있게 하되, 빈 곳 클릭 후 하나를 누르면 그 객체만 선택된다.
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
  for (const type of ["dragenter", "dragover"]) {
    dropzone.addEventListener(type, (event) => { event.preventDefault(); dropzone.classList.add("is-dragover"); });
  }
  for (const type of ["dragleave", "drop"]) {
    dropzone.addEventListener(type, (event) => { event.preventDefault(); dropzone.classList.remove("is-dragover"); });
  }
  dropzone.addEventListener("drop", (event) => loadFile(event.dataTransfer.files?.[0]));

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
}

/* ===== IMAGE OBJECTIFY (local image -> editable line rough draft) ===== */

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_PROCESS_DIMENSION = 1600;
let idCounter = 0;
const OBJECTIFY_STROKE_WIDTH = 0.5;

function cloneObjects(objects) {
  return JSON.parse(JSON.stringify(objects));
}

function buildDarkMask(canvas, threshold) {
  const { width, height } = canvas;
  const rgba = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  const dark = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p += 1) {
    dark[p] = (rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114) < threshold ? 1 : 0;
  }
  return dark;
}

function detectClosedShapes(dark, width, height, minLength) {
  const labels = new Uint32Array(width * height);
  const queue = new Int32Array(width * height);
  const shapes = [];
  const minimumSize = Math.max(12, minLength * 0.6);
  let componentId = 0;

  for (let start = 0; start < dark.length; start += 1) {
    if (dark[start] || labels[start]) continue;
    componentId += 1;
    let head = 0, tail = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let touchesEdge = false;
    labels[start] = componentId;
    queue[tail++] = start;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width, y = (index / width) | 0;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;
      if (x > 0 && !dark[index - 1] && !labels[index - 1]) {
        labels[index - 1] = componentId; queue[tail++] = index - 1;
      }
      if (x < width - 1 && !dark[index + 1] && !labels[index + 1]) {
        labels[index + 1] = componentId; queue[tail++] = index + 1;
      }
      if (y > 0 && !dark[index - width] && !labels[index - width]) {
        labels[index - width] = componentId; queue[tail++] = index - width;
      }
      if (y < height - 1 && !dark[index + width] && !labels[index + width]) {
        labels[index + width] = componentId; queue[tail++] = index + width;
      }
    }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    if (touchesEdge || w < minimumSize || h < minimumSize || tail < minimumSize * minimumSize * 0.35) continue;

    const fillRatio = tail / (w * h);
    let type = null;
    if (fillRatio >= 0.86) {
      type = "rect";
    } else if (fillRatio >= 0.68 && fillRatio <= 0.86) {
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      const rx = w / 2, ry = h / 2;
      let expected = 0, mismatch = 0;
      const step = Math.max(1, Math.ceil(Math.max(w, h) / 160));
      for (let y = minY; y <= maxY; y += step) {
        for (let x = minX; x <= maxX; x += step) {
          const insideEllipse = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
          const insideRegion = labels[y * width + x] === componentId;
          if (insideEllipse) expected += 1;
          if (insideEllipse !== insideRegion) mismatch += 1;
        }
      }
      if (expected && mismatch / expected <= 0.18) type = "ellipse";
    }
    if (type) shapes.push({ type, x: minX, y: minY, w, h });
  }
  return shapes;
}

function maskShapes(dark, width, height, shapes) {
  const masked = dark.slice();
  for (const shape of shapes) {
    const padding = Math.max(3, Math.round(Math.min(shape.w, shape.h) * 0.04));
    const left = Math.max(0, shape.x - padding), top = Math.max(0, shape.y - padding);
    const right = Math.min(width - 1, shape.x + shape.w - 1 + padding);
    const bottom = Math.min(height - 1, shape.y + shape.h - 1 + padding);
    if (shape.type === "rect") {
      for (let y = top; y <= bottom; y += 1) {
        if (y <= shape.y + padding || y >= shape.y + shape.h - 1 - padding) {
          masked.fill(0, y * width + left, y * width + right + 1);
        } else {
          masked.fill(0, y * width + left, y * width + Math.min(right + 1, shape.x + padding + 1));
          masked.fill(0, y * width + Math.max(left, shape.x + shape.w - 1 - padding), y * width + right + 1);
        }
      }
    } else {
      const cx = shape.x + (shape.w - 1) / 2, cy = shape.y + (shape.h - 1) / 2;
      const rx = Math.max(1, shape.w / 2), ry = Math.max(1, shape.h / 2);
      const band = padding / Math.min(rx, ry);
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          const radius = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
          if (Math.abs(radius - 1) <= band) masked[y * width + x] = 0;
        }
      }
    }
  }
  return masked;
}

function mergeLineSegments(segments, minLength) {
  const normalized = segments.map((line) => {
    const rawAngle = Math.atan2(line.y2 - line.y1, line.x2 - line.x1);
    const angle = (rawAngle + Math.PI) % Math.PI;
    const ux = Math.cos(angle), uy = Math.sin(angle);
    const offset = -uy * line.x1 + ux * line.y1;
    const a = ux * line.x1 + uy * line.y1, b = ux * line.x2 + uy * line.y2;
    return { ...line, angle, ux, uy, offset, start: Math.min(a, b), end: Math.max(a, b) };
  }).sort((a, b) => (b.end - b.start) - (a.end - a.start));
  const merged = [];
  const angleTolerance = 10 * Math.PI / 180;
  const maxGap = Math.max(12, minLength * 0.5);
  for (const line of normalized) {
    let target = null;
    let projectedStart = 0, projectedEnd = 0;
    for (const other of merged) {
      let angleDistance = Math.abs(other.angle - line.angle) % Math.PI;
      angleDistance = Math.min(angleDistance, Math.PI - angleDistance);
      if (angleDistance > angleTolerance) continue;
      const midX = (line.x1 + line.x2) / 2, midY = (line.y1 + line.y2) / 2;
      if (Math.abs(-other.uy * midX + other.ux * midY - other.offset) > 10) continue;
      const a = other.ux * line.x1 + other.uy * line.y1;
      const b = other.ux * line.x2 + other.uy * line.y2;
      const start = Math.min(a, b), end = Math.max(a, b);
      if (start > other.end + maxGap || end < other.start - maxGap) continue;
      target = other;
      projectedStart = start;
      projectedEnd = end;
      break;
    }
    if (!target) {
      merged.push({ ...line });
      continue;
    }
    target.start = Math.min(target.start, projectedStart);
    target.end = Math.max(target.end, projectedEnd);
  }
  return merged.map((line) => ({
    x1: line.ux * line.start - line.uy * line.offset,
    y1: line.uy * line.start + line.ux * line.offset,
    x2: line.ux * line.end - line.uy * line.offset,
    y2: line.uy * line.end + line.ux * line.offset,
  })).filter((line) => Math.hypot(line.x2 - line.x1, line.y2 - line.y1) >= minLength);
}

function detectLineSegments(dark, width, height, minLength) {

  const edges = [];
  const sampleStep = Math.max(1, Math.ceil(Math.sqrt((width * height) / 250000)));
  for (let y = 1; y < height - 1; y += sampleStep) {
    for (let x = 1; x < width - 1; x += sampleStep) {
      const p = y * width + x;
      if (!dark[p]) continue;
      if (!dark[p - 1] || !dark[p + 1] || !dark[p - width] || !dark[p + width]) edges.push({ x, y });
    }
  }
  if (edges.length < 2) return [];

  const thetaCount = 90;
  const diagonal = Math.ceil(Math.hypot(width, height));
  const rhoCount = diagonal * 2 + 1;
  const accumulator = new Uint32Array(thetaCount * rhoCount);
  const trig = Array.from({ length: thetaCount }, (_, i) => {
    const angle = i * 2 * Math.PI / 180;
    return { cos: Math.cos(angle), sin: Math.sin(angle) };
  });
  const pointStride = Math.max(1, Math.ceil(edges.length / 20000));
  for (let p = 0; p < edges.length; p += pointStride) {
    const point = edges[p];
    for (let t = 0; t < thetaCount; t += 1) {
      const rho = Math.round(point.x * trig[t].cos + point.y * trig[t].sin) + diagonal;
      accumulator[t * rhoCount + rho] += 1;
    }
  }

  const voteFloor = Math.max(20, Math.round(minLength / Math.max(1, sampleStep * 1.5)));
  const peaks = [];
  for (let t = 0; t < thetaCount; t += 1) {
    for (let rho = 0; rho < rhoCount; rho += 1) {
      const votes = accumulator[t * rhoCount + rho];
      if (votes >= voteFloor) peaks.push({ t, rho: rho - diagonal, votes });
    }
  }
  peaks.sort((a, b) => b.votes - a.votes);

  const accepted = [];
  for (const peak of peaks) {
    if (accepted.length >= 60) break;
    if (accepted.some((other) => {
      const thetaDistance = Math.abs(other.t - peak.t);
      if (thetaDistance <= 8) return Math.abs(other.rho - peak.rho) <= 14;
      return thetaDistance >= thetaCount - 8 && Math.abs(other.rho + peak.rho) <= 14;
    })) continue;
    const { cos, sin } = trig[peak.t];
    const alongX = -sin, alongY = cos;
    const projected = [];
    for (const point of edges) {
      if (Math.abs(point.x * cos + point.y * sin - peak.rho) <= Math.max(2, sampleStep * 1.5)) {
        projected.push(point.x * alongX + point.y * alongY);
      }
    }
    projected.sort((a, b) => a - b);
    if (projected.length < 2) continue;
    const maxGap = Math.max(6, minLength * 0.2);
    let runStart = projected[0];
    for (let i = 1; i <= projected.length; i += 1) {
      if (i < projected.length && projected[i] - projected[i - 1] <= maxGap) continue;
      const runEnd = projected[i - 1];
      if (runEnd - runStart >= minLength) {
        accepted.push({
          t: peak.t, rho: peak.rho,
          x1: cos * peak.rho + alongX * runStart,
          y1: sin * peak.rho + alongY * runStart,
          x2: cos * peak.rho + alongX * runEnd,
          y2: sin * peak.rho + alongY * runEnd,
        });
        if (accepted.length >= 60) break;
      }
      if (i < projected.length) runStart = projected[i];
    }
  }
  return mergeLineSegments(accepted, minLength);
}

function detectObjects(canvas, threshold, minLength) {
  const { width, height } = canvas;
  const dark = buildDarkMask(canvas, threshold);
  const shapes = detectClosedShapes(dark, width, height, minLength);
  const segments = detectLineSegments(maskShapes(dark, width, height, shapes), width, height, minLength);
  return { shapes, segments };
}

function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="modal modal-objectify" role="dialog" aria-modal="true" aria-labelledby="objectify-title">
      <h2 class="modal-title" id="objectify-title">이미지 객체화</h2>
      <p class="objectify-description">흑백 선 그림에서 직선 후보를 찾아 편집 가능한 초안으로 만듭니다. 완벽한 복원이 아닌 따라 그리기용 결과입니다.</p>
      <input id="objectify-file" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" hidden />
      <div id="objectify-dropzone" class="objectify-dropzone" role="button" tabindex="0">PNG/JPG/WEBP 파일 선택, 끌어 놓기 또는 Ctrl+V 붙여넣기</div>
      <canvas id="objectify-preview" class="objectify-preview" width="560" height="240" hidden></canvas>
      <div class="objectify-controls">
        <label class="modal-field">
          <span class="modal-label">임계값</span>
          <span class="objectify-range-row"><input id="objectify-threshold" type="range" min="0" max="255" value="180" /><output class="objectify-range-value">180</output></span>
        </label>
        <label class="modal-field">
          <span class="modal-label">최소 선 길이 (px)</span>
          <input id="objectify-min-length" class="modal-input" type="number" min="5" max="1000" step="1" value="30" />
        </label>
      </div>
      <label class="modal-field modal-field-row"><input id="objectify-reference" type="checkbox" checked /><span class="modal-label">원본 이미지를 반투명 배경으로 함께 삽입</span></label>
      <p id="objectify-status" class="objectify-status" role="status">이미지를 선택하세요.</p>
      <div class="modal-actions">
        <button id="objectify-cancel" type="button" class="modal-btn">취소</button>
        <button id="objectify-extract" type="button" class="modal-btn" disabled>도형 추출</button>
        <button id="objectify-insert" type="button" class="modal-btn modal-btn-primary" disabled>객체로 삽입</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

export function initImageObjectify(state) {
  const openButton = document.getElementById("image-objectify-open");
  if (!openButton) return;

  const overlay = buildModal();
  const fileInput = overlay.querySelector("#objectify-file");
  const dropzone = overlay.querySelector("#objectify-dropzone");
  const preview = overlay.querySelector("#objectify-preview");
  const threshold = overlay.querySelector("#objectify-threshold");
  const thresholdOutput = overlay.querySelector(".objectify-range-value");
  const minLength = overlay.querySelector("#objectify-min-length");
  const reference = overlay.querySelector("#objectify-reference");
  const status = overlay.querySelector("#objectify-status");
  const extractButton = overlay.querySelector("#objectify-extract");
  const insertButton = overlay.querySelector("#objectify-insert");
  let sourceCanvas = null;
  let sourceDataUrl = null;
  let segments = [];
  let shapes = [];

  const setStatus = (message, isError = false) => {
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  };
  const invalidate = () => {
    segments = [];
    shapes = [];
    insertButton.disabled = true;
  };
  const close = () => { overlay.hidden = true; };

  function drawPreview(showSegments = false) {
    if (!sourceCanvas) return;
    const ctx = preview.getContext("2d");
    preview.width = sourceCanvas.width;
    preview.height = sourceCanvas.height;
    ctx.drawImage(sourceCanvas, 0, 0);
    if (showSegments) {
      ctx.strokeStyle = "#e53935";
      ctx.lineWidth = Math.max(1, sourceCanvas.width / 700);
      for (const shape of shapes) {
        ctx.beginPath();
        if (shape.type === "rect") ctx.rect(shape.x, shape.y, shape.w, shape.h);
        else ctx.ellipse(shape.x + shape.w / 2, shape.y + shape.h / 2, shape.w / 2, shape.h / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const line of segments) {
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
      }
    }
    preview.hidden = false;
  }

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
        sourceCanvas.getContext("2d").drawImage(image, 0, 0, sourceCanvas.width, sourceCanvas.height);
        sourceDataUrl = reader.result;
        invalidate();
        drawPreview();
        extractButton.disabled = false;
        setStatus("이미지가 준비되었습니다. 도형 추출을 실행하세요.");
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function extract() {
    if (!sourceCanvas) return;
    extractButton.disabled = true;
    setStatus("직선 후보를 찾는 중입니다...");
    try {
      const minimum = Math.max(5, Number(minLength.value) || 30);
      ({ shapes, segments } = detectObjects(sourceCanvas, Number(threshold.value), minimum));
      drawPreview(true);
      insertButton.disabled = shapes.length + segments.length === 0;
      setStatus(shapes.length + segments.length ? `도형 ${shapes.length}개, 직선 ${segments.length}개를 찾았습니다.` : "조건에 맞는 도형을 찾지 못했습니다. 설정을 조정해 보세요.", shapes.length + segments.length === 0);
    } catch (error) {
      invalidate();
      setStatus(`추출 중 오류가 발생했습니다: ${error.message || error}`, true);
    } finally { extractButton.disabled = false; }
  }

  function insertObjects() {
    if (!sourceCanvas || shapes.length + segments.length === 0) return;
    const artboard = state.get().artboard;
    const scale = Math.min((artboard.w * 0.9) / sourceCanvas.width, (artboard.h * 0.9) / sourceCanvas.height);
    const fitted = {
      w: sourceCanvas.width * scale,
      h: sourceCanvas.height * scale,
    };
    fitted.x = -fitted.w / 2;
    fitted.y = -fitted.h / 2;
    const stamp = Date.now().toString(36);

    state.update((s) => {
      const snapshot = cloneObjects(s.objects);
      const layerId = s.activeLayerId;
      const addedIds = [];
      if (reference.checked) {
        s.objects.push({
          id: `obj_${stamp}_ref${++idCounter}`,
          type: "image", src: sourceDataUrl,
          x: fitted.x, y: fitted.y, w: fitted.w, h: fitted.h,
          opacity: 0.28, rotation: 0, locked: true, positionLocked: true,
          layerId, order: s.objects.length,
        });
      }
      for (const shape of shapes) {
        const object = {
          id: `obj_${stamp}_${shape.type}${++idCounter}`,
          type: shape.type,
          x: fitted.x + shape.x * scale, y: fitted.y + shape.y * scale,
          w: shape.w * scale, h: shape.h * scale,
          rotation: 0, strokeLevel: 0, strokeWidth: OBJECTIFY_STROKE_WIDTH,
          fillLevel: 214, fillNone: true, fillStyle: "solid",
          locked: false, positionLocked: false,
          layerId, order: s.objects.length,
        };
        s.objects.push(object);
        addedIds.push(object.id);
      }
      for (const segment of segments) {
        const line = {
          id: `obj_${stamp}_line${++idCounter}`,
          type: "line",
          p1: { x: fitted.x + segment.x1 * scale, y: fitted.y + segment.y1 * scale },
          p2: { x: fitted.x + segment.x2 * scale, y: fitted.y + segment.y2 * scale },
          strokeLevel: 0, strokeWidth: OBJECTIFY_STROKE_WIDTH,
          arrowHead: "none", dashLength: 0, dashGap: 0,
          layerId, order: s.objects.length,
          rotation: 0, locked: false, positionLocked: false,
        };
        s.objects.push(line);
        addedIds.push(line.id);
      }
      s.undoStack.push(snapshot);
      s.redoStack = [];
      s.selectedIds = addedIds;
      s.targetedId = null;
      s.activeTool = "V";
    });
    close();
  }

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
  threshold.addEventListener("input", () => { thresholdOutput.value = threshold.value; invalidate(); if (sourceCanvas) drawPreview(); });
  minLength.addEventListener("input", () => { invalidate(); if (sourceCanvas) drawPreview(); });
  extractButton.addEventListener("click", extract);
  insertButton.addEventListener("click", insertObjects);
}

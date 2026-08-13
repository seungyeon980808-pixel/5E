import { containedImageRect, createEditableLabelSession, labelOverlayDescriptors,
  normalizedContainedPoint } from "./editable-labels.mjs?v=1.5.2-phase4-labels";
import { installModalFocus } from "./modal-focus.js?v=1.5.10-phase1-local-ui";

function normalizedPoint(event, image) {
  return normalizedContainedPoint({ x: event.clientX, y: event.clientY }, imageContentRect(image));
}

function imageContentRect(image) {
  return containedImageRect(image.getBoundingClientRect(), {
    width: image.naturalWidth, height: image.naturalHeight,
  });
}

function sourceBounds(point) {
  return { x: Math.max(0, Math.min(.92, point.x - .04)), y: Math.max(0, Math.min(.95, point.y - .025)), w: .08, h: .05 };
}

export function openEditableLabelWorkspace({ source, result, onInsert, returnFocus = document.activeElement } = {}) {
  if (!source?.data || !result?.data) throw new TypeError("Editable labels require source and result images.");
  const session = createEditableLabelSession();
  let pending = null;
  const overlay = document.createElement("div");
  overlay.className = "ai-compare-overlay ai-label-overlay";
  overlay.innerHTML = `<section class="ai-label-dialog" role="dialog" aria-modal="true">
    <header><strong>편집 가능한 라벨 배치</strong><button type="button" data-label-close aria-label="닫기">×</button></header>
    <p class="ai-label-intro">자동 OCR로 확정하지 않습니다. 원본 위치와 결과의 지시선·라벨 위치를 직접 지정해 주세요.</p>
    <div class="ai-label-layout"><figure><figcaption>원본</figcaption><div class="ai-label-image-stage"><img data-label-source alt="라벨 원본"><div data-label-source-marks aria-hidden="true"></div></div></figure>
      <figure><figcaption>라벨 없는 결과</figcaption><div class="ai-label-image-stage"><img data-label-result alt="라벨 없는 도판 결과"><div data-label-result-marks aria-hidden="true"></div></div></figure></div>
    <section class="ai-label-controls"><div><button type="button" data-label-add>라벨 추가</button><span data-label-status role="status" aria-live="polite">라벨을 추가해 시작하세요.</span></div><div data-label-list></div></section>
    <footer><button type="button" data-label-cancel>취소</button><button type="button" data-label-insert disabled>도판 + 라벨을 캔버스에 삽입</button></footer>
  </section>`;
  document.documentElement.appendChild(overlay);
  const dialog = overlay.querySelector(".ai-label-dialog");
  const title = dialog.querySelector("header strong");
  title.id = `ai-label-title-${Date.now().toString(36)}`;
  dialog.setAttribute("aria-labelledby", title.id);
  const sourceImage = dialog.querySelector("[data-label-source]");
  const resultImage = dialog.querySelector("[data-label-result]");
  const list = dialog.querySelector("[data-label-list]");
  const status = dialog.querySelector("[data-label-status]");
  const insert = dialog.querySelector("[data-label-insert]");
  const sourceMarks = dialog.querySelector("[data-label-source-marks]");
  const resultMarks = dialog.querySelector("[data-label-result-marks]");
  sourceImage.src = source.data;
  resultImage.src = result.data;
  const closeButton = dialog.querySelector("[data-label-close]");
  let releaseFocus = null;
  let disposeGeometry = () => {};
  const close = () => { disposeGeometry(); releaseFocus?.(); overlay.remove(); };
  releaseFocus = installModalFocus({ root: overlay, initialFocus: closeButton, returnFocus, onRequestClose: close });

  const setPending = (id, kind, message) => { pending = { id, kind }; status.textContent = message; render(); };
  const renderMarks = () => {
    if (!sourceImage.complete || !resultImage.complete) return;
    const descriptors = labelOverlayDescriptors(session.list());
    const sourceStage = sourceImage.parentElement.getBoundingClientRect();
    const resultStage = resultImage.parentElement.getBoundingClientRect();
    const sourceRect = imageContentRect(sourceImage);
    const resultRect = imageContentRect(resultImage);
    sourceMarks.replaceChildren(...descriptors.filter((item) => item.original).map((item) => {
      const mark = document.createElement("span");
      mark.className = "ai-label-source-mark";
      mark.dataset.confirmed = String(item.confirmed);
      Object.assign(mark.style, { left: `${sourceRect.left - sourceStage.left + item.original.x * sourceRect.width}px`,
        top: `${sourceRect.top - sourceStage.top + item.original.y * sourceRect.height}px`,
        width: `${item.original.w * sourceRect.width}px`, height: `${item.original.h * sourceRect.height}px` });
      return mark;
    }));
    resultMarks.replaceChildren(...descriptors.filter((item) => item.target || item.labelPosition).map((item) => {
      const mark = document.createElement("span");
      mark.className = "ai-label-result-mark";
      mark.dataset.confirmed = String(item.confirmed);
      if (item.target) {
        const target = document.createElement("span");
        target.className = "ai-label-result-target";
        Object.assign(target.style, { left: `${resultRect.left - resultStage.left + item.target.x * resultRect.width}px`,
          top: `${resultRect.top - resultStage.top + item.target.y * resultRect.height}px` });
        mark.append(target);
      }
      if (item.target && item.labelPosition) {
        const dx = (item.labelPosition.x - item.target.x) * resultRect.width;
        const dy = (item.labelPosition.y - item.target.y) * resultRect.height;
        const line = document.createElement("span");
        line.className = "ai-label-result-line";
        Object.assign(line.style, { left: `${resultRect.left - resultStage.left + item.target.x * resultRect.width}px`,
          top: `${resultRect.top - resultStage.top + item.target.y * resultRect.height}px`,
          width: `${Math.hypot(dx, dy)}px`, transform: `rotate(${Math.atan2(dy, dx)}rad)` });
        mark.append(line);
      }
      if (item.labelPosition) {
        const label = document.createElement("span");
        label.className = "ai-label-result-text";
        label.textContent = item.text || "?";
        label.dataset.align = item.labelPosition.x > .78 ? "end" : item.labelPosition.x < .22 ? "start" : "center";
        Object.assign(label.style, { left: `${resultRect.left - resultStage.left + item.labelPosition.x * resultRect.width}px`,
          top: `${resultRect.top - resultStage.top + item.labelPosition.y * resultRect.height}px` });
        mark.append(label);
      }
      return mark;
    }));
  };
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(renderMarks) : null;
  resizeObserver?.observe(sourceImage.parentElement);
  resizeObserver?.observe(resultImage.parentElement);
  window.addEventListener("resize", renderMarks);
  disposeGeometry = () => { resizeObserver?.disconnect(); window.removeEventListener("resize", renderMarks); };
  const candidateRow = (candidate) => {
    const row = document.createElement("article");
    row.className = "ai-label-candidate";
    row.dataset.confirmed = String(candidate.confirmed);
    const input = document.createElement("input");
    input.type = "text"; input.value = candidate.text; input.placeholder = "라벨 문자열"; input.setAttribute("aria-label", "라벨 문자열");
    input.oninput = () => {
      session.updateText(candidate.id, input.value);
      row.dataset.confirmed = "false";
      confirm.textContent = "확인 필요";
      insert.disabled = !session.ready();
      renderMarks();
    };
    const action = (text, kind, message) => {
      const button = document.createElement("button");
      button.type = "button"; button.textContent = text;
      button.classList.toggle("is-on", pending?.id === candidate.id && pending.kind === kind);
      button.onclick = () => setPending(candidate.id, kind, message);
      return button;
    };
    const original = action("원본 라벨 위치", "original", "원본에서 라벨 중심을 선택하세요.");
    const target = action("결과 지시선 대상", "target", "결과에서 지시선이 가리킬 대상을 선택하세요.");
    const label = action("결과 라벨 위치", "labelPosition", "결과에서 라벨을 놓을 위치를 선택하세요.");
    original.dataset.done = String(Boolean(candidate.original));
    target.dataset.done = String(Boolean(candidate.target));
    label.dataset.done = String(Boolean(candidate.labelPosition));
    const confirm = document.createElement("button");
    confirm.type = "button"; confirm.textContent = candidate.confirmed ? "확인됨" : "확인 필요";
    confirm.onclick = () => { status.textContent = session.confirm(candidate.id) ? "라벨을 확인했습니다." : "문구와 세 위치를 모두 지정해 주세요."; render(); };
    const remove = document.createElement("button");
    remove.type = "button"; remove.textContent = "삭제";
    remove.onclick = () => { session.remove(candidate.id); if (pending?.id === candidate.id) pending = null; render(); };
    row.append(input, original, target, label, confirm, remove);
    return row;
  };
  function render() {
    list.replaceChildren(...session.list().map(candidateRow));
    insert.disabled = !session.ready();
    renderMarks();
  }
  const applyPoint = (kind, event, image) => {
    if (!pending || pending.kind !== kind) return;
    const point = normalizedPoint(event, image);
    if (!point) { status.textContent = "흰 여백이 아닌 실제 이미지 안쪽을 선택해 주세요."; return; }
    if (kind === "original") session.setOriginal(pending.id, sourceBounds(point));
    else if (kind === "target") session.setTarget(pending.id, point);
    else session.setLabelPosition(pending.id, point);
    status.textContent = "위치를 기록했습니다. 모든 위치를 지정한 뒤 ‘확인 필요’를 눌러 주세요.";
    pending = null; render();
  };
  sourceImage.onclick = (event) => applyPoint("original", event, sourceImage);
  resultImage.onclick = (event) => {
    if (pending?.kind === "target" || pending?.kind === "labelPosition") applyPoint(pending.kind, event, resultImage);
  };
  dialog.querySelector("[data-label-add]").onclick = () => {
    const item = session.add();
    status.textContent = "라벨 문자열과 세 위치를 지정하세요.";
    render();
    list.querySelector("article:last-child input")?.focus();
    return item;
  };
  closeButton.onclick = close;
  dialog.querySelector("[data-label-cancel]").onclick = close;
  insert.onclick = async () => {
    if (!session.ready()) return;
    insert.disabled = true;
    try { await onInsert?.(session.confirmed()); close(); }
    catch (error) { status.textContent = `삽입 실패: ${error.message || error}`; insert.disabled = false; }
  };
  render();
  return { close, session, element: overlay };
}

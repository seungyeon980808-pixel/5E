import { composeReferenceImages } from './ai-reference-composite.js';
const REVIEW_STATES = new Set([
  "idle", "generating", "reviewing", "correcting", "passed",
  "first-generated", "scoped-applied", "needs-attention", "failed", "cancelled",
]);

const STATE_COPY = Object.freeze({
  idle: ["검수 대기", "생성 결과가 나오면 항목별 검수 내용이 표시됩니다."],
  generating: ["이미지 생성 중", "생성 완료 후 검수를 시작합니다."],
  reviewing: ["결과 검수 중", "검수 항목을 확인하고 있습니다."],
  correcting: ["수정 결과 생성 중", "확인된 문제를 반영하고 있습니다."],
  passed: ["검수 통과", "검수 보고서에서 통과한 결과입니다."],
  "first-generated": ["첫 PNG 생성 완료", "자동 검수·교정 없이 생성한 원본입니다. 품질을 직접 확인해 주세요."],
  "scoped-applied": ["부분 수정 적용 완료", "영역 밖 픽셀 보존 확인. 시각 품질은 자동 검수하지 않았습니다."],
  "needs-attention": ["확인 필요", "검수 보고서에 확인할 문제가 있습니다."],
  failed: ["작업 실패", "생성 또는 검수를 완료하지 못했습니다."],
  cancelled: ["작업 취소됨", "이 작업은 취소되었습니다."],
});

const CHECK_COPY = Object.freeze({
  passed: "통과",
  pass: "통과",
  ok: "통과",
  failed: "문제 있음",
  fail: "문제 있음",
  warning: "확인 필요",
  warn: "확인 필요",
  uncertain: "확인 필요",
  pending: "확인 중",
  checking: "확인 중",
  skipped: "검수 안 함",
  unknown: "상태 미확인",
});

const VERDICT_COPY = Object.freeze({
  pass: "통과", passed: "통과", success: "통과", ok: "통과",
  fail: "검수 실패", failed: "검수 실패",
  uncertain: "확인 필요", warning: "확인 필요", "needs-attention": "확인 필요",
});
const SEVERITY_COPY = Object.freeze({
  critical: "치명적 문제", major: "주요 문제", minor: "경미한 문제",
  warning: "주의", info: "참고",
});
const EFFORT_COPY = Object.freeze({ low: "낮음", medium: "보통", high: "높음", xhigh: "매우 높음" });
const INSPECTION_LABELS = Object.freeze({
  opaque: "전체 불투명",
  strictlyAchromatic: "완전 무채색",
  channelDifferenceOver3Share: "RGB 채널 차이 > 3 비율",
  exactWhiteBorderShare: "테두리 순백 비율",
});

function cleanText(value, fallback = "") {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return text || fallback;
}

export function normalizeReviewState(value) {
  const state = cleanText(value, "idle");
  return REVIEW_STATES.has(state) ? state : "idle";
}

function localizedToken(value, dictionary, fallback = "") {
  const raw = cleanText(value, fallback);
  return dictionary[raw.toLowerCase()] || raw;
}

export function normalizePixelInspection(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value).flatMap(([key, item]) => {
    if (typeof item === "boolean") return [[key, item]];
    if (typeof item === "number" && Number.isFinite(item)) return [[key, item]];
    if (typeof item === "string" && item.trim()) return [[key, item.trim()]];
    return [];
  });
  return entries.length ? Object.fromEntries(entries) : null;
}

export function normalizeReviewDetail(detail = {}) {
  const state = normalizeReviewState(detail.state);
  const report = detail.report && typeof detail.report === "object" ? detail.report : {};
  return {
    state,
    candidateId: cleanText(detail.candidateId),
    report: {
      verdict: cleanText(report.verdict),
      checks: Array.isArray(report.checks) ? report.checks.map((check, index) => ({
        id: cleanText(check?.id, `check-${index + 1}`),
        label: cleanText(check?.label, `검수 항목 ${index + 1}`),
        status: cleanText(check?.status, "unknown").toLowerCase(),
        detail: cleanText(check?.detail),
      })) : [],
      issues: Array.isArray(report.issues) ? report.issues.map((issue) => ({
        message: cleanText(issue?.message, "확인이 필요한 문제가 있습니다."),
        bbox: issue?.bbox ?? null,
        severity: cleanText(issue?.severity),
      })) : [],
    },
    generationCount: Number.isFinite(Number(detail.generationCount)) ? Number(detail.generationCount) : null,
    reviewCount: Number.isFinite(Number(detail.reviewCount)) ? Number(detail.reviewCount) : null,
    model: cleanText(detail.model),
    effort: cleanText(detail.effort),
    elapsedMs: Number.isFinite(Number(detail.elapsedMs)) ? Math.max(0, Number(detail.elapsedMs)) : null,
    pixelInspection: normalizePixelInspection(detail.pixelInspection),
  };
}

export function normalizeReviewBBox(value) {
  const raw = Array.isArray(value)
    ? { x: value[0], y: value[1], width: value[2], height: value[3] }
    : value && typeof value === "object"
      ? { x: value.x, y: value.y, width: value.width ?? value.w, height: value.height ?? value.h }
      : null;
  if (!raw) return null;
  const bbox = Object.fromEntries(Object.entries(raw).map(([key, item]) => [key, Number(item)]));
  if (!Object.values(bbox).every(Number.isFinite)) return null;
  // Review bbox contract: x/y/width/height are normalized to the rendered image, 0..1.
  if (bbox.x < 0 || bbox.y < 0 || bbox.width <= 0 || bbox.height <= 0) return null;
  if (bbox.x > 1 || bbox.y > 1 || bbox.width > 1 || bbox.height > 1) return null;
  if (bbox.x + bbox.width > 1.001 || bbox.y + bbox.height > 1.001) return null;
  return bbox;
}

export function setupAiWorkbench(panel = document.getElementById("ai-image-panel")) {
  if (!panel || panel.dataset.aiWorkbenchReady === "true") return;
  panel.dataset.aiWorkbenchReady = "true";

  const results = panel.querySelector(".ai-results");
  const previews = panel.querySelector("[data-ai-previews]");
  const references = panel.querySelector("[data-ai-attachment-list]");
  const versionButton = panel.querySelector("[data-ai-version-button]");
  const versionList = panel.querySelector("[data-ai-version-list]");
  const sourceSelect = panel.querySelector("[data-ai-source-select]");
  const resultState = panel.querySelector("[data-ai-result-state]");
  const reviewSummary = panel.querySelector("[data-ai-review-summary]");
  const compositePreview = panel.querySelector("[data-ai-composite-preview]");
  const orientationButtons = Array.from(panel.querySelectorAll("[data-ai-composition-orientation]"));
  const layoutButtons = Array.from(panel.querySelectorAll("[data-ai-layout-mode]"));
  const linkedZoom = panel.querySelector("[data-ai-zoom-linked]");
  const paneZoomControls = Array.from(panel.querySelectorAll("[data-ai-pane-zoom]"));
  const zoomTarget = panel.querySelector('[data-ai-zoom-target]');
  const zoomPane = () => panel.dataset.aiLayout === 'result' ? 'result'
    : panel.dataset.aiLayout === 'source' || linkedZoom?.checked ? 'source' : zoomTarget?.value || 'source';
  const paneHeadControls = Array.from(panel.querySelectorAll('.ai-pane-head-controls'));
  const syncPaneHeadHeight = () => {
    const height = Math.max(0, ...paneHeadControls.map(control => control.offsetHeight));
    panel.style.setProperty('--ai-pane-head-height', `${height + 16}px`);
  };
  const headResizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(syncPaneHeadHeight) : null;
  paneHeadControls.forEach(control => headResizeObserver?.observe(control));
  const generatedKeys = new WeakMap();
  const sourceKeys = new WeakMap();

  const reports = new Map();
  const fittedCards = new WeakSet();
  let generatedSerial = 0;
  let sourceSerial = 0;
  let activeCandidateKey = "";
  let activeSourceKey = "";
  const paneZoom = { source: 1, result: 1 };
  let userChoseLayout = false;
  let panelLayoutChanging = false;

  const cardTitle = (card, fallback) => cleanText(card.querySelector(".ai-image-card-head strong")?.textContent, fallback);
  const generatedCards = () => Array.from(previews?.querySelectorAll(".ai-generated-card") || []);
  const sourceCards = () => Array.from(references?.querySelectorAll(".ai-reference-card") || []);
  const candidateKey = (card) => {
    if (card.dataset.aiCandidateId) return card.dataset.aiCandidateId;
    if (!generatedKeys.has(card)) generatedKeys.set(card, `ui-candidate-${++generatedSerial}`);
    return generatedKeys.get(card);
  };
  const sourceKey = (card) => {
    if (card.dataset.aiReferenceId) return card.dataset.aiReferenceId;
    if (!sourceKeys.has(card)) sourceKeys.set(card, `ui-source-${++sourceSerial}`);
    return sourceKeys.get(card);
  };
  let combinedCard = null;
  let combinedSignature = '';
  let composition = { orientation: 'horizontal' };
  const activeSource = () => activeSourceKey === '__combined__' ? combinedCard
    : sourceCards().find(item => sourceKey(item) === activeSourceKey);
  const activeCandidate = () => generatedCards().find((card) => candidateKey(card) === activeCandidateKey) || null;

  function cardFit(card) {
    const stage = card?.querySelector('.ai-preview-stage');
    const image = stage?.querySelector(':scope > img');
    if (!stage || !image?.naturalWidth || !image?.naturalHeight || !card.clientWidth || !card.clientHeight) return null;
    const style = getComputedStyle(card);
    const pane = card.closest('.ai-image-pane');
    const headHeight = pane.querySelector('.ai-pane-head').offsetHeight;
    const availableWidth = Math.max(40, card.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    const availableHeight = Math.max(40, pane.clientHeight - headHeight - 100);
    const original = activeSource()?.querySelector('.ai-preview-stage > img');
    const ratio = original?.naturalWidth && original?.naturalHeight ? original.naturalWidth / original.naturalHeight : image.naturalWidth / image.naturalHeight;
    return {stage, ratio, height: Math.min(availableHeight, availableWidth / ratio)};
  }

  function applyStageSize(stage) {
    if (!stage) return;
    const baseWidth = Number(stage.dataset.aiFitWidth);
    const baseHeight = Number(stage.dataset.aiFitHeight);
    const zoom = Number(stage.dataset.aiZoom) || 1;
    if (!baseWidth || !baseHeight) return;
    stage.style.width = `${Math.round(baseWidth * zoom)}px`;
    stage.style.height = `${Math.round(baseHeight * zoom)}px`;
  }

  function fitCardStage(card) {
    const fit = cardFit(card);
    if (!fit) return;
    const fits = results?.classList.contains('mode-side-by-side')
      ? [cardFit(activeCandidate()), cardFit(activeSource())].filter(Boolean)
      : [fit];
    const sharedHeight = Math.floor(Math.min(...fits.map(item => item.height)));
    for (const item of fits) {
      const height = sharedHeight;
      item.stage.dataset.aiFitWidth = String(Math.floor(height * item.ratio));
      item.stage.dataset.aiFitHeight = String(height);
      applyStageSize(item.stage);
    }
    const source = cardFit(activeSource());
    if (source) {
      panel.style.setProperty('--ai-pending-width', source.stage.style.width);
      panel.style.setProperty('--ai-pending-height', source.stage.style.height);
    }
  }

  const stageResizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver((entries) => {
      if (panelLayoutChanging) return;
      entries.forEach(({ target }) => fitCardStage(target));
    })
    : null;
  function watchCardFit(card) {
    if (!card || fittedCards.has(card)) return;
    fittedCards.add(card);
    stageResizeObserver?.observe(card);
    const image = card.querySelector(".ai-preview-stage > img");
    image?.addEventListener("load", () => fitCardStage(card), { once: true });
    window.requestAnimationFrame(() => fitCardStage(card));
  }

  function setLayout(mode, fromUser = false) {
    if (!results || !["side-by-side", "source", "result"].includes(mode)) return;
    const previous = results.classList.contains("mode-source") ? "source" : results.classList.contains("mode-result") ? "result" : null;
    const position = previous ? readPosition(previous) : null;
    if (previous && mode !== "side-by-side") paneZoom[mode] = paneZoom[previous];
    results.classList.remove("mode-side-by-side", "mode-source", "mode-result");
    results.classList.add(`mode-${mode}`);
    for (const button of layoutButtons) {
      const selected = button.dataset.aiLayoutMode === mode;
      button.classList.toggle("is-on", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    if (fromUser) userChoseLayout = true;
    const trackingControl = panel.querySelector('[data-ai-tracking-control]');
    if (trackingControl) trackingControl.hidden = mode !== 'side-by-side';
    panel.dataset.aiLayout = mode;
    const targetControl = panel.querySelector('[data-ai-zoom-target-control]');
    if (targetControl) targetControl.hidden = mode !== 'side-by-side' || linkedZoom?.checked;
    if (mode === 'side-by-side' && linkedZoom?.checked) paneZoom.result = paneZoom.source;
    syncPaneHeadHeight();
    window.requestAnimationFrame(() => {
      fitCardStage(activeCandidate());
      fitCardStage(activeSource());
      applyPaneZoom("source");
      applyPaneZoom("result");
      if (position && mode !== "side-by-side") writePosition(mode, position);
    });
  }

  function updateResponsiveLayout() {
    const processing = Boolean(panel.querySelector("[data-ai-generating]:not([hidden])"));
    if (userChoseLayout) return;
    if (processing && !generatedCards().length) {
      setLayout(sourceCards().length ? "side-by-side" : "result");
      return;
    }
    setLayout(sourceCards().length ? "side-by-side" : "result");
  }

  const paneCard = (pane) => pane === "source"
    ? activeSource()
    : activeCandidate();

  const syncedScroll = new WeakMap();
  function readPosition(pane) {
    const card = paneCard(pane);
    const stage = card?.querySelector('.ai-preview-stage');
    if (!stage?.offsetWidth || !stage.offsetHeight || !card.clientWidth) return null;
    return {
      x: (card.scrollLeft + card.clientWidth / 2 - stage.offsetLeft) / stage.offsetWidth,
      y: (card.scrollTop + (card.closest(".ai-image-pane").getBoundingClientRect().bottom - card.getBoundingClientRect().top) / 2 - stage.offsetTop) / stage.offsetHeight,
    };
  }
  function writePosition(pane, position) {
    const card = paneCard(pane);
    const stage = card?.querySelector('.ai-preview-stage');
    if (!card || !stage || !position) return;
    card.scrollLeft = stage.offsetLeft + position.x * stage.offsetWidth - card.clientWidth / 2;
    card.scrollTop = stage.offsetTop + position.y * stage.offsetHeight - (card.closest(".ai-image-pane").getBoundingClientRect().bottom - card.getBoundingClientRect().top) / 2;
    syncedScroll.set(card, { left: card.scrollLeft, top: card.scrollTop });
  }
  function copyPosition(from, to) { writePosition(to, readPosition(from)); }
  panel.addEventListener('scroll', event => {
    if (!linkedZoom?.checked || !results.classList.contains('mode-side-by-side')) return;
    const card = event.target;
    const expected = syncedScroll.get(card);
    if (expected && Math.abs(card.scrollLeft - expected.left) < 1 && Math.abs(card.scrollTop - expected.top) < 1) return;
    syncedScroll.delete(card);
    if (card === paneCard('source')) copyPosition('source', 'result');
    else if (card === paneCard('result')) copyPosition('result', 'source');
  }, true);
  document.addEventListener('keydown', event => {
    if (panel.hidden || !['source', 'result'].includes(panel.dataset.aiLayout) || event.key !== ' ') return;
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),button:not([data-ai-layout-mode]),[role="button"],summary')) return;
    if (document.querySelector('dialog[open], .modal-overlay:not([hidden]):not(#ai-image-panel)')) return;
    if (!activeCandidate() || !sourceCards().length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) setLayout(panel.dataset.aiLayout === 'source' ? 'result' : 'source', true);
  }, true);
  function applyPaneZoom(pane) {
    paneZoom[pane] = Math.min(4, Math.max(.25, Math.round(paneZoom[pane] * 10000) / 10000));
    const card = paneCard(pane);
    const stage = card?.querySelector(".ai-preview-stage");
    if (stage) {
      stage.dataset.aiZoom = String(paneZoom[pane]);
      applyStageSize(stage);
      if (pane === 'source') {
        panel.style.setProperty('--ai-pending-width', stage.style.width);
        panel.style.setProperty('--ai-pending-height', stage.style.height);
      }
    }
    const controls = paneZoomControls.find((item) => item.dataset.aiPaneZoom === pane
      || item.dataset.aiPaneZoom === 'shared' && zoomPane() === pane);
    const value = controls?.querySelector("[data-ai-zoom-value]");
    if (value) value.textContent = `${Math.round(paneZoom[pane] * 100)}%`;
    for (const button of controls?.querySelectorAll("[data-ai-zoom-action]") || []) {
      if (button.dataset.aiZoomAction === "out") button.disabled = paneZoom[pane] <= .25;
      if (button.dataset.aiZoomAction === "in") button.disabled = paneZoom[pane] >= 4;
    }
  }

  function changePaneZoom(pane, action) {
    const position = readPosition(pane);
    const next = action === "in" ? paneZoom[pane] + .2 : action === "out" ? paneZoom[pane] - .2 : 1;
    const targets = linkedZoom?.checked && results.classList.contains("mode-side-by-side") ? ["source", "result"] : [pane];
    for (const target of targets) {
      paneZoom[target] = next;
      applyPaneZoom(target);
      writePosition(target, action === "fit" ? { x: .5, y: .5 } : position);
    }
    panel.dispatchEvent(new CustomEvent("5e:ai-workbench-geometry-change"));
  }

  // Chromium exposes trackpad pinch as a Ctrl-modified wheel event.
  panel.addEventListener("wheel", event => {
    if (panel.hidden || !event.ctrlKey || event.altKey || event.metaKey) return;
    const card = event.target.closest?.(".ai-image-card");
    const pane = card === paneCard("source") ? "source" : card === paneCard("result") ? "result" : null;
    const stage = card?.querySelector(".ai-preview-stage");
    if (!pane || !stage?.offsetWidth) return;
    event.preventDefault();
    event.stopPropagation();
    const before = stage.getBoundingClientRect();
    const anchor = { x: (event.clientX - before.left) / before.width, y: (event.clientY - before.top) / before.height };
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? card.clientHeight : 1;
    paneZoom[pane] *= Math.exp(-Math.max(-120, Math.min(120, event.deltaY * unit)) * .003);
    applyPaneZoom(pane);
    const after = stage.getBoundingClientRect();
    const scale = after.width / stage.offsetWidth;
    card.scrollLeft += (after.left + anchor.x * after.width - event.clientX) / scale;
    card.scrollTop += (after.top + anchor.y * after.height - event.clientY) / scale;
    if (linkedZoom?.checked && results.classList.contains("mode-side-by-side")) {
      const other = pane === "source" ? "result" : "source";
      paneZoom[other] = paneZoom[pane];
      applyPaneZoom(other);
      copyPosition(pane, other);
    }
    panel.dispatchEvent(new CustomEvent("5e:ai-workbench-geometry-change"));
  }, { passive: false });

  function clearIssueHighlight() {
    panel.querySelectorAll(".ai-review-bbox").forEach((node) => node.remove());
  }

  function highlightIssue(card, bboxValue) {
    const bbox = normalizeReviewBBox(bboxValue);
    const stage = card?.querySelector(".ai-preview-stage");
    const image = stage?.querySelector(":scope > img");
    if (!bbox || !stage || !image || !image.naturalWidth || !image.naturalHeight) return;
    clearIssueHighlight();
    const stageRect = stage.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    const contentWidth = imageRect.width;
    const contentHeight = imageRect.height;
    const offsetX = imageRect.left - stageRect.left;
    const offsetY = imageRect.top - stageRect.top;
    const marker = document.createElement("span");
    marker.className = "ai-review-bbox";
    marker.setAttribute("aria-hidden", "true");
    marker.style.left = `${offsetX + bbox.x * contentWidth}px`;
    marker.style.top = `${offsetY + bbox.y * contentHeight}px`;
    marker.style.width = `${bbox.width * contentWidth}px`;
    marker.style.height = `${bbox.height * contentHeight}px`;
    stage.appendChild(marker);
    window.setTimeout(() => marker.remove(), 5000);
  }

  function renderUserStatus(record) {
    if (!reviewSummary) return;
    const state = normalizeReviewState(record?.state);
    const labels = {
      idle: activeCandidate() ? "완료됨" : "준비됨",
      generating: "변환 중",
      reviewing: "결과 확인 중",
      correcting: "변환 중",
      passed: "완료됨",
      "first-generated": "완료됨",
      "scoped-applied": "완료됨",
      "needs-attention": "확인이 필요합니다",
      failed: "변환에 실패했습니다. 입력과 코멘트는 보존되었습니다.",
      cancelled: "중단됨",
    };
    reviewSummary.dataset.state = state;
    reviewSummary.textContent = labels[state] || labels.idle;
  }

  function stateForCard(card) {
    if (!card) return "idle";
    return normalizeReviewState(card.dataset.aiReviewState || "idle");
  }

  function updateResultState(record = null) {
    if (!resultState) return;
    const card = activeCandidate();
    const generating = panel.querySelector("[data-ai-generating]:not([hidden])");
    let state = record?.state || stateForCard(card);
    if (generating) state = "generating";
    const labels = {
      idle: card ? "생성됨 · 검수 대기" : "생성 전",
      generating: "이미지 생성 중",
      reviewing: "생성됨 · 검수 중",
      correcting: "수정 결과 생성 중",
      passed: "생성됨 · 검수 통과",
      "first-generated": "첫 PNG 생성 완료",
      "scoped-applied": "부분 수정 적용 완료",
      "needs-attention": "생성됨 · 확인 필요",
      failed: "작업 실패",
      cancelled: "작업 취소됨",
    };
    resultState.dataset.state = state;
    resultState.textContent = labels[state] || labels.idle;
  }

  function syncWorkbenchStage() {
    const processing = Boolean(panel.querySelector("[data-ai-generating]:not([hidden])"));
    const empty = panel.querySelector('[data-ai-empty]');
    if (empty) {
      const prepared = sourceCards().length > 0;
      const title = empty.querySelector('strong');
      const detail = empty.querySelector('span');
      const add = empty.querySelector('[data-ai-add-file]');
      const titleText = prepared ? '변환 결과 대기' : '작업할 이미지를 추가하세요';
      const detailText = prepared ? '변환하기를 누르면 결과가 여기에 표시됩니다.' : '이미지를 끌어놓거나 파일을 선택하세요.';
      if (title && title.textContent !== titleText) title.textContent = titleText;
      if (detail && detail.textContent !== detailText) detail.textContent = detailText;
      if (add && add.hidden !== prepared) add.hidden = prepared;
    }
    panel.dataset.aiStage = processing
      ? "processing"
      : generatedCards().length
        ? "result"
        : sourceCards().length ? "preparation" : "empty";
  }

  function syncCandidates({ preferNewest = false } = {}) {
    const cards = generatedCards();
    const keys = cards.map(candidateKey);
    const requestedKey = panel.dataset.aiSelectedCandidateId || "";
    if (keys.includes(requestedKey)) activeCandidateKey = requestedKey;
    else if (!keys.includes(activeCandidateKey)) activeCandidateKey = keys[0] || "";
    else if (preferNewest && keys[0]) activeCandidateKey = keys[0];

    if (versionButton && versionList) {
      versionList.replaceChildren();
      versionButton.disabled = cards.length === 0;
      versionButton.textContent = cards.length
        ? cardTitle(activeCandidate(), `생성 결과 ${cards.length}`)
        : "생성 결과 없음";
      cards.forEach((card, index) => {
        const option = document.createElement("button");
        const selected = candidateKey(card) === activeCandidateKey;
        option.type = "button";
        option.role = "option";
        option.dataset.aiCandidateOption = candidateKey(card);
        option.setAttribute("aria-selected", String(selected));
        option.tabIndex = selected ? 0 : -1;
        option.textContent = cardTitle(card, `생성 결과 ${cards.length - index}`);
        versionList.appendChild(option);
      });
    }

    for (const card of cards) {
      card.classList.toggle("is-ai-active-candidate", candidateKey(card) === activeCandidateKey);
      watchCardFit(card);
    }
    applyPaneZoom("result");
    window.requestAnimationFrame(() => fitCardStage(activeCandidate()));
    const report = reports.get(activeCandidateKey) || normalizeReviewDetail({ state: stateForCard(activeCandidate()) });
    renderUserStatus(report);
    updateResultState(report);
    syncWorkbenchStage();
  }

  function prepareCombined(cards) {
    if (combinedCard && !combinedCard.isConnected) { combinedCard = null; combinedSignature = ''; }
    const inputs = cards.filter(card => card.dataset.aiReferenceRole !== 'STYLE_REFERENCE');
    if (inputs.length < 2) {
      combinedSignature = '';
      combinedCard?.remove(); combinedCard = null;
      return;
    }
    const sources = inputs.map(card => ({ id: sourceKey(card), dataUrl: card.querySelector('.ai-preview-stage > img')?.src }));
    const signature = JSON.stringify({ sources, composition });
    if (signature === combinedSignature) return;
    combinedSignature = signature;
    if (!combinedCard) {
      combinedCard = document.createElement('article');
      combinedCard.className = 'ai-image-card ai-combined-card';
      const head = document.createElement('header'); head.className = 'ai-image-card-head';
      const title = document.createElement('strong'); title.textContent = '연결된 전체 원본'; title.title = '위치별 코멘트는 위 목록에서 개별 원본을 선택해 작성하세요.'; head.append(title);
      const stage = document.createElement('div'); stage.className = 'ai-preview-stage';
      const image = document.createElement('img'); image.alt = '연결된 전체 원본'; stage.append(image);
      combinedCard.append(head, stage);
      references.append(combinedCard);
      let pan = null;
      stage.addEventListener('pointerdown', event => {
        if (event.button !== 0 || panel.querySelector('[data-ai-comment-tool="pan"]')?.getAttribute('aria-pressed') !== 'true') return;
        pan = { x: event.clientX, y: event.clientY, left: combinedCard.scrollLeft, top: combinedCard.scrollTop };
        stage.setPointerCapture(event.pointerId); event.preventDefault();
      });
      stage.addEventListener('pointermove', event => {
        if (!pan) return;
        combinedCard.scrollLeft = pan.left - event.clientX + pan.x;
        combinedCard.scrollTop = pan.top - event.clientY + pan.y;
      });
      stage.addEventListener('pointerup', () => { pan = null; });
      stage.addEventListener('pointercancel', () => { pan = null; });
    }
    const target = combinedCard;
    target.setAttribute('aria-busy', 'true');
    composeReferenceImages({ sources, orientation: composition.orientation, layout: composition.layout, maxLongEdge: 1536 }).then(result => {
      if (signature !== combinedSignature || target !== combinedCard) return;
      const image = target.querySelector('img');
      image.onload = () => { fitCardStage(target); applyPaneZoom('source'); };
      image.src = result.dataUrl;
      target.setAttribute('aria-busy', 'false');
      watchCardFit(target);
    }).catch(() => {
      if (signature !== combinedSignature) return;
      target.setAttribute('aria-busy', 'false');
      target.querySelector('strong').textContent = '연결 미리보기를 불러오지 못했습니다. 개별 원본을 선택해 주세요.';
    });
  }

  function syncSources() {
    const cards = sourceCards();
    const wasCombined = Boolean(combinedCard);
    prepareCombined(cards);
    const keys = [...(combinedCard ? ['__combined__'] : []), ...cards.map(sourceKey)];
    if (!keys.includes(activeSourceKey) || (!wasCombined && combinedCard)) activeSourceKey = keys[0] || '';
    combinedCard?.classList.toggle('is-ai-active-source', activeSourceKey === '__combined__');
    if (sourceSelect) {
      const picker = sourceSelect.closest("[data-ai-source-picker]");
      if (picker) picker.hidden = !cards.length;
      sourceSelect.replaceChildren();
      if (combinedCard) {
        const option = document.createElement('option');
        option.value = '__combined__'; option.textContent = '연결된 전체 원본'; sourceSelect.append(option);
      }
      if (!cards.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "원본 없음";
        sourceSelect.appendChild(option);
        sourceSelect.disabled = true;
      } else {
        cards.forEach((card, index) => {
          const option = document.createElement("option");
          option.value = sourceKey(card);
          option.textContent = `${card.dataset.aiReferenceRole === 'STYLE_REFERENCE' ? '표현 참고' : '원본'} · ${cardTitle(card, `참고 이미지 ${index + 1}`)}`;
          sourceSelect.appendChild(option);
        });
        sourceSelect.disabled = false;
        if (activeSourceKey !== '__combined__') {
          const replace = document.createElement('option');
          replace.value = '__replace__'; replace.textContent = '원본 교체…'; sourceSelect.append(replace);
        }
        sourceSelect.value = activeSourceKey;
      }
    }
    for (const card of cards) {
      card.classList.toggle("is-ai-active-source", sourceKey(card) === activeSourceKey);
      if (card.dataset.aiReferenceRole !== "STYLE_REFERENCE" && !card.querySelector("[data-ai-reference-order-controls]")) {
        const controls = document.createElement("div");
        controls.dataset.aiReferenceOrderControls = "";
        controls.className = "ai-reference-order-controls";
        for (const [direction, label] of [["earlier", "앞으로"], ["later", "뒤로"]]) {
          const button = document.createElement("button");
          button.type = "button";
          button.setAttribute("data-ai-reference-move", direction);
          button.textContent = label;
          button.addEventListener("click", () => panel.dispatchEvent(new CustomEvent("5e:ai-reference-order-change", {
            bubbles: true,
            detail: { referenceId: sourceKey(card), direction },
          })));
          controls.appendChild(button);
        }
        card.appendChild(controls);
      }
      watchCardFit(card);
    }
    if (compositePreview) compositePreview.hidden = true;
    applyPaneZoom("source");
    window.requestAnimationFrame(() => fitCardStage(activeSource()));
  }

  layoutButtons.forEach((button) => button.addEventListener("click", () => setLayout(button.dataset.aiLayoutMode, true)));
  paneZoomControls.forEach((controls) => controls.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ai-zoom-action]");
    if (!button) return;
    changePaneZoom(controls.dataset.aiPaneZoom === "shared" ? zoomPane() : controls.dataset.aiPaneZoom, button.dataset.aiZoomAction);
  }));
  linkedZoom?.addEventListener("change", () => {
    const targetControl = panel.querySelector('[data-ai-zoom-target-control]');
    if (targetControl) targetControl.hidden = linkedZoom.checked || panel.dataset.aiLayout !== 'side-by-side';
    applyPaneZoom(zoomPane());
    if (!linkedZoom.checked) return;
    paneZoom.result = paneZoom.source;
    applyPaneZoom("result");
    copyPosition("source", "result");
  });
  zoomTarget?.addEventListener('change', () => applyPaneZoom(zoomPane()));
  function selectCandidate(candidateKeyValue) {
    activeCandidateKey = candidateKeyValue;
    panel.dataset.aiSelectedCandidateId = activeCandidateKey;
    clearIssueHighlight();
    syncCandidates();
    const candidateId = activeCandidate()?.dataset.aiCandidateId;
    if (candidateId) panel.dispatchEvent(new CustomEvent("5e:ai-candidate-select", {
      detail: { candidateId },
    }));
  }

  function closeVersionList({ returnFocus = false } = {}) {
    if (!versionButton || !versionList) return;
    versionList.hidden = true;
    versionButton.setAttribute("aria-expanded", "false");
    if (returnFocus) versionButton.focus();
  }

  function moveVersionFocus(target) {
    const options = Array.from(versionList?.querySelectorAll("[data-ai-candidate-option]") || []);
    if (!options.length) return;
    const activeIndex = Math.max(0, options.indexOf(document.activeElement));
    const nextIndex = target === "first" ? 0 : target === "last" ? options.length - 1 : (activeIndex + target + options.length) % options.length;
    options.forEach((option, index) => { option.tabIndex = index === nextIndex ? 0 : -1; });
    options[nextIndex].focus();
  }

  versionButton?.addEventListener("click", () => {
    const opening = versionList.hidden;
    versionList.hidden = !opening;
    versionButton.setAttribute("aria-expanded", String(opening));
    if (opening) moveVersionFocus("first");
  });
  versionButton?.addEventListener("keydown", (event) => {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key) || !versionList.hidden) return;
    versionList.hidden = false;
    versionButton.setAttribute("aria-expanded", "true");
    moveVersionFocus(event.key === 'ArrowUp' ? 'last' : 'first');
    event.preventDefault();
  });
  versionList?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-ai-candidate-option]");
    if (!option) return;
    selectCandidate(option.dataset.aiCandidateOption);
    closeVersionList({ returnFocus: true });
  });
  versionList?.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "ArrowDown": moveVersionFocus(1); break;
      case "ArrowUp": moveVersionFocus(-1); break;
      case "Home": moveVersionFocus("first"); break;
      case "End": moveVersionFocus("last"); break;
      case "Enter": document.activeElement?.click(); break;
      case "Escape":
        closeVersionList({ returnFocus: true });
        event.stopPropagation();
        break;
      default: return;
    }
    event.preventDefault();
  });
  document.addEventListener('pointerdown', (event) => {
    if (versionList?.hidden || versionButton?.contains(event.target) || versionList?.contains(event.target)) return;
    closeVersionList();
  });
  orientationButtons.forEach((button) => button.addEventListener("click", () => {
    if (panel.dataset.aiBusy === "true") return;
    const orientation = button.dataset.aiCompositionOrientation;
    panel.dataset.aiCompositionOrientation = orientation;
    if (compositePreview) compositePreview.dataset.orientation = orientation;
    orientationButtons.forEach((item) => {
      const selected = item === button;
      item.classList.toggle("is-on", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    panel.dispatchEvent(new CustomEvent("5e:ai-composition-orientation-change", { bubbles: true, detail: { orientation } }));
  }));
  panel.addEventListener('5e:ai-composition-change', event => {
    composition = event.detail || { orientation: 'horizontal' };
    orientationButtons.forEach(button => {
      const selected = button.dataset.aiCompositionOrientation === composition.orientation;
      button.classList.toggle('is-on', selected); button.setAttribute('aria-pressed', String(selected));
    });
    syncSources();
  });
  sourceSelect?.addEventListener("change", () => {
    if (sourceSelect.value === '__replace__') {
      sourceSelect.value = activeSourceKey;
      panel.querySelector('[data-ai-replace-source]')?.click();
      return;
    }
    activeSourceKey = sourceSelect.value;
    syncSources();
  });
  panel.addEventListener("click", (event) => {
    if (!event.target.closest('[aria-label="수정 요청 영역 지정"]')) return;
    changePaneZoom("result", "fit");
  }, true);

  panel.addEventListener("5e:ai-review", (event) => {
    const record = normalizeReviewDetail(event.detail);
    if (record.candidateId) reports.set(record.candidateId, record);
    const matchesActive = !record.candidateId || record.candidateId === activeCandidateKey
      || activeCandidate()?.dataset.aiCandidateId === record.candidateId;
    if (matchesActive) {
      renderUserStatus(record);
      updateResultState(record);
    }
    syncWorkbenchStage();
  });

  let knownGeneratedCount = 0;
  const cardObserver = new MutationObserver(() => {
    const nextCount = generatedCards().length;
    syncCandidates({ preferNewest: nextCount > knownGeneratedCount });
    knownGeneratedCount = nextCount;
    syncSources();
    updateResponsiveLayout();
    syncWorkbenchStage();
  });
  const cardObserverOptions = {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-ai-candidate-id", "data-ai-review-state", "hidden"],
  };
  if (previews) cardObserver.observe(previews, cardObserverOptions);
  if (references) cardObserver.observe(references, cardObserverOptions);

  window.addEventListener("5e:image-panel-layout-will-change", (event) => {
    if (event.detail?.root === panel) panelLayoutChanging = true;
  });
  window.addEventListener("5e:image-panel-layout-did-change", (event) => {
    if (event.detail?.root !== panel) return;
    window.requestAnimationFrame(() => {
      panelLayoutChanging = false;
      fitCardStage(activeCandidate());
      fitCardStage(activeSource());
    });
  });

  const narrowQuery = window.matchMedia("(max-width: 1000px)");
  narrowQuery.addEventListener?.("change", updateResponsiveLayout);
  updateResponsiveLayout();
  syncCandidates();
  knownGeneratedCount = generatedCards().length;
  syncSources();
  syncWorkbenchStage();
  applyPaneZoom("source");
  applyPaneZoom("result");
  panel.aiWorkbench = {
    getViewState() {
      const sourceCard = activeSource();
      const resultCard = activeCandidate();
      return {
        selectedCandidateId: activeCandidateKey,
        zoom: { ...paneZoom },
        layout: panel.dataset.aiLayout,
        tracking: linkedZoom?.checked === true,
        scroll: {
          source: { left: sourceCard?.scrollLeft || 0, top: sourceCard?.scrollTop || 0 },
          result: { left: resultCard?.scrollLeft || 0, top: resultCard?.scrollTop || 0 },
        },
      };
    },
    restoreViewState(state = {}) {
      state = state && typeof state === "object" ? state : {};
      if (linkedZoom && typeof state.tracking === "boolean") linkedZoom.checked = state.tracking;
      if (state.layout) setLayout(state.layout, true);
      if (state.selectedCandidateId) panel.dataset.aiSelectedCandidateId = state.selectedCandidateId;
      if (Number.isFinite(state.zoom?.source)) paneZoom.source = state.zoom.source;
      if (Number.isFinite(state.zoom?.result)) paneZoom.result = state.zoom.result;
      syncCandidates();
      applyPaneZoom("source");
      applyPaneZoom("result");
      window.requestAnimationFrame(() => {
        const sourceCard = activeSource();
        const resultCard = activeCandidate();
        if (sourceCard) {
          sourceCard.scrollLeft = Number(state.scroll?.source?.left) || 0;
          sourceCard.scrollTop = Number(state.scroll?.source?.top ?? state.scroll?.source) || 0;
        }
        if (resultCard) {
          resultCard.scrollLeft = Number(state.scroll?.result?.left) || 0;
          resultCard.scrollTop = Number(state.scroll?.result?.top ?? state.scroll?.result) || 0;
        }
      });
    },
  };
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setupAiWorkbench(), { once: true });
  else setupAiWorkbench();
}

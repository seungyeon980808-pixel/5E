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

export function formatRuntimeSummary(model, effort) {
  const modelLabel = cleanText(model, "모델 확인 중");
  const effortKey = cleanText(effort, "medium").toLowerCase();
  const effortLabel = ({ low: "낮음", medium: "보통", high: "높음", xhigh: "매우 높음" })[effortKey]
    || cleanText(effort, "보통");
  return `생성 ${modelLabel} · ${effortLabel} / 검수 Sol · 높음`;
}

function selectedLabel(select) {
  const option = select?.selectedOptions?.[0];
  return cleanText(option?.textContent, cleanText(select?.value));
}

export function setupAiWorkbench(panel = document.getElementById("ai-image-panel")) {
  if (!panel || panel.dataset.aiWorkbenchReady === "true") return;
  panel.dataset.aiWorkbenchReady = "true";

  const results = panel.querySelector(".ai-results");
  const previews = panel.querySelector("[data-ai-previews]");
  const references = panel.querySelector("[data-ai-attachment-list]");
  const candidateSelect = panel.querySelector("[data-ai-candidate-select]");
  const sourceSelect = panel.querySelector("[data-ai-source-select]");
  const resultState = panel.querySelector("[data-ai-result-state]");
  const reviewSummary = panel.querySelector("[data-ai-review-summary]");
  const reviewMeta = panel.querySelector("[data-ai-review-meta]");
  const reviewChecks = panel.querySelector("[data-ai-review-checks]");
  const reviewIssues = panel.querySelector("[data-ai-review-issues]");
  const pixelInspection = panel.querySelector("[data-ai-pixel-inspection]");
  const pixelInspectionSummary = panel.querySelector("[data-ai-pixel-inspection-summary]");
  const pixelInspectionList = panel.querySelector("[data-ai-pixel-inspection-list]");
  const runtimeSummary = panel.querySelector("[data-ai-runtime-summary]");
  const advancedSummary = panel.querySelector("[data-ai-advanced-summary]");
  const modelSelect = panel.querySelector("[data-ai-model]");
  const effortSelect = panel.querySelector("[data-ai-effort]");
  const layoutButtons = Array.from(panel.querySelectorAll("[data-ai-layout-mode]"));
  const zoomValue = panel.querySelector("[data-ai-sync-zoom-value]");
  const generatedKeys = new WeakMap();
  const sourceKeys = new WeakMap();
  const paneAnimations = new WeakMap();
  const reports = new Map();
  const fittedCards = new WeakSet();
  let generatedSerial = 0;
  let sourceSerial = 0;
  let activeCandidateKey = "";
  let activeSourceKey = "";
  let zoom = 1;
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
    if (!sourceKeys.has(card)) sourceKeys.set(card, `ui-source-${++sourceSerial}`);
    return sourceKeys.get(card);
  };
  const activeCandidate = () => generatedCards().find((card) => candidateKey(card) === activeCandidateKey) || null;

  function cardFit(card) {
    const stage = card?.querySelector('.ai-preview-stage');
    const image = stage?.querySelector(':scope > img');
    if (!stage || !image?.naturalWidth || !image?.naturalHeight || !card.clientWidth || !card.clientHeight) return null;
    const style = getComputedStyle(card);
    const gap = parseFloat(style.rowGap || style.gap) || 0;
    const fixedHeight = Array.from(card.children).filter(child => child !== stage).reduce((sum, child) => sum + child.offsetHeight, 0);
    const availableWidth = Math.max(40, card.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    const availableHeight = Math.max(40, card.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - fixedHeight - gap * Math.max(0, card.children.length - 1));
    const ratio = image.naturalWidth / image.naturalHeight;
    return {stage, ratio, height: panel.dataset.aiResultView !== 'multiple' && card.classList.contains('ai-generated-card') && results?.classList.contains('mode-result') ? availableWidth / ratio : Math.min(availableHeight, availableWidth / ratio)};
  }

  function fitCardStage(card) {
    const fit = cardFit(card);
    if (!fit) return;
    const pair = results?.classList.contains('mode-side-by-side')
      ? [cardFit(activeCandidate()), cardFit(sourceCards().find(item => sourceKey(item) === activeSourceKey))].filter(Boolean)
      : [fit];
    const height = Math.floor(Math.min(...pair.map(item => item.height)));
    for (const item of pair) {
      const widthValue = `${Math.floor(height * item.ratio)}px`;
      const heightValue = `${height}px`;
      if (item.stage.style.width !== widthValue) item.stage.style.width = widthValue;
      if (item.stage.style.height !== heightValue) item.stage.style.height = heightValue;
    }
  }

  const stageResizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver((entries) => {
      if (panelLayoutChanging || zoom !== 1) return;
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
    results.classList.remove("mode-side-by-side", "mode-source", "mode-result");
    results.classList.add(`mode-${mode}`);
    for (const button of layoutButtons) {
      const selected = button.dataset.aiLayoutMode === mode;
      button.classList.toggle("is-on", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    if (fromUser) userChoseLayout = true;
    if (fromUser && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const panes = mode === "source"
        ? [results.querySelector(".ai-original-pane")]
        : mode === "result"
          ? [results.querySelector(".ai-result-pane")]
          : Array.from(results.querySelectorAll(".ai-image-pane"));
      for (const pane of panes.filter(Boolean)) {
        paneAnimations.get(pane)?.cancel();
        const offset = mode === "source" ? -6 : 6;
        const animation = pane.animate(
          [{ opacity: .72, transform: `translate3d(${offset}px, 0, 0)` }, { opacity: 1, transform: "translate3d(0, 0, 0)" }],
          { duration: 140, easing: "cubic-bezier(.2, .8, .2, 1)" },
        );
        paneAnimations.set(pane, animation);
      }
    }
    window.requestAnimationFrame(() => {
      fitCardStage(activeCandidate());
      fitCardStage(sourceCards().find((item) => sourceKey(item) === activeSourceKey));
    });
  }

  function updateResponsiveLayout() {
    const processing = Boolean(panel.querySelector("[data-ai-generating]:not([hidden])"));
    if (processing && !generatedCards().length) {
      setLayout("result");
      return;
    }
    if (userChoseLayout) return;
    setLayout(generatedCards().length ? "result" : sourceCards().length ? "source" : "result");
  }

  function applyZoom() {
    zoom = Math.min(2, Math.max(.6, Math.round(zoom * 10) / 10));
    if (zoomValue) zoomValue.textContent = `${Math.round(zoom * 100)}%`;
    for (const card of [activeCandidate(), sourceCards().find((item) => sourceKey(item) === activeSourceKey)]) {
      card?.style.setProperty("--ai-workbench-zoom", String(zoom));
    }
    for (const button of panel.querySelectorAll("[data-ai-sync-zoom]")) {
      if (button.dataset.aiSyncZoom === "out") button.disabled = zoom <= .6;
      if (button.dataset.aiSyncZoom === "in") button.disabled = zoom >= 2;
    }
  }

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

  function renderPixelInspection(values) {
    pixelInspectionList?.replaceChildren();
    const entries = Object.entries(values || {});
    if (pixelInspection) pixelInspection.hidden = entries.length === 0;
    if (pixelInspectionSummary) pixelInspectionSummary.textContent = entries.length ? `${entries.length}개 측정값` : "";
    for (const [key, value] of entries) {
      const term = document.createElement("dt");
      const description = document.createElement("dd");
      term.textContent = INSPECTION_LABELS[key] || key;
      if (typeof value === "boolean") description.textContent = value ? "예" : "아니오";
      else if (/Share$/.test(key) && Number.isFinite(Number(value))) description.textContent = `${(Number(value) * 100).toFixed(2)}%`;
      else description.textContent = cleanText(value, "측정값 없음");
      pixelInspectionList?.append(term, description);
    }
  }

  function renderReview(record) {
    const normalized = record || normalizeReviewDetail({ state: activeCandidate() ? "idle" : "idle" });
    const state = normalizeReviewState(normalized.state);
    const [defaultTitle, defaultDetail] = STATE_COPY[state];
    const hasCandidate = Boolean(activeCandidate());
    const title = !hasCandidate && state === "idle" ? "검수 대기" : defaultTitle;
    const detail = normalized.report?.verdict
      ? localizedToken(normalized.report.verdict, VERDICT_COPY)
      : (hasCandidate && state === "idle" ? "생성됨 · 검수 대기" : defaultDetail);

    if (reviewSummary) {
      reviewSummary.dataset.state = state;
      reviewSummary.replaceChildren();
      const strong = document.createElement("strong");
      const span = document.createElement("span");
      strong.textContent = title;
      span.textContent = detail;
      reviewSummary.append(strong, span);
    }

    if (reviewMeta) {
      const parts = [];
      if (normalized.generationCount != null) parts.push(`생성 ${normalized.generationCount}회`);
      if (normalized.reviewCount != null) parts.push(`검수 ${normalized.reviewCount}회`);
      if (normalized.model) parts.push(`모델 ${normalized.model}`);
      if (normalized.effort) parts.push(`추론 ${localizedToken(normalized.effort, EFFORT_COPY)}`);
      if (normalized.elapsedMs != null) parts.push(`${(normalized.elapsedMs / 1000).toFixed(1)}초`);
      reviewMeta.textContent = parts.join(" · ");
      reviewMeta.hidden = parts.length === 0;
    }

    reviewChecks?.replaceChildren();
    for (const check of normalized.report?.checks || []) {
      const row = document.createElement("div");
      row.className = "ai-review-check";
      row.dataset.status = check.status;
      const label = document.createElement("strong");
      const status = document.createElement("span");
      label.textContent = check.label;
      status.textContent = CHECK_COPY[check.status] || cleanText(check.status, CHECK_COPY.unknown);
      row.append(label, status);
      if (check.detail) {
        const detailNode = document.createElement("p");
        detailNode.textContent = check.detail;
        row.appendChild(detailNode);
      }
      reviewChecks?.appendChild(row);
    }

    renderPixelInspection(normalized.pixelInspection);

    reviewIssues?.replaceChildren();
    for (const issue of normalized.report?.issues || []) {
      const bbox = normalizeReviewBBox(issue.bbox);
      const node = document.createElement(bbox ? "button" : "div");
      node.className = "ai-review-issue";
      if (bbox) {
        node.type = "button";
        node.title = "결과 이미지에서 문제 위치 표시";
        node.addEventListener("click", () => {
          zoom = 1;
          applyZoom();
          window.requestAnimationFrame(() => highlightIssue(activeCandidate(), bbox));
        });
      }
      const severity = localizedToken(issue.severity, SEVERITY_COPY);
      const prefix = severity ? `[${severity}] ` : "";
      node.textContent = `${prefix}${issue.message}`;
      reviewIssues?.appendChild(node);
    }
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

    if (candidateSelect) {
      const previous = activeCandidateKey;
      candidateSelect.replaceChildren();
      if (!cards.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "생성 결과 없음";
        candidateSelect.appendChild(option);
        candidateSelect.disabled = true;
      } else {
        cards.forEach((card, index) => {
          const option = document.createElement("option");
          option.value = candidateKey(card);
          option.textContent = cardTitle(card, `생성 결과 ${cards.length - index}`);
          candidateSelect.appendChild(option);
        });
        candidateSelect.disabled = false;
        candidateSelect.value = previous;
      }
    }

    for (const card of cards) {
      card.classList.toggle("is-ai-active-candidate", candidateKey(card) === activeCandidateKey);
      watchCardFit(card);
    }
    applyZoom();
    window.requestAnimationFrame(() => fitCardStage(activeCandidate()));
    const report = reports.get(activeCandidateKey) || normalizeReviewDetail({ state: stateForCard(activeCandidate()) });
    renderReview(report);
    updateResultState(report);
    syncWorkbenchStage();
  }

  function syncSources() {
    const cards = sourceCards();
    const keys = cards.map(sourceKey);
    if (!keys.includes(activeSourceKey)) activeSourceKey = keys[0] || "";
    if (sourceSelect) {
      const picker = sourceSelect.closest("[data-ai-source-picker]");
      if (picker) picker.hidden = cards.length <= 1;
      sourceSelect.replaceChildren();
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
        sourceSelect.disabled = cards.length <= 1;
        sourceSelect.value = activeSourceKey;
      }
    }
    for (const card of cards) {
      card.classList.toggle("is-ai-active-source", sourceKey(card) === activeSourceKey);
      watchCardFit(card);
    }
    applyZoom();
    window.requestAnimationFrame(() => fitCardStage(cards.find((card) => sourceKey(card) === activeSourceKey)));
  }

  function syncRuntimeSummary() {
    const model = selectedLabel(modelSelect);
    const effort = effortSelect?.value || selectedLabel(effortSelect);
    const text = generatedCards().length ? formatRuntimeSummary(model, effort).replace(" / 검수 Sol · 높음", " · 자동 검수 없음") : "첫 변환 gpt-5.6-sol · 보통 · priority · 자동 검수 없음";
    if (runtimeSummary) runtimeSummary.textContent = text;
    if (advancedSummary) advancedSummary.textContent = text.replace(" / 검수 Sol · 높음", "");
  }

  layoutButtons.forEach((button) => button.addEventListener("click", () => setLayout(button.dataset.aiLayoutMode, true)));
  panel.querySelectorAll("[data-ai-sync-zoom]").forEach((button) => button.addEventListener("click", () => {
    const action = button.dataset.aiSyncZoom;
    zoom = action === "in" ? zoom + .2 : action === "out" ? zoom - .2 : 1;
    applyZoom();
  }));
  candidateSelect?.addEventListener("change", () => {
    activeCandidateKey = candidateSelect.value;
    panel.dataset.aiSelectedCandidateId = activeCandidateKey;
    clearIssueHighlight();
    syncCandidates();
    const candidateId = activeCandidate()?.dataset.aiCandidateId;
    if (candidateId) panel.dispatchEvent(new CustomEvent("5e:ai-candidate-select", {
      detail: { candidateId },
    }));
  });
  sourceSelect?.addEventListener("change", () => {
    activeSourceKey = sourceSelect.value;
    syncSources();
  });
  modelSelect?.addEventListener("change", syncRuntimeSummary);
  effortSelect?.addEventListener("change", syncRuntimeSummary);
  panel.addEventListener("click", (event) => {
    if (!event.target.closest('[aria-label="수정 요청 영역 지정"]')) return;
    zoom = 1;
    applyZoom();
  }, true);

  panel.addEventListener("5e:ai-review", (event) => {
    const record = normalizeReviewDetail(event.detail);
    if (record.candidateId) reports.set(record.candidateId, record);
    const matchesActive = !record.candidateId || record.candidateId === activeCandidateKey
      || activeCandidate()?.dataset.aiCandidateId === record.candidateId;
    if (matchesActive) {
      renderReview(record);
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

  const settingsObserver = new MutationObserver(syncRuntimeSummary);
  if (modelSelect) settingsObserver.observe(modelSelect, { childList: true, subtree: true });
  if (effortSelect) settingsObserver.observe(effortSelect, { childList: true, subtree: true });

  window.addEventListener("5e:image-panel-layout-will-change", (event) => {
    if (event.detail?.root === panel) panelLayoutChanging = true;
  });
  window.addEventListener("5e:image-panel-layout-did-change", (event) => {
    if (event.detail?.root !== panel) return;
    window.requestAnimationFrame(() => {
      panelLayoutChanging = false;
      if (zoom !== 1) return;
      fitCardStage(activeCandidate());
      fitCardStage(sourceCards().find((item) => sourceKey(item) === activeSourceKey));
    });
  });

  const narrowQuery = window.matchMedia("(max-width: 1000px)");
  narrowQuery.addEventListener?.("change", updateResponsiveLayout);
  updateResponsiveLayout();
  syncCandidates();
  knownGeneratedCount = generatedCards().length;
  syncSources();
  syncRuntimeSummary();
  syncWorkbenchStage();
  applyZoom();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setupAiWorkbench(), { once: true });
  else setupAiWorkbench();
}

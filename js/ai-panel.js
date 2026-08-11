import { insertImageFromSrc } from "./image-paste.js?v=1.4.0";
import { buildDiscussionPrompt, buildImagePrompt } from "./ai-prompt.js?v=1.5.5";
import { IMAGE_BACKGROUND_VERSION, transparentizeGeneratedImage } from "./image-background.js?v=1.5.4";
import { parseAiEvent } from "./ai-events.js?v=1.5.3";
import {
  AI_IMAGE_TRANSPORT_VERSION,
  createCheapImageSignature,
  prepareAIImageForTransport,
} from "./ai-image-transport.js?v=1.5.3";
import {
  compactConversation,
  markImagesSent,
  selectOutgoingImageItems,
} from "./ai-request-plan.js?v=1.5.3";
import { buildFastScenePrompt, FAST_SCENE_PROMPT_VERSION } from "./ai-scene-prompt.js?v=1.5.3";
import { chooseImageEngine, IMAGE_ENGINE_IDS } from "./ai-engine-router.js?v=1.5.3";
import { compileFastScene } from "./ai-scene-fastpath.js?v=1.5.3";
import {
  compileFastSceneWithMotifs,
  expandAiMotifScene,
  MOTIF_CATALOG_VERSION,
} from "./ai-motif-catalog.js?v=1.5.3";
import {
  LOCAL_ASSET_ROUTER_VERSION,
  matchLocalAssetRequest,
} from "./ai-local-asset-router.js?v=1.5.3";
import { fastSceneToSvgDataUrl, insertFastSceneIntoState } from "./ai-scene-preview.js?v=1.5.3";
import {
  buildExactOutputCacheDescriptor,
  createExactOutputCacheKey,
  createRemoteImageInputPlan,
  REMOTE_INPUT_PLAN_VERSION,
} from "./ai-remote-input-plan.js?v=1.5.3";
import {
  composeRemoteImageInputPlan,
  REMOTE_COMPOSITOR_VERSION,
} from "./ai-remote-compositor.js?v=1.5.3";
import { createExactOutputCacheStore } from "./ai-output-cache-store.js?v=1.5.3";
import { createAiReferenceSearch } from "./ai-reference-search.js?v=1.5.6";
import {
  AI_OUTPUT_ENGINES,
  AI_QUALITY_MODES,
  normalizeOutputEngine,
  normalizeQualityMode,
  qualityModeCacheVersion,
} from "./ai-quality-mode.js?v=1.5.5";

const RASTER_STYLE_VERSION = "kice-raster-v2";
const RASTER_ENGINE_VERSION = `imagegen-one-shot-v2+${REMOTE_INPUT_PLAN_VERSION}+${REMOTE_COMPOSITOR_VERSION}+${AI_IMAGE_TRANSPORT_VERSION}+${IMAGE_BACKGROUND_VERSION}`;
const FAST_SCENE_PANEL_COMPILE_VERSION = "motif-direct-v1";

export function compilePanelScene(input, options) {
  try {
    const expanded = expandAiMotifScene(input);
    return {
      // Compile the original request so audited motif shortcuts retain their
      // direct compiler metadata and semantic object grouping. The expanded
      // scene remains the canonical editable/revision source.
      result: compileFastSceneWithMotifs(input, options),
      source: JSON.stringify(expanded),
      compileSource: typeof input === "string" ? input : JSON.stringify(input),
      expansionError: null,
    };
  } catch (error) {
    return {
      result: compileFastScene(input, options),
      source: String(input || ""),
      compileSource: String(input || ""),
      expansionError: error,
    };
  }
}

function snapshotImageItem(item) {
  return {
    id: item?.id || null,
    name: item?.name || "이미지",
    data: item?.data || null,
    kind: item?.kind || "reference",
    sourceKind: item?.sourceKind || "auto",
    primary: item?.primary === true,
    active: item?.active !== false,
    stale: item?.stale === true,
    superseded: item?.superseded === true,
    createdAt: item?.createdAt || null,
    updatedAt: item?.updatedAt || null,
    sentConversationId: item?.sentConversationId || null,
    sentSource: item?.sentSource || null,
    sceneSource: item?.sceneSource || "",
    sceneCompileSource: item?.sceneCompileSource || "",
    sceneResult: item?.sceneResult || null,
    engine: item?.engine || null,
    postprocessOk: item?.postprocessOk === true,
    nextCommentNumber: item?.nextCommentNumber || ((item?.comments || []).length + 1),
    comments: (item?.comments || []).map((comment) => ({ ...comment })),
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("이미지를 읽지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}

async function sourceToDataUrl(src) {
  if (typeof src !== "string" || !src) throw new Error("참고 이미지 주소가 없습니다.");
  if (/^data:image\//.test(src)) return src;
  const response = await fetch(src);
  if (!response.ok) throw new Error(`참고 이미지 불러오기 실패 (HTTP ${response.status})`);
  return blobToDataUrl(await response.blob());
}

function formatK(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "정보 없음";
  return `${(number / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}K`;
}

function findNumber(value, keys) {
  if (!value || typeof value !== "object") return null;
  for (const key of keys) if (Number.isFinite(Number(value[key]))) return Number(value[key]);
  for (const nested of Object.values(value)) {
    const found = findNumber(nested, keys);
    if (found != null) return found;
  }
  return null;
}

export function initAiPanel(state) {
  const panel = document.getElementById("ai-image-panel");
  if (!panel) return;

  const modal = panel.querySelector(".modal-ai");
  const status = panel.querySelector("[data-ai-status]");
  const log = panel.querySelector("[data-ai-log]");
  const input = panel.querySelector("[data-ai-input]");
  const file = panel.querySelector("input[type=file]");
  const previews = panel.querySelector("[data-ai-previews]");
  const attachmentList = panel.querySelector("[data-ai-attachment-list]");
  const referenceCount = panel.querySelector("[data-ai-reference-count]");
  const referenceSection = panel.querySelector(".ai-reference-section");
  const generating = panel.querySelector("[data-ai-generating]");
  const progressTitle = panel.querySelector("[data-ai-progress-title]");
  const progressDetail = panel.querySelector("[data-ai-progress-detail]");
  const progressStage = panel.querySelector("[data-ai-progress-stage]");
  const eCount = panel.querySelector("[data-ai-e-count]");
  const sendButton = panel.querySelector("[data-ai-send]");
  const chatButton = panel.querySelector("[data-ai-chat-send]");
  const newButton = panel.querySelector("[data-ai-new]");
  const compareButton = panel.querySelector("[data-ai-compare]");
  const captureButton = panel.querySelector("[data-ai-capture]");
  const referenceSearchButton = panel.querySelector("[data-ai-reference-search]");
  const loginButton = panel.querySelector("[data-ai-login]");
  const modelSelect = panel.querySelector("[data-ai-model]");
  const modelWarning = panel.querySelector("[data-ai-model-warning]");
  const effortSelect = panel.querySelector("[data-ai-effort]");
  const speedSelect = panel.querySelector("[data-ai-speed]");
  const accountText = panel.querySelector("[data-ai-account]");
  const limitText = panel.querySelector("[data-ai-limit]");
  const accountTokensText = panel.querySelector("[data-ai-account-tokens]");
  const modeButtons = Array.from(panel.querySelectorAll("[data-ai-mode]"));
  const qualityButtons = Array.from(panel.querySelectorAll("[data-ai-quality]"));
  const outputEngineButtons = Array.from(panel.querySelectorAll("[data-ai-output-engine]"));
  const batchButton = panel.querySelector("[data-ai-batch]");
  const batchPanel = panel.querySelector("[data-ai-batch-panel]");
  const batchGrid = panel.querySelector("[data-ai-batch-grid]");
  const batchSummary = panel.querySelector("[data-ai-batch-summary]");
  const tabList = panel.querySelector("[data-ai-tab-list]");
  const tabNewButton = panel.querySelector("[data-ai-tab-new]");

  let attachments = [];
  let generatedImages = [];
  let imageSerial = 0;
  let conversationId = localStorage.getItem("5e.aiConversationId") || null;
  let forceNewConversation = false;
  let busy = false;
  let imageReceived = false;
  let currentTurnType = "chat";
  let currentTurnUsage = null;
  let currentTurnPerformance = null;
  let currentTurnDone = false;
  let currentTurnId = null;
  let currentRenderThreadId = null;
  let awaitingTurnId = false;
  let queuedTurnEvents = [];
  let currentRequestEpoch = 0;
  let serverTurnFinished = false;
  let previewPending = false;
  let tokenFooterNode = null;
  let currentTurnStartedAt = 0;
  let latestGeneratedSrc = null;
  let currentEngine = IMAGE_ENGINE_IDS.RASTER;
  let currentSceneResponse = "";
  let currentCacheRequest = null;
  let currentRequestSnapshot = null;
  let currentRunInput = null;
  let availableModels = [];
  let modelsLoaded = false;
  let selectedMode = localStorage.getItem("5e.aiMode") || "diagram";
  let selectedQualityMode = normalizeQualityMode(localStorage.getItem("5e.aiQualityMode") || AI_QUALITY_MODES.STANDARD);
  let selectedOutputEngine = normalizeOutputEngine(localStorage.getItem("5e.aiOutputEngine") || AI_OUTPUT_ENGINES.RASTER);
  let taskTabSerial = 0;
  let activeTaskTabId = null;
  const taskTabs = new Map();
  const batchRuns = new Map();
  const unclaimedBatchEvents = [];
  let batchActive = false;
  let conversationMessages = [];
  let outputCache = null;
  try { outputCache = createExactOutputCacheStore(); } catch {}
  try {
    const storedMessages = JSON.parse(localStorage.getItem("5e.aiConversationMessages") || "[]");
    if (Array.isArray(storedMessages)) conversationMessages = storedMessages.slice(-20);
  } catch {}

  const saveConversationMessages = () => {
    const bounded = conversationMessages.slice(-20);
    localStorage.setItem("5e.aiConversationMessages", JSON.stringify(bounded));
  };
  const recordConversationMessage = (role, text) => {
    const value = String(text || "").trim();
    if (!value) return;
    conversationMessages.push({ role, text: value.slice(0, 4000) });
    conversationMessages = conversationMessages.slice(-20);
    saveConversationMessages();
  };

  const persistPerformance = (metrics) => {
    if (!metrics || typeof metrics !== "object") return;
    try {
      const key = "5e.aiPerformance.v1";
      const history = JSON.parse(localStorage.getItem(key) || "[]");
      const records = Array.isArray(history) ? history : [];
      records.push({
        at: new Date().toISOString(),
        model: modelSelect?.value || null,
        effort: effortSelect?.value || null,
        serviceTier: speedSelect?.value || null,
        ...metrics,
      });
      localStorage.setItem(key, JSON.stringify(records.slice(-50)));
    } catch {}
  };

  const prepareTransportItem = async (item) => {
    const ensureBase64Transport = (dataUrl) => {
      const comma = typeof dataUrl === "string" ? dataUrl.indexOf(",") : -1;
      const header = comma >= 0 ? dataUrl.slice(0, comma) : "";
      if (!/^data:image\//i.test(header) || !/;base64$/i.test(header) || /^data:image\/svg\+xml/i.test(header)) {
        throw new Error(`${item.name}: AI 전송용 래스터 이미지로 변환하지 못했습니다.`);
      }
    };
    const sourceSignature = createCheapImageSignature(item.data);
    if (item.aiTransport?.sourceSignature === sourceSignature) {
      ensureBase64Transport(item.aiTransport.transportDataUrl);
      if (item.aiTransport.transportDataUrl.length > 11_000_000) {
        throw new Error(`${item.name}: 참고 이미지 최적화에 실패해 8MB 제한을 넘었습니다.`);
      }
      return { name: item.name, data: item.aiTransport.transportDataUrl };
    }
    const prepared = await prepareAIImageForTransport(item.data, {
      contentKind: item.kind === "generated" ? "line-art" : (item.sourceKind || "auto"),
      preservePng: item.sourceKind !== "capture",
    });
    item.aiTransport = prepared;
    ensureBase64Transport(prepared.transportDataUrl);
    if (prepared.transportDataUrl.length > 11_000_000) {
      throw new Error(`${item.name}: 참고 이미지 최적화에 실패해 8MB 제한을 넘었습니다.`);
    }
    return { name: item.name, data: prepared.transportDataUrl };
  };

  const effortLabels = {
    minimal: "최소 · 가장 빠름", low: "낮음 · 빠름", medium: "보통",
    high: "높음 · 정밀", xhigh: "매우 높음", max: "최대", ultra: "울트라",
  };

  const addLog = (text, kind = "assistant") => {
    if (!text) return null;
    log.querySelector("[data-ai-log-empty]")?.remove();
    const message = document.createElement("div");
    message.className = `ai-msg ${kind}`;
    message.textContent = text;
    log.appendChild(message);
    log.scrollTop = log.scrollHeight;
    return message;
  };
  const addTokenFooter = (usage) => {
    const total = findNumber(usage, ["totalTokens", "total_tokens"]);
    const inputTokens = findNumber(usage, ["inputTokens", "input_tokens"]);
    const outputTokens = findNumber(usage, ["outputTokens", "output_tokens"]);
    const measuredMs = Number(currentTurnPerformance?.totalMs);
    const elapsedSeconds = Number.isFinite(measuredMs)
      ? Math.max(1, Math.round(measuredMs / 1000))
      : (currentTurnStartedAt ? Math.max(1, Math.round((Date.now() - currentTurnStartedAt) / 1000)) : null);
    if (total == null && inputTokens == null && outputTokens == null && elapsedSeconds == null) return;
    if (!tokenFooterNode) {
      tokenFooterNode = document.createElement("div");
      tokenFooterNode.className = "ai-turn-usage";
      log.appendChild(tokenFooterNode);
    }
    const imageCalls = findNumber(currentTurnPerformance, ["imageCallCount"]);
    const renderMs = findNumber(currentTurnPerformance, ["imageToolMs"]);
    const sceneCompileMs = findNumber(currentTurnPerformance, ["sceneCompileMs"]);
    tokenFooterNode.textContent = [
      currentTurnPerformance?.cacheHit ? "동일 결과 즉시 재사용" : null,
      currentTurnPerformance?.engine === IMAGE_ENGINE_IDS.FAST_SCENE ? "빠른 벡터 경로" : null,
      elapsedSeconds != null ? `소요 ${elapsedSeconds}초` : null,
      sceneCompileMs != null ? `벡터 변환 ${sceneCompileMs.toFixed(1)}ms` : null,
      renderMs != null ? `이미지 서버 ${(renderMs / 1000).toFixed(1)}초` : null,
      imageCalls != null ? `생성 호출 ${imageCalls}회` : null,
      total != null ? `이번 작업 ${formatK(total)} 토큰` : null,
      inputTokens != null ? `입력 ${formatK(inputTokens)}` : null,
      outputTokens != null ? `출력 ${formatK(outputTokens)}` : null,
    ].filter(Boolean).join(" · ");
    log.scrollTop = log.scrollHeight;
  };
  const setStatus = (text, kind = "") => {
    status.textContent = text;
    status.dataset.kind = kind;
  };
  const setGenerating = (on, title = "이미지를 생성하고 있습니다", detail = "요청의 구조와 배치를 분석하고 있습니다.", phase = "analyze") => {
    generating.hidden = !on;
    progressTitle.textContent = title;
    progressDetail.textContent = detail;
    if (progressStage) progressStage.dataset.aiProgressStage = phase;
    if (generating) generating.dataset.aiPhase = phase;
    if (eCount) eCount.textContent = String(({ analyze: 1, compose: 2, render: 3, finish: 4 })[phase] || 1);
  };
  const setBusy = (on) => {
    busy = on;
    sendButton.disabled = on;
    chatButton.disabled = on;
    if (newButton) newButton.disabled = on;
    for (const control of [modelSelect, effortSelect, speedSelect, referenceSearchButton, captureButton, file]) {
      if (control) control.disabled = on;
    }
    modeButtons.forEach((button) => { button.disabled = on; });
    qualityButtons.forEach((button) => { button.disabled = on; });
    outputEngineButtons.forEach((button) => { button.disabled = on; });
    if (batchButton) batchButton.disabled = on || attachments.length < 2;
    if (tabNewButton) tabNewButton.disabled = on;
    panel.querySelectorAll("[data-ai-input-mutator]").forEach((control) => { control.disabled = on; });
    const cancelButton = panel.querySelector("[data-ai-interrupt]");
    cancelButton.disabled = !on;
    cancelButton.hidden = !on;
  };
  const syncMode = () => {
    modeButtons.forEach((button) => {
      const active = button.dataset.aiMode === selectedMode;
      button.classList.toggle("is-on", active);
      button.setAttribute("aria-pressed", String(active));
    });
  };
  const syncQualityMode = () => {
    qualityButtons.forEach((button) => {
      const active = button.dataset.aiQuality === selectedQualityMode;
      button.classList.toggle("is-on", active);
      button.setAttribute("aria-pressed", String(active));
    });
  };
  const syncOutputEngine = () => {
    outputEngineButtons.forEach((button) => {
      const active = button.dataset.aiOutputEngine === selectedOutputEngine;
      button.classList.toggle("is-on", active);
      button.setAttribute("aria-pressed", String(active));
    });
  };
  const syncReferenceSummary = () => {
    referenceCount.textContent = String(attachments.length);
    const empty = attachmentList.querySelector("[data-ai-reference-empty]");
    if (empty) empty.hidden = attachments.length > 0;
    if (attachments.length && referenceSection) referenceSection.open = true;
    if (batchButton) batchButton.disabled = busy || attachments.length < 2;
  };

  const selectedModel = () => availableModels.find((item) => (item.model || item.id) === modelSelect.value);
  const isLunaModel = (item = selectedModel()) => /luna/i.test(`${item?.model || item?.id || modelSelect.value || ""} ${item?.displayName || ""}`);
  const syncModelWarning = () => {
    if (!modelWarning) return;
    modelWarning.hidden = !modelSelect.value || isLunaModel();
  };
  const populateEfforts = () => {
    const model = selectedModel();
    const supported = model?.supportedReasoningEfforts || [];
    const savedEffort = localStorage.getItem("5e.aiEffort");
    const supportsLow = supported.some((option) => (option.reasoningEffort || option.effort || option) === "low");
    const previous = savedEffort || (supportsLow ? "low" : (model?.defaultReasoningEffort || "medium"));
    effortSelect.replaceChildren();
    for (const option of supported) {
      const value = option.reasoningEffort || option.effort || option;
      const node = new Option(effortLabels[value] || value, value);
      if (option.description) node.title = option.description;
      effortSelect.add(node);
    }
    if (!effortSelect.options.length) {
      for (const value of ["low", "medium", "high"]) effortSelect.add(new Option(effortLabels[value], value));
    }
    effortSelect.value = Array.from(effortSelect.options).some((option) => option.value === previous)
      ? previous : (model?.defaultReasoningEffort || effortSelect.options[0].value);
    localStorage.setItem("5e.aiEffort", effortSelect.value);
  };
  const populateSpeeds = () => {
    const model = selectedModel();
    const tiers = Array.isArray(model?.serviceTiers) ? model.serviceTiers : [];
    const saved = localStorage.getItem("5e.aiSpeed");
    speedSelect.replaceChildren();
    if (!tiers.length) {
      speedSelect.add(new Option("표준", ""));
    } else {
      for (const tier of tiers) {
        const value = typeof tier === "string" ? tier : (tier.serviceTier || tier.id || tier.value || "");
        const label = typeof tier === "object" && (tier.displayName || tier.name)
          ? (tier.displayName || tier.name)
          : (value === "priority" ? "빠름" : value === "flex" ? "유동" : "표준");
        if (!Array.from(speedSelect.options).some((option) => option.value === value)) speedSelect.add(new Option(label, value));
      }
    }
    const hasPriority = Array.from(speedSelect.options).some((option) => option.value === "priority");
    const fallback = hasPriority ? "priority" : (model?.defaultServiceTier || speedSelect.options[0]?.value || "");
    speedSelect.value = Array.from(speedSelect.options).some((option) => option.value === saved) ? saved : fallback;
    localStorage.setItem("5e.aiSpeed", speedSelect.value);
  };
  const loadModels = async () => {
    if (modelsLoaded || !window.fiveEDesktop?.models) return;
    try {
      const result = await window.fiveEDesktop.models();
      availableModels = Array.isArray(result?.data) ? result.data.filter((item) => !item.hidden) : [];
      modelSelect.replaceChildren();
      for (const item of availableModels) modelSelect.add(new Option(item.displayName || item.model || item.id, item.model || item.id));
      if (!modelSelect.options.length) modelSelect.add(new Option("기본 모델", ""));
      const sessionChoice = sessionStorage.getItem("5e.aiModelExplicit");
      const preferred = availableModels.find((item) => (item.model || item.id) === sessionChoice)
        || availableModels.find((item) => /luna/i.test(`${item.model || item.id} ${item.displayName || ""}`))
        || availableModels.find((item) => item.isDefault) || availableModels[0];
      modelSelect.value = preferred ? (preferred.model || preferred.id) : "";
      localStorage.setItem("5e.aiModel", modelSelect.value);
      modelsLoaded = true;
      syncModelWarning();
      populateEfforts();
      populateSpeeds();
    } catch {
      modelSelect.replaceChildren(new Option("기본 모델", ""));
      syncModelWarning();
      populateEfforts();
      populateSpeeds();
    }
  };
  const renderLimits = (limits) => {
    const root = limits?.rateLimits || limits;
    const values = [root?.primary, root?.secondary]
      .map((item) => Number(item?.usedPercent)).filter(Number.isFinite)
      .map((used) => Math.max(0, Math.round(100 - used)));
    limitText.textContent = values.length ? `잔여 한도 ${values.map((value) => `${value}%`).join(" / ")}` : "잔여 한도 정보 없음";
  };
  const loadAccountOverview = async () => {
    if (!window.fiveEDesktop?.account) return;
    try {
      const overview = await window.fiveEDesktop.account();
      const account = overview?.account?.account || overview?.account || {};
      const identity = account.email || account.name || (account.type === "apiKey" ? "API 키 계정" : "로그인 계정");
      accountText.textContent = `${identity}${account.planType ? ` · ${account.planType}` : ""}`;
      renderLimits(overview?.limits);
      const lifetime = findNumber(overview?.usage, ["totalTokens", "lifetimeTokens", "total_tokens"]);
      accountTokensText.textContent = lifetime == null ? "누적 토큰 정보 없음" : `누적 ${formatK(lifetime)} 토큰`;
    } catch {
      accountText.textContent = "계정 정보 없음";
      limitText.textContent = "잔여 한도 정보 없음";
      accountTokensText.textContent = "누적 토큰 정보 없음";
    }
  };

  const openViewer = (src) => {
    const viewer = document.createElement("div");
    viewer.className = "ai-image-viewer";
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-label", "이미지 크게 보기");
    const large = document.createElement("img");
    large.src = src;
    large.alt = "확대 이미지";
    viewer.appendChild(large);
    viewer.addEventListener("click", () => viewer.remove());
    document.body.appendChild(viewer);
  };

  const renderComments = (item, stage, list) => {
    stage.querySelectorAll(".ai-selection-box").forEach((box) => box.remove());
    list.replaceChildren();
    const details = list.closest(".ai-comment-details");
    const summary = details?.querySelector("summary");
    if (summary) summary.textContent = item.comments.length ? `영역 요청 ${item.comments.length}개` : "영역 요청 없음";
    if (details && item.comments.some((comment) => comment.focusOnRender)) details.open = true;
    for (const comment of item.comments) {
      const box = document.createElement("div");
      box.className = "ai-selection-box";
      box.style.left = `${comment.x}%`;
      box.style.top = `${comment.y}%`;
      box.style.width = `${comment.w}%`;
      box.style.height = `${comment.h}%`;
      const badge = document.createElement("span");
      badge.textContent = String(comment.number);
      box.appendChild(badge);
      stage.appendChild(box);

      const row = document.createElement("div");
      row.className = "ai-comment-row";
      const number = document.createElement("span");
      number.textContent = String(comment.number);
      const editor = document.createElement("input");
      editor.type = "text";
      editor.dataset.aiInputMutator = "";
      editor.disabled = busy;
      editor.value = comment.text;
      editor.placeholder = "이 영역에 대한 요청을 입력하세요";
      editor.addEventListener("input", () => { if (!busy) comment.text = editor.value; });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.aiInputMutator = "";
      remove.disabled = busy;
      remove.textContent = "삭제";
      remove.onclick = () => {
        if (busy) return;
        item.comments = item.comments.filter((candidate) => candidate !== comment);
        renderComments(item, stage, list);
      };
      row.append(number, editor, remove);
      list.appendChild(row);
      if (comment.focusOnRender) {
        delete comment.focusOnRender;
        requestAnimationFrame(() => editor.focus());
      }
    }
  };

  const enableAreaComments = (item, stage, img, toggleButton, list) => {
    let start = null;
    let draft = null;
    const point = (event) => {
      const rect = img.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
        y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
      };
    };
    const updateDraft = (from, to) => {
      if (!draft) return;
      draft.style.left = `${Math.min(from.x, to.x)}%`;
      draft.style.top = `${Math.min(from.y, to.y)}%`;
      draft.style.width = `${Math.abs(to.x - from.x)}%`;
      draft.style.height = `${Math.abs(to.y - from.y)}%`;
    };
    toggleButton.onclick = () => {
      if (busy) return;
      const active = !stage.classList.contains("is-annotating");
      stage.classList.toggle("is-annotating", active);
      toggleButton.classList.toggle("is-on", active);
      const label = active ? "수정할 영역을 드래그하세요" : "수정 요청 영역 지정";
      toggleButton.title = label;
      toggleButton.setAttribute("aria-label", label);
    };
    stage.addEventListener("pointerdown", (event) => {
      if (!stage.classList.contains("is-annotating") || event.target !== img) return;
      event.preventDefault();
      start = point(event);
      draft = document.createElement("div");
      draft.className = "ai-selection-box is-draft";
      stage.appendChild(draft);
      updateDraft(start, start);
      try { stage.setPointerCapture?.(event.pointerId); } catch {}
    });
    stage.addEventListener("pointermove", (event) => {
      if (!start || !draft) return;
      updateDraft(start, point(event));
    });
    const finish = (event) => {
      if (!start || !draft) return;
      const end = point(event);
      draft.remove();
      draft = null;
      const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
      const w = Math.abs(end.x - start.x), h = Math.abs(end.y - start.y);
      start = null;
      if (w < 1.5 || h < 1.5) return;
      const number = item.nextCommentNumber++;
      item.comments.push({ number, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), text: "", focusOnRender: true });
      stage.classList.remove("is-annotating");
      toggleButton.classList.remove("is-on");
      toggleButton.title = "수정 요청 영역 지정";
      toggleButton.setAttribute("aria-label", "수정 요청 영역 지정");
      renderComments(item, stage, list);
    };
    stage.addEventListener("pointerup", finish);
    stage.addEventListener("pointercancel", () => {
      start = null;
      draft?.remove();
      draft = null;
    });
  };

  const makeImageCard = (item) => {
    const card = document.createElement("article");
    card.className = `ai-preview-card ai-image-card ${item.kind === "reference" ? "ai-reference-card" : "ai-generated-card"}`;
    item.card = card;
    const head = document.createElement("div");
    head.className = "ai-image-card-head";
    const name = document.createElement("strong");
    name.textContent = item.name;
    head.append(name);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.aiInputMutator = "";
    remove.disabled = busy;
    remove.textContent = "×";
    remove.title = "이미지 제거";
    remove.onclick = () => {
      if (busy) return;
      if (item.kind === "reference") attachments = attachments.filter((candidate) => candidate !== item);
      else {
        generatedImages = generatedImages.filter((candidate) => candidate !== item);
        latestGeneratedSrc = generatedImages.at(-1)?.data || null;
      }
      card.remove();
      if (item.kind === "reference") syncReferenceSummary();
      if (!generatedImages.length && !previews.querySelector("[data-ai-empty]")) {
        const empty = document.createElement("p");
        empty.className = "ai-empty";
        empty.dataset.aiEmpty = "";
        empty.textContent = "생성된 이미지가 여기에 표시됩니다.";
        previews.appendChild(empty);
      }
    };
    head.appendChild(remove);

    const stage = document.createElement("div");
    stage.className = "ai-preview-stage";
    const img = document.createElement("img");
    img.src = item.data;
    img.alt = item.name;
    stage.appendChild(img);
    if (item.kind === "generated") {
      const output = document.createElement("button");
      output.type = "button";
      output.className = "ai-canvas-output";
      output.textContent = "캔버스로 출력";
      output.onclick = () => {
        if (item.sceneResult?.objects?.length) {
          try {
            const inserted = insertFastSceneIntoState(state, item.sceneResult);
            addLog(`편집 가능한 벡터 오브젝트 ${inserted.added}개를 캔버스에 출력했습니다.`);
          } catch (error) {
            addLog(`캔버스 출력 실패: ${error.message}`, "error");
          }
          return;
        }
        void insertImageFromSrc(state, item.data)
          .catch((error) => addLog(`캔버스 출력 실패: ${error.message}`, "error"));
      };
      stage.appendChild(output);
    }

    const actions = document.createElement("div");
    actions.className = "ai-preview-actions";
    let zoomLevel = 1;
    const zoomOut = document.createElement("button");
    zoomOut.type = "button";
    zoomOut.textContent = "−";
    zoomOut.title = "미리보기 축소";
    zoomOut.setAttribute("aria-label", "미리보기 축소");
    const zoomValue = document.createElement("span");
    zoomValue.className = "ai-zoom-value";
    const zoomIn = document.createElement("button");
    zoomIn.type = "button";
    zoomIn.textContent = "+";
    zoomIn.title = "미리보기 확대";
    zoomIn.setAttribute("aria-label", "미리보기 확대");
    const applyZoom = () => {
      img.style.height = `${Math.round((item.kind === "reference" ? 145 : 430) * zoomLevel)}px`;
      zoomValue.textContent = `${Math.round(zoomLevel * 100)}%`;
      zoomOut.disabled = zoomLevel <= 0.6;
      zoomIn.disabled = zoomLevel >= 2;
    };
    zoomOut.onclick = () => { zoomLevel = Math.max(0.6, Math.round((zoomLevel - 0.2) * 10) / 10); applyZoom(); };
    zoomIn.onclick = () => { zoomLevel = Math.min(2, Math.round((zoomLevel + 0.2) * 10) / 10); applyZoom(); };
    const annotate = document.createElement("button");
    annotate.type = "button";
    annotate.dataset.aiInputMutator = "";
    annotate.disabled = busy;
    annotate.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 14.5V17h2.5L15 8.5 11.5 5z"/><path d="m10.8 5.7 3.5 3.5"/></svg>';
    annotate.title = "수정 요청 영역 지정";
    annotate.setAttribute("aria-label", "수정 요청 영역 지정");
    actions.append(zoomOut, zoomValue, zoomIn, annotate);
    actions.classList.add("ai-preview-actions-head");
    head.insertBefore(actions, remove);
    applyZoom();
    const commentList = document.createElement("div");
    commentList.className = "ai-comment-list";
    enableAreaComments(item, stage, img, annotate, commentList);
    const commentDetails = document.createElement("details");
    commentDetails.className = "ai-comment-details";
    const commentSummary = document.createElement("summary");
    commentSummary.textContent = "영역 요청 없음";
    commentDetails.append(commentSummary, commentList);
    renderComments(item, stage, commentList);
    card.append(head, stage, commentDetails);
    return card;
  };

  const addReferenceData = ({ data, name = "참고 이미지", sourceKind = "auto" }) => {
    const item = { id: `reference-${++imageSerial}`, name, data, kind: "reference", sourceKind, comments: [], nextCommentNumber: 1 };
    attachments.push(item);
    attachmentList.appendChild(makeImageCard(item));
    syncReferenceSummary();
    const tab = taskTabs.get(activeTaskTabId);
    if (tab && /^작업 \d+$/.test(tab.title) && attachments.length === 1) {
      tab.title = String(name || tab.title).replace(/\.[^.]+$/, "").slice(0, 22) || tab.title;
      renderTaskTabs();
    }
    return item;
  };
  const attachReference = async ({ src, name = "참고 이미지", prompt = "" } = {}) => {
    if (!src) return;
    setStatus("참고 이미지 불러오는 중…", "busy");
    try {
      addReferenceData({ data: await sourceToDataUrl(src), name });
      if (prompt) input.value = prompt;
      setStatus(`참고 이미지 추가됨: ${name}`, "ok");
    } catch (error) {
      setStatus(error.message || String(error), "error");
      addLog(error.message || String(error), "error");
    }
  };
  const referenceSearch = createAiReferenceSearch({
    desktop: window.fiveEDesktop,
    onAdd: (reference) => addReferenceData(reference),
    onStatus: (text, kind) => setStatus(text, kind),
  });

  const addPreview = async (src, { isCurrent = () => true, alreadyEditable = false } = {}) => {
    if (!src) return false;
    let editableSrc = src;
    let postprocessOk = alreadyEditable;
    if (!alreadyEditable) {
      try {
        editableSrc = await transparentizeGeneratedImage(src);
        postprocessOk = true;
      } catch (error) {
        if (isCurrent()) addLog(`배경 자동 투명화 실패: ${error.message}`, "error");
      }
    }
    if (!isCurrent()) return false;
    latestGeneratedSrc = editableSrc;
    previews.querySelector("[data-ai-empty]")?.remove();
    const item = {
      id: `generated-${++imageSerial}`,
      name: `생성 결과 ${generatedImages.length + 1}`,
      data: editableSrc,
      kind: "generated",
      postprocessOk,
      comments: [],
      nextCommentNumber: 1,
    };
    generatedImages.push(item);
    previews.prepend(makeImageCard(item));
    return item;
  };

  const addScenePreview = (sceneResult, sceneSource, sceneCompileSource = sceneSource) => {
    if (!sceneResult?.valid || !sceneResult?.supported || !sceneResult.objects?.length) return false;
    const data = fastSceneToSvgDataUrl(sceneResult);
    latestGeneratedSrc = data;
    previews.querySelector("[data-ai-empty]")?.remove();
    const item = {
      id: `generated-${++imageSerial}`,
      name: `생성 결과 ${generatedImages.length + 1}`,
      data,
      kind: "generated",
      engine: IMAGE_ENGINE_IDS.FAST_SCENE,
      sceneResult,
      sceneSource: String(sceneSource || ""),
      sceneCompileSource: String(sceneCompileSource || sceneSource || ""),
      comments: [],
      nextCommentNumber: 1,
    };
    generatedImages.push(item);
    previews.prepend(makeImageCard(item));
    return item;
  };

  const taskItemCopy = (item) => ({ ...snapshotImageItem(item), card: null });
  const captureActiveTaskTab = () => {
    const tab = taskTabs.get(activeTaskTabId);
    if (!tab) return;
    tab.attachments = attachments.map(taskItemCopy);
    tab.generated = generatedImages.map(taskItemCopy);
    tab.conversationMessages = conversationMessages.map((message) => ({ ...message }));
    tab.uiMessages = Array.from(log.querySelectorAll(".ai-msg")).map((node) => ({
      text: node.textContent || "",
      kind: node.classList.contains("user") ? "user" : node.classList.contains("error") ? "error" : "assistant",
    }));
    tab.input = input.value;
    tab.conversationId = conversationId;
    tab.mode = selectedMode;
    tab.qualityMode = selectedQualityMode;
    tab.outputEngine = selectedOutputEngine;
  };

  const renderTaskTabs = () => {
    if (!tabList) return;
    tabList.replaceChildren();
    for (const tab of taskTabs.values()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ai-task-tab";
      button.dataset.tabId = tab.id;
      button.classList.toggle("is-on", tab.id === activeTaskTabId);
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(tab.id === activeTaskTabId));
      const label = document.createElement("span");
      label.textContent = tab.title;
      const closeTab = document.createElement("i");
      closeTab.textContent = "×";
      closeTab.title = "탭 닫기";
      closeTab.onclick = (event) => {
        event.stopPropagation();
        if (busy || taskTabs.size <= 1) return;
        taskTabs.delete(tab.id);
        if (activeTaskTabId === tab.id) {
          activeTaskTabId = taskTabs.keys().next().value;
          restoreTaskTab(activeTaskTabId);
        } else renderTaskTabs();
      };
      button.append(label, closeTab);
      button.onclick = () => {
        if (busy || tab.id === activeTaskTabId) return;
        captureActiveTaskTab();
        restoreTaskTab(tab.id);
      };
      tabList.appendChild(button);
    }
  };

  const resetVisualLists = () => {
    attachmentList.replaceChildren();
    const emptyReference = document.createElement("p");
    emptyReference.className = "ai-reference-empty";
    emptyReference.dataset.aiReferenceEmpty = "";
    emptyReference.textContent = "여러 이미지를 추가하고 각각 필요한 영역에 요청을 남길 수 있습니다.";
    attachmentList.appendChild(emptyReference);
    previews.querySelectorAll(".ai-image-card, [data-ai-empty]").forEach((node) => node.remove());
  };

  function restoreTaskTab(tabId) {
    const tab = taskTabs.get(tabId);
    if (!tab) return;
    activeTaskTabId = tab.id;
    currentRequestEpoch += 1;
    currentTurnId = null;
    currentRenderThreadId = null;
    awaitingTurnId = false;
    queuedTurnEvents = [];
    conversationId = tab.conversationId || null;
    conversationMessages = (tab.conversationMessages || []).map((message) => ({ ...message }));
    selectedMode = tab.mode || "diagram";
    selectedQualityMode = normalizeQualityMode(tab.qualityMode);
    selectedOutputEngine = normalizeOutputEngine(tab.outputEngine);
    attachments = (tab.attachments || []).map(taskItemCopy);
    generatedImages = (tab.generated || []).map(taskItemCopy);
    latestGeneratedSrc = generatedImages.at(-1)?.data || null;
    input.value = tab.input || "";
    log.replaceChildren();
    for (const message of tab.uiMessages || []) addLog(message.text, message.kind);
    if (!log.children.length) {
      const emptyLog = document.createElement("p");
      emptyLog.className = "ai-log-empty";
      emptyLog.dataset.aiLogEmpty = "";
      emptyLog.textContent = "대화로 요구사항을 정리한 뒤 이미지를 생성하세요.";
      log.appendChild(emptyLog);
    }
    resetVisualLists();
    for (const item of attachments) attachmentList.appendChild(makeImageCard(item));
    for (const item of generatedImages) previews.appendChild(makeImageCard(item));
    if (!generatedImages.length) {
      const empty = document.createElement("p");
      empty.className = "ai-empty";
      empty.dataset.aiEmpty = "";
      empty.textContent = "생성된 이미지가 여기에 표시됩니다.";
      previews.appendChild(empty);
    }
    syncMode();
    syncQualityMode();
    syncOutputEngine();
    syncReferenceSummary();
    renderTaskTabs();
  }

  const createTaskTab = ({ activate = true } = {}) => {
    if (busy) return null;
    captureActiveTaskTab();
    const id = `task-${++taskTabSerial}`;
    taskTabs.set(id, {
      id,
      title: `작업 ${taskTabSerial}`,
      attachments: [], generated: [], conversationMessages: [], uiMessages: [], input: "",
      conversationId: null, mode: selectedMode, qualityMode: selectedQualityMode, outputEngine: selectedOutputEngine,
    });
    if (activate) restoreTaskTab(id);
    else renderTaskTabs();
    return id;
  };

  let batchQueue = [];
  let batchRunningCount = 0;
  const BATCH_CONCURRENCY = 5;

  const updateBatchSummary = () => {
    if (!batchSummary) return;
    const jobs = Array.from(new Map(
      Array.from(batchRuns.values()).filter((job) => job.root === true).map((job) => [job.id, job]),
    ).values());
    const complete = jobs.filter((job) => job.state === "complete").length;
    const failed = jobs.filter((job) => job.state === "failed").length;
    batchSummary.textContent = `${complete}/${jobs.length} 완료${failed ? ` · ${failed} 실패` : ""} · 최대 ${BATCH_CONCURRENCY}개 동시`;
    if (jobs.length && complete + failed === jobs.length) {
      batchActive = false;
      if (batchButton) batchButton.disabled = attachments.length < 2 || busy;
      try {
        const history = JSON.parse(localStorage.getItem("5e.aiBatchHistory.v1") || "[]");
        history.push({
          at: new Date().toISOString(),
          qualityMode: selectedQualityMode,
          jobs: jobs.map((job) => ({ name: job.name, state: job.state, elapsedMs: job.elapsedMs || null, passes: job.pass || 1 })),
        });
        localStorage.setItem("5e.aiBatchHistory.v1", JSON.stringify(history.slice(-20)));
      } catch {}
    }
  };

  const updateBatchCard = (job, text) => {
    if (!job.card) return;
    job.card.dataset.state = job.state;
    job.statusNode.textContent = text || job.state;
    if (job.resultData) {
      job.imageNode.src = job.resultData;
      job.imageNode.hidden = false;
    }
    updateBatchSummary();
  };

  const addBatchResultToTab = (job) => {
    if (!job.resultData || job.addedToTab) return;
    job.addedToTab = true;
    const item = {
      id: `generated-${++imageSerial}`,
      name: `${job.name} · ${job.qualityMode === AI_QUALITY_MODES.COMPLEX ? "복잡" : job.qualityMode === AI_QUALITY_MODES.SIMPLE ? "단순" : "보통"}`,
      data: job.resultData,
      kind: "generated",
      engine: IMAGE_ENGINE_IDS.RASTER,
      postprocessOk: true,
      comments: [],
      nextCommentNumber: 1,
    };
    if (activeTaskTabId === job.taskTabId) {
      generatedImages.push(item);
      latestGeneratedSrc = item.data;
      previews.querySelector("[data-ai-empty]")?.remove();
      previews.prepend(makeImageCard(item));
      captureActiveTaskTab();
    } else {
      const tab = taskTabs.get(job.taskTabId);
      if (tab) tab.generated.push(taskItemCopy(item));
    }
  };

  const releaseBatchSlot = (job) => {
    if (!job.slotHeld) return;
    job.slotHeld = false;
    batchRunningCount = Math.max(0, batchRunningCount - 1);
    pumpBatchQueue();
  };

  const startBatchPass = async (job, pass = 1) => {
    job.pass = pass;
    job.state = pass === 1 ? "running" : "correcting";
    updateBatchCard(job, pass === 1 ? "생성 중…" : "구조 교정 중…");
    const revision = pass > 1;
    const sourceItem = { ...job.source, kind: "reference", comments: job.source.comments || [] };
    const previousResult = job.resultData;
    const outgoing = [sourceItem];
    if (revision && previousResult) {
      outgoing.push({
        id: `${job.id}-draft`, name: "직전 생성 결과", data: previousResult,
        kind: "generated", sourceKind: "line-art", comments: [],
      });
    }
    job.resultData = null;
    job.pendingImagePromise = null;
    try {
      const transport = await Promise.all(outgoing.map(prepareTransportItem));
      const comments = commentPrompt([sourceItem]);
      const request = revision
        ? `${job.request}${comments}\n원본과 직전 결과를 객체별로 비교하고 형태·개수·분기·연결이 달라진 부분만 교정해 줘. 맞는 영역은 그대로 보존해 줘.`
        : `${job.request}${comments}`;
      const result = await window.fiveEDesktop.send({
        text: buildImagePrompt({
          request,
          mode: job.mode,
          revision,
          qualityMode: job.qualityMode,
        }),
        attachments: transport,
        conversationId: null,
        purpose: "image",
        ephemeralRender: true,
        model: job.model,
        effort: job.effort,
        serviceTier: job.serviceTier,
      });
      job.turnId = result.turnId || null;
      job.threadId = result.renderThreadId || result.threadId || null;
      if (job.turnId) batchRuns.set(job.turnId, job);
      for (let index = unclaimedBatchEvents.length - 1; index >= 0; index -= 1) {
        const pending = unclaimedBatchEvents[index];
        if ((pending.turnId && pending.turnId === job.turnId) || (pending.threadId && pending.threadId === job.threadId)) {
          unclaimedBatchEvents.splice(index, 1);
          void dispatchBatchEvent(job, pending);
        }
      }
    } catch (error) {
      job.state = "failed";
      job.error = error.message || String(error);
      job.elapsedMs = Math.round(performance.now() - job.startedAt);
      updateBatchCard(job, `실패 · ${job.error}`);
      releaseBatchSlot(job);
    }
  };

  async function dispatchBatchEvent(job, event) {
    if (!job || job.state === "complete" || job.state === "failed") return;
    if (event.kind === "progress") {
      updateBatchCard(job, event.title || (job.pass > 1 ? "구조 교정 중…" : "생성 중…"));
      return;
    }
    if (event.kind === "performance") {
      job.performance = { ...job.performance, ...event.metrics };
      return;
    }
    if (event.kind === "image" && event.src) {
      job.pendingImagePromise = (async () => {
        try {
          job.resultData = await transparentizeGeneratedImage(event.src, { examPalette: true });
          updateBatchCard(job, job.pass > 1 ? "교정 결과 정리 중…" : "결과 정리 중…");
        } catch (error) {
          job.error = error.message || String(error);
        }
      })();
      await job.pendingImagePromise;
      return;
    }
    if (event.kind === "error") {
      job.error = event.text || "이미지 생성 오류";
      return;
    }
    if (event.kind !== "done") return;
    if (job.pendingImagePromise) await job.pendingImagePromise;
    if (event.status === "failed" || !job.resultData) {
      job.state = "failed";
      job.elapsedMs = Math.round(performance.now() - job.startedAt);
      updateBatchCard(job, `실패 · ${job.error || event.error || "결과 없음"}`);
      releaseBatchSlot(job);
      return;
    }
    if (job.qualityMode === AI_QUALITY_MODES.COMPLEX && job.pass === 1) {
      if (job.turnId) batchRuns.delete(job.turnId);
      await startBatchPass(job, 2);
      return;
    }
    job.state = "complete";
    job.elapsedMs = Math.round(performance.now() - job.startedAt);
    updateBatchCard(job, job.pass > 1
      ? `완료 · ${(job.elapsedMs / 1000).toFixed(1)}초 · 2회 · 구조 확인 필요`
      : `완료 · ${(job.elapsedMs / 1000).toFixed(1)}초`);
    addBatchResultToTab(job);
    releaseBatchSlot(job);
  }

  async function startQueuedBatchJob(job) {
    job.slotHeld = true;
    batchRunningCount += 1;
    job.startedAt = performance.now();
    await startBatchPass(job, 1);
  }

  function pumpBatchQueue() {
    while (batchRunningCount < BATCH_CONCURRENCY && batchQueue.length) {
      const job = batchQueue.shift();
      void startQueuedBatchJob(job);
    }
  }

  const runBatch = () => {
    if (batchActive || busy || attachments.length < 2) return;
    if (selectedOutputEngine !== AI_OUTPUT_ENGINES.RASTER) {
      setStatus("여러 장 변환은 교과서 선화 출력에서 사용해 주세요.", "warn");
      return;
    }
    captureActiveTaskTab();
    const request = input.value.trim() || "각 참고 이미지에서 주 과학 그림만 남기고 글자·라벨·지시선·화살표·강조 원·페이지 배경을 모두 제거하여 평가원식 무라벨 흑백 선화로 변환해 줘.";
    batchActive = true;
    batchQueue = [];
    batchRunningCount = 0;
    batchRuns.clear();
    if (batchPanel) batchPanel.hidden = false;
    if (batchGrid) batchGrid.replaceChildren();
    const roots = attachments.map((source, index) => {
      const job = {
        id: `batch-${Date.now()}-${index + 1}`,
        root: true,
        taskTabId: activeTaskTabId,
        name: source.name,
        source: taskItemCopy(source),
        request,
        mode: selectedMode,
        qualityMode: selectedQualityMode,
        model: modelSelect.value || null,
        effort: effortSelect.value || null,
        serviceTier: speedSelect.value || null,
        state: "queued",
        resultData: null,
      };
      const card = document.createElement("article");
      card.className = "ai-batch-card";
      card.dataset.state = "queued";
      const title = document.createElement("strong");
      title.textContent = source.name;
      const statusNode = document.createElement("span");
      statusNode.textContent = "대기 중";
      const imageNode = document.createElement("img");
      imageNode.alt = `${source.name} 변환 결과`;
      imageNode.hidden = true;
      card.append(title, statusNode, imageNode);
      batchGrid?.appendChild(card);
      job.card = card;
      job.statusNode = statusNode;
      job.imageNode = imageNode;
      batchRuns.set(job.id, job);
      return job;
    });
    batchQueue.push(...roots);
    if (batchButton) batchButton.disabled = true;
    setStatus(`참고 이미지 ${roots.length}개를 최대 ${BATCH_CONCURRENCY}개씩 동시에 변환합니다.`, "busy");
    updateBatchSummary();
    pumpBatchQueue();
  };

  const allImages = () => [...attachments, ...generatedImages];
  const openComparison = () => {
    const images = allImages();
    if (images.length < 2) {
      setStatus("비교할 이미지를 두 개 이상 추가해 주세요.", "warn");
      return;
    }
    const overlay = document.createElement("div");
    overlay.className = "ai-compare-overlay";
    const dialog = document.createElement("section");
    dialog.className = "ai-compare-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const head = document.createElement("div");
    head.className = "ai-compare-head";
    const title = document.createElement("strong");
    title.textContent = "이미지 1:1 비교";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.title = "비교 닫기";
    head.append(title, closeButton);
    const panes = document.createElement("div");
    panes.className = "ai-compare-panes";

    const makePane = (initial) => {
      const pane = document.createElement("div");
      pane.className = "ai-compare-pane";
      const label = document.createElement("strong");
      const main = document.createElement("img");
      main.className = "ai-compare-main";
      const picker = document.createElement("div");
      picker.className = "ai-compare-picker";
      const choose = (item) => {
        main.src = item.data;
        main.alt = item.name;
        label.textContent = item.name;
        picker.querySelectorAll("button").forEach((button) => button.classList.toggle("is-on", button.dataset.imageId === item.id));
      };
      for (const item of images) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.imageId = item.id;
        button.title = item.name;
        const thumb = document.createElement("img");
        thumb.src = item.data;
        thumb.alt = "";
        button.appendChild(thumb);
        button.onclick = () => choose(item);
        picker.appendChild(button);
      }
      pane.append(label, main, picker);
      choose(initial);
      return pane;
    };
    const leftInitial = attachments[0] || images[0];
    const rightInitial = generatedImages.at(-1) || images.find((item) => item !== leftInitial) || images[1];
    panes.append(makePane(leftInitial), makePane(rightInitial));
    dialog.append(head, panes);
    overlay.appendChild(dialog);
    closeButton.onclick = () => overlay.remove();
    overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) overlay.remove(); });
    document.documentElement.appendChild(overlay);
  };

  const openCaptureCrop = (source) => {
    const overlay = document.createElement("div");
    overlay.className = "ai-compare-overlay";
    const dialog = document.createElement("section");
    dialog.className = "ai-compare-dialog ai-crop-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const head = document.createElement("div");
    head.className = "ai-compare-head";
    const title = document.createElement("strong");
    title.textContent = `${source.name} · 캡처 영역 지정`;
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.title = "캡처 취소";
    head.append(title, closeButton);

    const stage = document.createElement("div");
    stage.className = "ai-crop-stage";
    const wrap = document.createElement("div");
    wrap.className = "ai-crop-image-wrap";
    const image = document.createElement("img");
    image.src = source.data;
    image.alt = source.name;
    image.draggable = false;
    const masks = Array.from({ length: 4 }, () => {
      const mask = document.createElement("div");
      mask.className = "ai-crop-mask";
      return mask;
    });
    const selection = document.createElement("div");
    selection.className = "ai-crop-selection";
    wrap.append(image, ...masks, selection);
    stage.appendChild(wrap);

    const foot = document.createElement("div");
    foot.className = "ai-crop-foot";
    const hint = document.createElement("span");
    hint.textContent = "회색 화면 위에서 필요한 영역을 드래그하세요.";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "취소";
    const applyButton = document.createElement("button");
    applyButton.type = "button";
    applyButton.dataset.aiCropApply = "";
    applyButton.textContent = "선택 영역 추가";
    applyButton.disabled = true;
    foot.append(hint, cancelButton, applyButton);
    dialog.append(head, stage, foot);
    overlay.appendChild(dialog);
    // body에는 앱 UI 배율(zoom)이 적용된다. 뷰포트 좌표를 쓰는 캡처막은 루트에 둬야 포인터와 일치한다.
    document.documentElement.appendChild(overlay);

    let start = null;
    let box = null;
    const closeCrop = () => overlay.remove();
    const point = (event) => {
      const rect = wrap.getBoundingClientRect();
      return { x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)), y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)) };
    };
    const renderCrop = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (!box) {
        Object.assign(masks[0].style, { left: "0px", top: "0px", width: `${w}px`, height: `${h}px` });
        for (let i = 1; i < masks.length; i += 1) Object.assign(masks[i].style, { width: "0px", height: "0px" });
        selection.style.display = "none";
        applyButton.disabled = true;
        return;
      }
      const x = Math.min(box.x1, box.x2), y = Math.min(box.y1, box.y2);
      const sw = Math.abs(box.x2 - box.x1), sh = Math.abs(box.y2 - box.y1);
      Object.assign(masks[0].style, { left: "0px", top: "0px", width: `${w}px`, height: `${y}px` });
      Object.assign(masks[1].style, { left: "0px", top: `${y}px`, width: `${x}px`, height: `${sh}px` });
      Object.assign(masks[2].style, { left: `${x + sw}px`, top: `${y}px`, width: `${Math.max(0, w - x - sw)}px`, height: `${sh}px` });
      Object.assign(masks[3].style, { left: "0px", top: `${y + sh}px`, width: `${w}px`, height: `${Math.max(0, h - y - sh)}px` });
      Object.assign(selection.style, { display: "block", left: `${x}px`, top: `${y}px`, width: `${sw}px`, height: `${sh}px` });
      applyButton.disabled = sw < 4 || sh < 4;
      hint.textContent = applyButton.disabled ? "조금 더 넓게 드래그하세요." : `${Math.round(sw)} × ${Math.round(sh)}px 영역을 선택했습니다.`;
    };
    if (image.complete) requestAnimationFrame(renderCrop);
    else image.addEventListener("load", renderCrop, { once: true });
    wrap.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      start = point(event);
      box = { x1: start.x, y1: start.y, x2: start.x, y2: start.y };
      wrap.setPointerCapture?.(event.pointerId);
      renderCrop();
    });
    wrap.addEventListener("pointermove", (event) => {
      if (!start || !box) return;
      const next = point(event);
      box.x2 = next.x;
      box.y2 = next.y;
      renderCrop();
    });
    wrap.addEventListener("pointerup", () => { start = null; });
    wrap.addEventListener("pointercancel", () => { start = null; });
    applyButton.onclick = () => {
      if (!box || applyButton.disabled) return;
      const x = Math.min(box.x1, box.x2), y = Math.min(box.y1, box.y2);
      const w = Math.abs(box.x2 - box.x1), h = Math.abs(box.y2 - box.y1);
      const scaleX = image.naturalWidth / Math.max(1, wrap.clientWidth);
      const scaleY = image.naturalHeight / Math.max(1, wrap.clientHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * scaleX));
      canvas.height = Math.max(1, Math.round(h * scaleY));
      canvas.getContext("2d")?.drawImage(image, x * scaleX, y * scaleY, w * scaleX, h * scaleY, 0, 0, canvas.width, canvas.height);
      addReferenceData({ data: canvas.toDataURL("image/png"), name: `캡처 · ${source.name}`, sourceKind: "capture" });
      closeCrop();
      setStatus("선택한 캡처 영역이 참고 이미지로 추가되었습니다.", "ok");
    };
    closeButton.onclick = closeCrop;
    cancelButton.onclick = closeCrop;
    overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) closeCrop(); });
  };

  const openCaptureChooser = async () => {
    if (!window.fiveEDesktop?.captureSources) {
      setStatus("캡처는 데스크톱 앱에서만 사용할 수 있습니다.", "warn");
      return;
    }
    setStatus("캡처할 화면을 불러오는 중…", "busy");
    panel.hidden = true;
    await new Promise((resolve) => setTimeout(resolve, 180));
    let sources;
    try {
      sources = await window.fiveEDesktop.captureSources();
    } catch (error) {
      panel.hidden = false;
      setStatus(`화면 캡처 실패: ${error.message}`, "error");
      return;
    }
    panel.hidden = false;
    const overlay = document.createElement("div");
    overlay.className = "ai-compare-overlay";
    const dialog = document.createElement("section");
    dialog.className = "ai-compare-dialog ai-capture-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    const head = document.createElement("div");
    head.className = "ai-compare-head";
    const title = document.createElement("strong");
    title.textContent = "캡처할 화면 또는 창 선택";
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.title = "캡처 닫기";
    head.append(title, closeButton);
    const grid = document.createElement("div");
    grid.className = "ai-capture-grid";
    for (const source of sources || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ai-capture-source";
      const image = document.createElement("img");
      image.src = source.data;
      image.alt = "";
      const name = document.createElement("span");
      name.textContent = source.name;
      button.append(image, name);
      button.onclick = () => { overlay.remove(); openCaptureCrop(source); };
      grid.appendChild(button);
    }
    dialog.append(head, grid);
    overlay.appendChild(dialog);
    closeButton.onclick = () => overlay.remove();
    overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) overlay.remove(); });
    document.documentElement.appendChild(overlay);
    setStatus("캡처할 화면 또는 창을 선택하세요.", "ok");
  };

  const commentPrompt = (images = allImages()) => {
    const lines = [];
    for (const item of images) {
      const comments = item.comments.filter((comment) => comment.text.trim());
      if (!comments.length) continue;
      lines.push(`[${item.kind === "reference" ? "참고 이미지" : "생성 결과"}: ${item.name}]`);
      for (const comment of comments) {
        lines.push(`- 영역 ${comment.number} (가로 ${comment.x}%, 세로 ${comment.y}%, 너비 ${comment.w}%, 높이 ${comment.h}%): ${comment.text.trim()}`);
      }
    }
    return lines.length ? `\n\n이미지 영역 코멘트:\n${lines.join("\n")}` : "";
  };

  const describeRemoteInputPlan = (plan) => {
    const lines = [];
    for (const [index, visual] of (plan?.visuals || []).entries()) {
      if (visual.kind === "overview") {
        const role = visual.role === "latest-result" ? "직전 생성 결과" : "주 참고 이미지";
        lines.push(`${index + 1}. ${role}: ${visual.source?.name || "이미지"}`);
      } else if (visual.kind === "crop") {
        lines.push(`${index + 1}. 영역 확대: ${visual.source?.name || "이미지"}의 영역 ${visual.commentNumber || ""} · ${visual.commentText || "요청 영역"}`);
      } else if (visual.kind === "contact-sheet") {
        const tiles = (visual.tiles || []).map((tile, tileIndex) => {
          const sourceName = tile.source?.name || "이미지";
          return `${tileIndex + 1}) ${sourceName}${tile.kind === "crop" ? ` 영역 ${tile.commentNumber || ""}` : ""}`;
        });
        lines.push(`${index + 1}. 보조 참고 묶음(왼쪽 위부터 행 순서): ${tiles.join(", ")}`);
      }
    }
    return lines.length
      ? `\n\n전달된 참고 이미지 순서와 역할:\n${lines.join("\n")}\n이 설명은 참고 입력의 대응 관계만 나타내며, 출력 그림에는 이 문구나 번호를 그리지 마세요.`
      : "";
  };

  const makeCacheDescriptor = ({ engine, prompt, revisionImage, runInput, references, localAssetMatch = null }) => {
    const localAsset = localAssetMatch?.matched === true
      ? {
        version: LOCAL_ASSET_ROUTER_VERSION,
        motif: localAssetMatch.motifRequest?.motif || null,
        reason: localAssetMatch.reason || null,
      }
      : null;
    return buildExactOutputCacheDescriptor({
      styleVersion: localAsset
        ? `${LOCAL_ASSET_ROUTER_VERSION}+${MOTIF_CATALOG_VERSION}`
        : engine === IMAGE_ENGINE_IDS.FAST_SCENE
          ? FAST_SCENE_PROMPT_VERSION
          : `${RASTER_STYLE_VERSION}+${qualityModeCacheVersion(runInput.qualityMode)}`,
      mode: runInput.mode,
      prompt,
      references,
      latestResult: revisionImage,
      model: runInput.model,
      effort: runInput.effort,
      serviceTier: runInput.serviceTier,
      outputOptions: {
        engine,
        outputEngine: normalizeOutputEngine(runInput.outputEngine),
        qualityMode: normalizeQualityMode(runInput.qualityMode),
        complexPass: Number(runInput.complexPass || 1),
        transparentBackground: true,
        examPalette: engine === IMAGE_ENGINE_IDS.RASTER,
        localAsset,
      },
      engineVersion: localAsset
        ? `${LOCAL_ASSET_ROUTER_VERSION}+${MOTIF_CATALOG_VERSION}+${FAST_SCENE_PANEL_COMPILE_VERSION}`
        : engine === IMAGE_ENGINE_IDS.FAST_SCENE
          ? `${FAST_SCENE_PROMPT_VERSION}+${FAST_SCENE_PANEL_COMPILE_VERSION}`
          : RASTER_ENGINE_VERSION,
    });
  };

  const storeCurrentOutput = async (output) => {
    if (!outputCache || !currentCacheRequest?.key || !output) return;
    try {
      await outputCache.put({
        key: currentCacheRequest.key,
        descriptor: currentCacheRequest.descriptor,
        output: { ...output, engine: currentCacheRequest.engine, complete: true },
        status: "complete",
      });
    } catch {}
  };

  const refresh = async ({ autoConnect = true } = {}) => {
    if (!window.fiveEDesktop) {
      setStatus("데스크톱 앱에서만 사용 가능", "warn");
      return;
    }
    try {
      const current = await window.fiveEDesktop.status();
      loginButton.hidden = current.login.loggedIn;
      if (!current.login.loggedIn) {
        setStatus("Codex 로그인 필요", "warn");
      } else if (current.server) {
        setStatus("AI 사용 가능", "ok");
        await Promise.all([loadModels(), loadAccountOverview()]);
      } else if (autoConnect) {
        setStatus("AI 자동 연결 중…", "busy");
        const result = await window.fiveEDesktop.start();
        setStatus(result.ok ? "AI 사용 가능" : `연결 실패: ${result.message}`, result.ok ? "ok" : "error");
        if (result.ok) await Promise.all([loadModels(), loadAccountOverview()]);
      }
    } catch (error) {
      setStatus(`상태 확인 실패: ${error.message}`, "error");
    }
  };
  const open = async ({ reference, references = [], prompt } = {}) => {
    panel.hidden = false;
    await refresh();
    const incoming = [...references, ...(reference ? [reference] : [])];
    if (incoming.length) {
      setStatus("참고 이미지 불러오는 중…", "busy");
      const loaded = await Promise.allSettled(incoming.map(async (item) => ({
        item,
        data: await sourceToDataUrl(item.src),
      })));
      for (const result of loaded) {
        if (result.status === "fulfilled") {
          addReferenceData({ data: result.value.data, name: result.value.item.name || "참고 이미지" });
        } else {
          addLog(result.reason?.message || String(result.reason), "error");
        }
      }
      const loadedCount = loaded.filter((result) => result.status === "fulfilled").length;
      setStatus(`참고 이미지 ${loadedCount}개 추가됨`, loadedCount ? "ok" : "error");
    }
    const lastIncoming = incoming.at(-1);
    if (prompt || lastIncoming?.prompt) input.value = prompt || lastIncoming.prompt;
    input.focus();
  };
  const close = () => { panel.hidden = true; };

  const submit = async (type, options = {}) => {
    if (busy || !window.fiveEDesktop) return refresh();
    const entered = typeof options.requestOverride === "string" ? options.requestOverride.trim() : input.value.trim();
    const request = entered || (type === "image" ? "지금까지 대화에서 확정한 내용으로 이미지를 생성해 줘." : "");
    if (!request) return;
    const discussionContext = type === "image"
      ? (typeof options.discussionContextOverride === "string"
        ? options.discussionContextOverride
        : compactConversation(conversationMessages))
      : "";
    const runInput = options.runInputSnapshot || {
      attachments: attachments.map(snapshotImageItem),
      generated: generatedImages.map(snapshotImageItem),
      mode: selectedMode,
      qualityMode: selectedQualityMode,
      outputEngine: selectedOutputEngine,
      complexPass: 1,
      model: modelSelect.value || null,
      effort: effortSelect.value || null,
      serviceTier: speedSelect.value || null,
    };
    const revisionImage = runInput.generated.at(-1) || null;
    const requestComments = commentPrompt([...runInput.attachments, ...runInput.generated]);
    const annotatedHistory = runInput.generated
      .filter((item) => item !== revisionImage && item.comments.some((comment) => String(comment?.text || "").trim()))
      .map((item) => ({ ...item, kind: "reference", name: `이전 생성 결과 · ${item.name}` }));
    const planningReferences = [...runInput.attachments, ...annotatedHistory];
    const requestEpoch = ++currentRequestEpoch;
    setBusy(true);
    imageReceived = false;
    currentTurnType = type;
    const requestedEngine = options.forceEngine
      || (normalizeOutputEngine(runInput.outputEngine) === AI_OUTPUT_ENGINES.ASSET
        ? IMAGE_ENGINE_IDS.FAST_SCENE
        : IMAGE_ENGINE_IDS.RASTER);
    currentEngine = type === "image"
      ? chooseImageEngine({
        request: `${request}${requestComments}`,
        mode: runInput.mode,
        references: planningReferences,
        force: requestedEngine,
      }).engine
      : IMAGE_ENGINE_IDS.RASTER;
    currentRunInput = runInput;
    currentSceneResponse = "";
    currentCacheRequest = null;
    currentTurnUsage = null;
    currentTurnPerformance = null;
    currentTurnDone = false;
    currentTurnId = null;
    currentRenderThreadId = null;
    awaitingTurnId = true;
    queuedTurnEvents = [];
    serverTurnFinished = false;
    previewPending = false;
    tokenFooterNode = null;
    currentTurnStartedAt = Date.now();
    input.value = "";
    if (!options.silentUserLog) {
      addLog(request, "user");
      recordConversationMessage("user", request);
    }
    if (type === "image") {
      const fast = currentEngine === IMAGE_ENGINE_IDS.FAST_SCENE;
      setStatus(fast ? "빠른 벡터 도식 준비 중…" : "이미지 생성 요청 중…", "busy");
      setGenerating(
        true,
        fast ? "편집 가능한 도식을 구성하고 있습니다" : "이미지 생성 준비 중",
        fast ? "반복 과학 장치를 5E 벡터 오브젝트로 변환합니다." : "참고 이미지와 영역 코멘트를 분석하고 있습니다.",
        "analyze",
      );
    } else {
      setStatus("답변 작성 중…", "busy");
      setGenerating(false);
    }
    const annotatedRequest = `${request}${requestComments}`;
    const renderRequest = discussionContext
      ? `지금까지 확정된 대화 내용:\n${discussionContext}\n\n이번 생성 요청:\n${annotatedRequest}`
      : annotatedRequest;
    currentRequestSnapshot = { request, discussionContext, annotatedRequest, renderRequest, runInput };
    try {
      const clientPrepareStartedAt = performance.now();
      let outgoingItems = [];
      let outgoingAttachments = [];
      let requestWithVisualPlan = renderRequest;
      const localAssetMatch = type === "image" && currentEngine === IMAGE_ENGINE_IDS.FAST_SCENE && !revisionImage
        ? matchLocalAssetRequest({
          request: renderRequest,
          mode: runInput.mode,
          references: planningReferences,
        })
        : { matched: false, reason: revisionImage ? "revision-present" : "not-image-request" };

      if (localAssetMatch.matched) {
        currentEngine = IMAGE_ENGINE_IDS.FAST_SCENE;
        setStatus("내부 검증 도식을 불러오는 중…", "busy");
        setGenerating(
          true,
          "검증된 내부 도식을 구성하고 있습니다",
          "원격 이미지 생성 없이 5E 벡터 오브젝트를 준비합니다.",
          "compose",
        );
      }

      if (type === "image") {
        const descriptor = makeCacheDescriptor({
          engine: currentEngine,
          prompt: renderRequest,
          revisionImage,
          runInput,
          references: planningReferences,
          localAssetMatch,
        });
        const key = createExactOutputCacheKey(descriptor);
        currentCacheRequest = { key, descriptor, engine: currentEngine };
        const bypassCache = options.bypassCache === true || /새\s*변형|다시\s*생성|다르게\s*생성|재생성/.test(request);
        if (outputCache && !bypassCache) {
          let cached = null;
          try { cached = await outputCache.get(key); } catch {}
          if (cached?.hit && cached.entry?.output) {
            let cachedItem = null;
            if (currentEngine === IMAGE_ENGINE_IDS.FAST_SCENE && cached.entry.output.sceneSource) {
              const cachedCompileSource = cached.entry.output.sceneCompileSource || cached.entry.output.sceneSource;
              const cachedScene = compilePanelScene(cachedCompileSource, {
                mode: runInput.mode,
                layerId: state.get().activeLayerId,
                idPrefix: `ai_cached_${requestEpoch}`,
              });
              const compiled = cachedScene.result;
              if (compiled.valid && compiled.supported && compiled.objects.length) {
                cachedItem = addScenePreview(
                  compiled,
                  cached.entry.output.sceneSource,
                  cachedCompileSource,
                );
                currentTurnPerformance = { sceneCompileMs: compiled.stats.compileMs };
              } else {
                try { await outputCache.delete(key); } catch {}
              }
            } else if (currentEngine === IMAGE_ENGINE_IDS.RASTER && cached.entry.output.data) {
              cachedItem = await addPreview(cached.entry.output.data, {
                isCurrent: () => requestEpoch === currentRequestEpoch,
                alreadyEditable: true,
              });
            }
            if (cachedItem && requestEpoch === currentRequestEpoch) {
              imageReceived = true;
              serverTurnFinished = true;
              currentTurnDone = true;
              awaitingTurnId = false;
              currentTurnPerformance = {
                ...currentTurnPerformance,
                engine: currentEngine,
                cacheHit: true,
                totalMs: Math.max(0, Math.round(performance.now() - clientPrepareStartedAt)),
                imageCallCount: 0,
                ...(localAssetMatch.matched ? {
                  route: "local-asset",
                  localAsset: true,
                  localAssetVersion: LOCAL_ASSET_ROUTER_VERSION,
                  localAssetReason: localAssetMatch.reason,
                } : {}),
              };
              persistPerformance(currentTurnPerformance);
              setGenerating(false);
              setStatus("동일 요청 결과를 즉시 불러왔습니다.", "ok");
              addLog("이전에 완료된 동일 결과를 즉시 불러왔습니다. 캔버스로 출력할 수 있습니다.");
              setBusy(false);
              addTokenFooter(null);
              return;
            }
          }
        }

        if (localAssetMatch.matched) {
          const compiledScene = compilePanelScene(localAssetMatch.motifRequest, {
            mode: runInput.mode,
            layerId: state.get().activeLayerId,
            idPrefix: `ai_local_${requestEpoch}`,
          });
          const compiled = compiledScene.result;
          if (!compiled.valid || !compiled.supported || !compiled.objects.length) {
            throw new Error("검증된 내부 도식을 5E 오브젝트로 변환하지 못했습니다.");
          }
          const item = addScenePreview(compiled, compiledScene.source, compiledScene.compileSource);
          if (!item) throw new Error("검증된 내부 도식을 미리보기에 추가하지 못했습니다.");
          await storeCurrentOutput({
            data: item.data,
            sceneSource: compiledScene.source,
            sceneCompileSource: compiledScene.compileSource,
          });
          imageReceived = true;
          serverTurnFinished = true;
          currentTurnDone = true;
          awaitingTurnId = false;
          previewPending = false;
          currentTurnPerformance = {
            engine: IMAGE_ENGINE_IDS.FAST_SCENE,
            route: "local-asset",
            localAsset: true,
            localAssetVersion: LOCAL_ASSET_ROUTER_VERSION,
            localAssetReason: localAssetMatch.reason,
            sceneCompileMs: compiled.stats.compileMs,
            sceneObjectCount: compiled.stats.outputObjects,
            clientPrepareMs: Math.round(performance.now() - clientPrepareStartedAt),
            totalMs: Math.max(0, Math.round(performance.now() - clientPrepareStartedAt)),
            imageCallCount: 0,
            cacheHit: false,
          };
          persistPerformance(currentTurnPerformance);
          setGenerating(false);
          setStatus("내부 검증 도식 생성 완료", "ok");
          addLog(`이미지가 완성되었습니다. 원격 생성 없이 내부 검증 자산을 편집 가능한 벡터 오브젝트 ${compiled.objects.length}개로 구성했습니다.`);
          setBusy(false);
          addTokenFooter(null);
          return;
        }

        const latestPixelResult = currentEngine === IMAGE_ENGINE_IDS.FAST_SCENE && revisionImage?.sceneSource
          ? null
          : revisionImage;
        const inputPlan = createRemoteImageInputPlan({
          references: planningReferences,
          latestResult: latestPixelResult,
          prompt: annotatedRequest,
        });
        const composed = await composeRemoteImageInputPlan(inputPlan);
        outgoingItems = composed.outputs.map((output, index) => ({
          id: `planned-${requestEpoch}-${index + 1}`,
          name: output.name,
          data: output.dataUrl,
          kind: "reference",
          sourceKind: output.reusedSource ? (output.descriptor?.source?.sourceKind || "auto") : "capture",
          comments: [],
        }));
        outgoingAttachments = await Promise.all(outgoingItems.map(prepareTransportItem));
        requestWithVisualPlan = `${renderRequest}${describeRemoteInputPlan(inputPlan)}`;
        currentTurnPerformance = {
          engine: currentEngine,
          inputPlanningMs: Math.round(inputPlan.metrics.totalMs || 0),
          inputCompositionMs: Math.round(composed.metrics.totalMs || 0),
          plannedImageCount: inputPlan.metrics.plannedImageCount,
          representedSourceCount: inputPlan.metrics.representedSourceCount,
          droppedSourceCount: inputPlan.metrics.droppedSourceCount,
        };
      } else {
        outgoingItems = selectOutgoingImageItems({
          type,
          references: runInput.attachments,
          generated: runInput.generated,
          latestGenerated: revisionImage,
          conversationId,
        });
        outgoingAttachments = await Promise.all(outgoingItems.map(prepareTransportItem));
      }

      currentTurnPerformance = {
        ...currentTurnPerformance,
        clientPrepareMs: Math.round(performance.now() - clientPrepareStartedAt),
        transportSourceBytes: outgoingItems.reduce((sum, item) => sum + Number(item.aiTransport?.sourceBytes || 0), 0),
        transportBytes: outgoingItems.reduce((sum, item) => sum + Number(item.aiTransport?.transportBytes || 0), 0),
        transportFallbackCount: outgoingItems.filter((item) => item.aiTransport?.usedFallback).length,
      };
      const purpose = type === "image"
        ? (currentEngine === IMAGE_ENGINE_IDS.FAST_SCENE ? "scene" : "image")
        : "chat";
      const result = await window.fiveEDesktop.send({
        text: type === "image"
          ? (currentEngine === IMAGE_ENGINE_IDS.FAST_SCENE
            ? buildFastScenePrompt({
              request: requestWithVisualPlan,
              mode: runInput.mode,
              revisionScene: revisionImage?.sceneSource || "",
            })
            : buildImagePrompt({
              request: requestWithVisualPlan,
              mode: runInput.mode,
              revision: Boolean(revisionImage),
              qualityMode: runInput.qualityMode,
            }))
          : buildDiscussionPrompt({ request: annotatedRequest, mode: runInput.mode }),
        attachments: outgoingAttachments,
        conversationId: type === "chat" ? conversationId : null,
        resetConversation: type === "chat" && forceNewConversation,
        purpose,
        ephemeralRender: type === "image",
        model: runInput.model,
        effort: runInput.effort,
        serviceTier: runInput.serviceTier,
      });
      if (requestEpoch !== currentRequestEpoch) return;
      currentTurnId = result.turnId || null;
      currentRenderThreadId = result.renderThreadId || result.threadId || null;
      awaitingTurnId = false;
      currentTurnPerformance = { ...currentTurnPerformance, ...(result.performance || {}) };
      const pendingEvents = queuedTurnEvents;
      queuedTurnEvents = [];
      for (const queued of pendingEvents) {
        const sameTurn = !queued.event.turnId || queued.event.turnId === currentTurnId;
        const sameThread = !queued.event.threadId || !currentRenderThreadId || queued.event.threadId === currentRenderThreadId;
        if (sameTurn && sameThread) {
          dispatchAiEvent(queued.event, requestEpoch);
        }
      }
      if (type === "chat") {
        forceNewConversation = false;
        conversationId = result.threadId || result.conversationId || conversationId;
        if (conversationId) {
          localStorage.setItem("5e.aiConversationId", conversationId);
          markImagesSent(outgoingItems, conversationId);
          const sentIds = new Set(outgoingItems.map((item) => item.id).filter(Boolean));
          markImagesSent([...attachments, ...generatedImages].filter((item) => sentIds.has(item.id)), conversationId);
        }
      }
    } catch (error) {
      if (requestEpoch !== currentRequestEpoch) return;
      awaitingTurnId = false;
      queuedTurnEvents = [];
      addLog(error.message, "error");
      setStatus("요청 실패", "error");
      setGenerating(false);
      setBusy(false);
    }
  };

  loginButton.onclick = async () => {
    if (!window.fiveEDesktop) return refresh();
    await window.fiveEDesktop.login();
    setStatus("브라우저에서 로그인을 완료해 주세요…", "busy");
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const current = await window.fiveEDesktop.status();
      if (!current.login.loggedIn) continue;
      loginButton.hidden = true;
      await refresh({ autoConnect: true });
      return;
    }
    setStatus("로그인 확인 시간이 초과되었습니다. 다시 시도해 주세요.", "warn");
  };
  modelSelect.addEventListener("change", () => {
    localStorage.setItem("5e.aiModel", modelSelect.value);
    sessionStorage.setItem("5e.aiModelExplicit", modelSelect.value);
    syncModelWarning();
    populateEfforts();
    populateSpeeds();
  });
  effortSelect.addEventListener("change", () => localStorage.setItem("5e.aiEffort", effortSelect.value));
  speedSelect.addEventListener("change", () => localStorage.setItem("5e.aiSpeed", speedSelect.value));
  modeButtons.forEach((button) => button.addEventListener("click", () => {
    selectedMode = button.dataset.aiMode;
    localStorage.setItem("5e.aiMode", selectedMode);
    syncMode();
  }));
  qualityButtons.forEach((button) => button.addEventListener("click", () => {
    selectedQualityMode = normalizeQualityMode(button.dataset.aiQuality);
    localStorage.setItem("5e.aiQualityMode", selectedQualityMode);
    syncQualityMode();
  }));
  outputEngineButtons.forEach((button) => button.addEventListener("click", () => {
    selectedOutputEngine = normalizeOutputEngine(button.dataset.aiOutputEngine);
    localStorage.setItem("5e.aiOutputEngine", selectedOutputEngine);
    syncOutputEngine();
    setStatus(selectedOutputEngine === AI_OUTPUT_ENGINES.ASSET
      ? "5E 에셋 출력은 지원되는 장치만 벡터로 생성합니다."
      : "교과서 선화 출력은 세부 묘사를 래스터 이미지로 생성합니다.", "ok");
  }));
  compareButton.onclick = openComparison;
  referenceSearchButton.onclick = () => { void referenceSearch.open(); };
  captureButton.onclick = () => { void openCaptureChooser(); };
  newButton.onclick = () => {
    if (busy) return;
    createTaskTab();
  };
  if (tabNewButton) tabNewButton.onclick = () => createTaskTab();
  if (batchButton) batchButton.onclick = runBatch;
  chatButton.onclick = () => submit("chat");
  sendButton.title = "이미지 생성 · Shift+클릭하면 캐시를 사용하지 않고 새 변형을 생성합니다.";
  sendButton.onclick = (event) => submit("image", { bypassCache: event.shiftKey === true });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      chatButton.click();
    }
  });
  panel.querySelector("[data-ai-interrupt]").onclick = async () => {
    if (!busy) return;
    setStatus("작업 취소 중…", "busy");
    await window.fiveEDesktop?.interrupt();
  };
  file.onchange = async () => {
    const selectedFiles = Array.from(file.files || []).filter((selected) => selected.type.startsWith("image/"));
    const dataUrls = await Promise.all(selectedFiles.map(blobToDataUrl));
    selectedFiles.forEach((selected, index) => addReferenceData({ name: selected.name, data: dataUrls[index] }));
    file.value = "";
    if (selectedFiles.length) setStatus(`참고 이미지 ${selectedFiles.length}개 추가됨`, "ok");
  };

  const finishCurrentTurnUi = (eventEpoch = currentRequestEpoch) => {
    if (eventEpoch !== currentRequestEpoch || !serverTurnFinished || previewPending) return;
    const needsComplexCorrection = currentTurnType === "image"
      && currentEngine === IMAGE_ENGINE_IDS.RASTER
      && imageReceived
      && normalizeQualityMode(currentRunInput?.qualityMode) === AI_QUALITY_MODES.COMPLEX
      && Number(currentRunInput?.complexPass || 1) === 1
      && !currentRunInput?.complexCorrectionScheduled;
    if (needsComplexCorrection) {
      currentRunInput.complexCorrectionScheduled = true;
      const correctionInput = {
        ...currentRunInput,
        generated: generatedImages.map(snapshotImageItem),
        complexPass: 2,
        complexCorrectionScheduled: true,
      };
      const correctionRequest = currentRequestSnapshot?.request || "원본과 직전 결과를 대조하여 구조가 달라진 부분만 교정해 줘.";
      setBusy(false);
      setStatus("복잡 그림 구조 검수 중…", "busy");
      setGenerating(true, "원본과 결과를 대조하고 있습니다", "형태·부품 수·연결이 달라진 부분만 한 번 더 교정합니다.", "analyze");
      addLog("복잡 모드 1차 결과를 원본과 대조한 뒤 구조 교정 1회를 진행합니다.");
      setTimeout(() => {
        if (eventEpoch !== currentRequestEpoch) return;
        void submit("image", {
          requestOverride: `${correctionRequest}\n원본과 직전 생성 결과를 객체별로 비교하고, 원본과 달라진 형태·개수·분기·연결만 교정해 줘. 맞는 영역은 그대로 보존해 줘.`,
          discussionContextOverride: currentRequestSnapshot?.discussionContext || "",
          runInputSnapshot: correctionInput,
          forceEngine: IMAGE_ENGINE_IDS.RASTER,
          bypassCache: true,
          silentUserLog: true,
        });
      }, 0);
      return;
    }
    const completedComplexCorrection = currentTurnType === "image"
      && currentEngine === IMAGE_ENGINE_IDS.RASTER
      && normalizeQualityMode(currentRunInput?.qualityMode) === AI_QUALITY_MODES.COMPLEX
      && Number(currentRunInput?.complexPass || 1) === 2;
    if (completedComplexCorrection) {
      setStatus("복잡 변환 완료 · 원본 구조 확인 필요", "warn");
      addLog("복잡 모드는 구조 교정을 마쳤지만 자동 확정하지 않습니다. 원본과 객체 수·분기·연결을 비교한 뒤 사용하세요.");
    }
    setBusy(false);
    currentTurnDone = true;
    addTokenFooter(currentTurnUsage);
    void loadAccountOverview();
  };

  const dispatchAiEvent = (event, eventEpoch = currentRequestEpoch) => {
    if (eventEpoch !== currentRequestEpoch) return;
    if (event.kind === "progress") {
      const progressText = `${event.title || ""} ${event.detail || ""}`;
      const phase = /후처리|배경|정리|완료/.test(progressText) ? "finish"
        : /렌더|그리|생성/.test(progressText) ? "render"
        : /배치|구성|설계/.test(progressText) ? "compose" : "analyze";
      setGenerating(true, event.title, event.detail, phase);
      setStatus("이미지 생성 중…", "busy");
    } else if (event.kind === "image" && event.src) {
      imageReceived = true;
      previewPending = true;
      const imageTurnId = event.turnId;
      const isCurrent = () => eventEpoch === currentRequestEpoch && (!imageTurnId || imageTurnId === currentTurnId);
      setGenerating(true, "생성 결과를 정리하고 있습니다", "배경을 투명하게 정리하고 편집용 이미지를 준비합니다.", "finish");
      void addPreview(event.src, { isCurrent }).then(async (added) => {
        if (!added || !isCurrent()) return;
        if (currentEngine === IMAGE_ENGINE_IDS.RASTER && added.postprocessOk) {
          await storeCurrentOutput({ data: added.data });
        }
        setStatus(serverTurnFinished ? "생성 완료" : "서버 작업 종료 확인 중", serverTurnFinished ? "ok" : "busy");
        addLog("이미지가 완성되었습니다. 생성 결과에서 확인하거나 캔버스로 출력할 수 있습니다.");
      }).catch((error) => {
        if (!isCurrent()) return;
        addLog(error.message || String(error), "error");
        setStatus("생성 결과 처리 실패", "error");
      }).finally(() => {
        if (!isCurrent()) return;
        previewPending = false;
        if (serverTurnFinished) setGenerating(false);
        else setGenerating(true, "이미지 준비 완료", "서버 작업 종료를 확인하고 있습니다.", "finish");
        finishCurrentTurnUi(eventEpoch);
      });
    } else if (event.kind === "assistant") {
      if (currentTurnType === "image" && currentEngine === IMAGE_ENGINE_IDS.FAST_SCENE) {
        currentSceneResponse = String(event.text || "").trim();
      } else {
        addLog(event.text);
        if (currentTurnType === "chat") recordConversationMessage("assistant", event.text);
      }
    } else if (event.kind === "tokens") {
      currentTurnUsage = event.usage;
      if (currentTurnDone) addTokenFooter(currentTurnUsage);
    } else if (event.kind === "performance") {
      currentTurnPerformance = { ...currentTurnPerformance, ...event.metrics };
      persistPerformance(currentTurnPerformance);
      if (currentTurnDone) addTokenFooter(currentTurnUsage);
    } else if (event.kind === "limits") {
      renderLimits(event.limits);
    } else if (event.kind === "finalization") {
      if (event.state === "interrupting" || event.state === "interruptAccepted") {
        setStatus("서버 작업 종료 확인 중", "busy");
      } else if (event.state === "interruptFailed") {
        setStatus("종료 상태를 다시 확인하고 있습니다", "busy");
      } else if (event.state === "recovering") {
        setStatus("AI 작업 종료를 복구하고 있습니다", "busy");
      } else if (event.state === "recoveryFailed") {
        setGenerating(false);
        setStatus("AI 작업 종료 확인 실패", "error");
        if (event.message) addLog(`작업 종료 복구 실패: ${event.message}`, "error");
        if (event.status === "failed") {
          serverTurnFinished = true;
          previewPending = false;
          currentTurnDone = true;
          finishCurrentTurnUi(eventEpoch);
        }
      } else if (event.state === "confirmed" || event.state === "recovered") {
        serverTurnFinished = true;
        currentTurnDone = true;
        if (imageReceived && !previewPending) {
          setGenerating(false);
          setStatus("생성 완료", "ok");
        }
        finishCurrentTurnUi(eventEpoch);
      }
    } else if (event.kind === "error") {
      addLog(event.text, "error");
      setGenerating(false);
      setStatus("작업 실패", "error");
    } else if (event.kind === "done") {
      serverTurnFinished = true;
      currentTurnDone = true;
      if (currentTurnType === "image" && currentEngine === IMAGE_ENGINE_IDS.FAST_SCENE && event.status === "completed") {
        const compiledScene = compilePanelScene(currentSceneResponse, {
          mode: currentRunInput?.mode || selectedMode,
          layerId: state.get().activeLayerId,
          idPrefix: `ai_scene_${eventEpoch}`,
        });
        const compiled = compiledScene.result;
        currentTurnPerformance = {
          ...currentTurnPerformance,
          engine: IMAGE_ENGINE_IDS.FAST_SCENE,
          sceneCompileMs: compiled.stats.compileMs,
          sceneObjectCount: compiled.stats.outputObjects,
          sceneFallback: !compiled.valid || !compiled.supported || !compiled.objects.length,
        };
        persistPerformance(currentTurnPerformance);
        if (compiled.valid && compiled.supported && compiled.objects.length) {
          imageReceived = true;
          previewPending = true;
          setGenerating(true, "편집 가능한 도식을 준비하고 있습니다", "5E 오브젝트와 미리보기를 구성합니다.", "finish");
          Promise.resolve().then(async () => {
            const item = addScenePreview(compiled, compiledScene.source, compiledScene.compileSource);
            if (!item) throw new Error("빠른 벡터 결과를 미리보기에 추가하지 못했습니다.");
            await storeCurrentOutput({
              data: item.data,
              sceneSource: compiledScene.source,
              sceneCompileSource: compiledScene.compileSource,
            });
            addLog(`이미지가 완성되었습니다. 편집 가능한 벡터 오브젝트 ${compiled.objects.length}개로 캔버스에 출력할 수 있습니다.`);
            setStatus("빠른 벡터 도식 생성 완료", "ok");
          }).catch((error) => {
            addLog(error.message || String(error), "error");
            setStatus("벡터 결과 처리 실패", "error");
          }).finally(() => {
            if (eventEpoch !== currentRequestEpoch) return;
            previewPending = false;
            setGenerating(false);
            finishCurrentTurnUi(eventEpoch);
          });
          return;
        }

        if (normalizeOutputEngine(currentRunInput?.outputEngine) === AI_OUTPUT_ENGINES.ASSET) {
          setGenerating(false);
          setBusy(false);
          setStatus("5E 에셋으로 표현할 수 없는 요청입니다.", "warn");
          addLog("선택한 요청은 현재 지원되는 5E 에셋 범위를 벗어났습니다. 출력 방식을 ‘교과서 선화’로 바꾸면 래스터 이미지로 생성할 수 있습니다.", "error");
          return;
        }

        const snapshot = currentRequestSnapshot;
        addLog("이 요청은 빠른 벡터 도식 범위를 벗어나 고정밀 이미지 경로로 자동 전환합니다.");
        setStatus("고정밀 이미지 경로로 전환 중…", "busy");
        setGenerating(true, "고정밀 이미지 경로로 전환합니다", "장면에서 표현하지 못한 삽화를 생성합니다.", "analyze");
        setBusy(false);
        setTimeout(() => {
          if (eventEpoch !== currentRequestEpoch || !snapshot) return;
          void submit("image", {
            requestOverride: snapshot.request,
            discussionContextOverride: snapshot.discussionContext,
            runInputSnapshot: snapshot.runInput,
            forceEngine: IMAGE_ENGINE_IDS.RASTER,
            silentUserLog: true,
          });
        }, 0);
        return;
      }
      if (!imageReceived) setGenerating(false);
      if (event.status === "failed") {
        if (event.error) addLog(String(event.error), "error");
        setStatus("작업 실패", "error");
      } else if (event.status === "interrupted") {
        if (!previewPending) setGenerating(false);
        setStatus(imageReceived && currentTurnType === "image" ? (previewPending ? "생성 결과 정리 중" : "생성 완료") : "작업 취소됨", imageReceived ? "ok" : "warn");
      } else if (imageReceived && currentTurnType === "image") {
        if (!previewPending) setGenerating(false);
        setStatus(previewPending ? "생성 결과 정리 중" : "생성 완료", previewPending ? "busy" : "ok");
      } else if (!imageReceived) {
        setStatus(currentTurnType === "chat" ? "답변 완료" : "이미지 없이 응답 완료", "ok");
      }
      finishCurrentTurnUi(eventEpoch);
    }
  };

  window.fiveEDesktop?.onEvent((message) => {
    const event = parseAiEvent(message);
    const turnScoped = ["progress", "image", "assistant", "tokens", "performance", "error", "done", "finalization"].includes(event.kind);
    if (batchActive && turnScoped && (event.turnId || event.threadId)) {
      const batchJob = (event.turnId && batchRuns.get(event.turnId))
        || Array.from(batchRuns.values()).find((job) => event.threadId && job.threadId === event.threadId);
      if (batchJob) {
        void dispatchBatchEvent(batchJob, event);
        return;
      }
      const belongsToCurrent = (event.turnId && event.turnId === currentTurnId)
        || (event.threadId && currentRenderThreadId && event.threadId === currentRenderThreadId);
      if (!belongsToCurrent) {
        unclaimedBatchEvents.push(event);
        if (unclaimedBatchEvents.length > 100) unclaimedBatchEvents.shift();
        return;
      }
    }
    if (turnScoped && (event.turnId || event.threadId)) {
      if (awaitingTurnId && !currentTurnId) {
        queuedTurnEvents.push({ event });
        return;
      }
      if (event.turnId && (!currentTurnId || event.turnId !== currentTurnId)) return;
      if (event.threadId && currentRenderThreadId && event.threadId !== currentRenderThreadId) return;
    } else if (event.kind === "tokens" && currentTurnId) {
      // App Server token notifications are turn-scoped. Ignore malformed or
      // legacy unscoped updates instead of letting a late attempt overwrite
      // the active result footer.
      return;
    }
    dispatchAiEvent(event, currentRequestEpoch);
  });
  window.fiveEDesktop?.onState((current) => {
    if (current.state === "running" && !busy) setStatus("AI 사용 가능", "ok");
    else if (current.state !== "running" && busy) {
      serverTurnFinished = true;
      previewPending = false;
      currentTurnDone = true;
      awaitingTurnId = false;
      queuedTurnEvents = [];
      currentRenderThreadId = null;
      setGenerating(false);
      setBusy(false);
      setStatus("AI 연결이 종료되었습니다. 다음 요청에서 자동으로 다시 연결합니다.", "error");
      addLog(current.message || "AI 연결이 종료되어 현재 작업을 끝냈습니다.", "error");
      addTokenFooter(currentTurnUsage);
    } else if (current.state !== "running" && !busy) setStatus("AI 자동 연결 대기", "warn");
  });
  panel.querySelector("[data-ai-close]").addEventListener("click", close);
  panel.addEventListener("mousedown", (event) => { if (event.target === panel) close(); });
  document.addEventListener("paste", (event) => {
    if (panel.hidden || event.target.closest("input, textarea, select, [contenteditable=true]")) return;
    const item = Array.from(event.clipboardData?.items || []).find((entry) => entry.type.startsWith("image/"));
    const pasted = item?.getAsFile();
    if (!pasted) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void blobToDataUrl(pasted).then((data) => {
      addReferenceData({ data, name: pasted.name || "클립보드 이미지", sourceKind: "clipboard" });
      setStatus("붙여넣은 이미지가 AI 참고로 추가되었습니다.", "ok");
    });
  }, true);
  panel.addEventListener("dragover", (event) => {
    if (Array.from(event.dataTransfer?.items || []).some((item) => item.kind === "file")) event.preventDefault();
  });
  panel.addEventListener("drop", (event) => {
    const dropped = Array.from(event.dataTransfer?.files || []).filter((item) => item.type.startsWith("image/"));
    if (!dropped.length) return;
    event.preventDefault();
    void Promise.all(dropped.map(blobToDataUrl)).then((dataUrls) => {
      dropped.forEach((item, index) => addReferenceData({ data: dataUrls[index], name: item.name, sourceKind: "drop" }));
      setStatus(`끌어놓은 이미지 ${dropped.length}개가 AI 참고로 추가되었습니다.`, "ok");
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) close();
  });
  modal?.addEventListener("mousedown", (event) => event.stopPropagation());
  if (!taskTabs.size) createTaskTab();
  syncMode();
  syncQualityMode();
  syncOutputEngine();
  syncReferenceSummary();
  setBusy(false);
  refresh();

  return { open, close, attachReference };
}

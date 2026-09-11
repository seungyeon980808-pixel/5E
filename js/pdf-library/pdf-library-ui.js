import { createCropOverrideStore } from "./crop-overrides.js";
import { partitionLibraryImports } from "../library-import-policy.js";
import { createCropSource } from "./contract.js";

const MAX_SELECTIONS = 10;
const THUMBNAIL_DPI = 96;
const HIGH_RES_DPI = 300;
export const PDF_INDEX_LABELS = Object.freeze({
  reading: "읽는 중", searchable: "검색 가능", "needs-ocr": "문자 인식 필요", failed: "실패", excluded: "검색 제외",
});

export function summarizePdfIndexStates(records, connections = []) {
  const counts = new Map(Object.keys(PDF_INDEX_LABELS).map((state) => [state, 0]));
  for (const record of records) {
    const state = record.indexState?.state || "reading";
    counts.set(state, (counts.get(state) || 0) + 1);
  }
  const excluded = connections.reduce((sum, connection) => sum + (Number(connection.excludedCount) || 0), 0);
  counts.set("excluded", excluded);
  return Object.entries(PDF_INDEX_LABELS).map(([state, label]) => Object.freeze({ state, label, count: counts.get(state) || 0 }));
}

export function clampCropRect(rect) {
  const [rawX = 0, rawY = 0, rawW = 1, rawH = 1] = Array.isArray(rect) ? rect : [];
  const x = Math.max(0, Math.min(1, Number(rawX) || 0));
  const y = Math.max(0, Math.min(1, Number(rawY) || 0));
  const w = Math.max(0.01, Math.min(1 - x, Number(rawW) || 1));
  const h = Math.max(0.01, Math.min(1 - y, Number(rawH) || 1));
  return [x, y, w, Math.round(h * 1000000) / 1000000];
}

function isEditableTarget(target) {
  if (!target || typeof target !== "object") return false;
  const tagName = String(target.tagName || "").toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable === true || target.getAttribute?.("contenteditable") === "true";
}

export function shouldHandlePdfSpace(event) {
  return event.key === " " && !event.ctrlKey && !event.metaKey && !event.altKey && !isEditableTarget(event.target);
}

export function shouldHandlePdfArrow(event) {
  return (event.key === "ArrowLeft" || event.key === "ArrowRight") && !isEditableTarget(event.target);
}

export function documentNeedsOcr(document) {
  return document?.pages?.some((page) => !page.text.trim()) === true;
}

export function lazyOpenIsCurrent(request, current) {
  if (!request.wasPack) return true;
  return request.epoch === current.epoch && current.inPack && request.opener === current.opener;
}

function pngDataUrl(bytes) {
  const blob = new Blob([bytes], { type: "image/png" });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("PNG 결과를 읽지 못했습니다."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function localPdfDocumentId(fileName, sha256) {
  return `local:${sha256}:${encodeURIComponent(fileName)}`;
}

function resultId(result, index) {
  const source = result.source || {};
  const item = result.itemId || result.itemNumber || index;
  return result.id || `${source.documentId || result.documentId || "pdf"}:${source.pageNumber || result.page || 1}:${item}`;
}

function normalizedSource(result) {
  const source = result.source || {};
  const rect = clampCropRect(source.rect || result.rect || result.crop || [0, 0, 1, 1]);
  return {
    documentId: source.documentId || result.documentId || result.sourceId,
    pageNumber: source.pageNumber || result.page || 1,
    rect,
    fullPageFallback: Boolean(source.fullPageFallback || result.fullPageFallback),
  };
}

export function assertPdfMaterializationSource(result, source, pageCount) {
  let expected;
  let candidate;
  try {
    expected = createCropSource(result?.provenance?.provider === "pdf" ? result.provenance : result?.source);
    candidate = createCropSource(source);
  } catch {
    throw new TypeError("PDF materialization source is invalid");
  }
  if (!Number.isInteger(pageCount) || pageCount < 1 || candidate.pageNumber > pageCount
    || expected.documentId !== candidate.documentId || expected.pageNumber !== candidate.pageNumber
    || expected.fullPageFallback !== candidate.fullPageFallback
    || expected.rect.some((value, index) => value !== candidate.rect[index])) {
    throw new TypeError("PDF materialization source does not match its result");
  }
  return candidate;
}

function resultTitle(result) {
  if (result.title || result.name) return result.title || result.name;
  const documentTitle = result.documentTitle || result.sourceName || "PDF 자료";
  if (result.itemNumber != null) return `${documentTitle} ${result.itemNumber}번`;
  return `${documentTitle} ${result.pageNumber || result.page || 1}쪽`;
}

function resultCaption(result) {
  const source = normalizedSource(result);
  return `${result.documentTitle || result.sourceName || "원본 PDF"} · ${source.pageNumber}쪽`;
}

export function expandFigureResults(found) {
  return found.flatMap((result) => {
    if (!Array.isArray(result.figureCandidates) || result.figureCandidates.length === 0) return [result];
    const source = normalizedSource(result);
    const title = resultTitle(result);
    const candidates = result.figureCandidates.map((candidate, index) => ({
      ...result,
      id: `${resultId(result, 0)}:figure:${candidate.id || index + 1}`,
      title: `${title} · 도판 ${index + 1}`,
      source: candidate.source || { ...source, rect: clampCropRect(candidate.rect), fullPageFallback: false },
      figureCandidates: [],
    }));
    return [...candidates, { ...result, id: `${resultId(result, 0)}:question`, title: `${title} · 문항 전체`, figureCandidates: [] }];
  });
}

export function createPdfLibraryUi({ state, host, loadRuntime, searchDocuments, invalidateSearch, insertImage, openIndependentReferences, loadDesktopAdapter, onCatalogChange }) {
  let runtime = null;
  let docs = [];
  let packDocumentIds = new Set();
  let packSearchIndex = null;
  let packSyncEpoch = 0;
  const updatedPackDocumentIds = new Set();
  let browserPdfBytes = 0;
  let browserPdfCount = 0;
  const documentOpeners = new Map();
  const documentPersistors = new Map();
  const pendingDocumentOpens = new Map();
  let runtimeTail = Promise.resolve();
  let results = [];
  let selectedIds = new Set();
  let activeResultIndex = -1;
  let searchEpoch = 0;
  let searchTimer = 0;
  let thumbnailObserver = null;
  let thumbnailEpoch = 0;
  let thumbnailActive = 0;
  let thumbnailJobs = [];
  let previewAbort = null;
  let returnFocus = null;
  let ocrController = null;
  let referenceConsumer = null;
  let desktopAdapter = null;
  let desktopRecords = [];
  const cropOverrides = createCropOverrideStore();

  host.innerHTML = `
    <div class="pdflib-source-row">
      <label class="pdflib-upload modal-btn" for="examlib-pdf-files">PDF 가져오기</label>
      <input id="examlib-pdf-files" type="file" accept="application/pdf,.pdf" multiple hidden>
      <button type="button" class="modal-btn" data-pdflib-connected>연결한 폴더</button>
      <a class="modal-btn pdflib-desktop-link" href="https://github.com/seungyeon980808-pixel/5E/releases/latest" target="_blank" rel="noopener noreferrer">설치형 받기</a>
      <span class="pdflib-source-status" data-pdflib-source-status>PDF를 선택하면 이 컴퓨터에서만 읽습니다.</span>
      <button type="button" class="modal-btn" data-pdflib-ocr hidden>스캔 글자 인식</button>
      <button type="button" class="modal-btn" data-pdflib-ocr-cancel hidden>인식 취소</button>
    </div>
    <div class="pdflib-packs" data-pdflib-packs aria-live="polite"></div>
    <section class="pdflib-index-overview" data-pdflib-index-overview hidden aria-label="개인 PDF 색인 상태">
      <header><strong>개인 PDF 상태</strong><span data-pdflib-index-counts></span></header>
      <div class="pdflib-index-legend" data-pdflib-index-legend role="list" aria-label="PDF 색인 상태별 파일 수"></div>
      <ul data-pdflib-index-list></ul>
    </section>
    <label class="pdflib-query-label" for="examlib-pdf-query">PDF 내용 검색</label>
    <input id="examlib-pdf-query" class="pdflib-query" type="search" autocomplete="off" placeholder="예: 전자기 유도, 도르레, 2026 5번">
    <div class="pdflib-filter-row" aria-label="PDF 자료 필터">
      <select data-pdflib-year aria-label="학년도"><option value="">전체 학년도</option></select>
      <select data-pdflib-administration aria-label="시행 구분"><option value="">전체 시행</option></select>
      <select data-pdflib-subject aria-label="과목"><option value="">전체 과목</option></select>
      <button type="button" class="modal-btn" data-pdflib-cache-clear>미리보기 캐시 비우기</button>
    </div>
    <div class="pdflib-toolbar">
      <span role="status" data-pdflib-status>PDF 자료를 가져와 검색하세요.</span>
      <div class="pdflib-actions">
        <button type="button" class="modal-btn modal-btn-primary" data-pdflib-reference-add hidden disabled>AI 참고로 추가</button>
        <button type="button" class="modal-btn modal-btn-primary" data-pdflib-insert disabled>캔버스에 넣기</button>
        <button type="button" class="modal-btn" data-pdflib-ai-run disabled>AI로 변환</button>
      </div>
    </div>
    <div class="pdflib-grid" data-pdflib-grid aria-live="polite"></div>
    <div class="pdflib-preview" data-pdflib-preview hidden role="dialog" aria-modal="true" aria-label="PDF 고해상도 미리보기">
      <div class="pdflib-preview-head">
        <strong data-pdflib-preview-title></strong>
        <div class="pdflib-preview-actions">
          <button type="button" class="modal-btn" data-pdflib-original>원문 보기</button>
          <button type="button" class="modal-btn" data-pdflib-adjust>범위 조정</button>
          <button type="button" class="modal-btn modal-btn-primary" data-pdflib-preview-insert>캔버스에 넣기</button>
          <button type="button" class="modal-btn" data-pdflib-preview-ai>AI로 변환</button>
          <button type="button" class="modal-btn" data-pdflib-preview-close aria-label="미리보기 닫기">닫기</button>
        </div>
      </div>
      <div class="pdflib-preview-stage"><img data-pdflib-preview-image alt="선택한 PDF 영역 고해상도 미리보기"><div class="pdflib-query-highlights" data-pdflib-highlights aria-hidden="true"></div></div>
      <p class="pdflib-preview-help">Space 또는 Esc로 닫기 · ← →로 결과 이동</p>
    </div>
    <div class="pdflib-crop-editor" data-pdflib-crop-editor hidden role="dialog" aria-modal="true" aria-label="PDF 범위 조정">
      <div class="pdflib-preview-head"><strong>범위 조정</strong><button type="button" class="modal-btn" data-pdflib-crop-close>취소</button><button type="button" class="modal-btn modal-btn-primary" data-pdflib-crop-save>적용</button></div>
      <div class="pdflib-crop-stage" data-pdflib-crop-stage><img data-pdflib-crop-image alt="원문 PDF 페이지"><div class="pdflib-crop-box" data-pdflib-crop-box></div></div>
      <div class="pdflib-correction-fields">
        <label>문항 번호 <input type="number" min="1" step="1" data-pdflib-item-number></label>
        <label>검색 이름 <input type="text" maxlength="200" data-pdflib-item-label placeholder="예: 12번 용수철 도판"></label>
      </div>
      <p data-pdflib-crop-guidance>사각형 안을 드래그해 범위를 옮기세요. 자동 경계를 찾지 못한 경우 전체 페이지에서 시작합니다.</p>
    </div>`;

  const fileInput = host.querySelector("#examlib-pdf-files");
  const ocrButton = host.querySelector("[data-pdflib-ocr]");
  const ocrCancelButton = host.querySelector("[data-pdflib-ocr-cancel]");
  const packHost = host.querySelector("[data-pdflib-packs]");
  const connectedButton = host.querySelector("[data-pdflib-connected]");
  const queryInput = host.querySelector("#examlib-pdf-query");
  const yearFilter = host.querySelector("[data-pdflib-year]");
  const administrationFilter = host.querySelector("[data-pdflib-administration]");
  const subjectFilter = host.querySelector("[data-pdflib-subject]");
  const status = host.querySelector("[data-pdflib-status]");
  const sourceStatus = host.querySelector("[data-pdflib-source-status]");
  const grid = host.querySelector("[data-pdflib-grid]");
  const insertButton = host.querySelector("[data-pdflib-insert]");
  const referenceAddButton = host.querySelector("[data-pdflib-reference-add]");
  const aiRunButton = host.querySelector("[data-pdflib-ai-run]");
  const preview = host.querySelector("[data-pdflib-preview]");
  const previewImage = host.querySelector("[data-pdflib-preview-image]");
  const previewTitle = host.querySelector("[data-pdflib-preview-title]");
  const previewHighlights = host.querySelector("[data-pdflib-highlights]");
  const cropEditor = host.querySelector("[data-pdflib-crop-editor]");
  const cropStage = host.querySelector("[data-pdflib-crop-stage]");
  const cropImage = host.querySelector("[data-pdflib-crop-image]");
  const cropBox = host.querySelector("[data-pdflib-crop-box]");
  const itemNumberInput = host.querySelector("[data-pdflib-item-number]");
  const itemLabelInput = host.querySelector("[data-pdflib-item-label]");

  function renderIndexOverview(records, connections = []) {
    const section = host.querySelector("[data-pdflib-index-overview]");
    if (!section) return;
    const excluded = connections.reduce((sum, connection) => sum + (Number(connection.excludedCount) || 0), 0);
    section.hidden = records.length === 0 && excluded === 0;
    const states = summarizePdfIndexStates(records, connections);
    const counts = new Map(states.map((state) => [state.state, state.count]));
    host.querySelector("[data-pdflib-index-counts]").textContent = `${records.length}개 파일 · ${connections.reduce((sum, item) => sum + (Number(item.documentCount) || 0), 0)}개 PDF`;
    host.querySelector("[data-pdflib-index-legend]").replaceChildren(...states.map(({ state: stateName, label, count }) => {
      const state = document.createElement("span");
      state.dataset.state = stateName;
      state.setAttribute("role", "listitem");
      state.textContent = `${label} ${count}`;
      return state;
    }));
    const rows = records.map((record) => {
      const item = document.createElement("li");
      const stateName = record.indexState?.state || "reading";
      item.dataset.state = stateName;
      const diagnostic = record.indexState?.diagnostic;
      item.innerHTML = `<strong></strong><span></span><small></small>`;
      item.querySelector("strong").textContent = record.name || record.relativePath || "PDF";
      item.querySelector("span").textContent = PDF_INDEX_LABELS[stateName] || PDF_INDEX_LABELS.reading;
      item.querySelector("small").textContent = diagnostic?.message || (stateName === "needs-ocr" ? "문자 인식을 실행하면 검색할 수 있습니다." : stateName === "failed" ? "원본을 확인한 뒤 다시 동기화하세요." : "");
      return item;
    });
    for (const [stateName, count] of counts) {
      if (stateName !== "excluded") continue;
      const item = document.createElement("li");
      item.dataset.state = stateName;
      item.textContent = `${PDF_INDEX_LABELS[stateName]} · ${count}개 · 선택을 켜면 다시 읽습니다.`;
      rows.push(item);
    }
    host.querySelector("[data-pdflib-index-list]").replaceChildren(...rows);
  }

  const setStatus = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle("is-error", error);
  };
  const activeResult = () => results[activeResultIndex] || null;
  const selectedResults = () => results.filter((result, index) => selectedIds.has(resultId(result, index)));
  const updateActions = () => {
    const count = selectedIds.size;
    insertButton.disabled = count === 0;
    referenceAddButton.disabled = count === 0;
    referenceAddButton.textContent = count > 1 ? `선택 ${count}개 AI 참고로 추가` : "AI 참고로 추가";
    aiRunButton.disabled = count === 0 || typeof openIndependentReferences !== "function";
    insertButton.textContent = count > 1 ? `캔버스에 넣기 (${count})` : "캔버스에 넣기";
    aiRunButton.textContent = count > 1 ? `선택 ${count}개 AI로 변환` : "AI로 변환";
  };
  const selectedCard = (result, index) => selectedIds.has(resultId(result, index));
  const refreshOcrControls = () => {
    const imageOnlyCount = docs.filter(documentNeedsOcr).length;
    ocrButton.hidden = imageOnlyCount === 0;
    ocrButton.disabled = ocrController !== null;
    ocrButton.textContent = imageOnlyCount > 1 ? `스캔 글자 인식 (${imageOnlyCount})` : "스캔 글자 인식";
    ocrCancelButton.hidden = ocrController === null;
  };
  const replaceOptions = (select, values, label) => {
    const previous = select.value;
    select.replaceChildren(new Option(label, ""), ...values.map(({ value, text }) => new Option(text, value)));
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
  };
  const refreshPackFilters = () => {
    const metadata = packSearchIndex?.entries?.map((entry) => entry.metadata).filter(Boolean) ?? [];
    const years = [...new Set(metadata.map((item) => String(item.academicYear)))].sort().map((value) => ({ value, text: `${value}학년도` }));
    const administrations = [...new Set(metadata.map((item) => item.administration))].sort().map((value) => ({
      value,
      text: ({ june: "6월 모의평가", september: "9월 모의평가", csat: "대학수학능력시험" })[value] || value,
    }));
    const subjects = [...new Set(metadata.map((item) => item.subject))].sort().map((value) => ({
      value,
      text: ({ phy1: "물리학 I", phy2: "물리학 II", che1: "화학 I", che2: "화학 II", bio1: "생명과학 I", bio2: "생명과학 II", ear1: "지구과학 I", ear2: "지구과학 II" })[value] || value,
    }));
    replaceOptions(yearFilter, years, "전체 학년도");
    replaceOptions(administrationFilter, administrations, "전체 시행");
    replaceOptions(subjectFilter, subjects, "전체 과목");
  };

  async function ensureRuntime() {
    if (!runtime) runtime = await loadRuntime();
    return runtime;
  }

  async function withRuntimeLock(operation) {
    const previous = runtimeTail;
    let release;
    runtimeTail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async function ensureDocumentOpen(documentId) {
    const activeRuntime = await ensureRuntime();
    const opened = activeRuntime.getDocument?.(documentId);
    if (opened) return opened;
    const pending = pendingDocumentOpens.get(documentId);
    if (pending) return pending;
    const document = docs.find((candidate) => candidate.id === documentId);
    const openDocument = documentOpeners.get(documentId);
    if (!document || typeof openDocument !== "function") {
      throw new Error("선택한 PDF 원본을 열 수 없습니다.");
    }
    const ownEpoch = packSyncEpoch;
    const wasPack = packDocumentIds.has(documentId);
    const opening = Promise.resolve(openDocument(activeRuntime, document)).then(async (record) => {
      if (!lazyOpenIsCurrent(
        { wasPack, epoch: ownEpoch, opener: openDocument },
        { epoch: packSyncEpoch, opener: documentOpeners.get(documentId), inPack: packDocumentIds.has(documentId) },
      )) {
        await activeRuntime.closeDocument(documentId);
        throw new DOMException("PDF catalog changed while opening", "AbortError");
      }
      return record;
    }).finally(() => {
      if (pendingDocumentOpens.get(documentId) === opening) pendingDocumentOpens.delete(documentId);
    });
    pendingDocumentOpens.set(documentId, opening);
    return opening;
  }

  async function renderThumbnail(card, result) {
    const controller = new AbortController();
    card._pdfAbort = controller;
    const image = card.querySelector("img");
    try {
      const source = normalizedSource(result);
      const render = await withRuntimeLock(async () => {
        if (controller.signal.aborted) throw controller.signal.reason;
        await ensureDocumentOpen(source.documentId);
        return runtime.renderCrop({ source, dpi: THUMBNAIL_DPI, signal: controller.signal });
      });
      if (controller.signal.aborted || card._pdfAbort !== controller) return;
      image.src = await pngDataUrl(render.bytes);
      image.dataset.ready = "true";
    } catch (error) {
      if (!controller.signal.aborted) image.alt = "미리보기를 불러오지 못했습니다.";
    } finally {
      thumbnailActive -= 1;
      pumpThumbnailQueue();
    }
  }

  function pumpThumbnailQueue() {
    while (thumbnailActive < 2 && thumbnailJobs.length) {
      const job = thumbnailJobs.shift();
      if (job.epoch !== thumbnailEpoch || !job.card.isConnected) continue;
      thumbnailActive += 1;
      void renderThumbnail(job.card, job.result);
    }
  }

  function queueThumbnail(card, result) {
    thumbnailJobs.push({ card, result, epoch: thumbnailEpoch });
    pumpThumbnailQueue();
  }

  function clearGrid() {
    thumbnailEpoch += 1;
    thumbnailJobs = [];
    thumbnailObserver?.disconnect();
    thumbnailObserver = null;
    for (const card of grid.querySelectorAll(".pdflib-card")) card._pdfAbort?.abort();
    grid.replaceChildren();
  }

  function renderResults(nextResults) {
    results = expandFigureResults(nextResults).map((result) => {
      const documentId = normalizedSource(result).documentId;
      const documentSourceHash = docs.find((document) => document.id === documentId)?.source?.sha256;
      if (documentSourceHash) result = { ...result, documentSourceHash };
      const override = cropOverrides.get(result);
      return override ? { ...result, source: { ...normalizedSource(result), rect: override, fullPageFallback: false } } : result;
    });
    selectedIds = new Set();
    activeResultIndex = results.length ? 0 : -1;
    clearGrid();
    updateActions();
    if (!results.length) {
      setStatus("검색 결과가 없습니다.");
      return;
    }
    setStatus(`${results.length}개 결과 · 카드를 한 번 눌러 선택하고 Space로 확대하세요.`);
    thumbnailObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const card = entry.target;
        thumbnailObserver.unobserve(card);
        const index = Number(card.dataset.resultIndex);
        queueThumbnail(card, results[index]);
      }
    }, { root: grid, rootMargin: "160px" });
    results.forEach((result, index) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "pdflib-card";
      card.dataset.resultIndex = String(index);
      card.setAttribute("aria-pressed", "false");
      card.innerHTML = `<span class="pdflib-thumb"><img alt="PDF 크롭 미리보기"></span><span class="pdflib-card-meta"><strong></strong><small></small><em></em></span>`;
      card.querySelector("strong").textContent = resultTitle(result);
      card.querySelector("small").textContent = resultCaption(result);
      card.querySelector("em").textContent = result.snippet || "PDF에서 찾은 자료";
      grid.append(card);
      thumbnailObserver.observe(card);
    });
  }

  function markSelection() {
    for (const card of grid.querySelectorAll(".pdflib-card")) {
      const index = Number(card.dataset.resultIndex);
      const selected = selectedCard(results[index], index);
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-pressed", String(selected));
    }
    updateActions();
  }

  async function runSearch() {
    const ownEpoch = ++searchEpoch;
    const query = queryInput.value.trim();
    if (!docs.length) {
      renderResults([]);
      setStatus("먼저 PDF 자료를 가져오세요.");
      return;
    }
    setStatus("PDF 내용을 검색하는 중…");
    try {
      const indexedPackIds = [...packDocumentIds].filter((id) => !updatedPackDocumentIds.has(id));
      const prebuiltIndex = updatedPackDocumentIds.size && packSearchIndex
        ? { ...packSearchIndex, entries: packSearchIndex.entries.filter((entry) => !updatedPackDocumentIds.has(entry.documentId)) }
        : packSearchIndex;
      const found = await searchDocuments(docs, query, {
        filters: {
          academicYear: yearFilter.value,
          administration: administrationFilter.value,
          subject: subjectFilter.value,
        },
        prebuiltIndexes: prebuiltIndex
          ? [{ documents: docs.filter((document) => indexedPackIds.includes(document.id)).map(({ id, pageCount }) => ({ id, pageCount })), index: prebuiltIndex }]
          : [],
      });
      if (ownEpoch !== searchEpoch) return;
      renderResults(Array.isArray(found) ? found : []);
    } catch (error) {
      if (ownEpoch === searchEpoch) setStatus(`검색 실패: ${error instanceof Error ? error.message : error}`, true);
    }
  }

  function queueSearch() {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void runSearch(), 160);
  }

  async function openFiles(files) {
    const { acceptedPdfs, rejected } = partitionLibraryImports(files, { currentPdfBytes: browserPdfBytes, currentPdfCount: browserPdfCount });
    if (!acceptedPdfs.length) {
      if (rejected.length) setStatus("지원하지 않거나 256MB를 넘는 PDF는 열 수 없습니다.", true);
      return;
    }
    try {
      const activeRuntime = await ensureRuntime();
      setStatus("PDF를 여는 중…");
      const opened = [];
      for (const file of acceptedPdfs) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const contentHash = await sha256Hex(bytes);
        const id = localPdfDocumentId(file.name, contentHash);
        const input = {
          id,
          title: file.name,
          source: { kind: "file", locator: `browser:${id}`, displayName: file.name, sha256: contentHash },
        };
        const openDocument = async (targetRuntime) => targetRuntime.openDocument({ ...input, data: bytes });
        documentOpeners.set(id, openDocument);
        opened.push(await withRuntimeLock(() => openDocument(activeRuntime)));
        browserPdfBytes += file.size;
        browserPdfCount += 1;
      }
      const openedIds = new Set(opened.map((document) => document.id));
      docs = [...docs.filter((document) => !openedIds.has(document.id)), ...opened];
      onCatalogChange?.();
      refreshOcrControls();
      sourceStatus.textContent = `${docs.length}개 PDF를 현재 브라우저에서 읽고 있습니다.`;
      await runSearch();
    } catch (error) {
      setStatus(`PDF 열기 실패: ${error instanceof Error ? error.message : error}`, true);
    }
  }

  async function replacePackCatalog({ documents: nextDocuments, openDocument, searchIndex = null }) {
    const ownEpoch = ++packSyncEpoch;
    const nextIds = new Set(nextDocuments.map((document) => document.id));
    const removedIds = [...packDocumentIds].filter((id) => !nextIds.has(id));
    for (const id of removedIds) await withRuntimeLock(() => runtime?.closeDocument(id));
    if (ownEpoch !== packSyncEpoch) return;
    for (const id of packDocumentIds) {
      documentOpeners.delete(id);
      documentPersistors.delete(id);
    }
    docs = [...docs.filter((document) => !packDocumentIds.has(document.id)), ...nextDocuments];
    packDocumentIds = nextIds;
    for (const id of updatedPackDocumentIds) if (!nextIds.has(id)) updatedPackDocumentIds.delete(id);
    for (const document of nextDocuments) {
      documentOpeners.set(document.id, (activeRuntime, current) => openDocument(activeRuntime, current));
    }
    packSearchIndex = searchIndex;
    onCatalogChange?.();
    refreshPackFilters();
    invalidateSearch?.();
    closePreview();
    refreshOcrControls();
    await runSearch();
  }

  async function recognizeScans() {
    const targets = docs.filter(documentNeedsOcr);
    if (!targets.length || ocrController) return;
    const operation = { controller: new AbortController(), epoch: packSyncEpoch };
    ocrController = operation.controller;
    refreshOcrControls();
    try {
      const { createPdfOcrService } = await import("./ocr.js");
      const ocr = createPdfOcrService({ runtime });
      for (const document of targets) {
        const expectedSource = JSON.stringify(document.source);
        const recognized = await withRuntimeLock(async () => {
          const openedDocument = await ensureDocumentOpen(document.id);
          return ocr.recognizeDocument({
            document: openedDocument,
            language: "kor+eng",
            signal: operation.controller.signal,
            onProgress: (event) => setStatus(`스캔 글자 인식 ${event.pageNumber || 0}/${event.pageCount || 0} · ${Math.round((event.progress || 0) * 100)}%`),
          });
        });
        const current = docs.find((candidate) => candidate.id === document.id);
        if (ocrController !== operation.controller || operation.epoch !== packSyncEpoch || JSON.stringify(current?.source) !== expectedSource) continue;
        await documentPersistors.get(document.id)?.(recognized.document);
        const latest = docs.find((candidate) => candidate.id === document.id);
        if (ocrController !== operation.controller || operation.epoch !== packSyncEpoch || JSON.stringify(latest?.source) !== expectedSource) continue;
        docs = docs.map((candidate) => candidate.id === document.id ? recognized.document : candidate);
        if (packDocumentIds.has(document.id)) updatedPackDocumentIds.add(document.id);
      }
      invalidateSearch?.();
      await runSearch();
      setStatus("스캔 글자 인식과 검색 색인을 갱신했습니다.");
    } catch (error) {
      if (!operation.controller.signal.aborted) setStatus(`스캔 글자 인식 실패: ${error instanceof Error ? error.message : error}`, true);
      else setStatus("스캔 글자 인식을 취소했습니다.");
    } finally {
      if (ocrController === operation.controller) {
        ocrController = null;
        refreshOcrControls();
      }
    }
  }

  async function openConnectedFolder() {
    const library = loadDesktopAdapter ? await loadDesktopAdapter(await ensureRuntime()) : null;
    if (!library) {
      setStatus("연결 폴더는 설치형 앱에서 사용할 수 있습니다.");
      return;
    }
    try {
      const connection = await library.pickFolder();
      const connectionId = connection?.connectionId;
      if (!connectionId) return;
      setStatus("연결 폴더의 PDF 목록을 읽는 중…");
      await library.sync(connectionId);
      const listed = await library.list(connectionId);
      const records = listed.documents || [];
      const tree = await library.folderTree(connectionId);
      desktopAdapter = library;
      desktopRecords = records;
      renderIndexOverview(records, [{ ...connection, excludedCount: tree?.tree?.excludedCount || 0 }]);
      const opened = [];
      for (const record of records) {
        try {
          const document = await withRuntimeLock(() => library.openDocument(record));
          documentOpeners.set(document.id, () => library.openDocument(record));
          documentPersistors.set(document.id, (index) => library.saveDocumentIndex(record.documentId, record.version, index));
          opened.push(document);
        } catch (_) {
          record.indexState = await library.readIndexState(record.documentId).catch(() => record.indexState);
        }
      }
      renderIndexOverview(records, [{ ...connection, excludedCount: tree?.tree?.excludedCount || 0 }]);
      docs = [...docs, ...opened];
      onCatalogChange?.();
      refreshOcrControls();
      sourceStatus.textContent = `${docs.length}개 연결 자료를 읽고 있습니다.`;
      await runSearch();
    } catch (error) {
      setStatus(`연결 폴더 열기 실패: ${error instanceof Error ? error.message : error}`, true);
    }
  }

  async function syncDesktopConnections() {
    const library = desktopAdapter || (loadDesktopAdapter ? await loadDesktopAdapter(await ensureRuntime()) : null);
    if (!library) return { connections: [], documents: [], images: [] };
    desktopAdapter = library;
    const snapshot = await library.connections();
    const connections = snapshot?.connections || [];
    const presentedConnections = [];
    const records = [];
    const images = [];
    const warnings = [];
    for (const connection of connections) {
      const syncResult = await library.sync(connection.connectionId);
      warnings.push(...(syncResult?.warnings || []));
      const listed = await library.list(connection.connectionId);
      records.push(...(listed.documents || []));
      images.push(...(listed.images || []));
      const tree = await library.folderTree(connection.connectionId);
      presentedConnections.push({ ...connection, excludedCount: tree?.tree?.excludedCount || 0 });
    }
    const recordIds = new Set(records.map((record) => record.documentId));
    const retained = docs.filter((document) => packDocumentIds.has(document.id) || !document.source?.locator || !recordIds.has(document.id));
    const opened = [];
    for (const record of records) {
      try {
        const document = await withRuntimeLock(() => library.openDocument(record));
        documentOpeners.set(document.id, () => library.openDocument(record));
        documentPersistors.set(document.id, (index) => library.saveDocumentIndex(record.documentId, record.version, index));
        opened.push(document);
      } catch (_) {
        record.indexState = await library.readIndexState(record.documentId).catch(() => record.indexState);
      }
    }
    docs = [...retained.filter((document) => !recordIds.has(document.id)), ...opened];
    desktopRecords = records;
    renderIndexOverview(records, presentedConnections);
    onCatalogChange?.();
    refreshOcrControls();
    return { connections, documents: records, images, warningCount: warnings.length, warnings };
  }

  async function showPreview(index, original = false) {
    const result = results[index];
    if (!result) return;
    previewAbort?.abort();
    const controller = new AbortController();
    previewAbort = controller;
    activeResultIndex = index;
    preview.hidden = false;
    previewTitle.textContent = resultTitle(result);
    previewImage.removeAttribute("src");
    previewHighlights.replaceChildren();
    returnFocus = document.activeElement;
    try {
      const source = normalizedSource(result);
      const rendered = await withRuntimeLock(async () => {
        const document = await ensureDocumentOpen(source.documentId);
        const image = original
          ? await runtime.renderPage({ documentId: source.documentId, pageNumber: source.pageNumber, dpi: HIGH_RES_DPI, signal: controller.signal })
          : await runtime.renderCrop({ source, dpi: HIGH_RES_DPI, signal: controller.signal });
        return { document, image };
      });
      const openedDocument = rendered.document;
      const render = rendered.image;
      if (controller.signal.aborted || previewAbort !== controller) return;
      const imageUrl = await pngDataUrl(render.bytes);
      if (original) {
        const terms = queryInput.value.normalize("NFKC").toLocaleLowerCase().split(/\s+/u).filter(Boolean);
        const page = openedDocument.pages.find((candidate) => candidate.pageNumber === source.pageNumber);
        const rects = result.matchRects?.length ? result.matchRects : (page?.words ?? [])
          .filter((word) => terms.some((term) => word.text.normalize("NFKC").toLocaleLowerCase().includes(term)))
          .map((word) => word.rect);
        previewImage.addEventListener("load", () => {
          if (controller.signal.aborted || previewAbort !== controller) return;
          const stageBounds = previewImage.parentElement.getBoundingClientRect();
          const imageBounds = previewImage.getBoundingClientRect();
          previewHighlights.replaceChildren(...rects.map((rect) => {
            const highlight = document.createElement("span");
            Object.assign(highlight.style, {
              left: `${imageBounds.left - stageBounds.left + rect[0] * imageBounds.width}px`,
              top: `${imageBounds.top - stageBounds.top + rect[1] * imageBounds.height}px`,
              width: `${rect[2] * imageBounds.width}px`,
              height: `${rect[3] * imageBounds.height}px`,
            });
            return highlight;
          }));
        }, { once: true });
      }
      previewImage.src = imageUrl;
      host.querySelector("[data-pdflib-preview-close]").focus();
    } catch (error) {
      if (!controller.signal.aborted && previewAbort === controller) setStatus(`미리보기 실패: ${error instanceof Error ? error.message : error}`, true);
    }
  }

  function closePreview() {
    previewAbort?.abort();
    preview.hidden = true;
    if (returnFocus instanceof HTMLElement) returnFocus.focus();
  }

  async function insertResults(selected) {
    if (!selected.length) return;
    try {
      setStatus("300dpi PNG를 준비하는 중…");
      for (const result of selected) {
        const source = normalizedSource(result);
        const render = await withRuntimeLock(async () => {
          await ensureDocumentOpen(source.documentId);
          return runtime.renderCrop({ source, dpi: HIGH_RES_DPI });
        });
        await insertImage(state, await pngDataUrl(render.bytes), { preserveBytes: true, sourceMetadata: sourceMetadata(result) });
      }
      setStatus(`${selected.length}개 크롭을 캔버스에 넣었습니다.`);
      closePreview();
    } catch (error) {
      setStatus(`삽입 실패: ${error instanceof Error ? error.message : error}`, true);
    }
  }

  async function insertSelected() {
    await insertResults(selectedResults());
  }

  async function sendToAi(selected, startGeneration) {
    if (!selected.length || typeof openIndependentReferences !== "function") return;
    try {
      setStatus("AI 작업용 PNG를 준비하는 중…");
      const references = [];
      for (const result of selected) {
        const source = normalizedSource(result);
        const render = await withRuntimeLock(async () => {
          await ensureDocumentOpen(source.documentId);
          return runtime.renderCrop({ source, dpi: HIGH_RES_DPI });
        });
        references.push({
          dataUrl: await pngDataUrl(render.bytes),
          name: resultTitle(result),
          source: { ...source, title: resultTitle(result), documentTitle: result.documentTitle || result.sourceName || "원본 PDF" },
        });
      }
      await openIndependentReferences({ references, startGeneration });
      setStatus(`${references.length}개를 독립 AI 작업으로 보냈습니다.`);
    } catch (error) {
      setStatus(`AI 작업 준비 실패: ${error instanceof Error ? error.message : error}`, true);
    }
  }

  async function addSelectedReferences() {
    const selected = selectedResults();
    if (!selected.length || !referenceConsumer) return;
    const consumer = referenceConsumer;
    referenceAddButton.disabled = true;
    setStatus("AI 참고용 고해상도 PNG를 준비하는 중…");
    try {
      for (const result of selected) {
        const source = normalizedSource(result);
        const render = await withRuntimeLock(async () => {
          await ensureDocumentOpen(source.documentId);
          return runtime.renderCrop({ source, dpi: HIGH_RES_DPI });
        });
        consumer.onAdd?.({
          name: resultTitle(result),
          data: await pngDataUrl(render.bytes),
          sourceKind: "pdf-library",
          source: sourceMetadata(result),
        });
      }
      consumer.onStatus?.(`PDF 참고 이미지 ${selected.length}개가 추가되었습니다.`, "ok");
      referenceConsumer = null;
      referenceAddButton.hidden = true;
      consumer.onComplete?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      consumer.onStatus?.(message, "error");
      setStatus(`AI 참고 추가 실패: ${message}`, true);
    } finally {
      updateActions();
    }
  }

  function sourceMetadata(result) {
    const source = normalizedSource(result);
    return {
      documentId: source.documentId,
      documentTitle: result.documentTitle || result.sourceName || "원본 PDF",
      pageNumber: source.pageNumber,
      rect: source.rect,
    };
  }

  let draftCrop = null;
  let dragStart = null;
  function paintCropBox() {
    if (!draftCrop) return;
    const [x, y, w, h] = draftCrop;
    Object.assign(cropBox.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });
  }
  async function openCropEditor() {
    const result = activeResult();
    if (!result) return;
    const source = normalizedSource(result);
    draftCrop = source.rect;
    itemNumberInput.value = result.itemNumber || result.source?.itemNumber || "";
    itemLabelInput.value = result.itemLabel || result.title || "";
    host.querySelector("[data-pdflib-crop-guidance]").textContent = source.fullPageFallback
      ? "문항을 확정하지 못해 전체 페이지를 표시했습니다. 문항 번호와 이름을 확인하고 필요한 영역을 직접 맞추세요."
      : "사각형 안을 드래그해 옮기고 문항 정보를 확인하세요.";
    cropEditor.hidden = false;
    try {
      const render = await withRuntimeLock(async () => {
        await ensureDocumentOpen(source.documentId);
        return runtime.renderPage({ documentId: source.documentId, pageNumber: source.pageNumber, dpi: 144 });
      });
      cropImage.src = await pngDataUrl(render.bytes);
      paintCropBox();
    } catch (error) {
      cropEditor.hidden = true;
      setStatus(`원문을 열지 못했습니다: ${error instanceof Error ? error.message : error}`, true);
    }
  }
  function closeCropEditor() { cropEditor.hidden = true; draftCrop = null; dragStart = null; }
  function stagePoint(event) {
    const bounds = cropStage.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))];
  }

  fileInput.addEventListener("change", () => void openFiles([...fileInput.files]));
  ocrButton.addEventListener("click", () => void recognizeScans());
  ocrCancelButton.addEventListener("click", () => ocrController?.abort());
  connectedButton.addEventListener("click", () => void openConnectedFolder());
  queryInput.addEventListener("input", queueSearch);
  for (const filter of [yearFilter, administrationFilter, subjectFilter]) filter.addEventListener("change", () => void runSearch());
  host.querySelector("[data-pdflib-cache-clear]").addEventListener("click", async () => {
    clearGrid();
    await withRuntimeLock(() => runtime?.clearCache());
    await runSearch();
    setStatus("PDF 미리보기 캐시를 비웠습니다. 원본 자료는 그대로 유지됩니다.");
  });
  grid.addEventListener("click", (event) => {
    const card = event.target.closest(".pdflib-card");
    if (!card) return;
    const index = Number(card.dataset.resultIndex);
    const id = resultId(results[index], index);
    activeResultIndex = index;
    if (selectedIds.has(id)) selectedIds.delete(id);
    else if (selectedIds.size >= MAX_SELECTIONS) setStatus(`한 번에 ${MAX_SELECTIONS}개까지만 선택할 수 있습니다.`);
    else selectedIds.add(id);
    markSelection();
  });
  insertButton.addEventListener("click", () => void insertSelected());
  referenceAddButton.addEventListener("click", () => void addSelectedReferences());
  aiRunButton.addEventListener("click", () => void sendToAi(selectedResults(), true));
  host.querySelector("[data-pdflib-preview-close]").addEventListener("click", closePreview);
  host.querySelector("[data-pdflib-preview-insert]").addEventListener("click", () => {
    const result = activeResult();
    if (result) void insertResults([result]);
  });
  host.querySelector("[data-pdflib-preview-ai]").addEventListener("click", () => {
    const result = activeResult();
    if (result) void sendToAi([result], true);
  });
  host.querySelector("[data-pdflib-original]").addEventListener("click", () => void showPreview(activeResultIndex, true));
  host.querySelector("[data-pdflib-adjust]").addEventListener("click", () => void openCropEditor());
  host.querySelector("[data-pdflib-crop-close]").addEventListener("click", closeCropEditor);
  host.querySelector("[data-pdflib-crop-save]").addEventListener("click", async () => {
    const result = activeResult();
    if (!result || !draftCrop) return;
    result.source = { ...normalizedSource(result), rect: clampCropRect(draftCrop), fullPageFallback: false };
    cropOverrides.set(result, result.source.rect);
    const record = desktopRecords.find((item) => item.documentId === result.source.documentId);
    const itemNumber = Number(itemNumberInput.value);
    const label = itemLabelInput.value.trim();
    if (record && desktopAdapter?.saveCorrection && Number.isInteger(itemNumber) && itemNumber > 0 && label) {
      try {
        await desktopAdapter.saveCorrection({ documentId: record.documentId, version: record.version, pageNumber: result.source.pageNumber, itemNumber, label, rect: result.source.rect });
        result.itemNumber = itemNumber;
        result.itemLabel = label;
      } catch (error) {
        setStatus(`문항 보정 저장 실패: ${error instanceof Error ? error.message : error}`, true);
        return;
      }
    }
    closeCropEditor();
    void showPreview(activeResultIndex);
  });
  cropStage.addEventListener("pointerdown", (event) => {
    if (!draftCrop) return;
    cropStage.setPointerCapture(event.pointerId);
    dragStart = stagePoint(event);
  });
  cropStage.addEventListener("pointermove", (event) => {
    if (!dragStart || !draftCrop) return;
    const [nextX, nextY] = stagePoint(event);
    const [x, y, w, h] = draftCrop;
    draftCrop = clampCropRect([x + nextX - dragStart[0], y + nextY - dragStart[1], w, h]);
    dragStart = [nextX, nextY];
    paintCropBox();
  });
  cropStage.addEventListener("pointerup", () => { dragStart = null; });
  document.addEventListener("keydown", (event) => {
    if (host.closest("[hidden]")) return;
    if (shouldHandlePdfSpace(event) && !cropEditor.hidden) return;
    if (shouldHandlePdfSpace(event)) {
      if (preview.hidden && selectedIds.size === 0) return;
      event.preventDefault();
      if (preview.hidden) void showPreview(activeResultIndex);
      else closePreview();
      return;
    }
    if (event.key === "Escape" && !preview.hidden) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closePreview();
      return;
    }
    if (!preview.hidden && shouldHandlePdfArrow(event)) {
      event.preventDefault();
      const shift = event.key === "ArrowLeft" ? -1 : 1;
      const next = (activeResultIndex + shift + results.length) % results.length;
      void showPreview(next);
    }
  }, true);

  return {
    openFiles,
    async openDesktopDocuments(documents) {
      const activeRuntime = await ensureRuntime();
      const opened = [];
      for (const document of documents) opened.push(await activeRuntime.openDocument(document));
      docs = [...docs, ...opened];
      onCatalogChange?.();
      sourceStatus.textContent = `${docs.length}개 연결 자료를 읽고 있습니다.`;
      await runSearch();
    },
    async activate() { await ensureRuntime(); },
    deactivate() {
      previewAbort?.abort();
      closePreview();
      closeCropEditor();
      referenceConsumer = null;
      referenceAddButton.hidden = true;
      updateActions();
    },
    beginReferenceSelection(consumer) {
      referenceConsumer = consumer;
      referenceAddButton.hidden = false;
      setStatus("추가할 PDF 기출 자료를 선택하세요. 최대 10개까지 고를 수 있습니다.");
      updateActions();
      queryInput.focus();
    },
    getPackHost() { return packHost; },
    setSourceStatus(message, error = false) {
      sourceStatus.textContent = message;
      sourceStatus.classList.toggle("is-error", error);
    },
    async syncPackCatalog(catalog) {
      await replacePackCatalog(catalog);
    },
    getCatalog() {
      return { documents: [...docs], searchIndex: packSearchIndex };
    },
    async searchPdf({ query = "", documentIds = [], filters = {}, limit = 60 } = {}) {
      const allowedIds = new Set(documentIds);
      const searchedDocuments = allowedIds.size ? docs.filter((document) => allowedIds.has(document.id)) : docs;
      const indexedPackIds = [...packDocumentIds].filter((id) => !updatedPackDocumentIds.has(id) && (!allowedIds.size || allowedIds.has(id)));
      const prebuiltIndex = packSearchIndex ? {
        ...packSearchIndex,
        entries: packSearchIndex.entries.filter((entry) => indexedPackIds.includes(entry.documentId)),
      } : null;
      return searchDocuments(searchedDocuments, query, {
        filters,
        prebuiltIndexes: prebuiltIndex ? [{ documents: docs.filter((document) => indexedPackIds.includes(document.id)).map(({ id, pageCount }) => ({ id, pageCount })), index: prebuiltIndex }] : [],
        limit,
      });
    },
    async materializePdf({ result, source, options = {} }) {
      const owningDocument = docs.find((document) => document.id === source?.documentId);
      source = assertPdfMaterializationSource(result, source, owningDocument?.pageCount);
      const dpi = options.thumbnail ? THUMBNAIL_DPI : HIGH_RES_DPI;
      const overrideTarget = {
        ...result,
        source: { documentId: source.documentId, pageNumber: source.pageNumber, rect: source.rect },
        documentSourceHash: source.sha256,
      };
      const savedRect = cropOverrides.get(overrideTarget);
      const normalized = normalizedSource({
        ...result,
        source: {
          documentId: source.documentId,
          pageNumber: source.pageNumber,
          rect: options.original ? [0, 0, 1, 1] : (savedRect || source.rect),
          fullPageFallback: options.original || source.fullPageFallback,
        },
      });
      const rendered = await withRuntimeLock(async () => {
        await ensureDocumentOpen(normalized.documentId);
        return options.original
          ? runtime.renderPage({ documentId: normalized.documentId, pageNumber: normalized.pageNumber, dpi })
          : runtime.renderCrop({ source: normalized, dpi });
      });
      return { bytes: rendered.bytes, dataUrl: await pngDataUrl(rendered.bytes), source: normalized, result };
    },
    async clearPreviewCache() {
      clearGrid();
      await withRuntimeLock(() => runtime?.clearCache());
    },
    recognizeScans,
    syncDesktopConnections,
    cropForResult(result) {
      const source = result?.provenance || normalizedSource(result || {});
      return cropOverrides.get({ ...result, source, documentSourceHash: source.sha256 }) || clampCropRect(source.rect);
    },
    saveCropOverride(result, rect) {
      const source = result?.provenance || normalizedSource(result || {});
      const normalized = clampCropRect(rect);
      cropOverrides.set({ ...result, source, documentSourceHash: source.sha256 }, normalized);
      return normalized;
    },
  };
}

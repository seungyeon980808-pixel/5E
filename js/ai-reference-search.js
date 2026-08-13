import { idbGet, idbSet } from "./idb-store.js";
import { extractPdfPages, renderPdfPage } from "./pdf-document-index.mjs";
import { rankPdfPages } from "./pdf-search.mjs";
import { createPdfWorkspace } from "./ai-pdf-workspace.js?v=1.5.10-phase1-local-ui";
import { createReferenceAddControl, createReferenceDialog, createReferenceLoadStatus } from "./ai-reference-dialog.js?v=1.5.10-phase1-local-ui";
import { createReferenceGrid } from "./ai-reference-grid.js";
import { createLocalIndexSession } from "./ai-local-index-session.js?v=1.5.10-phase0-privacy";
import { createBrowserFolderConnector, createDesktopFolderConnector, createFolderConnectionSession, readWebImage,
  sourcesFromWebFiles } from "./local-reference-sources.mjs";
import { activateReferenceSource, handoffLocalReference, loadRemoteReferenceCatalog,
  REFERENCE_SOURCES as SOURCES, remoteReferenceToDataUrl } from "./ai-reference-source-policy.js";
import { installModalFocus } from "./modal-focus.js?v=1.5.10-phase1-local-ui";

const MAX_RESULTS = 60;
const MAX_SELECT = 10;
function textOf(item) {
  return [item.title, item.name, item.relativePath, item.subjectLabel, item.part, item.exam,
    ...(item.tags || []), ...(item.parts || []), ...(item.keywords || [])]
    .filter(Boolean).join(" ").toLocaleLowerCase("ko");
}
export function createAiReferenceSearch({ desktop, onAdd, onStatus, legacyLibraryUiEnabled = false } = {}) {
  let overlay;
  let source = SOURCES.LOCAL;
  let query = "";
  let parts = [];
  let exams = [];
  let locals = [];
  let pdfPages = [];
  let localFolder = "";
  let localNotices = [];
  let loaded = false;
  let indexing = false;
  let pdfWorkspace = null;
  let referenceGrid = null;
  let referenceLoadStatus = null;
  let referenceAddControl = null;
  let parentDialog = null;
  let releaseModalFocus = null;
  const selected = new Map();
  const objectUrls = new Set();
  const status = (text, kind = "ok") => onStatus?.(text, kind);
  const keyOf = (item, itemSource = source) => `${itemSource}:${item.id || item.path || item.file}`;
  const localIndexSession = createLocalIndexSession(
    cachedPages,
    (next) => {
      locals = next.images;
      pdfPages = next.pages;
      localFolder = next.folderLabel;
      localNotices = next.notices;
      indexing = next.indexing;
      render();
    },
    (pdf, error) => status(`${pdf.name}: ${error.message || error}`, "warn"),
  );
  async function ensureRemoteData() {
    if (!legacyLibraryUiEnabled || loaded) return;
    const catalog = await loadRemoteReferenceCatalog();
    parts = catalog.parts;
    exams = catalog.exams;
    loaded = true;
  }
  function currentItems() {
    const needle = query.trim().toLocaleLowerCase("ko");
    if (source === SOURCES.LOCAL) {
      const pdfResults = needle ? rankPdfPages(pdfPages, needle, MAX_RESULTS) : [];
      const images = (needle ? locals.filter((item) => textOf(item).includes(needle)) : locals)
        .slice(0, Math.max(0, MAX_RESULTS - pdfResults.length));
      return [...pdfResults.map((item) => ({ ...item, kind: "pdf-page" })), ...images];
    }
    const list = source === SOURCES.EXAM ? exams : parts;
    return (needle ? list.filter((item) => textOf(item).includes(needle)) : list).slice(0, MAX_RESULTS);
  }
  function close() {
    const releaseFocus = releaseModalFocus;
    releaseModalFocus = null;
    localIndexSession.cancel();
    indexing = false;
    pdfWorkspace?.dispose();
    pdfWorkspace = null;
    parentDialog?.removeAttribute("aria-hidden");
    parentDialog = null;
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.clear();
    overlay?.remove();
    overlay = null;
    releaseFocus?.();
  }
  async function cachedPages(pdf, onProgress) {
    const cacheKey = `pdf-index:v2:${pdf.id}:${pdf.size || 0}:${pdf.modifiedAt || 0}`;
    try {
      const cached = await idbGet(cacheKey);
      if (Array.isArray(cached?.pages) && Array.isArray(cached.progress)) {
        cached.progress.forEach(onProgress);
        return cached.pages.map((page) => ({ ...page, source: pdf }));
      }
    } catch {}
    const progress = [];
    const pages = await extractPdfPages(pdf, (event) => { progress.push(event); onProgress(event); });
    const stored = pages.map(({ source: ignored, ...page }) => page);
    try { await idbSet(cacheKey, { pages: stored, progress }); } catch {}
    return pages;
  }
  async function acceptAssets(assets, folderLabel) {
    pdfWorkspace?.clear();
    await localIndexSession.accept(assets, folderLabel);
  }
  function imageSource(item) {
    if (item.file) {
      if (!item.objectUrl) {
        item.objectUrl = URL.createObjectURL(item.file);
        objectUrls.add(item.objectUrl);
      }
      return Promise.resolve(item.objectUrl);
    }
    return desktop?.localImageThumbnail?.(item.path);
  }
  async function fullLocalImage(item) {
    if (item.kind === "pdf-page") return renderPdfPage(item.source, item.pageNumber, 1800);
    if (item.file) return readWebImage(item);
    return desktop?.readLocalImage?.(item.path) || imageSource(item);
  }
  function render() {
    if (!overlay) return;
    const folderBar = overlay.querySelector("[data-ai-local-folder]");
    const folderLabel = folderBar.querySelector("span");
    folderBar.hidden = source !== SOURCES.LOCAL;
    folderLabel.textContent = localNotices.length
      ? localNotices.join(" · ").replaceAll("검색 가능한 텍스트 없음", "검색 가능한 텍스트 없음")
      : localFolder || "연결된 내 PDF·이미지 폴더가 없습니다.";
    folderLabel.style.whiteSpace = localNotices.length ? "normal" : "";
    folderLabel.style.wordBreak = localNotices.length ? "keep-all" : "";
    folderLabel.style.overflowWrap = localNotices.length ? "anywhere" : "";
    folderLabel.style.textOverflow = localNotices.length ? "clip" : "";
    overlay.querySelectorAll("[data-ai-search-source]").forEach((button) => {
      const active = button.dataset.aiSearchSource === source;
      button.classList.toggle("is-on", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const items = currentItems();
    const localWorkspace = source === SOURCES.LOCAL;
    const searchAdd = overlay.querySelector("[data-ai-search-add]");
    searchAdd.hidden = localWorkspace;
    referenceAddControl?.selection(localWorkspace ? 0 : selected.size);
    overlay.querySelector("[data-ai-search-footnote]").textContent = localWorkspace
      ? "검색 결과를 선택한 뒤 왼쪽 PDF 페이지에서 선택 영역을 지정하세요."
      : "선택한 이미지만 AI 참고 이미지로 추가됩니다.";
    const summary = overlay.querySelector("[data-ai-search-summary]");
    summary.textContent = indexing ? "PDF 원문을 분석하고 있습니다…"
      : source === SOURCES.LOCAL && !query.trim()
        ? `이미지 ${locals.length}개 · PDF 검색 가능 페이지 ${pdfPages.length}쪽 · 검색어를 입력하세요`
        : source === SOURCES.LOCAL
          ? `검색 결과 ${items.length}개 · 결과를 선택해 원문 확인`
          : `${query.trim() ? `검색 결과 ${items.length}개` : `전체 ${source === SOURCES.EXAM ? exams.length : parts.length}개`} · 최대 ${MAX_SELECT}개 선택`;
    pdfWorkspace?.render({ visible: localWorkspace, results: items, searchQuery: query,
      hasFolder: Boolean(localFolder), indexing });
    referenceGrid?.render(items, source, selected, !localWorkspace);
  }
  async function addSelected() {
    const records = Array.from(selected.values());
    if (!records.length) return referenceAddControl?.warning("추가할 이미지를 선택하세요.");
    const button = overlay.querySelector("[data-ai-search-add]");
    referenceAddControl?.loading();
    button.textContent = "불러오는 중…";
    try {
      for (const record of records) {
        const { item } = record;
        const data = item.kind === "pdf-page" ? await renderPdfPage(item.source, item.pageNumber, 1600)
          : record.source === SOURCES.LOCAL ? (item.file ? await readWebImage(item) : await desktop.readLocalImage(item.path))
            : await remoteReferenceToDataUrl(record.source, item);
        onAdd?.({ name: item.kind === "pdf-page" ? `${item.name} ${item.pageNumber}쪽` : item.title || item.name || item.file,
          data, sourceKind: item.kind === "pdf-page" ? "local-pdf" : record.source });
      }
      status(`참고 이미지 ${records.length}개를 추가했습니다.`, "ok");
      close();
    } catch (error) {
      referenceLoadStatus?.error(error);
      referenceAddControl?.error();
      button.textContent = "참고 자료로 추가";
    }
  }
  async function pickLocal() {
    const result = await folderConnection.reconnect();
    if (result.status === "unsupported") overlay.querySelector("[data-ai-web-folder]").click();
    else if (result.status === "denied") {
      const message = "폴더 읽기 권한이 거부되었습니다. 폴더를 다시 연결하세요.";
      status(message, "warn");
      referenceLoadStatus?.error(new Error(message));
    }
  }
  const folderConnector = desktop?.pickLocalImageFolder
    ? createDesktopFolderConnector(desktop) : createBrowserFolderConnector(globalThis);
  const folderConnection = createFolderConnectionSession(folderConnector, acceptAssets);
  async function open() {
    const returnFocus = document.activeElement;
    close(); selected.clear(); query = "";
    if (!legacyLibraryUiEnabled) source = SOURCES.LOCAL;
    overlay = createReferenceDialog({ legacyLibraryUiEnabled });
    referenceLoadStatus = createReferenceLoadStatus(overlay);
    referenceAddControl = createReferenceAddControl(overlay);
    parentDialog = document.querySelector("#ai-image-panel [aria-modal=true]");
    parentDialog?.setAttribute("aria-hidden", "true");
    pdfWorkspace = createPdfWorkspace({
      root: overlay,
      loadPreview: fullLocalImage,
      onSelect: render,
      onAddWhole: ({ name, data, item }) => {
        handoffLocalReference({ name, data, sourceKind: item.kind === "pdf-page" ? "local-pdf" : "local" },
          "confirmed", onAdd);
        status("PDF 페이지를 AI 참고 이미지로 추가했습니다.", "ok"); close();
      },
      onAddCrop: ({ name, data }) => {
        handoffLocalReference({ name, data, sourceKind: "local-pdf-crop" }, "confirmed", onAdd);
        status("선택 영역을 시험문제용 도판 변환 대상으로 추가했습니다.", "ok"); close();
      },
    });
    referenceGrid = createReferenceGrid({ root: overlay, imageSource, onChange: render, onStatus: status });
    overlay.querySelector("[data-ai-search-close]").onclick = close;
    overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(); });
    overlay.querySelectorAll("[data-ai-search-source]").forEach((button) => {
      button.onclick = () => {
        const nextSource = button.dataset.aiSearchSource;
        const activation = activateReferenceSource(nextSource, {
          currentSource: source,
          selection: selected,
          onSourceActivate: () => { source = nextSource; render(); },
          loadRemote: ensureRemoteData,
          onRemoteLoad: () => { referenceLoadStatus.loading(); referenceAddControl?.loading(); },
        });
        void activation
          .then(() => { if (source === nextSource) {
            render(); referenceLoadStatus.ready(); referenceAddControl?.ready();
          } })
          .catch((error) => {
            if (source !== nextSource) return;
            referenceLoadStatus.error(error);
            referenceAddControl?.error();
          });
      };
    });
    const input = overlay.querySelector("input[type=search]");
    input.oninput = () => { query = input.value; render(); };
    overlay.querySelector("[data-ai-local-pick]").onclick = () => void pickLocal().catch((error) => {
      status(error.message || String(error), "error");
      referenceLoadStatus?.error(error);
    });
    overlay.querySelector("[data-ai-web-folder]").onchange = async (event) => {
      const files = event.target.files;
      await acceptAssets(sourcesFromWebFiles(files), files[0]?.webkitRelativePath?.split("/")[0] || "선택한 파일");
    };
    overlay.querySelector("[data-ai-search-add]").onclick = () => void addSelected();
    render();
    // Modal focus handles event.key === "Escape" and restores the opening control.
    releaseModalFocus = installModalFocus({ root: overlay, initialFocus: input, returnFocus, onRequestClose: close });
  }

  return { open, close };
}

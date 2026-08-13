import { idbGet, idbSet } from "./idb-store.js";
import { extractPdfPages, renderPdfPage } from "./pdf-document-index.mjs";
import { rankPdfPages } from "./pdf-search.mjs";
import { createPdfWorkspace } from "./ai-pdf-workspace.js";
import { createReferenceDialog } from "./ai-reference-dialog.js";
import { createReferenceGrid } from "./ai-reference-grid.js";
import { readWebImage, sourcesFromDesktopResult, sourcesFromWebFiles } from "./local-reference-sources.mjs";
import {
  activateReferenceSource,
  handoffLocalReference,
  loadRemoteReferenceCatalog,
  REFERENCE_SOURCES as SOURCES,
  remoteReferenceToDataUrl,
} from "./ai-reference-source-policy.js";

const MAX_RESULTS = 60;
const MAX_SELECT = 10;

function textOf(item) {
  return [item.title, item.name, item.relativePath, item.subjectLabel, item.part, item.exam,
    ...(item.tags || []), ...(item.parts || []), ...(item.keywords || [])]
    .filter(Boolean).join(" ").toLocaleLowerCase("ko");
}

export function createAiReferenceSearch({ desktop, onAdd, onStatus } = {}) {
  let overlay;
  let source = SOURCES.LOCAL;
  let query = "";
  let parts = [];
  let exams = [];
  let locals = [];
  let pdfPages = [];
  let localFolder = "";
  let loaded = false;
  let indexing = false;
  let pdfWorkspace = null;
  let referenceGrid = null;
  let parentDialog = null;
  const selected = new Map();
  const objectUrls = new Set();
  const status = (text, kind = "ok") => onStatus?.(text, kind);
  const keyOf = (item, itemSource = source) => `${itemSource}:${item.id || item.path || item.file}`;

  async function ensureRemoteData() {
    if (loaded) return;
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
    parentDialog?.removeAttribute("aria-hidden");
    parentDialog = null;
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls.clear();
    overlay?.remove();
    overlay = null;
  }

  async function cachedPages(pdf, onProgress) {
    const cacheKey = `pdf-index:${pdf.id}:${pdf.size || 0}:${pdf.modifiedAt || 0}`;
    try {
      const cached = await idbGet(cacheKey);
      if (Array.isArray(cached)) return cached.map((page) => ({ ...page, source: pdf }));
    } catch {}
    const pages = await extractPdfPages(pdf, onProgress);
    const stored = pages.map(({ source: ignored, ...page }) => page);
    try { await idbSet(cacheKey, stored); } catch {}
    return pages;
  }

  async function indexPdfs(pdfs) {
    indexing = true;
    pdfPages = [];
    render();
    for (let index = 0; index < pdfs.length; index += 1) {
      const pdf = pdfs[index];
      localFolder = `${pdf.relativePath} 분석 중 (${index + 1}/${pdfs.length})`;
      render();
      let lastRenderedPage = 0;
      try {
        pdfPages.push(...await cachedPages(pdf, ({ pageNumber, pageCount }) => {
          if (pageNumber !== pageCount && pageNumber - lastRenderedPage < 5) return;
          lastRenderedPage = pageNumber;
          localFolder = `${pdf.relativePath} · ${pageNumber}/${pageCount}쪽 분석 중 (${index + 1}/${pdfs.length})`;
          render();
        }));
      }
      catch (error) { status(`${pdf.name}: ${error.message || error}`, "warn"); }
    }
    indexing = false;
    render();
  }

  async function acceptAssets(assets, folderLabel) {
    locals = assets.images;
    localFolder = folderLabel;
    pdfWorkspace?.clear();
    await indexPdfs(assets.pdfs);
    localFolder = `${folderLabel} · PDF ${assets.pdfs.length}개 / 검색 가능 페이지 ${pdfPages.length}쪽`;
    render();
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
    folderBar.hidden = source !== SOURCES.LOCAL;
    folderBar.querySelector("span").textContent = localFolder || "연결된 로컬 이미지·PDF 폴더가 없습니다.";
    overlay.querySelectorAll("[data-ai-search-source]").forEach((button) => {
      const active = button.dataset.aiSearchSource === source;
      button.classList.toggle("is-on", active);
      button.setAttribute("aria-pressed", String(active));
    });
    const items = currentItems();
    const localWorkspace = source === SOURCES.LOCAL;
    const searchAdd = overlay.querySelector("[data-ai-search-add]");
    searchAdd.hidden = localWorkspace;
    overlay.querySelector("[data-ai-search-footnote]").textContent = localWorkspace
      ? "검색 결과를 선택한 뒤 왼쪽 교과서 페이지에서 시험에 쓸 영역을 크롭하세요."
      : "선택한 이미지만 AI 참고 이미지로 추가됩니다.";
    const summary = overlay.querySelector("[data-ai-search-summary]");
    summary.textContent = indexing ? "PDF 텍스트를 분석하고 있습니다…"
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
    if (!records.length) return status("추가할 이미지를 선택하세요.", "warn");
    const button = overlay.querySelector("[data-ai-search-add]");
    button.disabled = true;
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
      status(error.message || String(error), "error");
      button.disabled = false;
      button.textContent = "AI 참고로 추가";
    }
  }

  async function pickLocal() {
    if (desktop?.pickLocalImageFolder) {
      const picked = await desktop.pickLocalImageFolder();
      if (!picked?.folder) return;
      const result = await desktop.listLocalImages(picked.folder);
      await acceptAssets(sourcesFromDesktopResult(result, desktop), result.folder);
    } else overlay.querySelector("[data-ai-web-folder]").click();
  }

  async function open() {
    close(); selected.clear(); query = "";
    overlay = createReferenceDialog();
    parentDialog = document.querySelector("#ai-image-panel [aria-modal=true]");
    parentDialog?.setAttribute("aria-hidden", "true");
    pdfWorkspace = createPdfWorkspace({
      root: overlay,
      loadPreview: fullLocalImage,
      onSelect: render,
      onAddWhole: ({ name, data, item }) => {
        handoffLocalReference({ name, data, sourceKind: item.kind === "pdf-page" ? "local-pdf" : "local" },
          "confirmed", onAdd);
        status("전체 페이지를 AI 참고 이미지로 추가했습니다.", "ok"); close();
      },
      onAddCrop: ({ name, data }) => {
        handoffLocalReference({ name, data, sourceKind: "local-pdf-crop" }, "confirmed", onAdd);
        status("선택한 교과서 영역을 AI 참고 이미지로 추가했습니다.", "ok"); close();
      },
    });
    referenceGrid = createReferenceGrid({ root: overlay, imageSource, onChange: render, onStatus: status });
    overlay.querySelector("[data-ai-search-close]").onclick = close;
    overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(); });
    overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
    overlay.querySelectorAll("[data-ai-search-source]").forEach((button) => {
      button.onclick = () => void activateReferenceSource(button.dataset.aiSearchSource, {
        loadRemote: ensureRemoteData,
        onRemoteLoad: () => status("이미지 검색 목록을 불러오는 중…", "busy"),
      })
        .then((nextSource) => { source = nextSource; render(); })
        .catch((error) => status(error.message || String(error), "error"));
    });
    const input = overlay.querySelector("input[type=search]");
    input.oninput = () => { query = input.value; render(); };
    overlay.querySelector("[data-ai-local-pick]").onclick = () => void pickLocal().catch((error) => status(error.message || String(error), "error"));
    overlay.querySelector("[data-ai-web-folder]").onchange = async (event) => {
      const files = event.target.files;
      await acceptAssets(sourcesFromWebFiles(files), files[0]?.webkitRelativePath?.split("/")[0] || "선택한 파일");
    };
    overlay.querySelector("[data-ai-search-add]").onclick = () => void addSelected();
    render(); input.focus();
  }

  return { open, close };
}

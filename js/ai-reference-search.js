import { idbGet, idbSet } from "./idb-store.js";
import { extractPdfPages, renderPdfPage } from "./pdf-document-index.mjs";
import { rankPdfPages } from "./pdf-search.mjs";
import { readWebImage, sourcesFromDesktopResult, sourcesFromWebFiles } from "./local-reference-sources.mjs";

const SOURCES = Object.freeze({ PARTS: "parts", EXAM: "exam", LOCAL: "local" });
const MAX_RESULTS = 60;
const MAX_SELECT = 10;

function textOf(item) {
  return [item.title, item.name, item.relativePath, item.subjectLabel, item.part, item.exam,
    ...(item.tags || []), ...(item.parts || []), ...(item.keywords || [])]
    .filter(Boolean).join(" ").toLocaleLowerCase("ko");
}

function remoteUrl(source, item) {
  const base = source === SOURCES.EXAM ? "assets/exam-library/images/" : "assets/parts-library/svg/";
  return `${base}${encodeURIComponent(item.file)}`;
}

async function urlToDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`이미지를 불러오지 못했습니다. (HTTP ${response.status})`);
  const blob = await response.blob();
  return readWebImage({ file: blob });
}

export function createAiReferenceSearch({ desktop, onAdd, onStatus } = {}) {
  let overlay;
  let source = SOURCES.PARTS;
  let query = "";
  let parts = [];
  let exams = [];
  let locals = [];
  let pdfPages = [];
  let localFolder = "";
  let loaded = false;
  let indexing = false;
  let previewItem = null;
  let parentDialog = null;
  const selected = new Map();
  const objectUrls = new Set();
  const status = (text, kind = "ok") => onStatus?.(text, kind);
  const keyOf = (item, itemSource = source) => `${itemSource}:${item.id || item.path || item.file}`;

  async function ensureRemoteData() {
    if (loaded) return;
    const responses = await Promise.all([
      fetch("assets/parts-library/manifest.json", { cache: "no-store" }),
      fetch("assets/exam-library/manifest.json", { cache: "no-store" }),
    ]);
    if (responses.some((response) => !response.ok)) throw new Error("이미지 검색 목록을 불러오지 못했습니다.");
    const manifests = await Promise.all(responses.map((response) => response.json()));
    parts = Array.isArray(manifests[0].items) ? manifests[0].items : [];
    exams = Array.isArray(manifests[1].items) ? manifests[1].items : [];
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

  async function cachedPages(pdf) {
    const cacheKey = `pdf-index:${pdf.id}:${pdf.size || 0}:${pdf.modifiedAt || 0}`;
    try {
      const cached = await idbGet(cacheKey);
      if (Array.isArray(cached)) return cached.map((page) => ({ ...page, source: pdf }));
    } catch {}
    const pages = await extractPdfPages(pdf);
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
      try { pdfPages.push(...await cachedPages(pdf)); }
      catch (error) { status(`${pdf.name}: ${error.message || error}`, "warn"); }
    }
    indexing = false;
    render();
  }

  async function acceptAssets(assets, folderLabel) {
    locals = assets.images;
    localFolder = folderLabel;
    previewItem = null;
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

  function renderPreview() {
    const panel = overlay?.querySelector("[data-ai-pdf-preview]");
    if (!panel) return;
    panel.hidden = !previewItem;
    if (!previewItem) return;
    panel.querySelector("strong").textContent = `${previewItem.name} · ${previewItem.pageNumber}쪽`;
    panel.querySelector("p").textContent = previewItem.snippet || previewItem.text;
    const image = panel.querySelector("img");
    image.removeAttribute("src");
    void renderPdfPage(previewItem.source, previewItem.pageNumber, 900)
      .then((data) => { if (image.isConnected && previewItem) image.src = data; })
      .catch(() => {});
  }

  function renderCard(item, grid) {
    const itemSource = source;
    const key = keyOf(item, itemSource);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "ai-reference-search-card";
    card.classList.toggle("is-on", selected.has(key));
    card.setAttribute("aria-pressed", String(selected.has(key)));
    const image = document.createElement("img");
    image.alt = "";
    image.loading = "lazy";
    if (item.kind === "pdf-page") {
      void renderPdfPage(item.source, item.pageNumber, 360)
        .then((data) => { if (image.isConnected) image.src = data; }).catch(() => {});
    } else if (itemSource === SOURCES.LOCAL) {
      void imageSource(item).then((data) => { if (image.isConnected) image.src = data; }).catch(() => {});
    } else image.src = remoteUrl(itemSource, item);
    const title = document.createElement("strong");
    title.textContent = item.kind === "pdf-page" ? `${item.name} · ${item.pageNumber}쪽` : item.title || item.name || item.file;
    const meta = document.createElement("span");
    meta.textContent = item.kind === "pdf-page" ? `유사도 ${item.matchPercent}% · ${item.relativePath}`
      : itemSource === SOURCES.LOCAL ? item.relativePath
        : [item.subjectLabel, item.part || item.exam, item.year].filter(Boolean).join(" · ");
    card.append(image, title, meta);
    if (item.snippet) {
      const snippet = document.createElement("small");
      snippet.textContent = item.snippet;
      card.append(snippet);
    }
    card.onclick = () => {
      if (item.kind === "pdf-page") previewItem = item;
      if (selected.has(key)) selected.delete(key);
      else if (selected.size < MAX_SELECT) selected.set(key, { source: itemSource, item });
      else status(`참고 이미지는 한 번에 최대 ${MAX_SELECT}개까지 선택할 수 있습니다.`, "warn");
      render();
    };
    grid.appendChild(card);
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
    const summary = overlay.querySelector("[data-ai-search-summary]");
    summary.textContent = indexing ? "PDF 텍스트를 분석하고 있습니다…"
      : `${query.trim() ? `검색 결과 ${items.length}개` : `전체 ${source === SOURCES.LOCAL ? locals.length : source === SOURCES.EXAM ? exams.length : parts.length}개`} · 최대 ${MAX_SELECT}개 선택`;
    const grid = overlay.querySelector("[data-ai-search-grid]");
    grid.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "ai-reference-search-empty";
      empty.textContent = source === SOURCES.LOCAL && !localFolder
        ? "폴더 연결을 눌러 이미지와 PDF가 있는 폴더를 선택하세요."
        : indexing ? "PDF를 분석하고 있습니다." : "검색 결과가 없습니다.";
      grid.appendChild(empty);
    } else items.forEach((item) => renderCard(item, grid));
    renderPreview();
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
            : await urlToDataUrl(remoteUrl(record.source, item));
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
    close(); selected.clear(); query = ""; previewItem = null;
    overlay = document.createElement("div");
    overlay.className = "ai-compare-overlay ai-reference-search-overlay";
    overlay.innerHTML = `<section class="ai-reference-search-dialog" role="dialog" aria-modal="true" aria-label="이미지와 PDF 검색">
      <header><strong>이미지·PDF 검색</strong><button type="button" data-ai-search-close aria-label="닫기">×</button></header>
      <nav aria-label="검색 위치"><button type="button" data-ai-search-source="parts">일러스트 이미지</button><button type="button" data-ai-search-source="exam">기출문제</button><button type="button" data-ai-search-source="local">로컬 폴더</button></nav>
      <div class="ai-reference-search-query"><span aria-hidden="true">⌕</span><input type="search" placeholder="이미지 또는 PDF 본문 검색어" aria-label="이미지 또는 PDF 본문 검색어"></div>
      <div class="ai-local-folder" data-ai-local-folder hidden><span></span><button type="button" data-ai-local-pick>폴더 연결</button><input data-ai-web-folder type="file" accept="image/*,.pdf" webkitdirectory multiple hidden></div>
      <div class="ai-reference-search-summary" data-ai-search-summary></div>
      <div class="ai-reference-search-body"><div class="ai-reference-search-grid" data-ai-search-grid></div><aside class="ai-pdf-preview" data-ai-pdf-preview hidden><strong></strong><img alt="선택한 PDF 페이지 미리보기"><p></p></aside></div>
      <footer><span>PDF 본문은 기기 안에서 분석되며, 선택한 페이지만 참고 이미지로 추가됩니다.</span><button type="button" data-ai-search-add>AI 참고로 추가</button></footer>
    </section>`;
    document.body.appendChild(overlay);
    parentDialog = document.querySelector("#ai-image-panel [aria-modal=true]");
    parentDialog?.setAttribute("aria-hidden", "true");
    overlay.querySelector("[data-ai-search-close]").onclick = close;
    overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(); });
    overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
    overlay.querySelectorAll("[data-ai-search-source]").forEach((button) => {
      button.onclick = () => { source = button.dataset.aiSearchSource; render(); };
    });
    const input = overlay.querySelector("input[type=search]");
    input.oninput = () => { query = input.value; render(); };
    overlay.querySelector("[data-ai-local-pick]").onclick = () => void pickLocal().catch((error) => status(error.message || String(error), "error"));
    overlay.querySelector("[data-ai-web-folder]").onchange = async (event) => {
      const files = event.target.files;
      await acceptAssets(sourcesFromWebFiles(files), files[0]?.webkitRelativePath?.split("/")[0] || "선택한 파일");
    };
    overlay.querySelector("[data-ai-search-add]").onclick = () => void addSelected();
    try { await ensureRemoteData(); } catch (error) { status(error.message || String(error), "error"); }
    render(); input.focus();
  }

  return { open, close };
}

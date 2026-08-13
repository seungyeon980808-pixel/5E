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
  let previewData = "";
  let renderedPreviewKey = "";
  let cropMode = false;
  let cropBox = null;
  let cropDragStart = null;
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

  function previewKey(item) {
    return item ? keyOf(item, SOURCES.LOCAL) : "";
  }

  function clearCrop() {
    cropMode = false;
    cropBox = null;
    cropDragStart = null;
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
    previewItem = null;
    previewData = "";
    renderedPreviewKey = "";
    clearCrop();
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

  function renderCropBox() {
    const wrap = overlay?.querySelector("[data-ai-pdf-page-wrap]");
    if (!wrap) return;
    const image = wrap.querySelector("img");
    const masks = wrap.querySelectorAll(".ai-pdf-crop-mask");
    const selection = wrap.querySelector(".ai-pdf-crop-selection");
    const width = image.clientWidth;
    const height = image.clientHeight;
    if (!cropBox || !width || !height) {
      masks.forEach((mask, index) => Object.assign(mask.style, index ? { width: "0px", height: "0px" }
        : { left: "0px", top: "0px", width: `${width}px`, height: `${height}px` }));
      selection.style.display = "none";
      return;
    }
    const x = cropBox.x * width, y = cropBox.y * height;
    const w = cropBox.w * width, h = cropBox.h * height;
    Object.assign(masks[0].style, { left: "0px", top: "0px", width: `${width}px`, height: `${y}px` });
    Object.assign(masks[1].style, { left: "0px", top: `${y}px`, width: `${x}px`, height: `${h}px` });
    Object.assign(masks[2].style, { left: `${x + w}px`, top: `${y}px`, width: `${Math.max(0, width - x - w)}px`, height: `${h}px` });
    Object.assign(masks[3].style, { left: "0px", top: `${y + h}px`, width: `${width}px`, height: `${Math.max(0, height - y - h)}px` });
    Object.assign(selection.style, { display: "block", left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  }

  function renderPreview() {
    const workspace = overlay?.querySelector("[data-ai-pdf-workspace]");
    if (!workspace) return;
    const empty = workspace.querySelector("[data-ai-pdf-page-empty]");
    const wrap = workspace.querySelector("[data-ai-pdf-page-wrap]");
    const image = wrap.querySelector("img");
    const title = workspace.querySelector("[data-ai-pdf-page-title]");
    const cropButton = workspace.querySelector("[data-ai-pdf-crop-toggle]");
    const wholeButton = workspace.querySelector("[data-ai-pdf-add-whole]");
    const applyButton = workspace.querySelector("[data-ai-pdf-add-crop]");
    wrap.classList.toggle("is-cropping", cropMode);
    cropButton.classList.toggle("is-on", cropMode);
    cropButton.setAttribute("aria-pressed", String(cropMode));
    cropButton.disabled = !previewItem || !previewData;
    wholeButton.disabled = !previewItem || !previewData;
    applyButton.hidden = !cropMode;
    applyButton.disabled = !cropBox || !previewData;
    empty.hidden = !!previewItem;
    wrap.hidden = !previewItem;
    title.textContent = previewItem
      ? previewItem.kind === "pdf-page" ? `${previewItem.name} · ${previewItem.pageNumber}쪽` : previewItem.name
      : "검색 결과를 선택하세요";
    if (!previewItem) {
      image.removeAttribute("src");
      return;
    }
    const key = previewKey(previewItem);
    if (renderedPreviewKey === key && previewData) {
      if (image.src !== previewData) image.src = previewData;
      requestAnimationFrame(renderCropBox);
      return;
    }
    renderedPreviewKey = key;
    previewData = "";
    image.removeAttribute("src");
    empty.hidden = false;
    empty.textContent = "선택한 페이지를 크게 불러오는 중…";
    const requested = previewItem;
    void fullLocalImage(requested).then((data) => {
      if (!image.isConnected || previewItem !== requested || renderedPreviewKey !== key) return;
      previewData = data;
      image.src = data;
      empty.hidden = true;
      image.addEventListener("load", () => { renderPreview(); renderCropBox(); }, { once: true });
      renderPreview();
    }).catch((error) => {
      if (!empty.isConnected || previewItem !== requested) return;
      empty.hidden = false;
      empty.textContent = `페이지를 표시하지 못했습니다: ${error.message || error}`;
    });
  }

  function appendHighlightedText(element, value) {
    const text = String(value || "");
    const needle = query.trim();
    if (!needle) return element.append(text);
    const lower = text.toLocaleLowerCase("ko");
    const lowerNeedle = needle.toLocaleLowerCase("ko");
    let cursor = 0;
    while (cursor < text.length) {
      const index = lower.indexOf(lowerNeedle, cursor);
      if (index < 0) { element.append(text.slice(cursor)); break; }
      element.append(text.slice(cursor, index));
      const mark = document.createElement("mark");
      mark.textContent = text.slice(index, index + needle.length);
      element.append(mark);
      cursor = index + needle.length;
    }
  }

  function renderPdfResult(item, list) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ai-pdf-text-result";
    const active = previewKey(item) === previewKey(previewItem);
    button.classList.toggle("is-on", active);
    button.setAttribute("aria-pressed", String(active));
    const head = document.createElement("span");
    head.className = "ai-pdf-text-result-head";
    const score = document.createElement("b");
    score.textContent = item.kind === "pdf-page" ? `${item.matchPercent}%` : "이미지";
    const page = document.createElement("strong");
    page.textContent = item.kind === "pdf-page" ? `${item.pageNumber}쪽` : item.name;
    head.append(score, page);
    const snippet = document.createElement("small");
    appendHighlightedText(snippet, item.snippet || item.relativePath || item.name);
    button.append(head, snippet);
    button.onclick = () => {
      previewItem = item;
      previewData = "";
      renderedPreviewKey = "";
      clearCrop();
      render();
    };
    list.appendChild(button);
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
    title.textContent = item.kind === "pdf-page" ? `${item.pageNumber}쪽 · ${item.name}` : item.title || item.name || item.file;
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
    const grid = overlay.querySelector("[data-ai-search-grid]");
    const workspace = overlay.querySelector("[data-ai-pdf-workspace]");
    const resultList = overlay.querySelector("[data-ai-pdf-result-list]");
    grid.hidden = localWorkspace;
    workspace.hidden = !localWorkspace;
    grid.replaceChildren();
    resultList.replaceChildren();
    if (localWorkspace) {
      const resultTitle = workspace.querySelector("[data-ai-pdf-result-title]");
      resultTitle.textContent = query.trim() ? `검색 결과 ${items.length}개` : "PDF 본문 검색 결과";
      if (items.length) items.forEach((item) => renderPdfResult(item, resultList));
      else {
        const emptyResult = document.createElement("p");
        emptyResult.className = "ai-pdf-result-empty";
        emptyResult.textContent = !localFolder
          ? "이미지·PDF 폴더 선택을 눌러 교과서 폴더를 연결하세요. Windows 폴더 선택창에서는 파일이 표시되지 않습니다."
          : indexing ? "PDF 본문을 분석하고 있습니다."
            : query.trim() ? "일치하는 본문이 없습니다." : "검색어를 입력하면 관련 페이지가 여기에 표시됩니다.";
        resultList.appendChild(emptyResult);
      }
    } else if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "ai-reference-search-empty";
      empty.textContent = "검색 결과가 없습니다.";
      grid.appendChild(empty);
    } else items.forEach((item) => renderCard(item, grid));
    renderPreview();
  }

  function referenceName(suffix = "") {
    if (!previewItem) return "PDF 참고 이미지";
    const base = previewItem.kind === "pdf-page"
      ? `${previewItem.name} ${previewItem.pageNumber}쪽`
      : previewItem.name;
    return suffix ? `${base} · ${suffix}` : base;
  }

  function addWholePreview() {
    if (!previewItem || !previewData) return;
    onAdd?.({ name: referenceName("전체 페이지"), data: previewData,
      sourceKind: previewItem.kind === "pdf-page" ? "local-pdf" : "local" });
    status("전체 페이지를 AI 참고 이미지로 추가했습니다.", "ok");
    close();
  }

  function addCroppedPreview() {
    const image = overlay?.querySelector("[data-ai-pdf-page-wrap] img");
    if (!image || !cropBox || !previewData || !image.naturalWidth || !image.naturalHeight) return;
    const sx = Math.round(cropBox.x * image.naturalWidth);
    const sy = Math.round(cropBox.y * image.naturalHeight);
    const sw = Math.max(1, Math.round(cropBox.w * image.naturalWidth));
    const sh = Math.max(1, Math.round(cropBox.h * image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    canvas.getContext("2d")?.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    onAdd?.({ name: referenceName("선택 영역"), data: canvas.toDataURL("image/png"), sourceKind: "local-pdf-crop" });
    status("선택한 교과서 영역을 AI 참고 이미지로 추가했습니다.", "ok");
    close();
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
      <div class="ai-local-folder" data-ai-local-folder hidden><span></span><button type="button" data-ai-local-pick>이미지·PDF 폴더 선택</button><input data-ai-web-folder type="file" accept="image/*,.pdf" webkitdirectory multiple hidden></div>
      <div class="ai-reference-search-summary" data-ai-search-summary></div>
      <div class="ai-reference-search-body">
        <div class="ai-reference-search-grid" data-ai-search-grid></div>
        <section class="ai-pdf-workspace" data-ai-pdf-workspace hidden>
          <div class="ai-pdf-page-viewer">
            <header><strong data-ai-pdf-page-title>검색 결과를 선택하세요</strong><div>
              <button type="button" data-ai-pdf-crop-toggle aria-pressed="false" disabled>영역 크롭</button>
              <button type="button" data-ai-pdf-add-whole disabled>전체 페이지 추가</button>
              <button type="button" data-ai-pdf-add-crop hidden disabled>선택 영역을 AI로 편집</button>
            </div></header>
            <div class="ai-pdf-page-stage">
              <p data-ai-pdf-page-empty>오른쪽 검색 결과를 선택하면 교과서 페이지를 크게 볼 수 있습니다.</p>
              <div class="ai-pdf-page-wrap" data-ai-pdf-page-wrap hidden><img alt="선택한 교과서 PDF 페이지" draggable="false"><i class="ai-pdf-crop-mask"></i><i class="ai-pdf-crop-mask"></i><i class="ai-pdf-crop-mask"></i><i class="ai-pdf-crop-mask"></i><i class="ai-pdf-crop-selection"></i></div>
            </div>
          </div>
          <aside class="ai-pdf-result-pane"><header><strong data-ai-pdf-result-title>PDF 본문 검색 결과</strong></header><div data-ai-pdf-result-list></div></aside>
        </section>
      </div>
      <footer><span data-ai-search-footnote>선택한 이미지만 AI 참고 이미지로 추가됩니다.</span><button type="button" data-ai-search-add>AI 참고로 추가</button></footer>
    </section>`;
    // 앱 본문에는 작업 배율이 적용된다. PDF 원문 작업대는 뷰포트 크기를 그대로 써야 한다.
    document.documentElement.appendChild(overlay);
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
    const pageWrap = overlay.querySelector("[data-ai-pdf-page-wrap]");
    const cropButton = overlay.querySelector("[data-ai-pdf-crop-toggle]");
    cropButton.onclick = () => {
      cropMode = !cropMode;
      cropBox = null;
      cropDragStart = null;
      renderPreview();
    };
    overlay.querySelector("[data-ai-pdf-add-whole]").onclick = addWholePreview;
    overlay.querySelector("[data-ai-pdf-add-crop]").onclick = addCroppedPreview;
    const image = pageWrap.querySelector("img");
    const cropPoint = (event) => {
      const rect = image.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
        y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
      };
    };
    pageWrap.addEventListener("pointerdown", (event) => {
      if (!cropMode || event.button !== 0 || event.target.tagName !== "IMG") return;
      event.preventDefault();
      cropDragStart = cropPoint(event);
      cropBox = { x: cropDragStart.x, y: cropDragStart.y, w: 0, h: 0 };
      pageWrap.setPointerCapture?.(event.pointerId);
      renderCropBox();
    });
    pageWrap.addEventListener("pointermove", (event) => {
      if (!cropDragStart) return;
      const point = cropPoint(event);
      cropBox = {
        x: Math.min(cropDragStart.x, point.x), y: Math.min(cropDragStart.y, point.y),
        w: Math.abs(point.x - cropDragStart.x), h: Math.abs(point.y - cropDragStart.y),
      };
      renderCropBox();
    });
    pageWrap.addEventListener("pointerup", () => {
      cropDragStart = null;
      if (cropBox && (cropBox.w < 0.01 || cropBox.h < 0.01)) cropBox = null;
      renderPreview();
    });
    pageWrap.addEventListener("pointercancel", () => { cropDragStart = null; });
    window.addEventListener("resize", renderCropBox, { once: true });
    try { await ensureRemoteData(); } catch (error) { status(error.message || String(error), "error"); }
    render(); input.focus();
  }

  return { open, close };
}

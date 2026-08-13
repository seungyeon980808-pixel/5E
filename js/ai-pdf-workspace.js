export function createPdfWorkspace({ root, loadPreview, onAddWhole, onAddCrop, onSelect } = {}) {
  const workspace = root.querySelector("[data-ai-pdf-workspace]");
  const empty = workspace.querySelector("[data-ai-pdf-page-empty]");
  const wrap = workspace.querySelector("[data-ai-pdf-page-wrap]");
  const image = wrap.querySelector("img");
  const title = workspace.querySelector("[data-ai-pdf-page-title]");
  const cropButton = workspace.querySelector("[data-ai-pdf-crop-toggle]");
  const wholeButton = workspace.querySelector("[data-ai-pdf-add-whole]");
  const applyButton = workspace.querySelector("[data-ai-pdf-add-crop]");
  const resultTitle = workspace.querySelector("[data-ai-pdf-result-title]");
  const resultList = workspace.querySelector("[data-ai-pdf-result-list]");
  let item = null;
  let data = "";
  let renderedKey = "";
  let cropMode = false;
  let cropBox = null;
  let dragStart = null;
  let query = "";

  const keyOf = (value) => value ? `local:${value.id || value.path || value.file}` : "";
  const nameOf = (suffix = "") => {
    const base = !item ? "PDF 참고 이미지"
      : item.kind === "pdf-page" ? `${item.name} ${item.pageNumber}쪽` : item.name;
    return suffix ? `${base} · ${suffix}` : base;
  };

  function renderCropBox() {
    const masks = wrap.querySelectorAll(".ai-pdf-crop-mask");
    const selection = wrap.querySelector(".ai-pdf-crop-selection");
    const width = image.clientWidth, height = image.clientHeight;
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
    wrap.classList.toggle("is-cropping", cropMode);
    cropButton.classList.toggle("is-on", cropMode);
    cropButton.setAttribute("aria-pressed", String(cropMode));
    cropButton.disabled = !item || !data;
    wholeButton.disabled = !item || !data;
    applyButton.hidden = !cropMode;
    applyButton.disabled = !cropBox || !data;
    empty.hidden = !!item;
    wrap.hidden = !item;
    title.textContent = item ? item.kind === "pdf-page" ? `${item.name} · ${item.pageNumber}쪽` : item.name
      : "검색 결과를 선택하세요";
    if (!item) { image.removeAttribute("src"); return; }
    const key = keyOf(item);
    if (renderedKey === key && data) {
      if (image.src !== data) image.src = data;
      requestAnimationFrame(renderCropBox);
      return;
    }
    renderedKey = key;
    data = "";
    image.removeAttribute("src");
    empty.hidden = false;
    empty.textContent = "선택한 페이지를 크게 불러오는 중…";
    const requested = item;
    void loadPreview(requested).then((loaded) => {
      if (!image.isConnected || item !== requested || renderedKey !== key) return;
      data = loaded;
      image.src = loaded;
      empty.hidden = true;
      image.addEventListener("load", () => { renderPreview(); renderCropBox(); }, { once: true });
      renderPreview();
    }).catch((error) => {
      if (!empty.isConnected || item !== requested) return;
      empty.hidden = false;
      empty.textContent = `페이지를 표시하지 못했습니다: ${error.message || error}`;
    });
  }

  function appendHighlightedText(element, value) {
    const text = String(value || ""), needle = query.trim();
    if (!needle) return element.append(text);
    const lower = text.toLocaleLowerCase("ko"), lowerNeedle = needle.toLocaleLowerCase("ko");
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

  function renderResult(result) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ai-pdf-text-result";
    const active = keyOf(result) === keyOf(item);
    button.classList.toggle("is-on", active);
    button.setAttribute("aria-pressed", String(active));
    const head = document.createElement("span");
    head.className = "ai-pdf-text-result-head";
    const score = document.createElement("b");
    score.textContent = result.kind === "pdf-page" ? `${result.matchPercent}%` : "이미지";
    const page = document.createElement("strong");
    page.textContent = result.kind === "pdf-page" ? `${result.pageNumber}쪽` : result.name;
    head.append(score, page);
    const snippet = document.createElement("small");
    appendHighlightedText(snippet, result.snippet || result.relativePath || result.name);
    button.append(head, snippet);
    button.onclick = () => {
      item = result; data = ""; renderedKey = ""; cropMode = false; cropBox = null; dragStart = null;
      onSelect?.();
    };
    resultList.appendChild(button);
  }

  function render({ visible, results, searchQuery, hasFolder, indexing }) {
    workspace.hidden = !visible;
    if (!visible) return;
    query = searchQuery;
    resultTitle.textContent = query.trim() ? `검색 결과 ${results.length}개` : "PDF 본문 검색 결과";
    resultList.replaceChildren();
    if (results.length) results.forEach(renderResult);
    else {
      const message = document.createElement("p");
      message.className = "ai-pdf-result-empty";
      message.textContent = !hasFolder
        ? "이미지·PDF 폴더 선택을 눌러 교과서 폴더를 연결하세요. Windows 폴더 선택창에서는 파일이 표시되지 않습니다."
        : indexing ? "PDF 본문을 분석하고 있습니다."
          : query.trim() ? "일치하는 본문이 없습니다." : "검색어를 입력하면 관련 페이지가 여기에 표시됩니다.";
      resultList.appendChild(message);
    }
    renderPreview();
  }

  cropButton.onclick = () => { cropMode = !cropMode; cropBox = null; dragStart = null; renderPreview(); };
  wholeButton.onclick = () => { if (item && data) onAddWhole({ name: nameOf("전체 페이지"), data, item }); };
  applyButton.onclick = () => {
    if (!cropBox || !data || !image.naturalWidth || !image.naturalHeight) return;
    const sx = Math.round(cropBox.x * image.naturalWidth), sy = Math.round(cropBox.y * image.naturalHeight);
    const sw = Math.max(1, Math.round(cropBox.w * image.naturalWidth)), sh = Math.max(1, Math.round(cropBox.h * image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = sw; canvas.height = sh;
    canvas.getContext("2d")?.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    onAddCrop({ name: nameOf("선택 영역"), data: canvas.toDataURL("image/png"), item });
  };
  const cropPoint = (event) => {
    const rect = image.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))) };
  };
  wrap.addEventListener("pointerdown", (event) => {
    if (!cropMode || event.button !== 0 || event.target.tagName !== "IMG") return;
    event.preventDefault(); dragStart = cropPoint(event); cropBox = { x: dragStart.x, y: dragStart.y, w: 0, h: 0 };
    wrap.setPointerCapture?.(event.pointerId); renderCropBox();
  });
  wrap.addEventListener("pointermove", (event) => {
    if (!dragStart) return;
    const point = cropPoint(event);
    cropBox = { x: Math.min(dragStart.x, point.x), y: Math.min(dragStart.y, point.y),
      w: Math.abs(point.x - dragStart.x), h: Math.abs(point.y - dragStart.y) };
    renderCropBox();
  });
  wrap.addEventListener("pointerup", () => {
    dragStart = null;
    if (cropBox && (cropBox.w < 0.01 || cropBox.h < 0.01)) cropBox = null;
    renderPreview();
  });
  wrap.addEventListener("pointercancel", () => { dragStart = null; });
  window.addEventListener("resize", renderCropBox);
  return {
    clear: () => { item = null; data = ""; renderedKey = ""; cropMode = false; cropBox = null; },
    dispose: () => window.removeEventListener("resize", renderCropBox),
    render,
  };
}

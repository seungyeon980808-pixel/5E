import { renderPdfPage } from "./pdf-document-index.mjs";
import { REFERENCE_SOURCES, remoteReferenceUrl } from "./ai-reference-source-policy.js";

const MAX_SELECT = 10;

export function referenceGridState(visible, items) {
  if (!visible) return "hidden";
  return items.length ? "items" : "empty";
}

export function createReferenceGrid({ root, imageSource, onChange, onStatus } = {}) {
  const grid = root.querySelector("[data-ai-search-grid]");

  function renderCard(item, itemSource, selected) {
    const key = `${itemSource}:${item.id || item.path || item.file}`;
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
    } else if (itemSource === REFERENCE_SOURCES.LOCAL) {
      void imageSource(item).then((data) => { if (image.isConnected) image.src = data; }).catch(() => {});
    } else image.src = remoteReferenceUrl(itemSource, item);
    const title = document.createElement("strong");
    title.textContent = item.kind === "pdf-page" ? `${item.pageNumber}쪽 · ${item.name}` : item.title || item.name || item.file;
    const meta = document.createElement("span");
    meta.textContent = item.kind === "pdf-page" ? `유사도 ${item.matchPercent}% · ${item.relativePath}`
      : itemSource === REFERENCE_SOURCES.LOCAL ? item.relativePath
        : [item.subjectLabel, item.part || item.exam, item.year].filter(Boolean).join(" · ");
    card.append(image, title, meta);
    if (item.snippet) {
      const snippet = document.createElement("small");
      snippet.textContent = item.snippet;
      card.append(snippet);
    }
    card.onclick = () => {
      if (selected.has(key)) selected.delete(key);
      else if (selected.size < MAX_SELECT) selected.set(key, { source: itemSource, item });
      else onStatus(`참고 이미지는 한 번에 최대 ${MAX_SELECT}개까지 선택할 수 있습니다.`, "warn");
      onChange();
    };
    grid.appendChild(card);
  }

  return {
    render(items, source, selected, visible) {
      const state = referenceGridState(visible, items);
      grid.hidden = state === "hidden";
      grid.replaceChildren();
      if (state === "empty") {
        const empty = document.createElement("p");
        empty.className = "ai-reference-search-empty";
        empty.textContent = "검색 결과가 없습니다.";
        grid.appendChild(empty);
      } else if (state === "items") items.forEach((item) => renderCard(item, source, selected));
    },
  };
}

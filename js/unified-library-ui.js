import { importRejectionMessage, partitionLibraryImports, safeExternalSourceUrl } from "./library-import-policy.js";
import { queryHighlightTerms } from "./pdf-library/search.js";

const SOURCE_STORAGE_KEY = "5e.unified-library.sources.v1";
const TREE_STORAGE_KEY = "5e.unified-library.tree-expanded.v1";
const PANE_STORAGE_KEY = "5e.unified-library.search-pane-open.v1";
const DEFAULT_KINDS = Object.freeze(["crop", "image"]);

const ICONS = Object.freeze({
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5h7l2 2h11v10H3z"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>',
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2h10l4 4v16H5zM14 2v5h5"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
});

function editableTarget(target) {
  const tag = String(target?.tagName || "").toUpperCase();
  return Boolean(target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(tag));
}

export function shouldHandleLibrarySpace(event) {
  return event?.key === " " && !editableTarget(event.target);
}

export function kindsForResultTab(tab) {
  if (tab === "question") return ["crop"];
  if (tab === "image") return ["image"];
  if (tab === "pdf") return ["page"];
  return [...DEFAULT_KINDS];
}

export function indexLibrarySources(sources) {
  const nodes = new Map(sources.map((source) => [source.id, { ...source, children: [] }]));
  const roots = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(node.parentId);
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return { nodes, roots };
}

export function displayedSourceCount(node) {
  if (node?.children?.length) return node.children.reduce((sum, child) => sum + displayedSourceCount(child), 0);
  const pdfCount = Number(node?.counts?.pdf);
  if (Number.isFinite(pdfCount)) return pdfCount;
  const count = Number(node?.count);
  return Number.isFinite(count) ? count : 0;
}

export function sourceCountBreakdown(node) {
  if (node?.children?.length) {
    return node.children.reduce((total, child) => {
      const counts = sourceCountBreakdown(child);
      total.pdf += counts.pdf;
      total.image += counts.image;
      total.page += counts.page;
      total.question += counts.question;
      return total;
    }, { pdf: 0, image: 0, page: 0, question: 0 });
  }
  return {
    pdf: Number(node?.counts?.pdf) || 0,
    image: Number(node?.counts?.image) || 0,
    page: Number(node?.counts?.page) || 0,
    question: Number(node?.counts?.question) || 0,
  };
}

function sourceCountLabel(counts, container) {
  const pdf = `PDF ${counts.pdf}개`;
  const image = counts.image ? `이미지 ${counts.image}개` : "";
  if (container) return [pdf, image].filter(Boolean).join(" · ");
  return counts.pdf ? pdf : image;
}

export function descendantLeafIds(sourceId, sources) {
  const { nodes } = indexLibrarySources(sources);
  const ids = [];
  const visit = (node) => {
    if (!node) return;
    if (!node.children.length && node.kind !== "group" && node.kind !== "category" && node.kind !== "folder") ids.push(node.id);
    else node.children.forEach(visit);
  };
  visit(nodes.get(sourceId));
  return ids;
}

export function sourceSelection(sourceId, sources, enabled) {
  const leafIds = descendantLeafIds(sourceId, sources);
  if (!leafIds.length) return { checked: enabled.has(sourceId), indeterminate: false };
  const selected = leafIds.filter((id) => enabled.has(id)).length;
  return { checked: selected === leafIds.length, indeterminate: selected > 0 && selected < leafIds.length };
}

export function representationsForResult(result) {
  const variants = result?.variants;
  if (!variants || result?.cropType !== "question") return [];
  const options = [];
  if (variants.full) options.push({ id: "full", label: variants.full.label || "전체", source: variants.full.source });
  const firstFigure = variants.manual ?? variants.figures?.[0];
  if (firstFigure) options.push({ id: "image", sourceId: firstFigure.id || null, label: "이미지", source: firstFigure.source });
  return options;
}

export function highlightTextParts(text, query) {
  const terms = queryHighlightTerms(query).map(({ label }) => label)
    .sort((left, right) => right.length - left.length);
  if (!terms.length) return [{ text: String(text ?? ""), match: false }];
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  const matcher = new RegExp(`(${escaped.join("|")})`, "giu");
  return String(text ?? "").split(matcher).filter(Boolean).map((part) => ({ text: part, match: terms.some((term) => part.localeCompare(term, undefined, { sensitivity: "accent" }) === 0) }));
}

export function containedImageBounds(bounds, image) {
  const naturalWidth = Number(image?.naturalWidth) || bounds.width;
  const naturalHeight = Number(image?.naturalHeight) || bounds.height;
  if (!bounds.width || !bounds.height || !naturalWidth || !naturalHeight) return bounds;
  const scale = Math.min(bounds.width / naturalWidth, bounds.height / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    left: bounds.left + (bounds.width - width) / 2,
    top: bounds.top + (bounds.height - height) / 2,
    width, height,
  };
}

export function canInsertLibraryResult(result, representation) {
  if (!result) return false;
  if (result.kind !== "crop" || result.cropType !== "question") return true;
  if (representation === "manual") return Boolean(result.variants?.manual);
  if (representation === "image") return Boolean(result.variants?.manual || result.variants?.figures?.[0]);
  return String(representation).startsWith("figure:") && Boolean(result.variants?.figures?.[Number(String(representation).slice(7))]);
}

export function selectedInsertRepresentation(result, representation, selectedFigure = "figure:0") {
  if (result?.kind === "crop" && result?.cropType === "question" && representation === "full") {
    return isValidQuestionRepresentation(result, selectedFigure) ? selectedFigure : "full";
  }
  return representation;
}

export function figureChoicesForResult(result, selectedRepresentation = "figure:0") {
  const fullCrop = result?.variants?.full?.source?.rect ?? result?.provenance?.rect ?? [0, 0, 1, 1];
  return (result?.variants?.figures ?? []).flatMap((figure, index) => {
    const rect = rectInCrop(figure?.source?.rect, fullCrop);
    if (!rect) return [];
    const representation = `figure:${index}`;
    return [{
      id: figure.id || representation,
      label: figure.label || `이미지 ${index + 1}`,
      representation,
      rect,
      selected: representation === selectedRepresentation,
    }];
  });
}

export function selectedResultRecords(records, selectedIds) {
  return [...selectedIds].map((id) => records.get(id)).filter(Boolean);
}

export function aiActionRecords(records, selectedIds, currentResult) {
  if (selectedIds.size > 0) return selectedResultRecords(records, selectedIds);
  return currentResult ? [currentResult] : [];
}

export function hasInsertableAiRecord(records, { selectedId, representation, selectedFigure }) {
  return records.some((result) => canInsertLibraryResult(
    result,
    aiActionRepresentationForResult(result, selectedId, representation, selectedFigure),
  ));
}

export function aiRepresentationForResult(result, selectedId, selectedRepresentation) {
  if (result?.kind !== "crop" || result?.cropType !== "question") return "full";
  if (result.id === selectedId && selectedRepresentation !== "full") return selectedRepresentation;
  return result.variants?.manual ? "manual" : "figure:0";
}

export function aiActionRepresentationForResult(result, selectedId, selectedRepresentation, selectedFigure) {
  if (result?.id === selectedId) return selectedInsertRepresentation(result, selectedRepresentation, selectedFigure);
  return aiRepresentationForResult(result, selectedId, selectedRepresentation);
}

export function libraryActionSnapshotIsCurrent(snapshot, state) {
  return snapshot?.selectedId === state?.selectedId
    && snapshot?.representation === state?.representation
    && (snapshot?.selectedFigure ?? "") === (state?.selectedFigure ?? "")
    && (snapshot?.selectedIdsKey ?? "") === (state?.selectedIdsKey ?? "")
    && snapshot?.revision === state?.revision
    && snapshot?.open === true && state?.open === true;
}

export function isValidQuestionRepresentation(result, representation) {
  if (representation === "full" || representation === "image") return true;
  if (representation === "manual") return Boolean(result?.variants?.manual);
  return String(representation).startsWith("figure:") && Boolean(result?.variants?.figures?.[Number(String(representation).slice(7))]);
}

export function rectInCrop(rect, crop) {
  const [cx, cy, cw, ch] = crop ?? [0, 0, 1, 1];
  const x1 = Math.max(cx, rect[0]);
  const y1 = Math.max(cy, rect[1]);
  const x2 = Math.min(cx + cw, rect[0] + rect[2]);
  const y2 = Math.min(cy + ch, rect[1] + rect[3]);
  if (x2 <= x1 || y2 <= y1) return null;
  return [(x1 - cx) / cw, (y1 - cy) / ch, (x2 - x1) / cw, (y2 - y1) / ch];
}

export function highlightRectsInCrop(highlights, crop) {
  return (highlights ?? []).flatMap((highlight) => {
    const rect = rectInCrop(highlight.rect, crop);
    return rect ? [{ ...highlight, rect }] : [];
  });
}

function paintHighlightLayer(host, image, result, crop) {
  host.querySelector(".unilib-highlight-layer")?.remove();
  const highlights = highlightRectsInCrop(result?.matchContext?.highlights, crop);
  if (!highlights.length) return;
  const layer = document.createElement("span");
  layer.className = "unilib-highlight-layer";
  const paint = () => {
    if (!host.isConnected || !image.isConnected) return;
    const hostBounds = host.getBoundingClientRect();
    const imageBounds = containedImageBounds(image.getBoundingClientRect(), image);
    layer.replaceChildren(...highlights.map((highlight) => {
      const marker = document.createElement("span");
      marker.className = "unilib-match-rect";
      marker.setAttribute("aria-hidden", "true");
      marker.dataset.termId = highlight.termId;
      marker.style.setProperty("--unilib-highlight-color", highlight.color);
      Object.assign(marker.style, {
        left: `${imageBounds.left - hostBounds.left + highlight.rect[0] * imageBounds.width}px`,
        top: `${imageBounds.top - hostBounds.top + highlight.rect[1] * imageBounds.height}px`,
        width: `${highlight.rect[2] * imageBounds.width}px`, height: `${highlight.rect[3] * imageBounds.height}px`,
      });
      return marker;
    }));
  };
  host.append(layer);
  image.addEventListener("load", paint, { once: true });
  if (image.complete) queueMicrotask(paint);
  if ("ResizeObserver" in globalThis) {
    const observer = new ResizeObserver(() => { if (host.isConnected) paint(); else observer.disconnect(); });
    observer.observe(host);
  }
}

function paintFigureChoiceLayer(host, image, choices, onSelect) {
  host.querySelector(".unilib-figure-layer")?.remove();
  if (!choices.length) return;
  const layer = document.createElement("span");
  layer.className = "unilib-figure-layer";
  const paint = () => {
    if (!host.isConnected || !image.isConnected) return;
    const hostBounds = host.getBoundingClientRect();
    const imageBounds = containedImageBounds(image.getBoundingClientRect(), image);
    layer.replaceChildren(...choices.map((choice) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.unilibFigureChoice = choice.representation;
      button.className = "unilib-figure-choice";
      button.setAttribute("aria-label", `${choice.label} 선택`);
      button.setAttribute("aria-pressed", String(choice.selected));
      button.title = choice.label;
      Object.assign(button.style, {
        left: `${imageBounds.left - hostBounds.left + choice.rect[0] * imageBounds.width}px`,
        top: `${imageBounds.top - hostBounds.top + choice.rect[1] * imageBounds.height}px`,
        width: `${choice.rect[2] * imageBounds.width}px`,
        height: `${choice.rect[3] * imageBounds.height}px`,
      });
      button.addEventListener("click", () => onSelect(choice.representation));
      return button;
    }));
  };
  host.append(layer);
  image.addEventListener("load", paint, { once: true });
  if (image.complete) queueMicrotask(paint);
  if ("ResizeObserver" in globalThis) {
    const observer = new ResizeObserver(() => { if (host.isConnected) paint(); else observer.disconnect(); });
    observer.observe(host);
  }
}

function materializationRepresentation(result, representation) {
  if (result?.kind === "crop" && representation === "image") return result.variants?.manual ? "manual" : "figure:0";
  return representation;
}

export function resultForRepresentation(result, representationId) {
  if ((representationId === "manual" || representationId === "image") && result?.variants?.manual?.source) {
    return { ...result, preview: { ...(result.preview || {}), source: result.variants.manual.source }, provenance: { ...(result.provenance || {}), ...result.variants.manual.source } };
  }
  const figureIndex = String(representationId).startsWith("figure:") ? Number(String(representationId).slice(7)) : representationId === "image" ? 0 : -1;
  const figure = figureIndex >= 0 ? result?.variants?.figures?.[figureIndex] : null;
  const option = figure ? { source: figure.source } : representationsForResult(result).find((candidate) => candidate.id === representationId);
  if (!option?.source) return result;
  return {
    ...result,
    preview: { ...(result.preview || {}), source: option.source },
    provenance: { ...(result.provenance || {}), ...option.source },
  };
}

export function withManualCropVariant(result, source) {
  return {
    ...result,
    variants: { ...(result?.variants || {}), manual: { label: "직접 자른 이미지", source: { ...source } } },
  };
}

export function cropContentBoundsForResult(result, candidates = []) {
  const source = result?.provenance ?? {};
  const pageResults = [result, ...candidates.filter((candidate) => candidate !== result)].filter((candidate) => {
    const candidateSource = candidate?.provenance ?? {};
    return candidateSource.documentId === source.documentId && candidateSource.pageNumber === source.pageNumber;
  });
  const rects = pageResults.flatMap((candidate) => {
    const rect = candidate?.variants?.content?.source?.rect
      ?? candidate?.variants?.full?.source?.rect
      ?? candidate?.provenance?.rect;
    if (!Array.isArray(rect) || rect.length !== 4 || rect.some((value) => !Number.isFinite(Number(value))) || Number(rect[2]) <= 0 || Number(rect[3]) <= 0) return [];
    const normalized = clampRect(rect);
    return normalized[2] > 0 && normalized[3] > 0 ? [normalized] : [];
  });
  if (!rects.length) return [0, 0, 1, 1];
  const left = Math.min(...rects.map((rect) => rect[0]));
  const top = Math.min(...rects.map((rect) => rect[1]));
  const right = Math.max(...rects.map((rect) => rect[0] + rect[2]));
  const bottom = Math.max(...rects.map((rect) => rect[1] + rect[3]));
  return [left, top, right - left, bottom - top];
}

export function cropZoomView({ zoom, requestedZoom, scrollLeft = 0, scrollTop = 0, pointerX = 0, pointerY = 0, stageLeft = 0, stageTop = 0 }) {
  const currentZoom = Number.isFinite(Number(zoom)) && Number(zoom) > 0 ? Number(zoom) : 1;
  if (!Number.isFinite(Number(requestedZoom)) || Number(requestedZoom) <= 0) {
    return { zoom: currentZoom, scrollLeft, scrollTop };
  }
  const nextZoom = Math.max(0.5, Math.min(6, Number(requestedZoom)));
  const ratio = nextZoom / currentZoom;
  const localX = Number(pointerX) - Number(stageLeft);
  const localY = Number(pointerY) - Number(stageTop);
  return {
    zoom: nextZoom,
    scrollLeft: (Number(scrollLeft) + localX) * ratio - localX,
    scrollTop: (Number(scrollTop) + localY) * ratio - localY,
  };
}

export function cropActionSnapshotIsCurrent(snapshot, state) {
  return snapshot?.resultId === state?.resultId
    && snapshot?.documentId === state?.documentId
    && snapshot?.pageNumber === state?.pageNumber
    && snapshot?.rectKey === state?.rectKey
    && snapshot?.open === true && state?.open === true
    && snapshot?.exact === true && state?.exact === true;
}

export async function saveCropPng({ dataUrl, suggestedName, nativeSave, requestDownload }) {
  if (!/^data:image\/png;base64,/iu.test(String(dataUrl || ""))) return { kind: "error", error: "invalid-image" };
  try {
    if (typeof nativeSave === "function") {
      const response = await nativeSave({ dataUrl, suggestedName });
      if (response?.ok === true) return { kind: "saved", ...(response.filePath ? { filePath: response.filePath } : {}) };
      if (response?.canceled === true) return { kind: "canceled" };
      return { kind: "error", error: response?.error || "write-failed" };
    }
    if (typeof requestDownload !== "function") return { kind: "error", error: "download-unavailable" };
    requestDownload(dataUrl, suggestedName);
    return { kind: "requested" };
  } catch {
    return { kind: "error", error: "write-failed" };
  }
}

export function normalizedCropPoint(event, bounds) {
  if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width <= 0 || bounds.height <= 0) return [0, 0];
  return [
    Math.max(0, Math.min(1, (Number(event?.clientX) - bounds.left) / bounds.width)),
    Math.max(0, Math.min(1, (Number(event?.clientY) - bounds.top) / bounds.height)),
  ];
}

export function cropSessionIsCurrent(session, result) {
  const source = result?.provenance ?? result?.source ?? {};
  return Boolean(session && result
    && session.resultId === result.id
    && session.documentId === source.documentId
    && session.pageNumber === source.pageNumber);
}

export function cropRectFromGesture(initial, start, current, mode = "draw", handle = "") {
  let [sx, sy] = start.map((value) => Number(value) || 0);
  let [cx, cy] = current.map((value) => Number(value) || 0);
  if (mode === "draw") {
    [sx, sy, cx, cy] = [sx, sy, cx, cy].map((value) => Math.max(0, Math.min(1, value)));
    const width = Math.abs(cx - sx);
    const height = Math.abs(cy - sy);
    return width > 0 && height > 0 ? [Math.min(sx, cx), Math.min(sy, cy), width, height] : null;
  }
  if (mode === "move") return [
    Math.max(0, Math.min(1 - initial[2], initial[0] + cx - sx)),
    Math.max(0, Math.min(1 - initial[3], initial[1] + cy - sy)),
    initial[2], initial[3],
  ];
  let [x, y, width, height] = initial;
  if (handle.includes("w")) { x += cx - sx; width -= cx - sx; }
  if (handle.includes("e")) width += cx - sx;
  if (handle.includes("n")) { y += cy - sy; height -= cy - sy; }
  if (handle.includes("s")) height += cy - sy;
  if (width < 0.01) { if (handle.includes("w")) x -= 0.01 - width; width = 0.01; }
  if (height < 0.01) { if (handle.includes("n")) y -= 0.01 - height; height = 0.01; }
  return clampRect([x, y, width, height]);
}

export function cropRectFromKeyboard(rect, key, resize = false) {
  if (!rect || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) return rect;
  const step = resize ? 0.02 : 0.005;
  const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
  const dy = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
  return resize
    ? cropRectFromGesture(rect, [0, 0], [dx, dy], "resize", dx ? "e" : "s")
    : cropRectFromGesture(rect, [0, 0], [dx, dy], "move");
}

export function reconcileUnifiedSelection(selectedId, results) {
  if (results.some((result) => result.id === selectedId)) return selectedId;
  return results[0]?.id ?? null;
}

export function libraryResultIdentity(result) {
  const source = result?.provenance ?? {};
  return JSON.stringify([
    result?.id ?? null, source.documentId ?? null, source.pageNumber ?? null,
    source.itemId ?? result?.metadata?.itemNumber ?? null, source.sha256 ?? null,
    source.sourceKind ?? null, source.locator ?? null,
  ]);
}

export async function resolveLibraryPreviewResult(result, resolveResult, isCurrent) {
  try {
    const resolved = await resolveResult(result);
    return isCurrent() ? { status: "resolved", result: resolved } : { status: "stale" };
  } catch (error) {
    return isCurrent() ? { status: "failed", error } : { status: "stale" };
  }
}

function loadSourceState(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(SOURCE_STORAGE_KEY) || "null");
    if (Array.isArray(parsed)) return { enabled: new Set(parsed.filter((value) => typeof value === "string")), excludedGroups: new Set() };
    if (parsed && Array.isArray(parsed.enabled)) return {
      enabled: new Set(parsed.enabled.filter((value) => typeof value === "string")),
      excludedGroups: new Set((parsed.excludedGroups || []).filter((value) => typeof value === "string")),
    };
  } catch {}
  return { enabled: null, excludedGroups: new Set() };
}

function saveEnabledSources(storage, sourceIds, excludedGroups) {
  storage.setItem(SOURCE_STORAGE_KEY, JSON.stringify({ enabled: [...sourceIds], excludedGroups: [...excludedGroups] }));
}

function loadExpandedSources(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(TREE_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch { return new Set(); }
}

function loadPaneOpen(storage) {
  try { return storage.getItem(PANE_STORAGE_KEY) !== "false"; } catch { return true; }
}

export function includeNewLibrarySources(enabled, known, sources, excludedGroups = new Set()) {
  const parents = new Map(sources.map((source) => [source.id, source.parentId ?? null]));
  const hasExcludedAncestor = (source) => {
    const visited = new Set();
    let parentId = source.parentId ?? null;
    while (parentId && !visited.has(parentId)) {
      if (excludedGroups.has(parentId)) return true;
      visited.add(parentId);
      parentId = parents.get(parentId) ?? null;
    }
    return false;
  };
  for (const source of sources) {
    if (!["group", "category", "folder"].includes(source.kind) && !known.has(source.id) && !hasExcludedAncestor(source)) enabled.add(source.id);
  }
  return enabled;
}

function labelForKind(kind) {
  return ({ crop: "문항", image: "이미지", page: "PDF" })[kind] || "자료";
}

export function isExampleLibraryResult(result) {
  return result?.presentation?.kind === "example"
    || result?.metadata?.isExample === true
    || result?.provenance?.sourceKind === "fixture";
}

function resultImage(result, materialized) {
  return materialized?.dataUrl || materialized?.dataUri || materialized?.src || materialized?.url
    || result.preview?.dataUrl || result.preview?.src || result.preview?.url || (typeof result.preview === "string" ? result.preview : "");
}

export function unifiedLibrarySourceMetadata(result, asset = {}) {
  const provenance = result?.provenance ?? {};
  const source = asset?.source ?? {};
  const metadata = {
    provider: provenance.provider,
    documentId: source.documentId ?? provenance.documentId,
    documentTitle: source.documentTitle ?? provenance.documentTitle,
    documentHash: source.documentHash ?? provenance.documentHash,
    title: source.title ?? provenance.title ?? result?.title,
    pageNumber: source.pageNumber ?? provenance.pageNumber,
    rect: source.rect ?? provenance.rect,
    fullPageFallback: source.fullPageFallback ?? provenance.fullPageFallback,
    locator: source.locator ?? provenance.locator,
    displayName: source.displayName ?? provenance.displayName,
    sha256: source.sha256 ?? provenance.sha256,
    sourceKind: source.kind ?? source.sourceKind ?? provenance.sourceKind,
    itemId: source.itemId ?? provenance.itemId,
    fileName: source.fileName ?? provenance.fileName,
    sourceUrl: source.sourceUrl ?? provenance.sourceUrl,
    license: source.license ?? provenance.license,
  };
  if (Array.isArray(metadata.rect)) metadata.rect = [...metadata.rect];
  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value != null));
}

export function unifiedLibraryTransfer(result, materialized) {
  const data = resultImage(result, materialized);
  return {
    dataUrl: data,
    src: data,
    name: result?.title || "라이브러리 이미지",
    sourceKind: "unified-library",
    source: unifiedLibrarySourceMetadata(result, materialized),
  };
}

function materializedReference(result, materialized) {
  return unifiedLibraryTransfer(result, materialized);
}

export function isAiRasterDataUrl(value) {
  return /^data:image\/(?:png|jpeg|webp);/i.test(String(value || ""));
}

async function rasterizeReference(reference) {
  if (isAiRasterDataUrl(reference.dataUrl)) return reference;
  const image = new Image();
  image.decoding = "async";
  image.src = reference.dataUrl;
  await image.decode();
  const longest = Math.max(image.naturalWidth, image.naturalHeight, 1);
  const scale = Math.min(1, 2048 / longest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d", { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/png");
  return { ...reference, dataUrl, src: dataUrl };
}

function clampRect(rect) {
  const [rawX = 0, rawY = 0, rawW = 1, rawH = 1] = rect || [];
  const numericX = Number(rawX);
  const numericY = Number(rawY);
  const numericWidth = Number(rawW);
  const numericHeight = Number(rawH);
  const width = Math.max(0.01, Math.min(1, Number.isFinite(numericWidth) ? numericWidth : 1));
  const height = Math.max(0.01, Math.min(1, Number.isFinite(numericHeight) ? numericHeight : 1));
  const x = Math.max(0, Math.min(1 - width, Number.isFinite(numericX) ? numericX : 0));
  const y = Math.max(0, Math.min(1 - height, Number.isFinite(numericY) ? numericY : 0));
  return [
    x, y, width, height,
  ];
}

function resultSourceText(result) {
  const source = result.provenance || {};
  const page = source.pageNumber ? ` · ${source.pageNumber}쪽` : "";
  return result.subtitle || `${result.sourceLabel || "라이브러리"}${page}`;
}

function buildShell() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay unified-library-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="unilib" role="dialog" aria-modal="true" aria-labelledby="unilib-title">
      <header class="unilib-header">
        <div class="unilib-brand"><img class="unilib-logo" src="assets/logo.svg" alt="5E"><span>/</span><h2 id="unilib-title">라이브러리</h2></div>
        <div class="unilib-header-actions">
          <button type="button" class="unilib-button" data-unilib-import>파일 가져오기</button>
          <input type="file" data-unilib-files accept="application/pdf,.pdf,image/*" multiple hidden>
          <button type="button" class="unilib-button" data-unilib-manage>폴더 관리</button>
          <button type="button" class="unilib-icon-button" data-unilib-close aria-label="라이브러리 닫기">${ICONS.close}</button>
        </div>
      </header>
      <div class="unilib-shell">
        <aside class="unilib-pane unilib-folders" aria-label="검색 위치">
          <div class="unilib-pane-head"><h3>검색 위치</h3><button type="button" class="unilib-icon-button" data-unilib-pane-collapse aria-label="검색 위치 접기">${ICONS.chevron}</button><button type="button" class="unilib-icon-button unilib-mobile-only" data-unilib-folders-close aria-label="검색 위치 닫기">${ICONS.close}</button></div>
          <div class="unilib-folder-scroll"><p><strong>제공 자료</strong>는 앱이 정리한 가상 분류입니다. <strong>내 자료</strong>에는 가져온 파일과 설치형 앱에서 직접 연결한 폴더가 표시됩니다.</p><ul class="unilib-tree" data-unilib-tree></ul></div>
          <div class="unilib-pane-foot"><button type="button" class="unilib-button" data-unilib-manage-side>폴더 관리…</button></div>
        </aside>
        <section class="unilib-pane unilib-results" aria-label="라이브러리 검색 결과">
          <div class="unilib-search-tools">
            <div class="unilib-search-row">
              <button type="button" class="unilib-location-summary" data-unilib-folders-open aria-label="검색 위치 열기">${ICONS.folder}<span data-unilib-location-summary>검색 위치</span></button>
              <label class="unilib-search">${ICONS.search}<input data-unilib-query type="search" autocomplete="off" spellcheck="false" aria-label="라이브러리 통합 검색" placeholder="문항 코드, PDF 본문, 이미지 파일명 검색"><button type="button" data-unilib-clear aria-label="검색어 지우기">×</button></label>
              <button type="button" class="unilib-icon-button" data-unilib-preview-toggle aria-pressed="true" aria-label="미리보기 열기">${ICONS.file}</button>
            </div>
            <div class="unilib-tabs" role="tablist" aria-label="결과 종류">
              <button type="button" role="tab" data-unilib-tab="all" aria-selected="true">전체</button>
              <button type="button" role="tab" data-unilib-tab="question" aria-selected="false">문항</button>
              <button type="button" role="tab" data-unilib-tab="image" aria-selected="false">이미지</button>
              <button type="button" role="tab" data-unilib-tab="pdf" aria-selected="false">PDF</button>
            </div>
            <div class="unilib-exam-filters" data-unilib-exam-filters hidden>
              <select data-unilib-filter="subject" aria-label="과목"><option value="">모든 과목</option><option value="p1">물리학Ⅰ</option><option value="p2">물리학Ⅱ</option><option value="c1">화학Ⅰ</option><option value="c2">화학Ⅱ</option><option value="b1">생명과학Ⅰ</option><option value="b2">생명과학Ⅱ</option><option value="e1">지구과학Ⅰ</option><option value="e2">지구과학Ⅱ</option></select>
              <select data-unilib-filter="academicYear" aria-label="학년도"><option value="">모든 학년도</option></select>
              <select data-unilib-filter="administration" aria-label="시험"><option value="">모든 시험</option><option value="06">6월 모의평가</option><option value="09">9월 모의평가</option><option value="11">수능</option></select>
            </div>
            <p class="unilib-help">전체에서는 문항과 이미지를 검색합니다. 원문 페이지는 PDF 필터에서 확인하세요.</p>
          </div>
          <div class="unilib-result-scroll"><div class="unilib-summary"><span><button type="button" class="unilib-summary-back" data-unilib-pdf-back hidden>PDF 목록</button><strong data-unilib-count>0개</strong> <span data-unilib-count-label>결과</span></span><span>↑↓ 선택 · Space 크게 보기</span></div><section class="unilib-selected-tray" data-unilib-selected-tray aria-label="선택한 문항" hidden><strong data-unilib-selected-count>선택 0개</strong><div data-unilib-selected-items></div></section><ul class="unilib-result-list" data-unilib-results role="listbox"></ul></div>
        </section>
        <aside class="unilib-pane unilib-preview" data-unilib-preview aria-label="선택 자료 미리보기">
          <div class="unilib-pane-head"><div><h3 data-unilib-preview-title>미리보기</h3><p data-unilib-preview-kind>자료를 선택하세요</p><span class="unilib-example-note" data-unilib-preview-example hidden>목업 · 예시 자료</span></div><button type="button" class="unilib-icon-button" data-unilib-preview-close aria-label="미리보기 닫기">${ICONS.close}</button></div>
          <div class="unilib-preview-scroll"><div class="unilib-representations" data-unilib-representations hidden role="group" aria-label="문항 표시 범위"></div><details class="unilib-highlight-legend" data-unilib-highlight-legend hidden><summary>검색어 강조</summary><ul></ul></details><div class="unilib-stage" data-unilib-stage><span>검색 결과를 선택하세요.</span></div><div class="unilib-match-context" data-unilib-match-context hidden></div><div class="unilib-part-options" data-unilib-part-options hidden></div></div>
          <div class="unilib-preview-foot"><div class="unilib-source">${ICONS.file}<div><strong data-unilib-source-name>—</strong><span data-unilib-source-meta>—</span></div><div class="unilib-source-actions"><button type="button" data-unilib-source-open>원문 페이지</button><button type="button" data-unilib-adjust hidden>PDF에서 자르기</button></div></div><div class="unilib-actions"><button type="button" class="unilib-primary" data-unilib-insert disabled>캔버스에 삽입</button><button type="button" class="unilib-button" data-unilib-objectify disabled>이미지 객체화</button><button type="button" class="unilib-button" data-unilib-ai disabled>AI 이미지로 보내기</button></div></div>
        </aside>
        <button class="unilib-scrim" data-unilib-scrim type="button" aria-label="열린 패널 닫기"></button>
      </div>
      <div class="unilib-dialog-backdrop" data-unilib-folder-dialog hidden><section class="unilib-dialog" role="dialog" aria-modal="true" aria-labelledby="unilib-folder-title"><header><h3 id="unilib-folder-title">라이브러리 폴더 관리</h3><button type="button" class="unilib-icon-button" data-unilib-folder-dialog-close aria-label="폴더 관리 닫기">${ICONS.close}</button></header><div data-unilib-folder-manager></div><details class="unilib-pdf-details"><summary>PDF · 자료팩 고급 관리</summary><div data-unilib-pdf-details></div></details></section></div>
      <div class="unilib-lightbox" data-unilib-lightbox hidden role="dialog" aria-modal="true" aria-label="자료 크게 보기"><button type="button" class="unilib-icon-button" data-unilib-lightbox-close aria-label="큰 보기 닫기">${ICONS.close}</button><div data-unilib-lightbox-stage></div></div>
      <div class="unilib-crop" data-unilib-crop hidden role="dialog" aria-modal="true" aria-labelledby="unilib-crop-title"><header><strong id="unilib-crop-title">PDF에서 직접 자르기</strong><div class="unilib-crop-view-controls"><button type="button" class="unilib-button" data-unilib-crop-fit>내용 맞춤</button><output data-unilib-crop-zoom aria-label="확대 비율">100%</output></div><button type="button" class="unilib-button" data-unilib-crop-cancel>취소</button><button type="button" class="unilib-primary" data-unilib-crop-save disabled>선택 유지</button></header><div class="unilib-crop-workspace"><div class="unilib-crop-stage" data-unilib-crop-stage tabindex="0" aria-label="PDF 페이지에서 자를 영역 선택"><div class="unilib-crop-canvas" data-unilib-crop-canvas><img data-unilib-crop-image draggable="false" alt="자를 원문 PDF 페이지"><div data-unilib-crop-box aria-hidden="true"></div></div></div><aside class="unilib-crop-preview"><strong>선택한 이미지</strong><canvas data-unilib-crop-preview aria-label="현재 선택 영역 미리보기"></canvas><div class="unilib-crop-actions" aria-label="선택 영역 보내기"><button type="button" class="unilib-primary" data-unilib-crop-insert disabled>캔버스에 삽입</button><button type="button" class="unilib-button" data-unilib-crop-objectify disabled>이미지 객체화</button><button type="button" class="unilib-button" data-unilib-crop-ai disabled>AI 이미지로 보내기</button><button type="button" class="unilib-button" data-unilib-crop-save-png disabled>PNG 저장</button></div><details class="unilib-crop-help"><summary>조작 도움말</summary><p>드래그해 다시 선택합니다. Ctrl/Shift+휠 또는 두 손가락으로 확대하고, 화살표로 이동하거나 Shift+화살표로 크기를 조절합니다.</p></details></aside></div></div>
      <p class="unilib-status" data-unilib-status role="status" aria-live="polite"></p>
    </section>`;
  document.body.append(overlay);
  return overlay;
}

function createPartOptions(host, onChange) {
  const state = { mode: "original", level: "L2", fill: "none", targetMm: 45, lineMm: 0.35, tiny: 0.035, dropLine: true };
  host.innerHTML = `<fieldset><legend>이미지 처리</legend><div class="unilib-option-row"><button type="button" data-mode="original" aria-pressed="true">원본</button><button type="button" data-mode="lineart" aria-pressed="false">선화</button></div><label>선화 단계<select data-part-level><option value="L0">전부</option><option value="L1">세밀</option><option value="L2" selected>표준</option><option value="L3">단순</option></select></label><label>채우기<select data-part-fill><option value="none">채우기 없음</option><option value="white">흰 채우기</option></select></label><details><summary>고급 설정</summary><label>작은 조각 정리<input data-part-tiny type="range" min="0" max="120" value="35"></label><label>선 굵기<input data-part-line type="range" min="20" max="60" value="35"></label><label>넣는 폭<input data-part-width type="range" min="20" max="90" value="45"></label><label><input data-part-drop type="checkbox" checked> 지시선·글자 제거</label></details></fieldset>`;
  const emit = () => onChange({ ...state });
  host.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mode]");
    if (!button) return;
    state.mode = button.dataset.mode;
    host.querySelectorAll("[data-mode]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    emit();
  });
  host.addEventListener("change", () => {
    state.level = host.querySelector("[data-part-level]").value;
    state.fill = host.querySelector("[data-part-fill]").value;
    state.tiny = Number(host.querySelector("[data-part-tiny]").value) / 1000;
    state.lineMm = Number(host.querySelector("[data-part-line]").value) / 100;
    state.targetMm = Number(host.querySelector("[data-part-width]").value);
    state.dropLine = host.querySelector("[data-part-drop]").checked;
    emit();
  });
  return () => ({ ...state });
}

export function createUnifiedLibraryUi({ getProvider, insertMaterialized, openObjectify, openAi, openIndependentReferences, pdfUi, pdfDetailsElement, onImportedImages, onDesktopSnapshot, desktopLibrary = globalThis.fiveEDesktop?.pdfLibrary, storage = globalThis.localStorage }) {
  const overlay = buildShell();
  const root = overlay.querySelector(".unilib");
  const tree = overlay.querySelector("[data-unilib-tree]");
  const list = overlay.querySelector("[data-unilib-results]");
  const query = overlay.querySelector("[data-unilib-query]");
  const stage = overlay.querySelector("[data-unilib-stage]");
  const partOptionsHost = overlay.querySelector("[data-unilib-part-options]");
  const getPartOptions = createPartOptions(partOptionsHost, () => void renderPreview());
  if (pdfDetailsElement) overlay.querySelector("[data-unilib-pdf-details]").append(pdfDetailsElement);
  let results = [];
  let selectedId = null;
  const selectedIds = new Set();
  const selectedRecords = new Map();
  let activeTab = "all";
  let pdfBrowseSource = null;
  const examFilters = { subject: "", academicYear: "", administration: "" };
  const storedSources = loadSourceState(storage);
  let enabledSources = storedSources.enabled;
  const excludedSourceGroups = storedSources.excludedGroups;
  const expandedSources = loadExpandedSources(storage);
  let treeExpansionInitialized = (() => { try { return storage.getItem(TREE_STORAGE_KEY) !== null; } catch { return false; } })();
  let searchPaneOpen = loadPaneOpen(storage);
  let activeRepresentation = "full";
  let activeFigureRepresentation = "figure:0";
  let sourcesInitialized = false;
  const knownSourceIds = new Set();
  let searchEpoch = 0;
  let previewEpoch = 0;
  let thumbnailEpoch = 0;
  let thumbnailQueue = Promise.resolve();
  let thumbnailObserver = null;
  let currentMaterialized = null;
  let returnFocus = null;
  let desktopConnections = [];
  let desktopWarnings = [];
  let importedImageBytes = 0;
  let importedImageCount = 0;
  let actionBusy = false;
  let actionRevision = 0;
  let draftCrop = null;
  let cropGesture = null;
  let cropSession = null;
  let cropPreviewEpoch = 0;
  let cropPreviewExact = false;
  let cropExact = null;
  let cropActionBusy = false;
  let cropZoom = 1;
  let cropBaseScale = 1;
  let cropFitBounds = [0, 0, 1, 1];
  const cropPointers = new Map();
  let cropPinch = null;

  const selectedResult = () => results.find((result) => result.id === selectedId) || null;
  const selectedVariantResult = () => resultForRepresentation(selectedResult(), activeRepresentation);
  const actionButtons = () => [...overlay.querySelectorAll("[data-unilib-insert],[data-unilib-objectify],[data-unilib-ai]")];
  const selectionKey = () => [...selectedIds].sort().join("\u0000");
  const invalidateAction = () => { actionRevision += 1; };
  const snapshotAction = () => Object.freeze({ selectedId, selectedIdsKey: selectionKey(), representation: activeRepresentation, selectedFigure: activeFigureRepresentation, revision: actionRevision, options: Object.freeze(getPartOptions()), open: !overlay.hidden });
  const actionIsCurrent = (snapshot) => libraryActionSnapshotIsCurrent(snapshot, { selectedId, selectedIdsKey: selectionKey(), representation: activeRepresentation, selectedFigure: activeFigureRepresentation, revision: actionRevision, open: !overlay.hidden });
  const updateAiActionAvailability = () => {
    const aiRecords = aiActionRecords(selectedRecords, selectedIds, selectedResult());
    const aiAllowed = hasInsertableAiRecord(aiRecords, {
      selectedId,
      representation: activeRepresentation,
      selectedFigure: activeFigureRepresentation,
    });
    overlay.querySelector("[data-unilib-ai]").disabled = actionBusy || !aiAllowed || (typeof openAi !== "function" && typeof openIndependentReferences !== "function");
  };
  const runLibraryAction = async (work) => {
    if (actionBusy) return;
    actionBusy = true;
    actionButtons().forEach((button) => { button.disabled = true; });
    const snapshot = snapshotAction();
    try {
      await work(snapshot, () => actionIsCurrent(snapshot));
    } catch (error) {
      if (actionIsCurrent(snapshot)) setStatus(`작업 실패: ${error instanceof Error ? error.message : error}`, true);
    } finally {
      actionBusy = false;
      if (!overlay.hidden) void renderPreview();
    }
  };
  const setStatus = (message, error = false) => {
    const status = overlay.querySelector("[data-unilib-status]");
    status.textContent = message;
    status.classList.toggle("is-error", error);
  };

  async function provider() { return getProvider(); }

  async function renderSources() {
    const activeProvider = await provider();
    const sources = activeProvider.getSources();
    const yearSelect = overlay.querySelector('[data-unilib-filter="academicYear"]');
    const filterOptions = activeProvider.getExamFilterOptions?.();
    const years = filterOptions?.academicYears
      ?? [...new Set((activeProvider.search({ query: "", kinds: ["crop"], limit: 500 }) ?? []).map((result) => result.metadata?.academicYear).filter(Number.isInteger))].sort((a, b) => b - a);
    const selectedYear = yearSelect.value;
    yearSelect.replaceChildren(new Option("모든 학년도", ""), ...years.map((year) => new Option(`${year}학년도`, String(year))));
    yearSelect.value = years.includes(Number(selectedYear)) ? selectedYear : "";
    examFilters.academicYear = yearSelect.value;
    const containers = new Set(["group", "category", "folder"]);
    if (!enabledSources) enabledSources = new Set(sources.filter((source) => !containers.has(source.kind)).map((source) => source.id));
    else if (sourcesInitialized) {
      includeNewLibrarySources(enabledSources, knownSourceIds, sources, excludedSourceGroups);
    }
    for (const source of sources) if (!containers.has(source.kind)) knownSourceIds.add(source.id);
    sourcesInitialized = true;
    const fragment = document.createDocumentFragment();
    const appendTreeNode = ({ id, name, counts = null, checked, indeterminate, children = [], depth = 0, desktop = null, container = false }, parent) => {
      if (!treeExpansionInitialized && depth === 0) expandedSources.add(id);
      const item = document.createElement("li");
      item.className = `unilib-tree-item${desktop ? " is-desktop-folder" : ""}`;
      item.style.setProperty("--unilib-tree-depth", String(depth));
      const row = document.createElement("div");
      row.className = "unilib-tree-row";
      const hasChildren = children.length > 0;
      const expanded = hasChildren && expandedSources.has(id);
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "unilib-tree-toggle";
      toggle.dataset.treeToggle = id;
      toggle.disabled = !hasChildren;
      toggle.setAttribute("aria-label", `${name} ${expanded ? "접기" : "펼치기"}`);
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.innerHTML = hasChildren ? ICONS.chevron : "";
      const label = document.createElement("label");
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = checked;
      check.indeterminate = indeterminate;
      if (desktop) {
        check.dataset.desktopFolderId = desktop.folderId;
        check.dataset.connectionId = desktop.connectionId;
      } else check.dataset.sourceId = id;
      const icon = document.createElement("span");
      icon.className = "unilib-tree-icon";
      icon.innerHTML = ICONS.folder;
      const text = document.createElement("span");
      text.className = "unilib-tree-label";
      text.textContent = name;
      text.title = name;
      const amount = document.createElement("small");
      amount.className = "unilib-tree-count";
      amount.textContent = counts ? sourceCountLabel(counts, container) : "";
      amount.title = counts ? `하위 폴더 포함 PDF ${counts.pdf}개 · 이미지 ${counts.image}개` : "";
      label.append(check, icon, text, amount);
      if (!desktop && children.length === 0 && /\.pdf$/iu.test(name)) {
        label.dataset.browseSource = id;
        label.title = `${name} 페이지 열기`;
      }
      row.append(toggle, label);
      item.append(row);
      if (hasChildren) {
        const childList = document.createElement("ul");
        childList.hidden = !expanded;
        children.forEach((child) => appendTreeNode({ ...child, depth: depth + 1 }, childList));
        item.append(childList);
      }
      parent.append(item);
    };
    if (desktopLibrary) {
      for (const connection of desktopConnections) {
        const treeResult = await desktopLibrary.folderTree(connection.connectionId);
        const projectDesktop = (node) => ({
          id: `desktop:${node.folderId}`,
          name: node.name,
          counts: { pdf: node.documentCount || 0, image: node.imageCount || 0, page: 0, question: 0 },
          container: true,
          checked: node.selected,
          indeterminate: node.selection === "partial",
          desktop: { folderId: node.folderId, connectionId: connection.connectionId },
          children: (node.children || []).map(projectDesktop),
        });
        const projected = projectDesktop(treeResult.tree);
        appendTreeNode(projected, fragment);
      }
    }
    const { roots } = indexLibrarySources(sources);
    const projectProvider = (node) => {
      const selection = sourceSelection(node.id, sources, enabledSources);
      const children = node.children.map(projectProvider);
      return {
        id: node.id,
        name: node.label,
        counts: sourceCountBreakdown(node),
        container: node.kind !== "source",
        ...selection,
        children,
      };
    };
    for (const source of roots) {
      appendTreeNode(projectProvider(source), fragment);
    }
    tree.replaceChildren(fragment);
    treeExpansionInitialized = true;
    try { storage.setItem(TREE_STORAGE_KEY, JSON.stringify([...expandedSources])); } catch {}
    const selectedCount = enabledSources.size;
    overlay.querySelector("[data-unilib-location-summary]").textContent = selectedCount ? `검색 위치 ${selectedCount}곳` : "검색 위치 없음";
    root.classList.toggle("folders-collapsed", !searchPaneOpen);
    overlay.querySelector("[data-unilib-pane-collapse]").setAttribute("aria-expanded", String(searchPaneOpen));
  }

  async function runSearch() {
    invalidateAction();
    const ownEpoch = ++searchEpoch;
    const activeProvider = await provider();
    if (!enabledSources) await renderSources();
    const options = { query: query.value.trim(), sourceIds: [...enabledSources], kinds: kindsForResultTab(activeTab), filters: activeTab === "question" ? { ...examFilters } : {}, limit: activeTab === "pdf" ? 500 : 60 };
    setStatus("라이브러리를 검색하는 중…");
    try {
      let found;
      if (activeTab === "pdf" && pdfBrowseSource && typeof activeProvider.listPdfPages === "function") {
        found = activeProvider.listPdfPages({ query: options.query, sourceId: pdfBrowseSource });
      } else if (activeTab === "pdf" && typeof activeProvider.listPdfFiles === "function") {
        found = activeProvider.listPdfFiles(options);
      } else {
        found = typeof activeProvider.searchAsync === "function" ? await activeProvider.searchAsync(options) : activeProvider.search(options);
      }
      if (ownEpoch !== searchEpoch || overlay.hidden) return;
      results = Array.isArray(found) ? found : [];
      selectedId = reconcileUnifiedSelection(selectedId, results);
      renderResults();
      await renderPreview();
      const resultUnit = activeTab === "pdf" ? (pdfBrowseSource ? "쪽" : "개 PDF 파일") : "개 결과";
      setStatus(results.length ? `${results.length}${resultUnit}` : "검색 결과가 없습니다.");
    } catch (error) {
      if (ownEpoch === searchEpoch) setStatus(`검색 실패: ${error instanceof Error ? error.message : error}`, true);
    }
  }

  function renderResults() {
    const ownThumbnailEpoch = ++thumbnailEpoch;
    thumbnailObserver?.disconnect();
    thumbnailObserver = null;
    const visibleResults = results;
    root.dataset.activeTab = activeTab;
    overlay.querySelector("[data-unilib-count]").textContent = `${visibleResults.length}개`;
    overlay.querySelector("[data-unilib-count-label]").textContent = activeTab === "pdf" ? (pdfBrowseSource ? "페이지" : "PDF 파일") : activeTab === "question" ? "문항" : "결과";
    overlay.querySelector("[data-unilib-pdf-back]").hidden = activeTab !== "pdf" || !pdfBrowseSource;
    renderSelectedTray();
    const pendingThumbnails = [];
    const loadThumbnail = (result, media) => {
      thumbnailQueue = thumbnailQueue.then(async () => {
        if (ownThumbnailEpoch !== thumbnailEpoch || !media.isConnected) return;
        const materialized = await (await provider()).materialize(result, { thumbnail: true });
        if (ownThumbnailEpoch !== thumbnailEpoch || !media.isConnected) return;
        const src = resultImage(result, materialized);
        if (!src) return;
        const image = new Image();
        image.loading = "lazy";
        image.alt = "";
        image.src = src;
        media.replaceChildren(image);
        paintHighlightLayer(media, image, result, result.provenance?.rect ?? [0, 0, 1, 1]);
      }).catch(() => {});
    };
    list.replaceChildren(...visibleResults.map((result) => {
      const item = document.createElement("li");
      item.className = "unilib-result-row";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "unilib-result-card";
      button.dataset.resultId = result.id;
      if (result.fileSourceId) button.dataset.pdfFile = result.fileSourceId;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(result.id === selectedId));
      const preview = resultImage(result, null);
      const media = document.createElement("span");
      media.className = "unilib-thumb";
      if (typeof preview === "string" && preview) {
        const image = new Image();
        image.loading = "lazy";
        image.alt = "";
        image.src = preview;
        media.append(image);
        paintHighlightLayer(media, image, result, result.provenance?.rect ?? [0, 0, 1, 1]);
      } else {
        media.textContent = result.kind === "page" ? "PDF" : "5E";
        if (result.provenance?.provider === "pdf") pendingThumbnails.push({ result, media });
      }
      const copy = document.createElement("span");
      copy.className = "unilib-result-copy";
      const badge = document.createElement("span");
      badge.className = `unilib-badge is-${result.kind}`;
      badge.textContent = labelForKind(result.kind);
      const disclosure = document.createElement("span");
      disclosure.className = "unilib-example-note";
      disclosure.textContent = "목업 · 예시 자료";
      disclosure.hidden = !isExampleLibraryResult(result);
      const title = document.createElement("strong");
      title.textContent = result.title;
      title.title = result.title;
      const meta = document.createElement("small");
      meta.textContent = resultSourceText(result);
      meta.title = meta.textContent;
      const snippet = document.createElement("span");
      snippet.className = "unilib-result-snippet";
      const snippetText = result.matchContext?.snippet || "";
      snippet.hidden = !snippetText;
      snippet.replaceChildren(...highlightTextParts(snippetText, query.value).map((part) => {
        const node = document.createElement(part.match ? "mark" : "span");
        node.textContent = part.text;
        return node;
      }));
      copy.append(badge, disclosure, title, meta);
      if (activeTab !== "question") copy.append(snippet);
      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "unilib-result-check";
      check.dataset.selectResult = result.id;
      check.checked = selectedIds.has(result.id);
      check.setAttribute("aria-label", `${result.title} AI 참고 선택`);
      button.append(media, copy);
      item.append(button, check);
      return item;
    }));
    if (pendingThumbnails.length && "IntersectionObserver" in globalThis) {
      const lookup = new Map(pendingThumbnails.map((entry) => [entry.media, entry.result]));
      thumbnailObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          thumbnailObserver?.unobserve(entry.target);
          const result = lookup.get(entry.target);
          if (result) loadThumbnail(result, entry.target);
        }
      }, { root: overlay.querySelector(".unilib-result-scroll"), rootMargin: "240px 0px" });
      pendingThumbnails.forEach(({ media }) => thumbnailObserver.observe(media));
    } else pendingThumbnails.forEach(({ result, media }) => loadThumbnail(result, media));
  }

  function renderSelectedTray() {
    const tray = overlay.querySelector("[data-unilib-selected-tray]");
    const records = selectedResultRecords(selectedRecords, selectedIds);
    tray.hidden = records.length === 0;
    overlay.querySelector("[data-unilib-selected-count]").textContent = `선택 ${records.length}개`;
    overlay.querySelector("[data-unilib-selected-items]").replaceChildren(...records.map((result) => {
      const chip = document.createElement("span");
      chip.className = "unilib-selected-item";
      const name = document.createElement("span");
      name.textContent = result.title || result.id;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.unilibSelectedRemove = result.id;
      remove.setAttribute("aria-label", `${result.title || result.id} 선택 해제`);
      remove.textContent = "×";
      chip.append(name, remove);
      return chip;
    }));
    overlay.querySelector("[data-unilib-ai]").textContent = records.length > 1 ? `선택 ${records.length}개 AI 이미지로 보내기` : "AI 이미지로 보내기";
    updateAiActionAvailability();
  }

  async function renderPreview() {
    const ownEpoch = ++previewEpoch;
    let result = selectedResult();
    if (result?.provenance?.provider === "pdf" && pdfUi?.resolveResult) {
      const requestIdentity = libraryResultIdentity(result);
      const resolution = await resolveLibraryPreviewResult(
        result,
        (value) => pdfUi.resolveResult(value),
        () => ownEpoch === previewEpoch && requestIdentity === libraryResultIdentity(selectedResult()),
      );
      if (resolution.status === "stale") return;
      if (resolution.status === "failed") {
        stage.replaceChildren();
        stage.textContent = `미리보기 실패: ${resolution.error instanceof Error ? resolution.error.message : resolution.error}`;
        return;
      }
      invalidateAction();
      results = results.map((value) => libraryResultIdentity(value) === requestIdentity ? resolution.result : value);
      if (selectedRecords.has(result.id) && libraryResultIdentity(selectedRecords.get(result.id)) === requestIdentity) {
        selectedRecords.set(result.id, resolution.result);
      }
      result = resolution.result;
    }
    if (cropSession && !cropSessionIsCurrent(cropSession, result)) closeCrop(false);
    const representations = representationsForResult(result);
    if (!isValidQuestionRepresentation(result, activeFigureRepresentation) || activeFigureRepresentation === "full" || activeFigureRepresentation === "image") activeFigureRepresentation = result?.variants?.manual ? "manual" : "figure:0";
    if (representations.length && !isValidQuestionRepresentation(result, activeRepresentation)) activeRepresentation = representations[0].id;
    if (!representations.length) activeRepresentation = result?.variants?.manual ? "manual" : "full";
    const materializeResult = resultForRepresentation(result, activeRepresentation);
    const representationHost = overlay.querySelector("[data-unilib-representations]");
    representationHost.hidden = representations.length === 0;
    representationHost.replaceChildren(...representations.map((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.representation = option.id;
      button.textContent = option.label;
      button.setAttribute("aria-pressed", String(option.id === activeRepresentation || (option.id === "image" && activeRepresentation !== "full")));
      return button;
    }));
    const imageChoices = [...(result?.variants?.manual ? [{ label: "조정한 범위", value: "manual" }] : []), ...(result?.variants?.figures ?? []).map((figure, index) => ({ label: figure.label || `이미지 ${index + 1}`, value: `figure:${index}` }))];
    if (imageChoices.length > 1 && activeRepresentation !== "full") {
      const picker = document.createElement("select");
      picker.dataset.figurePicker = "";
      picker.setAttribute("aria-label", "문항 이미지 선택");
      picker.replaceChildren(...imageChoices.map((choice) => new Option(choice.label, choice.value)));
      picker.value = activeRepresentation === "image" ? imageChoices[0].value : activeRepresentation;
      representationHost.append(picker);
    }
    if (result?.kind === "crop" && result.cropType === "question" && imageChoices.length === 0) {
      const notice = document.createElement("span");
      notice.className = "unilib-crop-offer";
      notice.textContent = "자동으로 찾은 이미지가 없습니다.";
      const cropButton = document.createElement("button");
      cropButton.type = "button";
      cropButton.dataset.unilibCropOffer = "";
      cropButton.textContent = "이미지 직접 자르기";
      representationHost.append(notice, cropButton);
    }
    const matchContext = overlay.querySelector("[data-unilib-match-context]");
    matchContext.hidden = !result?.matchContext?.snippet;
    matchContext.replaceChildren(...highlightTextParts(result?.matchContext?.snippet || "", query.value).map((part) => {
      const node = document.createElement(part.match ? "mark" : "span");
      node.textContent = part.text;
      return node;
    }));
    const legend = overlay.querySelector("[data-unilib-highlight-legend]");
    const legendTerms = result?.matchContext?.terms ?? [];
    const misses = new Set(result?.matchContext?.misses ?? []);
    legend.hidden = legendTerms.length === 0;
    legend.querySelector("ul").replaceChildren(...legendTerms.map((term) => {
      const item = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.style.setProperty("--unilib-highlight-color", term.color);
      item.append(swatch, document.createTextNode(`${term.label}${misses.has(term.termId) ? " · 좌표 없음" : ""}`));
      return item;
    }));
    currentMaterialized = null;
    partOptionsHost.hidden = result?.provenance?.provider !== "parts";
    overlay.querySelector("[data-unilib-preview-title]").textContent = result?.title || "미리보기";
    overlay.querySelector("[data-unilib-preview-kind]").textContent = result ? labelForKind(result.kind) : "자료를 선택하세요";
    overlay.querySelector("[data-unilib-preview-example]").hidden = !isExampleLibraryResult(result);
    overlay.querySelector("[data-unilib-source-name]").textContent = result?.sourceLabel || "—";
    overlay.querySelector("[data-unilib-source-meta]").textContent = result ? resultSourceText(result) : "—";
    const insert = overlay.querySelector("[data-unilib-insert]");
    const insertRepresentation = selectedInsertRepresentation(result, activeRepresentation, activeFigureRepresentation);
    const actionAllowed = canInsertLibraryResult(result, insertRepresentation);
    insert.disabled = actionBusy || !actionAllowed;
    insert.title = result?.kind === "crop" && !insert.disabled ? "선택한 이미지만 캔버스에 삽입" : result?.kind === "crop" ? "이미지를 선택해야 삽입할 수 있습니다" : "";
    overlay.querySelector("[data-unilib-objectify]").disabled = actionBusy || !actionAllowed || typeof openObjectify !== "function";
    updateAiActionAvailability();
    overlay.querySelector("[data-unilib-adjust]").hidden = result?.provenance?.provider !== "pdf";
    const sourceOpen = overlay.querySelector("[data-unilib-source-open]");
    const isPdf = result?.provenance?.provider === "pdf";
    const revealable = Boolean(result?.provenance?.documentId && desktopLibrary?.revealItem);
    const sourceUrl = safeExternalSourceUrl(result?.provenance?.sourceUrl);
    sourceOpen.textContent = isPdf ? "원문 페이지" : "출처 열기";
    sourceOpen.hidden = !result || (!isPdf && !revealable && !sourceUrl);
    stage.replaceChildren();
    if (!result) { stage.textContent = "검색 결과를 선택하세요."; return; }
    stage.textContent = "미리보기를 준비하는 중…";
    try {
      const activeProvider = await provider();
      const materialized = await activeProvider.materialize(materializeResult, { ...getPartOptions(), preview: true, representation: materializationRepresentation(result, activeRepresentation) });
      if (ownEpoch !== previewEpoch || result.id !== selectedId) return;
      currentMaterialized = materialized;
      const src = resultImage(result, materialized);
      stage.replaceChildren();
      if (src) {
        const frame = document.createElement("div");
        frame.className = "unilib-preview-image";
        const image = new Image();
        image.alt = result.title;
        image.src = src;
        frame.append(image);
        const previewCrop = materializeResult.provenance?.rect ?? [0, 0, 1, 1];
        paintHighlightLayer(frame, image, result, previewCrop);
        if (activeRepresentation === "full") paintFigureChoiceLayer(frame, image, figureChoicesForResult(result, activeFigureRepresentation), (representation) => {
          invalidateAction();
          activeFigureRepresentation = representation;
          void renderPreview();
        });
        stage.append(frame);
      } else stage.textContent = "미리보기를 표시할 수 없습니다.";
    } catch (error) {
      if (ownEpoch === previewEpoch) stage.textContent = `미리보기 실패: ${error instanceof Error ? error.message : error}`;
    }
  }

  async function refreshDesktopSources(sync = false) {
    if (!desktopLibrary) return;
    let snapshot;
    if (sync && pdfUi?.syncDesktopConnections) {
      snapshot = await pdfUi.syncDesktopConnections();
      onDesktopSnapshot?.(snapshot);
      desktopWarnings = snapshot?.warnings || [];
    } else {
      snapshot = await desktopLibrary.connections();
      desktopWarnings = [];
    }
    desktopConnections = snapshot?.connections || [];
    if (desktopWarnings.length) setStatus(`${desktopWarnings.length}개 파일을 안전 제한으로 건너뛰었습니다. 폴더 관리에서 파일 크기를 확인하세요.`, true);
    await renderSources();
    await renderFolderManager();
  }

  async function renderFolderManager() {
    const host = overlay.querySelector("[data-unilib-folder-manager]");
    host.replaceChildren();
    const actions = document.createElement("div");
    actions.className = "unilib-manager-actions";
    const specs = desktopLibrary
      ? [["기본 폴더 만들기", async () => desktopLibrary.ensureDefaultFolder()], ["다른 폴더 연결", async () => desktopLibrary.pickFolder()], ["새로고침", async () => {}]]
      : [["폴더 연결은 설치형 앱에서 사용할 수 있습니다", null]];
    for (const [label, action] of specs) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "unilib-button";
      button.textContent = label;
      button.addEventListener("click", async () => {
        window.dispatchEvent(new CustomEvent("5e:local-folder-intent"));
        if (!action) return;
        await action();
        await refreshDesktopSources(true);
        await runSearch();
      });
      actions.append(button);
    }
    const guidance = document.createElement("p");
    guidance.className = "unilib-folder-guidance";
    guidance.textContent = desktopLibrary
      ? "선택한 폴더와 하위 폴더의 PDF·이미지를 재귀 색인합니다. 심볼릭 링크와 제외한 폴더는 건너뛰며, 새로고침으로 변경 사항을 반영합니다."
      : "웹에서는 앱이 제공한 가상 분류와 직접 가져온 자료를 사용합니다. 실제 폴더 연결과 재귀 새로고침은 설치형 앱에서 사용할 수 있습니다.";
    host.append(actions, guidance);
    if (desktopWarnings.length) {
      const details = document.createElement("details");
      details.className = "unilib-sync-warnings";
      const summary = document.createElement("summary");
      summary.textContent = `건너뛴 큰 파일 ${desktopWarnings.length}개`;
      const warningList = document.createElement("ul");
      warningList.replaceChildren(...desktopWarnings.map((warning) => {
        const item = document.createElement("li");
        const sizeMb = Math.ceil((Number(warning.size) || 0) / 1024 / 1024);
        item.textContent = `${warning.relativePath || "파일"} · ${warning.kind === "pdf" ? "PDF" : "이미지"} · ${sizeMb}MB`;
        return item;
      }));
      details.append(summary, warningList);
      host.append(details);
    }
    for (const connection of desktopConnections) {
      const section = document.createElement("section");
      const heading = document.createElement("h4");
      heading.textContent = `${connection.name}${connection.isDefault ? " · 기본" : ""}${connection.status === "unavailable" ? " · 사용할 수 없음" : ""}`;
      const treeResult = await desktopLibrary.folderTree(connection.connectionId);
      const folderList = document.createElement("ul");
      const appendNode = (node, parent) => {
        const item = document.createElement("li");
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = node.selected;
        checkbox.indeterminate = node.selection === "partial";
        checkbox.addEventListener("change", async () => {
          checkbox.disabled = true;
          await desktopLibrary.setFolderSelection(node.folderId, checkbox.checked);
          await refreshDesktopSources(true);
          await runSearch();
        });
        label.append(checkbox, document.createTextNode(`${node.name} · PDF ${node.documentCount || 0} · 이미지 ${node.imageCount || 0}`));
        const openButton = document.createElement("button");
        openButton.type = "button";
        openButton.className = "unilib-folder-open";
        openButton.textContent = "폴더 열기";
        openButton.addEventListener("click", () => desktopLibrary.openFolder(node.folderId));
        item.append(label, openButton);
        if (node.children?.length) {
          const children = document.createElement("ul");
          node.children.forEach((child) => appendNode(child, children));
          item.append(children);
        }
        parent.append(item);
      };
      appendNode(treeResult.tree, folderList);
      section.append(heading, folderList);
      host.append(section);
    }
  }

  function closeDrawers() { root.classList.remove("folders-open", "preview-open"); }
  function close() {
    if (overlay.hidden) return;
    invalidateAction();
    searchEpoch += 1;
    previewEpoch += 1;
    thumbnailEpoch += 1;
    thumbnailObserver?.disconnect();
    thumbnailObserver = null;
    pdfUi?.deactivate?.();
    overlay.hidden = true;
    closeDrawers();
    returnFocus?.focus?.();
    window.dispatchEvent(new CustomEvent("5e:library-closed", { detail: { library: "unified" } }));
  }
  async function open(trigger) {
    invalidateAction();
    returnFocus = trigger || document.activeElement;
    overlay.hidden = false;
    await pdfUi?.activate?.();
    if (desktopLibrary && pdfUi?.syncDesktopConnections) {
      const snapshot = await pdfUi.syncDesktopConnections();
      desktopConnections = snapshot?.connections || [];
      desktopWarnings = snapshot?.warnings || [];
      onDesktopSnapshot?.(snapshot);
      if (desktopWarnings.length) setStatus(`${desktopWarnings.length}개 파일을 안전 제한으로 건너뛰었습니다.`, true);
    }
    await renderSources();
    await runSearch();
    query.focus();
  }

  tree.addEventListener("change", async (event) => {
    const desktopInput = event.target.closest("[data-desktop-folder-id]");
    if (desktopInput) {
      desktopInput.disabled = true;
      try {
        await desktopLibrary.setFolderSelection(desktopInput.dataset.desktopFolderId, desktopInput.checked);
        await refreshDesktopSources(true);
        await runSearch();
      } catch (error) {
        setStatus(`폴더 선택 변경 실패: ${error instanceof Error ? error.message : error}`, true);
        await renderSources();
      }
      return;
    }
    const input = event.target.closest("[data-source-id]");
    if (!input) return;
    const activeProvider = await provider();
    const sources = activeProvider.getSources();
    const source = sources.find((item) => item.id === input.dataset.sourceId);
    const affected = descendantLeafIds(source?.id, sources);
    if (!affected.length && source?.id) affected.push(source.id);
    affected.filter(Boolean).forEach((id) => input.checked ? enabledSources.add(id) : enabledSources.delete(id));
    if (["group", "category", "folder"].includes(source?.kind)) input.checked ? excludedSourceGroups.delete(source.id) : excludedSourceGroups.add(source.id);
    saveEnabledSources(storage, enabledSources, excludedSourceGroups);
    await renderSources();
    await runSearch();
  });
  tree.addEventListener("click", (event) => {
    const browse = event.target.closest("[data-browse-source]");
    if (browse && !event.target.closest("input")) {
      event.preventDefault();
      enabledSources = new Set([browse.dataset.browseSource]);
      activeTab = "pdf";
      overlay.querySelectorAll("[data-unilib-tab]").forEach((item) => item.setAttribute("aria-selected", String(item.dataset.unilibTab === "pdf")));
      void renderSources().then(runSearch);
      return;
    }
    const toggle = event.target.closest("[data-tree-toggle]");
    if (!toggle || toggle.disabled) return;
    const id = toggle.dataset.treeToggle;
    if (expandedSources.has(id)) expandedSources.delete(id); else expandedSources.add(id);
    try { storage.setItem(TREE_STORAGE_KEY, JSON.stringify([...expandedSources])); } catch {}
    void renderSources();
  });
  list.addEventListener("click", (event) => {
    const check = event.target.closest("[data-select-result]");
    if (check) {
      event.stopPropagation();
      invalidateAction();
      const id = check.dataset.selectResult;
      if (check.checked && selectedIds.size >= 10) {
        check.checked = false;
        setStatus("AI 참고 이미지는 한 번에 최대 10개까지 선택할 수 있습니다.", true);
        return;
      }
      if (check.checked) {
        selectedIds.add(id);
        const record = results.find((result) => result.id === id);
        if (record) selectedRecords.set(id, record);
      } else {
        selectedIds.delete(id);
        selectedRecords.delete(id);
      }
      renderSelectedTray();
      return;
    }
    const card = event.target.closest("[data-result-id]");
    if (!card) return;
    if (card.dataset.pdfFile) {
      pdfBrowseSource = card.dataset.pdfFile;
      selectedId = null;
      void runSearch();
      return;
    }
    invalidateAction();
    selectedId = card.dataset.resultId;
    activeRepresentation = "full";
    activeFigureRepresentation = "figure:0";
    renderResults();
    void renderPreview();
  });
  overlay.querySelector("[data-unilib-selected-items]").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-unilib-selected-remove]");
    if (!remove) return;
    invalidateAction();
    selectedIds.delete(remove.dataset.unilibSelectedRemove);
    selectedRecords.delete(remove.dataset.unilibSelectedRemove);
    renderResults();
  });
  overlay.querySelector("[data-unilib-representations]").addEventListener("click", (event) => {
    if (event.target.closest("[data-unilib-crop-offer]")) {
      overlay.querySelector("[data-unilib-adjust]").click();
      return;
    }
    const button = event.target.closest("[data-representation]");
    if (!button) return;
    invalidateAction();
    activeRepresentation = button.dataset.representation === "image" ? activeFigureRepresentation : button.dataset.representation;
    void renderPreview();
  });
  overlay.querySelector("[data-unilib-representations]").addEventListener("change", (event) => {
    const picker = event.target.closest("[data-figure-picker]");
    if (!picker) return;
    invalidateAction();
    activeRepresentation = picker.value;
    activeFigureRepresentation = picker.value;
    void renderPreview();
  });
  query.addEventListener("input", () => void runSearch());
  overlay.querySelector("[data-unilib-clear]").addEventListener("click", () => { query.value = ""; void runSearch(); query.focus(); });
  overlay.querySelectorAll("[data-unilib-tab]").forEach((tab) => tab.addEventListener("click", () => {
    activeTab = tab.dataset.unilibTab;
    if (activeTab === "pdf") pdfBrowseSource = null;
    overlay.querySelectorAll("[data-unilib-tab]").forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
    overlay.querySelector("[data-unilib-exam-filters]").hidden = activeTab !== "question";
    void runSearch();
  }));
  overlay.querySelector("[data-unilib-pdf-back]").addEventListener("click", () => {
    pdfBrowseSource = null;
    selectedId = null;
    void runSearch();
  });
  overlay.querySelectorAll("[data-unilib-filter]").forEach((control) => control.addEventListener("change", () => {
    examFilters[control.dataset.unilibFilter] = control.value;
    void runSearch();
  }));
  overlay.querySelector("[data-unilib-import]").addEventListener("click", () => overlay.querySelector("[data-unilib-files]").click());
  overlay.querySelector("[data-unilib-files]").addEventListener("change", async (event) => {
    const files = [...event.target.files];
    const { acceptedPdfs, acceptedImages, rejected } = partitionLibraryImports(files, { currentImageBytes: importedImageBytes, currentImageCount: importedImageCount });
    if (acceptedPdfs.length) await pdfUi?.openFiles?.(acceptedPdfs);
    if (acceptedImages.length) {
      await onImportedImages?.(acceptedImages);
      importedImageBytes += acceptedImages.reduce((total, file) => total + file.size, 0);
      importedImageCount += acceptedImages.length;
    }
    const rejection = importRejectionMessage(rejected);
    if (rejection) setStatus(rejection, true);
    event.target.value = "";
    await renderSources();
    await runSearch();
  });
  const folderDialog = overlay.querySelector("[data-unilib-folder-dialog]");
  const openManager = async () => {
    folderDialog.hidden = false;
    if (desktopLibrary) await refreshDesktopSources(true);
    else await renderFolderManager();
    overlay.querySelector("[data-unilib-folder-dialog-close]").focus();
  };
  overlay.querySelectorAll("[data-unilib-manage],[data-unilib-manage-side]").forEach((button) => button.addEventListener("click", () => void openManager()));
  overlay.querySelector("[data-unilib-folder-dialog-close]").addEventListener("click", () => { folderDialog.hidden = true; });
  overlay.querySelector("[data-unilib-folders-open]").addEventListener("click", () => {
    if (window.matchMedia("(max-width: 720px)").matches) root.classList.add("folders-open");
    else {
      searchPaneOpen = true;
      root.classList.remove("folders-collapsed");
      overlay.querySelector("[data-unilib-pane-collapse]").setAttribute("aria-expanded", "true");
      try { storage.setItem(PANE_STORAGE_KEY, "true"); } catch {}
    }
  });
  overlay.querySelector("[data-unilib-pane-collapse]").addEventListener("click", () => {
    if (window.matchMedia("(max-width: 767px)").matches) { closeDrawers(); return; }
    searchPaneOpen = false;
    root.classList.add("folders-collapsed");
    overlay.querySelector("[data-unilib-pane-collapse]").setAttribute("aria-expanded", "false");
    try { storage.setItem(PANE_STORAGE_KEY, "false"); } catch {}
  });
  overlay.querySelector("[data-unilib-folders-close]").addEventListener("click", closeDrawers);
  overlay.querySelector("[data-unilib-preview-toggle]").addEventListener("click", () => root.classList.toggle("preview-open"));
  overlay.querySelector("[data-unilib-preview-close]").addEventListener("click", () => root.classList.toggle("preview-hidden", true));
  overlay.querySelector("[data-unilib-scrim]").addEventListener("click", closeDrawers);
  overlay.querySelector("[data-unilib-close]").addEventListener("click", close);
  overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(); });
  overlay.querySelector("[data-unilib-insert]").addEventListener("click", async () => {
    await runLibraryAction(async (snapshot, isCurrent) => {
      const result = results.find((item) => item.id === snapshot.selectedId);
      const representation = selectedInsertRepresentation(result, snapshot.representation, snapshot.selectedFigure);
      if (!result || !canInsertLibraryResult(result, representation)) return;
      const effectiveResult = resultForRepresentation(result, representation);
      const activeProvider = await provider();
      if (!isCurrent()) return;
      const materialized = await activeProvider.materialize(effectiveResult, { ...snapshot.options, representation: materializationRepresentation(result, representation) });
      if (!isCurrent()) return;
      await insertMaterialized(effectiveResult, materialized, snapshot.options, { isCurrent });
      if (isCurrent()) close();
    });
  });
  overlay.querySelector("[data-unilib-objectify]").addEventListener("click", async () => {
    await runLibraryAction(async (snapshot, isCurrent) => {
      const result = results.find((item) => item.id === snapshot.selectedId);
      const representation = selectedInsertRepresentation(result, snapshot.representation, snapshot.selectedFigure);
      if (!result || !canInsertLibraryResult(result, representation) || typeof openObjectify !== "function") return;
      const effectiveResult = resultForRepresentation(result, representation);
      const activeProvider = await provider();
      if (!isCurrent()) return;
      const materialized = await activeProvider.materialize(effectiveResult, { ...snapshot.options, representation: materializationRepresentation(result, representation) });
      if (!isCurrent()) return;
      await openObjectify(effectiveResult, materialized, { isCurrent });
      if (isCurrent()) close();
    });
  });
  overlay.querySelector("[data-unilib-ai]").addEventListener("click", async () => {
    await runLibraryAction(async (snapshot, isCurrent) => {
      const chosen = aiActionRecords(selectedRecords, selectedIds, results.find((item) => item.id === snapshot.selectedId));
      if (!chosen.length) return;
      const activeProvider = await provider();
      if (!isCurrent()) return;
      const references = [];
      for (const result of chosen.slice(0, 10)) {
        const representation = aiActionRepresentationForResult(result, snapshot.selectedId, snapshot.representation, snapshot.selectedFigure);
        if (!canInsertLibraryResult(result, representation)) continue;
        const effectiveResult = resultForRepresentation(result, representation);
        const materialized = await activeProvider.materialize(effectiveResult, { ...snapshot.options, representation: materializationRepresentation(result, representation) });
        if (!isCurrent()) return;
        references.push(await rasterizeReference(materializedReference(effectiveResult, materialized)));
        if (!isCurrent()) return;
      }
      if (!isCurrent() || !references.length) return;
    if (referenceConsumer) {
      references.forEach((reference) => referenceConsumer.onAdd?.({ name: reference.name, data: reference.dataUrl, sourceKind: reference.sourceKind, source: reference.source }));
      referenceConsumer.onStatus?.(`라이브러리 참고 이미지 ${references.length}개가 추가되었습니다.`, "ok");
      referenceConsumer.onComplete?.();
      referenceConsumer = null;
    } else if (typeof openIndependentReferences === "function") {
      await openIndependentReferences({ references, startGeneration: false });
    } else await openAi?.({ references });
      if (isCurrent()) close();
    });
  });
  overlay.querySelector("[data-unilib-source-open]").addEventListener("click", async () => {
    const result = selectedResult();
    if (!result) return;
    if (result.provenance?.provider === "pdf") {
      const activeProvider = await provider();
      let pageResult = results.find((item) => item.kind === "page" && (item.id === result.parentId
        || (item.provenance?.documentId === result.provenance.documentId && item.provenance?.pageNumber === result.provenance.pageNumber)));
      if (!pageResult) {
        const pages = activeProvider.search({ query: query.value.trim(), sourceIds: [...enabledSources], kinds: ["page"], limit: 500 });
        pageResult = pages.find((item) => item.provenance?.documentId === result.provenance.documentId && item.provenance?.pageNumber === result.provenance.pageNumber);
        if (pageResult) results = [...results, pageResult];
      }
      if (pageResult) {
        invalidateAction();
        selectedId = pageResult.id;
        renderResults();
        await renderPreview();
      }
    } else if (result.provenance?.documentId && desktopLibrary?.revealItem) await desktopLibrary.revealItem({ documentId: result.provenance.documentId });
    else {
      const sourceUrl = safeExternalSourceUrl(result.provenance?.sourceUrl);
      if (sourceUrl) window.open(sourceUrl, "_blank", "noopener");
    }
  });
  const cropDialog = overlay.querySelector("[data-unilib-crop]");
  const cropStage = overlay.querySelector("[data-unilib-crop-stage]");
  const cropCanvas = overlay.querySelector("[data-unilib-crop-canvas]");
  const cropBox = overlay.querySelector("[data-unilib-crop-box]");
  const cropImage = overlay.querySelector("[data-unilib-crop-image]");
  const cropPreview = overlay.querySelector("[data-unilib-crop-preview]");
  const cropSave = overlay.querySelector("[data-unilib-crop-save]");
  const cropZoomOutput = overlay.querySelector("[data-unilib-crop-zoom]");
  const cropRectKey = () => draftCrop?.join(",") ?? "";
  const cropActionState = () => ({
    resultId: cropSession?.resultId,
    documentId: cropSession?.documentId,
    pageNumber: cropSession?.pageNumber,
    rectKey: cropRectKey(),
    open: !cropDialog.hidden,
    exact: Boolean(cropPreviewExact && cropExact?.rectKey === cropRectKey()),
  });
  const setCropActionAvailability = () => {
    const available = cropActionState().exact && !cropActionBusy;
    cropSave.disabled = !available;
    overlay.querySelector("[data-unilib-crop-insert]").disabled = !available || typeof insertMaterialized !== "function";
    overlay.querySelector("[data-unilib-crop-objectify]").disabled = !available || typeof openObjectify !== "function";
    overlay.querySelector("[data-unilib-crop-ai]").disabled = !available || (typeof openAi !== "function" && typeof openIndependentReferences !== "function" && !referenceConsumer);
    overlay.querySelector("[data-unilib-crop-save-png]").disabled = !available;
  };
  const sizeCropCanvas = () => {
    if (!cropImage.naturalWidth || !cropImage.naturalHeight) return;
    cropCanvas.style.width = `${cropImage.naturalWidth * cropBaseScale * cropZoom}px`;
    cropCanvas.style.height = `${cropImage.naturalHeight * cropBaseScale * cropZoom}px`;
    cropZoomOutput.value = `${Math.round(cropZoom * 100)}%`;
    cropZoomOutput.textContent = cropZoomOutput.value;
  };
  const centerCropContent = () => {
    const [x, y, width, height] = cropFitBounds;
    const focusY = draftCrop ? draftCrop[1] + draftCrop[3] / 2 : y + height / 2;
    cropStage.scrollLeft = (x + width / 2) * cropCanvas.offsetWidth - cropStage.clientWidth / 2;
    cropStage.scrollTop = focusY * cropCanvas.offsetHeight - cropStage.clientHeight / 2;
  };
  const fitCropContent = () => {
    if (!cropImage.naturalWidth || !cropImage.naturalHeight || !cropStage.clientWidth || !cropStage.clientHeight) return;
    const [, , contentWidth] = cropFitBounds;
    const availableWidth = Math.max(1, cropStage.clientWidth - 24);
    cropBaseScale = Math.max(0.01, availableWidth / (cropImage.naturalWidth * contentWidth));
    cropZoom = 1;
    sizeCropCanvas();
    centerCropContent();
  };
  const setCropZoom = (requestedZoom, pointerX, pointerY) => {
    const bounds = cropStage.getBoundingClientRect();
    const next = cropZoomView({
      zoom: cropZoom, requestedZoom,
      scrollLeft: cropStage.scrollLeft, scrollTop: cropStage.scrollTop,
      pointerX, pointerY, stageLeft: bounds.left, stageTop: bounds.top,
    });
    if (next.zoom === cropZoom) return;
    cropZoom = next.zoom;
    sizeCropCanvas();
    cropStage.scrollLeft = next.scrollLeft;
    cropStage.scrollTop = next.scrollTop;
  };
  const paintCropPreview = () => {
    if (!draftCrop || !cropImage.complete || !cropImage.naturalWidth) {
      cropPreview.width = 1;
      cropPreview.height = 1;
      return;
    }
    const [x, y, width, height] = draftCrop;
    const sourceWidth = cropImage.naturalWidth * width;
    const sourceHeight = cropImage.naturalHeight * height;
    cropPreview.width = Math.max(1, Math.ceil(sourceWidth));
    cropPreview.height = Math.max(1, Math.ceil(sourceHeight));
    const context = cropPreview.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, cropPreview.width, cropPreview.height);
    context.drawImage(cropImage, x * cropImage.naturalWidth, y * cropImage.naturalHeight, sourceWidth, sourceHeight, 0, 0, cropPreview.width, cropPreview.height);
  };
  const paintCrop = () => {
    cropBox.hidden = !draftCrop;
    setCropActionAvailability();
    if (!draftCrop) { paintCropPreview(); return; }
    const [x, y, width, height] = draftCrop;
    Object.assign(cropBox.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${width * 100}%`, height: `${height * 100}%` });
    paintCropPreview();
  };
  const paintExactCropPreview = async () => {
    const result = selectedResult();
    if (!draftCrop || !cropSessionIsCurrent(cropSession, result)) return;
    const epoch = ++cropPreviewEpoch;
    const rect = [...draftCrop];
    const source = {
      documentId: result.provenance.documentId,
      pageNumber: result.provenance.pageNumber,
      rect,
      fullPageFallback: false,
    };
    cropPreviewExact = false;
    cropExact = null;
    setCropActionAvailability();
    try {
      const manualResult = withManualCropVariant(result, source);
      const materialized = await (await provider()).materialize(manualResult, { representation: "manual" });
      const src = resultImage(result, materialized);
      if (!src) throw new Error("선택한 이미지를 표시할 수 없습니다.");
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", () => reject(new Error("선택한 이미지를 읽지 못했습니다.")), { once: true });
        image.src = src;
      });
      if (epoch !== cropPreviewEpoch || !cropSessionIsCurrent(cropSession, selectedResult())
        || !draftCrop || draftCrop.some((value, index) => value !== rect[index])) return;
      cropPreview.width = image.naturalWidth;
      cropPreview.height = image.naturalHeight;
      cropPreview.getContext("2d", { alpha: false }).drawImage(image, 0, 0);
      cropPreviewExact = true;
      cropExact = { result: resultForRepresentation(manualResult, "manual"), materialized, rectKey: rect.join(",") };
      setCropActionAvailability();
    } catch (error) {
      if (epoch === cropPreviewEpoch && cropSessionIsCurrent(cropSession, selectedResult())) {
        setStatus(`선택 미리보기 실패: ${error instanceof Error ? error.message : error}`, true);
      }
    }
  };
  const closeCrop = (restoreFocus = true) => {
    cropPreviewEpoch += 1;
    cropPreviewExact = false;
    cropExact = null;
    cropActionBusy = false;
    cropDialog.hidden = true;
    draftCrop = null;
    cropGesture = null;
    cropSession = null;
    cropPointers.clear();
    cropPinch = null;
    cropZoom = 1;
    cropBaseScale = 1;
    cropCanvas.removeAttribute("style");
    cropImage.removeAttribute("src");
    paintCrop();
    if (restoreFocus && !overlay.hidden) overlay.querySelector("[data-unilib-adjust]").focus();
  };
  overlay.querySelector("[data-unilib-adjust]").addEventListener("click", async () => {
    const result = selectedResult();
    if (!result || result.provenance?.provider !== "pdf") return;
    const session = {
      resultId: result.id,
      documentId: result.provenance.documentId,
      pageNumber: result.provenance.pageNumber,
    };
    cropSession = session;
    cropGesture = null;
    draftCrop = clampRect(result.variants?.manual?.source?.rect || pdfUi?.cropForResult?.(result) || result.variants?.content?.source?.rect || result.provenance.rect);
    cropPreviewExact = false;
    cropExact = null;
    const activeProvider = await provider();
    const pageResults = typeof activeProvider.search === "function"
      ? activeProvider.search({ query: "", kinds: ["crop"], limit: 500 })
      : results;
    cropFitBounds = cropContentBoundsForResult(result, pageResults);
    cropDialog.hidden = false;
    cropStage.setAttribute("aria-busy", "true");
    paintCrop();
    cropStage.focus();
    setStatus("원문 페이지를 준비하는 중…");
    try {
      const original = await activeProvider.materialize(result, { original: true });
      if (!cropSessionIsCurrent(session, selectedResult()) || cropSession !== session) return;
      const src = resultImage(result, original);
      if (!src) throw new Error("원문 페이지를 표시할 수 없습니다.");
      cropImage.src = src;
      void paintExactCropPreview();
    } catch (error) {
      if (cropSession === session) {
        cropStage.setAttribute("aria-busy", "false");
        setStatus(`원문 페이지 실패: ${error instanceof Error ? error.message : error}`, true);
      }
    }
  });
  cropImage.addEventListener("load", () => {
    cropStage.setAttribute("aria-busy", "false");
    fitCropContent();
    paintCrop();
  });
  overlay.querySelector("[data-unilib-crop-fit]").addEventListener("click", fitCropContent);
  cropStage.addEventListener("wheel", (event) => {
    if (!event.ctrlKey && !event.shiftKey) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 0.05 : 0.002;
    setCropZoom(cropZoom * Math.exp(-event.deltaY * unit), event.clientX, event.clientY);
  }, { passive: false });
  overlay.querySelector("[data-unilib-crop-cancel]").addEventListener("click", closeCrop);
  cropSave.addEventListener("click", async () => {
    const result = selectedResult();
    if (!result || !draftCrop || !cropSessionIsCurrent(cropSession, result)) return;
    const savedRect = clampRect(draftCrop);
    const source = {
      documentId: result.provenance.documentId,
      pageNumber: result.provenance.pageNumber,
      rect: savedRect,
      fullPageFallback: false,
    };
    const updated = withManualCropVariant(result, source);
    invalidateAction();
    results = results.map((item) => item.id === result.id ? updated : item);
    if (selectedIds.has(result.id)) selectedRecords.set(result.id, updated);
    activeRepresentation = "manual";
    closeCrop();
    await renderPreview();
  });
  const runCropAction = async (work) => {
    const exact = cropExact;
    const snapshot = Object.freeze(cropActionState());
    if (cropActionBusy || !exact || !cropActionSnapshotIsCurrent(snapshot, cropActionState())) return;
    cropActionBusy = true;
    setCropActionAvailability();
    const isCurrent = () => cropExact === exact && cropActionSnapshotIsCurrent(snapshot, cropActionState());
    try {
      await work(exact, isCurrent);
    } catch (error) {
      if (isCurrent()) setStatus(`작업 실패: ${error instanceof Error ? error.message : error}`, true);
    } finally {
      cropActionBusy = false;
      if (!cropDialog.hidden) setCropActionAvailability();
    }
  };
  const closeAfterCropDestination = (isCurrent) => {
    if (!isCurrent()) return;
    closeCrop(false);
    close();
  };
  overlay.querySelector("[data-unilib-crop-insert]").addEventListener("click", () => void runCropAction(async (exact, isCurrent) => {
    await insertMaterialized(exact.result, exact.materialized, getPartOptions(), { isCurrent });
    closeAfterCropDestination(isCurrent);
  }));
  overlay.querySelector("[data-unilib-crop-objectify]").addEventListener("click", () => void runCropAction(async (exact, isCurrent) => {
    if (typeof openObjectify !== "function") return;
    await openObjectify(exact.result, exact.materialized, { isCurrent });
    closeAfterCropDestination(isCurrent);
  }));
  overlay.querySelector("[data-unilib-crop-ai]").addEventListener("click", () => void runCropAction(async (exact, isCurrent) => {
    const reference = await rasterizeReference(materializedReference(exact.result, exact.materialized));
    if (!isCurrent()) return;
    if (referenceConsumer) {
      referenceConsumer.onAdd?.({ name: reference.name, data: reference.dataUrl, sourceKind: reference.sourceKind, source: reference.source });
      referenceConsumer.onStatus?.("라이브러리 참고 이미지 1개가 추가되었습니다.", "ok");
      referenceConsumer.onComplete?.();
      referenceConsumer = null;
    } else if (typeof openIndependentReferences === "function") {
      await openIndependentReferences({ references: [reference], startGeneration: false });
    } else await openAi?.({ references: [reference] });
    closeAfterCropDestination(isCurrent);
  }));
  overlay.querySelector("[data-unilib-crop-save-png]").addEventListener("click", () => void runCropAction(async (exact, isCurrent) => {
    const dataUrl = resultImage(exact.result, exact.materialized);
    const safeTitle = String(exact.result.title || "PDF-crop").replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "-").slice(0, 96);
    const nativeSave = globalThis.fiveEDesktop?.imageExport?.save;
    const outcome = await saveCropPng({
      dataUrl,
      suggestedName: `${safeTitle || "PDF-crop"}.png`,
      nativeSave: typeof nativeSave === "function" ? (input) => nativeSave(input) : null,
      requestDownload: (url, name) => {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = name;
        anchor.hidden = true;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
      },
    });
    if (!isCurrent()) return;
    if (outcome.kind === "saved") setStatus("PNG 이미지가 저장되었습니다.");
    else if (outcome.kind === "requested") setStatus("PNG 다운로드를 요청했습니다. 브라우저 다운로드에서 완료 여부를 확인하세요.");
    else if (outcome.kind === "canceled") setStatus("저장을 취소했습니다. 선택 영역은 그대로 유지됩니다.");
    else setStatus(`PNG 저장 실패: ${outcome.error}`, true);
  }));
  const cropPoint = (event) => {
    return normalizedCropPoint(event, cropCanvas.getBoundingClientRect());
  };
  cropStage.addEventListener("pointerdown", (event) => {
    if (!cropSessionIsCurrent(cropSession, selectedResult())) return;
    event.preventDefault();
    cropStage.setPointerCapture(event.pointerId);
    if (event.pointerType === "touch") {
      cropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (cropPointers.size === 2) {
        const [first, second] = [...cropPointers.values()];
        cropPinch = { distance: Math.hypot(second.x - first.x, second.y - first.y), zoom: cropZoom };
        cropGesture = null;
        return;
      }
    }
    cropGesture = { pointerId: event.pointerId, start: cropPoint(event), previous: draftCrop, drawing: false };
  });
  cropStage.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" && cropPointers.has(event.pointerId)) {
      cropPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (cropPinch && cropPointers.size >= 2) {
        event.preventDefault();
        const [first, second] = [...cropPointers.values()];
        const distance = Math.hypot(second.x - first.x, second.y - first.y);
        if (cropPinch.distance > 0) setCropZoom(cropPinch.zoom * distance / cropPinch.distance, (first.x + second.x) / 2, (first.y + second.y) / 2);
        return;
      }
    }
    if (!cropGesture || event.pointerId !== cropGesture.pointerId) return;
    if (!cropGesture.drawing) {
      cropGesture.drawing = true;
      cropPreviewEpoch += 1;
      cropPreviewExact = false;
      cropExact = null;
      draftCrop = null;
    }
    draftCrop = cropRectFromGesture(null, cropGesture.start, cropPoint(event), "draw");
    paintCrop();
  });
  cropStage.addEventListener("pointerup", (event) => {
    if (event.pointerType === "touch") {
      cropPointers.delete(event.pointerId);
      if (cropPinch) {
        if (cropPointers.size < 2) cropPinch = null;
        return;
      }
    }
    if (!cropGesture || event.pointerId !== cropGesture.pointerId) return;
    if (!cropGesture.drawing) {
      cropGesture = null;
      return;
    }
    draftCrop = cropRectFromGesture(null, cropGesture.start, cropPoint(event), "draw");
    cropGesture = null;
    paintCrop();
    if (!draftCrop) setStatus("자를 영역은 너비와 높이가 있어야 합니다.", true);
    else void paintExactCropPreview();
  });
  cropStage.addEventListener("pointercancel", (event) => {
    if (event.pointerType === "touch") {
      cropPointers.delete(event.pointerId);
      if (cropPinch) {
        if (cropPointers.size < 2) cropPinch = null;
        return;
      }
    }
    if (!cropGesture || event.pointerId !== cropGesture.pointerId) return;
    draftCrop = cropGesture.previous;
    cropGesture = null;
    paintCrop();
    if (draftCrop) void paintExactCropPreview();
  });
  cropStage.addEventListener("keydown", (event) => {
    if (!draftCrop || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    draftCrop = cropRectFromKeyboard(draftCrop, event.key, event.shiftKey);
    cropPreviewExact = false;
    cropExact = null;
    paintCrop();
    void paintExactCropPreview();
  });
  const lightbox = overlay.querySelector("[data-unilib-lightbox]");
  const closeLightbox = () => { lightbox.hidden = true; };
  overlay.querySelector("[data-unilib-lightbox-close]").addEventListener("click", closeLightbox);
  document.addEventListener("keydown", (event) => {
    if (overlay.hidden) return;
    if (event.key === "Escape") {
      if (!cropDialog.hidden) closeCrop();
      else if (!lightbox.hidden) closeLightbox();
      else if (!folderDialog.hidden) folderDialog.hidden = true;
      else if (root.classList.contains("folders-open") || root.classList.contains("preview-open")) closeDrawers();
      else close();
      return;
    }
    if (!cropDialog.hidden) return;
    if (["ArrowDown", "ArrowUp"].includes(event.key) && !editableTarget(event.target) && results.length) {
      event.preventDefault();
      invalidateAction();
      const current = Math.max(0, results.findIndex((item) => item.id === selectedId));
      const next = (current + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      selectedId = results[next].id;
      renderResults();
      void renderPreview();
      list.querySelector(`[data-result-id="${CSS.escape(selectedId)}"]`)?.focus();
    }
    if (shouldHandleLibrarySpace(event) && currentMaterialized) {
      event.preventDefault();
      const image = new Image();
      image.alt = selectedResult()?.title || "선택 자료";
      image.src = resultImage(selectedResult(), currentMaterialized);
      overlay.querySelector("[data-unilib-lightbox-stage]").replaceChildren(image);
      lightbox.hidden = false;
      overlay.querySelector("[data-unilib-lightbox-close]").focus();
    }
  }, true);
  let referenceConsumer = null;
  let focusSyncTimer = 0;
  const syncOnFocus = () => {
    if (overlay.hidden || !desktopLibrary) return;
    window.clearTimeout(focusSyncTimer);
    focusSyncTimer = window.setTimeout(() => void refreshDesktopSources(true).then(runSearch).catch((error) => {
      setStatus(`폴더 새로고침 실패: ${error instanceof Error ? error.message : error}`, true);
    }), 240);
  };
  window.addEventListener("focus", syncOnFocus);
  return Object.freeze({
    open, close, refresh: async () => { await renderSources(); await runSearch(); }, element: overlay,
    async beginReferenceSelection(consumer, trigger) {
      referenceConsumer = consumer;
      selectedIds.clear();
      await open(trigger);
      setStatus("추가할 자료를 체크하세요. 최대 10개까지 고를 수 있습니다.");
    },
  });
}

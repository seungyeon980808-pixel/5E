import { registerEscapeLayer } from "./escape-layers.js?v=1";
import { safeExternalSourceUrl } from "./library-import-policy.js";
import { queryHighlightTerms } from "./pdf-library/search.js";
import { chooseWorkbenchAssignment } from "./library/workbench-assignment.js";

const SOURCE_STORAGE_KEY = "5e.unified-library.sources.v1";
const TREE_STORAGE_KEY = "5e.unified-library.tree-expanded.v1";
const PANE_STORAGE_KEY = "5e.unified-library.search-pane-open.v1";
const LIBRARY_TYPES = Object.freeze(["question", "image", "pdf"]);
const DEFAULT_KINDS = Object.freeze(["crop", "image", "page"]);
const CONTINUOUS_PDF_PAGE_EXTENT = 760;
const CONTINUOUS_PDF_LIVE_LIMIT = 7;

export function continuousPdfWindow(pageCount, anchorPage, radius = 3) {
  const count = Math.max(0, Math.trunc(Number(pageCount) || 0));
  if (!count) return { start: 0, end: 0, pages: [] };
  const anchor = Math.max(1, Math.min(count, Math.trunc(Number(anchorPage) || 1)));
  const start = Math.max(1, anchor - radius);
  const end = Math.min(count, anchor + radius);
  return { start, end, pages: Array.from({ length: end - start + 1 }, (_, index) => start + index) };
}

export function createBoundedPageCache(limit = CONTINUOUS_PDF_LIVE_LIMIT) {
  const values = new Map();
  const bound = Math.max(1, Math.trunc(Number(limit) || 1));
  return Object.freeze({
    get size() { return values.size; },
    has(key) { return values.has(key); },
    get(key) {
      if (!values.has(key)) return undefined;
      const value = values.get(key);
      values.delete(key);
      values.set(key, value);
      return value;
    },
    set(key, value) {
      values.delete(key);
      values.set(key, value);
      while (values.size > bound) values.delete(values.keys().next().value);
      return value;
    },
    delete(key) { return values.delete(key); },
    clear() { values.clear(); },
  });
}

function pdfFilePageResult(result, pageNumber) {
  if (result?.kind !== "pdf" || !Number.isInteger(pageNumber)) return result;
  const match = result.matches?.find?.((item) => item.pageNumber === pageNumber);
  return {
    ...result,
    firstMatchingPage: pageNumber,
    matches: match ? [match] : [],
    metadata: { ...result.metadata, pageNumber },
    preview: match?.source ? { source: match.source } : result.preview,
    provenance: { ...result.provenance, ...(match?.source || {}), pageNumber },
  };
}

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

function resultCardTarget(target) {
  return Boolean(target?.closest?.("[data-result-id]"));
}

export function shouldHandleLibrarySpace(event) {
  return event?.key === " " && (!editableTarget(event.target) || resultCardTarget(event.target));
}

export function activePdfPageResult(result, matchIndex = 0) {
  if (result?.kind !== "pdf") return result;
  const matches = Array.isArray(result.matches) ? result.matches : [];
  const match = matches[matchIndex] ?? matches[0] ?? null;
  const pageNumber = match?.pageNumber ?? result.firstMatchingPage ?? result.provenance?.pageNumber;
  if (!Number.isInteger(pageNumber)) return result;
  return {
    ...result,
    metadata: { ...result.metadata, pageNumber },
    preview: match?.source ? { source: match.source } : result.preview,
    provenance: { ...result.provenance, ...(match?.source ?? {}), pageNumber },
  };
}

export function pdfResultsForDisplay(files, mode = "file") {
  if (mode !== "page") return files;
  return files.flatMap((file) => Array.isArray(file.matches) && file.matches.length ? file.matches.map((match) => ({
    ...file,
    id: `${file.id}:page:${match.pageNumber}`,
    firstMatchingPage: match.pageNumber,
    matches: [match],
    metadata: { ...file.metadata, pageNumber: match.pageNumber },
    preview: { source: match.source },
    provenance: { ...file.provenance, ...match.source, pageNumber: match.pageNumber },
    subtitle: `${file.title} · ${match.pageNumber}쪽`,
  })) : [file]);
}

export async function materializeLibraryThumbnail(result, activeProvider, pdfMode = "file") {
  if (result?.kind === "pdf" && typeof result.loadPreview === "function") {
    const pageNumber = pdfMode === "page"
      ? result.firstMatchingPage ?? result.matches?.[0]?.pageNumber ?? result.provenance?.pageNumber ?? 1
      : 1;
    return result.loadPreview(pageNumber, { thumbnail: true });
  }
  return activeProvider.materialize(result, { thumbnail: true });
}

export async function materializeOriginalLibraryPage(result, activeProvider) {
  const pageNumber = result?.provenance?.pageNumber;
  const materialized = result?.kind === "pdf" && typeof result.loadPreview === "function"
    ? await result.loadPreview(pageNumber, { original: true })
    : await activeProvider.materialize(result, { original: true });
  const renderedPage = materialized?.provenance?.pageNumber ?? materialized?.source?.pageNumber;
  if (Number.isInteger(renderedPage) && Number.isInteger(pageNumber) && renderedPage !== pageNumber) {
    throw new Error(`선택한 ${pageNumber}쪽과 렌더링된 ${renderedPage}쪽이 다릅니다.`);
  }
  return materialized;
}

export async function materializeLibraryAction(result, activeProvider, options = {}) {
  if (result?.kind !== "pdf") return activeProvider.materialize(result, options);
  const original = await materializeOriginalLibraryPage(result, activeProvider);
  if (options.representation !== "manual" || !result.variants?.manual?.source) return original;
  const page = activeProvider.search({ kinds: ["page"], limit: Number.MAX_SAFE_INTEGER }).find(candidate => candidate.provenance?.documentId === result.provenance?.documentId && candidate.provenance?.pageNumber === result.provenance?.pageNumber);
  if (!page) throw new Error("원문 페이지 정보를 확인할 수 없습니다.");
  return activeProvider.materialize(withManualCropVariant(page, result.variants.manual.source), options);
}

export function kindsForResultTab(tab) {
  if (tab === "question") return ["crop"];
  if (tab === "image") return ["image"];
  if (tab === "pdf") return ["page"];
  return [...DEFAULT_KINDS];
}

export function normalizeLibraryTypes(types) {
  const requested = new Set(Array.isArray(types) ? types : []);
  if (!requested.size || requested.has("all")) return [...LIBRARY_TYPES];
  const normalized = LIBRARY_TYPES.filter((type) => requested.has(type));
  return normalized.length ? normalized : [...LIBRARY_TYPES];
}

export function toggleLibraryType(types, toggled) {
  if (toggled === "all") return [...LIBRARY_TYPES];
  return LIBRARY_TYPES.includes(toggled) ? [toggled] : normalizeLibraryTypes(types);
}

export function normalizeYearRange(start, end, availableYears) {
  const years = [...new Set((availableYears || []).map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!years.length || (start === "" && end === "")) return { start: null, end: null };
  const minimum = years[0];
  const maximum = years.at(-1);
  const first = Math.min(maximum, Math.max(minimum, Number(start) || minimum));
  const last = Math.min(maximum, Math.max(minimum, Number(end) || maximum));
  return { start: Math.min(first, last), end: Math.max(first, last) };
}

export function createSearchScheduler(run, { delay = 140, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let composing = false;
  let timer = null;
  const cancel = () => { if (timer != null) clearTimer(timer); timer = null; };
  const schedule = () => {
    if (composing) return;
    cancel();
    timer = setTimer(() => { timer = null; run("input"); }, delay);
  };
  return Object.freeze({ input: schedule, compositionStart() { composing = true; cancel(); }, compositionEnd() { composing = false; schedule(); }, enter() { composing = false; cancel(); return run("enter"); }, cancel });
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
    && (snapshot?.activePage ?? null) === (state?.activePage ?? null)
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

export function acceptedCropResult(result, rect, ordinal) {
  const source = {
    documentId: result?.provenance?.documentId,
    pageNumber: result?.provenance?.pageNumber,
    rect: [...rect],
    fullPageFallback: false,
  };
  return {
    ...withManualCropVariant(result, source),
    id: `${result.id}:manual:${ordinal}`,
    title: `${result.title || "PDF"} · 자른 영역 ${ordinal}`,
    kind: "crop",
    cropType: "manual",
    provenance: { ...(result.provenance || {}), ...source },
  };
}

export function workbenchReferenceGroups(references, assignment) {
  if (!Array.isArray(references) || !assignment || !Array.isArray(assignment.groups)) return [];
  return assignment.groups.map((indices) => {
    if (!Array.isArray(indices) || indices.length === 0) throw new Error("AI 작업대 그룹이 비어 있습니다.");
    if (new Set(indices).size !== indices.length) throw new Error("같은 AI 작업대에 동일한 자료가 중복되었습니다.");
    const grouped = indices.map((index) => {
      if (!Number.isInteger(index) || index < 0 || index >= references.length) throw new Error("AI 작업대 그룹에 올바르지 않은 자료 번호가 있습니다.");
      return references[index];
    });
    return { references: grouped, placement: grouped.length > 1 ? "together" : "separate" };
  });
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
    && snapshot?.resultIdentity === state?.resultIdentity
    && snapshot?.currentResultIdentity === state?.currentResultIdentity
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
    && session.pageNumber === source.pageNumber
    && session.resultIdentity === libraryResultIdentity(result));
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
  return ({ crop: "문항", image: "이미지", page: "PDF", pdf: "PDF" })[kind] || "자료";
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
        <div class="unilib-brand"><h2 id="unilib-title">라이브러리</h2></div>
        <div class="unilib-header-actions">
          <button type="button" class="unilib-icon-button" data-unilib-close aria-label="라이브러리 닫기">${ICONS.close}</button>
        </div>
      </header>
      <div class="unilib-shell">
        <aside class="unilib-pane unilib-folders" aria-label="검색 위치">
          <div class="unilib-pane-head"><h3>검색 위치</h3><button type="button" class="unilib-icon-button" data-unilib-pane-collapse aria-label="검색 위치 접기">${ICONS.chevron}</button><button type="button" class="unilib-icon-button unilib-mobile-only" data-unilib-folders-close aria-label="검색 위치 닫기">${ICONS.close}</button></div>
          <div class="unilib-folder-scroll"><p><strong>제공 자료</strong>는 앱이 정리한 가상 분류입니다. <strong>내 자료</strong>에는 가져온 파일과 설치형 앱에서 직접 연결한 폴더가 표시됩니다.</p><ul class="unilib-tree" data-unilib-tree></ul></div>
        </aside>
        <section class="unilib-pane unilib-results" aria-label="라이브러리 검색 결과">
          <div class="unilib-search-tools library-toolbar">
            <div class="unilib-search-row library-search-row">
              <button type="button" class="unilib-location-summary" data-unilib-folders-open aria-label="검색 위치 열기">${ICONS.folder}<span data-unilib-location-summary>검색 위치</span></button>
              <label class="unilib-search library-search">${ICONS.search}<input data-unilib-query type="search" autocomplete="off" spellcheck="false" aria-label="라이브러리 통합 검색" placeholder="문항 코드, PDF 본문, 이미지 파일명 검색"><button type="button" data-unilib-clear aria-label="검색어 지우기">×</button></label>
              <strong class="unilib-result-count library-result-count" data-unilib-count>0개</strong>
              <details class="unilib-help library-help" data-unilib-help><summary aria-label="검색 도움말">?</summary><p>여러 단어는 같은 페이지에 모두 있는 자료를 찾습니다. 결과 종류는 하나씩 선택하며, 전체는 문항·이미지·PDF를 모두 포함합니다.</p></details>
              <button type="button" class="unilib-icon-button" data-unilib-preview-toggle aria-pressed="true" aria-label="미리보기 열기">${ICONS.file}</button>
            </div>
            <div class="unilib-filter-row library-filter-row">
              <div class="unilib-tabs library-kind-toggle" role="group" aria-label="결과 종류">
                <button type="button" data-unilib-type="all" aria-pressed="true">전체</button>
                <button type="button" data-unilib-type="question" aria-pressed="false">문항</button>
                <button type="button" data-unilib-type="image" aria-pressed="false">이미지</button>
                <button type="button" data-unilib-type="pdf" aria-pressed="false">PDF</button>
              </div>
              <div class="unilib-pdf-display library-scope-toggle" data-unilib-pdf-display hidden role="group" aria-label="PDF 표시 방식"><button type="button" data-unilib-pdf-mode="file" aria-pressed="true">파일</button><button type="button" data-unilib-pdf-mode="page" aria-pressed="false">페이지</button></div>
            </div>
            <div class="unilib-exam-filters" data-unilib-exam-filters hidden>
              <select data-unilib-filter="subject" aria-label="과목"><option value="">모든 과목</option><option value="p1">물리학Ⅰ</option><option value="p2">물리학Ⅱ</option><option value="c1">화학Ⅰ</option><option value="c2">화학Ⅱ</option><option value="b1">생명과학Ⅰ</option><option value="b2">생명과학Ⅱ</option><option value="e1">지구과학Ⅰ</option><option value="e2">지구과학Ⅱ</option></select>
              <span class="unilib-year-range" aria-label="학년도 범위"><select data-unilib-year-start aria-label="시작 학년도"><option value="">시작</option></select><span>–</span><select data-unilib-year-end aria-label="끝 학년도"><option value="">끝</option></select></span>
              <select data-unilib-filter="administration" aria-label="시험"><option value="">모든 시험</option><option value="06">6월 모의평가</option><option value="09">9월 모의평가</option><option value="11">수능</option></select>
            </div>
          </div>
          <div class="unilib-selection-summary library-selected-tray is-empty" data-unilib-selected-tray aria-label="선택한 자료"><strong data-unilib-selected-count>선택 0개</strong><span data-unilib-selected-items></span><button type="button" data-unilib-selected-clear disabled>모두 해제</button></div>
          <div class="unilib-result-scroll"><ul class="unilib-result-list library-card-grid" data-unilib-results role="listbox"></ul></div>
        </section>
        <aside class="unilib-pane unilib-preview library-reader" data-unilib-preview aria-label="선택 자료 미리보기">
          <div class="unilib-pane-head"><div><h3 data-unilib-preview-title>미리보기</h3><p data-unilib-preview-kind>자료를 선택하세요</p><span class="unilib-example-note" data-unilib-preview-example hidden>목업 · 예시 자료</span></div></div>
          <div class="unilib-preview-scroll library-reader-main"><div class="unilib-representations" data-unilib-representations hidden role="group" aria-label="문항 표시 범위"></div><nav class="unilib-match-nav" data-unilib-match-nav hidden aria-label="PDF 일치 페이지"><button type="button" data-unilib-match-prev>이전 일치</button><output data-unilib-match-position></output><button type="button" data-unilib-match-next>다음 일치</button></nav><details class="unilib-highlight-legend" data-unilib-highlight-legend hidden><summary>검색어 강조</summary><ul></ul></details><div class="unilib-stage library-reader-preview" data-unilib-stage><span>검색 결과를 선택하세요.</span></div><div class="unilib-match-context" data-unilib-match-context hidden></div><div class="unilib-part-options" data-unilib-part-options hidden></div></div>
          <div class="unilib-preview-foot library-reader-actions"><div class="unilib-source">${ICONS.file}<div><strong data-unilib-source-name>—</strong><span data-unilib-source-meta>—</span></div><div class="unilib-source-actions"><button type="button" data-unilib-source-open>원문 페이지</button><button type="button" data-unilib-adjust hidden>PDF에서 자르기</button></div></div><div class="unilib-actions"><button type="button" class="unilib-primary" data-unilib-insert disabled>캔버스에 삽입</button><button type="button" class="unilib-button" data-unilib-objectify disabled>이미지 객체화</button><button type="button" class="unilib-button" data-unilib-ai disabled>AI 작업에 추가</button></div></div>
        </aside>
        <button class="unilib-scrim" data-unilib-scrim type="button" aria-label="열린 패널 닫기"></button>
      </div>
      <div class="unilib-crop library-reader--expanded" data-unilib-crop hidden role="dialog" aria-modal="true" aria-labelledby="unilib-crop-title"><header><strong id="unilib-crop-title">확대 미리보기 · 영역 선택</strong><div class="unilib-crop-view-controls"><button type="button" class="unilib-button" data-unilib-crop-fit>내용 맞춤</button><output data-unilib-crop-zoom aria-label="확대 비율">100%</output></div><button type="button" class="unilib-button" data-unilib-crop-cancel>닫기</button><button type="button" class="unilib-primary unilib-crop-confirmation" data-unilib-crop-save disabled>선택 추가</button></header><div class="unilib-crop-workspace library-reader-main"><div class="unilib-crop-stage library-reader-preview" data-unilib-crop-stage tabindex="0" aria-label="PDF 페이지에서 자를 영역 선택"><div class="unilib-crop-canvas" data-unilib-crop-canvas><img data-unilib-crop-image draggable="false" alt="자를 원문 PDF 페이지"><div class="unilib-crop-draft" data-unilib-crop-box aria-hidden="true"></div></div></div><aside class="unilib-crop-preview library-reader-sidebar"><strong>현재 선택</strong><canvas data-unilib-crop-preview aria-label="현재 선택 영역 미리보기"></canvas><div class="unilib-crop-collection library-crop-collection" data-unilib-crop-collection aria-label="추가한 자르기 영역"></div><div class="unilib-crop-actions library-reader-actions" aria-label="선택 영역 보내기"><button type="button" class="unilib-primary" data-unilib-crop-insert disabled>캔버스에 삽입</button><button type="button" class="unilib-button" data-unilib-crop-objectify disabled>이미지 객체화</button><button type="button" class="unilib-button" data-unilib-crop-ai disabled>AI 작업에 추가</button><button type="button" class="unilib-button" data-unilib-crop-save-png disabled>PNG 저장</button></div><details class="unilib-crop-help"><summary>조작 도움말</summary><p>드래그한 뒤 Enter로 영역을 추가합니다. 계속 드래그해 여러 영역을 모으고, 선택 대기 영역이 없을 때 Enter를 누르면 끝냅니다.</p></details></aside></div></div>
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
  const previewCache = new Map();
  const continuousPageCache = createBoundedPageCache();
  let results = [];
  let selectedId = null;
  const selectedIds = new Set();
  const selectedRecords = new Map();
  let activeTypes = [...LIBRARY_TYPES];
  let pdfDisplayMode = "file";
  const examFilters = { subject: "", startYear: null, endYear: null, administration: "" };
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
  let searchController = null;
  let requestSequence = 0;
  let pdfMatchIndex = 0;
  let previewEpoch = 0;
  let continuousView = null;
  let thumbnailEpoch = 0;
  let thumbnailQueue = Promise.resolve();
  let thumbnailObserver = null;
  let currentMaterialized = null;
  let currentMaterializedIdentity = null;
  let returnFocus = null;
  let lastInteractionWasKeyboard = false;
  let desktopConnections = [];
  let desktopWarnings = [];
  let pendingIndexCount = 0;
  let actionBusy = false;
  let actionRevision = 0;
  let draftCrop = null;
  let cropGesture = null;
  let cropSession = null;
  let cropPreviewEpoch = 0;
  let cropPreviewExact = false;
  let cropExact = null;
  let cropActionBusy = false;
  let acceptedCrops = [];
  let cropSequence = 0;
  let cropZoom = 1;
  let cropBaseScale = 1;
  let cropFitBounds = [0, 0, 1, 1];
  let cropReturnFocus = null;
  const cropPointers = new Map();
  let cropPinch = null;

  overlay.addEventListener("pointerdown", () => { lastInteractionWasKeyboard = false; }, true);
  overlay.addEventListener("keydown", () => { lastInteractionWasKeyboard = true; }, true);

  const selectedResult = () => results.find((result) => result.id === selectedId) || null;
  const selectedActiveResult = () => {
    const result = selectedResult();
    return continuousView?.resultId === result?.id
      ? pdfFilePageResult(result, continuousView.visiblePage)
      : activePdfPageResult(result, pdfMatchIndex);
  };
  const selectedVariantResult = () => resultForRepresentation(selectedResult(), activeRepresentation);
  const actionButtons = () => [...overlay.querySelectorAll("[data-unilib-insert],[data-unilib-objectify],[data-unilib-ai]")];
  const selectionKey = () => [...selectedIds].sort().join("\u0000");
  const invalidateAction = () => { actionRevision += 1; };
  const activePageNumber = () => continuousView?.resultId === selectedId ? continuousView.visiblePage : null;
  const snapshotAction = () => Object.freeze({ selectedId, selectedIdsKey: selectionKey(), representation: activeRepresentation, selectedFigure: activeFigureRepresentation, activePage: activePageNumber(), revision: actionRevision, options: Object.freeze(getPartOptions()), open: !overlay.hidden });
  const actionIsCurrent = (snapshot) => libraryActionSnapshotIsCurrent(snapshot, { selectedId, selectedIdsKey: selectionKey(), representation: activeRepresentation, selectedFigure: activeFigureRepresentation, activePage: activePageNumber(), revision: actionRevision, open: !overlay.hidden });
  const resultForActionSnapshot = (snapshot) => {
    const result = results.find((item) => item.id === snapshot.selectedId);
    return Number.isInteger(snapshot.activePage) ? pdfFilePageResult(result, snapshot.activePage) : result;
  };
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
  const followBackgroundIndexing = (snapshot) => {
    if (!snapshot?.backgroundIndexing || typeof snapshot.backgroundIndexing.then !== "function") return;
    void snapshot.backgroundIndexing.then(async () => {
      if (overlay.hidden) return;
      await refreshDesktopSources(false);
      await runSearch();
    }).catch((error) => {
      if (!overlay.hidden) setStatus(`백그라운드 색인 실패: ${error instanceof Error ? error.message : error}`, true);
    });
  };

  async function provider() { return getProvider(); }

  async function renderSources() {
    const activeProvider = await provider();
    const sources = activeProvider.getSources();
    const yearStart = overlay.querySelector("[data-unilib-year-start]");
    const yearEnd = overlay.querySelector("[data-unilib-year-end]");
    const filterOptions = activeProvider.getExamFilterOptions?.();
    const years = filterOptions?.academicYears
      ?? [...new Set((activeProvider.search({ query: "", kinds: ["crop"], limit: 500 }) ?? []).map((result) => result.metadata?.academicYear).filter(Number.isInteger))].sort((a, b) => b - a);
    const selectedStart = yearStart.value;
    const selectedEnd = yearEnd.value;
    yearStart.replaceChildren(new Option("시작", ""), ...years.map((year) => new Option(`${year}`, String(year))));
    yearEnd.replaceChildren(new Option("끝", ""), ...years.map((year) => new Option(`${year}`, String(year))));
    yearStart.value = years.includes(Number(selectedStart)) ? selectedStart : "";
    yearEnd.value = years.includes(Number(selectedEnd)) ? selectedEnd : "";
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
      const tooltip = counts ? `${name} · 하위 폴더 포함 PDF ${counts.pdf}개 · 이미지 ${counts.image}개` : name;
      text.title = tooltip;
      label.title = tooltip;
      row.title = tooltip;
      label.append(check, icon, text);
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
    const desktopRootNames = new Set();
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
        desktopRootNames.add(projected.name);
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
      if (source.origin === "local" && desktopRootNames.has(source.label)) continue;
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
    searchController?.abort();
    searchController = new AbortController();
    const requestId = `unilib-${++requestSequence}`;
    const activeProvider = await provider();
    if (!enabledSources) await renderSources();
    const queryText = query.value.trim();
    const pageDisplayActive = pdfDisplayMode === "page" && activeTypes.length === 1 && activeTypes[0] === "pdf";
    const filters = Object.fromEntries(Object.entries(examFilters).filter(([, value]) => value !== "" && value != null));
    const options = { query: queryText, sourceIds: [...enabledSources], filters, limit: 500, requestId, signal: searchController.signal };
    const pageInventoryOptions = { query: queryText, sourceIds: [...enabledSources], filters, requestId, signal: searchController.signal };
    setStatus("라이브러리를 검색하는 중…");
    try {
      const kinds = [...(activeTypes.includes("question") ? ["crop"] : []), ...(activeTypes.includes("image") ? ["image"] : [])];
      const regularPromise = kinds.length
        ? (typeof activeProvider.searchAsync === "function" ? activeProvider.searchAsync({ ...options, kinds, limit: 60 }) : activeProvider.search({ ...options, kinds, limit: 60 }))
        : [];
      const pdfPromise = activeTypes.includes("pdf")
        ? (queryText && typeof activeProvider.searchPdfFiles === "function" ? activeProvider.searchPdfFiles(options) : pageDisplayActive ? activeProvider.listPdfPages?.(pageInventoryOptions) ?? [] : activeProvider.listPdfFiles?.(options) ?? [])
        : [];
      const [regular, pdfFiles] = await Promise.all([regularPromise, pdfPromise]);
      const displayedPdf = pageDisplayActive && queryText ? pdfResultsForDisplay(pdfFiles, "page") : pdfFiles;
      const normalizedPdf = Array.isArray(displayedPdf) ? displayedPdf.map((file) => pageDisplayActive && !queryText && file.kind === "page" ? file : ({
        ...file,
        id: file.id || `pdf:${file.documentId}`,
        kind: "pdf",
        sourceLabel: file.subtitle || "PDF",
        provenance: { ...(file.provenance || {}), provider: "pdf", documentId: file.documentId, pageNumber: file.firstMatchingPage || file.provenance?.pageNumber || 1 },
      })) : [];
      const found = [...(Array.isArray(regular) ? regular : []), ...normalizedPdf];
      if (ownEpoch !== searchEpoch || overlay.hidden) return;
      results = Array.isArray(found) ? found : [];
      selectedId = reconcileUnifiedSelection(selectedId, results);
      renderResults();
      const pending = pendingIndexCount ? ` · 내 PDF ${pendingIndexCount}개 색인 중` : "";
      setStatus(results.length ? `${results.length}개 결과${pending}` : pendingIndexCount ? `내 PDF ${pendingIndexCount}개를 색인하는 중입니다.` : "검색 결과가 없습니다.");
      void renderPreview();
    } catch (error) {
      if (error?.name !== "AbortError" && ownEpoch === searchEpoch) setStatus(`검색 실패: ${error instanceof Error ? error.message : error}`, true);
    }
  }

  function updateResultSelection() {
    list.querySelectorAll("[data-result-id]").forEach((card) => card.setAttribute("aria-selected", String(card.dataset.resultId === selectedId)));
    list.querySelectorAll("[data-select-result]").forEach((check) => { check.checked = selectedIds.has(check.dataset.selectResult); });
    renderSelectedTray();
  }

  function renderResults() {
    const ownThumbnailEpoch = ++thumbnailEpoch;
    thumbnailObserver?.disconnect();
    thumbnailObserver = null;
    const visibleResults = results;
    root.dataset.activeTab = activeTypes.length === LIBRARY_TYPES.length ? "all" : activeTypes.join("-");
    root.dataset.pdfDisplay = activeTypes.length === 1 && activeTypes[0] === "pdf" ? pdfDisplayMode : "file";
    overlay.querySelector("[data-unilib-count]").textContent = `${visibleResults.length}개`;
    renderSelectedTray();
    const pendingThumbnails = [];
    const thumbnailPdfMode = activeTypes.length === 1 && activeTypes[0] === "pdf" ? pdfDisplayMode : "file";
    const loadThumbnail = (result, media) => {
      thumbnailQueue = thumbnailQueue.then(async () => {
        if (ownThumbnailEpoch !== thumbnailEpoch || !media.isConnected) return;
        const materialized = await materializeLibraryThumbnail(result, await provider(), thumbnailPdfMode);
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
      button.className = "unilib-result-card library-card";
      button.dataset.resultId = result.id;
      button.dataset.resultKind = result.kind;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(result.id === selectedId));
      const preview = resultImage(result, null);
      const media = document.createElement("span");
      media.className = "unilib-thumb library-card-thumb";
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
      copy.className = "unilib-result-copy unilib-card-meta library-card-meta";
      const badge = document.createElement("span");
      badge.className = `unilib-badge unilib-card-type library-card-type is-${result.kind}`;
      badge.textContent = labelForKind(result.kind);
      const disclosure = document.createElement("span");
      disclosure.className = "unilib-example-note";
      disclosure.textContent = "목업 · 예시 자료";
      disclosure.hidden = !isExampleLibraryResult(result);
      const title = document.createElement("strong");
      title.className = "library-card-name";
      title.textContent = result.title;
      const sourceText = resultSourceText(result);
      const pageText = result.provenance?.pageNumber ? `${result.provenance.pageNumber}쪽` : "";
      title.title = sourceText.includes(result.title) ? sourceText : `${result.title} · ${sourceText}`;
      if (pageText && !title.title.includes(pageText)) title.title += ` · ${pageText}`;
      const meta = document.createElement("small");
      meta.className = "library-card-page";
      const compactPdfPage = pdfDisplayMode === "page" && activeTypes.length === 1 && activeTypes[0] === "pdf" && result.provenance?.provider === "pdf";
      meta.textContent = compactPdfPage ? `${result.provenance.pageNumber}쪽` : resultSourceText(result);
      meta.title = meta.textContent;
      copy.append(badge, disclosure, title, meta);
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
    tray.classList.toggle("is-empty", records.length === 0);
    overlay.querySelector("[data-unilib-selected-count]").textContent = `선택 ${records.length}개`;
    overlay.querySelector("[data-unilib-selected-clear]").disabled = records.length === 0;
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
    overlay.querySelector("[data-unilib-ai]").textContent = records.length > 1 ? `선택 ${records.length}개 AI 작업에 추가` : "AI 작업에 추가";
    updateAiActionAvailability();
  }

  async function loadContinuousPage(session, result, pageNumber, frame) {
    const cacheKey = `${result.provenance?.documentId || result.id}:${result.revision || ""}:${pageNumber}`;
    try {
      let pending = continuousPageCache.get(cacheKey);
      if (!pending) {
        pending = Promise.resolve().then(() => result.loadPreview(pageNumber, { original: true, continuous: true }));
        continuousPageCache.set(cacheKey, pending);
      }
      const materialized = await pending;
      if (continuousView !== session || !frame.isConnected) return;
      const renderedPage = materialized?.provenance?.pageNumber ?? materialized?.source?.pageNumber;
      if (Number.isInteger(renderedPage) && renderedPage !== pageNumber) throw new Error(`${pageNumber}쪽 원본이 아닌 ${renderedPage}쪽을 받았습니다.`);
      const src = resultImage(pdfFilePageResult(result, pageNumber), materialized);
      if (!src) throw new Error("원본 페이지 이미지가 없습니다.");
      const image = new Image();
      image.alt = `${result.title} ${pageNumber}쪽`;
      image.src = src;
      await image.decode();
      if (continuousView !== session || !frame.isConnected) return;
      frame.dataset.pageState = "ready";
      frame.replaceChildren(image);
    } catch (error) {
      if (continuousView !== session || !frame.isConnected) return;
      continuousPageCache.delete(cacheKey);
      const message = document.createElement("span");
      message.textContent = `${pageNumber}쪽을 불러오지 못했습니다.`;
      const retryButton = document.createElement("button");
      retryButton.type = "button";
      retryButton.textContent = "다시 시도";
      retryButton.addEventListener("click", () => {
        continuousPageCache.clear();
        frame.dataset.pageState = "loading";
        frame.replaceChildren(`${pageNumber}쪽 불러오는 중…`);
        void loadContinuousPage(session, result, pageNumber, frame);
      });
      frame.dataset.pageState = "error";
      frame.replaceChildren(message, retryButton);
    }
  }

  function paintContinuousWindow(session, result, anchorPage) {
    if (continuousView !== session) return;
    const next = continuousPdfWindow(session.pageCount, anchorPage);
    if (session.start === next.start && session.end === next.end) return;
    session.start = next.start;
    session.end = next.end;
    session.visiblePage = Math.max(1, Math.min(session.pageCount, anchorPage));
    session.before.style.height = `${(next.start - 1) * CONTINUOUS_PDF_PAGE_EXTENT}px`;
    session.after.style.height = `${Math.max(0, session.pageCount - next.end) * CONTINUOUS_PDF_PAGE_EXTENT}px`;
    const activePages = new Set(next.pages);
    for (const [pageNumber, page] of session.pages) {
      if (!activePages.has(pageNumber)) {
        page.remove();
        session.pages.delete(pageNumber);
      }
    }
    for (const pageNumber of next.pages) {
      let page = session.pages.get(pageNumber);
      if (!page) {
        page = document.createElement("figure");
        page.className = "unilib-pdf-page";
        page.dataset.pdfPage = String(pageNumber);
        const caption = document.createElement("figcaption");
        caption.textContent = `${pageNumber} / ${session.pageCount}쪽`;
        const frame = document.createElement("div");
        frame.className = "unilib-pdf-page-frame";
        frame.dataset.pageState = "loading";
        frame.textContent = `${pageNumber}쪽 불러오는 중…`;
        page.append(caption, frame);
        session.pages.set(pageNumber, page);
        void loadContinuousPage(session, result, pageNumber, frame);
      }
      session.content.insertBefore(page, session.after);
    }
    stage.dataset.visiblePdfPage = String(session.visiblePage);
    stage.removeAttribute("aria-busy");
  }

  function renderContinuousPdf(result) {
    const pageCount = Math.max(1, Number(result.pageCount) || 1);
    const initialPage = Math.max(1, Math.min(pageCount, Number(result.firstMatchingPage || result.provenance?.pageNumber) || 1));
    const content = document.createElement("div");
    content.className = "unilib-pdf-continuous-content";
    const before = document.createElement("div");
    before.className = "unilib-pdf-spacer";
    const after = document.createElement("div");
    after.className = "unilib-pdf-spacer";
    content.append(before, after);
    const session = { resultId: result.id, pageCount, visiblePage: initialPage, start: 0, end: 0, content, before, after, pages: new Map() };
    continuousView = session;
    stage.classList.add("is-continuous-pdf");
    stage.setAttribute("aria-label", `${result.title} 전체 PDF ${pageCount}쪽`);
    stage.replaceChildren(content);
    paintContinuousWindow(session, result, initialPage);
    stage.scrollTop = (initialPage - 1) * CONTINUOUS_PDF_PAGE_EXTENT;
  }

  async function renderPreview(retry = 0) {
    const ownEpoch = ++previewEpoch;
    let result = selectedResult();
    continuousView = null;
    stage.classList.remove("is-continuous-pdf");
    stage.removeAttribute("data-visible-pdf-page");
    stage.querySelector(".unilib-preview-loading")?.remove();
    if (result) {
      const loading = document.createElement("div");
      loading.className = "unilib-preview-loading";
      loading.setAttribute("role", "status");
      loading.textContent = "불러오는 중…";
      stage.append(loading);
      stage.setAttribute("aria-busy", "true");
    }
    const pdfMatches = result?.kind === "pdf" && Array.isArray(result.matches) ? result.matches : [];
    if (pdfMatchIndex >= pdfMatches.length) pdfMatchIndex = 0;
    const activePdfMatch = pdfMatches[pdfMatchIndex] || null;
    const matchNav = overlay.querySelector("[data-unilib-match-nav]");
    matchNav.hidden = pdfMatches.length < 2;
    overlay.querySelector("[data-unilib-match-position]").textContent = pdfMatches.length ? `${pdfMatchIndex + 1} / ${pdfMatches.length} · ${activePdfMatch.pageNumber}쪽` : "";
    const continuousPdf = result?.kind === "pdf" && pdfDisplayMode === "file" && activeTypes.length === 1 && activeTypes[0] === "pdf" && typeof result.loadPreview === "function";
    if (continuousPdf) {
      overlay.querySelector("[data-unilib-preview-title]").textContent = result.title || "PDF 전체 보기";
      overlay.querySelector("[data-unilib-preview-kind]").textContent = `전체 문서 · ${result.pageCount || 1}쪽`;
      overlay.querySelector("[data-unilib-preview-example]").hidden = !isExampleLibraryResult(result);
      overlay.querySelector("[data-unilib-representations]").hidden = true;
      overlay.querySelector("[data-unilib-highlight-legend]").hidden = true;
      overlay.querySelector("[data-unilib-match-context]").hidden = true;
      partOptionsHost.hidden = true;
      currentMaterialized = null;
      currentMaterializedIdentity = null;
      overlay.querySelector("[data-unilib-source-name]").textContent = result.sourceLabel || "PDF";
      overlay.querySelector("[data-unilib-source-meta]").textContent = resultSourceText(result);
      overlay.querySelector("[data-unilib-insert]").disabled = actionBusy;
      overlay.querySelector("[data-unilib-objectify]").disabled = actionBusy || typeof openObjectify !== "function";
      overlay.querySelector("[data-unilib-adjust]").hidden = false;
      const sourceOpen = overlay.querySelector("[data-unilib-source-open]");
      sourceOpen.textContent = "원문 페이지";
      sourceOpen.hidden = false;
      updateAiActionAvailability();
      renderContinuousPdf(result);
      return;
    }
    result = activePdfPageResult(result, pdfMatchIndex);
    if (activePdfMatch) result = { ...result, matchContext: activePdfMatch, highlights: activePdfMatch.highlights };
    if (result?.provenance?.provider === "pdf" && pdfUi?.resolveResult) {
      const requestIdentity = libraryResultIdentity(result);
      const resolution = await resolveLibraryPreviewResult(
        result,
        (value) => pdfUi.resolveResult(value),
        () => ownEpoch === previewEpoch && requestIdentity === libraryResultIdentity(activePdfPageResult(selectedResult(), pdfMatchIndex)),
      );
      if (resolution.status === "stale") return;
      if (resolution.status === "failed") {
        stage.removeAttribute("aria-busy");
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
    currentMaterializedIdentity = null;
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
    if (!result) { stage.textContent = "검색 결과를 선택하세요."; stage.removeAttribute("aria-busy"); return; }
    try {
      const activeProvider = await provider();
      const cacheKey = JSON.stringify([libraryResultIdentity(materializeResult), materializeResult.provenance?.rect, result.revision ?? activeProvider.revision, activeRepresentation, getPartOptions()]);
      let pending = previewCache.get(cacheKey);
      if (!pending) {
        pending = result.kind === "pdf" && typeof result.loadPreview === "function"
          ? result.loadPreview(activePdfMatch?.pageNumber || result.firstMatchingPage || 1)
          : activeProvider.materialize(materializeResult, { ...getPartOptions(), preview: true, representation: materializationRepresentation(result, activeRepresentation) });
        previewCache.set(cacheKey, pending);
        pending.catch(() => { if (previewCache.get(cacheKey) === pending) previewCache.delete(cacheKey); });
        if (previewCache.size > 24) previewCache.delete(previewCache.keys().next().value);
      }
      const materialized = await pending;
      if (ownEpoch !== previewEpoch || result.id !== selectedId) return;
      currentMaterialized = materialized;
      currentMaterializedIdentity = libraryResultIdentity(result);
      const src = resultImage(result, materialized);
      if (src) {
        const frame = document.createElement("div");
        frame.className = "unilib-preview-image";
        const image = new Image();
        image.alt = result.title;
        image.src = src;
        await image.decode();
        if (ownEpoch !== previewEpoch || result.id !== selectedId) return;
        frame.append(image);
        const previewCrop = materializeResult.provenance?.rect ?? [0, 0, 1, 1];
        paintHighlightLayer(frame, image, result, previewCrop);
        if (activeRepresentation === "full") paintFigureChoiceLayer(frame, image, figureChoicesForResult(result, activeFigureRepresentation), (representation) => {
          invalidateAction();
          activeFigureRepresentation = representation;
          void renderPreview();
        });
        stage.replaceChildren(frame);
        stage.removeAttribute("aria-busy");
      } else { stage.removeAttribute("aria-busy"); stage.textContent = "미리보기를 표시할 수 없습니다."; }
    } catch (error) {
      if (ownEpoch !== previewEpoch) return;
      if (retry < 1 && /superseded/iu.test(String(error?.message || error))) {
        await renderPreview(retry + 1);
        return;
      }
      stage.removeAttribute("aria-busy");
      stage.textContent = `미리보기 실패: ${error instanceof Error ? error.message : error}`;
    }
  }

  async function refreshDesktopSources(sync = false) {
    if (!desktopLibrary) return;
    let snapshot;
    if (sync && pdfUi?.syncDesktopConnections) {
      snapshot = await pdfUi.syncDesktopConnections();
      onDesktopSnapshot?.(snapshot);
      desktopWarnings = snapshot?.warnings || [];
      pendingIndexCount = (snapshot?.documents || []).filter((record) => ["reading", "unindexed", "indexing"].includes(record.indexState?.state)).length;
      followBackgroundIndexing(snapshot);
    } else {
      snapshot = await desktopLibrary.connections();
      desktopWarnings = [];
    }
    desktopConnections = snapshot?.connections || [];
    if (desktopWarnings.length) setStatus(`${desktopWarnings.length}개 파일을 안전 제한으로 건너뛰었습니다. 파일 크기를 확인하세요.`, true);
    await renderSources();
  }

  function closeDrawers() { root.classList.remove("folders-open", "preview-open"); }
  function closeExpandedReader() {
    root.classList.remove("is-reader-expanded");
    overlay.querySelector("[data-unilib-preview]").classList.remove("library-reader--expanded");
  }
  function close({ restoreFocus = true, keyboard = lastInteractionWasKeyboard } = {}) {
    if (overlay.hidden) return;
    invalidateAction();
    cancelPlacementChoice?.();
    cancelSpacePress?.();
    searchEpoch += 1;
    searchController?.abort();
    searchScheduler.cancel();
    previewEpoch += 1;
    thumbnailEpoch += 1;
    thumbnailObserver?.disconnect();
    thumbnailObserver = null;
    pdfUi?.deactivate?.();
    overlay.hidden = true;
    root.classList.remove("consumer-mode");
    referenceConsumer = null;
    closeDrawers();
    closeExpandedReader();
    const activeElement = document.activeElement;
    if (activeElement && overlay.contains(activeElement)) activeElement.blur?.();
    if (restoreFocus && keyboard) {
      const focusTarget = returnFocus;
      focusTarget?.focus?.({ preventScroll: true });
      queueMicrotask(() => focusTarget?.focus?.({ preventScroll: true }));
    }
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
      pendingIndexCount = (snapshot?.documents || []).filter((record) => ["reading", "unindexed", "indexing"].includes(record.indexState?.state)).length;
      onDesktopSnapshot?.(snapshot);
      followBackgroundIndexing(snapshot);
      if (desktopWarnings.length) setStatus(`${desktopWarnings.length}개 파일을 안전 제한으로 건너뛰었습니다.`, true);
    }
    await renderSources();
    await runSearch();
    if (!overlay.hidden) query.focus();
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
      activeTypes = ["pdf"];
      updateTypeControls();
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
  const focusResultCard = (id) => {
    const card = list.querySelector(`[data-result-id="${CSS.escape(id)}"]`);
    if (!card) return;
    card.focus({ preventScroll: true });
    const scroller = overlay.querySelector(".unilib-result-scroll");
    const cardBounds = card.getBoundingClientRect();
    const scrollBounds = scroller.getBoundingClientRect();
    if (cardBounds.top < scrollBounds.top) scroller.scrollTop += cardBounds.top - scrollBounds.top;
    else if (cardBounds.bottom > scrollBounds.bottom) scroller.scrollTop += cardBounds.bottom - scrollBounds.bottom;
  };
  const toggleResultSelection = (id) => {
    const scroller = overlay.querySelector(".unilib-result-scroll");
    const card = list.querySelector(`[data-result-id="${CSS.escape(id)}"]`);
    const scrollTop = scroller.scrollTop;
    const cardTop = card?.getBoundingClientRect().top;
    invalidateAction();
    if (selectedIds.has(id)) { selectedIds.delete(id); selectedRecords.delete(id); }
    else {
      selectedIds.add(id);
      const record = results.find((result) => result.id === id);
      if (record) selectedRecords.set(id, record);
    }
    updateResultSelection();
    scroller.scrollTop = scrollTop;
    card?.focus({ preventScroll: true });
    if (card && Number.isFinite(cardTop)) {
      const delta = card.getBoundingClientRect().top - cardTop;
      if (delta) scroller.scrollTop += delta;
    }
    requestAnimationFrame(() => {
      if (!card?.isConnected) return;
      scroller.scrollTop = scrollTop;
      card.focus({ preventScroll: true });
    });
  };
  list.addEventListener("click", (event) => {
    cancelSpacePress();
    const check = event.target.closest("[data-select-result]");
    if (check) {
      event.stopPropagation();
      invalidateAction();
      const id = check.dataset.selectResult;
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
    invalidateAction();
    selectedId = card.dataset.resultId;
    pdfMatchIndex = 0;
    activeRepresentation = "full";
    activeFigureRepresentation = "figure:0";
    updateResultSelection();
    focusResultCard(selectedId);
    void renderPreview();
  });
  overlay.querySelector("[data-unilib-selected-items]").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-unilib-selected-remove]");
    if (!remove) return;
    invalidateAction();
    selectedIds.delete(remove.dataset.unilibSelectedRemove);
    selectedRecords.delete(remove.dataset.unilibSelectedRemove);
    updateResultSelection();
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
  const searchScheduler = createSearchScheduler(() => runSearch());
  query.addEventListener("compositionstart", searchScheduler.compositionStart);
  query.addEventListener("compositionend", searchScheduler.compositionEnd);
  query.addEventListener("input", (event) => { cancelSpacePress(); searchScheduler.input(event); });
  query.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void Promise.resolve(searchScheduler.enter()).then(() => {
      if (!overlay.hidden && results.length) focusResultCard(results[0].id);
    });
  });
  overlay.querySelector("[data-unilib-clear]").addEventListener("click", () => { query.value = ""; searchScheduler.enter(); query.focus(); });
  const updateTypeControls = () => {
    const all = activeTypes.length === LIBRARY_TYPES.length;
    overlay.querySelectorAll("[data-unilib-type]").forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.unilibType === "all" ? all : !all && activeTypes.includes(item.dataset.unilibType))));
    overlay.querySelector("[data-unilib-exam-filters]").hidden = !activeTypes.includes("question");
    overlay.querySelector("[data-unilib-pdf-display]").hidden = !(activeTypes.length === 1 && activeTypes[0] === "pdf");
  };
  overlay.querySelectorAll("[data-unilib-type]").forEach((control) => control.addEventListener("click", () => {
    cancelSpacePress();
    activeTypes = toggleLibraryType(activeTypes, control.dataset.unilibType);
    updateTypeControls();
    void runSearch();
  }));
  overlay.querySelectorAll("[data-unilib-pdf-mode]").forEach((control) => control.addEventListener("click", () => {
    cancelSpacePress();
    pdfDisplayMode = control.dataset.unilibPdfMode;
    overlay.querySelectorAll("[data-unilib-pdf-mode]").forEach((button) => button.setAttribute("aria-pressed", String(button === control)));
    void runSearch();
  }));
  overlay.querySelectorAll("[data-unilib-filter]").forEach((control) => control.addEventListener("change", () => {
    examFilters[control.dataset.unilibFilter] = control.value;
    void runSearch();
  }));
  [overlay.querySelector("[data-unilib-year-start]"), overlay.querySelector("[data-unilib-year-end]")].forEach((control) => control.addEventListener("change", () => {
    const range = normalizeYearRange(overlay.querySelector("[data-unilib-year-start]").value, overlay.querySelector("[data-unilib-year-end]").value,
      [...overlay.querySelector("[data-unilib-year-start]").options].map((option) => Number(option.value)).filter(Number.isFinite));
    examFilters.startYear = range.start;
    examFilters.endYear = range.end;
    void runSearch();
  }));
  overlay.querySelector("[data-unilib-selected-clear]").addEventListener("click", () => {
    invalidateAction();
    selectedIds.clear();
    selectedRecords.clear();
    updateResultSelection();
  });
  const stepPdfMatch = (delta) => {
    const count = selectedResult()?.matches?.length || 0;
    if (!count) return;
    pdfMatchIndex = (pdfMatchIndex + delta + count) % count;
    if (continuousView?.resultId === selectedId) {
      const pageNumber = selectedResult().matches[pdfMatchIndex].pageNumber;
      overlay.querySelector("[data-unilib-match-position]").textContent = `${pdfMatchIndex + 1} / ${count} · ${pageNumber}쪽`;
      stage.scrollTop = (pageNumber - 1) * CONTINUOUS_PDF_PAGE_EXTENT;
      stage.dispatchEvent(new Event("scroll"));
    } else void renderPreview();
  };
  overlay.querySelector("[data-unilib-match-prev]").addEventListener("click", () => stepPdfMatch(-1));
  overlay.querySelector("[data-unilib-match-next]").addEventListener("click", () => stepPdfMatch(1));
  stage.addEventListener("scroll", () => {
    const session = continuousView;
    const result = selectedResult();
    if (!session || result?.id !== session.resultId) return;
    const pageNumber = Math.max(1, Math.min(session.pageCount, Math.floor((stage.scrollTop + CONTINUOUS_PDF_PAGE_EXTENT * 0.45) / CONTINUOUS_PDF_PAGE_EXTENT) + 1));
    session.visiblePage = pageNumber;
    stage.dataset.visiblePdfPage = String(pageNumber);
    overlay.querySelector("[data-unilib-source-meta]").textContent = resultSourceText(pdfFilePageResult(result, pageNumber));
    paintContinuousWindow(session, result, pageNumber);
  }, { passive: true });
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
  overlay.querySelector("[data-unilib-scrim]").addEventListener("click", closeDrawers);
  overlay.querySelector("[data-unilib-close]").addEventListener("click", close);
  overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(); });
  const openAiDestination = async (references, { closeCropSurface = false, assignment = null } = {}) => {
    const placement = assignment?.placement || "separate";
    const openDestination = typeof openIndependentReferences === "function"
      ? () => openIndependentReferences({ references, startGeneration: false, placement, groups: assignment?.groups })
      : () => openAi?.({ references });
    setStatus("AI 작업실을 여는 중…");
    const opening = Promise.resolve().then(openDestination);
    const aiPanel = document.getElementById("ai-image-panel");
    if (aiPanel?.hidden) {
      await new Promise((resolve, reject) => {
        const observer = new MutationObserver(() => {
          if (!aiPanel.hidden) { observer.disconnect(); resolve(); }
        });
        observer.observe(aiPanel, { attributes: true, attributeFilter: ["hidden"] });
        opening.then(() => { observer.disconnect(); resolve(); }, (error) => { observer.disconnect(); reject(error); });
      });
    }
    if (closeCropSurface) closeCrop(false);
    close({ restoreFocus: false });
    try {
      await opening;
    } catch (error) {
      overlay.hidden = false;
      await pdfUi?.activate?.();
      setStatus(`AI 작업실을 열지 못했습니다: ${error instanceof Error ? error.message : error}`, true);
      await renderPreview();
      focusResultCard(selectedId);
    }
  };
  overlay.querySelector("[data-unilib-insert]").addEventListener("click", async () => {
    await runLibraryAction(async (snapshot, isCurrent) => {
      const result = resultForActionSnapshot(snapshot);
      const representation = selectedInsertRepresentation(result, snapshot.representation, snapshot.selectedFigure);
      if (!result || !canInsertLibraryResult(result, representation)) return;
      const effectiveResult = resultForRepresentation(result, representation);
      const activeProvider = await provider();
      if (!isCurrent()) return;
      const materialized = await materializeLibraryAction(effectiveResult, activeProvider, { ...snapshot.options, representation: materializationRepresentation(result, representation) });
      if (!isCurrent()) return;
      await insertMaterialized(effectiveResult, materialized, snapshot.options, { isCurrent });
      if (isCurrent()) close();
    });
  });
  overlay.querySelector("[data-unilib-objectify]").addEventListener("click", async () => {
    await runLibraryAction(async (snapshot, isCurrent) => {
      const result = resultForActionSnapshot(snapshot);
      const representation = selectedInsertRepresentation(result, snapshot.representation, snapshot.selectedFigure);
      if (!result || !canInsertLibraryResult(result, representation) || typeof openObjectify !== "function") return;
      const effectiveResult = resultForRepresentation(result, representation);
      const activeProvider = await provider();
      if (!isCurrent()) return;
      const materialized = await materializeLibraryAction(effectiveResult, activeProvider, { ...snapshot.options, representation: materializationRepresentation(result, representation) });
      if (!isCurrent()) return;
      await openObjectify(effectiveResult, materialized, { isCurrent });
      if (isCurrent()) close();
    });
  });
  let cancelPlacementChoice = null;
  overlay.querySelector("[data-unilib-ai]").addEventListener("click", async () => {
    await runLibraryAction(async (snapshot, isCurrent) => {
      const actionResult = resultForActionSnapshot(snapshot);
      const chosen = aiActionRecords(selectedRecords, selectedIds, actionResult)
        .map((result) => result.id === snapshot.selectedId ? actionResult : result);
      if (!chosen.length) return;
      const activeProvider = await provider();
      if (!isCurrent()) return;
      setStatus("AI 작업용 이미지를 준비하는 중…");
      const references = [];
      for (const result of chosen) {
        const representation = aiActionRepresentationForResult(result, snapshot.selectedId, snapshot.representation, snapshot.selectedFigure);
        if (!canInsertLibraryResult(result, representation)) continue;
        const effectiveResult = resultForRepresentation(result, representation);
        const materialized = await materializeLibraryAction(effectiveResult, activeProvider, { ...snapshot.options, representation: materializationRepresentation(result, representation) });
        if (!isCurrent()) return;
        references.push(await rasterizeReference(materializedReference(effectiveResult, materialized)));
        if (!isCurrent()) return;
      }
      if (!isCurrent() || !references.length) return;
      const assignment = references.length > 1
        ? await chooseWorkbenchAssignment({ references, host: overlay, returnFocus: overlay.querySelector("[data-unilib-ai]") })
        : { placement: "separate", groups: [[0]] };
      if (!assignment || !isCurrent()) return;
      workbenchReferenceGroups(references, assignment);
    if (referenceConsumer) {
      const additions = references.map((reference) => ({ name: reference.name, data: reference.dataUrl, sourceKind: reference.sourceKind, source: reference.source }));
      if (referenceConsumer.onAddMany) await referenceConsumer.onAddMany(additions, assignment);
      else additions.forEach((reference) => referenceConsumer.onAdd?.(reference));
      referenceConsumer.onStatus?.(`라이브러리 참고 이미지 ${references.length}개가 추가되었습니다.`, "ok");
      referenceConsumer.onComplete?.();
      referenceConsumer = null;
    } else if (typeof openIndependentReferences === "function") {
      await openAiDestination(references, { assignment });
    } else {
      await openAiDestination(references, { assignment });
    }
      if (isCurrent()) close({ restoreFocus: false });
    });
  });
  overlay.querySelector("[data-unilib-source-open]").addEventListener("click", async () => {
    const result = selectedActiveResult();
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
  const cropCollection = overlay.querySelector("[data-unilib-crop-collection]");
  const cropSave = overlay.querySelector("[data-unilib-crop-save]");
  const cropTitle = overlay.querySelector("#unilib-crop-title");
  const cropZoomOutput = overlay.querySelector("[data-unilib-crop-zoom]");
  const cropRectKey = () => draftCrop?.join(",") ?? "";
  const cropActionState = () => ({
    resultId: cropSession?.resultId,
    documentId: cropSession?.documentId,
    pageNumber: cropSession?.pageNumber,
    resultIdentity: cropSession?.resultIdentity,
    currentResultIdentity: libraryResultIdentity(selectedActiveResult()),
    rectKey: cropRectKey(),
    open: !cropDialog.hidden,
    exact: Boolean(cropPreviewExact && cropExact?.rectKey === cropRectKey()
      && cropSessionIsCurrent(cropSession, selectedActiveResult())),
  });
  const renderAcceptedCrops = () => {
    cropCollection.replaceChildren(...acceptedCrops.map(({ result, materialized }, index) => {
      const item = document.createElement("div");
      item.className = "unilib-crop-collection-item";
      const thumbnail = document.createElement("img");
      thumbnail.className = "unilib-crop-collection-thumb";
      thumbnail.src = resultImage(result, materialized);
      thumbnail.alt = `자른 이미지 ${index + 1}`;
      const label = document.createElement("span");
      const rect = result.provenance.rect.map((value) => `${Math.round(value * 100)}%`).join(" · ");
      label.textContent = `이미지 ${index + 1}`;
      label.title = `${result.provenance.pageNumber}쪽 · ${rect}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "unilib-crop-collection-delete";
      remove.dataset.unilibCropRemove = result.id;
      remove.setAttribute("aria-label", `${index + 1}번째 자르기 영역 삭제`);
      remove.textContent = "삭제";
      item.append(thumbnail, label, remove);
      return item;
    }));
    cropCollection.hidden = acceptedCrops.length === 0;
  };
  const setCropActionAvailability = () => {
    const available = cropActionState().exact && !cropActionBusy;
    cropSave.disabled = !available && acceptedCrops.length === 0;
    cropSave.textContent = available ? "선택 추가" : acceptedCrops.length ? "자르기 완료" : "선택 추가";
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
    cropPreview.style.display = draftCrop ? "block" : "none";
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
    const result = selectedActiveResult();
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
      const canonicalPage = cropSession.canonicalPage;
      if (!canonicalPage || !["page", "crop"].includes(canonicalPage.kind)
        || canonicalPage.provenance?.documentId !== source.documentId
        || canonicalPage.provenance?.pageNumber !== source.pageNumber) {
        throw new Error("선택한 PDF 쪽의 원본을 확인하지 못했습니다.");
      }
      const manualResult = withManualCropVariant(canonicalPage, source);
      const materialized = await (await provider()).materialize(manualResult, { representation: "manual" });
      const src = resultImage(result, materialized);
      if (!src) throw new Error("선택한 이미지를 표시할 수 없습니다.");
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", () => reject(new Error("선택한 이미지를 읽지 못했습니다.")), { once: true });
        image.src = src;
      });
      if (epoch !== cropPreviewEpoch || !cropSessionIsCurrent(cropSession, selectedActiveResult())
        || !draftCrop || draftCrop.some((value, index) => value !== rect[index])) return;
      cropPreview.width = image.naturalWidth;
      cropPreview.height = image.naturalHeight;
      cropPreview.getContext("2d", { alpha: false }).drawImage(image, 0, 0);
      cropPreviewExact = true;
      cropExact = { result: resultForRepresentation(manualResult, "manual"), materialized, rectKey: rect.join(",") };
      setCropActionAvailability();
    } catch (error) {
      if (epoch === cropPreviewEpoch && cropSessionIsCurrent(cropSession, selectedActiveResult())) {
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
    cropDialog.removeAttribute("data-pdf-page");
    cropDialog.classList.remove("is-view-only");
    cropTitle.textContent = "확대 미리보기 · 영역 선택";
    paintCrop();
    acceptedCrops = [];
    renderAcceptedCrops();
    if (restoreFocus && !overlay.hidden) cropReturnFocus?.focus?.({ preventScroll: true });
    cropReturnFocus = null;
  };
  const openCropEditor = async () => {
    const result = selectedActiveResult();
    if (!result || result.provenance?.provider !== "pdf") return;
    cropReturnFocus = document.activeElement;
    const session = {
      resultId: result.id,
      documentId: result.provenance.documentId,
      pageNumber: result.provenance.pageNumber,
      resultIdentity: libraryResultIdentity(result),
      canonicalPage: null,
    };
    cropSession = session;
    acceptedCrops = [];
    cropSequence = 0;
    renderAcceptedCrops();
    cropDialog.dataset.pdfPage = String(session.pageNumber);
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
      const original = await materializeOriginalLibraryPage(result, activeProvider);
      if (!cropSessionIsCurrent(session, selectedActiveResult()) || cropSession !== session) return;
      const canonicalPage = original?.result ?? (["page", "crop"].includes(result.kind) ? result : null);
      if (!canonicalPage || !["page", "crop"].includes(canonicalPage.kind)
        || canonicalPage.provenance?.documentId !== session.documentId
        || canonicalPage.provenance?.pageNumber !== session.pageNumber) {
        throw new Error("선택한 PDF 쪽의 원본 응답이 일치하지 않습니다.");
      }
      if (result.kind === "pdf" && canonicalPage.kind !== "page") throw new Error("선택한 PDF 쪽의 원본 응답이 페이지가 아닙니다.");
      session.canonicalPage = canonicalPage;
      const src = resultImage(result, original);
      if (!src) throw new Error("원문 페이지를 표시할 수 없습니다.");
      cropImage.src = src;
      await cropImage.decode();
      if (!cropSessionIsCurrent(session, selectedActiveResult()) || cropSession !== session) return;
      void paintExactCropPreview();
    } catch (error) {
      if (cropSession === session) {
        cropStage.setAttribute("aria-busy", "false");
        setStatus(`원문 페이지 실패: ${error instanceof Error ? error.message : error}`, true);
      }
    }
  };
  overlay.querySelector("[data-unilib-adjust]").addEventListener("click", () => void openCropEditor());
  const openExpandedPreview = async (expectedIdentity = null) => {
    const result = selectedActiveResult();
    const identity = libraryResultIdentity(result);
    if (!result || (expectedIdentity && identity !== expectedIdentity)) return false;
    if (result.provenance?.provider === "pdf") {
      if (selectedResult()?.kind === "pdf" && continuousView?.resultId === selectedId) {
        root.classList.add("is-reader-expanded");
        overlay.querySelector("[data-unilib-preview]").classList.add("library-reader--expanded");
        paintContinuousWindow(continuousView, selectedResult(), 1);
        stage.scrollTop = 0;
        stage.dispatchEvent(new Event("scroll"));
        stage.tabIndex = -1;
        stage.focus({ preventScroll: true });
        return true;
      }
      cropReturnFocus = document.activeElement;
      const session = {
        resultId: result.id,
        documentId: result.provenance.documentId,
        pageNumber: result.provenance.pageNumber,
        resultIdentity: identity,
        viewOnly: true,
      };
      cropSession = session;
      cropDialog.dataset.pdfPage = String(result.provenance.pageNumber);
      draftCrop = null;
      acceptedCrops = [];
      renderAcceptedCrops();
      cropDialog.classList.add("is-view-only");
      cropTitle.textContent = `${result.title || "PDF"} · ${result.provenance.pageNumber}쪽`;
      cropDialog.hidden = false;
      cropStage.setAttribute("aria-busy", "true");
      try {
        const original = await materializeOriginalLibraryPage(result, await provider());
        if (cropSession !== session || !cropSessionIsCurrent(session, selectedActiveResult())) return false;
        const src = resultImage(result, original);
        if (!src) throw new Error("원문 페이지를 표시할 수 없습니다.");
        cropImage.src = src;
        await cropImage.decode();
        if (cropSession !== session || !cropSessionIsCurrent(session, selectedActiveResult())) return false;
        cropFitBounds = [0, 0, 1, 1];
        cropStage.setAttribute("aria-busy", "false");
        fitCropContent();
        cropStage.focus();
        return true;
      } catch (error) {
        if (cropSession === session && cropSessionIsCurrent(session, selectedActiveResult())) {
          setStatus(`확대 미리보기 실패: ${error instanceof Error ? error.message : error}`, true);
        }
        return false;
      }
    }
    if (!currentMaterialized || currentMaterializedIdentity !== identity) return false;
    const src = resultImage(result, currentMaterialized);
    if (!src) return false;
    cropReturnFocus = document.activeElement;
    const session = {
      resultId: result.id,
      documentId: result.provenance?.documentId,
      pageNumber: result.provenance?.pageNumber,
      resultIdentity: identity,
      viewOnly: true,
    };
    cropSession = session;
    draftCrop = null;
    cropDialog.classList.add("is-view-only");
    cropTitle.textContent = "확대 미리보기";
    cropDialog.hidden = false;
    cropStage.setAttribute("aria-busy", "true");
    cropImage.src = src;
    try {
      await cropImage.decode();
      if (cropSession !== session || !cropSessionIsCurrent(session, selectedActiveResult())) return false;
      cropFitBounds = [0, 0, 1, 1];
      cropStage.setAttribute("aria-busy", "false");
      fitCropContent();
      cropStage.focus();
      return true;
    } catch {
      if (cropSession === session && cropSessionIsCurrent(session, selectedActiveResult())) {
        cropStage.setAttribute("aria-busy", "false");
        setStatus("확대 미리보기 이미지를 읽지 못했습니다.", true);
      }
      return false;
    }
  };
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
    const result = selectedActiveResult();
    if (!result || !cropSessionIsCurrent(cropSession, result)) return;
    if (!draftCrop) {
      if (acceptedCrops.length) {
        closeCrop();
        await renderPreview();
      }
      return;
    }
    if (!cropExact || !cropPreviewExact || cropExact.rectKey !== cropRectKey()) return;
    const savedRect = clampRect(draftCrop);
    cropSequence += 1;
    const accepted = acceptedCropResult(cropSession.canonicalPage || result, savedRect, cropSequence);
    acceptedCrops.push({ result: accepted, materialized: cropExact.materialized });
    invalidateAction();
    selectedIds.add(accepted.id);
    selectedRecords.set(accepted.id, accepted);
    draftCrop = null;
    cropPreviewEpoch += 1;
    cropPreviewExact = false;
    cropExact = null;
    paintCrop();
    renderAcceptedCrops();
    updateResultSelection();
    setStatus(`${acceptedCrops.length}개 영역을 추가했습니다. 계속 드래그하거나 Enter로 끝내세요.`);
  });
  cropCollection.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-unilib-crop-remove]");
    if (!remove) return;
    acceptedCrops = acceptedCrops.filter(({ result }) => result.id !== remove.dataset.unilibCropRemove);
    selectedIds.delete(remove.dataset.unilibCropRemove);
    selectedRecords.delete(remove.dataset.unilibCropRemove);
    invalidateAction();
    renderAcceptedCrops();
    updateResultSelection();
    setCropActionAvailability();
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
    setStatus("AI 작업용 이미지를 준비하는 중…");
    const reference = await rasterizeReference(materializedReference(exact.result, exact.materialized));
    if (!isCurrent()) return;
    if (referenceConsumer) {
      referenceConsumer.onAdd?.({ name: reference.name, data: reference.dataUrl, sourceKind: reference.sourceKind, source: reference.source });
      referenceConsumer.onStatus?.("라이브러리 참고 이미지 1개가 추가되었습니다.", "ok");
      referenceConsumer.onComplete?.();
      referenceConsumer = null;
    } else if (typeof openIndependentReferences === "function") {
      await openAiDestination([reference], { closeCropSurface: true });
    } else {
      await openAiDestination([reference], { closeCropSurface: true });
    }
    if (isCurrent()) closeAfterCropDestination(isCurrent);
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
    if (cropSession?.viewOnly) return;
    if (!cropSessionIsCurrent(cropSession, selectedActiveResult())) return;
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
  let spacePress = null;
  let suppressSpaceKeyup = false;
  const cancelSpacePress = () => {
    if (spacePress) suppressSpaceKeyup = true;
    if (spacePress?.timer) window.clearTimeout(spacePress.timer);
    if (spacePress?.waitTimer) window.clearTimeout(spacePress.waitTimer);
    spacePress = null;
  };
  const continueSpacePreview = async (press) => {
    if (spacePress !== press || overlay.hidden || selectedId !== press.id || libraryResultIdentity(selectedActiveResult()) !== press.identity) return;
    const result = selectedActiveResult();
    if (result?.provenance?.provider !== "pdf" && (!currentMaterialized || currentMaterializedIdentity !== press.identity)) {
      if (stage.textContent.startsWith("미리보기 실패:")) {
        cancelSpacePress();
        return;
      }
      setStatus("큰 미리보기를 준비하는 중…");
      press.waitTimer = window.setTimeout(() => void continueSpacePreview(press), 24);
      return;
    }
    const opened = await openExpandedPreview(press.identity);
    if (spacePress !== press) return;
    press.opened = opened;
    if (press.released || !opened) cancelSpacePress();
  };
  window.addEventListener("blur", cancelSpacePress);
  document.addEventListener("keydown", (event) => {
    if (overlay.hidden) return;
    if (event.target?.closest?.(".workbench-assignment-overlay")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelSpacePress();
      if (root.classList.contains("is-reader-expanded")) closeExpandedReader();
      else if (cancelPlacementChoice) cancelPlacementChoice();
      else if (!cropDialog.hidden) closeCrop();
      else if (root.classList.contains("folders-open") || root.classList.contains("preview-open")) closeDrawers();
      else close({ keyboard: true });
      return;
    }
    if (cancelPlacementChoice) return;
    if (!cropDialog.hidden) {
      if (event.key === "Enter" && !editableTarget(event.target)) {
        event.preventDefault();
        cropSave.click();
      }
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"].includes(event.key) && (!editableTarget(event.target) || resultCardTarget(event.target)) && results.length) {
      const columns = Math.max(1, getComputedStyle(list).gridTemplateColumns.split(" ").filter(Boolean).length);
      cancelSpacePress();
      if (!["ArrowDown", "ArrowUp"].includes(event.key) && columns === 1) return;
      event.preventDefault();
      invalidateAction();
      const current = Math.max(0, results.findIndex((item) => item.id === selectedId));
      const shift = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns })[event.key];
      const next = Math.max(0, Math.min(results.length - 1, current + shift));
      selectedId = results[next].id;
      updateResultSelection();
      void renderPreview();
      focusResultCard(selectedId);
    }
    if (shouldHandleLibrarySpace(event)) {
      event.preventDefault();
      if (event.repeat || spacePress) return;
      suppressSpaceKeyup = false;
      const id = selectedId;
      const identity = libraryResultIdentity(selectedActiveResult());
      const press = { id, identity, opened: false, long: false, released: false, timer: null, waitTimer: null };
      press.timer = window.setTimeout(() => {
        if (spacePress !== press || selectedId !== id || libraryResultIdentity(selectedActiveResult()) !== identity || overlay.hidden) return;
        press.long = true;
        void continueSpacePreview(press);
      }, 400);
      spacePress = press;
    }
  }, true);
  document.addEventListener("focusin", (event) => {
    if (spacePress && !event.target?.closest?.(`[data-result-id="${CSS.escape(spacePress.id)}"]`)) cancelSpacePress();
  }, true);
  document.addEventListener("keyup", (event) => {
    if (event.key !== " ") return;
    if (!spacePress) {
      if (suppressSpaceKeyup) event.preventDefault();
      suppressSpaceKeyup = false;
      return;
    }
    event.preventDefault();
    const press = spacePress;
    if (press.long) {
      press.released = true;
      return;
    }
    cancelSpacePress();
    suppressSpaceKeyup = false;
    if (!press.opened && !overlay.hidden && press.id === selectedId) toggleResultSelection(press.id);
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
  const closeLibraryLayer = () => {
    lastInteractionWasKeyboard = true;
    cancelSpacePress();
    if (root.classList.contains("folders-open") || root.classList.contains("preview-open")) closeDrawers();
    else close({ keyboard: true });
  };
  registerEscapeLayer(overlay, closeLibraryLayer);
  registerEscapeLayer(root, closeLibraryLayer);
  registerEscapeLayer(cropDialog, () => { lastInteractionWasKeyboard = true; cancelSpacePress(); closeCrop(); });
  return Object.freeze({
    open, close, refresh: async () => { await renderSources(); await runSearch(); }, element: overlay,
    async beginReferenceSelection(consumer, trigger) {
      referenceConsumer = consumer;
      root.classList.add("consumer-mode");
      selectedIds.clear();
      await open(trigger);
      setStatus("추가할 자료를 체크하세요.");
    },
  });
}

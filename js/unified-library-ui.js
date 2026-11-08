import { loadAnswerBook, acceptedAnswers, answersShown, setAnswersShown, onAnswersShown, CIRCLED, ANSWER_COLOR } from "../assets/exampool/answers/answers.js?v=1107";
import { createLibraryLoading } from './loading/library-controller.js?v=1.7.0-four-session-integration';
import { createLibraryPreviewLoading } from './loading/library-preview.js?v=1.7.0-four-session-integration';
import { channelStorage } from './preview-storage.js?v=1.7.0-four-session-integration';
import { createThumbnailQueue } from "./library/thumbnail-queue.js?v=1.7.0-four-session-integration";
import { createModalSurfaceMotion } from './modal-surface-motion.js?v=1.7.0-four-session-integration';
import { animateLibraryAiHandoff } from './library-ai-motion.js?v=1.7.0-four-session-integration';
import { attachCropMagnifier } from "./tools/pointer-magnifier.js?v=1.7.0-four-session-integration";
import { targetPageGeometry, fittedPageSize, createPreviewPaper, createLoadingDots } from "./library/page-loading.js?v=1.7.0-four-session-integration";
import { createContinuousCropPages } from "./library/continuous-crop-pages.js?v=1.7.0-four-session-integration";
import { registerEscapeLayer } from "./escape-layers.js?v=1.7.0-four-session-integration";
import { DESKTOP_RELEASE_URL } from "./ai-install-guide.js?v=1.7.0-four-session-integration";
import { safeExternalSourceUrl } from "./library-import-policy.js?v=1.7.0-four-session-integration";
import { queryHighlightTerms } from "./pdf-library/search.js?v=1.7.0-four-session-integration";
import { chooseWorkbenchAssignment } from "./library/workbench-assignment.js?v=1.7.0-four-session-integration";
import { markSpaceAction, loadSpaceActionStyle } from "./library/space-action.js?v=1.7.0-four-session-integration";
import { compareExamResults } from "./library/provider.js?v=1.7.0-four-session-integration";
import { croppedPastImage } from "../assets/exampool/sheet/past-crop.js?v=1.7.0-four-session-integration";

const SOURCE_STORAGE_KEY = "5e.unified-library.sources.v1";
const TREE_STORAGE_KEY = "5e.unified-library.tree-expanded.v1";
const PANE_STORAGE_KEY = "5e.unified-library.search-pane-open.v1";
const PREVIEW_PANE_STORAGE_KEY = "5e.unified-library.preview-pane-open.v1";
const LIBRARY_TYPES = Object.freeze(["question", "image", "pdf"]);
const DEFAULT_KINDS = Object.freeze(["crop", "image", "page"]);
const DEFAULT_CONTINUOUS_PDF_PAGE_EXTENT = 760;
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
  file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2h10l4 4v16H5zM14 2v5h5M8 12h8M8 16h8"/></svg>',
  panelLeft: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3.5h14v13H3zM7 3.5v13"/></svg>',
  // 11-05 시안 v8(5e-design-mockups/library-1105-v8.html): 종류는 exam 상태 아이콘처럼 선 + 칠한 부분, 조건·위치는 선.
  kindAll: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect class="f" x="13" y="13" width="7" height="7" rx="1.6"/></svg>',
  kindQuestion: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="3.5" width="15" height="17" rx="2.2"/><circle class="f" cx="8.6" cy="8" r="1.9"/><path d="M12 8h4.5M8 12.5h8.5M8 16h5.5"/></svg>',
  kindPdf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 3.5h9.5l4 4v12a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z"/><path d="M15 3.5v3a1 1 0 0 0 1 1h3"/><rect class="f" x="7.5" y="10.5" width="9" height="3.2" rx=".8"/><path d="M7.5 17h6"/></svg>',
  kindImage: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.2"/><circle class="f" cx="9" cy="9.5" r="1.8"/><path class="f" d="M4 18l5.2-4.6 3.6 3 2.8-2.3L20 18v.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/></svg>',
  conditions: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
  reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/></svg>',
  provided: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><text x="12" y="15.6" text-anchor="middle" font-size="8.6" font-weight="700" font-family="Georgia,serif" font-style="italic" fill="currentColor" stroke="none">5E</text></svg>',
  cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.6 9.1 4.7 4.7 0 0 0 7.5 18.5z"/></svg>',
  laptop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M3 18.5h18"/></svg>',
  viewQuestion: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4"/></svg>',
  panelRight: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3.5h14v13H3zM13 3.5v13"/></svg>',
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
  return [" ", "Enter"].includes(event?.key)
    && (!editableTarget(event.target) || resultCardTarget(event.target))
    && !event?.isComposing && !event?.ctrlKey && !event?.metaKey && !event?.altKey && !event?.shiftKey;
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

export function pdfResultsForDisplay(files, mode = "file", matchesOnly = false) {
  if (mode !== "page") return files;
  return files.flatMap((file) => {
    const pageNumbers = matchesOnly && file.matches?.length
      ? file.matches.map((match) => match.pageNumber)
      : Array.from({ length: Math.max(1, Number(file.pageCount) || 1) }, (_, index) => index + 1);
    return pageNumbers.map((pageNumber) => {
      const match = file.matches?.find?.((item) => item.pageNumber === pageNumber);
      return {
        ...file,
        id: `${file.id}:page:${pageNumber}`,
        firstMatchingPage: pageNumber,
        matches: match ? [match] : [],
        metadata: { ...file.metadata, pageNumber },
        preview: match?.source ? { source: match.source } : file.preview,
        provenance: { ...file.provenance, ...(match?.source ?? {}), pageNumber },
        subtitle: `${file.title} · ${pageNumber}쪽`,
      };
    });
  });
}

export async function materializeLibraryThumbnail(result, activeProvider, pdfMode = "file") {
  if (result?.kind === "pdf" && typeof result.loadPreview === "function") {
    const pageNumber = pdfMode === "page"
      ? result.firstMatchingPage ?? result.matches?.[0]?.pageNumber ?? result.provenance?.pageNumber ?? 1
      : 1;
    // Page cards need a sharp full page. Prefer the prebuilt page image; render the PDF only when none exists.
    return result.loadPreview(pageNumber, { thumbnail: true, ...(pdfMode === "page" ? { original: true, prebuiltPage: true } : {}) });
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
  const accepted = options.acceptedAssets?.get(result?.id);
  // A crop accepted from the fast page preview is only a placeholder; final output always uses the original PDF.
  if (accepted && !accepted.materialized?.previewOnly && libraryResultIdentity(accepted.result) === libraryResultIdentity(result)
    && JSON.stringify(accepted.result.provenance?.rect) === JSON.stringify(result.provenance?.rect)) return accepted.materialized;
  if (accepted?.materialized?.previewOnly && result?.kind === "crop" && result.cropType === "manual"
    && result.provenance?.provider === "pdf" && libraryResultIdentity(accepted.result) === libraryResultIdentity(result)
    && JSON.stringify(accepted.result.provenance?.rect) === JSON.stringify(result.provenance?.rect)) {
    // The accepted preview has a local ID. Bind its final crop to the provider's owned original page.
    const source = result.variants?.manual?.source;
    if (!source || source.documentId !== result.provenance.documentId || source.pageNumber !== result.provenance.pageNumber
      || JSON.stringify(source.rect) !== JSON.stringify(result.provenance.rect) || source.fullPageFallback !== false) {
      throw new TypeError("PDF manual crop does not match accepted provenance");
    }
    const page = activeProvider.listPdfPages().find(candidate => candidate.provenance?.documentId === source.documentId
      && candidate.provenance?.pageNumber === source.pageNumber);
    if (!page) throw new TypeError("PDF original page provenance is unavailable");
    return activeProvider.materialize(withManualCropVariant(page, source), {
      ...options, representation: "manual", original: false, preview: false, thumbnail: false,
    });
  }
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
  const years = [...new Set((availableYears || []).map(Number).filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2099))].sort((a, b) => a - b);
  if (!years.length || (start === "" && end === "")) return { start: null, end: null };
  const minimum = years[0];
  const maximum = years.at(-1);
  const first = Math.min(maximum, Math.max(minimum, Number(start) || minimum));
  const last = Math.min(maximum, Math.max(minimum, Number(end) || maximum));
  return { start: Math.min(first, last), end: Math.max(first, last) };
}

export function createSearchScheduler(run, { delay = 60, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
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

export function aiActionRecords(acceptedAssets) {
  return [...acceptedAssets.values()].map((entry) => entry?.result).filter(Boolean);
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
    && (snapshot?.acceptedAssetsKey ?? "") === (state?.acceptedAssetsKey ?? "")
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

// 11-06 사용자: 기출 문항 미리보기에서 정답 선지에 노란 형광펜(화면 표시만 — 잘라 내기·보내기는 원본 PDF 픽셀만 쓰므로 들어가지 않는다).
// 11-07: 정답은 평가원·학력평가 통합본(assets/exampool/answers/science-answers.json, 파일명 → 문항별 정답, 드라이브 문서 id → 파일명).
// 「정답 표시」 단추로 끌 수 있다(exam 기출 보기와 같은 값).
export function loadAnswerKeys() { return loadAnswerBook(); }
// 선지 낱말(① ㄱ, ③ ㄱ, ㄷ …)에서 정답 번호부터 다음 번호 앞까지를 칠한다. 한 낱말에 선지 여럿이 붙어 있으면 글자 수 비율로 자른다.
export function answerHighlights(result, keys) {
  if (!keys || result?.cropType !== "question") return [];
  const name = keys.documents?.[result.provenance?.documentId] || keys.documents?.[result.documentId];
  const number = result.metadata?.itemNumber;
  const accepted = name ? acceptedAnswers(keys, name, number) : null;
  if (!Array.isArray(accepted) || !accepted.length) return [];
  const crop = result.provenance?.rect ?? [0, 0, 1, 1];
  const inside = (r) => r[0] + r[2] / 2 >= crop[0] && r[0] + r[2] / 2 <= crop[0] + crop[2] && r[1] + r[3] / 2 >= crop[1] && r[1] + r[3] / 2 <= crop[1] + crop[3];
  const marks = [];
  for (const answer of accepted) {
    const mark = CIRCLED[answer - 1];
    if (!mark) continue;
    for (const word of result.searchWords ?? []) {
      const chars = [...String(word.text ?? "")], start = chars.indexOf(mark);
      if (start < 0 || !Array.isArray(word.rect) || word.rect.length < 4 || !inside(word.rect)) continue;
      let end = chars.findIndex((c, i) => i > start && CIRCLED.includes(c));
      if (end < 0) end = chars.length;
      while (end > start + 1 && /\s/.test(chars[end - 1])) end--;
      const [x, y, w, h] = word.rect, unit = w / Math.max(1, chars.length), padX = unit * 0.25, padY = h * 0.18;
      marks.push({ rect: [x + unit * start - padX, y - padY, unit * (end - start) + padX * 2, h + padY * 2], termId: "answer", answer: true, color: ANSWER_COLOR });
      break;
    }
  }
  return marks;
}

function paintHighlightLayer(host, image, result, crop) {
  host.querySelector(".unilib-highlight-layer")?.remove();
  const highlights = [...highlightRectsInCrop(result?.matchContext?.highlights, crop), ...highlightRectsInCrop(result?.answerHighlights, crop)];
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
      if (highlight.answer) marker.classList.add("is-answer");
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
  const pageResults = (result?.kind === "crop" ? [result] : [result, ...candidates.filter((candidate) => candidate !== result)]).filter((candidate) => {
    const candidateSource = candidate?.provenance ?? {};
    return candidateSource.documentId === source.documentId && candidateSource.pageNumber === source.pageNumber;
  });
  const rects = pageResults.flatMap((candidate) => {
    const rect = candidate?.variants?.full?.source?.rect
      ?? candidate?.variants?.content?.source?.rect
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

export function visibleLibraryName(value) {
  return String(value ?? "").replace(/\.(?:pdf|png|jpe?g|webp|gif|svg|bmp|tiff?|heic|avif)(?=\s|·|$)/giu, "");
}

export function shouldShowResultTypeBadge(activeTypes, kind) {
  void activeTypes;
  void kind;
  return false;
}

export function commitAcceptedCropSession({ acceptedAssets, acceptedCrops, documentId, pageNumber }) {
  for (const [id, entry] of acceptedAssets) {
    if (entry.result.provenance?.documentId !== documentId || entry.result.provenance?.pageNumber !== pageNumber) continue;
    acceptedAssets.delete(id);
  }
  for (const entry of acceptedCrops) {
    acceptedAssets.set(entry.result.id, entry);
  }
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
  return visibleLibraryName(result.subtitle || `${result.sourceLabel || "라이브러리"}${page}`);
}

function buildShell() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay unified-library-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="unilib" role="dialog" aria-modal="true" aria-labelledby="unilib-title">
      <header class="unilib-header">
        <div class="unilib-brand"><button type="button" class="unilib-icon-button unilib-header-panel-toggle" data-unilib-folders-open aria-expanded="true" aria-label="검색 위치 접기">${ICONS.panelLeft}</button><h2 id="unilib-title">라이브러리</h2><span data-unilib-location-summary hidden>검색 위치</span></div>
        <div class="unilib-header-actions">
          <span class="unilib-global-controls" data-unilib-global-controls></span><span class="unilib-header-sep" aria-hidden="true"></span>
          <button type="button" class="unilib-icon-button" data-unilib-close aria-label="라이브러리 닫기" title="닫기 (Esc)">${ICONS.close}</button>
        </div>
      </header>
      <div class="unilib-shell">
        <aside class="unilib-pane unilib-folders" aria-label="검색 위치">
          <div class="unilib-pane-head unilib-conditions-head"><h3>찾기</h3><button type="button" class="unilib-icon-button unilib-mobile-only" data-unilib-folders-close aria-label="검색 위치 닫기">${ICONS.close}</button></div>
          <div class="unilib-rail" data-unilib-rail><button type="button" class="unilib-rail-button" data-unilib-fly="conditions" title="문항 검색 조건">${ICONS.conditions}<b data-unilib-rail-badge="conditions" hidden></b></button><button type="button" class="unilib-rail-button" data-unilib-fly="location" title="파일 위치">${ICONS.folder}<b data-unilib-rail-badge="location" hidden></b></button></div>
          <div class="unilib-folder-scroll"><div class="unilib-kinds" data-unilib-kinds></div>
          <section class="unilib-box unilib-cond-box" data-unilib-box="conditions"><div class="unilib-box-head"><button type="button" class="unilib-cond-toggle" data-unilib-cond-toggle aria-expanded="false"><span class="unilib-box-icon">${ICONS.conditions}</span><strong>문항 검색 조건</strong><span class="unilib-cond-value" data-unilib-cond-value>전체</span><span class="unilib-chevron" aria-hidden="true">›</span></button><button type="button" class="unilib-icon-button unilib-cond-reset" data-unilib-conditions-clear hidden title="조건을 모두 처음대로" aria-label="조건을 모두 처음대로">${ICONS.reset}</button></div><section class="unilib-conditions" data-unilib-conditions aria-label="문항 검색 조건" hidden></section></section>
          <section class="unilib-box unilib-loc-box" data-unilib-box="location"><div class="unilib-location-head"><span class="unilib-box-icon">${ICONS.folder}</span><h3>파일 위치</h3><details class="unilib-location-add"><summary aria-label="자료 위치 추가" title="내 구글 드라이브 공유 폴더나 이 컴퓨터의 폴더를 검색 위치에 더합니다">＋ 폴더 연결</summary><div class="unilib-location-add-menu"><button type="button" class="unilib-button unilib-drive-settings-open" data-unilib-drive-settings-open>Google Drive 연결</button><button type="button" class="unilib-button" data-unilib-local-folder-add hidden>내 컴퓨터 폴더 연결</button></div></details></div>
          <div class="unilib-folder-loading" data-unilib-folder-loading role="status" aria-live="polite" hidden><div class="unilib-folder-loading-copy"><span class="unilib-folder-loading-spinner" aria-hidden="true"></span><div><strong data-unilib-folder-loading-title>라이브러리 폴더를 불러오는 중</strong><span data-unilib-folder-loading-detail>자료 수에 따라 잠시 걸릴 수 있습니다.</span></div></div><div class="unilib-folder-skeleton" aria-hidden="true"><i></i><i></i><i></i></div></div><div class="unilib-provided-state" data-unilib-provided-status role="status" hidden><span data-unilib-provided-status-message></span><button type="button" class="unilib-button" data-unilib-provided-retry hidden>다시 시도</button></div><ul class="unilib-tree" data-unilib-tree></ul></section></div>
        </aside>
        <section class="unilib-pane unilib-results" aria-label="라이브러리 검색 결과">
          <div class="unilib-mid-head"><div class="unilib-search-row library-search-row">
              <label class="unilib-search library-search">${ICONS.search}<input data-unilib-query type="search" autocomplete="off" spellcheck="false" aria-label="라이브러리 통합 검색" placeholder="문항 코드, PDF 본문, 이미지 파일명 검색"><button type="button" data-unilib-clear aria-label="검색어 지우기">×</button></label>
              <strong class="unilib-result-count library-result-count" data-unilib-count>0개</strong>
              <details class="unilib-help library-help" data-unilib-help><summary aria-label="검색 도움말">?</summary><p>여러 단어는 같은 페이지에 모두 있는 자료를 찾습니다. 결과 종류는 하나씩 선택하며, 전체는 문항·이미지·PDF를 모두 포함합니다.</p></details>
        </div>
            <div class="unilib-sort" role="group" aria-label="정렬"><button type="button" data-unilib-sort="score" aria-pressed="true">정확도순</button><button type="button" data-unilib-sort="recent" aria-pressed="false">최신순</button></div>
          </div>
          <div class="unilib-search-tools library-toolbar">
            <div class="unilib-filter-row library-filter-row">
              <div class="unilib-tabs library-kind-toggle" role="group" aria-label="결과 종류">
                <button type="button" data-unilib-type="all" aria-pressed="true">전체</button>
                <button type="button" data-unilib-type="question" aria-pressed="false">문항</button>
                <button type="button" data-unilib-type="pdf" aria-pressed="false">PDF</button>
                <button type="button" data-unilib-type="image" aria-pressed="false">이미지</button>
              </div>
              <div class="unilib-grid-density" data-unilib-grid-density hidden></div>
              <div class="unilib-pdf-display library-scope-toggle" data-unilib-pdf-display hidden role="group" aria-label="PDF 표시 방식"><button type="button" data-unilib-pdf-mode="file" aria-pressed="false">파일</button><button type="button" data-unilib-pdf-mode="page" aria-pressed="true">페이지</button></div>
            </div>
            <div class="unilib-exam-filters" data-unilib-exam-filters hidden>
              <select data-unilib-filter="subject" aria-label="과목"><option value="">모든 과목</option><option value="p1">물리학Ⅰ</option><option value="p2">물리학Ⅱ</option><option value="c1">화학Ⅰ</option><option value="c2">화학Ⅱ</option><option value="b1">생명과학Ⅰ</option><option value="b2">생명과학Ⅱ</option><option value="e1">지구과학Ⅰ</option><option value="e2">지구과학Ⅱ</option></select>
              <span class="unilib-year-range" aria-label="학년도 범위"><select data-unilib-year-start aria-label="시작 학년도"><option value="">시작</option></select><span>–</span><select data-unilib-year-end aria-label="끝 학년도"><option value="">끝</option></select></span>
              <select data-unilib-filter="administration" aria-label="시험"><option value="">모든 시험</option><option value="03">3월 학평</option><option value="04">4월 학평</option><option value="05">5월 학평</option><option value="06">6월 모의평가</option><option value="07">7월 학평</option><option value="09">9월 모의평가</option><option value="10">10월 학평</option><option value="11">수능</option></select>
            </div>
          </div>
          <div class="unilib-result-scroll"><div class="unilib-result-state" data-unilib-result-state role="status" aria-live="polite" hidden><span data-unilib-result-state-message></span><button type="button" class="unilib-button" data-unilib-result-retry hidden>다시 시도</button></div><ul class="unilib-result-list library-card-grid" data-unilib-results role="listbox"></ul></div>
          <section class="unilib-crop-tray" data-unilib-crop-tray hidden aria-label="크롭된 이미지">
            <header><span class="unilib-crop-tray-icon" aria-hidden="true">${ICONS.file}</span><strong>크롭된 이미지</strong><span class="unilib-crop-tray-count" data-unilib-crop-tray-count>0개</span><span class="unilib-crop-tray-miniatures" data-unilib-crop-tray-miniatures aria-hidden="true"></span><button type="button" class="unilib-button unilib-crop-tray-clear" data-unilib-crop-tray-clear>모두 비우기</button><button type="button" class="unilib-button" data-unilib-crop-tray-toggle aria-expanded="false">펼쳐보기</button></header>
            <div class="unilib-crop-tray-body"><div class="unilib-crop-tray-gallery" data-unilib-crop-tray-gallery></div></div>
          </section>
        </section>
        <aside class="unilib-pane unilib-preview library-reader" data-unilib-preview aria-label="선택 자료 미리보기">
          <div class="unilib-pane-head unilib-preview-heading"><div class="unilib-preview-heading-main"><h3 data-unilib-preview-title>미리보기</h3><p data-unilib-preview-kind>자료를 선택하세요</p><span class="unilib-example-note" data-unilib-preview-example hidden>목업 · 예시 자료</span></div><button type="button" class="unilib-answer-toggle" data-unilib-answers hidden aria-pressed="true" title="정답 선지 형광펜 보이기/숨기기 — 화면 표시만">정답</button></div>
          <div class="unilib-preview-scroll library-reader-main"><div class="unilib-representations" data-unilib-representations hidden role="group" aria-label="문항 표시 범위"></div><nav class="unilib-match-nav" data-unilib-match-nav hidden aria-label="PDF 일치 페이지"><button type="button" data-unilib-match-prev aria-label="이전 일치" title="이전 일치">‹</button><output data-unilib-match-position></output><button type="button" data-unilib-match-next aria-label="다음 일치" title="다음 일치">›</button></nav><details class="unilib-highlight-legend" data-unilib-highlight-legend hidden><summary>검색어 강조</summary><ul></ul></details><div class="unilib-stage library-reader-preview" data-unilib-stage><span>검색 결과를 선택하세요.</span></div><div class="unilib-match-context" data-unilib-match-context hidden></div><div class="unilib-part-options" data-unilib-part-options hidden></div></div>
          <div class="unilib-preview-foot library-reader-actions"><div class="unilib-source" hidden>${ICONS.file}<div class="unilib-source-inline"><strong data-unilib-source-name>—</strong><span data-unilib-source-meta>—</span></div><div class="unilib-source-actions" hidden><button type="button" data-unilib-source-open hidden>원문 페이지</button><button type="button" data-unilib-source-download hidden>컴퓨터에 저장</button></div></div><p data-unilib-ai-help hidden>PDF에서 필요한 영역을 자르고 작업대에 넣으면 AI 이미지/그래프를 사용할 수 있습니다.</p><div class="unilib-actions"><button type="button" class="unilib-button" data-unilib-adjust hidden>PDF에서 자르기</button><button type="button" data-unilib-insert hidden disabled>캔버스에 삽입</button><button type="button" class="unilib-button" data-unilib-send disabled aria-haspopup="menu" aria-expanded="false" aria-controls="unilib-send-menu" title="고른 그림을 한글 시험지나 5E_exam 문항 카드로 보냅니다">보내기</button><div class="unilib-send-menu" id="unilib-send-menu" role="menu" hidden><button type="button" role="menuitem" data-unilib-send-to="hwp">${SEND_ICONS.hwp}<span>한글 시험지로</span><small>5E_hwp</small></button><button type="button" role="menuitem" data-unilib-send-to="exampool">${SEND_ICONS.exampool}<span>5E_exam 문항 카드로</span><small>가져온 자료</small></button></div><button type="button" class="unilib-button" data-unilib-ai disabled>AI 이미지/그래프</button></div></div>
        </aside>
        <button class="unilib-scrim" data-unilib-scrim type="button" aria-label="열린 패널 닫기"></button>
      </div>
      <div class="unilib-crop library-reader--expanded" data-unilib-crop hidden role="dialog" aria-modal="true" aria-labelledby="unilib-crop-title"><header><strong id="unilib-crop-title">여러 영역 크롭</strong><div class="unilib-crop-view-controls"><span class="unilib-crop-page-controls" data-unilib-crop-page-controls hidden><button type="button" class="unilib-button" data-unilib-crop-page-prev aria-label="이전 쪽">‹</button><output data-unilib-crop-page aria-label="현재 PDF 쪽"></output><button type="button" class="unilib-button" data-unilib-crop-page-next aria-label="다음 쪽">›</button></span><button type="button" class="unilib-button" data-unilib-crop-zoom-out aria-label="축소">−</button><output data-unilib-crop-zoom aria-label="확대 비율">100%</output><button type="button" class="unilib-button" data-unilib-crop-zoom-in aria-label="확대">＋</button><button type="button" class="unilib-button" data-unilib-crop-fit>좌우 맞춤</button></div></header><div class="unilib-crop-workspace library-reader-main"><div class="unilib-crop-stage-shell"><div class="unilib-crop-stage library-reader-preview" data-unilib-crop-stage tabindex="0" aria-label="PDF 페이지에서 자를 영역 선택 · Enter로 첫 영역 만들기, 다음 영역은 Shift+Enter, 화살표로 이동, Shift와 화살표로 크기 조절"><div class="unilib-crop-canvas" data-unilib-crop-canvas><img data-unilib-crop-image draggable="false" alt="자를 원문 PDF 페이지"><div class="unilib-crop-accepted-layer" data-unilib-crop-accepted-layer aria-hidden="true"></div><div class="unilib-crop-draft" data-unilib-crop-box aria-hidden="true"></div></div></div><div class="unilib-crop-load-state" data-unilib-crop-load-state role="status" hidden><span class="unilib-crop-spinner" aria-hidden="true"></span><span data-unilib-crop-load-message>PDF 페이지를 불러오는 중입니다…</span><button type="button" class="unilib-button" data-unilib-crop-retry hidden>다시 시도</button></div><div class="unilib-crop-quality" data-unilib-crop-quality role="status" aria-live="polite" hidden><span class="unilib-crop-quality-spinner" aria-hidden="true"></span><span data-unilib-crop-quality-message>고해상도 원본 준비 중…</span><button type="button" class="unilib-button" data-unilib-crop-quality-retry hidden>다시 시도</button></div></div><aside class="unilib-crop-preview library-reader-sidebar"><div class="unilib-crop-collection-heading"><strong data-unilib-crop-count>크롭 이미지 0개</strong></div><div class="unilib-crop-card-grid"><div class="unilib-crop-collection library-crop-collection" data-unilib-crop-collection aria-label="추가한 자르기 영역"></div><section class="unilib-crop-draft-review" data-unilib-crop-draft-review hidden aria-label="추가할 영역 미리보기"><canvas data-unilib-crop-preview aria-label="현재 선택 영역 미리보기"></canvas><div class="unilib-crop-draft-meta"><strong>추가할 영역</strong><div class="unilib-crop-confirm" data-unilib-crop-confirm hidden><strong>이 영역을 추가할까요?</strong><button type="button" class="unilib-button" data-unilib-crop-draft-cancel>취소</button><button type="button" class="unilib-button" data-unilib-crop-save title="Enter / Space" disabled>추가</button></div></div></section></div><p class="unilib-crop-selection" data-unilib-crop-selection role="status" aria-live="polite">추가한 영역이 없습니다.</p></aside></div><footer class="unilib-crop-footer"><button type="button" class="unilib-button" data-unilib-crop-cancel>닫기</button><button type="button" class="unilib-primary" data-unilib-crop-workbench disabled>작업대에 넣기</button></footer></div>
      <div class="unilib-dialog-backdrop" data-unilib-drive-settings hidden><section class="unilib-dialog" role="dialog" aria-modal="true" aria-labelledby="unilib-drive-settings-title"><header><h3 id="unilib-drive-settings-title">Drive 자료 연결</h3><button type="button" class="unilib-icon-button" data-unilib-drive-settings-close aria-label="Drive 자료 연결 닫기">${ICONS.close}</button></header><div data-unilib-folder-manager><p class="unilib-folder-guidance">공개 읽기 전용 폴더를 연결하면 파일 목록과 검색 색인을 먼저 읽고, PDF 원문은 필요할 때만 가져옵니다.</p><div data-unilib-drive-settings-body></div></div></section></div>
      <div class="unilib-dialog-backdrop" data-unilib-local-install hidden><section class="unilib-dialog unilib-local-install-dialog" role="dialog" aria-modal="true" aria-labelledby="unilib-local-install-title"><header><h3 id="unilib-local-install-title" tabindex="-1">설치형 5E에서 폴더 연결하기</h3><button type="button" class="unilib-icon-button" data-unilib-local-install-close aria-label="설치 안내 닫기">${ICONS.close}</button></header><div class="unilib-local-install-body"><p>내 컴퓨터의 폴더를 연결하려면 설치형 5E가 필요합니다.</p><a class="unilib-local-install-download ai-action-motion" data-ai-orbit="true" href="${DESKTOP_RELEASE_URL}" target="_blank" rel="noopener noreferrer"><span class="ai-action-motion-label">설치형 다운로드</span></a></div></section></div>
      <p class="unilib-status" data-unilib-status role="status" aria-live="polite" hidden></p>
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

const SEND_ICONS = {
  hwp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10v17H7zM9.5 8h5M9.5 11h5M9.5 14h3"/></svg>',
  exampool: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5"/></svg>',
};
const MAX_RESTORED_CARDS = 600;
const RESULT_SECTIONS = Object.freeze([
  ["question", "문항", (result) => result.kind === "crop", 6],
  ["pdf", "PDF 쪽", (result) => result.kind === "pdf" || result.kind === "page", 3],
  ["image", "이미지", (result) => result.kind === "image", 6],
]);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/gu, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const escapeAttr = escapeHtml;
const LIBRARY_SUBJECTS = Object.freeze([["p1", "물리Ⅰ", "물리학Ⅰ"], ["p2", "물리Ⅱ", "물리학Ⅱ"], ["c1", "화학Ⅰ", "화학Ⅰ"], ["c2", "화학Ⅱ", "화학Ⅱ"],
  ["b1", "생명Ⅰ", "생명과학Ⅰ"], ["b2", "생명Ⅱ", "생명과학Ⅱ"], ["e1", "지구Ⅰ", "지구과학Ⅰ"], ["e2", "지구Ⅱ", "지구과학Ⅱ"]]);
const LIBRARY_ROOT_GROUPS = Object.freeze([["provided", "5E 제공", "공용"], ["drive", "내 구글 드라이브", "공유 폴더"],
  ["local", "로컬 폴더", "연결한 폴더"]]);
const GROUP_ICONS = Object.freeze({ provided: ICONS.provided, drive: ICONS.cloud, local: ICONS.laptop });
const KIND_ICONS = Object.freeze({ all: ICONS.kindAll, question: ICONS.kindQuestion, pdf: ICONS.kindPdf, image: ICONS.kindImage });
// 최신순: 기출은 학년도·시험 순(provider와 같은 비교), 그 밖의 자료는 원래 순서 그대로 뒤에.
function compareRecent(left, right) {
  const a = left.metadata?.academicYear, b = right.metadata?.academicYear;
  if (!Number.isInteger(a) || !Number.isInteger(b)) return Number(Number.isInteger(b)) - Number(Number.isInteger(a));
  return compareExamResults(left, right);
}
const PROVIDED_ROOT_LABELS = /^(5E 공유 자료|학력평가|과학 부품)/u;
function libraryRootGroup(source) {
  if (source.origin === "local") return "local";
  return PROVIDED_ROOT_LABELS.test(String(source.label ?? "")) ? "provided" : "drive";
}
// 11-05 시안 v13: 기출 문항 별표는 5E_exam과 같은 저장 칸을 쓴다(assets/exampool/sheet/card-shared.js의 store와 같은 이름).
const EXAM_STORE_PREFIX = `${/^\/preview(?:\/|$)/u.test(globalThis.location?.pathname || "") ? "5e.preview:" : ""}exampool-card:`;
export function examStars() {
  try { return JSON.parse(globalThis.localStorage?.getItem(`${EXAM_STORE_PREFIX}stars`) || "null") || {}; } catch { return {}; }
}
export function setExamStar(pastId, on) {
  const stars = examStars(), key = `past:${pastId}`;
  if (on) stars[key] = Date.now(); else delete stars[key];
  try { globalThis.localStorage?.setItem(`${EXAM_STORE_PREFIX}stars`, JSON.stringify(stars)); } catch { return false; }
  return true;
}
// 라이브러리 기출 문항 → exam 기출 id(「p1_2027_06.pdf」 13번 → 「p1_2027_06_13」). 평가원 기출 시험지 파일이 아니면 null.
export function pastQuestionId(result) {
  if (result?.kind !== "crop" || result.cropType !== "question") return null;
  const file = String(result.provenance?.displayName || result.provenance?.locator || "").split(/[\\/]/u).pop();
  const match = /^([a-z]\d?_\d{4}_\d{2})\.pdf$/iu.exec(file), no = Number(result.metadata?.itemNumber);
  // exam 기출 목록은 평가원(6·9월 모의평가, 11월 수능)만 있다 — 학평에는 별표를 달지 않는다(exam에서 안 보이므로).
  if (!match || !/_(06|09|11)$/u.test(match[1])) return null;
  return Number.isInteger(no) && no > 0 ? `${match[1]}_${String(no).padStart(2, "0")}` : null;
}
function paintStar(button, on) {
  button.classList.toggle("is-on", on);
  button.setAttribute("aria-pressed", String(on));
  button.title = on ? "별표 빼기" : "별표 — 5E_exam 「★ 별표만」에도 나옵니다";
  button.setAttribute("aria-label", on ? "별표 빼기" : "별표");
}

export function createUnifiedLibraryUi({ getProvider, prepareSearch, insertMaterialized, sendTo, openAi, openIndependentReferences, openGraph, pdfUi, pdfDetailsElement, onImportedImages, onDesktopSnapshot, desktopLibrary = globalThis.fiveEDesktop?.pdfLibrary, storage = channelStorage, initialSearchReadiness = "ready" }) {
  const overlay = buildShell();
  // 자르기 창·크롭 모음이 열렸는지를 overlay 속성으로 옮겨 둔다. CSS가 :has(...:not([hidden]))로 보면, 목록 안의 그림 칸이
  // hidden을 바꿀 때마다 overlay 전체 스타일을 다시 계산해 스크롤이 끊긴다(바쁜 컴퓨터에서 스크롤 프레임 대부분 50ms 초과).
  {
    const tray = overlay.querySelector("[data-unilib-crop-tray]"), crop = overlay.querySelector("[data-unilib-crop]");
    const mirror = () => {
      const set = (k, on) => { if ((overlay.dataset[k] === "true") !== on) overlay.dataset[k] = String(on); };
      set("cropTrayOpen", !!tray && !tray.hidden); set("cropTrayExpanded", !!tray && tray.classList.contains("is-expanded")); set("cropOpen", !!crop && !crop.hidden);
    };
    const watch = new MutationObserver(mirror);
    for (const node of [tray, crop]) if (node) watch.observe(node, { attributes: true, attributeFilter: ["hidden", "class"] });
    mirror();
  }
  // 11-07 「정답 표시」 켜기/끄기(exam 기출 보기와 같은 값). 끄면 형광펜만 숨긴다.
  {
    const apply = (on) => { overlay.dataset.answersOff = String(!on); overlay.querySelector("[data-unilib-answers]")?.setAttribute("aria-pressed", String(on)); };
    apply(answersShown()); onAnswersShown(apply);
    overlay.querySelector("[data-unilib-answers]")?.addEventListener("click", () => { setAnswersShown(!answersShown()); apply(answersShown()); });
  }
  const root = overlay.querySelector(".unilib");
  overlay.querySelector('.unilib-folder-loading-spinner').replaceWith(createLoadingDots());
  const resultDots = createLoadingDots();
  overlay.querySelector('[data-unilib-result-state]').prepend(resultDots);
  const motion = createModalSurfaceMotion({overlay,surface:root,springFrequency:48,animateSurface:false});
  for (const [attribute,anchor] of [['data-unilib-graph','[data-unilib-ai]'],['data-unilib-crop-graph','[data-unilib-crop-workbench]'],['data-unilib-crop-insert','[data-unilib-crop-workbench]']]) {
    const button=document.createElement('button');button.type='button';button.className='unilib-button';
    button.setAttribute(attribute,'');button.disabled=true;button.textContent=attribute==='data-unilib-crop-insert'?'캔버스에 넣기':'좌표/함수 생성';
    overlay.querySelector(anchor).after(button);
  }
  const help = overlay.querySelector("[data-unilib-help]");
  const tree = overlay.querySelector("[data-unilib-tree]");
  const localFolderAdd = overlay.querySelector("[data-unilib-local-folder-add]");
  const localInstall = overlay.querySelector("[data-unilib-local-install]");
  document.addEventListener("pointerdown", (event) => {
    if (help.open && !help.contains(event.target)) help.open = false;
  }, true);
  localFolderAdd.hidden = false;
  localFolderAdd.addEventListener("click", async () => {
    if (!desktopLibrary?.pickFolder) {
      localFolderAdd.closest("details").open = false;
      openLocalInstall(localFolderAdd);
      return;
    }
    localFolderAdd.disabled = true;
    try {
      const connection = await desktopLibrary.pickFolder();
      if (!connection?.connectionId) return;
      await refreshDesktopSources(true);
      await runSearch();
      localFolderAdd.closest("details").open = false;
    } catch (error) {
      setStatus(`로컬 폴더 연결 실패: ${error instanceof Error ? error.message : error}`, true);
    } finally {
      localFolderAdd.disabled = false;
    }
  });
  const list = overlay.querySelector("[data-unilib-results]");
  const libraryLoading = createLibraryLoading({ header: overlay.querySelector('.unilib-mid-head'), grid: overlay.querySelector('.unilib-result-scroll') });
  const query = overlay.querySelector("[data-unilib-query]");
  const stage = overlay.querySelector("[data-unilib-stage]");
  const partOptionsHost = overlay.querySelector("[data-unilib-part-options]");
  const driveSettings = overlay.querySelector("[data-unilib-drive-settings]");
  const driveSettingsBody = overlay.querySelector("[data-unilib-drive-settings-body]");
  const driveHost = pdfUi?.getDriveHost?.();
  if (driveHost) driveSettingsBody.append(driveHost);
  const getPartOptions = createPartOptions(partOptionsHost, () => void renderPreview());
  const previewCache = new Map();
  const thumbnailCache = createBoundedPageCache(64);
  const continuousPageCache = createBoundedPageCache();
  let results = [];
  let selectedId = null;
  const acceptedAssets = new Map();
  let activeTypes = [...LIBRARY_TYPES];
  let pdfDisplayMode = "page";
  const examFilters = { subject: "", startYear: null, endYear: null, administration: "" };
  // 11-05: 왼쪽 「조건」 칸(시안 5e-design-mockups/library-1105.html) — 과목 바둑판 → 고른 과목의 단원 · 연도 막대와 끌기 · 시험 · 모양.
  // 개수는 지금 검색어·검색 위치에서 걸리는 문항 수(provider.facetCounts). 각 묶음은 자기 조건만 빼고 센다.
  const conditions = { subjects: new Set(), parts: new Set(), startYear: null, endYear: null, exam: "", shapes: new Set() };
  const conditionsHost = overlay.querySelector("[data-unilib-conditions]");
  const conditionsClear = overlay.querySelector("[data-unilib-conditions-clear]");
  const knownParts = new Map();
  let knownYears = [];
  const anyCondition = () => Boolean(conditions.subjects.size || conditions.parts.size || conditions.startYear != null
    || conditions.endYear != null || conditions.exam || conditions.shapes.size);
  const conditionFilters = () => ({
    subjects: [...conditions.subjects], parts: [...conditions.parts], exam: conditions.exam, shapes: [...conditions.shapes],
    ...(conditions.startYear != null ? { startYear: conditions.startYear } : {}),
    ...(conditions.endYear != null ? { endYear: conditions.endYear } : {}),
  });
  const conditionCount = (n) => `<small>${Number(n || 0).toLocaleString("ko-KR")}</small>`;
  function renderConditions(counts) {
    if (!conditionsHost) return;
    for (const key of Object.keys(counts?.parts ?? {})) { const [code, part] = key.split("|"); if (!knownParts.has(code)) knownParts.set(code, new Set()); knownParts.get(code).add(part); }
    const years = [...new Set([...knownYears, ...Object.keys(counts?.years ?? {}).map(Number)])].filter(Number.isInteger).sort((a, b) => a - b);
    knownYears = years;
    const y0 = years[0], y1 = years.at(-1);
    const from = conditions.startYear ?? y0, to = conditions.endYear ?? y1;
    const subjectsHtml = LIBRARY_SUBJECTS.map(([code, label]) => {
      const n = counts?.subjects?.[code] ?? 0, on = conditions.subjects.has(code);
      return `<button type="button" class="unilib-subject${on ? " is-on" : ""}${n ? "" : " is-zero"}" data-cond-subject="${code}" aria-pressed="${on}"><span>${label}</span>${conditionCount(n)}</button>`;
    }).join("");
    const partsHtml = [...conditions.subjects].map((code) => {
      const parts = [...(knownParts.get(code) ?? [])].sort((a, b) => a.localeCompare(b, "ko"));
      if (!parts.length) return "";
      const name = LIBRARY_SUBJECTS.find(([value]) => value === code)?.[2] ?? code;
      return `<div class="unilib-cond-sub">${name} 단원</div>` + parts.map((part) => {
        const key = `${code}|${part}`, n = counts?.parts?.[key] ?? 0, on = conditions.parts.has(key);
        return `<label class="unilib-cond-check${n ? "" : " is-zero"}"><input type="checkbox" data-cond-part="${escapeAttr(key)}"${on ? " checked" : ""}><span>${escapeHtml(part)}</span>${conditionCount(n)}</label>`;
      }).join("");
    }).join("");
    const histMax = Math.max(1, ...years.map((year) => counts?.years?.[year] ?? 0));
    const yearHtml = years.length > 1 ? `<div class="unilib-cond-sec"><span>연도</span><small data-cond-year-label>${conditions.startYear == null && conditions.endYear == null ? "전체" : `${from} – ${to}`}</small></div>
      <div class="unilib-year-hist" aria-hidden="true">${years.map((year) => `<i class="${year >= from && year <= to ? "is-in" : ""}" style="height:${Math.max(6, Math.round((counts?.years?.[year] ?? 0) / histMax * 100))}%" title="${year} · ${counts?.years?.[year] ?? 0}문항"></i>`).join("")}</div>
      <div class="unilib-year-slider" style="--from:${(from - y0) / (y1 - y0) * 100}%;--to:${(to - y0) / (y1 - y0) * 100}%"><span class="unilib-year-track"></span><input type="range" min="${y0}" max="${y1}" value="${from}" data-cond-year="start" aria-label="시작 학년도"><input type="range" min="${y0}" max="${y1}" value="${to}" data-cond-year="end" aria-label="끝 학년도"></div>
      <div class="unilib-year-ends"><span>${y0}</span><span>${y1}</span></div>` : "";
    const examHtml = `<div class="unilib-cond-sec"><span>시험</span></div><div class="unilib-cond-seg" role="group" aria-label="시험">${[["", "전체"], ["kice", "수능·모평"], ["hak", "학평"]].map(([value, label]) => `<button type="button" data-cond-exam="${value}" aria-pressed="${conditions.exam === value}">${label}</button>`).join("")}</div>`;
    const shapesHtml = `<div class="unilib-cond-sec"><span>모양</span></div>${[["figure", "그림 있음"], ["table", "표 있음"], ["bogi", "〈보기〉 있음"]].map(([key, label]) => `<label class="unilib-cond-check"><input type="checkbox" data-cond-shape="${key}"${conditions.shapes.has(key) ? " checked" : ""}><span>${label}</span>${conditionCount(counts?.shapes?.[key])}</label>`).join("")}`;
    const scroller = conditionsHost.closest(".unilib-folder-scroll"), top = scroller?.scrollTop ?? 0;
    conditionsHost.innerHTML = `<div class="unilib-cond-sec"><span>과목</span>${conditions.subjects.size || conditions.parts.size ? '<button type="button" class="unilib-link-button" data-cond-clear="subjects">지우기</button>' : ""}</div><div class="unilib-subject-grid">${subjectsHtml}</div>${partsHtml}${yearHtml}${examHtml}${shapesHtml}`;
    if (scroller) scroller.scrollTop = top;
    if (conditionsClear) conditionsClear.hidden = !anyCondition();
    updateConditionSummary();
  }
  async function refreshConditions(activeProvider, queryText, filters) {
    if (typeof activeProvider?.facetCounts !== "function") { const box = conditionsHost?.closest("[data-unilib-box]"); if (box) box.hidden = true; return; }
    if (!knownYears.length) knownYears = [...(activeProvider.getExamFilterOptions?.().academicYears ?? [])];
    renderConditions(activeProvider.facetCounts({ query: queryText, sourceIds: enabledSources ? [...enabledSources] : null, filters }));
  }
  conditionsHost?.addEventListener("click", (event) => {
    const subject = event.target.closest("[data-cond-subject]"), exam = event.target.closest("[data-cond-exam]"), clear = event.target.closest("[data-cond-clear]");
    if (subject) {
      const code = subject.dataset.condSubject;
      if (conditions.subjects.has(code)) { conditions.subjects.delete(code); for (const key of [...conditions.parts]) if (key.startsWith(`${code}|`)) conditions.parts.delete(key); }
      else conditions.subjects.add(code);
    } else if (exam) conditions.exam = exam.dataset.condExam;
    else if (clear) { conditions.subjects.clear(); conditions.parts.clear(); }
    else return;
    void runSearch();
  });
  conditionsHost?.addEventListener("change", (event) => {
    const part = event.target.closest("[data-cond-part]"), shape = event.target.closest("[data-cond-shape]"), year = event.target.closest("[data-cond-year]");
    if (part) part.checked ? conditions.parts.add(part.dataset.condPart) : conditions.parts.delete(part.dataset.condPart);
    else if (shape) shape.checked ? conditions.shapes.add(shape.dataset.condShape) : conditions.shapes.delete(shape.dataset.condShape);
    else if (year) {
      const [a, b] = [...conditionsHost.querySelectorAll("[data-cond-year]")].map((input) => Number(input.value));
      const lo = Math.min(a, b), hi = Math.max(a, b);
      conditions.startYear = lo === knownYears[0] ? null : lo;
      conditions.endYear = hi === knownYears.at(-1) ? null : hi;
    } else return;
    void runSearch();
  });
  // 끄는 동안에는 숫자·막대만 바로 바꾸고, 놓을 때(change) 검색한다.
  conditionsHost?.addEventListener("input", (event) => {
    if (!event.target.closest("[data-cond-year]")) return;
    const [a, b] = [...conditionsHost.querySelectorAll("[data-cond-year]")].map((input) => Number(input.value));
    const lo = Math.min(a, b), hi = Math.max(a, b), y0 = knownYears[0], y1 = knownYears.at(-1);
    const slider = conditionsHost.querySelector(".unilib-year-slider");
    slider?.style.setProperty("--from", `${(lo - y0) / (y1 - y0) * 100}%`);
    slider?.style.setProperty("--to", `${(hi - y0) / (y1 - y0) * 100}%`);
    const label = conditionsHost.querySelector("[data-cond-year-label]");
    if (label) label.textContent = lo === y0 && hi === y1 ? "전체" : `${lo} – ${hi}`;
    conditionsHost.querySelectorAll(".unilib-year-hist i").forEach((bar, index) => bar.classList.toggle("is-in", knownYears[index] >= lo && knownYears[index] <= hi));
  });
  conditionsClear?.addEventListener("click", () => {
    conditions.subjects.clear(); conditions.parts.clear(); conditions.shapes.clear(); conditions.exam = ""; conditions.startYear = null; conditions.endYear = null;
    void runSearch();
  });
  const storedSources = loadSourceState(storage);
  let enabledSources = storedSources.enabled;
  const excludedSourceGroups = storedSources.excludedGroups;
  const expandedSources = loadExpandedSources(storage);
  let treeExpansionInitialized = (() => { try { return storage.getItem(TREE_STORAGE_KEY) !== null; } catch { return false; } })();
  let searchPaneOpen = loadPaneOpen(storage);
  // 11-05: 미리보기 접기 단추는 뺐다(사용자) — 미리보기는 늘 열어 둔다(전에 접어 둔 기록도 무시).
  let previewPaneOpen = true;
  const isLiteMode = () => document.documentElement.dataset.mode === "lite";
  const foldersToggle = overlay.querySelector("[data-unilib-folders-open]");
  // 11-05: 넓은 화면에서는 「검색 위치」 접기 단추를 그 칸 머리줄 오른쪽으로(5E_image 패널 머리줄과 같게). 접으면 44px 줄 맨 위에 남는다.
  // 좁은 화면(서랍)에서는 원래 자리(맨 위 제목 옆)에 둔다.
  {
    const brand = overlay.querySelector(".unilib-brand"), head = overlay.querySelector(".unilib-folders .unilib-pane-head");
    const wideLib = window.matchMedia("(min-width: 768px)");
    const placeToggle = () => { if (wideLib.matches) { if (foldersToggle.parentElement !== head) head?.append(foldersToggle); } else if (foldersToggle.parentElement !== brand) brand?.prepend(foldersToggle); };
    placeToggle(); wideLib.addEventListener?.("change", placeToggle);
  }
  const setSearchPaneOpen = (open) => {
    if (isLiteMode()) open = true;
    else searchPaneOpen = open;
    root.classList.toggle("folders-collapsed", !open);
    foldersToggle.setAttribute("aria-expanded", String(open));
    foldersToggle.setAttribute("aria-label", `검색 위치 ${open ? "접기" : "펼치기"}`);
    if (!isLiteMode()) { try { storage.setItem(PANE_STORAGE_KEY, String(open)); } catch {} }
  };
  // ── 11-05 시안 v8(5e-design-mockups/library-1105-v8.html) ──
  // 종류 탭을 왼쪽 「찾기」 칸 맨 위 한 줄로(아이콘 + 이름 + 개수). 접힌 칸에서는 아이콘 줄로 남는다.
  const kindsHost = overlay.querySelector("[data-unilib-kinds]"), kindTabs = overlay.querySelector(".unilib-tabs");
  if (kindsHost && kindTabs) {
    kindsHost.append(kindTabs);
    kindTabs.querySelectorAll("[data-unilib-type]").forEach((button) => {
      const type = button.dataset.unilibType, name = button.textContent.trim();
      button.classList.add(`unilib-kind-${type}`);
      button.title = name;
      button.innerHTML = `<span class="unilib-kind-icon">${KIND_ICONS[type] ?? ""}</span><span class="unilib-kind-name">${name}</span>`;
    });
    overlay.querySelector("[data-unilib-rail]")?.prepend(...[...kindTabs.children].map((button) => {
      const mirror = document.createElement("button");
      mirror.type = "button"; mirror.className = `unilib-rail-button unilib-kind-${button.dataset.unilibType}`; mirror.dataset.unilibRailType = button.dataset.unilibType;
      mirror.title = button.title; mirror.innerHTML = `<span class="unilib-kind-icon">${KIND_ICONS[button.dataset.unilibType] ?? ""}</span>`;
      mirror.addEventListener("click", () => button.click());
      return mirror;
    }));
  }
  // 11-05 시안 v13: PDF 칩(접힌 칸에서는 아이콘)에 마우스를 올리면 「페이지로 / 파일로 보기」가 스르륵 내려온다.
  // 로고 「5E_image ▾」 목록(app-switch-menu.js)과 같은 움직임: 0.12초 뒤 열림, 떼면 0.3초 뒤 닫힘, 눌러도 열림. 가운데 「파일·페이지」 줄은 없앤다.
  // body 끝에 div를 더하면 「.unified-library-overlay:last-of-type」으로 라이브러리 창을 찾는 곳이 어긋난다 — 다른 태그(nav)로 둔다.
  const pdfMenu = document.createElement("nav");
  pdfMenu.className = "unilib-pdf-menu"; pdfMenu.setAttribute("role", "menu"); pdfMenu.setAttribute("aria-label", "PDF 보기 방식");
  pdfMenu.innerHTML = [["page", "페이지로 보기", "쪽마다 한 장", ICONS.kindPdf], ["file", "파일로 보기", "시험지마다 한 줄", ICONS.file]]
    .map(([mode, label, note, icon]) => `<button type="button" role="menuitem" data-unilib-pdf-pick="${mode}"><span class="unilib-pdf-menu-icon" aria-hidden="true">${icon}</span><span><b>${label}</b><small>${note}</small></span></button>`).join("");
  document.body.append(pdfMenu);
  let pdfMenuTimer = 0;
  const pdfTriggers = () => [...overlay.querySelectorAll('[data-unilib-type="pdf"], [data-unilib-rail-type="pdf"]')];
  const closePdfMenu = () => { clearTimeout(pdfMenuTimer); pdfMenu.classList.remove("is-open"); pdfTriggers().forEach((trigger) => { trigger.classList.remove("is-menu-open"); trigger.setAttribute("aria-expanded", "false"); }); };
  const openPdfMenu = (trigger) => {
    clearTimeout(pdfMenuTimer);
    if (overlay.hidden || !trigger.getClientRects().length) return;
    const pdfOnly = activeTypes.length === 1 && activeTypes[0] === "pdf";
    pdfMenu.querySelectorAll("[data-unilib-pdf-pick]").forEach((item) => item.setAttribute("aria-current", String(pdfOnly && item.dataset.unilibPdfPick === pdfDisplayMode)));
    const rect = trigger.getBoundingClientRect(), side = trigger.matches("[data-unilib-rail-type]");
    pdfMenu.classList.toggle("is-side", side);
    Object.assign(pdfMenu.style, side ? { left: `${rect.right + 8}px`, top: `${rect.top}px` } : { left: `${rect.left}px`, top: `${rect.bottom + 8}px` });
    pdfMenu.classList.add("is-open");
    pdfTriggers().forEach((item) => { item.classList.toggle("is-menu-open", item === trigger); item.setAttribute("aria-expanded", String(item === trigger)); });
  };
  pdfTriggers().forEach((trigger) => {
    trigger.setAttribute("aria-haspopup", "menu"); trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("title"); delete trigger.dataset.tip;
    trigger.querySelector(".unilib-kind-name")?.insertAdjacentHTML("beforeend", '<i class="unilib-kind-caret" aria-hidden="true"><svg viewBox="0 0 14 14"><path d="M3.5 5.5 7 9l3.5-3.5"/></svg></i>');
    trigger.addEventListener("mouseenter", () => { clearTimeout(pdfMenuTimer); pdfMenuTimer = setTimeout(() => openPdfMenu(trigger), 120); });
    trigger.addEventListener("mouseleave", () => { clearTimeout(pdfMenuTimer); pdfMenuTimer = setTimeout(closePdfMenu, 300); });
    trigger.addEventListener("click", () => requestAnimationFrame(() => openPdfMenu(trigger)));
  });
  pdfMenu.addEventListener("mouseenter", () => clearTimeout(pdfMenuTimer));
  pdfMenu.addEventListener("mouseleave", () => { pdfMenuTimer = setTimeout(closePdfMenu, 300); });
  pdfMenu.addEventListener("click", (event) => {
    const item = event.target.closest("[data-unilib-pdf-pick]");
    if (!item) return;
    closePdfMenu();
    const mode = item.dataset.unilibPdfPick;
    if (!(activeTypes.length === 1 && activeTypes[0] === "pdf")) { pdfDisplayMode = mode; overlay.querySelector('[data-unilib-type="pdf"]')?.click(); }
    overlay.querySelector(`[data-unilib-pdf-mode="${mode}"]`)?.click();
  });
  document.addEventListener("pointerdown", (event) => { if (pdfMenu.classList.contains("is-open") && !pdfMenu.contains(event.target) && !pdfTriggers().some((item) => item.contains(event.target))) closePdfMenu(); }, true);
  // 11-05 시안 v13: 문항 카드는 누르면 보기만 하고, 왼쪽 위 ○를 눌러야 고른다(여러 개). 문항을 고르면 오른쪽 아래가 문항용 단추로 바뀐다.
  // 시험지에 넣기 · 문항 카드로 = 5E_exam 「변형」 줄(기출 id) · 한글 페이지로 = 기존 「보내기 → 한글 시험지로」 · 그림만 자르기 = 자르기 창.
  const pickedQuestions = new Map();
  let actionContext = null; // 문항과 크롭된 이미지가 둘 다 있을 때 어느 쪽 단추를 보일지(사용자가 고름)
  const Q_ICONS = {
    sheet: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4"/></svg>',
    card: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M7 9.5h6M7 13h10"/></svg>',
    hwp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h9l3.5 3.5v13a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z"/><path d="M8.5 11h7M8.5 14h7M8.5 17h4"/></svg>',
    crop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v13a2 2 0 0 0 2 2h13M3 6h13a2 2 0 0 1 2 2v13"/></svg>',
  };
  const qPanel = document.createElement("div");
  qPanel.className = "unilib-qpanel"; qPanel.hidden = true;
  qPanel.innerHTML = `<div class="unilib-qsel"><span>지금 고른 것</span><span class="unilib-ctxseg" data-unilib-ctxseg hidden><button type="button" data-unilib-ctx="question"></button><button type="button" data-unilib-ctx="image"></button></span><b data-unilib-qcount></b><button type="button" class="unilib-qlink" data-unilib-unpick>고르기 풀기</button></div>
    <div class="unilib-qactions">${[["sheet", "시험지에 넣기", "5E_exam 지금 시험지에 한글 문항으로 담습니다(없으면 새 시험지)"], ["card", "문항 카드로", "5E_exam에서 편집할 수 있는 한글 문항 카드로 만듭니다"], ["hwp", "한글 페이지로", "5E_hwp 지금 쪽에 넣습니다"], ["crop", "그림만 자르기", "보고 있는 문항의 시험지를 크게 열어 그림 부분을 자릅니다"]]
      .map(([key, label, tip]) => `<button type="button" class="unilib-button" data-unilib-qact="${key}" title="${tip}">${Q_ICONS[key]}${label}</button>`).join("")}</div>`;
  overlay.querySelector(".unilib-preview-foot .unilib-actions")?.before(qPanel);
  const syncQuestionPanel = () => {
    const nq = pickedQuestions.size, ni = acceptedAssets?.size || 0;
    const ctx = nq && ni ? (actionContext || "question") : nq ? "question" : "image";
    root.dataset.actionContext = nq && ctx === "question" ? "question" : "image";
    qPanel.hidden = !(nq && ctx === "question");
    const seg = qPanel.querySelector("[data-unilib-ctxseg]");
    seg.hidden = !(nq && ni);
    seg.querySelector('[data-unilib-ctx="question"]').textContent = `문항 ${nq}`;
    seg.querySelector('[data-unilib-ctx="image"]').textContent = `그림 ${ni}`;
    seg.querySelectorAll("[data-unilib-ctx]").forEach((button) => button.classList.toggle("is-on", button.dataset.unilibCtx === ctx));
    qPanel.querySelector("[data-unilib-qcount]").textContent = nq && ni ? "" : `문항 ${nq}개`;
    const past = [...pickedQuestions.values()].filter((result) => pastQuestionId(result)).length;
    const sheet = qPanel.querySelector('[data-unilib-qact="sheet"]'), card = qPanel.querySelector('[data-unilib-qact="card"]'), hwp = qPanel.querySelector('[data-unilib-qact="hwp"]');
    sheet.disabled = !past;
    sheet.title = past ? (past < nq ? `평가원 기출 ${past}문항만 시험지에 담습니다(학평은 5E_exam 기출 목록에 없음)` : "5E_exam 지금 시험지에 한글 문항으로 담습니다(없으면 새 시험지)") : "학평 문항은 5E_exam 기출 목록에 없어 시험지에 담을 수 없습니다 · 「문항 카드로」는 그림으로 보냅니다";
    card.title = past === nq ? "5E_exam에서 편집할 수 있는 한글 문항 카드로 만듭니다" : "평가원 기출은 한글 문항 카드로, 학평 문항은 그림으로 「가져온 자료」에 보냅니다";
    hwp.disabled = nq !== 1 || typeof sendTo !== "function";
    hwp.title = nq === 1 ? "5E_hwp 지금 쪽에 넣습니다" : "한글 페이지로는 한 문항씩 보냅니다 · 하나만 고르세요";
  };
  const paintPicks = () => list.querySelectorAll("[data-unilib-pick]").forEach((button) => {
    const on = pickedQuestions.has(button.dataset.unilibPick);
    button.setAttribute("aria-pressed", String(on)); button.title = on ? "고르기 풀기" : "이 문항 고르기";
    button.closest(".unilib-result-row")?.classList.toggle("is-picked", on);
  });
  const togglePick = (id) => {
    const result = results.find((item) => item.id === id);
    if (pickedQuestions.has(id)) pickedQuestions.delete(id); else if (result) pickedQuestions.set(id, result);
    actionContext = "question";
    paintPicks(); syncQuestionPanel();
  };
  const sendPast = (toExam) => {
    const picked = [...pickedQuestions.values()], ids = picked.map(pastQuestionId).filter(Boolean);
    if (!ids.length) return false;
    const request = { ids, toExam, accepted: false };
    window.dispatchEvent(new CustomEvent("5e:exampool-past", { detail: request }));
    if (!request.accepted) { setStatus("5E_exam을 열 수 없습니다.", true); return false; }
    return true;
  };
  qPanel.addEventListener("click", async (event) => {
    if (event.target.closest("[data-unilib-unpick]")) { pickedQuestions.clear(); paintPicks(); syncQuestionPanel(); return; }
    const ctxButton = event.target.closest("[data-unilib-ctx]");
    if (ctxButton) { actionContext = ctxButton.dataset.unilibCtx; syncQuestionPanel(); return; }
    const action = event.target.closest("[data-unilib-qact]")?.dataset.unilibQact;
    if (!action || event.target.closest("[data-unilib-qact]").disabled) return;
    if (action === "crop") { overlay.querySelector("[data-unilib-adjust]")?.click(); return; }
    if (action === "hwp") {
      const [only] = pickedQuestions.keys();
      if (selectedId !== only) list.querySelector(`[data-result-id="${CSS.escape(only)}"]`)?.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      overlay.querySelector('[data-unilib-send-to="hwp"]')?.click();
      return;
    }
    const nonPast = [...pickedQuestions.values()].filter((result) => !pastQuestionId(result));
    if (action === "card" && nonPast.length) {
      // 학평처럼 exam 기출 목록에 없는 문항은 지금처럼 그림으로 「가져온 자료」에 보낸다.
      for (const result of nonPast) {
        if (selectedId !== result.id) list.querySelector(`[data-result-id="${CSS.escape(result.id)}"]`)?.click();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        overlay.querySelector('[data-unilib-send-to="exampool"]')?.click();
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
    const sent = sendPast(action === "sheet");
    if (sent || (action === "card" && nonPast.length)) {
      const n = pickedQuestions.size;
      pickedQuestions.clear(); paintPicks(); syncQuestionPanel();
      if (sent) close();
      setStatus(action === "sheet" ? `5E_exam 시험지에 ${n}문항을 담는 중입니다` : `5E_exam 문항 카드 ${n}개를 만드는 중입니다`);
    }
  });
  // 문항 검색 조건: 머리줄 한 번으로 통째로 펴고 접는다. 접혀 있으면 지금 값만 한 줄(「물리1 외 2」).
  const condToggle = overlay.querySelector("[data-unilib-cond-toggle]"), condValue = overlay.querySelector("[data-unilib-cond-value]");
  let conditionsOpen = false;
  let pendingConditions = null, warmedProvider = null;
  const flushConditions = () => { const run = pendingConditions; pendingConditions = null; void run?.(); };
  const setConditionsOpen = (open) => {
    conditionsOpen = open;
    if (conditionsHost) conditionsHost.hidden = !open;
    condToggle?.setAttribute("aria-expanded", String(open));
    condToggle?.closest("[data-unilib-box]")?.classList.toggle("is-open", open);
  };
  condToggle?.addEventListener("click", () => { setConditionsOpen(!conditionsOpen); if (conditionsOpen) flushConditions(); });
  function updateConditionSummary() {
    if (!condValue) return;
    const yearSet = conditions.startYear != null || conditions.endYear != null;
    const subjectNames = [...conditions.subjects].map((code) => LIBRARY_SUBJECTS.find(([value]) => value === code)?.[1] ?? code);
    const shapeNames = [...conditions.shapes].map((key) => ({ figure: "그림", table: "표", bogi: "〈보기〉" })[key] ?? key);
    const parts = [subjectNames.join("·"), yearSet ? `${conditions.startYear ?? knownYears[0] ?? ""}–${conditions.endYear ?? knownYears.at(-1) ?? ""}` : "", ({ kice: "수능·모평", hak: "학평" })[conditions.exam] ?? "", shapeNames.join("·")].filter(Boolean);
    condValue.textContent = !parts.length ? "전체" : parts.length === 1 ? parts[0] : `${parts[0]} 외 ${parts.length - 1}`;
    condValue.title = parts.join(" · ") || "조건 없음";
    condValue.classList.toggle("is-set", parts.length > 0);
    const badge = overlay.querySelector('[data-unilib-rail-badge="conditions"]');
    if (badge) { badge.hidden = !parts.length; badge.textContent = String(parts.length); }
  }
  // 접힌 칸(아이콘 줄)에서 조건·파일 위치를 누르면 옆에 떠서 열린다. 칸을 펴거나 Esc·바깥을 누르면 닫힌다.
  const setFly = (name) => {
    if (name) root.dataset.fly = name; else delete root.dataset.fly;
    overlay.querySelectorAll("[data-unilib-fly]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.unilibFly === name)));
    if (name === "conditions") { setConditionsOpen(true); flushConditions(); }
  };
  overlay.querySelectorAll("[data-unilib-fly]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); setFly(root.dataset.fly === button.dataset.unilibFly ? null : button.dataset.unilibFly); }));
  overlay.addEventListener("pointerdown", (event) => { if (root.dataset.fly && !event.target.closest(".unilib-folders")) setFly(null); });
  overlay.addEventListener("keydown", (event) => { if (event.key === "Escape" && root.dataset.fly) { event.stopPropagation(); setFly(null); } }, true);
  foldersToggle.addEventListener("click", () => setFly(null));
  // 정렬: 정확도순(검색 점수) · 최신순(학년도·시험)
  let sortMode = "score";
  overlay.querySelectorAll("[data-unilib-sort]").forEach((button) => button.addEventListener("click", () => {
    if (sortMode === button.dataset.unilibSort) return;
    sortMode = button.dataset.unilibSort;
    overlay.querySelectorAll("[data-unilib-sort]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    void runSearch();
  }));
  // 맨 위 줄 오른쪽: 5E_image 맨 위 줄의 ChatGPT·버그 신고·테마·전체화면 단추를 그대로 비춰 보이고, 누르면 그 단추를 누른다.
  const globalHost = overlay.querySelector("[data-unilib-global-controls]");
  const syncGlobalControls = () => {
    if (!globalHost) return;
    const sources = [...document.querySelectorAll(".canvas-global-controls > button")].filter((button) => !button.closest(".unified-library-overlay"));
    globalHost.replaceChildren(...sources.map((source) => {
      const mirror = document.createElement("button");
      mirror.type = "button";
      mirror.className = `unilib-icon-button unilib-global-mirror${source.classList.contains("web-account-status") ? " is-account" : ""}`;
      mirror.innerHTML = source.innerHTML;
      for (const name of ["title", "aria-label", "aria-pressed", "data-state"]) { const value = source.getAttribute(name); if (value != null) mirror.setAttribute(name, value); }
      mirror.addEventListener("click", () => {
        // AI 작업대(ChatGPT)는 라이브러리 뒤에서 열리므로 라이브러리를 먼저 닫는다.
        if (source.classList.contains("web-account-status")) overlay.querySelector("[data-unilib-close]")?.click();
        source.click();
        requestAnimationFrame(syncGlobalControls);
      });
      return mirror;
    }));
    // 라이브러리 자신의 버그 신고 단추(js/bug-report.js가 닫기 앞에 붙임)는 ChatGPT 바로 뒤로.
    const bug = overlay.querySelector(".unilib-header-actions > .bug-report-open");
    if (bug) globalHost.querySelector(".is-account") ? globalHost.querySelector(".is-account").after(bug) : globalHost.prepend(bug);
  };
  new MutationObserver(() => { if (!overlay.hidden) syncGlobalControls(); }).observe(overlay, { attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("fullscreenchange", () => { if (!overlay.hidden) syncGlobalControls(); });
  {
    const heading = overlay.querySelector(".unilib-preview-heading");
    heading?.prepend(overlay.querySelector("[data-unilib-representations]"));
    heading?.append(overlay.querySelector("[data-unilib-match-nav]"));
  }
  const previewToggle = overlay.querySelector("[data-unilib-preview-toggle]");
  const setPreviewPaneOpen = (open) => {
    if (isLiteMode()) open = true;
    else previewPaneOpen = open;
    root.classList.toggle("preview-hidden", !open);
    root.classList.toggle("preview-open", open);
    previewToggle?.setAttribute("aria-pressed", String(open));
    previewToggle?.setAttribute("aria-label", `미리보기 ${open ? "접기" : "펼치기"}`);
    if (!isLiteMode()) { try { storage.setItem(PREVIEW_PANE_STORAGE_KEY, String(open)); } catch {} }
  };
  const setMobileFoldersOpen = (open) => {
    root.classList.toggle("folders-open", open);
    foldersToggle.setAttribute("aria-expanded", String(open));
    foldersToggle.setAttribute("aria-label", `검색 위치 ${open ? "닫기" : "열기"}`);
  };
  let activeRepresentation = "full";
  let activeFigureRepresentation = "figure:0";
  let sourcesInitialized = false;
  const knownSourceIds = new Set();
  let openEpoch = 0;
  let searchEpoch = 0;
  let searchReadiness = initialSearchReadiness;
  let pendingCatalogRefresh = false;
  let catalogUpdates = [];
  const readinessMessage = () => searchReadiness === "error"
    ? "본문 검색을 준비하지 못했습니다. 목록은 사용할 수 있습니다. 제공 자료를 다시 연결해 주세요."
    : "본문 검색 준비 중 · 지금은 파일명으로 찾을 수 있습니다.";
  const refreshCatalog = async () => {
    // Opening reads the latest catalog after settling. A background readiness
    // notification must not replace the source tree during that entrance.
    if (!motion.isOpen() || overlay.dataset.modalMotionState !== "open") return;
    if (!cropDialog.hidden) { pendingCatalogRefresh = true; return; }
    const epoch = openEpoch;
    const live = () => epoch === openEpoch && !overlay.hidden;
    await renderSources(live);
    if (live()) await runSearch({ preservePreview: true, preserveResultOrder: true });
  };
  let searchController = null;
  let requestSequence = 0;
  let pdfMatchIndex = 0;
  let previewEpoch = 0;
  let previewLoading = null;
  // 11-06 깜빡임: 카드를 바꿀 때 이전 미리보기를 바로 지우지 않는다. 새 그림이 0.4초 안에 오면 로딩 막대 없이 한 번에 바꾸고,
  // 늦을 때만 빈 종이·로딩 막대를 띄운다(흰 종이 → 회색 종이 → 그림으로 세 번 바뀌던 것).
  let previewLoadingTimer = 0;
  const PREVIEW_LOADING_DELAY = 400;
  const clearPreviewLoading = () => { clearTimeout(previewLoadingTimer); previewLoadingTimer = 0; previewLoading?.dispose(); previewLoading = null; };
  let continuousView = null;
  let thumbnailEpoch = 0;
  const thumbnailQueue = createThumbnailQueue();
  let thumbnailObserver = null;
  let renderedResultCount = 0;
  let appendResultBatch = () => {};
  let currentMaterialized = null;
  let currentMaterializedIdentity = null;
  let returnFocus = null;
  let driveSettingsReturnFocus = null;
  let lastInteractionWasKeyboard = false;
  let desktopConnections = [];
  let desktopWarnings = [];
  let pendingIndexCount = 0;
  let actionBusy = false;
  let actionRevision = 0;
  let spaceAssignmentIdentity = null;
  let draftCrop = null;
  let providedRetry = null;
  let cropGesture = null;
  let cropSession = null;
  let cropDocumentFile = null;
  let cropSelectionChanged = false;
  let cropPreviewEpoch = 0;
  let pendingCropConfirmation = null;
  let cropPreviewExact = false;
  let cropExact = null;
  let cropActionBusy = false;
  let acceptedCrops = [];
  let activeAcceptedCropId = null;
  let cropSequence = 0;
  let cropZoom = 1;
  let cropBaseScale = 1;
  let cropFitBounds = [0, 0, 1, 1];
  let cropReturnFocus = null;
  let cropTrayExpanded = false;
  let localInstallReturnFocus = null;
  const cropPointers = new Map();
  let cropPinch = null;

  document.addEventListener("pointerdown", () => { lastInteractionWasKeyboard = false; }, true);
  document.addEventListener("keydown", () => { lastInteractionWasKeyboard = true; }, true);

  const selectedResult = () => results.find((result) => result.id === selectedId) || null;
  const selectedActiveResult = () => {
    const result = selectedResult();
    if (cropSession && result && cropSession.resultId === result.id) {
      return pdfFilePageResult(result, cropSession.pageNumber);
    }
    return continuousView && result && continuousView.resultId === result.id
      ? pdfFilePageResult(result, continuousView.visiblePage)
      : activePdfPageResult(result, pdfMatchIndex);
  };
  const selectedVariantResult = () => resultForRepresentation(selectedResult(), activeRepresentation);
  const actionButtons = () => [...overlay.querySelectorAll("[data-unilib-insert],[data-unilib-send],[data-unilib-ai],[data-unilib-graph]")];
  const acceptedAssetsKey = () => [...acceptedAssets.keys()].join("\u0000");
  const invalidateAction = () => { actionRevision += 1; };
  const activePageNumber = () => continuousView && continuousView.resultId === selectedId ? continuousView.visiblePage : null;
  const snapshotAction = () => Object.freeze({ selectedId, acceptedAssetsKey: acceptedAssetsKey(), acceptedAssetIds: Object.freeze([...acceptedAssets.keys()]), representation: activeRepresentation, selectedFigure: activeFigureRepresentation, activePage: activePageNumber(), revision: actionRevision, options: Object.freeze(getPartOptions()), open: !overlay.hidden });
  const actionIsCurrent = (snapshot) => libraryActionSnapshotIsCurrent(snapshot, { selectedId, acceptedAssetsKey: acceptedAssetsKey(), representation: activeRepresentation, selectedFigure: activeFigureRepresentation, activePage: activePageNumber(), revision: actionRevision, open: !overlay.hidden });
  const resultForActionSnapshot = (snapshot) => {
    const result = results.find((item) => item.id === snapshot.selectedId);
    return Number.isInteger(snapshot.activePage) ? pdfFilePageResult(result, snapshot.activePage) : result;
  };
  const updateAiActionAvailability = () => {
    const aiRecords = aiActionRecords(acceptedAssets);
    const aiAllowed = hasInsertableAiRecord(aiRecords, {
      selectedId,
      representation: activeRepresentation,
      selectedFigure: activeFigureRepresentation,
    });
    overlay.querySelector("[data-unilib-ai]").disabled = actionBusy || !aiAllowed || (typeof openAi !== "function" && typeof openIndependentReferences !== "function");
    const graphMode = referenceConsumer?.kind === 'graph';
    const graph = overlay.querySelector('[data-unilib-graph]');
    graph.hidden = !graphMode && (!!referenceConsumer || typeof openGraph !== 'function');
    graph.textContent = graphMode ? '그래프 원본으로 선택' : '좌표/함수 생성';
    graph.disabled = actionBusy || !aiAllowed;
    overlay.querySelector('[data-unilib-ai]').hidden = graphMode;
    const needsCrop = !aiAllowed && selectedActiveResult()?.provenance?.provider === "pdf";
    const help = overlay.querySelector("[data-unilib-ai-help]");
    help.textContent=graphMode ? "PDF에서 그래프 영역을 크롭한 뒤 원본으로 선택하세요." : "PDF에서 필요한 영역을 자르고 작업대에 넣으면 AI 이미지/그래프를 사용할 수 있습니다.";
    help.hidden = !needsCrop;
    overlay.querySelector("[data-unilib-ai]").title = needsCrop ? help.textContent : "준비한 이미지를 AI 작업으로 보내기 (Space)";
    syncSpaceAction();
  };
  function syncSpaceAction() {
    loadSpaceActionStyle();
    const identity = libraryResultIdentity(selectedActiveResult());
    if (spaceAssignmentIdentity && spaceAssignmentIdentity !== identity) spaceAssignmentIdentity = null;
    const button = !cropDialog.hidden
      ? overlay.querySelector(draftCrop ? '[data-unilib-crop-save]' : '[data-unilib-crop-workbench]')
      : overlay.querySelector(spaceAssignmentIdentity ? '[data-unilib-ai]' : '[data-unilib-adjust]');
    markSpaceAction(overlay, actionBusy || cropActionBusy || cropSession?.viewOnly && !cropDialog.hidden ? null : button);
  }
  const runLibraryAction = async (work) => {
    if (actionBusy) return;
    actionBusy = true;
    actionButtons().forEach((button) => { button.disabled = true; });
    syncSpaceAction();
    const snapshot = snapshotAction();
    try {
      await work(snapshot, () => actionIsCurrent(snapshot));
    } catch (error) {
      if (actionIsCurrent(snapshot)) setStatus(`작업 실패: ${error instanceof Error ? error.message : error}`, true);
    } finally {
      actionBusy = false;
      if (motion.isOpen()) {
        renderCropTray();
        void renderPreview();
      }
    }
  };
  const setStatus = (message, error = false) => {
    const status = overlay.querySelector("[data-unilib-status]");
    status.textContent = message;
    status.classList.toggle("is-error", error);
  };
  const setResultState = (state, message = "") => {
    const host = overlay.querySelector("[data-unilib-result-state]");
    host.hidden = state === "ready";
    host.dataset.state = state;
    host.querySelector("[data-unilib-result-state-message]").textContent = message;
    host.querySelector("[data-unilib-result-retry]").hidden = state !== "error";
    list.setAttribute("aria-busy", String(state === "loading"));
    resultDots.hidden = state !== 'loading';
    if (state === 'loading' && !results.length && !list.querySelector('.unilib-result-placeholder')) {
      list.replaceChildren(...Array.from({length:6}, () => {
        const item = document.createElement('li'); item.className = 'unilib-result-placeholder';
        item.setAttribute('aria-hidden', 'true'); item.innerHTML = '<div></div><i></i><i></i>'; return item;
      }));
    } else if (state !== 'loading') list.querySelectorAll('.unilib-result-placeholder').forEach(node => node.remove());
  };
  const setPreviewLoading = () => {
    clearPreviewLoading();
    continuousView?.loading.forEach(pending => pending.dispose());
    continuousView = null;
    const paper = createPreviewPaper();
    stage.replaceChildren(paper);
    previewLoading = createLibraryPreviewLoading(stage, paper);
  };
  const setProvidedStatus = (message, error = false) => {
    const host = overlay.querySelector("[data-unilib-provided-status]");
    host.hidden = !error;
    host.classList.toggle("is-error", error);
    host.querySelector("[data-unilib-provided-status-message]").textContent = message;
    host.querySelector("[data-unilib-provided-retry]").hidden = !error || typeof providedRetry !== "function";
  };
  const setFolderLoading = (state, message = "") => {
    const host = overlay.querySelector("[data-unilib-folder-loading]");
    const loading = state === "loading";
    host.hidden = state === "ready";
    host.dataset.state = state;
    host.querySelector("[data-unilib-folder-loading-title]").textContent = loading
      ? "라이브러리 폴더를 불러오는 중"
      : "라이브러리 폴더를 불러오지 못했습니다.";
    host.querySelector("[data-unilib-folder-loading-detail]").textContent = loading
      ? "자료 수에 따라 잠시 걸릴 수 있습니다."
      : message;
    tree.hidden = state !== "ready";
    tree.setAttribute("aria-busy", String(loading));
  };
  const followBackgroundIndexing = (snapshot, isCurrent = () => !overlay.hidden) => {
    if (!snapshot?.backgroundIndexing || typeof snapshot.backgroundIndexing.then !== "function") return;
    void snapshot.backgroundIndexing.then(async () => {
      if (!isCurrent()) return;
      await refreshDesktopSources(false, isCurrent);
      if (!isCurrent()) return;
      await runSearch();
    }).catch((error) => {
      if (isCurrent()) setStatus(`백그라운드 색인 실패: ${error instanceof Error ? error.message : error}`, true);
    });
  };

  async function provider() { return getProvider(); }

  let renderedSourceProvider = null, renderedSourceRevision = null, renderedSourceKey = '';
  let sourceGroupRoots = {};
  let resultSections = null, resultTotal = null, kindTotals = null;
  const updateTabCounts = (key) => {
    const totals = kindTotals?.key === key ? kindTotals.totals : {};
    overlay.querySelectorAll("[data-unilib-type]").forEach((button) => {
      const type = button.dataset.unilibType;
      let small = button.querySelector("small");
      const value = type === "all" ? (Object.keys(totals).length ? Object.values(totals).reduce((sum, n) => sum + (n ?? 0), 0) : null) : totals[type];
      if (value == null) { small?.remove(); return; }
      if (!small) { small = document.createElement("small"); button.append(small); }
      small.textContent = value.toLocaleString("ko-KR");
    });
  };
  const groupEnabled = { provided: true, drive: true, local: true };
  const openSourceGroups = new Set();
  const sourceTreeKey = () => JSON.stringify([[...(enabledSources || [])].sort(),[...expandedSources].sort(),[...excludedSourceGroups].sort(),desktopConnections]);
  async function renderSources(isCurrent = () => true) {
    const activeProvider = await provider();
    if (!isCurrent()) return false;
    if (renderedSourceProvider === activeProvider && renderedSourceRevision === activeProvider.revision
      && renderedSourceKey === sourceTreeKey()) return true;
    const sources = activeProvider.getSources();
    const yearStart = overlay.querySelector("[data-unilib-year-start]");
    const yearEnd = overlay.querySelector("[data-unilib-year-end]");
    const filterOptions = activeProvider.getExamFilterOptions?.();
    const years = filterOptions?.academicYears
      ?? [...new Set((activeProvider.search({ query: "", kinds: ["crop"], limit: Number.MAX_SAFE_INTEGER }) ?? []).map((result) => result.metadata?.academicYear).filter(Number.isInteger))].sort((a, b) => b - a);
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
    const appendTreeNode = ({ id, name, counts = null, checked, indeterminate, children = [], depth = 0, desktop = null, container = false, file = false }, parent) => {
      if (!treeExpansionInitialized && depth === 0) expandedSources.add(id);
      const item = document.createElement("li");
      item.className = `unilib-tree-item${desktop ? " is-desktop-folder" : ""}${file ? " is-file" : ""}`;
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
      icon.innerHTML = file ? ICONS.file : ICONS.folder;
      const text = document.createElement("span");
      text.className = "unilib-tree-label";
      const visibleName = visibleLibraryName(name);
      text.textContent = visibleName;
      const tooltip = counts ? `${visibleName} · 하위 폴더 포함 PDF ${counts.pdf}개 · 이미지 ${counts.image}개` : visibleName;
      text.title = tooltip;
      label.title = tooltip;
      row.title = tooltip;
      label.append(check, icon, text);
      if (file) {
        label.dataset.browseSource = id;
        label.title = `${visibleName} 페이지 열기`;
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
    // 11-05: 검색 위치를 어디서 왔는지로 묶는다 — 5E 제공 / 내 구글 드라이브 / 이 맥. 묶음 스위치를 끄면 그 묶음 전체를
    // 검색에서 빼고, 「5E 제공」을 끄면 학평 자료도 아예 불러오지 않는다(prepareSearch).
    const groupFragments = { provided: document.createDocumentFragment(), drive: document.createDocumentFragment(), local: document.createDocumentFragment() };
    const groupRoots = { provided: [], drive: [], local: [] };
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
        groupRoots.local.push({ desktop: projected.desktop, checked: projected.checked || projected.indeterminate });
        appendTreeNode(projected, groupFragments.local);
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
        file: node.kind === "source" && children.length === 0 && /\.pdf$/iu.test(node.label),
        ...selection,
        children,
      };
    };
    for (const source of roots) {
      if (source.origin === "local" && desktopRootNames.has(source.label)) continue;
      const group = libraryRootGroup(source);
      const projected = projectProvider(source);
      groupRoots[group].push({ id: source.id, label: visibleLibraryName(source.label), checked: projected.checked || projected.indeterminate });
      appendTreeNode(projected, groupFragments[group]);
    }
    sourceGroupRoots = groupRoots;
    for (const [group, label, note] of LIBRARY_ROOT_GROUPS) {
      if (!groupRoots[group].length) continue;
      const on = groupRoots[group].some((item) => item.checked);
      groupEnabled[group] = on;
      const head = document.createElement("li");
      head.className = "unilib-tree-group";
      head.dataset.sourceGroup = group;
      head.classList.toggle("is-off", !on);
      const open = openSourceGroups.has(group), names = groupRoots[group].filter((item) => item.checked).map((item) => item.label).filter(Boolean);
      const summary = on ? (names.join(" · ") || note) : "꺼짐 · 불러오지 않음";
      head.classList.toggle("is-open", open);
      head.innerHTML = `<button type="button" class="unilib-group-open" data-source-group-open="${group}" aria-expanded="${open}" title="${label} — 안의 폴더 고르기"><span class="unilib-group-icon">${GROUP_ICONS[group]}</span><span class="unilib-group-text"><strong>${label}</strong><small>${escapeHtml(summary)}</small></span><span class="unilib-chevron" aria-hidden="true">›</span></button><button type="button" class="unilib-switch" role="switch" data-source-group-switch="${group}" aria-checked="${on}" aria-label="${label} ${on ? "끄기" : "켜기"}" title="${label} ${on ? "끄기 — 끄면 이 묶음은 검색하지 않고 파일도 불러오지 않습니다" : "켜기"}"><i></i></button>`;
      for (const item of groupFragments[group].children) item.classList.toggle("is-group-collapsed", !open);
      for (const item of groupFragments[group].children) item.classList.toggle("is-group-off", !on);
      fragment.append(head, groupFragments[group]);
    }
    tree.replaceChildren(fragment);
    treeExpansionInitialized = true;
    try { storage.setItem(TREE_STORAGE_KEY, JSON.stringify([...expandedSources])); } catch {}
    const selectedCount = enabledSources.size;
    overlay.querySelector("[data-unilib-location-summary]").textContent = selectedCount ? `검색 위치 ${selectedCount}곳` : "검색 위치 없음";
    setSearchPaneOpen(searchPaneOpen);
    renderedSourceProvider = activeProvider;
    renderedSourceRevision = activeProvider.revision;
    renderedSourceKey = sourceTreeKey();
    return true;
  }

  const searchIsCurrent = (ownEpoch, signal) => ownEpoch === searchEpoch && !signal.aborted && !overlay.hidden;

  let prepareVisibleThumbnails = () => [];
  const waitForFirstResultPaint = async (ownEpoch, signal) => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (!searchIsCurrent(ownEpoch, signal)) return false;
    const cohort = prepareVisibleThumbnails();
    const settled = () => cohort.every((media) => !media.isConnected || media.dataset.thumbnailState !== "loading");
    if (!settled()) {
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          observer.disconnect();
          clearTimeout(timeout);
          signal.removeEventListener("abort", abort);
        };
        const finish = () => { cleanup(); resolve(); };
        const abort = () => { cleanup(); resolve(); };
        const observer = new MutationObserver(() => { if (settled()) finish(); });
        const timeout = setTimeout(() => { cleanup(); reject(new Error("미리보기를 불러오는 시간이 너무 오래 걸립니다.")); }, 20_000);
        observer.observe(list, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-thumbnail-state"] });
        signal.addEventListener("abort", abort, { once: true });
        if (settled()) finish();
      });
    }
    return searchIsCurrent(ownEpoch, signal);
  };

  const snapshotResultViewport = () => {
    const scroller = overlay.querySelector(".unilib-result-scroll");
    const cardBounds = list.querySelector('[aria-selected="true"]')?.getBoundingClientRect();
    const scrollBounds = scroller.getBoundingClientRect();
    return {
      identity: libraryResultIdentity(selectedActiveResult()), renderedCount: renderedResultCount, scrollTop: scroller.scrollTop,
      selectedOffset: cardBounds && cardBounds.bottom > scrollBounds.top && cardBounds.top < scrollBounds.bottom
        ? cardBounds.top - scrollBounds.top : null,
    };
  };
  let closedResultViewport = null;
  let restoringResultViewport = null;

  async function runSearch({ preservePreview = false, retainedViewport = null, preserveResultOrder = false } = {}) {
    const previousViewport = preservePreview ? retainedViewport ?? snapshotResultViewport() : null;
    const previousIdentity = previousViewport?.identity ?? null;
    const previousScroll = previousViewport?.scrollTop ?? 0;
    const previousRenderedCount = previousViewport?.renderedCount ?? 0;
    const previousCardOffset = previousViewport?.selectedOffset ?? null;
    const scroller = overlay.querySelector(".unilib-result-scroll");
    const restoreSelectionOffset = () => {
      if (previousCardOffset == null) return;
      const card = list.querySelector(`[data-result-id="${CSS.escape(selectedId)}"]`);
      if (card) scroller.scrollTop += card.getBoundingClientRect().top - scroller.getBoundingClientRect().top - previousCardOffset;
    };
    if (!preservePreview) invalidateAction();
    libraryLoading.begin();
    const ownEpoch = ++searchEpoch;
    searchController?.abort();
    searchController = new AbortController();
    const signal = searchController.signal;
    thumbnailEpoch += 1;
    thumbnailQueue.clear();
    thumbnailObserver?.disconnect();
    const requestId = `unilib-${++requestSequence}`;
    setResultState("loading", "검색 결과를 불러오는 중…");
    if (!preservePreview) setPreviewLoading();
    overlay.querySelector("[data-unilib-count]").textContent = "불러오는 중";
    setStatus("라이브러리를 검색하는 중…");
    try {
      const queryText = query.value.trim();
      const filters = { ...Object.fromEntries(Object.entries(examFilters).filter(([, value]) => value !== "" && value != null)), ...conditionFilters() };
      // 11-08: 학평 자료를 불러오는 동안(수 초) 검색 결과를 붙잡지 않는다 — 지금 있는 자료로 먼저 보여 주고,
      // 다 불러오면 같은 검색을 한 번 더 돌려 학평 결과를 보탠다.
      const preparing = prepareSearch?.({query: queryText, filters, questionSearch: activeTypes.includes("question"), providedEnabled: groupEnabled.provided});
      let changed = false;
      if (preparing) {
        const PENDING = Symbol("pending");
        const quick = await Promise.race([preparing, new Promise((resolve) => setTimeout(() => resolve(PENDING), 150))]);
        if (quick === PENDING) {
          void Promise.resolve(preparing).then((late) => {
            if (late && searchIsCurrent(ownEpoch, signal)) void runSearch({ preservePreview: true });
          }).catch(() => {});
        } else changed = quick;
      }
      if (!searchIsCurrent(ownEpoch, signal)) return;
      if (changed) await renderSources(() => searchIsCurrent(ownEpoch, signal));
      const activeProvider = await provider();
      if (!enabledSources) await renderSources();
      // 11-05: 조건 칸 숫자 세기(facetCounts)는 문항 전체를 훑어 무겁다 — 결과를 먼저 그리고, 조건 상자가 열려 있을 때만 센다.
      pendingConditions = () => refreshConditions(activeProvider, queryText, filters);
      if (!searchIsCurrent(ownEpoch, signal)) return;
      const pageDisplayActive = pdfDisplayMode === "page" && activeTypes.length === 1 && activeTypes[0] === "pdf";
      const options = { query: queryText, sourceIds: [...enabledSources], filters, limit: Number.MAX_SAFE_INTEGER, requestId, signal };
      const pageInventoryOptions = { query: queryText, sourceIds: [...enabledSources], filters, requestId, signal };
      const kinds = [...(activeTypes.includes("question") ? ["crop"] : []), ...(activeTypes.includes("image") ? ["image"] : [])];
      const regularPromise = kinds.length
        ? (typeof activeProvider.searchAsync === "function" ? activeProvider.searchAsync({ ...options, kinds }) : activeProvider.search({ ...options, kinds }))
        : [];
      const pdfPromise = activeTypes.includes("pdf")
        ? (queryText && searchReadiness === "ready" && typeof activeProvider.searchPdfFiles === "function" ? activeProvider.searchPdfFiles(options) : activeProvider.listPdfFiles?.(pageDisplayActive ? pageInventoryOptions : options) ?? [])
        : [];
      const [regular, pdfFiles] = await Promise.all([regularPromise, pdfPromise]);
      const displayedPdf = pageDisplayActive ? pdfResultsForDisplay(pdfFiles, "page", Boolean(queryText)) : pdfFiles;
      const normalizedPdf = Array.isArray(displayedPdf) ? displayedPdf.map((file) => ({
        ...file,
        id: file.id || `pdf:${file.documentId}`,
        kind: "pdf",
        sourceLabel: file.subtitle || "PDF",
        provenance: { ...(file.provenance || {}), provider: "pdf", documentId: file.documentId, pageNumber: file.firstMatchingPage || file.provenance?.pageNumber || 1 },
      })) : [];
      const found = [...(Array.isArray(regular) ? regular : []), ...normalizedPdf];
      if (!searchIsCurrent(ownEpoch, signal)) return;
      if (preserveResultOrder) {
        // Late catalog entries must not move the selected PDF behind thousands
        // of new questions and force its entire prefix into the DOM at once.
        // Explicit searches and filters still use the provider's fresh order.
        const positions = new Map(results.map((item, index) => [item.id, index]));
        found.sort((a, b) => (positions.get(a.id) ?? positions.size) - (positions.get(b.id) ?? positions.size));
      } else if (sortMode === "recent") found.sort(compareRecent);
      // 11-05: 「전체」 탭은 종류별 묶음으로(시안) — 문항 6 · PDF 쪽 4 · 이미지 8, 묶음마다 「모두 보기 →」. 개수는 탭에도 붙는다.
      resultSections = null;
      resultTotal = null;
      // PDF는 「쪽」으로 센다(전체 탭의 PDF는 파일마다 첫 쪽만 보여 주지만 수는 맞은 쪽 수 — PDF 쪽 탭과 같은 수).
      const sectionCount = (type, items) => type === "pdf" ? items.reduce((sum, item) => sum + (item.kind === "pdf" && !pageDisplayActive ? Math.max(1, queryText ? (item.matches?.length ?? 1) : (item.pageCount ?? 1)) : 1), 0) : items.length;
      const totals = Object.fromEntries(RESULT_SECTIONS.map(([type, , test]) => [type, sectionCount(type, found.filter(test))]));
      const totalsKey = JSON.stringify([queryText, filters, [...(enabledSources || [])].sort()]);
      if (activeTypes.length === LIBRARY_TYPES.length) { kindTotals = { key: totalsKey, totals }; }
      else if (activeTypes.length === 1) kindTotals = { key: totalsKey, totals: { ...(kindTotals?.key === totalsKey ? kindTotals.totals : {}), [activeTypes[0]]: totals[activeTypes[0]] } };
      updateTabCounts(totalsKey);
      resultTotal = activeTypes.length === 1 ? totals[activeTypes[0]] : Object.values(totals).reduce((sum, value) => sum + value, 0);
      // 종류가 하나뿐이면 묶음으로 자르지 않는다(모두 보여 줌).
      const nonEmptySections = RESULT_SECTIONS.filter(([, , test]) => found.some(test)).length;
      if (activeTypes.length === LIBRARY_TYPES.length && !preserveResultOrder && nonEmptySections > 1) {
        const limited = [];
        resultSections = new Map();
        for (const [type, label, test, limit] of RESULT_SECTIONS) {
          const items = found.filter(test);
          if (!items.length) continue;
          resultSections.set(limited.length, { type, label, total: totals[type], more: items.length > limit });
          limited.push(...items.slice(0, limit));
        }
        found.length = 0;
        found.push(...limited);
      }
      results = Array.isArray(found) ? found : [];
      selectedId = reconcileUnifiedSelection(selectedId, results);
      if (pageDisplayActive && queryText && !results.find((item) => item.id === selectedId && item.matches?.length)) {
        selectedId = results.find((item) => item.matches?.length)?.id ?? selectedId;
      }
      const samePreview = preservePreview && previousIdentity && previousIdentity === libraryResultIdentity(selectedActiveResult());
      // Restore the old viewport only after its batches exist; otherwise the
      // browser clamps scrollTop to the first batch and hides a deep selection.
      // 11-05: 검색어를 지우면 고른 자료가 1만 번째 근처일 수 있다 — 거기까지 카드를 한꺼번에 그리면 화면이 수십 초 멈췄다.
      // 되살릴 카드가 MAX_RESTORED_CARDS를 넘으면 목록은 맨 위부터 다시 그리고, 오른쪽 미리보기만 그대로 둔다.
      const restoreCount = samePreview ? Math.max(previousRenderedCount, results.findIndex(item => item.id === selectedId) + 1) : 0;
      const restoreList = samePreview && restoreCount <= MAX_RESTORED_CARDS;
      renderResults({ initialCount: restoreList ? restoreCount : 60 });
      if (conditionsOpen || root.dataset.fly === "conditions") setTimeout(() => { if (ownEpoch === searchEpoch) flushConditions(); }, 0);
      // 11-05: 첫 검색어만 0.5초쯤 걸렸다(본문 글 정리·캐시를 그때 만듦). 라이브러리를 연 뒤 한가할 때 한 번 미리 데워 둔다.
      if (warmedProvider !== activeProvider && enabledSources?.size) {
        warmedProvider = activeProvider;
        const warm = () => { try { void (activeProvider.searchAsync ?? activeProvider.search).call(activeProvider, { query: "자기장", kinds: ["crop"], sourceIds: [...enabledSources], filters: {}, limit: 1 }); } catch {}
          // 11-08: PDF 본문 색인(8천여 쪽)도 첫 검색어 전에 일꾼에 올려 둔다 — 안 그러면 첫 검색이 색인 올리기(1~3초)를 기다린다.
          try { if (searchReadiness === "ready" && typeof activeProvider.searchPdfFiles === "function") void Promise.resolve(activeProvider.searchPdfFiles({ query: "자기장", sourceIds: [...enabledSources], filters: {}, limit: 1, requestId: "unilib-warm" })).catch(() => {}); } catch {} };
        typeof requestIdleCallback === "function" ? requestIdleCallback(warm, { timeout: 1500 }) : setTimeout(warm, 300);
      }
      if (restoreList) { scroller.scrollTop = previousScroll; restoreSelectionOffset(); }
      else if (!samePreview) { if (preservePreview) invalidateAction(); void renderPreview(); }
      if (searchReadiness !== "ready") setStatus(readinessMessage(), searchReadiness === "error");
      if (results.length && !await waitForFirstResultPaint(ownEpoch, signal)) return;
      libraryLoading.empty();
      if (!searchIsCurrent(ownEpoch, signal)) return;
      setResultState(results.length ? "ready" : searchReadiness === "error" ? "error" : searchReadiness !== "ready" ? "loading" : "empty", results.length ? "" : searchReadiness !== "ready" ? readinessMessage() : "검색 결과가 없습니다.");
      // content-visibility may replace estimated heights on the first paint.
      if (restoreList) restoreSelectionOffset();
      if (searchReadiness !== "ready") { setStatus(readinessMessage(), searchReadiness === "error"); return; }
      setStatus(pendingIndexCount ? `내 PDF ${pendingIndexCount}개를 색인하는 중입니다.` : "");
    } catch (error) {
      if (error?.name !== "AbortError" && ownEpoch === searchEpoch) {
        const message = `검색 실패: ${error instanceof Error ? error.message : error}`;
        libraryLoading.fail();
        setResultState("error", message);
        stage.removeAttribute("aria-busy");
        stage.textContent = "미리보기를 불러오지 못했습니다. 검색을 다시 시도해 주세요.";
        setStatus(message, true);
      }
    }
  }

  function updateResultSelection() {
    list.querySelectorAll("[data-result-id]").forEach((card) => card.setAttribute("aria-selected", String(card.dataset.resultId === selectedId)));
    renderCropTray();
  }

  function renderResults({ initialCount = 60 } = {}) {
    const ownThumbnailEpoch = ++thumbnailEpoch;
    thumbnailQueue.clear();
    thumbnailObserver?.disconnect();
    thumbnailObserver = null;
    const visibleResults = results;
    const scroller = overlay.querySelector(".unilib-result-scroll");
    renderedResultCount = 0;
    list.replaceChildren();
    scroller.scrollTop = 0;
    root.dataset.activeTab = activeTypes.length === LIBRARY_TYPES.length ? "all" : activeTypes.join("-");
    root.dataset.pdfDisplay = activeTypes.length === 1 && activeTypes[0] === "pdf" ? pdfDisplayMode : "file";
    const fileListMode = activeTypes.length === 1 && activeTypes[0] === "pdf" && pdfDisplayMode === "file";
    if (fileListMode && visibleResults.length) {
      const head = document.createElement("li");
      head.className = "unilib-file-head"; head.setAttribute("role", "presentation");
      head.innerHTML = "<span>파일 이름</span><span>걸린 쪽</span><span>맞은 곳</span>";
      list.append(head);
    }
    overlay.querySelector("[data-unilib-count]").textContent = `${(resultTotal ?? visibleResults.length).toLocaleString("ko-KR")}개`;
    renderCropTray();
    const pendingThumbnails = [];
    const thumbnailLookup = new Map();
    const thumbnailPdfMode = activeTypes.length === 1 && activeTypes[0] === "pdf" ? pdfDisplayMode : "file";
    const thumbnailStatus = (media, failed = false) => {
      media.dataset.thumbnailState = failed ? "error" : "loading";
      media.setAttribute("aria-busy", String(!failed));
      const status = document.createElement("span");
      status.className = "unilib-thumbnail-status";
      if (failed) libraryLoading.failed(media);
      if (failed) status.textContent = '미리보기를 불러오지 못했습니다';
      else status.append(createLoadingDots(), document.createTextNode('미리보기 불러오는 중…'));
      media.replaceChildren(status);
    };
    const showThumbnail = (media, src, result) => {
      libraryLoading.request(media);
      const image = new Image();
      image.loading = "lazy";
      image.alt = "";
      image.onload = () => {
        if (ownThumbnailEpoch !== thumbnailEpoch || !media.isConnected) return;
        void libraryLoading.ready(media, image);
        delete media.dataset.thumbnailState;
        media.setAttribute("aria-busy", "false");
        media.querySelector(".unilib-thumbnail-status")?.remove();
        const thumbnailCrop = thumbnailPdfMode === "page" && result.provenance?.provider === "pdf"
          ? [0, 0, 1, 1]
          : result.provenance?.rect ?? [0, 0, 1, 1];
        paintHighlightLayer(media, image, result, thumbnailCrop);
      };
      image.onerror = () => {
        if (ownThumbnailEpoch === thumbnailEpoch && media.isConnected) thumbnailStatus(media, true);
      };
      image.src = src;
      media.append(image);
    };
    const loadThumbnail = (result, media, preview = null) => {
      libraryLoading.request(media);
      thumbnailStatus(media);
      if (preview) { showThumbnail(media, preview, result); return; }
      void thumbnailQueue.enqueue(async () => {
        if (ownThumbnailEpoch !== thumbnailEpoch || !media.isConnected) return;
        const activeProvider = await provider();
        if (ownThumbnailEpoch !== thumbnailEpoch || !media.isConnected) return;
        const cacheKey = JSON.stringify([libraryResultIdentity(result), result.revision ?? activeProvider.revision, thumbnailPdfMode]);
        let pending = thumbnailCache.get(cacheKey);
        if (!pending) {
          pending = materializeLibraryThumbnail(result, activeProvider, thumbnailPdfMode);
          thumbnailCache.set(cacheKey, pending);
          pending.catch(() => { if (thumbnailCache.get(cacheKey) === pending) thumbnailCache.delete(cacheKey); });
        }
        const materialized = await pending;
        if (ownThumbnailEpoch !== thumbnailEpoch || !media.isConnected) return;
        const src = resultImage(result, materialized);
        if (!src) { thumbnailStatus(media, true); return; }
        showThumbnail(media, src, result);
        // 11-05 시안 v8: 기출 문항 카드 그림(exam-search cards/*.webp)은 exam과 같이 문항 부분만 픽셀로 잘라 보인다(작업 스레드).
        // 원래 그림을 먼저 보이고, 잘린 그림이 오면 바꾼다(자르는 동안 「불러오는 중」으로 기다리게 하지 않음).
        if (result.kind === "crop" && result.cropType === "question" && /\/exam-search\/main\/cards\//u.test(src)) {
          void croppedPastImage(src).then((cropped) => {
            const image = media.querySelector("img");
            if (cropped !== src && image && ownThumbnailEpoch === thumbnailEpoch && media.isConnected) image.src = cropped;
          });
        }
      }).catch(() => {
        if (ownThumbnailEpoch === thumbnailEpoch && media.isConnected) thumbnailStatus(media, true);
      });
    };
    const createSectionHeader = (section) => {
      const item = document.createElement("li");
      item.className = "unilib-result-section";
      item.setAttribute("role", "presentation");
      item.innerHTML = `<strong>${section.label}</strong><small>${section.total.toLocaleString("ko-KR")}</small>${section.more ? `<button type="button" data-unilib-section-more="${section.type}">모두 보기 →</button>` : ""}`;
      return item;
    };
    const createResultCard = (result) => {
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
        thumbnailStatus(media);
        pendingThumbnails.push({ result, media, src: preview });
      } else {
        media.textContent = result.kind === "page" ? "PDF" : "5E";
        if (result.provenance?.provider === "pdf") {
          thumbnailStatus(media);
          pendingThumbnails.push({ result, media });
        }
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
      const visibleTitle = visibleLibraryName(result.title);
      title.textContent = pdfDisplayMode === "page" && result.kind === "pdf" && result.provenance?.pageNumber
        ? `${visibleTitle} · ${result.provenance.pageNumber}쪽` : visibleTitle;
      const sourceText = resultSourceText(result);
      const pageText = result.provenance?.pageNumber ? `${result.provenance.pageNumber}쪽` : "";
      title.title = sourceText.includes(visibleTitle) ? sourceText : `${visibleTitle} · ${sourceText}`;
      if (pageText && !title.title.includes(pageText)) title.title += ` · ${pageText}`;
      const meta = document.createElement("small");
      meta.className = "library-card-page";
      const compactPdfPage = pdfDisplayMode === "page" && activeTypes.length === 1 && activeTypes[0] === "pdf" && result.provenance?.provider === "pdf";
      meta.textContent = compactPdfPage ? `${result.provenance.pageNumber}쪽` : resultSourceText(result);
      meta.title = meta.textContent;
      if (shouldShowResultTypeBadge(activeTypes, result.kind)) copy.append(badge);
      copy.append(disclosure, title, meta);
      button.append(media, copy);
      if (result.kind === "crop" && result.cropType === "question") {
        const pick = document.createElement("button");
        pick.type = "button"; pick.className = "unilib-pick"; pick.dataset.unilibPick = result.id;
        pick.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8.4 6.8 11 12 5.4"/></svg>';
        pick.setAttribute("aria-label", "이 문항 고르기");
        item.append(pick);
        if (pickedQuestions.has(result.id)) { item.classList.add("is-picked"); pick.setAttribute("aria-pressed", "true"); } else pick.setAttribute("aria-pressed", "false");
      }
      // 11-05 시안 v13: 기출 문항 카드 오른쪽 위 ★ — 5E_exam 별표와 같은 저장 칸(stars, 열쇠 past:<기출 id>)이라 exam 「★ 별표만」에도 나온다.
      const pastId = pastQuestionId(result);
      if (pastId) {
        const star = document.createElement("button");
        star.type = "button"; star.className = "unilib-star"; star.dataset.unilibStar = pastId;
        star.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>';
        paintStar(star, Boolean(examStars()[`past:${pastId}`]));
        item.append(star);
      }
      // 11-05 시안 v13 「파일로 보기」: 파인더 목록처럼 한 줄에 파일 하나 — 파일 이름 · 걸린 쪽 · 맞은 곳.
      if (fileListMode && result.kind === "pdf") {
        item.classList.add("is-file-row");
        const fileName = String(result.provenance?.displayName || result.provenance?.locator || "").split(/[\\/]/u).pop();
        if (fileName) { meta.textContent = fileName; meta.title = fileName; }
        const pagesHit = [...new Set((result.matches || []).map((match) => match.pageNumber))];
        const hits = (result.matches || []).reduce((sum, match) => sum + (match.highlights?.length || 0), 0);
        const cols = document.createElement("span");
        cols.className = "unilib-file-cols";
        cols.innerHTML = `<span title="${pagesHit.join("·")}쪽">${pagesHit.length ? (pagesHit.length > 4 ? `${pagesHit.slice(0, 3).join("·")}쪽 외 ${pagesHit.length - 3}` : `${pagesHit.join("·")}쪽`) : (result.pageCount ? `전체 ${result.pageCount}쪽` : "—")}</span><span>${hits ? `${hits}곳` : "—"}</span>`;
        button.append(cols);
      }
      item.append(button);
      return item;
    };
    if ("IntersectionObserver" in globalThis) {
      thumbnailObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (ownThumbnailEpoch !== thumbnailEpoch) return;
          thumbnailObserver?.unobserve(entry.target);
          const result = thumbnailLookup.get(entry.target);
          thumbnailLookup.delete(entry.target);
          if (result) loadThumbnail(result.result, entry.target, result.src);
        }
      }, { root: overlay.querySelector(".unilib-result-scroll"), rootMargin: "240px 0px" });
    }
    prepareVisibleThumbnails = () => {
      const bounds = scroller.getBoundingClientRect();
      const visible = [...list.querySelectorAll(".unilib-thumb")].filter((media) => {
        const rect = media.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom
          && rect.right > bounds.left && rect.left < bounds.right;
      });
      for (const media of visible) {
        const result = thumbnailLookup.get(media);
        if (!result) continue;
        thumbnailObserver?.unobserve(media);
        thumbnailLookup.delete(media);
        loadThumbnail(result.result, media, result.src);
      }
      return visible;
    };
    appendResultBatch = (throughIndex = renderedResultCount) => {
      if (ownThumbnailEpoch !== thumbnailEpoch || overlay.hidden) return;
      const end = Math.min(visibleResults.length, Math.max(renderedResultCount + 60, throughIndex + 1));
      if (end <= renderedResultCount) return;
      const nodes = [];
      visibleResults.slice(renderedResultCount, end).forEach((result, offset) => {
        const section = resultSections?.get(renderedResultCount + offset);
        if (section) nodes.push(createSectionHeader(section));
        nodes.push(createResultCard(result));
      });
      list.append(...nodes);
      renderedResultCount = end;
      for (const { result, media, src } of pendingThumbnails.splice(0)) {
        if (thumbnailObserver) { thumbnailLookup.set(media, {result, src}); thumbnailObserver.observe(media); }
        else loadThumbnail(result, media, src);
      }
    };
    appendResultBatch(initialCount - 1);
    prepareVisibleThumbnails();
  }
  const resultScroller = overlay.querySelector(".unilib-result-scroll");
  resultScroller.addEventListener("scroll", () => {
    if (resultScroller.scrollHeight - resultScroller.scrollTop - resultScroller.clientHeight < 480) appendResultBatch();
  }, { passive: true });

  function renderCropTray() {
    syncQuestionPanel();
    const tray = overlay.querySelector("[data-unilib-crop-tray]");
    const entries = [...acceptedAssets.values()];
    if (!entries.length) cropTrayExpanded = false;
    tray.hidden = entries.length === 0;
    tray.classList.toggle("is-expanded", cropTrayExpanded);
    if (cropTrayExpanded) {
      tray.setAttribute("role", "dialog");
      tray.setAttribute("aria-label", "크롭된 이미지");
    } else {
      tray.removeAttribute("role");
      tray.removeAttribute("aria-label");
    }
    tray.style.setProperty("--unilib-crop-card-count", String(Math.max(1, entries.length)));
    overlay.querySelector("[data-unilib-crop-tray-count]").textContent = `${entries.length}개`;
    const toggle = overlay.querySelector("[data-unilib-crop-tray-toggle]");
    toggle.setAttribute("aria-expanded", String(cropTrayExpanded));
    toggle.textContent = cropTrayExpanded ? "접기" : "펼쳐보기";
    overlay.querySelector("[data-unilib-crop-tray-miniatures]").replaceChildren(...entries.slice(0, 5).map(({ result, materialized }) => {
      const image = document.createElement("img");
      image.src = resultImage(result, materialized);
      image.alt = "";
      return image;
    }));
    overlay.querySelector("[data-unilib-crop-tray-gallery]").replaceChildren(...entries.map(({ result, materialized }, index) => {
      const item = document.createElement("article");
      item.className = "unilib-crop-tray-item";
      const image = document.createElement("img");
      image.src = resultImage(result, materialized);
      image.alt = `크롭 이미지 ${index + 1}`;
      const sourceTitle = result.title || `크롭 이미지 ${index + 1}`;
      item.title = sourceTitle;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.unilibCropTrayRemove = result.id;
      remove.setAttribute("aria-label", `${sourceTitle} 모음에서 제거`);
      remove.textContent = "×";
      item.append(image, remove);
      return item;
    }));
    overlay.querySelector("[data-unilib-ai]").textContent = "AI 이미지/그래프";
    updateAiActionAvailability();
  }

  function collapseCropTray() {
    cropTrayExpanded = false;
    renderCropTray();
    overlay.querySelector("[data-unilib-crop-tray-toggle]").focus({ preventScroll: true });
  }

  async function loadContinuousPage(session, result, pageNumber, frame) {
    const pageLoading = createLibraryPreviewLoading(frame, null);
    session.loading.set(frame, pageLoading);
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
      pageLoading.complete(frame, image);
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
    } finally {
      pageLoading.dispose();
      if (session.loading.get(frame) === pageLoading) session.loading.delete(frame);
    }
  }

  function paintContinuousWindow(session, result, anchorPage) {
    if (continuousView !== session) return;
    const next = continuousPdfWindow(session.pageCount, anchorPage);
    const pageExtent = Number.parseFloat(getComputedStyle(root).getPropertyValue("--unilib-pdf-page-extent")) || DEFAULT_CONTINUOUS_PDF_PAGE_EXTENT;
    const extentChanged = session.pageExtent !== pageExtent;
    if (session.start === next.start && session.end === next.end && !extentChanged) return;
    session.pageExtent = pageExtent;
    session.start = next.start;
    session.end = next.end;
    session.visiblePage = Math.max(1, Math.min(session.pageCount, anchorPage));
    session.before.style.height = `${(next.start - 1) * pageExtent}px`;
    session.after.style.height = `${Math.max(0, session.pageCount - next.end) * pageExtent}px`;
    const activePages = new Set(next.pages);
    for (const [pageNumber, page] of session.pages) {
      if (!activePages.has(pageNumber)) {
        const frame = page.querySelector('.unilib-pdf-page-frame');
        session.loading.get(frame)?.dispose(); session.loading.delete(frame);
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
    const session = { resultId: result.id, pageCount, visiblePage: initialPage, start: 0, end: 0, pageExtent: 0, content, before, after, pages: new Map(), loading: new Map() };
    continuousView = session;
    stage.classList.add("is-continuous-pdf");
    stage.setAttribute("aria-label", `${result.title} 전체 PDF ${pageCount}쪽`);
    stage.replaceChildren(content);
    paintContinuousWindow(session, result, initialPage);
    stage.scrollTop = (initialPage - 1) * session.pageExtent;
  }

  function showPreviewError(error) {
    clearPreviewLoading();
    stage.removeAttribute("aria-busy");
    const message = document.createElement("div");
    message.className = "unilib-preview-error";
    const text = document.createElement("p");
    text.textContent = `미리보기 실패: ${error instanceof Error ? error.message : error}`;
    const retryButton = document.createElement("button");
    retryButton.type = "button";
    retryButton.className = "unilib-button";
    retryButton.textContent = "다시 시도";
    retryButton.addEventListener("click", () => {
      previewCache.clear();
      void renderPreview();
    });
    message.append(text, retryButton);
    clearTimeout(previewLoadingTimer); previewLoadingTimer = 0;
    stage.replaceChildren(message);
  }

  async function renderPreview(retry = 0) {
    const ownEpoch = ++previewEpoch;
    let result = selectedResult();
    clearPreviewLoading();
    const keepPrevious = !stage.classList.contains("is-continuous-pdf") && !!stage.querySelector(":scope > .unilib-preview-image");
    continuousView?.loading.forEach(pending => pending.dispose());
    continuousView = null;
    stage.classList.remove("is-continuous-pdf");
    stage.removeAttribute("data-visible-pdf-page");
    stage.querySelector(".unilib-preview-loading")?.remove();
    let pendingPaper = null;
    if (result) {
      pendingPaper = createPreviewPaper(result);
      const thumbnail = list.querySelector(`[data-result-id="${CSS.escape(result.id)}"] .unilib-thumb img`);
      const thumbnailSrc = thumbnail?.currentSrc || resultImage(result);
      const mountLoading = () => {
        previewLoadingTimer = 0;
        if (ownEpoch !== previewEpoch) return;
        stage.replaceChildren(pendingPaper);
        previewLoading = createLibraryPreviewLoading(stage, pendingPaper, thumbnailSrc);
      };
      if (keepPrevious) previewLoadingTimer = setTimeout(mountLoading, PREVIEW_LOADING_DELAY);
      else mountLoading();
    }
    const pdfMatches = result?.kind === "pdf" && Array.isArray(result.matches) ? result.matches : [];
    if (pdfMatchIndex >= pdfMatches.length) pdfMatchIndex = 0;
    const activePdfMatch = pdfMatches[pdfMatchIndex] || null;
    const matchNav = overlay.querySelector("[data-unilib-match-nav]");
    matchNav.hidden = pdfMatches.length < 2;
    overlay.querySelector("[data-unilib-match-position]").textContent = pdfMatches.length ? `${pdfMatchIndex + 1} / ${pdfMatches.length} · ${activePdfMatch.pageNumber}쪽` : "";
    const continuousPdf = result?.kind === "pdf" && activeTypes.length === 1 && activeTypes[0] === "pdf" && typeof result.loadPreview === "function";
    if (continuousPdf) {
      clearPreviewLoading();
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
      overlay.querySelector("[data-unilib-send]").disabled = actionBusy || typeof sendTo !== "function";
      overlay.querySelector("[data-unilib-adjust]").hidden = false;
      overlay.querySelector("[data-unilib-source-download]").hidden = !pdfUi?.canDownloadPdf?.(result);
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
        showPreviewError(resolution.error);
        return;
      }
      invalidateAction();
      results = results.map((value) => libraryResultIdentity(value) === requestIdentity ? resolution.result : value);
      result = resolution.result;
    }
    if (cropSession && !cropSessionIsCurrent(cropSession, result)) closeCrop(false);
    const representations = representationsForResult(result);
    if (!isValidQuestionRepresentation(result, activeFigureRepresentation) || activeFigureRepresentation === "full" || activeFigureRepresentation === "image") activeFigureRepresentation = result?.variants?.manual ? "manual" : "figure:0";
    if (representations.length && !isValidQuestionRepresentation(result, activeRepresentation)) activeRepresentation = representations[0].id;
    if (!representations.length) activeRepresentation = result?.variants?.manual ? "manual" : "full";
    const materializeResult = resultForRepresentation(result, activeRepresentation);
    // 종이를 갈아끼우지 않고 비율만 맞춘다(두 번째 교체가 깜빡임이었다).
    if (pendingPaper) pendingPaper.style.aspectRatio = createPreviewPaper(materializeResult).style.aspectRatio || "";
    const representationHost = overlay.querySelector("[data-unilib-representations]");
    representationHost.hidden = representations.length === 0;
    representationHost.replaceChildren(...representations.map((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.representation = option.id;
      button.innerHTML = option.id === "image" ? ICONS.kindImage : ICONS.viewQuestion;
      button.title = option.id === "image" ? "그림만" : "문항 전체";
      button.setAttribute("aria-label", button.title);
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
      // 11-05 시안 v8: 그림을 못 찾았으면 「그림만」 아이콘을 끈 채로 두고, 누르면 직접 자르기로 이어 준다.
      const cropButton = document.createElement("button");
      cropButton.type = "button";
      cropButton.dataset.unilibCropOffer = "";
      cropButton.className = "is-unavailable";
      cropButton.innerHTML = ICONS.kindImage;
      cropButton.title = "자동으로 찾은 그림이 없습니다 — 눌러서 직접 자르기";
      cropButton.setAttribute("aria-label", cropButton.title);
      representationHost.append(cropButton);
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
    overlay.querySelector("[data-unilib-send]").disabled = actionBusy || !actionAllowed || typeof sendTo !== "function";
    if (overlay.querySelector("[data-unilib-send]").disabled) closeSendMenu();
    updateAiActionAvailability();
    overlay.querySelector("[data-unilib-adjust]").hidden = result?.provenance?.provider !== "pdf";
    overlay.querySelector("[data-unilib-source-download]").hidden = !pdfUi?.canDownloadPdf?.(result);
    const sourceOpen = overlay.querySelector("[data-unilib-source-open]");
    const isPdf = result?.provenance?.provider === "pdf";
    const revealable = Boolean(result?.provenance?.documentId && desktopLibrary?.revealItem);
    const sourceUrl = safeExternalSourceUrl(result?.provenance?.sourceUrl);
    sourceOpen.textContent = isPdf ? "원문 페이지" : "출처 열기";
    sourceOpen.hidden = !result || (!isPdf && !revealable && !sourceUrl);
    if (!result) {
      if (searchReadiness === 'loading' && !query.value.trim()) setPreviewLoading();
      else { stage.textContent = '검색 결과를 선택하세요.'; stage.removeAttribute('aria-busy'); }
      return;
    }
    try {
      const activeProvider = await provider();
      const previewPixelWidth = result.kind === "crop" && result.cropType === "question" && result.provenance?.provider === "pdf"
        ? Math.ceil(stage.clientWidth * (window.devicePixelRatio || 1)) : undefined;
      const cacheKey = JSON.stringify([previewPixelWidth, libraryResultIdentity(materializeResult), materializeResult.provenance?.rect, result.revision ?? activeProvider.revision, activeRepresentation, getPartOptions()]);
      let pending = previewCache.get(cacheKey);
      if (!pending) {
        pending = result.kind === "pdf" && typeof result.loadPreview === "function"
          ? result.loadPreview(activePdfMatch?.pageNumber || result.firstMatchingPage || 1)
          : activeProvider.materialize(materializeResult, { ...getPartOptions(), preview: true, previewPixelWidth, representation: materializationRepresentation(result, activeRepresentation) });
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
        const keys = result?.cropType === "question" ? await loadAnswerKeys() : null;
        if (ownEpoch !== previewEpoch || result.id !== selectedId) return;
        const answerMarks = answerHighlights(result, keys);
        paintHighlightLayer(frame, image, { ...result, answerHighlights: answerMarks }, previewCrop);
        // 정답 표시 단추: 정답 형광펜이 있는 문항에서만 보인다. 끄면 형광펜만 숨긴다(다시 그리지 않음).
        const answerToggle = overlay.querySelector("[data-unilib-answers]");
        if (answerToggle) { answerToggle.hidden = !answerMarks.length; answerToggle.setAttribute("aria-pressed", String(answersShown())); }
        if (activeRepresentation === "full") paintFigureChoiceLayer(frame, image, figureChoicesForResult(result, activeFigureRepresentation), (representation) => {
          invalidateAction();
          activeFigureRepresentation = representation;
          void renderPreview();
        });
        clearTimeout(previewLoadingTimer); previewLoadingTimer = 0;
        stage.replaceChildren(frame);
        previewLoading?.complete(frame, image); previewLoading = null;
        stage.removeAttribute("aria-busy");
      } else { showPreviewError(new Error("미리보기 이미지가 없습니다.")); }
    } catch (error) {
      if (ownEpoch !== previewEpoch) return;
      if (retry < 1 && /superseded/iu.test(String(error?.message || error))) {
        await renderPreview(retry + 1);
        return;
      }
      showPreviewError(error);
    }
  }

  async function refreshDesktopSources(sync = false, isCurrent = () => true) {
    if (!desktopLibrary) return;
    let snapshot;
    if (sync && pdfUi?.syncDesktopConnections) {
      snapshot = await pdfUi.syncDesktopConnections();
      if (!isCurrent()) return;
      onDesktopSnapshot?.(snapshot);
      desktopWarnings = snapshot?.warnings || [];
      pendingIndexCount = (snapshot?.documents || []).filter((record) => ["reading", "unindexed", "indexing"].includes(record.indexState?.state)).length;
      followBackgroundIndexing(snapshot, isCurrent);
    } else {
      snapshot = await desktopLibrary.connections();
      if (!isCurrent()) return;
      desktopWarnings = [];
    }
    desktopConnections = snapshot?.connections || [];
    if (desktopWarnings.length) setStatus(`${desktopWarnings.length}개 파일을 안전 제한으로 건너뛰었습니다. 파일 크기를 확인하세요.`, true);
    await renderSources(isCurrent);
  }

  const hasOpenDrawer = () =>
    window.matchMedia("(max-width: 1099px)").matches && root.classList.contains("preview-open")
    || window.matchMedia("(max-width: 767px)").matches && root.classList.contains("folders-open");
  function closeDrawers() {
    root.classList.remove("folders-open", "preview-open");
    if (window.matchMedia("(max-width: 767px)").matches) setMobileFoldersOpen(false);
  }
  function closeExpandedReader() {
    root.classList.remove("is-reader-expanded");
    overlay.querySelector("[data-unilib-preview]").classList.remove("library-reader--expanded");
  }
  let cancelAiHandoff = null;
  function close({ restoreFocus = true, keyboard = lastInteractionWasKeyboard, aiHandoff = false } = {}) {
    libraryLoading.reset();
    clearPreviewLoading();
    continuousView?.loading.forEach(pending => pending.dispose());
    if (!motion.isOpen()) return;
    // WebKit can reset nested scroll positions while the overlay is hidden.
    closedResultViewport = restoringResultViewport ?? snapshotResultViewport();
    openEpoch += 1;
    invalidateAction();
    cancelPlacementChoice?.();
    cancelSpacePress?.();
    searchEpoch += 1;
    searchController?.abort();
    searchScheduler.cancel();
    previewEpoch += 1;
    thumbnailEpoch += 1;
    thumbnailQueue.clear();
    thumbnailObserver?.disconnect();
    thumbnailObserver = null;
    motion.hide({ onHidden: () => {
      cancelAiHandoff?.(); cancelAiHandoff = null;
      pdfUi?.deactivate?.();
      setDriveSettingsOpen(false);
      setLocalInstallOpen(false);
      root.classList.remove("consumer-mode");
      closeDrawers();
      closeExpandedReader();
      closeCrop(false);
    } });
    if (aiHandoff) cancelAiHandoff = animateLibraryAiHandoff(overlay, root, document.getElementById('ai-image-panel'));
    const closingConsumer = referenceConsumer;
    referenceConsumer = null;
    closingConsumer?.onClose?.();
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
    cancelAiHandoff?.(); cancelAiHandoff = null;
    const retainedViewport = motion.isOpen() ? null : closedResultViewport;
    restoringResultViewport = retainedViewport;
    const ownOpenEpoch = ++openEpoch;
    const isCurrentOpen = () => ownOpenEpoch === openEpoch && motion.isOpen();
    invalidateAction();
    returnFocus = trigger || document.activeElement;
    motion.show({ origin: trigger });
    if(!results.length){setResultState("loading", "라이브러리를 불러오는 중…");setPreviewLoading();overlay.querySelector('[data-unilib-count]').textContent='불러오는 중';}
    setSearchPaneOpen(searchPaneOpen);
    setPreviewPaneOpen(previewPaneOpen);
    setFolderLoading("loading");
    // Keep search, DOM replacement and PDF initialization outside the entrance
    // frames. Reopening retains the last usable preview throughout the motion.
    await new Promise(resolve=>{
      if(overlay.dataset.modalMotionState==='open'){resolve();return;}
      const observer=new MutationObserver(()=>{
        if(['open','closed'].includes(overlay.dataset.modalMotionState)){observer.disconnect();resolve();}
      });
      observer.observe(overlay,{attributes:true,attributeFilter:['data-modal-motion-state']});
    });
    if (!isCurrentOpen()) return;
    try {
      if (desktopLibrary) await pdfUi?.activate?.();
      if (!isCurrentOpen()) return;
      if (desktopLibrary && pdfUi?.syncDesktopConnections) {
        const snapshot = await pdfUi.syncDesktopConnections();
        if (!isCurrentOpen()) return;
        desktopConnections = snapshot?.connections || [];
        desktopWarnings = snapshot?.warnings || [];
        pendingIndexCount = (snapshot?.documents || []).filter((record) => ["reading", "unindexed", "indexing"].includes(record.indexState?.state)).length;
        onDesktopSnapshot?.(snapshot);
        followBackgroundIndexing(snapshot, isCurrentOpen);
        if (desktopWarnings.length) setStatus(`${desktopWarnings.length}개 파일을 안전 제한으로 건너뛰었습니다.`, true);
      }
      if (!await renderSources(isCurrentOpen)) return;
      if (!isCurrentOpen()) return;
      setFolderLoading("ready");
      await runSearch({ preservePreview: true, retainedViewport });
      if (isCurrentOpen()) { restoringResultViewport = null; query.focus({ preventScroll: true }); }
    } catch (error) {
      if (!isCurrentOpen()) return;
      const message = error instanceof Error ? error.message : String(error);
      setFolderLoading("error", message);
      setResultState('error', '라이브러리를 불러오지 못했습니다. 다시 시도해 주세요.');
      stage.removeAttribute("aria-busy");
      stage.textContent = "미리보기를 준비하지 못했습니다. 폴더 연결을 확인해 주세요.";
      setStatus(`라이브러리 폴더를 불러오지 못했습니다: ${message}`, true);
    }
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
  tree.addEventListener("click", async (event) => {
    const groupOpen = event.target.closest("[data-source-group-open]");
    if (groupOpen) {
      event.preventDefault();
      const group = groupOpen.dataset.sourceGroupOpen, open = !openSourceGroups.has(group);
      open ? openSourceGroups.add(group) : openSourceGroups.delete(group);
      groupOpen.setAttribute("aria-expanded", String(open));
      groupOpen.closest(".unilib-tree-group")?.classList.toggle("is-open", open);
      for (let item = groupOpen.closest(".unilib-tree-group")?.nextElementSibling; item && !item.classList.contains("unilib-tree-group"); item = item.nextElementSibling) item.classList.toggle("is-group-collapsed", !open);
      return;
    }
    const groupSwitch = event.target.closest("[data-source-group-switch]");
    if (groupSwitch) {
      event.preventDefault();
      const group = groupSwitch.dataset.sourceGroupSwitch, on = groupSwitch.getAttribute("aria-checked") !== "true";
      groupSwitch.disabled = true;
      try {
        const activeProvider = await provider();
        const sources = activeProvider.getSources();
        for (const root of sourceGroupRoots[group] || []) {
          if (root.desktop) { await desktopLibrary?.setFolderSelection(root.desktop.folderId, on); continue; }
          const affected = descendantLeafIds(root.id, sources);
          if (!affected.length) affected.push(root.id);
          affected.forEach((id) => on ? enabledSources.add(id) : enabledSources.delete(id));
          on ? excludedSourceGroups.delete(root.id) : excludedSourceGroups.add(root.id);
        }
        saveEnabledSources(storage, enabledSources, excludedSourceGroups);
        if ((sourceGroupRoots[group] || []).some((root) => root.desktop)) await refreshDesktopSources(true);
        await renderSources();
        await runSearch();
      } catch (error) {
        setStatus(`검색 위치를 바꾸지 못했습니다: ${error instanceof Error ? error.message : error}`, true);
        groupSwitch.disabled = false;
      }
      return;
    }
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
    const index = results.findIndex(result => result.id === id);
    if (index >= renderedResultCount) appendResultBatch(index);
    const card = list.querySelector(`[data-result-id="${CSS.escape(id)}"]`);
    if (!card) return;
    card.focus({ preventScroll: true });
    const scroller = overlay.querySelector(".unilib-result-scroll");
    const cardBounds = card.getBoundingClientRect();
    const scrollBounds = scroller.getBoundingClientRect();
    if (cardBounds.top < scrollBounds.top) scroller.scrollTop += cardBounds.top - scrollBounds.top;
    else if (cardBounds.bottom > scrollBounds.bottom) scroller.scrollTop += cardBounds.bottom - scrollBounds.bottom;
  };
  // 카드를 고르면 미리보기 칸이 열리며 결과 칸 높이가 줄어든다(예: 714→241px). 고른 카드를 칸 안으로 맞춘 뒤에 줄어들어
  // 카드가 칸 밖에 남던 것 — 미리보기를 그린 뒤(와 그 다음 프레임) 고른 카드가 칸 밖이면 가장 가까운 쪽으로 다시 맞춘다(초점은 그대로).
  const keepSelectedInView = (id) => {
    if (id !== selectedId || overlay.hidden || restoringResultViewport) return;
    const card = list.querySelector(`[data-result-id="${CSS.escape(id)}"]`);
    if (!card) return;
    const scroller = overlay.querySelector(".unilib-result-scroll");
    const cardBounds = card.getBoundingClientRect(), scrollBounds = scroller.getBoundingClientRect();
    if (cardBounds.bottom > scrollBounds.bottom) scroller.scrollTop += cardBounds.bottom - scrollBounds.bottom;
    else if (cardBounds.top < scrollBounds.top) scroller.scrollTop += cardBounds.top - scrollBounds.top;
  };
  list.addEventListener("click", (event) => {
    cancelSpacePress();
    const card = event.target.closest("[data-result-id]");
    if (!card) return;
    spaceAssignmentIdentity = null;
    invalidateAction();
    selectedId = card.dataset.resultId;
    pdfMatchIndex = 0;
    activeRepresentation = "full";
    activeFigureRepresentation = "figure:0";
    updateResultSelection();
    focusResultCard(selectedId);
    const id = selectedId;
    void Promise.resolve(renderPreview()).finally(() => {
      keepSelectedInView(id);
      requestAnimationFrame(() => keepSelectedInView(id));
    });
  });
  list.addEventListener("click", (event) => {
    const pick = event.target.closest("[data-unilib-pick]");
    if (pick) { event.preventDefault(); event.stopPropagation(); togglePick(pick.dataset.unilibPick); return; }
    const star = event.target.closest("[data-unilib-star]");
    if (!star) return;
    event.preventDefault(); event.stopPropagation();
    const on = !star.classList.contains("is-on");
    if (!setExamStar(star.dataset.unilibStar, on)) { setStatus("별표를 저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.", true); return; }
    list.querySelectorAll(`[data-unilib-star="${CSS.escape(star.dataset.unilibStar)}"]`).forEach((button) => paintStar(button, on));
    setStatus(on ? "별표했습니다 · 5E_exam 「★ 별표만」에도 나옵니다" : "별표를 뺐습니다");
  }, true);
  list.addEventListener('dblclick', event => {
    if (!event.target.closest('[data-result-id]')) return;
    event.preventDefault(); cancelSpacePress();
    void openExpandedPreview(libraryResultIdentity(selectedActiveResult()));
  });
  overlay.querySelector("[data-unilib-crop-tray-toggle]").addEventListener("click", () => {
    cropTrayExpanded = !cropTrayExpanded;
    renderCropTray();
  });
  overlay.querySelector("[data-unilib-crop-tray-gallery]").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-unilib-crop-tray-remove]");
    if (!remove) return;
    const id = remove.dataset.unilibCropTrayRemove;
    acceptedAssets.delete(id);
    acceptedCrops = acceptedCrops.filter(({ result }) => result.id !== id);
    invalidateAction();
    renderAcceptedCrops();
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
  // A deferred search must not invalidate an accepted-crop handoff when its
  // selected source is unchanged. runSearch still invalidates a new selection.
  const searchScheduler = createSearchScheduler(() => runSearch({ preservePreview: true }));
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
    overlay.querySelectorAll("[data-unilib-rail-type]").forEach((item) => item.classList.toggle("is-on", item.dataset.unilibRailType === "all" ? all : !all && activeTypes.includes(item.dataset.unilibRailType)));
    overlay.querySelector("[data-unilib-exam-filters]").hidden = !activeTypes.includes("question");
    overlay.querySelector("[data-unilib-pdf-display]").hidden = !(activeTypes.length === 1 && activeTypes[0] === "pdf");
  };
  list.addEventListener("click", (event) => {
    const more = event.target.closest("[data-unilib-section-more]");
    if (!more) return;
    event.preventDefault();
    event.stopPropagation();
    cancelSpacePress();
    activeTypes = [more.dataset.unilibSectionMore];
    updateTypeControls();
    void runSearch();
  });
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
  overlay.querySelector("[data-unilib-crop-tray-clear]").addEventListener("click", () => {
    acceptedAssets.clear();
    acceptedCrops = [];
    activeAcceptedCropId = null;
    invalidateAction();
    renderAcceptedCrops();
    updateResultSelection();
  });
  const stepPdfMatch = (delta) => {
    const count = selectedResult()?.matches?.length || 0;
    if (!count) return;
    pdfMatchIndex = (pdfMatchIndex + delta + count) % count;
    if (continuousView?.resultId === selectedId) {
      const pageNumber = selectedResult().matches[pdfMatchIndex].pageNumber;
      overlay.querySelector("[data-unilib-match-position]").textContent = `${pdfMatchIndex + 1} / ${count} · ${pageNumber}쪽`;
      stage.scrollTop = (pageNumber - 1) * continuousView.pageExtent;
      stage.dispatchEvent(new Event("scroll"));
    } else void renderPreview();
  };
  overlay.querySelector("[data-unilib-match-prev]").addEventListener("click", () => stepPdfMatch(-1));
  overlay.querySelector("[data-unilib-match-next]").addEventListener("click", () => stepPdfMatch(1));
  stage.addEventListener("scroll", () => {
    const session = continuousView;
    const result = selectedResult();
    if (!session || result?.id !== session.resultId) return;
    const pageNumber = Math.max(1, Math.min(session.pageCount, Math.floor((stage.scrollTop + stage.clientHeight / 2) / session.pageExtent) + 1));
    session.visiblePage = pageNumber;
    stage.dataset.visiblePdfPage = String(pageNumber);
    overlay.querySelector("[data-unilib-source-meta]").textContent = resultSourceText(pdfFilePageResult(result, pageNumber));
    if (pdfDisplayMode === "page" && result.provenance?.pageNumber !== pageNumber) {
      let next = results.find((item) => item.kind === "pdf"
        && item.provenance?.documentId === result.provenance?.documentId
        && item.provenance?.pageNumber === pageNumber);
      if (!next) {
        next = { ...pdfFilePageResult(result, pageNumber), id: result.id.replace(/:page:\d+$/, `:page:${pageNumber}`), matches: [], subtitle: `${result.title} · ${pageNumber}쪽` };
        const following = results.findIndex((item) => item.kind === "pdf"
          && item.provenance?.documentId === result.provenance?.documentId
          && item.provenance?.pageNumber > pageNumber);
        const index = following >= 0 ? following : results.map((item) => item.provenance?.documentId).lastIndexOf(result.provenance?.documentId) + 1;
        results.splice(index, 0, next);
      }
      if (next) {
        const cardMissing = !list.querySelector(`[data-result-id="${CSS.escape(next.id)}"]`);
        invalidateAction();
        selectedId = next.id;
        session.resultId = next.id;
        if (cardMissing) renderResults();
        else updateResultSelection();
        const index = results.indexOf(next);
        if (index >= renderedResultCount) appendResultBatch(index);
        list.querySelector(`[data-result-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
    paintContinuousWindow(session, result, pageNumber);
  }, { passive: true });
  foldersToggle.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 720px)").matches) {
      setMobileFoldersOpen(!root.classList.contains("folders-open"));
      return;
    }
    setSearchPaneOpen(!searchPaneOpen);
  });
  overlay.querySelector("[data-unilib-folders-close]").addEventListener("click", closeDrawers);
  const setDriveSettingsOpen = (open) => {
    driveSettings.hidden = !open;
    for (const child of root.children) {
      if (child !== driveSettings) child.inert = open;
    }
  };
  const closeDriveSettings = () => {
    if (driveSettings.hidden) return;
    setDriveSettingsOpen(false);
    driveSettingsReturnFocus?.focus?.({ preventScroll: true });
  };
  overlay.querySelector("[data-unilib-drive-settings-open]").addEventListener("click", (event) => {
    driveSettingsReturnFocus = event.currentTarget;
    setDriveSettingsOpen(true);
    driveSettings.querySelector("input, button")?.focus();
  });
  overlay.querySelector("[data-unilib-drive-settings-close]").addEventListener("click", closeDriveSettings);
  driveSettings.addEventListener("mousedown", (event) => { if (event.target === driveSettings) closeDriveSettings(); });
  driveSettings.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = [...driveSettings.querySelectorAll("button:not([hidden]):not([disabled]), input:not([hidden]):not([disabled])")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  const setLocalInstallOpen = (open) => {
    localInstall.hidden = !open;
    for (const child of root.children) {
      if (child !== localInstall) child.inert = open;
    }
  };
  const closeLocalInstall = () => {
    if (localInstall.hidden) return;
    setLocalInstallOpen(false);
    localInstallReturnFocus?.focus?.({ preventScroll: true });
    localInstallReturnFocus = null;
  };
  const openLocalInstall = (trigger) => {
    localInstallReturnFocus = trigger;
    setLocalInstallOpen(true);
    localInstall.querySelector("[data-unilib-local-install-close]")?.focus();
  };
  overlay.querySelector("[data-unilib-local-install-close]").addEventListener("click", closeLocalInstall);
  localInstall.addEventListener("mousedown", (event) => { if (event.target === localInstall) closeLocalInstall(); });
  localInstall.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const focusable = [...localInstall.querySelectorAll("button:not([hidden]):not([disabled]), a[href]")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  setSearchPaneOpen(searchPaneOpen);
  setPreviewPaneOpen(previewPaneOpen);
  previewToggle?.addEventListener("click", () => setPreviewPaneOpen(!previewPaneOpen));
  overlay.querySelector("[data-unilib-result-retry]").addEventListener("click", () => void (searchReadiness === "error" && providedRetry ? providedRetry() : overlay.querySelector('[data-unilib-folder-loading]').dataset.state === 'error' ? open(returnFocus) : runSearch()));
  overlay.querySelector("[data-unilib-provided-retry]").addEventListener("click", () => { if (typeof providedRetry === "function") void providedRetry(); });
  overlay.querySelector("[data-unilib-scrim]").addEventListener("click", closeDrawers);
  overlay.querySelector("[data-unilib-close]").addEventListener("click", close);
  overlay.addEventListener("mousedown", (event) => { if (event.target === overlay) close(); });
  const openAiDestination = async (references, { assignment = null, isCurrent } = {}) => {
    const placement = assignment?.placement || "separate";
    setStatus("AI 작업실을 여는 중…");
    if (typeof openIndependentReferences === "function") {
      return openIndependentReferences({ references, startGeneration: false, conversionKind:assignment?.conversionKind || 'image', placement, groups: assignment?.groups, groupKinds: assignment?.groupKinds, isCurrent });
    }
    if (typeof openAi !== "function") throw new Error("AI 작업실을 사용할 수 없습니다.");
    return openAi({ references, conversionKind:assignment?.conversionKind || 'image', placement, groups: assignment?.groups, groupKinds: assignment?.groupKinds, isCurrent });
  };
  overlay.querySelector("[data-unilib-insert]").addEventListener("click", async () => {
    await runLibraryAction(async (snapshot, isCurrent) => {
      const result = resultForActionSnapshot(snapshot);
      const representation = selectedInsertRepresentation(result, snapshot.representation, snapshot.selectedFigure);
      if (!result || !canInsertLibraryResult(result, representation)) return;
      const effectiveResult = resultForRepresentation(result, representation);
      const activeProvider = await provider();
      if (!isCurrent()) return;
      const materialized = await materializeLibraryAction(effectiveResult, activeProvider, { ...snapshot.options, acceptedAssets, representation: materializationRepresentation(result, representation) });
      if (!isCurrent()) return;
      await insertMaterialized(effectiveResult, materialized, snapshot.options, { isCurrent });
      if (isCurrent()) close();
    });
  });
  // 보내기: 「이미지 객체화」 자리. 고른 그림(PDF에서 자른 영역·문항 그림)을 한글 시험지(작업대에 넣고 기존 「한글로 보내기」)나
  // ExamPool 문항 카드(왼쪽 라이브러리 칸 「가져온 자료」)로 보낸다. 켜지는 조건은 예전 객체화와 같다.
  const sendButton = overlay.querySelector("[data-unilib-send]"), sendMenu = overlay.querySelector(".unilib-send-menu");
  function closeSendMenu({ focus = false } = {}) {
    if (sendMenu.hidden) return;
    sendMenu.hidden = true; sendButton.setAttribute("aria-expanded", "false");
    if (sendButton.dataset.sendTitle !== undefined) { sendButton.title = sendButton.dataset.sendTitle; delete sendButton.dataset.sendTitle; }
    if (focus) sendButton.focus();
  }
  sendButton.addEventListener("click", () => {
    if (!sendMenu.hidden) { closeSendMenu(); return; }
    sendMenu.hidden = false; sendButton.setAttribute("aria-expanded", "true");
    // 메뉴가 열린 동안 단추 설명 풍선이 메뉴 항목을 덮지 않게 설명을 잠시 뗀다(포커스만으로도 풍선이 뜸).
    sendButton.dataset.sendTitle = sendButton.title; sendButton.removeAttribute("title"); document.querySelector(".app-tooltip")?.classList.remove("is-visible");
    if (lastInteractionWasKeyboard) sendMenu.querySelector("button")?.focus();
  });
  // 메뉴가 열려 있을 때 Esc는 메뉴만 닫는다(라이브러리 창은 그대로).
  window.addEventListener("keydown", (event) => {
    if (sendMenu.hidden || event.key !== "Escape") return;
    event.preventDefault(); event.stopImmediatePropagation(); closeSendMenu({ focus: sendMenu.contains(document.activeElement) });
  }, true);
  sendMenu.addEventListener("keydown", (event) => {
    const items = [...sendMenu.querySelectorAll("button")], at = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); items[(at + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus(); }
  });
  overlay.addEventListener("pointerdown", (event) => { if (!event.target.closest?.(".unilib-send-menu,[data-unilib-send]")) closeSendMenu(); }, true);
  sendMenu.addEventListener("click", async (event) => {
    const target = event.target.closest?.("[data-unilib-send-to]")?.dataset.unilibSendTo;
    if (!target) return;
    closeSendMenu();
    await runLibraryAction(async (snapshot, isCurrent) => {
      const result = resultForActionSnapshot(snapshot);
      const representation = selectedInsertRepresentation(result, snapshot.representation, snapshot.selectedFigure);
      if (!result || !canInsertLibraryResult(result, representation) || typeof sendTo !== "function") return;
      const effectiveResult = resultForRepresentation(result, representation);
      const activeProvider = await provider();
      if (!isCurrent()) return;
      const materialized = await materializeLibraryAction(effectiveResult, activeProvider, { ...snapshot.options, acceptedAssets, representation: materializationRepresentation(result, representation) });
      if (!isCurrent()) return;
      const after = await sendTo(target, effectiveResult, materialized, snapshot.options, { isCurrent });
      if (isCurrent()) { close({ restoreFocus: false }); if (typeof after === "function") after(); }
    });
  });
  async function deliverGraphReference(result, materialized, isCurrent) {
    const reference = await rasterizeReference(materializedReference(result, materialized));
    if (!isCurrent()) return;
    const value = { name:reference.name, data:reference.dataUrl, sourceKind:reference.sourceKind, source:reference.source };
    if (referenceConsumer?.kind === 'graph') {
      await referenceConsumer.onAdd(value);
      if (isCurrent()) close({restoreFocus:false});
    } else {
      if (typeof openGraph !== 'function') throw new Error('좌표/함수 생성이 준비되지 않았습니다.');
      close({restoreFocus:false});
      await openGraph(value);
    }
  }
  overlay.querySelector('[data-unilib-graph]').addEventListener('click', async () => {
    await runLibraryAction(async (snapshot,isCurrent) => {
      const entries = snapshot.acceptedAssetIds.map(id=>acceptedAssets.get(id)).filter(Boolean);
      const selected = entries.find(entry=>entry.result.id===snapshot.selectedId);
      const entry = selected || (entries.length===1 ? entries[0] : null);
      if (!entry) throw new Error('비교할 이미지 하나를 선택하세요.');
      const result=entry.result;
      const representation=aiActionRepresentationForResult(result,snapshot.selectedId,snapshot.representation,snapshot.selectedFigure);
      if(!canInsertLibraryResult(result,representation))throw new Error('PDF에서 그래프 영역을 크롭한 뒤 선택하세요.');
      const activeProvider=await provider();if(!isCurrent())return;
      const effective=resultForRepresentation(result,representation);
      const materialized=await materializeLibraryAction(effective,activeProvider,{...snapshot.options,acceptedAssets,representation:materializationRepresentation(result,representation)});
      if(isCurrent())await deliverGraphReference(effective,materialized,isCurrent);
    });
  });
  let cancelPlacementChoice = null;
  overlay.querySelector("[data-unilib-ai]").addEventListener("click", async () => {
    await runLibraryAction(async (snapshot, isCurrent) => {
      const chosen = snapshot.acceptedAssetIds.map((id) => acceptedAssets.get(id)?.result).filter(Boolean);
      if (!chosen.length) return;
      const activeProvider = await provider();
      if (!isCurrent()) return;
      const transferredEntries = [];
      const jobs=[];
      const previews=[];
      for(const result of chosen){
        const representation=aiActionRepresentationForResult(result,snapshot.selectedId,snapshot.representation,snapshot.selectedFigure);
        if(!canInsertLibraryResult(result,representation))continue;
        const effectiveResult=resultForRepresentation(result,representation);
        const accepted=acceptedAssets.get(result.id);
        jobs.push({result,effectiveResult,representation});transferredEntries.push(accepted);
        previews.push(materializedReference(effectiveResult,accepted?.materialized || (result.id===snapshot.selectedId?currentMaterialized:null)));
      }
      if(!isCurrent() || !jobs.length)return;
      // Assignment uses the already displayed crops; exact output preparation
      // starts only after confirmation and never blocks opening this dialog.
      const assignment = referenceConsumer && jobs.length === 1
        ? {placement:"separate",groups:[[0]]}
        : await chooseWorkbenchAssignment({references:previews,host:overlay,allowConversionChoice:!referenceConsumer,returnFocus:overlay.querySelector("[data-unilib-ai]")});
      if(!assignment || !isCurrent())return;
      setStatus("선택한 영역의 원본 이미지를 준비하는 중…");
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const references=[];
      for(const {result,effectiveResult,representation} of jobs){
        const materialized=await materializeLibraryAction(effectiveResult,activeProvider,{...snapshot.options,acceptedAssets,representation:materializationRepresentation(result,representation)});
        if(!isCurrent())return;
        const reference=await rasterizeReference(materializedReference(effectiveResult,materialized));
        if(!isCurrent())return;
        references.push(reference);
        const accepted=acceptedAssets.get(result.id);
        if(accepted && !materialized.previewOnly)accepted.materialized=materialized;
      }
      workbenchReferenceGroups(references, assignment);
      const assignedIndices = [...new Set(assignment.groups.flat())];
      const removeTransferred = (indices) => {
        const removed = new Set();
        for (const index of indices) {
          const entry = transferredEntries[index];
          if (!entry || acceptedAssets.get(entry.result.id) !== entry) continue;
          acceptedAssets.delete(entry.result.id);
          removed.add(entry);
        }
        acceptedCrops = acceptedCrops.filter(entry => !removed.has(entry));
        if ([...removed].some(entry => entry.result.id === activeAcceptedCropId)) activeAcceptedCropId = null;
        if (removed.size && motion.isOpen()) {
          renderAcceptedCrops();
          renderCropTray();
          updateResultSelection();
        }
      };
      const completedIndices = [];
      try {
        if (referenceConsumer) {
          const consumer = referenceConsumer;
          const additions = references.map(reference => ({ name: reference.name, data: reference.dataUrl, sourceKind: reference.sourceKind, source: reference.source }));
          if (consumer.onAddMany) {
            await consumer.onAddMany(additions, assignment);
            completedIndices.push(...assignedIndices);
          } else {
            if (typeof consumer.onAdd !== "function") throw new Error("참고 이미지를 받을 작업이 없습니다.");
            for (const index of assignedIndices) {
              await consumer.onAdd(additions[index]);
              completedIndices.push(index);
            }
          }
          consumer.onStatus?.(`라이브러리 참고 이미지 ${completedIndices.length}개가 추가되었습니다.`, "ok");
          consumer.onComplete?.({ restoreFocus: false, aiHandoff: true });
          if (referenceConsumer === consumer) referenceConsumer = null;
        } else {
          const receipt = await openAiDestination(references, { assignment, isCurrent });
          completedIndices.push(...(Array.isArray(receipt) && receipt.every(item => Array.isArray(item.referenceIndices))
            ? receipt.flatMap(item => item.referenceIndices) : assignedIndices));
        }
      } catch (error) {
        removeTransferred([...completedIndices, ...(error?.transferredReferenceIndices || [])]);
        setStatus(error?.name === 'AbortError' ? '로그인이 취소되었습니다. 선택한 이미지는 그대로 유지됩니다.' : `AI 작업실을 열지 못했습니다: ${error instanceof Error ? error.message : error}`, error?.name !== 'AbortError');
        return;
      }
      const shouldClose = isCurrent();
      if (shouldClose) close({ restoreFocus: false, aiHandoff: true });
      removeTransferred(completedIndices);
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
        const pages = activeProvider.search({ query: query.value.trim(), sourceIds: [...enabledSources], kinds: ["page"], limit: Number.MAX_SAFE_INTEGER });
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
  overlay.querySelector("[data-unilib-source-download]").addEventListener("click", async () => {
    const result = selectedActiveResult();
    if (!result || !pdfUi?.canDownloadPdf?.(result)) return;
    try {
      setStatus("원본 PDF를 준비하는 중…");
      const saved = await pdfUi.downloadPdf(result);
      setStatus(saved?.canceled ? "PDF 저장을 취소했습니다." : "PDF를 컴퓨터에 저장했습니다.");
    } catch (error) {
      setStatus(`PDF 저장 실패: ${error instanceof Error ? error.message : error}`, true);
    }
  });
  const cropDialog = overlay.querySelector("[data-unilib-crop]");
  const cropStage = overlay.querySelector("[data-unilib-crop-stage]");
  const cropCanvas = overlay.querySelector("[data-unilib-crop-canvas]");
  const cropBox = overlay.querySelector("[data-unilib-crop-box]");
  const cropImage = overlay.querySelector("[data-unilib-crop-image]");
  const cropPreview = overlay.querySelector("[data-unilib-crop-preview]");
  const cropCollection = overlay.querySelector("[data-unilib-crop-collection]");
  const cropAcceptedLayer = overlay.querySelector("[data-unilib-crop-accepted-layer]");
  const cropDraftReview = overlay.querySelector("[data-unilib-crop-draft-review]");
  const cropConfirm = overlay.querySelector("[data-unilib-crop-confirm]");
  const cropSave = overlay.querySelector("[data-unilib-crop-save]");
  const cropTitle = overlay.querySelector("#unilib-crop-title");
  const cropZoomOutput = overlay.querySelector("[data-unilib-crop-zoom]");
  const cropPageControls = overlay.querySelector("[data-unilib-crop-page-controls]");
  const cropPageOutput = overlay.querySelector("[data-unilib-crop-page]");
  const cropPagePrev = overlay.querySelector("[data-unilib-crop-page-prev]");
  const cropPageNext = overlay.querySelector("[data-unilib-crop-page-next]");
  let editingAcceptedId = null;
  let cropReady = false;
  let cropOpenOptions = {};
  const cropLoadState = overlay.querySelector("[data-unilib-crop-load-state]");
  const cropQuality = overlay.querySelector("[data-unilib-crop-quality]");
  // Shown while the crop stage works on the fast page preview and the original PDF page is still loading.
  const setCropQuality = (state, message = "고해상도 원본 준비 중…") => {
    cropQuality.hidden = !state;
    if (state) cropQuality.dataset.state = state;
    else delete cropQuality.dataset.state;
    cropQuality.querySelector("[data-unilib-crop-quality-message]").textContent = message;
    cropQuality.querySelector("[data-unilib-crop-quality-retry]").hidden = state !== "error";
  };
  const cropLoadPaper = document.createElement("div");
  cropLoadPaper.className = "unilib-crop-load-paper";
  cropLoadPaper.setAttribute("aria-hidden", "true");
  const cropLoadPreview = new Image();
  cropLoadPreview.className = "unilib-crop-load-preview";
  cropLoadPreview.alt = "";
  cropLoadPreview.hidden = true;
  cropLoadPreview.setAttribute("aria-hidden", "true");
  cropCanvas.prepend(cropLoadPaper, cropLoadPreview);
  const cropMagnifier = attachCropMagnifier({
    surface: cropStage, image: cropImage,
    inspector: overlay.querySelector(".unilib-crop-preview"),
    id: "library-crop-magnifier",
    context: "library",
    available: () => cropReady && !cropDialog.hidden && !overlay.hidden && !cropSession?.viewOnly,
  });
  const sizePendingCrop = (geometry) => {
    if (!geometry) return;
    const style = getComputedStyle(cropStage);
    const available = Math.max(1, cropStage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    const size = fittedPageSize(geometry, available / cropFitBounds[2], cropZoom);
    cropCanvas.style.width = `${size.width}px`;
    cropCanvas.style.height = `${size.height}px`;
    continuousCrop.size(size.width, size.height);
  };
  const showCropTargetThumbnail = async (session, file) => {
    if (typeof file?.loadPreview !== "function") return;
    const isCurrent = () => cropSession === session && !cropDialog.hidden && !overlay.hidden && !cropReady
      && cropLoadState.dataset.state === "loading";
    let timeout;
    try {
      const materialized = await Promise.race([
        Promise.resolve().then(() => file.loadPreview(session.pageNumber, { thumbnail: true })),
        new Promise((resolve) => { timeout = setTimeout(() => resolve(null), 2000); }),
      ]);
      if (!materialized || !isCurrent()) return;
      const renderedPage = materialized?.provenance?.pageNumber ?? materialized?.source?.pageNumber;
      if (renderedPage != null && Number(renderedPage) !== session.pageNumber) return;
      const src = resultImage(pdfFilePageResult(file, session.pageNumber), materialized);
      if (!src) return;
      const decoded = new Image();
      decoded.src = src;
      await decoded.decode();
      if (!isCurrent()) return;
      sizePendingCrop({ width: decoded.naturalWidth, height: decoded.naturalHeight });
      cropLoadPreview.src = src;
      cropLoadPreview.hidden = false;
      cropLoadPaper.hidden = true;
    } catch { /* The neutral paper remains while the original page loads. */ }
    finally { clearTimeout(timeout); }
  };
  const cropRetry = overlay.querySelector("[data-unilib-crop-retry]");
  const setCropLoadState = (state, message = "PDF 페이지를 불러오는 중입니다…") => {
    cropReady = state === "ready";
    if (!cropReady) setCropQuality(null);
    cropMagnifier.hide();
    cropLoadPreview.hidden = true;
    cropLoadPreview.removeAttribute("src");
    cropLoadPaper.hidden = cropReady;
    cropStage.setAttribute("aria-busy", String(state === "loading"));
    cropLoadState.hidden = cropReady;
    cropLoadState.dataset.state = state;
    cropLoadState.querySelector("[data-unilib-crop-load-message]").textContent = message;
    cropRetry.hidden = state !== "error";
    cropImage.hidden = !cropReady;
    overlay.querySelector("[data-unilib-crop-fit]").disabled = !cropReady;
    setCropActionAvailability();
  };
  const addCropHandles = (box) => {
    for (const edge of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
      const handle = document.createElement("i");
      handle.dataset.cropHandle = edge;
      box.append(handle);
    }
  };
  addCropHandles(cropBox);
  const cropRectKey = () => draftCrop?.join(",") ?? "";
  const cropConfirmationIsCurrent = request => Boolean(request
    && request.session === cropSession && request.epoch === cropPreviewEpoch
    && request.rectKey === cropRectKey() && request.editingId === editingAcceptedId
    && !cropDialog.hidden && !overlay.hidden && !cropGesture?.drawing && !cropActionBusy);
  const cropActionTargets = () => {
    if (activeAcceptedCropId) return acceptedCrops.filter(({ result }) => result.id === activeAcceptedCropId);
    return [...acceptedCrops];
  };
  const cropActionState = () => ({
    resultId: cropSession?.resultId,
    documentId: cropSession?.documentId,
    pageNumber: cropSession?.pageNumber,
    resultIdentity: cropSession?.resultIdentity,
    currentResultIdentity: libraryResultIdentity(selectedActiveResult()),
    rectKey: cropActionTargets().map(({ result }) => `${result.id}:${result.provenance.rect.join(",")}`).join("|"),
    open: !cropDialog.hidden,
    exact: Boolean(cropActionTargets().length && cropSessionIsCurrent(cropSession, selectedActiveResult())),
  });
  const cropDocumentEntries = () => [
    ...[...acceptedAssets.values()].filter(({ result }) => result.provenance.documentId === cropSession?.documentId && result.provenance.pageNumber !== cropSession?.pageNumber),
    ...acceptedCrops,
  ];
  const renderAcceptedCrops = () => {
    const documentCrops = cropDocumentEntries();
    cropCollection.replaceChildren(...documentCrops.map(({ result, materialized }, index) => {
      const item = document.createElement("div");
      item.className = "unilib-crop-collection-item";
      item.dataset.unilibGraphCrop=result.id;
      item.tabIndex=0;item.setAttribute("role","button");item.setAttribute("aria-label",`${index+1}번째 자른 이미지 선택`);
      const thumbnail = document.createElement("img");
      thumbnail.className = "unilib-crop-collection-thumb";
      thumbnail.src = resultImage(result, materialized);
      thumbnail.alt = `자른 이미지 ${index + 1}`;
      const rect = result.provenance.rect.map((value) => `${Math.round(value * 100)}%`).join(" · ");
      item.title = `${result.provenance.pageNumber}쪽 · ${rect}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "unilib-crop-collection-delete";
      remove.dataset.unilibCropRemove = result.id;
      remove.setAttribute("aria-label", `${index + 1}번째 자르기 영역 삭제`);
      remove.textContent = "×";
      item.classList.toggle("is-selected", !activeAcceptedCropId || activeAcceptedCropId === result.id);
      item.append(thumbnail, remove);
      return item;
    }));
    cropAcceptedLayer.replaceChildren(...acceptedCrops.map(({ result }, index) => {
      const marker = document.createElement("div");
      marker.className = "unilib-crop-accepted-box";
      marker.dataset.cropNumber = String(index + 1);
      marker.dataset.acceptedCropId = result.id;
      marker.classList.toggle("is-active", activeAcceptedCropId === result.id);
      addCropHandles(marker);
      marker.setAttribute("aria-hidden", "true");
      const [x, y, width, height] = result.provenance.rect;
      Object.assign(marker.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${width * 100}%`, height: `${height * 100}%` });
      const number = document.createElement("span");
      number.textContent = String(index + 1);
      marker.append(number);
      return marker;
    }));
    cropCollection.hidden = documentCrops.length === 0;
    overlay.querySelector("[data-unilib-crop-count]").textContent = `크롭 이미지 ${documentCrops.length}개`;
    overlay.querySelector("[data-unilib-crop-selection]").textContent = activeAcceptedCropId
      ? `${documentCrops.findIndex(({ result }) => result.id === activeAcceptedCropId) + 1}번 영역만 선택됨`
      : documentCrops.length ? `${documentCrops.length}개 영역 모두 선택됨` : "추가한 영역이 없습니다.";
  };
  const setCropActionAvailability = () => {
    const available = cropReady && cropDocumentEntries().length > 0 && !cropActionBusy;
    const draftReady = Boolean(cropReady && draftCrop && cropPreviewExact && cropExact?.rectKey === cropRectKey() && !cropActionBusy);
    cropConfirm.hidden = !draftCrop || Boolean(editingAcceptedId);
    cropSave.disabled = !draftReady;
    if (pendingCropConfirmation && !cropConfirmationIsCurrent(pendingCropConfirmation)) pendingCropConfirmation = null;
    if (draftReady && pendingCropConfirmation) {
      const request = pendingCropConfirmation;
      pendingCropConfirmation = null;
      queueMicrotask(() => {
        if (cropConfirmationIsCurrent(request) && !cropSave.disabled) cropSave.click();
      });
    }
    overlay.querySelector("[data-unilib-crop-workbench]").disabled = !available;
    syncSpaceAction();
    const canvasButton = overlay.querySelector('[data-unilib-crop-insert]');
    canvasButton.hidden = Boolean(referenceConsumer) || typeof insertMaterialized !== 'function';
    canvasButton.disabled = !available || (cropDocumentEntries().length > 1 && !activeAcceptedCropId);
    canvasButton.title = '캔버스에 넣을 크롭 이미지 하나를 선택하세요.';
    const graph = overlay.querySelector('[data-unilib-crop-graph]');
    graph.hidden = referenceConsumer?.kind !== 'graph' && (!!referenceConsumer || typeof openGraph !== 'function');
    graph.textContent = referenceConsumer?.kind === 'graph' ? '그래프 원본으로 선택' : '좌표/함수 생성';
    graph.disabled = !available;
    graph.title = '비교할 크롭 이미지 하나를 선택해 그래프를 만듭니다.';
  };
  const sizeCropCanvas = () => {
    if (!cropImage.naturalWidth || !cropImage.naturalHeight) return;
    cropCanvas.style.width = `${cropImage.naturalWidth * cropBaseScale * cropZoom}px`;
    cropCanvas.style.height = `${cropImage.naturalHeight * cropBaseScale * cropZoom}px`;
    continuousCrop.size(cropImage.naturalWidth * cropBaseScale * cropZoom, cropImage.naturalHeight * cropBaseScale * cropZoom);
    cropZoomOutput.value = `${Math.round(cropZoom * 100)}%`;
    cropZoomOutput.textContent = cropZoomOutput.value;
  };
  const centerCropContent = () => {
    if (continuousCrop.mounted) {
      continuousCrop.activate(cropSession.pageNumber, true);
      if (selectedActiveResult()?.kind !== "crop") return;
    }
    const [x, y, width, height] = cropFitBounds;
    const focusY = draftCrop ? draftCrop[1] + draftCrop[3] / 2 : y + height / 2;
    const stageRect = cropStage.getBoundingClientRect();
    const canvasRect = cropCanvas.getBoundingClientRect();
    const canvasLeft = canvasRect.left - stageRect.left + cropStage.scrollLeft;
    const canvasTop = canvasRect.top - stageRect.top + cropStage.scrollTop;
    cropStage.scrollLeft = canvasLeft + (x + width / 2) * cropCanvas.offsetWidth - cropStage.clientWidth / 2;
    cropStage.scrollTop = canvasTop + focusY * cropCanvas.offsetHeight - cropStage.clientHeight / 2;
  };
  const fitCropContent = () => {
    if (!cropImage.naturalWidth || !cropImage.naturalHeight || !cropStage.clientWidth || !cropStage.clientHeight) return;
    const [, , contentWidth, contentHeight] = cropFitBounds;
    const stageStyle = getComputedStyle(cropStage);
    const horizontalInset = Number.parseFloat(stageStyle.paddingLeft) + Number.parseFloat(stageStyle.paddingRight);
    const availableWidth = Math.max(1, cropStage.clientWidth - horizontalInset);
    const verticalInset = Number.parseFloat(stageStyle.paddingTop) + Number.parseFloat(stageStyle.paddingBottom);
    const availableHeight = Math.max(1, cropStage.clientHeight - verticalInset);
    const widthScale = availableWidth / (cropImage.naturalWidth * contentWidth);
    const question = selectedActiveResult()?.kind === "crop";
    cropBaseScale = Math.max(0.01, question
      ? Math.min(widthScale, availableHeight / (cropImage.naturalHeight * contentHeight))
      : widthScale);
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
  let cropPreviewFrame = 0;
  const paintCropPreview = () => {
    cropPreviewFrame = 0;
    cropPreview.style.display = cropReady && draftCrop ? "block" : "none";
    if (!cropReady || !draftCrop || !cropImage.complete || !cropImage.naturalWidth) {
      cropPreview.width = 1;
      cropPreview.height = 1;
      return;
    }
    const [x, y, width, height] = draftCrop;
    const sourceWidth = cropImage.naturalWidth * width;
    const sourceHeight = cropImage.naturalHeight * height;
    const previewScale = Math.min(1, 640 / Math.max(sourceWidth, sourceHeight));
    cropPreview.width = Math.max(1, Math.ceil(sourceWidth * previewScale));
    cropPreview.height = Math.max(1, Math.ceil(sourceHeight * previewScale));
    const context = cropPreview.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, cropPreview.width, cropPreview.height);
    context.drawImage(cropImage, x * cropImage.naturalWidth, y * cropImage.naturalHeight, sourceWidth, sourceHeight, 0, 0, cropPreview.width, cropPreview.height);
  };
  const paintCrop = () => {
    cropBox.hidden = !draftCrop;
    cropBox.classList.toggle("is-editing", Boolean(editingAcceptedId));
    cropAcceptedLayer.querySelectorAll("[data-accepted-crop-id]").forEach((marker) => { marker.style.visibility = marker.dataset.acceptedCropId === editingAcceptedId && draftCrop ? "hidden" : ""; });
    cropDraftReview.hidden = !cropReady || !draftCrop;
    setCropActionAvailability();
    if (!cropReady || !draftCrop) {
      if (cropPreviewFrame) cancelAnimationFrame(cropPreviewFrame);
      cropPreviewFrame = 0;
      paintCropPreview(); return;
    }
    const [x, y, width, height] = draftCrop;
    Object.assign(cropBox.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${width * 100}%`, height: `${height * 100}%` });
    if (cropGesture) {
      if (!cropPreviewFrame) cropPreviewFrame = requestAnimationFrame(paintCropPreview);
    } else {
      if (cropPreviewFrame) cancelAnimationFrame(cropPreviewFrame);
      cropPreviewFrame = 0;
      paintCropPreview();
    }
  };
  const previewCropMaterialized = (rect, source, manualResult) => {
    const [x, y, width, height] = rect;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(cropImage.naturalWidth * width));
    canvas.height = Math.max(1, Math.round(cropImage.naturalHeight * height));
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(cropImage, x * cropImage.naturalWidth, y * cropImage.naturalHeight, width * cropImage.naturalWidth, height * cropImage.naturalHeight, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/png"), previewOnly: true, source, result: manualResult };
  };
  const cropCanonicalPage = (session, result, materialized) => {
    const canonicalPage = materialized?.result ?? (["page", "crop"].includes(result.kind) ? result : null);
    if (!canonicalPage || !["page", "crop"].includes(canonicalPage.kind)
      || canonicalPage.provenance?.documentId !== session.documentId
      || canonicalPage.provenance?.pageNumber !== session.pageNumber) {
      throw new Error("선택한 PDF 쪽의 원본 응답이 일치하지 않습니다.");
    }
    if (result.kind === "pdf" && canonicalPage.kind !== "page") throw new Error("선택한 PDF 쪽의 원본 응답이 페이지가 아닙니다.");
    return canonicalPage;
  };
  // Replace regions accepted from the fast preview with exact crops once the original page is available.
  // Entries are updated in place so selections, the tray, and pending actions keep the same objects.
  const upgradePreviewCrops = async (canonicalPage) => {
    const { documentId, pageNumber } = canonicalPage.provenance;
    const entries = new Set([...acceptedCrops, ...acceptedAssets.values()].filter(({ result, materialized }) => materialized?.previewOnly
      && result.provenance?.documentId === documentId && result.provenance?.pageNumber === pageNumber));
    if (!entries.size) return;
    for (const entry of entries) {
      try {
        const activeProvider = await provider();
        const source = { documentId, pageNumber, rect: [...entry.result.provenance.rect], fullPageFallback: false };
        const materialized = await activeProvider.materialize(withManualCropVariant(canonicalPage, source), { representation: "manual" });
        if (entry.materialized?.previewOnly && resultImage(entry.result, materialized)) entry.materialized = materialized;
      } catch { /* The entry stays preview-only; final actions materialize it from the original PDF. */ }
    }
    renderAcceptedCrops();
    renderCropTray();
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
      if (cropSession.quality === "preview") {
        // The original page is still loading: accept the region from the displayed preview now and replace it later.
        cropExact = { result: resultForRepresentation(manualResult, "manual"), materialized: previewCropMaterialized(rect, source, manualResult), rectKey: rect.join(",") };
        cropPreviewExact = true;
        setCropActionAvailability();
        return;
      }
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
        pendingCropConfirmation = null;
        setStatus(`선택 미리보기 실패: ${error instanceof Error ? error.message : error}`, true);
      }
    }
  };
  const closeCrop = (restoreFocus = true) => {
    pendingCropConfirmation = null;
    const refreshSelection = cropSelectionChanged && !overlay.hidden;
    cropMagnifier.hide();
    continuousCrop.reset();
    cropPreviewEpoch += 1;
    cropReady = false;
    cropPreviewExact = false;
    cropExact = null;
    cropActionBusy = false;
    activeAcceptedCropId = null;
    editingAcceptedId = null;
    cropDialog.hidden = true;
    setCropQuality(null);
    draftCrop = null;
    cropGesture = null;
    cropSession = null;
    cropDocumentFile = null;
    cropSelectionChanged = false;
    cropPointers.clear();
    cropPinch = null;
    cropZoom = 1;
    cropBaseScale = 1;
    cropCanvas.removeAttribute("style");
    cropImage.removeAttribute("src");
    cropStage.removeAttribute("aria-busy");
    cropDialog.removeAttribute("data-pdf-page");
    cropDialog.classList.remove("is-view-only");
    cropTitle.textContent = "여러 영역 크롭";
    paintCrop();
    acceptedCrops = [];
    renderAcceptedCrops();
    if (restoreFocus && !overlay.hidden) cropReturnFocus?.focus?.({ preventScroll: true });
    cropReturnFocus = null;
    if (refreshSelection) void renderPreview();
    if (catalogUpdates.length || pendingCatalogRefresh) {
      const updates = catalogUpdates; catalogUpdates = []; pendingCatalogRefresh = false;
      void (async () => { for (const update of updates) await update(); await refreshCatalog(); })().catch(error => setStatus(`자료 갱신 실패: ${error.message}`, true));
    }
  };
  const openCropEditor = async ({ emptyDraft = false, wholePage = false, title = "여러 영역 크롭", preserveScroll = false, draftQuestion = false } = {}) => {
    // The stage was opened from the fast preview; swap in the original page without moving the view.
    const upgradeCropToOriginal = async (session, result, originalPage) => {
      const outcome = await originalPage;
      const live = () => cropSessionIsCurrent(session, selectedActiveResult()) && cropSession === session && session.quality === "preview";
      const fail = (error) => {
        if (!live()) return;
        setCropQuality("error", "고해상도 원본을 불러오지 못했습니다.");
        setStatus(`원문 페이지 실패: ${error instanceof Error ? error.message : error}`, true);
      };
      if (outcome.kind === "error") { fail(outcome.error); return; }
      let canonicalPage;
      try { canonicalPage = cropCanonicalPage(session, result, outcome.value); }
      catch (error) { fail(error); return; }
      if (!live()) { void upgradePreviewCrops(canonicalPage); return; }
      try {
        const src = resultImage(result, outcome.value);
        if (!src) throw new Error("원문 페이지를 표시할 수 없습니다.");
        const previousWidth = cropImage.naturalWidth;
        const anchor = cropCanvas.getBoundingClientRect();
        cropImage.src = src;
        await cropImage.decode();
        if (!live()) { void upgradePreviewCrops(canonicalPage); return; }
        if (previousWidth && cropImage.naturalWidth) cropBaseScale *= previousWidth / cropImage.naturalWidth;
        sizeCropCanvas();
        const moved = cropCanvas.getBoundingClientRect();
        cropStage.scrollLeft += moved.left - anchor.left;
        cropStage.scrollTop += moved.top - anchor.top;
        session.canonicalPage = canonicalPage;
        session.quality = "original";
        setCropQuality(null);
        paintCrop();
        if (draftCrop) void paintExactCropPreview();
        void upgradePreviewCrops(canonicalPage);
      } catch (error) {
        void upgradePreviewCrops(canonicalPage);
        fail(error);
      }
    };
    const result = selectedActiveResult();
    if (!result || result.provenance?.provider !== "pdf") return;
    if (cropDialog.hidden) cropReturnFocus = document.activeElement;
    cropOpenOptions = { emptyDraft, wholePage, title };
    const session = {
      resultId: result.id,
      documentId: result.provenance.documentId,
      pageNumber: result.provenance.pageNumber,
      resultIdentity: libraryResultIdentity(result),
      canonicalPage: null,
    };
    cropSession = session;
    acceptedCrops = [...acceptedAssets.values()].filter(({ result: accepted }) => accepted.provenance.documentId === session.documentId && accepted.provenance.pageNumber === session.pageNumber);
    activeAcceptedCropId = null;

    renderAcceptedCrops();
    cropDialog.classList.remove("is-view-only");
    cropTitle.textContent = title;
    cropDialog.dataset.pdfPage = String(session.pageNumber);
    cropGesture = null;
    const existingCrop = result.variants?.manual?.source?.rect || pdfUi?.cropForResult?.(result)
      || (result.kind === "crop" ? result.variants?.content?.source?.rect || result.provenance.rect : null);
    // Existing question bounds determine the view, never an unconfirmed crop.
    draftCrop = null;
    // 11-05 시안 v13: 문항 카드를 두 번 누르거나 Space로 크게 보면 그 문항 영역을 임시 영역으로 잡아 둔다(Enter·Space로 추가, 끌면 다시 고름).
    if (draftQuestion && existingCrop?.length === 4) draftCrop = [...existingCrop];
    cropPreviewExact = false;
    cropExact = null;
    cropDialog.hidden = false;
    setCropQuality(null);
    setCropLoadState("loading");
    if (continuousCrop.mounted) continuousCrop.activate(session.pageNumber, !preserveScroll);
    sizePendingCrop(targetPageGeometry(result) || { width: 3, height: 4 });
    cropStage.focus();
    try {
      const activeProvider = await provider();
      if (overlay.hidden || cropSession !== session || !cropSessionIsCurrent(session, selectedActiveResult())) return;
      const file = result.kind === "pdf" ? selectedResult() : (await activeProvider.listPdfFiles?.({ query: "", sourceIds: [...enabledSources], limit: Number.MAX_SAFE_INTEGER }))?.find((item) => item.documentId === session.documentId);
      if (cropSession !== session) return;
      cropDocumentFile = file?.kind === "pdf" ? file : null;
      void showCropTargetThumbnail(session, cropDocumentFile);
      const pageCount = Math.max(1, Number(cropDocumentFile?.pageCount) || 1);
      cropPageControls.hidden = pageCount <= 1;
      cropPageOutput.textContent = `${session.pageNumber} / ${pageCount}쪽`;
      cropPagePrev.disabled = session.pageNumber <= 1;
      cropPageNext.disabled = session.pageNumber >= pageCount;
      const pageResults = typeof activeProvider.search === "function"
        ? activeProvider.search({ query: "", kinds: ["crop"], limit: Number.MAX_SAFE_INTEGER })
        : results;
      cropFitBounds = wholePage ? [0, 0, 1, 1] : cropContentBoundsForResult(result, pageResults);
      sizePendingCrop(cropDocumentFile?.getPageGeometry?.(session.pageNumber) || targetPageGeometry(result));
      cropDialog.hidden = false;
      paintCrop();
      cropStage.focus();
      setStatus("");
      const live = () => cropSessionIsCurrent(session, selectedActiveResult()) && cropSession === session;
      // Start the original page and the fast page preview together; the stage opens on whichever arrives first.
      const preparePage = async (value, kind) => {
        cropCanonicalPage(session, result, value);
        const src = resultImage(result, value);
        if (!src) throw new Error("원문 페이지를 표시할 수 없습니다.");
        return { kind, value };
      };
      const originalPage = materializeOriginalLibraryPage(result, activeProvider)
        .then(value => preparePage(value, "original"))
        .catch(error => ({ kind: "error", error }));
      const fastPage = typeof cropDocumentFile?.loadPreview === "function"
        ? Promise.resolve().then(() => cropDocumentFile.loadPreview(session.pageNumber, { continuous: true }))
          .then(value => preparePage(value, "preview")).catch(() => null)
        : Promise.resolve(null);
      // A failed or undecodable candidate must not prevent the other candidate from opening the page.
      let first = await Promise.race([
        originalPage.then(async original => original.kind === "error" ? (await fastPage || original) : original),
        fastPage.then(preview => preview || originalPage),
      ]);
      if (!live()) return;
      if (first.kind === "error") throw first.error;
      let src = resultImage(result, first.value);
      if (!src) throw new Error("원문 페이지를 표시할 수 없습니다.");
      cropImage.src = src;
      try { await cropImage.decode(); }
      catch(error) {
        const alternate=await (first.kind==='preview'?originalPage:fastPage);
        if(!live())return;
        if(!alternate || alternate.kind==='error')throw error;
        first=alternate;src=resultImage(result,first.value);
        if(!src)throw error;
        cropImage.src=src;await cropImage.decode();
      }
      if (!live()) return;
      const quality = first.kind;
      session.canonicalPage = cropCanonicalPage(session, result, first.value);
      session.quality = quality;
      setCropLoadState("ready");
      if (quality === "preview") setCropQuality("loading");
      if (pageCount > 1 && !continuousCrop.mounted) continuousCrop.mount(pageCount, session.pageNumber, cropDocumentFile?.getPageGeometry);
      if (continuousCrop.mounted) continuousCrop.activate(session.pageNumber);
      if (!preserveScroll) fitCropContent();
      else {
        const inset = getComputedStyle(cropStage);
        cropBaseScale = Math.max(1, cropStage.clientWidth - parseFloat(inset.paddingLeft) - parseFloat(inset.paddingRight)) / cropImage.naturalWidth;
        sizeCropCanvas();
      }
      paintCrop();
      void paintExactCropPreview();
      if (quality === "preview") void upgradeCropToOriginal(session, result, originalPage);
      return true;
    } catch (error) {
      if (cropSession === session) {
        setCropLoadState("error", "PDF 페이지를 불러오지 못했습니다.");
        setStatus(`원문 페이지 실패: ${error instanceof Error ? error.message : error}`, true);
      }
      return false;
    }
  };
  overlay.querySelector("[data-unilib-adjust]").addEventListener("click", () => void openCropEditor());
  const openExpandedPreview = async (expectedIdentity = null) => {
    const result = selectedActiveResult();
    const identity = libraryResultIdentity(result);
    if (!result || (expectedIdentity && identity !== expectedIdentity)) return false;
    if (result.provenance?.provider === "pdf") {
      return openCropEditor({ emptyDraft: true, wholePage: result.kind !== "crop", draftQuestion: result.kind === "crop" && result.cropType === "question", title: `${result.title || "PDF"} · ${result.provenance.pageNumber}쪽` });
    }
    if (!currentMaterialized || currentMaterializedIdentity !== identity) return false;
    const src = resultImage(result, currentMaterialized);
    if (!src) return false;
    if (cropDialog.hidden) cropReturnFocus = document.activeElement;
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
    setCropLoadState("loading", "이미지를 불러오는 중입니다…");
    cropFitBounds = [0, 0, 1, 1];
    const displayed = stage.querySelector(".unilib-preview-image img");
    if (displayed?.naturalWidth) {
      sizePendingCrop({ width: displayed.naturalWidth, height: displayed.naturalHeight });
      cropLoadPreview.src = src;
      cropLoadPreview.hidden = false;
      cropLoadPaper.hidden = true;
    }
    cropImage.src = src;
    try {
      await cropImage.decode();
      if (cropSession !== session || !cropSessionIsCurrent(session, selectedActiveResult())) return false;
      cropFitBounds = [0, 0, 1, 1];
      setCropLoadState("ready");
      fitCropContent();
      cropStage.focus();
      return true;
    } catch {
      if (cropSession === session && cropSessionIsCurrent(session, selectedActiveResult())) {
        setCropLoadState("error", "이미지를 불러오지 못했습니다.");
        setStatus("확대 미리보기 이미지를 읽지 못했습니다.", true);
      }
      return false;
    }
  };
  cropRetry.addEventListener("click", () => {
    if (cropSession?.viewOnly) void openExpandedPreview();
    else void openCropEditor(cropOpenOptions);
  });
  cropQuality.querySelector("[data-unilib-crop-quality-retry]").addEventListener("click", () => {
    if (!cropSession || cropSession.viewOnly) return;
    commitAcceptedCropSession({ acceptedAssets, acceptedCrops, documentId: cropSession.documentId, pageNumber: cropSession.pageNumber });
    void openCropEditor({ ...cropOpenOptions, preserveScroll: true });
  });
  overlay.querySelector("[data-unilib-crop-fit]").addEventListener("click", fitCropContent);
  overlay.querySelector("[data-unilib-crop-zoom-out]").addEventListener("click", () => setCropZoom(cropZoom / 1.2));
  overlay.querySelector("[data-unilib-crop-zoom-in]").addEventListener("click", () => setCropZoom(cropZoom * 1.2));
  const changeCropPage = async (page, preserveScroll = false) => {
    const file = cropDocumentFile;
    if (file?.kind !== "pdf" || !cropSession) return;
    commitAcceptedCropSession({ acceptedAssets, acceptedCrops, documentId: cropSession?.documentId, pageNumber: cropSession?.pageNumber });
    const targetPage = Math.max(1, Math.min(Math.max(1, Number(file.pageCount) || 1), page));
    const selected = selectedResult();
    if (continuousView?.resultId === selected?.id) {
      continuousView.visiblePage = targetPage;
      stage.scrollTop = (targetPage - 1) * continuousView.pageExtent;
      stage.dispatchEvent(new Event("scroll"));
    }
    if (!continuousView || selectedResult()?.provenance?.pageNumber !== targetPage) {
      if (selected?.kind === "pdf" && pdfDisplayMode === "file" && activeTypes.length === 1 && activeTypes[0] === "pdf") {
        cropSession = { ...cropSession, pageNumber: targetPage, resultIdentity: libraryResultIdentity(pdfFilePageResult(selected, targetPage)) };
      } else {
        let next = results.find((item) => item.provenance?.documentId === file.documentId && item.provenance?.pageNumber === targetPage && item.kind === "pdf");
        if (!next) {
          next = { ...pdfFilePageResult(file, targetPage), id: `${file.id.replace(/:page:\d+$/, "")}:page:${targetPage}`, matches: [] };
          results.push(next);
          renderResults();
        }
        selectedId = next.id;
        updateResultSelection();
        list.querySelector(`[data-result-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
        cropSelectionChanged = true;
      }
    }
    await openCropEditor({ ...cropOpenOptions, wholePage: true, title: `${file.title} · ${targetPage}쪽`, preserveScroll });
  };
  const continuousCrop = createContinuousCropPages({
    stage: cropStage, canvas: cropCanvas,
    loadPage: async (page) => {
      const file = cropDocumentFile;
      if (!file) throw new Error("PDF 문서를 찾을 수 없습니다.");
      const asset = await file.loadPreview(page, { continuous: true });
      const receivedPage = asset?.provenance?.pageNumber ?? asset?.source?.pageNumber;
      if (receivedPage != null && Number(receivedPage) !== page) throw new Error("PDF 미리보기 쪽이 일치하지 않습니다.");
      return resultImage(file, asset);
    },
    onPage: (page) => changeCropPage(page, true),
  });
  // 빨리 연달아 누르면 앞 쪽을 그리는 동안 쪽 번호가 아직 그대로라 넘김이 빠졌다(10-28) — 가려는 쪽을 따로 기억해 그 쪽에서 센다.
  let cropPageTarget = null;
  const stepCropPage = (delta) => {
    const pageCount = Math.max(1, Number(cropDocumentFile?.pageCount) || 1);
    const target = Math.max(1, Math.min(pageCount, (cropPageTarget ?? cropSession?.pageNumber ?? 1) + delta));
    cropPageTarget = target;
    cropPageOutput.textContent = `${target} / ${pageCount}쪽`;
    void changeCropPage(target).finally(() => { if (cropPageTarget === target) cropPageTarget = null; });
  };
  cropPagePrev.addEventListener("click", () => stepCropPage(-1));
  cropPageNext.addEventListener("click", () => stepCropPage(1));
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
    if (!draftCrop) return;
    if (!cropExact || !cropPreviewExact || cropExact.rectKey !== cropRectKey()) return;
    const savedRect = clampRect(draftCrop);
    const editIndex = acceptedCrops.findIndex(({ result }) => result.id === editingAcceptedId);
    if (editIndex < 0) cropSequence += 1;
    const fresh = acceptedCropResult(cropSession.canonicalPage || result, savedRect, cropSequence);
    const accepted = editIndex < 0 ? fresh : { ...fresh, id: acceptedCrops[editIndex].result.id, title: acceptedCrops[editIndex].result.title };
    const entry = { result: accepted, materialized: cropExact.materialized };
    if (editIndex < 0) acceptedCrops.push(entry);
    else acceptedCrops[editIndex] = entry;
    activeAcceptedCropId = editIndex < 0 ? null : accepted.id;
    editingAcceptedId = null;
    invalidateAction();
    draftCrop = null;
    cropPreviewEpoch += 1;
    cropPreviewExact = false;
    cropExact = null;
    paintCrop();
    renderAcceptedCrops();
    updateResultSelection();
    setStatus(`${acceptedCrops.length}개 영역을 추가했습니다. 계속 드래그하거나 Enter 또는 Space로 끝내세요.`);
  });
  cropCollection.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-unilib-crop-remove]");
    if (!remove) return;
    acceptedCrops = acceptedCrops.filter(({ result }) => result.id !== remove.dataset.unilibCropRemove);
    acceptedAssets.delete(remove.dataset.unilibCropRemove);
    if (activeAcceptedCropId === remove.dataset.unilibCropRemove) activeAcceptedCropId = null;
    invalidateAction();
    renderAcceptedCrops();
    updateResultSelection();
    setCropActionAvailability();
  });
  const selectGraphCrop = event => {
    if(event.target.closest('[data-unilib-crop-remove]'))return;
    if(event.type==='keydown' && !['Enter',' '].includes(event.key))return;
    const item=event.target.closest('[data-unilib-graph-crop]');if(!item)return;
    if(event.type==='keydown')event.preventDefault();
    activeAcceptedCropId=item.dataset.unilibGraphCrop;
    renderAcceptedCrops();setCropActionAvailability();
    if(event.type==='keydown')cropCollection.querySelector(`[data-unilib-graph-crop="${CSS.escape(activeAcceptedCropId)}"]`)?.focus({preventScroll:true});
  };
  cropCollection.addEventListener('click',selectGraphCrop);
  cropCollection.addEventListener('keydown',selectGraphCrop);
  overlay.querySelector('[data-unilib-crop-graph]').addEventListener('click', async () => {
    if(cropActionBusy || !cropReady || !cropSession)return;
    const entries=cropDocumentEntries();
    const entry=entries.find(({result})=>result.id===activeAcceptedCropId) || (entries.length===1 ? entries[0] : null);
    if(!entry){overlay.querySelector('[data-unilib-crop-selection]').textContent='비교할 크롭 이미지 하나를 선택하세요.';return;}
    const session=cropSession,revision=actionRevision;
    const isCurrent=()=>!overlay.hidden&&!cropDialog.hidden&&cropSession===session&&actionRevision===revision;
    cropActionBusy=true;setCropActionAvailability();
    // 크롭 미리보기(빠른 쪽 그림)를 그대로 보내지 않는다 — 원본 PDF 고해상도로 다시 뜬 뒤 보낸다(코드 점검 10-21 하: 저해상도가 그래프 복원으로 갔음).
    try{let materialized=entry.materialized;
      if(materialized?.previewOnly){const activeProvider=await provider();if(!isCurrent())return;materialized=await materializeLibraryAction(entry.result,activeProvider,{acceptedAssets});if(!isCurrent())return;}
      await deliverGraphReference(entry.result,materialized,isCurrent);}
    catch(error){if(isCurrent())overlay.querySelector('[data-unilib-crop-selection]').textContent=`원본 연결 실패: ${error.message}`;}
    finally{cropActionBusy=false;if(!cropDialog.hidden)setCropActionAvailability();}
  });
  overlay.querySelector('[data-unilib-crop-insert]').addEventListener('click', async () => {
    if (cropActionBusy || !cropReady || !cropSession || typeof insertMaterialized !== 'function') return;
    const entries = cropDocumentEntries();
    const entry = entries.find(({result}) => result.id === activeAcceptedCropId) || (entries.length === 1 ? entries[0] : null);
    if (!entry) return;
    const session = cropSession, revision = actionRevision, selectedCrop = activeAcceptedCropId;
    const rectKey = entry.result.provenance.rect.join(',');
    const isCurrent = () => !overlay.hidden && !cropDialog.hidden && cropSession === session
      && actionRevision === revision && activeAcceptedCropId === selectedCrop
      && cropSessionIsCurrent(session, selectedActiveResult())
      && cropDocumentEntries().some(value => value === entry && value.result.provenance.rect.join(',') === rectKey);
    cropActionBusy = true; setCropActionAvailability();
    // Keep the selected crop if decoding or insertion fails, and rematerialize
    // preview-only crops through the same exact-source path as AI handoff.
    commitAcceptedCropSession({acceptedAssets, acceptedCrops, documentId:session.documentId, pageNumber:session.pageNumber});
    try {
      const activeProvider = await provider(); if (!isCurrent()) return;
      const materialized = await materializeLibraryAction(entry.result, activeProvider, {...getPartOptions(), acceptedAssets, representation:'manual'});
      if (!isCurrent()) return;
      await insertMaterialized(entry.result, materialized, getPartOptions(), {isCurrent});
      if (isCurrent()) close({restoreFocus:false});
    } catch (error) {
      if (isCurrent()) overlay.querySelector('[data-unilib-crop-selection]').textContent = `캔버스 삽입 실패: ${error.message}`;
    } finally {
      cropActionBusy = false;
      if (!cropDialog.hidden) setCropActionAvailability();
    }
  });
  overlay.querySelector("[data-unilib-crop-workbench]").addEventListener("click", () => {
    if (!cropDocumentEntries().length || !cropSession) return;
    const count = cropDocumentEntries().length;
    commitAcceptedCropSession({
      acceptedAssets, acceptedCrops,
      documentId: cropSession.documentId, pageNumber: cropSession.pageNumber,
    });
    invalidateAction();
    updateResultSelection();
    renderCropTray();
    closeCrop(false);
    spaceAssignmentIdentity = libraryResultIdentity(selectedActiveResult());
    syncSpaceAction();
    setStatus(`${count}개 이미지를 작업대에 넣었습니다.`);
  });
  cropConfirm.querySelector("[data-unilib-crop-draft-cancel]").addEventListener("click", () => {
    cropPreviewEpoch += 1;
    cropPreviewExact = false;
    cropExact = null;
    draftCrop = null;
    editingAcceptedId = null;
    paintCrop();
    cropStage.focus();
  });
  const finishCropSelection = () => {
    if (!acceptedCrops.length) return;
    const button = overlay.querySelector("[data-unilib-crop-workbench]");
    if (!button.disabled) button.click();
  };
  const cropPoint = (event) => {
    return normalizedCropPoint(event, cropCanvas.getBoundingClientRect());
  };
  cropStage.addEventListener("pointerdown", (event) => {
    if (!cropReady || cropSession?.viewOnly || !cropCanvas.contains(event.target)) return;
    if (!cropSessionIsCurrent(cropSession, selectedActiveResult())) return;
    if (event.target.closest("button")) return;
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
    const marker = event.target.closest("[data-accepted-crop-id]");
    const handle = event.target.closest("[data-crop-handle]")?.dataset.cropHandle || "";
    if (marker) {
      const entry = acceptedCrops.find(({ result }) => result.id === marker.dataset.acceptedCropId);
      editingAcceptedId = entry.result.id;
      activeAcceptedCropId = entry.result.id;
      draftCrop = [...entry.result.provenance.rect];
    } else if (!event.target.closest("[data-unilib-crop-box]")) editingAcceptedId = null;
    const inside = marker || event.target.closest("[data-unilib-crop-box]");
    cropGesture = { pointerId: event.pointerId, start: cropPoint(event), previous: draftCrop, mode: inside ? (handle ? "resize" : "move") : "draw", handle, drawing: false };
    paintCrop();
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
    }
    draftCrop = cropRectFromGesture(cropGesture.previous, cropGesture.start, cropPoint(event), cropGesture.mode, cropGesture.handle);
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
      if (editingAcceptedId) { draftCrop = null; editingAcceptedId = null; renderAcceptedCrops(); paintCrop(); }
      return;
    }
    draftCrop = cropRectFromGesture(cropGesture.previous, cropGesture.start, cropPoint(event), cropGesture.mode, cropGesture.handle);
    cropGesture = null;
    paintCrop();
    if (!draftCrop) setStatus("자를 영역은 너비와 높이가 있어야 합니다.", true);
    else void paintExactCropPreview().then(() => { if (editingAcceptedId && cropPreviewExact) cropSave.click(); });
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
  const startsKeyboardCrop = (event) => event.key === "Enter" && !draftCrop && (event.shiftKey || !acceptedCrops.length);
  cropStage.addEventListener("keydown", (event) => {
    if (!cropReady || cropSession?.viewOnly || event.target.closest("button, input, textarea")) return;
    if (startsKeyboardCrop(event)) {
      event.preventDefault();
      event.stopPropagation();
      const pageBounds = cropCanvas.getBoundingClientRect();
      const viewport = cropStage.getBoundingClientRect();
      const left = Math.max(pageBounds.left, viewport.left);
      const top = Math.max(pageBounds.top, viewport.top);
      const width = Math.max(0, Math.min(pageBounds.right, viewport.right) - left) / pageBounds.width;
      const height = Math.max(0, Math.min(pageBounds.bottom, viewport.bottom) - top) / pageBounds.height;
      if (!width || !height) return;
      draftCrop = clampRect([(left - pageBounds.left) / pageBounds.width + width / 4,
        (top - pageBounds.top) / pageBounds.height + height / 4, width / 2, height / 2]);
      editingAcceptedId = null;
      overlay.querySelector("[data-unilib-crop-selection]").textContent = "자를 영역을 만들었습니다. 화살표로 이동하고 Shift와 화살표로 크기를 조절하세요.";
    } else {
      if (!draftCrop || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      draftCrop = cropRectFromKeyboard(draftCrop, event.key, event.shiftKey);
      overlay.querySelector("[data-unilib-crop-selection]").textContent = `선택 영역: 가로 ${Math.round(draftCrop[2] * 100)}%, 세로 ${Math.round(draftCrop[3] * 100)}%, 왼쪽 ${Math.round(draftCrop[0] * 100)}%, 위 ${Math.round(draftCrop[1] * 100)}%`;
    }
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
      if (!localInstall.hidden) closeLocalInstall();
      else if (!driveSettings.hidden) closeDriveSettings();
      else if (root.classList.contains("is-reader-expanded")) closeExpandedReader();
      else if (cancelPlacementChoice) cancelPlacementChoice();
      else if (!cropDialog.hidden) closeCrop();
      else if (cropTrayExpanded) collapseCropTray();
      else if (hasOpenDrawer()) closeDrawers();
      else close({ keyboard: true });
      return;
    }
    if (cancelPlacementChoice) return;
    if (!cropDialog.hidden) {
      if (startsKeyboardCrop(event) && cropStage.contains(event.target)) return;
      if (["Enter", " "].includes(event.key) && !editableTarget(event.target) && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.repeat) return;
        if (draftCrop) {
          // Preserve this confirmation while its exact preview is pending;
          // session/epoch/rectangle checks discard it after edits or dismissal.
          pendingCropConfirmation = { session: cropSession, epoch: cropPreviewEpoch, rectKey: cropRectKey(), editingId: editingAcceptedId };
          if (cropSave.disabled) setStatus("선택 영역을 준비한 뒤 추가합니다.");
          setCropActionAvailability();
        }
        else finishCropSelection();
      }
      return;
    }
    // Prepared workbench images take Space straight to the same AI assignment
    // route as the button. Text fields and nested readers keep their own keys.
    if (event.key === " " && spaceAssignmentIdentity === libraryResultIdentity(selectedActiveResult()) && acceptedAssets.size
      && (shouldHandleLibrarySpace(event) || event.target?.matches?.('[data-unilib-crop-workbench],[data-unilib-ai]'))
      && localInstall.hidden && driveSettings.hidden && !root.classList.contains("is-reader-expanded")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat || actionBusy) return;
      cancelSpacePress();
      suppressSpaceKeyup = true;
      const aiButton = overlay.querySelector("[data-unilib-ai]");
      if (!aiButton.disabled) aiButton.click();
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
      const press = { id, identity, opened: false, released: false, waitTimer: null };
      spacePress = press;
      void continueSpacePreview(press);
    }
  }, true);
  document.addEventListener("focusin", (event) => {
    if (spacePress && !event.target?.closest?.(`[data-result-id="${CSS.escape(spacePress.id)}"]`)) cancelSpacePress();
  }, true);
  document.addEventListener("keyup", (event) => {
    if (![" ", "Enter"].includes(event.key)) return;
    if (!spacePress) {
      if (suppressSpaceKeyup) event.preventDefault();
      suppressSpaceKeyup = false;
      return;
    }
    event.preventDefault();
    const press = spacePress;
    press.released = true;
    if (press.opened) cancelSpacePress();
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
    if (cropTrayExpanded) collapseCropTray();
    else if (hasOpenDrawer()) closeDrawers();
    else close({ keyboard: true });
  };
  registerEscapeLayer(overlay.querySelector("[data-unilib-crop-tray]"), collapseCropTray);
  registerEscapeLayer(overlay, closeLibraryLayer);
  registerEscapeLayer(root, closeLibraryLayer);
  registerEscapeLayer(driveSettings, closeDriveSettings);
  registerEscapeLayer(localInstall, closeLocalInstall);
  registerEscapeLayer(cropDialog, () => { lastInteractionWasKeyboard = true; cancelSpacePress(); closeCrop(); });
  return Object.freeze({
    setProvidedStatus(message, error = false) { setProvidedStatus(message, error); },
    setProvidedRetry(callback) {
      providedRetry = typeof callback === "function" ? callback : null;
      const host = overlay.querySelector("[data-unilib-provided-status]");
      if (host.classList.contains("is-error")) host.querySelector("[data-unilib-provided-retry]").hidden = !providedRetry;
    },
    setSearchReadiness(value) {
      searchReadiness = ["loading", "error", "ready"].includes(value) ? value : "ready";
      overlay.dataset.searchReadiness = searchReadiness;
      if (!overlay.hidden && searchReadiness !== "ready") setStatus(readinessMessage(), searchReadiness === "error");
      if (searchReadiness === "ready" || searchReadiness === "error") void refreshCatalog();
    },
    applyCatalogUpdate(callback) {
      if (!cropDialog.hidden) return new Promise((resolve, reject) => catalogUpdates.push(() => Promise.resolve().then(callback).then(resolve, reject)));
      return Promise.resolve().then(callback);
    },
    open, close, refresh: refreshCatalog, element: overlay,
    async beginReferenceSelection(consumer, trigger) {
      referenceConsumer = consumer;
      root.classList.add("consumer-mode");
      updateAiActionAvailability();
      await open(trigger);
      updateAiActionAvailability();
      setStatus("자료를 열고 필요한 영역을 크롭한 뒤 작업대에 넣어 주세요.");
    },
  });
}

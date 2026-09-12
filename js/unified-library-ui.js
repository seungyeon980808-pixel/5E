import { importRejectionMessage, partitionLibraryImports, safeExternalSourceUrl } from "./library-import-policy.js";

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
  const count = Number(node?.count);
  return Number.isFinite(count) ? count : 0;
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
  const firstFigure = variants.figures?.[0];
  if (firstFigure) options.push({ id: "image", sourceId: firstFigure.id || null, label: "이미지", source: firstFigure.source });
  return options;
}

export function highlightTextParts(text, query) {
  const terms = String(query ?? "").normalize("NFKC").trim().split(/\s+/u).filter(Boolean)
    .sort((left, right) => right.length - left.length);
  if (!terms.length) return [{ text: String(text ?? ""), match: false }];
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  const matcher = new RegExp(`(${escaped.join("|")})`, "giu");
  return String(text ?? "").split(matcher).filter(Boolean).map((part) => ({ text: part, match: terms.some((term) => part.localeCompare(term, undefined, { sensitivity: "accent" }) === 0) }));
}

export function canInsertLibraryResult(result, representation) {
  if (!result) return false;
  if (result.kind !== "crop" || result.cropType !== "question") return true;
  return (representation === "image" || String(representation).startsWith("figure:")) && Boolean(result.variants?.figures?.[Number(String(representation).slice(7)) || 0]);
}

export function libraryActionSnapshotIsCurrent(snapshot, state) {
  return snapshot?.selectedId === state?.selectedId
    && snapshot?.representation === state?.representation
    && (snapshot?.selectedIdsKey ?? "") === (state?.selectedIdsKey ?? "")
    && snapshot?.open === true && state?.open === true;
}

function materializationRepresentation(result, representation) {
  if (result?.kind === "crop" && representation === "image") return "figure:0";
  return representation;
}

export function resultForRepresentation(result, representationId) {
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

export function cropRectFromGesture(initial, start, current, mode = "draw", handle = "") {
  const [sx, sy] = start;
  const [cx, cy] = current;
  if (mode === "draw") return clampRect([Math.min(sx, cx), Math.min(sy, cy), Math.abs(cx - sx), Math.abs(cy - sy)]);
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

export function reconcileUnifiedSelection(selectedId, results) {
  if (results.some((result) => result.id === selectedId)) return selectedId;
  return results[0]?.id ?? null;
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
  for (const source of sources) {
    if (!["group", "category", "folder"].includes(source.kind) && !known.has(source.id) && !excludedGroups.has(source.parentId)) enabled.add(source.id);
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

function materializedReference(result, materialized) {
  const data = resultImage(result, materialized);
  return {
    dataUrl: data,
    src: data,
    name: result.title,
    sourceKind: "unified-library",
    source: publicProvenance(result.provenance),
  };
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

function publicProvenance(source = {}) {
  return Object.fromEntries([
    "provider", "documentId", "pageNumber", "rect", "fullPageFallback", "locator",
    "displayName", "sha256", "sourceKind", "itemId", "fileName", "sourceUrl", "license",
  ].filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
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
          <div class="unilib-result-scroll"><div class="unilib-summary"><span><strong data-unilib-count>0개</strong> 결과</span><span>↑↓ 선택 · Space 크게 보기</span></div><ul class="unilib-result-list" data-unilib-results role="listbox"></ul></div>
        </section>
        <aside class="unilib-pane unilib-preview" data-unilib-preview aria-label="선택 자료 미리보기">
          <div class="unilib-pane-head"><div><h3 data-unilib-preview-title>미리보기</h3><p data-unilib-preview-kind>자료를 선택하세요</p><span class="unilib-example-note" data-unilib-preview-example hidden>목업 · 예시 자료</span></div><button type="button" class="unilib-icon-button" data-unilib-preview-close aria-label="미리보기 닫기">${ICONS.close}</button></div>
          <div class="unilib-preview-scroll"><div class="unilib-representations" data-unilib-representations hidden role="group" aria-label="문항 표시 범위"></div><div class="unilib-stage" data-unilib-stage><span>검색 결과를 선택하세요.</span></div><div class="unilib-match-context" data-unilib-match-context hidden></div><div class="unilib-part-options" data-unilib-part-options hidden></div></div>
          <div class="unilib-preview-foot"><div class="unilib-source">${ICONS.file}<div><strong data-unilib-source-name>—</strong><span data-unilib-source-meta>—</span></div><div class="unilib-source-actions"><button type="button" data-unilib-source-open>원문 페이지</button><button type="button" data-unilib-adjust hidden>범위 조정</button></div></div><div class="unilib-actions"><button type="button" class="unilib-primary" data-unilib-insert disabled>캔버스에 삽입</button><button type="button" class="unilib-button" data-unilib-objectify disabled>이미지 객체화</button><button type="button" class="unilib-button" data-unilib-ai disabled>AI 이미지로 보내기</button></div></div>
        </aside>
        <button class="unilib-scrim" data-unilib-scrim type="button" aria-label="열린 패널 닫기"></button>
      </div>
      <div class="unilib-dialog-backdrop" data-unilib-folder-dialog hidden><section class="unilib-dialog" role="dialog" aria-modal="true" aria-labelledby="unilib-folder-title"><header><h3 id="unilib-folder-title">라이브러리 폴더 관리</h3><button type="button" class="unilib-icon-button" data-unilib-folder-dialog-close aria-label="폴더 관리 닫기">${ICONS.close}</button></header><div data-unilib-folder-manager></div><details class="unilib-pdf-details"><summary>PDF · 자료팩 고급 관리</summary><div data-unilib-pdf-details></div></details></section></div>
      <div class="unilib-lightbox" data-unilib-lightbox hidden role="dialog" aria-modal="true" aria-label="자료 크게 보기"><button type="button" class="unilib-icon-button" data-unilib-lightbox-close aria-label="큰 보기 닫기">${ICONS.close}</button><div data-unilib-lightbox-stage></div></div>
      <div class="unilib-crop" data-unilib-crop hidden role="dialog" aria-modal="true" aria-labelledby="unilib-crop-title"><header><strong id="unilib-crop-title">PDF 범위 조정</strong><div class="unilib-crop-presets"><button type="button" class="unilib-button" data-unilib-crop-reset>문항 영역으로 되돌리기</button><button type="button" class="unilib-button" data-unilib-crop-full>페이지 전체</button></div><button type="button" class="unilib-button" data-unilib-crop-cancel>취소</button><button type="button" class="unilib-primary" data-unilib-crop-save>적용</button></header><div class="unilib-crop-workspace"><div class="unilib-crop-stage" data-unilib-crop-stage><div class="unilib-crop-canvas" data-unilib-crop-canvas><img data-unilib-crop-image alt="원문 PDF 페이지"><div data-unilib-crop-box tabindex="0" role="group" aria-label="선택한 크롭 영역"><button type="button" data-crop-handle="nw" aria-label="왼쪽 위 크기 조절"></button><button type="button" data-crop-handle="n" aria-label="위쪽 크기 조절"></button><button type="button" data-crop-handle="ne" aria-label="오른쪽 위 크기 조절"></button><button type="button" data-crop-handle="e" aria-label="오른쪽 크기 조절"></button><button type="button" data-crop-handle="se" aria-label="오른쪽 아래 크기 조절"></button><button type="button" data-crop-handle="s" aria-label="아래쪽 크기 조절"></button><button type="button" data-crop-handle="sw" aria-label="왼쪽 아래 크기 조절"></button><button type="button" data-crop-handle="w" aria-label="왼쪽 크기 조절"></button></div></div></div><aside class="unilib-crop-preview"><strong>잘린 결과</strong><canvas data-unilib-crop-preview aria-label="현재 선택 영역 미리보기"></canvas><p>빈 곳을 드래그해 새 영역을 그리고, 테두리와 모서리로 크기를 조절하세요.</p></aside></div><div class="unilib-crop-fields"><label>왼쪽 %<input type="number" min="0" max="99" step="0.1" data-unilib-crop-value="0"></label><label>위 %<input type="number" min="0" max="99" step="0.1" data-unilib-crop-value="1"></label><label>너비 %<input type="number" min="1" max="100" step="0.1" data-unilib-crop-value="2"></label><label>높이 %<input type="number" min="1" max="100" step="0.1" data-unilib-crop-value="3"></label></div></div>
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
  let sourcesInitialized = false;
  const knownSourceIds = new Set();
  let searchEpoch = 0;
  let previewEpoch = 0;
  let thumbnailEpoch = 0;
  let thumbnailQueue = Promise.resolve();
  let currentMaterialized = null;
  let returnFocus = null;
  let desktopConnections = [];
  let desktopWarnings = [];
  let importedImageBytes = 0;
  let importedImageCount = 0;
  let actionBusy = false;

  const selectedResult = () => results.find((result) => result.id === selectedId) || null;
  const selectedVariantResult = () => resultForRepresentation(selectedResult(), activeRepresentation);
  const actionButtons = () => [...overlay.querySelectorAll("[data-unilib-insert],[data-unilib-objectify],[data-unilib-ai]")];
  const selectionKey = () => [...selectedIds].sort().join("\u0000");
  const snapshotAction = () => Object.freeze({ selectedId, selectedIdsKey: selectionKey(), representation: activeRepresentation, options: Object.freeze(getPartOptions()), open: !overlay.hidden });
  const actionIsCurrent = (snapshot) => libraryActionSnapshotIsCurrent(snapshot, { selectedId, selectedIdsKey: selectionKey(), representation: activeRepresentation, open: !overlay.hidden });
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
    const years = [...new Set((activeProvider.search({ query: "", kinds: ["crop"], limit: 500 }) ?? []).map((result) => result.metadata?.academicYear).filter(Number.isInteger))].sort((a, b) => b - a);
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
    const appendTreeNode = ({ id, name, count = "", checked, indeterminate, children = [], depth = 0, desktop = null }, parent) => {
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
      amount.textContent = count === "" ? "" : String(count);
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
          count: (node.documentCount || 0) + (node.imageCount || 0),
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
        count: displayedSourceCount(node),
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
    const ownEpoch = ++searchEpoch;
    const activeProvider = await provider();
    if (!enabledSources) await renderSources();
    const options = { query: query.value.trim(), sourceIds: [...enabledSources], kinds: kindsForResultTab(activeTab), filters: activeTab === "question" ? { ...examFilters } : {}, limit: activeTab === "pdf" ? 500 : 60 };
    setStatus("라이브러리를 검색하는 중…");
    try {
      const found = typeof activeProvider.searchAsync === "function" ? await activeProvider.searchAsync(options) : activeProvider.search(options);
      if (ownEpoch !== searchEpoch || overlay.hidden) return;
      results = Array.isArray(found) ? found : [];
      const visibleIds = new Set(results.map((result) => result.id));
      for (const id of selectedIds) if (!visibleIds.has(id)) selectedIds.delete(id);
      selectedId = reconcileUnifiedSelection(selectedId, results);
      renderResults();
      await renderPreview();
      setStatus(results.length ? `${results.length}개 결과` : "검색 결과가 없습니다.");
    } catch (error) {
      if (ownEpoch === searchEpoch) setStatus(`검색 실패: ${error instanceof Error ? error.message : error}`, true);
    }
  }

  function renderResults() {
    const ownThumbnailEpoch = ++thumbnailEpoch;
    const visibleResults = activeTab === "pdf" && !pdfBrowseSource
      ? [...new Map(results.map((result) => [result.sourceId, { ...result, id: `pdf-file:${result.sourceId}`, title: result.sourceLabel, subtitle: `${results.filter((page) => page.sourceId === result.sourceId).length}쪽`, fileSourceId: result.sourceId }])).values()]
      : activeTab === "pdf" ? results.filter((result) => result.sourceId === pdfBrowseSource) : results;
    overlay.querySelector("[data-unilib-count]").textContent = `${visibleResults.length}개`;
    list.replaceChildren(...visibleResults.map((result, index) => {
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
      } else {
        media.textContent = result.kind === "page" ? "PDF" : "5E";
        if (result.provenance?.provider === "pdf" && index < 12) {
          thumbnailQueue = thumbnailQueue.then(async () => {
            if (ownThumbnailEpoch !== thumbnailEpoch || !media.isConnected) return;
            const materialized = await (await provider()).materialize(result, { thumbnail: true });
            if (ownThumbnailEpoch !== thumbnailEpoch || !media.isConnected) return;
            const src = resultImage(result, materialized);
            if (!src) return;
            const image = new Image();
            image.alt = "";
            image.src = src;
            media.replaceChildren(image);
          }).catch(() => {});
        }
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
      copy.append(badge, disclosure, title, meta, snippet);
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
  }

  async function renderPreview() {
    const ownEpoch = ++previewEpoch;
    const result = selectedResult();
    const representations = representationsForResult(result);
    if (representations.length && !representations.some((option) => option.id === activeRepresentation)) activeRepresentation = representations[0].id;
    if (!representations.length) activeRepresentation = "full";
    const materializeResult = resultForRepresentation(result, activeRepresentation);
    const representationHost = overlay.querySelector("[data-unilib-representations]");
    representationHost.hidden = representations.length === 0;
    representationHost.replaceChildren(...representations.map((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.representation = option.id;
      button.textContent = option.label;
      button.setAttribute("aria-pressed", String(option.id === activeRepresentation));
      return button;
    }));
    if (result?.variants?.figures?.length > 1 && activeRepresentation !== "full") {
      const picker = document.createElement("select");
      picker.dataset.figurePicker = "";
      picker.setAttribute("aria-label", "문항 이미지 선택");
      picker.replaceChildren(...result.variants.figures.map((figure, index) => new Option(figure.label || `이미지 ${index + 1}`, String(index))));
      const activeIndex = Number(String(activeRepresentation).replace("figure:", ""));
      picker.value = String(Number.isInteger(activeIndex) ? activeIndex : 0);
      representationHost.append(picker);
    }
    const matchContext = overlay.querySelector("[data-unilib-match-context]");
    matchContext.hidden = !result?.matchContext?.snippet;
    matchContext.replaceChildren(...highlightTextParts(result?.matchContext?.snippet || "", query.value).map((part) => {
      const node = document.createElement(part.match ? "mark" : "span");
      node.textContent = part.text;
      return node;
    }));
    currentMaterialized = null;
    partOptionsHost.hidden = result?.provenance?.provider !== "parts";
    overlay.querySelector("[data-unilib-preview-title]").textContent = result?.title || "미리보기";
    overlay.querySelector("[data-unilib-preview-kind]").textContent = result ? labelForKind(result.kind) : "자료를 선택하세요";
    overlay.querySelector("[data-unilib-preview-example]").hidden = !isExampleLibraryResult(result);
    overlay.querySelector("[data-unilib-source-name]").textContent = result?.sourceLabel || "—";
    overlay.querySelector("[data-unilib-source-meta]").textContent = result ? resultSourceText(result) : "—";
    const insert = overlay.querySelector("[data-unilib-insert]");
    const actionAllowed = canInsertLibraryResult(result, activeRepresentation);
    insert.disabled = actionBusy || !actionAllowed;
    insert.title = result?.kind === "crop" && !insert.disabled ? "선택한 이미지만 캔버스에 삽입" : result?.kind === "crop" ? "이미지를 선택해야 삽입할 수 있습니다" : "";
    overlay.querySelector("[data-unilib-objectify]").disabled = actionBusy || !actionAllowed || typeof openObjectify !== "function";
    overlay.querySelector("[data-unilib-ai]").disabled = actionBusy || !actionAllowed || (typeof openAi !== "function" && typeof openIndependentReferences !== "function");
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
      const materialized = await activeProvider.materialize(materializeResult, { ...getPartOptions(), representation: materializationRepresentation(result, activeRepresentation) });
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
        for (const rect of activeRepresentation === "full" ? (result.matchContext?.matchRects ?? []) : []) {
          const highlight = document.createElement("span");
          highlight.className = "unilib-match-rect";
          Object.assign(highlight.style, { left: `${rect[0] * 100}%`, top: `${rect[1] * 100}%`, width: `${rect[2] * 100}%`, height: `${rect[3] * 100}%` });
          frame.append(highlight);
        }
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
    host.append(actions);
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
    searchEpoch += 1;
    previewEpoch += 1;
    pdfUi?.deactivate?.();
    overlay.hidden = true;
    closeDrawers();
    returnFocus?.focus?.();
    window.dispatchEvent(new CustomEvent("5e:library-closed", { detail: { library: "unified" } }));
  }
  async function open(trigger) {
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
      const id = check.dataset.selectResult;
      if (check.checked && selectedIds.size >= 10) {
        check.checked = false;
        setStatus("AI 참고 이미지는 한 번에 최대 10개까지 선택할 수 있습니다.", true);
        return;
      }
      if (check.checked) selectedIds.add(id); else selectedIds.delete(id);
      overlay.querySelector("[data-unilib-ai]").textContent = selectedIds.size > 1 ? `선택 ${selectedIds.size}개 AI 이미지로 보내기` : "AI 이미지로 보내기";
      return;
    }
    const card = event.target.closest("[data-result-id]");
    if (!card) return;
    if (card.dataset.pdfFile) {
      pdfBrowseSource = card.dataset.pdfFile;
      selectedId = results.find((result) => result.sourceId === pdfBrowseSource)?.id ?? null;
      renderResults();
      void renderPreview();
      return;
    }
    selectedId = card.dataset.resultId;
    activeRepresentation = "full";
    renderResults();
    void renderPreview();
  });
  overlay.querySelector("[data-unilib-representations]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-representation]");
    if (!button) return;
    activeRepresentation = button.dataset.representation;
    void renderPreview();
  });
  overlay.querySelector("[data-unilib-representations]").addEventListener("change", (event) => {
    const picker = event.target.closest("[data-figure-picker]");
    if (!picker) return;
    activeRepresentation = `figure:${picker.value}`;
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
  const openManager = async () => { folderDialog.hidden = false; await refreshDesktopSources(true); overlay.querySelector("[data-unilib-folder-dialog-close]").focus(); };
  overlay.querySelectorAll("[data-unilib-manage],[data-unilib-manage-side]").forEach((button) => button.addEventListener("click", () => void openManager()));
  overlay.querySelector("[data-unilib-folder-dialog-close]").addEventListener("click", () => { folderDialog.hidden = true; });
  overlay.querySelector("[data-unilib-folders-open]").addEventListener("click", () => {
    if (window.matchMedia("(max-width: 720px)").matches) root.classList.add("folders-open");
    else {
      searchPaneOpen = true;
      root.classList.remove("folders-collapsed");
      try { storage.setItem(PANE_STORAGE_KEY, "true"); } catch {}
    }
  });
  overlay.querySelector("[data-unilib-pane-collapse]").addEventListener("click", () => {
    if (window.matchMedia("(max-width: 767px)").matches) { closeDrawers(); return; }
    searchPaneOpen = false;
    root.classList.add("folders-collapsed");
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
      if (!result || !canInsertLibraryResult(result, snapshot.representation)) return;
      const effectiveResult = resultForRepresentation(result, snapshot.representation);
      const activeProvider = await provider();
      if (!isCurrent()) return;
      const materialized = await activeProvider.materialize(effectiveResult, { ...snapshot.options, representation: materializationRepresentation(result, snapshot.representation) });
      if (!isCurrent()) return;
      await insertMaterialized(effectiveResult, materialized, snapshot.options);
      if (isCurrent()) close();
    });
  });
  overlay.querySelector("[data-unilib-objectify]").addEventListener("click", async () => {
    await runLibraryAction(async (snapshot, isCurrent) => {
      const result = results.find((item) => item.id === snapshot.selectedId);
      if (!result || !canInsertLibraryResult(result, snapshot.representation) || typeof openObjectify !== "function") return;
      const effectiveResult = resultForRepresentation(result, snapshot.representation);
      const activeProvider = await provider();
      if (!isCurrent()) return;
      const materialized = await activeProvider.materialize(effectiveResult, { ...snapshot.options, representation: materializationRepresentation(result, snapshot.representation) });
      if (!isCurrent()) return;
      await openObjectify(effectiveResult, materialized);
      if (isCurrent()) close();
    });
  });
  overlay.querySelector("[data-unilib-ai]").addEventListener("click", async () => {
    await runLibraryAction(async (snapshot, isCurrent) => {
      const chosen = results.filter((result) => selectedIds.has(result.id));
      if (!chosen.length) { const selected = results.find((item) => item.id === snapshot.selectedId); if (selected) chosen.push(selected); }
      if (!chosen.length) return;
      const selected = results.find((item) => item.id === snapshot.selectedId);
      if (selected && !canInsertLibraryResult(selected, snapshot.representation)) return;
      const activeProvider = await provider();
      if (!isCurrent()) return;
      const references = [];
      for (const result of chosen.slice(0, 10)) {
        const representation = result.kind === "crop"
          ? (result.id === snapshot.selectedId && snapshot.representation !== "full" ? snapshot.representation : "figure:0")
          : "full";
        if (result.kind === "crop" && !result.variants?.figures?.length) continue;
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
  let draftCrop = null;
  let questionCrop = null;
  let cropGesture = null;
  const paintCropPreview = () => {
    if (!draftCrop || !cropImage.complete || !cropImage.naturalWidth) return;
    const [x, y, width, height] = draftCrop;
    const sourceWidth = Math.max(1, Math.round(cropImage.naturalWidth * width));
    const sourceHeight = Math.max(1, Math.round(cropImage.naturalHeight * height));
    const scale = Math.min(1, 640 / Math.max(sourceWidth, sourceHeight));
    cropPreview.width = Math.max(1, Math.round(sourceWidth * scale));
    cropPreview.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = cropPreview.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, cropPreview.width, cropPreview.height);
    context.drawImage(cropImage, x * cropImage.naturalWidth, y * cropImage.naturalHeight, sourceWidth, sourceHeight, 0, 0, cropPreview.width, cropPreview.height);
  };
  const paintCrop = () => {
    if (!draftCrop) return;
    const [x, y, width, height] = draftCrop;
    Object.assign(cropBox.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${width * 100}%`, height: `${height * 100}%` });
    overlay.querySelectorAll("[data-unilib-crop-value]").forEach((input) => { input.value = String(Math.round(draftCrop[Number(input.dataset.unilibCropValue)] * 1000) / 10); });
    paintCropPreview();
  };
  const closeCrop = () => { cropDialog.hidden = true; draftCrop = null; questionCrop = null; cropGesture = null; overlay.querySelector("[data-unilib-adjust]").focus(); };
  overlay.querySelector("[data-unilib-adjust]").addEventListener("click", async () => {
    const result = selectedResult();
    if (!result || result.provenance?.provider !== "pdf") return;
    questionCrop = clampRect(result.variants?.full?.source?.rect || result.provenance.rect);
    draftCrop = clampRect(pdfUi.cropForResult(result));
    const original = await (await provider()).materialize(result, { original: true });
    cropImage.src = resultImage(result, original);
    cropDialog.hidden = false;
    paintCrop();
    cropBox.focus();
  });
  cropImage.addEventListener("load", paintCrop);
  overlay.querySelector("[data-unilib-crop-cancel]").addEventListener("click", closeCrop);
  overlay.querySelector("[data-unilib-crop-reset]").addEventListener("click", () => { if (questionCrop) { draftCrop = [...questionCrop]; paintCrop(); } });
  overlay.querySelector("[data-unilib-crop-full]").addEventListener("click", () => { draftCrop = [0, 0, 1, 1]; paintCrop(); });
  overlay.querySelector("[data-unilib-crop-save]").addEventListener("click", async () => {
    const result = selectedResult();
    if (!result || !draftCrop) return;
    pdfUi.saveCropOverride(result, draftCrop);
    closeCrop();
    await renderPreview();
  });
  const cropPoint = (event) => {
    const bounds = cropCanvas.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))];
  };
  cropStage.addEventListener("pointerdown", (event) => {
    if (!draftCrop) return;
    const handle = event.target.closest("[data-crop-handle]")?.dataset.cropHandle || "";
    const mode = handle ? "resize" : event.target.closest("[data-unilib-crop-box]") ? "move" : "draw";
    cropStage.setPointerCapture(event.pointerId);
    cropGesture = { mode, handle, start: cropPoint(event), initial: [...draftCrop] };
    if (mode === "draw") draftCrop = cropRectFromGesture(draftCrop, cropGesture.start, cropGesture.start, "draw");
    paintCrop();
  });
  cropStage.addEventListener("pointermove", (event) => {
    if (!draftCrop || !cropGesture) return;
    draftCrop = cropRectFromGesture(cropGesture.initial, cropGesture.start, cropPoint(event), cropGesture.mode, cropGesture.handle);
    paintCrop();
  });
  cropStage.addEventListener("pointerup", () => { cropGesture = null; });
  cropStage.addEventListener("pointercancel", () => { cropGesture = null; });
  cropBox.addEventListener("keydown", (event) => {
    if (!draftCrop || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.02 : 0.005;
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    const handle = event.target.closest("[data-crop-handle]")?.dataset.cropHandle;
    draftCrop = handle
      ? cropRectFromGesture(draftCrop, [0, 0], [dx, dy], "resize", handle)
      : cropRectFromGesture(draftCrop, [0, 0], [dx, dy], "move");
    paintCrop();
  });
  overlay.querySelectorAll("[data-unilib-crop-value]").forEach((input) => input.addEventListener("change", () => {
    if (!draftCrop) return;
    const next = [...draftCrop];
    next[Number(input.dataset.unilibCropValue)] = Number(input.value) / 100;
    draftCrop = clampRect(next);
    paintCrop();
  }));
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
    if (["ArrowDown", "ArrowUp"].includes(event.key) && !editableTarget(event.target) && results.length) {
      event.preventDefault();
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

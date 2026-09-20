import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  kindsForResultTab,
  cropRectFromGesture,
  cropRectFromKeyboard,
  normalizedCropPoint,
  cropSessionIsCurrent,
  descendantLeafIds,
  displayedSourceCount,
  indexLibrarySources,
  isAiRasterDataUrl,
  canInsertLibraryResult,
  highlightTextParts,
  containedImageBounds,
  libraryResultIdentity,
  resolveLibraryPreviewResult,
  libraryActionSnapshotIsCurrent,
  isValidQuestionRepresentation,
  rectInCrop,
  aiRepresentationForResult,
  includeNewLibrarySources,
  isExampleLibraryResult,
  reconcileUnifiedSelection,
  representationsForResult,
  resultForRepresentation,
  withManualCropVariant,
  sourceSelection,
  shouldHandleLibrarySpace,
  figureChoicesForResult,
  selectedResultRecords,
  aiActionRecords,
  hasInsertableAiRecord,
  selectedInsertRepresentation,
  aiActionRepresentationForResult,
  cropContentBoundsForResult,
  cropZoomView,
  cropActionSnapshotIsCurrent,
  saveCropPng,
  normalizeLibraryTypes,
  toggleLibraryType,
  normalizeYearRange,
  createSearchScheduler,
  activePdfPageResult,
  materializeOriginalLibraryPage,
  materializeLibraryThumbnail,
  materializeLibraryAction,
  pdfResultsForDisplay,
  continuousPdfWindow,
  createBoundedPageCache,
  acceptedCropResult,
  workbenchReferenceGroups,
  visibleLibraryName,
  shouldShowResultTypeBadge,
  commitAcceptedCropSession,
} from "../js/unified-library-ui.js";

test("All is the exclusive no-filter state and includes questions, images, and PDFs", () => {
  assert.deepEqual(normalizeLibraryTypes([]), ["question", "image", "pdf"]);
  assert.deepEqual(normalizeLibraryTypes(["all", "pdf"]), ["question", "image", "pdf"]);
  assert.deepEqual(toggleLibraryType(["question", "image", "pdf"], "pdf"), ["pdf"]);
  assert.deepEqual(toggleLibraryType(["question", "image"], "all"), ["question", "image", "pdf"]);
  assert.deepEqual(toggleLibraryType(["question"], "question"), ["question"]);
});

test("result types select exclusively", () => {
  assert.deepEqual(toggleLibraryType(["question"], "pdf"), ["pdf"]);
  assert.deepEqual(toggleLibraryType(["pdf"], "image"), ["image"]);
});


test("visible library names omit common file extensions without changing source data", () => {
  const source = { title: "교과서_중2.pdf" };
  assert.equal(visibleLibraryName(source.title), "교과서_중2");
  assert.equal(visibleLibraryName("diagram.PNG · 7쪽"), "diagram · 7쪽");
  assert.equal(visibleLibraryName("교과서_중2.pdf 문항"), "교과서_중2 문항");
  assert.equal(source.title, "교과서_중2.pdf");
});

test("result type badges appear only where results need differentiation", () => {
  assert.equal(shouldShowResultTypeBadge(["question", "image", "pdf"], "pdf"), true);
  assert.equal(shouldShowResultTypeBadge(["question"], "crop"), true);
  assert.equal(shouldShowResultTypeBadge(["pdf"], "pdf"), false);
  assert.equal(shouldShowResultTypeBadge(["image"], "image"), false);
});

test("accepted crops remain transient until workbench confirmation", () => {
  const prior = { result: { id: "old", provenance: { documentId: "doc", pageNumber: 2 } }, materialized: {} };
  const next = { result: { id: "new", provenance: { documentId: "doc", pageNumber: 2 } }, materialized: {} };
  const acceptedAssets = new Map([["old", prior]]);
  const selectedIds = new Set(["old"]);
  const selectedRecords = new Map([["old", prior.result]]);

  assert.deepEqual([...acceptedAssets.keys()], ["old"]);
  commitAcceptedCropSession({ acceptedAssets, selectedIds, selectedRecords, acceptedCrops: [next], documentId: "doc", pageNumber: 2 });
  assert.deepEqual([...acceptedAssets.keys()], ["new"]);
  assert.deepEqual([...selectedIds], ["new"]);
  assert.deepEqual([...selectedRecords.keys()], ["new"]);
});

test("compact year range orders and clamps its endpoints", () => {
  assert.deepEqual(normalizeYearRange(2026, 2022, [2021, 2023, 2026]), { start: 2022, end: 2026 });
  assert.deepEqual(normalizeYearRange(1990, 2099, [2021, 2023, 2026]), { start: 2021, end: 2026 });
  assert.deepEqual(normalizeYearRange("", "", [2021, 2023, 2026]), { start: null, end: null });
  assert.deepEqual(normalizeYearRange("", 2026, ["", 2021, 2023, 2026]), { start: 2021, end: 2026 });
});

test("search scheduling defers composition, coalesces input, and Enter runs immediately", async () => {
  const calls = [];
  const timers = [];
  const scheduler = createSearchScheduler((reason) => calls.push(reason), {
    delay: 140,
    setTimer: (callback) => { timers.push(callback); return timers.length; },
    clearTimer: () => {},
  });
  scheduler.compositionStart();
  scheduler.input();
  assert.deepEqual(calls, []);
  scheduler.compositionEnd();
  assert.deepEqual(calls, []);
  timers.at(-1)();
  assert.deepEqual(calls, ["input"]);
  scheduler.input();
  scheduler.enter();
  assert.deepEqual(calls, ["input", "enter"]);
});

test("unified shell has multiselect type controls and a PDF file-page display toggle", async () => {
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  assert.match(source, /data-unilib-type="all"/u);
  assert.match(source, /data-unilib-selected-clear/u);
  assert.match(source, /data-unilib-year-start/u);
  assert.match(source, /data-unilib-help/u);
  assert.match(source, /data-unilib-pdf-mode="file"/u);
  assert.match(source, /data-unilib-pdf-mode="page"/u);
  assert.match(source, /data-unilib-pdf-mode="file" aria-pressed="false"/u);
  assert.match(source, /data-unilib-pdf-mode="page" aria-pressed="true"/u);
  assert.match(source, /let pdfDisplayMode = "page"/u);
  assert.doesNotMatch(source, /data-unilib-pdf-back/u);
  assert.doesNotMatch(source, /pdfBrowseSource/u);
});

test("search location actions stay inline and connected counts are hover-only", async () => {
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  assert.match(source, /unilib-pane-head[\s\S]*<h3>검색 위치<\/h3>[\s\S]*unilib-location-add/u);
  assert.match(source, /host\.hidden = !error/u);
  assert.match(source, /하위 폴더 포함 PDF/u);
});

test("crop additions do not enter persistent selections before workbench confirmation", async () => {
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  const saveHandler = source.match(/cropSave\.addEventListener\("click", async \(\) => \{([\s\S]*?)\n  \}\);/u)?.[1] ?? "";
  assert.doesNotMatch(saveHandler, /acceptedAssets\.set|selectedIds\.add|selectedRecords\.set/u);
  assert.match(source, /data-unilib-crop-workbench[\s\S]*commitAcceptedCropSession/u);
});

test("Given the library shell, count and help stay beside search while PDF file-page stays beside PDF", async () => {
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  assert.match(source, /class="[^"]*library-toolbar[^"]*"/u);
  assert.match(source, /class="[^"]*library-search-row[^"]*"[\s\S]*data-unilib-query[\s\S]*data-unilib-count[\s\S]*data-unilib-help/u);
  assert.match(source, /class="[^"]*library-filter-row[^"]*"[\s\S]*data-unilib-type="pdf"[\s\S]*data-unilib-pdf-display/u);
});

test("Given result cards, metadata is one semantic row and body snippets are omitted", async () => {
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  assert.match(source, /copy\.className = "[^"]*library-card-meta/u);
  assert.match(source, /badge\.className = `[^`]*library-card-type/u);
  assert.match(source, /title\.className = "library-card-name"/u);
  assert.match(source, /meta\.className = "library-card-page"/u);
  assert.doesNotMatch(source, /unilib-result-snippet/u);
});

test("Given a crop is accepted, it becomes an independent reference with exact provenance", () => {
  const original = { id: "page:doc:4", title: "문서", kind: "page", provenance: { provider: "pdf", documentId: "doc", pageNumber: 4 } };
  const accepted = acceptedCropResult(original, [0.1, 0.2, 0.3, 0.4], 2);
  assert.equal(accepted.id, "page:doc:4:manual:2");
  assert.equal(accepted.kind, "crop");
  assert.equal(accepted.cropType, "manual");
  assert.deepEqual(accepted.provenance, { provider: "pdf", documentId: "doc", pageNumber: 4, rect: [0.1, 0.2, 0.3, 0.4], fullPageFallback: false });
  assert.deepEqual(accepted.variants.manual.source.rect, [0.1, 0.2, 0.3, 0.4]);
});

test("Given advanced assignment, ordered groups map exact reference indices without truncation", () => {
  const references = Array.from({ length: 12 }, (_, index) => ({ name: `r${index}` }));
  const groups = workbenchReferenceGroups(references, { placement: "advanced", groups: [[11, 0], [4], [3]] });
  assert.deepEqual(groups.map(({ placement, references: group }) => ({ placement, names: group.map(({ name }) => name) })), [
    { placement: "together", names: ["r11", "r0"] },
    { placement: "separate", names: ["r4"] },
    { placement: "separate", names: ["r3"] },
  ]);
  assert.throws(() => workbenchReferenceGroups(references, { placement: "advanced", groups: [[3, 3]] }), /중복/u);
});

test("PDF page display expands matches without losing document and page provenance", () => {
  const file = { id: "file", title: "교과서.pdf", provenance: { documentId: "doc", pageNumber: 2 }, matches: [
    { pageNumber: 2, source: { documentId: "doc", pageNumber: 2, rect: [0, 0, 1, 1] } },
    { pageNumber: 7, source: { documentId: "doc", pageNumber: 7, rect: [0, 0, 1, 1] } },
  ] };
  const pages = pdfResultsForDisplay([file], "page");
  assert.deepEqual(pages.map((page) => page.provenance.pageNumber), [2, 7]);
  assert.equal(pages[1].provenance.documentId, "doc");
  assert.equal(pages[1].matches.length, 1);
  assert.deepEqual(pdfResultsForDisplay([file], "file"), [file]);
});

test("PDF thumbnail materialization uses page one in file mode and each matched page in page mode", async () => {
  const calls = [];
  const file = {
    id: "file:doc", kind: "pdf", title: "doc.pdf",
    provenance: { documentId: "doc", pageNumber: 2 },
    firstMatchingPage: 2,
    matches: [{ pageNumber: 2 }, { pageNumber: 3 }],
    loadPreview: async (pageNumber, options) => { calls.push({ pageNumber, options }); return { pageNumber }; },
  };

  await materializeLibraryThumbnail(file, null, "file");
  for (const page of pdfResultsForDisplay([file], "page")) {
    await materializeLibraryThumbnail(page, null, "page");
  }

  assert.deepEqual(calls, [
    { pageNumber: 1, options: { thumbnail: true } },
    { pageNumber: 2, options: { thumbnail: true, original: true } },
    { pageNumber: 3, options: { thumbnail: true, original: true } },
  ]);
});

test("desktop library density follows the open panel combination", async () => {
  const source = await readFile(new URL("../css/unified-library.css", import.meta.url), "utf8");
  assert.match(source, /folders-collapsed:not\(\.preview-hidden\)[^\{]+\{ grid-template-columns: repeat\(4,/u);
  assert.match(source, /preview-hidden:not\(\.folders-collapsed\)[^\{]+\{ grid-template-columns: repeat\(5,/u);
  assert.match(source, /folders-collapsed\.preview-hidden[^\{]+\{ grid-template-columns: repeat\(6,/u);
  assert.match(source, /object-position: center center/u);
  assert.match(source, /data-pdf-display="page"\] \.unilib-thumb img[^\{]*\{[^\}]*width: 100%;[^\}]*height: 100%;[^\}]*object-fit: cover;[^\}]*object-position: center center/u);
  assert.match(source, /data-pdf-display="page"\] \.unilib-thumb img[^\{]*\{[^\}]*position: absolute;[^\}]*inset: 0;/u);
});

test("loading a PDF crop clears the shared action status instead of showing a persistent preparation message", async () => {
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /setStatus\("원문 페이지를 준비하는 중…"\)/u);
});

test("preview chrome keeps only the two requested action labels visible", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8"),
    readFile(new URL("../css/unified-library.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /class="unilib-pane-head unilib-preview-heading"[^>]*hidden/u);
  assert.match(source, /class="unilib-source"[^>]*hidden/u);
  assert.match(source, /class="unilib-status"[^>]*hidden/u);
  assert.match(css, /\.unilib-preview-heading,[\s\S]*\.unilib-source,[\s\S]*\.unilib-status[^\{]*\{ display: none !important; \}/u);
  assert.match(css, /\.unilib-preview \{ grid-template-rows: minmax\(0, 1fr\) auto; \}/u);
  assert.match(source, />이미지 객체화<\/button>/u);
  assert.match(source, />AI 이미지 변환<\/button>/u);
});

test("PDF page preview fits the available width and scrolls vertically", async () => {
  const source = await readFile(new URL("../css/unified-library.css", import.meta.url), "utf8");
  assert.match(source, /\.unilib-stage \{[^\}]*min-width: 0;[^\}]*overflow-x: hidden;[^\}]*scrollbar-gutter: stable both-edges;/u);
  assert.match(source, /\.unilib-preview \.unilib-stage \{[^\}]*width: auto;[^\}]*height: 100%;/u);
  assert.match(source, /data-pdf-display="page"\] \.unilib-preview-image[^\{]*\{[^\}]*width: 100%;[^\}]*max-width: none;[^\}]*margin: 0;/u);
  assert.match(source, /data-pdf-display="page"\] \.unilib-preview-image > img[^\{]*\{[^\}]*width: 100%;[^\}]*max-width: none;[^\}]*max-height: none;[^\}]*height: auto;/u);
});

test("library cache keys advance through the complete deployed module chain", async () => {
  const [html, main, exam] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../js/main.js", import.meta.url), "utf8"),
    readFile(new URL("../js/exam-library.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /css\/unified-library\.css\?v=library-scope-0920-0931/u);
  assert.match(html, /js\/main\.js[^"']*library-scope-0920-0931/u);
  assert.match(main, /exam-library\.js\?v=library-scope-0920-0931/u);
  assert.match(exam, /unified-library-ui\.js\?v=library-scope-0920-0931/u);
});

test("continuous PDF windows reach the first, middle, and last page with bounded live pages", () => {
  assert.deepEqual(continuousPdfWindow(327, 1), { start: 1, end: 4, pages: [1, 2, 3, 4] });
  assert.deepEqual(continuousPdfWindow(327, 164), { start: 161, end: 167, pages: [161, 162, 163, 164, 165, 166, 167] });
  assert.deepEqual(continuousPdfWindow(327, 327), { start: 324, end: 327, pages: [324, 325, 326, 327] });
  assert.ok(continuousPdfWindow(327, 164).pages.length <= 7);
});

test("continuous PDF cache evicts old rendered pages at its documented bound", () => {
  const cache = createBoundedPageCache(7);
  for (let page = 1; page <= 20; page += 1) cache.set(page, `page-${page}`);
  assert.equal(cache.size, 7);
  assert.equal(cache.has(13), false);
  assert.equal(cache.get(14), "page-14");
  assert.equal(cache.get(20), "page-20");
});

test("library shell keeps the selected tray outside the result scroller", async () => {
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  const tray = source.indexOf('data-unilib-selected-tray');
  const scroller = source.indexOf('class="unilib-result-scroll"');
  const list = source.indexOf('data-unilib-results', scroller);
  assert.ok(tray > 0 && scroller > tray && list > scroller);
  assert.match(source, /result\.loadPreview\(pageNumber, \{ original: true \}\)/u);
});

test("empty-query page mode preserves canonical pages and does not cap the inventory", async () => {
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  assert.match(source, /pageDisplayActive && !queryText && file\.kind === "page" \? file/u);
  assert.match(source, /listPdfPages\?\.\(pageInventoryOptions\)/u);
  assert.doesNotMatch(source, /pageInventoryOptions[^;]*limit: 500/u);
});

test("Space hold stays bound to one result while every preview kind can outlast its threshold", async () => {
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  assert.match(source, /selectedId !== id \|\| libraryResultIdentity\(selectedActiveResult\(\)\) !== identity/u);
  assert.match(source, /const columns =[\s\S]*cancelSpacePress\(\);\s*if \(!\["ArrowDown", "ArrowUp"\][\s\S]*event\.preventDefault\(\);\s*invalidateAction\(\)/u);
  assert.match(source, /currentMaterializedIdentity = libraryResultIdentity\(result\)/u);
  assert.match(source, /const continueSpacePreview = async \(press\)[\s\S]*currentMaterializedIdentity !== press\.identity[\s\S]*setTimeout\(\(\) => void continueSpacePreview\(press\), 24\)/u);
  assert.match(source, /press\.long = true;\s*void continueSpacePreview\(press\)/u);
  assert.match(source, /if \(press\.long\) \{\s*press\.released = true;\s*return;/u);
  assert.match(source, /document\.addEventListener\("focusin"[\s\S]*cancelSpacePress/u);
});

test("library shell keeps one dismissal, exposes Drive settings, and omits import and a second preview close", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8"),
    readFile(new URL("../css/unified-library.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(source, /data-unilib-import|data-unilib-files|data-unilib-manage|data-unilib-folder-dialog/u);
  assert.match(source, /data-unilib-drive-settings-open/u);
  assert.match(source, /data-unilib-drive-settings-body/u);
  assert.match(source, /getDriveHost/u);
  assert.match(source, /child\.inert = open/u);
  assert.match(source, /event\.key !== "Tab"/u);
  assert.match(css, /\[data-unilib-drive-settings\][^}]*min-height: var\(--unilib-mobile-control-height\)/su);
  assert.doesNotMatch(source, /data-unilib-preview-close/u);
  assert.equal((source.match(/data-unilib-close/g) || []).length, 2);
});

test("folder counts are tooltip-only and never reserve label width", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8"),
    readFile(new URL("../css/unified-library.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(source, /className = "unilib-tree-count"/u);
  assert.doesNotMatch(css, /unilib-tree-count/u);
  assert.match(source, /text\.title = tooltip;\s*label\.title = tooltip;\s*row\.title = tooltip;/u);
});

test("an aggregate PDF resolves the active match and uses its own full-page loader", async () => {
  const calls = [];
  const aggregate = {
    id: "pdf:doc", kind: "pdf", firstMatchingPage: 1,
    provenance: { provider: "pdf", documentId: "doc", pageNumber: 1 },
    matches: [{ pageNumber: 1 }, { pageNumber: 272 }],
    loadPreview: async (pageNumber, options) => {
      calls.push({ pageNumber, options });
      return { dataUrl: "data:image/png;base64,AA==", provenance: { documentId: "doc", pageNumber } };
    },
  };
  const active = activePdfPageResult(aggregate, 1);
  assert.equal(active.provenance.pageNumber, 272);
  const materialized = await materializeOriginalLibraryPage(active, { materialize: () => assert.fail("aggregate PDF must not enter generic materialize") });
  assert.deepEqual(calls, [{ pageNumber: 272, options: { original: true } }]);
  assert.equal(materialized.provenance.pageNumber, 272);
});

test("next PDF match validates preview freshness against the active page", async () => {
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  assert.match(source, /requestIdentity === libraryResultIdentity\(activePdfPageResult\(selectedResult\(\), pdfMatchIndex\)\)/u);
});

test("page and crop originals retain the generic materializer contract", async () => {
  const result = { id: "page:doc:4", kind: "page", provenance: { provider: "pdf", documentId: "doc", pageNumber: 4 } };
  const calls = [];
  await materializeOriginalLibraryPage(result, { materialize: async (value, options) => { calls.push({ value, options }); return { dataUrl: "data:image/png;base64,AA==" }; } });
  assert.deepEqual(calls, [{ value: result, options: { original: true } }]);
});

test("Space routes the selected PDF into the direct crop surface without a second lightbox", async () => {
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /data-unilib-lightbox/u);
  assert.match(source, /shouldHandleLibrarySpace\(event\)[\s\S]*openExpandedPreview/u);
  assert.match(source, /openCropEditor\(\{ emptyDraft: true, wholePage: true,/u);
  assert.match(source, /data-unilib-crop-workbench/u);
});

test("AI consumer mode retains library tools while exposing only AI destinations", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8"),
    readFile(new URL("../css/unified-library.css", import.meta.url), "utf8"),
  ]);
  assert.match(source, /root\.classList\.add\("consumer-mode"\)/u);
  for (const selector of ["data-unilib-insert", "data-unilib-objectify", "data-unilib-crop-insert", "data-unilib-crop-objectify", "data-unilib-crop-save-png"]) {
    assert.match(css, new RegExp(`consumer-mode \\[${selector}\\]`, "u"));
  }
  assert.doesNotMatch(css, /consumer-mode[^}]*data-unilib-ai/u);
  assert.doesNotMatch(css, /consumer-mode[^}]*data-unilib-crop-ai/u);
});

test("published inventory stays interactive while background indexing refreshes later", async () => {
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  assert.match(source, /snapshot\?\.backgroundIndexing/u);
  assert.match(source, /snapshot\.backgroundIndexing\.then/u);
  assert.doesNotMatch(source, /await snapshot\.backgroundIndexing/u);
});

test("empty-query PDF aggregates render a page thumbnail instead of the 5E placeholder", async () => {
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  assert.match(source, /if \(result\.provenance\?\.provider === "pdf"\) pendingThumbnails\.push/u);
  assert.doesNotMatch(source, /result\.provenance\?\.provider === "pdf" && result\.kind !== "pdf"/u);
});

test("Given a rejected lazy resolver, preview resolution returns a recoverable failure instead of rejecting", async () => {
  const result = { id: "q1", provenance: { documentId: "doc", pageNumber: 1, locator: "old.pdf" } };
  const outcome = await resolveLibraryPreviewResult(
    result,
    async () => { throw new Error("open failed"); },
    () => true,
  );
  assert.equal(outcome.status, "failed");
  assert.match(outcome.error.message, /open failed/u);
});

test("Given the same result id after source replacement, preview resolution treats the old completion as stale", async () => {
  const pending = Promise.withResolvers();
  const original = { id: "q1", provenance: { documentId: "doc", pageNumber: 1, sha256: null, sourceKind: "pack", locator: "old.pdf" } };
  let current = original;
  const resolving = resolveLibraryPreviewResult(original, () => pending.promise, () => libraryResultIdentity(current) === libraryResultIdentity(original));
  current = { ...original, provenance: { ...original.provenance, locator: "replacement.pdf" } };
  pending.resolve({ ...original, variants: { figures: [{ source: { rect: [0.2, 0.2, 0.2, 0.2] } }] } });
  assert.deepEqual(await resolving, { status: "stale" });
});
import { IMAGE_IMPORT_MAX_BYTES, PDF_IMPORT_MAX_BYTES, partitionLibraryImports, safeExternalSourceUrl } from "../js/library-import-policy.js";

test("Given a result tab, when search options are built, then WHERE remains independent from WHAT", () => {
  assert.deepEqual(kindsForResultTab("all"), ["crop", "image", "page"]);
  assert.deepEqual(kindsForResultTab("question"), ["crop"]);
  assert.deepEqual(kindsForResultTab("image"), ["image"]);
  assert.deepEqual(kindsForResultTab("pdf"), ["page"]);
});

test("Given a result row, card selection and AI-reference selection are sibling controls", async () => {
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  assert.match(source, /button\.append\(media, copy\);\s*item\.append\(button, check\);/u);
  assert.doesNotMatch(source, /button\.append\([^)]*check/u);
  assert.match(source, /openIndependentReferences\(\{ references, startGeneration: false, placement, groups: assignment\?\.groups \}\)/u);
});

test("Given arbitrary-depth sources, the folder tree preserves hierarchy and tri-state descendants", () => {
  const sources = [
    { id: "root", kind: "group", label: "내 자료" },
    { id: "category", parentId: "root", kind: "category", label: "기출문제" },
    { id: "year", parentId: "category", kind: "folder", label: "2026학년도" },
    { id: "a", parentId: "year", kind: "source", label: "6월" },
    { id: "b", parentId: "year", kind: "source", label: "9월" },
  ];
  const indexed = indexLibrarySources(sources);
  assert.equal(indexed.roots[0].children[0].children[0].children.length, 2);
  assert.deepEqual(descendantLeafIds("root", sources), ["a", "b"]);
  assert.deepEqual(sourceSelection("year", sources, new Set(["a"])), { checked: false, indeterminate: true });
  assert.deepEqual(sourceSelection("year", sources, new Set(["a", "b"])), { checked: true, indeterminate: false });
});

test("Given nested PDF pages and images, folder badges count distinct PDF files only", () => {
  const sources = [
    { id: "root", kind: "group", label: "제공 자료", count: 0 },
    { id: "category", parentId: "root", kind: "category", label: "기출문제", count: 0 },
    { id: "year", parentId: "category", kind: "folder", label: "2026학년도", count: 0 },
    { id: "june", parentId: "year", kind: "source", label: "6월.pdf", count: 32, counts: { pdf: 1, image: 0, page: 32 } },
    { id: "september", parentId: "year", kind: "source", label: "9월.pdf", count: 28, counts: { pdf: 1, image: 3, page: 28 } },
  ];
  const { nodes } = indexLibrarySources(sources);
  assert.equal(displayedSourceCount(nodes.get("june")), 1);
  assert.equal(displayedSourceCount(nodes.get("year")), 2);
  assert.equal(displayedSourceCount(nodes.get("category")), 2);
  assert.equal(displayedSourceCount(nodes.get("root")), 2);
});

test("Given one PDF question, representations stay inside one card and select an exact crop source", () => {
  const result = {
    id: "question-1", kind: "crop", cropType: "question", provenance: { rect: [0, 0, 1, 1] }, preview: {},
    variants: {
      full: { label: "전체", source: { rect: [0.1, 0.2, 0.8, 0.7] } },
      content: { label: "내용", source: { rect: [0.1, 0.2, 0.5, 0.7] } },
      figures: [{ id: "figure-a", label: "이미지 1", source: { rect: [0.65, 0.2, 0.25, 0.3] } }],
    },
  };
  assert.deepEqual(representationsForResult(result).map(({ id, label }) => ({ id, label })), [
    { id: "full", label: "전체" }, { id: "image", label: "이미지" },
  ]);
  assert.deepEqual(resultForRepresentation(result, "figure:0").provenance.rect, [0.65, 0.2, 0.25, 0.3]);
  assert.equal(resultForRepresentation(result, "missing"), result);
});

test("question canvas insertion requires an explicitly selected figure", () => {
  const result = { kind: "crop", cropType: "question", variants: { figures: [{ source: { rect: [0, 0, 1, 1] } }] } };
  assert.equal(canInsertLibraryResult(result, "full"), false);
  assert.equal(canInsertLibraryResult(result, "image"), true);
  assert.equal(canInsertLibraryResult({ kind: "image" }, "full"), true);
});

test("whole-question view keeps a concrete selected figure for insertion", () => {
  const result = {
    id: "q1", kind: "crop", cropType: "question",
    variants: {
      full: { source: { rect: [0.1, 0.1, 0.8, 0.8] } },
      figures: [
        { id: "diagram-a", label: "실험 장치", source: { rect: [0.2, 0.3, 0.2, 0.2] } },
        { id: "diagram-b", label: "그래프", source: { rect: [0.55, 0.25, 0.25, 0.3] } },
      ],
    },
  };
  const choices = figureChoicesForResult(result, "figure:1");
  assert.deepEqual(choices.map(({ id, label, representation, selected }) => ({ id, label, representation, selected })), [
    { id: "diagram-a", label: "실험 장치", representation: "figure:0", selected: false },
    { id: "diagram-b", label: "그래프", representation: "figure:1", selected: true },
  ]);
  choices[0].rect.forEach((value, index) => assert.ok(Math.abs(value - [0.125, 0.25, 0.25, 0.25][index]) < 1e-9));
  choices[1].rect.forEach((value, index) => assert.ok(Math.abs(value - [0.5625, 0.1875, 0.3125, 0.375][index]) < 1e-9));
  assert.equal(selectedInsertRepresentation(result, "full", "figure:1"), "figure:1");
});

test("selected-question records persist outside the current query and remove one exact id", () => {
  const selected = new Map([
    ["q1", { id: "q1", title: "2026학년도 6월 1번" }],
    ["q11", { id: "q11", title: "2025학년도 9월 11번" }],
  ]);
  assert.deepEqual(selectedResultRecords(selected, new Set(["q11"])), [
    { id: "q11", title: "2025학년도 9월 11번" },
  ]);
  assert.deepEqual(selectedResultRecords(selected, new Set(["q1", "q11"])).map(({ id }) => id), ["q1", "q11"]);
});

test("AI candidates use persistent checked records and fall back to the preview only with an empty selection", () => {
  const valid = { id: "checked", kind: "crop", cropType: "question", variants: { figures: [{ source: { rect: [0.1, 0.1, 0.2, 0.2] } }] } };
  const invalidCurrent = { id: "page", kind: "page" };
  const records = new Map([[valid.id, valid]]);
  const selectedIds = new Set([valid.id]);
  const chosen = aiActionRecords(records, selectedIds, invalidCurrent);
  assert.deepEqual(chosen, [valid]);
  assert.equal(hasInsertableAiRecord(chosen, { selectedId: invalidCurrent.id, representation: "full", selectedFigure: "figure:0" }), true);
  assert.deepEqual(aiActionRecords(new Map(), new Set(["missing"]), invalidCurrent), []);
  assert.deepEqual(aiActionRecords(new Map(), new Set(), invalidCurrent), [invalidCurrent]);
});

test("library shell exposes a persistent selected-item tray and selectable figure overlay seam", async () => {
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  assert.match(source, /data-unilib-selected-tray/u);
  assert.match(source, /data-unilib-selected-remove/u);
  assert.match(source, /unilibFigureChoice/u);
  assert.doesNotMatch(source, /for \(const id of selectedIds\) if \(!visibleIds\.has\(id\)\) selectedIds\.delete\(id\)/u);
});

test("a question without a detected figure offers only whole preview until a direct crop exists", () => {
  const result = { kind: "crop", cropType: "question", variants: { full: { label: "전체", source: { rect: [0.1, 0.1, 0.8, 0.8] } }, figures: [] } };
  assert.deepEqual(representationsForResult(result).map(({ id }) => id), ["full"]);
  assert.equal(canInsertLibraryResult(result, "full"), false);
  assert.equal(canInsertLibraryResult(result, "image"), false);
  const cropped = withManualCropVariant(result, { documentId: "doc", pageNumber: 1, rect: [0.2, 0.2, 0.3, 0.3], fullPageFallback: false });
  assert.deepEqual(representationsForResult(cropped).map(({ id }) => id), ["full", "image"]);
  assert.equal(canInsertLibraryResult(cropped, "image"), true);
});

test("search snippets expose keyword segments without unsafe HTML", () => {
  assert.deepEqual(highlightTextParts("운동량 보존 법칙", "보존"), [
    { text: "운동량 ", match: false }, { text: "보존", match: true }, { text: " 법칙", match: false },
  ]);
});

test("snippet highlighting tokenizes hashes the same way as PDF AND search", () => {
  assert.deepEqual(highlightTextParts("우주선 질량", "#우주선 #질량 질량"), [
    { text: "우주선", match: true }, { text: " ", match: false }, { text: "질량", match: true },
  ]);
});

test("contained thumbnail bounds exclude object-fit letterboxing", () => {
  assert.deepEqual(containedImageBounds(
    { left: 10, top: 20, width: 200, height: 100 },
    { naturalWidth: 100, naturalHeight: 100 },
  ), { left: 60, top: 20, width: 100, height: 100 });
});

test("pending library actions reject selection, representation, and close races", () => {
  const snapshot = { selectedId: "q1", selectedIdsKey: "q1", representation: "figure:0", open: true };
  assert.equal(libraryActionSnapshotIsCurrent(snapshot, { ...snapshot }), true);
  assert.equal(libraryActionSnapshotIsCurrent(snapshot, { ...snapshot, selectedId: "q2" }), false);
  assert.equal(libraryActionSnapshotIsCurrent(snapshot, { ...snapshot, representation: "figure:1" }), false);
  assert.equal(libraryActionSnapshotIsCurrent(snapshot, { ...snapshot, selectedIdsKey: "q2" }), false);
  assert.equal(libraryActionSnapshotIsCurrent(snapshot, { ...snapshot, open: false }), false);
});

test("multiple figure choices remain valid under the single image representation", () => {
  const result = { variants: { manual: { source: {} }, figures: [{ source: {} }, { source: {} }] } };
  assert.equal(isValidQuestionRepresentation(result, "manual"), true);
  assert.equal(isValidQuestionRepresentation(result, "figure:1"), true);
  assert.equal(isValidQuestionRepresentation(result, "figure:2"), false);
});

test("AI multi-selection prefers each saved crop and skips only unsupported full questions", () => {
  const manual = { id: "manual", kind: "crop", cropType: "question", variants: { manual: { source: {} }, figures: [] } };
  const figure = { id: "figure", kind: "crop", cropType: "question", variants: { figures: [{ source: {} }] } };
  const unsupported = { id: "none", kind: "crop", cropType: "question", variants: { figures: [] } };
  const generalCrop = { id: "crop", kind: "crop", cropType: "manual" };
  assert.equal(aiRepresentationForResult(manual, "other", "full"), "manual");
  assert.equal(aiRepresentationForResult(figure, "other", "full"), "figure:0");
  assert.equal(canInsertLibraryResult(manual, aiRepresentationForResult(manual, "other", "full")), true);
  assert.equal(canInsertLibraryResult(unsupported, aiRepresentationForResult(unsupported, "other", "full")), false);
  assert.equal(canInsertLibraryResult(generalCrop, aiRepresentationForResult(generalCrop, "other", "full")), true);
});

test("AI resolves the current whole-view blue-box choice before insertion guards", () => {
  const result = { id: "q1", kind: "crop", cropType: "question", variants: { figures: [{ source: { rect: [0.1, 0.1, 0.2, 0.2] } }, { source: { rect: [0.5, 0.5, 0.3, 0.3] } }] } };
  assert.equal(aiActionRepresentationForResult(result, "q1", "full", "figure:1"), "figure:1");
  assert.equal(aiActionRepresentationForResult(result, "other", "full", "figure:1"), "figure:0");
  assert.equal(canInsertLibraryResult(result, aiActionRepresentationForResult(result, "q1", "full", "figure:1")), true);
});

test("page-normalized search rectangles map into a cropped question preview", () => {
  assert.deepEqual(rectInCrop([0.3, 0.4, 0.2, 0.1], [0.2, 0.2, 0.5, 0.5]).map((value) => Math.round(value * 10) / 10), [0.2, 0.4, 0.4, 0.2]);
  assert.equal(rectInCrop([0, 0, 0.1, 0.1], [0.2, 0.2, 0.5, 0.5]), null);
});

test("Given crop gestures, drawing, moving, and all resize axes remain normalized", () => {
  assert.deepEqual(cropRectFromGesture([0, 0, 1, 1], [0.8, 0.9], [0.2, 0.3], "draw"), [0.2, 0.3, 0.6000000000000001, 0.6000000000000001]);
  assert.deepEqual(cropRectFromGesture([0, 0, 1, 1], [-0.2, 1.2], [1.4, 0.25], "draw"), [0, 0.25, 1, 0.75]);
  assert.equal(cropRectFromGesture([0, 0, 1, 1], [0.4, 0.4], [0.4, 0.4], "draw"), null);
  assert.deepEqual(cropRectFromGesture([0.7, 0.7, 0.2, 0.2], [0, 0], [0.5, 0.5], "move"), [0.8, 0.8, 0.2, 0.2]);
  assert.deepEqual(cropRectFromGesture([0.2, 0.2, 0.5, 0.5], [0, 0], [-0.1, -0.1], "resize", "nw"), [0.1, 0.1, 0.6, 0.6]);
  assert.deepEqual(cropRectFromGesture([0.2, 0.2, 0.5, 0.5], [0, 0], [0.1, 0.1], "resize", "se"), [0.2, 0.2, 0.6, 0.6]);
});

test("crop keyboard arrows move and Shift plus arrows resize without result navigation", async () => {
  const rect = [0.2, 0.2, 0.4, 0.4];
  assert.deepEqual(cropRectFromKeyboard(rect, "ArrowLeft"), [0.195, 0.2, 0.4, 0.4]);
  assert.deepEqual(cropRectFromKeyboard(rect, "ArrowRight"), [0.20500000000000002, 0.2, 0.4, 0.4]);
  assert.deepEqual(cropRectFromKeyboard(rect, "ArrowUp"), [0.2, 0.195, 0.4, 0.4]);
  assert.deepEqual(cropRectFromKeyboard(rect, "ArrowDown"), [0.2, 0.20500000000000002, 0.4, 0.4]);
  assert.deepEqual(cropRectFromKeyboard(rect, "ArrowLeft", true), [0.2, 0.2, 0.38, 0.4]);
  assert.deepEqual(cropRectFromKeyboard(rect, "ArrowRight", true), [0.2, 0.2, 0.42000000000000004, 0.4]);
  assert.deepEqual(cropRectFromKeyboard(rect, "ArrowUp", true), [0.2, 0.2, 0.4, 0.38]);
  assert.deepEqual(cropRectFromKeyboard(rect, "ArrowDown", true), [0.2, 0.2, 0.4, 0.42000000000000004]);
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  const documentHandler = source.indexOf('document.addEventListener("keydown"');
  const cropGuard = source.indexOf("if (!cropDialog.hidden) {", documentHandler);
  const resultNavigation = source.indexOf('if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"].includes(event.key)', documentHandler);
  assert.ok(documentHandler >= 0 && cropGuard > documentHandler && cropGuard < resultNavigation);
});

test("direct crop coordinates remain normalized at 100% and 200% display zoom", () => {
  assert.deepEqual(normalizedCropPoint({ clientX: 350, clientY: 260 }, { left: 100, top: 60, width: 500, height: 400 }), [0.5, 0.5]);
  assert.deepEqual(normalizedCropPoint({ clientX: 600, clientY: 460 }, { left: 100, top: 60, width: 1000, height: 800 }), [0.5, 0.5]);
  assert.deepEqual(normalizedCropPoint({ clientX: -50, clientY: 900 }, { left: 100, top: 60, width: 500, height: 400 }), [0, 1]);
});

test("Given page questions, when crop opens, then fit bounds cover meaningful content across both columns", () => {
  const result = {
    id: "q1", provenance: { documentId: "exam", pageNumber: 2, rect: [0.08, 0.06, 0.4, 0.84] },
    variants: { content: { source: { rect: [0.1, 0.08, 0.36, 0.8] } } },
  };
  const candidates = [
    result,
    { id: "q2", provenance: { documentId: "exam", pageNumber: 2 }, variants: { content: { source: { rect: [0.54, 0.07, 0.38, 0.82] } } } },
    { id: "other-page", provenance: { documentId: "exam", pageNumber: 3 }, variants: { content: { source: { rect: [0, 0, 1, 1] } } } },
    { id: "other-document", provenance: { documentId: "other", pageNumber: 2 }, variants: { content: { source: { rect: [0, 0, 1, 1] } } } },
  ];
  assert.deepEqual(cropContentBoundsForResult(result, candidates).map((value) => Math.round(value * 100) / 100), [0.1, 0.07, 0.82, 0.82]);
  assert.deepEqual(cropContentBoundsForResult(result, []), [0.1, 0.08, 0.36, 0.8]);
});

test("Given local crop zoom, when zoom changes, then the page point under the pointer stays anchored", () => {
  assert.deepEqual(cropZoomView({
    zoom: 1, requestedZoom: 2,
    scrollLeft: 100, scrollTop: 50,
    pointerX: 350, pointerY: 250,
    stageLeft: 50, stageTop: 50,
  }), { zoom: 2, scrollLeft: 500, scrollTop: 300 });
  assert.deepEqual(cropZoomView({
    zoom: 2, requestedZoom: 99,
    scrollLeft: 20, scrollTop: 30,
    pointerX: 110, pointerY: 90,
    stageLeft: 10, stageTop: 10,
  }), { zoom: 6, scrollLeft: 260, scrollTop: 250 });
  assert.deepEqual(cropZoomView({ zoom: 2, requestedZoom: Number.NaN, scrollLeft: 12, scrollTop: 14 }), { zoom: 2, scrollLeft: 12, scrollTop: 14 });
});

test("Given a direct crop action, stale selection, page, rect, close, and materialization states are rejected", () => {
  const snapshot = {
    resultId: "q1", documentId: "exam", pageNumber: 2,
    resultIdentity: "source-a", currentResultIdentity: "source-a",
    rectKey: "0.1,0.2,0.3,0.4", open: true, exact: true,
  };
  assert.equal(cropActionSnapshotIsCurrent(snapshot, { ...snapshot }), true);
  assert.equal(cropActionSnapshotIsCurrent(snapshot, { ...snapshot, resultId: "q2" }), false);
  assert.equal(cropActionSnapshotIsCurrent(snapshot, { ...snapshot, pageNumber: 3 }), false);
  assert.equal(cropActionSnapshotIsCurrent(snapshot, { ...snapshot, currentResultIdentity: "source-b" }), false);
  assert.equal(cropActionSnapshotIsCurrent(snapshot, { ...snapshot, rectKey: "0.1,0.2,0.3,0.5" }), false);
  assert.equal(cropActionSnapshotIsCurrent(snapshot, { ...snapshot, open: false }), false);
  assert.equal(cropActionSnapshotIsCurrent(snapshot, { ...snapshot, exact: false }), false);
});

test("Given an exact crop PNG, native save and web download report distinct truthful outcomes", async () => {
  const calls = [];
  const nativeSaved = await saveCropPng({
    dataUrl: "data:image/png;base64,iVBORw0KGgo=", suggestedName: "문항-crop.png",
    nativeSave: async (input) => { calls.push(input); return { ok: true, canceled: false, filePath: "/tmp/crop.png" }; },
  });
  assert.deepEqual(calls, [{ dataUrl: "data:image/png;base64,iVBORw0KGgo=", suggestedName: "문항-crop.png" }]);
  assert.deepEqual(nativeSaved, { kind: "saved", filePath: "/tmp/crop.png" });

  const nativeCanceled = await saveCropPng({
    dataUrl: "data:image/png;base64,iVBORw0KGgo=", suggestedName: "crop.png",
    nativeSave: async () => ({ ok: false, canceled: true }),
  });
  assert.deepEqual(nativeCanceled, { kind: "canceled" });

  const downloads = [];
  const requested = await saveCropPng({
    dataUrl: "data:image/png;base64,iVBORw0KGgo=", suggestedName: "crop.png",
    requestDownload: (dataUrl, name) => downloads.push({ dataUrl, name }),
  });
  assert.deepEqual(downloads, [{ dataUrl: "data:image/png;base64,iVBORw0KGgo=", name: "crop.png" }]);
  assert.deepEqual(requested, { kind: "requested" });

  const failed = await saveCropPng({
    dataUrl: "data:image/png;base64,iVBORw0KGgo=", suggestedName: "crop.png",
    nativeSave: async () => ({ ok: false, canceled: false, error: "write-failed" }),
  });
  assert.deepEqual(failed, { kind: "error", error: "write-failed" });
  assert.deepEqual(await saveCropPng({
    dataUrl: "data:image/png;base64,iVBORw0KGgo=", suggestedName: "crop.png",
    nativeSave: async () => { throw new Error("disk unavailable"); },
  }), { kind: "error", error: "write-failed" });
  assert.deepEqual(await saveCropPng({ dataUrl: "", suggestedName: "crop.png", requestDownload: () => assert.fail("must not download") }), { kind: "error", error: "invalid-image" });
});

test("crop editor keeps only zoom, width fit, close, and workbench transfer controls", async () => {
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  assert.match(source, /data-unilib-crop-zoom-out/u);
  assert.match(source, /data-unilib-crop-zoom-in/u);
  assert.match(source, /data-unilib-crop-fit>좌우 맞춤/u);
  assert.match(source, /data-unilib-crop-workbench[^>]*>작업대에 넣기/u);
  assert.doesNotMatch(source, /data-unilib-crop-(save-png|insert|objectify|ai|select-all)/u);
});

test("crop sessions reject stale result and page identities", () => {
  const current = { id: "q1", provenance: { documentId: "doc", pageNumber: 2, sha256: "hash-a", sourceKind: "pack", locator: "old.pdf" } };
  const session = { resultId: "q1", documentId: "doc", pageNumber: 2, resultIdentity: libraryResultIdentity(current) };
  assert.equal(cropSessionIsCurrent(session, current), true);
  assert.equal(cropSessionIsCurrent(session, { id: "q2", provenance: { documentId: "doc", pageNumber: 2 } }), false);
  assert.equal(cropSessionIsCurrent(session, { id: "q1", provenance: { documentId: "doc", pageNumber: 3 } }), false);
});

test("Given pending crop materialization, replacing the source behind the same result and page rejects the old completion", async () => {
  const pending = Promise.withResolvers();
  const original = { id: "q1", provenance: { documentId: "doc", pageNumber: 2, sha256: "hash-a", sourceKind: "pack", locator: "old.pdf" } };
  const session = { resultId: "q1", documentId: "doc", pageNumber: 2, resultIdentity: libraryResultIdentity(original) };
  let current = original;
  const accepted = [];
  const completion = resolveLibraryPreviewResult(
    original,
    () => pending.promise,
    () => cropSessionIsCurrent(session, current),
  );

  current = { ...original, provenance: { ...original.provenance, sha256: "hash-b", locator: "replacement.pdf" } };
  pending.resolve({ dataUrl: "data:image/png;base64,b2xkLXNvdXJjZQ==" });
  const outcome = await completion;
  if (outcome.status === "resolved") accepted.push(outcome.result);

  assert.deepEqual(outcome, { status: "stale" });
  assert.deepEqual(accepted, []);
});

test("a transient manual crop preserves canonical question metadata and source", () => {
  const result = {
    id: "q1", kind: "crop", cropType: "question",
    metadata: { itemNumber: 7 }, provenance: { provider: "pdf", documentId: "doc", pageNumber: 2, rect: [0.1, 0.1, 0.8, 0.8] },
    variants: { full: { source: { documentId: "doc", pageNumber: 2, rect: [0.1, 0.1, 0.8, 0.8], fullPageFallback: false } } },
  };
  const source = { documentId: "doc", pageNumber: 2, rect: [0.25, 0.3, 0.2, 0.15], fullPageFallback: false };
  const updated = withManualCropVariant(result, source);
  assert.equal(updated.metadata, result.metadata);
  assert.equal(updated.provenance, result.provenance);
  assert.deepEqual(updated.variants.manual.source, source);
  assert.equal(result.variants.manual, undefined);
});

test("saving a transient crop does not write the persistent correction override", async () => {
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /pdfUi\.saveCropOverride\(/u);
  assert.match(source, /result\.variants\?\.manual\?\.source\?\.rect/u);
});

test("confirming crops keeps independent checked records for later filtered AI dispatch", async () => {
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  assert.match(source, /selectedIds\.add\(entry\.result\.id\);\s*selectedRecords\.set\(entry\.result\.id, entry\.result\)/u);
  assert.match(source, /const chosen = aiActionRecords\(selectedRecords, selectedIds,/u);
});

test("Given a selected result from a disabled source, when results refresh, then stale selection is removed", () => {
  const next = [{ id: "kept", sourceId: "source:enabled" }];
  assert.equal(reconcileUnifiedSelection("hidden", next), "kept");
  assert.equal(reconcileUnifiedSelection("kept", next), "kept");
  assert.equal(reconcileUnifiedSelection("hidden", []), null);
});

test("Given editable or button focus, when Space is pressed, then the library preview shortcut is guarded", () => {
  assert.equal(shouldHandleLibrarySpace({ key: " ", target: { tagName: "INPUT" } }), false);
  assert.equal(shouldHandleLibrarySpace({ key: " ", target: { tagName: "BUTTON" } }), false);
  assert.equal(shouldHandleLibrarySpace({ key: " ", target: { tagName: "BUTTON", closest: (selector) => selector === "[data-result-id]" ? {} : null } }), true);
  assert.equal(shouldHandleLibrarySpace({ key: " ", target: { tagName: "DIV", isContentEditable: true } }), false);
  assert.equal(shouldHandleLibrarySpace({ key: " ", target: { tagName: "LI" } }), true);
});

test("Given browser imports, oversized and unsupported files are rejected before bytes are read", () => {
  const files = [
    { name: "safe.png", type: "image/png", size: 10 },
    { name: "huge.jpg", type: "image/jpeg", size: IMAGE_IMPORT_MAX_BYTES + 1 },
    { name: "script.svg", type: "image/svg+xml", size: 10 },
    { name: "fake.png", type: "text/html", size: 10 },
  ];
  const result = partitionLibraryImports(files);
  assert.deepEqual(result.acceptedImages, [files[0]]);
  assert.deepEqual(result.rejected.map((item) => item.reason), ["IMAGE_SIZE", "UNSUPPORTED", "UNSUPPORTED"]);
  assert.equal(files.some((file) => "arrayBuffer" in file), false);
});

test("Given a manifest source URL, only HTTP(S) links are exposed", () => {
  assert.equal(safeExternalSourceUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalSourceUrl("data:text/html,unsafe"), null);
  assert.equal(safeExternalSourceUrl("::::"), null);
  assert.equal(safeExternalSourceUrl("https://example.com/source"), "https://example.com/source");
});

test("Given a PDF batch, count and aggregate limits stop parsing work before arrayBuffer", () => {
  let reads = 0;
  const files = Array.from({ length: 33 }, (_, index) => ({
    name: `${index}.pdf`, type: "application/pdf", size: PDF_IMPORT_MAX_BYTES,
    arrayBuffer() { reads += 1; throw new Error("must not read during validation"); },
  }));
  const result = partitionLibraryImports(files);
  assert.equal(result.acceptedPdfs.length, 2);
  assert.equal(result.rejected.filter((item) => item.reason === "PDF_BATCH_SIZE").length, 31);
  const countFiles = Array.from({ length: 101 }, (_, index) => ({ ...files[0], name: `${index}.pdf`, size: 1 }));
  const countBound = partitionLibraryImports(countFiles);
  assert.equal(countBound.acceptedPdfs.length, 100);
  assert.equal(countBound.rejected[0].reason, "PDF_COUNT");
  const repeatedImage = partitionLibraryImports([{ name: "next.png", type: "image/png", size: 1 }], { currentImageCount: 100 });
  assert.equal(repeatedImage.rejected[0].reason, "IMAGE_COUNT");
  assert.equal(reads, 0);
});

test("Given an AI reference, only supported raster data URLs bypass browser rasterization", () => {
  assert.equal(isAiRasterDataUrl("data:image/png;base64,AA=="), true);
  assert.equal(isAiRasterDataUrl("data:image/jpeg;base64,AA=="), true);
  assert.equal(isAiRasterDataUrl("data:image/webp;base64,AA=="), true);
  assert.equal(isAiRasterDataUrl("data:image/svg+xml;base64,AA=="), false);
  assert.equal(isAiRasterDataUrl("data:image/gif;base64,AA=="), false);
});

test("Given example and real materials, only truthfully flagged results receive the example disclosure", () => {
  assert.equal(isExampleLibraryResult({ presentation: { kind: "example" } }), true);
  assert.equal(isExampleLibraryResult({ provenance: { sourceKind: "fixture" } }), true);
  assert.equal(isExampleLibraryResult({ provenance: { provider: "pdf", sourceKind: "pack" } }), false);
  assert.equal(isExampleLibraryResult({ provenance: { provider: "pdf", sourceKind: "local" } }), false);
});

test("Given asynchronous catalog arrival, new roots default on while an explicitly off root stays off", () => {
  const enabled = new Set(["parts:b"]);
  const known = new Set(["parts:b", "parts:c"]);
  const sources = [
    { id: "pdf-root", kind: "group" },
    { id: "pdf:1", kind: "source", parentId: "pdf-root" },
    { id: "parts:c", kind: "source", parentId: "parts-root" },
  ];
  includeNewLibrarySources(enabled, known, sources);
  assert.deepEqual([...enabled].sort(), ["parts:b", "pdf:1"]);
  const excluded = new Set(["pdf-root"]);
  includeNewLibrarySources(new Set(["parts:b"]), known, sources, excluded);
  assert.equal(excluded.has("pdf-root"), true);
  const offEnabled = new Set(["parts:b"]);
  includeNewLibrarySources(offEnabled, known, sources, excluded);
  assert.equal(offEnabled.has("pdf:1"), false);
});

test("Given a nested source arriving below an excluded root, it stays off through category and folder descendants", () => {
  const enabled = new Set(["parts:b"]);
  const sources = [
    { id: "pdf-root", kind: "group", parentId: null },
    { id: "past-exams", kind: "category", parentId: "pdf-root" },
    { id: "2026", kind: "folder", parentId: "past-exams" },
    { id: "september", kind: "folder", parentId: "2026" },
    { id: "pdf:new", kind: "source", parentId: "september" },
  ];
  includeNewLibrarySources(enabled, new Set(["parts:b"]), sources, new Set(["pdf-root"]));
  assert.deepEqual([...enabled], ["parts:b"]);
});


test("PDF keyword page actions use their loader rather than generic aggregate materialization", async () => {
  const calls = [];
  const file = { id: "pdf:d", kind: "pdf", provenance: { provider: "pdf", documentId: "d", pageNumber: 1 }, matches: [{ pageNumber: 265 }, { pageNumber: 266 }], loadPreview: async (pageNumber) => { calls.push(pageNumber); return { dataUrl: `page-${pageNumber}`, source: { pageNumber } }; } };
  const provider = { materialize() { throw new Error("Unknown library result"); } };
  const selected = pdfResultsForDisplay([file], "page");
  const materialized = await Promise.all(selected.map(result => materializeLibraryAction(result, provider)));
  assert.deepEqual(calls, [265, 266]);
  assert.deepEqual(materialized.map(result => result.dataUrl), ["page-265", "page-266"]);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  kindsForResultTab,
  cropRectFromGesture,
  descendantLeafIds,
  displayedSourceCount,
  indexLibrarySources,
  isAiRasterDataUrl,
  canInsertLibraryResult,
  highlightTextParts,
  libraryActionSnapshotIsCurrent,
  includeNewLibrarySources,
  isExampleLibraryResult,
  reconcileUnifiedSelection,
  representationsForResult,
  resultForRepresentation,
  sourceSelection,
  shouldHandleLibrarySpace,
} from "../js/unified-library-ui.js";
import { IMAGE_IMPORT_MAX_BYTES, PDF_IMPORT_MAX_BYTES, partitionLibraryImports, safeExternalSourceUrl } from "../js/library-import-policy.js";

test("Given a result tab, when search options are built, then WHERE remains independent from WHAT", () => {
  assert.deepEqual(kindsForResultTab("all"), ["crop", "image"]);
  assert.deepEqual(kindsForResultTab("question"), ["crop"]);
  assert.deepEqual(kindsForResultTab("image"), ["image"]);
  assert.deepEqual(kindsForResultTab("pdf"), ["page"]);
});

test("Given a result row, card selection and AI-reference selection are sibling controls", async () => {
  const source = await readFile(new URL("../js/unified-library-ui.js", import.meta.url), "utf8");
  assert.match(source, /button\.append\(media, copy\);\s*item\.append\(button, check\);/u);
  assert.doesNotMatch(source, /button\.append\([^)]*check/u);
  assert.match(source, /openIndependentReferences\(\{ references, startGeneration: false \}\)/u);
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

test("Given nested descendant counts, a parent folder cannot display zero", () => {
  const sources = [
    { id: "root", kind: "group", label: "제공 자료", count: 0 },
    { id: "category", parentId: "root", kind: "category", label: "기출문제", count: 0 },
    { id: "year", parentId: "category", kind: "folder", label: "2026학년도", count: 0 },
    { id: "june", parentId: "year", kind: "source", label: "6월.pdf", count: 32 },
    { id: "september", parentId: "year", kind: "source", label: "9월.pdf", count: 28 },
  ];
  const { nodes } = indexLibrarySources(sources);
  assert.equal(displayedSourceCount(nodes.get("june")), 32);
  assert.equal(displayedSourceCount(nodes.get("year")), 60);
  assert.equal(displayedSourceCount(nodes.get("category")), 60);
  assert.equal(displayedSourceCount(nodes.get("root")), 60);
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

test("search snippets expose keyword segments without unsafe HTML", () => {
  assert.deepEqual(highlightTextParts("운동량 보존 법칙", "보존"), [
    { text: "운동량 ", match: false }, { text: "보존", match: true }, { text: " 법칙", match: false },
  ]);
});

test("pending library actions reject selection, representation, and close races", () => {
  const snapshot = { selectedId: "q1", selectedIdsKey: "q1", representation: "figure:0", open: true };
  assert.equal(libraryActionSnapshotIsCurrent(snapshot, { ...snapshot }), true);
  assert.equal(libraryActionSnapshotIsCurrent(snapshot, { ...snapshot, selectedId: "q2" }), false);
  assert.equal(libraryActionSnapshotIsCurrent(snapshot, { ...snapshot, representation: "figure:1" }), false);
  assert.equal(libraryActionSnapshotIsCurrent(snapshot, { ...snapshot, selectedIdsKey: "q2" }), false);
  assert.equal(libraryActionSnapshotIsCurrent(snapshot, { ...snapshot, open: false }), false);
});

test("Given crop gestures, drawing, moving, and all resize axes remain normalized", () => {
  assert.deepEqual(cropRectFromGesture([0, 0, 1, 1], [0.8, 0.9], [0.2, 0.3], "draw"), [0.2, 0.3, 0.6000000000000001, 0.6000000000000001]);
  assert.deepEqual(cropRectFromGesture([0.7, 0.7, 0.2, 0.2], [0, 0], [0.5, 0.5], "move"), [0.8, 0.8, 0.2, 0.2]);
  assert.deepEqual(cropRectFromGesture([0.2, 0.2, 0.5, 0.5], [0, 0], [-0.1, -0.1], "resize", "nw"), [0.1, 0.1, 0.6, 0.6]);
  assert.deepEqual(cropRectFromGesture([0.2, 0.2, 0.5, 0.5], [0, 0], [0.1, 0.1], "resize", "se"), [0.2, 0.2, 0.6, 0.6]);
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

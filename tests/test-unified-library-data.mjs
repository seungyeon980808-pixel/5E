import assert from "node:assert/strict";
import test from "node:test";

import { parseCompactExamCode, deriveExamMetadata } from "../js/library/exam-code.js";
import { createUnifiedLibraryProvider } from "../js/library/provider.js";
import { computeSourceSelection } from "../js/library/source-tree.js";
import { insertPartsAsset } from "../js/parts-library.js";

const pdfSource = Object.freeze({
  kind: "pack",
  locator: "verified-pack/documents/p12606.pdf",
  displayName: "p12606.pdf",
  sha256: "a".repeat(64),
});

function pdfDocument(id = "verified::p12606") {
  return {
    id,
    title: "2026학년도 6월 모의평가 물리학 I",
    source: pdfSource,
    metadata: { academicYear: 2026, administration: "june", subject: "phy1" },
    pageCount: 1,
    pages: [{
      documentId: id,
      pageNumber: 1,
      text: "1. 운동량 보존 실험 도판",
      words: [{ text: "운동량", rect: [0.2, 0.2, 0.1, 0.03] }],
      items: [{
        id: `${id}:p1:q1`, itemNumber: 1, label: "1", rect: [0.1, 0.1, 0.8, 0.7],
        source: { documentId: id, pageNumber: 1, rect: [0.1, 0.1, 0.8, 0.7], fullPageFallback: false },
      }],
    }],
  };
}

test("compact exam codes are strict and preserve item/page ambiguity", () => {
  assert.deepEqual(parseCompactExamCode("p1260601"), {
    subject: "p1", academicYear: 2026, administration: "06", itemNumber: 1,
    documentCode: "p12606", itemCode: "p1260601",
  });
  assert.deepEqual(parseCompactExamCode("p12606.pdf"), {
    subject: "p1", academicYear: 2026, administration: "06", itemNumber: null,
    documentCode: "p12606", itemCode: null,
  });
  for (const malformed of ["p1261301", "p1260600", "p3260601", "xp1260601", "p126060101"]) {
    assert.equal(parseCompactExamCode(malformed), null, malformed);
  }
});

test("real pack metadata derives canonical exam codes without renaming its PDF", () => {
  assert.deepEqual(deriveExamMetadata({
    metadata: { academicYear: 2026, administration: "june", subject: "phy1" },
    source: { displayName: "2026-june-physics1.pdf" },
  }), {
    subject: "p1", academicYear: 2026, administration: "06",
    documentCode: "p12606", sourceFileName: "2026-june-physics1.pdf",
  });
});

test("readable imported exam filenames derive canonical metadata", () => {
  assert.deepEqual(deriveExamMetadata({ source: { displayName: "2025-june-phy1.pdf" } }), {
    subject: "p1", academicYear: 2025, administration: "06", documentCode: "p12506", sourceFileName: "2025-june-phy1.pdf",
  });
});

test("exact item search returns one question card with full, content, and figure variants", async () => {
  const document = pdfDocument();
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [document],
    pdfSearchIndex: { schemaVersion: "pdf-search-index-v1", entries: [{
      documentId: document.id, documentTitle: document.title, pageNumber: 1,
      itemId: `${document.id}:p1:q1`, itemNumber: 1, text: "운동량 보존 실험 도판", normalized: "운동량 보존 실험 도판",
      source: document.pages[0].items[0].source,
      metadata: document.metadata,
      figureCandidates: [{
        id: `${document.id}:figure:1`, itemId: `${document.id}:p1:q1`, itemNumber: 1,
        documentId: document.id, pageNumber: 1, rect: [0.3, 0.3, 0.2, 0.2],
        source: { documentId: document.id, pageNumber: 1, rect: [0.3, 0.3, 0.2, 0.2], fullPageFallback: false },
      }],
    }] },
    materializers: {
      pdf: async ({ source }) => ({ bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), source }),
    },
  });

  const results = provider.search({ query: "p1260601" });
  assert.deepEqual(results.map(({ kind }) => kind), ["crop"]);
  assert.equal(results[0].cropType, "question");
  assert.deepEqual(Object.keys(results[0].variants), ["full", "content", "figures"]);
  assert.equal(results[0].variants.figures.length, 1);
  assert.equal(results[0].variants.figures[0].source.rect.join(","), "0.3,0.3,0.2,0.2");
  assert.match(results[0].matchContext.snippet, /운동량/u);
  assert.equal(results.every(({ provenance }) => provenance.sha256 === pdfSource.sha256), true);

  const rendered = await provider.materialize(results[0]);
  assert.deepEqual([...rendered.bytes], [0x89, 0x50, 0x4e, 0x47]);
  assert.equal(rendered.source.documentId, document.id);
  const figure = await provider.materialize(results[0], { representation: "figure:0" });
  assert.equal(figure.source.rect.join(","), "0.3,0.3,0.2,0.2");
});

test("WHERE sources and WHAT kinds are independent and colliding source ids remain distinct", () => {
  const first = pdfDocument("shared");
  const second = { ...pdfDocument("shared"), source: { ...pdfSource, locator: "pack-b/documents/p12606.pdf", sha256: "b".repeat(64) } };
  const provider = createUnifiedLibraryProvider({ pdfDocuments: [first, second] });
  const pages = provider.search({ query: "운동량", kinds: ["page"] });
  assert.equal(pages.length, 2);
  assert.equal(new Set(pages.map(({ id }) => id)).size, 2);
  assert.equal(new Set(pages.map(({ sourceId }) => sourceId)).size, 2);
  assert.deepEqual(provider.search({ query: "운동량", kinds: ["image"] }), []);
  assert.equal(provider.search({ query: "운동량", sourceIds: [pages[0].sourceId], kinds: ["page"] }).length, 1);
});

test("word search yields one card per identified question and raw pages only by explicit page filter", () => {
  const document = pdfDocument();
  const provider = createUnifiedLibraryProvider({ pdfDocuments: [document] });
  const defaults = provider.search({ query: "운동량" });
  assert.deepEqual(defaults.map(({ kind }) => kind), ["crop"]);
  assert.equal(defaults[0].metadata.itemNumber, 1);
  assert.match(defaults[0].matchContext.snippet, /운동량/u);
  assert.deepEqual(provider.search({ query: "운동량", kinds: ["page"] }).map(({ kind }) => kind), ["page"]);
});

test("a locally opened PDF matches words only inside each identified question boundary", () => {
  const first = pdfDocument("local-boundaries");
  const page = {
    ...first.pages[0],
    text: "1. 운동량 2. 굴절",
    words: [
      { text: "운동량", rect: [0.2, 0.2, 0.1, 0.03] },
      { text: "굴절", rect: [0.2, 0.7, 0.1, 0.03] },
    ],
    items: [
      {
        ...first.pages[0].items[0], rect: [0.1, 0.1, 0.8, 0.45],
        source: { documentId: "local-boundaries", pageNumber: 1, rect: [0.1, 0.1, 0.8, 0.45], fullPageFallback: false },
      },
      {
        id: "local-boundaries:p1:q2", itemNumber: 2, label: "2", rect: [0.1, 0.6, 0.8, 0.3],
        source: { documentId: "local-boundaries", pageNumber: 1, rect: [0.1, 0.6, 0.8, 0.3], fullPageFallback: false },
      },
    ],
  };
  const provider = createUnifiedLibraryProvider({ pdfDocuments: [{ ...first, pages: [page] }] });
  assert.deepEqual(provider.search({ query: "굴절" }).map((result) => result.metadata.itemNumber), [2]);
});

test("an exact exam code prefers its indexed PDF question over a duplicate curated image", () => {
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [pdfDocument()],
    examManifest: { items: [{
      id: "p1_2026_06_01", file: "p1_2026_06_01.png", subject: "p1", year: 2026, month: 6, no: 1, title: "1번",
    }] },
  });
  const found = provider.search({ query: "p1260601" });
  assert.equal(found.length, 1);
  assert.equal(found[0].kind, "crop");
  assert.equal(found[0].metadata.itemCode, "p1260601");
});

test("a page without a trustworthy item boundary remains an honest default page fallback", () => {
  const document = { ...pdfDocument(), pages: [{ ...pdfDocument().pages[0], items: [] }] };
  const provider = createUnifiedLibraryProvider({ pdfDocuments: [document] });
  const [fallback] = provider.search({ query: "운동량" });
  assert.equal(fallback.kind, "page");
  assert.equal(fallback.provenance.fullPageFallback, true);
});

test("worker search is async, groups matching question once, and catalog replacement is immediate", async () => {
  const document = { ...pdfDocument("worker-doc"), pageCount: 3, pages: [] };
  let workerOptions;
  let workerCalls = 0;
  const workerEntry = {
    documentId: document.id, documentTitle: document.title, pageNumber: 3,
    itemId: "worker-doc:q4", itemNumber: 4, snippet: "프리즘을 지난 빛의 굴절 실험",
    matchRects: [[0.42, 0.24, 0.08, 0.03]],
    source: { documentId: document.id, pageNumber: 3, rect: [0.1, 0.1, 0.8, 0.6], fullPageFallback: false },
    metadata: { academicYear: 2026, administration: "june", subject: "phy1" },
  };
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [document],
    searchPdf: async (options) => { workerCalls += 1; workerOptions = options; return [workerEntry, workerEntry]; },
  });
  const pdfSourceId = provider.getSources().find(({ kind }) => kind === "source").id;
  const results = await provider.searchAsync({ query: "굴절", sourceIds: [pdfSourceId] });
  assert.equal(results.filter(({ kind }) => kind === "page").length, 0);
  assert.equal(results.filter(({ kind }) => kind === "crop").length, 1);
  assert.match(results[0].matchContext.snippet, /굴절/u);
  assert.deepEqual(results[0].matchContext.matchRects, [[0.42, 0.24, 0.08, 0.03]]);
  assert.match(results[0].matchText, /굴절/u);
  assert.deepEqual(workerOptions.documentIds, ["worker-doc"]);
  await provider.searchAsync({ query: "굴절", sourceIds: [], kinds: ["image"] });
  assert.equal(workerCalls, 1);
  provider.replacePdfCatalog({ documents: [], searchIndex: { schemaVersion: "pdf-search-index-v1", entries: [] } });
  assert.deepEqual(provider.search({ query: "굴절" }), []);
});

test("prebuilt and worker question results reject cross-document crop provenance", async () => {
  const owner = pdfDocument("owner-doc");
  const other = pdfDocument("other-doc");
  const otherSource = { documentId: other.id, pageNumber: 1, rect: [0.2, 0.2, 0.5, 0.5], fullPageFallback: false };
  const safeSource = owner.pages[0].items[0].source;
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [owner, other],
    pdfSearchIndex: { schemaVersion: "pdf-search-index-v1", entries: [
      {
        documentId: owner.id, documentTitle: owner.title, pageNumber: 1,
        itemId: `${owner.id}:forged`, itemNumber: 1, text: "위조 질문",
        source: otherSource, metadata: owner.metadata,
      },
      {
        documentId: owner.id, documentTitle: owner.title, pageNumber: 1,
        itemId: `${owner.id}:safe`, itemNumber: 2, text: "안전 질문",
        source: safeSource, contentSource: otherSource, metadata: owner.metadata,
        figureCandidates: [{ id: "forged-figure", documentId: owner.id, pageNumber: 1, source: otherSource }],
      },
      {
        documentId: owner.id, documentTitle: owner.title, pageNumber: 1,
        itemId: `${owner.id}:wrong-page`, itemNumber: 4, text: "페이지 위조",
        source: { ...safeSource, pageNumber: 2 }, metadata: owner.metadata,
      },
      {
        documentId: owner.id, documentTitle: owner.title, pageNumber: 1,
        itemId: `${owner.id}:invalid-rect`, itemNumber: 5, text: "좌표 위조",
        source: { ...safeSource, rect: [0.9, 0.9, 0.2, 0.2] }, metadata: owner.metadata,
      },
    ] },
    searchPdf: async () => [{
      documentId: owner.id, documentTitle: owner.title, pageNumber: 1,
      itemId: `${owner.id}:worker-forged`, itemNumber: 3, snippet: "작업자 위조 질문",
      source: otherSource, metadata: owner.metadata,
    }],
  });

  assert.deepEqual(provider.search({ query: "위조 질문" }), []);
  assert.deepEqual(provider.search({ query: "위조 질문", kinds: ["page"] }), []);
  const [safe] = provider.search({ query: "안전 질문" });
  assert.equal(safe.variants.full.source.documentId, owner.id);
  assert.equal(safe.variants.content.source.documentId, owner.id);
  assert.deepEqual(safe.variants.figures, []);
  assert.deepEqual(provider.search({ query: "페이지 위조" }), []);
  assert.deepEqual(provider.search({ query: "페이지 위조", kinds: ["page"] }), []);
  assert.deepEqual(provider.search({ query: "좌표 위조" }), []);
  assert.deepEqual(provider.search({ query: "좌표 위조", kinds: ["page"] }), []);
  assert.deepEqual(await provider.searchAsync({ query: "작업자 위조 질문" }), []);
});

test("PDF materialization rejects a representation source outside its canonical document and page", async () => {
  const owner = pdfDocument("materialize-owner");
  const other = pdfDocument("materialize-other");
  let materializerCalls = 0;
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [owner, other],
    materializers: { pdf: async () => { materializerCalls += 1; return { ok: true }; } },
  });
  const [result] = provider.search({ query: "운동량", sourceIds: [provider.getSources().find((node) =>
    node.kind === "source" && node.label === owner.source.displayName).id] });
  const forgedSource = { documentId: other.id, pageNumber: 1, rect: [0.1, 0.1, 0.8, 0.7], fullPageFallback: false };
  const forged = { ...result, variants: { ...result.variants, full: { ...result.variants.full, source: forgedSource } } };
  const wrongPage = { ...result, variants: { ...result.variants, full: { ...result.variants.full, source: { ...result.variants.full.source, pageNumber: 2 } } } };
  const wrongRect = { ...result, variants: { ...result.variants, full: { ...result.variants.full, source: { ...result.variants.full.source, rect: [0.2, 0.1, 0.7, 0.7] } } } };

  await assert.rejects(() => provider.materialize(forged, { representation: "full" }), /provenance|document|source/iu);
  await assert.rejects(() => provider.materialize(wrongPage, { representation: "full" }), /provenance|document|source/iu);
  await assert.rejects(() => provider.materialize(wrongRect, { representation: "full" }), /provenance|document|source/iu);
  assert.equal(materializerCalls, 0);
});

test("sources expose semantic categories and arbitrary-depth folder ancestry", () => {
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [pdfDocument()],
    importedImages: [{
      id: "nested", fileName: "diagram.png", sourceId: "teacher-root", sourceLabel: "수업 자료",
      relativePath: "교과서/물리/역학/diagram.png", category: "textbooks", bytes: new Uint8Array([1]),
    }],
  });
  const sources = provider.getSources();
  const localLeaf = sources.find((node) => node.kind === "source" && node.origin === "local");
  assert.equal(localLeaf.category, "textbooks");
  const ancestry = [];
  for (let node = localLeaf; node?.parentId;) {
    node = sources.find((candidate) => candidate.id === node.parentId);
    if (node) ancestry.push(node.label);
  }
  assert.deepEqual(ancestry.slice(0, 4), ["역학", "물리", "교과서", "내 자료"]);
  assert.equal(sources.some((node) => node.kind === "category" && node.category === "past-exams"), true);
});

test("personal PDF relative paths become local arbitrary-depth source folders", () => {
  const local = {
    ...pdfDocument("local-pdf"),
    title: "수업 자료",
    metadata: undefined,
    source: { kind: "file", locator: "opaque-id", displayName: "파동.pdf", relativePath: "교과서/물리/파동/파동.pdf" },
  };
  const sources = createUnifiedLibraryProvider({ pdfDocuments: [local] }).getSources();
  const leaf = sources.find((node) => node.kind === "source");
  const labels = [];
  for (let node = leaf; node?.parentId;) {
    node = sources.find((candidate) => candidate.id === node.parentId);
    if (node) labels.push(node.label);
  }
  assert.deepEqual(labels.slice(0, 5), ["파동", "물리", "연결 폴더", "교과서", "내 자료"]);
  assert.equal(leaf.category, "textbooks");
  assert.equal(leaf.origin, "local");
});

test("materialize forwards part options without changing their values", async () => {
  let received;
  const provider = createUnifiedLibraryProvider({
    partsManifest: { items: [{ id: "part-1", file: "part.svg", name: "부품", subject: "p", subjectLabel: "물리" }] },
    materializers: { part: async (input) => { received = input; return { ok: true }; } },
  });
  const [part] = provider.search({ query: "부품" });
  const options = { mode: "lineart", level: "L2", fill: "none", targetMm: 45, lineMm: 0.35, dropLine: true, tiny: 0.02 };
  assert.deepEqual(await provider.materialize(part, options), { ok: true });
  assert.equal(received.options, options);
  assert.equal(received.item.id, "part-1");
});

test("imported images search filename only while curated image tags remain searchable", () => {
  const provider = createUnifiedLibraryProvider({
    examManifest: { items: [{ id: "p1_2026_06_01", file: "p1_2026_06_01.png", subject: "p1", year: 2026, month: 6, no: 1, title: "1번", tags: ["운동량보존"] }] },
    examBaseUrl: "https://legacy.example/data/",
    importedImages: [{ id: "local-1", fileName: "pulley-photo.png", tags: ["secret-tag"], sourceId: "folder-a", sourceLabel: "내 폴더", bytes: new Uint8Array([1, 2]) }],
  });
  assert.equal(provider.search({ query: "운동량보존", kinds: ["image"] }).length, 1);
  assert.equal(provider.search({ query: "secret-tag", kinds: ["image"] }).length, 0);
  assert.equal(provider.search({ query: "pulley", kinds: ["image"] }).length, 1);
  assert.equal(provider.search({ query: "운동량보존", kinds: ["image"] })[0].preview.url,
    "https://legacy.example/data/images/p1_2026_06_01.png");
  assert.equal(provider.search({ query: "운동량보존", kinds: ["image"] })[0].title, "물리학Ⅰ 2026학년도 6월 모의평가 1번");
});

test("external exam manifests never fall back to deleted bundled image paths", () => {
  const item = { id: "p1_2026_06_01", file: "p1 2026 #1.png", subject: "p1", year: 2026, month: 6, no: 1, title: "1번" };
  const unconfigured = createUnifiedLibraryProvider({ examManifest: { items: [item] } });
  const [withoutBase] = unconfigured.search({ query: "p1260601" });
  assert.equal(withoutBase.preview.url, null);
  assert.equal(withoutBase.provenance.locator, null);
  const configured = createUnifiedLibraryProvider({ examManifest: { items: [item] }, examBaseUrl: "https://legacy.example/root/" });
  const [withBase] = configured.search({ query: "p1260601" });
  assert.equal(withBase.preview.url, "https://legacy.example/root/images/p1%202026%20%231.png");
  assert.equal(withBase.provenance.locator, withBase.preview.url);
});

test("imported image byte snapshots materialize as copies without entering serializable provenance", async () => {
  const original = new Uint8Array([4, 5, 6]);
  const provider = createUnifiedLibraryProvider({
    importedImages: [{ id: "local-bytes", fileName: "local.png", sourceId: "folder", mimeType: "image/png", bytes: original }],
  });
  const [result] = provider.search({ query: "local.png" });
  assert.equal("bytes" in result.provenance, false);
  const materialized = await provider.materialize(result);
  assert.deepEqual([...materialized.bytes], [4, 5, 6]);
  assert.notEqual(materialized.bytes, original);
  materialized.bytes[0] = 99;
  assert.equal(original[0], 4);
});

test("source parent state is checked, mixed, then unchecked from enabled leaves", () => {
  const nodes = [
    { id: "root", parentId: null, kind: "group", label: "자료" },
    { id: "one", parentId: "root", kind: "source", label: "하나" },
    { id: "two", parentId: "root", kind: "source", label: "둘" },
  ];
  assert.equal(computeSourceSelection(nodes, ["one", "two"]).find(({ id }) => id === "root").checked, true);
  assert.equal(computeSourceSelection(nodes, ["one"]).find(({ id }) => id === "root").indeterminate, true);
  assert.equal(computeSourceSelection(nodes, []).find(({ id }) => id === "root").checked, false);
});

test("parts insertion preserves self-contained original/lineart object behavior", () => {
  const stateValue = {
    artboard: { w: 100, h: 80 }, objects: [], undoStack: [], redoStack: [{ stale: true }],
    activeLayerId: "layer-1", selectedIds: [], targetedId: "old", activeTool: "P",
  };
  const state = { get: () => stateValue, update: (change) => change(stateValue) };
  const inserted = insertPartsAsset(state, {
    item: { id: "beaker", name: "비커" },
    asset: { dataUri: "data:image/svg+xml;base64,PHN2Zy8+", viewBox: [0, 0, 2, 1], raw: true },
    widthMm: 40, id: "obj-fixed", lineLevel: "RAW", lineFill: null,
  });
  assert.equal(inserted.type, "svgAsset");
  assert.equal(inserted.src, "data:image/svg+xml;base64,PHN2Zy8+");
  assert.deepEqual([inserted.x, inserted.y, inserted.w, inserted.h], [30, 30, 40, 20]);
  assert.deepEqual(stateValue.selectedIds, ["obj-fixed"]);
  assert.equal(stateValue.undoStack.length, 1);
  assert.deepEqual(stateValue.redoStack, []);
});

test("saved manual question crops reconstruct on every provider search", () => {
  const rect = [0.12, 0.08, 0.42, 0.35];
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [pdfDocument()],
    cropForResult: () => rect,
  });
  const first = provider.search({ query: "운동량", kinds: ["crop"] })[0];
  const second = provider.search({ query: "운동량", kinds: ["crop"] })[0];
  assert.deepEqual(first.variants.manual.source.rect, rect);
  assert.deepEqual(second.variants.manual.source.rect, rect);
});

test("question search results sort by numeric question number", () => {
  const document = pdfDocument();
  const page = document.pages[0];
  const items = [10, 2, 1].map((itemNumber, index) => ({
    id: `q${itemNumber}`, itemNumber, rect: [0, index * 0.3, 1, 0.25],
    source: { documentId: document.id, pageNumber: 1, rect: [0, index * 0.3, 1, 0.25], fullPageFallback: false },
  }));
  const words = items.map((item) => ({ text: "공통어", rect: [0.1, item.rect[1] + 0.05, 0.1, 0.03] }));
  const provider = createUnifiedLibraryProvider({ pdfDocuments: [{ ...document, pages: [{ ...page, items, words }] }] });
  assert.deepEqual(provider.search({ query: "공통어", kinds: ["crop"] }).map((result) => result.metadata.itemNumber), [1, 2, 10]);
});

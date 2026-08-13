const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  assertBrowserDesktopParity,
  createForbiddenTransportRecorder,
} = require("../tests/stabilization/harness/browser-desktop-parity.cjs");

const policyModule = import("../js/ai-reference-source-policy.js");
const dialogModule = import("../js/ai-reference-dialog.js");
const sourceModule = import("../js/local-reference-sources.mjs");
const projectModule = import("../js/project-io.js");
const pdfSearchModule = import("../js/pdf-search.mjs");
const referenceGridModule = import("../js/ai-reference-grid.js");
const requestPlanModule = import("../js/ai-request-plan.js");

function createReferenceStatusFixture() {
  const makeElement = () => ({
    attributes: new Map(), dataset: {}, hidden: true, textContent: "",
    setAttribute(name, value) { this.attributes.set(name, value); },
    getAttribute(name) { return this.attributes.get(name); },
  });
  const summary = makeElement();
  const grid = makeElement();
  const root = { querySelector: (selector) => selector === "[data-ai-search-summary]" ? summary : grid };
  return { grid, root, summary };
}

test("local source activation skips every request transport", async () => {
  // Given
  const policy = await policyModule;
  const transport = createForbiddenTransportRecorder();

  // When
  const source = await policy.activateReferenceSource("local", {
    loadRemote: transport.ports.networkRequest,
    onRemoteLoad: transport.ports.networkRequest,
  });

  // Then
  assert.equal(source, "local");
  assert.deepEqual(transport.calls, []);
});

test("remote source activation loads catalogs only after an explicit source choice", async () => {
  // Given
  const policy = await policyModule;
  const requested = [];
  const states = [];
  const request = async (url) => {
    requested.push(url);
    return { ok: true, json: async () => ({ items: [{ file: `${url}.svg` }] }) };
  };
  // When
  const source = await policy.activateReferenceSource("parts", {
    loadRemote: () => policy.loadRemoteReferenceCatalog(request),
    onRemoteLoad: () => states.push("loading"),
  });

  // Then
  assert.equal(source, "parts");
  assert.deepEqual(states, ["loading"]);
  assert.deepEqual(requested, [
    "assets/parts-library/manifest.json",
    "assets/exam-library/manifest.json",
  ]);
});

test("an explicitly opened empty remote catalog keeps its understandable empty state", async () => {
  // Given
  const { referenceGridState } = await referenceGridModule;

  // When
  const state = referenceGridState(true, []);

  // Then
  assert.equal(state, "empty");
});

test("cancelled denied and failed crop handoffs cannot attach local bytes", async () => {
  // Given
  const policy = await policyModule;
  const attached = [];
  const reference = { data: "data:image/png;base64,U1lOVEhFVElD", name: "synthetic", sourceKind: "local-pdf-crop" };
  // When
  const outcomes = ["cancelled", "denied", "failed"].map((decision) =>
    policy.handoffLocalReference(reference, decision, (item) => attached.push(item)));

  // Then
  assert.deepEqual(outcomes, [false, false, false]);
  assert.deepEqual(attached, []);
});

test("an explicit confirmed crop handoff is the only path that adds local bytes", async () => {
  // Given
  const policy = await policyModule;
  const attached = [];
  const reference = { data: "data:image/png;base64,U1lOVEhFVElD", name: "synthetic", sourceKind: "local-pdf-crop" };

  // When
  const accepted = policy.handoffLocalReference(reference, "confirmed", (item) => attached.push(item));

  // Then
  assert.equal(accepted, true);
  assert.deepEqual(attached, [{ ...reference, sourceKind: "local-pdf-crop-confirmed" }]);
});

test("request planning excludes local bytes until their handoff is confirmed", async () => {
  // Given
  const { selectOutgoingImageItems } = await requestPlanModule;
  const local = { data: "data:image/png;base64,U1lOVEhFVElD", sourceKind: "local-pdf-crop" };
  const confirmed = { ...local, sourceKind: "local-pdf-crop-confirmed" };

  // When / Then
  assert.deepEqual(selectOutgoingImageItems({ type: "image", references: [local] }), []);
  assert.deepEqual(selectOutgoingImageItems({ type: "image", references: [confirmed] }), [confirmed]);
});

test("request planning after Generate keeps an ordinary explicitly selected image", async () => {
  // Given
  const { selectOutgoingImageItems } = await requestPlanModule;
  const selected = { data: "data:image/png;base64,U1lOVEhFVElD", sourceKind: "auto" };

  // When
  const outgoing = selectOutgoingImageItems({ type: "image", references: [selected] });

  // Then
  assert.deepEqual(outgoing, [selected]);
});

test("the image remote-plan boundary excludes every unconfirmed local reference", async () => {
  // Given
  const { selectImagePlanningInput } = await requestPlanModule;
  const unconfirmed = { id: "crop", data: "data:image/png;base64,TE9DQUw=", sourceKind: "local-pdf-crop" };
  const confirmed = { ...unconfirmed, id: "confirmed", sourceKind: "local-pdf-crop-confirmed" };
  const picked = { id: "picker", data: "data:image/png;base64,UElDS0VS", sourceKind: "auto" };

  // When
  const input = selectImagePlanningInput({ references: [unconfirmed, confirmed, picked], latestResult: unconfirmed });

  // Then
  assert.deepEqual(input, { references: [confirmed, picked], latestResult: null });
});

test("single-render direct transport drops unconfirmed local bytes and retains confirmed and picker inputs", async () => {
  // Given
  const { selectImageTransportItems } = await requestPlanModule;
  const local = { id: "local", data: "data:image/png;base64,TE9DQUw=", sourceKind: "local-pdf-crop" };
  const confirmed = { ...local, id: "confirmed", sourceKind: "local-pdf-crop-confirmed" };
  const picker = { id: "picker", data: "data:image/png;base64,UElDS0VS", sourceKind: "auto" };

  // When
  const selected = selectImageTransportItems([local, confirmed, picker]);

  // Then
  assert.deepEqual(selected, [confirmed, picker]);
});

test("batch direct transport drops unconfirmed local bytes and retains confirmed picker and draft inputs", async () => {
  // Given
  const { selectImageTransportItems } = await requestPlanModule;
  const local = { id: "local", data: "data:image/png;base64,TE9DQUw=", sourceKind: "local-pdf" };
  const confirmed = { ...local, id: "confirmed", sourceKind: "local-pdf-confirmed" };
  const picker = { id: "picker", data: "data:image/png;base64,UElDS0VS", sourceKind: "auto" };
  const draft = { id: "draft", data: "data:image/png;base64,RFJBRlQ=", sourceKind: "line-art" };

  // When
  const selected = selectImageTransportItems([local, confirmed, picker, draft]);

  // Then
  assert.deepEqual(selected, [confirmed, picker, draft]);
});

test("the image pipeline delegates cache and remote planning to the private input", () => {
  // Given / When
  const panel = fs.readFileSync(path.join(__dirname, "..", "js", "ai-panel.js"), "utf8");

  // Then
  assert.match(panel, /\{\s*references: planningReferences,\s*latestResult: revisionImage\s*\}\s*=\s*selectImagePlanningInput\(/s);
  assert.match(panel, /makeCacheDescriptor\(\{[^}]*references:\s*planningReferences/s);
  assert.match(panel, /createRemoteImageInputPlan\(\{[^}]*references:\s*planningReferences/s);
  assert.match(panel, /outgoingItems\s*=\s*selectImageTransportItems\(composed\.outputs\.map\(/);
  assert.match(panel, /const batchTransportItems\s*=\s*selectImageTransportItems\(outgoing\);[^;]*batchTransportItems\.map\(prepareTransportItem\)/s);
});

test("remote catalog loading stays visible and accessible inside the dialog", async () => {
  // Given
  const { createReferenceLoadStatus } = await dialogModule;
  const { grid, root, summary } = createReferenceStatusFixture();
  const status = createReferenceLoadStatus(root);

  // When
  status.loading();

  // Then
  assert.equal(summary.hidden, false);
  assert.equal(summary.dataset.aiSearchState, "loading");
  assert.equal(summary.getAttribute("aria-live"), "polite");
  assert.equal(summary.getAttribute("aria-busy"), "true");
  assert.equal(grid.getAttribute("aria-busy"), "true");
  assert.ok(summary.textContent);
});

test("remote catalog failure stays visible and accessible inside the dialog", async () => {
  // Given
  const { createReferenceLoadStatus } = await dialogModule;
  const { grid, root, summary } = createReferenceStatusFixture();
  const status = createReferenceLoadStatus(root);

  // When
  status.error(new Error("catalog unavailable"));

  // Then
  assert.equal(summary.dataset.aiSearchState, "error");
  assert.equal(summary.getAttribute("aria-live"), "assertive");
  assert.equal(summary.getAttribute("aria-busy"), "false");
  assert.equal(grid.getAttribute("aria-busy"), "false");
  assert.equal(summary.textContent, "catalog unavailable");
});

test("the search coordinator exposes remote activation state inside its dialog", () => {
  // Given / When
  const search = fs.readFileSync(path.join(__dirname, "..", "js", "ai-reference-search.js"), "utf8");

  // Then
  assert.match(search, /createReferenceLoadStatus\(overlay\)/);
  assert.match(search, /source\s*=\s*nextSource;\s*render\(\);/);
  assert.match(search, /referenceLoadStatus\.loading\(\)/);
  assert.match(search, /referenceLoadStatus\.error\(error\)/);
});

async function runLocalLifecycle(kind) {
  const policy = await policyModule;
  const sources = await sourceModule;
  const { migrate, serialize } = await projectModule;
  const { rankPdfPages } = await pdfSearchModule;
  const transport = createForbiddenTransportRecorder();
  await policy.activateReferenceSource("local", {
    loadRemote: transport.ports.networkRequest,
    onRemoteLoad: transport.ports.networkRequest,
  });
  const imageData = "data:image/png;base64,U1lOVEhFVElD";
  const pdfBytes = Uint8Array.from([37, 80, 68, 70]);
  let assets;
  let previewImage;
  if (kind === "browser") {
    const image = { name: "shape.png", webkitRelativePath: "lesson/shape.png", size: 9, lastModified: 1, data: imageData };
    const pdf = { name: "lesson.pdf", webkitRelativePath: "lesson/lesson.pdf", size: 4, lastModified: 2,
      arrayBuffer: async () => pdfBytes.buffer };
    assets = sources.sourcesFromWebFiles([image, pdf]);
    const PreviousFileReader = global.FileReader;
    global.FileReader = class {
      readAsDataURL(file) { this.result = file.data; queueMicrotask(() => this.onload()); }
    };
    try { previewImage = await sources.readWebImage(assets.images[0]); }
    finally { global.FileReader = PreviousFileReader; }
  } else {
    const desktop = {
      readLocalImage: async () => imageData,
      readLocalPdf: async () => pdfBytes,
      send: transport.ports.modelSend,
      attachmentIpc: transport.ports.attachmentIpc,
      toolTransmission: transport.ports.toolTransmission,
    };
    assets = sources.sourcesFromDesktopResult({
      items: [{ path: "C:\\lesson\\shape.png", name: "shape.png", relativePath: "lesson/shape.png", kind: "image" }],
      pdfs: [{ path: "C:\\lesson\\lesson.pdf", name: "lesson.pdf", relativePath: "lesson/lesson.pdf", kind: "pdf" }],
    }, desktop);
    previewImage = await desktop.readLocalImage(assets.images[0].path);
  }
  const indexedBytes = Array.from(new Uint8Array(await assets.pdfs[0].read()));
  const match = rankPdfPages([
    { id: "synthetic:1", documentId: "synthetic", name: "lesson.pdf", pageNumber: 1, text: "alpha prism" },
    { id: "synthetic:2", documentId: "synthetic", name: "lesson.pdf", pageNumber: 2, text: "beta mirror" },
  ], "mirror", 5)[0];
  const opened = migrate({ version: "0.17", pages: [{ id: "page-1", name: "1", objects: [], guides: [], layers: [],
    artboard: { w: 90, h: 60 } }], activePageId: "page-1" });
  const saved = serialize({ ...opened, objects: [], guides: [], layers: [], artboard: { w: 90, h: 60 } });
  return {
    outcome: {
      images: assets.images.map((item) => item.relativePath),
      pdfs: assets.pdfs.map((item) => item.relativePath),
      indexedBytes,
      matchedPage: match.pageNumber,
      previewImage,
      savedPage: saved.activePageId,
    },
    transportCalls: transport.calls,
  };
}

test("browser and Electron local open index search preview and save outcomes match without transmission", async () => {
  // Given
  const browser = await runLocalLifecycle("browser");

  // When
  const desktop = await runLocalLifecycle("desktop");

  // Then
  assertBrowserDesktopParity(assert, browser, desktop);
});

test("the search UI delegates local additions to the confirmed handoff gate", () => {
  // Given / When
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "ai-reference-search.js"), "utf8");

  // Then
  assert.match(source, /handoffLocalReference\(/);
});

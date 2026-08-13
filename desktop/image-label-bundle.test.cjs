const assert = require("node:assert/strict");
const test = require("node:test");

test("diagram image and confirmed labels insert as one undoable bundle", async () => {
  const previousImage = global.Image;
  global.Image = class { set src(_value) { this.naturalWidth = 100; this.naturalHeight = 80; queueMicrotask(() => this.onload()); } };
  try {
    const { createStore } = await import("../js/store.js");
    const { insertImageLabelBundleFromSrc } = await import("../js/image-paste.js");
    const page = { id: "page-1", name: "페이지 1", meta: { number: "", points: "" }, objects: [], guides: [],
      layers: [{ id: 1, name: "레이어 1", visible: true }], artboard: { w: 210, h: 297 } };
    const state = createStore({ pages: [page], activePageId: page.id, objects: [], guides: [], layers: page.layers,
      undoStack: [], redoStack: [], selectedIds: [], targetedId: null, activeTool: "V", activeLayerId: 1,
      artboard: page.artboard, viewBox: { x: 0, y: 0, w: 210, h: 297 } });
    const inserted = await insertImageLabelBundleFromSrc(state, "data:image/png;base64,AA==", {
      provenance: { schema: "5e-reference-provenance@1", fileName: "시험.pdf" },
      candidates: [{ id: "c1", text: "A", confirmed: true, original: { x: .1, y: .1, w: .1, h: .1 },
        target: { x: .4, y: .5 }, labelPosition: { x: .6, y: .3 }, detector: "manual", confidence: null }],
    });
    assert.equal(state.get().undoStack.length, 1);
    assert.deepEqual(state.get().undoStack[0], []);
    assert.deepEqual(state.get().objects.map(({ type }) => type), ["image", "labeler"]);
    assert.equal(state.get().objects[0].referenceProvenance.fileName, "시험.pdf");
    assert.equal(state.get().objects[1].sourceLabel.connection.diagramObjectId, inserted.imageId);
    assert.deepEqual(new Set(state.get().selectedIds), new Set([inserted.imageId, ...inserted.labelIds]));
    const { serialize } = await import("../js/project-io.js");
    const saved = JSON.parse(JSON.stringify(serialize(state.get())));
    assert.equal(saved.pages[0].objects[0].referenceProvenance.fileName, "시험.pdf");
    assert.equal(saved.pages[0].objects[1].sourceLabel.original.text, "A");
    assert.equal(saved.pages[0].objects[1].sourceLabel.confirmation.confirmedByUser, true);
  } finally { global.Image = previousImage; }
});

test("plain diagram insertion retains safe output provenance", async () => {
  const previousImage = global.Image;
  global.Image = class { set src(_value) { this.naturalWidth = 100; this.naturalHeight = 80; queueMicrotask(() => this.onload()); } };
  try {
    const { createStore } = await import("../js/store.js");
    const { insertImageFromSrc } = await import("../js/image-paste.js");
    const state = createStore({ objects: [], undoStack: [], redoStack: [], selectedIds: [], targetedId: null,
      activeTool: "V", activeLayerId: 1, artboard: { w: 210, h: 297 }, viewBox: { x: 0, y: 0, w: 210, h: 297 } });
    await insertImageFromSrc(state, "data:image/png;base64,AA==", {
      provenance: { schema: "5e-reference-provenance@1", fileName: "시험.pdf", pageNumber: 2 },
    });
    assert.deepEqual(state.get().objects[0].referenceProvenance,
      { schema: "5e-reference-provenance@1", fileName: "시험.pdf", pageNumber: 2 });
  } finally { global.Image = previousImage; }
});

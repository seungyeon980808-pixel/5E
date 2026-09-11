const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

function documentState(value) {
  return normalize({
    objects: value.objects,
    guides: value.guides,
    artboard: value.artboard,
    layers: value.layers,
    groups: value.groups,
  });
}

function loadDocumentHistory() {
  let source = fs.readFileSync(path.join(root, "js/document-history.js"), "utf8");
  source = source.replace(/\bexport\s+/g, "");
  source += "\nglobalThis.__testExports = { captureDocumentSnapshot, commitDocumentHistory, isDocumentSnapshot };";
  const sandbox = { JSON };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "js/document-history.js" });
  return sandbox.__testExports;
}

function loadTransform() {
  let source = fs.readFileSync(path.join(root, "js/transform.js"), "utf8");
  source = source.replace(/^import\s+[\s\S]*?;\r?\n/gm, "").replace(/\bexport\s+/g, "");
  source += "\nglobalThis.__testExports = { undo, redo };";
  const sandbox = {
    console, Date, Map, Set, JSON, Number, Object, String, Array,
    window: { addEventListener() {} },
    document: { querySelector() { return null; } },
    screenToWorld() { return { x: 0, y: 0 }; }, getRenderScale() { return 1; },
    resolveSnap() {}, resolveEndpointSnap() {}, resolveRadialCenterSnap() {},
    setSnapPreview() {}, setSmartGuides() {}, pendulumBBox() {}, pickSelectableObjectFromEvent() {},
    isObjectSelectable() {}, IMAGE_EDIT_SESSION_ID: "image-edit-session", SHAPE_TYPES: new Set(),
    SIZE_TYPES: new Set(), FLIP_TYPES: new Set(), POINT_ARRAY_TYPES: new Set(),
    ENDPOINT_HANDLE_TYPES: new Set(), TEXT_MEASURED_TYPES: new Set(), snapKey() {}, modKey() {},
  };
  sandbox.globalThis = sandbox;
  const pageHistory = fs.readFileSync(path.join(root, "js/page-history.js"), "utf8").replace(/\bexport\s+/g, "");
  vm.runInNewContext(pageHistory, sandbox);
  vm.runInNewContext(source, sandbox, { filename: "js/transform.js" });
  return sandbox.__testExports;
}

function loadArtboardResize(history) {
  let source = fs.readFileSync(path.join(root, "js/artboard-resize.js"), "utf8");
  source = source.replace(/^import\s+[\s\S]*?;\r?\n/gm, "").replace(/\bexport\s+/g, "");
  source += "\nglobalThis.__testExports = { applyArtboardBounds };";
  const sandbox = {
    ...history,
    translateObject(object, dx, dy) {
      object.x += dx;
      object.y += dy;
    },
    artboardChangeFromBounds(bounds) {
      if (!bounds || !(bounds.w > 0) || !(bounds.h > 0)) return null;
      const centerX = bounds.x + bounds.w / 2;
      const centerY = bounds.y + bounds.h / 2;
      return { artboard: { w: bounds.w, h: bounds.h }, dx: -centerX, dy: -centerY };
    },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "js/artboard-resize.js" });
  return sandbox.__testExports;
}

function createState() {
  const value = {
    objects: [
      { id: "a", type: "rect", x: 1, y: 2, w: 3, h: 4, groupId: 7, layerId: 1 },
      { id: "b", type: "rect", x: 6, y: 7, w: 2, h: 2, groupId: 7, layerId: 1 },
    ],
    guides: [{ id: "guide-a", axis: "x", position: 5 }],
    artboard: { w: 90, h: 60 },
    layers: [{ id: 1, name: "Layer", visible: true }],
    groups: [{ id: 7, memberIds: ["a", "b"] }],
    selectedIds: ["a"], selectedGuideId: "guide-a", targetedId: null,
    undoStack: [], redoStack: [], artboardResizeMode: true,
  };
  return { value, get: () => value, update(fn) { fn(value); } };
}

test("resize has a symmetric document inverse beside legacy object history", () => {
  const transform = loadTransform();
  const history = loadDocumentHistory();
  const artboard = loadArtboardResize(history);
  const state = createState();
  const original = documentState(state.value);

  state.value.undoStack.push(structuredClone(state.value.objects));
  state.value.objects[0].x = 11;
  const moved = documentState(state.value);
  assert.equal(artboard.applyArtboardBounds(state, { x: 10, y: 10, w: 40, h: 30 }), true);
  const resized = documentState(state.value);

  transform.undo(state);
  assert.deepEqual(documentState(state.value), moved);
  transform.undo(state);
  assert.deepEqual(documentState(state.value), original);

  transform.redo(state);
  assert.deepEqual(documentState(state.value), moved);
  transform.redo(state);
  assert.deepEqual(documentState(state.value), resized);
});

test("document helper commits one tagged pre-edit snapshot and clears redo", () => {
  const history = loadDocumentHistory();
  const state = createState().value;
  const before = history.captureDocumentSnapshot(state);
  state.objects[0].x = 22;
  state.guides[0].position = 9;
  state.artboard = { w: 70, h: 50 };
  state.layers[0].visible = false;
  state.redoStack.push([{ id: "future" }]);

  assert.equal(history.commitDocumentHistory(state, before), true);
  assert.equal(state.undoStack.length, 1);
  assert.equal(state.undoStack[0].kind, "document");
  assert.deepEqual(normalize(state.undoStack[0]), normalize(before));
  assert.deepEqual(normalize(state.redoStack), []);
});

test("invalid and unchanged resize bounds do not create history or clear redo", () => {
  const history = loadDocumentHistory();
  const artboard = loadArtboardResize(history);
  const state = createState();
  const redo = [[{ id: "future" }]];
  state.value.redoStack = structuredClone(redo);

  assert.equal(artboard.applyArtboardBounds(state, { x: 0, y: 0, w: 0, h: 10 }), false);
  assert.equal(state.value.undoStack.length, 0);
  assert.deepEqual(state.value.redoStack, redo);
  assert.equal(artboard.applyArtboardBounds(state, { x: -45, y: -30, w: 90, h: 60 }), false);
  assert.equal(state.value.undoStack.length, 0);
  assert.deepEqual(state.value.redoStack, redo);
  assert.equal(state.value.artboardResizeMode, false);
});

test("legacy object-array entries remain symmetric and leave document fields alone", () => {
  const transform = loadTransform();
  const state = createState();
  const documentFields = normalize({
    guides: state.value.guides,
    artboard: state.value.artboard,
    layers: state.value.layers,
  });
  const before = structuredClone(state.value.objects);
  state.value.undoStack.push(before);
  state.value.objects[0].x = 44;

  transform.undo(state);
  assert.equal(state.value.objects[0].x, 1);
  assert.deepEqual(normalize({ guides: state.value.guides, artboard: state.value.artboard, layers: state.value.layers }), documentFields);
  transform.redo(state);
  assert.equal(state.value.objects[0].x, 44);
  assert.deepEqual(normalize({ guides: state.value.guides, artboard: state.value.artboard, layers: state.value.layers }), documentFields);
});

test("malformed tagged entries are rejected without consuming history", () => {
  const history = loadDocumentHistory();
  const transform = loadTransform();
  const state = createState();
  const malformed = { kind: "document", objects: [] };

  assert.equal(history.commitDocumentHistory(state.value, malformed), false);
  state.value.undoStack.push(malformed);
  const before = normalize(state.value);
  transform.undo(state);
  assert.deepEqual(normalize(state.value), before);
});

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function loadTransform(platformName = "Win32") {
  let source = fs.readFileSync(path.join(root, "js/transform.js"), "utf8");
  source = source.replace(/^import\s+[\s\S]*?;\r?\n/gm, "").replace(/\bexport\s+/g, "");
  source += "\nglobalThis.__testExports = { initTransform, undo, redo };";
  const listeners = [];
  const sandbox = {
    console, Date, Map, Set, JSON, Number, Object, String, Array,
    window: { addEventListener(type, fn) { if (type === "keydown") listeners.push(fn); } },
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
  sandbox.navigator = { platform: platformName };
  sandbox.document.addEventListener = () => {};
  sandbox.OBJECT_TYPE_IDS = ["rect", "image"];
  sandbox.showAlert = () => {};
  const platform = fs.readFileSync(path.join(root, "js/platform.js"), "utf8").replace(/export\s*\{[^}]+\};?/g, "");
  vm.runInNewContext(platform, sandbox);
  const clipboard = fs.readFileSync(path.join(root, "js/editor-clipboard.js"), "utf8")
    .replace(/^import\s+[\s\S]*?;\r?\n/gm, "").replace(/\bexport\s+/g, "");
  vm.runInNewContext(clipboard, sandbox);
  vm.runInNewContext(source, sandbox, { filename: "js/transform.js" });
  return { listeners, initTransform: sandbox.__testExports.initTransform, undo: sandbox.__testExports.undo, redo: sandbox.__testExports.redo, sandbox, svg: { addEventListener() {} } };
}

function stateWithObjects(selectedIds = ["live"]) {
  const value = {
    objects: [{ id: "live", type: "rect", locked: false }, { id: "locked", type: "rect", locked: true }],
    selectedIds, undoStack: [], redoStack: [], activeTool: "V", groups: [],
  };
  return { value, get: () => value, update(fn) { fn(value); } };
}

function invokeObjectKey(event, modal = false) {
  const runtime = loadTransform();
  runtime.sandbox.document.querySelector = () => modal ? {} : null;
  const state = stateWithObjects(["live", "locked"]);
  runtime.initTransform(runtime.svg, state);
  runtime.listeners.at(-1)(event);
  return { value: state.value, runtime, state };
}

test("Delete and Backspace remove only unlocked selected objects and record undo", () => {
  for (const key of ["Delete", "Backspace"]) {
    const { value, runtime, state } = invokeObjectKey({ key, target: { tagName: "BODY" }, preventDefault() {} });
    assert.deepEqual(Array.from(value.objects, (o) => o.id), ["locked"]);
    assert.equal(value.selectedIds.length, 0);
    assert.equal(value.undoStack.length, 1);
    runtime.undo(state);
    assert.deepEqual(Array.from(value.objects, (o) => o.id), ["live", "locked"]);
    runtime.redo(state);
    assert.deepEqual(Array.from(value.objects, (o) => o.id), ["locked"]);
  }
});

test("composing input, editor targets, SELECT, and visible modal preserve objects", () => {
  const targets = [{ tagName: "INPUT" }, { tagName: "TEXTAREA" }, { tagName: "SELECT" }, { tagName: "DIV", isContentEditable: true }];
  for (const target of targets) assert.equal(invokeObjectKey({ key: "Backspace", target, preventDefault() {} }).value.objects.length, 2);
  assert.equal(invokeObjectKey({ key: "Backspace", target: { tagName: "BODY" }, isComposing: true, preventDefault() {} }).value.objects.length, 2);
  assert.equal(invokeObjectKey({ key: "Backspace", target: { tagName: "BODY" }, preventDefault() {} }, true).value.objects.length, 2);
});

function extractRulerHandler() {
  const source = fs.readFileSync(path.join(root, "js/ruler.js"), "utf8");
  const start = source.indexOf('window.addEventListener("keydown", (e) => {');
  const bodyStart = source.indexOf("(e) => {", start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}" && --depth === 0) {
      const callback = source.slice(bodyStart, i + 1);
      const history = loadHistoryForRuler();
      return (state, document) => vm.runInNewContext(`(${callback})`, { state, document, ...history });
    }
  }
  throw new Error("ruler key handler not found");
}

test("guide deletion accepts Backspace and leaves guarded events uncaptured", () => {
  const invoke = extractRulerHandler();
  for (const key of ["Delete", "Backspace"]) {
    const value = { objects: [], guides: [{ id: "g" }], artboard: { w: 1, h: 1 }, layers: [], undoStack: [], redoStack: [], selectedGuideId: "g" };
    const state = { get: () => value, update(fn) { fn(value); } };
    let stopped = false;
    invoke(state, { querySelector() { return null; } })({ key, target: { tagName: "BODY" }, isComposing: false, preventDefault() {}, stopImmediatePropagation() { stopped = true; } });
    assert.equal(value.guides.length, 0);
    assert.equal(stopped, true);
  }
  for (const guard of [
    { target: { tagName: "INPUT" } },
    { target: { tagName: "TEXTAREA" } },
    { target: { tagName: "SELECT" } },
    { target: { tagName: "DIV", isContentEditable: true } },
    { target: { tagName: "BODY" }, isComposing: true },
    { target: { tagName: "BODY" }, modal: true },
  ]) {
    const value = { objects: [], guides: [{ id: "g" }], artboard: { w: 1, h: 1 }, layers: [], undoStack: [], redoStack: [], selectedGuideId: "g" };
    const state = { get: () => value, update(fn) { fn(value); } };
    let captured = false;
    invoke(state, { querySelector() { return guard.modal ? {} : null; } })({ key: "Backspace", ...guard, preventDefault() {}, stopImmediatePropagation() { captured = true; } });
    assert.equal(value.guides.length, 1);
    assert.equal(captured, false, "guarded key must not be captured");
  }
});

function normalizeRuler(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadStoreForRuler() {
  let source = fs.readFileSync(path.join(root, "js/store.js"), "utf8");
  source = source.replace(/\bexport\s+/g, "");
  source += "\nglobalThis.__testExports = { createStore };";
  const sandbox = { Set };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "js/store.js" });
  return sandbox.__testExports.createStore;
}

function loadHistoryForRuler() {
  let source = fs.readFileSync(path.join(root, "js/document-history.js"), "utf8");
  source = source.replace(/\bexport\s+/g, "");
  source += "\nglobalThis.__testExports = { captureDocumentSnapshot, commitDocumentHistory };";
  const sandbox = { JSON };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "js/document-history.js" });
  return sandbox.__testExports;
}

function loadRuler(history) {
  let source = fs.readFileSync(path.join(root, "js/ruler.js"), "utf8");
  source = source.replace(/^import\s+[\s\S]*?;\r?\n/gm, "").replace(/\bexport\s+/g, "");
  source += "\nglobalThis.__testExports = { initRuler };";
  const windowListeners = new Map();
  const canvas = () => ({
    style: {}, clientWidth: 0, clientHeight: 0,
    addEventListener() {}, getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
  });
  const horizontal = canvas();
  const vertical = canvas();
  const sandbox = {
    ...history, console, Date, Math, Number, JSON, Object, Array, Set,
    window: {
      devicePixelRatio: 1,
      addEventListener(type, fn) {
        const handlers = windowListeners.get(type) || [];
        handlers.push(fn);
        windowListeners.set(type, handlers);
      },
    },
    document: {
      getElementById(id) { return id === "ruler-h" ? horizontal : id === "ruler-v" ? vertical : null; },
      querySelector() { return null; },
    },
    DOMPoint: class DOMPoint {},
    ResizeObserver: class ResizeObserver { observe() {} },
    requestAnimationFrame(fn) { fn(); },
    getComputedStyle() { return { getPropertyValue() { return ""; } }; },
    getRenderScale() { return 1; }, isSpaceHeld() { return false; }, pickSelectableObjectAtPoint() { return null; },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "js/ruler.js" });
  const svgListeners = new Map();
  const svg = {
    style: {},
    addEventListener(type, fn) {
      const handlers = svgListeners.get(type) || [];
      handlers.push(fn);
      svgListeners.set(type, handlers);
    },
    getScreenCTM() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
  };
  return { initRuler: sandbox.__testExports.initRuler, windowListeners, svgListeners, svg };
}

function guideHistoryState(selectedGuideId = "guide-a") {
  const value = {
    objects: [{ id: "object-a", type: "rect", x: 4, y: 8 }],
    guides: [{ id: "guide-a", axis: "x", position: 12 }],
    artboard: { w: 90, h: 60 },
    layers: [{ id: 1, name: "Layer", visible: true }],
    selectedIds: ["object-a"], selectedGuideId, targetedId: "object-a",
    undoStack: [], redoStack: [{ kind: "document", objects: [], guides: [], artboard: { w: 1, h: 1 }, layers: [] }],
  };
  return { value, get: () => value, update(fn) { fn(value); }, subscribe() {} };
}

test("initRuler guide Delete and Backspace commit one document snapshot with symmetric undo redo", () => {
  const history = loadHistoryForRuler();
  const transform = loadTransform();
  for (const key of ["Delete", "Backspace"]) {
    const state = guideHistoryState();
    const expected = normalizeRuler({ objects: state.value.objects, guides: state.value.guides, artboard: state.value.artboard, layers: state.value.layers });
    const runtime = loadRuler(history);
    runtime.initRuler(runtime.svg, state);
    runtime.svgListeners.get("mousedown")[0]({ button: 0, target: { dataset: { guideId: "guide-a" } }, preventDefault() {}, stopPropagation() {} });
    runtime.windowListeners.get("keydown")[0]({ key, target: { tagName: "BODY" }, preventDefault() {}, stopImmediatePropagation() {} });

    assert.equal(state.value.undoStack.length, 1);
    assert.equal(state.value.undoStack[0].kind, "document");
    assert.deepEqual(normalizeRuler(state.value.redoStack), []);
    assert.deepEqual(normalizeRuler({ objects: state.value.objects, guides: state.value.guides, artboard: state.value.artboard, layers: state.value.layers }), { ...expected, guides: [] });
    transform.undo(state);
    assert.deepEqual(normalizeRuler({ objects: state.value.objects, guides: state.value.guides, artboard: state.value.artboard, layers: state.value.layers }), expected);
    transform.redo(state);
    assert.deepEqual(normalizeRuler({ objects: state.value.objects, guides: state.value.guides, artboard: state.value.artboard, layers: state.value.layers }), { ...expected, guides: [] });
  }
});

test("initRuler missing or nonselected guide deletion preserves history and redo", () => {
  const history = loadHistoryForRuler();
  for (const selectedGuideId of [null, "missing-guide"]) {
    const state = guideHistoryState(selectedGuideId);
    const redo = normalizeRuler(state.value.redoStack);
    const runtime = loadRuler(history);
    runtime.initRuler(runtime.svg, state);
    runtime.windowListeners.get("keydown")[0]({ key: "Backspace", target: { tagName: "BODY" }, preventDefault() {}, stopImmediatePropagation() {} });
    assert.equal(state.value.undoStack.length, 0);
    assert.deepEqual(normalizeRuler(state.value.redoStack), redo);
    assert.equal(state.value.guides.length, 1);
  }
});

test("initRuler guide deletion notifies synchronous store subscribers with committed history", () => {
  const createStore = loadStoreForRuler();
  const state = createStore(guideHistoryState().value);
  const observed = [];
  state.subscribe((s) => observed.push({
    guides: normalizeRuler(s.guides),
    undoLength: s.undoStack.length,
    redoLength: s.redoStack.length,
  }));
  const runtime = loadRuler(loadHistoryForRuler());
  runtime.initRuler(runtime.svg, state);
  runtime.svgListeners.get("mousedown")[0]({ button: 0, target: { dataset: { guideId: "guide-a" } }, preventDefault() {}, stopPropagation() {} });
  observed.length = 0;
  runtime.windowListeners.get("keydown")[0]({ key: "Backspace", target: { tagName: "BODY" }, preventDefault() {}, stopImmediatePropagation() {} });

  assert.deepEqual(observed, [{ guides: [], undoLength: 1, redoLength: 0 }]);
});


test("Mac Command and Windows Control undo/redo respect IME, focus and platform", () => {
  for (const platform of ["Win32", "MacIntel"]) {
    const runtime = loadTransform(platform), state = stateWithObjects();
    state.value.undoStack = [[]];
    runtime.initTransform(runtime.svg, state);
    const primary = platform === "MacIntel" ? { metaKey: true } : { ctrlKey: true };
    const fire = (code, options = {}) => {
      const event = { key: "ㅈ", code, ...primary, target: null, preventDefault() { this.defaultPrevented = true; }, ...options };
      runtime.listeners.forEach(fn => fn(event));
    };
    fire("KeyZ", { isComposing: true }); assert.equal(state.value.objects.length, 2);
    fire("KeyZ", { target: { tagName: "SELECT" } }); assert.equal(state.value.objects.length, 2);
    fire("KeyZ"); assert.equal(state.value.objects.length, 0);
    if (platform === "Win32") fire("KeyY");
    else fire("KeyZ", { shiftKey: true });
    assert.equal(state.value.objects.length, 2);
  }
});

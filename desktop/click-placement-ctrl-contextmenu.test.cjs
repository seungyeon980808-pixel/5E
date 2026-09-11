const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function fixture() {
  let source = fs.readFileSync(path.join(root, "js/tools/click-placement.js"), "utf8");
  source = source.replace(/^import\s+[\s\S]*?;\r?\n/gm, "").replace(/\bexport\s+/g, "");
  source += "\nglobalThis.__testExports = { setupClickDrawing };";

  const svgListeners = new Map();
  const windowListeners = new Map();
  const value = {
    activeTool: "L", viewBox: {}, objects: [], selectedIds: [], targetedId: null,
    undoStack: [], redoStack: [], draft: null, activeLayerId: 1,
  };
  const state = { get: () => value, update(fn) { fn(value); } };
  const svg = {
    addEventListener(type, fn) {
      const handlers = svgListeners.get(type) || [];
      handlers.push(fn);
      svgListeners.set(type, handlers);
    },
  };
  const sandbox = {
    console, JSON, Math, Object, Array, Set,
    window: {
      addEventListener(type, fn) {
        const handlers = windowListeners.get(type) || [];
        handlers.push(fn);
        windowListeners.set(type, handlers);
      },
    },
    screenToWorld: (_svg, _viewBox, x, y) => ({ x, y }),
    getRenderScale: () => 1,
    snapAngle: (_anchor, point) => point,
    mathAngleDeg: () => 0, snappedDeg: value => value, normalizeSweep: value => value,
    setSnapPreview() {}, resolveEndpointSnap() {}, applyNewObjectStyleDefaults: value => value,
    DEFAULT_TEXT_FONT: "sans", DEFAULT_TEXT_SIZE_MM: 4, nextObjectId: () => "line-1",
    openLabelerTextEditor() {}, mathFromWorld() {}, worldFromMath() {}, makeDefaultCoordplane() {},
    snapKey: event => Boolean(event.ctrlKey || event.altKey), isSpaceHeld: () => false,
    makeLine: (p1, p2) => ({ type: "line", p1, p2 }),
    makeCircuit() {}, makePolyline() {}, makeCurve() {}, isCommittable: () => true,
    getSymbolProps: () => null, DEFAULT_STROKE_WIDTH: 0.3, MIN_SIZE: 0.1,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "js/tools/click-placement.js" });
  sandbox.__testExports.setupClickDrawing(svg, state);
  return { svgListeners, value };
}

function pointEvent(x, y, ctrlKey = false) {
  return { button: 0, clientX: x, clientY: y, ctrlKey, altKey: false, shiftKey: false, preventDefault() {} };
}

test("Control-primary contextmenu completes a snapped two-click line on macOS", () => {
  const { svgListeners, value } = fixture();
  svgListeners.get("click")[0](pointEvent(10, 10));
  for (const handler of svgListeners.get("contextmenu") || []) handler(pointEvent(40, 25, true));
  assert.equal(value.objects.length, 1, "the Control+click completion point must commit the line");
  assert.equal(value.activeTool, "V");
});

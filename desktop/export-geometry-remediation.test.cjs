const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const PREVIEW = path.join(ROOT, "preview", "js");

class ElementStub {
  constructor(tagName) {
    this.tagName = tagName;
    this.attrs = {};
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this.textContent = "";
  }

  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  removeAttribute(name) { delete this.attrs[name]; }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  querySelector(tagName) {
    return this.children.find((child) => child.tagName === tagName)
      || this.children.map((child) => child.querySelector?.(tagName)).find(Boolean)
      || null;
  }
  insertBefore(child, before) {
    this.children.splice(this.children.indexOf(before), 0, child);
  }
}

const documentStub = {
  activeElement: null,
  createElement: (tagName) => new ElementStub(tagName),
  createElementNS: (_namespace, tagName) => new ElementStub(tagName),
  createTextNode: (text) => ({ textContent: text }),
};

function readPreviewSource(relativePath) {
  return fs.readFileSync(path.join(PREVIEW, relativePath), "utf8");
}

function loadPreviewModule(relativePath, exportNames, dependencies = {}) {
  const source = readPreviewSource(relativePath)
    .replace(/^import\s[\s\S]*?from\s*["'][^"']+["'];\s*/gm, "")
    .replace(/^export\s*\{[\s\S]*?\};?\s*/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function|const|let)/g, "");
  const context = vm.createContext({
    Blob,
    DataView,
    Uint8Array,
    Uint32Array,
    console,
    document: documentStub,
    fetch: () => Promise.reject(new Error("test network disabled")),
    ...dependencies,
  });
  vm.runInContext(
    `${source}\nglobalThis.__testExports = { ${exportNames.join(", ")} };`,
    context,
    { filename: path.join(PREVIEW, relativePath), timeout: 1000 },
  );
  return { ...context.__testExports, context };
}

const noop = () => {};
const objectTypes = loadPreviewModule("object-types.js", [
  "SIZE_TYPES",
  "POINT_ARRAY_TYPES",
  "TEXT_MEASURED_TYPES",
  "zOrderObjects",
]);
const geometry = loadPreviewModule("geometry.js", [
  "segDist",
  "pointInTriangle",
  "evalBezier",
]);
const core = loadPreviewModule("render/core.js", [
  "SVG_NS",
  "grayHex",
  "applyDash",
  "makeArrowHead",
  "catmullRomPath",
  "catmullRomClosedPath",
  "roundedPolylinePath",
  "polylineMidpoint",
], { fillSvgTextWithRomanRuns: noop });
const renderSeams = {
  ...core,
  applyGlyphHalo: noop,
  applyObjectLabelFont: noop,
  DIM_HALO_RATIO: 0,
  fillTextWithRomanRuns: noop,
  LABEL_INK: "#000",
  LABEL_OPTICAL_CENTER_EM: 0,
  makeLabelKnockout: () => null,
  normalizeSrcRect: (value) => value,
  resolveFill: (object) => object.fillStyle === "solid" ? core.grayHex(object.fillLevel ?? 0) : "none",
  getSvgAsset: () => null,
  DEFAULT_TEXT_SIZE_MM: 3.5,
  estimateLabelBlock: (text, size, pad) => ({
    hw: String(text ?? "").length * size * 0.3 + pad,
    hh: size * 0.6 + pad,
  }),
  withBoxLabel: (element) => element,
  withLineLabel: (element) => element,
};
const shapes = loadPreviewModule("render/shapes.js", ["renderRect", "renderLine", "getLineDecorationBounds"], renderSeams);
const pick = loadPreviewModule("pick.js", ["getObjectBBox"], {
  ...geometry,
  ...objectTypes,
});

function renderObject(object) {
  if (object.type === "rect") return shapes.renderRect(object);
  if (object.type === "line") return shapes.renderLine(object);
  const element = new ElementStub(object.type);
  element.dataset.id = object.id;
  return element;
}

const exportModule = loadPreviewModule("svg-export.js", ["buildExportSvg", "getContentBounds"], {
  FS_DIR_SUPPORTED: false,
  getObjectBBox: pick.getObjectBBox,
  getLineDecorationBounds: shapes.getLineDecorationBounds,
  makeFillPattern: () => null,
  renderObject,
  zOrderObjects: objectTypes.zOrderObjects,
});
const chromosome = loadPreviewModule("render/chromosome.js", [
  "chromosomeGeometry",
  "chromosomeBBox",
], {
  ...renderSeams,
  DEFAULT_TEXT_SIZE_MM: 3.5,
  makeFillPattern: () => null,
  makeUprightLabel: () => null,
});

function exportOrder(objects, layers = []) {
  const svg = exportModule.buildExportSvg({ artboard: { w: 100, h: 100 }, layers, objects });
  return svg.querySelector("g").children.map((element) => element.dataset.id);
}

function lineFixture(overrides = {}) {
  return {
    id: "arrow",
    type: "line",
    p1: { x: 3, y: 5 },
    p2: { x: 35, y: 29 },
    lineMode: "arrow",
    lineStyle: "arrow",
    arrowHead: "both",
    arrowVariant: "both",
    strokeLevel: 0,
    strokeWidth: 1,
    ...overrides,
  };
}

function polygonPoints(element) {
  const points = [];
  const visit = (node) => {
    if (node.tagName === "polygon") {
      for (const pair of node.getAttribute("points").trim().split(/\s+/)) {
        const [x, y] = pair.split(",").map(Number);
        points.push({ x, y });
      }
    }
    for (const child of node.children) visit(child);
  };
  visit(element);
  return points;
}

function linePoints(element) {
  const points = [];
  const visit = (node) => {
    if (node.tagName === "line") {
      points.push(
        { x: Number(node.getAttribute("x1")), y: Number(node.getAttribute("y1")) },
        { x: Number(node.getAttribute("x2")), y: Number(node.getAttribute("y2")) },
      );
    }
    for (const child of node.children) visit(child);
  };
  visit(element);
  return points;
}

function pathPoints(element) {
  const points = [];
  const visit = (node) => {
    if (node.tagName === "path") {
      const numbers = node.getAttribute("d").match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
      for (let index = 0; index < numbers.length; index += 2) {
        points.push({ x: numbers[index], y: numbers[index + 1] });
      }
    }
    for (const child of node.children) visit(child);
  };
  visit(element);
  return points;
}

function commitInspectorValue(prop, initialValue, inputValue) {
  const inspectorSource = readPreviewSource("inspector/section-geometry.js");
  const propsStart = inspectorSource.indexOf("  const POSITIVE_SIZE_PROPS");
  const propsSource = inspectorSource.slice(propsStart, inspectorSource.indexOf("\n", propsStart));
  const rowSource = inspectorSource.slice(
    inspectorSource.indexOf("  function makePosRow("),
    inspectorSource.indexOf("\n  const xF"),
  );
  const state = {
    objects: [{ id: "shape", type: "rect", x: -4, y: -3, w: 20, h: 10, rotation: -15, [prop]: initialValue }],
    selectedIds: ["shape"],
    undoStack: [],
    redoStack: [],
  };
  const context = vm.createContext({
    document: documentStub,
    state: { get: () => state, update: (update) => update(state) },
  });
  vm.runInContext(`${propsSource}\n${rowSource}\nglobalThis.row = makePosRow("field", "${prop}", "0.1");`, context);
  context.row.inp.value = inputValue;
  context.row.inp.listeners.blur();
  return { state, rendered: shapes.renderRect(state.objects[0]) };
}

test("characterization: normal export preserves non-text array order and hidden filtering", () => {
  const first = { id: "first", type: "rect", x: 0, y: 0, w: 10, h: 10, strokeWidth: 0.2 };
  const hidden = { ...first, id: "hidden", layerId: 2 };
  const last = { ...first, id: "last", x: 20 };
  assert.deepEqual(exportOrder([first, hidden, last], [{ id: 2, visible: false }]), ["first", "last"]);
});

test("characterization: plain line content bounds include endpoints and half the stroke", () => {
  const line = lineFixture({ lineMode: "solid", lineStyle: "solid", arrowHead: "none" });
  const bounds = exportModule.getContentBounds({ objects: [line], layers: [] }, {}, 0);
  assert.deepEqual({ ...bounds }, { x: 2.5, y: 4.5, w: 33, h: 25 });
});

test("characterization: finite negative position and angle remain legal inspector values", () => {
  const xResult = commitInspectorValue("x", 1, "-12.5");
  const rotationResult = commitInspectorValue("rotation", 0, "-45");
  assert.equal(xResult.state.objects[0].x, -12.5);
  assert.equal(rotationResult.state.objects[0].rotation, -45);
  assert.equal(xResult.state.undoStack.length, 1);
  assert.equal(rotationResult.state.undoStack.length, 1);
});

test("characterization: normal chromosome geometry is finite and normalized", () => {
  const object = { type: "chromosome", p1: { x: 2, y: 3 }, p2: { x: 14, y: 19 } };
  const geometryResult = chromosome.chromosomeGeometry(object);
  const bounds = chromosome.chromosomeBBox(object);
  assert.ok(Math.abs(Math.hypot(geometryResult.ux, geometryResult.uy) - 1) < 1e-12);
  assert.ok([bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite));
  assert.ok(bounds.w < 100 && bounds.h < 100);
});

test("GEO160-001: export uses the editor's canonical text and formula top order", () => {
  const text = { id: "text", type: "text" };
  const formula = { id: "formula", type: "formula" };
  const shape = { id: "shape", type: "rect", x: 0, y: 0, w: 20, h: 20, strokeWidth: 0.2 };
  const creationOrders = [[text, formula, shape], [shape, text, formula]];
  for (const objects of creationOrders) {
    assert.deepEqual(exportOrder(objects), Array.from(objectTypes.zOrderObjects(objects), (object) => object.id));
  }
  assert.deepEqual(
    exportOrder([text, { ...formula, layerId: 2 }, shape], [{ id: 2, visible: false }]),
    ["shape", "text"],
  );
});

test("GEO160-002: zero-margin content bounds contain rotated bidirectional arrow ink", () => {
  const directions = [
    [{ x: 0, y: 0 }, { x: 40, y: 0 }],
    [{ x: 0, y: 0 }, { x: 0, y: 40 }],
    [{ x: 3, y: 5 }, { x: 42.61, y: 10.57 }],
  ];
  const styles = [
    { lineMode: "arrow", lineStyle: "arrow", arrowHead: "end", arrowVariant: "right" },
    { lineMode: "arrow", lineStyle: "arrow", arrowHead: "start", arrowVariant: "left" },
    { lineMode: "arrow", lineStyle: "arrow", arrowHead: "both", arrowVariant: "both" },
    { lineMode: "middleArrow", lineStyle: "middleArrow", arrowHead: "none", arrowVariant: "right" },
    { lineMode: "midInward", lineStyle: "midInward", arrowHead: "none" },
    { lineMode: "lengthArrow", lineStyle: "lengthArrow", arrowHead: "none", dimensionVariant: "bothBars" },
  ];
  for (const strokeWidth of [0.2, 1, 2]) {
    for (const [p1, p2] of directions) {
      for (const style of styles) {
        const line = lineFixture({ p1, p2, strokeWidth, ...style });
      const bounds = exportModule.getContentBounds({ objects: [line], layers: [] }, {}, 0);
        const rendered = shapes.renderLine(line);
        const points = [...polygonPoints(rendered), ...linePoints(rendered)];
      assert.ok(points.length >= 6, "both arrowheads must render");
      for (const point of points) {
        assert.ok(point.x >= bounds.x && point.x <= bounds.x + bounds.w,
          `stroke ${strokeWidth}: arrow x=${point.x} outside ${JSON.stringify(bounds)}`);
        assert.ok(point.y >= bounds.y && point.y <= bounds.y + bounds.h,
          `stroke ${strokeWidth}: arrow y=${point.y} outside ${JSON.stringify(bounds)}`);
      }
      }
    }
  }
});

test("GEO160-002: zero-margin bounds contain normal, short, rotated, and zero-length wavy arrows", () => {
  const cases = [
    [{ x: 0, y: 0 }, { x: 40, y: 0 }],
    [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    [{ x: 2, y: 3 }, { x: 2.6, y: 3.8 }],
    [{ x: -4, y: 7 }, { x: -4, y: 7 }],
  ];
  for (const [p1, p2] of cases) {
    const line = lineFixture({
      p1, p2, lineMode: "wavyArrow", lineStyle: "wavyArrow", arrowHead: "none",
      strokeWidth: 1, waveLength: 5, tailRatio: 0.35, waveAmp: 1.1,
    });
    const bounds = exportModule.getContentBounds({ objects: [line], layers: [] }, {}, 0);
    const rendered = shapes.renderLine(line);
    const points = [...pathPoints(rendered), ...polygonPoints(rendered), ...linePoints(rendered)];
    assert.ok(points.length > 0, "wavy arrow must emit visible geometry");
    for (const point of points) {
      assert.ok(point.x >= bounds.x && point.x <= bounds.x + bounds.w,
        `wavy x=${point.x} outside ${JSON.stringify(bounds)} for ${JSON.stringify({ p1, p2 })}`);
      assert.ok(point.y >= bounds.y && point.y <= bounds.y + bounds.h,
        `wavy y=${point.y} outside ${JSON.stringify(bounds)} for ${JSON.stringify({ p1, p2 })}`);
    }
  }
});

test("GEO160-004: invalid dimensions preserve the model and create no undo entry", () => {
  for (const [prop, value] of [
    ["w", "-10"], ["h", "0"], ["w", ""], ["h", "Infinity"],
    ["radius", "-1"], ["size", "0"], ["length", "NaN"], ["thickness", "-0.1"],
  ]) {
    const initial = prop === "w" ? 20 : 10;
    const result = commitInspectorValue(prop, initial, value);
    assert.equal(result.state.objects[0][prop], initial, `${prop}=${value} must be rejected`);
    assert.equal(result.state.undoStack.length, 0, `${prop}=${value} must not create undo`);
    const attribute = prop === "w" ? "width" : "height";
    assert.ok(Number(result.rendered.getAttribute(attribute)) > 0);
  }
  const unchanged = commitInspectorValue("w", 20, "20");
  assert.equal(unchanged.state.undoStack.length, 0, "unchanged valid size must not create undo");
});

test("GEO160-008: zero and tiny chromosome endpoints stay normalized and bounded", () => {
  for (const length of [0, 0.00001, 0.0001, 20]) {
    const object = { type: "chromosome", p1: { x: 0, y: 0 }, p2: { x: 0, y: length } };
    const geometryResult = chromosome.chromosomeGeometry(object);
    const bounds = chromosome.chromosomeBBox(object);
    assert.ok(Math.abs(Math.hypot(geometryResult.ux, geometryResult.uy) - 1) < 1e-9,
      `length ${length}: axis must be unit length`);
    assert.ok([bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite),
      `length ${length}: bbox must be finite`);
    assert.ok(bounds.w <= 100 && bounds.h <= 100,
      `length ${length}: bbox must remain bounded, got ${JSON.stringify(bounds)}`);
  }
});

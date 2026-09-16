const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function renderer() {
  const source = fs.readFileSync(path.join(__dirname, "../js/render/annotations.js"), "utf8")
    .replace(/^import\s+[\s\S]*?;\r?\n/gm, "")
    .replace(/^export\s*\{[^}]*\};?/gm, "");
  const sandbox = {
    SVG_NS: "svg", DEFAULT_TEXT_SIZE_MM: 4, DEFAULT_TEXT_FONT: "Dotum",
    grayHex: () => "#000", hasStyledTextRuns: () => false,
    estimateLabelBlock: (_text, _size, pad) => ({ hw: 5 + pad, hh: 2 + pad }),
    makeUprightLabel: () => null,
    document: { createElementNS(_ns, tag) {
      return { tag, dataset: {}, attrs: {}, children: [],
        setAttribute(key, value) { this.attrs[key] = value; },
        appendChild(child) { this.children.push(child); } };
    } },
  };
  vm.runInNewContext(source + "\nglobalThis.render = renderLabeler;", sandbox);
  return sandbox.render;
}

const label = () => ({ type: "labeler", p1: { x: 0, y: 0 }, p2: { x: 50, y: 20 },
  elbow: { x: 20, y: 20 }, labelSize: 4, text: "가" });

test("five anchors share exactly one elbow-to-label segment", () => {
  const object = { ...label(), p3: { x: 0, y: 10 }, extraAnchors: [
    { x: 0, y: 20 }, { x: 0, y: 30 }, { x: 0, y: 40 },
  ] };
  const lines = renderer()(object).children;
  assert.equal(lines.length, 6);
  assert.equal(lines.filter(line => line.attrs.x1 === 20 && line.attrs.y1 === 20).length, 1);
  for (const line of lines.slice(0, 5)) {
    assert.equal(line.attrs.x2, 20);
    assert.equal(line.attrs.y2, 20);
  }
});

test("label gap defaults to zero and adjusts only the label-facing end", () => {
  const render = renderer();
  const end = object => render(object).children.at(-1).attrs.x2;
  assert.equal(end(label()), 45);
  assert.equal(end({ ...label(), labelGap: 0 }), 45);
  assert.equal(end({ ...label(), labelGap: 3 }), 42);
  assert.equal(end({ ...label(), labelGap: -1 }), 45);
  assert.equal(end({ ...label(), labelGap: Infinity }), 45);
});

test("legacy second anchor without elbow still renders both leaders", () => {
  const object = { ...label(), elbow: null, p3: { x: 0, y: 40 } };
  assert.equal(renderer()(object).children.length, 2);
});

function transforms() {
  const source = fs.readFileSync(path.join(__dirname, "../js/transform.js"), "utf8");
  const names = ["applyDelta", "handleEndpointPoint", "setHandleEndpointPoint", "applyHandleDeltaBase", "snapLineEndpoint"];
  const functions = names.map(name => {
    const start = source.indexOf(`function ${name}(`);
    return source.slice(start, source.indexOf("\n}", start) + 2);
  }).join("\n");
  const sandbox = { SIZE_TYPES: new Set(), TEXT_MEASURED_TYPES: new Set(), ENDPOINT_HANDLE_TYPES: new Set(["labeler"]) };
  vm.runInNewContext(functions, sandbox);
  return sandbox;
}

test("moving a label preserves every extra anchor offset", () => {
  const object = { ...label(), extraAnchors: [{ x: -10, y: 40 }, { x: -20, y: 50 }] };
  const original = structuredClone(object);
  transforms().applyDelta(object, original, 3, -2);
  assert.equal(object.extraAnchors[0].x, -7);
  assert.equal(object.extraAnchors[1].y, 48);
  assert.deepEqual(original.extraAnchors, [{ x: -10, y: 40 }, { x: -20, y: 50 }]);
});

test("extra anchor handle moves and snaps independently of label position", () => {
  const api = transforms();
  const object = { ...label(), extraAnchors: [{ x: 0, y: 40 }] };
  const original = structuredClone(object);
  api.applyHandleDeltaBase(object, original, "anchor-0", 3, -2, false, false);
  assert.equal(object.extraAnchors[0].x, 3);
  assert.equal(object.extraAnchors[0].y, 38);
  assert.deepEqual(object.p2, original.p2);
  api.setHandleEndpointPoint(object, "anchor-0", { x: 1, y: 2 });
  assert.equal(api.handleEndpointPoint(object, "anchor-0").x, 1);
  assert.equal(object.p2.x, 50);
});

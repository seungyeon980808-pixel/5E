const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function evaluateModule(relativePath, exports, additions = {}, setup = "") {
  let source = fs.readFileSync(path.join(root, relativePath), "utf8");
  source = source.replace(/^import\s+[\s\S]*?;\r?\n/gm, "").replace(/\bexport\s+/g, "");
  source += `\n${setup}\nglobalThis.__testExports = { ${exports.join(", ")} };`;
  const sandbox = {
    console,
    Date,
    Map,
    Set,
    JSON,
    Number,
    Object,
    String,
    Array,
    ...additions,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: relativePath });
  return sandbox.__testExports;
}

function projectIO(setup = "", extraExports = []) {
  return evaluateModule("js/project-io.js", ["migrate", "serialize", "prepareLoadedProject", "applyLoaded", ...extraExports], {
    rebuildGroups() { throw new Error("applyLoaded must use its prepared groups"); },
    screenToWorld() { return { x: 0, y: 0 }; },
    applyNewObjectStyleDefaults() {},
    migrateObjectStyleMode() {},
    showConfirm: async () => true,
    downscaleIfNeeded: async (value) => value,
    DEFAULT_TEXT_SIZE_MM: 3,
    DEFAULT_TEXT_FONT: "sans-serif",
    normalizeTextRuns: () => [],
    textRunsToText: () => "",
    LABEL_CAPABLE_TYPES: new Set(),
    insertImageFromSrc() {},
    addPage() {},
  }, setup);
}

function currentProject(overrides = {}) {
  return {
    version: "0.17",
    activePageId: "page-1",
    pages: [{
      id: "page-1",
      name: "첫 페이지",
      objects: [{ id: "object-1", type: "rect", layerId: 1 }],
      guides: [],
      layers: [{ id: 1, name: "레이어 1", visible: true }],
      artboard: { w: 90, h: 60 },
    }],
    ...overrides,
  };
}

function stateFixture(notify) {
  const value = {
    pages: [{ id: "old-page", objects: [{ id: "old-object" }] }],
    activePageId: "old-page",
    objects: [{ id: "old-object" }],
    guides: [{ axis: "x", position: 12 }],
    layers: [{ id: 1, name: "old", visible: true }],
    artboard: { w: 70, h: 50 },
    groups: [{ id: "old-group", memberIds: ["old-object"] }],
    undoStack: [[{ id: "undo" }]],
    redoStack: [[{ id: "redo" }]],
    selectedIds: ["old-object"],
    selectedGuideId: "guide-1",
    targetedId: "old-object",
    draft: { id: "draft" },
    draftText: "draft",
    activeLayerId: 1,
  };
  return {
    value,
    get: () => value,
    update(fn) { fn(value); if (notify) notify(value); },
  };
}

test("invalid supplied page structures reject before any live state mutation", () => {
  const io = projectIO();
  const invalidProjects = [
    { pages: null },
    currentProject({ pages: [null] }),
    currentProject({ pages: [{ id: "page-1", objects: [null] }] }),
    currentProject({ pages: [{ id: "page-1", objects: [{ id: "object-1" }], layers: [null] }] }),
    io.migrate(currentProject({ pages: [{ id: "page-1", objects: [{ id: "object-1" }], layers: null }] })),
    currentProject({ pages: [{ id: "page-1", objects: [{ id: false }] }] }),
    currentProject({ pages: [{ id: "page-1", objects: [{ id: "same" }, { id: "same" }] }] }),
  ];

  for (const invalid of invalidProjects) {
    const state = stateFixture();
    const before = JSON.parse(JSON.stringify(state.value));
    assert.throws(() => io.applyLoaded(state, invalid), /프로젝트|페이지|객체|레이어|ID/);
    assert.deepEqual(state.value, before);
  }
});

test("preparation accepts current and legacy documents and preserves serializable drawing data", () => {
  const io = projectIO();
  const current = io.prepareLoadedProject(currentProject());
  assert.equal(current.pages[0].id, "page-1");
  const state = stateFixture();
  io.applyLoaded(state, currentProject());
  assert.equal(state.value.activePageId, "page-1");
  assert.equal(state.value.groups.length, 0);
  assert.equal(state.value.undoStack.length, 0);

  const legacy = JSON.parse(fs.readFileSync(path.join(root, "docs/qa-fixtures/all_types_v0.15.json"), "utf8"));
  const prepared = io.prepareLoadedProject(legacy);
  assert.equal(prepared.pages.length, 1);
  assert.equal(prepared.pages[0].objects.length, legacy.objects.length);
  assert.deepEqual(JSON.parse(JSON.stringify(prepared.pages[0].layers)), legacy.layers);
  assert.deepEqual(JSON.parse(JSON.stringify(prepared.pages[0].artboard)), legacy.artboard);
  assert.deepEqual(
    JSON.parse(JSON.stringify(prepared.pages[0].objects[0])).type,
    legacy.objects[0].type,
  );
  const roundTrip = io.serialize({
    pages: prepared.pages,
    activePageId: prepared.activePageId,
    objects: prepared.active.objects,
    guides: prepared.active.guides,
    layers: prepared.active.layers,
    artboard: prepared.active.artboard,
  });
  assert.deepEqual(roundTrip.pages[0].objects.map((object) => object.id), legacy.objects.map((object) => object.id));
});

test("applyLoaded accepts a migrated legacy document with omitted layers", () => {
  const io = projectIO();
  const migrated = io.migrate({ objects: [{ id: "legacy-object", type: "rect" }] });
  const state = stateFixture();
  io.applyLoaded(state, migrated);
  assert.equal(state.value.objects[0].id, "legacy-object");
  assert.equal(state.value.layers.length, 3);
});

test("a throwing render subscriber restores the complete prior load state", () => {
  const io = projectIO(
    "_placement = { id: 'pending-placement' }; _placementHint = { hidden: false }; function placementState() { return { id: _placement && _placement.id, hidden: _placementHint.hidden }; }",
    ["placementState"],
  );
  const state = stateFixture(() => { throw new Error("render failed"); });
  const before = JSON.parse(JSON.stringify(state.value));
  assert.throws(() => io.applyLoaded(state, currentProject()), /render failed/);
  assert.deepEqual(state.value, before);
  assert.deepEqual(JSON.parse(JSON.stringify(io.placementState())), { id: "pending-placement", hidden: false });
});

test("rollback reprojects the prior document after a broken loaded scene throws", () => {
  const io = projectIO();
  const view = { objectIds: ["old-object"] };
  const state = stateFixture((live) => {
    view.objectIds = live.objects.map((object) => object.id);
    if (live.objects.some((object) => object.id === "broken")) throw new Error("scene projection failed");
  });
  assert.throws(() => io.applyLoaded(state, currentProject({
    pages: [{
      id: "page-1",
      objects: [{ id: "broken", type: "polyline", points: [null, null], layerId: 1 }],
      layers: [{ id: 1 }],
    }],
  })), /scene projection failed/);
  assert.deepEqual(state.value.objects, [{ id: "old-object" }]);
  assert.deepEqual(view.objectIds, ["old-object"]);
});

test("rollback notification failures do not replace the original load error", () => {
  const io = projectIO();
  let calls = 0;
  const state = stateFixture(() => {
    calls += 1;
    throw new Error(calls === 1 ? "original scene error" : "rollback notification error");
  });
  assert.throws(() => io.applyLoaded(state, currentProject()), /original scene error/);
  assert.equal(calls, 2);
  assert.deepEqual(state.value.objects, [{ id: "old-object" }]);
});

test("group derivation supports imported prototype-like identifiers without collisions", () => {
  const io = projectIO();
  const prepared = io.prepareLoadedProject(currentProject({
    pages: [{
      id: "page-1",
      objects: [
        { id: "one", groupId: "__proto__" },
        { id: "two", groupId: "constructor" },
        { id: "three", groupId: "__proto__" },
      ],
      layers: [{ id: 1 }],
    }],
  }));
  assert.deepEqual(JSON.parse(JSON.stringify(prepared.groups)), [
    { id: "__proto__", memberIds: ["one", "three"] },
    { id: "constructor", memberIds: ["two"] },
  ]);

  const transform = evaluateModule("js/transform.js", ["rebuildGroups"], {
    screenToWorld() {}, getRenderScale() {}, resolveSnap() {}, resolveEndpointSnap() {}, resolveRadialCenterSnap() {},
    setSnapPreview() {}, setSmartGuides() {}, pendulumBBox() {}, pickSelectableObjectFromEvent() {},
    isObjectSelectable() {}, IMAGE_EDIT_SESSION_ID: "image-edit-session", SHAPE_TYPES: new Set(), SIZE_TYPES: new Set(),
    FLIP_TYPES: new Set(), POINT_ARRAY_TYPES: new Set(), ENDPOINT_HANDLE_TYPES: new Set(), TEXT_MEASURED_TYPES: new Set(),
    snapKey() {}, modKey() {}, document: { addEventListener() {} }, window: { addEventListener() {} },
  });
  const state = { objects: prepared.active.objects };
  transform.rebuildGroups(state);
  assert.deepEqual(JSON.parse(JSON.stringify(state.groups)), JSON.parse(JSON.stringify(prepared.groups)));
});

test("page tabs keep a hostile page ID as data instead of parsing it as markup", () => {
  const elements = [];
  const document = {
    createElement(tagName) {
      const element = {
        tagName, dataset: {}, children: [], attributes: {},
        append(...nodes) { this.children.push(...nodes); },
        setAttribute(name, value) { this.attributes[name] = value; },
      };
      elements.push(element);
      return element;
    },
  };
  const tabs = { replaceChildren(...nodes) { this.children = nodes; } };
  const pages = evaluateModule("js/pages.js", ["renderTabs"], {
    showPrompt: async () => null, showConfirm: async () => false, rebuildGroups() {}, document, window: {}, __tabs: tabs,
  }, "_tabsEl = globalThis.__tabs;");
  const id = '<img src=x onerror="globalThis.injected=true">';
  pages.renderTabs({ get: () => ({ activePageId: id, pages: [{ id, name: "안전한 페이지" }] }) });
  assert.equal(tabs.children.length, 1);
  assert.equal(tabs.children[0].tagName, "div");
  assert.equal(tabs.children[0].dataset.id, id);
  assert.equal(tabs.children[0].children[0].textContent, "안전한 페이지");
  assert.equal(elements.some((element) => element.tagName === "img"), false);
});

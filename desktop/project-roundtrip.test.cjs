const assert = require("node:assert/strict");
const test = require("node:test");

const projectIo = import("../js/project-io.js");
const storeModule = import("../js/store.js");

function currentProject() {
  return {
    version: "0.17",
    activePageId: "page-current",
    rootExtension: { owner: "future-editor", revision: 4 },
    pages: [{
      id: "page-current",
      name: "Current",
      meta: { number: "1", points: "2", rubric: { band: "future" }, selectedIds: ["transient"] },
      pageExtension: { layout: "future-grid" },
      groups: [{ id: "derived-group", memberIds: ["object-current"] }],
      undoStack: [[{ id: "stale-history" }]],
      redoStack: [[{ id: "stale-future" }]],
      selectedIds: ["object-current"],
      selectedGuideId: "stale-guide",
      targetedId: "object-current",
      draft: { type: "line" },
      draftText: { text: "stale" },
      activeTool: "R",
      activeLayerId: 1,
      viewBox: { x: 1, y: 2, w: 30, h: 20 },
      objects: [{
        id: "object-current",
        type: "image",
        src: "data:image/png;base64,AA==",
        objectExtension: { renderer: "future-image" },
      }],
      guides: [],
      layers: [{ id: 1, name: "Layer", visible: true }],
      artboard: { w: 100, h: 70, print: { bleed: 3 }, viewBox: { transient: true } },
    }],
  };
}

function legacyProject() {
  return {
    version: "0.16",
    rootExtension: { owner: "legacy-plugin", revision: 2 },
    meta: { number: "L", points: 7, rubric: { band: "legacy" }, draft: { transient: true } },
    objects: [{
      id: "object-legacy",
      type: "line",
      objectExtension: { renderer: "legacy-line" },
    }],
    guides: [],
    layers: [{ id: 1, name: "Layer", visible: true }],
    artboard: { w: -1, h: 60, print: { bleed: 2 }, selectedIds: ["transient"] },
  };
}

async function roundTrip(project) {
  const [{ applyLoaded, migrate, serialize }, { createStore }] = await Promise.all([projectIo, storeModule]);
  const state = createStore({ activeLayerId: 1 });

  applyLoaded(state, migrate(structuredClone(project)));
  return JSON.parse(JSON.stringify(serialize(state.get())));
}

test("preserves current root extensions when a current project is loaded and saved", async () => {
  // Given
  const project = currentProject();

  // When
  const saved = await roundTrip(project);

  // Then
  assert.deepEqual(saved.rootExtension, project.rootExtension);
});

test("preserves current page extensions when a current project is loaded and saved", async () => {
  // Given
  const project = currentProject();

  // When
  const saved = await roundTrip(project);

  // Then
  assert.deepEqual(saved.pages[0].pageExtension, project.pages[0].pageExtension);
});

test("preserves current nested extensions while normalizing known fields", async () => {
  // Given
  const project = currentProject();

  // When
  const saved = await roundTrip(project);

  // Then
  assert.deepEqual(saved.pages[0].meta, { number: "1", points: "2", rubric: { band: "future" } });
  assert.deepEqual(saved.pages[0].artboard, { w: 100, h: 70, print: { bleed: 3 } });
});

test("omits derived and transient page fields when a current project is loaded and saved", async () => {
  // Given
  const project = currentProject();

  // When
  const saved = await roundTrip(project);

  // Then
  assert.deepEqual(
    [
      "groups", "undoStack", "redoStack", "selectedIds", "selectedGuideId", "targetedId",
      "draft", "draftText", "activeTool", "activeLayerId", "viewBox",
    ].filter(
      (field) => Object.hasOwn(saved.pages[0], field),
    ),
    [],
  );
});

test("preserves current object extensions when a current project is loaded and saved", async () => {
  // Given
  const project = currentProject();

  // When
  const saved = await roundTrip(project);

  // Then
  assert.deepEqual(saved.pages[0].objects[0].objectExtension, project.pages[0].objects[0].objectExtension);
});

test("preserves legacy root extensions when a legacy project is loaded and saved", async () => {
  // Given
  const project = legacyProject();

  // When
  const saved = await roundTrip(project);

  // Then
  assert.deepEqual(saved.rootExtension, project.rootExtension);
});

test("moves legacy nested extensions into the page and normalizes known fields", async () => {
  // Given
  const project = legacyProject();

  // When
  const saved = await roundTrip(project);

  // Then
  assert.deepEqual(saved.pages[0].meta, { number: "L", points: "", rubric: { band: "legacy" } });
  assert.deepEqual(saved.pages[0].artboard, { w: 90, h: 60, print: { bleed: 2 } });
  assert.equal(Object.hasOwn(saved, "meta"), false);
});

test("preserves legacy object extensions when a legacy project is loaded and saved", async () => {
  // Given
  const project = legacyProject();

  // When
  const saved = await roundTrip(project);

  // Then
  assert.deepEqual(saved.pages[0].objects[0].objectExtension, project.objects[0].objectExtension);
});

test("preserves intentional object-field absence when a current project is loaded and saved", async () => {
  // Given
  const project = currentProject();

  // When
  const saved = await roundTrip(project);

  // Then
  assert.equal(Object.hasOwn(saved.pages[0].objects[0], "srcRect"), false);
});

test("omits transient root fields when a current project is loaded and saved", async () => {
  // Given
  const project = { ...currentProject(), viewBox: { x: 4, y: 5, w: 60, h: 40 } };

  // When
  const saved = await roundTrip(project);

  // Then
  assert.equal(Object.hasOwn(saved, "viewBox"), false);
});

test("omits legacy drawing fields from the current root when a legacy project is loaded and saved", async () => {
  // Given
  const project = legacyProject();

  // When
  const saved = await roundTrip(project);

  // Then
  assert.equal(Object.hasOwn(saved, "objects"), false);
});

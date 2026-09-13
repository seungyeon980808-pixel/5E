import assert from "node:assert/strict";
import test from "node:test";
import {
  distributeSourcesToTaskTabs,
  groupSourcesInTaskTab,
  moveReferenceInComposition,
  normalizeReferenceComposition,
} from "../js/ai-source-tasking.js";
import { libraryActionSnapshotIsCurrent } from "../js/unified-library-ui.js";

function harness({ activeHasSource = false } = {}) {
  let active = "task-1";
  let serial = 1;
  const tasks = new Map([[active, activeHasSource ? ["existing"] : []]]);
  const actions = {
    canUseActiveTask: () => tasks.get(active).length === 0,
    createTask: () => { active = `task-${++serial}`; tasks.set(active, []); },
    addSource: (source) => tasks.get(active).push(source.name),
    applyPrompt: () => {},
    captureTask: () => {},
    activeTaskId: () => active,
    activateTask: (taskId) => { active = taskId; },
  };
  return { actions, tasks, active: () => active };
}

test("each selected source becomes one task and the first source stays selected", () => {
  const state = harness();
  const ids = distributeSourcesToTaskTabs([
    { name: "a.png" },
    { name: "b.png" },
    { name: "c.png" },
  ], state.actions);

  assert.deepEqual(ids, ["task-1", "task-2", "task-3"]);
  assert.deepEqual([...state.tasks.values()], [["a.png"], ["b.png"], ["c.png"]]);
  assert.equal(state.active(), "task-1");
});

test("adding a source never appends it to an occupied task", () => {
  const state = harness({ activeHasSource: true });
  const ids = distributeSourcesToTaskTabs([{ name: "new.png" }], state.actions);

  assert.deepEqual(ids, ["task-2"]);
  assert.deepEqual([...state.tasks.values()], [["existing"], ["new.png"]]);
  assert.equal(state.active(), "task-2");
});

test("task sources snapshot pixels and nested provenance before caller mutation", () => {
  const assigned = [];
  const source = {
    name: "crop.png",
    data: "data:image/png;base64,EXACT",
    source: { documentId: "physics", pageNumber: 2, rect: [0.1, 0.2, 0.3, 0.4] },
  };
  distributeSourcesToTaskTabs([source], {
    canUseActiveTask: () => true,
    addSource: (item) => assigned.push(item),
    activeTaskId: () => "task-1",
  });
  source.data = "data:image/png;base64,CHANGED";
  source.source.rect[0] = 0.9;
  assert.equal(assigned[0].data, "data:image/png;base64,EXACT");
  assert.deepEqual(assigned[0].source.rect, [0.1, 0.2, 0.3, 0.4]);
});

test("switching away and back still invalidates a delayed library route", () => {
  const snapshot = { selectedId: "crop-1", representation: "manual", selectedIdsKey: "", open: true, revision: 4 };
  assert.equal(libraryActionSnapshotIsCurrent(snapshot, { ...snapshot, revision: 4 }), true);
  assert.equal(libraryActionSnapshotIsCurrent(snapshot, { ...snapshot, revision: 6 }), false);
});

test("an explicit together handoff snapshots every source into one ordered task", () => {
  const state = harness({ activeHasSource: true });
  const original = [
    { id: "source-a", name: "a.png", source: { pageNumber: 1 } },
    { id: "source-b", name: "b.png", source: { pageNumber: 2 } },
    { id: "style-c", name: "style.png", referenceRole: "STYLE_REFERENCE" },
  ];
  const ids = groupSourcesInTaskTab(original, state.actions, { prompt: "연결해서 변환" });

  original[0].source.pageNumber = 99;
  assert.deepEqual(ids, ["task-2"]);
  assert.deepEqual([...state.tasks.values()], [["existing"], ["a.png", "b.png", "style.png"]]);
  assert.equal(state.active(), "task-2");
});

test("composition defaults horizontal, retains source order, and moves only structural references", () => {
  const sources = [
    { id: "a", referenceRole: "INPUT_SOURCE" },
    { id: "style", referenceRole: "STYLE_REFERENCE" },
    { id: "b", referenceRole: "INPUT_SOURCE" },
    { id: "c" },
  ];
  const initial = normalizeReferenceComposition(null, sources);
  assert.deepEqual(initial, { orientation: "horizontal", sourceOrder: ["a", "b", "c"] });
  assert.deepEqual(moveReferenceInComposition(initial, "b", "earlier", sources), {
    orientation: "horizontal", sourceOrder: ["b", "a", "c"],
  });
  assert.deepEqual(moveReferenceInComposition(initial, "b", "later", sources), {
    orientation: "horizontal", sourceOrder: ["a", "c", "b"],
  });
  assert.deepEqual(normalizeReferenceComposition({ orientation: "vertical", sourceOrder: ["c", "missing", "a"] }, sources), {
    orientation: "vertical", sourceOrder: ["c", "a", "b"],
  });
});

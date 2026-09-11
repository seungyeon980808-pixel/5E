import assert from "node:assert/strict";
import test from "node:test";
import { distributeSourcesToTaskTabs } from "../js/ai-source-tasking.js";

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

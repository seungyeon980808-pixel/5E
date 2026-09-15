const assert = require("node:assert/strict");
const test = require("node:test");
const { createProjectCloseGuard } = require("./project-close-guard.cjs");

function fixture({ snapshot, choice = 2, save = async () => ({ kind: "saved" }) } = {}) {
  const calls = { snapshot: 0, prompt: 0, save: 0, close: 0, notice: 0, saveFailure: 0 };
  const guard = createProjectCloseGuard({
    requestSnapshot: async () => { calls.snapshot += 1; return snapshot; },
    prompt: async () => { calls.prompt += 1; return choice; },
    saveProject: async (json) => { calls.save += 1; calls.json = json; return save(json); },
    notifyUnrecoverableAi: async () => { calls.notice += 1; },
    notifySaveFailure: async () => { calls.saveFailure += 1; },
    close: () => { calls.close += 1; },
  });
  return { calls, guard };
}

test("Given unsaved canvas content, when save and exit succeeds, then it saves the supplied snapshot before one close", async () => {
  const f = fixture({ snapshot: { projectDirty: true, projectJson: '{"pages":[]}', aiRecovered: true }, choice: 0 });
  assert.equal(await f.guard(), true);
  assert.deepEqual(f.calls, { snapshot: 1, prompt: 1, save: 1, close: 1, notice: 0, saveFailure: 0, json: '{"pages":[]}' });
});

test("Given an unsaved canvas, when save is cancelled or fails, then the window stays open", async () => {
  for (const result of [{ kind: "cancelled" }, { kind: "failed" }]) {
    const f = fixture({ snapshot: { projectDirty: true, projectJson: '{"pages":[]}', aiRecovered: true }, choice: 0, save: async () => result });
    assert.equal(await f.guard(), false);
    assert.equal(f.calls.close, 0);
    assert.equal(f.calls.save, 1);
    assert.equal(f.calls.saveFailure, result.kind === "failed" ? 1 : 0);
  }
});

test("Given unsaved canvas content, when discard or cancel is chosen, then only discard closes", async () => {
  const discard = fixture({ snapshot: { projectDirty: true, projectJson: '{"pages":[]}', aiRecovered: true }, choice: 1 });
  assert.equal(await discard.guard(), true);
  assert.equal(discard.calls.close, 1);
  assert.equal(discard.calls.save, 0);
  const cancel = fixture({ snapshot: { projectDirty: true, projectJson: '{"pages":[]}', aiRecovered: true }, choice: 2 });
  assert.equal(await cancel.guard(), false);
  assert.equal(cancel.calls.close, 0);
  assert.equal(cancel.calls.save, 0);
});

test("Given AI recovery cannot be checkpointed, when closing, then it is blocked without claiming project save covers AI", async () => {
  const f = fixture({ snapshot: { projectDirty: true, projectJson: '{"pages":[]}', aiRecovered: false, aiHasWork: true } });
  assert.equal(await f.guard(), false);
  assert.equal(f.calls.notice, 1);
  assert.equal(f.calls.prompt, 0);
  assert.equal(f.calls.save, 0);
  assert.equal(f.calls.close, 0);
});

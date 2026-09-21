import assert from "node:assert/strict";
import test from "node:test";

import {
  activateWorkItem, addWorkItem, cancelOperation, completeOperation,
  createLiteWorkItem, createLiteWorkflowState, failOperation,
  recordCompletedSave, restoreLiteWorkflowState, serializeLiteWorkflowState,
  setExportSelected, startOperation, updateEditorSnapshot,
} from "../preview/js/lite-workflow-state.js";

const original = (id) => ({ id: `source-${id}`, name: `${id}.png`, blob: { fixture: id } });
const candidate = (id) => ({ id, pixels: id });
const scene = (label) => ({ objects: [{ type: "text", text: label }] });
const item = (state, id) => state.workItems.find((entry) => entry.id === id);

function addTwoImages() {
  let state = createLiteWorkflowState();
  state = addWorkItem(state, createLiteWorkItem({ id: "A", original: original("A") }));
  return addWorkItem(state, createLiteWorkItem({ id: "B", original: original("B") }));
}

test("create keeps an immutable original descriptor", () => {
  // Given: a mutable source descriptor owned by the caller.
  const source = original("A");

  // When: a Lite work item captures it and the caller later changes its name.
  const workItem = createLiteWorkItem({ id: "A", original: source });
  source.name = "changed.png";

  // Then: the captured descriptor is frozen and retains the original name.
  assert.equal(workItem.original.name, "A.png");
  assert.equal(Object.isFrozen(workItem.original), true);
});

test("independent images keep candidate, editor history, and active selection", () => {
  // Given: image A has a running conversion and image B is available.
  let state = activateWorkItem(addTwoImages(), "A");
  const startedA = startOperation(state, { workItemId: "A", candidateId: "A-1" });

  // When: B completes and receives its own editor snapshot while A remains pending.
  state = activateWorkItem(startedA.state, "B");
  const startedB = startOperation(state, { workItemId: "B", candidateId: "B-1" });
  state = completeOperation(startedB.state, startedB.token, candidate("B-1")).state;
  state = updateEditorSnapshot(state, {
    workItemId: "B", candidateId: "B-1", editorScene: scene("B label"),
    undoStack: [scene("B before")], redoStack: [], selection: ["B-label"],
  });
  state = activateWorkItem(state, "A");

  // Then: image identity, operation, and histories remain isolated.
  assert.equal(state.activeWorkItemId, "A");
  assert.equal(item(state, "A").operation, "running");
  assert.equal(item(state, "A").candidates.length, 0);
  assert.equal(item(state, "B").activeCandidateId, "B-1");
  assert.deepEqual(item(state, "B").editorScene, scene("B label"));
  assert.deepEqual(item(state, "B").undoStack, [scene("B before")]);
});

test("stale completion cannot change another active image or a retried epoch", () => {
  // Given: A starts once, retries, and the user switches to B.
  let state = activateWorkItem(addTwoImages(), "A");
  const oldRun = startOperation(state, { workItemId: "A", candidateId: "A-old" });
  const retry = startOperation(oldRun.state, { workItemId: "A", candidateId: "A-new" });
  state = activateWorkItem(retry.state, "B");

  // When: wrong-item, wrong-candidate, and old-epoch completions arrive.
  const results = [
    completeOperation(state, { ...retry.token, workItemId: "B" }, candidate("A-new")),
    completeOperation(state, { ...retry.token, candidateId: "A-wrong" }, candidate("A-wrong")),
    completeOperation(state, oldRun.token, candidate("A-old")),
  ];

  // Then: every stale delivery is ignored and both image selections are unchanged.
  for (const result of results) {
    assert.equal(result.status, "ignored");
    assert.strictEqual(result.state, state);
  }
  assert.equal(state.activeWorkItemId, "B");
  assert.equal(item(state, "A").activeCandidateId, null);
  assert.equal(item(state, "B").activeCandidateId, null);
});

test("background completion commits to its image without changing active selection", () => {
  // Given: A is running while B is the active UI image.
  let state = activateWorkItem(addTwoImages(), "A");
  const run = startOperation(state, { workItemId: "A", candidateId: "A-1" });
  state = activateWorkItem(run.state, "B");

  // When: A's exact result completes in the background.
  const completed = completeOperation(state, run.token, candidate("A-1"));

  // Then: A commits and the active UI remains on B.
  assert.equal(completed.status, "applied");
  assert.equal(completed.state.activeWorkItemId, "B");
  assert.equal(item(completed.state, "A").activeCandidateId, "A-1");
});

test("cancel keeps committed scene and invalidates late completion", () => {
  // Given: A has a committed edited candidate, then starts a replacement.
  let state = activateWorkItem(addTwoImages(), "A");
  let run = startOperation(state, { workItemId: "A", candidateId: "A-1" });
  state = completeOperation(run.state, run.token, candidate("A-1")).state;
  state = updateEditorSnapshot(state, {
    workItemId: "A", candidateId: "A-1", editorScene: scene("kept"),
    undoStack: [scene("before kept")], selection: ["kept-label"],
  });
  run = startOperation(state, { workItemId: "A", candidateId: "A-2" });

  // When: the operation is cancelled and its late result arrives.
  const cancelled = cancelOperation(run.state, run.token);
  const late = completeOperation(cancelled.state, run.token, candidate("A-2"));

  // Then: committed state remains and the result is stale.
  assert.equal(cancelled.status, "applied");
  assert.equal(item(cancelled.state, "A").operation, "cancelling");
  assert.equal(late.status, "ignored");
  assert.equal(item(late.state, "A").activeCandidateId, "A-1");
  assert.deepEqual(item(late.state, "A").editorScene, scene("kept"));
  assert.deepEqual(item(late.state, "A").undoStack, [scene("before kept")]);
});

test("failure preserves committed scene and retry uses a newer epoch", () => {
  // Given: A has a committed candidate and starts a replacement.
  let state = activateWorkItem(addTwoImages(), "A");
  let run = startOperation(state, { workItemId: "A", candidateId: "A-1" });
  state = completeOperation(run.state, run.token, candidate("A-1")).state;
  state = updateEditorSnapshot(state, {
    workItemId: "A", candidateId: "A-1", editorScene: scene("committed"),
  });
  run = startOperation(state, { workItemId: "A", candidateId: "A-2" });

  // When: that operation fails and the caller retries.
  const failed = failOperation(run.state, run.token, { code: "conversion-failed" });
  const retry = startOperation(failed.state, { workItemId: "A", candidateId: "A-3" });

  // Then: failure preserves committed work and retry has a later epoch.
  assert.equal(failed.status, "applied");
  assert.equal(item(failed.state, "A").activeCandidateId, "A-1");
  assert.deepEqual(item(failed.state, "A").editorScene, scene("committed"));
  assert.ok(retry.token.epoch > run.token.epoch);
});

test("new candidate starts with an empty editor and does not inherit overlays", () => {
  // Given: A's first candidate has labels, history, and selection.
  let state = activateWorkItem(addTwoImages(), "A");
  let run = startOperation(state, { workItemId: "A", candidateId: "A-1" });
  state = completeOperation(run.state, run.token, candidate("A-1")).state;
  state = updateEditorSnapshot(state, {
    workItemId: "A", candidateId: "A-1", editorScene: scene("old label"),
    undoStack: [scene("old history")], redoStack: [scene("old redo")], selection: ["old-label"],
  });

  // When: a replacement candidate completes.
  run = startOperation(state, { workItemId: "A", candidateId: "A-2" });
  state = completeOperation(run.state, run.token, candidate("A-2")).state;

  // Then: the replacement begins with a fresh editor snapshot.
  assert.deepEqual(item(state, "A").editorScene, { objects: [] });
  assert.deepEqual(item(state, "A").undoStack, []);
  assert.deepEqual(item(state, "A").redoStack, []);
  assert.deepEqual(item(state, "A").selection, []);
});

test("same candidate completion preserves its matching editor snapshot", () => {
  // Given: A's active candidate owns an edited scene.
  let state = activateWorkItem(addTwoImages(), "A");
  let run = startOperation(state, { workItemId: "A", candidateId: "A-1" });
  state = completeOperation(run.state, run.token, candidate("A-1")).state;
  state = updateEditorSnapshot(state, {
    workItemId: "A", candidateId: "A-1", editorScene: scene("same candidate"),
    undoStack: [scene("same history")], selection: ["same-label"],
  });

  // When: a newer operation refreshes that exact candidate ID.
  run = startOperation(state, { workItemId: "A", candidateId: "A-1" });
  state = completeOperation(run.state, run.token, candidate("A-1")).state;

  // Then: the editor snapshot still belongs to the committed candidate.
  assert.deepEqual(item(state, "A").editorScene, scene("same candidate"));
  assert.deepEqual(item(state, "A").undoStack, [scene("same history")]);
  assert.deepEqual(item(state, "A").selection, ["same-label"]);
});

test("serialize and restore interrupt running work without cloning binary references", () => {
  // Given: an original and candidate carry large immutable payload references.
  const sourceBlob = { bytes: new Uint8Array([1, 2, 3]) };
  const candidateBlob = { bytes: new Uint8Array([4, 5, 6]) };
  let state = createLiteWorkflowState();
  state = addWorkItem(state, createLiteWorkItem({
    id: "A", original: { id: "source-A", blob: sourceBlob },
    candidate: { id: "A-1", blob: candidateBlob },
  }));
  const running = startOperation(state, { workItemId: "A", candidateId: "A-2" }).state;

  // When: the workflow is serialized and restored.
  const serialized = serializeLiteWorkflowState(running);
  const restored = restoreLiteWorkflowState(serialized);

  // Then: restore is safe while binary payloads remain structural references.
  assert.equal(item(restored, "A").operation, "interrupted");
  assert.equal(item(restored, "A").pendingOperation, null);
  assert.strictEqual(item(serialized, "A").original.blob, sourceBlob);
  assert.strictEqual(item(serialized, "A").candidates[0].blob, candidateBlob);
});

test("export selection and completed writer receipt are item scoped", () => {
  // Given: A and B each have a committed candidate and only A is selected.
  let state = addTwoImages();
  for (const id of ["A", "B"]) {
    const run = startOperation(state, { workItemId: id, candidateId: `${id}-1` });
    state = completeOperation(run.state, run.token, candidate(`${id}-1`)).state;
  }
  state = setExportSelected(state, { workItemId: "A", selected: true });

  // When: download-requested is reported, then a completed writer receipt arrives for A.
  const downloadOnly = recordCompletedSave(state, {
    workItemId: "A", candidateId: "A-1",
    receipt: { status: "download-requested", completed: true },
  });
  const stored = recordCompletedSave(state, {
    workItemId: "A", candidateId: "A-1",
    receipt: { status: "stored", completed: true, writerId: "fixture-writer", path: "/fixture/A.png" },
  });

  // Then: only the explicit writer completion changes save state.
  assert.equal(downloadOnly.status, "ignored");
  assert.equal(item(downloadOnly.state, "A").lastSave, null);
  assert.equal(stored.status, "applied");
  assert.equal(item(stored.state, "A").lastSave.status, "stored");
  assert.equal(item(stored.state, "B").lastSave, null);
  assert.equal(item(stored.state, "A").selectedForExport, true);
  assert.equal(item(stored.state, "B").selectedForExport, false);
});

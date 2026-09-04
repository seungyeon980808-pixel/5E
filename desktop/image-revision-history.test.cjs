const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const historyModule = import("../js/image-revision-history.mjs");

test("new results keep prior versions and make the latest result active", async () => {
  const { activeImageRevision, appendImageRevision, revisionComparison } = await historyModule;
  let history = appendImageRevision([], { id: "r1", data: "first" });
  history = appendImageRevision(history, { id: "r2", data: "second" });

  assert.deepEqual(history.map(({ id, active }) => ({ id, active })), [
    { id: "r1", active: false },
    { id: "r2", active: true },
  ]);
  assert.equal(activeImageRevision(history).id, "r2");
  assert.deepEqual(revisionComparison(history), {
    before: history[0],
    after: history[1],
  });
});

test("rollback changes the active result without deleting newer history", async () => {
  const { activateImageRevision, activeImageRevision } = await historyModule;
  const history = [
    { id: "r1", data: "first", active: false },
    { id: "r2", data: "second", active: true },
  ];

  const rolledBack = activateImageRevision(history, "r1");

  assert.equal(activeImageRevision(rolledBack).id, "r1");
  assert.deepEqual(rolledBack.map(({ id }) => id), ["r1", "r2"]);
  assert.equal(history[1].active, true, "activation must not mutate saved tab history");
});

test("failed and cancelled revisions preserve the last stable result and typed input", async () => {
  const { beginImageRevision, finishImageRevision } = await historyModule;
  const history = [{ id: "r1", data: "stable", active: true }];
  const pending = beginImageRevision(history, "화살표만 오른쪽으로 옮겨 줘");

  const failed = finishImageRevision(pending, { status: "failed", error: "network" });
  const cancelled = finishImageRevision(pending, { status: "cancelled" });

  for (const outcome of [failed, cancelled]) {
    assert.deepEqual(outcome.history, history);
    assert.equal(outcome.input, "화살표만 오른쪽으로 옮겨 줘");
    assert.equal(outcome.active.data, "stable");
  }
});

test("AI panel routes follow-up edits through the active revision and exposes rollback", () => {
  const panel = fs.readFileSync(path.join(__dirname, "..", "js", "ai-panel.js"), "utf8");
  assert.match(panel, /activeImageRevision\(runInput\.generated\)/);
  assert.match(panel, /revisionContext:\s*beginImageRevision\(runInput\.generated,\s*entered\)/);
  assert.match(panel, /dataset\.aiRevisionActivate/);
  assert.match(panel, /revisionComparison\(generatedImages\)/);
  assert.doesNotMatch(panel, /rawRevisionImage = runInput\.generated\.at\(-1\)/);
  const batchStart = panel.indexOf("const addBatchResultToTab");
  const batchEnd = panel.indexOf("const releaseBatchSlot", batchStart);
  const batchResultBlock = panel.slice(batchStart, batchEnd);
  assert.match(batchResultBlock, /let item = \{/);
  assert.doesNotMatch(batchResultBlock, /const item = \{/);
  assert.match(panel, /tab\.generated = appendImageRevision\(tab\.generated,\s*taskItemCopy\(item\)\)/);
});

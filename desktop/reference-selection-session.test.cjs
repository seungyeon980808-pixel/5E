const test = require("node:test");
const assert = require("node:assert/strict");

const modulePromise = import("../js/reference-selection-session.mjs");

test("multiple local references survive reopen and reconcile against a reconnected folder", async () => {
  // Given two references selected from the current folder.
  const { createReferenceSelectionSession } = await modulePromise;
  const session = createReferenceSelectionSession({ limit: 3 });
  const first = [
    { id: "a", name: "a.png" },
    { id: "b", name: "b.png" },
  ];
  session.setAvailable("local", first);
  assert.equal(session.toggle("local", first[0]).status, "selected");
  assert.equal(session.toggle("local", first[1]).status, "selected");
  const saved = session.snapshot();

  // When the folder is reconnected and only one previous item still exists.
  const second = [
    { id: "b", name: "b.png" },
    { id: "c", name: "c.png" },
  ];
  session.setAvailable("local", second);

  // Then stale references are removed and the surviving reference keeps its selection.
  assert.deepEqual(session.selected().map(({ item }) => item.id), ["b"]);

  // And reopening the same session can restore the full saved selection by stable id.
  session.restore(saved, "local", [...first, second[1]]);
  assert.deepEqual(session.selected().map(({ item }) => item.id), ["a", "b"]);
  assert.equal(session.toggle("local", first[1]).status, "removed");
  assert.deepEqual(session.selected().map(({ item }) => item.id), ["a"]);
});

test("reference selection reports its limit without discarding earlier choices", async () => {
  const { createReferenceSelectionSession } = await modulePromise;
  const session = createReferenceSelectionSession({ limit: 2 });
  const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
  session.setAvailable("local", items);
  session.toggle("local", items[0]);
  session.toggle("local", items[1]);

  assert.deepEqual(session.toggle("local", items[2]), { status: "limit", limit: 2 });
  assert.deepEqual(session.selected().map(({ item }) => item.id), ["a", "b"]);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  assignmentForPlacement,
  assignReference,
  removeReferenceAssignment,
  assignmentHasUnassignedReferences,
} from "../js/library/workbench-assignment.js";

test("Given three references, separate placement creates one ordered workbench per image", () => {
  assert.deepEqual(assignmentForPlacement(3, "separate"), [[0], [1], [2]]);
});

test("Given three references, together placement creates one ordered workbench", () => {
  assert.deepEqual(assignmentForPlacement(3, "together"), [[0, 1, 2]]);
});

test("Given a selected workbench, assigning keeps reference click order", () => {
  const first = assignReference([[]], 0, 2);
  const second = assignReference(first, 0, 0);
  assert.deepEqual(second, [[2, 0]]);
});

test("Given a reference already in the selected workbench, assigning does not duplicate it", () => {
  assert.deepEqual(assignReference([[1]], 0, 1), [[1]]);
});

test("Given a reference in two workbenches, removal changes only the selected workbench", () => {
  assert.deepEqual(removeReferenceAssignment([[0, 1], [1]], 0, 1), [[0], [1]]);
});

test("Given incomplete advanced groups, unassigned detection reports the omitted reference", () => {
  assert.equal(assignmentHasUnassignedReferences([[0], [2]], 3), true);
  assert.equal(assignmentHasUnassignedReferences([[0, 2], [1]], 3), false);
});

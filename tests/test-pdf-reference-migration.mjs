import assert from "node:assert/strict";
import test from "node:test";

import { mergePreferredCatalogs } from "../js/pdf-library/catalog-merge.js";
import { openPdfReferencePicker, registerPdfReferencePicker } from "../js/pdf-library/reference-picker.js";

test("Given matching remote and installed pack IDs, the offline installed catalog wins without duplicate search entries", () => {
  const remote = {
    documents: [{ id: "official::physics", source: "remote" }],
    searchIndex: { entries: [{ documentId: "official::physics", itemId: "official::q1", pageNumber: 1, text: "remote" }] },
  };
  const installed = {
    documents: [{ id: "official::physics", source: "installed" }],
    searchIndex: { entries: [{ documentId: "official::physics", itemId: "official::q1", pageNumber: 1, text: "installed" }] },
  };
  const merged = mergePreferredCatalogs(remote, installed);
  assert.deepEqual(merged.documents, installed.documents);
  assert.equal(merged.searchIndex.entries.length, 1);
  assert.equal(merged.searchIndex.entries[0].text, "installed");
  assert.equal(merged.installedDocumentIds.has("official::physics"), true);
});

test("Given the AI EXAM source, the shared PDF picker preserves the existing add-reference callback", async () => {
  const added = [];
  const unregister = registerPdfReferencePicker(async ({ onAdd }) => {
    onAdd({ name: "PDF crop", data: "data:image/png;base64,AA==", sourceKind: "pdf-library" });
  });
  await openPdfReferencePicker({ onAdd: (reference) => added.push(reference) });
  unregister();
  assert.deepEqual(added, [{ name: "PDF crop", data: "data:image/png;base64,AA==", sourceKind: "pdf-library" }]);
});

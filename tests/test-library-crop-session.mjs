import assert from "node:assert/strict";
import test from "node:test";

import { cropSessionIsCurrent } from "../preview/js/unified-library-ui.js";

const page = (pageNumber) => ({
  id: "audit-document",
  kind: "pdf",
  provenance: { documentId: "audit-document", pageNumber, provider: "pdf" },
});

test("keeps a crop session bound to its requested PDF page", () => {
  const target = page(2);
  const session = {
    resultId: target.id,
    documentId: target.provenance.documentId,
    pageNumber: 2,
    resultIdentity: JSON.stringify([target.id, "audit-document", 2, null, null, null, null]),
  };
  assert.equal(cropSessionIsCurrent(session, target), true);
  assert.equal(cropSessionIsCurrent(session, page(1)), false);
});

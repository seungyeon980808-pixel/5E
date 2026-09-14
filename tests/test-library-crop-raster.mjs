import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createCanvas } from "@napi-rs/canvas";
import { createUnifiedLibraryProvider } from "../js/library/provider.js";
import { createPdfRuntime } from "../js/pdf-library/pdf-runtime.js";
import { withManualCropVariant } from "../js/unified-library-ui.js";
import { createPdfLibraryFixture } from "./helpers/pdf-library-fixture.mjs";

test("distinct manual regions produce distinct PNG pixels through the real library PDF crop path", async (context) => {
  const runtime = createPdfRuntime({ canvasFactory: { create: createCanvas } });
  context.after(() => runtime.clearCache());
  const document = await runtime.openDocument({
    id: "crop-proof",
    title: "Crop proof",
    source: { kind: "file", locator: "fixture.pdf", displayName: "fixture.pdf" },
    data: createPdfLibraryFixture(),
  });
  const provider = createUnifiedLibraryProvider({
    pdfDocuments: [document],
    materializers: { pdf: async ({ source }) => ({
      ...await runtime.renderCrop({ source, dpi: 96 }),
      source,
    }) },
  });
  const [canonical] = provider.search({ query: "Momentum", kinds: ["crop"] });
  assert.ok(canonical);
  const regions = [[0.1, 0.04, 0.42, 0.48], [0.55, 0.55, 0.35, 0.35]];
  const rendered = await Promise.all(regions.map((rect) => provider.materialize(withManualCropVariant(canonical, {
    documentId: canonical.provenance.documentId,
    pageNumber: canonical.provenance.pageNumber,
    rect,
    fullPageFallback: false,
  }), { representation: "manual" })));

  assert.deepEqual(rendered.map(({ source }) => source.rect), regions);
  assert.ok(rendered.every(({ bytes, width, height }) => bytes[0] === 0x89 && bytes[1] === 0x50 && width > 0 && height > 0));
  assert.equal(new Set(rendered.map(({ bytes }) => createHash("sha256").update(bytes).digest("hex"))).size, 2);
});

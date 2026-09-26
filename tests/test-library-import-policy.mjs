import assert from "node:assert/strict";
import test from "node:test";

import {
  PDF_IMPORT_BATCH_MAX_BYTES,
  PDF_IMPORT_BATCH_MAX_FILES,
  PDF_IMPORT_MAX_BYTES,
  partitionLibraryImports,
} from "../preview/js/library-import-policy.js";

const pdf = (name, size) => ({ name, size, type: "application/pdf" });

test("accepts exactly 100 distinct PDFs and rejects the 101st", () => {
  const files = Array.from(
    { length: PDF_IMPORT_BATCH_MAX_FILES + 1 },
    (_, index) => pdf(`source-${index + 1}.pdf`, 1),
  );
  const result = partitionLibraryImports(files);
  assert.equal(result.acceptedPdfs.length, PDF_IMPORT_BATCH_MAX_FILES);
  assert.deepEqual(result.rejected.map(({ reason }) => reason), ["PDF_COUNT"]);
});

test("enforces an exact 512MB PDF batch boundary without allocating file bytes", () => {
  const exact = partitionLibraryImports([
    pdf("first.pdf", PDF_IMPORT_MAX_BYTES),
    pdf("second.pdf", PDF_IMPORT_MAX_BYTES),
  ]);
  assert.equal(exact.acceptedPdfs.length, 2);
  assert.deepEqual(exact.rejected, []);

  const over = partitionLibraryImports([
    pdf("first.pdf", PDF_IMPORT_MAX_BYTES),
    pdf("second.pdf", PDF_IMPORT_MAX_BYTES),
    pdf("third.pdf", 1),
  ]);
  assert.equal(over.acceptedPdfs.length, 2);
  assert.deepEqual(over.rejected.map(({ reason }) => reason), ["PDF_BATCH_SIZE"]);
  assert.equal(PDF_IMPORT_BATCH_MAX_BYTES, PDF_IMPORT_MAX_BYTES * 2);
});

test("applies the aggregate limit from already cataloged PDF metadata", () => {
  const result = partitionLibraryImports([pdf("next.pdf", 1)], {
    currentPdfBytes: PDF_IMPORT_BATCH_MAX_BYTES,
    currentPdfCount: 2,
  });
  assert.deepEqual(result.acceptedPdfs, []);
  assert.deepEqual(result.rejected.map(({ reason }) => reason), ["PDF_BATCH_SIZE"]);
});

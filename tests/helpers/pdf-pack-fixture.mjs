import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createPdfLibraryFixture } from "./pdf-library-fixture.mjs";

export const PDF_PACK_FIXTURE = Object.freeze({
  id: "checkout.fixture.physics",
  version: "1.0.0",
  documentPath: "documents/fixture.pdf",
});

const encoder = new TextEncoder();

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function writePdfPackFixture(directory) {
  const pdfBytes = createPdfLibraryFixture();
  const catalog = {
    schemaVersion: "pdf-library-v1",
    documents: [{
      id: "fixture",
      title: "Checkout-safe physics fixture",
      source: {
        kind: "pack",
        locator: `${PDF_PACK_FIXTURE.id}/${PDF_PACK_FIXTURE.documentPath}`,
        displayName: "fixture.pdf",
      },
      pageCount: 1,
      status: "indexed",
      pages: [],
    }],
    documentMetadata: {
      fixture: { academicYear: 2026, administration: "fixture", subject: "phy1" },
    },
  };
  const searchIndex = {
    schemaVersion: "pdf-search-index-v1",
    entries: [{
      documentId: "fixture",
      documentTitle: "Checkout-safe physics fixture",
      pageNumber: 1,
      itemId: null,
      itemNumber: null,
      text: "Momentum experiment alpha",
      normalized: "momentum experiment alpha",
      words: [],
      source: { documentId: "fixture", pageNumber: 1, rect: [0, 0, 1, 1], fullPageFallback: true },
      figureCandidates: [],
    }],
  };
  const catalogBytes = encoder.encode(JSON.stringify(catalog));
  const searchBytes = encoder.encode(JSON.stringify(searchIndex));
  const assets = new Map([
    ["catalog.json", catalogBytes],
    ["search-index.json", searchBytes],
    [PDF_PACK_FIXTURE.documentPath, pdfBytes],
  ]);
  const pack = {
    schemaVersion: 1,
    id: PDF_PACK_FIXTURE.id,
    version: PDF_PACK_FIXTURE.version,
    title: "Checkout-safe generated fixture",
    kind: "exam",
    subjects: ["phy1"],
    academicYears: [2026],
    documentCount: 1,
    pageCount: 1,
    paths: {
      catalog: "catalog.json",
      searchIndex: "search-index.json",
      documents: [PDF_PACK_FIXTURE.documentPath],
    },
    createdAt: "2026-09-10T00:00:00.000Z",
    minAppVersion: "1.5.3",
  };
  const checksums = {
    algorithm: "sha256",
    pack: sha256(encoder.encode(JSON.stringify(pack))),
    files: Object.fromEntries([...assets].map(([assetPath, bytes]) => [assetPath, sha256(bytes)])),
  };
  await mkdir(path.join(directory, "documents"), { recursive: true });
  await Promise.all([
    writeFile(path.join(directory, "pack.json"), JSON.stringify(pack)),
    writeFile(path.join(directory, "checksums.json"), JSON.stringify(checksums)),
    ...[...assets].map(([assetPath, bytes]) => writeFile(path.join(directory, assetPath), bytes)),
  ]);
  return Object.freeze({ pack, checksums, pdfBytes });
}

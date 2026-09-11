import assert from "node:assert/strict";
import test from "node:test";

import {
  PackValidationError,
  createMemoryPackAdapter,
  createPackStore,
  sha256Hex,
} from "../js/pdf-library/pack-store.js";
import { createPdfLibraryFixture } from "./helpers/pdf-library-fixture.mjs";

const encoder = new TextEncoder();

async function bundle(version = "1.0.0", pdfBytes = createPdfLibraryFixture()) {
  const catalogBytes = encoder.encode(JSON.stringify({
    schemaVersion: "pdf-library-v1",
    documents: [{
      id: "fixture", title: "Fixture", source: { kind: "pack", locator: "self-authored.physics/documents/fixture.pdf", displayName: "fixture.pdf" },
      pageCount: 1, status: "indexed", pages: [{
        documentId: "fixture", pageNumber: 1, widthPoints: 612, heightPoints: 792, rotation: 0,
        text: "Momentum experiment alpha", words: [{ text: "Momentum", rect: [0.1, 0.1, 0.2, 0.03] }], items: [],
      }],
    }],
  }));
  const searchBytes = encoder.encode(JSON.stringify({ schemaVersion: "pdf-search-index-v1", entries: [] }));
  const assets = [
    { path: "catalog.json", bytes: catalogBytes },
    { path: "search-index.json", bytes: searchBytes },
    { path: "documents/fixture.pdf", bytes: pdfBytes },
  ];
  const files = Object.fromEntries(await Promise.all(assets.map(async ({ path, bytes }) => [path, await sha256Hex(bytes)])));
  const pack = {
      schemaVersion: 1,
      id: "self-authored.physics",
      version,
      title: "Self-authored physics fixture",
      kind: "exam",
      subjects: ["physics1"],
      academicYears: [2026],
      documentCount: 1,
      pageCount: 1,
      paths: { catalog: "catalog.json", searchIndex: "search-index.json", documents: ["documents/fixture.pdf"] },
      createdAt: "2026-09-10T00:00:00.000Z",
      minAppVersion: "1.5.3",
  };
  return {
    pack,
    checksums: { algorithm: "sha256", pack: await sha256Hex(encoder.encode(JSON.stringify(pack))), files },
    assets,
  };
}

async function collidingBundle(packId, marker) {
  const input = await bundle("1.0.0", new Uint8Array([...createPdfLibraryFixture(), marker]));
  const pdfPath = "documents/shared.pdf";
  input.pack = { ...input.pack, id: packId, title: packId, paths: { ...input.pack.paths, documents: [pdfPath] } };
  const catalog = JSON.parse(new TextDecoder().decode(input.assets[0].bytes));
  catalog.documents[0].id = "shared-doc";
  catalog.documents[0].title = `Shared from ${packId}`;
  catalog.documents[0].source = { kind: "pack", locator: `${packId}/${pdfPath}`, displayName: "shared.pdf" };
  catalog.documents[0].pages[0].documentId = "shared-doc";
  const search = {
    schemaVersion: "pdf-search-index-v1",
    entries: [{
      documentId: "shared-doc", documentTitle: catalog.documents[0].title, pageNumber: 1,
      itemId: "shared-doc:p1:q1", itemNumber: 1, text: `unique ${packId}`, normalized: `unique ${packId}`,
      words: [{ text: "unique", rect: [0.1, 0.1, 0.1, 0.03] }],
      source: { documentId: "shared-doc", pageNumber: 1, rect: [0, 0, 1, 1], fullPageFallback: false },
      figureCandidates: [{
        kind: "figure-candidate-v1", id: "shared-doc:p1:q1:figure:1", candidateNumber: 1,
        documentId: "shared-doc", pageNumber: 1, itemId: "shared-doc:p1:q1", itemNumber: 1,
        rect: [0.1, 0.1, 0.2, 0.2], source: { documentId: "shared-doc", pageNumber: 1, rect: [0.1, 0.1, 0.2, 0.2], fullPageFallback: false },
        evidence: { imageCount: 1, pathCount: 0 },
      }],
    }],
  };
  input.assets = [
    { path: "catalog.json", bytes: encoder.encode(JSON.stringify(catalog)) },
    { path: "search-index.json", bytes: encoder.encode(JSON.stringify(search)) },
    { path: pdfPath, bytes: input.assets[2].bytes },
  ];
  input.checksums = {
    algorithm: "sha256",
    pack: await sha256Hex(encoder.encode(JSON.stringify(input.pack))),
    files: Object.fromEntries(await Promise.all(input.assets.map(async (asset) => [asset.path, await sha256Hex(asset.bytes)]))),
  };
  return input;
}

test("Given a real PDF bundle, when installed and reopened, then the enabled pack and PDF bytes persist", async () => {
  // Given
  const adapter = createMemoryPackAdapter();
  const firstStore = createPackStore({ adapter });
  const input = await bundle();

  // When
  await firstStore.install(input);
  const reopenedStore = createPackStore({ adapter });

  // Then
  assert.equal((await reopenedStore.list())[0].id, "self-authored.physics");
  assert.deepEqual(await reopenedStore.readAsset("self-authored.physics", "documents/fixture.pdf"), input.assets[2].bytes);
});

test("Given an installed pack, when a valid newer version is installed, then readers see only the new version", async () => {
  // Given
  const adapter = createMemoryPackAdapter();
  const store = createPackStore({ adapter });
  await store.install(await bundle("1.0.0"));

  // When
  await store.install(await bundle("1.1.0"));

  // Then
  assert.deepEqual((await store.list()).map(({ version }) => version), ["1.1.0"]);
  assert.deepEqual(adapter.debugVersions("self-authored.physics"), ["1.1.0"]);
});

test("Given a same-ID document whose pack version changes its PDF, when materialized, then its source digest invalidates old crop overrides", async () => {
  const store = createPackStore({ adapter: createMemoryPackAdapter() });
  await store.install(await bundle("1.0.0"));
  const [before] = await store.enabledDocuments();
  await store.install(await bundle("1.1.0", new Uint8Array([...createPdfLibraryFixture(), 0xa5])));
  const [after] = await store.enabledDocuments();

  assert.equal(after.id, before.id);
  assert.notEqual(after.source.sha256, before.source.sha256);
});

test("Given a valid installed pack, when a corrupted update is attempted, then the prior version remains readable", async () => {
  // Given
  const adapter = createMemoryPackAdapter();
  const store = createPackStore({ adapter });
  await store.install(await bundle("1.0.0"));
  const corrupted = await bundle("1.1.0");
  corrupted.assets[2] = { ...corrupted.assets[2], bytes: encoder.encode("not a pdf") };

  // When / Then
  await assert.rejects(store.install(corrupted), PackValidationError);
  assert.equal((await store.list())[0].version, "1.0.0");
  assert.equal((await store.readAsset("self-authored.physics", "documents/fixture.pdf"))[0], 0x25);
});

test("Given a valid installed pack, when persistence interrupts a validated update, then the prior version remains active", async () => {
  const durable = createMemoryPackAdapter();
  const store = createPackStore({ adapter: durable });
  await store.install(await bundle("1.0.0"));
  const interrupted = Object.freeze({
    list: () => durable.list(),
    readAsset: (...args) => durable.readAsset(...args),
    setEnabled: (...args) => durable.setEnabled(...args),
    remove: (...args) => durable.remove(...args),
    async commitInstall() { throw new Error("simulated interrupted transaction"); },
  });

  await assert.rejects(createPackStore({ adapter: interrupted }).install(await bundle("1.1.0")), /interrupted transaction/);

  assert.equal((await store.list())[0].version, "1.0.0");
  assert.equal((await store.readAsset("self-authored.physics", "documents/fixture.pdf"))[0], 0x25);
});

test("Given a newer installed pack, when a stale update is attempted, then the active pack is unchanged", async () => {
  const adapter = createMemoryPackAdapter();
  const store = createPackStore({ adapter });
  await store.install(await bundle("1.1.0"));

  await assert.rejects(store.install(await bundle("1.0.0")), /older version/);

  assert.equal((await store.list())[0].version, "1.1.0");
  assert.deepEqual(adapter.debugVersions("self-authored.physics"), ["1.1.0"]);
});

test("Given an installed pack, when disabled and removed, then assets disappear while external saved bytes remain", async () => {
  // Given
  const adapter = createMemoryPackAdapter();
  const store = createPackStore({ adapter });
  const input = await bundle();
  await store.install(input);
  const savedProjectBytes = input.assets[2].bytes.slice();

  // When
  await store.setEnabled("self-authored.physics", false);
  const disabled = await store.list();
  await store.remove("self-authored.physics");

  // Then
  assert.equal(disabled[0].enabled, false);
  assert.equal((await store.list()).length, 0);
  await assert.rejects(store.readAsset("self-authored.physics", "documents/fixture.pdf"), /not installed/i);
  assert.equal(savedProjectBytes.byteLength, input.assets[2].bytes.byteLength);
});

test("Given an enabled installed pack, when documents are materialized and opened, then the runtime receives persisted PDF bytes", async () => {
  // Given
  const store = createPackStore({ adapter: createMemoryPackAdapter() });
  await store.install(await bundle());
  const calls = [];
  const runtime = { async openDocument(input) { calls.push(input); return { id: input.id }; } };

  // When
  const [document] = await store.enabledDocuments();
  const opened = await store.openDocument(runtime, document);

  // Then
  assert.equal(opened.id, "self-authored.physics::fixture");
  assert.equal(calls[0].data[0], 0x25);
  assert.equal(calls[0].source.locator, "self-authored.physics/documents/fixture.pdf");
  assert.equal(document.source.sha256, (await bundle()).checksums.files["documents/fixture.pdf"]);
});

test("Given an oversized or path-traversing bundle, when installed, then it is rejected before adapter mutation", async () => {
  // Given
  const adapter = createMemoryPackAdapter();
  const store = createPackStore({ adapter, limits: { maxFileBytes: 16, maxTotalBytes: 32, maxFiles: 4 } });
  const input = await bundle();
  input.assets[0] = { path: "../catalog.json", bytes: input.assets[0].bytes };

  // When / Then
  await assert.rejects(store.install(input), PackValidationError);
  assert.equal(adapter.debugCommitCount(), 0);
});

test("Given two enabled packs with the same internal document IDs, when materialized, then search, selection, and opening remain pack-specific", async () => {
  const store = createPackStore({ adapter: createMemoryPackAdapter() });
  await store.install(await collidingBundle("pack-a", 0xa1));
  await store.install(await collidingBundle("pack-b", 0xb2));

  const catalog = await store.enabledCatalog();
  assert.deepEqual(catalog.documents.map((document) => document.id), ["pack-a::shared-doc", "pack-b::shared-doc"]);
  assert.deepEqual(catalog.searchIndex.entries.map((entry) => entry.documentId), ["pack-a::shared-doc", "pack-b::shared-doc"]);
  assert.deepEqual(catalog.searchIndex.entries.map((entry) => entry.itemId), ["pack-a::shared-doc:p1:q1", "pack-b::shared-doc:p1:q1"]);
  assert.deepEqual(catalog.searchIndex.entries.map((entry) => entry.figureCandidates[0].id), [
    "pack-a::shared-doc:p1:q1:figure:1", "pack-b::shared-doc:p1:q1:figure:1",
  ]);
  assert.notEqual(catalog.documents[0].source.sha256, catalog.documents[1].source.sha256);

  const runtime = { async openDocument(input) { return { id: input.id, marker: input.data.at(-1) }; } };
  assert.deepEqual(await Promise.all(catalog.documents.map((document) => store.openDocument(runtime, document))), [
    { id: "pack-a::shared-doc", marker: 0xa1 }, { id: "pack-b::shared-doc", marker: 0xb2 },
  ]);
});

import assert from "node:assert/strict";
import test from "node:test";

import { candidatePackMetadata, packUpdateStatus } from "../js/pdf-library/pack-release-model.js";

const metadata = Object.freeze({
  schemaVersion: 1,
  status: "candidate",
  configuredPackBaseUrl: "../pack/recent-three/",
  pack: Object.freeze({
    id: "ebsi.recent-three.science",
    version: "1.1.0",
    path: "pack/recent-three",
    documentCount: 72,
    pageCount: 288,
    files: 76,
    bytes: 140405401,
    packManifestSha256: "a".repeat(64),
    checksumsManifestSha256: "b".repeat(64),
  }),
});

test("Given candidate metadata, when parsed, then exact version, size, and checksums are available to the update surface", () => {
  const parsed = candidatePackMetadata(metadata);

  assert.deepEqual(parsed, metadata.pack);
});

test("Given candidate and installed versions, when update status is derived, then install, update, current, and stale are distinct", () => {
  assert.equal(packUpdateStatus(metadata.pack, null).status, "install");
  assert.equal(packUpdateStatus(metadata.pack, { id: metadata.pack.id, version: "1.0.0" }).status, "update");
  assert.equal(packUpdateStatus(metadata.pack, { id: metadata.pack.id, version: "1.1.0" }).status, "current");
  assert.equal(packUpdateStatus(metadata.pack, { id: metadata.pack.id, version: "2.0.0" }).status, "stale");
});

test("Given malformed candidate metadata, when parsed, then unsafe paths, oversized values, and invalid hashes are rejected", () => {
  assert.throws(() => candidatePackMetadata({ ...metadata, pack: { ...metadata.pack, path: "../pack" } }), /path/);
  assert.throws(() => candidatePackMetadata({ ...metadata, pack: { ...metadata.pack, bytes: Number.MAX_SAFE_INTEGER } }), /bytes/);
  assert.throws(() => candidatePackMetadata({ ...metadata, pack: { ...metadata.pack, packManifestSha256: "misleading-log-value" } }), /SHA-256/);
});

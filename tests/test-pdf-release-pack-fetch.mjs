import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { PDF_PACK_FIXTURE, writePdfPackFixture } from "./helpers/pdf-pack-fixture.mjs";
import { fetchReleasePack } from "../tools/pdf-library/fetch-release-pack.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fixtureIdentity(directory) {
  const [packBytes, checksumBytes] = await Promise.all([
    readFile(path.join(directory, "pack.json")), readFile(path.join(directory, "checksums.json")),
  ]);
  const pack = JSON.parse(packBytes.toString("utf8"));
  return {
    id: pack.id, version: pack.version, documentCount: pack.documentCount, pageCount: pack.pageCount,
    packManifestSha256: sha256(packBytes), checksumsManifestSha256: sha256(checksumBytes),
  };
}

async function servePack(t, directory, overrides = {}) {
  const requested = [];
  const server = createServer(async (request, response) => {
    const relativePath = new URL(request.url, "http://127.0.0.1").pathname.slice(1);
    requested.push(relativePath);
    try {
      const bytes = Object.hasOwn(overrides, relativePath) ? overrides[relativePath] : await readFile(path.join(directory, relativePath));
      response.writeHead(200, { "content-length": bytes.byteLength }).end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { baseUrl: `http://127.0.0.1:${server.address().port}/`, requested };
}

test("Given a release pack on controlled loopback HTTP, when fetched, then only declared checksum-verified files are staged", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "5e-release-pack-fetch-"));
  const source = path.join(temporary, "source");
  const output = path.join(temporary, "output");
  t.after(() => rm(temporary, { recursive: true, force: true }));
  await writePdfPackFixture(source);
  const served = await servePack(t, source);

  const result = await fetchReleasePack({ baseUrl: served.baseUrl, output, expectedIdentity: await fixtureIdentity(source) });

  assert.deepEqual({ id: result.id, documents: result.documents, pages: result.pages }, { id: PDF_PACK_FIXTURE.id, documents: 1, pages: 1 });
  assert.deepEqual((await readdir(output)).sort(), ["catalog.json", "checksums.json", "documents", "pack.json", "search-index.json"]);
  assert.equal(Buffer.from(await readFile(path.join(output, PDF_PACK_FIXTURE.documentPath))).subarray(0, 5).toString("ascii"), "%PDF-");
  assert.deepEqual(served.requested.sort(), ["catalog.json", "checksums.json", "documents/fixture.pdf", "pack.json", "search-index.json"]);
});

test("Given an altered frozen manifest, when fetched, then rejection happens before any declared asset request", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "5e-release-pack-corrupt-"));
  const source = path.join(temporary, "source");
  const output = path.join(temporary, "output");
  t.after(() => rm(temporary, { recursive: true, force: true }));
  await writePdfPackFixture(source);
  const expectedIdentity = await fixtureIdentity(source);
  const originalPack = await readFile(path.join(source, "pack.json"));
  const served = await servePack(t, source, { "pack.json": Buffer.concat([originalPack, Buffer.from("\n")]) });

  await assert.rejects(fetchReleasePack({ baseUrl: served.baseUrl, output, expectedIdentity }), /release manifest hashes do not match/i);
  assert.deepEqual(served.requested.sort(), ["checksums.json", "pack.json"]);
  assert.equal((await readdir(temporary)).some((name) => name.startsWith("output")), false);
});

test("Given a frozen manifest with a traversal asset, when fetched, then the path is rejected before asset download", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "5e-release-pack-traversal-"));
  const source = path.join(temporary, "source");
  const output = path.join(temporary, "output");
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const fixture = await writePdfPackFixture(source);
  const pack = structuredClone(fixture.pack);
  const checksums = structuredClone(fixture.checksums);
  pack.paths.documents = ["../outside.pdf"];
  checksums.pack = sha256(Buffer.from(JSON.stringify(pack)));
  checksums.files["../outside.pdf"] = checksums.files[PDF_PACK_FIXTURE.documentPath];
  delete checksums.files[PDF_PACK_FIXTURE.documentPath];
  await Promise.all([
    writeFile(path.join(source, "pack.json"), JSON.stringify(pack)),
    writeFile(path.join(source, "checksums.json"), JSON.stringify(checksums)),
  ]);
  const served = await servePack(t, source);

  await assert.rejects(fetchReleasePack({ baseUrl: served.baseUrl, output, expectedIdentity: await fixtureIdentity(source) }), /unsafe asset path/i);
  assert.deepEqual(served.requested.sort(), ["checksums.json", "pack.json"]);
});

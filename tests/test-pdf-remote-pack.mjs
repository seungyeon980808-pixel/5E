import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { defaultRecentThreePack } from "../js/pdf-library/default-pack-config.js";
import { sha256Hex } from "../js/pdf-library/pack-store.js";
import { loadRemotePack } from "../js/pdf-library/remote-pack.js";
import { PDF_PACK_FIXTURE, writePdfPackFixture } from "./helpers/pdf-pack-fixture.mjs";

async function fixtureDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "5e-pdf-pack-fixture-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writePdfPackFixture(directory);
  return directory;
}

test("Given a hosted pack, when its catalog loads, then metadata stays lazy and the selected PDF is verified before opening", async (t) => {
  // Given
  const directory = await fixtureDirectory(t);
  const baseUrl = "https://example.test/packs/partial/";
  const requested = [];
  const fetcher = async (url) => {
    requested.push(url);
    const relative = new URL(url).pathname.split("/packs/partial/")[1];
    return new Response(await readFile(path.join(directory, relative)), { status: 200 });
  };

  // When
  const remote = await loadRemotePack({ baseUrl, fetcher });

  // Then
  assert.deepEqual(requested.map((url) => new URL(url).pathname.split("/").at(-1)).sort(), ["catalog.json", "checksums.json", "pack.json", "search-index.json"]);
  assert.equal(remote.documents.length, 1);
  const checksumManifest = JSON.parse(await readFile(path.join(directory, "checksums.json"), "utf8"));
  assert.equal(remote.documents[0].source.sha256, checksumManifest.files[PDF_PACK_FIXTURE.documentPath]);
  const runtime = { async openDocumentResource(input) { return input; } };
  const opened = await remote.openDocument(runtime, remote.documents[0]);
  assert.equal(opened.data[0], 0x25);
  assert.equal(opened.url, undefined);
  assert.equal(requested.length, 5);
});

test("Given a cached remote PDF, when it is downloaded and opened again, then the verified bytes are fetched once", async (t) => {
  const directory = await fixtureDirectory(t);
  const baseUrl = "https://example.test/packs/cached/";
  let pdfRequests = 0;
  const cache = new Map();
  const assetCache = {
    async get(url, checksum) { return cache.get(`${url}:${checksum}`)?.slice() || null; },
    async put(url, checksum, bytes) { cache.set(`${url}:${checksum}`, bytes.slice()); },
    async delete(url, checksum) { cache.delete(`${url}:${checksum}`); },
  };
  const fetcher = async (url) => {
    const relative = new URL(url).pathname.split("/packs/cached/")[1];
    if (relative.endsWith(".pdf")) pdfRequests += 1;
    return new Response(await readFile(path.join(directory, relative)), { status: 200 });
  };
  const first = await loadRemotePack({ baseUrl, fetcher, assetCache });
  const downloaded = await first.downloadDocument(first.documents[0]);
  const second = await loadRemotePack({ baseUrl, fetcher, assetCache });
  const opened = await second.openDocument({ async openDocumentResource(value) { return value; } }, second.documents[0]);

  assert.equal(downloaded.fileName, "fixture.pdf");
  assert.equal(opened.data[0], 0x25);
  assert.equal(pdfRequests, 1);
});

test("Given a hosted pack whose selected PDF differs from its checksum, when opened, then parsing is rejected", async (t) => {
  const directory = await fixtureDirectory(t);
  const baseUrl = "https://example.test/packs/partial/";
  const fetcher = async (url) => {
    const relative = new URL(url).pathname.split("/packs/partial/")[1];
    if (relative.endsWith(".pdf")) return new Response(new TextEncoder().encode("%PDF-substituted"), { status: 200 });
    return new Response(await readFile(path.join(directory, relative)), { status: 200 });
  };
  const remote = await loadRemotePack({ baseUrl, fetcher });
  let runtimeCalls = 0;

  await assert.rejects(remote.openDocument({ async openDocumentResource() { runtimeCalls += 1; } }, remote.documents[0]), /SHA-256 mismatch/);
  assert.equal(runtimeCalls, 0);
});

test("Given a hosted pack whose selected PDF exceeds the byte limit, when opened, then streaming stops before parsing", async (t) => {
  const directory = await fixtureDirectory(t);
  const baseUrl = "https://example.test/packs/partial/";
  const fetcher = async (url) => {
    const relative = new URL(url).pathname.split("/packs/partial/")[1];
    if (relative.endsWith(".pdf")) return new Response(new Uint8Array([0x25]), { status: 200, headers: { "content-length": String(256 * 1024 * 1024 + 1) } });
    return new Response(await readFile(path.join(directory, relative)), { status: 200 });
  };
  const remote = await loadRemotePack({ baseUrl, fetcher });
  let runtimeCalls = 0;

  await assert.rejects(remote.openDocument({ async openDocumentResource() { runtimeCalls += 1; } }, remote.documents[0]), /exceeds 268435456 bytes/);
  assert.equal(runtimeCalls, 0);
});

test("Given a hosted pack whose selected asset has a matching hash but is not a PDF, when opened, then parsing is rejected", async (t) => {
  const directory = await fixtureDirectory(t);
  const baseUrl = "https://example.test/packs/partial/";
  const badBytes = new TextEncoder().encode("not a PDF");
  let cacheWrites = 0;
  const checksums = JSON.parse(await readFile(path.join(directory, "checksums.json"), "utf8"));
  checksums.files[PDF_PACK_FIXTURE.documentPath] = await sha256Hex(badBytes);
  const fetcher = async (url) => {
    const relative = new URL(url).pathname.split("/packs/partial/")[1];
    if (relative === "checksums.json") return new Response(JSON.stringify(checksums), { status: 200 });
    if (relative.endsWith(".pdf")) return new Response(badBytes, { status: 200 });
    return new Response(await readFile(path.join(directory, relative)), { status: 200 });
  };
  const remote = await loadRemotePack({
    baseUrl,
    fetcher,
    assetCache: { async get() { return null; }, async put(url) { if (url.endsWith(".pdf")) cacheWrites += 1; }, async delete() {} },
  });
  let runtimeCalls = 0;

  await assert.rejects(remote.openDocument({ async openDocumentResource() { runtimeCalls += 1; } }, remote.documents[0]), /expected PDF bytes/);
  assert.equal(runtimeCalls, 0);
  assert.equal(cacheWrites, 0);
});

test("Given no deployed pack URL, when production config resolves, then it reports the unavailable state instead of inventing data", () => {
  // Given
  const location = { hostname: "5e.example", href: "https://5e.example/" };

  // When
  const config = defaultRecentThreePack(location, "");

  // Then
  assert.equal(config.status, "unconfigured");
  assert.equal(config.baseUrl, "");
  assert.match(config.message, /자료팩 주소/);
});

test("Given an explicit blank pack URL on the loopback gateway, when config resolves, then local review artifacts are not requested", () => {
  const location = { hostname: "127.0.0.1", href: "http://127.0.0.1:19385/editor/" };

  const config = defaultRecentThreePack(location, "");

  assert.equal(config.status, "unconfigured");
  assert.equal(config.baseUrl, "");
  assert.match(config.message, /자료팩 주소/);
});

test("Given no pack global on localhost, when config resolves, then repository evidence is never a production default", () => {
  const location = { hostname: "localhost", href: "http://localhost:4173/editor/" };
  const config = defaultRecentThreePack(location, undefined);
  assert.equal(config.status, "unconfigured");
  assert.equal(config.baseUrl, "");
  assert.equal(config.baseUrl.includes(".omo"), false);
});

test("Given an explicit pack URL, when config resolves, then the configured gateway URL is preserved", () => {
  const location = { hostname: "5e.example", href: "https://5e.example/editor/" };
  const config = defaultRecentThreePack(location, "/packs/recent-three/");
  assert.deepEqual(config, { status: "configured", baseUrl: "https://5e.example/packs/recent-three/", message: "" });
});

test("Given an insecure public pack URL, when config resolves, then deployment configuration is rejected", () => {
  const location = { hostname: "5e.example", href: "https://5e.example/editor/" };

  assert.throws(() => defaultRecentThreePack(location, "http://downloads.example/recent-three/"), /HTTPS.*relative/i);
});

test("Given a relative candidate pack URL, when config resolves, then it remains portable across candidate hosts", () => {
  const location = { hostname: "127.0.0.1", href: "http://127.0.0.1:24871/app/index.html" };

  const config = defaultRecentThreePack(location, "../pack/recent-three/");

  assert.deepEqual(config, { status: "configured", baseUrl: "http://127.0.0.1:24871/pack/recent-three/", message: "" });
});

test("Given an insecure public remote pack URL, when loading starts, then it rejects before the first fetch", async () => {
  // Given
  let fetchCount = 0;
  const fetcher = async () => { fetchCount += 1; throw new Error("must not fetch"); };

  // When / Then
  await assert.rejects(loadRemotePack({ baseUrl: "http://203.0.113.10/pack/", fetcher }), /HTTPS|loopback/i);
  assert.equal(fetchCount, 0);
});

test("Given ambiguous or credentialed remote pack URLs, when loading starts, then every URL is rejected before fetch", async () => {
  // Given
  const rejected = [
    "http://localhost:4177/pack/",
    "http://127.0.0.2:4177/pack/",
    "ftp://127.0.0.1/pack/",
    "https://user:secret@example.test/pack/",
  ];
  let fetchCount = 0;
  const fetcher = async () => { fetchCount += 1; throw new Error("must not fetch"); };

  // When
  const outcomes = await Promise.allSettled(rejected.map((baseUrl) => loadRemotePack({ baseUrl, fetcher })));

  // Then
  assert.equal(outcomes.every((outcome) => outcome.status === "rejected"), true);
  assert.equal(fetchCount, 0);
});

test("Given exact IPv4 and IPv6 loopback HTTP pack URLs, when loading starts, then controlled development fetches are allowed", async () => {
  // Given
  const requested = [];
  const fetcher = async (url) => { requested.push(url); return new Response("missing", { status: 404 }); };

  // When
  const outcomes = await Promise.allSettled([
    loadRemotePack({ baseUrl: "http://127.0.0.1:4177/pack/", fetcher }),
    loadRemotePack({ baseUrl: "http://[::1]:4177/pack/", fetcher }),
  ]);

  // Then
  assert.equal(outcomes.every((outcome) => outcome.status === "rejected" && /HTTP 404/.test(outcome.reason.message)), true);
  assert.equal(requested.length, 4);
});

test("Given an HTTPS request redirected to public HTTP, when the final response URL is exposed, then downgrade is rejected", async () => {
  // Given
  let bodyReads = 0;
  const fetchOptions = [];
  const fetcher = async (_url, options) => {
    fetchOptions.push(options);
    return ({
    ok: true,
    status: 200,
    url: "http://downloads.example.test/pack/pack.json",
    headers: new Headers(),
    body: { getReader() { bodyReads += 1; throw new Error("must not read"); } },
    });
  };

  // When / Then
  await assert.rejects(loadRemotePack({ baseUrl: "https://example.test/pack/", fetcher }), /HTTPS|loopback/i);
  assert.equal(bodyReads, 0);
  assert.deepEqual(fetchOptions, [{ redirect: "manual" }, { redirect: "manual" }]);
});

test("Given encoded traversal or URL suffixes in pack paths, when the manifest loads, then assets outside the pack root are never requested", async () => {
  // Given
  const unsafePaths = [
    "%2e%2e/catalog.json",
    "catalog%2f..%2foutside.json",
    "catalog%5c..%5coutside.json",
    "catalog.json?variant=outside",
    "catalog.json#outside",
  ];

  // When
  const outcomes = await Promise.all(unsafePaths.map(async (catalogPath) => {
    const pack = {
      schemaVersion: 1,
      id: "checkout-safe.probe",
      version: "1.0.0",
      documentCount: 0,
      pageCount: 0,
      paths: { catalog: catalogPath, searchIndex: "search-index.json", documents: [] },
    };
    const checksums = {
      algorithm: "sha256",
      pack: await sha256Hex(new TextEncoder().encode(JSON.stringify(pack))),
      files: { [catalogPath]: "a".repeat(64), "search-index.json": "b".repeat(64) },
    };
    const requested = [];
    const fetcher = async (url) => {
      requested.push(url);
      if (url.endsWith("/pack.json")) return new Response(JSON.stringify(pack), { status: 200 });
      if (url.endsWith("/checksums.json")) return new Response(JSON.stringify(checksums), { status: 200 });
      return new Response("outside", { status: 404 });
    };
    const outcome = await loadRemotePack({ baseUrl: "https://example.test/packs/probe/", fetcher }).then(
      () => ({ error: null, requested }),
      (error) => ({ error, requested }),
    );
    return outcome;
  }));

  // Then
  for (const outcome of outcomes) {
    assert.match(outcome.error?.message || "", /safe relative path/i);
    assert.deepEqual(outcome.requested.map((url) => new URL(url).pathname.split("/").at(-1)).sort(), ["checksums.json", "pack.json"]);
  }
});

 test("indexed remote PDF opens its resource without scanning pages again", async (t) => {
  const directory = await fixtureDirectory(t);
  const remote = await loadRemotePack({baseUrl:"https://example.test/",fetcher: async url => new Response(await readFile(path.join(directory,new URL(url).pathname)))});
  let resourceRecord;
  await remote.openDocument({openDocument() { assert.fail("must not reindex"); },async openDocumentResource(input,record) {resourceRecord=record;return record;}},remote.documents[0]);
  assert.equal(resourceRecord,remote.documents[0]);
});

test("unchanged search index is reused from the verified browser cache", async (t) => {
  const directory = await fixtureDirectory(t); const cache = new Map(); let indexRequests = 0;
  const options = {baseUrl:"https://example.test/", assetCache:{async get(u,h){return cache.get(u+h);},async put(u,h,b){cache.set(u+h,b);}},fetcher:async url=>{if(url.endsWith('search-index.json'))indexRequests++;return new Response(await readFile(path.join(directory,new URL(url).pathname)));}};
  await loadRemotePack(options); await loadRemotePack(options);
  assert.equal(indexRequests,1);
});

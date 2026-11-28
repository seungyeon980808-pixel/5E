// 11-20: 「5E 공유 자료」 검색 색인 나눠 받기(search-index-parts.json → search-index-2.json …).
// 첫 색인은 1.7.1 이하 앱이 그대로 읽고, 새 판은 조각까지 이어 붙인다. 32MiB 한도는 파일마다.
import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryPackAdapter, createPackStore, sha256Hex } from "../js/pdf-library/pack-store.js";
import { loadRemotePack } from "../js/pdf-library/remote-pack.js";
import { createStaticMirrorFetcher, staticMirrorPath, STATIC_MIRROR_BASE } from "../js/pdf-library/static-mirror.js";
import { SEARCH_INDEX_PARTS_PATH, SEARCH_INDEX_PARTS_SCHEMA, isSearchIndexFile, searchIndexPartName, searchIndexPartPaths } from "../js/pdf-library/search-index-parts.js";

const baseUrl = "https://fixture.example/pack/";
const encode = (value) => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
const entry = (documentId, text) => ({ documentId, pageNumber: 1, text, normalized: text, source: { documentId, pageNumber: 1, rect: [0, 0, 1, 1] } });
const document = (id) => ({ id, title: `${id}.pdf`, pageCount: 1, status: "indexed", pages: [], source: { kind: "pack", locator: `fixture/${id}.pdf`, displayName: `${id}.pdf` } });

async function fixture({ parts = true } = {}) {
  const catalog = { schemaVersion: 1, documents: [document("june"), document("sept")], documentMetadata: {} };
  const files = {
    "catalog.json": encode(catalog),
    "search-index.json": encode({ schemaVersion: "pdf-search-index-v1", entries: [entry("june", "6월 모평 핵반응")] }),
    "june.pdf": encode("%PDF-1.7 june"),
    "sept.pdf": encode("%PDF-1.7 sept"),
  };
  if (parts) {
    files["search-index-2.json"] = encode({ schemaVersion: "pdf-search-index-v1", entries: [entry("sept", "9월 모평 별의 진화")] });
    files[SEARCH_INDEX_PARTS_PATH] = encode({ schemaVersion: SEARCH_INDEX_PARTS_SCHEMA, parts: ["search-index-2.json"] });
  }
  // pack.json 모양은 옛 판과 같다(조각 목록을 pack.json에 넣지 않는다).
  const pack = { schemaVersion: 1, id: "fixture", version: "1.2.0", title: "기출", kind: "exam", subjects: ["물리학Ⅰ"], academicYears: [2027], documentCount: 2, pageCount: 2,
    paths: { catalog: "catalog.json", searchIndex: "search-index.json", documents: ["june.pdf", "sept.pdf"] }, createdAt: "2026-11-20T00:00:00.000Z", minAppVersion: "1.6.0" };
  const checksums = { algorithm: "sha256", pack: await sha256Hex(encode(pack)), files: Object.fromEntries(await Promise.all(Object.entries(files).map(async ([name, bytes]) => [name, await sha256Hex(bytes)]))) };
  const served = { ...files, "pack.json": encode(pack), "checksums.json": encode(checksums) };
  const calls = [];
  return { pack, checksums, files, served, calls, fetcher: async (url) => { const name = new URL(url).pathname.split("/").at(-1); calls.push(name); return new Response(served[name] || "missing", { status: served[name] ? 200 : 404 }); } };
}

test("parts manifest accepts only top-level search-index-<n>.json names", () => {
  assert.deepEqual(searchIndexPartPaths({ schemaVersion: SEARCH_INDEX_PARTS_SCHEMA, parts: ["search-index-2.json", "search-index-3.json"] }), ["search-index-2.json", "search-index-3.json"]);
  for (const parts of [["../search-index-2.json"], ["catalog.json"], ["search-index-2.json", "search-index-2.json"], ["sub/search-index-2.json"]]) {
    assert.throws(() => searchIndexPartPaths({ schemaVersion: SEARCH_INDEX_PARTS_SCHEMA, parts }));
  }
  assert.throws(() => searchIndexPartPaths({ schemaVersion: "other", parts: [] }));
  assert.equal(searchIndexPartName(2), "search-index-2.json");
  assert.ok(isSearchIndexFile("search-index.json") && isSearchIndexFile("search-index-12.json") && !isSearchIndexFile("search-index-parts.json"));
});

test("remote pack joins the first index and its parts, all checksum-verified", async () => {
  const f = await fixture();
  const pack = await loadRemotePack({ baseUrl, catalogFirst: true, assetCache: null, fetcher: f.fetcher });
  const index = await pack.loadSearchIndex();
  assert.deepEqual(index.entries.map((item) => [item.documentId, item.text]), [["fixture::june", "6월 모평 핵반응"], ["fixture::sept", "9월 모평 별의 진화"]]);
  assert.ok(f.calls.includes(SEARCH_INDEX_PARTS_PATH) && f.calls.includes("search-index-2.json"));
});

test("a pack without parts reads only the first index (as before)", async () => {
  const f = await fixture({ parts: false });
  const pack = await loadRemotePack({ baseUrl, catalogFirst: true, assetCache: null, fetcher: f.fetcher });
  assert.equal((await pack.loadSearchIndex()).entries.length, 1);
  assert.ok(!f.calls.includes(SEARCH_INDEX_PARTS_PATH));
});

test("a missing or corrupt part keeps the first index searchable and retries the part later", async () => {
  const f = await fixture();
  const good = f.served["search-index-2.json"];
  f.served["search-index-2.json"] = encode({ schemaVersion: "pdf-search-index-v1", entries: [] });
  const pack = await loadRemotePack({ baseUrl, catalogFirst: true, assetCache: null, fetcher: f.fetcher });
  const warn = console.warn; console.warn = () => {};
  try { assert.deepEqual((await pack.loadSearchIndex()).entries.map((item) => item.documentId), ["fixture::june"]); }
  finally { console.warn = warn; }
  f.served["search-index-2.json"] = good;
  assert.equal((await pack.loadSearchIndex()).entries.length, 2);
});

test("static mirror serves parts and joins each split index file", async () => {
  assert.equal(staticMirrorPath(SEARCH_INDEX_PARTS_PATH), SEARCH_INDEX_PARTS_PATH);
  assert.equal(staticMirrorPath("search-index-2.json"), "search-index-2.json");
  const root = "https://gateway.example/v1/google-drive/folders/abc/public/";
  const ok = (body) => new Response(body, { status: 200 });
  const fetcher = async (url) => {
    if (url === `${STATIC_MIRROR_BASE}search-index-2.json.parts.json`) return ok(JSON.stringify({ parts: 2 }));
    if (url === `${STATIC_MIRROR_BASE}search-index-2.json.part0`) return ok('{"b":');
    if (url === `${STATIC_MIRROR_BASE}search-index-2.json.part1`) return ok("2}");
    if (url === `${STATIC_MIRROR_BASE}${SEARCH_INDEX_PARTS_PATH}`) return ok("parts");
    return ok("gateway");
  };
  const mirrored = createStaticMirrorFetcher(root, { fetcher });
  assert.deepEqual(await (await mirrored(`${root}search-index-2.json`)).json(), { b: 2 });
  assert.equal(await (await mirrored(`${root}${SEARCH_INDEX_PARTS_PATH}`)).text(), "parts");
});

test("installed packs validate and read their parts too", async () => {
  const f = await fixture();
  const store = createPackStore({ adapter: createMemoryPackAdapter() });
  await store.install({ pack: f.pack, checksums: f.checksums, assets: Object.entries(f.files).map(([path, bytes]) => ({ path, bytes })) });
  const catalog = await store.enabledCatalog();
  assert.deepEqual(catalog.searchIndex.entries.map((item) => item.documentId), ["fixture::june", "fixture::sept"]);
  const broken = await fixture();
  broken.files[SEARCH_INDEX_PARTS_PATH] = encode({ schemaVersion: SEARCH_INDEX_PARTS_SCHEMA, parts: ["search-index-3.json"] });
  broken.checksums.files[SEARCH_INDEX_PARTS_PATH] = await sha256Hex(broken.files[SEARCH_INDEX_PARTS_PATH]);
  await assert.rejects(createPackStore({ adapter: createMemoryPackAdapter() }).install({ pack: broken.pack, checksums: broken.checksums, assets: Object.entries(broken.files).map(([path, bytes]) => ({ path, bytes })) }), /missing/);
});

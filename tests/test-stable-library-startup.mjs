import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256Hex } from '../js/pdf-library/pack-store.js';
import { loadRemotePack, remoteCatalogSnapshot, validateRemoteCatalogSnapshot } from '../js/pdf-library/remote-pack.js';
import { loadCatalogFirst, createCatalogSnapshotCache } from '../js/pdf-library/catalog-startup.js';
const baseUrl = 'https://fixture.example/pack/';
const encode = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
async function fixture(version = '1', title = '과학') {
  const pdf = encode('%PDF-1.7\n' + version);
  const catalog = { schemaVersion: 1, documents: [{ id: 'book', title, pageCount: 1, status: 'indexed', pages: [], source: { kind: 'pack', locator: 'fixture/book.pdf', displayName: '교과서.pdf' } }], documentMetadata: { book: { category: 'textbooks' } } };
  const index = { schemaVersion: 'pdf-search-index-v1', entries: [{ documentId: 'book', pageNumber: 1, text: '힘 운동', source: { documentId: 'book', pageNumber: 1, rect: [0,0,1,1] } }] };
  const pack = { schemaVersion: 1, id: 'fixture', version, title, documentCount: 1, pageCount: 1, paths: { catalog: 'catalog.json', searchIndex: 'search.json' } };
  const files = { 'catalog.json': encode(catalog), 'search.json': encode(index), 'book.pdf': pdf };
  const checksums = { algorithm: 'sha256', pack: await sha256Hex(encode(pack)), files: Object.fromEntries(await Promise.all(Object.entries(files).map(async ([name, bytes]) => [name, await sha256Hex(bytes)]))) };
  files['pack.json'] = encode(pack); files['checksums.json'] = encode(checksums);
  const snapshot = await remoteCatalogSnapshot(baseUrl, pack, checksums, catalog);
  const calls = [];
  return { pack, catalog, checksums, snapshot, files, calls, async fetcher(url) { const name = new URL(url).pathname.split('/').at(-1); calls.push(name); return new Response(files[name] || 'missing', { status: files[name] ? 200 : 404 }); } };
}
const noCache = { read: async () => null, write: async () => {} };
test('catalog can be listed while search is blocked; PDF stays lazy and checksum-verified', async () => {
  const f = await fixture(); let release; const gate = new Promise(r => release = r);
  const pack = await loadRemotePack({ baseUrl, catalogFirst: true, assetCache: null, fetcher: async url => { if (url.endsWith('/search.json')) await gate; return f.fetcher(url); } });
  assert.equal(pack.documents.length, 1); assert.deepEqual(f.calls.sort(), ['catalog.json','checksums.json','pack.json']);
  assert.equal(pack.searchIndex.entries.length, 0);
  const search = pack.loadSearchIndex(); assert.strictEqual(search, pack.loadSearchIndex());
  const pdf = await pack.downloadDocument(pack.documents[0]); assert.deepEqual(pdf.bytes, f.files['book.pdf']);
  release(); assert.equal((await search).entries[0].documentId, 'fixture::book');
  f.files['book.pdf'] = encode('%PDF-corrupt'); await assert.rejects(pack.downloadDocument(pack.documents[0]), /SHA-256/);
});
test('verified bootstrap needs no gateway request for first list; refresh skips unchanged catalog', async () => {
  const f = await fixture(); const bytes = encode(f.snapshot);
  const initial = await loadCatalogFirst({ baseUrl, assetCache: null, snapshotCache: noCache, bootstrap: { url: 'https://fixture.example/bootstrap.json', sha256: await sha256Hex(bytes) }, fetcher: url => url.includes('bootstrap') ? Promise.resolve(new Response(bytes)) : f.fetcher(url) });
  assert.equal(initial.pack.documentCount, 1); assert.equal(f.calls.length, 0);
  const latest = await initial.refresh(); assert.deepEqual(f.calls.sort(), ['checksums.json','pack.json']);
  assert.equal((await latest.loadSearchIndex()).entries.length, 1);
});
test('stored catalog remains available offline and ignores storage failures', async () => {
  const f = await fixture(); const initial = await loadCatalogFirst({ baseUrl, assetCache: null, snapshotCache: { read: async () => f.snapshot, write: async () => { throw Error('quota'); } }, fetcher: async () => { throw Error('offline'); } });
  assert.equal(initial.pack.documents[0].title, '과학'); await assert.rejects(initial.refresh(), /offline/);
});
test('corrupted or wrong-folder snapshot is rejected; valid remote fallback works', async () => {
  const f = await fixture(); const bad = structuredClone(f.snapshot); bad.payload.catalog.documents[0].title = 'corrupt';
  assert.equal(await validateRemoteCatalogSnapshot(bad, baseUrl), null);
  assert.equal(await validateRemoteCatalogSnapshot(f.snapshot, 'https://other.example/'), null);
  const result = await loadRemotePack({ baseUrl, catalogFirst: true, snapshot: bad, fetcher: f.fetcher, assetCache: null });
  assert.equal(result.documents[0].title, '과학'); assert.ok(f.calls.includes('catalog.json'));
});
test('changed catalog loads new identities while preserving the original snapshot pack', async () => {
  const old = await fixture(); const next = await fixture('2','물리');
  const initial = await loadCatalogFirst({ baseUrl, assetCache: null, snapshotCache: { read: async () => old.snapshot, write: async () => {} }, fetcher: next.fetcher });
  const latest = await initial.refresh(); assert.equal(latest.documents[0].title, '물리');
  assert.notEqual(latest.documents[0].source.sha256, initial.pack.documents[0].source.sha256);
  assert.equal(initial.pack.documents[0].title, '과학'); assert.ok(next.calls.includes('catalog.json'));
});
test('index failure is retryable and never removes usable files', async () => {
  const f = await fixture(); let fail = true;
  const pack = await loadRemotePack({ baseUrl, catalogFirst: true, assetCache: null, fetcher: url => url.endsWith('search.json') && fail ? Promise.resolve(new Response('failed',{status:503})) : f.fetcher(url) });
  await assert.rejects(pack.loadSearchIndex(), /HTTP 503/); assert.equal(pack.documents.length, 1);
  fail = false; assert.equal((await pack.loadSearchIndex()).entries.length, 1);
});
test('corrupt bootstrap and cache fall back; unavailable CacheStorage is optional', async () => {
  const f = await fixture(); const result = await loadCatalogFirst({ baseUrl, assetCache: null, snapshotCache: createCatalogSnapshotCache(null), bootstrap: { url: 'https://fixture.example/bootstrap.json', sha256: 'a'.repeat(64) }, fetcher: url => url.includes('bootstrap') ? Promise.resolve(new Response('{}')) : f.fetcher(url) });
  assert.equal(result.pack.documents.length, 1); assert.ok(f.calls.includes('catalog.json'));
});
test('full loader keeps its complete index contract', async () => {
  const f = await fixture(); const pack = await loadRemotePack({ baseUrl, assetCache: null, fetcher: f.fetcher });
  assert.equal(pack.searchIndex.entries[0].text, '힘 운동'); assert.equal(pack.loadSearchIndex, undefined);
});
test('declared and streamed oversized snapshots are rejected before parsing', async () => {
  const f = await fixture(); const store = response => ({ open: async () => ({ match: async () => response, delete: async () => true }) });
  assert.equal(await createCatalogSnapshotCache(store(new Response('{}',{headers:{'content-length':String(5*1024*1024)}}))).read(baseUrl),null);
  assert.equal(await createCatalogSnapshotCache(store(new Response(' '.repeat(4*1024*1024+1)))).read(baseUrl),null);
});
test('catalog bytes with a mismatching checksum cannot seed a snapshot', async () => {
  const f = await fixture(); f.files['catalog.json'] = encode({ ...f.catalog, documents: [] });
  await assert.rejects(loadRemotePack({ baseUrl, catalogFirst: true, fetcher: f.fetcher, assetCache: null }), /SHA-256/);
});

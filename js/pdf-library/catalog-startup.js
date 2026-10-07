import { loadRemotePack, validateRemoteCatalogSnapshot, boundedBytes } from './remote-pack.js?v=1.6.3-library-startup';
import { sha256Hex } from './pack-store.js?v=1.6.1-preview-labeler-0917-1111';

const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;
const CACHE_NAME = '5e-library-catalog-v1';

export function createCatalogSnapshotCache(storage = globalThis.caches) {
  const key = baseUrl => new URL('__5e_catalog_snapshot__', baseUrl).href;
  return {
    async read(baseUrl) {
      try {
        const response = await (await storage?.open(CACHE_NAME))?.match(key(baseUrl));
        if (!response?.ok || Number(response.headers.get('content-length')) > MAX_SNAPSHOT_BYTES) return null;
        const text = new TextDecoder("utf-8", { fatal: true }).decode(await boundedBytes(response, MAX_SNAPSHOT_BYTES, "catalog snapshot"));
        const snapshot = JSON.parse(text);
        if (await validateRemoteCatalogSnapshot(snapshot, baseUrl)) return snapshot;
        await (await storage.open(CACHE_NAME)).delete(key(baseUrl));
      } catch {}
      return null;
    },
    async write(baseUrl, snapshot) {
      try {
        const text = JSON.stringify(snapshot);
        if (new TextEncoder().encode(text).byteLength > MAX_SNAPSHOT_BYTES) return;
        await (await storage?.open(CACHE_NAME))?.put(key(baseUrl), new Response(text, { headers: { 'content-type': 'application/json', 'content-length': String(new TextEncoder().encode(text).byteLength) } }));
      } catch {} // Quota/private browsing must not prevent library use.
    },
  };
}

// Returns a usable catalog without starting the full-text index download.
export async function loadCatalogFirst({ baseUrl, fetcher = globalThis.fetch, snapshotCache = createCatalogSnapshotCache(), bootstrap = null, assetCache } = {}) {
  let snapshot = await snapshotCache?.read(baseUrl);
  if (!snapshot && bootstrap) {
    try {
      const response = await fetcher(bootstrap.url, { redirect: "manual" });
      if (response.ok && Number(response.headers.get('content-length')) <= MAX_SNAPSHOT_BYTES) {
        const bytes = await boundedBytes(response, MAX_SNAPSHOT_BYTES, "catalog bootstrap");
        if (bytes.byteLength <= MAX_SNAPSHOT_BYTES && await sha256Hex(bytes) === bootstrap.sha256) {
          const candidate = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
          if (await validateRemoteCatalogSnapshot(candidate, baseUrl)) snapshot = candidate;
        }
      }
    } catch {}
  }
  const save = value => { snapshot = value; return snapshotCache?.write(baseUrl, value); };
  const options = { baseUrl, fetcher, assetCache, catalogFirst: true, onSnapshot: save };
  const pack = await loadRemotePack({ ...options, snapshot });
  return Object.freeze({
    pack,
    fromSnapshot: Boolean(snapshot),
    async refresh() { return loadRemotePack({ ...options, snapshot, refreshMetadata: true }); },
  });
}

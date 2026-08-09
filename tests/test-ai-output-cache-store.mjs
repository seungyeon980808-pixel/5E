import assert from "node:assert/strict";
import {
  ExactOutputCacheStore,
  MemoryOutputCacheBackend,
} from "../js/ai-output-cache-store.js";
import {
  buildExactOutputCacheDescriptor,
  createExactOutputCacheKey,
} from "../js/ai-remote-input-plan.js";

let time = 1000;
const backend = new MemoryOutputCacheBackend();
const store = new ExactOutputCacheStore({
  backend,
  now: () => time,
  policy: { ttlMs: 100, maxEntries: 2, maxBytes: 6, maxEntryBytes: 4 },
});
const descriptor = (prompt) => buildExactOutputCacheDescriptor({
  styleVersion: "style-v1",
  mode: "diagram",
  prompt,
});
const request = (prompt, payload = "QUJD") => {
  const cacheDescriptor = descriptor(prompt);
  return {
    key: createExactOutputCacheKey(cacheDescriptor),
    descriptor: cacheDescriptor,
    output: { data: `data:image/png;base64,${payload}`, status: "complete" },
  };
};

const failed = await store.put({ ...request("failed"), status: "failed" });
assert.equal(failed.stored, false);
assert.equal((await backend.getAll()).length, 0, "failed results must never enter storage");
const partial = await store.put({ ...request("partial"), output: { ...request("partial").output, partial: true } });
assert.equal(partial.stored, false);
assert.equal((await backend.getAll()).length, 0, "partial results must never enter storage");

const a = request("a");
const b = request("b");
const c = request("c");
assert.equal((await store.put(a)).stored, true);
time += 10;
assert.equal((await store.put(b)).stored, true);
time += 10;
assert.equal((await store.get(a.key)).hit, true, "cache get must return complete output");
time += 10;
assert.equal((await store.put(c)).stored, true);
assert.equal((await store.get(b.key)).hit, false, "least recently used entry must be evicted");
assert.equal((await store.get(a.key)).hit, true);
assert.equal((await store.get(c.key)).hit, true);

const tooLarge = await store.put(request("large", "QUJDREU="));
assert.equal(tooLarge.stored, false);
assert.equal(tooLarge.reason, "entry-too-large", "per-entry byte limit must be enforced before write");

const capacityBackend = new MemoryOutputCacheBackend();
const capacityStore = new ExactOutputCacheStore({
  backend: capacityBackend,
  now: () => time,
  policy: { ttlMs: 100, maxEntries: 2, maxBytes: 2, maxEntryBytes: 4 },
});
const overCapacity = await capacityStore.put(request("capacity"));
assert.equal(overCapacity.reason, "entry-exceeds-cache-capacity");
assert.equal((await capacityBackend.getAll()).length, 0, "an entry larger than total capacity must never be written");

time += 101;
assert.equal((await store.get(a.key)).reason, "expired");
assert.equal(await backend.get(a.key), null, "expired entries must be removed on lookup");
await store.prune();
assert.equal((await store.stats()).entryCount, 0, "prune must remove all expired entries");

await store.put(request("clear"));
await store.clear();
assert.equal((await store.stats()).entryCount, 0);

console.log("AI exact output cache store tests passed");

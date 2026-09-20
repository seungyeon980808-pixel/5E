import {
  DEFAULT_EXACT_OUTPUT_CACHE_POLICY,
  EXACT_OUTPUT_CACHE_SCHEMA,
  createExactOutputCacheEntry,
  evaluateExactOutputCacheEntry,
  pruneExactOutputCacheEntries,
} from "./ai-remote-input-plan.js";

export class MemoryOutputCacheBackend {
  constructor() {
    this.entries = new Map();
  }

  async get(key) { return this.entries.get(key) || null; }
  async put(entry) { this.entries.set(entry.key, entry); }
  async delete(key) { this.entries.delete(key); }
  async getAll() { return [...this.entries.values()]; }
  async clear() { this.entries.clear(); }
}

export class IndexedDBOutputCacheBackend {
  constructor({
    indexedDB = globalThis.indexedDB,
    databaseName = "5e-ai-output-cache",
    storeName = "outputs",
    version = 1,
  } = {}) {
    if (!indexedDB) throw new Error("IndexedDB is unavailable; inject another cache backend.");
    this.indexedDB = indexedDB;
    this.databaseName = databaseName;
    this.storeName = storeName;
    this.version = version;
    this.openPromise = null;
  }

  open() {
    if (this.openPromise) return this.openPromise;
    this.openPromise = new Promise((resolve, reject) => {
      const request = this.indexedDB.open(this.databaseName, this.version);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(this.storeName)) {
          const store = database.createObjectStore(this.storeName, { keyPath: "key" });
          store.createIndex("lastAccessedAt", "lastAccessedAt", { unique: false });
          store.createIndex("expiresAt", "expiresAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open AI output cache."));
      request.onblocked = () => reject(new Error("AI output cache upgrade is blocked."));
    });
    return this.openPromise;
  }

  async request(mode, operation) {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(this.storeName, mode);
      const store = transaction.objectStore(this.storeName);
      let request;
      let requestResult;
      try {
        request = operation(store);
      } catch (error) {
        reject(error);
        return;
      }
      request.onsuccess = () => { requestResult = request.result; };
      request.onerror = () => reject(request.error || transaction.error || new Error("AI output cache operation failed."));
      transaction.oncomplete = () => resolve(requestResult);
      transaction.onerror = () => reject(transaction.error || new Error("AI output cache transaction failed."));
      transaction.onabort = () => reject(transaction.error || new Error("AI output cache transaction aborted."));
    });
  }

  get(key) { return this.request("readonly", (store) => store.get(key)); }
  put(entry) { return this.request("readwrite", (store) => store.put(entry)); }
  delete(key) { return this.request("readwrite", (store) => store.delete(key)); }
  getAll() { return this.request("readonly", (store) => store.getAll()); }
  clear() { return this.request("readwrite", (store) => store.clear()); }
}

function outputIsComplete(output, status) {
  if (status !== "complete" || !output || output.partial === true || output.complete === false) return false;
  const outputStatus = String(output.status || "complete").toLowerCase();
  return !["partial", "failed", "error", "cancelled", "canceled", "running"].includes(outputStatus);
}

export class ExactOutputCacheStore {
  constructor({
    backend = null,
    policy = DEFAULT_EXACT_OUTPUT_CACHE_POLICY,
    now = Date.now,
  } = {}) {
    this.backend = backend || new IndexedDBOutputCacheBackend();
    this.policy = { ...DEFAULT_EXACT_OUTPUT_CACHE_POLICY, ...policy };
    this.now = now;
    this.queue = Promise.resolve();
  }

  enqueue(operation) {
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => {});
    return result;
  }

  get(key) {
    return this.enqueue(async () => {
      const entry = await this.backend.get(key);
      const evaluation = evaluateExactOutputCacheEntry(entry, key, { now: this.now() });
      if (!evaluation.hit) {
        if (entry) await this.backend.delete(key);
        return evaluation;
      }
      const touched = { ...entry, lastAccessedAt: this.now() };
      await this.backend.put(touched);
      return { ...evaluation, entry: touched };
    });
  }

  put({ key, descriptor, output, status = "complete" } = {}) {
    return this.enqueue(async () => {
      if (!outputIsComplete(output, status)) return { stored: false, reason: "incomplete" };
      const entry = createExactOutputCacheEntry({
        key,
        descriptor,
        output,
        status,
        now: this.now(),
        policy: this.policy,
      });
      if (!entry.cacheable) return { stored: false, ...entry };
      if (entry.bytes > Number(this.policy.maxBytes)) {
        return { stored: false, reason: "entry-exceeds-cache-capacity", bytes: entry.bytes };
      }
      await this.backend.put(entry);
      const pruned = await this.pruneUnlocked();
      const retained = pruned.kept.some((candidate) => candidate.key === entry.key);
      return {
        stored: retained,
        reason: retained ? "stored" : "evicted-by-policy",
        entry: retained ? entry : null,
        pruned,
      };
    });
  }

  async pruneUnlocked() {
    const entries = await this.backend.getAll();
    const result = pruneExactOutputCacheEntries(entries, { now: this.now(), policy: this.policy });
    const keptKeys = new Set(result.kept.map((entry) => entry.key));
    await Promise.all(entries.filter((entry) => !keptKeys.has(entry.key)).map((entry) => this.backend.delete(entry.key)));
    return result;
  }

  prune() { return this.enqueue(() => this.pruneUnlocked()); }
  delete(key) { return this.enqueue(() => this.backend.delete(key)); }
  clear() { return this.enqueue(() => this.backend.clear()); }

  stats() {
    return this.enqueue(async () => {
      const entries = await this.backend.getAll();
      return {
        schema: EXACT_OUTPUT_CACHE_SCHEMA,
        entryCount: entries.length,
        bytes: entries.reduce((sum, entry) => sum + Number(entry?.bytes || 0), 0),
        oldestAccessedAt: entries.length
          ? Math.min(...entries.map((entry) => Number(entry.lastAccessedAt || entry.createdAt || 0)))
          : null,
      };
    });
  }
}

export function createExactOutputCacheStore(options = {}) {
  return new ExactOutputCacheStore(options);
}

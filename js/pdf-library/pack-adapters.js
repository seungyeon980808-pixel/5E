import { PackNotInstalledError, PackValidationError } from "./pack-errors.js?v=1.6.0-preview-labeler-0917-1111";

function copyBytes(bytes) {
  return new Uint8Array(bytes);
}

function copyRecord(record) {
  return Object.freeze({
    ...record,
    pack: Object.freeze({ ...record.pack }),
    fileChecksums: record.fileChecksums ? Object.freeze({ ...record.fileChecksums }) : undefined,
  });
}

export function createMemoryPackAdapter() {
  const records = new Map();
  const assets = new Map();
  let commits = 0;
  return Object.freeze({
    async list() { return [...records.values()].map(copyRecord); },
    async commitInstall(record, incomingAssets, previousVersion) {
      const nextAssets = new Map(assets);
      for (const asset of incomingAssets) nextAssets.set(`${record.id}\0${record.version}\0${asset.path}`, copyBytes(asset.bytes));
      if (previousVersion) for (const key of nextAssets.keys()) if (key.startsWith(`${record.id}\0${previousVersion}\0`)) nextAssets.delete(key);
      assets.clear();
      for (const [key, bytes] of nextAssets) assets.set(key, bytes);
      records.set(record.id, copyRecord(record));
      commits += 1;
    },
    async setEnabled(packId, enabled) {
      const record = records.get(packId);
      if (!record) throw new PackNotInstalledError(packId);
      records.set(packId, copyRecord({ ...record, enabled }));
    },
    async remove(packId) {
      if (!records.has(packId)) throw new PackNotInstalledError(packId);
      records.delete(packId);
      for (const key of assets.keys()) if (key.startsWith(`${packId}\0`)) assets.delete(key);
    },
    async readAsset(packId, path) {
      const record = records.get(packId);
      if (!record) throw new PackNotInstalledError(packId);
      const bytes = assets.get(`${packId}\0${record.version}\0${path}`);
      if (!bytes) throw new PackValidationError("path", "asset is not installed");
      return copyBytes(bytes);
    },
    debugVersions(packId) { return [...new Set([...assets.keys()].filter((key) => key.startsWith(`${packId}\0`)).map((key) => key.split("\0")[1]))].sort(); },
    debugCommitCount() { return commits; },
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

export function createIndexedDbPackAdapter({ indexedDB = globalThis.indexedDB, keyRange = globalThis.IDBKeyRange, databaseName = "5e-pdf-packs" } = {}) {
  if (!indexedDB || !keyRange) throw new PackValidationError("indexedDB", "browser storage is unavailable");
  const open = () => new Promise((resolve, reject) => {
    const request = indexedDB.open("5e.preview:" + databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("packs", { keyPath: "id" });
      request.result.createObjectStore("assets", { keyPath: ["packId", "version", "path"] });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return Object.freeze({
    async list() {
      const database = await open();
      try { return await requestResult(database.transaction("packs").objectStore("packs").getAll()); }
      finally { database.close(); }
    },
    async commitInstall(record, assets, previousVersion) {
      const database = await open();
      try {
        const transaction = database.transaction(["packs", "assets"], "readwrite");
        const assetStore = transaction.objectStore("assets");
        for (const asset of assets) assetStore.put({ packId: record.id, version: record.version, path: asset.path, bytes: asset.bytes });
        if (previousVersion) assetStore.delete(keyRange.bound([record.id, previousVersion], [record.id, previousVersion, []], false, true));
        transaction.objectStore("packs").put(record);
        await transactionDone(transaction);
      } finally { database.close(); }
    },
    async setEnabled(packId, enabled) {
      const database = await open();
      try {
        const transaction = database.transaction("packs", "readwrite");
        const store = transaction.objectStore("packs");
        const record = await requestResult(store.get(packId));
        if (!record) { transaction.abort(); throw new PackNotInstalledError(packId); }
        store.put({ ...record, enabled });
        await transactionDone(transaction);
      } finally { database.close(); }
    },
    async remove(packId) {
      const database = await open();
      try {
        const transaction = database.transaction(["packs", "assets"], "readwrite");
        const packStore = transaction.objectStore("packs");
        const record = await requestResult(packStore.get(packId));
        if (!record) { transaction.abort(); throw new PackNotInstalledError(packId); }
        packStore.delete(packId);
        transaction.objectStore("assets").delete(keyRange.bound([packId], [packId, []], false, true));
        await transactionDone(transaction);
      } finally { database.close(); }
    },
    async readAsset(packId, path) {
      const database = await open();
      try {
        const transaction = database.transaction(["packs", "assets"]);
        const record = await requestResult(transaction.objectStore("packs").get(packId));
        if (!record) throw new PackNotInstalledError(packId);
        const asset = await requestResult(transaction.objectStore("assets").get([packId, record.version, path]));
        if (!asset) throw new PackValidationError("path", "asset is not installed");
        return copyBytes(asset.bytes);
      } finally { database.close(); }
    },
  });
}

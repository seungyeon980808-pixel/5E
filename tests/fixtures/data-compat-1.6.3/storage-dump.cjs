// 브라우저 저장소(localStorage·IndexedDB)를 JSON으로 뜨고, 그대로 되살리는 도우미.
// 페이지 안에서 실행되는 함수(dumpInPage·restoreInPage)라 바깥 변수를 쓰지 않는다.
// Blob·ArrayBuffer·Date는 표시를 붙인 base64/문자열로 바꿔 JSON에 담는다.

async function dumpInPage() {
  const toBase64 = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
  async function encode(value) {
    if (value === undefined) return { __undefined: true };
    if (value === null || typeof value !== 'object') return value;
    if (value instanceof Date) return { __date: value.toISOString() };
    if (value instanceof Blob) return { __blob: value.type, base64: toBase64(new Uint8Array(await value.arrayBuffer())) };
    if (value instanceof ArrayBuffer) return { __arraybuffer: toBase64(new Uint8Array(value)) };
    if (ArrayBuffer.isView(value)) return { __typed: value.constructor.name, base64: toBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
    if (Array.isArray(value)) return Promise.all(value.map(encode));
    if (Object.getPrototypeOf(value) !== Object.prototype) return { __unsupported: Object.prototype.toString.call(value) };
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = await encode(item);
    return out;
  }
  const request = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const localStorageDump = {};
  for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); localStorageDump[key] = localStorage.getItem(key); }
  const databases = [];
  for (const { name } of await indexedDB.databases()) {
    const db = await request(indexedDB.open(name));
    const stores = [];
    for (const storeName of db.objectStoreNames) {
      const tx = db.transaction(storeName, 'readonly'), store = tx.objectStore(storeName);
      const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
      const indexes = [...store.indexNames].map(indexName => { const index = store.index(indexName); return { name: indexName, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry }; });
      const records = [];
      for (let i = 0; i < keys.length; i++) records.push({ key: await encode(keys[i]), value: await encode(values[i]) });
      stores.push({ name: storeName, keyPath: store.keyPath, autoIncrement: store.autoIncrement, indexes, records });
    }
    databases.push({ name, version: db.version, stores });
    db.close();
  }
  databases.sort((a, b) => a.name.localeCompare(b.name));
  return { localStorage: localStorageDump, indexedDB: databases };
}

// 같은 이름·버전·저장소 구조로 다시 만든다. 앱 스크립트보다 먼저(빈 출처에서) 실행해야 한다.
async function restoreInPage(dump) {
  const fromBase64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
  function decode(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(decode);
    if (value.__undefined) return undefined;
    if ('__date' in value) return new Date(value.__date);
    if ('__blob' in value) return new Blob([fromBase64(value.base64)], { type: value.__blob });
    if ('__arraybuffer' in value) return fromBase64(value.__arraybuffer).buffer;
    if ('__typed' in value) return new globalThis[value.__typed](fromBase64(value.base64).buffer);
    if ('__unsupported' in value) throw new Error(`되살릴 수 없는 값: ${value.__unsupported}`);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v)]));
  }
  localStorage.clear();
  for (const [key, value] of Object.entries(dump.localStorage)) localStorage.setItem(key, value);
  for (const database of dump.indexedDB) {
    await new Promise((resolve, reject) => { const r = indexedDB.deleteDatabase(database.name); r.onsuccess = resolve; r.onerror = () => reject(r.error); });
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open(database.name, database.version);
      open.onupgradeneeded = () => {
        for (const spec of database.stores) {
          const options = { autoIncrement: spec.autoIncrement };
          if (spec.keyPath !== null) options.keyPath = spec.keyPath;
          const store = open.result.createObjectStore(spec.name, options);
          for (const index of spec.indexes) store.createIndex(index.name, index.keyPath, { unique: index.unique, multiEntry: index.multiEntry });
        }
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    for (const spec of database.stores) {
      if (!spec.records.length) continue;
      await new Promise((resolve, reject) => {
        const tx = db.transaction(spec.name, 'readwrite'), store = tx.objectStore(spec.name);
        for (const record of spec.records) spec.keyPath === null ? store.put(decode(record.value), decode(record.key)) : store.put(decode(record.value));
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
    }
    db.close();
  }
  return true;
}

module.exports = { dumpInPage, restoreInPage };

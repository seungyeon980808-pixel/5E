/* ===== idb-store: 아주 작은 IndexedDB 키-값 저장소 =====
 *
 * localStorage(~5MB 상한)로는 퍼스널 라이브러리(이미지 base64 포함)가 금방 넘친다.
 * IndexedDB는 할당량이 수백 MB~GB급(브라우저가 디스크 여유로 관리)이라 라이브러리가
 * 커져도 안 터진다. 여기서는 스토어 하나("kv")에 키별로 값을 통째 넣는 단순 버킷으로 쓴다
 * (구조화 복제라 배열·중첩 객체·긴 문자열 그대로 저장). 값 단위 최적화(이미지 Blob 분리 등)는
 * 후속 과제.
 *
 * 모든 API는 Promise. indexedDB 자체가 없거나(구형·특수환경) 열기에 실패하면 호출부가
 * localStorage로 폴백할 수 있도록 idbAvailable()과 예외를 그대로 노출한다.
 */

const DB_NAME = "5e-store";
const STORE = "kv";
const VERSION = 1;

let _dbPromise = null;

export function idbAvailable() {
  try { return typeof indexedDB !== "undefined" && indexedDB !== null; }
  catch (_) { return false; }
}

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
  // 열기에 실패하면 다음 호출에서 재시도할 수 있게 캐시를 비운다.
  _dbPromise.catch(() => { _dbPromise = null; });
  return _dbPromise;
}

export async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("IndexedDB tx aborted"));
  });
}

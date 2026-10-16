const DATABASE = '5e-bug-board-drafts';
let connection;
function database() {
  return connection ||= new Promise((resolve,reject) => {
    const request = indexedDB.open(DATABASE,1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function draftStore(mode, value) {
  const db = await database();
  return new Promise((resolve,reject) => {
    const tx = db.transaction('drafts',mode === 'get' ? 'readonly' : 'readwrite');
    const store = tx.objectStore('drafts');
    const request = mode === 'get' ? store.get('new') : mode === 'delete' ? store.delete('new') : store.put(value,'new');
    let result; request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('임시 저장 실패'));
  });
}

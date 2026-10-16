// A separate store leaves personal drawings and the original ExamPool DB alone.
let connection;
function open() {
  if (!connection) connection = new Promise((resolve,reject) => {
    const request = indexedDB.open('5e-exampool', 2);
    request.onupgradeneeded = () => {
      for (const name of ['questions','resources']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, {keyPath:'id'});
    };
    request.onsuccess = () => {request.result.onversionchange = () => {request.result.close();connection = null;};resolve(request.result);};
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('다른 창의 문항 저장을 마친 뒤 다시 시도하세요.'));
  }).catch(error => {connection = null;throw error;});
  return connection;
}
export async function listQuestions() {
  const db = await open();
  return new Promise((resolve,reject) => {
    const request = db.transaction('questions').objectStore('questions').getAll();
    request.onsuccess = () => resolve(request.result.sort((a,b) => a.createdAt.localeCompare(b.createdAt)));
    request.onerror = () => reject(request.error);
  });
}
export async function saveQuestion(item) {
  const db = await open();
  return new Promise((resolve,reject) => {
    const tx = db.transaction('questions', 'readwrite'), store = tx.objectStore('questions'), request = store.get(item.id);
    let next, failure;
    request.onsuccess = () => {
      if ((request.result?.revision ?? 0) !== item.revision) {failure = new Error('다른 창에서 이 문항을 수정했습니다. 문항 파일로 보관한 뒤 창을 다시 열어주세요.');tx.abort();return;}
      next = {...structuredClone(item), revision:item.revision+1, updatedAt:new Date().toISOString()};store.put(next);
    };
    tx.oncomplete = () => resolve(next);
    tx.onerror = tx.onabort = () => reject(failure || tx.error || new Error('저장하지 못했습니다. 문항 파일로 보관한 뒤 다시 시도하세요.'));
  });
}
export async function listResources() {
  const db = await open();
  return new Promise((resolve,reject) => {
    const request = db.transaction('resources').objectStore('resources').getAll();
    request.onsuccess = () => resolve(request.result);request.onerror = () => reject(request.error);
  });
}
export async function saveResource(resource) {
  const db = await open();
  return new Promise((resolve,reject) => {
    const tx = db.transaction('resources','readwrite');tx.objectStore('resources').put(structuredClone(resource));
    tx.oncomplete = () => resolve();tx.onerror = tx.onabort = () => reject(tx.error || new Error('자료를 저장하지 못했습니다. 저장 공간을 확인하세요.'));
  });
}
export async function importQuestions(items, resources = []) {
  const db = await open();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(['questions','resources'], 'readwrite'), store = tx.objectStore('questions');let failure;
    // All conflict checks and writes share one transaction: no partial import.
    for (const item of items) {
      const request = store.get(item.id);
      request.onsuccess = () => {
        if (request.result && JSON.stringify(request.result) !== JSON.stringify(item)) {
          failure = new Error('같은 ID의 다른 문항이 이미 있습니다. 기존 내용을 보존했으므로 별도 브라우저에서 파일을 여세요.');tx.abort();return;
        }
        if (!request.result) store.put(item);
      };
    }
    for (const resource of resources) {
      const resourceStore = tx.objectStore('resources'), request = resourceStore.get(resource.id);
      request.onsuccess = () => {
        if (request.result && JSON.stringify(request.result) !== JSON.stringify(resource)) {failure = new Error('같은 ID의 다른 참고자료가 있습니다. 기존 문항과 자료를 보존했습니다.');tx.abort();return;}
        if (!request.result) resourceStore.put(resource);
      };
    }
    tx.oncomplete = () => resolve();tx.onerror = tx.onabort = () => reject(failure || tx.error || new Error('문항 파일을 열지 못했습니다.'));
  });
}

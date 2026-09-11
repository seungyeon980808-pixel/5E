export class MemoryStorage {
  constructor(entries = []) { this.values = new Map(entries.map(([key, value]) => [key, String(value)])); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

export function createIndexedDb(workspace, { beforePut } = {}) {
  const databases = new Map();
  const recordsFor = (databaseName, storeName) => {
    const key = `${databaseName}:${storeName}`;
    if (!databases.has(key)) databases.set(key, new Map());
    return databases.get(key);
  };
  if (workspace) recordsFor('5e-ai-image-tasks', 'tasks').set('workspace', structuredClone(workspace));

  const database = databaseName => ({
    objectStoreNames: { contains: () => true },
    transaction(storeName) {
      const transaction = {};
      const records = recordsFor(databaseName, storeName);
      const requestFor = operation => {
        const request = {};
        queueMicrotask(async () => {
          try {
            request.result = await operation();
            request.onsuccess?.();
            queueMicrotask(() => transaction.oncomplete?.());
          } catch (error) {
            request.error = error;
            request.onerror?.();
          }
        });
        return request;
      };
      transaction.objectStore = () => ({
        get: key => requestFor(() => structuredClone(records.get(key))),
        put: value => requestFor(async () => {
          await beforePut?.(structuredClone(value));
          records.set(value.key, structuredClone(value));
          return value.key;
        }),
        delete: key => requestFor(() => records.delete(key)),
        getAll: () => requestFor(() => structuredClone([...records.values()])),
        clear: () => requestFor(() => records.clear()),
      });
      return transaction;
    },
  });

  return {
    open(databaseName) {
      const request = {};
      queueMicrotask(() => { request.result = database(databaseName); request.onsuccess?.(); });
      return request;
    },
  };
}

export function createDesktop() {
  const eventListeners = [];
  const stateListeners = [];
  const sends = [];
  const sendWaiters = new Set();
  const api = {
    status: async () => ({ login: { loggedIn: false }, server: false }),
    start: async () => ({ ok: true }),
    interrupt: async () => ({ ok: true }),
    send: async payload => {
      const turnId = `scoped-turn-${sends.length + 1}`;
      const record = { payload, turnId, renderThreadId: `${turnId}-render` };
      sends.push(record);
      for (const waiter of [...sendWaiters]) waiter(record);
      return { turnId, renderThreadId: record.renderThreadId };
    },
    onEvent: listener => { eventListeners.push(listener); },
    onState: listener => { stateListeners.push(listener); },
  };
  return {
    api,
    sends,
    emit(message) { for (const listener of eventListeners) listener(message); },
    emitState(state) { for (const listener of stateListeners) listener(state); },
    waitForSend(index = sends.length, timeoutMs = 2000) {
      if (sends[index]) return Promise.resolve(sends[index]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { sendWaiters.delete(onSend); reject(new Error('Timed out waiting for the scoped desktop request.')); }, timeoutMs);
        const onSend = record => {
          if (sends.indexOf(record) !== index) return;
          clearTimeout(timer);
          sendWaiters.delete(onSend);
          resolve(record);
        };
        sendWaiters.add(onSend);
      });
    },
  };
}

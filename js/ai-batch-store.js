const scopeKey = ({ sessionId, workspaceId }) => JSON.stringify([
  String(sessionId || ''),
  String(workspaceId || ''),
]);

const copy = value => structuredClone(value);

export function createBatchStore({ read, write } = {}) {
  if (typeof read !== 'function' || typeof write !== 'function') {
    throw new TypeError('Batch store requires read and write adapters.');
  }
  return {
    async load(scope) {
      const records = await read(scopeKey(scope));
      return Array.isArray(records) ? copy(records) : [];
    },
    async save(scope, records) {
      if (!Array.isArray(records)) throw new TypeError('Batch records must be an array.');
      await write(scopeKey(scope), copy(records));
    },
  };
}

export function createMemoryBatchStore(initial = {}) {
  const entries = new Map(Object.entries(copy(initial)));
  return createBatchStore({
    read: async key => entries.get(key) || [],
    write: async (key, records) => { entries.set(key, records); },
  });
}

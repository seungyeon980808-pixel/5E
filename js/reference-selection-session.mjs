const SNAPSHOT_VERSION = 1;

function itemId(item) {
  return String(item?.id || item?.path || item?.relativePath || item?.file || "");
}

function itemKey(source, item) {
  return `${source}:${itemId(item)}`;
}

export function createReferenceSelectionSession({ limit = 10 } = {}) {
  const selection = new Map();
  const available = new Map();

  function setAvailable(source, items) {
    const next = new Map((items || []).map((item) => [itemKey(source, item), item]));
    available.set(source, next);
    for (const [key, record] of selection) {
      if (record.source !== source) continue;
      const current = next.get(key);
      if (current) selection.set(key, { source, item: current });
      else selection.delete(key);
    }
  }

  function toggle(source, item) {
    const key = itemKey(source, item);
    if (selection.delete(key)) return { status: "removed" };
    if (selection.size >= limit) return { status: "limit", limit };
    selection.set(key, { source, item });
    return { status: "selected" };
  }

  function snapshot() {
    return {
      version: SNAPSHOT_VERSION,
      entries: [...selection.values()].map((record) => ({
        source: record.source,
        itemId: itemId(record.item),
      })),
    };
  }

  function restore(saved, source, items) {
    selection.clear();
    setAvailable(source, items);
    if (saved?.version !== SNAPSHOT_VERSION || !Array.isArray(saved.entries)) return;
    const current = available.get(source) || new Map();
    for (const entry of saved.entries) {
      if (entry.source !== source || selection.size >= limit) continue;
      const key = `${source}:${entry.itemId}`;
      const item = current.get(key);
      if (item) selection.set(key, { source, item });
    }
  }

  return {
    clear: () => selection.clear(),
    map: () => selection,
    selected: () => [...selection.values()],
    setAvailable,
    snapshot,
    restore,
    toggle,
  };
}

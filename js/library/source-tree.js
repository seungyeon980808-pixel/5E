export function computeSourceSelection(nodes, enabledLeafIds) {
  const enabled = new Set(enabledLeafIds ?? []);
  const children = new Map();
  for (const node of nodes) {
    const key = node.parentId ?? null;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(node);
  }
  const descendants = (node) => {
    const direct = children.get(node.id) ?? [];
    if (direct.length === 0) return node.kind === "source" ? [node.id] : [];
    return direct.flatMap(descendants);
  };
  return Object.freeze(nodes.map((node) => {
    const leaves = descendants(node);
    const selected = leaves.filter((id) => enabled.has(id)).length;
    return Object.freeze({
      ...node,
      checked: leaves.length > 0 && selected === leaves.length,
      indeterminate: selected > 0 && selected < leaves.length,
    });
  }));
}

export function sourceLeafIds(nodes, sourceId, checked) {
  const children = new Map();
  for (const node of nodes) {
    if (!children.has(node.parentId ?? null)) children.set(node.parentId ?? null, []);
    children.get(node.parentId ?? null).push(node);
  }
  const collect = (id) => {
    const node = nodes.find((candidate) => candidate.id === id);
    if (!node) return [];
    const direct = children.get(id) ?? [];
    return direct.length ? direct.flatMap((child) => collect(child.id)) : (node.kind === "source" ? [id] : []);
  };
  return Object.freeze({ ids: Object.freeze(collect(sourceId)), checked: checked === true });
}

const CATEGORY_LABELS = Object.freeze({
  "past-exams": "기출문제",
  textbooks: "교과서",
  other: "기타",
});

function stableNodeId(kind, ...parts) {
  return [kind, ...parts.map((part) => `${String(part).length}:${String(part)}`)].join("|");
}

export function normalizeSourceCategory(value) {
  if (["past-exams", "textbooks", "other"].includes(value)) return value;
  if (["exam", "exams", "기출문제"].includes(value)) return "past-exams";
  if (["textbook", "교과서"].includes(value)) return "textbooks";
  return "other";
}

export function createHierarchicalSourceNodes(leaves) {
  const nodes = new Map();
  const add = (node) => { if (!nodes.has(node.id)) nodes.set(node.id, Object.freeze(node)); };
  for (const leaf of leaves ?? []) {
    const origin = leaf.origin === "local" ? "local" : "provided";
    const category = normalizeSourceCategory(leaf.category);
    const rootId = stableNodeId("group", origin);
    add({ id: rootId, parentId: null, label: origin === "local" ? "내 자료" : "제공 자료", kind: "group", origin, resultKinds: Object.freeze([]), count: 0 });
    const categoryId = stableNodeId("category", origin, category);
    add({ id: categoryId, parentId: rootId, label: CATEGORY_LABELS[category], kind: "category", origin, category, resultKinds: Object.freeze([]), count: 0 });
    let parentId = categoryId;
    for (const rawSegment of leaf.pathSegments ?? []) {
      const segment = String(rawSegment ?? "").trim();
      if (!segment) continue;
      const folderId = stableNodeId("folder", parentId, segment);
      add({ id: folderId, parentId, label: segment, kind: "folder", origin, category, resultKinds: Object.freeze([]), count: 0 });
      parentId = folderId;
    }
    add(Object.freeze({
      id: leaf.id, parentId, label: leaf.label, kind: "source", origin, category,
      resultKinds: Object.freeze([...(leaf.resultKinds ?? [])]), count: leaf.count ?? 0,
      counts: Object.freeze({
        pdf: Number(leaf.counts?.pdf) || 0,
        image: Number(leaf.counts?.image) || 0,
        page: Number(leaf.counts?.page) || 0,
        question: Number(leaf.counts?.question) || 0,
      }),
    }));
  }
  return Object.freeze([...nodes.values()]);
}

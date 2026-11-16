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

// 11-12 사용자: 5E 제공 자료는 「평가원 · 학평 · 교과서」 세 칸으로. 드라이브 폴더는 그대로 두고 나무만 다시 묶는다
// (「5E 공유 자료 › 기출문제」→ 평가원, 「5E 공유 자료 › 교과서」→ 교과서, 「학력평가 과학탐구 › 학력평가」→ 학평).
const PROVIDED_SHELVES = Object.freeze({ kice: "평가원", hak: "학평", textbook: "교과서" });
function providedShelf(leaf) {
  const segments = (leaf.pathSegments ?? []).map((segment) => String(segment ?? "").trim()).filter(Boolean);
  if (leaf.driveFolder?.id === "5e.hakpyeong") return { shelf: "hak", segments: segments[0] === "학력평가" ? segments.slice(1) : segments };
  if (!leaf.driveFolder || !/^5E 공유 자료/u.test(String(leaf.driveFolder.title || ""))) return null;
  if (segments[0] === "기출문제") return { shelf: "kice", segments: segments.slice(1) };
  if (segments[0] === "교과서") return { shelf: "textbook", segments: segments.slice(1) };
  return null;
}

// 과목 칸 순서: 물리 → 화학 → 생명과학 → 지구과학, 각각 Ⅰ → Ⅱ(폴더 이름 「물리1」「물리학Ⅱ」 등 어느 쪽이든).
const SUBJECT_ORDER = ["물리", "화학", "생명", "지구"];
function subjectRank(name) {
  const text = String(name ?? "");
  const family = SUBJECT_ORDER.findIndex((prefix) => text.startsWith(prefix));
  if (family < 0) return 99;
  return family * 2 + (/(2|Ⅱ|II)$/u.test(text) ? 1 : 0);
}

export function createHierarchicalSourceNodes(leaves) {
  const nodes = new Map();
  const add = (node) => { if (!nodes.has(node.id)) nodes.set(node.id, Object.freeze(node)); };
  // 세 칸은 늘 평가원 → 학평 → 교과서 순서로(자료가 들어온 순서와 상관없이).
  const order = { kice: 0, hak: 1, textbook: 2 };
  const sorted = [...(leaves ?? [])].map((leaf, index) => ({ leaf, index, shelf: providedShelf(leaf) }))
    .sort((a, b) => (a.shelf ? order[a.shelf.shelf] : 9) - (b.shelf ? order[b.shelf.shelf] : 9)
      || subjectRank(a.shelf?.segments?.[0]) - subjectRank(b.shelf?.segments?.[0]) || a.index - b.index);
  for (const { leaf, shelf } of sorted) {
    const origin = leaf.origin === "local" ? "local" : "provided";
    const category = normalizeSourceCategory(leaf.category);
    if (shelf) {
      const shelfId = stableNodeId("shelf", shelf.shelf);
      add({ id: shelfId, parentId: null, label: PROVIDED_SHELVES[shelf.shelf], kind: "group", origin: "provided", providedPack: true, shelf: shelf.shelf, resultKinds: Object.freeze([]), count: 0 });
      let parentId = shelfId;
      for (const segment of shelf.segments) {
        const folderId = stableNodeId("folder", parentId, segment);
        add({ id: folderId, parentId, label: segment, kind: "folder", origin, category, resultKinds: Object.freeze([]), count: 0 });
        parentId = folderId;
      }
      addLeaf(add, leaf, parentId, origin, category);
      continue;
    }
    const rootId = leaf.driveFolder ? stableNodeId("drive", leaf.driveFolder.id) : stableNodeId("group", origin);
    add({ id: rootId, parentId: null, label: leaf.driveFolder?.title || (origin === "local" ? "내 자료" : "제공 자료"), kind: "group", origin, resultKinds: Object.freeze([]), count: 0 });
    const categoryId = stableNodeId("category", origin, category);
    if (!leaf.driveFolder) add({ id: categoryId, parentId: rootId, label: CATEGORY_LABELS[category], kind: "category", origin, category, resultKinds: Object.freeze([]), count: 0 });
    let parentId = leaf.driveFolder ? rootId : categoryId;
    for (const rawSegment of leaf.pathSegments ?? []) {
      const segment = String(rawSegment ?? "").trim();
      if (!segment) continue;
      const folderId = stableNodeId("folder", parentId, segment);
      add({ id: folderId, parentId, label: segment, kind: "folder", origin, category, resultKinds: Object.freeze([]), count: 0 });
      parentId = folderId;
    }
    addLeaf(add, leaf, parentId, origin, category);
  }
  return Object.freeze([...nodes.values()]);
}

function addLeaf(add, leaf, parentId, origin, category) {
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

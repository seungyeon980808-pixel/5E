// Runtime-only page history: never attach undo stacks to serialized page records.
const pageRuntime = new WeakMap();

export function savePageRuntime(s, page) {
  if (!page) return;
  pageRuntime.set(page, {
    undoStack: s.undoStack, redoStack: s.redoStack,
    selectedIds: [...(s.selectedIds || [])],
    selectedGuideId: s.selectedGuideId,
    activeLayerId: s.activeLayerId,
  });
}

export function restorePageRuntime(s, page) {
  const runtime = pageRuntime.get(page);
  s.undoStack = runtime?.undoStack || [];
  s.redoStack = runtime?.redoStack || [];
  // A restored page can be edited while this page's redo stack is dormant.
  if (s.redoStack.some(entry => isPageHistoryEntry(entry) && !entry.present
      && !canRemovePage(s, entry))) s.redoStack.length = 0;
  s.selectedIds = (runtime?.selectedIds || []).filter(id => s.objects.some(o => o.id === id));
  s.selectedGuideId = s.guides.some(g => g.id === runtime?.selectedGuideId)
    ? runtime.selectedGuideId : null;
  s.activeLayerId = s.layers.some(l => l.id === runtime?.activeLayerId)
    ? runtime.activeLayerId : (s.layers[0]?.id ?? 1);
}

export function isPageHistoryEntry(entry) {
  return entry?.kind === 'page-presence' && entry.page != null
    && typeof entry.page.id === 'string' && Number.isInteger(entry.index)
    && typeof entry.present === 'boolean';
}

export function inversePageHistoryEntry(s, entry) {
  const index = s.pages.findIndex(page => page.id === entry.page.id);
  const page = index >= 0 ? s.pages[index] : entry.page;
  return { ...entry, present: index >= 0, index: index >= 0 ? index : entry.index,
    activePageIdBefore: s.activePageId, fingerprint: JSON.stringify(page) };
}

function canRemovePage(s, entry) {
  const page = s.pages.find(candidate => candidate.id === entry.page.id);
  return page != null && s.pages.length > 1
    && entry.fingerprint === JSON.stringify(page);
}

function activatePage(s, targetId) {
  if (!targetId || s.activePageId === targetId) return;
  const current = s.pages.find(page => page.id === s.activePageId);
  if (current) {
    current.objects = s.objects;
    current.guides = s.guides;
    current.layers = s.layers;
    current.artboard = s.artboard;
    savePageRuntime(s, current);
  }
  const target = s.pages.find(page => page.id === targetId);
  if (!target) return;
  s.objects = target.objects;
  s.guides = target.guides;
  s.layers = target.layers;
  s.artboard = target.artboard;
  s.activePageId = target.id;
  restorePageRuntime(s, target);
  s.targetedId = null;
  s.draft = null;
  s.draftText = null;
}

export function restorePageHistoryEntry(s, entry) {
  if (!isPageHistoryEntry(entry)) return false;
  const index = s.pages.findIndex(page => page.id === entry.page.id);
  if (entry.present) {
    if (index < 0) s.pages.splice(Math.min(entry.index, s.pages.length), 0, entry.page);
    activatePage(s, entry.activePageIdBefore);
  } else {
    if (!canRemovePage(s, entry)) return false;
    if (s.activePageId === entry.page.id) {
      const neighbor = s.pages[index + 1] || s.pages[index - 1];
      activatePage(s, entry.activePageIdBefore === entry.page.id ? neighbor?.id : entry.activePageIdBefore);
    }
    s.pages.splice(index, 1);
  }
  return true;
}

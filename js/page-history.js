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
    fingerprint: JSON.stringify(page) };
}

function canRemovePage(s, entry) {
  const page = s.pages.find(candidate => candidate.id === entry.page.id);
  return page != null && s.pages.length > 1 && s.activePageId !== page.id
    && entry.fingerprint === JSON.stringify(page);
}

export function restorePageHistoryEntry(s, entry) {
  if (!isPageHistoryEntry(entry)) return false;
  const index = s.pages.findIndex(page => page.id === entry.page.id);
  if (entry.present) {
    if (index < 0) s.pages.splice(Math.min(entry.index, s.pages.length), 0, entry.page);
  } else {
    if (!canRemovePage(s, entry)) return false;
    s.pages.splice(index, 1);
  }
  return true;
}

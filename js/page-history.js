function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function activePage(state) {
  return (state.pages || []).find((page) => page.id === state.activePageId) || null;
}

export function syncActivePageRecord(state) {
  const page = activePage(state);
  if (!page) return;
  page.objects = state.objects;
  page.guides = state.guides;
  page.layers = state.layers;
  page.artboard = state.artboard;
}

export function capturePageHistory(state) {
  syncActivePageRecord(state);
  return {
    kind: "pages",
    pages: clone(state.pages || []),
    activePageId: state.activePageId,
    activeLayerId: state.activeLayerId,
  };
}

export function isPageHistoryEntry(entry) {
  return !!entry && !Array.isArray(entry) && entry.kind === "pages" && Array.isArray(entry.pages);
}

export function restorePageHistory(state, entry) {
  state.pages = clone(entry.pages);
  state.activePageId = entry.activePageId;
  const page = activePage(state) || state.pages[0];
  if (!page) return;
  state.activePageId = page.id;
  state.objects = page.objects || [];
  state.guides = page.guides || [];
  state.layers = page.layers || [];
  state.artboard = page.artboard || state.artboard;
  state.activeLayerId = (state.layers || []).some((layer) => layer.id === entry.activeLayerId)
    ? entry.activeLayerId
    : (state.layers[0]?.id ?? 1);
  state.selectedIds = [];
  state.selectedGuideId = null;
  state.targetedId = null;
  state.draft = null;
  state.draftText = null;
}

export function pushPageHistory(state, before) {
  state.undoStack.push(before);
  state.redoStack = [];
}

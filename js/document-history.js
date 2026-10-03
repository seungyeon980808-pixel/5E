export const DOCUMENT_HISTORY_KIND = "document";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function captureDocumentSnapshot(state) {
  return {
    kind: DOCUMENT_HISTORY_KIND,
    objects: clone(state.objects),
    guides: clone(state.guides || []),
    artboard: clone(state.artboard),
    layers: clone(state.layers || []),
  };
}

export function isDocumentSnapshot(value) {
  return value?.kind === DOCUMENT_HISTORY_KIND
    && Array.isArray(value.objects)
    && Array.isArray(value.guides)
    && value.artboard !== null
    && typeof value.artboard === "object"
    && Array.isArray(value.layers);
}

export function commitDocumentHistory(state, snapshot) {
  if (!isDocumentSnapshot(snapshot)) return false;
  const current = captureDocumentSnapshot(state);
  if (JSON.stringify(current) === JSON.stringify(snapshot)) return false;
  state.undoStack.push(snapshot);
  state.redoStack = [];
  return true;
}

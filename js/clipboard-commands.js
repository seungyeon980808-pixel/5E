function clone(value) { return JSON.parse(JSON.stringify(value)); }

export function cutSelectedObjects(state) {
  const selected = new Set(state.selectedIds || []);
  const cut = (state.objects || []).filter((object) => selected.has(object.id) && !object.locked);
  if (!cut.length) return null;
  const before = clone(state.objects);
  const cutIds = new Set(cut.map((object) => object.id));
  state.objects = state.objects.filter((object) => !cutIds.has(object.id));
  state.selectedIds = [];
  state.targetedId = null;
  state.undoStack.push(before);
  state.redoStack = [];
  return clone(cut);
}

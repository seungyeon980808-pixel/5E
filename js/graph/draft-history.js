// A modal draft owns its history; canvas history is touched only on Apply.
export function createDraftHistory({capture, restore, changed = () => {}, limit = 100}) {
  let rows = [structuredClone(capture())], cursor = 0, group = null, paused = false, restoring = false;
  const sync = () => changed({canUndo: cursor > 0, canRedo: cursor < rows.length - 1});
  const record = (nextGroup = null) => {
    if (paused || restoring) return;
    const value = structuredClone(capture());
    if (JSON.stringify(value) === JSON.stringify(rows[cursor])) return;
    rows.splice(cursor + 1);
    if (nextGroup && group === nextGroup && cursor > 0) rows[cursor] = value;
    else { rows.push(value); cursor++; }
    if (rows.length > limit + 1) { rows.shift(); cursor--; }
    group = nextGroup; sync();
  };
  sync();
  return {
    record,
    endGroup() { group = null; },
    begin() { record(); group = null; paused = true; },
    end() { paused = false; record(); },
    travel(redo = false) {
      if (paused) return false;
      record();
      const next = cursor + (redo ? 1 : -1);
      if (next < 0 || next >= rows.length) return false;
      cursor = next; group = null; restoring = true;
      try { restore(structuredClone(rows[cursor])); }
      finally { restoring = false; sync(); }
      return true;
    },
  };
}

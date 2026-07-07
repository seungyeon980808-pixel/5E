/* ===== INSPECTOR SECTION — 그룹 (개체 풀기 / 묶기 buttons) =====
 * Extracted verbatim from initInspector() in js/inspector.js (v0.44.0
 * split). Builds the section DOM and wires its events; mounting into the
 * inspector panel happens in js/inspector.js (the orchestrator). */

export function buildGroupSection(ctx) {
  const { state } = ctx;

  // ---- Group section: 개체 풀기 button (shown in targeted and group-selected states) ----
  const groupDiv = document.createElement("div");
  groupDiv.className = "insp-body";
  groupDiv.style.cssText = "padding: 6px 8px;";
  const ungroupBtn = document.createElement("button");
  ungroupBtn.textContent = "오브젝트 분리(Shift+G)";
  ungroupBtn.title = "오브젝트 분리 (Shift+G)";
  ungroupBtn.style.cssText = "padding:4px 10px;font-size:11px;cursor:pointer;border:1px solid var(--border);border-radius:3px;background:var(--bg-input);color:var(--text-primary);width:100%;";
  ungroupBtn.addEventListener("click", () => {
    const s = state.get();
    const refId = s.targetedId || (s.selectedIds || [])[0];
    const refObj = s.objects.find((o) => o.id === refId);
    if (!refObj || !refObj.groupId) return;
    const groupId = refObj.groupId;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const grp = s2.groups.find((g) => g.id === groupId);
      if (grp) grp.memberIds.forEach(id => {
        const o = s2.objects.find((o) => o.id === id);
        if (o) delete o.groupId;
      });
      s2.groups = s2.groups.filter((g) => g.id !== groupId);
      s2.targetedId = null;
      s2.undoStack.push(snap);
      s2.redoStack = [];
    });
  });
  groupDiv.appendChild(ungroupBtn);

  // ---- 묶기 button: shown for an ungrouped multi-selection (ids>1 && !allInGroup) ----
  const groupBtnDiv = document.createElement("div");
  groupBtnDiv.className = "insp-body";
  groupBtnDiv.style.cssText = "padding: 6px 8px;";
  groupBtnDiv.style.display = "none";
  const groupBtn = document.createElement("button");
  groupBtn.textContent = "오브젝트 묶기(G)";
  groupBtn.title = "오브젝트 묶기 (G)";
  groupBtn.style.cssText = "padding:4px 10px;font-size:11px;cursor:pointer;border:1px solid var(--border);border-radius:3px;background:var(--bg-input);color:var(--text-primary);width:100%;";
  groupBtn.addEventListener("click", () => {
    // Mirrors the G-key group-creation logic in transform.js.
    const s = state.get();
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const groupId = Date.now().toString();
      // locked objects are excluded; need ≥2 mutable members left to form a group
      const memberIds = (s2.selectedIds || []).filter(id =>
        !(s2.objects.find((o) => o.id === id)?.locked));
      if (memberIds.length < 2) return;
      memberIds.forEach(id => {
        const o = s2.objects.find((o) => o.id === id);
        if (o) o.groupId = groupId;
      });
      s2.groups.push({ id: groupId, memberIds });
      s2.undoStack.push(snap);
      s2.redoStack = [];
    });
  });
  groupBtnDiv.appendChild(groupBtn);

  return { groupDiv, groupBtnDiv };
}

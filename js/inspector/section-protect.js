/* ===== INSPECTOR SECTION — 보호 (lock / position lock) =====
 * Extracted verbatim from initInspector() in js/inspector.js (v0.44.0
 * split). Builds the section DOM and wires its events; mounting into the
 * inspector panel happens in js/inspector.js (the orchestrator). */

import { makeSection } from "./widgets.js?v=0.48.5";

export function buildProtectSection(ctx) {
  const { state, snapBefore } = ctx;

  /* ---- Section 4: 보호 (single selection only) ---- */
  const sec4Body = document.createElement("div");
  sec4Body.className = "insp-body";

  const lockRow = document.createElement("div");
  lockRow.className = "insp-row";
  const lockCb = document.createElement("input");
  lockCb.type = "checkbox";
  lockCb.className = "insp-cb";
  const lockLbl = document.createElement("label");
  lockLbl.className = "insp-field-label";
  lockLbl.textContent = "개체 잠금";
  lockRow.appendChild(lockCb);
  lockRow.appendChild(lockLbl);
  sec4Body.appendChild(lockRow);

  const positionLockRow = document.createElement("div");
  positionLockRow.className = "insp-row";
  const positionLockCb = document.createElement("input");
  positionLockCb.type = "checkbox";
  positionLockCb.className = "insp-cb";
  const positionLockLbl = document.createElement("label");
  positionLockLbl.className = "insp-field-label";
  positionLockLbl.textContent = "위치 고정";
  positionLockRow.appendChild(positionLockCb);
  positionLockRow.appendChild(positionLockLbl);
  sec4Body.appendChild(positionLockRow);

  lockCb.addEventListener("change", () => {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (!ids.length) return;
    const snap = snapBefore();
    const val = lockCb.checked;
    state.update((s2) => {
      s2.undoStack.push(snap);
      s2.redoStack = [];
      (s2.selectedIds || []).forEach(id => {
        const o = s2.objects.find((o) => o.id === id);
        if (o) o.locked = val;
      });
    });
  });

  positionLockCb.addEventListener("change", () => {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (!ids.length) return;
    const snap = snapBefore();
    const val = positionLockCb.checked;
    state.update((s2) => {
      s2.undoStack.push(snap);
      s2.redoStack = [];
      (s2.selectedIds || []).forEach(id => {
        const o = s2.objects.find((o) => o.id === id);
        if (o) o.positionLocked = val;
      });
    });
  });

  const sec4 = makeSection("보호", sec4Body);

  return { sec4, lockCb, positionLockCb };
}

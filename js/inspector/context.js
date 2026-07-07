/* ===== INSPECTOR — shared context (DOM roots + helper closures) =====
 * Extracted verbatim from initInspector() in js/inspector.js (v0.44.0 split).
 * createInspectorContext(state) bundles the inspector DOM roots and the
 * helper closures shared by the section builders (snapshots, label-row
 * builders, single-object commit helper). */

import { ptToMm, MIN_TEXT_PT, OBJECT_LABEL_TYPES } from "../state.js?v=0.54.7";

export function createInspectorContext(state) {
  const emptyEl   = document.getElementById("inspector-empty");
  const contentEl = document.getElementById("inspector-content");
  if (!emptyEl || !contentEl) return;
  const root = emptyEl.parentElement;

  /* ----- shared 라벨 크기 row builder (Group 6 task 6) -----
   * A "라벨 크기" number input in points; stores obj.labelSize in world mm.
   * `applies(o)` guards which selected object types accept the edit (line vs box).
   * Returns { row, num } so callers can append it and sync its value in populate(). */
  function makeLabelSizeRow(applies, labelText = "라벨 크기") {
    const row = document.createElement("div");
    row.className = "insp-row";
    const lbl = document.createElement("label");
    lbl.className = "insp-field-label";
    lbl.textContent = labelText;
    const num = document.createElement("input");
    num.type = "number";
    num.min = String(MIN_TEXT_PT);
    num.max = "400";
    num.step = "1";
    num.className = "insp-input";
    // 'pt' 단위를 박스 안(오른쪽)에 표시 — 다른 입력 박스와 폭·모양 통일
    const wrap = document.createElement("span");
    wrap.style.cssText = "position:relative;display:block;min-width:0;";
    num.style.cssText = "width:100%;box-sizing:border-box;padding-right:24px;";
    const unit = document.createElement("span");
    unit.textContent = "pt";
    unit.style.cssText = "position:absolute;right:8px;top:50%;transform:translateY(-50%);" +
      "font-size:10px;color:var(--text-secondary);pointer-events:none;";
    wrap.appendChild(num); wrap.appendChild(unit);
    row.appendChild(lbl); row.appendChild(wrap);
    // 숫자만 입력해도 즉시 반영: input마다 적용하되 Undo 스냅샷은 편집 세션당 1회
    let editSnap = null;
    const applySize = (pushUndo) => {
      const s = state.get();
      const id = (s.selectedIds || [])[0];
      if (!id) return;
      let pt = Number(num.value);
      if (!isFinite(pt) || pt < MIN_TEXT_PT) return; // 입력 중 미완성 값은 무시
      const mm = ptToMm(Math.min(400, pt));
      state.update((s2) => {
        const o = s2.objects.find((it) => it.id === id);
        if (!o || !applies(o) || o.locked) return;
        if (o.labelSize === mm) return;
        if (pushUndo && editSnap) { s2.undoStack.push(editSnap); s2.redoStack = []; editSnap = null; }
        o.labelSize = mm;
      });
    };
    num.addEventListener("focus", () => { editSnap = JSON.parse(JSON.stringify(state.get().objects)); });
    num.addEventListener("input", () => applySize(true));
    num.addEventListener("change", () => { applySize(true); editSnap = null; });
    return { row, num };
  }

  function normalizeLabelType(value, fallback = "quantity") {
    return OBJECT_LABEL_TYPES.includes(value) ? value : fallback;
  }

  function makeLabelTypeRow(applies, fallback = "quantity") {
    const row = document.createElement("div");
    row.className = "insp-row";
    const lbl = document.createElement("label");
    lbl.className = "insp-field-label";
    lbl.textContent = "라벨 종류";
    const sel = document.createElement("select");
    sel.className = "insp-input";
    [
      ["quantity", "물리량"],
      ["label", "라벨"],
    ].forEach(([value, text]) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = text;
      sel.appendChild(opt);
    });
    row.appendChild(lbl);
    row.appendChild(sel);
    sel.addEventListener("change", () => {
      const s = state.get();
      const id = (s.selectedIds || [])[0];
      if (!id) return;
      const nextType = normalizeLabelType(sel.value, fallback);
      const snap = JSON.parse(JSON.stringify(s.objects));
      state.update((s2) => {
        const o = s2.objects.find((it) => it.id === id);
        if (!o || !applies(o) || o.locked) return;
        if (normalizeLabelType(o.labelType, fallback) === nextType && o.labelType === nextType) return;
        o.labelType = nextType;
        s2.undoStack.push(snap);
        s2.redoStack = [];
      });
    });
    return {
      row,
      sel,
      sync(obj) {
        sel.value = normalizeLabelType(obj?.labelType, fallback);
      },
    };
  }

  // Capture a full objects snapshot from current state (for undo)
  function snapBefore() {
    const s = state.get();
    const ids = s.selectedIds || [];
    return ids.length ? JSON.parse(JSON.stringify(s.objects)) : null;
  }

  function pushSnap(snap) {
    if (!snap) return;
    state.update((s) => { s.undoStack.push(snap); s.redoStack = []; });
  }

  // (평가원/자유 설정 object-style mode removed in v0.22.0 — objects are always free.)

  function setButtonDisabled(btn, disabled) {
    btn.disabled = !!disabled;
    btn.style.opacity = disabled ? "0.45" : "";
    btn.style.cursor = disabled ? "default" : "pointer";
  }

  function commitSelectedObject(apply) {
    const s = state.get();
    if (!(s.selectedIds || []).length) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((item) => item.id === (s2.selectedIds || [])[0]);
      if (!o || o.locked) return;
      if (!apply(o)) return;
      s2.undoStack.push(snap);
      s2.redoStack = [];
    });
  }

  // Snapshot that does NOT depend on selection: snapBefore() returns null when
  // nothing is selected, but bg controls act with no canvas selection at all.
  function snapObjectsAlways() { return JSON.parse(JSON.stringify(state.get().objects)); }

  return {
    state,
    emptyEl,
    contentEl,
    root,
    snapBefore,
    pushSnap,
    snapObjectsAlways,
    setButtonDisabled,
    makeLabelSizeRow,
    makeLabelTypeRow,
    commitSelectedObject,
  };
}

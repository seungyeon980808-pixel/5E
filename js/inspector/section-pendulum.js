/* ===== INSPECTOR SECTION — 진자 (pendulum display options) =====
 * Extracted verbatim from initInspector() in js/inspector.js (v0.44.0
 * split). Builds the section DOM and wires its events; mounting into the
 * inspector panel happens in js/inspector.js (the orchestrator). */

import { makeSection } from "./widgets.js?v=1.3.0";

export function buildPendulumSection(ctx) {
  const { state } = ctx;

  /* ---- Section: 진자 (pendulum-only display options) ----
   * 중앙잔상 / 대칭잔상 / 길이표시 toggles + the 길이라벨 text (rendered as a physics
   * quantity label — see render.js renderPendulum, which reuses makeUprightLabel
   * with labelType "quantity", exactly like line/dimension labels). */
  const secPendBody = document.createElement("div");

  function makePendCheckbox(labelText, prop) {
    const row = document.createElement("div");
    row.className = "insp-row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "insp-cb";
    const lbl = document.createElement("label");
    lbl.className = "insp-field-label";
    lbl.textContent = labelText;
    row.appendChild(cb);
    row.appendChild(lbl);
    secPendBody.appendChild(row);
    cb.addEventListener("change", () => {
      const s = state.get();
      if (!(s.selectedIds || []).length) return;
      const snap = JSON.parse(JSON.stringify(s.objects));
      const val = cb.checked;
      state.update((s2) => {
        const o = s2.objects.find((o) => o.id === (s2.selectedIds || [])[0]);
        if (!o || o.type !== "pendulum" || o.locked) return;
        s2.undoStack.push(snap); s2.redoStack = [];
        o[prop] = val;
      });
    });
    return { row, cb };
  }

  const pendCenterCb = makePendCheckbox("중앙잔상", "showCenterGhost");
  const pendSymCb    = makePendCheckbox("대칭잔상", "showSymmetricGhost");
  const pendLenCb    = makePendCheckbox("길이표시", "showLengthLabel");

  const pendLabelRow = document.createElement("div");
  pendLabelRow.className = "insp-row";
  const pendLabelLbl = document.createElement("label");
  pendLabelLbl.className = "insp-field-label";
  pendLabelLbl.textContent = "길이라벨";
  const pendLabelInp = document.createElement("input");
  pendLabelInp.type = "text";
  pendLabelInp.className = "insp-input";
  pendLabelRow.appendChild(pendLabelLbl);
  pendLabelRow.appendChild(pendLabelInp);
  secPendBody.appendChild(pendLabelRow);
  function commitPendLabel() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    const val = pendLabelInp.value;
    state.update((s2) => {
      const o = s2.objects.find((it) => it.id === ids[0]);
      if (!o || o.type !== "pendulum" || o.locked) return;
      if ((o.lengthLabel ?? "") === val) return;
      s2.undoStack.push(snap); s2.redoStack = [];
      o.lengthLabel = val;
    });
  }
  pendLabelInp.addEventListener("input", commitPendLabel);
  pendLabelInp.addEventListener("change", commitPendLabel);

  /* 추 반지름(mm) — 렌더러는 원래 bobRadius 를 읽는데(자동값 우선순위: 저장값 > 길이 비례)
   * 조절 UI가 없었다(2026-07-31 교사 요구). 비우면 자동으로 돌아간다. */
  const pendBobRow = document.createElement("div");
  pendBobRow.className = "insp-row";
  const pendBobLbl = document.createElement("label");
  pendBobLbl.className = "insp-field-label";
  pendBobLbl.textContent = "추 반지름";
  const pendBobInp = document.createElement("input");
  pendBobInp.type = "number";
  pendBobInp.step = "0.1";
  pendBobInp.min = "0.5";
  pendBobInp.className = "insp-input";
  const pendBobUnit = document.createElement("span");
  pendBobUnit.className = "insp-unit";
  pendBobUnit.textContent = "mm";
  pendBobRow.appendChild(pendBobLbl);
  pendBobRow.appendChild(pendBobInp);
  pendBobRow.appendChild(pendBobUnit);
  secPendBody.appendChild(pendBobRow);
  function commitPendBob() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const raw = pendBobInp.value.trim();
    const val = raw === "" ? null : parseFloat(raw);
    if (val !== null && (!isFinite(val) || val <= 0)) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((it) => it.id === ids[0]);
      if (!o || o.type !== "pendulum" || o.locked) return;
      if ((o.bobRadius ?? null) === val) return;
      s2.undoStack.push(snap); s2.redoStack = [];
      if (val === null) delete o.bobRadius;   // 비우면 자동(길이 비례)으로 복귀
      else o.bobRadius = val;
    });
  }
  pendBobInp.addEventListener("keydown", (e) => { if (e.key === "Enter") pendBobInp.blur(); });
  pendBobInp.addEventListener("blur", commitPendBob);

  const secPend = makeSection("진자", secPendBody);

  return { secPend, pendCenterCb, pendSymCb, pendLenCb, pendLabelRow, pendLabelInp,
           pendBobRow, pendBobInp };
}

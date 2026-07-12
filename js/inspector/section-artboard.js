/* ===== INSPECTOR SECTION — 아트보드 (page size, empty state) =====
 * Extracted verbatim from initInspector() in js/inspector.js (v0.44.0
 * split). Builds the section DOM and wires its events; mounting into the
 * inspector panel happens in js/inspector.js (the orchestrator). */

import { makeSection } from "./widgets.js?v=0.56.0";

export function buildArtboardSection(ctx) {
  const { state } = ctx;

  /* ---- Section: 아트보드 (shown in the no-selection / empty state) ---- *
   * Lets the user set the page size. Changing it ONLY moves the artboard
   * boundary — objects keep their exact world coordinates. The artboard stays
   * centered on origin: render.js derives x=-w/2, y=-h/2 from state.artboard,
   * so it re-centers automatically. Max 200×200, min 10×10 (clamped here). */
  const AB_MIN = 10, AB_MAX = 200;

  const abBody = document.createElement("div");
  abBody.className = "insp-body";

  // Click-to-select-all for the artboard number inputs (mirrors contentEl above;
  // emptyEl/abSection live outside contentEl so they need their own handler).
  abBody.addEventListener("focusin", (e) => {
    const t = e.target;
    if (t && t.tagName === "INPUT" && t.type === "number") t.select();
  });

  function makeArtboardRow(labelText) {
    const row = document.createElement("div");
    row.className = "insp-row";
    const lbl = document.createElement("label");
    lbl.className = "insp-field-label";
    lbl.style.minWidth = "44px";
    lbl.textContent = labelText;
    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = String(AB_MIN);
    inp.max = String(AB_MAX);
    inp.step = "1";
    inp.className = "insp-input";
    const unit = document.createElement("span");
    unit.className = "insp-unit";
    unit.textContent = "mm";
    row.appendChild(lbl);
    row.appendChild(inp);
    row.appendChild(unit);
    return { el: row, inp };
  }

  const abW = makeArtboardRow("너비(W)");
  const abH = makeArtboardRow("높이(H)");
  abBody.appendChild(abW.el);
  abBody.appendChild(abH.el);

  // Apply new size through the store so render() re-runs. Objects untouched.
  function applyArtboard(w, h) {
    const cw = Math.max(AB_MIN, Math.min(AB_MAX, Math.round(w)));
    const ch = Math.max(AB_MIN, Math.min(AB_MAX, Math.round(h)));
    state.update((s2) => { s2.artboard = { w: cw, h: ch }; });
  }

  function commitArtboard() {
    const s = state.get();
    const w = parseFloat(abW.inp.value);
    const h = parseFloat(abH.inp.value);
    applyArtboard(isFinite(w) ? w : s.artboard.w, isFinite(h) ? h : s.artboard.h);
  }

  [abW.inp, abH.inp].forEach((inp) => {
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
    inp.addEventListener("blur", commitArtboard);
  });

  // Preset buttons: just set w,h and apply the same way.
  const abPresets = document.createElement("div");
  abPresets.className = "insp-ab-presets";
  [[60, 40], [95, 50], [80, 35], [160, 80]].forEach(([w, h]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "insp-ab-preset";
    btn.textContent = `${w}×${h}`;
    btn.addEventListener("click", () => applyArtboard(w, h));
    abPresets.appendChild(btn);
  });
  abBody.appendChild(abPresets);

  const abSection = makeSection("아트보드", abBody);

  // Refresh inputs from state (skip while the user is typing in one).
  function refreshArtboard(s) {
    if (document.activeElement === abW.inp || document.activeElement === abH.inp) return;
    abW.inp.value = s.artboard.w;
    abH.inp.value = s.artboard.h;
  }

  return { abSection, refreshArtboard };
}

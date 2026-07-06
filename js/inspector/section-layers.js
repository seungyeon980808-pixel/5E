/* ===== INSPECTOR SECTION — 레이어 (layer list panel) =====
 * Extracted verbatim from initInspector() in js/inspector.js (v0.44.0
 * split). Builds the section DOM and wires its events; mounting into the
 * inspector panel happens in js/inspector.js (the orchestrator). */

export function buildLayersSection(ctx) {
  const { state } = ctx;

  /* ---- Section: 레이어 (always visible — lives outside contentEl) ---- */
  const layerDetails = document.createElement("details");
  layerDetails.open = true;
  layerDetails.className = "insp-section";
  // Pin to the bottom of the inspector. #inspector is already a full-height
  // flex column (see inspector.css), so margin-top:auto pushes this to the end.
  layerDetails.style.marginTop = "auto";
  const layerSummary = document.createElement("summary");
  layerSummary.className = "insp-summary";
  layerSummary.textContent = "레이어";
  layerDetails.appendChild(layerSummary);

  const layerBody = document.createElement("div");
  layerBody.className = "insp-body";
  layerBody.style.padding = "4px 0";
  layerDetails.appendChild(layerBody);

  function renderLayerPanel(s) {
    // Bail ONLY while the inline rename INPUT is focused — re-rendering then would
    // clobber the edit. A focused eye BUTTON must NOT block re-render, else the
    // visibility toggle won't show until another action re-renders (real mouse
    // clicks focus the button; programmatic .click() doesn't — that hid the bug).
    const ae = document.activeElement;
    if (ae && ae.tagName === "INPUT" && layerBody.contains(ae)) return;
    layerBody.innerHTML = "";

    // Layer list box (top row = front-most, 3 → 2 → 1). Themed via CSS classes.
    const listBox = document.createElement("div");
    listBox.className = "insp-layers";
    layerBody.appendChild(listBox);

    // Eye (visible) / eye-off (hidden) toggle glyphs — currentColor stroke.
    const EYE =
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.8 10S4.8 4.8 10 4.8 18.2 10 18.2 10 15.2 15.2 10 15.2 1.8 10 1.8 10Z"/><circle cx="10" cy="10" r="2.3"/></svg>';
    const EYE_OFF =
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.8 10S4.8 4.8 10 4.8 18.2 10 18.2 10 15.2 15.2 10 15.2 1.8 10 1.8 10Z"/><circle cx="10" cy="10" r="2.3"/><line x1="3.4" y1="3.4" x2="16.6" y2="16.6"/></svg>';

    const layers = [...(s.layers || [])].reverse(); // layer 3 on top → layer 1 on bottom
    for (const layer of layers) {
      const isActive = layer.id === s.activeLayerId;
      const isHidden = layer.visible === false;

      const row = document.createElement("div");
      row.className =
        "insp-layer-row" + (isActive ? " is-active" : "") + (isHidden ? " is-hidden" : "");

      // Visibility toggle (eye). stopPropagation keeps it from also triggering
      // the row's "set active" click.
      const eyeBtn = document.createElement("button");
      eyeBtn.type = "button";
      eyeBtn.className = "insp-layer-eye";
      eyeBtn.innerHTML = isHidden ? EYE_OFF : EYE;
      eyeBtn.title = isHidden ? "표시" : "숨기기";
      eyeBtn.setAttribute("aria-label", isHidden ? "레이어 표시" : "레이어 숨기기");
      eyeBtn.setAttribute("aria-pressed", String(!isHidden));
      eyeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        state.update((s2) => {
          const l = s2.layers.find((l) => l.id === layer.id);
          if (l) l.visible = isHidden; // hidden → show, visible → hide
        });
      });

      // Layer name
      const nameSpan = document.createElement("span");
      nameSpan.className = "insp-layer-name";
      nameSpan.textContent = layer.name;

      // Click row → set active layer
      row.addEventListener("click", () => {
        state.update((s2) => {
          s2.activeLayerId = layer.id;
          s2.selectedIds = [];
          s2.targetedId = null;
        });
      });

      // Double-click name → inline rename
      nameSpan.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const inp = document.createElement("input");
        inp.className = "insp-layer-name-input";
        inp.value = layer.name;
        nameSpan.replaceWith(inp);
        inp.focus();
        inp.select();
        let committed = false;
        function commitName() {
          if (committed) return;
          committed = true;
          const newName = inp.value.trim() || layer.name;
          state.update((s2) => {
            const l = s2.layers.find((l) => l.id === layer.id);
            if (l) l.name = newName;
          });
        }
        inp.addEventListener("blur", commitName);
        inp.addEventListener("keydown", (e2) => {
          if (e2.key === "Enter") { inp.blur(); }
          if (e2.key === "Escape") { committed = true; renderLayerPanel(state.get()); }
        });
      });

      row.appendChild(eyeBtn);
      row.appendChild(nameSpan);
      listBox.appendChild(row);
    }
  }

  return { layerDetails, renderLayerPanel };
}

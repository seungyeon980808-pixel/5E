/* ===== INSPECTOR SECTION — 레이어 (layer list panel) =====
 * Extracted verbatim from initInspector() in js/inspector.js (v0.42.0
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
    if (layerBody.contains(document.activeElement)) return; // don't clobber inline name edit
    layerBody.innerHTML = "";

    // Bordered box holding the layer rows (top row = front-most, 3 → 2 → 1).
    const listBox = document.createElement("div");
    listBox.style.cssText =
      "border:1px solid #d0d7de;border-radius:4px;overflow:hidden;";
    layerBody.appendChild(listBox);

    const layers = [...(s.layers || [])].reverse(); // layer 3 on top → layer 1 on bottom
    for (const layer of layers) {
      const isActive = layer.id === s.activeLayerId;
      const isHidden = layer.visible === false;

      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:6px;padding:4px 8px;cursor:pointer;" +
        "border-left:3px solid " + (isActive ? "#0969da" : "transparent") + ";" +
        "background:" + (isActive ? "rgba(9,105,218,0.12)" : "transparent") + ";";

      // Visibility checkbox — checked = visible. stopPropagation keeps the
      // checkbox click from also triggering the row's "set active" handler.
      const visCb = document.createElement("input");
      visCb.type = "checkbox";
      visCb.checked = !isHidden;
      visCb.title = isHidden ? "표시" : "숨기기";
      visCb.style.cssText = "flex-shrink:0;cursor:pointer;margin:0;";
      visCb.addEventListener("click", (e) => { e.stopPropagation(); });
      visCb.addEventListener("change", (e) => {
        e.stopPropagation();
        state.update((s2) => {
          const l = s2.layers.find(l => l.id === layer.id);
          if (l) l.visible = !visCb.checked ? false : true;
        });
      });

      // Layer name
      const nameSpan = document.createElement("span");
      nameSpan.textContent = layer.name;
      nameSpan.style.cssText =
        "flex:1;font-size:12px;user-select:none;overflow:hidden;text-overflow:ellipsis;" +
        "white-space:nowrap;opacity:" + (isHidden ? "0.4" : "1") + ";";

      // Click row → set active layer
      row.addEventListener("click", () => {
        state.update((s2) => {
          s2.activeLayerId = layer.id;
          s2.selectedIds = [];
          s2.targetedId = null;
        });
      });

      // Double-click name → inline edit
      nameSpan.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const inp = document.createElement("input");
        inp.value = layer.name;
        inp.style.cssText =
          "flex:1;font-size:12px;background:#1e1f22;color:#dcddde;" +
          "border:1px solid #0969da;border-radius:3px;padding:1px 4px;width:100%;min-width:0;";
        nameSpan.replaceWith(inp);
        inp.focus();
        inp.select();
        let committed = false;
        function commitName() {
          if (committed) return;
          committed = true;
          const newName = inp.value.trim() || layer.name;
          state.update((s2) => {
            const l = s2.layers.find(l => l.id === layer.id);
            if (l) l.name = newName;
          });
        }
        inp.addEventListener("blur", commitName);
        inp.addEventListener("keydown", (e2) => {
          if (e2.key === "Enter") { inp.blur(); }
          if (e2.key === "Escape") { committed = true; renderLayerPanel(state.get()); }
        });
      });

      row.appendChild(visCb);
      row.appendChild(nameSpan);
      listBox.appendChild(row);
    }
  }

  return { layerDetails, renderLayerPanel };
}

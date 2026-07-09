/* ===== INSPECTOR SECTION — 배경 이미지 (global image panel) =====
 * Extracted verbatim from initInspector() in js/inspector.js (v0.44.0
 * split). Builds the section DOM and wires its events; mounting into the
 * inspector panel happens in js/inspector.js (the orchestrator). */

import { startImageCompare } from "../image-compare.js?v=0.54.12";

export function buildGlobalImageSection(ctx) {
  const { state, pushSnap, snapObjectsAlways } = ctx;

  /* ---- Section: 배경 이미지 (always visible when ≥1 background image exists) ----
   * Pinned at the VERY TOP of the inspector, OUTSIDE contentEl, so it shows
   * regardless of the current selection (even when nothing is selected). One row
   * per background image: thumbnail · 투명도 slider (same live-apply + single-undo
   * logic as the 이미지 section) · 객체로 인식 / 배경으로 되돌리기 toggle · 배경
   * 이미지 제거. An unrecognized background is unselectable on canvas, so this is
   * the only place to manage it. */
  const bgSection = document.createElement("details");
  bgSection.open = true;
  bgSection.className = "insp-section insp-bg-section";
  const bgSummary = document.createElement("summary");
  bgSummary.className = "insp-summary";
  bgSummary.textContent = "이미지";
  bgSection.appendChild(bgSummary);
  const bgBody = document.createElement("div");
  bgBody.className = "insp-body";
  bgSection.appendChild(bgBody);
  bgSection.style.display = "";

  let _managedImageId = null;
  let _bgOpacityDragId = null;

  function imageLabel(obj, index) {
    return obj.name || obj.label || `이미지 ${index + 1}`;
  }

  function renderGlobalImagePanel(s) {
    const images = (s.objects || []).filter((o) => o.type === "image");
    bgSection.style.display = "";
    if (_bgOpacityDragId) return;
    bgBody.innerHTML = "";

    if (!images.length) {
      const empty = document.createElement("div");
      empty.className = "objectify-status";
      empty.style.margin = "0";
      empty.textContent = "이미지 없음";
      bgBody.appendChild(empty);
      _managedImageId = null;
      return;
    }

    const selectedImage = images.find((img) => (s.selectedIds || []).includes(img.id));
    if (selectedImage) _managedImageId = selectedImage.id;
    if (!_managedImageId || !images.some((img) => img.id === _managedImageId)) {
      _managedImageId = (selectedImage || images[0]).id;
    }
    const img = images.find((item) => item.id === _managedImageId) || images[0];
    const id = img.id;
    const selectionLocked = !!(img.imageSelectionLocked === true || (img.mode === "background" && img.locked === true));

    const selectRow = document.createElement("div");
    selectRow.className = "insp-row";
    const selectLbl = document.createElement("label");
    selectLbl.className = "insp-field-label";
    selectLbl.textContent = "이미지 선택";
    const select = document.createElement("select");
    select.className = "insp-input";
    select.style.flex = "1";
    images.forEach((image, index) => {
      const opt = document.createElement("option");
      opt.value = image.id;
      opt.textContent = imageLabel(image, index);
      select.appendChild(opt);
    });
    select.value = id;
    select.addEventListener("change", () => {
      _managedImageId = select.value;
      state.update((s2) => {
        const o = s2.objects.find((x) => x.id === _managedImageId);
        if (!o) return;
        if (o.imageSelectionLocked === true || (o.mode === "background" && o.locked === true)) {
          s2.selectedIds = (s2.selectedIds || []).filter((sid) => sid !== o.id);
        } else {
          s2.selectedIds = [o.id];
          s2.targetedId = null;
          s2.activeTool = "V";
        }
      });
    });
    selectRow.appendChild(selectLbl);
    selectRow.appendChild(select);
    bgBody.appendChild(selectRow);

    const opRow = document.createElement("div");
    opRow.className = "insp-row";
    const opLbl = document.createElement("label");
    opLbl.className = "insp-field-label";
    opLbl.textContent = "투명도";
    const opRange = document.createElement("input");
    opRange.type = "range";
    opRange.min = "0";
    opRange.max = "1";
    opRange.step = "0.01";
    opRange.className = "insp-range";
    opRange.style.flex = "1";
    opRange.value = img.opacity ?? 1;
    const opOut = document.createElement("span");
    opOut.className = "insp-unit";
    opOut.style.minWidth = "38px";
    opOut.style.textAlign = "right";
    opOut.textContent = `${Math.round((img.opacity ?? 1) * 100)}%`;
    opRow.appendChild(opLbl);
    opRow.appendChild(opRange);
    opRow.appendChild(opOut);
    bgBody.appendChild(opRow);

    let _opSnap = null;
    opRange.addEventListener("pointerdown", () => { _opSnap = snapObjectsAlways(); _bgOpacityDragId = id; });
    opRange.addEventListener("input", () => {
      const v = Math.max(0, Math.min(1, Number(opRange.value)));
      opOut.textContent = `${Math.round(v * 100)}%`;
      state.update((s2) => {
        const o = s2.objects.find((x) => x.id === id);
        if (o) o.opacity = v;
      });
    });
    opRange.addEventListener("change", () => {
      _bgOpacityDragId = null;
      if (_opSnap) { pushSnap(_opSnap); _opSnap = null; }
    });

    const selectionLockRow = document.createElement("div");
    selectionLockRow.className = "insp-row";
    const selectionLockCb = document.createElement("input");
    selectionLockCb.type = "checkbox";
    selectionLockCb.className = "insp-cb";
    selectionLockCb.checked = selectionLocked;
    const selectionLockLbl = document.createElement("label");
    selectionLockLbl.className = "insp-field-label";
    selectionLockLbl.textContent = "선택금지";
    selectionLockRow.appendChild(selectionLockCb);
    selectionLockRow.appendChild(selectionLockLbl);
    bgBody.appendChild(selectionLockRow);
    selectionLockCb.addEventListener("change", () => {
      const snap = snapObjectsAlways();
      const locked = selectionLockCb.checked;
      state.update((s2) => {
        const o = s2.objects.find((x) => x.id === id);
        if (!o) return;
        o.imageSelectionLocked = locked;
        if (locked) {
          o.positionLocked = false;
          s2.selectedIds = (s2.selectedIds || []).filter((sid) => sid !== id);
          if (s2.targetedId === id) s2.targetedId = null;
        } else {
          if (o.mode === "background" && o.locked === true) o.locked = false;
          s2.selectedIds = [id];
          s2.targetedId = null;
          s2.activeTool = "V";
        }
        s2.undoStack.push(snap);
        s2.redoStack = [];
      });
    });

    const posLockRow = document.createElement("div");
    posLockRow.className = "insp-row";
    posLockRow.style.opacity = selectionLocked ? "0.45" : "";
    const posLockCb = document.createElement("input");
    posLockCb.type = "checkbox";
    posLockCb.className = "insp-cb";
    posLockCb.checked = !!img.positionLocked;
    posLockCb.disabled = selectionLocked;
    const posLockLbl = document.createElement("label");
    posLockLbl.className = "insp-field-label";
    posLockLbl.textContent = "위치고정";
    posLockRow.appendChild(posLockCb);
    posLockRow.appendChild(posLockLbl);
    bgBody.appendChild(posLockRow);
    posLockCb.addEventListener("change", () => {
      if (posLockCb.disabled) return;
      const snap = snapObjectsAlways();
      const locked = posLockCb.checked;
      state.update((s2) => {
        const o = s2.objects.find((x) => x.id === id);
        if (!o || o.imageSelectionLocked === true) return;
        o.positionLocked = locked;
        s2.undoStack.push(snap);
        s2.redoStack = [];
      });
    });

    // 비교: 트레이싱용 원본 이미지 vs 내가 그린 오브젝트를 좌우로 비교. 배경 이미지는
    // 선택금지 상태라 캔버스에서 못 고르므로, 이 관리 패널에 버튼을 둔다(순수 표시 —
    // state/undo/export에 흔적 없음). 영역 드래그+Enter 후 좌우 팝업.
    const compareRow = document.createElement("div");
    compareRow.className = "insp-row";
    const compareBtn = document.createElement("button");
    compareBtn.type = "button";
    compareBtn.className = "modal-btn";
    compareBtn.style.flex = "1";
    compareBtn.textContent = "비교";
    compareBtn.title = "영역을 지정해 원본 이미지와 내가 그린 그림을 좌우로 비교";
    compareBtn.addEventListener("click", () => startImageCompare(state, img));
    compareRow.appendChild(compareBtn);
    bgBody.appendChild(compareRow);
  }

  function renderBgSection(s) {
    renderGlobalImagePanel(s);
    return;
    const bgImages = (s.objects || []).filter((o) => o.type === "image" && o.mode === "background");
    bgSection.style.display = bgImages.length ? "" : "none";
    if (bgImages.length === 0) { bgBody.innerHTML = ""; return; }
    if (_bgOpacityDragId) return; // don't clobber a slider mid-drag
    bgBody.innerHTML = "";

    for (const img of bgImages) {
      const id = img.id;

      const row = document.createElement("div");
      row.className = "insp-bg-row";

      const thumb = document.createElement("img");
      thumb.className = "insp-bg-thumb";
      thumb.src = img.src;
      thumb.alt = "";
      row.appendChild(thumb);

      const col = document.createElement("div");
      col.className = "insp-bg-col";

      // 투명도 slider (reuses the 이미지 section's live-apply + single-undo pattern)
      const opRow = document.createElement("div");
      opRow.className = "insp-row";
      const opLbl = document.createElement("label");
      opLbl.className = "insp-field-label";
      opLbl.textContent = "투명도";
      const opRange = document.createElement("input");
      opRange.type = "range";
      opRange.min = "0"; opRange.max = "1"; opRange.step = "0.01";
      opRange.className = "insp-range";
      opRange.style.flex = "1";
      opRange.value = img.opacity ?? 1;
      const opOut = document.createElement("span");
      opOut.className = "insp-unit";
      opOut.style.minWidth = "38px";
      opOut.style.textAlign = "right";
      opOut.textContent = `${Math.round((img.opacity ?? 1) * 100)}%`;
      opRow.appendChild(opLbl);
      opRow.appendChild(opRange);
      opRow.appendChild(opOut);
      col.appendChild(opRow);
      opLbl.textContent = "투명도";

      let _opSnap = null;
      opRange.addEventListener("pointerdown", () => { _opSnap = snapObjectsAlways(); _bgOpacityDragId = id; });
      opRange.addEventListener("input", () => {
        const v = Math.max(0, Math.min(1, Number(opRange.value)));
        opOut.textContent = `${Math.round(v * 100)}%`;
        state.update((s2) => { const o = s2.objects.find((x) => x.id === id); if (o) o.opacity = v; });
      });
      opRange.addEventListener("change", () => {
        _bgOpacityDragId = null;
        if (_opSnap) { pushSnap(_opSnap); _opSnap = null; }
      });

      // 인식 토글 + 제거 buttons
      const lockRow = document.createElement("div");
      lockRow.className = "insp-row";
      const lockCb = document.createElement("input");
      lockCb.type = "checkbox";
      lockCb.className = "insp-cb";
      lockCb.checked = !!img.locked;
      const lockLbl = document.createElement("label");
      lockLbl.className = "insp-field-label";
      lockLbl.textContent = "잠금";
      lockRow.appendChild(lockCb);
      lockRow.appendChild(lockLbl);
      col.appendChild(lockRow);
      lockLbl.textContent = "잠금";
      lockCb.addEventListener("change", () => {
        const snap = snapObjectsAlways();
        const locked = lockCb.checked;
        state.update((s2) => {
          const o = s2.objects.find((x) => x.id === id);
          if (!o || o.locked === locked) return;
          o.locked = locked;
          if (locked) {
            s2.selectedIds = (s2.selectedIds || []).filter((sid) => sid !== id);
            if (s2.targetedId === id) s2.targetedId = null;
          }
          s2.undoStack.push(snap);
          s2.redoStack = [];
        });
      });

      const btnRow = document.createElement("div");
      btnRow.className = "insp-bg-btns";

      const recBtn = document.createElement("button");
      recBtn.type = "button";
      recBtn.className = "modal-btn";
      queueMicrotask(() => { recBtn.textContent = img.recognized === true ? "배경으로 되돌리기" : "객체로 인식"; });
      recBtn.textContent = img.recognized === true ? "배경으로 되돌리기" : "객체로 인식";
      recBtn.addEventListener("click", () => {
        const snap = snapObjectsAlways();
        state.update((s2) => {
          const o = s2.objects.find((x) => x.id === id);
          if (!o) return;
          const next = !(o.recognized === true);
          o.recognized = next;
          // 배경으로 되돌리기 → unselectable again: drop it from any live selection.
          if (!next) {
            s2.selectedIds = (s2.selectedIds || []).filter((sid) => sid !== id);
            if (s2.targetedId === id) s2.targetedId = null;
          }
          s2.undoStack.push(snap);
          s2.redoStack = [];
        });
      });

      const rmBtn = document.createElement("button");
      rmBtn.type = "button";
      rmBtn.className = "modal-btn";
      queueMicrotask(() => { rmBtn.textContent = "배경 이미지 제거"; });
      rmBtn.textContent = "배경 이미지 제거";
      rmBtn.addEventListener("click", () => {
        const snap = snapObjectsAlways();
        state.update((s2) => {
          s2.objects = s2.objects.filter((x) => x.id !== id);
          s2.selectedIds = (s2.selectedIds || []).filter((sid) => sid !== id);
          if (s2.targetedId === id) s2.targetedId = null;
          s2.undoStack.push(snap);
          s2.redoStack = [];
        });
      });

      btnRow.appendChild(recBtn);
      btnRow.appendChild(rmBtn);
      col.appendChild(btnRow);

      row.appendChild(col);
      bgBody.appendChild(row);
    }
  }

  return { bgSection, renderBgSection };
}

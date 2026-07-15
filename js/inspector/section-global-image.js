/* ===== INSPECTOR SECTION — 배경 이미지 (global image panel) =====
 * Extracted verbatim from initInspector() in js/inspector.js (v0.44.0
 * split). Builds the section DOM and wires its events; mounting into the
 * inspector panel happens in js/inspector.js (the orchestrator). */

import { startImageCompare } from "../image-compare.js?v=1.0.0";

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
  bgSummary.textContent = "이미지 관리";
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

    // ----- 잠금류 토글 3종을 한 그리드로 통합(요구: 이미지 관리 한 패널에서 다 관리) -----
    //   선택금지 | 위치고정
    //   비율고정 |
    // '잠금'(obj.locked)은 위치고정+비율고정과 중복이라 두지 않는다(요구). 아래의 별도
    // '이미지' 섹션은 일반 선택 화면에서 감춘다(inspector.js) — 여기로 일원화.
    const lockGrid = document.createElement("div");
    lockGrid.className = "insp-row";
    lockGrid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;align-items:center;";
    // 체크박스 셀(라벨 클릭으로도 토글). disabled면 흐리게.
    const lockCell = (labelText, checked, disabled) => {
      const cell = document.createElement("label");
      cell.style.cssText = "display:flex;align-items:center;gap:6px;margin:0;cursor:pointer;" +
        (disabled ? "opacity:0.45;cursor:default;" : "");
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.className = "insp-cb"; cb.checked = checked; cb.disabled = disabled;
      const lbl = document.createElement("span");
      lbl.className = "insp-field-label"; lbl.textContent = labelText; lbl.style.margin = "0";
      cell.appendChild(cb); cell.appendChild(lbl);
      return { cell, cb };
    };
    // 선택금지면 위치고정·비율고정 둘 다 비활성(요구: 선택금지 상태에선 이미지 자체를 못
    // 건드리므로 위치·비율도 잠긴 것으로 본다).
    const { cell: selCell, cb: selectionLockCb } = lockCell("선택금지", selectionLocked, false);
    const { cell: posCell, cb: posLockCb } = lockCell("위치고정", !!img.positionLocked, selectionLocked);
    const { cell: aspCell, cb: aspectCb } = lockCell("비율고정", img.aspectLocked !== false, selectionLocked);
    lockGrid.appendChild(selCell);
    lockGrid.appendChild(posCell);
    lockGrid.appendChild(aspCell);
    bgBody.appendChild(lockGrid);

    // 선택금지: 켜면 캔버스에서 못 고르게(위치고정 해제·선택 해제). 끄면 다시 선택 가능.
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
    // 위치고정: 이동 잠금(선택금지면 비활성).
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
    // 비율고정: 크기 조절 시 가로세로 비율 유지(삽입 기본 on). 선택금지면 비활성이라 무시.
    aspectCb.addEventListener("change", () => {
      if (aspectCb.disabled) return;
      const snap = snapObjectsAlways();
      const locked = aspectCb.checked;
      state.update((s2) => {
        const o = s2.objects.find((x) => x.id === id);
        if (!o || o.aspectLocked === locked) return;
        o.aspectLocked = locked;
        s2.undoStack.push(snap);
        s2.redoStack = [];
      });
    });

    // ----- 비교 · 삭제 (한 줄, 나란히 — 아트보드 프리셋처럼 작게 insp-ab-preset) -----
    const btnRow = document.createElement("div");
    btnRow.className = "insp-row";
    btnRow.style.cssText = "display:flex;gap:6px;";
    // 비교: 트레이싱용 원본 이미지 vs 내가 그린 오브젝트를 좌우로 비교(순수 표시, undo/export 무영향).
    const compareBtn = document.createElement("button");
    compareBtn.type = "button";
    compareBtn.className = "insp-ab-preset";
    compareBtn.style.flex = "1";
    compareBtn.textContent = "비교";
    compareBtn.title = "영역을 지정해 원본 이미지와 내가 그린 그림을 좌우로 비교";
    compareBtn.addEventListener("click", () => startImageCompare(state, img));
    // 삭제: 선택금지/배경이라 캔버스에서 못 골라도 여기서 삭제(undo 가능).
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "insp-ab-preset insp-image-delete-btn";
    delBtn.style.flex = "1";
    delBtn.textContent = "삭제";
    delBtn.title = "이 이미지를 삭제합니다 (Ctrl+Z로 되돌리기 가능)";
    delBtn.addEventListener("click", () => {
      const snap = snapObjectsAlways();
      state.update((s2) => {
        const before = (s2.objects || []).length;
        s2.objects = (s2.objects || []).filter((x) => x.id !== id);
        if ((s2.objects || []).length === before) return;   // 대상 없음 → undo 스냅 남기지 않음
        s2.selectedIds = (s2.selectedIds || []).filter((sid) => sid !== id);
        if (s2.targetedId === id) s2.targetedId = null;
        s2.undoStack.push(snap);
        s2.redoStack = [];
      });
      _managedImageId = null;  // 다음 렌더에서 남은 이미지로 재선택(없으면 "이미지 없음")
    });
    btnRow.appendChild(compareBtn);
    btnRow.appendChild(delBtn);
    bgBody.appendChild(btnRow);
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

/* ===== INSPECTOR SECTION — 이미지 (single image object) =====
 * Extracted verbatim from initInspector() in js/inspector.js (v0.44.0
 * split). Builds the section DOM and wires its events; mounting into the
 * inspector panel happens in js/inspector.js (the orchestrator). */

import { startRectErase, startPathErase, clearCutouts, cancelImageEditSession } from "../image-cutout.js?v=0.48.5";
import { makeSection } from "./widgets.js?v=0.48.5";

export function buildImageSection(ctx) {
  const { state, snapBefore, pushSnap } = ctx;

  /* ---- Section: 이미지 (single image object only) ----
   * Controls for a pasted image object (배경/편집 모드). opacity/lock/remove work
   * even on a locked background image (they are how the user manages it); 비율 고정
   * is edit-mode only. No erase/cutout controls in this pass (cutouts is future data). */
  const imgBody = document.createElement("div");
  imgBody.className = "insp-body";

  // opacity slider (0–1) with a % readout.
  const imgOpacityRow = document.createElement("div");
  imgOpacityRow.className = "insp-row";
  const imgOpacityLbl = document.createElement("label");
  imgOpacityLbl.className = "insp-field-label";
  imgOpacityLbl.textContent = "투명도";
  const imgOpacityRange = document.createElement("input");
  imgOpacityRange.type = "range";
  imgOpacityRange.min = "0";
  imgOpacityRange.max = "1";
  imgOpacityRange.step = "0.01";
  imgOpacityRange.className = "insp-range";
  imgOpacityRange.style.flex = "1";
  const imgOpacityOut = document.createElement("span");
  imgOpacityOut.className = "insp-unit";
  imgOpacityOut.style.minWidth = "38px";
  imgOpacityOut.style.textAlign = "right";
  imgOpacityRow.appendChild(imgOpacityLbl);
  imgOpacityRow.appendChild(imgOpacityRange);
  imgOpacityRow.appendChild(imgOpacityOut);
  imgBody.appendChild(imgOpacityRow);

  // 비율 고정 (edit-mode images; controls proportional resize — transform.js).
  const imgAspectRow = document.createElement("div");
  imgAspectRow.className = "insp-row";
  const imgAspectCb = document.createElement("input");
  imgAspectCb.type = "checkbox";
  imgAspectCb.className = "insp-cb";
  const imgAspectLbl = document.createElement("label");
  imgAspectLbl.className = "insp-field-label";
  imgAspectLbl.textContent = "비율 고정";
  imgAspectRow.appendChild(imgAspectCb);
  imgAspectRow.appendChild(imgAspectLbl);
  imgBody.appendChild(imgAspectRow);

  // ---- 이미지 오려내기 (edit-mode images only): erase unwanted regions to transparent.
  // Rect/freeform cutouts + a clear button. Data lives in obj.cutouts (local
  // fractions); the gesture itself is owned by image-cutout.js. Shown only for a
  // single edit-mode image (toggled in the update pass below). ----
  const imgCutoutBlock = document.createElement("div");
  imgCutoutBlock.className = "insp-body";
  imgCutoutBlock.style.cssText = "padding:0;margin:2px 0 4px;display:flex;flex-direction:column;gap:4px;";

  const imgRectEraseBtn = document.createElement("button");
  imgRectEraseBtn.type = "button";
  imgRectEraseBtn.className = "modal-btn";
  imgRectEraseBtn.style.width = "100%";
  imgRectEraseBtn.textContent = "사각형 영역 지우기";

  const imgPathEraseBtn = document.createElement("button");
  imgPathEraseBtn.type = "button";
  imgPathEraseBtn.className = "modal-btn";
  imgPathEraseBtn.style.width = "100%";
  imgPathEraseBtn.textContent = "자유 영역 지우기";

  const imgClearCutBtn = document.createElement("button");
  imgClearCutBtn.type = "button";
  imgClearCutBtn.className = "modal-btn";
  imgClearCutBtn.style.width = "100%";
  imgClearCutBtn.textContent = "지운 영역 초기화";

  imgCutoutBlock.appendChild(imgRectEraseBtn);
  imgCutoutBlock.appendChild(imgPathEraseBtn);
  imgCutoutBlock.appendChild(imgClearCutBtn);
  imgBody.appendChild(imgCutoutBlock);

  imgRectEraseBtn.addEventListener("click", () => startRectErase());
  imgPathEraseBtn.addEventListener("click", () => startPathErase());
  imgClearCutBtn.addEventListener("click", () => clearCutouts());
  imgCutoutBlock.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button");
    if (btn === imgRectEraseBtn) startRectErase();
    else if (btn === imgPathEraseBtn) startPathErase();
    else if (btn === imgClearCutBtn) clearCutouts();
  });

  // 잠금 (lock/unlock) — mirrors obj.locked; usable on a locked background image.
  const imgLockRow = document.createElement("div");
  imgLockRow.className = "insp-row";
  const imgLockCb = document.createElement("input");
  imgLockCb.type = "checkbox";
  imgLockCb.className = "insp-cb";
  const imgLockLbl = document.createElement("label");
  imgLockLbl.className = "insp-field-label";
  imgLockLbl.textContent = "잠금";
  imgLockRow.appendChild(imgLockCb);
  imgLockRow.appendChild(imgLockLbl);
  imgBody.appendChild(imgLockRow);

  // Export note for background images (exportable:false by default).
  const imgExportNote = document.createElement("p");
  imgExportNote.className = "objectify-status";
  imgExportNote.style.margin = "4px 0 6px";
  imgExportNote.textContent = "배경 이미지는 기본적으로 내보내기에서 제외됩니다.";
  imgBody.appendChild(imgExportNote);

  // remove button (label switches to 배경 이미지 제거 for background mode).
  const imgRemoveRow = document.createElement("div");
  imgRemoveRow.className = "insp-row";
  const imgRemoveBtn = document.createElement("button");
  imgRemoveBtn.type = "button";
  imgRemoveBtn.className = "modal-btn";
  imgRemoveBtn.style.width = "100%";
  imgRemoveBtn.textContent = "이미지 제거";
  imgRemoveRow.appendChild(imgRemoveBtn);
  imgBody.appendChild(imgRemoveRow);

  const imageSection = makeSection("이미지", imgBody);


  imageSection.querySelector("summary").textContent = "이미지";
  imgOpacityLbl.textContent = "투명도";
  imgAspectLbl.textContent = "비율 고정";
  imgLockLbl.textContent = "잠금";
  imgExportNote.textContent = "배경 이미지는 완성 이미지 저장/내보내기에서 제외됩니다.";
  imgRemoveBtn.textContent = "이미지 제거";
  imgClearCutBtn.textContent = "지운 영역 초기화";
  imgRectEraseBtn.className = "modal-btn image-edit-tool-btn";
  imgRectEraseBtn.innerHTML = `<span class="image-edit-tool-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" focusable="false">
      <rect x="5" y="6" width="14" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="3 2"></rect>
    </svg>
  </span><span>사각형 영역 지우기</span>`;
  imgPathEraseBtn.className = "modal-btn image-edit-tool-btn";
  imgPathEraseBtn.innerHTML = `<span class="image-edit-tool-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M6.2 8.4 C8.3 5.6 13.4 4.8 16.8 6.7 C20.1 8.6 18.7 13.3 16.1 15.6 C13.4 18 7.8 18.6 5.4 15.2 C3.8 12.9 4.6 10.4 6.2 8.4 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 2"></path>
    </svg>
  </span><span>자유 영역 지우기</span>`;
  imgRectEraseBtn.onclick = async () => {
    const mod = await import("../image-cutout.js?v=0.48.5");
    mod.startRectErase();
  };
  imgPathEraseBtn.onclick = async () => {
    const mod = await import("../image-cutout.js?v=0.48.5");
    mod.startPathErase();
  };

  // ---- image mutators: operate on the single selected image, ignoring `locked`
  // (opacity/lock/remove are exactly how a locked background image is managed). ----
  function selectedImage(s) {
    if (s.imageEditSession && (s.selectedIds || [])[0] === "image-edit-session") return s.imageEditSession;
    const o = s.objects.find((x) => x.id === (s.selectedIds || [])[0]);
    return o && o.type === "image" ? o : null;
  }
  function mutateImage(apply) {
    const s = state.get();
    const cur = selectedImage(s);
    if (!cur) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = selectedImage(s2);
      if (!o || !apply(s2, o)) return;
      s2.undoStack.push(snap);
      s2.redoStack = [];
    });
  }

  // opacity: one undo per drag (snapshot on press, live-apply on input, push on release).
  let _imgOpacitySnap = null;
  const applyImageOpacityLive = (val) => {
    const v = Math.max(0, Math.min(1, val));
    state.update((s2) => {
      const o = selectedImage(s2);
      if (o) o.opacity = v;
    });
  };
  imgOpacityRange.addEventListener("pointerdown", () => { _imgOpacitySnap = snapBefore(); });
  imgOpacityRange.addEventListener("input", () => {
    imgOpacityOut.textContent = `${Math.round(Number(imgOpacityRange.value) * 100)}%`;
    applyImageOpacityLive(Number(imgOpacityRange.value));
  });
  imgOpacityRange.addEventListener("change", () => {
    if (_imgOpacitySnap) { pushSnap(_imgOpacitySnap); _imgOpacitySnap = null; }
  });

  imgAspectCb.addEventListener("change", () => {
    const val = imgAspectCb.checked;
    if (state.get().imageEditSession) {
      state.update((s2) => {
        if (s2.imageEditSession) s2.imageEditSession.aspectLocked = val;
      });
      return;
    }
    mutateImage((s2, o) => { if (o.aspectLocked === val) return false; o.aspectLocked = val; return true; });
  });
  imgLockCb.addEventListener("change", () => {
    const val = imgLockCb.checked;
    mutateImage((s2, o) => {
      if (o.locked === val) return false;
      o.locked = val;
      if (val && o.mode === "background") {
        s2.selectedIds = (s2.selectedIds || []).filter((sid) => sid !== o.id);
        if (s2.targetedId === o.id) s2.targetedId = null;
      }
      return true;
    });
  });
  imgRemoveBtn.addEventListener("click", () => {
    if (state.get().imageEditSession) {
      cancelImageEditSession();
      return;
    }
    mutateImage((s2, o) => {
      s2.objects = s2.objects.filter((x) => x.id !== o.id);
      s2.selectedIds = [];
      s2.targetedId = null;
      return true;
    });
  });

  return {
    imageSection, imgOpacityRow, imgOpacityRange, imgOpacityOut,
    imgAspectRow, imgAspectCb, imgLockRow, imgLockCb, imgExportNote,
    imgCutoutBlock, imgClearCutBtn, imgRemoveBtn,
  };
}

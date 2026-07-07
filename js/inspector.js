/* ===== INSPECTOR (right panel — shows/edits selected object properties) =====
 * js/inspector.js was split into per-section modules under js/inspector/
 * (v0.42.0). This file is the orchestrator: it creates the shared context,
 * calls each section builder, destructures every handle back into a local
 * const with its ORIGINAL identifier name, mounts the sections in the
 * original DOM order, and keeps setStyleControlsDisabled() + populate() as
 * verbatim original code. */

import { DEFAULT_TEXT_FONT, DEFAULT_TEXT_SIZE_MM, mmToPt } from "./state.js?v=0.54.8";
import { resolveObjectStyle } from "./style-mode.js?v=0.54.8";
import {
  SHAPE_TYPES, LINE_TYPES, CIRCUIT_HEIGHT_ELEMENTS, supportsDash, isColorDragging,
} from "./inspector/widgets.js?v=0.54.8";
import { createInspectorContext } from "./inspector/context.js?v=0.54.8";
import { buildLineSection } from "./inspector/section-line.js?v=0.54.8";
import { buildGroupSection } from "./inspector/section-group.js?v=0.54.8";
import { buildTextSection } from "./inspector/section-text.js?v=0.54.8";
import { buildFillSection } from "./inspector/section-fill.js?v=0.54.8";
import { buildGeometrySection } from "./inspector/section-geometry.js?v=0.54.8";
import { buildProtectSection } from "./inspector/section-protect.js?v=0.54.8";
import { buildImageSection } from "./inspector/section-image.js?v=0.54.8";
import { buildPendulumSection } from "./inspector/section-pendulum.js?v=0.54.8";
import { buildCoordplaneSection } from "./inspector/section-coordplane.js?v=0.54.8";
import { buildFuncgraphSection } from "./inspector/section-funcgraph.js?v=0.54.8";
import { buildArtboardSection } from "./inspector/section-artboard.js?v=0.54.8";
import { buildLayersSection } from "./inspector/section-layers.js?v=0.54.8";
import { buildGlobalImageSection } from "./inspector/section-global-image.js?v=0.54.8";

/* ===== PUBLIC ===== */
export function initInspector(state) {
  const ctx = createInspectorContext(state);
  if (!ctx) return;
  const { emptyEl, contentEl, root, setButtonDisabled } = ctx;

  // Click-to-select-all: focusing any number input selects its value so a typed
  // digit replaces the old value instead of inserting into it.
  contentEl.addEventListener("focusin", (e) => {
    const t = e.target;
    if (t && t.tagName === "INPUT" && t.type === "number") t.select();
  });

  // Wire left-edge resize handle
  const resizeHandle = document.getElementById("inspector-resize");
  const panelRight = document.querySelector(".panel-right");
  if (resizeHandle && panelRight) {
    resizeHandle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = panelRight.offsetWidth;
      function onMove(e2) {
        const newW = Math.min(480, Math.max(200, startW + (startX - e2.clientX)));
        panelRight.style.width = newW + "px";
      }
      function onUp() {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      }
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }

  /* ---- Section builders (js/inspector/section-*.js). Every handle is
   * destructured into a local const with its ORIGINAL identifier name so
   * setStyleControlsDisabled() and populate() below stay verbatim. ---- */
  const {
    sec1, strokeCP, widthRange, widthNum,
    arrowRow, arrowBtn, ARROW_ICONS, MIDDLE_LEFT_ICON, lengthIcon, ARROW_CYCLE, ARROW_LABELS,
    lineModeRow, lineModeBtnEls,
    dimensionLabelRow, dimensionLabelInp, dimensionLabelTypeRow,
    lineLabelRow, lineLabelInp, lineLabelTypeRow, lineLabelShowRow, lineLabelShowCb,
    lineLabelFlipRow, lineLabelSizeRow,
    dashRow, _dashBtnEls, partialDashBtn, dashSliders, dashLenSlider, dashGapSlider,
    partialControls, ratioRange, ratioNum, flipBtn,
    closeRow, closeCb, roundRow, roundCb, radiusRow, radiusInp,
    angleRow, angleInp, syncDashControls,
  } = buildLineSection(ctx);
  const { groupDiv, groupBtnDiv } = buildGroupSection(ctx);
  const { secText, fontFamSel, fontSizeNum, italicCb } = buildTextSection(ctx);
  const { sec2, fnCb, fillCP, syncFillStyle, _fillStyleBtnEls } = buildFillSection(ctx);
  const {
    sec3, xF, yF, wF, hF, rotF, xyPair, whPair, lockAspectRow, lockAspectCb,
    radF, saF, swF, arcPair,
    labelRow, labelInp, objectLabelTypeRow, arcLabelEditRow, arcLabelEditBtn,
    showLabelRow, showLabelCb, labelPosRow, labelPosSel,
    labelerLenRow, labelerLenInp, labelerAngleRow, labelerAngleInp,
    boxLabelRow, boxLabelInp, boxLabelTypeRow, boxLabelPosRow, boxLabelPosSel, boxLabelSizeRow,
    gapRow, gapInp, circuitHeightF,
    axisVarRow, axisVarBtns, axisLabelXRow, axisLabelYRow, axisLabelTypeRow, tickRow, tickInp,
    centerLineRow, centerLineSel, term1, term2, terminalLabelTypeRow,
    raSizeF, raAngleF, raDirRow, raDirSel,
    appLengthF, appAngleF, appThicknessF, appNeedleF,
    pulleyVariantRow, pulleyVariantSel, clampFlipRow, clampFlipCb, scaleTextRow, scaleTextInp,
  } = buildGeometrySection(ctx);
  const { sec4, lockCb, positionLockCb } = buildProtectSection(ctx);
  const {
    imageSection, imgOpacityRow, imgOpacityRange, imgOpacityOut,
    imgAspectRow, imgAspectCb, imgLockRow, imgLockCb, imgExportNote,
    imgCutoutBlock, imgClearCutBtn, imgRemoveBtn,
  } = buildImageSection(ctx);
  const { secPend, pendCenterCb, pendSymCb, pendLenCb, pendLabelRow, pendLabelInp } = buildPendulumSection(ctx);
  const { secCoord, syncCoordplane } = buildCoordplaneSection(ctx);
  const { secFunc, syncFuncgraph } = buildFuncgraphSection(ctx);
  const { abSection, refreshArtboard } = buildArtboardSection(ctx);
  const { layerDetails, renderLayerPanel } = buildLayersSection(ctx);
  const { bgSection, renderBgSection } = buildGlobalImageSection(ctx);

  /* ---- Mount (replicates the original inline mounting: appendChild order
   * groupDiv → groupBtnDiv → sec1 → secText → sec2 → sec3 → sec4, then
   * imageSection inserted before sec3, then secPend; abSection + layerDetails
   * appended to the inspector root and bgSection pinned at its top). ---- */
  contentEl.appendChild(groupDiv);
  contentEl.appendChild(groupBtnDiv);
  contentEl.appendChild(sec1);
  contentEl.appendChild(secText);
  contentEl.appendChild(sec2);
  contentEl.appendChild(sec3);
  contentEl.appendChild(sec4);
  contentEl.insertBefore(imageSection, sec3);
  contentEl.appendChild(secPend);
  contentEl.appendChild(secCoord);
  contentEl.appendChild(secFunc);
  if (root) root.appendChild(abSection);
  if (root) root.appendChild(layerDetails);
  if (root) root.insertBefore(bgSection, root.firstChild);

  function setStyleControlsDisabled(disabled, fillNone = false, locked = false) {
    strokeCP.setDisabled(disabled);
    widthRange.disabled = disabled;
    widthNum.disabled = disabled;
    [
      arrowBtn,
      partialDashBtn,
      flipBtn,
      ...Object.values(lineModeBtnEls),
      ..._dashBtnEls,
      ...Object.values(_fillStyleBtnEls),
    ].forEach((btn) => setButtonDisabled(btn, disabled));
    dashLenSlider.range.disabled = disabled;
    dashLenSlider.num.disabled = disabled;
    dashGapSlider.range.disabled = disabled;
    dashGapSlider.num.disabled = disabled;
    ratioRange.disabled = disabled;
    ratioNum.disabled = disabled;
    fillCP.setDisabled(disabled || fillNone);
    fnCb.disabled = disabled;
    fontFamSel.disabled = disabled;
    fontSizeNum.disabled = disabled;
    italicCb.disabled = disabled;
    centerLineSel.disabled = disabled || locked;
  }

  /* ---- Subscribe: populate controls on every state change ---- */
  function populate(s) {
    renderBgSection(s);
    renderLayerPanel(s);
    const ids = s.selectedIds || [];
    const selectedObjects = ids.map((id) => s.objects.find((o) => o.id === id)).filter(Boolean);

    if (s.imageEditSession) {
      emptyEl.style.display = "none";
      contentEl.style.display = "";
      abSection.style.display = "none";
      groupDiv.style.display = "none";
      sec1.style.display = "none";
      sec2.style.display = "none";
      sec3.style.display = "none";
      sec4.style.display = "none";
      secText.style.display = "none";
      imageSection.style.display = "none";
      imageSection.open = true;
      imgOpacityRow.style.display = "none";
      imgAspectRow.style.display = "";
      imgAspectCb.checked = s.imageEditSession.aspectLocked !== false;
      imgLockRow.style.display = "none";
      imgExportNote.style.display = "none";
      imgCutoutBlock.style.display = "";
      imgClearCutBtn.style.display = (s.imageEditSession.cutouts || []).length ? "" : "none";
      queueMicrotask(() => { imgRemoveBtn.textContent = "이미지 삭제"; });
      imgRemoveBtn.textContent = "이미지 편집 취소";
      return;
    }

    if (ids.length === 0) {
      emptyEl.style.display = "";
      contentEl.style.display = "none";
      abSection.style.display = "";   // 아트보드 section lives in the empty state
      refreshArtboard(s);
      return;
    }

    emptyEl.style.display = "none";
    contentEl.style.display = "";
    abSection.style.display = "none"; // hidden whenever something is selected
    groupBtnDiv.style.display = "none"; // shown only for an ungrouped multi-selection
    secText.style.display = "none"; // shown only for a single text object (set below)
    imageSection.style.display = "none";
    secPend.style.display = "none"; // shown only for a single pendulum (set below)
    secCoord.style.display = "none"; // shown only for a single coordplane (set below)
    secFunc.style.display = "none"; // shown only for a single funcgraph (set below)
    // Group-3 upright-label rows: shown only for a single rect/ellipse (box) or
    // line (set in the single-selection branch); hidden in every other case.
    boxLabelRow.style.display = "none";
    boxLabelTypeRow.row.style.display = "none";
    boxLabelPosRow.style.display = "none";
    boxLabelSizeRow.row.style.display = "none";
    lineLabelRow.style.display = "none";
    lineLabelTypeRow.row.style.display = "none";
    lineLabelShowRow.style.display = "none";
    lineLabelFlipRow.style.display = "none";
    lineLabelSizeRow.row.style.display = "none";
    dimensionLabelTypeRow.row.style.display = "none";
    objectLabelTypeRow.row.style.display = "none";
    axisLabelTypeRow.row.style.display = "none";
    terminalLabelTypeRow.row.style.display = "none";
    lockAspectRow.style.display = "none";

    // Targeted state: only show ungroup button, hide everything else
    if (s.targetedId) {
      groupDiv.style.display = "";
      sec1.style.display = "none";
      sec2.style.display = "none";
      sec3.style.display = "none";
      sec4.style.display = "none";
      arrowRow.style.display = "none";
      dashRow.style.display = "none";
      dashSliders.style.display = "none";
      partialControls.style.display = "none";
      closeRow.style.display = "none";
      roundRow.style.display = "none";
      radiusRow.style.display = "none";
      angleRow.style.display = "none";
      return;
    }

    // Whether every selected object is a line-family type (line/polyline/curve).
    const allLineFamily = ids.length > 0 && ids.every((id) => {
      const o = s.objects.find((o) => o.id === id);
      return o && LINE_TYPES.includes(o.type);
    });

    // Determine if all selected objects share the same groupId
    const firstObj = s.objects.find((o) => o.id === ids[0]);
    const allInGroup = !!(firstObj?.groupId) && ids.every(id => {
      const o = s.objects.find((o) => o.id === id);
      return o && o.groupId === firstObj.groupId;
    });

    // Group selected: show stroke/fill + ungroup button, hide 크기·위치 and 보호
    if (allInGroup) {
      groupDiv.style.display = "";
      sec1.style.display = "";
      sec2.style.display = allLineFamily ? "none" : ""; // no fill for line family
      sec3.style.display = ""; // group: show combined bbox center + shared rotation
      sec4.style.display = "none";
      arrowRow.style.display = "none";
      dashRow.style.display = "none";
      dashSliders.style.display = "none";
      partialControls.style.display = "none";
      closeRow.style.display = "none";
      roundRow.style.display = "none";
      radiusRow.style.display = "none";
      angleRow.style.display = "none";
      // A group always uses the box rows (W/H + rotation); never the arc rows,
      // even if the prior single selection was an anglearc.
      whPair.style.display  = "flex";
      rotF.el.style.display = "";
      radF.el.style.display = "none";
      arcPair.style.display = "none";
      // Per-object symbol rows never apply to a group; keep them hidden.
      labelRow.style.display = "none";
      showLabelRow.style.display = "none";
      gapRow.style.display = "none";
      term1.el.style.display = "none";
      term2.el.style.display = "none";
      axisVarRow.style.display = "none";
      axisLabelXRow.row.style.display = "none";
      axisLabelYRow.row.style.display = "none";
      tickRow.style.display = "none";
      raSizeF.el.style.display = "none";
      raAngleF.el.style.display = "none";
      raDirRow.style.display = "none";
      appLengthF.el.style.display = "none";
      appAngleF.el.style.display = "none";
      appThicknessF.el.style.display = "none";
      appNeedleF.el.style.display = "none";
      pulleyVariantRow.style.display = "none";
      clampFlipRow.style.display = "none";
      scaleTextRow.style.display = "none";

      const groupHasLocked = ids.some((id) => s.objects.find((o) => o.id === id)?.locked);
      const groupHasPositionLocked = ids.some((id) => s.objects.find((o) => o.id === id)?.positionLocked);
      const groupStyleDisabled = false; // style mode removed — never disabled by mode
      xF.inp.disabled = groupHasLocked || groupHasPositionLocked;
      yF.inp.disabled = groupHasLocked || groupHasPositionLocked;
      wF.inp.disabled = groupHasLocked;
      hF.inp.disabled = groupHasLocked;
      rotF.inp.disabled = groupHasLocked;

      if (isColorDragging()) return;

      const firstStyleObj = resolveObjectStyle(firstObj);
      strokeCP.setValue(firstStyleObj.strokeLevel ?? 0);
      const _sw = firstStyleObj.strokeWidth ?? 0.2;
      widthRange.value = _sw;
      widthNum.value =_sw.toFixed(1);

      const _fn = !!(firstStyleObj.fillNone);
      fnCb.checked = _fn;
      fillCP.setValue(firstStyleObj.fillLevel ?? 255);
      syncFillStyle(firstStyleObj);
      setStyleControlsDisabled(groupStyleDisabled, _fn, groupHasLocked);

      // Section 3 — combined bbox center (X/Y), combined size (W/H), shared rotation.
      let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
      const gRots = [];
      ids.forEach((id) => {
        const o = s.objects.find((o) => o.id === id);
        if (!o) return;
        let bx, by, bw, bh;
        if (o.type === "line") {
          bx = Math.min(o.p1.x, o.p2.x); by = Math.min(o.p1.y, o.p2.y);
          bw = Math.abs(o.p2.x - o.p1.x); bh = Math.abs(o.p2.y - o.p1.y);
        } else if ((o.type === "polyline" || o.type === "curve") && o.points && o.points.length) {
          let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
          o.points.forEach((p) => { if (p.x < a) a = p.x; if (p.y < b) b = p.y; if (p.x > c) c = p.x; if (p.y > d) d = p.y; });
          bx = a; by = b; bw = c - a; bh = d - b;
        } else {
          bx = o.x ?? 0; by = o.y ?? 0; bw = o.w ?? 0; bh = o.h ?? 0;
        }
        if (bx < gMinX) gMinX = bx;
        if (by < gMinY) gMinY = by;
        if (bx + bw > gMaxX) gMaxX = bx + bw;
        if (by + bh > gMaxY) gMaxY = by + bh;
        if (typeof o.rotation === "number") gRots.push(o.rotation);
      });
      if (isFinite(gMinX)) {
        const cx = (gMinX + gMaxX) / 2, cy = (gMinY + gMaxY) / 2;
        xF.inp.value = cx.toFixed(2);
        yF.inp.value = (-cy).toFixed(2); // SVG Y down → math Y up
        wF.inp.value = (gMaxX - gMinX).toFixed(2);
        hF.inp.value = (gMaxY - gMinY).toFixed(2);
      }
      // shared rotation: common value if all equal, else average (0 when none)
      let gSharedRot = 0;
      if (gRots.length) {
        gSharedRot = gRots.every((r) => r === gRots[0])
          ? gRots[0]
          : gRots.reduce((a, b) => a + b, 0) / gRots.length;
      }
      rotF.inp.value = gSharedRot.toFixed(1);
      return;
    }

    groupDiv.style.display = "none";

    if (ids.length > 1) {
      // Multi-selection (no shared group): stroke/fill sections + 묶기 button
      groupBtnDiv.style.display = ""; // ids>1 && !allInGroup (allInGroup returned above)
      sec1.style.display = "";
      sec2.style.display = allLineFamily ? "none" : ""; // no fill for line family
      sec3.style.display = "none";
      sec4.style.display = "none";
      arrowRow.style.display = "none";
      dashRow.style.display = "none";
      dashSliders.style.display = "none";
      partialControls.style.display = "none";
      closeRow.style.display = "none";
      roundRow.style.display = "none";
      radiusRow.style.display = "none";
      angleRow.style.display = "none";

      if (isColorDragging()) return;

      if (!firstObj) return;

      const multiStyleDisabled = false; // style mode removed — never disabled by mode
      const firstStyleObj = resolveObjectStyle(firstObj);
      strokeCP.setValue(firstStyleObj.strokeLevel ?? 0);
      const sw = firstStyleObj.strokeWidth ?? 0.2;
      widthRange.value = sw;
      widthNum.value =sw.toFixed(1);

      const fn = !!(firstStyleObj.fillNone);
      fnCb.checked = fn;
      fillCP.setValue(firstStyleObj.fillLevel ?? 255);
      syncFillStyle(firstStyleObj);
      setStyleControlsDisabled(multiStyleDisabled, fn, false);
      return;
    }

    // Single selection: full controls
    const obj = s.objects.find((o) => o.id === ids[0]);
    if (!obj) {
      emptyEl.style.display = "";
      contentEl.style.display = "none";
      return;
    }

    if (isColorDragging()) return; // skip during color picker drag to avoid handle jump

    const styleObj = resolveObjectStyle(obj);
    const styleDisabled = false; // style mode removed — never disabled by mode
    // Formula shares the text font controls (family + size apply to its glyphs).
    const isText = obj.type === "text" || obj.type === "formula";
    // Images have neither stroke/fill nor a 글꼴 section; they get their own 이미지
    // section (opacity/비율 고정/잠금/제거) instead.
    const isImage = obj.type === "image";
    // Text/image have no stroke/fill controls; text gets 글꼴, image gets 이미지.
    sec1.style.display = (isText || isImage) ? "none" : "";
    secText.style.display = isText ? "" : "none";
    imageSection.style.display = "none";
    if (isImage) {
      imageSection.open = true;
      const isBg = obj.mode === "background";
      imgOpacityRow.style.display = isBg ? "" : "none";
      imgLockRow.style.display = "";
      if (document.activeElement !== imgOpacityRange) {
        imgOpacityRange.value = obj.opacity ?? 1;
        imgOpacityOut.textContent = `${Math.round((obj.opacity ?? 1) * 100)}%`;
      }
      // 비율 고정 is meaningful for edit-mode resize; hide it for background images
      // (locked, not freely resized).
      imgAspectRow.style.display = isBg ? "none" : "";
      imgAspectCb.checked = obj.aspectLocked !== false;
      imgLockCb.checked = !!obj.locked;
      imgExportNote.style.display = (obj.exportable === false) ? "" : "none";
      queueMicrotask(() => { imgRemoveBtn.textContent = isBg ? "배경 이미지 제거" : "이미지 제거"; });
      imgRemoveBtn.textContent = isBg ? "배경 이미지 제거" : "이미지 제거";
      // Cutout editing: edit-mode images only (never background). "지운 영역 초기화"
      // appears only when the image actually has one or more cutouts.
      imgCutoutBlock.style.display = "none";
      imgClearCutBtn.style.display = "none";
    }
    if (isText) {
      fontFamSel.value = styleObj.fontFamily || DEFAULT_TEXT_FONT;
      italicCb.checked = styleObj.italic === true;
      if (document.activeElement !== fontSizeNum) {
        // Stored fontSize is world-unit mm; the field shows points.
        fontSizeNum.value = Math.round(mmToPt(styleObj.fontSize ?? 0) * 10) / 10;
      }
    }
    const isLineFamily = LINE_TYPES.includes(obj.type);

    // 채우기 섹션 표시 규칙: rect/ellipse/triangle + 닫힌 polyline + 닫힌 curve만 노출.
    const isClosedPoly  = obj.type === "polyline" && obj.closed === true;
    const isClosedCurve = obj.type === "curve"    && obj.closed === true;
    const showFill = SHAPE_TYPES.includes(obj.type) || isClosedPoly || isClosedCurve;
    sec2.style.display = showFill ? "" : "none";

    // 닫기 토글: polyline 또는 curve 선택 시 노출(열림/닫힘 모두).
    const isPolyline = obj.type === "polyline";
    const isCurve    = obj.type === "curve";
    const showClose  = isPolyline || isCurve;
    closeRow.style.display = showClose ? "" : "none";
    if (showClose) closeCb.checked = obj.closed === true;

    // 경사면처리 + 곡률 반경: single polyline only (open or closed).
    roundRow.style.display = isPolyline ? "" : "none";
    radiusRow.style.display = isPolyline ? "" : "none";
    if (isPolyline) {
      const isRounded = obj.rounded === true;
      roundCb.checked = isRounded;
      radiusInp.disabled = !isRounded;
      radiusRow.style.opacity = isRounded ? "" : "0.5";
      if (document.activeElement !== radiusInp) radiusInp.value = obj.cornerRadius ?? 10;
    }

    // 각도: straight line only. Skip while the field is focused so typing isn't clobbered.
    const isStraightLine = obj.type === "line";
    angleRow.style.display = isStraightLine ? "" : "none";
    if (isStraightLine && document.activeElement !== angleInp) {
      const ang = Math.atan2(obj.p2.y - obj.p1.y, obj.p2.x - obj.p1.x) * 180 / Math.PI;
      angleInp.value = ang.toFixed(1);
    }

    lineModeRow.style.display = isStraightLine ? "" : "none";
    let lineMode = obj.lineMode ?? obj.lineStyle
      ?? (obj.arrowHead === "center" ? "middleArrow" : (obj.arrowHead ?? "none") === "none" ? "solid" : "arrow");
    if (lineMode === "dimensionArrow") lineMode = "lengthArrow";
    if (!lineModeBtnEls[lineMode]) lineMode = "solid";
    Object.entries(lineModeBtnEls).forEach(([value, btn]) => {
      const active = value === lineMode;
      btn.style.background = active ? "#4a9eff" : "#1e1f22";
      btn.style.borderColor = active ? "#4a9eff" : "#3a3c41";
    });
    const arrowIcon = ({ right: ARROW_ICONS.end, left: ARROW_ICONS.start, both: ARROW_ICONS.both })[obj.arrowVariant]
      || ({ end: ARROW_ICONS.end, start: ARROW_ICONS.start, both: ARROW_ICONS.both })[obj.arrowHead]
      || ARROW_ICONS.end;
    lineModeBtnEls.arrow.innerHTML = `<svg width="40" height="24" viewBox="0 0 40 24">${arrowIcon}</svg>`;
    lineModeBtnEls.middleArrow.innerHTML = `<svg width="40" height="24" viewBox="0 0 40 24">${obj.arrowVariant === "left" ? MIDDLE_LEFT_ICON : ARROW_ICONS.center}</svg>`;
    lineModeBtnEls.lengthArrow.innerHTML = `<svg width="40" height="24" viewBox="0 0 40 24">${lengthIcon(obj.dimensionVariant || "basic")}</svg>`;
    dimensionLabelRow.style.display = isStraightLine && lineMode === "lengthArrow" ? "" : "none";
    dimensionLabelTypeRow.row.style.display = isStraightLine && lineMode === "lengthArrow" ? "" : "none";
    if (document.activeElement !== dimensionLabelInp) dimensionLabelInp.value = obj.dimensionLabel ?? "d";
    if (isStraightLine && lineMode === "lengthArrow") dimensionLabelTypeRow.sync(obj);

    // Group-3 straight-line upright label: text + on/off toggle + 반전 + 크기.
    // Hidden entirely in length-display (lengthArrow) mode — the dimension label
    // along the line is shown instead, so the external label is redundant (task 3).
    const showLineLabel = isStraightLine && lineMode !== "lengthArrow";
    lineLabelRow.style.display = showLineLabel ? "" : "none";
    lineLabelTypeRow.row.style.display = showLineLabel ? "" : "none";
    lineLabelShowRow.style.display = showLineLabel ? "" : "none";
    lineLabelFlipRow.style.display = showLineLabel ? "" : "none";
    lineLabelSizeRow.row.style.display = showLineLabel ? "" : "none";
    if (showLineLabel) {
      if (document.activeElement !== lineLabelInp) lineLabelInp.value = obj.label ?? "";
      lineLabelTypeRow.sync(obj);
      lineLabelShowCb.checked = obj.labelShow === true;
      if (document.activeElement !== lineLabelSizeRow.num) {
        lineLabelSizeRow.num.value = Math.round(mmToPt(obj.labelSize || DEFAULT_TEXT_SIZE_MM));
      }
    }

    // Arrow head: open line + open polyline (closed polyline = filled shape, no arrow).
    const showArrow = obj.type === "polyline" && !isClosedPoly;
    arrowRow.style.display = showArrow ? "" : "none";
    if (showArrow) {
      const ah = obj.arrowHead ?? "none";
      const displayArrow = ARROW_CYCLE.includes(ah) ? ah : "none";
      arrowBtn.title = ARROW_LABELS[displayArrow];
      arrowBtn.setAttribute("aria-label", `화살표 방향: ${ARROW_LABELS[displayArrow]}`);
      arrowBtn.innerHTML = `<svg width="40" height="24" viewBox="0 0 40 24">${ARROW_ICONS[displayArrow]}</svg>`;
    }

    // Dash presets + sliders: lines and size-based shape outlines.
    const canDash = supportsDash(obj);
    dashRow.style.display = canDash ? "" : "none";
    if (canDash) {
      syncDashControls(styleObj);
    } else {
      dashSliders.style.display = "none";
      partialControls.style.display = "none";
    }

    // Section 1
    strokeCP.setValue(styleObj.strokeLevel ?? 0);
    const sw = styleObj.strokeWidth ?? 0.2;
    widthRange.value = sw;
    widthNum.value =sw.toFixed(1);

    // Section 2
    const fn = !!(styleObj.fillNone);
    fnCb.checked = fn;
    fillCP.setValue(styleObj.fillLevel ?? 255);
    syncFillStyle(styleObj);

    // Section 3 — shape types + axes (size-based: X/Y/W/H/rotation), plus the
    // anglearc (X/Y + radius/startAngle/sweepAngle in math convention, CCW +).
    // Optics is a branch-A box (X/Y/W/H/rotation), like rect + axes.
    const isOptics = obj.type === "optics";
    const isApparatus = obj.type === "apparatus";
    const appKind = isApparatus ? (obj.kind || "wire") : null;
    const isSvgAsset = obj.type === "svgAsset";
    const isShape = SHAPE_TYPES.includes(obj.type) || obj.type === "axes" || isOptics || isApparatus || isSvgAsset;
    const isArc = obj.type === "anglearc";
    const isRightAngle = obj.type === "rightangle";
    const isCircuit = obj.type === "circuit";
    const isLabeler = obj.type === "labeler";
    // Circuit element variants: capacitor adds 간격; diode swaps the single 라벨 for
    // two terminal labels. Everything else uses the single 라벨 row.
    const circElem = isCircuit ? obj.element : null;
    const isCap = circElem === "capacitor";
    const isDiode = circElem === "diode";
    const hasCircuitHeight = isCircuit && CIRCUIT_HEIGHT_ELEMENTS.has(circElem);
    const isAxes = obj.type === "axes";
    const axisVariant = isAxes ? (obj.axisVariant || "cross") : null;
    sec3.style.display = (isShape || isImage || isArc || isRightAngle || isCircuit || isLabeler) ? "" : "none";
    // Toggle which rows belong to this selection: arc swaps W/H + rotation for
    // radius + start/sweep angle; circuit (two terminals) hides the box rows.
    xyPair.style.display  = (isCircuit || isLabeler) ? "none" : "flex";
    whPair.style.display  = (isArc || isRightAngle || isCircuit || isLabeler) ? "none" : "flex";
    lockAspectRow.style.display = isSvgAsset ? "flex" : "none";
    rotF.el.style.display = (isArc || isRightAngle || isCircuit || isLabeler) ? "none" : "";
    radF.el.style.display = isArc ? "" : "none";
    arcPair.style.display = isArc ? "flex" : "none";
    raSizeF.el.style.display = isRightAngle ? "" : "none";
    raAngleF.el.style.display = isRightAngle ? "" : "none";
    raDirRow.style.display = isRightAngle ? "" : "none";
    appLengthF.el.style.display = isApparatus && appKind === "wire" ? "" : "none";
    appAngleF.el.style.display = isApparatus && appKind === "wire" ? "" : "none";
    appThicknessF.el.style.display = isApparatus && appKind === "wire" ? "" : "none";
    appNeedleF.el.style.display = isApparatus && appKind === "compass" ? "" : "none";
    pulleyVariantRow.style.display = isApparatus && appKind === "pulley" ? "" : "none";
    clampFlipRow.style.display = isApparatus && appKind === "clamp" ? "" : "none";
    scaleTextRow.style.display = isApparatus && appKind === "scale" ? "" : "none";
    // Single 라벨 row: arc, optics, and all circuits EXCEPT diode (which uses 단자1/2).
    const isNode = isOptics && obj.kind === "node";
    const showObjectLabel = isArc || isOptics || (isCircuit && !isDiode);
    labelRow.style.display = showObjectLabel ? "" : "none";
    objectLabelTypeRow.row.style.display = showObjectLabel ? "" : "none";
    // node uses a label-position dropdown instead of the show/hide toggle.
    showLabelRow.style.display = (isOptics && !isNode) ? "" : "none";
    labelPosRow.style.display = isNode ? "" : "none";
    labelerLenRow.style.display = isLabeler ? "" : "none";
    labelerAngleRow.style.display = isLabeler ? "" : "none";
    if (isLabeler) {
      if (document.activeElement !== labelerLenInp) {
        const len = Math.hypot(obj.p2.x - obj.p1.x, obj.p2.y - obj.p1.y);
        labelerLenInp.value = len.toFixed(2);
      }
      if (document.activeElement !== labelerAngleInp) {
        const ang = Math.atan2(obj.p2.y - obj.p1.y, obj.p2.x - obj.p1.x) * 180 / Math.PI;
        labelerAngleInp.value = ang.toFixed(1);
      }
    }
    arcLabelEditRow.style.display = isArc ? "" : "none";

    // 진자 section: pendulum-only display toggles + length label. The label input is
    // shown/enabled only while 길이표시 is on (mirrors the dimension-label pattern).
    const isPendulum = obj.type === "pendulum";
    secPend.style.display = isPendulum ? "" : "none";
    if (isPendulum) {
      pendCenterCb.cb.checked = obj.showCenterGhost !== false;
      pendSymCb.cb.checked = obj.showSymmetricGhost !== false;
      pendLenCb.cb.checked = obj.showLengthLabel !== false;
      const lenOn = obj.showLengthLabel !== false;
      pendLabelRow.style.display = lenOn ? "" : "none";
      if (document.activeElement !== pendLabelInp) pendLabelInp.value = obj.lengthLabel ?? "";
      pendCenterCb.cb.disabled = !!obj.locked;
      pendSymCb.cb.disabled = !!obj.locked;
      pendLenCb.cb.disabled = !!obj.locked;
      pendLabelInp.disabled = !!obj.locked;
    }

    // 좌표평면 section: range/grid/tick/number-label/axis-name/export options.
    const isCoordplane = obj.type === "coordplane";
    secCoord.style.display = isCoordplane ? "" : "none";
    if (isCoordplane) syncCoordplane(obj);

    // 함수 그래프 section: formula / domain / 곡선으로 변환.
    const isFuncgraph = obj.type === "funcgraph";
    secFunc.style.display = isFuncgraph ? "" : "none";
    if (isFuncgraph) syncFuncgraph(obj);

    // Group-3 box upright label: rect/ellipse only (text + center/above/below).
    const isBoxLabelType = obj.type === "rect" || obj.type === "ellipse";
    boxLabelRow.style.display = isBoxLabelType ? "" : "none";
    boxLabelTypeRow.row.style.display = isBoxLabelType ? "" : "none";
    boxLabelPosRow.style.display = isBoxLabelType ? "" : "none";
    boxLabelSizeRow.row.style.display = isBoxLabelType ? "" : "none";
    if (isBoxLabelType) {
      if (document.activeElement !== boxLabelInp) boxLabelInp.value = obj.label ?? "";
      boxLabelTypeRow.sync(obj);
      boxLabelPosSel.value = ["center", "above", "below", "left", "right"].includes(obj.labelPos) ? obj.labelPos : "center";
      if (document.activeElement !== boxLabelSizeRow.num) {
        boxLabelSizeRow.num.value = Math.round(mmToPt(obj.labelSize || DEFAULT_TEXT_SIZE_MM));
      }
    }
    gapRow.style.display = isCap ? "" : "none";
    circuitHeightF.el.style.display = hasCircuitHeight ? "" : "none";
    term1.el.style.display = isDiode ? "" : "none";
    term2.el.style.display = isDiode ? "" : "none";
    terminalLabelTypeRow.row.style.display = isDiode ? "" : "none";
    // axes-only rows. single variant ignores labelY → hide that one row.
    axisVarRow.style.display = isAxes ? "" : "none";
    axisLabelXRow.row.style.display = isAxes ? "" : "none";
    axisLabelYRow.row.style.display = (isAxes && axisVariant !== "single") ? "" : "none";
    axisLabelTypeRow.row.style.display = isAxes ? "" : "none";
    tickRow.style.display = isAxes ? "" : "none";
    // lens-only center dashed-line row.
    const isLens = isOptics && (obj.kind === "convex_lens" || obj.kind === "concave_lens");
    centerLineRow.style.display = isLens ? "" : "none";
    if (isShape || isImage) {
      xF.inp.value   = (obj.x        ?? 0).toFixed(2);
      yF.inp.value   = (-(obj.y      ?? 0)).toFixed(2); // SVG Y down → math Y up
      wF.inp.value   = (obj.w        ?? 0).toFixed(2);
      hF.inp.value   = (obj.h        ?? 0).toFixed(2);
      rotF.inp.value = (obj.rotation ?? 0).toFixed(1);
    }
    if (isSvgAsset) lockAspectCb.checked = obj.lockAspect !== false;
    if (isArc) {
      xF.inp.value    = (obj.x          ?? 0).toFixed(2);
      yF.inp.value    = (-(obj.y        ?? 0)).toFixed(2); // SVG Y down → math Y up
      radF.inp.value  = (obj.radius     ?? 0).toFixed(2);
      saF.inp.value   = (obj.startAngle ?? 0).toFixed(1);
      swF.inp.value   = (obj.sweepAngle ?? 0).toFixed(1);
      labelInp.value  = obj.label ?? "";
    }
    if (isRightAngle) {
      xF.inp.value = (obj.x ?? 0).toFixed(2);
      yF.inp.value = (-(obj.y ?? 0)).toFixed(2);
      raSizeF.inp.value = (obj.size ?? 0).toFixed(2);
      raAngleF.inp.value = (obj.angle ?? 0).toFixed(1);
      raDirSel.value = String((obj.orientation ?? 1) >= 0 ? 1 : -1);
    }
    if (isApparatus) {
      if (appKind === "wire") {
        if (document.activeElement !== appLengthF.inp) appLengthF.inp.value = (obj.length ?? obj.w ?? 0).toFixed(2);
        if (document.activeElement !== appAngleF.inp) appAngleF.inp.value = (obj.angle ?? 0).toFixed(1);
        if (document.activeElement !== appThicknessF.inp) appThicknessF.inp.value = (obj.thickness ?? obj.gap ?? 1.8).toFixed(2);
      }
      if (appKind === "compass" && document.activeElement !== appNeedleF.inp) appNeedleF.inp.value = (obj.needleAngle ?? -90).toFixed(1);
      if (appKind === "pulley") pulleyVariantSel.value = obj.variant || "basic";
      if (appKind === "clamp") clampFlipCb.checked = !!obj.flipped;
      if (appKind === "scale" && document.activeElement !== scaleTextInp) scaleTextInp.value = obj.displayText ?? "0.99 N";
    }
    if ((isCircuit && !isDiode || isOptics) && document.activeElement !== labelInp) {
      labelInp.value  = obj.label ?? "";
    }
    if (showObjectLabel) objectLabelTypeRow.sync(obj);
    if (isOptics) showLabelCb.checked = !!obj.showLabel;
    if (isNode) labelPosSel.value = (obj.labelPos === "below") ? "below" : "above";
    if (isLens) centerLineSel.value = styleObj.centerLine || "none";
    if (isCap && document.activeElement !== gapInp) {
      gapInp.value = (obj.gap ?? 2).toFixed(1);
    }
    if (hasCircuitHeight && document.activeElement !== circuitHeightF.inp) {
      const defaultHeight = (circElem === "voltmeter" || circElem === "ammeter") ? 5.12 : 3.2;
      circuitHeightF.inp.value = String(obj.height ?? defaultHeight);
    }
    if (isDiode) {
      const tl = Array.isArray(obj.terminalLabels) ? obj.terminalLabels : ["", ""];
      if (document.activeElement !== term1.inp) term1.inp.value = tl[0] ?? "";
      if (document.activeElement !== term2.inp) term2.inp.value = tl[1] ?? "";
      terminalLabelTypeRow.sync(obj);
    }
    if (isAxes) {
      Object.entries(axisVarBtns).forEach(([id, btn]) => {
        const active = id === axisVariant;
        btn.style.background = active ? "#4a9eff" : "#1e1f22";
        btn.style.borderColor = active ? "#4a9eff" : "#3a3c41";
      });
      if (document.activeElement !== axisLabelXRow.inp) axisLabelXRow.inp.value = obj.labelX ?? "";
      if (document.activeElement !== axisLabelYRow.inp) axisLabelYRow.inp.value = obj.labelY ?? "";
      axisLabelTypeRow.sync(obj);
      if (document.activeElement !== tickInp) tickInp.value = (obj.tickSpacing ?? 5).toString();
    }

    // Section 4
    sec4.style.display = "";
    lockCb.checked = !!(obj.locked);
    positionLockCb.checked = !!(obj.positionLocked);
    positionLockCb.disabled = !!(obj.locked);
    xF.inp.disabled = !!(obj.locked || obj.positionLocked);
    yF.inp.disabled = !!(obj.locked || obj.positionLocked);
    wF.inp.disabled = !!obj.locked;
    hF.inp.disabled = !!obj.locked;
    lockAspectCb.disabled = !!obj.locked;
    rotF.inp.disabled = !!obj.locked;
    radF.inp.disabled = !!obj.locked;
    saF.inp.disabled = !!obj.locked;
    swF.inp.disabled = !!obj.locked;
    labelInp.disabled = !!obj.locked;
    arcLabelEditBtn.disabled = !!obj.locked;
    labelerLenInp.disabled = !!obj.locked;
    labelerAngleInp.disabled = !!obj.locked;
    showLabelCb.disabled = !!obj.locked;
    labelPosSel.disabled = !!obj.locked;
    boxLabelInp.disabled = !!obj.locked;
    boxLabelTypeRow.sel.disabled = !!obj.locked;
    boxLabelPosSel.disabled = !!obj.locked;
    lineLabelInp.disabled = !!obj.locked;
    lineLabelTypeRow.sel.disabled = !!obj.locked;
    lineLabelShowCb.disabled = !!obj.locked;
    dimensionLabelInp.disabled = !!obj.locked;
    dimensionLabelTypeRow.sel.disabled = !!obj.locked;
    objectLabelTypeRow.sel.disabled = !!obj.locked;
    terminalLabelTypeRow.sel.disabled = !!obj.locked;
    axisLabelTypeRow.sel.disabled = !!obj.locked;
    gapInp.disabled = !!obj.locked;
    circuitHeightF.inp.disabled = !!obj.locked;
    term1.inp.disabled = !!obj.locked;
    term2.inp.disabled = !!obj.locked;
    axisLabelXRow.inp.disabled = !!obj.locked;
    axisLabelYRow.inp.disabled = !!obj.locked;
    tickInp.disabled = !!obj.locked;
    centerLineSel.disabled = !!obj.locked;
    raSizeF.inp.disabled = !!obj.locked;
    raAngleF.inp.disabled = !!obj.locked;
    raDirSel.disabled = !!obj.locked;
    appLengthF.inp.disabled = !!obj.locked;
    appAngleF.inp.disabled = !!obj.locked;
    appThicknessF.inp.disabled = !!obj.locked;
    appNeedleF.inp.disabled = !!obj.locked;
    pulleyVariantSel.disabled = !!obj.locked;
    clampFlipCb.disabled = !!obj.locked;
    scaleTextInp.disabled = !!obj.locked;
    Object.values(axisVarBtns).forEach((btn) => { btn.disabled = !!obj.locked; });
    setStyleControlsDisabled(styleDisabled, fn, !!obj.locked);
  }

  state.subscribe(populate);
  populate(state.get());
}

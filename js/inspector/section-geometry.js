/* ===== INSPECTOR SECTION — 크기·위치 (geometry + per-type rows) =====
 * Extracted verbatim from initInspector() in js/inspector.js (v0.44.0
 * split). Builds the section DOM and wires its events; mounting into the
 * inspector panel happens in js/inspector.js (the orchestrator). */

import { openAngleArcLabelEditor } from "../tools.js?v=0.50.5";
import { makeSection } from "./widgets.js?v=0.50.5";

export function buildGeometrySection(ctx) {
  const { state, makeLabelSizeRow, makeLabelTypeRow, commitSelectedObject } = ctx;

  /* ---- Section 3: 크기·위치 (shapes only, single selection only) ---- */
  const sec3Body = document.createElement("div");
  sec3Body.className = "insp-body";
  sec3Body.style.padding = "6px 6px"; // narrower than default for a compact section

  // negate=true → inspector shows/accepts math convention (Y up) while the stored
  // value stays in SVG convention (Y down). Display = -internal, internal = -input.
  function makePosRow(label, prop, step, negate = false) {
    const row = document.createElement("div");
    row.className = "insp-row";
    const lbl = document.createElement("label");
    lbl.className = "insp-field-label";
    lbl.textContent = label;
    const inp = document.createElement("input");
    inp.type = "number";
    inp.step = step;
    inp.className = "insp-input";

    function commit() {
      const val = parseFloat(inp.value);
      if (!isFinite(val)) return;
      const s = state.get();
      const ids = s.selectedIds || [];
      if (!ids.length) return;
      const snap = JSON.parse(JSON.stringify(s.objects));
      state.update((s2) => {
        const id = (s2.selectedIds || [])[0];
        const o = s2.objects.find((o) => o.id === id);
        if (!o) return;
        if (o.locked || (o.positionLocked && (prop === "x" || prop === "y"))) return;
        const next = negate ? -val : val;
        if (o.positionLocked && prop === "w") o.x -= (next - o.w) / 2;
        if (o.positionLocked && prop === "h") o.y -= (next - o.h) / 2;
        s2.undoStack.push(snap);
        s2.redoStack = [];
        o[prop] = next;
        if (o.type === "apparatus" && o.kind === "wire") {
          if (prop === "length") o.w = Math.max(next, 1);
          if (prop === "thickness") {
            o.gap = next;
            o.h = Math.max(next * 3, 3);
          }
        }
      });
    }

    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
    inp.addEventListener("blur", commit);
    row.appendChild(lbl);
    row.appendChild(inp);
    return { el: row, inp };
  }

  const xF   = makePosRow("X",     "x",        "0.1");
  const yF   = makePosRow("Y",     "y",        "0.1", true); // math Y (up = positive)
  const wF   = makePosRow("W",     "w",        "0.1");
  const hF   = makePosRow("H",     "h",        "0.1");
  const rotF = makePosRow("회전 °", "rotation", "1");

  sec3Body.appendChild(rotF.el);

  // X/Y on one row, W/H on the next — compact pairs, left-aligned (not stretched).
  const xyPair = document.createElement("div");
  xyPair.style.cssText = "display:flex;gap:10px;";
  xyPair.appendChild(xF.el);
  xyPair.appendChild(yF.el);
  sec3Body.appendChild(xyPair);

  const whPair = document.createElement("div");
  whPair.style.cssText = "display:flex;gap:10px;";
  whPair.appendChild(wF.el);
  whPair.appendChild(hF.el);
  sec3Body.appendChild(whPair);

  const lockAspectRow = document.createElement("div");
  lockAspectRow.className = "insp-row";
  const lockAspectCb = document.createElement("input");
  lockAspectCb.type = "checkbox";
  lockAspectCb.className = "insp-cb";
  const lockAspectLbl = document.createElement("label");
  lockAspectLbl.className = "insp-field-label";
  lockAspectLbl.textContent = "비율고정";
  lockAspectRow.appendChild(lockAspectCb);
  lockAspectRow.appendChild(lockAspectLbl);
  sec3Body.appendChild(lockAspectRow);
  lockAspectCb.addEventListener("change", () => {
    const s = state.get();
    const id = (s.selectedIds || [])[0];
    if (!id) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    const val = lockAspectCb.checked;
    state.update((s2) => {
      const o = s2.objects.find((item) => item.id === id);
      if (!o || o.type !== "svgAsset" || o.locked) return;
      o.lockAspect = val;
      s2.undoStack.push(snap);
      s2.redoStack = [];
    });
  });

  // anglearc-only rows: radius + start/sweep angle (math convention, CCW +). The
  // arc has no W/H/rotation — these replace those rows for an anglearc selection.
  const radF = makePosRow("반지름", "radius", "0.1");
  const saF  = makePosRow("시작각 °", "startAngle", "1");
  const swF  = makePosRow("사잇각 °", "sweepAngle", "1");
  sec3Body.appendChild(radF.el);
  const arcPair = document.createElement("div");
  arcPair.style.cssText = "display:flex;gap:10px;";
  arcPair.appendChild(saF.el);
  arcPair.appendChild(swF.el);
  sec3Body.appendChild(arcPair);

  // anglearc-only: free-text label (default "θ"). User types verbatim — no
  // auto degree sign. Empty string is kept on the object; render.js draws no
  // label text when it's empty, but the arc itself stays.
  const labelRow = document.createElement("div");
  labelRow.className = "insp-row";
  const labelLbl = document.createElement("label");
  labelLbl.className = "insp-field-label";
  labelLbl.textContent = "라벨";
  const labelInp = document.createElement("input");
  labelInp.type = "text";
  labelInp.className = "insp-input";
  function commitArcLabel() {
    const s = state.get();
    const ids = s.selectedIds || [];
    if (!ids.length) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const id = (s2.selectedIds || [])[0];
      const o = s2.objects.find((o) => o.id === id);
      if (!o || o.locked) return;
      if ((o.label ?? "") === labelInp.value) return; // no-op → no undo entry
      s2.undoStack.push(snap);
      s2.redoStack = [];
      o.label = labelInp.value;
    });
  }
  labelInp.addEventListener("keydown", (e) => { if (e.key === "Enter") labelInp.blur(); });
  labelInp.addEventListener("blur", commitArcLabel);
  labelRow.appendChild(labelLbl);
  labelRow.appendChild(labelInp);
  sec3Body.appendChild(labelRow);
  const objectLabelTypeRow = makeLabelTypeRow((o) => o.type === "anglearc" || o.type === "optics" || o.type === "circuit");
  sec3Body.appendChild(objectLabelTypeRow.row);

  // anglearc-only: 라벨 편집 button. Opens the SAME small text editor the labeler
  // uses (writes obj.label), so θ can be changed to α/β/A/㉠/Ⅰ/m/h and simple
  // formula-like symbols. The inline 라벨 input above still works for quick edits.
  const arcLabelEditRow = document.createElement("div");
  arcLabelEditRow.className = "insp-row";
  const arcLabelEditLbl = document.createElement("label");
  arcLabelEditLbl.className = "insp-field-label";
  arcLabelEditLbl.textContent = "";
  const arcLabelEditBtn = document.createElement("button");
  arcLabelEditBtn.type = "button";
  arcLabelEditBtn.textContent = "라벨 편집...";
  arcLabelEditBtn.title = "각도 라벨/기호 입력기 열기";
  arcLabelEditBtn.style.cssText = "padding:4px 10px;font-size:11px;cursor:pointer;border:1px solid #3a3c41;border-radius:3px;background:#1e1f22;color:#dcddde;";
  arcLabelEditBtn.addEventListener("click", () => {
    const id = (state.get().selectedIds || [])[0];
    if (id) openAngleArcLabelEditor(id);
  });
  arcLabelEditRow.appendChild(arcLabelEditLbl);
  arcLabelEditRow.appendChild(arcLabelEditBtn);
  sec3Body.appendChild(arcLabelEditRow);

  // optics-only: show/hide toggle for the label (like the anglearc label visibility).
  const showLabelRow = document.createElement("div");
  showLabelRow.className = "insp-row";
  const showLabelCb = document.createElement("input");
  showLabelCb.type = "checkbox";
  showLabelCb.className = "insp-cb";
  const showLabelLbl = document.createElement("label");
  showLabelLbl.className = "insp-field-label";
  showLabelLbl.textContent = "라벨 표시";
  showLabelRow.appendChild(showLabelCb);
  showLabelRow.appendChild(showLabelLbl);
  sec3Body.appendChild(showLabelRow);
  showLabelCb.addEventListener("change", () => {
    const s = state.get();
    if (!(s.selectedIds || []).length) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    const val = showLabelCb.checked;
    state.update((s2) => {
      const o = s2.objects.find((o) => o.id === (s2.selectedIds || [])[0]);
      if (!o || o.locked) return;
      s2.undoStack.push(snap); s2.redoStack = [];
      o.showLabel = val;
    });
  });

  // node-only: label side (above/below). The label itself reuses labelRow above.
  const labelPosRow = document.createElement("div");
  labelPosRow.className = "insp-row";
  const labelPosLbl = document.createElement("label");
  labelPosLbl.className = "insp-field-label";
  labelPosLbl.textContent = "라벨 위치";
  const labelPosSel = document.createElement("select");
  labelPosSel.className = "insp-input";
  [["above", "위 (above)"], ["below", "아래 (below)"]].forEach(([val, text]) => {
    const opt = document.createElement("option");
    opt.value = val; opt.textContent = text;
    labelPosSel.appendChild(opt);
  });
  labelPosRow.appendChild(labelPosLbl);
  labelPosRow.appendChild(labelPosSel);
  sec3Body.appendChild(labelPosRow);
  labelPosSel.addEventListener("change", () => {
    const s = state.get();
    if (!(s.selectedIds || []).length) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    const val = labelPosSel.value === "below" ? "below" : "above";
    state.update((s2) => {
      const o = s2.objects.find((o) => o.id === (s2.selectedIds || [])[0]);
      if (!o || o.locked) return;
      s2.undoStack.push(snap); s2.redoStack = [];
      o.labelPos = val;
    });
  });

  // labeler-only geometry (mirrors the straight-line inspector): 길이 + 각도 of the
  // leader line. The labeler stores p1 (leader anchor on the graph) and p2 (label
  // position); 길이 = |p2 − p1|, 각도 = atan2(p2−p1) in the SAME convention as the
  // straight-line 각도 field. Text editing lives in the double-click dialog, NOT here.
  // Editing keeps the anchor p1 fixed and repositions the label p2, preserving the
  // other component — so the leader anchor stays put and labeler geometry is intact.
  const labelerLenRow = document.createElement("div");
  labelerLenRow.className = "insp-row";
  const labelerLenLbl = document.createElement("label");
  labelerLenLbl.className = "insp-field-label";
  labelerLenLbl.textContent = "길이";
  const labelerLenInp = document.createElement("input");
  labelerLenInp.type = "number";
  labelerLenInp.step = "0.1";
  labelerLenInp.min = "0";
  labelerLenInp.className = "insp-input";
  const labelerLenUnit = document.createElement("span");
  labelerLenUnit.className = "insp-unit";
  labelerLenUnit.textContent = "mm";
  labelerLenRow.appendChild(labelerLenLbl);
  labelerLenRow.appendChild(labelerLenInp);
  labelerLenRow.appendChild(labelerLenUnit);
  sec3Body.appendChild(labelerLenRow);

  function commitLabelerLength() {
    const val = parseFloat(labelerLenInp.value);
    if (!isFinite(val) || val < 0) return;
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((it) => it.id === ids[0]);
      if (!o || o.type !== "labeler" || o.locked) return;
      const dx = o.p2.x - o.p1.x, dy = o.p2.y - o.p1.y;
      const cur = Math.hypot(dx, dy);
      const ux = cur > 1e-9 ? dx / cur : 1; // degenerate leader → default horizontal
      const uy = cur > 1e-9 ? dy / cur : 0;
      o.p2 = { x: o.p1.x + ux * val, y: o.p1.y + uy * val };
      s2.undoStack.push(snap);
      s2.redoStack = [];
    });
  }
  labelerLenInp.addEventListener("keydown", (e) => { if (e.key === "Enter") labelerLenInp.blur(); });
  labelerLenInp.addEventListener("blur", commitLabelerLength);

  const labelerAngleRow = document.createElement("div");
  labelerAngleRow.className = "insp-row";
  const labelerAngleLbl = document.createElement("label");
  labelerAngleLbl.className = "insp-field-label";
  labelerAngleLbl.textContent = "각도";
  const labelerAngleInp = document.createElement("input");
  labelerAngleInp.type = "number";
  labelerAngleInp.step = "1";
  labelerAngleInp.className = "insp-input";
  const labelerAngleUnit = document.createElement("span");
  labelerAngleUnit.className = "insp-unit";
  labelerAngleUnit.textContent = "°";
  labelerAngleRow.appendChild(labelerAngleLbl);
  labelerAngleRow.appendChild(labelerAngleInp);
  labelerAngleRow.appendChild(labelerAngleUnit);
  sec3Body.appendChild(labelerAngleRow);

  function commitLabelerAngle() {
    const val = parseFloat(labelerAngleInp.value);
    if (!isFinite(val)) return;
    const s = state.get();
    const ids = s.selectedIds || [];
    if (ids.length !== 1) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((it) => it.id === ids[0]);
      if (!o || o.type !== "labeler" || o.locked) return;
      const len = Math.hypot(o.p2.x - o.p1.x, o.p2.y - o.p1.y);
      const rad = (val * Math.PI) / 180;
      let nx = Math.cos(rad), ny = Math.sin(rad);
      const n = ((val % 360) + 360) % 360;
      if (n === 0 || n === 180) ny = 0;   // exact horizontal
      if (n === 90 || n === 270) nx = 0;  // exact vertical
      o.p2 = { x: o.p1.x + nx * len, y: o.p1.y + ny * len };
      s2.undoStack.push(snap);
      s2.redoStack = [];
    });
  }
  labelerAngleInp.addEventListener("keydown", (e) => { if (e.key === "Enter") labelerAngleInp.blur(); });
  labelerAngleInp.addEventListener("blur", commitLabelerAngle);

  /* ---- rect/ellipse upright label (Group 3): text input + position dropdown ----
   * Writes obj.label / obj.labelPos. The label renders screen-upright, excluded
   * from rotation, in the default font (see render.js withBoxLabel). */
  const boxLabelRow = document.createElement("div");
  boxLabelRow.className = "insp-row";
  const boxLabelLbl = document.createElement("label");
  boxLabelLbl.className = "insp-field-label";
  boxLabelLbl.textContent = "라벨";
  const boxLabelInp = document.createElement("input");
  boxLabelInp.type = "text";
  boxLabelInp.maxLength = 60;
  boxLabelInp.className = "insp-input";
  function commitBoxLabel() {
    const s = state.get();
    if (!(s.selectedIds || []).length) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((o) => o.id === (s2.selectedIds || [])[0]);
      if (!o || o.locked) return;
      if ((o.label ?? "") === boxLabelInp.value) return; // no-op → no undo entry
      s2.undoStack.push(snap); s2.redoStack = [];
      o.label = boxLabelInp.value;
    });
  }
  boxLabelInp.addEventListener("keydown", (e) => { if (e.key === "Enter") boxLabelInp.blur(); });
  boxLabelInp.addEventListener("blur", commitBoxLabel);
  boxLabelRow.appendChild(boxLabelLbl);
  boxLabelRow.appendChild(boxLabelInp);
  sec3Body.appendChild(boxLabelRow);
  const boxLabelTypeRow = makeLabelTypeRow((o) => o.type === "rect" || o.type === "ellipse");
  sec3Body.appendChild(boxLabelTypeRow.row);

  const boxLabelPosRow = document.createElement("div");
  boxLabelPosRow.className = "insp-row";
  const boxLabelPosLbl = document.createElement("label");
  boxLabelPosLbl.className = "insp-field-label";
  boxLabelPosLbl.textContent = "라벨 위치";
  const boxLabelPosSel = document.createElement("select");
  boxLabelPosSel.className = "insp-input";
  [["center", "가운데"], ["above", "위"], ["below", "아래"], ["left", "왼쪽"], ["right", "오른쪽"]].forEach(([val, text]) => {
    const opt = document.createElement("option");
    opt.value = val; opt.textContent = text;
    boxLabelPosSel.appendChild(opt);
  });
  boxLabelPosRow.appendChild(boxLabelPosLbl);
  boxLabelPosRow.appendChild(boxLabelPosSel);
  sec3Body.appendChild(boxLabelPosRow);
  boxLabelPosSel.addEventListener("change", () => {
    const s = state.get();
    if (!(s.selectedIds || []).length) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    const val = ["center", "above", "below", "left", "right"].includes(boxLabelPosSel.value) ? boxLabelPosSel.value : "center";
    state.update((s2) => {
      const o = s2.objects.find((o) => o.id === (s2.selectedIds || [])[0]);
      if (!o || o.locked) return;
      s2.undoStack.push(snap); s2.redoStack = [];
      o.labelPos = val;
    });
  });

  // ---- rect/ellipse 라벨 크기 (Group 6 task 6): per-box label font size. ----
  const boxLabelSizeRow = makeLabelSizeRow((o) => o.type === "rect" || o.type === "ellipse");
  sec3Body.appendChild(boxLabelSizeRow.row);

  // capacitor-only: plate separation 간격 (world mm).
  const gapRow = document.createElement("div");
  gapRow.className = "insp-row";
  const gapLbl = document.createElement("label");
  gapLbl.className = "insp-field-label";
  gapLbl.textContent = "간격";
  const gapInp = document.createElement("input");
  gapInp.type = "number";
  gapInp.step = "0.1";
  gapInp.min = "0.1";
  gapInp.className = "insp-input";
  function commitGap() {
    const val = parseFloat(gapInp.value);
    if (!isFinite(val) || val <= 0) return;
    const s = state.get();
    if (!(s.selectedIds || []).length) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((o) => o.id === (s2.selectedIds || [])[0]);
      if (!o || o.locked) return;
      if (o.gap === val) return; // no-op → no undo entry
      s2.undoStack.push(snap); s2.redoStack = [];
      o.gap = val;
    });
  }
  gapInp.addEventListener("keydown", (e) => { if (e.key === "Enter") gapInp.blur(); });
  gapInp.addEventListener("blur", commitGap);
  gapRow.appendChild(gapLbl);
  gapRow.appendChild(gapInp);
  sec3Body.appendChild(gapRow);

  const circuitHeightF = makePosRow("높이", "height", "0.1");
  sec3Body.appendChild(circuitHeightF.el);

  // axes-only: 형태(축 모양) 3종 전환 + X/Y 라벨 + 눈금 간격. Shown only when a single
  // 좌표축 is selected. Reuses existing fields (axisVariant/labelX/labelY/tickSpacing);
  // each control commits on click or Enter/blur with one undo snapshot, like the rows above.
  const AXIS_VARIANTS = [
    { id: "cross",    label: "십자" },
    { id: "quadrant", label: "L자" },
    { id: "single",   label: "직선" },
  ];
  // Mutate the single selected axes object under one undo snapshot. `apply` returns
  // false when nothing changed → no undo entry is pushed (mirrors commitGap/commitArcLabel).
  function commitAxes(apply) {
    const s = state.get();
    if (!(s.selectedIds || []).length) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((o) => o.id === (s2.selectedIds || [])[0]);
      if (!o || o.locked || o.type !== "axes") return;
      if (!apply(o)) return;
      s2.undoStack.push(snap); s2.redoStack = [];
    });
  }

  const axisVarRow = document.createElement("div");
  axisVarRow.className = "insp-row";
  const axisVarLbl = document.createElement("label");
  axisVarLbl.className = "insp-field-label";
  axisVarLbl.textContent = "형태";
  axisVarRow.appendChild(axisVarLbl);
  const axisVarBtns = {};
  AXIS_VARIANTS.forEach(({ id, label }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.style.cssText =
      "flex:1;padding:4px 0;margin-left:4px;border:1px solid #3a3c41;border-radius:4px;" +
      "background:#1e1f22;color:#ddd;cursor:pointer;font-size:12px;";
    btn.addEventListener("click", () =>
      commitAxes((o) => {
        if ((o.axisVariant || "cross") === id) return false;
        o.axisVariant = id;
        return true;
      })
    );
    axisVarBtns[id] = btn;
    axisVarRow.appendChild(btn);
  });
  sec3Body.appendChild(axisVarRow);

  function makeAxisLabelRow(labelText, field) {
    const row = document.createElement("div");
    row.className = "insp-row";
    const lbl = document.createElement("label");
    lbl.className = "insp-field-label";
    lbl.textContent = labelText;
    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "insp-input";
    function commit() {
      commitAxes((o) => {
        if ((o[field] ?? "") === inp.value) return false;
        o[field] = inp.value;
        return true;
      });
    }
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
    inp.addEventListener("blur", commit);
    row.appendChild(lbl);
    row.appendChild(inp);
    sec3Body.appendChild(row);
    return { row, inp };
  }
  const axisLabelXRow = makeAxisLabelRow("X 라벨", "labelX");
  const axisLabelYRow = makeAxisLabelRow("Y 라벨", "labelY");
  const axisLabelTypeRow = makeLabelTypeRow((o) => o.type === "axes");
  sec3Body.appendChild(axisLabelTypeRow.row);

  const tickRow = document.createElement("div");
  tickRow.className = "insp-row";
  const tickLbl = document.createElement("label");
  tickLbl.className = "insp-field-label";
  tickLbl.textContent = "눈금 간격";
  const tickInp = document.createElement("input");
  tickInp.type = "number";
  tickInp.step = "0.5";
  tickInp.min = "0.5";
  tickInp.className = "insp-input";
  function commitTick() {
    const val = parseFloat(tickInp.value);
    if (!isFinite(val)) return;
    const clamped = Math.max(val, 0.5); // sane minimum (matches render clamp)
    commitAxes((o) => {
      if (o.tickSpacing === clamped) return false;
      o.tickSpacing = clamped;
      return true;
    });
  }
  tickInp.addEventListener("keydown", (e) => { if (e.key === "Enter") tickInp.blur(); });
  tickInp.addEventListener("blur", commitTick);
  tickRow.appendChild(tickLbl);
  tickRow.appendChild(tickInp);
  sec3Body.appendChild(tickRow);

  // lens-only: 중앙 세로 점선 옵션 (none/top/bottom/full). Shown only when a single
  // convex_lens or concave_lens is selected (mirrors the axes-only block above).
  const CENTERLINE_OPTS = [
    { id: "none",   label: "없음" },
    { id: "top",    label: "위쪽" },
    { id: "bottom", label: "아래쪽" },
    { id: "full",   label: "전체" },
  ];
  // Mutate the single selected lens object under one undo snapshot, like commitAxes.
  function commitLens(apply) {
    const s = state.get();
    if (!(s.selectedIds || []).length) return;
    const snap = JSON.parse(JSON.stringify(s.objects));
    state.update((s2) => {
      const o = s2.objects.find((o) => o.id === (s2.selectedIds || [])[0]);
      if (!o || o.locked || o.type !== "optics") return;
      if (o.kind !== "convex_lens" && o.kind !== "concave_lens") return;
      if (!apply(o)) return;
      s2.undoStack.push(snap); s2.redoStack = [];
    });
  }

  const centerLineRow = document.createElement("div");
  centerLineRow.className = "insp-row";
  const centerLineLbl = document.createElement("label");
  centerLineLbl.className = "insp-field-label";
  centerLineLbl.textContent = "중앙 점선";
  const centerLineSel = document.createElement("select");
  centerLineSel.className = "insp-input";
  CENTERLINE_OPTS.forEach(({ id, label }) => {
    const opt = document.createElement("option");
    opt.value = id; opt.textContent = label;
    centerLineSel.appendChild(opt);
  });
  centerLineSel.addEventListener("change", () => {
    commitLens((o) => {
      if ((o.centerLine || "none") === centerLineSel.value) return false;
      o.centerLine = centerLineSel.value;
      return true;
    });
  });
  centerLineRow.appendChild(centerLineLbl);
  centerLineRow.appendChild(centerLineSel);
  sec3Body.appendChild(centerLineRow);

  // diode-only: two terminal labels (단자1 / 단자2) replacing the single 라벨 row.
  function makeTermRow(labelText, idx) {
    const row = document.createElement("div");
    row.className = "insp-row";
    const lbl = document.createElement("label");
    lbl.className = "insp-field-label";
    lbl.textContent = labelText;
    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "insp-input";
    function commit() {
      const s = state.get();
      if (!(s.selectedIds || []).length) return;
      const snap = JSON.parse(JSON.stringify(s.objects));
      state.update((s2) => {
        const o = s2.objects.find((o) => o.id === (s2.selectedIds || [])[0]);
        if (!o || o.locked) return;
        const cur = Array.isArray(o.terminalLabels) ? o.terminalLabels.slice() : ["", ""];
        if ((cur[idx] ?? "") === inp.value) return; // no-op → no undo entry
        cur[idx] = inp.value;
        s2.undoStack.push(snap); s2.redoStack = [];
        o.terminalLabels = cur;
      });
    }
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
    inp.addEventListener("blur", commit);
    row.appendChild(lbl);
    row.appendChild(inp);
    sec3Body.appendChild(row);
    return { el: row, inp };
  }
  const term1 = makeTermRow("단자1", 0);
  const term2 = makeTermRow("단자2", 1);
  const terminalLabelTypeRow = makeLabelTypeRow((o) => o.type === "circuit" && o.element === "diode");
  sec3Body.appendChild(terminalLabelTypeRow.row);

  const raSizeF = makePosRow("크기", "size", "0.1");
  const raAngleF = makePosRow("각도", "angle", "1");
  const raDirRow = document.createElement("div");
  raDirRow.className = "insp-row";
  const raDirLbl = document.createElement("label");
  raDirLbl.className = "insp-field-label";
  raDirLbl.textContent = "방향";
  const raDirSel = document.createElement("select");
  raDirSel.className = "insp-input";
  [["1", "시계반대"], ["-1", "시계"]].forEach(([value, label]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    raDirSel.appendChild(opt);
  });
  raDirRow.appendChild(raDirLbl);
  raDirRow.appendChild(raDirSel);
  sec3Body.appendChild(raSizeF.el);
  sec3Body.appendChild(raAngleF.el);
  sec3Body.appendChild(raDirRow);

  raDirSel.addEventListener("change", () => {
    const next = parseInt(raDirSel.value, 10) || 1;
    commitSelectedObject((o) => {
      if (o.type !== "rightangle" || (o.orientation ?? 1) === next) return false;
      o.orientation = next;
      return true;
    });
  });

  const appLengthF = makePosRow("길이", "length", "0.1");
  const appAngleF = makePosRow("각도", "angle", "1");
  const appThicknessF = makePosRow("굵기", "thickness", "0.1");
  const appNeedleF = makePosRow("방향각", "needleAngle", "1");
  sec3Body.appendChild(appLengthF.el);
  sec3Body.appendChild(appAngleF.el);
  sec3Body.appendChild(appThicknessF.el);
  sec3Body.appendChild(appNeedleF.el);

  const pulleyVariantRow = document.createElement("div");
  pulleyVariantRow.className = "insp-row";
  const pulleyVariantLbl = document.createElement("label");
  pulleyVariantLbl.className = "insp-field-label";
  pulleyVariantLbl.textContent = "형태";
  const pulleyVariantSel = document.createElement("select");
  pulleyVariantSel.className = "insp-input";
  [["basic", "기본형"], ["simple", "단순형"]].forEach(([value, label]) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    pulleyVariantSel.appendChild(opt);
  });
  pulleyVariantRow.appendChild(pulleyVariantLbl);
  pulleyVariantRow.appendChild(pulleyVariantSel);
  sec3Body.appendChild(pulleyVariantRow);
  pulleyVariantSel.addEventListener("change", () => {
    commitSelectedObject((o) => {
      if (o.type !== "apparatus" || o.kind !== "pulley" || (o.variant || "basic") === pulleyVariantSel.value) return false;
      o.variant = pulleyVariantSel.value;
      return true;
    });
  });

  const clampFlipRow = document.createElement("div");
  clampFlipRow.className = "insp-row";
  const clampFlipCb = document.createElement("input");
  clampFlipCb.type = "checkbox";
  clampFlipCb.className = "insp-cb";
  const clampFlipLbl = document.createElement("label");
  clampFlipLbl.className = "insp-field-label";
  clampFlipLbl.textContent = "좌우 반전";
  clampFlipRow.appendChild(clampFlipCb);
  clampFlipRow.appendChild(clampFlipLbl);
  sec3Body.appendChild(clampFlipRow);
  clampFlipCb.addEventListener("change", () => {
    const next = clampFlipCb.checked;
    commitSelectedObject((o) => {
      if (o.type !== "apparatus" || o.kind !== "clamp" || !!o.flipped === next) return false;
      o.flipped = next;
      return true;
    });
  });

  const scaleTextRow = document.createElement("div");
  scaleTextRow.className = "insp-row";
  const scaleTextLbl = document.createElement("label");
  scaleTextLbl.className = "insp-field-label";
  scaleTextLbl.textContent = "표시값";
  const scaleTextInp = document.createElement("input");
  scaleTextInp.type = "text";
  scaleTextInp.className = "insp-input";
  scaleTextRow.appendChild(scaleTextLbl);
  scaleTextRow.appendChild(scaleTextInp);
  sec3Body.appendChild(scaleTextRow);
  scaleTextInp.addEventListener("keydown", (e) => { if (e.key === "Enter") scaleTextInp.blur(); });
  scaleTextInp.addEventListener("blur", () => {
    commitSelectedObject((o) => {
      if (o.type !== "apparatus" || o.kind !== "scale" || (o.displayText ?? "") === scaleTextInp.value) return false;
      o.displayText = scaleTextInp.value;
      return true;
    });
  });

  const sec3 = makeSection("크기·위치", sec3Body);

  return {
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
  };
}
